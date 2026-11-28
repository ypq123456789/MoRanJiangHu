import type { OpeningConfig, 存档结构, 角色数据结构 } from '../types';
import { 变更角色货币BaseAmount, 获取货币显示模式 } from './currencyDisplay';
import { 同步角色储物负重上限 } from './storageCarry';
import { 获取交易币制, 读取交易钱袋, 写入交易钱袋, 同步玩家实体货币 } from '../engine/plugins/tradeCurrency';

const LEGACY_AUCTION_STORAGE_PREFIX = 'moranjianghu_auction_house_v2';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type LegacyAuctionEntry = {
    ID?: string;
    物品?: Record<string, any>;
    卖家名称?: string;
    卖家ID?: string;
    一口价?: number;
    上架时间?: number;
    起拍价?: number;
    当前价格?: number;
    标价货币?: string;
    状态?: string;
    来源描述?: string;
    未入账金额BaseAmount?: number;
};

export const 构建兼容拍卖行存储作用域 = (source?: {
    游戏初始时间?: unknown;
    角色数据?: any;
    角色?: any;
    历史记录?: unknown;
}): string => {
    const role = source?.角色数据 || source?.角色 || {};
    const name = typeof role?.姓名 === 'string' && role.姓名.trim() ? role.姓名.trim() : '无名';
    const birth = typeof role?.生辰 === 'string' && role.生辰.trim() ? role.生辰.trim() : '';
    const initialTime = typeof source?.游戏初始时间 === 'string' && source.游戏初始时间.trim()
        ? source.游戏初始时间.trim()
        : '';
    const firstHistory = Array.isArray(source?.历史记录) ? (source.历史记录[0] as any) : null;
    const firstStamp = firstHistory?.timestamp ? String(firstHistory.timestamp) : '';
    return [name, birth, initialTime, firstStamp].filter(Boolean).join('|') || 'global';
};

const 规范化兼容存储作用域 = (scope?: string): string => {
    const text = typeof scope === 'string' ? scope.trim() : '';
    return text
        ? text.replace(/[^a-zA-Z0-9_\-.|:\u4e00-\u9fa5]/g, '_').slice(0, 180)
        : 'global';
};

export const 获取旧版拍卖行存储键 = (source?: {
    游戏初始时间?: unknown;
    角色数据?: any;
    角色?: any;
    历史记录?: unknown;
}): string => `${LEGACY_AUCTION_STORAGE_PREFIX}:${规范化兼容存储作用域(构建兼容拍卖行存储作用域(source))}`;

const 列表字段 = ['玩家寄售列表', '拍卖品列表'] as const;
type Auction = Partial<Record<typeof 列表字段[number], LegacyAuctionEntry[]>> & Record<string, unknown>;
type Save = Partial<存档结构>;
type 领取结果 = '已下架' | '已成交';
export type 寄售领取凭据 = Record<string, 领取结果>;

