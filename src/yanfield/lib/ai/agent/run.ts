import { thinkingProfile } from "../thinking";
import { proposalReceipt } from "./receipt";
import { proposalsNeedRecap } from "./recap";
import { chapterReadPage, TOOL_RECEIPT_LIMIT } from "./read-page";
import { CARD_KINDS, OUTLINE_KINDS, TASK_PLANNER, parseTaskPlan, taskScope, SCOPE_INSTRUCTIONS } from "./task-scope";
import { applyProsePatches, editProse, prepareProseEdit, writerPlainText } from "./prose-edit";
import { chapterDirectoryWindow, writerMessages, candidateContext } from "./context";
import { z } from "zod";
import { parseAgentDecision, supportsDecisionJson, usesDecisionTool, DECISION_TOOLS, nativeDecisionSystem, decisionToolsFor } from "./decision";
import { protocolDiagnostic } from "./diagnostics";
import { displayAgentReply } from "./reply";
import * as repo from "@/lib/repo";
import { resolveTarget, mergeContextConfig } from "@/lib/ai/engine";
import { isInvalidToolInputError, isOutputLimitError, streamCompletion, type AiMessage, type ProviderChunk } from "@/lib/ai/provider";
import { historyLimitsFor, trimChatHistory } from "@/lib/ai/history";
import { agentPreamble, extractJson, renderTemplate, resolvePreset, withLanguageDirective } from "@/lib/ai/prompts";
import { countWords, estimateTokens, stripHtml, uid } from "@/lib/ui/cn";
import { ApiError } from "@/lib/api-utils";
import { getRun, propose, proposeDelete, readEntity, saveRun, supersedeRun, visibleEntity } from "./store";
import { patchSchemas, proseHtml } from "./schema";
import { ENTITY_LABEL, type AgentRequest, type AgentRun, type AgentStep, type EntityKind, type Fields } from "./types";
import type { AiStreamEvent } from "@/lib/types";
import { MATERIAL_PROMPT, materialResultSchema, prepareMaterial, type ExistingMaterial, type MaterialSource } from "./materials";
import { flattenChapters, isAiVisibleAtChapter } from "@/lib/ai/context";

const kinds=z.enum(["chapter","blueprint","character","world","location","foreshadow","outline","volume-outline"]);
const IMPORTANCE_RANK={high:0,medium:1,low:2} as const;
/** 工具参数由 zod 校验，直接把 ZodError 丢给模型时它只会看到一长串 JSON；这里压成能照着改的中文提示。 */
function describeToolError(error: unknown): string {
  if (error && typeof error === "object" && Array.isArray((error as { issues?: unknown }).issues)) {
    const issues = (error as { issues: Array<{ path?: (string | number)[]; message?: string; code?: string }> }).issues
      .slice(0, 4)
      .map((issue) => `${(issue.path ?? []).map(String).join(".") || "参数"}：${issue.message ?? issue.code ?? "格式不对"}`);
    return `参数不合法（${issues.join("；")}）。请补齐必填字段、按说明填写类型后重试。`;
  }
  return error instanceof Error ? error.message : "工具执行失败";
}

const decisionSchema=z.object({message:z.string(),calls:z.array(z.object({id:z.string().optional(),name:z.enum(["workspace","list","read","propose","propose_cards","delete","write_chapter","reject_change","read_archive"]),args:z.record(z.string(),z.unknown())})).max(12).default([]),done:z.boolean().default(false)});
const SYSTEM = `你是砚田写作台的执行助手。执行 current.request 中的本轮任务。task.permissions 是候选工具的范围，不能自行扩大。history、previousCandidates、引用、选区和工具回执都是背景资料。正文可能是资料来源，读取正文并不需要写正文。需要确认对象时，问一个具体问题。
每轮最多12个工具调用，只输出 JSON：{"message":"进展或答复","calls":[{"name":"工具名","args":{}}],"done":false}。结束时 calls 为空，done=true。
用 workspace、list、read 和 read_archive 获取必要资料。作者只要求记录本轮提供的事实时，用这些事实填卡，只在需要查重时查目录。正文按 nextOffset 分页，直到为 null；目录不是正文。章纲使用章节 ID，总纲使用作品 ID，卷纲使用卷 ID。故事档案只自动读取当前章以前的。尚未揭示的资料仅在作者本轮明确引用时可读。
成批新建或更新角色、地点、设定和伏笔时，优先用 propose_cards 一次提交若干项。按回执只重试未完成项。按作者明确确认的清单逐项核对，不需要再问顺序。propose 只填写本轮授权的变更字段，修改已保存资料前先 read。新建资料不传 id。角色用 character；地点用 location（国家、城市等也属于地点，parentId 必须指向已存在的上级地点）；规则、力量体系、势力、物品与历史用 world；明确埋设的伏笔用 foreshadow。正文已发生的事件与已保存的作者设定都是事实。用本轮提供的材料完成所有明确要求的条目，缺少的字段留空，不编造。不用未经确认的候选替代已保存资料。
write_chapter 的 patch 用于局部修改：original 逐字引用唯一可定位的片段，replacement 填纯文本。选区润色只改选区。续写当前章用 append，整章起草或作者明确指定整章改写才用 rewrite。续写下一章前确认卷章顺序，读取必要前情，已有下一章时不覆盖。已经生成的候选用 changeId 继续修订。
工具回执是完成依据。候选显示在本条聊天回复下方，供作者审阅，候选尚未写入作品。简要交代结果与实际失败项。纯讨论任务在读取后直接给出作者要的分析或建议，不能用一句「下面分析」当作最终回复。任务完成后直接收尾；只有存在会影响结果的未决问题时才询问作者。审核字段替换时，根据 possiblyRemoved 核对是否丢失作者要求保留的事实。`

