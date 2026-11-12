"use client";

/**
 * 卷纲
 * GET /api/volumes?novelId= + GET/PATCH /api/outlines/volume/[volumeId]
 *
 * 说明：VolumeOutline 只有 summary / arcGoal / keyEvents / foreshadowPlan 四个持久字段，
 * 因此「核心冲突」「情绪曲线」合并写在「本卷简介」里（提示文案已说明），
 * 卷名随本卷 PATCH 一起提交，并在保存后通过回调刷新分卷列表。
 */
import * as React from "react";
import { ArrowDown, ArrowUp, GripVertical, Layers, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, Dialog, Dropdown, EmptyState, IconButton, Input, useToast } from "@/components/ui/kit";
import { apiDelete, apiPatch, apiPost, notifyDataChanged, useApi } from "@/lib/client/api";
import { sameListOrderIndex } from "@/lib/editor/reorder";
import type { Volume, VolumeOutline } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { AiAssistSheet } from "./ai-assist";
import {
  AiTextField,
  InlineError,
  PanelCard,
  PanelSkeleton,
  SaveBar,
  StringListEditor,
  unwrapEntity,
} from "./form-kit";

interface VolumeDraft {
  summary: string;
  arcGoal: string;
  keyEvents: string[];
  foreshadowPlan: string[];
}

const AI_TARGETS = [
  { value: "arcGoal", label: "本卷目标" },
  { value: "summary", label: "本卷简介与核心冲突" },
];

function toDraft(outline: VolumeOutline): VolumeDraft {
  return {
    summary: outline.summary,
    arcGoal: outline.arcGoal,
    keyEvents: [...outline.keyEvents],
    foreshadowPlan: [...outline.foreshadowPlan],
  };
}

export interface VolumePanelProps {
  novelId: string;
  volumes: Volume[];
  chapters: { id: string; volumeId: string | null }[];
  selectedVolumeId: string | null;
  onSelectVolume: (volumeId: string) => void;
  /** 新建 / 保存后刷新分卷列表 */
  onVolumesChanged: () => void;
  /** 卷纲编辑区未保存状态变化 */
  onDirtyChange?: (dirty: boolean) => void;
  loading?: boolean;
}

