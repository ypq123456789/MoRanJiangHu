import type { NPC背包物品, OpeningConfig, 角色数据结构, 角色金钱 } from '../../types';
import { 获取展开货币系统 } from '../../utils/apiConfig';
import {
    底层总值转角色金钱, 获取货币显示模式, 获取默认货币系统FromProfile, 获取角色金钱BaseAmount,
    题材货币字段别名, fromBaseAmount
} from '../../utils/currencyDisplay';

export const 获取交易币制 = (opening?: OpeningConfig | null, role?: Partial<角色数据结构>) => {
    const profile = opening?.modeRuntimeProfile;
    const mode = 获取货币显示模式(opening, role);
    const system = 获取默认货币系统FromProfile(profile, mode);
    const base = system.units.find((unit) => unit.id === system.baseUnitId)!;
    const expanded = 获取展开货币系统(profile);
    const marketUnits = Object.entries(expanded?.systems || {}).flatMap(([systemId, entry]) =>
        Object.entries(entry.units).filter(([, unit]) => unit.inMarket && !unit.excludeFromValuation)
            .map(([unitId, unit]) => ({ systemId, unitId, ...unit })));
    const accounting = profile?.economy?.accountingUnit;
    const bucket = marketUnits.find((unit) =>
        [accounting, base.name].some((label) => label && (label === unit.unitId || label === unit.displayName || unit.aliases?.includes(label))));
    // 多体系只收付明确匹配的记账币种；其他体系没有固定换算关系。
    const label = bucket?.displayName || base.symbol || base.name;
    return { profile, mode, system, bucket, label, cashEnabled: !expanded || Boolean(bucket) };
};

type TradeCurrency = ReturnType<typeof 获取交易币制>;
type Money = Partial<角色金钱> & { 货币桶?: Record<string, Record<string, number>> };
const 有金额 = (value: unknown) => value !== null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export const 物品交易面额 = (item: NPC背包物品, currency: TradeCurrency) => {
    const name = typeof item === 'string' ? item : typeof item?.名称 === 'string' ? item.名称.trim() : '';
    const type = typeof item?.类型 === 'string' ? item.类型.replace(/^货币[:：]/u, '').trim() : '';
    if (!currency.cashEnabled) return 0;
    if (currency.bucket) {
        const { unitId, displayName, aliases = [] } = currency.bucket;
        return [unitId, displayName, ...aliases].some((key) => key === name || key === type) ? 1 : 0;
    }
    return currency.system.units.find((unit) => [unit.name, unit.symbol, ...(unit.aliases || [])]
        .some((key) => key && (key === name || key === type)))?.baseRate || 0;
};

export const 读取交易钱袋 = (money: Money | undefined, items: NPC背包物品[], currency: TradeCurrency) => {
    if (!currency.cashEnabled) return { balance: 0, known: false };
    const bagMoney = items.filter((item) => 物品交易面额(item, currency));
    const bagBalance = bagMoney.reduce((sum, item) =>
        sum + 物品交易面额(item, currency) * Math.max(0, Math.floor(Number(item.堆叠数量 ?? item.数量 ?? 1) || 0)), 0);
    if (currency.bucket) {
        const { systemId, unitId } = currency.bucket;
        const amount = money?.货币桶?.[systemId]?.[unitId];
        return 有金额(amount) ? { balance: Number(amount), known: true } : { balance: bagBalance, known: bagMoney.length > 0 };
    }
    if (money && typeof money === 'object') {
        if (有金额(money.baseAmount)) return { balance: Number(money.baseAmount), known: true };
        const entries = Object.entries(money);
        const hasLegacyTier = entries.some(([key, value]) =>
            有金额(value) && Object.values(题材货币字段别名).some((aliases) => aliases.includes(key)));
        if (entries.some(([key, value]) => Object.hasOwn(题材货币字段别名, key) && 有金额(value))
            || (hasLegacyTier && !currency.profile?.economy?.currencySystem)) {
            return { balance: 获取角色金钱BaseAmount(money, currency.profile, currency.mode), known: true };
        }
        const matchingUnits = currency.system.units.map((unit) => ({
            rate: unit.baseRate, entry: entries.find(([k, v]) => (k === unit.name || k === unit.id || unit.aliases?.includes(k)) && 有金额(v))
        }));
        if (matchingUnits.some((unit) => unit.entry)) return {
            balance: matchingUnits.reduce((sum, unit) => sum + Number(unit.entry?.[1] || 0) * unit.rate, 0), known: true
        };
        if (hasLegacyTier) {
            return { balance: 获取角色金钱BaseAmount(money, currency.profile, currency.mode), known: true };
        }
    }
    return { balance: bagBalance, known: bagMoney.length > 0 };
};

export const 写入交易钱袋 = (money: Money | undefined, balance: number, currency: TradeCurrency): Money => {
    if (currency.bucket) {
        const { systemId, unitId } = currency.bucket;
        return { ...money, 货币桶: { ...money?.货币桶, [systemId]: { ...money?.货币桶?.[systemId], [unitId]: balance } } };
    }
    const next = { ...money, ...底层总值转角色金钱(balance, currency.profile, currency.mode), baseAmount: balance };
    for (const [key, aliases] of Object.entries(题材货币字段别名)) {
        for (const alias of aliases) if (money && Object.hasOwn(money, alias)) next[alias] = next[key];
    }
    const denominations = fromBaseAmount(balance, currency.system);
    for (const unit of currency.system.units) {
        // 旧存档可能直接以自定义币名作为钱包字段。
        if (money && Object.hasOwn(money, unit.name)) {
            next[unit.name] = denominations[unit.id];
        }
    }
    return next;
};
