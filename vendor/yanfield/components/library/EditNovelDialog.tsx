"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { Button, Dialog, Input, Select, Textarea } from "@/components/ui/kit";
import { apiPatch, notifyDataChanged } from "@/lib/client/api";
import { isValidNovelWordGoal, MAX_NOVEL_WORD_GOAL } from "@/lib/novel-goal";
import { GENRES, type Novel } from "@/lib/types";
import { CoverPicker } from "./CoverPicker";

export interface EditNovelDialogProps {
  open: boolean;
  novel: Novel | undefined;
  focusField?: "title" | "wordGoal";
  onClose: () => void;
  onSaved: (novel: Novel) => void;
}

interface EditForm {
  title: string;
  subtitle: string;
  genre: string;
  synopsis: string;
  coverKey: string;
  wordGoal: string;
}

const EMPTY_FORM: EditForm = {
  title: "",
  subtitle: "",
  genre: GENRES[0] as string,
  synopsis: "",
  coverKey: "ink",
  wordGoal: "1000000",
};

function formFromNovel(novel: Novel | undefined): EditForm {
  if (!novel) return EMPTY_FORM;
  return {
    title: novel.title,
    subtitle: novel.subtitle,
    genre: novel.genre,
    synopsis: novel.synopsis,
    coverKey: novel.coverKey || "ink",
    wordGoal: String(novel.wordGoal),
  };
}

/** 作品信息编辑 Dialog：PATCH /api/novels/[novelId]。 */
export function EditNovelDialog({ open, novel, focusField = "title", onClose, onSaved }: EditNovelDialogProps) {
  const [form, setForm] = React.useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<"title" | "wordGoal", string>>>({});
  const initializedNovelIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      initializedNovelIdRef.current = null;
      return;
    }
    const novelId = novel?.id ?? null;
    if (initializedNovelIdRef.current === novelId) return;
    initializedNovelIdRef.current = novelId;
    setForm(formFromNovel(novel));
    setError(null);
    setFieldErrors({});
    setSaving(false);
  }, [open, novel]);

  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setError(null);
    if (key === "title" || key === "wordGoal") {
      setFieldErrors((previous) => {
        const next = { ...previous };
        if (key === "title") delete next.title;
        else delete next.wordGoal;
        return next;
      });
    }
  };

  const submit = async () => {
    if (!novel) return;
    setFieldErrors({});
    setError(null);
    const title = form.title.trim();
    if (!title) {
      setFieldErrors({ title: "书名不能为空。" });
      return;
    }
    const wordGoalText = form.wordGoal.trim();
    const wordGoal = Number(wordGoalText);
    if (!/^\d+$/.test(wordGoalText) || !isValidNovelWordGoal(wordGoal)) {
      setFieldErrors({
        wordGoal: `目标字数需为 0 至 ${MAX_NOVEL_WORD_GOAL.toLocaleString("zh-CN")} 的整数；填 0 可不设置。`,
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<Novel>(`/api/novels/${novel.id}`, {
        title,
        subtitle: form.subtitle.trim(),
        genre: form.genre,
        synopsis: form.synopsis.trim(),
        coverKey: form.coverKey,
        wordGoal,
      });
      notifyDataChanged("novels");
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="编辑作品信息"
      description="书名、类型、简介、封面底色与全书目标字数会展示在作品信息中。"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" icon={<Save className="size-4" />} onClick={submit} loading={saving}>
            保存修改
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
          id="novel-title"
          label="书名"
          autoFocus={focusField === "title"}
          maxLength={80}
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="例如：潮信"
          error={fieldErrors.title}
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
        <Input
          id="novel-word-goal"
          label="全书目标字数"
          hint="0 表示不设置"
          type="number"
          min={0}
          max={MAX_NOVEL_WORD_GOAL}
          step={1000}
          inputMode="numeric"
          autoFocus={focusField === "wordGoal"}
          value={form.wordGoal}
          onChange={(event) => update("wordGoal", event.target.value)}
          error={fieldErrors.wordGoal}
        />
        <CoverPicker value={form.coverKey} onChange={(coverKey) => update("coverKey", coverKey)} />
        <Textarea
          label="作品简介"
          rows={4}
          value={form.synopsis}
          onChange={(event) => update("synopsis", event.target.value)}
          placeholder="这本书讲什么？主角是谁？想写出什么感觉？"
        />
        {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      </form>
    </Dialog>
  );
}
