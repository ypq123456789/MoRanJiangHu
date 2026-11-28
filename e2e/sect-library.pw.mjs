import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { preview } from 'vite';

const template = JSON.parse(readFileSync(new URL('./fixtures/desktop-compact-save.json', import.meta.url), 'utf8'));
const book = { id: 'book-spring', 名称: '引泉诀', 类型: '心法', 品阶: '上品', 简介: '循泉声引气', 要求职位: '杂役弟子', 要求累计贡献: 10 };
const draft = '先问守阁师兄。';
let server;
let site;

test.beforeAll(async () => {
    server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    site = 'http://127.0.0.1:' + server.httpServer.address().port;
});
test.afterAll(async () => { await server?.close(); });
test.use({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });

async function loadSectSave(page, inside) {
    const save = structuredClone(template);
    Object.assign(save.角色数据, { 姓名: '沈砚', 所属门派ID: 'sect1', 门派职位: '杂役弟子', 门派贡献: 30, 功法列表: [] });
    save.游戏设置 = { 启用2_0剧情引擎: true, 启用行动选项: false, 启用修炼体系: true, 字数不足处理方式: '仅提示' };
    save.导演圣经 = {};
    save.玩家门派 = { ID: 'sect1', 名称: '青崖真宫', 玩家职位: '杂役弟子', 累计贡献: 30, 玩家贡献: 30, 藏经阁列表: [book] };
    save.世界.地图层级 = [
        { ID: 'world', 名称: '九州', 层级: '寰宇' },
        { ID: 'town', 名称: '青萍镇', 层级: '小地点', 父级ID: 'world', 控制势力: '青崖真宫' },
        { ID: 'hall', 名称: '观澜院', 层级: '区地点', 父级ID: 'town', 控制势力: '青崖真宫' },
        { ID: 'room', 名称: '书房', 层级: '子地点', 父级ID: 'hall' },
        { ID: 'inn', 名称: '悦来客栈', 层级: '区地点', 父级ID: 'town' }
    ];
    save.世界.势力列表 = [{ ID: 'sect1', 名称: '青崖真宫', 地盘归属: '青萍镇' }];
    Object.assign(save.环境信息, { 大地点: '九州', 中地点: '', 小地点: '青萍镇', 具体地点: '',
        区地点: inside ? '观澜院' : '悦来客栈', 子地点: inside ? '书房' : '' });
    save.历史记录 = [{ role: 'assistant', content: 'Structured Response', structuredResponse: { logs: [{ sender: '旁白', text: '沈砚展开随身的书札。' }] } }];
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === site && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    await page.routeWebSocket('**/*', () => {});
    await page.addInitScript(() => localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10)));
    await page.goto(site + '/?skipReleaseNotes=1');
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
    await page.evaluate(async save => {
        const api = { activeConfigId: 'local', configs: [{ id: 'local', 名称: '模拟模型', 供应商: 'openai_compatible', 协议覆盖: 'openai',
            baseUrl: location.origin + '/v1', apiKey: 'mock', model: 'story' }],
            功能模型占位: { 主剧情使用模型: 'story', 变量计算独立模型开关: true, 变量计算使用模型: 'variable', 地图生成功能启用: false, 文生图功能启用: false } };
        localStorage.setItem('moranjianghu.apiConfig.localMirror.v1', JSON.stringify(api));
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('WuxiaGameDB');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const tx = db.transaction(['settings', 'saves', 'save_summaries'], 'readwrite');
        tx.objectStore('settings').put({ key: 'api_settings', value: api });
        tx.objectStore('settings').put({ key: 'app_theme', value: 'day' });
        tx.objectStore('saves').put(save);
        const { id, 类型, 时间戳, 角色数据, 元数据, 游戏初始时间, 环境信息 } = save;
        tx.objectStore('save_summaries').put({ id, 类型, 时间戳, 角色数据, 元数据, 游戏初始时间, 环境信息 });
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
        db.close();
    }, save);
    await page.reload();
    await page.getByRole('button', { name: '本地游玩', exact: true }).click();
    await page.getByRole('button', { name: '重入江湖', exact: true }).click();
    await page.getByText(/点击本系列会直接读取最新存档/).first().click();
    await page.getByRole('button', { name: '读取', exact: true }).last().click();
    await expect(page.locator('.desktop-game-frame')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
}

