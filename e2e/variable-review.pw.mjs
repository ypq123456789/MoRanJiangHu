import { test, expect } from '@playwright/test';

// 在本地Vite（默认4173）上运行；使用已安装Chrome，无真实AI/云端写入。
test.use({ channel: 'chrome', baseURL: process.env.VARIABLE_REVIEW_TEST_URL || 'http://127.0.0.1:4173' });
const completedBody = '卡尔走进大厅，介绍自己是长期同行的旅人。';
const repair = `<说明>状态：需要修复\n正文中的卡尔尚未记录，建议补充档案。</说明><命令>push 社交 = ${JSON.stringify({ id: 'NPC-CARL', 姓名: '卡尔', 性别: '男', 身份: '旅人', 简介: '背景资料'.repeat(300) })}</命令>`;
async function enterGame(page, theme, fixture = {}) {
    await page.goto('/');
    await page.waitForFunction(() => !!document.querySelector('button'));
    const body = fixture.body || completedBody;
    await page.evaluate(async ({ theme, completedBody, fixture }) => {
        const db = await import('/services/dbService.ts');
        const transforms = await import('/hooks/useGame/stateTransforms.ts');
        const api = await import('/utils/apiConfig.ts');
        const settings = api.规范化接口设置({ configs: [{ id: 'review-test', name: '本地测试', baseUrl: 'https://review.test/v1', apiKey: 'test-key', model: 'test-model', 供应商: 'openai' }], currentConfigId: 'review-test', activeConfigId: 'review-test', 功能模型占位: { 变量计算独立模型开关: false, 变量计算渠道ID: 'review-test', 变量计算使用模型: 'test-model' } });
        await db.保存设置('api_settings', settings);
        await db.保存设置('app_theme', theme);
        await db.保存存档({ 类型: 'manual', 时间戳: Date.now(), 游戏时间: '1:01:01:08:00',
            角色数据: transforms.规范化角色物品容器映射({ 姓名: '林岳', 性别: '男', 年龄: 18, 金钱: { 金元宝: 100 }, 物品列表: [], ...(fixture.role || {}) }),
            环境信息: { 时间: '1:01:01:08:00', 大地点: '城中', 中地点: '广场', 小地点: '客栈', 具体地点: '大厅' },
            社交: fixture.social || [], 世界: {}, 战斗: { 是否战斗中: false, 敌方: [] }, 玩家门派: {}, 任务列表: [], 约定列表: [], 剧情: {}, 剧情规划: {},
            历史记录: [{ role: 'user', content: '走进大厅', timestamp: 1 }, { role: 'assistant', content: completedBody, timestamp: 2, structuredResponse: { logs: [{ sender: '旁白', text: completedBody }], tavern_commands: [] } }],
            记忆系统: { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 回忆档案: [] }, 元数据: { 主角姓名: '林岳', 历史记录条数: 2, 游戏回合数: 1 }
        });
    }, { theme, completedBody: body, fixture });
    await page.reload();
    const releaseClose = page.getByRole('button', { name: '关闭更新日志' });
    if (await releaseClose.isVisible().catch(() => false)) await releaseClose.click();
    await page.getByRole('button', { name: '本地游玩' }).click();
    await page.getByRole('button', { name: '重入江湖' }).click();
    const series = page.getByText(/时间树.*个节点/).first();
    await series.waitFor(); await series.click();
    const load = page.getByRole('button', { name: '读取最新存档' });
    if (await load.isVisible().catch(() => false)) await load.click();
    await page.getByRole('button', { name: '读取', exact: true }).click();
    await expect(page.getByText(body, { exact: false }).first()).toBeVisible();
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    const direct = page.getByRole('button', { name: '变量管理', exact: true }).first();
    if (await direct.isVisible().catch(() => false)) await direct.click();
    else {
        await page.getByRole('button', { name: /设置$/ }).first().click();
        await page.getByRole('button', { name: '变量', exact: true }).first().click();
    }
    await page.getByRole('button', { name: '变量审查', exact: true }).click();
}
for (const mobile of [false, true]) {
    test(`${mobile ? '手机' : '桌面'} day：明确修正与清理只展示实际diff，冲突保留为未处理疑点`, async ({ page }) => {
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
        const body = '1年1月2日清晨六点已到。沈清辞换上居家服并走进卫生间。强行压制情欲效果已经结束，状态恢复。林开泰的位置线索冲突，无法确认最新位置。';
        const commands = [{ action: 'set', key: '环境.时间', value: '1:01:02:06:00' }, { action: 'set', key: '社交[0].衣着风格', value: '居家服' }, { action: 'set', key: '社交[0].当前位置', value: '卫生间' }, { action: 'delete', key: '角色.玩家BUFF[0]' }];
        const reports = ['环境.时间', '社交[0].衣着风格', '社交[0].当前位置', '角色.玩家BUFF[0]', '社交[1].当前位置'].map(path => `疑点：${JSON.stringify({ path, description: '无法确认最新状态', evidence: body })}`);
        const content = `<说明>状态：需要修复\n${reports.join('\n')}</说明><命令>${commands.map(command => `${command.action} ${command.key}${command.action === 'delete' ? '' : ` = ${JSON.stringify(command.value)}`}`).join('\n')}</命令>`;
        await page.route('https://review.test/**', async route => {
            const headers = { 'access-control-allow-origin': '*' };
            if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*' } });
            const request = JSON.parse(route.request().postData());
            return route.fulfill(request.stream ? { headers, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n` } : { headers, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }] }) });
        });
        await enterGame(page, 'day', { body, social: [{ id: 'A', 姓名: '沈清辞', 衣着风格: '冬装', 当前位置: '客厅' }, { id: 'B', 姓名: '林开泰', 当前位置: '书房' }], role: { 玩家BUFF: [{ 名称: '强行压制情欲', 描述: '临时效果', 效果: '精神稳定性提高20%', 结束时间: '1:01:02:23:00' }] } });
        await page.getByRole('button', { name: '开始变量审查' }).click();
        const dialog = page.getByRole('dialog', { name: '变量审查' });
        await expect(dialog.getByText('清理：1 项')).toBeVisible();
        await expect(dialog.getByRole('region', { name: '修正' }).getByText('环境 · 时间')).toBeVisible();
        await expect(dialog.getByRole('region', { name: '修正' }).getByText('沈清辞 · 衣着风格')).toBeVisible();
        const issues = dialog.getByRole('region', { name: '仍需确认的疑点' });
        await expect(issues.getByText(/林开泰.*本次未修改/)).toBeVisible();
        await expect(issues.getByText(/沈清辞|环境 · 时间/)).toHaveCount(0);
        expect(await dialog.locator('.variable-review-diagnostics').evaluate(el => el.open)).toBe(false);
        expect(await dialog.locator('.variable-review-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.getByRole('button', { name: '应用修复', exact: true }).click();
        await expect(dialog.getByText(/变量修复已应用，共修改/)).toBeVisible();
    });
}
for (const mobile of [false, true]) for (const theme of ['day', 'ink']) {
    test(`${mobile ? '手机' : '桌面'} ${theme}：实际游戏审查、布局、确认保存`, async ({ page }) => {
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
        await page.route('https://review.test/**', async route => {
            if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
            const body = JSON.parse(route.request().postData() || '{}');
            const headers = { 'access-control-allow-origin': '*' };
            await route.fulfill(body.stream ? { headers, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: repair } }] })}\n\ndata: [DONE]\n\n` } : { headers, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: repair } }] }) });
        });
        await enterGame(page, theme);
        const dialog = page.getByRole('dialog', { name: '变量审查' });
        await page.getByLabel('本次审查备注（可选）').fill('重点检查正文中的 NPC');
        if (mobile) {
            // 缩小可视窗口模拟键盘占位，底部操作仍在窗口内。
            await page.setViewportSize({ width: 390, height: 420 });
            const footer = await dialog.locator('.variable-review-footer').boundingBox();
            expect(footer.y + footer.height).toBeLessThanOrEqual(420);
            await page.setViewportSize({ width: 390, height: 844 });
        }
        await page.getByRole('button', { name: '开始变量审查' }).click();
        await expect(dialog.getByText(/本次将应用的修改/)).toBeVisible();
        await expect(dialog.getByText('补齐：1 项')).toBeVisible();
        await expect(dialog.getByText('清理：0 项')).toBeVisible();
        await expect(dialog.getByText('未发现需要玩家额外确认的问题。')).toBeVisible();
        expect(await dialog.locator('.variable-review-diagnostics').evaluate(el => el.open)).toBe(false);
        await dialog.getByText('展开对象 / 长内容').last().click();
        await dialog.getByText(/技术详情 · /).click();
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await dialog.locator('.variable-review-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (theme === 'day') {
            const colors = await dialog.evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
            expect(colors.foreground).toBe('rgb(56, 46, 36)'); expect(colors.background).toBe('rgb(255, 250, 240)');
        }
        await page.screenshot({ path: `/tmp/variable-review-${mobile ? 'mobile' : 'desktop'}-${theme}.png` });
        const apply = page.getByRole('button', { name: '应用修复', exact: true });
        await expect(apply).toBeEnabled(); await apply.click();
        await expect(dialog.getByText(/变量修复已应用，共修改/)).toBeVisible();
        const saved = await page.evaluate(async () => {
            const db = await import('/services/dbService.ts'); const database = await db.初始化数据库();
            const entries = await new Promise((resolve, reject) => { const request = database.transaction('saves').objectStore('saves').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
            return entries.filter(save => save.社交?.some(npc => npc.姓名 === '卡尔')).map(save => ({ names: save.社交.map(npc => npc.姓名), time: save.环境信息.时间, history: save.历史记录 }));
        });
        expect(saved).toHaveLength(1); expect(saved[0].names.filter(name => name === '卡尔')).toHaveLength(1);
        expect(saved[0].time).toBe('1:01:01:08:00'); expect(saved[0].history).toHaveLength(2);
        await expect(dialog.getByRole('button', { name: '应用修复' })).toHaveCount(0);
    });
}

