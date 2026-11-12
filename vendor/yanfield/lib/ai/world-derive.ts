import { extractJson } from "@/lib/ai/prompts";

export interface CardFill {
  summary: string;
  content: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 补全当前卡片：只要摘要和正文。 */
export function parseCardFill(text: string): CardFill | null {
  const parsed = extractJson<unknown>(text);
  const record = asRecord(parsed);
  if (!record) return null;
  const summary = textOf(record.summary);
  const content = textOf(record.content);
  if (!summary && !content) return null;
  return { summary, content };
}
