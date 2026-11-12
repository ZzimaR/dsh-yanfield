"use client";
import * as React from "react";
import { cn } from "@/lib/ui/cn";

type Tab="content"|"links"|"settings";
const TabContext=React.createContext<Tab>("content");
function sectionTab(title:string):Tab {
  return /可见|揭示/.test(title)?"settings":/^(关系|标签|章节)$/.test(title)?"links":"content";
}

export function CardEditorDocument({children}:{children:React.ReactNode}) {
  const [tab,setTab]=React.useState<Tab>("content");
  const nodes=React.Children.toArray(children);
  const hero=nodes.filter(node=>React.isValidElement(node)&&node.type===CardEditorHero);
  const rest=nodes.filter(node=>!React.isValidElement(node)||node.type!==CardEditorHero);
  const available=new Set<Tab>(["content"]);
  for(const node of rest)if(React.isValidElement<{title?:string}>(node)&&node.type===CardEditorSection)available.add(sectionTab(node.props.title||""));
  return <TabContext.Provider value={tab}><div className="card-document">
    {hero}
    <div role="tablist" aria-label="资料编辑分类" className="sticky top-0 z-10 flex gap-6 border-b border-line bg-surface px-7">
      {([["content","资料"],["links","关联与标签"],["settings","选项"]] as const).filter(([key])=>available.has(key)).map(([key,label])=><button type="button" key={key} role="tab" aria-selected={tab===key} onClick={()=>setTab(key)} className={cn("-mb-px border-b-2 py-3 text-[12px] transition-colors",tab===key?"border-accent font-medium text-ink":"border-transparent text-ink-3 hover:text-ink")}>{label}</button>)}
    </div>
    <div role="tabpanel" className="px-7 pb-6 pt-1">{rest}</div>
  </div></TabContext.Provider>;
}

export function CardEditorHero({kind,value,onChange,subtitle,actions}:{kind:string;value:string;onChange:(value:string)=>void;subtitle:string;actions:React.ReactNode}) {
  return <header className="px-7 pb-5 pt-6">
    <div className="mb-4 flex items-center justify-between gap-3"><div className="-ml-3 flex items-center text-ink-3">{actions}</div><span className="text-[10px] tracking-[0.12em] text-ink-4">{kind} / 资料档案</span></div>
    <input aria-label={kind==="角色"?"姓名":"标题"} value={value} onChange={e=>onChange(e.target.value)} placeholder={`未命名${kind}`} className="card-document-title w-full bg-transparent font-serif text-[28px] leading-[1.4] tracking-wide text-ink outline-none placeholder:text-ink-4"/>
    <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{subtitle}</p>
  </header>;
}

export function CardEditorSection({title,hint,children}:{title:string;hint?:string;children:React.ReactNode}) {
  const tab=React.useContext(TabContext);
  if(sectionTab(title)!==tab)return null;
  const fields=React.Children.toArray(children);
  const single=fields.length===1&&React.isValidElement<{label?:string}>(fields[0])&&fields[0].props.label===title;
  return <section className="card-document-section border-b border-line/70 py-5 last:border-0">
    {single?null:<h3 className="mb-4 text-[12px] font-semibold tracking-wide text-ink" title={hint}>{title}</h3>}
    <div className="space-y-4">{children}</div>
  </section>;
}
