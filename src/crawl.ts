import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { glob } from "node:fs/promises";
import { cleanHtml } from "./clean.js";
import { urlToFile } from "./paths.js";
import { removeTracked } from "./git.js";
import { Progress } from "./progress.js";
import type { CrawlPlan, CrawlResult, SitemapEntry } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; competitor-web-observer/1.0; +https://localhost)";
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Decide which pages to fetch. Sitemap is source of truth:
 *  - URL with no local file        → added
 *  - lastmod newer than baseline   → changed
 *  - no lastmod                     → always refetch (treated as changed)
 *  - local file whose URL is gone   → removed
 */
export async function planCrawl(
  pagesDir: string,
  entries: SitemapEntry[],
  baselineEpoch: number | null,
): Promise<CrawlPlan> {
  const plan: CrawlPlan = { changed: [], added: [], removedFiles: [], unchanged: [] };
  const expectedFiles = new Set<string>();

  for (const entry of entries) {
    const file = urlToFile(pagesDir, entry.url);
    expectedFiles.add(path.resolve(file));

    if (!existsSync(file)) {
      plan.added.push(entry);
      continue;
    }
    if (!entry.lastmod) {
      plan.changed.push(entry);
      continue;
    }
    // lastmod is usually date-only; comparing it as a midnight timestamp against a
    // precise commit time would hide same-day edits. Compare at day granularity and
    // let git drop refetches whose cleaned content is identical.
    const lastmodDay = dayNumber(new Date(entry.lastmod).getTime());
    const baselineDay = baselineEpoch === null ? null : dayNumber(baselineEpoch * 1000);
    if (baselineDay === null || !Number.isFinite(lastmodDay) || lastmodDay >= baselineDay) {
      plan.changed.push(entry);
    } else {
      plan.unchanged.push(entry);
    }
  }

  // Find local files no longer present in the sitemap (committed reports live
  // under reports/ and are not page mirrors, so skip them).
  if (existsSync(pagesDir)) {
    for await (const f of glob("**/*.html", { cwd: pagesDir })) {
      if (f.startsWith("reports/") || f.startsWith("reports\\")) continue;
      const abs = path.resolve(pagesDir, f);
      if (!expectedFiles.has(abs)) plan.removedFiles.push(abs);
    }
  }

  return plan;
}

function dayNumber(epochMs: number): number {
  return Math.floor(epochMs / 86_400_000);
}

async function fetchPage(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function savePage(pagesDir: string, entry: SitemapEntry): Promise<void> {
  const html = await fetchPage(entry.url);
  const cleaned = cleanHtml(html);
  const file = urlToFile(pagesDir, entry.url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, cleaned, "utf8");
}

export async function executeCrawl(
  repoDir: string,
  pagesDir: string,
  plan: CrawlPlan,
): Promise<CrawlResult> {
  const result: CrawlResult = { fetched: 0, failed: 0, removed: 0 };
  const toFetch = [...plan.added, ...plan.changed];
  const bar = new Progress(toFetch.length, "crawling");

  for (const entry of toFetch) {
    const short = entry.url.replace(/^https?:\/\/[^/]+/, "") || "/";
    try {
      await savePage(pagesDir, entry);
      result.fetched++;
      bar.tick(short);
    } catch (err) {
      result.failed++;
      bar.tick(`FAILED ${short}: ${(err as Error).message}`, true);
    }
  }
  bar.done_();

  for (const abs of plan.removedFiles) {
    const rel = path.relative(repoDir, abs);
    removeTracked(repoDir, rel);
    result.removed++;
  }

  return result;
}
