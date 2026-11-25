/**
 * 云端设置同步端到端诊断：抓真实请求体，定位「设置内容为空」
 * 用法：node scripts/e2e-cloud-settings.mjs <url> <username> <password>
 */
import { chromium } from 'playwright';

const [target, username, password] = process.argv.slice(2);
if (!target || !username || !password) {
    console.error('用法: node scripts/e2e-cloud-settings.mjs <url> <username> <password>');
    process.exit(2);
}
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300));
});

const reqs = [];
// 🔴 绝不能把请求体原文写进日志：登录/同步请求含明文密码，诊断输出会被保存或分享。
// 只记录动作和长度；如果确实要看结构，先把 password / payload 等敏感字段遮盖掉。
const 脱敏请求体 = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if ('password' in parsed) parsed.password = '***';
            if ('payload' in parsed) parsed.payload = typeof parsed.payload === 'string' ? `[密文 ${parsed.payload.length} 字符]` : '***';
        }
        return JSON.stringify(parsed);
    } catch {
        return '[非 JSON 请求体，已省略]';
    }
};
page.on('request', (r) => {
    if (r.url().includes('/api/cloud-play')) {
        const body = r.postData() || '';
        reqs.push({
            action: new URL(r.url()).searchParams.get('action'),
            len: body.length,
            head: 脱敏请求体(body).slice(0, 300)
        });
    }
});
page.on('response', async (r) => {
    if (r.url().includes('/api/cloud-play')) {
        try {
            const text = await r.text();
            console.log('[resp]', new URL(r.url()).searchParams.get('action'), r.status(), text.slice(0, 300));
        } catch { /* ignore */ }
    }
});

await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} },
    ['moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10)]);
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// 打开「云端游玩」弹窗
await page.getByRole('button', { name: '云端游玩' }).first().click();
await page.waitForTimeout(600);
// 风险提示首次确认
const riskAck = page.getByRole('button', { name: '我已了解风险' }).first();
if (await riskAck.count()) {
    await riskAck.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
}
console.log('=== 弹窗文本 ===');
console.log((await page.locator('body').innerText()).slice(0, 900));

// 填账号密码（找输入框）
const inputs = await page.locator('input').evaluateAll((els) => els.map((el, i) => ({
    i, type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder'), name: el.getAttribute('name')
})));
console.log('=== 输入框 ===', JSON.stringify(inputs));
const userInputs = page.locator('input[type="text"], input:not([type])');
const passInputs = page.locator('input[type="password"]');
if (await userInputs.count()) await userInputs.first().fill(username);
if (await passInputs.count()) await passInputs.first().fill(password);

// 找登录按钮
const btns = await page.locator('button').evaluateAll((els) => els.filter((e) => {
    const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
}).map((e) => (e.innerText || '').trim()).filter(Boolean));
console.log('=== 可见按钮 ===', JSON.stringify(btns.slice(0, 40)));
const login = page.getByRole('button', { name: '登录云端' }).first();
if (await login.count()) {
    await login.click({ timeout: 5000 }).catch((e) => console.log('登录点击失败', e.message.slice(0, 200)));
}
await page.waitForTimeout(4000);

console.log('=== 抓到的请求 ===');
reqs.forEach((r) => console.log(JSON.stringify(r)));
console.log('=== 登录后弹窗文本 ===');
console.log((await page.locator('body').innerText()).slice(0, 1200));

// 如果面板有「立即同步」，点一下
const sync = page.getByRole('button', { name: '立即同步' }).first();
if (await sync.count()) {
    console.log('=== 点「立即同步」 ===');
    await sync.click({ timeout: 5000 }).catch((e) => console.log('点击失败', e.message.slice(0, 200)));
    // 同步是异步的：等待面板状态徽章离开「整理设置/加密中/上传中/拉取云端」等中间态，
    // 或至少等到出现 settings-upload 响应，再结束采集，避免打印未完成的中间状态。
    const settled = await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return /已完成|失败|已跳过同步/.test(text);
    }, undefined, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!settled) console.log('提示：30 秒内同步未进入终态');
    await page.waitForTimeout(800);
    console.log('=== 点同步后请求 ===');
    reqs.slice(-10).forEach((r) => console.log(JSON.stringify(r)));
    console.log('=== 面板文本 ===');
    console.log((await page.locator('body').innerText()).slice(0, 1200));
}

await browser.close();
