import { afterEach, describe, expect, it, vi } from 'vitest';
import { 生成地图更新, 解析地图自动更新命令, 构建地图层级替换结果 } from '../hooks/useGame/mapUpdateWorkflow';

vi.mock('../services/ai/chatCompletionClient', async () => {
    const actual = await vi.importActual<any>('../services/ai/chatCompletionClient');
    return {
        ...actual,
        请求模型文本: vi.fn()
    };
});

vi.mock('../utils/apiConfig', async () => {
    const actual = await vi.importActual<any>('../utils/apiConfig');
    return {
        ...actual,
        获取地图生成接口配置: vi.fn((settings: any) => settings?.configs?.[0] || null),
        获取地图自动更新接口配置: vi.fn((settings: any) => settings?.configs?.[0] || null),
        接口配置是否可用: vi.fn((api: any) => Boolean(api?.baseUrl && api?.apiKey && api?.model))
    };
});

vi.mock('../services/diagnosticLog', () => ({
    recordDiagnosticLog: vi.fn()
}));

const { 请求模型文本 } = await import('../services/ai/chatCompletionClient');
const { recordDiagnosticLog } = await import('../services/diagnosticLog');

afterEach(() => {
    vi.useRealTimers();
    vi.mocked(请求模型文本).mockReset();
    vi.mocked(recordDiagnosticLog).mockReset();
});

