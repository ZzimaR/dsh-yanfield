"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, FileText, FolderOpen, HardDriveDownload, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Spinner,
  useToast,
} from "@/components/ui/kit";
import { apiPost, apiUrl, notifyDataChanged, useApi } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import type { ImportChapterDraft, Novel, SystemInfo } from "@/lib/types";
import { countWords, formatWords } from "@/lib/ui/cn";
import { downloadNovelExport } from "@/components/library/utils";
import type { NovelListResponse } from "@/components/library/types";
import { navigateAfterSaving, useEditorSaveGuard } from "@/lib/editor/navigation";

interface ImportTxtResponse {
  chapters: { title: string; content: string }[];
}

interface ImportApplyResponse {
  volume: { id: string; title: string };
  chapters: { id: string; title: string }[];
}

type TargetMode = "existing" | "new";

const IMPORT_PREVIEW_LIMIT = 8;

export function DataSection() {
  const tr = useT();
  const router = useRouter();
  const { toast } = useToast();
  const saveGuard = useEditorSaveGuard();
  const novelsApi = useApi<NovelListResponse>("/api/novels");
  const systemApi = useApi<SystemInfo>("/api/system");
  const [openingDir, setOpeningDir] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [chapters, setChapters] = React.useState<ImportChapterDraft[]>([]);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);

  const [targetMode, setTargetMode] = React.useState<TargetMode>("existing");
  const [targetNovelId, setTargetNovelId] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [volumeTitle, setVolumeTitle] = React.useState("");

  const [demoOpen, setDemoOpen] = React.useState(false);
  const [demoLoading, setDemoLoading] = React.useState(false);

  const novels = novelsApi.data?.items ?? [];
  const importWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const canImport = chapters.length > 0 && (targetMode === "existing" ? Boolean(targetNovelId) : Boolean(newTitle.trim()));

  React.useEffect(() => {
    if (targetMode === "existing" && !targetNovelId && novels.length > 0) {
      setTargetNovelId(novels[0].id);
    }
  }, [targetMode, targetNovelId, novels]);

  const resetImport = () => {
    setFileName(null);
    setChapters([]);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickFile = async (file: File) => {
    setParsing(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/import/txt"), { method: "POST", body: form });
      const data = (await res.json()) as ImportTxtResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? tr("解析失败（{status}）", { status: res.status }));
      if (!data.chapters || data.chapters.length === 0) throw new Error(tr("没有解析出章节，检查一下文件内容或章节标题格式。"));
      setChapters(data.chapters);
      setFileName(file.name);
      toast({ title: tr("解析完成"), description: tr("识别到 {count} 章", { count: data.chapters.length }), tone: "success" });
    } catch (cause) {
      setChapters([]);
      setFileName(null);
      setImportError(cause instanceof Error ? cause.message : tr("解析失败，请稍后再试。"));
    } finally {
      setParsing(false);
    }
  };

  const applyImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setImportError(null);
    try {
      await saveGuard.flush();
      let novelId = targetNovelId;
      if (targetMode === "new") {
        const title = newTitle.trim();
        const novel = await apiPost<Novel>("/api/novels", { title, genre: "玄幻", synopsis: tr("由《{name}》导入", { name: fileName ?? "TXT" }) });
        novelId = novel.id;
      }
      await apiPost<ImportApplyResponse>("/api/import/apply", {
        novelId,
        chapters: chapters.map((chapter) => ({ title: chapter.title, content: chapter.content })),
        volumeTitle: volumeTitle.trim() || undefined,
      });
      notifyDataChanged("novels");
      notifyDataChanged("chapters");
      void novelsApi.refresh();
      toast({
        title: tr("导入完成"),
        description: volumeTitle.trim()
          ? tr("{count} 章已写入「{volume}」", { count: chapters.length, volume: volumeTitle.trim() })
          : tr("{count} 章已写入作品", { count: chapters.length }),
        tone: "success",
      });
      resetImport();
      router.push(`/novel/${novelId}`);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : tr("导入失败，请稍后再试。"));
    } finally {
      setImporting(false);
    }
  };

  const createDemo = async () => {
    setDemoLoading(true);
    try {
      await saveGuard.flush();
      const novel = await apiPost<Novel>("/api/demo", {});
      notifyDataChanged("novels");
      void novelsApi.refresh();
      toast({ title: tr("示例作品已生成"), description: tr("《潮信》可以直接打开试写。"), tone: "success" });
      setDemoOpen(false);
      router.push(`/novel/${novel.id}`);
    } catch (cause) {
      toast({
        title: tr("生成失败"),
        description: cause instanceof Error ? cause.message : tr("请稍后再试"),
        tone: "error",
      });
    } finally {
      setDemoLoading(false);
    }
  };

  const openNovel = (novelId: string) => {
    void navigateAfterSaving(saveGuard.flush, () => router.push(`/novel/${novelId}`)).catch((cause) => {
      toast({
        title: tr("无法打开作品"),
        description: cause instanceof Error ? cause.message : tr("请检查当前章节的保存状态。"),
        tone: "error",
      });
    });
  };

  const exportNovels = async (novelIds: string[], format: "md" | "txt") => {
    try {
      await saveGuard.flush();
      novelIds.forEach((novelId) => downloadNovelExport(novelId, { format, scope: "book" }));
    } catch (cause) {
      toast({
        title: tr("无法导出作品"),
        description: cause instanceof Error ? cause.message : tr("请检查当前章节的保存状态。"),
        tone: "error",
      });
    }
  };

  const copyDbPath = async () => {
    const dbPath = systemApi.data?.dbPath;
    if (!dbPath) return;
    try {
      await navigator.clipboard.writeText(dbPath);
      toast({ title: tr("已复制数据库路径"), description: tr("复制路径本身不会备份数据。"), tone: "success" });
    } catch {
      toast({ title: tr("复制失败"), description: dbPath, tone: "error" });
    }
  };

  const openDataDir = async () => {
    setOpeningDir(true);
    try {
      await apiPost("/api/system", { action: "open-data-dir" });
    } catch (cause) {
      toast({
        title: tr("无法打开文件夹"),
        description: cause instanceof Error ? cause.message : systemApi.data?.dataDir,
        tone: "error",
      });
    } finally {
      setOpeningDir(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-ink">{tr("数据")}</h2>
        <p className="mt-1 text-[12px] leading-6 text-ink-3">
          {tr("书稿是本地文件：可以整库备份、导出 Markdown，也可以把已有的 TXT 小说导入进来。")}
        </p>
      </div>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <HardDriveDownload className="size-3.5 text-ink-3" aria-hidden />
          {tr("本地备份")}
        </h3>
        <p className="mt-1.5 text-[12px] leading-6 text-ink-2">
          {tr("全部书稿、设置和 API Key 都保存在下面这个数据库文件里{location}：", {
            location: systemApi.data?.customDbPath ? tr("（自定义位置）") : "",
          })}
        </p>
        <p className="mt-1.5 break-all rounded-sm bg-surface-2 px-2 py-1.5 font-mono text-[11px] text-ink" data-testid="db-path">
          {systemApi.data?.dbPath ?? (systemApi.error ? tr("无法读取数据库位置") : tr("读取中…"))}
        </p>
        <p className="mt-1.5 text-[12px] leading-6 text-ink-2">
          {tr("备份时先停服，再复制整个文件夹（含可能存在的 -wal / -shm 文件）；运行中请使用 SQLite 在线备份，不要直接复制文件。")}
          {" "}
          {tr("数据库包含明文 API Key，请妥善保管。")}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<FolderOpen className="size-3.5" />}
            disabled={!systemApi.data || openingDir}
            onClick={() => void openDataDir()}
          >
            {tr("打开所在文件夹")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy className="size-3.5" />}
            disabled={!systemApi.data}
            onClick={() => void copyDbPath()}
          >
            {tr("复制路径")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="size-3.5" />}
            disabled={novels.length === 0}
            onClick={() => void exportNovels(novels.map((novel) => novel.id), "md")}
          >
            {tr("导出全部作品（Markdown）")}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <Download className="size-3.5 text-ink-3" aria-hidden />
            {tr("导出作品")}
          </h3>
          <span className="text-[11px] text-ink-3">{tr("{count} 部作品", { count: novels.length })}</span>
        </div>
        {novelsApi.loading && novels.length === 0 ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : novels.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line px-3 py-5 text-center text-[12px] text-ink-3">
            {tr("还没有作品可导出。")}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70">
            {novels.map((novel) => (
              <li key={novel.id} className="flex items-center gap-3 py-2.5">
                <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <Link
                  href={`/novel/${novel.id}`}
                  onNavigate={(event) => {
                    event.preventDefault();
                    openNovel(novel.id);
                  }}
                  className="min-w-0 flex-1 truncate text-[12.5px] text-ink hover:text-accent"
                >
                  {novel.title}
                </Link>
                <Badge tone="default">{tr(novel.genre)}</Badge>
                <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 sm:inline">
                  {tr("{words} 字", { words: formatWords(novel.wordCount ?? 0) })}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void exportNovels([novel.id], "md")}>
                    MD
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void exportNovels([novel.id], "txt")}>
                    TXT
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Upload className="size-3.5 text-ink-3" aria-hidden />
          {tr("导入 TXT")}
        </h3>
        <p className="mt-1.5 text-[11.5px] leading-5 text-ink-3">
          {tr("支持按「第 N 章 / 第N章」等常见标题自动拆章；先预览，确认后再写入。单次最多 2000 章（含前言），超出请拆分文件。")}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pickFile(file);
          }}
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={parsing ? <Spinner size="sm" /> : <Upload className="size-3.5" />}
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
          >
            {fileName ? tr("重新选择文件") : tr("选择 TXT / MD 文件")}
          </Button>
          {fileName ? <span className="truncate text-[11px] text-ink-3">{fileName}</span> : null}
          {chapters.length > 0 ? (
            <span className="text-[11px] text-ink-3">
              {tr("{count} 章 · 约 {words} 字", { count: chapters.length, words: formatWords(importWords) })}
            </span>
          ) : null}
          {chapters.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={resetImport}>
              {tr("清空")}
            </Button>
          ) : null}
        </div>

        {chapters.length > 0 ? (
          <div className="mt-3 space-y-3 rounded-md border border-line bg-surface-2/60 p-3">
            <div className="scroll-thin max-h-40 space-y-1 overflow-y-auto pr-1">
              {chapters.slice(0, IMPORT_PREVIEW_LIMIT).map((chapter, index) => (
                <div key={`${chapter.title}-${index}`} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-6 shrink-0 text-right font-mono text-[10px] text-ink-3">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{chapter.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">{tr("{words} 字", { words: formatWords(countWords(chapter.content)) })}</span>
                </div>
              ))}
              {chapters.length > IMPORT_PREVIEW_LIMIT ? (
                <p className="pl-8 text-[10.5px] text-ink-3">{tr("…共 {count} 章，仅预览前 {limit} 章", { count: chapters.length, limit: IMPORT_PREVIEW_LIMIT })}</p>
              ) : null}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Select
                label={tr("导入到")}
                value={targetMode}
                onChange={(event) => setTargetMode(event.target.value === "new" ? "new" : "existing")}
                options={[
                  { value: "existing", label: tr("已有作品") },
                  { value: "new", label: tr("新建作品") },
                ]}
              />
              {targetMode === "existing" ? (
                <Select
                  label={tr("目标作品")}
                  value={targetNovelId}
                  onChange={(event) => setTargetNovelId(event.target.value)}
                  options={novels.length > 0 ? novels.map((novel) => ({ value: novel.id, label: novel.title })) : [{ value: "", label: tr("还没有作品") }]}
                />
              ) : (
                <Input
                  label={tr("新作品书名")}
                  value={newTitle}
                  maxLength={80}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder={tr("例如：夜行录")}
                />
              )}
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                label={tr("装入哪一卷（可选）")}
                value={volumeTitle}
                maxLength={60}
                onChange={(event) => setVolumeTitle(event.target.value)}
                placeholder={tr("留空则创建「导入章节」卷")}
              />
              <div className="flex items-end">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  icon={importing ? <Spinner size="sm" /> : <Upload className="size-3.5" />}
                  disabled={!canImport || importing}
                  onClick={() => void applyImport()}
                >
                  {importing ? tr("正在导入…") : tr("确认导入")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {importError ? (
          <p className="mt-2 flex items-center gap-1 text-[11.5px] text-danger">
            <TriangleAlert className="size-3" aria-hidden />
            {importError}
          </p>
        ) : null}
      </Card>

      <Card className="border-danger/25 p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
          <TriangleAlert className="size-3.5" aria-hidden />
          {tr("危险区")}
        </h3>
        <p className="mt-1.5 text-[11.5px] leading-5 text-ink-3">
          {tr("重新生成示例作品《潮信》：会新增一部演示用的作品与章节，不会删除你已有的内容。")}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button variant="danger" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => setDemoOpen(true)}>
            {tr("重新生成示例作品")}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={demoOpen}
        title={tr("重新生成示例作品")}
        description={tr("会创建一部新的示例作品《潮信》，不影响现有作品。")}
        confirmText={tr("生成示例")}
        loading={demoLoading}
        onConfirm={() => void createDemo()}
        onClose={() => setDemoOpen(false)}
      />
    </div>
  );
}
