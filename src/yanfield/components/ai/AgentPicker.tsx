"use client";

/**
 * 智能体选择器：内置智能体（主编 / 写作 / 设定）+ 自定义智能体。
 * 触发器显示当前智能体 tint 色头像、中文名与一句话角色；下拉卡片列出全部候选。
 */
import * as React from "react";
import { localizedAgentName } from "@/lib/ai/agent-display";
import { Check, ChevronDown } from "lucide-react";
import type { AgentDef, AgentId } from "@/lib/types";
import { useOnClickOutside } from "@/lib/ui/hooks";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { AGENT_TINT_CLASS, agentInitial } from "./utils";

export interface AgentPickerProps {
  value: AgentId;
  onChange: (agentId: AgentId) => void;
  agents: AgentDef[];
  disabled?: boolean;
  className?: string;
}

export function AgentPicker({ value, onChange, agents, disabled = false, className }: AgentPickerProps) {
  const tr = useT();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  useOnClickOutside(containerRef, () => setOpen(false));

  const current = agents.find((agent) => agent.id === value) ?? agents[0];
  if (!current) return null;
  const currentTint = AGENT_TINT_CLASS[current.tint];

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr("选择智能体，当前：{name}", { name: localizedAgentName(current) })}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-sm font-serif text-[12px]",
            currentTint.avatar,
          )}
          aria-hidden
        >
          {agentInitial(current)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[12.5px] font-medium text-ink">{localizedAgentName(current)}</span>
            {current.id === "custom" ? (
              <span className="shrink-0 rounded-full border border-line px-1 text-[10px] text-ink-4">
                {tr("自定义")}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-ink-4">{tr(current.role)}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={tr("智能体列表")}
          className="scroll-thin absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-float rise-in"
        >
          {agents.map((agent) => {
            const tint = AGENT_TINT_CLASS[agent.tint];
            const active = agent.id === value;
            return (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(agent.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-none",
                  active ? tint.soft : "hover:bg-surface-2 focus-visible:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm font-serif text-[12px]",
                    tint.avatar,
                  )}
                  aria-hidden
                >
                  {agentInitial(agent)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "truncate text-[12.5px] font-medium",
                        active ? tint.text : "text-ink",
                      )}
                    >
                      {localizedAgentName(agent)}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-4">{agent.englishName}</span>
                    {agent.id === "custom" ? (
                      <span className="shrink-0 rounded-full border border-line px-1 text-[10px] text-ink-4">
                        {tr("可配置")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-ink-4">
                    {tr(agent.role)} · {tr(agent.description)}
                  </span>
                  {agent.skills.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {agent.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3"
                        >
                          {tr(skill)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <Check className={cn("mt-1 size-3.5 shrink-0", tint.text)} aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
