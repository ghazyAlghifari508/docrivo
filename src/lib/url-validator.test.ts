import { describe, it, expect } from "vitest";
import { isPrivateIp, normalizeUrl, parseAndValidateFormat } from "./url-validator";

describe("isPrivateIp", () => {
  it("blocks loopback", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.5.5.5")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });
  it("blocks 0.0.0.0 and unspecified", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });
  it("blocks private ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
  });
  it("does not block public 172 outside 16-31", () => {
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });
  it("blocks link-local and cloud metadata", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS/GCP metadata
    expect(isPrivateIp("169.254.0.1")).toBe(true);
  });
  it("blocks CGNAT 100.64/10", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });
  it("blocks IPv6 ULA, full fe80::/10 link-local, and mapped private IPv4", () => {
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fe90::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
  });
  it("allows public IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });
});

describe("parseAndValidateFormat", () => {
  it("accepts http and https", () => {
    expect(parseAndValidateFormat("https://example.com")).toBeInstanceOf(URL);
    expect(parseAndValidateFormat("http://example.com")).toBeInstanceOf(URL);
  });
  it("rejects other protocols", () => {
    expect(() => parseAndValidateFormat("file:///etc/passwd")).toThrow();
    expect(() => parseAndValidateFormat("ftp://x.com")).toThrow();
    expect(() => parseAndValidateFormat("javascript:alert(1)")).toThrow();
  });
  it("rejects garbage and empty", () => {
    expect(() => parseAndValidateFormat("not a url")).toThrow();
    expect(() => parseAndValidateFormat("")).toThrow();
  });
  it("rejects literal localhost hostname", () => {
    expect(() => parseAndValidateFormat("http://localhost:3000")).toThrow();
    expect(() => parseAndValidateFormat("http://LOCALHOST")).toThrow();
  });
  it("rejects a literal private IP host without DNS", () => {
    expect(() => parseAndValidateFormat("http://127.0.0.1")).toThrow();
    expect(() => parseAndValidateFormat("http://192.168.0.1")).toThrow();
    expect(() => parseAndValidateFormat("http://169.254.169.254")).toThrow();
  });
});

describe("normalizeUrl", () => {
  it("strips trailing slash and lowercases host", () => {
    expect(normalizeUrl(new URL("https://Example.com/"))).toBe(
      "https://example.com",
    );
  });
  it("keeps path but drops trailing slash", () => {
    expect(normalizeUrl(new URL("https://example.com/About/"))).toBe(
      "https://example.com/About",
    );
  });
  it("drops default ports", () => {
    expect(normalizeUrl(new URL("https://example.com:443/"))).toBe(
      "https://example.com",
    );
  });
});
