import type { DirectorWorldBible } from '../../models/directorBible';
import { 构建地点树, 地点路径匹配分支 } from '../../utils/locationTree';
import type {
    NPC背包物品,
    NPC结构,
    OpeningConfig,
    世界数据结构,
    场外交易记录结构,
    角色数据结构
} from '../../types';
import { 是否货币类物品 } from '../../utils/currencyDisplay';
import { 获取交易币制, 物品交易面额, 读取交易钱袋, 写入交易钱袋, 交易物品数量, 同步玩家实体货币 } from './tradeCurrency';
import { 本人资产陈述, 引文确认持有物品, 引文确认钱包余额 } from './tradeEvidence';
import { 判断角色对话位置, type 角色对话位置判定 } from '../../utils/roleChatLocation';

export interface TradeVenueInfo {
    available: boolean;
    venueName: string;
    venueType: string;
    ledgerKey?: string;
    description: string;
}

export interface NpcTradeEligibility {
    eligible: boolean;
    locationCheck: 角色对话位置判定;
    attitudeLabel: string;
    priceMultiplier: number; // Buy from counterparty multiplier; sell rate = base / multiplier
    reason: string;
}

export interface TradableItemView {
    id: string;
    name: string;
    type: string;
    description: string;
    quantity: number;
    unitPriceBase: number;
    equippedLocked: boolean;
    sourceIndex: number;
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
const 交易点名称结尾 = new RegExp(交易场所正则.source + '$', 'u');
const 敌对关系正则 = /(敌对|仇敌|死敌|追杀|通缉|绝交|决裂|围杀|刺杀|厮杀|敌意)/u;

const 取文本 = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const 估算物品单价Base = (item: { 名称?: string; 类型?: string; 品质?: string; 价值?: unknown; 价格?: unknown }): number => {
    const explicit = Number(item?.价值 ?? item?.价格);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.floor(explicit));
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

    const ledgerKey = JSON.stringify([env?.大地点, mid, small, district, concrete]);
    const directHit = [concrete, district, small].find((part) => 交易场所正则.test(part));
    if (directHit) {
        const match = directHit.match(交易场所正则);
        const venueType = match?.[1] || '商铺/坊市';
        return {
            available: true,
            ledgerKey,
            venueName: concrete || small || venueType,
            venueType,
            description: `当前位于「${concrete || small}」（${venueType}），可与掌柜或场内摊位直接交易现货。`
        };
    }

