import { useEffect, useState } from "react"

const STORAGE_KEY = "yanfield:dsh-path"
const listeners = new Set<() => void>()

function readInitial(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored && stored.startsWith("/")) return stored
  } catch {
    /* 隐私模式没有 sessionStorage 时从书架开始 */
  }
  return "/library"
}

let current = readInitial()
const history: string[] = [current]

function notify(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, current)
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener()
}

export function getPath(): string {
  return current
}

export function navigate(url: string, mode: "push" | "replace" = "push"): void {
  const next = url.startsWith("/") ? url : `/${url}`
  if (next === current && mode === "push") return
  current = next
  if (mode === "replace") history[history.length - 1] = next
  else history.push(next)
  notify()
}

function usePathTick(): string {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return current
}

export function usePathname(): string {
  const path = usePathTick()
  return path.split("?")[0] || "/"
}

export function useSearchParams(): URLSearchParams {
  const path = usePathTick()
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : ""
  return new URLSearchParams(query)
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const pathname = usePathname()
  const editor = pathname.match(/^\/editor\/([^/]+)/)
  const novel = pathname.match(/^\/novel\/([^/]+)/)
  const id = decodeURIComponent(editor?.[1] || novel?.[1] || "")
  return (id ? { novelId: id, id } : {}) as T
}

export function useRouter() {
  return {
    push: (url: string) => navigate(url, "push"),
    replace: (url: string) => navigate(url, "replace"),
    back: () => {
      if (history.length > 1) {
        history.pop()
        current = history[history.length - 1] || "/library"
        notify()
      }
    },
    refresh: () => notify(),
    prefetch: () => undefined,
  }
}

export function redirect(url: string): void {
  navigate(url, "replace")
}
