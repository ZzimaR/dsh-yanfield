"use client";

/**
 * AI 写作辅助面板（knowledge 页面共用）
 *
 * 大纲 / 设定 / 档案三页的「AI 帮我写 / 续写 / 优化 / 补全」都走这里：
 * - 点开只展开面板，让作者先写下想法；点「开始生成」才通过 `streamAiTask` 调 `POST /api/ai/task`；
 * - 字段里已有的草稿会一起送给模型，按这个想法完善，而不是另写一套；
 * - 结果不会自动落库，用户点「采纳」后才回填到调用方的编辑态，保存动作由调用方负责；
 * - 面板会显示本次实际使用的 Provider / 模型名（设计规范要求 AI 相关内容必须显示模型）。
 */
import * as React from "react";
import { ArrowRight, Check, PenLine, RefreshCw, Sparkles, Square, TriangleAlert, WandSparkles } from "lucide-react";
import { Button, Kbd, Markdown, Segmented, Select, Sheet, Skeleton, Textarea, useToast } from "@/components/ui/kit";
import { streamAiTask, useApi } from "@/lib/client/api";
import {
  buildFieldInstruction,
  composeAssistBrief,
  type AssistMode,
} from "@/lib/ai/assist-brief";
import type { AiFeature, AiStreamEvent, AiUsage, AppSettings, ID } from "@/lib/types";
import { AI_FEATURE_LABEL } from "@/lib/types";
import { describeAiSpend } from "@/components/ai/AiSpendLine";

export type AiAssistMode = AssistMode;

export interface AiTargetOption {
  value: string;
  label: string;
}

export interface AiAssistSheetProps {
  open: boolean;
  onClose: () => void;
  /** 面板标题，例如「AI 帮我写 · 一句话故事」 */
  title: string;
  feature: AiFeature;
  novelId: ID;
  chapterId?: ID | null;
  /** 本次任务的基础指令。提供 modes 时由字段名和模式现算，此值忽略。 */
  instruction?: string;
  /** 已有草稿。完善 / 续写 / 优化时作为要处理的原文。 */
  selection?: string;
  /** 字段名。与 modes 一起用时，面板内可切换完善 / 续写 / 优化。 */
  field?: string;
  modes?: AiAssistMode[];
  defaultMode?: AiAssistMode;
  /** 采纳目标字段；多于 1 个时展示字段选择器 */
  targets: AiTargetOption[];
  defaultTarget?: string;
  onAdopt: (text: string, target: string) => void;
  /** 采纳后的 toast 补充说明 */
  adoptHint?: string;
}

const MODE_LABEL: Record<AiAssistMode, string> = {
  write: "完善",
  continue: "续写",
  polish: "优化",
};

const FIELD_ASSIST_MODES: AiAssistMode[] = ["write", "continue", "polish"];

/** 把网络 / 鉴权 / 限流等底层错误翻译成可执行的中文提示 */
function friendlyAiError(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "生成失败，请稍后重试。";
  if (/fetch failed|failed to fetch|networkerror|load failed|network request failed/i.test(text))
    return "网络请求失败：没能连上 AI 服务。请确认服务在运行，或点「重新生成」重试。";
  if (/aborterror|aborted/i.test(text)) return "已停止本次生成。";
  if (/timeout|timed out|ETIMEDOUT/i.test(text)) return "请求超时：模型响应较慢，请重试或换用更快的模型。";
  if (/401|unauthorized|api key|apikey/i.test(text)) return "鉴权失败：请到「设置 → AI 服务」检查 API Key 是否有效。";
  if (/429|rate limit|quota/i.test(text)) return "请求过于频繁或额度不足：请稍后重试，或检查模型额度。";
  if (/5\d\d|internal server error/i.test(text)) return "AI 服务异常（服务端错误）：请稍后重试。";
  return text;
}

function modeIcon(mode: AiAssistMode): React.ReactNode {
  if (mode === "write") return <PenLine className="size-3.5" />;
  if (mode === "continue") return <ArrowRight className="size-3.5" />;
  return <WandSparkles className="size-3.5" />;
}

