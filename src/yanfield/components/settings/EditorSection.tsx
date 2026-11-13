"use client";

import { Eye, LayoutTemplate, RotateCcw, Type, Wand2 } from "lucide-react";
import { Button, Card, Select, Slider, Switch, useToast } from "@/components/ui/kit";
import {
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_FONT_WEIGHTS,
  readEditorLayoutSettings,
  type EditorLayoutSettings,
} from "@/lib/editor/settings";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { applySurfaceDataset } from "@/lib/ui/theme";
import { EditorPreview } from "@/components/settings/EditorPreview";

export type EditorLayoutFields = EditorLayoutSettings;

export interface EditorSectionProps {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}

/** 编辑器排版字段进入 AppSettings 前的过渡写法：类型上允许携带扩展字段。 */
type EditorPatch = Partial<AppSettings> & Partial<EditorLayoutSettings>;

const FONT_WEIGHT_LABELS: Record<number, string> = {
  300: "细 300",
  400: "常规 400",
  500: "中等 500",
  600: "半粗 600",
};

const FONT_WEIGHT_OPTIONS = EDITOR_FONT_WEIGHTS.map((weight) => ({
  value: String(weight),
  label: FONT_WEIGHT_LABELS[weight] ?? String(weight),
}));

const FONT_OPTIONS = [
  { value: "serif", label: "衬线（宋体）" },
  { value: "sans", label: "黑体（界面字体）" },
];

interface EditorPreset {
  key: string;
  label: string;
  hint: string;
  patch: EditorPatch;
}

const PRESETS: EditorPreset[] = [
  {
    key: "default",
    label: "散文 / 默认",
    hint: "接近纸书阅读感",
    patch: {
      editorFontSize: 18,
      editorLineHeight: 1.95,
      editorLetterSpacing: 0.02,
      editorFontWeight: 400,
      paragraphSpacing: 12,
      pagePaddingX: 64,
      pagePaddingY: 48,
      maxContentWidth: 720,
      firstLineIndent: true,
    },
  },
  {
    key: "compact",
    label: "紧凑",
    hint: "信息密度更高，适合改稿",
    patch: {
      editorFontSize: 16,
      editorLineHeight: 1.7,
      editorLetterSpacing: 0.01,
      editorFontWeight: 400,
      paragraphSpacing: 6,
      pagePaddingX: 40,
      pagePaddingY: 32,
      maxContentWidth: 860,
      firstLineIndent: true,
    },
  },
  {
    key: "relaxed",
    label: "宽松",
    hint: "大字号大留白，适合夜读",
    patch: {
      editorFontSize: 20,
      editorLineHeight: 2.2,
      editorLetterSpacing: 0.04,
      editorFontWeight: 400,
      paragraphSpacing: 20,
      pagePaddingX: 96,
      pagePaddingY: 64,
      maxContentWidth: 680,
      firstLineIndent: true,
    },
  },
];

/** 让新字段在 lib/types.ts 落地前也能安全地 PATCH 出去。 */
function patchEditorFields(update: EditorSectionProps["update"], patch: EditorPatch): void {
  update(patch);
}

