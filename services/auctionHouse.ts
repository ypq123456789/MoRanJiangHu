import type { 角色数据结构, 角色金钱 } from '../models/character';
import type { 游戏物品, 物品品质, 物品类型 } from '../models/item';
import { 获取默认拍卖物品图片档案 } from '../data/defaultAuctionItemImages';
import { recordDiagnosticLog } from './diagnosticLog';

export type 拍卖品状态 = '上架中' | '已成交' | '已下架';
export type 拍卖货币 = keyof 角色金钱;
export type 主线流向 = '秘境线' | '官府线' | '宗门线' | '江湖线';

export interface 拍卖行情 {
    ID: string;
    标题: string;
    描述: string;
    影响类型: 物品类型 | '装备' | '全部';
    价格倍率: number;
    热点标签: string;
    过期时间: number;
}

export interface 拍卖品记录 {
    ID: string;
    物品: 游戏物品;
    卖家名称: string;
    卖家ID: string;
    起拍价: number;
    一口价: number;
    当前价格: number;
    标价货币: 拍卖货币;
    状态: 拍卖品状态;
    上架时间: number;
    过期时间: number;
    市场标签: string[];
    来源描述: string;
    关联事件?: string;
    主线类型?: 主线流向;
    是否限时热点?: boolean;
    购买者名称?: string;
    成交时间?: number;
}

export interface 交易记录 {
    ID: string;
    类型: '购买' | '寄售' | '收购' | '撤回' | '换兑' | '事件投放';
    标题: string;
    描述: string;
    时间: number;
}

export interface 拍卖行事件投放参数 {
    事件名称: string;
    来源描述?: string;
    主线类型?: 主线流向;
    卖家名称?: string;
    卖家ID?: string;
    物品?: Partial<游戏物品>;
    物品池?: Array<Partial<游戏物品>>;
    市场标签?: string[];
    价格倍率?: number;
    标价货币?: 拍卖货币;
    是否限时热点?: boolean;
    有效天数?: number;
}

export interface 拍卖行状态 {
    拍卖品列表: 拍卖品记录[];
    交易记录: Array<拍卖品记录 | 交易记录>;
    最近补货时间: number;
    行情列表?: 拍卖行情[];
    最近行情时间?: number;
}

const STORAGE_KEY_PREFIX = 'moranjianghu_auction_house_v2';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const 品质权重: Record<物品品质, number> = {
    凡品: 1,
    良品: 2,
    上品: 3,
    极品: 4,
    绝世: 5,
    传说: 6,
};

const 货币单位: Record<拍卖货币, { 名称: string; 铜钱值: number }> = {
    铜钱: { 名称: '铜钱', 铜钱值: 1 },
    银子: { 名称: '银子', 铜钱值: 1000 },
    金元宝: { 名称: '金元宝', 铜钱值: 100000 },
};

const 模板池: Array<{
    名称: string;
    类型: 物品类型;
    品质: 物品品质;
    描述: string;
    标签: string[];
    价格: number;
    主线类型?: 主线流向;
}> = [
    { 名称: '青锋短剑', 类型: '武器', 品质: '良品', 描述: '剑身薄而韧，适合行走江湖时贴身携带。', 标签: ['护身刚需', '行商旧货'], 价格: 880 },
    { 名称: '雁翎护腕', 类型: '防具', 品质: '良品', 描述: '皮革内衬夹着细铁片，能挡几分暗器。', 标签: ['护具热卖', '镖局余货'], 价格: 760 },
    { 名称: '回春散', 类型: '消耗品', 品质: '凡品', 描述: '寻常药铺也不常备的小包伤药。', 标签: ['疗伤急需', '药市热卖'], 价格: 220 },
    { 名称: '寒潭玄铁屑', 类型: '材料', 品质: '上品', 描述: '据说取自北地寒潭边的废炉残料。', 标签: ['工坊抢料', '矿料见涨'], 价格: 4200, 主线类型: '秘境线' },
    { 名称: '残页·归云步', 类型: '秘籍', 品质: '上品', 描述: '纸页残缺，却仍能看出轻身法门的影子。', 标签: ['门中旧藏', '抄本暗流'], 价格: 6500, 主线类型: '宗门线' },
    { 名称: '乌金软甲', 类型: '防具', 品质: '极品', 描述: '入手微沉，甲片细密，像是大派内库流出的东西。', 标签: ['秘境余热', '护命刚需'], 价格: 18800, 主线类型: '秘境线' },
    { 名称: '无名刀谱拓本', 类型: '秘籍', 品质: '极品', 描述: '拓本刀意森寒，边角有新近翻阅痕迹。', 标签: ['黑市热单', '传承逸散'], 价格: 22000, 主线类型: '江湖线' },
    { 名称: '南荒毒砂', 类型: '材料', 品质: '良品', 描述: '密封在竹筒中，开封便有辛辣气味。', 标签: ['来路不净', '药师争货'], 价格: 1300 },
    { 名称: '白玉鱼佩', 类型: '饰品', 品质: '上品', 描述: '玉色温润，佩绳已旧，像是富贵人家的旧物。', 标签: ['南北杂流', '雅玩暗拍'], 价格: 5600 },
    { 名称: '破军弩机', 类型: '武器', 品质: '极品', 描述: '机括沉稳，弩臂上有军械坊留下的暗记。', 标签: ['军械禁货', '官府线索'], 价格: 16800, 主线类型: '官府线' },
    { 名称: '药王谷旧丹方', 类型: '秘籍', 品质: '绝世', 描述: '丹方缺了两味引药，却足以让各路药师动心。', 标签: ['药市争夺', '限时热拍'], 价格: 48000, 主线类型: '江湖线' },
];

