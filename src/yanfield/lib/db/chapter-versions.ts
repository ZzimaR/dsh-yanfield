import { ApiError } from "@/lib/api-utils"
import type { ChapterVersion, ChapterVersionSummary } from "@/lib/chapter-version"
import * as repo from "@/lib/repo"
import type { Chapter } from "@/lib/types"
import { countWords, uid } from "@/lib/ui/cn"
import { all, get, nowIso, run, tx } from "./index"

const summary = "id, chapter_title AS chapterTitle, word_count AS wordCount, source, created_at AS createdAt"

function requireChapter(chapterId: string): Chapter {
  const chapter = repo.getChapter(chapterId)
  if (!chapter) throw new ApiError("章节不存在", 404)
  return chapter
}

function requireCurrentChapter(chapterId: string, expectedUpdatedAt: string): Chapter {
  const chapter = requireChapter(chapterId)
  if (chapter.updatedAt !== expectedUpdatedAt) {
    throw new ApiError("章节已有新修改，请重新打开后再操作", 409)
  }
  return chapter
}

export function hasChapterVersions(chapterId: string): boolean {
  return Boolean(get("SELECT 1 FROM chapter_versions WHERE chapter_id = ? LIMIT 1", [chapterId]))
}

export function listChapterVersions(chapterId: string): ChapterVersionSummary[] {
  requireChapter(chapterId)
  return all<ChapterVersionSummary>(
    `SELECT ${summary} FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC, rowid DESC`,
    [chapterId],
  )
}

export function getChapterVersion(chapterId: string, versionId: string): ChapterVersion {
  const version = get<ChapterVersion>(
    `SELECT ${summary}, content FROM chapter_versions WHERE chapter_id = ? AND id = ?`,
    [chapterId, versionId],
  )
  if (!version) throw new ApiError("章节版本不存在", 404)
  return version
}

function insertVersion(chapter: Chapter, source: ChapterVersion["source"]): ChapterVersionSummary {
  const version: ChapterVersionSummary = {
    id: uid("version"),
    chapterTitle: chapter.title,
    wordCount: chapter.wordCount,
    source,
    createdAt: nowIso(),
  }
  run(
    `INSERT INTO chapter_versions (id, novel_id, chapter_id, chapter_title, content, word_count, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [version.id, chapter.novelId, chapter.id, version.chapterTitle, chapter.content, version.wordCount, source, version.createdAt],
  )
  return version
}

export function createChapterVersion(chapterId: string, expectedUpdatedAt: string): ChapterVersionSummary {
  return tx(() => insertVersion(requireCurrentChapter(chapterId, expectedUpdatedAt), "manual"))
}

export function restoreChapterVersion(chapterId: string, versionId: string, expectedUpdatedAt: string): Chapter {
  return tx(() => {
    const chapter = requireCurrentChapter(chapterId, expectedUpdatedAt)
    const version = getChapterVersion(chapterId, versionId)
    if (chapter.content === version.content) return chapter
    insertVersion(chapter, "before_restore")
    const restored = repo.updateChapter(chapterId, { content: version.content, wordCount: countWords(version.content) })
    repo.markArchiveStale(chapterId)
    // Directory order can span volumes with the same local chapter indexes.
    repo.markArchivesStaleAfter(chapter.novelId, -1)
    return restored
  })
}

export function deleteChapterVersion(chapterId: string, versionId: string): void {
  const result = run("DELETE FROM chapter_versions WHERE chapter_id = ? AND id = ?", [chapterId, versionId])
  if (!result.changes) throw new ApiError("章节版本不存在", 404)
}
