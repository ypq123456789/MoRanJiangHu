import { 角色数据结构, 环境信息结构, 装备槽位 } from '../../types';
import { normalizeCanonicalGameTime, 环境时间转标准串, 结构化时间转标准串 } from './timeUtils';
import { 压缩图片资源字段, 图片资源记录含可恢复地址 } from '../../utils/imageAssets';
import { 自动装备最佳装备 } from '../../utils/equipmentActions';
import { 规范化消耗品使用效果 } from '../../utils/itemEffects';
import { 归一化六维到境界预算 } from '../../utils/attributeBudget';
import { 姓名含已知中文姓氏 } from '../../utils/chineseName';
import { 构建默认技艺 } from '../../utils/skillDefaults';
import { 获取题材模式配置 } from '../../utils/topicModeProfiles';
import { 是否储物扩容物品, 规范化储物扩容物品, 同步角色储物负重上限, 重算背包物品负重 } from '../../utils/storageCarry';
import { 状态效果是死亡判定 } from '../../utils/npcDeathGuard';
import { 合并子宫档案值, 标准化子宫档案值 } from '../../utils/reproduction';
import { 补齐自动丹药预设, 古风丹药预设名称集合, 生存补给预设名称集合 } from '../../utils/autoConsumables';
import type { ModeRuntimeProfile, 题材模式类型 } from '../../models/system';
import { 获取境界配置, 规范化境界显示文本 as 规范化境界显示文本共享, 获取境界层级, 获取境界名称列表 } from '../../utils/realmConfig';
import { 确保角色金钱BaseAmount, 规范化角色金钱 } from '../../utils/currencyDisplay';
import type { 境界配置 } from '../../utils/realmConfig';

const 深拷贝 = <T,>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

const 武侠装备模板 = {
    头部: '无', 胸部: '无', 盔甲: '无', 内衬: '无',
    腿部: '无', 手部: '无', 足部: '无',
    主武器: '无', 副武器: '无', 暗器: '无',
    背部: '无', 腰部: '无', 坐骑: '无'
};
const 仙侠装备模板 = {
    头部: '无', 胸部: '无', 法袍: '无', 内衬: '无',
    腿部: '无', 手部: '无', 足部: '无',
    主法宝: '无', 副法宝: '无', 飞剑: '无',
    背部: '无', 腰部: '无', 灵兽: '无'
};
const 现代装备模板 = {
    头部: '无', 胸部: '无', 上装: '无', 下装: '无',
    手部: '无', 足部: '无',
    主武器: '无', 副武器: '无',
    背部: '无', 腰部: '无'
};
const 末世装备模板 = {
    头部: '无', 胸部: '无', 盔甲: '无', 内衬: '无',
    手部: '无', 足部: '无',
    主武器: '无', 副武器: '无',
    背包: '无', 腰部: '无'
};
const 奇幻装备模板 = {
    头部: '无', 胸部: '无', 盔甲: '无', 内衬: '无',
    腿部: '无', 手部: '无', 足部: '无',
    主武器: '无', 副武器: '无',
    背部: '无', 腰部: '无', 戒指: '无', 项链: '无'
};
const 武侠金钱模板 = { 金元宝: 0, 银子: 0, 铜钱: 0 };
const 仙侠金钱模板 = { 灵石: 0, 灵玉: 0 };
const 现代金钱模板 = { 现金: 0, 存款: 0 };
const 末世金钱模板 = { 通用点数: 0, 稀缺物资: 0 };
const 奇幻金钱模板 = { 金币: 0, 银币: 0, 铜币: 0 };

const 题材组默认定制 = (mode: 题材模式类型): {
    equipment: Record<string, string>;
    currency: Record<string, number>;
    resourceTypes: string[];
    attributeBias: Record<string, RegExp>;
    kungfuTypes: string[];
} => {
    const group = 获取题材模式配置(mode).group;
    if (group === 'apocalypse') return {
        equipment: 末世装备模板,
        currency: 末世金钱模板,
        resourceTypes: ['体力', '精力', '气血', '弹药', '燃料'],
        kungfuTypes: ['射击', '格斗', '战术', '生存', '被动', '驾驶', '工程', '医疗', '侦查'],
        attributeBias: {
            力量: /枪|炮|锤|重|壮|魁|格斗|猛|护卫|领袖/,
            敏捷: /侦查|狙击|潜行|刺客|快|斥候|盗|偷|斥候|游走/,
            体质: /盾|甲|体|横练|防暴|卫|肉盾|坚韧/,
            根骨: /医|丹|药|生化|研究|耐力|药剂/,
            悟性: /书|谋|师|技术|智|指挥|分析/,
            福源: /领袖|指挥官|幸运|女巫|命运/,
        }
    };
    if (group === 'urban_xianxia' || group === 'modern') return {
        equipment: 现代装备模板,
        currency: 现代金钱模板,
        resourceTypes: ['体力', '精力', '理智'],
        kungfuTypes: ['格斗', '射击', '驾驶', '战术', '科技', '医疗', '社交', '潜入', '被动'],
        attributeBias: {
            力量: /枪|格斗|壮|魁|猛|护卫|保镖|打手/,
            敏捷: /侦查|跑|快|盗|偷|灵活|驾驶员|刺客/,
            体质: /盾|甲|体|防暴|卫|保安|医疗/,
            根骨: /医|药|研究|耐力|生化|保健/,
            悟性: /书|谋|师|技术|智|分析|学者|教授/,
            福源: /领导|富|贵|幸运|网红|明星/,
        }
    };
    if (group === 'western_fantasy') return {
        equipment: 奇幻装备模板,
        currency: 奇幻金钱模板,
        resourceTypes: ['魔力', '精力', '体力', '气血'],
        kungfuTypes: ['剑术', '格斗', '魔法', '神术', '射击', '被动', '潜行', '召唤', '炼金'],
        attributeBias: {
            力量: /剑|斧|锤|拳|壮|魁|猛|战士|护卫|骑士/,
            敏捷: /弓|刺|影|盗|斥候|游侠|快|灵活/,
            体质: /盾|甲|体|横练|卫|圣骑|守护|坚韧/,
            根骨: /医|药|僧|德鲁伊|耐力|自然/,
            悟性: /法|魔|咒|术|书|智|学者|奥术/,
            福源: /贵族|幸运|神选|命运|公主|王子/,
        }
    };
    if (group === 'infinite') return {
        equipment: 现代装备模板,
        currency: 现代金钱模板,
        resourceTypes: ['精神力', '体力', '积分'],
        kungfuTypes: ['格斗', '射击', '异能', '科技', '血统', '魔法', '被动', '侦查', '强化'],
        attributeBias: {
            力量: /枪|拳|壮|格斗|猛|战士|近战/,
            敏捷: /侦查|潜行|刺客|快|斥候|狙击|盗/,
            体质: /盾|甲|体|卫|肉盾|坚韧/,
            根骨: /医|药|研究|耐力|血族|恢复/,
            悟性: /书|谋|智|分析|学者|技术/,
            福源: /幸运|命运|轮回|主角|天赋/,
        }
    };
    if (group === 'xianxia') return {
        equipment: 仙侠装备模板,
        currency: 仙侠金钱模板,
        resourceTypes: ['灵力', '神识', '法力', '气血'],
        kungfuTypes: ['剑诀', '法诀', '术法', '神通', '遁法', '阵诀', '被动', '内功', '轻功'],
        attributeBias: {
            力量: /剑|刀|斧|锤|拳|力|壮|魁|猛|体修|护卫/,
            敏捷: /剑|刺|影|盗|飞剑|遁法|身法|步|快|灵活/,
            体质: /盾|甲|体|横练|金刚|护法|卫|灵甲/,
            根骨: /内功|根骨|道|僧|医|丹|长老|宗|灵根/,
            悟性: /书|谋|师|医|丹|阵|符|术|智|悟性/,
            福源: /贵|小姐|公子|少主|圣女|机缘|祥|幸运/,
        }
    };
    return {
        equipment: 武侠装备模板,
        currency: 武侠金钱模板,
        resourceTypes: ['内力', '精力', '气血'],
        kungfuTypes: ['内功', '外功', '轻功', '绝技', '被动'],
        attributeBias: {
            力量: /刀|斧|锤|拳|力|壮|魁|猛|护卫|镖/,
            敏捷: /剑|刺|影|盗|弓|暗器|轻功|斥候|快/,
            体质: /盾|甲|僧|体|横练|护法|壮|卫/,
            根骨: /内功|根骨|道|僧|医|丹|长老|宗/,
            悟性: /书|谋|师|医|丹|阵|符|术|智|谋士/,
            福源: /贵|小姐|公子|少主|圣女|机缘|祥|幸运/,
        }
    };
};

const 角色身体部位列表 = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'] as const;
const 默认背景模板 = {
    名称: '',
    描述: '',
    效果: ''
};

let _当前题材模式: 题材模式类型 = '武侠';
let _当前运行时配置: ModeRuntimeProfile | null = null;
let _当前境界配置: 境界配置 | undefined = undefined;
let _当前题材默认值: ReturnType<typeof 题材组默认定制> = 题材组默认定制('武侠');

export const 获取当前境界配置 = (): 境界配置 | undefined => _当前境界配置;

const 合并运行时覆写 = (
    base: ReturnType<typeof 题材组默认定制>,
    profile: ModeRuntimeProfile | null
): ReturnType<typeof 题材组默认定制> => {
    const ab = profile?.ability;
    const it = profile?.items;
    const op = profile?.opening;
    return {
        equipment: op?.defaultEquipment ?? base.equipment,
        currency: op?.defaultCurrency ?? base.currency,
        resourceTypes: it?.resourceTypes ?? base.resourceTypes,
        kungfuTypes: ab?.kungfuTypes ?? base.kungfuTypes,
        attributeBias: base.attributeBias,
    };
};

export const 设置默认技艺运行时配置 = (mode: 题材模式类型, runtimeProfile?: ModeRuntimeProfile | null) => {
    _当前题材模式 = mode;
    _当前运行时配置 = runtimeProfile ?? null;
    _当前境界配置 = 获取境界配置(mode, runtimeProfile);
    _当前题材默认值 = 合并运行时覆写(题材组默认定制(mode), _当前运行时配置);
};

const 当前题材默认值 = (): ReturnType<typeof 题材组默认定制> => _当前题材默认值;
const 规范化货币数值 = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
};
type 货币层级键 = '上层货币' | '中层货币' | '底层货币';
type 货币类型信息 = {
    原始类型: string;
    分类名: string;
    货币键: 货币层级键 | null;
};
type 背景货币展开结果 = {
    名称: string;
    数量: number;
    描述: string;
    类型?: string;
    货币键?: 货币层级键;
};
const 获取当前货币层级名称 = (): Record<货币层级键, string> => {
    const tiers = _当前运行时配置?.economy?.currencyTiers;
    const currency = 当前题材默认值().currency || {};
    const keys = Object.keys(currency);
    return {
        上层货币: 规范化文本(tiers?.upperName) || keys[0] || '上层货币',
        中层货币: 规范化文本(tiers?.middleName) || keys[1] || '中层货币',
        底层货币: 规范化文本(tiers?.lowerName) || keys[2] || '底层货币'
    };
};
const 解析货币类型信息 = (itemType: unknown): 货币类型信息 | null => {
    const type = 规范化文本(itemType);
    if (!type.startsWith('货币:')) return null;
    const rawKey = type.slice(3).trim();
    if (!rawKey) return null;
    let 货币键: 货币层级键 | null = null;
    if (rawKey === '上层货币' || rawKey === '中层货币' || rawKey === '底层货币') 货币键 = rawKey;
    else if (rawKey === '上层' || rawKey === '高级' || rawKey === '高阶') 货币键 = '上层货币';
    else if (rawKey === '中层' || rawKey === '中级' || rawKey === '中阶') 货币键 = '中层货币';
    else if (rawKey === '底层' || rawKey === '下层' || rawKey === '低级' || rawKey === '低阶') 货币键 = '底层货币';
    return {
        原始类型: type,
        分类名: rawKey,
        货币键,
    };
};
const 是否货币类型物品 = (itemType: unknown): boolean => 解析货币类型信息(itemType) != null;
const 展开背景货币代理物品 = (itemName: string, itemType?: unknown, mode?: unknown): 背景货币展开结果[] | null => {
    const name = 规范化文本(itemName);
    if (!name) return null;
    const group = 获取题材模式配置(mode).group;
    const 货币层级名 = 获取当前货币层级名称();
    const typedCurrency = 解析货币类型信息(itemType);
    if (typedCurrency?.货币键) {
        return [{
            名称: 货币层级名[typedCurrency.货币键],
            数量: 1,
            描述: '可直接流通的货币。',
            类型: 规范化文本(itemType) || undefined,
            货币键: typedCurrency.货币键
        }];
    }
    if (name === '盘缠') {
        const key = group === 'modern' || group === 'infinite' || group === 'apocalypse' ? '底层货币' : '中层货币';
        return [{ 名称: 货币层级名[key], 数量: 10, 描述: '可直接支配的出行用度。', 货币键: key }];
    }
    if (name === '零钱盒') {
        return [{ 名称: 货币层级名.底层货币, 数量: 50, 描述: '拆零找用的零散现款。', 货币键: '底层货币' }];
    }
    return null;
};
const 构建背景货币实体物品 = (entry: 背景货币展开结果) => ({
    ID: `bg_currency_${entry.名称}`,
    名称: entry.名称,
    数量: entry.数量,
    描述: entry.描述,
    类型: entry.类型 || '货币',
    品质: '凡品',
    重量: entry.货币键 === '底层货币' ? 0.005 : entry.货币键 === '中层货币' ? 0.02 : 0.01,
    堆叠数量: entry.数量,
    是否可堆叠: true,
    最大堆叠: 999999,
    当前耐久: 1,
    最大耐久: 1,
    价值: entry.货币键 === '上层货币' ? 10000 : entry.货币键 === '中层货币' ? 100 : 1,
    词条列表: [],
} as any);
const 从物品列表汇总角色货币 = (items: any[], fallbackMoney: Record<string, number>) => {
    const hasCurrencyItems = items.some((item: any) => {
        const name = 规范化文本(item?.名称);
        const typeCurrencyKey = 解析货币类型信息(item?.类型)?.货币键;
        const 货币层级名 = 获取当前货币层级名称();
        return Boolean(
            typeCurrencyKey
            || name === 货币层级名.上层货币
            || name === 货币层级名.中层货币
            || name === 货币层级名.底层货币
        );
    });
    const fallbackCompat = 规范化角色金钱(fallbackMoney as any);
    const next = {
        ...fallbackMoney,
        上层货币: hasCurrencyItems ? 0 : fallbackCompat.上层货币,
        中层货币: hasCurrencyItems ? 0 : fallbackCompat.中层货币,
        底层货币: hasCurrencyItems ? 0 : fallbackCompat.底层货币,
        金元宝: hasCurrencyItems ? 0 : fallbackCompat.金元宝,
        银子: hasCurrencyItems ? 0 : fallbackCompat.银子,
        铜钱: hasCurrencyItems ? 0 : fallbackCompat.铜钱
    };
    const 货币层级名 = 获取当前货币层级名称();
    const 累加 = (key: keyof typeof next, amount: number) => {
        next[key] = 规范化货币数值(next[key]) + 规范化货币数值(amount);
    };
    items.forEach((item: any) => {
        const name = 规范化文本(item?.名称);
        const typeCurrencyKey = 解析货币类型信息(item?.类型)?.货币键;
        const count = Math.max(1, 规范化整数(item?.堆叠数量 ?? item?.数量, 1));
        if (typeCurrencyKey === '中层货币' || name === 货币层级名.中层货币) {
            累加('中层货币', count);
            累加('银子', count);
        } else if (typeCurrencyKey === '底层货币' || name === 货币层级名.底层货币) {
            累加('底层货币', count);
            累加('铜钱', count);
        } else if (typeCurrencyKey === '上层货币' || name === 货币层级名.上层货币) {
            累加('上层货币', count);
            累加('金元宝', count);
        }
    });
    const nextForBaseAmount = hasCurrencyItems ? { ...next, baseAmount: undefined } : next;
    return 确保角色金钱BaseAmount(
        nextForBaseAmount,
        _当前运行时配置,
        _当前运行时配置?.economy?.currencyDisplayMode as any
    );
};
const 规范化数值 = (value: unknown, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const 规范化整数 = (value: unknown, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const 规范化文本 = (value: unknown, fallback = ''): string => (
    typeof value === 'string' ? value.trim() : fallback
);
const 角色疑似现代或末日题材 = (role: any): boolean => {
    const text = [role?.外貌, role?.性格, role?.称号, role?.出身背景?.描述, role?.出身背景?.效果]
        .map((value) => 规范化文本(value))
        .join(' ');
    return /现代|都市|末日|丧尸|公司|医院|枪|信用点|现金|营地/u.test(text);
};
const 题材现代化时应移除古风丹药 = (item: any): boolean => {
    const text = [item?.名称, item?.描述, item?.类型]
        .map((value) => 规范化文本(value))
        .join(' ');
    return /丹|灵药|辟谷|回气|凝元|破境|药瓶|瓷瓶/u.test(text);
};

type 玩家BUFF规范化选项 = {
    当前时间?: unknown;
    事件文本?: string;
    启用饱腹口渴系统?: boolean;
    题材模式?: unknown;
};

const 读取BUFF规范化当前时间 = (value: unknown): string => {
    if (typeof value === 'string') return normalizeCanonicalGameTime(value) || '';
    return 环境时间转标准串(value) || 结构化时间转标准串(value) || '';
};

const 比较标准游戏时间 = (left: string, right: string): number | null => {
    const l = normalizeCanonicalGameTime(left);
    const r = normalizeCanonicalGameTime(right);
    if (!l || !r) return null;
    const lp = l.split(':').map((part) => Number(part));
    const rp = r.split(':').map((part) => Number(part));
    for (let i = 0; i < Math.min(lp.length, rp.length); i += 1) {
        if (lp[i] !== rp[i]) return lp[i] - rp[i];
    }
    return 0;
};

const BUFF无实际效果正则 = /^(?:无|暂无|无效果|没有效果|未生效|待定|不详|未知|无明显效果|仅剧情描述|仅氛围描述|状态描述)$/;
const BUFF事件型结束时间正则 = /(?:本次|此次|当前|本场|本轮|本段|这次).{0,12}(?:结束|完毕|完成|收尾|散会|事毕|告一段落)|(?:议事|会议|会盟|商议|商讨|谈判|战斗|比试|切磋|审讯|问询|仪式|法会|试炼|巡查).{0,10}(?:结束|完毕|完成|收尾|散会|事毕|告一段落)/;
const BUFF事件已结束事实正则 = /(?:议事|会议|会盟|商议|商讨|谈判|战斗|比试|切磋|审讯|问询|仪式|法会|试炼|巡查).{0,24}(?:结束|完毕|完成|收尾|散会|事毕|告一段落|散去|离开|走出|退出)|(?:结束|完毕|完成|收尾|散会|事毕|告一段落|散去|离开|走出|退出).{0,24}(?:议事|会议|会盟|商议|商讨|谈判|战斗|比试|切磋|审讯|问询|仪式|法会|试炼|巡查)/;

const 标准化玩家BUFF列表 = (raw: any, options?: 玩家BUFF规范化选项): any[] => {
    const currentTime = 读取BUFF规范化当前时间(options?.当前时间);
    const eventText = typeof options?.事件文本 === 'string' ? options.事件文本 : '';
    const source = Array.isArray(raw) ? raw : [];
    return source
        .map((item: any, idx: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const 名称 = typeof item?.名称 === 'string' ? item.名称.trim() : '';
            const 描述 = typeof item?.描述 === 'string' ? item.描述.trim() : '';
            const 效果 = typeof item?.效果 === 'string' ? item.效果.trim() : '';
            const rawEnd = typeof item?.结束时间 === 'string' ? item.结束时间.trim() : '';
            const canonicalEnd = normalizeCanonicalGameTime(rawEnd);
            const 结束时间 = rawEnd ? (canonicalEnd || rawEnd) : '';
            if (!名称 && !描述 && !效果 && !结束时间) return null;
            if (!效果 || BUFF无实际效果正则.test(效果)) return null;
            if (canonicalEnd && currentTime) {
                const compare = 比较标准游戏时间(canonicalEnd, currentTime);
                if (compare !== null && compare <= 0) return null;
            }
            if (!canonicalEnd && 结束时间 && BUFF事件型结束时间正则.test(结束时间) && BUFF事件已结束事实正则.test(eventText)) {
                return null;
            }
            return {
                索引: idx,
                名称,
                描述,
                效果,
                结束时间
            };
        })
        .filter(Boolean)
        .slice(-2)
        .map((item: any, idx: number) => ({ ...item, 索引: idx }));
};
const 未命名物品正则 = /^(未命名|未知物品|未知|无名|杂物|物品|\?+|n\/a)$/i;
const 秘籍残卷正则 = /残卷|残篇|残本|残页|残章/;
const 任务唯一道具正则 = /任务|主线|支线|剧情|信物|令牌|手令|调兵令|密令|密函|钥匙|契约|凭证|腰牌|玉佩|印信|地图|残图/;
const 无限流支线剧情资源正则 = /^[DCBAS]级支线剧情(?:凭证|卷轴|权限|结晶|碎片)?$/i;
const 规范化非负数 = (value: unknown, fallback = 0): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, n);
};
const 取首个有效文本片段 = (...values: unknown[]): string => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};
const 默认角色技艺 = () => 构建默认技艺(_当前题材模式, _当前运行时配置);

const 规范化境界显示文本 = (value: unknown, fallback = ''): string =>
    规范化境界显示文本共享(value, fallback, _当前境界配置);

const 标准化角色技艺 = (raw: any): Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }> => {
    const source = Array.isArray(raw) ? raw : [];
    const byName = new Map<string, { 名称: string; 等级: string; 熟练度: number; 描述: string }>();
    source.forEach((item: any) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const 名称 = 规范化文本(item?.名称);
        if (!名称) return;
        byName.set(名称, {
            名称,
            等级: 规范化文本(item?.等级, '未入门') || '未入门',
            熟练度: Math.max(0, Math.min(100, 规范化数值(item?.熟练度, 0))),
            描述: 规范化文本(item?.描述, '尚未形成稳定技艺。') || '尚未形成稳定技艺。'
        });
    });
    默认角色技艺().forEach((item) => {
        if (!byName.has(item.名称)) byName.set(item.名称, { ...item });
    });
    return Array.from(byName.values());
};

const 标准化天赋列表 = (raw: any): Array<{ 名称: string; 描述: string; 效果: string }> => {
    if (!Array.isArray(raw)) return [];
    const byKey = new Map<string, { 名称: string; 描述: string; 效果: string }>();
    raw.forEach((item: any) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const 名称 = 规范化文本(item?.名称);
        const 描述 = 规范化文本(item?.描述);
        const 效果 = 规范化文本(item?.效果);
        if (!名称 && !描述 && !效果) return;
        const key = 名称 || `${描述}|${效果}`;
        const existing = byKey.get(key);
        byKey.set(key, {
            名称: 名称 || existing?.名称 || '',
            描述: 取更优文本(描述, existing?.描述 || ''),
            效果: 取更优文本(效果, existing?.效果 || '')
        });
    });
    return Array.from(byKey.values());
};

