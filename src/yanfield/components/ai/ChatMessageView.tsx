"use client";

/**
 * 单条聊天消息：
 * - 用户消息：右对齐气泡 + 悬停操作
 * - 助手消息：tint 色头像（智能体名首字）+ 模型名 + Markdown 正文
 *   + 可折叠「思考过程」+ 流式打字光标 + 正文类 action 审阅入口 + 操作工具条
 */
import * as React from "react";
import { localizedAgentName } from "@/lib/ai/agent-display";
import Link from "next/link";
import {
  Brain,
  FileText,
  ChevronDown,
  CircleAlert,
  Copy,
  Lightbulb,
  RotateCcw,
  Trash,
} from "lucide-react";
import type { AgentDef, AiAction, AiPricing } from "@/lib/types";
import type { SelectionReference } from "@/lib/editor/selection-reference";
import { Badge, Button, IconButton, Markdown } from "@/components/ui/kit";
import { openSettingsDialog } from "@/components/settings/open";
import { cn, formatRelativeTime } from "@/lib/ui/cn";
import { useT } from "@/lib/i18n";
import type { UIMessage } from "./types";
import { ACTION_LABEL, AGENT_TINT_CLASS, agentInitial, formatTokens, isBodyAction } from "./utils";
import { AgentRunCard } from "./AgentRunCard";
import { UsageIndicator } from "./UsageIndicator";

export interface ChatMessageViewProps {
  novelId: string;
  message: UIMessage;
  agent: AgentDef;
  /** 该消息是否正在接收流式内容（显示打字光标） */
  streaming?: boolean;
  /** 是否可重新生成（存在上一条用户消息才为 true） */
  canRetry?: boolean;
  onCopy?: (message: UIMessage) => void;
  onRetry?: (message: UIMessage) => void;
  onDelete?: (message: UIMessage) => void;
  /** 点击正文类 action 时回调（由面板决定弹 diff 审阅还是确认框） */
  onApplyAction?: (action: AiAction) => void;
  pricing?: AiPricing;
  disableActions?:boolean;
  onContinue?:(text:string, runId:string)=>void;
  className?: string;
}

