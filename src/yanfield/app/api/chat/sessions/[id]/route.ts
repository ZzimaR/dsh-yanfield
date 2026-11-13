import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { ChatSession } from "@/lib/types";
import {
  AGENT_IDS,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_FIELDS: FieldSpec = {
  title: "str",
  chapterId: "str|null",
  agentId: "str",
  mode: "str",
};

function belongsToNovel(chapterId: string | null | undefined, novelId: string): boolean {
  if (!chapterId) return true;
  const chapter = repo.getChapter(chapterId);
  return chapter !== undefined && chapter.novelId === novelId;
}

export const GET = handle<{ id: string }>(async (request, { params }) => {
  const session = repo.getChatSession(params.id);
  if (!session || queryParam(request, "novelId") !== session.novelId) return notFound("会话不存在");
  return ok(session);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getChatSession(params.id);
  if (!current) return notFound("会话不存在");

  const body = await readBody(request);
  if (requireString(body, "novelId", "novelId") !== current.novelId) return notFound("会话不存在");
  const patch = pickFields<ChatSession>(body, SESSION_FIELDS);
  const agentId = pickEnum(body, "agentId", AGENT_IDS, "智能体");
  if (agentId) patch.agentId = agentId;
  const mode = pickEnum(body, "mode", ["chat", "collaborate"] as const, "会话模式");
  if (mode) patch.mode = mode;
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("会话标题不能为空");
  }
  if (!belongsToNovel(patch.chapterId, current.novelId)) {
    return bad("章节不存在或不属于该作品");
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateChatSession(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (request, { params }) => {
  const session = repo.getChatSession(params.id);
  if (!session || queryParam(request, "novelId") !== session.novelId) return notFound("会话不存在");
  repo.deleteChatSession(params.id);
  return ok({ ok: true });
});
