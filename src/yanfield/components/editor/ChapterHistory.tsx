"use client"

import * as React from "react"
import { Button, ConfirmDialog, Dialog, Spinner } from "@/components/ui/kit"
import type { ChapterVersion, ChapterVersionSummary } from "@/lib/chapter-version"
import { apiDelete, useApi } from "@/lib/client/api"
import { useT } from "@/lib/i18n"
import { cn, formatDateTime, stripHtml } from "@/lib/ui/cn"

interface ChapterHistoryProps {
  chapterId: string
  onClose: () => void
  onCreate: () => Promise<ChapterVersionSummary>
  onRestore: (versionId: string) => Promise<void>
}

export function ChapterHistory({ chapterId, onClose, onCreate, onRestore }: ChapterHistoryProps) {
  const tr = useT()
  const url = `/api/chapters/${chapterId}/versions`
  const history = useApi<{ items: ChapterVersionSummary[] }>(url)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<"restore" | "delete" | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const selected = history.data?.items.find(item => item.id === selectedId) ?? history.data?.items[0]
  const preview = useApi<ChapterVersion>(selected ? `${url}/${selected.id}` : null)
  const version = preview.data?.id === selected?.id ? preview.data : undefined

  async function perform(operation: () => Promise<void>, message: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await operation()
      setNotice(message)
      await history.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("请稍后重试。"))
    } finally {
      setConfirm(null)
      setBusy(false)
    }
  }

  const restore = confirm === "restore"
  return (
    <>
      <Dialog
        open
        title={tr("章节版本历史")}
        description={tr("保存当前正文的快照，或预览并恢复以前的正文。")}
        width={740}
        onClose={() => { if (!busy) onClose() }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={!version || busy}
              onClick={() => setConfirm("delete")}
            >{tr("删除此版本")}</Button>
            <Button
              variant="secondary"
              disabled={!version || busy}
              onClick={() => setConfirm("restore")}
            >{tr("恢复此版本")}</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void perform(async () => {
                const saved = await onCreate()
                setSelectedId(saved.id)
              }, tr("已保存版本快照"))}
            >{tr("保存版本快照")}</Button>
          </>
        }
      >
        {error || history.error ? <p role="alert" className="mb-3 text-sm text-danger">{error ?? history.error}</p> : null}
        {notice ? <p role="status" className="mb-3 text-sm text-ink-2">{notice}</p> : null}
        {history.loading && !history.data ? <Spinner /> : null}
        {history.data?.items.length === 0 ? <p className="text-sm text-ink-3">{tr("这章还没有版本快照。")}</p> : null}
        {selected ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ul className="scroll-thin min-w-0 space-y-1 overflow-y-auto sm:max-h-[45vh]">
              {history.data?.items.map(item => (
                <li key={item.id}>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-pressed={item.id === selected.id}
                    className={cn("h-auto w-full flex-col items-start gap-1 px-3 py-2 text-start",
                      item.id === selected.id && "bg-surface-2")}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span className="text-xs text-ink-3">
                      {tr(item.source === "manual" ? "手动快照" : "恢复前快照")} · {tr("字数 {count}", { count: item.wordCount })}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="min-w-0 rounded-md border border-line bg-paper px-4 py-3">
              <h3 className="break-words text-sm font-semibold text-ink">{selected.chapterTitle}</h3>
              {preview.error ? <p role="alert" className="mt-3 text-sm text-danger">{preview.error}</p> : null}
              {version ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">
                  {stripHtml(version.content) || tr("此版本没有正文。")}
                </p>
              ) : preview.loading ? <Spinner /> : null}
            </div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        title={tr(restore ? "恢复这份正文？" : "删除这份版本？")}
        description={tr(restore
          ? "当前正文会先另存为快照，再替换为所选版本的正文。"
          : "这份快照将被永久删除。")}
        confirmText={tr(restore ? "恢复此版本" : "删除此版本")}
        danger={!restore}
        loading={busy}
        onClose={() => { if (!busy) setConfirm(null) }}
        onConfirm={() => {
          if (!version || busy) return
          void perform(
            restore ? () => onRestore(version.id) : async () => { await apiDelete(`${url}/${version.id}`) },
            tr(restore ? "已恢复正文版本" : "已删除版本快照"),
          )
        }}
      />
    </>
  )
}
