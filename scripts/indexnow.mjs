import { readdir, readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;
const log = message => console.log(`[IndexNow] ${message}`);

async function readPublicKey(root) {
  const directory = path.join(root, "public");
  const keys = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
    const key = entry.name.slice(0, -4);
    if (
      KEY_PATTERN.test(key) &&
      (await readFile(path.join(directory, entry.name), "utf8")) === key
    ) {
      keys.push(key);
    }
  }
  if (keys.length !== 1) {
    throw new Error(
      "Expected exactly one public/<key>.txt file whose content matches its filename key (8–128 characters: a-z, A-Z, 0-9, hyphen)"
    );
  }
  return keys[0];
}

async function readDomain(root) {
  // The shared config is a plain constant; read it without requiring a TypeScript runtime.
  const config = await readFile(path.join(root, "src/lib/config.ts"), "utf8");
  const domain = config.match(
    /^export const DOMAIN_URL = (["'])(https?:\/\/[^"'\s]+)\1;?\s*$/m
  )?.[2];
  if (!domain) throw new Error("Expected a plain DOMAIN_URL string constant in src/lib/config.ts");
  return domain;
}

export function productionOrigin(env, domain) {
  for (const name of ["VERCEL_ENV", "VERCEL_TARGET_ENV", "CONTEXT", "DEPLOY_ENV"]) {
    if (env[name] && env[name] !== "production") throw new Error(`${name}: not production`);
  }
  if (env.NODE_ENV && !["production", "test"].includes(env.NODE_ENV)) {
    throw new Error("NODE_ENV: not production");
  }
  if (
    env.CF_PAGES &&
    (!env.CF_PAGES_PRODUCTION_BRANCH || env.CF_PAGES_BRANCH !== env.CF_PAGES_PRODUCTION_BRANCH)
  ) {
    throw new Error("Cloudflare Pages: production branch is not confirmed");
  }
  if (!domain) throw new Error("DOMAIN_URL is missing");
  const url = new URL(domain);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    /(^|[.-])(localhost|local|internal|test|invalid|example|preview|staging|dev)([.-]|$)/.test(
      host
    ) ||
    /\.(vercel\.app|netlify\.app|pages\.dev|amplifyapp\.com)$/.test(host)
  ) {
    throw new Error("DOMAIN_URL must be the root HTTPS URL of a public production domain");
  }
  return url.origin;
}

// Sitemap XML uses five named entities and numeric character references.
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()];
  });
}

export function parseSitemap(xml) {
  const clean = xml.replace(/<!--[\s\S]*?-->/g, "");
  const match = clean.match(/<([\w-]+:)?(sitemapindex|urlset)\b/i);
  const root = match?.[2].toLowerCase();
  if (!root || /<!DOCTYPE|<!ENTITY/i.test(clean)) throw new Error("Invalid sitemap XML");
  const tag = root === "sitemapindex" ? "sitemap" : "url";
  const prefix = match[1] || "";
  const entries = [
    ...clean.matchAll(
      new RegExp(`<${prefix}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${prefix}${tag}\\s*>`, "gi")
    ),
  ];
  const locations = entries.map(([, entry]) => {
    const loc = entry.match(
      new RegExp(`<${prefix}loc\\b[^>]*>([\\s\\S]*?)<\\/${prefix}loc\\s*>`, "i")
    )?.[1];
    if (!loc) throw new Error("Missing loc in sitemap");
    const value = loc.trim();
    return value.startsWith("<![CDATA[") && value.endsWith("]]>")
      ? value.slice(9, -3).trim()
      : decode(value);
  });
  return { index: root === "sitemapindex", locations };
}

export function pageUrl(value, origin) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.hash ||
      /(?:^|\/)(?:api|admin|administrator|_next|_vercel|internal|private|dashboard|login|logout|signin|signup|auth|account|404|500)(?:\/|$)/i.test(
        pathname
      ) ||
      /\.(?:xml|txt|json|js|css|map|png|jpe?g|gif|svg|webp|ico|pdf|woff2?)$/i.test(pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      ([, name, double, single, bare]) => [name.toLowerCase(), decode(double ?? single ?? bare)]
    )
  );
}

