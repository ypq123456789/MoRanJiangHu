import type { 角色数据结构, 角色金钱 } from '../models/character';
import type { 游戏物品, 物品品质, 物品类型 } from '../models/item';
import { recordDiagnosticLog } from './diagnosticLog';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { 获取货币完整单位标签, 获取货币层级倍率, 规范化角色金钱, 计算角色货币底层总值, 底层总值转角色金钱, type 货币显示模式 } from '../utils/currencyDisplay';
import type { ModeRuntimeProfile, 题材模式类型 } from '../models/system';
import { 获取题材模式配置 } from '../utils/topicModeProfiles';
import { 同步角色储物负重上限 } from '../utils/storageCarry';

export type 拍卖品状态 = '上架中' | '已成交' | '已下架';
export type 拍卖货币 = keyof 角色金钱;
export type 主线流向 = '秘境线' | '官府线' | '宗门线' | '江湖线';
type 拍卖题材模式 = 题材模式类型;

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
    题材模式?: 拍卖题材模式;
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

type 货币格式化选项 = { 货币模式?: 货币显示模式; 仙侠模式?: boolean; runtimeProfile?: ModeRuntimeProfile | null };

const 读取货币模式 = (options?: 货币格式化选项): 货币显示模式 => (
    options?.仙侠模式 === true ? 'xianxia' : (options?.货币模式 || 'wuxia')
);

const 获取货币倍率 = (currency: 拍卖货币, options?: 货币格式化选项): number => (
    获取货币层级倍率(currency as any, options?.runtimeProfile, 读取货币模式(options))
);

const 获取拍卖货币单位名称 = (currency: 拍卖货币, options?: 货币格式化选项): string => (
    获取货币完整单位标签(currency as any, 读取货币模式(options), options?.runtimeProfile)
);

const 行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '镖道吃紧', 描述: '西线镖局连失两趟货，护具和兵刃今日更抢手。', 影响类型: '装备', 价格倍率: 1.18, 热点标签: '镖道吃紧' },
    { 标题: '药市缺货', 描述: '几家药铺同时收购伤药，消耗品价格顺势抬头。', 影响类型: '消耗品', 价格倍率: 1.22, 热点标签: '药市缺货' },
    { 标题: '工坊抢料', 描述: '铸坊接了大单，玄铁、毒砂等材料挂出便有人问价。', 影响类型: '材料', 价格倍率: 1.2, 热点标签: '工坊抢料' },
    { 标题: '宗门搜书', 描述: '几处宗门暗中寻访旧谱，秘籍类货品行情见涨。', 影响类型: '秘籍', 价格倍率: 1.25, 热点标签: '宗门搜书' },
    { 标题: '雅玩回落', 描述: '富户收手观望，饰品与旧玩更容易压价成交。', 影响类型: '饰品', 价格倍率: 0.92, 热点标签: '雅玩回落' },
];

const 现代行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '同城急单', 描述: '同城跑腿和二手平台交易增多，电子设备与实用工具更容易溢价。', 影响类型: '杂物', 价格倍率: 1.16, 热点标签: '同城急单' },
    { 标题: '医疗紧张', 描述: '附近医院排队加重，基础急救用品和消耗品被提前囤走。', 影响类型: '消耗品', 价格倍率: 1.2, 热点标签: '医疗紧张' },
    { 标题: '劳保补仓', 描述: '仓储和工地集中补采购，防护装备与工具类货品短线走高。', 影响类型: '装备', 价格倍率: 1.14, 热点标签: '劳保补仓' },
    { 标题: '古玩观望', 描述: '藏家暂时压价，饰品和旧物成交价有所回落。', 影响类型: '饰品', 价格倍率: 0.93, 热点标签: '古玩观望' },
];

const 都市修行行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '暗市问价', 描述: '觉醒者圈层开始打听异常材料，灰色渠道报价被抬高。', 影响类型: '材料', 价格倍率: 1.22, 热点标签: '暗市问价' },
    { 标题: '防护热卖', 描述: '几起异常事故后，护具和应急装备需求明显增加。', 影响类型: '装备', 价格倍率: 1.18, 热点标签: '防护热卖' },
    { 标题: '古物走高', 描述: '疑似灵物的古玩被反复转手，饰品类报价短时上扬。', 影响类型: '饰品', 价格倍率: 1.2, 热点标签: '古物走高' },
    { 标题: '药品限购', 描述: '药房和诊所加强限购，恢复类消耗品更抢手。', 影响类型: '消耗品', 价格倍率: 1.16, 热点标签: '药品限购' },
];

const 末日行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '净水紧缺', 描述: '水源检测结果恶化，净水片和容器类物资被营地集中收购。', 影响类型: '消耗品', 价格倍率: 1.28, 热点标签: '净水紧缺' },
    { 标题: '夜巡加码', 描述: '感染群夜间活动增加，照明、防护和静音武器需求走高。', 影响类型: '装备', 价格倍率: 1.2, 热点标签: '夜巡加码' },
    { 标题: '燃油管制', 描述: '车队暂停外放燃油，小桶汽油和维修材料价格上扬。', 影响类型: '材料', 价格倍率: 1.24, 热点标签: '燃油管制' },
    { 标题: '罐头回落', 描述: '一处仓库刚被清理，普通食物短时供应变宽。', 影响类型: '消耗品', 价格倍率: 0.9, 热点标签: '罐头回落' },
];

