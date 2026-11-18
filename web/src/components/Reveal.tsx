import type { CSSProperties, ReactNode } from "react";
import { useShown } from "./Motion";

/** Fades a section up the first time it scrolls into view. Children with the class `rise`
 *  follow one after another; set `--i` on each to place it in the stagger. */
export function Reveal({ children, className = "", as: Tag = "div", style }: { children: ReactNode; className?: string; as?: "div" | "section"; style?: CSSProperties }) {
  const [ref, shown] = useShown<HTMLDivElement>();
  return (
    <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

/** Shorthand for the stagger index on a `rise` child. */
export const at = (i: number) => ({ "--i": i }) as CSSProperties;