export function indexable(html, headers, url) {
  if (/\b(noindex|none)\b/i.test(headers.get("x-robots-tag") || "")) return false;
  // Ignore scripts/comments so strings inside application code are not treated as metadata.
  // Next.js can stream metadata after </head>, so inspect the whole document.
  const markup = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const [tag] of markup.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (
      /^<meta\b/i.test(tag) &&
      /^(robots|bingbot|indexnow)$/i.test(attrs.name || "") &&
      /\b(noindex|none)\b/i.test(attrs.content || "")
    )
      return false;
    if (/^<link\b/i.test(tag) && /\bcanonical\b/i.test(attrs.rel || "") && attrs.href) {
      try {
        if (new URL(attrs.href, url).href !== url) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

export async function request(
  url,
  options = {},
  { fetchFn = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryAfter = 0;
    try {
      // Consume the body inside the timeout too; redirects cannot silently change hosts.
      const response = await fetchFn(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.text();
      if (response.ok) return { body, headers: response.headers, status: response.status };
      const error = new Error(`HTTP ${response.status}: ${url}`);
      error.permanent = ![408, 425, 429, 500, 502, 503, 504].includes(response.status);
      const retry = response.headers.get("retry-after");
      retryAfter = /^\d+$/.test(retry || "")
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry || "") - Date.now()) || 0;
      throw error;
    } catch (error) {
      if (error.permanent || attempt === 2) throw error;
      const delay = Math.min(Math.max(1000 * 2 ** attempt, retryAfter), 10_000);
      log(`Temporary error (${error.message}); retry ${attempt + 1}/2 in ${delay} ms`);
      await sleep(delay);
    }
  }
}

async function optionalFile(filename) {
  try {
    return await readFile(filename, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

async function localSitemap(url, root) {
  const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  // URL paths must stay inside these output directories.
  if (pathname.split(/[\\/]/).some(part => part === "..")) return null;
  for (const filename of [
    path.join(root, ".next/server/app", `${pathname}.body`),
    path.join(root, "out", pathname),
    path.join(root, "public", pathname),
  ]) {
    const content = await optionalFile(filename);
    if (content !== null) return content;
  }
  return null;
}

export async function collectUrls(origin, { root, offline, get }) {
  const visited = new Set();
  const urls = new Set();
  async function visit(location, depth = 0) {
    const url = new URL(location);
    if (url.origin !== origin || url.username || url.password || url.hash) {
      log(`Skipped external/invalid sitemap: ${location}`);
      return;
    }
    if (visited.has(url.href)) return;
    if (depth > 20 || visited.size >= 1000) throw new Error("Nested sitemap limit exceeded");
    visited.add(url.href);
    let xml = await localSitemap(url.href, root);
    if (xml === null) {
      if (offline) throw new Error(`No local ${url.pathname}; run build or dry-run --online`);
      xml = (await get(url.href)).body;
    }
    const parsed = parseSitemap(xml);
    for (const loc of parsed.locations) {
      if (parsed.index) await visit(loc, depth + 1);
      else {
        const candidate = pageUrl(loc, origin);
        if (candidate) urls.add(candidate);
      }
    }
  }
  await visit(`${origin}/sitemap.xml`);
  return [...urls];
}

export async function runIndexNow({
  env = process.env,
  root = ROOT,
  args = process.argv.slice(2),
  fetchFn = fetch,
  sleep,
} = {}) {
  if (
    args.some(arg => !["--dry-run", "--online"].includes(arg)) ||
    (args.includes("--online") && !args.includes("--dry-run"))
  ) {
    throw new Error("Options: --dry-run [--online]");
  }
  const dryRun = args.includes("--dry-run") || env.INDEXNOW_DRY_RUN === "1";
  const offline = dryRun && !args.includes("--online");
  const origin = productionOrigin(env, await readDomain(root));
  const key = await readPublicKey(root);
  const keyLocation = `${origin}/${key}.txt`;
  const get = url => request(url, {}, { fetchFn, sleep });
  if (!offline) {
    if ((await get(keyLocation)).body !== key) {
      throw new Error(
        "Public key file does not match the local file; run pnpm indexnow after deployment"
      );
    }
    log("Public key file verified");
  }
  const candidates = await collectUrls(origin, { root, offline, get });
  const accepted = new Set();
  // Validate the actual HTML, including noindex and canonical, with bounded concurrency.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const url = candidates[cursor++];
        try {
          let page;
          if (offline) {
            const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+|\/+$/g, "");
            if (pathname.split(/[\\/]/).includes("..")) continue;
            const body =
              (await optionalFile(
                path.join(root, ".next/server/app", `${pathname || "index"}.html`)
              )) ?? (await optionalFile(path.join(root, "out", `${pathname || "index"}.html`)));
            if (body === null) {
              log(`No local HTML, page skipped: ${url}`);
              continue;
            }
            page = { body, headers: new Headers({ "content-type": "text/html" }) };
          } else page = await get(url);
          if (
            !/\btext\/html\b/i.test(page.headers.get("content-type") || "") ||
            !indexable(page.body, page.headers, url)
          ) {
            log(`Non-indexable page skipped: ${url}`);
            continue;
          }
          accepted.add(url);
        } catch (error) {
          log(`Page skipped: ${url} (${error.message})`);
        }
      }
    })
  );
  const urls = [...accepted].sort();
  log(
    `${dryRun ? "DRY-RUN: " : ""}${urls.length} verified URLs out of ${candidates.length} candidates; host=${new URL(origin).hostname}`
  );
  if (dryRun) {
    log(
      offline
        ? "No network requests; local sitemap, HTML and key checked. Public headers were not checked."
        : "Public pages and key checked; POST disabled."
    );
    for (const url of urls) log(url);
    return urls;
  }
  for (let start = 0; start < urls.length; start += 10_000) {
    const urlList = urls.slice(start, start + 10_000);
    const response = await request(
      ENDPOINT,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: new URL(origin).hostname, key, keyLocation, urlList }),
      },
      { fetchFn, sleep }
    );
    log(
      `Batch ${Math.floor(start / 10_000) + 1}: ${urlList.length} URL, HTTP ${response.status}${response.status === 202 ? " (key validation pending)" : ""}`
    );
  }
  return urls;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runIndexNow();
  } catch (error) {
    // IndexNow is best effort: a missing deployment must never fail a successful build.
    log(`Submission skipped: ${error.message}. Run pnpm indexnow after deployment.`);
  }
}