export function VolumePanel({
  novelId,
  volumes,
  chapters,
  selectedVolumeId,
  onSelectVolume,
  onVolumesChanged,
  onDirtyChange,
  loading = false,
}: VolumePanelProps) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [rename, setRename] = React.useState<Volume | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [removing, setRemoving] = React.useState<Volume | null>(null);
  const [removeBusy, setRemoveBusy] = React.useState(false);
  const [dropAt, setDropAt] = React.useState<number | null>(null);
  const dragId = React.useRef<string | null>(null);
  const dropAtRef = React.useRef<number | null>(null);

  const rememberDropAt = (index: number) => {
    dropAtRef.current = index;
    setDropAt(index);
  };

  const clearDrag = () => {
    dragId.current = null;
    dropAtRef.current = null;
    setDropAt(null);
  };

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? null;

  const createVolume = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const created = unwrapEntity(await apiPost<Volume>(`/api/volumes`, { novelId, title }));
      setCreateOpen(false);
      setNewTitle("");
      onVolumesChanged();
      onSelectVolume(created.id);
      notifyDataChanged("volumes");
      toast({ title: "已新建分卷", description: `《${title}》`, tone: "success" });
    } catch (err) {
      toast({ title: "新建分卷失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  const chapterCount = (volumeId: string) => chapters.filter((chapter) => chapter.volumeId === volumeId).length;

  const openRename = (volume: Volume) => {
    setRename(volume);
    setRenameTitle(volume.title);
  };

  const submitRename = async () => {
    if (!rename) return;
    const title = renameTitle.trim();
    if (!title) return;
    setRenaming(true);
    try {
      await apiPatch<Volume>(`/api/volumes/${rename.id}`, { title });
      setRename(null);
      onVolumesChanged();
      notifyDataChanged("volumes");
      toast({ title: "卷已重命名", description: title, tone: "success" });
    } catch (err) {
      toast({ title: "重命名失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setRenaming(false);
    }
  };

  const moveVolume = async (volume: Volume, orderIndex: number) => {
    try {
      await apiPatch<Volume>(`/api/volumes/${volume.id}`, { orderIndex });
      onVolumesChanged();
      notifyDataChanged("volumes");
    } catch (err) {
      toast({ title: "调整分卷顺序失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    }
  };

  const submitRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await apiDelete(`/api/volumes/${removing.id}`);
      const rest = volumes.filter((volume) => volume.id !== removing.id);
      if (selectedVolumeId === removing.id && rest[0]) onSelectVolume(rest[0].id);
      setRemoving(null);
      onVolumesChanged();
      notifyDataChanged("volumes");
      toast({ title: "已删除分卷", description: "卷内章节已移到未分卷", tone: "success" });
    } catch (err) {
      toast({ title: "删除分卷失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <PanelCard
      title="卷纲"
      icon={<Layers className="size-4" />}
      description="分卷目标、关键事件与伏笔计划"
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px]"
          icon={<Plus className="size-3.5" />}
          onClick={() => setCreateOpen(true)}
        >
          新建卷
        </Button>
      }
    >
      {volumes.length === 0 ? (
        loading ? (
          <PanelSkeleton rows={3} />
        ) : (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="还没有分卷"
            description="长篇建议先分卷：一卷一个阶段目标，节奏更稳。"
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                新建第一卷
              </Button>
            }
            className="border-0 bg-transparent px-2 py-8"
          />
        )
      ) : (
        <div className="space-y-4">
          <div className="scroll-thin max-h-[236px] space-y-1 overflow-auto pr-1">
            {volumes.map((volume, index) => {
              const active = volume.id === selectedVolumeId;
              return (
                <div
                  key={volume.id}
                  data-volume-index={index}
                  onDragOver={(event) => {
                    if (!dragId.current) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    rememberDropAt(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
                  }}
                  onDrop={(event) => {
                    const fromId = dragId.current;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const insertAt = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
                    clearDrag();
                    if (!fromId) return;
                    const from = volumes.findIndex((item) => item.id === fromId);
                    const orderIndex = sameListOrderIndex(from, insertAt);
                    if (orderIndex === null) return;
                    void moveVolume(volumes[from], orderIndex);
                  }}
                  className={cn(
                    "flex items-stretch gap-0.5 rounded-md border pr-1 transition-colors",
                    active
                      ? "border-accent/40 bg-accent-soft"
                      : "border-transparent bg-surface-2 hover:border-line-strong hover:bg-surface-3",
                    dropAt === index && "shadow-[inset_0_2px_0_0_var(--color-accent)]",
                  )}
                >
                  <span
                    draggable
                    aria-label="拖动调整分卷顺序"
                    title="拖动排序"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", volume.title);
                      dragId.current = volume.id;
                    }}
                    onDragEnd={clearDrag}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragId.current = volume.id;
                    }}
                    onPointerMove={(event) => {
                      if (event.pointerType === "mouse" || !dragId.current) return;
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      const hit = document.elementFromPoint(event.clientX, event.clientY);
                      const row = hit?.closest("[data-volume-index]");
                      if (!(row instanceof HTMLElement)) return;
                      const rowIndex = Number(row.dataset.volumeIndex ?? "0");
                      const rect = row.getBoundingClientRect();
                      rememberDropAt(rowIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType === "mouse") return;
                      const fromId = dragId.current;
                      const insertAt = dropAtRef.current;
                      clearDrag();
                      if (!fromId || insertAt === null) return;
                      const from = volumes.findIndex((item) => item.id === fromId);
                      const orderIndex = sameListOrderIndex(from, insertAt);
                      if (orderIndex === null) return;
                      void moveVolume(volumes[from], orderIndex);
                    }}
                    onPointerCancel={(event) => {
                      if (event.pointerType === "mouse") return;
                      clearDrag();
                    }}
                    className="flex cursor-grab touch-none items-center pl-1 text-ink-4 active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectVolume(volume.id)}
                    onDoubleClick={() => openRename(volume)}
                    className="min-w-0 flex-1 px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    title="单击编辑卷纲，双击重命名"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("shrink-0 text-[12px] tabular-nums", active ? "text-accent" : "text-ink-3")}>
                        第 {index + 1} 卷
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{volume.title}</span>
                      <span className="shrink-0 text-[12px] text-ink-3">{chapterCount(volume.id)} 章</span>
                    </div>
                    {volume.summary ? (
                      <p className="mt-0.5 truncate text-[12px] text-ink-3">{volume.summary}</p>
                    ) : null}
                  </button>
                  <div className="flex items-center">
                    <Dropdown
                      align="end"
                      width={168}
                      items={[
                        { label: "重命名", icon: <Pencil className="size-3.5" />, onSelect: () => openRename(volume) },
                        {
                          label: "上移",
                          icon: <ArrowUp className="size-3.5" />,
                          disabled: index <= 0,
                          onSelect: () => void moveVolume(volume, index - 1),
                        },
                        {
                          label: "下移",
                          icon: <ArrowDown className="size-3.5" />,
                          disabled: index >= volumes.length - 1,
                          onSelect: () => void moveVolume(volume, index + 1),
                        },
                        { separator: true },
                        {
                          label: "删除卷",
                          icon: <Trash2 className="size-3.5" />,
                          danger: true,
                          onSelect: () => setRemoving(volume),
                        },
                      ]}
                      trigger={
                        <IconButton label="分卷设置" size="sm" className="text-ink-3">
                          <MoreHorizontal className="size-3.5" />
                        </IconButton>
                      }
                    />
                  </div>
                </div>
              );
            })}
            {dropAt === volumes.length ? <div className="h-0.5 rounded-full bg-accent" /> : null}
          </div>

          {selectedVolume ? (
            <VolumeOutlineEditor
              key={selectedVolume.id}
              novelId={novelId}
              volume={selectedVolume}
              chapterCount={chapterCount(selectedVolume.id)}
              onSaved={onVolumesChanged}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-3">
              选择左上方的一卷开始编辑卷纲。
            </p>
          )}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="新建分卷"
        description="分卷是长篇的节奏单位：一卷一个阶段目标，章数按实际需要写。"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={creating} onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" loading={creating} disabled={!newTitle.trim()} onClick={createVolume}>
              创建
            </Button>
          </div>
        }
      >
        <Input
          autoFocus
          label="卷名"
          value={newTitle}
          placeholder="例如：第一卷 · 退潮"
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void createVolume();
          }}
        />
      </Dialog>

      <Dialog
        open={rename !== null}
        onClose={() => !renaming && setRename(null)}
        title="重命名分卷"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={renaming} onClick={() => setRename(null)}>
              取消
            </Button>
            <Button variant="primary" size="sm" loading={renaming} disabled={!renameTitle.trim()} onClick={() => void submitRename()}>
              保存
            </Button>
          </div>
        }
      >
        <Input
          autoFocus
          label="卷名"
          value={renameTitle}
          placeholder="例如：第一卷 · 退潮"
          onChange={(event) => setRenameTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitRename();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="删除这一卷？"
        description={
          removing
            ? `卷「${removing.title}」和卷纲会被删除。卷里的章节会移到未分卷，正文还在。`
            : undefined
        }
        confirmText="删除"
        danger
        loading={removeBusy}
        onConfirm={() => void submitRemove()}
        onClose={() => {
          if (!removeBusy) setRemoving(null);
        }}
      />
    </PanelCard>
  );
}

function VolumeOutlineEditor({
  novelId,
  volume,
  chapterCount,
  onSaved,
  onDirtyChange,
}: {
  novelId: string;
  volume: Volume;
  chapterCount: number;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<VolumeOutline>(`/api/outlines/volume/${volume.id}`);
  const [draft, setDraft] = React.useState<VolumeDraft | null>(null);
  const [title, setTitle] = React.useState(volume.title);
  const [saving, setSaving] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const lastVolumeTitle = React.useRef(volume.title);

  const baseline = React.useMemo(() => (data ? toDraft(data) : null), [data]);

  React.useEffect(() => {
    if (!baseline) return;
    setDraft((prev) => (dirtyRef.current && prev ? prev : baseline));
  }, [baseline]);

  React.useEffect(() => {
    if (volume.title === lastVolumeTitle.current) return;
    lastVolumeTitle.current = volume.title;
    setTitle(volume.title);
  }, [volume.title]);

  const effectiveDirty = Boolean((draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline)) || title !== volume.title);
  const busy = saving || effectiveDirty;

  React.useEffect(() => {
    dirtyRef.current = effectiveDirty;
    onDirtyChange?.(effectiveDirty);
  }, [effectiveDirty, onDirtyChange]);

  const update = <K extends keyof VolumeDraft>(key: K, value: VolumeDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const nextTitle = title.trim() || volume.title;
      // 卷纲端点只负责卷纲字段；卷名与卷简介同步到 /api/volumes/[id]
      const saved = await apiPatch<VolumeOutline>(`/api/outlines/volume/${volume.id}`, draft);
      if (nextTitle !== volume.title || draft.summary !== volume.summary) {
        await apiPatch<Volume>(`/api/volumes/${volume.id}`, { title: nextTitle, summary: draft.summary });
      }
      setDraft(toDraft(saved));
      setTitle(nextTitle);
      onSaved();
      notifyDataChanged("outline");
      toast({ title: "卷纲已保存", tone: "success" });
    } catch (err) {
      toast({ title: "保存卷纲失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleAiAdopt = (text: string, target: string) => {
    if (target === "arcGoal") update("arcGoal", text);
    else if (target === "summary") update("summary", text);
  };

  return (
    <div className="space-y-3 border-t border-line pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="accent">第 {volume.orderIndex + 1} 卷</Badge>
          <span className="text-[11px] text-ink-3">{chapterCount} 章</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px] text-accent hover:bg-accent-soft"
          icon={<Sparkles className="size-3.5" />}
          disabled={!draft}
          onClick={() => setAiOpen(true)}
        >
          AI 生成
        </Button>
      </div>

      {error && !data ? <InlineError message={error} onRetry={() => void refresh()} /> : null}

      {!draft ? (
        loading ? (
          <PanelSkeleton rows={3} />
        ) : (
          <p className="text-[12.5px] text-ink-3">卷纲加载中…</p>
        )
      ) : (
        <>
          <Input label="卷名" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="第一卷 · …" />
          <AiTextField
            label="本卷目标"
            field="本卷目标"
            feature="outline-volume"
            novelId={novelId}
            value={draft.arcGoal}
            onChange={(value) => update("arcGoal", value)}
            rows={2}
            placeholder="这一卷结束时，故事必须发生什么变化。"
          />
          <AiTextField
            label="本卷简介与核心冲突"
            field="本卷简介与核心冲突"
            feature="outline-volume"
            novelId={novelId}
            value={draft.summary}
            onChange={(value) => update("summary", value)}
            rows={3}
            placeholder="核心冲突是什么？情绪怎么走（起—压—扬）？"
            hint="本卷简介、核心冲突与情绪曲线写在一起；关键事件和伏笔计划在下方单独维护。"
          />
          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">关键事件</div>
            <StringListEditor
              items={draft.keyEvents}
              onChange={(items) => update("keyEvents", items)}
              placeholder="按发生顺序写"
              emptyHint="列出本卷 3–6 个关键事件。"
              ai={{ feature: "outline-volume", novelId, field: "本卷关键事件" }}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">伏笔计划</div>
            <StringListEditor
              items={draft.foreshadowPlan}
              onChange={(items) => update("foreshadowPlan", items)}
              placeholder="埋什么、何时收"
              emptyHint="本卷打算埋设 / 回收哪些伏笔。"
              ai={{ feature: "outline-volume", novelId, field: "本卷伏笔计划" }}
            />
          </div>
        </>
      )}

      <div className={cn("pt-0.5", busy && "border-t border-line pt-2.5")}>
        <SaveBar dirty={effectiveDirty} saving={saving} onSave={save} hint="卷纲会随正文写作进入 AI 上下文" />
      </div>

      <AiAssistSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI 生成 · 卷纲"
        feature="outline-volume"
        novelId={novelId}
        instruction="请根据本书总纲与已有章节，为下面选中的卷纲字段写一段可直接使用的成稿，约 120–200 字；具体到事件与人物选择，避免空话。"
        targets={AI_TARGETS}
        onAdopt={handleAiAdopt}
      />
    </div>
  );
}
