import type { AiUsage, ContextConfig } from "@/lib/types";

export type EntityKind = "chapter" | "blueprint" | "character" | "world" | "location" | "foreshadow" | "outline" | "volume-outline";
export type Fields = Record<string, unknown>;
export type ChapterPosition = { id: string; volumeId: string | null; orderIndex: number }
export interface ChapterSplit {
  title: string
  content: string
  existing?: import("@/lib/types").Chapter
  saved?: import("@/lib/types").Chapter
  orderBefore: ChapterPosition[]
  orderAfter?: ChapterPosition[]
}
export type ChapterDirectoryAction =
  | { kind: "move"; anchorId: string; anchorTitle: string; placement: "before" | "after"; volumeId: string | null; orderBefore: ChapterPosition[]; orderAfter?: ChapterPosition[] }
  | { kind: "rename" }
  | { kind: "delete"; orderBefore: ChapterPosition[]; orderAfter?: ChapterPosition[]; blockers: string[] }
export type ChapterPairAction = {
  second: import("@/lib/types").Chapter
  firstLinks: string[]
  moved: string
} & (
  | { kind: "merge"; blockers: string[]; orderBefore: ChapterPosition[]; orderAfter?: ChapterPosition[] }
  | { kind: "transfer"; nextContent: string; saved?: import("@/lib/types").Chapter }
)
export interface ChapterBatchAction {
  volumeId: string | null
  orderBefore: ChapterPosition[]
  orderAfter: ChapterPosition[]
  titles: Record<string, string>
  entries: {
    before: import("@/lib/types").Chapter
    after: { title?: string; summary?: string; content?: string }
    saved?: import("@/lib/types").Chapter
    duplicateIn?: import("@/lib/types").Chapter
    removedBlocks?: number
    removedText?: string
    transitions?: Partial<Record<"start" | "end", string>>
    proseBase?: string
  }[]
}
export interface AgentChange {
  id: string;
  kind: EntityKind;
  /** Omitted for create/update. Chapter deletion also records its directory position. */
  op?: "delete";
  chapterSplit?: ChapterSplit;
  chapterDirectory?: ChapterDirectoryAction;
  chapterPair?: ChapterPairAction;
  chapterBatch?: ChapterBatchAction;
  targetId: string | null;
  title: string;
  reason: string;
  evidence?: {field?:string;sourceId:string;title:string;quote:string;candidate:boolean}[];
  before: Fields | null;
  after: Fields;
  /** Full saved entity used for optimistic concurrency and safe undo. */
  saved?: Fields;
  appliedId?: string;
  state: "pending" | "applied" | "rejected" | "reverted";
}
export function isChapterOperation(change: AgentChange): boolean {
  return Boolean(change.chapterSplit || change.chapterDirectory || change.chapterPair || change.chapterBatch)
}
export interface AgentStep { id: string; label: string; detail: string; detailValues?: Record<string, string | number>; status: "running" | "complete" | "partial" | "error"; issues?: { title: string; message: string; fields?: { path: string; message: string }[] }[]; tool?:string; targets?: (AgentReference & {changeId?:string})[] }
export interface AgentReference { kind: EntityKind; id: string; title: string }
export interface AgentThought {
  id: string
  stepIndex: number
  withinStep?: boolean
  text: string
}
export interface AgentDiagnostic {
  code:"AGENT_JSON_INVALID"|"AGENT_SCHEMA_INVALID";
  stage:"decision";round:number;attempt:number;responseChars:number;
  issues:{path:string;code:string;message:string}[];
  responsePreview:string;responseTail?:string;createdAt:string;
}
export interface AgentRun {
  id: string; novelId: string; chapterId: string | null; request: string;
  sessionId?:string; messageId?:string;
  requestContext?: Pick<AgentRequest, "chapterId" | "agentId" | "context" | "mentions" | "selection" | "selectionReference" | "snapshot" | "previousRunId" | "writingPreset" | "locale">;
  status: "running" | "ready" | "complete" | "aborted" | "error";
  errorCode?:string; diagnostics?:AgentDiagnostic[];
  progress?: {id:string;text:string;stepIndex:number}[];
  thoughts?: AgentThought[];
  linkTitles?: Record<string, string>;
  materialPolicy?: "auto" | "skip";
  summary: string; error: string; steps: AgentStep[]; changes: AgentChange[];
  recap?: boolean;
  incomplete?: number;
  stoppedOnValidation?: boolean;
  answering?: boolean;
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
  writingPreset?: "continue" | "expand" | "polish" | "deai";
  locale?: "zh" | "en";
  snapshot?:{kind:"world"|"character"|"location"|"foreshadow";id:string|null;fields:Fields};
  mentions?: { type: string; id: string; label: string }[];
  selection?: string;
  selectionReference?: import("@/lib/editor/selection-reference").SelectionReference;
}
export const ENTITY_LABEL: Record<EntityKind, string> = {
  chapter: "正文", blueprint: "章纲", character: "角色", world: "设定", location: "地点", foreshadow: "伏笔", outline: "总纲", "volume-outline": "卷纲",
};
export const FIELD_LABEL: Record<string, string> = {
  title: "标题", name: "姓名", content: "正文", summary: "摘要", identity: "身份", appearance: "外貌",
  personality: "性格", goals: "目标", secrets: "秘密", arc: "人物弧光", speechStyle: "说话风格",
  currentState: "当前状态", gender: "性别", age: "年龄", role: "定位", aliases: "别名", tags: "标签",
  category: "分类", importance: "重要程度", parentId: "所属设定", description: "描述", notes: "备注", status: "状态",
  kind: "地点类型", sensory: "感官", layout: "空间", occupants: "常驻", rules: "此地规矩", storyRole: "叙事作用",
  goal: "章节目标", pov: "视角", conflict: "核心冲突", emotionalArc: "情绪曲线", scenes: "分场",
  suspense: "悬念强度", twist: "转折强度",
  plotPoints: "情节节点", hooks: "钩子", targetWords: "目标字数", premise: "一句话故事", theme: "主题",
  tone: "基调", mainPlot: "主线", subplots: "支线", characterArcs: "人物弧光", worldRules: "世界规则",
  ending: "结局", arcGoal: "卷目标", keyEvents: "关键事件", foreshadowPlan: "伏笔计划", volumeId: "所属卷", orderIndex: "排序",
};
