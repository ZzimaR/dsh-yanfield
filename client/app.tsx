import React, { useEffect, useState } from "react"
import { ToastProvider } from "@/components/ui/kit"
import SettingsDialogHost from "@/components/settings/SettingsDialogHost"
import { EditorSaveGuardProvider } from "@/lib/editor/navigation"
import { BACKUP_RESTORED_EVENT } from "@/lib/client/api"
import { clearSessions } from "@/lib/ui/session-cache"
import { applyUiFont, getStoredUiFont, syncSurfaceTheme } from "@/lib/ui/theme"
import { resetFloatWindowSize } from "@/components/editor/FloatWindow"
import { EditorWorkbench } from "@/components/editor/EditorWorkbench"
import LibraryPage from "@/app/library/page"
import SettingsPage from "@/app/settings/page"
import NovelPage from "@/app/novel/[novelId]/page"
import { navigate, useParams, usePathname, useSearchParams } from "./shims/navigation"

function EditorRoute() {
  const params = useParams<{ novelId: string }>()
  const search = useSearchParams()
  if (!params.novelId) return null
  const chapterId = search.get("chapterId")
  return <EditorWorkbench key={params.novelId} novelId={params.novelId} initialChapterId={chapterId} />
}

function DeskPages() {
  const pathname = usePathname()
  useEffect(() => {
    const legacy = pathname.match(/^\/novel\/([^/]+)\/(?:outline|bible|archives)\/?$/)
    if (!legacy) return
    const params = new URLSearchParams()
    const tab = pathname.endsWith("/outline") ? "outline" : pathname.endsWith("/archives") ? "archives" : "bible"
    params.set("tab", tab)
    navigate(`/editor/${legacy[1]}?${params.toString()}`, "replace")
  }, [pathname])

  if (pathname === "/" || pathname === "/library") return <LibraryPage />
  if (pathname === "/settings") return <SettingsPage />
  if (/^\/editor\/[^/]+/.test(pathname)) return <EditorRoute />
  if (/^\/novel\/[^/]+/.test(pathname)) return <NovelPage />
  return <LibraryPage />
}

export function YanfieldApp() {
  const [restoreVersion, setRestoreVersion] = useState(0)
  useEffect(() => {
    const refreshAfterRestore = () => {
      clearSessions()
      resetFloatWindowSize()
      try {
        syncSurfaceTheme()
        applyUiFont(getStoredUiFont(), false)
      } catch {
        /* Storage can be disabled by the browser. */
      }
      navigate("/library", "replace")
      setRestoreVersion(version => version + 1)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === BACKUP_RESTORED_EVENT) refreshAfterRestore()
    }
    window.addEventListener(BACKUP_RESTORED_EVENT, refreshAfterRestore)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(BACKUP_RESTORED_EVENT, refreshAfterRestore)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return (
    <ToastProvider>
      <EditorSaveGuardProvider key={restoreVersion}>
        <div className="yf-content">
          <DeskPages />
        </div>
        <SettingsDialogHost />
      </EditorSaveGuardProvider>
    </ToastProvider>
  )
}
