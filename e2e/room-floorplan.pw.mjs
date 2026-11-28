import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const baseSave = JSON.parse(readFileSync('e2e/fixtures/desktop-compact-save.json', 'utf8'));
const site = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

test('白天读档进入地图，场所显示未探索房间和剧情指定的通路', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === new URL(site).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    await page.goto(site + '/?skipReleaseNotes=1');
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
    const save = structuredClone(baseSave);
    const levels = ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'];
    const names = ['九州', '青州', '东郡', '洛城', '回春驿', '前厅'];
    const layers = levels.map((层级, i) => ({ ID: 'node' + i, 名称: names[i], 层级, 父级ID: i ? 'node' + (i - 1) : '' }));
    layers.push({ ID: 'apothecary', 名称: '药房', 层级: '子地点', 父级ID: 'node4', 连通房间: ['前厅'] });
    layers.push({ ID: 'yard', 名称: '后院', 层级: '子地点', 父级ID: 'node4' });
    save.世界.地图层级 = layers;
    Object.assign(save.环境信息, { 大地点: '青州', 中地点: '东郡', 小地点: '洛城', 具体地点: '回春驿 > 前厅' });

    await page.evaluate(async data => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('WuxiaGameDB');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['saves', 'save_summaries', 'settings'], 'readwrite');
            tx.objectStore('saves').put(data);
            tx.objectStore('save_summaries').put({
                id: data.id, 类型: data.类型, 时间戳: data.时间戳, 角色数据: data.角色数据,
                元数据: data.元数据, 游戏初始时间: data.游戏初始时间, 环境信息: data.环境信息
            });
            tx.objectStore('settings').put({ key: 'app_theme', value: 'day' });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, save);
    await page.reload();
    await page.getByRole('button', { name: '本地游玩', exact: true }).click();
    await page.getByRole('button', { name: '重入江湖', exact: true }).click();
    await page.getByText(/点击本系列会直接读取最新存档/).first().click();
    await page.getByRole('button', { name: '读取', exact: true }).last().click();
    await expect(page.locator('.desktop-game-frame')).toBeVisible();
    await page.getByRole('button', { name: /江湖舆图/ }).click();
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    const map = page.locator('.moran-map-surface');
    await expect(map.locator('[data-people-node="node5"]')).toBeAttached();
    await page.locator('span.truncate').filter({ hasText: /^回春驿$/ }).first().click();
    await expect(map.locator('[data-room-fog]').first()).toBeVisible();
    await expect(map.locator('[data-room-passage]')).toHaveCount(1);
    await expect(map.locator('[data-room-passage] title')).toHaveText(/^(药房 ↔ 前厅|前厅 ↔ 药房)$/);
    await expect(map.getByText('未探索房间', { exact: true })).toBeVisible();
    await expect(map.getByText('已知通路', { exact: true })).toBeVisible();
    await expect(map.locator('[data-room-passage] line')).toHaveCSS('stroke', 'rgb(36, 86, 64)');
    const image = testInfo.outputPath('room-floorplan-day.png');
    await map.screenshot({ path: image, animations: 'disabled' });
    await testInfo.attach('白天场所地图', { path: image, contentType: 'image/png' });
    await page.locator('span.truncate').filter({ hasText: /^前厅$/ }).first().click();
    const exits = page.locator('div[aria-label="已知通路"]');
    await expect(exits.getByRole('button', { name: '药房' })).toBeVisible();
    await exits.getByRole('button', { name: '药房' }).click();
    await expect(exits.getByRole('button', { name: '前厅' })).toBeVisible();
    await expect(exits.getByRole('button', { name: '后院' })).toHaveCount(0);
});
