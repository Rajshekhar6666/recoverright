import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./patient.css";

export const metadata: Metadata = { title: "RecoverRight · Your recovery plan", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function PatientLayout({ children }: { children: ReactNode }) {
  return children;
}
