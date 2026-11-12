"use client";

/**
 * 伏笔编辑 Sheet
 * 编辑：GET/PATCH /api/foreshadows/[id]；新建：POST /api/foreshadows；删除：DELETE /api/foreshadows/[id]
 */
import * as React from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Select, Sheet, Textarea, useToast } from "@/components/ui/kit";
import { CardEditorDocument, CardEditorHero, CardEditorSection as EditorSection } from "./CardEditorDocument";
import { FloatWindow } from "@/components/editor/FloatWindow";
import { referenceCardInAssistant } from "@/lib/editor/hand-off";
import { ModelKeyHint } from "@/components/ai/ModelKeyHint";
import { apiDelete, apiPatch, apiPost, notifyDataChanged, useApi } from "@/lib/client/api";
import type { Foreshadow, ForeshadowStatus } from "@/lib/types";
import { FORESHADOW_STATUS_LABEL } from "@/lib/types";
import { stripChapterNumber, unwrapEntity, useErrorToast } from "@/components/outline/form-kit";

interface ForeshadowDraft {
  title: string;
  description: string;
  plantedChapterId: string | null;
  payoffChapterId: string | null;
  status: ForeshadowStatus;
  notes: string;
}

function emptyDraft(): ForeshadowDraft {
  return { title: "", description: "", plantedChapterId: null, payoffChapterId: null, status: "planted", notes: "" };
}

function toDraft(foreshadow: Foreshadow): ForeshadowDraft {
  return {
    title: foreshadow.title,
    description: foreshadow.description,
    plantedChapterId: foreshadow.plantedChapterId,
    payoffChapterId: foreshadow.payoffChapterId,
    status: foreshadow.status,
    notes: foreshadow.notes,
  };
}

