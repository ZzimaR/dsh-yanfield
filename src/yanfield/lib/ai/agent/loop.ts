import { ZodError } from "zod"
import { ApiError } from "@/lib/api-utils"
import { isInvalidToolInputError, isOutputLimitError, type AiMessage, type NativeToolCall } from "@/lib/ai/provider"
import { uid } from "@/lib/ui/cn"
import type { AiStreamEvent } from "@/lib/types"
import { messageTokens, toolTokens, type Complete } from "./complete"
import { stageFields } from "./changes"
import { proposalReceipt } from "./receipt"
import { TOOL_RECEIPT_LIMIT } from "./read-page"
import { proposeDelete } from "./store"
import { streamThoughts } from "./thoughts"
import { deleteSchema, itemSchema, proseSchema, readSchema, searchSchema, writeSchema } from "./tools"
import { ENTITY_LABEL, type AgentChange, type AgentRequest, type AgentRun, type AgentStep, type Fields } from "./types"
import type { Workspace } from "./workspace"

const labels: Record<string, string> = {
  search: "查找相关资料", read: "读取材料", write: "准备资料改动", edit_prose: "写作与修订", delete: "准备删除资料",
}

const MAX_ROUNDS = 20
const MAX_CALLS = 60
const writingTools = new Set(["write", "edit_prose", "delete"])

function target(change: AgentChange) {
  return { kind: change.kind, id: change.targetId ?? change.id, title: change.title, changeId: change.id }
}

export function toolError(error: unknown) {
  if (error instanceof ZodError) {
    return { code: "INVALID_ARGUMENTS", message: "参数不合法，请按工具定义修正。",
      fields: error.issues.slice(0, 4).map(issue => ({ path: issue.path.join("."), message: issue.message })) }
  }
  if (error instanceof SyntaxError) return { code: "INVALID_JSON", message: "工具参数必须是合法的 JSON 对象。" }
  if (error instanceof ApiError) return { code: error.status === 409 ? "CONFLICT" : "INVALID_TARGET", message: error.message }
  return { code: "TOOL_FAILED", message: error instanceof Error ? error.message : "工具执行失败" }
}

type Operation = ReturnType<typeof toolError>
type Failure = { tool: string; title: string; error: Operation }
type Edit = (input: ReturnType<typeof proseSchema.parse>) => AsyncGenerator<AiStreamEvent, Fields>

