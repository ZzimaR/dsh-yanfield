import React, { useEffect } from "react"
import { ToastProvider } from "@/components/ui/kit"
import SettingsDialogHost from "@/components/settings/SettingsDialogHost"
import { EditorSaveGuardProvider } from "@/lib/editor/navigation"
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
  return (
    <ToastProvider>
      <EditorSaveGuardProvider>
        <div className="yf-content">
          <DeskPages />
        </div>
        <SettingsDialogHost />
      </EditorSaveGuardProvider>
    </ToastProvider>
  )
}
