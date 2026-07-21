import type { OpeningConfig, OpeningRuntimeSnapshot, 天赋结构, 背景结构, ModeRuntimeProfile, 世界书结构 } from '../types';
import type { 开局预设方案结构 } from '../data/newGamePresets';
import { 创意工坊模块列表, type 创意工坊模块条目 } from '../data/creativeWorkshopModules';
import { 读取本地创意工坊模块 } from '../services/creativeWorkshop';
import { 获取题材预设背景, 获取题材预设天赋 } from '../data/presets';
import { 属性最大值, 属性最小值, 规范化可选开局配置 } from './openingConfig';
import { 过滤玩家可自选天赋 } from './backgroundTalentBinding';
import { 规范化模式运行时配置 } from './modeRuntimeProfile';
import { normalizeRealmDraft, normalizeWorldMapDraft } from './newGameDiy';
import { 规范化题材模式 } from './topicModeProfiles';

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
    const openingConfig = 规范化可选开局配置(raw?.openingConfig);
    const rawRuntimeProfile = raw?.worldConfig?.modeRuntimeProfile || openingConfig?.modeRuntimeProfile;
    const modeRuntimeProfile = (rawRuntimeProfile || openingConfig)
        ? 规范化模式运行时配置(rawRuntimeProfile, openingConfig?.题材模式)
        : undefined;

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
            manualRealmPrompt: 标准化文本(raw?.worldConfig?.manualRealmPrompt),
            ...(modeRuntimeProfile ? { modeRuntimeProfile } : {}),
            realmDiyDraft: normalizeRealmDraft(raw?.worldConfig?.realmDiyDraft),
            mapDiyDraft: normalizeWorldMapDraft(raw?.worldConfig?.mapDiyDraft)
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
        openingConfig: openingConfig && modeRuntimeProfile
            ? { ...openingConfig, modeRuntimeProfile }
            : openingConfig,
        openingStreaming: openingConfig?.runtimeSnapshot?.openingStreaming ?? raw?.openingStreaming !== false,
        openingExtraRequirement: 标准化文本(raw?.openingExtraRequirement ?? openingConfig?.runtimeSnapshot?.openingExtraRequirement)
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

export const 合并去重背景 = (rawList: 背景结构[]): 背景结构[] => {
    const map = new Map<string, 背景结构>();
    rawList.forEach((item) => {
        const 名称 = 标准化文本(item?.名称);
        const 描述 = 标准化文本(item?.描述);
        const 效果 = 标准化文本(item?.效果);
        if (!名称 || !描述 || !效果) return;
        const existing = map.get(名称);
        const prevRefs = Array.isArray(existing?.自带天赋)
            ? existing!.自带天赋!.map((name) => 标准化文本(name)).filter(Boolean)
            : [];
        const nextRefs = Array.isArray(item?.自带天赋)
            ? item.自带天赋.map((name) => 标准化文本(name)).filter(Boolean)
            : [];
        const 自带天赋 = Array.from(new Set([...prevRefs, ...nextRefs]));
        map.set(名称, {
            ...(existing || {}),
            ...item,
            名称,
            描述,
            效果,
            ...(自带天赋.length > 0 ? { 自带天赋 } : {})
        });
    });
    return Array.from(map.values());
};

export const 合并去重天赋 = (rawList: 天赋结构[]): 天赋结构[] => {
    const map = new Map<string, 天赋结构>();
    rawList.forEach((item) => {
        const 名称 = 标准化文本(item?.名称);
        const 描述 = 标准化文本(item?.描述);
        const 效果 = 标准化文本(item?.效果);
        const 叙事约束 = 标准化文本(item?.叙事约束);
        if (!名称 || !描述 || !效果) return;
        const existing = map.get(名称);
        // 隐藏一经成立不可被后写的可见条目降级
        const 隐藏 = item?.隐藏 === true || existing?.隐藏 === true ? true : undefined;
        map.set(名称, {
            名称,
            描述,
            效果,
            叙事约束: 叙事约束 || existing?.叙事约束 || undefined,
            ...(隐藏 ? { 隐藏: true } : {})
        });
    });
    return Array.from(map.values());
};

