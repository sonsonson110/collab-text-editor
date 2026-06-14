import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Library } from "lucide-react";
import { BottomBarItem } from "./BottomBarItem";
import { CursorPositionIndicator } from "./CursorPositionIndicator";
import { LastSavedIndicator } from "./LastSavedIndicator";
import { RoomAccessIndicator } from "./RoomAccessIndicator";

/**
 * A dedicated, VSCode-like status bar at the bottom of the editor.
 *
 * Serves as a status bar displaying room access controls, last save time,
 * cursor coordinates, and theme toggling.
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
        <BottomBarItem as={Link} to="/rooms">
          <Library className="w-3.5 h-3.5" />
          <span>My Rooms</span>
        </BottomBarItem>
      </div>

      <div className="flex items-center h-full overflow-hidden">
        {/* Right side items */}
        <LastSavedIndicator />

        <CursorPositionIndicator />

        <RoomAccessIndicator />

        <ThemeToggle />
      </div>
    </div>
  );
}


