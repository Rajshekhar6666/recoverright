import { Suspense } from "react";
import PatientLoader from "@/components/patient/PatientLoader";

// Next 16 (Cache Components) requires reading `params` inside a Suspense boundary.
async function Token({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PatientLoader token={token} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="pt" style={{ display: "grid", gridTemplateColumns: "1fr", placeItems: "center", minHeight: "100vh" }}>Loading your plan…</div>}>
      <Token params={params} />
    </Suspense>
  );
}
