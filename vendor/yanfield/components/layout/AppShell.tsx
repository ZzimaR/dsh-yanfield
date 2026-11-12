"use client";

/**
 * AppShell — 全站外壳：左侧极简导航栏 + 作品内二级导航 + 主题切换。
 * 页面直接用 <AppShell novelId? active>{children}</AppShell>。
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { novelBackTarget } from "@/lib/app-nav";
import {
  ChevronLeft,
  CodeXml,
  LayoutDashboard,
  Library,
  Moon,
  PenLine,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { useApi } from "@/lib/client/api";
import type { Novel } from "@/lib/types";
import { applyTheme, getStoredTheme, resolveTheme, type ThemeMode } from "@/lib/ui/theme";
import { InkstoneMark } from "@/components/brand/InkstoneMark";
import { IconButton, Tooltip } from "@/components/ui/kit";
import { LinkPendingIcon } from "@/components/ui/LinkPendingIcon";

export type AppShellActive = "library" | "overview" | "outline" | "bible" | "archives" | "editor" | "settings";

const RAIL_ITEMS = [
  { key: "library", href: "/library", label: "书架", icon: Library },
  { key: "settings", href: "/settings", label: "设置", icon: Settings },
] as const;

function novelTabs(novelId: string) {
  return [
    { key: "overview", href: `/novel/${novelId}`, label: "概览", icon: LayoutDashboard },
    { key: "editor", href: `/editor/${novelId}`, label: "写作", icon: PenLine },
  ] as const;
}

function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void, boolean] {
  const [mode, setMode] = React.useState<ThemeMode>("light");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const stored = getStoredTheme();
    setMode(stored);
    applyTheme(stored, false);
    setMounted(true);
  }, []);

  const update = React.useCallback((next: ThemeMode) => {
    setMode(next);
    applyTheme(next, true);
  }, []);

  return [mode, update, mounted];
}

export function AppShell({
  novelId,
  active,
  children,
  flush = false,
}: {
  novelId?: string;
  active?: AppShellActive;
  children: React.ReactNode;
  /** 全高页面（编辑器）不套页面 padding、不出现整页滚动 */
  flush?: boolean;
}) {
  const pathname = usePathname();
  const back = novelId ? novelBackTarget(pathname, novelId) : null;
  const [mode, setMode, mounted] = useThemeMode();
  const { data: novel } = useApi<Novel>(novelId ? `/api/novels/${novelId}` : null);
  const resolved = mounted ? resolveTheme(mode) : "light";

  const toggleTheme = () => setMode(resolved === "dark" ? "light" : "dark");

  const openSettings = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("yanfield:open-settings"));
  };

  return (
    <div className={cn("flex bg-paper text-ink", flush ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      {/* 左侧极简导航 */}
      <nav
        className={cn(
          "sticky top-0 z-30 hidden h-dvh w-14 shrink-0 flex-col items-center border-r border-line bg-surface py-4 md:flex",
          flush && "h-dvh",
        )}
        aria-label="主导航"
      >
        <Link href="/" aria-label="砚田首页" className="mb-5 flex size-9 items-center justify-center rounded-md transition-transform duration-200 hover:scale-105">
          <InkstoneMark className="size-9" />
        </Link>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          {RAIL_ITEMS.map((item) => {
            const isActive =
              item.key === "library" ? pathname.startsWith("/library") || pathname.startsWith("/novel") || pathname.startsWith("/editor") : pathname === item.href;
            // 作品内页面时，书架高亮但点击仍回书架
            const icon = <item.icon className="size-[18px]" />;
            const itemClass = cn(
              "flex size-9 items-center justify-center rounded-md transition-colors duration-200",
              isActive ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
            );
            return (
              <Tooltip key={item.key} label={item.label} side="right">
                {item.key === "settings" ? (
                  <button type="button" aria-label={item.label} onClick={openSettings} className={itemClass}>
                    {icon}
                  </button>
                ) : (
                  <Link href={item.href} aria-label={item.label} className={itemClass}>
                    {icon}
                  </Link>
                )}
              </Tooltip>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <Tooltip label={resolved === "dark" ? "切换到宣纸主题" : "切换到夜航主题"} side="right">
            <IconButton label="切换主题" size="lg" onClick={toggleTheme}>
              {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
          </Tooltip>
          <Tooltip label="GitHub" side="right">
            <a
              href="https://github.com/ZzimaR/Yanfield"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub"
              className="flex size-9 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <CodeXml className="size-[18px]" />
            </a>
          </Tooltip>
        </div>
      </nav>

      {/* 移动端顶栏 */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-surface px-3 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <InkstoneMark className="size-6" />
          <span className="font-serif text-[15px] font-semibold">砚田</span>
        </Link>
        <div className="flex items-center gap-1">
          <IconButton label={resolved === "dark" ? "宣纸主题" : "夜航主题"} onClick={toggleTheme}>
            {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
          <Link href="/library" aria-label="书架" className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2">
            <Library className="size-4" />
          </Link>
          <button
            type="button"
            aria-label="设置"
            onClick={openSettings}
            className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", flush ? "h-dvh overflow-hidden" : "pt-12 md:pt-0")}>
        {novelId ? (
          <header className="sticky top-12 z-20 border-b border-line bg-paper/90 backdrop-blur md:top-0">
            <div className="flex h-12 items-center gap-2 px-3 md:px-5">
              <Link
                href={back?.href ?? "/library"}
                aria-label={back?.label ?? "返回书架"}
                className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <span className="min-w-0 truncate font-serif text-[15px] font-semibold text-ink">{novel?.title ?? "加载中…"}</span>
              {novel?.genre ? <span className="hidden shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-3 sm:inline">{novel.genre}</span> : null}
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href={`/editor/${novelId}`}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  <LinkPendingIcon className="size-3.5">
                    <PenLine className="size-3.5" />
                  </LinkPendingIcon>{" "}
                  继续写作
                </Link>
              </div>
            </div>
            <div className="scroll-thin flex items-center gap-0.5 overflow-x-auto px-2 md:px-4">
              {novelTabs(novelId).map((tab) => {
                const isActive = active === tab.key;
                return (
                  <Link
                    key={tab.key}
                    href={tab.href}
                    className={cn(
                      "relative inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13px] transition-colors",
                      isActive ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
                    )}
                  >
                    <tab.icon className="size-3.5" />
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </header>
        ) : null}

        <main className={cn("min-w-0 flex-1", flush ? "overflow-hidden" : "")}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
