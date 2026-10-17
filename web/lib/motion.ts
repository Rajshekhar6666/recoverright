/** One set of motion rules for every screen, so the product feels like one thing. */
export const dur = { fast: 0.15, base: 0.25, slow: 0.5 } as const;
export const spring = { type: "spring", stiffness: 320, damping: 30 } as const;
export const softSpring = { type: "spring", stiffness: 180, damping: 24 } as const;
export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: dur.base, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};