const 行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '镖道吃紧', 描述: '西线镖局连失两趟货，护具和兵刃今日更抢手。', 影响类型: '装备', 价格倍率: 1.18, 热点标签: '镖道吃紧' },
    { 标题: '药市缺货', 描述: '几家药铺同时收购伤药，消耗品价格顺势抬头。', 影响类型: '消耗品', 价格倍率: 1.22, 热点标签: '药市缺货' },
    { 标题: '工坊抢料', 描述: '铸坊接了大单，玄铁、毒砂等材料挂出便有人问价。', 影响类型: '材料', 价格倍率: 1.2, 热点标签: '工坊抢料' },
    { 标题: '宗门搜书', 描述: '几处宗门暗中寻访旧谱，秘籍类货品行情见涨。', 影响类型: '秘籍', 价格倍率: 1.25, 热点标签: '宗门搜书' },
    { 标题: '雅玩回落', 描述: '富户收手观望，饰品与旧玩更容易压价成交。', 影响类型: '饰品', 价格倍率: 0.92, 热点标签: '雅玩回落' },
];

const 随机ID = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const 读数 = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const 取数量 = (item: any) => Math.max(1, Math.floor(读数(item?.堆叠数量, 1)));
const 是否装备类 = (type: unknown) => type === '武器' || type === '防具' || type === '饰品';
const 是否允许自动拍卖行入市类型 = (type: unknown): boolean => (
    type === '武器' || type === '防具' || type === '饰品' || type === '消耗品' || type === '材料' || type === '秘籍'
);
const 是否旧系统兜底拍卖品 = (entry: any): boolean => (
    typeof entry?.卖家ID === 'string'
    && entry.卖家ID.startsWith('system_')
);
const 规范化合并键文本 = (value: unknown) => (
    typeof value === 'string'
        ? value.replace(/\s+/g, '').replace(/[·\-—_]/g, '').trim()
        : ''
);
const 生成拍卖物品合并键 = (item: any) => [
    规范化合并键文本(item?.名称 || '无名物品'),
    规范化合并键文本(item?.类型 || '杂物'),
    规范化合并键文本(item?.品质 || '凡品')
].join('|');
const 是否可合并同类拍卖物品 = (item: any): boolean => (
    item?.是否可堆叠 === true
    || item?.类型 === '消耗品'
    || item?.类型 === '材料'
);
const 读文本 = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const 限制品质 = (value: unknown, fallback: 物品品质 = '上品'): 物品品质 => (
    value === '凡品' || value === '良品' || value === '上品' || value === '极品' || value === '绝世' || value === '传说'
        ? value
        : fallback
);
const 限制类型 = (value: unknown, fallback: 物品类型 = '杂物'): 物品类型 => (
    value === '武器' || value === '防具' || value === '饰品' || value === '任务道具' || value === '消耗品' || value === '材料' || value === '秘籍' || value === '杂物' || value === '杂项'
        ? value
        : fallback
);

export const 格式化拍卖货币 = (value: number, currency: 拍卖货币 = '铜钱') =>
    `${Math.max(0, Math.floor(value)).toLocaleString('zh-CN')} ${货币单位[currency]?.名称 || currency}`;

export const 计算金钱铜钱总值 = (money?: Partial<角色金钱> | null) => (
    读数(money?.铜钱)
    + 读数(money?.银子) * 货币单位.银子.铜钱值
    + 读数(money?.金元宝) * 货币单位.金元宝.铜钱值
);

export const 铜钱转角色金钱 = (value: number): 角色金钱 => {
    const total = Math.max(0, Math.floor(读数(value)));
    const 金元宝 = Math.floor(total / 货币单位.金元宝.铜钱值);
    const afterGold = total - 金元宝 * 货币单位.金元宝.铜钱值;
    const 银子 = Math.floor(afterGold / 货币单位.银子.铜钱值);
    const 铜钱 = afterGold - 银子 * 货币单位.银子.铜钱值;
    return { 金元宝, 银子, 铜钱 };
};

