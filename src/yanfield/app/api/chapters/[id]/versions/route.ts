import { requireString, readBody } from "@/app/api/_lib/http"
import { handle, ok } from "@/lib/api-utils"
import { createChapterVersion, listChapterVersions } from "@/lib/db/chapter-versions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handle<{ id: string }>((_request, { params }) =>
  ok({ items: listChapterVersions(params.id) }),
)

export const POST = handle<{ id: string }>(async (request, { params }) => {
  const body = await readBody(request)
  return ok(createChapterVersion(params.id, requireString(body, "expectedUpdatedAt", "expectedUpdatedAt")), { status: 201 })
})
