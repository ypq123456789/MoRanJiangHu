import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const baseSave = JSON.parse(readFileSync('e2e/fixtures/desktop-compact-save.json', 'utf8'));

const compactOptions = [
    '上前询问掌柜昨夜城中异象的来龙去脉',
    '暂不声张，先观察四周是否有可疑人物',
    '取出地图，对照当前地点规划下一段行程',
    '邀请杨青儿同行前往城西旧宅探查',
    '检查随身物品，确认药品与兵器是否齐备',
    '向附近住客打听最近失踪人口的消息',
    '返回房间整理线索并记录关键人物关系',
    '前往集市购买干粮与夜间照明用的火折子',
    '拜访城中镖局，询问是否接到异常委托',
    '沿河岸搜索可能遗留的脚印与衣物碎片',
    '在客栈大厅等待，观察谁会主动前来接触',
    '写信通知旧友，请他协助调查城外山道',
    '先休息片刻，恢复精力后再继续行动',
    '直接前往衙门，将掌握的线索告知捕头',
    '隐去身份独自夜探，不让其他人卷入危险',
    '重新梳理时间线，寻找证词之间的矛盾之处',
    '去药铺询问近期是否有人大量购买迷药',
    '留在原地继续修炼，等待新的江湖消息',
];

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

const makeCompactLayoutSave = (options, character) => {
    const save = structuredClone(baseSave);
    Object.assign(save.角色数据, {
        姓名: '沈砚', 称号: '江湖散人', 当前精力: 64, 当前内力: 24,
        当前饱腹: 65, 最大饱腹: 100, 当前口渴: 72, 最大口渴: 100,
        当前经验: 38, 升级经验: 100, 金钱: { 金元宝: 1, 银子: 20, 铜钱: 300 },
    });
    for (const part of ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿']) {
        save.角色数据[part + '当前血量'] = 18;
        save.角色数据[part + '最大血量'] = 20;
    }
    Object.assign(save.角色数据, character);
    save.id = 13660768;
    save.类型 = 'manual';
    save.时间戳 = 1785250000000;
    save.元数据 = {
        ...(save.元数据 || {}),
        名称: '1366短屏适配验证',
        现实保存时间戳: 1785250000000,
        历史记录条数: 2,
        历史记录是否裁剪: false,
    };
    save.历史记录 = [
        { role: 'user', content: '检查短屏布局。' },
        {
            role: 'assistant',
            content: 'Structured Response',
            structuredResponse: {
                logs: [
                    {
                        sender: '旁白',
                        text: '暮色落在客栈檐角，厅中人声渐低。你将沿途所得线索逐一铺开，准备决定下一步行动。',
                    },
                ],
                shortTerm: '正在客栈整理调查线索。',
                action_options: options,
            },
        },
    ];
    return save;
};

const injectSaveAndReload = async (page, targetUrl, options, character) => {
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);
    await page.evaluate(async (payload) => {
        const request = indexedDB.open('WuxiaGameDB');
        const db = await new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(['saves', 'save_summaries'], 'readwrite');
            transaction.objectStore('saves').clear();
            transaction.objectStore('save_summaries').clear();
            transaction.objectStore('saves').put(payload);
            transaction.objectStore('save_summaries').put({
                id: payload.id,
                类型: payload.类型,
                时间戳: payload.时间戳,
                元数据: payload.元数据,
                游戏初始时间: payload.游戏初始时间,
                角色数据: payload.角色数据,
                环境信息: payload.环境信息,
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }, makeCompactLayoutSave(options, character));
    await page.reload({ waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);
};

const loadCompactGame = async (page, viewport, options = compactOptions, character = {}) => {
    test.setTimeout(60000);
    const targetUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
    });

    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(targetUrl).origin || url.pathname.startsWith('/api/')) return route.abort();
        return route.continue();
    });
    await injectSaveAndReload(page, targetUrl, options, character);
    await expect.poll(() => clickByTexts(page, ['本地游玩'])).toBe(true);
    await expect.poll(() => clickByTexts(page, ['重入江湖', '读取进度', '继续游戏', '读取', '载入'])).toBe(true);

    await page.getByRole('button', { name: /沈砚.*查看时间树/ }).click();
    await page.getByRole('button', { name: '读取最新存档' }).click();
    await page.getByRole('button', { name: '读取', exact: true }).last().click();
    await expect(page.locator('.desktop-quick-actions')).toBeVisible({ timeout: 10000 });
};