    const tree = 构建地点树(world as 世界数据结构);
    const nodes = [...tree.节点映射.values()];
    const knownNames = new Set(nodes.map((node) => node.名称));
    const locationParts = [env?.大地点, mid, small, district, concrete].map(取文本)
        .flatMap((part) => knownNames.has(part) ? [part] : part.split(/[>＞／/·•|｜→]+/u).map(取文本)).filter(Boolean);
    const place = locationParts.at(-1);
    const known = locationParts.filter((p, i) => knownNames.has(p) && p !== locationParts[i - 1]);
    const candidates = nodes.filter((node) => node.名称 === place);
    const matching = candidates.filter((node) => {
        const names = [node.名称];
        const levels = new Set([node.层级]);
        const seen = new Set([node.ID]);
        let parent = tree.节点映射.get(node.父级ID);
        while (parent && !seen.has(parent.ID)) {
            names.unshift(parent.名称);
            levels.add(parent.层级);
            seen.add(parent.ID);
            parent = tree.节点映射.get(parent.父级ID);
        }
        const regions = [['大地点', 取文本(env?.大地点)], ['中地点', mid], ['小地点', small], ['区地点', district]] as const;
        return 地点路径匹配分支(known.join(' > '), names) && regions.every(([level, name]) =>
            !name || !levels.has(level) || 地点路径匹配分支(name, names));
    });
    const activeNode = matching.length === 1 ? matching[0] : undefined;
    const layer = activeNode && world?.地图层级?.find((n) => n.ID === activeNode.ID);
    const activeNodeDesc = activeNode ? [activeNode.描述, layer?.叙事核心].filter(Boolean).join(' ') : '';
    // 简报必须明确交代当前地点实际设有交易点；“躲避黑市追兵”只描述冲突。
    const brief = directorBible?.下回合导演简报;
    const descriptions = [brief?.本回合舞台焦点, brief?.必须守住的悬念或冲突].flatMap((part) =>
        取文本(part).split(/[，,。！？；;\n]/u));
    const localVenue = place && descriptions.map((part) => part.trim().replace(/^(?:当前|眼前)(?:的)?/u, ''))
        .filter((part) => part.startsWith(place))
        .map((part) => part.slice(place.length).match(/^(?:内|中|里)?(?:设有|开设了?|开着|坐落着|有)(?:一(?:家|处|座|间))?([\p{Script=Han}]{0,8})$/u)?.[1])
        .find((description) => description && 交易点名称结尾.test(description));
    const indirectHit = activeNodeDesc.match(交易场所正则) || (localVenue && localVenue.match(交易场所正则));
    if (indirectHit) {
        return {
            available: true,
            ledgerKey,
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
    _directorBible?: DirectorWorldBible | null
): NpcTradeEligibility => {
    const locationCheck = 判断角色对话位置(npc, env);
    const name = 取文本(npc?.姓名) || '对方';
    if (locationCheck.状态 === 'blocked') {
        return {
            eligible: false,
            locationCheck,
            attitudeLabel: '无法接触',
            priceMultiplier: 1,
            reason: locationCheck.原因
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
            reason: `${name}与你处于敌对或高度戒备状态（关系：${取文本(npc?.关系状态) || 取文本((npc as any)?.关系) || '敌对'}，好感 ${favor}），拒绝在冲突氛围中与你做买卖！`
        };
    }

    if (favor < 0) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '冷淡溢价',
            priceMultiplier: 1.35,
            reason: `${name}对你尚存疑虑（好感 ${favor}），开价偏高，但可凭等价物或诚意换取。`
        };
    }
    if (favor < 40) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '市价交易',
            priceMultiplier: 1.1,
            reason: `${name}与你交情平平，愿按江湖市价银货两讫。`
        };
    }
    if (favor < 75) {
        return {
            eligible: true,
            locationCheck,
            attitudeLabel: '友好让利',
            priceMultiplier: 0.95,
            reason: `${name}对你颇有信赖，交易时愿酌情让利。`
        };
    }
    return {
        eligible: true,
        locationCheck,
        attitudeLabel: '倾囊相助',
        priceMultiplier: 0.8,
        reason: `${name}视你为心腹之人，价格仅象征性折算。`
    };
};

const 物品名称 = (item: NPC背包物品 | string) => 取文本(typeof item === 'string' ? item : item?.名称);

const 交易货单 = (bag: NPC背包物品[], source: TradableItemView['source'], currency: ReturnType<typeof 获取交易币制>, equipped = new Set<string>()): TradableItemView[] =>
    bag.flatMap((item, index) => {
        const name = 物品名称(item);
        const quantity = 交易物品数量(item, source);
        if (!name || !quantity || 是否货币类物品(item) || 物品交易面额(item, currency)) return [];
        return [{
            id: 取文本(item.ID) || source + '-' + index + '-' + name,
            name, quantity, source,
            type: 取文本(item.类型) || '杂物',
            description: 取文本(item.描述),
            unitPriceBase: 估算物品单价Base(item),
            equippedLocked: equipped.has(name) || equipped.has(item.ID || ''),
            sourceIndex: index
        }];
    });

export const 提取主角可交易物品列表 = (role: 角色数据结构, openingConfig?: OpeningConfig | null) =>
    交易货单(role?.物品列表 || [], 'player', 获取交易币制(openingConfig, role), new Set(Object.values(role?.装备 || {}).map(取文本)));

export const 首次登记NPC交易资产 = (npc: NPC结构, facts: { 依据?: string; 余额Base?: number; 背包?: NPC背包物品[] } | undefined,
    story: string, opening?: OpeningConfig | null, role?: 角色数据结构): NPC结构 => {
    const evidence = 取文本(facts?.依据);
    if (!facts || !evidence || !story.includes(evidence)) return npc;
    const clauses = 本人资产陈述(npc, evidence, story);
    if (!clauses.length) return npc;
    const currency = 获取交易币制(opening, role);
    const next = { ...npc };
    if (!Array.isArray(npc.背包) && Array.isArray(facts?.背包)) {
        const items = facts.背包.filter((item) => 取文本(item?.名称)
            && Number.isSafeInteger(item.数量) && item.数量! > 0 && (item.堆叠数量 === undefined || item.堆叠数量 === item.数量)
            && 引文确认持有物品(clauses, item.名称, item.数量!))
            .map((item) => ({ ...item, 堆叠数量: item.数量 }));
        if (items.length) next.背包 = items;
    }
    if (currency.cashEnabled && Number.isSafeInteger(facts.余额Base) && facts.余额Base! >= 0
        && !读取交易钱袋(npc.金钱, next.背包 || [], currency, 'npc').known
        && 引文确认钱包余额(clauses, facts.余额Base!, currency)) {
        next.金钱 = 写入交易钱袋(npc.金钱, facts.余额Base!, currency);
    }
    return next;
};

