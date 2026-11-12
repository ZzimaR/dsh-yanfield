"use client";

/**
 * 设置 · 智能体：编辑内置智能体（主编 / 写作 / 设定）与自定义智能体的人设。
 * - 内置智能体：写 settings.agentOverrides[agentId]（名称 / 职责 / 人设说明 / 问候语 / 额外要求）；
 * - 自定义智能体：展示信息写 settings.customAgent，「额外要求」写 agentOverrides.custom.instructions。
 * 留空表示沿用内置默认；每次改动提交完整的覆盖表，交给 PATCH /api/settings 合并与持久化。
 */

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Badge, Button, Card, Input, Textarea, useToast } from "@/components/ui/kit";
import {
  AGENTS,
  CUSTOM_AGENT,
  DEFAULT_APP_SETTINGS,
  applyAgentOverride,
  type AgentDef,
  type AgentId,
  type AgentPersonaOverride,
  type AppSettings,
} from "@/lib/types";
import { AGENT_TINT_CLASS, agentInitial } from "@/components/ai/utils";
import { cn } from "@/lib/ui/cn";

export interface AgentSectionProps {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}

type OverrideField = keyof AgentPersonaOverride;
type CustomAgent = AppSettings["customAgent"];

/** 字段元数据：名称 / 职责用单行输入，其余用多行文本。 */
const FIELD_META: { key: OverrideField; label: string; rows?: number; hint?: string }[] = [
  { key: "name", label: "名称" },
  { key: "role", label: "职责（一句话）" },
  { key: "description", label: "人设说明", rows: 3, hint: "写给模型看的人设定位，会拼进 system prompt。" },
  { key: "greeting", label: "问候语", rows: 2, hint: "AI 面板没有对话时显示的开场白。" },
  { key: "instructions", label: "额外要求", rows: 3, hint: "附加在提示词最后，适合约束语气、句式与禁忌。" },
];

const OVERRIDE_LIMIT = 500;
const INSTRUCTIONS_PLACEHOLDER = "例如：多用短句和具体动作，少用成语；每段不超过三行。";

/** 清空某张卡的全部覆盖（服务端把空字符串视为删除字段，整条覆盖随之消失）。 */
const CLEARED_OVERRIDE: AgentPersonaOverride = {
  name: "",
  role: "",
  description: "",
  greeting: "",
  instructions: "",
};

interface EditableAgent {
  key: string;
  id: AgentId;
  isCustom: boolean;
  /** 应用覆盖后的展示信息（头像 / 名称 / 职责） */
  display: AgentDef;
  /** 输入框当前值（内置智能体为空表示沿用默认） */
  values: Record<OverrideField, string>;
  /** 占位提示：内置默认值 */
  defaults: Record<OverrideField, string>;
  /** 是否真的写了覆盖字段 */
  overridden: boolean;
}

function overrideHasValue(override?: AgentPersonaOverride | null): boolean {
  if (!override) return false;
  return Boolean(
    override.name?.trim() ||
      override.role?.trim() ||
      override.description?.trim() ||
      override.greeting?.trim() ||
      override.instructions?.trim(),
  );
}

function buildEditableAgents(settings: AppSettings, customAgent: CustomAgent): EditableAgent[] {
  const overrides = settings.agentOverrides ?? {};
  const builtins: EditableAgent[] = AGENTS.map((agent) => {
    const override = overrides[agent.id];
    return {
      key: agent.id,
      id: agent.id,
      isCustom: false,
      display: applyAgentOverride(agent, override),
      values: {
        name: override?.name ?? "",
        role: override?.role ?? "",
        description: override?.description ?? "",
        greeting: override?.greeting ?? "",
        instructions: override?.instructions ?? "",
      },
      defaults: {
        name: agent.name,
        role: agent.role,
        description: agent.description,
        greeting: agent.greeting,
        instructions: INSTRUCTIONS_PLACEHOLDER,
      },
      overridden: overrideHasValue(override),
    };
  });

  const customOverride = overrides.custom;
  const customInstructions = customOverride?.instructions?.trim();
  const customDefaults = {
    name: DEFAULT_APP_SETTINGS.customAgent.name,
    role: DEFAULT_APP_SETTINGS.customAgent.role,
    description: DEFAULT_APP_SETTINGS.customAgent.persona,
    greeting: DEFAULT_APP_SETTINGS.customAgent.greeting,
    instructions: INSTRUCTIONS_PLACEHOLDER,
  };
  const customDisplay: AgentDef = {
    ...CUSTOM_AGENT,
    name: customAgent.name.trim() || CUSTOM_AGENT.name,
    role: customAgent.role.trim() || CUSTOM_AGENT.role,
    greeting: customAgent.greeting.trim() || CUSTOM_AGENT.greeting,
    description: customAgent.persona.trim() || CUSTOM_AGENT.description,
    ...(customInstructions ? { instructions: customInstructions } : {}),
  };
  return [
    ...builtins,
    {
      key: "custom",
      id: "custom",
      isCustom: true,
      display: customDisplay,
      values: {
        name: customAgent.name,
        role: customAgent.role,
        description: customAgent.persona,
        greeting: customAgent.greeting,
        instructions: customOverride?.instructions ?? "",
      },
      defaults: customDefaults,
      overridden: overrideHasValue(customOverride),
    },
  ];
}