export const 格式化铜钱总值 = (value: number) => `${Math.max(0, Math.floor(value)).toLocaleString('zh-CN')} 铜钱`;

export const 格式化金钱折算 = (money?: Partial<角色金钱> | null) => {
    const normalized = {
        铜钱: 读数(money?.铜钱),
        银子: 读数(money?.银子),
        金元宝: 读数(money?.金元宝),
    };
    return `铜钱 ${normalized.铜钱.toLocaleString('zh-CN')} / 银子 ${normalized.银子.toLocaleString('zh-CN')} / 元宝 ${normalized.金元宝.toLocaleString('zh-CN')} · 折算 ${格式化铜钱总值(计算金钱铜钱总值(normalized))}`;
};

const 以总铜钱更新角色金钱 = (character: 角色数据结构, nextTotalCopper: number): 角色数据结构 => ({
    ...character,
    金钱: 铜钱转角色金钱(nextTotalCopper),
});

export const 自动扣除铜钱 = (character: 角色数据结构, copperCost: number) => {
    const cost = Math.max(0, Math.floor(读数(copperCost)));
    const owned = 计算金钱铜钱总值(character?.金钱);
    if (owned < cost) {
        return { ok: false as const, message: `钱数不足：需 ${格式化铜钱总值(cost)}，当前折算 ${格式化铜钱总值(owned)}。` };
    }
    return {
        ok: true as const,
        nextCharacter: 以总铜钱更新角色金钱(character, owned - cost),
        paidCopper: cost,
        remainingCopper: owned - cost,
    };
};

export const 自动增加铜钱 = (character: 角色数据结构, copperIncome: number): 角色数据结构 => (
    以总铜钱更新角色金钱(character, 计算金钱铜钱总值(character?.金钱) + Math.max(0, Math.floor(读数(copperIncome))))
);

const 获取物品行情倍率 = (item: 游戏物品 | any, 行情列表: 拍卖行情[] = []) => {
    const type = item?.类型;
    const matched = 行情列表.find((market) => (
        market.影响类型 === '全部' ||
        market.影响类型 === type ||
        (market.影响类型 === '装备' && 是否装备类(type))
    ));
    return {
        multiplier: matched?.价格倍率 || 1,
        market: matched,
    };
};

export const 计算物品市场铜钱 = (item: 游戏物品 | any, 行情列表: 拍卖行情[] = []) => {
    const base = Math.max(1, Math.floor(读数(item?.价值, 100)));
    const qualityMultiplier = 1 + ((品质权重[item?.品质 as 物品品质] || 1) - 1) * 0.08;
    const market = 获取物品行情倍率(item, 行情列表);
    return Math.max(1, Math.floor(base * qualityMultiplier * market.multiplier));
};

const 规范化拍卖行存储作用域 = (scope?: string): string => {
    const text = typeof scope === 'string' ? scope.trim() : '';
    return text
        ? text.replace(/[^a-zA-Z0-9_\-.|:\u4e00-\u9fa5]/g, '_').slice(0, 180)
        : 'global';
};

const 获取拍卖行存储键 = (scope?: string): string => `${STORAGE_KEY_PREFIX}:${规范化拍卖行存储作用域(scope)}`;

export const 构建拍卖行存储作用域 = (source?: {
    游戏初始时间?: unknown;
    角色数据?: any;
    角色?: any;
    环境信息?: any;
    环境?: any;
    历史记录?: unknown;
}): string => {
    const role = source?.角色数据 || source?.角色 || {};
    const name = typeof role?.姓名 === 'string' && role.姓名.trim() ? role.姓名.trim() : '无名';
    const birth = typeof role?.生辰 === 'string' && role.生辰.trim() ? role.生辰.trim() : '';
    const initialTime = typeof source?.游戏初始时间 === 'string' && source.游戏初始时间.trim()
        ? source.游戏初始时间.trim()
        : '';
    const firstHistory = Array.isArray(source?.历史记录) ? source.历史记录[0] as any : null;
    const firstStamp = firstHistory?.timestamp ? String(firstHistory.timestamp) : '';
    return [name, birth, initialTime, firstStamp].filter(Boolean).join('|') || 'global';
};

const 规范化拍卖行状态 = (parsed: Partial<拍卖行状态> | null | undefined): 拍卖行状态 => 清理并补货({
    拍卖品列表: Array.isArray(parsed?.拍卖品列表) ? parsed.拍卖品列表 : [],
    交易记录: Array.isArray(parsed?.交易记录) ? parsed.交易记录 : [],
    最近补货时间: 读数(parsed?.最近补货时间),
    行情列表: Array.isArray(parsed?.行情列表) ? parsed.行情列表 : [],
    最近行情时间: 读数(parsed?.最近行情时间),
}, { 允许系统补货: false }); // 读取时不自动补货，等待剧情触发

