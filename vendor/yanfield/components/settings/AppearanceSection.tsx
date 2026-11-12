"use client";

import * as React from "react";
import { Moon, Palette, Sun, SunMoon } from "lucide-react";
import { Card, Input, Segmented, Slider, Switch, useToast } from "@/components/ui/kit";
import { applyTheme, type ThemeMode } from "@/lib/ui/theme";
import type { AppSettings } from "@/lib/types";

export interface AppearanceSectionProps {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: React.ReactNode }[] = [
  { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-3.5" aria-hidden />宣纸</span> },
  { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-3.5" aria-hidden />夜航</span> },
  { value: "system", label: <span className="flex items-center gap-1.5"><SunMoon className="size-3.5" aria-hidden />跟随系统</span> },
];

export function AppearanceSection({ settings, update }: AppearanceSectionProps) {
  const { toast } = useToast();
  if (!settings) return null;

  const changeTheme = (mode: ThemeMode) => {
    applyTheme(mode, true);
    update({ theme: mode });
    toast({ title: "主题已切换", description: mode === "system" ? "跟随系统外观" : mode === "dark" ? "夜航" : "宣纸", tone: "success" });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-ink">外观</h2>
        <p className="mt-1 text-[12px] leading-6 text-ink-3">
          主题与写作行为偏好都在这里；正文字体、字号与页面留白在「编辑器」里调整。所有改动即时生效并自动保存。
        </p>
      </div>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Palette className="size-3.5 text-ink-3" aria-hidden />
          主题
        </h3>
        <div className="mt-3">
          <Segmented
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(value) => {
              const mode = value === "dark" || value === "system" ? value : "light";
              changeTheme(mode);
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-3">宣纸是暖白纸感，夜航是低亮度深色；跟随系统会随操作系统切换。</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-[13px] font-medium text-ink">写作行为</h3>
        <div className="mt-3 space-y-4">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Switch
              checked={settings.autoSave}
              onChange={(checked) => update({ autoSave: checked })}
              label="自动保存"
              hint="停笔片刻后自动写入本地数据库"
            />
            <Switch
              checked={settings.typewriterMode}
              onChange={(checked) => update({ typewriterMode: checked })}
              label="打字机模式"
              hint="光标始终保持在屏幕中部"
            />
            <Switch
              checked={settings.focusMode}
              onChange={(checked) => update({ focusMode: checked })}
              label="专注模式"
              hint="隐藏侧栏，只留正文"
            />
          </div>
          <Slider
            label="自动保存延迟"
            min={400}
            max={3000}
            step={100}
            value={settings.autoSaveDelayMs}
            hint={`${(settings.autoSaveDelayMs / 1000).toFixed(1)} 秒`}
            disabled={!settings.autoSave}
            onChange={(value) => update({ autoSaveDelayMs: value })}
          />
          <div className="max-w-xs">
            <Input
              label="每日字数目标"
              type="number"
              min={0}
              max={50000}
              step={500}
              value={String(settings.dailyWordGoal)}
              onChange={(event) => {
                const next = Number(event.target.value);
                update({ dailyWordGoal: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0 });
              }}
              hint="用于书架与概览的今日进度提醒"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
