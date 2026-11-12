"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button, useToast } from "@/components/ui/kit";
import { codexParentId, orderedCodexItems, setCodexPicked, type CodexItem } from "@/lib/ai/codex";
import { apiGet, apiPatch, apiPost, notifyDataChanged } from "@/lib/client/api";
import { cn } from "@/lib/ui/cn";
import type { Character, Foreshadow, WorldSetting } from "@/lib/types";
import { CHARACTER_ROLE_LABEL, FORESHADOW_STATUS_LABEL, WORLD_CATEGORY_LABEL } from "@/lib/types";

export function CodexProposal({
  novelId,
  items,
  applied,
  superseded = false,
  onChange,
  onApplied,
}: {
  novelId: string;
  items: CodexItem[];
  applied: boolean;
  /** 已被下一份清单替换：整块置灰、只读 */
  superseded?: boolean;
  onChange: (items: CodexItem[]) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  /** 上一轮写入是否中断过（即使一张都没成功，重试按钮也要提示剩余数量） */
  const [interrupted, setInterrupted] = React.useState(false);
  /** 已成功写入的 ref→id：跨重试保留，重试时只补写没成功的卡，避免同一张卡被重复创建。 */
  const writtenRef = React.useRef<Map<string, string>>(new Map());
  /** 父级解析不到合法 id、已按无父级写入的卡片标题，用于就地提示。 */
  const [droppedParents, setDroppedParents] = React.useState<string[]>([]);
  const worlds = items.filter((item) => item.kind === "world");
  const worldRefs = new Set(worlds.map((item) => item.ref));
  const roots = worlds.filter((item) => !item.parentRef || !worldRefs.has(item.parentRef));
  const people = items.filter((item) => item.kind === "character");
  const clues = items.filter((item) => item.kind === "foreshadow");
  const picked = items.filter((item) => item.picked).length;
  const readOnly = applied || superseded;
  const chosen = orderedCodexItems(items);
  const written = writtenRef.current;
  const remaining = chosen.filter((item) => !written.has(item.ref)).length;
  const writtenCount = chosen.length - remaining;
  /** 写入中断过一部分：按钮改成「重试剩余 N 张」，只补写没成功的卡 */
  const retryable = remaining > 0 && (writtenCount > 0 || interrupted);

  const commit = async () => {
    if (saving || readOnly) return;
    const chosen = orderedCodexItems(items);
    const todo = chosen.filter((item) => !writtenRef.current.has(item.ref));
    if (todo.length === 0) return;
    setSaving(true);
    // 已有卡（update）的 id 先入表；上一轮已成功的卡从 ref 里取，重试只补失败项。
    const ids = new Map<string, string>();
    for (const item of items) {
      if (item.op === "update" && item.id) ids.set(item.ref, item.id);
    }
    for (const [ref, id] of writtenRef.current) ids.set(ref, id);
    // 父级可能被 prepareCodexItems 映射成库里已存在的设定 id（不在本批 ids 里），单独校验
    let dropped: string[] = [];
    let done = 0;
    try {
      const existingWorldIds = todo.some((item) => item.kind === "world" && item.parentRef)
        ? await fetchWorldIds(novelId)
        : new Set<string>();
      for (const item of todo) {
        const saved = await writeCard(novelId, item, ids, existingWorldIds);
        writtenRef.current.set(item.ref, saved.id);
        ids.set(item.ref, saved.id);
        if (saved.droppedParent) dropped.push(item.title.trim() || item.ref);
        done += 1;
      }
    } catch (err) {
      setInterrupted(true);
      if (dropped.length > 0) setDroppedParents((prev) => Array.from(new Set([...prev, ...dropped])));
      const remainingTodo = todo.length - done;
      toast({
        title: done > 0 ? `已写入 ${done} 张，还有 ${remainingTodo} 张待重试` : "写入中断",
        description: `${err instanceof Error ? err.message : "请再试一次"}。重试只补写剩余 ${remainingTodo} 张，已成功的不重复创建。`,
        tone: "error",
      });
      return;
    } finally {
      setSaving(false);
    }
    setInterrupted(false);
    if (dropped.length > 0) setDroppedParents((prev) => Array.from(new Set([...prev, ...dropped])));
    notifyDataChanged();
    onApplied();
    toast({
      title: `已写入 ${chosen.length} 张卡`,
      description:
        dropped.length > 0
          ? `${dropped.length} 张卡的父级无法确认：新建卡已按无父级写入、已有卡保留原父级（${dropped.join("、")}）`
          : undefined,
      tone: "success",
    });
  };

  return (
    <div className={cn("mt-2 rounded-md border border-line bg-paper px-2 py-2", superseded && "opacity-60")}>
      <ul className="space-y-1">
        {roots.map((item) => (
          <ProposalNode
            key={item.ref}
            item={item}
            items={worlds}
            depth={0}
            disabled={readOnly}
            onPick={(ref, next) => onChange(setCodexPicked(items, ref, next))}
          />
        ))}
      </ul>
      {people.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {people.map((item) => (
            <li key={item.ref}>
              <ProposalRow item={item} disabled={readOnly} onPick={(next) => onChange(setCodexPicked(items, item.ref, next))} />
            </li>
          ))}
        </ul>
      ) : null}
      {clues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {clues.map((item) => (
            <li key={item.ref}>
              <ProposalRow item={item} disabled={readOnly} onPick={(next) => onChange(setCodexPicked(items, item.ref, next))} />
            </li>
          ))}
        </ul>
      ) : null}
      {applied ? <p className="mt-2 text-[12px] text-jade">已写入</p> : null}
      {superseded ? <p className="mt-2 text-[12px] text-ink-4">已被下一条清单替换</p> : null}
      {droppedParents.length > 0 ? (
        <p className="mt-2 text-[12px] text-gold">父级无法确认，新建卡已按无父级写入、已有卡保留原父级：{droppedParents.join("、")}</p>
      ) : null}
      {retryable && !applied ? (
        <p className="mt-2 text-[12px] text-ink-3">
          已写入 {writtenCount} 张，剩余 {remaining} 张待重试（已成功的不重复写入）
        </p>
      ) : null}
      {applied ? null : (
        <Button
          className="mt-2"
          size="sm"
          variant="primary"
          icon={<Check className="size-3.5" />}
          loading={saving}
          disabled={picked === 0 || readOnly}
          onClick={() => void commit()}
        >
          {retryable ? `重试剩余 ${remaining} 张` : "写入选中的"}
        </Button>
      )}
    </div>
  );
}

