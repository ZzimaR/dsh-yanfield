import { ApiError } from "@/lib/api-utils"
import { get } from "@/lib/db"
import * as repo from "@/lib/repo"
import type { Chapter } from "@/lib/types"
import { uid } from "@/lib/ui/cn"
import { sameFields } from "./schema"
import type { AgentChange, AgentRun, ChapterDirectoryAction, ChapterPosition, Fields } from "./types"

type DirectoryRequest = { id: string; reason: string } & (
  | { kind: "move"; anchorId: string; placement: "before" | "after"; title?: string }
  | { kind: "rename"; title: string }
  | { kind: "delete" }
)

export function chapterPositions(novelId: string, volumes: Set<string | null>): ChapterPosition[] {
  return repo.listChapters(novelId, false)
    .filter(chapter => volumes.has(chapter.volumeId))
    .map(({ id, volumeId, orderIndex }) => ({ id, volumeId, orderIndex }))
}

export function assertChapterTitle(novelId: string, volumeId: string | null, title: string, exceptId?: string) {
  if (repo.listChapters(novelId, false).some(chapter => chapter.id !== exceptId && chapter.volumeId === volumeId && chapter.title === title)) {
    throw new ApiError("章节标题或序号已被占用", 409)
  }
}

export function chapterDependencies(id: string): string[] {
  const labels: string[] = []
  if (get("SELECT id FROM chapter_blueprints WHERE chapter_id = ?", [id])) labels.push("章纲")
  if (repo.getArchiveByChapter(id)) labels.push("故事档案")
  if (get("SELECT id FROM foreshadows WHERE planted_chapter_id = ? OR payoff_chapter_id = ?", [id, id])) labels.push("伏笔")
  if (get("SELECT id FROM chat_sessions WHERE chapter_id = ?", [id])) labels.push("会话")
  return labels
}

export function reindexChapters(novelId: string, positions: ChapterPosition[]) {
  repo.setChapterPositions(novelId, positions.map((entry, orderIndex) => ({ ...entry, orderIndex })))
}

export function hasChapterConflict(run: AgentRun, ids: readonly string[], volumes: Set<string | null>) {
  return run.changes.some(change => {
    if (change.state !== "pending" || change.kind !== "chapter") return false
    const action = change.chapterDirectory
    const order = change.chapterSplit?.orderBefore ?? (change.chapterPair?.kind === "merge" ? change.chapterPair.orderBefore : undefined)
      ?? (action && "orderBefore" in action ? action.orderBefore : [])
    const linkedId = change.chapterSplit?.existing?.id ?? change.chapterPair?.second.id ?? (action?.kind === "move" ? action.anchorId : undefined)
    return (change.targetId !== null && ids.includes(change.targetId)) ||
      (linkedId !== undefined && ids.includes(linkedId)) ||
      order.some(entry => volumes.has(entry.volumeId))
  })
}

export function readSavedChapter(run: AgentRun, id: string, observed: ReadonlyMap<string, Fields | null>): Chapter {
  const chapter = repo.getChapter(id)
  if (chapter?.novelId !== run.novelId) throw new ApiError("章节不属于该作品", 400)
  if (!sameFields(chapter, observed.get(`chapter:${id}`))) throw new ApiError("请先读取最新保存的章节", 409)
  return chapter
}

export function stageChapterDirectoryAction(
  run: AgentRun, input: DirectoryRequest, observed: ReadonlyMap<string, Fields | null>,
): AgentChange {
  const source = readSavedChapter(run, input.id, observed)
  const anchor = input.kind === "move" ? readSavedChapter(run, input.anchorId, observed) : undefined
  if (anchor?.id === source.id) throw new ApiError("请选择另一章作为移动位置", 400)
  const volumes = new Set([source.volumeId])
  if (anchor) volumes.add(anchor.volumeId)
  const involvedIds = anchor ? [source.id, anchor.id] : [source.id]
  if (hasChapterConflict(run, involvedIds, input.kind === "rename" ? new Set() : volumes)) {
    throw new ApiError("这些章节已有待审改动，请先处理后再继续", 409)
  }

  const title = "title" in input ? input.title : undefined
  if (title) assertChapterTitle(run.novelId, anchor ? anchor.volumeId : source.volumeId, title, source.id)
  if (input.kind === "rename" && title === source.title) throw new ApiError("内容没有变化", 400)
  let action: ChapterDirectoryAction = { kind: "rename" }
  if (input.kind === "move" && anchor) {
    assertChapterTitle(run.novelId, anchor.volumeId, title ?? source.title, source.id)
    const orderBefore = chapterPositions(run.novelId, volumes)
    const siblings = orderBefore.filter(entry => entry.volumeId === source.volumeId)
    const offset = input.placement === "after" ? 1 : -1
    if (source.volumeId === anchor.volumeId &&
      siblings.findIndex(entry => entry.id === source.id) === siblings.findIndex(entry => entry.id === anchor.id) + offset &&
      (!title || title === source.title)) throw new ApiError("内容没有变化", 400)
    action = { kind: "move", anchorId: anchor.id, anchorTitle: anchor.title, volumeId: anchor.volumeId, placement: input.placement, orderBefore }
  } else if (input.kind === "delete") {
    action = { kind: "delete", orderBefore: chapterPositions(run.novelId, volumes), blockers: chapterDependencies(source.id) }
  }

  const change: AgentChange = {
    id: uid("change"), kind: "chapter", targetId: source.id, title: source.title, reason: input.reason,
    before: { ...source }, after: title ? { title } : {}, state: "pending", chapterDirectory: action,
    ...(input.kind === "delete" ? { op: "delete" } : {}),
  }
  run.changes.push(change)
  return change
}

