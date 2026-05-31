import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * A dedicated, VSCode-like status bar at the bottom of the editor.
 *
 * Currently serves as a placeholder layout for future indicators
 * (e.g., cursor position, connection status, file type).
 * Hosts the {@link ThemeToggle} button on the right side.
 */
export function BottomBar() {
  return (
    <div
      className={cn(
        "h-6 w-full shrink-0",
        "bg-muted text-muted-foreground",
        "flex items-center justify-between px-3 text-xs",
        "border-t border-border select-none",
      )}
    >
      {/* Future item indicators go here */}
      <span />
      <ThemeToggle />
    </div>
  );
}
