import { describe, expect, it } from "vitest";
import { toStaticPreviewHtml } from "./preview-html";

describe("toStaticPreviewHtml", () => {
  it("removes scripts without truncating HTML", () => {
    const html = '<!doctype html><html><head><link rel="modulepreload" href="/x.js"><script>throw new Error("boom")</script><script src="/x.js"></script></head><body onload="boom()"><h1>Hi</h1></body></html>';
    const preview = toStaticPreviewHtml(html);

    expect(preview).not.toMatch(/<script\b/i);
    expect(preview).not.toMatch(/modulepreload|\sonload=/i);
    expect(preview).toContain("<h1>Hi</h1>");
    expect(preview).toMatch(/<\/html>$/);
  });
});
