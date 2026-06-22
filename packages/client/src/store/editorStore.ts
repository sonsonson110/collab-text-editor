import { create } from "zustand";
import type { RoomResponse } from "@/api/types";

interface EditorState {
  cursorPosition: { line: number; column: number } | null;
  selectionCount: number;
  /** Epoch ms of the last successful snapshot save, or null if none received yet. */
  lastSavedAt: number | null;
  effectiveRole: string | null;
  /** Whether the current user is an explicit database member of the room (not a guest). */
  isMember: boolean;
  room: RoomResponse | null;
  setCursorPosition: (position: { line: number; column: number } | null) => void;
  setSelectionCount: (count: number) => void;
  setLastSavedAt: (timestamp: number | null) => void;
  setEffectiveRole: (role: string | null) => void;
  /** Sets whether the current user is an explicit database member of the room. */
  setIsMember: (isMember: boolean) => void;
  setRoom: (room: RoomResponse | null) => void;
  /**
   * Updates the `accessMode` field on the current room without replacing the
   * entire room object. Used by the MSG_PERMISSION_CHANGED handler to propagate
   * real-time access-mode changes to `RoomAccessIndicator` without a round-trip.
   */
  updateRoomAccessMode: (accessMode: "PUBLIC_EDIT" | "PUBLIC_VIEW" | "PRIVATE") => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cursorPosition: null,
  selectionCount: 0,
  lastSavedAt: null,
  effectiveRole: null,
  isMember: false,
  room: null,
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectionCount: (selectionCount) => set({ selectionCount }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  setEffectiveRole: (effectiveRole) => set({ effectiveRole }),
  setIsMember: (isMember) => set({ isMember }),
  setRoom: (room) => set({ room }),
  updateRoomAccessMode: (accessMode) =>
    set((state) =>
      state.room ? { room: { ...state.room, accessMode } } : {},
    ),
}));


