import type { 天赋结构, 背景结构, 背景初始物品, 背景开局货币 } from '../types';
import type { 创意工坊模块条目 } from '../data/creativeWorkshopModules';

export type 工坊背景天赋校验问题 = {
    kind: 'missing_builtin_ref' | 'empty_name' | 'invalid_json' | 'invalid_entry';
    message: string;
    backgroundName?: string;
    talentName?: string;
    ref?: string;
    /** 丢弃条目时的下标或标识（作者诊断） */
    index?: number;
    reason?: string;
};

export type 工坊背景天赋校验结果 = {
    backgrounds: 背景结构[];
    talents: 天赋结构[];
    issues: 工坊背景天赋校验问题[];
    ok: boolean;
};

export type 规范化列表结果<T> = {
    items: T[];
    issues: 工坊背景天赋校验问题[];
};

const 规范化文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const 可选正整数 = (value: unknown): number | undefined => {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    const rounded = Math.floor(n);
    if (rounded < 0) return undefined;
    return rounded;
};

const 规范化初始物品列表 = (raw: unknown): 背景初始物品[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const items: 背景初始物品[] = [];
    raw.forEach((entry: any) => {
        const 名称 = 规范化文本(entry?.名称);
        if (!名称) return;
        const 描述 = 规范化文本(entry?.描述);
        const 类型 = 规范化文本(entry?.类型);
        const 数量 = 可选正整数(entry?.数量);
        items.push({
            名称,
            ...(描述 ? { 描述 } : {}),
            ...(类型 ? { 类型 } : {}),
            ...(数量 !== undefined ? { 数量 } : {})
        });
    });
    return items.length > 0 ? items : undefined;
};

const 规范化开局货币列表 = (raw: unknown): 背景开局货币[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const items: 背景开局货币[] = [];
    raw.forEach((entry: any) => {
        const 名称 = 规范化文本(entry?.名称);
        if (!名称) return;
        const 描述 = 规范化文本(entry?.描述);
        const 类型 = 规范化文本(entry?.类型);
        const 数量 = 可选正整数(entry?.数量);
        const 最小数量 = 可选正整数(entry?.最小数量);
        const 最大数量 = 可选正整数(entry?.最大数量);
        items.push({
            名称,
            ...(描述 ? { 描述 } : {}),
            ...(类型 ? { 类型 } : {}),
            ...(数量 !== undefined ? { 数量 } : {}),
            ...(最小数量 !== undefined ? { 最小数量 } : {}),
            ...(最大数量 !== undefined ? { 最大数量 } : {})
        });
    });
    return items.length > 0 ? items : undefined;
};

/** 规范化天赋池条目，保留隐藏/叙事约束；无效条目记 invalid_entry */
export const 规范化工坊天赋列表详细 = (raw: unknown): 规范化列表结果<天赋结构> => {
    if (!Array.isArray(raw)) {
        return {
            items: [],
            issues: raw == null
                ? []
                : [{ kind: 'invalid_entry', message: '天赋池不是数组，已忽略', reason: 'not_array' }]
        };
    }
    const map = new Map<string, 天赋结构>();
    const issues: 工坊背景天赋校验问题[] = [];
    raw.forEach((item: any, index: number) => {
        const 名称 = 规范化文本(item?.名称);
        const 描述 = 规范化文本(item?.描述);
        const 效果 = 规范化文本(item?.效果);
        if (!名称 || !描述 || !效果) {
            const label = 名称 || `(索引 ${index})`;
            const missing: string[] = [];
            if (!名称) missing.push('名称');
            if (!描述) missing.push('描述');
            if (!效果) missing.push('效果');
            issues.push({
                kind: 'invalid_entry',
                message: `天赋条目「${label}」缺少${missing.join('、')}，已丢弃`,
                talentName: 名称 || undefined,
                index,
                reason: `missing:${missing.join(',')}`
            });
            return;
        }
        if (map.has(名称)) {
            issues.push({
                kind: 'invalid_entry',
                message: `天赋条目「${名称}」名称重复，已保留最后一条`,
                talentName: 名称,
                index,
                reason: 'duplicate_name'
            });
        }
        const 叙事约束 = 规范化文本(item?.叙事约束);
        map.set(名称, {
            名称,
            描述,
            效果,
            ...(叙事约束 ? { 叙事约束 } : {}),
            ...(item?.隐藏 === true ? { 隐藏: true } : {})
        });
    });
    return { items: Array.from(map.values()), issues };
};

export const 规范化工坊天赋列表 = (raw: unknown): 天赋结构[] => (
    规范化工坊天赋列表详细(raw).items
);

