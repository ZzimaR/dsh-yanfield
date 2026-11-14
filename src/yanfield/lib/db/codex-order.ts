import { all, run, parseJson } from "./index";
import type { CodexGroup, CodexOrder } from "@/lib/editor/codex-order";

export function getCodexOrder(novelId: string): CodexOrder {
  const rows = all<{group_key: CodexGroup; ids: string}>("SELECT group_key, ids FROM codex_order WHERE novel_id = ?", [novelId]);
  return Object.fromEntries(rows.map(row => [row.group_key, parseJson<string[]>(row.ids, [])]));
}

export function saveCodexOrder(novelId: string, group: CodexGroup, ids: string[]): void {
  run(`INSERT INTO codex_order (novel_id,group_key,ids) VALUES (?,?,?)
    ON CONFLICT(novel_id,group_key) DO UPDATE SET ids=excluded.ids`, [novelId, group, JSON.stringify(ids)]);
}
