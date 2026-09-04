import type { OpeningConfig, 角色数据结构 } from '../types';
import type { 角色金钱 } from '../models/character';
import { 推断单位仙侠 } from './realmDisplay';
import { 获取题材模式配置, 题材是否仙侠 } from './topicModeProfiles';
import type { CurrencySystem, CurrencyUnit, ModeRuntimeProfile } from '../models/system';
import { 获取展开货币系统, 是否多货币模式 } from './apiConfig';

export type 货币显示模式 = 'wuxia' | 'xianxia' | 'fantasy' | 'urban' | 'modern' | 'apocalypse' | 'infinite';
export type 货币层级键 = '上层货币' | '中层货币' | '底层货币';
export type 兼容货币键 = 货币层级键 | '金元宝' | '银子' | '铜钱';

export const 仙侠货币汇率说明 = '1 上品灵石 = 100 中品灵石；1 中品灵石 = 1000 下品灵石。';

export type 货币槽位配置 = {
    key: 货币层级键;
    label: string;
    fullLabel: string;
};

export type 世界观货币卡片信息 = {
    title: string;
    summary: string;
    exchangeHint: string;
};

export type 角色金钱世界观显示快照 = {
    baseAmount: number;
    显示: string;
    货币体系?: string;
    基础单位?: string;
    单位列表?: Array<{
        id: string;
        名称: string;
        符号?: string;
        baseRate: number;
        别名?: string[];
    }>;
    [label: string]: unknown;
};

export type 变量管理动态钱包视图 = {
    enabled: boolean;
    baseAmount: number;
    formatted: string;
    systemName: string;
    baseUnitLabel: string;
    primaryFieldPath: '角色.金钱.baseAmount';
};

export type 货币物品聚合信息 = {
    类型: string;
    分类名: string;
    名称: string;
    数量: number;
    描述: string;
};

type 货币层级配置 = {
    key: 货币层级键;
    label: string;
    fullLabel: string;
    multiplier: number;
};

const 货币层级顺序: 货币层级键[] = ['上层货币', '中层货币', '底层货币'];
const 旧货币键映射: Record<兼容货币键, 货币层级键> = {
    上层货币: '上层货币',
    中层货币: '中层货币',
    底层货币: '底层货币',
    金元宝: '上层货币',
    银子: '中层货币',
    铜钱: '底层货币'
};

const 默认旧别名标签: Record<货币层级键, string> = {
    上层货币: '金元宝',
    中层货币: '银子',
    底层货币: '铜钱'
};

const 读取可用于UI的短货币文案 = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text || text.length > 24) return '';
    if (/底层统一货币|不要使用|通过.+结算|；|。/u.test(text)) return '';
    return text;
};

const 读取正整数汇率 = (value: unknown, fallback: number): number => {
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const 读取非负整数金额 = (value: unknown): number => {
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const 读取货币类型分类名 = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text.startsWith('货币:')) return '';
    return text.slice(3).trim();
};

const 归一化货币键 = (key: 兼容货币键): 货币层级键 => 旧货币键映射[key] || '底层货币';

/**
 * 题材专属货币字段 → 统一三层货币的别名表。
 *
 * 角色初始化模板按题材给的是 灵石/灵玉、现金/存款、通用点数/稀缺物资、金币/银币/铜币，
 * AI 也会按题材语义直接往这些字段里写钱；但显示层只认 上层/中层/底层货币 与
 * 金元宝/银子/铜钱，于是一切非武侠题材的左栏"钱财"恒为 0 —— 变量面板里明明有钱。
 * 这里补齐别名；按顺序取第一个存在且为有限数的字段，避免重复计数。
 */
export const 题材货币字段别名: Record<货币层级键, string[]> = {
    上层货币: ['金元宝', '元宝', '灵玉', '上品灵石', '金币', '存款', '稀缺物资', '研究额度'],
    中层货币: ['银子', '银两', '中品灵石', '银币', '灵晶'],
    底层货币: ['铜钱', '灵石', '下品灵石', '铜币', '现金', '通用点数', '信用点', '奖励点', '人民币']
};

