/**
 * 砚田 Yanfield — 服务端数据访问层（基于 node:sqlite，同步 API）
 * 所有 Route Handler 通过本文件读写数据库；客户端不要 import 本文件。
 */
import {
  all,
  boolOf,
  get,
  nowIso,
  numOrNull,
  parseJson,
  run,
  toJson,
  tx,
  type Row,
} from "./db";
import { chatTitleFromMessage, isDefaultChatTitle } from "./chat-title";
import { builtinAiPricing } from "./ai/deepseek-pricing";
import { unifyModelSettings } from "./model-settings";
import { normalizeProviderKind } from "./ai/provider-kind";
import { countWords } from "./ui/cn";
import { DEFAULT_APP_SETTINGS } from "./types";
import type {
  AiFeature,
  AiLog,
  AiLogStatus,
  AiUsage,
  AppSettings,
  ArchiveStatus,
  Chapter,
  ChapterBlueprint,
  ChapterStatus,
  Character,
  CharacterRelation,
  CharacterRole,
  ChatMessage,
  ChatSession,
  DashboardStats,
  Foreshadow,
  ForeshadowStatus,
  ID,
  ModelOption,
  Novel,
  NovelOutline,
  NovelStatus,
  ProviderConfig,
  ProviderKind,
  PromptPreset,
  SearchResult,
  StoryArchive,
  Volume,
  VolumeOutline,
  WorldCategory,
  WorldImportance,
  WorldSetting,
} from "./types";
import { uid } from "./ui/cn";

/* ============================== 小工具 ============================== */

