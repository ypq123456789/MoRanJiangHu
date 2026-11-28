import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 「角色对话」场外私聊面板端到端验证（v1.0.670）：
//  1. 场外对话随存档落库与读档恢复；
//  2. 面板只显示当前所选 NPC 的暂存（不同角色之间不串话）；
//  3. 未配置独立模型时只给引导、禁止发送（不回退主剧情模型）；
//  4. 日间模式下新面板文字可读。
// 不依赖任何外部 AI 服务。

const baseSave = JSON.parse(readFileSync('e2e/fixtures/desktop-compact-save.json', 'utf8'));

const NPCA = {
    id: 'npc-role-a',
    姓名: '沈听澜',
    性别: '女',
    年龄: 19,
    身份: '受伤剑修',
    是否主要角色: true,
    是否在场: true,
    好感度: 15,
    核心性格特征: '清冷孤傲',
    外貌描写: '苍白清瘦',
    记忆: [{ 内容: '说过很喜欢竹笛', 时间: '1年01月01日:午时' }]
};
const NPCB = {
    id: 'npc-role-b',
    姓名: '老李',
    性别: '男',
    身份: '药铺掌柜',
    是否主要角色: false,
    是否在场: true,
    好感度: 5,
    核心性格特征: '市侩',
    记忆: []
};
const NPCC = {
    id: 'npc-role-c',
    姓名: '离场客',
    性别: '男',
    是否主要角色: false,
    是否在场: false,
    好感度: 0,
    记忆: []
};

// 甲、乙 各两条暂存，用来验证「换人后不串话」。
const 场外对话 = [
    { npcId: 'npc-role-a', role: 'player', 发言人: '测试侠客', 内容: '甲线：那笛子还留着吗？', 时间: 1785250000001 },
    { npcId: 'npc-role-a', role: 'npc', 发言人: '沈听澜', 内容: '甲线：沈家旧物，不曾丢。', 时间: 1785250000002 },
    { npcId: 'npc-role-b', role: 'player', 发言人: '测试侠客', 内容: '乙线：生地黄还有货吗？', 时间: 1785250000003 },
    { npcId: 'npc-role-b', role: 'npc', 发言人: '老李', 内容: '乙线：后厨柴堆下堆着两捆。', 时间: 1785250000004 }
];

const makeRoleChatSave = () => {
    const save = structuredClone(baseSave);
    save.id = 13660770;
    save.类型 = 'manual';
    save.时间戳 = 1785250000000;
    save.元数据 = {
        ...(save.元数据 || {}),
        名称: '角色对话面板验证',
        现实保存时间戳: 1785250000000,
        历史记录条数: 2
    };
    save.社交 = [NPCA, NPCB, NPCC];
    save.场外对话 = 场外对话;
    save.历史记录 = [
        { role: 'user', content: '我把那半坛酒埋在城西旧宅的槐树下。' },
        {
            role: 'assistant',
            content: 'Structured Response',
            structuredResponse: {
                logs: [{ sender: '旁白', text: '沈听澜倚在窗边，苍白的指节扣着竹笛。' }],
                shortTerm: '暂居仁心堂。',
                action_options: ['继续打听城外异动']
            }
        }
    ];
    return save;
};

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

const injectSaveAndReload = async (page, targetUrl, save) => {
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
                环境信息: payload.环境信息
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }, save);
    await page.reload({ waitUntil: 'networkidle' });
    await closeReleaseNotesIfOpen(page);
};

const loadGame = async (page, save = makeRoleChatSave()) => {
    test.setTimeout(120000);
    const targetUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === new URL(targetUrl).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
    });

    await injectSaveAndReload(page, targetUrl, save);
    await expect.poll(() => clickByTexts(page, ['本地游玩'])).toBe(true);
    await expect.poll(() => clickByTexts(page, ['重入江湖', '读取进度', '继续游戏', '读取', '载入'])).toBe(true);

    const saveCard = page.locator('div.cursor-pointer', { hasText: '点击本系列会直接读取最新存档' }).first();
    await expect(saveCard).toBeVisible({ timeout: 10000 });
    await saveCard.click({ position: { x: 24, y: 80 }, force: true });

    const confirmReadButton = page.getByRole('button', { name: /^读取$/ }).last();
    if (!await confirmReadButton.isVisible().catch(() => false)) {
        const latestSaveButton = page.getByRole('button', { name: '读取最新存档' });
        await expect(latestSaveButton).toBeVisible({ timeout: 5000 });
        await latestSaveButton.click({ timeout: 5000, force: true });
    }
    await expect(confirmReadButton).toBeVisible({ timeout: 5000 });
    await confirmReadButton.click({ timeout: 5000, force: true });

    const roleChatEntry = page.locator('button[title^="角色对话"]').first();
    await expect(roleChatEntry).toBeVisible({ timeout: 15000 });
    return roleChatEntry;
};

