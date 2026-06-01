import { useEffect, useState } from "react";
import { INITIAL_TEXT } from "@/constants";
import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { HistoryManager } from "@/editor/history";
import { ViewModel } from "@/view/viewModel";
import { useEditorStore } from "@/store/editorStore";

/**
 * Bootstraps a solo (offline) editing session.
 *
 * Creates a local {@link Document} seeded with initial text, a {@link Cursor},
 * and a {@link HistoryManager}, then wires them into an {@link EditorState}
 * and {@link ViewModel}. No network connection or collaboration server is
 * required — the editor is fully functional offline.
 */
export function useSoloEditor() {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);

  useEffect(() => {
    const doc = new Document(INITIAL_TEXT);
    const cursor = new Cursor(new Position(0, 0));
    const history = new HistoryManager();
    const editorState = new EditorState(doc, cursor, history);
    const vm = new ViewModel(editorState);

    const storeUnsubscribe = editorState.subscribe(() => {
      const activeCursor = editorState.getCursor().active;
      const selectionCount = editorState.getSelectedText().length;
      useEditorStore.getState().setCursorPosition({
        line: activeCursor.line,
        column: activeCursor.column,
      });
      useEditorStore.getState().setSelectionCount(selectionCount);
    });

    const initialCursor = editorState.getCursor().active;
    const initialSelectionCount = editorState.getSelectedText().length;
    useEditorStore.getState().setCursorPosition({
      line: initialCursor.line,
      column: initialCursor.column,
    });
    useEditorStore.getState().setSelectionCount(initialSelectionCount);

    setViewModel(vm);

    return () => {
      storeUnsubscribe();
    };
  }, []);

  return { viewModel };
}
