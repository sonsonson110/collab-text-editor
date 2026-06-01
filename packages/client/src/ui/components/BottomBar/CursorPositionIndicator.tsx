import { useEditorStore } from "@/store/editorStore";
import { BottomBarItem } from "./BottomBarItem";

export function CursorPositionIndicator() {
  const cursorPosition = useEditorStore((state) => state.cursorPosition);
  const selectionCount = useEditorStore((state) => state.selectionCount);

  if (!cursorPosition) {
    return <BottomBarItem as="div" className="cursor-default">Ln 1, Col 1</BottomBarItem>;
  }

  const selectionText = selectionCount > 0 ? `(${selectionCount} selected)` : "";
  return (
    <BottomBarItem as="div" className="cursor-default">
      {`Ln ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1} ${selectionText}`}
    </BottomBarItem>
  );
}
