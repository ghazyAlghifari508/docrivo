/**
 * A target is internal when it starts with a slash that is not itself the start
 * of a `//` authority or a `/\` one. The original InsForge guard read this as
 * `startsWith("/") && !startsWith("//")`, which is the same rule: the leading
 * slash is mandatory, and the character after it decides whether the rest of the
 * string is a path or a host.
 */
const INTERNAL = /^\/(?![/\\])/

/**
 * C0 controls, DEL, and the two Unicode line terminators. Tab, CR and LF are
 * deleted rather than encoded by the URL parser, so `"/\t/evil.example"` reads as
 * an internal path and resolves to `//evil.example`; the rest cannot survive a
 * round trip through a `Location` header intact.
 */
const CONTROLLED = /[\u0000-\u001f\u007f\u2028\u2029]/

/**
 * Returns `target` when it is a same-site path, and `null` when it is absent or
 * not provably one.
 *
 * `null` rather than a `"/"` fallback, unlike the original: a rejected target
 * that silently became the site root still bounced a freshly authenticated user
 * somewhere the attacker chose the *timing* of, and `null` forces the caller to
 * decide. Never throws, so no input can turn a rejected redirect into a 500.
 */
export function safeNext(target: string | null | undefined): string | null {
  if (!target) return null
  if (CONTROLLED.test(target)) return null
  if (!INTERNAL.test(target)) return null
  return target
}
