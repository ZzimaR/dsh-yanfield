"use client";
import { apiPost, notifyDataChanged } from "@/lib/client/api";
import type { EditorBridge } from "@/lib/editor/bridge";
import type { Chapter } from "@/lib/types";
import type { AgentRun } from "./types";

export const AGENT_UPDATED="yanfield:agent-updated";
export function broadcastRun(run:AgentRun):void {window.dispatchEvent(new CustomEvent(AGENT_UPDATED,{detail:run}));}
export function openAgentReview(run:AgentRun,changeId:string):void {
  window.dispatchEvent(new CustomEvent("yanfield:agent-review",{detail:{run,changeId}}));
}
export async function commitAgent(run:Pick<AgentRun,"id"|"novelId">,body:Record<string,unknown>,bridge:EditorBridge|null):Promise<AgentRun> {
  // Stop editor input before flushing so no keystroke can be overwritten by a concurrent commit.
  bridge?.setReadOnly?.(true);
  try {
    await bridge?.flush?.();
    const saved=await apiPost<AgentRun>(`/api/ai/agent/${run.id}/apply`,{...body,novelId:run.novelId});
    const current=bridge?.getChapterId?.();
    const changed=saved.changes.find(c=>c.kind==="chapter"&&c.appliedId===current);
    if(changed && !(changed.state==="reverted"&&!changed.before)) {
      // Undo returns the old snapshot; fetch it because IDs/wordCount remain server-owned.
      const {apiGet}=await import("@/lib/client/api");
      const chapter=await apiGet<Chapter>(`/api/chapters/${current}`);
      bridge?.syncSaved?.(chapter);
    }
    broadcastRun(saved);notifyDataChanged("agent");return saved;
  } finally {bridge?.setReadOnly?.(false);}
}
