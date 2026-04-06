import { 角色数据结构, 环境信息结构, 装备槽位 } from '../../types';
import { normalizeCanonicalGameTime, 结构化时间转标准串 } from './timeUtils';
import { 压缩图片资源字段 } from '../../utils/imageAssets';

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

    const rawEquip = role?.装备 && typeof role.装备 === 'object' ? role.装备 : ({} as any);
    role.装备 = { ...默认装备模板, ...(rawEquip as any) };

    const sourceList = Array.isArray(role?.物品列表) ? role.物品列表 : [];

    const deduped: any[] = [];
    const seenIds = new Set<string>();
    sourceList.forEach((item: any, idx: number) => {
        const id = typeof item?.ID === 'string' && item.ID.trim().length > 0
            ? item.ID.trim()
            : `itm_auto_${idx}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        deduped.push({ ...item, ID: id });
    });

    const itemById = new Map<string, any>(deduped.map((item) => [item.ID, item]));

    const findItemByRef = (idOrName: string): any | undefined => {
        return itemById.get(idOrName) || deduped.find((item) => item?.名称 === idOrName);
    };
    const createFallbackEquippedItem = (slot: 装备槽位, itemName: string): any => {
        let baseId = `itm_auto_equip_${槽位ID片段映射[slot]}`;
        let candidate = baseId;
        let suffix = 1;
        while (seenIds.has(candidate)) {
            candidate = `${baseId}_${suffix++}`;
        }
        seenIds.add(candidate);
        const type = 槽位类型映射[slot];
        const generated: any = {
            ID: candidate,
            名称: itemName,
            描述: `由装备栏位自动补全的${slot}装备。`,
            类型: type,
            品质: '凡品',
            重量: slot === '坐骑' ? 30 : 1,
            堆叠数量: 1,
            是否可堆叠: false,
            价值: 0,
            当前耐久: 100,
            最大耐久: 100,
            词条列表: [],
            当前装备部位: slot
        };
        if (type === '武器') {
            generated.武器子类 = slot === '暗器' ? '暗器' : '剑';
            generated.最小攻击 = 1;
            generated.最大攻击 = 3;
            generated.攻速修正 = 1;
            generated.格挡率 = 0;
        }
        if (type === '防具') {
            const 防具位置映射: Record<string, '头部' | '胸部' | '腿部' | '手部' | '足部'> = {
                头部: '头部',
                胸部: '胸部',
                盔甲: '胸部',
                内衬: '胸部',
                腿部: '腿部',
                手部: '手部',
                足部: '足部'
            };
            generated.装备位置 = 防具位置映射[slot] || '胸部';
            generated.覆盖部位 = slot === '头部'
                ? ['头部']
                : slot === '胸部' || slot === '盔甲' || slot === '内衬'
                    ? ['胸部', '腹部']
                    : slot === '腿部'
                        ? ['左腿', '右腿']
                        : slot === '手部'
                            ? ['左臂', '右臂', '手掌']
                            : ['足部'];
            generated.物理防御 = 1;
            generated.内功防御 = 1;
        }
        deduped.push(generated);
        itemById.set(candidate, generated);
        return generated;
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
        const matched = findItemByRef(normalizedRef) || createFallbackEquippedItem(slot, normalizedRef);
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
        // 清理旧容器字段
        delete item.当前容器ID;
        delete item.容器属性;
        delete item.占用空间;
    });

    // 重新计算负重 (Weight Recalculation)
    const totalWeight = deduped.reduce((sum, item) => {
        const weight = Number(item.重量) || 0;
        const count = Number(item.堆叠数量) || 1;
        return sum + (weight * count);
    }, 0);
    
    // 保留一位小数
    role.当前负重 = Math.round(totalWeight * 10) / 10;

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
        攻击力: Number.isFinite(Number(npc?.攻击力)) ? Number(npc.攻击力) : undefined,
        防御力: Number.isFinite(Number(npc?.防御力)) ? Number(npc.防御力) : undefined,
        当前血量: Number.isFinite(Number(npc?.当前血量)) ? Number(npc.当前血量) : undefined,
        最大血量: Number.isFinite(Number(npc?.最大血量)) ? Number(npc.最大血量) : undefined,
        当前精力: Number.isFinite(Number(npc?.当前精力)) ? Number(npc.当前精力) : undefined,
        最大精力: Number.isFinite(Number(npc?.最大精力)) ? Number(npc.最大精力) : undefined,
        当前内力: Number.isFinite(Number(npc?.当前内力)) ? Number(npc.当前内力) : undefined,
        最大内力: Number.isFinite(Number(npc?.最大内力)) ? Number(npc.最大内力) : undefined,
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
        const leftEquip = left?.当前装备 && typeof left.当前装备 === 'object' ? left.当前装备 : undefined;
        const rightEquip = right?.当前装备 && typeof right.当前装备 === 'object' ? right.当前装备 : undefined;
        if (!leftEquip && !rightEquip) return undefined;
        const keys = ['主武器', '副武器', '服装', '饰品', '内衣', '内裤', '袜饰', '鞋履'];
        const out: Record<string, string> = {};
        keys.forEach((k) => {
            const text = 取更优文本(取字段文本(leftEquip, k), 取字段文本(rightEquip, k));
            if (text) out[k] = text;
        });
        return Object.keys(out).length > 0 ? out : undefined;
    })();
    const mergedRelationNet = 合并关系网变量(left?.关系网变量, right?.关系网变量);
    const mergedImageArchive = 合并NPC图片档案对象(left?.图片档案, right?.图片档案);

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
        攻击力: Number.isFinite(Number(right?.攻击力))
            ? Number(right.攻击力)
            : (Number.isFinite(Number(left?.攻击力)) ? Number(left.攻击力) : undefined),
        防御力: Number.isFinite(Number(right?.防御力))
            ? Number(right.防御力)
            : (Number.isFinite(Number(left?.防御力)) ? Number(left.防御力) : undefined),
        上次更新时间: (() => {
            const l = 解析任意时间字段(left?.上次更新时间 ?? left?.最后更新时间 ?? left?.更新时间);
            const r = 解析任意时间字段(right?.上次更新时间 ?? right?.最后更新时间 ?? right?.更新时间);
            return 取更优文本(l, r);
        })(),
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
            : (Number.isFinite(Number(left?.最大内力)) ? Number(left.最大内力) : undefined),
        当前装备: mergedEquip,
        背包: 合并字符串数组(left?.背包, right?.背包),
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