describe('地图自动更新解析', () => {
    const 客栈地图 = [
        { ID: 'DT-001', 名称: '江湖', 层级: '寰宇', 父级ID: '' },
        { ID: 'DT-012', 名称: '龙门客栈', 层级: '区地点', 父级ID: 'DT-001' },
        { ID: 'DT-018', 名称: '悦来客栈', 层级: '区地点', 父级ID: 'DT-001' },
        { ID: 'DT-025', 名称: '客房', 层级: '子地点', 父级ID: 'DT-012' }
    ];
    const push = (node: object) => 'push 世界.地图层级 = ' + JSON.stringify(node);

    const 更新分支 = (地图层级: object[], rawText: string) => 生成地图更新({
        mode: 'auto_incremental', apiSettings: { 功能模型占位: {} } as any, 环境: {} as any,
        世界: { 地图层级 } as any, worldbooks: [], prefetchedRawText: rawText
    });
    it('逐回合增加大区时须在同一批命令中补足其直接分支，失败不落部分数据', async () => {
        const region = { ID: 'newregion', 名称: '塞外', 层级: '中地点', 父级ID: '' };
        const town = (name: string) => ({ 名称: name, 层级: '小地点', 父级ID: 'newregion' });
        const invalid = await 更新分支([], [push(region), push(town('朔方')), push(town('朔方'))].join('\n'));
        expect(invalid).toMatchObject({ ok: false, phase: 'error', commands: [] });
        expect(invalid.statusText).toContain('塞外');
        const valid = await 更新分支([], [push(region), push(town('朔方')), push(town('云中'))].join('\n'));
        expect(valid.ok).toBe(true);
        expect(valid.commands).toHaveLength(3);
        const addAlias = await 更新分支([], [push(region).replace(/^push/, 'add'), push(town('朔方'))].join('\n'));
        expect(addAlias).toMatchObject({ ok: false, commands: [] });
        expect(addAlias.statusText).toContain('塞外');
    });

    it('老档已有缺口时允许登记房间通路并逐步补地图，已有分支不能进一步减少', async () => {
        const region = { ID: 'r', 名称: '西境', 层级: '中地点', 父级ID: '' };
        const room = { ID: 'a', 名称: '前堂', 层级: '子地点', 父级ID: 'inn' };
        const a = { ID: 'a1', 名称: '玉门', 层级: '小地点', 父级ID: 'r' };
        const layers = [region, a, room];
        expect((await 更新分支(layers, 'set 世界.地图层级[2].连通房间 = ["后堂"]')).ok).toBe(true);
        expect((await 更新分支(layers, 'push 世界.地图层级[2].连通房间 = "后堂"')).commands)
            .toEqual([{ action: 'push', key: '世界.地图层级[2].连通房间', value: '后堂' }]);
        expect((await 更新分支([region, room], push(a))).ok).toBe(true);
        for (const command of ['delete 世界.地图层级[1]', 'set 世界.地图层级[1].父级ID = "other"', 'set 世界.地图层级[1] = {"层级":"区地点"}']) {
            const invalid = await 更新分支(layers, command);
            expect(invalid).toMatchObject({ ok: false, commands: [] });
            expect(invalid.statusText).toContain('西境');
        }
        expect(layers[1]).toEqual(a);
    });

    it('中间穿插 set 时，后续房间仍通过同一响应的建筑别名绑定父节点', () => {
        const input = [
            push({ ID: 'inn-C', 名称: '云来客栈', 层级: '区地点', 父级ID: 'DT-001' }),
            'set 世界.地图层级[0].描述 = "旧地图修订"',
            push({ 名称: '云来药房', 层级: '子地点', 父级ID: 'inn-C' })
        ];
        const commands = 解析地图自动更新命令(input.join('\n'), { 地图层级: 客栈地图 });
        expect(commands.map(c => c.action)).toEqual(['push', 'set', 'push']);
        expect(commands[2].value.父级ID).toBe(commands[0].value.ID);
    });

    it('全图重建保留旧 ID，区分异父同名房间，并解析本批父节点的原 ID 或名称', () => {
        const input = [
            { ID: 'room-B', 名称: '客房', 层级: '子地点', 父级ID: 'inn-B' },
            { 名称: '客房', 层级: '子地点', 父级ID: '悦来客栈' },
            { 名称: '客房', 层级: '子地点', 父级ID: 'DT-012' },
            { ID: 'inn-B', 名称: '悦来客栈', 层级: '区地点', 父级ID: '江湖' },
            { 名称: '龙门客栈', 层级: '区地点', 父级ID: 'DT-001' },
            { 名称: '江湖', 层级: '寰宇', 父级ID: '' }
        ];
        const nodes = 构建地图层级替换结果(input, { 地图层级: 客栈地图 });
        expect(nodes).toHaveLength(5);
        expect(new Set(nodes.map(n => n.ID)).size).toBe(5);
        expect(nodes).toEqual(expect.arrayContaining(客栈地图.map(n => expect.objectContaining(n))));
        const second = nodes.find(n => n.名称 === '客房' && n.父级ID === 'DT-018');
        expect(second?.ID).toMatch(/^DT-\d+$/);
        expect(构建地图层级替换结果(input, { 地图层级: nodes })).toEqual(nodes);
    });

    it('增量更新仅去重同父同层地点；新地点可立即通过原 ID 引用，并能整批重放', () => {
        const raw = [
            push({ 名称: '客房', 层级: '子地点', 父级ID: 'DT-012' }),
            push({ 名称: '客房', 层级: '子地点', 父级ID: '悦来客栈' }),
            push({ 名称: '客房', 层级: '子地点', 父级ID: 'DT-018' }),
            push({ 名称: '客房', 层级: '子地点', 父级ID: 'inn-C' }),
            push({ ID: 'inn-C', 名称: '云来客栈', 层级: '区地点', 父级ID: '江湖' })
        ].join('\n');
        const commands = 解析地图自动更新命令(raw, { 地图层级: 客栈地图 });
        expect(commands).toHaveLength(3);
        const added = commands.map(command => command.value);
        const inn = added.find(n => n.名称 === '云来客栈');
        expect(inn?.ID).toMatch(/^DT-\d+$/);
        expect(added.filter(n => n.名称 === '客房').map(n => n.父级ID)).toEqual(['DT-018', inn.ID]);
        expect(new Set([...客栈地图, ...added].map(n => n.ID)).size).toBe(7);
        expect(解析地图自动更新命令(raw, { 地图层级: [...客栈地图, ...added] })).toEqual([]);
    });

    it('旧档孤立的唯一地点补回父级后保留 ID，显式全图 set 保留位置数据', () => {
        const world = { 地图层级: [{ ID: 'DT-107', 名称: '旧渡口', 层级: '区地点', 父级ID: '' }] };
        const input = [
            { ID: 'DT-002', 名称: '青河镇', 层级: '小地点', 父级ID: '' },
            { 名称: '旧渡口', 层级: '区地点', 父级ID: '青河镇', 锚点坐标: { x: 41, y: 53 }, 归属: { 小地点: '青河镇' } }
        ];
        const [command] = 解析地图自动更新命令('set 世界.地图层级 = ' + JSON.stringify(input), world);
        expect(command.value.find((n: any) => n.名称 === '旧渡口')).toMatchObject({
            ID: 'DT-107', 父级ID: 'DT-002', 锚点坐标: { x: 41, y: 53 }, 归属: { 小地点: '青河镇' }
        });
    });

    it.each([
        ['{"地点树":[]}', 'error'],
        ['{"地点树":[{"描述":"没有有效地名"}]}', 'error'],
        ['{"错误":"响应不符合地图协议"}', 'error'],
        ['<命令>push 世界.地图层级 = {"名称":"青河镇","层级":"小地点"}</命令>', 'done']
    ])('保留已有地图，并区分损坏输出与已收录地点 %s', async (rawText, phase) => {
        const world = { 地图层级: [{ ID: 'DT-006', 名称: '青河镇', 层级: '小地点' }] };
        expect(解析地图自动更新命令(rawText, world)).toEqual([]);
        const result = await 生成地图更新({
            mode: 'auto_incremental', apiSettings: { 功能模型占位: {} } as any,
            世界: world as any, 环境: {} as any, worldbooks: [], prefetchedRawText: rawText
        });
        expect(result).toMatchObject({ phase, commands: [], ok: phase === 'done' });
    });

    it('兼容模型返回思考块加地点树 JSON 的全量同步格式', () => {
        const currentWorld = {
            地图层级: [
                { ID: 'DT-001', 名称: '主神空间', 层级: '寰宇', 父级ID: '', 描述: '旧描述' },
                { ID: 'DT-002', 名称: '主神广场', 层级: '大地点', 父级ID: 'DT-001', 描述: '旧描述' }
            ]
        };
        const rawText = [
            '<思考>',
            '本回合新增任务世界、封门村与东偏厅，需要同步地点树。',
            '</思考>',
            JSON.stringify({
                地点树: [
                    { 名称: '主神空间', 层级: '寰宇', 父级ID: '', 描述: '一切轮回的起点。' },
                    { 名称: '主神广场', 层级: '大地点', 父级ID: '主神空间', 描述: '主神光球所在广场。' },
                    { 名称: '任务世界<荒怨>', 层级: '大地点', 父级ID: '主神空间', 描述: '充满诡异气息的任务世界。' },
                    { 名称: '封门村区域', 层级: '中地点', 父级ID: '任务世界<荒怨>', 描述: '被雾气笼罩的荒野区域。' },
                    { 名称: '封门村', 层级: '小地点', 父级ID: '封门村区域', 描述: '死寂的诡异村落。' },
                    { 名称: '荒废古宅', 层级: '区地点', 父级ID: '封门村', 描述: '民国风破败老宅。' },
                    { 名称: '东偏厅', 层级: '子地点', 父级ID: '荒废古宅', 描述: '光线昏暗的偏厅。' }
                ]
            }, null, 2)
        ].join('\n');

        const commands = 解析地图自动更新命令(rawText, currentWorld);

        expect(commands).toHaveLength(1);
        expect(commands[0]).toMatchObject({
            action: 'set',
            key: '世界.地图层级'
        });
        expect(commands[0].value).toEqual(expect.arrayContaining([
            expect.objectContaining({ ID: 'DT-001', 名称: '主神空间', 层级: '寰宇' }),
            expect.objectContaining({ ID: 'DT-002', 名称: '主神广场', 层级: '大地点', 父级ID: 'DT-001' }),
            expect.objectContaining({ 名称: '东偏厅', 层级: '子地点' })
        ]));
    });

    it('push 命令不保留「在场人物」字段（人物显示由社交 NPC 位置驱动）', () => {
        const currentWorld = { 地图层级: [] };
        const rawText = [
            '<命令>',
            'push 世界.地图层级 = {"名称":"队伍房间","层级":"小地点","父级ID":"DT-001","描述":"小队驻地。","在场人物":["杨培强"]}',
            '</命令>'
        ].join('\n');
        const commands = 解析地图自动更新命令(rawText, currentWorld);
        expect(commands).toHaveLength(1);
        expect(commands[0].value).toMatchObject({ 名称: '队伍房间', 层级: '小地点' });
        // 方案 A：地图层级节点不应携带「在场人物」字段
        expect(commands[0].value).not.toHaveProperty('在场人物');
    });
});

