import type { DirectorWorldBible } from '../../models/directorBible';
import type { 游戏物品 } from '../../models/item';
import type {
    NPC背包物品,
    NPC结构,
    OpeningConfig,
    世界数据结构,
    场外交易记录结构,
    角色数据结构
} from '../../types';
import {
    变更角色货币BaseAmount,
    是否货币类物品,
    获取货币显示模式,
    计算角色货币底层总值
} from '../../utils/currencyDisplay';
import { 推断单位仙侠 } from '../../utils/realmDisplay';
import { 判断角色对话位置, type 角色对话位置判定 } from '../../utils/roleChatLocation';

export interface TradeVenueInfo {
    available: boolean;
    venueName: string;
    venueType: string;
    description: string;
}

export interface NpcTradeEligibility {
    eligible: boolean;
    locationCheck: 角色对话位置判定;
    attitudeLabel: string;
    priceMultiplier: number; // Buy from counterparty multiplier; sell rate = base / multiplier
    reason: string;
    maxBuyBudgetBase: number;
}

export interface TradableItemView {
    id: string;
    name: string;
    type: string;
    description: string;
    quantity: number;
    unitPriceBase: number;
    equippedLocked: boolean;
    source: 'player' | 'npc' | 'venue';
}

const 品质基价表: Record<string, number> = {
    凡品: 50,
    下品: 80,
    良品: 220,
    中品: 260,
    上品: 750,
    极品: 1800,
    绝世: 4500,
    传说: 9000
};

const 交易场所正则 = /(坊市|集市|市集|黑市|暗市|商铺|商店|杂货铺|药堂|丹阁|当铺|牙行|银号|钱庄|商会|酒楼|客栈|茶肆|百宝阁|铁匠铺|器阁|拍卖|珍宝阁)/u;
const 敌对关系正则 = /(敌对|仇敌|死敌|追杀|通缉|绝交|决裂|围杀|刺杀|厮杀|敌意)/u;

