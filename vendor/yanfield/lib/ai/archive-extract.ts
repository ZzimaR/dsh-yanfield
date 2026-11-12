import type { StoryArchive } from "@/lib/types";

/** 档案提取的结构化结果（不含 id、章节等元数据）。 */
export type ArchivePayload = Pick<
  StoryArchive,
  "chapterSummary" | "characterStates" | "settingStates" | "ledger" | "timeline" | "foreshadows" | "conflicts"
>;

const DEFAULT_OUTPUT_BUDGET = 4096;
const MAX_OUTPUT_BUDGET = 16384;
const MIN_OUTPUT_BUDGET = 4096;

/**
 * 档案 JSON 的输出上限：思考型模型的推理也会占用这部分额度，2000 这类小值很容易截断。
 * 有模型声明的上限就不超过它；没有声明时用一个大多数模型都接受的默认值。
 */
export function archiveOutputBudget(declaredMax?: number, attempt = 0, configuredMax = 0): number {
  const wanted = configuredMax > 0
    ? configuredMax
    : Math.min(MAX_OUTPUT_BUDGET, DEFAULT_OUTPUT_BUDGET * (attempt + 1));
  if (declaredMax && declaredMax > 0) return Math.min(declaredMax, wanted);
  if (configuredMax > 0) return configuredMax;
  return Math.max(MIN_OUTPUT_BUDGET, wanted);
}

/** 控制档案篇幅，避免长章节把输出撑爆；重试时用更严格的精简版。 */
export function archiveLengthRules(compact: boolean): string {
  return compact
    ? "篇幅（上一次输出过长被截断，这次务必精简）：chapterSummary 不超过 80 字；每个数组最多 6 条，只留最关键的；每个字段不超过 30 字，只写要点，不要复述原文。"
    : "篇幅：chapterSummary 不超过 150 字；每个数组最多 12 条；每个字段不超过 60 字，只写要点，不要大段复述原文。";
}

export const MANUAL_ARCHIVE_RULES = `作者手动校订过本章档案（见【作者校订的档案】），作者写的内容视为正确：
- 作者已写的条目必须保留，不许删除或改写；同一角色/设定/资源/伏笔沿用作者的写法，只可以补充作者留空的字段。
- 正文里出现、但作者档案没有的新事实，照常补充。
- 如果作者校订的内容与正文明显矛盾：保留作者的版本，并在 conflicts 里加一条，topic 写「档案与正文不一致：<要点>」，detail 引用正文原句，并写明「档案已按你的校订保留，请同步修改正文」。`;

function pickPayload(archive: ArchivePayload): ArchivePayload {
  return {
    chapterSummary: archive.chapterSummary,
    characterStates: archive.characterStates,
    settingStates: archive.settingStates,
    ledger: archive.ledger,
    timeline: archive.timeline,
    foreshadows: archive.foreshadows,
    conflicts: archive.conflicts,
  };
}

export function manualArchiveBlock(archive: ArchivePayload): string {
  return `【作者校订的档案】\n${JSON.stringify(pickPayload(archive))}`;
}

const norm = (value: string | undefined) => (value ?? "").trim();

/** 同 key 的条目以作者版本为准，作者留空的字段才用 AI 的；AI 新增的条目追加在后面。 */
function mergeList<T extends object>(manual: T[], extracted: T[], key: (item: T) => string): T[] {
  const result = manual.map((item) => ({ ...item }));
  const index = new Map<string, number>();
  result.forEach((item, position) => {
    const k = key(item);
    if (k && !index.has(k)) index.set(k, position);
  });
  for (const item of extracted) {
    const k = key(item);
    const position = k ? index.get(k) : undefined;
    if (position === undefined) {
      if (k) index.set(k, result.length);
      result.push({ ...item });
      continue;
    }
    const target = result[position] as Record<string, unknown>;
    for (const [field, value] of Object.entries(item)) {
      if (typeof target[field] === "string" && !norm(target[field] as string) && typeof value === "string") target[field] = value;
    }
  }
  return result;
}

/**
 * 兜底合并：即使模型没有遵守「保留作者条目」，作者写过的内容也不会丢。
 * 返回合并结果和新增的冲突条数，方便界面提醒作者去改正文。
 */
export function mergeManualArchive(manual: ArchivePayload, extracted: ArchivePayload): { payload: ArchivePayload; newConflicts: number } {
  const conflicts = mergeList(manual.conflicts, extracted.conflicts, (item) => norm(item.topic) || norm(item.detail));
  return {
    payload: {
      chapterSummary: norm(manual.chapterSummary) ? manual.chapterSummary : extracted.chapterSummary,
      characterStates: mergeList(manual.characterStates, extracted.characterStates, (item) => norm(item.name)),
      settingStates: mergeList(manual.settingStates, extracted.settingStates, (item) => norm(item.title)),
      ledger: mergeList(manual.ledger, extracted.ledger, (item) => norm(item.name)),
      timeline: mergeList(manual.timeline, extracted.timeline, (item) => `${norm(item.storyTime)}|${norm(item.event)}`.replace(/^\|$/, "")),
      foreshadows: mergeList(manual.foreshadows, extracted.foreshadows, (item) => norm(item.title)),
      conflicts,
    },
    newConflicts: conflicts.length - manual.conflicts.length,
  };
}

export const ARCHIVE_TRUNCATED_MESSAGE =
  "本章档案内容太多，模型输出被截断（已自动精简重试一次）。可以提高设置里的「单次输出上限」、换用输出额度更大的模型，或把这一章拆成两章后再提取。";
