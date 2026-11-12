import type { AppSettings } from "@/lib/types";

/**
 * 编辑器排版设置，字段属于当前 v0.1.0 的 AppSettings。
 * 缺字段时回落到默认值，避免旧的本地设置打不开页面。
 */
export interface EditorLayoutSettings {
  /** 正文字重，300 / 400 / 500 / 600 */
  editorFontWeight: number;
  /** 正文行内字距（em） */
  editorLetterSpacing: number;
  /** 段间距（px） */
  paragraphSpacing: number;
  /** 正文页面左右内边距（px） */
  pagePaddingX: number;
  /** 正文页面上内边距（px） */
  pagePaddingY: number;
  /** 正文最大阅读宽度（px）；0 = 自适应可用宽度 */
  maxContentWidth: number;
  /** 是否显示底部字数 / 保存状态条 */
  showStatusBar: boolean;
  /** 是否显示正文内的 AI 提示标注（预留） */
  showInlineHints: boolean;
  /** 是否启用动效（false 时全局关闭过渡 / 动画） */
  motionEnabled: boolean;
}

/** 默认值与 CONTRACTS / 设置页保持一致 */
export const DEFAULT_EDITOR_LAYOUT: EditorLayoutSettings = {
  editorFontWeight: 400,
  editorLetterSpacing: 0.02,
  paragraphSpacing: 12,
  pagePaddingX: 64,
  pagePaddingY: 48,
  maxContentWidth: 720,
  showStatusBar: true,
  showInlineHints: true,
  motionEnabled: true,
};

/** 允许的字重档位（与设置页滑块一致） */
export const EDITOR_FONT_WEIGHTS = [300, 400, 500, 600] as const;

/** 类型尚未扩展时也能读取：把 AppSettings 与扩展字段都当作可选 */
type LayoutSource =
  | (Partial<AppSettings> & Partial<EditorLayoutSettings>)
  | null
  | undefined;

function pickNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function pickBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 把任意字重吸附到最近的允许档位 */
function snapFontWeight(value: number): number {
  let best: number = EDITOR_FONT_WEIGHTS[0];
  for (const weight of EDITOR_FONT_WEIGHTS) {
    if (Math.abs(weight - value) < Math.abs(best - value)) best = weight;
  }
  return best;
}

/**
 * 从 AppSettings 中解析出编辑器排版设置（带默认值与范围钳制）。
 * 传入 undefined（设置还没加载）时返回默认值，首帧不会闪空白。
 */
export function readEditorLayoutSettings(source: LayoutSource): EditorLayoutSettings {
  const settings: Partial<EditorLayoutSettings> = source ?? {};
  const maxContentWidth = pickNumber(
    settings.maxContentWidth,
    DEFAULT_EDITOR_LAYOUT.maxContentWidth,
    0,
    1100,
  );

  return {
    editorFontWeight: snapFontWeight(
      pickNumber(
        settings.editorFontWeight,
        DEFAULT_EDITOR_LAYOUT.editorFontWeight,
        EDITOR_FONT_WEIGHTS[0],
        EDITOR_FONT_WEIGHTS[EDITOR_FONT_WEIGHTS.length - 1],
      ),
    ),
    editorLetterSpacing: pickNumber(
      settings.editorLetterSpacing,
      DEFAULT_EDITOR_LAYOUT.editorLetterSpacing,
      0,
      0.1,
    ),
    paragraphSpacing: pickNumber(
      settings.paragraphSpacing,
      DEFAULT_EDITOR_LAYOUT.paragraphSpacing,
      0,
      40,
    ),
    pagePaddingX: pickNumber(
      settings.pagePaddingX,
      DEFAULT_EDITOR_LAYOUT.pagePaddingX,
      16,
      160,
    ),
    pagePaddingY: pickNumber(
      settings.pagePaddingY,
      DEFAULT_EDITOR_LAYOUT.pagePaddingY,
      16,
      160,
    ),
    // 0 = 自适应；其余归一到 620–1100 的舒适阅读区间
    maxContentWidth:
      maxContentWidth === 0 ? 0 : Math.min(1100, Math.max(620, maxContentWidth)),
    showStatusBar: pickBoolean(settings.showStatusBar, DEFAULT_EDITOR_LAYOUT.showStatusBar),
    showInlineHints: pickBoolean(
      settings.showInlineHints,
      DEFAULT_EDITOR_LAYOUT.showInlineHints,
    ),
    motionEnabled: pickBoolean(settings.motionEnabled, DEFAULT_EDITOR_LAYOUT.motionEnabled),
  };
}
