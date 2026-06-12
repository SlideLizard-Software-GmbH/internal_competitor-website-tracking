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

/** Initialize the single mirror repo if missing. Returns true if it was just created. */
export function ensureRepo(repoDir: string): boolean {
  const isNew = !existsSync(path.join(repoDir, ".git"));
  if (isNew) {
    git(repoDir, ["init", "-q"]);
    if (!gitQuiet(repoDir, ["config", "user.name"])) {
      git(repoDir, ["config", "user.name", "competitor-web-observer"]);
      git(repoDir, ["config", "user.email", "observer@localhost"]);
    }
    // Crawled HTML is stored verbatim; don't let git rewrite line endings.
    git(repoDir, ["config", "core.autocrlf", "false"]);
  }
  return isNew;
}

/**
 * Epoch seconds of the last commit that touched <subdir>/, or null if no commit
 * has ever touched it (first run for that domain). This is the per-domain baseline.
 */
export function lastCommitEpochForPath(repoDir: string, subdir: string): number | null {
  try {
    const out = gitQuiet(repoDir, ["log", "-1", "--format=%ct", "--", `${subdir}/`]);
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

export function removeTracked(repoDir: string, relPath: string): void {
  git(repoDir, ["rm", "-q", "--ignore-unmatch", "--", relPath]);
}

/**
 * Stage and commit only the changes under <subdir>/. Returns the commit hash, or
 * null if that subtree had nothing to commit. Other domains' changes are untouched.
 */
export function commitPath(repoDir: string, subdir: string, message: string): string | null {
  git(repoDir, ["add", "-A", "--", `${subdir}/`]);
  const staged = gitQuiet(repoDir, ["diff", "--cached", "--name-only", "--", `${subdir}/`]);
  if (!staged) return null;
  git(repoDir, ["commit", "-q", "-m", message, "--", `${subdir}/`]);
  return git(repoDir, ["rev-parse", "HEAD"]);
}

/** Push the current branch to origin, if a remote exists. */
export function push(repoDir: string): void {
  if (!gitQuiet(repoDir, ["remote"])) return;
  const branch = git(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  git(repoDir, ["push", "-q", "origin", branch]);
}
