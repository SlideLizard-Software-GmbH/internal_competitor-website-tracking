import path from "node:path";

// Repo-internal names that live at the mirror root. A page URL whose first
// segment collides with one of these gets prefixed so the crawl never writes
// into (or shadows) git metadata, the reports dir, or node_modules.
const RESERVED_ROOT = new Set([
  ".git",
  ".gitignore",
  ".gitattributes",
  "reports",
  ".state",
  "node_modules",
]);

/**
 * Map a page URL to a local file path under <pagesDir>, mirroring the URL path.
 * Directory-style URLs and trailing slashes resolve to index.html so a path can
 * be both a page and a parent of other pages without colliding.
 */
export function urlToFile(pagesDir: string, rawUrl: string): string {
  const u = new URL(rawUrl);
  let p = decodeURIComponent(u.pathname);

  if (p.endsWith("/") || p === "") p += "index.html";
  else if (!path.extname(p)) p += "/index.html";

  // Fold the query string into the filename so distinct queries don't overwrite.
  if (u.search) {
    const ext = path.extname(p);
    const base = p.slice(0, -ext.length || undefined);
    const q = u.search.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    p = `${base}__${q}${ext}`;
  }

  const segments = p.split("/").filter(Boolean).map(sanitizeSegment);
  if (segments.length && RESERVED_ROOT.has(segments[0].toLowerCase())) {
    segments[0] = "_" + segments[0];
  }
  return path.join(pagesDir, ...segments);
}

function sanitizeSegment(seg: string): string {
  return seg.replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
}
