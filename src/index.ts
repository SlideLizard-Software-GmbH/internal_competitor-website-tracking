import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSitemapEntries } from "./sitemap.js";
import { planCrawl, executeCrawl } from "./crawl.js";
import { ensureRepo, lastCommitEpoch, hasCommits, commitAll } from "./git.js";
import { analyzeCommit, writeReport } from "./analyze.js";
import type { SiteConfig } from "./types.js";

const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// Reports + state live here per domain and are kept out of the mirror diffs.
const GITIGNORE = ["reports/", ".state/", "node_modules/", ""].join("\n");

function domainOf(sitemapUrl: string): string {
  return new URL(sitemapUrl).hostname.replace(/^www\./, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadConfig(): Promise<SiteConfig[]> {
  const configArg = process.argv[2];
  const configPath = configArg
    ? path.resolve(configArg)
    : path.join(PROJECT_ROOT, "config.json");
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("config.json must be an array of sites");
  return parsed;
}

async function observeSite(site: SiteConfig): Promise<void> {
  const domain = domainOf(site.sitemapUrl);
  const repoDir = path.join(PROJECT_ROOT, domain);
  const pagesDir = repoDir;
  const reportsDir = path.join(repoDir, "reports");

  console.log(`\n=== ${site.name} (${domain}) ===`);

  mkdirSync(repoDir, { recursive: true });
  const isNewRepo = ensureRepo(repoDir);
  writeFileSync(path.join(repoDir, ".gitignore"), GITIGNORE, "utf8");
  writeFileSync(path.join(repoDir, ".gitattributes"), "* -text\n", "utf8");

  const firstRun = isNewRepo || !hasCommits(repoDir);
  const baselineEpoch = lastCommitEpoch(repoDir);

  console.log(`  fetching sitemap ${site.sitemapUrl}`);
  const entries = await collectSitemapEntries(site.sitemapUrl);
  console.log(`  ${entries.length} URLs in sitemap`);

  const plan = await planCrawl(pagesDir, entries, firstRun ? null : baselineEpoch);
  console.log(
    `  plan: ${plan.added.length} new, ${plan.changed.length} changed, ` +
      `${plan.removedFiles.length} removed, ${plan.unchanged.length} unchanged`,
  );

  const result = await executeCrawl(repoDir, pagesDir, plan);
  console.log(`  fetched ${result.fetched}, failed ${result.failed}, removed ${result.removed}`);

  const msg = `crawl ${today()}: ${plan.changed.length} changed, ${plan.added.length} new, ${result.removed} removed`;
  const commit = commitAll(repoDir, msg);

  if (!commit) {
    console.log("  no changes to commit");
    return;
  }
  console.log(`  committed ${commit.slice(0, 8)}`);

  if (firstRun) {
    console.log("  first run → baseline only, skipping analysis");
    return;
  }

  console.log("  analyzing commit with Claude…");
  try {
    const report = await analyzeCommit(repoDir, commit, site.name);
    const file = await writeReport(reportsDir, today(), report);
    console.log(`  report → ${path.relative(PROJECT_ROOT, file)}`);
    console.log("\n" + report + "\n");
  } catch (err) {
    console.error(`  analysis failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const sites = await loadConfig();
  for (const site of sites) {
    try {
      await observeSite(site);
    } catch (err) {
      console.error(`! ${site.name} failed: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
