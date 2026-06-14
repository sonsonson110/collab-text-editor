import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/api/apiClient";
import type { RoomResponse } from "@/api/types";
import { Spinner } from "@/components/ui/spinner";
import { useEditorStore } from "@/store/editorStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RoomMemberResponse {
  id: string;
  roomId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  role: string;
}

interface Props {
  room: RoomResponse;
  onClose: () => void;
}

export function ShareModal({ room, onClose }: Props) {
  const [accessMode, setAccessMode] = useState(room.accessMode);
  const [members, setMembers] = useState<RoomMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("EDITOR");

  useEffect(() => {
    async function fetchMembers() {
      const res = await apiGet<RoomMemberResponse[]>(`/api/rooms/${room.id}/members`);
      if (res.ok && res.data) {
        setMembers(res.data);
      }
      setLoading(false);
    }
    void fetchMembers();
  }, [room.id]);

  async function handleAccessModeChange(mode: string) {
    const res = await apiPatch(`/api/rooms/${room.id}/access-mode`, { accessMode: mode });
    if (res.ok) {
      const updatedMode = mode as RoomResponse["accessMode"];
      setAccessMode(updatedMode);
      
      const currentRoom = useEditorStore.getState().room;
      if (currentRoom && currentRoom.id === room.id) {
        useEditorStore.getState().setRoom({
          ...currentRoom,
          accessMode: updatedMode,
        });
      }
    }
  }

  async function handleAddMember() {
    if (!newEmail) return;
    const res = await apiPost<RoomMemberResponse>(`/api/rooms/${room.id}/members`, {
      email: newEmail,
      role: newRole,
    });
    if (res.ok && res.data) {
      setMembers([...members, res.data]);
      setNewEmail("");
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    const res = await apiPatch<{role: string}>(`/api/rooms/${room.id}/members/${userId}`, { role });
    if (res.ok && res.data) {
      setMembers(members.map(m => m.userId === userId ? { ...m, role: res.data!.role } : m));
    }
  }

  async function handleRemoveMember(userId: string) {
    const res = await apiDelete(`/api/rooms/${room.id}/members/${userId}`);
    if (res.ok) {
      setMembers(members.filter(m => m.userId !== userId));
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share Room</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Link Access</label>
            <Select
              value={accessMode}
              onValueChange={(mode) => void handleAccessModeChange(mode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC_EDIT">Anyone with the link can edit</SelectItem>
                <SelectItem value="PUBLIC_VIEW">Anyone with the link can view</SelectItem>
                <SelectItem value="PRIVATE">Restricted (Only members)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Add Member</label>
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Select
                value={newRole}
                onValueChange={(role) => setNewRole(role)}
              >
                <SelectTrigger className="w-[120px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => void handleAddMember()}>Add</Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <label className="text-sm font-medium">Members</label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" /> Loading...</div>
            ) : members.length === 0 ? (
              <div className="text-sm text-muted-foreground">No explicit members yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{m.displayName || m.email || m.userId}</span>
                      {m.email && <span className="text-muted-foreground text-xs">{m.email}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.role}
                        onValueChange={(role) => void handleRoleChange(m.userId, role)}
                        disabled={m.role === 'OWNER'}
                      >
                        <SelectTrigger className="h-8 w-[100px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER" disabled>Owner</SelectItem>
                          <SelectItem value="EDITOR">Editor</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      {m.role !== 'OWNER' && (
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => void handleRemoveMember(m.userId)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

