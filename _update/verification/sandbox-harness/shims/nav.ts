export const useRouter = () => ({ push: (u: string) => { (window as any).__nav = u; location.hash = u; }, replace: (u: string) => { (window as any).__nav = u; location.hash = u; } });
export const usePathname = () => "/live";
