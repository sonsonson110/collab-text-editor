import { useState } from "react";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import { EditorView } from "@/ui/EditorView";
import { UserPresenceBar } from "@/ui/components";
import { AuthModal } from "@/ui/components/AuthModal";
import type { RoomResponse } from "@/api/types";
import { getTokenRole, setToken } from "@/auth/tokenStorage";
import { apiPost } from "@/api/apiClient";

interface Props {
  /** The room's UUID — used as the Yjs room name and WebSocket path. */
  roomId: string;
  /** A valid JWT passed to the WebSocket provider for authentication. */
  token: string;
  /** Room metadata used to show the claim banner for unclaimed rooms. */
  room: RoomResponse;
}

/**
 * Template layout for a collaborative editing session.
 *
 * Owns the collaboration hook and renders collaboration-specific chrome
 * (presence bar, connection indicator, claim banner) around a pure {@link EditorView}.
 * The editor itself has no knowledge of the surrounding layout.
 */
export function CollaborationLayout({ roomId, token, room }: Props) {
  const { viewModel, status, users, reconnect } = useCollaborativeEditor({
    roomId,
    token,
  });

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Determine whether to show the guest claim banner:
  // - Current JWT is a guest token
  // - Room is not yet claimed by any member
  const isGuest = getTokenRole() === "GUEST";
  const showClaimBanner = isGuest && !room.isClaimed;

  async function handleClaimSuccess(memberToken: string) {
    setToken(memberToken);
    // Claim the room with the new member token
    await apiPost(`/api/rooms/${roomId}/claim`);
    // Reconnect WebSocket with the member JWT, preserving Y.Doc state
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
          <span>You are editing as a Guest. Sign in to save this room permanently.</span>
          <button
            id="sign-in-to-claim-btn"
            onClick={() => { setShowAuthModal(true); }}
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
          roomId={roomId}
          onSuccess={(memberToken) => { void handleClaimSuccess(memberToken); }}
          onClose={() => { setShowAuthModal(false); }}
        />
      )}
    </div>
  );
}
