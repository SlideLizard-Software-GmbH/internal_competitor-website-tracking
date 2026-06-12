import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import type { SitemapEntry } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; competitor-web-observer/1.0; +https://localhost)";

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`sitemap fetch ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gz =
    url.endsWith(".gz") || buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? gunzipSync(buf) : buf).toString("utf8");
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Fetch a sitemap URL, recursing into sitemap indexes. Returns flat URL list. */
export async function collectSitemapEntries(
  sitemapUrl: string,
  seen = new Set<string>(),
): Promise<SitemapEntry[]> {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);

  const xml = await fetchXml(sitemapUrl);
  const doc = parser.parse(xml);

  // Sitemap index → recurse into child sitemaps.
  if (doc.sitemapindex) {
    const children = asArray<any>(doc.sitemapindex.sitemap);
    const nested = await Promise.all(
      children
        .map((c) => c?.loc)
        .filter((loc): loc is string => typeof loc === "string")
        .map((loc) => collectSitemapEntries(loc, seen)),
    );
    return nested.flat();
  }

  // Plain urlset.
  if (doc.urlset) {
    return asArray<any>(doc.urlset.url)
      .filter((u) => typeof u?.loc === "string")
      .map((u) => ({
        url: u.loc as string,
        lastmod: typeof u.lastmod === "string" ? u.lastmod : undefined,
      }));
  }

  return [];
}