test('1366×768 桌面端保持正文、选项和菜单均可用', async ({ page }) => {
    await loadCompactGame(page, { width: 1366, height: 768 });

    const quickActions = page.locator('.desktop-quick-actions');
    const rightMenu = page.locator('.right-panel-menu-scroll');
    const systemActions = page.locator('.right-panel-system-actions');
    const bottomTicker = page.locator('.desktop-game-bottom-ticker');

    await expect(quickActions).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.desktop-quick-action-button')).toHaveCount(compactOptions.length);
    await expect(systemActions).toBeVisible();
    await expect(bottomTicker).toBeVisible();
    await expect(page.locator('.app-play-mode-badge')).toBeHidden();
    await expect(page.locator('.app-main-model-badge')).toBeHidden();

    const layout = await page.evaluate(() => {
        const quick = document.querySelector('.desktop-quick-actions');
        const menu = document.querySelector('.right-panel-menu-scroll');
        const system = document.querySelector('.right-panel-system-actions');
        const topbar = document.querySelector('.desktop-game-topbar');
        const ticker = document.querySelector('.desktop-game-bottom-ticker');
        const firstOption = document.querySelector('.desktop-quick-action-button');
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const rootStyle = getComputedStyle(document.documentElement);
        const quickStyle = quick ? getComputedStyle(quick) : null;
        const firstOptionStyle = firstOption ? getComputedStyle(firstOption) : null;
        const rect = (element) => element?.getBoundingClientRect();
        return {
            viewport,
            bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
            desktopGameTop: rootStyle.getPropertyValue('--desktop-game-top').trim(),
            desktopGameBottom: rootStyle.getPropertyValue('--desktop-game-bottom').trim(),
            quick: {
                clientHeight: quick?.clientHeight || 0,
                scrollHeight: quick?.scrollHeight || 0,
                overflowY: quickStyle?.overflowY || '',
                maxHeight: quickStyle?.maxHeight || '',
                touchAction: quickStyle?.touchAction || '',
                rect: rect(quick),
            },
            firstOptionStyle: {
                color: firstOptionStyle?.color || '',
                backgroundColor: firstOptionStyle?.backgroundColor || '',
                fontSize: firstOptionStyle?.fontSize || '',
                lineHeight: firstOptionStyle?.lineHeight || '',
                whiteSpace: firstOptionStyle?.whiteSpace || '',
            },
            menu: {
                overflowY: menu ? getComputedStyle(menu).overflowY : '',
                rect: rect(menu),
            },
            systemRect: rect(system),
            topbarRect: rect(topbar),
            tickerRect: rect(ticker),
            firstOptionRect: rect(firstOption),
        };
    });

    expect(layout.bodyOverflowX).toBeLessThanOrEqual(1);
    expect(layout.desktopGameTop).toBe('60px');
    expect(layout.desktopGameBottom).toBe('46px');
    expect(layout.quick.overflowY).toBe('auto');
    expect(layout.quick.maxHeight).not.toBe('none');
    expect(layout.quick.touchAction).toBe('pan-y');
    expect(layout.quick.clientHeight).toBeLessThanOrEqual(128);
    expect(layout.quick.scrollHeight).toBeGreaterThan(layout.quick.clientHeight);
    expect(layout.firstOptionStyle.fontSize).toBe('13px');
    expect(layout.firstOptionStyle.whiteSpace).toBe('normal');
    expect(layout.menu.overflowY).toBe('auto');
    expect(layout.topbarRect.height).toBe(48);
    expect(layout.tickerRect.height).toBe(30);
    expect(layout.firstOptionRect.top).toBeGreaterThanOrEqual(layout.topbarRect.bottom);
    expect(layout.systemRect.bottom).toBeLessThanOrEqual(layout.tickerRect.top + 1);
    expect(layout.systemRect.top).toBeGreaterThan(layout.menu.rect.top);

    await quickActions.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => quickActions.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.screenshot({
        path: 'output/playwright/desktop-1366-compact-layout.png',
        fullPage: false,
    });
});

