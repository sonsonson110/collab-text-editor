import { cn } from "@/lib/utils";
import type { ViewLine } from "@/view/types";

export function Line({ line }: { line: ViewLine }) {
  return (
    <div className={cn("line", "h-(--line-height) whitespace-pre")}>
      {/* keep empty lines visible */}
      {line.content || "\u00A0"}
    </div>
  );
}
