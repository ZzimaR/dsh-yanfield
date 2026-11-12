"use client";

/**
 * 总纲（小说级）
 * GET / PATCH /api/outlines/novel/[novelId]
 */
import * as React from "react";
import { ArrowDown, ArrowUp, BookOpen, GitBranch, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, IconButton, Input, useToast } from "@/components/ui/kit";
import { apiPatch, notifyDataChanged } from "@/lib/client/api";
import type { NovelOutline } from "@/lib/types";
import { AiAssistSheet } from "./ai-assist";
import {
  AiTextField,
  InlineError,
  PanelCard,
  PanelSkeleton,
  SaveBar,
  StringListEditor,
} from "./form-kit";

interface OutlineDraft {
  premise: string;
  theme: string;
  tone: string;
  mainPlot: string;
  ending: string;
  hooks: string[];
  subplots: string[];
  worldRules: string[];
  characterArcs: { character: string; arc: string }[];
}

type OutlineTextKey = "premise" | "theme" | "tone" | "mainPlot" | "ending";

const TEXT_KEYS: OutlineTextKey[] = ["premise", "theme", "tone", "mainPlot", "ending"];

function toDraft(outline: NovelOutline): OutlineDraft {
  return {
    premise: outline.premise,
    theme: outline.theme,
    tone: outline.tone,
    mainPlot: outline.mainPlot,
    ending: outline.ending,
    hooks: [...outline.hooks],
    subplots: [...outline.subplots],
    worldRules: [...outline.worldRules],
    characterArcs: outline.characterArcs.map((item) => ({ character: item.character, arc: item.arc })),
  };
}

const AI_TARGETS = [
  { value: "premise", label: "一句话故事" },
  { value: "theme", label: "主题" },
  { value: "tone", label: "基调" },
  { value: "mainPlot", label: "主线" },
  { value: "ending", label: "结局方向" },
];

