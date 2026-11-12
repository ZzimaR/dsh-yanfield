"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/kit";
import { applyTheme, getStoredTheme, resolveTheme, type ThemeMode } from "@/lib/ui/theme";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "宣纸（浅色）",
  dark: "夜航（深色）",
  system: "跟随系统",
};

/** 三态主题切换：浅色 → 深色 → 跟随系统。 */
export function ThemeToggle() {
  const [mode, setMode] = React.useState<ThemeMode>("system");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMode(getStoredTheme());
    setMounted(true);
  }, []);

  const cycle = React.useCallback(() => {
    setMode((prev) => {
      const next = NEXT_MODE[prev];
      applyTheme(next);
      return next;
    });
  }, []);

  const icon = resolveTheme(mode) === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />;
  const fallback = mode === "system" ? <Monitor className="size-4" /> : icon;

  return (
    <IconButton
      label={`主题：${mounted ? MODE_LABEL[mode] : "跟随系统"}（点击切换）`}
      size="lg"
      onClick={cycle}
      className="text-ink-3 hover:text-ink"
    >
      {mounted ? fallback : <span className="size-4" aria-hidden />}
    </IconButton>
  );
}
