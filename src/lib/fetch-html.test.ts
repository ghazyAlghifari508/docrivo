import { describe, expect, it } from "vitest";
import { withBaseHref } from "./fetch-html";

describe("withBaseHref", () => {
  it("replaces existing base so relative assets stay on source origin", () => {
    const html = '<html><head><base href="/"><link href="/style.css"></head><body></body></html>';

    expect(withBaseHref(html, "https://example.com/path/")).toContain('<base href="https://example.com/path/">');
  });
});
