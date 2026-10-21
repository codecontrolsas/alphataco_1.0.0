"use client";

import * as React from "react";

const STILLNESS = "(prefers-reduced-motion: reduce)";
const MARGIN = "120px 0px";
const LONGEST_FRAME = 1 / 30;

export function useInView<T extends Element>(ref: React.RefObject<T | null>) {
  const [inView, setInView] = React.useState(false);
  const watched = React.useRef<Element | null>(null);
  const observer = React.useRef<IntersectionObserver | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (node === watched.current) return;
    observer.current?.disconnect();
    observer.current = null;
    watched.current = node;
    setInView(false);
    if (!node) return;
    const binding = new IntersectionObserver((entries) => {
      if (watched.current === node && observer.current === binding) setInView(Boolean(entries.at(-1)?.isIntersecting));
    }, { rootMargin: MARGIN });
    observer.current = binding;
    binding.observe(node);
  });
  React.useEffect(() => () => {
    observer.current?.disconnect();
    observer.current = null;
    watched.current = null;
  }, []);
  return inView;
}

export function Stage({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} className={className} data-inview={inView ? "" : undefined}>
      {children}
    </div>
  );
}

export interface Spring {
  at: number;
  rate: number;
}

export function spring(state: Spring, target: number, dt: number, stiffness: number, damping: number, calm = false) {
  const drag = calm ? 2 * Math.sqrt(stiffness) : damping;
  const steps = Math.max(Math.ceil(dt * 240), 1);
  const slice = dt / steps;
  for (let step = 0; step < steps; step++) {
    state.rate += (target - state.at) * stiffness * slice - state.rate * drag * slice;
    state.at += state.rate * slice;
  }
  if (Math.abs(target - state.at) < 5e-4 && Math.abs(state.rate) < 5e-4) {
    state.at = target;
    state.rate = 0;
  }
  return state.at === target && state.rate === 0;
}
