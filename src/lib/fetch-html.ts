import http from "node:http";
import https from "node:https";
import { AppError } from "./errors";
import { validateUrl } from "./url-validator";

const MAX_HTML_BYTES = 5_000_000;
const MAX_ASSET_BYTES = 15_000_000;
const FETCH_TIMEOUT_MS = 25_000;

/** SSRF-safe binary fetch for the preview asset proxy: pins to resolved IP, re-validates redirects, caps size. */
export async function fetchAsset(
  rawUrl: string,
  redirects = 0,
): Promise<{ body: Buffer; status: number; contentType: string }> {
  if (redirects > 3) throw new AppError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
  const { url, ip } = await validateUrl(rawUrl);
  const isHttps = url.protocol === "https:";
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: ip,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: FETCH_TIMEOUT_MS,
        headers: { Host: url.host, "User-Agent": "DocrivoBot/1.0", Accept: "*/*" },
        servername: url.hostname,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (location && status >= 300 && status < 400) {
          res.resume();
          fetchAsset(new URL(location, url.href).href, redirects + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_ASSET_BYTES) req.destroy(new AppError("NO_ANALYZABLE_CONTENT", "Asset terlalu besar."));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            status,
            contentType: res.headers["content-type"] ?? "application/octet-stream",
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new AppError("FETCH_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

export async function scrapeHtml(rawUrl: string) {
  const { normalized } = await validateUrl(rawUrl);
  const fetched = await fetchHtml(normalized);
  return {
    sourceUrl: normalized,
    status: fetched.status,
    html: withBaseHref(await inlineStyles(fetched.html, normalized), normalized),
  };
}

/**
 * SSRF-safe HTML fetch: validates URL, pins the connection to the resolved IP
 * (blocks DNS rebinding), re-validates every redirect hop, caps body size.
 */
export async function fetchHtml(rawUrl: string, redirects = 0): Promise<{ html: string; status: number }> {
  if (redirects > 3) throw new AppError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
  const { url, ip } = await validateUrl(rawUrl);
  const isHttps = url.protocol === "https:";
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: ip,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: FETCH_TIMEOUT_MS,
        headers: { Host: url.host, "User-Agent": "DocrivoBot/1.0" },
        servername: url.hostname,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (location && status >= 300 && status < 400) {
          res.resume();
          fetchHtml(new URL(location, url.href).href, redirects + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_HTML_BYTES) req.destroy(new AppError("NO_ANALYZABLE_CONTENT", "HTML terlalu besar."));
          else chunks.push(chunk);
        });
        res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), status }));
      },
    );
    req.on("timeout", () => req.destroy(new AppError("FETCH_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

/** Inline external stylesheets so the standalone HTML previews with its real styles. */
export async function inlineStyles(html: string, pageUrl: string) {
  const hrefs = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => new URL(m[1], pageUrl).href)
    .slice(0, 8);
  const styles = await Promise.all(hrefs.map(async (href) => {
    try {
      const css = await fetchHtml(href);
      return `<style data-docrivo-inline="${href}">${css.html.slice(0, 120_000)}</style>`;
    } catch {
      return "";
    }
  }));
  return html.replace("</head>", `${styles.join("\n")}</head>`);
}

/** Absolutize <base> so relative assets in the preview resolve against the source origin. */
export function withBaseHref(html: string, pageUrl: string) {
  const tag = `<base href="${new URL(pageUrl).href}">`;
  if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`;
}
