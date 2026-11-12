"use client";
import * as React from "react";
import {ChevronDown,Compass,Eraser,Gauge,Layers,ListTree,PenLine,Sparkles} from "lucide-react";
import {Button,Dropdown,useToast} from "@/components/ui/kit";
import {useEditorBridge} from "@/lib/editor/bridge";
import {handToAssistant} from "@/lib/editor/hand-off";
import type {AiFeature,ContextConfig} from "@/lib/types";
import {cn} from "@/lib/ui/cn";

interface TaskDef {
  key: string;
  feature: AiFeature;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** 需要选中正文才能执行 */
  needsSelection?: boolean;
  targetWords?: number;
  instruction?: string;
}

const TASKS: TaskDef[] = [
  {
    key: "continue",
    feature: "continue",
    label: "续写",
    hint: "基于最近正文承接续写约 600 字",
    icon: <PenLine className="size-3.5" />,
    targetWords: 600,
  },
  {
    key: "expand",
    feature: "expand",
    label: "扩写",
    hint: "把选中的段落扩写得更丰满（需选中正文）",
    icon: <Layers className="size-3.5" />,
    needsSelection: true,
    targetWords: 800,
  },
  {
    key: "polish",
    feature: "polish",
    label: "润色",
    hint: "润色选中段落，保持原意与人物口吻（需选中正文）",
    icon: <Sparkles className="size-3.5" />,
    needsSelection: true,
  },
  {
    key: "deai",
    feature: "deai",
    label: "去 AI 味",
    hint: "改写选中段落，去除 AI 腔调与套话（需选中正文）",
    icon: <Eraser className="size-3.5" />,
    needsSelection: true,
  },
  {
    key: "diagnose",
    feature: "diagnose",
    label: "诊断",
    hint: "体检当前章节：节奏、冲突、人物一致性与伏笔",
    icon: <Gauge className="size-3.5" />,
  },
  {
    key: "plot",
    feature: "custom",
    label: "剧情推演",
    hint: "推演接下来 3–5 章的剧情走向",
    icon: <Compass className="size-3.5" />,
    instruction:
      "请基于本书总纲、当前卷纲、本章章纲、人物档案与最近正文，推演接下来 3–5 章的剧情走向。要求：每章给出核心冲突、关键转折、伏笔回收/埋设与情绪曲线；只输出规划，不要写正文散文。",
  },
  {
    key: "outline",
    feature: "outline-chapter",
    label: "章纲",
    hint: "为当前章节生成或补全章纲",
    icon: <ListTree className="size-3.5" />,
  },
];

export interface AiTaskBarProps {
  novelId:string;chapterId?:string|null;selection?:string;compact?:boolean;
  context?:Partial<ContextConfig>;className?:string;
}
/** All shortcuts use the same agent, proposal, and review workflow as the chat panel. */
export function AiTaskBar({chapterId,selection,className}:AiTaskBarProps) {
  const bridge=useEditorBridge(),{toast}=useToast();
  const run=(task:TaskDef)=>{
    const selected=(selection??bridge?.getSelectionText()??"").trim();
    if(task.needsSelection&&!selected){toast({title:"先在正文中选中要处理的段落",tone:"error"});return;}
    const instruction=task.feature==="continue"?"承接当前章末尾续写约600字，追加到本章，不新建下一章。":task.needsSelection?`${task.label}当前选中的段落，保持其余正文和人物事实不变。`:task.instruction||task.hint;
    handToAssistant({reference:chapterId?{type:"chapter",id:chapterId,label:"当前章节"}:null,taskId:`shortcut-${task.key}`,taskLabel:task.label,prompt:instruction,selection:selected||undefined,autoSend:true});
  };
  return <Dropdown align="start" width={236} trigger={<Button className={cn("h-7 gap-1.5 px-2 text-[11px] text-accent",className)} size="sm" variant="ghost" aria-label="AI 快捷任务" aria-haspopup="menu" disabled={!chapterId} icon={<Sparkles className="size-3.5"/>}>AI 助手<ChevronDown className="size-3"/></Button>} items={TASKS.map(task=>({label:task.label,icon:task.icon,disabled:!chapterId,onSelect:()=>run(task)}))}/>;
}
