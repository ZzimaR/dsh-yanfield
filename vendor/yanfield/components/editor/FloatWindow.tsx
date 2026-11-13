"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Minus, X } from "lucide-react";
import { IconButton } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import { yanfieldPortal } from "@/lib/ui/portal";
import { useT } from "@/lib/i18n";

/** 浮窗与视口边缘的最小间距 */
const VIEWPORT_MARGIN = 8;
/** 尺寸上限换算时的视口预留（左右 / 上下合计 24px） */
const VIEWPORT_SIZE_GUTTER = 24;
/** 默认宽度（与旧版固定宽度一致；高度默认随内容） */
const DEFAULT_WIDTH = 560;
/** 缩放的最小尺寸 */
const MIN_WIDTH = 360;
const MIN_HEIGHT = 260;
/** 缩放的最大宽度（另一半上限是视口宽） */
const MAX_WIDTH = 920;
/** 尺寸记忆：同一会话内所有浮窗共用，并持久化到 localStorage */
const SIZE_STORAGE_KEY = "yanfield:float-window:size";

type FloatWindowSize = { width: number; height: number };

/** 会话内共享的“最后一次调整过的尺寸”，避免每个浮窗实例各读各的 localStorage */
let lastFloatSize: FloatWindowSize | null = null;

function readStoredFloatSize(): FloatWindowSize | null {
  if (lastFloatSize) return lastFloatSize;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FloatWindowSize> | null;
    if (!parsed || typeof parsed.width !== "number" || typeof parsed.height !== "number") return null;
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
    lastFloatSize = { width: parsed.width, height: parsed.height };
    return lastFloatSize;
  } catch {
    // 隐私模式 / 配额不足 / 数据损坏：静默回退默认尺寸
    return null;
  }
}

function persistFloatSize(size: FloatWindowSize) {
  lastFloatSize = size;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // localStorage 不可用时静默忽略，只保留会话内的共享尺寸
  }
}

/** 尺寸夹取：不小于最小尺寸，也不超出视口与最大宽度 */
function clampSize(size: FloatWindowSize): FloatWindowSize {
  if (typeof window === "undefined") return size;
  const maxWidth = Math.min(MAX_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_SIZE_GUTTER));
  const maxHeight = Math.max(0, window.innerHeight - VIEWPORT_SIZE_GUTTER);
  const minWidth = Math.min(MIN_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_HEIGHT, maxHeight);
  return {
    width: Math.round(Math.min(Math.max(size.width, minWidth), maxWidth)),
    height: Math.round(Math.min(Math.max(size.height, minHeight), maxHeight)),
  };
}

/** 按当前视口夹取浮窗位置，避免窄屏 / 缩放后窗口跑出屏幕（拖动越界也会在 resize 时被拉回） */
function clampToViewport(
  next: { x: number; y: number },
  node: HTMLElement | null,
  size?: FloatWindowSize | null,
): { x: number; y: number } {
  if (typeof window === "undefined") return next;
  const width =
    size?.width ?? node?.offsetWidth ?? Math.min(DEFAULT_WIDTH, window.innerWidth - VIEWPORT_SIZE_GUTTER);
  const height = size?.height ?? node?.offsetHeight ?? 0;
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, next.x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, next.y), maxY),
  };
}

/** SSR 安全的 layout effect：服务端没有布局阶段，退化为 useEffect */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * 可拖动、可缩放浮窗。
 *
 * - 窄屏（<768）抽屉打开时层级必须高于 kit Overlay 的 z-50，否则浮窗会被遮罩盖住；
 *   桌面端保持 z-40，仍低于 Dialog / ConfirmDialog（z-50），删除确认等弹窗不会被浮窗挡住。
 * - keepMounted：页签被切走（面板隐藏但编辑会话没结束）时只隐藏不卸载，草稿不丢；
 *   显式关闭编辑器时传 false，浮窗卸载，重开是干净状态。
 * - 右下角把手可同时调整宽高（最小 360×260，不超出视口与 920 宽上限）；尺寸持久化到
 *   localStorage 并在同一会话内被后续浮窗沿用；最小化 / 关闭时不显示把手。
 */
