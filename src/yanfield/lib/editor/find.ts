/**
 * 查找 / 替换的纯文本匹配工具（纯函数，可单测，不依赖 DOM 与 Tiptap 运行时）。
 *
 * 职责只有两件事：
 * 1. 把 ProseMirror 文档里的「文本块」摊平成 { from, to, text } 段：from / to 是
 *    文档位置（position），text 是块内纯文本。ProseMirror 里文本块的 nodeSize 与
 *    JS 字符串的 length（UTF-16 码元数）一致，所以段内下标可以直接映射回文档位置，
 *    中文、emoji 都无需额外换算。
 * 2. 在这些段里找纯文本命中，返回可以交给 editor.chain().setTextSelection 的区间。
 *
 * 刻意「逐段匹配、不跨段」：跨段命中（例如跨标题与正文）即使命中，中间也可能夹着
 * 图片 / 分隔线等非文本节点，无法用一个安全区间表达；逐段匹配时跨段查询天然忽略，
 * 不会抛错，也不会给出会把文档改坏的区间。
 */

/** 一段文本块（标题、段落、列表项里的段落等）在文档中的位置与内容 */
export interface TextSegment {
  /** 段首在文档中的位置（包含） */
  from: number;
  /** 段尾在文档中的位置（不包含） */
  to: number;
  /** 段内纯文本 */
  text: string;
}

/** 一处文本命中 */
export interface FindMatch {
  /** 命中区间的起点（包含） */
  from: number;
  /** 命中区间的终点（不包含） */
  to: number;
  /** 命中的文本本身（等于 query） */
  text: string;
  /** 命中落在 collectTextSegments 结果的第几段 */
  segmentIndex: number;
  /** 命中在段内的起始下标（UTF-16 码元） */
  index: number;
}

/** 只依赖遍历接口的最小文档形状，测试里可以传假实现 */
export interface TraversableDocument {
  descendants(callback: (node: TraversableNode, pos: number) => void | boolean): void;
}

export interface TraversableNode {
  isTextblock: boolean;
  textContent: string;
}

/**
 * 收集文档里所有非空文本块。
 *
 * 空块（例如空段落 `<p></p>`）不产生 segment——它没有文本可匹配，也不能作为命中区间；
 * 位置按 ProseMirror 语义：块节点本身从 pos 开始，内容从 pos + 1 开始。
 */
export function collectTextSegments(doc: TraversableDocument): TextSegment[] {
  const segments: TextSegment[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = typeof node.textContent === "string" ? node.textContent : "";
    if (text.length === 0) return;
    segments.push({ from: pos + 1, to: pos + 1 + text.length, text });
  });
  return segments;
}

/**
 * 在文本段里查找 query 的所有命中（区分大小写、不重叠）。
 *
 * - query 为空返回空数组；
 * - 命中按下标递增排序；
 * - 「不重叠」：例如在 `aaa` 里查 `aa` 只得到 1 处（下标 0），不会得到 0 与 1 两处，
 *   保证后续「全部替换」不会因为两个区间共用字符而互相破坏；
 * - 连续命中（`abab` 查 `ab`）得到 2 处。
 */
export function findMatches(segments: TextSegment[], query: string): FindMatch[] {
  if (query.length === 0) return [];
  const matches: FindMatch[] = [];
  segments.forEach((segment, segmentIndex) => {
    let index = segment.text.indexOf(query);
    while (index !== -1) {
      matches.push({
        from: segment.from + index,
        to: segment.from + index + query.length,
        text: query,
        segmentIndex,
        index,
      });
      index = segment.text.indexOf(query, index + query.length);
    }
  });
  return matches;
}

/**
 * 把命中下标下一步推进（循环）：
 * 没有命中返回 0；当前下标越界时回到第一处（step > 0）或最后一处（step < 0）。
 */
export function stepMatchIndex(current: number, total: number, step: 1 | -1): number {
  if (total <= 0) return 0;
  if (current < 0 || current >= total) return step > 0 ? 0 : total - 1;
  return (current + step + total) % total;
}

/** 把命中下标夹到 [0, total - 1]；total 为 0 时恒为 0 */
export function clampMatchIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

/**
 * 「全部替换」的执行顺序：按文档位置从后往前替换。
 * 这样前面的替换不会让后面的位置偏移，可以安全地用同一个 transaction（或链式命令）批量处理。
 */
export function sortMatchesForReplacement(matches: readonly FindMatch[]): FindMatch[] {
  return matches.slice().sort((a, b) => b.from - a.from);
}
