import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectedUser } from "@/collaboration/awareness";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** WebSocket connection state exposed to UI components. */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Maps each connection state to a dot colour for the presence bar. */
const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "#22c55e",
  connecting: "#eab308",
  disconnected: "#ef4444",
};

interface Props {
  users: ConnectedUser[];
  connectionStatus: ConnectionStatus;
}

/**
 * Horizontal bar rendered above the editor showing connection state and all
 * connected users. Each user name is coloured with their assigned cursor colour
 * and the local user is annotated with "(you)".
 *
 * The bar scrolls horizontally via normal mouse-wheel (deltaY is redirected)
 * and shows inset shadows on each overflowing edge as a scroll affordance.
 *
 * Each username is wrapped in a {@link Tooltip} that shows their display name
 * and role on hover.
 */
export function UserPresenceBar({ users, connectionStatus }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /** Recalculate which overflow shadows to show. */
  const updateShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Re-check shadows on scroll, resize, and user list changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    updateShadows();
    el.addEventListener("scroll", updateShadows, { passive: true });
    const observer = new ResizeObserver(updateShadows);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateShadows);
      observer.disconnect();
    };
  }, [updateShadows, users]);

  /** Redirect vertical wheel to horizontal scroll. */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    if (e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "presence-bar",
        "flex items-center gap-2 h-6 px-3 text-xs font-mono",
        "border-b border-border bg-muted/30 text-muted-foreground",
        "overflow-x-auto scrollbar-hide",
        canScrollLeft && "presence-bar--shadow-left",
        canScrollRight && "presence-bar--shadow-right",
        canScrollLeft && !canScrollRight && "shadow-[inset_8px_0_6px_-6px_rgba(0,0,0,0.2)] dark:shadow-[inset_8px_0_6px_-6px_rgba(255,255,255,0.15)]",
        !canScrollLeft && canScrollRight && "shadow-[inset_-8px_0_6px_-6px_rgba(0,0,0,0.2)] dark:shadow-[inset_-8px_0_6px_-6px_rgba(255,255,255,0.15)]",
        canScrollLeft && canScrollRight && "shadow-[inset_8px_0_6px_-6px_rgba(0,0,0,0.2),_inset_-8px_0_6px_-6px_rgba(0,0,0,0.2)] dark:shadow-[inset_8px_0_6px_-6px_rgba(255,255,255,0.15),_inset_-8px_0_6px_-6px_rgba(255,255,255,0.15)]",
      )}
      onWheel={handleWheel}
    >
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: STATUS_DOT_COLOR[connectionStatus] }}
      />
      {users.map((user, i) => (
        <span key={user.clientID} className="flex items-center gap-2">
          {i > 0 && <span className="text-border">·</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="font-medium whitespace-nowrap cursor-default"
                style={{ color: user.color }}
              >
                {user.name}
                {user.isLocal ? " (you)" : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {user.name}
              {user.isLocal ? " — you" : ""}
            </TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}
