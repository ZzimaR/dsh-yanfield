"use client";

/**
 * 设置悬浮窗（马良式）：桌面居中浮层、移动端全屏。
 * 内容复用 components/settings 下现有分区组件，与 /settings 整页共用 sections.tsx 的定义。
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import { IconButton, Skeleton, useMounted } from "@/components/ui/kit";
import { Button } from "@/components/ui/kit";
import { useApi } from "@/lib/client/api";
import type { AppSettings } from "@/lib/types";
import { applySurfaceDataset } from "@/lib/ui/theme";
import { cn } from "@/lib/ui/cn";
import { yanfieldPortal } from "@/lib/ui/portal";
import { useYanfieldPanelBounds } from "@/lib/ui/hooks";
import {
  SETTINGS_SECTIONS,
  SettingsSaveStatus,
  SettingsSectionContent,
  type SettingsSectionKey,
} from "./sections";
import { useSettingsEditor } from "./useSettingsEditor";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** 打开时定位到某个分区；不传则保持上次位置。 */
  section?: SettingsSectionKey;
}

export function SettingsDialog({ open, onClose, section }: SettingsDialogProps) {
  const mounted = useMounted();
  const settingsApi = useApi<AppSettings>("/api/settings");
  const editor = useSettingsEditor(settingsApi.data, (value) => settingsApi.setData(value));
  const [active, setActive] = React.useState<SettingsSectionKey>("providers");
  const bounds = useYanfieldPanelBounds(open);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // 由外部事件指定分区打开
  React.useEffect(() => {
    if (open && section) setActive(section);
  }, [open, section]);

  // 正文字体设置即时生效到全站（globals.css 的 html[data-prose-font="sans"] 规则）
  const proseFont = editor.settings?.proseFont;
  React.useEffect(() => {
    if (proseFont) applySurfaceDataset("proseFont", proseFont);
  }, [proseFont]);

  // Esc 关闭 + 打开时锁滚动
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const dialogs = yanfieldPortal().querySelectorAll('[role="dialog"]');
      if (Array.from(dialogs).some((dialog) => dialog !== dialogRef.current)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const status = <SettingsSaveStatus editor={editor} />;
  return createPortal(
    <div
      className="@container/settings fixed z-50 bg-black/35 backdrop-blur-[2px] fade-in"
      style={
        bounds
          ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, right: "auto", bottom: "auto" }
          : { inset: 0 }
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pointer-events-none flex h-full justify-center @min-[720px]/settings:items-center @min-[720px]/settings:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="设置"
          className="rise-in pointer-events-auto flex h-full w-full flex-col overflow-hidden border-line bg-surface shadow-float @min-[720px]/settings:h-[82%] @min-[720px]/settings:max-w-5xl @min-[720px]/settings:rounded-xl @min-[720px]/settings:border"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Settings2 className="size-4 shrink-0 text-ink-3" aria-hidden />
              <h2 className="font-serif text-[17px] text-ink">设置</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status}
              <IconButton label="关闭设置" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col @min-[720px]/settings:flex-row">
            {/* 桌面端左侧分区导航 */}
            <aside className="scroll-thin hidden w-48 shrink-0 overflow-y-auto border-r border-line p-2.5 @min-[720px]/settings:block">
              <nav className="space-y-0.5" aria-label="设置分区">
                {SETTINGS_SECTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActive(item.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors",
                      active === item.key
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                    )}
                    aria-current={active === item.key ? "page" : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </nav>
              <p className="mt-4 px-2.5 text-[10.5px] leading-5 text-ink-3">
                设置是全局的；作品内的提示词与上下文可以在编辑器里单独覆盖。
              </p>
            </aside>

            <div className="border-b border-line px-4 py-2 @min-[720px]/settings:hidden">
              <select
                aria-label="设置分区"
                value={active}
                onChange={(event) => {
                  const section = SETTINGS_SECTIONS.find((item) => item.key === event.target.value);
                  if (section) setActive(section.key);
                }}
                className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink focus-visible:outline-accent"
              >
                {SETTINGS_SECTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>

            <div className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 @min-[720px]/settings:px-6 @min-[720px]/settings:py-5">
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
      </div>
    </div>,
    yanfieldPortal(),
  );
}
