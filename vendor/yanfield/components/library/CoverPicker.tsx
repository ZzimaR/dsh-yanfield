"use client";

import * as React from "react";
import { customCoverKey, resolveCoverStyle } from "@/lib/cover";
import { COVER_STYLES } from "@/lib/types";
import { cn } from "@/lib/ui/cn";

export function CoverPicker({ value, onChange }: { value: string; onChange: (coverKey: string) => void }) {
  const resolved = resolveCoverStyle(value);
  const presetKey = COVER_STYLES[value] ? value : "";

  const setCustom = (from: string, to: string) => {
    onChange(customCoverKey(from, to));
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">封面底色</legend>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(COVER_STYLES).map(([key, style]) => {
          const selected = presetKey === key;
          return (
            <button
              key={key}
              type="button"
              aria-label={style.label}
              aria-pressed={selected}
              title={style.label}
              onClick={() => onChange(key)}
              className={cn(
                "h-9 w-11 rounded-md border border-black/10 shadow-xs transition-transform duration-150 hover:scale-105",
                selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
              )}
              style={{ backgroundImage: `linear-gradient(145deg, ${style.from}, ${style.to})` }}
            />
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-ink-3">
        <span>自定义</span>
        <label className="inline-flex items-center gap-1.5">
          起始
          <input
            type="color"
            aria-label="封面起始色"
            value={resolved.from}
            onChange={(event) => setCustom(event.target.value, resolved.to)}
            className="h-7 w-9 cursor-pointer rounded-sm border border-line bg-transparent p-0.5"
          />
        </label>
        <label className="inline-flex items-center gap-1.5">
          结束
          <input
            type="color"
            aria-label="封面结束色"
            value={resolved.to}
            onChange={(event) => setCustom(resolved.from, event.target.value)}
            className="h-7 w-9 cursor-pointer rounded-sm border border-line bg-transparent p-0.5"
          />
        </label>
        <span
          className="inline-flex h-7 min-w-16 items-center justify-center rounded-sm px-2 text-[11px]"
          style={{
            backgroundImage: `linear-gradient(145deg, ${resolved.from}, ${resolved.to})`,
            color: resolved.ink,
          }}
        >
          {resolved.label}
        </span>
      </div>
    </fieldset>
  );
}