const 标准化出身背景 = (raw: any, fallback = 默认背景模板): { 名称: string; 描述: string; 效果: string; 初始物品?: { 名称: string; 数量?: number; 描述?: string; 类型?: string; }[] } => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rawItems = Array.isArray(source?.初始物品) ? source.初始物品 : undefined;
    const 初始物品 = rawItems
        ?.map((item: any) => {
            if (!item || typeof item !== 'object') {
                const name = 规范化文本(item);
                return name ? { 名称: name } : null;
            }
            const name = 规范化文本(item?.名称);
            if (!name) return null;
            return {
                名称: name,
                数量: typeof item?.数量 === 'number' && item.数量 > 0 ? item.数量 : undefined,
                描述: 规范化文本(item?.描述) || undefined,
                类型: 规范化文本(item?.类型) || undefined,
            };
        })
        .filter(Boolean) as { 名称: string; 数量?: number; 描述?: string; 类型?: string; }[] | undefined;
    return {
        名称: 规范化文本(source?.名称, fallback.名称),
        描述: 规范化文本(source?.描述, fallback.描述),
        效果: 规范化文本(source?.效果, fallback.效果),
        ...(初始物品 && 初始物品.length > 0 ? { 初始物品 } : {})
    };
};

const 技艺等级由熟练度 = (value: number): string => {
    if (value <= 0) return '未入门';
    if (value < 25) return '入门';
    if (value < 45) return '初窥';
    if (value < 65) return '小成';
    if (value < 85) return '大成';
    return '登堂';
};

const 稳定哈希 = (text: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const 稳定区间整数 = (seed: string, min: number, max: number): number => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    if (hi <= lo) return lo;
    return lo + (稳定哈希(seed) % (hi - lo + 1));
};

const 技艺关键词表: Record<string, string[]> = {
    医术: ['医', '药', '治', '伤', '救', '郎中', '大夫', '药师', '药铺', '医馆', '疗伤'],
    炼器: ['铁', '锻', '匠', '器', '铸', '兵', '剑炉', '铁铺', '铸造', '打铁'],
    炼丹: ['丹', '炉', '药师', '炼丹', '丹房', '丹炉', '灵药', '药堂'],
    阵法: ['阵', '军阵', '布阵', '风水', '奇门', '术数', '玄门'],
    符箓: ['符', '箓', '道士', '道门', '镇邪', '符纸', '符师'],
    机关: ['机关', '工', '巧', '墨', '傀儡', '机括', '陷阱', '匠作'],
    采集: ['猎', '山', '林', '野', '采', '农', '樵', '渔', '草药', '山民', '猎户'],
    鉴定: ['鉴', '商', '当铺', '古玩', '宝', '掌柜', '账房', '行商', '拍卖', '珠宝']
};

const 计算技艺信号 = (text: string, skillName: string): number => {
    const keywords = 技艺关键词表[skillName] || [];
    return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
};

const 应用出身天赋技艺推断 = (
    技艺列表: Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }>,
    params: {
        seed: string;
        text: string;
        talents?: Array<{ 名称?: string; 描述?: string; 效果?: string }>;
        background?: { 名称?: string; 描述?: string; 效果?: string };
        major?: boolean;
        ordinaryRandom?: boolean;
        reasonLabel?: string;
    }
) => {
    const combinedText = [
        params.text,
        params.background?.名称,
        params.background?.描述,
        params.background?.效果,
        ...(Array.isArray(params.talents) ? params.talents.flatMap((item) => [item?.名称, item?.描述, item?.效果]) : [])
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    const isMajor = params.major === true;
    const scored = 技艺列表
        .map((skill, index) => {
            const signal = 计算技艺信号(combinedText, skill.名称);
            const noise = 稳定区间整数(`${params.seed}:${skill.名称}:order`, 0, 99);
            return { skill, index, signal, noise };
        })
        .sort((a, b) => (b.signal - a.signal) || (b.noise - a.noise));
    const positiveSignals = scored.filter(item => item.signal > 0);
    const desiredCount = isMajor
        ? Math.min(4, Math.max(2, positiveSignals.length || 稳定区间整数(`${params.seed}:major-count`, 2, 3)))
        : Math.min(2, Math.max(1, positiveSignals.length || (params.ordinaryRandom === false ? 0 : 稳定区间整数(`${params.seed}:ordinary-count`, 1, 2))));
    const selected = (positiveSignals.length >= desiredCount ? positiveSignals : scored).slice(0, desiredCount);

    selected.forEach(({ skill, signal }) => {
        if (!skill || skill.熟练度 > 0) return;
        const lower = signal > 0 ? (isMajor ? 18 : 8) : (isMajor ? 10 : 4);
        const upper = signal > 0 ? (isMajor ? 55 : 32) : (isMajor ? 28 : 16);
        const bonus = Math.min(12, Math.max(0, signal - 1) * 4);
        const value = Math.max(1, Math.min(100, 稳定区间整数(`${params.seed}:${skill.名称}:value`, lower, upper) + bonus));
        skill.熟练度 = value;
        skill.等级 = 技艺等级由熟练度(value);
        skill.描述 = `${params.reasonLabel || '因天赋与出身经历'}形成的${skill.名称}基础。`;
    });
};
const 生成物品名称 = (item: any): string => {
    const rawName = 规范化文本(item?.名称);
    if (rawName && !未命名物品正则.test(rawName)) return rawName;
    const desc = 规范化文本(item?.描述);
    if (!desc) return '';
    const wrappedMatch = desc.match(/[《「『【“"']([^》」』】”"']{1,24})[》」』】”"']/);
    const base = wrappedMatch?.[1]?.trim()
        || desc
            .split(/[，。；、,.!！?？\n\r]/)
            .map((part) => part.trim())
            .find(Boolean)
        || desc.slice(0, 24).trim();
    if (!base) return '';
    if (item?.类型 === '秘籍' && !/秘籍|残卷|残篇|残本|残页|残章/.test(base)) {
        return `${base}秘籍`;
    }
    return base;
};
const 是否为秘籍残卷 = (item: any): boolean => {
    const text = `${规范化文本(item?.名称)} ${规范化文本(item?.描述)}`;
    return 秘籍残卷正则.test(text);
};
const 是否唯一剧情道具 = (item: any): boolean => {
    if (是否货币类型物品(item?.类型)) return false;
    const text = [
        item?.名称,
        item?.描述,
        item?.类型,
        item?.物品来源类型,
        item?.来源描述,
        item?.视觉唯一性
    ].map((value) => 规范化文本(value)).join(' ');
    if (无限流支线剧情资源正则.test(规范化文本(item?.名称))) return false;
    return item?.类型 === '任务道具'
        || item?.视觉唯一性 === '唯一'
        || item?.视觉唯一性 === '主线'
        || ['任务奖励', '支线奖励', '主线奖励', '主线事件'].includes(规范化文本(item?.物品来源类型))
        || 任务唯一道具正则.test(text);
};
const 四舍五入两位 = (value: number): number => Math.round(value * 100) / 100;
const 获取物品检索文本 = (item: any): string => (
    `${规范化文本(item?.名称)} ${规范化文本(item?.描述)} ${规范化文本(item?.视觉描述)}`
);
const 是否小件药品 = (item: any): boolean => {
    if (规范化文本(item?.类型) !== '消耗品') return false;
    const text = 获取物品检索文本(item);
    if (/药箱|药箱子|箱|匣|坛|罐|篓|筐|水囊|葫芦|酒坛|药材包|工具包/.test(text)) return false;
    return /丹|丸|药|散|粉|膏|露|剂|香|避瘴|解毒|疗伤|止血|回气|凝元|破境|辟谷/.test(text);
};
const 是否小件弹药 = (item: any): boolean => {
    const type = 规范化文本(item?.类型);
    if (type && !['消耗品', '材料', '杂物', '杂项'].includes(type)) return false;
    const text = 获取物品检索文本(item);
    if (/弩机|弩身|弓弩|弓|长弓|强弩|床弩|箭筒|箭袋|箭箱|匣|箱/.test(text)) return false;
    return /弩箭|弩矢|箭矢|羽箭|箭簇|箭头|飞针|毒针|银针|袖箭|飞镖|毒镖|暗器/.test(text);
};
const 是否轻便纸符 = (item: any): boolean => {
    const type = 规范化文本(item?.类型);
    if (type && !['消耗品', '任务道具', '杂物', '杂项'].includes(type)) return false;
    const text = 获取物品检索文本(item);
    if (/书册|秘籍|账册|卷宗|整箱|箱|匣/.test(text)) return false;
    return /符纸|纸符|符箓|黄符|信笺|信纸|薄纸|纸条/.test(text);
};
const 是否小件轻物 = (item: any): boolean => (
    是否小件药品(item) || 是否小件弹药(item) || 是否轻便纸符(item)
);
const 估算小件弹药重量 = (item: any): number => {
    const text = 获取物品检索文本(item);
    if (/飞针|毒针|银针/.test(text)) return 0.01;
    if (/箭簇|箭头/.test(text)) return 0.02;
    if (/袖箭|飞镖|毒镖|暗器/.test(text)) return 0.06;
    if (/弩箭|弩矢/.test(text)) return 0.08;
    if (/箭矢|羽箭/.test(text)) return 0.06;
    return 0.06;
};
const 估算轻便纸符重量 = (item: any): number => {
    const text = 获取物品检索文本(item);
    if (/信笺|信纸|纸条|薄纸/.test(text)) return 0.01;
    return 0.03;
};
const 估算小件药品重量 = (item: any): number => {
    const text = 获取物品检索文本(item);
    if (/丹|丸|粒|颗/.test(text)) return 0.05;
    if (/散|粉|香|符/.test(text)) return 0.08;
    if (/膏|露|剂|药液|小瓶|瓷瓶/.test(text)) return 0.12;
    return 0.1;
};
const 估算小件轻物重量 = (item: any): number => {
    if (是否小件药品(item)) return 估算小件药品重量(item);
    if (是否小件弹药(item)) return 估算小件弹药重量(item);
    if (是否轻便纸符(item)) return 估算轻便纸符重量(item);
    return 0.1;
};
const 获取小件轻物重量上限 = (item: any): number => {
    if (是否小件弹药(item)) return 0.15;
    if (是否轻便纸符(item)) return 0.05;
    return 0.2;
};
const 规范化小件轻物堆叠 = (item: any): void => {
    if (!是否小件轻物(item)) return;
    const type = 规范化文本(item?.类型);
    if (!type || type === '杂项' || type === '杂物') item.类型 = '消耗品';
    item.是否可堆叠 = true;
    item.最大堆叠 = Math.max(规范化整数(item?.最大堆叠, 0), 规范化整数(item?.堆叠数量, 1), 20);
};
const 规范化物品重量 = (item: any): number => {
    const rawWeight = 规范化非负数(item?.重量, 0);
    if (!是否小件轻物(item)) return rawWeight;
    const estimated = 估算小件轻物重量(item);
    const maxWeight = 获取小件轻物重量上限(item);
    if (rawWeight <= 0) return estimated;
    return 四舍五入两位(Math.min(rawWeight, Math.max(estimated, maxWeight)));
};
const 规范化单个物品 = (rawItem: any, idx: number): any | null => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
    const item = { ...rawItem } as any;
    const 名称 = 生成物品名称(item);
    const 描述 = 规范化文本(item?.描述);
    if (!名称 && !描述) return null;
    item.ID = typeof item?.ID === 'string' && item.ID.trim().length > 0
        ? item.ID.trim()
        : `itm_auto_${idx}`;
    item.名称 = 名称 || 描述.slice(0, 12);
    item.描述 = 描述;
    item.类型 = 取首个有效文本片段(item?.类型, '杂物');
    item.品质 = 取首个有效文本片段(item?.品质, '凡品');
    item.重量 = 规范化物品重量(item);
    item.堆叠数量 = Math.max(1, 规范化整数(item?.堆叠数量, 1));
    item.是否可堆叠 = Boolean(item?.是否可堆叠);
    if (无限流支线剧情资源正则.test(item.名称)) {
        item.类型 = 规范化文本(item?.类型, '消耗品') || '消耗品';
        item.是否可堆叠 = true;
        item.最大堆叠 = Math.max(规范化整数(item?.最大堆叠, 0), item.堆叠数量, 99);
    }
    规范化小件轻物堆叠(item);
    item.价值 = 规范化非负数(item?.价值, 0);
    item.当前耐久 = 规范化非负数(item?.当前耐久, 0);
    item.最大耐久 = 规范化非负数(item?.最大耐久, 0);
    item.词条列表 = Array.isArray(item?.词条列表)
        ? item.词条列表.filter((entry: any) => {
            const attr = 规范化文本(entry?.属性);
            const value = Number(entry?.数值);
            return attr && attr !== '属性' && Number.isFinite(value) && value !== 0;
        })
        : [];
    if (item.类型 === '任务' || item.类型 === '任务物品') {
        item.类型 = '任务道具';
    }
    if ((item.类型 === '杂物' || item.类型 === '杂项') && 是否唯一剧情道具(item)) {
        item.类型 = '任务道具';
    }
    if (item.类型 === '秘籍' && !是否为秘籍残卷(item)) {
        item.堆叠数量 = 1;
        item.是否可堆叠 = false;
    }
    if (是否唯一剧情道具(item)) {
        item.堆叠数量 = 1;
        item.是否可堆叠 = false;
        item.最大堆叠 = 1;
        if (!item.视觉唯一性 || item.视觉唯一性 === '普通') {
            item.视觉唯一性 = item.类型 === '任务道具' ? '主线' : '唯一';
        }
    }
    if (['武器', '防具', '饰品'].includes(item.类型)) {
        item.堆叠数量 = 1;
        item.是否可堆叠 = false;
    }
    if (是否货币类型物品(item.类型)) {
        item.是否可堆叠 = true;
        item.最大堆叠 = Math.max(1, 规范化整数(item?.最大堆叠, item.堆叠数量), item.堆叠数量, 999999);
    }
    if (item.类型 === '消耗品') {
        item.使用效果 = 规范化消耗品使用效果(item);
        item.毒性 = 规范化非负数(item?.毒性, 0);
        item.最大堆叠 = Math.max(1, 规范化整数(item?.最大堆叠, item.堆叠数量), item.堆叠数量);
    }
    if (是否储物扩容物品(item)) 规范化储物扩容物品(item);
    delete item.当前容器ID;
    delete item.占用空间;
    delete item.容器属性;
    return item;
};

const 合并同名可堆叠物品 = (items: any[]): any[] => {
    const merged: any[] = [];
    const stackableIndex = new Map<string, number>();
    const isSoftStackableSupply = (item: any): boolean => {
        const text = [
            item?.名称,
            item?.类型,
            item?.品质,
            item?.描述,
            item?.视觉描述
        ].map((value) => 规范化文本(value)).join(' ');
        return /净水片|净水|水片|饮水|水袋|水壶|瓶装水|绷带|纱布|敷料|止血|粗糙绷带|子弹|弹药|毫米|口径|弹匣|药片|药剂|抗生素|止痛|罐头|压缩饼干|电池|燃油|火柴|打火机|滤芯/.test(text);
    };
    const buildKey = (item: any): string => [
        规范化文本(item?.名称).replace(/\s+/g, '').toLowerCase(),
        规范化文本(item?.类型),
        规范化文本(item?.品质)
    ].join('|');
    items.forEach((item) => {
        if (!item) return;
        const shouldTreatAsStackable = item.是否可堆叠 === true || isSoftStackableSupply(item) || 无限流支线剧情资源正则.test(规范化文本(item?.名称));
        if (shouldTreatAsStackable) {
            item.是否可堆叠 = true;
            item.最大堆叠 = Math.max(规范化整数(item?.最大堆叠, 0), 规范化整数(item?.堆叠数量, 1), 99);
        }
        const canStack = shouldTreatAsStackable
            && !是否唯一剧情道具(item)
            && !['武器', '防具', '饰品', '秘籍'].includes(规范化文本(item?.类型));
        if (!canStack) {
            merged.push(item);
            return;
        }
        const key = buildKey(item);
        const existingIndex = stackableIndex.get(key);
        if (typeof existingIndex !== 'number') {
            stackableIndex.set(key, merged.length);
            merged.push(item);
            return;
        }
        const existing = merged[existingIndex];
        const nextCount = Math.max(1, 规范化整数(existing?.堆叠数量, 1))
            + Math.max(1, 规范化整数(item?.堆叠数量, 1));
        existing.堆叠数量 = nextCount;
        existing.最大堆叠 = Math.max(
            规范化整数(existing?.最大堆叠, 0),
            规范化整数(item?.最大堆叠, 0),
            nextCount
        );
        existing.价值 = Math.max(规范化非负数(existing?.价值, 0), 规范化非负数(item?.价值, 0));
        existing.描述 = 取更优文本(existing?.描述, item?.描述);
        if (Array.isArray(item?.词条列表) && item.词条列表.length > 0 && (!Array.isArray(existing?.词条列表) || existing.词条列表.length === 0)) {
            existing.词条列表 = item.词条列表;
        }
    });
    return merged;
};

const 重算物品负重 = (items: any[]): number => 重算背包物品负重(items);

const 功法品质预算: Record<string, {
    最高重数: number;
    升级经验: number;
    基础伤害: number;
    加成系数: number;
    内力系数: number;
    消耗数值: number;
    最大目标数: number;
    被动修正: number;
    效果概率: number;
}> = {
    凡品: { 最高重数: 3, 升级经验: 100, 基础伤害: 8, 加成系数: 0.6, 内力系数: 0.2, 消耗数值: 8, 最大目标数: 1, 被动修正: 2, 效果概率: 8 },
    良品: { 最高重数: 4, 升级经验: 160, 基础伤害: 14, 加成系数: 0.8, 内力系数: 0.35, 消耗数值: 12, 最大目标数: 1, 被动修正: 4, 效果概率: 12 },
    上品: { 最高重数: 6, 升级经验: 260, 基础伤害: 24, 加成系数: 1.05, 内力系数: 0.55, 消耗数值: 18, 最大目标数: 2, 被动修正: 6, 效果概率: 16 },
    极品: { 最高重数: 8, 升级经验: 420, 基础伤害: 40, 加成系数: 1.35, 内力系数: 0.85, 消耗数值: 26, 最大目标数: 3, 被动修正: 9, 效果概率: 22 },
    绝世: { 最高重数: 10, 升级经验: 650, 基础伤害: 65, 加成系数: 1.75, 内力系数: 1.2, 消耗数值: 36, 最大目标数: 4, 被动修正: 14, 效果概率: 30 },
    传说: { 最高重数: 12, 升级经验: 900, 基础伤害: 90, 加成系数: 2.15, 内力系数: 1.6, 消耗数值: 48, 最大目标数: 5, 被动修正: 20, 效果概率: 38 }
};

const 功法品质列表 = Object.keys(功法品质预算);
const 功法类型列表 = (): string[] => 当前题材默认值().kungfuTypes;
const 功法消耗类型列表 = (): string[] => 当前题材默认值().resourceTypes;
const 功法伤害类型列表 = ['物理', '内功', '真实', '混合'];
const 功法目标类型列表 = ['单体', '全体', '扇形', '自身', '随机'];

const 规范化功法枚举 = (value: unknown, allowed: string[], fallback: string): string => {
    const text = 规范化文本(value);
    return allowed.includes(text) ? text : fallback;
};

const 功法偏被动 = (类型: string): boolean => {
    const 被动类 = ['内功', '轻功', '被动', '阵诀', '遁法', '战术', '驾驶', '工程', '医疗', '侦查', '生存', '社交', '潜入', '强化', '召唤', '炼金', '血统'];
    return 被动类.includes(类型);
};

const 计算功法重数倍率 = (当前重数: number, 最高重数: number): number => {
    const level = Math.max(1, Math.floor(当前重数));
    const maxLevel = Math.max(level, Math.floor(最高重数));
    const linear = 1 + (level - 1) * 0.12;
    const milestone = level >= Math.ceil(maxLevel / 2) ? 0.12 : 0;
    const capstone = level >= maxLevel ? 0.18 : 0;
    return Number((linear + milestone + capstone).toFixed(2));
};

const 计算功法重数数值下限 = (base: number, 当前重数: number, 最高重数: number): number => (
    Math.max(0, Number((base * 计算功法重数倍率(当前重数, 最高重数)).toFixed(2)))
);

const 提升数值文本参数 = (value: string, multiplier: number): string => {
    const source = 规范化文本(value);
    const match = source.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) return source;
    const next = Number((Number(match[1]) * multiplier).toFixed(2));
    return `${Number.isInteger(next) ? Math.round(next) : next}${match[2] || ''}`;
};

const 构建功法重数描述 = (名称: string, 品质: string, 类型: string, 最高重数: number): Array<{ 重数: number; 描述: string }> => {
    const pivots = Array.from(new Set([1, Math.max(1, Math.ceil(最高重数 / 2)), 最高重数]))
        .filter((value) => value >= 1 && value <= 最高重数)
        .sort((a, b) => a - b);
    return pivots.map((重数) => ({
        重数,
        描述: 重数 === 最高重数
            ? `${名称}修至第${重数}重时，${品质}底蕴完全展开，${类型}威力、运转稳定性与实战压制感达到当前上限。`
            : `${名称}第${重数}重会逐步显出${品质}${类型}的核心特征，招式衔接与内息反馈更稳定。`
    }));
};

