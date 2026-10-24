"use client";
import { Suspense, use } from "react";
import { redirect } from "next/navigation";

/**
 * /p/demo/[slug]/guardian — forwards to /p/{slug}/guardian
 */
function GuardianRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  redirect(`/p/${slug.toLowerCase()}/guardian`);
}

export default function DemoSlugGuardianPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}>
      <GuardianRedirect params={params} />
    </Suspense>
  );
}