const 标准化世界书列表 = (rawList: unknown): 世界书结构[] => Array.isArray(rawList) ? rawList as 世界书结构[] : [];

const 创意工坊模块键 = (entry: 创意工坊模块条目): string => `${entry.source || 'builtin'}:${entry.id}`;

const 获取预设题材模式 = (preset: 开局预设方案结构): OpeningConfig['题材模式'] => {
    const rawMode = preset.openingConfig?.modeRuntimeProfile?.identity.baseMode
        || preset.openingConfig?.题材模式
        || preset.worldConfig?.modeRuntimeProfile?.identity.baseMode;
    return 规范化题材模式(rawMode);
};

const 按键查找创意工坊模块 = (moduleKey: string): 创意工坊模块条目 | undefined => {
    const fromBuiltin = 创意工坊模块列表.find((item) => 创意工坊模块键(item) === moduleKey);
    if (fromBuiltin) return fromBuiltin;
    return 读取本地创意工坊模块().find((item) => 创意工坊模块键(item) === moduleKey);
};

const 提取模块背景列表 = (module: 创意工坊模块条目): 背景结构[] => {
    const payload = module.payload as any;
    const rawList = Array.isArray(payload?.backgrounds)
        ? payload.backgrounds
        : Array.isArray(payload?.characterBackgrounds)
            ? payload.characterBackgrounds
            : [];
    return 合并去重背景(rawList as 背景结构[]);
};

const 提取模块天赋列表 = (module: 创意工坊模块条目): 天赋结构[] => {
    const payload = module.payload as any;
    const rawList = Array.isArray(payload?.talents)
        ? payload.talents
        : Array.isArray(payload?.characterTalents)
            ? payload.characterTalents
            : [];
    return 合并去重天赋(rawList as 天赋结构[]);
};

const 提取模块世界书列表 = (module: 创意工坊模块条目): 世界书结构[] => {
    const payload = module.payload as any;
    return 标准化世界书列表(module.modeWorldbooks || payload?.modeWorldbooks);
};

const 构建模块额外规则文本 = (module: 创意工坊模块条目, backgrounds: 背景结构[], talents: 天赋结构[]): string => {
    const extraParts: string[] = [];
    if (module.safetyNotes?.length) {
        extraParts.push('【模块安全说明】', ...module.safetyNotes.map((n) => `- ${n}`));
    }
    if (module.usagePrompt) {
        extraParts.push('【模块使用说明】', module.usagePrompt);
    }
    if (backgrounds.length > 0) {
        const formatItems = (items?: Array<{ 名称: string; 数量?: number; 类型?: string }>) => (
            Array.isArray(items) && items.length > 0
                ? items.map((item) => `${item.名称}${item.数量 ? `x${item.数量}` : ''}${item.类型 ? `(${item.类型})` : ''}`).join('、')
                : ''
        );
        extraParts.push(
            '【本世界可用出身背景池】',
            ...backgrounds.map((b, i) => {
                const details = [
                    formatItems(b.初始物品) ? `必投物品：${formatItems(b.初始物品)}` : '',
                    formatItems(b.开局货币) ? `开局货币：${formatItems(b.开局货币)}` : '',
                    formatItems(b.可选初始物品) ? `可选物品：${formatItems(b.可选初始物品)}` : '',
                ].filter(Boolean).join('；');
                const builtin = Array.isArray(b.自带天赋) && b.自带天赋.length > 0
                    ? `自带天赋：${b.自带天赋.join('、')}`
                    : '';
                const extra = [details, builtin].filter(Boolean).join('；');
                return `${i + 1}. ${b.名称}：${b.描述}${b.效果 ? `（效果：${b.效果}）` : ''}${extra ? `（${extra}）` : ''}`;
            })
        );
    }
    if (talents.length > 0) {
        extraParts.push(
            '【本世界可用天赋池】',
            ...talents.map((t, i) => `${i + 1}. ${t.名称}${t.隐藏 ? '（隐藏）' : ''}：${t.描述}${t.效果 ? `（效果：${t.效果}）` : ''}`)
        );
    }
    return extraParts.join('\n').trim();
};

