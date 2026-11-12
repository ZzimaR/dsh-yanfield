import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { resolveDbPath } from "./data-path.mjs";

/**
 * SQLite 访问层（使用 Node 内置 node:sqlite，零原生依赖）
 * - 数据库文件默认在系统用户数据目录（见 data-path.mjs），可用 YANFIELD_DB_PATH 覆盖
 * - 单例 + WAL + 外键约束 + user_version 版本化迁移
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS novels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '玄幻',
  tags TEXT NOT NULL DEFAULT '[]',
  synopsis TEXT NOT NULL DEFAULT '',
  cover_key TEXT NOT NULL DEFAULT 'ink',
  status TEXT NOT NULL DEFAULT 'draft',
  word_goal INTEGER NOT NULL DEFAULT 1000000,
  target_chapters INTEGER NOT NULL DEFAULT 300,
  style_guide TEXT NOT NULL DEFAULT '',
  pov TEXT NOT NULL DEFAULT '',
  forbidden_words TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_novels_updated ON novels(updated_at DESC);

CREATE TABLE IF NOT EXISTS volumes (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_volumes_novel ON volumes(novel_id, order_index);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  volume_id TEXT REFERENCES volumes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  order_index INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novel_id, order_index);
CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id, order_index);

CREATE TABLE IF NOT EXISTS novel_outlines (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL UNIQUE REFERENCES novels(id) ON DELETE CASCADE,
  premise TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  main_plot TEXT NOT NULL DEFAULT '',
  subplots TEXT NOT NULL DEFAULT '[]',
  character_arcs TEXT NOT NULL DEFAULT '[]',
  world_rules TEXT NOT NULL DEFAULT '[]',
  ending TEXT NOT NULL DEFAULT '',
  hooks TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volume_outlines (
  id TEXT PRIMARY KEY,
  volume_id TEXT NOT NULL UNIQUE REFERENCES volumes(id) ON DELETE CASCADE,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  arc_goal TEXT NOT NULL DEFAULT '',
  key_events TEXT NOT NULL DEFAULT '[]',
  foreshadow_plan TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapter_blueprints (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL UNIQUE REFERENCES chapters(id) ON DELETE CASCADE,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  goal TEXT NOT NULL DEFAULT '',
  pov TEXT NOT NULL DEFAULT '',
  conflict TEXT NOT NULL DEFAULT '',
  emotional_arc TEXT NOT NULL DEFAULT '',
  scenes TEXT NOT NULL DEFAULT '[]',
  plot_points TEXT NOT NULL DEFAULT '[]',
  hooks TEXT NOT NULL DEFAULT '[]',
  target_words INTEGER NOT NULL DEFAULT 2500,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  role TEXT NOT NULL DEFAULT 'supporting',
  gender TEXT NOT NULL DEFAULT '',
  age TEXT NOT NULL DEFAULT '',
  identity TEXT NOT NULL DEFAULT '',
  appearance TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  secrets TEXT NOT NULL DEFAULT '',
  arc TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  relations TEXT NOT NULL DEFAULT '[]',
  current_state TEXT NOT NULL DEFAULT '',
  ai_visible INTEGER NOT NULL DEFAULT 1,
  reveal_at_chapter INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_novel ON characters(novel_id);

CREATE TABLE IF NOT EXISTS world_settings (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES world_settings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  importance TEXT NOT NULL DEFAULT 'medium',
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  ai_visible INTEGER NOT NULL DEFAULT 1,
  reveal_at_chapter INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_world_novel ON world_settings(novel_id, order_index);

CREATE TABLE IF NOT EXISTS foreshadows (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  planted_chapter_id TEXT,
  payoff_chapter_id TEXT,
  status TEXT NOT NULL DEFAULT 'planted',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foreshadows_novel ON foreshadows(novel_id, status);

CREATE TABLE IF NOT EXISTS story_archives (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  chapter_title TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  chapter_summary TEXT NOT NULL DEFAULT '',
  character_states TEXT NOT NULL DEFAULT '[]',
  setting_states TEXT NOT NULL DEFAULT '[]',
  ledger TEXT NOT NULL DEFAULT '[]',
  timeline TEXT NOT NULL DEFAULT '[]',
  foreshadows TEXT NOT NULL DEFAULT '[]',
  conflicts TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'fresh',
  source_word_count INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL DEFAULT 'ai',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_archives_novel ON story_archives(novel_id, order_index);
CREATE INDEX IF NOT EXISTS idx_archives_chapter ON story_archives(chapter_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '新对话',
  agent_id TEXT NOT NULL DEFAULT 'supervisor',
  mode TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_novel ON chat_sessions(novel_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  actions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'complete',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  usage TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_presets (
  id TEXT PRIMARY KEY,
  novel_id TEXT REFERENCES novels(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  temperature REAL NOT NULL DEFAULT 0.8,
  model_role TEXT NOT NULL DEFAULT 'chat',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompts_feature ON prompt_presets(feature, enabled);

CREATE TABLE IF NOT EXISTS ai_logs (
  id TEXT PRIMARY KEY,
  novel_id TEXT,
  chapter_id TEXT,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT NOT NULL DEFAULT '',
  prompt_preview TEXT NOT NULL DEFAULT '',
  response_preview TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON ai_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_novel ON ai_logs(novel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_snapshots (
  date TEXT PRIMARY KEY,
  words INTEGER NOT NULL DEFAULT 0,
  ai_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_novel ON agent_runs(novel_id, created_at DESC);
`;

export type DB = DatabaseSync;

let dbInstance: DB | null = null;

function columnsOf(db: DB, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
}

/**
 * 按 PRAGMA user_version 顺序执行的迁移；MIGRATIONS[i] 把库从版本 i 升到 i + 1。
 * 以后改表结构只追加新迁移，不要修改已发布的迁移。
 */
const MIGRATIONS: ((db: DB) => void)[] = [
  // v1：基线。补齐版本化之前开发期数据库缺少的列。
  (db) => {
    const logColumns = columnsOf(db, "ai_logs");
    for (const column of ["cached_input_tokens", "cache_reported_input_tokens"]) {
      if (!logColumns.has(column)) db.exec(`ALTER TABLE ai_logs ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    if (!columnsOf(db, "world_settings").has("importance")) {
      db.exec("ALTER TABLE world_settings ADD COLUMN importance TEXT NOT NULL DEFAULT 'medium'");
    }
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function readUserVersion(db: DB): number {
  return Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
}

function migrate(db: DB, dbPath: string): void {
  const current = readUserVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `数据库版本为 ${current}，高于当前程序支持的 ${SCHEMA_VERSION}。请升级砚田后再打开：${dbPath}`,
    );
  }
  db.exec(SCHEMA);
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version](db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

/** 当前进程实际使用的数据库文件绝对路径 */
export function getDbPath(): string {
  return resolveDbPath();
}

export function getDb(): DB {
  if (dbInstance) return dbInstance;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    migrate(db, dbPath);
  } catch (err) {
    db.close();
    throw err;
  }
  dbInstance = db;
  return db;
}

/* ---------------- 查询辅助 ---------------- */

export type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...(params as never[]));
}

export function exec(sql: string) {
  getDb().exec(sql);
}

/** 简单事务包装 */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/* ---------------- 序列化辅助 ---------------- */

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function boolOf(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
