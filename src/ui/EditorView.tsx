import type { IEditorState } from "@/editor/editorState";
import { mapKeyboardEvent } from "@/ui/inputHandler";
import type { ViewModel } from "@/view/viewModel";
import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEventHandler,
} from "react";
import { Cursor as CursorComponent } from "./Cursor";
import { Line } from "./Line";

interface Props {
  viewModel: ViewModel;
  editor: IEditorState;
}

export function EditorView({ viewModel, editor }: Props) {
  const [lines, setLines] = useState(viewModel.getVisibleLines());
  const [cursor, setCursor] = useState(viewModel.getCursorViewportPosition());

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    const command = mapKeyboardEvent(e);
    if (command) {
      editor.execute(command);
      e.preventDefault();
    }
  };

  const sync = useCallback(() => {
    viewModel.scrollToCursor();
    setLines(viewModel.getVisibleLines());
    setCursor(viewModel.getCursorViewportPosition());
  }, [viewModel]);

  useEffect(() => {
    sync();
    return editor.subscribe(sync);
  }, [editor, sync]);

  return (
    <div
      className="editor border border-white"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {lines.map((line) => (
        <Line key={line.lineNumber} line={line} />
      ))}

      {cursor && <CursorComponent position={cursor} />}
    </div>
  );
}
