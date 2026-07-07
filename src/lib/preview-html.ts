const SKIP_URL = /^(data:|blob:|about:|javascript:|mailto:|tel:|#)/i;
const RESOURCE_ATTRS = new Set(["src", "href", "poster", "data-src"]);
const RESOURCE_TAGS = new Set(["script", "link", "img", "source", "video", "audio", "iframe", "embed", "object", "track"]);

function proxied(rawUrl: string, base: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || SKIP_URL.test(trimmed)) return trimmed;
  try {
    const abs = new URL(trimmed, base).href;
    if (!/^https?:/i.test(abs)) return trimmed;
    return `/api/scrape/asset?url=${encodeURIComponent(abs)}`;
  } catch {
    return trimmed;
  }
}

function rewriteSrcset(value: string, base: string): string {
  return value
    .split(",")
    .map((part) => {
      const seg = part.trim();
      if (!seg) return "";
      const [url, ...descriptor] = seg.split(/\s+/);
      return [proxied(url, base), ...descriptor].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function rewriteTag(tag: string, base: string): string {
  const name = tag.match(/^<\/?\s*([a-z0-9:-]+)/i)?.[1]?.toLowerCase();
  if (!name || !RESOURCE_TAGS.has(name)) return tag;

  return tag
    .replace(/\s(?:crossorigin|integrity|nonce)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/\ssrcset=("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) => ` srcset="${rewriteSrcset(dq ?? sq ?? "", base)}"`)
    .replace(/\s(src|href|poster|data-src)=("([^"]*)"|'([^']*)')/gi, (match, attr, _q, dq, sq) => {
      if (!RESOURCE_ATTRS.has(attr.toLowerCase())) return match;
      return ` ${attr}="${proxied(dq ?? sq ?? "", base)}"`;
    });
}

function storageShim() {
  return `<script>(()=>{const noop={getItem(){return null},setItem(){},removeItem(){},clear(){},key(){return null},length:0};for(const k of["localStorage","sessionStorage"])try{window[k]}catch{Object.defineProperty(window,k,{value:noop})}try{document.cookie}catch{Object.defineProperty(document,"cookie",{get(){return""},set(){}})}})();</script>`;
}

/**
 * Rewrites every resource URL in scraped HTML to flow through the same-origin asset proxy
 * so images, fonts, stylesheets, and scripts load without CORS/crossorigin failures.
 * Keeps scripts so JS/CSS animations can run inside the sandboxed iframe.
 */
export function rewritePreviewAssets(html: string, base: string): string {
  const rewritten = html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, (tag) => rewriteTag(tag, base))
    .replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (_m, quote, url) => `url(${quote}${proxied(url, base)}${quote})`);

  return /<head[^>]*>/i.test(rewritten)
    ? rewritten.replace(/<head[^>]*>/i, (match) => `${match}${storageShim()}`)
    : `${storageShim()}${rewritten}`;
}
