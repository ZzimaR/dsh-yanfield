"use client";
import * as React from "react";
import { BookOpen, User, MapPin, MapPinned, Bookmark, FolderOpen, Check, ChevronDown, CircleAlert, Loader2, RotateCcw } from "lucide-react";
import { copyText } from "@/lib/ui/clipboard";
import { entityTone } from "@/lib/ui/entity-tone";
import { AgentProgress } from "./AgentProgress";
import { AgentReply, useAgentReplyReveal } from "./AgentReply";
import { MaterialPreview } from "@/components/cards/MaterialPreview";
import { Button, ConfirmDialog, Markdown, Sheet, useToast } from "@/components/ui/kit";
import { apiGet, apiPatch, useDataChanged } from "@/lib/client/api";
import { useEditorBridge } from "@/lib/editor/bridge";
import { countWords, stripHtml } from "@/lib/ui/cn";
import { diffInline } from "@/lib/diff/blocks";
import { AGENT_COMMIT_CHANGED, AGENT_UPDATED,broadcastRun,commitAgent,isAgentCommitting,openAgentReview } from "@/lib/ai/agent/client";
import { displayAgentReply } from "@/lib/ai/agent/reply";
import { ENTITY_LABEL, FIELD_LABEL, type AgentChange, type AgentRun, type AgentReference } from "@/lib/ai/agent/types";
import { t, useT } from "@/lib/i18n";

const entityIcons = { character: User, location: MapPinned, world: MapPin, foreshadow: Bookmark };