const s = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const n = (v: unknown, d = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const b = (v: unknown): boolean => boolOf(v);

function norm(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object") return toJson(v);
  return v;
}

/** 按列映射打补丁；undefined 字段跳过，自动刷新 updated_at */
function patch<T extends Row>(
  table: string,
  id: string,
  cols: Record<string, string>,
  data: Record<string, unknown>,
  jsonKeys: string[] = [],
  hasUpdatedAt = true,
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(cols)) {
    let value = data[key];
    if (value === undefined) continue;
    if (jsonKeys.includes(key) && value !== null && typeof value !== "string") value = toJson(value);
    sets.push(`"${col}" = ?`);
    params.push(norm(value));
  }
  if (sets.length === 0) return;
  if (hasUpdatedAt) sets.push(`"updated_at" = ?`);
  params.push(hasUpdatedAt ? nowIso() : undefined);
  params.pop();
  if (hasUpdatedAt) params.push(nowIso());
  run(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
}

/* ============================== 作品 ============================== */

const NOVEL_COLS: Record<string, string> = {
  title: "title",
  subtitle: "subtitle",
  author: "author",
  genre: "genre",
  tags: "tags",
  synopsis: "synopsis",
  coverKey: "cover_key",
  status: "status",
  wordGoal: "word_goal",
  targetChapters: "target_chapters",
  styleGuide: "style_guide",
  pov: "pov",
  forbiddenWords: "forbidden_words",
};

function novelFromRow(r: Row): Novel {
  return {
    id: s(r.id),
    title: s(r.title),
    subtitle: s(r.subtitle),
    author: s(r.author),
    genre: s(r.genre, "玄幻"),
    tags: parseJson<string[]>(r.tags, []),
    synopsis: s(r.synopsis),
    coverKey: s(r.cover_key, "ink"),
    status: s(r.status, "draft") as NovelStatus,
    wordGoal: n(r.word_goal, 1000000),
    targetChapters: n(r.target_chapters, 300),
    styleGuide: s(r.style_guide),
    pov: s(r.pov),
    forbiddenWords: parseJson<string[]>(r.forbidden_words, []),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    lastOpenedAt: r.last_opened_at ? s(r.last_opened_at) : null,
  };
}

export type CreateNovelInput = { title: string } & Partial<Omit<Novel, "id" | "createdAt" | "updatedAt" | "lastOpenedAt">>;

export function listNovels(): Novel[] {
  return all<Row>("SELECT * FROM novels ORDER BY COALESCE(last_opened_at, updated_at) DESC").map(novelFromRow);
}

export function getNovel(id: ID): Novel | undefined {
  const row = get<Row>("SELECT * FROM novels WHERE id = ?", [id]);
  return row ? novelFromRow(row) : undefined;
}

export function createNovel(input: CreateNovelInput): Novel {
  const now = nowIso();
  const id = uid("nov");
  const data: Novel = {
    id,
    title: input.title || "未命名作品",
    subtitle: input.subtitle ?? "",
    author: input.author ?? "",
    genre: input.genre ?? "玄幻",
    tags: input.tags ?? [],
    synopsis: input.synopsis ?? "",
    coverKey: input.coverKey ?? "ink",
    status: input.status ?? "draft",
    wordGoal: input.wordGoal ?? 1000000,
    targetChapters: input.targetChapters ?? 300,
    styleGuide: input.styleGuide ?? "",
    pov: input.pov ?? "第三人称",
    forbiddenWords: input.forbiddenWords ?? [],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  run(
    `INSERT INTO novels (id,title,subtitle,author,genre,tags,synopsis,cover_key,status,word_goal,target_chapters,style_guide,pov,forbidden_words,created_at,updated_at,last_opened_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.id, data.title, data.subtitle, data.author, data.genre, toJson(data.tags), data.synopsis, data.coverKey, data.status, data.wordGoal, data.targetChapters, data.styleGuide, data.pov, toJson(data.forbiddenWords), now, now, now],
  );
  return data;
}

export function updateNovel(id: ID, data: Partial<Novel>): Novel {
  patch("novels", id, NOVEL_COLS, data as Record<string, unknown>, ["tags", "forbiddenWords"]);
  const next = getNovel(id);
  if (!next) throw new Error(`novel not found: ${id}`);
  return next;
}

export function deleteNovel(id: ID): void {
  run("DELETE FROM novels WHERE id = ?", [id]);
}

export function touchNovel(id: ID): void {
  run("UPDATE novels SET last_opened_at = ? WHERE id = ?", [nowIso(), id]);
}

/* ============================== 卷 ============================== */

const VOLUME_COLS: Record<string, string> = { title: "title", summary: "summary", orderIndex: "order_index" };

function volumeFromRow(r: Row): Volume {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    title: s(r.title),
    summary: s(r.summary),
    orderIndex: n(r.order_index),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listVolumes(novelId: ID): Volume[] {
  return all<Row>("SELECT * FROM volumes WHERE novel_id = ? ORDER BY order_index, created_at", [novelId]).map(volumeFromRow);
}

export function getVolume(id: ID): Volume | undefined {
  const row = get<Row>("SELECT * FROM volumes WHERE id = ?", [id]);
  return row ? volumeFromRow(row) : undefined;
}

export function createVolume(
  novelId: ID,
  input: Partial<Pick<Volume, "title" | "summary" | "orderIndex">> = {},
): Volume {
  const now = nowIso();
  const count = n(get<{ c: number }>("SELECT COUNT(*) AS c FROM volumes WHERE novel_id = ?", [novelId])?.c);
  const vol: Volume = {
    id: uid("vol"),
    novelId,
    title: input.title?.trim() || `第 ${count + 1} 卷`,
    summary: input.summary ?? "",
    orderIndex: input.orderIndex ?? count,
    createdAt: now,
    updatedAt: now,
  };
  run("INSERT INTO volumes (id,novel_id,title,summary,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
    vol.id, vol.novelId, vol.title, vol.summary, vol.orderIndex, now, now,
  ]);
  return vol;
}

/**
 * 把一卷插到同书的目标位置，并重排全部 order_index。
 * 只改一行 order_index 会和邻居撞号，按 created_at 再排时上下移等于没动。
 */
export function moveVolume(id: ID, orderIndex: number): Volume {
  const current = getVolume(id);
  if (!current) throw new Error(`volume not found: ${id}`);
  const siblings = all<Row>(
    "SELECT id FROM volumes WHERE novel_id = ? AND id <> ? ORDER BY order_index, created_at",
    [current.novelId, id],
  ).map((row) => s(row.id));
  const index = Math.max(0, Math.min(Math.round(orderIndex), siblings.length));
  siblings.splice(index, 0, id);
  const now = nowIso();
  tx(() => {
    siblings.forEach((volumeId, position) => {
      run("UPDATE volumes SET order_index = ?, updated_at = ? WHERE id = ?", [position, now, volumeId]);
    });
  });
  const next = getVolume(id);
  if (!next) throw new Error(`volume not found: ${id}`);
  return next;
}

export function updateVolume(id: ID, data: Partial<Volume>): Volume {
  const { orderIndex, ...rest } = data;
  if (Object.values(rest).some((value) => value !== undefined)) {
    patch("volumes", id, VOLUME_COLS, rest as Record<string, unknown>);
  }
  if (typeof orderIndex === "number" && Number.isFinite(orderIndex)) {
    return moveVolume(id, orderIndex);
  }
  const next = getVolume(id);
  if (!next) throw new Error(`volume not found: ${id}`);
  return next;
}

export function deleteVolume(id: ID): void {
  run("DELETE FROM volumes WHERE id = ?", [id]);
}

/* ============================== 章 ============================== */

const CHAPTER_COLS: Record<string, string> = {
  title: "title",
  content: "content",
  summary: "summary",
  status: "status",
  orderIndex: "order_index",
  wordCount: "word_count",
  notes: "notes",
  volumeId: "volume_id",
};

function chapterFromRow(r: Row): Chapter {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    volumeId: r.volume_id ? s(r.volume_id) : null,
    title: s(r.title),
    content: s(r.content),
    summary: s(r.summary),
    status: s(r.status, "draft") as ChapterStatus,
    orderIndex: n(r.order_index),
    wordCount: n(r.word_count),
    notes: s(r.notes),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

// List views must not read or serialize every chapter body in a long novel.
const CHAPTER_SUMMARY_COLUMNS = "id, novel_id, volume_id, title, summary, status, order_index, word_count, notes, created_at, updated_at";

export function listChapters(novelId: ID, includeContent = true): Chapter[] {
  const columns = includeContent ? "*" : CHAPTER_SUMMARY_COLUMNS;
  return all<Row>(`SELECT ${columns} FROM chapters WHERE novel_id = ? ORDER BY order_index, created_at`, [novelId]).map(chapterFromRow);
}

export function getChapter(id: ID): Chapter | undefined {
  const row = get<Row>("SELECT * FROM chapters WHERE id = ?", [id]);
  return row ? chapterFromRow(row) : undefined;
}

export function getChaptersByIds(ids: ID[]): Chapter[] {
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  return all<Row>(`SELECT * FROM chapters WHERE id IN (${marks}) ORDER BY order_index`, ids).map(chapterFromRow);
}

export function createChapter(
  novelId: ID,
  input: { title?: string; volumeId?: ID | null; orderIndex?: number; content?: string } = {},
): Chapter {
  const now = nowIso();
  const siblings = input.volumeId
    ? all<Row>("SELECT * FROM chapters WHERE volume_id = ? ORDER BY order_index", [input.volumeId])
    : all<Row>("SELECT * FROM chapters WHERE novel_id = ? ORDER BY order_index", [novelId]);
  const count = siblings.length;
  const chapter: Chapter = {
    id: uid("ch"),
    novelId,
    volumeId: input.volumeId ?? null,
    title: input.title?.trim() || `第 ${count + 1} 章`,
    content: input.content ?? "",
    summary: "",
    status: "draft",
    orderIndex: input.orderIndex ?? count,
    wordCount: countWords(input.content ?? ""),
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
  run(
    `INSERT INTO chapters (id,novel_id,volume_id,title,content,summary,status,order_index,word_count,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [chapter.id, chapter.novelId, chapter.volumeId, chapter.title, chapter.content, chapter.summary, chapter.status, chapter.orderIndex, chapter.wordCount, chapter.notes, now, now],
  );
  return chapter;
}

export function updateChapter(id: ID, data: Partial<Chapter>): Chapter {
  patch("chapters", id, CHAPTER_COLS, data as Record<string, unknown>);
  const next = getChapter(id);
  if (!next) throw new Error(`chapter not found: ${id}`);
  return next;
}

export function deleteChapter(id: ID): void {
  run("DELETE FROM chapters WHERE id = ?", [id]);
}

export function moveChapter(id: ID, target: { volumeId?: ID | null; orderIndex?: number }): Chapter {
  const current = getChapter(id);
  if (!current) throw new Error(`chapter not found: ${id}`);
  const volumeId = target.volumeId === undefined ? current.volumeId : target.volumeId;
  const siblings = all<Row>(
    "SELECT id FROM chapters WHERE novel_id = ? AND COALESCE(volume_id,'') = ? AND id <> ? ORDER BY order_index",
    [current.novelId, volumeId ?? "", id],
  ).map((r) => s(r.id));
  const index = target.orderIndex === undefined ? siblings.length : Math.max(0, Math.min(target.orderIndex, siblings.length));
  siblings.splice(index, 0, id);
  tx(() => {
    run("UPDATE chapters SET volume_id = ?, updated_at = ? WHERE id = ?", [volumeId, nowIso(), id]);
    siblings.forEach((cid, i) => run("UPDATE chapters SET order_index = ? WHERE id = ?", [i, cid]));
  });
  return updateChapter(id, {});
}

/** 卷 + 章的总览树 */
export function getNovelTree(
  novelId: ID,
  includeContent = true,
): { novel: Novel; volumes: (Volume & { chapters: Chapter[] })[]; looseChapters: Chapter[] } | undefined {
  const novel = getNovel(novelId);
  if (!novel) return undefined;
  const columns = includeContent ? "*" : CHAPTER_SUMMARY_COLUMNS;
  const volumes = listVolumes(novelId).map((v) => ({
    ...v,
    chapters: all<Row>(
      `SELECT ${columns} FROM chapters WHERE novel_id = ? AND volume_id = ? ORDER BY order_index`,
      [novelId, v.id],
    ).map(chapterFromRow),
  }));
  const looseChapters = all<Row>(
    `SELECT ${columns} FROM chapters WHERE novel_id = ? AND volume_id IS NULL ORDER BY order_index`,
    [novelId],
  ).map(chapterFromRow);
  return { novel, volumes, looseChapters };
}

/* ============================== 大纲 ============================== */

function novelOutlineFromRow(r: Row): NovelOutline {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    premise: s(r.premise),
    theme: s(r.theme),
    tone: s(r.tone),
    mainPlot: s(r.main_plot),
    subplots: parseJson<string[]>(r.subplots, []),
    characterArcs: parseJson<{ character: string; arc: string }[]>(r.character_arcs, []),
    worldRules: parseJson<string[]>(r.world_rules, []),
    ending: s(r.ending),
    hooks: parseJson<string[]>(r.hooks, []),
    updatedAt: s(r.updated_at),
  };
}

export function getNovelOutline(novelId: ID): NovelOutline {
  const row = get<Row>("SELECT * FROM novel_outlines WHERE novel_id = ?", [novelId]);
  if (row) return novelOutlineFromRow(row);
  const now = nowIso();
  const data: NovelOutline = {
    id: uid("outline"), novelId, premise: "", theme: "", tone: "", mainPlot: "",
    subplots: [], characterArcs: [], worldRules: [], ending: "", hooks: [], updatedAt: now,
  };
  run("INSERT INTO novel_outlines (id,novel_id,updated_at) VALUES (?,?,?)", [data.id, novelId, now]);
  return data;
}

const NOVEL_OUTLINE_COLS: Record<string, string> = {
  premise: "premise", theme: "theme", tone: "tone", mainPlot: "main_plot", subplots: "subplots",
  characterArcs: "character_arcs", worldRules: "world_rules", ending: "ending", hooks: "hooks",
};

export function saveNovelOutline(novelId: ID, data: Partial<NovelOutline>): NovelOutline {
  const current = getNovelOutline(novelId);
  patch("novel_outlines", current.id, NOVEL_OUTLINE_COLS, data as Record<string, unknown>, ["subplots", "characterArcs", "worldRules", "hooks"]);
  return getNovelOutline(novelId);
}

function volumeOutlineFromRow(r: Row): VolumeOutline {
  return {
    id: s(r.id),
    volumeId: s(r.volume_id),
    novelId: s(r.novel_id),
    summary: s(r.summary),
    arcGoal: s(r.arc_goal),
    keyEvents: parseJson<string[]>(r.key_events, []),
    foreshadowPlan: parseJson<string[]>(r.foreshadow_plan, []),
    updatedAt: s(r.updated_at),
  };
}

export function getVolumeOutline(volumeId: ID): VolumeOutline {
  const row = get<Row>("SELECT * FROM volume_outlines WHERE volume_id = ?", [volumeId]);
  if (row) return volumeOutlineFromRow(row);
  const vol = getVolume(volumeId);
  const now = nowIso();
  const data: VolumeOutline = {
    id: uid("outline"), volumeId, novelId: vol?.novelId ?? "", summary: "", arcGoal: "",
    keyEvents: [], foreshadowPlan: [], updatedAt: now,
  };
  run("INSERT INTO volume_outlines (id,volume_id,novel_id,updated_at) VALUES (?,?,?,?)", [data.id, volumeId, data.novelId, now]);
  return data;
}

export function saveVolumeOutline(volumeId: ID, data: Partial<VolumeOutline>): VolumeOutline {
  const current = getVolumeOutline(volumeId);
  patch("volume_outlines", current.id, { summary: "summary", arcGoal: "arc_goal", keyEvents: "key_events", foreshadowPlan: "foreshadow_plan" }, data as Record<string, unknown>, ["keyEvents", "foreshadowPlan"]);
  return getVolumeOutline(volumeId);
}

function blueprintFromRow(r: Row): ChapterBlueprint {
  return {
    id: s(r.id),
    chapterId: s(r.chapter_id),
    novelId: s(r.novel_id),
    goal: s(r.goal),
    pov: s(r.pov),
    conflict: s(r.conflict),
    emotionalArc: s(r.emotional_arc),
    scenes: parseJson<ChapterBlueprint["scenes"]>(r.scenes, []),
    plotPoints: parseJson<string[]>(r.plot_points, []),
    hooks: parseJson<string[]>(r.hooks, []),
    targetWords: n(r.target_words, 2500),
    notes: s(r.notes),
    updatedAt: s(r.updated_at),
  };
}

export function getBlueprint(chapterId: ID): ChapterBlueprint {
  const row = get<Row>("SELECT * FROM chapter_blueprints WHERE chapter_id = ?", [chapterId]);
  if (row) return blueprintFromRow(row);
  const ch = getChapter(chapterId);
  const now = nowIso();
  const data: ChapterBlueprint = {
    id: uid("bp"), chapterId, novelId: ch?.novelId ?? "", goal: "", pov: "", conflict: "",
    emotionalArc: "", scenes: [], plotPoints: [], hooks: [], targetWords: 2500, notes: "", updatedAt: now,
  };
  run("INSERT INTO chapter_blueprints (id,chapter_id,novel_id,updated_at) VALUES (?,?,?,?)", [data.id, chapterId, data.novelId, now]);
  return data;
}

export function saveBlueprint(chapterId: ID, data: Partial<ChapterBlueprint>): ChapterBlueprint {
  const current = getBlueprint(chapterId);
  patch(
    "chapter_blueprints",
    current.id,
    { goal: "goal", pov: "pov", conflict: "conflict", emotionalArc: "emotional_arc", scenes: "scenes", plotPoints: "plot_points", hooks: "hooks", targetWords: "target_words", notes: "notes" },
    data as Record<string, unknown>,
    ["scenes", "plotPoints", "hooks"],
  );
  return getBlueprint(chapterId);
}

/* ============================== 角色 ============================== */

/** Restoring an undone deletion keeps the original ID and timestamps so references and version checks still match. */
export interface KeptIdentity { id: ID; createdAt: string; updatedAt: string }

const CHAR_COLS: Record<string, string> = {
  name: "name", aliases: "aliases", role: "role", gender: "gender", age: "age", identity: "identity",
  appearance: "appearance", personality: "personality", goals: "goals", secrets: "secrets", arc: "arc",
  speechStyle: "speech_style", relations: "relations", currentState: "current_state",
  aiVisible: "ai_visible", revealAtChapter: "reveal_at_chapter", tags: "tags", pinned: "pinned",
};

function characterFromRow(r: Row): Character {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    name: s(r.name),
    aliases: parseJson<string[]>(r.aliases, []),
    role: s(r.role, "supporting") as CharacterRole,
    gender: s(r.gender),
    age: s(r.age),
    identity: s(r.identity),
    appearance: s(r.appearance),
    personality: s(r.personality),
    goals: s(r.goals),
    secrets: s(r.secrets),
    arc: s(r.arc),
    speechStyle: s(r.speech_style),
    relations: parseJson<CharacterRelation[]>(r.relations, []),
    currentState: s(r.current_state),
    aiVisible: b(r.ai_visible),
    revealAtChapter: numOrNull(r.reveal_at_chapter),
    tags: parseJson<string[]>(r.tags, []),
    pinned: b(r.pinned),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listCharacters(novelId: ID): Character[] {
  return all<Row>("SELECT * FROM characters WHERE novel_id = ? ORDER BY pinned DESC, created_at", [novelId]).map(characterFromRow);
}

export function getCharacter(id: ID): Character | undefined {
  const row = get<Row>("SELECT * FROM characters WHERE id = ?", [id]);
  return row ? characterFromRow(row) : undefined;
}

export function createCharacter(novelId: ID, input: Partial<Character> & { name: string }, keep?: KeptIdentity): Character {
  const now = nowIso();
  const id = keep?.id ?? uid("char");
  const base: Character = {
    id, novelId, name: input.name, aliases: [], role: "supporting", gender: "", age: "",
    identity: "", appearance: "", personality: "", goals: "", secrets: "", arc: "", speechStyle: "",
    relations: [], currentState: "", aiVisible: true, revealAtChapter: null, tags: [], pinned: false,
    createdAt: now, updatedAt: now,
  };
  const c: Character = { ...base, ...input, id, novelId };
  run(
    `INSERT INTO characters (id,novel_id,name,aliases,role,gender,age,identity,appearance,personality,goals,secrets,arc,speech_style,relations,current_state,ai_visible,reveal_at_chapter,tags,pinned,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.novelId, c.name, toJson(c.aliases), c.role, c.gender, c.age, c.identity, c.appearance, c.personality, c.goals, c.secrets, c.arc, c.speechStyle, toJson(c.relations), c.currentState, c.aiVisible ? 1 : 0, c.revealAtChapter, toJson(c.tags), c.pinned ? 1 : 0, keep?.createdAt ?? now, keep?.updatedAt ?? now],
  );
  return keep ? { ...c, createdAt: keep.createdAt, updatedAt: keep.updatedAt } : c;
}

export function updateCharacter(id: ID, data: Partial<Character>): Character {
  patch("characters", id, CHAR_COLS, data as Record<string, unknown>, ["aliases", "relations", "tags"]);
  const next = getCharacter(id);
  if (!next) throw new Error(`character not found: ${id}`);
  return next;
}

export function deleteCharacter(id: ID): void {
  run("DELETE FROM characters WHERE id = ?", [id]);
}

export function reorderCharacters(ids: ID[]): void {
  tx(() => ids.forEach((id, i) => run("UPDATE characters SET pinned = ? WHERE id = ?", [i === 0 ? 1 : 0, id])));
}

/* ============================== 世界观设定 ============================== */

const WORLD_COLS: Record<string, string> = {
  parentId: "parent_id", title: "title", category: "category", importance: "importance", summary: "summary", content: "content",
  tags: "tags", aiVisible: "ai_visible", revealAtChapter: "reveal_at_chapter", orderIndex: "order_index", pinned: "pinned",
};

function worldFromRow(r: Row): WorldSetting {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    parentId: r.parent_id ? s(r.parent_id) : null,
    title: s(r.title),
    category: s(r.category, "custom") as WorldCategory,
    importance: (["high", "medium", "low"].includes(s(r.importance)) ? s(r.importance) : "medium") as WorldImportance,
    summary: s(r.summary),
    content: s(r.content),
    tags: parseJson<string[]>(r.tags, []),
    aiVisible: b(r.ai_visible),
    revealAtChapter: numOrNull(r.reveal_at_chapter),
    orderIndex: n(r.order_index),
    pinned: b(r.pinned),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listWorld(novelId: ID): WorldSetting[] {
  return all<Row>("SELECT * FROM world_settings WHERE novel_id = ? ORDER BY order_index, created_at", [novelId]).map(worldFromRow);
}

export function getWorld(id: ID): WorldSetting | undefined {
  const row = get<Row>("SELECT * FROM world_settings WHERE id = ?", [id]);
  return row ? worldFromRow(row) : undefined;
}

export function createWorld(novelId: ID, input: Partial<WorldSetting> & { title: string }, keep?: KeptIdentity): WorldSetting {
  const now = nowIso();
  const count = n(get<{ c: number }>("SELECT COUNT(*) AS c FROM world_settings WHERE novel_id = ?", [novelId])?.c);
  const id = keep?.id ?? uid("world");
  const base: WorldSetting = {
    id, novelId, parentId: null, title: input.title, category: "custom", importance: "medium", summary: "",
    content: "", tags: [], aiVisible: true, revealAtChapter: null, orderIndex: count, pinned: false,
    createdAt: now, updatedAt: now,
  };
  const w: WorldSetting = { ...base, ...input, id, novelId, orderIndex: input.orderIndex ?? count };
  run(
    `INSERT INTO world_settings (id,novel_id,parent_id,title,category,importance,summary,content,tags,ai_visible,reveal_at_chapter,order_index,pinned,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [w.id, w.novelId, w.parentId, w.title, w.category, w.importance, w.summary, w.content, toJson(w.tags), w.aiVisible ? 1 : 0, w.revealAtChapter, w.orderIndex, w.pinned ? 1 : 0, keep?.createdAt ?? now, keep?.updatedAt ?? now],
  );
  return keep ? { ...w, createdAt: keep.createdAt, updatedAt: keep.updatedAt } : w;
}

export function updateWorld(id: ID, data: Partial<WorldSetting>): WorldSetting {
  patch("world_settings", id, WORLD_COLS, data as Record<string, unknown>, ["tags"]);
  const next = getWorld(id);
  if (!next) throw new Error(`world setting not found: ${id}`);
  return next;
}

export function deleteWorld(id: ID): void {
  run("DELETE FROM world_settings WHERE id = ?", [id]);
}

/* ============================== 伏笔 ============================== */

const FORE_COLS: Record<string, string> = {
  title: "title", description: "description", plantedChapterId: "planted_chapter_id",
  payoffChapterId: "payoff_chapter_id", status: "status", notes: "notes",
};

function foreshadowFromRow(r: Row): Foreshadow {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    title: s(r.title),
    description: s(r.description),
    plantedChapterId: r.planted_chapter_id ? s(r.planted_chapter_id) : null,
    payoffChapterId: r.payoff_chapter_id ? s(r.payoff_chapter_id) : null,
    status: s(r.status, "planted") as ForeshadowStatus,
    notes: s(r.notes),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listForeshadows(novelId: ID): Foreshadow[] {
  return all<Row>("SELECT * FROM foreshadows WHERE novel_id = ? ORDER BY created_at", [novelId]).map(foreshadowFromRow);
}

export function createForeshadow(novelId: ID, input: Partial<Foreshadow> & { title: string }, keep?: KeptIdentity): Foreshadow {
  const now = nowIso();
  const id = keep?.id ?? uid("fore");
  const base: Foreshadow = {
    id, novelId, title: input.title, description: "", plantedChapterId: null,
    payoffChapterId: null, status: "planted", notes: "", createdAt: now, updatedAt: now,
  };
  const f: Foreshadow = { ...base, ...input, id, novelId };
  run(
    `INSERT INTO foreshadows (id,novel_id,title,description,planted_chapter_id,payoff_chapter_id,status,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [f.id, f.novelId, f.title, f.description, f.plantedChapterId, f.payoffChapterId, f.status, f.notes, keep?.createdAt ?? now, keep?.updatedAt ?? now],
  );
  return keep ? { ...f, createdAt: keep.createdAt, updatedAt: keep.updatedAt } : f;
}

export function updateForeshadow(id: ID, data: Partial<Foreshadow>): Foreshadow {
  patch("foreshadows", id, FORE_COLS, data as Record<string, unknown>);
  const row = get<Row>("SELECT * FROM foreshadows WHERE id = ?", [id]);
  if (!row) throw new Error(`foreshadow not found: ${id}`);
  return foreshadowFromRow(row);
}

export function deleteForeshadow(id: ID): void {
  run("DELETE FROM foreshadows WHERE id = ?", [id]);
}

/* ============================== 故事档案 ============================== */

const ARCHIVE_COLS: Record<string, string> = {
  chapterId: "chapter_id", chapterTitle: "chapter_title", orderIndex: "order_index",
  chapterSummary: "chapter_summary", characterStates: "character_states", settingStates: "setting_states",
  ledger: "ledger", timeline: "timeline", foreshadows: "foreshadows", conflicts: "conflicts",
  status: "status", sourceWordCount: "source_word_count", generatedBy: "generated_by", model: "model",
};

function archiveFromRow(r: Row): StoryArchive {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    chapterId: r.chapter_id ? s(r.chapter_id) : null,
    chapterTitle: s(r.chapter_title),
    orderIndex: n(r.order_index),
    chapterSummary: s(r.chapter_summary),
    characterStates: parseJson<StoryArchive["characterStates"]>(r.character_states, []),
    settingStates: parseJson<StoryArchive["settingStates"]>(r.setting_states, []),
    ledger: parseJson<StoryArchive["ledger"]>(r.ledger, []),
    timeline: parseJson<StoryArchive["timeline"]>(r.timeline, []),
    foreshadows: parseJson<StoryArchive["foreshadows"]>(r.foreshadows, []),
    conflicts: parseJson<StoryArchive["conflicts"]>(r.conflicts, []),
    status: s(r.status, "fresh") as ArchiveStatus,
    sourceWordCount: n(r.source_word_count),
    generatedBy: s(r.generated_by, "ai") === "manual" ? "manual" : "ai",
    model: s(r.model),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listArchives(novelId: ID): StoryArchive[] {
  return all<Row>("SELECT * FROM story_archives WHERE novel_id = ? ORDER BY order_index, created_at", [novelId]).map(archiveFromRow);
}

export function getArchiveByChapter(chapterId: ID): StoryArchive | undefined {
  const row = get<Row>("SELECT * FROM story_archives WHERE chapter_id = ?", [chapterId]);
  return row ? archiveFromRow(row) : undefined;
}

export function getArchive(id: ID): StoryArchive | undefined {
  const row = get<Row>("SELECT * FROM story_archives WHERE id = ?", [id]);
  return row ? archiveFromRow(row) : undefined;
}

export function upsertArchive(
  input: Partial<StoryArchive> & { novelId: ID; chapterId: ID | null },
): StoryArchive {
  const existing = input.chapterId ? getArchiveByChapter(input.chapterId) : undefined;
  const now = nowIso();
  if (existing) {
    patch("story_archives", existing.id, ARCHIVE_COLS, input as Record<string, unknown>, [
      "characterStates", "settingStates", "ledger", "timeline", "foreshadows", "conflicts",
    ]);
    return getArchive(existing.id)!;
  }
  const chapter = input.chapterId ? getChapter(input.chapterId) : undefined;
  const order = chapter ? n(get<{ c: number }>("SELECT COUNT(*) AS c FROM chapters WHERE novel_id = ? AND order_index <= ?", [input.novelId, chapter.orderIndex])?.c) : 0;
  const data: StoryArchive = {
    id: uid("arch"),
    novelId: input.novelId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle ?? chapter?.title ?? "",
    orderIndex: input.orderIndex ?? order,
    chapterSummary: input.chapterSummary ?? "",
    characterStates: input.characterStates ?? [],
    settingStates: input.settingStates ?? [],
    ledger: input.ledger ?? [],
    timeline: input.timeline ?? [],
    foreshadows: input.foreshadows ?? [],
    conflicts: input.conflicts ?? [],
    status: input.status ?? "fresh",
    sourceWordCount: input.sourceWordCount ?? chapter?.wordCount ?? 0,
    generatedBy: input.generatedBy ?? "ai",
    model: input.model ?? "",
    createdAt: now,
    updatedAt: now,
  };
  run(
    `INSERT INTO story_archives (id,novel_id,chapter_id,chapter_title,order_index,chapter_summary,character_states,setting_states,ledger,timeline,foreshadows,conflicts,status,source_word_count,generated_by,model,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.id, data.novelId, data.chapterId, data.chapterTitle, data.orderIndex, data.chapterSummary, toJson(data.characterStates), toJson(data.settingStates), toJson(data.ledger), toJson(data.timeline), toJson(data.foreshadows), toJson(data.conflicts), data.status, data.sourceWordCount, data.generatedBy, data.model, now, now],
  );
  return data;
}

export function deleteArchive(id: ID): void {
  run("DELETE FROM story_archives WHERE id = ?", [id]);
}

/** 当第 N 章被改动后，把后续章节的档案标记过期（AI 档案基于旧文本） */
export function markArchivesStaleAfter(novelId: ID, chapterOrderIndex: number): void {
  run("UPDATE story_archives SET status = 'stale', updated_at = ? WHERE novel_id = ? AND order_index > ? AND status = 'fresh'", [
    nowIso(), novelId, chapterOrderIndex,
  ]);
}

/** 单章内容大幅变化时标记自身档案过期 */
export function markArchiveStale(chapterId: ID): void {
  run("UPDATE story_archives SET status = 'stale', updated_at = ? WHERE chapter_id = ? AND status = 'fresh'", [nowIso(), chapterId]);
}

/* ============================== 对话 ============================== */

function sessionFromRow(r: Row): ChatSession {
  return {
    id: s(r.id),
    novelId: s(r.novel_id),
    chapterId: r.chapter_id ? s(r.chapter_id) : null,
    title: isDefaultChatTitle(s(r.title)) ? chatTitleFromMessage(s(r.first_user_content)) || "新对话" : s(r.title),
    agentId: s(r.agent_id, "supervisor") as ChatSession["agentId"],
    mode: s(r.mode, "chat") === "collaborate" ? "collaborate" : "chat",
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

// Resolve legacy default titles without loading full message histories or changing ordering.
const SESSION_SELECT = `SELECT chat_sessions.*, CASE WHEN trim(title) = '' OR trim(title) = '新对话' THEN
  (SELECT substr(content, 1, 256) FROM chat_messages WHERE session_id = chat_sessions.id
   AND role = 'user' AND trim(content) <> '' ORDER BY created_at, rowid LIMIT 1)
  END AS first_user_content FROM chat_sessions`;

export function listChatSessions(novelId: ID): ChatSession[] {
  return all<Row>(`${SESSION_SELECT} WHERE novel_id = ? ORDER BY updated_at DESC`, [novelId]).map(sessionFromRow);
}

export function getChatSession(id: ID): ChatSession | undefined {
  const row = get<Row>(`${SESSION_SELECT} WHERE id = ?`, [id]);
  return row ? sessionFromRow(row) : undefined;
}

export function createChatSession(
  novelId: ID,
  input: { agentId?: ChatSession["agentId"]; chapterId?: ID | null; title?: string; mode?: ChatSession["mode"] } = {},
): ChatSession {
  const now = nowIso();
  const session: ChatSession = {
    id: uid("chat"),
    novelId,
    chapterId: input.chapterId ?? null,
    title: input.title ?? "新对话",
    agentId: input.agentId ?? "supervisor",
    mode: input.mode ?? "chat",
    createdAt: now,
    updatedAt: now,
  };
  run("INSERT INTO chat_sessions (id,novel_id,chapter_id,title,agent_id,mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", [
    session.id, session.novelId, session.chapterId, session.title, session.agentId, session.mode, now, now,
  ]);
  return session;
}

export function updateChatSession(id: ID, data: Partial<ChatSession>): ChatSession {
  patch("chat_sessions", id, { title: "title", agentId: "agent_id", mode: "mode", chapterId: "chapter_id" }, data as Record<string, unknown>);
  const row = get<Row>(`${SESSION_SELECT} WHERE id = ?`, [id]);
  if (!row) throw new Error(`chat session not found: ${id}`);
  return sessionFromRow(row);
}

export function deleteChatSession(id: ID): void {
  run("DELETE FROM chat_sessions WHERE id = ?", [id]);
}

function messageFromRow(r: Row): ChatMessage {
  return {
    id: s(r.id),
    sessionId: s(r.session_id),
    role: s(r.role) === "assistant" ? "assistant" : "user",
    content: s(r.content),
    actions: parseJson<ChatMessage["actions"]>(r.actions, []),
    status: (s(r.status, "complete") as ChatMessage["status"]) ?? "complete",
    provider: s(r.provider),
    model: s(r.model),
    usage: parseJson<AiUsage | null>(r.usage, null),
    error: s(r.error),
    createdAt: s(r.created_at),
  };
}

export function listMessages(sessionId: ID): ChatMessage[] {
  return all<Row>("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at, rowid", [sessionId]).map(messageFromRow);
}

export function listMessagesPage(
  sessionId: ID,
  beforeId: ID | null,
  limit: number,
): { items: ChatMessage[]; hasMore: boolean; beforeId: ID | null } | null {
  const cursor = beforeId
    ? get<{ rowid: number }>("SELECT rowid FROM chat_messages WHERE session_id = ? AND id = ?", [sessionId, beforeId])
    : undefined;
  if (beforeId && !cursor) return null;

  const rows = cursor
    ? all<Row>(
        "SELECT * FROM chat_messages WHERE session_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT ?",
        [sessionId, cursor.rowid, limit + 1],
      )
    : all<Row>(
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY rowid DESC LIMIT ?",
        [sessionId, limit + 1],
      );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(messageFromRow).reverse();
  return { items, hasMore, beforeId: items[0]?.id ?? null };
}

export function listChatHistoryPage(
  sessionId: ID,
  limit: number,
): { items: ChatMessage[]; hasMore: boolean } {
  const rows = all<Row>(
    "SELECT * FROM chat_messages WHERE session_id = ? AND role IN ('user','assistant') AND status IN ('complete','streaming') AND trim(content) <> '' ORDER BY rowid DESC LIMIT ?",
    [sessionId, limit + 1],
  );
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(messageFromRow).reverse(), hasMore };
}

export function addMessage(
  sessionId: ID,
  input: { role: "user" | "assistant"; content?: string; actions?: ChatMessage["actions"]; status?: ChatMessage["status"]; provider?: string; model?: string; usage?: AiUsage | null; error?: string },
): ChatMessage {
  const now = nowIso();
  const msg: ChatMessage = {
    id: uid("msg"),
    sessionId,
    role: input.role,
    content: input.content ?? "",
    actions: input.actions ?? [],
    status: input.status ?? "complete",
    provider: input.provider ?? "",
    model: input.model ?? "",
    usage: input.usage ?? null,
    error: input.error ?? "",
    createdAt: now,
  };
  run("INSERT INTO chat_messages (id,session_id,role,content,actions,status,provider,model,usage,error,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
    msg.id, sessionId, msg.role, msg.content, toJson(msg.actions), msg.status, msg.provider, msg.model, msg.usage ? toJson(msg.usage) : null, msg.error, now,
  ]);
  const title = input.role === "user" ? chatTitleFromMessage(msg.content) : "";
  run(`UPDATE chat_sessions SET updated_at = ?, title = CASE
    WHEN (trim(title) = '' OR trim(title) = '新对话') AND ? <> '' THEN ? ELSE title END WHERE id = ?`,
    [now, title, title, sessionId]);
  return msg;
}

export function updateMessage(id: ID, data: Partial<ChatMessage>): ChatMessage {
  patch("chat_messages", id, { content: "content", actions: "actions", status: "status", usage: "usage", error: "error" }, data as Record<string, unknown>, ["actions", "usage"], false);
  const row = get<Row>("SELECT * FROM chat_messages WHERE id = ?", [id]);
  if (!row) throw new Error(`message not found: ${id}`);
  return messageFromRow(row);
}

export function deleteMessage(sessionId: ID, id: ID): boolean {
  const row = get<{ id: string }>("SELECT id FROM chat_messages WHERE session_id = ? AND id = ?", [sessionId, id]);
  if (!row) return false;
  run("DELETE FROM chat_messages WHERE session_id = ? AND id = ?", [sessionId, id]);
  return true;
}

/* ============================== 模型 Provider ============================== */

function providerFromRow(r: Row): ProviderConfig {
  return {
    id: s(r.id),
    name: s(r.name),
    kind: normalizeProviderKind(r.kind),
    baseUrl: s(r.base_url),
    apiKey: s(r.api_key),
    models: parseJson<ModelOption[]>(r.models, []),
    enabled: b(r.enabled),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  };
}

export function listProviders(): ProviderConfig[] {
  return all<Row>("SELECT * FROM providers ORDER BY created_at").map(providerFromRow);
}

export function getProvider(id: ID): ProviderConfig | undefined {
  const row = get<Row>("SELECT * FROM providers WHERE id = ?", [id]);
  return row ? providerFromRow(row) : undefined;
}

export function createProvider(input: Partial<ProviderConfig> & { name: string; kind?: ProviderKind }): ProviderConfig {
  const now = nowIso();
  const p: ProviderConfig = {
    id: uid("prov"), name: input.name, kind: normalizeProviderKind(input.kind), baseUrl: input.baseUrl ?? "", apiKey: input.apiKey ?? "",
    models: input.models ?? [], enabled: input.enabled ?? true, createdAt: now, updatedAt: now,
  };
  run("INSERT INTO providers (id,name,kind,base_url,api_key,models,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", [
    p.id, p.name, p.kind, p.baseUrl, p.apiKey, toJson(p.models), p.enabled ? 1 : 0, now, now,
  ]);
  return p;
}

export function updateProvider(id: ID, data: Partial<ProviderConfig>): ProviderConfig {
  const current = getProvider(id);
  if (!current) throw new Error(`provider not found: ${id}`);
  // apiKey 传空串表示不修改
  const payload = { ...data };
  if (!payload.apiKey) delete payload.apiKey;
  patch("providers", id, { name: "name", kind: "kind", baseUrl: "base_url", apiKey: "api_key", models: "models", enabled: "enabled" }, payload as Record<string, unknown>, ["models"]);
  const next = getProvider(id);
  if (!next) throw new Error(`provider not found: ${id}`);
  return next;
}

export function deleteProvider(id: ID): void {
  run("DELETE FROM providers WHERE id = ?", [id]);
}

/* ============================== 提示词预设 ============================== */

function presetFromRow(r: Row): PromptPreset {
  return {
    id: s(r.id),
    novelId: r.novel_id ? s(r.novel_id) : null,
    feature: s(r.feature, "chat") as AiFeature,
    name: s(r.name),
    systemPrompt: s(r.system_prompt),
    userTemplate: s(r.user_template),
    temperature: n(r.temperature, 0.8),
    modelRole: s(r.model_role, "chat") === "prose" ? "prose" : "chat",
    isBuiltin: b(r.is_builtin),
    enabled: b(r.enabled),
    updatedAt: s(r.updated_at),
  };
}

export function listPresets(novelId?: ID): PromptPreset[] {
  const rows = novelId
    ? all<Row>("SELECT * FROM prompt_presets WHERE novel_id IS NULL OR novel_id = ? ORDER BY is_builtin DESC, name", [novelId])
    : all<Row>("SELECT * FROM prompt_presets ORDER BY is_builtin DESC, name");
  return rows.map(presetFromRow);
}

export function getPreset(id: ID): PromptPreset | undefined {
  const row = get<Row>("SELECT * FROM prompt_presets WHERE id = ?", [id]);
  return row ? presetFromRow(row) : undefined;
}

export function upsertPreset(input: Partial<PromptPreset> & { feature: AiFeature; name: string }): PromptPreset {
  const now = nowIso();
  const existing = input.id ? getPreset(input.id) : undefined;
  if (existing) {
    patch("prompt_presets", existing.id, { name: "name", systemPrompt: "system_prompt", userTemplate: "user_template", temperature: "temperature", modelRole: "model_role", enabled: "enabled", novelId: "novel_id" }, input as Record<string, unknown>);
    return getPreset(existing.id)!;
  }
  const p: PromptPreset = {
    id: uid("preset"),
    novelId: input.novelId ?? null,
    feature: input.feature,
    name: input.name,
    systemPrompt: input.systemPrompt ?? "",
    userTemplate: input.userTemplate ?? "",
    temperature: input.temperature ?? 0.8,
    modelRole: input.modelRole ?? "chat",
    isBuiltin: input.isBuiltin ?? false,
    enabled: input.enabled ?? true,
    updatedAt: now,
  };
  run("INSERT INTO prompt_presets (id,novel_id,feature,name,system_prompt,user_template,temperature,model_role,is_builtin,enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
    p.id, p.novelId, p.feature, p.name, p.systemPrompt, p.userTemplate, p.temperature, p.modelRole, p.isBuiltin ? 1 : 0, p.enabled ? 1 : 0, now,
  ]);
  return p;
}

export function deletePreset(id: ID): void {
  run("DELETE FROM prompt_presets WHERE id = ? AND is_builtin = 0", [id]);
}

/** 把内置预设写入数据库。缺少则插入；文案与代码不一致时同步（内置预设在界面里不可编辑）。 */
export function ensureBuiltinPresets(defs: Array<Omit<PromptPreset, "id" | "updatedAt" | "novelId">>): void {
  const existing = new Map(
    listPresets()
      .filter((preset) => preset.isBuiltin && preset.novelId === null)
      .map((preset) => [`${preset.feature}::${preset.name}`, preset]),
  );
  tx(() => {
    for (const def of defs) {
      const key = `${def.feature}::${def.name}`;
      const row = existing.get(key);
      const now = nowIso();
      if (!row) {
        run(
          "INSERT INTO prompt_presets (id,novel_id,feature,name,system_prompt,user_template,temperature,model_role,is_builtin,enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [uid("preset"), null, def.feature, def.name, def.systemPrompt, def.userTemplate, def.temperature, def.modelRole, 1, def.enabled ? 1 : 0, now],
        );
        continue;
      }
      if (
        row.systemPrompt === def.systemPrompt &&
        row.userTemplate === def.userTemplate &&
        row.temperature === def.temperature &&
        row.modelRole === def.modelRole
      ) {
        continue;
      }
      run(
        "UPDATE prompt_presets SET system_prompt = ?, user_template = ?, temperature = ?, model_role = ?, updated_at = ? WHERE id = ? AND is_builtin = 1",
        [def.systemPrompt, def.userTemplate, def.temperature, def.modelRole, now, row.id],
      );
    }
  });
}

/* ============================== 设置 ============================== */

export function getSettings(): AppSettings {
  const row = get<Row>("SELECT value FROM app_settings WHERE key = 'app'");
  const stored = row ? parseJson<Partial<AppSettings>>(row.value, {}) : {};
  const merged: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...stored,
    defaultContext: { ...DEFAULT_APP_SETTINGS.defaultContext, ...(stored.defaultContext ?? {}) },
    models: unifyModelSettings(stored.models ?? DEFAULT_APP_SETTINGS.models),
    aiPricing: { ...DEFAULT_APP_SETTINGS.aiPricing, ...(stored.aiPricing ?? {}) },
  };
  return merged;
}

/** 实际生效的 AI 单价：用户填过就用用户的；全 0 时按内置 DeepSeek 官方价目表
 * 取当前时段（高峰/空闲）的价格，用于底栏「预估 ¥x」。缺用户值时不再返回 0。 */
export function getEffectiveAiPricing(settings: AppSettings = getSettings()): AppSettings["aiPricing"] {
  const stored = settings.aiPricing;
  const filled = stored.inputPerMillion > 0 || stored.outputPerMillion > 0 || (stored.cachedInputPerMillion ?? 0) > 0;
  if (filled) return stored;
  const target = settings.models.chat;
  const provider = target.providerId ? getProvider(target.providerId) : undefined;
  // 只有 DeepSeek 官方服务与 harness 通道按 DeepSeek 官方价目计费。
  if (!provider || (provider.kind !== "deepseek" && provider.kind !== "harness")) return stored;
  const model = target.model || provider.models[0]?.id || "";
  return builtinAiPricing(model) ?? stored;
}

export function saveSettings(patchIn: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patchIn };
  next.models = unifyModelSettings(next.models);
  run(
    "INSERT INTO app_settings (key,value,updated_at) VALUES ('app',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    [toJson(next), nowIso()],
  );
  return next;
}

/* ============================== AI 日志 ============================== */

export function addAiLog(input: {
  novelId?: ID | null;
  chapterId?: ID | null;
  feature: AiFeature;
  provider: string;
  model: string;
  cachedInputTokens?:number;
  cacheReportedInputTokens?:number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  status?: AiLogStatus;
  error?: string;
  promptPreview?: string;
  responsePreview?: string;
}): void {
  run(
    `INSERT INTO ai_logs (id,novel_id,chapter_id,feature,provider,model,prompt_tokens,completion_tokens,latency_ms,status,error,prompt_preview,response_preview,created_at,cached_input_tokens,cache_reported_input_tokens)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uid("log"), input.novelId ?? null, input.chapterId ?? null, input.feature, input.provider, input.model, input.promptTokens ?? 0, input.completionTokens ?? 0, input.latencyMs ?? 0, input.status ?? "ok", input.error ?? "", (input.promptPreview ?? "").slice(0, 800), (input.responsePreview ?? "").slice(0, 800), nowIso(),input.cachedInputTokens??0,input.cacheReportedInputTokens??0],
  );
}

export function listAiLogs(limit = 50): AiLog[] {
  return all<Row>("SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT ?", [limit]).map((r) => ({
    id: s(r.id),
    novelId: r.novel_id ? s(r.novel_id) : null,
    chapterId: r.chapter_id ? s(r.chapter_id) : null,
    feature: s(r.feature) as AiFeature,
    provider: s(r.provider),
    model: s(r.model),
    promptTokens: n(r.prompt_tokens),
    cachedInputTokens:n(r.cached_input_tokens),cacheReportedInputTokens:n(r.cache_reported_input_tokens),
    completionTokens: n(r.completion_tokens),
    latencyMs: n(r.latency_ms),
    status: s(r.status, "ok") as AiLogStatus,
    error: s(r.error),
    promptPreview: s(r.prompt_preview),
    responsePreview: s(r.response_preview),
    createdAt: s(r.created_at),
  }));
}

/* ============================== 字数统计 ============================== */

function bumpWordSnapshot(delta: number, tokens = 0): void {
  const date = new Date().toISOString().slice(0, 10);
  run(
    `INSERT INTO word_snapshots (date, words, ai_tokens) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET words = words + excluded.words, ai_tokens = ai_tokens + excluded.ai_tokens`,
    [date, delta, tokens],
  );
}

function localDayRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function tokenBucket(where: string, params: unknown[] = []): { calls: number; promptTokens: number; completionTokens: number;cachedInputTokens:number;cacheReportedInputTokens:number } {
  const row = get<Row>(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(prompt_tokens),0) AS prompt, COALESCE(SUM(completion_tokens),0) AS completion, COALESCE(SUM(cached_input_tokens),0) AS cached, COALESCE(SUM(cache_reported_input_tokens),0) AS cache_reported FROM ai_logs ${where}`,
    params,
  );
  return {
    calls: n(row?.calls),
    promptTokens: n(row?.prompt),
    completionTokens: n(row?.completion),
    cachedInputTokens:n(row?.cached),cacheReportedInputTokens:n(row?.cache_reported),
  };
}

export function recordWordDelta(delta: number): void {
  if (!delta) return;
  bumpWordSnapshot(delta, 0);
}

export function recordAiTokens(tokens: number): void {
  if (!tokens) return;
  bumpWordSnapshot(0, tokens);
}

export function getStats(): DashboardStats {
  const totalWords = n(get<{ v: number }>("SELECT COALESCE(SUM(word_count),0) AS v FROM chapters")?.v);
  const chapterCount = n(get<{ v: number }>("SELECT COUNT(*) AS v FROM chapters")?.v);
  const doneChapters = n(get<{ v: number }>("SELECT COUNT(*) AS v FROM chapters WHERE status = 'done'")?.v);
  const novelCount = n(get<{ v: number }>("SELECT COUNT(*) AS v FROM novels")?.v);
  const today = new Date().toISOString().slice(0, 10);
  const todayWords = n(get<{ v: number }>("SELECT COALESCE(words,0) AS v FROM word_snapshots WHERE date = ?", [today])?.v);
  const weekRows = all<Row>("SELECT date, words, ai_tokens FROM word_snapshots ORDER BY date DESC LIMIT 30");
  const weekWords = weekRows.slice(0, 7).reduce((acc, r) => acc + n(r.words), 0);
  const aiCalls = n(get<{ v: number }>("SELECT COUNT(*) AS v FROM ai_logs")?.v);
  const totals = tokenBucket("");
  const todayRange = localDayRange();
  const todayAi = tokenBucket("WHERE created_at >= ? AND created_at < ?", [todayRange.start, todayRange.end]);
  const aiTokens = totals.promptTokens + totals.completionTokens;
  const daily = weekRows
    .slice(0, 14)
    .map((r) => ({ date: s(r.date), words: n(r.words), aiTokens: n(r.ai_tokens) }))
    .reverse();
  let streakDays = 0;
  const map = new Map(weekRows.map((r) => [s(r.date), n(r.words)]));
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if ((map.get(key) ?? 0) > 0) streakDays++;
    else if (i > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    totalWords,
    todayWords,
    weekWords,
    novelCount,
    chapterCount,
    doneChapters,
    aiCalls,
    aiTokens,
    aiPromptTokens: totals.promptTokens,
    aiCachedInputTokens:totals.cachedInputTokens,aiCacheReportedInputTokens:totals.cacheReportedInputTokens,
    aiCompletionTokens: totals.completionTokens,
    todayAiCalls: todayAi.calls,
    todayPromptTokens: todayAi.promptTokens,
    todayCachedInputTokens:todayAi.cachedInputTokens,todayCacheReportedInputTokens:todayAi.cacheReportedInputTokens,
    todayCompletionTokens: todayAi.completionTokens,
    aiPricing: getEffectiveAiPricing(),
    streakDays,
    daily,
    recentNovels: listNovels().slice(0, 4).map((nv) => ({
      id: nv.id, title: nv.title, genre: nv.genre, coverKey: nv.coverKey, updatedAt: nv.updatedAt, wordGoal: nv.wordGoal,
    })),
  };
}

/* ============================== 全文检索 ============================== */

export function search(q: string): SearchResult[] {
  const query = q.trim();
  if (!query) return [];
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const items: SearchResult[] = [];
  for (const r of all<Row>("SELECT id,title,synopsis FROM novels WHERE title LIKE ? OR synopsis LIKE ? LIMIT 10", [like, like])) {
    items.push({ type: "novel", id: s(r.id), novelId: s(r.id), title: s(r.title), snippet: s(r.synopsis).slice(0, 80) });
  }
  for (const r of all<Row>("SELECT id,novel_id,title,substr(content,1,200) AS c FROM chapters WHERE title LIKE ? OR content LIKE ? LIMIT 15", [like, like])) {
    items.push({ type: "chapter", id: s(r.id), novelId: s(r.novel_id), title: s(r.title), snippet: s(r.c).replace(/<[^>]*>/g, "").slice(0, 80), chapterId: s(r.id) });
  }
  for (const r of all<Row>("SELECT id,novel_id,name,identity FROM characters WHERE name LIKE ? OR identity LIKE ? LIMIT 10", [like, like])) {
    items.push({ type: "character", id: s(r.id), novelId: s(r.novel_id), title: s(r.name), snippet: s(r.identity).slice(0, 80) });
  }
  for (const r of all<Row>("SELECT id,novel_id,title,summary FROM world_settings WHERE title LIKE ? OR summary LIKE ? LIMIT 10", [like, like])) {
    items.push({ type: "world", id: s(r.id), novelId: s(r.novel_id), title: s(r.title), snippet: s(r.summary).slice(0, 80) });
  }
  for (const r of all<Row>("SELECT id,novel_id,chapter_title,chapter_summary FROM story_archives WHERE chapter_summary LIKE ? LIMIT 10", [like])) {
    items.push({ type: "archive", id: s(r.id), novelId: s(r.novel_id), title: s(r.chapter_title), snippet: s(r.chapter_summary).slice(0, 80) });
  }
  return items.slice(0, 40);
}
