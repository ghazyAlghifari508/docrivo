import { describe, expect, it } from "vitest";
import { stylesheetHrefs, withBaseHref } from "./fetch-html";

describe("withBaseHref", () => {
  it("replaces existing base so relative assets stay on source origin", () => {
    const html = '<html><head><base href="/"><link href="/style.css"></head><body></body></html>';

    expect(withBaseHref(html, "https://example.com/path/")).toContain('<base href="https://example.com/path/">');
  });
});

describe("stylesheetHrefs", () => {
  it("finds stylesheets regardless of attr order or quote style", () => {
    const html = `<head><link href=/a.css rel=stylesheet><link rel="preload" href="/skip.css"><link href='./b.css' rel='stylesheet preload'></head>`;

    expect(stylesheetHrefs(html, "https://example.com/docs/")).toEqual([
      "https://example.com/a.css",
      "https://example.com/docs/b.css",
    ]);
  });
});
