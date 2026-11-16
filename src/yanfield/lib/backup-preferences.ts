import type { BackupPreferences } from "./backup-format"

const prefix = "yanfield:editor:"
const themeKey = "yanfield:theme"
const fontKey = "yanfield:ui-font"
const sizeKey = "yanfield:float-window:size"
const globalKeys = [
  themeKey, fontKey, sizeKey,
  ...["left-open", "right-open", "immersive", "typewriter", "focus-paragraph"].map(key => prefix + key),
]
const bookKeys = ["tab", "chapter", "collapsed", "toc-desc", "outline-desc"]

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function readValue(raw: unknown, valid: (value: unknown) => boolean): string | undefined {
  if (typeof raw !== "string" || raw.length > 256_000) return
  try {
    if (valid(JSON.parse(raw))) return raw
  } catch {
    /* Ignore preferences from older builds or corrupt browser storage. */
  }
}

function copyPreferences(source: unknown, keys: string[], parse: (key: string, raw: unknown) => string | undefined): Record<string, string> {
  if (!object(source)) return {}
  return Object.fromEntries(keys.flatMap(key => {
    const value = parse(key, source[key])
    return value === undefined ? [] : [[key, value]]
  }))
}

function globalValue(key: string, raw: unknown): string | undefined {
  if (key === themeKey) return typeof raw === "string" && ["light", "dark", "system"].includes(raw) ? raw : undefined
  if (key === fontKey) return typeof raw === "string" && ["standard", "large", "xlarge"].includes(raw) ? raw : undefined
  if (key === sizeKey) return readValue(raw, value => object(value) &&
    typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0)
  return readValue(raw, value => typeof value === "boolean")
}

function bookValue(key: string, raw: unknown): string | undefined {
  if (key === "tab") return readValue(raw, value => typeof value === "string" && ["toc", "outline", "archives", "codex"].includes(value))
  if (key === "chapter") return readValue(raw, value => value === null || typeof value === "string")
  if (key === "collapsed") return readValue(raw, value => object(value) && Object.values(value).every(item => typeof item === "boolean"))
  return readValue(raw, value => typeof value === "boolean")
}

export function sanitizeBackupPreferences(source: unknown, novelIds: string[], includeGlobal: boolean): BackupPreferences {
  if (!object(source)) return {}
  const { global, books } = source
  return {
    global: includeGlobal && object(global) ? copyPreferences(global, globalKeys, globalValue) : undefined,
    books: object(books) ? Object.fromEntries(novelIds.flatMap(id => Object.hasOwn(books, id) ? [
      [id, copyPreferences(books[id], bookKeys, bookValue)],
    ] : [])) : undefined,
  }
}

export function remapBackupPreferences(source: BackupPreferences, novelIds: string[], ids: ReadonlyMap<string, string>, includeGlobal: boolean): BackupPreferences {
  const selected = sanitizeBackupPreferences(source, novelIds, includeGlobal)
  if (!ids.size || !selected.books) return selected
  return {
    books: Object.fromEntries(Object.entries(selected.books).map(([id, values]) => {
      if (values.chapter) {
        const chapter = JSON.parse(values.chapter) as string | null
        values.chapter = JSON.stringify(chapter && ids.has(chapter) ? ids.get(chapter) : null)
      }
      if (values.collapsed) {
        const collapsed = Object.entries(JSON.parse(values.collapsed) as Record<string, boolean>)
        values.collapsed = JSON.stringify(Object.fromEntries(collapsed.flatMap(([key, value]) => {
          const mapped = key === "__loose__" ? key : ids.get(key)
          return mapped ? [[mapped, value]] : []
        })))
      }
      return [ids.get(id) ?? id, values]
    })),
  }
}

export function readBackupPreferences(storage: Storage, novelIds: string[], includeGlobal: boolean): BackupPreferences {
  const read = (keys: string[], keyFor = (key: string) => key) =>
    Object.fromEntries(keys.map(key => [key, storage.getItem(keyFor(key))]))
  return sanitizeBackupPreferences({
    global: includeGlobal ? read(globalKeys) : undefined,
    books: Object.fromEntries(novelIds.map(id => [id, read(bookKeys, key => `${prefix}${key}:${id}`)])),
  }, novelIds, includeGlobal)
}

export function writeBackupPreferences(storage: Storage, preferences: BackupPreferences): void {
  if (preferences.global) {
    for (const key of globalKeys) storage.removeItem(key)
    for (const [key, value] of Object.entries(preferences.global)) storage.setItem(key, value)
  }
  for (const [id, values] of Object.entries(preferences.books ?? {})) {
    for (const key of bookKeys) storage.removeItem(`${prefix}${key}:${id}`)
    for (const [key, value] of Object.entries(values)) storage.setItem(`${prefix}${key}:${id}`, value)
  }
}
