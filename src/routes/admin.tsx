import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/admin")({
  // AUTH NOT ENFORCED, and this is the most serious of the six. The deleted page
  // called `requireAdmin()` from `src/lib/dal` (removed in Task 3.1), which
  // redirected unauthenticated visitors and threw `notFound()` for anyone not on
  // the `ADMIN_EMAILS` allowlist. The replacement for the second half already
  // exists -- `requireAdmin` in `src/auth/admin.ts` -- but it needs a session
  // user, and the only session source for pages is the root loader that Task 7.3
  // adds. Until then `/admin` is reachable by anyone, so treat this route as
  // unfinished rather than as shipped: the table below is empty and the gate
  // must land before this route is exposed.
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

type AdminJob = {
  id: string;
  source_url: string;
  status: string;
  error_code: string | null;
  pages_analyzed: number;
};

// TODO(Task 4.1 + Task 6.1): the deleted page read the 30 most recent jobs with
// an unscoped `insforge.select("generation_jobs", ...)`. Task 4.1's `listJobs`
// is user-scoped, so the admin view needs an unscoped counterpart that also runs
// after `requireAdmin`; Task 6.1 removes the InsForge client this used. No
// replacement query exists yet, so the list is empty rather than wrong.
const jobs: AdminJob[] = [];

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
                          {j.source_url}
                        </td>
                        <td className="p-4 text-right tabular-nums">{j.pages_analyzed}</td>
                        <td className="p-4 text-muted-gray">{j.error_code ? "Perlu dicoba lagi" : "-"}</td>
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
