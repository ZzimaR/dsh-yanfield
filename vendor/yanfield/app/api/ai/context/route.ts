import type { ContextConfig } from "@/lib/types";
import { ApiError, handle, readJson } from "@/lib/api-utils";
import { assembleContext } from "@/lib/ai/context";
import { mergeContextConfig } from "@/lib/ai/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContextPreviewBody {
  novelId?: string;
  chapterId?: string | null;
  context?: Partial<ContextConfig>;
  selection?: string;
  mentions?: { type: "character" | "world" | "chapter" | "archive" | "foreshadow"; id: string; label: string }[];
}

/** 上下文装配预览：展示常规对话资料估算；Agent 另按分节开关动态读取资料。 */
export const POST = handle(async (req) => {
  const body = await readJson<ContextPreviewBody>(req);
  if (!body.novelId) throw new ApiError("缺少 novelId", 400);
  const assembled = assembleContext({
    novelId: body.novelId,
    chapterId: body.chapterId ?? null,
    config: mergeContextConfig(body.context),
    selection: body.selection,
    mentions: body.mentions,
  });
  return Response.json(assembled);
});
