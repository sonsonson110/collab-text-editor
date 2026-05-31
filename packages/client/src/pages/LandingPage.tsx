import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureToken } from "@/auth/authService";
import { setToken } from "@/auth/tokenStorage";
import { apiPost } from "@/api/apiClient";
import type { QuickshareResponse } from "@/api/types";
import { Button } from "@/components/ui/button";

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
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Button
          id="share-code-now-btn"
          size="lg"
          onClick={() => void handleShareNow()}
          disabled={loading}
        >
          {loading ? "Creating room…" : "Share Code Now"}
        </Button>
        {error !== null && (
          <p className="text-destructive text-xs">{error}</p>
        )}
      </div>
    </div>
  );
}
