// Midtrans Snap (sandbox) via REST — no midtrans-client dep, redirect flow so
// no Snap.js needed. Verification is poll-based (getTransactionStatus), so no
// webhook/tunnel is required for localhost.
//
// This is the only payment integration in the repository and it is server-only:
// the server key never leaves the process, and nothing here may be imported by a
// component. `createSnapTransaction` is reached through the `createPayment`
// server function in `src/queries/entitlements.ts`.

// Set MIDTRANS_PRODUCTION=true in prod env to hit live endpoints. Default sandbox.
const IS_PROD = process.env.MIDTRANS_PRODUCTION === "true";
const SNAP_URL = IS_PROD
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const STATUS_URL = IS_PROD ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2";
const TIMEOUT_MS = 20_000;

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY is not set");
  return key;
}

function authHeader() {
  // Basic auth: base64(serverKey + ":")
  return `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`;
}

function appUrl() {
  // `APP_URL` is what the rest of the app reads -- `src/auth/server.ts` builds
  // its OAuth callback from it. The `NEXT_PUBLIC_` prefix was a Next.js
  // convention and this is no longer Next; `NEXT_PUBLIC_APP_URL` stays as a
  // fallback so a deployment that sets only the old name still redirects to the
  // right place after payment.
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function createSnapTransaction(opts: {
  orderId: string;
  grossAmount: number;
  plan: string;
  userEmail: string;
}): Promise<string> {
  const res = await fetch(SNAP_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      transaction_details: { order_id: opts.orderId, gross_amount: opts.grossAmount },
      customer_details: { email: opts.userEmail },
      item_details: [
        { id: opts.plan, name: `Docrivo ${opts.plan}`, price: opts.grossAmount, quantity: 1 },
      ],
      callbacks: { finish: `${appUrl()}/pricing?order_id=${opts.orderId}` },
    }),
  });
  if (!res.ok) {
    throw new Error(`Midtrans create failed ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { redirect_url?: string };
  if (!json.redirect_url) throw new Error("Midtrans returned no redirect_url");
  return json.redirect_url;
}

/** Returns Midtrans transaction_status: pending | settlement | capture | deny | cancel | expire. */
export async function getTransactionStatus(orderId: string): Promise<string> {
  const res = await fetch(`${STATUS_URL}/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Midtrans status failed ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { transaction_status?: string };
  return json.transaction_status ?? "pending";
}
