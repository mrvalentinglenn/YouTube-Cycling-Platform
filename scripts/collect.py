"""Stage 4 of the collection script: the tiered collection window and --mode.

Extends stage 3 (loop over all channels) with pagination through each
channel's uploads playlist and an early-stop rule so only videos inside the
current collection window are fetched. See NEXT_STEPS.md for the stages that
follow this one.
"""

import argparse
import json
import os
import re
import requests
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from supabase import Client, create_client

# load_dotenv() reads the .env file in this project's root and copies its
# key=value pairs into the process's environment, so os.environ behaves as
# if they had been set in the shell. Nothing here ever writes a key back out
# — everything stays in memory only.
load_dotenv()
API_KEY = os.environ.get("YOUTUBE_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not API_KEY:
    print("YOUTUBE_API_KEY is not set. Check that .env exists and contains it.")
    sys.exit(1)
if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    print("SUPABASE_URL and/or SUPABASE_SECRET_KEY is not set. Check .env.")
    sys.exit(1)

# build() constructs a client object bound to one specific Google API and
# version. Every call below (channels().list(), playlistItems().list(),
# videos().list()) goes through this one object, which also attaches the
# API key to each request.
youtube = build("youtube", "v3", developerKey=API_KEY)

# create_client() is the Supabase equivalent: one object, reused for every
# table operation below. It authenticates with the secret key, which
# bypasses Row Level Security — appropriate here because this script is the
# collection job the secret key exists for.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# Running totals, printed at the end, so the script reports its own real
# cost instead of us just trusting the estimate in CLAUDE.md.
api_calls = 0
quota_units = 0

# Backfill stops by count rather than by date — see resolve_mode().
BACKFILL_VIDEO_LIMIT = 100

# Courtesy delay between Shorts HEAD checks, same as test_shorts_check.py —
# this is an unofficial endpoint with no reason to be hammered.
SHORTS_CHECK_DELAY_SECONDS = 0.2

# The volume check (see run_checks()) fails a run whose snapshots_written
# falls below this fraction of the reference run's. 50% is deliberately
# loose — see DECISIONS.md "Failure threshold defined as three checks, two
# of them history-free".
VOLUME_CHECK_MIN_RATIO = 0.5

# ISO 8601 durations from the API look like "PT4M13S" or "PT1H2M3S": the
# letters mark hours/minutes/seconds and any of the three groups can be
# absent. This matches each optional group and defaults missing ones to 0
# rather than pulling in a dependency just to parse one string format.
_DURATION_PATTERN = re.compile(
    r"^PT(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?$"
)

# Ordered largest to smallest; snippet.thumbnails does not guarantee every
# size exists (older or lower-effort uploads may lack maxres), so this
# walks down the list and uses the first size actually present.
_THUMBNAIL_SIZES_LARGEST_FIRST = ["maxres", "standard", "high", "medium", "default"]


class CollectionError(Exception):
    """Raised for a per-channel failure so the main loop can catch it, print
    a clear message, and move on to the next channel instead of the whole
    run dying on one bad API or database response."""


def resolve_mode(explicit_mode):
    """Turn the --mode argument (or its absence) into the mode this run
    actually uses. Returns (resolved_mode, window_days, origin):
    window_days is None for backfill, which stops by video count instead of
    by date. origin is 'derived from date' or 'override', purely for the
    startup log line."""
    if explicit_mode == "backfill":
        return "backfill", None, "override"
    if explicit_mode == "daily":
        return "daily", 8, "override"
    if explicit_mode == "weekly":
        return "weekly", 90, "override"

    # No --mode passed: this is what the scheduled GitHub Actions run does,
    # so a scheduling mistake can never put it in the wrong mode. Monday
    # widens to the 90-day sweep; every other day uses the 8-day window.
    today = datetime.now(timezone.utc).date()
    if today.weekday() == 0:  # Monday
        return "weekly", 90, "derived from date"
    return "daily", 8, "derived from date"


def parse_duration_to_seconds(duration):
    match = _DURATION_PATTERN.match(duration)
    if not match:
        raise ValueError(f"Unrecognized duration format: {duration}")
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds


def best_thumbnail_url(thumbnails):
    for size in _THUMBNAIL_SIZES_LARGEST_FIRST:
        if size in thumbnails:
            return thumbnails[size]["url"]
    return None


def head_check_is_short(video_id):
    """Run the verified Shorts HEAD check for one video: 200 means it's a
    Short, 303 means it isn't. Returns (is_short, failure_reason) — exactly
    one of the two is meaningful. On a definitive answer, failure_reason is
    None. On anything else (a request error, a timeout, or a status code
    other than 200/303 — including the 302 a browser-like User-Agent would
    trigger), is_short is None and failure_reason describes what happened,
    so the caller can fall back to the duration heuristic instead of
    treating the check as having failed the channel.

    Deliberately no custom User-Agent: test_shorts_check.py established
    that YouTube routes a browser-like (or any non-default) User-Agent
    through a GDPR consent redirect that returns 302 for every video,
    masking the real signal. curl's and requests' own default User-Agents
    are what get routed to the real 200/303 answer, so this is left alone.
    Redirects are not followed — the status code before redirection is the
    signal, not the page it points to.
    """
    url = f"https://www.youtube.com/shorts/{video_id}"
    try:
        response = requests.head(url, allow_redirects=False, timeout=10)
    except requests.RequestException as e:
        return None, f"request failed — {e}"

    if response.status_code == 200:
        return True, None
    if response.status_code == 303:
        return False, None
    return None, f"unexpected status {response.status_code}"


def chunked(sequence, size):
    """Yield sequence in pieces of at most `size` items."""
    for i in range(0, len(sequence), size):
        yield sequence[i : i + size]


def raise_api_error(call_name, error):
    """Turn an HttpError into a CollectionError carrying a clear message
    (HTTP status + YouTube's own error text) instead of a raw traceback."""
    status = getattr(error.resp, "status", "unknown")
    message = str(error)
    if error.content:
        try:
            body = json.loads(error.content)
            message = body["error"]["message"]
        except (ValueError, KeyError):
            pass
    raise CollectionError(f"{call_name} failed — HTTP {status}: {message}") from error


def raise_supabase_error(call_name, error):
    """Turn a failed Supabase call into a CollectionError with a clear message."""
    raise CollectionError(f"{call_name} failed — {error}") from error


def collect_channel(channel_id, channel_name, resolved_mode, window_days, snapshot_date):
    """Run the full collection pipeline for one channel: resolve its
    uploads playlist, walk it page by page until the collection window (or,
    in backfill, the video count) is exhausted, fetch video details, and
    write to `videos` and `video_snapshots`. Raises CollectionError (or lets
    an unexpected exception surface) on any failure — the caller decides
    what happens to the rest of the run."""
    global api_calls, quota_units

    # --- Step 1: resolve the channel's uploads playlist ---------------
    # A channel's videos aren't fetched directly; every channel has one
    # auto-generated "uploads" playlist, and playlistItems.list is what
    # actually pages through videos. contentDetails.relatedPlaylists.uploads
    # is where the API reports that playlist's ID.
    try:
        channel_response = youtube.channels().list(
            part="contentDetails,snippet",
            id=channel_id,
        ).execute()
    except HttpError as e:
        raise_api_error("channels.list", e)

    api_calls += 1
    quota_units += 1

    items = channel_response.get("items", [])
    if not items:
        raise CollectionError(f"no channel found on YouTube for ID {channel_id}")

    channel = items[0]
    uploads_playlist_id = channel["contentDetails"]["relatedPlaylists"].get("uploads")
    if not uploads_playlist_id:
        raise CollectionError("channel has no uploads playlist (likely terminated or empty)")

    # --- Step 2: walk the uploads playlist, page by page, with an early stop ---
    # The uploads playlist is ordered newest-first. That ordering is what
    # makes an early stop correct: the moment one video falls outside the
    # window (or, in backfill, the count limit is reached), every video
    # after it is older still, so no later item on this page — or on any
    # further page — can qualify either. Stopping there, rather than
    # fetching every page and filtering afterwards, is what keeps a 90-day
    # sweep from paging through a channel's entire multi-year history.
    video_ids = []
    published_at_by_video_id = {}
    pages_fetched = 0
    next_page_token = None
    window_exceeded = False

    while True:
        request_kwargs = {
            "part": "contentDetails,snippet",
            "playlistId": uploads_playlist_id,
            "maxResults": 50,
        }
        if next_page_token:
            request_kwargs["pageToken"] = next_page_token

        try:
            playlist_response = youtube.playlistItems().list(**request_kwargs).execute()
        except HttpError as e:
            raise_api_error("playlistItems.list", e)

        api_calls += 1
        quota_units += 1
        pages_fetched += 1

        for item in playlist_response.get("items", []):
            if resolved_mode == "backfill":
                if len(video_ids) >= BACKFILL_VIDEO_LIMIT:
                    window_exceeded = True
                    break
            else:
                # contentDetails.videoPublishedAt, not snippet.publishedAt:
                # on a playlist item, snippet.publishedAt is when the video
                # was ADDED TO THE PLAYLIST, not necessarily when it was
                # published. Age is computed by date subtraction only —
                # published_at is a timestamptz, snapshot_date is a date,
                # and CLAUDE.md accepts the resulting sub-day imprecision
                # deliberately rather than adding time-of-day handling.
                published_at = item["contentDetails"]["videoPublishedAt"]
                published_date = datetime.fromisoformat(
                    published_at.replace("Z", "+00:00")
                ).date()
                age_days = (snapshot_date - published_date).days
                if age_days > window_days:
                    window_exceeded = True
                    break

            video_id = item["contentDetails"]["videoId"]
            video_ids.append(video_id)
            published_at_by_video_id[video_id] = item["contentDetails"]["videoPublishedAt"]

        if window_exceeded:
            break
        if resolved_mode == "backfill" and len(video_ids) >= BACKFILL_VIDEO_LIMIT:
            break

        next_page_token = playlist_response.get("nextPageToken")
        if not next_page_token:
            break

    if not video_ids:
        return {
            "videos_found": 0,
            "videos_inserted": 0,
            "snapshots_written": 0,
            "pages_fetched": pages_fetched,
            "videos_skipped": 0,
            "head_checks_made": 0,
            "head_check_fallbacks": 0,
            "head_check_reclassified": 0,
        }

    # --- Step 3: fetch full video details, batched -------------------
    # playlistItems only carries the ID and playlist-add metadata, not
    # duration, view/like/comment counts, or thumbnails — those come from
    # videos.list. It accepts at most 50 IDs per call (1 quota unit
    # regardless of how many of the 50 are actually used); chunking here
    # already covers a window or backfill run spanning more than one page.
    video_details = []
    for batch in chunked(video_ids, 50):
        try:
            videos_response = youtube.videos().list(
                part="snippet,contentDetails,statistics",
                id=",".join(batch),
            ).execute()
        except HttpError as e:
            raise_api_error("videos.list", e)

        api_calls += 1
        quota_units += 1
        video_details.extend(videos_response.get("items", []))

    # --- Step 4: shape the rows for each table ------------------------
    videos_rows = []
    snapshot_rows = []
    videos_skipped = 0
    head_checks_made = 0
    head_check_fallbacks = 0
    head_check_reclassified = 0
    for video in video_details:
        video_id = video["id"]
        snippet = video["snippet"]
        content_details = video["contentDetails"]
        statistics = video["statistics"]

        # Live streams, premieres and upcoming broadcasts have no playable
        # length. That shows up two ways: the field comes back as "P0D" (or
        # another shape outside PT#H#M#S), or — for videos still processing,
        # and live broadcasts in progress — the `duration` field is absent
        # from contentDetails entirely. Both mean "no usable duration" and
        # get the same treatment: skip the video, count it, keep going.
        # Substituting 0 would store a multi-hour stream as a 0-second Short
        # and corrupt that channel's Shorts baseline — the same reasoning
        # that makes likes/comments nullable rather than 0. Never abort the
        # channel over one video.
        duration = content_details.get("duration")
        if duration is None:
            videos_skipped += 1
            print(f"{channel_name}: skipped {video_id} — no duration field")
            continue

        try:
            duration_seconds = parse_duration_to_seconds(duration)
        except ValueError:
            videos_skipped += 1
            print(f"{channel_name}: skipped {video_id} — unparseable duration {duration!r}")
            continue

        # Duration heuristic first. Videos over 180 seconds are long-form
        # with certainty and are never HEAD-checked — that would be
        # thousands of pointless requests for videos the duration alone
        # already answers correctly.
        is_short = duration_seconds <= 180

        if is_short:
            head_checks_made += 1
            checked_is_short, failure_reason = head_check_is_short(video_id)
            if checked_is_short is None:
                # The endpoint had a bad day (or was rate-limiting, or
                # returned something unrecognised) — fall back to the
                # duration heuristic rather than let an unofficial,
                # undocumented endpoint abort a channel.
                head_check_fallbacks += 1
                print(
                    f"{channel_name}: HEAD check fallback for {video_id} — "
                    f"{failure_reason}; using duration heuristic"
                )
            else:
                if checked_is_short != is_short:
                    head_check_reclassified += 1
                is_short = checked_is_short
            time.sleep(SHORTS_CHECK_DELAY_SECONDS)

        # statistics.likeCount / commentCount are absent (not present as a
        # key) when a creator has hidden likes or disabled comments — common
        # on brand product launches. .get() returns None in that case,
        # written to the database as NULL rather than 0: 0 would
        # misrepresent a disabled feature as zero engagement.
        views = int(statistics["viewCount"])
        likes = int(statistics["likeCount"]) if "likeCount" in statistics else None
        comments = int(statistics["commentCount"]) if "commentCount" in statistics else None

        # `videos` holds facts that never change after a video is
        # published, so first_seen_at is left out here — the column's own
        # `DEFAULT now()` in schema.sql fills it in on first insert.
        videos_rows.append(
            {
                "video_id": video_id,
                "channel_id": channel_id,
                "published_at": published_at_by_video_id[video_id],
                "duration_seconds": duration_seconds,
                "is_short": is_short,
            }
        )

        snapshot_rows.append(
            {
                "video_id": video_id,
                "snapshot_date": snapshot_date.isoformat(),
                "views": views,
                "likes": likes,
                "comments": comments,
                "title": snippet["title"],
                "thumbnail_url": best_thumbnail_url(snippet.get("thumbnails", {})),
            }
        )

    # --- Step 5: write both tables, one batched call each per channel -----
    # `videos` rows are immutable facts: on_conflict="video_id" with
    # ignore_duplicates=True is Postgres's ON CONFLICT (video_id) DO
    # NOTHING, so a video already in the table is left untouched rather than
    # updated. Because Postgres only returns rows it actually wrote,
    # len(response.data) after this call is exactly the count of NEW videos
    # inserted, not the number submitted.
    try:
        videos_response = (
            supabase.table("videos")
            .upsert(videos_rows, on_conflict="video_id", ignore_duplicates=True)
            .execute()
        )
    except Exception as e:
        raise_supabase_error("videos upsert", e)
    videos_inserted = len(videos_response.data)

    # `video_snapshots` rows are this run's numbers: on_conflict uses the
    # composite primary key (video_id, snapshot_date), and without
    # ignore_duplicates this is ON CONFLICT ... DO UPDATE. A plain insert
    # would violate the composite primary key and fail outright on a
    # same-day re-run — DO UPDATE makes a re-run overwrite instead.
    # Writes stay per channel rather than batched across channels, so one
    # channel's write failure never touches rows already written for
    # another channel.
    try:
        snapshots_response = (
            supabase.table("video_snapshots")
            .upsert(snapshot_rows, on_conflict="video_id,snapshot_date")
            .execute()
        )
    except Exception as e:
        raise_supabase_error("video_snapshots upsert", e)
    snapshots_written = len(snapshots_response.data)

    return {
        # len(videos_rows), not len(video_ids): skipped videos never made
        # it into videos_rows/snapshot_rows, so this stays equal to
        # snapshots_written — the consistency check stage 6 adds relies on
        # "videos found" meaning "videos actually written".
        "videos_found": len(videos_rows),
        "videos_inserted": videos_inserted,
        "snapshots_written": snapshots_written,
        "pages_fetched": pages_fetched,
        "videos_skipped": videos_skipped,
        "head_checks_made": head_checks_made,
        "head_check_fallbacks": head_check_fallbacks,
        "head_check_reclassified": head_check_reclassified,
    }


def start_job_run(resolved_mode):
    """Insert the job_runs row marking the start of this run, before
    anything else happens, and return its id so the end-of-run update
    (finish_job_run) knows which row to update.

    If this insert itself fails, there is nowhere left to record that
    failure — job_runs *is* the record. So this prints and exits rather
    than continuing a run nothing will ever log.
    """
    try:
        response = (
            supabase.table("job_runs")
            .insert(
                {
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "status": "running",
                    "mode": resolved_mode,
                }
            )
            .execute()
        )
    except Exception as e:
        print(f"Failed to write the starting job_runs row: {e}")
        sys.exit(1)

    return response.data[0]["id"]


def finish_job_run(job_run_id, status, channels_processed, snapshots_written, error_message):
    """Update the job_runs row with how the run ended. Called from a
    `finally` block in main() so it runs whether the run succeeded, failed
    a check, or raised an exception partway through — the only way this
    update does *not* happen is the process being killed outright, and a
    row permanently stuck at 'running' is exactly what should mean that.
    """
    try:
        (
            supabase.table("job_runs")
            .update(
                {
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "status": status,
                    "channels_processed": channels_processed,
                    "snapshots_written": snapshots_written,
                    "error_message": error_message,
                }
            )
            .eq("id", job_run_id)
            .execute()
        )
    except Exception as e:
        print(f"Failed to write the finishing job_runs row: {e}")


def find_reference_run(resolved_mode, today_weekday):
    """Find the most recent successful run with the same resolved mode,
    on the same weekday as today, for the volume check. Returns a dict
    with started_at and snapshots_written, or None if no such run exists
    yet — expected (and not itself a failure) for the first run of any
    weekday/mode combination.

    job_runs is an operational log, not the analytical data — at roughly
    one row a day it is nowhere near Supabase's 1,000-row default query
    cap for a long time. If that ever changes, this needs the same
    .range() paging fix_shorts_classification.py needed for videos.
    """
    response = (
        supabase.table("job_runs")
        .select("started_at,snapshots_written")
        .eq("status", "success")
        .eq("mode", resolved_mode)
        .order("started_at", desc=True)
        .execute()
    )

    for candidate in response.data:
        started_at = datetime.fromisoformat(candidate["started_at"].replace("Z", "+00:00"))
        if started_at.weekday() == today_weekday:
            return candidate
    return None


def run_checks(
    channels_read,
    channels_processed,
    total_videos_found,
    total_snapshots_written,
    resolved_mode,
    snapshot_date,
):
    """Run the three fail-loudly checks from CLAUDE.md. Returns
    (messages, failures): messages is every check's outcome, in order, for
    the run summary; failures holds only the FAILED lines, already
    naming both numbers, so main() can join them straight into
    job_runs.error_message. An empty failures list means the run passes
    all three and is a 'success'.
    """
    messages = []
    failures = []

    # Check 1 — completeness. channels_processed is incremented once per
    # loop iteration in main(), independently of channels_read (the count
    # returned by the channels-table query) — comparing the two catches a
    # bug that silently drops channels from the loop, not just a channel
    # whose own API call failed (that's already visible per-channel above).
    if channels_processed == channels_read:
        messages.append(
            f"Completeness: OK — processed {channels_processed}/{channels_read} channels read"
        )
    else:
        line = (
            f"Completeness: FAILED — processed {channels_processed} channels, "
            f"expected {channels_read} (channels read from the channels table)"
        )
        messages.append(line)
        failures.append(line)

    # Check 2 — consistency. The run compared against itself: every video
    # counted as "found" should have produced exactly one video_snapshots
    # row. No history needed, and correct even on the very first run.
    if total_snapshots_written == total_videos_found:
        messages.append(
            f"Consistency: OK — snapshots_written {total_snapshots_written} "
            f"equals videos_found {total_videos_found}"
        )
    else:
        line = (
            f"Consistency: FAILED — snapshots_written {total_snapshots_written} "
            f"does not equal videos_found {total_videos_found}"
        )
        messages.append(line)
        failures.append(line)

    # Check 3 — volume. The only check needing history, and the only one
    # that can catch a fetch that succeeds but under-returns (an empty
    # playlist with no error, where checks 1 and 2 both look fine).
    reference = find_reference_run(resolved_mode, snapshot_date.weekday())
    if reference is None:
        messages.append(
            f"Volume: SKIPPED — no prior successful '{resolved_mode}' run on "
            "this weekday to compare against"
        )
    else:
        reference_snapshots = reference["snapshots_written"]
        threshold = reference_snapshots * VOLUME_CHECK_MIN_RATIO
        if total_snapshots_written >= threshold:
            messages.append(
                f"Volume: OK — {total_snapshots_written} snapshots is at least 50% "
                f"of the reference {reference_snapshots} (run on {reference['started_at']})"
            )
        else:
            line = (
                f"Volume: FAILED — {total_snapshots_written} snapshots is below 50% "
                f"of the last successful '{resolved_mode}' run on this weekday "
                f"({reference_snapshots} snapshots, run on {reference['started_at']})"
            )
            messages.append(line)
            failures.append(line)

    return messages, failures


def ping_healthchecks(url):
    """Ping the Healthchecks.io dead man's switch — a GET request that
    tells Healthchecks "this run happened and succeeded." Healthchecks
    itself does the actual alerting: if a ping doesn't arrive within its
    configured grace period, *it* notifies a human. So this function's job
    is narrow — send the ping, report whether it went out — and its
    failure must never look like a collection failure: the run already
    succeeded by the time this is called, and a missing job_runs status
    change is not what a dead man's switch is for. No retry: a dropped
    notification here just means Healthchecks' own timeout logic is what
    catches it instead, exactly as designed.

    The URL itself is never printed — it's a credential. Whoever holds it
    can send a fake "success" ping to this project's Healthchecks check,
    silencing the alarm without the collection job ever having run.
    """
    try:
        response = requests.get(url, timeout=10)
    except requests.RequestException as e:
        print(f"Healthchecks ping failed: {e}")
        return

    if response.status_code == 200:
        print("Healthchecks ping sent.")
    else:
        print(f"Healthchecks ping returned unexpected status {response.status_code}.")


def main():
    start_time = time.monotonic()

    parser = argparse.ArgumentParser(description="YouTube Trends Platform collection job")
    parser.add_argument(
        "--mode",
        choices=["daily", "weekly", "backfill"],
        default=None,
        help=(
            "Override the derived collection window. Default: derived from "
            "today's UTC date (90 days on Monday, 8 days otherwise)."
        ),
    )
    args = parser.parse_args()

    resolved_mode, window_days, origin = resolve_mode(args.mode)
    snapshot_date = datetime.now(timezone.utc).date()

    if resolved_mode == "backfill":
        print(
            f"Mode: backfill ({origin}) — collecting up to "
            f"{BACKFILL_VIDEO_LIMIT} videos per channel, ignoring publish date"
        )
    else:
        print(f"Mode: {resolved_mode} ({origin}) — window: {window_days} days")
    print()

    # Deliberately optional, and deliberately read here rather than
    # validated at startup like the other three variables: this is set in
    # GitHub Actions but NOT in the local .env, so a manual test run from a
    # laptop can never accidentally silence an alarm about the *scheduled*
    # job failing to run.
    healthchecks_url = os.environ.get("HEALTHCHECKS_URL")

    # job_runs gets its 'running' row before anything else happens, so that
    # even a failure in the very next step (reading the channels table) has
    # somewhere to be recorded rather than dying silently.
    job_run_id = start_job_run(resolved_mode)

    # These are what finish_job_run() writes no matter how the run ends —
    # set to their "nothing happened yet" values now, and only updated if
    # the corresponding step actually completes. status starts as 'failed'
    # deliberately: an uncaught exception anywhere below leaves it exactly
    # where a failed run belongs, without needing an explicit assignment in
    # every possible error path.
    status = "failed"
    error_message = None
    channels_read = 0
    channels_processed = 0
    channels_succeeded = 0
    failed_channels = []
    total_videos_found = 0
    total_videos_inserted = 0
    total_snapshots_written = 0
    total_pages_fetched = 0
    total_videos_skipped = 0
    total_head_checks_made = 0
    total_head_check_fallbacks = 0
    total_head_check_reclassified = 0
    check_messages = []

    try:
        # The channel list is data, never a hardcoded list — adding a
        # channel is a new row in `channels`, never a code change. This
        # read costs no YouTube quota; it's a Supabase query. Raised as a
        # plain exception (not sys.exit) so the `finally` block below still
        # runs and job_runs still records what happened.
        try:
            channels_response = (
                supabase.table("channels").select("channel_id,name").execute()
            )
        except Exception as e:
            raise RuntimeError(f"failed to read the channels table: {e}") from e

        channels = channels_response.data
        if not channels:
            raise RuntimeError("no channels found in the channels table")

        channels_read = len(channels)

        for row in channels:
            channel_id = row["channel_id"]
            channel_name = row["name"]
            # Incremented for every channel the loop reaches, success or
            # failure — this is what the completeness check compares
            # against channels_read, independently of channels_succeeded.
            channels_processed += 1

            try:
                stats = collect_channel(
                    channel_id, channel_name, resolved_mode, window_days, snapshot_date
                )
            except Exception as e:
                # Catches CollectionError (API/Supabase failures we raised
                # deliberately) as well as anything unexpected — a
                # malformed API response, a missing key, etc. Either way:
                # name the channel, print a clear message, and move on.
                # One bad channel must never abort the run.
                failed_channels.append(channel_name)
                print(f"{channel_name}: FAILED — {e}")
                continue

            channels_succeeded += 1
            total_videos_found += stats["videos_found"]
            total_videos_inserted += stats["videos_inserted"]
            total_snapshots_written += stats["snapshots_written"]
            total_pages_fetched += stats["pages_fetched"]
            total_videos_skipped += stats["videos_skipped"]
            total_head_checks_made += stats["head_checks_made"]
            total_head_check_fallbacks += stats["head_check_fallbacks"]
            total_head_check_reclassified += stats["head_check_reclassified"]
            print(
                f"{channel_name}: {stats['videos_found']} videos found, "
                f"{stats['videos_inserted']} new in videos, "
                f"{stats['pages_fetched']} page(s) fetched"
            )

        check_messages, check_failures = run_checks(
            channels_read,
            channels_processed,
            total_videos_found,
            total_snapshots_written,
            resolved_mode,
            snapshot_date,
        )
        if check_failures:
            status = "failed"
            error_message = "; ".join(check_failures)
        else:
            status = "success"
    except Exception as e:
        # Anything that escaped the per-channel try/except above — the
        # channels-table read failing, an empty channel list, or a genuine
        # bug — lands here. status and error_message are already primed
        # for exactly this case.
        status = "failed"
        error_message = str(e)
        print(f"Run failed — {error_message}")
    finally:
        # This runs whether the try block finished cleanly, failed a
        # check, or raised — the only thing that can stop it running is the
        # process being killed outright, which is precisely what a job_runs
        # row permanently stuck at 'running' is meant to reveal.
        finish_job_run(job_run_id, status, channels_processed, total_snapshots_written, error_message)

        duration_seconds = time.monotonic() - start_time

        # --- Summary --------------------------------------------------------
        print()
        print(f"Channels read from table: {channels_read}")
        print(f"Channels processed successfully: {channels_succeeded}")
        if failed_channels:
            print(f"Channels failed ({len(failed_channels)}): {', '.join(failed_channels)}")
        else:
            print("Channels failed: none")
        print(f"Total videos found: {total_videos_found}")
        print(f"Videos skipped (unparseable duration): {total_videos_skipped}")
        print(f"Total rows inserted into videos: {total_videos_inserted}")
        print(f"Total rows written to video_snapshots: {total_snapshots_written}")
        print(f"Total playlist pages fetched: {total_pages_fetched}")
        print(f"Shorts HEAD checks made: {total_head_checks_made}")
        print(f"HEAD check fallbacks (used duration heuristic): {total_head_check_fallbacks}")
        print(f"Videos reclassified by HEAD check: {total_head_check_reclassified}")
        print(f"API calls made: {api_calls}")
        print(f"Quota units used: {quota_units}")
        print(f"Duration: {duration_seconds:.1f}s")
        print()
        print("--- Fail-loudly checks ---")
        for line in check_messages:
            print(line)
        print(f"Final status: {status}")
        if error_message:
            print(f"Error: {error_message}")

        # The very last thing this script does, and only on a fully
        # successful run — job_runs has already been updated above, so
        # this ping is purely the external notification, not part of what
        # determines success or failure. A failed run must NOT ping: the
        # missing ping is what actually reaches a human, so pinging anyway
        # would silence the alarm on a run that needs attention.
        if status == "success":
            if healthchecks_url:
                ping_healthchecks(healthchecks_url)
            else:
                print("Healthchecks ping skipped — HEALTHCHECKS_URL is not set.")
        else:
            print("Healthchecks ping skipped — run did not succeed.")


if __name__ == "__main__":
    main()
