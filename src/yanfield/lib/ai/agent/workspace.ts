import * as repo from "@/lib/repo"
import { flattenChapters, isAiVisibleAtChapter } from "@/lib/ai/context"
import { candidateContext } from "./context"
import { chapterReadPage, TOOL_RECEIPT_LIMIT } from "./read-page"
import { patchSchemas } from "./schema"
import { visibleEntity } from "./store"
import { ENTITY_LABEL, type AgentRequest, type AgentRun, type EntityKind, type Fields } from "./types"
import type { ContextConfig, Novel } from "@/lib/types"
import type { z } from "zod"
import type { readSchema, searchSchema } from "./tools"

export function openWorkspace(novel: Novel, request: AgentRequest, config: ContextConfig, run: AgentRun, prior?: AgentRun) {
  const chapters = flattenChapters(novel.id, false)
  const chapterIndex = chapters.find(entry => entry.chapter.id === run.chapterId)?.index ?? null
  const observed = new Map<string, Fields | null>()
  const materials = new Map<string, unknown>()
  const chapterPages = new Map<string, number>()
  const visibleKinds: Partial<Record<EntityKind, boolean>> = {
    character: config.includeCharacters, world: config.includeWorld, location: config.includeWorld,
    foreshadow: config.includeForeshadows, outline: config.includeNovelOutline,
    "volume-outline": config.includeVolumeOutline, blueprint: config.includeChapterBlueprint,
  }
  const mentioned = (kind: string, id: string) => request.mentions?.some(mention => mention.type === kind && mention.id === id) ?? false
  function permitted(kind: EntityKind, id?: string) {
    if (visibleKinds[kind] === false && !(id && mentioned(kind, id))) {
      throw new Error("该类资料已在上下文设置中关闭，请开启或明确引用后再读")
    }
  }
  function candidate(kind: EntityKind, id: string) {
    return run.changes.find(change => change.id === id && change.kind === kind && change.state === "pending")
      ?? prior?.changes.find(change => change.id === id && change.kind === kind && change.state === "pending")
  }
  function read(kind: EntityKind, id: string): Fields | null {
    permitted(kind, id)
    const draft = candidate(kind, id)
    if (draft) {
      const row = { ...candidateContext(draft), id, targetId: draft.targetId, pendingDelete: Boolean(draft.op) }
      observed.set(`${kind}:${id}`, row)
      return row
    }
    if (kind === "blueprint" && run.changes.some(change =>
      change.id === id && change.kind === "chapter" && !change.targetId && change.state === "pending")) {
      observed.set(`blueprint:${id}`, null)
      return null
    }
    if (kind === "blueprint" && run.changes.some(change =>
      change.id === id && change.kind === "chapter" && !change.targetId && change.state === "pending")) {
      observed.set(`blueprint:${id}`, null)
      return null
    }
    const explicit = mentioned(kind, id)
    const saved = visibleEntity(kind, id, novel.id, chapterIndex, explicit)
    observed.set(`${kind}:${id}`, saved)
    if (!saved) return null
    const snapshot = request.snapshot
    const row = snapshot?.id === id && snapshot.kind === kind
      ? { ...saved, ...Object.fromEntries(Object.entries(snapshot.fields).filter(([key]) => Object.hasOwn(patchSchemas[kind].shape, key))) }
      : saved
    if (!run.references.some(reference => reference.kind === kind && reference.id === id)) {
      run.references.push({ kind, id, title: String(row.title || row.name || ENTITY_LABEL[kind]) })
    }
    materials.set(`${kind}:${id}`, row)
    return row
  }

  function cards(kind: "character" | "world" | "location" | "foreshadow") {
    const rows = kind === "character" ? repo.listCharacters(novel.id) : kind === "location" ? repo.listLocations(novel.id)
      : kind === "world" ? repo.listWorld(novel.id) : repo.listForeshadows(novel.id)
    return rows.filter(row => (visibleKinds[kind] || mentioned(kind, row.id)) &&
      (!("aiVisible" in row) || isAiVisibleAtChapter(row, chapterIndex, mentioned(kind, row.id))))
  }

  function search({ kind, query, offset, limit }: z.infer<typeof searchSchema>) {
    if (!kind) {
      const volumes = repo.listVolumes(novel.id)
      const current = chapters.find(entry => entry.chapter.id === run.chapterId)
      const next = current && chapters.find(entry => entry.index === current.index + 1)
      return {
        book: { id: novel.id, title: novel.title, synopsis: novel.synopsis.slice(0, 500), pov: novel.pov },
        volumes: volumes.slice(offset, offset + limit).map(({ id, title }) => ({ id, title })),
        nextOffset: offset + limit < volumes.length ? offset + limit : null,
        chapterCount: chapters.length, currentChapter: current && { id: current.chapter.id, title: current.chapter.title, volumeId: current.chapter.volumeId },
        nextChapter: next && { id: next.chapter.id, title: next.chapter.title, volumeId: next.chapter.volumeId },
      }
    }
    const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase()
    const term = normalize(query ?? "")
    const rows = kind === "chapter" ? chapters.map(({ chapter }) => chapter) : cards(kind)
    const matches = rows.flatMap(row => {
      const title = "name" in row ? row.name : row.title
      const aliases = "aliases" in row ? row.aliases : []
      if (term && ![title, ...aliases].some(value => normalize(value).includes(term))) return []
      return [{
        id: row.id, title, aliases: aliases.slice(0, 5),
        ...("volumeId" in row ? { volumeId: row.volumeId, orderIndex: row.orderIndex, words: row.wordCount } : {}),
        ...("identity" in row ? { summary: row.identity.slice(0, 150) }
          : "summary" in row ? { summary: row.summary.slice(0, 150) } : {}),
      }]
    })
    return { items: matches.slice(offset, offset + limit), total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null }
  }

  function readPage({ kind, id, offset, limit, field }: z.infer<typeof readSchema>): Fields {
    let row: Fields | null
    if (kind === "archive") {
      const chapterId = repo.getArchive(id)?.chapterId ?? id
      const chapter = chapters.find(entry => entry.chapter.id === chapterId)
      const archive = chapter && repo.getArchiveByChapter(chapter.chapter.id)
      const explicit = mentioned("archive", id) || Boolean(archive && mentioned("archive", archive.id))
      if (!config.includeArchives && !explicit) throw new Error("故事档案已在上下文设置中关闭")
      if (!chapter) throw new Error("章节不属于该作品")
      if ((chapterIndex === null || chapter.index >= chapterIndex) && !explicit) throw new Error("不能读取当前章节之后的故事档案")
      row = archive ? { ...archive, title: chapter.chapter.title } : null
      if (row) materials.set(`archive:${id}`, row)
    } else {
      row = read(kind, id)
    }
    if (!row) return { kind, id, missing: true,
      ...(["blueprint", "outline", "volume-outline"].includes(kind) ? { canWrite: true } : {}) }
    if (field && !Object.hasOwn(row, field)) throw new Error("此资料没有指定字段")
    if (!field && kind !== "chapter" && JSON.stringify(row).length <= TOOL_RECEIPT_LIMIT) return { ...row, id }

    const key = field ?? (kind === "archive" ? "chapterSummary" : "content")
    if (!Object.hasOwn(row, key)) {
      return { id, title: row.title ?? row.name, fields: Object.keys(row), nextOffset: null }
    }
    const content = typeof row[key] === "string" ? row[key] : JSON.stringify(row[key])
    const { content: _content, ...metadata } = row
    const page = chapterReadPage({ id, title: row.title ?? row.name, wordCount: row.wordCount,
      ...(kind === "chapter" && !field ? metadata : { field: key, fields: Object.keys(row) }), content }, offset, limit)
    if (kind === "chapter" && (!field || field === "content") && offset === (chapterPages.get(id) ?? 0)) {
      chapterPages.set(id, Number(page.contentOffset) + String(page.content).length)
    }
    return page
  }

  function outlineTitle(kind: EntityKind, id: string) {
    if (kind === "blueprint") return chapters.find(({ chapter }) => chapter.id === id)?.chapter.title ?? candidate("chapter", id)?.title ?? ""
    if (kind === "volume-outline") return repo.getVolume(id)?.title ?? ""
    return kind === "outline" ? novel.title : ""
  }

  return { outlineTitle, chapterIndex, chapters, candidate, observed, materials, chapterPages, permitted, mentioned, read, readPage, search, cards }
}

export type Workspace = ReturnType<typeof openWorkspace>
