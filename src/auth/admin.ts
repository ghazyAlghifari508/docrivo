import { notFound } from "@tanstack/react-router"
import { adminAllowlist } from "./allowlist"

export function isAdminEmail(email: string): boolean {
  return adminAllowlist().includes(email.toLowerCase())
}

/**
 * Refuses a caller who is not an administrator by raising the router's
 * not-found payload, so a probe cannot tell `/admin` from a URL that does not
 * exist. The `throw` is load-bearing: `notFound()` *returns* its payload
 * unless asked to throw, and a bare `notFound()` in the body of these `if`s
 * would fall through and admit everyone.
 */
export function requireAdmin(sessionUser: { email: string } | null): void {
  if (!sessionUser) throw notFound()
  if (!isAdminEmail(sessionUser.email)) throw notFound()
}
