import * as Y from "yjs";
import type { IDocument } from "@/core/document/idocument";
import { LineIndex } from "@/core/lines/lineIndex";
import type { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

/**
 * A Y.Text-backed implementation of IDocument.
 *
 * Replaces the internal string buffer with a Yjs CRDT Y.Text, enabling
 * conflict-free concurrent edits when connected to a sync provider.
 *
 * Design:
 *  - All mutations (insert/delete/replace) are wrapped in a Yjs transaction
 *    tagged with origin 'local', so the yText observer can skip re-notifying
 *    external listeners for changes that EditorState already dispatched.
 *  - textSnapshot caches yText.toString() to avoid repeated CRDT traversals
 *    during read-heavy operations (getLineContent, getTextInRange, etc.).
 *  - lineIndex is rebuilt from textSnapshot on every change — same O(n)
 *    strategy as the solo Document class; incremental update is a Phase 5
 *    optimisation.
 *
 * Cursor drift on remote edits is intentionally deferred to Phase 2 when
 * Y.RelativePosition will be wired up.
 *
 * Undo/Redo stays with the solo HistoryManager for now; Y.UndoManager
 * replaces it in a later phase.
 */
export class CollaborativeDocument implements IDocument {
  private yText: Y.Text;
  private lineIndex: LineIndex;
  private textSnapshot: string;
  private externalListeners = new Set<() => void>();

  /**
   * @param yText - A Y.Text instance that must already be attached to a Y.Doc.
   */
  constructor(yText: Y.Text) {
    this.yText = yText;
    this.textSnapshot = yText.toString();
    this.lineIndex = new LineIndex(this.textSnapshot);

    // Listen for ALL changes (local + remote).
    // Local mutations are tagged with origin 'local' and do NOT trigger
    // externalListeners — EditorState.execute() already calls notifyListeners()
    // after every local command. Remote mutations carry a different origin and
    // DO notify so that EditorState propagates the change to the UI.
    this.yText.observe((event: Y.YTextEvent) => {
      this.textSnapshot = this.yText.toString();
      this.lineIndex.rebuild(this.textSnapshot);

      if (event.transaction.origin !== "local") {
        this.externalListeners.forEach((fn) => fn());
      }
    });
  }

  // ---------------------------------------------------------------------------
  // IDocument — subscription (collaborative extension)
  // ---------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.externalListeners.add(listener);
    return () => {
      this.externalListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // IDocument — reads (delegate to textSnapshot + lineIndex)
  // ---------------------------------------------------------------------------

  getText(): string {
    return this.textSnapshot;
  }

  getLength(): number {
    return this.textSnapshot.length;
  }

  getLineCount(): number {
    return this.lineIndex.getLineCount();
  }

  getMaxLineLength(): number {
    return this.lineIndex.getMaxLineLength();
  }

  getPositionAt(offset: number): Position {
    return this.lineIndex.offsetToPosition(offset);
  }

  getOffsetAt(position: Position): number {
    return this.lineIndex.positionToOffset(position);
  }

  getLineContent(line: number): string {
    const lineStart = this.lineIndex.getLineStart(line);
    const totalLines = this.lineIndex.getLineCount();
    const nextLineStart =
      line + 1 < totalLines
        ? this.lineIndex.getLineStart(line + 1)
        : this.textSnapshot.length;

    let text = this.textSnapshot.slice(lineStart, nextLineStart);
    if (text.endsWith("\n")) {
      text = text.slice(0, -1);
    }
    return text;
  }

  getLineLength(line: number): number {
    const lineStart = this.lineIndex.getLineStart(line);
    const totalLines = this.lineIndex.getLineCount();
    const nextLineStart =
      line + 1 < totalLines
        ? this.lineIndex.getLineStart(line + 1) - 1 // exclude newline character
        : this.textSnapshot.length;
    return nextLineStart - lineStart;
  }

  getTextInRange(range: Range): string {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    return this.textSnapshot.slice(startOffset, endOffset);
  }

  // ---------------------------------------------------------------------------
  // IDocument — mutations (forward to Y.Text, tagged as 'local')
  // ---------------------------------------------------------------------------

  insert(position: Position, text: string): void {
    const offset = this.getOffsetAt(position);
    this.yText.doc!.transact(() => {
      this.yText.insert(offset, text);
    }, "local");
  }

  delete(range: Range): void {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    const length = endOffset - startOffset;
    if (length <= 0) return;
    this.yText.doc!.transact(() => {
      this.yText.delete(startOffset, length);
    }, "local");
  }

  replace(range: Range, newText: string): void {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    const deleteLength = endOffset - startOffset;
    this.yText.doc!.transact(() => {
      if (deleteLength > 0) {
        this.yText.delete(startOffset, deleteLength);
      }
      if (newText.length > 0) {
        this.yText.insert(startOffset, newText);
      }
    }, "local");
  }
}
