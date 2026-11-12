import type { AiUsage, ContextConfig } from "@/lib/types";

export type EntityKind = "chapter" | "blueprint" | "character" | "world" | "foreshadow" | "outline" | "volume-outline";
export type Fields = Record<string, unknown>;
export interface AgentChange {
  id: string;
  kind: EntityKind;
  /** Omitted for create/update. Delete only targets saved characters, settings and foreshadows. */
  op?: "delete";
  targetId: string | null;
  title: string;
  reason: string;
  evidence?: {sourceId:string;title:string;quote:string;candidate:boolean}[];
  before: Fields | null;
  after: Fields;
  /** Full saved entity used for optimistic concurrency and safe undo. */
  saved?: Fields;
  appliedId?: string;
  state: "pending" | "applied" | "rejected" | "reverted";
}
export interface AgentStep { id: string; label: string; detail: string; status: "running" | "complete" | "error"; tool?:string; targets?: (AgentReference & {changeId?:string})[] }
export interface AgentReference { kind: EntityKind; id: string; title: string }
export interface AgentDiagnostic {
  code:"AGENT_JSON_INVALID"|"AGENT_SCHEMA_INVALID";
  stage:"decision";round:number;attempt:number;responseChars:number;
  issues:{path:string;code:string;message:string}[];
  responsePreview:string;responseTail?:string;createdAt:string;
}
export interface AgentRun {
  id: string; novelId: string; chapterId: string | null; request: string;
  sessionId?:string; messageId?:string;
  status: "running" | "ready" | "complete" | "aborted" | "error";
  errorCode?:string; diagnostics?:AgentDiagnostic[];
  progress?: {id:string;text:string;stepIndex:number}[];
  materialPolicy?: "auto" | "skip";
  summary: string; error: string; steps: AgentStep[]; changes: AgentChange[];
  references: AgentReference[]; usage: AiUsage; model: string; provider: string;
  preview: string; createdAt: string; updatedAt: string;
}
export interface AgentRequest {
  novelId: string; chapterId?: string | null; message: string;
  sessionId?:string; agentId?:import("@/lib/types").AgentId;
  context?: Partial<ContextConfig>;
  history?: { role: "user" | "assistant"; content: string }[];
  previousRunId?: string;
  retryRunId?: string;
  snapshot?:{kind:"world"|"character"|"foreshadow";id:string|null;fields:Fields};
  mentions?: { type: string; id: string; label: string }[];
  selection?: string;
}
export const ENTITY_LABEL: Record<EntityKind, string> = {
  chapter: "正文", blueprint: "章纲", character: "角色", world: "设定", foreshadow: "伏笔", outline: "总纲", "volume-outline": "卷纲",
};
export const FIELD_LABEL: Record<string, string> = {
  title: "标题", name: "姓名", content: "正文", summary: "摘要", identity: "身份", appearance: "外貌",
  personality: "性格", goals: "目标", secrets: "秘密", arc: "人物弧光", speechStyle: "说话风格",
  currentState: "当前状态", gender: "性别", age: "年龄", role: "定位", aliases: "别名", tags: "标签",
  category: "分类", importance: "重要程度", parentId: "所属设定", description: "描述", notes: "备注", status: "状态",
  goal: "章节目标", pov: "视角", conflict: "核心冲突", emotionalArc: "情绪曲线", scenes: "分场",
  plotPoints: "情节节点", hooks: "钩子", targetWords: "目标字数", premise: "一句话故事", theme: "主题",
  tone: "基调", mainPlot: "主线", subplots: "支线", characterArcs: "人物弧光", worldRules: "世界规则",
  ending: "结局", arcGoal: "卷目标", keyEvents: "关键事件", foreshadowPlan: "伏笔计划", volumeId: "所属卷", orderIndex: "排序",
};
