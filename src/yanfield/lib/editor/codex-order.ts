import { sameListOrderIndex } from "./reorder";

export const CODEX_GROUPS = ["characters", "locations", "world", "items", "foreshadows"] as const;
export type CodexGroup = typeof CODEX_GROUPS[number];
export type CodexOrder = Partial<Record<CodexGroup, string[]>>;

export function orderCodexEntries<T>(entries: T[], ids: readonly string[], getId: (entry: T) => string): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...entries].sort((a, b) => (rank.get(getId(a)) ?? ids.length) - (rank.get(getId(b)) ?? ids.length));
}

export function moveCodexEntry(ids: string[], id: string, anchor: string, after: boolean): string[] {
  const from = ids.indexOf(id);
  const target = ids.indexOf(anchor);
  if (target < 0) return ids;
  const to = sameListOrderIndex(from, target + Number(after));
  if (to === null) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
