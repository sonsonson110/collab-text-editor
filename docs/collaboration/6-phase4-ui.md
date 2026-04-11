# Phase 4 — Collaboration UI

## Objective

Render collaboration state visually — remote cursors, remote selections, user labels, and a connected-user list — so users have **spatial awareness** of each other in the document.

---

## Mental Model

```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Connected │ Alice (you) 🔴 Bob 🔵 Charlie           │
├─────────────────────────────────────────────────────────┤
│  1 │ function hello() {                                 │
│  2 │ █ console.log("Hi");  ← local cursor (blinking)   │
│  3 │ }                                                  │
│  4 │                                                    │
│  5 │ function world() { │Bob← remote cursor (colored)   │
│  6 │ ████████████████████ ← remote selection (tinted)    │
│  7 │   return 42;                                       │
│  8 │ }                    │Charlie                       │
└─────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### New Components

| Component | Purpose |
|---|---|
| `RemoteCursor` | Colored vertical line at remote user's cursor position |
| `RemoteCursorLabel` | Name tag floating above the remote cursor |
| `RemoteSelection` | Tinted highlight rectangles for remote user's selection |
| `UserPresenceBar` | Top bar showing all connected users with colors |
| `ConnectionStatus` | Small indicator showing WebSocket connection state |

### Existing Components (no changes)

| Component | Status |
|---|---|
| `Cursor.tsx` | Local cursor — unchanged |
| `Selection.tsx` | Local selection — unchanged |
| `Line.tsx` | Line rendering — unchanged |
| `Gutter.tsx` | Line numbers — unchanged |

---

## Step 1 — RemoteCursor Component

A remote cursor is a thin colored line with a name label:

```tsx
interface RemoteCursorProps {
  position: { line: number; column: number };
  user: { name: string; color: string };
}

function RemoteCursor({ position, user }: RemoteCursorProps) {
  return (
    <div
      className="remote-cursor"
      style={{
        position: 'absolute',
        left: `${position.column}ch`,
        top: `calc(${position.line} * var(--line-height))`,
        height: 'var(--line-height)',
        borderLeft: `2px solid ${user.color}`,
        pointerEvents: 'none',
      }}
    >
      <span
        className="remote-cursor-label"
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          backgroundColor: user.color,
          color: 'white',
          fontSize: '10px',
          padding: '1px 4px',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
          lineHeight: '1.3',
        }}
      >
        {user.name}
      </span>
    </div>
  );
}
```

### Behavior

- The label appears when the remote user moves their cursor
- After 3 seconds of inactivity, the label fades out (cursor line remains)
- On hover over the cursor line, the label reappears

---

## Step 2 — RemoteSelection Component

Similar to the local `Selection` component, but with a tinted color:

```tsx
interface RemoteSelectionProps {
  rects: SelectionRect[];
  color: string;  // user's color, rendered at low opacity
}

