import type { IEditorState } from "@/editor/editorState";

export interface IViewModel {
  getViewportStart(): number;
  getViewportEnd(): number;
  getVisibleLines(): string[];
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
    return this.startLine;
  }

  getViewportEnd(): number {
    return Math.min(
      this.startLine + this.visibleLineCount,
      this.editor.getLineCount(),
    );
  }

  getVisibleLines(): string[] {
    const lines: string[] = [];
    const start = this.getViewportStart();
    const end = this.getViewportEnd();

    for (let i = start; i < end; i++) {
      lines.push(this.editor.getLineContent(i));
    }
    return lines;
  }

  isCursorVisible(): boolean {
    const cursorPos = this.editor.getCursor().getCurrent();
    const viewportStart = this.getViewportStart();
    const viewportEnd = this.getViewportEnd();

    return cursorPos.line >= viewportStart && cursorPos.line < viewportEnd;
  }

  getCursorViewportPosition(): { line: number; column: number } | null {
    if (!this.isCursorVisible()) {
      return null;
    }
    const cursorPos = this.editor.getCursor().getCurrent();
    return {
      line: cursorPos.line - this.getViewportStart(),
      column: cursorPos.column,
    };
  }

  scrollDown(lines: number = 1): void {
    const maxStart = this.editor.getLineCount() - this.visibleLineCount;
    this.startLine = Math.min(this.startLine + lines, maxStart);
  }

  scrollUp(lines: number = 1): void {
    this.startLine = Math.max(this.startLine - lines, 0);
  }
}
