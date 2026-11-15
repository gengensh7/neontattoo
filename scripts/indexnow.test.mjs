import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  indexable,
  pageUrl,
  parseSitemap,
  productionOrigin,
  request,
  runIndexNow,
} from "./indexnow.mjs";

const origin = "https://neontattoo.xyz";
const key = "0123456789abcdef0123456789abcdef";
const env = {};
const sitemap = urls =>
  `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
const html =
  '<html><head><meta name="robots" content="index,follow"></head><body>Page</body></html>';
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers });

async function fixture(t, xml) {
  const root = await mkdtemp(path.join(os.tmpdir(), "indexnow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public"));
  await mkdir(path.join(root, "src/lib"), { recursive: true });
  await writeFile(path.join(root, "src/lib/config.ts"), `export const DOMAIN_URL = "${origin}";\n`);
  await mkdir(path.join(root, ".next/server/app"), { recursive: true });
  await writeFile(path.join(root, "public", `${key}.txt`), key);
  await writeFile(path.join(root, "public/sitemap.xml"), xml);
  await writeFile(path.join(root, ".next/server/app/index.html"), html);
  return root;
}

test("production domain and preview guards", () => {
  assert.equal(productionOrigin(env, origin), origin);
  for (const domain of [
    "http://localhost:3000",
    "https://127.0.0.1",
    "https://[::1]",
    "https://192.168.1.2",
    "https://app.vercel.app",
    "https://preview.neontattoo.xyz",
    "https://neontattoo.xyz/path",
    "https://neontattoo.xyz:444",
  ]) {
    assert.throws(() => productionOrigin(env, domain));
  }
  for (const context of [
    { VERCEL_ENV: "preview" },
    { CONTEXT: "deploy-preview" },
    { NODE_ENV: "development" },
    { CF_PAGES: "1", CF_PAGES_BRANCH: "feature" },
    { VERCEL_TARGET_ENV: "staging" },
  ]) {
    assert.throws(() => productionOrigin({ ...env, ...context }, origin));
  }
  assert.throws(() => productionOrigin({}));
});

test("sitemap namespaces, CDATA, entities; ignore image locations", () => {
  assert.deepEqual(
    parseSitemap(
      '<s:urlset xmlns:s="urn:test"><s:url><image:loc>bad</image:loc><s:loc><![CDATA[https://neontattoo.xyz/?a=1&b=2]]></s:loc></s:url></s:urlset>'
    ),
    {
      index: false,
      locations: [`${origin}/?a=1&b=2`],
    }
  );
  assert.deepEqual(parseSitemap(sitemap([`${origin}/?a=1&amp;b=&#50;`])).locations, [
    `${origin}/?a=1&b=2`,
  ]);
  assert.throws(() => parseSitemap("<!DOCTYPE urlset><urlset/>"));
  assert.throws(() => parseSitemap("<html>Error</html>"));
});

test("page URL and noindex/canonical filtering", () => {
  for (const value of [
    "https://other.xyz/",
    `${origin}/api/test`,
    `${origin}/%61dmin`,
    `${origin}/_next/file`,
    `${origin}/login`,
    `${origin}/sitemap.xml`,
    `${origin}/#section`,
  ])
    assert.equal(pageUrl(value, origin), null);
  assert.equal(pageUrl(`${origin}/?a=1&b=2`, origin), `${origin}/?a=1&b=2`);
  assert.equal(indexable(html, new Headers(), `${origin}/`), true);
  for (const meta of [
    '<meta content="noindex, follow" name="robots">',
    "<meta name='bingbot' content='none'>",
    '<link href="https://other.xyz/" rel="canonical">',
  ]) {
    assert.equal(indexable(`<head>${meta}</head>`, new Headers(), `${origin}/`), false);
  }
  assert.equal(indexable(html, new Headers({ "x-robots-tag": "noindex" }), `${origin}/`), false);
  assert.equal(
    indexable(
      '<head><!-- <meta name="robots" content="noindex"> --></head>',
      new Headers(),
      `${origin}/`
    ),
    true
  );
});

test("nested sitemap index, cycles, deduplication and offline dry-run never fetch", async t => {
  const root = await fixture(
    t,
    `<sitemapindex><sitemap><loc>${origin}/nested.xml</loc></sitemap><sitemap><loc>https://other.xyz/sitemap.xml</loc></sitemap><sitemap><loc>${origin}/sitemap.xml</loc></sitemap></sitemapindex>`
  );
  await writeFile(
    path.join(root, "public/nested.xml"),
    sitemap([`${origin}/`, `${origin}/`, `${origin}/admin`, "https://other.xyz/"])
  );
  const urls = await runIndexNow({
    root,
    env,
    args: ["--dry-run"],
    fetchFn: () => {
      throw new Error("Network forbidden");
    },
  });
  assert.deepEqual(urls, [`${origin}/`]);
});

test("public key must match before sitemap/page or POST requests", async t => {
  const root = await fixture(t, sitemap([`${origin}/`]));
  const calls = [];
  await assert.rejects(
    runIndexNow({
      root,
      env,
      args: [],
      fetchFn: async url => {
        calls.push(url);
        return response("different-key");
      },
    }),
    /Public key file/
  );
  assert.deepEqual(calls, [`${origin}/${key}.txt`]);
});

