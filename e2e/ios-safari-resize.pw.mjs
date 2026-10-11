/**
 * iOS Safari 尺寸变化闪退的引擎级验证（Playwright WebKit）。
 *
 * ⚠️ 诚实声明：本机没有真机 iOS/iPad Safari，WebKit 只是同引擎近似，
 *    不能替代真机验证。它能证明的是「断点抖动不再导致组件树反复重建、
 *    页面不再崩溃」，不能证明「所有真机场景都完美」。
 *
 * 用法：node e2e/ios-safari-resize.pw.mjs [--url http://127.0.0.1:4173]
 */
import { webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const urlArgIndex = args.indexOf('--url');
const BASE_URL = urlArgIndex >= 0 ? args[urlArgIndex + 1] : null;

const DIST = path.resolve('.tmp-web-ios-fix');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
};

const startStaticServer = async (root) => {
    const server = createServer(async (req, res) => {
        try {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            // WebKit 有时会发绝对形式请求（http://host/assets/x.js），
            // 必须先剥掉 origin，否则 path.resolve 会拼出无效路径导致 SPA 兜底。
            const pathname = urlPath.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/, '');
            const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
            const filePath = path.resolve(root, rel);

            // 防目录穿越：解析后必须仍在 root 之内
            if (!filePath.startsWith(path.resolve(root))) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }

            let body = null;
            let ext = path.extname(filePath);
            try {
                body = await readFile(filePath);
                if (process.env.PROBE_SERVE) {
                    console.log(`  [serve] ${pathname} -> OK (${ext || '无扩展名'}, ${body.length}B)`);
                }
            } catch {
                // SPA 兜底
                if (process.env.PROBE_SERVE) console.log(`  [serve] ${pathname} -> 未命中，回落 index.html`);
                ext = '.html';
                body = await readFile(path.join(root, 'index.html'));
            }
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(body);
        } catch (error) {
            res.writeHead(500);
            res.end(String(error));
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return { server, origin: `http://127.0.0.1:${port}` };
};

const results = [];
const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const main = async () => {
    // 先确认构建产物真的是我们要测的那份，别测错对象
    const expectedEntry = path.join(DIST, 'index.html');
    try {
        const html = await readFile(expectedEntry, 'utf8');
        if (html.includes('workbuddy/resources') || html.includes('PortableGit')) {
            throw new Error('构建产物 index.html 被 MSYS 路径转换污染，不能用于验证');
        }
        console.log(`产物自检通过: ${expectedEntry}`);
    } catch (error) {
        console.error('产物自检失败:', error.message);
        console.error('请用带 MSYS 隔离的命令重新构建：');
        console.error("  MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 VITE_BASE_PATH='/' npx vite build --base=/ --outDir .tmp-web-ios-fix --emptyOutDir=false");
        process.exit(3);
    }

    let server = null;
    let origin = BASE_URL;
    if (!origin) {
        const started = await startStaticServer(DIST);
        server = started.server;
        origin = started.origin;
    }
    console.log(`目标地址: ${origin}\n`);

    const browser = await webkit.launch();
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();

    const failedRequests = [];
    const suspicious = [];
    page.on('response', async (response) => {
        if (response.status() >= 400) {
            failedRequests.push(`${response.status()} ${response.url()}`);
        }
        const ct = response.headers()['content-type'] || '';
        const url = response.url();
        // 抓「扩展名是静态资源、MIME 却是 html」的异常响应，直捣真正根因
        if (/\.(css|js)(\?|$)/.test(url) && ct.includes('text/html')) {
            try {
                const body = await response.text();
                suspicious.push(`MIME异常 ${url}\n    ct=${ct}\n    body前120字符=${body.slice(0, 120).replace(/\s+/g, ' ')}`);
            } catch {
                suspicious.push(`MIME异常 ${url} ct=${ct} (body读取失败)`);
            }
        }
    });
    page.on('requestfailed', (request) => {
        failedRequests.push(`FAILED ${request.url()} :: ${request.failure()?.errorText || ''}`);
    });

    /**
 * 本地起服务时，App 会去线上域名拉 release-info.json 做版本检查，
 * CORS 预检必然 405。这是本地测试环境的固有噪音，与被测的 resize 修复无关，
 * 不能计入失败（否则永远分不清「真崩了」和「环境噪声」）。
 */
const isEnvironmentNoise = (text) => {
    const s = String(text || '');
    return s.includes('release-info.json')
        || s.includes('access control checks')
        || s.includes('Preflight response');
};

const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => {
        const text = String(error);
        if (isEnvironmentNoise(text)) return;
        pageErrors.push(text);
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !isEnvironmentNoise(msg.text())) consoleErrors.push(msg.text());
    });

    let crashed = false;
    page.on('crash', () => { crashed = true; });

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 首页会自动弹更新日志遮罩，先抑制，避免干扰交互
    await page.evaluate(() => {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', today);
    });
    await page.waitForTimeout(2500);

    record('页面加载完成', true, `title=${await page.title()}`);

    /**
     * 核心探针：统计 resize 落地时「移动端/桌面端形态」的翻转次数。
     * 直接对应玩家反馈的根因——修复前这段抖动会翻转 7 次。
     * 通过检测移动端专属标记元素是否在/不在 DOM 来间接判定当前形态。
     */
    const installProbe = async () => page.evaluate(() => {
        window.__probe = { resizeEvents: 0, orientationEvents: 0 };
        window.__isMobileFlips = 0;
        window.__lastMobileShape = null;

        const detectMobileShape = () => {
            // 桌面端根容器有 p-3 内边距，移动端没有；这是 App.tsx 里 isMobile 的直接体现
            const root = document.querySelector('#root > div');
            if (!root) return null;
            return root.className.includes('md:p-3') || root.className.includes(' p-3') ? 'desktop' : 'mobile';
        };

        const observe = () => {
            const shape = detectMobileShape();
            if (shape === null) return;
            if (window.__lastMobileShape === null) {
                window.__lastMobileShape = shape;
                return;
            }
            if (shape !== window.__lastMobileShape) {
                window.__lastMobileShape = shape;
                window.__isMobileFlips += 1;
            }
        };

        window.addEventListener('resize', () => { window.__probe.resizeEvents += 1; });
        window.addEventListener('orientationchange', () => { window.__probe.orientationEvents += 1; });

        // 形态切换是异步 React 渲染，用 MutationObserver 持续跟踪
        const observer = new MutationObserver(observe);
        observer.observe(document.getElementById('root') || document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
        });
        window.__probeObserver = observer;
        observe();
    });
    await installProbe();

    // iPad 分屏拖动 / 窗口缩放的典型抖动序列
    const jitter = [390, 780, 690, 800, 700, 810, 740, 820, 760, 795, 730, 805];
    for (const width of jitter) {
        await page.setViewportSize({ width, height: 844 });
        // 模拟浏览器连续抖动：同一宽度下再快速抖两次
        await page.setViewportSize({ width: width + 3, height: 844 });
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(30);
    }
    await page.waitForTimeout(600);

    const probe = await page.evaluate(() => window.__probe);
    // 抖动序列产生 resize 事件
    record(
        '抖动序列产生 resize 事件',
        probe.resizeEvents > 0,
        `resize=${probe.resizeEvents} orientationchange=${probe.orientationEvents}`
    );

    // 核心指标：抖动不应引发断点反复横跳。用探针统计 isMobile 翻转次数。
    const flipCount = await page.evaluate(() => window.__isMobileFlips ?? -1);
    record(
        '抖动未导致 isMobile 反复横跳',
        flipCount >= 0 && flipCount <= 1,
        flipCount < 0 ? '未安装探针' : `翻转次数=${flipCount}（修复前该序列会翻转多次）`
    );

    record('页面在连续抖动中未崩溃', !crashed, crashed ? 'WebKit 报告页面 crash' : '');
    record('抖动过程无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    // 关键：抖动结束后页面仍可交互、仍有内容
    const rootAlive = await page.evaluate(() => {
        const root = document.getElementById('root');
        return Boolean(root && root.children.length > 0);
    });
    record('抖动后根节点仍存活', rootAlive);

    const bodyTextLen = await page.evaluate(() => (document.body.innerText || '').trim().length);
    record('抖动后页面仍有可见内容', bodyTextLen > 20, `可见文本长度=${bodyTextLen}`);

    // 真正的旋转：横竖来回切
    for (const [w, h] of [[844, 390], [390, 844], [844, 390], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
    }
    await page.waitForTimeout(600);
    record('横竖屏来回切换后未崩溃', !crashed);
    record('横竖屏切换后无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    const finalProbe = await page.evaluate(() => window.__probe);
    record(
        '旋转也触发了监听',
        finalProbe.resizeEvents > 0 || finalProbe.orientationEvents > 0,
        `resize=${finalProbe.resizeEvents} orientationchange=${finalProbe.orientationEvents}`
    );

    // 抖完还能点：点一下页面任意可点元素不报错即视为存活
    let clickOk = true;
    try {
        await page.mouse.click(195, 700, { timeout: 3000 });
    } catch {
        clickOk = false;
    }
    await page.waitForTimeout(400);
    record('抖动后仍可响应点击', clickOk && !crashed);

    const finalErrors = pageErrors.length;
    record('全程无 pageerror', finalErrors === 0, pageErrors.slice(0, 5).join(' | '));

    if (consoleErrors.length) {
        console.log(`\n控制台错误（供参考，可能含无害的网络/资源告警）共 ${consoleErrors.length} 条:`);
        consoleErrors.slice(0, 8).forEach((line) => console.log(`  - ${line.slice(0, 220)}`));
    }

    if (failedRequests.length) {
        console.log(`\n失败请求共 ${failedRequests.length} 条:`);
        failedRequests.slice(0, 15).forEach((line) => console.log(`  - ${line.slice(0, 220)}`));
    } else {
        console.log('\n无失败请求。');
    }

    if (suspicious.length) {
        console.log(`\nMIME 异常响应共 ${suspicious.length} 条:`);
        suspicious.slice(0, 10).forEach((line) => console.log(`  - ${line}`));
    }

    await browser.close();
    if (server) server.close();

    const failed = results.filter((r) => !r.passed);
    console.log(`\n===== 结果: ${results.length - failed.length}/${results.length} 通过 =====`);
    if (failed.length) {
        console.log('失败项:');
        failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` | ${f.detail}` : ''}`));
    }
    console.log('\n⚠️提醒：WebKit 非真机 Safari，本结果为引擎级近似，仍建议真机复核。');
    process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
    console.error('运行失败:', error);
    process.exit(2);
});