export function AgentSection({ settings, update }: AgentSectionProps) {
  const { toast } = useToast();
  if (!settings) return null;

  const agentOverrides = settings.agentOverrides ?? {};
  const customAgent = settings.customAgent ?? DEFAULT_APP_SETTINGS.customAgent;
  const editable = buildEditableAgents(settings, customAgent);
  const customTouched = JSON.stringify(customAgent) !== JSON.stringify(DEFAULT_APP_SETTINGS.customAgent);
  const canReset = Object.keys(agentOverrides).length > 0 || customTouched;

  const setOverrideField = (agentId: AgentId, field: OverrideField, value: string) => {
    const current = agentOverrides[agentId] ?? {};
    update({ agentOverrides: { ...agentOverrides, [agentId]: { ...current, [field]: value } } });
  };

  const setCustomField = (field: "name" | "role" | "persona" | "greeting", value: string) => {
    update({ customAgent: { ...customAgent, [field]: value } });
  };

  const handleFieldChange = (agent: EditableAgent, field: OverrideField, value: string) => {
    if (!agent.isCustom) {
      setOverrideField(agent.id, field, value);
      return;
    }
    if (field === "instructions") {
      setOverrideField("custom", "instructions", value);
      return;
    }
    const KEY_MAP = { name: "name", role: "role", description: "persona", greeting: "greeting" } as const;
    setCustomField(KEY_MAP[field], value);
  };

  const resetAgent = (agent: EditableAgent) => {
    if (agent.isCustom) {
      update({
        customAgent: DEFAULT_APP_SETTINGS.customAgent,
        agentOverrides: { ...agentOverrides, custom: CLEARED_OVERRIDE },
      });
    } else {
      update({ agentOverrides: { ...agentOverrides, [agent.id]: CLEARED_OVERRIDE } });
    }
    toast({
      title: `已恢复「${agent.display.name}」的默认人设`,
      description: "改动会自动保存。",
      tone: "success",
    });
  };

  const resetAll = () => {
    const cleared: AppSettings["agentOverrides"] = {};
    for (const agent of AGENTS) cleared[agent.id] = CLEARED_OVERRIDE;
    cleared.custom = CLEARED_OVERRIDE;
    update({ agentOverrides: cleared, customAgent: DEFAULT_APP_SETTINGS.customAgent });
    toast({ title: "已恢复全部智能体的默认人设", description: "改动会自动保存。", tone: "success" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">智能体</h2>
          <p className="mt-1 text-[12px] leading-6 text-ink-3">
            这里改的是右侧 AI 面板里智能体的名字、职责、人设与额外要求，改动会同时用于对话提示词，并自动保存。留空表示沿用内置默认。
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={resetAll} disabled={!canReset}>
          恢复默认
        </Button>
      </div>

      {editable.map((agent) => {
        const tint = AGENT_TINT_CLASS[agent.display.tint];
        const resetDisabled = agent.isCustom
          ? !customTouched && !overrideHasValue(agentOverrides.custom)
          : !agent.overridden;
        return (
          <Card key={agent.key} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-sm font-serif text-sm",
                    tint.avatar,
                  )}
                  aria-hidden
                >
                  {agentInitial(agent.display)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium text-ink">{agent.display.name}</span>
                    {agent.isCustom ? (
                      <Badge>自定义</Badge>
                    ) : agent.overridden ? (
                      <Badge tone="accent">已自定义</Badge>
                    ) : (
                      <Badge>默认</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{agent.display.role}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => resetAgent(agent)}
                disabled={resetDisabled}
              >
                恢复默认
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {FIELD_META.map((field) => {
                const value = agent.values[field.key];
                const hint =
                  field.key === "instructions"
                    ? `${field.hint ?? ""} ${value.length}/${OVERRIDE_LIMIT} 字`.trim()
                    : field.hint;
                const shared = {
                  label: field.label,
                  value,
                  placeholder: agent.defaults[field.key] || undefined,
                  maxLength: OVERRIDE_LIMIT,
                  hint,
                };
                const onChange = (next: string) => handleFieldChange(agent, field.key, next);
                return (
                  <div key={field.key} className={cn(field.rows ? "sm:col-span-2" : undefined)}>
                    {field.rows ? (
                      <Textarea {...shared} rows={field.rows} onChange={(event) => onChange(event.target.value)} />
                    ) : (
                      <Input {...shared} onChange={(event) => onChange(event.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
