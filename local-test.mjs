// Offline end-to-end test: serve a tiny site, run the observer twice against a
// throwaway WORKDIR, inspect the single mirror repo. Exercises the full pipeline
// incl. real Claude analysis on the second run.
import { createServer } from "node:http";
import { execFileSync, execFile } from "node:child_process";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const WORKDIR = path.join(ROOT, ".testwork");
const DOMAIN_DIR = path.join(WORKDIR, "127.0.0.1");
const TEST_CONFIG = path.join(WORKDIR, "config.json");

rmSync(WORKDIR, { recursive: true, force: true });
mkdirSync(WORKDIR, { recursive: true });
writeFileSync(
  TEST_CONFIG,
  JSON.stringify([{ name: "acme", sitemapUrl: "http://127.0.0.1:8731/sitemap.xml" }]),
);

let pageBody = "<h1>Acme</h1><p>Original pricing: $10/mo</p>";

const pageHtml = () => `<!doctype html><html><head>
  <title>Acme</title>
  <script>console.log("noise that should be stripped")</script>
  <link rel="stylesheet" href="/app.css?v=abc123">
  <!-- build comment -->
</head><body>${pageBody}</body></html>`;

const aboutHtml = `<!doctype html><html><head><title>About</title>
  <script>var x=1</script></head><body><h1>About Acme</h1><p>We sell things.</p></body></html>`;

let lastmod = "2026-06-01";
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:8731/</loc><lastmod>${lastmod}</lastmod></url>
  <url><loc>http://127.0.0.1:8731/about</loc><lastmod>2026-06-01</lastmod></url>
</urlset>`;

const server = createServer((req, res) => {
  const url = req.url;
  if (url === "/sitemap.xml") { res.setHeader("content-type", "application/xml"); res.end(sitemap()); }
  else if (url === "/" || url === "") { res.setHeader("content-type", "text/html"); res.end(pageHtml()); }
  else if (url === "/about") { res.setHeader("content-type", "text/html"); res.end(aboutHtml); }
  else { res.statusCode = 404; res.end("nope"); }
});

// Async so the in-process HTTP server keeps answering the child's fetches.
function run() {
  return new Promise((resolve, reject) => {
    execFile(
      "npx",
      ["tsx", "src/index.ts"],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, OBSERVER_WORKDIR: WORKDIR, OBSERVER_CONFIG: TEST_CONFIG, OBSERVER_PUSH: "false" },
      },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
    );
  });
}
function git(args) {
  return execFileSync("git", args, { cwd: WORKDIR, encoding: "utf8" }).trim();
}

await new Promise((r) => server.listen(8731, "127.0.0.1", r));
try {
  console.log("------ RUN 1 (baseline) ------");
  console.log(await run());

  const home = path.join(DOMAIN_DIR, "index.html");
  const about = path.join(DOMAIN_DIR, "about", "index.html");
  if (!existsSync(home) || !existsSync(about)) throw new Error("FAIL: pages not written");
  const homeContent = readFileSync(home, "utf8");
  if (homeContent.includes("<script")) throw new Error("FAIL: script not stripped");
  if (homeContent.includes("?v=abc123")) throw new Error("FAIL: cache-bust not stripped");
  const commitsAfter1 = Number(git(["rev-list", "--count", "HEAD"]));
  if (commitsAfter1 !== 1) throw new Error(`FAIL: expected 1 commit, got ${commitsAfter1}`);
  console.log("OK: baseline crawl, scripts/cachebust stripped, 1 commit, no report");

  // change homepage + bump lastmod so run 2 detects it
  pageBody = "<h1>Acme</h1><p>New pricing: $25/mo — now with Enterprise plan!</p>";
  lastmod = "2026-06-12";

  console.log("\n------ RUN 2 (change → analysis) ------");
  console.log(await run());

  const commitsAfter2 = Number(git(["rev-list", "--count", "HEAD"]));
  if (commitsAfter2 < 2) throw new Error(`FAIL: expected page+report commits, got ${commitsAfter2}`);
  const report = path.join(DOMAIN_DIR, "reports", "CHANGES-" + new Date().toISOString().slice(0, 10) + ".md");
  if (!existsSync(report)) throw new Error("FAIL: report not written");
  console.log("OK: change committed, report written");
  console.log("\n--- REPORT ---\n" + readFileSync(report, "utf8"));

  // reports ARE now tracked (shareable), but live under <domain>/reports/
  const tracked = git(["ls-files"]);
  if (!tracked.includes("127.0.0.1/reports/")) throw new Error("FAIL: report not committed");
  console.log("OK: report committed under <domain>/reports/");

  // the analyzed (page) commit must NOT touch reports/
  const filesInPrev = git(["show", "--name-only", "--format=", "HEAD~1"]);
  if (filesInPrev.includes("reports/")) throw new Error("FAIL: report leaked into analyzed commit");
  console.log("OK: page commit and report commit are separate");

  console.log("\nALL CHECKS PASSED");
} finally {
  server.close();
}
