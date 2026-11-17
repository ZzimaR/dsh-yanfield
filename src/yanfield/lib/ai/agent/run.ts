import * as repo from "@/lib/repo"
import { ApiError } from "@/lib/api-utils"
import { resolveTarget, mergeContextConfig } from "@/lib/ai/engine"
import { historyLimitsFor, trimChatHistory } from "@/lib/ai/history"
import { agentPreamble } from "@/lib/ai/prompts"
import { estimateTokens, uid } from "@/lib/ui/cn"
import type { AiStreamEvent } from "@/lib/types"
import type { AiMessage } from "@/lib/ai/provider"
import { createCompletion, messageTokens } from "./complete"
import { requestedChapterTool } from "./chapter-tool"
import { agentTools } from "./tools"
import { organizeNotes } from "./changes"
import { AGENT_INSTRUCTIONS } from "./instructions"
import { runTools, toolError } from "./loop"
import { proseEditor } from "./prose"
import { proposalsNeedRecap } from "./recap"
import { displayAgentReply } from "./reply"
import { getRun, saveRun } from "./store"
import type { AgentRequest, AgentRun, AgentStep, Fields } from "./types"
import { openWorkspace } from "./workspace"

export async function* runAgent(request: AgentRequest, signal?: AbortSignal): AsyncGenerator<AiStreamEvent> {
  const novel=repo.getNovel(request.novelId)
  if (!novel) throw new ApiError("作品不存在",404)
  const retry = request.retryRunId ? getRun(request.retryRunId) : undefined
  if (retry) {
    if (!request.sessionId || retry.novelId!==novel.id || retry.sessionId!==request.sessionId || retry.request!==request.message) throw new ApiError("重试任务与会话不匹配",400)
    if (retry.status==="running") throw new ApiError("任务仍在运行",409)
    request = {...request, ...retry.requestContext, chapterId:retry.chapterId}
  }
  if(request.chapterId && repo.getChapter(request.chapterId)?.novelId!==novel.id) throw new ApiError("章节不属于该作品",400)
  const target=resolveTarget("chat")
  const config=mergeContextConfig(request.context)
  const selection=config.includeSelection?request.selection:undefined
  const model = target.provider.models.find(item => item.id === target.model)
  const window = model?.contextWindow ?? 0
  const reserve = config.maxTokens || model?.maxOutputTokens || 8000
  const budget = config.contextBudget || (window > 0 ? Math.max(1, Math.floor(window * 0.9) - reserve) : 0)
  const started = Date.now()
  const run: AgentRun = {
    id: uid("agent"), novelId: novel.id, chapterId: request.chapterId ?? null, request: request.message,
    status: "running", summary: "正在理解任务", error: "", steps: [], changes: [], references: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0 },
    model: target.model, provider: target.provider.name, preview: "",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  const previousRunId = retry?.requestContext?.previousRunId ?? (retry ? undefined : request.previousRunId)
  let priorRun: AgentRun | undefined
  if (previousRunId) {
    priorRun = getRun(previousRunId)
    if (priorRun.novelId !== novel.id) throw new ApiError("任务不属于该作品", 400)
    if (priorRun.sessionId && priorRun.sessionId !== request.sessionId) throw new ApiError("任务不属于该会话", 400)
    if (priorRun.status === "running") throw new ApiError("任务仍在运行", 409)
  }

  run.requestContext = {
    chapterId: run.chapterId, agentId: request.agentId ?? "supervisor", context: config,
    mentions: request.mentions ?? [], selection, selectionReference: selection ? request.selectionReference : undefined,
    snapshot: request.snapshot, previousRunId, writingPreset: request.writingPreset, locale: request.locale,
  }
  const action = { id: run.id, type: "agent-run" as const, label: "任务与改动", payload: { runId: run.id, requestContext: run.requestContext }, applied: false }
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

  try {
    if (target.provider.kind === "demo") {
      run.summary = "当前是离线演示模型，无法可靠执行多步任务。请在模型设置中选择实际模型后重试。"
      run.status = "complete"
    } else {
      const workspace = openWorkspace(novel, request, config, run, priorRun)
      const chapterTool = requestedChapterTool(request.message)
      const tools = chapterTool ? agentTools.filter(tool => ["search", "read", chapterTool].includes(tool.name)) : agentTools
      const toolTokens = estimateTokens(JSON.stringify(tools))
      const complete = createCompletion(target, config, request, run, checkpoint, tools, toolTokens, signal)
      const selectedToolInstruction = chapterTool
        ? `\n本轮作者在输入开头指定了章节操作。唯一可用的改动工具是 ${chapterTool}。可先查找和读取。缺少必要信息时请询问作者。`
        : ""
      const system: AiMessage = { role: "system", content: AGENT_INSTRUCTIONS + selectedToolInstruction + "\n" + agentPreamble(request.agentId, repo.getSettings()) }
      const context = {
        previousCandidates: priorRun?.changes.filter(change => change.state === "pending")
          .map(({ id, kind, targetId, title }) => ({ id, kind, targetId, title })),
        customInstruction: config.customInstruction || undefined,
        current: { request: request.message, chapterId: run.chapterId, novelId: novel.id, selection,
          mentions: request.mentions, snapshot: request.snapshot, writingPreset: request.writingPreset },
      }
      const limits = historyLimitsFor(budget ? Math.max(1, budget - toolTokens) : 0)
      const available = budget ? Math.max(0, budget - toolTokens - messageTokens(system) -
        messageTokens({ role: "user", content: JSON.stringify(context) }) - 1000) : Number.POSITIVE_INFINITY
      const history = available > 0 ? trimChatHistory(request.history ?? [], {
        ...limits, maxChars: Math.min(limits.maxChars, Math.floor(available)),
      }).kept : []
      const messages: AiMessage[] = [
        system,
        { role: "user", content: JSON.stringify({
          history: history.map(message => ({ ...message,
            content: message.role === "assistant" ? displayAgentReply(message.content) : message.content })),
          ...context,
        }) },
      ]
      const edit = proseEditor(novel, request, config, run, workspace, complete, budget, priorRun, signal)
      async function* organize(id: string): AsyncGenerator<AiStreamEvent, Fields> {
        const step: AgentStep = { id: uid("step"), tool: "organize_materials", label: "整理正文资料", detail: "", status: "running" }
        run.materialPolicy = "auto"
        run.steps.push(step)
        checkpoint()
        yield { type: "agent", run }
        let receipt: Fields
        try {
          const { changes, skipped } = await organizeNotes(run, workspace, request, complete, budget, new Set([id]), signal)
          step.targets = changes.map(change => ({ kind: change.kind, id: change.targetId ?? change.id, title: change.title, changeId: change.id }))
          step.status = skipped ? changes.length ? "partial" : "error" : "complete"
          step.detail = "{accepted} 项候选已准备，{failed} 项未完成"
          step.detailValues = { accepted: changes.length, failed: skipped }
          receipt = { ok: skipped === 0, changes: step.targets, skipped,
            ...(skipped ? { error: "部分资料未通过原文和重复项校验。" } : {}) }
        } catch (error) {
          signal?.throwIfAborted()
          step.status = "error"
          step.detail = toolError(error).message
          receipt = { ok: false, error: step.detail }
        }
        checkpoint()
        yield { type: "agent", run }
        return receipt
      }
      yield* runTools({ run, request, prior: priorRun, workspace, complete, messages, budget, checkpoint, edit, organize, signal, toolTokens,
        allowedTools: chapterTool ? new Set(tools.map(tool => tool.name)) : undefined })
      if (proposalsNeedRecap(run.changes, run.summary)) run.recap = true
      run.status = run.changes.some(change => change.state === "pending") ? "ready" : "complete"
    }
  } catch(error) {
    const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError")
    run.status=aborted?"aborted":"error";
    run.errorCode??=aborted?"AGENT_ABORTED":"AGENT_EXECUTION_FAILED";
    run.error=aborted?"已停止，完成的候选已保留":error instanceof Error?error.message:"任务失败";
    run.steps.filter(s=>s.status==="running").forEach(s=>{s.status="error";s.detail=run.error;});
  } finally {
    delete run.answering;
    if(run.status==="running") {run.status="aborted";run.error="连接中断，完成的候选已保留";}
    checkpoint();
    repo.addAiLog({novelId:novel.id,chapterId:request.chapterId||null,feature:"custom",provider:run.provider,model:run.model,cachedInputTokens:run.usage.cachedInputTokens,cacheReportedInputTokens:run.usage.cacheReportedInputTokens,promptTokens:run.usage.promptTokens,completionTokens:run.usage.completionTokens,latencyMs:run.usage.latencyMs,status:run.status==="aborted"?"aborted":run.status==="error"||run.incomplete?"error":"ok",error:run.error,promptPreview:request.message.slice(0,600),responsePreview:run.summary.slice(0,600)});
    repo.recordAiTokens(run.usage.totalTokens);
  }
  yield {type:"agent",run};
  yield {type:"done",usage:run.usage};
}
