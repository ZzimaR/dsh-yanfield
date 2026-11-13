/**
 * Workbench localization core (no React, safe to import from server code).
 *
 * The DSH client locale service owns the active language (Settings → General).
 * This module mirrors it for the Yanfield tree and exposes a synchronous `t()`.
 * React components should use `useT()` from `./index` so they re-render when
 * the language changes.
 *
 * Dictionary keys are the Chinese source strings written at the call site; a
 * missing English entry falls back to the Chinese text instead of a raw key.
 */
import { en } from "./en"

export type YanfieldLocale = "zh" | "en"
export type TranslateParams = Record<string, string | number | null | undefined>
export type Translate = (key: string, params?: TranslateParams) => string

/** A dictionary entry: plain text, or English singular/plural forms. */
export type TranslateValue = string | { one: string; other: string }

export interface LocaleBridge {
  /** Active DSH locale, normalized to a language Yanfield ships. */
  getLocale: () => YanfieldLocale
  /** DSH locale subscription (dictionary revisions included). */
  subscribe: (listener: () => void) => () => void
}

let bridge: LocaleBridge | null = null
const localListeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...localListeners]) {
    try {
      listener()
    } catch {
      /* 一个订阅者抛错不应影响其他组件 */
    }
  }
}

/** Normalize a DSH locale id to the two languages the workbench ships. */
export function normalizeLocale(id: string | undefined): YanfieldLocale {
  return id && id.toLowerCase().startsWith("en") ? "en" : "zh"
}

/**
 * Connect the workbench to the DSH locale service.
 * @returns disposer that detaches the bridge (plugin unload).
 */
export function installLocaleBridge(next: LocaleBridge): () => void {
  bridge = next
  notify()
  return () => {
    if (bridge !== next) return
    bridge = null
    notify()
  }
}

/** Active workbench locale. Reads live state, safe outside React. */
export function getYanfieldLocale(): YanfieldLocale {
  return bridge?.getLocale() ?? "zh"
}

/** Subscribe to language changes (used by useLocale/useT). */
export function subscribeLocale(listener: () => void): () => void {
  localListeners.add(listener)
  const off = bridge?.subscribe(listener)
  return () => {
    localListeners.delete(listener)
    off?.()
  }
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined || params[name] === null ? match : String(params[name]),
  )
}

/** Server messages are composed from fragments; translate the common shapes. */
function translateComposite(locale: YanfieldLocale, key: string): string | null {
  if (locale !== "en") return null
  let match = /^(.+)不能为空$/.exec(key)
  if (match) return `${translate(locale, match[1])} is required`
  match = /^字段\s+(\S+)\s+(.+)$/.exec(key)
  if (match) return `Field ${match[1]} ${translate(locale, match[2])}`
  return null
}

function translate(locale: YanfieldLocale, key: string, params?: TranslateParams): string {
  // Chinese is the identity dictionary; English falls back to the Chinese key
  // so an untranslated string stays readable instead of showing a token.
  let template: string = key
  if (locale === "en") {
    const value = en[key]
    if (typeof value === "string") template = value
    else if (value) template = (params?.count ?? params?.n) === 1 ? value.one : value.other
    else template = translateComposite(locale, key) ?? key
  }
  return interpolate(template, params)
}

/** Translate with the currently active locale. */
export function t(key: string, params?: TranslateParams): string {
  return translate(getYanfieldLocale(), key, params)
}

/** Translate a known English template with an explicit locale (tests, e-mail). */
export function translateFor(locale: YanfieldLocale, key: string, params?: TranslateParams): string {
  return translate(locale, key, params)
}

/** Whether the English dictionary covers a Chinese source string. */
export function hasTranslation(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(en, key)
}

/** Pick a value for the active locale from a pair, for data tables and presets. */
export function localized(pair: { zh: string; en: string }): string {
  return getYanfieldLocale() === "en" ? pair.en : pair.zh
}
