"use client";

import { Save } from "lucide-react";
import { Button, Tooltip } from "@/components/ui/kit";
import { useT } from "@/lib/i18n";

interface SaveButtonProps {
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}

export function SaveButton({ onSave, saving, disabled = false }: SaveButtonProps) {
  const tr = useT();
  return (
    <Tooltip label={tr("保存当前章节（Ctrl/⌘+S）")}>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0 px-2 text-[12px]"
        aria-label={tr("保存当前章节")}
        icon={<Save className="size-3.5" aria-hidden />}
        loading={saving}
        disabled={disabled}
        onClick={onSave}
      >
        {tr("保存")}
      </Button>
    </Tooltip>
  );
}
