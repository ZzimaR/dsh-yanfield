"use client";

/**
 * 历史会话 Sheet：
 * GET /api/chat/sessions?novelId= 拉取列表，支持新建（POST）与删除（DELETE）。
 * 后端会话接口不可用时优雅降级：提示错误或由面板新开本地会话。
 */
import * as React from "react";
import { CircleAlert, MessagesSquare, Plus, RefreshCw, Trash } from "lucide-react";
import type { AgentId, ChatSession } from "@/lib/types";
import { apiDelete, apiGet, apiPost, notifyDataChanged } from "@/lib/client/api";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Sheet,
  Skeleton,
  useToast,
} from "@/components/ui/kit";
import { cn, formatRelativeTime } from "@/lib/ui/cn";
import { resolveAgent } from "./utils";

export interface ChatHistorySheetProps {
  open: boolean;
  onClose: () => void;
  novelId: string;
  activeSessionId?: string | null;
  busySessionId?: string | null;
  /** 新建会话时使用的智能体 */
  defaultAgentId: AgentId;
  /** 已达到 3 个 Tab 上限时禁止新建 */
  maxTabsReached?: boolean;
  /** 打开某个历史会话（面板负责拉消息并切 Tab） */
  onOpenSession: (session: ChatSession) => void;
  /** 新建成功回调；session 为 null 表示后端不可用，需本地降级 */
  onCreateSession: (session: ChatSession | null) => void;
  /** 会话被删除（面板可关闭对应 Tab） */
  onDeleted?: (sessionId: string) => void;
}

function normalizeSessions(data: unknown): ChatSession[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : [];
  return list.filter((row): row is ChatSession => !!row && typeof row === "object" && "id" in row);
}

export function ChatHistorySheet({
  open,
  onClose,
  novelId,
  activeSessionId,
  busySessionId,
  defaultAgentId,
  maxTabsReached = false,
  onOpenSession,
  onCreateSession,
  onDeleted,
}: ChatHistorySheetProps) {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ChatSession | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!novelId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<unknown>(`/api/chat/sessions?novelId=${encodeURIComponent(novelId)}`);
      setSessions(normalizeSessions(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "会话列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const create = async () => {
    if (creating || maxTabsReached) return;
    setCreating(true);
    try {
      const session = await apiPost<ChatSession>("/api/chat/sessions", {
        novelId,
        agentId: defaultAgentId,
      });
      notifyDataChanged("chat-sessions");
      onClose();
      onCreateSession(session?.id ? session : null);
    } catch (err) {
      // 后端会话接口尚未就绪时，降级为本地会话，不阻塞使用
      toast({
        title: "已新开本地会话",
        description: err instanceof Error ? err.message : "云端会话暂不可用",
        tone: "default",
      });
      onClose();
      onCreateSession(null);
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!deleting || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await apiDelete(`/api/chat/sessions/${encodeURIComponent(deleting.id)}?novelId=${encodeURIComponent(novelId)}`);
      notifyDataChanged("chat-sessions");
      setSessions((prev) => prev.filter((item) => item.id !== deleting.id));
      onDeleted?.(deleting.id);
      setDeleting(null);
      toast({ title: "会话已删除", tone: "success" });
    } catch (err) {
      toast({
        title: "删除失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        tone: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="会话历史"
        width={400}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-4">
              {maxTabsReached ? "已打开 3 个会话，请先关闭一个" : `共 ${sessions.length} 个会话`}
            </span>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="size-3.5" />}
              loading={creating}
              disabled={maxTabsReached}
              onClick={() => void create()}
            >
              新建会话
            </Button>
          </div>
        }
      >
        <div className="p-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-4 text-center">
              <CircleAlert className="size-4 text-danger" />
              <p className="text-[12px] text-danger">{error}</p>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3" />} onClick={() => void load()}>
                重新加载
              </Button>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="size-5" />}
              title="还没有历史会话"
              description="新建一个会话，或直接在 AI 面板里提问（首次发送会自动创建会话）。"
              action={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus className="size-3.5" />}
                  loading={creating}
                  disabled={maxTabsReached}
                  onClick={() => void create()}
                >
                  新建会话
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {sessions.map((session) => {
                const active = session.id === activeSessionId;
                const agent = resolveAgent(session.agentId);
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg border px-3 py-3 transition-colors duration-150",
                      active
                        ? "border-accent/30 bg-accent-soft"
                        : "border-line bg-surface hover:bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSession(session);
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none"
                    >
                      <span className="block">
                        <span className="line-clamp-2 break-words text-[13px] font-medium leading-5 text-ink">
                          {session.title || "未命名会话"}
                        </span>

                      </span>
                      <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                        <span className="truncate">{agent.name}</span>
                        <span>·</span>
                        <span className="shrink-0 whitespace-nowrap">{formatRelativeTime(session.updatedAt)}</span>
                        {active ? <span className="ml-auto shrink-0 whitespace-nowrap rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">当前</span> : null}
                      </span>
                    </button>
                    <IconButton
                      label={session.id === busySessionId ? "请先停止此会话的生成，再删除" : "删除会话"}
                      size="sm"
                      disabled={session.id === busySessionId}
                      className="shrink-0 text-ink-4 opacity-50 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => setDeleting(session)}
                    >
                      <Trash className="size-3.5" />
                    </IconButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        title="删除会话"
        description={
          deleting
            ? `将删除「${deleting.title || "未命名会话"}」及其历史消息，删除后不可恢复。`
            : undefined
        }
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
