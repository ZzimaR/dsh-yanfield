import { z } from "zod";
import { bad, handle, notFound, ok } from "@/lib/api-utils";
import { readBody, requireQueryParam } from "@/app/api/_lib/http";
import { getCodexOrder, saveCodexOrder } from "@/lib/db/codex-order";
import { CODEX_GROUPS, moveCodexEntry, orderCodexEntries } from "@/lib/editor/codex-order";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";

export const GET = handle(async request => {
  const novelId = requireQueryParam(request, "novelId", "作品");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  return ok(getCodexOrder(novelId));
});

export const POST = handle(async request => {
  const input = z.object({ novelId: z.string(), group: z.enum(CODEX_GROUPS), id: z.string(), anchor: z.string(), after: z.boolean() }).safeParse(await readBody(request));
  if (!input.success) return bad("资料排序参数无效");
  const { novelId, group, id, anchor, after } = input.data;
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const entries: {id:string; parentId?:string|null}[] = group === "characters" ? repo.listCharacters(novelId)
    : group === "locations" ? repo.listLocations(novelId)
    : group === "foreshadows" ? repo.listForeshadows(novelId)
    : repo.listWorld(novelId).filter(card => (card.category === "item") === (group === "items"));
  const ids = new Set(entries.map(card => card.id));
  const effectiveParent = (card: typeof entries[number]) => card.parentId && ids.has(card.parentId) ? card.parentId : null;
  const source = entries.find(card => card.id === id);
  const target = entries.find(card => card.id === anchor);
  if (!source || !target || effectiveParent(source) !== effectiveParent(target)) return bad("只能在同一组同一层级内调整顺序");
  const order = getCodexOrder(novelId);
  const next = moveCodexEntry(orderCodexEntries(entries, order[group] ?? [], card => card.id).map(card => card.id), id, anchor, after);
  saveCodexOrder(novelId, group, next);
  return ok({ ...order, [group]: next });
});
