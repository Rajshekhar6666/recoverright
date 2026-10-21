declare module "react" {
  export type ReactNode = any;
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): { current: T | null };
  export function useRef<T = undefined>(): { current: T | undefined };
  export function useMemo<T>(f: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(f: T, deps: readonly unknown[]): T;
  export function memo<T>(c: T): T;
}
declare module "next/link" { const L: any; export default L; }
declare module "next/navigation" { export function useRouter(): { push(u: string): void; replace(u: string): void }; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface ElementClass {} }
declare module "*.css";
