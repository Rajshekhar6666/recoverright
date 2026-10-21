import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Theater from "@/components/live/Theater";
import "./web/app/live/theater.css";
const run = new URLSearchParams(location.search).get("run") || "demo";
createRoot(document.getElementById("root")!).render(<StrictMode><Theater runId={run} /></StrictMode>);
