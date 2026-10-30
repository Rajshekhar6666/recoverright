import { Suspense } from "react";
import CaregiverPortal from "@/components/caregiver/CaregiverPortal";

async function GuardianView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CaregiverPortal token={token} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading caregiver portal...</div>}>
      <GuardianView params={params} />
    </Suspense>
  );
}
