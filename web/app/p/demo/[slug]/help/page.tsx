"use client";
import { Suspense, use } from "react";
import { redirect } from "next/navigation";

/**
 * /p/demo/[slug]/help — forwards to /p/{slug}/help
 */
function HelpRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  redirect(`/p/${slug.toLowerCase()}/help`);
  return null;
}

export default function DemoSlugHelpPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}>
      <HelpRedirect params={params} />
    </Suspense>
  );
}