const 无限流行情模板: Array<Omit<拍卖行情, 'ID' | '过期时间'>> = [
    { 标题: '恐怖片高发期', 描述: '连续多支小队进入高难度恐怖片，急救和强化物资需求暴涨。', 影响类型: '消耗品', 价格倍率: 1.3, 热点标签: '恐怖片高发期' },
    { 标题: '基因锁热潮', 描述: '近期多名轮回者突破基因锁，相关辅助药剂和抑制器供不应求。', 影响类型: '材料', 价格倍率: 1.22, 热点标签: '基因锁热潮' },
    { 标题: '军备囤积', 描述: '多支小队在团战前集中采购武器装备，军火类物品价格走高。', 影响类型: '装备', 价格倍率: 1.18, 热点标签: '军备囤积' },
    { 标题: '支线剧情荒', 描述: '近期隐藏任务触发率下降，支线剧情凭证价格上扬。', 影响类型: '消耗品', 价格倍率: 1.25, 热点标签: '支线剧情荒' },
    { 标题: '主神补货', 描述: '主神商城大规模补货，基础物资价格小幅回落。', 影响类型: '消耗品', 价格倍率: 0.92, 热点标签: '主神补货' },
];

const 获取题材行情模板 = (mode?: 拍卖题材模式): Array<Omit<拍卖行情, 'ID' | '过期时间'>> => {
    const profile = 获取题材模式配置(mode);
    if (profile.group === 'modern') return 现代行情模板;
    if (profile.group === 'apocalypse') return 末日行情模板;
    if (profile.group === 'urban_xianxia') return 都市修行行情模板;
    if (profile.group === 'infinite') return 无限流行情模板;
    return 行情模板;
};

const 随机ID = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const 读数 = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const 取数量 = (item: any) => Math.max(1, Math.floor(读数(item?.堆叠数量, 1)));
const 是否装备类 = (type: unknown) => type === '武器' || type === '防具' || type === '饰品';
const 是否允许自动拍卖行入市类型 = (type: unknown): boolean => (
    type === '武器' || type === '防具' || type === '饰品' || type === '消耗品' || type === '材料' || type === '秘籍' || type === '法宝'
);
const 仙侠拍卖关键词 = /筑基|炼气|灵石|灵宝|灵力|灵液|灵兽|灵木|灵墨|灵砂|灵脉|法宝|法器|法袍|法剑|飞剑|符箓|符阵|阵盘|丹炉|玉简|储物戒|纳戒|洞府|散修|御兽|心魔|道基/u;
const 是否仙侠拍卖物品 = (item: any): boolean => {
    const text = [
        item?.名称,
        item?.描述,
        item?.类型,
        item?.品质,
        ...(Array.isArray(item?.标签) ? item.标签 : []),
        ...(Array.isArray(item?.市场标签) ? item.市场标签 : [])
    ].filter(Boolean).join(' ');
    return item?.类型 === '法宝' || 仙侠拍卖关键词.test(text);
};
const 古风拍卖关键词 = /宗门|门派|江湖|镖局|官府|王朝|散修|坊市|丹方|刀谱|剑谱|玄铁|乌金|玉佩|法袍|法宝|飞剑|符箓|阵盘|玉简|灵石|筑基|炼气/u;
const 是否古风或仙侠拍卖物品 = (item: any): boolean => {
    const text = [
        item?.名称,
        item?.描述,
        item?.类型,
        ...(Array.isArray(item?.标签) ? item.标签 : []),
        ...(Array.isArray(item?.市场标签) ? item.市场标签 : [])
    ].filter(Boolean).join(' ');
    return 古风拍卖关键词.test(text) || 是否仙侠拍卖物品(item);
};
const 古代武侠关键词 = /宗门|门派|江湖|镖局|官府|王朝|散修|坊市|丹方|刀谱|剑谱|玄铁|乌金|玉佩|法袍|法宝|飞剑|符箓|阵盘|玉简|灵石|筑基|炼气|铸坊|药铺|牙行|灵液|丹药|灵兽|洞府|御兽|纳戒|禁制|阵基|符剑|丹炉|聚灵阵|渡劫|灵宝/u;
const 是否不符合题材拍卖物品 = (item: any, mode?: 拍卖题材模式): boolean => {
    const profile = 获取题材模式配置(mode);
    if (profile.group === 'wuxia') return 是否仙侠拍卖物品(item);
    if (profile.group === 'modern') return 是否古风或仙侠拍卖物品(item);
    if (profile.group === 'apocalypse') return 是否古风或仙侠拍卖物品(item);
    if (profile.group === 'infinite') {
        const text = [item?.名称, item?.描述, ...(Array.isArray(item?.标签) ? item.标签 : []), ...(Array.isArray(item?.市场标签) ? item.市场标签 : [])].filter(Boolean).join(' ');
        return 是否仙侠拍卖物品(item) || 古代武侠关键词.test(text);
    }
    if (profile.group === 'urban_xianxia') return false;
    return false;
};
const 是否不符合题材拍卖记录 = (entry: any, mode?: 拍卖题材模式): boolean => 是否不符合题材拍卖物品({
    ...(entry?.物品 || {}),
    市场标签: entry?.市场标签
}, mode);
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