const 创建空拍卖行状态 = (): 拍卖行状态 => ({
    拍卖品列表: [],
    交易记录: [],
    最近补货时间: 0,
    行情列表: [],
    最近行情时间: 0,
});

export const 读取拍卖行状态 = (scope?: string): 拍卖行状态 => {
    if (typeof window === 'undefined') return 清理并补货(创建空拍卖行状态(), { 允许系统补货: false });
    try {
        const scopedKey = 获取拍卖行存储键(scope);
        const raw = window.localStorage.getItem(scopedKey);
        if (!raw) return 清理并补货(创建空拍卖行状态(), { 允许系统补货: false });
        const parsed = JSON.parse(raw) as Partial<拍卖行状态>;
        return 规范化拍卖行状态(parsed);
    } catch {
        return 清理并补货(创建空拍卖行状态(), { 允许系统补货: false });
    }
};

export const 保存拍卖行状态 = (state: 拍卖行状态, scope?: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(获取拍卖行存储键(scope), JSON.stringify(state));
};

export const 创建默认拍卖行状态 = (): 拍卖行状态 => 清理并补货(创建空拍卖行状态(), { 允许系统补货: false }); // 新档不自动补货

export const 生成行情列表 = (force = false, previous: 拍卖行情[] = [], previousTime = 0): { 行情列表: 拍卖行情[]; 最近行情时间: number } => {
    const now = Date.now();
    const activePrevious = previous.filter((item) => item.过期时间 > now);
    if (!force && activePrevious.length > 0 && now - previousTime < 6 * HOUR_MS) {
        return { 行情列表: activePrevious, 最近行情时间: previousTime || now };
    }
    const shuffled = [...行情模板].sort(() => Math.random() - 0.5);
    const count = 2 + Math.floor(Math.random() * 2);
    return {
        行情列表: shuffled.slice(0, count).map((template) => ({
            ...template,
            ID: 随机ID('market'),
            过期时间: now + (10 + Math.floor(Math.random() * 8)) * HOUR_MS,
        })),
        最近行情时间: now,
    };
};

export const 清理并补货 = (state: 拍卖行状态, options?: { 允许系统补货?: boolean }): 拍卖行状态 => {
    const now = Date.now();
    const 行情 = 生成行情列表(false, state.行情列表 || [], state.最近行情时间);
    const cleaned = (state.拍卖品列表 || [])
        .filter((entry) => !是否旧系统兜底拍卖品(entry))
        .map((entry) => (
            entry.状态 === '上架中' && entry.过期时间 < now
                ? { ...entry, 状态: '已下架' as const }
                : entry
        ));
    
    // 统计当前在售拍品数量
    const activeCount = cleaned.filter((entry) => entry.状态 === '上架中').length;
    
    // 只有明确允许系统补货时才补充兜底拍品
    // 新档初始化时不应该有系统拍品，应该等待剧情触发
    const shouldGenerateSystem = options?.允许系统补货 === true && activeCount < 12;
    const targetCount = 12;
    const needToGenerate = shouldGenerateSystem ? Math.max(0, targetCount - activeCount) : 0;
    
    // 生成系统拍品时检查去重，避免同名同品质物品重复
    const existingKeys = new Set(
        cleaned
            .filter((entry) => entry.状态 === '上架中')
            .map((entry) => 生成拍卖物品合并键(entry.物品))
    );
    
    const newSystemAuctions: 拍卖品记录[] = [];
    let attempts = 0;
    const maxAttempts = needToGenerate * 3; // 最多尝试3倍次数
    
    while (newSystemAuctions.length < needToGenerate && attempts < maxAttempts) {
        attempts++;
        const auction = 生成系统拍卖品(行情.行情列表);
        const key = 生成拍卖物品合并键(auction.物品);
        
        // 检查是否已存在相同物品
        if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newSystemAuctions.push(auction);
        }
    }
    
    return {
        ...state,
        拍卖品列表: [...cleaned, ...newSystemAuctions].slice(0, 90),
        最近补货时间: newSystemAuctions.length > 0 ? now : 读数(state.最近补货时间),
        行情列表: 行情.行情列表,
        最近行情时间: 行情.最近行情时间,
    };
};

