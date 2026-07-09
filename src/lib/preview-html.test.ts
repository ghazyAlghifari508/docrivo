import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "./preview-html";

describe("rewritePreviewAssets", () => {
  it("proxies assets/scripts/styles without truncating HTML", () => {
    const html = `<!doctype html><html><head><base href="/"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; img-src https:"><link rel="stylesheet" href=/x.css crossorigin><link rel="preload" as="image" imageSrcSet="/hero.png 1x, /hero@2x.png 2x"><style data-docrivo-inline="https://example.com/css/app.css">body{background:url(./bg.svg)}</style><script src=/x.js integrity="abc"></script></head><body onload="boom()"><img src="/_next/image?url=%2Fhero.png&amp;w=3840&amp;q=100"><img src="/a.svg" srcset="/a.svg 1x, /b.svg 2x"><h1>Hi</h1></body></html>`;
    const preview = rewritePreviewAssets(html, "https://example.com/docs/");

    expect(preview).not.toMatch(/<base\b|http-equiv="Content-Security-Policy"|crossorigin|integrity/i);
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fx.css');
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fx.js');
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fa.svg 1x');
    expect(preview).toContain('imageSrcSet="/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fhero.png 1x');
    expect(preview).toContain('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2F_next%2Fimage%3Furl%3D%252Fhero.png%26w%3D3840%26q%3D100');
    expect(preview).toContain('url(/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fcss%2Fbg.svg)');
    expect(preview).toContain("<script");
    expect(preview).toContain("<h1>Hi</h1>");
    expect(preview).toMatch(/<\/html>$/);
  });
});
