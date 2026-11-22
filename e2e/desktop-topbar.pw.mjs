import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const baseSave = JSON.parse(readFileSync('e2e/fixtures/desktop-compact-save.json', 'utf8'));
const SHOT_DIR = 'output/playwright/topbar';
mkdirSync(SHOT_DIR, { recursive: true });

const closeReleaseNotesIfOpen = async (page) => {
    const closeButton = page.locator('button[aria-label="关闭更新日志"]');
    await closeButton.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
    if (await closeButton.count() && await closeButton.first().isVisible().catch(() => false)) {
        await closeButton.first().click({ timeout: 3000, force: true });
    }
};

const clickByTexts = async (page, texts) => {
    for (const text of texts) {
        const button = page.getByRole('button', { name: new RegExp(text) }).first();
        if (await button.count() && await button.isVisible().catch(() => false)) {
            await button.click({ timeout: 5000, force: true });
            return true;
        }
        const locator = page.getByText(text, { exact: false }).first();
        if (await locator.count() && await locator.isVisible().catch(() => false)) {
            await locator.click({ timeout: 5000, force: true });
            return true;
        }
    }
    return false;
};

const makeSave = (envOverrides = {}) => {
    const save = structuredClone(baseSave);
    save.id = 52870001;
    save.类型 = 'manual';
    save.时间戳 = 1785250000000;
    save.游戏初始时间 = '0001:01:01:08:00';
    save.角色数据 = {
        ...save.角色数据,
        姓名: '沈砚',
        称号: '江湖散人',
        当前精力: 64,
        当前内力: 24,
    };
    save.环境信息 = {
        时间: '0001:01:01:12:00',
        大地点: '东江州',
        中地点: '青溪镇',
        小地点: '河埠街早市',
        具体地点: '老槐树下卦摊',
        节日: null,
        天气: { 天气: '晴', 结束日期: '0001:01:03:12:00' },
        环境变量: [
            {
                名称: '微雾',
                描述: '晨间薄雾笼罩街巷，远处行人影影绰绰。',
                效果: '远程察觉小幅降低',
            },
        ],
        ...envOverrides,
    };
    save.元数据 = {
        ...(save.元数据 || {}),
        名称: '顶栏改版验收档',
        现实保存时间戳: 1785250000000,
        历史记录条数: 2,
        历史记录是否裁剪: false,
    };
    save.历史记录 = [
        { role: 'user', content: '环顾四周。' },
        {
            role: 'assistant',
            content: 'Structured Response',
            structuredResponse: {
                logs: [
                    {
                        sender: '旁白',
                        text: '河埠街早市人声渐沸，老槐树下卦摊前围了两三行人，茶烟袅袅，檐角铜铃在微风中轻响。',
                    },
                ],
                shortTerm: '正在河埠街早市探听消息。',
                action_options: [
                    '向卦摊先生打听青溪镇近日异闻',
                    '去茶寮点一壶热茶歇脚',
                    '沿河埠街石阶查看早市摊贩',
                    '先整理随身行囊再作打算',
                ],
            },
        },
    ];
    return save;
};

