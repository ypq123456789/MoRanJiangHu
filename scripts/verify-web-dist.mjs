/**
 * Web 构建产物静态校验（发布前必跑，勿删）
 *
 * 为什么需要它：
 * v1.0.685 官网整页白屏。根因是构建命令 `npx vite build --base=/` 在 Git Bash 下被
 * MSYS 参数转换成 `--base=/workbuddy/resources/vendor/PortableGit/`，产物 index.html 里
 * 主 bundle 引用变成 `/workbuddy/resources/vendor/PortableGit/assets/index-XXX.js`。
 * 这个包**自身完全自洽**（html 与 assets 同目录产出、APK 内又正常），
 * 所以「比对线上 hash == 本地 hash」这类校验全部通过 —— 两边同时是错的。
 * 只有直接检查「引用路径是否合法 + 引用文件是否真实存在」才能拦住。
 *
 * 本脚本做两件事：
 *   1. 扫 index.html（含全部 *.html）里的本地资源引用，命中本机路径特征即失败；
 *   2. 校验每个本地引用在产物目录里真实存在，且入口 JS/CSS 非空。
 *
 * 用法：
 *   node scripts/verify-web-dist.mjs            # 校验 dist/
 *   node scripts/verify-web-dist.mjs <dir>      # 校验指定目录
 */
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'dist';
const root = path.resolve(target);

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error(`[verify-web-dist] 未找到 ${root}/index.html，请先构建。`);
  process.exit(1);
}

/** 本机路径/URL 非法特征（命中即说明 base 被环境污染）。 */
const 非法引用特征 = [
  { re: /^[A-Za-z]:[\\/]/, 说明: 'Windows 盘符绝对路径' },
  { re: /\\/ , 说明: '含反斜杠（Windows 路径分隔符）' },
  { re: /PortableGit|msys|mingw|GitHub Desktop|resources\/vendor/i, 说明: '含本机工具链目录名（典型 MSYS 转换产物）' },
  { re: /\/Users\/|\/home\/[a-z]/i, 说明: '含 POSIX 用户目录（本机路径泄漏）' },
];

/**
 * 从 html 里抽出所有本地资源引用（src/href，去掉外链与 data/blob）。
 * 入口判定需要区分「可执行脚本」与「样式/预加载」，故额外返回标签名。
 */
