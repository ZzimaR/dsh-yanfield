import type { Fields } from "./types";

export const TOOL_RECEIPT_LIMIT = 4000;

/** Fit the serialized receipt, including JSON escapes and pagination metadata. */
export function chapterReadPage(row: Fields, offset: number, limit: number): Fields {
  const text = String(row.content ?? "");
  const start = Math.min(offset, text.length);
  const pagination = (length: number) => ({
    content: text.slice(start, start + length),
    contentOffset: start,
    contentTotal: text.length,
    nextOffset: start + length < text.length ? start + length : null,
    truncated: start + length < text.length,
  });
  const maxLength = Math.min(limit, text.length - start);
  const fullPage = { ...row, ...pagination(maxLength) };
  if (JSON.stringify(fullPage).length <= TOOL_RECEIPT_LIMIT) return fullPage;

  const { id, title, wordCount } = row;
  const page = (length: number) => ({ id, title, wordCount, ...pagination(length) });
  let low = 0;
  let high = maxLength;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JSON.stringify(page(middle)).length <= TOOL_RECEIPT_LIMIT) low = middle;
    else high = middle - 1;
  }
  return page(low);
}
