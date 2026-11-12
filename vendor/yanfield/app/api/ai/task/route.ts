import type { AiTaskRequest } from "@/lib/types";
import { ApiError, handle, readJson } from "@/lib/api-utils";
import { runTaskStream } from "@/lib/ai/engine";
import { linkedSignal, sseResponse } from "../sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 编辑器内的定点 AI 任务（续写/扩写/润色/改写/去 AI 味/体检/大纲等，SSE 流式） */
export const POST = handle(async (req) => {
  const body = await readJson<Partial<AiTaskRequest>>(req);
  if (!body.novelId) throw new ApiError("缺少 novelId", 400);
  if (!body.feature) throw new ApiError("缺少 feature", 400);
  return sseResponse((signal) =>
    runTaskStream({
      novelId: body.novelId as string,
      chapterId: body.chapterId ?? null,
      feature: body.feature as AiTaskRequest["feature"],
      message: body.message,
      selection: body.selection,
      context: body.context,
      presetId: body.presetId ?? null,
      targetWords: body.targetWords,
      instruction: body.instruction,
      signal: linkedSignal(req, signal),
    }),
  );
});
