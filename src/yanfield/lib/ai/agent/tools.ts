import { z } from "zod"
import { patchSchemas } from "./schema"

export const cardKinds = ["character", "world", "location", "foreshadow"] as const
const outlineKinds = ["blueprint", "outline", "volume-outline"] as const
const id = z.string().min(1)
const reason = z.string().min(1).describe("Exact operative words from the current author message, not from history, source material or a negative instruction")
const evidence = z.array(z.strictObject({
  field: id,
  sourceId: id.describe("Chapter or prose candidate ID from read. For newly staged prose, use its changeId."),
  quote: z.string().trim().min(2).max(800).describe("Verbatim plain-text excerpt supporting this field."),
})).min(1).max(30).optional()
function patch<K extends typeof cardKinds[number]>(kind: K) {
  return z.strictObject({
    kind: z.literal(kind),
    id: id.optional().describe("ID returned by read. Omit only to create a new card."),
    fields: patchSchemas[kind],
    evidence,
  })
}
export const itemSchema = z.discriminatedUnion("kind", [
  patch("character"), patch("world"), patch("location"), patch("foreshadow"),
  z.strictObject({ kind: z.literal("outline"), id: id.describe("Book ID from search or current.novelId."), fields: patchSchemas.outline }),
  z.strictObject({ kind: z.literal("volume-outline"), id: id.describe("Volume ID from search."), fields: patchSchemas["volume-outline"] }),
  z.strictObject({
    kind: z.literal("blueprint"), id: id.describe("Chapter ID from search or current.chapterId."), fields: patchSchemas.blueprint,
    sourceChapterId: id.optional().describe("When deriving a blueprint from a chapter, pass the chapter ID after reading its entire text."),
  }),
])
export const searchSchema = z.strictObject({
  kind: z.enum(["chapter", ...cardKinds]).optional().describe("Omit for a brief book and chapter overview."),
  query: z.string().optional(),
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(60).default(30),
})
export const readSchema = z.strictObject({
  kind: z.enum(["chapter", ...outlineKinds, ...cardKinds, "archive"]),
  id: id.describe("Use the book, volume, or chapter ID for outlines or archives."),
  field: z.string().min(1).optional().describe("Use for a named field if a large card or archive returns a field directory."),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(16000).default(12000),
})
export const writeSchema = z.strictObject({ reason, items: z.array(z.unknown()).min(1).max(20) })
const proseTarget = {
  reason,
  instruction: z.string().min(1).describe("What to write or revise. In patch mode, summarize the exact edits."),
  organizeNotes: z.boolean().optional().describe("Only when the author explicitly requests extracting notes from the new prose."),
  reviseDependentNotes: z.boolean().optional().describe("Carry forward dependent candidates only when explicitly requested."),
}
const words = z.number().int().min(1).max(8000).optional()
const minimumWords = words.describe("Only a minimum number the author explicitly required. Use words for the approximate target.")
const inlineEdits = z.array(z.strictObject({
  original: z.string().min(1).max(4000),
  replacement: z.string().max(4000),
})).min(1).max(30)
export const proseSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    ...proseTarget, mode: z.literal("patch"), id,
    edits: inlineEdits,
  }),
  z.strictObject({ ...proseTarget, mode: z.literal("selection"), id, words }),
  z.strictObject({ ...proseTarget, mode: z.literal("append"), id, words, minimumWords }),
  z.strictObject({
    ...proseTarget, mode: z.literal("rewrite"), words, minimumWords,
    id: id.optional().describe("Chapter or explicitly referenced draft ID. Omit only for a new chapter."),
    title: z.string().trim().min(1).max(200).optional(),
    volumeId: id.nullable().optional(),
  }),
])
export const deleteSchema = z.strictObject({ kind: z.enum(cardKinds), id, reason })
export const splitChapterSchema = z.strictObject({
  id,
  anchor: z.string().trim().min(1).max(300).describe("Verbatim start of the first top-level paragraph or block to move to the next chapter."),
  block: z.number().int().min(2).optional().describe("One-based top-level block number. Supply only to disambiguate a repeated paragraph start."),
  destination: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("new"), title: z.string().trim().min(1).max(200) }),
    z.strictObject({ kind: z.literal("existing"), id }),
  ]).describe("Create a chapter or reuse an already saved chapter whose text contains the entire moved tail in order."),
  reason,
})
const chapterTitle = z.string().trim().min(1).max(200)
export const moveChapterSchema = z.strictObject({
  id, anchorId: id, placement: z.enum(["before", "after"]), title: chapterTitle.optional(), reason,
})
export const renameChapterSchema = z.strictObject({ id, title: chapterTitle, reason })
export const deleteChapterSchema = z.strictObject({ id, reason })
const blockAnchor = z.string().trim().min(1).max(300).describe("Verbatim start of one unique top-level block.")
export const mergeChaptersSchema = z.strictObject({
  id: id.describe("ID of the earlier chapter, whose identity is kept."),
  secondId: id.describe("ID of the immediately following chapter in the same volume."),
  title: chapterTitle.optional(),
  reason,
})
export const moveChapterBlocksSchema = z.strictObject({
  id: id.describe("Source chapter ID."),
  secondId: id.describe("Destination chapter ID."),
  range: z.union([
    z.strictObject({ from: blockAnchor, through: blockAnchor.optional() }),
    z.strictObject({ edge: z.enum(["start", "end"]), count: z.number().int().min(1) }),
  ]).describe("One inclusive continuous range of top-level blocks. Omit through to move just the from block."),
  insert: z.union([
    z.strictObject({ edge: z.enum(["start", "end"]) }),
    z.strictObject({ anchor: blockAnchor, placement: z.enum(["before", "after"]) }),
  ]),
  reason,
})
export const organizeChaptersSchema = z.strictObject({
  changes: z.array(z.strictObject({
    id,
    title: chapterTitle.optional(),
    summary: z.string().trim().max(2000).optional(),
    transition: z.strictObject({ edge: z.enum(["start", "end"]), text: z.string().trim().min(1).max(1000) })
      .optional().describe("Insert a short plain-text transition at the beginning or end of the final chapter text."),
    inlineEdits: inlineEdits.optional().describe("Exact single-paragraph edits in the retained chapter text."),
    duplicateTailIn: id.optional().describe("Existing chapter already containing the source's duplicated ending. The server verifies and trims the exact duplicated suffix; no copied prose or anchor needed."),
  })).max(30).default([]),
  moves: z.array(z.strictObject({ id, anchorId: id, placement: z.enum(["before", "after"]) })).max(30).default([]),
  reason,
})

