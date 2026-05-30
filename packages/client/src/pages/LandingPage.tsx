import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureToken } from "@/auth/authService";
import { setToken } from "@/auth/tokenStorage";
import { apiPost } from "@/api/apiClient";
import type { QuickshareResponse } from "@/api/types";

/** localStorage key prefix used to store the per-room creator secret. */
const CREATOR_SECRET_KEY_PREFIX = "creator:";

/**
 * Minimal landing page.
 *
 * Contains only a "Share Code Now" button that:
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

      const response = await apiPost<QuickshareResponse>("/api/rooms/quickshare");

      if (!response.ok || !response.data) {
        throw new Error(`Failed to create room: HTTP ${response.status}`);
      }

      const { id, slug, creatorSecret } = response.data;

      // Persist the one-time secret so this browser can later claim the room.
      // Auth-user-created rooms have no secret (they're claimed immediately).
      if (creatorSecret !== null) {
        localStorage.setItem(`${CREATOR_SECRET_KEY_PREFIX}${id}`, creatorSecret);
      }

      navigate(`/room/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-950">
      <div className="flex flex-col items-center gap-4">
        <button
          id="share-code-now-btn"
          onClick={() => void handleShareNow()}
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating room…" : "Share Code Now"}
        </button>
        {error !== null && (
          <p className="text-red-400 text-xs">{error}</p>
        )}
      </div>
    </div>
  );
}
