/**
 * 导入相关的文本工具：按章节标题拆分、纯文本 ⇄ Tiptap HTML。
 */
import { ApiError } from "@/lib/api-utils";
import { countWords, stripHtml } from "@/lib/ui/cn";
import type { ImportChapterDraft } from "@/lib/types";

export { countWords, stripHtml };

/** 单次导入最多拆分的章节数 */
export const MAX_IMPORT_CHAPTERS = 2000;

/**
 * 默认章节切分正则：行首「第X章/回/节/卷/篇/集」或「1、」「1.」编号行。
 * 标题取整行文本，正文从标题行末尾切到下一个标题行之前。
 */
export const DEFAULT_SPLIT_REGEX =
  "^[ \\t　]*(?:第[零〇一二三四五六七八九十百千万两\\d]+[章回节卷篇集][^\\n]{0,40}|\\d{1,4}[、.．:：][^\\n]{0,40})[ \\t]*$";

const HTML_HINT = /<(?:p|div|br|span|strong|em|h[1-6]|ul|ol|li|blockquote)\b[^>]*>/i;

export function looksLikeHtml(text: string): boolean {
  return HTML_HINT.test(text);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 纯文本 → Tiptap 兼容 HTML（空行分段，段内单换行用 <br />） */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** 章节正文入库前统一转 HTML：已是 HTML 则清掉危险标签/内联事件 */
export function toContentHtml(content: string): string {
  if (!looksLikeHtml(content)) return textToHtml(content);
  return content
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function cleanTitle(line: string): string {
  return line
    .replace(/^[\s　#*\-—=]+/, "")
    .replace(/[\s　]+$/, "")
    .trim();
}

/**
 * 按章节标题拆分纯文本。
 * @param text 原始文本
 * @param customRegex 自定义切分正则（用户提供，可无捕获组；无效时抛 400）
 * @param fallbackTitle 未识别到任何标题时使用的章名
 */
export function splitChapters(text: string, customRegex?: string, fallbackTitle = "正文"): ImportChapterDraft[] {
  const source = text.replace(/\r\n?/g, "\n").trim();
  if (!source) return [];

  let regex: RegExp;
  try {
    regex = new RegExp(customRegex?.trim() || DEFAULT_SPLIT_REGEX, "gm");
  } catch {
    throw new ApiError("章节分割正则无效", 400);
  }

  const headings: { index: number; end: number; title: string }[] = [];
  let guard = 0;
  while (true) {
    const match = regex.exec(source);
    if (!match) break;
    guard += 1;
    if (guard > 20000) throw new ApiError("章节分割次数过多，请检查分割正则", 400);
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    let end = match.index + match[0].length;
    while (end < source.length && source[end] !== "\n") end += 1;
    headings.push({ index: match.index, end, title: cleanTitle(source.slice(match.index, end)) });
    if (headings.length > MAX_IMPORT_CHAPTERS) {
      throw new ApiError(`章节数超过上限（${MAX_IMPORT_CHAPTERS}），请拆分文件后导入`, 400);
    }
  }

  if (headings.length === 0) return [{ title: fallbackTitle, content: source }];

  const drafts: ImportChapterDraft[] = [];
  const prelude = source.slice(0, headings[0].index).trim();
  if (prelude) drafts.push({ title: "前言", content: prelude });

  headings.forEach((heading, index) => {
    const nextIndex = index + 1 < headings.length ? headings[index + 1].index : source.length;
    const content = source.slice(heading.end, nextIndex).trim();
    if (!content) return;
    drafts.push({ title: heading.title || `第 ${drafts.length + 1} 章`, content });
  });

  if (drafts.length === 0) return [{ title: fallbackTitle, content: source }];
  if (drafts.length > MAX_IMPORT_CHAPTERS) {
    throw new ApiError(`章节数超过上限（${MAX_IMPORT_CHAPTERS}，含前言），请拆分文件后导入`, 400);
  }
  return drafts;
}
