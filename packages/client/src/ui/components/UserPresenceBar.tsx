import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectedUser } from "@/collaboration/awareness";

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
      className={clsx(
        "presence-bar",
        "flex items-center gap-2 px-3 pb-0.5 pt-1 text-xs font-mono",
        "border-b border-neutral-700 bg-neutral-900 text-neutral-400",
        "overflow-x-auto scrollbar-hide",
        canScrollLeft && "presence-bar--shadow-left",
        canScrollRight && "presence-bar--shadow-right",
      )}
      onWheel={handleWheel}
    >
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: STATUS_DOT_COLOR[connectionStatus] }}
      />
      {users.map((user, i) => (
        <span key={user.clientID} className="flex items-center gap-2">
          {i > 0 && <span className="text-neutral-600">·</span>}
          <span
            className="font-medium whitespace-nowrap"
            style={{ color: user.color }}
          >
            {user.name}
            {user.isLocal ? " (you)" : ""}
          </span>
        </span>
      ))}
    </div>
  );
}