export const 生成系统拍卖品 = (行情列表: 拍卖行情[] = []): 拍卖品记录 => {
    const template = 模板池[Math.floor(Math.random() * 模板池.length)];
    const matchedMarket = 行情列表.find((market) => (
        market.影响类型 === '全部' ||
        market.影响类型 === template.类型 ||
        (market.影响类型 === '装备' && 是否装备类(template.类型))
    ));
    const qualityMultiplier = 1 + (品质权重[template.品质] - 1) * 0.08;
    const marketMultiplier = matchedMarket?.价格倍率 || 1;
    const priceJitter = 0.86 + Math.random() * 0.34;
    const price = Math.max(1, Math.floor(template.价格 * qualityMultiplier * marketMultiplier * priceJitter));
    const isHot = Boolean(matchedMarket && marketMultiplier > 1.05) || Math.random() < 0.16;
    const marketTags = Array.from(new Set([
        ...template.标签,
        matchedMarket?.热点标签,
        isHot ? '限时热拍' : '',
    ].filter(Boolean) as string[]));
    const item: 游戏物品 = {
        ID: 随机ID('auction_item'),
        名称: isHot && !template.名称.includes('热市') ? template.名称 : template.名称,
        描述: template.描述,
        类型: template.类型,
        品质: template.品质,
        重量: template.类型 === '秘籍' ? 0.3 : template.类型 === '材料' ? 0.6 : 1,
        堆叠数量: 1,
        是否可堆叠: template.类型 === '消耗品' || template.类型 === '材料',
        最大堆叠: 99,
        价值: price,
        当前耐久: template.类型 === '消耗品' ? 0 : 100,
        最大耐久: template.类型 === '消耗品' ? 0 : 100,
        词条列表: [],
        图片档案: 获取默认拍卖物品图片档案(template.名称),
    };
    const seller = ['万宝牙行', '南市老铺', '过路镖客', '青衣掮客', '六扇门暗桩'][Math.floor(Math.random() * 5)];
    return {
        ID: 随机ID('auction'),
        物品: item,
        卖家名称: seller,
        卖家ID: `system_${seller}`,
        起拍价: Math.floor(price * 0.72),
        一口价: price,
        当前价格: Math.floor(price * 0.72),
        标价货币: '铜钱',
        状态: '上架中',
        上架时间: Date.now(),
        过期时间: Date.now() + (2 + Math.floor(Math.random() * 4)) * DAY_MS,
        市场标签: marketTags,
        来源描述: matchedMarket ? `受「${matchedMarket.标题}」影响流入市面` : '江湖流通货',
        关联事件: matchedMarket?.标题,
        主线类型: template.主线类型,
        是否限时热点: isHot,
    };
};

const 标准化事件物品 = (raw: Partial<游戏物品>, fallbackName: string, fallbackPrice: number): 游戏物品 => {
    const type = 限制类型(raw?.类型, '杂物');
    const quality = 限制品质(raw?.品质, '上品');
    const price = Math.max(1, Math.floor(读数(raw?.价值, fallbackPrice)));
    return {
        ID: 读文本(raw?.ID, 随机ID('event_item')),
        名称: 读文本(raw?.名称, fallbackName),
        描述: 读文本(raw?.描述, '由江湖事件流入市面的稀罕物。'),
        类型: type,
        品质: quality,
        重量: Math.max(0, 读数(raw?.重量, type === '秘籍' ? 0.3 : type === '材料' ? 0.6 : 1)),
        堆叠数量: Math.max(1, Math.floor(读数(raw?.堆叠数量, 1))),
        是否可堆叠: Boolean(raw?.是否可堆叠 ?? (type === '消耗品' || type === '材料')),
        最大堆叠: Math.max(1, Math.floor(读数(raw?.最大堆叠, 99))),
        价值: price,
        当前耐久: Math.max(0, Math.floor(读数(raw?.当前耐久, type === '消耗品' ? 0 : 100))),
        最大耐久: Math.max(0, Math.floor(读数(raw?.最大耐久, type === '消耗品' ? 0 : 100))),
        词条列表: Array.isArray(raw?.词条列表) ? raw.词条列表 : [],
        ...(raw as any),
    } as 游戏物品;
};

export const 创建事件拍卖品 = (params: 拍卖行事件投放参数): 拍卖品记录 => {
    const pool = Array.isArray(params.物品池) && params.物品池.length > 0 ? params.物品池 : [params.物品 || {}];
    const picked = pool[Math.floor(Math.random() * pool.length)] || {};
    const fallbackTemplate = 模板池.find((item) => item.主线类型 === params.主线类型) || 模板池[Math.floor(Math.random() * 模板池.length)];
    const basePrice = 读数((picked as any)?.价值, fallbackTemplate.价格);
    const priceMultiplier = Math.max(0.2, 读数(params.价格倍率, params.是否限时热点 ? 1.35 : 1.08));
    const price = Math.max(1, Math.floor(basePrice * priceMultiplier));
    const item = 标准化事件物品({
        名称: fallbackTemplate.名称,
        描述: fallbackTemplate.描述,
        类型: fallbackTemplate.类型,
        品质: fallbackTemplate.品质,
        ...picked,
        价值: price,
    }, `${params.事件名称 || '江湖事件'}遗物`, price);
    const tags = Array.from(new Set([
        '事件流入',
        params.主线类型,
        params.是否限时热点 ? '限时热拍' : '',
        ...(params.市场标签 || []),
        ...(fallbackTemplate.标签 || []),
    ].filter(Boolean) as string[]));
    return {
        ID: 随机ID('auction_event'),
        物品: { ...item, ID: 随机ID('auction_item'), 堆叠数量: 取数量(item) },
        卖家名称: 读文本(params.卖家名称, '江湖掮客'),
        卖家ID: 读文本(params.卖家ID, `event_${params.事件名称 || 'unknown'}`),
        起拍价: Math.max(1, Math.floor(price * 0.7)),
        一口价: price,
        当前价格: Math.max(1, Math.floor(price * 0.7)),
        标价货币: params.标价货币 || '铜钱',
        状态: '上架中',
        上架时间: Date.now(),
        过期时间: Date.now() + Math.max(1, Math.floor(读数(params.有效天数, params.是否限时热点 ? 2 : 4))) * DAY_MS,
        市场标签: tags,
        来源描述: 读文本(params.来源描述, `源自「${params.事件名称 || '江湖风波'}」的流通货。`),
        关联事件: params.事件名称,
        主线类型: params.主线类型,
        是否限时热点: params.是否限时热点 ?? true,
    };
};