const 增量合并模式运行时配置 = (
    previousProfile: ModeRuntimeProfile | undefined,
    nextProfile: ModeRuntimeProfile | undefined,
    fallbackMode: OpeningConfig['题材模式'] | undefined
): ModeRuntimeProfile | undefined => {
    if (!previousProfile && !nextProfile) return fallbackMode ? 规范化模式运行时配置(undefined, fallbackMode) : undefined;
    if (!previousProfile && nextProfile) return 规范化模式运行时配置(nextProfile, fallbackMode || nextProfile.identity.baseMode);
    if (previousProfile && !nextProfile) return 规范化模式运行时配置(previousProfile, fallbackMode || previousProfile.identity.baseMode);
    return 规范化模式运行时配置({
        ...(previousProfile as any),
        ...(nextProfile as any),
        identity: {
            ...(previousProfile as any).identity,
            ...(nextProfile as any).identity
        },
        economy: {
            ...(previousProfile as any).economy,
            ...(nextProfile as any).economy
        },
        time: {
            ...(previousProfile as any).time,
            ...(nextProfile as any).time
        },
        organization: {
            ...(previousProfile as any).organization,
            ...(nextProfile as any).organization
        },
        ability: {
            ...(previousProfile as any).ability,
            ...(nextProfile as any).ability
        },
        items: {
            ...(previousProfile as any).items,
            ...(nextProfile as any).items
        },
        map: {
            ...(previousProfile as any).map,
            ...(nextProfile as any).map
        },
        task: {
            ...(previousProfile as any).task,
            ...(nextProfile as any).task
        },
        npc: {
            ...(previousProfile as any).npc,
            ...(nextProfile as any).npc
        },
        image: {
            ...(previousProfile as any).image,
            ...(nextProfile as any).image
        },
        opening: {
            ...(previousProfile as any).opening,
            ...(nextProfile as any).opening
        },
        validation: {
            ...(previousProfile as any).validation,
            ...(nextProfile as any).validation
        }
    }, fallbackMode || nextProfile?.identity.baseMode || previousProfile?.identity.baseMode);
};

export const 构建开局运行时快照 = (params: {
    openingConfig?: OpeningConfig;
    openingStreaming?: boolean;
    openingExtraRequirement?: string;
    openingExtraPrompt?: string;
    activeModuleExtraRules?: string;
    mainStoryDirection?: string;
    hiddenPlotPolicy?: string;
    modeWorldbooks?: any[];
    workshopSelection?: OpeningRuntimeSnapshot['workshopSelection'];
    modeBackgrounds?: 背景结构[];
    modeTalents?: 天赋结构[];
}): OpeningRuntimeSnapshot | undefined => {
    const modeBackgrounds = 合并去重背景(params.modeBackgrounds || []);
    const modeTalents = 合并去重天赋(params.modeTalents || []);
    const mainStoryDirection = 标准化文本(params.mainStoryDirection);
    const hiddenPlotPolicy = 标准化文本(params.hiddenPlotPolicy);
    const snapshot: OpeningRuntimeSnapshot = {
        openingStreaming: params.openingStreaming !== false,
        openingExtraRequirement: 标准化文本(params.openingExtraRequirement),
        openingExtraPrompt: 标准化文本(params.openingExtraPrompt),
        activeModuleExtraRules: 标准化文本(params.activeModuleExtraRules),
        ...(mainStoryDirection ? { mainStoryDirection } : {}),
        ...(hiddenPlotPolicy ? { hiddenPlotPolicy } : {}),
        ...(Array.isArray(params.modeWorldbooks) && params.modeWorldbooks.length > 0 ? { modeWorldbooks: params.modeWorldbooks } : {}),
        ...(params.workshopSelection?.selectedMode || Object.keys(params.workshopSelection?.selectedModules || {}).length > 0
            ? {
                workshopSelection: {
                    selectedMode: params.workshopSelection?.selectedMode || '',
                    ...(Object.keys(params.workshopSelection?.selectedModules || {}).length > 0
                        ? { selectedModules: params.workshopSelection?.selectedModules }
                        : {})
                }
            }
            : {}),
        ...(modeBackgrounds.length > 0 ? { modeBackgrounds } : {}),
        ...(modeTalents.length > 0 ? { modeTalents } : {})
    };
    if (
        snapshot.openingStreaming === true
        && !snapshot.openingExtraRequirement
        && !snapshot.openingExtraPrompt
        && !snapshot.activeModuleExtraRules
        && !snapshot.mainStoryDirection
        && !snapshot.hiddenPlotPolicy
        && (!snapshot.modeWorldbooks || snapshot.modeWorldbooks.length <= 0)
        && !snapshot.workshopSelection?.selectedMode
        && (!snapshot.workshopSelection?.selectedModules || Object.keys(snapshot.workshopSelection.selectedModules).length <= 0)
        && modeBackgrounds.length <= 0
        && modeTalents.length <= 0
    ) {
        return undefined;
    }
    return snapshot;
};

