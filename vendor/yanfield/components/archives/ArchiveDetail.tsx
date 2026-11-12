"use client";

/**
 * 档案详情：五块档案（本章/角色/设定/总账/时间线）+ 伏笔 + 待确认冲突
 * 过期档案给「重新提取」；冲突给两种处理说明（当前版本仅标记，数据以 API 为准）
 */
import * as React from "react";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Coins,
  Clock3,
  FileWarning,
  Link2,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Sheet, useToast } from "@/components/ui/kit";
import { apiDelete, notifyDataChanged } from "@/lib/client/api";
import { ARCHIVE_STATUS_LABEL, type Chapter, type StoryArchive } from "@/lib/types";
import { cn, formatRelativeTime, formatWords } from "@/lib/ui/cn";
import { PanelCard, stripChapterNumber } from "@/components/outline/form-kit";
import { extractChapterArchive } from "./extract";
import { ArchiveEditor } from "./ArchiveEditor";

function EmptyBlock({ text }: { text: string }) {
  return <p className="px-4 py-4 text-[12px] text-ink-3">{text}</p>;
}

function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[96px_1fr] gap-2 border-t border-line px-3.5 py-2 first:border-t-0", className)}>
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className="min-w-0 text-[12px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

export function ArchiveDetail({
  novelId,
  archive,
  chapter,
  chapterNo,
  onChanged,
}: {
  novelId: string;
  archive: StoryArchive;
  chapter?: Chapter;
  chapterNo?: number;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);
  const [markSheetOpen, setMarkSheetOpen] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const stale = archive.status === "stale";

  const reextract = async () => {
    if (!archive.chapterId) {
      toast({ title: "没有关联章节，无法重新提取", tone: "error" });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setExtracting(true);
    try {
      const result = await extractChapterArchive({ novelId, chapterId: archive.chapterId, signal: controller.signal });
      if (result.ok) {
        const conflicts = result.newConflicts ?? 0;
        if (result.preservedManual) {
          toast({
            title: "档案已更新，保留了你的手动修改",
            description:
              conflicts > 0
                ? `有 ${conflicts} 处档案与正文不一致，已列入「待确认冲突」。如果你的校订是对的，记得同步修改正文。`
                : "只补充了正文里新增的事实。",
            tone: conflicts > 0 ? "default" : "success",
          });
        } else {
          toast({ title: "档案已重新提取", description: archive.chapterTitle, tone: "success" });
        }
        notifyDataChanged("archives");
        onChanged();
      } else {
        toast({ title: "重新提取失败", description: result.error, tone: "error" });
      }
    } catch (error) {
      toast({
        title: "重新提取失败",
        description: error instanceof Error ? error.message : "提取档案时发生错误",
        tone: "error",
      });
    } finally {
      setExtracting(false);
      abortRef.current = null;
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/api/archives/${archive.id}`);
      setConfirmDeleteOpen(false);
      notifyDataChanged("archives");
      onChanged();
      toast({ title: "本章档案已删除", description: archive.chapterTitle, tone: "success" });
    } catch (err) {
      toast({ title: "删除档案失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const markConflict = (choice: "archive" | "chapter") => {
    setMarkSheetOpen(false);
    toast({
      title: choice === "archive" ? "已标记：保留档案记录" : "已标记：改为以正文为准",
      description:
        choice === "archive"
          ? "档案会保留这条记录。请同步修改正文，让正文与档案一致；之后重新提取也不会覆盖你手动改过的内容。"
          : "请点「编辑」改正档案里的这一条。手动改过的档案在重新提取时会被保留，所以只改正文不会自动纠正它。",
      tone: "default",
    });
  };

  return (
    <div className="space-y-3.5">
      <Card padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <Archive className="size-3.5 shrink-0 text-ink-3" />
              第 {chapterNo ?? (archive.orderIndex || 1)} 章 ·{" "}
              {stripChapterNumber(archive.chapterTitle || chapter?.title || "")}
            </div>
            <p className="mt-1 text-[11.5px] text-ink-3">
              {formatWords(archive.sourceWordCount)} 正文 · {archive.generatedBy === "ai" ? "AI 提取" : "手动维护"}
              {archive.model ? ` · ${archive.model}` : ""} · 更新于 {formatRelativeTime(archive.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={stale ? "gold" : archive.status === "pending" ? "danger" : "jade"}>
              {ARCHIVE_STATUS_LABEL[archive.status] ?? "最新"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="size-3.5" />}
              loading={extracting}
              onClick={() => void reextract()}
            >
              重新提取
            </Button>
            <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditorOpen(true)}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-surface-2"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              删除
            </Button>
          </div>
        </div>
      </Card>

      {archive.generatedBy === "manual" ? (
        <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
          <Pencil className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">
            你手动校订过这份档案。重新提取会保留你的修改，只补充正文里新增的事实；如果你改的是事实（比如人数、物品、时间），请同步修改正文，否则会被列为「待确认冲突」，后续章节的
            AI 也可能读到前后矛盾的信息。
          </p>
        </div>
      ) : null}

      {stale ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-gold-soft px-3.5 py-2.5">
          <FileWarning className="size-4 shrink-0 text-gold" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">
            本章正文在此档案生成后被修改过，档案可能已过期。建议重新提取，避免后续章节沿用旧事实。
          </p>
          <Button variant="secondary" size="sm" loading={extracting} onClick={() => void reextract()}>
            重新提取
          </Button>
        </div>
      ) : null}

      {archive.conflicts.length > 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
            <AlertTriangle className="size-4 shrink-0 text-danger" />
            <span className="text-[12.5px] font-medium text-ink">待确认冲突 {archive.conflicts.length} 项</span>
            <span className="text-[11px] text-ink-3">档案与正文表述不一致，需要人来裁决，AI 不自行取舍。</span>
            <Button variant="ghost" size="sm" className="ml-auto text-ink-3" onClick={() => setMarkSheetOpen(true)}>
              查看处理方式
            </Button>
          </div>
          <div className="divide-y divide-line">
            {archive.conflicts.map((conflict, index) => (
              <div key={index} className="px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                  <Badge tone="danger">待确认</Badge>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-ink">{conflict.topic || "未命名冲突"}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-2">{conflict.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <PanelCard title="本章档案" icon={<BookOpen className="size-3.5" />} description="只记录正文里写过的事，不补推断。">
        {archive.chapterSummary ? (
          <p className="whitespace-pre-wrap px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-2">{archive.chapterSummary}</p>
        ) : (
          <EmptyBlock text="本章还没有事实摘要。" />
        )}
      </PanelCard>

      <PanelCard title="角色档案" icon={<Users className="size-3.5" />} description="角色名 · 本章结束时的状态 · 本章发生的变化">
        {archive.characterStates.length === 0 ? (
          <EmptyBlock text="本章没有角色状态记录。" />
        ) : (
          <div>
            {archive.characterStates.map((item, index) => (
              <Row key={index} label={<span className="text-ink-2">{item.name || "未命名"}</span>}>
                <p>{item.state || "状态未记录"}</p>
                {item.changes ? <p className="mt-0.5 text-ink-3">变化：{item.changes}</p> : null}
              </Row>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard title="设定档案" icon={<Link2 className="size-3.5" />} description="设定名 · 本章被推进或改变的部分">
        {archive.settingStates.length === 0 ? (
          <EmptyBlock text="本章没有设定变动记录。" />
        ) : (
          <div>
            {archive.settingStates.map((item, index) => (
              <Row key={index} label={<span className="text-ink-2">{item.title || "未命名设定"}</span>}>
                {item.state || "状态未记录"}
              </Row>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard title="人物总账" icon={<Coins className="size-3.5" />} description="人情、债务、代价的收支与结余">
        {archive.ledger.length === 0 ? (
          <EmptyBlock text="本章没有账目变化。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-ink-3">
                  <th className="px-3.5 py-2 font-normal">项目</th>
                  <th className="px-2 py-2 font-normal">变化</th>
                  <th className="px-2 py-2 font-normal">结余</th>
                  <th className="px-3.5 py-2 font-normal">备注</th>
                </tr>
              </thead>
              <tbody>
                {archive.ledger.map((item, index) => (
                  <tr key={index} className="border-b border-line last:border-b-0">
                    <td className="px-3.5 py-2 text-ink-2">{item.name || "—"}</td>
                    <td
                      className={cn(
                        "px-2 py-2 tabular-nums",
                        item.delta.startsWith("-") ? "text-danger" : item.delta.startsWith("+") ? "text-jade" : "text-ink-2",
                      )}
                    >
                      {item.delta || "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-ink-2">{item.balance || "—"}</td>
                    <td className="px-3.5 py-2 text-ink-3">{item.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <PanelCard title="时间线" icon={<Clock3 className="size-3.5" />} description="故事内时间 · 发生的事">
        {archive.timeline.length === 0 ? (
          <EmptyBlock text="本章没有时间线记录。" />
        ) : (
          <ol className="space-y-0">
            {archive.timeline.map((item, index) => (
              <li key={index} className="flex gap-3 border-t border-line px-3.5 py-2 first:border-t-0">
                <span className="w-24 shrink-0 text-[11.5px] tabular-nums text-ink-3">{item.storyTime || "—"}</span>
                <span className="min-w-0 text-[12px] leading-relaxed text-ink-2">{item.event || "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </PanelCard>

      {archive.foreshadows.length > 0 ? (
        <PanelCard title="伏笔状态" icon={<Link2 className="size-3.5" />} description="本章涉及的伏笔与推进情况">
          <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
            {archive.foreshadows.map((item, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-ink-2"
              >
                {item.title}
                {item.status ? <span className="text-ink-3">· {item.status}</span> : null}
              </span>
            ))}
          </div>
          {archive.foreshadows.some((item) => item.note) ? (
            <div className="border-t border-line">
              {archive.foreshadows
                .filter((item) => item.note)
                .map((item, index) => (
                  <Row key={index} label={<span className="text-ink-2">{item.title}</span>}>
                    {item.note}
                  </Row>
                ))}
            </div>
          ) : null}
        </PanelCard>
      ) : null}

      <ArchiveEditor
        open={editorOpen}
        novelId={novelId}
        archive={archive}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          notifyDataChanged("archives");
          onChanged();
        }}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除本章档案？"
        description={`「${archive.chapterTitle}」的档案会被删除，正文不会受影响。此操作不可撤销。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      <Sheet open={markSheetOpen} onClose={() => setMarkSheetOpen(false)} title="冲突处理方式" width={520}>
        <div className="space-y-4 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            档案与正文冲突时，程序不替你做判断。两种处理方式都只做登记，不会自动改稿：
          </p>
          <button
            type="button"
            onClick={() => markConflict("archive")}
            className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <p className="text-[13px] font-medium text-ink">保留档案记录</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
              认定档案是对的：后续按档案事实继续写，回头再决定是否修正正文。
            </p>
          </button>
          <button
            type="button"
            onClick={() => markConflict("chapter")}
            className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <p className="text-[13px] font-medium text-ink">改为以正文依据</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
              认定正文是对的：请手动编辑档案，或改完正文后重新提取，让档案与正文一致。
            </p>
          </button>
          <p className="text-[11px] leading-relaxed text-ink-3">
            当前版本冲突项只做红色标记与说明，档案数据始终以接口返回为准。
          </p>
        </div>
      </Sheet>
    </div>
  );
}
