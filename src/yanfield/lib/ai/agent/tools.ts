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
export const proseSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    ...proseTarget, mode: z.literal("patch"), id,
    edits: z.array(z.strictObject({
      original: z.string().min(1).max(4000),
      replacement: z.string().max(4000),
    })).min(1).max(30),
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

const definitions = {
  search: [searchSchema, "Find chapters or cards by name, title or alias. Omit kind for the book overview."],
  read: [readSchema, "Read a specific chapter, outline, card or archive. Follow nextOffset to read long material."],
  write: [writeSchema.extend({ items: z.array(itemSchema).min(1).max(20) }), "Stage one or many cards or outlines. Modify only requested fields. Read existing targets first. Include evidence for fields taken from a prose candidate or when the author requests quotations. Put occupations in identity and narrative roles in role."],
  edit_prose: [proseSchema, "Stage prose for review. patch replaces an exact unique excerpt, selection edits only the editor selection, append preserves prior prose. Use rewrite only for new prose or a requested full rewrite."],
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