function actionVolumes(action: Exclude<ChapterDirectoryAction, { kind: "rename" }>) {
  return new Set(action.orderBefore.map(entry => entry.volumeId))
}

export function applyChapterDirectoryAction(run: AgentRun, change: AgentChange) {
  const action = change.chapterDirectory!
  const source = repo.getChapter(change.targetId!)
  if (source?.novelId !== run.novelId || !sameFields(source, change.before)) {
    throw new ApiError("章节在候选生成后发生变化，请重新准备候选", 409)
  }
  if (action.kind !== "rename" &&
      !sameFields(chapterPositions(run.novelId, actionVolumes(action)), action.orderBefore)) {
    throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
  }

  const title = typeof change.after.title === "string" ? change.after.title : source.title
  if (action.kind === "delete") {
    if (chapterDependencies(source.id).length) throw new ApiError("章节仍有关联资料或会话，请先处理关联后再删除", 409)
    repo.deleteChapter(source.id)
    reindexChapters(run.novelId, action.orderBefore.filter(entry => entry.id !== source.id))
  } else {
    assertChapterTitle(run.novelId, action.kind === "move" ? action.volumeId : source.volumeId, title, source.id)
    if (action.kind === "move") {
      if (repo.getChapter(action.anchorId)?.title !== action.anchorTitle) {
        throw new ApiError("目录在候选生成后发生变化，请重新准备候选", 409)
      }
      const siblings = action.orderBefore.filter(entry => entry.volumeId === action.volumeId && entry.id !== source.id)
      const index = siblings.findIndex(entry => entry.id === action.anchorId)
      siblings.splice(index + Number(action.placement === "after"), 0, { id: source.id, volumeId: action.volumeId, orderIndex: 0 })
      reindexChapters(run.novelId, siblings)
      if (source.volumeId !== action.volumeId) {
        reindexChapters(run.novelId, action.orderBefore.filter(entry => entry.volumeId === source.volumeId && entry.id !== source.id))
      }
    }
    if (title !== source.title) repo.updateChapter(source.id, { title })
  }
  const saved = repo.getChapter(source.id)
  if (saved) change.saved = { ...saved }
  if (action.kind !== "rename") {
    action.orderAfter = chapterPositions(run.novelId, actionVolumes(action))
    repo.markArchivesStaleAfter(run.novelId, -1)
  } else {
    repo.markArchiveStale(source.id)
  }
  change.appliedId = source.id
  change.state = "applied"
}

export function undoChapterDirectoryAction(run: AgentRun, change: AgentChange) {
  const action = change.chapterDirectory!
  const before = change.before as unknown as Chapter
  const current = repo.getChapter(change.appliedId!)
  if (before.novelId !== run.novelId || (current && current.novelId !== run.novelId) || !sameFields(current, change.saved) ||
      (action.kind !== "rename" && !sameFields(chapterPositions(run.novelId, actionVolumes(action)), action.orderAfter))) {
    throw new ApiError("章节或目录已有后续修改，不能覆盖撤回", 409)
  }
  if (before.volumeId !== null && repo.getVolume(before.volumeId)?.novelId !== run.novelId) {
    throw new ApiError("所属卷无效", 409)
  }
  assertChapterTitle(run.novelId, before.volumeId, before.title, before.id)
  if (action.kind === "delete") repo.restoreChapter(before)
  if (action.kind !== "rename") {
    repo.setChapterPositions(run.novelId, action.orderBefore)
    repo.markArchivesStaleAfter(run.novelId, -1)
  }
  if (current && current.title !== before.title) {
    repo.updateChapter(before.id, { title: before.title })
    repo.markArchiveStale(before.id)
  }
  change.state = "reverted"
}