/** 规范化背景池条目；不扩散未知字段，仅保留校验后的扩展形状 */
export const 规范化工坊背景列表详细 = (raw: unknown): 规范化列表结果<背景结构> => {
    if (!Array.isArray(raw)) {
        return {
            items: [],
            issues: raw == null
                ? []
                : [{ kind: 'invalid_entry', message: '背景池不是数组，已忽略', reason: 'not_array' }]
        };
    }
    const map = new Map<string, 背景结构>();
    const issues: 工坊背景天赋校验问题[] = [];
    raw.forEach((item: any, index: number) => {
        const 名称 = 规范化文本(item?.名称);
        const 描述 = 规范化文本(item?.描述);
        const 效果 = 规范化文本(item?.效果);
        if (!名称 || !描述 || !效果) {
            const label = 名称 || `(索引 ${index})`;
            const missing: string[] = [];
            if (!名称) missing.push('名称');
            if (!描述) missing.push('描述');
            if (!效果) missing.push('效果');
            issues.push({
                kind: 'invalid_entry',
                message: `背景条目「${label}」缺少${missing.join('、')}，已丢弃`,
                backgroundName: 名称 || undefined,
                index,
                reason: `missing:${missing.join(',')}`
            });
            return;
        }
        const 自带天赋 = Array.isArray(item?.自带天赋)
            ? item.自带天赋
                .map((name: unknown) => 规范化文本(name))
                .filter((name: string) => {
                    if (name) return true;
                    issues.push({
                        kind: 'empty_name',
                        message: `背景「${名称}」的自带天赋存在空引用，已忽略`,
                        backgroundName: 名称
                    });
                    return false;
                })
            : undefined;
        const 初始物品 = 规范化初始物品列表(item?.初始物品);
        const 可选初始物品 = 规范化初始物品列表(item?.可选初始物品);
        const 开局货币 = 规范化开局货币列表(item?.开局货币);
        const next: 背景结构 = {
            名称,
            描述,
            效果,
            ...(自带天赋 && 自带天赋.length > 0 ? { 自带天赋 } : {}),
            ...(初始物品 ? { 初始物品 } : {}),
            ...(可选初始物品 ? { 可选初始物品 } : {}),
            ...(开局货币 ? { 开局货币 } : {})
        };
        if (map.has(名称)) {
            issues.push({
                kind: 'invalid_entry',
                message: `背景条目「${名称}」名称重复，已保留最后一条`,
                backgroundName: 名称,
                index,
                reason: 'duplicate_name'
            });
        }
        map.set(名称, next);
    });
    return { items: Array.from(map.values()), issues };
};

export const 规范化工坊背景列表 = (raw: unknown): 背景结构[] => (
    规范化工坊背景列表详细(raw).items
);

/** 校验背景自带引用是否都能在天赋池中 resolve */
export const 校验背景自带天赋引用 = (
    backgrounds: 背景结构[],
    talents: 天赋结构[]
): 工坊背景天赋校验问题[] => {
    const talentNames = new Set(
        (Array.isArray(talents) ? talents : [])
            .map((item) => 规范化文本(item?.名称))
            .filter(Boolean)
    );
    const issues: 工坊背景天赋校验问题[] = [];
    (Array.isArray(backgrounds) ? backgrounds : []).forEach((bg) => {
        const backgroundName = 规范化文本(bg?.名称) || '(未命名背景)';
        const refs = Array.isArray(bg?.自带天赋) ? bg.自带天赋 : [];
        refs.forEach((ref) => {
            const name = 规范化文本(ref);
            if (!name) {
                issues.push({
                    kind: 'empty_name',
                    message: `背景「${backgroundName}」存在空的自带天赋引用`,
                    backgroundName
                });
                return;
            }
            if (!talentNames.has(name)) {
                issues.push({
                    kind: 'missing_builtin_ref',
                    message: `背景「${backgroundName}」自带天赋「${name}」不在天赋池中`,
                    backgroundName,
                    ref: name
                });
            }
        });
    });
    return issues;
};

export const 校验工坊背景天赋池 = (params: {
    backgrounds?: unknown;
    talents?: unknown;
}): 工坊背景天赋校验结果 => {
    const bgResult = 规范化工坊背景列表详细(params.backgrounds);
    const talentResult = 规范化工坊天赋列表详细(params.talents);
    const refIssues = 校验背景自带天赋引用(bgResult.items, talentResult.items);
    const issues = [...bgResult.issues, ...talentResult.issues, ...refIssues];
    return {
        backgrounds: bgResult.items,
        talents: talentResult.items,
        issues,
        ok: issues.length === 0
    };
};

/** 从模块 payload / 顶层提取背景与天赋池 */
export const 从创意工坊模块提取背景天赋池 = (
    entry: 创意工坊模块条目 | null | undefined
): { backgrounds: 背景结构[]; talents: 天赋结构[] } => {
    if (!entry) return { backgrounds: [], talents: [] };
    const payload = entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
        ? entry.payload as Record<string, unknown>
        : {};
    const backgrounds = 规范化工坊背景列表(
        Array.isArray(payload.backgrounds) ? payload.backgrounds : (entry as any).backgrounds
    );
    const talents = 规范化工坊天赋列表(
        Array.isArray(payload.talents) ? payload.talents : (entry as any).talents
    );
    return { backgrounds, talents };
};

