"use client"

/**
 * React bindings for the workbench localization core.
 *
 * `client/index.tsx` installs the DSH locale bridge once; `useT()` re-renders
 * components when the language changes. Server code should import
 * `@/lib/i18n/core` instead so the React runtime stays out of the host bundle.
 */
import { useCallback, useSyncExternalStore } from "react"
import {
  getYanfieldLocale,
  subscribeLocale,
  translateFor,
  type Translate,
  type YanfieldLocale,
} from "./core"

export * from "./core"

/** React hook: re-render when the active language changes. */
export function useLocale(): YanfieldLocale {
  return useSyncExternalStore(subscribeLocale, getYanfieldLocale, getYanfieldLocale)
}

/** React hook: translate function that updates with the active language. */
export function useT(): Translate {
  const locale = useLocale()
  return useCallback(
    (key: string, params?: Parameters<Translate>[1]) => translateFor(locale, key, params),
    [locale],
  )
}

/** React hook: pick the active language from a Chinese/English pair. */
export function useLocalized(pair: { zh: string; en: string }): string {
  return useLocale() === "en" ? pair.en : pair.zh
}