const 背包数量 = (item: Record<string, any>) => Math.max(1, Math.floor(Number(item.堆叠数量 ?? item.数量) || 1));
const 可叠加 = (item: Record<string, any>) => (item.是否可堆叠 ?? item.可堆叠 ?? (item.堆叠数量 !== undefined)) === true;
const 复制旧档对象 = <T,>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const 取寄售物品 = (role: 角色数据结构, item: Record<string, any>) => {
    const items = role.物品列表 || [];
    const equipped = Object.values(role.装备 || {});
    const existing = item.ID && 可叠加(item) && items.find((entry) => entry.ID === item.ID
        && !entry.当前装备部位 && !(entry as any).已装备 && !equipped.includes(entry.ID) && !equipped.includes(entry.名称) && 可叠加(entry));
    const quantity = 背包数量(item);
    if (existing) {
        existing.堆叠数量 = 背包数量(existing) + quantity;
        (existing as Record<string, any>).数量 = existing.堆叠数量;
        (existing as Record<string, any>).旧寄售原物ID = existing.ID;
    } else {
        const restored = 复制旧档对象(item);
        delete restored.已装备;
        delete restored.当前装备部位;
        if (!restored.ID || items.some(entry => entry.ID === restored.ID)) {
            restored.ID = `legacy_refund_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }
        restored.旧寄售原物ID = restored.ID;
        restored.数量 = restored.堆叠数量 = quantity;
        items.push(restored as any);
    }
    role.物品列表 = items;
    return quantity;
};

const 是玩家寄售 = (entry: LegacyAuctionEntry, player: string) => Boolean(entry && (
    String(entry.来源描述 || '').includes('玩家寄售') || entry.卖家ID === 'player'
    || (player && (entry.卖家ID === player || entry.卖家名称 === player))
));
const 待结算 = (entry: LegacyAuctionEntry) => (entry.状态 === '上架中' && Boolean(entry.物品 && typeof entry.物品 === 'object'))
    || (entry.状态 === '已成交' && Number(entry.未入账金额BaseAmount) > 0);

const 稳定序列 = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(稳定序列);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, 稳定序列(v)]));
};

// 无寄售 ID 的早期备份按上架时的属性和同表出现次数配对，状态与成交金额会随交易进展变化。
const 索引寄售条目 = (entries: LegacyAuctionEntry[], player: string) => {
    const counts = new Map<string, number>();
    return entries.map(entry => {
        if (!是玩家寄售(entry, player)) return { entry, key: '' };
        if (entry.ID != null && String(entry.ID).trim()) return { entry, key: 'id:' + String(entry.ID).trim() };
        const signature = JSON.stringify(稳定序列([entry.物品, entry.上架时间, entry.起拍价, entry.一口价, entry.标价货币]));
        const occurrence = (counts.get(signature) || 0) + 1;
        counts.set(signature, occurrence);
        return { entry, key: `legacy:${signature}:${occurrence}` };
    });
};

const 读取旧拍卖行 = (storage: StorageLike | null | undefined, key: string): Auction | undefined => {
    try {
        const raw = (storage === undefined ? globalThis.localStorage : storage)?.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
};

export const 检查旧版寄售 = (save: Save, storage?: StorageLike | null) => {
    const local = 读取旧拍卖行(storage, 获取旧版拍卖行存储键(save));
    const player = save.角色数据?.姓名 || '';
    const hasEntry = (auction: Auction | undefined, test: (entry: LegacyAuctionEntry) => boolean) => 列表字段.some(field =>
        Array.isArray(auction?.[field]) && auction[field]!.some(entry => 是玩家寄售(entry, player) && test(entry)));
    if (hasEntry(save.拍卖行, 待结算) || hasEntry(local, 待结算)) return '待领取';
    // 从旧云档重新进入时，查回本地已领取的同一存档；全新进度无须创建迁移副本。
    if (!save.元数据?.旧寄售迁移原档哈希 && hasEntry(local, entry => String(entry.来源描述 || '').includes('2.0读档迁移'))) return '核对旧档';
    return null;
};

const 核销条目 = (entry: LegacyAuctionEntry, status?: 领取结果): LegacyAuctionEntry => {
    if (!status || !待结算(entry)) return entry;
    return status === '已成交'
        ? { ...entry, 状态: status, 未入账金额BaseAmount: 0, 来源描述: '玩家寄售（2.0读档迁移已处理）' }
        : { ...entry, 状态: status, 来源描述: '玩家寄售（2.0读档迁移已处理）' };
};

export const 迁移旧版拍卖行寄售资产 = (params: {
    save: Save; role: 角色数据结构; openingConfig?: OpeningConfig; storage?: StorageLike | null; receipts?: 寄售领取凭据;
}) => {
    const { save, role } = params;
    const local = 读取旧拍卖行(params.storage, 获取旧版拍卖行存储键(save));
    const nextAuction: Auction | undefined = save.拍卖行 && { ...save.拍卖行 };
    const groups = new Map<string, LegacyAuctionEntry[]>();
    const localKeys = new Set<string>();
    for (const auction of [nextAuction, local]) {
        for (const field of 列表字段) {
            if (!Array.isArray(auction?.[field])) continue;
            for (const { entry, key } of 索引寄售条目(auction[field]!, role.姓名)) {
                if (!key) continue;
                const group = groups.get(key) || [];
                group.push(entry);
                groups.set(key, group);
                if (auction === local) localKeys.add(key);
            }
        }
    }
    let nextRole = role;
    let restoredItemCount = 0;
    let creditedBaseAmount = 0;
    const notes: string[] = [];
    const claims: 寄售领取凭据 = {};
    const localClaims: 寄售领取凭据 = {};
    const config = params.openingConfig ?? save.openingConfig;
    const currency = config && { runtimeProfile: config.modeRuntimeProfile, 货币模式: 获取货币显示模式(config, role) };
    const tradeCurrency = 获取交易币制(config, role);

    for (const [key, copies] of groups) {
        if (!copies.some(待结算)) continue;
        let status = params.receipts?.[key];
        if (!status) {
            const sold = copies.filter(entry => entry.状态 === '已成交');
            if (sold.length) {
                status = '已成交';
                // 已领款的镜像优先于旧的待领款和待售镜像。
                const amount = sold.some(entry => entry.未入账金额BaseAmount != null && Number(entry.未入账金额BaseAmount) === 0) ? 0
                    : Math.max(0, ...sold.map(entry => Number(entry.未入账金额BaseAmount) || 0));
                if (amount > 0) {
                    const bag = nextRole.物品列表 || [];
                    const balance = 读取交易钱袋(nextRole.金钱, bag, tradeCurrency).balance + amount;
                    if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(amount)) throw new Error('旧寄售款超出角色可记录的金额，已保留待领取款项。');
                    if (tradeCurrency.cashEnabled) {
                        const money = 写入交易钱袋(nextRole.金钱, balance, tradeCurrency);
                        nextRole = { ...nextRole, 金钱: money as 角色数据结构['金钱'], 物品列表: 同步玩家实体货币(bag, nextRole.金钱, money, tradeCurrency) as 角色数据结构['物品列表'] };
                    } else {
                        const credited = 变更角色货币BaseAmount(nextRole, amount, currency);
                        if (credited === nextRole) throw new Error('旧寄售款无法入账，已保留待领取款项。');
                        nextRole = credited;
                    }
                    creditedBaseAmount += amount;
                    notes.push(`已结算旧版寄售未领款项（底层值 ${amount}）`);
                }
            } else {
                status = '已下架';
                const item = copies.find(entry => entry.状态 === '上架中' && entry.物品)?.物品;
                if (item && !copies.some(entry => entry.状态 === '已下架')) {
                    if (!restoredItemCount) nextRole = 复制旧档对象(nextRole);
                    const qty = 取寄售物品(nextRole, item);
                    restoredItemCount += qty;
                    notes.push(`已将旧版寄售品「${String(item.名称 || '未命名物品')}」x${qty} 退回背包`);
                }
            }
        }
        claims[key] = status;
        if (localKeys.has(key)) localClaims[key] = status;
    }

    let embeddedChanged = false;
    for (const field of 列表字段) {
        if (!Array.isArray(nextAuction?.[field])) continue;
        nextAuction[field] = 索引寄售条目(nextAuction[field]!, role.姓名).map(({ entry, key }) => {
            const next = 核销条目(entry, claims[key]);
            if (next !== entry) embeddedChanged = true;
            return next;
        });
    }
    if (restoredItemCount) 同步角色储物负重上限(nextRole);
    return { nextRole, nextAuction, localClaims, embeddedChanged, restoredItemCount, creditedBaseAmount, notes, mutated: Object.keys(claims).length > 0 };
};

// IndexedDB 事务确认提交之后再更新 V1 格式。重读保留同时新上架或变更的无关条目。
export const 核销旧版寄售缓存 = (save: Save, receipts: 寄售领取凭据, storage?: StorageLike | null) => {
    if (!Object.keys(receipts).length) return;
    const key = 获取旧版拍卖行存储键(save);
    const local = 读取旧拍卖行(storage, key);
    if (!local) return;
    let changed = false;
    for (const field of 列表字段) {
        if (!Array.isArray(local[field])) continue;
        local[field] = 索引寄售条目(local[field]!, save.角色数据?.姓名 || '').map(({ entry, key }) => {
            const next = 核销条目(entry, receipts[key]);
            if (next !== entry) changed = true;
            return next;
        });
    }
    try {
        if (changed) (storage === undefined ? globalThis.localStorage : storage)?.setItem(key, JSON.stringify(local));
    } catch { /* 已持久化的领取凭据在再次读档时阻止重复发放，并重试清理。 */ }
};
