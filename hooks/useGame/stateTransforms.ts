import { 角色数据结构, 环境信息结构, 装备槽位 } from '../../types';
import { normalizeCanonicalGameTime, 结构化时间转标准串 } from './timeUtils';
import { 压缩图片资源字段 } from '../../utils/imageAssets';
import { 自动装备最佳装备 } from '../../utils/equipmentActions';
import { 规范化消耗品使用效果 } from '../../utils/itemEffects';
import { 补齐自动丹药预设 } from '../../utils/autoConsumables';

const 深拷贝 = <T,>(data: T): T => JSON.parse(JSON.stringify(data)) as T;
const 默认装备模板 = {
    头部: '无',
    胸部: '无',
    盔甲: '无',
    内衬: '无',
    腿部: '无',
    手部: '无',
    足部: '无',
    主武器: '无',
    副武器: '无',
    暗器: '无',
    背部: '无',
    腰部: '无',
    坐骑: '无'
};
const 默认金钱模板 = {
    金元宝: 0,
    银子: 0,
    铜钱: 0
};
const 角色身体部位列表 = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'] as const;
const 默认背景模板 = {
    名称: '',
    描述: '',
    效果: ''
};
const 规范化货币数值 = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
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
const 未命名物品正则 = /^(未命名|未知物品|未知|无名|杂物|物品|\?+|n\/a)$/i;
const 秘籍残卷正则 = /残卷|残篇|残本|残页|残章/;
const 任务唯一道具正则 = /任务|主线|支线|剧情|信物|令牌|手令|调兵令|密令|密函|钥匙|契约|凭证|腰牌|玉佩|印信|地图|残图/;
const 储物容器名称正则 = /储物袋|乾坤袋|须弥袋|百宝囊|行囊|纳戒|储物戒|储物镯|储物手镯/;
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
const 默认角色技艺 = ['炼器', '炼丹', '医术', '阵法', '符箓', '机关', '采集', '鉴定']
    .map((名称) => ({ 名称, 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' }));
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
    默认角色技艺.forEach((item) => {
        if (!byName.has(item.名称)) byName.set(item.名称, { ...item });
    });
    return Array.from(byName.values());
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
    const text = [
        item?.名称,
        item?.描述,
        item?.类型,
        item?.物品来源类型,
        item?.来源描述,
        item?.视觉唯一性
    ].map((value) => 规范化文本(value)).join(' ');
    return item?.类型 === '任务道具'
        || item?.视觉唯一性 === '唯一'
        || item?.视觉唯一性 === '主线'
        || ['任务奖励', '支线奖励', '主线奖励', '主线事件'].includes(规范化文本(item?.物品来源类型))
        || 任务唯一道具正则.test(text);
};
const 估算容器容量 = (item: any): number => {
    const existing = 规范化非负数(item?.容器属性?.最大容量, 0);
    if (existing > 0) return existing;
    const text = `${规范化文本(item?.名称)} ${规范化文本(item?.描述)}`;
    const matched = text.match(/(?:可容纳|可盛放|容量|可装下|可收纳)\s*(\d+(?:\.\d+)?)\s*斤/);
    if (matched) return 规范化非负数(matched[1], 0);
    if (/纳戒|储物戒/.test(text)) return 160;
    if (/储物镯|储物手镯/.test(text)) return 140;
    if (/储物袋|乾坤袋|须弥袋/.test(text)) return 120;
    if (/百宝囊|行囊/.test(text)) return 80;
    return 0;
};
const 是否为储物容器 = (item: any): boolean => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const text = `${规范化文本(item?.名称)} ${规范化文本(item?.描述)}`;
    return 储物容器名称正则.test(text) || 估算容器容量(item) > 0;
};
const 计算物品总重量 = (item: any): number => {
    const weight = 规范化非负数(item?.重量, 0);
    const count = Math.max(1, 规范化整数(item?.堆叠数量, 1));
    return weight * count;
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
    item.重量 = 规范化非负数(item?.重量, 0);
    item.堆叠数量 = Math.max(1, 规范化整数(item?.堆叠数量, 1));
    item.是否可堆叠 = Boolean(item?.是否可堆叠);
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
    if (item.类型 === '消耗品') {
        item.使用效果 = 规范化消耗品使用效果(item);
        item.毒性 = 规范化非负数(item?.毒性, 0);
        item.最大堆叠 = Math.max(1, 规范化整数(item?.最大堆叠, item.堆叠数量), item.堆叠数量);
    }
    delete item.当前容器ID;
    delete item.占用空间;
    if (是否为储物容器(item)) {
        const 最大容量 = 估算容器容量(item);
        item.容器属性 = {
            最大容量,
            已用容量: 0,
            容器类型: 取首个有效文本片段(item?.容器属性?.容器类型, '储物容器')
        };
    } else {
        delete item.容器属性;
    }
    return item;
};
const 自动整理超重物品 = (items: any[], equippedByItemId: Map<string, 装备槽位>, maxCarry: number) => {
    items.forEach((item) => {
        delete item.当前容器ID;
        delete item.占用空间;
        if (item?.容器属性) {
            item.容器属性 = {
                ...item.容器属性,
                最大容量: 规范化非负数(item.容器属性?.最大容量, 0),
                已用容量: 0
            };
        }
    });
    const round1 = (value: number) => Math.round(value * 10) / 10;
    const calcCarry = () => round1(items.reduce((sum, item) => {
        if (item?.当前容器ID) return sum;
        return sum + 计算物品总重量(item);
    }, 0));
    let currentCarry = calcCarry();
    if (currentCarry <= maxCarry) return currentCarry;
    const containers = items
        .filter((item) => item?.容器属性?.最大容量 > 0)
        .sort((a, b) => (b.容器属性?.最大容量 || 0) - (a.容器属性?.最大容量 || 0));
    const canStore = (item: any) => {
        if (!item || item?.当前容器ID) return false;
        if (equippedByItemId.has(item.ID)) return false;
        if (item?.容器属性?.最大容量 > 0) return false;
        return 计算物品总重量(item) > 0;
    };
    for (const container of containers) {
        if (currentCarry <= maxCarry) break;
        const capacity = 规范化非负数(container?.容器属性?.最大容量, 0);
        let remaining = round1(capacity - 规范化非负数(container?.容器属性?.已用容量, 0));
        if (remaining <= 0) continue;
        for (const item of items) {
            if (currentCarry <= maxCarry || remaining <= 0) break;
            if (!canStore(item)) continue;
            const itemWeight = 规范化非负数(item?.重量, 0);
            const stackCount = Math.max(1, 规范化整数(item?.堆叠数量, 1));
            const totalWeight = round1(itemWeight * stackCount);
            if (totalWeight <= 0) continue;
            if (item.是否可堆叠 && stackCount > 1 && itemWeight > 0 && totalWeight > remaining) {
                const movableCount = Math.min(stackCount, Math.floor((remaining + 1e-6) / itemWeight));
                if (movableCount <= 0) continue;
                item.堆叠数量 = stackCount - movableCount;
                const storedItem = {
                    ...item,
                    ID: `${item.ID}__stored_${container.ID}_${stackCount - movableCount}`,
                    堆叠数量: movableCount,
                    当前容器ID: container.ID,
                    占用空间: round1(itemWeight * movableCount)
                };
                items.push(storedItem);
                remaining = round1(remaining - storedItem.占用空间);
                container.容器属性.已用容量 = round1((container.容器属性.已用容量 || 0) + storedItem.占用空间);
                currentCarry = calcCarry();
                continue;
            }
            if (totalWeight > remaining) continue;
            item.当前容器ID = container.ID;
            item.占用空间 = totalWeight;
            remaining = round1(remaining - totalWeight);
            container.容器属性.已用容量 = round1((container.容器属性.已用容量 || 0) + totalWeight);
            currentCarry = calcCarry();
        }
    }
    return currentCarry;
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
    [...(Array.isArray(rightSource?.生图历史) ? rightSource.生图历史 : []), ...(Array.isArray(leftSource?.生图历史) ? leftSource.生图历史 : [])]
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
    const 已选头像图片ID = 取首个非空文本值(rightSource?.已选头像图片ID, leftSource?.已选头像图片ID);
    const 已选立绘图片ID = 取首个非空文本值(rightSource?.已选立绘图片ID, leftSource?.已选立绘图片ID);
    const 已选背景图片ID = 取首个非空文本值(rightSource?.已选背景图片ID, leftSource?.已选背景图片ID);
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

const 规范化角色物品容器映射 = (rawRole?: any): 角色数据结构 => {
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
    (role as any).境界 = 规范化文本((role as any).境界);
    (role as any).境界层级 = Math.max(0, 规范化整数((role as any).境界层级, 1));
    (role as any).所属门派ID = 规范化文本((role as any).所属门派ID, 'none');
    (role as any).门派职位 = 规范化文本((role as any).门派职位, '无');
    (role as any).门派贡献 = Math.max(0, 规范化整数((role as any).门派贡献, 0));
    (role as any).当前精力 = Math.max(0, 规范化数值((role as any).当前精力, 0));
    (role as any).最大精力 = Math.max(0, 规范化数值((role as any).最大精力, 0));
    (role as any).当前内力 = Math.max(0, 规范化数值((role as any).当前内力, 0));
    (role as any).最大内力 = Math.max(0, 规范化数值((role as any).最大内力, 0));
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
    (role as any).天赋列表 = Array.isArray((role as any).天赋列表)
        ? (role as any).天赋列表
            .map((item: any) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
                const 名称 = 规范化文本(item?.名称);
                const 描述 = 规范化文本(item?.描述);
                const 效果 = 规范化文本(item?.效果);
                if (!名称 && !描述 && !效果) return null;
                return { 名称, 描述, 效果 };
            })
            .filter(Boolean)
        : [];
    const rawBackground = (role as any).出身背景 && typeof (role as any).出身背景 === 'object' && !Array.isArray((role as any).出身背景)
        ? (role as any).出身背景
        : {};
    (role as any).出身背景 = {
        名称: 规范化文本(rawBackground?.名称, 默认背景模板.名称),
        描述: 规范化文本(rawBackground?.描述, 默认背景模板.描述),
        效果: 规范化文本(rawBackground?.效果, 默认背景模板.效果)
    };
    规范化角色身体部位字段(role);
    if (typeof (role as any).外貌 !== 'string' || !(role as any).外貌.trim()) {
        (role as any).外貌 = '相貌平常，衣着朴素。';
    }
    if (typeof (role as any).性格 !== 'string' || !(role as any).性格.trim()) {
        (role as any).性格 = '谨慎沉稳。';
    }
    const rawMoney = (role as any).金钱 && typeof (role as any).金钱 === 'object' ? (role as any).金钱 : {};
    (role as any).金钱 = {
        金元宝: 规范化货币数值(rawMoney?.金元宝 ?? 默认金钱模板.金元宝),
        银子: 规范化货币数值(rawMoney?.银子 ?? 默认金钱模板.银子),
        铜钱: 规范化货币数值(rawMoney?.铜钱 ?? 默认金钱模板.铜钱)
    };
    const rawPlayerBuffs = Array.isArray((role as any).玩家BUFF) ? (role as any).玩家BUFF : [];
    (role as any).玩家BUFF = rawPlayerBuffs
        .map((item: any, idx: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const 名称 = typeof item?.名称 === 'string' ? item.名称.trim() : '';
            const 描述 = typeof item?.描述 === 'string' ? item.描述.trim() : '';
            const 效果 = typeof item?.效果 === 'string' ? item.效果.trim() : '';
            const 结束时间 = typeof item?.结束时间 === 'string'
                ? (normalizeCanonicalGameTime(item.结束时间) || item.结束时间.trim())
                : '';
            if (!名称 && !描述 && !效果 && !结束时间) return null;
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
    (role as any).功法列表 = Array.isArray((role as any).功法列表) ? (role as any).功法列表 : [];
    (role as any).技艺 = 标准化角色技艺((role as any).技艺);

    // 兜底：如果技艺全为"未入门/熟练度0"，根据角色信息自动给基础值
    const 技艺列表 = (role as any).技艺 as Array<{ 名称: string; 等级: string; 熟练度: number; 描述: string }>;
    const 全部为零 = 技艺列表.every((s) => s.熟练度 === 0 && (s.等级 === '未入门' || !s.等级));
    if (全部为零) {
        const 出身 = 规范化文本((role as any).出身背景?.名称) + 规范化文本((role as any).出身背景?.描述);
        const 门派 = 规范化文本((role as any).所属门派ID);
        const 背景 = `${出身} ${门派} ${规范化文本((role as any).性格)} ${规范化文本((role as any).外貌)}`;
        const 推断 = (keywords: string[], skill: string, level: number) => {
            if (keywords.some((kw) => 背景.includes(kw))) {
                const item = 技艺列表.find((s) => s.名称 === skill);
                if (item) { item.等级 = '入门'; item.熟练度 = level; item.描述 = `因出身经历而具备基础${skill}能力。`; }
            }
        };
        推断(['药', '医', '治', '伤', '救'], '医术', 20);
        推断(['铁', '锻', '匠', '器', '铸'], '炼器', 18);
        推断(['丹', '炉', '药铺', '药堂'], '炼丹', 15);
        推断(['猎', '山', '林', '野', '采', '农'], '采集', 22);
        推断(['阵', '符', '术', '道', '玄'], '阵法', 12);
        推断(['鉴', '商', '当铺', '古玩', '宝'], '鉴定', 16);
        // 如果推断后仍全为零，给一个最低保底
        if (技艺列表.every((s) => s.熟练度 === 0)) {
            const fallback = 技艺列表.find((s) => s.名称 === '采集') || 技艺列表[0];
            if (fallback) { fallback.等级 = '入门'; fallback.熟练度 = 10; fallback.描述 = '日常生活中积累的基础能力。'; }
        }
    }

    const rawEquip = role?.装备 && typeof role.装备 === 'object' ? role.装备 : ({} as any);
    role.装备 = { ...默认装备模板, ...(rawEquip as any) };

    const sourceList = Array.isArray(role?.物品列表) ? role.物品列表 : [];

    let deduped: any[] = [];
    const seenIds = new Set<string>();
    sourceList.forEach((item: any, idx: number) => {
        const normalizedItem = 规范化单个物品(item, idx);
        if (!normalizedItem) return;
        const id = normalizedItem.ID;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        deduped.push(normalizedItem);
    });

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

    role.当前负重 = 自动整理超重物品(
        deduped,
        equippedByItemId,
        Math.max(0, 规范化数值(role?.最大负重, 0))
    );

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

    role.物品列表 = deduped;
    // 只有角色身上从未被系统补过（已补齐系统丹药预设 !== true）才补一次。
    // 用户反馈：丹药用完后下回合又出来了——根因就是这里每回合都补一次。
    const 是否已补过 = (role as any).已补齐系统丹药预设 === true;
    if (!是否已补过) {
        role.物品列表 = 补齐自动丹药预设(role.物品列表);
        (role as any).已补齐系统丹药预设 = true;
    }
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

const 读取性癖 = (obj: any): string | undefined => {
    return 取字段文本(obj, '性癖');
};

const 读取敏感点 = (obj: any): string | undefined => {
    return 取字段文本(obj, '敏感点');
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

const 归一化键 = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/\s+/g, '').toLowerCase();
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
const NPC门派组织正则 = /([\u4e00-\u9fa5]{2,10}(?:山庄|门|派|宗|宫|寨|帮|镖局|商会|书院|府|阁|堂))/;

const 默认NPC技艺 = ['炼器', '炼丹', '医术', '阵法', '符箓', '机关', '采集', '鉴定']
    .map((名称) => ({ 名称, 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' }));

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

const 读取NPC门派组织 = (npc: any): string => {
    const text = [
        npc?.身份,
        npc?.简介,
        npc?.所属势力,
        npc?.门派,
        npc?.势力
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    return text.match(NPC门派组织正则)?.[1] || '';
};

const 读取NPC境界阶位 = (npc: any): number => {
    const text = [
        npc?.境界,
        npc?.修为,
        npc?.身份,
        npc?.简介
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    let rank = 1;
    const realmTable: Array<[RegExp, number]> = [
        [/凡人|普通|未入道|无修为/, 1],
        [/炼体|锻体/, 2],
        [/开脉|通脉/, 3],
        [/聚息|聚气|凝气/, 4],
        [/筑基|归元/, 5],
        [/凝真|玄照/, 6],
        [/金丹|玄丹/, 8],
        [/元婴/, 10],
        [/化神/, 13],
        [/炼虚/, 16],
        [/合体/, 20],
        [/大乘|渡劫/, 24]
    ];
    realmTable.forEach(([pattern, value]) => {
        if (pattern.test(text)) rank = Math.max(rank, value);
    });
    if (/寨主|庄主|掌门|宗主|长老|供奉|统领|首领/.test(text)) rank += 2;
    if (/后期|圆满|巅峰/.test(text)) rank += 1;
    const levelMatch = text.match(/(?:第)?([一二三四五六七八九十\d]{1,3})(?:重|层)/);
    if (levelMatch) {
        const digit = Number(levelMatch[1]);
        if (Number.isFinite(digit)) rank += Math.min(3, Math.max(0, Math.floor(digit / 3)));
        else if (/七|八|九|十/.test(levelMatch[1])) rank += 2;
        else if (/四|五|六/.test(levelMatch[1])) rank += 1;
    }
    return Math.max(1, rank);
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
    const text = [npc?.姓名, npc?.性别, npc?.身份, npc?.境界, npc?.简介].map((value) => 规范化文本(value)).join(' ');
    const eliteBonus = /寨主|庄主|掌门|宗主|长老|供奉|统领|首领|天骄|圣女|公子|小姐/.test(text) ? 2 : 0;
    const base = Math.max(3, 6 + rank * 2 + eliteBonus);
    const style = {
        力量: /刀|斧|锤|拳|力|壮|魁|猛|护卫|镖/.test(text) ? 3 : 0,
        敏捷: /剑|刺|影|盗|弓|暗器|轻功|斥候|快/.test(text) ? 3 : 0,
        体质: /盾|甲|僧|体|横练|护法|壮|卫/.test(text) ? 3 : 0,
        根骨: /内功|根骨|道|僧|医|丹|长老|宗/.test(text) ? 3 : 0,
        悟性: /书|谋|师|医|丹|阵|符|术|智|谋士/.test(text) ? 3 : 0,
        福源: /贵|小姐|公子|少主|圣女|机缘|祥|幸运/.test(text) ? 2 : 0
    };
    const read = (key: keyof typeof style, fallback: number) => {
        const raw = Number(npc?.[key]);
        return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : Math.max(1, Math.ceil(fallback));
    };
    return {
        力量: read('力量', base + style.力量),
        敏捷: read('敏捷', base + style.敏捷),
        体质: read('体质', base + style.体质),
        根骨: read('根骨', base + style.根骨),
        悟性: read('悟性', base + style.悟性),
        福源: read('福源', Math.max(1, base - 1 + style.福源)),
        境界层级: Math.max(1, Math.ceil(规范化数值(npc?.境界层级, rank)))
    };
};

const 生成NPC默认装备 = (npc: any): Record<string, string> => {
    const text = [
        npc?.姓名,
        npc?.性别,
        npc?.身份,
        npc?.境界,
        npc?.简介,
        npc?.衣着风格
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    const isFemale = /女|小姐|姑娘|夫人|师姐|师妹|侍女/.test(text);
    const faction = 读取NPC门派组织(npc);
    const factionPrefix = faction ? faction.replace(/(?:山庄|镖局|商会|书院|门|派|宗|宫|寨|帮|府|阁|堂).*/, '') : '';
    const weapon = /医|药|丹/.test(text)
        ? '防身银针'
        : (factionPrefix ? `${factionPrefix}佩剑` : (isFemale ? '随身短剑' : '随身佩刀'));
    const accessory = faction ? `${faction}腰牌` : (isFemale ? '随身玉佩' : '随身护符');
    return {
        主武器: weapon,
        副武器: isFemale ? '袖中暗器' : '护腕短刃',
        服装: factionPrefix && isFemale ? `${factionPrefix}绣裙` : (isFemale ? '素色劲装' : '青布劲装'),
        饰品: accessory,
        内衣: '贴身中衣',
        内裤: '贴身衬裤',
        袜饰: isFemale ? '素罗短袜' : '布袜',
        鞋履: isFemale ? '轻便绣鞋' : '轻便布靴'
    };
};

const 补齐NPC装备 = (raw: any, npc: any): Record<string, string> => {
    const out = 标准化NPC装备(raw);
    const fallback = 生成NPC默认装备(npc);
    NPC装备槽位.forEach((key) => {
        if (是空NPC装备(out[key])) out[key] = fallback[key] || '无';
    });
    return out;
};

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

const 生成NPC默认背包 = (npc: any): Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }> => {
    const text = [
        npc?.姓名,
        npc?.性别,
        npc?.身份,
        npc?.境界,
        npc?.简介
    ].map((value) => 规范化文本(value)).filter(Boolean).join(' ');
    const faction = 读取NPC门派组织(npc);
    const isFemale = /女|小姐|姑娘|夫人|师姐|师妹|侍女/.test(text);
    const bag: Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }> = [
        { 名称: '疗伤散', 类型: '消耗品', 数量: 1, 描述: '普通外伤药粉，可处理轻伤。' },
        { 名称: '干粮', 类型: '杂物', 数量: 2, 描述: '行走江湖时随身携带的简易口粮。' },
        {
            名称: faction ? `${faction}信物` : '随身火折子',
            类型: '杂物',
            数量: 1,
            描述: faction ? '表明身份来历的随身信物。' : '夜行与野外留宿时常用的小物。'
        }
    ];
    if (isFemale) {
        bag.push({ 名称: '备用发簪', 类型: '杂物', 数量: 1, 描述: '便于整理发髻的随身小物。' });
    }
    return bag;
};

const 补齐NPC背包 = (raw: any, npc: any): Array<{ 名称: string; 类型?: string; 数量?: number; 描述?: string }> => {
    const normalized = 标准化NPC背包(raw);
    if (normalized.length > 0) return normalized;
    return 生成NPC默认背包(npc);
};

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
    const text = [npc?.身份, npc?.境界, npc?.简介].map((value) => 规范化文本(value)).join(' ');
    const eliteBonus = /寨主|庄主|掌门|宗主|长老|供奉|统领|首领|小姐|公子/.test(text) ? 8 : 0;
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
    默认NPC技艺.forEach((item) => {
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

const 合并内射记录 = (a: any, b: any): any[] | undefined => {
    const merged = new Map<string, any>();
    const process = (raw: any) => {
        if (!Array.isArray(raw)) return;
        raw.forEach((item) => {
            const 日期Raw = typeof item?.日期 === 'string'
                ? item.日期.trim()
                : (结构化时间转标准串(item?.日期) || '');
            const 日期 = 日期Raw ? (normalizeCanonicalGameTime(日期Raw) || 日期Raw) : '';
            const 描述 = typeof item?.描述 === 'string' ? item.描述.trim() : '';
            const 怀孕判定日Raw = typeof item?.怀孕判定日 === 'string'
                ? item.怀孕判定日.trim()
                : (结构化时间转标准串(item?.怀孕判定日) || '');
            const 怀孕判定日 = 怀孕判定日Raw ? (normalizeCanonicalGameTime(怀孕判定日Raw) || 怀孕判定日Raw) : '';
            if (!日期 && !描述 && !怀孕判定日) return;
            const key = `${日期}__${描述}`;
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, { 日期: 日期 || '未知时间', 描述, 怀孕判定日: 怀孕判定日 || '未知时间' });
                return;
            }
            merged.set(key, {
                日期: 取更优文本(existing.日期, 日期) || existing.日期 || '未知时间',
                描述: 取更优文本(existing.描述, 描述) || existing.描述 || '',
                怀孕判定日: 取更优文本(existing.怀孕判定日, 怀孕判定日) || existing.怀孕判定日 || '未知时间'
            });
        });
    };

    process(a);
    process(b);
    const out = Array.from(merged.values());
    return out.length > 0 ? out : undefined;
};

const 标准化子宫档案 = (raw: any): any | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const 状态 = 取字段文本(raw, '状态') || '未知';
    const 宫口状态 = 取字段文本(raw, '宫口状态') || '未知';
    const 内射记录 = 合并内射记录(raw?.内射记录, undefined);
    return {
        状态,
        宫口状态,
        ...(内射记录 ? { 内射记录 } : { 内射记录: [] })
    };
};

const 标准化子宫档案对象 = (raw: any): any | undefined => {
    return 标准化子宫档案(raw);
};

const 合并子宫档案 = (a: any, b: any): any | undefined => {
    const left = 标准化子宫档案对象(a);
    const right = 标准化子宫档案对象(b);
    if (!left && !right) return undefined;
    const 内射记录 = 合并内射记录(left?.内射记录, right?.内射记录) || [];
    return {
        状态: 取更优文本(left?.状态, right?.状态) || '未知',
        宫口状态: 取更优文本(left?.宫口状态, right?.宫口状态) || '未知',
        内射记录
    };
};

const 标准化香闺秘档部位结果 = (raw: any, part: '胸部' | '小穴' | '屁穴'): any | undefined => {
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
    if (!胸部 && !小穴 && !屁穴) return undefined;
    return {
        ...(胸部 ? { 胸部 } : {}),
        ...(小穴 ? { 小穴 } : {}),
        ...(屁穴 ? { 屁穴 } : {})
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
    const 已选头像图片ID = 取首个非空文本(rightSource?.已选头像图片ID, leftSource?.已选头像图片ID);
    const 已选立绘图片ID = 取首个非空文本(rightSource?.已选立绘图片ID, leftSource?.已选立绘图片ID);
    const 已选背景图片ID = 取首个非空文本(rightSource?.已选背景图片ID, leftSource?.已选背景图片ID);
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

const 标准化单个NPC = (rawNpc: any, fallbackIndex: number): any => {
    const npc = rawNpc && typeof rawNpc === 'object' ? rawNpc : {};
    const npc其他字段 = { ...npc };
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
    const DEBUFF = 标准化NPC状态效果(npc?.DEBUFF ?? npc?.debuff ?? npc?.负面状态);
    const 技艺 = 标准化NPC技艺(npc?.技艺);
    // 兜底：NPC 技艺全为0时根据身份推断
    const npc全部为零 = 技艺.every((s: any) => s.熟练度 === 0 && (s.等级 === '未入门' || !s.等级));
    if (npc全部为零) {
        const npc身份文本 = [npc?.身份, npc?.简介, npc?.姓名, npc?.境界].filter(Boolean).join(' ');
        const npc推断 = (keywords: string[], skill: string, level: number) => {
            if (keywords.some((kw) => npc身份文本.includes(kw))) {
                const item = 技艺.find((s: any) => s.名称 === skill);
                if (item) { item.等级 = '入门'; item.熟练度 = level; item.描述 = `因身份经历而具备。`; }
            }
        };
        npc推断(['药', '医', '大夫', '郎中', '治', '伤'], '医术', 25);
        npc推断(['铁', '锻', '匠', '器', '铸', '兵'], '炼器', 20);
        npc推断(['丹', '炉', '药师', '炼丹'], '炼丹', 22);
        npc推断(['猎', '山', '林', '野', '采', '农', '樵'], '采集', 20);
        npc推断(['阵', '符', '术', '道', '玄', '法'], '阵法', 15);
        npc推断(['鉴', '商', '当铺', '古玩', '宝', '掌柜'], '鉴定', 18);
        npc推断(['机关', '工', '巧', '墨'], '机关', 15);
        // NPC 如果有境界说明是修炼者，至少给一项
        if (技艺.every((s: any) => s.熟练度 === 0) && npc身份文本.match(/境|修|武|剑|刀|拳|掌|气|内力/)) {
            const fallback = 技艺.find((s: any) => s.名称 === '采集') || 技艺[0];
            if (fallback) { fallback.等级 = '入门'; fallback.熟练度 = 10; fallback.描述 = '江湖历练所得。'; }
        }
    }
    const 基础属性 = 标准化NPC基础属性(npc);
    const 战斗数值 = 标准化NPC战斗数值(npc);
    const 核心性格特征 = 取首个非空文本(npc?.核心性格特征);
    const 好感度突破条件 = 取首个非空文本(npc?.好感度突破条件);
    const 关系突破条件 = 取首个非空文本(npc?.关系突破条件);
    const 关系网变量 = 标准化关系网变量(npc?.关系网变量);
    const 生日 = 取首个非空文本(npc?.生日);
    const 对主角称呼 = 取首个非空文本(npc?.对主角称呼);
    const 胸部描述 = 读取胸部描述(npc);
    const 小穴描述 = 读取小穴描述(npc);
    const 屁穴描述 = 读取屁穴描述(npc);
    const 性癖 = 读取性癖(npc);
    const 敏感点 = 读取敏感点(npc);
    const 子宫 = 标准化子宫档案对象(npc?.子宫);
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

    return {
        ...npc其他字段,
        id: 取首个非空文本(npc?.id, `npc_${fallbackIndex}`) || `npc_${fallbackIndex}`,
        姓名: 取首个非空文本(npc?.姓名, `角色${fallbackIndex}`) || `角色${fallbackIndex}`,
        性别: typeof npc?.性别 === 'string' ? npc.性别 : '未知',
        年龄: Number.isFinite(Number(npc?.年龄)) ? Number(npc.年龄) : undefined,
        ...(生日 ? { 生日 } : {}),
        境界: typeof npc?.境界 === 'string' ? npc.境界 : '未知境界',
        身份: typeof npc?.身份 === 'string' ? npc.身份 : '未知身份',
        是否在场: typeof npc?.是否在场 === 'boolean' ? npc.是否在场 : true,
        是否队友: typeof npc?.是否队友 === 'boolean' ? npc.是否队友 : false,
        是否主要角色: typeof npc?.是否主要角色 === 'boolean' ? npc.是否主要角色 : false,
        好感度: Number.isFinite(Number(npc?.好感度)) ? Number(npc.好感度) : 0,
        关系状态: typeof npc?.关系状态 === 'string' ? npc.关系状态 : '未知',
        ...(对主角称呼 ? { 对主角称呼 } : {}),
        简介: typeof npc?.简介 === 'string' ? npc.简介 : '暂无简介',
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
        当前装备,
        背包,
        BUFF,
        DEBUFF,
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
        ...(性癖 ? { 性癖 } : {}),
        ...(敏感点 ? { 敏感点 } : {}),
        ...(子宫 ? { 子宫 } : {}),
        ...(上次更新时间 ? { 上次更新时间 } : {}),
        ...(图片档案 ? { 图片档案, 最近生图结果: 图片档案.最近生图结果 } : {})
    };
};

const 合并NPC对象 = (leftRaw: any, rightRaw: any, fallbackIndex: number): any => {
    const left = 标准化单个NPC(leftRaw, fallbackIndex);
    const right = 标准化单个NPC(rightRaw, fallbackIndex);
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
    const mergedDebuff = [...标准化NPC状态效果(left?.DEBUFF), ...标准化NPC状态效果(right?.DEBUFF)]
        .filter((item, index, list) => list.findIndex((candidate) => candidate.名称 === item.名称) === index);
    const mergedSkills = 标准化NPC技艺([...标准化NPC技艺(left?.技艺), ...标准化NPC技艺(right?.技艺)]);
    const mergedRelationNet = 合并关系网变量(left?.关系网变量, right?.关系网变量);
    const mergedImageArchive = 合并NPC图片档案对象(left?.图片档案, right?.图片档案);
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
    const mergedBag = mergedRawBag.length > 0 ? mergedRawBag : 生成NPC默认背包({ ...left, ...right });

    return {
        ...left,
        ...right,
        id: 取首个非空文本(right.id, left.id, `npc_${fallbackIndex}`) || `npc_${fallbackIndex}`,
        姓名: 取首个非空文本(right.姓名, left.姓名, `角色${fallbackIndex}`) || `角色${fallbackIndex}`,
        性别: 取更优文本(取字段文本(left, '性别'), 取字段文本(right, '性别')) || '未知',
        年龄: Number.isFinite(Number(right?.年龄))
            ? Number(right.年龄)
            : (Number.isFinite(Number(left?.年龄)) ? Number(left.年龄) : undefined),
        生日: 取更优文本(取字段文本(left, '生日'), 取字段文本(right, '生日')),
        境界: 取更优文本(取字段文本(left, '境界'), 取字段文本(right, '境界')) || '未知境界',
        身份: 取更优文本(取字段文本(left, '身份'), 取字段文本(right, '身份')) || '未知身份',
        是否在场: typeof right?.是否在场 === 'boolean'
            ? right.是否在场
            : (typeof left?.是否在场 === 'boolean' ? left.是否在场 : true),
        是否队友: typeof right?.是否队友 === 'boolean'
            ? right.是否队友
            : (typeof left?.是否队友 === 'boolean' ? left.是否队友 : false),
        是否主要角色: Boolean(left?.是否主要角色) || Boolean(right?.是否主要角色),
        好感度: Number.isFinite(Number(right?.好感度))
            ? Number(right.好感度)
            : (Number.isFinite(Number(left?.好感度)) ? Number(left.好感度) : 0),
        关系状态: 取更优文本(取字段文本(left, '关系状态'), 取字段文本(right, '关系状态')) || '未知',
        对主角称呼: 取更优文本(取字段文本(left, '对主角称呼'), 取字段文本(right, '对主角称呼')),
        简介: 取更优文本(取字段文本(left, '简介'), 取字段文本(right, '简介')) || '暂无简介',
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
        性癖: 取更优文本(读取性癖(left), 读取性癖(right)),
        敏感点: 取更优文本(读取敏感点(left), 读取敏感点(right)),
        子宫: mergedWomb,
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

    list.forEach((rawNpc, index) => {
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

const 规范化社交列表 = (list: any[], options?: { 合并同名?: boolean }): any[] => {
    if (!Array.isArray(list)) return [];
    const normalized = list.map((npc, index) => 标准化单个NPC(npc, index));
    if (options?.合并同名 === false) return normalized;
    return 合并同名NPC列表(normalized);
};

export {
    规范化环境信息,
    构建完整地点文本,
    规范化角色物品容器映射,
    规范化社交列表
};
