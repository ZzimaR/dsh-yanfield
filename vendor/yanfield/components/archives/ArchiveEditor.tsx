"use client";

/**
 * 手动编辑本章档案
 * 契约没有 PATCH /api/archives/[id]，因此保存走 POST /api/archives（按 chapterId upsert）。
 * 手动编辑后 generatedBy 记为 manual，状态与来源章节字数沿用原档案。
 */
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Sheet, Textarea, useToast } from "@/components/ui/kit";
import { apiPost, notifyDataChanged } from "@/lib/client/api";
import type {
  ArchiveConflict,
  CharacterState,
  LedgerEntry,
  StoryArchive,
  TimelineEntry,
} from "@/lib/types";
import { cn } from "@/lib/ui/cn";

interface ArchiveDraft {
  chapterSummary: string;
  characterStates: CharacterState[];
  settingStates: { title: string; state: string }[];
  ledger: LedgerEntry[];
  timeline: TimelineEntry[];
  foreshadows: { title: string; status: string; note: string }[];
  conflicts: ArchiveConflict[];
}

function toDraft(archive: StoryArchive): ArchiveDraft {
  return {
    chapterSummary: archive.chapterSummary,
    characterStates: archive.characterStates.map((item) => ({ ...item })),
    settingStates: archive.settingStates.map((item) => ({ ...item })),
    ledger: archive.ledger.map((item) => ({ ...item })),
    timeline: archive.timeline.map((item) => ({ ...item })),
    foreshadows: archive.foreshadows.map((item) => ({ ...item })),
    conflicts: archive.conflicts.map((item) => ({ ...item })),
  };
}

function RowsEditor<T>({
  rows,
  onChange,
  fields,
  createRow,
  addLabel,
  emptyText,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: { key: keyof T & string; label: string; placeholder?: string }[];
  createRow: () => T;
  addLabel: string;
  emptyText: string;
}) {
  const gridClass =
    fields.length >= 4 ? "sm:grid-cols-4" : fields.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  const updateCell = (index: number, key: keyof T & string, value: string) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-[11.5px] text-ink-3">{emptyText}</p> : null}
      {rows.map((row, index) => (
        <div key={index} className="space-y-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] tabular-nums text-ink-3">#{index + 1}</span>
            <button
              type="button"
              aria-label="删除这一行"
              className="flex size-5 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-surface hover:text-danger"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          <div className={cn("grid gap-2", gridClass)}>
            {fields.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                value={String(row[field.key] ?? "")}
                placeholder={field.placeholder}
                onChange={(event) => updateCell(index, field.key, event.target.value)}
              />
            ))}
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...rows, createRow()])}>
        {addLabel}
      </Button>
    </div>
  );
}

