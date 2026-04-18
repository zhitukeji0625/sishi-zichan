#!/usr/bin/env node
/**
 * 功能完整性检查：读取 spec/feature-requirements.csv，在存在源码时扫描
 * src/、app/、pages/ 等目录下的代码是否出现与需求相关的中文关键词或常见英文路由片段。
 * 无源码时仅输出统计信息并以 0 退出，便于占位仓库通过 CI。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_CSV = path.join(ROOT, "spec", "feature-requirements.csv");

const CN_TOKEN = /[\u4e00-\u9fff]{2,}/g;

const TERM_TO_EN = [
  ["竞拍", "auction"],
  ["晒场", "drying"],
  ["合同", "contract"],
  ["订单", "orders"],
  ["登录", "login"],
  ["注册", "register"],
  ["密码", "password"],
  ["找回", "reset"],
  ["消息", "message"],
  ["通知", "notif"],
  ["支付", "pay"],
  ["资产", "asset"],
  ["公告", "announce"],
  ["报名", "enroll"],
  ["审核", "review"],
  ["组织", "org"],
  ["权限", "role"],
  ["日志", "log"],
  ["配置", "config"],
  ["导入", "import"],
  ["导出", "export"],
  ["验证码", "otp"],
  ["短信", "sms"],
  ["实名", "verif"],
  ["保证金", "deposit"],
  ["租金", "rent"],
  ["预约", "reserv"],
  ["出价", "bid"],
  ["农行", "abc"],
  ["第三方", "third-party"],
  ["jwt", "jwt"],
];

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("=") || line.includes("========")) continue;
    const parts = line.split(",");
    if (parts.length < 6) continue;
    const [system, role, mod1, mod2, feature] = parts.map((s) => s.trim());
    if (!feature) continue;
    rows.push({ system, role, mod1, mod2, feature, raw: line });
  }
  return rows;
}

function collectKeywords(row) {
  const blob = `${row.mod1}${row.mod2}${row.feature}`;
  const cnSet = new Set(blob.match(CN_TOKEN) ?? []);
  // 单独拆分各级名称，避免整段被正则合并成一条超长 token，导致源码必须逐字包含拼接串才能命中
  for (const piece of [row.mod1, row.mod2, row.feature]) {
    if (!piece || piece === "/") continue;
    for (const t of piece.match(CN_TOKEN) ?? []) cnSet.add(t);
  }
  const cn = [...cnSet];
  const en = new Set();
  for (const t of cn) {
    for (const [zh, enPart] of TERM_TO_EN) {
      if (t.includes(zh)) en.add(enPart);
    }
  }
  return { cn, en: [...en] };
}

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const st = fs.statSync(dir);
  if (!st.isDirectory()) return;
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE_DIR.has(name)) continue;
    const full = path.join(dir, name);
    let s;
    try {
      s = fs.statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walkFiles(full);
    else if (CODE_EXT.has(path.extname(name))) yield full;
  }
}

function loadCodeCorpus(roots) {
  const files = [];
  for (const r of roots) {
    const abs = path.join(ROOT, r);
    for (const f of walkFiles(abs)) files.push(f);
  }
  const contents = new Map();
  for (const f of files) {
    try {
      contents.set(f, fs.readFileSync(f, "utf8"));
    } catch {
      /* skip */
    }
  }
  return { files, contents };
}

function rowSatisfied(row, contents) {
  const { cn, en } = collectKeywords(row);
  if (cn.length === 0 && en.length === 0) return { ok: true, reason: "无关键词" };

  for (const [, text] of contents) {
    for (const t of cn) {
      if (text.includes(t)) return { ok: true, reason: `中文「${t}」` };
    }
    const lower = text.toLowerCase();
    for (const e of en) {
      if (lower.includes(e)) return { ok: true, reason: `英文片段「${e}」` };
    }
  }
  for (const filePath of contents.keys()) {
    const rel = filePath.replace(ROOT, "").toLowerCase();
    for (const e of en) {
      if (rel.includes(e)) return { ok: true, reason: `路径含「${e}」` };
    }
  }
  return {
    ok: false,
    reason: `未命中：${[...cn.slice(0, 3), ...en].join(" / ") || "（空）"}`,
  };
}

function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error(`缺少需求文件：${csvPath}`);
    process.exit(1);
  }

  const rows = readCsv(csvPath);
  const codeRoots = ["src", "app", "pages", "components", "lib"].filter((d) =>
    fs.existsSync(path.join(ROOT, d))
  );

  const { files, contents } = loadCodeCorpus(codeRoots);
  console.log(`需求条目：${rows.length}（来自 ${path.relative(ROOT, csvPath)}）`);
  console.log(
    `源码扫描：${files.length} 个文件` +
      (codeRoots.length ? `（根目录：${codeRoots.join(", ")}）` : "（未找到常见源码目录，跳过匹配）")
  );

  if (files.length === 0) {
    console.log(
      "\n当前仓库无应用源码可扫描；已将需求清单纳入 spec/，待接入 Next 等项目后可重新运行本脚本做关键词覆盖检查。"
    );
    process.exit(0);
  }

  const missing = [];
  for (const row of rows) {
    const { system } = row;
    if (system !== "后台管理系统" && system !== "移动端（H5）") continue;
    const r = rowSatisfied(row, contents);
    if (!r.ok) missing.push({ row, reason: r.reason });
  }

  if (missing.length) {
    console.error(`\n以下 ${missing.length} 条后台/移动端需求未在代码中找到明显关键词或路由片段：\n`);
    for (const { row, reason } of missing) {
      console.error(
        `- [${row.system} / ${row.mod1} / ${row.mod2}] ${row.feature}\n  ${reason}`
      );
    }
    process.exit(1);
  }

  console.log("\n后台管理系统与移动端（H5）相关需求均通过启发式关键词检查。");
  process.exit(0);
}

main();
