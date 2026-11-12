import { diffBlocks, splitBlocks } from "@/lib/diff/blocks";
import type { AgentChange, AgentRun } from "@/lib/ai/agent/types";

export interface AgentReviewState { run: AgentRun; changeId: string }

/** Stable identity for one review candidate: `${run.id}:${change.id}`. */
export function reviewKey(runId: string, changeId: string): string {
  return `${runId}:${changeId}`;
}

/**
 * Pick the pending 正文 change that should open in the central editor without a click.
 *
 * Pure: no side effects. `seen` holds review keys already auto-opened or dismissed, so a
 * change never pops twice. Only a `ready` run can auto-open. When several chapter changes
 * are pending, prefer the one already targeting the open chapter, else the first one.
 */
export function autoReviewChange(
  run: AgentRun,
  seen: ReadonlySet<string>,
  currentChapterId?: string | null,
): AgentChange | null {
  if (run.status !== "ready") return null;
  const pending = run.changes.filter(
    change => change.kind === "chapter" && change.state === "pending" && !seen.has(reviewKey(run.id, change.id)),
  );
  if (!pending.length) return null;
  if (currentChapterId) {
    const current = pending.find(change => (change.appliedId || change.targetId) === currentChapterId);
    if (current) return current;
  }
  return pending[0];
}

/** Pending reviews end once committed/discarded; explicit history stays in its drawer. */
export function updateAgentReview(current: AgentReviewState | null, run: AgentRun): AgentReviewState | null {
  if (!current || current.run.id !== run.id || current.run.updatedAt > run.updatedAt) return current;
  const wasPending = current.run.changes.find(c => c.id === current.changeId)?.state === "pending";
  const change = run.changes.find(c => c.id === current.changeId);
  if (wasPending && change?.state !== "pending") return null;
  return { ...current, run };
}

/** Empty/new chapters are one review unit, while commits keep the original diff IDs. */
export function reviewUnits(before: string, after: string) {
  const diff = diffBlocks(before, after);
  if (!splitBlocks(before).some(block => block.text.trim()) && diff.items.length) {
    return [{ id: "new-content", type: "added" as const, anchorId: null,
      afterText: splitBlocks(after).map(block => block.text).join("\n\n"),
      ids: diff.items.map(item => item.id) }];
  }
  return diff.items.map(item => ({ ...item, ids: [item.id] }));
}
