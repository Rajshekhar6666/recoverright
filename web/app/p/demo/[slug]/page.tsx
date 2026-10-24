import { Suspense } from "react";
import { redirect } from "next/navigation";
import PatientLoader from "@/components/patient/PatientLoader";

/**
 * /p/demo/[slug] — friendly patient dashboard URL.
 *
 * Slugs are generated from the patient name (e.g. "david-thomas" for David Thomas).
 * The slug is normalised to lowercase before being sent to the backend so that
 * URLs typed with mixed capitalisation (e.g. /p/demo/David-Thomas) resolve correctly.
 *
 * The backend's resolve_run_id() strips the "demo/" prefix and looks up the slug
 * in patient_tokens.json, so this route is a transparent alias for /p/{slug}.
 */
async function SlugLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Normalise to lowercase — slugs are always stored lowercase in the token index
  const normalisedSlug = slug.toLowerCase();
  return <PatientLoader token={normalisedSlug} />;
}

export default function DemoSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div
          className="pt"
          style={{ display: "grid", gridTemplateColumns: "1fr", placeItems: "center", minHeight: "100vh" }}
        >
          Loading your plan…
        </div>
      }
    >
      <SlugLoader params={params} />
    </Suspense>
  );
}