const 取文本 = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const 计算稳定哈希 = (seed: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const 估算物品单价Base = (item: { 名称?: string; 类型?: string; 品质?: string; 价值?: unknown; 价格?: unknown }): number => {
    const explicit = Number(item?.价值 ?? item?.价格);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(10, Math.floor(explicit));
    const quality = 取文本(item?.品质);
    if (quality && 品质基价表[quality]) return 品质基价表[quality];
    const hay = `${item?.名称 || ''} ${item?.类型 || ''}`;
    if (/丹|药|散|丸|膏/u.test(hay)) return 160;
    if (/剑|刀|枪|甲|袍|盾|弓|暗器|秘籍|功法|符/u.test(hay)) return 320;
    if (/玉|佩|印|牌|信物|残片|古图/u.test(hay)) return 400;
    return 100;
};

export const 检测当前交易场所 = (
    env: any,
    world?: Partial<世界数据结构> | null,
    directorBible?: DirectorWorldBible | null
): TradeVenueInfo => {
    const concrete = 取文本(env?.具体地点);
    const small = 取文本(env?.小地点);
    const district = 取文本(env?.区地点);
    const mid = 取文本(env?.中地点);
    const areaText = [concrete, district, small, mid].filter(Boolean).join(' · ');

    const directHit = [concrete, district, small].find((part) => 交易场所正则.test(part));
    if (directHit) {
        const match = directHit.match(交易场所正则);
        const venueType = match?.[1] || '商铺/坊市';
        return {
            available: true,
            venueName: concrete || small || venueType,
            venueType,
            description: `当前位于「${concrete || small}」（${venueType}），可与掌柜或场内摊位直接交易现货。`
        };
    }

    const activeNodeDesc = (world?.地图层级 || [])
        .filter((node) => node?.名称 && (node.名称 === concrete || node.名称 === small))
        .map((node) => `${node.名称} ${node.描述 || ''} ${node.叙事核心 || ''}`)
        .join('\n');
    const briefFocus = `${directorBible?.下回合导演简报?.本回合舞台焦点 || ''} ${directorBible?.下回合导演简报?.必须守住的悬念或冲突 || ''}`;
    const indirectHay = `${activeNodeDesc}\n${briefFocus}`;
    const indirectHit = indirectHay.match(交易场所正则);
    if (indirectHit) {
        return {
            available: true,
            venueName: concrete || small || areaText || indirectHit[1],
            venueType: indirectHit[1],
            description: `当前场景语境已进入「${indirectHit[1]}」交易点，允许查看场所陈列货品并折价买卖。`
        };
    }

    return {
        available: false,
        venueName: areaText || '野外/非交易区',
        venueType: '',
        description: '当前地点并非商铺、坊市或剧情拍卖席；仅可与在场且非敌对的人物交换身上物件，或先前往坊市/商铺。'
    };
};

export const 评估NPC交易资格 = (
    npc: NPC结构,
    env: any,
    directorBible?: DirectorWorldBible | null
): NpcTradeEligibility => {
    const locationCheck = 判断角色对话位置(npc, env);
    const name = 取文本(npc?.姓名) || '对方';
    const castTier = directorBible?.核心卡司?.find((c) => c.姓名 === name)?.所处层级 || 1;
    const baseBudget = Math.max(200, castTier * 900 + Math.max(0, Number(npc?.境界层级) || 1) * 400);

    if (locationCheck.状态 === 'blocked') {
        return {
            eligible: false,
            locationCheck,
            attitudeLabel: '无法接触',
            priceMultiplier: 1,
            reason: locationCheck.原因,
            maxBuyBudgetBase: 0
        };
    }

    const relText = `${npc?.关系状态 || ''} ${(npc as any)?.关系 || ''} ${(npc as any)?.行动意图 || ''}`;
    const favor = Number.isFinite(Number(npc?.好感度)) ? Number(npc.好感度) : 0;
    if (敌对关系正则.test(relText) || favor <= -30) {
        return {
            eligible: false,
            locationCheck,
            attitudeLabel: '敌对拒交易',
            priceMultiplier: 1,
            reason: `${name}与你处于敌对或高度戒备状态（关系：${取文本(npc?.关系状态) || 取文本((npc as any)?.关系) || '敌对'}，好感 ${favor}），拒绝在冲突氛围中与你做买卖！`,
            maxBuyBudgetBase: 0
        };
    }

    if (favor < 0) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '冷淡溢价',
            priceMultiplier: 1.35,
            reason: `${name}对你尚存疑虑（好感 ${favor}），开价偏高，但可凭等价物或诚意换取。`,
            maxBuyBudgetBase: baseBudget
        };
    }
    if (favor < 40) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '市价交易',
            priceMultiplier: 1.1,
            reason: `${name}与你交情平平，愿按江湖市价银货两讫。`,
            maxBuyBudgetBase: baseBudget
        };
    }
    if (favor < 75) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '友好让利',
            priceMultiplier: 0.95,
            reason: `${name}对你颇有信赖，交易时愿酌情让利。`,
            maxBuyBudgetBase: Math.round(baseBudget * 1.25)
        };
    }
    return {
        eligible: true,
        locationCheck,
        attitudeLabel: '倾囊相助',
        priceMultiplier: 0.8,
        reason: `${name}视你为心腹之人，价格仅象征性折算。`,
        maxBuyBudgetBase: Math.round(baseBudget * 1.5)
    };
};

