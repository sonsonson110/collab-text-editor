import { create } from "zustand";

interface EditorState {
  cursorPosition: { line: number; column: number } | null;
  selectionCount: number;
  setCursorPosition: (position: { line: number; column: number } | null) => void;
  setSelectionCount: (count: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cursorPosition: null,
  selectionCount: 0,
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setSelectionCount: (selectionCount) => set({ selectionCount }),
}));