export function EditorSection({ settings, update }: EditorSectionProps) {
  const tr = useT();
  const { toast } = useToast();
  if (!settings) return null;

  const layout = readEditorLayoutSettings(settings);
  const { editorFontWeight: fontWeight, editorLetterSpacing: letterSpacing } = layout;
  const { paragraphSpacing, pagePaddingX, pagePaddingY, maxContentWidth } = layout;
  const { showStatusBar, showInlineHints, motionEnabled } = layout;

  const patch = (next: EditorPatch) => patchEditorFields(update, next);

  const resetAll = () => {
    patch({
      editorFontSize: DEFAULT_APP_SETTINGS.editorFontSize,
      editorLineHeight: DEFAULT_APP_SETTINGS.editorLineHeight,
      proseFont: DEFAULT_APP_SETTINGS.proseFont,
      firstLineIndent: DEFAULT_APP_SETTINGS.firstLineIndent,
      ...DEFAULT_EDITOR_LAYOUT,
    });
    applySurfaceDataset("proseFont", DEFAULT_APP_SETTINGS.proseFont);
    toast({ title: tr("已恢复默认排版"), description: tr("字号、行高、间距与边距均回到默认值"), tone: "success" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-ink">{tr("编辑器")}</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-6 text-ink-3">
            {tr("调整写作页的字体、行距与页面留白。所有改动即时生效并自动保存。")}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={resetAll}>
          {tr("恢复默认")}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <Eye className="size-3.5 text-ink-3" aria-hidden />
              {tr("编辑显示")}
            </h3>
            <p className="mt-1 text-[11px] leading-5 text-ink-3">{tr("编辑器里显示哪些辅助信息，只影响写作界面。")}</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{tr("显示状态栏")}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{tr("底部字数、保存状态与章节进度")}</p>
                </div>
                <Switch checked={showStatusBar} onChange={(checked) => patch({ showStatusBar: checked })} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{tr("显示正文标注")}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{tr("AI 建议、选中块与批注提示")}</p>
                </div>
                <Switch checked={showInlineHints} onChange={(checked) => patch({ showInlineHints: checked })} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{tr("界面动效")}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{tr("面板滑入与按钮过渡动画")}</p>
                </div>
                <Switch checked={motionEnabled} onChange={(checked) => patch({ motionEnabled: checked })} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <Type className="size-3.5 text-ink-3" aria-hidden />
              {tr("字体")}
            </h3>
            <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1.5 whitespace-nowrap text-[13px] font-medium text-ink-2">{tr("正文字体")}</p>
                <Select
                  aria-label={tr("正文字体")}
                  options={FONT_OPTIONS.map((option) => ({ ...option, label: tr(option.label) }))}
                  value={settings.proseFont}
                  onChange={(event) => {
                    const next = event.target.value === "sans" ? "sans" : "serif";
                    applySurfaceDataset("proseFont", next);
                    update({ proseFont: next });
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 whitespace-nowrap text-[13px] font-medium text-ink-2">{tr("字重")}</p>
                <Select
                  aria-label={tr("字重")}
                  options={FONT_WEIGHT_OPTIONS.map((option) => ({ ...option, label: tr(option.label) }))}
                  value={String(fontWeight)}
                  onChange={(event) => patch({ editorFontWeight: Number(event.target.value) })}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-ink-3">
              {tr("衬线更接近纸书阅读感，黑体在暗色与高分屏下更清晰；正文常用常规 400。")}
            </p>
            <div className="mt-4 space-y-4">
              <Slider
                label={tr("字号")}
                min={14}
                max={32}
                step={1}
                value={settings.editorFontSize}
                hint={`${settings.editorFontSize}px`}
                onChange={(value) => update({ editorFontSize: value })}
              />
              <Slider
                label={tr("行高")}
                min={1.2}
                max={3}
                step={0.05}
                value={settings.editorLineHeight}
                hint={settings.editorLineHeight.toFixed(2)}
                onChange={(value) => update({ editorLineHeight: value })}
              />
              <Slider
                label={tr("字间距")}
                min={0}
                max={0.1}
                step={0.005}
                value={letterSpacing}
                hint={`${Number(letterSpacing.toFixed(3))}em`}
                onChange={(value) => patch({ editorLetterSpacing: value })}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <LayoutTemplate className="size-3.5 text-ink-3" aria-hidden />
              {tr("布局")}
            </h3>
            <div className="mt-3 space-y-4">
              <Switch
                checked={settings.firstLineIndent}
                onChange={(checked) => update({ firstLineIndent: checked })}
                label={tr("段首缩进两字")}
                hint={tr("中文小说习惯")}
              />
              <Slider
                label={tr("段落间距")}
                min={0}
                max={40}
                step={2}
                value={paragraphSpacing}
                hint={`${paragraphSpacing}px`}
                onChange={(value) => patch({ paragraphSpacing: value })}
              />
              <Slider
                label={tr("左右页边距")}
                min={16}
                max={160}
                step={4}
                value={pagePaddingX}
                hint={`${pagePaddingX}px`}
                onChange={(value) => patch({ pagePaddingX: value })}
              />
              <Slider
                label={tr("上下页边距")}
                min={16}
                max={160}
                step={4}
                value={pagePaddingY}
                hint={`${pagePaddingY}px`}
                onChange={(value) => patch({ pagePaddingY: value })}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-ink-2">{tr("最大行宽")}</p>
                  <label className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--accent)]"
                      checked={maxContentWidth === 0}
                      onChange={(event) => patch({ maxContentWidth: event.target.checked ? 0 : 720 })}
                    />
                    {tr("自适应（不限）")}
                  </label>
                </div>
                <Slider
                  min={620}
                  max={1100}
                  step={10}
                  value={maxContentWidth === 0 ? 720 : maxContentWidth}
                  disabled={maxContentWidth === 0}
                  hint={maxContentWidth === 0 ? tr("自适应") : `${maxContentWidth}px`}
                  onChange={(value) => patch({ maxContentWidth: value })}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
              <span className="text-[11.5px] text-ink-3">{tr("快速预设")}</span>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  variant="secondary"
                  size="sm"
                  icon={<Wand2 className="size-3.5" aria-hidden />}
                  onClick={() => {
                    patch(preset.patch);
                    toast({ title: tr("已套用「{name}」", { name: tr(preset.label) }), description: tr(preset.hint), tone: "success" });
                  }}
                >
                  {tr(preset.label)}
                </Button>
              ))}
            </div>
          </Card>
        </div>

        <EditorPreview
          fontSize={settings.editorFontSize}
          lineHeight={settings.editorLineHeight}
          proseFont={settings.proseFont}
          firstLineIndent={settings.firstLineIndent}
          layout={layout}
        />
      </div>
    </div>
  );
}