export const 提取主角可交易物品列表 = (role: 角色数据结构): TradableItemView[] => {
    const equippedValues = new Set(
        Object.values(role?.装备 || {})
            .map((v) => 取文本(v))
            .filter(Boolean)
    );
    const items = Array.isArray(role?.物品列表) ? role.物品列表 : [];
    return items
        .filter((item: any) => item && !是否货币类物品(item))
        .map((item: any, idx: number): TradableItemView | null => {
            const name = 取文本(typeof item === 'string' ? item : item.名称);
            if (!name) return null;
            const id = 取文本(item?.ID) || `player-item-${idx}-${name}`;
            const quantity = Math.max(1, Math.floor(Number(item?.堆叠数量 ?? item?.数量) || 1));
            const equippedLocked = equippedValues.has(name) || (Boolean(item?.ID) && equippedValues.has(String(item.ID)));
            return {
                id,
                name,
                type: 取文本(item?.类型) || '杂物',
                description: 取文本(item?.描述) || '随身携带物件',
                quantity,
                unitPriceBase: 估算物品单价Base(item),
                equippedLocked,
                source: 'player'
            };
        })
        .filter((x): x is TradableItemView => x !== null);
};

const 按身份生成随身货单 = (
    npc: NPC结构,
    seedKey: string,
    isXianxia: boolean
): Array<{ name: string; type: string; description: string; quantity: number; unitPriceBase: number }> => {
    const roleHint = `${npc?.身份 || ''} ${npc?.简介 || ''}`;
    const pool: Array<{ name: string; type: string; description: string; quantity: number; unitPriceBase: number }> = [];
    if (/医|药|丹/u.test(roleHint)) {
        pool.push(
            { name: isXianxia ? '回春散' : '金疮药', type: '丹药', description: '外伤急用良药', quantity: 2, unitPriceBase: 140 },
            { name: '解毒丸', type: '丹药', description: '化解常见瘴毒与迷烟', quantity: 1, unitPriceBase: 210 }
        );
    } else if (/商|掌柜|行脚|帮/u.test(roleHint)) {
        pool.push(
            { name: '行商密引', type: '凭证', description: '可免沿途关卡盘查一次的商路文书', quantity: 1, unitPriceBase: 320 },
            { name: '干粮水囊', type: '食物', description: '耐放实惠的远行补给', quantity: 2, unitPriceBase: 45 }
        );
    } else {
        pool.push(
            { name: '随身伤药', type: '药品', description: '常备应急止血药包', quantity: 1, unitPriceBase: 120 },
            { name: '精钢飞镖', type: '暗器', description: '趁手防身利器', quantity: 3, unitPriceBase: 90 }
        );
    }
    const h = 计算稳定哈希(seedKey);
    if (h % 2 === 0) {
        pool.push({
            name: isXianxia ? '下品聚气符' : '火折与迷香',
            type: '消耗品',
            description: '关键时刻能派上用场的随身暗手',
            quantity: 1,
            unitPriceBase: 180
        });
    }
    return pool;
};

