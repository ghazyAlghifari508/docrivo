import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { db, type DbClient } from "~/db"
import { users } from "~/db/schema-auth"
import { failure, type ActionResult } from "~/lib/errors"

/**
 * What a signed-in user is. Resolved from the session, never from a payload, for
 * the same reason the job queries derive their `userId` from the middleware
 * context: a client-supplied id would make every scope check advisory.
 */
export type ProfileUser = { id: string; email: string; name: string }

const MAX_NAME_LENGTH = 80

/**
 * A display name has to be printable and non-empty. The control-character rule is
 * the substantive one: a name is rendered into the header, the profile card and
 * the settings sidebar, and a raw control byte in there is a layout and
 * accessibility problem at best.
 */
export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return false
  // C0 controls plus DEL. Written as escapes rather than literals so the source
  // stays readable; `no-control-regex` is disabled for this one line because the
  // rule is the reason the pattern exists.
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001F\u007F]/.test(trimmed)
}

export async function readProfile(
  input: { userId: string },
  client: DbClient = db,
): Promise<ProfileUser | null> {
  const [row] = await client
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)

  return row ?? null
}

/**
 * Renames the session user's own row. Scoped by `id` from the session, so a
 * payload cannot reach another account, and it touches `name` only -- `email` is
 * owned by the Google identity provider and rewriting it here would let a
 * signed-in user change the address their account is keyed on.
 */
export async function renameProfile(
  input: { userId: string; name: string },
  client: DbClient = db,
): Promise<{ ok: true; name: string }> {
  const name = input.name.trim()

  if (!isValidDisplayName(name)) {
    throw new ProfileValidationError()
  }

  const updated = await client
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, input.userId))
    .returning({ name: users.name })

  if (updated.length === 0) throw new ProfileValidationError()

  return { ok: true, name: updated[0].name }
}

export class ProfileValidationError extends Error {
  readonly code = "invalid_name"
  constructor() {
    super("invalid_name")
    this.name = "ProfileValidationError"
  }
}

export const getProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProfileUser | null> => {
    // A signed-out visitor gets `null` rather than a 401: several public pages
    // render differently when signed in, and a redirect or an error there would
    // be wrong. The pages that require a session say so in their own guard.
    const { getRequestHeaders } = await import("@tanstack/react-start/server")
    const { resolveSession } = await import("~/auth/middleware")
    const session = await resolveSession(getRequestHeaders())
    if (!session?.user) return null
    return readProfile({ userId: session.user.id })
  },
)

export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => {
    if (typeof input?.name !== "string") throw new Error("name is required")
    return input
  })
  .handler(
    async ({ data, context }): Promise<ActionResult<{ name: string }>> => {
      const user = context.user
      if (!user) return failure("UNAUTHORIZED", "Masuk dengan Google dulu.")

      try {
        const result = await renameProfile({ userId: user.id, name: data.name })
        return { ok: true, name: result.name }
      } catch (error) {
        if (error instanceof ProfileValidationError) {
          return failure(
            "invalid_name",
            "Nama wajib 1-80 karakter dan tidak boleh berisi karakter kontrol.",
          )
        }
        throw error
      }
    },
  )
