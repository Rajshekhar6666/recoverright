import type { Metadata } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/staff/Shell";
import "../staff/staff.css";

export const metadata: Metadata = { title: "RecoverRight · Live theater" };

export default function LiveLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
