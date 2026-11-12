"use client";

/**
 * 砚田 UI Kit — 统一的基础组件
 * 设计约束：只用设计 token 类名（bg-paper / bg-surface / text-ink / border-line / text-accent ...），
 * 不写死颜色；圆角 rounded-md(10px) / rounded-lg(14px)；动效 150–250ms。
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { yanfieldPanelBounds, yanfieldPortal } from "@/lib/ui/portal";
import { useOnClickOutside } from "@/lib/ui/hooks";
import { isInsideComposedPath } from "@/lib/ui/composed";

/* ============================== Button ============================== */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover shadow-card border border-transparent disabled:bg-accent/50",
  secondary:
    "bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong shadow-xs",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent",
  danger: "bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15",
  subtle: "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink border border-transparent",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-sm",
  md: "h-9 px-4 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-md",
  icon: "h-9 w-9 rounded-md justify-center",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-all duration-200 outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
}

export function IconButton({ label, active, size = "md", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-transparent transition-all duration-200",
        "text-ink-2 hover:bg-surface-2 hover:text-ink",
        size === "sm" && "size-7",
        size === "md" && "size-8",
        size === "lg" && "size-10",
        active && "bg-accent-soft text-accent hover:bg-accent-soft",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ============================== 表单 ============================== */

const fieldBase =
  "w-full rounded-md border border-line bg-surface text-ink placeholder:text-ink-4 transition-colors duration-200 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10 disabled:opacity-60";

function FieldLabel({ id, label, hint, error }: { id?: string; label?: React.ReactNode; hint?: React.ReactNode; error?: string | null }) {
  if (!label && !hint && !error) return null;
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      {label ? (
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
      ) : (
        <span />
      )}
      {error ? (
        <span className="text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[12px] text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  prefix?: React.ReactNode;
}

export function Input({ label, hint, error, prefix, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name ?? undefined;
  return (
    <div className="w-full">
      <FieldLabel id={inputId} label={label} hint={hint} error={error} />
      <div className="relative">
        {prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">{prefix}</span> : null}
        <input
          id={inputId}
          className={cn(fieldBase, "h-9 px-3 text-sm", prefix && "pl-9", error && "border-danger/60", className)}
          {...rest}
        />
      </div>
    </div>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const inputId = id ?? rest.name ?? undefined;
  return (
    <div className="w-full">
      <FieldLabel id={inputId} label={label} hint={hint} error={error} />
      <textarea
        id={inputId}
        className={cn(fieldBase, "min-h-24 resize-y px-3 py-2 text-sm leading-relaxed", error && "border-danger/60", className)}
        {...rest}
      />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  id,
  name,
  value,
  onChange,
  disabled,
  required,
  "aria-label": ariaLabel,
}: SelectProps) {
  const selectId = id ?? name;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const current = options.find((opt) => opt.value === String(value ?? ""));
  const muted = !current;
  const shown = current?.label ?? placeholder ?? "请选择";

  const emit = (next: string) => {
    setOpen(false);
    anchorRef.current?.focus();
    onChange?.({
      target: { value: next, name: name ?? "" },
      currentTarget: { value: next, name: name ?? "" },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  const place = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, 168);
    const menuHeight = menuRef.current?.offsetHeight ?? 240;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < Math.min(menuHeight, 180) && spaceAbove > spaceBelow;
    // 菜单行高 32px、内边距 8px：把可用高度取整到整行，避免最后一项只露出半行。
    const space = (openUp ? spaceAbove : spaceBelow) - 8;
    const rows = Math.max(4, Math.min(9, Math.floor(space / 32)));
    const maxHeight = rows * 32 + 8;
    const top = openUp ? Math.max(8, rect.top - Math.min(menuHeight, maxHeight) - 6) : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setBox({ top, left, width, maxHeight });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const selected = options.findIndex((opt) => opt.value === String(value ?? ""));
    setActive(selected >= 0 ? selected : 0);
    place();
    const frame = window.requestAnimationFrame(place);
    const onPointerDown = (event: PointerEvent) => {
      // shadow DOM 下 event.target 会被重定向到 host，必须用 composedPath 判断
      if (isInsideComposedPath(event, [menuRef.current, anchorRef.current])) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    const timer = window.setTimeout(() => menuRef.current?.focus(), 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, options, place, value]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      anchorRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => {
        let next = index;
        for (let guard = 0; guard < options.length; guard += 1) {
          next = (next + step + options.length) % options.length;
          if (!options[next]?.disabled) break;
        }
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option && !option.disabled) emit(option.value);
    }
  };

  return (
    <div className="w-full">
      <FieldLabel id={selectId} label={label} hint={hint} error={error} />
      <button
        ref={anchorRef}
        id={selectId}
        type="button"
        name={name}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          fieldBase,
          "flex h-9 items-center justify-between gap-2 px-3 text-left text-sm",
          open && "border-accent/60 ring-2 ring-accent/10",
          error && "border-danger/60",
          disabled && "cursor-not-allowed",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", muted && "text-ink-4")}>{shown}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              tabIndex={-1}
              role="listbox"
              aria-labelledby={selectId}
              onKeyDown={onMenuKeyDown}
              className="scroll-thin fixed z-[80] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-float outline-none rise-in"
              style={{ top: box?.top ?? -9999, left: box?.left ?? -9999, width: box?.width ?? 168, maxHeight: box?.maxHeight ?? 280 }}
            >
              {placeholder ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={String(value ?? "") === ""}
                  onClick={() => emit("")}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-3 transition-colors hover:bg-surface-2",
                    String(value ?? "") === "" && "bg-accent-soft text-accent",
                  )}
                >
                  {placeholder}
                </button>
              ) : null}
              {options.map((opt, index) => {
                const selected = opt.value === String(value ?? "");
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      if (!opt.disabled) emit(opt.value);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                      selected ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-2",
                      index === active && !selected && "bg-surface-2",
                      opt.disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {selected ? <Check className="size-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>,
            yanfieldPortal(),
          )
        : null}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}

export function Switch({ checked, onChange, label, hint, disabled, "aria-label": ariaLabel }: SwitchProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-xs transition-all duration-200",
            checked ? "left-4.5" : "left-0.5",
          )}
          style={{ left: checked ? 18 : 2 }}
        />
      </button>
      {(label || hint) && (
        <span className="min-w-0">
          {label ? <span className="block text-sm text-ink">{label}</span> : null}
          {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{hint}</span> : null}
        </span>
      )}
    </label>
  );
}

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, label, hint, disabled }: SliderProps) {
  return (
    <div className="w-full">
      {(label || hint) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-ink-2">{label}</span>
          <span className="text-[12px] tabular-nums text-ink-3">{hint ?? value}</span>
        </div>
      )}
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-accent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-xs"
      />
    </div>
  );
}

/* ============================== 展示 ============================== */

export function Card({
  children,
  className,
  padded = true,
  hover = false,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  hover?: boolean;
  as?: React.ElementType;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-line bg-surface shadow-xs",
        padded && "p-4",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export type BadgeTone = "default" | "accent" | "jade" | "gold" | "danger" | "success";

const badgeTones: Record<BadgeTone, string> = {
  default: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  jade: "bg-jade-soft text-jade border-jade/20",
  gold: "bg-gold-soft text-gold border-gold/25",
  danger: "bg-danger/10 text-danger border-danger/20",
  success: "bg-success/10 text-success border-success/20",
};

export function Badge({ tone = "default", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <Loader2
      className={cn("animate-spin text-ink-3", size === "sm" && "size-3.5", size === "md" && "size-4", size === "lg" && "size-6", className)}
      aria-label="加载中"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} />;
}

export function Progress({ value, max = 100, className, tone = "accent" }: { value: number; max?: number; className?: string; tone?: "accent" | "jade" | "gold" }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", tone === "accent" && "bg-accent", tone === "jade" && "bg-jade", tone === "gold" && "bg-gold")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-ink-3">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ============================== Tabs / Segmented ============================== */

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

export function Tabs({ tabs, value, onChange, className }: { tabs: TabItem[]; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-line", className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors duration-150",
              active ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === "number" ? <span className="text-[11px] tabular-nums text-ink-4">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { value: string; label: React.ReactNode; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5", className)}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm font-medium transition-all duration-150",
              size === "sm" ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================== 浮层 ============================== */

export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  multiline = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "center" | "start" | "end";
  /** 说明较长时换行，避免一条横条撑出屏幕 */
  multiline?: boolean;
}) {
  const place =
    side === "bottom" && align === "end"
      ? "right-0 top-full mt-2"
      : side === "bottom" && align === "start"
        ? "left-0 top-full mt-2"
        : side === "top" && align === "end"
          ? "bottom-full right-0 mb-2"
          : side === "top" && align === "start"
            ? "bottom-full left-0 mb-2"
            : side === "top"
              ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
              : side === "bottom"
                ? "left-1/2 top-full mt-2 -translate-x-1/2"
                : side === "left"
                  ? "right-full top-1/2 mr-2 -translate-y-1/2"
                  : "left-full top-1/2 ml-2 -translate-y-1/2";
  return (
    <span className="group/tooltip relative inline-flex">
      {React.isValidElement<{title?:string}>(children)?React.cloneElement(children,{title:undefined}):children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[80] hidden rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-2 shadow-float group-hover/tooltip:block group-focus-within/tooltip:block",
          multiline ? "w-64 max-w-[min(16rem,calc(100vw-3rem))] whitespace-normal text-left leading-relaxed" : "whitespace-nowrap",
          place,
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

function Overlay({ children, onClose, className, align = "center" }: { children: React.ReactNode; onClose: () => void; className?: string; align?: "center" | "right" }) {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const bounds = React.useMemo(() => yanfieldPanelBounds(), []);
  const boundsStyle: React.CSSProperties | undefined = bounds
    ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, right: "auto", bottom: "auto" }
    : undefined;
  return createPortal(
    <div
      className={cn("fixed z-50 flex bg-black/35 backdrop-blur-[2px] fade-in", align === "center" ? "items-center justify-center overflow-y-auto p-4" : "justify-end")}
      style={boundsStyle}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>,
    yanfieldPortal(),
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, description, footer, width = 560, children }: DialogProps) {
  const mounted = useMounted();
  if (!open || !mounted) return null;
  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="rise-in w-full rounded-lg border border-line bg-surface shadow-float"
        style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p> : null}
          </div>
          <IconButton label="关闭" onClick={onClose} size="sm">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scroll-thin max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </Overlay>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmText = "确认", cancelText = "取消", danger, loading, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-ink-2">
        {description ?? "此操作不可撤销，请确认。"}
      </div>
    </Dialog>
  );
}

export function Sheet({ open, onClose, title, children, width = 420, footer }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; width?: number | string; footer?: React.ReactNode }) {
  const mounted = useMounted();
  if (!open || !mounted) return null;
  return (
    <Overlay onClose={onClose} align="right">
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full flex-col border-l border-line bg-surface shadow-float"
        style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          <IconButton label="关闭" onClick={onClose} size="sm">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </Overlay>
  );
}

export type DropdownItem =
  | { label: React.ReactNode; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void; hint?: React.ReactNode }
  | { separator: true };

export function Dropdown({
  trigger,
  items,
  align = "end",
  width = 208,
}: {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  // 菜单用 portal 渲染到 body：避免被 header/滚动容器的 overflow 裁切，也避免 z-index 被父级层级压住
  React.useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.min(Math.max(8, left), Math.max(8, vw - width - 8));
      let top = rect.bottom + 6;
      if (menuHeight > 0 && top + menuHeight > vh - 8) {
        top = Math.max(8, rect.top - menuHeight - 6);
      }
      setPos({ top, left });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    const onPointerDown = (event: PointerEvent) => {
      // shadow DOM 下 event.target 会被重定向到 host，必须用 composedPath 判断
      if (isInsideComposedPath(event, [menuRef.current, anchorRef.current])) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, align, width]);

  return (
    <span ref={anchorRef} className="inline-flex">
      <span onClick={() => setOpen((v) => !v)} className="inline-flex">
        {trigger}
      </span>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[80] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-float rise-in"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
              role="menu"
            >
              {items.map((item, index) =>
                "separator" in item ? (
                  <div key={`sep-${index}`} className="my-1 h-px bg-line" />
                ) : (
                  <button
                    key={index}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150",
                      item.danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-surface-2",
                      item.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {item.icon ? <span className="shrink-0 text-ink-3">{item.icon}</span> : null}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint ? <span className="text-[11px] text-ink-4">{item.hint}</span> : null}
                  </button>
                ),
              )}
            </div>,
            yanfieldPortal(),
          )
        : null}
    </span>
  );
}

/* ============================== Toast ============================== */

export type ToastTone = "default" | "success" | "error";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone; duration?: number }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 <ToastProvider> 内使用");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const toast = React.useCallback((input: { title: string; description?: string; tone?: ToastTone; duration?: number }) => {
    const id = ++counter.current;
    const item: ToastItem = { id, title: input.title, description: input.description, tone: input.tone ?? "default" };
    setItems((prev) => [...prev.slice(-3), item]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), input.duration ?? 3200);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rise-in flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 shadow-float backdrop-blur glass",
              item.tone === "success" && "border-success/30",
              item.tone === "error" && "border-danger/30",
              item.tone === "default" && "border-line",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 items-center justify-center rounded-full",
                item.tone === "success" ? "bg-success/15 text-success" : item.tone === "error" ? "bg-danger/15 text-danger" : "bg-surface-2 text-ink-3",
              )}
            >
              {item.tone === "success" ? <Check className="size-3" /> : item.tone === "error" ? <X className="size-3" /> : <Check className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-5 text-ink">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{item.description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="关闭提示"
              className="mt-0.5 text-ink-4 transition-colors hover:text-ink-2"
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ============================== Markdown（安全轻量渲染） ============================== */

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // React escapes text nodes and attributes; pre-escaping would display entities literally.
  const source = text;
  let last = 0;
  let index = 0;
  for (const match of source.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(source.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer noopener" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            {linkMatch[1]}
          </a>,
        );
      } else nodes.push(token);
    }
    last = start + token.length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

