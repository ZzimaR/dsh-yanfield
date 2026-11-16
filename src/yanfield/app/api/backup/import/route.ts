import { createHash } from "node:crypto"
import { ApiError, handle, ok } from "@/lib/api-utils"
import { MAX_BACKUP_FILE } from "@/lib/backup-format"
import { importSnapshot, previewSnapshot, readSnapshot, selectBackupBooks } from "@/lib/db/backup"
import { decodeBackup, invalidBackup } from "@/lib/db/backup-file"
import { hasActiveAiStreams } from "../../ai/sse"

export const POST = handle(async request => {
  // A custom header prevents a cross-origin page from submitting a backup as an HTML form.
  if (request.headers.get("x-yanfield-backup") !== "1" ||
    !request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    throw new ApiError("请选择砚田备份文件", 415)
  }
  const form = await request.formData().catch(() => { throw invalidBackup() })
  const file = form.get("file")
  const password = form.get("password") ?? ""
  const mode = form.get("mode")
  if (!(file instanceof File) || !file.size || typeof password !== "string" || password.length > 256 ||
    (mode !== "preview" && mode !== "copy" && mode !== "restore")) throw invalidBackup()
  if (file.size > MAX_BACKUP_FILE) throw new ApiError("备份文件过大，请分批导出作品", 413)

  const buffer = Buffer.from(await file.arrayBuffer())
  const fingerprint = createHash("sha256").update(buffer).digest("hex")
  if (mode !== "preview" && form.get("fingerprint") !== fingerprint) {
    throw new ApiError("备份文件已变化，请重新预览", 409)
  }
  const { value, encrypted } = decodeBackup(buffer, password)
  const snapshot = readSnapshot(value, encrypted)
  if (mode === "preview") return ok(previewSnapshot(snapshot, fingerprint))
  if (request.signal.aborted) throw new ApiError("备份导入已取消", 409)

  if (mode === "restore" && hasActiveAiStreams()) {
    throw new ApiError("AI 正在运行，请等待结束或停止任务后再恢复整库", 409)
  }
  const ids = mode === "copy" ? selectBackupBooks(form.getAll("novelId")) : null
  try {
    return ok(importSnapshot(snapshot, ids))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("无法写入备份，原有数据已保留", 500)
  }
})
