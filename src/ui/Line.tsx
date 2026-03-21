import type { ViewLine } from "@/view/types";

export function Line({ line }: { line: ViewLine }) {
  return (
    <div className="line">
      {/* keep empty lines visible */}
      {line.content || "\u00A0"}
    </div>
  );
}
