"use client";

/**
 * knowledge 页面共用的小型表单组件
 *
 * 说明：本文件放在 components/outline/ 下，但被大纲 / 设定 / 档案三页共同复用，
 * 只包含与业务无关的展示与编辑小件（字段、列表、标签、状态栏等），
 * 所有颜色使用设计 token 类名，不写死 hex。
 */
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  useToast,
  type BadgeTone,
} from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import type { AiFeature, Chapter, ID, Volume } from "@/lib/types";
import { AiAssistButton, AiAssistSheet } from "./ai-assist";

/* ============================== 章节排序 / 全书章号 ============================== */

/**
 * 多卷作品里 chapter.orderIndex 只在卷内唯一，直接按 orderIndex 排序会把各卷章节交错。
 * 先按分卷顺序、再按卷内章序排序。
 */
export function sortChaptersByVolume<T extends { volumeId: string | null; orderIndex: number }>(
  chapters: T[],
  volumes: Pick<Volume, "id" | "orderIndex">[],
): T[] {
  const rank = new Map(volumes.map((volume) => [volume.id, volume.orderIndex]));
  return [...chapters].sort((a, b) => {
    const ra = a.volumeId ? rank.get(a.volumeId) ?? Number.MAX_SAFE_INTEGER : -1;
    const rb = b.volumeId ? rank.get(b.volumeId) ?? Number.MAX_SAFE_INTEGER : -1;
    return ra - rb || a.orderIndex - b.orderIndex;
  });
}

/** 按分卷排序后重排全书章号（orderIndex 从 0 开始），返回新数组，不改动接口数据 */
export function reindexChaptersByVolume<T extends { volumeId: string | null; orderIndex: number }>(
  chapters: T[],
  volumes: Pick<Volume, "id" | "orderIndex">[],
): T[] {
  return sortChaptersByVolume(chapters, volumes).map((chapter, index) => ({ ...chapter, orderIndex: index }));
}

/** 去掉标题里自带的「第一章 / 第 1 章」前缀，避免与页面章号重复 */
export function stripChapterNumber(title: string): string {
  const stripped = (title || "")
    .replace(/^第[\s0-9〇零一二三四五六七八九十百千两]+[章回节][\s·、,，.。:：\-—]*/, "")
    .trim();
  return stripped || title || "未命名章节";
}

/** 统一格式的章节引用文案（全书章号 + 去重后的章节名） */
export function chapterRefLabel(chapter: Pick<Chapter, "orderIndex" | "title">): string {
  return `第 ${chapter.orderIndex + 1} 章 · ${stripChapterNumber(chapter.title)}`;
}

/* ============================== 页头 / 卡片 ============================== */

export function PageHeader({
  title,
  badge,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-[22px] font-semibold leading-tight text-ink">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-end gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelCard({
  title,
  icon,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card padded={false} className={cn("flex min-w-0 flex-col overflow-visible", className)}>
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            {icon ? <span className="text-ink-3">{icon}</span> : null}
            <span className="truncate">{title}</span>
          </h2>
          {description ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <div className={cn("min-w-0 flex-1 px-4 py-3.5", bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-line px-4 py-2.5">{footer}</div> : null}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
  loading,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: "accent" | "jade" | "gold";
  loading?: boolean;
}) {
  return (
    <Card padded={false} className="min-w-0 px-3.5 py-2.5">
      <p className="truncate text-[11px] text-ink-3">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-12" />
      ) : (
        <p
          className={cn(
            "mt-0.5 truncate font-serif text-[20px] font-semibold leading-tight tabular-nums",
            accent === "accent" ? "text-accent" : accent === "jade" ? "text-jade" : accent === "gold" ? "text-gold" : "text-ink",
          )}
        >
          {value}
        </p>
      )}
      {hint ? <p className="mt-0.5 truncate text-[11px] text-ink-3">{hint}</p> : null}
    </Card>
  );
}

export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("space-y-2.5", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index % 3 === 1 ? "w-4/5" : index % 3 === 2 ? "w-3/5" : "w-full")} />
      ))}
    </Card>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] leading-relaxed text-danger">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-danger" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

/* ============================== 字段 ============================== */

export interface AiTextFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  feature: AiFeature;
  novelId: ID;
  chapterId?: ID | null;
  /** 字段名，用于 AI 指令 */
  field: string;
  rows?: number;
  placeholder?: string;
  hint?: React.ReactNode;
  /** 关掉 AI 按钮 */
  ai?: boolean;
  className?: string;
}

export function AiTextField({
  label,
  value,
  onChange,
  feature,
  novelId,
  chapterId,
  field,
  rows = 3,
  placeholder,
  hint,
  ai = true,
  className,
}: AiTextFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {ai ? (
          <AiAssistButton
            feature={feature}
            novelId={novelId}
            chapterId={chapterId}
            field={field}
            value={value}
            onAdopt={(text) => onChange(text)}
          />
        ) : null}
      </div>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} className="min-h-0" />
      {hint ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** 把 AI 返回的整段文本拆成列表条目（去掉 markdown 编号 / 项目符号） */
export function splitAiLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+•·]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);
}

