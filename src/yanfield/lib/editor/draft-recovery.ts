import type { ChapterDraft } from "./useChapterDraft";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_PREFIX = "yanfield:editor:recovery:";

function isChapterDraft(value: unknown, chapterId: string): value is ChapterDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return draft.chapterId === chapterId
    && typeof draft.title === "string"
    && typeof draft.content === "string"
    && typeof draft.summary === "string"
    && (draft.status === "draft" || draft.status === "revising" || draft.status === "done")
    && typeof draft.wordCount === "number"
    && Number.isFinite(draft.wordCount);
}

export function sameChapterDraft(left: ChapterDraft, right: ChapterDraft): boolean {
  return left.chapterId === right.chapterId
    && left.title === right.title
    && left.content === right.content
    && left.summary === right.summary
    && left.status === right.status
    && left.wordCount === right.wordCount;
}

export function readRecoveryDraft(storage: DraftStorage, chapterId: string): ChapterDraft | null {
  const raw = storage.getItem(KEY_PREFIX + chapterId);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
      || !("draft" in value) || !isChapterDraft(value.draft, chapterId)) {
    throw new Error("临时草稿格式无效");
  }
  return value.draft;
}

export function writeRecoveryDraft(storage: DraftStorage, draft: ChapterDraft): void {
  storage.setItem(KEY_PREFIX + draft.chapterId, JSON.stringify({ version: 1, draft }));
}

export function removeMatchingRecoveryDraft(storage: DraftStorage, draft: ChapterDraft): void {
  const saved = readRecoveryDraft(storage, draft.chapterId);
  if (saved && sameChapterDraft(saved, draft)) storage.removeItem(KEY_PREFIX + draft.chapterId);
}
