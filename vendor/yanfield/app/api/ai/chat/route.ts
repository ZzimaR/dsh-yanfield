import type { AiChatRequest } from "@/lib/types";
import { ApiError, handle, readJson } from "@/lib/api-utils";
import { runChatStream } from "@/lib/ai/engine";
import { linkedSignal, sseResponse } from "../sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AI 助手对话（SSE 流式） */
export const POST = handle(async (req) => {
  const body = await readJson<Partial<AiChatRequest>>(req);
  if (!body.novelId) throw new ApiError("缺少 novelId", 400);
  if (!body.message?.trim()) throw new ApiError("消息不能为空", 400);
  return sseResponse((signal) =>
    runChatStream({
      novelId: body.novelId as string,
      chapterId: body.chapterId ?? null,
      sessionId: body.sessionId ?? null,
      agentId: body.agentId,
      message: body.message as string,
      mode: body.mode,
      context: body.context,
      selection: body.selection,
      presetId: body.presetId ?? null,
      mentions: body.mentions,
      signal: linkedSignal(req, signal),
    }),
  );
});
