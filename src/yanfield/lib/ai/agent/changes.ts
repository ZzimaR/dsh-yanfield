import { z } from "zod"
import * as repo from "@/lib/repo"
import { extractJson } from "@/lib/ai/prompts"
import { stripHtml, uid } from "@/lib/ui/cn"
import { materialResultSchema, MATERIAL_PROMPT, prepareMaterial, type ExistingMaterial, type MaterialSource } from "./materials"
import { propose, supersedeRun, validateLinks } from "./store"
import { sameFields } from "./schema"
import { cardKinds, itemSchema } from "./tools"
import type { AiMessage } from "@/lib/ai/provider"
import type { Complete } from "./complete"
import { messageTokens } from "./complete"
import type { AgentChange, AgentRequest, AgentRun, Fields } from "./types"
import type { Workspace } from "./workspace"

const normalize = (name: string) => name.normalize("NFKC").trim().toLowerCase()
const titleOf = (fields: Fields) => String(fields.name ?? fields.title ?? "")

export function stageFields(input: z.infer<typeof itemSchema>, reason: string, run: AgentRun, workspace: Workspace, prior?: AgentRun) {
  const { kind, id, fields } = input
  const key = `${kind}:${id}`
  workspace.permitted(kind, id)
  const draft = id ? workspace.candidate(kind, id) : undefined
  const fromPrior = draft && prior?.changes.includes(draft)
  const actualId = draft ? draft.targetId : id ?? null
  const isCard = kind === "character" || kind === "location" || kind === "world" || kind === "foreshadow"
  if (id && !workspace.observed.has(key)) throw new Error("修改前请先读取目标对象")
  if (draft?.op === "delete") throw new Error("这张资料已有待确认的删除；如需改为修改，请先丢弃删除候选")
  if (draft?.evidence?.some(evidence => evidence.candidate) && fromPrior) {
    throw new Error("这条资料依赖尚未确认的正文，请先审阅该正文")
  }
  if (kind === "blueprint" && input.sourceChapterId) {
    const source = workspace.observed.get(`chapter:${input.sourceChapterId}`)
    if (!source || (workspace.chapterPages.get(input.sourceChapterId) ?? 0) < String(source.content ?? "").length) {
      throw new Error("请按 nextOffset 读完当前章正文，再生成章纲")
    }
    if (!stripHtml(String(source.content ?? ""))) throw new Error("当前章节还没有可用于整理章纲的正文")
  }
  validateLinks(kind, fields, run.novelId, actualId)
  const cited = "evidence" in input ? input.evidence?.map(citation => {
    const source = workspace.observed.get(`chapter:${citation.sourceId}`)
    if (!source || !Object.hasOwn(fields, citation.field) || !stripHtml(String(source.content ?? "")).includes(citation.quote)) {
      throw new Error("引用必须来自已读取正文，并支持本次更新的字段")
    }
    const candidate = workspace.candidate("chapter", citation.sourceId)
    if (candidate && !run.changes.includes(candidate)) throw new Error("这条资料依赖尚未确认的正文，请先审阅该正文")
    return { ...citation, title: String(source.title ?? ""), candidate: Boolean(candidate) }
  }) : undefined
  const name = titleOf(fields)
  if (isCard && name && (workspace.cards(kind).some(row => row.id !== actualId && normalize("name" in row ? row.name : row.title) === normalize(name)) ||
      run.changes.some(change => change !== draft && change.state === "pending" && change.kind === kind && change.targetId !== actualId && normalize(change.title) === normalize(name)))) {
    throw new Error("已存在同名资料，请先用 search 确认对象")
  }
  if (isCard && !id && run.changes.some(change => change.kind === kind && !change.targetId && change.state === "pending" && normalize(change.title) === normalize(name))) {
    const same = run.changes.find(change => change.kind === kind && !change.targetId && change.state === "pending" && normalize(change.title) === normalize(name))!
    if (sameFields(same.after, fields)) return same
    throw new Error("已有同名待审阅候选，请读取候选后使用其 ID 修改")
  }
  const inherited = fromPrior && draft ? { ...structuredClone(draft), id: uid("change") } : undefined
  if (inherited) run.changes.push(inherited)
  try {
    const change = propose(run, kind, actualId, fields, reason, draft?.title ?? (name || undefined), {
      chapterIndex: workspace.chapterIndex, explicitlyReferenced: Boolean(id && workspace.mentioned(kind, id)),
    }, false)
    if (id && !draft) change.before = workspace.observed.get(key) ?? null
    if (!change.title && actualId) change.title = workspace.outlineTitle(kind, actualId)
    if (name) change.title = name
    if (cited) change.evidence = [
      ...(change.evidence ?? []).filter(item => !cited.some(citation => citation.field === item.field)),
      ...cited.filter(item => Object.hasOwn(change.after, item.field)),
    ]
    if (fromPrior && prior && draft) supersedeRun(run, prior, [draft.id])
    return change
  } catch (error) {
    if (inherited) run.changes = run.changes.filter(change => change.id !== inherited.id)
    throw error
  }
}

