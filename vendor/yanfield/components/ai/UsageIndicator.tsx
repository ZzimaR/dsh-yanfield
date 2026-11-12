"use client";
import * as React from "react";
import { Coins, Database, Gauge } from "lucide-react";
import { estimateAiCost, formatCny, type TokenPrice } from "@/lib/ai/cost";
import { inputBreakdown } from "@/lib/ai/cache-usage";
import type { AiUsage } from "@/lib/types";
import { formatTokens } from "./utils";

export function UsageIndicator({promptTokens,completionTokens,price,calls,latencyMs,iconOnly=false,label="本次",reportedCost,estimatedTokens,cachedInputTokens,cacheReportedInputTokens}:{promptTokens:number;completionTokens:number;price:TokenPrice;calls?:number;latencyMs?:number;iconOnly?:boolean;label?:string;reportedCost?:AiUsage["reportedCost"];estimatedTokens?:boolean;cachedInputTokens?:number;cacheReportedInputTokens?:number}) {
  const [open,setOpen]=React.useState(false);
  const ref=React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  const total=promptTokens+completionTokens,cost=estimateAiCost(promptTokens,completionTokens,price,{cachedInputTokens,cacheReportedInputTokens});
  const cache=inputBreakdown(promptTokens,{cachedInputTokens,cacheReportedInputTokens});
  const actual=reportedCost?.complete?reportedCost:undefined;
  const reportedLabel=(value:NonNullable<AiUsage["reportedCost"]>)=>`${value.currency==="USD"?"US$":"¥"}${value.amount.toLocaleString("en-US",{maximumFractionDigits:6})}`;
  const costText=actual?`接口 ${reportedLabel(actual)}`:cost===null?"费用未知":`预估 ${formatCny(cost)}`;
  return <div ref={ref} className="relative min-w-0">
    <button type="button" aria-label={`查看${label}用量与费用`} aria-expanded={open} onClick={()=>setOpen(!open)} className="flex h-6 items-center gap-1.5 whitespace-nowrap rounded px-1 text-[10px] tabular-nums text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
      <Database className="size-3" strokeWidth={1.5}/>{iconOnly?null:<><span>{formatTokens(total)} tok</span><span className="mx-1 text-line-strong">·</span><Coins className="size-3" strokeWidth={1.5}/><span>{costText}</span></>}
    </button>
    {open?<div className="absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-4 text-[12px] text-ink-2 shadow-float" role="dialog" aria-label={`${label}用量明细`}>
      <p className="mb-3 font-medium text-ink">{label}用量</p>
      <dl className="space-y-2 tabular-nums">{[["输入总量",`${promptTokens.toLocaleString()} tokens`],...(cacheReportedInputTokens!==undefined?[[cache.unknown>0?"已报告部分命中率":"缓存命中率",cache.reported>0?`${(100*cache.cached/cache.reported).toFixed(1)}%`:"—"],["缓存命中",`${cache.cached.toLocaleString()} tokens`],["缓存未命中",`${cache.uncached.toLocaleString()} tokens`]]:[]),...(cache.unknown>0?[["缓存未报告",`${cache.unknown.toLocaleString()} tokens`]]:[]),["输出",`${completionTokens.toLocaleString()} tokens`],...(calls!==undefined?[["调用",`${calls} 次`]]:[]),...(latencyMs?[["耗时",`${(latencyMs/1000).toFixed(1)} 秒`]]:[]),[actual?"接口费用":"预估费用",actual?reportedLabel(actual):cost===null?(cache.cached>0&&price.cachedInputPerMillion==null?"未设置缓存单价":"未设置单价"):formatCny(cost)],...(reportedCost&&!actual?[["接口部分费用",reportedLabel(reportedCost)]]:[])].map(([key,value])=><div key={key} className="flex justify-between gap-3"><dt className="text-ink-3">{key}</dt><dd>{value}</dd></div>)}</dl>
      <p className="mt-3 border-t border-line pt-2 text-[10px] leading-relaxed text-ink-4">{label==="今日"?"今日合计按 token 与配置单价预估，每次调用的接口费用见消息用量。":actual?"费用由服务商接口返回，保留原币种。":reportedCost?"部分调用未返回费用，不能视为本轮完整账单。预估按设置中的单价计算。":"接口未提供可识别费用，预估按设置中的单价计算。"}{cache.unknown>0?" 未报告缓存的输入按普通单价估算，不能作为实付金额。":""}{cache.cached>0&&price.cachedInputPerMillion==null?" 缓存命中单价尚未配置。":""}{estimatedTokens?" Token 也是本地估算。":label==="今日"?" 日累计可能包含本地估算的 token。":""}</p>
    </div>:null}
  </div>;
}

export function ContextStatus({tokens,budget,onClick,loading,error}:{tokens:number;budget:number;onClick:()=>void;loading?:boolean;error?:string|null}) {
  return <button type="button" aria-label="查看上下文用量" title={error||`预计上下文 ${formatTokens(tokens)} / ${budget>0?formatTokens(budget):"不限"} tokens`} onClick={onClick} className="ml-auto flex h-6 shrink-0 items-center gap-1.5 px-1 text-[10px] tabular-nums text-ink-3 hover:text-ink"><Gauge className="size-3" strokeWidth={1.5}/>{loading?"…":error?"—":budget>0?`${Math.round(tokens/budget*100)}%`:"不限"}</button>;
}