const 标准化功法列表 = (raw: any): any[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((source, index) => {
            const item = { ...source } as any;
            const 名称 = 规范化文本(item?.名称, `未命名功法${index + 1}`) || `未命名功法${index + 1}`;
            const 品质 = 规范化功法枚举(item?.品质, 功法品质列表, '凡品');
            const 类型 = 规范化功法枚举(item?.类型, 功法类型列表(), '被动');
            const budget = 功法品质预算[品质] || 功法品质预算.凡品;
            const passiveLike = 功法偏被动(类型);
            const 最高重数 = Math.max(1, 规范化整数(item?.最高重数, budget.最高重数), budget.最高重数);
            const 当前重数 = Math.min(最高重数, Math.max(1, 规范化整数(item?.当前重数, 1)));
            const 基础伤害下限 = passiveLike ? Math.max(0, Math.floor(budget.基础伤害 * 0.45)) : budget.基础伤害;
            const 加成系数下限 = passiveLike ? Math.max(0.1, Number((budget.加成系数 * 0.75).toFixed(2))) : budget.加成系数;
            const 内力系数下限 = passiveLike ? Math.max(0.1, Number((budget.内力系数 * 0.85).toFixed(2))) : budget.内力系数;
            const 重数倍率 = 计算功法重数倍率(当前重数, 最高重数);
            const 重数基础伤害下限 = 计算功法重数数值下限(基础伤害下限, 当前重数, 最高重数);
            const 重数加成系数下限 = 计算功法重数数值下限(加成系数下限, 当前重数, 最高重数);
            const 重数内力系数下限 = 计算功法重数数值下限(内力系数下限, 当前重数, 最高重数);
            const 被动属性 = 类型 === '轻功' || 类型 === '遁法' ? '敏捷' : (类型 === '内功' || 类型 === '被动' ? '根骨' : '攻击力');
            const rawPassive = Array.isArray(item?.被动修正) ? item.被动修正 : [];
            const 被动修正 = rawPassive
                .filter((entry: any) => entry && typeof entry === 'object' && 规范化文本(entry?.属性名))
                .map((entry: any) => ({
                    属性名: 规范化文本(entry?.属性名),
                    数值: Math.max(规范化数值(entry?.数值, 0), 计算功法重数数值下限(budget.被动修正, 当前重数, 最高重数)),
                    类型: entry?.类型 === '百分比' ? '百分比' : '固定值'
                }));
            if ((passiveLike || 品质 === '绝世' || 品质 === '传说') && 被动修正.length === 0) {
                被动修正.push({ 属性名: 被动属性, 数值: 计算功法重数数值下限(budget.被动修正, 当前重数, 最高重数), 类型: passiveLike ? '百分比' : '固定值' });
            }
            const rawEffects = Array.isArray(item?.附带效果) ? item.附带效果 : [];
            const 附带效果 = rawEffects
                .filter((entry: any) => entry && typeof entry === 'object' && 规范化文本(entry?.名称))
                .map((entry: any) => ({
                    名称: 规范化文本(entry?.名称),
                    触发概率: 规范化文本(entry?.触发概率, `${budget.效果概率}%`),
                    持续时间: 规范化文本(entry?.持续时间, '1回合'),
                    数值参数: 规范化文本(entry?.数值参数) || 提升数值文本参数(`${Math.max(1, budget.被动修正)}`, 重数倍率),
                    生效间隔: 规范化文本(entry?.生效间隔, '每次施展')
                }));
            if ((品质 === '极品' || 品质 === '绝世' || 品质 === '传说') && 附带效果.length === 0) {
                附带效果.push({
                    名称: `${名称}真意`,
                    触发概率: `${budget.效果概率}%`,
                    持续时间: '2回合',
                    数值参数: `${Math.max(1, budget.被动修正)}`,
                    生效间隔: '每次施展'
                });
            }
            const 重数描述映射 = Array.isArray(item?.重数描述映射) && item.重数描述映射.length > 0
                ? item.重数描述映射
                    .map((entry: any) => ({
                        重数: Math.min(最高重数, Math.max(1, 规范化整数(entry?.重数, 1))),
                        描述: 规范化文本(entry?.描述)
                    }))
                    .filter((entry: any) => entry.描述)
                : 构建功法重数描述(名称, 品质, 类型, 最高重数);
            const 境界特效 = Array.isArray(item?.境界特效) && item.境界特效.length > 0
                ? item.境界特效
                    .map((entry: any) => ({
                        解锁重数: Math.min(最高重数, Math.max(1, 规范化整数(entry?.解锁重数, 最高重数))),
                        描述: 规范化文本(entry?.描述)
                    }))
                    .filter((entry: any) => entry.描述)
                : [{
                    解锁重数: 最高重数,
                    描述: `${名称}圆满后解锁${品质}层级的专属运转特效。`
                }];
            return {
                ...item,
                ID: 规范化文本(item?.ID, `kungfu_auto_${index}`) || `kungfu_auto_${index}`,
                名称,
                描述: 规范化文本(item?.描述, `${名称}是一门${品质}${类型}，其描述、效果与数值按品质保持一致。`),
                类型,
                品质,
                来源: 规范化文本(item?.来源, '剧情获得'),
                当前重数,
                最高重数,
                当前熟练度: Math.max(0, 规范化整数(item?.当前熟练度, 0)),
                升级经验: Math.max(budget.升级经验, 规范化整数(item?.升级经验, budget.升级经验)),
                突破条件: 规范化文本(item?.突破条件, `需将${名称}修至当前重数圆融，并满足${品质}功法对应的实战或悟性门槛。`),
                境界限制: 规范化文本(item?.境界限制, '无明确境界限制'),
                大成方向: 规范化文本(item?.大成方向, passiveLike ? '强化身法、内息循环与长期战斗稳定性。' : '强化正面威力、破防与招式压制。'),
                圆满效果: 规范化文本(item?.圆满效果, `${名称}圆满后，${品质}底蕴完全显现，核心效果、数值增益与战斗表现同步提升。`),
                武器限制: Array.isArray(item?.武器限制) ? item.武器限制.map((value: any) => 规范化文本(value)).filter(Boolean) : [],
                消耗类型: 规范化功法枚举(item?.消耗类型, 功法消耗类型列表(), 类型 === '术法' || 类型 === '神通' || 类型 === '法诀' ? '灵力' : '内力'),
                消耗数值: Math.max(0, 规范化整数(item?.消耗数值, budget.消耗数值)),
                施展耗时: 规范化文本(item?.施展耗时, '一息'),
                冷却时间: 规范化文本(item?.冷却时间, '无'),
                加成属性: 规范化文本(item?.加成属性, passiveLike ? 被动属性 : '攻击力'),
                基础伤害: Math.max(重数基础伤害下限, 规范化数值(item?.基础伤害, 重数基础伤害下限)),
                加成系数: Math.max(重数加成系数下限, 规范化数值(item?.加成系数, 重数加成系数下限)),
                内力系数: Math.max(重数内力系数下限, 规范化数值(item?.内力系数, 重数内力系数下限)),
                伤害类型: 规范化功法枚举(item?.伤害类型, 功法伤害类型列表, 类型 === '外功' ? '物理' : '内功'),
                目标类型: 规范化功法枚举(item?.目标类型, 功法目标类型列表, passiveLike ? '自身' : '单体'),
                最大目标数: Math.max(1, Math.max(规范化整数(item?.最大目标数, 1), budget.最大目标数)),
                重数描述映射,
                附带效果,
                被动修正,
                境界特效
            };
        });
};
const 清理旧储物字段并重算负重 = (items: any[]): number => {
    items.forEach((item) => {
        delete item.当前容器ID;
        delete item.占用空间;
        delete item.容器属性;
    });
    return 重算物品负重(items);
};
const 规范化角色身体部位字段 = (role: any) => {
    角色身体部位列表.forEach((part) => {
        const rawPart = role?.[part];
        const partObj = rawPart && typeof rawPart === 'object' && !Array.isArray(rawPart) ? rawPart : {};
        const 当前血量Key = `${part}当前血量`;
        const 最大血量Key = `${part}最大血量`;
        const 状态Key = `${part}状态`;
        const 当前血量 = Number.isFinite(Number(partObj?.当前血量))
            ? Number(partObj.当前血量)
            : 规范化数值(role?.[当前血量Key], 0);
        const 最大血量 = Number.isFinite(Number(partObj?.最大血量))
            ? Number(partObj.最大血量)
            : 规范化数值(role?.[最大血量Key], 0);
        const 状态 = typeof partObj?.状态 === 'string'
            ? partObj.状态.trim()
            : 规范化文本(role?.[状态Key]);
        role[当前血量Key] = 当前血量;
        role[最大血量Key] = 最大血量;
        role[状态Key] = 状态;
        if (partObj && Object.keys(partObj).length > 0) {
            delete role[part];
        }
    });
};
const 取地点片段 = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');
const 取区间整数 = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    const int = Math.trunc(n);
    if (int < min || int > max) return fallback;
    return int;
};
const 去除具体地点冗余 = (specificRaw: string, smallRaw: string): string => {
    const specific = 取地点片段(specificRaw);
    const small = 取地点片段(smallRaw);
    if (!specific || !small) return specific;
    if (!specific.startsWith(small)) return specific;
    const stripped = specific.slice(small.length).replace(/^[\s\-—>·/|，,、。:：]+/, '').trim();
    return stripped || specific;
};
const 规范化环境时间文本 = (rawEnv?: any): string => {
    const source = rawEnv && typeof rawEnv === 'object' ? rawEnv : {};
    if (typeof source?.时间 === 'string') {
        const canonical = normalizeCanonicalGameTime(source.时间);
        if (canonical) return canonical;
    }
    const structured = 结构化时间转标准串(source);
    if (structured) {
        const canonical = normalizeCanonicalGameTime(structured);
        if (canonical) return canonical;
    }
    return '1:01:01:00:00';
};
const 规范化环境信息 = (rawEnv?: any): 环境信息结构 => {
    const source = rawEnv && typeof rawEnv === 'object' ? rawEnv : {};
    const 时间 = 规范化环境时间文本(source);
    const 大地点 = 取地点片段(source?.大地点);
    const 中地点 = 取地点片段(source?.中地点);
    const 小地点 = 取地点片段(source?.小地点);
    const 原始具体地点 = 取地点片段(source?.具体地点);
    const 具体地点 = 去除具体地点冗余(原始具体地点, 小地点);
    const rawFestival = source?.节日 && typeof source.节日 === 'object' ? source.节日 : null;
    const rawFestivalName = typeof source?.节日 === 'string' ? source.节日.trim() : '';
    const festivalSource = rawFestival;
    const 节日 = festivalSource
        ? {
            名称: typeof festivalSource?.名称 === 'string'
                ? festivalSource.名称.trim()
                : rawFestivalName,
            简介: typeof festivalSource?.简介 === 'string'
                ? festivalSource.简介.trim()
                : '',
            效果: typeof festivalSource?.效果 === 'string' ? festivalSource.效果.trim() : ''
        }
        : (rawFestivalName ? { 名称: rawFestivalName, 简介: '', 效果: '' } : null);
    const rawWeather = source?.天气 && typeof source.天气 === 'object' ? source.天气 : {};
    const 天气结束日期 = (() => {
        if (typeof rawWeather?.结束日期 === 'string') {
            const canonical = normalizeCanonicalGameTime(rawWeather.结束日期);
            if (canonical) return canonical;
        }
        const structured = 结构化时间转标准串(rawWeather?.结束日期);
        if (structured) {
            const canonical = normalizeCanonicalGameTime(structured);
            return canonical || structured;
        }
        return 时间;
    })();
    const 天气 = {
        天气: typeof rawWeather?.天气 === 'string' ? rawWeather.天气.trim() : '',
        结束日期: 天气结束日期
    };
    const 标准化环境变量条目 = (raw: any) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const 名称 = typeof raw?.名称 === 'string' ? raw.名称.trim() : '';
        const 描述 = typeof raw?.描述 === 'string' ? raw.描述.trim() : '';
        const 效果 = typeof raw?.效果 === 'string' ? raw.效果.trim() : '';
        if (!名称 && !描述 && !效果) return null;
        return { 名称, 描述, 效果 };
    };
    const rawEnvVar = source?.环境变量;
    const 环境变量源 = Array.isArray(rawEnvVar)
        ? rawEnvVar
        : (rawEnvVar && typeof rawEnvVar === 'object' ? [rawEnvVar] : []);
    const 环境变量 = 环境变量源
        .map((item: any) => 标准化环境变量条目(item))
        .filter((item): item is { 名称: string; 描述: string; 效果: string } => Boolean(item))
        .slice(-2);
    return {
        时间,
        大地点,
        中地点,
        小地点,
        具体地点,
        节日,
        天气,
        环境变量
    };
};
const 构建完整地点文本 = (env: any): string => {
    const normalized = 规范化环境信息(env);
    const parts = [normalized.大地点, normalized.中地点, normalized.小地点, normalized.具体地点]
        .map((part) => part.trim())
        .filter(Boolean);
    const unique = parts.filter((part, idx) => parts.indexOf(part) === idx);
    return unique.length > 0 ? unique.join(' > ') : '未知地点';
};

const 标准化角色图片记录 = (raw: any): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const normalizedAsset = 压缩图片资源字段(raw);
    const 图片URL = typeof normalizedAsset?.图片URL === 'string' ? normalizedAsset.图片URL.trim() : undefined;
    const 本地路径 = typeof normalizedAsset?.本地路径 === 'string' ? normalizedAsset.本地路径.trim() : undefined;
    const 生图词组 = typeof raw?.生图词组 === 'string' ? raw.生图词组.trim() : '';
    const 最终正向提示词 = typeof raw?.最终正向提示词 === 'string' ? raw.最终正向提示词.trim() : undefined;
    const 最终负向提示词 = typeof raw?.最终负向提示词 === 'string' ? raw.最终负向提示词.trim() : undefined;
    const 原始描述 = typeof raw?.原始描述 === 'string' ? raw.原始描述.trim() : '';
    const 使用模型 = typeof raw?.使用模型 === 'string' ? raw.使用模型.trim() : '';
    const 画师串 = typeof raw?.画师串 === 'string' ? raw.画师串.trim() : undefined;
    const 错误信息 = typeof raw?.错误信息 === 'string' ? raw.错误信息.trim() : undefined;
    const 状态 = raw?.状态 === 'success' || raw?.状态 === 'failed' || raw?.状态 === 'pending'
        ? raw.状态
        : undefined;
    const 生成时间 = Number.isFinite(Number(raw?.生成时间)) ? Number(raw.生成时间) : 0;
    const id = typeof raw?.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : '';
    if (!图片URL && !本地路径 && !生图词组 && !原始描述 && !错误信息) return undefined;
    return {
        ...normalizedAsset,
        id: id || undefined,
        图片URL,
        本地路径,
        生图词组,
        最终正向提示词,
        最终负向提示词,
        原始描述,
        使用模型,
        生成时间,
        构图: typeof raw?.构图 === 'string' ? raw.构图 : undefined,
        画风: raw?.画风,
        画师串,
        尺寸: typeof raw?.尺寸 === 'string' ? raw.尺寸.trim() : undefined,
        状态,
        错误信息
    };
};

