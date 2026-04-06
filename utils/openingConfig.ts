import type {
    OpeningConfig,
    同人角色替换规则结构,
    游戏难度,
    初始关系模板类型,
    关系侧重类型,
    开局切入偏好类型,
    同人来源类型,
    同人融合强度类型
} from '../types';

export const 新开局步骤列表 = ['世界观', '角色基础', '天赋背景', '开局配置', '确认生成'] as const;

export const 属性键列表 = ['力量', '敏捷', '体质', '根骨', '悟性', '福源'] as const;
export const 默认属性值 = 3;
export const 属性最小值 = 3;
export const 属性最大值 = 10;

export const 难度总属性点映射: Record<游戏难度, number> = {
    relaxed: 38,
    easy: 34,
    normal: 30,
    hard: 26,
    extreme: 22
};

export const 初始关系模板选项: Array<{ value: 初始关系模板类型; label: string; hint: string }> = [
    { value: '独行少系', label: '独行少系', hint: '初始社交网收束为 1~2 人，更偏向孤身闯荡。' },
    { value: '家族牵引', label: '家族牵引', hint: '优先生成家人、族人、旧宅与家业压力。' },
    { value: '师门牵引', label: '师门牵引', hint: '优先生成师父、同门、门规与门内承接。' },
    { value: '世家官门', label: '世家官门', hint: '偏向门第、人脉、礼法与现实资源网络。' },
    { value: '青梅旧识', label: '青梅旧识', hint: '优先生成旧交、故人和情感承接线。' },
    { value: '旧仇旧债', label: '旧仇旧债', hint: '开局社会关系带着旧账、旧怨与压力源。' }
];

export const 关系侧重选项: Array<{ value: 关系侧重类型; label: string }> = [
    { value: '亲情', label: '亲情' },
    { value: '友情', label: '友情' },
    { value: '师门', label: '师门' },
    { value: '情缘', label: '情缘' },
    { value: '利益', label: '利益' },
    { value: '仇怨', label: '仇怨' }
];

export const 开局切入偏好选项: Array<{ value: 开局切入偏好类型; label: string; hint: string }> = [
    { value: '日常低压', label: '日常低压', hint: '优先从生活流、环境感和轻关系起步。' },
    { value: '在途起手', label: '在途起手', hint: '开局落在赶路、渡口、驿路、山道等途中场景。' },
    { value: '家宅起手', label: '家宅起手', hint: '优先落在卧房、院落、铺面、旧宅等内场。' },
    { value: '门派起手', label: '门派起手', hint: '优先落在山门、偏院、堂口、习武地等门派场景。' },
    { value: '风波前夜', label: '风波前夜', hint: '允许有将起未起的异动，但仍保持第一幕克制。' }
];

export const 同人来源类型选项: Array<{ value: 同人来源类型; label: string }> = [
    { value: '小说', label: '小说' },
    { value: '动漫', label: '动漫' },
    { value: '游戏', label: '游戏' },
    { value: '影视', label: '影视' }
];

export const 同人融合强度选项: Array<{ value: 同人融合强度类型; label: string; hint: string }> = [
    { value: '轻度映射', label: '轻度映射', hint: '只借设定气质与世界母题，不直接搬角色。' },
    { value: '中度混编', label: '中度混编', hint: '允许部分势力、设定和风格直接进入原创世界。' },
    { value: '显性同台', label: '显性同台', hint: '允许原著角色或势力直接以世界母本形式存在。' }
];

export const 默认开局配置 = (): OpeningConfig => ({
    初始关系模板: '师门牵引',
    关系侧重: ['师门', '友情'],
    开局切入偏好: '日常低压',
    同人融合: {
        enabled: false,
        作品名: '',
        来源类型: '小说',
        融合强度: '轻度映射',
        保留原著角色: false,
        启用角色替换: false,
        替换目标角色名: '',
        附加替换角色名列表: [],
        附加角色替换规则列表: [],
        启用附加小说: false,
        附加小说数据集ID: ''
    }
});

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 角色替换名称分隔正则 = /[\r\n,，、;；]+/u;

export const 规范化角色替换名称列表 = (value: unknown): string[] => {
    const rawList = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(角色替换名称分隔正则)
            : [];
    const result: string[] = [];
    const seen = new Set<string>();
    rawList.forEach((item) => {
        const name = 读取文本(item);
        if (!name || seen.has(name)) return;
        seen.add(name);
        result.push(name);
    });
    return result;
};

