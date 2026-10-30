"use client";
import { Suspense, use } from "react";
import { redirect } from "next/navigation";

/**
 * /p/demo/[slug]/call
 *
 * Forwards to the canonical /p/{slug}/call route so the same
 * PatientCallView component handles the WebRTC session.
 * The slug is normalised to lowercase to match stored token index keys.
 */
function CallRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const normalisedSlug = slug.toLowerCase();
  redirect(`/p/${normalisedSlug}/call`);
  return null;
}

export default function DemoSlugCallPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Connecting to telehealth...</div>}>
      <CallRedirect params={params} />
    </Suspense>
  );
}
