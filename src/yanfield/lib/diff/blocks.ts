/**
 * 正文块级 diff：AI 改动不直接覆盖正文，而是拆成「按块的增/删/改」，
 * 由作者逐块接受或拒绝；未被接受的块保持手写原文不动。
 *
 * 块 = 正文里的一个顶层节点（通常是 <p>，也可能是 <h1>/<blockquote>/<ul> 等）。
 */

export interface Block {
  id: string;
  html: string;
  text: string;
}

export type DiffLineType = "same" | "add" | "del";

export interface InlineDiff {
  type: DiffLineType;
  text: string;
}

export interface BlockChange {
  id: string;
  type: "added" | "removed" | "changed";
  /** 变化前的块 html（removed/changed） */
  before?: string;
  /** 变化后的块 html（added/changed） */
  after?: string;
  /** 变化前的纯文本 */
  beforeText?: string;
  /** 变化后的纯文本 */
  afterText?: string;
  /** 块内逐字 diff（changed 时提供） */
  inline?: InlineDiff[];
  /** 该变化插入到哪个块之后（null = 正文开头）；仅对 added/changed 有意义 */
  anchorId: string | null;
}

export interface BlockDiff {
  items: BlockChange[];
  added: number;
  removed: number;
  changed: number;
}

const BLOCK_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "pre", "hr", "div"];

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}

