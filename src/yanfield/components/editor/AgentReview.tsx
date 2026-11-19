"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Check, FilePenLine, LocateFixed, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import { splitBlocks } from "@/lib/diff/blocks";
import { chapterReviewSections, reviewUnits } from "@/lib/editor/agent-review";
import { useEditorBridge } from "@/lib/editor/bridge";
import { apiGet, apiPatch, notifyDataChanged } from "@/lib/client/api";
import { AGENT_UPDATED, broadcastRun, commitAgent } from "@/lib/ai/agent/client";
import type { AgentRun } from "@/lib/ai/agent/types";
import { useT } from "@/lib/i18n";

export function AgentReview({initial,changeId,onClose}:{initial:AgentRun;changeId:string;onClose:()=>void}) {
  const tr=useT();
  const [run,setRun]=React.useState(initial);
  const [choices,setChoices]=React.useState<Record<string,boolean>>({});
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState("");
  const [position,setPosition]=React.useState<{ key: string; index: number }>();
  const animateJump = React.useRef(false);
  const busyRef=React.useRef(false);
  const bridge=useEditorBridge(),root=React.useRef<HTMLDivElement>(null);
  const toolbar = React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{
    let live=true;
    const receive=(value:AgentRun)=>{if(live && value.id===initial.id)setRun(current=>value.updatedAt>=current.updatedAt?value:current);};
    const onUpdate=(event:Event)=>receive((event as CustomEvent<AgentRun>).detail);
    window.addEventListener(AGENT_UPDATED,onUpdate);
    void apiGet<AgentRun>(`/api/ai/agent/${initial.id}?novelId=${encodeURIComponent(initial.novelId)}`).then(receive).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;window.removeEventListener(AGENT_UPDATED,onUpdate);};
  },[initial.id,initial.novelId]);
  const initialChange = run.changes.find(change => change.id === changeId);
  const initialPending = initialChange?.state === "pending";
  const scopes = React.useMemo(() => run.changes
    .filter(change => initialPending ? change.state === "pending" : change.state === "applied" || change.state === "reverted")
    .flatMap(change => chapterReviewSections(change).map(section => ({
      ...section, change, key: `${change.id}:${section.chapterId ?? ""}`, units: reviewUnits(section.before, section.after),
    }))).filter(section => section.units.length > 0), [run, initialPending]);
  const scope = scopes.find(section => section.key === position?.key)
    ?? scopes.find(section => section.change.id === changeId) ?? scopes[0];
  const change = scope?.change;
  const before = scope?.before ?? "";
  const units = scope?.units ?? [];
  const active = scope?.key === position?.key ? Math.min(position?.index ?? 0, Math.max(0, units.length - 1)) : 0;
  const pending = change?.state === "pending";
  const wholeBatch = Boolean(change?.chapterBatch);
  const scopeKey = scope?.key ?? "";
  const choiceKey = (id: string) => scopeKey + ":" + id;
  const reviewed = units.filter(unit => choices[choiceKey(unit.id)] !== undefined).length;
  const total = scopes.reduce((count, section) => count + section.units.length, 0);
  const offset = (scope ? scopes.slice(0, scopes.indexOf(scope)) : []).reduce((count, section) => count + section.units.length, 0);
  const firstUnitId = units[0]?.id;
  const scrollToChange = React.useCallback((index: number, animate: boolean) => {
    const review = root.current;
    const section = review?.querySelector<HTMLElement>(`[data-change-index="${index}"]`);
    if (!section) return;
    const behavior = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto";
    const viewport = review?.closest<HTMLElement>("[data-prose-scroll]");
    if (!viewport) {
      section.scrollIntoView({ behavior, block: "center" });
      return;
    }
    const headerOffset = (toolbar.current?.offsetHeight ?? 0) + 24;
    const top = viewport.scrollTop + section.getBoundingClientRect().top - viewport.getBoundingClientRect().top - headerOffset;
    viewport.scrollTo({ top, behavior });
  }, []);
  React.useLayoutEffect(() => {
    if ((!pending && !position) || !firstUnitId) return;
    const animate = animateJump.current;
    animateJump.current = false;
    const frame = window.requestAnimationFrame(() => scrollToChange(active, animate));
    return () => window.cancelAnimationFrame(frame);
  }, [pending, position, scopeKey, firstUnitId, active, scrollToChange]);
  const jump = (index: number) => {
    if (!total) return;
    let next = (index + total) % total;
    for (const section of scopes) {
      if (next < section.units.length) {
        animateJump.current = section.key === scopeKey;
        setPosition({ key: section.key, index: next });
        return;
      }
      next -= section.units.length;
    }
  };
  const finish=async(mode:"reviewed"|"all"|"none")=>{
    if(!change||busyRef.current||!pending)return;
    busyRef.current=true;setBusy(true);setError("");
    const blocks=units.filter(unit=>mode==="all" || (mode==="reviewed" && choices[choiceKey(unit.id)]===true)).flatMap(unit=>unit.ids);
    try {
      if (mode !== "none" && (wholeBatch || blocks.length)) {
        const result=await commitAgent(run,{selections:[wholeBatch ? { id: change.id } : {id:change.id,blocks}]},bridge);
        const saved=result.changes.find(c=>c.id===change.id);
        const id=scope?.chapterId || saved?.appliedId || saved?.targetId;
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
  const choose=(id:string,keep:boolean)=>setChoices(current=>({...current,[choiceKey(id)]:keep}));
  const renderChange=(item:(typeof units)[number])=>{
    const index=units.indexOf(item),decision=choices[choiceKey(item.id)];
    if(pending && decision!==undefined)return <section key={item.id} data-change-index={index} className={cn("my-5 border-l-2 pl-4", decision?"border-jade/50":"border-danger/40")}>
      <button type="button" disabled={busy} className={cn("mb-1 font-sans text-[10px]", decision?"text-jade":"text-danger/80")} onClick={()=>setChoices(current=>{const next={...current};delete next[choiceKey(item.id)];return next;})}>{decision?tr("已保留 · 重新审阅"):tr("已还原 · 重新审阅")}</button>
      <p className={cn("whitespace-pre-wrap", decision?"":"text-ink-3")}>{decision?item.afterText:item.beforeText}</p>
    </section>;
    return <section key={item.id} data-change-index={index} className="my-7 border-t border-line/70 pt-3">
      <div className="mb-4 flex flex-wrap items-center gap-2 font-sans text-[11px]">
        <span className="mr-1 font-mono text-accent">{String(index+1).padStart(2,"0")}</span>
        <span className="text-ink-4">{item.beforeText?(item.afterText?tr("文字修订"):tr("删去段落")):tr("新增正文")}</span>
        {pending && !wholeBatch?<div className="ml-auto flex items-center gap-1">
          <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-accent transition-colors hover:bg-accent/20 disabled:opacity-40" onClick={()=>choose(item.id,true)}><Check className="size-3"/>{tr("保留")}</button>
          <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-surface-2 disabled:opacity-40" onClick={()=>choose(item.id,false)}><RotateCcw className="size-3"/>{tr("还原")}</button>
        </div>:!pending?<span className="ml-auto text-ink-4">{tr("历史快照")}</span>:null}
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
    <div ref={toolbar} className="sticky top-2 z-20 mb-7 overflow-hidden rounded-xl border border-line/80 bg-surface/95 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><FilePenLine className="size-4"/></span>
        <div className="min-w-0 flex-1 font-sans">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[13px] font-medium text-ink">{pending?tr("审阅修订"):tr("修订存档")}</span><span className="text-[10px] tabular-nums text-ink-4">{pending?tr("{reviewed} / {total} 已审阅",{reviewed,total:units.length}):tr("{n} 处改动",{n:units.length,count:units.length})}</span></div>
          <p className="mt-1 truncate text-[11px] text-ink-3">{scope?.title}</p>
        </div>
        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink" aria-label={tr("返回正文编辑")} disabled={busy} onClick={onClose}><X className="size-3.5"/></button>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-3 pt-3">
        {total>1?<div className="mr-auto flex items-center gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" icon={<ArrowUp className="size-3"/>} onClick={()=>jump(offset+active-1)}>{tr("上一处")}</Button><span className="px-1 font-mono text-[10px] tabular-nums text-ink-4">{offset+active+1}/{total}</span><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" icon={<ArrowDown className="size-3"/>} onClick={()=>jump(offset+active+1)}>{tr("下一处")}</Button></div>:null}
        {total===1?<Button size="sm" variant="ghost" className="mr-auto h-7 px-2 text-[11px]" icon={<LocateFixed className="size-3"/>} onClick={()=>jump(0)}>{tr("定位改动")}</Button>:null}
        {pending?<><Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={()=>void finish("none")}>{tr("全部还原")}</Button><Button size="sm" variant="secondary" className="ml-auto h-7 border-accent/20 bg-accent/10 px-3 text-[11px] text-accent shadow-none hover:bg-accent/20" loading={busy} disabled={!units.length} icon={<Check className="size-3"/>} onClick={()=>void finish(wholeBatch || !reviewed ? "all" : "reviewed")}>{wholeBatch ? tr("应用此项") : reviewed ? tr("确认审阅结果") : tr("全部保留")}</Button></>:null}
      </div>
      <div className="border-t border-line/60 bg-paper/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-relaxed text-ink-4">
          {pending?<><span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-[2px] bg-jade-soft ring-1 ring-jade/40"/><span className="text-jade">{tr("新增")}</span></span><span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-[2px] bg-danger/15 ring-1 ring-danger/40"/><span className="text-danger/80">{tr("删除（划线）")}</span></span></>:null}
          <span>{pending?wholeBatch?tr("此候选会整体应用，包含正文和其他章节改动。"):tr("「全部保留」会直接写入修订。逐段选择后，点「确认审阅结果」写入保留的段落。"):tr("本轮修改的历史快照，关闭即可返回当前正文。")}</span>
        </div>
        {error?<p role="alert" className="mt-2 text-[11px] text-danger">{error}</p>:null}
      </div>
    </div>
    <div className="font-serif text-[17px] leading-[2.1] text-ink-2">{additions(null)}{blocks.map(b=><React.Fragment key={b.id}>{byId.has(b.id)?renderChange(byId.get(b.id)!):<p className="my-5 whitespace-pre-wrap">{b.text}</p>}{additions(b.id)}</React.Fragment>)}{!units.length?<p>{tr("内容没有变化。")}</p>:null}</div>
  </div>;
}
