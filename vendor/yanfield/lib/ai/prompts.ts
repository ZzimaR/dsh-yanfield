/**
 * 提示词装配工具（服务端/客户端共享的纯函数）
 * - renderTemplate：替换 {{placeholder}}
 * - 智能体人格前缀：AGENTS 定义 + 自定义智能体
 * - 预设解析：请求指定 presetId 或按 feature 回退到内置预设
 * - 结构化输出解析：extractJson（兼容 ```json 围栏与前后废话）
 */
import type { AgentDef, AgentId, AiFeature, AppSettings, PromptPreset } from "@/lib/types";
import { AGENTS, AI_FEATURE_LABEL, CUSTOM_AGENT, applyAgentOverride } from "@/lib/types";
import { BUILTIN_PRESETS, type BuiltinPresetDef } from "@/lib/defaults";

export type PresetLike = Pick<
  PromptPreset,
  "id" | "feature" | "name" | "systemPrompt" | "userTemplate" | "temperature" | "modelRole" | "enabled"
>;

export const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*\}\}/g;

/** 替换模板占位符；缺失的占位符替换为空字符串，避免原始 {{...}} 泄露给模型 */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined | null>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export function getAgent(agentId: AgentId | undefined): AgentDef {
  if (!agentId) return getAgent("supervisor");
  if (agentId === "custom") return CUSTOM_AGENT;
  const found = AGENTS.find((agent) => agent.id === agentId);
  if (found) return found;
  const fallback = AGENTS.find((agent) => agent.id === "supervisor");
  if (!fallback) throw new Error("AGENTS 配置缺失");
  return fallback;
}

/**
 * 知识边界（所有智能体共用）：
 * 设定卡是作者的私有资料，AI 看得见全部（未揭示的会标注），
 * 但「知道」不等于「写出来」——正文只能写到读者已经知道的信息。
 */
export const KNOWLEDGE_BOUNDARY =
  "只依据本轮实际提供或作者明确引用的资料，不假定未提供的设定。作者明确引用尚未揭示的资料时，只用于保持设定一致；正文只能写到当前章节已揭示的信息，不能提前点破、替读者揭晓，也不能让人物说出他此刻不该知道的事。";

/** 智能体人格前缀：拼在 systemPrompt 前，让同一模型切换角色（应用设置里的人设覆盖） */
export function agentPreamble(agentId: AgentId | undefined, settings: AppSettings): string {
  const base = getAgent(agentId);
  const overrides = settings.agentOverrides ?? {};
  if (base.id === "custom") {
    const custom = settings.customAgent;
    const extra = overrides.custom?.instructions?.trim();
    return [
      `现在由作者的「${custom.name}」协助创作。`,
      custom.role ? `定位：${custom.role}` : "",
      custom.persona ? `人设与工作方式：${custom.persona}` : "",
      "你的建议要具体、可执行；上下文没有的信息不要编造，不确定就写「待确认」。",
      KNOWLEDGE_BOUNDARY,
      extra ? `额外要求：${extra}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const agent = applyAgentOverride(base, overrides[base.id]);
  return [
    `现在由「${agent.name}」（${agent.englishName}）协助创作。`,
    `职责：${agent.role}。`,
    `强项：${agent.skills.join("、")}。`,
    agent.description,
    "上下文没有的信息不要编造；不确定就写「待确认」。",
    KNOWLEDGE_BOUNDARY,
    agent.instructions ? `额外要求：${agent.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function featureLabel(feature: AiFeature): string {
  return AI_FEATURE_LABEL[feature] ?? feature;
}

/** 按 feature 取内置预设（数据库不可用/未 seed 时的兜底） */
export function builtinPresetForFeature(feature: AiFeature): BuiltinPresetDef {
  const matched = BUILTIN_PRESETS.find((preset) => preset.feature === feature);
  const fallback =
    BUILTIN_PRESETS.find((preset) => preset.feature === "chat") ?? BUILTIN_PRESETS[0];
  if (!fallback) throw new Error("内置预设缺失");
  return matched ?? fallback;
}

/** 解析本次请求使用的预设：优先 presetId，其次同 feature 的启用预设，最后内置兜底 */
export function resolvePreset(
  feature: AiFeature,
  presets: PresetLike[],
  presetId?: string | null,
): { id: string | null; name: string; systemPrompt: string; userTemplate: string; temperature: number; modelRole: "chat" | "prose" } {
  const byId = presetId ? presets.find((preset) => preset.id === presetId && preset.enabled) : undefined;
  const byFeature = presets.find((preset) => preset.feature === feature && preset.enabled);
  const picked = byId ?? byFeature;
  if (picked) {
    return {
      id: picked.id,
      name: picked.name,
      systemPrompt: picked.systemPrompt,
      userTemplate: picked.userTemplate,
      temperature: picked.temperature,
      modelRole: picked.modelRole,
    };
  }
  const builtin = builtinPresetForFeature(feature);
  return {
    id: null,
    name: builtin.name,
    systemPrompt: builtin.systemPrompt,
    userTemplate: builtin.userTemplate,
    temperature: builtin.temperature,
    modelRole: builtin.modelRole,
  };
}

/** 去掉 ```json 围栏 */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```/.exec(trimmed);
  if (fenced && fenced[1]) return fenced[1].trim();
  return trimmed;
}

/** 从模型输出中提取 JSON（容忍前后解释文字） */
export function extractJson<T = unknown>(text: string): T | null {
  const candidate = stripFences(text);
  const tryParse = (raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct !== null) return direct;

  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = candidate.indexOf(open);
    const end = candidate.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const parsed = tryParse(candidate.slice(start, end + 1));
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 纯文本 → 段落 HTML（用于 AI 正文落库/插入） */
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const html = blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return html || "<p></p>";
}

/** 从 HTML 中取纯文本（保留段落换行），用于把正文喂给模型 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|blockquote|li|div|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 截取正文末尾 N 字，用于续写时给模型「上文」 */
export function tailText(text: string, maxChars = 1600): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(-maxChars);
  const boundary = sliced.search(/[。！？…\n]/);
  return boundary > 0 ? sliced.slice(boundary + 1).trim() : sliced;
}
