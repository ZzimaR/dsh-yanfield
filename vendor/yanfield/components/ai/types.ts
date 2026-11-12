"use client";

/**
 * AI 面板内部类型（仅组件层使用，不进入 lib/types.ts 的领域模型）。
 * 领域类型一律复用 lib/types.ts，保证与后端接口同源。
 */
import type { CodexItem } from "@/lib/ai/codex";
import type { AgentDef, AgentId, AiAction, AiUsage, ChatMessage, ContextConfig } from "@/lib/types";

/** 面板输入模式：对话 / 起草 / 技能（技能=一键填入能力提示词模板） */
export type PanelMode = "chat" | "draft" | "skill";

/** @ 引用资料（与 AiChatRequest.mentions 结构一致） */
export interface MentionRef {
  type: "character" | "world" | "chapter" | "archive" | "foreshadow";
  id: string;
  label: string;
}

export interface AgentRequestContext {
  agentId: AgentId;
  chapterId: string | null;
  context: ContextConfig;
  mentions: MentionRef[];
  selection?: string;
  snapshot?: {
    kind: "world" | "character" | "foreshadow";
    id: string | null;
    fields: Record<string, unknown>;
  };
}

/** 引用选择器里的一条候选 */
export interface MentionOption extends MentionRef {
  description?: string;
}

/** 面板内消息模型：ChatMessage 的 UI 扩展（增加 reasoning / 本地流式态） */
export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  agentRun?: import("@/lib/ai/agent/types").AgentRun;
  actions: AiAction[];
  status: ChatMessage["status"];
  provider: string;
  model: string;
  usage: AiUsage | null;
  /** 衍生设定的待确认清单，只存在于这次会话里 */
  codexItems?: CodexItem[];
  codexApplied?: boolean;
  /** 这份清单已被下一份清单替换，只读保留在会话里 */
  codexSuperseded?: boolean;
  /** 原始错误文案（保留给日志/降级展示） */
  error: string;
  /** 中文化后的错误标题（Provider 错误可读化，见 errors.ts） */
  errorTitle?: string;
  /** 可操作建议（去设置检查 Key / 调低预算 / 稍后重试…） */
  errorHint?: string;
  /** 需要引导作者到设置页处理 */
  errorAction?: "settings-models";
  createdAt: string;
}

/** 顶部会话标签页；sessionId 为空表示尚未落库的本地草稿会话 */
export interface ChatTab {
  key: string;
  sessionId: string | null;
  title: string;
  agentId: AgentId;
  messages: UIMessage[];
  olderMessagesCursor?: string | null;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  createdAt: string;
}

/** 上下文预览分节（对应 lib/ai/context.ts 的 ContextSectionMeta，字段已归一化） */
export interface ContextSection {
  /** 服务端分节 id（如 chapter-summaries），保证非空且稳定 */
  id: string;
  label: string;
  /** 该分节 token 数 */
  tokens: number;
  /** 是否计入最终上下文（服务端默认 true） */
  included: boolean;
  /** 是否被预算截断 */
  truncated?: boolean;
  /** 服务端优先级（越小越先被丢弃） */
  priority?: number;
  /** 装配文本（服务端字段 text） */
  text?: string;
  /** 展示用备注：如「已截断」 */
  mode?: string;
}

export interface ContextPreview {
  sections: ContextSection[];
  /** 已用 token（归一化自服务端字段 tokens） */
  totalTokens: number;
  budget: number;
  /** 预算外被丢弃的分节 id */
  dropped?: string[];
}

/** 发送聊天时的完整入参（由面板组装） */
export interface SendChatInput {
  text: string;
  mentions: MentionRef[];
  mode: PanelMode;
  context: Partial<ContextConfig>;
  selection?: string;
  presetId?: string | null;
}

/** 重试等复用同一套「请求附加信息」 */
export type ChatExtras = Omit<SendChatInput, "text">;

/** 待作者确认的正文类 action */
export interface PendingAction {
  action: AiAction;
  /** 从 payload 中提取出的正文文本或 HTML */
  text: string;
}

/** 智能体展示信息 = AgentDef（custom 会被 settings.customAgent 覆盖） */
export type AgentView = AgentDef;
