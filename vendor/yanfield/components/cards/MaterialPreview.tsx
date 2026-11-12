import { Bookmark, MapPin, UserRound } from "lucide-react";
import { CHARACTER_ROLE_LABEL, WORLD_CATEGORY_LABEL, WORLD_IMPORTANCE_LABEL, FORESHADOW_STATUS_LABEL } from "@/lib/types";
import { stripHtml } from "@/lib/ui/cn";
import type { Fields } from "@/lib/ai/agent/types";

/** Shared preview for saved materials and agent candidates. */
export function MaterialPreview({kind,fields,showTitle=true}:{kind:"character"|"world"|"foreshadow";fields:Fields;showTitle?:boolean}) {
  const text=(key:string)=>typeof fields[key]==="string"?stripHtml(String(fields[key])):"";
  const Icon=kind==="character"?UserRound:kind==="world"?MapPin:Bookmark;
  const title=text("name")||text("title");
  const description=kind==="character"?text("identity"):kind==="world"?text("summary")||text("content"):text("description");
  const category=kind==="character"?CHARACTER_ROLE_LABEL[text("role") as keyof typeof CHARACTER_ROLE_LABEL]:kind==="world"?WORLD_CATEGORY_LABEL[text("category") as keyof typeof WORLD_CATEGORY_LABEL]:FORESHADOW_STATUS_LABEL[text("status") as keyof typeof FORESHADOW_STATUS_LABEL];
  const importance=kind==="world"&&WORLD_IMPORTANCE_LABEL[text("importance") as keyof typeof WORLD_IMPORTANCE_LABEL];
  const badges=[category,importance?`重要·${importance}`:"",...(kind==="character"?[text("gender"),text("age")]:[])];
  const tags=(Array.isArray(fields.tags)?fields.tags.filter((t):t is string=>typeof t==="string"):[]).slice(0,3);
  const facts=kind==="character"?[["性格",text("personality")],["目标",text("goals")],["近况",text("currentState")],["口吻",text("speechStyle")]].filter(([,value])=>value).slice(0,2):[];
  return <span className="flex min-w-0 items-start gap-3" data-testid="material-preview">
    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border ${kind==="character"?"border-[#9a83a0]/15 bg-[#9a83a0]/10 text-[#88718f] dark:text-[#baa7c1]":kind==="world"?"border-jade/15 bg-jade/10 text-jade":"border-gold/20 bg-gold/10 text-gold"}`}><Icon className="size-4" strokeWidth={1.5}/></span>
    <span className="block min-w-0 flex-1">
      {showTitle?<span className="mb-1 block truncate font-serif text-[14px] font-semibold leading-6 text-ink">{title}</span>:null}
      {description?<span className="line-clamp-2 text-[12px] leading-[1.8] text-ink-2">{description}</span>:<span className="text-[11px] text-ink-4">尚未填写资料</span>}
      {[...badges,...tags].filter(Boolean).length?<span className="mt-2 flex flex-wrap gap-1">{[...badges,...tags].filter(Boolean).slice(0,4).map((b,i)=><span key={i} className="max-w-full truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] leading-4 text-ink-3">{b}</span>)}</span>:null}
      {facts.length?<span className="mt-2 block space-y-1 text-[11px] leading-[1.7] text-ink-3">{facts.map(([label,value])=><span key={label} className="line-clamp-2"><span className="mr-1.5 text-ink-4">{label}</span>{value}</span>)}</span>:null}
    </span>
  </span>;
}
