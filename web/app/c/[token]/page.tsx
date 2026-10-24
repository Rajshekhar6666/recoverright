import { Suspense } from "react";
import CaregiverPortal from "@/components/caregiver/CaregiverPortal";

async function Token({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CaregiverPortal token={token} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="pt" style={{ padding: "40px", textAlign: "center" }}>Loading caregiver portal...</div>}>
      <Token params={params} />
    </Suspense>
  );
}
