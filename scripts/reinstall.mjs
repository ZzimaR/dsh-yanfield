#!/usr/bin/env node
/**
 * 本地重装：构建插件 → 拷进正在使用的 DSH profile。
 *
 * 用法：
 *   node scripts/reinstall.mjs            # 默认装进 desktop profile
 *   node scripts/reinstall.mjs yanfield-dev
 *
 * 注意：宿主侧代码（dist/host.js）在 DSH 启动时加载，装完后必须**完全退出 DSH 再重开**，
 * 只刷新页面不够。desktop profile 的插件目录是 pnpm 安装出来的真实拷贝（可能与
 * 全局 store 硬链接），所以这里先整目录删掉再拷，避免写穿到别处。
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const profile = process.argv[2] || "desktop";
const profileDir = path.join(homedir(), ".dsh", "profiles", profile);
const dest = path.join(profileDir, "node_modules", "dsh-yanfield");

const run = (script) =>
  execFileSync(process.execPath, [path.join(root, "scripts", script)], { cwd: root, stdio: "inherit" });

console.log(`[reinstall] profile = ${profile}`);
if (!existsSync(profileDir)) {
  console.error(`[reinstall] 找不到 profile 目录：${profileDir}`);
  process.exit(1);
}

run("build.mjs");
run("check.mjs");

const files = ["package.json", "README.md", "LICENSE", "icon.svg", "cordis.patch.yml", "client", "dist", "src"];
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const entry of files) {
  const from = path.join(root, entry);
  if (existsSync(from)) cpSync(from, path.join(dest, entry), { recursive: true });
}

const md5 = (file) => createHash("md5").update(readFileSync(file)).digest("hex");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
console.log(`[reinstall] 已安装 dsh-yanfield ${version} → ${dest}`);
console.log(`[reinstall] client.js ${md5(path.join(root, "dist", "client.js"))}`);
console.log(`[reinstall] host.js   ${md5(path.join(root, "dist", "host.js"))}`);
console.log("[reinstall] 下一步：完全退出 DeepSeek Harness（任务管理器里确认没有残留进程）再重新打开。");
console.log("[reinstall] 重开后到「砚田 → 设置 → 关于」核对「构建」时间是否为刚构建的那次。");
