import { modelThinking, type ThinkingLevel } from "./thinking";
import type { CacheUsage } from "./cache-usage";
/**
 * AI 引擎（服务端）
 *
 * 对外只通过 SSE 暴露两类入口：
 * - runChatStream：右侧 AI 助手对话（支持单/多智能体、上下文装配、落库）
 * - runTaskStream：编辑器内的定点任务（续写/扩写/润色/改写/去 AI 味/体检/大纲），产出可应用的 AiAction
 * - runArchiveExtract：从本章正文抽取故事档案
 *
 * 事件协议见 lib/types.ts 的 AiStreamEvent。
 */
import type {
  AiAction,
  AiActionType,
  AiChatRequest,
  AiFeature,
  AiStreamEvent,
  AiTaskRequest,
  AiUsage,
  ChatMessage,
  ContextConfig,
  ProviderConfig,
  StoryArchive,
} from "@/lib/types";
import { trimChatHistory } from "@/lib/ai/history";
import {
  addAiLog,
  addMessage,
  createChatSession,
  getBlueprint,
  getChapter,
  getChatSession,
  getNovel,
  getSettings,
  listCharacters,
  listForeshadows,
  listChatHistoryPage,
  listPresets,
  listProviders,
  listWorld,
  getArchiveByChapter,
  recordAiTokens,
  updateMessage,
  upsertArchive,
} from "@/lib/repo";
import {
  ARCHIVE_TRUNCATED_MESSAGE,
  MANUAL_ARCHIVE_RULES,
  archiveLengthRules,
  archiveOutputBudget,
  manualArchiveBlock,
  mergeManualArchive,
  type ArchivePayload,
} from "@/lib/ai/archive-extract";
import { ApiError } from "@/lib/api-utils";
import { estimateTokens, uid } from "@/lib/ui/cn";
import { appendTaskConstraint, resolveTaskAuthorText } from "@/lib/ai/assist-brief";
import { assembleContext, type AssembledContext } from "@/lib/ai/context";
import {
  agentPreamble,
  extractJson,
  getAgent,
  htmlToText,
  renderTemplate,
  resolvePreset,
  tailText,
  textToHtml,
} from "@/lib/ai/prompts";
import { buildCodexUserPrompt, CODEX_SYSTEM, formatCodexCatalog, type CodexItem, type CodexTurn } from "@/lib/ai/codex";
import {
  ProviderError,
  isOutputLimitError,
  streamCompletion,
  type AiMessage,
  type ProviderChunk,
} from "@/lib/ai/provider";

/* ============================== 模型选择 ============================== */

export interface ResolvedTarget {
  provider: ProviderConfig;
  model: string;
  role: "chat" | "prose";
  thinkingLevel?: ThinkingLevel;
}

export function resolveTarget(role: "chat" | "prose"): ResolvedTarget {
  const settings = getSettings();
  const enabled = listProviders().filter((provider) => provider.enabled);
  if (enabled.length === 0) {
    throw new ApiError("还没有可用的 AI 模型：请到「设置 → 模型」添加一个 Provider，或启用离线演示模式。", 400);
  }
  // 对话和写作共用一个默认模型，存在 chat；prose 只是同一份拷贝。
  const wanted = settings.models.chat;
  let provider = wanted.providerId ? enabled.find((item) => item.id === wanted.providerId) : undefined;
  if (!provider) provider = enabled.find((item) => item.kind === "demo") ?? enabled[0];
  if (!provider) throw new ApiError("Provider 配置异常，请在设置页检查。", 400);

  const modelIds = provider.models.map((item) => item.id);
  let model = wanted.model && modelIds.includes(wanted.model) ? wanted.model : "";
  if (!model) model = modelIds[0] ?? (provider.kind === "demo" ? "yanfield-demo" : "");
  if (!model) throw new ApiError(`Provider「${provider.name}」还没有配置模型。`, 400);
  return { provider, model, role,thinkingLevel:modelThinking(settings,provider,model) };
}

export function mergeContextConfig(partial?: Partial<ContextConfig>): ContextConfig {
  const defaults = getSettings().defaultContext;
  return { ...defaults, ...(partial ?? {}) };
}

function makeUsage(promptTokens: number, completionTokens: number, latencyMs: number): AiUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    latencyMs,
  };
}

/** 服务商若在流末尾带回 usage，用它覆盖本地估算。同一条流里后来的数字覆盖先前的。 */
type UsageBox = {prompt:number;completion:number;reportedCost?:AiUsage["reportedCost"]} & CacheUsage;
function absorbUsage(chunk: ProviderChunk, box: UsageBox): boolean {
  if (chunk.type !== "usage") return false;
  if (chunk.promptTokens > 0) box.prompt = chunk.promptTokens;
  if (chunk.completionTokens > 0) box.completion = chunk.completionTokens;
  if(chunk.cost)box.reportedCost={...chunk.cost,complete:true};
  box.cachedInputTokens=chunk.cachedInputTokens;
  box.cacheReportedInputTokens=chunk.cachedInputTokens===undefined?undefined:chunk.promptTokens;
  return true;
}

