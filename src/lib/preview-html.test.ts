import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "./preview-html";

describe("rewritePreviewAssets", () => {
  it("proxies assets/scripts/styles without truncating HTML", () => {
    const html = '<!doctype html><html><head><base href="/"><link rel="stylesheet" href="/x.css" crossorigin><style>body{background:url(https://example.com/bg.svg)}</style><script src="/x.js" integrity="abc"></script></head><body onload="boom()"><img src="/a.svg" srcset="/a.svg 1x, /b.svg 2x"><h1>Hi</h1></body></html>';
    const preview = rewritePreviewAssets(html, "https://example.com/docs/");

    expect(preview).not.toMatch(/<base\b|crossorigin|integrity/i);
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fx.css');
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fx.js');
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fa.svg 1x');
    expect(preview).toContain('url(/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fbg.svg)');
    expect(preview).toContain("<script");
    expect(preview).toContain("<h1>Hi</h1>");
    expect(preview).toMatch(/<\/html>$/);
  });
});
