import { ApiError, handle, readJson } from "@/lib/api-utils"
import { BACKUP_EXTENSION } from "@/lib/backup-format"
import { createSnapshot, selectBackupBooks } from "@/lib/db/backup"
import { encodeBackup } from "@/lib/db/backup-file"

export const POST = handle(async request => {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new ApiError("需要 JSON 请求", 415)
  }
  const input = await readJson<{ scope?: unknown; novelIds?: unknown; password?: unknown; preferences?: unknown } | null>(request)
  if (input?.scope !== "all" && input?.scope !== "books") throw new ApiError("请选择备份范围")
  const novelIds = input.scope === "books" ? selectBackupBooks(input.novelIds) : null
  const password = input.password ?? ""
  if (typeof password !== "string" || password.length > 256 || (password && (novelIds || password.length < 8))) {
    throw new ApiError("加密备份密码需为 8 至 256 个字符")
  }
  try {
    const snapshot = createSnapshot(novelIds, Boolean(password), input.preferences)
    const file = encodeBackup(snapshot, password)
    const filename = `yanfield-${snapshot.scope}-${snapshot.createdAt.replace(/[:.]/g, "-")}${BACKUP_EXTENSION}`
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("无法生成备份，请稍后重试", 500)
  }
})
