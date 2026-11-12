import type { SelectionInfo } from "./types";

/**
 * 编辑器 ↔ AI 面板的跨组件通信。
 * 用 window 自定义事件解耦，避免把 editor 实例层层透传。
 * 注意：这些事件只在浏览器端派发，SSR 阶段不会执行。
 */

/** Alt+J：请求 AI 面板聚焦输入框（AI 面板监听） */
export const FOCUS_AI_EVENT = "yanfield:editor-focus-ai";

/** 选区变化广播（AI 面板监听，用于展示「已选中 N 字」等提示） */
export const SELECTION_EVENT = "yanfield:editor-selection";

export interface SelectionEventDetail extends SelectionInfo {
  chapterId: string | null;
}

/** 请求聚焦 AI 输入框 */
export function emitFocusAi(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOCUS_AI_EVENT));
}

/** 广播当前选区 */
export function emitSelection(detail: SelectionEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SelectionEventDetail>(SELECTION_EVENT, { detail }));
}
