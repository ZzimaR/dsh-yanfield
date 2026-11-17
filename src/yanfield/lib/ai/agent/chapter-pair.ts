import { ApiError } from "@/lib/api-utils"
import { splitBlocks } from "@/lib/diff/blocks"
import * as repo from "@/lib/repo"
import type { Chapter } from "@/lib/types"
import { countWords, uid } from "@/lib/ui/cn"
import type { z } from "zod"
import { assertChapterTitle, chapterDependencies, chapterPositions, hasChapterConflict, readSavedChapter, reindexChapters } from "./chapter-directory"
import { sameFields } from "./schema"
import type { mergeChaptersSchema, moveChapterBlocksSchema } from "./tools"
import type { AgentChange, AgentRun, ChapterPairAction, Fields } from "./types"

type Transfer = z.infer<typeof moveChapterBlocksSchema>
type Request = ({ kind: "merge" } & z.infer<typeof mergeChaptersSchema>) | ({ kind: "transfer" } & Transfer)

function locateBlock(blocks: ReturnType<typeof splitBlocks>, anchor: string): number {
  const matches = blocks.flatMap((block, index) => block.text.trimStart().startsWith(anchor) ? [index] : [])
  if (matches.length !== 1) throw new ApiError("段落位置无法唯一确定，请引用段首原文", 400)
  return matches[0]
}

function blockOffsets(content: string, blocks: ReturnType<typeof splitBlocks>): number[] {
  let cursor = 0
  return blocks.map(block => {
    const start = content.indexOf(block.html, cursor)
    cursor = start + block.html.length
    return start
  })
}

function moveBlocks(first: Chapter, second: Chapter, { range, insert }: Transfer) {
  const blocks = splitBlocks(first.content)
  const offsets = blockOffsets(first.content, blocks)
  let from: number
  let through: number
  if ("edge" in range) {
    if (range.count > blocks.length) throw new ApiError("源章节没有这么多段落", 400)
    from = range.edge === "start" ? 0 : blocks.length - range.count
    through = from + range.count - 1
  } else {
    from = locateBlock(blocks, range.from)
    through = range.through ? locateBlock(blocks, range.through) : from
    if (through < from) throw new ApiError("移动范围的结束段必须在起始段之后", 400)
  }
  const start = offsets[from]
  const end = offsets[through + 1] ?? first.content.length
  const moved = first.content.slice(start, end)

  let at: number
  if ("edge" in insert) {
    at = insert.edge === "start" ? 0 : second.content.length
  } else {
    const destinationBlocks = splitBlocks(second.content)
    const destinationOffsets = blockOffsets(second.content, destinationBlocks)
    const index = locateBlock(destinationBlocks, insert.anchor) + Number(insert.placement === "after")
    at = destinationOffsets[index] ?? second.content.length
  }
  return {
    moved,
    remaining: first.content.slice(0, start) + first.content.slice(end),
    nextContent: second.content.slice(0, at) + moved + second.content.slice(at),
  }
}

export function stageChapterPair(run: AgentRun, input: Request, observed: ReadonlyMap<string, Fields | null>): AgentChange {
  const first = readSavedChapter(run, input.id, observed)
  const second = readSavedChapter(run, input.secondId, observed)
  if (first.id === second.id) throw new ApiError("请选择两个不同的章节", 400)
  const volumes = new Set([first.volumeId, second.volumeId])
  if (hasChapterConflict(run, [first.id, second.id], input.kind === "merge" ? volumes : new Set())) {
    throw new ApiError("这些章节已有待审改动，请先处理后再继续", 409)
  }

  let pair: ChapterPairAction
  let after: Fields
  if (input.kind === "merge") {
    const orderBefore = chapterPositions(run.novelId, new Set([first.volumeId]))
    const index = orderBefore.findIndex(entry => entry.id === first.id)
    if (orderBefore[index + 1]?.id !== second.id) throw new ApiError("只能合并同一卷中按顺序相邻的两章", 400)
    if (input.title && input.title !== second.title) assertChapterTitle(run.novelId, first.volumeId, input.title, first.id)
    after = { content: first.content + second.content, ...(input.title && { title: input.title }) }
    pair = { kind: "merge", second, moved: second.content, blockers: chapterDependencies(second.id),
      firstLinks: chapterDependencies(first.id), orderBefore }
  } else {
    const { moved, remaining, nextContent } = moveBlocks(first, second, input)
    after = { content: remaining }
    pair = { kind: "transfer", second, moved, nextContent, firstLinks: [] }
  }

  const change: AgentChange = { id: uid("change"), kind: "chapter", targetId: first.id, title: first.title,
    reason: input.reason, before: { ...first }, after, state: "pending", chapterPair: pair }
  run.changes.push(change)
  return change
}

function writeContent(id: string, content: string, title?: string): Chapter {
  return repo.updateChapter(id, { content, wordCount: countWords(content), ...(title !== undefined && { title }) })
}

export function applyChapterPair(run: AgentRun, change: AgentChange) {
  const pair = change.chapterPair!
  const first = repo.getChapter(change.targetId!)
  const second = repo.getChapter(pair.second.id)
  if (first?.novelId !== run.novelId || second?.novelId !== run.novelId ||
      !sameFields(first, change.before) || !sameFields(second, pair.second)) {
    throw new ApiError("章节在候选生成后发生变化，请重新准备候选", 409)
  }
  const title = typeof change.after.title === "string" ? change.after.title : undefined
  if (pair.kind === "merge") {
    const volumes = new Set([first.volumeId])
    if (!sameFields(chapterPositions(run.novelId, volumes), pair.orderBefore)) {
      throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
    }
    if (chapterDependencies(second.id).length) throw new ApiError("后章仍有关联资料或会话，请先处理关联后再合并", 409)
    repo.deleteChapter(second.id)
    if (title) assertChapterTitle(run.novelId, first.volumeId, title, first.id)
    reindexChapters(run.novelId, pair.orderBefore.filter(entry => entry.id !== second.id))
    pair.orderAfter = chapterPositions(run.novelId, volumes)
  } else {
    pair.saved = writeContent(second.id, pair.nextContent)
  }
  change.saved = { ...writeContent(first.id, String(change.after.content), title) }
  change.appliedId = first.id
  change.state = "applied"
  repo.markArchivesStaleAfter(run.novelId, -1)
}

export function undoChapterPair(run: AgentRun, change: AgentChange) {
  const pair = change.chapterPair!
  const first = repo.getChapter(change.appliedId!)
  const second = repo.getChapter(pair.second.id)
  if (first?.novelId !== run.novelId || pair.second.novelId !== run.novelId || !sameFields(first, change.saved)) {
    throw new ApiError("章节或目录已有后续修改，不能覆盖撤回", 409)
  }
  if (pair.kind === "merge") {
    if (second || !sameFields(chapterPositions(run.novelId, new Set([first.volumeId])), pair.orderAfter)) {
      throw new ApiError("章节或目录已有后续修改，不能覆盖撤回", 409)
    }
    assertChapterTitle(run.novelId, first.volumeId, pair.second.title, first.id)
    repo.restoreChapter(pair.second)
    repo.setChapterPositions(run.novelId, pair.orderBefore)
  } else {
    if (!sameFields(second, pair.saved)) throw new ApiError("章节或目录已有后续修改，不能覆盖撤回", 409)
    writeContent(pair.second.id, pair.second.content)
  }
  writeContent(first.id, String(change.before!.content), String(change.before!.title))
  repo.markArchivesStaleAfter(run.novelId, -1)
  change.state = "reverted"
}
