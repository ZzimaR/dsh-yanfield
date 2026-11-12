"use client";

/**
 * AI 对话状态机（面板私有 hook）：
 * - 多会话 Tab（最多 3 个，各自维护消息与 sessionId）
 * - 首次发送时懒创建服务端会话（POST /api/chat/sessions），失败则整体降级为本地会话
 * - 流式订阅 /api/ai/chat（SSE），处理全部 AiStreamEvent 类型，支持 AbortController 停止
 * - done 后写库（POST /api/chat/sessions/[id]/messages）；失败后本次会话内不再尝试
 */
import * as React from "react";
import { chatTitleFromMessage, isDefaultChatTitle } from "@/lib/chat-title";
import { apiDelete, apiGet, apiPost, streamAiChat } from "@/lib/client/api";
import { ApiError } from "@/lib/client/api";
import { uid } from "@/lib/ui/cn";
import type {
  AgentId,
  AiAction,
  AiChatRequest,
  AiStreamEvent,
  AiUsage,
  ChatMessage,
  ChatSession,
} from "@/lib/types";
import type { ChatExtras, ChatTab, SendChatInput, UIMessage } from "./types";
import {
  composeChatMessage,
  isAbortError,
  modeToRequestMode,
  toRequestMentions,
  toUiMessage,
} from "./utils";
import { humanizeAiError } from "./errors";

/** 最多同时打开的会话数 */
export const MAX_SESSION_TABS = 3;
const MAX_LOADED_MESSAGES_PER_TAB = 120;

export interface UseAiChatOptions {
  novelId: string;
  chapterId?: string | null;
  defaultAgentId: AgentId;
}

/** endExchange 选项 */
export interface EndExchangeOptions {
  /**
   * 结束后是否把这一轮 user+assistant 写入服务端会话。
   * 默认 false：普通 chat 由 runStream 自己落库，避免重复写。
   */
  persist?: boolean;
}

/** 一轮“外部接流”问答的上下文快照：beginExchange 记录，endExchange 落库用。 */
interface PendingExchange {
  assistantId: string;
  /** 发起轮次的 tab；流式期间用户可能切走，落库必须写回发起 tab */
  tabKey: string;
  agentId: AgentId;
  userText: string;
}

/** 落库用的一问一答内容（content 必需，其余字段可缺省）。 */
interface ExchangeReply {
  content: string;
  reasoning?: string;
  actions?: AiAction[];
  status?: ChatMessage["status"];
  provider?: string;
  model?: string;
  usage?: AiUsage | null;
  error?: string;
}

export type OpenSessionResult =
  | { ok: true }
  | { ok: false; reason: "max-tabs" | "load-failed" | "context-changed" };

export interface UseAiChatResult {
  tabs: ChatTab[];
  activeKey: string;
  activeTab: ChatTab;
  streaming: boolean;
  streamingTabKey: string | null;
  /** 最近一次流式响应使用的模型（用于面板顶栏展示模型名） */
  modelLabel: string | null;
  send: (input: SendChatInput) => Promise<void>;
  stop: () => void;
  retry: (messageId: string, extras: ChatExtras) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  selectTab: (key: string) => void;
  newTab: () => boolean;
  closeTab: (key: string) => void;
  closeSession: (sessionId: string) => void;
  setAgent: (agentId: AgentId) => void;
  openSession: (session: ChatSession) => Promise<OpenSessionResult>;
  loadOlderMessages: (tabKey: string) => Promise<boolean>;
  /** 在当前会话里先放下一问一答，供设定任务自己接流。返回 assistant 消息 id。 */
  beginExchange: (userText: string, replaceId?: string) => string;
  prepareSession:()=>Promise<string|null>;
  /** 按 assistantId 精确更新回复（流式期间切 tab 也不会写错）。 */
  patchExchange: (assistantId: string, patch: Partial<UIMessage>) => void;
  /**
   * 复位流式状态。codex 等外部接流轮次传 { persist: true } 把整轮写进服务端会话；
   * 普通 chat 不要传，避免重复落库。
   */
  endExchange: (options?: EndExchangeOptions) => Promise<void>;
}

