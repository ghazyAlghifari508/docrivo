import http from "node:http";
import https from "node:https";
import { AppError } from "./errors";
import { rewritePreviewAssets } from "./preview-html";
import { validateUrl } from "./url-validator";

const MAX_HTML_BYTES = 5_000_000;
const MAX_ASSET_BYTES = 15_000_000;
const FETCH_TIMEOUT_MS = 25_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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
        headers: {
          Host: url.host,
          "User-Agent": BROWSER_UA,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
        },
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

export async function scrapeHtml(rawUrl: string, attemptNumber?: number) {
  const { url } = await validateUrl(rawUrl);
  // Render in a real browser so client-rendered sites (React/Next/Framer/GSAP)
  // yield full DOM + assets, not the empty pre-JS shell a raw fetch returns.
  const { renderPage, DESKTOP_VIEWPORT } = await import("./render-page");
  const rendered = await renderPage(url.href);
  const capturedAt = new Date().toISOString();
  const html = forceDesktopViewport(
    withBaseHref(await inlineStyles(rendered.html, rendered.finalUrl), rendered.finalUrl),
  );
  const previewHtml = rewritePreviewAssets(html, rendered.finalUrl);
  return {
    sourceUrl: rendered.finalUrl,
    status: rendered.status,
    html,
    previewHtml,
    metadata: {
      attempt: attemptNumber ?? 1,
      capturedAt,
      finalUrl: rendered.finalUrl,
      viewport: DESKTOP_VIEWPORT,
      captureMode: "desktop-browser",
      htmlBytes: Buffer.byteLength(html, "utf8"),
      previewHtmlBytes: Buffer.byteLength(previewHtml, "utf8"),
    },
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
        headers: {
          Host: url.host,
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
        },
        servername: url.hostname,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = res.headers["content-type"] ?? "";
        const location = res.headers.location;
        if (location && status >= 300 && status < 400) {
          res.resume();
          fetchHtml(new URL(location, url.href).href, redirects + 1).then(resolve, reject);
          return;
        }
        if (type && !/(?:text\/css|text\/html|application\/xhtml\+xml|application\/xml|text\/xml|text\/plain)/i.test(type)) {
          res.resume();
          reject(new AppError("NO_ANALYZABLE_CONTENT", "Konten bukan HTML/CSS."));
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

function htmlAttr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"));
  if (!match) return "";
  const value = match[1];
  return (value[0] === '"' || value[0] === "'" ? value.slice(1, -1) : value).replace(/&(amp|#38|#x26);/gi, "&");
}

export function stylesheetHrefs(html: string, pageUrl: string) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /(?:^|\s)stylesheet(?:\s|$)/i.test(htmlAttr(tag, "rel")))
    .flatMap((tag) => {
      try {
        const href = htmlAttr(tag, "href");
        return href ? [new URL(href, pageUrl).href] : [];
      } catch {
        return [];
      }
    })
    .slice(0, 8);
}

/** Inline external stylesheets so the standalone HTML previews with its real styles. */
export async function inlineStyles(html: string, pageUrl: string) {
  const styles = await Promise.all(stylesheetHrefs(html, pageUrl).map(async (href) => {
    try {
      const css = await fetchHtml(href);
      const safeHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      // ponytail: 512k holds a full Tailwind build (~300-400k). 120k chopped the
      // desktop @media breakpoints off the tail, so previews lost their layout.
      // Bump if a site ships a genuinely larger single sheet.
      return `<style data-docrivo-inline="${safeHref}">${css.html.slice(0, 512_000)}</style>`;
    } catch {
      return "";
    }
  }));
  return html.replace("</head>", `${styles.join("\n")}</head>`);
}

/**
 * Pin the layout viewport to desktop width. The site was captured at 1440px;
 * `width=device-width` makes the saved page re-evaluate its media queries at
 * whatever width it's later opened in (a phone, a narrow window) and collapse to
 * its mobile layout. `width=1440` keeps mobile browsers on the desktop layout.
 * Desktop browsers ignore this meta entirely — for them the preview iframe is
 * force-sized to 1440px and visually scaled instead (see scrape-detail.tsx).
 */
export const DESKTOP_WIDTH = 1440;
function forceDesktopViewport(html: string) {
  const tag = `<meta name="viewport" content="width=${DESKTOP_WIDTH}">`;
  if (/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\b[^>]*name=["']viewport["'][^>]*>/i, tag);
  }
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`;
}

/** Absolutize <base> so relative assets in the preview resolve against the source origin. */
export function withBaseHref(html: string, pageUrl: string) {
  const tag = `<base href="${new URL(pageUrl).href}">`;
  if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`;
}