function ideaPlaceholder(mode: AiAssistMode | null, hasDraft: boolean): string {
  switch (mode) {
    case "write":
      return hasDraft
        ? "还想怎么完善？例如：补上代价和例外。留空就按已有内容来写。"
        : "先写你已经想到的。例如：渡口只在退潮时开启，进去的人要留下一段记忆。";
    case "continue":
      return hasDraft ? "接着往哪写？例如：补一条没人知道的例外。可留空。" : "从哪写起？可留空，按本书已有设定来补。";
    case "polish":
      return "想改哪一点？例如：更具体，少一点空话。可留空。";
    case null:
      return hasDraft ? "还想怎么完善？留空则按已有内容和本书设定来写。" : "先写你已经想到的。留空则按本书已有设定来补。";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function buildAiInstruction(mode: AiAssistMode, field: string, current?: string): string {
  return buildFieldInstruction(mode, field, Boolean(current && current.trim()));
}

export function AiAssistSheet({
  open,
  onClose,
  title,
  feature,
  novelId,
  chapterId,
  instruction = "",
  selection,
  field,
  modes,
  defaultMode = "write",
  targets,
  defaultTarget,
  onAdopt,
  adoptHint,
}: AiAssistSheetProps) {
  const { toast } = useToast();
  const settingsApi = useApi<AppSettings>(open ? "/api/settings" : null);
  const [text, setText] = React.useState("");
  const [meta, setMeta] = React.useState<{ provider: string; model: string } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [hasRun, setHasRun] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runUsage, setRunUsage] = React.useState<AiUsage | null>(null);
  const [idea, setIdea] = React.useState("");
  const [mode, setMode] = React.useState<AiAssistMode>(defaultMode);
  const [target, setTarget] = React.useState(defaultTarget ?? targets[0]?.value ?? "");
  const abortRef = React.useRef<AbortController | null>(null);
  const seqRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const ideaRef = React.useRef(idea);
  const modeRef = React.useRef(mode);
  const ideaBoxRef = React.useRef<HTMLDivElement>(null);
  ideaRef.current = idea;
  modeRef.current = mode;

  const modeChoices = modes && modes.length > 0 ? modes : null;
  const hasDraft = Boolean(selection && selection.trim());

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setRunning(false);
  }, []);

  const start = React.useCallback(() => {
    if (runningRef.current) return;
    const base =
      field && modeChoices
        ? buildFieldInstruction(modeRef.current, field, Boolean(selection && selection.trim()))
        : instruction;
    const brief = composeAssistBrief({
      instruction: base,
      idea: ideaRef.current,
      draft: selection,
    });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;
    runningRef.current = true;
    setText("");
    setMeta(null);
    setError(null);
    setRunUsage(null);
    setHasRun(true);
    setRunning(true);
    streamAiTask(
      {
        novelId,
        chapterId: chapterId ?? null,
        feature,
        message: brief.message,
        instruction: brief.instruction,
        ...(brief.selection ? { selection: brief.selection } : {}),
      },
      {
        signal: controller.signal,
        onEvent: (event: AiStreamEvent) => {
          if (seq !== seqRef.current) return;
          if (event.type === "meta") setMeta({ provider: event.provider, model: event.model });
          else if (event.type === "delta") setText((prev) => prev + event.text);
          else if (event.type === "error") {
            setError(friendlyAiError(event.message));
            runningRef.current = false;
            setRunning(false);
          }           else if (event.type === "done") {
            setRunUsage(event.usage);
            runningRef.current = false;
            setRunning(false);
          }
        },
      },
    )
      .catch((err: unknown) => {
        if (seq !== seqRef.current) return;
        if (controller.signal.aborted) return;
        setError(friendlyAiError(err instanceof Error ? err.message : ""));
        runningRef.current = false;
        setRunning(false);
      })
      .finally(() => {
        if (seq === seqRef.current) {
          runningRef.current = false;
          setRunning(false);
        }
      });
  }, [novelId, chapterId, feature, instruction, selection, field, modeChoices]);

  React.useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      runningRef.current = false;
      setRunning(false);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
    runningRef.current = false;
    setText("");
    setMeta(null);
    setError(null);
    setRunning(false);
    setHasRun(false);
    setRunUsage(null);
    setIdea("");
    setMode(defaultMode);
    setTarget(defaultTarget ?? targets[0]?.value ?? "");
    const timer = window.setTimeout(() => {
      ideaBoxRef.current?.querySelector("textarea")?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
    // 只在面板打开 / 关闭的瞬间重置。想法和草稿在点「开始生成」时再读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const adopt = () => {
    const value = text.trim();
    if (!value) return;
    const selected = targets.find((item) => item.value === target) ?? targets[0];
    onAdopt(value, selected?.value ?? "");
    toast({ title: "已采纳 AI 结果", description: adoptHint ?? "内容已回填到编辑区，记得点击保存。", tone: "success" });
    onClose();
  };

  const onIdeaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    start();
  };

  const modelLabel = meta ? `${meta.provider} · ${meta.model}` : running ? "等待模型响应…" : "尚未请求模型";
  const activeMode = modeChoices ? mode : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={560}
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-accent" />
          <span className="truncate">{title}</span>
        </span>
      }
      footer={
        <div className="flex items-center gap-2 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
          {targets.length > 1 ? (
            <div className="min-w-0 flex-1">
              <Select aria-label="采纳到" value={target} onChange={(event) => setTarget(event.target.value)} options={targets} />
            </div>
          ) : (
            <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-ink-3 sm:inline">采纳后写入当前编辑区，保存后生效</span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {running ? (
              <Button variant="secondary" size="sm" icon={<Square className="size-3.5" />} onClick={stop}>
                停止
              </Button>
            ) : (
              <Button
                variant={hasRun ? "secondary" : "primary"}
                size="sm"
                icon={hasRun ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                onClick={start}
              >
                {hasRun ? "重新生成" : "开始生成"}
              </Button>
            )}
            <Button variant="primary" size="sm" icon={<Check className="size-3.5" />} disabled={running || !text.trim()} onClick={adopt}>
              采纳
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-4 py-4 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
        <div className="flex items-center justify-between gap-3 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <WandSparkles className="size-3.5 text-jade" />
            {AI_FEATURE_LABEL[feature]}
          </span>
          <span className="min-w-0 truncate text-ink-3" title={modelLabel}>
            {modelLabel}
          </span>
        </div>
        {runUsage ? (
          <p className="text-[12px] tabular-nums text-ink-2">
            本次 {describeAiSpend(runUsage.promptTokens, runUsage.completionTokens, settingsApi.data?.aiPricing ?? { inputPerMillion: 0, outputPerMillion: 0 })}
          </p>
        ) : null}

        {modeChoices ? (
          <Segmented
            size="sm"
            value={mode}
            onChange={(value) => {
              if (value === "write" || value === "continue" || value === "polish") setMode(value);
            }}
            options={modeChoices.map((item) => ({
              value: item,
              label: MODE_LABEL[item],
              icon: modeIcon(item),
            }))}
          />
        ) : null}

        <div ref={ideaBoxRef}>
          <Textarea
            label="你的想法"
            hint={
              <span className="inline-flex items-center gap-1">
                <Kbd>Ctrl</Kbd>
                <span>+</span>
                <Kbd>Enter</Kbd>
              </span>
            }
            rows={4}
            value={idea}
            placeholder={ideaPlaceholder(activeMode, hasDraft)}
            onChange={(event) => setIdea(event.target.value)}
            onKeyDown={onIdeaKeyDown}
          />
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          {hasDraft
            ? "会在已有内容上完善，并保留你写下的关键信息。点「开始生成」才会请求模型。"
            : "先把想到的写在这里，再让它写成能直接用的成稿。点「开始生成」才会请求模型。"}
        </p>

        {hasDraft ? (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-ink-3">已有内容</p>
            <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">{selection?.trim()}</p>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] leading-relaxed text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        ) : null}

        {hasRun ? (
          <div className="min-h-[240px] rounded-md border border-line bg-surface p-3">
            {text ? (
              <Markdown text={text} className={running ? "ai-caret" : undefined} />
            ) : running ? (
              <div className="space-y-2.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-2/5" />
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">这次没有生成出内容。可以改一下想法，再点「重新生成」。</p>
            )}
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-ink-3">
          AI 只提供草稿。面板不会自动改写作品数据，采纳并保存后才会写回；如与设定冲突，以你确认后的版本为准。
        </p>
      </div>
    </Sheet>
  );
}

export interface AiAssistButtonProps {
  feature: AiFeature;
  novelId: ID;
  chapterId?: ID | null;
  /** 字段名，用于拼装指令与面板标题 */
  field: string;
  /** 当前值。有内容时当作待完善的草稿，而不是丢弃。 */
  value?: string;
  onAdopt: (text: string) => void;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/** 每个文本区右上角的「AI 帮我写」：点开后先写想法，确认后才请求模型 */
export function AiAssistButton({
  feature,
  novelId,
  chapterId,
  field,
  value,
  onAdopt,
  label,
  size = "sm",
  className,
}: AiAssistButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className={className ?? "h-7 px-2 text-[12px] text-accent hover:bg-accent-soft"}
        icon={<Sparkles className="size-3.5" />}
        onClick={() => setOpen(true)}
      >
        {label ?? "AI 帮我写"}
      </Button>
      <AiAssistSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`AI 帮我写 · ${field}`}
        feature={feature}
        novelId={novelId}
        chapterId={chapterId}
        field={field}
        modes={FIELD_ASSIST_MODES}
        selection={value}
        targets={[{ value: "field", label: field }]}
        onAdopt={(text) => onAdopt(text)}
      />
    </>
  );
}
