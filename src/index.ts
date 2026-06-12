import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { collectSitemapEntries } from "./sitemap.js";
import { planCrawl, executeCrawl } from "./crawl.js";
import { ensureRepo, lastCommitEpochForPath, commitPath, push } from "./git.js";
import { analyzeCommit, writeReport } from "./analyze.js";
import type { SiteConfig } from "./types.js";

// The mirror repo: where domain subfolders + reports live. Defaults to CWD so the
// same tool can run against any checkout (locally or inside GitHub Actions).
const WORKDIR = path.resolve(process.env.OBSERVER_WORKDIR ?? process.cwd());

const GITIGNORE = ["node_modules/", ".state/", ""].join("\n");

function domainOf(sitemapUrl: string): string {
  return new URL(sitemapUrl).hostname.replace(/^www\./, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadConfig(): Promise<SiteConfig[]> {
  const configPath = path.resolve(
    process.env.OBSERVER_CONFIG ?? process.argv[2] ?? path.join(WORKDIR, "config.json"),
  );
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("config.json must be an array of sites");
  return parsed;
}

function ensureRepoScaffold(): void {
  ensureRepo(WORKDIR);
  for (const [name, content] of [
    [".gitignore", GITIGNORE],
    [".gitattributes", "* -text\n"],
  ] as const) {
    const file = path.join(WORKDIR, name);
    if (!existsSync(file)) writeFileSync(file, content, "utf8");
  }
}

async function observeSite(site: SiteConfig): Promise<void> {
  const domain = domainOf(site.sitemapUrl);
  const pagesDir = path.join(WORKDIR, domain);
  const reportsDir = path.join(pagesDir, "reports");

  console.log(`\n=== ${site.name} (${domain}) ===`);
  mkdirSync(pagesDir, { recursive: true });

  // Per-domain baseline: last commit that touched this folder. null = first crawl.
  const baselineEpoch = lastCommitEpochForPath(WORKDIR, domain);
  const firstRun = baselineEpoch === null;

  console.log(`  fetching sitemap ${site.sitemapUrl}`);
  const entries = await collectSitemapEntries(site.sitemapUrl);
  console.log(`  ${entries.length} URLs in sitemap`);

  const plan = await planCrawl(pagesDir, entries, baselineEpoch);
  console.log(
    `  plan: ${plan.added.length} new, ${plan.changed.length} changed, ` +
      `${plan.removedFiles.length} removed, ${plan.unchanged.length} unchanged`,
  );

  const result = await executeCrawl(WORKDIR, pagesDir, plan);
  console.log(`  fetched ${result.fetched}, failed ${result.failed}, removed ${result.removed}`);

  const msg = `${domain} ${today()}: ${plan.changed.length} changed, ${plan.added.length} new, ${result.removed} removed`;
  const commit = commitPath(WORKDIR, domain, msg);

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
    const report = await analyzeCommit(WORKDIR, commit, site.name, domain);
    const file = await writeReport(reportsDir, today(), report);
    // Commit the report separately so it never appears in a diff Claude analyzes.
    commitPath(WORKDIR, domain, `${domain} report ${today()}`);
    console.log(`  report → ${path.relative(WORKDIR, file)}`);
    console.log("\n" + report + "\n");
  } catch (err) {
    console.error(`  analysis failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  ensureRepoScaffold();
  const sites = await loadConfig();
  for (const site of sites) {
    try {
      await observeSite(site);
    } catch (err) {
      console.error(`! ${site.name} failed: ${(err as Error).message}`);
    }
  }

  if (process.env.OBSERVER_PUSH !== "false") {
    try {
      push(WORKDIR);
      console.log("\npushed to origin");
    } catch (err) {
      console.error(`push failed: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