const 校准工坊运行时恢复结果 = (params: {
    openingConfig?: OpeningConfig;
    openingStreaming?: boolean;
    openingExtraPrompt?: string;
    openingExtraRequirement?: string;
    activeModuleExtraRules?: string;
    validModuleKeys?: Set<string>;
}) => {
    const snapshot = params.openingConfig?.runtimeSnapshot;
    const workshopSelection = 过滤有效工坊选择(snapshot?.workshopSelection, params.validModuleKeys);
    const selectedModules = workshopSelection?.selectedModules || {};
    const selectedEntries = Object.values(selectedModules)
        .map((moduleKey) => 按键查找创意工坊模块(标准化文本(moduleKey)))
        .filter((item): item is 创意工坊模块条目 => Boolean(item));

    const topicEntry = selectedModules.topic ? 按键查找创意工坊模块(标准化文本(selectedModules.topic)) : undefined;
    const modeBackgrounds = topicEntry ? 提取模块背景列表(topicEntry) : 合并去重背景(snapshot?.modeBackgrounds || []);
    const modeTalents = topicEntry ? 提取模块天赋列表(topicEntry) : 合并去重天赋(snapshot?.modeTalents || []);
    const modeWorldbooks = topicEntry ? 提取模块世界书列表(topicEntry) : 标准化世界书列表(snapshot?.modeWorldbooks);
    const topicPayload = topicEntry?.payload as any;
    const mainStoryDirection = topicEntry
        ? 标准化文本(topicPayload?.mainStoryDirection)
        : 标准化文本(snapshot?.mainStoryDirection);
    const hiddenPlotPolicy = topicEntry
        ? 标准化文本(topicPayload?.hiddenPlotPolicy)
        : 标准化文本(snapshot?.hiddenPlotPolicy);
    const activeModuleExtraRules = topicEntry
        ? 构建模块额外规则文本(topicEntry, modeBackgrounds, modeTalents)
        : 标准化文本(snapshot?.activeModuleExtraRules ?? params.activeModuleExtraRules);

    const mergedRuntimeProfile = selectedEntries.reduce<ModeRuntimeProfile | undefined>((acc, entry) => {
        const rawProfile = entry.modeRuntimeProfile || (entry.payload as any)?.modeRuntimeProfile;
        const nextProfile = rawProfile
            ? 规范化模式运行时配置(rawProfile, params.openingConfig?.题材模式)
            : undefined;
        return 增量合并模式运行时配置(acc, nextProfile, params.openingConfig?.题材模式);
    }, params.openingConfig?.modeRuntimeProfile);

    const normalizedSnapshot = 构建开局运行时快照({
        openingConfig: params.openingConfig,
        openingStreaming: snapshot?.openingStreaming ?? params.openingStreaming,
        openingExtraPrompt: snapshot?.openingExtraPrompt ?? params.openingExtraPrompt,
        openingExtraRequirement: snapshot?.openingExtraRequirement ?? params.openingExtraRequirement,
        activeModuleExtraRules,
        mainStoryDirection,
        hiddenPlotPolicy,
        modeWorldbooks,
        workshopSelection,
        modeBackgrounds,
        modeTalents
    });

    return {
        openingStreaming: snapshot?.openingStreaming ?? params.openingStreaming !== false,
        openingExtraPrompt: 标准化文本(snapshot?.openingExtraPrompt ?? params.openingExtraPrompt),
        openingExtraRequirement: 标准化文本(snapshot?.openingExtraRequirement ?? params.openingExtraRequirement),
        activeModuleExtraRules,
        mainStoryDirection,
        hiddenPlotPolicy,
        modeWorldbooks,
        workshopSelection,
        modeBackgrounds,
        modeTalents,
        modeRuntimeProfile: mergedRuntimeProfile,
        runtimeSnapshot: normalizedSnapshot
    };
};