const 读取货币数值 = (money: Partial<角色金钱> | null | undefined, key: 货币层级键): number => {
    const direct = Number(money?.[key]);
    if (Number.isFinite(direct)) return Math.max(0, Math.trunc(direct));
    const legacyKey = 默认旧别名标签[key] as '金元宝' | '银子' | '铜钱';
    const candidates = [legacyKey, ...题材货币字段别名[key]];
    for (const alias of candidates) {
        const value = Number((money as Record<string, unknown> | null | undefined)?.[alias]);
        if (Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    }
    return 0;
};

const 已知货币字段集合 = new Set<string>([
    '上层货币', '中层货币', '底层货币',
    '金元宝', '银子', '铜钱',
    'baseAmount', '货币桶',
    ...题材货币字段别名.上层货币,
    ...题材货币字段别名.中层货币,
    ...题材货币字段别名.底层货币
]);

export type 角色金钱补充字段 = { key: string; value: number };

/**
 * 读取既不在三层货币、也不在题材别名表里的其余正数字段。
 * 兜底用途：万一 AI 用了自定义币种名（如"香火""情报额度"），
 * 左栏也至少能把真实余额显示出来，而不是一律 0。
 */
export const 获取角色金钱补充字段 = (money?: Partial<角色金钱> | null): 角色金钱补充字段[] => {
    if (!money || typeof money !== 'object') return [];
    return Object.entries(money as Record<string, unknown>)
        .filter(([key]) => !已知货币字段集合.has(key))
        .map(([key, value]) => ({ key, value: 读取非负整数金额(value) }))
        .filter((item) => item.value > 0);
};

export const 格式化角色金钱补充字段 = (fields: 角色金钱补充字段[]): string => (
    fields.map((item) => `${item.key} ${item.value.toLocaleString('zh-CN')}`).join(' / ')
);

const 读取BaseAmount数值 = (money: Partial<角色金钱> | null | undefined): number | null => {
    const value = Number((money as any)?.baseAmount);
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
};

const 获取默认货币层级配置 = (mode: 货币显示模式): {
    upperName: string;
    middleName: string;
    lowerName: string;
    upperFullName: string;
    middleFullName: string;
    lowerFullName: string;
    upperToMiddleRate: number;
    middleToLowerRate: number;
} => {
    if (mode === 'xianxia') {
        return {
            upperName: '上品灵石',
            middleName: '中品灵石',
            lowerName: '下品灵石',
            upperFullName: '上品灵石',
            middleFullName: '中品灵石',
            lowerFullName: '下品灵石',
            upperToMiddleRate: 100,
            middleToLowerRate: 1000
        };
    }
    if (mode === 'fantasy') {
        return {
            upperName: '金币',
            middleName: '银币',
            lowerName: '铜币',
            upperFullName: '金币',
            middleFullName: '银币',
            lowerFullName: '铜币',
            upperToMiddleRate: 100,
            middleToLowerRate: 100
        };
    }
    if (mode === 'urban' || mode === 'modern') {
        return {
            upperName: '十万元账户',
            middleName: '千元账户',
            lowerName: '信用点',
            upperFullName: '十万元账户',
            middleFullName: '千元账户',
            lowerFullName: '信用点',
            upperToMiddleRate: 100,
            middleToLowerRate: 1000
        };
    }
    if (mode === 'apocalypse') {
        return {
            upperName: '安全通行牌',
            middleName: '物资票',
            lowerName: '营地信用点',
            upperFullName: '安全通行牌',
            middleFullName: '物资票',
            lowerFullName: '营地信用点',
            upperToMiddleRate: 100,
            middleToLowerRate: 1000
        };
    }
    if (mode === 'infinite') {
        return {
            upperName: 'C级支线剧情',
            middleName: 'D级支线剧情',
            lowerName: '奖励点',
            upperFullName: 'C级支线剧情',
            middleFullName: 'D级支线剧情',
            lowerFullName: '奖励点',
            upperToMiddleRate: 100,
            middleToLowerRate: 1000
        };
    }
    return {
        upperName: '元宝',
        middleName: '银',
        lowerName: '铜钱',
        upperFullName: '金元宝',
        middleFullName: '银子',
        lowerFullName: '铜钱',
        upperToMiddleRate: 100,
        middleToLowerRate: 1000
    };
};

export const 获取货币显示模式 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): 货币显示模式 => {
    const mode = 获取题材模式配置(openingConfig?.题材模式).currencyDisplayMode;
    if (推断单位仙侠(character) && mode === 'wuxia') return 'xianxia';
    return mode;
};