export async function* runTools(input: {
  run: AgentRun; request: AgentRequest; prior?: AgentRun; workspace: Workspace; complete: Complete;
  messages: AiMessage[]; budget: number; checkpoint: () => void; edit: Edit; organize: (id: string) => AsyncGenerator<AiStreamEvent, Fields>;
  signal?: AbortSignal
}): AsyncGenerator<AiStreamEvent> {
  const { run, request, prior, workspace, complete, messages, budget, checkpoint, edit, organize, signal } = input
  const initial = messages.length
  const failures = new Map<string, Failure>()
  const attempts = new Map<string, number>()
  let callsMade = 0
  let outputRetry = false

  const failure = (key: string, tool: string, title: string, error: Operation) => {
    failures.set(key, { tool, title, error })
    attempts.set(key, (attempts.get(key) ?? 0) + 1)
    return { ok: false as const, error, retryable: error.code !== "CONFLICT" && attempts.get(key)! < 3 }
  }
  const recovered = (key: string) => {
    failures.delete(key)
    attempts.delete(key)
  }
  const assertReason = (reason: string) => {
    if (!reason.trim() || !request.message.includes(reason)) {
      throw new ApiError("改动原因须逐字引用本轮作者指令，请核对后重试", 400)
    }
  }
  const titleOf = (item: unknown) => {
    if (!item || typeof item !== "object") return ""
    const { fields, id } = item as Fields
    const value = fields && typeof fields === "object" ? fields as Fields : {}
    return String(value.name ?? value.title ?? id ?? "")
  }

  async function* execute(call: NativeToolCall, step: AgentStep): AsyncGenerator<AiStreamEvent, Fields> {
    let key = `${call.name}:arguments`
    let title = ""
    try {
      const raw: unknown = JSON.parse(call.input)
      if (call.name === "search") {
        const args = searchSchema.parse(raw)
        const result = workspace.search(args)
        if ("items" in result && result.items && args.kind) {
          step.targets = result.items.slice(0, 6).map(row => ({ kind: args.kind!, id: row.id, title: row.title }))
          step.detail = args.query ? "{kind} · 搜索「{query}」 · {count} 项目录结果" : "{kind} · {count} 项目录结果"
          step.detailValues = { kind: ENTITY_LABEL[args.kind], query: args.query ?? "", count: result.total }
        } else step.detail = "已查看作品信息与资料目录，尚未读取各卡片正文。"
        return { ok: true, ...result }
      }
      if (call.name === "read") {
        const args = readSchema.parse(raw)
        const result = workspace.readPage(args)
        const kind = args.kind === "archive" ? "chapter" : args.kind
        if (result.missing) step.detail = "未找到此资料"
        else {
          step.targets = [{ kind, id: String(result.chapterId ?? args.id), title: String(result.title ?? result.name ?? ENTITY_LABEL[kind]) }]
          if (args.kind === "chapter" && result.contentTotal) {
            const start = Number(result.contentOffset)
            const total = Number(result.contentTotal)
            step.detail = result.truncated ? "正文 {start}–{end} / {total} 字符，后续尚未读取" : "正文 {start}–{end} / {total} 字符"
            step.detailValues = { start: start + 1, end: start + String(result.content).length, total }
          }
          if (args.kind === "archive") step.detail = "已读取该章故事档案"
        }
        return result
      }
      if (call.name === "write") {
        const args = writeSchema.parse(raw)
        assertReason(args.reason)
        recovered(key)
        const items = args.items.map((value, index) => {
          const itemTitle = titleOf(value)
          const { kind, id } = (value && typeof value === "object" ? value : {}) as Fields
          const targetId = id ?? (kind === "blueprint" ? run.chapterId : kind === "outline" ? run.novelId : undefined)
          const itemKey = `write:${String(kind ?? "")}:${String(targetId ?? itemTitle).normalize("NFKC").trim().toLowerCase() || index + 1}`
          try {
            if ((attempts.get(itemKey) ?? 0) >= 3) throw new Error("此项已多次失败，请核对后再继续")
            const item = itemSchema.parse(value)
            const change = stageFields(item, args.reason, run, workspace, prior)
            step.targets ??= []
            if (!step.targets.some(entry => entry.changeId === change.id)) step.targets.push(target(change))
            recovered(itemKey)
            const { changeId, changedFields, possiblyRemoved } = proposalReceipt(change)
            return { index: index + 1, kind: item.kind, title: change.title, ok: true as const, changeId, changedFields, evidence: change.evidence?.map(({ field, sourceId }) => ({ field, sourceId })),
              ...(possiblyRemoved.length ? { possiblyRemoved: possiblyRemoved.slice(0, 3) } : {}) }
          } catch (error) {
            return { index: index + 1, kind, title: itemTitle,
              ...failure(itemKey, call.name, itemTitle, toolError(error)) }
          }
        })
        const failed = items.filter(item => !item.ok)
        const accepted = items.length - failed.length
        if (failed.length) {
          step.status = accepted ? "partial" : "error"
          step.detail = "{accepted} 项候选已准备，{failed} 项未完成"
          step.detailValues = { accepted, failed: failed.length }
          step.issues = failed.map(item => ({ title: item.title, message: item.error.message, fields: item.error.fields }))
        } else step.detail = "候选已准备，等待确认"
        return { ok: failed.length === 0, accepted, items, hint: "Retry only failed items after correcting their arguments. Candidates require author review." }
      }
      if (call.name === "delete") {
        const args = deleteSchema.parse(raw)
        key = `delete:${args.kind}:${args.id}`
        assertReason(args.reason)
        workspace.permitted(args.kind, args.id)
        const row = workspace.observed.get(`${args.kind}:${args.id}`)
        if (!row || workspace.candidate(args.kind, args.id)) throw new Error("删除前请先读取目标对象")
        title = String(row.title ?? row.name ?? "")
        const change = proposeDelete(run, args.kind, args.id, args.reason,
          { chapterIndex: workspace.chapterIndex, explicitlyReferenced: workspace.mentioned(args.kind, args.id) })
        step.targets = [target(change)]
        step.detail = "候选已准备，等待确认"
        recovered(key)
        recovered("delete:arguments")
        return { ok: true, changeId: change.id, title: change.title, state: "pending" }
      }
      if (call.name === "edit_prose") {
        const args = proseSchema.parse(raw)
        const requestedTitle = args.mode === "rewrite" ? args.title : undefined
        key = `edit_prose:${args.id ?? requestedTitle ?? run.chapterId ?? ""}`
        assertReason(args.reason)
        if ((attempts.get(key) ?? 0) >= 3) throw new Error("此项已多次失败，请核对后再继续")
        title = requestedTitle ?? String(args.id && workspace.observed.get(`chapter:${args.id}`)?.title || "")
        const result = yield* edit(args)
        const change = run.changes.find(change => change.id === result.changeId)!
        step.targets = [target(change)]
        step.detail = "候选已准备，等待确认"
        recovered(key)
        recovered("edit_prose:arguments")
        recovered(`edit_prose:${change.id}`)
        if (change.targetId) recovered(`edit_prose:${change.targetId}`)
        recovered(`edit_prose:${change.title}`)
        if (typeof result.minimumWords === "number" && Number(result.generatedWords) < result.minimumWords) {
          const message = "候选字数低于最低要求。请使用同一模式和候选 ID 继续修订。"
          failures.set(`edit_prose:${change.id}`, { tool: call.name, title: change.title, error: { code: "BELOW_TARGET", message } })
          result.notice = message
          result.retry = { mode: args.mode, id: change.id, words: result.targetWords, minimumWords: result.minimumWords }
        }
        if (!args.organizeNotes) return { ok: true, ...result }
        const notes = yield* organize(change.id)
        if (notes.ok === false) {
          failures.set(`notes:${change.id}`, { tool: "organize_materials", title: change.title, error: { code: "NOTES_INCOMPLETE", message: String(notes.error) } })
          step.status = "partial"
        } else recovered(`notes:${change.id}`)
        return { ok: notes.ok, ...result, notes }
      }
      throw new ApiError("工具不存在，请使用本轮提供的工具", 400)
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error
      const issue = toolError(error)
      step.status = "error"
      step.detail = issue.message
      if (issue.fields?.length) step.issues = [{ title, message: issue.message, fields: issue.fields }]
      return writingTools.has(call.name) ? failure(key, call.name, title, issue) : { ok: false, error: issue }
    }
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    signal?.throwIfAborted()
    const outstanding: AiMessage[] = failures.size ? [{
      role: "user", content: JSON.stringify({ unresolvedTools: [...failures.values()].slice(0, 20) }),
    }] : []
    if (budget > 0) {
      const overhead = outstanding.reduce((sum, message) => sum + messageTokens(message), toolTokens)
      while (messages.reduce((sum, message) => sum + messageTokens(message), overhead) > budget) {
        // Remove an old tool exchange as a unit. Keep its reads near the most recent turn.
        const next = messages.findIndex((message, index) => index > initial && message.role === "assistant")
        if (next < 0) throw new Error("任务材料超过上下文预算，请提高预算或缩小任务范围")
        messages.splice(initial, next - initial)
      }
    }
    let text = ""
    let reasoning = ""
    let calls: NativeToolCall[] = []
    try {
      for await (const chunk of streamThoughts(run, complete([...messages, ...outstanding], { tools: true }))) {
        if (chunk.type === "agent-thinking") yield chunk
        if (chunk.type === "delta") {
          text += chunk.text
          yield chunk
        }
        if (chunk.type === "reasoning") reasoning += chunk.text
        if (chunk.type === "tool-calls") calls = chunk.calls
      }
    } catch (error) {
      if (signal?.aborted || outputRetry || (!isInvalidToolInputError(error) && !isOutputLimitError(error))) throw error
      outputRetry = true
      messages.push({ role: "user", content: "上次模型输出被截断或工具参数不是有效 JSON，未执行那批调用。请分成较小的调用重试，每次先提交一至五项。" })
      continue
    }
    outputRetry = false
    const reply = text.trim()
    if (!calls.length) {
      const pending = run.changes.some(change => change.state === "pending")
      if (!reply && !pending && !failures.size) throw new Error("模型没有给出下一步操作")
      if (failures.size && !pending && !reply) run.summary = "本轮未生成可审阅的改动。可在执行记录里查看原因。"
      if (reply || pending) run.summary = reply
      run.incomplete = failures.size ? failures.size : undefined
      run.answering = Boolean(reply)
      checkpoint()
      yield { type: "agent", run }
      return
    }

    if (callsMade + calls.length > MAX_CALLS) break
    messages.push({ role: "assistant", content: text, toolCalls: calls, ...(reasoning ? { reasoning_content: reasoning } : {}) })
    if (reply && run.progress?.at(-1)?.text !== reply) {
      run.progress ??= []
      run.progress.push({ id: uid("progress"), text: reply, stepIndex: run.steps.length })
    }
    for (const call of calls) {
      signal?.throwIfAborted()
      callsMade++
      const step: AgentStep = { id: uid("step"), tool: call.name, label: labels[call.name] ?? call.name, detail: "", status: "running" }
      run.steps.push(step)
      checkpoint()
      yield { type: "agent", run }
      let result = yield* execute(call, step)
      if (step.status === "running") step.status = "complete"
      if (result.ok !== false && !writingTools.has(call.name) && JSON.stringify(result).length > TOOL_RECEIPT_LIMIT + 3000) {
        result = { ok: false, error: { code: "RESULT_TOO_LARGE", message: "目录结果过长，请减少 limit 或缩小检索范围。" } }
        step.status = "error"
        step.detail = "目录结果过长，请减少 limit 或缩小检索范围。"
      }
      checkpoint()
      yield { type: "agent", run }
      messages.push({ role: "tool", toolCallId: call.id, toolError: step.status === "error", content: JSON.stringify(result) })
    }
  }

  run.incomplete = Math.max(1, failures.size)
  run.summary = "本轮已达到处理步数上限。"
}
