"use client";

import * as React from "react";
import { BookPlus } from "lucide-react";
import { Button, Dialog, Input, Select, Textarea } from "@/components/ui/kit";
import { apiPost, notifyDataChanged } from "@/lib/client/api";
import { GENRES, type Novel } from "@/lib/types";
import { CoverPicker } from "./CoverPicker";

export interface CreateNovelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (novel: Novel) => void;
}

const EMPTY_FORM = {
  title: "",
  genre: GENRES[0] as string,
  subtitle: "",
  synopsis: "",
  volumeTitle: "",
  coverKey: "ink",
};

/** 新建作品 Dialog：基本信息 + 可选的初始卷。 */
export function CreateNovelDialog({ open, onClose, onCreated }: CreateNovelDialogProps) {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError(null);
    setSaving(false);
  }, [open]);

  const update = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async () => {
    const title = form.title.trim();
    if (!title) {
      setError("先给作品起个名字吧。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const novel = await apiPost<Novel>("/api/novels", {
        title,
        genre: form.genre,
        subtitle: form.subtitle.trim(),
        synopsis: form.synopsis.trim(),
        coverKey: form.coverKey,
      });
      const volumeTitle = form.volumeTitle.trim();
      if (volumeTitle) {
        await apiPost(`/api/volumes`, { novelId: novel.id, title: volumeTitle });
      }
      notifyDataChanged("novels");
      onCreated(novel);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新建作品"
      description="先建一个容器，之后可以随时补大纲、设定与角色。"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" icon={<BookPlus className="size-4" />} onClick={submit} loading={saving}>
            创建作品
          </Button>
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="书名"
          autoFocus
          maxLength={80}
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="例如：潮信"
          error={error}
        />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="类型"
            value={form.genre}
            onChange={(event) => update("genre", event.target.value)}
            options={GENRES.map((item) => ({ value: item, label: item }))}
          />
          <Input
            label="一句话简介"
            maxLength={120}
            value={form.subtitle}
            onChange={(event) => update("subtitle", event.target.value)}
            placeholder="出现在封面与书架上"
          />
        </div>
        <CoverPicker value={form.coverKey} onChange={(coverKey) => update("coverKey", coverKey)} />
        <Textarea
          label="作品简介"
          rows={4}
          value={form.synopsis}
          onChange={(event) => update("synopsis", event.target.value)}
          placeholder="这本书讲什么？主角是谁？想写出什么感觉？"
        />
        <Input
          label="初始卷（可选）"
          maxLength={60}
          value={form.volumeTitle}
          onChange={(event) => update("volumeTitle", event.target.value)}
          placeholder="例如：第一卷 · 退潮"
          hint="留空则稍后在大纲里创建"
        />
      </form>
    </Dialog>
  );
}
