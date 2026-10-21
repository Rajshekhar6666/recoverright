import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./theater.css";

export const metadata: Metadata = { title: "RecoverRight · Live theater" };

export default function LiveLayout({ children }: { children: ReactNode }) {
  return children;
}