const BLOCK_RE = new RegExp(`<(${BLOCK_TAGS.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi");

/** 把正文 HTML 拆成块（保留顶层块标签；无法识别的剩余文本包成段落） */
export function splitBlocks(html: string): Block[] {
  const source = (html ?? "").trim();
  if (!source) return [];
  const blocks: Block[] = [];
  let cursor = 0;
  let index = 0;

  const push = (raw: string) => {
    const node = raw.trim();
    if (!node) return;
    const text = stripTags(node);
    blocks.push({ id: `b${index}_${hash(text)}`, html: node, text });
    index += 1;
  };

  for (const match of source.matchAll(BLOCK_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      const leftover = source.slice(cursor, start).trim();
      if (leftover) push(`<p>${leftover}</p>`);
    }
    push(match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    const leftover = source.slice(cursor).trim();
    if (leftover) push(`<p>${leftover}</p>`);
  }
  if (blocks.length === 0) {
    const text = stripTags(source);
    if (text) blocks.push({ id: `b0_${hash(text)}`, html: `<p>${source}</p>`, text });
  }
  return blocks;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

/** 逐字/逐词 diff：先裁掉公共前后缀，再对中间段做 LCS */
export function diffInline(before: string, after: string): InlineDiff[] {
  if (before === after) return before ? [{ type: "same", text: before }] : [];
  const a = Array.from(before);
  const b = Array.from(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const aMid = a.slice(start, a.length - end);
  const bMid = b.slice(start, b.length - end);
  const out: InlineDiff[] = [];
  const push = (type: DiffLineType, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  push("same", a.slice(0, start).join(""));
  if (aMid.length === 0) {
    push("add", bMid.join(""));
  } else if (bMid.length === 0) {
    push("del", aMid.join(""));
  } else if (aMid.length * bMid.length > 60000) {
    push("del", aMid.join(""));
    push("add", bMid.join(""));
  } else {
    const n = aMid.length;
    const m = bMid.length;
    const dp: Uint16Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = aMid[i] === bMid[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (aMid[i] === bMid[j]) {
        push("same", aMid[i]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        push("del", aMid[i]);
        i++;
      } else {
        push("add", bMid[j]);
        j++;
      }
    }
    while (i < n) push("del", aMid[i++]);
    while (j < m) push("add", bMid[j++]);
  }
  push("same", a.slice(a.length - end).join(""));
  return out;
}

/** 比较两段正文，输出块级变化清单 */
export function diffBlocks(beforeHtml: string, afterHtml: string): BlockDiff {
  const a = splitBlocks(beforeHtml);
  const b = splitBlocks(afterHtml);
  const n = a.length;
  const m = b.length;
  const items: BlockChange[] = [];
  const counts = { added: 0, removed: 0, changed: 0 };

  // 块级 LCS（按归一化文本比较）
  const aText = a.map((block) => normalize(block.text));
  const bText = b.map((block) => normalize(block.text));
  const eq = (i: number, j: number) => aText[i] === bText[j];
  type Pair = { i: number; j: number };
  const samePairs: Pair[] = [];
  let start = 0;
  while (start < n && start < m && eq(start, start)) {
    samePairs.push({ i: start, j: start });
    start++;
  }
  let tail = 0;
  while (n - tail > start && m - tail > start && eq(n - tail - 1, m - tail - 1)) tail++;
  const an = n - tail - start;
  const bm = m - tail - start;
  // Bound memory/work on unusually long chapters. A huge unmatched middle is
  // conservatively offered as replacements, preserving exact accept/reject behavior.
  if (an > 0 && bm > 0 && (an + 1) * (bm + 1) <= 1_000_000) {
    const dp = Array.from({ length: an + 1 }, () => new Uint32Array(bm + 1));
    for (let i = an - 1; i >= 0; i--) {
      for (let j = bm - 1; j >= 0; j--) {
        dp[i][j] = eq(start + i, start + j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < an && j < bm) {
      if (eq(start + i, start + j)) {
        samePairs.push({ i: start + i, j: start + j });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  }
  for (let k = tail; k > 0; k--) samePairs.push({ i: n - k, j: m - k });

  let ai = 0;
  let bj = 0;
  let anchorId: string | null = null;
  for (const p of [...samePairs, { i: n, j: m }]) {
    const aSpan = a.slice(ai, p.i);
    const bSpan = b.slice(bj, p.j);
    const pairCount = Math.min(aSpan.length, bSpan.length);
    for (let k = 0; k < pairCount; k++) {
      const before = aSpan[k];
      const after = bSpan[k];
      items.push({
        id: before.id,
        type: "changed",
        before: before.html,
        after: after.html,
        beforeText: before.text,
        afterText: after.text,
        inline: diffInline(before.text, after.text),
        anchorId,
      });
      counts.changed++;
    }
    for (let k = pairCount; k < aSpan.length; k++) {
      items.push({ id: aSpan[k].id, type: "removed", before: aSpan[k].html, beforeText: aSpan[k].text, anchorId });
      counts.removed++;
    }
    for (let k = pairCount; k < bSpan.length; k++) {
      // Extra paragraphs follow paired replacements in this gap.
      const additionAnchor = pairCount > 0 ? aSpan[pairCount - 1].id : anchorId;
      items.push({ id: bSpan[k].id, type: "added", after: bSpan[k].html, afterText: bSpan[k].text, anchorId: additionAnchor });
      counts.added++;
    }
    if (p.i < n) anchorId = a[p.i].id;
    ai = p.i + 1;
    bj = p.j + 1;
  }

  return { items, ...counts };
}

/**
 * 应用 diff：acceptedIds 中列出的变化被接受，其余保持原文。
 * 返回更新后的正文 HTML。
 */
export function applyBlockDiff(beforeHtml: string, diff: BlockDiff, acceptedIds: string[]): string {
  const accepted = new Set(acceptedIds);
  const beforeBlocks = splitBlocks(beforeHtml);
  const replacements = new Map<string, string>();
  const removed = new Set<string>();
  const additions = new Map<string | null, string[]>();

  for (const item of diff.items) {
    if (!accepted.has(item.id)) continue;
    if (item.type === "changed") replacements.set(item.id, item.after ?? "");
    else if (item.type === "removed") removed.add(item.id);
    else if (item.type === "added") {
      const key = item.anchorId ?? null;
      const list = additions.get(key) ?? [];
      list.push(item.after ?? "");
      additions.set(key, list);
    }
  }

  const out: string[] = [];
  for (const html of additions.get(null) ?? []) out.push(html);
  for (const block of beforeBlocks) {
    const removedHere = removed.has(block.id);
    if (!removedHere) out.push(replacements.get(block.id) ?? block.html);
    for (const html of additions.get(block.id) ?? []) out.push(html);
  }
  return out.filter(Boolean).join("");
}

/** 逐行 diff（文本文件/大纲用） */
export function diffTextLines(before: string, after: string): { type: DiffLineType; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: DiffLineType; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i++] });
    } else {
      out.push({ type: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}
