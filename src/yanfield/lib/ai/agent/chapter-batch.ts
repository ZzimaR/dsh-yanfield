import { ApiError } from "@/lib/api-utils"
import { splitBlocks } from "@/lib/diff/blocks"
import * as repo from "@/lib/repo"
import { countWords, uid } from "@/lib/ui/cn"
import type { z } from "zod"
import { chapterPositions, hasChapterConflict, readSavedChapter } from "./chapter-directory"
import { editProse, escapeProse } from "./prose-edit"
import { sameFields } from "./schema"
import type { organizeChaptersSchema } from "./tools"
import { isChapterOperation, type AgentChange, type AgentRun, type ChapterBatchAction, type Fields } from "./types"

type Request = z.infer<typeof organizeChaptersSchema>

function findDuplicatedSuffix(content: string, counterpart: string) {
  const meaningful = (blocks: ReturnType<typeof splitBlocks>) => blocks.filter(block =>
    !/^<p>\s*(?:<br\s*\/?>\s*)?<\/p>$/i.test(block.html.trim()))
  const source = splitBlocks(content)
  const required = meaningful(source)
  const existing = meaningful(splitBlocks(counterpart))
  let index = required.length - 1
  for (let j = existing.length - 1; j >= 0 && index >= 0; j--) {
    if (existing[j].html.trim() === required[index].html.trim()) index--
  }
  const count = required.length - index - 1
  // A single shared line is not enough evidence of a duplicated tail. Keep at least one source block.
  if (count < 2 || index < 0) return null
  const lastKept = required[index]
  let offset = 0
  for (const block of source) {
    offset = content.indexOf(block.html, offset) + block.html.length
    if (block === lastKept) break
  }
  return { content: content.slice(0, offset), count }
}

export function suggestChapterTailRepair(novelId: string, id: string) {
  const source = repo.getChapter(id)
  if (source?.novelId !== novelId) return undefined
  const siblings = repo.listChapters(novelId, false).filter(chapter => chapter.volumeId === source.volumeId)
  const index = siblings.findIndex(chapter => chapter.id === id)
  const subsequent = siblings.slice(index + 1, index + 4)
  const matches = subsequent.flatMap(chapter => {
    const full = repo.getChapter(chapter.id)
    const suffix = full && findDuplicatedSuffix(source.content, full.content)
    return suffix ? [{ duplicateTailIn: chapter.id, title: chapter.title, paragraphs: suffix.count,
      removedText: source.content.slice(suffix.content.length) }] : []
  }).sort((a, b) => b.paragraphs - a.paragraphs)
  return matches[0] && matches[0].paragraphs !== matches[1]?.paragraphs ? matches[0] : undefined
}

