"use client";

export type ThemeMode = "light" | "dark" | "system";
export const THEME_KEY = "yanfield:theme";

/** 界面字号档位。正文编辑区的字号另有设置（AppSettings.editorFontSize），两者互不影响。 */
export type UiFont = "standard" | "large" | "xlarge";
export const UI_FONT_KEY = "yanfield:ui-font";
export const UI_FONT_OPTIONS: UiFont[] = ["standard", "large", "xlarge"];

const themeRoots: HTMLElement[] = [];

/** 插件外壳把主题标在自己的节点上，不改 Harness 的 documentElement。 */
export function setThemeRoots(nodes: HTMLElement[]): void {
  themeRoots.splice(0, themeRoots.length, ...nodes);
}

export function applySurfaceDataset(name: "proseFont" | "motion" | "theme", value: string | null): void {
  const targets = themeRoots.length > 0 ? themeRoots : [document.documentElement];
  for (const element of targets) {
    if (value == null || value === "") delete element.dataset[name];
    else element.dataset[name] = value;
  }
}

export function readSurfaceTheme(): "light" | "dark" {
  const marked = themeRoots.find((element) => element.dataset.theme === "dark" || element.dataset.theme === "light");
  if (marked?.dataset.theme === "dark" || marked?.dataset.theme === "light") return marked.dataset.theme;
  return resolveTheme(getStoredTheme());
}
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  // DeepSeek Harness 把当前主题标在 document.body 上（data-ds-dark-theme）；
  // 插件跑在宿主里时要优先跟随宿主主题，而不是操作系统配色。
  const body = document.body;
  if (body) {
    if (body.hasAttribute("data-ds-dark-theme")) return true;
    if (body.hasAttribute("data-ds-light-theme")) return false;
    const bodyMarker = `${body.dataset.theme || ""} ${body.dataset.mode || ""} ${body.className}`;
    if (/\bdark\b/i.test(bodyMarker) && !/\blight\b/i.test(bodyMarker)) return true;
    if (/\blight\b/i.test(bodyMarker) && !/\bdark\b/i.test(bodyMarker)) return false;
  }
  const root = document.documentElement;
  const marker = `${root.dataset.theme || ""} ${root.dataset.mode || ""} ${root.className}`;
  if (/\bdark\b/i.test(marker)) return true;
  if (/\blight\b/i.test(marker) && !/\bdark\b/i.test(marker)) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 宿主主题变化时，让「跟随系统」的插件界面重新取一次色。 */
export function syncSurfaceTheme(): void {
  if (typeof window === "undefined") return;
  applyTheme(getStoredTheme(), false);
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "system" || raw === "light" ? raw : "system";
}

export function getStoredUiFont(): UiFont {
  if (typeof window === "undefined") return "standard";
  const raw = window.localStorage.getItem(UI_FONT_KEY);
  return raw === "large" || raw === "xlarge" ? raw : "standard";
}

/**
 * 界面字号只写一个 data-ui-font 属性，具体放大比例在 globals.css 里按档位算。
 * 缩小不提供：正文/资料本来就不宽裕，再压会更难读。
 */
export function applyUiFont(mode: UiFont, persist = true): void {
  if (typeof document === "undefined") return;
  const targets = themeRoots.length > 0 ? themeRoots : [];
  for (const element of targets) {
    if (mode === "standard") delete element.dataset.uiFont;
    else element.dataset.uiFont = mode;
  }
  if (persist) {
    try {
      window.localStorage.setItem(UI_FONT_KEY, mode);
    } catch {
      /* ignore */
    }
  }
}

export function applyTheme(mode: ThemeMode, persist = true): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  const targets = themeRoots.length > 0 ? themeRoots : [];
  for (const element of targets) {
    element.dataset.theme = resolved;
    element.style.colorScheme = resolved;
  }
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore */
    }
  }
}

/** 页面加载前内联执行，避免主题闪烁 */
export const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}")||"light";var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=m==="system"?(d?"dark":"light"):m;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;
