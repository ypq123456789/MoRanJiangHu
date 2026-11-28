import type { OpeningConfig, 存档结构, 游戏设置结构, 角色数据结构 } from '../types';
import { 变更角色货币BaseAmount, 获取货币显示模式, type 货币显示模式 } from './currencyDisplay';
import { 同步角色储物负重上限 } from './storageCarry';

const LEGACY_AUCTION_STORAGE_PREFIX = 'moranjianghu_auction_house_v2';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type LegacyAuctionEntry = {
    ID?: string;
    物品?: Record<string, any>;
    卖家名称?: string;
    卖家ID?: string;
    一口价?: number;
    起拍价?: number;
    当前价格?: number;
    标价货币?: string;
    状态?: string;
    来源描述?: string;
    未入账金额BaseAmount?: number;
};

export interface LegacyAuctionMigrationResult {
    nextRole: 角色数据结构;
    restoredItemCount: number;
    creditedBaseAmount: number;
    mutated: boolean;
    notes: string[];
}

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

const 合并退回物品到角色背包 = (role: 角色数据结构, itemLike: Record<string, any>): 角色数据结构 => {
    const nextRole = JSON.parse(JSON.stringify(role)) as 角色数据结构;
    const list = Array.isArray(nextRole.物品列表) ? [...nextRole.物品列表] : [];
    const incomingQty = Math.max(1, Math.floor(Number(itemLike?.堆叠数量 ?? itemLike?.数量 ?? 1) || 1));
    const itemName = typeof itemLike?.名称 === 'string' ? itemLike.名称.trim() : '';
    const itemId = typeof itemLike?.ID === 'string' ? itemLike.ID.trim() : '';
    const stackable = itemLike?.可堆叠 === true || itemLike?.堆叠数量 !== undefined;

    const existingIdx = list.findIndex((item: any) => {
        if (itemId && item?.ID === itemId) return true;
        return Boolean(itemName) && item?.名称 === itemName && stackable && !item?.已装备;
    });

    if (existingIdx >= 0 && stackable) {
        const currentQty = Math.max(1, Math.floor(Number((list[existingIdx] as any).堆叠数量 ?? 1) || 1));
        list[existingIdx] = {
            ...list[existingIdx],
            堆叠数量: currentQty + incomingQty
        };
    } else {
        const cloned = JSON.parse(JSON.stringify(itemLike));
        delete cloned.已装备;
        delete cloned.当前装备部位;
        if (!cloned.ID) cloned.ID = `legacy_refund_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        cloned.堆叠数量 = incomingQty;
        list.push(cloned as any);
    }

    nextRole.物品列表 = list;
    return 同步角色储物负重上限(nextRole) as 角色数据结构;
};

const 是否玩家寄售条目 = (entry: LegacyAuctionEntry, playerName: string): boolean => {
    if (!entry || typeof entry !== 'object') return false;
    const sourceText = String(entry.来源描述 || '');
    const sellerId = String(entry.卖家ID || '').trim();
    const sellerName = String(entry.卖家名称 || '').trim();
    return sourceText.includes('玩家寄售')
        || sellerId === 'player'
        || (Boolean(playerName) && (sellerId === playerName || sellerName === playerName));
};

const 迁移单组寄售条目 = (
    entries: LegacyAuctionEntry[],
    role: 角色数据结构,
    playerName: string,
    currencyOptions?: { runtimeProfile?: OpeningConfig['modeRuntimeProfile']; 货币模式?: 货币显示模式 }
): {
    nextEntries: LegacyAuctionEntry[];
    nextRole: 角色数据结构;
    restoredItemCount: number;
    creditedBaseAmount: number;
    notes: string[];
    changed: boolean;
} => {
    let nextRole = role;
    let restoredItemCount = 0;
    let creditedBaseAmount = 0;
    const notes: string[] = [];
    let changed = false;

    const nextEntries = entries.map((entry) => {
        if (!是否玩家寄售条目(entry, playerName)) return entry;
        if (entry.状态 === '上架中' && entry.物品 && typeof entry.物品 === 'object') {
            nextRole = 合并退回物品到角色背包(nextRole, entry.物品);
            const qty = Math.max(1, Math.floor(Number(entry.物品?.堆叠数量 ?? entry.物品?.数量 ?? 1) || 1));
            restoredItemCount += qty;
            notes.push(`已将旧版拍卖行待售寄售品「${String(entry.物品?.名称 || '未命名物品')}」x${qty} 退回背包`);
            changed = true;
            return {
                ...entry,
                状态: '已下架',
                来源描述: '玩家寄售（2.0读档迁移已退回背包）'
            };
        }
        const unclaimedBase = Math.max(0, Math.floor(Number(entry.未入账金额BaseAmount || 0) || 0));
        if (entry.状态 === '已成交' && unclaimedBase > 0) {
            nextRole = 变更角色货币BaseAmount(nextRole, unclaimedBase, currencyOptions);
            creditedBaseAmount += unclaimedBase;
            notes.push(`已结算旧版寄售未领款项（底层值 ${unclaimedBase}）`);
            changed = true;
            return {
                ...entry,
                未入账金额BaseAmount: 0
            };
        }
        return entry;
    });

    return { nextEntries, nextRole, restoredItemCount, creditedBaseAmount, notes, changed };
};

export const 迁移旧版拍卖行寄售资产 = (params: {
    save: Partial<存档结构> & Record<string, any>;
    role: 角色数据结构;
    openingConfig?: OpeningConfig;
    gameConfig?: 游戏设置结构;
    storage?: StorageLike | null;
}): LegacyAuctionMigrationResult => {
    let nextRole = params.role;
    let restoredItemCount = 0;
    let creditedBaseAmount = 0;
    const notes: string[] = [];
    let mutated = false;
    const playerName = typeof nextRole?.姓名 === 'string' ? nextRole.姓名.trim() : '';
    const currencyOptions = params.openingConfig
        ? {
            runtimeProfile: params.openingConfig.modeRuntimeProfile,
            货币模式: 获取货币显示模式(params.openingConfig, nextRole)
        }
        : undefined;

    // 1. 检查存档对象上可能残留的旧寄售结构（如早期或自定义存档中的 save.拍卖行）
    const saveAuction = (params.save as any)?.拍卖行;
    if (saveAuction && typeof saveAuction === 'object') {
        for (const listKey of ['玩家寄售列表', '拍卖品列表'] as const) {
            if (!Array.isArray(saveAuction[listKey])) continue;
            const res = 迁移单组寄售条目(saveAuction[listKey], nextRole, playerName, currencyOptions);
            if (res.changed) {
                saveAuction[listKey] = res.nextEntries;
                nextRole = res.nextRole;
                restoredItemCount += res.restoredItemCount;
                creditedBaseAmount += res.creditedBaseAmount;
                notes.push(...res.notes);
                mutated = true;
            }
        }
    }

    // 2. 检查 V1 存储在 localStorage 的作用域拍卖行状态
    const storage = params.storage === undefined
        ? (typeof window !== 'undefined' ? window.localStorage : null)
        : params.storage;
    if (storage) {
        try {
            const storageKey = 获取旧版拍卖行存储键({
                游戏初始时间: params.save?.游戏初始时间,
                角色数据: params.save?.角色数据 || nextRole,
                历史记录: params.save?.历史记录
            });
            const raw = storage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.拍卖品列表)) {
                    const res = 迁移单组寄售条目(parsed.拍卖品列表, nextRole, playerName, currencyOptions);
                    if (res.changed) {
                        parsed.拍卖品列表 = res.nextEntries;
                        storage.setItem(storageKey, JSON.stringify(parsed));
                        nextRole = res.nextRole;
                        restoredItemCount += res.restoredItemCount;
                        creditedBaseAmount += res.creditedBaseAmount;
                        notes.push(...res.notes);
                        mutated = true;
                    }
                }
            }
        } catch {
            // 读取旧版 localStorage 异常时不阻断读档流程
        }
    }

    return {
        nextRole,
        restoredItemCount,
        creditedBaseAmount,
        mutated,
        notes
    };
};
