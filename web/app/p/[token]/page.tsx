import PatientLoader from "@/components/patient/PatientLoader";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PatientLoader token={token} />;
}
