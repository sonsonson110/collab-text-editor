import React from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Lock, Library } from "lucide-react";

interface BottomBarItemProps extends React.ComponentPropsWithoutRef<"button"> {
  as?: React.ElementType;
}

function BottomBarItem({
  children,
  className,
  as: Component = "button",
  ...props
}: BottomBarItemProps) {
  return (
    <Component
      className={cn(
        "flex items-center gap-1.5 h-full px-2.5 transition-none",
        "hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground cursor-pointer",
        "focus-visible:outline-none focus-visible:bg-black/10 dark:focus-visible:bg-white/10",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

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
        
        <BottomBarItem as="div" className="cursor-default">
          Ln 1, Col 1
        </BottomBarItem>

        <BottomBarItem>
          <Lock className="w-3.5 h-3.5" />
          <span>Restricted</span>
        </BottomBarItem>

        <ThemeToggle />
      </div>
    </div>
  );
}
