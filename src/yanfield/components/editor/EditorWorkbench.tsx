"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { novelBackTarget } from "@/lib/app-nav";
import type { Editor } from "@tiptap/react";
import { Feather, Plus } from "lucide-react";
import { Button, ConfirmDialog, EmptyState, Sheet, useToast } from "@/components/ui/kit";
import { AiTaskBar } from "@/components/ai/AiTaskBar";
import { apiGet, apiPatch, useApi } from "@/lib/client/api";
import { EditorBridgeProvider } from "@/lib/editor/bridge";
import { HAND_OFF_EVENT } from "@/lib/editor/hand-off";
import { emitFocusAi } from "@/lib/editor/events";
import { isSaveShortcut, navigateAfterSaving, useEditorSaveGuard } from "@/lib/editor/navigation";
import { toOne } from "@/lib/editor/normalize";
import { readEditorLayoutSettings } from "@/lib/editor/settings";
import { findChapter, findVolumeOfChapter, flattenChapters } from "@/lib/editor/types";
import type { ChapterPatch, SelectionInfo } from "@/lib/editor/types";
import { useChapterContent } from "@/lib/editor/useChapterContent";
import { useChapterDraft } from "@/lib/editor/useChapterDraft";
import { useEditorBridgeValue } from "@/lib/editor/useEditorBridgeValue";
import { useNovelTree } from "@/lib/editor/useNovelTree";
import { cn } from "@/lib/ui/cn";
import { useT } from "@/lib/i18n";
import { useHotkeys, useLocalStorageState, useResizePanel, useYanfieldPanelBounds } from "@/lib/ui/hooks";
import { applySurfaceDataset, applyTheme, readSurfaceTheme } from "@/lib/ui/theme";
import type { AppSettings, Chapter } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { stashPendingCodexCard } from "./CodexPanel";
import {
  autoReviewChange,
  reviewKey,
  updateAgentReview,
  type AgentReviewState,
} from "@/lib/editor/agent-review";
import { AGENT_UPDATED } from "@/lib/ai/agent/client";
import type { AgentRun } from "@/lib/ai/agent/types";
import { EditorCanvas, type ChapterEditorPosition } from "./EditorCanvas";
import { EditorHeader, type EditorTheme } from "./EditorHeader";
import { EditorRightRail } from "./EditorRightRail";
import { EditorErrorBoundary } from "./EditorErrorBoundary";
import { EditorError, EditorLoading, EditorNotFound } from "./EditorStates";
import { LeftPanel, type EditorLeftTab } from "./LeftPanel";

const EMPTY_SELECTION: SelectionInfo = { text: "", from: 0, to: 0, empty: true };

interface EditorWorkbenchProps {
  novelId: string;
  initialChapterId?: string | null;
}

/**
 * 写作台总编排。
 * 职责：目录树 + 章节草稿 + 自动保存 + EditorBridge 注入 + 三栏布局 +
 * 沉浸模式 + 主题 + 快捷键 + 各种加载/错误态。
 */
