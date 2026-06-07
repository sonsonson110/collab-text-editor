import { useEffect, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { BottomBarItem } from "./BottomBarItem";

/** Interval at which the relative time label refreshes. */
const REFRESH_INTERVAL_MS = 10_000;

/**
 * Formats a timestamp as a human-readable relative time string.
 *
 * @param epochMs The save timestamp in epoch milliseconds.
 * @returns A relative time string (e.g., "Just now", "30s ago", "5m ago", "2h ago").
 */
function formatRelativeTime(epochMs: number): string {
  const deltaMs = Date.now() - epochMs;
  const deltaSec = Math.floor(deltaMs / 1_000);

  if (deltaSec < 10) return "Just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;

  const deltaHr = Math.floor(deltaMin / 60);
  return `${deltaHr}h ago`;
}

/**
 * Displays the last snapshot save time as a relative label in the BottomBar.
 *
 * Reads the `lastSavedAt` timestamp from the Zustand editor store (set by
 * the custom `MSG_SNAPSHOT_SAVED` WebSocket message handler) and refreshes
 * the display every {@link REFRESH_INTERVAL_MS} ms so the label stays current.
 *
 * Shows nothing when no save has been received yet (e.g. before the first edit).
 */
export function LastSavedIndicator() {
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (lastSavedAt === null) {
      setLabel(null);
      return;
    }

    // Compute immediately on change
    setLabel(formatRelativeTime(lastSavedAt));

    // Refresh periodically so "Just now" → "30s ago" → "1m ago" etc.
    const id = setInterval(() => {
      setLabel(formatRelativeTime(lastSavedAt));
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [lastSavedAt]);

  if (label === null) {
    return null;
  }

  return (
    <BottomBarItem as="div" className="cursor-default">
      Last saved: {label}
    </BottomBarItem>
  );
}
