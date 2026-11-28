import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 清洗导入存档 } from '../services/dbService';
import { 获取旧版拍卖行存储键, 迁移旧版拍卖行寄售资产 } from '../utils/legacyAuctionMigration';
import { 规范化游戏设置, 默认游戏设置 } from '../utils/gameSettings';
import {
    构建场外交易注入块,
    提取交易对方库存列表,
    提取主角可交易物品列表,
    执行情境交易结算,
    检测当前交易场所,
    评估NPC交易资格
} from '../engine/plugins/tradePlugin';
import {
    创建战术交锋会话,
    构建NPC明牌交锋面板,
    构建主角明牌交锋面板,
    构建场外战果注入块,
    推演交锋一拍,
    结算战术交锋结果,
    获取可选战术交锋目标
} from '../engine/plugins/clashPlugin';
import { 从状态构建2_0导演圣经 } from '../engine/storyV2/legacySaveBridge';
import { 执行导演后处理V2 } from '../engine/storyV2/directorPostTurn';
import { 渲染主剧情回合V2 } from '../engine/storyV2/storyTurnRenderer';
import { 创建空白导演圣经 } from '../models/directorBible';
import { 计算角色货币底层总值 } from '../utils/currencyDisplay';
import * as chatClient from '../services/ai/chatCompletionClient';

vi.mock('../services/ai/chatCompletionClient', async () => {
    const actual = await vi.importActual<any>('../services/ai/chatCompletionClient');
    return {
        ...actual,
        请求模型文本: vi.fn()
    };
});

const createBaseRole = () => ({
    姓名: '沈砚',
    性别: '男' as const,
    年龄: 20,
    生辰: '甲子年正月初一',
    外貌: '青衫配刀',
    称号: '外门弟子',
    境界: '练气一层',
    金钱: { 金元宝: 0, 银子: 2, 铜钱: 500, 上层货币: 0, 中层货币: 2, 底层货币: 500, baseAmount: 2500 },
    力量: 12,
    敏捷: 15,
    体质: 12,
    悟性: 13,
    福源: 10,
    当前生命: 100,
    最大生命: 100,
    当前精力: 80,
    最大精力: 100,
    当前内力: 60,
    最大内力: 100,
    装备: { 主武器: '青霜剑', 盔甲: '轻革甲' },
    物品列表: [
        { ID: 'w1', 名称: '青霜剑', 类型: '武器', 品质: '上品', 数量: 1, 价值: 800, 描述: '佩剑' },
        { ID: 'm1', 名称: '止血散', 类型: '药品', 品质: '良品', 数量: 3, 堆叠数量: 3, 价值: 120, 描述: '外伤良药' },
        { ID: 'g1', 名称: '破损玉佩', 类型: '杂物', 品质: '凡品', 数量: 2, 堆叠数量: 2, 价值: 150, 描述: '刻着半个印记' }
    ],
    功法列表: [
        { 名称: '流云剑诀', 类型: '武技', 品质: '上品', 等级: 3 }
    ],
    身体部位伤势: []
} as any);

