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

  search: ({ size, ...p }: P) => svg(size, p, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  calendar: ({ size, ...p }: P) => svg(size, p, <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  pill: ({ size, ...p }: P) => svg(size, p, <><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></>),
  phone: ({ size, ...p }: P) => svg(size, p, <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z" />),
  chat: ({ size, ...p }: P) => svg(size, p, <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  mic: ({ size, ...p }: P) => svg(size, p, <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>),
  clock: ({ size, ...p }: P) => svg(size, p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  user: ({ size, ...p }: P) => svg(size, p, <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  play: ({ size, ...p }: P) => svg(size, p, <path d="M7 4l13 8-13 8z" />),
  heart: ({ size, ...p }: P) => svg(size, p, <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />),
  spark: ({ size, ...p }: P) => svg(size, p, <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
  replay: ({ size, ...p }: P) => svg(size, p, <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>),
  home: ({ size, ...p }: P) => svg(size, p, <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  walk: ({ size, ...p }: P) => svg(size, p, <><circle cx="13" cy="4.5" r="1.8" /><path d="m9 21 2.5-6-2.5-2 1-5 4 1 2 3 3 1M13 15l3 3v3" /></>),
  list: ({ size, ...p }: P) => svg(size, p, <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>),
  layers: ({ size, ...p }: P) => svg(size, p, <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>),
  book: ({ size, ...p }: P) => svg(size, p, <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></>),
};