function display(value:unknown):string {
  if(value===null||value===undefined||value==="") return t("未填写");
  if(Array.isArray(value)) return value.map(v=>typeof v==="string"?v:JSON.stringify(v)).join("\n");
  return typeof value==="object"?JSON.stringify(value,null,2):String(value);
}
function displayScenes(value:unknown):string {
  if(!Array.isArray(value)||!value.length)return t("未填写");
  return value.map((item,index)=>{
    const scene=item as Partial<import("@/lib/types").ScenePlan>|null;
    const details=[
      scene?.summary,
      scene?.purpose && `${t("场景目的")} · ${scene.purpose}`,
      Array.isArray(scene?.characters) && scene.characters.length && `${t("角色")} · ${scene.characters.join(t("、"))}`,
      scene?.location && `${t("地点")} · ${scene.location}`,
      scene?.emotion && `${t("情绪")} · ${scene.emotion}`,
    ];
    return [scene?.title||t("场景 {index}",{index:index+1}),...details.filter(Boolean)].join("\n");
  }).join("\n\n");
}
function evidenceLabel(run:AgentRun,e:NonNullable<AgentChange["evidence"]>[number]):string {
  if(!e.candidate)return t("已有正文");
  const source=run.changes.find(c=>c.id===e.sourceId);
  if(source?.state==="applied")return stripHtml(String(source.saved?.content??source.after.content??"")).includes(e.quote)?t("本轮正文"):t("未采用的候选正文");
  if(stripHtml(String(source?.before?.content??"")).includes(e.quote))return t("已有正文");
  if(source?.state==="reverted")return t("已撤回正文");
  if(source?.state==="rejected")return t("已丢弃正文");
  return t("待确认正文");
}
export function FieldChange({before,after,format=display}:{before:unknown;after:unknown;format?:(value:unknown)=>string}) {
  const tr=useT();
  const segments=diffInline(format(before),format(after));
  return <div className="space-y-1.5 text-[12px] leading-[1.85]">
    <div className="whitespace-pre-wrap break-words rounded-md border-l-2 border-danger/25 bg-danger/[0.035] px-2.5 py-2 text-ink-3"><span className="mr-2 text-[10px] text-danger">{tr("原")}</span>{segments.filter(x=>x.type!=="add").map((s,i)=><span key={i} className={s.type==="del"?"bg-danger/10 text-danger line-through":""}>{s.text}</span>)}</div>
    <div className="whitespace-pre-wrap break-words rounded-md border-l-2 border-jade/35 bg-jade/[0.035] px-2.5 py-2 text-ink-2"><span className="mr-2 text-[10px] text-jade">{tr("改")}</span>{segments.filter(x=>x.type!=="del").map((s,i)=><span key={i} className={s.type==="add"?"bg-jade/15 text-jade":""}>{s.text}</span>)}</div>
  </div>;
}
export function AgentRunCard({runId,novelId,initial,disabled=false,onContinue}:{runId:string;novelId:string;initial?:AgentRun;disabled?:boolean;onContinue?:(text:string, runId:string)=>void}) {
  const [run,setRun]=React.useState<AgentRun|undefined>(initial);
  const [error,setError]=React.useState("");
  const [expanded,setExpanded]=React.useState<string|null>(null);
  const [expandedMaterial,setExpandedMaterial]=React.useState<string|null>(null);
  const [confirmation,setConfirmation]=React.useState<{ op: "delete" | "discard"; changes: AgentChange[] } | null>(null);
  const materialDetailsId=React.useId();
  const materialButtons=React.useRef<Record<string,HTMLButtonElement|null>>({});
  const [picked,setPicked]=React.useState<Record<string,boolean>>({});
  const [fields,setFields]=React.useState<Record<string,string[]>>({});
  const [localBusy,setBusy]=React.useState(false);
  const [saving,setSaving]=React.useState(()=>isAgentCommitting(runId));
  const [recordOpen,setRecordOpen]=React.useState(false);
  const [recordTab,setRecordTab]=React.useState<"steps"|"sources">("steps");
  const busy=localBusy||saving;
  const bridge=useEditorBridge(),{toast}=useToast();
  const tr=useT();
  const liveRunRef=React.useRef<string | null>(null);
  if(run?.status==="running") liveRunRef.current=run.id;
  const running=run?.status==="running";
  const validationStopped=run?.stoppedOnValidation || run?.summary.startsWith("同一条改动连续两次没有通过校验");
  const summary=displayAgentReply(validationStopped ? "" : run?.summary??"").split("\n").map(line=>tr(line)).join("\n");
  const showReply=Boolean(summary.trim() && (!running || run?.answering));
  const replyLength=useAgentReplyReveal(runId,showReply?summary:"",liveRunRef.current===runId);
  const revealing=showReply && replyLength<summary.length;
  const settled=!running && !revealing;
  const receive=React.useCallback((value:AgentRun)=>setRun(current=>!current||current.id!==value.id||value.updatedAt>=current.updatedAt?{...value}:current),[]);
  const refresh=React.useCallback(()=>{void apiGet<AgentRun>(`/api/ai/agent/${runId}?novelId=${encodeURIComponent(novelId)}`).then(receive).catch(e=>setError(e.message));},[runId,novelId,receive]);
  React.useEffect(()=>{if(initial)receive(initial);else refresh();},[initial,refresh,receive]);
  React.useEffect(()=>{
    const listen=(event:Event)=>{const value=(event as CustomEvent<AgentRun>).detail;if(value.id===runId)receive(value);};
    window.addEventListener(AGENT_UPDATED,listen);return()=>window.removeEventListener(AGENT_UPDATED,listen);
  },[runId,receive]);
  React.useEffect(()=>{
    const listen=()=>setSaving(isAgentCommitting(runId));
    listen();
    window.addEventListener(AGENT_COMMIT_CHANGED,listen);
    return()=>window.removeEventListener(AGENT_COMMIT_CHANGED,listen);
  },[runId]);
  // 任务一进入 ready 且带待确认正文候选就广播一次；写作区收到后自动打开内联 diff 审阅。
  // 只广播「刚就绪」的转换，避免刷新页面或回看旧会话时把历史候选自动弹出来。
  const readyBroadcastRef=React.useRef(new Set<string>());
  const lastStatusRef=React.useRef<AgentRun["status"]|null>(initial?.status??null);
  const hadInitialRef=React.useRef(Boolean(initial));
  React.useEffect(()=>{
    const previous=lastStatusRef.current;
    lastStatusRef.current=run?.status??null;
    if(!run||run.status!=="ready")return;
    if(previous!=="running"&&!(previous===null&&!hadInitialRef.current))return;
    if(!run.changes.some(c=>c.kind==="chapter"&&c.state==="pending"))return;
    // 用 ${run.id}:${updatedAt} 去重：同一版本经轮询/事件多次到达时不会重复广播。
    const key=`${run.id}:${run.updatedAt}`;
    if(readyBroadcastRef.current.has(key))return;
    readyBroadcastRef.current.add(key);
    broadcastRun(run);
  },[run]);
  useDataChanged(refresh,["agent"]);
  React.useEffect(()=>{if(run?.status!=="running"||disabled)return;const timer=window.setInterval(refresh,1500);return()=>window.clearInterval(timer);},[run?.status,disabled,refresh]);
  const mutate=async(action:()=>Promise<AgentRun>)=>{
    if(busy)return;setBusy(true);setError("");
    try{const result=await action();setRun(result);broadcastRun(result);}
    catch(e){const text=e instanceof Error?e.message:tr("操作失败");setError(text);toast({title:tr("改动未应用"),description:text,tone:"error"});}
    finally{setBusy(false);}
  };
  if(!run)return <div className="mt-3 text-[12px] text-ink-3">{error||tr("正在读取任务…")}{error?<Button size="sm" onClick={refresh}>{tr("重试")}</Button>:null}</div>;
  const pending=run.changes.filter(c=>c.state==="pending");
  const applied=run.changes.filter(c=>c.state==="applied");
  const live=run.changes.filter(c=>c.state!=="rejected"&&c.state!=="reverted");
  const materials=live.filter(c=>c.kind!=="chapter");
  const chapters=live.filter(c=>c.kind==="chapter");
  const discussion = run.status==="complete" && !run.changes.length && !run.error;
  const isPicked=(change:AgentChange)=>picked[change.id]??!change.evidence?.length;
  const apply=(changes:AgentChange[])=>mutate(async()=>{
    const result=await commitAgent(run,{selections:changes.map(c=>({id:c.id,fields:fields[c.id]}))},bridge);
    const chapter=result.changes.find(c=>changes.some(selected=>selected.id===c.id)&&c.kind==="chapter"&&c.state==="applied");
    const id=chapter?.appliedId||chapter?.targetId;
    if(id)window.dispatchEvent(new CustomEvent("yanfield:agent-navigate",{detail:{kind:"chapter",id}}));
    return result;
  });
  const selected=pending.filter(isPicked);
  const reviewMaterial=materials.find(c=>c.id===expandedMaterial);
  const applySelection=(changes:AgentChange[])=>{
    if(changes.some(c=>c.op==="delete"))setConfirmation({op:"delete",changes});
    else void apply(changes);
  };
  const navigateTo=(kind:AgentReference["kind"],id:string)=>{
    window.dispatchEvent(new CustomEvent("yanfield:agent-navigate",{detail:{kind,id,novelId:run.novelId}}));
  };
  const openTarget=(target:AgentReference & {changeId?:string})=>{
    const candidate=run.changes.find(c=>c.id===(target.changeId||target.id));
    if(candidate && (!candidate.appliedId||candidate.op==="delete")){
      if(candidate.kind==="chapter"){openAgentReview(run,candidate.id);return;}
      if(!materials.includes(candidate))return;
      setRecordOpen(false);
      setExpandedMaterial(candidate.id);
      window.requestAnimationFrame(()=>materialButtons.current[candidate.id]?.focus());
      return;
    }
    navigateTo(target.kind,candidate?.appliedId||target.id);
  };
  const chapterCard=(c:AgentChange)=>{
    const isPending=c.state==="pending";
    const afterWords=countWords(String(c.after.content||""));
    const beforeWords=c.before?countWords(String(c.before.content||"")):0;
    const delta=beforeWords?afterWords-beforeWords:afterWords;
    return <div key={c.id} className="border-t border-line/70 px-4 py-4">
      <div className="flex items-center gap-2">
        {isPending?<input aria-label={tr("选择{title}",{title:c.title})} type="checkbox" checked={isPicked(c)} disabled={busy||running||disabled} onChange={e=>setPicked(p=>({...p,[c.id]:e.target.checked}))}/>:<Check className="size-3 text-jade"/>}
        <button type="button" className="min-w-0 flex-1 truncate text-left font-serif text-[16px] tracking-[0.035em] text-ink" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{c.title||tr("章节正文")}</button>
        <span className="shrink-0 text-[10px] text-ink-3">{c.state==="applied"?tr("已应用"):c.state==="reverted"?tr("已撤回"):c.state==="rejected"?tr("已丢弃"):beforeWords?tr("修改"):tr("新建")}</span>
      </div>
      <div className="my-2 flex items-center justify-between text-[10px] text-ink-4">
        <span>{run.model}</span>
        <span className="tabular-nums">{beforeWords?tr("{before} → {after} 字",{before:beforeWords,after:afterWords}):tr("{count} 字",{count:afterWords})}{beforeWords?tr("（{delta}）",{delta:`${delta>0?"+":""}${delta}`}):""}</span>
      </div>
      <p className={`whitespace-pre-wrap font-serif text-[14px] leading-[2] text-ink-2 ${expanded===c.id?"":"line-clamp-5"}`}>{stripHtml(String(c.after.content||""))}</p>
      <button type="button" className="my-2 flex w-full items-center justify-center gap-1 text-[11px] text-ink-3" onClick={()=>setExpanded(expanded===c.id?null:c.id)}><ChevronDown className="size-3"/>{expanded===c.id?tr("收起"):tr("展开全文")}</button>
      {c.state==="applied"?<Button className="w-full justify-center border-accent/20 bg-accent/5 py-2 text-accent hover:bg-accent/10" size="sm" variant="secondary" icon={<BookOpen className="size-3"/>} disabled={running||busy||disabled} onClick={()=>openTarget({kind:"chapter",id:c.appliedId||c.targetId||c.id,title:c.title,changeId:c.id})}>{tr("打开正文 · 继续编辑")}</Button>:null}
      <Button className="mt-1 w-full justify-center" size="sm" variant="ghost" disabled={running||busy||disabled} onClick={()=>openAgentReview(run,c.id)}>{isPending?tr("在正文中审阅改动"):tr("查看历史改动")}</Button>
    </div>;
  };
  const materialChip=(c:AgentChange)=>{
    const title=c.title||tr(ENTITY_LABEL[c.kind]);
    const isOpen=reviewMaterial?.id===c.id;
    const Icon=entityIcons[c.kind as keyof typeof entityIcons]??BookOpen;
    const status=c.op==="delete"?(c.state==="applied"?tr("已删除"):tr("删除整条"))
      :c.state==="applied"?tr("已应用"):c.before?tr("修改"):tr("新建");
    return <div key={c.id} className={`inline-flex max-w-full items-center rounded-md border ${entityTone(c.kind)} ${isOpen?"ring-1 ring-current":""}`}>
      {c.state==="pending"?<input className="ml-2 size-3 shrink-0 accent-current" aria-label={tr("选择{title}",{title})} type="checkbox" checked={isPicked(c)} disabled={busy||running||disabled} onChange={e=>setPicked(p=>({...p,[c.id]:e.target.checked}))}/>:null}
      <button ref={node=>{materialButtons.current[c.id]=node;}} type="button" aria-expanded={isOpen} aria-controls={materialDetailsId}
        className="inline-flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-medium hover:bg-current/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current"
        title={tr("{kind} · {title}",{kind:`${status} · ${tr(ENTITY_LABEL[c.kind])}`,title})}
        onClick={()=>setExpandedMaterial(isOpen?null:c.id)}>
        <Icon aria-hidden className="size-3 shrink-0"/>
        <span className="truncate">{title}</span>
        {c.state==="applied"&&c.op!=="delete"?<Check aria-hidden className="size-3 shrink-0 text-jade"/>:null}
        {c.op==="delete"?<span className="shrink-0 text-[10px] text-danger">{status}</span>:null}
        <ChevronDown aria-hidden className={`size-3 shrink-0 opacity-65 ${isOpen?"rotate-180":""}`}/>
      </button>
    </div>;
  };
  const materialDetails=(c:AgentChange)=>{
    const isPending=c.state==="pending";
    const keys=Object.keys(c.after);
    const chosen=fields[c.id]??keys;
    const deleting=c.op==="delete";
    const title=c.title||tr(ENTITY_LABEL[c.kind]);
    const targetId=c.appliedId||c.targetId;
    return <div key={c.id} className="border-t border-line/60 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-[13px] font-medium text-ink">{title}</span>
        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] ${entityTone(c.kind)}`}>{tr(ENTITY_LABEL[c.kind])}</span>
        <span className="ml-auto shrink-0 text-[10px] text-ink-4">{c.state==="applied"?(deleting?tr("已删除"):tr("已应用")):c.state==="reverted"?tr("已撤回"):c.state==="rejected"?tr("已丢弃"):deleting?<span className="text-danger">{tr("删除整条")}</span>:c.before?tr("修改"):tr("新建")}</span>
      </div>
      {c.reason?<p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{c.reason}</p>:null}
      {deleting
        ? <div className="mt-2 rounded-lg border border-danger/20 bg-danger/[0.03] p-2.5 opacity-80"><MaterialPreview kind={c.kind as "character"|"world"|"location"|"foreshadow"} fields={c.before??{}} showTitle={false}/></div>
        : <div className="scroll-thin mt-2.5 max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {keys.map(key=><div key={key}>
              <label className="mb-1 flex items-center gap-1.5 text-[10.5px] text-ink-3">{isPending?<input type="checkbox" checked={chosen.includes(key)} disabled={busy||running||disabled} onChange={e=>setFields(p=>({...p,[c.id]:e.target.checked?[...chosen,key]:chosen.filter(k=>k!==key)}))}/>:null}{FIELD_LABEL[key]?tr(FIELD_LABEL[key]):key}</label>
              {c.before?<FieldChange before={c.before[key]} after={c.after[key]} format={key==="scenes"?displayScenes:display}/>:<p className="whitespace-pre-wrap break-words rounded-md border-l-2 border-jade/25 bg-jade/[0.035] px-2.5 py-2 text-[12px] leading-[1.85] text-ink-2">{(key==="scenes"?displayScenes:display)(c.after[key])}</p>}
            </div>)}
          </div>}
      {c.evidence?.length?<details className="mt-2 text-[11px] text-ink-3"><summary className="cursor-pointer">{tr("原文依据 · {count}",{count:c.evidence.length})}</summary><div className="mt-2 space-y-2">{c.evidence.map((e,i)=><blockquote key={i} className="border-l-2 border-jade/25 pl-2.5 leading-relaxed"><span className="mb-1 block text-[10px] text-jade">{e.field&&FIELD_LABEL[e.field]?`${tr(FIELD_LABEL[e.field])} · `:""}{e.title}{` · ${evidenceLabel(run,e)}`}</span>{e.quote}</blockquote>)}</div></details>:null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {isPending?<button type="button" className="text-[10px] text-ink-4 hover:text-danger" disabled={running||busy||disabled} onClick={()=>setConfirmation({op:"discard",changes:[c]})}>{tr("丢弃此项")}</button>:null}
        {targetId&&!deleting?<button type="button" className="inline-flex items-center gap-1 text-[11px] text-accent" onClick={()=>navigateTo(c.kind,targetId)}><FolderOpen className="size-3"/>{isPending?tr("打开原资料"):tr("打开资料")}</button>:null}
        {isPending?<Button className={`ml-auto ${deleting?"text-danger":""}`} size="sm" disabled={running||busy||disabled||(!deleting&&!chosen.length)} onClick={()=>applySelection([c])}>{deleting?tr("确认删除"):tr("应用此项")}</Button>:null}
      </div>
    </div>;
  };
  const chip=(target:AgentReference & {changeId?:string})=>{
    const Icon=entityIcons[target.kind as keyof typeof entityIcons]??BookOpen;
    return <button key={target.kind+target.id} type="button" title={tr("{kind} · {title}",{kind:tr(ENTITY_LABEL[target.kind]),title:target.title})} onClick={()=>openTarget(target)} className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors hover:brightness-95 focus-visible:outline-accent ${entityTone(target.kind)}`}>
    <Icon aria-hidden className="size-3 shrink-0"/>
    <span className="truncate">{target.title}</span><span className="shrink-0 text-[9px] opacity-70">{tr(ENTITY_LABEL[target.kind])}</span>
  </button>;
  };
  return <div className="min-w-0" data-testid="agent-run-card">
    <AgentProgress run={run} compact={!running || run.answering} renderTargets={step=>step.targets?.length?<div className="mt-1.5 flex flex-wrap gap-1.5">{step.targets.map(chip)}</div>:null}/>
    {(running || revealing) && run.references.length?<details className="px-1 py-1 text-[11px] text-ink-3"><summary className="cursor-pointer">{tr("已读取资料 · {count}",{count:run.references.length})}</summary><div className="my-2 flex flex-wrap gap-1.5">{run.references.map(chip)}</div></details>:null}
    {showReply?<AgentReply text={summary} length={replyLength}/>:null}
    {settled && validationStopped?<p className="px-1 py-1 text-[13px] leading-relaxed text-ink-2" role="status">{
      applied.length ? tr("已应用 {count} 项改动。", { count:applied.length })
        : pending.length ? tr("已准备 {count} 项候选，等待你确认。", { count:pending.length })
          : tr("本轮未生成可审阅的改动。可在执行记录里查看原因。")
    }</p>:null}
    {settled && run.recap && pending.length && !validationStopped && !materials.length ? <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
      <p>{tr("已准备 {count} 项候选，等待你确认。", { count: pending.length })}</p>
      <ul className="list-disc space-y-1 pl-4">
        {pending.slice(0, 4).map(change => {
          const fields = Object.keys(change.after).map(key => FIELD_LABEL[key]).filter(Boolean).map(key => tr(key));
          return <li key={change.id}>
            {tr(change.op === "delete" ? "删除" : change.before ? "修改" : "新建")} · {tr(ENTITY_LABEL[change.kind])}
            {change.title ? ` · ${change.title}` : ""}
            {fields.length ? `（${fields.join("、")}）` : ""}
          </li>;
        })}
      </ul>
    </div> : null}
    {settled && chapters.length ? <div className="mt-3 overflow-hidden rounded-lg border border-line/80 bg-surface fade-in">{chapters.map(chapterCard)}</div> : null}
    {settled && materials.length ? <section aria-label={tr("资料改动")} className="mt-3 rounded-lg border border-line/80 bg-surface fade-in">
      <div className="px-3 py-2.5">
        <div className="mb-1.5 text-[11px] text-ink-3">{materials.some(c=>c.state==="pending")?tr("资料待确认"):tr("资料改动")} <span className="text-ink-4">· {tr("{count} 项",{count:materials.length})}</span></div>
        <div className="flex flex-wrap gap-1.5">{materials.map(materialChip)}</div>
      </div>
      <div id={materialDetailsId} hidden={!reviewMaterial}>{reviewMaterial && materialDetails(reviewMaterial)}</div>
    </section> : null}
    {settled && (run.steps.length || run.references.length || applied.length) ? <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
      {run.steps.length || run.references.length ? <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={()=>{setRecordTab(run.steps.length?"steps":"sources");setRecordOpen(true);}}>
        {tr("执行记录")}<span className="tabular-nums text-ink-4">{run.steps.length || run.references.length}</span>
      </Button>:null}
      {applied.length?<Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={disabled||busy} icon={<RotateCcw className="size-3"/>} onClick={()=>void mutate(()=>commitAgent(run,{op:"undo"},bridge))}>{tr("撤回本轮")}</Button>:null}
    </div>:null}
    {recordOpen?<Sheet open onClose={()=>setRecordOpen(false)} title={tr("执行记录")} width={440}>
      <div className="px-4 py-3">
        <div role="group" aria-label={tr("执行记录")} className="mb-4 flex gap-2 border-b border-line">
          <Button variant="ghost" size="sm" aria-pressed={recordTab==="steps"} onClick={()=>setRecordTab("steps")}>{tr("工具状态")} · {run.steps.length}</Button>
          <Button variant="ghost" size="sm" aria-pressed={recordTab==="sources"} onClick={()=>setRecordTab("sources")}>{tr("已读取资料 · {count}",{count:run.references.length})}</Button>
        </div>
        {recordTab==="steps" ?
        <ol className="my-2 space-y-3 border-l border-line pl-3">{run.steps.map((step,index)=><li key={step.id}>
          <div className={`flex items-center gap-1.5 text-[12px] ${step.status==="error"?"text-danger":"text-ink-3"}`}>
            {step.status==="running"?<Loader2 className="size-3 animate-spin"/>:step.status==="error"?<CircleAlert className="size-3"/>:<Check className="size-3"/>}
            <span>{tr(step.label)}</span>
          </div>
          {step.targets?.length?<div className="mt-1.5 flex flex-wrap gap-1.5">{step.targets.map(chip)}</div>:null}
          {step.detail && (step.detailValues || step.status==="error" || step.detail!==run.steps[index-1]?.detail)?<p className="mt-1 whitespace-pre-line leading-relaxed text-ink-4">{tr(step.detail, step.detailValues && {
            ...step.detailValues,
            ...(typeof step.detailValues.kind === "string" ? { kind: tr(step.detailValues.kind) } : {}),
          })}</p>:null}
        </li>)}</ol> : <div className="flex flex-wrap gap-1.5">{run.references.map(chip)}</div>}
      </div>
    </Sheet>:null}
    {error||run.error?<p role="alert" className="mx-3 mb-3 rounded bg-danger/5 p-2 text-[11px] leading-relaxed text-danger"><CircleAlert className="mr-1 inline size-3"/>{error||run.error}</p>:null}
    {run.errorCode?<details className="mx-3 mb-3 rounded-md border border-line p-2 text-[11px] text-ink-3">
      <summary className="cursor-pointer">{tr("调试详情 · {detail}",{detail:run.errorCode||(run.diagnostics?.length?tr("已自动修复的协议错误"):tr("旧任务未记录错误码"))})}</summary>
      <p className="mt-2 break-all">{tr("任务 ID：{id}",{id:run.id})}</p>
      <p className="mt-1">{tr("模型：{provider} / {model}",{provider:run.provider,model:run.model})}</p>
      {run.error && !run.errorCode && !run.diagnostics?.length?<p className="mt-2">{tr("此任务由旧版执行器生成，没有保存原始返回或具体校验错误，无法补回历史调试详情。更新后的新任务会记录这些信息。")}</p>:null}
      <p className="mt-1">{tr("以下仅包含模型返回的脱敏片段和校验结果，不包含请求密钥。预览可能含作品内容。")}</p>
      {run.diagnostics?.map((diagnostic,index)=><details key={index} className="mt-2 border-t border-line pt-2">
        <summary className="cursor-pointer">{tr("第 {round} 轮 · 第 {attempt} 次 · {code} · {chars} 字符",{round:diagnostic.round,attempt:diagnostic.attempt,code:diagnostic.code,chars:diagnostic.responseChars})}</summary>
        <ul className="my-2 space-y-1">{diagnostic.issues.map((issue,i)=><li key={i} className="break-words">{issue.path} · {issue.code}：{issue.message}</li>)}</ul>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 p-2">{diagnostic.responsePreview}{diagnostic.responseTail?"\n"+tr("…[中间省略]…")+"\n"+diagnostic.responseTail:""}</pre>
      </details>)}
      <button type="button" className="mt-2 text-accent underline" onClick={async()=>{try{await copyText(JSON.stringify({runId:run.id,errorCode:run.errorCode,model:run.model,provider:run.provider,diagnostics:run.diagnostics},null,2));toast({title:tr("已复制调试信息"),tone:"success"});}catch{toast({title:tr("复制失败，请手动选中调试详情"),tone:"error"});}}}>{tr("复制调试信息")}</button>
    </details>:null}
    {settled && !discussion && pending.length?<div className="mt-2 flex flex-wrap items-center gap-2">
      {pending.length?<Button variant="primary" size="sm" className="min-h-9 flex-1 justify-center shadow-none" loading={busy} disabled={disabled||!selected.length||selected.some(c=>fields[c.id]?.length===0)} onClick={()=>applySelection(selected)}>{tr("应用选中的 {count} 项",{count:selected.length})}{selected.some(c=>c.op==="delete")?tr("（含删除 {count}）",{count:selected.filter(c=>c.op==="delete").length}):""}</Button>:null}
      {onContinue && pending.length?<button type="button" className="text-[11px] text-ink-3 hover:text-accent" disabled={busy||disabled} onClick={()=>onContinue(tr("请基于这份候选继续修改："), runId)}>{tr("继续修改")}</button>:null}
    </div>:null}
    {confirmation?<ConfirmDialog open danger
      title={tr(confirmation.op==="delete"?"确认删除":"丢弃此项")}
      description={confirmation.op==="delete"
        ?tr("应用这些改动将删除 {count} 条资料。应用后可以撤回本轮。",{count:confirmation.changes.filter(c=>c.op==="delete").length})
        :tr("丢弃「{title}」的候选改动？",{title:confirmation.changes[0].title||tr(ENTITY_LABEL[confirmation.changes[0].kind])})}
      confirmText={confirmation.op==="delete"?"确认删除":"丢弃此项"}
      onClose={()=>setConfirmation(null)}
      onConfirm={()=>{
        setConfirmation(null);
        if(confirmation.op==="delete")void apply(confirmation.changes);
        else {
          setExpandedMaterial(null);
          void mutate(()=>apiPatch<AgentRun>(`/api/ai/agent/${run.id}`,{op:"reject",changeId:confirmation.changes[0].id,novelId:run.novelId}));
        }
      }}/>:null}
  </div>;
}