for (const mobile of [false, true]) {
    test(`${mobile ? '手机' : '桌面'} day：审查设置保存、模型刷新、独立连接与Prompt恢复`, async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
        const modelRequests = []; const reviewRequests = []; let aiRequests = 0;
        for (const domain of ['review.test', 'own-review.test']) await page.route(`https://${domain}/**`, async route => {
            const request = route.request(); const headers = { 'access-control-allow-origin': '*' };
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*' } });
            if (request.method() === 'GET') {
                modelRequests.push({ url: request.url(), auth: request.headers().authorization });
                return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'review-gpt-id', display_name: '[按次] Gemini Flash', context_window: 200000 }, { id: 'other-model' }] }) });
            }
            aiRequests++;
            const body = JSON.parse(request.postData());
            reviewRequests.push({ url: request.url(), auth: request.headers().authorization, body });
            const content = '<说明>状态：无需修改</说明><命令></命令>';
            return route.fulfill(body.stream
                ? { headers, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n` }
                : { headers, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }] }) });
        });
        await enterGame(page, 'day');
        const dialog = page.getByRole('dialog', { name: '变量审查' });
        const strategy = page.getByLabel('审查提示词', { exact: true }); await strategy.waitFor();
        await expect(page.getByRole('button', { name: '开始变量审查' })).toBeEnabled();
        expect(aiRequests).toBe(0);
        await strategy.fill('重点检查人物服装与装备。');
        await page.getByLabel('自定义审查 Model ID').fill('review-gpt-id');
        if (mobile) {
            await page.setViewportSize({ width: 390, height: 420 });
            const footer = await dialog.locator('.variable-review-footer').boundingBox();
            expect(footer.y + footer.height).toBeLessThanOrEqual(420);
            await page.setViewportSize({ width: 390, height: 844 });
        }
        await page.getByRole('button', { name: '刷新模型', exact: true }).click();
        await expect(page.getByText('审查模型列表已刷新。')).toBeVisible();
        expect(modelRequests[0].url).toContain('review.test');
        await page.getByLabel('使用独立 API').check();
        await page.getByLabel('Base URL', { exact: true }).fill('https://own-review.test/v1');
        await page.getByLabel('API Key', { exact: true }).fill('own-test-key');
        await page.getByRole('button', { name: '刷新模型', exact: true }).click();
        await expect(page.getByText('审查模型列表已刷新。')).toBeVisible();
        expect(modelRequests.at(-1).url).toContain('own-review.test');
        expect(modelRequests.at(-1).auth).toBe('Bearer own-test-key');
        const modelGroup = page.getByRole('group', { name: '审查模型列表' });
        await expect(modelGroup.getByRole('button', { name: '[按次] Gemini Flash', exact: true })).toBeVisible();
        await page.getByLabel('自定义审查 Model ID').fill('manual-current');
        await modelGroup.getByRole('button', { name: /manual-current/ }).click();
        await page.getByRole('button', { name: '[按次] Gemini Flash', exact: true }).click();
        await page.getByLabel('Top P（可选）').fill('0.8');
        await page.getByLabel('Top P（可选）').blur();
        await page.getByLabel('Temperature（可选）').fill('999');
        await page.getByLabel('Temperature（可选）').blur();
        await expect(page.getByLabel('Temperature（可选）')).toHaveValue('2');
        await page.getByLabel('本次审查备注（可选）').fill('这次备注不保存');
        await page.getByRole('button', { name: '恢复默认审查提示词' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: '恢复默认', exact: true }).click();
        await expect(strategy).toHaveValue(/最终复核/);
        await expect(page.getByLabel('本次审查备注（可选）')).toHaveValue('这次备注不保存');
        await expect(page.getByLabel('自定义审查 Model ID')).toHaveValue('review-gpt-id');
        await strategy.fill('浏览器重载后保留的审查策略');
        const settings = await page.evaluate(async () => {
            const db = await import('/services/dbService.ts');
            // 等待最后一个设置事务写入，避免只验证React草稿。
            for (let i = 0; i < 50; i++) { const value = await db.读取设置('variable_review_settings'); if (value?.customPrompt === '浏览器重载后保留的审查策略') return value; await new Promise(r => setTimeout(r, 20)); }
        });
        expect(settings.apiMode).toBe('independent'); expect(settings.model).toBe('review-gpt-id'); expect(settings.reviewNotes).toBeUndefined(); expect(aiRequests).toBe(0);
        await dialog.locator('.variable-review-body').evaluate(el => { el.scrollTop = 0; });
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        const colors = await dialog.locator('#review-model-id').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
        expect(colors.foreground).toBe('rgb(56, 46, 36)'); expect(['rgb(255, 254, 249)', 'rgba(255, 255, 255, 0.9)']).toContain(colors.background);
        await page.screenshot({ path: `/tmp/variable-review-settings-${mobile ? 'mobile' : 'desktop'}-day.png` });
        const windowGroup = page.getByRole('group', { name: '审查上下文窗口' });
        await windowGroup.getByRole('button', { name: '自动', exact: true }).click();
        await page.getByRole('button', { name: '自定义', exact: true }).click();
        await page.getByLabel('自定义上下文窗口 Token').fill('-1'); await page.getByLabel('自定义上下文窗口 Token').blur();
        await expect(page.getByLabel('自定义上下文窗口 Token')).toHaveValue('4096');
        await page.getByRole('button', { name: '开始变量审查' }).click();
        await expect(page.getByText('上下文容量不足', { exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: '审查容量诊断' })).toContainText('4,096');
        expect(aiRequests).toBe(0);
        await windowGroup.getByRole('button', { name: '自定义', exact: true }).click();
        await page.getByRole('button', { name: '200K', exact: true }).click();
        await page.getByRole('button', { name: '开始变量审查' }).click();
        await expect(dialog.getByText('在本次审查范围内，未发现需要修改的变量。')).toBeVisible();
        expect(reviewRequests).toHaveLength(1);
        expect(reviewRequests[0].url).toContain('own-review.test');
        expect(reviewRequests[0].auth).toBe('Bearer own-test-key');
        expect(reviewRequests[0].body).toMatchObject({ model: 'review-gpt-id', top_p: 0.8, temperature: 2 });
        await expect(page.getByRole('region', { name: '审查容量诊断' })).toContainText('200,000');
        await page.getByRole('button', { name: '关闭变量审查' }).click(); await page.reload();
        const persisted = await page.evaluate(async () => (await import('/services/dbService.ts')).读取设置('variable_review_settings'));
        expect(persisted.customPrompt).toBe('浏览器重载后保留的审查策略'); expect(persisted.apiKey).toBe('own-test-key');
        expect(persisted.contextWindowTokens).toBe(200000); expect(persisted.contextWindowMode).toBe('manual');
    });
}

for (const operation of ['清空全部设置', '清空全部数据']) for (const preserve of [true, false]) {
    test(`真实IndexedDB ${operation} 保留API=${preserve}：审查连接与主API保护一致`, async ({ page }) => {
        await page.goto('/'); await page.waitForFunction(() => !!document.querySelector('button'));
        const result = await page.evaluate(async ({ operation, preserve }) => {
            const db = await import('/services/dbService.ts');
            const { normalizeVariableReviewSettings } = await import('/utils/variableReviewSettings.ts');
            const originalMain = { activeConfigId: 'kept', configs: [{ id: 'kept', 名称: '保留接口', 供应商: 'openai_compatible', baseUrl: 'https://kept.test/v1', apiKey: 'kept-main-key', model: 'story-id' }] };
            const originalReview = { ...normalizeVariableReviewSettings(), apiMode: 'independent', provider: 'deepseek', baseUrl: 'https://own.test/v1', apiKey: 'kept-review-key', model: 'review-id', maxOutputTokens: 8192, temperature: 0.1, topP: 0.8, customPrompt: '原自定义Prompt' };
            await db.保存设置('api_settings', originalMain); await db.保存设置('variable_review_settings', originalReview);
            await db.导入全部设置备份({ type: 'moranjianghu_settings_backup', settings: [
                { key: 'api_settings', value: { ...originalMain, configs: [{ ...originalMain.configs[0], apiKey: 'imported-main-key' }] } },
                { key: 'variable_review_settings', value: { ...originalReview, apiKey: 'imported-review-key', customPrompt: '导入Prompt' } }
            ] }, { 保留现有APIKey: preserve });
            const importedMain = await db.读取设置('api_settings'); const importedReview = await db.读取设置('variable_review_settings');
            await db[operation]({ 保留APIKey: preserve });
            return { importedMain, importedReview, main: await db.读取设置('api_settings'), review: await db.读取设置('variable_review_settings') };
        }, { operation, preserve });
        expect(result.importedMain.configs[0].apiKey).toBe(preserve ? 'kept-main-key' : 'imported-main-key');
        expect(result.importedReview.apiKey).toBe(preserve ? 'kept-review-key' : 'imported-review-key');
        expect(result.importedReview.customPrompt).toBe('导入Prompt');
        if (preserve) {
            expect(result.main.configs[0].apiKey).toBe('kept-main-key');
            expect(result.review).toMatchObject({ apiMode: 'independent', provider: 'deepseek', baseUrl: 'https://own.test/v1', apiKey: 'kept-review-key', model: 'review-id', maxOutputTokens: 8192, temperature: 0.1, topP: 0.8 });
            expect(result.review.customPrompt).toBeUndefined();
        } else { expect(result.main).toBeNull(); expect(result.review).toBeNull(); }
    });
}
