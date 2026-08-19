"""One-off correction script: fix videos.is_short with the verified HEAD check.

Run once, then kept in the repo as a record of what was done and why.

Why this exists. `videos.is_short` was originally derived from
duration_seconds <= 180 alone. test_shorts_check.py proved that heuristic
wrong on this dataset — the HEAD check (collect.py now uses it for new
rows) reclassifies roughly half of all videos under 180 seconds as
long-form. But collect.py inserts with ON CONFLICT (video_id) DO NOTHING,
so it never touches a row already in the table — switching collect.py over
did nothing for the ~1,982 rows written before that fix. This script goes
back and re-checks exactly those rows.

Scope is deliberately narrow: this only ever updates videos.is_short. It
never inserts, never deletes, and never reads or writes video_snapshots or
job_runs — those tables aren't part of what's wrong here.

Safe to re-run. The query below only selects rows where is_short is still
true, so a row already corrected (or interrupted mid-run and picked up
again later) simply won't be selected a second time.
"""

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# load_dotenv() reads the .env file in this project's root and copies its
# key=value pairs into the process's environment, so os.environ behaves as
# if they had been set in the shell.
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    print("SUPABASE_URL and/or SUPABASE_SECRET_KEY is not set. Check .env.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# Same courtesy delay as collect.py and test_shorts_check.py — this is an
# unofficial endpoint with no reason to be hammered.
SHORTS_CHECK_DELAY_SECONDS = 0.2

# How many video IDs go into a single UPDATE statement, and how often a
# progress line is printed. ~1,982 rows at 200ms each is around 7 minutes
# of nothing but HTTP requests, so silence would be indistinguishable from
# a hang.
UPDATE_BATCH_SIZE = 100
PROGRESS_INTERVAL = 100

# The Supabase client caps a select at 1,000 rows unless told otherwise.
# With ~1,982 rows to re-check, one unbounded select would silently return
# only the first 1,000 — fetch_rows_to_check() below pages through with
# .range() instead, so every matching row is retrieved.
PAGE_SIZE = 1000


def fetch_rows_to_check():
    """Read every videos row where is_short is true, paging through
    .range(start, end) until a page comes back with fewer than PAGE_SIZE
    rows — that short page is what proves there's nothing left to fetch."""
    rows = []
    start = 0
    while True:
        end = start + PAGE_SIZE - 1
        try:
            response = (
                supabase.table("videos")
                .select("video_id,duration_seconds,is_short")
                .eq("is_short", True)
                .range(start, end)
                .execute()
            )
        except Exception as e:
            print(f"Failed to read the videos table: {e}")
            sys.exit(1)

        page = response.data
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    return rows


def head_check_is_short(video_id):
    """The same check collect.py uses: HEAD request to the video's Shorts
    URL, redirects not followed, no custom User-Agent. 200 means Short, 303
    means not. Deliberately no User-Agent override: a browser-like one
    makes YouTube respond with a GDPR consent redirect (302) for every
    video, which destroys the signal — see test_shorts_check.py. The
    default requests User-Agent is what gets routed to the real answer.

    Returns (is_short, failure_reason): on a definitive 200/303,
    failure_reason is None. On anything else — a network error, a timeout,
    or a status code other than 200/303 — is_short is None and
    failure_reason says what happened, so the caller can leave the row
    untouched instead of guessing.
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


def main():
    parser = argparse.ArgumentParser(
        description="Re-check videos.is_short with the verified Shorts HEAD check."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run every check but skip the database writes, to preview the scale of the change.",
    )
    args = parser.parse_args()

    # Only rows currently marked as Shorts need re-checking: the duration
    # heuristic's failure mode is calling long-form videos "Short", never
    # the reverse, so a row already marked long-form needs no correction.
    rows = fetch_rows_to_check()
    print(f"Rows to re-check: {len(rows)}")
    if len(rows) > 0 and len(rows) % PAGE_SIZE == 0:
        print(
            f"Note: this count is an exact multiple of the page size ({PAGE_SIZE}) "
            "— the signature of a truncated read. The fetch above already "
            "confirmed a following page came back empty, so this is not one, "
            "but it's worth a second look if that reasoning ever changes."
        )
    if args.dry_run:
        print("Dry run — checks will run, but no rows will be updated.")
    print()

    video_ids_to_flip = []
    checked = 0
    reclassified = 0
    confirmed_short = 0
    failed = []

    for row in rows:
        video_id = row["video_id"]
        is_short, failure_reason = head_check_is_short(video_id)
        checked += 1

        if is_short is None:
            # A failed check must never silently flip a row — leave it
            # exactly as it is and report why.
            failed.append((video_id, failure_reason))
            print(f"{video_id}: check failed — {failure_reason}; leaving unchanged")
        elif is_short is False:
            # Definitive 303: genuinely not a Short, despite being marked
            # one. Queued for the batched update below, not written here.
            video_ids_to_flip.append(video_id)
            reclassified += 1
        else:
            # Definitive 200: the original classification was correct.
            confirmed_short += 1

        if checked % PROGRESS_INTERVAL == 0:
            print(
                f"Progress: {checked}/{len(rows)} checked, "
                f"{reclassified} reclassified so far, {len(failed)} failed"
            )

        time.sleep(SHORTS_CHECK_DELAY_SECONDS)

    print()
    print(f"Rows to update: {len(video_ids_to_flip)}")

    updated = 0
    if args.dry_run:
        print("Dry run — skipping database writes.")
    else:
        # Batched rather than one row at a time: every flipped row gets the
        # same new value (False), so a single UPDATE ... WHERE video_id IN
        # (...) per group of 100 does the work of 100 individual writes.
        for batch in chunked(video_ids_to_flip, UPDATE_BATCH_SIZE):
            try:
                supabase.table("videos").update({"is_short": False}).in_(
                    "video_id", batch
                ).execute()
            except Exception as e:
                print(f"Failed to update a batch of {len(batch)} rows: {e}")
                continue
            updated += len(batch)
        print(f"Rows updated: {updated}")

    print()
    print("--- Summary ---")
    print(f"Rows checked: {checked}")
    print(f"Reclassified to long-form: {reclassified}")
    print(f"Confirmed as Shorts: {confirmed_short}")
    print(f"Failed checks: {len(failed)}")
    if failed:
        print("Failed video IDs:")
        for video_id, reason in failed:
            print(f"  {video_id}: {reason}")


if __name__ == "__main__":
    main()
