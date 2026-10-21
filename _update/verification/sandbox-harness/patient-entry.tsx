import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PatientLoader from "@/components/patient/PatientLoader";
import "./web/app/p/patient.css";
const token = (new URLSearchParams(location.search).get("t")) || "demo";
// StrictMode ON: React dev double-mounts every effect, exactly like `next dev`. This is the condition that broke the old hook.
createRoot(document.getElementById("root")!).render(<StrictMode><PatientLoader token={token} /></StrictMode>);
