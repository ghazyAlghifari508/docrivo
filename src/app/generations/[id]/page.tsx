import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GenerationResult } from "@/components/generation-result";

export default async function GenerationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SiteHeader surface="depth" />
      <GenerationResult id={id} />
      <SiteFooter />
    </>
  );
}
