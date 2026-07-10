type Query = Record<string, string | number | boolean | undefined>;

const TIMEOUT_MS = 30_000;

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

async function request<T>(path: string, init: RequestInit = {}, query?: Query): Promise<T> {
  const target = url(path, query);
  const res = await fetch(target, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      apikey: apiKey(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${target.pathname} failed ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export const insforge = {
  select<T>(table: string, query: Query = {}) {
    return request<T[]>(`/api/database/records/${table}`, {}, query);
  },
  maybeSingle<T>(table: string, query: Query = {}) {
    return request<T[]>(`/api/database/records/${table}`, {}, { ...query, limit: 1 }).then(
      (rows) => rows[0] ?? null,
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
      const res = await fetch(target, {
        method: "PUT",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${apiKey()}`, apikey: apiKey() },
        body: form,
      });
      if (!res.ok) throw new Error(`PUT ${target.pathname} failed ${res.status}: ${await res.text()}`);
      return (await res.json()) as { url?: string; key?: string };
    }

    const form = new FormData();
    for (const [k, v] of Object.entries(strategy.fields ?? {})) form.append(k, v);
    form.append("file", blob);
    const res = await fetch(strategy.uploadUrl!, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: form,
    });
    if (!res.ok) throw new Error(`POST upload strategy failed ${res.status}: ${await res.text()}`);
    return {
      key: strategy.key,
      url: `${baseUrl()}/api/storage/buckets/screenshots/objects/${encodeURIComponent(strategy.key!)}`,
    };
  },
};