function ProposalNode({
  item,
  items,
  depth,
  disabled,
  onPick,
}: {
  item: CodexItem;
  items: CodexItem[];
  depth: number;
  disabled: boolean;
  onPick: (ref: string, picked: boolean) => void;
}) {
  const children = items.filter((child) => child.parentRef === item.ref);
  return (
    <li>
      <div style={{ paddingLeft: depth * 14 }}>
        <ProposalRow item={item} disabled={disabled} onPick={(picked) => onPick(item.ref, picked)} />
      </div>
      {children.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {children.map((child) => (
            <ProposalNode key={child.ref} item={child} items={items} depth={depth + 1} disabled={disabled} onPick={onPick} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ProposalRow({ item, disabled, onPick }: { item: CodexItem; disabled: boolean; onPick: (picked: boolean) => void }) {
  const kind =
    item.kind === "character"
      ? item.role
        ? `角色 · ${CHARACTER_ROLE_LABEL[item.role]}`
        : "角色"
      : item.kind === "foreshadow"
        ? item.status
          ? `伏笔 · ${FORESHADOW_STATUS_LABEL[item.status]}`
          : "伏笔"
        : item.category
          ? WORLD_CATEGORY_LABEL[item.category]
          : "设定";
  return (
    <label className="flex items-start gap-2 px-1 py-0.5">
      <input type="checkbox" className="mt-1" checked={item.picked} disabled={disabled} onChange={(event) => onPick(event.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{item.title}</span>
        <span className="block text-[11px] text-ink-3">
          {kind}
          {item.op === "update" ? " · 修改已有" : " · 新建"}
          {item.relation ? ` · ${item.relation}` : ""}
        </span>
      </span>
    </label>
  );
}

interface WriteResult {
  id: string;
  /** 父级解析不到合法 id、已按无父级写入时，带上原 ref 供提示 */
  droppedParent: string | null;
}

/** 世界卡父级：只接受本次刚写入/更新的 id 或库里已存在的设定 id，绝不把 ref 当 parentId 提交。 */
function resolveWorldParent(
  item: CodexItem,
  ids: ReadonlyMap<string, string>,
  existingWorldIds: ReadonlySet<string>,
): { parentId: string | null | undefined; droppedParent: string | null } {
  let parentId: string | null | undefined;
  try {
    parentId = codexParentId(item, ids);
  } catch {
    parentId = undefined;
  }
  if (!item.parentRef) {
    // 没有父级：null 表示新建根卡，undefined 表示更新时不动父级
    return { parentId, droppedParent: null };
  }
  // 有 parentRef 时必须能对上合法 id；null / undefined 都说明没解析出来
  if (parentId === null || parentId === undefined) {
    return { parentId: item.op === "create" ? null : undefined, droppedParent: item.parentRef };
  }
  if (item.op === "update" && item.id && parentId === item.id) {
    // 不能把卡自己当父级（服务端会 400「父级设定不能是自身」），保留原父级
    return { parentId: undefined, droppedParent: item.parentRef };
  }
  const knownId = new Set(ids.values()).has(parentId) || existingWorldIds.has(parentId);
  if (knownId) return { parentId, droppedParent: null };
  // 解析不到合法 id（模型给了父级标题/未知 ref）：不提交非法 parentId，
  // 新建卡按无父级写入，已有卡保留原父级；提示用户。
  return { parentId: item.op === "create" ? null : undefined, droppedParent: item.parentRef };
}

/** 拉一次库里已有设定 id：prepareCodexItems 可能把父级标题换成了已存在的设定 id。 */
async function fetchWorldIds(novelId: string): Promise<Set<string>> {
  const data = await apiGet<{ items?: WorldSetting[] }>(`/api/world?novelId=${encodeURIComponent(novelId)}`);
  return new Set((data?.items ?? []).map((item) => item.id));
}

async function writeCard(
  novelId: string,
  item: CodexItem,
  ids: ReadonlyMap<string, string>,
  existingWorldIds: ReadonlySet<string>,
): Promise<WriteResult> {
  if (item.kind === "character") {
    const body: Record<string, unknown> = { name: item.title.trim() };
    if (item.role) body.role = item.role;
    else if (item.op === "create") body.role = "supporting";
    if (item.identity || item.summary) body.identity = item.identity || item.summary;
    if (item.personality) body.personality = item.personality;
    if (item.op === "update" && item.id) {
      const saved = await apiPatch<Character>(`/api/characters/${item.id}`, body);
      return { id: saved.id, droppedParent: null };
    }
    const saved = await apiPost<Character>("/api/characters", { novelId, ...body });
    return { id: saved.id, droppedParent: null };
  }
  if (item.kind === "foreshadow") {
    const body: Record<string, unknown> = { title: item.title.trim() };
    if (item.status) body.status = item.status;
    else if (item.op === "create") body.status = "planted";
    if (item.description || item.content) body.description = item.description || item.content;
    if (item.notes || item.summary) body.notes = item.notes || item.summary;
    if (item.op === "update" && item.id) {
      const saved = await apiPatch<Foreshadow>(`/api/foreshadows/${item.id}`, body);
      return { id: saved.id, droppedParent: null };
    }
    const saved = await apiPost<Foreshadow>("/api/foreshadows", { novelId, ...body });
    return { id: saved.id, droppedParent: null };
  }
  const parent = resolveWorldParent(item, ids, existingWorldIds);
  const body: Record<string, unknown> = { title: item.title.trim() };
  if (item.category) body.category = item.category;
  else if (item.op === "create") body.category = "geography";
  if (item.summary) body.summary = item.summary;
  if (item.content) body.content = item.content;
  if (parent.parentId !== undefined) body.parentId = parent.parentId;
  if (item.op === "update" && item.id) {
    const saved = await apiPatch<WorldSetting>(`/api/world/${item.id}`, body);
    return { id: saved.id, droppedParent: parent.droppedParent };
  }
  const saved = await apiPost<WorldSetting>("/api/world", { novelId, ...body });
  return { id: saved.id, droppedParent: parent.droppedParent };
}
