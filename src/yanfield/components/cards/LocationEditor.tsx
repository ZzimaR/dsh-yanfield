"use client";

/**
 * 地点卡。
 * 编辑：GET/PATCH /api/locations/[id]；新建：POST /api/locations；删除：DELETE /api/locations/[id]
 * 写的是「人站在这里时怎样」，规则、势力、历史仍放世界观。
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
import type { Location, LocationKind, WorldImportance } from "@/lib/types";
import { LOCATION_KIND_LABEL, WORLD_IMPORTANCE_LABEL } from "@/lib/types";
import { useT } from "@/lib/i18n";

interface LocationDraft {
  name: string;
  aliases: string[];
  kind: LocationKind;
  importance: WorldImportance;
  parentId: string | null;
  summary: string;
  sensory: string;
  layout: string;
  occupants: string;
  rules: string;
  storyRole: string;
  currentState: string;
  tags: string[];
  aiVisible: boolean;
  revealAtChapter: number | null;
  pinned: boolean;
}

function emptyDraft(): LocationDraft {
  return {
    name: "",
    aliases: [],
    kind: "other",
    importance: "medium",
    parentId: null,
    summary: "",
    sensory: "",
    layout: "",
    occupants: "",
    rules: "",
    storyRole: "",
    currentState: "",
    tags: [],
    aiVisible: true,
    revealAtChapter: null,
    pinned: false,
  };
}

function toDraft(place: Location): LocationDraft {
  return {
    name: place.name,
    aliases: [...place.aliases],
    kind: place.kind,
    importance: place.importance ?? "medium",
    parentId: place.parentId,
    summary: place.summary,
    sensory: place.sensory,
    layout: place.layout,
    occupants: place.occupants,
    rules: place.rules,
    storyRole: place.storyRole,
    currentState: place.currentState,
    tags: [...place.tags],
    aiVisible: place.aiVisible,
    revealAtChapter: place.revealAtChapter,
    pinned: place.pinned,
  };
}

export function LocationEditor({
  open,
  novelId,
  place,
  places,
  chapters,
  onClose,
  onSaved,
  onDeleted,
  presentation = "sheet",
}: {
  open: boolean;
  novelId: string;
  place: Location | null;
  places: Location[];
  chapters: { id: string; orderIndex: number; title: string }[];
  onClose: () => void;
  onSaved: (saved: Location) => void;
  onDeleted: () => void;
  presentation?: "sheet" | "float";
}) {
  const tr = useT();
  const { toast } = useToast();
  const editing = Boolean(place);
  const detailApi = useApi<Location>(open && place ? `/api/locations/${place.id}` : null);
  const [draft, setDraft] = React.useState<LocationDraft>(() => (place ? toDraft(place) : emptyDraft()));
  const [saving, setSaving] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const baseStampRef = React.useRef(place?.updatedAt);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(place?.id ?? null);
  const nextDraftKey = open ? (place?.id ?? "new") : "closed";
  const [draftKey, setDraftKey] = React.useState(nextDraftKey);
  if (draftKey !== nextDraftKey) {
    setDraftKey(nextDraftKey);
    dirtyRef.current = false;
    baseStampRef.current = place?.updatedAt;
    if (open) {
      setSavedId(place?.id ?? null);
      setDraft(place ? toDraft(place) : emptyDraft());
      setMinimized(false);
    }
  }
  const detailStamp = detailApi.data && place && detailApi.data.id === place.id ? detailApi.data.updatedAt : "";

  useErrorToast(detailApi.error, "地点详情加载失败");

  React.useEffect(() => {
    if (!open || !detailStamp || !place || !detailApi.data || detailApi.data.id !== place.id) return;
    if (dirtyRef.current) return;
    baseStampRef.current = detailApi.data.updatedAt;
    setSavedId(place.id);
    setDraft(toDraft(detailApi.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailStamp]);

  const update = <K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) => {
    dirtyRef.current = true;
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: tr("请先填写地点名称"), tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, name };
      const saved = savedId
        ? await apiPatch<Location>(`/api/locations/${savedId}`, { ...payload, expectedUpdatedAt: baseStampRef.current })
        : await apiPost<Location>("/api/locations", { novelId, ...payload });
      const entity = unwrapEntity(saved);
      setSavedId(entity.id);
      onSaved(entity);
      notifyDataChanged("location");
      toast({ title: editing ? tr("地点已保存") : tr("已新建地点"), description: name, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: tr("保存地点失败"), description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!place) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/locations/${place.id}`);
      setConfirmDeleteOpen(false);
      onDeleted();
      notifyDataChanged("location");
      toast({ title: tr("地点已删除"), description: place.name, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: tr("删除地点失败"), description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  // 上级下拉按层级缩进，并挡掉自己和自己的后代，避免在界面上就能选出环。
  const placeTree = React.useMemo(() => {
    const byParent = new Map<string | null, Location[]>();
    for (const item of places) {
      const key = item.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push(item);
      byParent.set(key, list);
    }
    const rows: { item: Location; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      for (const item of byParent.get(parentId) ?? []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        rows.push({ item, depth });
        walk(item.id, depth + 1);
      }
    };
    walk(null, 0);
    for (const item of places) if (!seen.has(item.id)) rows.push({ item, depth: 0 });
    return rows;
  }, [places]);

  const blockedParents = React.useMemo(() => {
    const blocked = new Set<string>();
    if (!place?.id) return blocked;
    blocked.add(place.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of places) {
        if (blocked.has(item.id) || !item.parentId || !blocked.has(item.parentId)) continue;
        blocked.add(item.id);
        grew = true;
      }
    }
    return blocked;
  }, [places, place?.id]);

  const parentOptions = [
    { value: "", label: tr("无（顶层地点）") },
    ...placeTree
      .filter(({ item }) => !blockedParents.has(item.id))
      .map(({ item, depth }) => ({ value: item.id, label: `${"— ".repeat(depth)}${item.name || tr("未命名地点")}` })),
  ];
  const parentName = places.find((item) => item.id === draft.parentId)?.name;

  const chapterOptions = [
    { value: "", label: tr("不标注（AI 始终可见）") },
    ...chapters.map((chapter) => ({
      value: String(chapter.orderIndex + 1),
      label: tr("第 {order} 章 · {title}", { order: chapter.orderIndex + 1, title: stripChapterNumber(chapter.title, tr) }),
    })),
  ];

  const subtitle = [tr(LOCATION_KIND_LABEL[draft.kind]), parentName ? tr("属于「{title}」", { title: parentName }) : tr("顶层地点")]
    .filter(Boolean)
    .join(" · ");

  const openAssistant = () => {
    referenceCardInAssistant("location", savedId, draft.name.trim() || tr("新地点"), { ...draft });
    if (presentation === "float") setMinimized(true);
  };

  const footer = (
    <div className="card-editor-actions flex items-center gap-2 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
      {editing ? (
        <Button variant="ghost" className="text-ink-4 hover:text-danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDeleteOpen(true)}>
          {tr("删除")}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>{tr("取消")}</Button>
        <Button variant="primary" className="min-w-20 bg-accent text-accent-ink hover:bg-accent-hover" size="sm" loading={saving} onClick={save}>
          {editing ? tr("保存") : tr("创建地点")}
        </Button>
      </div>
    </div>
  );

  const body = (
    <>
      <CardEditorDocument key={`${open}:${savedId ?? "new"}`}>
        <CardEditorHero kind="地点" value={draft.name} onChange={(value) => update("name", value)} subtitle={subtitle} actions={<Button variant="ghost" size="sm" className="font-semibold text-[#315b80] hover:bg-[#315b80]/[0.07] hover:text-[#20496e] dark:text-[#9dc4e7] dark:hover:bg-[#9dc4e7]/10 dark:hover:text-[#c1dbee]" icon={<Sparkles className="size-3.5" />} onClick={openAssistant}>{tr("AI 助手")}</Button>} />
        <ModelKeyHint />

        <EditorSection title="这是哪里" hint={tr("先定层级和归属。大洲、国家、城市、屋子、路都可以。重要的地点会优先进入 AI 上下文。")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label={tr("地点层级")} value={draft.kind} onChange={(event) => update("kind", event.target.value as LocationKind)} options={Object.entries(LOCATION_KIND_LABEL).map(([value, label]) => ({ value, label: tr(label) }))} />
            <Select label={tr("重要程度")} value={draft.importance} onChange={(event) => update("importance", event.target.value as WorldImportance)} options={Object.entries(WORLD_IMPORTANCE_LABEL).map(([value, label]) => ({ value, label: tr(label) }))} />
            <Select label={tr("上级地点")} value={draft.parentId ?? ""} onChange={(event) => update("parentId", event.target.value || null)} options={parentOptions} />
          </div>
        </EditorSection>

        <EditorSection title="别称" hint={tr("旧名、俗称、角色嘴里的叫法。搜索和 AI 对上这些名字时会认成同一个地方。")}>
          <TagsInput label="别称" value={draft.aliases} onChange={(aliases) => update("aliases", aliases)} placeholder={tr("如：旧码头、南栈")} />
        </EditorSection>

        <EditorSection title="一眼印象" hint={tr("一两句，让人进门就看见。AI 压缩上下文时优先留这一句。这是地方本身，不是眼下被毁没被毁。")}>
          <AiTextField ai={false} label="印象" field="地点印象" feature="world-card" novelId={novelId} value={draft.summary} onChange={(value) => update("summary", value)} rows={2} placeholder={tr("潮退之后露出的一排石阶，第三级总是湿的。")} />
        </EditorSection>

        <EditorSection title="人在这里" hint={tr("光、声音、气味、冷热、脚下。写到这个地方时靠这些，不靠形容词堆砌。")}>
          <AiTextField ai={false} label="感官" field="地点感官" feature="world-card" novelId={novelId} value={draft.sensory} onChange={(value) => update("sensory", value)} rows={3} placeholder={tr("咸风、木板响、灯是黄的、手心潮。")} />
        </EditorSection>

        <EditorSection title="怎么走" hint={tr("入口、分区、哪条路通到哪、哪里能躲。")}>
          <AiTextField ai={false} label="空间" field="地点空间" feature="world-card" novelId={novelId} value={draft.layout} onChange={(value) => update("layout", value)} rows={3} placeholder={tr("正门对街，后院有一口井，井边的门夜里锁着。")} />
        </EditorSection>

        <EditorSection title="谁在这里" hint={tr("平时谁在、谁说了算。没有角色卡也可以先写名字。")}>
          <AiTextField ai={false} label="常驻" field="地点常驻" feature="world-card" novelId={novelId} value={draft.occupants} onChange={(value) => update("occupants", value)} rows={2} placeholder={tr("账房周晚常年守在石阶上。孙掌柜只在午后来。")} />
        </EditorSection>

        <EditorSection title="规矩与危险" hint={tr("进得去吗，什么不能做，哪里会出事。")}>
          <AiTextField ai={false} label="此地规矩" field="地点规矩" feature="world-card" novelId={novelId} value={draft.rules} onChange={(value) => update("rules", value)} rows={3} placeholder={tr("未登记的信不能带过跳板。夜里不点第二盏灯。")} />
        </EditorSection>

        <EditorSection title="在故事里" hint={tr("这个地方通常用来发生什么：交易、分手、逃亡、揭开秘密。")}>
          <AiTextField ai={false} label="叙事作用" field="地点叙事" feature="world-card" novelId={novelId} value={draft.storyRole} onChange={(value) => update("storyRole", value)} rows={2} placeholder={tr("信在这里交接。异常的那封也是在这里被看见的。")} />
        </EditorSection>

        <EditorSection title="此刻" hint={tr("现在的样子：完好、被毁、被占、封了、换了季。和一眼印象分开记。")}>
          <AiTextField ai={false} label="当前状态" field="地点现状" feature="world-card" novelId={novelId} value={draft.currentState} onChange={(value) => update("currentState", value)} rows={2} placeholder={tr("跳板还在。第三级石阶上多了一只纸船。")} />
        </EditorSection>

        <EditorSection title="标签" hint={tr("用于筛选与速查，不进入正文。")}>
          <TagsInput label="标签" value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder={tr("如：渡口、夜间、禁地")} />
        </EditorSection>

        <EditorSection title="AI 可见性与揭示章节" hint={tr("AI 默认只收到当前章节已揭示的可见资料；作者本轮明确 @ 引用时可例外提供。")}>
          <Switch checked={draft.aiVisible} onChange={(checked) => update("aiVisible", checked)} label={tr("对 AI 可见")} hint={tr("关闭后，任何 AI 上下文都不会包含这条地点。")} />
          <Select
            label={tr("揭示章节")}
            value={draft.revealAtChapter === null ? "" : String(draft.revealAtChapter)}
            onChange={(event) => update("revealAtChapter", event.target.value === "" ? null : Number(event.target.value))}
            options={chapterOptions}
            hint={tr("留空 = 不按章节隐藏；填章节号后，当前章节到达该章前 AI 不会收到这条地点。无当前章节时默认隐藏，除非作者明确 @ 引用。")}
          />
          <Switch checked={draft.pinned} onChange={(checked) => update("pinned", checked)} label={tr("置顶")} hint={tr("置顶地点排在设定列表最前。")} />
        </EditorSection>

        {detailApi.loading ? <p className="text-[11px] text-ink-3">{tr("正在获取地点最新详情…")}</p> : null}
      </CardEditorDocument>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={tr("删除这条地点？")}
        description={tr("「{title}」会被删除。挂在它下面的地点会变成顶层，不会一起删掉。", { title: place?.name ?? "" })}
        confirmText={tr("删除")}
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
        title={editing ? tr("编辑地点") : tr("新地点")}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={onClose}
        className="card-editor-window"
        footer={footer}
      >
        {body}
      </FloatWindow>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? tr("编辑地点") : tr("新建地点")} width={700} footer={footer}>
      {body}
    </Sheet>
  );
}
