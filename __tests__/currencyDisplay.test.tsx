import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LeftPanel from '../components/layout/LeftPanel';
import { 创建开场空白角色 } from '../hooks/useGame/storyState';
import { 设置默认技艺运行时配置, 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';
import { 核心_数据格式 } from '../prompts/core/data';
import { 开场初始化任务提示词 } from '../prompts/runtime/opening';
import { 构建变量模型职责提示词 } from '../prompts/runtime/variableModel';
import { 默认游戏设置 } from '../utils/gameSettings';
import {
    formatCurrencyBaseAmount,
    fromBaseAmount,
    获取默认CurrencySystemFromProfile,
    获取世界观BaseAmount单位标签,
    获取世界观简短货币汇率说明,
    获取世界观货币槽位,
    获取角色金钱BaseAmount,
    获取角色金钱显示列表,
    底层总值转角色金钱,
    格式化角色金钱行,
    格式化世界观BaseAmount,
    确保角色金钱BaseAmount,
    规范化角色金钱,
    计算角色货币底层总值,
    toBaseAmount
} from '../utils/currencyDisplay';
import { 渲染模式运行时配置世界书内容, 规范化模式运行时配置 } from '../utils/modeRuntimeProfile';

const 无限流运行时配置 = 规范化模式运行时配置(undefined, '无限流');

const 无限流开局配置 = {
    配置约束启用: true,
    题材模式: '无限流',
    modeRuntimeProfile: 无限流运行时配置,
    初始关系模板: '独行少系',
    关系侧重: ['利益'],
    开局切入偏好: '风波前夜',
    开局生成门派: true,
    开局生成同门: true,
    同人融合: {
        enabled: false,
        作品名: '',
        来源类型: '小说',
        融合强度: '轻度映射',
        保留原著角色: false,
        启用角色替换: false,
        替换目标角色名: '',
        附加替换角色名列表: [],
        附加角色替换规则列表: [],
        启用附加小说: false,
        附加小说数据集ID: ''
    }
} as any;

const 单币种货币开局配置 = {
    ...无限流开局配置,
    题材模式: '现代都市',
    modeRuntimeProfile: {
        ...无限流运行时配置,
        economy: {
            ...(无限流运行时配置 as any).economy,
            currencySystem: {
                id: 'modern-yuan',
                name: '人民币',
                baseUnitId: 'yuan',
                formatStyle: 'single',
                units: [
                    { id: 'yuan', name: '元', symbol: '¥', baseRate: 1, order: 1, aliases: ['人民币', '现金'] }
                ]
            }
        }
    }
} as any;

const 三层CurrencySystem开局配置 = {
    ...无限流开局配置,
    题材模式: '武侠',
    modeRuntimeProfile: {
        ...无限流运行时配置,
        economy: {
            ...(无限流运行时配置 as any).economy,
            currencySystem: {
                id: 'ancient-money',
                name: '古代钱制',
                baseUnitId: 'copper',
                formatStyle: 'compound',
                units: [
                    { id: 'gold', name: '金', baseRate: 10000, order: 3, aliases: ['金元宝'] },
                    { id: 'silver', name: '银', baseRate: 100, order: 2, aliases: ['银子'] },
                    { id: 'copper', name: '铜', baseRate: 1, order: 1, aliases: ['铜钱'] }
                ]
            }
        }
    }
} as any;

const makeInfiniteCharacter = () => ({
    姓名: '林越',
    称号: '候补轮回者',
    境界: '基因锁一阶',
    头像图片URL: '',
    头部当前血量: 30,
    头部最大血量: 30,
    头部状态: '正常',
    胸部当前血量: 45,
    胸部最大血量: 45,
    胸部状态: '正常',
    腹部当前血量: 40,
    腹部最大血量: 40,
    腹部状态: '正常',
    左手当前血量: 20,
    左手最大血量: 20,
    左手状态: '正常',
    右手当前血量: 20,
    右手最大血量: 20,
    右手状态: '正常',
    左腿当前血量: 20,
    左腿最大血量: 20,
    左腿状态: '正常',
    右腿当前血量: 20,
    右腿最大血量: 20,
    右腿状态: '正常',
    当前精力: 88,
    最大精力: 120,
    当前内力: 0,
    最大内力: 0,
    当前饱腹: 0,
    最大饱腹: 0,
    当前口渴: 0,
    最大口渴: 0,
    当前经验: 189,
    升级经验: 650,
    玩家BUFF: [],
    装备: {
        头部: '无',
        胸部: '无',
        背部: '无',
        腰部: '无',
        腿部: '无',
        足部: '无',
        手部: '无',
        主武器: '无',
        副武器: '无',
        暗器: '无',
        坐骑: '无'
    },
    物品列表: [],
    金钱: {
        金元宝: 0,
        银子: 5,
        铜钱: 2000
    }
} as any);

describe('货币显示', () => {
    it('AI 提示词支持可选 currencySystem 且保留旧三层货币兼容', () => {
        const variablePrompt = 构建变量模型职责提示词();

        expect(开场初始化任务提示词).toContain('modeRuntimeProfile.economy.currencySystem');
        expect(开场初始化任务提示词).toContain('若不输出 `currencySystem`，程序会继续使用旧三层货币 fallback');
        expect(核心_数据格式.内容).toContain('currencySystem 是可选字段');
        expect(核心_数据格式.内容).toContain('金元宝/银子/铜钱三层兼容字段必须保留');
        expect(variablePrompt).toContain('units[].name/symbol/aliases');
        expect(variablePrompt).toContain('普通回合不要擅自改写或重建 `currencySystem`');
    });

    it('无限流左侧栏货币槽位使用短标签而不是提示词长文', () => {
        const slots = 获取世界观货币槽位(无限流开局配置, makeInfiniteCharacter());
        expect(slots.map((slot) => slot.label)).toEqual(['C级支线剧情', 'D级支线剧情', '奖励点']);
        expect(slots[2].label).not.toContain('所有兑换、强化、修复');
        expect(slots[2].label).not.toContain('不要使用银子');
    });

    it('无限流左侧栏只显示简短换算说明', () => {
        expect(获取世界观简短货币汇率说明(无限流运行时配置, 'infinite')).toBe('1 C级支线剧情 = 100 D级支线剧情 = 100000 奖励点');
    });

    it('无限流角色面板不应渲染货币提示词长文', () => {
        const html = renderToStaticMarkup(
            <LeftPanel
                角色={makeInfiniteCharacter()}
                openingConfig={无限流开局配置}
                gameConfig={{ ...默认游戏设置, 启用修炼体系: false, 启用饱腹口渴系统: false }}
            />
        );
        expect(html).toContain('C级支线剧情');
        expect(html).toContain('D级支线剧情');
        expect(html).toContain('奖励点');
        expect(html).toContain('1 C级支线剧情 = 100 D级支线剧情 = 100000 奖励点');
        expect(html).not.toContain('所有兑换、强化、修复、造人和高级物资交易都通过主神商城结算');
        expect(html).not.toContain('底层统一货币：铜钱=奖励点');
    });

    it('现代单币种 CurrencySystem 可以正确格式化 baseAmount', () => {
        const currencySystem = {
            id: 'modern-cny',
            name: '人民币',
            baseUnitId: 'yuan',
            formatStyle: 'single' as const,
            units: [
                { id: 'yuan', name: '元', symbol: '¥', baseRate: 1, order: 1, aliases: ['人民币', '现金'] }
            ]
        };

        expect(formatCurrencyBaseAmount(123456, currencySystem)).toBe('123,456 ¥');
        expect(toBaseAmount(88, '人民币', currencySystem)).toBe(88);
        expect(fromBaseAmount(88, currencySystem)).toEqual({ yuan: 88 });
    });

    it('没有 currencySystem 时世界观 baseAmount UI 包装保持旧底层单位显示', () => {
        expect(获取世界观BaseAmount单位标签(无限流开局配置, makeInfiniteCharacter(), '奖励点')).toBe('奖励点');
        expect(格式化世界观BaseAmount(123456, 无限流开局配置, makeInfiniteCharacter(), '123,456 奖励点')).toBe('123,456 奖励点');
    });

    it('有单币种 currencySystem 时世界观 baseAmount UI 包装优先使用动态货币', () => {
        expect(获取世界观BaseAmount单位标签(单币种货币开局配置, makeInfiniteCharacter(), '信用点')).toBe('¥');
        expect(格式化世界观BaseAmount(123456, 单币种货币开局配置, makeInfiniteCharacter(), '123,456 信用点')).toBe('123,456 ¥');
    });

    it('有三层 currencySystem 时世界观 baseAmount UI 包装可以复合显示', () => {
        expect(获取世界观BaseAmount单位标签(三层CurrencySystem开局配置, makeInfiniteCharacter(), '铜钱')).toBe('铜');
        expect(格式化世界观BaseAmount(12345, 三层CurrencySystem开局配置, makeInfiniteCharacter(), '12,345 铜钱')).toBe('1 金 / 23 银 / 45 铜');
    });

    it('角色金钱显示列表没有 currencySystem 时保持旧三层显示', () => {
        const character = makeInfiniteCharacter();

        expect(获取角色金钱显示列表(character.金钱, 无限流开局配置, character)).toEqual([
            'C级支线剧情 0',
            'D级支线剧情 5',
            '奖励点 2000'
        ]);
    });

    it('角色金钱显示列表有单币种 currencySystem 时使用 baseAmount', () => {
        const character = makeInfiniteCharacter();
        character.金钱 = {
            金元宝: 0,
            银子: 5,
            铜钱: 2000,
            baseAmount: 123456
        };

        expect(获取角色金钱显示列表(character.金钱, 单币种货币开局配置, character)).toEqual(['123,456 ¥']);
    });

    it('角色金钱显示列表有三层 currencySystem 时使用复合 baseAmount', () => {
        const character = makeInfiniteCharacter();
        character.金钱 = {
            金元宝: 0,
            银子: 0,
            铜钱: 0,
            baseAmount: 12345
        };

        expect(获取角色金钱显示列表(character.金钱, 三层CurrencySystem开局配置, character)).toEqual(['1 金 / 23 银 / 45 铜']);
    });

    it('左侧栏有 currencySystem 时钱财显示使用 baseAmount 格式化', () => {
        const character = makeInfiniteCharacter();
        character.金钱 = {
            金元宝: 0,
            银子: 5,
            铜钱: 2000,
            baseAmount: 123456
        };
        const html = renderToStaticMarkup(
            <LeftPanel
                角色={character}
                openingConfig={单币种货币开局配置}
                gameConfig={{ ...默认游戏设置, 启用修炼体系: false, 启用饱腹口渴系统: false }}
            />
        );

        expect(html).toContain('123,456 ¥');
    });

    it('古代三层 CurrencySystem 可以从 baseAmount 拆分格式化', () => {
        const currencySystem = {
            id: 'ancient-three-tier',
            name: '古代钱制',
            baseUnitId: 'copper',
            formatStyle: 'compound' as const,
            units: [
                { id: 'gold', name: '金', baseRate: 10000, order: 3, aliases: ['金元宝'] },
                { id: 'silver', name: '银', baseRate: 100, order: 2, aliases: ['银子'] },
                { id: 'copper', name: '铜', baseRate: 1, order: 1, aliases: ['铜钱'] }
            ]
        };

        expect(formatCurrencyBaseAmount(12345, currencySystem)).toBe('1 金 / 23 银 / 45 铜');
        expect(toBaseAmount(3, '银子', currencySystem)).toBe(300);
        expect(fromBaseAmount(12345, currencySystem)).toEqual({ gold: 1, silver: 23, copper: 45 });
    });

    it('当前旧三层货币函数行为保持不变', () => {
        const money = { 金元宝: 1, 银子: 2, 铜钱: 345 };

        expect(计算角色货币底层总值(money)).toBe(102345);
        expect(底层总值转角色金钱(102345)).toEqual({
            上层货币: 1,
            中层货币: 2,
            底层货币: 345,
            baseAmount: 102345,
            金元宝: 1,
            银子: 2,
            铜钱: 345
        });
        expect(格式化角色金钱行(money)).toBe('元宝 1 / 银 2 / 铜钱 345');
    });

    it('旧三层钱包规范化时会自动补出 baseAmount', () => {
        const normalized = 规范化角色金钱({ 金元宝: 1, 银子: 2, 铜钱: 345 });

        expect(normalized).toEqual({
            上层货币: 1,
            中层货币: 2,
            底层货币: 345,
            baseAmount: 102345,
            金元宝: 1,
            银子: 2,
            铜钱: 345
        });
        expect(获取角色金钱BaseAmount(normalized)).toBe(102345);
    });

    it('已有 baseAmount 的钱包不会被规范化清空', () => {
        const normalized = 规范化角色金钱({
            上层货币: 1,
            中层货币: 2,
            底层货币: 345,
            baseAmount: 999999
        });

        expect(normalized.baseAmount).toBe(999999);
        expect(获取角色金钱BaseAmount(normalized)).toBe(999999);
        expect(计算角色货币底层总值(normalized)).toBe(102345);
    });

    it('缺字段钱包有安全 baseAmount fallback 且显示不变', () => {
        const normalized = 规范化角色金钱({});

        expect(normalized).toEqual({
            上层货币: 0,
            中层货币: 0,
            底层货币: 0,
            baseAmount: 0,
            金元宝: 0,
            银子: 0,
            铜钱: 0
        });
        expect(获取角色金钱BaseAmount({})).toBe(0);
        expect(格式化角色金钱行({})).toBe('元宝 0 / 银 0 / 铜钱 0');
    });

    it('确保角色金钱BaseAmount 只补兼容字段并保留原字段', () => {
        const money = 确保角色金钱BaseAmount({ 金元宝: 1, 银子: 2, 铜钱: 345, 现金: 88 });

        expect(money).toMatchObject({
            金元宝: 1,
            银子: 2,
            铜钱: 345,
            现金: 88,
            baseAmount: 102345
        });
    });

    it('新开场空白角色默认钱包包含 baseAmount 且默认金额不变', () => {
        const role = 创建开场空白角色();

        expect(role.金钱).toMatchObject({
            金元宝: 0,
            银子: 0,
            铜钱: 0,
            baseAmount: 0
        });
    });

    it('stateTransforms 规范化旧钱包时自动补 baseAmount 且不改变旧三层字段', () => {
        设置默认技艺运行时配置('武侠');
        const normalized = 规范化角色物品容器映射({
            姓名: '旧档侠客',
            金钱: { 上层货币: 1, 中层货币: 2, 底层货币: 345 },
            物品列表: [],
            装备: {}
        });

        expect(normalized.金钱).toMatchObject({
            上层货币: 1,
            中层货币: 2,
            底层货币: 345,
            金元宝: 1,
            银子: 2,
            铜钱: 345,
            baseAmount: 102345
        });
    });

    it('无显式 currencySystem 时仍走旧显示，有显式 currencySystem 时配置不被覆盖', () => {
        const oldMoney = 确保角色金钱BaseAmount({ 金元宝: 1, 银子: 2, 铜钱: 345 });
        expect(格式化世界观BaseAmount(oldMoney.baseAmount, 无限流开局配置, makeInfiniteCharacter(), '102,345 奖励点')).toBe('102,345 奖励点');

        const systemBefore = 单币种货币开局配置.modeRuntimeProfile.economy.currencySystem;
        const dynamicMoney = 确保角色金钱BaseAmount({ baseAmount: 500, 金元宝: 0, 银子: 0, 铜钱: 0 });
        expect(格式化世界观BaseAmount(dynamicMoney.baseAmount, 单币种货币开局配置, makeInfiniteCharacter())).toBe('500 ¥');
        expect(单币种货币开局配置.modeRuntimeProfile.economy.currencySystem).toBe(systemBefore);
    });

    it('三层配置可以安全转换成 CurrencySystem，异常配置有 fallback', () => {
        const system = 获取默认CurrencySystemFromProfile(无限流运行时配置, 'infinite');

        expect(system.baseUnitId).toBe('lower');
        expect(system.units.map((unit) => [unit.id, unit.name, unit.baseRate])).toEqual([
            ['upper', 'C级支线剧情', 100000],
            ['middle', 'D级支线剧情', 1000],
            ['lower', '奖励点', 1]
        ]);
        expect(formatCurrencyBaseAmount(101234, system)).toBe('1 C级支线剧情 / 1 D级支线剧情 / 234 奖励点');

        const fallbackSystem = 获取默认CurrencySystemFromProfile({
            economy: {
                currencySystem: {
                    id: '',
                    name: '',
                    baseUnitId: '',
                    formatStyle: 'compound',
                    units: [
                        { id: '', name: '', baseRate: -10, order: -1 }
                    ]
                }
            }
        } as any, 'modern');

        expect(fallbackSystem.baseUnitId).toBe('base');
        expect(formatCurrencyBaseAmount(Number.NaN, fallbackSystem)).toBe('0 货币');
        expect(toBaseAmount(Number.NaN, 'missing', fallbackSystem)).toBe(0);
    });

    it('模式运行时规范化会保留合法 currencySystem', () => {
        const profile = 规范化模式运行时配置({
            identity: { baseMode: '现代都市' },
            economy: {
                currencySystem: {
                    id: 'modern-credit',
                    name: '现代信用点',
                    baseUnitId: 'credit',
                    formatStyle: 'single',
                    units: [
                        { id: 'credit', name: '信用点', symbol: '点', baseRate: 1, order: 1, aliases: ['信用', '点数'] }
                    ]
                }
            }
        } as any, '现代都市');

        expect(profile.economy.currencySystem).toEqual({
            id: 'modern-credit',
            name: '现代信用点',
            baseUnitId: 'credit',
            formatStyle: 'single',
            units: [
                { id: 'credit', name: '信用点', symbol: '点', baseRate: 1, order: 1, aliases: ['信用', '点数'] }
            ]
        });
    });

    it('非法 currencySystem 会被丢弃且旧 currencyTiers fallback 仍保留', () => {
        const profile = 规范化模式运行时配置({
            identity: { baseMode: '武侠' },
            economy: {
                currencyTiers: {
                    upperName: '金',
                    middleName: '银',
                    lowerName: '铜',
                    upperToMiddleRate: 10,
                    middleToLowerRate: 100
                },
                currencySystem: {
                    id: 'bad',
                    name: '坏配置',
                    baseUnitId: 'gold',
                    units: [
                        { id: 'gold', name: '金', baseRate: 100, order: 2 }
                    ]
                }
            }
        } as any, '武侠');

        expect(profile.economy.currencySystem).toBeUndefined();
        expect(profile.economy.currencyTiers).toEqual({
            upperName: '金',
            middleName: '银',
            lowerName: '铜',
            upperToMiddleRate: 10,
            middleToLowerRate: 100
        });
    });

    it('运行时配置世界书有 currencySystem 时会追加动态货币摘要', () => {
        const profile = 规范化模式运行时配置({
            identity: { baseMode: '仙侠' },
            economy: {
                currencySystem: {
                    id: 'spirit-stones',
                    name: '灵石体系',
                    baseUnitId: 'low',
                    formatStyle: 'compound',
                    units: [
                        { id: 'high', name: '上品灵石', symbol: '上灵', baseRate: 10000, order: 3, aliases: ['上品'] },
                        { id: 'mid', name: '中品灵石', baseRate: 100, order: 2, aliases: ['中品'] },
                        { id: 'low', name: '下品灵石', baseRate: 1, order: 1, aliases: ['下品'] }
                    ]
                }
            }
        } as any, '仙侠');
        const text = 渲染模式运行时配置世界书内容(profile);

        expect(text).toContain('动态货币体系：灵石体系');
        expect(text).toContain('baseUnitId=low');
        expect(text).toContain('上品灵石；符号=上灵；baseRate=10000；别名=上品');
        expect(text).toContain('下品灵石；baseRate=1；别名=下品');
    });

    it('运行时配置世界书无 currencySystem 时旧三层摘要不变', () => {
        const profile = 规范化模式运行时配置({
            identity: { baseMode: '武侠' },
            economy: {
                currencyTiers: {
                    upperName: '金元宝',
                    middleName: '银子',
                    lowerName: '铜钱',
                    upperToMiddleRate: 100,
                    middleToLowerRate: 1000
                }
            }
        } as any, '武侠');
        const text = 渲染模式运行时配置世界书内容(profile);

        expect(text).toContain('经济系统：');
        expect(text).toContain('上层=金元宝；中层=银子；底层=铜钱；汇率=100/1000');
        expect(text).not.toContain('动态货币体系');
    });
});
