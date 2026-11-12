"use client";

/**
 * 文风快捷选项：写入 ContextConfig.customInstruction，随每次对话请求发送。
 * 说明：这里只是「作者的写作偏好」，不是模型能力开关；清空后不携带任何文风指令。
 */

export interface StyleOption {
  /** 显示名，同时作为写入指令的文风标记 */
  value: string;
  label: string;
  /** 一句话说明，仅用于下拉提示 */
  hint: string;
}

/** 常用文风：冷峻克制 / 轻松诙谐 / 古典白话 / 现代口语 / 影视镜头感 */
export const STYLE_OPTIONS: StyleOption[] = [
  { value: "冷峻克制", label: "冷峻克制", hint: "短句、留白、少形容词" },
  { value: "轻松诙谐", label: "轻松诙谐", hint: "口语、机锋、轻喜剧节奏" },
  { value: "古典白话", label: "古典白话", hint: "明清小说语感，雅而不涩" },
  { value: "现代口语", label: "现代口语", hint: "干净利落，贴近日常" },
  { value: "影视镜头感", label: "影视镜头感", hint: "画面调度、景别切换" },
];

/** 文风指令在 customInstruction 中的行前缀（用于识别 / 清除 / 替换） */
export const STYLE_PREFIX = "【文风偏好】";

/** 从自定义指令里读回当前文风（没有则返回 null） */
export function readStyleFromInstruction(instruction: string | null | undefined): string | null {
  if (!instruction) return null;
  const line = instruction
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith(STYLE_PREFIX));
  if (!line) return null;
  const value = line.slice(STYLE_PREFIX.length).trim();
  return value || null;
}

/**
 * 写入 / 替换 / 清除文风：
 * - style 为 null 时删除文风行，其余自定义指令原样保留；
 * - 已有文风行时原位替换，避免重复堆积。
 */
export function applyStyleToInstruction(
  instruction: string | null | undefined,
  style: string | null,
): string {
  const lines = (instruction ?? "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(STYLE_PREFIX));
  if (style) lines.push(`${STYLE_PREFIX}${style}`);
  return lines.join("\n").trim();
}
