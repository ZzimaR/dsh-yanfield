"use client"

import * as React from "react"
import { Download, HardDriveDownload, Upload } from "lucide-react"
import { Button, Card, ConfirmDialog, Dialog, Input, useToast } from "@/components/ui/kit"
import { useEditorSaveGuard } from "@/lib/editor/navigation"
import { apiUrl, notifyBackupRestored, notifyDataChanged, parseResponse } from "@/lib/client/api"
import { useLocale, useT } from "@/lib/i18n"
import { BACKUP_EXTENSION, MAX_BACKUP_FILE, type BackupImportResult, type BackupPreview } from "@/lib/backup-format"
import { readBackupPreferences, writeBackupPreferences } from "@/lib/backup-preferences"
import { yanfieldPortal } from "@/lib/ui/portal"
import type { Novel } from "@/lib/types"

interface BackupSectionProps {
  novels: Novel[]
  saveSettings: () => Promise<void>
  refresh: () => void
}

function toggleBook(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]
}

function BackupBookList({ books, selected, disabled, onToggle }: {
  books: { id: string; title: string; detail?: React.ReactNode }[]
  selected: string[]
  disabled: boolean
  onToggle: (id: string) => void
}) {
  return (
    <ul className="scroll-thin max-h-52 divide-y divide-line overflow-y-auto rounded-md border border-line">
      {books.map(book => (
        <li key={book.id}>
          <label className="flex min-w-0 cursor-pointer items-start gap-2.5 px-3 py-2.5">
            <input type="checkbox" checked={selected.includes(book.id)} disabled={disabled}
              onChange={() => onToggle(book.id)} className="mt-0.5 accent-accent" />
            <span className="min-w-0">
              <span className="block break-words text-[13px] font-medium text-ink">{book.title}</span>
              {book.detail ? <span className="mt-0.5 block text-[11px] text-ink-3">{book.detail}</span> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

async function downloadBackup(response: Response): Promise<void> {
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `yanfield${BACKUP_EXTENSION}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  yanfieldPortal().appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BackupSection({ novels, saveSettings, refresh }: BackupSectionProps) {
  const tr = useT()
  const locale = useLocale()
  const fieldId = React.useId()
  const saveGuard = useEditorSaveGuard()
  const { toast } = useToast()
  const [dialog, setDialog] = React.useState<"export" | "import" | null>(null)
  const [scope, setScope] = React.useState<"all" | "books">("all")
  const [selected, setSelected] = React.useState<string[]>([])
  const [includeKeys, setIncludeKeys] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<BackupPreview | null>(null)
  const [confirmRestore, setConfirmRestore] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const inFlight = React.useRef(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const open = (type: "export" | "import") => {
    setScope("all")
    setSelected([])
    setIncludeKeys(false)
    setPassword("")
    setFile(null)
    setPreview(null)
    setError("")
    setDialog(type)
  }

  const close = () => {
    if (inFlight.current) return
    setDialog(null)
    setPassword("")
    setFile(null)
    setPreview(null)
  }

  async function processBackup(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("备份操作失败，请重试"))
    } finally {
      inFlight.current = false
      setBusy(false)
      setConfirmRestore(false)
    }
  }

  async function flush() {
    await saveGuard.flush()
    await saveSettings()
  }

  function exportFile() {
    void processBackup(async () => {
      if (scope === "all" && includeKeys && password.length < 8) {
        setError(tr("加密备份密码需为 8 至 256 个字符"))
        return
      }
      await flush()
      let preferences
      try {
        preferences = readBackupPreferences(window.localStorage, scope === "all" ? novels.map(book => book.id) : selected, scope === "all")
      } catch {
        /* The browser can disable local preferences. The database is still backed up. */
      }
      const response = await fetch(apiUrl("/api/backup/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, novelIds: selected, password: scope === "all" && includeKeys ? password : "", preferences }),
      })
      if (!response.ok) await parseResponse(response)
      await downloadBackup(response)
      setDialog(null)
      setPassword("")
      toast({ title: tr("备份已生成"), tone: "success" })
    })
  }

  function importFile(mode: "preview" | "copy" | "restore") {
    if (!file || (mode !== "preview" && !preview)) return
    void processBackup(async () => {
      if (file.size > MAX_BACKUP_FILE) {
        setError(tr("备份文件过大，请分批导出作品"))
        return
      }
      if (mode !== "preview") await flush()
      const form = new FormData()
      form.set("file", file)
      form.set("mode", mode)
      form.set("password", password)
      if (preview && mode !== "preview") form.set("fingerprint", preview.fingerprint)
      if (mode === "copy") selected.forEach(id => form.append("novelId", id))
      const response = await fetch(apiUrl("/api/backup/import"), { method: "POST", headers: { "X-Yanfield-Backup": "1" }, body: form })
      if (mode === "preview") {
        const result = await parseResponse<BackupPreview>(response)
        setPreview(result)
        setSelected(result.books.map(book => book.id))
        return
      }
      const result = await parseResponse<BackupImportResult>(response)
      try {
        writeBackupPreferences(window.localStorage, result.preferences)
      } catch {
        toast({ title: tr("数据库已恢复，浏览器偏好未能保存"), tone: "error" })
      }
      setDialog(null)
      setFile(null)
      setPreview(null)
      setPassword("")
      if (mode === "restore") {
        notifyBackupRestored()
        toast({ title: tr("整库恢复完成"), description: tr("恢复前的数据库备份已保存到数据目录。"), tone: "success" })
      } else {
        notifyDataChanged("novels")
        refresh()
        toast({ title: tr("已导入 {count} 部作品", { count: result.books }), tone: "success" })
      }
    })
  }

  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <HardDriveDownload className="size-3.5 text-ink-3" aria-hidden />
        {tr("备份与恢复")}
      </h3>
      <p className="mt-1.5 text-[12px] leading-6 text-ink-2">
        {tr("备份整个书架和偏好设置，或只带走选定作品的正文、设定、资料和 AI 对话。")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => open("export")}>{tr("导出备份")}</Button>
        <Button variant="secondary" size="sm" icon={<Upload className="size-3.5" />} onClick={() => open("import")}>{tr("导入备份")}</Button>
      </div>

      <Dialog open={dialog === "export"} onClose={close} title={tr("导出备份")} footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={close}>{tr("取消")}</Button>
          <Button loading={busy} disabled={scope === "books" && !selected.length} onClick={exportFile}>{tr("下载备份")}</Button>
        </div>
      }>
        <div className="space-y-3">
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink" disabled={busy}>
            <legend className="mb-2 font-medium">{tr("备份范围")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name={`${fieldId}-scope`} checked={scope === "all"} onChange={() => setScope("all")} className="accent-accent" />
              {tr("整库备份")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={`${fieldId}-scope`} checked={scope === "books"} onChange={() => setScope("books")} className="accent-accent" disabled={!novels.length} />
              {tr("选择作品")}
            </label>
          </fieldset>
          {scope === "books" ? (
            <BackupBookList books={novels} selected={selected} disabled={busy}
              onToggle={id => setSelected(current => toggleBook(current, id))} />
          ) : (
            <>
              <p className="text-[12px] leading-6 text-ink-2">{tr("包含所有作品、砚田设置、预设、模型服务配置和写作统计。")}</p>
              <label className="flex items-start gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={includeKeys} disabled={busy} className="mt-0.5 accent-accent"
                  onChange={event => { setIncludeKeys(event.target.checked); setPassword("") }} />
                {tr("加密备份并包含模型服务 API Key")}
              </label>
              {includeKeys ? (
                <Input id={`${fieldId}-export-password`} type="password" autoComplete="new-password" minLength={8} maxLength={256} disabled={busy}
                  label={tr("备份密码")} value={password} onChange={event => setPassword(event.target.value)}
                  hint={tr("恢复时需要此密码，请妥善保存。")} />
              ) : null}
            </>
          )}
          {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
        </div>
      </Dialog>

      <Dialog open={dialog === "import"} onClose={close} title={tr("导入备份")} footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={close}>{tr("取消")}</Button>
          {!preview ? (
            <Button loading={busy} disabled={!file} onClick={() => importFile("preview")}>{tr("预览备份")}</Button>
          ) : (
            <>
              {preview.scope === "all" ? (
                <Button variant="danger" disabled={busy} onClick={() => setConfirmRestore(true)}>{tr("恢复整库")}</Button>
              ) : null}
              <Button loading={busy} disabled={!selected.length} onClick={() => importFile("copy")}>{tr("导入为副本")}</Button>
            </>
          )}
        </div>
      }>
        <div className="space-y-3">
          <input ref={fileInput} hidden type="file" accept={BACKUP_EXTENSION} aria-label={tr("砚田备份文件")} disabled={busy}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null)
              setPreview(null)
              setSelected([])
              setError("")
            }} />
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              {tr("选择备份文件")}
            </Button>
            {file ? <span className="min-w-0 break-all text-[12px] text-ink-2">{file.name}</span> : null}
          </div>
          <Input id={`${fieldId}-import-password`} type="password" autoComplete="off" maxLength={256} disabled={busy}
            label={tr("备份密码（加密文件必填）")} value={password}
            onChange={event => { setPassword(event.target.value); setPreview(null); setError("") }} />
          {preview ? (
            <>
              <p className="text-[12px] leading-6 text-ink-2">
                {preview.scope === "all" ? tr("整库备份") : tr("作品备份")}
                {" · "}{new Date(preview.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                {" · "}{tr("{count} 部作品", { count: preview.books.length })}
                {preview.includesKeys ? ` · ${tr("含加密 API Key")}` : ""}
              </p>
              {preview.books.length ? (
                <BackupBookList selected={selected} disabled={busy} onToggle={id => setSelected(current => toggleBook(current, id))}
                  books={preview.books.map(book => ({
                    ...book,
                    detail: <>
                      {[
                        tr("{count} 章", { count: book.chapters }),
                        tr("{count} 项资料", { count: book.notes }),
                        tr("{count} 个对话", { count: book.conversations }),
                        ...(book.existing ? [tr("书架中已有这部作品")] : []),
                      ].join(" · ")}
                    </>,
                  }))} />
              ) : null}
              {preview.scope === "all" ? (
                <p className="text-[12px] text-ink-3">{tr("勾选作品可新增副本。整库恢复始终应用整个文件。")}</p>
              ) : null}
            </>
          ) : null}
          {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
        </div>
      </Dialog>

      <ConfirmDialog open={confirmRestore} loading={busy} danger title={tr("恢复整库")}
        confirmText={tr("替换并恢复")} onConfirm={() => importFile("restore")}
        onClose={() => { if (!inFlight.current) setConfirmRestore(false) }}
        description={tr("当前书架的 {count} 部作品和砚田设置将被替换。砚田会先将当前数据库备份到数据目录。", { count: preview?.localBooks ?? 0 })} />
    </Card>
  )
}
