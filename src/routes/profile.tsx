import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/profile")({
  // AUTH NOT ENFORCED. The deleted page called `requireUser()` from
  // `src/lib/dal` (removed in Task 3.1) and redirected to /login. Task 7.3 adds
  // the root loader that resolves the session once per request; that is where
  // the `beforeLoad` guard belongs. Until then `loadProfile` resolves the
  // identity itself and renders the signed-out state rather than redirecting.
  // Optional keys: see the note in `index.tsx` on why a non-optional key here
  // would make `search` mandatory on every link to /profile.
  validateSearch: (
    search: Record<string, unknown>,
  ): { updated?: string; error?: string } => {
    const updated = typeof search.updated === "string" ? search.updated : undefined
    const error = typeof search.error === "string" ? search.error : undefined
    return {
      ...(updated === undefined ? {} : { updated }),
      ...(error === undefined ? {} : { error }),
    }
  },
  loader: loadProfile,
  head: () => ({
    meta: [
      { title: "Profile - Docrivo" },
      { name: "description", content: "Profile pengguna Docrivo." },
    ],
  }),
  component: ProfilePage,
})

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { ArrowRight, CheckCircle, GearSix, SignOut, UserCircle, Warning } from "@phosphor-icons/react";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { signOut } from "~/auth/client";
import { getProfile, updateProfile } from "~/queries/profile";

/**
 * The identity is the session user's own `users` row, read by `getProfile`.
 * `null` is a signed-out visitor, which the page renders as an explicit
 * signed-out state rather than as a blank name -- the deleted page's placeholder
 * string made a logged-out visitor look like an account called "Pengguna
 * Docrivo".
 */
async function loadProfile() {
  const user = await getProfile({ data: undefined }).catch(() => null)
  return { user }
}

const SIGNED_OUT = { id: "", email: "", name: "Belum masuk" } as const


export function ProfilePage() {
  const { user } = Route.useLoaderData()
  const params = Route.useSearch()
  const navigate = useNavigate()
  const identity = user ?? SIGNED_OUT
  const name = identity.name

  // Same substitution as `site-header.tsx`: the Next version posted to a
  // `signOut` server action, which no longer exists. `src/auth/client.ts`
  // already exports the Better Auth equivalent.
  const handleSignOut = useCallback(async () => {
    await signOut();
    void navigate({ to: "/" });
  }, [navigate]);

  const handleSave = useCallback(async (form: FormData) => {
    const displayName = form.get("name");
    const result = await updateProfile({
      data: { name: typeof displayName === "string" ? displayName : "" },
    });

    if (!result.ok) {
      void navigate({ to: "/profile", search: { error: result.error.code } });
      return;
    }
    void navigate({ to: "/profile", search: { updated: "1" } });
  }, [navigate]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className="page-shell py-14">
          <header className="mb-8">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Profile</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
              Kelola identitas <span className="emph">akun</span>.
            </h1>
            <p className="mt-3 max-w-xl text-body-sm leading-7 text-muted">
              Data ini berasal langsung dari akun InsForge/Google kamu, bukan data dummy.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-cards border border-ink bg-cream p-6 shadow-hard-xl">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-buttons border border-ink bg-lime-sprint shadow-hard">
                  <UserCircle size={25} weight="fill" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-title font-semibold text-ink">Informasi profile</h2>
                  <p className="mt-1 text-body-sm leading-7 text-muted">
                    Nama bisa kamu ubah. Email dan User ID dibuat oleh sistem auth.
                  </p>
                </div>
              </div>

              {params.updated ? (
                <p role="status" className="mt-5 inline-flex items-center gap-2 rounded-buttons border border-ink bg-paper-white px-3 py-2 text-caption font-medium text-mint-edge shadow-hard">
                  <CheckCircle size={16} weight="fill" aria-hidden="true" /> Profile berhasil disimpan.
                </p>
              ) : null}
              {params.error ? (
                <p role="alert" className="mt-5 inline-flex items-center gap-2 rounded-buttons border border-red-300 bg-red-50 px-3 py-2 text-caption font-medium text-red-700">
                  <Warning size={16} weight="fill" aria-hidden="true" /> {params.error === "invalid_name" ? "Nama wajib 1-80 karakter dan tidak boleh berisi karakter kontrol." : "Profile gagal disimpan. Coba lagi."}
                </p>
              ) : null}

              {/* `updateProfile` is a server function, not a form action: it
                  validates the name server-side and reports which rule it broke,
                  so the form only has to hand over the raw string. */}
              <form
                className="mt-6 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave(new FormData(event.currentTarget));
                }}
              >
                <label className="block">
                  <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Nama tampilan</span>
                  <input
                    name="name"
                    defaultValue={name}
                    maxLength={80}
                    required
                    className="mt-2 h-12 w-full rounded-buttons border border-ink bg-paper-white px-4 text-body-sm text-ink outline-none shadow-hard placeholder:text-muted-gray focus:ring-2 focus:ring-lime-sprint"
                  />
                </label>

                <ReadonlyField label="Email" value={identity.email} />
                <ReadonlyField label="User ID" value={identity.id} mono />

                <button
                  type="submit"
                  disabled={!user}
                  className="pressable inline-flex h-12 items-center justify-center rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-semibold text-ink shadow-hard disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Simpan profile
                </button>
              </form>
            </section>

            <aside className="space-y-4">
              <div className="rounded-cards border border-ink bg-paper-white p-5 shadow-hard">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Akun aktif</p>
                <p className="mt-3 text-title font-semibold text-ink">{name}</p>
                <p className="mt-1 truncate text-body-sm text-muted">{identity.email}</p>
              </div>

              <Link to="/setting" className="pressable flex items-center justify-between rounded-cards border border-ink bg-paper-white p-4 text-body-sm font-medium text-ink shadow-hard">
                <span className="inline-flex items-center gap-2"><GearSix size={17} weight="fill" aria-hidden="true" /> Buka setting</span>
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link to="/history" className="pressable flex items-center justify-between rounded-cards border border-ink bg-paper-white p-4 text-body-sm font-medium text-ink shadow-hard">
                Lihat history <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link to="/pricing" className="pressable flex items-center justify-between rounded-cards border border-ink bg-paper-white p-4 text-body-sm font-medium text-ink shadow-hard">
                Kelola paket <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="pressable flex w-full items-center justify-center gap-2 rounded-buttons border border-ink bg-cream px-5 py-3 text-body-sm font-semibold text-ink shadow-hard"
              >
                <SignOut size={17} weight="fill" aria-hidden="true" /> Keluar
              </button>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function ReadonlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">{label}</p>
      <p className={`mt-2 rounded-buttons border border-rule bg-paper-white px-4 py-3 text-body-sm text-ink ${mono ? "font-mono break-all" : ""}`}>
        {value}
      </p>
    </div>
  );
}
