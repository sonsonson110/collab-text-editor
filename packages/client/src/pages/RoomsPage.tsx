import { useEffect, useState } from "react";
import { fetchMyRooms } from "@/api/roomApi";
import type { RoomResponse } from "@/api/types";
import { ensureToken } from "@/auth/authService";
import { setToken, getUserIdFromToken, getTokenRole } from "@/auth/tokenStorage";
import { AppLayout } from "@/ui/templates/AppLayout";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { apiPost } from "@/api/apiClient";
import type { QuickshareResponse } from "@/api/types";
import { AuthModal } from "@/ui/components/AuthModal";
import { Lock } from "lucide-react";

type PageState =
  | { phase: "loading" }
  | { phase: "unauthenticated" }
  | {
      phase: "ready";
      ownedRooms: RoomResponse[];
      participatedRooms: RoomResponse[];
    }
  | { phase: "error"; message: string };

export function RoomsPage() {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [isCreating, setIsCreating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setState({ phase: "loading" });
        const token = await ensureToken();
        if (cancelled) {
          return;
        }
        setToken(token);

        const role = getTokenRole();
        if (role !== "AUTHENTICATED") {
          setState({ phase: "unauthenticated" });
          return;
        }

        const userId = getUserIdFromToken(token);
        if (!userId) {
          throw new Error("Unable to identify user from token.");
        }

        const response = await fetchMyRooms();

        if (cancelled) {
          return;
        }

        if (response.status === 403) {
          setState({ phase: "unauthenticated" });
          return;
        }

        if (!response.ok || !response.data) {
          setState({
            phase: "error",
            message: `Failed to load rooms (HTTP ${response.status})`,
          });
          return;
        }

        const rooms = response.data;
        // Sort rooms by createdAt descending
        rooms.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const ownedRooms = rooms.filter((r) => r.ownerId === userId);
        const participatedRooms = rooms.filter((r) => r.ownerId !== userId);

        setState({ phase: "ready", ownedRooms, participatedRooms });
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "Failed to load rooms",
          });
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [reloadTrigger]);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const response = await apiPost<QuickshareResponse>("/api/rooms/quickshare");
      if (response.ok && response.data) {
        navigate(`/room/${response.data.slug}`);
      } else {
        console.error("Failed to create room", response.status);
        setIsCreating(false);
      }
    } catch (err) {
      console.error(err);
      setIsCreating(false);
    }
  };

  const handleAuthSuccess = (memberToken: string) => {
    setToken(memberToken);
    setShowAuthModal(false);
    setReloadTrigger((prev) => prev + 1);
  };

  const renderTable = (rooms: RoomResponse[], emptyMessage: string) => {
    if (rooms.length === 0) {
      return <div className="text-muted-foreground p-4 text-sm">{emptyMessage}</div>;
    }

    return (
      <div className="rounded-md border bg-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground border-b font-medium">
            <tr>
              <th className="px-4 py-3">Room Name</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y text-foreground">
            {rooms.map((room) => (
              <tr key={room.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {room.title || new Date(room.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                    {room.accessMode === "PUBLIC_EDIT"
                      ? "Public Edit"
                      : room.accessMode === "PUBLIC_VIEW"
                        ? "Public View"
                        : "Private"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(room.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/room/${room.slug}`)}
                  >
                    Join
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-10 px-4 max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">My Rooms</h1>
            <p className="text-muted-foreground mt-1">
              Manage rooms you own and rooms you have joined.
            </p>
          </div>
          <Button onClick={handleCreateRoom} disabled={isCreating}>
            {isCreating ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Create Room
          </Button>
        </div>

        {state.phase === "loading" && (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {state.phase === "unauthenticated" && (
          <div className="border border-border bg-card rounded-xl shadow-md p-8 md:p-12 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Authentication Required</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Persistent room history is only available for registered users. Sign in or create an account to start managing and saving your collaborative workspaces.
              </p>
            </div>
            <Button
              id="rooms-auth-prompt-btn"
              size="lg"
              className="w-full sm:w-auto px-8 shadow-sm hover:shadow-md transition-all duration-200"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In / Create Account
            </Button>
          </div>
        )}

        {state.phase === "error" && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md">
            {state.message}
          </div>
        )}

        {state.phase === "ready" && (
          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Rooms I Own</h2>
              {renderTable(state.ownedRooms, "You don't own any rooms yet.")}
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Shared With Me</h2>
              {renderTable(state.participatedRooms, "You haven't joined any rooms yet.")}
            </section>
          </div>
        )}
      </div>

      {showAuthModal && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </AppLayout>
  );
}