export function EditorWorkbench({ novelId, initialChapterId = null }: EditorWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  /** 插件自己的查询串（不是 window.location 那份）：切回界面时就是按它恢复的 */
  const searchString = useSearchParams().toString();
  const { toast } = useToast();
  const tr = useT();
  const saveGuard = useEditorSaveGuard();

  /* ---------------- 视图偏好（localStorage） ---------------- */

  const [tab, setTab] = useLocalStorageState<EditorLeftTab>(`yanfield:editor:tab:${novelId}`, "toc");
  const [leftOpen, setLeftOpen] = useLocalStorageState<boolean>("yanfield:editor:left-open", true);
  const [rightOpen, setRightOpen] = useLocalStorageState<boolean>("yanfield:editor:right-open", true);
  const [immersive, setImmersive] = useLocalStorageState<boolean>("yanfield:editor:immersive", false);
  /** 记住上次打开的章节（换作品时用新 key，互不干扰） */
  const [chapterId, setChapterId] = useLocalStorageState<string | null>(
    `yanfield:editor:chapter:${novelId}`,
    null,
  );
  const [initialChapterPending, setInitialChapterPending] = React.useState(Boolean(initialChapterId));

  const [theme, setTheme] = React.useState<EditorTheme>("light");
  const [selection, setSelection] = React.useState<SelectionInfo>(EMPTY_SELECTION);
  const [mountedEditor, setMountedEditor] = React.useState<{ instance: Editor; chapterId: string } | null>(null);

  /* ---------------- 响应式断点 ----------------
   * ≥768：左栏内联（可拖宽/折叠）；<768：左栏改为 header 按钮唤起的抽屉
   * ≥1024：AI 面板内联；<1024：AI 面板改为抽屉，不挤压正文
   */
  const panelWidth = useYanfieldPanelBounds()?.width ?? 0;
  const isDesktop = panelWidth >= 768;
  const isWide = panelWidth >= 1024;
  const [drawerLeftOpen, setDrawerLeftOpen] = React.useState(false);
  const [drawerRightOpen, setDrawerRightOpen] = React.useState(false);
  /** ⌘K 命令面板 */
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  /* ---------------- 应用设置（字号/行高/自动保存策略） ---------------- */

  const settingsApi = useApi<unknown>("/api/settings");
  const settings = toOne<AppSettings>(settingsApi.data);
  const fontSize = settings?.editorFontSize ?? 18;
  const lineHeight = settings?.editorLineHeight ?? 1.95;
  const firstLineIndent = settings?.firstLineIndent ?? true;
  const proseFont = settings?.proseFont ?? "serif";
  const autoSaveDelayMs = settings?.autoSaveDelayMs ?? 1200;
  const autoSave = settings?.autoSave ?? true;

  /** 排版：字重 / 字距 / 段间距 / 页边距 / 阅读宽度 / 状态条 / 动效 */
  const editorLayout = readEditorLayoutSettings(settings);

  /** 正文字体（设置页可切换）：sans 时由 globals.css 的 html[data-prose-font="sans"] 规则接管 */
  React.useEffect(() => {
    applySurfaceDataset("proseFont", proseFont === "sans" ? "sans" : null);
  }, [proseFont]);

  /** 动效开关：关闭时给根节点打 data-motion="off"，由 globals.css 收敛动画/过渡 */
  React.useEffect(() => {
    applySurfaceDataset("motion", editorLayout.motionEnabled ? "on" : "off");
    return () => {
      applySurfaceDataset("motion", null);
    };
  }, [editorLayout.motionEnabled]);

  /* ---------------- 目录树 ---------------- */

  /**
   * 目录树只认「进入写作台那一刻」的深链章节。
   * 下面会把当前章写回路由，initialChapterId 因而会随换章变化；
   * 若直接透传，useNovelTree 的 load 依赖它，每次换章都会整树重载 —— 这里冻结住。
   */
  const treeInitialChapterId = React.useRef(initialChapterId).current;

  const onTreeError = React.useCallback(
    (message: string) => {
      toast({ title: tr("操作失败"), description: message, tone: "error" });
    },
    [toast, tr],
  );
  const onTreeSuccess = React.useCallback(
    (message: string) => {
      toast({ title: message, tone: "success" });
    },
    [toast],
  );

  const { tree, initialChapter, loading, error, notFound, actions } = useNovelTree({
    novelId,
    initialChapterId: treeInitialChapterId,
    onError: onTreeError,
    onSuccess: onTreeSuccess,
  });

  const chapters = React.useMemo(() => flattenChapters(tree), [tree]);
  const chapterMeta = React.useMemo(() => findChapter(tree, chapterId), [tree, chapterId]);
  const chapterRequestId = initialChapterPending ? initialChapter?.id ?? null : chapterMeta?.id ?? null;
  const chapterApi = useChapterContent(chapterRequestId, initialChapter);
  // Never show the previous request's body while switching chapters.
  const chapter = React.useMemo(() => chapterMeta && chapterApi.data?.id === chapterMeta.id
    ? { ...chapterApi.data, ...chapterMeta, content: chapterApi.data.content }
    : null, [chapterMeta, chapterApi.data]);
  const volume = React.useMemo(() => findVolumeOfChapter(tree, chapterId), [tree, chapterId]);

  /** 当前章在全书顺序中的下标（-1 = 不在目录里，例如尚未加载/新建中） */
  const chapterIndex = React.useMemo(() => chapters.findIndex((item) => item.id === chapterId), [chapters, chapterId]);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  const searchParams = new URLSearchParams(searchString);
  const linkedChapterId = (searchParams.get("chapterId") ?? searchParams.get("chapter"))?.trim() || null;
  const linkedTab = searchParams.get("tab");
  const routeRef = React.useRef({ router, pathname, searchString });
  routeRef.current = { router, pathname, searchString };
  const appliedTabLink = React.useRef<string | null>(null);
  const seenChapterLink = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!linkedTab) {
      appliedTabLink.current = null;
      return;
    }
    if (!panelWidth || appliedTabLink.current === linkedTab) return;
    appliedTabLink.current = linkedTab;
    const tab = linkedTab === "bible" ? "codex" : linkedTab;
    if (tab === "toc" || tab === "outline" || tab === "codex" || tab === "archives") {
      setTab(tab);
      if (isDesktop) setLeftOpen(true);
      else setDrawerLeftOpen(true);
    }
    const route = routeRef.current;
    const params = new URLSearchParams(route.searchString);
    params.delete("tab");
    route.searchString = params.toString();
    route.router.replace(route.searchString ? `${route.pathname}?${route.searchString}` : route.pathname);
  }, [linkedTab, panelWidth, isDesktop, setTab, setLeftOpen]);

  React.useEffect(() => {
    if ((tab as string) === "research") setTab("archives");
  }, [tab, setTab]);

  const syncChapterRoute = React.useCallback((id: string | null) => {
    seenChapterLink.current = id;
    const route = routeRef.current;
    const params = new URLSearchParams(route.searchString);
    params.delete("chapter");
    if (id) params.set("chapterId", id);
    else params.delete("chapterId");
    const query = params.toString();
    if (query !== route.searchString) {
      route.searchString = query;
      route.router.replace(query ? `${route.pathname}?${query}` : route.pathname);
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("chapterId") !== id || url.searchParams.has("chapter")) {
      url.searchParams.delete("chapter");
      if (id) url.searchParams.set("chapterId", id);
      else url.searchParams.delete("chapterId");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  /* ---------------- 章节草稿 + 自动保存 ---------------- */

  const onSaveError = React.useCallback(
    (message: string) => {
      toast({ title: tr("保存失败"), description: message, tone: "error", duration: 6000 });
    },
    [toast, tr],
  );
  const onRecoveryError = React.useCallback(
    (message: string) => {
      toast({ title: tr("临时草稿提示"), description: message, tone: "error", duration: 8000 });
    },
    [toast, tr],
  );

  /** 真正落库：PATCH 成功后把结果同步回目录树（不整树刷新，避免打断写作） */
  const persistChapter = React.useCallback(
    async (id: string, patch: ChapterPatch): Promise<void> => {
      const { title, ...rest } = patch;
      const trimmedTitle = title?.trim();
      if (title !== undefined && !trimmedTitle) throw new Error(tr("章节标题不能为空，请填写标题后保存。"));
      const safePatch: ChapterPatch = trimmedTitle === undefined ? rest : { ...rest, title: trimmedTitle };
      const updated = await saveGuard.runExclusive(id, () =>
        apiPatch<Partial<Chapter>>(`/api/chapters/${id}`, safePatch),
      );
      actions.patchChapterLocal(id, {
        ...(updated ?? {}),
        ...safePatch,
        updatedAt: updated?.updatedAt ?? new Date().toISOString(),
      });
    },
    [actions, saveGuard, tr],
  );

  const {
    draft,
    saveState,
    lastSavedAt,
    hasUnsaved,
    hasUnsavedNow,
    recoveryDraft,
    restoreRecovery,
    discardRecovery,
    setTitle,
    setContent,
    setStatus,
    flush,
    adoptSaved,
  } = useChapterDraft({
    chapter,
    delayMs: autoSaveDelayMs,
    autoSave,
    onPersist: persistChapter,
    onError: onSaveError,
    onRecoveryError,
  });

  React.useEffect(() => saveGuard.register(flush), [saveGuard, flush]);

  const saveChapter = React.useCallback(() => {
    void flush().catch((error) => {
      console.error("[yanfield] 手动保存失败:", error);
    });
  }, [flush]);

  // 切章瞬间 draft 还停留在上一章，用 chapterId 对齐后再驱动 UI，避免标题/字数闪一下
  const activeDraft = draft && chapter && draft.chapterId === chapter.id ? draft : null;
  const activeRecovery = recoveryDraft && chapter && recoveryDraft.chapterId === chapter.id ? recoveryDraft : null;
  const [discardRecoveryOpen, setDiscardRecoveryOpen] = React.useState(false);
  const [discardRecoveryLoading, setDiscardRecoveryLoading] = React.useState(false);
  React.useEffect(() => setDiscardRecoveryOpen(false), [chapterId]);
  const useSavedVersion = React.useCallback(async () => {
    if (!chapter || !activeRecovery) return;
    setDiscardRecoveryLoading(true);
    try {
      const saved = await saveGuard.runExclusive(chapter.id, () => apiGet<Chapter>(`/api/chapters/${chapter.id}`));
      adoptSaved(saved);
      actions.patchChapterLocal(saved.id, saved);
      discardRecovery();
      setDiscardRecoveryOpen(false);
    } catch (error) {
      toast({
        title: tr("读取已保存章节失败"),
        description: error instanceof Error ? error.message : tr("请稍后重试。"),
        tone: "error",
      });
    } finally {
      setDiscardRecoveryLoading(false);
    }
  }, [chapter, activeRecovery, saveGuard, adoptSaved, actions, discardRecovery, toast, tr]);

  const chapterSelection = React.useRef(0);
  const chapterPositions = React.useRef(new Map<string, ChapterEditorPosition>());
  const selectChapter = React.useCallback(async (nextId: string): Promise<boolean> => {
    const selection = ++chapterSelection.current;
    try {
      if (nextId !== chapterId) {
        await flush();
        if (selection !== chapterSelection.current) return false;
        setChapterId(nextId);
      }
      syncChapterRoute(nextId);
      setDrawerLeftOpen(false);
      return true;
    } catch {
      return false;
    }
  }, [chapterId, flush, setChapterId, syncChapterRoute]);

  const initializedChapter = React.useRef(false);
  React.useEffect(() => {
    if (!tree) return;
    const hasChapter = (id: string | null) => chapters.some((item) => item.id === id);
    if (!initializedChapter.current) {
      initializedChapter.current = true;
      seenChapterLink.current = linkedChapterId;
      const initial = hasChapter(linkedChapterId) ? linkedChapterId
        : hasChapter(chapterId) ? chapterId : chapters[0]?.id ?? null;
      setChapterId(initial);
      setInitialChapterPending(false);
      syncChapterRoute(initial);
      return;
    }
    if (linkedChapterId !== seenChapterLink.current) {
      seenChapterLink.current = linkedChapterId;
      if (linkedChapterId && hasChapter(linkedChapterId) && linkedChapterId !== chapterId) {
        void selectChapter(linkedChapterId).then((selected) => {
          const params = new URLSearchParams(routeRef.current.searchString);
          if (!selected && (params.get("chapterId") ?? params.get("chapter")) === linkedChapterId) {
            syncChapterRoute(chapterId);
          }
        });
        return;
      }
    }
    if (!hasChapter(chapterId)) {
      const fallback = chapters[0]?.id ?? null;
      if (fallback !== chapterId) setChapterId(fallback);
      syncChapterRoute(fallback);
    }
  }, [tree, chapters, chapterId, linkedChapterId, selectChapter, setChapterId, syncChapterRoute]);

  /* ---------------- EditorBridge：把编辑器能力注入整页 ---------------- */

  const handleEditorReady = React.useCallback((instance: Editor | null, id: string | null) => {
    setMountedEditor(current => instance && id ? { instance, chapterId: id } : current?.chapterId === id ? null : current);
  }, []);
  const editor = mountedEditor?.chapterId === chapterId ? mountedEditor?.instance ?? null : null;
  const rawBridge = useEditorBridgeValue(editor);
  const currentChapterRef = React.useRef(chapterId);
  currentChapterRef.current=chapterId;
  const bridge = React.useMemo(() => rawBridge ? {
    ...rawBridge, getChapterId:()=>chapterId, flush,
    setReadOnly:(locked:boolean)=>editor?.setEditable(!locked,false),
    syncSaved:(saved:Chapter)=>{
      if(currentChapterRef.current!==saved.id)return;
      adoptSaved(saved); actions.patchChapterLocal(saved.id,saved);
      editor?.commands.setContent(saved.content||"<p></p>",{emitUpdate:false});
    },
  } : null,[rawBridge,flush,adoptSaved,actions,editor,chapterId]);
  /* ---------------- 正文改动审阅：手动入口 + 自动打开 ---------------- */

  /** 已自动打开或已被作者关闭的审阅，key = `${run.id}:${change.id}`；关闭过的改动不会再弹。 */
  const seenReviewKeysRef = React.useRef(new Set<string>());
  /** 审阅状态与 ref 同步：事件监听读 ref，避免 state 变化导致监听器反复重挂。 */
  const reviewRef = React.useRef<AgentReviewState | null>(null);
  const [review, setReviewState] = React.useState<AgentReviewState | null>(null);
  const setReview = React.useCallback((next: AgentReviewState | null) => {
    reviewRef.current = next;
    setReviewState(next);
  }, []);
  /** 自动打开的请求在途标记，避免同一批事件重复拉取。 */
  const openingReviewRef = React.useRef(false);
  const novelIdRef = React.useRef(novelId);
  novelIdRef.current = novelId;

  /** 手动「在正文中审阅改动」与自动打开共用同一条打开序列。 */
  const openReview = React.useCallback(async (run: AgentRun, changeId: string, onlyIfPending: boolean) => {
    await flush();
    const latest = await apiGet<AgentRun>(`/api/ai/agent/${run.id}?novelId=${encodeURIComponent(novelId)}`);
    const change = latest.changes.find(c => c.id === changeId);
    if (!change) return;
    // 自动打开只在候选仍待确认时进行：已经应用/丢弃的改动交给手动入口查看历史。
    if (onlyIfPending && change.state !== "pending") return;
    await actions.refresh();
    const targetChapter = change.appliedId || change.targetId;
    if (targetChapter) {
      setChapterId(targetChapter);
      syncChapterRoute(targetChapter);
    }
    setReview({ run: latest, changeId });
  }, [actions, flush, novelId, setChapterId, setReview, syncChapterRoute]);
  const openReviewRef = React.useRef(openReview);
  React.useEffect(() => { openReviewRef.current = openReview; });

  /** 关闭审阅即视为「看过」：之后即使该改动仍待确认也不会自动弹出。 */
  const closeReview = React.useCallback(() => {
    const current = reviewRef.current;
    if (current) seenReviewKeysRef.current.add(reviewKey(current.run.id, current.changeId));
    setReview(null);
  }, [setReview]);

  React.useEffect(() => {
    const open = (event: Event) => {
      const value = (event as CustomEvent<{ run: AgentRun; changeId: string }>).detail;
      if (value.run.novelId !== novelId) return;
      void openReviewRef.current(value.run, value.changeId, false).catch(() => {});
    };
    const navigate = (event: Event) => {
      const value = (event as CustomEvent<{ kind: string; id: string; novelId?: string }>).detail;
      if (value.novelId && value.novelId !== novelId) return;
      if (value.kind === "character" || value.kind === "world" || value.kind === "location" || value.kind === "foreshadow") {
        const pending = { novelId, id: value.id, kind: value.kind } as const;
        stashPendingCodexCard(pending);
        setTab("codex");
        if (isDesktop) setLeftOpen(true);
        else setDrawerLeftOpen(true);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("yanfield:open-card", { detail: pending })), 0);
        return;
      }
      if (value.kind === "chapter" || value.kind === "blueprint") {
        setReview(null);
        // A newly applied chapter may not be in the stale directory yet. Refresh before
        // selecting it, otherwise the missing-chapter fallback sends the author to chapter one.
        void flush().then(() => actions.refresh()).then(() => {
          setChapterId(value.id);
          syncChapterRoute(value.id);
        }).catch(() => {});
      }
      if (value.kind === "outline" || value.kind === "volume-outline" || value.kind === "blueprint") {
        setTab("outline");
        setLeftOpen(true);
      }
    };
    window.addEventListener("yanfield:agent-review", open);
    window.addEventListener("yanfield:agent-navigate", navigate);
    return () => {
      window.removeEventListener("yanfield:agent-review", open);
      window.removeEventListener("yanfield:agent-navigate", navigate);
    };
  }, [novelId, flush, setChapterId, actions, setReview, setTab, setLeftOpen, isDesktop, syncChapterRoute]);

  // 助手一改完正文（任务进入 ready 且有待确认正文候选），直接把内联 diff 打开在写作区，
  // 不再要求作者先点卡片里的「在正文中审阅改动」。已关闭/已打开过的改动不会重复弹出。
  React.useEffect(() => {
    const updated = (event: Event) => {
      const nextRun = (event as CustomEvent<AgentRun>).detail;
      // Applying from either the card or inline review must leave the author in the editable chapter.
      const next = updateAgentReview(reviewRef.current, nextRun);
      if (next !== reviewRef.current) setReview(next);
      if (nextRun.status !== "ready" || nextRun.novelId !== novelIdRef.current) return;
      // 不抢占已经打开的内联审阅，也不在别的作品里弹窗。
      if (reviewRef.current || openingReviewRef.current) return;
      const change = autoReviewChange(nextRun, seenReviewKeysRef.current, currentChapterRef.current);
      if (!change) return;
      seenReviewKeysRef.current.add(reviewKey(nextRun.id, change.id));
      openingReviewRef.current = true;
      void openReviewRef.current(nextRun, change.id, true)
        .catch(() => {})
        .finally(() => { openingReviewRef.current = false; });
    };
    window.addEventListener(AGENT_UPDATED, updated);
    return () => window.removeEventListener(AGENT_UPDATED, updated);
  }, [setReview]);

  // 审阅绑定章节：切到别的章节就收起，避免旧稿 diff 盖住当前正文。
  React.useEffect(() => {
    if (!review) return;
    const change = review.run.changes.find(item => item.id === review.changeId);
    const target = change?.appliedId || change?.targetId;
    if (target && target !== chapterId) closeReview();
  }, [chapterId, review, closeReview]);

  /* ---------------- 主题 ---------------- */

  React.useEffect(() => {
    setTheme(readSurfaceTheme());
  }, []);

  const toggleTheme = React.useCallback(() => {
    const current: EditorTheme = readSurfaceTheme();
    const next: EditorTheme = current === "dark" ? "light" : "dark";
    applyTheme(next, true);
    setTheme(next);
  }, []);

  // 浏览器标签页标题跟着作品走
  React.useEffect(() => {
    if (!tree?.novel.title) return;
    document.title = `${tree.novel.title} · ${tr("写作台")}`;
  }, [tree?.novel.title, tr]);

  /* ---------------- 三栏 / 沉浸 ---------------- */

  const leftPanel = useResizePanel(288, { min: 240, max: 320, side: "left" });
  const rightPanel = useResizePanel(384, { min: 320, max: 480, side: "right" });

  /** 左栏：桌面折叠/展开内联栏；窄屏切换抽屉 */
  const toggleLeft = React.useCallback(() => {
    if (isDesktop) setLeftOpen((prev) => !prev);
    else setDrawerLeftOpen((prev) => !prev);
  }, [isDesktop, setLeftOpen]);
  /** 右栏：宽屏折叠/展开内联 AI 栏；窄屏切换 AI 抽屉 */
  const toggleRight = React.useCallback(() => {
    if (isWide) setRightOpen((prev) => !prev);
    else setDrawerRightOpen((prev) => !prev);
  }, [isWide, setRightOpen]);
  const toggleImmersive = React.useCallback(() => {
    setImmersive((prev) => {
      const next = !prev;
      if (next) {
        setRightOpen(false);
        setDrawerRightOpen(false);
        setDrawerLeftOpen(false);
      }
      return next;
    });
  }, [setImmersive, setRightOpen]);
  const exitImmersive = React.useCallback(() => setImmersive(false), [setImmersive]);

  /** AI 面板在当前断点下是否可见 */
  const aiPanelVisible = isWide ? rightOpen : drawerRightOpen;

  /** AI 面板聚焦：面板已展开时直接广播；未展开时先展开，等面板挂载后再广播 */
  const pendingAiFocusRef = React.useRef(false);
  const requestAiFocus = React.useCallback(() => {
    if (aiPanelVisible) {
      emitFocusAi();
      return;
    }
    pendingAiFocusRef.current = true;
    if (isWide) setRightOpen(true);
    else setDrawerRightOpen(true);
  }, [aiPanelVisible, isWide, setRightOpen]);

  React.useEffect(() => {
    if (!aiPanelVisible || !pendingAiFocusRef.current) return;
    pendingAiFocusRef.current = false;
    const timer = window.setTimeout(() => emitFocusAi(), 120);
    return () => window.clearTimeout(timer);
  }, [aiPanelVisible]);

  React.useEffect(()=>{
    window.addEventListener(HAND_OFF_EVENT,requestAiFocus);
    return()=>window.removeEventListener(HAND_OFF_EVENT,requestAiFocus);
  },[requestAiFocus]);

  const back = novelBackTarget(pathname, novelId);
  const navigate = React.useCallback((href: string) => {
    void navigateAfterSaving(flush, () => router.push(href)).catch((error) => {
      toast({
        title: tr("未能离开写作台"),
        description: error instanceof Error ? error.message : tr("请检查保存状态后重试。"),
        tone: "error",
      });
    });
  }, [flush, router, toast, tr]);
  const goBack = React.useCallback(() => navigate(back.href), [navigate, back.href]);
  const goOverview = React.useCallback(() => navigate(`/novel/${novelId}`), [navigate, novelId]);

  /* ---------------- 快捷键 ---------------- */

  /** 打开左栏某个页签（桌面展开内联栏 / 窄屏打开抽屉） */
  const openLeftTab = React.useCallback(
    (next: EditorLeftTab) => {
      setTab(next);
      if (isDesktop) setLeftOpen(true);
      else setDrawerLeftOpen(true);
    },
    [isDesktop, setTab, setLeftOpen],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      saveChapter();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [saveChapter]);

  useHotkeys(
    {
      // 聚焦 AI 输入框（Ctrl/Cmd+J 被浏览器占用为下载页，改用 Alt+J）
      "alt+j": (event) => {
        event.preventDefault();
        requestAiFocus();
      },
      // 左栏 / 右栏 / 沉浸
      "alt+1": (event) => {
        event.preventDefault();
        toggleLeft();
      },
      "alt+2": (event) => {
        event.preventDefault();
        toggleRight();
      },
      "alt+3": (event) => {
        event.preventDefault();
        toggleImmersive();
      },
      // 直达左栏四个页签（浏览器保留 Ctrl/Cmd+1..9，改用 mod+shift+数字）
      "mod+shift+1": (event) => {
        event.preventDefault();
        openLeftTab("toc");
      },
      "mod+shift+2": (event) => {
        event.preventDefault();
        openLeftTab("outline");
      },
      "mod+shift+3": (event) => {
        event.preventDefault();
        openLeftTab("codex");
      },
      "mod+shift+4": (event) => {
        event.preventDefault();
        openLeftTab("archives");
      },
      // 命令面板
      "mod+k": (event) => {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      },
      // Esc 退出沉浸 / 关闭抽屉（useHotkeys 的 key 是 event.key.toLowerCase()）
      esc: () => {
        if (drawerRightOpen) setDrawerRightOpen(false);
        else if (drawerLeftOpen) setDrawerLeftOpen(false);
        else if (immersive) exitImmersive();
      },
      escape: () => {
        if (drawerRightOpen) setDrawerRightOpen(false);
        else if (drawerLeftOpen) setDrawerLeftOpen(false);
        else if (immersive) exitImmersive();
      },
    },
    [flush, requestAiFocus, toggleLeft, toggleRight, toggleImmersive, immersive, exitImmersive, drawerLeftOpen, drawerRightOpen, openLeftTab],
  );

  /* ---------------- 离开页面提示 ---------------- */

  React.useEffect(() => {
    if (!hasUnsaved) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedNow()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsaved, hasUnsavedNow]);

  React.useEffect(() => {
    const openPanel = (event: Event) => {
      const next = (event as CustomEvent<{ tab?: EditorLeftTab }>).detail?.tab;
      if (next !== "toc" && next !== "outline" && next !== "codex" && next !== "archives") return;
      openLeftTab(next);
    };
    const openAi = () => {
      if (isWide) setRightOpen(true);
      else setDrawerRightOpen(true);
    };
    window.addEventListener("yanfield:editor-panel", openPanel);
    window.addEventListener("yanfield:hand-off", openAi);
    return () => {
      window.removeEventListener("yanfield:editor-panel", openPanel);
      window.removeEventListener("yanfield:hand-off", openAi);
    };
  }, [isWide, openLeftTab]);

  /* ---------------- 渲染 ---------------- */

  if (loading && !tree) return <EditorLoading />;
  if (notFound) return <EditorNotFound />;
  if (error && !tree) return <EditorError message={error} onRetry={() => void actions.refresh()} />;

  const title = activeDraft?.title ?? chapter?.title ?? "";
  const wordCount = activeDraft?.wordCount ?? chapter?.wordCount ?? 0;
  const status = activeDraft?.status ?? chapter?.status ?? "draft";

  /* 内联栏只在对应断点渲染；窄屏一律走抽屉，避免挤压正文 */
  const leftInlineVisible = isDesktop && leftOpen && !immersive;
  const showRightInline = isWide && rightOpen;

  /** 打开目录（桌面展开内联栏 / 窄屏打开抽屉），并切到目录页签 */
  const openToc = () => { setImmersive(false); openLeftTab("toc"); };

  return (
    <EditorBridgeProvider value={bridge}>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-paper text-ink"
        data-motion={editorLayout.motionEnabled ? "on" : "off"}
      >
        {immersive ? null : (
          <EditorHeader
            novelId={novelId}
            novel={tree?.novel ?? null}
            volumeTitle={volume?.title ?? null}
            title={title}
            saveState={activeRecovery ? "dirty" : saveState}
            lastSavedAt={lastSavedAt}
            immersive={immersive}
            leftCollapsed={isDesktop ? !leftOpen : !drawerLeftOpen}
            rightCollapsed={isWide ? !rightOpen : !drawerRightOpen}
            theme={theme}
            onBack={goBack}
            onOverview={goOverview}
            onSave={saveChapter}
            canSave={Boolean(activeDraft) && !activeRecovery}
            backLabel={back.label}
            onToggleLeft={toggleLeft}
            onToggleRight={toggleRight}
            onToggleImmersive={toggleImmersive}
            onToggleTheme={toggleTheme}
            chapterPosition={chapterIndex >= 0 ? chapterIndex + 1 : null}
            chapterTotal={chapters.length}
            prevChapterTitle={prevChapter?.title ?? null}
            nextChapterTitle={nextChapter?.title ?? null}
            onPrevChapter={prevChapter ? () => selectChapter(prevChapter.id) : undefined}
            onNextChapter={nextChapter ? () => selectChapter(nextChapter.id) : undefined}
          />
        )}

        <div className="relative flex min-h-0 flex-1">
          {/* 左栏：目录 / 章纲 / 设定 / 档案（仅 ≥768 内联）。
              桌面下始终挂载，折叠 / 沉浸只切显隐：各面板不卸载，页签、草稿与已拉取的数据都保留 */}
          {isDesktop ? (
            <>
              <aside
                style={{ width: Math.min(leftPanel.width, panelWidth * 0.28) }}
                className={cn("min-h-0 shrink-0 overflow-hidden", leftInlineVisible ? "flex" : "hidden")}
                aria-label={tr("目录、章纲、设定与档案")}
                aria-hidden={leftInlineVisible ? undefined : true}
              >
                <LeftPanel
                  novelId={novelId}
                  tree={tree}
                  loading={loading}
                  currentChapterId={chapterId}
                  currentVolumeId={volume?.id ?? null}
                  tab={tab}
                  onTabChange={setTab}
                  actions={actions}
                  onSelectChapter={selectChapter}
                />
              </aside>
              {leftInlineVisible ? (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={tr("拖拽调整左栏宽度")}
                  onPointerDown={leftPanel.onPointerDown}
                  className="w-1 shrink-0 cursor-col-resize border-r border-line bg-surface-2/40 transition-colors duration-150 hover:bg-accent-soft"
                />
              ) : null}
            </>
          ) : null}

          {/* 中栏：正文 */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {chapterApi.error && !chapter ? (
              <div role="alert" className="m-auto space-y-3 p-6 text-sm text-ink-3">
                <p>{tr("正文加载失败：{error}", { error: chapterApi.error })}</p>
                <button type="button" className="text-accent" onClick={() => void chapterApi.refresh()}>{tr("重新加载")}</button>
              </div>
            ) : chapterMeta && !chapter ? (
              <p role="status" className="m-auto text-sm text-ink-4">{tr("正在加载正文…")}</p>
            ) : chapter && !activeDraft ? (
              <p role="status" className="m-auto text-sm text-ink-4">{tr("正在加载草稿…")}</p>
            ) : chapter && activeRecovery ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={<Feather className="size-5" />}
                  title={tr("发现未保存的临时草稿")}
                  description={tr("上次离开时未能确认保存。数据库内容可能已经变化；恢复后请核对，保存会覆盖当前章节。临时草稿只保存在此浏览器标签页中，不能代替备份。")}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" onClick={restoreRecovery}>{tr("恢复临时草稿")}</Button>
                      <Button variant="secondary" onClick={() => setDiscardRecoveryOpen(true)}>{tr("使用已保存版本")}</Button>
                    </div>
                  }
                />
                <ConfirmDialog
                  open={discardRecoveryOpen}
                  title={tr("丢弃临时草稿？")}
                  description={tr("临时草稿将被删除，无法撤销；数据库中已保存的章节不会改变。")}
                  confirmText={tr("丢弃草稿")}
                  danger
                  loading={discardRecoveryLoading}
                  onClose={() => setDiscardRecoveryOpen(false)}
                  onConfirm={() => void useSavedVersion()}
                />
              </div>
            ) : chapter && activeDraft ? (
              <EditorCanvas
                key={chapter.id}
                chapterId={chapter.id}
                chapterPositions={chapterPositions.current}
                initialContent={activeDraft.content}
                title={title}
                status={status}
                wordCount={wordCount}
                saveState={saveState}
                lastSavedAt={lastSavedAt}
                updatedAt={chapter.updatedAt}
                immersive={immersive}
                fontSize={fontSize}
                lineHeight={lineHeight}
                firstLineIndent={firstLineIndent}
                fontWeight={editorLayout.editorFontWeight}
                letterSpacing={editorLayout.editorLetterSpacing}
                paragraphSpacing={editorLayout.paragraphSpacing}
                pagePaddingX={editorLayout.pagePaddingX}
                pagePaddingY={editorLayout.pagePaddingY}
                maxContentWidth={editorLayout.maxContentWidth}
                showStatusBar={editorLayout.showStatusBar}
                showInlineHints={editorLayout.showInlineHints}
                onTitleChange={setTitle}
                onContentChange={setContent}
                onStatusChange={setStatus}
                onEditorReady={handleEditorReady}
                onSelectionChange={setSelection}
                onAskAi={requestAiFocus}
                onExitImmersive={exitImmersive}
                onSave={saveChapter}
                review={review}
                onCloseReview={closeReview}
                aiBar={
                  <EditorErrorBoundary
                    resetKey={`tasks:${chapter.id}`}
                    title={tr("AI 快捷任务")}
                  >
                    <AiTaskBar
                      novelId={novelId}
                      chapterId={chapter.id}
                      selection={selection.empty ? undefined : selection.text}
                      context={settings?.defaultContext}
                    />
                  </EditorErrorBoundary>
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <EmptyState
                  icon={<Feather className="size-5" />}
                  title={chapters.length === 0 ? tr("这份作品还没有章节") : tr("选择一章开始写")}
                  description={
                    chapters.length === 0
                      ? tr("先在左侧目录新建一章；写下的每个字都会自动保存在本地。")
                      : tr("从左侧目录点开一章，或者新建一章继续往下写。")
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus className="size-3.5" />}
                      onClick={openToc}
                    >
                      {tr("打开目录")}
                    </Button>
                  }
                />
              </div>
            )}
          </main>

          {/* 右栏：AI 协作（仅 ≥1024 内联，窄屏走抽屉） */}
          {showRightInline ? <div role="separator" aria-orientation="vertical" aria-label={tr("拖拽调整右栏宽度")} onPointerDown={rightPanel.onPointerDown} className="w-1 shrink-0 cursor-col-resize border-l border-line bg-surface-2/40 hover:bg-accent-soft" /> : null}
          {!isWide && drawerRightOpen ? <button type="button" aria-label={tr("关闭助手遮罩")} className="absolute inset-0 z-40 bg-black/30" onClick={()=>setDrawerRightOpen(false)} /> : null}
          {/* Keep one panel mounted across collapse, immersion and responsive layouts. */}
          <aside
            style={{ width: isWide ? Math.min(rightPanel.width, panelWidth * 0.38) : 440, maxWidth: "100%" }}
            className={cn("min-h-0 min-w-0 shrink-0 overflow-hidden bg-surface", isWide ? (showRightInline ? "flex" : "hidden") : (drawerRightOpen ? "absolute inset-y-0 right-0 z-50 flex shadow-float" : "hidden"))}
            aria-label={tr("AI 协作面板")}
            role={!isWide&&drawerRightOpen?"dialog":undefined}
            aria-modal={!isWide&&drawerRightOpen?true:undefined}
          >
            <EditorRightRail novelId={novelId} chapterId={chapterMeta?.id??null} chapterTitle={chapter ? title : chapterMeta?.title ?? null} onClose={()=>isWide?setRightOpen(false):setDrawerRightOpen(false)}/>
          </aside>
        </div>

        {/* 窄屏：目录 / 章纲 / 设定 / 档案 抽屉 */}
        <Sheet
          open={!isDesktop && drawerLeftOpen && !immersive}
          onClose={() => setDrawerLeftOpen(false)}
          title={tr("目录与资料")}
          width={356}
          side="left"
          layer="drawer"
        >
          <div className="flex h-full min-h-0 flex-col">
            <LeftPanel
              novelId={novelId}
              tree={tree}
              loading={loading}
              currentChapterId={chapterId}
              currentVolumeId={volume?.id ?? null}
              tab={tab}
              onTabChange={setTab}
              actions={actions}
              onSelectChapter={selectChapter}
            />
          </div>
        </Sheet>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          novelId={novelId}
          chapters={chapters}
          onOpenChapter={selectChapter}
          onOpenTab={openLeftTab}
        />

        {/* 选区状态给屏幕阅读器（视觉上已在正文状态条展示） */}
        <span className="sr-only" aria-live="polite">
          {selection.empty ? "" : tr("已选中 {n} 字", { n: selection.text.length })}
        </span>
      </div>
    </EditorBridgeProvider>
  );
}
