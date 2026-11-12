"use client";

/**
 * 章纲编辑器
 * GET / PATCH /api/chapters/[id]/blueprint
 *
 * 场景列表（ScenePlan）在本地编辑，保存时整体 PATCH；有改动时显示「未保存」并拦截切换。
 */
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  IconButton,
  Input,
  Textarea,
  useToast,
} from "@/components/ui/kit";
import { apiPatch, notifyDataChanged, useApi } from "@/lib/client/api";
import type { Chapter, ChapterBlueprint, Foreshadow, ScenePlan } from "@/lib/types";
import { formatWords, uid } from "@/lib/ui/cn";
import { AiAssistSheet } from "./ai-assist";
import {
  AiTextField,
  InlineError,
  PanelSkeleton,
  SaveBar,
  StringListEditor,
  parseTags,
  splitAiLines,
  stripChapterNumber,
} from "./form-kit";

interface BlueprintDraft {
  goal: string;
  pov: string;
  conflict: string;
  emotionalArc: string;
  targetWords: number;
  plotPoints: string[];
  hooks: string[];
  notes: string;
  scenes: ScenePlan[];
}

const CHAPTER_STATUS: Record<Chapter["status"], { label: string; tone: "default" | "gold" | "jade" }> = {
  draft: { label: "草稿", tone: "default" },
  revising: { label: "修改中", tone: "gold" },
  done: { label: "已完成", tone: "jade" },
};

const AI_TARGETS = [
  { value: "goal", label: "本章目标" },
  { value: "conflict", label: "核心冲突" },
  { value: "emotionalArc", label: "情绪曲线" },
  { value: "plotPoints", label: "情节要点" },
  { value: "hooks", label: "结尾钩子" },
];

function toDraft(blueprint: ChapterBlueprint): BlueprintDraft {
  return {
    goal: blueprint.goal,
    pov: blueprint.pov,
    conflict: blueprint.conflict,
    emotionalArc: blueprint.emotionalArc,
    targetWords: blueprint.targetWords,
    plotPoints: [...blueprint.plotPoints],
    hooks: [...blueprint.hooks],
    notes: blueprint.notes,
    scenes: blueprint.scenes.map((scene) => ({ ...scene, characters: [...scene.characters] })),
  };
}

function emptyScene(): ScenePlan {
  return { id: uid("scene_"), title: "", summary: "", purpose: "", characters: [], location: "", emotion: "" };
}

