"use client";

import * as React from "react";
import AppShell from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/kit";
import { Button } from "@/components/ui/kit";
import { useApi } from "@/lib/client/api";
import type { AppSettings } from "@/lib/types";
import { applySurfaceDataset } from "@/lib/ui/theme";
import { cn } from "@/lib/ui/cn";
import {
  SETTINGS_SECTIONS,
  SettingsSaveStatus,
  SettingsSectionContent,
  type SettingsSectionKey,
} from "@/components/settings/sections";
import { useSettingsEditor } from "@/components/settings/useSettingsEditor";

export default function SettingsPage() {
  const settingsApi = useApi<AppSettings>("/api/settings");
  const editor = useSettingsEditor(settingsApi.data, (value) => settingsApi.setData(value));
  const [active, setActive] = React.useState<SettingsSectionKey>("providers");

  // 正文字体设置生效到全站（globals.css 的 html[data-prose-font="sans"] 规则）
  const proseFont = editor.settings?.proseFont;
  React.useEffect(() => {
    if (proseFont) applySurfaceDataset("proseFont", proseFont);
  }, [proseFont]);

  React.useEffect(() => {
    if (!editor.dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  const activeMeta = SETTINGS_SECTIONS.find((item) => item.key === active) ?? SETTINGS_SECTIONS[0];

  return (
    <AppShell active="settings">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-[24px] leading-tight text-ink sm:text-[28px]">设置</h1>
            <p className="mt-1 text-[12px] leading-6 text-ink-3">
              模型、提示词与写作偏好都只保存在本机。{activeMeta.description}。
            </p>
          </div>
          <div className="pb-0.5">
            <SettingsSaveStatus editor={editor} />
          </div>
        </header>

        <div className="mt-5 grid gap-6 lg:grid-cols-[196px_minmax(0,1fr)]">
          {/* 桌面端左侧竖向导航 */}
          <aside className="hidden lg:block">
            <nav className="sticky top-6 space-y-0.5" aria-label="设置分区">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12.5px] transition-colors",
                    active === section.key
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                  )}
                  aria-current={active === section.key ? "page" : undefined}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
            </nav>
            <p className="mt-5 px-3 text-[10.5px] leading-5 text-ink-3">
              提示：设置是全局的；作品内的提示词与上下文可以在编辑器里单独覆盖。
            </p>
          </aside>

          {/* 移动端横向分区 Tab */}
          <div className="lg:hidden">
            <div className="flex flex-wrap gap-1.5">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                    active === section.key
                      ? "border-accent/40 bg-accent-soft font-medium text-accent"
                      : "border-line bg-surface text-ink-3",
                  )}
                  aria-current={active === section.key ? "page" : undefined}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            {settingsApi.loading && !editor.settings ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : settingsApi.error ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 text-center">
                <p className="text-[12.5px] text-danger">设置加载失败：{settingsApi.error}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => void settingsApi.refresh()}>
                  重试
                </Button>
              </div>
            ) : (
              <SettingsSectionContent active={active} settings={editor.settings} update={editor.update} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