describe('构建地图层级替换结果 — 不保留「在场人物」', () => {
    it('即便输入节点带「在场人物」，结果节点也不携带该字段', () => {
        const rawNodes = [
            { 名称: '主神空间', 层级: '寰宇', 父级ID: '', 描述: '', 在场人物: [] },
            { 名称: '队伍房间', 层级: '小地点', 父级ID: '主神空间', 描述: '', 在场人物: ['杨培强', '俞月荷'] }
        ];
        const result = 构建地图层级替换结果(rawNodes);
        const room = result.find(r => r.名称 === '队伍房间');
        expect(room).toBeDefined();
        expect(room.层级).toBe('小地点');
        // 方案 A：地图层级节点不应携带「在场人物」字段，人物显示走社交 NPC 位置链路
        expect(room).not.toHaveProperty('在场人物');
    });

    it('势力标签等地点属性仍正常保留', () => {
        const rawNodes = [
            { 名称: '诸天万界', 层级: '寰宇', 父级ID: '', 描述: '' },
            { 名称: '悦来客栈', 层级: '区地点', 父级ID: '诸天万界', 描述: '客栈。', 控制势力: '商会', 势力标签: ['商会', '帮会'] }
        ];
        const result = 构建地图层级替换结果(rawNodes);
        const inn = result.find(r => r.名称 === '悦来客栈');
        expect(inn).toBeDefined();
        expect(inn.控制势力).toBe('商会');
        expect(inn.势力标签).toEqual(['商会', '帮会']);
        expect(inn).not.toHaveProperty('在场人物');
    });
});