interface StockParams {
    targetType: 'npc' | 'venue';
    npc?: NPC结构 | null;
    venue?: TradeVenueInfo | null;
    world?: Partial<世界数据结构> | null;
    openingConfig?: OpeningConfig | null;
    role?: 角色数据结构;
}

const 柜台账本键 = (venue?: TradeVenueInfo | null) => venue?.ledgerKey || venue?.venueName || '';

export const 提取交易对方库存列表 = (params: StockParams) => {
    const currency = 获取交易币制(params.openingConfig, params.role);
    if (params.targetType === 'npc') {
        const npc = params.npc;
        const bag = Array.isArray(npc?.背包) ? npc.背包 : [];
        const wallet = 读取交易钱袋(npc?.金钱, bag, currency, 'npc');
        return { items: 交易货单(bag, 'npc', currency), bag, purseBase: wallet.balance, purseKnown: wallet.known };
    }
    const ledger = params.world?.场所交易账本?.[柜台账本键(params.venue)];
    if (ledger) return { items: 交易货单(ledger.库存, 'venue', currency), bag: ledger.库存, purseBase: ledger.余额, purseKnown: true };
    const isXianxia = currency.mode === 'xianxia';
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

    const bag = rawCatalog.map((item, index) => ({
        ID: 'venue-' + index + '-' + item.name, 名称: item.name, 类型: item.type, 描述: item.description, 数量: item.quantity, 价值: item.unitPriceBase
    }));
    return { items: 交易货单(bag, 'venue', currency), bag, purseBase: 2400, purseKnown: true };
};

export interface ExecuteTradeParams {
    targetType: 'npc' | 'venue';
    targetName: string;
    npcId?: string;
    locationLabel: string;
    role: 角色数据结构;
    social: NPC结构[];
    openingConfig?: OpeningConfig | null;
    world?: Partial<世界数据结构> | null;
    venue?: TradeVenueInfo;
    playerItemsOffered: Array<{ id?: string; name: string; quantity: number; unitPriceBase: number }>;
    counterpartyItemsBought: Array<{ id?: string; name: string; type: string; description: string; quantity: number; unitPriceBase: number }>;
    playerCashPaidBase?: number;
    playerCashReceivedBase?: number;
    confirmedGift?: boolean;
    priceMultiplier: number;
    maxCounterpartyPurseBase?: number; // 旧调用参数；付款能力始终从当前账本读取。
    barterNote?: string;
}

export interface ExecuteTradeResult {
    ok: boolean;
    error?: string;
    nextRole?: 角色数据结构;
    nextSocial?: NPC结构[];
    nextWorld?: 世界数据结构;
    record?: 场外交易记录结构;
}

export const 交易回收单价 = (value: number) => Math.max(1, Math.round(value * 0.7));

export const 计算交易差价 = (offered: Array<{ unitPriceBase: number; quantity: number }>, bought: Array<{ unitPriceBase: number; quantity: number }>, multiplier: number) => {
    const sellValue = offered.reduce((sum, row) => sum + 交易回收单价(row.unitPriceBase) * row.quantity, 0);
    const buyValue = bought.reduce((sum, row) => sum + Math.max(1, Math.round(row.unitPriceBase * multiplier)) * row.quantity, 0);
    return { sellValue, buyValue, receive: Math.max(0, sellValue - buyValue), pay: Math.max(0, buyValue - sellValue) };
};

