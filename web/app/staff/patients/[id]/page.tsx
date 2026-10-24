import { Suspense } from "react";
import ReviewClient from "@/components/staff/ReviewClient";

async function PatientWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewClient runId={id} />;
}

export default function PatientWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="rr-page"><div className="rr-skel" style={{ height: 220 }} /></div>}>
      <PatientWorkspace params={params} />
    </Suspense>
  );
}
