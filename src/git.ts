import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" }).trim();
}

/** Like git() but swallows stderr — for reads that legitimately fail (e.g. empty repo). */
function gitQuiet(repoDir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function ensureRepo(repoDir: string): boolean {
  const isNew = !existsSync(path.join(repoDir, ".git"));
  if (isNew) {
    git(repoDir, ["init", "-q"]);
    git(repoDir, ["config", "user.name", "competitor-web-observer"]);
    git(repoDir, ["config", "user.email", "observer@localhost"]);
    // Crawled HTML is stored verbatim; don't let git rewrite line endings (avoids CRLF warning spam).
    git(repoDir, ["config", "core.autocrlf", "false"]);
  }
  return isNew;
}

/** Epoch seconds of the last commit, or null if the repo has no commits yet. */
export function lastCommitEpoch(repoDir: string): number | null {
  try {
    const out = gitQuiet(repoDir, ["log", "-1", "--format=%ct"]);
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

export function hasCommits(repoDir: string): boolean {
  return lastCommitEpoch(repoDir) !== null;
}

export function removeTracked(repoDir: string, relPath: string): void {
  git(repoDir, ["rm", "-q", "--ignore-unmatch", "--", relPath]);
}

/** Stage everything (respecting .gitignore) and commit. Returns commit hash, or null if nothing to commit. */
export function commitAll(repoDir: string, message: string): string | null {
  git(repoDir, ["add", "-A"]);
  const status = git(repoDir, ["status", "--porcelain"]);
  if (!status) return null;
  git(repoDir, ["commit", "-q", "-m", message]);
  return git(repoDir, ["rev-parse", "HEAD"]);
}
