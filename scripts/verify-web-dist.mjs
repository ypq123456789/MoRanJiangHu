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

/** 从 html 里抽出所有本地资源引用（src/href，去掉外链与 data/blob）。 */
const 收集本地引用 = (html) => {
  const 结果 = [];
  const 正则 = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = 正则.exec(html))) {
    const 值 = m[1].trim();
    if (!值) continue;
    if (/^(?:https?:)?\/\//i.test(值)) continue;      // 外链
    if (/^(?:data|blob|mailto|javascript|#)/i.test(值)) continue;
    结果.push(值);
  }
  return 结果;
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

let 引用总数 = 0;
for (const htmlFile of htmlFiles) {
  const rel = path.relative(root, htmlFile).replace(/\\/g, '/');
  const html = fs.readFileSync(htmlFile, 'utf8');
  for (const 引用 of 收集本地引用(html)) {
    引用总数 += 1;
    for (const { re, 说明 } of 非法引用特征) {
      if (re.test(引用)) {
        问题列表.push(`${rel} 引用「${引用}」命中非法特征：${说明}`);
      }
    }
    // 去掉 query/hash 后定位文件
    const 相对文件 = 引用.split('?')[0].split('#')[0].replace(/^\//, '');
    if (!相对文件) continue;
    const 目标 = path.join(root, 相对文件);
    if (!fs.existsSync(目标)) {
      问题列表.push(`${rel} 引用「${引用}」在产物中不存在：${相对文件}`);
      continue;
    }
    const stat = fs.statSync(目标);
    if (stat.isFile() && stat.size === 0) {
      问题列表.push(`${rel} 引用「${引用}」是空文件（0 字节）：${相对文件}`);
    }
  }
}

// 入口 index.html 必须真的挂上主 bundle，且内容非空
const 入口Html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const 入口引用 = 收集本地引用(入口Html);
const 入口Js = 入口引用.filter((r) => /\.m?js(\?|$)/i.test(r));
if (入口Js.length === 0) {
  问题列表.push('index.html 没有引用任何本地 JS 入口（主 bundle 缺失 → 必然白屏）');
}

console.log('=== Web 产物静态校验:', root, '===');
console.log('扫描 html 文件:', htmlFiles.length, '｜本地引用:', 引用总数, '｜入口 JS:', 入口Js.length);
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