const loadTopbarGame = async (page, viewport, envOverrides = {}, theme = 'day') => {
    test.setTimeout(60000);
    const targetUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5287';
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
        window.__moranFullscreenMock = { active: false, requests: 0, exits: 0 };
        Object.defineProperty(Document.prototype, 'fullscreenElement', {
            configurable: true,
            get: () => (window.__moranFullscreenMock.active ? document.documentElement : null),
        });
        Element.prototype.requestFullscreen = async function () {
            window.__moranFullscreenMock.requests += 1;
            window.__moranFullscreenMock.active = true;
            document.dispatchEvent(new Event('fullscreenchange'));
        };
        Document.prototype.exitFullscreen = async function () {
            window.__moranFullscreenMock.exits += 1;
            window.__moranFullscreenMock.active = false;
            document.dispatchEvent(new Event('fullscreenchange'));
        };
    });

    await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(targetUrl).origin || url.pathname.startsWith('/api/')) return route.abort();
        return route.continue();
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);

    await page.evaluate(async ({ payload, targetTheme }) => {
        const request = indexedDB.open('WuxiaGameDB');
        const db = await new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
        await new Promise((resolve, reject) => {
            const stores = ['saves', 'save_summaries'];
            if (db.objectStoreNames.contains('settings')) stores.push('settings');
            const tx = db.transaction(stores, 'readwrite');
            tx.objectStore('saves').clear();
            tx.objectStore('save_summaries').clear();
            tx.objectStore('saves').put(payload);
            tx.objectStore('save_summaries').put({
                id: payload.id,
                类型: payload.类型,
                时间戳: payload.时间戳,
                元数据: payload.元数据,
                游戏初始时间: payload.游戏初始时间,
                角色数据: payload.角色数据,
                环境信息: payload.环境信息,
            });
            if (stores.includes('settings')) {
                tx.objectStore('settings').put({ key: 'app_theme', value: targetTheme });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, { payload: makeSave(envOverrides), targetTheme: theme });

    await page.reload({ waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);

    await expect.poll(() => clickByTexts(page, ['本地游玩'])).toBe(true);
    await expect.poll(() => clickByTexts(page, ['重入江湖', '读取进度', '继续游戏', '读取', '载入'])).toBe(true);

    await page.getByRole('button', { name: /沈砚.*查看时间树/ }).click();
    await page.getByRole('button', { name: '读取最新存档' }).click();
    await page.getByRole('button', { name: '读取', exact: true }).last().click();
    await expect(page.locator('.desktop-quick-actions')).toBeVisible({ timeout: 10000 });
};

const switchThemeInSettings = async (page, themeId, themeName) => {
    await page.getByRole('button', { name: '江湖设置' }).click();
    const themeTab = page.getByRole('button', { name: '界面风格', exact: true });
    if (!(await themeTab.isVisible())) await page.getByRole('button', { name: /界面与声音/ }).click();
    await themeTab.click();
    await page.getByRole('button', { name: new RegExp(themeName) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', themeId);
    await page.getByRole('button', { name: '关闭设置' }).click();
};

const switchTimeFormatInSettings = async (page, formatLabel) => {
    await page.getByRole('button', { name: '江湖设置' }).click();
    const visualTab = page.getByRole('button', { name: '视觉显示', exact: true });
    if (!(await visualTab.isVisible())) await page.getByRole('button', { name: /界面与声音/ }).click();
    await visualTab.click();
    await page.getByRole('button', { name: new RegExp(formatLabel) }).click();
    await page.getByRole('button', { name: '关闭设置' }).click();
};

const measureTopbarBounds = (page) => page.evaluate(() => {
    const topbar = document.querySelector('.desktop-game-topbar').getBoundingClientRect();
    const main = document.querySelector('.desktop-game-main').getBoundingClientRect();
    const left = document.querySelector('.desktop-topbar-left').getBoundingClientRect();
    const center = document.querySelector('.desktop-topbar-center').getBoundingClientRect();
    const right = document.querySelector('.desktop-topbar-right').getBoundingClientRect();
    const locBtn = document.querySelector('.topbar-location-btn');
    const locBtnRect = locBtn.getBoundingClientRect();
    const currentEl = document.querySelector('.topbar-loc-current');
    const currentRect = currentEl.getBoundingClientRect();
    const chevronRect = document.querySelector('.topbar-loc-chevron').getBoundingClientRect();
    const checkWithin = (textSel, btnSel) => {
        const textEl = document.querySelector(textSel);
        const btnEl = document.querySelector(btnSel);
        if (!textEl || !btnEl) return false;
        const tr = textEl.getBoundingClientRect();
        const br = btnEl.getBoundingClientRect();
        return (
            textEl.scrollWidth <= textEl.clientWidth + 1 &&
            tr.left >= br.left - 1 &&
            tr.right <= br.right + 1
        );
    };
    return {
        topbar,
        main,
        left,
        center,
        right,
        collapseLevel: Number(locBtn.getAttribute('data-collapse-level')),
        currentVisibleWithinButton:
            currentEl.scrollWidth <= currentEl.clientWidth + 1 &&
            currentRect.left >= locBtnRect.left - 1 &&
            currentRect.right <= locBtnRect.right + 1 &&
            chevronRect.right <= locBtnRect.right + 1,
        weatherFits: checkWithin('.topbar-weather-text', '.topbar-weather-btn'),
        envFits: checkWithin('.topbar-env-text', '.topbar-env-pill'),
        festFits: checkWithin('.topbar-festival-text', '.topbar-festival-seal'),
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
});

test('1440px 浅色与深色满态：三栏对齐、传统/数字切换、全屏入口、地点层级与键盘操作', async ({ page }) => {
    await loadTopbarGame(page, { width: 1440, height: 900 }, {}, 'day');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

    const grid = page.locator('.desktop-topbar-grid');
    await expect(grid).toBeVisible();

    const geometry = await measureTopbarBounds(page);
    expect(geometry.overflowX).toBeLessThanOrEqual(1);
    expect(Math.round(geometry.topbar.height)).toBe(58);
    expect(geometry.topbar.bottom).toBeLessThanOrEqual(geometry.main.top + 1);
    expect(geometry.left.right).toBeLessThanOrEqual(geometry.center.left + 1);
    expect(geometry.center.right).toBeLessThanOrEqual(geometry.right.left + 1);
    expect(geometry.currentVisibleWithinButton).toBe(true);
    expect(geometry.weatherFits).toBe(true);
    expect(geometry.envFits).toBe(true);
    expect(geometry.festFits).toBe(true);
    const barCenterX = geometry.topbar.left + geometry.topbar.width / 2;
    const centerBlockCenterX = geometry.center.left + geometry.center.width / 2;
    expect(Math.abs(barCenterX - centerBlockCenterX)).toBeLessThanOrEqual(12);

    // At 1440px, all 4 location levels must be visible without ellipsis
    const locBtn1440 = grid.locator('.topbar-location-btn');
    await expect(locBtn1440).toHaveAttribute('data-collapse-level', '0');
    await expect(locBtn1440).toContainText('东江州');
    await expect(locBtn1440).toContainText('青溪镇');
    await expect(locBtn1440).toContainText('河埠街早市');
    await expect(locBtn1440.locator('.topbar-loc-current')).toHaveText('老槐树下卦摊');
    await expect(locBtn1440.locator('.topbar-loc-ellipsis')).toHaveCount(0);

    await page.screenshot({ path: `${SHOT_DIR}/01-day-1440-full.png`, animations: 'disabled' });

    // Verify all 6 triggers + keyboard Enter / Escape
    const weatherBtn = grid.getByRole('button', { name: '天气：晴' });
    const envBtn = grid.getByRole('button', { name: '环境：微雾' });
    const dateBtn = grid.getByRole('button', { name: /1年01月01日 午时 · 初刻/ });
    const locBtn = grid.getByRole('button', { name: /当前地点：东江州 \/ 青溪镇 \/ 河埠街早市 \/ 老槐树下卦摊/ });
    const festBtn = grid.getByRole('button', { name: '节日：春节' });
    const journeyBtn = grid.getByRole('button', { name: '历程：第 1 天' });

    for (const [btn, regionName, expectedText] of [
        [weatherBtn, '天象变更', '预计结束：'],
        [envBtn, '周遭环境', '晨间薄雾笼罩街巷'],
        [locBtn, '当前地点', '东江州 / 青溪镇 / 河埠街早市 / 老槐树下卦摊'],
        [festBtn, '今日时节', '春节'],
        [journeyBtn, '行程历程', '第 1 天'],
    ]) {
        await btn.focus();
        await btn.press('Enter');
        await expect(btn).toHaveAttribute('aria-expanded', 'true');
        const region = page.getByRole('region', { name: regionName });
        await expect(region).toBeVisible();
        await expect(region).toContainText(expectedText);
        await page.keyboard.press('Escape');
        await expect(region).toBeHidden();
        await expect(btn).toBeFocused();
    }

    // Verify fullscreen trigger via keyboard Enter + click exit
    await dateBtn.focus();
    await dateBtn.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__moranFullscreenMock.requests)).toBe(1);
    await expect(dateBtn).toHaveAttribute('aria-pressed', 'true');
    await dateBtn.click();
    await expect.poll(() => page.evaluate(() => window.__moranFullscreenMock.exits)).toBe(1);
    await expect(dateBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to dark theme (ink) and verify ancestor readability & screenshot
    await switchThemeInSettings(page, 'ink', '墨色经典');
    await expect(grid).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/02-ink-1440-full.png`, animations: 'disabled' });

    const darkContrast = await page.evaluate(() => {
        const bg = getComputedStyle(document.querySelector('.desktop-game-topbar')).backgroundColor;
        const ancestor = getComputedStyle(document.querySelector('.topbar-loc-seg')).color;
        const current = getComputedStyle(document.querySelector('.topbar-loc-current')).color;
        const toRgb255 = (cssColor) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = cssColor;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b];
        };
        const lum = ([r, g, b]) => {
            const c = [r, g, b].map((v) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const ratio = (a, b) => {
            const la = lum(a);
            const lb = lum(b);
            return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
        };
        return {
            bg,
            ancestor,
            current,
            ancestorContrast: ratio(toRgb255(bg), toRgb255(ancestor)),
            currentContrast: ratio(toRgb255(bg), toRgb255(current)),
        };
    });
    expect(darkContrast.ancestorContrast).toBeGreaterThanOrEqual(4.5);
    expect(darkContrast.currentContrast).toBeGreaterThanOrEqual(10);

    // Switch to numeric time format and back
    await switchTimeFormatInSettings(page, '现代数字时钟');
    await expect(grid.locator('.topbar-time-text')).toHaveText('12:00');
    await switchTimeFormatInSettings(page, '传统天干地支');
    await expect(grid.locator('.topbar-time-text')).toHaveText('午时 · 初刻');
});

test('1440px 空态（无环境、无节日）：不出现「无」、无空印章与多余竖线，天气历程仍可用', async ({ page }) => {
    await loadTopbarGame(
        page,
        { width: 1440, height: 900 },
        {
            时间: '0001:01:04:15:48',
            环境变量: [],
        },
        'day'
    );

    const grid = page.locator('.desktop-topbar-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('.topbar-env-pill')).toHaveCount(0);
    await expect(grid.locator('.topbar-festival-seal')).toHaveCount(0);
    await expect(grid).not.toContainText('无');
    await expect(grid).not.toContainText('平常日');
    await expect(grid.locator('.topbar-time-text')).toHaveText('申时 · 三刻');
    await expect(grid.getByRole('button', { name: '历程：第 4 天' })).toBeVisible();

    await page.screenshot({ path: `${SHOT_DIR}/03-day-1440-empty.png`, animations: 'disabled' });

    await grid.getByRole('button', { name: '天气：晴' }).click();
    await expect(page.getByRole('region', { name: '天象变更' })).toBeVisible();
    await page.keyboard.press('Escape');

    await grid.getByRole('button', { name: '历程：第 4 天' }).click();
    await expect(page.getByRole('region', { name: '行程历程' })).toBeVisible();
    await page.keyboard.press('Escape');
});

test('1024px 窄桌面满态 + 超长地名 + 数字时间 + 同宽跨短屏高度重算 + 同名末级地名', async ({ page }) => {
    const longCurrent = '老槐树下算命测字卦摊';
    await loadTopbarGame(
        page,
        { width: 1024, height: 768 },
        {
            时间: '0001:01:01:12:00',
            天气: { 天气: '阴雨', 结束日期: '0001:01:02:12:00' },
            环境变量: [{ 名称: '寒潮', 描述: '冷风刺骨，街巷湿寒。', 效果: '体温下降加快' }],
            大地点: '江南东道扬州府宣抚司',
            中地点: '青溪古镇西市青石坊',
            小地点: '河埠街早市临水茶寮巷',
            具体地点: longCurrent,
        },
        'ink'
    );
    await switchTimeFormatInSettings(page, '现代数字时钟');

    const grid = page.locator('.desktop-topbar-grid');
    const locBtn = grid.locator('.topbar-location-btn');
    await expect(grid.locator('.topbar-time-text')).toHaveText('12:00');
    await expect(locBtn).toHaveAttribute('data-collapse-level', '1');
    await expect(locBtn.locator('.topbar-loc-ellipsis')).toBeVisible();
    await expect(locBtn).toContainText('江南东道扬州府宣抚司');
    await expect(locBtn).not.toContainText('青溪古镇西市青石坊');
    await expect(locBtn).toContainText('河埠街早市临水茶寮巷');
    await expect(locBtn.locator('.topbar-loc-current')).toHaveText(longCurrent);

    const metrics768 = await measureTopbarBounds(page);
    expect(metrics768.overflowX).toBeLessThanOrEqual(1);
    expect(Math.round(metrics768.topbar.height)).toBe(48);
    expect(metrics768.topbar.bottom).toBeLessThanOrEqual(metrics768.main.top + 1);
    expect(metrics768.left.right).toBeLessThanOrEqual(metrics768.center.left + 1);
    expect(metrics768.center.right).toBeLessThanOrEqual(metrics768.right.left + 1);
    expect(metrics768.currentVisibleWithinButton).toBe(true);
    expect(metrics768.weatherFits).toBe(true);
    expect(metrics768.envFits).toBe(true);
    expect(metrics768.festFits).toBe(true);

    await page.screenshot({ path: `${SHOT_DIR}/04-ink-1024-narrow-longpath.png`, animations: 'disabled' });

    // Same 1024 width, resize across 800px short-screen threshold (768 -> 900 -> 768)
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect.poll(async () => Math.round((await measureTopbarBounds(page)).topbar.height)).toBe(58);
    const metrics900 = await measureTopbarBounds(page);
    expect(metrics900.currentVisibleWithinButton).toBe(true);
    expect(metrics900.left.right).toBeLessThanOrEqual(metrics900.center.left + 1);
    expect(metrics900.center.right).toBeLessThanOrEqual(metrics900.right.left + 1);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => Math.round((await measureTopbarBounds(page)).topbar.height)).toBe(48);
    const metricsBack = await measureTopbarBounds(page);
    expect(metricsBack.currentVisibleWithinButton).toBe(true);

    // Open full location hierarchy via keyboard and capture screenshot
    await locBtn.focus();
    await locBtn.press('Enter');
    const locCard = page.getByRole('region', { name: '当前地点' });
    await expect(locCard).toBeVisible();
    await expect(locCard).toContainText('江南东道扬州府宣抚司');
    await expect(locCard).toContainText('青溪古镇西市青石坊');
    await expect(locCard).toContainText('河埠街早市临水茶寮巷');
    await expect(locCard).toContainText(longCurrent);

    await page.screenshot({ path: `${SHOT_DIR}/05-ink-1024-location-popover.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(locCard).toBeHidden();
    await expect(locBtn).toBeFocused();
});

test('1440px 鼠标悬停与点击固定、焦点不抢夺、大面板焦点管理', async ({ page }) => {
    await loadTopbarGame(page, { width: 1440, height: 900 }, {}, 'day');
    const grid = page.locator('.desktop-topbar-grid');
    const weatherBtn = grid.getByRole('button', { name: '天气：晴' });
    const journeyBtn = grid.getByRole('button', { name: '历程：第 1 天' });
    const locBtn = grid.locator('.topbar-location-btn');
    const draft = page.locator('.action-input textarea:visible');

    // Focus external textarea, hover weather -> Escape closes card WITHOUT stealing focus
    await draft.focus();
    await expect(draft).toBeFocused();
    await weatherBtn.hover();
    const weatherCard = page.getByRole('region', { name: '天象变更' });
    await expect(weatherCard).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(weatherCard).toBeHidden();
    await expect(draft).toBeFocused();

    // Move pointer away first so a fresh mouseenter triggers, then hover -> move into card -> stays visible
    await draft.hover();
    await weatherBtn.hover();
    await expect(weatherCard).toBeVisible();
    await weatherCard.hover();
    await page.waitForTimeout(220);
    await expect(weatherCard).toBeVisible();

    await weatherBtn.click();
    await journeyBtn.hover();
    await page.waitForTimeout(220);
    await expect(weatherCard).toBeVisible();
    await draft.click();
    await expect(weatherCard).toBeHidden();

    // Open location detail card -> expand fullscreen dialog -> focus enters dialog & Tab trapped -> Escape restores trigger focus
    await locBtn.focus();
    await locBtn.press('Enter');
    const locCard = page.getByRole('region', { name: '当前地点' });
    await expect(locCard).toBeVisible();
    await locCard.getByRole('button', { name: '展开详情' }).click();

    const dialog = page.getByRole('dialog', { name: '当前地点' });
    const collapseBtn = dialog.getByRole('button', { name: '收起' });
    const detailScroller = dialog.getByLabel('当前地点内容');
    await expect(dialog).toBeVisible();
    await expect(collapseBtn).toBeFocused();
    // Tab 循环现在包含内容滚动区（长描述可用键盘滚动），不再是只困住收起按钮
    await page.keyboard.press('Tab');
    await expect(detailScroller).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(collapseBtn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(detailScroller).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(locBtn).toBeFocused();
});

test('390×844 移动端空态与满态均走原移动布局，环境/节日/地点详情正常', async ({ page }) => {
    await loadTopbarGame(
        page,
        { width: 390, height: 844 },
        {
            时间: '0001:01:04:15:48',
            环境变量: [],
        },
        'ink'
    );

    await expect(page.locator('.desktop-topbar-grid')).toBeHidden();
    await expect(page.getByRole('button', { name: '收起顶部信息栏' })).toBeVisible();

    // Empty environment detail stays visible and closes cleanly
    await page.getByRole('button', { name: '环境', exact: true }).click();
    const envCard = page.getByRole('region', { name: '周遭环境' });
    await expect(envCard).toBeVisible();
    await expect(envCard).toContainText('风平浪静，并无特殊环境。');
    await envCard.getByRole('button', { name: '关闭详情' }).click();
    await expect(envCard).toBeHidden();
    // Respect existing 300ms mobile ghost-tap dismiss guard
    await page.waitForTimeout(350);

    // Empty festival (平常日) detail stays visible and closes cleanly
    await page.getByRole('button', { name: '节日', exact: true }).click();
    const festCard = page.getByRole('region', { name: '今日时节' });
    await expect(festCard).toBeVisible();
    await expect(festCard).toContainText('平常日');
    await festCard.getByRole('button', { name: '关闭详情' }).click();
    await expect(festCard).toBeHidden();
    await page.waitForTimeout(350);

    // Mobile location card matches baseline (no desktop-only path summary block)
    await page.getByRole('button', { name: '地点', exact: true }).click();
    const locCard = page.getByRole('region', { name: '当前地点' });
    await expect(locCard).toBeVisible();
    await expect(locCard.locator('.desktop-topbar-card-summary')).toHaveCount(0);
    await expect(locCard).toContainText('大地点：东江州');
});
