import type { EntityKind } from "./types"

export type AgentLinkKind = "chapter" | "volume" | "world" | "location"

interface LinkField {
  kind: AgentLinkKind
  label: string
}

const linkFields: Partial<Record<EntityKind, Record<string, LinkField>>> = {
  chapter: { volumeId: { kind: "volume", label: "所属卷" } },
  world: { parentId: { kind: "world", label: "所属设定" } },
  location: { parentId: { kind: "location", label: "上级地点" } },
  foreshadow: {
    plantedChapterId: { kind: "chapter", label: "埋设章节" },
    payoffChapterId: { kind: "chapter", label: "回收章节" },
  },
}

export function agentLinkField(kind: EntityKind, field: string): LinkField | undefined {
  const fields = linkFields[kind]
  return fields && Object.hasOwn(fields, field) ? fields[field] : undefined
}

export function agentLinkKey(kind: AgentLinkKind, id: string): string {
  return `${kind}:${id}`
}