test("key comes only from one valid public file; missing, mismatched and ambiguous keys fail before fetch", async t => {
  const root = await fixture(t, sitemap([`${origin}/`]));
  await writeFile(path.join(root, "public/unrelated.txt"), "unrelated text file");
  const options = {
    root,
    env,
    args: ["--dry-run"],
    fetchFn: () => {
      throw new Error("Network forbidden");
    },
  };
  assert.deepEqual(await runIndexNow(options), [`${origin}/`]);
  const keyPath = path.join(root, "public", `${key}.txt`);
  await writeFile(keyPath, `${key}\n`);
  await assert.rejects(runIndexNow(options), /Expected exactly one/);
  await rm(keyPath);
  await assert.rejects(runIndexNow(options), /Expected exactly one/);
  await writeFile(keyPath, key);
  await writeFile(path.join(root, "public/another-valid-key.txt"), "another-valid-key");
  await assert.rejects(runIndexNow(options), /Expected exactly one/);
});

test("real workflow uses only mocked fetch: validates pages and payload, ignores noindex/404", async t => {
  const root = await fixture(
    t,
    sitemap([
      `${origin}/`,
      `${origin}/hidden`,
      `${origin}/missing`,
      `${origin}/redirect`,
      `${origin}/api/x`,
    ])
  );
  const posts = [];
  const fetchFn = async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    if (url.endsWith(`${key}.txt`)) return response(key);
    if (url === "https://api.indexnow.org/indexnow") {
      posts.push(JSON.parse(options.body));
      return response("", 202);
    }
    if (url.endsWith("/hidden"))
      return response(html, 200, { "content-type": "text/html", "x-robots-tag": "noindex" });
    if (url.endsWith("/missing")) return response("not found", 404);
    if (url.endsWith("/redirect")) return response("", 301);
    return response(html, 200, { "content-type": "text/html" });
  };
  assert.deepEqual(await runIndexNow({ root, env, args: [], fetchFn }), [`${origin}/`]);
  assert.deepEqual(posts, [
    { host: "neontattoo.xyz", key, keyLocation: `${origin}/${key}.txt`, urlList: [`${origin}/`] },
  ]);
  posts.length = 0;
  await runIndexNow({ root, env, args: ["--dry-run", "--online"], fetchFn });
  assert.equal(posts.length, 0);
});

test("retry transient HTTP/network errors; permanent errors do not retry", async () => {
  let calls = 0;
  const delays = [];
  await request(
    origin,
    {},
    {
      fetchFn: async () => {
        calls++;
        if (calls === 1) throw new Error("timeout");
        return response("", calls === 2 ? 429 : 200, { "retry-after": "1" });
      },
      sleep: async ms => delays.push(ms),
    }
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
  calls = 0;
  await assert.rejects(
    request(
      origin,
      {},
      {
        fetchFn: async () => {
          calls++;
          return response("", 403);
        },
      }
    ),
    /HTTP 403/
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    request(
      origin,
      {},
      {
        fetchFn: async () => {
          calls++;
          return response("", 503);
        },
        sleep: async () => {},
      }
    ),
    /HTTP 503/
  );
  assert.equal(calls, 3);
});

test("10,001 pages are submitted in batches of 10,000 and 1", async t => {
  const list = Array.from({ length: 10_001 }, (_, i) => `${origin}/page-${i}`);
  const root = await fixture(t, sitemap(list));
  const sizes = [];
  const fetchFn = async (url, options) => {
    if (url.endsWith(`${key}.txt`)) return response(key);
    if (url === "https://api.indexnow.org/indexnow") {
      sizes.push(JSON.parse(options.body).urlList.length);
      return response("");
    }
    return response(html, 200, { "content-type": "text/html" });
  };
  await runIndexNow({ root, env, args: [], fetchFn });
  assert.deepEqual(sizes, [10_000, 1]);
});

test("dynamic public sitemap fallback and streamed Next.js noindex metadata", async t => {
  const root = await fixture(t, "");
  await rm(path.join(root, "public/sitemap.xml"));
  const calls = [];
  const fetchFn = async (url, options) => {
    assert.notEqual(options.method, "POST");
    calls.push(url);
    if (url.endsWith(`${key}.txt`)) return response(key);
    if (url.endsWith("/sitemap.xml")) {
      return response(
        `<sitemapindex><sitemap><loc>${origin}/dynamic.xml</loc></sitemap></sitemapindex>`
      );
    }
    if (url.endsWith("/dynamic.xml"))
      return response(sitemap([`${origin}/`, `${origin}/streamed`]));
    return response(
      url.endsWith("/streamed") ? `${html}<meta name="robots" content="noindex">` : html,
      200,
      { "content-type": "text/html" }
    );
  };
  assert.deepEqual(await runIndexNow({ root, env, args: ["--dry-run", "--online"], fetchFn }), [
    `${origin}/`,
  ]);
  assert.ok(calls.includes(`${origin}/sitemap.xml`));
  assert.ok(calls.includes(`${origin}/dynamic.xml`));
});