const 选择现货 = (picks: ExecuteTradeParams['playerItemsOffered'], goods: TradableItemView[]) => {
    const selected = new Map<number, TradableItemView>();
    for (const pick of picks) {
        const row = goods.find((entry) => pick.id ? entry.id === pick.id : entry.name === pick.name);
        if (!row || row.equippedLocked || selected.has(row.sourceIndex) ||
            !Number.isSafeInteger(pick.quantity) || pick.quantity <= 0 || pick.quantity > row.quantity)
            throw new Error('「' + pick.name + '」库存不足、已装备或已变动，请重新核对货物。');
        selected.set(row.sourceIndex, { ...row, quantity: pick.quantity });
    }
    return selected;
};

const 划拨物品 = (bag: NPC背包物品[], selected: Map<number, TradableItemView>) => {
    const remaining: NPC背包物品[] = [];
    const out: NPC背包物品[] = [];
    bag.forEach((item, index) => {
        const pick = selected.get(index);
        if (!pick) { remaining.push(item); return; }
        const value = typeof item === 'string' ? { 名称: item } : item;
        out.push({ ...value, 名称: pick.name, 类型: pick.type, 价值: pick.unitPriceBase, 数量: pick.quantity, 堆叠数量: pick.quantity });
        const left = 交易物品数量(item, pick.source) - pick.quantity;
        if (left > 0) remaining.push({ ...value, 数量: left, 堆叠数量: left });
    });
    return { remaining, out };
};

