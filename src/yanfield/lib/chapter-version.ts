export interface ChapterVersionSummary {
  id: string
  chapterTitle: string
  wordCount: number
  source: "manual" | "before_restore"
  createdAt: string
}

export interface ChapterVersion extends ChapterVersionSummary {
  content: string
}