describe('地图更新请求兜底超时', () => {
    it('记录地图更新请求边界日志，方便定位卡住阶段', async () => {
        vi.mocked(请求模型文本).mockResolvedValue([
            '<thinking>无需新增地点。</thinking>',
            '<说明>- 本回合没有新增长期地点。</说明>',
            '<命令>无</命令>'
        ].join('\n'));

        const result = await 生成地图更新({
            mode: 'auto_incremental',
            apiSettings: {
                configs: [{
                    id: 'map',
                    名称: '地图测试接口',
                    供应商: 'openai_compatible',
                    协议覆盖: 'openai',
                    baseUrl: 'https://example.test/v1',
                    apiKey: 'test-key',
                    model: 'test-model'
                }],
                功能模型占位: {
                    地图生成功能启用: true
                }
            } as any,
            环境: { 大地点: '云岫剑宗', 具体地点: '青瓦木屋' } as any,
            世界: { 地图层级: [{ ID: 'DT-001', 名称: '云岫剑宗', 层级: '大地点' }] } as any,
            社交: [{ 姓名: '俞月荷' }],
            角色: { 姓名: '测试少侠' },
            gameConfig: {},
            worldbooks: [],
            currentResponse: { logs: [{ sender: '旁白', text: '清晨醒来。' }], tavern_commands: [] } as any
        });

        expect(result.phase).toBe('error');
        expect(result.statusText).toContain('云岫剑宗');
        const logText = vi.mocked(recordDiagnosticLog).mock.calls
            .map((call) => JSON.stringify(call))
            .join('\n');
        expect(logText).toContain('[地图更新] stage-start');
        expect(logText).toContain('[地图更新] request-start');
        expect(logText).toContain('[地图更新] request-success');
        expect(logText).toContain('[地图更新] auto-incremental-parsed');
        expect(logText).toContain('existingLayerCount');
        expect(logText).toContain('baseUrlHost');
        expect(logText).not.toContain('test-key');
    });

    it('底层地图模型请求无响应时返回超时跳过结果，避免后台队列永久卡住', async () => {
        vi.useFakeTimers();
        vi.mocked(请求模型文本).mockImplementation(() => new Promise<string>(() => undefined));

        const resultPromise = 生成地图更新({
            mode: 'auto_incremental',
            apiSettings: {
                configs: [{
                    id: 'map',
                    名称: '地图测试接口',
                    供应商: 'openai_compatible',
                    协议覆盖: 'openai',
                    baseUrl: 'https://example.test/v1',
                    apiKey: 'test-key',
                    model: 'test-model'
                }],
                功能模型占位: {
                    地图生成功能启用: true
                }
            } as any,
            环境: { 大地点: '云岫剑宗', 具体地点: '青瓦木屋' } as any,
            世界: { 地图层级: [] } as any,
            社交: [],
            角色: { 姓名: '测试少侠' },
            gameConfig: {},
            worldbooks: [],
            currentResponse: { logs: [{ sender: '旁白', text: '清晨醒来。' }], tavern_commands: [] } as any
        });

        await vi.advanceTimersByTimeAsync(125_000);
        const result = await resultPromise;

        expect(result).toMatchObject({
            ok: false,
            phase: 'skipped',
            commands: []
        });
        expect(result.statusText).toMatch(/超时|跳过|地图更新/);
        const logText = vi.mocked(recordDiagnosticLog).mock.calls
            .map((call) => JSON.stringify(call))
            .join('\n');
        expect(logText).toContain('[地图更新] request-start');
        expect(logText).toContain('[地图更新] request-timeout-skip');
        expect(logText).not.toContain('test-key');
    });
});
