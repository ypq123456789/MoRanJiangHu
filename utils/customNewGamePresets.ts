import type { 开局预设方案结构 } from '../data/newGamePresets';
import { 属性最大值, 属性最小值, 规范化可选开局配置 } from './openingConfig';

export const 自定义开局预设存储键 = 'new_game_custom_start_presets';

const 属性键列表 = ['力量', '敏捷', '体质', '根骨', '悟性', '福源'] as const;

const 标准化文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 标准化数值 = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

export const 生成自定义开局预设ID = (): string => `custom_start_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const 标准化开局预设方案 = (raw: any): 开局预设方案结构 | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const id = 标准化文本(raw.id) || 生成自定义开局预设ID();
    const 名称 = 标准化文本(raw.名称);
    if (!名称) return null;

    const 属性 = 属性键列表.reduce((acc, key) => {
        acc[key] = 标准化数值(raw?.character?.属性?.[key], 属性最小值, 属性最小值, 属性最大值);
        return acc;
    }, {} as 开局预设方案结构['character']['属性']);

    return {
        id,
        名称,
        简介: 标准化文本(raw.简介) || '自定义开局方案',
        worldConfig: {
            worldName: 标准化文本(raw?.worldConfig?.worldName),
            worldSize: raw?.worldConfig?.worldSize === '弹丸之地' || raw?.worldConfig?.worldSize === '九州宏大' || raw?.worldConfig?.worldSize === '无尽位面'
                ? raw.worldConfig.worldSize
                : '九州宏大',
            dynastySetting: 标准化文本(raw?.worldConfig?.dynastySetting),
            sectDensity: raw?.worldConfig?.sectDensity === '稀少' || raw?.worldConfig?.sectDensity === '适中' || raw?.worldConfig?.sectDensity === '林立'
                ? raw.worldConfig.sectDensity
                : '林立',
            tianjiaoSetting: 标准化文本(raw?.worldConfig?.tianjiaoSetting),
            difficulty: raw?.worldConfig?.difficulty === 'relaxed' || raw?.worldConfig?.difficulty === 'easy' || raw?.worldConfig?.difficulty === 'normal' || raw?.worldConfig?.difficulty === 'hard' || raw?.worldConfig?.difficulty === 'extreme'
                ? raw.worldConfig.difficulty
                : 'normal',
            worldExtraRequirement: 标准化文本(raw?.worldConfig?.worldExtraRequirement),
            manualWorldPrompt: 标准化文本(raw?.worldConfig?.manualWorldPrompt),
            manualRealmPrompt: 标准化文本(raw?.worldConfig?.manualRealmPrompt)
        },
        character: {
            姓名: 标准化文本(raw?.character?.姓名),
            性别: 标准化文本(raw?.character?.性别) || '男',
            年龄: 标准化数值(raw?.character?.年龄, 18, 1, 999),
            出生月: 标准化数值(raw?.character?.出生月, 1, 1, 12),
            出生日: 标准化数值(raw?.character?.出生日, 1, 1, 31),
            外貌: 标准化文本(raw?.character?.外貌),
            性格: 标准化文本(raw?.character?.性格),
            属性,
            背景名称: 标准化文本(raw?.character?.背景名称),
            天赋名称列表: Array.isArray(raw?.character?.天赋名称列表)
                ? raw.character.天赋名称列表.map((item: unknown) => 标准化文本(item)).filter(Boolean).slice(0, 3)
                : []
        },
        openingConfig: 规范化可选开局配置(raw?.openingConfig),
        openingStreaming: raw?.openingStreaming !== false,
        openingExtraRequirement: 标准化文本(raw?.openingExtraRequirement)
    };
};

export const 合并去重开局预设方案 = (rawList: 开局预设方案结构[]): 开局预设方案结构[] => {
    const map = new Map<string, 开局预设方案结构>();
    rawList.forEach((item) => {
        const normalized = 标准化开局预设方案(item);
        if (!normalized) return;
        map.set(normalized.id, normalized);
    });
    return Array.from(map.values());
};
