import { randomUUID } from "node:crypto"
import { closeSync, openSync, unlinkSync } from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { ApiError } from "@/lib/api-utils"
import type { BackupImportResult, BackupPreferences, BackupPreview } from "@/lib/backup-format"
import type { AgentRun } from "@/lib/ai/agent/types"
import type { AiAction } from "@/lib/types"
import { uid } from "@/lib/ui/cn"
import { applySchemaMigrations, getDb, getDbPath, openBackupDatabase, SCHEMA_VERSION, tx, type DB } from "./index"
import { invalidBackup } from "./backup-file"
import { remapId, restoreActions, restoreAgentRun, restoreRelations } from "./backup-references"
import { sanitizeBackupPreferences, remapBackupPreferences } from "@/lib/backup-preferences"

type Cell = string | number | null
type Row = Record<string, Cell>
type Rows = Record<Table, Row[]>
type Column = { name: string; type: "TEXT" | "INTEGER" | "REAL"; pk: number; notnull: number }

// Parent tables precede dependents. Book scope follows the owning novel even for chat messages.
const tables = [
  "novels", "volumes", "chapters", "novel_outlines", "volume_outlines", "chapter_blueprints",
  "characters", "world_settings", "locations", "foreshadows", "story_archives", "chat_sessions",
  "chat_messages", "prompt_presets", "ai_logs", "agent_runs", "codex_order",
  "providers", "app_settings", "word_snapshots",
] as const
type Table = typeof tables[number]
const globalTables = new Set<Table>(["providers", "app_settings", "word_snapshots"])

interface Snapshot {
  version: 1
  schema: number
  scope: "all" | "books"
  createdAt: string
  includesKeys: boolean
  preferences: BackupPreferences
  rows: Rows
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function columns(db: DB, table: Table): Column[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Column[]
}

function collect(db: DB, novelIds: string[] | null, includesKeys: boolean): Rows {
  const ids = novelIds === null ? [] : [JSON.stringify(novelIds)]
  const selected = "SELECT value FROM json_each(?)"
  return Object.fromEntries(tables.map(table => {
    if (novelIds && globalTables.has(table)) return [table, []]
    const filter = novelIds === null ? "" : table === "novels" ? `WHERE id IN (${selected})` :
      table === "chat_messages" ? `WHERE session_id IN (SELECT id FROM chat_sessions WHERE novel_id IN (${selected}))` :
        `WHERE novel_id IN (${selected})`
    // rowid retains the insertion order of rows with equal timestamps (chat history, for example).
    const fields = table === "providers" && !includesKeys
      ? columns(db, table).map(({ name }) => name === "api_key" ? "'' AS api_key" : name).join(",")
      : "*"
    return [table, db.prepare(`SELECT ${fields} FROM ${table} ${filter} ORDER BY rowid`).all(...ids)]
  })) as Rows
}

export function selectBackupBooks(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(id => typeof id !== "string" || !id || id.length > 160)) {
    throw new ApiError("请至少选择一部作品")
  }
  return [...new Set(value)]
}

export function createSnapshot(novelIds: string[] | null, includesKeys: boolean, preferences: unknown): Snapshot {
  const rows = tx(() => collect(getDb(), novelIds, includesKeys))
  if (novelIds && rows.novels.length !== novelIds.length) throw new ApiError("部分作品已不存在，请刷新后重试", 404)
  return {
    version: 1,
    schema: SCHEMA_VERSION,
    scope: novelIds === null ? "all" : "books",
    createdAt: new Date().toISOString(),
    includesKeys,
    preferences: sanitizeBackupPreferences(preferences, rows.novels.map(row => String(row.id)), novelIds === null),
    rows,
  }
}

