"use client";

/**
 * 空状态欢迎区（替换原来的快捷提问）：
 * - 保留当前智能体头像 / 角色 / 问候语；
 * - 说明 AI 在这本书里能做什么、改动可审阅可撤销；
 * - 4 个真实技能（对应内置预设：爆款仿写 / 承接续写 / 去 AI 味 / 章节体检），点击填入输入框；
 * - 简短的提问入口，点击填入输入框；
 * - 离线演示模式下说明「无需 Key」与接入真实模型的入口。
 */
import { localizedAgentName } from "@/lib/ai/agent-display";
import Link from "next/link";
import { ArrowRight, CircleAlert, Sparkles } from "lucide-react";
import type { AgentDef, PromptPreset } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { useT } from "@/lib/i18n";
import { openSettingsDialog } from "@/components/settings/open";
import { AGENT_TINT_CLASS, agentInitial } from "./utils";
import type { ModelTargetInfo } from "./model-info";
import { SKILL_CARDS } from "./skills";

const EXAMPLES = [
  { label: "检查节奏", prompt: "看看第一章，说说节奏上的问题" },
  { label: "校对错别字", prompt: "把最新一章的错别字改掉" },
  { label: "起草章纲", prompt: "为下一章写一个章纲" },
];

export interface WelcomePanelProps {
  agent: AgentDef;
  model: ModelTargetInfo | null;
  /** 内置预设（/api/presets）：用于确认技能可用并展示预设名 */
  presets?: PromptPreset[] | null;
  /** 把技能或示例指令填入输入框。 */
  onPickSkill: (prompt: string, label: string) => void;
  disabled?: boolean;
  className?: string;
}

export function WelcomePanel({
  agent,
  model,
  presets,
  onPickSkill,
  disabled = false,
  className,
}: WelcomePanelProps) {
  const tr = useT();
  const tint = AGENT_TINT_CLASS[agent.tint];
  const presetName = (feature: PromptPreset["feature"]) =>
    presets?.find((preset) => preset.feature === feature)?.name ?? null;
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
        <p className="mt-0.5 text-[11.5px] text-ink-4">{tr(agent.role)}</p>
        <p className="mt-2 max-w-[340px] whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3">
          {tr(agent.greeting)}
        </p>
      </div>

      <p className="rounded-sm bg-surface-2/60 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
        {tr("可以让我续写正文、修改设定、整理角色或完善章纲。正文和资料都会先展示改动，确认后才写入，也可以撤回。")}
      </p>

      {/* 技能 */}
      <div>
        <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-4">{tr("技能")}</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SKILL_CARDS.map((skill) => {
            const name = presetName(skill.feature) ?? tr(skill.label);
            return (
              <button
                key={skill.feature}
                type="button"
                disabled={disabled}
                onClick={() => onPickSkill(skill.prompt, skill.label)}
                title={tr("内置预设：{name}", { name })}
                className="group flex items-start gap-1.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left transition-colors duration-150 hover:border-accent/30 hover:bg-accent-soft focus-visible:border-accent/30 focus-visible:bg-accent-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-ink-2 transition-colors group-hover:text-accent">
                    {tr(skill.label)}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-4">
                    {tr(skill.description)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-ink-4">{tr("技能会先填入输入框，确认后再发送。")}</p>
      </div>

      {/* 示例问题 */}
      <div role="group" aria-label={tr("示例提问")} className="flex flex-wrap items-center gap-1.5">
        {EXAMPLES.map(({ label, prompt }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            title={prompt}
            onClick={() => onPickSkill(prompt, label)}
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
