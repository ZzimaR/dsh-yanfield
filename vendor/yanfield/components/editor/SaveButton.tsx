"use client";

import { Save } from "lucide-react";
import { Button, Tooltip } from "@/components/ui/kit";

interface SaveButtonProps {
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}

export function SaveButton({ onSave, saving, disabled = false }: SaveButtonProps) {
  return (
    <Tooltip label="保存当前章节（Ctrl/⌘+S）">
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0 px-2 text-[12px]"
        aria-label="保存当前章节"
        icon={<Save className="size-3.5" aria-hidden />}
        loading={saving}
        disabled={disabled}
        onClick={onSave}
      >
        保存
      </Button>
    </Tooltip>
  );
}