const 收集本地引用 = (html) => {
  const 结果 = [];
  const 正则 = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = 正则.exec(html))) {
    const 标签 = m[1].toLowerCase();
    const 值 = m[2].trim();
    if (!值) continue;
    if (/^(?:https?:)?\/\//i.test(值)) continue;      // 外链
    if (/^(?:data|blob|mailto|javascript|#)/i.test(值)) continue;
    结果.push({ 标签, 值 });
  }
  return 结果;
};

/**
 * 探测产物的部署 base。
 *
 * 合法构建可能带子路径 base（如 `--base=/msjh/` → 引用 `/msjh/assets/index.js`），
 * 这时引用里的 `/msjh` 段在产物目录里并不存在，若直接当文件路径定位会全部误报
 * 「文件不存在」。
 *
 * 做法：从引用里找出**最长的、逐段剥离后能让文件真实存在**的前缀。
 * 不能简单取最长公共前缀 —— 例如 base=/msjh 时 `/msjh/assets` 整段也不存在，
 * 但 `assets` 是产物里的真实目录，多剥一层就会把文件名当路径而误报。
 * 因此对每个候选前缀逐级回退，取「剥离后父目录真实存在」的最长者。
 */
const 探测部署Base = (html) => {
  const 引用列表 = 收集本地引用(html).map((r) => r.值.split('?')[0].split('#')[0]);
  const 候选 = new Set();
  for (const 引用 of 引用列表) {
    const 段 = 引用.split('/').filter(Boolean);
    for (let n = 段.length - 1; n >= 1; n -= 1) {
      候选.add('/' + 段.slice(0, n).join('/'));
    }
  }
  // 候选按段数从多到少，逐个验证「剥离该前缀后，剩余路径能落到真实文件」
  const 有序 = [...候选].sort(
    (a, b) => b.split('/').filter(Boolean).length - a.split('/').filter(Boolean).length
  );
  for (const 前缀 of 有序) {
    const 相对 = 前缀.replace(/^\//, '');
    // 前缀本身若是真实目录，说明它属于产物结构而非部署 base，不能剥
    if (fs.existsSync(path.join(root, 相对))) continue;
    const 能命中 = 引用列表.some((引用) =>
      引用.startsWith(前缀 + '/') &&
      fs.existsSync(path.join(root, 引用.slice(前缀.length + 1)))
    );
    if (能命中) return 前缀;
  }
  return '';
};

/** 把一条引用解析成产物内的绝对路径；解析不出（外链/锚点）返回 null。 */
const 解析引用路径 = (引用, htmlFile, 部署base) => {
  const 无查询 = 引用.split('?')[0].split('#')[0];
  if (!无查询) return null;
  if (部署base && 无查询.startsWith(部署base + '/')) {
    return path.join(root, 无查询.slice(部署base.length + 1));
  }
  if (无查询.startsWith('/')) return path.join(root, 无查询.slice(1));
  // 相对引用（含 ../）以该 html 所在目录为基准，而不是产物根目录
  return path.resolve(path.dirname(htmlFile), 无查询);
};

const 问题列表 = [];
const htmlFiles = [];
const 收集Html = (dir) => {
  for (const 项 of fs.readdirSync(dir, { withFileTypes: true })) {
    if (项.name === 'node_modules' || 项.name === '.git') continue;
    const p = path.join(dir, 项.name);
    if (项.isDirectory()) 收集Html(p);
    else if (/\.html?$/i.test(项.name)) htmlFiles.push(p);
  }
};
收集Html(root);

const 入口HtmlPath = path.join(root, 'index.html');
const 部署base = 探测部署Base(fs.readFileSync(入口HtmlPath, 'utf8'));

let 引用总数 = 0;
for (const htmlFile of htmlFiles) {
  const rel = path.relative(root, htmlFile).replace(/\\/g, '/');
  const html = fs.readFileSync(htmlFile, 'utf8');
  for (const { 值 } of 收集本地引用(html)) {
    引用总数 += 1;
    for (const { re, 说明 } of 非法引用特征) {
      if (re.test(值)) {
        问题列表.push(`${rel} 引用「${值}」命中非法特征：${说明}`);
      }
    }
    const 目标 = 解析引用路径(值, htmlFile, 部署base);
    if (!目标) continue;
    if (!fs.existsSync(目标)) {
      问题列表.push(`${rel} 引用「${值}」在产物中不存在：${path.relative(root, 目标).replace(/\\/g, '/')}`);
      continue;
    }
    const stat = fs.statSync(目标);
    if (stat.isFile() && stat.size === 0) {
      问题列表.push(`${rel} 引用「${值}」是空文件（0 字节）`);
    }
  }
}

// 入口 index.html 必须挂上**可执行的**主 bundle（只看 <script src>）。
// 若把 <link href="...js">（如 modulepreload）也算入口，index.html 没有任何可执行
// 脚本时会被误判为「有入口」，从而放过真正缺主 bundle 的产物。
const 入口Html = fs.readFileSync(入口HtmlPath, 'utf8');
const 入口Js = 收集本地引用(入口Html)
  .filter((r) => r.标签 === 'script' && /\.m?js(\?|$)/i.test(r.值))
  .map((r) => r.值);
if (入口Js.length === 0) {
  问题列表.push('index.html 没有引用任何本地 JS 入口（主 bundle 缺失 → 必然白屏）');
}

console.log('=== Web 产物静态校验:', root, '===');
console.log('扫描 html 文件:', htmlFiles.length, '｜本地引用:', 引用总数, '｜入口 JS:', 入口Js.length);
if (部署base) console.log('探测到部署 base:', 部署base, '（已从引用路径中剥离）');
if (入口Js.length) console.log('入口 JS:', 入口Js.slice(0, 3).join(', '));
if (问题列表.length) {
  console.log('结果: WEB_DIST_FAIL ❌（' + 问题列表.length + ' 项）');
  for (const p of 问题列表.slice(0, 20)) console.log('  - ' + p);
  if (问题列表.length > 20) console.log('  ... 其余 ' + (问题列表.length - 20) + ' 项省略');
  console.log('');
  console.log('典型病因：构建命令的 `--base=/` 被 Git Bash 的 MSYS 转成了本机绝对路径。');
  console.log('修法：构建命令前加 MSYS2_ARG_CONV_EXCL=\'*\'，或改用 node 脚本拼参数构建。');
  process.exit(1);
}
console.log('结果: WEB_DIST_OK ✅');