const 合并角色图片档案对象 = (leftRaw: any, rightRaw: any): any | undefined => {
    const leftSource = leftRaw && typeof leftRaw === 'object' && !Array.isArray(leftRaw) ? leftRaw : {};
    const rightSource = rightRaw && typeof rightRaw === 'object' && !Array.isArray(rightRaw) ? rightRaw : {};
    const 取首个非空文本值 = (...values: unknown[]): string | undefined => {
        for (const value of values) {
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return undefined;
    };
    const leftRecent = 标准化角色图片记录(leftSource?.最近生图结果);
    const rightRecent = 标准化角色图片记录(rightSource?.最近生图结果);
    const mergedMap = new Map<string, any>();
    const rightHistorySource = [
        ...(Array.isArray(rightSource?.生图历史) ? rightSource.生图历史 : []),
        ...(rightRecent ? [rightRecent] : [])
    ];
    const leftHistorySource = [
        ...(Array.isArray(leftSource?.生图历史) ? leftSource.生图历史 : []),
        ...(leftRecent ? [leftRecent] : [])
    ];
    [...rightHistorySource, ...leftHistorySource]
        .forEach((item) => {
            const normalized = 标准化角色图片记录(item);
            if (!normalized) return;
            const key = typeof normalized.id === 'string' && normalized.id.trim()
                ? normalized.id.trim()
                : `${normalized.生成时间 || 0}|${normalized.构图 || ''}|${normalized.图片URL || normalized.本地路径 || normalized.原始描述 || ''}`;
            if (mergedMap.has(key)) return;
            mergedMap.set(key, normalized);
        });
    const mergedHistory = Array.from(mergedMap.values()).sort((a, b) => (Number(b?.生成时间) || 0) - (Number(a?.生成时间) || 0));
    const recent = rightRecent || leftRecent || mergedHistory[0];
    const 原始已选头像图片ID = 取首个非空文本值(rightSource?.已选头像图片ID, leftSource?.已选头像图片ID);
    const 原始已选立绘图片ID = 取首个非空文本值(rightSource?.已选立绘图片ID, leftSource?.已选立绘图片ID);
    const 已选背景图片ID = 取首个非空文本值(rightSource?.已选背景图片ID, leftSource?.已选背景图片ID);
    const 角色图片记录可作头像 = (record: any): boolean => (
        record?.构图 === '头像'
        && record?.状态 === 'success'
        && Boolean(record?.id)
        && 图片资源记录含可恢复地址(record)
    );
    const 角色图片记录可作立绘 = (record: any): boolean => (
        (record?.构图 === '半身' || record?.构图 === '立绘')
        && record?.状态 === 'success'
        && Boolean(record?.id)
        && 图片资源记录含可恢复地址(record)
    );
    const 已选头像图片ID = mergedHistory.some((item) => item?.id === 原始已选头像图片ID && 角色图片记录可作头像(item))
        ? 原始已选头像图片ID
        : (mergedHistory.find(角色图片记录可作头像)?.id || undefined);
    const 已选立绘图片ID = mergedHistory.some((item) => item?.id === 原始已选立绘图片ID && 角色图片记录可作立绘(item))
        ? 原始已选立绘图片ID
        : (mergedHistory.find(角色图片记录可作立绘)?.id || undefined);
    if (!recent && mergedHistory.length <= 0 && !已选头像图片ID && !已选立绘图片ID && !已选背景图片ID) {
        return undefined;
    }
    return {
        ...(recent ? { 最近生图结果: recent } : {}),
        ...(mergedHistory.length > 0 ? { 生图历史: mergedHistory } : {}),
        ...(已选头像图片ID ? { 已选头像图片ID } : {}),
        ...(已选立绘图片ID ? { 已选立绘图片ID } : {}),
        ...(已选背景图片ID ? { 已选背景图片ID } : {})
    };
};

const 规范化角色物品容器映射 = (rawRole?: any, options?: 玩家BUFF规范化选项): 角色数据结构 => {
    const 装备槽位列表: 装备槽位[] = ['头部', '胸部', '盔甲', '内衬', '腿部', '手部', '足部', '主武器', '副武器', '暗器', '背部', '腰部', '坐骑'];
    const 装备槽位集合 = new Set<string>(装备槽位列表);
    const 槽位ID片段映射: Record<装备槽位, string> = {
        头部: 'head',
        胸部: 'chest',
        盔甲: 'armor',
        内衬: 'inner',
        腿部: 'legs',
        手部: 'hands',
        足部: 'feet',
        主武器: 'main_weapon',
        副武器: 'off_weapon',
        暗器: 'hidden_weapon',
        背部: 'back',
        腰部: 'waist',
        坐骑: 'mount'
    };
    const 槽位类型映射: Record<装备槽位, '武器' | '防具' | '杂物'> = {
        头部: '防具',
        胸部: '防具',
        盔甲: '防具',
        内衬: '防具',
        腿部: '防具',
        手部: '防具',
        足部: '防具',
        主武器: '武器',
        副武器: '武器',
        暗器: '武器',
        背部: '防具', // 修正：背部不再是容器，视为防具/挂件
        腰部: '防具', // 修正：腰部不再是容器，视为防具/挂件
        坐骑: '杂物'
    };

    const role = 深拷贝(rawRole && typeof rawRole === 'object' ? rawRole : {}) as any;
    (role as any).姓名 = 规范化文本((role as any).姓名);
    (role as any).性别 = 规范化文本((role as any).性别, '男');
    (role as any).年龄 = 取区间整数((role as any).年龄, 16, 0, 9999);
    (role as any).出生日期 = 规范化文本((role as any).出生日期);
    (role as any).称号 = 规范化文本((role as any).称号);
    (role as any).境界 = 规范化境界显示文本((role as any).境界);
    (role as any).境界层级 = Math.max(0, 规范化整数((role as any).境界层级, 1));
    if (
        (role as any).灵根 !== undefined
        || (role as any).灵根资质 !== undefined
        || (role as any).当前灵力 !== undefined
        || (role as any).最大灵力 !== undefined
        || (role as any).当前神识 !== undefined
        || (role as any).最大神识 !== undefined
        || (role as any).丹田状态 !== undefined
        || (role as any).道基状态 !== undefined
        || (role as any).心魔值 !== undefined
        || (role as any).功德 !== undefined
        || (role as any).业力 !== undefined
    ) {
        (role as any).灵根 = 规范化文本((role as any).灵根, '未鉴定灵根');
        (role as any).灵根资质 = 规范化文本((role as any).灵根资质, '未鉴定');
        (role as any).最大灵力 = Math.max(0, 规范化数值((role as any).最大灵力, 0));
        (role as any).当前灵力 = Math.max(0, 规范化数值((role as any).当前灵力, 0));
        (role as any).最大神识 = Math.max(0, 规范化数值((role as any).最大神识, 0));
        (role as any).当前神识 = Math.max(0, 规范化数值((role as any).当前神识, 0));
        (role as any).丹田状态 = 规范化文本((role as any).丹田状态, '稳定');
        (role as any).道基状态 = 规范化文本((role as any).道基状态, '未筑道基');
        (role as any).心魔值 = Math.max(0, 规范化数值((role as any).心魔值, 0));
        (role as any).功德 = 规范化数值((role as any).功德, 0);
        (role as any).业力 = 规范化数值((role as any).业力, 0);
    }
    (role as any).所属门派ID = 规范化文本((role as any).所属门派ID, 'none');
    (role as any).门派职位 = 规范化文本((role as any).门派职位, '无');
    (role as any).门派贡献 = Math.max(0, 规范化整数((role as any).门派贡献, 0));
    (role as any).当前精力 = Math.max(0, 规范化数值((role as any).当前精力, 0));
    (role as any).最大精力 = Math.max(0, 规范化数值((role as any).最大精力, 0));
    const 当前资源类型 = 当前题材默认值().resourceTypes;
    if (当前资源类型.includes('内力')) {
        (role as any).当前内力 = Math.max(0, 规范化数值((role as any).当前内力, 0));
        (role as any).最大内力 = Math.max(0, 规范化数值((role as any).最大内力, 0));
    }
    if (当前资源类型.includes('体力')) {
        (role as any).当前体力 = Math.max(0, 规范化数值((role as any).当前体力, 0));
        (role as any).最大体力 = Math.max(0, 规范化数值((role as any).最大体力, 0));
    }
    if (当前资源类型.includes('理智')) {
        (role as any).当前理智 = Math.max(0, 规范化数值((role as any).当前理智, 0));
        (role as any).最大理智 = Math.max(0, 规范化数值((role as any).最大理智, 0));
    }
    if (当前资源类型.includes('弹药')) {
        (role as any).当前弹药 = Math.max(0, 规范化数值((role as any).当前弹药, 0));
        (role as any).最大弹药 = Math.max(0, 规范化数值((role as any).最大弹药, 0));
    }
    (role as any).当前饱腹 = Math.max(0, 规范化数值((role as any).当前饱腹, 0));
    (role as any).最大饱腹 = Math.max(0, 规范化数值((role as any).最大饱腹, 0));
    (role as any).当前口渴 = Math.max(0, 规范化数值((role as any).当前口渴, 0));
    (role as any).最大口渴 = Math.max(0, 规范化数值((role as any).最大口渴, 0));
    (role as any).当前负重 = Math.max(0, 规范化数值((role as any).当前负重, 0));
    (role as any).最大负重 = Math.max(0, 规范化数值((role as any).最大负重, 0));
    (role as any).力量 = 规范化数值((role as any).力量, 0);
    (role as any).敏捷 = 规范化数值((role as any).敏捷, 0);
    (role as any).体质 = 规范化数值((role as any).体质, 0);
    (role as any).根骨 = 规范化数值((role as any).根骨, 0);
    (role as any).悟性 = 规范化数值((role as any).悟性, 0);
    (role as any).福源 = 规范化数值((role as any).福源, 0);
    (role as any).当前经验 = Math.max(0, 规范化数值((role as any).当前经验, 0));
    (role as any).升级经验 = Math.max(0, 规范化数值((role as any).升级经验, 0));
    (role as any).当前坐标X = 规范化数值((role as any).当前坐标X, 0);
    (role as any).当前坐标Y = 规范化数值((role as any).当前坐标Y, 0);
    (role as any).天赋列表 = 标准化天赋列表((role as any).天赋列表);
    (role as any).出身背景 = 标准化出身背景((role as any).出身背景);
    规范化角色身体部位字段(role);
    if (typeof (role as any).外貌 !== 'string' || !(role as any).外貌.trim()) {
        (role as any).外貌 = '相貌平常，衣着朴素。';
    }
    if (typeof (role as any).性格 !== 'string' || !(role as any).性格.trim()) {
        (role as any).性格 = '谨慎沉稳。';
    }
    const rawMoney = (role as any).金钱 && typeof (role as any).金钱 === 'object' ? (role as any).金钱 : {};
    const 默认货币 = 当前题材默认值().currency;
    (role as any).金钱 = { ...默认货币 };
    const 兼容货币字段 = new Set(['上层货币', '中层货币', '底层货币', '金元宝', '银子', '铜钱', 'baseAmount']);
    Object.entries(rawMoney).forEach(([key, value]) => {
        if (key in 默认货币 || 兼容货币字段.has(key)) {
            (role as any).金钱[key] = 规范化货币数值(value);
        }
    });
    (role as any).玩家BUFF = 标准化玩家BUFF列表((role as any).玩家BUFF, options);
    const rawBreakthroughs = Array.isArray((role as any).突破条件) ? (role as any).突破条件 : [];
    (role as any).突破条件 = rawBreakthroughs
        .map((item: any, idx: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const 名称 = 规范化文本(item?.名称);
            const 描述 = 规范化文本(item?.描述);
            const 要求 = 规范化文本(item?.要求);
            const 当前进度 = 规范化文本(item?.当前进度);
            if (!名称 && !描述 && !要求 && !当前进度) return null;
            return {
                索引: idx,
                名称,
                描述,
                要求,
                当前进度
            };
        })
        .filter(Boolean)
        .map((item: any, idx: number) => ({ ...item, 索引: idx }));
    (role as any).功法列表 = 标准化功法列表((role as any).功法列表);
    (role as any).技艺 = 标准化角色技艺((role as any).技艺);

    // 兜底：如果技艺全为"未入门/熟练度0"，根据角色信息自动给基础值
    const 技艺列表 = (role as any).技艺 as Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }>;
    const 全部为零 = 技艺列表.every((s) => s.熟练度 === 0 && (s.等级 === '未入门' || !s.等级));
    if (全部为零) {
        应用出身天赋技艺推断(技艺列表, {
            seed: [
                role?.姓名,
                role?.性别,
                role?.出身背景?.名称,
                role?.所属门派ID,
                role?.称号
            ].map((value) => 规范化文本(value)).join('|'),
            text: [
                role?.出身背景?.名称,
                role?.出身背景?.描述,
                role?.出身背景?.效果,
                role?.所属门派ID,
                role?.性格,
                role?.外貌,
                role?.称号
            ].map((value) => 规范化文本(value)).join(' '),
            talents: role?.天赋列表,
            background: role?.出身背景,
            major: true,
            reasonLabel: '因天赋与出身经历'
        });
    }

    const rawEquip = role?.装备 && typeof role.装备 === 'object' ? role.装备 : ({} as any);
    role.装备 = { ...当前题材默认值().equipment, ...(rawEquip as any) };

    const sourceList = Array.isArray(role?.物品列表) ? role.物品列表 : [];

    let deduped: any[] = [];
    const seenIds = new Set<string>();
    sourceList.forEach((item: any, idx: number) => {
        if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, '堆叠数量') && 规范化整数(item?.堆叠数量, 1) <= 0) return;
        const normalizedItem = 规范化单个物品(item, idx);
        if (!normalizedItem) return;
        const id = normalizedItem.ID;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        deduped.push(normalizedItem);
    });
    deduped = 合并同名可堆叠物品(deduped);

    const uniqueByName = new Map<string, any>();
    deduped = deduped.filter((item) => {
        if (!是否唯一剧情道具(item)) return true;
        const key = 规范化文本(item?.名称).replace(/\s+/g, '').toLowerCase();
        if (!key) return true;
        if (uniqueByName.has(key)) return false;
        uniqueByName.set(key, item);
        return true;
    });

    const itemById = new Map<string, any>(deduped.map((item) => [item.ID, item]));

    const findItemByRef = (idOrName: string): any | undefined => {
        return itemById.get(idOrName) || deduped.find((item) => item?.名称 === idOrName);
    };
    const equippedByItemId = new Map<string, 装备槽位>();
    装备槽位列表.forEach((slot) => {
        const rawRef = (role.装备 as any)[slot];
        const normalizedRef = typeof rawRef === 'string' ? rawRef.trim() : '';
        if (!normalizedRef || normalizedRef === '无') {
            (role.装备 as any)[slot] = '无';
            return;
        }
        (role.装备 as any)[slot] = normalizedRef;
        const matched = findItemByRef(normalizedRef);
        if (!matched?.ID) {
            (role.装备 as any)[slot] = '无';
            return;
        }
        const existedSlot = equippedByItemId.get(matched.ID);
        if (existedSlot && existedSlot !== slot) {
            (role.装备 as any)[slot] = '无';
            return;
        }
        equippedByItemId.set(matched.ID, slot);
    });

    // 确保物品列表中的装备部位字段与装备栏一致
    deduped.forEach((item) => {
        const equipSlot = equippedByItemId.get(item.ID);
        if (equipSlot) {
            item.当前装备部位 = equipSlot;
        } else {
            delete item.当前装备部位;
        }
    });

    const autoEquippedRole = 自动装备最佳装备({ ...(role as any), 物品列表: deduped } as 角色数据结构) as any;
    role.装备 = autoEquippedRole.装备;
    deduped = Array.isArray(autoEquippedRole.物品列表) ? autoEquippedRole.物品列表 : deduped;
    equippedByItemId.clear();
    deduped.forEach((item) => {
        const equipSlot = 装备槽位集合.has(item?.当前装备部位) ? item.当前装备部位 as 装备槽位 : undefined;
        if (equipSlot && item?.ID) equippedByItemId.set(item.ID, equipSlot);
    });

    const 图片档案 = (() => {
        const source = role?.图片档案 && typeof role.图片档案 === 'object' && !Array.isArray(role.图片档案)
            ? role.图片档案
            : null;
        return 合并角色图片档案对象(
            role?.最近生图结果 && typeof role.最近生图结果 === 'object'
                ? { 最近生图结果: role.最近生图结果 }
                : undefined,
            source
        );
    })();

    if (图片档案) {
        (role as any).图片档案 = 图片档案;
        (role as any).最近生图结果 = 图片档案.最近生图结果;
    } else {
        delete (role as any).图片档案;
        delete (role as any).最近生图结果;
    }

    const topicProfile = 获取题材模式配置(options?.题材模式);
    const shouldStripCultivationPills = topicProfile.group === 'modern'
        || topicProfile.group === 'apocalypse'
        || 角色疑似现代或末日题材(role);
    role.物品列表 = deduped.filter((item: any) => {
        const id = 规范化文本(item?.ID);
        const name = 规范化文本(item?.名称);
        if (options?.启用饱腹口渴系统 === false && (生存补给预设名称集合.has(name) || id === 'auto_pill_bigu' || id === 'auto_survival_water' || id === 'auto_survival_biscuit')) {
            return false;
        }
        if (shouldStripCultivationPills && id.startsWith('auto_') && (古风丹药预设名称集合.has(name) || 题材现代化时应移除古风丹药(item))) {
            return false;
        }
        return true;
    });
    // 若出身背景定义了初始物品列表，使用背景物并跳过系统自动预设（仅首次生效）
    const 背景初始物品 = (role as any)?.出身背景?.初始物品;
    const 是否已补过背景物 = (role as any).已补齐系统丹药预设 === true;
    if (Array.isArray(背景初始物品) && !是否已补过背景物) {
        const 背景物品 = 背景初始物品
            .map((entry: any) => {
                const name = 规范化文本(entry?.名称);
                const type = 规范化文本(entry?.类型);
                if (!name) return null;
                const 货币展开 = 展开背景货币代理物品(name, type, options?.题材模式);
                if (货币展开?.length) {
                    const typedCount = typeof entry?.数量 === 'number' && entry.数量 > 0 ? entry.数量 : 1;
                    const expanded = 货币展开.map((currencyEntry) => ({
                        ...currencyEntry,
                        数量: currencyEntry.数量 * typedCount,
                        描述: 规范化文本(entry?.描述) || currencyEntry.描述,
                        类型: type || currencyEntry.类型,
                    }));
                    return expanded.map((currencyEntry) => 构建背景货币实体物品(currencyEntry));
                }
                return {
                    ID: `bg_item_${name}`,
                    名称: name,
                    数量: typeof entry?.数量 === 'number' && entry.数量 > 0 ? entry.数量 : 1,
                    描述: 规范化文本(entry?.描述) || '',
                    类型: type || '杂物',
                    品质: '凡品',
                    重量: 0.1,
                    堆叠数量: typeof entry?.数量 === 'number' && entry.数量 > 0 ? entry.数量 : 1,
                    是否可堆叠: true,
                    最大堆叠: 99,
                    当前耐久: 1,
                    最大耐久: 1,
                    词条列表: [],
                } as any;
            })
            .flat()
            .filter(Boolean);
        // 用背景物品替换当前物品列表（不含自动预设丹药）
        role.物品列表 = 背景物品;
        (role as any).已补齐系统丹药预设 = true;
    } else {
        // 只有角色身上从未被系统补过（已补齐系统丹药预设 !== true）才补一次。
        // 用户反馈：丹药用完后下回合又出来了——根因就是这里每回合都补一次。
        const 是否已补过 = (role as any).已补齐系统丹药预设 === true;
        if (!是否已补过) {
            const 自动补齐题材模式 = shouldStripCultivationPills
                && topicProfile.group !== 'apocalypse'
                && options?.启用饱腹口渴系统 !== false
                ? '末日丧尸'
                : options?.题材模式;
            role.物品列表 = 补齐自动丹药预设(role.物品列表, {
                启用饱腹口渴系统: options?.启用饱腹口渴系统,
                题材模式: 自动补齐题材模式
            });
            (role as any).已补齐系统丹药预设 = true;
        }
    }
    (role as any).金钱 = 确保角色金钱BaseAmount(
        从物品列表汇总角色货币(role.物品列表, (role as any).金钱 || {}),
        _当前运行时配置,
        _当前运行时配置?.economy?.currencyDisplayMode as any
    );
    role.当前负重 = 清理旧储物字段并重算负重(role.物品列表);
    同步角色储物负重上限(role);
    return role;
};

const 取首个非空文本 = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
};

const 取字段文本 = (obj: any, key: string): string | undefined => {
    return typeof obj?.[key] === 'string' ? obj[key].trim() : undefined;
};

const 解析任意时间字段 = (raw: unknown): string | undefined => {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        return normalizeCanonicalGameTime(trimmed) || trimmed;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const structured = 结构化时间转标准串(raw);
        if (!structured) return undefined;
        return normalizeCanonicalGameTime(structured) || structured;
    }
    return undefined;
};

const 读取胸部描述 = (obj: any): string | undefined => {
    return 取字段文本(obj, '胸部描述');
};

const 读取小穴描述 = (obj: any): string | undefined => {
    return 取字段文本(obj, '小穴描述');
};

const 读取屁穴描述 = (obj: any): string | undefined => {
    return 取字段文本(obj, '屁穴描述');
};

const 读取肉棒描述 = (obj: any): string | undefined => {
    return 取字段文本(obj, '肉棒描述');
};

const 读取男娘设定 = (obj: any): string | undefined => {
    return 取字段文本(obj, '男娘设定');
};

const 读取扶她设定 = (obj: any): string | undefined => {
    return 取字段文本(obj, '扶她设定');
};

const 读取性癖 = (obj: any): string | undefined => {
    const text = 取字段文本(obj, '性癖');
    if (!text || /^(未知|不详|待定|待开发|暂无记录|无)$/u.test(text)) return undefined;
    return text;
};

const 读取敏感点 = (obj: any): string | undefined => {
    const text = 取字段文本(obj, '敏感点');
    if (!text || /^(未知|不详|待定|待开发|暂无记录|无)$/u.test(text)) return undefined;
    return text;
};

const 亲密行为类型列表 = ['口交', '肛交', '阴道交', '乳交', '手交', '足交', '股交'] as const;
type 亲密行为类型 = typeof 亲密行为类型列表[number];

const 标准化亲密行为类型 = (value: unknown): 亲密行为类型 | '' => {
    const text = 规范化文本(value).replace(/\s+/g, '');
    if (!text) return '';
    if (/口交|口淫|口活|含弄|吮弄|舔弄/.test(text)) return '口交';
    if (/肛交|后庭|屁穴|肛门/.test(text)) return '肛交';
    if (/阴道交|阴道|小穴|蜜穴|破处|初夜|失贞|性交|交合|同房/.test(text)) return '阴道交';
    if (/乳交|胸交|乳房/.test(text)) return '乳交';
    if (/手交|(?:手淫|手弄|掌心)(?:肉棒|阴茎|龟头|下体|性器)/.test(text)) return '手交';
    if (/足交|脚交|足弄|脚掌|足心/.test(text)) return '足交';
    if (/股交|腿交(?!叠)|(?:腿间|大腿)(?:肉棒|阴茎|下体|性器|夹住|夹着|磨蹭|摩擦|抽送)/.test(text)) return '股交';
    return '';
};

const NPC允许亲密行为类型 = (npc: any, type: 亲密行为类型): boolean => {
    const gender = 规范化文本(npc?.性别);
    const text = [gender, npc?.男娘设定, npc?.扶她设定, npc?.简介, npc?.身份]
        .map((value) => 规范化文本(value))
        .join(' ');
    const isFuta = /扶她/.test(text);
    const isFemale = gender === '女' || (/女/.test(text) && !/男娘/.test(text));
    if (type === '阴道交') return isFemale || isFuta;
    if (type === '乳交') return isFemale || isFuta || /男娘/.test(text);
    return true;
};

const 标准化失贞档案 = (raw: any): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const 是否失贞 = typeof raw?.是否失贞 === 'boolean'
        ? raw.是否失贞
        : typeof raw?.失贞 === 'boolean'
            ? raw.失贞
            : undefined;
    const 第一次对象 = 取首个非空文本(raw?.第一次对象, raw?.对象, raw?.夺取者, raw?.交给谁);
    const 第一次时间 = 解析任意时间字段(raw?.第一次时间 ?? raw?.时间);
    const 第一次描述 = 取首个非空文本(raw?.第一次描述, raw?.描述);
    if (是否失贞 === undefined && !第一次对象 && !第一次时间 && !第一次描述) return undefined;
    return {
        是否失贞: 是否失贞 ?? Boolean(第一次对象 || 第一次时间 || 第一次描述),
        ...(第一次对象 ? { 第一次对象 } : {}),
        ...(第一次时间 ? { 第一次时间 } : {}),
        ...(第一次描述 ? { 第一次描述 } : {})
    };
};

const 合并失贞档案 = (a: any, b: any): any | undefined => {
    const left = 标准化失贞档案(a);
    const right = 标准化失贞档案(b);
    if (!left && !right) return undefined;
    return {
        是否失贞: Boolean(left?.是否失贞 || right?.是否失贞),
        ...(取更优文本(left?.第一次对象, right?.第一次对象) ? { 第一次对象: 取更优文本(left?.第一次对象, right?.第一次对象) } : {}),
        ...(取更优文本(left?.第一次时间, right?.第一次时间) ? { 第一次时间: 取更优文本(left?.第一次时间, right?.第一次时间) } : {}),
        ...(取更优文本(left?.第一次描述, right?.第一次描述) ? { 第一次描述: 取更优文本(left?.第一次描述, right?.第一次描述) } : {})
    };
};

const 标准化首次亲密记录列表 = (raw: any, npc: any): any[] | undefined => {
    const source = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && !Array.isArray(raw)
            ? Object.entries(raw).map(([类型, value]) => ({ ...(value && typeof value === 'object' ? value as any : {}), 类型 }))
            : []);
    const merged = new Map<亲密行为类型, any>();
    source.forEach((item: any) => {
        const 类型 = 标准化亲密行为类型(item?.类型 ?? item?.行为 ?? item?.名称);
        if (!类型 || !NPC允许亲密行为类型(npc, 类型)) return;
        const 第一次对象 = 取首个非空文本(item?.第一次对象, item?.对象, item?.交给谁, item?.对方);
        const 第一次时间 = 解析任意时间字段(item?.第一次时间 ?? item?.时间);
        const 第一次描述 = 取首个非空文本(item?.第一次描述, item?.描述);
        const 是否已发生 = typeof item?.是否已发生 === 'boolean'
            ? item.是否已发生
            : typeof item?.已发生 === 'boolean'
                ? item.已发生
                : Boolean(第一次对象 || 第一次时间 || 第一次描述);
        const existing = merged.get(类型);
        merged.set(类型, {
            类型,
            是否已发生: Boolean(existing?.是否已发生 || 是否已发生),
            ...(取更优文本(existing?.第一次对象, 第一次对象) ? { 第一次对象: 取更优文本(existing?.第一次对象, 第一次对象) } : {}),
            ...(取更优文本(existing?.第一次时间, 第一次时间) ? { 第一次时间: 取更优文本(existing?.第一次时间, 第一次时间) } : {}),
            ...(取更优文本(existing?.第一次描述, 第一次描述) ? { 第一次描述: 取更优文本(existing?.第一次描述, 第一次描述) } : {})
        });
    });
    const out = Array.from(merged.values());
    return out.length > 0 ? out : undefined;
};

const 合并首次亲密记录列表 = (a: any, b: any, npc: any): any[] | undefined => {
    return 标准化首次亲密记录列表([
        ...(标准化首次亲密记录列表(a, npc) || []),
        ...(标准化首次亲密记录列表(b, npc) || [])
    ], npc);
};

const 生成主要角色默认性癖 = (npc: any): string => {
    const personality = 规范化文本(npc?.核心性格特征 || npc?.性格 || npc?.关系状态, '谨慎');
    return `更重视信任、情绪安全与关系递进，受${personality}影响，需要稳定互动后才会放松。`;
};

const 生成主要角色默认敏感点 = (npc: any): string => {
    const gender = 推断NPC性别(npc);
    return gender === '女'
        ? '耳侧、颈侧、腰背与掌心接触更容易触动情绪反应。'
        : '肩颈、耳侧、腰背与掌心接触更容易触动情绪反应。';
};

const 名器档案部位列表 = ['胸部', '小穴', '屁穴'] as const;
const 名器品质列表 = ['无', '普通', '稀有', '极品', '传说'];

const 标准化名器档案条目 = (raw: any): any | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const 部位 = 规范化文本(raw?.部位);
    if (!名器档案部位列表.includes(部位 as any)) return null;
    const 名称 = 规范化文本(raw?.名称 || raw?.标签 || raw?.名器名);
    const 品质 = 名器品质列表.includes(规范化文本(raw?.品质)) ? 规范化文本(raw?.品质) : (名称 && !/^无/.test(名称) ? '普通' : '无');
    const 标签 = Array.isArray(raw?.效果?.标签)
        ? raw.效果.标签.map((item: unknown) => 规范化文本(item)).filter(Boolean).slice(0, 6)
        : [];
    return {
        部位,
        名称: 名称 || (品质 === '无' ? '无名器' : '未命名名器'),
        品质,
        ...(规范化文本(raw?.来源世界书) ? { 来源世界书: 规范化文本(raw?.来源世界书) } : {}),
        稳定描述: 规范化文本(raw?.稳定描述 || raw?.描述, 品质 === '无' ? '暂无特殊名器标签。' : '已形成稳定名器标签，后续判定按档案读取。'),
        效果: {
            ...(Number.isFinite(Number(raw?.效果?.判定修正)) ? { 判定修正: Number(raw.效果.判定修正) } : {}),
            ...(Number.isFinite(Number(raw?.效果?.魅力修正)) ? { 魅力修正: Number(raw.效果.魅力修正) } : {}),
            ...(Number.isFinite(Number(raw?.效果?.亲密推进修正)) ? { 亲密推进修正: Number(raw.效果.亲密推进修正) } : {}),
            ...(Number.isFinite(Number(raw?.效果?.双修收益修正)) ? { 双修收益修正: Number(raw.效果.双修收益修正) } : {}),
            ...(Number.isFinite(Number(raw?.效果?.风险修正)) ? { 风险修正: Number(raw.效果.风险修正) } : {}),
            标签,
            说明: 规范化文本(raw?.效果?.说明, 品质 === '无' ? '无额外机制修正，仅作为完整档案占位。' : '提供小幅关系、魅力或双修叙事判定参考，不产生强制成功。')
        }
    };
};

const 生成默认名器档案条目 = (npc: any, 部位: typeof 名器档案部位列表[number], featured: boolean): any => {
    if (!featured) {
        return {
            部位,
            名称: '无名器',
            品质: '无',
            稳定描述: `${部位}暂无特殊名器标签。`,
            效果: {
                标签: ['无名器', '普通档案'],
                说明: '无额外机制修正，仅用于避免主要角色私密档案缺项。'
            }
        };
    }
    const seed = [npc?.id, npc?.姓名, npc?.身份, 部位].map((value) => 规范化文本(value)).join('|');
    const names = 部位 === '胸部'
        ? ['玉骨凝香', '玲珑柔韵', '雪肌蕴灵']
        : 部位 === '小穴'
            ? ['蕴灵幽泉', '凝香秘印', '柔玉天成']
            : ['玉润含香', '幽韵天成', '玲珑秘纹'];
    const name = names[稳定区间整数(`${seed}:name`, 0, names.length - 1)] || names[0];
    return {
        部位,
        名称: name,
        品质: '普通',
        稳定描述: `${部位}拥有“${name}”名器标签，作为长期档案与后续判定依据。`,
        效果: {
            判定修正: 1,
            魅力修正: 1,
            亲密推进修正: 1,
            风险修正: 0,
            标签: [name, 部位, '名器'],
            说明: '仅提供小幅叙事与关系判定参考，不产生强制控制或越级碾压效果。'
        }
    };
};

const 标准化名器档案 = (raw: any, npc: any, options?: { forceFemaleMajor?: boolean }): any[] | undefined => {
    const source = Array.isArray(raw) ? raw : [];
    const byPart = new Map<string, any>();
    source.forEach((item) => {
        const normalized = 标准化名器档案条目(item);
        if (normalized) byPart.set(normalized.部位, normalized);
    });
    const shouldComplete = options?.forceFemaleMajor === true;
    if (!shouldComplete && byPart.size === 0) return undefined;
    const hasFeatured = Array.from(byPart.values()).some((item) => item?.品质 && item.品质 !== '无' && !/^无/.test(String(item?.名称 || '')));
    const featuredPart = hasFeatured
        ? ''
        : 名器档案部位列表[稳定区间整数(`${npc?.id || npc?.姓名 || 'npc'}:featured-secret-tag`, 0, 名器档案部位列表.length - 1)];
    名器档案部位列表.forEach((part) => {
        if (!byPart.has(part)) {
            byPart.set(part, 生成默认名器档案条目(npc, part, shouldComplete && part === featuredPart));
        }
    });
    return 名器档案部位列表.map((part) => byPart.get(part));
};

