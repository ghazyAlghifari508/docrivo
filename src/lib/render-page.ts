import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { AppError } from "./errors";
import { fetchAsset } from "./fetch-html";
import { isPrivateIp } from "./url-validator";

// Real-browser render path. Raw HTTP + a bot UA only ever returned the pre-JS
// shell of modern sites (Next/React/Framer/GSAP), so previews came out tiny and
// asset-less and brand-new SPA URLs failed outright. A headless browser runs the
// page's JS, so the DOM, assets, and animations are actually present.

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

const NAV_TIMEOUT_MS = 35_000;
const IDLE_TIMEOUT_MS = 8_000;
const SETTLE_MS = 600;
const MAX_HTML_BYTES = 6_000_000;
const BLOCK_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--headless=chrome", "--proxy-auto-detect"] })
      .then((b) => {
        b.on("disconnected", () => {
          browserPromise = null;
        });
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

// Per-host DNS decision cache. A single crawled page fires 50-100 subresource
// requests, mostly to a handful of hosts — resolving each host once cuts the
// SSRF check from ~50 DNS lookups/page to a few. TTL bounds staleness.
const hostBlockCache = new Map<string, { blocked: boolean; at: number }>();
const HOST_CACHE_TTL_MS = 60_000;

/**
 * SSRF guard for browser subresource requests: block loopback / private / cloud
 * metadata targets (the top-level URL is already vetted by validateUrl upstream).
 * data:/blob: are allowed — they carry no network I/O, so there is no SSRF risk.
 */
export async function isBlockedRequestUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return true;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") return false;
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCK_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  if (isIP(host)) return isPrivateIp(host);

  const cached = hostBlockCache.get(host);
  if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS) return cached.blocked;
  let blocked: boolean;
  try {
    const addresses = await lookup(host, { all: true });
    blocked = !addresses.length || addresses.some(({ address }) => isPrivateIp(address));
  } catch {
    blocked = true;
  }
  hostBlockCache.set(host, { blocked, at: Date.now() });
  return blocked;
}

/** Attach the SSRF request filter to a context so every request is fetched by Node's IP-pinned proxy. */
export async function guardContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    class BlockedWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      CONNECTING = 0;
      OPEN = 1;
      CLOSING = 2;
      CLOSED = 3;
      binaryType = "blob";
      bufferedAmount = 0;
      extensions = "";
      protocol = "";
      readyState = BlockedWebSocket.CLOSED;
      url = "";
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      constructor(url: string | URL) {
        super();
        this.url = String(url);
        queueMicrotask(() => {
          const event = new CloseEvent("close", { code: 1006, reason: "WebSocket blocked in preview" });
          this.onclose?.(event);
          this.dispatchEvent(event);
        });
      }
      send() {}
      close() {}
    }
    class BlockedWorker extends EventTarget {
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      constructor() {
        super();
        queueMicrotask(() => {
          const event = new ErrorEvent("error", { message: "Worker blocked in preview" });
          this.onerror?.(event);
          this.dispatchEvent(event);
        });
      }
      postMessage() {}
      terminate() {}
    }
    Object.defineProperties(window, {
      WebSocket: { value: BlockedWebSocket, configurable: false },
      Worker: { value: BlockedWorker, configurable: false },
      SharedWorker: { value: BlockedWorker, configurable: false },
    });
  });
  await context.route("**/*", async (route) => {
    const req = route.request();
    const method = req.method();
    if (method !== "GET" && method !== "HEAD") return route.abort();
    if (await isBlockedRequestUrl(req.url())) return route.abort();
    try {
      const { body, status, contentType } = await fetchAsset(req.url());
      return route.fulfill({
        status,
        body: method === "HEAD" ? undefined : body,
        headers: { "Content-Type": contentType },
      });
    } catch {
      return route.abort();
    }
  });
}

/**
 * Scroll top→bottom→top to trigger lazy images and scroll-in animations, then
 * settle. Bounded by step count so an infinite-scroll page can't hang the
 * render. Returns to top so the serialized DOM/screenshot starts at the hero.
 */
async function autoScroll(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async () => {
    const step = 600;
    const delay = 100;
    const maxSteps = 60; // 60 × 600px = 36000px ceiling; enough for long pages
    await new Promise<void>((resolve) => {
      let steps = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        steps += 1;
        if (steps >= maxSteps || window.scrollY + window.innerHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, delay);
    });
  });
}

export type RenderedPage = { html: string; status: number; finalUrl: string };

/**
 * Render a URL in a real headless browser and return the fully-rendered HTML.
 * Runs the page's JS so client-rendered sites produce complete DOM + assets.
 */
export async function renderPage(url: string): Promise<RenderedPage> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
    userAgent: BROWSER_UA,
    locale: "en-US",
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
  });
  try {
    await guardContext(context);
    const page = await context.newPage();
    let status = 0;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      status = res?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS }).catch(() => {});
      // Scroll the whole page before reading the DOM: lazy-loaded images
      // (loading="lazy" / IntersectionObserver) and scroll-triggered entrance
      // animations only fire once their element enters the viewport. Without
      // this they serialize as unloaded <img> and opacity:0 elements.
      await autoScroll(page).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Navigation timed out but DOM may still be usable; fall through to read it.
    }
    const html = (await page.content().catch(() => "")).slice(0, MAX_HTML_BYTES);
    if (!html || html.length < 200) throw new AppError("NO_ANALYZABLE_CONTENT");
    return { html, status: status || 200, finalUrl: page.url() };
  } finally {
    await context.close();
  }
}
