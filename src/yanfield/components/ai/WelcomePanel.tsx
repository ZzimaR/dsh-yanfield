"use client";

import { localizedAgentName } from "@/lib/ai/agent-display";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import type { AgentDef } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { useT } from "@/lib/i18n";
import { openSettingsDialog } from "@/components/settings/open";
import { AGENT_TINT_CLASS, agentInitial } from "./utils";
import type { ModelTargetInfo } from "./model-info";

const EXAMPLES = [
  { label: "检查节奏", prompt: "看看第一章，说说节奏上的问题" },
  { label: "校对错别字", prompt: "把最新一章的错别字改掉" },
  { label: "起草章纲", prompt: "为下一章写一个章纲" },
];

export interface WelcomePanelProps {
  agent: AgentDef;
  model: ModelTargetInfo | null;
  /** 把示例指令填入输入框。 */
  onPickSkill: (prompt: string, label: string) => void;
  disabled?: boolean;
  className?: string;
}

export function WelcomePanel({
  agent,
  model,
  onPickSkill,
  disabled = false,
  className,
}: WelcomePanelProps) {
  const tr = useT();
  const tint = AGENT_TINT_CLASS[agent.tint];
  const isDemo = model?.providerKind === "demo";
  const notReady = model === null || !model.ready;

  return (
    <div className={cn("fade-in flex flex-col gap-3.5 px-1 py-3", className)}>
      {/* 演示 / 未配置提示 */}
      {isDemo ? (
        <div className="rounded-md border border-gold/25 bg-gold-soft/60 px-3 py-2 text-[11px] leading-relaxed text-ink-2 dark:bg-gold-soft/30">
          <p className="flex items-center gap-1 font-medium text-ink">
            <CircleAlert className="size-3.5 shrink-0 text-gold" />
            {tr("离线演示模式（无需 Key）")}
          </p>
          <p className="mt-0.5 text-ink-3">
            {tr("当前不会调用外部服务。多步任务需要真实模型，请在设置 → 模型服务中配置。")}
          </p>
          <Link
            href="/settings"
            onClick={(event) => {
              event.preventDefault();
              openSettingsDialog("providers");
            }}
            className="mt-1 inline-flex items-center gap-0.5 font-medium text-accent underline-offset-2 hover:underline"
          >
            {tr("去设置模型与 API Key")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : notReady ? (
        <div className="rounded-md border border-gold/25 bg-gold-soft/60 px-3 py-2 text-[11px] leading-relaxed text-ink-2 dark:bg-gold-soft/30">
          <p className="flex items-center gap-1 font-medium text-ink">
            <CircleAlert className="size-3.5 shrink-0 text-gold" />
            {tr("还没有可用的模型，发送会失败")}
          </p>
          <Link
            href="/settings"
            onClick={(event) => {
              event.preventDefault();
              openSettingsDialog("providers");
            }}
            className="mt-0.5 inline-flex items-center gap-0.5 font-medium text-accent underline-offset-2 hover:underline"
          >
            {tr("去设置添加 Provider")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : null}

      {/* 智能体问候 */}
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-lg font-serif text-[20px]",
            tint.avatar,
          )}
          aria-hidden
        >
          {agentInitial(agent)}
        </span>
        <h3 className="mt-2.5 font-serif text-[17px] text-ink">{localizedAgentName(agent)}</h3>
        <p className="mt-2 max-w-[340px] whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
          {tr(agent.greeting)}
        </p>
      </div>

      {/* 示例问题 */}
      <div role="group" aria-label={tr("示例提问")} className="flex flex-wrap items-center gap-1.5">
        {EXAMPLES.map(({ label, prompt }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            title={tr(prompt)}
            onClick={() => onPickSkill(tr(prompt), label)}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {tr(label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default WelcomePanel;
