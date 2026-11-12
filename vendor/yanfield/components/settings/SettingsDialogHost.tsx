"use client";

/**
 * 设置悬浮窗挂载点：监听 `yanfield:open-settings` 事件后打开 SettingsDialog。
 *
 * 用法（由 app/layout.tsx 挂载，在 ToastProvider 内、{children} 之后）：
 *   import SettingsDialogHost from "@/components/settings/SettingsDialogHost";
 *   <ToastProvider>{children}<SettingsDialogHost /></ToastProvider>
 *
 * 任何位置都可以这样打开设置（轻量入口，不打包设置组件）：
 *   import { openSettingsDialog } from "@/components/settings/open";
 *   openSettingsDialog();            // 打开并保持上次分区
 *   openSettingsDialog("providers"); // 直接定位到「模型服务」
 */

import * as React from "react";
import { isSettingsSectionKey, type SettingsSectionKey } from "./sections";
import { SettingsDialog } from "./SettingsDialog";
import { OPEN_SETTINGS_EVENT, type OpenSettingsDetail } from "./open";

export { OPEN_SETTINGS_EVENT, openSettingsDialog } from "./open";
export type { OpenSettingsDetail } from "./open";

/** 无 props，直接挂在根布局即可。 */
export function SettingsDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [section, setSection] = React.useState<SettingsSectionKey | undefined>(undefined);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenSettingsDetail | undefined>).detail;
      const next = detail?.section;
      setSection(typeof next === "string" && isSettingsSectionKey(next) ? next : undefined);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
  }, []);

  return <SettingsDialog open={open} onClose={() => setOpen(false)} section={section} />;
}

export default SettingsDialogHost;
