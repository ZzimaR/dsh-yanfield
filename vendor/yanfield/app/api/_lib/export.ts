/**
 * 导出工具：把作品/卷/章渲染为 Markdown 或纯文本，并生成附件下载响应。
 */
import type { Chapter, Novel, Volume } from "@/lib/types";
import { stripHtml } from "@/lib/ui/cn";
import TurndownService from "turndown";
import { looksLikeHtml, textToHtml } from "./text";

export type ExportFormat = "md" | "txt";
export type ExportScope = "book" | "volume" | "chapter";

export interface ExportVolumeGroup {
  volume: Volume;
  chapters: Chapter[];
}

export interface ExportInput {
  novel: Novel;
  format: ExportFormat;
  scope: ExportScope;
  volumes: ExportVolumeGroup[];
  looseChapters: Chapter[];
}

export interface ExportResult {
  body: string;
  fileName: string;
  contentType: string;
}

const SCOPE_LABEL: Record<ExportScope, string> = { book: "全书", volume: "分卷", chapter: "单章" };

const markdownConverter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  hr: "---",
});
markdownConverter.addRule("strike", {
  filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: (content) => `~~${content}~~`,
});
markdownConverter.addRule("underline", {
  filter: "u",
  replacement: (content) => `<u>${content}</u>`,
});
markdownConverter.addRule("highlight", {
  filter: "mark",
  replacement: (content) => `<mark>${content}</mark>`,
});

export function asExportFormat(value: string | null | undefined): ExportFormat {
  return value === "txt" ? "txt" : "md";
}

export function asExportScope(value: string | null | undefined): ExportScope {
  if (value === "volume" || value === "chapter") return value;
  return "book";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateStamp(date = new Date()): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

/** 文件名去非法字符（保留中文）并限制长度 */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || "yanfield";
}

function plain(html: string): string {
  return stripHtml(html)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdown(content: string): string {
  if (!content.trim()) return "";
  const isHtml = looksLikeHtml(content) || /<(?:hr|pre|code|u|s|del|mark)\b[^>]*>/i.test(content);
  return markdownConverter.turndown(isHtml ? content : textToHtml(content)).trim();
}

function heading(text: string, level: number, format: ExportFormat): string {
  return format === "md" ? `${"#".repeat(level)} ${text}` : text;
}

export function buildExport(input: ExportInput): ExportResult {
  const { novel, format, scope, volumes, looseChapters } = input;
  const lines: string[] = [];

  const chapterBlock = (chapter: Chapter, level: number): void => {
    lines.push(heading(chapter.title, level, format));
    const text = format === "md" ? markdown(chapter.content) : plain(chapter.content);
    if (text) lines.push("", text);
    lines.push("");
  };

  const volumeBlock = (group: ExportVolumeGroup, level: number): void => {
    lines.push(heading(group.volume.title, level, format));
    const summary = plain(group.volume.summary);
    if (summary) lines.push("", format === "md" ? `> ${summary.replace(/\n+/g, " ")}` : summary);
    lines.push("");
    for (const chapter of group.chapters) chapterBlock(chapter, level + 1);
  };

  const novelMeta = (): void => {
    if (format !== "md") {
      lines.push(novel.title, "");
      const meta: string[] = [];
      if (novel.author) meta.push(`作者：${novel.author}`);
      if (novel.genre) meta.push(`题材：${novel.genre}`);
      if (meta.length > 0) lines.push(meta.join("\n"), "");
      const synopsis = novel.synopsis.trim();
      if (synopsis) lines.push("简介", "", synopsis, "");
      return;
    }
    lines.push(heading(novel.title, 1, format), "");
    const meta: string[] = [];
    if (novel.author) meta.push(`作者：${novel.author}`);
    if (novel.genre) meta.push(`题材：${novel.genre}`);
    if (novel.tags.length > 0) meta.push(`标签：${novel.tags.join(" / ")}`);
    if (meta.length > 0) lines.push(meta.join("  \n"), "");
    const synopsis = novel.synopsis.trim();
    if (synopsis) lines.push(`> ${synopsis.replace(/\n+/g, " ")}`, "");
  };

  if (scope === "book") {
    novelMeta();
    for (const group of volumes) volumeBlock(group, 2);
    if (looseChapters.length > 0) {
      lines.push(heading("未分卷章节", 2, format), "");
      for (const chapter of looseChapters) chapterBlock(chapter, 3);
    }
  } else if (scope === "volume") {
    novelMeta();
    const group = volumes[0];
    if (group) volumeBlock(group, 2);
  } else {
    novelMeta();
    const chapter = volumes.flatMap((group) => group.chapters)[0] ?? looseChapters[0];
    if (chapter) {
      lines.push(heading(chapter.title, 2, format));
      const text = format === "md" ? markdown(chapter.content) : plain(chapter.content);
      if (text) lines.push("", text);
      lines.push("");
    }
  }

  const body = `${lines.join("\n").trim()}\n`;
  return {
    body,
    fileName: `${safeFileName(novel.title)}-${SCOPE_LABEL[scope]}-${dateStamp()}.${format}`,
    contentType: format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
  };
}

/** 构造带 Content-Disposition 的附件下载响应（中文文件名走 RFC 5987） */
export function buildExportResponse(result: ExportResult): Response {
  const format = result.contentType.includes("markdown") ? "md" : "txt";
  const asciiName = `yanfield-${dateStamp()}.${format}`;
  const headers = new Headers({
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    "Cache-Control": "no-store",
  });
  return new Response(result.body, { status: 200, headers });
}
