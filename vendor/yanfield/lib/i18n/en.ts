/**
 * English dictionary for the Yanfield workbench.
 *
 * Keys are the Chinese source strings written at the call site, so a missing
 * translation falls back to Chinese instead of showing a raw key. Entries are
 * grouped by product area; a key may appear in several groups with the same
 * text, the last one wins.
 *
 * Values may be `{ one, other }` when the sentence depends on `params.count`.
 * Use `{name}` placeholders; Chinese and English must use the same names.
 */
import type { TranslateValue } from "./core"
import { common } from "./en/common"
import { library } from "./en/library"
import { editor } from "./en/editor"
import { ai } from "./en/ai"
import { settings } from "./en/settings"
import { cards } from "./en/cards"
import { outline } from "./en/outline"
import { archives } from "./en/archives"
import { landing } from "./en/landing"
import { presets } from "./en/presets"
import { server } from "./en/server"

export const en: Record<string, TranslateValue> = {
  ...common,
  ...library,
  ...editor,
  ...ai,
  ...settings,
  ...cards,
  ...outline,
  ...archives,
  ...landing,
  ...presets,
  ...server,
}
