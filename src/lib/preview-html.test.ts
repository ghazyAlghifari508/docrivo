import { describe, expect, it } from "vitest";
import { toStaticPreviewHtml } from "./preview-html";

describe("toStaticPreviewHtml", () => {
  it("removes scripts without truncating HTML", () => {
    const html = '<!doctype html><html><head><link rel="modulepreload" href="/x.js"><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/x.css"><style>@font-face{font-family:x;src:url(x.woff2)}body{color:red;background:url(https://example.com/bg.svg)}</style><script>throw new Error("boom")</script><script src="/x.js"></script></head><body onload="boom()"><img src="https://example.com/a.svg" srcset="a 1x"><h1>Hi</h1></body></html>';
    const preview = toStaticPreviewHtml(html);

    expect(preview).not.toMatch(/<script\b/i);
    expect(preview).not.toMatch(/modulepreload|manifest|stylesheet|@font-face|https:\/\/example\.com|\sonload=|\ssrcset=/i);
    expect(preview).toContain('src="data:,"');
    expect(preview).toContain("body{color:red;");
    expect(preview).toContain("<h1>Hi</h1>");
    expect(preview).toMatch(/<\/html>$/);
  });
});
