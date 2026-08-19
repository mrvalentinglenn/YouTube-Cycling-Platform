"""One-off verification script: does the unofficial Shorts HEAD check work?

Not part of the collection job. `is_short` is currently derived from
duration <= 180 seconds, and that heuristic is known to be wrong on this
dataset — brand channels publish short regular videos, some under 60
seconds, that are not Shorts. CLAUDE.md documents an alternative: a HEAD
request to youtube.com/shorts/{video_id}, where a 200 response means the
video is a Short and a 303 means it is redirected away to the normal watch
page, i.e. not a Short. This script checks that claim against videos whose
real status we already know, before the collection job is changed to rely
on it.

No database, no YouTube Data API, no writes — this only makes HTTP HEAD
requests and prints what came back.
"""

import time

import requests

# Videos manually confirmed to be YouTube Shorts.
KNOWN_SHORTS = [
    "SgJAuaJNs_o",
    "ViT26q0LSnY",
    "efBHrifWa10",
    "_whzrWm3twM",
    "QBrFLmj-f8Y",
    "aKKwDRr8qhs",
]

# Videos manually confirmed to be regular (non-Short) videos, deliberately
# chosen under 180 seconds — these are exactly the cases the duration
# heuristic gets wrong.
KNOWN_NOT_SHORTS = [
    "zQQRcGrEp0w",
    "qzb05Sw3RoA",
    "LBUpuwigscY",
    "jWO4zAAm_nA",
    "jQriiKaKqWY",
    "JHStda9GRQw",
]

# A default Python/requests User-Agent can be treated differently by
# YouTube than a real browser would be, which would make this test
# unreliable — so a realistic one is set explicitly.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    )
}

# This is an unofficial endpoint with no published rate limit — there is no
# reason to hammer it, so a small pause is added between requests.
DELAY_BETWEEN_REQUESTS_SECONDS = 0.2


def check_video(video_id):
    """Send a HEAD request and return the raw status code.

    allow_redirects=False is the important part: YouTube answers a Short's
    URL with 200 and a normal video's URL with a 303 redirect to the watch
    page. If redirects were followed, requests would silently follow that
    303 to the final page and the distinguishing status would be lost —
    the status code *before* redirection is the actual signal here.
    """
    url = f"https://www.youtube.com/shorts/{video_id}"
    response = requests.head(url, headers=HEADERS, allow_redirects=False, timeout=10)
    return response.status_code


def interpret(status_code):
    """Translate a raw status code into what it claims about the video."""
    if status_code == 200:
        return "Short"
    if status_code == 303:
        return "not a Short"
    return "unexpected"


def main():
    results = []

    for video_id in KNOWN_SHORTS:
        results.append((video_id, "Short"))
    for video_id in KNOWN_NOT_SHORTS:
        results.append((video_id, "not a Short"))

    correct = 0
    mismatches = []

    print(f"{'VIDEO ID':<13}  {'STATUS':<7}  {'IMPLIES':<13}  {'EXPECTED':<13}  MATCH")
    print("-" * 70)

    for video_id, expected in results:
        try:
            status_code = check_video(video_id)
        except requests.RequestException as e:
            print(f"{video_id:<13}  request failed — {e}")
            mismatches.append((video_id, "request failed", expected))
            time.sleep(DELAY_BETWEEN_REQUESTS_SECONDS)
            continue

        implies = interpret(status_code)
        matches = implies == expected
        if matches:
            correct += 1
        else:
            mismatches.append((video_id, f"HTTP {status_code} ({implies})", expected))

        match_label = "yes" if matches else "NO"
        print(
            f"{video_id:<13}  {status_code:<7}  {implies:<13}  {expected:<13}  {match_label}"
        )

        time.sleep(DELAY_BETWEEN_REQUESTS_SECONDS)

    print()
    print(f"Correct: {correct} / {len(results)}")
    if mismatches:
        print("Mismatches / unexpected results:")
        for video_id, got, expected in mismatches:
            print(f"  {video_id}: got {got}, expected {expected}")
    else:
        print("No mismatches.")


if __name__ == "__main__":
    main()
