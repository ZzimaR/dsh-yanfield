"use client";

/**
 * AI 面板共享工具：智能体解析 / tint 配色 / 上下文分节开关映射 /
 * action 文本提取 / 请求体辅助 / token 格式化。
 * 注意：颜色一律使用 globals.css 的 token 类名，禁止硬编码 hex。
 */
import {
  AGENTS,
  CUSTOM_AGENT,
  DEFAULT_CONTEXT_CONFIG,
  applyAgentOverride,
  type AgentDef,
  type AgentId,
  type AiAction,
  type AppSettings,
  type ChatMessage,
  type ContextConfig,
} from "@/lib/types";
import { textToInsertHtml } from "@/lib/editor/bridge";
import type { ContextPreview, ContextSection, MentionRef, PanelMode, UIMessage } from "./types";

/* ---------------- 智能体与 tint ---------------- */

export interface AgentTintStyle {
  /** 头像方块 */
  avatar: string;
  /** 浅色底（选中卡片/强调区域） */
  soft: string;
  /** 文字色 */
  text: string;
  /** 描边 */
  border: string;
  /** 选中 ring */
  ring: string;
}

export const AGENT_TINT_CLASS: Record<AgentDef["tint"], AgentTintStyle> = {
  accent: {
    avatar: "bg-accent-soft text-accent border border-accent/25",
    soft: "bg-accent-soft text-accent",
    text: "text-accent",
    border: "border-accent/30",
    ring: "ring-accent/20",
  },
  jade: {
    avatar: "bg-jade-soft text-jade border border-jade/25",
    soft: "bg-jade-soft text-jade",
    text: "text-jade",
    border: "border-jade/30",
    ring: "ring-jade/20",
  },
  gold: {
    avatar: "bg-gold-soft text-gold border border-gold/25",
    soft: "bg-gold-soft text-gold",
    text: "text-gold",
    border: "border-gold/30",
    ring: "ring-gold/20",
  },
  ink: {
    avatar: "bg-surface-2 text-ink-2 border border-line",
    soft: "bg-surface-2 text-ink-2",
    text: "text-ink-2",
    border: "border-line-strong",
    ring: "ring-ink-4/20",
  },
};

/** 头像文字：中文取首字，英文取首字母（大写） */
export function agentInitial(agent: AgentDef): string {
  const name = agent.name.trim();
  if (!name) return "AI";
  const first = name.slice(0, 1);
  return /[a-z]/.test(first) ? first.toUpperCase() : first;
}

/** 是否真的配置了自定义智能体人设（任一字段有值才算） */
export function hasCustomAgent(settings?: AppSettings | null): boolean {
  const custom = settings?.customAgent;
  if (!custom) return false;
  return Boolean(
    custom.name?.trim() || custom.role?.trim() || custom.greeting?.trim() || custom.persona?.trim(),
  );
}

/**
 * 把 AgentId 解析为完整 AgentDef：
 * - 内置智能体（主编 / 写作 / 设定）直接返回；
 * - id=custom 且真的配置了人设时，用 settings.customAgent 覆盖展示信息；
 * - 其余 id（含已精简掉的 blueprint / archivist / critic / consistency / structure）一律回落主编，
 *   保证历史会话恢复时不报错、不出现空智能体。
 */
export function resolveAgent(agentId: AgentId, settings?: AppSettings | null): AgentDef {
  const builtin = AGENTS.find((agent) => agent.id === agentId);
  if (builtin) return applyAgentOverride(builtin, settings?.agentOverrides?.[builtin.id]);
  if (agentId === "custom" && hasCustomAgent(settings)) {
    const custom = settings?.customAgent;
    const instructions = settings?.agentOverrides?.custom?.instructions?.trim();
    return {
      ...CUSTOM_AGENT,
      name: custom?.name?.trim() || CUSTOM_AGENT.name,
      role: custom?.role?.trim() || CUSTOM_AGENT.role,
      greeting: custom?.greeting?.trim() || CUSTOM_AGENT.greeting,
      description: custom?.persona?.trim() || CUSTOM_AGENT.description,
      ...(instructions ? { instructions } : {}),
    };
  }
  const fallback = AGENTS.find((agent) => agent.id === "supervisor");
  if (fallback) return applyAgentOverride(fallback, settings?.agentOverrides?.supervisor);
  throw new Error("AGENTS 配置缺失：至少需要保留主编（supervisor）");
}

/** 可选智能体：内置智能体 + 真配置了人设的自定义智能体（没配置时不出现），均应用设置覆盖 */
export function listAgents(settings?: AppSettings | null): AgentDef[] {
  const builtins = AGENTS.map((agent) => applyAgentOverride(agent, settings?.agentOverrides?.[agent.id]));
  if (!hasCustomAgent(settings)) return builtins;
  return [...builtins, resolveAgent("custom", settings)];
}

/* ---------------- 上下文配置 ---------------- */

