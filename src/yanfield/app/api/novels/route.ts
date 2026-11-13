import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { isValidNovelWordGoal, MAX_NOVEL_WORD_GOAL } from "@/lib/novel-goal";
import type { Novel } from "@/lib/types";
import { listNovelSummaries } from "@/app/api/_lib/novels";
import {
  NOVEL_STATUSES,
  pickEnum,
  pickFields,
  readBody,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOVEL_FIELDS: FieldSpec = {
  subtitle: "str",
  author: "str",
  genre: "str",
  tags: "str[]",
  synopsis: "str",
  coverKey: "str",
  wordGoal: "num",
  targetChapters: "num",
  styleGuide: "str",
  pov: "str",
  forbiddenWords: "str[]",
};

export const GET = handle(async () => ok({ items: listNovelSummaries() }));

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const title = requireString(body, "title", "作品标题");
  const input = pickFields<Novel>(body, NOVEL_FIELDS);
  if (input.wordGoal !== undefined && !isValidNovelWordGoal(input.wordGoal)) {
    return bad(`全书目标字数必须是 0 至 ${MAX_NOVEL_WORD_GOAL.toLocaleString("zh-CN")} 之间的整数`);
  }
  const status = pickEnum(body, "status", NOVEL_STATUSES, "作品状态");
  const created = repo.createNovel({ ...input, title, ...(status ? { status } : {}) });
  return ok(created, { status: 201 });
});