describe('Legacy Compatibility & Scheme B Plugins', () => {
    beforeEach(() => {
        vi.mocked(chatClient.请求模型文本).mockReset();
    });

    it('gameSettings defaults & explicit disabling for 2.0 engine and optional plugins', () => {
        const defaults = 规范化游戏设置({});
        expect(defaults.启用2_0剧情引擎).toBe(true);
        expect(defaults.启用情境交易插件).toBe(true);
        expect(defaults.启用战术交锋插件).toBe(true);

        const custom = 规范化游戏设置({
            启用2_0剧情引擎: false,
            启用情境交易插件: false,
            启用战术交锋插件: false
        });
        expect(custom.启用2_0剧情引擎).toBe(false);
        expect(custom.启用情境交易插件).toBe(false);
        expect(custom.启用战术交锋插件).toBe(false);
    });

    it('dbService 清洗导入存档 preserves 导演圣经, 上一回合导演圣经, 世界大事, and staged plugin records', () => {
        const bible = 创建空白导演圣经();
        bible.宏观分幕大纲 = [{
            幕次: 1,
            标题: '初入迷局',
            核心矛盾: '追查盐引失踪',
            关键势力与人物: ['沈砚'],
            主角目标与破局路径: '查清渡口账册',
            跃迁至下一幕条件: '夜探渡口',
            当前状态: '推进中'
        }];

        const cleaned = 清洗导入存档({
            时间戳: Date.now(),
            角色数据: createBaseRole(),
            环境信息: { 时间: '1:01:01:08:00', 大地点: '大虞', 小地点: '云州城', 具体地点: '破庙' },
            社交: [],
            历史记录: [],
            记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
            导演圣经: bible,
            上一回合导演圣经: bible,
            世界大事: ['西市渡口昨夜失火'],
            场外交易暂存: [{
                id: 'tr-1',
                对象类型: 'npc',
                对象名称: '顾霜晚',
                地点: '破庙',
                玩家支出物品: [],
                玩家获得物品: [{ 名称: '银针', 数量: 1 }],
                玩家支出金钱Base: 100,
                玩家获得金钱Base: 0,
                成交摘要: '换得银针一枚',
                时间: 123
            }],
            场外战果暂存: [{
                id: 'cl-1',
                对手姓名: '黑衣探子',
                模式: '切磋试探',
                结果: '胜出',
                回合数: 2,
                主角伤势消耗描述: '略有消耗',
                战果摘要: '两拍击退黑衣探子',
                时间: 124
            }]
        });

        expect(cleaned).not.toBeNull();
        expect(cleaned!.导演圣经?.宏观分幕大纲[0].标题).toBe('初入迷局');
        expect((cleaned as any).上一回合导演圣经?.宏观分幕大纲[0].标题).toBe('初入迷局');
        expect((cleaned as any).世界大事).toEqual(['西市渡口昨夜失火']);
        expect((cleaned as any).场外交易暂存).toHaveLength(1);
        expect((cleaned as any).场外战果暂存).toHaveLength(1);
    });

    it('legacyAuctionMigration refunds old localStorage consignments back to bag idempotently', () => {
        const role = createBaseRole();
        role.物品列表 = [role.物品列表[0]];
        const save = {
            游戏初始时间: '1:01:01:06:00',
            角色数据: role,
            历史记录: [{ role: 'assistant', content: 'hi', timestamp: 99999 }],
            拍卖行: {
                玩家寄售列表: [{
                    ID: 'old-sold',
                    状态: '已成交',
                    来源描述: '玩家寄售：下回合自动成交',
                    未入账金额BaseAmount: 300
                }]
            }
        } as any;

        const key = 获取旧版拍卖行存储键(save);
        const memStore = new Map<string, string>();
        memStore.set(key, JSON.stringify({
            拍卖品列表: [{
                ID: 'a-1',
                卖家ID: '沈砚',
                状态: '上架中',
                来源描述: '玩家寄售：下回合自动成交',
                物品: { ID: 'legacy-jade', 名称: '青田古玉', 类型: '杂物', 品质: '上品', 数量: 2, 堆叠数量: 2, 可堆叠: true }
            }]
        }));
        const mockStorage = {
            getItem: (k: string) => memStore.get(k) ?? null,
            setItem: (k: string, v: string) => { memStore.set(k, v); }
        };

        const beforeMoney = 计算角色货币底层总值(role.金钱);
        const res1 = 迁移旧版拍卖行寄售资产({ save, role, storage: mockStorage });
        expect(res1.mutated).toBe(true);
        expect(res1.restoredItemCount).toBe(2);
        expect(res1.creditedBaseAmount).toBe(300);
        expect(res1.nextRole.物品列表.some((it: any) => it.名称 === '青田古玉' && it.堆叠数量 === 2)).toBe(true);
        expect(计算角色货币底层总值(res1.nextRole.金钱)).toBe(beforeMoney + 300);

        expect(save.拍卖行.玩家寄售列表[0].未入账金额BaseAmount).toBe(300);
        expect(JSON.parse(mockStorage.getItem(key)!).拍卖品列表[0].状态).toBe('上架中');
        const committed = { ...save, 角色数据: res1.nextRole, 拍卖行: res1.nextAuction };
        const res2 = 迁移旧版拍卖行寄售资产({ save: committed, role: res1.nextRole, storage: mockStorage, receipts: res1.localClaims });
        expect(res2.restoredItemCount).toBe(0);
        expect(res2.creditedBaseAmount).toBe(0);
    });

    it('同一寄售在三份镜像只兑付一次，较新成交覆盖旧上架，同名不同物品分开保留', () => {
        const role = createBaseRole();
        const item = { ID: 'old', 名称: '玉佩', 品质: '下品', 数量: 4, 可堆叠: true };
        role.物品列表 = [item as any];
        const entry = { ID: 'A', 卖家ID: 'player', 状态: '上架中', 物品: { ...item, 数量: 2 } };
        const jade = { ...entry, ID: 'B', 物品: { ...item, ID: 'rare', 品质: '极品', 数量: 3 } };
        const sold = { ...entry, ID: 'C' };
        const save = { 角色数据: role, 拍卖行: { 玩家寄售列表: [entry, jade, sold], 拍卖品列表: [entry, jade, sold] } };
        const storage = { getItem: () => JSON.stringify({ 拍卖品列表: [entry, jade, { ...sold, 状态: '已成交', 未入账金额BaseAmount: 99 }] }), setItem: vi.fn() };
        const result = 迁移旧版拍卖行寄售资产({ save, role, storage });
        expect(result.restoredItemCount).toBe(5);
        expect(result.creditedBaseAmount).toBe(99);
        expect(result.nextRole.物品列表).toMatchObject([{ ID: 'old', 数量: 6, 堆叠数量: 6 }, { ID: 'rare', 数量: 3 }]);
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(entry.状态).toBe('上架中');
    });

    it('无寄售编号按同表次数保留独立的货品，同局镜像不重复，缺少字段的成交摘要保留已知待领金额', () => {
        const role = createBaseRole();
        const item = { 名称: '信物', 品质: '上品', 是否可堆叠: false };
        const lot = { 卖家ID: 'player', 状态: '上架中', 物品: item, 上架时间: 77 };
        const sale = { ID: 'sold', 卖家ID: 'player', 状态: '已成交' };
        const save = { 角色数据: role, 拍卖行: { 玩家寄售列表: [lot, lot, sale], 拍卖品列表: [lot, lot, { ...sale, 未入账金额BaseAmount: 3 }] } };
        const migrated = 迁移旧版拍卖行寄售资产({ save, role, storage: null });
        expect(migrated.restoredItemCount).toBe(2);
        expect(migrated.creditedBaseAmount).toBe(3);
        const ids = migrated.nextRole.物品列表.filter(item => item.名称 === '信物').map(item => item.ID);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('真实读档规范化保留同名同品质的不同旧物和背包实体货币的新增寄售款', async () => {
        const { 规范化角色物品容器映射 } = await import('../hooks/useGame/stateTransforms');
        const role = createBaseRole();
        const jade = { ID: 'jade-1', 名称: '玉佩', 类型: '材料', 品质: '良品', 描述: '青龙纹', 堆叠数量: 1, 是否可堆叠: true };
        role.物品列表 = [jade, { ID: 'coins', 名称: '铜钱', 类型: '货币:底层货币', 堆叠数量: 500 }, { ID: 'silver', 名称: '银子', 类型: '货币:中层货币', 堆叠数量: 2 }];
        role.已补齐系统丹药预设 = true;
        const save = { 角色数据: role, 拍卖行: { 玩家寄售列表: [
            { ID: 'jade', 卖家ID: 'player', 状态: '上架中', 物品: { ...jade, ID: 'jade-2', 描述: '白虎纹' } },
            { ID: 'cash', 卖家ID: 'player', 状态: '已成交', 未入账金额BaseAmount: 36 }
        ] } };
        const plan = 迁移旧版拍卖行寄售资产({ save, role, storage: null });
        const actual = 规范化角色物品容器映射(plan.nextRole);
        expect.soft(actual.物品列表.filter(i => i.名称 === '玉佩').map(i => i.描述)).toEqual(['青龙纹', '白虎纹']);
        expect.soft(actual.金钱.baseAmount).toBe(2536);
    });

    it('tradePlugin enforces scene presence, hostility refusal, real inventory settlement, and prompt injection', () => {
        const env = { 大地点: '大虞', 小地点: '云州城', 具体地点: '西市坊市' };
        const venue = 检测当前交易场所(env);
        expect(venue.available).toBe(true);
        expect(venue.venueType).toBe('坊市');

        const presentFriend = { id: 'npc-1', 姓名: '顾霜晚', 性别: '女', 境界: '练气二层', 是否在场: true, 好感度: 55, 关系状态: '同行伙伴', 背包: [{ 名称: '寒月匕', 数量: 1, 描述: '短匕' }] } as any;
        const absentNpc = { id: 'npc-2', 姓名: '远方客', 性别: '男', 境界: '凡人', 是否在场: false, 好感度: 60 } as any;
        const hostileNpc = { id: 'npc-3', 姓名: '血手张', 性别: '男', 境界: '筑基一层', 是否在场: true, 好感度: -60, 关系状态: '死敌追杀' } as any;

        expect(评估NPC交易资格(presentFriend, env).eligible).toBe(true);
        expect(评估NPC交易资格(absentNpc, env).eligible).toBe(false);
        const hostileCheck = 评估NPC交易资格(hostileNpc, env);
        expect(hostileCheck.eligible).toBe(false);
        expect(hostileCheck.reason).toContain('敌对');

        const role = createBaseRole();
        const tradable = 提取主角可交易物品列表(role);
        expect(tradable.find((x) => x.name === '青霜剑')?.equippedLocked).toBe(true);

        const inv = 提取交易对方库存列表({ targetType: 'npc', npc: presentFriend });
        expect(inv.items.some((i) => i.name === '寒月匕')).toBe(true);

        const badTrade = 执行情境交易结算({
            targetType: 'npc',
            targetName: '顾霜晚',
            npcId: 'npc-1',
            locationLabel: '西市坊市',
            role,
            social: [presentFriend],
            playerItemsOffered: [],
            counterpartyItemsBought: [{ name: '寒月匕', type: '武器', description: '短匕', quantity: 1, unitPriceBase: 500 }],
            playerCashPaidBase: 999999,
            playerCashReceivedBase: 0,
            priceMultiplier: 1,
            maxCounterpartyPurseBase: 2000
        });
        expect(badTrade.ok).toBe(false);

        const goodTrade = 执行情境交易结算({
            targetType: 'npc',
            targetName: '顾霜晚',
            npcId: 'npc-1',
            locationLabel: '西市坊市',
            role,
            social: [presentFriend],
            playerItemsOffered: [{ name: '止血散', quantity: 1, unitPriceBase: 120 }],
            counterpartyItemsBought: [{ name: '寒月匕', type: '武器', description: '短匕', quantity: 1, unitPriceBase: 180 }],
            playerCashPaidBase: 200,
            playerCashReceivedBase: 0,
            priceMultiplier: 0.95,
            maxCounterpartyPurseBase: 2000,
            barterNote: '添一点补差'
        });
        expect(goodTrade.ok).toBe(true);
        expect(goodTrade.nextRole?.物品列表.some((it: any) => it.名称 === '寒月匕')).toBe(true);
        expect((goodTrade.nextRole?.物品列表.find((it: any) => it.名称 === '止血散') as any)?.数量).toBe(2);
        const promptBlock = 构建场外交易注入块([goodTrade.record!]);
        expect(promptBlock).toContain('本回合前置交易既成事实');
        expect(promptBlock).toContain('寒月匕');
    });

    it('clashPlugin provides transparent stat breakdown, beat resolution, stamina cost, and prompt block', () => {
        const role = createBaseRole();
        const env = { 大地点: '大虞', 小地点: '云州城', 具体地点: '演武场' };
        const npc = { id: 'npc-9', 姓名: '赵铁柱', 性别: '男', 境界: '练气一层', 境界层级: 1, 是否在场: true, 当前装备: { 主武器: '铁尺' } } as any;

        const targets = 获取可选战术交锋目标([npc, { 姓名: '亡魂', 是否死亡: true } as any], env);
        expect(targets).toHaveLength(1);

        const pProfile = 构建主角明牌交锋面板(role);
        const eProfile = 构建NPC明牌交锋面板(npc);
        expect(pProfile.offenseReasons.some((r) => r.label.includes('青霜剑'))).toBe(true);
        expect(pProfile.signatureArtName).toBe('流云剑诀');

        let session = 创建战术交锋会话({ targetName: '赵铁柱', npcId: 'npc-9', mode: '切磋试探' });
        // Beat 1 in clashPlugin predicts enemy bias === 'press'; deflect counters press & exposes enemy
        session = 推演交锋一拍(session, 'deflect', pProfile, eProfile, false);
        expect(session.logs).toHaveLength(1);
        expect(session.enemyPosture).toBeLessThan(100);
        expect(session.enemyExposed).toBe(true);

        // Next beat with withdraw after advancing should cleanly finish
        session = 推演交锋一拍(session, 'withdraw', pProfile, eProfile, true);
        expect(session.finished).toBe(true);

        const settled = 结算战术交锋结果({ session, role });
        expect(settled.nextRole.当前精力).toBeLessThanOrEqual(role.当前精力);
        const block = 构建场外战果注入块([settled.record]);
        expect(block).toContain('本回合前置战术交锋既成事实');
        expect(block).toContain('赵铁柱');
    });

    it('directorPostTurn handles currency, stackable items, act bounds, truth scrubbing, and strict JSON errors', async () => {
        const bible = 创建空白导演圣经();
        bible.核心卡司 = [{
            id: 'CAST-001',
            姓名: '顾霜晚',
            性别: '女',
            身份与势力: '商队护卫',
            所处层级: 1,
            生平与过往执念: '寻回妹妹',
            表层伪装: '冷面镖师',
            真实诉求与利益底线: '救回失散亲妹',
            隐藏秘密: '昔年官府通缉',
            初始认知边界: { 已知事实: [], 盲区: [] },
            人际渊源: [],
            幕后当前日程: {
                当前目标: '盯梢',
                正在推进的步骤: '查探',
                行动倒计时回合: 2,
                已触发影响: []
            },
            是否已登场: true
        }];
        bible.伏笔台账 = [{
            id: 'FS-1',
            类型: '物件',
            表面载体: '残缺铜印',
            底层真相: '绝密_盐铁司私印真相',
            知情人: [],
            盲区人物: ['沈砚'],
            建议埋设阶段: '第1回合',
            建议回收阶段: '第5回合',
            触发或回收条件: '验印对账',
            状态: '发酵中',
            埋设回合: 1,
            埋设落点描述: '袖口露出一角铜印'
        }];
        bible.宏观分幕大纲 = [{
            幕次: 1,
            标题: '雨夜破庙',
            核心矛盾: '盐引失窃风波',
            关键势力与人物: ['顾霜晚'],
            主角目标与破局路径: '查验铜印',
            跃迁至下一幕条件: '入城查账',
            当前状态: '推进中'
        }];

        const baseState: any = {
            turnIndex: 1,
            gameInitialTime: '1:01:01:08:00',
            worldPrompt: '',
            directorBible: bible,
            角色: createBaseRole(),
            环境: { 时间: '1:01:01:08:00', 大地点: '大虞', 小地点: '云州城', 具体地点: '破庙' },
            社交: [],
            世界: { 势力列表: [], 地图层级: [] },
            剧情: { 当前章节: { 当前分解组: 1 } },
            剧情规划: {},
            记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
            历史记录: [],
            任务列表: [],
            世界大事: []
        };

        // 1. Unparseable director JSON must throw instead of silently applying {}
        vi.mocked(chatClient.请求模型文本).mockResolvedValueOnce('坏掉的非JSON返回');
        await expect(执行导演后处理V2({
            state: baseState,
            apiConfig: { id: 'a1', name: 'm', protocol: 'openai', apiKey: 'k', baseUrl: 'http://localhost', model: 'm' } as any,
            storyResponse: { logs: [{ sender: '旁白', text: '测试' }], tavern_commands: [] },
            playerInput: '查探'
        })).rejects.toThrow();

        // 2. Currency writeback, stackable item add/remove, out-of-bounds act guard, truth scrubbing
        vi.mocked(chatClient.请求模型文本).mockResolvedValueOnce(`<导演更新JSON>${JSON.stringify({
            时间与地点: { 时间推进分钟: 20, 具体地点: '东市酒楼' },
            主角变化: {
                境界: '练气一层巅峰',
                金钱变化BaseAmount: 500,
                获得物品: [{ 名称: '止血散', 数量: 2 }],
                失去物品: [{ 名称: '破损玉佩', 数量: 1 }]
            },
            动态重规划: {
                需要重规划: true,
                推进到幕次: 99,
                修订当前幕核心矛盾: '追查绝密_盐铁司私印真相背后的买主'
            }
        })}</导演更新JSON>`);

        const postRes = await 执行导演后处理V2({
            state: baseState,
            apiConfig: { id: 'a1', name: 'm', protocol: 'openai', apiKey: 'k', baseUrl: 'http://localhost', model: 'm' } as any,
            storyResponse: { logs: [{ sender: '旁白', text: '进酒楼买药' }], tavern_commands: [] },
            playerInput: '走进酒楼'
        });

        expect(计算角色货币底层总值(postRes.nextState.角色.金钱)).toBe(3000);
        expect((postRes.nextState.角色.物品列表.find((x: any) => x.名称 === '止血散') as any)?.数量).toBe(5);
        expect((postRes.nextState.角色.物品列表.find((x: any) => x.名称 === '破损玉佩') as any)?.数量).toBe(1);
        // Invalid act jump (99) must not mark act 1已完成 or switch to invalid act
        expect(postRes.nextState.directorBible.当前幕次).toBe(1);
        expect(postRes.nextState.directorBible.宏观分幕大纲[0].当前状态).toBe('已重规划');
        expect(postRes.nextState.directorBible.宏观分幕大纲[0].当前状态).not.toBe('已完成');
        // Unrecovered foreshadow truth must be scrubbed from visible conflict
        expect(postRes.nextState.directorBible.宏观分幕大纲[0].核心矛盾).not.toContain('绝密_盐铁司私印真相');
    });

    it('storyTurnRenderer respects 启用行动选项=false and legacySaveBridge keeps act group', async () => {
        const role = createBaseRole();
        const bible = 从状态构建2_0导演圣经({
            role,
            social: [],
            world: {},
            story: { 当前章节: { 标题: '第二卷·盐枭迷雾', 当前分解组: 2 } } as any
        });
        expect(bible.当前幕次).toBe(2);
        expect(bible.宏观分幕大纲.some((a) => a.幕次 === 2 && a.当前状态 === '推进中')).toBe(true);

        vi.mocked(chatClient.请求模型文本).mockResolvedValueOnce(
            '<thinking>ok</thinking><正文>雨夜灯火微明，石阶泛着青光。你按下剑柄，静观屋檐水滴落下，心中暗忖此地不宜久留，便借着微弱灯光一步步退出庙门之外。屋舍四周寂静无声，只有冷风掠过老树枯枝的轻微响动，提醒你前路仍藏暗哨。</正文><短期记忆>离开破庙。</短期记忆><行动选项>- [强行输出选项]\n</行动选项>'
        );
        const turnRes = await 渲染主剧情回合V2(
            {
                turnIndex: 1,
                gameInitialTime: '1:01:01:08:00',
                worldPrompt: '江湖乱世',
                directorBible: bible,
                角色: role,
                环境: { 时间: '1:01:01:08:00', 大地点: '大虞', 中地点: '', 小地点: '云州城', 具体地点: '破庙', 节日: '', 天气: '', 环境变量: {} } as any,
                社交: [],
                世界: { 势力列表: [], 地图层级: [] } as any,
                剧情: {} as any,
                剧情规划: {} as any,
                记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
                历史记录: [],
                任务列表: [],
                世界大事: []
            },
            {
                gameConfig: { ...默认游戏设置, 启用行动选项: false, 启用严格正文对白格式: false },
                apiConfig: { id: 'a1', name: 'm', protocol: 'openai', apiKey: 'k', baseUrl: 'http://localhost', model: 'm' } as any,
                openingConfig: {} as any,
                worldConfig: { worldName: '墨染江湖' },
                promptPool: [],
                worldbooks: []
            },
            '观察四周',
            { stream: false }
        );
        expect(turnRes.response.action_options).toEqual([]);
    });
});