/** 以设置里的 defaultContext 为基准补齐默认值 */
export function createContextConfig(settings?: AppSettings | null): ContextConfig {
  return { ...DEFAULT_CONTEXT_CONFIG, ...(settings?.defaultContext ?? {}) };
}

export interface ContextToggleSpec {
  get: (config: ContextConfig) => boolean;
  set: (config: ContextConfig, enabled: boolean) => Partial<ContextConfig>;
  hint?: string;
}

const SUMMARY_DEFAULT_COUNT = 3;

/**
 * 前情摘要分节的开关（includeChapterSummaries 是 number，不能当布尔键处理，
 * 因此不进 SECTION_TOGGLES，由抽屉单独渲染「开关 + 最近 N 章」组合控件）。
 */
export const CHAPTER_SUMMARY_TOGGLE: ContextToggleSpec = {
  get: (config) => config.includeChapterSummaries > 0,
  set: (config, enabled) => ({
    includeChapterSummaries: enabled
      ? config.includeChapterSummaries > 0
        ? config.includeChapterSummaries
        : SUMMARY_DEFAULT_COUNT
      : 0,
  }),
  hint: "关闭后不再携带前情摘要；启用后可选择最近 1–10 章",
};

const SECTION_TOGGLES: Array<[string[], ContextToggleSpec]> = [
  [
    ["novelOutline", "novel-outline", "novel_outline", "outline", "总纲", "全书大纲"],
    {
      get: (config) => config.includeNovelOutline,
      set: (_config, enabled) => ({ includeNovelOutline: enabled }),
    },
  ],
  [
    ["volumeOutline", "volume-outline", "volume_outline", "卷纲"],
    {
      get: (config) => config.includeVolumeOutline,
      set: (_config, enabled) => ({ includeVolumeOutline: enabled }),
    },
  ],
  [
    ["chapterBlueprint", "chapter-blueprint", "blueprint", "章纲", "本章章纲"],
    {
      get: (config) => config.includeChapterBlueprint,
      set: (_config, enabled) => ({ includeChapterBlueprint: enabled }),
    },
  ],
  [
    ["archives", "archive", "storyArchives", "故事档案", "档案"],
    {
      get: (config) => config.includeArchives,
      set: (_config, enabled) => ({ includeArchives: enabled }),
    },
  ],
  [
    ["characters", "character", "角色", "角色表"],
    {
      get: (config) => config.includeCharacters,
      set: (_config, enabled) => ({ includeCharacters: enabled }),
    },
  ],
  [
    ["world", "worldSettings", "worldsettings", "设定", "世界观"],
    {
      get: (config) => config.includeWorld,
      set: (_config, enabled) => ({ includeWorld: enabled }),
    },
  ],
  [
    ["foreshadows", "foreshadow", "伏笔"],
    {
      get: (config) => config.includeForeshadows,
      set: (_config, enabled) => ({ includeForeshadows: enabled }),
    },
  ],
  [
    ["styleGuide", "style", "文风", "文风指南"],
    {
      get: (config) => config.includeStyleGuide,
      set: (_config, enabled) => ({ includeStyleGuide: enabled }),
    },
  ],
  [
    ["selection", "选中文本", "选中内容"],
    {
      get: (config) => config.includeSelection,
      set: (_config, enabled) => ({ includeSelection: enabled }),
    },
  ],
];

/** 归一化分节 key：非字符串等脏数据一律返回 null，避免 undefined.toLowerCase() 崩页 */
const normalizeSectionKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
  return normalized.length > 0 ? normalized : null;
};

const TOGGLE_INDEX: Map<string, ContextToggleSpec> = (() => {
  const index = new Map<string, ContextToggleSpec>();
  for (const [aliases, spec] of SECTION_TOGGLES) {
    for (const alias of aliases) {
      const key = normalizeSectionKey(alias);
      if (key) index.set(key, spec);
    }
  }
  return index;
})();

/**
 * 按服务端分节 id（或 label）找回 ContextConfig 布尔开关；
 * 未知分节/非法数据返回 null，抽屉据此禁用开关并提示「由服务端自动装配」。
 */
export function resolveContextToggle(key: unknown, label?: unknown): ContextToggleSpec | null {
  const directKey = normalizeSectionKey(key);
  if (directKey) {
    const direct = TOGGLE_INDEX.get(directKey);
    if (direct) return direct;
  }
  const labelKey = normalizeSectionKey(label);
  if (labelKey) {
    const byLabel = TOGGLE_INDEX.get(labelKey);
    if (byLabel) return byLabel;
  }
  return null;
}

/* ---------------- 上下文预览归一化 ---------------- */