export const 投放事件拍卖品 = (state: 拍卖行状态, params: 拍卖行事件投放参数): 拍卖行状态 => {
    const cleaned = 清理并补货(state, { 允许系统补货: true }); // 剧情触发时允许补货
    const auction = 创建事件拍卖品(params);
    if (!是否允许自动拍卖行入市类型(auction.物品?.类型)) {
        recordDiagnosticLog('info', ['拍卖行事件投放已拦截', auction.物品?.名称 || '', auction.物品?.类型 || '', '非自动入市类型']);
        return cleaned;
    }
    const duplicateKey = 生成拍卖物品合并键(auction.物品);
    const activeList = cleaned.拍卖品列表 || [];
    const duplicateIndex = activeList.findIndex((entry) => (
        entry.状态 === '上架中'
        && 生成拍卖物品合并键(entry.物品) === duplicateKey
    ));
    if (duplicateIndex >= 0) {
        const existing = activeList[duplicateIndex];
        if (!是否可合并同类拍卖物品(existing?.物品) && !是否可合并同类拍卖物品(auction?.物品)) {
            return cleaned;
        }
        const existingCount = 取数量(existing.物品);
        const incomingCount = 取数量(auction.物品);
        const nextCount = existingCount + incomingCount;
        const existingUnitPrice = Math.max(1, Math.floor(读数(existing.一口价, existing.当前价格) / existingCount));
        const incomingUnitPrice = Math.max(1, Math.floor(读数(auction.一口价, auction.当前价格) / incomingCount));
        const mergedUnitPrice = Math.max(1, Math.floor((existingUnitPrice + incomingUnitPrice) / 2));
        const mergedPrice = Math.max(1, mergedUnitPrice * nextCount);
        const mergedEntry: 拍卖品记录 = {
            ...existing,
            物品: {
                ...existing.物品,
                堆叠数量: nextCount,
                是否可堆叠: true,
                最大堆叠: Math.max(读数(existing.物品?.最大堆叠, 99), nextCount),
                价值: mergedPrice
            },
            起拍价: Math.max(1, Math.floor(mergedPrice * 0.7)),
            一口价: mergedPrice,
            当前价格: Math.max(1, Math.floor(mergedPrice * 0.7)),
            过期时间: Math.max(读数(existing.过期时间), 读数(auction.过期时间)),
            市场标签: Array.from(new Set([...(existing.市场标签 || []), ...(auction.市场标签 || [])])),
            来源描述: existing.来源描述 || auction.来源描述,
            是否限时热点: existing.是否限时热点 || auction.是否限时热点,
        };
        const nextList = [...activeList];
        nextList[duplicateIndex] = mergedEntry;
        return {
            ...cleaned,
            拍卖品列表: nextList.slice(0, 90),
            交易记录: [
                创建交易记录('事件投放', '同类货品合并', `「${mergedEntry.物品?.名称 || '无名物品'}」已有同类拍品，已合并为 ${nextCount} 件一组。`),
                ...(cleaned.交易记录 || []),
            ].slice(0, 40),
        };
    }
    return {
        ...cleaned,
        拍卖品列表: [auction, ...activeList].slice(0, 90),
        交易记录: [
            创建交易记录('事件投放', '事件货品入市', `「${auction.物品?.名称 || '无名物品'}」因「${params.事件名称}」流入拍卖行。`),
            ...(cleaned.交易记录 || []),
        ].slice(0, 40),
    };
};

export const 投放事件拍卖品并保存 = (params: 拍卖行事件投放参数, scope?: string): 拍卖行状态 => {
    const next = 投放事件拍卖品(读取拍卖行状态(scope), params);
    保存拍卖行状态(next, scope);
    recordDiagnosticLog('info', ['拍卖行事件投放', params.事件名称, params.来源描述 || '', params.主线类型 || '']);
    return next;
};

