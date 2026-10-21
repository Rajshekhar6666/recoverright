declare module "react" {
  export type ReactNode = any;
  export interface Context<T> { Provider: (p: { value: T; children?: any }) => any; __t?: T }
  export function createContext<T>(d: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): { current: T | null };
  export function useMemo<T>(f: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(f: T, deps: readonly unknown[]): T;
  export function memo<T>(c: T): T;
  export const Suspense: any;
  export type SVGProps<T> = any;
}
declare module "next/link" { const L: any; export default L; }
declare module "next/navigation" { export function useRouter(): { push(u: string): void; replace(u: string): void }; export function usePathname(): string | null; }
declare module "framer-motion" { export const motion: any; export const MotionConfig: any; export const AnimatePresence: any; }
declare module "next" { export type Metadata = any; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface ElementClass {} interface ElementChildrenAttribute { children: {} } interface IntrinsicAttributes { key?: any } }
declare namespace React { type ReactNode = any }
declare module "*.css";