export const 提取交易对方库存列表 = (params: {
    targetType: 'npc' | 'venue';
    npc?: NPC结构 | null;
    venue?: TradeVenueInfo | null;
    openingConfig?: OpeningConfig | null;
    turnSeed?: number;
}): { items: TradableItemView[]; purseBase: number } => {
    const isXianxia = /仙侠|玄幻/.test(String(params.openingConfig?.题材模式 || ''));
    if (params.targetType === 'npc' && params.npc) {
        const npc = params.npc;
        const bag = Array.isArray(npc.背包) ? npc.背包 : [];
        const realItems: TradableItemView[] = bag
            .filter((b: NPC背包物品) => b && 取文本(b.名称))
            .map((b: NPC背包物品, idx: number) => ({
                id: `npc-bag-${npc.id || npc.姓名}-${idx}-${b.名称}`,
                name: b.名称.trim(),
                type: 取文本(b.类型) || '随身物',
                description: 取文本(b.描述) || `${npc.姓名}随身携物`,
                quantity: Math.max(1, Math.floor(Number(b.数量) || 1)),
                unitPriceBase: 估算物品单价Base({ 名称: b.名称, 类型: b.类型 }),
                equippedLocked: false,
                source: 'npc'
            }));
        const fallback = realItems.length > 0
            ? []
            : 按身份生成随身货单(npc, `${npc.id || npc.姓名}:${params.turnSeed || 1}`, isXianxia).map((x, idx) => ({
                id: `npc-seeded-${idx}-${x.name}`,
                name: x.name,
                type: x.type,
                description: x.description,
                quantity: x.quantity,
                unitPriceBase: x.unitPriceBase,
                equippedLocked: false,
                source: 'npc' as const
            }));
        const purseBase = Math.max(300, (Number(npc.境界层级) || 1) * 550);
        return { items: [...realItems, ...fallback], purseBase };
    }

    const vType = params.venue?.venueType || '坊市';
    const rawCatalog: Array<{ name: string; type: string; description: string; quantity: number; unitPriceBase: number }> = /药|丹/.test(vType)
        ? [
            { name: isXianxia ? '凝元丹' : '九花玉露丸', type: '丹药', description: '迅速恢复内力与元气', quantity: 2, unitPriceBase: 360 },
            { name: '止血散', type: '药品', description: '止血疗伤必备常药', quantity: 4, unitPriceBase: 90 },
            { name: '清心解毒丹', type: '丹药', description: '解常见毒物', quantity: 2, unitPriceBase: 220 }
        ]
        : /拍卖|珍宝|百宝/.test(vType)
            ? [
                { name: isXianxia ? '残缺古阵玉简' : '前朝残损剑谱页', type: '秘宝', description: '来源隐秘的残篇拓片，可作谈判筹码', quantity: 1, unitPriceBase: 1200 },
                { name: '玄铁护心镜', type: '防具', description: '关键时刻可挡致命一击', quantity: 1, unitPriceBase: 850 },
                { name: isXianxia ? '上品回灵丹' : '大还丹', type: '丹药', description: '珍稀保命灵药', quantity: 1, unitPriceBase: 950 }
            ]
            : /铁匠|器/.test(vType)
                ? [
                    { name: '百炼长剑', type: '武器', description: '开锋利器，显著提升交手攻势', quantity: 1, unitPriceBase: 480 },
                    { name: '牛皮轻甲', type: '护甲', description: '贴身防护，不碍身法', quantity: 1, unitPriceBase: 420 },
                    { name: '寒铁袖箭', type: '暗器', description: '出其不意近身牵制', quantity: 2, unitPriceBase: 240 }
                ]
                : [
                    { name: '百炼短刀', type: '武器', description: '市面常见利刃，适合防身', quantity: 1, unitPriceBase: 320 },
                    { name: '金疮药', type: '药品', description: '应急外伤药粉', quantity: 3, unitPriceBase: 110 },
                    { name: '干粮与烈酒', type: '食物', description: '行路必备，也能用以换取消息', quantity: 3, unitPriceBase: 55 },
                    { name: '江湖通行路引', type: '杂物', description: '应付关卡查验的官印文书', quantity: 1, unitPriceBase: 260 }
                ];

    return {
        items: rawCatalog.map((item, idx) => ({
            id: `venue-${vType}-${idx}-${item.name}`,
            ...item,
            equippedLocked: false,
            source: 'venue'
        })),
        purseBase: 2400
    };
};

export interface ExecuteTradeParams {
    targetType: 'npc' | 'venue';
    targetName: string;
    npcId?: string;
    locationLabel: string;
    role: 角色数据结构;
    social: NPC结构[];
    openingConfig?: OpeningConfig | null;
    playerItemsOffered: Array<{ name: string; quantity: number; unitPriceBase: number }>;
    counterpartyItemsBought: Array<{ name: string; type: string; description: string; quantity: number; unitPriceBase: number }>;
    playerCashPaidBase: number;
    playerCashReceivedBase: number;
    priceMultiplier: number;
    maxCounterpartyPurseBase: number;
    barterNote?: string;
}

export interface ExecuteTradeResult {
    ok: boolean;
    error?: string;
    nextRole?: 角色数据结构;
    nextSocial?: NPC结构[];
    record?: 场外交易记录结构;
}