const 文本质量分 = (raw?: string): number => {
    if (!raw || raw.trim().length === 0) return 0;
    const text = raw.trim();
    if (/^(未知|暂无|无|未记录|未命名|\?+|n\/a)$/i.test(text)) return 1;
    return 2 + Math.min(text.length, 200) / 1000;
};

const 取更优文本 = (left?: string, right?: string): string | undefined => {
    const l = left?.trim();
    const r = right?.trim();
    const lScore = 文本质量分(l);
    const rScore = 文本质量分(r);
    if (rScore > lScore) return r;
    if (lScore > rScore) return l;
    if ((r?.length || 0) > (l?.length || 0)) return r;
    return l || r;
};

const 合并补充文本 = (left?: string, right?: string): string | undefined => {
    const l = left?.trim();
    const r = right?.trim();
    if (!l) return r;
    if (!r) return l;
    const lKey = 归一化键(l);
    const rKey = 归一化键(r);
    if (!lKey) return r;
    if (!rKey) return l;
    if (lKey.includes(rKey)) return l;
    if (rKey.includes(lKey)) return r;
    return `${l} ${r}`;
};

const 归一化键 = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/\s+/g, '').toLowerCase();
};

const NPC占位身份词列表 = [
    '掌事太监', '教引姑姑', '贴身侍卫', '带队侍卫', '随行护卫', '值守护卫', '掌事宫女',
    '女人', '女子', '姑娘', '少女', '男子', '男人', '少年', '老者', '老人', '孩童',
    '蒙面人', '黑衣人', '神秘人', '陌生人', '来人', '那人', '此人', '某人',
    '太监', '内侍', '宫女', '侍卫', '守卫', '护卫', '姑姑', '嬷嬷', '管事',
    '掌柜', '老板', '摊主', '店小二', '伙计', '车夫', '丫鬟', '仆妇', '小厮',
    '僧人', '和尚', '道士', '道姑', '杀手', '刺客', '捕快', '官差',
    '弟子', '门人', '同门', '师兄', '师姐', '师弟', '师妹', '随行者', '队友', '路人'
];
const NPC占位外观词列表 = [
    '黑衣', '白衣', '青衣', '红衣', '灰衣', '紫衣', '锦衣', '素衣', '蓝衣',
    '蒙面', '遮面', '覆面', '戴斗笠', '斗笠', '面纱', '年轻', '年老', '中年',
    '高瘦', '矮胖', '清瘦', '魁梧', '冷面', '带刀', '执剑', '持伞', '红裙',
    '青衫', '白发', '陌生', '神秘', '无名'
];
const NPC占位身份词集合 = new Set(NPC占位身份词列表);
const NPC泛性别身份词集合 = new Set(['女人', '女子', '姑娘', '少女', '男子', '男人', '少年', '老者', '老人', '孩童']);
const NPC弱占位身份词集合 = new Set(['弟子', '门人', '同门', '师兄', '师姐', '师弟', '师妹', '随行者', '队友', '路人']);

const 提取NPC角色身份词 = (...values: unknown[]): string[] => {
    const text = values
        .map((value) => 规范化文本(value))
        .join(' ')
        .replace(/\s+/g, '');
    if (!text) return [];
    const tokens = NPC占位身份词列表.filter((token) => text.includes(token));
    return tokens.filter((token) => !tokens.some((other) => other !== token && other.includes(token)));
};

const 提取NPC外观线索词 = (...values: unknown[]): string[] => {
    const text = values
        .map((value) => 规范化文本(value))
        .join(' ')
        .replace(/\s+/g, '');
    if (!text) return [];
    return NPC占位外观词列表.filter((token) => text.includes(token));
};

const 判断NPC性别线索 = (npc: any): '男' | '女' | '' => {
    const gender = 规范化文本(npc?.性别);
    if (gender === '男' || gender === '女') return gender;
    const text = [npc?.姓名, npc?.身份, npc?.简介].map((value) => 规范化文本(value)).join(' ');
    if (/女人|女子|姑娘|少女|宫女|丫鬟|仆妇|姑姑|嬷嬷|道姑|师姐|师妹/.test(text)) return '女';
    if (/男子|男人|少年|老者|老人|太监|内侍|侍卫|守卫|护卫|小厮|车夫|僧人|和尚|道士|师兄|师弟/.test(text)) return '男';
    return '';
};

const 判断NPC姓名疑似占位 = (raw: unknown): boolean => {
    const name = 规范化文本(raw).replace(/\s+/g, '');
    if (!name) return false;
    if (/^(?:npc|NPC|角色|人物|路人|队友|随行者|护卫|弟子|同门)\d*$/u.test(name)) return true;
    if (/^[甲乙丙丁戊己庚辛壬癸]号?(?:护卫|侍卫|弟子|随行者|队友)$/u.test(name)) return true;
    if (NPC占位外观词列表.some((token) => name.startsWith(token)) && 提取NPC角色身份词(name).length > 0) return true;
    if (提取NPC角色身份词(name).some((token) => NPC占位身份词集合.has(token))) {
        if (name.length <= 12) return true;
        if (/(?:掌事|教引|管事|值守|带队|随行|贴身|门房|巡夜|永安宫|宫中|府中|门内|堂中).{0,8}(?:太监|内侍|宫女|侍卫|护卫|弟子|姑姑|嬷嬷|管事)$/u.test(name)) return true;
    }
    if (/(?:姑姑|嬷嬷|管事|掌柜|捕快|侍卫|护卫|宫女|丫鬟|小厮)[\u4e00-\u9fa5]?氏$/u.test(name)) return true;
    return false;
};

const 提取NPC地点线索词 = (npc: any, nameRoles: string[] = []): string[] => {
    const rawValues: unknown[] = [
        npc?.当前位置,
        npc?.当前地点,
        npc?.所在地点,
        npc?.所在位置,
        npc?.具体地点,
        npc?.地点,
        npc?.位置,
        npc?.位置路径,
        npc?.所属势力,
        npc?.归属?.具体地点,
        npc?.归属?.小地点,
        npc?.归属?.中地点,
        npc?.归属?.大地点
    ];
    const profileValues: unknown[] = [
        npc?.姓名,
        npc?.身份,
        npc?.简介,
        npc?.所属势力,
        npc?.当前位置,
        npc?.当前地点,
        npc?.具体地点,
        npc?.位置路径
    ];
    const fromPath = rawValues
        .flatMap((value) => 规范化文本(value).split(/[>＞/｜|、，,。\s]+/u))
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && part.length <= 12 && !/^(未知|不详|暂无|无|当前位置|当前地点)$/u.test(part));
    const fromProfile = profileValues
        .flatMap((value) => {
            const text = 规范化文本(value).replace(/\s+/g, '');
            if (!text) return [];
            const placeMatches = Array.from(text.matchAll(/[\u4e00-\u9fa5]{1,8}(?:宫|殿|府|楼|阁|堂|院|寺|观|门|城|村|镇|寨|庄|司|营|坊|巷|街)/gu))
                .map((match) => match[0]);
            const rolePrefixes = nameRoles.map((role) => {
                const index = text.indexOf(role);
                if (index <= 0) return '';
                return text.slice(Math.max(0, index - 8), index).replace(/^(?:一名|一个|一位|那名|那位|这名|这位)/u, '');
            });
            return [...placeMatches, ...rolePrefixes];
        })
        .filter((part) => part.length >= 2 && part.length <= 8 && /(?:宫|殿|府|楼|阁|堂|院|寺|观|门|城|村|镇|寨|庄|司|营|坊|巷|街)$/u.test(part));
    return Array.from(new Set([...fromPath, ...fromProfile]));
};

const 构建NPC占位身份线索 = (npc: any) => {
    const name = 规范化文本(npc?.姓名);
    const nameKey = 归一化键(name);
    const roleTokens = 提取NPC角色身份词(npc?.姓名, npc?.身份, npc?.简介);
    const descriptorTokens = 提取NPC外观线索词(npc?.姓名, npc?.外貌描写, npc?.衣着风格, npc?.简介, npc?.身份);
    const locationTokens = 提取NPC地点线索词(npc, roleTokens);
    const memoryText = [
        ...(Array.isArray(npc?.记忆) ? npc.记忆.map((item: any) => item?.内容 || item?.摘要 || item?.描述) : []),
        ...(Array.isArray(npc?.总结记忆) ? npc.总结记忆.map((item: any) => item?.内容 || item?.摘要 || item?.描述) : [])
    ];
    const profileKey = [
        npc?.姓名,
        npc?.身份,
        npc?.简介,
        npc?.关系状态,
        npc?.当前位置,
        npc?.当前地点,
        npc?.所在地点,
        npc?.所在位置,
        npc?.具体地点,
        npc?.位置,
        npc?.位置路径,
        npc?.所属势力,
        npc?.外貌描写,
        npc?.衣着风格,
        ...memoryText
    ].map(归一化键).join('|');
    return {
        name,
        nameKey,
        placeholder: 判断NPC姓名疑似占位(name),
        roleTokens,
        descriptorTokens,
        locationTokens,
        gender: 判断NPC性别线索(npc),
        profileKey
    };
};

const 集合存在交集 = (left: string[], right: string[]): boolean => {
    const rightSet = new Set(right.filter(Boolean));
    return left.some((item) => rightSet.has(item));
};

const NPC占位身份角色匹配 = (
    placeholder: ReturnType<typeof 构建NPC占位身份线索>,
    other: ReturnType<typeof 构建NPC占位身份线索>
): boolean => {
    if (集合存在交集(placeholder.roleTokens, other.roleTokens)) return true;
    const placeholderHasFemaleRole = placeholder.roleTokens.some((token) => ['女人', '女子', '姑娘', '少女'].includes(token));
    const placeholderHasMaleRole = placeholder.roleTokens.some((token) => ['男子', '男人', '少年', '老者', '老人', '太监', '内侍'].includes(token));
    return (placeholderHasFemaleRole && other.gender === '女') || (placeholderHasMaleRole && other.gender === '男');
};

const NPC占位身份疑似同一人 = (leftRaw: any, rightRaw: any): boolean => {
    const left = 构建NPC占位身份线索(leftRaw);
    const right = 构建NPC占位身份线索(rightRaw);
    if (!left.placeholder && !right.placeholder) return false;
    if (left.nameKey && right.nameKey && left.nameKey === right.nameKey) return true;

    const placeholder = left.placeholder ? left : right;
    const other = left.placeholder ? right : left;
    if (!placeholder.nameKey || !other.nameKey) return false;

    if (other.profileKey.includes(placeholder.nameKey)) return true;
    if (!other.placeholder && placeholder.profileKey.includes(other.nameKey)) return true;

    const roleMatched = NPC占位身份角色匹配(placeholder, other);
    if (!roleMatched) return false;
    const descriptorMatched = 集合存在交集(placeholder.descriptorTokens, other.descriptorTokens);
    if (descriptorMatched) return true;

    const locationMatched = 集合存在交集(placeholder.locationTokens, other.locationTokens);
    const hasSpecificRole = placeholder.roleTokens.some((token) => !NPC泛性别身份词集合.has(token) && !NPC弱占位身份词集合.has(token));
    return locationMatched && hasSpecificRole;
};

const 社交规范化调试已启用 = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.localStorage?.getItem('DEBUG_NPC_AUTO_IMAGE') === '1';
    } catch {
        return false;
    }
};

const 输出社交规范化调试 = (message: string, payload?: any) => {
    if (!社交规范化调试已启用()) return;
    console.info(`[SOCIAL_NORMALIZE] ${message}`, payload ?? '');
};

const 选择合并后NPC姓名 = (leftRaw: any, rightRaw: any): string => {
    const leftName = 规范化文本(leftRaw?.姓名);
    const rightName = 规范化文本(rightRaw?.姓名);
    const leftPlaceholder = 判断NPC姓名疑似占位(leftName);
    const rightPlaceholder = 判断NPC姓名疑似占位(rightName);
    if (leftPlaceholder && !rightPlaceholder && rightName) return rightName;
    if (rightPlaceholder && !leftPlaceholder && leftName) return leftName;
    if (leftPlaceholder && rightPlaceholder) return 取更优文本(leftName, rightName) || leftName || rightName;
    return 取首个非空文本(rightName, leftName) || leftName || rightName;
};

const 解析记忆时间排序值 = (raw?: string): number => {
    if (!raw) return Number.MAX_SAFE_INTEGER;
    const canonical = normalizeCanonicalGameTime(raw);
    if (!canonical) return Number.MAX_SAFE_INTEGER;
    const m = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
};

const 标准化NPC记忆 = (memoryRaw: any): Array<{ 内容: string; 时间: string }> => {
    if (!Array.isArray(memoryRaw)) return [];

    const normalized = memoryRaw
        .map((m: any) => {
            const 内容 = typeof m?.内容 === 'string' ? m.内容.trim() : '';
            const 原始时间 = typeof m?.时间 === 'string'
                ? m.时间.trim()
                : (结构化时间转标准串(m?.时间) || '');
            const 时间 = 原始时间 ? (normalizeCanonicalGameTime(原始时间) || 原始时间) : '';
            return { 内容, 时间 };
        })
        .filter((m) => m.内容.length > 0 || m.时间.length > 0);

    const timeByContent = new Map<string, string>();
    const contentByTime = new Map<string, string>();
    normalized.forEach((m) => {
        if (m.内容 && m.时间 && !timeByContent.has(m.内容)) {
            timeByContent.set(m.内容, m.时间);
        }
        if (m.时间 && m.内容 && !contentByTime.has(m.时间)) {
            contentByTime.set(m.时间, m.内容);
        }
    });

    normalized.forEach((m) => {
        if (!m.时间 && m.内容 && timeByContent.has(m.内容)) {
            m.时间 = timeByContent.get(m.内容)!;
        }
        if (!m.内容 && m.时间 && contentByTime.has(m.时间)) {
            m.内容 = contentByTime.get(m.时间)!;
        }
    });

    const unique = new Map<string, { 内容: string; 时间: string }>();
    normalized
        .filter((m) => m.内容.length > 0)
        .forEach((m) => {
            const key = `${m.时间}__${m.内容}`;
            if (!unique.has(key)) {
                unique.set(key, { 内容: m.内容, 时间: m.时间 || '未知时间' });
            }
        });

    return Array.from(unique.values())
        .sort((a, b) => 解析记忆时间排序值(a.时间) - 解析记忆时间排序值(b.时间));
};

const 标准化NPC总结记忆 = (summaryRaw: any): Array<{
    内容: string;
    时间: string;
    开始时间: string;
    结束时间: string;
    开始索引: number;
    结束索引: number;
    条数: number;
}> => {
    if (!Array.isArray(summaryRaw)) return [];
    const normalized = summaryRaw
        .map((item: any) => {
            const 内容 = typeof item?.内容 === 'string' ? item.内容.trim() : '';
            const 开始时间原始 = typeof item?.开始时间 === 'string'
                ? item.开始时间.trim()
                : (结构化时间转标准串(item?.开始时间) || '');
            const 结束时间原始 = typeof item?.结束时间 === 'string'
                ? item.结束时间.trim()
                : (结构化时间转标准串(item?.结束时间) || '');
            const 开始时间 = 开始时间原始 ? (normalizeCanonicalGameTime(开始时间原始) || 开始时间原始) : '';
            const 结束时间 = 结束时间原始 ? (normalizeCanonicalGameTime(结束时间原始) || 结束时间原始) : '';
            const 开始索引 = Math.max(0, Math.trunc(Number(item?.开始索引) || 0));
            const 结束索引 = Math.max(开始索引, Math.trunc(Number(item?.结束索引) || 开始索引));
            const 条数 = Math.max(1, Math.trunc(Number(item?.条数) || (结束索引 - 开始索引 + 1)));
            const 时间 = typeof item?.时间 === 'string' && item.时间.trim().length > 0
                ? item.时间.trim()
                : (开始时间 && 结束时间
                    ? (开始时间 === 结束时间 ? `[${开始时间}]` : `[${开始时间}-${结束时间}]`)
                    : '');
            if (!内容) return null;
            return {
                内容,
                时间,
                开始时间: 开始时间 || '未知时间',
                结束时间: 结束时间 || 开始时间 || '未知时间',
                开始索引,
                结束索引,
                条数
            };
        })
        .filter(Boolean) as Array<{
            内容: string;
            时间: string;
            开始时间: string;
            结束时间: string;
            开始索引: number;
            结束索引: number;
            条数: number;
        }>;
    const unique = new Map<string, typeof normalized[number]>();
    normalized.forEach((item) => {
        const key = `${item.开始索引}_${item.结束索引}_${item.内容}`;
        if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort((a, b) => a.开始索引 - b.开始索引);
};

const 合并字符串数组 = (a: any, b: any): string[] | undefined => {
    const merged: string[] = [];
    const seen = new Set<string>();
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        const text = value.trim();
        if (!text) return;
        if (seen.has(text)) return;
        seen.add(text);
        merged.push(text);
    };
    if (Array.isArray(a)) a.forEach(push);
    if (Array.isArray(b)) b.forEach(push);
    return merged.length > 0 ? merged : undefined;
};

const 默认NPC装备 = {
    主武器: '无',
    副武器: '无',
    服装: '无',
    饰品: '无',
    内衣: '无',
    内裤: '无',
    袜饰: '无',
    鞋履: '无'
};

const NPC装备槽位 = Object.keys(默认NPC装备);
const 空NPC装备正则 = /^(无|暂无|未装备|空|没有|none|n\/a)$/i;

const 默认NPC技艺 = () => 构建默认技艺(_当前题材模式, _当前运行时配置);

const 推断NPC出身背景 = (npc: any): { 名称: string; 描述: string; 效果: string } => {
    const text = [
        npc?.姓名,
        npc?.身份,
        npc?.简介,
        npc?.所属势力,
        npc?.境界
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    const group = 获取题材模式配置(_当前题材模式).group;
    if (group === 'apocalypse' || group === 'urban_xianxia' || group === 'modern') {
        if (/医|药|医生|护士|医院|诊所/.test(text)) return { 名称: '医疗背景', 描述: '受过基础医疗训练。', 效果: '急救、药品辨识更容易形成基础。' };
        if (/商|贸易|销售|经理|账目|财务/.test(text)) return { 名称: '商业背景', 描述: '有账目、谈判与资源调配经验。', 效果: '交易、估价与人脉运作更容易形成基础。' };
        if (/工|工程|技|修|机械|IT|技术/.test(text)) return { 名称: '技术背景', 描述: '掌握实用技术或工程经验。', 效果: '器械修理、技术类工作更容易形成基础。' };
        if (/军|警|兵|将|保安|防暴|战术/.test(text)) return { 名称: '军事背景', 描述: '受过正规武力训练或战术教育。', 效果: '战斗、警戒与战术判断更容易形成基础。' };
        if (/猎|山|林|农|渔|采|野外/.test(text)) return { 名称: '野外生存背景', 描述: '熟悉野外环境与求生技能。', 效果: '采集、追踪与野外生存更容易形成基础。' };
        if (/学|校|研究|学者|教授|学生/.test(text)) return { 名称: '学术背景', 描述: '受过系统学术训练。', 效果: '分析、研究类技能更容易形成基础。' };
        return { 名称: group === 'apocalypse' ? '幸存者背景' : '普通背景', 描述: '在平凡生活中积累了基本的社会经验。', 效果: '基础社会技能有少量自然积累。' };
    }
    if (group === 'western_fantasy') {
        if (/医|药|祭司|牧师|神殿|庙/.test(text)) return { 名称: '神职医疗背景', 描述: '接触过神术、草药与伤患处置。', 效果: '医疗、炼金与鉴别药性更容易形成基础。' };
        if (/商|贸易|商队|拍卖|行商|账房/.test(text)) return { 名称: '商旅背景', 描述: '在商路、账目与人情往来中长大。', 效果: '估价、交涉与物价知识更容易形成基础。' };
        if (/铁|锻|匠|铸|工|机关|巧|手艺/.test(text)) return { 名称: '工匠背景', 描述: '长期接触器物、工坊与手艺活。', 效果: '锻造、机关与器物辨识更容易形成基础。' };
        if (/猎|山|林|采|农|樵|渔/.test(text)) return { 名称: '荒野出身', 描述: '熟悉野外行走与资源采集。', 效果: '采集、追踪与求生经验更容易形成基础。' };
        if (/魔|法|咒|术|元素|奥术|秘/.test(text)) return { 名称: '魔法学徒出身', 描述: '耳濡目染魔法与神秘学。', 效果: '魔法理解、符文与附魔更容易形成基础。' };
        if (/官|府|贵族|骑士|领主|军/.test(text)) return { 名称: '贵族/军旅出身', 描述: '熟悉规则、礼仪与战斗训练。', 效果: '交涉、领导力与军事知识更容易形成基础。' };
        if (/公会|协会|冒险|佣兵|组织|工会/.test(text)) return { 名称: '组织出身', 描述: '受公会规章与同业氛围熏陶。', 效果: '行业知识与人脉更容易形成基础。' };
        return { 名称: '市井出身', 描述: '在寻常城镇生活中积累社会经验。', 效果: '基础交涉与生存技能有少量自然积累。' };
    }
    if (group === 'xianxia') {
        if (/医|药|郎中|大夫|医馆|药铺|药堂/.test(text)) return { 名称: '医药出身', 描述: '自幼接触药材、病症与伤患处置。', 效果: '医术、炼丹与鉴别药性更容易形成基础。' };
        if (/商|掌柜|账房|当铺|古玩|拍卖|行商/.test(text)) return { 名称: '商旅出身', 描述: '在账目、货物流转与人情往来中长大。', 效果: '鉴定、采买与察看物价更容易形成基础。' };
        if (/铁|锻|匠|铸|工|机关|墨|巧/.test(text)) return { 名称: '匠作出身', 描述: '长期接触器物、工坊与手艺活。', 效果: '炼器、机关与器物辨识更容易形成基础。' };
        if (/猎|山|林|采|农|樵|渔|草药/.test(text)) return { 名称: '山野出身', 描述: '熟悉山林物候、野外行走与采猎门道。', 效果: '采集、辨物与求生经验更容易形成基础。' };
        if (/阵|符|道|观|术|玄/.test(text)) return { 名称: '术法旁支出身', 描述: '耳濡目染符阵术数与玄门杂学。', 效果: '阵法、符箓与机关理解更容易形成基础。' };
        if (/官|府|衙|捕|军|将|吏/.test(text)) return { 名称: '公门出身', 描述: '熟悉规矩、案牍、兵械与城镇秩序。', 效果: '鉴定、医术与基础器械经验更容易形成基础。' };
        if (/门|派|宗|山庄|弟子|长老|供奉|掌门|师/.test(text)) return { 名称: '宗门出身', 描述: '受过门规、杂役、演武与师门日课熏陶。', 效果: '采集、鉴定与门中杂学更容易形成基础。' };
        return { 名称: '散修出身', 描述: '在寻常人情与修真见闻中积累生活经验。', 效果: '采集、鉴定等基础技艺有少量自然积累。' };
    }
    if (/医|药|郎中|大夫|医馆|药铺|药堂/.test(text)) {
        return { 名称: '医药出身', 描述: '自幼接触药材、病症与伤患处置。', 效果: '医术、炼丹与鉴别药性更容易形成基础。' };
    }
    if (/商|掌柜|账房|当铺|古玩|拍卖|行商/.test(text)) {
        return { 名称: '商旅出身', 描述: '在账目、货物流转与人情往来中长大。', 效果: '鉴定、采买与察看物价更容易形成基础。' };
    }
    if (/铁|锻|匠|铸|工|机关|墨|巧/.test(text)) {
        return { 名称: '匠作出身', 描述: '长期接触器物、工坊与手艺活。', 效果: '炼器、机关与器物辨识更容易形成基础。' };
    }
    if (/猎|山|林|采|农|樵|渔|草药/.test(text)) {
        return { 名称: '山野出身', 描述: '熟悉山林物候、野外行走与采猎门道。', 效果: '采集、辨物与求生经验更容易形成基础。' };
    }
    if (/阵|符|道|观|术|玄/.test(text)) {
        return { 名称: '术法旁支出身', 描述: '耳濡目染符阵术数与玄门杂学。', 效果: '阵法、符箓与机关理解更容易形成基础。' };
    }
    if (/官|府|衙|捕|军|将|吏/.test(text)) {
        return { 名称: '公门出身', 描述: '熟悉规矩、案牍、兵械与城镇秩序。', 效果: '鉴定、医术与基础器械经验更容易形成基础。' };
    }
    if (/门|派|宗|山庄|弟子|长老|供奉|掌门|师/.test(text)) {
        return { 名称: '江湖门派出身', 描述: '受过门规、杂役、演武与师门日课熏陶。', 效果: '采集、鉴定与门中杂学更容易形成基础。' };
    }
    return { 名称: '市井江湖出身', 描述: '在寻常人情与江湖见闻中积累生活经验。', 效果: '采集、鉴定等基础技艺有少量自然积累。' };
};

const 推断NPC天赋列表 = (npc: any, background: { 名称: string; 描述: string; 效果: string }): Array<{ 名称: string; 描述: string; 效果: string }> => {
    const text = [
        npc?.姓名,
        npc?.身份,
        npc?.简介,
        npc?.境界,
        background.名称,
        background.描述,
        background.效果
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    const seed = [npc?.id, npc?.姓名, npc?.身份, background.名称].map((value) => 规范化文本(value)).join('|');
    const candidates: Array<{ 名称: string; 描述: string; 效果: string; hit: boolean }> = [
        { 名称: '手稳心细', 描述: '做细活时不易慌乱，能耐住重复打磨。', 效果: '机关、炼器、医术相关技艺初始值略高。', hit: /匠|工|医|药|机关|细/.test(text) },
        { 名称: '草木亲和', 描述: '对山林草木、药性与物候有天然敏感。', 效果: '采集、医术、炼丹相关技艺初始值略高。', hit: /山|林|药|采|猎|农|樵/.test(text) },
        { 名称: '识货眼力', 描述: '看人看物都能较快抓住关键差别。', 效果: '鉴定、商贸与器物辨识相关技艺初始值略高。', hit: /商|鉴|掌柜|账|当铺|宝|古玩/.test(text) },
        { 名称: '符阵悟性', 描述: '对纹路、方位和术数变化更容易入门。', 效果: '阵法、符箓、机关相关技艺初始值略高。', hit: /阵|符|道|玄|术|观/.test(text) },
        { 名称: '江湖耐性', 描述: '行走江湖时更能吃苦，也更善于从杂事里学门道。', 效果: '采集、鉴定等基础技艺初始值略高。', hit: true }
    ];
    const hit = candidates.filter(item => item.hit);
    const first = hit[稳定区间整数(`${seed}:talent-a`, 0, Math.max(0, hit.length - 1))] || candidates[candidates.length - 1];
    const secondPool = candidates.filter(item => item.名称 !== first.名称 && (item.hit || 稳定哈希(`${seed}:${item.名称}`) % 3 === 0));
    const second = secondPool.length > 0 ? secondPool[稳定区间整数(`${seed}:talent-b`, 0, secondPool.length - 1)] : undefined;
    return [first, second]
        .filter(Boolean)
        .map(({ hit: _hit, ...item }: any) => item);
};

const NPC技艺需要本地推断 = (skills: Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }>): boolean => {
    const positives = skills.filter(item => Number(item?.熟练度 || 0) > 0);
    if (positives.length === 0) return true;
    if (positives.length === 1) {
        const only = positives[0];
        return only.名称 === '采集'
            && only.熟练度 <= 10
            && /江湖历练|日常生活|基础能力|身份经历而具备/.test(only.描述 || '');
    }
    return false;
};

const 是空NPC装备 = (value: unknown): boolean => {
    const text = 规范化文本(value);
    return !text || 空NPC装备正则.test(text);
};

const 疑似NPC装备说明文本 = (value: unknown): boolean => {
    const text = 规范化文本(value);
    if (!text) return false;
    if (text.length > 24) return true;
    if (/[\n\r{}[\]<>]/.test(text)) return true;
    if (/^[\-*•\d.、\s]*(?:主武器|副武器|服装|饰品|内衣|内裤|袜饰|鞋履)\s*[：:]/.test(text)) return true;
    if (/[。！？；;]/.test(text)) return true;
    if (/(?:根据|由于|作为|建议|应该|可以|生成|创建|补齐|默认|装备为|穿着|身穿|手持|佩戴|携带|这名|该角色|此人|她|他).{4,}/.test(text)) return true;
    return false;
};

const 清理NPC装备名称 = (value: unknown): string => {
    const text = 规范化文本(value, '无') || '无';
    if (是空NPC装备(text)) return '无';
    if (疑似NPC装备说明文本(text)) return '无';
    return text;
};

const 标准化NPC装备 = (raw: any): Record<string, string> => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out: Record<string, string> = { ...默认NPC装备 };
    NPC装备槽位.forEach((key) => {
        out[key] = 清理NPC装备名称(source?.[key]);
    });
    return out;
};

const 读取NPC境界阶位 = (npc: any): number => {
    const text = [
        npc?.境界,
        npc?.修为,
        npc?.身份,
        npc?.简介
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    return 获取境界层级(text, _当前境界配置);
};

const 标准化NPC基础属性 = (npc: any): {
    力量: number;
    敏捷: number;
    体质: number;
    根骨: number;
    悟性: number;
    福源: number;
    境界层级: number;
} => {
    const rank = 读取NPC境界阶位(npc);
    if (npc?.保留开局伙伴设定属性 === true || npc?.来源 === '开局伙伴' || /^npc_opening_partner_/u.test(规范化文本(npc?.id))) {
        return {
            力量: Math.max(1, Math.ceil(规范化数值(npc?.力量, 5))),
            敏捷: Math.max(1, Math.ceil(规范化数值(npc?.敏捷, 5))),
            体质: Math.max(1, Math.ceil(规范化数值(npc?.体质, 5))),
            根骨: Math.max(1, Math.ceil(规范化数值(npc?.根骨, 5))),
            悟性: Math.max(1, Math.ceil(规范化数值(npc?.悟性, 5))),
            福源: Math.max(1, Math.ceil(规范化数值(npc?.福源, 5))),
            境界层级: Math.max(1, Math.ceil(规范化数值(npc?.境界层级, rank || 1)))
        };
    }
    const text = [npc?.姓名, npc?.性别, npc?.身份, npc?.境界, npc?.简介].map((value) => 规范化文本(value)).join(' ');
    const biasPatterns = 当前题材默认值().attributeBias;
    const style = {
        力量: biasPatterns.力量.test(text) ? 3 : 0,
        敏捷: biasPatterns.敏捷.test(text) ? 3 : 0,
        体质: biasPatterns.体质.test(text) ? 3 : 0,
        根骨: biasPatterns.根骨.test(text) ? 3 : 0,
        悟性: biasPatterns.悟性.test(text) ? 3 : 0,
        福源: biasPatterns.福源.test(text) ? 2 : 0
    };
    const realmLevel = Math.max(1, Math.ceil(规范化数值(npc?.境界层级, rank)), rank);
    const attrs = 归一化六维到境界预算(npc, {
        境界层级: realmLevel,
        偏向权重: style
    });
    return {
        ...attrs,
        境界层级: realmLevel
    };
};

const 补齐NPC装备 = (raw: any, _npc?: any): Record<string, string> => 标准化NPC装备(raw);

const 标准化NPC背包 = (raw: any): Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }> => (
    Array.isArray(raw)
        ? raw
            .map((item: any) => {
                if (typeof item === 'string') {
                    const 名称 = 规范化文本(item);
                    return 名称 ? { 名称, 类型: '杂物', 数量: 1 } : null;
                }
                if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
                const 名称 = 规范化文本(item?.名称);
                if (!名称) return null;
                return {
                    名称,
                    类型: 规范化文本(item?.类型, '杂物'),
                    数量: Math.max(1, 规范化整数(item?.数量 ?? item?.堆叠数量, 1)),
                    描述: 规范化文本(item?.描述)
                };
            })
            .filter(Boolean) as Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }>
        : []
);

