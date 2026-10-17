import Theater from "@/components/live/Theater";

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <Theater runId={runId} />;
}