export function NovelOutlinePanel({
  novelId,
  outline,
  loading,
  error,
  onSaved,
  onRetry,
  onDirtyChange,
}: {
  novelId: string;
  outline: NovelOutline | undefined;
  loading: boolean;
  error: string | null;
  onSaved: (outline: NovelOutline) => void;
  onRetry?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<OutlineDraft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const baseline = React.useMemo(() => (outline ? toDraft(outline) : null), [outline]);

  React.useEffect(() => {
    if (!baseline) return;
    setDraft((prev) => (dirtyRef.current && prev ? prev : baseline));
  }, [baseline]);

  const dirty = React.useMemo(() => {
    if (!draft || !baseline) return false;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, baseline]);

  // 把未保存状态暴露给外层（例如写作台的浮窗关闭确认）。
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const update = <K extends keyof OutlineDraft>(key: K, value: OutlineDraft[K]) => {
    dirtyRef.current = true;
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await apiPatch<NovelOutline>(`/api/outlines/novel/${novelId}`, draft);
      dirtyRef.current = false;
      setDraft(toDraft(saved));
      onSaved(saved);
      notifyDataChanged("outline");
      toast({ title: "总纲已保存", tone: "success" });
    } catch (err) {
      toast({ title: "保存总纲失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleAiAdopt = (text: string, target: string) => {
    if (TEXT_KEYS.includes(target as OutlineTextKey)) update(target as OutlineTextKey, text);
  };

  return (
    <PanelCard
      title="总纲"
      icon={<BookOpen className="size-4" />}
      description="小说级：一句话、主线、主题与结局方向"
      actions={
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
      }
      footer={draft ? <SaveBar dirty={dirty} saving={saving} onSave={save} hint="AI 写作会读取总纲" /> : null}
    >
      {error && !outline ? <InlineError message={error} onRetry={onRetry} /> : null}

      {!draft ? (
        loading ? (
          <PanelSkeleton rows={4} />
        ) : (
          <p className="text-[12.5px] leading-relaxed text-ink-3">总纲还没有加载出来，刷新页面或稍后重试。</p>
        )
      ) : (
        <div className="space-y-4">
          <AiTextField
            label="一句话故事"
            field="一句话故事"
            feature="outline-novel"
            novelId={novelId}
            value={draft.premise}
            onChange={(value) => update("premise", value)}
            rows={3}
            placeholder="谁，在什么处境下，想要什么，被什么挡住。"
            hint="用一句话讲清全书的核心张力。"
          />

          <div className="space-y-3">
            <AiTextField
              label="主题"
              field="主题"
              feature="outline-novel"
              novelId={novelId}
              value={draft.theme}
              onChange={(value) => update("theme", value)}
              rows={2}
              placeholder="例如：记忆与代价"
            />
            <AiTextField
              label="基调"
              field="基调"
              feature="outline-novel"
              novelId={novelId}
              value={draft.tone}
              onChange={(value) => update("tone", value)}
              rows={2}
              placeholder="例如：冷峻、克制的东方奇幻"
            />
          </div>

          <AiTextField
            label="主线"
            field="主线"
            feature="outline-novel"
            novelId={novelId}
            value={draft.mainPlot}
            onChange={(value) => update("mainPlot", value)}
            rows={5}
            placeholder="按阶段写主线：起点、转折、终局。"
          />

          <AiTextField
            label="结局方向"
            field="结局方向"
            feature="outline-novel"
            novelId={novelId}
            value={draft.ending}
            onChange={(value) => update("ending", value)}
            rows={3}
            placeholder="结局落点与代价，不必写死细节。"
          />

          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">卖点 / 核心冲突</div>
            <StringListEditor
              items={draft.hooks}
              onChange={(items) => update("hooks", items)}
              placeholder="例如：潮信为什么会写回收件人自己"
              emptyHint="列几条让读者愿意追下去的钩子。"
              ai={{ feature: "outline-novel", novelId, field: "卖点与核心冲突" }}
            />
          </div>

          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">支线</div>
            <StringListEditor
              items={draft.subplots}
              onChange={(items) => update("subplots", items)}
              placeholder="例如：守夜人旧案的真相"
              emptyHint="支线可与主线交叉，支撑主题。"
              ai={{ feature: "outline-novel", novelId, field: "支线" }}
            />
          </div>

          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">人物弧光</div>
            <div className="space-y-1.5">
              {draft.characterArcs.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-3">
                  还没有人物弧光，添加「角色 + 变化」。
                </p>
              ) : null}
              {draft.characterArcs.map((item, index) => (
                <div key={index} className="flex items-start gap-1">
                  <Input
                    value={item.character}
                    placeholder="角色"
                    className="h-8 w-24 shrink-0 text-[13px]"
                    onChange={(event) =>
                      update(
                        "characterArcs",
                        draft.characterArcs.map((arc, i) => (i === index ? { ...arc, character: event.target.value } : arc)),
                      )
                    }
                  />
                  <Input
                    value={item.arc}
                    placeholder="从…变成…"
                    className="h-8 text-[13px]"
                    onChange={(event) =>
                      update(
                        "characterArcs",
                        draft.characterArcs.map((arc, i) => (i === index ? { ...arc, arc: event.target.value } : arc)),
                      )
                    }
                  />
                  <IconButton
                    label="上移"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...draft.characterArcs];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      update("characterArcs", next);
                    }}
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="下移"
                    size="sm"
                    disabled={index === draft.characterArcs.length - 1}
                    onClick={() => {
                      const next = [...draft.characterArcs];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      update("characterArcs", next);
                    }}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="删除"
                    size="sm"
                    onClick={() => update("characterArcs", draft.characterArcs.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              ))}
              <Button
                variant="subtle"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => update("characterArcs", [...draft.characterArcs, { character: "", arc: "" }])}
              >
                添加人物弧光
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[14px] font-medium text-ink-2">世界硬规则</div>
            <StringListEditor
              items={draft.worldRules}
              onChange={(items) => update("worldRules", items)}
              placeholder="例如：潮信必须在涨潮前送达"
              emptyHint="写下 AI 写正文时必须遵守的硬规则。"
              ai={{ feature: "outline-novel", novelId, field: "世界硬规则" }}
            />
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <GitBranch className="size-3.5" />
            <span>总纲决定方向，卷纲管节奏，章纲落到场景。</span>
            <Badge tone="default">AI 读取</Badge>
          </p>
        </div>
      )}

      <AiAssistSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI 生成 · 总纲"
        feature="outline-novel"
        novelId={novelId}
        instruction="请根据本书已有信息（标题、类型、简介、角色与设定），为下面选中的总纲字段写一段可直接使用的成稿，约 120–200 字；具体、克制、避免空话套话。"
        targets={AI_TARGETS}
        onAdopt={handleAiAdopt}
      />
    </PanelCard>
  );
}