/**
 * 从世界势力互动中投放物品到拍卖行。
 * 读取 `世界.拍卖行待投放物品` 缓冲区，将物品转化为拍卖品记录并清空缓冲区。
 */
export const 从势力互动投放拍卖品 = (
    state: 拍卖行状态,
    pendingItems: Array<{ 名称: string; 类型: string; 品质: string; 描述?: string; 来源势力?: string; 事件摘要?: string }>,
    options?: { scope?: string }
): 拍卖行状态 => {
    if (!Array.isArray(pendingItems) || pendingItems.length === 0) return state;

    let nextState = { ...state };
    for (const item of pendingItems) {
        if (!item.名称 || !item.类型) continue;
        const eventName = item.事件摘要 || `势力流通 · ${item.名称}`;
        const 来源描述 = item.来源势力
            ? `因「${item.事件摘要 || '势力互动'}」从${item.来源势力}流出`
            : `势力互动流出`;
        nextState = 投放事件拍卖品(nextState, {
            事件名称: eventName,
            来源描述,
            主线类型: '江湖线',
            卖家名称: item.来源势力 || '江湖散货',
            卖家ID: `faction_${(item.来源势力 || 'unknown').replace(/\s/g, '_')}`,
            物品: {
                名称: item.名称,
                类型: item.类型 as any,
                品质: item.品质 as any,
                描述: item.描述 || `${item.名称}，来自势力流通。`,
                堆叠数量: 1,
            },
            市场标签: ['势力流通'],
            有效天数: 7,
        });
    }

    if (options?.scope) {
        保存拍卖行状态(nextState, options.scope);
    }
    recordDiagnosticLog('info', ['拍卖行势力互动投放', `${pendingItems.length}件物品`]);
    return nextState;
};


export const 创建玩家拍卖品 = (character: 角色数据结构, item: 游戏物品, price: number, currency: 拍卖货币 = '铜钱'): 拍卖品记录 => ({
    ID: 随机ID('auction'),
    物品: { ...item, ID: 随机ID('auction_item'), 堆叠数量: 1 },
    卖家名称: character?.姓名 || '无名侠客',
    卖家ID: character?.姓名 || 'player',
    起拍价: Math.max(1, Math.floor(price * 0.75)),
    一口价: Math.max(1, Math.floor(price)),
    当前价格: Math.max(1, Math.floor(price * 0.75)),
    标价货币: currency,
    状态: '上架中',
    上架时间: Date.now(),
    过期时间: Date.now() + 3 * DAY_MS,
    市场标签: ['玩家寄售', '下回合自动成交', item?.品质 || '流通货'].filter(Boolean),
    来源描述: '玩家寄售：下回合自动成交',
});

export const 购买拍卖品 = (character: 角色数据结构, auction: 拍卖品记录) => {
    const currency = auction.标价货币 || '铜钱';
    const price = Math.max(1, 读数(auction.一口价 || auction.当前价格));
    const copperCost = price * (货币单位[currency]?.铜钱值 || 1);
    const payment = 自动扣除铜钱(character, copperCost);
    if (!payment.ok) {
        return { ok: false as const, message: payment.message };
    }
    const boughtItem = { ...auction.物品, ID: 随机ID('item'), 堆叠数量: 取数量(auction.物品) };
    const nextCharacter: 角色数据结构 = {
        ...payment.nextCharacter,
        物品列表: [...(Array.isArray(character?.物品列表) ? character.物品列表 : []), boughtItem],
    };
    const nextAuction: 拍卖品记录 = {
        ...auction,
        状态: '已成交',
        购买者名称: character?.姓名 || '无名侠客',
        成交时间: Date.now(),
    };
    return { ok: true as const, nextCharacter, nextAuction, message: `买下了「${auction.物品?.名称 || '无名物品'}」，自动折算支出 ${格式化铜钱总值(copperCost)}。` };
};

