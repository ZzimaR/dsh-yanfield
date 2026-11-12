/**
 * 客户端数据访问封装：所有页面/组件统一走这里，便于统一错误处理与刷新策略。
 * 仅浏览器环境可用（useApi 依赖 React hooks）。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexItem, CodexTurn } from "@/lib/ai/codex";
import type { AiChatRequest, AiStreamEvent, AiTaskRequest } from "@/lib/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 插件把接口挂在 Harness 的 /yanfield 前缀下。独立砚田仍是 /api。 */
export function apiUrl(url: string): string {
  if (url.startsWith("/yanfield/") || url === "/yanfield") return url;
  if (url.startsWith("/api/") || url === "/api") return `/yanfield${url}`;
  return url;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), { ...init, headers: { ...(init?.headers ?? {}) }, cache: "no-store" });
  return parseResponse<T>(res);
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export const apiPost = <T>(url: string, body?: unknown) => apiSend<T>(url, "POST", body);
export const apiPatch = <T>(url: string, body?: unknown) => apiSend<T>(url, "PATCH", body);
export const apiPut = <T>(url: string, body?: unknown) => apiSend<T>(url, "PUT", body);
export const apiDelete = <T = { ok: true }>(url: string, body?: unknown) => apiSend<T>(url, "DELETE", body);

export interface UseApiState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/** 简单的 GET 数据 hook：url 变化自动重取；refresh 手动重取 */
export function useApi<T>(url: string | null, deps: unknown[] = []): UseApiState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const alive = useRef(true);
  const version = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!url) {
      setDataState(undefined);
      setLoading(false);
      return;
    }
    const ticket = ++version.current;
    setLoading(true);
    try {
      const result = await apiGet<T>(url);
      if (alive.current && ticket === version.current) {
        setDataState(result);
        setError(null);
      }
    } catch (err) {
      if (alive.current && ticket === version.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (alive.current && ticket === version.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);

  return { data, error, loading, refresh: load, setData };
}

/* ============================== AI 流式请求 ============================== */

export interface StreamHandlers {
  onEvent: (event: AiStreamEvent) => void;
  signal?: AbortSignal;
}

async function consumeSse(res: Response, handlers: StreamHandlers): Promise<void> {
  if (!res.ok) {
    let message = `AI 请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  if (!res.body) throw new ApiError("服务端没有返回流式响应", 500);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf("\n\n");
    while (split >= 0) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          handlers.onEvent(JSON.parse(payload) as AiStreamEvent);
        } catch {
          /* 忽略无法解析的心跳行 */
        }
      }
      split = buffer.indexOf("\n\n");
    }
  }
}

export function streamAiChat(req: AiChatRequest, handlers: StreamHandlers): Promise<void> {
  return fetch(apiUrl("/api/ai/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: handlers.signal,
  }).then((res) => consumeSse(res, handlers));
}

export function streamAiAgent(req: import("@/lib/ai/agent/types").AgentRequest, handlers: StreamHandlers): Promise<void> {
  return fetch(apiUrl("/api/ai/agent"), {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(req),signal:handlers.signal}).then(res=>consumeSse(res,handlers));
}

export function streamAiCodex(
  req: { novelId: string; message: string; history?: CodexTurn[]; draft?: CodexItem[]; contextText?: string },
  handlers: StreamHandlers,
): Promise<void> {
  return fetch(apiUrl("/api/ai/codex"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: handlers.signal,
  }).then((res) => consumeSse(res, handlers));
}

export function streamAiTask(req: AiTaskRequest, handlers: StreamHandlers): Promise<void> {
  return fetch(apiUrl("/api/ai/task"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: handlers.signal,
  }).then((res) => consumeSse(res, handlers));
}

/* ============================== 全局刷新事件 ============================== */

export const DATA_CHANGED_EVENT = "yanfield:data-changed";

/** 数据变更后广播，页面可监听刷新 */
export function notifyDataChanged(topic?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { topic, at: Date.now() } }));
}

/** 监听数据变更事件 */
export function useDataChanged(handler: () => void, topics?: string[]): void {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ topic?: string }>).detail;
      if (!topics || !detail?.topic || topics.includes(detail.topic)) handler();
    };
    window.addEventListener(DATA_CHANGED_EVENT, listener);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
  }, [handler, topics]);
}
