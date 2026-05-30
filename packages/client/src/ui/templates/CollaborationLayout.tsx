import { useState } from "react";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import { EditorView } from "@/ui/EditorView";
import { UserPresenceBar } from "@/ui/components";
import { AuthModal } from "@/ui/components/AuthModal";
import type { RoomResponse } from "@/api/types";
import { getTokenRole } from "@/auth/tokenStorage";
import { apiPost } from "@/api/apiClient";

/** localStorage key prefix that mirrors the one written by LandingPage. */
const CREATOR_SECRET_KEY_PREFIX = "creator:";

interface Props {
  /** The room's UUID — used as the Yjs room name and WebSocket path. */
  roomId: string;
  /** A valid JWT passed to the WebSocket provider for authentication. */
  token: string;
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
export function CollaborationLayout({ roomId, token, room }: Props) {
  const { viewModel, status, users, reconnect } = useCollaborativeEditor({
    roomId,
    token,
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRoomClaimed, setIsRoomClaimed] = useState(room.isClaimed);

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

    setIsRoomClaimed(true);
    // Reconnect WebSocket with the member JWT, preserving Y.Doc state.
    reconnect(memberToken);
    setShowAuthModal(false);
  }

  if (!viewModel) {
    return (
      <div className="flex flex-col h-full">
        <UserPresenceBar users={users} connectionStatus={status} />
        <div className="flex-1 flex items-center justify-center text-neutral-500 font-mono text-sm">
          Connecting…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showClaimBanner && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-900/40 border-b border-amber-700/50 text-amber-300 text-xs font-mono">
          <span>
            You are editing as a Guest. Sign in to save this room permanently.
          </span>
          <button
            id="sign-in-to-claim-btn"
            onClick={() => {
              setShowAuthModal(true);
            }}
            className="ml-4 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs transition-colors"
          >
            Sign In
          </button>
        </div>
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