export const 上架背包物品 = (
    character: 角色数据结构,
    itemId: string,
    price?: number,
    currency: 拍卖货币 = '铜钱',
    行情列表: 拍卖行情[] = [],
    sellCount = 1
) => {
    const items = Array.isArray(character?.物品列表) ? character.物品列表 : [];
    const target = items.find((item) => String(item?.ID) === itemId);
    if (!target) return { ok: false as const, message: '找不到要上架的物品。' };
    const count = 取数量(target);
    const listingCount = Math.max(1, Math.min(count, Number.isFinite(sellCount) ? Math.trunc(sellCount) : count));
    const unitMarketPrice = Math.max(1, Math.floor(读数(price, 计算物品市场铜钱(target, 行情列表))));
    const marketPrice = unitMarketPrice * listingCount;
    const nextItems = count > listingCount
        ? items.map((item) => String(item?.ID) === itemId ? { ...item, 堆叠数量: count - listingCount } : item)
        : items.filter((item) => String(item?.ID) !== itemId);
    const nextEquipment = target?.当前装备部位 && character?.装备 && count <= listingCount
        ? { ...character.装备, [target.当前装备部位]: '无' }
        : character?.装备;
    const listingItem = { ...target, 当前装备部位: undefined, 堆叠数量: listingCount };
    return {
        ok: true as const,
        nextCharacter: { ...character, 装备: nextEquipment, 物品列表: nextItems },
        auction: 创建玩家拍卖品(character, listingItem, marketPrice, currency),
        marketPrice,
        message: `已按市场价 ${格式化铜钱总值(marketPrice)} 将「${target?.名称 || '无名物品'}」${listingCount > 1 ? `x${listingCount}` : ''}送入拍卖行寄卖，下回合自动成交。`,
    };
};

export const 结算玩家寄售 = (
    state: 拍卖行状态,
    character: 角色数据结构,
    settleTime = Date.now()
) => {
    const playerId = character?.姓名 || 'player';
    let totalCopper = 0;
    const settledAuctions: 拍卖品记录[] = [];
    const nextAuctions = (state.拍卖品列表 || []).map((entry) => {
        const isPlayerListing = entry.状态 === '上架中'
            && entry.卖家ID === playerId
            && (entry.来源描述 || '').includes('玩家寄售')
            && 读数(entry.上架时间) < settleTime;
        if (!isPlayerListing) return entry;
        const copper = Math.max(1, 读数(entry.一口价 || entry.当前价格)) * (货币单位[entry.标价货币 || '铜钱']?.铜钱值 || 1);
        totalCopper += copper;
        const settled: 拍卖品记录 = {
            ...entry,
            状态: '已成交',
            购买者名称: '江湖买家',
            成交时间: settleTime,
        };
        settledAuctions.push(settled);
        return settled;
    });
    if (settledAuctions.length === 0) {
        return { settledCount: 0, totalCopper: 0, nextCharacter: character, nextState: state, message: '' };
    }
    const nextCharacter = 自动增加铜钱(character, totalCopper);
    const summary = 创建交易记录(
        '寄售',
        '寄售自动成交',
        `${settledAuctions.length} 件玩家寄售货品已在下回合成交，入账 ${格式化铜钱总值(totalCopper)}。`
    );
    const nextState: 拍卖行状态 = {
        ...state,
        拍卖品列表: nextAuctions,
        交易记录: [summary, ...settledAuctions, ...(state.交易记录 || [])].slice(0, 40),
    };
    return {
        settledCount: settledAuctions.length,
        totalCopper,
        nextCharacter,
        nextState,
        message: summary.描述,
    };
};

export const 创建交易记录 = (类型: 交易记录['类型'], 标题: string, 描述: string): 交易记录 => ({
    ID: 随机ID('trade'),
    类型,
    标题,
    描述,
    时间: Date.now(),
});

export const 执行货币换兑 = (character: 角色数据结构, from: 拍卖货币, to: 拍卖货币, amount: number) => {
    const count = Math.floor(amount);
    if (from === to) return { ok: false as const, message: '请选择不同的货币。' };
    if (!Number.isFinite(count) || count <= 0) return { ok: false as const, message: '请输入有效数目。' };
    const money = character?.金钱 || { 金元宝: 0, 银子: 0, 铜钱: 0 };
    if (读数(money[from]) < count) return { ok: false as const, message: `${货币单位[from].名称}不足。` };
    const feeRate = 0.03;
    const copperValue = count * 货币单位[from].铜钱值;
    const targetValue = Math.floor((copperValue / 货币单位[to].铜钱值) * (1 - feeRate));
    if (targetValue <= 0) return { ok: false as const, message: '数额太小，扣除水牌后无法换出。' };
    const nextCharacter: 角色数据结构 = {
        ...character,
        金钱: {
            ...money,
            [from]: 读数(money[from]) - count,
            [to]: 读数(money[to]) + targetValue,
        },
    };
    return {
        ok: true as const,
        nextCharacter,
        received: targetValue,
        feeRate,
        message: `交出 ${格式化拍卖货币(count, from)}，换得 ${格式化拍卖货币(targetValue, to)}。`,
    };
};

export const 执行自动货币整理 = (character: 角色数据结构) => {
    const total = 计算金钱铜钱总值(character?.金钱);
    return {
        ok: true as const,
        nextCharacter: 以总铜钱更新角色金钱(character, total),
        totalCopper: total,
        message: `已自动整理钱袋，当前折算 ${格式化铜钱总值(total)}。`,
    };
};

export const 拍卖货币列表: 拍卖货币[] = ['铜钱', '银子', '金元宝'];