export function stageChapterBatch(
  run: AgentRun, input: Request, observed: ReadonlyMap<string, Fields | null>, chapterPages: ReadonlyMap<string, number>,
): AgentChange {
  const ids = new Set([
    ...input.changes.flatMap(item => item.duplicateTailIn ? [item.id, item.duplicateTailIn] : [item.id]),
    ...input.moves.flatMap(item => [item.id, item.anchorId]),
  ])
  if (!ids.size) throw new ApiError("内容没有变化", 400)
  const chapters = new Map([...ids].map(id => {
    const chapter = observed.has(`chapter:${id}`) ? readSavedChapter(run, id, observed) : repo.getChapter(id)
    if (chapter?.novelId !== run.novelId) throw new ApiError("章节不属于该作品", 400)
    return [id, chapter] as const
  }))
  const first = chapters.values().next().value!
  const volumeId = first.volumeId
  if ([...chapters.values()].some(chapter => chapter.volumeId !== volumeId)) {
    throw new ApiError("每次批量整理只能处理同一卷的章节", 400)
  }
  const volumes = new Set([volumeId])
  const existing = run.changes.find(change => change.state === "pending" && change.chapterBatch?.volumeId === volumeId)
  const absorbed = run.changes.filter(change => change.kind === "chapter" && change.state === "pending" &&
    !change.op && !isChapterOperation(change) && change.targetId && ids.has(change.targetId) &&
    typeof change.after.content === "string" && Object.keys(change.after).length === 1 &&
    !run.changes.some(other => other.state === "pending" && (other.targetId === change.id ||
      other.evidence?.some(evidence => evidence.candidate && evidence.sourceId === change.id))))
  if (hasChapterConflict(run, [...ids], volumes, existing ? [existing, ...absorbed] : absorbed)) {
    throw new ApiError("这些章节已有待审改动，请先处理后再继续", 409)
  }
  if (new Set(input.changes.map(item => item.id)).size !== input.changes.length ||
      new Set(input.moves.map(item => item.id)).size !== input.moves.length) {
    throw new ApiError("改动重复", 400)
  }

  const previous = existing?.chapterBatch
  const orderBefore = chapterPositions(run.novelId, volumes)
  const titles = savedTitles(run, volumeId)
  if (previous && (!sameFields(orderBefore, previous.orderBefore) || !sameFields(titles, previous.titles))) {
    throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
  }
  const staged = new Map((previous?.entries ?? []).map(entry => [entry.before.id, structuredClone(entry)]))
  for (const draft of absorbed) {
    const before = chapters.get(draft.targetId!)!
    if (!sameFields(draft.before, before) || staged.has(before.id)) {
      throw new ApiError("章节在候选生成后发生变化，请重新准备候选", 409)
    }
    const content = String(draft.after.content)
    staged.set(before.id, { before, after: { content }, proseBase: content })
  }
  for (const item of input.changes) {
    const before = chapters.get(item.id)!
    const entry: ChapterBatchAction["entries"][number] = staged.get(item.id) ?? { before, after: {} }
    if (!sameFields(before, entry.before)) throw new ApiError("章节在候选生成后发生变化，请重新准备候选", 409)
    const after = entry.after
    const base = entry.proseBase ?? before.content
    if (item.title !== undefined) {
      if (item.title === before.title) delete after.title
      else after.title = item.title
    }
    if (item.summary !== undefined) {
      if (item.summary === before.summary) delete after.summary
      else {
        if (item.summary && (chapterPages.get(item.id) ?? 0) < (after.content ?? before.content).length) {
          throw new ApiError("填写章节摘要前请按 nextOffset 读完整章正文", 400)
        }
        after.summary = item.summary
      }
    }
    if (item.duplicateTailIn) {
      if (item.duplicateTailIn === item.id) throw new ApiError("请选择两个不同的章节", 400)
      const duplicateIn = chapters.get(item.duplicateTailIn)!
      const retainedCopy = staged.get(duplicateIn.id)?.after.content ?? duplicateIn.content
      const trimmed = findDuplicatedSuffix(base, retainedCopy)
      if (!trimmed) throw new ApiError("未找到可安全截去的重复章尾，请核对两章正文", 409)
      entry.duplicateIn = duplicateIn
      entry.removedBlocks = trimmed.count
      entry.removedText = base.slice(trimmed.content.length)
    }
    if (item.transition) {
      const { edge, text } = item.transition
      entry.transitions = { ...entry.transitions, [edge]: text }
    }
    if (item.duplicateTailIn || item.transition || item.inlineEdits) {
      const removed = entry.removedText ?? (entry.duplicateIn ? base.slice(after.content?.length) : "")
      let retained = base.slice(0, base.length - removed.length)
      if (item.inlineEdits) {
        retained = editProse(retained, item.inlineEdits)
        entry.proseBase = retained + removed
      }
      after.content = proseParagraph(entry.transitions?.start) + retained + proseParagraph(entry.transitions?.end)
    }
    if (Object.keys(after).length) staged.set(item.id, entry)
    else staged.delete(item.id)
  }

  const entries = [...staged.values()]
  const repairing = new Set(entries.filter(entry => entry.duplicateIn).map(entry => entry.before.id))
  if (entries.some(entry => entry.duplicateIn && repairing.has(entry.duplicateIn.id))) {
    throw new ApiError("保留重复段落的章节不能同时截尾", 409)
  }
  for (const entry of entries) {
    const counterpart = entry.duplicateIn && staged.get(entry.duplicateIn.id)
    if (counterpart?.after.content !== undefined &&
        (findDuplicatedSuffix(entry.proseBase ?? entry.before.content, counterpart.after.content)?.count ?? 0) < (entry.removedBlocks ?? 0)) {
      throw new ApiError("已有章节未包含完整的待移正文，请核对后再拆章", 409)
    }
  }

  const arranged = [...(previous?.orderAfter ?? orderBefore)]
  for (const move of input.moves) {
    if (move.id === move.anchorId) throw new ApiError("请选择另一章作为移动位置", 400)
    const [item] = arranged.splice(arranged.findIndex(entry => entry.id === move.id), 1)
    const index = arranged.findIndex(entry => entry.id === move.anchorId)
    arranged.splice(index + Number(move.placement === "after"), 0, item)
  }
  const changedOrder = arranged.some((entry, index) => entry.id !== orderBefore[index].id)
  const orderAfter = changedOrder ? arranged.map((entry, orderIndex) => ({ ...entry, orderIndex })) : orderBefore
  if (!changedOrder && !entries.length) throw new ApiError("内容没有变化", 400)

  const changedTitles = new Map(entries.filter(entry => entry.after.title !== undefined).map(entry => [entry.before.id, entry.after.title!]))
  assertTitles(titles, changedTitles)
  const chapterBatch = { volumeId, orderBefore, orderAfter, entries, titles }
  const change: AgentChange = existing ?? {
    id: uid("change"), kind: "chapter", targetId: first.id, title: first.title,
    before: { ...first }, after: {}, reason: input.reason, state: "pending",
  }
  change.chapterBatch = chapterBatch
  for (const draft of absorbed) draft.state = "rejected"
  const absorbedIds = new Set(absorbed.map(draft => draft.id))
  for (const step of run.steps) {
    for (const target of step.targets ?? []) {
      if (target.changeId && absorbedIds.has(target.changeId)) target.changeId = change.id
    }
  }
  if (!existing) run.changes.push(change)
  return change
}

