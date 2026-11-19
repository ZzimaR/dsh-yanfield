import type { AgentRun } from "@/lib/ai/agent/types"
import type { AiAction } from "@/lib/types"

type IdMap = ReadonlyMap<string, string>

export function remapId(value: string, ids: IdMap): string {
  return ids.get(value) ?? value
}

const referenceFields = new Set([
  "id", "novelId", "volumeId", "chapterId", "parentId", "targetId", "plantedChapterId", "payoffChapterId",
  "sessionId", "messageId", "runId", "previousRunId", "retryRunId", "sourceId", "appliedId", "changeId", "anchorId",
])
const referenceObjects = new Set([
  "requestContext", "snapshot", "fields", "mentions", "before", "after", "saved", "relations", "changes",
  "evidence", "references", "steps", "targets", "payload", "archive",
  "chapterSplit", "chapterDirectory", "chapterPair", "chapterBatch", "entries", "duplicateIn", "second", "existing", "orderBefore", "orderAfter",
])

// Follow the structured links used by proposals and chat actions. Manuscript, chat and note text
// can contain the same strings as IDs and must be preserved exactly.
function remapLinks(value: unknown, ids: IdMap): unknown {
  if (Array.isArray(value)) return value.map(item => remapLinks(item, ids))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, field]) => {
    if (referenceFields.has(key) && typeof field === "string") return [key, remapId(field, ids)]
    if (referenceObjects.has(key)) return [key, remapLinks(field, ids)]
    return [key, field]
  }))
}

export function restoreAgentRun(value: AgentRun, ids: IdMap): AgentRun {
  const run = remapLinks(value, ids) as AgentRun
  for (const { chapterBatch } of run.changes) {
    if (chapterBatch) chapterBatch.titles = Object.fromEntries(Object.entries(chapterBatch.titles)
      .map(([id, title]) => [remapId(id, ids), title]))
  }
  if (run.linkTitles && ids.size) {
    run.linkTitles = Object.fromEntries(Object.entries(run.linkTitles).map(([key, title]) => {
      const colon = key.indexOf(":") + 1
      return [key.slice(0, colon) + remapId(key.slice(colon), ids), title]
    }))
  }
  // A saved checkpoint has no live model request on the destination. Retain its candidates.
  if (run.status === "running") {
    run.status = "aborted"
    run.steps = run.steps.map(step => step.status === "running" ? { ...step, status: "partial" } : step)
  }
  return run
}

export function restoreActions(actions: AiAction[], ids: IdMap): AiAction[] {
  return remapLinks(actions, ids) as AiAction[]
}

export function restoreRelations(relations: unknown[], ids: IdMap): unknown[] {
  return remapLinks(relations, ids) as unknown[]
}
