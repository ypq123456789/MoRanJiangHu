import { test, expect } from '@playwright/test';

const TARGET_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const RELEASE_NOTES_SUPPRESS_KEY = 'moranjianghu.releaseNotesSuppressDate';
const CLOUD_PLAY_SESSION_KEY = 'moranjianghu.cloudPlay.session.v1';
const CLOUD_PLAY_RISK_KEY = 'moranjianghu.cloudPlay.riskAcknowledged.v1';
const CLOUD_PLAY_OBJECT_MODE_KEY = 'moranjianghu.cloudPlay.objectStorageMode.v1';

const DELAY_SCRIPT = () => {
    const raw = localStorage.getItem('__e2eIdbDelayMap');
    if (!raw) return;
    let delayMap = {};
    try {
        delayMap = JSON.parse(raw) || {};
    } catch {
        return;
    }
    const origGet = IDBObjectStore.prototype.get;
    const onsuccessDesc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
    IDBObjectStore.prototype.get = function (key) {
        const req = origGet.apply(this, arguments);
        const delayMs = Number(delayMap[String(key)] || 0);
        if (delayMs > 0 && onsuccessDesc && typeof onsuccessDesc.set === 'function') {
            let userHandler = null;
            Object.defineProperty(req, 'onsuccess', {
                configurable: true,
                get() { return userHandler; },
                set(fn) { userHandler = fn; }
            });
            onsuccessDesc.set.call(req, function (ev) {
                const self = this;
                setTimeout(() => {
                    if (typeof userHandler === 'function') userHandler.call(self, ev);
                }, delayMs);
            });
        }
        return req;
    };
};

const suppressReleaseNotesAndAttachDelayHook = async (page) => {
    await page.addInitScript(({ suppressKey }) => {
        localStorage.setItem(suppressKey, new Date().toISOString().slice(0, 10));
    }, { suppressKey: RELEASE_NOTES_SUPPRESS_KEY });
    await page.addInitScript(DELAY_SCRIPT);
};

const seedSettingsInIdb = async (page, entries) => {
    await page.evaluate(async (items) => {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('WuxiaGameDB');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['settings'], 'readwrite');
            const store = tx.objectStore('settings');
            for (const { key, value, category } of items) {
                store.put({
                    key,
                    value,
                    version: 2,
                    category: category || 'e2e',
                    updatedAt: Date.now()
                });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, entries);
};

const makePreset = (id, name) => ({
    id,
    名称: name,
    简介: `${name}简介`,
    worldConfig: {
        difficulty: 'normal',
        era: '架空乱世',
        genre: '经典武侠',
        worldExtraRequirement: '',
        manualWorldPrompt: '',
        manualRealmPrompt: ''
    },
    character: {
        姓名: '沈砚',
        性别: '男',
        年龄: 18,
        出生月: 3,
        出生日: 15,
        外貌: '青衫配剑',
        性格: '沉稳',
        属性: { 臂力: 8, 身法: 8, 根骨: 8, 悟性: 8, 福缘: 8, 魅力: 8 },
        背景名称: 'E2E游侠身份',
        天赋名称列表: []
    },
    openingStreaming: true,
    openingExtraRequirement: ''
});

const parseRgb = (cssColor) => {
    const m = String(cssColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const collectErrors = (page) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err?.message || String(err)}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            errors.push(`[console.error] ${msg.text()}`);
        }
    });
    return errors;
};

const filterRealErrors = (errors) => errors.filter((item) => (
    !/Failed to load resource.*(404|405|501|ERR_FAILED)|WebSocket connection.*\/api\/.*failed|CORS policy:|Access to fetch at .*\/release-info\.json/i.test(item)
));

