import { extractJson } from "@/lib/ai/prompts";
import type { CharacterRole, ForeshadowStatus, WorldCategory } from "@/lib/types";

const CATEGORIES = new Set<WorldCategory>(["power", "geography", "faction", "item", "rule", "history", "custom"]);
const CATEGORY_ALIAS: Record<string, WorldCategory> = {
  地理: "geography",
  地点: "geography",
  城市: "geography",
  势力: "faction",
  国家: "faction",
  组织: "faction",
  物品: "item",
  规则: "rule",
  历史: "history",
  力量: "power",
  体系: "power",
};

const ROLES = new Set<CharacterRole>(["protagonist", "antagonist", "supporting", "mentor", "ensemble", "other"]);
const ROLE_ALIAS: Record<string, CharacterRole> = {
  主角: "protagonist",
  反派: "antagonist",
  配角: "supporting",
  导师: "mentor",
  群像: "ensemble",
  其他: "other",
};

const STATUSES = new Set<ForeshadowStatus>(["planted", "advanced", "paid", "dropped"]);
const STATUS_ALIAS: Record<string, ForeshadowStatus> = {
  已埋设: "planted",
  埋设: "planted",
  推进中: "advanced",
  已回收: "paid",
  已放弃: "dropped",
};

export type CodexKind = "world" | "character" | "foreshadow";
export type CodexOp = "create" | "update";

export interface CodexRelation {
  ref: string;
  relation: string;
}

/** 资料助手一次提案里的一张卡。title 对角色就是姓名。 */
export interface CodexItem {
  ref: string;
  op: CodexOp;
  kind: CodexKind;
  id: string | null;
  parentRef: string | null;
  title: string;
  /** 模型没写分类时为 null，更新已有卡时不要用默认值覆盖。 */
  category: WorldCategory | null;
  summary: string;
  content: string;
  relation: string;
  role: CharacterRole | null;
  identity: string;
  personality: string;
  relatesTo: CodexRelation | null;
  description: string;
  status: ForeshadowStatus | null;
  notes: string;
  picked: boolean;
}

export interface CodexReply {
  message: string;
  items: CodexItem[];
}

export interface CodexCatalogCard {
  id: string;
  kind: CodexKind;
  title: string;
}

export interface CodexCatalogInput {
  worlds: { id: string; parentId: string | null; title: string; category: string }[];
  characters: { id: string; name: string; role: string }[];
  foreshadows: { id: string; title: string; status: string }[];
}

export interface CodexTurn {
  role: "user" | "assistant";
  content: string;
}

export const CODEX_SYSTEM = `你是这部小说的资料助手。作者会贴一段设定、角色或伏笔，或用一句话修改上一份清单。
只输出一个 JSON 对象，不要 Markdown，不要解释：
{"message":"一两句人话","items":[{"ref":"lan","op":"create","kind":"world|character|foreshadow","id":null,"parentRef":null,"title":"","category":"geography|faction|item|rule|history|power|custom","summary":"","content":"","relation":"位于|相邻","role":"supporting","identity":"","personality":"","relatesTo":null,"description":"","status":"planted","notes":"","picked":true}]}
规则：
- 文中有名字的国家、州、城、镇、关、书院、组织，各一张世界卡。有名字的人各一张角色卡。没有情节钩子就不要建伏笔。
- 物品、道路、街巷、建筑只有和关键剧情相关（推动主线、承载伏笔、有特殊规则）才建卡，一次性道具和普通场景不建；拿不准时不建，在 message 里列出名字问作者要不要建。
- 有名字、或带明确钩子（信物、暗号、身世、没兑现的约定等）的线索，每条一张伏笔卡：kind 用 "foreshadow"，title 写伏笔标题，description 写「埋了什么、打算怎么收」，notes 写提醒，status 从 planted/advanced/paid/dropped 里选一个。
- 只给材料或对话里真的出现的线索建伏笔卡，不要编造材料/对话里没有的伏笔。
- 州的 parentRef 指向国家，城指向所属的州，书院或机构指向所在的城。邻国 relation 写「相邻」，parentRef 留空，不要挂到本国下面。
- 气候、人口口径、里制、舆图画法写进国家卡的 content，不要拆成「气候格局」「生计」这种子卡。
- 没有名字的人不建卡，原句留在相关人物的 identity。
- 每张卡的 content 或 identity 只写这段里关于它自己的事实，不要把整段原文复制进每一张，也不要编造没写的人名、距离、制度。
- 目录里已有同名卡时 op 用 update，id 用目录里的 id，不要再建一张。挂到已有卡时 parentRef 填那个 id。
- 修改时只填要改的字段。作者上一份清单里 picked 为 false 的条目不要放回来，除非这次明确要求。
- 信息不够、或作者只是在问，items 用空数组，在 message 里问一个问题。`;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function categoryOf(value: unknown): WorldCategory {
  const raw = textOf(value);
  if (CATEGORIES.has(raw as WorldCategory)) return raw as WorldCategory;
  return CATEGORY_ALIAS[raw] ?? "geography";
}

