import { create } from "zustand";

interface EditorState {
  cursorPosition: { line: number; column: number } | null;
  selectionCount: number;
  /** Epoch ms of the last successful snapshot save, or null if none received yet. */
  lastSavedAt: number | null;
  setCursorPosition: (position: { line: number; column: number } | null) => void;
  setSelectionCount: (count: number) => void;
  setLastSavedAt: (timestamp: number | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cursorPosition: null,
  selectionCount: 0,
  lastSavedAt: null,
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectionCount: (selectionCount) => set({ selectionCount }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
}));