export const 获取世界观货币层级配置 = (
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): 货币层级配置[] => {
    const fallback = 获取默认货币层级配置(mode);
    const tiers = profile?.economy?.currencyTiers;
    const lowerName = 读取可用于UI的短货币文案(tiers?.lowerName)
        || 读取可用于UI的短货币文案(profile?.economy?.accountingUnit)
        || fallback.lowerName;
    const middleName = 读取可用于UI的短货币文案(tiers?.middleName) || fallback.middleName;
    const upperName = 读取可用于UI的短货币文案(tiers?.upperName) || fallback.upperName;
    const middleToLowerRate = 读取正整数汇率(tiers?.middleToLowerRate, fallback.middleToLowerRate);
    const upperToMiddleRate = 读取正整数汇率(tiers?.upperToMiddleRate, fallback.upperToMiddleRate);
    return [
        {
            key: '上层货币',
            label: upperName,
            fullLabel: upperName || fallback.upperFullName,
            multiplier: upperToMiddleRate * middleToLowerRate
        },
        {
            key: '中层货币',
            label: middleName,
            fullLabel: middleName || fallback.middleFullName,
            multiplier: middleToLowerRate
        },
        {
            key: '底层货币',
            label: lowerName,
            fullLabel: lowerName || fallback.lowerFullName,
            multiplier: 1
        }
    ];
};

const 默认货币系统单位别名: Record<货币层级键, string[]> = {
    上层货币: ['上层货币', '金元宝', '元宝'],
    中层货币: ['中层货币', '银子', '银两'],
    底层货币: ['底层货币', '铜钱']
};

const 获取货币系统Fallback = (): CurrencySystem => ({
    id: 'fallback-basic',
    name: '默认货币体系',
    baseUnitId: 'base',
    formatStyle: 'compound',
    units: [
        {
            id: 'base',
            name: '货币',
            baseRate: 1,
            order: 1,
            aliases: ['底层货币']
        }
    ]
});

const 规范化CurrencyUnit = (unit: Partial<CurrencyUnit> | null | undefined, fallback: CurrencyUnit): CurrencyUnit => {
    const id = typeof unit?.id === 'string' && unit.id.trim() ? unit.id.trim() : fallback.id;
    const name = typeof unit?.name === 'string' && unit.name.trim() ? unit.name.trim() : fallback.name;
    const symbol = typeof unit?.symbol === 'string' && unit.symbol.trim() ? unit.symbol.trim() : undefined;
    const aliases = Array.isArray(unit?.aliases)
        ? unit.aliases.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
        : fallback.aliases;
    return {
        id,
        name,
        ...(symbol ? { symbol } : {}),
        baseRate: 读取正整数汇率(unit?.baseRate, fallback.baseRate),
        order: 读取正整数汇率(unit?.order, fallback.order),
        ...(aliases && aliases.length > 0 ? { aliases } : {})
    };
};

export const 规范化货币系统 = (system?: Partial<CurrencySystem> | null): CurrencySystem => {
    const fallback = 获取货币系统Fallback();
    const sourceUnits = Array.isArray(system?.units) ? system.units : [];
    const units = sourceUnits.length > 0
        ? sourceUnits.map((unit, index) => 规范化CurrencyUnit(unit, {
            id: index === 0 ? fallback.baseUnitId : `unit_${index + 1}`,
            name: index === 0 ? fallback.units[0].name : `货币${index + 1}`,
            baseRate: index === 0 ? 1 : 1,
            order: index + 1
        }))
        : fallback.units;
    const baseUnitId = typeof system?.baseUnitId === 'string' && system.baseUnitId.trim()
        ? system.baseUnitId.trim()
        : (units.find((unit) => unit.baseRate === 1)?.id || units[units.length - 1]?.id || fallback.baseUnitId);
    const hasBaseUnit = units.some((unit) => unit.id === baseUnitId);
    const normalizedUnits = hasBaseUnit
        ? units
        : [...units, { id: baseUnitId, name: fallback.units[0].name, baseRate: 1, order: 0 }];
    return {
        id: typeof system?.id === 'string' && system.id.trim() ? system.id.trim() : fallback.id,
        name: typeof system?.name === 'string' && system.name.trim() ? system.name.trim() : fallback.name,
        baseUnitId,
        units: normalizedUnits,
        formatStyle: system?.formatStyle === 'single' ? 'single' : 'compound'
    };
};