function roleOf(value: unknown): CharacterRole {
  const raw = textOf(value);
  if (ROLES.has(raw as CharacterRole)) return raw as CharacterRole;
  return ROLE_ALIAS[raw] ?? "supporting";
}

function statusOf(value: unknown): ForeshadowStatus {
  const raw = textOf(value);
  if (STATUSES.has(raw as ForeshadowStatus)) return raw as ForeshadowStatus;
  return STATUS_ALIAS[raw] ?? "planted";
}

function kindOf(value: unknown): CodexKind {
  const raw = textOf(value);
  if (raw === "character" || raw === "角色" || raw === "人物") return "character";
  if (raw === "foreshadow" || raw === "伏笔") return "foreshadow";
  return "world";
}

function relatesOf(value: unknown): CodexRelation | null {
  const row = asRecord(value);
  if (!row) return null;
  const ref = textOf(row.ref) || textOf(row.target) || textOf(row.name);
  const relation = textOf(row.relation);
  if (!ref || !relation) return null;
  return { ref, relation };
}

function itemFromRow(row: Record<string, unknown>, index: number): CodexItem | null {
  const kind = kindOf(row.kind);
  const title = textOf(row.title) || textOf(row.name);
  if (!title) return null;
  const parentRef = textOf(row.parentRef) || textOf(row.parentId) || textOf(row.parent);
  return {
    ref: textOf(row.ref) || `n${index + 1}`,
    op: textOf(row.op) === "update" || textOf(row.op) === "更新" ? "update" : "create",
    kind,
    id: textOf(row.id) || null,
    parentRef: parentRef || null,
    title,
    category: textOf(row.category) ? categoryOf(row.category) : null,
    summary: textOf(row.summary),
    content: textOf(row.content),
    relation: textOf(row.relation),
    role: textOf(row.role) ? roleOf(row.role) : null,
    identity: textOf(row.identity),
    personality: textOf(row.personality),
    relatesTo: relatesOf(row.relatesTo),
    description: textOf(row.description),
    status: textOf(row.status) ? statusOf(row.status) : null,
    notes: textOf(row.notes),
    picked: row.picked !== false,
  };
}

/** 从模型输出里取出说明和卡片清单。解析失败返回 null。 */
export function parseCodexReply(text: string): CodexReply | null {
  const parsed = extractJson<unknown>(text);
  const record = asRecord(parsed);
  if (!record) return null;
  const list = Array.isArray(record.items) ? record.items : [];
  const items: CodexItem[] = [];
  list.forEach((item, index) => {
    const row = asRecord(item);
    if (!row) return;
    const next = itemFromRow(row, index);
    if (next) items.push(next);
  });
  const message = textOf(record.message);
  if (!message && items.length === 0) return null;
  return { message, items };
}

/** 同名已有卡改为更新；相邻不挂父级；parentRef 写成标题时改成 ref。 */
export function prepareCodexItems(items: CodexItem[], catalog: CodexCatalogCard[]): CodexItem[] {
  const seenRef = new Set<string>();
  const cleaned: CodexItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    let ref = item.ref.trim() || title;
    if (seenRef.has(ref)) ref = `${ref}-${cleaned.length + 1}`;
    seenRef.add(ref);
    const relation = item.relation.trim();
    cleaned.push({
      ...item,
      ref,
      title,
      relation,
      parentRef: item.kind === "world" && relation.includes("相邻") ? null : item.parentRef,
    });
  }

  const byRef = new Map(cleaned.map((item) => [item.ref, item]));
  const byTitle = new Map(cleaned.filter((item) => item.kind === "world").map((item) => [item.title, item]));
  const catalogWorldByTitle = new Map(
    catalog.filter((card) => card.kind === "world").map((card) => [card.title, card.id]),
  );
  const linked = cleaned.map((item) => {
    if (!item.parentRef || byRef.has(item.parentRef)) return item;
    const named = byTitle.get(item.parentRef);
    if (named) return { ...item, parentRef: named.ref };
    const existing = catalogWorldByTitle.get(item.parentRef);
    return existing ? { ...item, parentRef: existing } : item;
  });

  const catalogByKey = new Map(catalog.map((card) => [`${card.kind}:${card.title}`, card]));
  const usedIds = new Set<string>();
  return linked.map((item) => {
    if (item.op === "update" && item.id) {
      usedIds.add(item.id);
      return item;
    }
    const found = catalogByKey.get(`${item.kind}:${item.title}`);
    if (!found || usedIds.has(found.id)) return { ...item, op: "create", id: null };
    usedIds.add(found.id);
    return { ...item, op: "update", id: found.id };
  });
}

