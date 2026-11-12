"use client";

/**
 * 底部输入区：
 * - Textarea 自适应高度（最高 180px）
 * - `@` 触发引用选择器，引用 chips 可删除
 * - 模式切换：对话 / 起草 / 技能（技能=在输入框内展开技能列表，选中后填入 prompt 并切回对话）
 * - Enter 发送，Shift+Enter 换行（输入法合成中不误发）；生成中显示停止按钮
 * - 监听编辑器选区事件，提示「将引用选中正文 N 字」
 */
import * as React from "react";
import {
  AtSign,
  BookMarked,
  Check,
  ChevronDown,
  Gauge,
  MessageCircle,
  Palette,
  PenLine,
  Send,
  Sparkles,
  Square,
  UserCog,
  X,
} from "lucide-react";
import { Button, Dropdown, IconButton, Kbd, Segmented, type DropdownItem } from "@/components/ui/kit";
import { cn } from "@/lib/ui/cn";
import type { MentionRef, MentionOption, PanelMode } from "./types";
import { MENTION_TYPE_LABEL } from "./utils";
import { STYLE_OPTIONS } from "./styles";
import type { SkillOption } from "./skills";
import { MentionPicker } from "./MentionPicker";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  mentions: MentionRef[];
  onMentionsChange: (mentions: MentionRef[]) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  sending?: boolean;
  disabled?: boolean;
  novelId: string;
  chapterId?: string | null;
  placeholder?: string;
  onOpenContext?: () => void;
  includeSelection?: boolean;
  /** 输入区 chips：当前智能体名（显示在「智能体」chip 上） */
  agentName?: string;
  /** 打开智能体选择器（面板用 Sheet 承载） */
  onOpenAgent?: () => void;
  /** 当前文风；写入 ContextConfig.customInstruction */
  style?: string | null;
  onStyleChange?: (style: string | null) => void;
  /** 输入区底部左侧的模型选择器节点（由面板注入 ModelPicker） */
  modelSlot?: React.ReactNode;
  /** `/` 触发的技能快捷选项：选中后把 prompt 填入输入框 */
  skillOptions?: SkillOption[];
  /** 设定卡交给助手时带上的任务芯片，发送前可删 */
  task?: { label: string } | null;
  onClearTask?: () => void;
  /** 外部聚焦信号（编辑器 Alt+J），值变化时聚焦输入框 */
  focusSignal?: number;
  className?: string;
}

const MODE_OPTIONS = [
  { value: "chat", label: "对话", icon: <MessageCircle className="size-3" /> },
  { value: "draft", label: "起草", icon: <PenLine className="size-3" /> },
  { value: "skill", label: "技能", icon: <Sparkles className="size-3" /> },
];

