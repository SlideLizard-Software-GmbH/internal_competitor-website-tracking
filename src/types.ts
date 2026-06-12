export interface SiteConfig {
  /** Folder name + label for the competitor (e.g. "acme"). */
  name: string;
  /** URL of the sitemap (may be a sitemap index, gzipped, or a plain urlset). */
  sitemapUrl: string;
}

export interface SitemapEntry {
  url: string;
  /** ISO timestamp from <lastmod>, if the sitemap provided one. */
  lastmod?: string;
}

export interface CrawlPlan {
  changed: SitemapEntry[];
  added: SitemapEntry[];
  removedFiles: string[];
  unchanged: SitemapEntry[];
}

export interface CrawlResult {
  fetched: number;
  failed: number;
  removed: number;
}
