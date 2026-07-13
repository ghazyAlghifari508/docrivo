type Query = Record<string, string | number | boolean | undefined>;

// ponytail: 10s is enough for PostgREST / auth responses under normal load.
// On a nano instance under memory pressure PostgREST recovers within seconds
// or not at all — waiting 30s just wastes the client's time.
const TIMEOUT_MS = 10_000;

function baseUrl() {
  return process.env.INSFORGE_URL!;
}

function apiKey() {
  return process.env.INSFORGE_API_KEY!;
}

function url(path: string, query?: Query) {
  const u = new URL(path, baseUrl());
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u;
}

// AbortSignal.timeout rejects with a DOMException whose `.message` is a getter
// with no setter. If it escapes into Next.js's error normalizer (which
// reassigns `.message`) the server crashes with "Cannot set property message …
// which has only a getter". Convert to a plain, transient-classified Error
// (isTransient matches `failed 504`) so callers can retry and the framework can
// serialise it. Wraps every timed fetch in this module.
async function timedFetch(target: URL | string, init: RequestInit): Promise<Response> {
  const method = init.method ?? "GET";
  const label = typeof target === "string" ? target : target.pathname;
  try {
    return await fetch(target, { signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS), ...init });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${method} ${label} failed 504: timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

async function request<T>(path: string, init: RequestInit = {}, query?: Query): Promise<T> {
  const target = url(path, query);
  const res = await timedFetch(target, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      apikey: apiKey(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<body unreadable>");
    throw new Error(`${init.method ?? "GET"} ${target.pathname} failed ${res.status}: ${body}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export const insforge = {
  select<T>(table: string, query: Query = {}) {
    return request<T[]>(`/api/database/records/${table}`, {}, query);
  },
  maybeSingle<T>(table: string, query: Query = {}) {
    return request<T[]>(`/api/database/records/${table}`, {}, { ...query, limit: 1 }).then(
      // rows can be null on a 204 (no body) — guard so we don't crash on null[0].
      (rows) => rows?.[0] ?? null,
    );
  },
  insert<T>(table: string, rows: Record<string, unknown>[], select = "*") {
    return request<T[]>(
      `/api/database/records/${table}`,
      { method: "POST", body: JSON.stringify(rows) },
      { select },
    );
  },
  update<T>(table: string, match: Query, patch: Record<string, unknown>, select = "*") {
    const filters = Object.fromEntries(
      Object.entries(match).map(([k, v]) => [k, `eq.${String(v)}`]),
    );
    return request<T[]>(
      `/api/database/records/${table}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      { ...filters, select },
    );
  },
  delete(table: string, match: Query, select = "*") {
    const filters = Object.fromEntries(Object.entries(match).map(([k, v]) => [k, `eq.${String(v)}`]));
    return request(`/api/database/records/${table}`, { method: "DELETE" }, { ...filters, select });
  },

  rpc<T>(fn: string, args?: Record<string, unknown>) {
    return request<T>(`/api/database/rpc/${fn}`, {
      method: "POST",
      body: JSON.stringify(args ?? {}),
    });
  },
  async uploadScreenshot(key: string, blob: Blob) {
    const strategy = await request<{
      method: "direct" | "presigned";
      uploadUrl?: string;
      key?: string;
      fields?: Record<string, string>;
    }>(
      "/api/storage/buckets/screenshots/upload-strategy",
      {
        method: "POST",
        body: JSON.stringify({ filename: key, contentType: blob.type, size: blob.size }),
      },
    );

    if (strategy.method === "direct") {
      const form = new FormData();
      form.append("file", blob);
      const target = url(`/api/storage/buckets/screenshots/objects/${encodeURIComponent(key)}`);
      const res = await timedFetch(target, {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiKey()}`, apikey: apiKey() },
        body: form,
      });
      if (!res.ok) throw new Error(`PUT ${target.pathname} failed ${res.status}: ${await res.text()}`);
      return (await res.json()) as { url?: string; key?: string };
    }

    const form = new FormData();
    for (const [k, v] of Object.entries(strategy.fields ?? {})) form.append(k, v);
    form.append("file", blob);
    const res = await timedFetch(strategy.uploadUrl!, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`POST upload strategy failed ${res.status}: ${await res.text()}`);
    return {
      key: strategy.key,
      url: `${baseUrl()}/api/storage/buckets/screenshots/objects/${encodeURIComponent(strategy.key!)}`,
    };
  },
};