export const 格式化拍卖货币 = (value: number, currency: 拍卖货币 = '铜钱', options?: 货币格式化选项) =>
    `${Math.max(0, Math.floor(value)).toLocaleString('zh-CN')} ${获取拍卖货币单位名称(currency, options) || currency}`;

export const 计算金钱BaseAmount总值 = (money?: Partial<角色金钱> | null) => (
    计算角色货币底层总值(money)
);

export const 计算金钱铜钱总值 = (money?: Partial<角色金钱> | null) => 计算金钱BaseAmount总值(money);

export const baseAmount转角色金钱 = (value: number, options?: 货币格式化选项): 角色金钱 => (
    底层总值转角色金钱(value, options?.runtimeProfile, 读取货币模式(options))
);

export const 铜钱转角色金钱 = (value: number): 角色金钱 => baseAmount转角色金钱(value);

export const 格式化BaseAmount总值 = (value: number, options?: 货币格式化选项) =>
    `${Math.max(0, Math.floor(value)).toLocaleString('zh-CN')} ${获取拍卖货币单位名称('铜钱', options)}`;

export const 格式化铜钱总值 = (value: number, options?: 货币格式化选项) => 格式化BaseAmount总值(value, options);

export const 格式化金钱折算 = (money?: Partial<角色金钱> | null, options?: 货币格式化选项) => {
    const normalized = 规范化角色金钱(money);
    return [
        `${获取拍卖货币单位名称('底层货币' as 拍卖货币, options)} ${normalized.底层货币.toLocaleString('zh-CN')}`,
        `${获取拍卖货币单位名称('中层货币' as 拍卖货币, options)} ${normalized.中层货币.toLocaleString('zh-CN')}`,
        `${获取拍卖货币单位名称('上层货币' as 拍卖货币, options)} ${normalized.上层货币.toLocaleString('zh-CN')}`
    ].join(' / ') + ` · 折算 ${格式化BaseAmount总值(计算金钱BaseAmount总值(normalized), options)}`;
};

const 以BaseAmount更新角色金钱 = (character: 角色数据结构, nextBaseAmount: number, options?: 货币格式化选项): 角色数据结构 => ({
    ...character,
    金钱: baseAmount转角色金钱(nextBaseAmount, options),
});

const 以总铜钱更新角色金钱 = (character: 角色数据结构, nextTotalCopper: number, options?: 货币格式化选项): 角色数据结构 => (
    以BaseAmount更新角色金钱(character, nextTotalCopper, options)
);

export const 自动扣除BaseAmount = (character: 角色数据结构, baseCost: number, options?: 货币格式化选项) => {
    const cost = Math.max(0, Math.floor(读数(baseCost)));
    const owned = 计算金钱BaseAmount总值(character?.金钱);
    if (owned < cost) {
        return { ok: false as const, message: `钱数不足：需 ${格式化BaseAmount总值(cost, options)}，当前折算 ${格式化BaseAmount总值(owned, options)}。` };
    }
    return {
        ok: true as const,
        nextCharacter: 以BaseAmount更新角色金钱(character, owned - cost, options),
        paidBaseAmount: cost,
        remainingBaseAmount: owned - cost,
        paidCopper: cost,
        remainingCopper: owned - cost,
    };
};

export const 自动扣除铜钱 = (character: 角色数据结构, copperCost: number, options?: 货币格式化选项) => (
    自动扣除BaseAmount(character, copperCost, options)
);

export const 自动增加BaseAmount = (character: 角色数据结构, baseIncome: number, options?: 货币格式化选项): 角色数据结构 => (
    以BaseAmount更新角色金钱(character, 计算金钱BaseAmount总值(character?.金钱) + Math.max(0, Math.floor(读数(baseIncome))), options)
);