test('1366×900 常规桌面端应用基线选项约束（非短屏压缩）', async ({ page }) => {
    await loadCompactGame(page, { width: 1366, height: 900 });

    const quickActions = page.locator('.desktop-quick-actions');
    await expect(quickActions).toBeVisible();

    const layout = await page.evaluate(() => {
        const quick = document.querySelector('.desktop-quick-actions');
        const topbar = document.querySelector('.desktop-game-topbar');
        const ticker = document.querySelector('.desktop-game-bottom-ticker');
        const playModeBadge = document.querySelector('.app-play-mode-badge');
        const firstOption = document.querySelector('.desktop-quick-action-button');
        const rootStyle = getComputedStyle(document.documentElement);
        const quickStyle = quick ? getComputedStyle(quick) : null;
        const firstOptionStyle = firstOption ? getComputedStyle(firstOption) : null;
        return {
            bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
            desktopGameTop: rootStyle.getPropertyValue('--desktop-game-top').trim(),
            desktopGameBottom: rootStyle.getPropertyValue('--desktop-game-bottom').trim(),
            quickMaxHeight: quickStyle?.maxHeight || '',
            quickOverflowY: quickStyle?.overflowY || '',
            quickTouchAction: quickStyle?.touchAction || '',
            quickClientHeight: quick?.clientHeight || 0,
            quickScrollHeight: quick?.scrollHeight || 0,
            topbarHeight: topbar?.getBoundingClientRect().height || 0,
            tickerHeight: ticker?.getBoundingClientRect().height || 0,
            playModeDisplay: playModeBadge ? getComputedStyle(playModeBadge).display : '',
            firstOptionWhiteSpace: firstOptionStyle?.whiteSpace || '',
            firstOptionMaxWidth: firstOptionStyle?.maxWidth || '',
        };
    });

    expect(layout.bodyOverflowX).toBeLessThanOrEqual(1);
    // 1366×900 不在 <800px 短屏范围内，使用默认的 top/bottom CSS 变量
    expect(layout.desktopGameTop).toBe('75px');
    expect(layout.desktopGameBottom).toBe('57px');

    // 基线规则应对所有 ≥768px 生效：有 max-height、overflow-y:auto、pan-y
    expect(layout.quickMaxHeight).not.toBe('none');
    expect(layout.quickMaxHeight).toMatch(/220px|30vh/);
    expect(layout.quickOverflowY).toBe('auto');
    expect(layout.quickTouchAction).toBe('pan-y');

    // 18 条选项应超出基线 max-height，触发滚动
    expect(layout.quickScrollHeight).toBeGreaterThan(layout.quickClientHeight);

    // 非短屏：badge 可见，topbar/ticker 用常规尺寸
    expect(layout.topbarHeight).toBe(58);
    expect(layout.tickerHeight).toBe(37);
    expect(layout.playModeDisplay).not.toBe('none');

    // 按钮文本应可换行，且有合理最大宽度
    expect(layout.firstOptionWhiteSpace).toBe('normal');
    expect(layout.firstOptionMaxWidth).not.toBe('none');
});