export const 获取默认货币系统FromProfile = (
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): CurrencySystem => {
    if (profile?.economy?.currencySystem) {
        return 规范化货币系统(profile.economy.currencySystem);
    }
    const slots = 获取世界观货币层级配置(profile, mode);
    const [upper, middle, lower] = slots;
    return 规范化货币系统({
        id: `default-${mode}`,
        name: `${mode}货币体系`,
        baseUnitId: 'lower',
        formatStyle: 'compound',
        units: [
            {
                id: 'upper',
                name: upper.fullLabel || upper.label,
                baseRate: upper.multiplier,
                order: 3,
                aliases: Array.from(new Set([...默认货币系统单位别名.上层货币, upper.label, upper.fullLabel].filter((item): item is string => Boolean(item))))
            },
            {
                id: 'middle',
                name: middle.fullLabel || middle.label,
                baseRate: middle.multiplier,
                order: 2,
                aliases: Array.from(new Set([...默认货币系统单位别名.中层货币, middle.label, middle.fullLabel].filter((item): item is string => Boolean(item))))
            },
            {
                id: 'lower',
                name: lower.fullLabel || lower.label,
                baseRate: lower.multiplier,
                order: 1,
                aliases: Array.from(new Set([...默认货币系统单位别名.底层货币, lower.label, lower.fullLabel].filter((item): item is string => Boolean(item))))
            }
        ]
    });
};

const 获取CurrencyUnit = (unitId: string, currencySystem?: Partial<CurrencySystem> | null): CurrencyUnit => {
    const system = 规范化货币系统(currencySystem);
    const normalizedId = typeof unitId === 'string' ? unitId.trim() : '';
    return system.units.find((unit) => unit.id === normalizedId || unit.name === normalizedId || unit.aliases?.includes(normalizedId))
        || system.units.find((unit) => unit.id === system.baseUnitId)
        || system.units[0];
};

const 获取货币系统排序单位 = (currencySystem?: Partial<CurrencySystem> | null): CurrencyUnit[] => (
    规范化货币系统(currencySystem).units
        .slice()
        .sort((a, b) => b.baseRate - a.baseRate || b.order - a.order)
);

export const toBaseAmount = (
    amount: number,
    unitId: string,
    currencySystem?: Partial<CurrencySystem> | null
): number => {
    const unit = 获取CurrencyUnit(unitId, currencySystem);
    return 读取非负整数金额(amount) * Math.max(1, unit.baseRate);
};

export const fromBaseAmount = (
    baseAmount: number,
    currencySystem?: Partial<CurrencySystem> | null
): Record<string, number> => {
    let remaining = 读取非负整数金额(baseAmount);
    const system = 规范化货币系统(currencySystem);
    const units = 获取货币系统排序单位(system);
    return units.reduce<Record<string, number>>((result, unit) => {
        const rate = Math.max(1, unit.baseRate);
        const value = Math.floor(remaining / rate);
        result[unit.id] = value;
        remaining -= value * rate;
        return result;
    }, {});
};

export const formatCurrencyBaseAmount = (
    baseAmount: number,
    currencySystem?: Partial<CurrencySystem> | null
): string => {
    const system = 规范化货币系统(currencySystem);
    const amount = 读取非负整数金额(baseAmount);
    if (system.formatStyle === 'single') {
        const baseUnit = 获取CurrencyUnit(system.baseUnitId, system);
        return `${amount.toLocaleString('zh-CN')} ${baseUnit.symbol || baseUnit.name}`;
    }
    const decomposed = fromBaseAmount(amount, system);
    const units = 获取货币系统排序单位(system);
    const parts = units
        .map((unit) => ({ unit, value: decomposed[unit.id] || 0 }))
        .filter((item) => item.value > 0);
    const visibleParts = parts.length > 0
        ? parts
        : [{ unit: 获取CurrencyUnit(system.baseUnitId, system), value: 0 }];
    return visibleParts
        .map(({ unit, value }) => `${value.toLocaleString('zh-CN')} ${unit.symbol || unit.name}`)
        .join(' / ');
};