export const 执行情境交易结算 = (params: ExecuteTradeParams): ExecuteTradeResult => {
    const { role, openingConfig } = params;
    const npcIdx = params.targetType === 'npc' ? params.social.findIndex((n) =>
        params.npcId ? n.id === params.npcId : n.姓名 === params.targetName) : -1;
    const npc = params.social[npcIdx];
    if (params.targetType === 'npc' && !npc) return { ok: false, error: '交易对象已变动，请重新选择。' };
    if (params.targetType === 'venue' && !params.venue?.available) return { ok: false, error: '当前没有可结算的柜台。' };
    const currency = 获取交易币制(openingConfig, role);
    const stock = 提取交易对方库存列表({ ...params, npc });
    const playerBag = Array.isArray(role.物品列表) ? role.物品列表 : [];
    const playerWallet = 读取交易钱袋(role.金钱, playerBag, currency);
    let offers: Map<number, TradableItemView>, purchases: Map<number, TradableItemView>;
    try {
        offers = 选择现货(params.playerItemsOffered, 提取主角可交易物品列表(role, openingConfig));
        purchases = 选择现货(params.counterpartyItemsBought, stock.items);
    } catch (e) { return { ok: false, error: (e as Error).message }; }
    if (!offers.size && !purchases.size) return { ok: false, error: '请先选择要交易的物品。' };
    const quote = 计算交易差价([...offers.values()], [...purchases.values()], params.priceMultiplier);
    const paidBase = params.playerCashPaidBase ?? quote.pay;
    const receivedBase = params.playerCashReceivedBase ?? quote.receive;
    const amount = (value: number) => value + ' ' + currency.label;
    if (![quote.sellValue, quote.buyValue, paidBase, receivedBase].every((v) => Number.isSafeInteger(v) && v >= 0) || (paidBase > 0 && receivedBase > 0))
        return { ok: false, error: '请核对本次收付金额。' };
    if ((paidBase || receivedBase) && !currency.cashEnabled) return { ok: false, error: '当前世界未指定可在此结算的记账币，请选择等价物品交换。' };
    if (receivedBase > stock.purseBase) return { ok: false,
        error: params.targetName + (stock.purseKnown ? '当前可付 ' + amount(stock.purseBase) : '的钱袋尚未记录可用余额') + '，尚差 ' + amount(receivedBase - stock.purseBase) + '。可降低收款、改选物品或取消。' };
    if (paidBase > playerWallet.balance) return { ok: false, error: '你的余额不足，当前可付 ' + amount(playerWallet.balance) + '，尚差 ' + amount(paidBase - playerWallet.balance) + '。' };
    const isGift = params.confirmedGift === true && params.targetType === 'npc' && offers.size > 0
        && !purchases.size && paidBase === 0 && params.playerCashReceivedBase === 0;
    if (params.confirmedGift && !isGift) return { ok: false, error: '赠物只可向选定的人物交付物品，不能同时收付款。' };
    if (!purchases.size && !receivedBase && !isGift) return { ok: false, error: '出售物品需填写正数收款，或选择对方物品交换。' };
    const concession = quote.sellValue + paidBase - quote.buyValue - receivedBase;
    if (concession < 0) return { ok: false, error: '出价不足，尚差 ' + amount(-concession) + '。' };
    const playerAfter = playerWallet.balance + receivedBase - paidBase;
    const otherAfter = stock.purseBase + paidBase - receivedBase;
    if (![playerAfter, otherAfter].every(Number.isSafeInteger)) return { ok: false, error: '交易余额超出可结算范围。' };

    const player = 划拨物品(playerBag, offers);
    const other = 划拨物品(stock.bag, purchases);
    const hasCash = paidBase !== receivedBase;
    let nextOtherItems = other.remaining;
    const nextMoney = hasCash ? 写入交易钱袋(role.金钱, playerAfter, currency) : role.金钱;
    const nextPlayerItems = hasCash ? 同步玩家实体货币(player.remaining, role.金钱, nextMoney, currency) : player.remaining;
    // 只有实际从旧背包折算进钱袋的实体币才移除。有独立钱袋时支付来自钱袋。
    if (npc && hasCash && !读取交易钱袋(npc.金钱, [], currency, 'npc').known) {
        nextOtherItems = nextOtherItems.filter((item) => !物品交易面额(item, currency));
    }
    const stamp = Date.now();
    const nextRole = { ...role, 物品列表: [...nextPlayerItems, ...other.out.map((item, index) => ({
        ...item, ID: 'trade_' + stamp + '_' + index, 品质: item.品质 || '凡品'
    }))] } as 角色数据结构;
    if (hasCash) nextRole.金钱 = nextMoney as 角色数据结构['金钱'];
    const bag = [...nextOtherItems, ...player.out.map((item) => ({ ...item, ID: undefined }))];
    let nextWorld: 世界数据结构 | undefined;
    let nextSocial = params.social;
    let favorGain = 0;
    if (npc) {
        const favor = Number(npc.好感度) || 0;
        favorGain = concession > 0 && favor < 100 ? 1 : 0;
        const nextNpc = { ...npc, 背包: bag, 好感度: favor + favorGain };
        if (hasCash) nextNpc.金钱 = 写入交易钱袋(npc.金钱, otherAfter, currency);
        nextSocial = [...params.social];
        nextSocial[npcIdx] = nextNpc;
    } else {
        const key = 柜台账本键(params.venue);
        nextWorld = { ...params.world, 场所交易账本: { ...params.world?.场所交易账本, [key]: { 余额: otherAfter, 库存: bag } } } as 世界数据结构;
    }

    const spentText = [
        ...player.out.map((i) => `${i.名称}×${i.数量}`),
        ...(paidBase > 0 ? [amount(paidBase)] : [])
    ].join('、') || '无';
    const gotText = [
        ...other.out.map((i) => `${i.名称}×${i.数量}`),
        ...(receivedBase > 0 ? [amount(receivedBase)] : [])
    ].join('、') || '无';
    const exchange = isGift
        ? `将[${spentText}]免费赠予「${params.targetName}」`
        : `向「${params.targetName}」交出[${spentText}]，换得[${gotText}]`;
    const favorNote = favorGain ? (isGift ? '，好感 +1' : '，让利 ' + amount(concession) + '，好感 +1') : '';
    const summary = `【情境交易成交｜${params.locationLabel}】${exchange}${favorNote}${params.barterNote ? `（交涉附言：${params.barterNote}）` : ''}`;

    const record: 场外交易记录结构 = {
        id: `trade-${Date.now()}`,
        对象类型: params.targetType,
        对象名称: params.targetName,
        npcId: params.npcId,
        地点: params.locationLabel,
        玩家支出物品: player.out.map((x) => ({ 名称: x.名称, 数量: x.数量! })),
        玩家获得物品: other.out.map((x) => ({ 名称: x.名称, 数量: x.数量! })),
        玩家支出金钱Base: paidBase,
        玩家获得金钱Base: receivedBase,
        成交摘要: summary,
        时间: Date.now()
    };

    return { ok: true, nextRole, nextSocial, nextWorld, record };
};

export const 构建场外交易注入块 = (records?: 场外交易记录结构[] | null): string => {
    if (!Array.isArray(records) || records.length === 0) return '';
    return [
        '【本回合前置交易既成事实（道具、货币与好感已在面板实时落账，正文必须自然承接，不可重复增减这笔交易的道具、货币或好感）】',
        ...records.map((r) => `- ${r.成交摘要}`)
    ].join('\n');
};