/** 安全 Markdown 渲染：不渲染原始 HTML，仅支持常用语法 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => {
    const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
    const out: React.ReactNode[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    let code: { lang: string; lines: string[] } | null = null;
    let key = 0;

    const flushList = () => {
      if (!list) return;
      const items = list.items.map((item, i) => <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>);
      out.push(list.ordered ? <ol key={`ol-${key++}`} className="my-2 list-decimal space-y-1 pl-5">{items}</ol> : <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5">{items}</ul>);
      list = null;
    };
    const flushCode = () => {
      if (!code) return;
      out.push(
        <pre key={`pre-${key++}`} className="my-2 overflow-x-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-2">
          <code>{code.lines.join("\n")}</code>
        </pre>,
      );
      code = null;
    };

    /** 管道表格的分隔行，例如 |---|---| 或 |:--:|--:|。 */
    const isTableSeparator = (value: string) =>
      /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(value);
    /** 把一行 `a | b | c` 拆成单元格；首尾管道可有可无。 */
    const splitTableRow = (value: string) =>
      value
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replace(/\\\|/g, "|"));

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const raw = lines[lineIndex];
      const line = raw.replace(/\s+$/, "");
      if (code) {
        if (line.trim().startsWith("```")) flushCode();
        else code.lines.push(raw);
        continue;
      }
      if (line.trim().startsWith("```")) {
        flushList();
        code = { lang: line.trim().slice(3), lines: [] };
        continue;
      }
      if (!line.trim()) {
        flushList();
        continue;
      }
      // 管道表格：当前行有 |，且下一行是分隔行（|---|）。
      if (line.includes("|") && isTableSeparator(lines[lineIndex + 1] ?? "")) {
        flushList();
        const header = splitTableRow(line);
        const rows: string[][] = [];
        let rowIndex = lineIndex + 2;
        while (rowIndex < lines.length) {
          const rowLine = lines[rowIndex];
          if (!rowLine.trim() || !rowLine.includes("|")) break;
          rows.push(splitTableRow(rowLine));
          rowIndex += 1;
        }
        lineIndex = rowIndex - 1;
        out.push(
          <div key={`table-wrap-${key++}`} className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12.5px] leading-relaxed">
              <thead className="bg-surface-2 text-ink-3">
                <tr>
                  {header.map((cell, cellIndex) => (
                    <th key={cellIndex} className="border border-line px-2 py-1 font-medium">
                      {renderInline(cell, `th-${key}-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex2) => (
                  <tr key={rowIndex2} className="align-top">
                    {header.map((_, cellIndex) => (
                      <td key={cellIndex} className="border border-line px-2 py-1 text-ink-2">
                        {renderInline(row[cellIndex] ?? "", `td-${key}-${rowIndex2}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        flushList();
        const level = heading[1].length;
        const content = renderInline(heading[2], `h-${key}-${level}`);
        const cls =
          level === 1
            ? "mt-3 mb-2 text-[17px] font-semibold"
            : level === 2
              ? "mt-3 mb-1.5 text-[15px] font-semibold"
              : "mt-2.5 mb-1 text-[14px] font-semibold";
        out.push(React.createElement(`h${Math.min(4, level + 1)}`, { key: `h-${key++}`, className: `font-ui text-ink ${cls}` }, content));
        continue;
      }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushList();
        out.push(<hr key={`hr-${key++}`} className="my-3 border-line" />);
        continue;
      }
      if (line.trim().startsWith("> ")) {
        flushList();
        out.push(
          <blockquote key={`bq-${key++}`} className="my-2 border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed text-ink-2">
            {renderInline(line.trim().slice(2), `bq-${key}`)}
          </blockquote>,
        );
        continue;
      }
      const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (ordered) {
        if (!list || !list.ordered) {
          flushList();
          list = { ordered: true, items: [] };
        }
        list.items.push(ordered[2]);
        continue;
      }
      if (bullet) {
        if (!list || list.ordered) {
          flushList();
          list = { ordered: false, items: [] };
        }
        list.items.push(bullet[1]);
        continue;
      }
      flushList();
      out.push(
        <p key={`p-${key++}`} className="my-1.5 text-[13.5px] leading-[1.85] text-ink-2">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
    flushList();
    flushCode();
    return out;
  }, [text]);

  return <div className={cn("markdown-body", className)}>{blocks}</div>;
}
