import os from "node:os";
import path from "node:path";

export const DB_FILE_NAME = "yanfield.db";

/**
 * 系统约定的用户数据目录：
 * - Windows：%APPDATA%\Yanfield
 * - macOS：~/Library/Application Support/Yanfield
 * - Linux 等：$XDG_DATA_HOME/yanfield，默认 ~/.local/share/yanfield
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {NodeJS.Platform} [platform]
 * @param {string} [home]
 * @returns {string}
 */
export function defaultDataDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (platform === "win32") {
    return path.win32.join(env.APPDATA || path.win32.join(home, "AppData", "Roaming"), "Yanfield");
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", "Yanfield");
  }
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(home, ".local", "share"), "yanfield");
}

/**
 * 数据库文件的绝对路径。YANFIELD_DB_PATH 优先（相对路径按进程工作目录解析），
 * 否则使用系统用户数据目录，确保无论从哪个目录启动都读写同一个库。
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {NodeJS.Platform} [platform]
 * @param {string} [home]
 * @returns {string}
 */
export function resolveDbPath(env = process.env, platform = process.platform, home = os.homedir()) {
  const custom = env.YANFIELD_DB_PATH?.trim();
  if (custom) return path.resolve(custom);
  const dir = defaultDataDir(env, platform, home);
  return platform === "win32" ? path.win32.join(dir, DB_FILE_NAME) : path.posix.join(dir, DB_FILE_NAME);
}
