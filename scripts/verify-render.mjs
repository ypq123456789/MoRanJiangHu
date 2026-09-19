/**
 * 构建产物「真实渲染」验证
 *
 * 为什么需要它：
 * v1.0.669 发布时只核对了版本号、bundle 哈希、APK 体积、双域清单 —— 这些只能证明
 * 「文件送上去了」，**无法证明「送上去的文件本身是好的」**。该版本把 React 打成了两份，
 * 页面直接白屏（Cannot read properties of null (reading 'useRef')），而所有哈希/清单核对
 * 全部通过，导致误报发布成功。
 *
 * 本脚本用无头浏览器真实加载构建产物，断言页面能渲染出主界面。
 *
 * 用法：
 *   node scripts/verify-render.mjs               # 校验 dist/
 *   node scripts/verify-render.mjs <dir>         # 校验指定目录
 *   node scripts/verify-render.mjs <url>         # 校验线上地址（http/https）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const target = process.argv[2] || 'dist';
const isRemote = /^https?:\/\//i.test(target);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** 启动本地静态服务器（单个监听端口，绝不绑定 0.0.0.0）。 */
const startServer = async (dir) => {
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    throw new Error(`未找到 ${root}/index.html，请先构建`);
  }
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    // 防目录穿越
    const f = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
      return;
    }
    const idx = path.join(root, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      fs.createReadStream(idx).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('404');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}/` };
};

/** 判定失败的错误签名（白屏/hook 异常类）。 */
const FATAL_SIGNATURES = [
  /Cannot read properties of null \(reading 'useRef'\)/,
  /Invalid hook call/i,
  /Minified React error #321/,
  /应用界面加载失败/,
];

const main = async () => {
  let server = null;
  let url = target;
  const navErrors = [];

  if (!isRemote) {
    const started = await startServer(target);
    server = started.server;
    url = started.url;
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console.error] ' + m.text());
  });

  // 线上站点常驻长连接（轮询/推送）会让 networkidle 永远不触发，因此线上只等 domcontentloaded，
  // 再靠固定等待时间让 React 完成挂载。本地静态服务器仍可用 networkidle。
  await page
    .goto(url, {
      waitUntil: isRemote ? 'domcontentloaded' : 'networkidle',
      timeout: 90_000,
    })
    .catch((e) => {
      // 导航超时不足以判定渲染失败：只要页面内容挂载出来了就继续判定
      navErrors.push('[goto] ' + e.message);
    });
  await page.waitForTimeout(isRemote ? 8000 : 6000);

  const state = await page.evaluate(() => {
    const r = document.getElementById('root');
    const html = r ? r.innerHTML : '';
    const text = r ? r.innerText : '';

    // ⚠️ 不能用 /应用界面加载失败/.test(root 文本) 判定 —— 该短语会出现在**正常的更新公告**
    // 里（例如「修复了『应用界面加载失败』的问题」），那样每次发版只要公告提到这句话就会
    // 误报失败。必须精确匹配错误屏特有的标题行。
    // 错误屏的实际标题是「应用界面加载失败」单独成行，且伴随固定的副标题/操作提示。
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const errorTitleLine =
      lines.includes('应用界面加载失败') &&
      lines.some((l) => /请尝试以下|重新加载|刷新页面|错误详情|Error|错误信息/.test(l));

    // 双保险：源码里错误屏使用的容器标识
    const errorContainer = !!document.querySelector(
      '#app-error, .app-error, [data-app-error], [data-error-boundary-fallback]'
    );

    // 真实可见性检查：错误屏若存在，必为占据视口的可见元素
    const visibleErrorNode = (() => {
      const nodes = Array.from(document.querySelectorAll('h1, h2, .error-title'));
      return nodes.some((el) => {
        const t = (el.textContent || '').trim();
        if (t !== '应用界面加载失败') return false;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    })();

    return {
      rootLength: html.length,
      showsError: (errorTitleLine && visibleErrorNode) || errorContainer,
      textHead: text.slice(0, 200),
    };
  }).catch((e) => ({ rootLength: 0, showsError: true, textHead: '__EVAL_FAIL__ ' + e.message }));

  await browser.close();
  if (server) server.close();

  const fatal = errors.filter((e) => FATAL_SIGNATURES.some((re) => re.test(e)));
  const ok = !state.showsError && fatal.length === 0 && state.rootLength > 500;

  console.log('=== 渲染验证:', url, '===');
  console.log('结果:', ok ? 'RENDER_OK ✅' : 'RENDER_FAIL ❌');
  console.log('root 内容长度:', state.rootLength);
  console.log('显示错误界面:', state.showsError);
  if (fatal.length) {
    console.log('--- 致命错误 ---');
    console.log(fatal.slice(0, 3).join('\n'));
  }
  if (navErrors.length && !ok) {
    console.log('--- 导航告警 ---');
    console.log(navErrors.slice(0, 2).join('\n'));
  }
  if (!ok) {
    console.log('--- 页面可见文本 ---');
    console.log(state.textHead || '(空)');
  }
  if (ok) {
    console.log('--- 页面可见文本(截断) ---');
    console.log(state.textHead.replace(/\s+/g, ' ').slice(0, 120) || '(空)');
  }

  process.exit(ok ? 0 : 1);
};

main().catch((e) => {
  console.error('渲染验证脚本异常:', e?.message || e);
  process.exit(1);
});
