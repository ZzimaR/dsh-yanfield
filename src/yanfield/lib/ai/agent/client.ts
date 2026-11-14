"use client";
import { apiPost, notifyDataChanged } from "@/lib/client/api";
import type { EditorBridge } from "@/lib/editor/bridge";
import type { Chapter } from "@/lib/types";
import type { AgentRun } from "./types";
import { t } from "@/lib/i18n/core";

export const AGENT_UPDATED="yanfield:agent-updated";
export const AGENT_COMMIT_CHANGED="yanfield:agent-commit-changed";
const committing = new Set<string>();
export function isAgentCommitting(id: string): boolean { return committing.has(id); }
export function broadcastRun(run:AgentRun):void {window.dispatchEvent(new CustomEvent(AGENT_UPDATED,{detail:run}));}
export function openAgentReview(run:AgentRun,changeId:string):void {
  window.dispatchEvent(new CustomEvent("yanfield:agent-review",{detail:{run,changeId}}));
}
export async function commitAgent(run:Pick<AgentRun,"id"|"novelId">,body:Record<string,unknown>,bridge:EditorBridge|null):Promise<AgentRun> {
  if (committing.has(run.id)) throw new Error(t("正在保存本轮改动"));
  committing.add(run.id);
  window.dispatchEvent(new CustomEvent(AGENT_COMMIT_CHANGED,{detail:run.id}));
  // Stop editor input before flushing so no keystroke can be overwritten by a concurrent commit.
  try {
    bridge?.setReadOnly?.(true);
    await bridge?.flush?.();
    const saved=await apiPost<AgentRun>(`/api/ai/agent/${run.id}/apply`,{...body,novelId:run.novelId});
    broadcastRun(saved);notifyDataChanged("agent");
    const current=bridge?.getChapterId?.();
    const changed=saved.changes.find(c=>c.kind==="chapter"&&c.appliedId===current);
    if(changed && !(changed.state==="reverted"&&!changed.before)) {
      // Undo returns the old snapshot; fetch it because IDs/wordCount remain server-owned.
      const {apiGet}=await import("@/lib/client/api");
      const chapter=await apiGet<Chapter>(`/api/chapters/${current}`).catch(()=>undefined);
      if(chapter) bridge?.syncSaved?.(chapter);
    }
    return saved;
  } finally {
    committing.delete(run.id);
    window.dispatchEvent(new CustomEvent(AGENT_COMMIT_CHANGED,{detail:run.id}));
    bridge?.setReadOnly?.(false);
  }
}
