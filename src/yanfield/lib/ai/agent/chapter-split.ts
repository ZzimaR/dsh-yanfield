import type { z } from "zod"
import { ApiError } from "@/lib/api-utils"
import { splitBlocks } from "@/lib/diff/blocks"
import * as repo from "@/lib/repo"
import type { Chapter } from "@/lib/types"
import { countWords, uid } from "@/lib/ui/cn"
import { assertChapterTitle, chapterDependencies, chapterPositions, hasChapterConflict, readSavedChapter, reindexChapters } from "./chapter-directory"
import { sameFields } from "./schema"
import type { splitChapterSchema } from "./tools"
import type { AgentChange, AgentRun, Fields } from "./types"

function splitVolumes(source: Chapter, existing?: Chapter) {
  return new Set([source.volumeId, existing ? existing.volumeId : source.volumeId])
}

function includesTail(content: string, tail: ReturnType<typeof splitBlocks>): boolean {
  // A previously saved split may contain extra prose or omit empty editor paragraphs.
  // Compare the other blocks verbatim so inline formatting and embedded content survive.
  const required = tail.map(block => block.html.trim()).filter(html => !/^<p>\s*(?:<br\s*\/?>\s*)?<\/p>$/i.test(html))
  if (!required.length) return false
  let next = 0
  for (const block of splitBlocks(content)) {
    if (block.html.trim() === required[next]) next++
    if (next === required.length) return true
  }
  return false
}

export function stageChapterSplit(
  run: AgentRun,
  input: z.infer<typeof splitChapterSchema>,
  observed: ReadonlyMap<string, Fields | null>,
): AgentChange {
  const source = readSavedChapter(run, input.id, observed)
  const existing = input.destination.kind === "existing" ? readSavedChapter(run, input.destination.id, observed) : undefined
  if (existing?.id === source.id) throw new ApiError("拆章需要指定同一作品中的不同章节", 400)
  const volumes = splitVolumes(source, existing)
  if (hasChapterConflict(run, existing ? [source.id, existing.id] : [source.id], volumes)) {
    throw new ApiError("这些章节已有待审改动，请先处理后再继续", 409)
  }

  const blocks = splitBlocks(source.content)
  const matches = blocks.flatMap((block, index) =>
    block.text.trimStart().startsWith(input.anchor) && (input.block === undefined || input.block === index + 1) ? [index] : [],
  )
  if (matches.length !== 1 || matches[0] === 0) {
    throw new ApiError("拆章位置无法唯一确定，请引用新章首段的开头", 400)
  }
  const index = matches[0]
  let offset = 0
  for (const block of blocks.slice(0, index)) {
    offset = source.content.indexOf(block.html, offset) + block.html.length
  }
  const head = source.content.slice(0, offset)
  const tail = source.content.slice(offset)
  if (!blocks.slice(0, index).some(block => block.text.trim())) {
    throw new ApiError("拆章后两章都需要有正文", 400)
  }
  if (existing && !includesTail(existing.content, blocks.slice(index))) {
    throw new ApiError("已有章节未包含完整的待移正文，请核对后再拆章", 409)
  }
  const title = input.destination.kind === "new" ? input.destination.title : existing!.title
  if (!existing) assertChapterTitle(run.novelId, source.volumeId, title)
  const change: AgentChange = {
    id: uid("change"), kind: "chapter", targetId: source.id, title: source.title,
    reason: input.reason, before: { ...source }, after: { content: head }, state: "pending",
    chapterSplit: { title, content: tail, existing, orderBefore: chapterPositions(run.novelId, volumes) },
  }
  run.changes.push(change)
  return change
}

export function applyChapterSplit(run: AgentRun, change: AgentChange) {
  const split = change.chapterSplit!
  const source = repo.getChapter(change.targetId!)
  const existing = split.existing ? repo.getChapter(split.existing.id) : undefined
  if (source?.novelId !== run.novelId || (existing && existing.novelId !== run.novelId) ||
      !sameFields(source, change.before) || !sameFields(existing, split.existing)) {
    throw new ApiError("章节在拆章候选生成后发生变化，请重新准备候选", 409)
  }
  const volumes = splitVolumes(source, existing)
  if (!sameFields(chapterPositions(run.novelId, volumes), split.orderBefore)) {
    throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
  }
  if (!existing) assertChapterTitle(run.novelId, source.volumeId, split.title)
  else if (existing.volumeId !== source.volumeId) assertChapterTitle(run.novelId, source.volumeId, existing.title)
  const destination = existing ?? repo.createChapter(run.novelId, {
    title: split.title, volumeId: source.volumeId, content: split.content,
  })
  const siblings = split.orderBefore.filter(entry => entry.volumeId === source.volumeId && entry.id !== destination.id)
  siblings.splice(siblings.findIndex(entry => entry.id === source.id) + 1, 0, {
    id: destination.id, volumeId: source.volumeId, orderIndex: 0,
  })
  reindexChapters(run.novelId, siblings)
  if (existing && existing.volumeId !== source.volumeId) {
    const previousSiblings = split.orderBefore.filter(entry => entry.volumeId === existing.volumeId && entry.id !== existing.id)
    reindexChapters(run.novelId, previousSiblings)
  }
  const content = String(change.after.content)
  change.saved = { ...repo.updateChapter(source.id, { content, wordCount: countWords(content) }) }
  change.appliedId = source.id
  change.state = "applied"
  split.saved = repo.getChapter(destination.id)
  split.orderAfter = chapterPositions(run.novelId, volumes)
  repo.markArchivesStaleAfter(run.novelId, -1)
}

export function undoChapterSplit(run: AgentRun, change: AgentChange) {
  const split = change.chapterSplit!
  const source = repo.getChapter(change.targetId!)
  const destination = split.saved && repo.getChapter(split.saved.id)
  if (source?.novelId !== run.novelId || destination?.novelId !== run.novelId ||
      !sameFields(source, change.saved) || !sameFields(destination, split.saved) ||
      !sameFields(chapterPositions(run.novelId, splitVolumes(source, split.existing)), split.orderAfter)) {
    throw new ApiError("拆章后正文或目录已有修改，不能覆盖撤回", 409)
  }
  if (!split.existing) {
    if (chapterDependencies(destination.id).length) {
      throw new ApiError("新章已有后续关联资料，请先处理关联后再撤回", 409)
    }
    repo.deleteChapter(destination.id)
  }
  repo.setChapterPositions(run.novelId, split.orderBefore)
  const content = String(change.before!.content)
  repo.updateChapter(source.id, { content, wordCount: countWords(content) })
  repo.markArchivesStaleAfter(run.novelId, -1)
  change.state = "reverted"
}
