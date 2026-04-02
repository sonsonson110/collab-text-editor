export const isWordChar = (c: string) => /[\w]/.test(c);
export const isWhitespace = (c: string) => /[ \t]/.test(c);

export function getWordLeftOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;

  let current = offset - 1;
  if (text[current] === "\n") return current; // stop just before newline

  // Phase 1: skip trailing spaces
  while (current >= 0 && isWhitespace(text[current])) {
    current--;
  }

  if (current < 0) return 0;
  if (text[current] === "\n") return current + 1; // stopped at newline

  // Phase 2: skip word characters OR punctuation
  const targetIsWord = isWordChar(text[current]);
  while (
    current >= 0 &&
    text[current] !== "\n" &&
    !isWhitespace(text[current])
  ) {
    if (isWordChar(text[current]) !== targetIsWord) break;
    current--;
  }

  return current + 1;
}

export function getWordRightOffset(text: string, offset: number): number {
  const len = text.length;
  if (offset >= len) return len;

  let current = offset;
  if (text[current] === "\n") return current + 1;

  // Phase 1: if starting on whitespace, skip all whitespace
  while (current < len && isWhitespace(text[current])) {
    current++;
  }

  if (current >= len || text[current] === "\n") return current;

  // Phase 2: we are now on a word/punct char. Skip all matching chars.
  const targetIsWord = isWordChar(text[current]);
  while (
    current < len &&
    text[current] !== "\n" &&
    !isWhitespace(text[current])
  ) {
    if (isWordChar(text[current]) !== targetIsWord) break;
    current++;
  }

  return current;
}
