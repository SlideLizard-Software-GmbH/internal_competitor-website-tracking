# competitor-web-observer

Tracks what competitors change on their websites. Per run, per site it:

1. Reads `config.json` (array of competitors + sitemap URLs).
2. Creates `<domain>/` at the project root and `git init`s it if missing.
3. Fetches the sitemap (handles sitemap indexes, gzip, plain urlsets).
4. Crawls pages **changed since the last run** — sitemap is the source of truth:
   - URL with no local file → new page (fetched)
   - `lastmod` newer than the last commit (day granularity) → changed (fetched)
   - no `lastmod` → always refetched
   - local file whose URL left the sitemap → removed (`git rm`)
5. Cleans each page (drops scripts/styles/comments, cache-bust query strings, volatile attrs) and stores it under `<domain>/pages/<url-path>.html`.
6. Commits: `crawl <date>: N changed, M new, K removed`.
7. Runs headless Claude Code on that commit to report **meaningful** changes — new/removed pages, messaging, pricing & product signals — ignoring typos, markup, and technical noise.
8. Writes the report to `<domain>/reports/CHANGES-<date>.md`.

Reports and state live in the mirror folder but are **gitignored**, so Claude only ever analyzes real site changes — never its own prior reports.

## Usage

```bash
npm install
npm run observe                 # uses ./config.json
npm run observe -- path/to/other.json
```

First run for a site = baseline snapshot only (no analysis — everything would be "new").

## Config

```json
[
  { "name": "acme", "sitemapUrl": "https://www.acme.com/sitemap.xml" }
]
```

## Notes

- Requires the `claude` CLI on PATH (headless analysis via `claude -p`).
- Crawls run unthrottled and ignore `robots.txt` — intended for fetching a competitor's own public sitemap URLs.
- Failed page fetches (404/timeout/5xx) are logged and skipped; the previous local copy is kept.
- `local-test.mjs` is an offline end-to-end test: `node local-test.mjs`.
