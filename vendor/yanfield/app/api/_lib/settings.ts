/**
 * 设置 PATCH 的深度合并与数值收敛。
 * repo.saveSettings 是浅合并，这里先按现有设置做深合并，避免子对象丢字段。
 */
import { ApiError } from "@/lib/api-utils";
import { unifyModelSettings } from "@/lib/model-settings";
import type { AgentId, AgentPersonaOverride, AiPricing, AppSettings, ContextConfig } from "@/lib/types";
import { AGENT_IDS, isObject, pickEnum, pickFields, type FieldSpec, type Json } from "./http";

type Models = AppSettings["models"];
type CustomAgent = AppSettings["customAgent"];
type AgentOverrides = AppSettings["agentOverrides"];

const SIMPLE_FIELDS: FieldSpec = {
  editorFontSize: "num",
  editorLineHeight: "num",
  editorFontWeight: "num",
  editorLetterSpacing: "num",
  paragraphSpacing: "num",
  pagePaddingX: "num",
  pagePaddingY: "num",
  maxContentWidth: "num",
  firstLineIndent: "bool",
  autoSave: "bool",
  autoSaveDelayMs: "num",
  typewriterMode: "bool",
  focusMode: "bool",
  showStatusBar: "bool",
  showInlineHints: "bool",
  motionEnabled: "bool",
  dailyWordGoal: "num",
};

const THEMES = ["light", "dark", "system"] as const;
const PROSE_FONTS = ["serif", "sans"] as const;
const SUMMARY_MODES = ["summary", "tail"] as const;
const CHARACTER_DETAILS = ["brief", "standard", "full"] as const;

const CONTEXT_BOOL_KEYS = [
  "includeNovelOutline",
  "includeVolumeOutline",
  "includeChapterBlueprint",
  "includeArchives",
  "includeCharacters",
  "includeWorld",
  "includeForeshadows",
  "includeStyleGuide",
  "includeSelection",
] as const;

const CONTEXT_NUM_KEYS = ["includeChapterSummaries", "archiveDepth", "contextBudget", "maxTokens"] as const;

const AGENT_KEYS = ["name", "role", "persona", "greeting"] as const;

/** 智能体人设覆盖允许的字段与长度上限（与设置「智能体」分组一一对应）。 */
const AGENT_OVERRIDE_KEYS = ["name", "role", "description", "greeting", "instructions"] as const;
const AGENT_OVERRIDE_LIMIT = 500;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function mergeContext(current: ContextConfig, raw: unknown): ContextConfig {
  if (!isObject(raw)) throw new ApiError("defaultContext 必须是对象", 400);
  const next: ContextConfig = { ...current };
  for (const key of CONTEXT_BOOL_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") throw new ApiError(`defaultContext.${key} 必须是布尔值`, 400);
    next[key] = value;
  }
  for (const key of CONTEXT_NUM_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) throw new ApiError(`defaultContext.${key} 必须是非负数字`, 400);
    next[key] = Math.floor(num);
  }
  if (raw.customInstruction !== undefined) {
    if (typeof raw.customInstruction !== "string") {
      throw new ApiError("defaultContext.customInstruction 必须是字符串", 400);
    }
    next.customInstruction = raw.customInstruction;
  }
  const summaryMode = pickEnum(raw, "chapterSummaryMode", SUMMARY_MODES, "defaultContext.chapterSummaryMode");
  if (summaryMode) next.chapterSummaryMode = summaryMode;
  const characterDetail = pickEnum(raw, "characterDetail", CHARACTER_DETAILS, "defaultContext.characterDetail");
  if (characterDetail) next.characterDetail = characterDetail;
  return next;
}

function mergeModels(current: Models, raw: unknown): Models {
  if (!isObject(raw)) throw new ApiError("models 必须是对象", 400);
  const next: Models = { chat: { ...current.chat }, prose: { ...current.prose } };
  for (const role of ["chat", "prose"] as const) {
    const value = raw[role];
    if (value === undefined) continue;
    if (!isObject(value)) throw new ApiError(`models.${role} 必须是对象`, 400);
    if (value.providerId !== undefined) {
      const providerId = value.providerId;
      if (providerId !== null && typeof providerId !== "string") {
        throw new ApiError(`models.${role}.providerId 必须是字符串或 null`, 400);
      }
      next[role].providerId = providerId as string | null;
    }
    if (value.model !== undefined) {
      if (typeof value.model !== "string") throw new ApiError(`models.${role}.model 必须是字符串`, 400);
      next[role].model = value.model.trim();
    }
  }
  const rawObject = raw as { chat?: unknown; prose?: unknown };
  if (rawObject.chat !== undefined) return unifyModelSettings({ ...next, prose: next.chat });
  if (rawObject.prose !== undefined) return unifyModelSettings({ ...next, chat: next.prose });
  return unifyModelSettings(next);
}

function mergeCustomAgent(current: CustomAgent, raw: unknown): CustomAgent {
  if (!isObject(raw)) throw new ApiError("customAgent 必须是对象", 400);
  const next: CustomAgent = { ...current };
  for (const key of AGENT_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new ApiError(`customAgent.${key} 必须是字符串`, 400);
    next[key] = value;
  }
  return next;
}

