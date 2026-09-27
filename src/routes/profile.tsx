import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/profile")({
  // AUTH NOT ENFORCED. The deleted page called `requireUser()` from
  // `src/lib/dal` (removed in Task 3.1) and redirected to /login. Task 7.3 adds
  // the root loader that resolves the session once per request; that is where
  // the `beforeLoad` guard belongs. Until then this route renders for anyone.
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

// TODO(Task 4.3): the deleted page read the session with `requireUser()` from
// `src/lib/dal`. Task 4.3 adds the `updateProfile` server function and Task 7.3
// adds the root loader, and between them this placeholder is replaced by the
// real `id` / `email` / `name`. `updateProfile` was a server action
// (`src/lib/auth-actions.ts`, deleted in Task 3.1); the form below therefore has
// no action and its submit is inert until that task lands.
const user = { id: "", email: "", name: "Pengguna Docrivo" } as {
  id: string;
  email: string;
  name: string;
};


export function ProfilePage() {
  const params = Route.useSearch();
  const navigate = useNavigate();
  const name = user.name;

  // Same substitution as `site-header.tsx`: the Next version posted to a
  // `signOut` server action, which no longer exists. `src/auth/client.ts`
  // already exports the Better Auth equivalent.
  const handleSignOut = useCallback(async () => {
    await signOut();
    void navigate({ to: "/" });
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

              {/* TODO(Task 4.3): point `action` at the `updateProfile` server
                  function. Until then the submit reloads the page and nothing is
                  persisted. */}
              <form className="mt-6 space-y-5">
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

                <ReadonlyField label="Email" value={user.email} />
                <ReadonlyField label="User ID" value={user.id} mono />

                <button className="pressable inline-flex h-12 items-center justify-center rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-semibold text-ink shadow-hard">
                  Simpan profile
                </button>
              </form>
            </section>

            <aside className="space-y-4">
              <div className="rounded-cards border border-ink bg-paper-white p-5 shadow-hard">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Akun aktif</p>
                <p className="mt-3 text-title font-semibold text-ink">{name}</p>
                <p className="mt-1 truncate text-body-sm text-muted">{user.email}</p>
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