const definitions = {
  search: [searchSchema, "Find chapters or cards by name, title or alias. Omit kind for the book overview."],
  read: [readSchema, "Read a specific chapter, outline, card or archive. Follow nextOffset to read long material."],
  write: [writeSchema.extend({ items: z.array(itemSchema).min(1).max(20) }), "Stage one or many cards or outlines. Modify only requested fields. Read existing targets first. Include evidence for fields taken from a prose candidate or when the author requests quotations. Put occupations in identity and narrative roles in role."],
  edit_prose: [proseSchema, "Stage prose for review. Patch only replaces an exact unique excerpt within one paragraph. For a duplicated chapter ending, use organize_chapters with duplicateTailIn; for a transition paragraph, use organize_chapters with transition. Selection needs an editor selection, append preserves prior prose, and rewrite is for new prose or a requested full rewrite."],
  split_chapter: [splitChapterSchema, "Stage a chapter split as one review item. Read the saved source chapter first, then quote the start of the first paragraph of the second half. This preserves the original paragraphs and puts the second half immediately after the source. When repairing a partial split, read and reuse the already saved second half."],
  move_chapter: [moveChapterSchema, "Stage moving a saved chapter immediately before or after another saved chapter, including across volumes. Read both chapters first. Include title only if the author also requested a rename."],
  rename_chapter: [renameChapterSchema, "Stage changing a saved chapter title. Read the chapter first. A rename does not move it."],
  delete_chapter: [deleteChapterSchema, "Stage deleting one saved chapter only when the author explicitly requested deleting that entire chapter. Read the chapter first. The review lists any linked material that blocks deletion."],
  merge_chapters: [mergeChaptersSchema, "Stage merging two adjacent saved chapters in the same volume. Read both. Keep their prose and formatting in order, retain the first chapter and remove the second. Only set a new title if requested. Use this instead of rewriting prose or deleting a chapter separately."],
  move_chapter_blocks: [moveChapterBlocksSchema, "Stage moving a continuous block range between two saved chapters as one review item. Read both first. Use edge and count for first or last N paragraphs, or quote unique block starts. Both chapters remain. Use this instead of separate prose edits."],
  organize_chapters: [organizeChaptersSchema, "Stage related chapter repairs, ordering, titles, summaries, inline edits and opening/closing transitions in one volume. Later calls in the same run update the same proposal. Use chapter IDs from search. For duplicateTailIn, the server compares saved paragraphs and trims only the source. Read every page before writing a summary. Use transition to add a bridge paragraph without rewriting existing prose."],
  delete: [deleteSchema, "Stage deletion of one entire saved card, only when explicitly requested. Read the card first."],
} as const

export type ToolName = keyof typeof definitions
export const agentTools = (Object.keys(definitions) as ToolName[]).map(name => {
  const [schema, description] = definitions[name]
  const { $schema, ...parameters } = z.toJSONSchema(schema, { target: "draft-7", io: "input" })
  if (name !== "edit_prose") return { name, description, parameters }

  // Some OpenAI-compatible servers require top-level object properties even for a discriminated union.
  const modes = parameters.oneOf ?? []
  const required = modes[0]?.required?.filter(field => modes.every(mode => mode.required?.includes(field)))
  return {
    name,
    description,
    parameters: {
      ...parameters,
      type: "object",
      properties: {
        ...Object.assign({}, ...modes.map(mode => mode.properties)),
        mode: { type: "string", enum: proseSchema.options.map(option => option.shape.mode.value) },
      },
      required,
    },
  }
})
