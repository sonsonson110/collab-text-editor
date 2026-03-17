import type { Document } from "@/core/document/document";
import type { Cursor } from "@/editor/cursor/cursor";

export class EditorState {
  document: Document;
  cursor: Cursor;

  constructor(doc: Document, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }
}
