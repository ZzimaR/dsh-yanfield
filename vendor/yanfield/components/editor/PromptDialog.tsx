"use client";

import * as React from "react";
import { Button, Dialog, Input } from "@/components/ui/kit";

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  onClose: () => void;
  /** 返回 false 表示不关闭（校验失败或请求失败） */
  onSubmit: (value: string) => Promise<boolean | void>;
}

/** 单行文本输入弹窗：新建/重命名卷或章复用 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  confirmText = "确定",
  onClose,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(initialValue);
  const [busy, setBusy] = React.useState(false);

  // 每次打开时重置输入内容
  React.useEffect(() => {
    if (open) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [open, initialValue]);

  const submit = async (): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!value.trim()}>
            {confirmText}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {label ? <label className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</label> : null}
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