function proseParagraph(text?: string): string {
  return text ? "<p>" + escapeProse(text.replace(/\s*\n\s*/g, " ")) + "</p>" : ""
}

function assertTitles(titles: Record<string, string>, replacements: Map<string, string>) {
  for (const [id, title] of replacements) {
    if (Object.entries(titles).some(([other, current]) => other !== id && (replacements.get(other) ?? current) === title)) {
      throw new ApiError("章节标题或序号已被占用", 409)
    }
  }
}

function savedTitles(run: AgentRun, volumeId: string | null) {
  return Object.fromEntries(repo.listChapters(run.novelId, false)
    .filter(chapter => chapter.volumeId === volumeId).map(chapter => [chapter.id, chapter.title]))
}

export function applyChapterBatch(run: AgentRun, change: AgentChange) {
  const batch = change.chapterBatch!
  if (!sameFields(chapterPositions(run.novelId, new Set([batch.volumeId])), batch.orderBefore) ||
      !sameFields(savedTitles(run, batch.volumeId), batch.titles)) {
    throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
  }
  for (const { before, duplicateIn } of batch.entries) {
    if (before.novelId !== run.novelId || !sameFields(repo.getChapter(before.id), before) ||
        (duplicateIn && !sameFields(repo.getChapter(duplicateIn.id), duplicateIn))) {
      throw new ApiError("章节在候选生成后发生变化，请重新准备候选", 409)
    }
  }
  if (!sameFields(batch.orderBefore, batch.orderAfter)) repo.setChapterPositions(run.novelId, batch.orderAfter)
  for (const entry of batch.entries) {
    entry.saved = repo.updateChapter(entry.before.id, entry.after.content === undefined
      ? entry.after : { ...entry.after, wordCount: countWords(entry.after.content) })
  }
  change.appliedId = change.targetId!
  change.state = "applied"
  repo.markArchivesStaleAfter(run.novelId, -1)
}

export function undoChapterBatch(run: AgentRun, change: AgentChange) {
  const batch = change.chapterBatch!
  const appliedTitles = { ...batch.titles, ...Object.fromEntries(batch.entries
    .filter(entry => entry.after.title !== undefined).map(entry => [entry.before.id, entry.after.title])) }
  if (!sameFields(chapterPositions(run.novelId, new Set([batch.volumeId])), batch.orderAfter) ||
      !sameFields(savedTitles(run, batch.volumeId), appliedTitles) ||
      batch.entries.some(entry => entry.before.novelId !== run.novelId || !sameFields(repo.getChapter(entry.before.id), entry.saved))) {
    throw new ApiError("章节或目录已有后续修改，不能覆盖撤回", 409)
  }
  if (!sameFields(batch.orderBefore, batch.orderAfter)) repo.setChapterPositions(run.novelId, batch.orderBefore)
  for (const { before, after } of batch.entries) {
    repo.updateChapter(before.id, {
      ...(after.content !== undefined && { content: before.content, wordCount: before.wordCount }),
      ...(after.title !== undefined && { title: before.title }),
      ...(after.summary !== undefined && { summary: before.summary }),
    })
  }
  repo.markArchivesStaleAfter(run.novelId, -1)
  change.state = "reverted"
}
