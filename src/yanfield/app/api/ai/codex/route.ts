import { CODEX_CONTEXT_LIMIT, type CodexItem, type CodexTurn } from "@/lib/ai/codex";
import { runCodexStream } from "@/lib/ai/engine";
import { ApiError, handle, readJson } from "@/lib/api-utils";
import { linkedSignal, sseResponse } from "../sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_TURN_LENGTH = 4000;
const MAX_DRAFT_ITEMS = 100;
const MAX_DRAFT_LENGTH = 32000;
const MAX_PROMPT_INPUT_LENGTH = 40000;

interface CodexBody {
  novelId?: string;
  message?: string;
  history?: CodexTurn[];
  draft?: CodexItem[];
  /** 当前章节正文节选；字符串，服务端再兜底截断到 CODEX_CONTEXT_LIMIT。 */
  contextText?: unknown;
}

/** 资料助手：根据作者粘贴的文字或对话，提案要新建/修改的角色、世界观与伏笔卡。 */
export const POST = handle(async (req) => {
  const body = await readJson<CodexBody>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("请求体必须是对象", 400);
  if (typeof body.novelId !== "string" || !body.novelId.trim()) throw new ApiError("缺少 novelId", 400);
  if (typeof body.message !== "string" || !body.message.trim()) throw new ApiError("消息不能为空", 400);
  if (body.message.length > MAX_MESSAGE_LENGTH) throw new ApiError(`消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符`, 400);
  if (body.contextText != null && typeof body.contextText !== "string") {
    throw new ApiError("contextText 必须是字符串", 400);
  }
  if (body.history != null && !Array.isArray(body.history)) throw new ApiError("history 必须是数组", 400);
  if (body.draft != null && !Array.isArray(body.draft)) throw new ApiError("draft 必须是数组", 400);
  const history = body.history ?? [];
  if (history.length > MAX_HISTORY_TURNS) throw new ApiError(`对话历史不能超过 ${MAX_HISTORY_TURNS} 轮`, 400);
  if (history.some((turn) =>
    !turn || (turn.role !== "user" && turn.role !== "assistant") ||
    typeof turn.content !== "string" || turn.content.length > MAX_HISTORY_TURN_LENGTH
  )) {
    throw new ApiError("对话历史格式无效或单条内容过长", 400);
  }
  const draft = body.draft ?? [];
  if (draft.length > MAX_DRAFT_ITEMS) throw new ApiError(`待写入卡片不能超过 ${MAX_DRAFT_ITEMS} 张`, 400);
  if (draft.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new ApiError("待写入卡片格式无效", 400);
  }
  const draftLength = JSON.stringify(draft).length;
  if (draftLength > MAX_DRAFT_LENGTH) throw new ApiError("待写入卡片内容过长，请精简后重试", 400);
  const historyLength = history.reduce((length, turn) => length + turn.content.length, 0);
  const contextText =
    typeof body.contextText === "string" ? body.contextText.trim().slice(0, CODEX_CONTEXT_LIMIT) : "";
  if (body.message.length + historyLength + draftLength + contextText.length > MAX_PROMPT_INPUT_LENGTH) {
    throw new ApiError("本次资料助手输入过长，请缩短对话或待写入清单", 400);
  }
  return sseResponse((signal) =>
    runCodexStream({
      novelId: body.novelId as string,
      message: body.message as string,
      history,
      draft,
      contextText: contextText || undefined,
      signal: linkedSignal(req, signal),
    }),
  );
});
