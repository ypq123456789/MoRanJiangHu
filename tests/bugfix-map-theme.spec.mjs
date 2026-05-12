import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const zip = unzipSync(readFileSync('.tmp-release-assets/WuXia_Save_Data.zip'));
const saveName = Object.keys(zip).find((name) => name.startsWith('saves/') && name.endsWith('.json'));
const save = JSON.parse(strFromU8(zip[saveName]));

const closeReleaseNotesIfOpen = async (page) => {
    const closeButton = page.locator('button[aria-label="关闭更新日志"]');
    await closeButton.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
    if (await closeButton.count() && await closeButton.first().isVisible().catch(() => false)) {
        await closeButton.first().click({ timeout: 3000, force: true });
        await closeButton.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
};

const clickByTexts = async (page, texts) => {
    for (const text of texts) {
        const button = page.getByRole('button', { name: new RegExp(text) }).first();
        if (await button.count() && await button.isVisible().catch(() => false)) {
            await button.click({ timeout: 3000 });
            return true;
        }
        const locator = page.getByText(text, { exact: false }).filter({ hasNot: page.locator('button') }).first();
        if (await locator.count() && await locator.isVisible().catch(() => false)) {
            await locator.click({ timeout: 3000 });
            return true;
        }
    }
    return false;
};

const injectSaveAndReload = async (page) => {
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);
    await page.evaluate(async (payload) => {
        const req = indexedDB.open('WuxiaGameDB', 2);
        const db = await new Promise((resolve, reject) => {
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true });
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('image_assets')) db.createObjectStore('image_assets', { keyPath: 'id' });
            };
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['saves'], 'readwrite');
            tx.objectStore('saves').put(payload);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }, save);
    await page.reload({ waitUntil: 'networkidle' });
};

test('B11 主题修改后刷新仍然保留，不会被 day 覆盖', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
    });
    // 先把 app_theme 写成 ink，然后刷新页面。修复前因为首次挂载的默认 day 会抢先覆盖，主题会丢失。
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);
    await page.evaluate(async () => {
        const req = indexedDB.open('WuxiaGameDB', 2);
        const db = await new Promise((resolve, reject) => {
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
            };
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['settings'], 'readwrite');
            tx.objectStore('settings').put({ key: 'app_theme', value: 'ink', version: 1, updatedAt: Date.now(), category: 'interface' });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    });
    await page.reload({ waitUntil: 'networkidle' });
    // 等待 init 流程把主题应用到 <html>
    await page.waitForTimeout(1500);
    // 再读 IDB，确认 app_theme 仍然是 'ink'（修复前会被 'day' 覆盖）
    const persistedTheme = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('WuxiaGameDB', 2);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(['settings'], 'readonly');
                const getReq = tx.objectStore('settings').get('app_theme');
                getReq.onsuccess = () => resolve(getReq.result?.value ?? null);
                getReq.onerror = () => reject(getReq.error);
            };
        });
    });
    expect(persistedTheme).toBe('ink');
});

test('B6 地图面板不再出现独立的"返回上一级"按钮', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
    });
    await injectSaveAndReload(page);
    await clickByTexts(page, ['重入江湖', '读取进度', '继续游戏', '读取', '载入']);
    await page.waitForTimeout(700);
    await clickByTexts(page, ['杨培强', 'manual_20260420', '手动存档']);
    await page.waitForTimeout(300);
    await clickByTexts(page, ['加载此存档', '读取此存档', '载入存档', '确认读取', '读取', '进入江湖']);
    await page.waitForTimeout(2500);
    await clickByTexts(page, ['地图']);
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    // 修复后该按钮整体被移除。"返回上一级：XX" 这样的文案不应再出现。
    expect(bodyText).not.toMatch(/返回上一级：/);
});
