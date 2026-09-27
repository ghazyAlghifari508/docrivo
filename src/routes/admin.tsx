import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/admin")({
  // GATED, and the gate is the router's not-found payload. `listRecentJobs`
  // calls `requireAdmin` before it reads anything, so an unauthenticated request
  // or one from an address that is not on the `ADMIN_EMAILS` allowlist never
  // reaches the query -- and both get the same not-found answer, because a 403
  // would confirm that `/admin` exists.
  //
  // Task 7.3 adds the root loader that resolves the session once per request.
  // Until then the gate lives in the server function, which is the only place
  // that can reach the session without a client-environment import.
  notFoundComponent: RouteNotFound,
  loader: loadAdmin,
  head: () => ({
    meta: [
      { title: "Admin - Docrivo" },
      {
        name: "description",
        content: "Daftar DESIGN.md untuk administrator Docrivo.",
      },
    ],
  }),
  component: AdminPage,
})

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { RouteNotFound } from "~/components/route-error";
import { listRecentJobs } from "~/queries/jobs";

/**
 * The not-found boundary is named explicitly and the error one is not, because
 * `requireAdmin` raises `notFound()` and that is the only failure this route is
 * supposed to have: a signed-out visitor and a non-allowlisted address both get
 * a 404, never a 403. A genuine fault -- the database being down -- still falls
 * through to the root route's error boundary, which is the right place for it.
 */

/**
 * The 30 most recent jobs across every user -- the unscoped read the deleted
 * page did with an InsForge client. `readRecentJobs` is unscoped by necessity,
 * so the `requireAdmin` inside `listRecentJobs` is the only thing standing
 * between this table and anyone who guesses the URL.
 */
async function loadAdmin() {
  return { jobs: await listRecentJobs({ data: { limit: 30 } }) }
}

const OK = new Set(["completed"]);
const BAD = new Set(["failed", "cancelled"]);
const LABEL: Record<string, string> = {
  completed: "Selesai",
  failed: "Perlu dicoba lagi",
  cancelled: "Dibatalkan",
  queued: "Menunggu",
  crawling: "Membaca halaman",
  capturing: "Melihat tampilan",
  extracting: "Merangkum gaya",
  generating: "Menyusun DESIGN.md",
};

export function AdminPage() {
  const { jobs } = Route.useLoaderData()
  const completed = jobs.filter((j) => OK.has(j.status)).length;
  const failed = jobs.filter((j) => BAD.has(j.status)).length;
  const running = jobs.length - completed - failed;

  return (
    <>
      <SiteHeader surface="cream" />

      <main id="main" className="bg-cream">
        <div className="page-shell py-14">
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Admin</span>
            <h1 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Daftar <span className="emph">DESIGN.md</span>.
            </h1>
            <p className="max-w-md text-body-sm leading-6 text-muted">
              Pantau DESIGN.md yang sedang dibuat, selesai, atau perlu dicoba ulang.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Stat label="Selesai" value={completed} accent="mint" />
            <Stat label="Berjalan" value={running} accent="lime" />
            <Stat label="Gagal" value={failed} accent="ink" />
          </div>

          <div className="mt-8 overflow-hidden rounded-cards border border-ink bg-paper-white shadow-hard">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
                <thead className="border-b border-ink bg-cream">
                  <tr className="text-caption uppercase tracking-[0.06em] text-muted-gray">
                    <th className="p-4 font-semibold">Kondisi</th>
                    <th className="p-4 font-semibold">Website</th>
                    <th className="p-4 font-semibold text-right">Halaman</th>
                    <th className="p-4 font-semibold">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-muted-gray">
                        Belum ada DESIGN.md.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((j) => (
                      <tr key={j.id} className="border-b border-rule last:border-b-0 hover:bg-cream/60">
                        <td className="p-4">
                          <StatusBadge status={j.status} />
                        </td>
                        <td className="max-w-[420px] break-all p-4 font-medium">
                          {j.sourceUrl}
                        </td>
                        <td className="p-4 text-right tabular-nums">{j.pagesAnalyzed}</td>
                        <td className="p-4 text-muted-gray">{j.errorCode ? "Perlu dicoba lagi" : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "mint" | "lime" | "ink" }) {
  const dot = accent === "mint" ? "bg-mint-edge" : accent === "lime" ? "bg-lime-sprint" : "bg-ink";
  return (
    <div className="rounded-cards border border-rule bg-paper-white p-6">
      <div className="flex items-center gap-2 text-caption text-muted-gray">
        <span className={`size-2 rounded-full ${dot}`} />
        {label}
      </div>
      <p className="mt-3 text-heading-lg font-semibold tabular-nums leading-none tracking-heading-lg">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = OK.has(status)
    ? "border-mint-edge bg-mint-wash text-ink"
    : BAD.has(status)
      ? "border-red-300 bg-red-50 text-red-700"
      : "border-ink bg-lime-sprint text-ink";
  return (
    <span className={`inline-block rounded-pills border px-3 py-1 text-caption font-medium capitalize ${cls}`}>
      {LABEL[status] ?? status}
    </span>
  );
}