export const ChatMessageView = React.memo(function ChatMessageView({
  novelId,
  message,
  agent,
  streaming = false,
  canRetry = false,
  onCopy,
  onRetry,
  onDelete,
  onApplyAction,
  pricing,
  disableActions,
  onContinue,
  className,
}: ChatMessageViewProps) {
  const [showReasoning, setShowReasoning] = React.useState(false);
  const tr = useT();
  const tint = AGENT_TINT_CLASS[agent.tint] ?? AGENT_TINT_CLASS.accent;

  /* ---------------- 用户消息 ---------------- */
  if (message.role === "user") {
    const quote = message.actions.find(action => action.type === "selection-reference")?.payload as
      { text?: string; reference?: SelectionReference } | undefined;
    const range = quote?.reference;
    return (
      <div className={cn("group/msg flex justify-end", className)}>
        <div className="flex max-w-[92%] flex-col items-end gap-1.5">
          <div className="min-w-0 max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-line/70 bg-surface-2/60 px-4 py-2.5 text-[13px] leading-[1.85] text-ink-2">
            {typeof quote?.text === "string" ? (
              <details className="mb-2 text-xs">
                <summary className="w-fit max-w-full cursor-pointer list-none rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-accent">
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3 shrink-0" aria-hidden />
                    <span className="truncate" title={range?.chapterTitle}>{range?.chapterTitle || tr("引用正文")}</span>
                    {range ? <span className="shrink-0 tabular-nums">{range.startLine === range.endLine
                      ? tr("第 {line} 行", { line: range.startLine })
                      : tr("第 {from}–{to} 行", { from: range.startLine, to: range.endLine })}</span> : null}
                    <ChevronDown className="size-3 shrink-0" aria-hidden />
                  </span>
                </summary>
                <blockquote className="mt-2 max-h-40 overflow-auto border-l-2 border-accent/25 pl-2 text-ink-3">{quote.text}</blockquote>
              </details>
            ) : null}
            {message.content}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/msg:opacity-100">
            <IconButton label={tr("复制提问")} size="sm" onClick={() => onCopy?.(message)}>
              <Copy className="size-3" />
            </IconButton>
            <IconButton label={tr("删除这条提问")} size="sm" disabled={disableActions} onClick={() => onDelete?.(message)}>
              <Trash className="size-3" />
            </IconButton>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- 助手消息 ---------------- */
  const isStreaming = streaming;
  const reasoningLength = (message.reasoning ?? "").trim().length;

  return (
    <div className={cn("group/msg w-full min-w-0", className)}>
      <div className="min-w-0">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-accent/15 bg-accent/6 font-serif text-[12px] text-accent" aria-hidden>{agentInitial(agent)}</span>
          <span className="font-serif text-[13px] font-medium tracking-wide text-ink">{localizedAgentName(agent)}</span>
          {message.model?<span className="ml-auto max-w-[58%] truncate text-[10px] text-ink-3" title={message.provider?`${message.provider} / ${message.model}`:message.model}>{message.model}</span>:null}
        </div>

        {reasoningLength > 0 ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setShowReasoning((prev) => !prev)}
              aria-expanded={showReasoning}
              className="inline-flex items-center gap-1 rounded-sm text-[11px] text-ink-3 transition-colors duration-150 hover:text-ink-2 dark:text-ink-2 dark:hover:text-ink"
            >
              <Brain className="size-3" />
              {isStreaming ? tr("思考中…") : tr("思考过程 · {count} 字", { count: formatTokens(reasoningLength) })}
              <ChevronDown
                className={cn("size-3 transition-transform duration-150", showReasoning && "rotate-180")}
              />
            </button>
            {showReasoning ? (
              <div className="scroll-thin mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-3 dark:text-ink-2">
                {message.reasoning}
              </div>
            ) : null}
          </div>
        ) : null}

        {message.content && !message.actions.some(a=>a.type==="agent-run") ? (
          <Markdown text={message.content} className={cn("mt-1 text-[13px] leading-[1.9]", isStreaming && "ai-caret")} />
        ) : isStreaming && !message.actions.some(a=>a.type==="agent-run") ? (
          <div className="ai-caret mt-1 h-5" aria-label={tr("正在生成")} />
        ) : null}

        {!message.content && !isStreaming && message.status === "aborted" ? (
          <p className="mt-1 text-[12px] text-ink-4 dark:text-ink-3">{tr("已停止生成")}</p>
        ) : null}

        {message.status === "error" && (message.errorTitle || message.error) ? (
          <div className="mt-2 rounded-md border border-danger/25 bg-danger/10 px-2.5 py-2 text-[12px] leading-relaxed">
            <div className="flex items-start gap-2 text-danger">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words font-medium">
                {message.errorTitle || message.error}
              </span>
              {canRetry ? (
                <button
                  type="button"
                  onClick={() => onRetry?.(message)}
                  className="shrink-0 underline decoration-danger/40 underline-offset-2 transition-colors hover:decoration-danger"
                >
                  {tr("重试")}
                </button>
              ) : null}
            </div>
            {message.errorHint ? (
              <p className="mt-1.5 pl-[22px] text-[11.5px] leading-relaxed text-ink-2 dark:text-ink-2">
                {message.errorHint}
              </p>
            ) : null}
            {message.errorAction === "settings-models" ? (
              <Link
                href="/settings"
                onClick={(event) => {
                  event.preventDefault();
                  openSettingsDialog("providers");
                }}
                className="ml-[22px] mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent transition-opacity duration-150 hover:opacity-80"
              >
                {tr("去「设置 → 模型服务」检查")}
                <span aria-hidden>→</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        {message.actions.filter(a=>a.type==="agent-run").map(action=>{
          const runId=(action.payload as {runId?:string})?.runId;
          return runId?<AgentRunCard key={runId} runId={runId} novelId={novelId} initial={message.agentRun} disabled={disableActions} onContinue={onContinue}/>:null;
        })}
        {message.actions.some(a=>a.type!=="agent-run") ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.actions.filter(a=>a.type!=="agent-run").map((action) =>
              isBodyAction(action) ? (
                <Button
                  key={action.id}
                  size="sm"
                  variant="secondary"
                  icon={<Lightbulb className="size-3" />}
                  onClick={() => onApplyAction?.(action)}
                >
                  {tr(ACTION_LABEL[action.type] ?? action.label)}
                  <span className="ml-1 text-[10.5px] text-ink-4 dark:text-ink-3">{tr("审阅")}</span>
                </Button>
              ) : (
                <Badge key={action.id} tone="jade">
                  {tr(ACTION_LABEL[action.type] ?? action.label ?? "待保存")}
                </Badge>
              ),
            )}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-0.5">
          {message.usage&&message.usage.totalTokens>0?<div className="mr-auto"><UsageIndicator iconOnly cachedInputTokens={message.usage.cachedInputTokens} cacheReportedInputTokens={message.usage.cacheReportedInputTokens} reportedCost={message.usage.reportedCost} estimatedTokens={message.usage.estimatedTokens} promptTokens={message.usage.promptTokens} completionTokens={message.usage.completionTokens} latencyMs={message.usage.latencyMs} price={pricing??{inputPerMillion:0,outputPerMillion:0}}/></div>:<span className="mr-auto text-[10px] text-ink-3">{formatRelativeTime(message.createdAt)}</span>}
          <IconButton
            label={tr("复制回复")}
            size="sm"
            disabled={!message.content}
            onClick={() => onCopy?.(message)}
          >
            <Copy className="size-3.5" />
          </IconButton>
          {canRetry && !isStreaming ? (
            <IconButton label={tr("重新生成")} size="sm" onClick={() => onRetry?.(message)}>
              <RotateCcw className="size-3.5" />
            </IconButton>
          ) : null}
          <IconButton label={tr("删除这条回复")} size="sm" disabled={disableActions} onClick={() => onDelete?.(message)}>
            <Trash className="size-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
});