test('1920×1080 全高清桌面端选项区域不侵占正文', async ({ page }) => {
    await loadCompactGame(page, { width: 1920, height: 1080 });

    const quickActions = page.locator('.desktop-quick-actions');
    await expect(quickActions).toBeVisible();
    await expect(page.locator('.desktop-quick-action-button')).toHaveCount(compactOptions.length);

    const layout = await page.evaluate(() => {
        const quick = document.querySelector('.desktop-quick-actions');
        const gameMain = document.querySelector('.desktop-game-main');
        const topbar = document.querySelector('.desktop-game-topbar');
        const ticker = document.querySelector('.desktop-game-bottom-ticker');
        const firstOption = document.querySelector('.desktop-quick-action-button');
        const quickStyle = quick ? getComputedStyle(quick) : null;
        const firstOptionStyle = firstOption ? getComputedStyle(firstOption) : null;
        const rect = (el) => el?.getBoundingClientRect();
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
            quick: {
                clientHeight: quick?.clientHeight || 0,
                scrollHeight: quick?.scrollHeight || 0,
                maxHeight: quickStyle?.maxHeight || '',
                overflowY: quickStyle?.overflowY || '',
                rect: rect(quick),
            },
            gameMainRect: rect(gameMain),
            topbarRect: rect(topbar),
            tickerRect: rect(ticker),
            firstOptionStyle: {
                whiteSpace: firstOptionStyle?.whiteSpace || '',
                maxWidth: firstOptionStyle?.maxWidth || '',
                fontSize: firstOptionStyle?.fontSize || '',
            },
        };
    });

    // 无横向溢出
    expect(layout.bodyOverflowX).toBeLessThanOrEqual(1);

    // 基线约束生效：max-height 存在、overflow-y auto
    expect(layout.quick.maxHeight).not.toBe('none');
    expect(layout.quick.overflowY).toBe('auto');

    // 选项区域高度不应超过视口的 ~35%（30vh + padding）
    const maxAllowedQuickHeight = Math.ceil(layout.viewport.height * 0.35);
    expect(layout.quick.clientHeight).toBeLessThanOrEqual(maxAllowedQuickHeight);

    // 18 条长选项必须超出容器高度（触发滚动）
    expect(layout.quick.scrollHeight).toBeGreaterThan(layout.quick.clientHeight);

    // 按钮文本换行 + 合理宽度约束
    expect(layout.firstOptionStyle.whiteSpace).toBe('normal');
    expect(layout.firstOptionStyle.maxWidth).not.toBe('none');

    // 选项区域必须在顶栏之下、底栏之上
    expect(layout.quick.rect.top).toBeGreaterThanOrEqual(layout.topbarRect.bottom);
    expect(layout.quick.rect.bottom).toBeLessThanOrEqual(layout.tickerRect.top + 1);

    // 滚动功能验证
    await quickActions.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => quickActions.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.screenshot({
        path: 'output/playwright/desktop-1920x1080-options-layout.png',
        fullPage: false,
    });
});

test('390×844 移动端继续使用横向行动选项且无页面横向溢出', async ({ page }) => {
    await loadCompactGame(page, { width: 390, height: 844 });

    const layout = await page.evaluate(() => {
        const quick = document.querySelector('.desktop-quick-actions');
        const topbar = document.querySelector('.desktop-game-topbar');
        const ticker = document.querySelector('.desktop-game-bottom-ticker');
        const quickStyle = quick ? getComputedStyle(quick) : null;
        return {
            bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
            quickClientWidth: quick?.clientWidth || 0,
            quickScrollWidth: quick?.scrollWidth || 0,
            quickOverflowX: quickStyle?.overflowX || '',
            quickOverflowY: quickStyle?.overflowY || '',
            quickTouchAction: quickStyle?.touchAction || '',
            quickMaxHeight: quickStyle?.maxHeight || '',
            topbarHeight: topbar?.getBoundingClientRect().height || 0,
            tickerDisplay: ticker ? getComputedStyle(ticker).display : '',
        };
    });

    expect(layout.bodyOverflowX).toBeLessThanOrEqual(1);
    expect(layout.quickOverflowX).toBe('auto');
    expect(layout.quickTouchAction).toBe('pan-x');
    expect(layout.quickMaxHeight).toBe('none');
    expect(layout.quickScrollWidth).toBeGreaterThan(layout.quickClientWidth);
    await expect(page.getByText(/对上一回合的「主剧情」/).first()).toBeVisible();
    await expect(page.locator('.action-reroll-help')).toBeHidden();
    expect(layout.topbarHeight).not.toBe(48);
    expect(layout.tickerDisplay).toBe('none');
});