export function BlueprintEditor({
  novelId,
  chapter,
  chapters,
  foreshadows,
  onSaved,
  onDirtyChange,
}: {
  novelId: string;
  chapter: Chapter;
  chapters: Chapter[];
  foreshadows: Foreshadow[];
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<ChapterBlueprint>(`/api/chapters/${chapter.id}/blueprint`);
  const [draft, setDraft] = React.useState<BlueprintDraft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const baseline = React.useMemo(() => (data ? toDraft(data) : null), [data]);

  React.useEffect(() => {
    if (!baseline) return;
    setDraft((prev) => (dirtyRef.current && prev ? prev : baseline));
  }, [baseline]);

  const dirty = React.useMemo(() => {
    if (!draft || !baseline) return false;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, baseline]);

  React.useEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const update = <K extends keyof BlueprintDraft>(key: K, value: BlueprintDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await apiPatch<ChapterBlueprint>(`/api/chapters/${chapter.id}/blueprint`, draft);
      setDraft(toDraft(saved));
      onSaved?.();
      notifyDataChanged("blueprint");
      toast({ title: "章纲已保存", description: stripChapterNumber(chapter.title), tone: "success" });
    } catch (err) {
      toast({ title: "保存章纲失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleAiAdopt = (text: string, target: string) => {
    if (target === "goal") update("goal", text);
    else if (target === "conflict") update("conflict", text);
    else if (target === "emotionalArc") update("emotionalArc", text);
    else if (target === "plotPoints") update("plotPoints", [...(draft?.plotPoints ?? []), ...splitAiLines(text)]);
    else if (target === "hooks") update("hooks", [...(draft?.hooks ?? []), ...splitAiLines(text)]);
  };

  const relatedForeshadows = foreshadows.filter(
    (item) => item.plantedChapterId === chapter.id || item.payoffChapterId === chapter.id,
  );
  const chapterTitle = (id: string | null) => chapters.find((item) => item.id === id)?.title ?? "未知章节";
  const status = CHAPTER_STATUS[chapter.status];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-ink-3">第 {chapter.orderIndex + 1} 章</span>
            <h3 className="truncate text-[14px] font-semibold text-ink">{stripChapterNumber(chapter.title)}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
            <span>正文 {formatWords(chapter.wordCount)}</span>
            <span aria-hidden>·</span>
            <span>目标 {formatWords(draft?.targetWords ?? 0)}</span>
            <a
              className="inline-flex items-center gap-0.5 text-accent hover:underline"
              href={`/editor/${novelId}?chapter=${chapter.id}`}
            >
              去写作
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px] text-accent hover:bg-accent-soft"
          icon={<Sparkles className="size-3.5" />}
          disabled={!draft}
          onClick={() => setAiOpen(true)}
        >
          AI 生成章纲
        </Button>
      </div>

      {error && !data ? <InlineError message={error} onRetry={() => void refresh()} /> : null}

      {!draft ? (
        loading ? (
          <PanelSkeleton rows={4} />
        ) : (
          <p className="text-[12.5px] text-ink-3">章纲加载中…</p>
        )
      ) : (
        <div className="space-y-4">
          <AiTextField
            label="本章目标"
            field="本章目标"
            feature="outline-chapter"
            novelId={novelId}
            chapterId={chapter.id}
            value={draft.goal}
            onChange={(value) => update("goal", value)}
            rows={2}
            placeholder="这一章结束时，读者必须知道 / 感觉到什么。"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">视角 POV</div>
              <Input value={draft.pov} onChange={(event) => update("pov", event.target.value)} placeholder="例如：周晚 / 第三人称限知" />
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">预估字数</div>
              <Input
                type="number"
                min={0}
                step={100}
                value={String(draft.targetWords)}
                onChange={(event) => update("targetWords", Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </div>

          <AiTextField
            label="核心冲突"
            field="核心冲突"
            feature="outline-chapter"
            novelId={novelId}
            chapterId={chapter.id}
            value={draft.conflict}
            onChange={(value) => update("conflict", value)}
            rows={2}
            placeholder="谁和谁 / 什么和什么冲突，代价是什么。"
          />

          <AiTextField
            label="情绪曲线"
            field="情绪曲线"
            feature="outline-chapter"
            novelId={novelId}
            chapterId={chapter.id}
            value={draft.emotionalArc}
            onChange={(value) => update("emotionalArc", value)}
            rows={2}
            placeholder="从…到…：紧张 → 松弛 → 更紧。"
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                <Clapperboard className="size-3.5 text-ink-3" />
                场景列表
              </span>
              <Button variant="subtle" size="sm" icon={<Plus className="size-3.5" />} onClick={() => update("scenes", [...draft.scenes, emptyScene()])}>
                添加场景
              </Button>
            </div>
            {draft.scenes.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
                还没有场景。建议把本章拆成 2–5 个场景：地点、人物、发生了什么、为什么留这一场。
              </p>
            ) : (
              <div className="space-y-2">
                {draft.scenes.map((scene, index) => (
                  <div key={scene.id} className="rounded-md border border-line bg-surface-2 p-2.5">
                    <div className="flex items-center gap-1">
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-3">场景 {index + 1}</span>
                      <Input
                        value={scene.title}
                        placeholder="场景标题：地点 + 事件"
                        className="h-8 flex-1 text-[13px]"
                        onChange={(event) => updateScene(draft, update, scene.id, { title: event.target.value })}
                      />
                      <IconButton
                        label="上移"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...draft.scenes];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          update("scenes", next);
                        }}
                      >
                        <ArrowUp className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label="下移"
                        size="sm"
                        disabled={index === draft.scenes.length - 1}
                        onClick={() => {
                          const next = [...draft.scenes];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          update("scenes", next);
                        }}
                      >
                        <ArrowDown className="size-3.5" />
                      </IconButton>
                      <IconButton label="删除场景" size="sm" onClick={() => update("scenes", draft.scenes.filter((item) => item.id !== scene.id))}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <Input
                        value={scene.location}
                        placeholder="地点"
                        className="h-8 text-[13px]"
                        onChange={(event) => updateScene(draft, update, scene.id, { location: event.target.value })}
                      />
                      <Input
                        value={scene.emotion}
                        placeholder="情绪"
                        className="h-8 text-[13px]"
                        onChange={(event) => updateScene(draft, update, scene.id, { emotion: event.target.value })}
                      />
                    </div>
                    <Input
                      value={scene.purpose}
                      placeholder="场景目的：为什么保留这一场"
                      className="mt-1.5 h-8 text-[13px]"
                      onChange={(event) => updateScene(draft, update, scene.id, { purpose: event.target.value })}
                    />
                    <Textarea
                      value={scene.summary}
                      placeholder="场景里发生了什么"
                      rows={2}
                      className="mt-1.5 min-h-0 text-[13px]"
                      onChange={(event) => updateScene(draft, update, scene.id, { summary: event.target.value })}
                    />
                    <Input
                      value={scene.characters.join("、")}
                      placeholder="出场角色（逗号分隔）"
                      className="mt-1.5 h-8 text-[13px]"
                      onChange={(event) => updateScene(draft, update, scene.id, { characters: parseTags(event.target.value) })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-2">情节要点</div>
            <StringListEditor
              items={draft.plotPoints}
              onChange={(items) => update("plotPoints", items)}
              placeholder="这一章推进了哪几件事"
              emptyHint="按顺序列出本章推进的情节。"
              ai={{ feature: "outline-chapter", novelId, chapterId: chapter.id, field: "本章情节要点" }}
            />
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-2">结尾钩子</div>
            <StringListEditor
              items={draft.hooks}
              onChange={(items) => update("hooks", items)}
              placeholder="读者为什么会翻下一章"
              emptyHint="至少准备一个结尾钩子。"
              ai={{ feature: "outline-chapter", novelId, chapterId: chapter.id, field: "本章结尾钩子" }}
            />
          </div>

          <AiTextField
            label="备注"
            field="本章备注"
            feature="outline-chapter"
            novelId={novelId}
            chapterId={chapter.id}
            value={draft.notes}
            onChange={(value) => update("notes", value)}
            rows={2}
            placeholder="给写作时的自己留提示（可不填）"
          />

          <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink-2">本章伏笔</span>
              <a
                className="inline-flex items-center gap-0.5 text-[11.5px] text-accent hover:underline"
                href={`/editor/${novelId}?tab=codex`}
              >
                在写作台「设定」里管理
                <ExternalLink className="size-3" />
              </a>
            </div>
            {relatedForeshadows.length === 0 ? (
              <p className="text-[12px] text-ink-3">本章没有关联伏笔。</p>
            ) : (
              <ul className="space-y-1">
                {relatedForeshadows.map((item) => (
                  <li key={item.id} className="flex items-center gap-1.5 text-[12.5px]">
                    {item.plantedChapterId === chapter.id ? <Badge tone="gold">埋</Badge> : <Badge tone="jade">收</Badge>}
                    <span className="min-w-0 flex-1 truncate text-ink-2">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      {item.plantedChapterId === chapter.id
                        ? `回收于 ${chapterTitle(item.payoffChapterId)}`
                        : `埋设于 ${chapterTitle(item.plantedChapterId)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-2.5">
        <SaveBar dirty={dirty} saving={saving} onSave={save} hint="章纲保存后会进入写作上下文" />
      </div>

      <AiAssistSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI 生成 · 章纲"
        feature="outline-chapter"
        novelId={novelId}
        chapterId={chapter.id}
        instruction="请根据本书总纲、卷纲与本章已有正文，为下面选中的章纲字段写一段可直接使用的成稿；具体到事件、人物与场景，避免空话。"
        targets={AI_TARGETS}
        onAdopt={handleAiAdopt}
      />
    </div>
  );
}

function updateScene(
  draft: BlueprintDraft,
  update: <K extends keyof BlueprintDraft>(key: K, value: BlueprintDraft[K]) => void,
  sceneId: string,
  patch: Partial<ScenePlan>,
): void {
  update(
    "scenes",
    draft.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
  );
}
