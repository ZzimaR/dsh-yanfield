import { handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { queryParam } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = handle<{ id: string; messageId: string }>(async (request, { params }) => {
  const session = repo.getChatSession(params.id);
  if (!session || queryParam(request, "novelId") !== session.novelId) return notFound("会话不存在");
  if (!repo.deleteMessage(params.id, params.messageId)) return notFound("消息不存在");
  return ok({ ok: true });
});
