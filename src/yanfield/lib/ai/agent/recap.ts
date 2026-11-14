import type { AgentChange } from "./types";

export function proposalsNeedRecap(changes: AgentChange[], reply: string): boolean {
  return changes.some(change => change.state === "pending") &&
    (!reply.trim() || /^(?:已完成|完成|done|completed)[。.!！\s]*$/i.test(reply.trim()));
}
