import { create } from "zustand";

interface EditorState {
  cursorPosition: { line: number; column: number } | null;
  selectionCount: number;
  setCursorState: (
    position: { line: number; column: number } | null,
    selectionCount: number
  ) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cursorPosition: null,
  selectionCount: 0,
  setCursorState: (cursorPosition, selectionCount) =>
    set({ cursorPosition, selectionCount }),
}));