export function FloatWindow({
  open,
  title,
  minimized,
  onMinimizedChange,
  onClose,
  children,
  footer,
  className,
  keepMounted = false,
}: {
  open: boolean;
  title: string;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 追加样式（字符串末尾合并，可覆盖默认层级等工具类） */
  className?: string;
  /**
   * 首次打开之后，open=false 时是否保持挂载（只 hidden 隐藏）。
   * 用于「页签切走但编辑会话仍在」的场景；显式关闭传 false，好让子编辑器卸载重置。
   */
  keepMounted?: boolean;
}) {
  const tr = useT();
  const [pos, setPos] = React.useState({ x: 292, y: 76 });
  /** null = 默认 560 宽 + 高度随内容；非 null = 用户调整过尺寸（高度固定，内容区滚动） */
  const [size, setSize] = React.useState<FloatWindowSize | null>(null);
  /** 首次打开后记录，供 keepMounted 判断；最小化时 open 仍为 true，不依赖它 */
  const [hasOpened, setHasOpened] = React.useState(open);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const resizeRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    originWidth: number;
    originHeight: number;
    moved: boolean;
  } | null>(null);
  /** 缩放过程中的最新尺寸，pointerup 时写回记忆 */
  const resizedSizeRef = React.useRef<FloatWindowSize | null>(null);

  const mounted = open || (keepMounted && hasOpened);

  // 首次挂载时沿用上次的尺寸（本会话共享 / localStorage），避免每个浮窗各弹各的
  useIsomorphicLayoutEffect(() => {
    const stored = readStoredFloatSize();
    if (!stored) return;
    const next = clampSize(stored);
    setSize((prev) => prev ?? next);
    setPos((prev) => {
      const clamped = clampToViewport(prev, rootRef.current, next);
      return clamped.x === prev.x && clamped.y === prev.y ? prev : clamped;
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setHasOpened(true);
    // 打开时套用“最后一次调整过的尺寸”，让后开的浮窗与已有浮窗保持一致
    const shared = readStoredFloatSize();
    if (!shared) return;
    const next = clampSize(shared);
    setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    setPos((prev) => {
      const clamped = clampToViewport(prev, rootRef.current, next);
      return clamped.x === prev.x && clamped.y === prev.y ? prev : clamped;
    });
  }, [open]);

  const clampNow = React.useCallback(() => {
    setPos((prev) => {
      const next = clampToViewport(prev, rootRef.current);
      // 位置没变时返回原对象，避免多余渲染
      return next.x === prev.x && next.y === prev.y ? prev : next;
    });
  }, []);

  // 挂载 / 展开 / 最小化变化后夹回视口（layout 阶段执行，不会闪到屏幕外）
  useIsomorphicLayoutEffect(() => {
    if (open) clampNow();
  }, [open, minimized, clampNow]);

  // 视口尺寸变化后：先夹尺寸（不超出新视口），再夹位置
  React.useEffect(() => {
    if (!open) return;
    const onViewportResize = () => {
      setSize((prev) => {
        if (!prev) return prev;
        const next = clampSize(prev);
        return next.width === prev.width && next.height === prev.height ? prev : next;
      });
      clampNow();
    };
    window.addEventListener("resize", onViewportResize);
    return () => window.removeEventListener("resize", onViewportResize);
  }, [open, clampNow]);

  // 内容异步加载导致尺寸变化时同步夹取
  React.useEffect(() => {
    const node = rootRef.current;
    if (!open || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(clampNow);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, clampNow]);

  if (!mounted || typeof document === "undefined") return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // 标题栏里的按钮 / 链接自己处理点击，不能被拖动逻辑吞掉
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, [role="button"], a')) return;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, originX: pos.x, originY: pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPos({
      x: Math.max(VIEWPORT_MARGIN, drag.originX + event.clientX - drag.pointerX),
      y: Math.max(VIEWPORT_MARGIN, drag.originY + event.clientY - drag.pointerY),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  /* ---------------- 右下角缩放 ---------------- */

  const onResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const node = rootRef.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originWidth: node.offsetWidth,
      originHeight: node.offsetHeight,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize) return;
    resize.moved = true;
    const next = clampSize({
      width: resize.originWidth + (event.clientX - resize.pointerX),
      height: resize.originHeight + (event.clientY - resize.pointerY),
    });
    resizedSizeRef.current = next;
    setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    setPos((prev) => {
      const clamped = clampToViewport(prev, rootRef.current, next);
      return clamped.x === prev.x && clamped.y === prev.y ? prev : clamped;
    });
  };

  const finishResize = () => {
    const resize = resizeRef.current;
    if (!resize) return;
    resizeRef.current = null;
    if (resize.moved) {
      // 只有真正拖动过才记忆尺寸，避免误点把手把默认尺寸也写死成固定高度
      const finalSize = resizedSizeRef.current;
      if (finalSize) persistFloatSize(finalSize);
    }
    setPos((prev) => {
      const clamped = clampToViewport(prev, rootRef.current);
      return clamped.x === prev.x && clamped.y === prev.y ? prev : clamped;
    });
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      aria-hidden={open ? undefined : true}
      className={cn(
        "fixed z-[60] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-float md:z-40",
        minimized
          ? "h-auto"
          : size
            ? "max-h-[calc(100vh-24px)]"
            : "max-h-[min(760px,calc(100vh-96px))]",
        !open && "hidden",
        className,
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: size?.width ?? DEFAULT_WIDTH,
        height: minimized ? undefined : size?.height,
      }}
    >
      <div
        className="flex cursor-grab items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{title}</p>
        <span className="shrink-0 text-[11px] text-ink-4">{minimized ? tr("已最小化") : tr("拖动")}</span>
        <IconButton label={minimized ? tr("展开") : tr("最小化")} size="sm" onClick={() => onMinimizedChange(!minimized)}>
          <Minus className="size-3.5" />
        </IconButton>
        <IconButton label={tr("关闭")} size="sm" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      {/* 最小化时只隐藏内容，保持子组件挂载，展开后未保存的草稿仍在 */}
      <div className={cn("flex min-h-0 flex-1 flex-col", minimized && "hidden")}>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-line py-3 pl-5 pr-7">{footer}</div> : null}
      </div>
      {/* 右下角缩放把手：同时调整宽高；最小化时隐藏（内容已收起，无高度可调） */}
      {minimized ? null : (
        <button
          type="button"
          aria-label={tr("调整窗口大小")}
          title={tr("拖动调整窗口大小")}
          className="absolute bottom-0 right-0 flex size-4 cursor-nwse-resize touch-none items-end justify-end rounded-br-[7px] border-0 bg-transparent p-0.5 text-ink-4 outline-none transition-colors hover:bg-accent-soft hover:text-ink active:bg-accent-soft"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
        >
          <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
            <path
              d="M9 2.5 2.5 9M9 6.5 6.5 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>,
    yanfieldPortal(),
  );
}
