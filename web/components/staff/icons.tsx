import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function svg(size: number | undefined, p: SVGProps<SVGSVGElement>, children: React.ReactNode) {
  return (
    <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

export const Icon = {
  grid: ({ size, ...p }: P) => svg(size, p, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  upload: ({ size, ...p }: P) => svg(size, p, <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
  bell: ({ size, ...p }: P) => svg(size, p, <><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  pulse: ({ size, ...p }: P) => svg(size, p, <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />),
  check: ({ size, ...p }: P) => svg(size, p, <path d="m5 12.5 4.5 4.5L19 7.5" />),
  edit: ({ size, ...p }: P) => svg(size, p, <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>),
  x: ({ size, ...p }: P) => svg(size, p, <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>),
  file: ({ size, ...p }: P) => svg(size, p, <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  alert: ({ size, ...p }: P) => svg(size, p, <><path d="M12 4 3 20h18z" /><path d="M12 10v4" /><path d="M12 17.5v.1" /></>),
  shield: ({ size, ...p }: P) => svg(size, p, <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2.2 2.2L15 10" /></>),
  arrow: ({ size, ...p }: P) => svg(size, p, <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>),
  external: ({ size, ...p }: P) => svg(size, p, <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  lock: ({ size, ...p }: P) => svg(size, p, <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
};