test.describe('新建角色加载态、联机存档竞态与世界观流式降级端到端验证', () => {
    test('桌面端建角向导在日间模式下显示独立加载态且慢请求不阻塞开局预设立即渲染', async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 1280, height: 800 });
        const errors = collectErrors(page);
        await suppressReleaseNotesAndAttachDelayHook(page);

        await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
        await seedSettingsInIdb(page, [
            { key: 'app_theme', value: 'day', category: 'interface' },
            { key: 'new_game_custom_start_presets', value: [makePreset('e2e-p1', 'E2E首屏剑客方案')], category: 'customization' },
            { key: 'new_game_custom_backgrounds', value: [{ 名称: 'E2E游侠身份', 描述: '四海为家的江湖游侠。', 效果: '初入江湖声望+1', 初始物品: [], 自带天赋: [] }], category: 'customization' },
            { key: 'new_game_custom_talents', value: [{ 名称: 'E2E剑骨奇才', 描述: '天生骨骼清奇，契合剑道。', 效果: '剑法领悟速度提升', 隐藏: false }], category: 'customization' },
            {
                key: 'novel_decomposition_datasets',
                value: [{
                    id: 'ds-e2e-1',
                    标题: 'E2E长篇江湖录',
                    作品名: 'E2E长篇江湖录',
                    来源类型: 'txt',
                    创建时间: Date.now(),
                    更新时间: Date.now(),
                    分段列表: []
                }],
                category: 'world'
            }
        ]);

        await page.evaluate(() => {
            localStorage.setItem('__e2eIdbDelayMap', JSON.stringify({
                new_game_custom_start_presets: 600,
                novel_decomposition_datasets: 4000,
                new_game_custom_backgrounds: 300,
                new_game_custom_talents: 300
            }));
        });

        let releaseWorkshop = () => {};
        const workshopGate = new Promise((resolve) => {
            releaseWorkshop = resolve;
        });
        await page.route('**/api/workshop/modules*', async (route) => {
            await workshopGate;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, entries: [] })
            });
        });

        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

        await page.getByRole('button', { name: '本地游玩' }).click();
        await page.getByRole('button', { name: '踏入江湖' }).click();

        // 1. 进入建角后立即可见开局预设方案与创意工坊的加载提示，而不是先消失再弹出
        const presetLoadingBanner = page.getByRole('status').filter({ hasText: '正在加载开局预设方案…' });
        const workshopLoadingBanner = page.getByRole('status').filter({ hasText: '正在加载创意工坊模式列表…' });
        await expect(presetLoadingBanner).toBeVisible({ timeout: 5000 });
        await expect(workshopLoadingBanner).toBeVisible({ timeout: 5000 });

        // 2. 验证日间模式加载框及骨架屏不得使用黑底或不可读低对比色彩
        const dayColors = await presetLoadingBanner.evaluate((el) => {
            const bannerStyle = getComputedStyle(el);
            const skeletonCard = el.parentElement?.querySelector('[aria-hidden="true"] > div');
            const skeletonStyle = skeletonCard ? getComputedStyle(skeletonCard) : null;
            return {
                bannerBg: bannerStyle.backgroundColor,
                bannerColor: bannerStyle.color,
                skeletonBg: skeletonStyle?.backgroundColor || ''
            };
        });
        const bannerTextRgb = parseRgb(dayColors.bannerColor);
        expect(bannerTextRgb).not.toBeNull();
        expect(bannerTextRgb[0] + bannerTextRgb[1] + bannerTextRgb[2]).toBeLessThan(480);
        expect(dayColors.skeletonBg).not.toBe('rgb(0, 0, 0)');

        // 3. 本地开局预设就绪（~600ms）后立即渲染，无需等待仍在阻塞中的小说数据集与工坊
        await expect(page.getByText('E2E首屏剑客方案', { exact: true })).toBeVisible({ timeout: 5000 });
        await expect(presetLoadingBanner).toHaveCount(0);
        await expect(workshopLoadingBanner).toBeVisible();

        // 4. 开启同人融合 -> 启用附加小说分解，确认慢速小说数据集尚未返回时不误报“暂无”
        await page.getByText('启用同人融合', { exact: true }).locator('xpath=ancestor::div[2]//button').click();
        await page.getByRole('button', { name: '启用附加小说分解' }).first().click();
        await expect(page.getByText('正在读取已导入的小说分解数据集，请稍候…')).toBeVisible({ timeout: 2500 });

        releaseWorkshop();
        await expect(workshopLoadingBanner).toHaveCount(0, { timeout: 5000 });
        await expect(page.getByText('正在读取已导入的小说分解数据集，请稍候…')).toHaveCount(0, { timeout: 8000 });
        const datasetSelectButton = page.getByRole('button', { name: '选择附加小说数据集' });
        await expect(datasetSelectButton).toBeEnabled({ timeout: 5000 });
        await datasetSelectButton.click();
        await page.getByText('E2E长篇江湖录', { exact: true }).first().click();

        // 5. 进入步骤「02 天赋背景」(step === 1) 检查已保存自定义身份和天赋可见
        await page.getByRole('button', { name: /下一步/ }).click();
        await expect(page.getByText('已保存自定义身份')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('E2E游侠身份')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('已保存自定义天赋')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('E2E剑骨奇才')).toBeVisible({ timeout: 5000 });

        expect(filterRealErrors(errors)).toEqual([]);
    });

    test('移动端建角向导显示加载中并在无数据时自动收起空白区块', async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 390, height: 844 });
        const errors = collectErrors(page);
        await suppressReleaseNotesAndAttachDelayHook(page);

        await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
        await seedSettingsInIdb(page, [
            { key: 'app_theme', value: 'day', category: 'interface' },
            { key: 'new_game_custom_start_presets', value: [], category: 'customization' }
        ]);
        await page.evaluate(() => {
            localStorage.setItem('__e2eIdbDelayMap', JSON.stringify({
                new_game_custom_start_presets: 900
            }));
        });
        await page.route('**/api/workshop/modules*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 900));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, entries: [] })
            });
        });

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '本地游玩' }).click();
        await page.getByRole('button', { name: '踏入江湖' }).click();

        await expect(page.getByRole('status').filter({ hasText: '正在加载开局预设方案…' })).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('status').filter({ hasText: '正在加载创意工坊模式列表…' })).toBeVisible({ timeout: 5000 });

        await expect(page.getByText('开局预设方案')).toHaveCount(0, { timeout: 5000 });
        await expect(page.getByRole('status').filter({ hasText: '正在加载创意工坊模式列表…' })).toHaveCount(0, { timeout: 5000 });
        expect(filterRealErrors(errors)).toEqual([]);
    });

    test('联机模式首次清单 500 时持续展示读取中并自动重试成功，不闪现无存档', async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 1280, height: 800 });
        const errors = collectErrors(page);
        await suppressReleaseNotesAndAttachDelayHook(page);

        await page.route('**/api/cloud-play*', async (route) => {
            const url = new URL(route.request().url());
            if (url.searchParams.get('action') === 'login') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        user: {
                            userId: 'CP-E2E',
                            username: 'e2e-user',
                            clientSalt: 'e2e-salt',
                            manifestUrl: 'https://e2e.example/manifest.json',
                            manifestUpdatedAt: '2026-11-28T06:00:00.000Z'
                        }
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, exists: false })
            });
        });

        let manifestAttempts = 0;
        await page.route('https://e2e.example/manifest.json*', async (route) => {
            manifestAttempts += 1;
            if (manifestAttempts === 1) {
                await new Promise((resolve) => setTimeout(resolve, 600));
                await route.fulfill({ status: 500, body: 'temporary gateway error' });
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 700));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    format: 'moranjianghu-cloud-play',
                    saves: [
                        { cloudId: 'save-retry-1', title: '楚留香', timestamp: 2000 },
                        { cloudId: 'save-retry-2', title: '花满楼', timestamp: 1000 }
                    ]
                })
            });
        });

        await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
        await page.evaluate(({ sessionKey, riskKey, objKey }) => {
            localStorage.setItem(riskKey, 'true');
            localStorage.removeItem(objKey);
            localStorage.setItem(sessionKey, JSON.stringify({
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
                session: {
                    userId: 'CP-E2E',
                    username: 'e2e-user',
                    password: 'e2e-password',
                    clientSalt: 'e2e-salt',
                    manifestUrl: 'https://e2e.example/manifest.json',
                    manifestUpdatedAt: ''
                }
            }));
        }, { sessionKey: CLOUD_PLAY_SESSION_KEY, riskKey: CLOUD_PLAY_RISK_KEY, objKey: CLOUD_PLAY_OBJECT_MODE_KEY });

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '云端游玩' }).click();

        const cloudLoading = page.getByRole('status').filter({ hasText: '正在读取云端存档…' });
        await expect(cloudLoading).toBeVisible({ timeout: 5000 });
        await expect(page.getByText('暂无云端存档')).toHaveCount(0);

        await expect(page.getByText('楚留香')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('花满楼')).toBeVisible({ timeout: 5000 });
        expect(manifestAttempts).toBeGreaterThanOrEqual(2);
        expect(filterRealErrors(errors).filter((item) => !item.includes('500'))).toEqual([]);
    });

    test('世界观细化流式中断后会降级为真正的非流式请求（不再带 stream: true）', async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 1280, height: 800 });
        await suppressReleaseNotesAndAttachDelayHook(page);

        const aiRequests = [];
        await page.route('https://mock-worldgen.example/**', async (route) => {
            const req = route.request();
            if (req.method() === 'OPTIONS') {
                await route.fulfill({
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': '*'
                    }
                });
                return;
            }
            const body = JSON.parse(req.postData() || '{}');
            aiRequests.push({
                url: req.url(),
                stream: body.stream
            });

            if (aiRequests.length === 1) {
                // 首次流式请求只发送半截增量且无 finish_reason / [DONE]，触发流中断校验
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'text/event-stream'
                    },
                    body: 'data: {"choices":[{"delta":{"thinking":"先推演江湖格局"}}]}\n\ndata: {"choices":[{"delta":{"content":"{\\"世界背景\\":\\""}}]}\n\n'
                });
                return;
            }

            if (aiRequests.length === 2) {
                // 降级后的非流式世界观请求返回完整 JSON
                const worldJson = JSON.stringify({
                    世界观: '乱世江湖，双雄争锋。',
                    核心冲突: '朝廷暗卫与武林世家围绕兵符秘典展开明争暗斗。',
                    世界基调: '写实冷峻',
                    主要势力: ['天机阁', '镇抚司'],
                    地点概览: '江南烟雨镇与京畿重地'
                });
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: 'mock-worldgen-2',
                        choices: [{ message: { role: 'assistant', content: worldJson }, finish_reason: 'stop' }]
                    })
                });
                return;
            }

            // 后续开场正文请求返回最小合法响应即可
            await route.fulfill({
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: 'mock-opening',
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: '<thinking>ok</thinking>{"logs":[{"sender":"旁白","text":"细雨微凉，你踏入客栈。"}],"tavern_commands":[],"action_options":["四下打量"]}'
                        },
                        finish_reason: 'stop'
                    }]
                })
            });
        });

        await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
        const apiSettings = {
            activeConfigId: 'e2e-mock-worldgen',
            configs: [{
                id: 'e2e-mock-worldgen',
                名称: 'E2E Mock Worldgen',
                供应商: 'openai_compatible',
                协议覆盖: 'openai',
                baseUrl: 'https://mock-worldgen.example/v1',
                apiKey: 'mock-key',
                model: 'mock-model',
                maxTokens: 2048,
                temperature: 0.2,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }],
            功能模型占位: {
                主剧情使用模型: 'mock-model',
                世界演变功能启用: false,
                规划分析功能启用: false,
                地图生成功能启用: false,
                地图自动更新独立模型开关: false,
                文生图功能启用: false,
                NPC生图启用: false,
                场景生图启用: false,
                物品生图启用: false
            }
        };
        await seedSettingsInIdb(page, [
            { key: 'api_settings', value: apiSettings, category: 'api' },
            { key: 'new_game_custom_start_presets', value: [makePreset('e2e-worldgen-p1', 'E2E直开降级验证方案')], category: 'customization' }
        ]);
        await page.evaluate((settings) => {
            localStorage.setItem('moranjianghu.apiConfig.localMirror.v1', JSON.stringify(settings));
        }, apiSettings);

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '本地游玩' }).click();
        await page.getByRole('button', { name: '踏入江湖' }).click();
        await expect(page.getByText('E2E直开降级验证方案', { exact: true })).toBeVisible({ timeout: 5000 });

        await page.getByRole('button', { name: '以此方案开局' }).first().click();
        const confirmStartButton = page.getByRole('button', { name: '开始生成' });
        await expect(confirmStartButton).toBeVisible({ timeout: 5000 });
        await confirmStartButton.click();

        await expect.poll(() => aiRequests.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
        expect(aiRequests[0].stream).toBe(true);
        expect(aiRequests[1].stream).not.toBe(true);
    });
});