export const 校验创意工坊模块背景天赋 = (
    entry: 创意工坊模块条目 | null | undefined
): 工坊背景天赋校验结果 => {
    const { backgrounds, talents } = 从创意工坊模块提取背景天赋池(entry);
    return 校验工坊背景天赋池({ backgrounds, talents });
};

/** 兼容简版 normalize（仅 items）与 detailed（items+issues） */
const 应用工坊池规范化 = <T,>(
    raw: unknown,
    normalize: (raw: unknown) => 规范化列表结果<T> | T[]
): 规范化列表结果<T> => {
    const result = normalize(raw);
    if (Array.isArray(result)) {
        return { items: result, issues: [] };
    }
    return {
        items: Array.isArray(result?.items) ? result.items : [],
        issues: Array.isArray(result?.issues) ? result.issues : []
    };
};

/** 解析作者填写的 JSON 池（数组或 { backgrounds/talents }）；透出规范化阶段 issues */
export const 解析工坊池JSON = <T,>(
    text: string,
    kind: 'backgrounds' | 'talents',
    normalize: (raw: unknown) => 规范化列表结果<T> | T[]
): { items: T[]; issues: 工坊背景天赋校验问题[]; error?: string; rawError?: string } => {
    const trimmed = (text || '').trim();
    if (!trimmed) return { items: [], issues: [] };
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const result = 应用工坊池规范化(parsed, normalize);
            return { items: result.items, issues: result.issues };
        }
        if (parsed && typeof parsed === 'object') {
            const key = kind === 'backgrounds' ? 'backgrounds' : 'talents';
            const nested = (parsed as any)[key];
            if (Array.isArray(nested)) {
                const result = 应用工坊池规范化(nested, normalize);
                return { items: result.items, issues: result.issues };
            }
            // 允许单对象直接当作一条
            if (规范化文本((parsed as any).名称)) {
                const result = 应用工坊池规范化([parsed], normalize);
                return { items: result.items, issues: result.issues };
            }
            return {
                items: [],
                issues: [],
                error: kind === 'backgrounds'
                    ? 'JSON 需为背景数组，或形如 { "backgrounds": [...] } 的对象'
                    : 'JSON 需为天赋数组，或形如 { "talents": [...] } 的对象'
            };
        }
        return {
            items: [],
            issues: [],
            error: 'JSON 顶层类型无效，请使用数组或包含池字段的对象'
        };
    } catch (error) {
        const rawError = error instanceof Error ? error.message : String(error || '');
        return {
            items: [],
            issues: [],
            error: '背景/天赋池 JSON 无法解析，请检查括号、逗号与引号是否成对',
            rawError: rawError || undefined
        };
    }
};

export const 格式化背景天赋池JSON = (items: unknown[]): string => (
    JSON.stringify(Array.isArray(items) ? items : [], null, 2)
);

export const 构建背景天赋池摘要行 = (params: {
    backgrounds: 背景结构[];
    talents: 天赋结构[];
    issues?: 工坊背景天赋校验问题[];
}): string[] => {
    const backgrounds = Array.isArray(params.backgrounds) ? params.backgrounds : [];
    const talents = Array.isArray(params.talents) ? params.talents : [];
    const hiddenCount = talents.filter((item) => item.隐藏 === true).length;
    const builtinBgCount = backgrounds.filter((item) => Array.isArray(item.自带天赋) && item.自带天赋!.length > 0).length;
    const lines = [
        `出身背景池：${backgrounds.length} 项${builtinBgCount > 0 ? `（含自带引用 ${builtinBgCount}）` : ''}`,
        `天赋池：${talents.length} 项${hiddenCount > 0 ? `（隐藏 ${hiddenCount}）` : ''}`
    ];
    backgrounds.slice(0, 8).forEach((bg) => {
        const refs = Array.isArray(bg.自带天赋) && bg.自带天赋.length > 0
            ? ` · 自带:${bg.自带天赋.join('、')}`
            : '';
        lines.push(`  背景｜${bg.名称}${refs}`);
    });
    if (backgrounds.length > 8) lines.push(`  …另有 ${backgrounds.length - 8} 个背景`);
    talents.slice(0, 8).forEach((talent) => {
        lines.push(`  天赋｜${talent.名称}${talent.隐藏 ? '（隐藏）' : ''}`);
    });
    if (talents.length > 8) lines.push(`  …另有 ${talents.length - 8} 个天赋`);
    const issues = params.issues || 校验背景自带天赋引用(backgrounds, talents);
    if (issues.length > 0) {
        lines.push(`校验警告：${issues.length} 项`);
        issues.slice(0, 6).forEach((issue) => lines.push(`  ! ${issue.message}`));
        if (issues.length > 6) lines.push(`  …另有 ${issues.length - 6} 条警告`);
    }
    return lines;
};

export const 格式化背景天赋校验状态文案 = (issues: 工坊背景天赋校验问题[]): string => {
    if (!issues.length) return '';
    return `背景/天赋池校验：${issues.slice(0, 3).map((item) => item.message).join('；')}${issues.length > 3 ? ` 等 ${issues.length} 项` : ''}`;
};
