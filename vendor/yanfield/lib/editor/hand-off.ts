/** 设定卡把材料和任务交给写作台右侧的同一个助手。先填进输入框，不自动发送。 */

export const HAND_OFF_EVENT = "yanfield:hand-off";

export interface HandOffReference {
  type: "character" | "world" | "chapter" | "archive" | "foreshadow";
  id: string;
  label: string;
}

export interface HandOffDetail {
  reference: HandOffReference | null;
  taskId: string;
  taskLabel: string;
  selection?:string;
  autoSend?:boolean;
  referenceOnly?:boolean;
  prompt: string;
  snapshot?:{kind:"world"|"character"|"foreshadow";id:string|null;fields:Record<string,unknown>};
}

let pending: HandOffDetail | null = null;

export function handToAssistant(detail: HandOffDetail): void {
  pending = detail;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HAND_OFF_EVENT));
}

export function takeHandOff(): HandOffDetail | null {
  const detail = pending;
  pending = null;
  return detail;
}

export function referenceCardInAssistant(kind:"character"|"world"|"foreshadow",id:string|null,label:string,fields:Record<string,unknown>):void {
  handToAssistant({reference:id?{type:kind,id,label}:null,referenceOnly:true,taskId:"reference-card",taskLabel:`未保存资料 · ${label}`,prompt:"",snapshot:{kind,id,fields}});
}

export const WORLD_HANDOFF_TASKS = [
  {
    id: "derive-world",
    label: "衍生相关设定",
    prompt:
      "围绕当前材料衍生数条具体、可挑选的相关设定。每条给出名称、类型、内容。州挂在国下，城挂在州下。邻国用相邻，不挂到本国下面。没有名字的人不建卡。",
  },
  {
    id: "fill-world",
    label: "完善当前设定",
    prompt: "只完善这张设定卡自己的摘要和正文，保留已写出的事实，不要把别的地点展开成新卡。",
  },
] as const;

export const CHARACTER_HANDOFF_TASKS = [
  {
    id: "derive-character",
    label: "衍生相关角色",
    prompt:
      "围绕当前角色，把文中其他有名字、有戏的人衍生出来。每个给出姓名、定位、身份、与当前角色的关系。没有名字的人不建卡。",
  },
  {
    id: "fill-character",
    label: "完善当前角色",
    prompt: "只完善这张角色卡自己的身份、性格、当前状态，保留已写出的事实，不要新增别的人。",
  },
] as const;

export const FORESHADOW_HANDOFF_TASKS = [
  {
    id: "derive-foreshadow",
    label: "衍生相关伏笔",
    prompt:
      "围绕当前伏笔，把文中其他能勾住读者的线索衍生出来。每条给出标题、埋了什么、打算怎么收。",
  },
  {
    id: "fill-foreshadow",
    label: "完善当前伏笔",
    prompt: "只完善这条伏笔自己的描述和备注，保留已写出的事实。",
  },
] as const;
