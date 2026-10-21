import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Shell from "@/components/staff/Shell";
import Dashboard from "@/app/staff/page";
import HelpPage from "@/app/staff/help/page";
import PatientList from "@/components/staff/patients/PatientList";
import PatientView from "@/components/staff/patients/PatientView";
import ReviewClient from "@/components/staff/ReviewClient";
import { usePathname } from "./shims/nav";
import "./web/app/staff/staff.css";
import "./web/app/staff/staff2.css";

function Page() {
  const p = usePathname();
  let m: RegExpMatchArray | null;
  if (p === "/staff") return <Dashboard />;
  if (p === "/staff/help") return <HelpPage />;
  if (p === "/staff/patients") return <PatientList />;
  if ((m = p.match(/^\/staff\/patients\/([^/]+)$/))) return <PatientView id={m[1]} key={m[1]} />;
  if ((m = p.match(/^\/staff\/runs\/([^/]+)\/review$/))) return <ReviewClient runId={m[1]} key={m[1]} />;
  return <div className="rr-page">no route {p}</div>;
}
// StrictMode ON, like `next dev`
createRoot(document.getElementById("root")!).render(<StrictMode><Shell><Page /></Shell></StrictMode>);
