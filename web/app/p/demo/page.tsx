import { redirect } from "next/navigation";

/**
 * /p/demo — redirect to the default demo patient (Priya Sharma).
 * The sidebar "Patient app demo" link lands here and is forwarded to the
 * first canonical demo slug so staff can always see the full companion UI.
 */
export default function DemoIndexPage() {
  redirect("/p/demo/priya-sharma-526");
}
