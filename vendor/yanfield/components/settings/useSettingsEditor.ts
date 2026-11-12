"use client";

/**
 * 设置页的本地编辑 + 自动保存 hook：
 * - update() 先乐观更新本地状态，600ms 内合并多次改动后 PATCH /api/settings；
 * - 深合并语义与后端一致（defaultContext / models / customAgent）；
 * - 暴露 dirty / saving / saveError / lastSavedAt 供页面提示"未保存改动"。
 */

import * as React from "react";
import { apiPatch, notifyDataChanged } from "@/lib/client/api";
import { useToast } from "@/components/ui/kit";
import type { AppSettings } from "@/lib/types";
import { mergePatches, mergeSettings } from "./settings-utils";

export interface SettingsEditor {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
  saveNow: () => Promise<void>;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  lastSavedAt: number | null;
}

const SAVE_DELAY_MS = 600;

export function useSettingsEditor(server: AppSettings | undefined, setServer: (value: AppSettings) => void): SettingsEditor {
  const [local, setLocal] = React.useState<AppSettings | undefined>(server);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const pending = React.useRef<Partial<AppSettings>>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(true);
  const { toast } = useToast();

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  React.useEffect(() => {
    setLocal((previous) => previous ?? server);
  }, [server]);

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiPatch<AppSettings>("/api/settings", patch);
      if (!mounted.current) return;
      setLocal(updated);
      setServer(updated);
      setDirty(false);
      setLastSavedAt(Date.now());
      notifyDataChanged("settings");
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error ? cause.message : "保存设置失败";
      setSaveError(message);
      setDirty(true);
      toast({ title: "设置保存失败", description: message, tone: "error" });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [setServer, toast]);

  const update = React.useCallback(
    (patch: Partial<AppSettings>) => {
      setLocal((previous) => (previous ? mergeSettings(previous, patch) : previous));
      pending.current = mergePatches(pending.current, patch);
      setDirty(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, SAVE_DELAY_MS);
    },
    [flush],
  );

  return { settings: local, update, saveNow: flush, dirty, saving, saveError, lastSavedAt };
}