export function ChatComposer({
  value,
  onChange,
  mode,
  onModeChange,
  mentions,
  onMentionsChange,
  onSend,
  onStop,
  streaming,
  sending = false,
  disabled = false,
  novelId,
  chapterId,
  placeholder = "说说想写什么，或选一段文字交给我…",
  onOpenContext,
  includeSelection = true,
  agentName,
  onOpenAgent,
  style = null,
  onStyleChange,
  modelSlot,
  skillOptions,
  task = null,
  onClearTask,
  focusSignal,
  className,
}: ChatComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mentionPickFirstRef = React.useRef<(() => boolean) | null>(null);
  const [mention, setMention] = React.useState<{ open: boolean; query: string; start: number }>({
    open: false,
    query: "",
    start: 0,
  });
  /** `/` 技能菜单（仅在行首或空白后、且未进入 @ 时出现） */
  const [slash, setSlash] = React.useState<{ open: boolean; query: string; start: number }>({
    open: false,
    query: "",
    start: 0,
  });
  const [selectionText, setSelectionText] = React.useState("");
  /** 中文输入法合成中：Enter 用来确认候选词，不能触发发送 */
  const composingRef = React.useRef(false);

  /* 自适应高度 */
  const resize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);
  React.useEffect(() => {
    resize();
  }, [value, resize]);

  /* 外部 Alt+J → 聚焦输入框 */
  React.useEffect(() => {
    if (!focusSignal) return;
    textareaRef.current?.focus();
  }, [focusSignal]);

  /* 编辑器选区变化 → 提示将引用选中正文 */
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; empty?: boolean }>).detail;
      setSelectionText(!detail?.empty && typeof detail?.text === "string" ? detail.text : "");
    };
    window.addEventListener("yanfield:editor-selection", handler as EventListener);
    return () => window.removeEventListener("yanfield:editor-selection", handler as EventListener);
  }, []);

  /** 检测光标前是否处于 @ 查询中 */
  const detectMention = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? 0;
    const before = el.value.slice(0, caret);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (match) {
      setMention({ open: true, query: match[2], start: caret - match[2].length - 1 });
    } else {
      setMention((prev) => (prev.open ? { open: false, query: "", start: 0 } : prev));
    }
  };

  /** 检测光标前是否处于 / 技能查询中（行首或空白后） */
  const detectSlash = (el: HTMLTextAreaElement) => {
    if (!skillOptions || skillOptions.length === 0) return;
    const caret = el.selectionStart ?? 0;
    const before = el.value.slice(0, caret);
    const match = /(^|\s)\/([^\s/]*)$/.exec(before);
    if (match) {
      setMention((prev) => (prev.open ? { open: false, query: "", start: 0 } : prev));
      setSlash({ open: true, query: match[2], start: caret - match[2].length - 1 });
    } else {
      setSlash((prev) => (prev.open ? { open: false, query: "", start: 0 } : prev));
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    detectMention(event.target);
    detectSlash(event.target);
  };

  const pickMention = (option: MentionOption) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const start = mention.open ? Math.max(0, Math.min(mention.start, value.length)) : caret;
    onChange(`${value.slice(0, start)}${value.slice(caret)}`);
    if (!mentions.some((item) => item.type === option.type && item.id === option.id)) {
      onMentionsChange([...mentions, { type: option.type, id: option.id, label: option.label }]);
    }
    setMention({ open: false, query: "", start: 0 });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start, start);
    });
  };

  const removeMention = (target: MentionRef) => {
    onMentionsChange(mentions.filter((item) => !(item.type === target.type && item.id === target.id)));
  };

  const insertAt = () => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    onChange(`${value.slice(0, caret)}@${value.slice(caret)}`);
    setSlash({ open: false, query: "", start: 0 });
    setMention({ open: true, query: "", start: caret });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret + 1, caret + 1);
    });
  };

  /** 选中 `/` 技能：用技能示例指令替换掉刚输入的「/查询」 */
  const pickSkill = (option: SkillOption) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const start = slash.open ? Math.max(0, Math.min(slash.start, value.length)) : caret;
    onChange(`${value.slice(0, start)}${option.prompt}${value.slice(caret)}`);
    setSlash({ open: false, query: "", start: 0 });
    window.requestAnimationFrame(() => {
      el?.focus();
      const next = start + option.prompt.length;
      el?.setSelectionRange(next, next);
    });
  };

  /** 「技能」mode 展开的技能列表：选中后填入输入框，并切回「对话」 */
  const skillPanelOpen = mode === "skill" && (skillOptions?.length ?? 0) > 0;

  /** 点「技能」时展开列表；已经是技能 mode 再点一次则收起 */
  const handleModeChange = (next: PanelMode) => {
    onModeChange(next === "skill" && mode === "skill" ? "chat" : next);
  };

  const pickSkillFromPanel = (option: SkillOption) => {
    pickSkill(option);
    onModeChange("chat");
  };

  const visibleSkills = React.useMemo(() => {
    const options = skillOptions ?? [];
    const query = slash.query.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [skillOptions, slash.query]);

  /**
   * Enter 发送、Shift+Enter 换行；Ctrl / ⌘ + Enter 不再作为发送键（保持普通换行）。
   * 中文输入法合成中的 Enter 只用于确认候选词，绝不发送。
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // keyCode 229 = 输入法合成中的 Enter（Safari 下 compositionend 可能早于 keydown，需要兜底）
      if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      if (slash.open) {
        // `/` 技能菜单打开时优先选中第一个候选，避免把半截指令发出去
        const first = visibleSkills[0];
        if (first) {
          event.preventDefault();
          pickSkill(first);
        }
        return;
      }
      // @ 引用选择器打开时先选引用，不发送
      if (mention.open) {
        event.preventDefault();
        mentionPickFirstRef.current?.();
        return;
      }
      event.preventDefault();
      if(!streaming && !sending && !disabled)onSend();
      return;
    }
    if (event.key === "Escape") {
      if (mention.open) {
        event.preventDefault();
        setMention({ open: false, query: "", start: 0 });
      } else if (slash.open) {
        event.preventDefault();
        setSlash({ open: false, query: "", start: 0 });
      } else if (skillPanelOpen) {
        event.preventDefault();
        onModeChange("chat");
      }
    }
  };

  /** 文风下拉：5 种常用文风 + 清除 */
  const styleItems = React.useMemo<DropdownItem[]>(() => {
    const items: DropdownItem[] = STYLE_OPTIONS.map((option) => ({
      label: (
        <span className="flex w-full items-center justify-between gap-2">
          <span>{option.label}</span>
          <span className="text-[10px] text-ink-4">{option.hint}</span>
        </span>
      ),
      icon: style === option.value ? <Check className="size-3.5" /> : undefined,
      onSelect: () => onStyleChange?.(option.value),
    }));
    items.push({ separator: true });
    items.push({ label: "清除文风", disabled: !style, onSelect: () => onStyleChange?.(null) });
    return items;
  }, [onStyleChange, style]);

  const selectionLength = includeSelection ? selectionText.trim().length : 0;

  return (
    <div className={cn("relative border-t border-line/60 bg-surface px-4 pb-4 pt-3", className)}>
      {mention.open ? (
        <MentionPicker
          novelId={novelId}
          chapterId={chapterId}
          query={mention.query}
          onPick={pickMention}
          onClose={() => setMention({ open: false, query: "", start: 0 })}
          onRegisterFirstOption={(pick) => { mentionPickFirstRef.current = pick; }}
        />
      ) : null}

      {/* `/` 技能菜单：选中后把示例指令填入输入框 */}
      {slash.open && visibleSkills.length > 0 ? (
        <div className="absolute bottom-full left-2 right-2 z-20 mb-1 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-float rise-in">
          <p className="px-2 py-1 text-[10.5px] text-ink-4">选择技能（会填入输入框）</p>
          <div className="scroll-thin max-h-56 overflow-y-auto">
            {visibleSkills.map((option) => (
              <button
                key={option.label}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickSkill(option)}
                className="block w-full rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
              >
                <span className="block text-[12px] text-ink-2">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block truncate text-[10.5px] text-ink-4">{option.hint}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 引用 chips */}
      {mentions.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {mentions.map((item) => (
            <span
              key={`${item.type}:${item.id}`}
              className="inline-flex max-w-[190px] items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2"
            >
              <span className="shrink-0 text-ink-4 dark:text-ink-3">{MENTION_TYPE_LABEL[item.type]}</span>
              <span className="truncate">{item.label}</span>
              <button
                type="button"
                aria-label={`移除引用：${item.label}`}
                onClick={() => removeMention(item)}
                className="shrink-0 text-ink-4 transition-colors hover:text-danger dark:text-ink-3"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-line-strong/70 bg-paper/45 px-3 py-2.5 shadow-[0_3px_16px_-12px_rgba(32,29,24,0.15)] transition-colors duration-150 focus-within:border-jade/45 focus-within:ring-2 focus-within:ring-jade/5 dark:bg-paper/50">
        {task ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-2">
              <span className="truncate">任务：{task.label}</span>
              {onClearTask ? (
                <button type="button" aria-label="移除任务" onClick={onClearTask} className="shrink-0 text-ink-4 hover:text-danger">
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
        <div className="mb-1 flex items-center justify-between gap-2">
          <button type="button" className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-ink-3 transition-colors hover:text-jade" onClick={()=>handleModeChange(mode==="skill"?"chat":"skill")} aria-expanded={mode==="skill"}><Sparkles className="size-3"/>技能</button>
          {selectionLength > 0 ? (
            <span className="min-w-0 truncate text-[10.5px] text-jade" title={selectionText}>
              将引用选中正文 · {selectionLength} 字
            </span>
          ) : null}
        </div>

        {/* 「技能」mode：在输入框内展开技能列表，选中后填 prompt 并切回对话 */}
        {skillPanelOpen && !slash.open ? (
          <div className="mb-1.5 rounded-sm border border-line bg-surface p-1 rise-in">
            <p className="px-1.5 py-0.5 text-[10.5px] text-ink-4">选一个技能填入输入框（可改完再发送）</p>
            <div className="scroll-thin max-h-52 overflow-y-auto">
              {(skillOptions ?? []).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickSkillFromPanel(option)}
                  className="flex w-full items-start gap-1.5 rounded-sm px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-ink-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-ink-2">{option.label}</span>
                    {option.hint ? (
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-4">{option.hint}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 输入区快捷 chips：智能体 / 文风 / 档案 */}
        <div className="mb-1 flex flex-wrap items-center gap-1">
          {onOpenAgent ? (
            <button
              type="button"
              onClick={onOpenAgent}
              disabled={disabled || streaming}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-3 transition-colors duration-150 hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserCog className="size-3" />
              {agentName ? `+ 智能体 · ${agentName}` : "+ 智能体"}
            </button>
          ) : null}
          {onStyleChange ? (
            <Dropdown
              width={210}
              trigger={
                <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-3 transition-colors duration-150 hover:border-accent/30 hover:text-ink">
                  <Palette className="size-3" />
                  {style ? `文风 · ${style}` : "文风"}
                  <ChevronDown className="size-2.5" />
                </span>
              }
              items={styleItems}
            />
          ) : null}
          {onOpenContext ? (
            <button
              type="button"
              onClick={onOpenContext}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-3 transition-colors duration-150 hover:border-accent/30 hover:text-ink"
            >
              <BookMarked className="size-3" />
              档案
            </button>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onBlur={() => {
            composingRef.current = false;
          }}
          onClick={(event) => detectMention(event.currentTarget)}
          onSelect={(event) => detectMention(event.currentTarget)}
          placeholder={placeholder}
          aria-label="输入消息"
          className="scroll-thin block min-h-[72px] max-h-[180px] w-full resize-none bg-transparent px-0.5 py-1 text-[13.5px] leading-6 text-ink outline-none placeholder:text-ink-4 dark:placeholder:text-ink-3"
        />

        <div className="mt-1 flex min-w-0 items-center gap-1">
          {modelSlot ? <span className="min-w-0 max-w-[46%] shrink overflow-hidden">{modelSlot}</span> : null}
          <IconButton label="引用资料" size="sm" onClick={insertAt} disabled={disabled || streaming}>
            <AtSign className="size-3.5" />
          </IconButton>
          {onOpenContext ? (
            <IconButton label="上下文设置" size="sm" onClick={onOpenContext}>
              <Gauge className="size-3.5" />
            </IconButton>
          ) : null}
          <span className="flex-1"/>
          {streaming ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Square className="size-3" />}
              onClick={onStop}
              className="ml-1 min-h-8 shrink-0 justify-center whitespace-nowrap rounded-xl px-3 shadow-none"
            >
              停止
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<Send className="size-3" />}
              onClick={onSend}
              disabled={disabled || sending || !value.trim()}
              className="ml-1 min-h-8 shrink-0 justify-center whitespace-nowrap rounded-xl px-3 shadow-none"
            >
              {sending?"准备中…":"发送"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