const 获取显式世界观货币系统 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): CurrencySystem | null => {
    if (!openingConfig?.modeRuntimeProfile?.economy?.currencySystem) return null;
    return 获取默认货币系统FromProfile(
        openingConfig.modeRuntimeProfile,
        获取货币显示模式(openingConfig, character)
    );
};

export const 是否启用显式货币系统 = (
    openingConfig?: OpeningConfig | null
): boolean => Boolean(openingConfig?.modeRuntimeProfile?.economy?.currencySystem);

export const 构建变量管理动态钱包视图 = (
    money?: Partial<角色金钱> | null,
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): 变量管理动态钱包视图 | null => {
    const explicitSystem = 获取显式世界观货币系统(openingConfig, character);
    if (!explicitSystem) return null;
    const baseAmount = 获取角色金钱BaseAmount(
        money,
        openingConfig?.modeRuntimeProfile,
        获取货币显示模式(openingConfig, character)
    );
    const baseUnit = 获取CurrencyUnit(explicitSystem.baseUnitId, explicitSystem);
    return {
        enabled: true,
        baseAmount,
        formatted: formatCurrencyBaseAmount(baseAmount, explicitSystem),
        systemName: explicitSystem.name,
        baseUnitLabel: baseUnit.symbol || baseUnit.name,
        primaryFieldPath: '角色.金钱.baseAmount'
    };
};

export const 获取世界观BaseAmount单位标签 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null,
    fallback = ''
): string => {
    const system = 获取显式世界观货币系统(openingConfig, character);
    if (!system) return fallback;
    const baseUnit = 获取CurrencyUnit(system.baseUnitId, system);
    return baseUnit.symbol || baseUnit.name;
};

export const 格式化世界观BaseAmount = (
    baseAmount: number,
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null,
    fallback?: string
): string => {
    const system = 获取显式世界观货币系统(openingConfig, character);
    if (system) return formatCurrencyBaseAmount(baseAmount, system);
    if (fallback != null) return fallback;
    const mode = 获取货币显示模式(openingConfig, character);
    return `${读取非负整数金额(baseAmount).toLocaleString('zh-CN')} ${获取货币完整单位标签('铜钱', mode, openingConfig?.modeRuntimeProfile)}`;
};

export const 获取角色金钱显示列表 = (
    money?: Partial<角色金钱> | null,
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): string[] => {
    const mode = 获取货币显示模式(openingConfig, character);
    if (openingConfig?.modeRuntimeProfile?.economy?.currencySystem) {
        return [
            格式化世界观BaseAmount(
                获取角色金钱BaseAmount(money, openingConfig.modeRuntimeProfile, mode),
                openingConfig,
                character
            )
        ];
    }
    return 格式化角色金钱行(money, mode).split(' / ');
};

const 构建多系统货币快照 = (
    money: Partial<角色金钱> | null | undefined,
    profile: any
): 角色金钱世界观显示快照 | null => {
    if (!是否多货币模式(profile)) return null;
    const expandedSystem = 获取展开货币系统(profile);
    if (!expandedSystem) return null;

    const 货币桶 = (money as any)?.货币桶;
    if (!货币桶) return null;

    const sortedSystems = Object.entries(expandedSystem.systems)
        .sort(([, a], [, b]) => a.displayOrder - b.displayOrder);

    let lines: string[] = [];
    let hasAnyAmount = false;

    for (const [systemId, system] of sortedSystems) {
        const systemUnits = 货币桶[systemId];
        if (!systemUnits) continue;

        const sortedUnits = Object.entries(system.units)
            .sort(([, a], [, b]) => a.displayOrder - b.displayOrder);

        let systemParts: string[] = [];
        for (const [unitId, unit] of sortedUnits) {
            const amount = (systemUnits as any)?.[unitId] ?? 0;
            if (amount > 0 && unit.inMarket) {
                systemParts.push(`${unit.displayName}×${amount}`);
                hasAnyAmount = true;
            }
        }

        if (systemParts.length > 0) {
            lines.push(`【${system.displayName}】${systemParts.join('  ')}`);
        }
    }

    if (!hasAnyAmount) return null;

    return {
        baseAmount: 0,
        显示: lines.join('\n'),
        货币体系: '多货币体系',
        基础单位: '',
        单位列表: []
    };
};