function RemoteSelection({ rects, color }: RemoteSelectionProps) {
  return (
    <>
      {rects.map((rect, i) => (
        <div
          key={i}
          className="remote-selection"
          style={{
            position: 'absolute',
            left: `${rect.startCol}ch`,
            top: `calc(${rect.line} * var(--line-height))`,
            width: rect.endCol !== null
              ? `${rect.endCol - rect.startCol}ch`
              : `calc(100% - ${rect.startCol}ch)`,
            height: 'var(--line-height)',
            backgroundColor: color,
            opacity: 0.2,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}
```

---

## Step 3 — UserPresenceBar Component

A horizontal bar at the top showing all connected users:

```tsx
interface UserPresenceProps {
  users: {
    clientID: number;
    name: string;
    color: string;
    isLocal: boolean;
  }[];
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
}

function UserPresenceBar({ users, connectionStatus }: UserPresenceProps) {
  const statusColor = {
    connected: '#4caf50',
    connecting: '#ff9800',
    disconnected: '#f44336',
  }[connectionStatus];

  return (
    <div className="presence-bar">
      <span
        className="connection-dot"
        style={{ backgroundColor: statusColor }}
      />
      {users.map((user) => (
        <span
          key={user.clientID}
          className="presence-user"
          style={{ color: user.color }}
        >
          {user.name}{user.isLocal ? ' (you)' : ''}
        </span>
      ))}
    </div>
  );
}
```

---

## Step 4 — Integrate into EditorView

Remote cursors and selections render **inside** the same `editor-content` div, alongside local cursor and selection:

```tsx
<div className="editor-content" ref={contentRef}>
  <div style={{ position: 'relative', transform: `...` }}>
    {/* Local selection */}
    <Selection rects={selectionRects} />

    {/* Remote selections */}
    {remoteCursors.map((rc) => (
      <RemoteSelection
        key={rc.clientID}
        rects={rc.selectionRects}
        color={rc.user.color}
      />
    ))}

    {/* Lines */}
    {lines.map((line) => (
      <Line key={line.lineNumber} line={line} />
    ))}

    {/* Local cursor */}
    {cursor && viewModel.isCursorVisible() && (
      <CursorComponent position={cursor} />
    )}

    {/* Remote cursors */}
    {remoteCursors.map((rc) => (
      <RemoteCursor
        key={rc.clientID}
        position={rc.cursorPosition}
        user={rc.user}
      />
    ))}
  </div>
</div>
```

### Render order matters

1. Selections (local + remote) — behind text
2. Text lines
3. Local cursor
4. Remote cursors — on top of everything

---

## Step 5 — Performance Considerations

### Throttle awareness updates

Cursor broadcasts happen on every keypress. This can be excessive. Throttle to ~50ms:

```ts
let awarenessTimeout: ReturnType<typeof setTimeout> | null = null;

function throttledBroadcastCursor(awareness, ytext, cursor) {
  if (awarenessTimeout) return;
  awarenessTimeout = setTimeout(() => {
    broadcastCursor(awareness, ytext, cursor);
    awarenessTimeout = null;
  }, 50);
}
```

### Only render visible remote cursors

If a remote cursor is outside the viewport, don't render it. Use the same viewport bounds check as the local cursor:

```ts
const isInViewport = (position) => {
  const vpStart = viewModel.getViewportStart();
  const vpEnd = vpStart + visibleLineCount;
  return position.line >= vpStart && position.line < vpEnd;
};
```

---

## Step 6 — CSS for Remote Cursors

```css
.remote-cursor {
  z-index: 10;
  transition: left 0.1s ease-out, top 0.1s ease-out;
}

.remote-cursor-label {
  animation: fadeIn 0.15s ease-in;
  transition: opacity 0.3s ease;
}

.remote-selection {
  z-index: 1;
  transition: left 0.1s ease-out, top 0.1s ease-out, width 0.1s ease-out;
}

.presence-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  border-bottom: 1px solid #333;
  background: #1a1a1a;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.presence-user {
  font-weight: 500;
}
```

---

## Phase 4 Milestone Checklist

```
[ ] RemoteCursor component renders at correct viewport position
[ ] RemoteCursorLabel shows name, fades after inactivity
[ ] RemoteSelection renders tinted highlight for remote selections
[ ] UserPresenceBar shows all connected users
[ ] ConnectionStatus indicator (green/yellow/red)
[ ] Remote cursors only rendered when in viewport
[ ] Awareness updates throttled to ~50ms
[ ] Smooth transitions on remote cursor movement
[ ] Remote cursor color matches user identity
```

---

## New Files

```
src/ui/components/RemoteCursor.tsx      [NEW]
src/ui/components/RemoteSelection.tsx   [NEW]
src/ui/components/UserPresenceBar.tsx   [NEW]
```

## Modified Files

```
src/ui/EditorView.tsx      ← render remote cursors + selections
src/ui/components/index.ts ← export new components
src/index.css              ← remote cursor / presence styles
```

---

## Next

```
Phase 5 — Extensions Roadmap
```