const 补齐NPC背包 = (raw: any, _npc?: any): Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }> => 标准化NPC背包(raw);

const 标准化NPC资源值 = (curRaw: unknown, maxRaw: unknown, fallbackMax: number): { 当前: number; 最大: number } => {
    const rawCur = Number(curRaw);
    const rawMax = Number(maxRaw);
    const hasCur = Number.isFinite(rawCur);
    const hasMax = Number.isFinite(rawMax);
    const badMax = !hasMax || rawMax <= 1 || (hasCur && rawCur > rawMax);
    const saneMax = Math.max(
        1,
        Math.ceil(fallbackMax),
        hasMax && rawMax > 1 ? Math.ceil(rawMax) : 0,
        hasCur && rawCur > 1 ? Math.ceil(rawCur) : 0
    );
    const 最大 = badMax ? saneMax : Math.max(1, Math.ceil(rawMax));
    const 当前 = (() => {
        if (!hasCur) return 最大;
        if (badMax && rawCur <= 1) return 最大;
        return Math.max(0, Math.min(最大, Math.ceil(rawCur)));
    })();
    return { 当前, 最大 };
};

const 标准化NPC战斗数值 = (npc: any): {
    攻击力: number;
    防御力: number;
    当前血量: number;
    最大血量: number;
    当前精力: number;
    最大精力: number;
    当前内力: number;
    最大内力: number;
} => {
    const rank = 读取NPC境界阶位(npc);
    const attrs = 标准化NPC基础属性(npc);
    const eliteBonus = 0;
    const hp = 标准化NPC资源值(npc?.当前血量, npc?.最大血量, 72 + attrs.体质 * 4.2 + attrs.根骨 * 2.4 + attrs.力量 * 1.2 + rank * 12 + eliteBonus * 2);
    const sp = 标准化NPC资源值(npc?.当前精力, npc?.最大精力, 36 + attrs.体质 * 3.2 + attrs.根骨 * 2.2 + rank * 9 + eliteBonus);
    const qi = 标准化NPC资源值(npc?.当前内力, npc?.最大内力, 18 + attrs.根骨 * 3.6 + attrs.悟性 * 3.2 + rank * 10 + eliteBonus);
    const rawAtk = Number(npc?.攻击力);
    const rawDef = Number(npc?.防御力);
    return {
        攻击力: Number.isFinite(rawAtk) && rawAtk > 0 ? Math.ceil(rawAtk) : Math.ceil(attrs.力量 * 1.5 + attrs.敏捷 * 0.8 + rank * 4 + eliteBonus),
        防御力: Number.isFinite(rawDef) && rawDef > 0 ? Math.ceil(rawDef) : Math.ceil(attrs.体质 * 1.3 + attrs.根骨 * 0.9 + rank * 3 + Math.floor(eliteBonus / 2)),
        当前血量: hp.当前,
        最大血量: hp.最大,
        当前精力: sp.当前,
        最大精力: sp.最大,
        当前内力: qi.当前,
        最大内力: qi.最大
    };
};

const NPC部位配置 = [
    { key: '头部', weight: 0.15 },
    { key: '胸部', weight: 0.22 },
    { key: '腹部', weight: 0.18 },
    { key: '左手', weight: 0.11 },
    { key: '右手', weight: 0.11 },
    { key: '左腿', weight: 0.115 },
    { key: '右腿', weight: 0.115 }
] as const;

const 标准化NPC部位状态 = (
    npc: any,
    战斗数值: { 当前血量: number; 最大血量: number }
): Record<string, number | string> => {
    const totalMax = Math.max(7, Math.ceil(战斗数值.最大血量 || 0));
    const hpRatio = totalMax > 0
        ? Math.max(0, Math.min(1, Number(战斗数值.当前血量 || 0) / totalMax))
        : 1;
    const out: Record<string, number | string> = {};
    NPC部位配置.forEach((part) => {
        const maxKey = `${part.key}最大血量`;
        const curKey = `${part.key}当前血量`;
        const statusKey = `${part.key}状态`;
        const rawMax = Number(npc?.[maxKey]);
        const fallbackMax = Math.max(1, Math.round(totalMax * part.weight));
        const 最大 = Number.isFinite(rawMax) && rawMax > 0 ? Math.ceil(rawMax) : fallbackMax;
        const rawCur = Number(npc?.[curKey]);
        const 当前 = Number.isFinite(rawCur)
            ? Math.max(0, Math.min(最大, Math.ceil(rawCur)))
            : Math.max(0, Math.min(最大, Math.round(最大 * hpRatio)));
        out[maxKey] = 最大;
        out[curKey] = 当前;
        out[statusKey] = 规范化文本(npc?.[statusKey], 当前 <= 0 ? '失能' : '正常') || (当前 <= 0 ? '失能' : '正常');
    });
    return out;
};

const 标准化NPC状态效果 = (raw: any): Array<{ 名称: string; 描述: string; 效果: string; 结束时间?: string }> => (
    Array.isArray(raw)
        ? raw
            .map((item: any) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
                const 名称 = 规范化文本(item?.名称);
                const 描述 = 规范化文本(item?.描述);
                const 效果 = 规范化文本(item?.效果);
                const 结束时间 = 解析任意时间字段(item?.结束时间);
                if (!名称 && !描述 && !效果) return null;
                return { 名称: 名称 || '未命名状态', 描述, 效果, ...(结束时间 ? { 结束时间 } : {}) };
            })
            .filter(Boolean) as Array<{ 名称: string; 描述: string; 效果: string; 结束时间?: string }>
        : []
);

const 标准化NPC技艺 = (raw: any): Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }> => {
    const source = Array.isArray(raw) ? raw : [];
    const byName = new Map<string, any>();
    source.forEach((item: any) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const 名称 = 规范化文本(item?.名称);
        if (!名称) return;
        byName.set(名称, {
            名称,
            等级: 规范化文本(item?.等级, '未入门'),
            熟练度: Math.max(0, Math.min(100, 规范化数值(item?.熟练度, 0))),
            描述: 规范化文本(item?.描述, '尚未形成稳定技艺。')
        });
    });
    默认NPC技艺().forEach((item) => {
        if (!byName.has(item.名称)) byName.set(item.名称, { ...item });
    });
    return Array.from(byName.values());
};

const 标准化关系网变量 = (raw: any): Array<{ 对象姓名: string; 关系: string; 备注?: string }> | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const merged = new Map<string, { 对象姓名: string; 关系: string; 备注?: string }>();
    raw.forEach((item: any) => {
        if (!item || typeof item !== 'object') return;
        const 对象姓名 = 取首个非空文本(item?.对象姓名, item?.对象, item?.姓名) || '';
        const 关系 = 取首个非空文本(item?.关系, item?.关系类型) || '';
        const 备注 = typeof item?.备注 === 'string' ? item.备注.trim() : '';
        if (!对象姓名 || !关系) return;
        const key = `${对象姓名}__${关系}`;
        merged.set(key, {
            对象姓名,
            关系,
            ...(备注 ? { 备注 } : {})
        });
    });
    const out = Array.from(merged.values());
    return out.length > 0 ? out : undefined;
};

const 合并关系网变量 = (a: any, b: any): Array<{ 对象姓名: string; 关系: string; 备注?: string }> | undefined => {
    const merged = new Map<string, { 对象姓名: string; 关系: string; 备注?: string }>();
    const pushList = (raw: any) => {
        const normalized = 标准化关系网变量(raw);
        if (!normalized) return;
        normalized.forEach((item) => {
            const key = `${item.对象姓名}__${item.关系}`;
            merged.set(key, item);
        });
    };
    pushList(a);
    pushList(b);
    const out = Array.from(merged.values());
    return out.length > 0 ? out : undefined;
};

const 标准化子宫档案 = (raw: any): any | undefined => {
    return 标准化子宫档案值(raw);
};

const 标准化子宫档案对象 = (raw: any): any | undefined => {
    return 标准化子宫档案(raw);
};

const 合并子宫档案 = (a: any, b: any): any | undefined => {
    return 合并子宫档案值(a, b);
};

const 标准化香闺秘档部位结果 = (raw: any, part: '胸部' | '小穴' | '屁穴' | '肉棒'): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const normalizedAsset = 压缩图片资源字段(raw);
    const 图片URL = typeof normalizedAsset?.图片URL === 'string' ? normalizedAsset.图片URL.trim() : undefined;
    const 本地路径 = typeof normalizedAsset?.本地路径 === 'string' ? normalizedAsset.本地路径.trim() : undefined;
    const 生图词组 = typeof raw?.生图词组 === 'string' ? raw.生图词组.trim() : '';
    const 最终正向提示词 = typeof raw?.最终正向提示词 === 'string' ? raw.最终正向提示词.trim() : undefined;
    const 最终负向提示词 = typeof raw?.最终负向提示词 === 'string' ? raw.最终负向提示词.trim() : undefined;
    const 原始描述 = typeof raw?.原始描述 === 'string' ? raw.原始描述.trim() : '';
    const 使用模型 = typeof raw?.使用模型 === 'string' ? raw.使用模型.trim() : '';
    const 画师串 = typeof raw?.画师串 === 'string' ? raw.画师串.trim() : undefined;
    const 描述文本 = typeof raw?.描述文本 === 'string' ? raw.描述文本.trim() : undefined;
    const 错误信息 = typeof raw?.错误信息 === 'string' ? raw.错误信息.trim() : undefined;
    const 生成时间 = Number.isFinite(Number(raw?.生成时间)) ? Number(raw.生成时间) : Date.now();
    const 状态 = raw?.状态 === 'success' || raw?.状态 === 'failed' || raw?.状态 === 'pending'
        ? raw.状态
        : undefined;
    const id = typeof raw?.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : `npc_secret_${part}_${生成时间}`;
    if (!图片URL && !本地路径 && !生图词组 && !原始描述 && !错误信息) return undefined;
    return {
        id,
        部位: part,
        图片URL,
        本地路径,
        生图词组,
        最终正向提示词,
        最终负向提示词,
        原始描述,
        使用模型,
        生成时间,
        构图: '部位特写' as const,
        画风: raw?.画风,
        画师串,
        状态,
        错误信息,
        描述文本
    };
};

const 标准化香闺秘档部位档案 = (raw: any): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const 胸部 = 标准化香闺秘档部位结果(raw?.胸部, '胸部');
    const 小穴 = 标准化香闺秘档部位结果(raw?.小穴, '小穴');
    const 屁穴 = 标准化香闺秘档部位结果(raw?.屁穴, '屁穴');
    const 肉棒 = 标准化香闺秘档部位结果(raw?.肉棒, '肉棒');
    if (!胸部 && !小穴 && !屁穴 && !肉棒) return undefined;
    return {
        ...(胸部 ? { 胸部 } : {}),
        ...(小穴 ? { 小穴 } : {}),
        ...(屁穴 ? { 屁穴 } : {}),
        ...(肉棒 ? { 肉棒 } : {})
    };
};

const 标准化NPC图片记录 = (raw: any): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const normalizedAsset = 压缩图片资源字段(raw);
    const 图片URL = typeof normalizedAsset?.图片URL === 'string' ? normalizedAsset.图片URL.trim() : undefined;
    const 本地路径 = typeof normalizedAsset?.本地路径 === 'string' ? normalizedAsset.本地路径.trim() : undefined;
    const 生图词组 = typeof raw?.生图词组 === 'string' ? raw.生图词组.trim() : '';
    const 最终正向提示词 = typeof raw?.最终正向提示词 === 'string' ? raw.最终正向提示词.trim() : undefined;
    const 最终负向提示词 = typeof raw?.最终负向提示词 === 'string' ? raw.最终负向提示词.trim() : undefined;
    const 原始描述 = typeof raw?.原始描述 === 'string' ? raw.原始描述.trim() : '';
    const 使用模型 = typeof raw?.使用模型 === 'string' ? raw.使用模型.trim() : '';
    const 画师串 = typeof raw?.画师串 === 'string' ? raw.画师串.trim() : undefined;
    const 错误信息 = typeof raw?.错误信息 === 'string' ? raw.错误信息.trim() : undefined;
    const 状态 = raw?.状态 === 'success' || raw?.状态 === 'failed' || raw?.状态 === 'pending'
        ? raw.状态
        : undefined;
    const 生成时间 = Number.isFinite(Number(raw?.生成时间)) ? Number(raw.生成时间) : 0;
    const id = typeof raw?.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : '';
    if (!图片URL && !本地路径 && !生图词组 && !原始描述 && !错误信息) return undefined;
    return {
        ...normalizedAsset,
        id: id || undefined,
        图片URL,
        本地路径,
        生图词组,
        最终正向提示词,
        最终负向提示词,
        原始描述,
        使用模型,
        生成时间,
        构图: typeof raw?.构图 === 'string' ? raw.构图 : undefined,
        部位: typeof raw?.部位 === 'string' ? raw.部位 : undefined,
        画风: raw?.画风,
        画师串,
        尺寸: typeof raw?.尺寸 === 'string' ? raw.尺寸.trim() : undefined,
        状态,
        错误信息
    };
};

const NPC私密图片构图集合 = new Set(['部位特写', '胸部', '小穴', '屁穴', '肉棒']);
const NPC图片记录是否私密 = (record: any): boolean => {
    const composition = 规范化文本(record?.构图);
    const part = 规范化文本(record?.部位);
    if (NPC私密图片构图集合.has(composition) || NPC私密图片构图集合.has(part)) return true;
    const id = 规范化文本(record?.id);
    return /^npc_secret_/i.test(id);
};

const NPC图片记录可作头像 = (record: any): boolean => (
    record?.状态 === 'success'
    && record?.构图 === '头像'
    && !NPC图片记录是否私密(record)
    && Boolean(规范化文本(record?.id))
);

const NPC死亡状态正则 = /(死亡|已死|身亡|阵亡|战死|气绝|断气|毙命|殒命|已故)/u;

const NPC有死亡事实依据 = (npc: any, 战斗数值: { 当前血量: number; 最大血量: number }): boolean => {
    void 战斗数值;
    return typeof npc?.死亡时间 === 'string' && npc.死亡时间.trim().length > 0;
};

const 移除无依据死亡字段 = (
    npc其他字段: Record<string, any>,
    有死亡事实依据: boolean,
    战斗数值: { 当前血量: number; 最大血量: number }
): Record<string, any> => {
    if (有死亡事实依据) return npc其他字段;
    const next = { ...npc其他字段 };
    if (NPC死亡状态正则.test(String(next.状态 || ''))) {
        next.状态 = 战斗数值.当前血量 <= 0 && 战斗数值.最大血量 > 0 ? '重伤' : undefined;
        if (next.状态 === undefined) delete next.状态;
    }
    if (NPC死亡状态正则.test(String(next.生死状态 || ''))) delete next.生死状态;
    if (NPC死亡状态正则.test(String(next.生命状态 || ''))) delete next.生命状态;
    if (NPC死亡状态正则.test(String(next.死亡描述 || ''))) delete next.死亡描述;
    return next;
};

