import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ChatMessage } from "@/lib/types";
import { isObject, pickEnum, pickFields, queryParam, readBody, requireString, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_FIELDS: FieldSpec = {
  content: "str",
  actions: "json",
  status: "str",
  provider: "str",
  model: "str",
  usage: "json",
  error: "str",
};

const MESSAGE_STATUSES = ["complete", "streaming", "error", "aborted"] as const;

export const GET = handle<{ id: string }>(async (request, { params }) => {
  const session = repo.getChatSession(params.id);
  if (!session) return notFound("会话不存在");
  if (queryParam(request, "novelId") !== session.novelId) return notFound("会话不存在");
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 80 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad("limit 必须是 1 到 100 之间的整数");
  const beforeId = url.searchParams.get("before");
  const page = repo.listMessagesPage(params.id, beforeId, limit);
  if (!page) return bad("消息分页游标无效");
  return ok(page);
});

export const POST = handle<{ id: string }>(async (request, { params }) => {
  const body = await readBody(request);
  const session = repo.getChatSession(params.id);
  if (!session || requireString(body, "novelId", "novelId") !== session.novelId) return notFound("会话不存在");
  const role = pickEnum(body, "role", ["user", "assistant"] as const, "消息角色");
  if (!role) return bad("role 必须是 user 或 assistant");

  const input = pickFields<ChatMessage>(body, MESSAGE_FIELDS);
  const status = pickEnum(body, "status", MESSAGE_STATUSES, "消息状态");
  if (status) input.status = status;
  if (input.actions !== undefined && !Array.isArray(input.actions)) {
    return bad("actions 必须是数组");
  }
  if (input.usage !== undefined && input.usage !== null && !isObject(input.usage)) {
    return bad("usage 必须是对象或 null");
  }

  return ok(repo.addMessage(params.id, { ...input, role }), { status: 201 });
});
