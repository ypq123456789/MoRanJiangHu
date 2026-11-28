import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

let server;
let origin;
test.beforeAll(async () => {
    server = await createServer({
        configFile: false,
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
        optimizeDeps: { include: ['react', 'react-dom/client'] }
    });
    await server.listen();
    origin = 'http://127.0.0.1:' + server.httpServer.address().port;
});
test.afterAll(async () => { await server?.close(); });

test('退回原存档和 V1 领取凭据同事务写盘，可恢复中断的写盘和缓存清理', async ({ page }) => {
    await page.route('**/migration-test.html', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto(origin + '/migration-test.html');
    const result = await page.evaluate(async () => {
        const db = await import('/services/dbService.ts');
        const { 获取旧版拍卖行存储键 } = await import('/utils/legacyAuctionMigration.ts');
        const conn = await db.初始化数据库();
        const item = { ID: 'item', 名称: '青玉', 类型: '杂物', 是否可堆叠: true, 堆叠数量: 2 };
        const entries = [{ ID: 'sale', 卖家ID: 'player', 状态: '上架中', 物品: item }];
        const source = (id) => ({ id, 时间戳: id, 类型: 'manual', 历史记录: [], 环境信息: {}, 角色数据: { 姓名: '青竹', 物品列表: [] },
            拍卖行: { 玩家寄售列表: entries, 拍卖品列表: entries } });
        const first = source(1);
        const second = source(2);
        const key = 获取旧版拍卖行存储键(first);
        localStorage.setItem(key, JSON.stringify({ 拍卖品列表: entries }));
        const localStatus = () => JSON.parse(localStorage.getItem(key)).拍卖品列表[0].状态;
        await new Promise((resolve, reject) => {
            const tx = conn.transaction('saves', 'readwrite');
            tx.objectStore('saves').put(first);
            tx.objectStore('saves').put(second);
            tx.oncomplete = resolve;
            tx.onabort = reject;
        });
        // 模拟角色写入请求已成功、但同一事务随后回滚。
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
            const req = put.apply(this, args);
            if (this.name === 'save_summaries') req.onsuccess = () => this.transaction.abort();
            return req;
        };
        let failed = false;
        try { await db.写回旧版寄售迁移(first); } catch { failed = true; }
        finally { IDBObjectStore.prototype.put = put; }
        const afterAbort = [failed, (await db.读取存档(1)).角色数据.物品列表.length, localStatus()];

        // 两个槽竞争同一 V1 寄售；同时模拟浏览器拒绝写 localStorage。
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new Error('模拟缓存未能清理');
            return set.call(this, name, value);
        };
        try { await Promise.all([db.写回旧版寄售迁移(first), db.写回旧版寄售迁移(second)]); }
        finally { Storage.prototype.setItem = set; }
        const stillListed = localStatus();
        const beforeRetry = await Promise.all([db.读取存档(1), db.读取存档(2)]);
        // 云端携带的槽位号可能属于另一个本地存档；哈希须指向已持久化的正确角色。
        const matched = await db.写回旧版寄售迁移({ ...first, id: second.id });
        const afterRetry = await Promise.all([db.读取存档(1), db.读取存档(2)]);
        const counts = rows => rows.map(row => row.角色数据.物品列表.reduce((sum, entry) => sum + entry.堆叠数量, 0));
        return { afterAbort, stillListed, matchedId: matched.save.id, counts: counts(beforeRetry), reloaded: counts(afterRetry), cleaned: localStatus(),
            embedded: afterRetry.map(row => row.拍卖行.玩家寄售列表[0].状态) };
    });
    expect(result.afterAbort).toEqual([true, 0, '上架中']);
    expect(result.stillListed).toBe('上架中');
    expect(result.counts.slice().sort()).toEqual([0, 2]);
    expect(result.reloaded).toEqual(result.counts);
    expect(result.matchedId).toBe(1);
    expect(result.embedded).toEqual(['已下架', '已下架']);
    expect(result.cleaned).toBe('已下架');
});

test('日间交锋实际渲染可读的距离确认，确认后才可出招', async ({ page }) => {
    await page.route('**/clash-test.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="day"><link rel="stylesheet" href="/styles/root-theme.css?direct"><link rel="stylesheet" href="/styles/tailwind.css?direct"><link rel="stylesheet" href="/styles/global.css?direct"><div id="clash"></div></html>'
    }));
    await page.goto(origin + '/clash-test.html');
    await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: Clash } = await import('/components/features/Chat/TacticalClashModal.tsx');
        ReactDOM.createRoot(document.getElementById('clash')).render(React.createElement(Clash, {
            open: true, loading: false, role: { 姓名: '游侠', 当前精力: 50 }, env: { 大地点: '云州', 具体地点: '渡口' },
            social: [{ id: 'npc1', 姓名: '追兵', 关系状态: '死敌', 是否在场: true, 当前位置: '云州' }],
            pendingClashes: [], onCommitClash() {}, onClearClashes() {}, onClose() {}
        }));
    });
    const confirm = page.getByRole('button', { name: '确认追兵在交手距离内' });
    const move = page.getByRole('button', { name: /卸力借势/ });
    await expect(confirm).toBeVisible();
    await expect(move).toBeDisabled();
    const contrast = await confirm.evaluate(button => {
        const rgb = color => color.match(/[\d.]+/g).map(Number);
        const luminance = color => color.slice(0, 3).reduce((sum, value, i) => {
            const channel = value / 255;
            return sum + [0.2126, 0.7152, 0.0722][i] * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        }, 0);
        let bg = [255, 255, 255];
        for (let node = button, layers = []; node; node = node.parentElement) {
            layers.push(rgb(getComputedStyle(node).backgroundColor));
            if (node.parentElement) continue;
            for (const [r, g, b, a = 1] of layers.reverse()) bg = [r, g, b].map((v, i) => v * a + bg[i] * (1 - a));
        }
        const fg = luminance(rgb(getComputedStyle(button).color));
        const back = luminance(bg);
        return (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await confirm.click();
    await expect(move).toBeEnabled();
    await move.click();
    await expect(page.getByLabel('出招拆解实录')).toContainText('第 1 拍');
});

test('首次补建出身物品的旧档先恢复出身，再退回寄售资产', async ({ page }) => {
    await page.route('**/migration-test.html', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto(origin + '/migration-test.html');
    const names = await page.evaluate(async () => {
        const db = await import('/services/dbService.ts');
        const { 规范化角色物品容器映射 } = await import('/hooks/useGame/stateTransforms.ts');
        const raw = { id: 1, 时间戳: 1, 类型: 'manual', 历史记录: [], 环境信息: {},
            角色数据: { 姓名: '游侠', 出身背景: { 初始物品: [{ 名称: '家书', 数量: 1 }], 开局货币: [] }, 物品列表: [] },
            拍卖行: { 玩家寄售列表: [{ ID: 'A', 状态: '上架中', 卖家ID: 'player', 物品: { ID: 'jade', 名称: '玉佩', 类型: '材料' } }] } };
        const conn = await db.初始化数据库();
        await new Promise(resolve => {
            const tx = conn.transaction('saves', 'readwrite');
            tx.objectStore('saves').put(raw);
            tx.oncomplete = resolve;
        });
        const normalize = save => 规范化角色物品容器映射(save.角色数据);
        await db.写回旧版寄售迁移(raw, normalize);
        return normalize(await db.读取存档(1)).物品列表.map(item => item.名称);
    });
    expect(names).toEqual(expect.arrayContaining(['家书', '玉佩']));
});
