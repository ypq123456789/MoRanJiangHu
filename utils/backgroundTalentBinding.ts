import type { 天赋结构, 背景结构 } from '../types';

const 规范化名称 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

/** 选择池：排除隐藏天赋 */
export const 过滤可见天赋 = (talents: 天赋结构[]): 天赋结构[] => (
    (Array.isArray(talents) ? talents : []).filter((item) => item?.隐藏 !== true)
);

/** 按名称目录解析背景自带天赋引用；失败则跳过 */
export const 解析背景自带天赋 = (
    background: 背景结构 | null | undefined,
    catalog: 天赋结构[]
): 天赋结构[] => {
    const refs = Array.isArray(background?.自带天赋) ? background!.自带天赋 : [];
    if (refs.length === 0) return [];
    const byName = new Map<string, 天赋结构>();
    (Array.isArray(catalog) ? catalog : []).forEach((item) => {
        const name = 规范化名称(item?.名称);
        if (!name || byName.has(name)) return;
        byName.set(name, item);
    });
    const resolved: 天赋结构[] = [];
    const seen = new Set<string>();
    refs.forEach((ref) => {
        const name = 规范化名称(ref);
        if (!name || seen.has(name)) return;
        const hit = byName.get(name);
        if (!hit) return;
        seen.add(name);
        resolved.push(hit);
    });
    return resolved;
};

/** 按名称去重合并天赋列表（保留先出现的定义） */
export const 按名称去重天赋 = (list: 天赋结构[]): 天赋结构[] => {
    const map = new Map<string, 天赋结构>();
    (Array.isArray(list) ? list : []).forEach((item) => {
        const name = 规范化名称(item?.名称);
        if (!name || map.has(name)) return;
        map.set(name, item);
    });
    return Array.from(map.values());
};

/**
 * 最终天赋 = 玩家自选 ∪ resolve(背景.自带天赋)
 * 同名一条；自带不互斥玩家其它选择。
 */
export const 合并玩家与背景天赋 = (params: {
    玩家自选: 天赋结构[];
    背景: 背景结构 | null | undefined;
    天赋目录: 天赋结构[];
}): 天赋结构[] => {
    const builtin = 解析背景自带天赋(params.背景, params.天赋目录);
    return 按名称去重天赋([
        ...(Array.isArray(params.玩家自选) ? params.玩家自选 : []),
        ...builtin
    ]);
};

/** 统计玩家自选数量（用于可选上限；自带不计入） */
export const 统计玩家自选天赋数量 = (玩家自选: 天赋结构[]): number => (
    按名称去重天赋(玩家自选).length
);

/**
 * 换背景：玩家自选层保持不变；最终列表按新背景重新合并自带层。
 * 约定调用方的 玩家自选 不含「仅背景附带」项。
 */
export const 更换背景后的天赋列表 = (params: {
    旧背景?: 背景结构 | null;
    新背景: 背景结构 | null | undefined;
    玩家自选: 天赋结构[];
    天赋目录: 天赋结构[];
}): { 玩家自选: 天赋结构[]; 最终列表: 天赋结构[]; 背景自带: 天赋结构[] } => {
    const 玩家自选 = 按名称去重天赋(params.玩家自选);
    const 背景自带 = 解析背景自带天赋(params.新背景, params.天赋目录);
    const 最终列表 = 合并玩家与背景天赋({
        玩家自选,
        背景: params.新背景,
        天赋目录: params.天赋目录
    });
    return { 玩家自选, 最终列表, 背景自带 };
};

/** 判断某天赋名称是否为当前背景自带（用于 UI 标注/禁止取消） */
export const 是否背景自带天赋 = (
    talentName: string,
    background: 背景结构 | null | undefined
): boolean => {
    const name = 规范化名称(talentName);
    if (!name || !Array.isArray(background?.自带天赋)) return false;
    return background!.自带天赋.some((ref) => 规范化名称(ref) === name);
};
