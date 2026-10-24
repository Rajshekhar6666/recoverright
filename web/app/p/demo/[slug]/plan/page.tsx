"use client";
import { Suspense, use } from "react";
import { redirect } from "next/navigation";

/**
 * /p/demo/[slug]/plan — forwards to /p/{slug}/plan
 */
function PlanRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  redirect(`/p/${slug.toLowerCase()}/plan`);
}

export default function DemoSlugPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}>
      <PlanRedirect params={params} />
    </Suspense>
  );
}
