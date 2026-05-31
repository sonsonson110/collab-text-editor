import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ensureToken } from "@/auth/authService";
import { setToken } from "@/auth/tokenStorage";
import { apiGet } from "@/api/apiClient";
import type { RoomResponse } from "@/api/types";
import { AppLayout } from "@/ui/templates/AppLayout";
import { EditorSetup } from "@/ui/EditorSetup";
import { CollaborationLayout } from "@/ui/templates/CollaborationLayout";
import { Spinner } from "@/components/ui/spinner";

type PageState =
  | { phase: "loading" }
  | { phase: "ready"; token: string; room: RoomResponse }
  | { phase: "error"; message: string };

/**
 * Page rendered at `/room/:roomId`.
 *
 * Responsibilities:
 * 1. Reads the room slug from the URL.
 * 2. Ensures a valid JWT is present (acquires guest token if needed).
 * 3. Fetches room metadata via `GET /api/rooms/by-slug/:slug` to validate the
 *    room exists and check access mode.
 * 4. Renders the collaborative editor once both are ready.
 */
export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    if (!roomId) {
      setState({ phase: "error", message: "No room ID in URL" });
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        const token = await ensureToken();
        if (!cancelled) {
          setToken(token);
        }

        const response = await apiGet<RoomResponse>(`/api/rooms/by-slug/${roomId}`);

        if (cancelled) {
          return;
        }

        if (!response.ok || !response.data) {
          setState({
            phase: "error",
            message: response.status === 404
              ? "Room not found"
              : `Failed to load room (HTTP ${response.status})`,
          });
          return;
        }

        setState({ phase: "ready", token, room: response.data });
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "Failed to load room",
          });
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (state.phase === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background gap-2 text-muted-foreground font-mono text-sm">
        <Spinner className="size-4" />
        Loading room…
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-destructive font-mono text-sm">
        {state.message}
      </div>
    );
  }

  return (
    <AppLayout>
      <EditorSetup>
        <CollaborationLayout
          roomId={state.room.id}
          token={state.token}
          room={state.room}
        />
      </EditorSetup>
    </AppLayout>
  );
}
