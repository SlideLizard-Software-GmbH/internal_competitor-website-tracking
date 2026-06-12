import * as cheerio from "cheerio";

/** Attributes that change between builds/deploys without reflecting real content. */
const VOLATILE_ATTRS = [
  "nonce",
  "integrity",
  "crossorigin",
  "data-react-helmet",
  "data-n-head",
  "data-reactroot",
];

/**
 * Normalize an HTML page for low-noise diffing: drop scripts/styles/comments and
 * volatile attributes, then re-serialize with stable formatting.
 */
export function cleanHtml(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, template, svg").remove();
  $("link[rel='stylesheet'], link[rel='preload'], link[rel='modulepreload']").remove();

  // Remove HTML comments.
  $("*")
    .contents()
    .filter((_, el) => el.type === "comment")
    .remove();

  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const attr of VOLATILE_ATTRS) delete el.attribs[attr];
    // Drop cache-busting query strings on asset refs (?v=hash).
    for (const ref of ["href", "src"] as const) {
      const val = el.attribs[ref];
      if (val) el.attribs[ref] = val.replace(/([?&])(v|ver|hash|t)=[^&]*/gi, "");
    }
  });

  const body = $.html();
  return collapseWhitespace(body) + "\n";
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
