"use client";

/**
 * @ 引用选择器：章节 / 角色 / 世界观 / 伏笔 / 档案。
 * 打开时并行拉取本地列表（/api/characters 等），按关键词过滤后分组展示；
 * 点击即插入引用 chip（不把 @xxx 文本写进输入框）。
 */
import * as React from "react";
import { LoaderCircle, RefreshCw, Search, Users } from "lucide-react";
import { apiGet } from "@/lib/client/api";
import { cn } from "@/lib/ui/cn";
import type { MentionOption } from "./types";
import { MENTION_TYPE_LABEL, MENTION_TYPE_ORDER } from "./utils";

export interface MentionPickerProps {
  novelId: string;
  chapterId?: string | null;
  /** 当前 @ 后的输入内容 */
  query: string;
  onPick: (option: MentionOption) => void;
  onClose: () => void;
  onRegisterFirstOption?: (pick: (() => boolean) | null) => void;
}

type RawRow = Record<string, unknown>;

function readString(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** 兼容 `{ items: [] }` 与直接数组两种列表响应 */
function pickRows(data: unknown): RawRow[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : [];
  return list.filter((row): row is RawRow => !!row && typeof row === "object");
}

function toOption(type: MentionOption["type"], row: RawRow): MentionOption | null {
  const id = readString(row, ["id"]);
  if (!id) return null;
  if (type === "chapter") {
    const title = readString(row, ["title", "name"]) || "未命名章节";
    const order = row["order"];
    const prefix = typeof order === "number" ? `第 ${order} 章 · ` : "";
    return { type, id, label: `${prefix}${title}`, description: "" };
  }
  if (type === "character") {
    const name = readString(row, ["name", "title"]) || "未命名角色";
    return { type, id, label: name, description: readString(row, ["role", "identity", "description"]) };
  }
  if (type === "world") {
    const name = readString(row, ["name", "title"]) || "未命名设定";
    return { type, id, label: name, description: readString(row, ["category", "summary", "description"]) };
  }
  if (type === "foreshadow") {
    const name = readString(row, ["title", "name"]) || "未命名伏笔";
    return { type, id, label: name, description: readString(row, ["status", "content", "description"]) };
  }
  const name = readString(row, ["chapterTitle", "title", "name"]) || "未命名档案";
  return { type, id, label: name, description: readString(row, ["summary", "content"]) };
}

/** 拉取全部可选引用资料；部分分组失败时保留可用结果并明确提示。 */
async function loadMentionOptions(novelId: string): Promise<{ options: MentionOption[]; warning: string | null }> {
  const query = `?novelId=${encodeURIComponent(novelId)}`;
  const endpoints: Array<[MentionOption["type"], string]> = [
    ["chapter", `/api/chapters${query}&view=summary`],
    ["character", `/api/characters${query}`],
    ["world", `/api/world${query}`],
    ["foreshadow", `/api/foreshadows${query}`],
    ["archive", `/api/archives${query}`],
  ];

  const settled = await Promise.allSettled(
    endpoints.map(async ([type, url]) => {
      const data = await apiGet<unknown>(url);
      return { type, rows: pickRows(data) };
    }),
  );

  const options: MentionOption[] = [];
  const seen = new Set<string>();
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length === settled.length) {
    const first = failures[0];
    throw new Error(first?.status === "rejected" && first.reason instanceof Error
      ? first.reason.message
      : "引用资料加载失败");
  }
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value.rows) {
      const option = toOption(result.value.type, row);
      if (!option) continue;
      const key = `${option.type}:${option.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    }
  }
  return {
    options,
    warning: failures.length ? `${failures.length} 类资料加载失败，当前仅显示已成功加载的资料。` : null,
  };
}

export function MentionPicker({ novelId, query, onPick, onRegisterFirstOption }: MentionPickerProps) {
  const [options, setOptions] = React.useState<MentionOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadMentionOptions(novelId);
      setOptions(result.options);
      setError(result.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "引用资料加载失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadMentionOptions(novelId)
      .then((result) => {
        if (alive) {
          setOptions(result.options);
          setError(result.warning);
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "引用资料加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [novelId]);

  const filtered = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = keyword
      ? options.filter(
          (item) =>
            item.label.toLowerCase().includes(keyword) ||
            (item.description ?? "").toLowerCase().includes(keyword),
        )
      : options;
    return list.slice(0, 40);
  }, [options, query]);

  const groups = React.useMemo(
    () =>
      MENTION_TYPE_ORDER.map((type) => ({
        type,
        items: filtered.filter((item) => item.type === type),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );
  const pickFirst = React.useCallback(() => {
    const first = filtered[0];
    if (!first) return false;
    onPick(first);
    return true;
  }, [filtered, onPick]);
  React.useEffect(() => {
    onRegisterFirstOption?.(pickFirst);
    return () => onRegisterFirstOption?.(null);
  }, [onRegisterFirstOption, pickFirst]);

  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-md border border-line bg-surface shadow-float rise-in">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5 text-[11px] text-ink-4">
        <Search className="size-3" />
        <span className="min-w-0 flex-1 truncate">
          {query ? `引用资料：${query}` : "选择要引用的资料"}
        </span>
        {loading ? <LoaderCircle className="size-3 animate-spin text-ink-3" /> : null}
      </div>

      <div className="scroll-thin max-h-64 overflow-y-auto p-1">
        {error && groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
            <p className="text-[12px] text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-surface-2"
            >
              <RefreshCw className="size-3" /> 重试
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
            <Users className="size-4 text-ink-4" />
            <p className="text-[12px] text-ink-3">
              {loading ? "正在加载资料…" : query ? "没有匹配的资料" : "暂无可引用的资料"}
            </p>
            {!loading && options.length === 0 ? (
              <p className="text-[11px] text-ink-4">可先在「大纲 / 设定 / 档案」页创建内容</p>
            ) : null}
          </div>
        ) : (
          <>
            {error ? <p className="px-2 py-1 text-[10.5px] text-gold" role="status">{error}</p> : null}
            {groups.map((group) => (
            <div key={group.type} className="mb-1 last:mb-0">
              <div className="px-2 py-1 text-[10.5px] font-medium tracking-wide text-ink-4">
                {MENTION_TYPE_LABEL[group.type]}
              </div>
              {group.items.map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  onClick={() => onPick(item)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150",
                    "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-[11px] text-ink-4">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
