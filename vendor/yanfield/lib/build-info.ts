/**
 * 客户端构建信息。
 * scripts/build.mjs 用 esbuild 的 define 注入 __YANFIELD_BUILD__（ISO 时间戳），
 * 用来在「设置 → 关于」里确认当前加载的是哪一次构建；没有注入时退化为 "dev"。
 */
declare const __YANFIELD_BUILD__: string | undefined;

export const BUILD_STAMP: string = typeof __YANFIELD_BUILD__ === "string" ? __YANFIELD_BUILD__ : "dev";
