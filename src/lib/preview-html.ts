export function toStaticPreviewHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]+rel=["'](?:modulepreload|preload)["'][^>]*>/gi, "")
    .replace(/\s+on[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
