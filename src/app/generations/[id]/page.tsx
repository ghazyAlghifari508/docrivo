import { GenerationResult } from "@/components/generation-result";

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GenerationResult id={id} />;
}