/** The evidence pass fills empty fields and keeps a verifiable link to the source text. */
export async function organizeNotes(run: AgentRun, workspace: Workspace, request: AgentRequest, complete: Complete,
  budget: number, changeIds: Set<string>, signal?: AbortSignal) {
  const sources: MaterialSource[] = run.changes.filter(change => changeIds.has(change.id) && change.state === "pending")
    .map(change => ({ id: change.id, title: change.title, text: stripHtml(String(change.after.content)), candidate: true }))
  const allowedKinds = cardKinds.filter(kind => {
    try { workspace.permitted(kind); return true } catch { return false }
  })
  if (!sources.length || !allowedKinds.length) throw new Error("没有可用于整理的正文或已启用的资料类型")
  const existing: ExistingMaterial[] = allowedKinds.flatMap(kind => workspace.cards(kind).map(row => ({
    kind, id: row.id, fields: { ...row },
  })))
  for (const change of run.changes) {
    const kind = allowedKinds.find(kind => kind === change.kind)
    if (!kind || change.state !== "pending") continue
    const row = existing.find(row => row.kind === kind && change.targetId && row.id === change.targetId)
    if (row) row.fields = { ...row.fields, ...change.after }
    else existing.push({ kind, id: null, fields: { ...change.before, ...change.after } })
  }
  const input: AiMessage[] = [
    { role: "system", content: MATERIAL_PROMPT },
    { role: "user", content: JSON.stringify({ authorRequest: request.message, sources, existing, allowedKinds }) },
  ]
  if (budget > 0 && input.reduce((sum, message) => sum + messageTokens(message), 0) > budget) {
    throw new Error("资料整理材料超过预算，本轮正文已保留，可引用单章继续整理")
  }
  let parsed: z.infer<typeof materialResultSchema> | undefined
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    let raw = ""
    for await (const chunk of complete(input, { structured: true })) if (chunk.type === "delta") raw += chunk.text
    const result = materialResultSchema.safeParse(extractJson(raw))
    if (result.success) parsed = result.data
    else input.push({ role: "user", content: "请按 cards、kind、fields、evidence 格式返回 JSON，每条证据必须含 field、sourceId、quote。" })
  }
  if (!parsed) throw new Error("资料整理未返回有效结构，正文候选已保留")
  signal?.throwIfAborted()
  const changes: AgentChange[] = []
  let skipped = 0
  for (const item of parsed.cards) {
    try {
      workspace.permitted(item.kind)
      const prepared = prepareMaterial(item, sources, existing)
      if (!Object.keys(prepared.fields).length) continue
      if (run.changes.some(change => change.kind === prepared.kind && change.state === "pending" &&
        (prepared.targetId ? change.targetId === prepared.targetId : change.title === prepared.title) && !changes.includes(change))) continue
      validateLinks(prepared.kind, prepared.fields, run.novelId, prepared.targetId)
      const change = propose(run, prepared.kind, prepared.targetId, prepared.fields, "依据正文整理，仅补充有依据的资料", prepared.title,
        { chapterIndex: workspace.chapterIndex, explicitlyReferenced: false }, false)
      change.evidence = [...(change.evidence ?? []), ...prepared.evidence]
      const row = existing.find(row => row.kind === prepared.kind && (prepared.targetId ? row.id === prepared.targetId : titleOf(row.fields) === prepared.title))
      if (row) row.fields = { ...row.fields, ...prepared.fields }
      else existing.push({ kind: prepared.kind, id: null, fields: prepared.fields })
      if (!changes.includes(change)) changes.push(change)
    } catch { skipped++ }
  }
  return { changes, skipped }
}
