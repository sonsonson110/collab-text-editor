import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ensureToken } from "@/auth/authService";
import { setToken } from "@/auth/tokenStorage";
import { apiPost } from "@/api/apiClient";
import type { QuickshareResponse } from "@/api/types";
import { Button } from "@/components/ui/button";

/** localStorage key prefix used to store the per-room creator secret. */
const CREATOR_SECRET_KEY_PREFIX = "creator:";

function MockEditor() {
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTicks((t) => (t >= 180 ? 0 : t + 1));
    }, 70);
    return () => clearInterval(interval);
  }, []);

  const aliceLen = Math.min(26, Math.max(0, ticks - 10));
  const bobLen = Math.min(42, Math.floor(Math.max(0, ticks - 45) * 0.8));
  const charlieLen = Math.min(2, Math.max(0, ticks - 130));
  const daveSel = Math.min(39, Math.floor(Math.max(0, ticks - 5) * 1.2)); // Dave selects the first line

  const contentLines = [
    "// Welcome to the collaborative editor!",
    "",
    "function getTotal(items) {".slice(0, aliceLen),
    "  return items.reduce((a, b) => a + b, 0);".slice(0, bobLen),
    "} ".slice(0, charlieLen),
    "",
    "// Real-time sync using CRDTs",
    "// built with React, Spring & Node.js",
  ];

  const users = [
    {
      name: "Alice",
      color: "#f87171",
      line: 2,
      col: aliceLen,
      selStart: aliceLen,
    },
    { name: "Bob", color: "#60a5fa", line: 3, col: bobLen, selStart: bobLen },
    {
      name: "Charlie",
      color: "#34d399",
      line: 4,
      col: charlieLen,
      selStart: charlieLen,
    },
    { name: "Dave", color: "#eab308", line: 0, col: daveSel, selStart: 0 },
  ];

  return (
    <div className="flex relative font-mono text-(--text-color) text-sm leading-[20px] h-full w-full overflow-hidden bg-(--background-color) border border-border rounded-xl shadow-2xl z-10">
      {/* Gutter */}
      <div
        className="shrink-0 flex flex-col bg-(--background-color) text-muted-foreground text-right pr-[1ch] select-none border-r border-border z-2"
        style={{ width: "4ch" }}
      >
        <div style={{ transform: "translateY(24px)" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="leading-[20px] whitespace-pre">
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Editor Content */}
      <div className="grow relative overflow-hidden z-1 bg-transparent">
        <div style={{ transform: "translate3d(0, 24px, 0)" }}>
          {/* Selections */}
          {users.map((u) => {
            if (u.selStart === undefined || u.selStart === u.col) return null;
            const startCol = Math.min(u.selStart, u.col);
            const endCol = Math.max(u.selStart, u.col);
            const width = endCol - startCol;
            if (width === 0) return null;

            return (
              <div
                key={`${u.name}-sel`}
                className="absolute z-0 transition-all duration-75"
                style={{
                  top: u.line * 20,
                  left: `calc(1ch + ${startCol}ch)`,
                  width: `${width}ch`,
                  height: 20,
                  backgroundColor: u.color,
                  opacity: 0.3,
                }}
              />
            );
          })}

          {contentLines.map((text, i) => (
            <div key={i} className="line h-[20px] whitespace-pre pl-[1ch]">
              {text || "\u00A0"}
            </div>
          ))}

          {/* Cursors */}
          {users.map((u) => (
            <div
              key={u.name}
              className="absolute w-0.5 z-10 transition-all duration-75"
              style={{
                top: u.line * 20,
                left: `calc(1ch + ${u.col}ch)`,
                height: 20,
                backgroundColor: u.color,
                opacity: u.col > 0 ? 1 : 0, // hide cursor before they start typing
              }}
            >
              <div
                className="absolute left-0 text-white text-[10px] px-1 py-0.5 rounded-sm whitespace-nowrap select-none pointer-events-none transition-opacity duration-300"
                style={{ top: -20, backgroundColor: u.color }}
              >
                {u.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal landing page.
 *
 * Contains only a "Create Room" button that:
 *   1. Ensures a valid JWT is present (fetches guest token if needed).
 *   2. Calls `POST /api/rooms/quickshare` to create a new room.
 *   3. If a `creatorSecret` is returned (guest-created room), persists it in
 *      `localStorage` so the browser/device can later trigger a claim even
 *      after closing and reopening the tab/browser.
 *   4. Redirects to `/room/<slug>` to begin editing.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShareNow() {
    setLoading(true);
    setError(null);

    try {
      const token = await ensureToken();
      setToken(token);

      const response = await apiPost<QuickshareResponse>(
        "/api/rooms/quickshare",
      );

      if (!response.ok || !response.data) {
        throw new Error(`Failed to create room: HTTP ${response.status}`);
      }

      const { id, slug, creatorSecret } = response.data;

      // Persist the one-time secret so this browser can later claim the room.
      // Auth-user-created rooms have no secret (they're claimed immediately).
      if (creatorSecret !== null) {
        localStorage.setItem(
          `${CREATOR_SECRET_KEY_PREFIX}${id}`,
          creatorSecret,
        );
      }

      navigate(`/room/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 lg:p-12">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Left: Description & CTA */}
        <div className="flex flex-col gap-6 max-w-xl order-1 lg:order-1">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Collaborative coding, <br />
              <span className="text-primary">simplified.</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A lightning-fast, collaborative text editor built for seamless
              teamwork. Share a link and start coding together instantly with
              zero setup.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button
              id="share-code-now-btn"
              size="lg"
              className="w-full sm:w-auto self-start text-base px-8 h-12 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => void handleShareNow()}
              disabled={loading}
            >
              {loading ? "Creating room…" : "Create Room"}
            </Button>
            {error !== null && (
              <p className="text-destructive text-sm font-medium">{error}</p>
            )}
          </div>
        </div>

        {/* Right: Static Demo */}
        <div className="relative w-full h-50 order-2 lg:order-2">
          {/* Decorative Glow */}
          <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full z-0 pointer-events-none" />
          <MockEditor />
        </div>
      </div>
    </div>
  );
}
