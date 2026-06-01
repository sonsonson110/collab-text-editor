import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Lock, Library } from "lucide-react";
import { BottomBarItem } from "./BottomBarItem";
import { CursorPositionIndicator } from "./CursorPositionIndicator";

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
        "flex items-center justify-between px-1 text-xs",
        "border-t border-border select-none overflow-hidden",
      )}
    >
      <div className="flex items-center h-full overflow-hidden">
        {/* Left side items */}
        <BottomBarItem>
          <Library className="w-3.5 h-3.5" />
          <span>My Rooms</span>
        </BottomBarItem>
      </div>

      <div className="flex items-center h-full overflow-hidden">
        {/* Right side items */}
        <BottomBarItem as="div" className="cursor-default">
          Last saved: Just now
        </BottomBarItem>
        
        <CursorPositionIndicator />

        <BottomBarItem>
          <Lock className="w-3.5 h-3.5" />
          <span>Restricted</span>
        </BottomBarItem>

        <ThemeToggle />
      </div>
    </div>
  );
}
