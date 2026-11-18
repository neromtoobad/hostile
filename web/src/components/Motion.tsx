/** Small motion pieces shared by the pages: word-by-word headline reveal, count-up numbers,
 *  an endless marquee and an "in view" hook. Reduced-motion users and automated browsers get
 *  the finished state at once. */
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";

/** Automated browsers (link previews, screenshot tools) never scroll or wait. */
export const STILL = typeof navigator !== "undefined" && navigator.webdriver === true;

export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** True once the element has scrolled into view (and stays true). */
export function useShown<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || STILL) return setShown(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.05, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, shown] as const;
}

/** One word that slides up out of a mask. `i` sets its place in the stagger. */
export function Word({ children, i = 0, delay = 0 }: { children: ReactNode; i?: number; delay?: number }) {
  const still = useReducedMotion() || STILL;
  return (
    <span className="w">
      <motion.span
        initial={still ? false : { y: "118%", rotate: 5 }}
        animate={{ y: 0, rotate: 0 }}
        transition={{ duration: 0.95, ease: EASE, delay: delay + i * 0.075 }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** A sentence revealed word by word. */
export function Words({ text, from = 0, delay = 0 }: { text: string; from?: number; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <Fragment key={i}>
          <Word i={from + i} delay={delay}>{w}</Word>{" "}
        </Fragment>
      ))}
    </>
  );
}

/** Counts from 0 to `value` the first time it scrolls into view. */
export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [ref, shown] = useShown<HTMLSpanElement>();
  const reduce = useReducedMotion();
  const [n, setN] = useState(value);
  const ran = useRef(false);
  useEffect(() => {
    if (!shown || STILL || reduce || ran.current || !value) return setN(value);
    ran.current = true;
    let done = false;
    const run = animate(0, value, { duration: 1.3, ease: EASE, onUpdate: setN, onComplete: () => { done = true; } });
    return () => {
      run.stop();
      if (!done) ran.current = false;
    };
  }, [shown, value, reduce]);
  return <span ref={ref}>{format(n)}</span>;
}

/** An endless strip. The content is rendered twice so the loop has no seam. */
export function Marquee({ children, seconds = 40, reverse = false, className = "" }: { children: ReactNode; seconds?: number; reverse?: boolean; className?: string }) {
  return (
    <div className={`marquee ${className}`}>
      <div className={`marquee-track ${reverse ? "rev" : ""}`} style={{ animationDuration: `${seconds}s` }}>
        <div className="marquee-set">{children}</div>
        <div className="marquee-set" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

/** The arrow inside a button: slides out and back in on hover (CSS). */
export function Arrow() {
  return (
    <span className="btn-arrow" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