function insertRows(db: DB, table: Table, rows: Row[], allowDefaults = false): void {
  const definitions = columns(db, table)
  const names = new Set(definitions.map(column => column.name))
  const statements = new Map<string, ReturnType<DB["prepare"]>>()
  for (const row of rows) {
    if (!object(row) || Object.keys(row).some(name => !names.has(name))) throw invalidBackup()
    const present = definitions.filter(column => Object.hasOwn(row, column.name))
    if (!allowDefaults && present.length !== definitions.length) throw invalidBackup()
    const fields = present.map(column => column.name).join(",")
    let statement = statements.get(fields)
    if (!statement) {
      statement = db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${present.map(() => "?").join(",")})`)
      statements.set(fields, statement)
    }
    const values: SQLInputValue[] = present.map(({ name, type, pk, notnull }) => {
      const value = row[name]
      if (value === null && !pk && !notnull) return value
      if (type === "TEXT" && typeof value === "string" && (!pk || value.length > 0)) return value
      if (type === "INTEGER" && typeof value === "number" && Number.isSafeInteger(value)) return value
      if (type === "REAL" && typeof value === "number" && Number.isFinite(value)) return value
      throw invalidBackup()
    })
    statement.run(...values)
  }
}

const scopedLinks = [
  ["chapters", "volume_id", "volumes"],
  ["volume_outlines", "volume_id", "volumes"],
  ["chapter_blueprints", "chapter_id", "chapters"],
  ["world_settings", "parent_id", "world_settings"],
  ["locations", "parent_id", "locations"],
  ["story_archives", "chapter_id", "chapters"],
  ["chat_sessions", "chapter_id", "chapters"],
] as const

function verifyLinks(db: DB): void {
  if (db.prepare("PRAGMA foreign_key_check").get()) throw invalidBackup()
  for (const [table, field, target] of scopedLinks) {
    const invalid = db.prepare(`SELECT 1 FROM ${table} AS source JOIN ${target} AS target
      ON source.${field} = target.id WHERE source.novel_id <> target.novel_id LIMIT 1`).get()
    if (invalid) throw invalidBackup()
  }
}

const jsonArrays: Partial<Record<Table, string[]>> = {
  novels: ["tags", "forbidden_words"],
  novel_outlines: ["subplots", "character_arcs", "world_rules", "hooks"],
  volume_outlines: ["key_events", "foreshadow_plan"],
  chapter_blueprints: ["scenes", "plot_points", "hooks"],
  characters: ["aliases", "tags", "relations"],
  locations: ["aliases", "tags"],
  world_settings: ["tags"],
  story_archives: ["character_states", "setting_states", "ledger", "timeline", "foreshadows", "conflicts"],
  chat_messages: ["actions"],
  codex_order: ["ids"],
  providers: ["models"],
}

function verifyJson(rows: Rows): void {
  for (const [table, fields] of Object.entries(jsonArrays) as [Table, string[]][]) {
    for (const row of rows[table]) {
      for (const field of fields) if (!Array.isArray(JSON.parse(String(row[field])))) throw invalidBackup()
    }
  }
  for (const row of rows.agent_runs) {
    const run = JSON.parse(String(row.data))
    if (!object(run) || run.id !== row.id || run.novelId !== row.novel_id ||
      !Array.isArray(run.steps) || !Array.isArray(run.references) || !Array.isArray(run.changes) ||
      run.steps.some(step => !object(step)) ||
      run.changes.some(change => !object(change) || typeof change.id !== "string" || !object(change.after))) throw invalidBackup()
  }
  for (const row of rows.app_settings) {
    if (row.key === "app" && !object(JSON.parse(String(row.value)))) throw invalidBackup()
  }
}

export function readSnapshot(value: unknown, encrypted: boolean): Snapshot {
  if (!object(value) || value.version !== 1 || typeof value.schema !== "number" ||
    !Number.isInteger(value.schema) || value.schema < 1 || value.schema > SCHEMA_VERSION) {
    throw new ApiError("此备份版本不受支持，请升级砚田后重试")
  }
  if (!object(value.rows) || (value.scope !== "all" && value.scope !== "books") ||
    typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.includesKeys !== "boolean" || (value.includesKeys && (!encrypted || value.scope !== "all"))) {
    throw invalidBackup()
  }
  const source = value.rows
  const older = value.schema < SCHEMA_VERSION
  if (Object.keys(source).some(name => !tables.includes(name as Table))) throw invalidBackup()
  const scratch = openBackupDatabase()
  try {
    scratch.exec("BEGIN; PRAGMA defer_foreign_keys = ON")
    for (const table of tables) {
      const rows = source[table] ?? (older ? [] : undefined)
      if (!Array.isArray(rows)) throw invalidBackup()
      if (value.scope === "books" && (globalTables.has(table) && rows.length || table === "prompt_presets" && rows.some(row => row?.novel_id == null))) {
        throw invalidBackup()
      }
      if (table === "providers" && !value.includesKeys && rows.some(row => row?.api_key)) throw invalidBackup()
      insertRows(scratch, table, rows, older)
    }
    if (older) applySchemaMigrations(scratch, value.schema)
    verifyLinks(scratch)
    scratch.exec("COMMIT")
    const rows = collect(scratch, null, value.includesKeys)
    verifyJson(rows)
    if (value.scope === "books" && !rows.novels.length) throw invalidBackup()
    return {
      version: 1, schema: SCHEMA_VERSION, scope: value.scope, createdAt: value.createdAt,
      includesKeys: value.includesKeys, rows,
      preferences: sanitizeBackupPreferences(value.preferences, rows.novels.map(row => String(row.id)), value.scope === "all"),
    }
  } catch {
    throw invalidBackup()
  } finally {
    scratch.close()
  }
}

export function previewSnapshot(snapshot: Snapshot, fingerprint: string): BackupPreview {
  const local = getDb().prepare("SELECT id FROM novels").all()
  const currentIds = new Set(local.map(row => row.id))
  const counts = new Map<string, BackupPreview["books"][number]>()
  for (const { id, title } of snapshot.rows.novels) {
    counts.set(String(id), { id: String(id), title: String(title), chapters: 0, notes: 0, conversations: 0, existing: currentIds.has(id) })
  }
  for (const [field, groups] of [
    ["chapters", ["chapters"]],
    ["notes", ["novel_outlines", "volume_outlines", "chapter_blueprints", "characters", "world_settings", "locations", "foreshadows", "story_archives"]],
    ["conversations", ["chat_sessions"]],
  ] as const) {
    for (const group of groups) {
      for (const row of snapshot.rows[group]) {
        const book = counts.get(String(row.novel_id))
        if (book) book[field]++
      }
    }
  }
  return { scope: snapshot.scope, createdAt: snapshot.createdAt, books: [...counts.values()], localBooks: local.length, includesKeys: snapshot.includesKeys, fingerprint }
}

function selectRows(rows: Rows, selected: Set<string>): Rows {
  const sessions = new Set(rows.chat_sessions.filter(row => selected.has(String(row.novel_id))).map(row => row.id))
  return Object.fromEntries(tables.map(table => [
    table, globalTables.has(table) ? [] : rows[table].filter(row =>
      table === "chat_messages" ? sessions.has(row.session_id) :
        selected.has(String(table === "novels" ? row.id : row.novel_id))),
  ])) as Rows
}

const rowLinks = ["id", "novel_id", "volume_id", "chapter_id", "parent_id", "session_id", "planted_chapter_id", "payoff_chapter_id"]

function copyIds(rows: Rows): Map<string, string> {
  const ids = new Map<string, string>()
  const add = (id: string) => {
    // Older backups can omit prefixes. Preserve them when present for existing UI links.
    if (!ids.has(id)) ids.set(id, uid(/^([a-z]+)_/i.exec(id)?.[1] ?? "import"))
  }
  for (const table of tables) {
    for (const row of rows[table]) if (typeof row.id === "string") add(row.id)
  }
  for (const row of rows.agent_runs) {
    const run = JSON.parse(String(row.data)) as AgentRun
    for (const change of run.changes) {
      add(change.id)
      // A deleted chapter is absent from the table but an applied proposal can restore it.
      if (change.chapterDirectory?.kind === "delete" && change.state === "applied" && change.appliedId) add(change.appliedId)
      if (change.chapterPair?.kind === "merge" && change.state === "applied") add(change.chapterPair.second.id)
    }
  }
  return ids
}

function prepareRow(table: Table, source: Row, ids: Map<string, string>): Row {
  const row = { ...source }
  for (const key of rowLinks) {
    const value = row[key]
    if (typeof value === "string") row[key] = remapId(value, ids)
  }
  if (ids.size && table === "characters") row.relations = JSON.stringify(restoreRelations(JSON.parse(String(row.relations)), ids))
  if (ids.size && table === "codex_order") {
    row.ids = JSON.stringify((JSON.parse(String(row.ids)) as string[]).map(id => remapId(id, ids)))
  }
  if (table === "agent_runs") {
    const run = JSON.parse(String(row.data)) as AgentRun
    if (ids.size || run.status === "running") row.data = JSON.stringify(restoreAgentRun(run, ids))
  }
  if (table === "chat_messages") {
    if (ids.size) row.actions = JSON.stringify(restoreActions(JSON.parse(String(row.actions)) as AiAction[], ids))
    if (row.status === "streaming") row.status = "aborted"
  }
  return row
}

function recoverySnapshot(): string {
  const name = `yanfield-before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.db`
  const file = path.join(path.dirname(getDbPath()), name)
  const reader = new DatabaseSync(getDbPath(), { readOnly: true })
  let created = false
  try {
    closeSync(openSync(file, "wx", 0o600))
    created = true
    reader.prepare("VACUUM INTO ?").run(file)
    return name
  } catch {
    if (created) {
      try { unlinkSync(file) } catch { /* best effort */ }
    }
    throw new ApiError("无法创建恢复前备份，恢复已停止", 500)
  } finally {
    reader.close()
  }
}

export function importSnapshot(snapshot: Snapshot, selected: string[] | null): BackupImportResult {
  if (!selected && snapshot.scope !== "all") throw new ApiError("仅整库备份支持整库恢复")
  const rows = selected ? selectRows(snapshot.rows, new Set(selected)) : snapshot.rows
  if (selected && rows.novels.length !== selected.length) throw new ApiError("部分作品已不存在，请刷新后重试", 404)
  const ids = selected ? copyIds(rows) : new Map<string, string>()
  const db = getDb()
  let recoveryFile: string | undefined
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec("PRAGMA defer_foreign_keys = ON")
    const destinationKeys = new Map<string, Row>()
    if (!selected) {
      recoveryFile = recoverySnapshot()
      if (!snapshot.includesKeys) {
        for (const row of db.prepare("SELECT id,kind,base_url,api_key FROM providers").all() as Row[]) {
          destinationKeys.set(String(row.id), row)
        }
      }
      for (const table of [...tables].reverse()) db.exec(`DELETE FROM ${table}`)
    }
    for (const table of tables) {
      const prepared = rows[table].map(source => {
        const row = prepareRow(table, source, ids)
        if (table === "providers" && !snapshot.includesKeys) {
          const existing = destinationKeys.get(String(row.id))
          if (existing?.kind === row.kind && existing?.base_url === row.base_url) row.api_key = existing.api_key
        }
        return row
      })
      insertRows(db, table, prepared)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    if (error instanceof ApiError) throw error
    throw new ApiError("无法写入备份，原有数据已保留", 500)
  }
  return {
    books: rows.novels.length,
    recoveryFile,
    preferences: remapBackupPreferences(snapshot.preferences, rows.novels.map(row => String(row.id)), ids, !selected),
  }
}