async function openLibrary(page, inside) {
    const sect = page.getByRole('button', { name: '门派', exact: true });
    if (!await sect.isVisible()) await page.getByRole('button', { name: /江湖舆图/ }).click();
    await sect.click();
    for (const tab of ['聚宝阁', '藏经阁']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await expect(page.getByText(inside ? '当前位于青崖真宫' : '当前不在青崖真宫', { exact: true })).toBeVisible();
    }
    return page.getByText(book.名称, { exact: true }).locator('xpath=ancestor::div[.//button][1]').getByRole('button');
}

test('同镇客栈显示门外，两阁中不能开始研习', async ({ page }) => {
    await loadSectSave(page, false);
    await expect(await openLibrary(page, false)).toBeDisabled();
});

for (const learned of [true, false]) {
    test('门内保留草稿并按回合结果登记功法：' + (learned ? '学成' : '未成'), async ({ page }) => {
        test.setTimeout(60000);
        await loadSectSave(page, true);
        const calls = [];
        const memory = learned ? '沈砚学成引泉诀。' : '本次未能学成。';
        await page.route('**/v1/chat/completions', async route => {
            const { messages, model, stream } = route.request().postDataJSON();
            const prompt = messages.map(message => message.content).join('\n');
            let reply;
            if (model === 'variable') {
                calls.push({ stage: '变量', prompt });
                const cmd = learned ? 'push 角色.功法列表 = ' + JSON.stringify({ 名称: book.名称, 来源藏经ID: book.id, 类型: '内功', 品质: book.品阶, 当前重数: 1 }) : '无';
                reply = '<thinking>核对研习结果。</thinking><说明>核对功法。</说明><命令>' + cmd + '</命令>';
            } else if (prompt.includes('只输出合法 JSON（包裹在 <导演更新JSON>')) {
                reply = '<导演更新JSON>{"环境变更":{"推进分钟数":5},"主角变化":{},"动态重规划":{"需要重规划":false}}</导演更新JSON>';
            } else {
                calls.push({ stage: '正文', prompt });
                reply = '<正文>【旁白】守阁师兄听沈砚说完来意，递过典籍，指点他循图运气。' + memory + '</正文><短期记忆>' + memory + '</短期记忆>';
            }
            const verification = prompt.match(/原样输出校验标记 (\[CTXCHK:[a-z0-9]+\])/u)?.[1];
            if (verification) reply += '\n' + verification;
            const result = { choices: [{ message: { content: reply } }] };
            const chunk = { choices: [{ index: 0, delta: { content: reply }, finish_reason: 'stop' }] };
            await route.fulfill(stream
                ? { contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n' }
                : { json: result });
        });
        const input = page.locator('textarea[placeholder="输入你的行动..."]:visible');
        await input.fill(draft);
        await (await openLibrary(page, true)).click();
        await expect(input).toHaveValue(/^先问守阁师兄。\n【门派研习】我在青崖真宫申请研习《引泉诀》/);
        expect(calls).toHaveLength(0);
        await page.getByRole('button', { name: '发送', exact: true }).click();
        await expect.poll(() => calls.find(call => call.stage === '正文')?.prompt).toContain(draft + '\n【门派研习】');
        await expect.poll(() => calls.find(call => call.stage === '变量')?.prompt).toContain(book.id);
        // 等待新的自动存档完成也能验证“未成”分支，避免只看到回合开始前的空列表。
        await expect.poll(() => page.evaluate(async ({ expectedMemory, bookName }) => {
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('WuxiaGameDB');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const rows = await new Promise((resolve, reject) => {
                const req = db.transaction('saves').objectStore('saves').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            db.close();
            const saved = rows.find(row => row.类型 === 'auto' && row.历史记录?.some(turn => turn.structuredResponse?.shortTerm === expectedMemory));
            if (!saved) return null;
            return { contribution: saved.玩家门派?.累计贡献, skills: (saved.角色数据.功法列表 || []).filter(skill => skill.名称 === bookName).map(skill => [skill.来源藏经ID, skill.当前重数]) };
        }, { expectedMemory: memory, bookName: book.名称 }), { timeout: 18000 }).toEqual({ contribution: 30, skills: learned ? [[book.id, 1]] : [] });
        const button = await openLibrary(page, true);
        await expect(button).toHaveText(learned ? '已学习' : '学习');
        if (learned) await expect(button).toBeDisabled();
        else await expect(button).toBeEnabled();
    });
}