export const 构建角色金钱显示快照 = (
    money?: Partial<角色金钱> | null,
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): 角色金钱世界观显示快照 => {
    const multiSnapshot = 构建多系统货币快照(money, openingConfig?.modeRuntimeProfile);
    if (multiSnapshot) return multiSnapshot;

    const mode = 获取货币显示模式(openingConfig, character);
    const baseAmount = 获取角色金钱BaseAmount(money, openingConfig?.modeRuntimeProfile, mode);
    // 三层货币与题材别名都没解析出余额时，退回显示 角色.金钱 里的其余正数字段，
    // 避免"变量里有钱、界面全是 0"。AI 侧也读这份快照，显示成 0 会让它误判主角身无分文。
    const 补充字段 = 获取角色金钱补充字段(money);
    const 补充文本 = 格式化角色金钱补充字段(补充字段);
    const explicitSystem = 获取显式世界观货币系统(openingConfig, character);
    if (explicitSystem) {
        const baseUnit = 获取CurrencyUnit(explicitSystem.baseUnitId, explicitSystem);
        return {
            baseAmount,
            显示: (baseAmount <= 0 && 补充文本) ? 补充文本 : 格式化世界观BaseAmount(baseAmount, openingConfig, character),
            货币体系: explicitSystem.name,
            基础单位: baseUnit.symbol || baseUnit.name,
            单位列表: explicitSystem.units.map((unit) => ({
                id: unit.id,
                名称: unit.name,
                ...(unit.symbol ? { 符号: unit.symbol } : {}),
                baseRate: unit.baseRate,
                ...(unit.aliases?.length ? { 别名: unit.aliases } : {})
            }))
        };
    }

    const normalizedMoney = 规范化角色金钱(money);
    const slots = 获取世界观货币槽位(openingConfig, character);
    const 层级显示 = slots.map((slot) => `${slot.label} ${读取非负整数金额((normalizedMoney as any)[slot.key])}`).join(' / ');
    const result: 角色金钱世界观显示快照 = {
        baseAmount,
        显示: (baseAmount <= 0 && 补充文本) ? 补充文本 : 层级显示
    };
    slots.forEach((slot) => {
        result[slot.label] = 读取非负整数金额((normalizedMoney as any)[slot.key]);
    });
    return result;
};

