import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ScrapeDetail } from "@/components/scrape-detail";

export const metadata: Metadata = {
  title: "Scrape HTML - Docrivo",
  description: "Detail preview dan code hasil scrape HTML Docrivo.",
};

export default async function ScrapeHistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SiteHeader surface="depth" />
      <ScrapeDetail id={id} />
      <SiteFooter />
    </>
  );
}
