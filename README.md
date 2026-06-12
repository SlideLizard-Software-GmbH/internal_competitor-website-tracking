# competitor-web-observer

Tracks what competitors change on their websites. This repo is the **tool** (crawler + analyzer); the crawled site mirrors + reports live in a separate **data** repo ([internal_competitor-mirrors](https://github.com/SlideLizard-Software-GmbH/internal_competitor-mirrors)), which runs this tool daily via GitHub Actions.

All competitors share **one mirror repo**, one top-level folder per domain. Per competitor, each run:

1. Baseline = the last commit that touched `<domain>/` (`git log -1 -- <domain>/`). `null` = first crawl.
2. Fetches the sitemap (handles sitemap indexes, gzip, plain urlsets).
3. Crawls pages **changed since baseline** — sitemap is the source of truth:
   - URL with no local file → new page (fetched)
   - `lastmod` newer than baseline (day granularity) → changed (fetched)
   - no `lastmod` → always refetched
   - local file whose URL left the sitemap → removed (`git rm`)
4. Cleans each page (drops scripts/styles/comments, cache-bust query strings, volatile attrs) and stores it under `<domain>/<url-path>.html`.
5. Commits **only `<domain>/`**: `<domain> <date>: N changed, M new, K removed`.
6. Runs headless Claude Code on that commit — scoped to `<domain>/` and **excluding `<domain>/reports/`** via pathspec — for meaningful changes (new/removed pages, messaging, pricing & product signals; ignoring typos/markup/technical noise).
7. Writes + commits `<domain>/reports/CHANGES-<date>.md` in a **separate** commit, so the analyzed page commit never contains a report.

URL paths whose first segment collides with repo internals (`reports`, `.git`, `node_modules`, …) are prefixed with `_`.

## Run it

```bash
npm install
npm run observe                 # crawl into CWD using ./config.json
```

Environment variables (used by the GitHub Action; all optional locally):

| Var | Default | Meaning |
| --- | --- | --- |
| `OBSERVER_WORKDIR` | CWD | Mirror repo root: where `<domain>/` folders + reports live. |
| `OBSERVER_CONFIG` | `$OBSERVER_WORKDIR/config.json` | Path to the competitor list. |
| `OBSERVER_PUSH` | (push if origin exists) | Set `false` to commit only, no push. |
| `ANTHROPIC_API_KEY` | — | Used by the `claude` CLI for analysis. |

Config (`config.json`):

```json
[
  { "name": "acme", "sitemapUrl": "https://www.acme.com/sitemap.xml" }
]
```

First run for a site = baseline snapshot only (no analysis — everything would be "new").

## Hosted setup (GitHub Actions)

The data repo is bootstrapped from [`mirror-template/`](mirror-template/): config, `.github/workflows/observe.yml`, `.gitignore`/`.gitattributes`, README. The workflow checks out the data repo (full history), checks out this tool repo into `.observer-tool/`, installs deps + the Claude CLI, runs the observer against the data checkout, and pushes results. Needs repo secret `ANTHROPIC_API_KEY`.

## Notes

- Requires the `claude` CLI on PATH (headless analysis via `claude -p`, allowed tools `Bash(git:*)` + `Read`).
- Crawls run unthrottled and ignore `robots.txt` — intended for fetching a competitor's own public sitemap URLs.
- Failed page fetches (404/timeout/5xx) are logged and skipped; the previous local copy is kept.
- `local-test.mjs` is an offline end-to-end test against a throwaway workdir: `node local-test.mjs`.