export async function* runAgent(request: AgentRequest, signal?: AbortSignal): AsyncGenerator<AiStreamEvent> {
  const novel=repo.getNovel(request.novelId);
  if (!novel) throw new ApiError("作品不存在",404);
  const retry = request.retryRunId ? getRun(request.retryRunId) : undefined;
  if (retry) {
    if (!request.sessionId || retry.novelId!==novel.id || retry.sessionId!==request.sessionId || retry.request!==request.message) throw new ApiError("重试任务与会话不匹配",400);
    if (retry.status==="running") throw new ApiError("任务仍在运行",409);
    request = {...request, ...retry.requestContext, chapterId:retry.chapterId};
  }
  if(request.chapterId && repo.getChapter(request.chapterId)?.novelId!==novel.id) throw new ApiError("章节不属于该作品",400);
  const chapterIndex = request.chapterId
    ? flattenChapters(novel.id, false).find((ref) => ref.chapter.id === request.chapterId)?.index ?? null
    : null;
  const target=resolveTarget("chat");
  const config=mergeContextConfig(request.context);
  const selection=config.includeSelection?request.selection:undefined;
  const deepThinking=thinkingProfile(target.provider,target.model).adapter==="deepseek" && !!target.thinkingLevel&&target.thinkingLevel!=="off";
  let lastDecisionReasoning="";
  const decisionOverhead=usesDecisionTool(target.provider,target.model)?estimateTokens(JSON.stringify(DECISION_TOOLS)):0;
  // 上下文预算：0 = 不限，但仍受模型窗口保护——按窗口留出输出与工具定义开销后自动裁剪。
  const modelWindow=target.provider.models.find(item=>item.id===target.model)?.contextWindow??0;
  const outputReserve=config.maxTokens>0?config.maxTokens:8000;
  const effectiveBudget=config.contextBudget>0
    ? config.contextBudget
    : modelWindow>0
      ? Math.max(8000,Math.floor(modelWindow*0.9)-outputReserve-decisionOverhead)
      : 0;
  const started=Date.now();
  const run:AgentRun={id:uid("agent"),novelId:novel.id,chapterId:request.chapterId||null,request:request.message,status:"running",summary:"正在理解任务",error:"",steps:[],changes:[],references:[],usage:{promptTokens:0,completionTokens:0,totalTokens:0,latencyMs:0},model:target.model,provider:target.provider.name,preview:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const observed=new Map<string,Fields|null>();
  run.requestContext = {
    chapterId: run.chapterId, agentId:request.agentId??"supervisor", context:config,
    mentions:request.mentions??[], selection, selectionReference: selection ? request.selectionReference : undefined, snapshot:request.snapshot,
  };
  const material=new Map<string,unknown>();
  const appendBases=new Map<string,string>();
  const history=trimChatHistory(request.history??[],historyLimitsFor(effectiveBudget));
  const previousRunId = retry?.requestContext?.previousRunId ?? (retry ? undefined : request.previousRunId)
  let priorRun: AgentRun | undefined
  if (previousRunId) {
    priorRun = getRun(previousRunId)
    if (priorRun.novelId !== novel.id) throw new ApiError("任务不属于该作品", 400)
    if (priorRun.sessionId && priorRun.sessionId !== request.sessionId) throw new ApiError("任务不属于该会话", 400)
    if (priorRun.status === "running") throw new ApiError("任务仍在运行", 409)
  }
  run.requestContext.previousRunId = previousRunId
  run.requestContext.writingPreset = request.writingPreset
  run.requestContext.locale = request.locale
  const action = {id:run.id,type:"agent-run" as const,label:"任务与改动",payload:{runId:run.id,requestContext:run.requestContext},applied:false};
  let previous: AgentRun | undefined
  const pending = priorRun?.changes.filter(change => change.kind === "chapter" && change.state === "pending")
  const pendingChapter = pending?.length === 1 && priorRun?.chapterId === run.chapterId &&
    (!pending[0].targetId || pending[0].targetId === run.chapterId) ? pending[0] : undefined
  const blueprintRead = new Map<string, { content: string; nextOffset: number }>()
  const requiredReceipts = new Set<AiMessage>()
  const current = { request: request.message, currentChapterId: run.chapterId, mentions: request.mentions,
    selection, snapshot: request.snapshot, historyOmitted: history.trimmed }
  const historyContext = history.kept.map(message => ({
    role: message.role,
    content: message.role === "assistant" ? displayAgentReply(message.content) : message.content,
  }))
  const previousCandidates = priorRun?.changes.filter(change => change.state === "pending")
    .map(({ id, kind, targetId, title }) => ({ id, kind, targetId, title }))
  let scope: ReturnType<typeof taskScope>
  let decisionTools: typeof DECISION_TOOLS | undefined
  let availableToolTokens = 0
  let replyLanguage: "zh" | "en" | undefined
  let batchCards = false
  if(request.sessionId) {
    if(repo.getChatSession(request.sessionId)?.novelId!==novel.id) throw new ApiError("会话不属于该作品",400);
    run.sessionId=request.sessionId;
    if(retry?.messageId) run.messageId=retry.messageId;
    else repo.addMessage(request.sessionId,{role:"user",content:request.message,actions:selection?[{id:run.id,type:"selection-reference",label:"引用正文",payload:{text:selection,reference:request.selectionReference},applied:false}]:[]});
    if(!run.messageId) run.messageId=repo.addMessage(request.sessionId,{role:"assistant",content:run.summary,status:"streaming",provider:run.provider,model:run.model,actions:[action]}).id;
  }
  saveRun(run);
  yield {type:"meta",runId:run.id,feature:"custom",provider:target.provider.name,model:target.model};
  yield {type:"action",action};
  yield {type:"agent",run};
  const checkpoint=()=>{run.usage.totalTokens=run.usage.promptTokens+run.usage.completionTokens;run.usage.latencyMs=Date.now()-started;saveRun(run);
    if(run.messageId)repo.updateMessage(run.messageId,{actions:[action],content:run.summary||"正在处理任务",status:run.status==="running"?"streaming":run.status==="error"?"error":run.status==="aborted"?"aborted":"complete",usage:run.usage,error:run.error});
  };
  let completionCalls=0,pricedCalls=0;
  // 决策轮的结构化输出（可能一次拆多张卡）会撑爆 1400 token 的小上限：
  // 一旦真的被截断，就放宽本轮上限重试一次，并在本次任务后续决策轮保持放宽。
  let decisionCapRelaxed=false;
  async function* complete(input: AiMessage[], options: {
    stage: "plan" | "decide" | "write" | "materials"
    shortWrite?: boolean
    structured?: boolean
    temperature?: number
  }): AsyncGenerator<string> {
    const { stage, shortWrite, structured, temperature = 0.4 } = options
    const decisionOutput = stage === "decide"
    const planning = stage === "plan"
    const turnLanguage = replyLanguage === "en"
      ? "\nThe author's current request is in English. Use English for all user-facing replies and newly written material unless explicitly asked to use another language. Preserve names, quotations, and source text."
      : replyLanguage === "zh"
        ? "\n作者本轮指令使用中文。面向作者的回复和新写内容使用中文，作者明确要求其他语言时除外。人名、引用和原文照录。"
        : "";
    input=input.map(message=>message.role==="system"?{...message,content:withLanguageDirective(message.content,request.locale ?? "zh")+turnLanguage}:message);
    const thinkingOptions = thinkingProfile(target.provider, target.model).options;
    const canOff = thinkingOptions.some((option) => option.value === "off");
    const canLow = thinkingOptions.some((option) => option.value === "low");
    const complexDecision = decisionOutput && (scope==="blueprint" || scope==="correct-draft" || /跨章|设定冲突|前后矛盾|continuity|inconsisten/i.test(request.message));
    const thinkingLevel = complexDecision && target.thinkingLevel!=="off"
      ? (target.thinkingLevel==="default" && canLow ? "low" : target.thinkingLevel)
      : (decisionOutput || stage === "materials" || planning) && canOff ? "off"
      : shortWrite && canLow ? "low" : target.thinkingLevel;
    const baseMaxTokens = config.maxTokens || undefined;
    const tools = decisionOutput ? decisionTools : undefined
    const outputFormat = !tools && (planning || decisionOutput || stage === "materials" || structured) &&
      supportsDecisionJson(target.provider, target.model) ? "json" : undefined;
    for (;;) {
      let raw = "";
      let reasoning = "";
      let usage: Extract<ProviderChunk, { type: "usage" }> | undefined;
      const capped = decisionOutput && !batchCards && !decisionCapRelaxed && (baseMaxTokens === undefined || baseMaxTokens > 1400);
      const maxTokens = planning ? Math.min(baseMaxTokens ?? 900, 900) : capped ? 1400 : baseMaxTokens;
      let limited = false;
      try {
        for await (const chunk of streamCompletion({
          provider: target.provider, model: target.model, messages: input, maxTokens,
          temperature, signal, disableThinking: true, thinkingLevel, decisionTools: tools, outputFormat,
        })) {
          if (chunk.type === "usage") usage = chunk;
          if (signal?.aborted) throw new DOMException("已停止", "AbortError");
          if (chunk.type === "reasoning") reasoning += chunk.text;
          if (chunk.type === "delta") {
            raw += chunk.text;
            yield chunk.text;
          }
        }
      } catch (error) {
        limited = isOutputLimitError(error);
        if (!capped || !limited || signal?.aborted) throw error;
        decisionCapRelaxed = true;
        continue;
      } finally {
        completionCalls++;
        const cost = usage?.cost;
        if (cost && (!run.usage.reportedCost || run.usage.reportedCost.currency === cost.currency)) {
          pricedCalls++;
          run.usage.reportedCost = { ...cost, amount: (run.usage.reportedCost?.amount ?? 0) + cost.amount, complete: false };
        }
        if (run.usage.reportedCost) run.usage.reportedCost.complete = pricedCalls === completionCalls;
        run.usage.estimatedTokens = Boolean(run.usage.estimatedTokens || !usage);
        run.usage.promptTokens += usage?.promptTokens ?? (
          input.reduce((sum, message) => sum + estimateTokens(message.content + (message.reasoning_content || "")), 0) +
          (decisionOutput ? availableToolTokens : 0)
        );
        run.usage.completionTokens += usage?.completionTokens ?? (limited && maxTokens ? maxTokens : estimateTokens(raw + reasoning));
        if (usage?.cachedInputTokens !== undefined) {
          run.usage.cachedInputTokens = (run.usage.cachedInputTokens ?? 0) + usage.cachedInputTokens;
          run.usage.cacheReportedInputTokens = (run.usage.cacheReportedInputTokens ?? 0) + usage.promptTokens;
        }
        checkpoint();
      }
      if (decisionOutput) lastDecisionReasoning = deepThinking ? reasoning : "";
      if (!raw.trim() && !decisionOutput) throw new Error("模型未返回内容");
      return;
    }
  }
  const reference=(kind:EntityKind,id:string,row:Fields)=>{
    if(!run.references.some(r=>r.kind===kind&&r.id===id)) run.references.push({kind,id,title:String(row.title||row.name||ENTITY_LABEL[kind])});
  };
  const permitted=(kind:EntityKind,id?:string)=>{
    const flags:Partial<Record<EntityKind,boolean>>={world:config.includeWorld,location:config.includeWorld,character:config.includeCharacters,foreshadow:config.includeForeshadows,outline:config.includeNovelOutline,"volume-outline":config.includeVolumeOutline,blueprint:config.includeChapterBlueprint};
    const explicit=request.mentions?.some(m=>m.type===kind&&m.id===id);
    if(flags[kind]===false&&!explicit)throw new Error("该类资料已在上下文设置中关闭，请开启或明确引用后再读");
  };
  const read=(kind:EntityKind,id:string):Fields|null=>{
    permitted(kind,id);
    const candidate=run.changes.find(c=>c.kind===kind && c.state==="pending" && (c.id===id || c.targetId===id)) || previous?.changes.find(c=>c.id===id&&c.kind===kind&&c.state==="pending");
    if(candidate) return candidate.op==="delete"?{...candidateContext(candidate),pendingDelete:true}:candidateContext(candidate);
    const explicitlyReferenced=request.mentions?.some(mention=>mention.type===kind&&mention.id===id)??false;
    let row=visibleEntity(kind,id,novel.id,chapterIndex,explicitlyReferenced);observed.set(`${kind}:${id}`,row);
    if(row&&request.snapshot?.id===id&&request.snapshot.kind===kind) {
      const allowed=Object.keys(patchSchemas[kind].shape);
      const draft=Object.fromEntries(Object.entries(request.snapshot.fields).filter(([k])=>allowed.includes(k)));
      row={...row,...draft};
    }
    if(row) {reference(kind,id,row);material.set(`${kind}:${id}`,row);}
    return row;
  };
  try {
    if(target.provider.kind==="demo") {
      run.summary="当前是离线演示模型，无法可靠执行多步任务。请在模型设置中选择实际模型后重试。";
      run.status="complete";checkpoint();yield {type:"agent",run};yield {type:"done",usage:run.usage};return;
    }
    // Resolve the current turn before exposing any tool that can stage a change.
    const planningMessages: AiMessage[] = [
      { role: "system", content: TASK_PLANNER },
      { role: "user", content: JSON.stringify({ history: historyContext, previousCandidates,
        current: { request: current.request, currentChapterId: current.currentChapterId, mentions: current.mentions,
          hasSelection: Boolean(selection), snapshotKind: current.snapshot?.kind } }) },
    ]
    let plan: ReturnType<typeof parseTaskPlan> = null
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      let raw = ""
      try {
        for await (const delta of complete(planningMessages, { stage: "plan", temperature: 0 })) raw += delta
      } catch (error) {
        if (!isOutputLimitError(error) || signal?.aborted) throw error
      }
      plan = parseTaskPlan(extractJson(raw), request.message)
      if (!plan) planningMessages.push({ role: "user", content: "按规定的 JSON 结构重试，quote 必须逐字来自 current.request。" })
    }
    if (!plan) throw new Error("未能确认本轮改动范围，请重试")
    replyLanguage = plan.replyLanguage
    const permissions = plan.permissions
    batchCards = permissions.has("createCards") || permissions.has("updateCards")
    previous = plan.usePreviousCandidate ? priorRun : undefined
    const requestedScope = taskScope(request.message, selection, Boolean(previous && pendingChapter))
    if (requestedScope === "blueprint" && permissions.has("editOutline")) scope = requestedScope
    else if (requestedScope !== "blueprint" && permissions.has("writeProse")) scope = requestedScope
    const appendToCurrent = scope === "append" || request.writingPreset === "continue"
    const proseSelection = (plan.editSelection || scope === "selection") && !appendToCurrent ? selection : undefined
    const canPropose = permissions.has("editOutline") || permissions.has("createCards") || permissions.has("updateCards")
    const mayUseTool = (name: string) => {
      if (name === "write_chapter") return permissions.has("writeProse")
      if (name === "propose") return canPropose
      if (name === "propose_cards") return batchCards
      if (name === "delete") return permissions.has("deleteCards")
      if (name === "reject_change") return permissions.size > 0
      return true
    }
    const native = usesDecisionTool(target.provider, target.model)
    const allowedKinds = [
      ...(permissions.has("editOutline") ? OUTLINE_KINDS : []),
      ...(permissions.has("createCards") || permissions.has("updateCards") ? CARD_KINDS : []),
    ]
    const tools = decisionToolsFor(allowedKinds, mayUseTool)
    decisionTools = native ? tools : undefined
    availableToolTokens = native ? estimateTokens(JSON.stringify(tools)) : 0
    const messages: AiMessage[] = [
      { role: "system", content: (native ? nativeDecisionSystem(SYSTEM) : SYSTEM) + "\n" +
        agentPreamble(request.agentId, repo.getSettings()) + "\n" +
        "本轮允许的工具：" + tools.map(tool => tool.name).join(", ") + "。\n" +

        (permissions.has("writeProse") ? JSON.stringify({
          styleGuide: config.includeStyleGuide ? novel.styleGuide : undefined, forbiddenWords: novel.forbiddenWords,
        }) : "") },
      { role: "user", content: JSON.stringify({
        history: historyContext,
        previousCandidates: previous ? previousCandidates : undefined,
        task: { permissions: [...permissions], editSelection: Boolean(proseSelection), appendToCurrent,
          instructions: scope ? SCOPE_INSTRUCTIONS[scope] : undefined,
          candidateId: scope === "correct-draft" ? pendingChapter?.id : undefined },
        customInstruction: config.customInstruction || undefined,
        current,
      }) },
    ]
    const baseMessages = messages.length
    const organizeWrittenProse = plan.organizeWrittenProse && permissions.has("writeProse") &&
      (permissions.has("createCards") || permissions.has("updateCards"))
    run.materialPolicy = organizeWrittenProse ? "auto" : "skip"
    const assertProposalAllowed = (kind: EntityKind, creates: boolean) => {
      const operation = (OUTLINE_KINDS as readonly EntityKind[]).includes(kind) ? "editOutline" :
        (CARD_KINDS as readonly EntityKind[]).includes(kind) ? (creates ? "createCards" : "updateCards") : undefined
      if (!operation || !permissions.has(operation)) throw new Error("本轮任务范围不包含此改动")
    }
    const requirePrevious = (id: string) => {
      if (!previous && priorRun?.changes.some(change => change.id === id)) {
        throw new Error("本轮任务范围不包含此改动")
      }
    }

    const proposalName = (args: Fields) => {
      const fields = args.fields as Fields | undefined
      return String(args.title ?? fields?.name ?? fields?.title ?? "")
    }
    function stageProposal(args: Fields) {
      const kind=kinds.parse(args.kind),inputId=typeof args.id==="string"?args.id:null;
      if (inputId) requirePrevious(inputId)
      const prior=previous?.changes.find(c=>c.id===inputId&&c.kind===kind&&c.state==="pending");
      const id=prior?prior.targetId:inputId;
      assertProposalAllowed(kind, !id);
      if (prior && previous?.changes.some(change => change.kind === "chapter" && change.state === "pending" &&
        (change.id === prior.targetId || prior.evidence?.some(evidence => evidence.candidate && evidence.sourceId === change.id))) &&
        !permissions.has("writeProse")) {
        throw new Error("这条资料依赖尚未确认的正文，请先审阅该正文")
      }
      const inheritedIds: string[] = [];
      if(prior&&!run.changes.some(c=>c.id===prior.id)) {
        const parent=previous?.changes.find(c=>c.id===prior.targetId&&c.kind==="chapter"&&c.state==="pending");
        if(parent&&!run.changes.some(c=>c.id===parent.id)) {
          run.changes.push(structuredClone(parent));
          inheritedIds.push(parent.id);
        }
        run.changes.push(structuredClone(prior));
        inheritedIds.push(prior.id);
        if(id&&!parent)observed.set(`${kind}:${id}`,prior.before);
      }
      try {
        if(kind==="chapter") throw new Error("正文请使用write_chapter，避免JSON正文丢失或截断");
        if(scope==="blueprint" && id) {
          const progress = blueprintRead.get(id);
          if(!progress || progress.nextOffset<progress.content.length) throw new Error("请按 nextOffset 读完当前章正文，再生成章纲");
          if(!stripHtml(progress.content)) throw new Error("当前章节还没有可用于整理章纲的正文");
        }
        // 正文与章纲共享章节 ID。模型已读该章正文时，自动读取对应章纲作为候选基线。
        if(kind==="blueprint"&&id&&observed.get(`chapter:${id}`)&&!observed.has(`blueprint:${id}`)) read(kind,id);
        if(id&&!observed.has(`${kind}:${id}`)&&!run.changes.some(c=>c.id===id||c.kind===kind&&c.targetId===id)) throw new Error("修改前请先读取目标对象");
        const explicitlyReferenced=request.mentions?.some(mention=>mention.type===kind&&mention.id===id)??false;
        const c=propose(run,kind,id,args.fields,String(args.reason||"按作者要求修改"),!id && (CARD_KINDS as readonly EntityKind[]).includes(kind) ? String((args.fields as Fields)?.name ?? (args.fields as Fields)?.title ?? "") : typeof args.title==="string"?args.title:prior?.title,{chapterIndex,explicitlyReferenced},!prior);
        if(id&&observed.has(`${kind}:${id}`)) c.before=observed.get(`${kind}:${id}`)!;
        if(prior&&previous) {
          const parent=previous.changes.find(x=>x.id===prior.targetId&&x.state==="pending");
          supersedeRun(run,previous,parent?[prior.id,parent.id]:[prior.id]);
        }
        return proposalReceipt(c);
      } catch(error) {
        run.changes=run.changes.filter(c=>!inheritedIds.includes(c.id));
        throw error;
      }
    }

    let writes=0,toolCount=0,finished=false;
    let finalReply="";
    // 同一条改动连续失败时不再让模型反复重试：每次都重发整段上下文，白烧轮次。
    const failedTargets=new Map<string,number>();
    let stoppedOnValidation=false;
    for(let round=0;round<12;round++) {
      if(signal?.aborted) throw new DOMException("已停止","AbortError");
      // Pin the instruction and latest task state; evict old observations, never tool-result pairs from native protocols.
      const budget=effectiveBudget;
      if (budget > 0) {
        while(messages.length>baseMessages+2 && messages.reduce((n,m)=>n+estimateTokens(m.content+(m.reasoning_content||"")),0)+availableToolTokens>budget) {
          const start = baseMessages
          const end = messages.findIndex((message, index) => index > start && message.role === "assistant")
          if (end < 0 || messages.slice(start, end).some(message => requiredReceipts.has(message))) break
          messages.splice(start, end - start)
        }
        if(messages.reduce((n,m)=>n+estimateTokens(m.content+(m.reasoning_content||"")),0)+availableToolTokens>budget) throw new Error("任务材料超过上下文预算，请提高预算或缩小任务范围");
      }
      let raw="",decision: z.infer<typeof decisionSchema>|undefined;
      for(let attempt=0;attempt<2;attempt++) {
        raw="";
        try {
          for await(const delta of complete(messages, { stage: "decide" })) raw+=delta;
        } catch (error) {
          if (attempt || signal?.aborted || !isInvalidToolInputError(error)) throw error;
          messages.push({ role: "user", content: "上一次的工具参数没有形成有效 JSON，未执行。请重新调用。若正在整理一批资料，每次提交至多 5 项，先完成一组并读取回执，再接着提交余下的条目。" });
          continue;
        }
        const json=parseAgentDecision(raw);
        const plainReply = raw.trim();
        if (native && json === null && plainReply && !/^(?:```(?:json|xml)\b|[\[{]|<[^>]*DSML)/i.test(plainReply) && !/｜DSML｜/.test(plainReply)) {
          decision = { message: plainReply, calls: [], done: true };
          break;
        }
        const parsed=decisionSchema.safeParse(json);
        if(parsed.success) {decision=parsed.data;break;}
        const diagnostic=protocolDiagnostic(raw,json,parsed.error.issues,round+1,attempt+1);
        (run.diagnostics??=[]).push(diagnostic);checkpoint();
        // Keep malformed examples in diagnostics only: repeating DSML teaches the next
        // attempt to imitate it. Repair with validator feedback and a valid JSON example.
        messages.push({role:"user",content:"上次返回未通过结构校验："+parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; ").slice(0,800)+"。仅输出标准JSON对象，例如{\"message\":\"先读资料\",\"calls\":[{\"name\":\"workspace\",\"args\":{}}],\"done\":false}。每轮最多12个调用，不使用DSML/XML标签。"});
      }
      if(!decision) {
        // 模型偶尔直接回一段自然语言当收尾（不是 JSON）：只要像正常答复且已有候选，就当作最终说明，
        // 不要把「已经做完」的任务报成协议错误——那会让作者以为失败，还可能再点一次重跑。
        const textOnly=raw.trim();
        if(textOnly && textOnly.length<=2000 && parseAgentDecision(textOnly)===null && !/^(?:```|[\[{])/.test(textOnly) && !textOnly.includes("<") && run.changes.length>0) {
          decision={message:textOnly,calls:[],done:true};
          messages.push({role:"assistant",content:JSON.stringify(decision)});
          finished=true;run.summary=textOnly;finalReply=textOnly;
          run.answering=true;
          checkpoint();yield {type:"agent",run};
          break;
        }
        run.errorCode="AGENT_PROTOCOL_INVALID";
        const detail=run.diagnostics?.at(-1)?.issues[0];
        throw new Error(`模型两次返回均未通过工具指令校验${detail?`（${detail.path}: ${detail.message}）`:""}。${run.changes.length?"本轮已完成的候选已保留":"本轮尚未生成新候选，上一轮候选不受影响"}。可展开调试详情查看原因。`);
      }
      const nativeCalls = decision.calls.length > 0 && decision.calls.every(call => call.id)
      messages.push({
        role: "assistant",
        content: nativeCalls || !decision.calls.length ? decision.message : JSON.stringify(decision),
        ...(nativeCalls ? { toolCalls: decision.calls.map(call => ({ ...call, id: call.id! })) } : {}),
        ...(deepThinking ? { reasoning_content: lastDecisionReasoning } : {}),
      });
      run.summary=displayAgentReply(decision.message);
      const progressText=run.summary.trim();
      run.progress??=[];
      if(decision.calls.length && progressText && run.progress.at(-1)?.text!==progressText) {
        run.progress.push({id:uid("progress"),text:progressText,stepIndex:run.steps.length});
      }
      // A nonempty reply with no tools is terminal even if the model omits done.
      if(!decision.calls.length) {
        if(!progressText && !run.changes.some(change=>change.state==="pending")) throw new Error("模型没有给出下一步操作");
        finished=true;
        finalReply=progressText;
        if(finalReply) {
          run.answering=true;
          checkpoint();yield {type:"agent",run};
        }
        break;
      }
      for(const call of decision.calls) {
        if(++toolCount>36) throw new Error("已达到工具调用上限，完成的候选已保留");
        const step:AgentStep={id:uid("step"),tool:call.name,label:({workspace:"查看作品进度",list:"查找相关资料",read:"读取材料",propose:"准备资料改动",propose_cards:"准备资料改动",delete:"准备删除资料",write_chapter:"写作与修订",reject_change:"丢弃候选",read_archive:"读取故事档案"})[call.name],detail:"",status:"running" as "running"|"complete"|"error"};
        const mutates=call.name==="propose"||call.name==="write_chapter"||call.name==="delete";
        const retryTarget=String(call.args.id??call.args.changeId??(proposalName(call.args) || undefined)??(call.name==="write_chapter"?run.chapterId??"":""));
        const retryKey=`${call.name}:${String(call.args.kind??"")}:${retryTarget}`;
        run.steps.push(step);checkpoint();yield {type:"agent",run};
        let result:unknown;
        try {
          const args=call.args;
          if (!mayUseTool(call.name)) throw new Error("本轮任务范围不包含此改动")
          if (scope === "blueprint" && call.name === "propose" &&
            (args.kind !== "blueprint" || args.id !== run.chapterId)) {
            throw new Error("本轮只修改当前章节的章纲")
          }
          if(call.name==="workspace") {
            const tree=repo.getNovelTree(novel.id,false)!;
            const ordered=[...tree.volumes.flatMap(v=>v.chapters),...tree.looseChapters];
            const directory=chapterDirectoryWindow(ordered,request.chapterId,request.mentions?.filter(m=>m.type==="chapter").map(m=>m.id));
            const mentionedCharacters=new Set(request.mentions?.filter(m=>m.type==="character").map(m=>m.id)??[]);
            const mentionedWorld=new Set(request.mentions?.filter(m=>m.type==="world").map(m=>m.id)??[]);
            const mentionedLocations=new Set(request.mentions?.filter(m=>m.type==="location").map(m=>m.id)??[]);
            const characters=(config.includeCharacters?repo.listCharacters(novel.id):[]).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedCharacters.has(c.id)));
            const worlds=(config.includeWorld?repo.listWorld(novel.id):[]).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedWorld.has(c.id)));
            const locations=(config.includeWorld?repo.listLocations(novel.id):[]).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedLocations.has(c.id)));
            const foreshadows=config.includeForeshadows?repo.listForeshadows(novel.id):[];
            const recentArchives=config.includeArchives&&chapterIndex!==null
              ?repo.listArchives(novel.id).filter(a=>a.orderIndex<chapterIndex).slice(-Math.max(1,config.archiveDepth))
              :[];
            result={novel:{id:novel.id,title:novel.title,synopsis:novel.synopsis,pov:novel.pov},volumes:tree.volumes.map(v=>({id:v.id,title:v.title})),chapterCount:ordered.length,chapterListPartial:directory.length<ordered.length,chapters:directory,characterCount:characters.length,characters:characters.slice(0,40).map(c=>({id:c.id,name:c.name})),locationCount:locations.length,locations:[...locations].sort((a,b)=>IMPORTANCE_RANK[a.importance]-IMPORTANCE_RANK[b.importance]).slice(0,40).map(c=>({id:c.id,name:c.name,kind:c.kind,importance:c.importance})),worldCount:worlds.length,world:[...worlds].sort((a,b)=>IMPORTANCE_RANK[a.importance]-IMPORTANCE_RANK[b.importance]).slice(0,40).map(c=>({id:c.id,title:c.title,category:c.category,importance:c.importance})),foreshadowCount:foreshadows.length,foreshadows:foreshadows.slice(0,40).map(c=>({id:c.id,title:c.title})),recentArchives:recentArchives.map(a=>({chapterId:a.chapterId,status:a.status,summary:a.chapterSummary}))};
          } else if(call.name==="list") {
            const kind=kinds.parse(args.kind),query=String(args.query||"");
            const offset=z.number().int().min(0).max(100000).parse(args.offset??0);
            const limit=z.number().int().min(1).max(60).parse(args.limit??30);
            permitted(kind);
            const rows=kind==="character"?repo.listCharacters(novel.id):kind==="location"?repo.listLocations(novel.id):kind==="world"?repo.listWorld(novel.id):kind==="foreshadow"?repo.listForeshadows(novel.id):repo.listChapters(novel.id);
            const explicitlyMentioned=new Set(request.mentions?.filter(m=>m.type===kind).map(m=>m.id)??[]);
            result=rows.filter(r=>{
              if("aiVisible" in r&&!r.aiVisible)return false;
              if("revealAtChapter" in r&&typeof r.revealAtChapter==="number"&&chapterIndex!==null&&r.revealAtChapter>chapterIndex&&!explicitlyMentioned.has(r.id))return false;
              if("revealAtChapter" in r&&typeof r.revealAtChapter==="number"&&chapterIndex===null&&!explicitlyMentioned.has(r.id))return false;
              return JSON.stringify(r).includes(query);
            }).slice(offset,offset+limit).map(r=>({id:r.id,title:"name" in r?r.name:r.title,..."importance" in r?{category:"category" in r?r.category:"kind" in r?r.kind:undefined,importance:r.importance}:{},summary:String("identity" in r?r.identity:"summary" in r?r.summary:"description" in r?r.description:"").slice(0,200)}));
          } else if(call.name==="read_archive") {
            if(!config.includeArchives)throw new Error("故事档案已在上下文设置中关闭");
            const chapterId=z.string().parse(args.chapterId);
            const archiveChapter=flattenChapters(novel.id,false).find(ref=>ref.chapter.id===chapterId);
            if(!archiveChapter)throw new Error("章节不属于该作品");
            const archive=repo.getArchiveByChapter(chapterId);
            const explicitlyMentioned=request.mentions?.some(mention=>mention.type==="archive"&&(mention.id===chapterId||mention.id===archive?.id))??false;
            if((chapterIndex===null||archiveChapter.index>=chapterIndex)&&!explicitlyMentioned)throw new Error("不能读取当前章节之后的故事档案");
            result=archive||{missing:true};
            material.set(`archive:${chapterId}`,result);
          } else if(call.name==="read") {
            const kind=kinds.parse(args.kind),id=z.string().parse(args.id);
            const offset=z.number().int().nonnegative().parse(args.offset??0);
            const limit=z.number().int().min(1).max(16000).parse(args.limit??12000);
            const row=read(kind,id);
            if(row) {
              const content=typeof row.content==="string"?row.content:"";
              result=kind==="chapter"?chapterReadPage(row,offset,limit):{...row,...(kind==="blueprint"?{id}:{}),...(content?{content:content.slice(offset,offset+limit),contentOffset:offset,contentTotal:content.length,truncated:offset+limit<content.length}:{} )};
              if(scope==="blueprint" && kind==="chapter" && id===run.chapterId) {
                const page=result as Fields;
                const progress=blueprintRead.get(id);
                if(offset===(progress?.content===content ? progress.nextOffset : 0)) {
                  blueprintRead.set(id,{content,nextOffset:Number(page.contentOffset)+String(page.content).length});
                }
              }
            } else result={missing:true,kind,id};
          } else if(call.name==="propose") {
            result = stageProposal(args)
          } else if (call.name === "propose_cards") {
            const items = z.array(z.record(z.string(), z.unknown())).min(1).max(20).parse(args.items)
            const accepted: ReturnType<typeof proposalReceipt>[] = []
            const failed: { index: number; title: string; error: string }[] = []
            for (const [index, item] of items.entries()) {
              const title = proposalName(item)
              try {
                if (!(CARD_KINDS as readonly unknown[]).includes(item.kind)) throw new Error("本轮任务范围不包含此改动")
                accepted.push(stageProposal(item))
              } catch (error) {
                failed.push({ index: index + 1, title, error: describeToolError(error) })
              }
            }
            step.targets = accepted.flatMap(receipt => {
              const change = run.changes.find(candidate => candidate.id === receipt.changeId)
              return change ? [{ kind: change.kind, id: change.targetId ?? change.id, title: change.title, changeId: change.id }] : []
            })
            step.detail = failed.map(item => `${item.title || item.index}：${item.error}`).join("\n")
            result = { accepted: accepted.map(({ changeId, title }) => ({ changeId, title })), failed }
          } else if(call.name==="delete") {
            const kind=kinds.parse(args.kind),id=z.string().min(1).parse(args.id);
            permitted(kind,id);
            if(!observed.has(`${kind}:${id}`)) throw new Error("删除前请先读取目标对象");
            const explicitlyReferenced=request.mentions?.some(mention=>mention.type===kind&&mention.id===id)??false;
            const c=proposeDelete(run,kind,id,String(args.reason||"按作者要求删除"),{chapterIndex,explicitlyReferenced});
            result={changeId:c.id,op:"delete",kind,title:c.title,state:"pending",hint:"删除只是待确认候选，作者应用后才会真正删除"};
          } else if(call.name==="reject_change") {
            const c=run.changes.find(c=>c.id===args.changeId);
            if(!c||c.state!=="pending") throw new Error("待确认改动不存在");
            c.state="rejected";result={rejected:true};
          } else if (call.name === "write_chapter") {
            if(++writes>3) throw new Error("已达到三版写作上限，请审阅现有候选");
            const id = appendToCurrent || proseSelection ? run.chapterId : typeof args.id === "string" ? args.id : null;
            if (id) requirePrevious(id)
            let candidate=id?run.changes.find(c=>c.kind==="chapter"&&c.state==="pending"&&(c.id===id||c.targetId===id)):undefined;
            const prior=id&&!proseSelection?previous?.changes.find(c=>c.kind==="chapter"&&c.state==="pending"&&c.id===id):undefined;
            const copiedPrior=!candidate&&prior;
            if(copiedPrior) candidate={...copiedPrior,id:uid("change"),after:{...copiedPrior.after}};
            const actualId=candidate?candidate.targetId:id;
            if (proseSelection && actualId !== run.chapterId) throw new Error("当前没有对应章节的选区，请选择后重试")
            if(id&&!candidate&&!observed.has(`chapter:${id}`)&&!appendToCurrent&&scope!=="selection"&&!proseSelection) throw new Error("改正文前请先读取目标章节");
            const source=candidate?(proseSelection?candidate.before:candidateContext(candidate)):id?read("chapter",id):null;
            const mode=appendToCurrent?"append":proseSelection?"selection":z.enum(["rewrite","append","selection","patch"]).parse(args.mode??"rewrite");
            if(scope==="correct-draft" && (id!==pendingChapter?.id || mode!=="patch")) {
              throw new Error("请先确认要改的是哪一稿，再局部修改");
            }
            if(mode==="append"&&!actualId) throw new Error("请先打开要续写的章节");
            if(mode==="rewrite"&&id&&typeof source?.content==="string"&&stripHtml(source.content)&&/(?:改|修改|替换)(?:这|那|某|一)(?:句|段|处|个片段)|(?:change|edit|replace) (?:this|that|one) (?:sentence|paragraph|passage)/i.test(request.message)) {
              throw new Error("这项请求只涉及局部修改，请用 patch 引用原句并提供替换文字");
            }
            if(mode==="patch"&&(!id||typeof source?.content!=="string")) throw new Error("局部修改需要指定已读取的章节或正文候选");
            const edits=mode==="patch"?z.array(z.object({original:z.string().min(1).max(4000),replacement:z.string().max(4000)})).min(1).max(30).parse(args.edits):undefined;
            const words=z.number().int().min(mode==="selection"?1:100).max(8000).parse(args.words??(mode==="selection"?Math.max(1,countWords(proseSelection||"")):2000));
            const instruction=z.string().min(1).parse(args.instruction);
            if(mode==="selection"&&(!proseSelection||actualId!==request.chapterId)) throw new Error("当前没有对应章节的选区，请选择后重试");
            const sourceHtml=String(source?.content??"");
            const selectedEdit = mode==="selection" ? prepareProseEdit(sourceHtml,proseSelection!,request.selectionReference) : undefined;
            const appendBase=mode==="append"?(appendBases.get(candidate?.id||"")??String(source?.content||"")):"";
            const appendDraft=mode==="append"&&candidate&&appendBases.has(candidate.id)?String(candidate.after.content||"").slice(appendBase.length):undefined;
            const manuscript=stripHtml(sourceHtml);
            const selectedFrom=request.selectionReference?.from ?? (proseSelection ? manuscript.indexOf(proseSelection) : -1);
            const writerSource=mode==="append"?{title:source?.title,content:stripHtml(appendBase).slice(-2800),wordCount:countWords(appendBase)}:mode==="selection"?{
              title:source?.title,content:proseSelection,
              ...(proseSelection&&selectedFrom>=0&&manuscript.slice(selectedFrom,selectedFrom+proseSelection.length)===proseSelection?{
                before:manuscript.slice(Math.max(0,selectedFrom-600),selectedFrom),
                after:manuscript.slice(selectedFrom+proseSelection.length,selectedFrom+proseSelection.length+600),
              }:{}),
            }:source;
            if(mode==="append"&&actualId&&config.includeChapterBlueprint&&!material.has(`blueprint:${actualId}`)) read("blueprint",actualId);
            run.preview="";
            let content: string;
            let generated: number;
            if(mode==="patch") {
              content=editProse(sourceHtml,edits!);
              generated=edits!.reduce((total,edit)=>total+countWords(edit.replacement),0);
            } else {
              const feature = request.writingPreset === "continue" && mode === "append" ? "continue"
                : mode === "selection" && request.writingPreset !== "continue" ? request.writingPreset : undefined
              const preset = feature && resolvePreset(feature, repo.listPresets(novel.id), undefined, request.locale)
              const presetVars = {
                words, ratio: 1.6, message: request.message, instruction, selection: proseSelection,
                chapterTitle: typeof source?.title === "string" ? source.title : undefined,
                tail: mode === "append" ? stripHtml(appendBase).slice(-2800) : undefined,
                chapterGoal: actualId ? String((material.get(`blueprint:${actualId}`) as Fields | undefined)?.goal ?? "") : undefined,
              }
              const writer=writerMessages({style:config.includeStyleGuide?novel.styleGuide:"",customInstruction:config.customInstruction,forbiddenWords:novel.forbiddenWords,materials:[...material.entries()],currentKey:actualId?`chapter:${actualId}`:undefined,current:writerSource,request:request.message,instruction,words,mode,appendDraft,selection:selectedEdit?.fragments,changes:run.changes.filter(c=>c.kind!=="chapter"&&c.state==="pending").map(c=>({kind:c.kind,...c.after})),preset: preset ? {
                system: renderTemplate(preset.systemPrompt, presetVars),
                user: renderTemplate(preset.userTemplate, presetVars),
              } : undefined});
              const temperature = preset ? preset.temperature : undefined
              if(budget>0&&writer.reduce((n,m)=>n+estimateTokens(m.content+(m.reasoning_content||"")),0)>budget) throw new Error("写作材料超过上下文预算，请提高预算或缩小范围");
              // 「只改第N段 / 润色这一处」这类短活不需要深度思考：按请求措辞与目标字数判断，
              // 长章创作仍用作者设置的思考档位。
              const shortScope = /只改|仅改|这一段|这段|局部|润色|改一句|这一句/.test(`${request.message} ${instruction}`);
              const shortWrite = mode==="selection" || words<=800 || shortScope;
              let output="";
              if(selectedEdit) {
                const schema=z.object({replacements:z.array(z.object({
                  id:z.number().int(),text:z.string().trim().min(1).refine(text=>!/[\r\n\u2028\u2029]|<\/?[a-z][^>]*>/i.test(text)),
                }).strict())}).strict();
                const allowed = new Set(selectedEdit.fragments.map(fragment=>fragment.id));
                let revision: { patches: ReturnType<typeof selectedEdit.patches>; words: number } | undefined;
                for(let attempt=0;attempt<2;attempt++) {
                  output="";
                  for await(const delta of complete(writer, { stage: "write", shortWrite, structured: true, temperature })) output+=delta;
                  if(signal?.aborted) throw new DOMException("已停止","AbortError");
                  const result=schema.safeParse(extractJson(output));
                  if(result.success) {
                    const replacements=new Map(result.data.replacements.map(({id,text})=>[id,text]));
                    if(replacements.size===result.data.replacements.length && [...replacements.keys()].every(id=>allowed.has(id))) {
                      revision={
                        patches:selectedEdit.patches(replacements),
                        words:[...replacements.values()].reduce((total,text)=>total+countWords(text),0),
                      };
                      break;
                    }
                  }
                  writer.push({role:"user",content:"按指定 JSON 格式返回替换文字。只使用 selection 中的编号，每个编号最多出现一次，文字不能包含换行或 HTML。"});
                }
                if(!revision) throw new Error("修订未能保留原来的段落结构，请重试或缩小选区");
                if(!revision.patches.length) throw new Error("内容没有变化");
                content=applyProsePatches(sourceHtml,revision.patches);
                generated=revision.words;
              } else {
                for await(const delta of complete(writer, { stage: "write", shortWrite, temperature })) {
                  output+=delta;
                  run.preview+=delta;yield {type:"agent-preview",runId:run.id,text:delta};
                }
                if(signal?.aborted) throw new DOMException("已停止","AbortError");
                const prose=writerPlainText(output);
                if(!prose) throw new Error("模型未返回内容");
                generated=countWords(prose);
                content=proseHtml(prose);
                if(mode==="append") content=appendBase+content;
              }
            }
            if(candidate&&appendBases.has(candidate.id)&&!content.startsWith(appendBases.get(candidate.id)!))throw new Error("本轮为追加任务，不能改动原文，请只修订新增段落");
            const proposedNewCount=run.changes.filter(c=>c.kind==="chapter"&&!c.targetId&&c.state==="pending"&&c.id!==candidate?.id).length;
            const local=mode==="selection"||mode==="patch";
            const title=String((!local&&mode!=="append"&&args.title)||source?.title||candidate?.title||`第 ${repo.listChapters(novel.id,false).length+proposedNewCount+1} 章`);
            let change;
            if(candidate) {candidate.after={...candidate.after,content};change=candidate;if(copiedPrior)run.changes.push(candidate);}
            else {
              const fields=local||mode==="append"?{content}:{title,content,...(!actualId?{volumeId:typeof args.volumeId==="string"?args.volumeId:null}: {})};
              change=propose(run,"chapter",actualId,fields,instruction,title);
              if(actualId&&observed.has(`chapter:${actualId}`)) change.before=observed.get(`chapter:${actualId}`)!;
            }
            if(mode==="append")appendBases.set(change.id,appendBase);
            if(prior&&previous){
              const retiredIds=[prior.id];
              const countBeforeChildren=run.changes.length;
              for(const child of previous.changes.filter(c=>c.state==="pending"&&(c.targetId===prior.id||c.evidence?.some(e=>e.candidate&&e.sourceId===prior.id)))) {
                const permittedChild = child.kind === "blueprint" ? permissions.has("editOutline")
                  : permissions.has(child.targetId ? "updateCards" : "createCards")
                if (!permittedChild) continue
                const next=structuredClone(child);
                next.id=uid("change");
                if(next.targetId===prior.id)next.targetId=change.id;
                for(const evidence of next.evidence??[]) {
                  if(evidence.candidate&&evidence.sourceId===prior.id)evidence.sourceId=change.id;
                }
                run.changes.push(next);
                retiredIds.push(child.id);
              }
              try {
                supersedeRun(run,previous,retiredIds);
              } catch(error) {
                run.changes=run.changes.slice(0,countBeforeChildren).filter(candidate=>candidate.id!==change.id);
                throw error;
              }
            }
            run.preview="";
            const actual=countWords(content);
            result={changeId:change.id,title,words:actual,generatedWords:generated,state:"pending",...(local?{hint:"已暂存局部修改，其余正文保留。"}:{targetWords:words,ratio:Math.round(generated/words*100),hint:mode==="append"?"words是全章总字数，generatedWords才是本次新增字数；不要混淆。原文保持不变。":"可以read候选并复核；修订请传changeId，不要再次新建章节。若明确目标字数未到90%，应在剩余轮次内主动打磨，不反问是否要完成原要求。"})};
          }
          step.status=call.name==="propose_cards" && !step.targets?.length ? "error" : "complete";
          if(mutates) {
            // A successful mutation can switch from a chapter ID to its candidate ID.
            // Its next validation attempt starts from the newly produced state.
            const change=run.changes.find(candidate=>candidate.id===(result as Fields).changeId);
            const prefix=`${call.name}:${String(call.args.kind??"")}:`;
            const completedTargets=[retryKey, ...(change?[prefix+change.id,prefix+change.targetId]:[])];
            for(const failureKey of failedTargets.keys()) {
              if(completedTargets.includes(failureKey.split("\n",1)[0])) failedTargets.delete(failureKey);
            }
          }
          const resultRow=result as Fields;
          if(call.name==="workspace")step.detail="已查看作品信息与资料目录，尚未读取各卡片正文。";
          if(call.name==="list") {
            const rows=result as Fields[];
            step.detail=call.args.query ? "{kind} · 搜索「{query}」 · {count} 项目录结果" : "{kind} · {count} 项目录结果";
            step.detailValues={kind:ENTITY_LABEL[call.args.kind as EntityKind],query:String(call.args.query??""),count:rows.length};
            step.targets=rows.slice(0,6).map(row=>({kind:call.args.kind as EntityKind,id:String(row.id),title:String(row.title)}));
          }
          if(call.name==="read") {
            if(resultRow.missing)step.detail="未找到此资料";
            else {
              step.targets=[{kind:call.args.kind as EntityKind,id:String(call.args.id),title:String(resultRow.title||resultRow.name||ENTITY_LABEL[call.args.kind as EntityKind])}];
              if (resultRow.contentTotal) {
                const start = Number(resultRow.contentOffset);
                const total = Number(resultRow.contentTotal);
                step.detail = resultRow.truncated ? "正文 {start}–{end} / {total} 字符，后续尚未读取" : "正文 {start}–{end} / {total} 字符";
                step.detailValues = { start: start + 1, end: Math.min(start + String(resultRow.content).length, total), total };
              }
            }
          }
          if(call.name==="read_archive") {
            step.targets=[{kind:"chapter",id:String(call.args.chapterId),title:repo.getChapter(String(call.args.chapterId))?.title||"章节档案"}];
            step.detail=resultRow.missing?"尚无故事档案":"已读取该章故事档案";
          }
          if(call.name==="propose"||call.name==="write_chapter"||call.name==="delete") {
            const change=run.changes.find(c=>c.id===resultRow.changeId);
            if(change){step.label=change.op==="delete"?"准备删除":change.before?"准备修改":"准备新建";step.targets=[{kind:change.kind,id:change.targetId||change.id,title:change.title,changeId:change.id}];step.detail="候选已准备，等待确认";}
          }
          if(call.name==="reject_change")step.detail="已丢弃指定候选";
        } catch(error) {
          if(signal?.aborted) throw error;
          const readable=describeToolError(error);
          step.status="error";step.detail=readable;
          result={error:readable};
          if(mutates) {
            // Distinct validation failures can represent progress toward a valid request.
            const failureKey=`${retryKey}\n${readable}`;
            const failed=(failedTargets.get(failureKey)??0)+1;
            failedTargets.set(failureKey,failed);
            if(failed>=2 && call.name==="write_chapter") stoppedOnValidation=true;
          }
        }
        checkpoint();yield {type:"agent",run};
        const serialized=JSON.stringify(result);
        // 工具回执会留在上下文里被每轮重发：截断到 4000 字符，需要全文时让模型分页再读。
        const receipt: AiMessage = {role:nativeCalls?"tool":"user",...(nativeCalls?{toolCallId:call.id,toolError:step.status==="error"}:{}),content:`工具回执（背景资料） ${call.name} 返回：${serialized.length>TOOL_RECEIPT_LIMIT?JSON.stringify({error:"回执过长已省略，请用 offset/limit 分页读取，或 query 精确检索" }):serialized}\n当前候选：${JSON.stringify(run.changes.map(c=>({changeId:c.id,kind:c.kind,title:c.title,state:c.state})))}`};
        if(scope==="blueprint" && call.name==="read" && call.args.kind==="chapter" && call.args.id===run.chapterId &&
          typeof (result as Fields).content==="string" && serialized.length<=TOOL_RECEIPT_LIMIT) requiredReceipts.add(receipt);
        messages.push(receipt);
      }
      if(stoppedOnValidation) break;
    }
    if (run.steps.some(step => step.status === "error") && !run.changes.length && permissions.size) stoppedOnValidation = true;
    if(stoppedOnValidation) {
      finished=true;
      run.stoppedOnValidation=true;
      run.summary=run.changes.some(c=>c.state==="pending") ? "" : "本轮未生成可审阅的改动。可在执行记录里查看原因。";
    }
    if(!finished) run.summary=run.changes.some(c=>c.state==="pending")
      ?"本轮已达到处理步数上限。请审阅已生成的候选，也可以点「继续修改」。"
      :"本轮已达到处理步数上限，尚未生成待审阅的候选。";
    const drafts=run.changes.filter(c=>c.kind==="chapter"&&c.state==="pending"&&typeof c.after.content==="string");
    if(drafts.length&&organizeWrittenProse&&(config.includeCharacters||config.includeWorld||config.includeForeshadows)) {
      const step:AgentStep={id:uid("step"),tool:"organize_materials",label:"整理正文资料",detail:"核对人物、设定和伏笔，已有资料只补空白；所有卡片仍待确认。",status:"running" as "running"|"complete"|"error"};
      run.steps.push(step);checkpoint();yield {type:"agent",run};
      try {
        const sources:MaterialSource[]=drafts.map(c=>({id:c.id,title:c.title,text:stripHtml(String(c.after.content)),candidate:true}));
        for(const [key,row] of material) {
          if(key.startsWith("chapter:")&&row&&typeof row==="object"&&"content" in row&&!drafts.some(c=>c.targetId===key.slice(8))) {
            const chapter=row as Fields;sources.push({id:key.slice(8),title:String(chapter.title||"已读正文"),text:stripHtml(String(chapter.content||"")),candidate:false});
          }
        }
        const existing:ExistingMaterial[]=[];
        const mentionedCharacters=new Set(request.mentions?.filter(m=>m.type==="character").map(m=>m.id)??[]);
        const mentionedWorld=new Set(request.mentions?.filter(m=>m.type==="world").map(m=>m.id)??[]);
        const mentionedLocations=new Set(request.mentions?.filter(m=>m.type==="location").map(m=>m.id)??[]);
        if(config.includeCharacters)for(const c of repo.listCharacters(novel.id).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedCharacters.has(c.id))))existing.push({kind:"character",id:c.id,fields:c as unknown as Fields});
        if(config.includeWorld)for(const c of repo.listLocations(novel.id).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedLocations.has(c.id))))existing.push({kind:"location",id:c.id,fields:c as unknown as Fields});
        if(config.includeWorld)for(const c of repo.listWorld(novel.id).filter(c=>isAiVisibleAtChapter(c,chapterIndex,mentionedWorld.has(c.id))))existing.push({kind:"world",id:c.id,fields:c as unknown as Fields});
        if(config.includeForeshadows)for(const c of repo.listForeshadows(novel.id))existing.push({kind:"foreshadow",id:c.id,fields:c as unknown as Fields});
        for(const c of run.changes.filter(c=>c.state==="pending"&&["character","world","location","foreshadow"].includes(c.kind))) {
          const row=existing.find(x=>x.kind===c.kind&&x.id===c.targetId&&c.targetId);
          if(row)row.fields={...row.fields,...c.after};
          else existing.push({kind:c.kind as ExistingMaterial["kind"],id:c.targetId,fields:{...c.before,...c.after}});
        }
        const input:AiMessage[]=[{role:"system",content:MATERIAL_PROMPT},{role:"user",content:JSON.stringify({sources,existing,allowedKinds:[...(config.includeCharacters?["character"]:[]),...(config.includeWorld?["location","world"]:[]),...(config.includeForeshadows?["foreshadow"]:[])]})}];
        const budget=effectiveBudget;
        if(budget>0&&input.reduce((n,m)=>n+estimateTokens(m.content+(m.reasoning_content||"")),0)>budget)throw new Error("资料整理材料超过预算，本轮正文已保留，可引用单章继续整理");
        let parsed:z.infer<typeof materialResultSchema>|undefined;
        for(let attempt=0;attempt<2;attempt++) {
          let raw="";for await(const delta of complete(input, { stage: "materials" }))raw+=delta;
          const result=materialResultSchema.safeParse(extractJson(raw));if(result.success){parsed=result.data;break;}
          input.push({role:"user",content:"请按cards、kind、fields、evidence约定返回有效JSON，每条evidence含field、sourceId、quote。"});
        }
        if(!parsed)throw new Error("资料整理未返回有效结构，正文候选已保留");
        const preparedIds=new Set<string>();let skipped=0;
        for(const item of parsed.cards) {
          try {
            permitted(item.kind);
            const prepared=prepareMaterial(item,sources,existing);
            assertProposalAllowed(prepared.kind, !prepared.targetId);
            if(!Object.keys(prepared.fields).length)continue;
            const pending=run.changes.find(c=>c.kind===prepared.kind&&c.targetId===prepared.targetId&&c.state==="pending"&&(prepared.targetId||c.title===prepared.title));
            if(pending&&!preparedIds.has(pending.id))continue;
            const explicitlyReferenced=request.mentions?.some(mention=>mention.type===prepared.kind&&mention.id===prepared.targetId)??false;
            const change=propose(run,prepared.kind,prepared.targetId,prepared.fields,"依据正文整理，仅补充有依据的资料",prepared.title,{chapterIndex,explicitlyReferenced});
            change.evidence=[...(change.evidence??[]),...prepared.evidence];
            const row=existing.find(x=>x.kind===prepared.kind&&(prepared.targetId?x.id===prepared.targetId:String(x.fields.name||x.fields.title)===prepared.title));
            if(row)row.fields={...row.fields,...prepared.fields};else existing.push({kind:prepared.kind,id:null,fields:prepared.fields});
            preparedIds.add(change.id);
          } catch {skipped++;}
        }
        step.targets=run.changes.filter(c=>preparedIds.has(c.id)).map(c=>({kind:c.kind,id:c.targetId||c.id,title:c.title,changeId:c.id}));
        step.status="complete";step.detail=`已准备 ${preparedIds.size} 项资料补充，等待确认。${skipped?`另有 ${skipped} 项未通过引用、权限或重名校验，未加入清单。`:preparedIds.size?"可逐项查看原文依据。":"没有需要补充的可靠资料。"}`;
        run.summary+=`\n\n${step.detail}`;
      } catch(error) {
        if(signal?.aborted)throw error;
        step.status="error";step.detail=error instanceof Error?error.message:"资料整理失败";
        run.summary+="\n\n资料整理未完成，正文候选已保留，可继续要求整理资料。";
      }
      checkpoint();yield {type:"agent",run};
    }
    if(proposalsNeedRecap(run.changes, finalReply)) run.recap=true;
    run.status=run.changes.some(c=>c.state==="pending")?"ready":"complete";
  } catch(error) {
    run.status=signal?.aborted?"aborted":"error";
    run.errorCode??=signal?.aborted?"AGENT_ABORTED":"AGENT_EXECUTION_FAILED";
    run.error=signal?.aborted?"已停止，完成的候选已保留":error instanceof Error?error.message:"任务失败";
    run.steps.filter(s=>s.status==="running").forEach(s=>{s.status="error";s.detail=run.error;});
  } finally {
    delete run.answering;
    if(run.status==="running") {run.status="aborted";run.error="连接中断，完成的候选已保留";}
    checkpoint();
    repo.addAiLog({novelId:novel.id,chapterId:request.chapterId||null,feature:"custom",provider:run.provider,model:run.model,cachedInputTokens:run.usage.cachedInputTokens,cacheReportedInputTokens:run.usage.cacheReportedInputTokens,promptTokens:run.usage.promptTokens,completionTokens:run.usage.completionTokens,latencyMs:run.usage.latencyMs,status:run.status==="error"?"error":run.status==="aborted"?"aborted":"ok",error:run.error,promptPreview:request.message.slice(0,600),responsePreview:run.summary.slice(0,600)});
    repo.recordAiTokens(run.usage.totalTokens);
  }
  yield {type:"agent",run};
  yield {type:"done",usage:run.usage};
}
