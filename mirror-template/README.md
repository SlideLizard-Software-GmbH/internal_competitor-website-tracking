# Competitor website mirrors

Auto-maintained mirrors of competitor websites + AI change reports. Each competitor lives in its own top-level folder (named by domain); `<domain>/reports/CHANGES-<date>.md` summarizes the meaningful changes per crawl.

Crawling + analysis run daily via GitHub Actions ([.github/workflows/observe.yml](.github/workflows/observe.yml)) using the tool at [internal_competitor-website-tracking](https://github.com/SlideLizard-Software-GmbH/internal_competitor-website-tracking).

## Add a competitor

Edit [config.json](config.json):

```json
[
  { "name": "smartpoint", "sitemapUrl": "https://www.smartpoint.at/sitemap.xml" }
]
```

Next scheduled run picks it up (first run = baseline snapshot, no report).

## How it works

Per competitor, each run:
1. Baseline = last commit that touched `<domain>/` (`git log -1 -- <domain>/`).
2. Fetch sitemap, crawl pages new/changed since baseline (cleaned HTML), `git rm` pages dropped from the sitemap.
3. Commit `<domain>/` (pages only).
4. Run Claude on that commit, scoped to `<domain>/` excluding `reports/`, to report meaningful changes (new/removed pages, messaging, pricing & product signals — ignoring typos/markup/technical noise).
5. Write + commit `<domain>/reports/CHANGES-<date>.md` separately.

## Setup (one-time)

- Repo secret `ANTHROPIC_API_KEY` — for the Claude analysis step.
- Actions → "observe" workflow has `contents: write` (already set) to push results.
- Run manually anytime via **Actions → observe → Run workflow**.
