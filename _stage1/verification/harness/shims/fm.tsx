const STRIP = ["initial", "animate", "exit", "transition", "layout", "layoutId", "whileHover", "whileTap", "whileInView", "variants", "custom"];
export const motion: any = new Proxy({}, { get: (_t, tag: string) => (props: any) => { const T: any = tag; const p: any = {}; for (const k in props) if (!STRIP.includes(k)) p[k] = props[k]; return <T {...p} />; } });
export const AnimatePresence = ({ children }: any) => <>{children}</>;
export const MotionConfig = ({ children }: any) => <>{children}</>;
