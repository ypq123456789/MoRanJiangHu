import type { OpeningConfig, 角色数据结构 } from '../types';
import type { 角色金钱 } from '../models/character';
import { 推断单位仙侠 } from './realmDisplay';
import { 获取题材模式配置, 题材是否仙侠 } from './topicModeProfiles';
import type { CurrencySystem, CurrencyUnit, ModeRuntimeProfile } from '../models/system';

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

const 读取货币数值 = (money: Partial<角色金钱> | null | undefined, key: 货币层级键): number => {
    const direct = Number(money?.[key]);
    if (Number.isFinite(direct)) return Math.max(0, Math.trunc(direct));
    const legacyKey = 默认旧别名标签[key] as '金元宝' | '银子' | '铜钱';
    const legacy = Number(money?.[legacyKey]);
    return Number.isFinite(legacy) ? Math.max(0, Math.trunc(legacy)) : 0;
};

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

const 默认CurrencySystem单位别名: Record<货币层级键, string[]> = {
    上层货币: ['上层货币', '金元宝', '元宝'],
    中层货币: ['中层货币', '银子', '银两'],
    底层货币: ['底层货币', '铜钱']
};

const 获取CurrencySystemFallback = (): CurrencySystem => ({
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

export const 规范化CurrencySystem = (system?: Partial<CurrencySystem> | null): CurrencySystem => {
    const fallback = 获取CurrencySystemFallback();
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

export const 获取默认CurrencySystemFromProfile = (
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): CurrencySystem => {
    if (profile?.economy?.currencySystem) {
        return 规范化CurrencySystem(profile.economy.currencySystem);
    }
    const slots = 获取世界观货币层级配置(profile, mode);
    const [upper, middle, lower] = slots;
    return 规范化CurrencySystem({
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
                aliases: Array.from(new Set([...默认CurrencySystem单位别名.上层货币, upper.label, upper.fullLabel].filter((item): item is string => Boolean(item))))
            },
            {
                id: 'middle',
                name: middle.fullLabel || middle.label,
                baseRate: middle.multiplier,
                order: 2,
                aliases: Array.from(new Set([...默认CurrencySystem单位别名.中层货币, middle.label, middle.fullLabel].filter((item): item is string => Boolean(item))))
            },
            {
                id: 'lower',
                name: lower.fullLabel || lower.label,
                baseRate: lower.multiplier,
                order: 1,
                aliases: Array.from(new Set([...默认CurrencySystem单位别名.底层货币, lower.label, lower.fullLabel].filter((item): item is string => Boolean(item))))
            }
        ]
    });
};

const 获取CurrencyUnit = (unitId: string, currencySystem?: Partial<CurrencySystem> | null): CurrencyUnit => {
    const system = 规范化CurrencySystem(currencySystem);
    const normalizedId = typeof unitId === 'string' ? unitId.trim() : '';
    return system.units.find((unit) => unit.id === normalizedId || unit.name === normalizedId || unit.aliases?.includes(normalizedId))
        || system.units.find((unit) => unit.id === system.baseUnitId)
        || system.units[0];
};

const 获取CurrencySystem排序单位 = (currencySystem?: Partial<CurrencySystem> | null): CurrencyUnit[] => (
    规范化CurrencySystem(currencySystem).units
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
    const system = 规范化CurrencySystem(currencySystem);
    const units = 获取CurrencySystem排序单位(system);
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
    const system = 规范化CurrencySystem(currencySystem);
    const amount = 读取非负整数金额(baseAmount);
    if (system.formatStyle === 'single') {
        const baseUnit = 获取CurrencyUnit(system.baseUnitId, system);
        return `${amount.toLocaleString('zh-CN')} ${baseUnit.symbol || baseUnit.name}`;
    }
    const decomposed = fromBaseAmount(amount, system);
    const units = 获取CurrencySystem排序单位(system);
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

const 计算角色三层货币底层总值 = (
    money?: Partial<角色金钱> | null,
    profile?: ModeRuntimeProfile | null,
    mode: 货币显示模式 = 'wuxia'
): number => (
    货币层级顺序.reduce((sum, key) => (
        sum + 读取货币数值(money, key) * 获取货币层级倍率(key, profile, mode)
    ), 0)
);

export const 创建兼容角色金钱 = (money?: Partial<角色金钱> | null): 角色金钱 => {
    const normalized = {
        上层货币: 读取货币数值(money, '上层货币'),
        中层货币: 读取货币数值(money, '中层货币'),
        底层货币: 读取货币数值(money, '底层货币')
    };
    const baseAmount = 读取BaseAmount数值(money) ?? 计算角色三层货币底层总值(normalized);
    return {
        ...normalized,
        baseAmount,
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
    return `当前世界使用 ${upper.fullLabel}、${middle.fullLabel}、${lower.fullLabel} 三级货币，系统会按相邻汇率自动折算。`;
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
    const normalized = 创建兼容角色金钱(money);
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
    return 创建兼容角色金钱({ 上层货币, 中层货币, 底层货币 });
};

export const 格式化角色金钱行 = (
    money?: Partial<角色金钱> | null,
    mode: 货币显示模式 = 'wuxia',
    profile?: ModeRuntimeProfile | null
): string => {
    const normalized = 创建兼容角色金钱(money);
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
