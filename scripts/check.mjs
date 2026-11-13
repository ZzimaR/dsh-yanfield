import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const failures = []

function fail(message) {
  failures.push(message)
}

const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
if (manifest.name !== "dsh-yanfield") fail("package name 必须是 dsh-yanfield")
if (manifest.author?.name !== "ZzimaR") fail("author 必须是 ZzimaR")
if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("缺少 dsh.bundle.patch")
if (manifest.dsh?.client?.platform !== "web") fail("dsh.client.platform 必须是 web")
if (!manifest.exports?.["./client"]) fail("缺少 ./client 导出")
if (manifest.scripts?.prepare || manifest.scripts?.preinstall || manifest.scripts?.install || manifest.scripts?.postinstall) {
  fail("不要在安装时运行脚本，市场会因此要求构建授权")
}
const patch = await readFile(path.join(root, "cordis.patch.yml"), "utf8")
if (!patch.includes("name: dsh-yanfield") && !patch.includes('name: "dsh-yanfield"') && !patch.includes("name: 'dsh-yanfield'")) {
  fail("cordis.patch.yml 必须插入 name 等于包名的行")
}
for (const file of ["README.md", "README.en.md"]) {
  const readme = await readFile(path.join(root, file), "utf8")
  for (const profile of ["web", "desktop"]) {
    if (!readme.split(/\r?\n/).includes(`dsh plugin --profile ${profile} add ${manifest.name}`)) {
      fail(`${file} 缺少 ${profile} profile 的 npm 安装命令`)
    }
  }
}
const screenshots = JSON.parse(await readFile(path.join(root, "screenshots.json"), "utf8"))
const validScreenshot = (file) => typeof file === "string" && /^docs\/screenshots\/[\w.-]+\.(png|jpe?g|webp)$/i.test(file)
const screenshotFiles = Array.isArray(screenshots) ? screenshots.filter(validScreenshot) : []
if (!Array.isArray(screenshots) || screenshotFiles.length < 1 || screenshotFiles.length > 8 ||
    screenshotFiles.length !== screenshots.length) {
  fail("screenshots.json 必须包含 1–8 张 docs/screenshots/ 下的图片")
}
for (const file of ["dist/host.js", "dist/client.js", "LICENSE", "icon.svg", "docs/screenshots/market-icon.png", ...screenshotFiles]) {
  try {
    const info = await stat(path.join(root, file))
    if (info.size < 32) fail(`${file} 太小`)
  } catch {
    fail(`缺少 ${file}`)
  }
}
// Localization: plugin metadata for the market, plus the English dictionary.
if (!manifest.exports?.["./locale/*.json"]) fail("package.json 缺少 ./locale/*.json 导出")
if (!manifest.files?.includes("locale/*.json")) fail("package.json files 缺少 locale/*.json")
if (!manifest.dsh?.client?.inject?.includes("@deepseek-ai/dsh-client-locale")) {
  fail("dsh.client.inject 缺少 @deepseek-ai/dsh-client-locale")
}
for (const file of ["locale/zh.json", "locale/en.json"]) {
  try {
    const meta = JSON.parse(await readFile(path.join(root, file), "utf8"))?.meta
    if (!meta?.title || !meta?.description) fail(`${file} 缺少 meta.title / meta.description`)
  } catch {
    fail(`缺少或无法解析 ${file}`)
  }
}
const enDir = path.join(root, "vendor/yanfield/lib/i18n/en")
try {
  const modules = (await readdir(enDir)).filter((file) => file.endsWith(".ts"))
  if (modules.length < 10) fail("en/ 字典模块不完整")
  for (const file of modules) {
    const source = await readFile(path.join(enDir, file), "utf8")
    const seen = new Set()
    for (const match of source.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
      if (seen.has(match[1])) fail(`en/${file} 有重复键 ${match[1]}`)
      seen.add(match[1])
    }
  }
} catch {
  fail("缺少 vendor/yanfield/lib/i18n/en/")
}

const client = await readFile(path.join(root, "dist", "client.js"), "utf8")
if (!client.includes('id:"dsh-yanfield"') && !client.includes("id:\\\"dsh-yanfield\\\"")) fail("客户端产物不是 ModuleLoader 格式")
if (!client.includes("sidebar.panellist")) fail("客户端没有注册侧栏入口")
const host = await readFile(path.join(root, "dist", "host.js"), "utf8")
if (!host.includes("dsh-yanfield")) fail("宿主产物里没有插件名")
if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"))
  process.exit(1)
}
console.log("[dsh-yanfield] check ok")
