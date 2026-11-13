"use client";

/**
 * 设置分区元数据 + 分区内容 + 保存状态指示。
 * /settings 整页与 SettingsDialog 悬浮窗共用这一份定义，避免两处逻辑漂移。
 */

import * as React from "react";
import {
  Bot,
  Cpu,
  Database,
  Info,
  Palette,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  TriangleAlert,
  Type,
} from "lucide-react";
import { Button, Spinner } from "@/components/ui/kit";
import { useT } from "@/lib/i18n";
import type { AppSettings } from "@/lib/types";
import { AboutSection } from "./AboutSection";
import { AgentSection } from "./AgentSection";
import { AppearanceSection } from "./AppearanceSection";
import { ContextSection } from "./ContextSection";
import { DataSection } from "./DataSection";
import { EditorSection } from "./EditorSection";
import { PresetsSection } from "./PresetsSection";
import { ProvidersSection } from "./ProvidersSection";
import type { SettingsEditor } from "./useSettingsEditor";

export type SettingsSectionKey =
  | "providers"
  | "presets"
  | "agents"
  | "context"
  | "editor"
  | "appearance"
  | "data"
  | "about";

export interface SettingsSectionMeta {
  key: SettingsSectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    key: "providers",
    label: "模型服务",
    description: "DeepSeek 官方接口",
    icon: <Cpu className="size-3.5" aria-hidden />,
  },
  {
    key: "presets",
    label: "提示词预设",
    description: "白盒提示词，可改可恢复",
    icon: <ScrollText className="size-3.5" aria-hidden />,
  },
  {
    key: "agents",
    label: "智能体",
    description: "人设、职责与提示词要求",
    icon: <Bot className="size-3.5" aria-hidden />,
  },
  {
    key: "context",
    label: "AI 与上下文",
    description: "素材开关与 token 预算",
    icon: <SlidersHorizontal className="size-3.5" aria-hidden />,
  },
  {
    key: "editor",
    label: "编辑器",
    description: "字体、排版与编辑显示",
    icon: <Type className="size-3.5" aria-hidden />,
  },
  {
    key: "appearance",
    label: "外观",
    description: "主题与界面偏好",
    icon: <Palette className="size-3.5" aria-hidden />,
  },
  {
    key: "data",
    label: "数据",
    description: "备份、导出、导入 TXT",
    icon: <Database className="size-3.5" aria-hidden />,
  },
  {
    key: "about",
    label: "关于",
    description: "版本、许可证与致谢",
    icon: <Info className="size-3.5" aria-hidden />,
  },
];

export function isSettingsSectionKey(value: string): value is SettingsSectionKey {
  return SETTINGS_SECTIONS.some((section) => section.key === value);
}

/** 渲染当前设置分区；整页与悬浮窗共用。 */
export function SettingsSectionContent({
  active,
  settings,
  update,
}: {
  active: SettingsSectionKey;
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}) {
  switch (active) {
    case "providers":
      return <ProvidersSection settings={settings} update={update} />;
    case "presets":
      return <PresetsSection />;
    case "agents":
      return <AgentSection settings={settings} update={update} />;
    case "context":
      return <ContextSection settings={settings} update={update} />;
    case "editor":
      return <EditorSection settings={settings} update={update} />;
    case "appearance":
      return <AppearanceSection settings={settings} update={update} />;
    case "data":
      return <DataSection />;
    case "about":
      return <AboutSection />;
    default:
      return null;
  }
}

function formatSavedClock(value: number): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

/** 自动保存状态：保存失败 / 保存中 / 有未保存改动 / 已保存时间 / 默认提示。 */
export function SettingsSaveStatus({ editor }: { editor: SettingsEditor }) {
  const tr = useT();
  if (editor.saveError) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-danger">
        <TriangleAlert className="size-3.5" aria-hidden />
        {tr("保存失败")}
        <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3" />} onClick={() => void editor.saveNow()}>
          {tr("重试")}
        </Button>
      </span>
    );
  }
  if (editor.saving) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Spinner size="sm" />
        {tr("保存中…")}
      </span>
    );
  }
  if (editor.dirty) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-gold">
        <span className="size-1.5 rounded-full bg-gold" aria-hidden />
        {tr("有未保存的改动")}
      </span>
    );
  }
  if (editor.lastSavedAt) {
    return <span className="text-[11.5px] text-ink-3">{tr("已保存 · {clock}", { clock: formatSavedClock(editor.lastSavedAt) })}</span>;
  }
  return <span className="text-[11.5px] text-ink-3">{tr("改动会自动保存")}</span>;
}
