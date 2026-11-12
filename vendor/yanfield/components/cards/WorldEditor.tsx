"use client";

/**
 * 世界观设定编辑 Sheet
 * 编辑：GET/PATCH /api/world/[id]；新建：POST /api/world；删除：DELETE /api/world/[id]
 * AI 助手：引用当前资料进入写作台 Agent，弹窗不直接生成或保存。
 */
import * as React from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Select, Sheet, Switch, useToast } from "@/components/ui/kit";
import { CardEditorDocument, CardEditorHero, CardEditorSection as EditorSection } from "./CardEditorDocument";
import { FloatWindow } from "@/components/editor/FloatWindow";
import { referenceCardInAssistant } from "@/lib/editor/hand-off";
import { AiTextField, TagsInput, stripChapterNumber, unwrapEntity, useErrorToast } from "@/components/outline/form-kit";
import { ModelKeyHint } from "@/components/ai/ModelKeyHint";
import { apiDelete, apiPatch, apiPost, notifyDataChanged, useApi } from "@/lib/client/api";
import type { WorldCategory, WorldImportance, WorldSetting } from "@/lib/types";
import { WORLD_CATEGORY_LABEL, WORLD_IMPORTANCE_LABEL } from "@/lib/types";

interface WorldDraft {
  title: string;
  category: WorldCategory;
  importance: WorldImportance;
  parentId: string | null;
  summary: string;
  content: string;
  tags: string[];
  aiVisible: boolean;
  revealAtChapter: number | null;
  pinned: boolean;
}

function emptyDraft(parentId: string | null, category: WorldCategory = "rule"): WorldDraft {
  return {
    title: "",
    category,
    importance: "medium",
    parentId,
    summary: "",
    content: "",
    tags: [],
    aiVisible: true,
    revealAtChapter: null,
    pinned: false,
  };
}

function toDraft(setting: WorldSetting): WorldDraft {
  return {
    title: setting.title,
    category: setting.category,
    importance: setting.importance ?? "medium",
    parentId: setting.parentId,
    summary: setting.summary,
    content: setting.content,
    tags: [...setting.tags],
    aiVisible: setting.aiVisible,
    revealAtChapter: setting.revealAtChapter,
    pinned: setting.pinned,
  };
}

