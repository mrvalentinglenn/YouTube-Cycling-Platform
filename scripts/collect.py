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
    for video in video_details:
        video_id = video["id"]
        snippet = video["snippet"]
        content_details = video["contentDetails"]
        statistics = video["statistics"]

        # Live streams, premieres and upcoming broadcasts have no playable
        # length and come back as "P0D" (or other shapes outside
        # PT#H#M#S) rather than a real duration. Skipping the video is
        # deliberate: substituting 0 would store a multi-hour stream as a
        # 0-second Short and corrupt that channel's Shorts baseline — the
        # same reasoning that makes likes/comments nullable rather than 0.
        # Skip this one video and keep going; never abort the channel over
        # it.
        try:
            duration_seconds = parse_duration_to_seconds(content_details["duration"])
        except ValueError:
            videos_skipped += 1
            print(
                f"{channel_name}: skipped {video_id} — unparseable duration "
                f"{content_details['duration']!r}"
            )
            continue

        # Duration-only Shorts heuristic, per DECISIONS.md — no HEAD request
        # check at this stage.
        is_short = duration_seconds <= 180

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
    }


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

    # The channel list is data, never a hardcoded list — adding a channel is
    # a new row in `channels`, never a code change. This read costs no
    # YouTube quota; it's a Supabase query.
    try:
        channels_response = (
            supabase.table("channels").select("channel_id,name").execute()
        )
    except Exception as e:
        print(f"Failed to read the channels table: {e}")
        sys.exit(1)

    channels = channels_response.data
    if not channels:
        print("No channels found in the channels table. Nothing to do.")
        sys.exit(1)

    channels_succeeded = 0
    failed_channels = []
    total_videos_found = 0
    total_videos_inserted = 0
    total_snapshots_written = 0
    total_pages_fetched = 0
    total_videos_skipped = 0

    for row in channels:
        channel_id = row["channel_id"]
        channel_name = row["name"]

        try:
            stats = collect_channel(
                channel_id, channel_name, resolved_mode, window_days, snapshot_date
            )
        except Exception as e:
            # Catches CollectionError (API/Supabase failures we raised
            # deliberately) as well as anything unexpected — a malformed
            # API response, a missing key, etc. Either way: name the
            # channel, print a clear message, and move on. One bad channel
            # must never abort the run.
            failed_channels.append(channel_name)
            print(f"{channel_name}: FAILED — {e}")
            continue

        channels_succeeded += 1
        total_videos_found += stats["videos_found"]
        total_videos_inserted += stats["videos_inserted"]
        total_snapshots_written += stats["snapshots_written"]
        total_pages_fetched += stats["pages_fetched"]
        total_videos_skipped += stats["videos_skipped"]
        print(
            f"{channel_name}: {stats['videos_found']} videos found, "
            f"{stats['videos_inserted']} new in videos, "
            f"{stats['pages_fetched']} page(s) fetched"
        )

    duration_seconds = time.monotonic() - start_time

    # --- Summary ------------------------------------------------------------
    print()
    print(f"Channels read from table: {len(channels)}")
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
    print(f"API calls made: {api_calls}")
    print(f"Quota units used: {quota_units}")
    print(f"Duration: {duration_seconds:.1f}s")


if __name__ == "__main__":
    main()