function createMessage(role: UIMessage["role"], content = ""): UIMessage {
  return {
    id: uid("msg"),
    role,
    content,
    actions: [],
    status: "complete",
    provider: "",
    model: "",
    usage: null,
    error: "",
    createdAt: new Date().toISOString(),
  };
}

function createTab(agentId: AgentId): ChatTab {
  return {
    key: uid("tab"),
    sessionId: null,
    title: "",
    agentId,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

interface MessagePage {
  items: UIMessage[];
  hasMore: boolean;
  beforeId: string | null;
}

function pickMessages(data: unknown): MessagePage {
  const record = data && typeof data === "object" ? data as { items?: unknown; hasMore?: unknown; beforeId?: unknown } : null;
  const list = Array.isArray(data) ? data : Array.isArray(record?.items) ? record.items : [];
  return {
    items: list
    .filter((row): row is ChatMessage => !!row && typeof row === "object" && "role" in row)
    .map(toUiMessage),
    hasMore: record?.hasMore === true,
    beforeId: typeof record?.beforeId === "string" ? record.beforeId : null,
  };
}

export function useAiChat({ novelId, chapterId, defaultAgentId }: UseAiChatOptions): UseAiChatResult {
  const [tabs, setTabs] = React.useState<ChatTab[]>(() => [createTab(defaultAgentId)]);
  const [activeKey, setActiveKey] = React.useState<string>(() => tabs[0].key);
  const [streaming, setStreaming] = React.useState(false);
  const [streamingTabKey, setStreamingTabKey] = React.useState<string | null>(null);
  const [modelLabel, setModelLabel] = React.useState<string | null>(null);

  const stateRef = React.useRef({ tabs, activeKey, streamingTabKey });
  stateRef.current = { tabs, activeKey, streamingTabKey };
  const abortRef = React.useRef<AbortController | null>(null);
  const streamingRef = React.useRef(false);
  const mountedRef = React.useRef(false);
  /** null=未知；true=可用；false=不可用（本页面内不再尝试） */
  const serverSessionRef = React.useRef<boolean | null>(null);
  /** 外部接流（资料助手）的当前轮次；endExchange 用它复位 tab 并落库 */
  const exchangeRef = React.useRef<PendingExchange | null>(null);
  /** 当前轮次已应用的 patch；endExchange 落库时取最终正文/状态/用量 */
  const exchangePatchesRef = React.useRef<Map<string, Partial<UIMessage>>>(new Map());
  const contextRef = React.useRef({ novelId, chapterId });
  const previousContextRef = React.useRef({ novelId, chapterId });
  contextRef.current = { novelId, chapterId };

  React.useEffect(() => {
    if (previousContextRef.current.novelId === novelId && previousContextRef.current.chapterId === chapterId) return;
    previousContextRef.current = { novelId, chapterId };
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    serverSessionRef.current = null;
    exchangeRef.current = null;
    exchangePatchesRef.current.clear();
    setStreaming(false);
    setStreamingTabKey(null);
    const tab = createTab(defaultAgentId);
    setTabs([tab]);
    setActiveKey(tab.key);
  }, [novelId, chapterId, defaultAgentId]);

  React.useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        abortRef.current?.abort();
        abortRef.current = null;
        streamingRef.current = false;
        exchangeRef.current = null;
        exchangePatchesRef.current.clear();
      };
    },
    [],
  );

  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  /* ---------------- 内部更新助手 ---------------- */

  const patchMessage = React.useCallback(
    (tabKey: string, messageId: string, updater: (message: UIMessage) => UIMessage) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.key === tabKey
            ? {
                ...tab,
                messages: tab.messages.map((message) =>
                  message.id === messageId ? updater(message) : message,
                ),
              }
            : tab,
        ),
      );
    },
    [],
  );

  const appendMessages = React.useCallback((tabKey: string, messages: UIMessage[]) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.key !== tabKey) return tab;
        const firstUser = messages.find((message) => message.role === "user");
        const title = isDefaultChatTitle(tab.title) && firstUser ? chatTitleFromMessage(firstUser.content) : tab.title;
        const combined = [...tab.messages, ...messages];
        if (combined.length <= MAX_LOADED_MESSAGES_PER_TAB) return { ...tab, title, messages: combined };
        const retained = combined.slice(-MAX_LOADED_MESSAGES_PER_TAB);
        return {
          ...tab,
          title,
          messages: retained,
          olderMessagesCursor: retained[0]?.id ?? tab.olderMessagesCursor,
          hasOlderMessages: true,
        };
      }),
    );
  }, []);

  /** 在全部 tab 中按消息 id 反向定位；避免用实时 activeKey 把回复写到切走后的 tab。 */
  const findTabByMessage = React.useCallback(
    (messageId: string): ChatTab | null =>
      stateRef.current.tabs.find((tab) => tab.messages.some((message) => message.id === messageId)) ?? null,
    [],
  );

  /** 懒创建服务端会话；失败返回 null（本轮降级为纯本地会话）。 */
  const ensureSession = React.useCallback(
    async (tabKey: string, agentId: AgentId, existingId: string | null): Promise<string | null> => {
      if (existingId) return existingId;
      if (serverSessionRef.current === false) return null;
      try {
        const created = await apiPost<ChatSession>("/api/chat/sessions", {
          novelId: contextRef.current.novelId,
          chapterId: chapterId ?? null,
          agentId,
        });
        if (!created?.id) return null;
        serverSessionRef.current = true;
        setTabs((prev) => prev.map((tab) => (tab.key === tabKey ? { ...tab, sessionId: created.id } : tab)));
        return created.id;
      } catch {
        serverSessionRef.current = false;
        return null;
      }
    },
    [novelId, chapterId],
  );

  /** 把一问一答写入服务端会话；接口不可用时降级（本页面内不再尝试）。 */
  const persistMessages = React.useCallback(
    async (sessionId: string, userContent: string, reply: ExchangeReply): Promise<boolean> => {
      if (serverSessionRef.current === false) return false;
      try {
        await Promise.all([
          apiPost(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
            novelId: contextRef.current.novelId,
            role: "user",
            content: userContent,
          }),
          apiPost(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
            novelId,
            role: "assistant",
            content: reply.content,
            reasoning: reply.reasoning ?? "",
            actions: reply.actions ?? [],
            status: reply.status ?? "complete",
            provider: reply.provider ?? "",
            model: reply.model ?? "",
            usage: reply.usage ?? null,
            error: reply.error ?? "",
          }),
        ]);
        serverSessionRef.current = true;
        return true;
      } catch {
        serverSessionRef.current = false;
        return false;
      }
    },
    [],
  );

  /* ---------------- 流式请求核心 ---------------- */

  const runStream = React.useCallback(
    async (params: {
      tabKey: string;
      agentId: AgentId;
      sessionId: string | null;
      /** 实际发送给模型的文本（可能含起草模式前缀） */
      message: string;
      extras: ChatExtras;
    }) => {
      const { tabKey, agentId, message, extras } = params;
      const assistant = createMessage("assistant");
      assistant.status = "streaming";
      appendMessages(tabKey, [assistant]);

      streamingRef.current = true;
      setStreaming(true);
      setStreamingTabKey(tabKey);
      const controller = new AbortController();
      abortRef.current = controller;

      let sessionId = params.sessionId;
      let provider = "";
      let model = "";
      let content = "";
      let reasoning = "";
      const actions: AiAction[] = [];
      let usage: AiUsage | null = null;
      let failed = false;
      let snapshotFrame = 0;

      const snapshot = (patch?: Partial<UIMessage>) => {
        if (!mountedRef.current) return;
        patchMessage(tabKey, assistant.id, (prev) => ({
          ...prev,
          content,
          reasoning: reasoning || undefined,
          actions: [...actions],
          provider: prev.provider || provider,
          model: prev.model || model,
          usage,
          ...patch,
        }));
      };
      const scheduleSnapshot = () => {
        if (snapshotFrame) return;
        snapshotFrame = requestAnimationFrame(() => {
          snapshotFrame = 0;
          snapshot();
        });
      };
      const flushSnapshot = (patch?: Partial<UIMessage>) => {
        if (snapshotFrame) cancelAnimationFrame(snapshotFrame);
        snapshotFrame = 0;
        snapshot(patch);
      };

      const handleEvent = (event: AiStreamEvent) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        switch (event.type) {
          case "meta":
            provider = event.provider;
            model = event.model;
            setModelLabel(`${event.provider} / ${event.model}`);
            snapshot();
            break;
          case "delta":
            content += event.text;
            scheduleSnapshot();
            break;
          case "reasoning":
            reasoning += event.text;
            scheduleSnapshot();
            break;
          case "action":
            actions.push(event.action);
            flushSnapshot();
            break;
          case "done":
            usage = event.usage ?? null;
            flushSnapshot();
            break;
          case "error": {
            failed = true;
            // 真实 Provider 错误 → 中文化、可操作提示（不静默失败）
            const info = humanizeAiError(event.message, { code: event.code });
            flushSnapshot({
              status: "error",
              error: event.message,
              errorTitle: info.title,
              errorHint: info.hint,
              errorAction: info.action,
            });
            break;
          }
        }
      };

      // 1) 懒创建服务端会话（失败 → 纯本地会话）
      sessionId = await ensureSession(tabKey, agentId, sessionId);

      try {
        const request: AiChatRequest = {
          novelId,
          chapterId: chapterId ?? null,
          sessionId: sessionId ?? null,
          agentId,
          message,
          mode: modeToRequestMode(extras.mode),
          context: extras.context,
          selection: extras.selection?.trim() ? extras.selection : undefined,
          presetId: extras.presetId ?? null,
          mentions:
            extras.mentions.length > 0 ? toRequestMentions(extras.mentions) : undefined,
        };
        await streamAiChat(request, { onEvent: handleEvent, signal: controller.signal });
        if (!failed) {
          flushSnapshot({ status: controller.signal.aborted ? "aborted" : "complete" });
        }
      } catch (error) {
        if (isAbortError(error)) flushSnapshot({ status: "aborted" });
        else {
          const info = humanizeAiError(error, {
            status: error instanceof ApiError ? error.status : undefined,
          });
          flushSnapshot({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            errorTitle: info.title,
            errorHint: info.hint,
            errorAction: info.action,
          });
        }
      } finally {
        if (snapshotFrame) cancelAnimationFrame(snapshotFrame);
        if (abortRef.current === controller) {
          streamingRef.current = false;
          abortRef.current = null;
          if (mountedRef.current) {
            setStreaming(false);
            setStreamingTabKey(null);
          }
        }
      }

      // The chat endpoint persists both messages before streaming. Re-persisting here
      // duplicates interrupted responses because an abort does not emit a done event.
    },
    [novelId, chapterId, appendMessages, patchMessage, ensureSession],
  );

  /* ---------------- 对外动作 ---------------- */

  const send = React.useCallback(
    async (input: SendChatInput) => {
      const text = input.text.trim();
      if (!text || streamingRef.current) return;
      const current =
        stateRef.current.tabs.find((tab) => tab.key === stateRef.current.activeKey) ??
        stateRef.current.tabs[0];
      if (!current) return;
      appendMessages(current.key, [createMessage("user", text)]);
      const extras: ChatExtras = {
        mentions: input.mentions,
        mode: input.mode,
        context: input.context,
        selection: input.selection,
        presetId: input.presetId,
      };
      await runStream({
        tabKey: current.key,
        agentId: current.agentId,
        sessionId: current.sessionId,
        message: composeChatMessage(text, input.mode),
        extras,
      });
    },
    [appendMessages, runStream],
  );

  const retry = React.useCallback(
    async (messageId: string, extras: ChatExtras) => {
      if (streamingRef.current) return;
      const current =
        stateRef.current.tabs.find((tab) => tab.key === stateRef.current.activeKey) ??
        stateRef.current.tabs[0];
      if (!current) return;
      const index = current.messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      let userText = "";
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (current.messages[cursor].role === "user") {
          userText = current.messages[cursor].content;
          break;
        }
      }
      if (!userText) return;
      // 丢弃该助手回复及其后的消息，保留此前的用户提问
      setTabs((prev) =>
        prev.map((tab) =>
          tab.key === current.key ? { ...tab, messages: tab.messages.slice(0, index) } : tab,
        ),
      );
      await runStream({
        tabKey: current.key,
        agentId: current.agentId,
        sessionId: current.sessionId,
        message: composeChatMessage(userText, extras.mode),
        extras,
      });
    },
    [runStream],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const removeMessage = React.useCallback(async (messageId: string) => {
    const current = stateRef.current;
    const tab = current.tabs.find((item) => item.key === current.activeKey);
    const message = tab?.messages.find((item) => item.id === messageId);
    if (!tab || !message) return;
    if (tab.sessionId) {
      await apiDelete(
        `/api/chat/sessions/${encodeURIComponent(tab.sessionId)}/messages/${encodeURIComponent(messageId)}?novelId=${encodeURIComponent(contextRef.current.novelId)}`,
      );
    }
    setTabs((prev) =>
      prev.map((item) =>
        item.key === tab.key
          ? { ...item, messages: item.messages.filter((row) => row.id !== messageId) }
          : item,
      ),
    );
  }, []);

  const selectTab = React.useCallback((key: string) => setActiveKey(key), []);

  const newTab = React.useCallback((): boolean => {
    const current = stateRef.current.tabs;
    if (current.length >= MAX_SESSION_TABS) return false;
    const currentTab = current.find((tab) => tab.key === stateRef.current.activeKey) ?? current[0];
    const tab = createTab(currentTab?.agentId ?? defaultAgentId);
    setTabs((prev) => [...prev, tab]);
    setActiveKey(tab.key);
    return true;
  }, [defaultAgentId]);

  const closeTab = React.useCallback(
    (key: string) => {
      const current = stateRef.current;
      const target = current.tabs.find((tab) => tab.key === key);
      if (!target) return;
      if (streamingRef.current && current.streamingTabKey === key) abortRef.current?.abort();
      const remaining = current.tabs.filter((tab) => tab.key !== key);
      if (remaining.length === 0) {
        const replacement = createTab(defaultAgentId);
        setTabs([replacement]);
        setActiveKey(replacement.key);
        return;
      }
      setTabs(remaining);
      if (current.activeKey === key) {
        const index = current.tabs.findIndex((tab) => tab.key === key);
        const next = remaining[Math.min(index, remaining.length - 1)] ?? remaining[remaining.length - 1];
        setActiveKey(next.key);
      }
    },
    [defaultAgentId],
  );

  const closeSession = React.useCallback((sessionId: string) => {
    const current = stateRef.current;
    const removed = current.tabs.filter((tab) => tab.sessionId === sessionId);
    if (removed.length === 0) return;
    if (current.streamingTabKey && removed.some((tab) => tab.key === current.streamingTabKey)) {
      abortRef.current?.abort();
    }
    const remaining = current.tabs.filter((tab) => tab.sessionId !== sessionId);
    if (remaining.length === 0) {
      const replacement = createTab(defaultAgentId);
      setTabs([replacement]);
      setActiveKey(replacement.key);
      return;
    }
    setTabs(remaining);
    if (removed.some((tab) => tab.key === current.activeKey)) {
      const oldIndex = current.tabs.findIndex((tab) => tab.key === current.activeKey);
      setActiveKey(remaining[Math.min(oldIndex, remaining.length - 1)]?.key ?? remaining[0].key);
    }
  }, [defaultAgentId]);

  const setAgent = React.useCallback((agentId: AgentId) => {
    const key = stateRef.current.activeKey;
    setTabs((prev) => prev.map((tab) => (tab.key === key ? { ...tab, agentId } : tab)));
  }, []);

  const openSession = React.useCallback(
    async (session: ChatSession): Promise<OpenSessionResult> => {
      const current = stateRef.current;
      const existing = current.tabs.find((tab) => tab.sessionId === session.id);
      if (existing) {
        setActiveKey(existing.key);
        return { ok: true };
      }
      if (current.tabs.length >= MAX_SESSION_TABS) return { ok: false, reason: "max-tabs" };
      const requestedNovelId = contextRef.current.novelId;
      const requestedChapterId = contextRef.current.chapterId;
      if (session.novelId !== requestedNovelId) return { ok: false, reason: "context-changed" };

      let page: MessagePage;
      try {
        const data = await apiGet<unknown>(
          `/api/chat/sessions/${encodeURIComponent(session.id)}/messages?novelId=${encodeURIComponent(requestedNovelId)}&limit=80`,
        );
        page = pickMessages(data);
      } catch {
        if (
          contextRef.current.novelId !== requestedNovelId
          || contextRef.current.chapterId !== requestedChapterId
        ) return { ok: false, reason: "context-changed" };
        return { ok: false, reason: "load-failed" };
      }

      if (
        !mountedRef.current ||
        contextRef.current.novelId !== requestedNovelId ||
        contextRef.current.chapterId !== requestedChapterId
      ) {
        return { ok: false, reason: "context-changed" };
      }
      const latest = stateRef.current;
      const alreadyOpen = latest.tabs.find((tab) => tab.sessionId === session.id);
      if (alreadyOpen) {
        setActiveKey(alreadyOpen.key);
        return { ok: true };
      }
      if (latest.tabs.length >= MAX_SESSION_TABS) return { ok: false, reason: "max-tabs" };
      const tab: ChatTab = {
        key: uid("tab"),
        sessionId: session.id,
        title: session.title?.trim() || "",
        agentId: session.agentId,
        messages: page.items,
        olderMessagesCursor: page.beforeId,
        hasOlderMessages: page.hasMore,
        createdAt: session.createdAt,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveKey(tab.key);
      return { ok: true };
    },
    [],
  );

  const loadOlderMessages = React.useCallback(async (tabKey: string): Promise<boolean> => {
    const tab = stateRef.current.tabs.find((item) => item.key === tabKey);
    if (!tab?.sessionId || !tab.hasOlderMessages || !tab.olderMessagesCursor || tab.loadingOlderMessages) return false;
    const requestedNovelId = contextRef.current.novelId;
    setTabs((prev) => prev.map((item) => item.key === tabKey ? { ...item, loadingOlderMessages: true } : item));
    try {
      const data = await apiGet<unknown>(
        `/api/chat/sessions/${encodeURIComponent(tab.sessionId)}/messages?novelId=${encodeURIComponent(requestedNovelId)}&limit=80&before=${encodeURIComponent(tab.olderMessagesCursor)}`,
      );
      const page = pickMessages(data);
      if (contextRef.current.novelId !== requestedNovelId) return false;
      setTabs((prev) => prev.map((item) => {
        if (item.key !== tabKey || item.sessionId !== tab.sessionId) return item;
        const existingIds = new Set(item.messages.map((message) => message.id));
        return {
          ...item,
          messages: [...page.items.filter((message) => !existingIds.has(message.id)), ...item.messages],
          olderMessagesCursor: page.beforeId,
          hasOlderMessages: page.hasMore,
          loadingOlderMessages: false,
        };
      }));
      return true;
    } catch (error) {
      setTabs((prev) => prev.map((item) => item.key === tabKey ? { ...item, loadingOlderMessages: false } : item));
      throw error;
    }
  }, []);

  /** 外部接流轮次的落库：会话不存在时先建，再存 user+assistant。 */
  const persistExchange = React.useCallback(
    async (
      sessionId: string | null,
      tabKey: string,
      agentId: AgentId,
      userText: string,
      reply: ExchangeReply,
    ): Promise<boolean> => {
      const target = await ensureSession(tabKey, agentId, sessionId);
      if (!target) return false;
      return persistMessages(target, userText, reply);
    },
    [ensureSession, persistMessages],
  );

  /* ---------------- 资料助手（外部接流） ---------------- */

  const beginExchange = React.useCallback(
    (userText: string, replaceId?: string): string => {
      const current = stateRef.current;
      const tab = current.tabs.find((item) => item.key === current.activeKey) ?? current.tabs[0];
      const tabKey = tab?.key ?? current.activeKey;
      const assistant = createMessage("assistant");
      assistant.status = "streaming";
      if (replaceId) {
        assistant.id = replaceId;
        setTabs(prev => prev.map(t => t.key === tabKey ? {...t, messages: t.messages.map(m => m.id === replaceId ? assistant : m)} : t));
      } else appendMessages(tabKey, [createMessage("user", userText), assistant]);
      exchangeRef.current = {
        assistantId: assistant.id,
        tabKey,
        agentId: tab?.agentId ?? defaultAgentId,
        userText,
      };
      exchangePatchesRef.current.clear();
      streamingRef.current = true;
      setStreaming(true);
      setStreamingTabKey(tabKey);
      return assistant.id;
    },
    [appendMessages, defaultAgentId],
  );

  const patchExchange = React.useCallback(
    (assistantId: string, patch: Partial<UIMessage>) => {
      // 按 assistantId 在所有 tab 里找，而不是实时 activeKey：流式期间用户可能已切走
      const exchange = exchangeRef.current;
      const tab = findTabByMessage(assistantId);
      const tabKey = tab?.key ?? (exchange?.assistantId === assistantId ? exchange.tabKey : null);
      if (!tabKey) return;
      if (exchange?.assistantId === assistantId) {
        exchangePatchesRef.current.set(assistantId, {
          ...(exchangePatchesRef.current.get(assistantId) ?? {}),
          ...patch,
        });
      }
      patchMessage(tabKey, assistantId, (message) => ({ ...message, ...patch }));
    },
    [findTabByMessage, patchMessage],
  );

  const endExchange = React.useCallback(
    async (options?: EndExchangeOptions): Promise<void> => {
      const exchange = exchangeRef.current;
      const patch = exchange ? { ...(exchangePatchesRef.current.get(exchange.assistantId) ?? {}) } : null;
      exchangeRef.current = null;
      exchangePatchesRef.current.clear();

      streamingRef.current = false;
      abortRef.current = null;
      setStreaming(false);
      setStreamingTabKey(null);

      if (!exchange) return;
      // 复位发起轮次的 tab（流式期间可能已切走），清掉残留的 streaming 占位状态
      const tab = findTabByMessage(exchange.assistantId);
      if (tab) {
        patchMessage(tab.key, exchange.assistantId, (message) =>
          message.status === "streaming" ? { ...message, status: "complete" } : message,
        );
      }

      if (options?.persist !== true || !patch) return;
      const content = patch.content ?? "";
      if (!content.trim()) return;
      const exchangeTab = stateRef.current.tabs.find((item) => item.key === exchange.tabKey);
      if (!exchangeTab) return;
      const sessionId = exchangeTab.sessionId;
      await persistExchange(sessionId, exchange.tabKey, exchange.agentId, exchange.userText, {
        content,
        reasoning: patch.reasoning,
        actions: patch.actions,
        status: patch.status === "error" || patch.status === "aborted" ? patch.status : "complete",
        provider: patch.provider,
        model: patch.model,
        usage: patch.usage ?? null,
        error: patch.error ?? "",
      });
    },
    [findTabByMessage, patchMessage, persistExchange],
  );

  const prepareSession=React.useCallback(async()=>{
    const current=stateRef.current.tabs.find(t=>t.key===stateRef.current.activeKey);
    return current?ensureSession(current.key,current.agentId,current.sessionId):null;
  },[ensureSession]);
  return {
    prepareSession,
    tabs,
    activeKey,
    activeTab,
    streaming,
    streamingTabKey,
    modelLabel,
    send,
    stop,
    retry,
    removeMessage,
    selectTab,
    newTab,
    closeTab,
    closeSession,
    setAgent,
    openSession,
    loadOlderMessages,
    beginExchange,
    patchExchange,
    endExchange,
  };
}
