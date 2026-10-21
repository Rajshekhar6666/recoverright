import type { Metadata } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/staff/Shell";
import "./staff.css";
import "./staff2.css";

export const metadata: Metadata = { title: "RecoverRight · Care team" };

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
