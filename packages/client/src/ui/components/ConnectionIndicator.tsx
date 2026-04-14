export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "#22c55e",
  connecting: "#eab308",
  disconnected: "#ef4444",
};

const LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
};

// Static layout/typography → Tailwind classes.
// Only the dot's background color is dynamic → inline style.
export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  return (
    <div className="fixed bottom-3 right-5 flex items-center gap-1.5 text-xs text-slate-400">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: DOT_COLOR[status] }}
      />
      {LABEL[status]}
    </div>
  );
}