export const 自动增加铜钱 = (character: 角色数据结构, copperIncome: number, options?: 货币格式化选项): 角色数据结构 => (
    自动增加BaseAmount(character, copperIncome, options)
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

export const 计算物品市场BaseAmount = (item: 游戏物品 | any, 行情列表: 拍卖行情[] = []) => {
    const base = Math.max(1, Math.floor(读数(item?.价值, 100)));
    const qualityMultiplier = 1 + ((品质权重[item?.品质 as 物品品质] || 1) - 1) * 0.08;
    const market = 获取物品行情倍率(item, 行情列表);
    return Math.max(1, Math.floor(base * qualityMultiplier * market.multiplier));
};

export const 计算物品市场铜钱 = (item: 游戏物品 | any, 行情列表: 拍卖行情[] = []) => (
    计算物品市场BaseAmount(item, 行情列表)
);

const 规范化拍卖行存储作用域 = (scope?: string): string => {
    const text = typeof scope === 'string' ? scope.trim() : '';
    return text
        ? text.replace(/[^a-zA-Z0-9_\-.|:\u4e00-\u9fa5]/g, '_').slice(0, 180)
        : 'global';
};

const 获取拍卖行存储键 = (scope?: string): string => `${STORAGE_KEY_PREFIX}:${规范化拍卖行存储作用域(scope)}`;

const 拍卖行最多持久化拍品数 = 80;
const 拍卖行最多持久化交易记录数 = 80;
const 原生端拍卖行最多持久化拍品数 = 32;
const 原生端拍卖行最多持久化交易记录数 = 24;
const 拍卖行瘦身持久化拍品数 = 16;
const 拍卖行瘦身持久化交易记录数 = 8;

const 是否存储配额异常 = (error: unknown): boolean => (
    error instanceof DOMException
        ? error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        : error instanceof Error && /quota|storage/i.test(error.name + error.message)
);

const 获取拍卖行存储时间 = (state: 拍卖行状态, key: string): number => {
    const entry = state.拍卖品列表.find((item) => item.ID === key);
    return 读数(entry?.成交时间 || entry?.上架时间 || entry?.过期时间, 0);
};

const 压缩拍卖行持久化状态 = (state: 拍卖行状态, lean = false): 拍卖行状态 => {
    const nativeRuntime = isNativeCapacitorEnvironment();
    const maxPersistedAuctions = lean
        ? 拍卖行瘦身持久化拍品数
        : nativeRuntime
            ? 原生端拍卖行最多持久化拍品数
            : 拍卖行最多持久化拍品数;
    const maxPersistedTransactions = lean
        ? 拍卖行瘦身持久化交易记录数
        : nativeRuntime
            ? 原生端拍卖行最多持久化交易记录数
            : 拍卖行最多持久化交易记录数;
    const active = (state.拍卖品列表 || [])
        .filter((entry) => entry.状态 === '上架中')
        .sort((a, b) => 读数(b.上架时间) - 读数(a.上架时间));
    const inactiveLimit = lean ? 2 : Math.max(0, maxPersistedAuctions - active.length);
    const inactive = (state.拍卖品列表 || [])
        .filter((entry) => entry.状态 !== '上架中')
        .sort((a, b) => 读数(b.成交时间 || b.上架时间) - 读数(a.成交时间 || a.上架时间))
        .slice(0, inactiveLimit);
    return {
        ...state,
        拍卖品列表: [...active, ...inactive].slice(0, maxPersistedAuctions),
        交易记录: (state.交易记录 || [])
            .slice()
            .sort((a: any, b: any) => 读数(b?.时间 || 获取拍卖行存储时间(state, b?.ID)) - 读数(a?.时间 || 获取拍卖行存储时间(state, a?.ID)))
            .slice(0, maxPersistedTransactions),
        行情列表: (state.行情列表 || []).slice(0, lean ? 2 : 4),
    };
};

const 清理旧拍卖行缓存 = (currentKey: string) => {
    if (typeof window === 'undefined') return;
    const keys: string[] = [];
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key?.startsWith(`${STORAGE_KEY_PREFIX}:`) && key !== currentKey) {
                keys.push(key);
            }
        }
        keys.forEach((key) => window.localStorage.removeItem(key));
    } catch {
        // Storage cleanup is best-effort; callers will still degrade gracefully.
    }
};

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
    const key = 获取拍卖行存储键(scope);
    const compactState = 压缩拍卖行持久化状态(state);
    try {
        window.localStorage.setItem(key, JSON.stringify(compactState));
        return;
    } catch (error) {
        if (!是否存储配额异常(error)) {
            recordDiagnosticLog('warn', ['拍卖行状态保存失败', error]);
            return;
        }
    }

    清理旧拍卖行缓存(key);
    try {
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, JSON.stringify(压缩拍卖行持久化状态(state, true)));
    } catch (error) {
        recordDiagnosticLog('warn', ['拍卖行状态保存空间不足，已跳过本次本地缓存', error]);
    }
};

export const 创建默认拍卖行状态 = (mode?: 拍卖题材模式): 拍卖行状态 => 清理并补货(创建空拍卖行状态(), { 允许系统补货: true, 题材模式: mode });

const 行情是否不符合题材 = (market: 拍卖行情, mode?: 拍卖题材模式): boolean => {
    const profile = 获取题材模式配置(mode);
    const text = [market?.标题, market?.描述, market?.热点标签].filter(Boolean).join(' ');
    if (profile.group === 'modern' || profile.group === 'apocalypse') {
        return /镖局|镖道|宗门|门派|坊市|药铺|铸坊|玄铁|毒砂|秘籍|旧谱|江湖|灵石|灵宝|丹药|法宝|符箓/u.test(text);
    }
    if (profile.group === 'wuxia') {
        return /同城|二手平台|医院|工地|仓储|觉醒者|异常|感染|营地|车队|燃油|罐头|净水/u.test(text);
    }
    if (profile.group === 'infinite') {
        return /镖局|镖道|宗门|门派|坊市|药铺|铸坊|玄铁|毒砂|秘籍|旧谱|江湖|灵石|灵宝|丹药|法宝|符箓|觉醒者|异常事故|营地|燃油|罐头|净水/u.test(text);
    }
    return false;
};

