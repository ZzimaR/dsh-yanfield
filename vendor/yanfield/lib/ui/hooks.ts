"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 防抖值 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** 本地存储状态（SSR 安全） */
export function useLocalStorageState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, [key]);

  const update = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = value instanceof Function ? (value as (p: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );

  return [state, update];
}

/** 媒体查询 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (evt: MediaQueryListEvent) => setMatches(evt.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);
  return matches;
}

/** 点击外部关闭 */
export function useOnClickOutside<T extends HTMLElement>(ref: React.RefObject<T | null>, handler: () => void): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/** 输入框 / 下拉里不抢任何快捷键（保存除外）；正文可编辑区放行带 mod / alt 的显式组合与 Esc，其余裸键让位给输入法 */
function shouldIgnoreHotkey(combo: string, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  const isFormControl = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (isFormControl) return combo !== "mod+s";
  if (target.isContentEditable) {
    // 正文（TipTap）里 Alt+J / ⌘K 等编辑台快捷键仍需可用；Esc 不产生字符，保留它退出沉浸 / 关浮层
    if (combo === "esc" || combo === "escape") return false;
    return !(combo.startsWith("mod+") || combo.startsWith("alt+"));
  }
  return false;
}

/**
 * 归一化按键：优先用 event.code，避免修饰键改变 event.key 导致匹配不上
 * （Shift+1 的 key 是 "!"、macOS Option+J 的 key 是 "∆"，而 code 仍是 Digit1 / KeyJ）。
 */
function normalizeKey(event: KeyboardEvent): string {
  const code = event.code ?? "";
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  return event.key.toLowerCase();
}

/**
 * 快捷键：如 { "mod+s": fn, "esc": fn, "mod+shift+k": fn }。
 * 输入控件内只放行 mod+s；正文可编辑区只放行带 mod / alt 的组合，避免抢走打字与输入法按键。
 */
export function useHotkeys(map: HotkeyMap, deps: unknown[] = []): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // 已被业务 preventDefault、处于输入法组合中（或 IME 占位键）时不参与匹配
      if (event.defaultPrevented || event.isComposing || event.key === "Process") return;
      const mod = event.metaKey || event.ctrlKey;
      const parts: string[] = [];
      if (mod) parts.push("mod");
      if (event.shiftKey) parts.push("shift");
      if (event.altKey) parts.push("alt");
      const key = normalizeKey(event);
      parts.push(key);
      const combo = parts.join("+");
      const fn = map[combo] ?? map[key];
      if (!fn) return;
      if (shouldIgnoreHotkey(combo, event.target)) return;
      fn(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** 可拖拽分栏宽度（三级页面左/右栏） */
export function useResizePanel(initial: number, opts: { min?: number; max?: number; side?: "left" | "right" } = {}) {
  const { min = 200, max = 640, side = "left" } = opts;
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dragging.current = true;
      const startX = event.clientX;
      const startWidth = width;
      const move = (evt: PointerEvent) => {
        const delta = side === "left" ? evt.clientX - startX : startX - evt.clientX;
        setWidth(Math.min(max, Math.max(min, startWidth + delta)));
      };
      const up = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [width, min, max, side],
  );

  return { width, setWidth, onPointerDown };
}

/** 元素尺寸监听 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
