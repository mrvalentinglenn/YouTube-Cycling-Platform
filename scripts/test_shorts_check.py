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

DIAGNOSIS NOTE (found while fixing a bug where every video returned 302):
YouTube puts this endpoint behind a regional GDPR consent gate. Which
User-Agent is sent decides whether that gate applies:

  - "curl/..." and "python-requests/..." (the defaults curl and this
    library send when nothing is overridden) are recognised as non-browser
    HTTP clients and are routed straight to the real answer — 200 for a
    Short, 303 (with a Location header pointing at the normal watch page)
    for anything else.
  - Any other User-Agent — including a spoofed browser string, or a custom
    one identifying this script — gets redirected to
    consent.youtube.com instead, every single time, regardless of whether
    the video is a Short. That 302 is indistinguishable across both
    groups, which is exactly the bug: it looks like "the check doesn't
    work" when really the request never reached the real routing logic.

The earlier version of this script set a realistic browser User-Agent on
the theory that a default Python UA might be treated differently — that
theory had it backwards for this specific endpoint. The fix is to send no
custom User-Agent at all and let `requests` use its own default, which was
confirmed above to get the real 200/303 answer.
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

# Deliberately no custom User-Agent — see the DIAGNOSIS NOTE above. Leaving
# this empty lets `requests` send its own default ("python-requests/x.y"),
# which YouTube treats as a non-browser client and routes to the real
# 200/303 answer instead of the GDPR consent redirect.
HEADERS = {}

# This is an unofficial endpoint with no published rate limit — there is no
# reason to hammer it, so a small pause is added between requests.
DELAY_BETWEEN_REQUESTS_SECONDS = 0.2


def check_video(video_id):
    """Send a HEAD request and return the full response (not just the
    status code) so the caller can inspect headers when needed.

    allow_redirects=False is the important part: YouTube answers a Short's
    URL with 200 and a normal video's URL with a 303 redirect to the watch
    page. If redirects were followed, requests would silently follow that
    redirect to the final page and the distinguishing status would be lost
    — the status code *before* redirection is the actual signal here.
    """
    url = f"https://www.youtube.com/shorts/{video_id}"
    return requests.head(url, headers=HEADERS, allow_redirects=False, timeout=10)


def interpret(status_code):
    """Translate a raw status code into what it claims about the video.

    Only 200 and 303 are treated as answers, exactly as documented. 302 —
    and anything else — is left as "unexpected" rather than guessed at, so
    a future regression (e.g. the consent gate reappearing) shows up as a
    visible mismatch instead of being silently absorbed into one bucket.
    """
    if status_code == 200:
        return "Short"
    if status_code == 303:
        return "not a Short"
    return "unexpected"


def print_diagnostics(response):
    """Print every request header sent and every response header received,
    including Location, so the difference between what worked and what
    didn't is visible rather than inferred."""
    print("--- Diagnostics for first request ---")
    print("Request headers sent:")
    for key, value in response.request.headers.items():
        print(f"  {key}: {value}")
    print("Response headers received:")
    for key, value in response.headers.items():
        print(f"  {key}: {value}")
    print(f"Location header: {response.headers.get('Location', '(none)')}")
    print("--- end diagnostics ---")
    print()


def main():
    results = [(video_id, "Short") for video_id in KNOWN_SHORTS]
    results += [(video_id, "not a Short") for video_id in KNOWN_NOT_SHORTS]

    correct = 0
    mismatches = []

    print(f"{'VIDEO ID':<13}  {'STATUS':<7}  {'IMPLIES':<13}  {'EXPECTED':<13}  MATCH")
    print("-" * 70)

    for index, (video_id, expected) in enumerate(results):
        try:
            response = check_video(video_id)
        except requests.RequestException as e:
            print(f"{video_id:<13}  request failed — {e}")
            mismatches.append((video_id, "request failed", expected))
            time.sleep(DELAY_BETWEEN_REQUESTS_SECONDS)
            continue

        if index == 0:
            print_diagnostics(response)

        status_code = response.status_code
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
