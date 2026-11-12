/**
 * 打开设置悬浮窗的轻量入口（不引入 SettingsDialog 组件本身）。
 *
 * 任何客户端组件都可以：
 *   import { openSettingsDialog } from "@/components/settings/open";
 *   openSettingsDialog();            // 打开并保持上次分区
 *   openSettingsDialog("providers"); // 直接定位到「模型服务」
 */
import type { SettingsSectionKey } from "./sections";

/** 打开设置悬浮窗的全局事件名。 */
export const OPEN_SETTINGS_EVENT = "yanfield:open-settings";

export interface OpenSettingsDetail {
  section?: SettingsSectionKey;
}

/** 在任意客户端组件里打开设置悬浮窗。 */
export function openSettingsDialog(section?: SettingsSectionKey): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: { section } }));
}