/** 解析「用逗号 / 顿号 / 空格分隔」的标签文本 */
export function parseTags(text: string): string[] {
  const result: string[] = [];
  for (const piece of text.split(/[,，、;；\s]+/)) {
    const value = piece.trim();
    if (value && !result.includes(value)) result.push(value);
  }
  return result;
}

export function TagsInput({
  label,
  value,
  onChange,
  placeholder = "用逗号或顿号分隔",
  hint,
}: {
  label?: React.ReactNode;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  const joined = value.join("、");
  const [text, setText] = React.useState(joined);
  const lastJoined = React.useRef(joined);

  React.useEffect(() => {
    if (joined !== lastJoined.current) {
      setText(joined);
      lastJoined.current = joined;
    }
  }, [joined]);

  return (
    <Input
      label={label}
      hint={hint}
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        lastJoined.current = next;
        onChange(parseTags(next));
      }}
    />
  );
}

/* ============================== 列表编辑 ============================== */

export interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyHint?: React.ReactNode;
  /** 开启后提供「AI 补充」，结果逐行追加到列表 */
  ai?: { feature: AiFeature; novelId: ID; chapterId?: ID | null; field: string };
}

export function StringListEditor({ items, onChange, placeholder, addLabel, emptyHint, ai }: StringListEditorProps) {
  const [aiOpen, setAiOpen] = React.useState(false);

  const updateItem = (index: number, value: string) => onChange(items.map((item, i) => (i === index ? value : item)));
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));
  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
          {emptyHint ?? "还没有内容，先添加一条。"}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-ink-3">{index + 1}</span>
              <Input
                value={item}
                onChange={(event) => updateItem(index, event.target.value)}
                placeholder={placeholder}
                className="h-8 text-[13px]"
              />
              <IconButton label="上移" size="sm" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                <ArrowUp className="size-3.5" />
              </IconButton>
              <IconButton label="下移" size="sm" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                <ArrowDown className="size-3.5" />
              </IconButton>
              <IconButton label="删除" size="sm" onClick={() => removeItem(index)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="subtle" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...items, ""])}>
          {addLabel ?? "添加一条"}
        </Button>
        {ai ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-accent hover:bg-accent-soft"
              icon={<Sparkles className="size-3.5" />}
              onClick={() => setAiOpen(true)}
            >
              AI 补充
            </Button>
            <AiAssistSheet
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              title={`AI 补充 · ${ai.field}`}
              feature={ai.feature}
              novelId={ai.novelId}
              chapterId={ai.chapterId}
              instruction={`请为「${ai.field}」补充若干条内容，每行一条，用短句，不要编号，也不要解释。`}
              targets={[{ value: "append", label: ai.field }]}
              onAdopt={(text) => onChange([...items, ...splitAiLines(text)])}
              adoptHint="已追加到列表，记得点击保存。"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ============================== 保存状态 ============================== */

export function SaveBar({
  dirty,
  saving,
  onSave,
  hint,
  children,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
        {dirty ? <Badge tone="gold">未保存</Badge> : <Badge tone="default">已保存</Badge>}
        {hint ? <span className="truncate">{hint}</span> : null}
        {children}
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={!dirty}
        loading={saving}
        icon={<Check className="size-3.5" />}
        onClick={onSave}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        保存
      </Button>
    </div>
  );
}

/* ============================== 其他小件 ============================== */

/** 统一的接口错误 toast：同一个错误串只弹一次，避免重复刷屏 */
export function useErrorToast(error: string | null | undefined, title = "加载失败"): void {
  const { toast } = useToast();
  const lastRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!error) {
      lastRef.current = null;
      return;
    }
    if (lastRef.current === error) return;
    lastRef.current = error;
    toast({ title, description: error, tone: "error" });
  }, [error, title, toast]);
}

/** 兼容 POST 返回「实体本身」或「{ item: 实体 }」两种形态（契约以实体为主，这里做一层防御） */
export function unwrapEntity<T>(value: T | { item: T }): T {
  if (value && typeof value === "object" && "item" in (value as Record<string, unknown>)) {
    const wrapped = (value as { item?: T }).item;
    if (wrapped !== undefined) return wrapped;
  }
  return value as T;
}

export const ROLE_BADGE_TONE: Record<string, BadgeTone> = {
  protagonist: "accent",
  antagonist: "danger",
  supporting: "jade",
  mentor: "gold",
  ensemble: "default",
  other: "default",
};

export const CATEGORY_BADGE_TONE: Record<string, BadgeTone> = {
  power: "accent",
  geography: "jade",
  faction: "gold",
  item: "default",
  rule: "accent",
  history: "gold",
  custom: "default",
};
