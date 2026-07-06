import { describe, expect, it } from 'vitest';
import { normalizeStateCommandKey } from '../utils/stateHelpers';
import { 校验变量命令是否登记 } from '../utils/variableRegistry';
import {
    构建世界演变上下文文本,
    是否后台世界工程描述,
    提取正文势力补录线索,
    整理客户可见世界大事,
    整理世界状态客户可见大事,
    规范化世界演变命令列表
} from '../hooks/useGame/worldEvolutionUtils';
import { 解析世界演变响应 } from '../services/ai/storyTasks';

describe('worldEvolution visible events', () => {
    it('filters internal world-maintenance notes from player-visible world events', () => {
        const updates = 整理客户可见世界大事([
            '建立活跃 NPC 列表：初始化杨镇远（叔父）作为后台活跃对象，正在演武场准备考校。',
            '建立待执行事件：将“晨间剑法考校”正式纳入后台待执行事件池，计划 07:00 触发。',
            '青云门与铁衣帮在洛水渡口争夺镖路，三家商队暂停北上。',
            '黑市传出玄铁残卷流入临安拍卖行，引动数派暗探。'
        ]);

        expect(updates).toEqual([
            '青云门与铁衣帮在洛水渡口争夺镖路，三家商队暂停北上。',
            '黑市传出玄铁残卷流入临安拍卖行，引动数派暗探。'
        ]);
        expect(是否后台世界工程描述('建立活跃 NPC 列表：初始化杨镇远（叔父）作为后台活跃对象。')).toBe(true);
    });

    it('synthesizes Jianghu-scale visible news from faction commands when model notes are internal', () => {
        const commands = 规范化世界演变命令列表([
            {
                action: 'push',
                key: '世界.势力互动历史',
                value: {
                    类型: '争夺',
                    参与势力: ['青云门', '铁衣帮'],
                    事件摘要: '双方在洛水渡口争夺镖路，三家商队暂停北上。',
                    流出物品: []
                }
            },
            {
                action: 'push',
                key: '世界.拍卖行待投放物品',
                value: { 名称: '玄铁残卷', 类型: '秘籍', 品质: '稀世' }
            }
        ] as any);

        const updates = 整理客户可见世界大事([
            '建立待执行事件：将“晨间剑法考校”正式纳入后台待执行事件池。'
        ], commands);

        expect(updates[0]).toContain('青云门、铁衣帮发生争夺');
        expect(updates[1]).toContain('玄铁残卷');
        expect(updates.join('\n')).not.toContain('待执行事件');
    });

    it('allows faction-related world evolution paths', () => {
        expect(normalizeStateCommandKey('势力列表')).toBe('gameState.世界.势力列表');
        expect(normalizeStateCommandKey('势力互动历史')).toBe('gameState.世界.势力互动历史');
        expect(normalizeStateCommandKey('拍卖行待投放物品')).toBe('gameState.世界.拍卖行待投放物品');

        const commands = 规范化世界演变命令列表([
            {
                action: 'set',
                key: '世界.势力列表',
                value: [{ ID: 'qingyun', 名称: '青云门' }]
            },
            {
                action: 'push',
                key: '势力互动历史',
                value: { 事件摘要: '青云门与铁衣帮互相试探。' }
            },
            {
                action: 'push',
                key: '拍卖行待投放物品',
                value: { 名称: '玄铁残卷', 类型: '秘籍', 品质: '稀世' }
            }
        ] as any);

        expect(commands.map((cmd) => cmd.key)).toEqual([
            'gameState.世界.势力列表',
            'gameState.世界.势力互动历史',
            'gameState.世界.拍卖行待投放物品'
        ]);
    });

    it('keeps ticker-style world state news immersive and hides local maintenance events', () => {
        const updates = 整理世界状态客户可见大事({
            进行中事件: [
                {
                    类型: '日常',
                    事件名: '晨间剑法考校',
                    事件说明: '杨镇远正在演武场准备考校。',
                    当前进展: '叔父正在院中等候。'
                }
            ],
            势力列表: [
                { ID: 'qingyun', 名称: '青云门' },
                { ID: 'tieyi', 名称: '铁衣帮' }
            ],
            势力互动历史: [
                {
                    类型: '争夺',
                    参与势力: ['青云门', '铁衣帮'],
                    事件摘要: '双方在洛水渡口争夺镖路，三家商队暂停北上。'
                }
            ],
            拍卖行待投放物品: [
                { 名称: '玄铁残卷', 类型: '秘籍', 品质: '稀世' }
            ]
        });

        expect(updates.join('\n')).toContain('青云门、铁衣帮发生争夺');
        expect(updates.join('\n')).toContain('玄铁残卷');
        expect(updates.join('\n')).not.toContain('晨间剑法考校');
        expect(updates.join('\n')).not.toContain('演武场');
    });

    it('registers opening faction paths when world state is included in variable generation base state', () => {
        const baseState = {
            角色: {},
            环境: {},
            社交: [],
            战斗: {},
            玩家门派: {},
            任务列表: [],
            约定列表: [],
            世界: {
                势力列表: [],
                势力互动历史: [],
                拍卖行待投放物品: []
            }
        };

        expect(校验变量命令是否登记({
            action: 'set',
            key: '世界.势力列表',
            value: [{ ID: 'qingyun', 名称: '青云门' }]
        }, baseState as any).allowed).toBe(true);
    });

    it('keeps world-evolution commands when the command block closes with an English tag', () => {
        const parsed = 解析世界演变响应([
            '<thinking>初始化世界事件。</thinking>',
            '<说明>',
            '- 江湖暗流开始浮现。',
            '</说明>',
            '<命令>',
            'push 世界.进行中事件 = {"事件名":"九幽魔宗暗流渗透","类型":"渗透","事件说明":"魔宗细作潜入太玄山脉周边。","当前进展":"已建立临时联络点。"}',
            'push 世界.世界镜头规划 = {"镜头标题":"大乾烽火","镜头内容":"荒州边境烽火滚滚。"}',
            '</command>'
        ].join('\n'));

        expect(parsed.updates).toEqual(['江湖暗流开始浮现。']);
        expect(parsed.commands).toHaveLength(2);
        expect(parsed.commands[0]).toMatchObject({
            action: 'push',
            key: '世界.进行中事件',
            value: expect.objectContaining({ 事件名: '九幽魔宗暗流渗透' })
        });
    });

    it('surfaces new faction-like names from current story text for world-evolution backfill', () => {
        const hints = 提取正文势力补录线索({
            text: '正文中出现了西州‘陇西李氏’，并暗示他们正在与四海商会争夺一批旧契。',
            worldData: {
                势力列表: [
                    { ID: 'sihai', 名称: '四海商会' },
                    { ID: 'tiejian', 名称: '天剑宗' }
                ]
            }
        });

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('陇西李氏');
        expect(hints[0]).toContain('类型倾向：家族');
        expect(hints[0]).toContain('地盘线索：西州');
        expect(hints[0]).toContain('push 世界.势力列表');
        expect(hints.join('\n')).not.toContain('正文提到疑似新势力「四海商会」');
    });

    it('does not suggest faction backfill when the faction already exists', () => {
        const hints = 提取正文势力补录线索({
            text: '西州“陇西李氏”已经派人追查旧契下落。',
            worldData: {
                势力列表: [
                    { ID: 'longxi_lishi', 名称: '陇西李氏' }
                ]
            }
        });

        expect(hints).toEqual([]);
    });

    it('injects faction backfill candidates into world-evolution context', () => {
        const context = 构建世界演变上下文文本({
            worldData: {
                势力列表: [
                    { ID: 'sihai', 名称: '四海商会' }
                ]
            },
            currentTurnBody: '李府旧账牵出西州“陇西李氏”，这支世家可能牵动边地商路。',
            currentTurnPlanText: '',
            currentTurnCommandsText: ''
        });

        expect(context).toContain('【正文势力补录候选】');
        expect(context).toContain('陇西李氏');
        expect(context).toContain('势力补录：正文提到疑似新势力');
        expect(context).toContain('push 世界.势力列表');
    });
});