const 过滤无依据死亡DEBUFF = (
    list: Array<{ 名称: string; 描述: string; 效果: string; 结束时间?: string }>,
    有死亡事实依据: boolean
): Array<{ 名称: string; 描述: string; 效果: string; 结束时间?: string }> => (
    有死亡事实依据 ? list : list.filter((item) => !状态效果是死亡判定(item))
);

const NPC图片记录可作立绘 = (record: any): boolean => (
    record?.状态 === 'success'
    && (record?.构图 === '半身' || record?.构图 === '立绘')
    && !NPC图片记录是否私密(record)
    && Boolean(规范化文本(record?.id))
);

const 合并NPC图片历史记录 = (leftRaw: any[] | undefined, rightRaw: any[] | undefined): any[] => {
    const merged = new Map<string, any>();
    const fallback: any[] = [];
    [...(Array.isArray(rightRaw) ? rightRaw : []), ...(Array.isArray(leftRaw) ? leftRaw : [])].forEach((item) => {
        const normalized = 标准化NPC图片记录(item);
        if (!normalized) return;
        const key = typeof normalized.id === 'string' && normalized.id.trim()
            ? normalized.id.trim()
            : `${normalized.生成时间 || 0}|${normalized.构图 || ''}|${normalized.图片URL || normalized.本地路径 || normalized.原始描述 || ''}`;
        if (merged.has(key)) return;
        merged.set(key, normalized);
        fallback.push(normalized);
    });
    return fallback.sort((a, b) => (Number(b?.生成时间) || 0) - (Number(a?.生成时间) || 0));
};

const 合并NPC图片档案对象 = (leftRaw: any, rightRaw: any): any | undefined => {
    const leftSource = leftRaw && typeof leftRaw === 'object' && !Array.isArray(leftRaw) ? leftRaw : {};
    const rightSource = rightRaw && typeof rightRaw === 'object' && !Array.isArray(rightRaw) ? rightRaw : {};
    const leftRecent = 标准化NPC图片记录(leftSource?.最近生图结果);
    const rightRecent = 标准化NPC图片记录(rightSource?.最近生图结果);
    const mergedHistory = 合并NPC图片历史记录(
        Array.isArray(leftSource?.生图历史)
            ? leftSource.生图历史
            : (leftRecent ? [leftRecent] : []),
        Array.isArray(rightSource?.生图历史)
            ? rightSource.生图历史
            : (rightRecent ? [rightRecent] : [])
    );
    const recent = rightRecent
        || leftRecent
        || mergedHistory[0];
    const 原始已选头像图片ID = 取首个非空文本(rightSource?.已选头像图片ID, leftSource?.已选头像图片ID);
    const 原始已选立绘图片ID = 取首个非空文本(rightSource?.已选立绘图片ID, leftSource?.已选立绘图片ID);
    const 已选背景图片ID = 取首个非空文本(rightSource?.已选背景图片ID, leftSource?.已选背景图片ID);
    const 已选头像图片ID = mergedHistory.some((item) => item?.id === 原始已选头像图片ID && NPC图片记录可作头像(item))
        ? 原始已选头像图片ID
        : '';
    const 已选立绘图片ID = mergedHistory.some((item) => item?.id === 原始已选立绘图片ID && NPC图片记录可作立绘(item))
        ? 原始已选立绘图片ID
        : '';
    const 香闺秘档部位档案 = 标准化香闺秘档部位档案({
        ...(leftSource?.香闺秘档部位档案 && typeof leftSource.香闺秘档部位档案 === 'object' ? leftSource.香闺秘档部位档案 : {}),
        ...(rightSource?.香闺秘档部位档案 && typeof rightSource.香闺秘档部位档案 === 'object' ? rightSource.香闺秘档部位档案 : {})
    });
    if (!recent && mergedHistory.length <= 0 && !香闺秘档部位档案 && !已选头像图片ID && !已选立绘图片ID && !已选背景图片ID) {
        return undefined;
    }
    return {
        ...(recent ? { 最近生图结果: recent } : {}),
        ...(mergedHistory.length > 0 ? { 生图历史: mergedHistory } : {}),
        ...(已选头像图片ID ? { 已选头像图片ID } : {}),
        ...(已选立绘图片ID ? { 已选立绘图片ID } : {}),
        ...(已选背景图片ID ? { 已选背景图片ID } : {}),
        ...(香闺秘档部位档案 ? { 香闺秘档部位档案 } : {})
    };
};

const NPC真实姓名最大长度 = 4;
const NPC真实姓名最小长度 = 2;
const 男性NPC真实姓名列表 = [
    '顾长风', '沈砚', '陆怀安', '谢行舟', '裴景明', '温玄', '晏清河', '秦照夜',
    '傅云峥', '宁远山', '赵平安', '林砚舟', '许明澈', '周临渊', '韩不疑', '唐问川',
    '宋青崖', '叶归尘', '江听澜', '方知白', '洛怀瑾', '萧承影', '陈照微', '岑越'
];
const 中性NPC真实姓名列表 = [
    '云照', '青棠', '闻溪', '桑宁', '辛夷', '乔霜', '尹舟', '郁离',
    '楚衡', '姜行', '阮清', '奚白', '叶澄', '洛微', '祝宁', '温竹'
];
const 噪声NPC姓名片段正则 = /(?:轻声|低声|细语|小声|柔声|温声|沉声|冷声|厉声|压低|喃喃|喃语|嘀咕|说道|说着|问道|答道|开口|补充|解释|提醒|笑着|苦笑|皱眉|抬眼|抬头|看向|望向|回头|点头|摇头|叹息|擦净|将|把|并|却|已经|刚刚|没有|只能|只好|不得不|勉强|继续|仍旧|还是)/;
const 噪声NPC姓名收尾正则 = /(?:地|着|了|道|问|说)$/;
const 噪声NPC姓名完整短语正则 = /^(?:(?:他|她|它|你|我|他们|她们|对方|那人|此人|有人|众人))?(?:只能|只好|只得|不得不|勉强|连忙|赶紧|急忙|仍旧|还是|却|并|但|又|便|就|再)?(?:强辩|辩解|解释|补充|提醒|回答|答话|应声|开口|说道|说着|问道|答道|低声|轻声|沉声|苦笑|皱眉|点头|摇头|叹息|看向|望向|回头|抬眼|抬头|擦净)$/;

const 是否噪声NPC姓名 = (value: unknown): boolean => {
    const name = 规范化文本(value);
    if (!name) return true;
    if (name.length > 12 || name.length > NPC真实姓名最大长度) return true;
    if (/[，。！？；：、,.!?;:\s\n\r]/.test(name)) return true;
    if (/^[\u4e00-\u9fa5]{2,4}$/u.test(name) && !姓名含已知中文姓氏(name)) return true;
    if (/^(旁白|判定|NSFW判定|免责声明|disclaimer)$/.test(name)) return true;
    if (/^(?:自己|自身|本人|主角|玩家|他|她|它|你|我|他们|她们|对方|那人|此人|有人|众人)(?:已经|没有|只能|只好|仍旧|还是|刚刚|继续|再|又|便|就|不再|无法|不能)?.*$/u.test(name)) return true;
    if (噪声NPC姓名完整短语正则.test(name)) return true;
    if (/^(?:自己|自身|本人|主角|玩家|他|她|它|你|我|他们|她们|对方|那人|此人|有人|众人).{1,10}$/.test(name) && 噪声NPC姓名片段正则.test(name)) return true;
    if (name.length >= 4 && 噪声NPC姓名收尾正则.test(name) && 噪声NPC姓名片段正则.test(name)) return true;
    return false;
};

const 是否真实NPC姓名 = (value: unknown): boolean => {
    const name = 规范化文本(value).replace(/\s+/g, '');
    if (name.length < NPC真实姓名最小长度 || name.length > NPC真实姓名最大长度) return false;
    if (!/^[\u4e00-\u9fa5]{2,4}$/u.test(name)) return false;
    if (是否噪声NPC姓名(name)) return false;
    if (!姓名含已知中文姓氏(name)) return false;
    if (/^(?:未知|无名|未命名|某人|路人|角色|人物|NPC|同门|随行者|队友|弟子)\d*$/u.test(name)) return false;
    if (/(?:女子|女人|少女|姑娘|男子|男人|少年|老者|老人|太监|内侍|侍卫|护卫|弟子|同门|掌柜|管事|宫女|丫鬟|小厮|车夫)$/u.test(name)) return false;
    return true;
};

const 选择男性或中性NPC姓名 = (npc: any, index: number, usedNames: Set<string>): string => {
    const text = [npc?.id, npc?.姓名, npc?.性别, npc?.身份, npc?.简介, npc?.境界, index]
        .map((value) => 规范化文本(value))
        .join('|');
    const pool = /女|女子|少女|姑娘|侍女|丫鬟|妇人|夫人/.test(text)
        ? 中性NPC真实姓名列表
        : (/男|男子|少年|老者|太监|内侍|侍卫|护卫|公子|汉子/.test(text) ? 男性NPC真实姓名列表 : 中性NPC真实姓名列表);
    const start = 稳定区间整数(`${text}:real-name`, 0, Math.max(0, pool.length - 1));
    for (let offset = 0; offset < pool.length; offset += 1) {
        const candidate = pool[(start + offset) % pool.length];
        if (candidate && !usedNames.has(candidate)) return candidate;
    }
    return `${pool[start] || '云照'}${usedNames.size + 1}`;
};

const 修复NPC真实姓名列表 = (list: any[], options?: { 保留非姓名库主要女性名?: boolean }): any[] => {
    void options;
    return Array.isArray(list) ? list : [];
};

const 是否应丢弃NPC条目 = (rawNpc: any): boolean => {
    if (!rawNpc || typeof rawNpc !== 'object' || Array.isArray(rawNpc)) return false;
    const name = 取首个非空文本(rawNpc?.姓名, rawNpc?.名称, rawNpc?.name);
    if (!是否噪声NPC姓名(name)) return false;
    if (rawNpc?.对白登场 === true || rawNpc?.自动补全头像 === true) return true;
    const id = 取首个非空文本(rawNpc?.id, rawNpc?.ID);
    const hasStableId = Boolean(id && !/^npc_\d+$/.test(id));
    const hasSubstantialProfile = Boolean(
        取首个非空文本(rawNpc?.外貌描写, rawNpc?.身份, rawNpc?.简介, rawNpc?.境界)
        || rawNpc?.是否主要角色 === true
        || rawNpc?.是否队友 === true
    );
    return !hasStableId || !hasSubstantialProfile;
};

const 推断NPC性别 = (npc: any): string => {
    const raw = 规范化文本(npc?.性别);
    const normalizedRaw = 规范化性别枚举(raw);
    if (normalizedRaw !== '未知') return normalizedRaw;
    const 扶她设定 = 规范化文本(npc?.扶她设定);
    if (扶她设定 && !/^(无扶她设定|否|无)$/u.test(扶她设定) && /扶她/.test(扶她设定)) return '扶她';
    const 男娘设定 = 规范化文本(npc?.男娘设定);
    if (男娘设定 && !/^(无男娘设定|否|无)$/u.test(男娘设定) && /男娘/.test(男娘设定)) return '男娘';
    return '未知';
};

const 规范化性别枚举 = (value: unknown): '男' | '女' | '男娘' | '扶她' | '未知' => {
    const text = 规范化文本(value);
    if (!text || /^(未知|不详|未定|待定|无)$/u.test(text)) return '未知';
    if (/扶她/.test(text)) return '扶她';
    if (/男娘/.test(text)) return '男娘';
    if (/^(男|男性|男子|男修|男身|男性修士)$/u.test(text)) return '男';
    if (/^(女|女性|女子|女修|女身|女性修士)$/u.test(text)) return '女';
    return '未知';
};

const 性别是否明确 = (value: unknown): value is '男' | '女' | '男娘' | '扶她' => {
    const text = 规范化性别枚举(value);
    return text === '男' || text === '女' || text === '男娘' || text === '扶她';
};

const 重算合并后NPC性别 = (leftRaw: any, rightRaw: any): string => {
    const rightExplicit = 规范化性别枚举(rightRaw?.性别);
    if (性别是否明确(rightExplicit)) return rightExplicit;
    const leftExplicit = 规范化性别枚举(leftRaw?.性别);
    if (性别是否明确(leftExplicit)) return leftExplicit;

    const rightDerived = 推断NPC性别(rightRaw);
    if (性别是否明确(rightDerived)) return rightDerived;
    const leftDerived = 推断NPC性别(leftRaw);
    if (性别是否明确(leftDerived)) return leftDerived;
    console.info('[npc.gender.resolved]', {
        leftName: 规范化文本(leftRaw?.姓名),
        rightName: 规范化文本(rightRaw?.姓名),
        leftGender: 规范化文本(leftRaw?.性别) || 'unknown',
        rightGender: 规范化文本(rightRaw?.性别) || 'unknown',
        resolvedGender: '未知',
        resolver: 'merge-fallback',
        confidence: 'low'
    });
    return '未知';
};

const 推断NPC年龄 = (npc: any, fallbackIndex: number): number => {
    const parsed = Number(npc?.年龄);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
    const text = [npc?.姓名, npc?.身份, npc?.简介, npc?.境界, npc?.外貌描写, npc?.身材描写]
        .map((value) => 规范化文本(value))
        .join(' ');
    if (/老者|老人|长老|掌门|宗主|族老|老妪/.test(text)) return 稳定区间整数(`${text}:age`, 45, 68);
    if (/中年|执事|管事|掌柜|夫人|妇人|叔|伯|婶/.test(text)) return 稳定区间整数(`${text}:age`, 28, 42);
    if (/少女|少年|弟子|同门|师妹|师弟|侍女|丫鬟/.test(text)) return 稳定区间整数(`${text}:age`, 18, 24);
    return 稳定区间整数(`${text || npc?.id || fallbackIndex}:age`, 18, 32);
};

const 规范化NPC身份 = (npc: any): string => {
    const raw = 规范化文本(npc?.身份);
    if (raw && !/^(未知|未知身份|不详|待补充|剧情对话人物|对话人物|路人)$/u.test(raw)) return raw;
    const text = [npc?.姓名, npc?.简介, npc?.所属势力, npc?.关系状态].map((value) => 规范化文本(value)).join(' ');
    if (/同门|师兄|师姐|师弟|师妹|青云山庄/.test(text)) return '同门';
    if (/侍卫|护卫|守卫/.test(text)) return '护卫';
    if (/侍女|丫鬟/.test(text)) return '侍女';
    if (/掌柜|商会|商贾|牙行|拍卖/.test(text)) return '商会人士';
    if (/敌|水贼|山贼|匪|刺客/.test(text)) return '敌对人物';
    return npc?.是否队友 === true ? '随行同伴' : '江湖人物';
};

const 规范化NPC关系状态 = (npc: any): string => {
    const raw = 规范化文本(npc?.关系状态);
    if (raw && !/^(未知|不详|待补充)$/u.test(raw)) return raw;
    if (npc?.是否队友 === true) return '队友';
    if (npc?.是否在场 === true) return '同场';
    return '初识';
};

const 规范化NPC简介 = (npc: any, identity: string): string => {
    const raw = 规范化文本(npc?.简介);
    if (raw && !/^(暂无简介|未知|不详|待补充)$/u.test(raw)) return raw;
    const name = 规范化文本(npc?.姓名);
    const realm = 规范化文本(npc?.境界);
    return [name, identity, realm && !/^未知/.test(realm) ? realm : ''].filter(Boolean).join('，') || '本回合登场人物，后续由变量生成继续补档。';
};

const 标准化单个NPC = (rawNpc: any, fallbackIndex: number): any => {
    const npc = rawNpc && typeof rawNpc === 'object' ? rawNpc : {};
    let npc其他字段 = { ...npc };
    const 外貌描写 = 取首个非空文本(
        npc?.外貌描写,
        npc?.外貌,
        npc?.档案?.外貌要点,
        npc?.档案?.外貌描写
    );
    const 身材描写 = 取首个非空文本(
        npc?.身材描写,
        npc?.身材,
        npc?.档案?.身材要点,
        npc?.档案?.身材描写
    );
    const 衣着风格 = 取首个非空文本(
        npc?.衣着风格,
        npc?.衣着,
        npc?.档案?.衣着风格,
        npc?.档案?.衣着要点
    );
    const 记忆 = 标准化NPC记忆(npc?.记忆);
    const 总结记忆 = 标准化NPC总结记忆(npc?.总结记忆);
    const 当前装备 = 补齐NPC装备(npc?.当前装备, npc);
    const 背包 = 补齐NPC背包(npc?.背包 ?? npc?.物品列表, npc);
    const BUFF = 标准化NPC状态效果(npc?.BUFF ?? npc?.buff ?? npc?.增益);
    const rawDEBUFF = 标准化NPC状态效果(npc?.DEBUFF ?? npc?.debuff ?? npc?.负面状态);
    const 出身背景 = (() => {
        const normalized = 标准化出身背景(npc?.出身背景);
        if (normalized.名称 || normalized.描述 || normalized.效果) return normalized;
        return 推断NPC出身背景(npc);
    })();
    const 天赋列表 = (() => {
        const normalized = 标准化天赋列表(npc?.天赋列表);
        if (normalized.length > 0) return normalized;
        return 推断NPC天赋列表(npc, 出身背景);
    })();
    const 技艺 = 标准化NPC技艺(npc?.技艺);
    if (NPC技艺需要本地推断(技艺)) {
        应用出身天赋技艺推断(技艺, {
            seed: [
                npc?.id,
                npc?.姓名,
                npc?.性别,
                npc?.身份,
                npc?.境界,
                出身背景.名称
            ].map((value) => 规范化文本(value)).join('|'),
            text: [
                npc?.姓名,
                npc?.身份,
                npc?.简介,
                npc?.境界,
                npc?.所属势力,
                出身背景.名称,
                出身背景.描述,
                出身背景.效果
            ].map((value) => 规范化文本(value)).join(' '),
            talents: 天赋列表,
            background: 出身背景,
            major: Boolean(npc?.是否主要角色 || npc?.是否队友 || npc?.好感度 > 30),
            ordinaryRandom: true,
            reasonLabel: '因天赋、出身与经历'
        });
    }
    const 基础属性 = 标准化NPC基础属性(npc);
    const 战斗数值 = 标准化NPC战斗数值(npc);
    const 有死亡事实依据 = NPC有死亡事实依据(npc, 战斗数值);
    npc其他字段 = 移除无依据死亡字段(npc其他字段, 有死亡事实依据, 战斗数值);
    const DEBUFF = 过滤无依据死亡DEBUFF(rawDEBUFF, 有死亡事实依据);
    const 部位状态 = 标准化NPC部位状态(npc, 战斗数值);
    const 核心性格特征 = 取首个非空文本(npc?.核心性格特征);
    const 好感度突破条件 = 取首个非空文本(npc?.好感度突破条件);
    const 关系突破条件 = 取首个非空文本(npc?.关系突破条件);
    const 关系网变量 = 标准化关系网变量(npc?.关系网变量);
    const 生日 = 取首个非空文本(npc?.生日);
    const 对主角称呼 = 取首个非空文本(npc?.对主角称呼);
    const 胸部描述 = 读取胸部描述(npc);
    const 小穴描述 = 读取小穴描述(npc);
    const 屁穴描述 = 读取屁穴描述(npc);
    const 肉棒描述 = 读取肉棒描述(npc);
    const 男娘设定 = 读取男娘设定(npc);
    const 扶她设定 = 读取扶她设定(npc);
    const 性癖 = 读取性癖(npc) || (npc?.是否主要角色 === true ? 生成主要角色默认性癖(npc) : undefined);
    const 敏感点 = 读取敏感点(npc) || (npc?.是否主要角色 === true ? 生成主要角色默认敏感点(npc) : undefined);
    const 子宫 = 标准化子宫档案对象(npc?.子宫 ?? npc?.子宫档案);
    const 上次更新时间 = 解析任意时间字段(npc?.上次更新时间 ?? npc?.最后更新时间 ?? npc?.更新时间);
    const 图片档案 = (() => {
        const source = npc?.图片档案 && typeof npc.图片档案 === 'object' && !Array.isArray(npc.图片档案)
            ? npc.图片档案
            : null;
        return 合并NPC图片档案对象(
            npc?.最近生图结果 && typeof npc.最近生图结果 === 'object'
                ? { 最近生图结果: npc.最近生图结果 }
                : undefined,
            source
        );
    })();
    const 推断性别 = 推断NPC性别(npc);
    const 推断年龄 = 推断NPC年龄(npc, fallbackIndex);
    const 推断身份 = 规范化NPC身份(npc);
    const 推断关系状态 = 规范化NPC关系状态(npc);
    const 推断简介 = 规范化NPC简介(npc, 推断身份);
    const 名器档案 = 标准化名器档案(npc?.名器档案, npc, {
        forceFemaleMajor: 推断性别 === '女' && npc?.是否主要角色 === true
    });
    const 旧初夜失贞档案 = (推断性别 === '女' || 推断性别 === '扶她') && (
        npc?.是否处女 === false
        || 取字段文本(npc, '初夜夺取者')
        || 取字段文本(npc, '初夜时间')
        || 取字段文本(npc, '初夜描述')
    ) ? {
        是否失贞: npc?.是否处女 === false,
        第一次对象: 取字段文本(npc, '初夜夺取者'),
        第一次时间: 解析任意时间字段(npc?.初夜时间),
        第一次描述: 取字段文本(npc, '初夜描述')
    } : undefined;
    const 原始失贞档案 = (推断性别 === '女' || 推断性别 === '扶她' || 推断性别 === '男娘')
        ? 合并失贞档案(npc?.失贞档案, 旧初夜失贞档案)
        : undefined;
    const 旧阴道首次记录 = (推断性别 === '女' || 推断性别 === '扶她') && 原始失贞档案?.是否失贞 ? [{
        类型: '阴道交',
        是否已发生: true,
        第一次对象: 原始失贞档案.第一次对象,
        第一次时间: 原始失贞档案.第一次时间,
        第一次描述: 原始失贞档案.第一次描述
    }] : undefined;
    const 首次亲密记录 = 合并首次亲密记录列表(npc?.首次亲密记录 ?? npc?.性经历档案, 旧阴道首次记录, { ...npc, 性别: 推断性别 });
    const 男娘肛交失贞档案 = 推断性别 === '男娘'
        ? (() => {
            const analRecord = (首次亲密记录 || []).find((record: any) => record?.类型 === '肛交' && record?.是否已发生);
            if (!analRecord) return undefined;
            return {
                是否失贞: true,
                第一次对象: analRecord.第一次对象,
                第一次时间: analRecord.第一次时间,
                第一次描述: analRecord.第一次描述
            };
        })()
        : undefined;
    const 失贞档案 = 推断性别 === '女' || 推断性别 === '扶她'
        ? 原始失贞档案
        : 推断性别 === '男娘'
            ? 合并失贞档案(原始失贞档案, 男娘肛交失贞档案)
            : undefined;

    return {
        ...npc其他字段,
        id: 取首个非空文本(npc?.id, `npc_${fallbackIndex}`) || `npc_${fallbackIndex}`,
        姓名: 取首个非空文本(npc?.姓名, `角色${fallbackIndex}`) || `角色${fallbackIndex}`,
        性别: 推断性别,
        年龄: 推断年龄,
        ...(生日 ? { 生日 } : {}),
        境界: 规范化境界显示文本(npc?.境界, '未知境界'),
        ...(
            npc?.灵根 !== undefined
            || npc?.灵根资质 !== undefined
            || npc?.当前灵力 !== undefined
            || npc?.最大灵力 !== undefined
            || npc?.当前神识 !== undefined
            || npc?.最大神识 !== undefined
            || npc?.丹田状态 !== undefined
            || npc?.道基状态 !== undefined
            || npc?.心魔值 !== undefined
            || npc?.功德 !== undefined
            || npc?.业力 !== undefined
                ? {
                    灵根: 规范化文本(npc?.灵根, '未鉴定灵根'),
                    灵根资质: 规范化文本(npc?.灵根资质, '未鉴定'),
                    当前灵力: Math.max(0, 规范化数值(npc?.当前灵力, 0)),
                    最大灵力: Math.max(0, 规范化数值(npc?.最大灵力, 0)),
                    当前神识: Math.max(0, 规范化数值(npc?.当前神识, 0)),
                    最大神识: Math.max(0, 规范化数值(npc?.最大神识, 0)),
                    丹田状态: 规范化文本(npc?.丹田状态, '稳定'),
                    道基状态: 规范化文本(npc?.道基状态, '未筑道基'),
                    心魔值: Math.max(0, 规范化数值(npc?.心魔值, 0)),
                    功德: 规范化数值(npc?.功德, 0),
                    业力: 规范化数值(npc?.业力, 0)
                }
                : {}
        ),
        身份: 推断身份,
        是否在场: typeof npc?.是否在场 === 'boolean' ? npc.是否在场 : true,
        是否队友: typeof npc?.是否队友 === 'boolean' ? npc.是否队友 : false,
        是否主要角色: typeof npc?.是否主要角色 === 'boolean' ? npc.是否主要角色 : false,
        好感度: Number.isFinite(Number(npc?.好感度)) ? Number(npc.好感度) : 0,
        关系状态: 推断关系状态,
        ...(对主角称呼 ? { 对主角称呼 } : {}),
        简介: 推断简介,
        力量: 基础属性.力量,
        敏捷: 基础属性.敏捷,
        体质: 基础属性.体质,
        根骨: 基础属性.根骨,
        悟性: 基础属性.悟性,
        福源: 基础属性.福源,
        境界层级: 基础属性.境界层级,
        攻击力: 战斗数值.攻击力,
        防御力: 战斗数值.防御力,
        当前血量: 战斗数值.当前血量,
        最大血量: 战斗数值.最大血量,
        当前精力: 战斗数值.当前精力,
        最大精力: 战斗数值.最大精力,
        当前内力: 战斗数值.当前内力,
        最大内力: 战斗数值.最大内力,
        ...部位状态,
        当前装备,
        背包,
        BUFF,
        DEBUFF,
        天赋列表,
        出身背景,
        技艺,
        记忆,
        ...(总结记忆.length > 0 ? { 总结记忆 } : {}),
        ...(核心性格特征 ? { 核心性格特征 } : {}),
        ...(好感度突破条件 ? { 好感度突破条件 } : {}),
        ...(关系突破条件 ? { 关系突破条件 } : {}),
        ...(Array.isArray(关系网变量) && 关系网变量.length > 0 ? { 关系网变量 } : {}),
        ...(外貌描写 ? { 外貌描写 } : {}),
        ...(身材描写 ? { 身材描写 } : {}),
        ...(衣着风格 ? { 衣着风格 } : {}),
        ...(胸部描述 ? { 胸部描述 } : {}),
        ...(小穴描述 ? { 小穴描述 } : {}),
        ...(屁穴描述 ? { 屁穴描述 } : {}),
        ...(肉棒描述 ? { 肉棒描述 } : {}),
        ...(男娘设定 ? { 男娘设定 } : {}),
        ...(扶她设定 ? { 扶她设定 } : {}),
        ...(性癖 ? { 性癖 } : {}),
        ...(敏感点 ? { 敏感点 } : {}),
        ...(名器档案 ? { 名器档案 } : {}),
        ...(子宫 ? { 子宫 } : {}),
        失贞档案,
        ...(首次亲密记录 ? { 首次亲密记录 } : {}),
        ...(上次更新时间 ? { 上次更新时间 } : {}),
        ...(图片档案 ? { 图片档案, 最近生图结果: 图片档案.最近生图结果 } : {})
    };
};

