import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dictDir = path.join(root, "src/yanfield/lib/i18n/en");
const keys = new Map(); // key -> file
const duplicates = [];
for (const f of fs.readdirSync(dictDir)) {
  if (!f.endsWith(".ts")) continue;
  const src = fs.readFileSync(path.join(dictDir, f), "utf8");
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:/gm;
  const local = new Set();
  let m;
  while ((m = re.exec(src))) {
    const key = JSON.parse('"' + m[1] + '"');
    if (local.has(key)) duplicates.push(`${f}: ${key}`);
    local.add(key);
    if (!keys.has(key)) keys.set(key, f);
  }
}

const roots = ["src/yanfield/components", "src/yanfield/app", "client", "src/yanfield/lib"];
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
for (const r of roots) walk(path.join(root, r));

const used = new Map(); // key -> [file:line]
const callRe = /\b(?:tr|t)\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const file of files) {
  if (file.includes(path.sep + "i18n" + path.sep)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(line))) {
      let key;
      try { key = JSON.parse('"' + m[1] + '"'); } catch { continue; }
      if (!key || !/[\u3400-\u9fff]/.test(key)) continue;
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(`${path.relative(root, file)}:${i + 1}`);
    }
  });
}

const missing = [...used].filter(([k]) => !keys.has(k));
console.log(`dict keys: ${keys.size}, used CJK keys: ${used.size}, missing: ${missing.length}`);
for (const [k, locs] of missing) console.log(`MISSING ${JSON.stringify(k)}  <- ${locs.slice(0, 3).join(", ")}`);
if (duplicates.length) {
  console.error(`duplicate dictionary keys: ${duplicates.length}`);
  for (const d of duplicates) console.error("DUPLICATE " + d);
}
if (missing.length || duplicates.length) process.exit(1);
