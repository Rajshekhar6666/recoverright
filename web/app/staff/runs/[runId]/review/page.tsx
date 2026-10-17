import { Suspense } from "react";
import ReviewClient from "@/components/staff/ReviewClient";

async function Review({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <ReviewClient runId={runId} />;
}

export default function ReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  return (
    <Suspense fallback={<div className="rr-page"><div className="rr-skel" style={{ height: 220 }} /></div>}>
      <Review params={params} />
    </Suspense>
  );
}