export function WorldEditor({
  open,
  novelId,
  setting,
  settings,
  chapters,
  onClose,
  onSaved,
  onDeleted,
  presentation = "sheet",
  defaultCategory = "rule",
}: {
  open: boolean;
  novelId: string;
  setting: WorldSetting | null;
  settings: WorldSetting[];
  chapters: { id: string; orderIndex: number; title: string }[];
  onClose: () => void;
  onSaved: (saved: WorldSetting) => void;
  onDeleted: () => void;
  /** 写作台里用可拖动的窗口，不盖成整页。 */
  presentation?: "sheet" | "float";
  /** Category preset for new settings, e.g. creating from the item group. */
  defaultCategory?: WorldCategory;
}) {
  const { toast } = useToast();
  const editing = Boolean(setting);
  const detailApi = useApi<WorldSetting>(open && setting ? `/api/world/${setting.id}` : null);
  const [draft, setDraft] = React.useState<WorldDraft>(() => (setting ? toDraft(setting) : emptyDraft(null, defaultCategory)));
  const [saving, setSaving] = React.useState(false);
  const dirtyRef=React.useRef(false);
  const baseStampRef=React.useRef(setting?.updatedAt);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(setting?.id ?? null);
  const nextDraftKey = open ? (setting?.id ?? "new") : "closed";
  const [draftKey, setDraftKey] = React.useState(nextDraftKey);
  if (draftKey !== nextDraftKey) {
    setDraftKey(nextDraftKey);
    dirtyRef.current=false;baseStampRef.current=setting?.updatedAt;
    if (open) {
      setSavedId(setting?.id ?? null);
      setDraft(setting ? toDraft(setting) : emptyDraft(null, defaultCategory));
      setMinimized(false);
    }
  }
  const detailStamp = detailApi.data && setting && detailApi.data.id === setting.id ? detailApi.data.updatedAt : "";

  useErrorToast(detailApi.error, "设定详情加载失败");

  React.useEffect(() => {
    if (!open || !detailStamp || !setting || !detailApi.data || detailApi.data.id !== setting.id) return;
    if(dirtyRef.current)return;
    baseStampRef.current=detailApi.data.updatedAt;
    setSavedId(setting.id);
    setDraft(toDraft(detailApi.data));
    // 详情回来后用服务端版本覆盖，避免列表里的摘要比正文旧
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailStamp]);

  const update = <K extends keyof WorldDraft>(key: K, value: WorldDraft[K]) => {
    dirtyRef.current=true;
    setDraft((prev)=>({...prev,[key]:value}));
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      toast({ title: "请先填写设定标题", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, title };
      const saved = savedId
        ? await apiPatch<WorldSetting>(`/api/world/${savedId}`, {...payload,expectedUpdatedAt:baseStampRef.current})
        : await apiPost<WorldSetting>(`/api/world`, { novelId, ...payload });
      const entity = unwrapEntity(saved);
      setSavedId(entity.id);
      onSaved(entity);
      notifyDataChanged("world");
      toast({ title: editing ? "设定已保存" : "已新建设定", description: title, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "保存设定失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!setting) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/world/${setting.id}`);
      setConfirmDeleteOpen(false);
      onDeleted();
      notifyDataChanged("world");
      toast({ title: "设定已删除", description: setting.title, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "删除设定失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const parentOptions = [
    { value: "", label: "无（顶层设定）" },
    ...settings
      .filter((item) => item.id !== setting?.id)
      .map((item) => ({ value: item.id, label: item.title || "未命名设定" })),
  ];
  const parentTitle = settings.find((item) => item.id === draft.parentId)?.title;

  const chapterOptions = [
    { value: "", label: "不标注（AI 始终可见）" },
    ...chapters.map((chapter) => ({
      value: String(chapter.orderIndex + 1),
      label: `第 ${chapter.orderIndex + 1} 章 · ${stripChapterNumber(chapter.title)}`,
    })),
  ];

  const subtitle = [WORLD_CATEGORY_LABEL[draft.category], parentTitle ? `属于「${parentTitle}」` : "顶层设定"]
    .filter(Boolean)
    .join(" · ");

  const openAssistant = () => {
    referenceCardInAssistant("world",savedId,draft.title.trim()||"新设定",{...draft});
    if(presentation==="float")setMinimized(true);
  };

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
              {editing ? "保存" : "创建设定"}
            </Button>
          </div>
        </div>
  );

  const body = (
    <>
      <CardEditorDocument key={`${open}:${savedId??"new"}`}>
        <CardEditorHero kind="设定" value={draft.title} onChange={value=>update("title",value)} subtitle={subtitle} actions={<Button variant="ghost" size="sm" className="font-semibold text-[#315b80] hover:bg-[#315b80]/[0.07] hover:text-[#20496e] dark:text-[#9dc4e7] dark:hover:bg-[#9dc4e7]/10 dark:hover:text-[#c1dbee]" icon={<Sparkles className="size-3.5"/>} onClick={openAssistant}>AI 助手</Button>}/>
        <ModelKeyHint />

        <EditorSection title="基本信息" hint="先给这条设定一个能搜到的名字与归属，AI 会按分类理解它的约束力；重要程度高的设定会优先进入 AI 上下文。">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="分类" value={draft.category} onChange={event=>update("category",event.target.value as WorldCategory)} options={Object.entries(WORLD_CATEGORY_LABEL).map(([value,label])=>({value,label}))}/>
            <Select label="重要程度" value={draft.importance} onChange={event=>update("importance",event.target.value as WorldImportance)} options={Object.entries(WORLD_IMPORTANCE_LABEL).map(([value,label])=>({value,label}))}/>
            <Select label="归属" value={draft.parentId??""} onChange={event=>update("parentId",event.target.value||null)} options={parentOptions}/>
          </div>
        </EditorSection>

        <EditorSection title="摘要" hint="一两句话说清核心，AI 在压缩上下文时会优先保留这一段。">
          <AiTextField
            ai={false}
            label="摘要"
            field="设定摘要"
            feature="world-card"
            novelId={novelId}
            value={draft.summary}
            onChange={(value) => update("summary", value)}
            rows={2}
            placeholder="一两句话说清这条设定的核心。"
          />
        </EditorSection>

        <EditorSection title="正文" hint="规则、限制、代价、已发生的事件——越具体，AI 写得越稳。">
          <AiTextField
            ai={false}
            label="正文"
            field="设定正文"
            feature="world-card"
            novelId={novelId}
            value={draft.content}
            onChange={(value) => update("content", value)}
            rows={8}
            placeholder="规则、限制、代价、已发生的事件…越具体，AI 写得越稳。"
          />
        </EditorSection>

        <EditorSection title="标签" hint="用于筛选与速查，不进入正文。">
          <TagsInput label="标签" value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder="如：规则、势力、代价" />
        </EditorSection>

        <EditorSection title="AI 可见性与揭示章节" hint="AI 默认只收到当前章节已揭示的可见资料；作者本轮明确 @ 引用时可例外提供。">
          <Switch
            checked={draft.aiVisible}
            onChange={(checked) => update("aiVisible", checked)}
            label="对 AI 可见"
            hint="关闭后，任何 AI 上下文都不会包含这条设定。"
          />
          <Select
            label="揭示章节"
            value={draft.revealAtChapter === null ? "" : String(draft.revealAtChapter)}
            onChange={(event) => update("revealAtChapter", event.target.value === "" ? null : Number(event.target.value))}
            options={chapterOptions}
            hint="留空 = 不按章节隐藏；填章节号后，当前章节到达该章前 AI 不会收到这条设定。无当前章节时默认隐藏，除非作者明确 @ 引用。"
          />
          <Switch checked={draft.pinned} onChange={(checked) => update("pinned", checked)} label="置顶" hint="置顶设定排在列表最前。" />
        </EditorSection>

        {detailApi.loading ? <p className="text-[11px] text-ink-3">正在获取设定最新详情…</p> : null}
      </CardEditorDocument>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除这条设定？"
        description={`「${setting?.title ?? ""}」会被删除，其子设定不会自动迁移。此操作不可撤销。`}
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
        title={editing ? "编辑设定" : "新设定"}
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
    <Sheet open={open} onClose={onClose} title={editing ? "编辑设定" : "新建设定"} width={700} footer={footer}>
      {body}
    </Sheet>
  );
}
