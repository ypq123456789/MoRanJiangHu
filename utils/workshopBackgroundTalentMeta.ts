import type { 天赋结构, 背景结构 } from '../types';
import type { 创意工坊模块条目 } from '../data/creativeWorkshopModules';

export type 工坊背景天赋校验问题 = {
    kind: 'missing_builtin_ref' | 'empty_name' | 'invalid_json';
    message: string;
    backgroundName?: string;
    talentName?: string;
    ref?: string;
};

export type 工坊背景天赋校验结果 = {
    backgrounds: 背景结构[];
    talents: 天赋结构[];
    issues: 工坊背景天赋校验问题[];
    ok: boolean;
};

const 规范化文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

/** 规范化天赋池条目，保留隐藏/叙事约束 */
export const 规范化工坊天赋列表 = (raw: unknown): 天赋结构[] => {
    if (!Array.isArray(raw)) return [];
    const map = new Map<string, 天赋结构>();
    raw.forEach((item: any) => {
        const 名称 = 规范化文本(item?.名称);
        const 描述 = 规范化文本(item?.描述);
        const 效果 = 规范化文本(item?.效果);
        if (!名称 || !描述 || !效果) return;
        const 叙事约束 = 规范化文本(item?.叙事约束);
        map.set(名称, {
            名称,
            描述,
            效果,
            ...(叙事约束 ? { 叙事约束 } : {}),
            ...(item?.隐藏 === true ? { 隐藏: true } : {})
        });
    });
    return Array.from(map.values());
};

/** 规范化背景池条目，保留自带天赋引用 */
export const 规范化工坊背景列表 = (raw: unknown): 背景结构[] => {
    if (!Array.isArray(raw)) return [];
    const map = new Map<string, 背景结构>();
    raw.forEach((item: any) => {
        const 名称 = 规范化文本(item?.名称);
        const 描述 = 规范化文本(item?.描述);
        const 效果 = 规范化文本(item?.效果);
        if (!名称 || !描述 || !效果) return;
        const 自带天赋 = Array.isArray(item?.自带天赋)
            ? item.自带天赋.map((name: unknown) => 规范化文本(name)).filter(Boolean)
            : undefined;
        map.set(名称, {
            ...((item && typeof item === 'object' && !Array.isArray(item)) ? item : {}),
            名称,
            描述,
            效果,
            ...(自带天赋 && 自带天赋.length > 0 ? { 自带天赋 } : { 自带天赋: undefined })
        } as 背景结构);
        const stored = map.get(名称)!;
        if (!自带天赋 || 自带天赋.length === 0) {
            delete (stored as any).自带天赋;
        }
    });
    return Array.from(map.values());
};

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
    const backgrounds = 规范化工坊背景列表(params.backgrounds);
    const talents = 规范化工坊天赋列表(params.talents);
    const issues = 校验背景自带天赋引用(backgrounds, talents);
    return {
        backgrounds,
        talents,
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

/** 解析作者填写的 JSON 池（数组或 { backgrounds/talents }） */
export const 解析工坊池JSON = <T>(
    text: string,
    kind: 'backgrounds' | 'talents',
    normalize: (raw: unknown) => T[]
): { items: T[]; error?: string } => {
    const trimmed = (text || '').trim();
    if (!trimmed) return { items: [] };
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return { items: normalize(parsed) };
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any)[kind])) {
            return { items: normalize((parsed as any)[kind]) };
        }
        return { items: [], error: `${kind} JSON 需为数组，或含 ${kind} 数组的对象` };
    } catch (error: any) {
        return { items: [], error: error?.message || `${kind} JSON 解析失败` };
    }
};

export const 格式化背景天赋池JSON = (items: unknown[]): string => {
    if (!Array.isArray(items) || items.length === 0) return '';
    try {
        return JSON.stringify(items, null, 2);
    } catch {
        return '';
    }
};

/** 预览用短摘要行 */
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
