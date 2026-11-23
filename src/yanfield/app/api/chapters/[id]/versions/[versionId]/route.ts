import { requireString, readBody } from "@/app/api/_lib/http"
import { handle, ok } from "@/lib/api-utils"
import { deleteChapterVersion, getChapterVersion, restoreChapterVersion } from "@/lib/db/chapter-versions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; versionId: string }

export const GET = handle<Params>((_request, { params }) =>
  ok(getChapterVersion(params.id, params.versionId)),
)

export const PATCH = handle<Params>(async (request, { params }) => {
  const body = await readBody(request)
  return ok(restoreChapterVersion(params.id, params.versionId, requireString(body, "expectedUpdatedAt", "expectedUpdatedAt")))
})

export const DELETE = handle<Params>((_request, { params }) => {
  deleteChapterVersion(params.id, params.versionId)
  return ok({ ok: true })
})