export const 执行情境交易结算 = (params: ExecuteTradeParams): ExecuteTradeResult => {
    const mode = 获取货币显示模式(params.openingConfig, params.role);
    const isXianxia = 推断单位仙侠(params.role) || /仙侠|玄幻/.test(String(params.openingConfig?.题材模式 || ''));
    const profile = params.openingConfig?.modeRuntimeProfile;
    const playerMoneyBase = 计算角色货币底层总值(params.role?.金钱, profile, mode);

    const paidBase = Math.max(0, Math.floor(Number(params.playerCashPaidBase) || 0));
    const receivedBase = Math.max(0, Math.floor(Number(params.playerCashReceivedBase) || 0));
    if (paidBase > playerMoneyBase) {
        return { ok: false, error: `随身货币不足（当前可用 ${playerMoneyBase} 基础单位，尝试支付 ${paidBase}）。` };
    }
    if (receivedBase > params.maxCounterpartyPurseBase) {
        return { ok: false, error: `${params.targetName} 随身现银上限约 ${params.maxCounterpartyPurseBase}，拿不出更多现银，请改用「以物易物」。` };
    }
    if (params.playerItemsOffered.length === 0 && params.counterpartyItemsBought.length === 0 && paidBase === 0 && receivedBase === 0) {
        return { ok: false, error: '请至少选择一件物品或填写交易金额。' };
    }

    // Clone role & check item availability
    const nextRole: 角色数据结构 = JSON.parse(JSON.stringify(params.role));
    nextRole.物品列表 = Array.isArray(nextRole.物品列表) ? nextRole.物品列表 : [];
    const equippedValues = new Set(Object.values(nextRole.装备 || {}).map((v) => 取文本(v)).filter(Boolean));

    let playerOfferValue = paidBase;
    for (const offer of params.playerItemsOffered) {
        if (!offer.name || offer.quantity <= 0) continue;
        const idx = nextRole.物品列表.findIndex((it: any) => 取文本(it?.名称 || it) === offer.name);
        if (idx < 0) return { ok: false, error: `背包中未找到「${offer.name}」。` };
        const entry: any = nextRole.物品列表[idx];
        if (equippedValues.has(offer.name) || (entry?.ID && equippedValues.has(String(entry.ID)))) {
            return { ok: false, error: `「${offer.name}」正在穿戴中，请先到装备栏卸下再交易。` };
        }
        const curQty = Math.max(1, Math.floor(Number(entry?.堆叠数量 ?? entry?.数量) || 1));
        if (curQty < offer.quantity) {
            return { ok: false, error: `「${offer.name}」数量不足（仅有 ${curQty}，尝试交出 ${offer.quantity}）。` };
        }
        playerOfferValue += Math.round(offer.unitPriceBase * 0.7) * offer.quantity;
        const left = curQty - offer.quantity;
        if (left > 0 && typeof entry === 'object') {
            entry.数量 = left;
            if ('堆叠数量' in entry) entry.堆叠数量 = left;
        } else {
            nextRole.物品列表.splice(idx, 1);
        }
    }

    let counterpartyAskValue = receivedBase;
    for (const buy of params.counterpartyItemsBought) {
        if (!buy.name || buy.quantity <= 0) continue;
        counterpartyAskValue += Math.round(buy.unitPriceBase * params.priceMultiplier) * buy.quantity;
        const existingIdx = nextRole.物品列表.findIndex((it: any) => 取文本(it?.名称) === buy.name);
        if (existingIdx >= 0) {
            const target: any = nextRole.物品列表[existingIdx];
            const curQty = Math.max(1, Math.floor(Number(target?.堆叠数量 ?? target?.数量) || 1));
            target.数量 = curQty + buy.quantity;
            if ('堆叠数量' in target) target.堆叠数量 = curQty + buy.quantity;
        } else {
            nextRole.物品列表.push({
                ID: `trade_${Date.now()}_${nextRole.物品列表.length + 1}`,
                名称: buy.name,
                类型: (buy.type as 游戏物品['类型']) || '杂物',
                品质: '良品',
                描述: buy.description || `购自${params.targetName}`,
                数量: buy.quantity,
                堆叠数量: buy.quantity,
                重量: 1,
                价值: buy.unitPriceBase
            } as any);
        }
    }

    if (playerOfferValue < counterpartyAskValue) {
        return {
            ok: false,
            error: `出价未达对方心理底线（己方筹码估价 ${playerOfferValue} < 对方要价 ${counterpartyAskValue}，差额 ${counterpartyAskValue - playerOfferValue}）。`
        };
    }

    const updatedRole = 变更角色货币BaseAmount(nextRole, receivedBase - paidBase, {
        runtimeProfile: profile,
        货币模式: mode,
        仙侠模式: isXianxia
    });

    // Update NPC inventory & slight favor if NPC trade
    const nextSocial: NPC结构[] = JSON.parse(JSON.stringify(params.social || []));
    if (params.targetType === 'npc') {
        const npcIdx = nextSocial.findIndex(
            (n) => (params.npcId && n.id === params.npcId) || n.姓名 === params.targetName
        );
        if (npcIdx >= 0) {
            const npc = nextSocial[npcIdx];
            const bag: NPC背包物品[] = Array.isArray(npc.背包) ? [...npc.背包] : [];
            for (const buy of params.counterpartyItemsBought) {
                const bi = bag.findIndex((b) => 取文本(b.名称) === buy.name);
                if (bi >= 0) {
                    const left = Math.max(0, (Number(bag[bi].数量) || 1) - buy.quantity);
                    if (left > 0) bag[bi] = { ...bag[bi], 数量: left };
                    else bag.splice(bi, 1);
                }
            }
            for (const offer of params.playerItemsOffered) {
                const bi = bag.findIndex((b) => 取文本(b.名称) === offer.name);
                if (bi >= 0) {
                    bag[bi] = { ...bag[bi], 数量: (Number(bag[bi].数量) || 1) + offer.quantity };
                } else {
                    bag.push({ 名称: offer.name, 数量: offer.quantity, 描述: '交易所得' });
                }
            }
            npc.背包 = bag;
            npc.好感度 = Math.min(100, (Number(npc.好感度) || 0) + 1);
        }
    }

    const spentText = [
        ...params.playerItemsOffered.map((i) => `${i.name}×${i.quantity}`),
        ...(paidBase > 0 ? [`货币${paidBase}基础单位`] : [])
    ].join('、') || '无';
    const gotText = [
        ...params.counterpartyItemsBought.map((i) => `${i.name}×${i.quantity}`),
        ...(receivedBase > 0 ? [`货币${receivedBase}基础单位`] : [])
    ].join('、') || '无';
    const summary = `【情境交易成交｜${params.locationLabel}】向「${params.targetName}」交出[${spentText}]，换得[${gotText}]${params.barterNote ? `（交涉附言：${params.barterNote}）` : ''}`;

    const record: 场外交易记录结构 = {
        id: `trade-${Date.now()}`,
        对象类型: params.targetType,
        对象名称: params.targetName,
        npcId: params.npcId,
        地点: params.locationLabel,
        玩家支出物品: params.playerItemsOffered.map((x) => ({ 名称: x.name, 数量: x.quantity })),
        玩家获得物品: params.counterpartyItemsBought.map((x) => ({ 名称: x.name, 数量: x.quantity })),
        玩家支出金钱Base: paidBase,
        玩家获得金钱Base: receivedBase,
        成交摘要: summary,
        时间: Date.now()
    };

    return { ok: true, nextRole: updatedRole, nextSocial, record };
};

export const 构建场外交易注入块 = (records?: 场外交易记录结构[] | null): string => {
    if (!Array.isArray(records) || records.length === 0) return '';
    return [
        '【本回合前置交易既成事实（道具与货币已在面板实时落账，正文必须自然承接，不可推翻或重复扣款）】',
        ...records.map((r) => `- ${r.成交摘要}`)
    ].join('\n');
};
