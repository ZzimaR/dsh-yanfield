"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Check, FilePenLine, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import { splitBlocks } from "@/lib/diff/blocks";
import { reviewUnits } from "@/lib/editor/agent-review";
import { useEditorBridge } from "@/lib/editor/bridge";
import { apiGet, apiPatch, notifyDataChanged } from "@/lib/client/api";
import { broadcastRun, commitAgent } from "@/lib/ai/agent/client";
import type { AgentRun } from "@/lib/ai/agent/types";
import { useT } from "@/lib/i18n";

export function AgentReview({initial,changeId,onClose}:{initial:AgentRun;changeId:string;onClose:()=>void}) {
  const tr=useT();
  const [run,setRun]=React.useState(initial);
  const [choices,setChoices]=React.useState<Record<string,boolean>>({});
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[active,setActive]=React.useState(0);
  const busyRef=React.useRef(false);
  const bridge=useEditorBridge(),root=React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{
    let live=true;
    void apiGet<AgentRun>(`/api/ai/agent/${initial.id}?novelId=${encodeURIComponent(initial.novelId)}`).then(value=>{if(live)setRun(current=>value.updatedAt>=current.updatedAt?value:current);}).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  },[initial.id]);
  const change=run.changes.find(c=>c.id===changeId);
  const before=String(change?.before?.content||""),after=String(change?.after.content||"");
  const units=React.useMemo(()=>reviewUnits(before,after),[before,after]);
  const pending=change?.state==="pending";
  const jump=(index:number)=>{
    if(!units.length)return;
    const next=(index+units.length)%units.length;setActive(next);
    root.current?.querySelector(`[data-change-index="${next}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
  };
  const finish=async(decisions:Record<string,boolean>)=>{
    if(!change||busyRef.current||!pending)return;
    busyRef.current=true;setBusy(true);setError("");
    const blocks=units.filter(unit=>decisions[unit.id]!==false).flatMap(unit=>unit.ids);
    try {
      if(blocks.length){
        const result=await commitAgent(run,{selections:[{id:change.id,blocks}]},bridge);
        const saved=result.changes.find(c=>c.id===change.id);
        const id=saved?.appliedId||saved?.targetId;
        if(id)window.dispatchEvent(new CustomEvent("yanfield:agent-navigate",{detail:{kind:"chapter",id}}));
      }else{
        const result=await apiPatch<AgentRun>(`/api/ai/agent/${run.id}`,{op:"reject",changeId:change.id,novelId:run.novelId});
        broadcastRun(result);notifyDataChanged("agent");
      }
      onClose();
    }catch(e){setError(e instanceof Error?e.message:tr("应用失败"));}
    finally{busyRef.current=false;setBusy(false);}
  };
  // 只记录选择，不自动提交：作者需要能先把每段都看一遍，再决定提交哪些。
  const choose=(id:string,keep:boolean)=>setChoices(current=>({...current,[id]:keep}));
  const renderChange=(item:(typeof units)[number])=>{
    const index=units.indexOf(item),decision=choices[item.id];
    if(pending && decision!==undefined)return <section key={item.id} data-change-index={index} className={cn("my-5 border-l-2 pl-4", decision?"border-jade/50":"border-danger/40")}>
      <button type="button" disabled={busy} className={cn("mb-1 font-sans text-[10px]", decision?"text-jade":"text-danger/80")} onClick={()=>setChoices(current=>{const next={...current};delete next[item.id];return next;})}>{decision?tr("已保留 · 重新审阅"):tr("已还原 · 重新审阅")}</button>
      <p className={cn("whitespace-pre-wrap", decision?"":"text-ink-3")}>{decision?item.afterText:item.beforeText}</p>
    </section>;
    return <section key={item.id} data-change-index={index} className="my-7 border-t border-line/70 pt-3">
      <div className="mb-4 flex flex-wrap items-center gap-2 font-sans text-[11px]">
        <span className="mr-1 font-mono text-accent">{String(index+1).padStart(2,"0")}</span>
        <span className="text-ink-4">{item.beforeText?(item.afterText?tr("文字修订"):tr("删去段落")):tr("新增正文")}</span>
        {pending?<div className="ml-auto flex items-center gap-1">
          <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-accent transition-colors hover:bg-accent/20 disabled:opacity-40" onClick={()=>choose(item.id,true)}><Check className="size-3"/>{tr("保留")}</button>
          <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-surface-2 disabled:opacity-40" onClick={()=>choose(item.id,false)}><RotateCcw className="size-3"/>{tr("还原")}</button>
        </div>:<span className="ml-auto text-ink-4">{tr("历史快照")}</span>}
      </div>
      {item.beforeText?<div className="mb-5 border-l border-line-strong pl-4">
        <span className="mb-1 block font-sans text-[10px] tracking-widest text-ink-4">{tr("原文")}</span>
        <p className="whitespace-pre-wrap text-ink-3">{item.inline?item.inline.filter(s=>s.type!=="add").map((s,i)=><span key={i} className={s.type==="del"?"rounded-[3px] bg-danger/10 px-0.5 text-danger line-through decoration-danger/60 decoration-[1.5px]":""}>{s.text}</span>):<del className="rounded-[3px] bg-danger/10 px-0.5 text-danger decoration-danger/60">{item.beforeText}</del>}</p>
      </div>:null}
      {item.afterText?<div className="border-l-2 border-accent/30 pl-4">
        <span className="mb-1 block font-sans text-[10px] tracking-widest text-accent/80">{item.beforeText?tr("修订稿"):tr("新稿")}</span>
        <p className="whitespace-pre-wrap">{item.inline?item.inline.filter(s=>s.type!=="del").map((s,i)=><span key={i} className={s.type==="add"?"rounded-[3px] bg-jade-soft px-0.5 text-jade underline decoration-jade/40 underline-offset-4":""}>{s.text}</span>):<span className="rounded-[3px] bg-jade-soft px-0.5 text-jade">{item.afterText}</span>}</p>
      </div>:null}
    </section>;
  };
  const blocks=splitBlocks(before),byId=new Map(units.filter(c=>c.type!=="added").map(c=>[c.id,c]));
  const additions=(anchor:string|null)=>units.filter(c=>c.type==="added"&&c.anchorId===anchor).map(renderChange);
  return <div ref={root} data-testid="agent-inline-review" className="ai-surface pb-8">
    <div className="sticky top-2 z-20 mb-7 overflow-hidden rounded-xl border border-line/80 bg-surface/95 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><FilePenLine className="size-4"/></span>
        <div className="min-w-0 flex-1 font-sans">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[13px] font-medium text-ink">{pending?tr("审阅修订"):tr("修订存档")}</span><span className="text-[10px] tabular-nums text-ink-4">{pending?tr("{reviewed} / {total} 已审阅",{reviewed:Object.keys(choices).length,total:units.length}):tr("{n} 处改动",{n:units.length,count:units.length})}</span></div>
          <p className="mt-1 truncate text-[11px] text-ink-3">{change?.title}</p>
        </div>
        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink" aria-label={tr("返回正文编辑")} disabled={busy} onClick={onClose}><X className="size-3.5"/></button>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-3 pt-3">
        {units.length>1?<div className="mr-auto flex items-center gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" icon={<ArrowUp className="size-3"/>} onClick={()=>jump(active-1)}>{tr("上一处")}</Button><span className="px-1 font-mono text-[10px] tabular-nums text-ink-4">{active+1}/{units.length}</span><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" icon={<ArrowDown className="size-3"/>} onClick={()=>jump(active+1)}>{tr("下一处")}</Button></div>:null}
        {pending?<><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={()=>void finish(Object.fromEntries(units.map(unit=>[unit.id,false])))}>{tr("全部还原")}</Button><Button size="sm" variant="secondary" className="ml-auto h-7 border-accent/20 bg-accent/10 px-3 text-[11px] text-accent shadow-none hover:bg-accent/20" loading={busy} disabled={!units.length} icon={<Check className="size-3"/>} onClick={()=>void finish(choices)}>{Object.keys(choices).length?tr("确认审阅结果"):tr("全部保留")}</Button></>:null}
      </div>
      <div className="border-t border-line/60 bg-paper/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-relaxed text-ink-4">
          {pending?<><span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-[2px] bg-jade-soft ring-1 ring-jade/40"/><span className="text-jade">{tr("新增")}</span></span><span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-[2px] bg-danger/15 ring-1 ring-danger/40"/><span className="text-danger/80">{tr("删除（划线）")}</span></span></>:null}
          <span>{pending?tr("「保留 / 还原」逐段生效：点完「确认审阅结果」后只写入保留的段落，其余保持原文。"):tr("本轮修改的历史快照，关闭即可返回当前正文。")}</span>
        </div>
        {error?<p role="alert" className="mt-2 text-[11px] text-danger">{error}</p>:null}
      </div>
    </div>
    <div className="font-serif text-[17px] leading-[2.1] text-ink-2">{additions(null)}{blocks.map(b=><React.Fragment key={b.id}>{byId.has(b.id)?renderChange(byId.get(b.id)!):<p className="my-5 whitespace-pre-wrap">{b.text}</p>}{additions(b.id)}</React.Fragment>)}{!units.length?<p>{tr("内容没有变化。")}</p>:null}</div>
  </div>;
}
