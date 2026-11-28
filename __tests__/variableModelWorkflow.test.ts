import { describe, expect, it, vi } from 'vitest';
import { 执行变量模型校准工作流, 查找社交NPC索引 } from '../hooks/useGame/variableModelWorkflow';
import * as textAIService from '../services/ai/text';

vi.mock('../services/ai/text', () => ({
    generateVariableCalibrationUpdate: vi.fn()
}));

const 创建变量接口配置 = () => ({
    configs: [
        {
            id: 'main',
            name: '测试接口',
            apiKey: 'test-key',
            model: 'test-model',
            baseUrl: 'https://example.com/v1',
            供应商: 'openai',
            协议覆盖: 'auto'
        }
    ],
    currentConfigId: 'main',
    功能模型占位: {
        变量计算独立模型开关: true,
        变量计算渠道ID: 'main',
        变量计算使用模型: 'test-model'
    }
});

describe('variableModelWorkflow inventory commands', () => {
    it('仅闻名档案只按自己的姓名或曾用名匹配对话框', () => {
        const list = [{ 姓名: '周衡', 曾用名: ['周三爷'], 来源: '正文提及', 关系状态: '已闻其名', 简介: '李青提到：周衡正在追踪这批货。' }];
        expect(查找社交NPC索引(list, '李青')).toBe(-1);
        expect(查找社交NPC索引(list, '周三爷')).toBe(0);
        expect(查找社交NPC索引([...list, { 姓名: '李青' }], '李青')).toBe(1);
    });
    it.each(['李青', 'Mira Chan'])('主要人物本名 %s 优先于先出现的曾用名', name => {
        const heard = { 姓名: '周衡', 曾用名: [name], 来源: '正文提及', 关系状态: '已闻其名' };
        const other = { 姓名: '顾七', 曾用名: [name], 是否主要角色: true };
        const actual = { 姓名: name, 是否主要角色: true };
        expect(查找社交NPC索引([heard, other, actual], name)).toBe(2);
        expect(查找社交NPC索引([heard], name)).toBe(0);
    });
    it('keeps sub commands returned by the variable model so inventory quantities can be deducted', async () => {
        vi.mocked(textAIService.generateVariableCalibrationUpdate).mockResolvedValueOnce({
            commands: [
                { action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 }
            ],
            reports: ['消耗回气丹 1 枚。'],
            rawText: '<命令>sub 角色.物品列表[0].堆叠数量 = 1</命令>'
        } as any);

        const result = await 执行变量模型校准工作流({
            playerInput: '服用一枚回气丹。',
            parsedResponse: {
                logs: [{ sender: '旁白', text: '他服下一枚回气丹，药力化开。' }],
                tavern_commands: []
            } as any,
            baseState: {
                角色: {
                    姓名: '杨培强',
                    物品列表: [
                        { ID: 'pill_1', 名称: '回气丹', 堆叠数量: 3, 是否可堆叠: true }
                    ]
                },
                环境: {},
                世界: {},
                社交: [],
                战斗: {},
                玩家门派: {},
                任务列表: [],
                约定列表: []
            },
            promptPool: [],
            worldEvolutionEnabled: false
        }, {
            apiConfig: 创建变量接口配置(),
            gameConfig: {}
        });

        expect(result?.commands).toEqual([
            { action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 }
        ]);
    });
});

const 名字测试基态 = (社交: any[] = []) => ({
    角色: { 姓名: '杨培强' }, 环境: {}, 世界: {}, 社交,
    战斗: {}, 玩家门派: {}, 任务列表: [], 约定列表: []
});
const 运行姓名校验 = (commands: any[], options: { social?: any[]; playerInput?: string; playerName?: string; openingConfig?: any } = {}) => {
    vi.mocked(textAIService.generateVariableCalibrationUpdate).mockReset();
    vi.mocked(textAIService.generateVariableCalibrationUpdate).mockResolvedValue({ commands, reports: [], rawText: '<命令>测试姓名命令</命令>' } as any);
    return 执行变量模型校准工作流({
        playerInput: options.playerInput || '', parsedResponse: { logs: [], tavern_commands: [] } as any,
        baseState: { ...名字测试基态(options.social), 角色: { 姓名: options.playerName || '杨培强' } } as any, promptPool: [], worldEvolutionEnabled: false,
        openingConfig: options.openingConfig
    }, { apiConfig: 创建变量接口配置(), gameConfig: {} });
};

