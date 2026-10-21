import { Suspense } from "react";
import PatientView from "@/components/staff/patients/PatientView";

async function Patient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientView id={id} />;
}

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="rr-page"><div className="rr-skel" style={{ height: 220 }} /></div>}>
      <Patient params={params} />
    </Suspense>
  );
}
