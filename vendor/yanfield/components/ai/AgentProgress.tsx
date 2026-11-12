"use client";
import * as React from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { AgentRun, AgentStep } from "@/lib/ai/agent/types";
import { Markdown } from "@/components/ui/kit";
import { countWords } from "@/lib/ui/cn";

/** Narrative stays in order; only the active tool's status changes in place. */
export function AgentProgress({run,renderTargets}:{run:AgentRun;renderTargets:(step:AgentStep)=>React.ReactNode}) {
  const progress=run.progress??[];
  const important=(step:AgentStep)=>step.status!=="complete" || ["write_chapter","propose","organize_materials"].includes(step.tool??"");
  if (!progress.length && !run.steps.length && run.status !== "running") return null;
  return <div className="space-y-3 px-4 py-3" aria-label="任务进展">
    {Array.from({length:run.steps.length+1},(_,index)=><React.Fragment key={index}>
      {progress.filter(p=>p.stepIndex===index).map(p=><Markdown key={p.id} text={p.text} className="break-words text-[13px] leading-[1.9] text-ink-2"/>)}
      {run.steps[index] && important(run.steps[index]) ? <div className="border-l-2 border-accent/20 pl-3 text-[11px] text-ink-3">
        <div className="flex items-center gap-1.5">
          {run.steps[index].status==="running"?<Loader2 className="size-3 shrink-0 animate-spin text-accent"/>:run.steps[index].status==="error"?<CircleAlert className="size-3 shrink-0 text-danger"/>:<Check className="size-3 shrink-0 text-jade"/>}
          <span>{run.steps[index].label}</span>
          {run.steps[index].status==="running"&&run.steps[index].tool==="write_chapter"&&run.preview?<span className="ml-auto tabular-nums">已生成 {countWords(run.preview)} 字</span>:null}
        </div>
        {renderTargets(run.steps[index])}
        {run.steps[index].status!=="complete"&&run.steps[index].tool==="write_chapter"&&run.preview?<div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-serif text-[13px] leading-loose text-ink-2" aria-label={run.status==="running"?"正文实时预览":"未完成草稿"}>{run.preview}</div>:null}
      </div>:null}
    </React.Fragment>)}
    {!progress.length && !run.steps.length && run.status==="running"?<p className="text-[12px] text-ink-3">正在理解任务…</p>:null}
  </div>;
}
