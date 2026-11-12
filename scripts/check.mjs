import { readFile, stat } from "node:fs/promises"
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
const readme = await readFile(path.join(root, "README.md"), "utf8")
if (!readme.includes("dsh plugin --profile web add github:ZzimaR/dsh-yanfield")) {
  fail("README 必须包含 web profile 的官方安装命令")
}
for (const file of ["dist/host.js", "dist/client.js", "LICENSE", "icon.svg"]) {
  try {
    const info = await stat(path.join(root, file))
    if (info.size < 32) fail(`${file} 太小`)
  } catch {
    fail(`缺少 ${file}`)
  }
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