export const 规范化角色替换规则列表 = (value: unknown): 同人角色替换规则结构[] => {
    const source = Array.isArray(value) ? value : [];
    const result: 同人角色替换规则结构[] = [];
    source.forEach((item) => {
        const 原名称 = 读取文本((item as 同人角色替换规则结构 | null | undefined)?.原名称);
        const 替换为 = 读取文本((item as 同人角色替换规则结构 | null | undefined)?.替换为);
        if (!原名称 || !替换为) return;
        result.push({ 原名称, 替换为 });
    });
    return result;
};

export const 获取同人角色替换规则列表 = (
    config?: OpeningConfig | null,
    playerName?: string
): 同人角色替换规则结构[] => {
    const ruleMap = new Map<string, string>();
    const resolvedPlayerName = 读取文本(playerName);
    const 写入规则 = (原名称: unknown, 替换为: unknown) => {
        const sourceName = 读取文本(原名称);
        const replacementName = 读取文本(替换为);
        if (!sourceName || !replacementName || sourceName === replacementName) return;
        ruleMap.set(sourceName, replacementName);
    };

    写入规则(config?.同人融合?.替换目标角色名, resolvedPlayerName);
    规范化角色替换名称列表(config?.同人融合?.附加替换角色名列表)
        .forEach((name) => 写入规则(name, resolvedPlayerName));
    规范化角色替换规则列表(config?.同人融合?.附加角色替换规则列表)
        .forEach((rule) => 写入规则(rule.原名称, rule.替换为));

    return Array.from(ruleMap.entries()).map(([原名称, 替换为]) => ({ 原名称, 替换为 }));
};

export const 格式化角色替换规则摘要 = (
    rules: 同人角色替换规则结构[],
    options?: { maxItems?: number }
): string => {
    const list = 规范化角色替换规则列表(rules).map((rule) => `${rule.原名称} -> ${rule.替换为}`);
    if (list.length <= 0) return '';
    const maxItems = Math.max(1, Math.floor(options?.maxItems || 3));
    if (list.length <= maxItems) return list.join('；');
    return `${list.slice(0, maxItems).join('；')} 等${list.length}项`;
};

export const 获取难度总属性点 = (difficulty?: 游戏难度): number => (
    难度总属性点映射[difficulty || 'normal'] || 难度总属性点映射.normal
);

export const 创建默认属性分配 = () => ({
    力量: 默认属性值,
    敏捷: 默认属性值,
    体质: 默认属性值,
    根骨: 默认属性值,
    悟性: 默认属性值,
    福源: 默认属性值
});

export const 规范化开局配置 = (raw?: any): OpeningConfig => {
    const fallback = 默认开局配置();
    const 初始关系模板 = 初始关系模板选项.some((item) => item.value === raw?.初始关系模板)
        ? raw.初始关系模板
        : fallback.初始关系模板;
    const 关系侧重 = Array.isArray(raw?.关系侧重)
        ? raw.关系侧重
            .map((item: unknown) => 读取文本(item))
            .filter((item: string): item is 关系侧重类型 => 关系侧重选项.some((option) => option.value === item))
            .slice(0, 2)
        : fallback.关系侧重;
    const 开局切入偏好 = 开局切入偏好选项.some((item) => item.value === raw?.开局切入偏好)
        ? raw.开局切入偏好
        : fallback.开局切入偏好;
    const 来源类型 = 同人来源类型选项.some((item) => item.value === raw?.同人融合?.来源类型)
        ? raw.同人融合.来源类型
        : fallback.同人融合.来源类型;
    const 融合强度 = 同人融合强度选项.some((item) => item.value === raw?.同人融合?.融合强度)
        ? raw.同人融合.融合强度
        : fallback.同人融合.融合强度;

    return {
        初始关系模板,
        关系侧重: 关系侧重.length > 0 ? 关系侧重 : fallback.关系侧重,
        开局切入偏好,
        同人融合: {
            enabled: raw?.同人融合?.enabled === true,
            作品名: 读取文本(raw?.同人融合?.作品名),
            来源类型,
            融合强度,
            保留原著角色: raw?.同人融合?.保留原著角色 === true,
            启用角色替换: raw?.同人融合?.启用角色替换 === true,
            替换目标角色名: 读取文本(raw?.同人融合?.替换目标角色名),
            附加替换角色名列表: 规范化角色替换名称列表(raw?.同人融合?.附加替换角色名列表),
            附加角色替换规则列表: 规范化角色替换规则列表(raw?.同人融合?.附加角色替换规则列表),
            启用附加小说: raw?.同人融合?.启用附加小说 === true,
            附加小说数据集ID: 读取文本(raw?.同人融合?.附加小说数据集ID)
        }
    };
};

export const 规范化可选开局配置 = (raw?: any): OpeningConfig | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    return 规范化开局配置(raw);
};