const 合并NPC对象 = (leftRaw: any, rightRaw: any, fallbackIndex: number): any => {
    const left = 标准化单个NPC(leftRaw, fallbackIndex);
    const right = 标准化单个NPC(rightRaw, fallbackIndex);
    const leftNameKey = 归一化键(left?.姓名);
    const rightNameKey = 归一化键(right?.姓名);
    const shouldPreserveLeftId = NPC占位身份疑似同一人(left, right) || (!!leftNameKey && leftNameKey === rightNameKey);
    const mergedMemory = 标准化NPC记忆([...(left.记忆 || []), ...(right.记忆 || [])]);
    const mergedSummaryMemory = 标准化NPC总结记忆([...(left.总结记忆 || []), ...(right.总结记忆 || [])]);

    const mergedWomb = 合并子宫档案(left?.子宫, right?.子宫);

    const mergedEquip = (() => {
        const leftEquip = 标准化NPC装备(leftRaw?.当前装备);
        const rightEquip = 标准化NPC装备(rightRaw?.当前装备);
        const keys = ['主武器', '副武器', '服装', '饰品', '内衣', '内裤', '袜饰', '鞋履'];
        const out: Record<string, string> = {};
        keys.forEach((k) => {
            const text = 取更优文本(取字段文本(leftEquip, k), 取字段文本(rightEquip, k));
            out[k] = text || '无';
        });
        return 补齐NPC装备(out, { ...left, ...right });
    })();
    const mergedRawBag = [...标准化NPC背包(leftRaw?.背包 ?? leftRaw?.物品列表), ...标准化NPC背包(rightRaw?.背包 ?? rightRaw?.物品列表)]
        .filter((item, index, list) => list.findIndex((candidate) => candidate.名称 === item.名称 && candidate.类型 === item.类型) === index);
    const mergedBuff = [...标准化NPC状态效果(left?.BUFF), ...标准化NPC状态效果(right?.BUFF)]
        .filter((item, index, list) => list.findIndex((candidate) => candidate.名称 === item.名称) === index);
    const mergedSkills = 标准化NPC技艺([...标准化NPC技艺(left?.技艺), ...标准化NPC技艺(right?.技艺)]);
    const mergedBackground = (() => {
        const rightBackground = 标准化出身背景(right?.出身背景);
        const leftBackground = 标准化出身背景(left?.出身背景);
        const merged = {
            名称: 取更优文本(leftBackground.名称, rightBackground.名称),
            描述: 取更优文本(leftBackground.描述, rightBackground.描述),
            效果: 取更优文本(leftBackground.效果, rightBackground.效果)
        };
        if (merged.名称 || merged.描述 || merged.效果) return merged;
        return 推断NPC出身背景({ ...left, ...right });
    })();
    const mergedTalents = (() => {
        const list = [...标准化天赋列表(left?.天赋列表), ...标准化天赋列表(right?.天赋列表)];
        const seen = new Set<string>();
        const deduped = list.filter((item) => {
            const key = item.名称 || `${item.描述}|${item.效果}`;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return deduped.length > 0 ? deduped : 推断NPC天赋列表({ ...left, ...right }, mergedBackground);
    })();
    const mergedRelationNet = 合并关系网变量(left?.关系网变量, right?.关系网变量);
    const mergedImageArchive = 合并NPC图片档案对象(left?.图片档案, right?.图片档案);
    const mergedSexLossArchive = 合并失贞档案(left?.失贞档案, right?.失贞档案);
    const mergedFirstIntimacyRecords = 合并首次亲密记录列表(left?.首次亲密记录, right?.首次亲密记录, { ...left, ...right });
    const mergedBaseAttrs = 标准化NPC基础属性({ ...left, ...right });
    const mergedBaseForCombat = {
        ...left,
        ...right,
        ...mergedBaseAttrs,
        攻击力: Number.isFinite(Number(right?.攻击力)) && Number(right?.攻击力) > 0
            ? Number(right.攻击力)
            : (Number.isFinite(Number(left?.攻击力)) && Number(left?.攻击力) > 0 ? Number(left.攻击力) : undefined),
        防御力: Number.isFinite(Number(right?.防御力)) && Number(right?.防御力) > 0
            ? Number(right.防御力)
            : (Number.isFinite(Number(left?.防御力)) && Number(left?.防御力) > 0 ? Number(left.防御力) : undefined),
        当前血量: Number.isFinite(Number(right?.当前血量))
            ? Number(right.当前血量)
            : (Number.isFinite(Number(left?.当前血量)) ? Number(left.当前血量) : undefined),
        最大血量: Number.isFinite(Number(right?.最大血量))
            ? Number(right.最大血量)
            : (Number.isFinite(Number(left?.最大血量)) ? Number(left.最大血量) : undefined),
        当前精力: Number.isFinite(Number(right?.当前精力))
            ? Number(right.当前精力)
            : (Number.isFinite(Number(left?.当前精力)) ? Number(left.当前精力) : undefined),
        最大精力: Number.isFinite(Number(right?.最大精力))
            ? Number(right.最大精力)
            : (Number.isFinite(Number(left?.最大精力)) ? Number(left.最大精力) : undefined),
        当前内力: Number.isFinite(Number(right?.当前内力))
            ? Number(right.当前内力)
            : (Number.isFinite(Number(left?.当前内力)) ? Number(left.当前内力) : undefined),
        最大内力: Number.isFinite(Number(right?.最大内力))
            ? Number(right.最大内力)
            : (Number.isFinite(Number(left?.最大内力)) ? Number(left.最大内力) : undefined)
    };
    const mergedCombat = 标准化NPC战斗数值(mergedBaseForCombat);
    const mergedDebuff = 过滤无依据死亡DEBUFF(
        [...标准化NPC状态效果(left?.DEBUFF), ...标准化NPC状态效果(right?.DEBUFF)]
            .filter((item, index, list) => list.findIndex((candidate) => candidate.名称 === item.名称) === index),
        NPC有死亡事实依据({ ...left, ...right }, mergedCombat)
    );
    const mergedBag = mergedRawBag;
    const mergedName = 选择合并后NPC姓名(left, right) || `角色${fallbackIndex}`;
    const legacyPlaceholderName = (() => {
        const leftName = 规范化文本(left?.姓名);
        const rightName = 规范化文本(right?.姓名);
        if (leftName && leftName !== mergedName && 判断NPC姓名疑似占位(leftName)) return leftName;
        if (rightName && rightName !== mergedName && 判断NPC姓名疑似占位(rightName)) return rightName;
        return '';
    })();
    const mergedIdentity = 取更优文本(取字段文本(left, '身份'), 取字段文本(right, '身份')) || '未知身份';
    const mergedIntroBase = 合并补充文本(取字段文本(left, '简介'), 取字段文本(right, '简介')) || '暂无简介';
    const mergedIntro = legacyPlaceholderName
        && ![mergedIdentity, mergedIntroBase].some((text) => 归一化键(text).includes(归一化键(legacyPlaceholderName)))
        ? `${mergedIntroBase}（曾以“${legacyPlaceholderName}”指称。）`
        : mergedIntroBase;
    const mergedGender = 重算合并后NPC性别(leftRaw, rightRaw);
    const mergedIsMajor = Boolean(left?.是否主要角色) || Boolean(right?.是否主要角色);
    const mergedArtifactArchive = 标准化名器档案(
        [...(Array.isArray(left?.名器档案) ? left.名器档案 : []), ...(Array.isArray(right?.名器档案) ? right.名器档案 : [])],
        { ...left, ...right, 性别: mergedGender, 是否主要角色: mergedIsMajor },
        { forceFemaleMajor: mergedGender === '女' && mergedIsMajor }
    );

    return {
        ...left,
        ...right,
        id: shouldPreserveLeftId
            ? (取首个非空文本(left.id, right.id, `npc_${fallbackIndex}`) || `npc_${fallbackIndex}`)
            : (取首个非空文本(right.id, left.id, `npc_${fallbackIndex}`) || `npc_${fallbackIndex}`),
        姓名: mergedName,
        性别: mergedGender,
        年龄: Number.isFinite(Number(right?.年龄))
            ? Number(right.年龄)
            : (Number.isFinite(Number(left?.年龄)) ? Number(left.年龄) : undefined),
        生日: 取更优文本(取字段文本(left, '生日'), 取字段文本(right, '生日')),
        境界: 规范化境界显示文本(取更优文本(取字段文本(left, '境界'), 取字段文本(right, '境界')), '未知境界'),
        身份: mergedIdentity,
        当前位置: 取更优文本(取字段文本(left, '当前位置'), 取字段文本(right, '当前位置')),
        当前地点: 取更优文本(取字段文本(left, '当前地点'), 取字段文本(right, '当前地点')),
        位置路径: 取更优文本(取字段文本(left, '位置路径'), 取字段文本(right, '位置路径')),
        当前任务: 取更优文本(取字段文本(left, '当前任务'), 取字段文本(right, '当前任务')),
        行动意图: 取更优文本(取字段文本(left, '行动意图'), 取字段文本(right, '行动意图')),
        待执行指令: 取更优文本(取字段文本(left, '待执行指令'), 取字段文本(right, '待执行指令')),
        指令来源: 取更优文本(取字段文本(left, '指令来源'), 取字段文本(right, '指令来源')),
        指令时间: 取更优文本(取字段文本(left, '指令时间'), 取字段文本(right, '指令时间')),
        预期汇合地点: 取更优文本(取字段文本(left, '预期汇合地点'), 取字段文本(right, '预期汇合地点')),
        是否在场: typeof right?.是否在场 === 'boolean'
            ? right.是否在场
            : (typeof left?.是否在场 === 'boolean' ? left.是否在场 : true),
        是否队友: typeof right?.是否队友 === 'boolean'
            ? right.是否队友
            : (typeof left?.是否队友 === 'boolean' ? left.是否队友 : false),
        是否主要角色: mergedIsMajor,
        好感度: Number.isFinite(Number(right?.好感度))
            ? Number(right.好感度)
            : (Number.isFinite(Number(left?.好感度)) ? Number(left.好感度) : 0),
        关系状态: 取更优文本(取字段文本(left, '关系状态'), 取字段文本(right, '关系状态')) || '未知',
        对主角称呼: 取更优文本(取字段文本(left, '对主角称呼'), 取字段文本(right, '对主角称呼')),
        简介: mergedIntro,
        力量: mergedBaseAttrs.力量,
        敏捷: mergedBaseAttrs.敏捷,
        体质: mergedBaseAttrs.体质,
        根骨: mergedBaseAttrs.根骨,
        悟性: mergedBaseAttrs.悟性,
        福源: mergedBaseAttrs.福源,
        境界层级: mergedBaseAttrs.境界层级,
        核心性格特征: 取更优文本(取字段文本(left, '核心性格特征'), 取字段文本(right, '核心性格特征')),
        好感度突破条件: 取更优文本(取字段文本(left, '好感度突破条件'), 取字段文本(right, '好感度突破条件')),
        关系突破条件: 取更优文本(取字段文本(left, '关系突破条件'), 取字段文本(right, '关系突破条件')),
        关系网变量: mergedRelationNet,
        外貌描写: 取更优文本(取字段文本(left, '外貌描写'), 取字段文本(right, '外貌描写')),
        身材描写: 取更优文本(取字段文本(left, '身材描写'), 取字段文本(right, '身材描写')),
        衣着风格: 取更优文本(取字段文本(left, '衣着风格'), 取字段文本(right, '衣着风格')),
        胸部描述: 取更优文本(读取胸部描述(left), 读取胸部描述(right)),
        小穴描述: 取更优文本(读取小穴描述(left), 读取小穴描述(right)),
        屁穴描述: 取更优文本(读取屁穴描述(left), 读取屁穴描述(right)),
        肉棒描述: 取更优文本(读取肉棒描述(left), 读取肉棒描述(right)),
        男娘设定: 取更优文本(读取男娘设定(left), 读取男娘设定(right)),
        扶她设定: 取更优文本(读取扶她设定(left), 读取扶她设定(right)),
        性癖: 取更优文本(读取性癖(left), 读取性癖(right)),
        敏感点: 取更优文本(读取敏感点(left), 读取敏感点(right)),
        ...(mergedArtifactArchive ? { 名器档案: mergedArtifactArchive } : {}),
        子宫: mergedWomb,
        ...(mergedSexLossArchive ? { 失贞档案: mergedSexLossArchive } : {}),
        ...(mergedFirstIntimacyRecords ? { 首次亲密记录: mergedFirstIntimacyRecords } : {}),
        是否处女: typeof right?.是否处女 === 'boolean'
            ? right.是否处女
            : (typeof left?.是否处女 === 'boolean' ? left.是否处女 : undefined),
        初夜夺取者: 取更优文本(取字段文本(left, '初夜夺取者'), 取字段文本(right, '初夜夺取者')),
        初夜时间: (() => {
            const leftTime = 取字段文本(left, '初夜时间');
            const rightTime = 取字段文本(right, '初夜时间');
            const l = leftTime ? (normalizeCanonicalGameTime(leftTime) || leftTime) : undefined;
            const r = rightTime ? (normalizeCanonicalGameTime(rightTime) || rightTime) : undefined;
            return 取更优文本(l, r);
        })(),
        初夜描述: 取更优文本(取字段文本(left, '初夜描述'), 取字段文本(right, '初夜描述')),
        攻击力: mergedCombat.攻击力,
        防御力: mergedCombat.防御力,
        上次更新时间: (() => {
            const l = 解析任意时间字段(left?.上次更新时间 ?? left?.最后更新时间 ?? left?.更新时间);
            const r = 解析任意时间字段(right?.上次更新时间 ?? right?.最后更新时间 ?? right?.更新时间);
            return 取更优文本(l, r);
        })(),
        当前血量: mergedCombat.当前血量,
        最大血量: mergedCombat.最大血量,
        当前精力: mergedCombat.当前精力,
        最大精力: mergedCombat.最大精力,
        当前内力: mergedCombat.当前内力,
        最大内力: mergedCombat.最大内力,
        当前装备: mergedEquip,
        背包: mergedBag,
        BUFF: mergedBuff,
        DEBUFF: mergedDebuff,
        天赋列表: mergedTalents,
        出身背景: mergedBackground,
        技艺: mergedSkills,
        记忆: mergedMemory,
        ...(mergedSummaryMemory.length > 0 ? { 总结记忆: mergedSummaryMemory } : {}),
        ...(mergedImageArchive ? { 图片档案: mergedImageArchive, 最近生图结果: mergedImageArchive.最近生图结果 } : {})
    };
};

const 合并同名NPC列表 = (list: any[]): any[] => {
    if (!Array.isArray(list)) return [];
    const merged: any[] = [];
    const nameIndexMap = new Map<string, number>();

    list.filter((rawNpc) => !是否应丢弃NPC条目(rawNpc)).forEach((rawNpc, index) => {
        const normalized = 标准化单个NPC(rawNpc, index);
        const nameKey = 归一化键(normalized?.姓名);
        const nameMatchedIndex = nameKey ? nameIndexMap.get(nameKey) : undefined;
        const targetIndex = typeof nameMatchedIndex === 'number' ? nameMatchedIndex : -1;

        if (targetIndex < 0) {
            const pushIndex = merged.length;
            merged.push(normalized);
            const newNameKey = 归一化键(normalized?.姓名);
            if (newNameKey) nameIndexMap.set(newNameKey, pushIndex);
            return;
        }

        merged[targetIndex] = 合并NPC对象(merged[targetIndex], normalized, targetIndex);
        const mergedNameKey = 归一化键(merged[targetIndex]?.姓名);
        if (mergedNameKey) nameIndexMap.set(mergedNameKey, targetIndex);
    });

    return merged;
};

const 合并占位NPC列表 = (list: any[], options?: { 合并精确同名?: boolean }): any[] => {
    if (!Array.isArray(list)) return [];
    const merged: any[] = [];
    const nameIndexMap = new Map<string, number>();

    list.filter((rawNpc) => !是否应丢弃NPC条目(rawNpc)).forEach((rawNpc, index) => {
        const normalized = 标准化单个NPC(rawNpc, index);
        const nameKey = 归一化键(normalized?.姓名);
        const exactMatchedIndex = nameKey && options?.合并精确同名 !== false ? nameIndexMap.get(nameKey) : undefined;
        const placeholderMatchedIndex = typeof exactMatchedIndex === 'number'
            ? exactMatchedIndex
            : merged.findIndex((candidate) => NPC占位身份疑似同一人(candidate, normalized));
        const targetIndex = typeof placeholderMatchedIndex === 'number' ? placeholderMatchedIndex : -1;

        if (targetIndex < 0) {
            const pushIndex = merged.length;
            merged.push(normalized);
            const newNameKey = 归一化键(normalized?.姓名);
            if (newNameKey) nameIndexMap.set(newNameKey, pushIndex);
            return;
        }

        const previousNameKey = 归一化键(merged[targetIndex]?.姓名);
        输出社交规范化调试('合并占位 NPC', {
            targetIndex,
            left: {
                id: merged[targetIndex]?.id,
                姓名: merged[targetIndex]?.姓名,
                身份: merged[targetIndex]?.身份,
                关系: merged[targetIndex]?.关系
            },
            right: {
                id: normalized?.id,
                姓名: normalized?.姓名,
                身份: normalized?.身份,
                关系: normalized?.关系
            }
        });
        merged[targetIndex] = 合并NPC对象(merged[targetIndex], normalized, targetIndex);
        if (previousNameKey && nameIndexMap.get(previousNameKey) === targetIndex) {
            nameIndexMap.delete(previousNameKey);
        }
        const mergedNameKey = 归一化键(merged[targetIndex]?.姓名);
        if (mergedNameKey) nameIndexMap.set(mergedNameKey, targetIndex);
    });

    return merged;
};

const 规范化社交列表 = (list: any[], options?: { 合并同名?: boolean; 保留非姓名库主要女性名?: boolean }): any[] => {
    if (!Array.isArray(list)) return [];
    const filtered = list.filter((npc) => !是否应丢弃NPC条目(npc));
    const normalized = filtered.map((npc, index) => 标准化单个NPC(npc, index));
    const merged = options?.合并同名 === false
        ? 合并占位NPC列表(normalized, { 合并精确同名: true })
        : 合并占位NPC列表(合并同名NPC列表(normalized));
    输出社交规范化调试('规范化社交列表', {
        inputCount: list.length,
        filteredCount: filtered.length,
        normalizedCount: normalized.length,
        mergedCount: merged.length,
        names: merged.map((npc: any) => npc?.姓名)
    });
    return 修复NPC真实姓名列表(merged, {
        保留非姓名库主要女性名: options?.保留非姓名库主要女性名 === true
    });
};

export {
    规范化环境信息,
    构建完整地点文本,
    规范化角色物品容器映射,
    规范化社交列表,
    标准化功法列表
};
