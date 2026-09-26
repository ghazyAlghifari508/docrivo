import { adminAllowlist } from "./allowlist"

export function isAdminEmail(email: string): boolean {
  return adminAllowlist().includes(email.toLowerCase())
}