export const 生成行情列表 = (force = false, previous: 拍卖行情[] = [], previousTime = 0, mode?: 拍卖题材模式): { 行情列表: 拍卖行情[]; 最近行情时间: number } => {
    const now = Date.now();
    const activePrevious = previous.filter((item) => item.过期时间 > now && !行情是否不符合题材(item, mode));
    if (!force && activePrevious.length > 0 && now - previousTime < 6 * HOUR_MS) {
        return { 行情列表: activePrevious, 最近行情时间: previousTime || now };
    }
    const shuffled = [...获取题材行情模板(mode)].sort(() => Math.random() - 0.5);
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

type 默认拍卖物品模板 = {
    名称: string;
    类型: 物品类型;
    品质: 物品品质;
    描述: string;
    价值: number;
    标签?: string[];
};

const 题材默认拍卖物品池: Record<string, 默认拍卖物品模板[]> = {
    wuxia: [
        { 名称: '金疮药', 类型: '消耗品', 品质: '凡品', 描述: '常见外伤药，能处理刀剑擦伤与淤血。', 价值: 80, 标签: ['基础补给'] },
        { 名称: '精铁短刀', 类型: '武器', 品质: '良品', 描述: '镖局常备的短兵，锋口保养得当。', 价值: 260, 标签: ['兵刃'] },
        { 名称: '软皮护腕', 类型: '防具', 品质: '凡品', 描述: '轻便护腕，适合赶路和近身缠斗。', 价值: 140, 标签: ['护具'] },
        { 名称: '基础吐纳手札', 类型: '秘籍', 品质: '凡品', 描述: '江湖散人抄录的入门调息心得。', 价值: 320, 标签: ['入门秘籍'] }
    ],
    xianxia: [
        { 名称: '回气丹', 类型: '消耗品', 品质: '良品', 描述: '低阶修士常用丹药，可缓慢回复灵力。', 价值: 180, 标签: ['丹药'] },
        { 名称: '符纸一沓', 类型: '材料', 品质: '凡品', 描述: '适合绘制低阶符箓的空白符纸。', 价值: 120, 标签: ['符材'] },
        { 名称: '青竹法剑', 类型: '武器', 品质: '良品', 描述: '以灵竹炼成的轻剑，便于初学者御使。', 价值: 520, 标签: ['法器'] },
        { 名称: '聚灵玉佩', 类型: '饰品', 品质: '上品', 描述: '能略微稳定周身灵气的玉佩。', 价值: 860, 标签: ['灵饰'] }
    ],
    modern: [
        { 名称: '急救包', 类型: '消耗品', 品质: '凡品', 描述: '包含绷带、消毒片和基础止血用品。', 价值: 90, 标签: ['急救'] },
        { 名称: '多功能工具钳', 类型: '杂物', 品质: '良品', 描述: '可用于开箱、维修和现场处理小故障。', 价值: 160, 标签: ['工具'] },
        { 名称: '防割手套', 类型: '防具', 品质: '凡品', 描述: '适合外勤、仓储或危险现场使用。', 价值: 130, 标签: ['防护'] },
        { 名称: '便携录音笔', 类型: '杂物', 品质: '良品', 描述: '适合记录访谈、取证和会议内容。', 价值: 240, 标签: ['电子设备'] }
    ],
    urban_xianxia: [
        { 名称: '异常检测贴片', 类型: '材料', 品质: '良品', 描述: '能对微弱异常波动产生颜色变化。', 价值: 210, 标签: ['异常物资'] },
        { 名称: '应急护符', 类型: '饰品', 品质: '良品', 描述: '由民间修行者制作的简易防护符。', 价值: 360, 标签: ['护符'] },
        { 名称: '便携医疗包', 类型: '消耗品', 品质: '凡品', 描述: '现实急救用品，适合处理轻中度外伤。', 价值: 110, 标签: ['急救'] },
        { 名称: '低阶灵晶碎片', 类型: '材料', 品质: '上品', 描述: '异常复苏后流通的小块能量结晶。', 价值: 680, 标签: ['灵晶'] }
    ],
    apocalypse: [
        { 名称: '净水片', 类型: '消耗品', 品质: '凡品', 描述: '能临时处理少量可疑水源。', 价值: 70, 标签: ['生存物资'] },
        { 名称: '简易防刺背心', 类型: '防具', 品质: '良品', 描述: '营地自制护具，能挡住抓咬和碎片划伤。', 价值: 260, 标签: ['防护'] },
        { 名称: '手摇电筒', 类型: '杂物', 品质: '凡品', 描述: '不依赖电池的照明工具，亮度有限但可靠。', 价值: 120, 标签: ['照明'] },
        { 名称: '罐头补给包', 类型: '消耗品', 品质: '凡品', 描述: '压缩打包的基础食物，够一人撑过短途行动。', 价值: 100, 标签: ['食物'] }
    ],
    infinite: [
        { 名称: '止血喷雾', 类型: '消耗品', 品质: '凡品', 描述: '主神商城常见基础补给，可快速处理开放性伤口。', 价值: 80, 标签: ['主神商城', '基础补给'] },
        { 名称: '九毫米手枪', 类型: '武器', 品质: '良品', 描述: '适合新人任务世界防身的基础火器。', 价值: 350, 标签: ['主神商城', '武器'] },
        { 名称: '轻型防护背心', 类型: '防具', 品质: '良品', 描述: '能抵挡部分撕咬、钝击和低速弹片。', 价值: 280, 标签: ['主神商城', '防具'] },
        { 名称: '基础精神稳定剂', 类型: '消耗品', 品质: '上品', 描述: '短时间缓解恐怖片任务中的惊惧和精神污染。', 价值: 520, 标签: ['主神商城', '精神防护'] }
    ],
    western_fantasy: [
        { 名称: '小瓶治疗药水', 类型: '消耗品', 品质: '凡品', 描述: '冒险者常备的基础治疗药水。', 价值: 100, 标签: ['药水'] },
        { 名称: '铁制短剑', 类型: '武器', 品质: '良品', 描述: '佣兵和新手冒险者常用的短剑。', 价值: 260, 标签: ['武器'] },
        { 名称: '皮革胸甲', 类型: '防具', 品质: '凡品', 描述: '轻便耐磨，适合探索和巡逻。', 价值: 220, 标签: ['护甲'] },
        { 名称: '低阶魔晶', 类型: '材料', 品质: '良品', 描述: '可作为附魔、照明或法阵启动材料。', 价值: 300, 标签: ['魔晶'] }
    ]
};

const 获取默认拍卖物品池 = (mode?: 拍卖题材模式): 默认拍卖物品模板[] => {
    const profile = 获取题材模式配置(mode);
    const key = profile.group;
    return 题材默认拍卖物品池[key] || 题材默认拍卖物品池.wuxia;
};

const 创建默认拍卖品记录 = (template: 默认拍卖物品模板, index: number, mode?: 拍卖题材模式): 拍卖品记录 => {
    const profile = 获取题材模式配置(mode);
    const now = Date.now();
    const price = Math.max(1, Math.floor(template.价值 * (0.92 + index * 0.05)));
    const sellerName = profile.group === 'infinite'
        ? '主神商城'
        : profile.group === 'apocalypse'
            ? '营地物资员'
            : profile.group === 'modern'
                ? '本地资源库'
                : profile.group === 'western_fantasy'
                    ? '冒险者公会'
                    : profile.group === 'urban_xianxia'
                        ? '异常物资渠道'
                        : '万宝牙行';
    const item = 标准化事件物品({
        ...template,
        ID: 随机ID('market_seed_item'),
        堆叠数量: template.类型 === '消耗品' || template.类型 === '材料' ? Math.max(1, 1 + (index % 3)) : 1,
        是否可堆叠: template.类型 === '消耗品' || template.类型 === '材料',
        最大堆叠: 20,
        词条列表: [],
    }, template.名称, price);
    return {
        ID: 随机ID('market_seed'),
        物品: { ...item, ID: 随机ID('auction_item') },
        卖家名称: sellerName,
        卖家ID: `market_seed_${profile.group}`,
        起拍价: Math.max(1, Math.floor(price * 0.75)),
        一口价: price,
        当前价格: Math.max(1, Math.floor(price * 0.75)),
        标价货币: '底层货币',
        状态: '上架中',
        上架时间: now - index * 1000,
        过期时间: now + (3 + index) * DAY_MS,
        市场标签: Array.from(new Set(['基础补货', profile.shortLabel, ...(template.标签 || [])])),
        来源描述: `${sellerName}基础补货`,
        是否限时热点: false,
    };
};

export const 清理并补货 = (state: 拍卖行状态, options?: { 允许系统补货?: boolean; 最大系统补货数量?: number; 目标在售数量?: number; 题材模式?: 拍卖题材模式 }): 拍卖行状态 => {
    const now = Date.now();
    const 行情 = 生成行情列表(false, state.行情列表 || [], state.最近行情时间, options?.题材模式);
    const cleaned = (state.拍卖品列表 || [])
        .filter((entry) => !是否旧系统兜底拍卖品(entry))
        .filter((entry) => {
            const sellerId = typeof entry?.卖家ID === 'string' ? entry.卖家ID : '';
            const autoMarketEntry = sellerId.startsWith('market_') || sellerId.startsWith('event_') || sellerId.startsWith('faction_');
            return !autoMarketEntry || !是否不符合题材拍卖记录(entry, options?.题材模式);
        })
        .map((entry) => (
            entry.状态 === '上架中' && entry.过期时间 < now
                ? { ...entry, 状态: '已下架' as const }
                : entry
        ));
    const activeCount = cleaned.filter((entry) => entry.状态 === '上架中').length;
    const targetCount = Math.max(0, Math.floor(读数(options?.目标在售数量, 6)));
    const maxRestock = Math.max(0, Math.floor(读数(options?.最大系统补货数量, 4)));
    const shouldRestock = options?.允许系统补货 !== false && activeCount < targetCount;
    const restockCount = shouldRestock ? Math.min(maxRestock, targetCount - activeCount) : 0;
    const restocked = restockCount > 0
        ? 获取默认拍卖物品池(options?.题材模式)
            .filter((template) => !cleaned.some((entry) => entry.状态 === '上架中' && 生成拍卖物品合并键(entry.物品) === 生成拍卖物品合并键(template)))
            .slice()
            .sort(() => Math.random() - 0.5)
            .slice(0, restockCount)
            .map((template, index) => 创建默认拍卖品记录(template, index, options?.题材模式))
        : [];

    return {
        ...state,
        拍卖品列表: [...restocked, ...cleaned].slice(0, 90),
        最近补货时间: restocked.length > 0 ? now : 读数(state.最近补货时间),
        行情列表: 行情.行情列表,
        最近行情时间: 行情.最近行情时间,
    };
};

export const 生成系统拍卖品 = (): never => {
    throw new Error('系统拍卖品生成已禁用：拍卖行物品必须来自AI变量或玩家寄售。');
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
        重量: Math.max(0, 读数(raw?.重量, type === '秘籍' ? 0.3 : type === '材料' ? 0.6 : type === '消耗品' ? 0.1 : 1)),
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
    const validPool = pool.filter((item) => 读文本((item as any)?.名称) && 读文本((item as any)?.类型));
    const picked = validPool[Math.floor(Math.random() * validPool.length)] || {};
    const basePrice = 读数((picked as any)?.价值, 100);
    const priceMultiplier = Math.max(0.2, 读数(params.价格倍率, params.是否限时热点 ? 1.35 : 1.08));
    const price = Math.max(1, Math.floor(basePrice * priceMultiplier));
    const item = 标准化事件物品({
        ...picked,
        价值: price,
    }, `${params.事件名称 || '江湖事件'}遗物`, price);
    const tags = Array.from(new Set([
        '事件流入',
        params.主线类型,
        params.是否限时热点 ? '限时热拍' : '',
        ...(params.市场标签 || []),
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
    const cleaned = 清理并补货(state, { 允许系统补货: false, 题材模式: params.题材模式 });
    const hasExplicitItem = [params.物品, ...(Array.isArray(params.物品池) ? params.物品池 : [])]
        .some((item: any) => 读文本(item?.名称) && 读文本(item?.类型));
    if (!hasExplicitItem) {
        recordDiagnosticLog('info', ['拍卖行事件投放已跳过', params.事件名称 || '', '缺少AI生成的有效物品']);
        return cleaned;
    }
    const auction = 创建事件拍卖品(params);
    if (!是否允许自动拍卖行入市类型(auction.物品?.类型)) {
        recordDiagnosticLog('info', ['拍卖行事件投放已拦截', auction.物品?.名称 || '', auction.物品?.类型 || '', '非自动入市类型']);
        return cleaned;
    }
    if (是否不符合题材拍卖物品(auction.物品, params.题材模式)) {
        recordDiagnosticLog('info', ['拍卖行事件投放已拦截', auction.物品?.名称 || '', auction.物品?.类型 || '', `${获取题材模式配置(params.题材模式).label}题材不投放冲突物品`]);
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
            创建交易记录('事件投放', '事件货品入市', `「${auction.物品?.名称 || '无名物品'}」因「${params.事件名称}」${获取题材模式配置(params.题材模式).marketVerb}。`),
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
    options?: { scope?: string; 题材模式?: 拍卖题材模式 }
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
            题材模式: options?.题材模式,
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

export const 购买拍卖品 = (character: 角色数据结构, auction: 拍卖品记录, options?: 货币格式化选项) => {
    const currency = auction.标价货币 || '铜钱';
    const price = Math.max(1, 读数(auction.一口价 || auction.当前价格));
    const baseCost = price * 获取货币倍率(currency, options);
    const payment = 自动扣除BaseAmount(character, baseCost, options);
    if (!payment.ok) {
        return { ok: false as const, message: payment.message };
    }
    const boughtItem = { ...auction.物品, ID: 随机ID('item'), 堆叠数量: 取数量(auction.物品) };
    const nextCharacter = 同步角色储物负重上限({
        ...payment.nextCharacter,
        物品列表: [...(Array.isArray(character?.物品列表) ? character.物品列表 : []), boughtItem],
    } as 角色数据结构);
    const nextAuction: 拍卖品记录 = {
        ...auction,
        状态: '已成交',
        购买者名称: character?.姓名 || '无名侠客',
        成交时间: Date.now(),
    };
    return {
        ok: true as const,
        nextCharacter,
        nextAuction,
        paidBaseAmount: baseCost,
        paidCopper: baseCost,
        message: `买下了「${auction.物品?.名称 || '无名物品'}」，自动折算支出 ${格式化BaseAmount总值(baseCost, options)}。`
    };
};

export const 上架背包物品 = (
    character: 角色数据结构,
    itemId: string,
    price?: number,
    currency: 拍卖货币 = '铜钱',
    行情列表: 拍卖行情[] = [],
    sellCount = 1,
    options?: 货币格式化选项
) => {
    const items = Array.isArray(character?.物品列表) ? character.物品列表 : [];
    const target = items.find((item) => String(item?.ID) === itemId);
    if (!target) return { ok: false as const, message: '找不到要上架的物品。' };
    const count = 取数量(target);
    const listingCount = Math.max(1, Math.min(count, Number.isFinite(sellCount) ? Math.trunc(sellCount) : count));
    const unitMarketBaseAmount = Math.max(1, Math.floor(读数(price, 计算物品市场BaseAmount(target, 行情列表))));
    const marketBaseAmount = unitMarketBaseAmount * listingCount;
    const nextItems = count > listingCount
        ? items.map((item) => String(item?.ID) === itemId ? { ...item, 堆叠数量: count - listingCount } : item)
        : items.filter((item) => String(item?.ID) !== itemId);
    const nextEquipment = target?.当前装备部位 && character?.装备 && count <= listingCount
        ? { ...character.装备, [target.当前装备部位]: '无' }
        : character?.装备;
    const listingItem = { ...target, 当前装备部位: undefined, 堆叠数量: listingCount };
    return {
        ok: true as const,
        nextCharacter: 同步角色储物负重上限({ ...character, 装备: nextEquipment, 物品列表: nextItems } as 角色数据结构),
        auction: 创建玩家拍卖品(character, listingItem, marketBaseAmount, currency),
        marketBaseAmount,
        marketPrice: marketBaseAmount,
        message: `已按市场价 ${格式化BaseAmount总值(marketBaseAmount, options)} 将「${target?.名称 || '无名物品'}」${listingCount > 1 ? `x${listingCount}` : ''}送入拍卖行寄卖，下回合自动成交。`,
    };
};

export const 结算玩家寄售 = (
    state: 拍卖行状态,
    character: 角色数据结构,
    settleTime = Date.now(),
    options?: 货币格式化选项
) => {
    const playerId = character?.姓名 || 'player';
    let totalBaseAmount = 0;
    const settledAuctions: 拍卖品记录[] = [];
    const nextAuctions = (state.拍卖品列表 || []).map((entry) => {
        const isPlayerListing = entry.状态 === '上架中'
            && entry.卖家ID === playerId
            && (entry.来源描述 || '').includes('玩家寄售')
            && 读数(entry.上架时间) < settleTime;
        if (!isPlayerListing) return entry;
        const baseAmount = Math.max(1, 读数(entry.一口价 || entry.当前价格)) * 获取货币倍率(entry.标价货币 || '铜钱', options);
        totalBaseAmount += baseAmount;
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
        return { settledCount: 0, totalBaseAmount: 0, totalCopper: 0, nextCharacter: character, nextState: state, message: '' };
    }
    const nextCharacter = 自动增加BaseAmount(character, totalBaseAmount, options);
    const summary = 创建交易记录(
        '寄售',
        '寄售自动成交',
        `${settledAuctions.length} 件玩家寄售货品已在下回合成交，入账 ${格式化BaseAmount总值(totalBaseAmount, options)}。`
    );
    const nextState: 拍卖行状态 = {
        ...state,
        拍卖品列表: nextAuctions,
        交易记录: [summary, ...settledAuctions, ...(state.交易记录 || [])].slice(0, 40),
    };
    return {
        settledCount: settledAuctions.length,
        totalBaseAmount,
        totalCopper: totalBaseAmount,
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

export const 执行货币换兑 = (character: 角色数据结构, from: 拍卖货币, to: 拍卖货币, amount: number, options?: 货币格式化选项) => {
    const count = Math.floor(amount);
    if (from === to) return { ok: false as const, message: '请选择不同的货币。' };
    if (!Number.isFinite(count) || count <= 0) return { ok: false as const, message: '请输入有效数目。' };
    const money = 规范化角色金钱(character?.金钱);
    const fromAmount = from === '金元宝' || from === '上层货币'
        ? money.上层货币
        : from === '银子' || from === '中层货币'
            ? money.中层货币
            : money.底层货币;
    if (读数(fromAmount) < count) return { ok: false as const, message: `${获取拍卖货币单位名称(from, options)}不足。` };
    const feeRate = 0.03;
    const baseAmount = count * 获取货币倍率(from, options);
    const targetValue = Math.floor((baseAmount / 获取货币倍率(to, options)) * (1 - feeRate));
    if (targetValue <= 0) return { ok: false as const, message: '数额太小，扣除水牌后无法换出。' };
    const nextMoney = 规范化角色金钱(money);
    if (from === '金元宝' || from === '上层货币') nextMoney.上层货币 = 读数(nextMoney.上层货币) - count;
    else if (from === '银子' || from === '中层货币') nextMoney.中层货币 = 读数(nextMoney.中层货币) - count;
    else nextMoney.底层货币 = 读数(nextMoney.底层货币) - count;
    if (to === '金元宝' || to === '上层货币') nextMoney.上层货币 = 读数(nextMoney.上层货币) + targetValue;
    else if (to === '银子' || to === '中层货币') nextMoney.中层货币 = 读数(nextMoney.中层货币) + targetValue;
    else nextMoney.底层货币 = 读数(nextMoney.底层货币) + targetValue;
    const nextCharacter: 角色数据结构 = {
        ...character,
        金钱: 规范化角色金钱(nextMoney),
    };
    return {
        ok: true as const,
        nextCharacter,
        received: targetValue,
        feeRate,
        message: `交出 ${格式化拍卖货币(count, from, options)}，换得 ${格式化拍卖货币(targetValue, to, options)}。`,
    };
};

export const 执行自动货币整理 = (character: 角色数据结构, options?: 货币格式化选项) => {
    const totalBaseAmount = 计算金钱BaseAmount总值(character?.金钱);
    return {
        ok: true as const,
        nextCharacter: 以BaseAmount更新角色金钱(character, totalBaseAmount, options),
        totalBaseAmount,
        totalCopper: totalBaseAmount,
        message: `已自动整理钱袋，当前折算 ${格式化BaseAmount总值(totalBaseAmount, options)}。`,
    };
};

export const 拍卖货币列表: 拍卖货币[] = ['铜钱', '银子', '金元宝'];
export const 拍卖BaseAmount货币列表 = 拍卖货币列表;
