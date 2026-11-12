import { COVER_STYLES } from "@/lib/types";

export interface CoverStyle {
  from: string;
  to: string;
  ink: string;
  label: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const CUSTOM = /^custom:(#[0-9a-fA-F]{6}):(#[0-9a-fA-F]{6})$/;

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

/** 底色偏亮时用墨色字，偏暗时用宣纸色字。 */
export function coverInk(from: string, to: string): string {
  const lum = (luminance(from) + luminance(to)) / 2;
  return lum > 0.62 ? "#1c1915" : "#f6f1e8";
}

export function customCoverKey(from: string, to: string): string {
  return `custom:${from.toLowerCase()}:${to.toLowerCase()}`;
}

export function parseCustomCover(coverKey: string): { from: string; to: string } | null {
  const match = CUSTOM.exec(coverKey.trim());
  if (!match?.[1] || !match[2]) return null;
  return { from: match[1].toLowerCase(), to: match[2].toLowerCase() };
}

export function resolveCoverStyle(coverKey: string | null | undefined): CoverStyle {
  const key = (coverKey ?? "").trim();
  const preset = COVER_STYLES[key];
  if (preset) return preset;
  const custom = parseCustomCover(key);
  if (custom && HEX.test(custom.from) && HEX.test(custom.to)) {
    return { from: custom.from, to: custom.to, ink: coverInk(custom.from, custom.to), label: "自定义" };
  }
  return COVER_STYLES.ink ?? { from: "#2e3338", to: "#15181b", ink: "#e8e3d8", label: "墨夜" };
}