for (const mobile of [false, true]) {
    test(`旧档从正文补录离场人物（${mobile ? '手机' : '桌面'}）`, async ({ page }) => {
        const save = structuredClone(baseSave);
        save.社交 = [
            { id: 'known', 姓名: '俞月荷', 是否在场: true, 关系网变量: [{ 对象姓名: '俞凌风', 关系: '堂兄' }] },
            { id: 'old-clue', 姓名: '曲君明', 叙事名称: '戴笠客', 状态: '已故', 来源: '正文提及', 关系状态: '已闻其名', 是否在场: false }
        ];
        save.任务列表 = [{ 标题: '债务纠纷', 类型: '主线', 描述: '查清沈天彪与钱掌柜的利益关系。' }];
        save.历史记录 = [{ role: 'assistant', content: 'Structured Response', structuredResponse: { logs: [
            { sender: '旁白', text: '俞凌风种下的气息仍在折磨她。巷口三名帮众正在抽烟。' },
            { sender: '俞月荷', text: '那钱掌柜想借沈天彪的刀，沈天彪想借钱掌柜的势。杨老泉留下的东西还在。' }
        ] } }];
        await loadGame(page, save);
        if (mobile) {
            await page.setViewportSize({ width: 390, height: 844 });
            const expand = page.getByRole('button', { name: '展开功能栏' });
            if (await expand.isVisible()) await expand.click();
            await page.getByRole('button', { name: '更多', exact: true }).click();
        }
        await page.getByRole('button', { name: /^(江湖谱|社交)$/ }).first().click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
        for (const name of ['沈天彪', '钱掌柜', '俞凌风']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
        for (const name of ['杨老泉', '三名帮众']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
        await page.getByText('钱掌柜', { exact: true }).first().click();
        const details = page.getByRole('region', { name: '已知人物线索' });
        await expect(details).toContainText('掌柜 · 已闻其名 · 不在场');
        await expect(details).toContainText('俞月荷提到：那钱掌柜想借沈天彪的刀');
        await expect(details).not.toContainText(/岁|出身背景|草木亲和/);
        await expect(details.getByRole('button', { name: '设为在场' })).toBeVisible();
        await page.getByText('戴笠客', { exact: true }).first().click();
        const toggle = details.locator('[data-real-name-toggle]');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(toggle.locator('.npc-real-name-mosaic')).toBeVisible();
        await toggle.click();
        await expect(toggle.locator('[data-real-name]')).toHaveText('曲君明');
        await expect(details.getByRole('button', { name: '设为在场' })).toHaveCount(0);
    });
}

// z-[230] 也用在顶栏与其它模态上，这里用面板独有文案锚定。
const panelOf = (page) => page
    .locator('div[class*="z-[230]"][class*="fixed"]')
    .filter({ hasText: '下次提交行动时一并注入' })
    .first();

test('角色对话面板：暂存随存档恢复、按 NPC 隔离、未配置时不回退主模型', async ({ page }) => {
    const roleChatEntry = await loadGame(page);

    // 读档应把存档里的场外对话恢复到 state：面板打开即应看到甲线的两条。
    await roleChatEntry.click({ timeout: 5000, force: true });
    const panel = panelOf(page);
    await expect(panel).toBeVisible({ timeout: 10000 });
    await expect(panel.getByText('角色对话').first()).toBeVisible();

    // 在场列表只含标记为在场的两人，且主要角色排在前面。
    const npcOptions = panel.locator('select option');
    await expect(npcOptions).toHaveCount(2);
    await expect(npcOptions.nth(0)).toHaveText(/沈听澜/);
    await expect(npcOptions.nth(1)).toHaveText(/老李/);

    // 默认选中甲：只看得到甲线。
    await expect(panel.getByText('甲线：沈家旧物，不曾丢。')).toBeVisible();
    await expect(panel.getByText('乙线：后厨柴堆下堆着两捆。')).toHaveCount(0);
    await expect(panel.getByText(/本对话暂存 2 条/)).toBeVisible();
    await expect(panel.getByText(/全部暂存 4 条/)).toBeVisible();
    const distance = panel.getByRole('checkbox', { name: /确认能够交谈：位置记录与当前地点相符/ });
    await expect(distance).toBeVisible();
    await expect(distance).not.toBeChecked();
    await expect(panel.getByText('记录位置：青州 > 洛城 > 客栈 > 大厅')).toBeVisible();
    await panel.getByText('查看当前不能直接交谈的角色').click();
    await expect(panel.getByText(/离场客：离场客不在当前场景/)).toBeVisible();

    // 切到乙：甲的私聊必须消失，乙线出现。
    await panel.locator('select').first().selectOption('npc-role-b');
    await expect(panel.getByText('乙线：后厨柴堆下堆着两捆。')).toBeVisible();
    await expect(panel.getByText('甲线：沈家旧物，不曾丢。')).toHaveCount(0);
    await expect(panel.getByText(/本对话暂存 2 条/)).toBeVisible();

    // 未配置独立模型：给引导 + 禁止发送（不回退主剧情模型）。
    await expect(panel.getByText(/角色对话需要先在设置里开启「角色对话独立模型」/)).toBeVisible();
    await expect(panel.getByRole('button', { name: '发送' })).toBeDisabled();
    await expect(panel.locator('textarea')).toBeDisabled();

    await page.screenshot({ path: 'artifacts/e2e-role-chat-day-mode.png', fullPage: false });

    // 日间模式下新面板必须可读：面板底色应为浅色、正文/引导文字为深色。
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('day');
    const colors = await page.evaluate(() => {
        const parse = (value) => {
            const matched = String(value || '').match(/rgba?\(([^)]+)\)/);
            if (!matched) return null;
            const parts = matched[1].split(',').map((item) => Number(item.trim()));
            return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
        };
        const overlay = document.querySelector('div[class*="z-[230]"][class*="fixed"]');
        const surface = overlay?.querySelector('div[class*="bg-ink-black"]');
        const nodes = Array.from(overlay?.querySelectorAll('div') || []);
        const guide = nodes.find((node) => node.textContent?.includes('角色对话需要先在设置里开启'));
        const npcBubble = nodes.find((node) => node.textContent?.trim() === '乙线：后厨柴堆下堆着两捆。');
        const playerBubble = nodes.find((node) => node.textContent?.trim() === '乙线：生地黄还有货吗？');
        return {
            surfaceBg: parse(surface ? getComputedStyle(surface).backgroundColor : ''),
            guideColor: parse(guide ? getComputedStyle(guide).color : ''),
            npcBubbleColor: parse(npcBubble ? getComputedStyle(npcBubble).color : ''),
            playerBubbleColor: parse(playerBubble ? getComputedStyle(playerBubble).color : '')
        };
    });
    const luminance = ({ r, g, b }) => {
        const channel = (value) => {
            const v = value / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (fg, bg) => {
        const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return (light + 0.05) / (dark + 0.05);
    };
    expect(colors.surfaceBg).not.toBeNull();
    // 日间模式必须「浅底深字」：面板底色亮度过半，正文/引导文字为深色。
    expect(luminance(colors.surfaceBg)).toBeGreaterThan(0.5);
    expect(luminance(colors.npcBubbleColor)).toBeLessThan(0.5);
    expect(luminance(colors.playerBubbleColor)).toBeLessThan(0.5);
    expect(luminance(colors.guideColor)).toBeLessThan(0.5);
    // 引导文字直接叠在面板浅底上，需达到 4.5:1。
    expect(contrast(colors.guideColor, colors.surfaceBg)).toBeGreaterThanOrEqual(4.5);

    // 引导入口直达设置页，且默认开关为关闭、开启后不会偷偷回退主剧情模型。
    await panel.getByRole('button', { name: /去设置/ }).click({ timeout: 5000, force: true });
    const toggle = page.getByRole('switch', { name: '切换角色对话独立模型' });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    const groupToggle = page.getByRole('switch', { name: '切换多人群聊' });
    await expect(groupToggle).toBeVisible();
    await expect(groupToggle).toHaveAttribute('aria-checked', 'false');
    await groupToggle.click({ timeout: 5000, force: true });
    await expect(groupToggle).toHaveAttribute('aria-checked', 'true');

    // 群聊开关保存后，面板可切到群聊；候选仍需逐一选择并确认真实交谈距离。
    await page.getByRole('button', { name: '保存设置' }).first().click({ timeout: 5000, force: true });
    await expect(page.getByText('✔ 配置已保存')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: '关闭设置' }).click({ timeout: 5000, force: true });
    await roleChatEntry.click({ timeout: 5000, force: true });
    const reopenedPanel = panelOf(page);
    await expect(reopenedPanel).toBeVisible({ timeout: 5000 });
    await reopenedPanel.getByRole('button', { name: '群聊' }).click({ timeout: 5000, force: true });
    const groupPanel = page.locator('div[class*="z-[230]"][class*="fixed"]').filter({ hasText: '每位角色发言会分别调用所选模型' }).first();
    await expect(groupPanel).toBeVisible({ timeout: 5000 });
    await expect(groupPanel.getByText(/选择至少两名角色/)).toBeVisible();
    const candidateChecks = groupPanel.locator('input[type="checkbox"]');
    await candidateChecks.nth(0).check({ force: true });
    await candidateChecks.nth(1).check({ force: true });
    await expect(groupPanel.getByText(/我确认所选角色此刻都在附近/)).toBeVisible();
    await expect(groupPanel.locator('textarea')).toBeDisabled();
    await page.screenshot({ path: 'artifacts/e2e-group-role-chat-day-mode.png', fullPage: false });

    // 未配置独立模型时，即使群聊已经开启，也只能去设置，不能偷偷调用主剧情模型。
    await groupPanel.getByRole('button', { name: '去设置' }).click({ timeout: 5000, force: true });
    await expect(toggle).toBeVisible({ timeout: 5000 });

    await toggle.click({ timeout: 5000, force: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: '保存设置' }).first().click({ timeout: 5000, force: true });
    await expect(page.getByText('已开启角色对话独立模型，请先获取列表并选择模型。')).toBeVisible({ timeout: 5000 });
});

// 玩家反馈：「角色对话里有没有可能增加重roll的功能？有时候哈基米犯蠢回复不满意也改不了」。
// 这里只验证入口出现与否——重ROLL 的「摘掉哪两条」逻辑由
// __tests__/roleChatRerollTarget.test.ts 单测覆盖，不需要真调模型。
test('角色对话面板：上一句是角色回复时出现「重ROLL」，未配置模型时禁用', async ({ page }) => {
    const roleChatEntry = await loadGame(page);
    await roleChatEntry.click({ timeout: 5000, force: true });
    const panel = panelOf(page);
    await expect(panel).toBeVisible({ timeout: 10000 });

    // 读档已补齐房间，玩家尚未确认交谈距离时仍不该出现重ROLL，与普通发送共用门槛。
    // 否则面板重开后 confirmedKey 被清空，重ROLL 会绕过发送必须过的位置确认。
    await expect(panel.getByRole('button', { name: '重ROLL' })).toHaveCount(0);

    await panel.locator('input[type="checkbox"]').first().check({ force: true });
    const reroll = panel.getByRole('button', { name: '重ROLL' });
    await expect(reroll).toBeVisible({ timeout: 5000 });
    await expect(reroll).toHaveAttribute('title', /重新生成/);
    // 本用例没有配置独立模型：入口要在，但不能点（不能偷偷回退主剧情模型），
    // 也不能提示玩家去点一个点不动的按钮。
    await expect(reroll).toBeDisabled();
    await expect(panel.getByText(/不满意可点「重ROLL」重生成上一句/)).toHaveCount(0);

    // 切到乙线：换人后位置确认按 NPC 重算，需要重新勾选确认才出现入口。
    await panel.locator('select').first().selectOption('npc-role-b');
    await expect(panel.getByRole('button', { name: '重ROLL' })).toHaveCount(0);
    await panel.locator('input[type="checkbox"]').first().check({ force: true });
    await expect(panel.getByRole('button', { name: '重ROLL' })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'artifacts/e2e-role-chat-reroll.png', fullPage: false });
});
