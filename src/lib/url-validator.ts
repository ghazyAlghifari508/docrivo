import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "./errors";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/** True if an IP literal is loopback / private / link-local / CGNAT / cloud-metadata. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return false; // not an IP literal; caller resolves DNS separately
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255))
    return true; // malformed → treat as unsafe
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true; // loopback / unspecified

  const first = Number.parseInt(s.split(":")[0] || "0", 16);
  if (first >= 0xfe80 && first <= 0xfebf) return true; // link-local fe80::/10
  if (first >= 0xfc00 && first <= 0xfdff) return true; // unique local fc00::/7

  // IPv4-mapped ::ffff:a.b.c.d or ::ffff:7f00:1
  if (s.includes("::ffff:")) {
    const tail = s.split("::ffff:")[1];
    if (tail.includes(".")) return isPrivateIPv4(tail);
    const parts = tail.split(":").map((x) => Number.parseInt(x || "0", 16));
    const [hi, lo] = parts.length >= 2 ? parts.slice(-2) : [0, parts[0] ?? 0];
    const mapped = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateIPv4(mapped);
  }
  return false;
}

/** Sync front gate: protocol + obvious-host checks. Throws AppError on failure. */
export function parseAndValidateFormat(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError("INVALID_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("PRIVATE_URL_BLOCKED");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new AppError("PRIVATE_URL_BLOCKED");
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new AppError("PRIVATE_URL_BLOCKED");
  }
  return url;
}

/** Normalized string: lowercase host, no default port, no trailing slash. */
export function normalizeUrl(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? ":" + url.port : ""}${path}${url.search}`;
}

/**
 * Full async validation: format gate + DNS resolve, reject if the resolved
 * address is private. This is the SSRF barrier (PRD §14, AC-3.2).
 */
export async function validateUrl(
  raw: string,
): Promise<{ url: URL; normalized: string; ip: string }> {
  const url = parseAndValidateFormat(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let ip = host;
  if (!isIP(host)) {
    try {
      const addresses = await lookup(host, { all: true });
      if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
        throw new AppError("PRIVATE_URL_BLOCKED");
      }
      ip = addresses[0].address;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("WEBSITE_BLOCKED");
    }
  }
  if (isPrivateIp(ip)) {
    throw new AppError("PRIVATE_URL_BLOCKED");
  }
  return { url, normalized: normalizeUrl(url), ip };
}
