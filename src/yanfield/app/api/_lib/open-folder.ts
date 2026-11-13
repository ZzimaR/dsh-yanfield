import { spawn } from "node:child_process";

/** 用系统文件管理器打开目录。只在本机运行时有效，容器或无图形环境会失败。 */
export function openFolder(dir: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve, reject) => {
    const child = spawn(command, [dir], { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