describe('变量生成模板姓名来源策略与重试', () => {
    it.each(['苏婉清', '赵平安'])('自由创造 %s 仍拒绝并自动重试一次', async name => {
        await expect(运行姓名校验([{ action: 'push', key: '社交', value: { 姓名: name } }])).rejects.toThrow('模板姓名黑名单');
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(vi.mocked(textAIService.generateVariableCalibrationUpdate).mock.calls[1])).toContain('自动重试：变量生成结果未通过前端校验');
    });
    it.each(['苏婉清', '赵灵儿', '赵平安', '林砚舟', '辛夷'])('已有 %s 更新与重复 push 不触发重试', async name => {
        const commands = [{ action: 'set', key: '社交[0].好感度', value: 20 }, { action: 'push', key: '社交', value: { id: 'npc-existing', 姓名: name } }];
        const result = await 运行姓名校验(commands, { social: [{ id: 'npc-existing', 姓名: name, 好感度: 0 }] });
        expect(result?.commands).toEqual(commands);
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(1);
    });
    it('完整社交数组重排不被黑名单或删除保护误判', async () => {
        const social = [{ id: 'female', 姓名: '苏婉清' }, { id: 'male', 姓名: '赵平安' }];
        const commands = [{ action: 'set', key: '社交', value: [...social].reverse() }];
        expect((await 运行姓名校验(commands, { social }))?.commands).toEqual(commands);
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(1);
    });
    it.each([['苏婉清', '新增一个角色，名字叫苏婉清'], ['赵平安', '创建一个叫赵平安的人物']])('明确指定 %s 不触发重试', async (name, playerInput) => {
        const commands = [{ action: 'push', key: '社交', value: { 姓名: name } }];
        expect((await 运行姓名校验(commands, { playerInput }))?.commands).toEqual(commands);
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(1);
    });
    it('普通对白引用仍不能放行自由生成模板名', async () => {
        await expect(运行姓名校验([{ action: 'push', key: '社交', value: { 姓名: '苏婉清' } }], { playerInput: '我敲门：“苏婉清，在吗？”' })).rejects.toThrow('模板姓名黑名单');
    });
    it('开局配置伙伴及后续回合采用相同来源豁免', async () => {
        const commands = [{ action: 'push', key: '社交', value: { 姓名: '苏婉清' } }];
        expect((await 运行姓名校验(commands, { openingConfig: { 初始伙伴: { 姓名: '苏婉清', enabled: true } } }))?.commands).toEqual(commands);
        expect((await 运行姓名校验(commands, { social: [{ 姓名: '苏婉清' }] }))?.commands).toEqual(commands);
    });
    it('姓名豁免不绕过既有 NPC 改名/删除或主角同名保护', async () => {
        const social = [{ id: 'old', 姓名: '江婉' }];
        await expect(运行姓名校验([{ action: 'set', key: '社交[0].姓名', value: '苏婉清' }], { social, playerInput: '新角色叫苏婉清' })).rejects.toThrow('改写');
        await expect(运行姓名校验([{ action: 'delete', key: '社交[0]', value: null }], { social })).rejects.toThrow('删除');
        await expect(运行姓名校验([{ action: 'push', key: '社交', value: { 姓名: '杨培强' } }], { playerInput: '新角色叫杨培强' })).rejects.toThrow('主角');
    });
    it('整体 set 同 ID 改名即使得到用户模板名豁免也会拒绝并重试', async () => {
        const social = [{ id: 'NPC001', 姓名: '江婉' }];
        await expect(运行姓名校验([{ action: 'set', key: 'gameState.社交', value: [{ id: 'NPC001', 姓名: '苏婉清' }] }], {
            social, playerInput: '新增一个角色，名字叫苏婉清'
        })).rejects.toThrow('改写');
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(2);
    });
    it('整体 set 占位姓名允许通过稳定 ID 补全真名', async () => {
        const commands = [{ action: 'set', key: '社交', value: [{ id: 'NPC001', 姓名: '陈成' }] }];
        expect((await 运行姓名校验(commands, { social: [{ id: 'NPC001', 姓名: '角色9' }] }))?.commands).toEqual(commands);
    });
    it.each([
        { action: 'push', key: '社交', value: { 姓名: 'O’Connor' } },
        { action: 'add', key: '社交', value: { 姓名: 'O’Connor' } },
        { action: 'set', key: '社交[0]', value: { 姓名: 'O’Connor' } },
        { action: 'set', key: '社交', value: [{ 姓名: 'O’Connor' }] },
        { action: 'set', key: '社交[0].姓名', value: 'O’Connor' }
    ])('主角撇号变体在变量命令 $action $key 被拒绝并重试', async cmd => {
        await expect(运行姓名校验([cmd], { playerName: "O'Connor", social: [{ id: 'NPC001', 姓名: '江婉' }] })).rejects.toThrow('主角');
        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(2);
    });
    it('主角 Emily Carter 不会阻止 EmilyCarter 新增', async () => {
        const commands = [{ action: 'push', key: '社交', value: { 姓名: 'EmilyCarter' } }];
        expect((await 运行姓名校验(commands, { playerName: 'Emily Carter' }))?.commands).toEqual(commands);
    });
    it.each([['Alex', 'Alexander'], ['Ann', 'Anna']])('真实变量请求审计 %s 不会错误更新 %s 的档案', async (sender, existingName) => {
        vi.mocked(textAIService.generateVariableCalibrationUpdate).mockReset();
        vi.mocked(textAIService.generateVariableCalibrationUpdate).mockResolvedValue({ commands: [], reports: [], rawText: '<命令></命令>' } as any);
        await 执行变量模型校准工作流({
            playerInput: '与来者交谈', parsedResponse: { logs: [{ sender, text: '“你好。”' }], tavern_commands: [] } as any,
            baseState: 名字测试基态([{ 姓名: existingName, 身份: sender }]) as any,
            promptPool: [], worldEvolutionEnabled: false
        }, { apiConfig: 创建变量接口配置(), gameConfig: {} });
        const prompt = JSON.stringify(vi.mocked(textAIService.generateVariableCalibrationUpdate).mock.calls[0]);
        expect(prompt).toContain(`${sender}：本回合有独立对白框`);
        expect(prompt).not.toContain(`${sender}：已匹配`);
    });
});
