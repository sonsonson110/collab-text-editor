import type { Position } from "@/core/position/position";
import type { Range } from "@/core/position/range";

export interface IDocument {
  getText(): string;
  getLength(): number;
  getLineCount(): number;
  getMaxLineLength(): number;
  insert(position: Position, text: string): void;
  delete(range: Range): void;
  replace(range: Range, newText: string): void;
  getPositionAt(offset: number): Position;
  getOffsetAt(position: Position): number;
  getLineContent(line: number): string;
  getLineLength(line: number): number;
  getTextInRange(range: Range): string;
  /**
   * Optional: subscribe to *remote* document changes (e.g. from a Yjs peer).
   * Only collaborative document implementations need to provide this.
   * Returns an unsubscribe function.
   */
  subscribe?(listener: () => void): () => void;
}
