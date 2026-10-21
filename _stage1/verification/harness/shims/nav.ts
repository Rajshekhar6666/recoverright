import { useSyncExternalStore } from "react";
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);
export function navigate(url: string, replace = false) { history[replace ? "replaceState" : "pushState"](null, "", url); notify(); }
const sub = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname, () => "/staff");
export const useRouter = () => ({ push: (u: string) => navigate(u), replace: (u: string) => navigate(u, true), back: () => history.back() });