export function ArchiveEditor({
  open,
  novelId,
  archive,
  onClose,
  onSaved,
}: {
  open: boolean;
  novelId: string;
  archive: StoryArchive | null;
  onClose: () => void;
  onSaved: (saved: StoryArchive) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<ArchiveDraft | null>(archive ? toDraft(archive) : null);
  const [saving, setSaving] = React.useState(false);
  const initKey = `${open ? 1 : 0}:${archive?.id ?? "none"}:${archive?.updatedAt ?? ""}`;
  const lastInitKey = React.useRef("");

  React.useEffect(() => {
    if (lastInitKey.current === initKey) return;
    lastInitKey.current = initKey;
    if (!open) return;
    setDraft(archive ? toDraft(archive) : null);
  }, [archive, initKey, open]);

  const save = async () => {
    if (!draft || !archive) return;
    setSaving(true);
    try {
      const saved = await apiPost<StoryArchive>(`/api/archives`, {
        novelId,
        chapterId: archive.chapterId,
        chapterTitle: archive.chapterTitle,
        orderIndex: archive.orderIndex,
        ...draft,
        status: archive.status,
        sourceWordCount: archive.sourceWordCount,
        generatedBy: "manual",
        model: archive.model,
      });
      onSaved(saved);
      notifyDataChanged("archives");
      toast({
        title: "档案已更新",
        description: "重新提取时会保留你的修改。如果改的是事实，记得同步修改正文，让两边保持一致。",
        tone: "success",
      });
      onClose();
    } catch (err) {
      toast({ title: "保存档案失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="手动编辑本章档案"
      width={760}
      footer={
        <div className="flex items-center justify-end gap-2 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!draft} onClick={save}>
            保存档案
          </Button>
        </div>
      }
    >
      {!draft ? (
        <p className="py-10 text-center text-[12.5px] text-ink-3">没有可编辑的档案。</p>
      ) : (
        <div className="space-y-5 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            手动修正只改档案本身，不会改动正文；保存后该章档案不再标记为过期。
          </div>

          <Textarea
            label="本章档案（事实摘要）"
            rows={4}
            value={draft.chapterSummary}
            onChange={(event) => setDraft({ ...draft, chapterSummary: event.target.value })}
            hint="只记录正文里写过的事实，不要补充推断。"
          />

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">角色档案</h4>
              <p className="text-[11px] text-ink-3">角色名 · 本章结束时的状态 · 本章发生的变化</p>
            </div>
            <RowsEditor<CharacterState>
              rows={draft.characterStates}
              onChange={(characterStates) => setDraft({ ...draft, characterStates })}
              fields={[
                { key: "name", label: "角色名" },
                { key: "state", label: "状态", placeholder: "位置/伤势/心态" },
                { key: "changes", label: "变化", placeholder: "本章发生了什么" },
              ]}
              createRow={() => ({ name: "", state: "", changes: "" })}
              addLabel="添加角色状态"
              emptyText="本章没有角色状态记录。"
            />
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">设定档案</h4>
              <p className="text-[11px] text-ink-3">设定名 · 本章被推进或改变的部分</p>
            </div>
            <RowsEditor<{ title: string; state: string }>
              rows={draft.settingStates}
              onChange={(settingStates) => setDraft({ ...draft, settingStates })}
              fields={[
                { key: "title", label: "设定" },
                { key: "state", label: "本章状态" },
              ]}
              createRow={() => ({ title: "", state: "" })}
              addLabel="添加设定状态"
              emptyText="本章没有设定变动记录。"
            />
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">人物总账</h4>
              <p className="text-[11px] text-ink-3">项目 · 本章变化 · 结余 · 备注（如渡钱、人情债）</p>
            </div>
            <RowsEditor<LedgerEntry>
              rows={draft.ledger}
              onChange={(ledger) => setDraft({ ...draft, ledger })}
              fields={[
                { key: "name", label: "项目" },
                { key: "delta", label: "变化", placeholder: "+2" },
                { key: "balance", label: "结余", placeholder: "7" },
                { key: "note", label: "备注" },
              ]}
              createRow={() => ({ name: "", delta: "", balance: "", note: "" })}
              addLabel="添加账目"
              emptyText="本章没有账目变化。"
            />
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">时间线</h4>
              <p className="text-[11px] text-ink-3">故事内时间 · 发生的事</p>
            </div>
            <RowsEditor<TimelineEntry>
              rows={draft.timeline}
              onChange={(timeline) => setDraft({ ...draft, timeline })}
              fields={[
                { key: "storyTime", label: "时间点", placeholder: "如：入夜后两刻" },
                { key: "event", label: "事件" },
              ]}
              createRow={() => ({ storyTime: "", event: "" })}
              addLabel="添加时间线"
              emptyText="本章没有时间线记录。"
            />
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">伏笔状态</h4>
              <p className="text-[11px] text-ink-3">伏笔 · 本章状态 · 说明</p>
            </div>
            <RowsEditor<{ title: string; status: string; note: string }>
              rows={draft.foreshadows}
              onChange={(foreshadows) => setDraft({ ...draft, foreshadows })}
              fields={[
                { key: "title", label: "伏笔" },
                { key: "status", label: "状态" },
                { key: "note", label: "说明" },
              ]}
              createRow={() => ({ title: "", status: "", note: "" })}
              addLabel="添加伏笔记录"
              emptyText="本章没有伏笔记录。"
            />
          </section>

          <section className="space-y-2">
            <div>
              <h4 className="text-[14px] font-medium text-ink">待确认冲突</h4>
              <p className="text-[11px] text-ink-3">主题 · 冲突说明；保存后仍以 API 数据为准。</p>
            </div>
            <RowsEditor<ArchiveConflict>
              rows={draft.conflicts}
              onChange={(conflicts) => setDraft({ ...draft, conflicts })}
              fields={[
                { key: "topic", label: "冲突主题" },
                { key: "detail", label: "说明" },
              ]}
              createRow={() => ({ topic: "", detail: "", status: "pending" })}
              addLabel="添加冲突项"
              emptyText="本章没有待确认冲突。"
            />
          </section>
        </div>
      )}
    </Sheet>
  );
}
