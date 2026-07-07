export function toStaticPreviewHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]+rel=["'][^"']*(?:modulepreload|preload|stylesheet|manifest)[^"']*["'][^>]*>/gi, "")
    .replace(/@font-face\s*{[^}]*}/gi, "")
    .replace(/url\((['"]?)(?!data:|blob:)[^)]+\1\)/gi, 'url("data:,")')
    .replace(/\s+srcset=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+src=("(?!data:|blob:)[^"]*"|'(?!data:|blob:)[^']*'|(?!data:|blob:)[^\s>]+)/gi, ' src="data:,"')
    .replace(/\s+poster=("(?!data:|blob:)[^"]*"|'(?!data:|blob:)[^']*'|(?!data:|blob:)[^\s>]+)/gi, "")
    .replace(/\s+on[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