function settleUsage(
  estimatedPrompt: number,
  estimatedCompletion: number,
  reported: UsageBox,
  latencyMs: number,
): AiUsage {
  return {...makeUsage(
    reported.prompt > 0 ? reported.prompt : estimatedPrompt,
    reported.completion > 0 ? reported.completion : estimatedCompletion,
    latencyMs,
  ),cachedInputTokens:reported.cachedInputTokens,cacheReportedInputTokens:reported.cacheReportedInputTokens,reportedCost:reported.reportedCost};
}

function contextTokens(messages: AiMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

async function collectCompletion(
  target: ResolvedTarget,
  messages: AiMessage[],
  signal: AbortSignal | undefined,
  maxTokens: number,
): Promise<{text:string} & UsageBox> {
  const reported:UsageBox = { prompt: 0, completion: 0 };
  let text = "";
  for await (const chunk of streamCompletion({
    provider: target.provider,
    model: target.model, thinkingLevel: target.thinkingLevel,
    messages,
    temperature: 0.7,
    maxTokens,
    signal,
  })) {
    if (absorbUsage(chunk, reported)) continue;
    if (chunk.type === "delta") text += chunk.text;
  }
  return { text: text.trim(), ...reported };
}

/* ============================== 行动（Action）构造 ============================== */

function makeAction(type: AiActionType, label: string, payload: unknown, applied = false): AiAction {
  return { id: uid("act"), type, label, payload, applied, appliedAt: applied ? new Date().toISOString() : undefined };
}

/** 文本类任务 → 可应用的正文动作 */
function proseAction(feature: AiFeature, text: string, selection?: string): AiAction | null {
  const html = textToHtml(text);
  switch (feature) {
    case "continue":
      return makeAction("append", "在文末续写", { html, text });
    case "expand":
    case "polish":
    case "rewrite":
    case "deai": {
      const hasSelection = Boolean(selection?.trim());
      return makeAction(
        hasSelection ? "replace-selection" : "replace-chapter",
        hasSelection ? "替换选中片段" : "替换整章正文",
        { html, text, original: selection?.trim() ?? "" },
      );
    }
    default:
      return null;
  }
}

/* ============================== 对话 ============================== */

export interface ChatRunParams extends AiChatRequest {
  signal?: AbortSignal;
}

function historyMessages(sessionId: string): { messages: ChatMessage[]; trimmed: boolean } {
  const page = listChatHistoryPage(sessionId, 10);
  const { kept, trimmed } = trimChatHistory(page.items);
  return { messages: kept, trimmed: page.hasMore || trimmed };
}

function toAiMessages(
  history: ChatMessage[],
  system: string,
  userContent: string,
  historyTrimmed = false,
): AiMessage[] {
  const effectiveSystem = historyTrimmed
    ? `${system}\n\n（更早的对话记录已省略，请以最近的消息与上下文为准；不要追问被省略的内容。）`
    : system;
  const messages: AiMessage[] = [{ role: "system", content: effectiveSystem }];
  for (const item of history) {
    messages.push({ role: item.role === "assistant" ? "assistant" : "user", content: item.content });
  }
  messages.push({ role: "user", content: userContent });
  return messages;
}

function buildContextBlock(context: AssembledContext): string {
  return context.text.trim() || "（暂无已保存的作品资料）";
}

export async function* runChatStream(params: ChatRunParams): AsyncGenerator<AiStreamEvent> {
  const startedAt = Date.now();
  let target: ResolvedTarget | null = null;
  let assistantMessageId: string | null = null;
  let accumulated = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const cacheUsage:CacheUsage & {reportedCost?:AiUsage["reportedCost"]}={};
  let sessionId = params.sessionId ?? null;
  const feature: AiFeature = "chat";

  try {
    let session = sessionId ? getChatSession(sessionId) : undefined;
    if (sessionId && !session) throw new ApiError("会话不存在", 404);
    if (session && session.novelId !== params.novelId) throw new ApiError("会话不属于该作品", 404);
    const chapterId = params.chapterId ?? session?.chapterId ?? null;
    if (chapterId) {
      const chapter = getChapter(chapterId);
      if (!chapter || chapter.novelId !== params.novelId) throw new ApiError("章节不属于该作品", 400);
    }
    if (!session) {
      session = createChatSession(params.novelId, {
        agentId: params.agentId ?? "supervisor",
        chapterId,
        mode: params.mode ?? "chat",
        title: params.message.trim().slice(0, 24) || "新对话",
      });
      sessionId = session.id;
    }
    const agentId = params.agentId ?? session.agentId;
    const agent = getAgent(agentId);
    const mode = params.mode ?? session.mode;

    // 历史消息要在写入本轮 user 消息之前读取；超出预算的旧消息会被压缩掉
    const history = historyMessages(session.id);
    addMessage(session.id, { role: "user", content: params.message });

    const config = mergeContextConfig(params.context);
    const context = assembleContext({
      novelId: params.novelId,
      chapterId,
      config,
      selection: params.selection,
      mentions: params.mentions,
    });
    const novel = getNovel(params.novelId);

    const preset = resolvePreset(feature, listPresets(params.novelId), params.presetId);
    const chatTarget = resolveTarget("chat");
    target = chatTarget;

    yield {
      type: "meta",
      runId: uid("run"),
      feature,
      provider: chatTarget.provider.name,
      model: chatTarget.model,
    };

    const systemParts = [agentPreamble(agentId, getSettings()), preset.systemPrompt];
    if (context.sections.some((section) => section.included)) {
      systemParts.push("上下文按「只写正文里出现过的信息」原则提供；上下文没有的信息不要编造，不确定就写「待确认」。");
    }
    const system = systemParts.filter(Boolean).join("\n\n");
    const vars = {
      novelTitle: novel?.title ?? "",
      genre: novel?.genre ?? "",
      context: buildContextBlock(context),
      message: params.message,
      selection: params.selection ?? "",
    };
    const userContent = renderTemplate(preset.userTemplate || "{{message}}", vars);
    const messages = toAiMessages(history.messages, system, userContent, history.trimmed);
    promptTokens = contextTokens(messages);

    assistantMessageId = addMessage(session.id, {
      role: "assistant",
      content: "",
      status: "streaming",
      provider: chatTarget.provider.name,
      model: chatTarget.model,
    }).id;

    if (mode === "collaborate") {
      // 多智能体协作：策划先出方案（chat 模型），写作再落正文（prose 模型）
      const planTarget = resolveTarget("chat");
      const planSystem = `${agentPreamble("blueprint", getSettings())}\n\n你是协作小组的策划。基于作品上下文与作者需求，写出一份简明的写作方案（${feature}）：目标、情绪走向、3–5 个关键节拍、要出现/避免的细节。不超过 400 字，不要写正文。`;
      const planUser = `【上下文】\n${buildContextBlock(context)}\n\n【作者需求】\n${params.message}${params.selection ? `\n\n【选中片段】\n${params.selection}` : ""}`;
      const planResult = await collectCompletion(planTarget, [{ role: "system", content: planSystem }, { role: "user", content: planUser }], params.signal, 700);
      const plan = planResult.text;
      if (plan) yield { type: "reasoning", text: `【协作计划】\n${plan}` };

      const writeTarget = resolveTarget("prose");
      target = writeTarget;
      const writeSystem = `${agentPreamble("writer", getSettings())}\n\n按策划方案直接产出最终答复。若作者要的是正文，只输出正文，不要解释；若作者要的是建议，给出具体可执行的方案。`;
      const writeUser = `【作者需求】\n${params.message}\n\n【写作方案】\n${plan}\n\n【上下文】\n${buildContextBlock(context)}`;
      const writeMessages: AiMessage[] = [
        { role: "system", content: writeSystem },
        { role: "user", content: writeUser },
      ];
      promptTokens = contextTokens(messages) + contextTokens([{ role: "user", content: planUser }]) + contextTokens(writeMessages);
      const reported = { prompt: planResult.prompt, completion: planResult.completion };
      const writeReported:UsageBox = { prompt: 0, completion: 0 };
      for await (const chunk of streamCompletion({ provider: writeTarget.provider, model: writeTarget.model, thinkingLevel: writeTarget.thinkingLevel, messages: writeMessages, temperature: 0.85, maxTokens: config.maxTokens > 0 ? config.maxTokens : undefined, signal: params.signal })) {
        if (absorbUsage(chunk, writeReported)) continue;
        const handled = handleChunk(chunk, (text) => {
          accumulated += text;
        });
        if (handled) yield handled;
      }
      const firstCost=planResult.reportedCost,secondCost=writeReported.reportedCost;
      if(firstCost&&secondCost&&firstCost.currency===secondCost.currency)cacheUsage.reportedCost={...firstCost,amount:firstCost.amount+secondCost.amount,complete:true};
      else if(firstCost||secondCost)cacheUsage.reportedCost={...(firstCost||secondCost)!,complete:false};
      cacheUsage.cachedInputTokens=(planResult.cachedInputTokens??0)+(writeReported.cachedInputTokens??0);
      cacheUsage.cacheReportedInputTokens=(planResult.cacheReportedInputTokens??0)+(writeReported.cacheReportedInputTokens??0);
      reported.prompt += writeReported.prompt;
      reported.completion += writeReported.completion;
      completionTokens = reported.completion;
      promptTokens = reported.prompt > 0 ? reported.prompt : promptTokens;
    } else {
      const reported:UsageBox = { prompt: 0, completion: 0 };
      for await (const chunk of streamCompletion({
        provider: chatTarget.provider,
        model: chatTarget.model, thinkingLevel: chatTarget.thinkingLevel,
        messages,
        temperature: preset.temperature,
        maxTokens: config.maxTokens > 0 ? config.maxTokens : undefined,
        signal: params.signal,
      })) {
        if (absorbUsage(chunk, reported)) continue;
        const handled = handleChunk(chunk, (text) => {
          accumulated += text;
        });
        if (handled) yield handled;
      }
      Object.assign(cacheUsage,{cachedInputTokens:reported.cachedInputTokens,cacheReportedInputTokens:reported.cacheReportedInputTokens,reportedCost:reported.reportedCost});
      if (reported.prompt > 0) promptTokens = reported.prompt;
      completionTokens = reported.completion;
    }

    const usage = settleUsage(promptTokens, estimateTokens(accumulated), { prompt: promptTokens, completion: completionTokens,...cacheUsage }, Date.now() - startedAt);
    const actions: AiAction[] = [];
    updateMessage(assistantMessageId, { content: accumulated, status: "complete", usage, actions });
    addAiLog({
      novelId: params.novelId,
      chapterId: params.chapterId ?? null,
      feature,
      provider: target.provider.name,
      model: target.model,
      promptTokens: usage.promptTokens,
      cachedInputTokens:usage.cachedInputTokens,cacheReportedInputTokens:usage.cacheReportedInputTokens,
      completionTokens: usage.completionTokens,
      latencyMs: usage.latencyMs,
      status: "ok",
      promptPreview: (messages[messages.length - 1]?.content ?? "").slice(0, 600),
      responsePreview: accumulated.slice(0, 600),
    });
    recordAiTokens(usage.totalTokens);

    yield { type: "done", usage, messageId: assistantMessageId };
  } catch (error) {
    const message = errorMessage(error);
    if (assistantMessageId) {
      try {
        updateMessage(assistantMessageId, { content: accumulated, status: "error", error: message });
      } catch {
        /* 消息可能已被删除 */
      }
      addAiLog({
        novelId: params.novelId,
        chapterId: params.chapterId ?? null,
        feature,
        provider: target?.provider.name ?? "",
        model: target?.model ?? "",
        promptTokens,
        completionTokens: estimateTokens(accumulated),
        latencyMs: Date.now() - startedAt,
        status: "error",
        error: message,
      });
    }
    yield { type: "error", message, code: errorCode(error) };
  } finally {
    if (sessionId) {
      // 触发会话 updated_at 刷新：updateMessage 已在完成分支更新；无需额外操作
      void sessionId;
    }
  }
}

function handleChunk(chunk: ProviderChunk, onText: (text: string) => void): AiStreamEvent | null {
  switch (chunk.type) {
    case "delta":
      onText(chunk.text);
      return { type: "delta", text: chunk.text };
    case "reasoning":
      return { type: "reasoning", text: chunk.text };
    case "usage":
    case "done":
      return null;
    default: {
      const exhaustive: never = chunk;
      return exhaustive;
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if (error.name === "AbortError") return "已取消";
    return error.message;
  }
  return "未知错误";
}

function errorCode(error: unknown): string {
  if (error instanceof ProviderError) return "provider";
  if (error instanceof ApiError) return "request";
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  return "unknown";
}

/* ============================== 资料助手 ============================== */

export interface CodexRunParams {
  novelId: string;
  message: string;
  history?: CodexTurn[];
  draft?: CodexItem[];
  /** 当前章节正文节选（可选，建议 ≤2000 字）；传空则提示词里不带正文段。 */
  contextText?: string;
  signal?: AbortSignal;
}

export async function* runCodexStream(params: CodexRunParams): AsyncGenerator<AiStreamEvent> {
  const startedAt = Date.now();
  let target: ResolvedTarget | null = null;
  let accumulated = "";
  let promptTokens = 0;
  let completionTokens = 0;
  try {
    if (!getNovel(params.novelId)) throw new ApiError("作品不存在", 404);
    target = resolveTarget("chat");
    yield {
      type: "meta",
      runId: uid("run"),
      feature: "custom",
      provider: target.provider.name,
      model: target.model,
    };
    const catalog = formatCodexCatalog({
      worlds: listWorld(params.novelId),
      characters: listCharacters(params.novelId),
      foreshadows: listForeshadows(params.novelId),
    });
    const userContent = buildCodexUserPrompt({
      catalog,
      history: (params.history ?? []).slice(-6),
      draft: params.draft ?? [],
      message: params.message,
      contextText: params.contextText,
    });
    const messages: AiMessage[] = [
      { role: "system", content: CODEX_SYSTEM },
      { role: "user", content: userContent },
    ];
    promptTokens = contextTokens(messages);
    const reported:UsageBox = { prompt: 0, completion: 0 };
    for await (const chunk of streamCompletion({
      provider: target.provider,
      model: target.model, thinkingLevel: target.thinkingLevel,
      messages,
      temperature: 0.2,
      maxTokens: 6000,
      signal: params.signal,
    })) {
      if (absorbUsage(chunk, reported)) continue;
      const handled = handleChunk(chunk, (text) => {
        accumulated += text;
      });
      if (handled) yield handled;
    }
    if (reported.prompt > 0) promptTokens = reported.prompt;
    completionTokens = reported.completion;
    const usage = settleUsage(
      promptTokens,
      estimateTokens(accumulated),
      reported,
      Date.now() - startedAt,
    );
    addAiLog({
      novelId: params.novelId,
      chapterId: null,
      feature: "custom",
      provider: target.provider.name,
      model: target.model,
      promptTokens: usage.promptTokens,
      cachedInputTokens:usage.cachedInputTokens,cacheReportedInputTokens:usage.cacheReportedInputTokens,
      completionTokens: usage.completionTokens,
      latencyMs: usage.latencyMs,
      status: "ok",
      promptPreview: params.message.slice(0, 600),
      responsePreview: accumulated.slice(0, 600),
    });
    recordAiTokens(usage.totalTokens);
    yield { type: "done", usage };
  } catch (error) {
    const message = errorMessage(error);
    if (target) {
      addAiLog({
        novelId: params.novelId,
        chapterId: null,
        feature: "custom",
        provider: target.provider.name,
        model: target.model,
        promptTokens,
        completionTokens: completionTokens || estimateTokens(accumulated),
        latencyMs: Date.now() - startedAt,
        status: "error",
        error: message,
      });
    }
    yield { type: "error", message, code: errorCode(error) };
  }
}

/* ============================== 定点任务 ============================== */

export interface TaskRunParams extends AiTaskRequest {
  signal?: AbortSignal;
}

function novelOutlineMarkdown(novelId: string): string {
  const context = assembleContext({
    novelId,
    config: {
      ...mergeContextConfig(),
      includeChapterSummaries: 0,
      includeArchives: false,
      includeCharacters: false,
      includeWorld: false,
      includeForeshadows: false,
      includeSelection: false,
      includeStyleGuide: true,
    },
  });
  return context.text;
}

export async function* runTaskStream(params: TaskRunParams): AsyncGenerator<AiStreamEvent> {
  const startedAt = Date.now();
  let target: ResolvedTarget | null = null;
  let accumulated = "";

  try {
    const feature = params.feature;
    const chapter = params.chapterId ? getChapter(params.chapterId) : undefined;
    if (params.chapterId && (!chapter || chapter.novelId !== params.novelId)) {
      throw new ApiError("章节不属于该作品", 400);
    }
    const config = mergeContextConfig(params.context);
    const context = assembleContext({
      novelId: params.novelId,
      chapterId: params.chapterId,
      config,
      selection: params.selection,
    });
    const preset = resolvePreset(feature, listPresets(params.novelId), params.presetId);
    const role: "chat" | "prose" = preset.modelRole;
    target = resolveTarget(role);

    yield {
      type: "meta",
      runId: uid("run"),
      feature,
      provider: target.provider.name,
      model: target.model,
    };

    const chapterText = chapter ? htmlToText(chapter.content) : "";
    const blueprintGoal = chapter ? getBlueprintGoal(chapter.id) : "";
    const author = resolveTaskAuthorText(params.message, params.instruction);
    const vars = {
      novelTitle: "",
      genre: "",
      context: context.text,
      message: author.message,
      words: params.targetWords ?? 600,
      ratio: 1.6,
      instruction: author.instruction,
      selection: params.selection ?? "",
      chapter: chapterText,
      chapterTitle: chapter?.title ?? "",
      chapterGoal: blueprintGoal,
      tail: tailText(chapterText, 1600),
      novelOutline: novelOutlineMarkdown(params.novelId),
      volumeOutline: "",
    };
    const userContent = renderTemplate(preset.userTemplate || "{{message}}", vars);
    const needsContext = !preset.userTemplate.includes("{{context}}");
    const renderedUser = needsContext ? `【作品上下文】\n${context.text}\n\n${userContent}` : userContent;
    const finalUser = appendTaskConstraint(renderedUser, author.instruction);
    const messages: AiMessage[] = [
      { role: "system", content: preset.systemPrompt },
      { role: "user", content: finalUser },
    ];
    const promptTokens = contextTokens(messages);
    const reported:UsageBox = { prompt: 0, completion: 0 };

    for await (const chunk of streamCompletion({
      provider: target.provider,
      model: target.model, thinkingLevel: target.thinkingLevel,
      messages,
      temperature: preset.temperature,
      maxTokens: config.maxTokens > 0 ? config.maxTokens : undefined,
      signal: params.signal,
    })) {
      if (absorbUsage(chunk, reported)) continue;
      const handled = handleChunk(chunk, (text) => {
        accumulated += text;
      });
      if (handled) yield handled;
    }

    const usage = settleUsage(promptTokens, estimateTokens(accumulated), reported, Date.now() - startedAt);
    const action = proseAction(feature, accumulated, params.selection);
    if (action) yield { type: "action", action };
    addAiLog({
      novelId: params.novelId,
      chapterId: params.chapterId ?? null,
      feature,
      provider: target.provider.name,
      model: target.model,
      promptTokens: usage.promptTokens,
      cachedInputTokens:usage.cachedInputTokens,cacheReportedInputTokens:usage.cacheReportedInputTokens,
      completionTokens: usage.completionTokens,
      latencyMs: usage.latencyMs,
      status: "ok",
      promptPreview: finalUser.slice(0, 600),
      responsePreview: accumulated.slice(0, 600),
    });
    recordAiTokens(usage.totalTokens);
    yield { type: "done", usage };
  } catch (error) {
    yield { type: "error", message: errorMessage(error), code: errorCode(error) };
    addAiLog({
      novelId: params.novelId,
      chapterId: params.chapterId ?? null,
      feature: params.feature,
      provider: target?.provider.name ?? "",
      model: target?.model ?? "",
      latencyMs: Date.now() - startedAt,
      status: "error",
      error: errorMessage(error),
    });
  }
}

function getBlueprintGoal(chapterId: string): string {
  try {
    return getBlueprint(chapterId).goal;
  } catch {
    return "";
  }
}

/* ============================== 故事档案抽取 ============================== */

export interface ArchiveExtractParams {
  novelId: string;
  chapterId: string;
  signal?: AbortSignal;
}

function sanitizeStringList(value: unknown, mapper: (item: Record<string, unknown>) => Record<string, string>): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, string>[] = [];
  for (const item of value.slice(0, 40)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const mapped: Record<string, string> = {};
    for (const [key, mappedValue] of Object.entries(mapper(record))) {
      mapped[key] = typeof mappedValue === "string" ? mappedValue : String(mappedValue ?? "");
    }
    result.push(mapped);
  }
  return result;
}

function normalizeArchive(raw: unknown, fallbackSummary: string): {
  chapterSummary: string;
  characterStates: StoryArchive["characterStates"];
  settingStates: StoryArchive["settingStates"];
  ledger: StoryArchive["ledger"];
  timeline: StoryArchive["timeline"];
  foreshadows: StoryArchive["foreshadows"];
  conflicts: StoryArchive["conflicts"];
} {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  const chapterSummary = str(record.chapterSummary) || fallbackSummary;
  const characterStates = sanitizeStringList(record.characterStates, (item) => ({
    name: str(item.name),
    state: str(item.state),
    changes: str(item.changes),
  })).map((item) => ({ name: item.name ?? "", state: item.state ?? "", changes: item.changes ?? "" }));
  const settingStates = sanitizeStringList(record.settingStates, (item) => ({
    title: str(item.title),
    state: str(item.state),
  })).map((item) => ({ title: item.title ?? "", state: item.state ?? "" }));
  const ledger = sanitizeStringList(record.ledger, (item) => ({
    name: str(item.name),
    delta: str(item.delta),
    balance: str(item.balance),
    note: str(item.note),
  })).map((item) => ({ name: item.name ?? "", delta: item.delta ?? "", balance: item.balance ?? "", note: item.note ?? "" }));
  const timeline = sanitizeStringList(record.timeline, (item) => ({
    storyTime: str(item.storyTime),
    event: str(item.event),
  })).map((item) => ({ storyTime: item.storyTime ?? "", event: item.event ?? "" }));
  const foreshadows = sanitizeStringList(record.foreshadows, (item) => ({
    title: str(item.title),
    status: str(item.status) || "planted",
    note: str(item.note),
  })).map((item) => ({ title: item.title ?? "", status: item.status ?? "planted", note: item.note ?? "" }));
  const conflicts = Array.isArray(record.conflicts)
    ? record.conflicts
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .slice(0, 10)
        .map((item) => ({ topic: str(item.topic), detail: str(item.detail), status: "pending" as const }))
    : [];
  return { chapterSummary, characterStates, settingStates, ledger, timeline, foreshadows, conflicts };
}

export async function* runArchiveExtract(params: ArchiveExtractParams): AsyncGenerator<AiStreamEvent> {
  const startedAt = Date.now();
  const chapter = getChapter(params.chapterId);
  if (!chapter || chapter.novelId !== params.novelId) throw new ApiError("章节不存在", 404);
  const target = resolveTarget("chat");
  yield { type: "meta", runId: uid("run"), feature: "archive-extract", provider: target.provider.name, model: target.model };
  const existing = getArchiveByChapter(chapter.id);
  const manual = existing?.generatedBy === "manual" ? existing : null;

  const plain = htmlToText(chapter.content).trim();
  if (!plain) {
    yield { type: "error", message: "本章还没有正文，无法抽取档案。", code: "empty" };
    return;
  }

  const fallbackSummary = plain.replace(/\s+/g, " ").slice(0, 160);
  let payload: ArchivePayload;
  let accumulated = "";
  let reported:UsageBox = { prompt: 0, completion: 0 };
  let estimatedPrompt = estimateTokens(plain);
  let spentPrompt = 0;
  let spentCompletion = 0;
  let spentCachedInputTokens = 0;
  let spentCacheReportedInputTokens = 0;
  let spentReportedCost: AiUsage["reportedCost"];
  let allAttemptsReportedCost = true;
  const accountAttempt = () => {
    spentPrompt += reported.prompt || estimatedPrompt;
    spentCompletion += reported.completion || estimateTokens(accumulated);
    spentCachedInputTokens += reported.cachedInputTokens ?? 0;
    spentCacheReportedInputTokens += reported.cacheReportedInputTokens ?? 0;
    const cost = reported.reportedCost;
    if (!cost) {
      allAttemptsReportedCost = false;
    } else if (spentReportedCost && spentReportedCost.currency === cost.currency) {
      spentReportedCost = {
        ...cost,
        amount: spentReportedCost.amount + cost.amount,
        complete: spentReportedCost.complete && cost.complete,
      };
    } else if (spentReportedCost) {
      spentReportedCost = { ...spentReportedCost, complete: false };
    } else {
      spentReportedCost = cost;
    }
  };

  if (target.provider.kind === "demo") {
    payload = normalizeArchive(buildDemoArchive(chapter.id), fallbackSummary);
    accumulated = JSON.stringify(payload);
    yield { type: "delta", text: accumulated };
  } else {
    const presets = listPresets(params.novelId);
    const preset = resolvePreset("archive-extract", presets);
    const config = mergeContextConfig({ includeChapterBlueprint: true, includeArchives: true });
    const context = assembleContext({
      novelId: params.novelId,
      chapterId: chapter.id,
      config,
    });
    const declaredMax = target.provider.models.find((item) => item.id === target.model)?.maxOutputTokens;
    let parsed: unknown = null;
    for (let attempt = 0; ; attempt += 1) {
      const system = [
        preset.systemPrompt,
        archiveLengthRules(attempt > 0),
        manual ? MANUAL_ARCHIVE_RULES : "",
        "只输出 JSON，不要输出 Markdown 代码块以外的任何文字。",
      ].filter(Boolean).join("\n\n");
      const user = [
        `【已有事实】\n${context.text}`,
        manual ? manualArchiveBlock(manual) : "",
        `【本章正文】\n${plain.slice(0, 12000)}`,
      ].filter(Boolean).join("\n\n");
      const messages: AiMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      estimatedPrompt = estimateTokens(messages.map((item) => item.content).join("\n"));
      accumulated = "";
      reported = { prompt: 0, completion: 0 };
      try {
        for await (const chunk of streamCompletion({
          provider: target.provider,
          model: target.model,
          thinkingLevel: target.thinkingLevel === "default" ? "off" : target.thinkingLevel,
          disableThinking: true,
          messages,
          temperature: 0.2,
          maxTokens: archiveOutputBudget(declaredMax, attempt, config.maxTokens),
          signal: params.signal,
        })) {
          if (absorbUsage(chunk, reported)) continue;
          if (chunk.type === "delta") accumulated += chunk.text;
        }
      } catch (error) {
        if (!isOutputLimitError(error) || params.signal?.aborted) throw error;
        accountAttempt();
        if (attempt >= 1) {
          yield { type: "error", message: ARCHIVE_TRUNCATED_MESSAGE, code: "length" };
          return;
        }
        continue;
      }
      parsed = extractJson(accumulated);
      if (parsed !== null) break;
      accountAttempt();
      if (attempt >= 1) {
        yield {
          type: "error",
          message: "档案解析失败：模型连续两次没有返回完整 JSON。请重试或换用更稳定的模型。",
          code: "parse",
        };
        return;
      }
    }
    payload = normalizeArchive(parsed, fallbackSummary);
  }

  let newConflicts = 0;
  if (manual) {
    const merged = mergeManualArchive(manual, payload);
    payload = merged.payload;
    newConflicts = merged.newConflicts;
  }

  const archive = upsertArchive({
    novelId: params.novelId,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterSummary: payload.chapterSummary,
    characterStates: payload.characterStates,
    settingStates: payload.settingStates,
    ledger: payload.ledger,
    timeline: payload.timeline,
    foreshadows: payload.foreshadows,
    conflicts: payload.conflicts,
    status: "fresh",
    sourceWordCount: chapter.wordCount,
    // 保持 manual，下次重新提取仍会保护作者的校订
    generatedBy: manual ? "manual" : "ai",
    model: target.model,
  });

  const usage = settleUsage(estimatedPrompt, estimateTokens(accumulated), reported, Date.now() - startedAt);
  usage.promptTokens += spentPrompt;
  usage.completionTokens += spentCompletion;
  usage.totalTokens = usage.promptTokens + usage.completionTokens;
  usage.cachedInputTokens = (usage.cachedInputTokens ?? 0) + spentCachedInputTokens || undefined;
  usage.cacheReportedInputTokens = (usage.cacheReportedInputTokens ?? 0) + spentCacheReportedInputTokens || undefined;
  if (spentReportedCost) {
    if (usage.reportedCost && usage.reportedCost.currency === spentReportedCost.currency) {
      usage.reportedCost = {
        ...usage.reportedCost,
        amount: usage.reportedCost.amount + spentReportedCost.amount,
        complete: usage.reportedCost.complete && spentReportedCost.complete && allAttemptsReportedCost,
      };
    } else if (usage.reportedCost) {
      usage.reportedCost = { ...usage.reportedCost, complete: false };
    } else {
      usage.reportedCost = { ...spentReportedCost, complete: false };
    }
  } else if (usage.reportedCost && !allAttemptsReportedCost) {
    usage.reportedCost = { ...usage.reportedCost, complete: false };
  }
  addAiLog({
    novelId: params.novelId,
    chapterId: chapter.id,
    feature: "archive-extract",
    provider: target.provider.name,
    model: target.model,
    promptTokens: usage.promptTokens,
      cachedInputTokens:usage.cachedInputTokens,cacheReportedInputTokens:usage.cacheReportedInputTokens,
    completionTokens: usage.completionTokens,
    latencyMs: usage.latencyMs,
    status: "ok",
    responsePreview: accumulated.slice(0, 600),
  });
  recordAiTokens(usage.totalTokens);

  yield { type: "action", action: makeAction("save-archive", "写入第" + archive.orderIndex + "章档案", { archive, preservedManual: Boolean(manual), newConflicts }, true) };
  yield { type: "done", usage };
}

/** 离线演示：根据已存资料拼一份合理的档案，保证无 API Key 也能完整体验 */
function buildDemoArchive(chapterId: string): Record<string, unknown> {
  const chapter = getChapter(chapterId);
  const novelId = chapter?.novelId ?? "";
  const blueprint = chapter ? getBlueprint(chapter.id) : undefined;
  const characters = listCharacters(novelId).slice(0, 3);
  const world = listWorld(novelId).slice(0, 2);
  const foreshadows = listForeshadows(novelId).slice(0, 2);
  const plain = chapter ? htmlToText(chapter.content).replace(/\s+/g, " ").trim() : "";
  const summary = blueprint?.goal || plain.slice(0, 120) || "本章推进了主线冲突。";
  return {
    chapterSummary: summary,
    characterStates: characters.map((character) => ({
      name: character.name,
      state: character.currentState || "本章结束时情绪紧绷，仍未做出最终决定",
      changes: "本章首次主动采取行动",
    })),
    settingStates: world.map((setting) => ({ title: setting.title, state: "本章补充了一条使用限制" })),
    ledger: [],
    timeline: [{ storyTime: "本章当夜", event: summary }],
    foreshadows: foreshadows.map((foreshadow) => ({ title: foreshadow.title, status: foreshadow.status, note: "本章有推进" })),
    conflicts: [],
  };
}
