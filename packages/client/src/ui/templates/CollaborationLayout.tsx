import { useEffect, useState } from "react";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import { EditorView } from "@/ui/EditorView";
import { UserPresenceBar } from "@/ui/components";
import { AuthModal } from "@/ui/components/AuthModal";
import type { RoomResponse } from "@/api/types";
import { getTokenRole, setToken } from "@/auth/tokenStorage";
import { apiPost, apiGet } from "@/api/apiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useEditorStore } from "@/store/editorStore";

/** localStorage key prefix that mirrors the one written by LandingPage. */
const CREATOR_SECRET_KEY_PREFIX = "creator:";

interface Props {
  /** The room's UUID — used as the Yjs room name and WebSocket path. */
  roomId: string;
  /** A valid WebSocket Room Ticket passed to the WebSocket provider for authentication. */
  ticket: string;
  /** Room metadata fetched from the server before entering the room. */
  room: RoomResponse;
}

/**
 * Template layout for a collaborative editing session.
 *
 * Owns the collaboration hook and renders collaboration-specific chrome
 * (presence bar, connection indicator, claim banner) around a pure {@link EditorView}.
 * The editor itself has no knowledge of the surrounding layout.
 *
 * ### Claim banner visibility rules
 * The banner is shown only when ALL of the following are true:
 * 1. The current JWT belongs to a guest (`role === "GUEST"`).
 * 2. The room is not yet claimed (`room.isClaimed === false`).
 * 3. This browser session holds the `creatorSecret` for the room in `localStorage`
 *    — meaning this is the browser/device that originally created the room.
 *
 * Rule 3 ensures that only the creator sees the option to claim, not every
 * guest or authenticated user who joins as a collaborator.
 */
export function CollaborationLayout({ roomId, ticket, room }: Props) {
  const { viewModel, status, users, isSynced, reconnect } =
    useCollaborativeEditor({
      roomId,
      ticket,
    });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRoomClaimed, setIsRoomClaimed] = useState(room.isClaimed);

  const setRoom = useEditorStore((state) => state.setRoom);
  const setEffectiveRole = useEditorStore((state) => state.setEffectiveRole);

  useEffect(() => {
    setRoom(room);
    return () => {
      setRoom(null);
      setEffectiveRole(null);
    };
  }, [room, setRoom, setEffectiveRole]);

  // The claim banner is shown only to the browser that created the room.
  // localStorage is used so that if the user closes the tab or browser,
  // reopening the room will still show the claim banner.
  const isGuest = getTokenRole() === "GUEST";
  const creatorSecretKey = `${CREATOR_SECRET_KEY_PREFIX}${roomId}`;
  const hasCreatorSecret =
    localStorage.getItem(creatorSecretKey) !== null;
  const showClaimBanner = isGuest && !isRoomClaimed && hasCreatorSecret;

  async function handleClaimSuccess(memberToken: string) {
    const creatorSecret = localStorage.getItem(creatorSecretKey);

    // Claim the room with the stored secret. The server verifies it and
    // clears it server-side; we clear client-side immediately on success.
    await apiPost(`/api/rooms/${roomId}/claim`, {
      creatorSecret: creatorSecret ?? "",
    });
    localStorage.removeItem(creatorSecretKey);

    // Set the new member token so apiGet uses it
    setToken(memberToken);

    const ticketRes = await apiGet<{ ticket: string }>(`/api/rooms/by-slug/${room.slug}/ticket`);
    if (ticketRes.ok && ticketRes.data) {
      reconnect(ticketRes.data.ticket);
    }

    setIsRoomClaimed(true);
    setShowAuthModal(false);
  }

  // Show a phase-appropriate loading message while the editor is not ready.
  // The ViewModel is only exposed after the Yjs sync handshake completes,
  // which guarantees the full snapshot has been transmitted to the client.
  if (!viewModel) {
    const loadingMessage =
      status === "connected" && !isSynced
        ? "Syncing document…"
        : "Connecting…";

    return (
      <div className="flex flex-col h-full">
        <UserPresenceBar users={users} connectionStatus={status} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2 font-mono text-sm">
          <Spinner className="size-4" />
          {loadingMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showClaimBanner && (
        <Alert className="rounded-none border-x-0 border-t-0 border-amber-600/60 bg-amber-500/10 py-2 px-4">
          <AlertDescription className="flex items-center justify-between text-amber-700 dark:text-amber-300 font-mono text-xs">
            <span>
              You are editing as a Guest. Sign in to save this room permanently.
            </span>
            <Button
              id="sign-in-to-claim-btn"
              variant="outline"
              size="sm"
              className="ml-4 border-amber-600/60 text-amber-700 hover:bg-amber-600/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300"
              onClick={() => {
                setShowAuthModal(true);
              }}
            >
              Sign In
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <UserPresenceBar users={users} connectionStatus={status} />
      <div className="flex-1 min-h-0">
        <EditorView viewModel={viewModel} />
      </div>
      {showAuthModal && (
        <AuthModal
          onSuccess={(memberToken) => {
            void handleClaimSuccess(memberToken);
          }}
          onClose={() => {
            setShowAuthModal(false);
          }}
        />
      )}
    </div>
  );
}