export function ForeshadowEditor({
  open,
  novelId,
  foreshadow,
  chapters,
  onClose,
  onSaved,
  onDeleted,
  presentation = "sheet",
}: {
  open: boolean;
  novelId: string;
  foreshadow: Foreshadow | null;
  chapters: { id: string; orderIndex: number; title: string }[];
  onClose: () => void;
  onSaved: (saved: Foreshadow) => void;
  onDeleted: () => void;
  /** 写作台里用可拖动的窗口，不盖成整页。 */
  presentation?: "sheet" | "float";
}) {
  const { toast } = useToast();
  const editing = Boolean(foreshadow);
  const detailApi = useApi<Foreshadow>(open && foreshadow ? `/api/foreshadows/${foreshadow.id}` : null);
  const [draft, setDraft] = React.useState<ForeshadowDraft>(() => (foreshadow ? toDraft(foreshadow) : emptyDraft()));
  const [saving, setSaving] = React.useState(false);
  const dirtyRef=React.useRef(false);
  const baseStampRef=React.useRef(foreshadow?.updatedAt);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(foreshadow?.id ?? null);
  const [minimized, setMinimized] = React.useState(false);
  const nextFloatKey = open ? (foreshadow?.id ?? "new") : "closed";
  const [floatKey, setFloatKey] = React.useState(nextFloatKey);
  if (floatKey !== nextFloatKey) {
    setFloatKey(nextFloatKey);
    dirtyRef.current=false;
    if (open) setMinimized(false);
  }
  const initKey = `${open ? 1 : 0}:${foreshadow?.id ?? "new"}:${detailApi.data?.updatedAt ?? foreshadow?.updatedAt ?? ""}`;
  const lastInitKey = React.useRef("");

  useErrorToast(detailApi.error, "伏笔详情加载失败");

  const source = foreshadow ? detailApi.data && detailApi.data.id === foreshadow.id ? detailApi.data : foreshadow : null;

  React.useEffect(() => {
    if (lastInitKey.current === initKey) return;
    lastInitKey.current = initKey;
    if (!open || dirtyRef.current) return;
    baseStampRef.current=source?.updatedAt;
    setSavedId(source?.id ?? null);
    setDraft(source ? toDraft(source) : emptyDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey, open]);

  const update = <K extends keyof ForeshadowDraft>(key: K, value: ForeshadowDraft[K]) => {
    dirtyRef.current=true;
    setDraft((prev)=>({...prev,[key]:value}));
  };

  const chapterOptions = [
    { value: "", label: "未关联" },
    ...chapters.map((chapter) => ({
      value: chapter.id,
      label: `第 ${chapter.orderIndex + 1} 章 · ${stripChapterNumber(chapter.title)}`,
    })),
  ];

  const chapterTitle = (id: string | null) => {
    const chapter = chapters.find((item) => item.id === id);
    return chapter ? `第 ${chapter.orderIndex + 1} 章 · ${stripChapterNumber(chapter.title)}` : null;
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      toast({ title: "请先填写伏笔标题", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, title };
      const saved = savedId
        ? await apiPatch<Foreshadow>(`/api/foreshadows/${savedId}`, {...payload,expectedUpdatedAt:baseStampRef.current})
        : await apiPost<Foreshadow>(`/api/foreshadows`, { novelId, ...payload });
      const entity = unwrapEntity(saved);
      setSavedId(entity.id);
      onSaved(entity);
      notifyDataChanged("foreshadows");
      toast({ title: editing ? "伏笔已保存" : "已新建伏笔", description: title, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "保存伏笔失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!foreshadow) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/foreshadows/${foreshadow.id}`);
      setConfirmDeleteOpen(false);
      onDeleted();
      notifyDataChanged("foreshadows");
      toast({ title: "伏笔已删除", description: foreshadow.title, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "删除伏笔失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const openAssistant = () => {
    referenceCardInAssistant("foreshadow",savedId,draft.title.trim()||"新伏笔",{...draft});
    if(presentation==="float")setMinimized(true);
  };

  const plantedTitle = chapterTitle(draft.plantedChapterId);
  const payoffTitle = chapterTitle(draft.payoffChapterId);
  const subtitle = [FORESHADOW_STATUS_LABEL[draft.status], plantedTitle ? `埋于${plantedTitle}` : "未关联埋设章"]
    .filter(Boolean)
    .join(" · ");

  const footer = (
    <div className="card-editor-actions flex items-center gap-2 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
      {editing ? (
        <Button variant="ghost" className="text-ink-4 hover:text-danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDeleteOpen(true)}>
          删除
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" className="min-w-20 bg-accent text-accent-ink hover:bg-accent-hover" size="sm" loading={saving} onClick={save}>
          {savedId ? "保存" : "创建伏笔"}
        </Button>
      </div>
    </div>
  );

  const body = (
    <>
      <CardEditorDocument key={`${open}:${savedId??"new"}`}>
        <CardEditorHero kind="伏笔" value={draft.title} onChange={value=>update("title",value)} subtitle={subtitle} actions={<Button variant="ghost" size="sm" className="font-semibold text-[#315b80] hover:bg-[#315b80]/[0.07] hover:text-[#20496e] dark:text-[#9dc4e7] dark:hover:bg-[#9dc4e7]/10 dark:hover:text-[#c1dbee]" icon={<Sparkles className="size-3.5"/>} onClick={openAssistant}>AI 助手</Button>}/>
        <ModelKeyHint />

        <EditorSection title="基本信息" hint="一句话让读者记住它，状态决定统计里算不算「未收」。">
          <div className="grid gap-3">
            <Select
              label="状态"
              value={draft.status}
              onChange={(event) => update("status", event.target.value as ForeshadowStatus)}
              options={Object.entries(FORESHADOW_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </EditorSection>

        <EditorSection title="说明" hint="埋了什么、读者该记住什么、将来怎么回收。">
          <Textarea
            label=""
            rows={4}
            value={draft.description}
            placeholder="埋了什么、读者该记住什么、将来怎么回收。"
            onChange={(event) => update("description", event.target.value)}
            hint="写清「埋什么、怎么收」，AI 续写时才不会提前泄底。"
          />
        </EditorSection>

        <EditorSection title="章节" hint="标出埋设与回收的章节，故事档案与大纲会按这里对齐。">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="埋设章节"
              value={draft.plantedChapterId ?? ""}
              onChange={(event) => update("plantedChapterId", event.target.value || null)}
              options={chapterOptions}
            />
            <Select
              label="回收章节"
              value={draft.payoffChapterId ?? ""}
              onChange={(event) => update("payoffChapterId", event.target.value || null)}
              options={chapterOptions}
              hint={payoffTitle ? `计划回收：${payoffTitle}` : "还没想好可以留空。"}
            />
          </div>
        </EditorSection>

        <EditorSection title="备注" hint="补充线索、回收计划和写作提醒，可供助手参考。">
          <Textarea
            label=""
            rows={3}
            value={draft.notes}
            placeholder="写作提醒、注意事项（可选）。"
            onChange={(event) => update("notes", event.target.value)}
          />
        </EditorSection>

        {detailApi.loading ? <p className="text-[11px] text-ink-3">正在获取伏笔最新详情…</p> : null}
      </CardEditorDocument>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除这条伏笔？"
        description={`「${foreshadow?.title ?? ""}」的登记会被删除。此操作不可撤销。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </>
  );

  if (presentation === "float") {
    return (
      <FloatWindow
        open={open}
        title={editing ? "编辑伏笔" : "新伏笔"}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={onClose}
        className={confirmDeleteOpen ? "card-editor-window z-40" : "card-editor-window"}
        footer={footer}
      >
        {body}
      </FloatWindow>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "编辑伏笔" : "新建伏笔"} width={640} footer={footer}>
      {body}
    </Sheet>
  );
}
