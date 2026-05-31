import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EditorConfigContext } from "./EditorConfigContext";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  tabSize?: number;
}

export function EditorSetup({ children, tabSize = 2 }: Props) {
  const [charWidth, setCharWidth] = useState<number | null>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (measureRef.current) {
      // DOM-based measurement guarantees exact fractional sub-pixel layout width
      const width = measureRef.current.getBoundingClientRect().width;
      setCharWidth(width || 8); // fallback to 8 if something goes wrong
    }
  }, []);

  if (charWidth === null) {
    return (
      <div
        className={cn(
          "editor",
          "flex relative font-mono text-(--text-color) leading-(--line-height) h-full overflow-hidden focus-visible:outline-none"
        )}
      >
        {/* Render a single character invisibly to measure its accurate width */}
        <span
          ref={measureRef}
          style={{
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "pre",
          }}
        >
          M
        </span>
        <span style={{ color: "#888", padding: "0.5em" }}>Loading…</span>
      </div>
    );
  }

  return (
    <EditorConfigContext.Provider value={{ charWidth, tabSize }}>
      {children}
    </EditorConfigContext.Provider>
  );
}