/** 合并单个智能体的人设覆盖：字符串字段 trim + 限长，空字符串表示删除该字段。 */
function mergeAgentOverride(current: AgentPersonaOverride, raw: Json, agentId: AgentId): AgentPersonaOverride {
  const next: AgentPersonaOverride = { ...current };
  for (const key of AGENT_OVERRIDE_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new ApiError(`agentOverrides.${agentId}.${key} 必须是字符串`, 400);
    const trimmed = value.trim().slice(0, AGENT_OVERRIDE_LIMIT);
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  }
  return next;
}

function mergeAgentOverrides(current: AgentOverrides, raw: unknown): AgentOverrides {
  if (!isObject(raw)) throw new ApiError("agentOverrides 必须是对象", 400);
  const next: AgentOverrides = { ...current };
  for (const [agentId, value] of Object.entries(raw)) {
    if (!AGENT_IDS.includes(agentId as AgentId)) {
      throw new ApiError(`agentOverrides.${agentId} 不是有效的智能体 id`, 400);
    }
    const id = agentId as AgentId;
    if (!isObject(value)) throw new ApiError(`agentOverrides.${agentId} 必须是对象`, 400);
    const merged = mergeAgentOverride(next[id] ?? {}, value, id);
    if (Object.keys(merged).length > 0) next[id] = merged;
    else delete next[id];
  }
  return next;
}

function mergePricing(current: AiPricing, raw: unknown): AiPricing {
  if (!isObject(raw)) throw new ApiError("aiPricing 必须是对象", 400);
  const next: AiPricing = { ...current };
  for (const key of ["inputPerMillion", "outputPerMillion", "cachedInputPerMillion"] as const) {
    if (raw[key] === undefined) continue;
    if(key==="cachedInputPerMillion" && raw[key]===null){delete next.cachedInputPerMillion;continue;}
    const num = Number(raw[key]);
    if (!Number.isFinite(num) || num < 0 || num > 100000) {
      throw new ApiError(`aiPricing.${key} 必须是 0 到 100000 之间的数字`, 400);
    }
    next[key] = Math.round(num * 10000) / 10000;
  }
  return next;
}

export function buildSettingsPatch(current: AppSettings, body: Json): Partial<AppSettings> {
  const patch = pickFields<AppSettings>(body, SIMPLE_FIELDS);
  if (patch.editorFontSize !== undefined) patch.editorFontSize = clampInt(patch.editorFontSize, 12, 36);
  if (patch.editorLineHeight !== undefined) {
    patch.editorLineHeight = Math.min(3, Math.max(1.2, Math.round(patch.editorLineHeight * 100) / 100));
  }
  if (patch.autoSaveDelayMs !== undefined) patch.autoSaveDelayMs = clampInt(patch.autoSaveDelayMs, 200, 10000);
  if (patch.dailyWordGoal !== undefined) patch.dailyWordGoal = clampInt(patch.dailyWordGoal, 0, 100000);
  if (patch.editorFontWeight !== undefined) {
    const allowed = [300, 400, 500, 600];
    patch.editorFontWeight = allowed.reduce((best, value) =>
      Math.abs(value - (patch.editorFontWeight as number)) < Math.abs(best - (patch.editorFontWeight as number)) ? value : best,
    );
  }
  if (patch.editorLetterSpacing !== undefined) {
    patch.editorLetterSpacing = Math.min(0.1, Math.max(0, Math.round(patch.editorLetterSpacing * 100) / 100));
  }
  if (patch.paragraphSpacing !== undefined) patch.paragraphSpacing = clampInt(patch.paragraphSpacing, 0, 40);
  if (patch.pagePaddingX !== undefined) patch.pagePaddingX = clampInt(patch.pagePaddingX, 16, 160);
  if (patch.pagePaddingY !== undefined) patch.pagePaddingY = clampInt(patch.pagePaddingY, 16, 160);
  if (patch.maxContentWidth !== undefined) {
    const width = clampInt(patch.maxContentWidth, 0, 1100);
    patch.maxContentWidth = width === 0 ? 0 : Math.max(620, width);
  }

  const theme = pickEnum(body, "theme", THEMES, "主题");
  if (theme) patch.theme = theme;
  const proseFont = pickEnum(body, "proseFont", PROSE_FONTS, "正文字体");
  if (proseFont) patch.proseFont = proseFont;

  if (body.defaultContext !== undefined) patch.defaultContext = mergeContext(current.defaultContext, body.defaultContext);
  if(body.modelThinking!==undefined){
    if(!isObject(body.modelThinking)||Object.keys(body.modelThinking).length>200)throw new ApiError("modelThinking 必须是模型档位映射",400);
    const next={...current.modelThinking};
    for(const [key,value] of Object.entries(body.modelThinking)){
      if(!key||key.length>512||typeof value!=="string"||!["default","off","minimal","low","medium","high","xhigh","max","ultra"].includes(value))throw new ApiError("思考档位无效",400);
      next[key]=value as NonNullable<AppSettings["modelThinking"]>[string];
    }
    patch.modelThinking=next;
  }
  if (body.models !== undefined) patch.models = mergeModels(current.models, body.models);
  if (body.customAgent !== undefined) patch.customAgent = mergeCustomAgent(current.customAgent, body.customAgent);
  if (body.agentOverrides !== undefined) {
    patch.agentOverrides = mergeAgentOverrides(current.agentOverrides, body.agentOverrides);
  }
  if (body.aiPricing !== undefined) patch.aiPricing = mergePricing(current.aiPricing, body.aiPricing);
  return patch;
}