/** 先写父级世界卡，再写其余世界卡，然后是角色和伏笔。 */
export function orderedCodexItems(items: CodexItem[]): CodexItem[] {
  const picked = items.filter((item) => item.picked);
  const worlds = picked.filter((item) => item.kind === "world");
  const byRef = new Map(worlds.map((item) => [item.ref, item]));
  const seen = new Set<string>();
  const worldsOut: CodexItem[] = [];
  const visit = (item: CodexItem, stack: Set<string>) => {
    if (seen.has(item.ref) || stack.has(item.ref)) return;
    stack.add(item.ref);
    const parent = item.parentRef ? byRef.get(item.parentRef) : undefined;
    if (parent) visit(parent, stack);
    stack.delete(item.ref);
    seen.add(item.ref);
    worldsOut.push(item);
  };
  for (const item of worlds) visit(item, new Set());
  return [
    ...worldsOut,
    ...picked.filter((item) => item.kind === "character"),
    ...picked.filter((item) => item.kind === "foreshadow"),
  ];
}

export function setCodexPicked(items: CodexItem[], ref: string, picked: boolean): CodexItem[] {
  const refs = new Set<string>([ref]);
  if (!picked) {
    const queue = [ref];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) break;
      for (const item of items) {
        if (item.parentRef === current && !refs.has(item.ref)) {
          refs.add(item.ref);
          queue.push(item.ref);
        }
      }
    }
  } else {
    let current = items.find((item) => item.ref === ref);
    while (current?.parentRef) {
      const parent = items.find((item) => item.ref === current?.parentRef);
      if (!parent) break;
      refs.add(parent.ref);
      current = parent;
    }
  }
  return items.map((item) => (refs.has(item.ref) ? { ...item, picked } : item));
}

export function formatCodexCatalog(input: CodexCatalogInput): string {
  const worlds = input.worlds
    .slice(0, 80)
    .map((item) => `- id=${item.id} parent=${item.parentId ?? ""} title=${item.title} category=${item.category}`)
    .join("\n");
  const characters = input.characters
    .slice(0, 80)
    .map((item) => `- id=${item.id} name=${item.name} role=${item.role}`)
    .join("\n");
  const foreshadows = input.foreshadows
    .slice(0, 40)
    .map((item) => `- id=${item.id} title=${item.title} status=${item.status}`)
    .join("\n");
  return [`世界：`, worlds || "（无）", `角色：`, characters || "（无）", `伏笔：`, foreshadows || "（无）"].join("\n");
}

/** 写进提示词的正文节选上限（字符）。约两千字，足够模型定位人物和设定。 */
export const CODEX_CONTEXT_LIMIT = 2000;

/** 把正文节选裁到提示词上限；超出时保留开头并明确标注已截断。 */
export function truncateCodexContext(text: string, limit: number = CODEX_CONTEXT_LIMIT): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}…（已截断）`;
}

export function buildCodexUserPrompt(input: {
  catalog: string;
  history: CodexTurn[];
  draft: CodexItem[];
  message: string;
  /** 当前章节正文节选；为空时提示词里不出现正文段（保持旧行为）。 */
  contextText?: string;
}): string {
  const history = input.history
    .slice(-6)
    .map((turn) => `${turn.role === "assistant" ? "助手" : "作者"}：${turn.content.slice(0, 4000)}`)
    .join("\n");
  const draft = input.draft.length > 0 ? JSON.stringify(input.draft) : "（无）";
  const context = truncateCodexContext(input.contextText ?? "");
  const contextBlock = context ? [`【当前章节正文节选】\n${context}`] : [];
  return [
    "这是资料整理。",
    `【已有卡片】\n${input.catalog}`,
    ...contextBlock,
    `【对话】\n${history || "（无）"}`,
    `【上一份待写入清单】\n${draft}`,
    `【作者这次说】\n${input.message.trim()}`,
  ].join("\n\n");
}

/** 世界卡要写入的父级。undefined 表示这次不改父级。 */
export function codexParentId(
  item: CodexItem,
  ids: ReadonlyMap<string, string>,
): string | null | undefined {
  if (item.kind !== "world") return undefined;
  if (item.parentRef) {
    if (ids.has(item.parentRef)) return ids.get(item.parentRef) ?? null;
    return item.parentRef;
  }
  if (item.relation.includes("相邻") || item.op === "create") return null;
  return undefined;
}
