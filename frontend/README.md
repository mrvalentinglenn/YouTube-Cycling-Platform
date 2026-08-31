# Front end

The Cycling Content Tracker interface. A static React site that reads a
materialised Postgres view in Supabase directly from the browser.

The project as a whole is described in the [root README](../README.md).
This file covers the front end specifically: how it is structured, why,
and how to run it.

## Stack

Vite + React + React Router, styled with Tailwind CSS v4. Deployed on
Vercel as a static site with this directory as the root.

There is no server, deliberately. Nothing here is private — the anon role
holds SELECT on three tables of public YouTube data and nothing else, and
the Supabase publishable key is designed to ship in a browser. A server
would add a deployment surface without protecting anything.

Next.js was considered and declined. The reasoning is in `DECISIONS.md`
under 2026-08-21, along with the accepted costs: a brief empty state on
first load, and no SEO.

## Two routes

| Route | What it is |
|---|---|
| `/` | Homepage — four category sections, top 3 each |
| `/category/:categories` | One or more categories merged into a single ranked list |

`:categories` is a comma-separated list of raw database values —
`brands`, `triathletes`, `teams`, `influencers` — so
`/category/teams,influencers` is one merged ranking rather than two
blocks. They are always serialised in the canonical order exported from
`src/lib/filters.js`, so one selection has exactly one URL.

"Show more" on the homepage is navigation, not expansion: it leaves the
homepage and opens the category page, carrying the current filters.

## Filter state lives in the URL

Every filter is a query param. There is no filter state in React and no
context provider.

| Param | Values | Default |
|---|---|---|
| `window` | `7d` \| `90d` | `90d` |
| `metric` | `views` \| `likes` \| `comments` | `views` |
| `comparison` | `absolute` \| `relative` | `absolute` |
| `format` | `longform` \| `shorts` | `longform` |
| `page` | integer | `1` |
| `exclude` | comma-separated channel IDs | empty |
| `q` | free text | empty |

Three things come free as a result rather than being built: a refresh
keeps the current filters, the browser back button steps back one filter
change, and a link can be shared with its filters intact. Carrying state
between the two routes stops being a problem at all, because the state
*is* the address.

Defaults live in exactly one place, `src/lib/filters.js`, exported as
`DEFAULT_FILTERS` alongside a resolver that takes a `URLSearchParams` and
returns every filter resolved to its value or its default. Both pages use
that resolver. A missing param and a changed default are handled in the
same place.

## Reading the view

The front end reads one object, `scoring_view`, and never computes a
baseline. How the score is calculated lives in SQL — see
`sql/scoring_view.sql`. Changing the baseline, the pool or the provisional
threshold is a database change this code never sees.

Three things about that query are easy to get wrong and silent when they
are:

**`format` is not a column.** It maps to `is_short` — `longform` to
false, `shorts` to true.

**Relative rankings must specify nulls-last.** Postgres sorts NULLS FIRST
on a DESC sort, so without
`.order('outlier_score', { ascending: false, nullsFirst: false })` a video
with no valid baseline ranks #1 on a card showing no score.

**Page size differs by format** — 20 for long-form, 24 for Shorts, since
Shorts are portrait and 24 divides cleanly into every breakpoint's column
count. It is exported from one helper used by both the `.range()` call and
the rank offset. If those two numbers ever diverge, videos are silently
skipped or repeated between pages, and the list still looks plausible.
This is also why `page` resets to 1 on every filter change: page 5 of
Shorts can reach further than page 5 of long-form exists.

Rank is positional and offset-aware. The view carries no rank column and
no `ORDER BY` — the front end derives rank from row order plus the page
offset, so the first row of page 2 is #21.

## Running it locally

```bash
npm install
cp .env.example .env
npm run dev
```

Fill in the two variables in `.env` from your Supabase project settings.
Both are read by the browser, which is what the `VITE_` prefix means. The
Supabase secret key must never appear in this directory — it bypasses row
level security and belongs to the collection job alone.

The site expects the database to be populated. With an empty
`scoring_view` it renders correctly and shows nothing, which looks like a
bug and is not one.

```bash
npm run build     # production build to dist/
npm run preview   # serve the build locally
```

## Deployment notes

`vercel.json` rewrites every route to `index.html`. Without it a direct
request to `/category/teams` returns 404 — Vercel does not do this for a
Vite SPA by default, which was discovered after the first deploy rather
than before it.

Clicking through from the homepage would not have caught it, because
React Router never asks the server for anything. Only fresh URL entry
sends a real request for a path with no file behind it, which is exactly
what a recruiter opening a link does.

`public/robots.txt` disallows all crawlers. The site is reachable by
anyone holding the URL and deliberately not discoverable by anyone who is
not. That limits discoverability, not access.

## Where the reasoning lives

Architectural decisions are in [`DECISIONS.md`](../DECISIONS.md) with the
reasoning intact, including the ones that were reversed. The front-end
entries run from 2026-08-21 onward.