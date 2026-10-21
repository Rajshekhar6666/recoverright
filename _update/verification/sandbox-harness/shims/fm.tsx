export const motion: any = new Proxy({}, { get: (_t, tag: string) => ({ initial, animate, exit, transition, layout, ...p }: any) => { const T: any = tag; return <T {...p} />; } });
export const AnimatePresence = ({ children }: any) => <>{children}</>;
export const MotionConfig = ({ children }: any) => <>{children}</>;