export const 获取快速重开运行时恢复参数 = (params: {
    openingConfig?: OpeningConfig;
    openingStreaming?: boolean;
    openingExtraPrompt?: string;
    openingExtraRequirement?: string;
    activeModuleExtraRules?: string;
    validModuleKeys?: Set<string>;
}) => {
    return 校准工坊运行时恢复结果(params);
};

export const 构建预设表单恢复结果 = (
    preset: 开局预设方案结构,
    options: {
        fallbackBackgrounds: 背景结构[];
        fallbackTalents: 天赋结构[];
        selectedBackgroundCatalog?: 背景结构[];
        selectedTalentCatalog?: 天赋结构[];
        validModuleKeys?: Set<string>;
    }
) => {
    const runtimeRestore = 获取快速重开运行时恢复参数({
        openingConfig: preset.openingConfig,
        openingStreaming: preset.openingStreaming,
        openingExtraRequirement: preset.openingExtraRequirement,
        validModuleKeys: options.validModuleKeys
    });
    const 模式包背景列表 = 合并去重背景(runtimeRestore.modeBackgrounds || []);
    const 模式包天赋列表 = 合并去重天赋(runtimeRestore.modeTalents || []);
    const 预设题材模式 = 获取预设题材模式(preset);
    const 预设题材背景列表 = 合并去重背景(获取题材预设背景(预设题材模式));
    const 预设题材天赋列表 = 合并去重天赋(获取题材预设天赋(预设题材模式));
    const 已选背景兜底列表 = 合并去重背景(options.selectedBackgroundCatalog || []);
    const 已选天赋兜底列表 = 合并去重天赋(options.selectedTalentCatalog || []);
    const 全部背景选项 = 合并去重背景([
        ...预设题材背景列表,
        ...模式包背景列表,
        ...options.fallbackBackgrounds,
        ...已选背景兜底列表
    ]);
    const 全部天赋选项 = 合并去重天赋([
        ...预设题材天赋列表,
        ...模式包天赋列表,
        ...options.fallbackTalents,
        ...已选天赋兜底列表
    ]);
    const selectedBackground = 全部背景选项.find((item) => item.名称 === 标准化文本(preset.character?.背景名称))
        || 全部背景选项[0]
        || options.fallbackBackgrounds[0];
    const selectedTalents = 过滤玩家可自选天赋(
        (Array.isArray(preset.character?.天赋名称列表) ? preset.character.天赋名称列表 : [])
            .map((name) => 全部天赋选项.find((item) => item.名称 === 标准化文本(name)))
            .filter(Boolean) as 天赋结构[]
    );
    return {
        ...runtimeRestore,
        模式包背景列表,
        模式包天赋列表,
        全部背景选项,
        全部天赋选项,
        selectedBackground,
        selectedTalents,
        modeWorldbooks: runtimeRestore.modeWorldbooks,
        workshopSelection: runtimeRestore.workshopSelection
    };
};

