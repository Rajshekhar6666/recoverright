
import { Suspense } from "react";
import Theater from "@/components/live/Theater";

export const instant = false;

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  return (
    <Suspense fallback={<div>Loading live theater...</div>}>
      <Theater runId={runId} />
    </Suspense>
  );
}
