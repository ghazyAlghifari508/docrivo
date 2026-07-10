import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Profile - Docrivo",
  description: "Profile pengguna Docrivo.",
};

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className="page-shell py-16">
          <div className="rounded-cards border border-ink bg-cream p-8 shadow-hard">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Profile</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">{user.profile?.name ?? "Pengguna Docrivo"}</h1>
            <p className="mt-3 text-body-sm text-muted">{user.email}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
