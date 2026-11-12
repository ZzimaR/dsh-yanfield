import { ApiError, handle, readJson } from "@/lib/api-utils";
import { runArchiveExtract } from "@/lib/ai/engine";
import { linkedSignal, sseResponse } from "../../sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 从本章正文抽取故事档案（服务端直接落库，并返回 save-archive 动作） */
export const POST = handle(async (req) => {
  const body = await readJson<{ novelId?: string; chapterId?: string }>(req);
  if (!body.novelId) throw new ApiError("缺少 novelId", 400);
  if (!body.chapterId) throw new ApiError("缺少 chapterId", 400);
  return sseResponse((signal) =>
    runArchiveExtract({
      novelId: body.novelId as string,
      chapterId: body.chapterId as string,
      signal: linkedSignal(req, signal),
    }),
  );
});
