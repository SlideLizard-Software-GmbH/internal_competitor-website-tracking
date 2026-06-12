import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROMPT = (commit: string, name: string, scope: string) => `You are analyzing changes a competitor made to their website "${name}".

This git repository mirrors several competitors, one per top-level folder. This competitor lives under "${scope}/" (one cleaned HTML file per page, laid out by URL path). The commit ${commit} captures the latest crawl of this competitor.

Run git yourself to inspect ONLY this competitor's changes in that commit (the pathspec scopes to its folder and excludes its committed reports):
  git show --stat ${commit} -- ${scope}/ ':(exclude)${scope}/reports/'
  git show ${commit} -- ${scope}/ ':(exclude)${scope}/reports/'
Use --stat first to see added/removed/modified files (each path mirrors a page URL), then read the diffs that matter. Do not look at other folders.

Write a concise report in English with these sections (omit a section if empty):

## New pages
Pages added this crawl — list URL/path + one line on what the page is about.

## Removed pages
Pages deleted from their sitemap.

## Meaningful content changes
Real changes in messaging, positioning, copy, structure, or navigation. One bullet per page: URL/path + what changed and why it might matter.

## Pricing & product signals
Any change touching pricing, plans, features, product names, or launch/announcement language. Call these out explicitly even if small.

IGNORE and do not report: typo/grammar fixes, whitespace/markup/formatting noise, asset hash or URL-version changes, reordered attributes, analytics/tracking tags, and other purely technical edits.

If nothing meaningful changed, say exactly: "No meaningful changes this crawl."

Output only the report markdown. Do not preface it with commentary.`;

/** Run headless Claude Code in the repo to analyze a commit. Returns the report markdown. */
export function analyzeCommit(
  repoDir: string,
  commit: string,
  name: string,
  scope: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        PROMPT(commit, name, scope),
        "--allowedTools",
        "Bash(git:*)",
        "Read",
        "--permission-mode",
        "default",
      ],
      { cwd: repoDir, stdio: ["ignore", "pipe", "pipe"] },
    );

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exited ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

export async function writeReport(
  reportsDir: string,
  dateStr: string,
  body: string,
): Promise<string> {
  await mkdir(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `CHANGES-${dateStr}.md`);
  await writeFile(file, `# Changes — ${dateStr}\n\n${body}\n`, "utf8");
  return file;
}
