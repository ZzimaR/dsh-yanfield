"use client";

import * as React from "react";
import { Lock, Pencil, Plus, RefreshCw, ScrollText, Trash } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
  useToast,
} from "@/components/ui/kit";
import { apiDelete, notifyDataChanged, useApi } from "@/lib/client/api";
import { AI_FEATURE_LABEL, type PromptPreset } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/ui/cn";
import { PresetDialog } from "./PresetDialog";

export interface PresetsSectionProps {
  /** 预留：作品内预设（novelId）暂未在全局设置里展示。 */
  novelId?: string | null;
}

interface PresetListResponse {
  items: PromptPreset[];
}

type Filter = "all" | "custom" | "builtin";

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "custom", label: "自定义" },
  { value: "builtin", label: "内置" },
];

export function PresetsSection({ novelId }: PresetsSectionProps) {
  const url = novelId ? `/api/presets?novelId=${encodeURIComponent(novelId)}` : "/api/presets";
  const presetsApi = useApi<PresetListResponse>(url);
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PromptPreset | null>(null);
  const [removing, setRemoving] = React.useState<PromptPreset | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const items = presetsApi.data?.items ?? [];
  const customCount = items.filter((preset) => !preset.isBuiltin).length;
  const visible = items.filter((preset) => {
    if (filter === "custom") return !preset.isBuiltin;
    if (filter === "builtin") return preset.isBuiltin;
    return true;
  });
  const sorted = [...visible].sort((a, b) => {
    if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? 1 : -1;
    return a.name.localeCompare(b.name, "zh-CN");
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (preset: PromptPreset) => {
    setEditing(preset);
    setDialogOpen(true);
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/presets/${removing.id}`);
      await presetsApi.refresh();
      notifyDataChanged("presets");
      toast({ title: "已删除", description: `「${removing.name}」已移除`, tone: "success" });
      setRemoving(null);
    } catch (cause) {
      toast({
        title: "删除失败",
        description: cause instanceof Error ? cause.message : "请稍后再试",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">提示词预设</h2>
          <p className="mt-1 text-[12px] leading-6 text-ink-3">
            每个 AI 场景的 system / user 模板都在这里，可改、可停用、可恢复默认（内置预设只读）。
          </p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={openCreate}>
          新建预设
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          size="sm"
        />
        <span className="text-[11px] text-ink-3">
          共 {items.length} 个 · 自定义 {customCount}
        </span>
      </div>

      {presetsApi.loading && items.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : presetsApi.error ? (
        <Card className="flex items-center justify-between gap-3 border-danger/30 bg-danger/5 p-3.5">
          <p className="text-[12px] text-danger">预设加载失败：{presetsApi.error}</p>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void presetsApi.refresh()}>
            重试
          </Button>
        </Card>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-5" />}
          title={filter === "custom" ? "还没有自定义预设" : "暂无预设"}
          description="内置预设由项目提供；你可以复制一份改造成自己的语气与规则。"
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
              新建预设
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin max-h-[560px] space-y-2 overflow-y-auto pr-1">
          {sorted.map((preset) => (
            <Card key={preset.id} className={cn("p-3", !preset.enabled && "opacity-60")}>
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-ink">{preset.name}</span>
                    <Badge tone="accent">{AI_FEATURE_LABEL[preset.feature]}</Badge>
                    <Badge tone="default">{preset.modelRole === "prose" ? "长文任务" : "通用任务"}</Badge>
                    {preset.isBuiltin ? (
                      <Badge tone="jade">
                        <Lock className="mr-0.5 inline size-2.5" aria-hidden />
                        内置
                      </Badge>
                    ) : null}
                    {!preset.enabled ? <Badge tone="danger">已停用</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-5 text-ink-3">
                    {preset.systemPrompt || preset.userTemplate}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] text-ink-3">
                    温度 {preset.temperature.toFixed(2)} · 更新于 {formatRelativeTime(preset.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton label={preset.isBuiltin ? "查看内置预设" : "编辑预设"} size="sm" onClick={() => openEdit(preset)}>
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="删除预设"
                    size="sm"
                    disabled={preset.isBuiltin}
                    onClick={() => setRemoving(preset)}
                  >
                    <Trash className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PresetDialog
        open={dialogOpen}
        preset={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void presetsApi.refresh();
          toast({ title: editing ? "已更新预设" : "已创建预设", tone: "success" });
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title={`删除预设「${removing?.name ?? ""}」`}
        description="使用这个预设的场景会回退到内置提示词。"
        confirmText="删除预设"
        danger
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
