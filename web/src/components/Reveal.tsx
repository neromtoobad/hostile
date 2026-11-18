import { type ReactNode, useEffect, useRef, useState } from "react";

/** Fades a section up the first time it scrolls into view. */
export function Reveal({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // Show everything at once for browsers without IntersectionObserver and for automated
    // browsers (link previews, full-page screenshots), which never scroll the page.
    if (!el || typeof IntersectionObserver === "undefined" || navigator.webdriver) return setShown(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.04, rootMargin: "0px 0px -6% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