/** 把服务端任意结构的 section 归一化成 UI 的 ContextSection（缺字段兜底，永不抛错） */
const toContextSection = (raw: unknown, index: number): ContextSection | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const idValue = record.id ?? record.key ?? record.label;
  const id = typeof idValue === "string" && idValue.trim() ? idValue.trim() : `section-${index + 1}`;
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : id;
  const tokens = typeof record.tokens === "number" && Number.isFinite(record.tokens) ? record.tokens : 0;
  const textValue = typeof record.text === "string" ? record.text : record.content;
  const text = typeof textValue === "string" && textValue.trim() ? textValue : undefined;
  const included = typeof record.included === "boolean" ? record.included : true;
  const truncated = typeof record.truncated === "boolean" ? record.truncated : undefined;
  const priority = typeof record.priority === "number" && Number.isFinite(record.priority) ? record.priority : undefined;
  const modeValue = record.mode;
  const mode = typeof modeValue === "string" && modeValue.trim() ? modeValue.trim() : truncated ? "已截断" : undefined;
  return { id, label, tokens, included, text, truncated, priority, mode };
};

/**
 * 服务端 /api/ai/context 响应 → ContextPreview。
 * 服务端字段为 { sections:[{id,label,text,tokens,included,truncated,priority}], tokens, budget, dropped }，
 * 这里同时兼容 totalTokens / key / content 等历史命名，保证面板不因接口字段变化崩溃。
 */
export function normalizeContextPreview(raw: unknown): ContextPreview {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  const sections = rawSections
    .map((item, index) => toContextSection(item, index))
    .filter((item): item is ContextSection => item !== null);

  const totalTokens =
    typeof record.tokens === "number" && Number.isFinite(record.tokens)
      ? record.tokens
      : typeof record.totalTokens === "number" && Number.isFinite(record.totalTokens)
        ? record.totalTokens
        : sections.reduce((sum, section) => sum + section.tokens, 0);

  const budget =
    typeof record.budget === "number" && Number.isFinite(record.budget) && record.budget >= 0
      ? record.budget
      : 0;

  const dropped = Array.isArray(record.dropped)
    ? record.dropped.filter((item): item is string => typeof item === "string")
    : undefined;

  return { sections, totalTokens, budget, dropped };
}

/* ---------------- 模式与请求体 ---------------- */

/**
 * 面板模式 → AiChatRequest.mode
 * 注：「技能」mode 现在只是输入框内的技能选择器，AiPanel 发送前会把 mode 归一化为 chat；
 * 这里保留 collaborate 映射，兼容其它调用方/历史请求体。
 */
export function modeToRequestMode(mode: PanelMode): "chat" | "collaborate" {
  return mode === "skill" ? "collaborate" : "chat";
}

/** 起草模式给模型追加的指令（展示给用户的消息文本保持不变） */
export function composeChatMessage(text: string, mode: PanelMode): string {
  if (mode === "draft") {
    return `【起草模式】请直接输出可用的正文内容，不要输出解释、寒暄或写作建议。\n\n${text}`;
  }
  return text;
}

/** 引用 chips → 请求体 mentions */
export function toRequestMentions(mentions: MentionRef[]): MentionRef[] {
  return mentions.map((item) => ({ type: item.type, id: item.id, label: item.label }));
}

/* ---------------- AI Action ---------------- */

export const ACTION_LABEL: Record<AiAction["type"], string> = {
  "agent-run": "任务与改动",
  insert: "插入正文",
  append: "追加到末尾",
  "replace-selection": "替换选中",
  "replace-chapter": "替换整章",
  "save-archive": "保存档案",
  "save-outline": "保存大纲",
  "save-entity": "保存设定",
  "save-blueprint": "保存章纲",
};

/** 正文类 action：需要作者确认/审阅后才能写入正文 */
export function isBodyAction(action: AiAction): boolean {
  return (
    action.type === "insert" ||
    action.type === "append" ||
    action.type === "replace-selection" ||
    action.type === "replace-chapter"
  );
}

/** 从 action.payload 中提取正文文本/HTML */
export function extractActionText(action: AiAction): string {
  const payload: unknown = action.payload;
  if (typeof payload === "string") return payload.trim();
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["html", "content", "text", "markdown", "after", "body"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

/** 正文文本 → 可交给 diff/编辑器的最小 HTML（纯文本自动包段落） */
export function actionToHtml(text: string): string {
  return textToInsertHtml(text);
}

/* ---------------- 消息映射 ---------------- */

/** ChatMessage（服务端）→ UIMessage（面板） */
export function toUiMessage(message: ChatMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content ?? "",
    actions: Array.isArray(message.actions) ? message.actions : [],
    status: message.status ?? "complete",
    provider: message.provider ?? "",
    model: message.model ?? "",
    usage: message.usage ?? null,
    error: message.error ?? "",
    createdAt: message.createdAt ?? new Date().toISOString(),
  };
}

/* ---------------- 展示辅助 ---------------- */

/** token 数缩写：1234 → 1.2k */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export const MENTION_TYPE_LABEL: Record<MentionRef["type"], string> = {
  chapter: "章节",
  character: "角色",
  world: "世界观",
  foreshadow: "伏笔",
  archive: "档案",
};

export const MENTION_TYPE_ORDER: MentionRef["type"][] = [
  "chapter",
  "character",
  "world",
  "foreshadow",
  "archive",
];

/** 判断是否为用户主动中止（AbortController） */
export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return typeof error === "object" && (error as { name?: unknown }).name === "AbortError";
}
