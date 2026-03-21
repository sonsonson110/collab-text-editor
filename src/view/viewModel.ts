import type { IEditorState } from "@/editor/editorState";
import type { ViewLine } from "./types";

export interface IViewModel {
  getViewportStart(): number;
  getViewportEnd(): number;
  getVisibleLines(): ViewLine[];
  isCursorVisible(): boolean;
  getCursorViewportPosition(): { line: number; column: number } | null;
  scrollDown(lines?: number): void;
  scrollUp(lines?: number): void;
}

export class ViewModel implements IViewModel {
  private editor: IEditorState;
  private startLine: number;
  private visibleLineCount: number;

  constructor(
    editor: IEditorState,
    startLine: number = 0,
    visibleLineCount: number = 20,
  ) {
    this.editor = editor;
    this.startLine = startLine;
    this.visibleLineCount = visibleLineCount;
  }

  getViewportStart(): number {
    const possibleStart = this.editor.getLineCount() - this.visibleLineCount;
    const safePossibleStart = Math.max(possibleStart, 0);
    return Math.min(this.startLine, safePossibleStart);
  }

  getViewportEnd(): number {
    return Math.min(
      this.startLine + this.visibleLineCount,
      this.editor.getLineCount(),
    );
  }

  getVisibleLines(): ViewLine[] {
    const lines: ViewLine[] = [];
    const start = this.getViewportStart();
    const end = this.getViewportEnd();

    for (let i = start; i < end; i++) {
      lines.push({
        lineNumber: i,
        content: this.editor.getLineContent(i),
      });
    }
    return lines;
  }

  isCursorVisible(): boolean {
    const cursorPos = this.editor.getCursor().active;
    const viewportStart = this.getViewportStart();
    const viewportEnd = this.getViewportEnd();

    return cursorPos.line >= viewportStart && cursorPos.line < viewportEnd;
  }

  getCursorViewportPosition(): { line: number; column: number } | null {
    if (!this.isCursorVisible()) {
      return null;
    }
    const cursorPos = this.editor.getCursor().active;
    return {
      line: cursorPos.line - this.getViewportStart(),
      column: cursorPos.column,
    };
  }

  scrollDown(lines: number = 1): void {
    const newStart = this.editor.getLineCount() - this.visibleLineCount;
    const safeNewStart = Math.max(newStart, 0);
    this.startLine = Math.min(this.startLine + lines, safeNewStart);
  }

  scrollUp(lines: number = 1): void {
    this.startLine = Math.max(this.startLine - lines, 0);
  }
}
