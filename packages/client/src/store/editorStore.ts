import { create } from "zustand";
import type { RoomResponse } from "@/api/types";

interface EditorState {
  cursorPosition: { line: number; column: number } | null;
  selectionCount: number;
  /** Epoch ms of the last successful snapshot save, or null if none received yet. */
  lastSavedAt: number | null;
  effectiveRole: string | null;
  room: RoomResponse | null;
  setCursorPosition: (position: { line: number; column: number } | null) => void;
  setSelectionCount: (count: number) => void;
  setLastSavedAt: (timestamp: number | null) => void;
  setEffectiveRole: (role: string | null) => void;
  setRoom: (room: RoomResponse | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cursorPosition: null,
  selectionCount: 0,
  lastSavedAt: null,
  effectiveRole: null,
  room: null,
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectionCount: (selectionCount) => set({ selectionCount }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  setEffectiveRole: (effectiveRole) => set({ effectiveRole }),
  setRoom: (room) => set({ room }),
}));


