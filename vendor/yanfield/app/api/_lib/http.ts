/**
 * REST 路由共享工具：请求体解析、字段白名单校验、查询参数与枚举白名单。
 * 仅供 server Route Handler 使用；放在 `_` 前缀目录下不会成为路由。
 */
import { ApiError, readJson } from "@/lib/api-utils";
import {
  AGENTS,
  AI_FEATURE_LABEL,
  ARCHIVE_STATUS_LABEL,
  CHAPTER_STATUS_LABEL,
  CHARACTER_ROLE_LABEL,
  CUSTOM_AGENT,
  FORESHADOW_STATUS_LABEL,
  NOVEL_STATUS_LABEL,
  WORLD_CATEGORY_LABEL,
  WORLD_IMPORTANCE_LABEL,
} from "@/lib/types";
import type {
  AgentId,
  AiFeature,
  ChapterStatus,
  CharacterRole,
  ForeshadowStatus,
  NovelStatus,
  WorldCategory,
  WorldImportance,
} from "@/lib/types";

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeError(key: string, expected: string): ApiError {
  return new ApiError(`字段 ${key} ${expected}`, 400);
}

/* ------------------------------ 请求体 ------------------------------ */

/** 读取 JSON body：空 body 或非对象 → 400 */
export async function readBody(request: Request): Promise<Json> {
  const body = await readJson<unknown>(request);
  if (!isObject(body) || Object.keys(body).length === 0) throw new ApiError("请求体不能为空", 400);
  return body;
}

/** 读取可选 JSON body：空 body 视为 {} */
export async function readOptionalBody(request: Request): Promise<Json> {
  const body = await readJson<unknown>(request);
  if (body === null || body === undefined) return {};
  if (!isObject(body)) throw new ApiError("请求体必须是 JSON 对象", 400);
  return body;
}

/* ------------------------------ 字段校验 ------------------------------ */

export type FieldType = "str" | "num" | "bool" | "str|null" | "num|null" | "str[]" | "obj" | "json";
export type FieldSpec = Record<string, FieldType>;

function asString(value: unknown, key: string): string {
  if (typeof value !== "string") throw typeError(key, "必须是字符串");
  return value;
}

function asNumber(value: unknown, key: string): number {
  const num =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(num)) throw typeError(key, "必须是数字");
  return num;
}

function asBoolean(value: unknown, key: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  throw typeError(key, "必须是布尔值");
}

function asStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw typeError(key, "必须是字符串数组");
  }
  return value as string[];
}

function asJsonValue(value: unknown, key: string): unknown {
  try {
    JSON.stringify(value);
  } catch {
    throw typeError(key, "必须是可序列化的 JSON 值");
  }
  return value;
}

/** 按 spec 从 body 中拾取字段并强校验类型（未传字段不出现） */
export function pickFields<T extends object = Record<string, unknown>>(body: Json, spec: FieldSpec): Partial<T> {
  const picked: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(spec)) {
    const value = body[key];
    if (value === undefined) continue;
    switch (type) {
      case "str":
        picked[key] = asString(value, key);
        break;
      case "num":
        picked[key] = asNumber(value, key);
        break;
      case "bool":
        picked[key] = asBoolean(value, key);
        break;
      case "str[]":
        picked[key] = asStringArray(value, key);
        break;
      case "str|null":
        picked[key] = value === null ? null : asString(value, key);
        break;
      case "num|null":
        picked[key] = value === null ? null : asNumber(value, key);
        break;
      case "obj":
        if (!isObject(value)) throw typeError(key, "必须是对象");
        picked[key] = value;
        break;
      case "json":
        picked[key] = asJsonValue(value, key);
        break;
    }
  }
  return picked as Partial<T>;
}

/** 必填非空字符串（自动 trim） */
export function requireString(body: Json, key: string, label = key): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(`${label}不能为空`, 400);
  return value.trim();
}

/** 可选字符串（不 trim，保留用户输入） */
export function optionalString(body: Json, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw typeError(key, "必须是字符串");
  return value;
}

/** 可选枚举字段 */
export function pickEnum<T extends string>(
  body: Json,
  key: string,
  allowed: readonly T[],
  label = key,
): T | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ApiError(`${label}取值不合法`, 400);
  return value as T;
}

/** 必填非空数组（元素类型由调用方校验） */
export function requireArray(body: Json, key: string, label = key): unknown[] {
  const value = body[key];
  if (!Array.isArray(value) || value.length === 0) throw new ApiError(`${label}不能为空`, 400);
  return value;
}

/* ------------------------------ 查询参数 ------------------------------ */

export function queryParam(request: Request, key: string): string | undefined {
  const value = new URL(request.url).searchParams.get(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function requireQueryParam(request: Request, key: string, label = key): string {
  const value = queryParam(request, key);
  if (!value) throw new ApiError(`缺少查询参数 ${label}`, 400);
  return value;
}

/* ------------------------------ 枚举常量 ------------------------------ */

export const NOVEL_STATUSES = Object.keys(NOVEL_STATUS_LABEL) as NovelStatus[];
export const CHAPTER_STATUSES = Object.keys(CHAPTER_STATUS_LABEL) as ChapterStatus[];
export const CHARACTER_ROLES = Object.keys(CHARACTER_ROLE_LABEL) as CharacterRole[];
export const WORLD_CATEGORIES = Object.keys(WORLD_CATEGORY_LABEL) as WorldCategory[];
export const WORLD_IMPORTANCES = Object.keys(WORLD_IMPORTANCE_LABEL) as WorldImportance[];
export const FORESHADOW_STATUSES = Object.keys(FORESHADOW_STATUS_LABEL) as ForeshadowStatus[];
export const ARCHIVE_STATUSES = Object.keys(ARCHIVE_STATUS_LABEL) as (keyof typeof ARCHIVE_STATUS_LABEL)[];
export const AI_FEATURES = Object.keys(AI_FEATURE_LABEL) as AiFeature[];
export const AGENT_IDS = [...AGENTS.map((agent) => agent.id), CUSTOM_AGENT.id] as AgentId[];
