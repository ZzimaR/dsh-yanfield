"use client";
import * as React from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { AgentRun, AgentStep, AgentThought } from "@/lib/ai/agent/types";
import { Markdown } from "@/components/ui/kit";
import { useT } from "@/lib/i18n";
import { countWords } from "@/lib/ui/cn";
import { ThinkingPreview } from "./ThinkingPreview";

/** Narrative stays in order; only the active tool's status changes in place. */
/**
 * 同一次任务里 propose 可能为同一个候选重试多次（模型返回被自动修复时尤其常见），
 * 这些步骤文案与目标完全一样，堆在面板里会让人以为生成了好几份候选，这里按文案+目标去重。
 */
function stepKey(step: AgentStep): string {
  const targets = (step.targets ?? []).map((target) => `${target.kind}:${target.changeId ?? target.id}`).join(",");
  return `${step.tool ?? ""}|${step.label}|${targets}|${step.status}`;
}

export function AgentProgress({run,compact=false,thought,renderTargets}:{run:AgentRun;compact?:boolean;thought?:AgentThought;renderTargets:(step:AgentStep)=>React.ReactNode}) {
  const tr=useT();
  const progress=run.progress??[];
  const thoughts = thought ? [...(run.thoughts ?? []), thought] : run.thoughts ?? [];
  const important=(step:AgentStep)=>step.status!=="complete" || ["edit_prose","write","write_chapter","propose","propose_cards","delete","organize_materials"].includes(step.tool??"");
  const visibleSteps: {step: AgentStep; index: number; repeated: boolean}[] = [];
  let previousKey = "";
  run.steps.forEach((step, index) => {
    const key = stepKey(step);
    visibleSteps.push({ step, index, repeated:key===previousKey });
    previousKey = key;
  });
  if (!thoughts.length && !progress.length && (compact || run.status !== "running" && !run.steps.length)) return null;
  const renderThoughts = (index: number, withinStep = false) => thoughts
    .filter(entry => entry.stepIndex === index && Boolean(entry.withinStep) === withinStep)
    .map(entry => <ThinkingPreview key={entry.id} text={entry.text} active={entry.id === thought?.id} />);
  return <div className="space-y-2 px-1 py-2" aria-label={tr("任务进展")}>
    {visibleSteps.map(({ step, index, repeated })=><React.Fragment key={step.id}>
      {renderThoughts(index)}
      {progress.filter(p=>p.stepIndex===index && (!compact || p.text.trim()!==run.summary.trim())).map(p=><Markdown key={p.id} text={p.text} className="break-words text-[12px] leading-[1.75] text-ink-3"/>)}
      {renderThoughts(index, true)}
      {!compact && !repeated && important(step) ? <div className="border-l-2 border-accent/20 pl-3 text-[11px] text-ink-3">
        <div className="flex items-center gap-1.5">
          {step.status==="running"?<Loader2 className="size-3 shrink-0 animate-spin text-accent"/>:(step.status==="error"||step.status==="partial")?<CircleAlert className="size-3 shrink-0 text-danger"/>:<Check className="size-3 shrink-0 text-jade"/>}
          <span>{tr(step.label)}</span>
          {step.status==="running"&&(step.tool==="edit_prose"||step.tool==="write_chapter")&&run.preview?<span className="ml-auto tabular-nums">{tr("已生成 {count} 字",{count:countWords(run.preview)})}</span>:null}
        </div>
        {renderTargets(step)}
        {step.status!=="complete"&&(step.tool==="edit_prose"||step.tool==="write_chapter")&&run.preview?<div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-serif text-[13px] leading-loose text-ink-2" aria-label={run.status==="running"?tr("正文实时预览"):tr("未完成草稿")}>{run.preview}</div>:null}
      </div>:null}
    </React.Fragment>)}
    {renderThoughts(run.steps.length)}
    {!compact && !thoughts.length && !progress.length && !run.steps.length && run.status==="running"?<ThinkingPreview text="" active />:null}
  </div>;
}