const 过滤有效工坊选择 = (
    selection: OpeningRuntimeSnapshot['workshopSelection'],
    validModuleKeys?: Set<string>
): OpeningRuntimeSnapshot['workshopSelection'] => {
    if (!selection) return undefined;
    const selectedModules = Object.fromEntries(
        Object.entries(selection.selectedModules || {}).filter(([, key]) => {
            const normalized = 标准化文本(key);
            if (!normalized) return false;
            if (!validModuleKeys) return true;
            return validModuleKeys.has(normalized);
        })
    ) as NonNullable<OpeningRuntimeSnapshot['workshopSelection']>['selectedModules'];
    const selectedMode = 标准化文本(selection.selectedMode) as NonNullable<OpeningRuntimeSnapshot['workshopSelection']>['selectedMode'];
    if (!selectedMode && Object.keys(selectedModules || {}).length <= 0) return undefined;
    return {
        ...(selectedMode ? { selectedMode } : {}),
        ...(Object.keys(selectedModules || {}).length > 0 ? { selectedModules } : {})
    };
};

export const 构建预设直开恢复结果 = (
    presetOrParams: 开局预设方案结构 | {
        preset?: 开局预设方案结构;
        validModuleKeys?: Set<string>;
        fallbackBackgrounds?: 背景结构[];
        fallbackTalents?: 天赋结构[];
        selectedBackgroundCatalog?: 背景结构[];
        selectedTalentCatalog?: 天赋结构[];
    },
    options?: {
        validModuleKeys?: Set<string>;
        fallbackBackgrounds?: 背景结构[];
        fallbackTalents?: 天赋结构[];
        selectedBackgroundCatalog?: 背景结构[];
        selectedTalentCatalog?: 天赋结构[];
    }
) => {
    const wrappedParams = (presetOrParams as any)?.preset ? presetOrParams as {
        preset: 开局预设方案结构;
        validModuleKeys?: Set<string>;
        fallbackBackgrounds?: 背景结构[];
        fallbackTalents?: 天赋结构[];
        selectedBackgroundCatalog?: 背景结构[];
        selectedTalentCatalog?: 天赋结构[];
    } : null;
    const preset = wrappedParams?.preset || presetOrParams as 开局预设方案结构;
    const restoreOptions = {
        ...options,
        ...(wrappedParams || {})
    };
    const runtimeRestore = 获取快速重开运行时恢复参数({
        openingConfig: preset.openingConfig,
        openingStreaming: preset.openingStreaming,
        openingExtraRequirement: preset.openingExtraRequirement,
        validModuleKeys: restoreOptions?.validModuleKeys
    });
    const directFormRestore = 构建预设表单恢复结果(preset, {
        fallbackBackgrounds: restoreOptions?.fallbackBackgrounds || [],
        fallbackTalents: restoreOptions?.fallbackTalents || [],
        selectedBackgroundCatalog: restoreOptions?.selectedBackgroundCatalog,
        selectedTalentCatalog: restoreOptions?.selectedTalentCatalog,
        validModuleKeys: restoreOptions?.validModuleKeys
    });
    const openingConfig = preset.openingConfig && (runtimeRestore.modeRuntimeProfile || runtimeRestore.runtimeSnapshot)
        ? {
            ...preset.openingConfig,
            ...(runtimeRestore.modeRuntimeProfile ? { modeRuntimeProfile: runtimeRestore.modeRuntimeProfile } : {}),
            ...(runtimeRestore.runtimeSnapshot ? { runtimeSnapshot: runtimeRestore.runtimeSnapshot } : {})
        }
        : preset.openingConfig;
    return {
        worldConfig: preset.worldConfig,
        character: preset.character,
        openingConfig,
        selectedBackground: directFormRestore.selectedBackground,
        selectedTalents: directFormRestore.selectedTalents,
        模式包背景列表: directFormRestore.模式包背景列表,
        模式包天赋列表: directFormRestore.模式包天赋列表,
        全部背景选项: directFormRestore.全部背景选项,
        全部天赋选项: directFormRestore.全部天赋选项,
        openingStreaming: runtimeRestore.openingStreaming,
        openingExtraRequirement: runtimeRestore.openingExtraRequirement,
        activeModuleExtraRules: runtimeRestore.activeModuleExtraRules,
        modeWorldbooks: runtimeRestore.modeWorldbooks,
        workshopSelection: runtimeRestore.workshopSelection,
        modeRuntimeProfile: runtimeRestore.modeRuntimeProfile,
        runtimeSnapshot: runtimeRestore.runtimeSnapshot
    };
};
