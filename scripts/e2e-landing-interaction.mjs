/**
 * 落地页交互端到端断言（防「点按钮没反应」回归）
 *
 * 覆盖：
 * 1. 首次打开（无 localStorage）：更新日志遮罩出现时，点背景可关闭；
 * 2. 关闭后「本地游玩」按钮可点击并弹出选择框；
 * 3. 采集加载耗时 / 长任务 / JS 堆，作为性能回归的观测数据。
 *
 * 用法：
 *   node scripts/e2e-landing-interaction.mjs [url]
 * 退出码：0 = 全部断言通过；1 = 有断言失败。
 */
import { chromium } from 'playwright';

const target = process.argv[2] || 'https://msjh.bacon159.pp.ua/';
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const browser = await chromium.launch({
    headless: true,
    ...(proxy ? { proxy: { server: proxy } } : {})
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const failures = [];
const assert = (cond, message) => {
    if (cond) console.log('  ✓', message);
    else { console.log('  ✗', message); failures.push(message); }
};

const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + String((e && e.stack) || e)));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console.error] ' + m.text());
});

await page.addInitScript(() => {
    window.__longTasks = [];
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                window.__longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
            }
        }).observe({ entryTypes: ['longtask'] });
    } catch { /* 浏览器不支持则跳过 */ }
});

const t0 = Date.now();
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
const loadMs = Date.now() - t0;

const perf = await page.evaluate(() => ({
    longTasks: (window.__longTasks || []).length,
    longTaskTotal: (window.__longTasks || []).reduce((sum, t) => sum + t.duration, 0),
    memoryMB: (performance).memory ? Math.round((performance).memory.usedJSHeapSize / 1048576) : null
}));

console.log('=== 性能观测 ===');
console.log('  加载+挂载耗时:', loadMs, 'ms');
console.log('  长任务:', perf.longTasks, '个 /', perf.longTaskTotal, 'ms');
console.log('  JS 堆:', perf.memoryMB, 'MB');
assert(perf.memoryMB === null || perf.memoryMB < 300, 'JS 堆低于 300MB（无内存泄漏回归）');

console.log('=== 更新日志遮罩 ===');
const backdrop = page.locator('.release-notes-backdrop');
const hasBackdrop = await backdrop.count() > 0;
console.log('  遮罩出现:', hasBackdrop);
if (hasBackdrop) {
    // 点遮罩空白处（不是面板内部）应能关闭
    await backdrop.click({ position: { x: 8, y: 8 }, timeout: 5000 }).catch((e) => {
        console.log('  遮罩点击异常:', e.message.split('\n')[0]);
    });
    await page.waitForTimeout(800);
    assert(await backdrop.count() === 0, '点击遮罩背景可关闭更新日志');
}

console.log('=== 主按钮交互 ===');
const localPlay = page.getByRole('button', { name: '本地游玩' }).first();
let clickOk = false;
let clickErr = '';
try {
    await localPlay.click({ timeout: 6000 });
    clickOk = true;
} catch (e) {
    clickErr = String(e.message).split('\n').slice(0, 4).join(' | ');
}
assert(clickOk, `「本地游玩」按钮可点击${clickOk ? '' : '：' + clickErr}`);
await page.waitForTimeout(800);
const bodyText = await page.locator('body').innerText();
const hasChoice = /踏入江湖|重入江湖/.test(bodyText);
assert(hasChoice, '点击后出现本地游玩选择界面（踏入江湖/重入江湖）');

console.log('=== 控制台错误 ===');
// 本地静态服务器没有 Worker API，资源 404 不计为页面缺陷；线上环境则计入。
const isLocal = /127\.0\.0\.1|localhost/.test(target);
// 本地静态服务器缺 Worker/CORS 配置，所有 [console.error] 资源类报错都属环境限制；
// 真正的 JS 异常以 [pageerror] 为准（线上/本地都必须为 0）。
const realErrors = errors.filter((e) => e.startsWith('[pageerror]') || !isLocal);
assert(realErrors.length === 0, `无页面错误${realErrors.length ? '：' + realErrors[0].slice(0, 200) : ''}`);

await browser.close();
if (failures.length) {
    console.log(`\nE2E 失败 ${failures.length} 项`);
    process.exit(1);
}
console.log('\nE2E 全部通过 ✅');