const 计算角色三层货币底层总值 = (
    money?: Partial<角色金钱> | null,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => (
    货币层级顺序.reduce((sum, key) => (
        sum + 读取货币数值(money, key) * 获取货币层级倍率(key, profile, mode)
    ), 0)
);

export const 创建兼容角色金钱 = (
    money?: Partial<角色金钱> | null,
    profile?: ModeRuntimeProfile | null,
    mode?: 货币显示模式
): 角色金钱 => {
    const normalized = {
        上层货币: 读取货币数值(money, '上层货币'),
        中层货币: 读取货币数值(money, '中层货币'),
        底层货币: 读取货币数值(money, '底层货币')
    };
    const existingBaseAmount = 读取BaseAmount数值(money);
    const shouldInferBaseAmount = Boolean(profile || mode);
    return {
        ...normalized,
        ...(existingBaseAmount !== null || shouldInferBaseAmount
            ? { baseAmount: existingBaseAmount ?? 计算角色三层货币底层总值(normalized, profile, mode || 'wuxia') }
            : {}),
        金元宝: normalized.上层货币,
        银子: normalized.中层货币,
        铜钱: normalized.底层货币
    };
};

export const 获取角色金钱BaseAmount = (
    money?: Partial<角色金钱> | null,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => {
    const existing = 读取BaseAmount数值(money);
    if (existing !== null) return existing;
    return 计算角色三层货币底层总值(money, profile, mode);
};

export const 确保角色金钱BaseAmount = <T extends Record<string, any> | null | undefined>(
    money?: T,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): NonNullable<T> & { baseAmount: number } => {
    const source = money && typeof money === 'object' ? money as Record<string, any> : {};
    const normalized = 创建兼容角色金钱(source as Partial<角色金钱>, profile, mode);
    return {
        ...source,
        ...normalized,
        baseAmount: 获取角色金钱BaseAmount(normalized, profile, mode)
    } as unknown as NonNullable<T> & { baseAmount: number };
};

export const 获取货币兼容字段路径 = (key: 货币层级键): string[] => [
    `角色.金钱.${key}`,
    `角色.金钱.${默认旧别名标签[key]}`
];

export const 获取货币层级倍率 = (
    key: 兼容货币键,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => {
    const normalizedKey = 归一化货币键(key);
    return 获取世界观货币层级配置(profile, mode).find((item) => item.key === normalizedKey)?.multiplier || 1;
};

export const 获取世界观货币槽位 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): 货币槽位配置[] => {
    const mode = 获取货币显示模式(openingConfig, character);
    return 获取世界观货币层级配置(openingConfig?.modeRuntimeProfile, mode).map((item) => ({
        key: item.key,
        label: item.label,
        fullLabel: item.fullLabel
    }));
};

export const 获取货币单位标签 = (
    key: 兼容货币键,
    mode: 货币显示模式 = 'wuxia',
    profile?: ModeRuntimeProfile | null
): string => {
    const normalizedKey = 归一化货币键(key);
    return 获取世界观货币层级配置(profile, mode).find((item) => item.key === normalizedKey)?.label || '';
};

export const 获取货币完整单位标签 = (
    key: 兼容货币键,
    mode: 货币显示模式 = 'wuxia',
    profile?: ModeRuntimeProfile | null
): string => {
    const normalizedKey = 归一化货币键(key);
    return 获取世界观货币层级配置(profile, mode).find((item) => item.key === normalizedKey)?.fullLabel || '';
};

export const 获取世界观主货币说明 = (profile?: ModeRuntimeProfile | null, mode: 货币显示模式 = 'wuxia'): string => (
    获取世界观货币层级配置(profile, mode)[2]?.label || ''
);

export const 获取世界观货币汇率说明 = (profile?: ModeRuntimeProfile | null, mode: 货币显示模式 = 'wuxia'): string => {
    const [upper, middle, lower] = 获取世界观货币层级配置(profile, mode);
    const middleToLower = middle?.multiplier || 1;
    const upperToMiddle = Math.max(1, Math.floor((upper?.multiplier || 1) / Math.max(1, middleToLower)));
    return `1 ${upper.fullLabel} = ${upperToMiddle} ${middle.fullLabel}；1 ${middle.fullLabel} = ${middleToLower} ${lower.fullLabel}。`;
};

export const 获取世界观简短货币汇率说明 = (
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): string => {
    const [upper, middle, lower] = 获取世界观货币层级配置(profile, mode);
    return `1 ${upper.label} = ${Math.max(1, Math.floor(upper.multiplier / Math.max(1, middle.multiplier)))} ${middle.label} = ${upper.multiplier} ${lower.label}`;
};

export const 获取世界观货币摘要 = (
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): string => {
    const [upper, middle, lower] = 获取世界观货币层级配置(profile, mode);
    return `${upper.fullLabel} / ${middle.fullLabel} / ${lower.fullLabel}`;
};

export const 获取世界观货币卡片信息 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): 世界观货币卡片信息 => {
    const mode = 获取货币显示模式(openingConfig, character);
    const profile = openingConfig?.modeRuntimeProfile;
    return {
        title: '货币体系',
        summary: 获取世界观货币摘要(profile, mode),
        exchangeHint: 获取世界观货币汇率说明(profile, mode)
    };
};

export const 是否仙侠货币模式 = (
    openingConfig?: OpeningConfig | null,
    character?: Partial<角色数据结构> | null
): boolean => (
    题材是否仙侠(openingConfig?.题材模式)
    || 推断单位仙侠(character)
);

export const 规范化角色金钱 = 创建兼容角色金钱;

export const 计算角色货币底层总值 = (
    money?: Partial<角色金钱> | null,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => {
    const normalized = 创建兼容角色金钱(money, profile, mode);
    return 计算角色三层货币底层总值(normalized, profile, mode);
};

export const 底层总值转角色金钱 = (
    value: number,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): 角色金钱 => {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const [upper, middle] = 获取世界观货币层级配置(profile, mode);
    const 上层货币 = Math.floor(total / Math.max(1, upper.multiplier));
    const afterUpper = total - 上层货币 * Math.max(1, upper.multiplier);
    const 中层货币 = Math.floor(afterUpper / Math.max(1, middle.multiplier));
    const 底层货币 = afterUpper - 中层货币 * Math.max(1, middle.multiplier);
    return 创建兼容角色金钱({ 上层货币, 中层货币, 底层货币 }, profile, mode);
};

export const 格式化角色金钱行 = (
    money?: Partial<角色金钱> | null,
    mode: 货币显示模式 = 'wuxia',
    profile?: ModeRuntimeProfile | null
): string => {
    const normalized = 创建兼容角色金钱(money, profile, mode);
    return 获取世界观货币层级配置(profile, mode)
        .map((slot) => `${slot.label} ${读取货币数值(normalized, slot.key)}`)
        .join(' / ');
};

export const 获取背包货币物品聚合列表 = (items?: any[] | null): 货币物品聚合信息[] => {
    if (!Array.isArray(items) || items.length === 0) return [];
    const byType = new Map<string, 货币物品聚合信息>();
    items.forEach((item: any) => {
        const 类型 = typeof item?.类型 === 'string' ? item.类型.trim() : '';
        const 分类名 = 读取货币类型分类名(类型);
        if (!分类名) return;
        const 名称 = typeof item?.名称 === 'string' && item.名称.trim() ? item.名称.trim() : 分类名;
        const 数量 = Math.max(0, Math.floor(Number(item?.堆叠数量 ?? item?.数量 ?? 0) || 0));
        const 描述 = typeof item?.描述 === 'string' ? item.描述.trim() : '';
        const existing = byType.get(类型);
        if (existing) {
            existing.数量 += 数量;
            if (!existing.描述 && 描述) existing.描述 = 描述;
            return;
        }
        byType.set(类型, { 类型, 分类名, 名称, 数量, 描述 });
    });
    return Array.from(byType.values()).sort((a, b) => a.分类名.localeCompare(b.分类名, 'zh-Hans-CN'));
};

/**
 * 推断「货币:xxx」这类物品单个可兑换多少底层货币（记账单位）。
 *
 * 优先用物品自带的 `价值`（AI 生成货币物品时通常会填，最贴近剧情里的购买力），
 * 其次按分类名匹配当前世界观的货币层级，未知货币退化为 1:1，
 * 避免玩家从商店买来的货币变成永远花不掉的死物品。
 */
const 推断货币物品底层单价 = (
    item: any,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => {
    const 价值 = Number(item?.价值);
    if (Number.isFinite(价值) && 价值 > 0) return Math.floor(价值);

    const 分类名 = 读取货币类型分类名(typeof item?.类型 === 'string' ? item.类型 : '');
    if (!分类名) return 1;

    const slots = 获取世界观货币层级配置(profile, mode);
    const 命中层级 = slots.find((slot) => slot.key === 分类名)
        || slots.find((slot) => slot.label === 分类名 || slot.fullLabel === 分类名);
    if (命中层级) return Math.max(1, 命中层级.multiplier);

    const 命中别名层级 = (Object.keys(题材货币字段别名) as 货币层级键[])
        .find((层级) => 题材货币字段别名[层级].includes(分类名));
    if (命中别名层级) {
        return Math.max(1, slots.find((slot) => slot.key === 命中别名层级)?.multiplier || 1);
    }
    return 1;
};

/**
 * 计算一个「货币:xxx」物品全部兑换后能得到的底层货币总值。
 */
export const 计算货币物品兑换底层总值 = (
    item: any,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => {
    if (!item) return 0;
    // [安全防护] 拒绝非有限数量（如 "1e309" / NaN），避免 Infinity 进入兑换金额
    const 原始数量 = Number(item?.堆叠数量 ?? item?.数量 ?? 1);
    const 数量 = Number.isFinite(原始数量)
        ? Math.max(0, Math.floor(原始数量))
        : 0;
    if (数量 <= 0) return 0;
    // [安全防护] 单价 × 数量超出安全整数范围时返回 0，复用"没有可兑换余额"的处理，避免不精确金额入账
    const 总值 = 推断货币物品底层单价(item, profile, mode) * 数量;
    return Number.isSafeInteger(总值) ? 总值 : 0;
};

/**
 * 判断物品是否为「货币:xxx」类型的实体货币载体。
 */
export const 是否货币类物品 = (item: any): boolean => (
    读取货币类型分类名(typeof item?.类型 === 'string' ? item.类型.trim() : '') !== ''
);