test('桌面角色详情、行动草稿和三种主题', async ({ page }, testInfo) => {
    const options = [...compactOptions.slice(0, 3), compactOptions.slice(3, 9).join('，')];
    const sword = '青竹书院旧藏松风细纹长剑';
    await loadCompactGame(page, { width: 1400, height: 889 }, options, {
        头部当前血量: 18, 头部状态: '正常', 腹部当前血量: 20, 右手当前血量: 20, 左腿当前血量: 20,
        胸部当前血量: 36, 胸部最大血量: 45, 左手当前血量: 5, 右腿当前血量: 14,
        装备: { 主武器: 'journal-sword', 胸部: '青布行衫', 腰部: 'journal-jade' },
        物品列表: [
            { ID: 'journal-sword', 名称: sword, 类型: '武器' },
            { ID: 'journal-jade', 名称: '双鱼玉佩', 类型: '饰品' },
            { ID: 'journal-coat', 名称: '青布行衫', 类型: '防具' },
        ],
    });
    const panel = page.locator('.left-panel-body');
    const journal = panel.getByRole('region', { name: '江湖手记' });
    const body = journal.getByRole('button', { name: '身躯' });
    const outfit = journal.getByRole('button', { name: '行头' });
    const close = journal.getByRole('button', { name: '收起' });
    for (const control of [body, outfit]) await expect(control).toHaveAttribute('aria-expanded', 'false');
    const rates = panel.getByRole('button', { name: '换算' });
    const rateText = panel.locator('p').filter({ hasText: '=' });
    await expect(rateText).toBeHidden();
    await rates.press('Enter');
    await expect(rateText).toBeVisible();
    await rates.press('Space');
    await expect(rateText).toBeHidden();

    const help = page.locator('.action-reroll-help');
    const hint = help.getByText(/对上一回合的「主剧情」/);
    await expect(hint).toBeHidden();
    await help.locator('summary').click();
    await expect(hint).toBeVisible();
    await help.locator('summary').click();
    await expect(hint).toBeHidden();

    const suggestions = page.locator('.desktop-quick-action-button');
    const draft = page.locator('.action-input textarea:visible');
    await expect(page.getByRole('heading', { name: '行动建议' })).toBeVisible();
    await expect(suggestions).toHaveCount(4);
    const [first, second, third] = await Promise.all([0, 1, 2].map(i => suggestions.nth(i).boundingBox()));
    expect(second.y).toBe(first.y);
    expect(third.x).toBe(first.x);
    expect(third.y).toBeGreaterThan(first.y);
    const longOption = suggestions.last();
    expect((await longOption.boundingBox()).height).toBeGreaterThan(first.height);
    const number = longOption.locator('[aria-hidden="true"]');
    expect((await number.boundingBox()).height).toBeLessThan(20);
    await draft.fill('第一行');
    await draft.press('Shift+Enter');
    await draft.pressSequentially('2');
    await expect(draft).toHaveValue('第一行\n2');
    await draft.fill('起身');
    await suggestions.first().click();
    await expect(draft).toHaveValue('起身；' + options[0]);
    await draft.fill('起身。');
    await suggestions.last().click();
    await expect(draft).toHaveValue('起身。 ' + options[3]);
    const send = page.getByTitle('发送', { exact: true });
    await expect(send).toBeEnabled();
    const draftBox = await draft.boundingBox();
    const sendBox = await send.boundingBox();
    const toolsBox = await page.locator('.action-tools').boundingBox();
    expect(sendBox.x).toBeGreaterThan(draftBox.x + draftBox.width);
    expect(toolsBox.y).toBeGreaterThanOrEqual(sendBox.y + sendBox.height);
    await draft.fill('');

    for (const [theme, name] of [['ink', '墨色经典'], ['day', '白昼清卷'], ['azure', '青鸾入梦']]) {
        await page.getByRole('button', { name: '江湖设置' }).click();
        const themeTab = page.getByRole('button', { name: '界面风格', exact: true });
        if (!await themeTab.isVisible()) await page.getByRole('button', { name: /界面与声音/ }).click();
        await themeTab.click();
        await page.getByRole('button', { name: new RegExp(name) }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.getByRole('button', { name: '关闭设置' }).click();
        await expect(send).toBeVisible();
        await expect(suggestions.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await body.click();
        await expect(journal.locator('.journal-wound')).toHaveCount(3);
        const readings = journal.locator('dl:visible dd');
        await expect(readings).toHaveText(['36 / 45', '5 / 20', '14 / 20']);
        await page.screenshot({ path: testInfo.outputPath(theme + '-injuries-1400x889.png'), animations: 'disabled' });
        const allParts = journal.getByText('全部部位', { exact: true });
        await allParts.press('Enter');
        await expect(journal.locator('details[open] dt')).toHaveCount(7);
        const headReading = journal.locator('details[open] dl > div').filter({ has: page.locator('dt', { hasText: '头部正常' }) });
        await expect(headReading.locator('dd')).toHaveText('18 / 20');
        await outfit.click();
        await expect(body).toHaveAttribute('aria-expanded', 'false');
        await expect(journal.getByRole('img')).toHaveCount(0);
        await expect(journal.locator('dl:visible dd')).toHaveText(['青布行衫', sword, '双鱼玉佩']);
        const swordName = journal.locator('.journal-outfit dd').filter({ hasText: sword });
        const fits = await swordName.evaluate(el => ({
            clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
            wrapped: el.clientHeight > parseFloat(getComputedStyle(el).lineHeight) * 1.5,
        }));
        expect(fits).toEqual({ clipped: false, wrapped: true });
        await page.screenshot({ path: testInfo.outputPath(theme + '-outfit-1400x889.png'), animations: 'disabled' });
        await journal.getByText('全部装备位').press('Enter');
        await expect(journal.locator('details[open] dt')).toHaveCount(13);
        await expect(journal.getByText('空位', { exact: true })).toHaveCount(10);
        await close.press('Space');
        await expect(outfit).toBeFocused();
        await expect(outfit).toHaveAttribute('aria-expanded', 'false');
        await expect(journal.locator('dl')).toHaveCount(0);
    }
});

for (const width of [767, 768, 815]) {
    test(`独立初始视口 ${width}px 的行动区分界`, async ({ page }) => {
        await loadCompactGame(page, { width, height: 889 });
        const desktop = width >= 768;
        await expect(page.locator('.left-panel-body')).toBeVisible({ visible: desktop });
        await expect(page.locator('h3').filter({ hasText: '行动建议' })).toBeVisible({ visible: desktop });
        const list = page.locator('.desktop-quick-actions-list');
        await expect(list).toHaveCSS('display', desktop ? 'grid' : 'flex');
        await expect(page.locator('.desktop-quick-actions')).toHaveCSS('touch-action', desktop ? 'pan-y' : 'pan-x');
    });
}

test('短屏手记在侧栏内滚动，空装备仍能查看所有槽位', async ({ page }) => {
    await loadCompactGame(page, { width: 1000, height: 600 }, compactOptions, { 装备: {}, 物品列表: [] });
    const panel = page.locator('.left-panel-body');
    const journal = panel.getByRole('region', { name: '江湖手记' });
    await journal.getByRole('button', { name: '身躯' }).press('Enter');
    await journal.getByText('全部部位').click();
    await expect(journal.locator('details[open] dt')).toHaveCount(7);
    await journal.getByRole('button', { name: '行头' }).click();
    await expect(journal.getByText('暂无穿戴')).toBeVisible();
    await journal.getByText('全部装备位').click();
    await expect(journal.getByText('空位', { exact: true })).toHaveCount(13);
    const variable = panel.getByRole('button', { name: '变量管理' });
    await variable.scrollIntoViewIfNeeded();
    await expect(variable).toBeInViewport();
    const geometry = await panel.evaluate(el => ({
        scrolled: el.scrollTop,
        horizontal: el.scrollWidth - el.clientWidth,
        pageWidth: document.documentElement.scrollWidth - innerWidth,
        pageHeight: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(geometry.scrolled).toBeGreaterThan(0);
    expect(geometry.horizontal).toBeLessThanOrEqual(1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(1);
    expect(geometry.pageHeight).toBeLessThanOrEqual(1);
});

test('桌面自设头像的完整预览、键盘和换图', async ({ page }, testInfo) => {
    const name = '沈砚归舟听雨望江南';
    await loadCompactGame(page, { width: 1400, height: 620 }, compactOptions, {
        姓名: name, 称号: '江上行舟人', 头像图片URL: '/synthetic-missing-avatar.png',
    });
    const panel = page.locator('.left-panel-body');
    const header = panel.locator('header');
    const placeholder = header.getByRole('button', { name: '上传角色头像' });
    await expect(placeholder).toHaveText('沈');
    await expect.poll(() => header.locator('img').evaluate(el => el.complete && el.naturalWidth === 0)).toBe(true);
    expect((await placeholder.boundingBox()).width).toBeLessThan(64);
    await header.screenshot({ path: testInfo.outputPath('placeholder.png') });
    const choose = async (button, files) => {
        const pending = page.waitForEvent('filechooser');
        await button.press('Enter');
        await (await pending).setFiles(files);
    };
    await choose(placeholder, []);
    await expect(placeholder).toBeVisible();

    // Draw two local PNGs. The sun and distant shore sit outside the round thumbnail.
    const makeImage = async (width, height, sky) => {
        const png = await page.evaluate(({ width, height, sky }) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.scale(width / 480, height / 270);
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, 480, 270);
            ctx.fillStyle = '#c76146';
            ctx.beginPath(); ctx.arc(55, 65, 22, 0, 2 * Math.PI); ctx.fill();
            const ridge = (color, points) => {
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.moveTo(0, 270);
                for (const [x, y] of points) ctx.lineTo(x, y);
                ctx.lineTo(480, 270); ctx.closePath(); ctx.fill();
            };
            ridge('#93aaa0', [[0, 174], [76, 137], [115, 150], [200, 81], [227, 98], [260, 72], [360, 146], [435, 108], [480, 126]]);
            ridge('#476861', [[0, 190], [100, 166], [147, 171], [249, 119], [330, 166], [396, 134], [480, 170]]);
            ctx.fillStyle = '#bbe0d7'; ctx.fillRect(0, 191, 480, 79);
            ridge('#284a46', [[0, 267], [166, 260], [285, 237], [372, 203], [421, 196], [480, 183]]);
            return canvas.toDataURL('image/png').split(',')[1];
        }, { width, height, sky });
        return { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
    };
    await choose(placeholder, await makeImage(480, 270, '#f3e4bf'));
    const thumb = header.getByRole('button', { name: '查看完整头像' });
    await expect(thumb).toHaveCSS('width', '64px');
    await expect(thumb).toHaveCSS('height', '64px');
    await expect(thumb.locator('img')).toHaveCSS('object-fit', 'cover');
    expect(await thumb.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(32);
    const nameButton = header.getByRole('button', { name, exact: true });
    const thumbBox = await thumb.boundingBox();
    expect((await nameButton.boundingBox()).x).toBeGreaterThanOrEqual(thumbBox.x + thumbBox.width);
    expect(await nameButton.evaluate(el => el.offsetHeight > parseFloat(getComputedStyle(el).lineHeight))).toBe(true);
    await header.screenshot({ path: testInfo.outputPath('thumbnail.png') });

    await thumb.press('Enter');
    const preview = page.getByRole('dialog', { name: '角色头像预览' });
    const close = preview.getByRole('button', { name: '关闭' });
    const replace = preview.getByRole('button', { name: '更换头像' });
    await expect(close).toBeFocused();
    expect(await preview.evaluate(el => el.matches(':modal'))).toBe(true);
    const image = preview.getByRole('img');
    await expect(image).toHaveCSS('object-fit', 'contain');
    await expect(image).toHaveCSS('border-radius', '0px');
    expect(await image.evaluate(el => [el.naturalWidth, el.naturalHeight])).toEqual([480, 270]);
    const box = await image.boundingBox();
    expect(box.width / box.height).toBeCloseTo(480 / 270, 2);
    await preview.screenshot({ path: testInfo.outputPath('preview.png') });
    await close.press('Tab');
    await expect(replace).toBeFocused();
    await choose(replace, []);
    await expect(preview).toBeVisible();
    expect(await image.evaluate(el => el.naturalWidth)).toBe(480);
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(thumb).toBeFocused();
    await thumb.press('Space');
    await choose(replace, await makeImage(150, 300, '#d9e1ec'));
    await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(150);
    await close.click();
    await expect(thumb).toBeFocused();
    await expect(preview).toBeHidden();
    await page.setViewportSize({ width: 816, height: 480 });
    await thumb.press('Enter');
    await expect(close).toBeInViewport({ ratio: 1 });
    await expect(replace).toBeInViewport({ ratio: 1 });
    await close.press('Escape');
    expect(await panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
});
