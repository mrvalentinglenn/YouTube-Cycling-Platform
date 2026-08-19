"""Stage 2 of the collection script: write to the database, still one channel.

Extends stage 1 (read-only) to insert into `videos` and upsert into
`video_snapshots` for that same channel. See NEXT_STEPS.md for the stages
that follow this one.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from supabase import Client, create_client

# Temporary: replaced at stage 3 by a loop over rows read from the
# `channels` table. Hardcoded here so this stage can run without that loop.
CHANNEL_ID = "UCEMrO4N3mswohzIOsIftFDA"  # Canyon

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


def print_api_error(call_name, error):
    """Print HTTP status + YouTube's own error message instead of a raw traceback."""
    status = getattr(error.resp, "status", "unknown")
    message = str(error)
    if error.content:
        try:
            body = json.loads(error.content)
            message = body["error"]["message"]
        except (ValueError, KeyError):
            pass
    print(f"{call_name} failed — HTTP {status}: {message}")


def print_supabase_error(call_name, error):
    """Print a clear message for a failed Supabase write instead of a raw traceback."""
    print(f"{call_name} failed — {error}")


def main():
    global api_calls, quota_units

    # --- Step 1: resolve the channel's uploads playlist ---------------
    # A channel's videos aren't fetched directly; every channel has one
    # auto-generated "uploads" playlist, and playlistItems.list is what
    # actually pages through videos. contentDetails.relatedPlaylists.uploads
    # is where the API reports that playlist's ID. snippet is requested too,
    # purely so the channel title can be printed as a sanity check that the
    # right channel was fetched.
    try:
        channel_response = youtube.channels().list(
            part="contentDetails,snippet",
            id=CHANNEL_ID,
        ).execute()
    except HttpError as e:
        print_api_error("channels.list", e)
        sys.exit(1)

    api_calls += 1
    quota_units += 1

    items = channel_response.get("items", [])
    if not items:
        print(f"No channel found for ID {CHANNEL_ID}. Check the ID is correct.")
        sys.exit(1)

    channel = items[0]
    channel_title = channel["snippet"]["title"]
    uploads_playlist_id = channel["contentDetails"]["relatedPlaylists"]["uploads"]

    print(f"Channel: {channel_title} ({CHANNEL_ID})")
    print(f"Uploads playlist: {uploads_playlist_id}\n")

    # --- Step 2: fetch one page of the uploads playlist ----------------
    # maxResults=50 is the API's own per-page ceiling. Getting more than
    # one page requires following pageToken, which is deliberately not done
    # yet — this stage only proves one page writes correctly.
    try:
        playlist_response = youtube.playlistItems().list(
            part="contentDetails,snippet",
            playlistId=uploads_playlist_id,
            maxResults=50,
        ).execute()
    except HttpError as e:
        print_api_error("playlistItems.list", e)
        sys.exit(1)

    api_calls += 1
    quota_units += 1

    playlist_items = playlist_response.get("items", [])

    # contentDetails.videoPublishedAt is used deliberately instead of
    # snippet.publishedAt. On a playlist item, snippet.publishedAt is when
    # the video was ADDED TO THE PLAYLIST, which for an uploads playlist is
    # usually but not always the same moment as when the video was actually
    # published. The 8-day and 90-day collection windows depend on the true
    # publish date, so contentDetails.videoPublishedAt is the one that
    # matters here — including for what gets written to `videos` below.
    print(f"{'VIDEO ID':<13}  {'PUBLISHED':<20}  TITLE")
    print("-" * 70)
    published_at_by_video_id = {}
    for item in playlist_items:
        video_id = item["contentDetails"]["videoId"]
        published_at = item["contentDetails"]["videoPublishedAt"]
        title = item["snippet"]["title"]
        published_at_by_video_id[video_id] = published_at
        print(f"{video_id:<13}  {published_at:<20}  {title}")

    video_ids = list(published_at_by_video_id.keys())
    videos_inserted = 0
    snapshots_written = 0

    if not video_ids:
        print("\nNo videos found on this channel's uploads playlist. Nothing to write.")
    else:
        # --- Step 3: fetch full video details, batched -------------------
        # playlistItems only carries the ID and playlist-add metadata, not
        # duration, view/like/comment counts, or thumbnails — those come
        # from videos.list. It accepts at most 50 IDs per call (1 quota
        # unit regardless of how many of the 50 are actually used), so IDs
        # are chunked defensively even though one playlist page never
        # exceeds 50.
        video_details = []
        for batch in chunked(video_ids, 50):
            try:
                videos_response = youtube.videos().list(
                    part="snippet,contentDetails,statistics",
                    id=",".join(batch),
                ).execute()
            except HttpError as e:
                print_api_error("videos.list", e)
                sys.exit(1)

            api_calls += 1
            quota_units += 1
            video_details.extend(videos_response.get("items", []))

        # --- Step 4: shape the rows for each table ------------------------
        snapshot_date = datetime.now(timezone.utc).date().isoformat()

        videos_rows = []
        snapshot_rows = []
        for video in video_details:
            video_id = video["id"]
            snippet = video["snippet"]
            content_details = video["contentDetails"]
            statistics = video["statistics"]

            duration_seconds = parse_duration_to_seconds(content_details["duration"])
            # Duration-only Shorts heuristic, per DECISIONS.md — no HEAD
            # request check at this stage.
            is_short = duration_seconds <= 180

            # statistics.likeCount / commentCount are absent (not present as
            # a key) when a creator has hidden likes or disabled comments —
            # this is common on brand product launches. .get() returns None
            # in that case, which is written to the database as NULL rather
            # than 0, exactly as CLAUDE.md and the schema require: 0 would
            # misrepresent a disabled feature as zero engagement.
            views = int(statistics["viewCount"])
            likes = int(statistics["likeCount"]) if "likeCount" in statistics else None
            comments = (
                int(statistics["commentCount"]) if "commentCount" in statistics else None
            )

            # `videos` holds facts that never change after a video is
            # published, so first_seen_at is left out here — the column's
            # own `DEFAULT now()` in schema.sql fills it in on first insert.
            videos_rows.append(
                {
                    "video_id": video_id,
                    "channel_id": CHANNEL_ID,
                    "published_at": published_at_by_video_id[video_id],
                    "duration_seconds": duration_seconds,
                    "is_short": is_short,
                }
            )

            snapshot_rows.append(
                {
                    "video_id": video_id,
                    "snapshot_date": snapshot_date,
                    "views": views,
                    "likes": likes,
                    "comments": comments,
                    "title": snippet["title"],
                    "thumbnail_url": best_thumbnail_url(snippet.get("thumbnails", {})),
                }
            )

        # --- Step 5: write both tables, one batched call each --------------
        # `videos` rows are immutable facts: on_conflict="video_id" with
        # ignore_duplicates=True is Postgres's ON CONFLICT (video_id) DO
        # NOTHING, so a video already in the table is left untouched rather
        # than updated. Because Postgres only returns rows it actually
        # wrote, len(response.data) after this call is exactly the count of
        # NEW videos inserted, not the number submitted.
        try:
            videos_response = (
                supabase.table("videos")
                .upsert(videos_rows, on_conflict="video_id", ignore_duplicates=True)
                .execute()
            )
        except Exception as e:
            print_supabase_error("videos upsert", e)
            sys.exit(1)
        videos_inserted = len(videos_response.data)

        # `video_snapshots` rows are this run's numbers: on_conflict uses
        # the composite primary key (video_id, snapshot_date), and without
        # ignore_duplicates this is ON CONFLICT ... DO UPDATE. That matters
        # because a plain insert would violate the composite primary key
        # and fail outright if the script is re-run on the same day —
        # DO UPDATE makes a re-run overwrite instead, so a half-finished run
        # can simply be retried.
        try:
            snapshots_response = (
                supabase.table("video_snapshots")
                .upsert(snapshot_rows, on_conflict="video_id,snapshot_date")
                .execute()
            )
        except Exception as e:
            print_supabase_error("video_snapshots upsert", e)
            sys.exit(1)
        snapshots_written = len(snapshots_response.data)

    # --- Summary ------------------------------------------------------------
    print()
    print(f"Videos found: {len(video_ids)}")
    print(f"Rows inserted into videos: {videos_inserted}")
    print(f"Rows written to video_snapshots: {snapshots_written}")
    print(f"API calls made: {api_calls}")
    print(f"Quota units used: {quota_units}")


if __name__ == "__main__":
    main()
