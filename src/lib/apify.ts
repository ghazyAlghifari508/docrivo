import { AppError } from "./errors";

/**
 * Fetch short-lived Apify token from InsForge auth bridge.
 */
async function getApifyToken(): Promise<string> {
  const baseUrl = process.env.INSFORGE_URL;
  const adminKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !adminKey) throw new AppError("WEBSITE_BLOCKED", "Apify konfigurasi belum lengkap.");

  const res = await fetch(`${baseUrl}/api/webscraper/apify/token`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AppError("WEBSITE_BLOCKED", `Gagal autentikasi Apify (${res.status}).`);
  const json = await res.json() as Record<string, string>;
  return json.accessToken ?? json.token ?? json.access_token ?? "";
}

/**
 * Scrape a URL using Apify's Ultimate Scraper (auto cheerio/puppeteer based on content).
 * Falls back to the Apify Puppeteer Scraper if no HTML is returned.
 * Returns rendered HTML (JS-executed) and optional screenshot.
 */
export async function apifyScrape(
  url: string,
): Promise<{ html: string; screenshotUrl?: string }> {
  const token = await getApifyToken();
  const actorId = "apify~ultimate-scraper";

  // Start actor run
  const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      runInput: {
        runMode: "DEVELOPMENT",
        startUrls: [{ url }],
        pageLoadTimeoutSecs: 60,
        useChrome: true,
        screenshot: true,
        proxyConfiguration: { useApifyProxy: true },
      },
    }),
  });
  if (!runRes.ok) {
    const body = await runRes.text().catch(() => "");
    throw new AppError("WEBSITE_BLOCKED", `Apify gagal menjalankan: ${runRes.status} ${body.slice(0, 200)}`);
  }
  const runData = (await runRes.json()) as { data: { id: string; defaultDatasetId: string; status: string } };
  const runId = runData.data.id;
  const datasetId = runData.data.defaultDatasetId;

  // Poll for completion (max 90s)
  let status: string;
  const deadline = Date.now() + 90_000;
  do {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const statusData = (await statusRes.json()) as { data: { status: string } };
    status = statusData.data.status;
  } while (status === "RUNNING" && Date.now() < deadline);

  if (status !== "SUCCEEDED") {
    throw new AppError("WEBSITE_BLOCKED", `Apify gagal: ${status}. Coba lagi.`);
  }

  // Fetch dataset items
  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!itemsRes.ok) {
    throw new AppError("WEBSITE_BLOCKED", "Gagal mengambil hasil Apify.");
  }
  const items = (await itemsRes.json()) as Array<Record<string, unknown>>;
  const first = items?.[0];
  if (!first) throw new AppError("NO_ANALYZABLE_CONTENT", "Apify tidak menghasilkan konten.");

  return {
    html: (first.html ?? first.text ?? first.content ?? "") as string,
    screenshotUrl: first.screenshotUrl as string | undefined,
  };
}
