import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 从模式世界书提取提示词, 创意工坊模块分区, type 创意工坊模块条目, type 创意工坊模块类型, type 创意工坊世界细节生成配置 } from '../../../data/creativeWorkshopModules';
import type { 接口设置结构, ModeRuntimeProfile, 世界书结构 } from '../../../types';
import type { 题材模式类型 } from '../../../models/system';
import { 题材模式配置表, 题材模式顺序 } from '../../../utils/topicModeProfiles';
import { 构建官方模式运行时配置, 规范化模式运行时配置, 渲染模式运行时配置世界书内容, 规范化显式CurrencySystem } from '../../../utils/modeRuntimeProfile';
import { 开局生成性别选项 } from '../../../utils/openingConfig';
import {
    编辑创意工坊模块,
    删除创意工坊模块,
    发布创意工坊模块,
    导入本地创意工坊模块,
    列出创意工坊模块,
    提取ComfyUI工作流模块JSON
} from '../../../services/creativeWorkshop';
import { 读取云端游玩会话 } from '../../../services/cloudPlayService';
import { 校验ComfyUI工作流可生图 } from '../../../services/ai/comfyWorkflowValidation';

interface Props {
    open: boolean;
    onClose: () => void;
    onNovelDecomposition: () => void;
    onRequireLogin?: () => void;
    apiConfig?: 接口设置结构;
}

type 来源筛选 = 'all' | 'builtin' | 'cloud' | 'local';
const 可展示工坊类型: 创意工坊模块类型[] = ['topic', 'comfy_workflow'];
const 可展示工坊类型集合 = new Set<创意工坊模块类型>(可展示工坊类型);
const 可展示工坊分区 = 创意工坊模块分区.filter((section) => 可展示工坊类型集合.has(section.id));
const 默认生成性别占位 = `${开局生成性别选项.map((item) => item.value).join('、')}；留空默认全选`;
type 运行时配置字段类型 = 'text' | 'textarea' | 'list' | 'record' | 'bool' | 'boolGroup' | 'baseMode' | 'currencyMode' | 'timeFormatMode' | 'realmConfig' | 'currencySystemJson';
type 运行时配置字段 = { label: string; path: string[]; type?: 运行时配置字段类型; placeholder?: string; boolGroup?: { label: string; key: string }[] };
type 运行时配置分区 = { title: string; fields: 运行时配置字段[] };

const 运行时配置分区列表: 运行时配置分区[] = [
    {
        title: '题材身份',
        fields: [
            { label: '模式 ID', path: ['identity', 'modeId'] },
            { label: '显示名', path: ['identity', 'displayName'] },
            { label: '继承官方基础模式', path: ['identity', 'baseMode'], type: 'baseMode' },
            { label: '现代题材', path: ['identity', 'isModern'], type: 'bool' },
            { label: '启用修炼', path: ['identity', 'usesCultivation'], type: 'bool' },
            { label: '末日题材', path: ['identity', 'isApocalypse'], type: 'bool' },
            { label: '生存模式', path: ['identity', 'isSurvival'], type: 'bool' },
            { label: '同人/IP 模式', path: ['identity', 'isFandomIp'], type: 'bool' }
        ]
    },
    {
        title: '经济系统',
        fields: [
            { label: '货币显示', path: ['economy', 'currencyDisplayMode'], type: 'currencyMode' },
            { label: '上层货币名称', path: ['economy', 'currencyTiers', 'upperName'] },
            { label: '中层货币名称', path: ['economy', 'currencyTiers', 'middleName'] },
            { label: '底层货币名称', path: ['economy', 'currencyTiers', 'lowerName'] },
            { label: '上转中汇率', path: ['economy', 'currencyTiers', 'upperToMiddleRate'] },
            { label: '中转底汇率', path: ['economy', 'currencyTiers', 'middleToLowerRate'] },
            { label: '高级 currencySystem JSON', path: ['economy', 'currencySystem'], type: 'currencySystemJson' },
            { label: '题材货币说明', path: ['economy', 'primaryCurrency'], type: 'textarea' },
            { label: '底层记账单位', path: ['economy', 'accountingUnit'] },
            { label: '旧兼容换算说明', path: ['economy', 'exchangeRules'], type: 'textarea' },
            { label: '市场名称', path: ['economy', 'marketName'] },
            { label: '市场动词', path: ['economy', 'marketVerb'] },
            { label: '允许物品类型', path: ['economy', 'allowedItemTypes'], type: 'list' },
            { label: '禁用关键词', path: ['economy', 'bannedKeywords'], type: 'list' }
        ]
    },
    {
        title: '时间系统',
        fields: [
            { label: '显示/叙事基调', path: ['time', 'displayFormat'], type: 'timeFormatMode' },
            { label: '历法名称', path: ['time', 'calendarName'] },
            { label: '正文时间口径', path: ['time', 'narrativeStyle'], type: 'textarea' },
            { label: '昼夜时段词', path: ['time', 'dayPeriodNames'], type: 'list' },
            { label: '允许时间词', path: ['time', 'allowedTimeTerms'], type: 'list' },
            { label: '禁用时间词', path: ['time', 'bannedTimeTerms'], type: 'list' },
            { label: '时间推进说明', path: ['time', 'progressionPrompt'], type: 'textarea' }
        ]
    },
    {
        title: '组织系统',
        fields: [
            { label: '组织名称', path: ['organization', 'organizationName'] },
            { label: '成员名称', path: ['organization', 'memberName'] },
            { label: '贡献名称', path: ['organization', 'contributionName'] },
            { label: '等级称呼', path: ['organization', 'rankNames'], type: 'list' },
            { label: '组织别名', path: ['organization', 'organizationAliases'], type: 'list' },
            { label: '成员别名', path: ['organization', 'memberAliases'], type: 'list' }
        ]
    },
    {
        title: '能力系统',
        fields: [
            { label: '主能力轴', path: ['ability', 'primaryAxis'], type: 'textarea' },
            { label: '境界/等级/段位', path: ['ability', 'progressionNames'], type: 'list' },
            { label: '属性点规则', path: ['ability', 'attributePointRules'], type: 'textarea' },
            { label: '技能池', path: ['ability', 'skillPool'], type: 'list' },
            { label: '技能成长词', path: ['ability', 'skillGrowthVerb'] },
            { label: '战斗结算口径', path: ['ability', 'combatResolution'], type: 'textarea' },
            { label: '功法类型', path: ['ability', 'kungfuTypes'], type: 'list' },
            { label: '境界配置', path: ['ability', 'realmConfig'], type: 'realmConfig' }
        ]
    },
    {
        title: '物品系统',
        fields: [
            { label: '初始物品池', path: ['items', 'initialItemPool'], type: 'list' },
            { label: '奖励物品池', path: ['items', 'rewardItemPool'], type: 'list' },
            { label: '禁用物品关键词', path: ['items', 'bannedItemKeywords'], type: 'list' },
            { label: '专属物品类型', path: ['items', 'exclusiveItemTypes'], type: 'list' },
            { label: '活跃资源计数器', path: ['items', 'activeResources'], type: 'list' },
            { label: '资源类型', path: ['items', 'resourceTypes'], type: 'list' },
            { label: '资源开关', path: ['items', 'resourceToggles'], type: 'boolGroup', boolGroup: [
                { label: '食物', key: 'food' },
                { label: '饮水', key: 'water' },
                { label: '弹药', key: 'ammo' },
                { label: '药品', key: 'medicine' },
                { label: '燃料', key: 'fuel' },
                { label: '电池', key: 'batteries' },
                { label: '灵石', key: 'spiritStones' }
            ] }
        ]
    },
    {
        title: '地图系统',
        fields: [
            { label: '地图层级命名', path: ['map', 'layerNames'], type: 'list' },
            { label: '地点类型池', path: ['map', 'locationTypes'], type: 'list' },
            { label: 'POI 类型', path: ['map', 'poiTypes'], type: 'list' },
            { label: '禁用地点词', path: ['map', 'bannedLocationKeywords'], type: 'list' },
            { label: '地图口径', path: ['map', 'mapPrompt'], type: 'textarea' }
        ]
    },
    {
        title: '任务系统',
        fields: [
            { label: '主线任务风格', path: ['task', 'mainQuestStyle'], type: 'textarea' },
            { label: '支线去重维度', path: ['task', 'sideQuestDedupeKeys'], type: 'list' },
            { label: '奖励发放者', path: ['task', 'rewardDistributor'] },
            { label: '奖励可视化模板', path: ['task', 'rewardVisualizationTemplate'], type: 'textarea' }
        ]
    },
    {
        title: 'NPC 系统',
        fields: [
            { label: '默认身份池', path: ['npc', 'defaultIdentityPool'], type: 'list' },
            { label: '关系模板', path: ['npc', 'relationTemplates'], type: 'list' },
            { label: '主要角色必填字段', path: ['npc', 'requiredMainCharacterFields'], type: 'list' },
            { label: '性癖兜底规则', path: ['npc', 'sexualityFallback'], type: 'textarea' },
            { label: '敏感点兜底规则', path: ['npc', 'sensitivityFallback'], type: 'textarea' },
            { label: 'NPC 自动生图风格', path: ['npc', 'autoImageStyle'], type: 'textarea' },
            { label: 'NPC 男女比例（男:女）', path: ['npc', 'genderRatio'], type: 'text' }
        ]
    },
    {
        title: '生图系统',
        fields: [
            { label: '人物服饰时代', path: ['image', 'characterClothingEra'] },
            { label: '场景材质', path: ['image', 'sceneMaterials'], type: 'textarea' },
            { label: '物品真实形态', path: ['image', 'itemRealismPrompt'], type: 'textarea' },
            { label: '负面提示', path: ['image', 'negativePrompt'], type: 'textarea' },
            { label: '视觉风格', path: ['image', 'visualStyle'], type: 'textarea' }
        ]
    },
    {
        title: '开局系统',
        fields: [
            { label: '默认背景池', path: ['opening', 'defaultBackgrounds'], type: 'list' },
            { label: '默认天赋池', path: ['opening', 'defaultTalents'], type: 'list' },
            { label: '初始伙伴模板', path: ['opening', 'companionTemplate'], type: 'textarea' },
            { label: '开局切入模板', path: ['opening', 'cutInTemplates'], type: 'list' },
            { label: '初始任务模板', path: ['opening', 'initialQuestTemplates'], type: 'list' },
            { label: '默认生成性别', path: ['opening', 'allowedGeneratedGenders'], type: 'list', placeholder: 默认生成性别占位 },
            { label: '锁定生成性别', path: ['opening', 'lockGeneratedGenders'], type: 'bool' },
            { label: '默认装备模板', path: ['opening', 'defaultEquipment'], type: 'record', placeholder: '每行一个，格式：槽位=物品名，例如：武器=青锋剑' },
            { label: '默认金钱模板', path: ['opening', 'defaultCurrency'], type: 'record', placeholder: '每行一个，格式：货币名=初始量，例如：底层货币=1000' }
        ]
    },
    {
        title: '校验系统',
        fields: [
            { label: '模式内禁词', path: ['validation', 'bannedWords'], type: 'list' },
            { label: '冲突检测', path: ['validation', 'conflictChecks'], type: 'list' },
            { label: '旧存档迁移清理', path: ['validation', 'migrationCleanupRules'], type: 'list' }
        ]
    }
];

type 贡献草稿 = {
    title: string;
    subtitle: string;
    description: string;
    type: 创意工坊模块类型;
    mode: 题材模式类型;
    currencyDisplayMode: 'wuxia' | 'xianxia' | 'fantasy' | 'urban' | 'modern' | 'apocalypse' | 'infinite';
    auctionName: string;
    marketVerb: string;
    mapPrompt: string;
    skillNames: string;
    presetItemKeywords: string;
    backgroundSuggestions: string;
    talentSuggestions: string;
    modeRuntimeProfile: ModeRuntimeProfile;
    tags: string;
    body: string;
    topicBody: string;
    worldRulesBody: string;
    abilityBody: string;
    aiGenerateWorldDetails: boolean;
    importantPeople: string;
    importantFactions: string;
    mapDesign: string;
    usagePrompt: string;
    safetyNotes: string;
    style: string;
    scope: 'main' | 'scene' | 'nsfw' | 'all';
};

const 创建默认模式元数据草稿 = (mode: 题材模式类型): Pick<贡献草稿, 'currencyDisplayMode' | 'auctionName' | 'marketVerb' | 'mapPrompt' | 'skillNames' | 'presetItemKeywords' | 'backgroundSuggestions' | 'talentSuggestions' | 'modeRuntimeProfile'> => {
    const profile = 题材模式配置表[mode];
    return {
        currencyDisplayMode: profile?.currencyDisplayMode || 'wuxia',
        auctionName: profile?.auctionName || '',
        marketVerb: profile?.marketVerb || '',
        mapPrompt: profile?.mapPrompt || '',
        skillNames: profile?.skillNames?.join('、') || '',
        presetItemKeywords: profile?.presetItemKeywords?.join('、') || '',
        backgroundSuggestions: profile?.backgroundSuggestions?.join('、') || '',
        talentSuggestions: profile?.talentSuggestions?.join('、') || '',
        modeRuntimeProfile: 构建官方模式运行时配置(mode)
    };
};

const 下载JSON = (entry: 创意工坊模块条目) => {
    const payload = {
        schema: 'moranjianghu-creative-workshop-module',
        version: 1,
        exportedAt: new Date().toISOString(),
        module: entry
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${entry.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
};

const 复制文本 = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

const 构建模块摘要 = (entry: 创意工坊模块条目): string => [
    `《${entry.title}》`,
    entry.description,
    `标签：${entry.tags.join('、')}`,
    entry.usagePrompt ? `使用提示：${entry.usagePrompt}` : '',
    '',
    entry.contentBlocks?.length ? '内容分段：' : '注入预览：',
    ...(entry.contentBlocks?.length
        ? entry.contentBlocks.map((block) => `【${block.title}】${block.purpose}\n${block.content}`)
        : (entry.injectionPreview?.length ? entry.injectionPreview : [`模块数据：${JSON.stringify(entry.payload, null, 2)}`]))
].filter(Boolean).join('\n');

const 空贡献草稿 = (): 贡献草稿 => ({
    title: '',
    subtitle: '',
    description: '',
    type: 'topic',
    mode: '武侠',
    ...创建默认模式元数据草稿('武侠'),
    tags: '',
    body: '',
    topicBody: '',
    worldRulesBody: '',
    abilityBody: '',
    aiGenerateWorldDetails: false,
    importantPeople: '',
    importantFactions: '',
    mapDesign: '',
    usagePrompt: '',
    safetyNotes: '',
    style: '',
    scope: 'main'
});

const 分割文本行 = (value: string): string[] => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const 分割短语 = (value: string): string[] => value.split(/[，,、\n]+/).map((line) => line.trim()).filter(Boolean);
const 读取运行时路径值 = (profile: ModeRuntimeProfile, path: string[]): any => (
    path.reduce((current: any, key) => current?.[key], profile as any)
);

const 格式化运行时字段值 = (profile: ModeRuntimeProfile, field: 运行时配置字段): string => {
    const value = 读取运行时路径值(profile, field.path);
    if (typeof value === 'undefined' || value === null) return '';
    if (field.type === 'currencySystemJson') return JSON.stringify(value, null, 2);
    if (field.type === 'record') {
        if (typeof value === 'object' && !Array.isArray(value)) {
            return Object.entries(value).map(([k, v]) => `${k}=${v}`).join('\n');
        }
        return String(value);
    }
    if (Array.isArray(value)) return value.join('、');
    return typeof value === 'string' ? value : String(value ?? '');
};

const 格式化CurrencySystemJson = (profile: ModeRuntimeProfile): string => {
    const value = profile.economy.currencySystem;
    return value ? JSON.stringify(value, null, 2) : '';
};

const 写入运行时路径值 = (profile: ModeRuntimeProfile, path: string[], value: any): ModeRuntimeProfile => {
    const next = JSON.parse(JSON.stringify(profile)) as any;
    let target = next;
    path.slice(0, -1).forEach((key) => {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        target = target[key];
    });
    target[path[path.length - 1]] = value;
    return next as ModeRuntimeProfile;
};

const 格式化只读列表 = (value: unknown): string => {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('、');
    return typeof value === 'string' ? value : '';
};

const 提取模块运行时配置 = (entry: 创意工坊模块条目): ModeRuntimeProfile | null => {
    const payload = entry.payload as any;
    const rawProfile = entry.modeRuntimeProfile || payload?.modeRuntimeProfile;
    if (!rawProfile) return null;
    const baseMode = rawProfile.identity?.baseMode || payload?.mode || '武侠';
    return 规范化模式运行时配置(rawProfile, baseMode);
};

const 提取模块模式世界书 = (entry: 创意工坊模块条目): 世界书结构[] => {
    const payload = entry.payload as any;
    const books = entry.modeWorldbooks || payload?.modeWorldbooks;
    return Array.isArray(books) ? books : [];
};

const 提取模块模式元数据 = (entry: 创意工坊模块条目): Record<string, unknown> => {
    const payload = entry.payload as any;
    const metadata = payload?.modeMetadata || {};
    const runtimeProfile = 提取模块运行时配置(entry);
    return {
        mode: metadata.mode || payload?.mode || runtimeProfile?.identity.baseMode || '',
        currencyDisplayMode: metadata.currencyDisplayMode || runtimeProfile?.economy.currencyDisplayMode || '',
        auctionName: metadata.auctionName || runtimeProfile?.economy.marketName || '',
        marketVerb: metadata.marketVerb || runtimeProfile?.economy.marketVerb || '',
        mapPrompt: metadata.mapPrompt || runtimeProfile?.map.mapPrompt || '',
        timeDisplayFormat: metadata.timeDisplayFormat || runtimeProfile?.time.displayFormat || '',
        timeNarrativeStyle: metadata.timeNarrativeStyle || runtimeProfile?.time.narrativeStyle || '',
        skillNames: metadata.skillNames || runtimeProfile?.ability.skillPool || [],
        presetItemKeywords: metadata.presetItemKeywords || runtimeProfile?.items.initialItemPool || [],
        backgroundSuggestions: metadata.backgroundSuggestions || runtimeProfile?.opening.defaultBackgrounds || [],
        talentSuggestions: metadata.talentSuggestions || runtimeProfile?.opening.defaultTalents || []
    };
};

const 提取模块世界细节生成配置 = (entry: 创意工坊模块条目): 创意工坊世界细节生成配置 => {
    const payload = entry.payload as any;
    const raw = entry.worldDetailGeneration || payload?.worldDetailGeneration;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { aiGenerate: true };
    return {
        aiGenerate: raw.aiGenerate !== false,
        importantPeople: typeof raw.importantPeople === 'string' ? raw.importantPeople.trim() : '',
        importantFactions: typeof raw.importantFactions === 'string' ? raw.importantFactions.trim() : '',
        mapDesign: typeof raw.mapDesign === 'string' ? raw.mapDesign.trim() : '',
        mapDiyDraft: raw.mapDiyDraft && typeof raw.mapDiyDraft === 'object' && !Array.isArray(raw.mapDiyDraft) ? raw.mapDiyDraft : undefined
    };
};

const 构建预览页说明 = (entry: 创意工坊模块条目): string => {
    if (entry.type === 'comfy_workflow') {
        return '完整只读配置页。这里展示该工作流实际携带的基础信息、使用提示、工作流内容、内容块和原始模块数据。';
    }
    if (提取模块运行时配置(entry) || 提取模块模式世界书(entry).length) {
        return '完整只读配置页。这里展示该模块实际会携带的元数据、运行时模式配置、模式世界书和内容块。';
    }
    return '完整只读配置页。这里展示该模块实际会携带的基础信息、注入内容、内容块和原始模块数据。';
};

const 构建模式元数据 = (draft: 贡献草稿) => ({
    mode: draft.mode,
    currencyDisplayMode: draft.currencyDisplayMode,
    auctionName: draft.auctionName.trim(),
    marketVerb: draft.marketVerb.trim(),
    mapPrompt: draft.mapPrompt.trim(),
    skillNames: 分割短语(draft.skillNames),
    presetItemKeywords: 分割短语(draft.presetItemKeywords),
    backgroundSuggestions: 分割短语(draft.backgroundSuggestions),
    talentSuggestions: 分割短语(draft.talentSuggestions)
});

const 构建世界细节生成配置 = (draft: 贡献草稿): 创意工坊世界细节生成配置 => ({
    aiGenerate: draft.aiGenerateWorldDetails,
    importantPeople: draft.importantPeople.trim(),
    importantFactions: draft.importantFactions.trim(),
    mapDesign: draft.mapDesign.trim()
});

const 世界细节配置有自定义内容 = (config: 创意工坊世界细节生成配置): boolean => (
    Boolean(config.importantPeople?.trim() || config.importantFactions?.trim() || config.mapDesign?.trim() || config.mapDiyDraft?.enabled)
);

const 渲染世界细节生成配置 = (config: 创意工坊世界细节生成配置): string => {
    if (config.aiGenerate) {
        return [
            '世界细节生成模式：AI 默认生成',
            '说明：未锁定重要人物、重要势力或地图分布，开局时由 AI 按题材口径自动补全。'
        ].join('\n');
    }
    return [
        '世界细节生成模式：贡献者自定义',
        '开局世界生成必须优先保留下列设定；AI 只能补齐空白、润色描述、修正层级关系，不能另起一套重要人物、势力或地图结构。',
        config.importantPeople?.trim() ? `【重要人物】\n${config.importantPeople.trim()}` : '',
        config.importantFactions?.trim() ? `【重要势力/宗门/组织】\n${config.importantFactions.trim()}` : '',
        config.mapDesign?.trim() ? `【地图层级与地图块介绍】\n${config.mapDesign.trim()}` : ''
    ].filter(Boolean).join('\n\n');
};

const 渲染模式元数据世界书内容 = (draft: 贡献草稿): string => {
    const metadata = 构建模式元数据(draft);
    const worldDetailGeneration = 构建世界细节生成配置(draft);
    return [
        `题材模式：${metadata.mode}`,
        `货币显示：${metadata.currencyDisplayMode}`,
        `市场名称：${metadata.auctionName}`,
        `市场行为口径：${metadata.marketVerb}`,
        `地图口径：${metadata.mapPrompt}`,
        `时间口径：${draft.modeRuntimeProfile.time.narrativeStyle}`,
        `技能建议：${metadata.skillNames.join('、')}`,
        `预设物品关键词：${metadata.presetItemKeywords.join('、')}`,
        `背景建议：${metadata.backgroundSuggestions.join('、')}`,
        `天赋建议：${metadata.talentSuggestions.join('、')}`,
        `世界细节：${worldDetailGeneration.aiGenerate ? 'AI 默认生成' : '贡献者自定义'}`
    ].filter((line) => !line.endsWith('：')).join('\n');
};

const 构建贡献模式世界书 = (draft: 贡献草稿, suiteId: string, suiteTitle: string): 世界书结构[] => [{
    id: `${suiteId}-worldbook`,
    标题: `${suiteTitle}世界书`,
    描述: '贡献者可按主世界书逻辑维护的模式专属世界书；切换该模式包时统一注入题材口径、世界规则和能力体系。',
    常驻大纲: draft.description.trim() || `${draft.mode}模式专属规则。`,
    启用: true,
    内置: false,
    创建时间: Date.now(),
    更新时间: Date.now(),
    条目: [
        {
            id: `${suiteId}-metadata`,
            标题: '模式元数据',
            内容: 渲染模式元数据世界书内容(draft),
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 105,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-runtime-profile`,
            标题: '运行时模式配置',
            内容: 渲染模式运行时配置世界书内容(规范化模式运行时配置(draft.modeRuntimeProfile, draft.mode)),
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 104,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-world-details`,
            标题: '世界细节生成策略',
            内容: 渲染世界细节生成配置(构建世界细节生成配置(draft)),
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 103,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-topic`,
            标题: '题材口径',
            内容: draft.topicBody.trim(),
            条目形态: 'normal',
            类型: 'world_lore',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 100,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-world-rules`,
            标题: '世界规则',
            内容: draft.worldRulesBody.trim(),
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 95,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-ability`,
            标题: '能力体系',
            内容: draft.abilityBody.trim(),
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'],
            注入模式: 'always',
            关键词: [],
            优先级: 90,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        }
    ].filter((entry) => entry.内容)
}];

const 构建贡献模块 = (draft: 贡献草稿, contributor: string): 创意工坊模块条目 => {
    const title = draft.title.trim();
    const bodyLines = 分割文本行(draft.body);
    const tags = [
        draft.mode,
        ...draft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean)
    ].filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 12);
    const style = draft.style.trim();
    const scopeLabel = draft.scope === 'nsfw' ? 'NSFW 生图' : draft.scope === 'scene' ? '场景生图' : draft.scope === 'all' ? '通用生图' : '普通生图';
    const injectionTarget = draft.type === 'ability' ? 'manualRealmPrompt' : draft.type === 'comfy_workflow' ? 'imageWorkflow' : 'manualWorldPrompt';
    const contentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        {
            id: `${draft.type}-main`,
            title: draft.type === 'ability' ? '能力与境界规则' : draft.type === 'comfy_workflow' ? 'ComfyUI 工作流' : '世界与题材规则',
            purpose: draft.type === 'comfy_workflow' ? '提供可导入的生图工作流或工作流说明。' : '作为模型注入的主要规则内容。',
            injectionTarget,
            content: draft.body.trim()
        }
    ];
    const safetyNotes = 分割文本行(draft.safetyNotes);
    const usagePrompt = draft.usagePrompt.trim() || (draft.type === 'comfy_workflow'
        ? '在文生图设置中选择该工作流；发布前请确认 JSON 可用。'
        : draft.type === 'ability'
            ? '作为手动能力/境界提示词注入，用于约束成长体系和战力边界。'
            : '作为手动世界观提示词注入，用于约束开局世界、势力、货币、地图和叙事边界。');
    const injectionPreview = draft.type === 'comfy_workflow'
        ? [
            '标准格式：v2 / comfy_workflow',
            `适用范围：${draft.scope}`,
            `风格：${style || '未填写'}`,
            ...bodyLines.slice(0, 8),
            '注入方式：玩家在文生图设置里选择该工作流后，写入对应 ComfyUI Workflow JSON。'
        ].filter(Boolean)
        : [
            `标准格式：v2 / ${draft.type}`,
            `适用题材：${draft.mode}`,
            `模块类型：${可展示工坊分区.find((section) => section.id === draft.type)?.title || draft.type}`,
            ...bodyLines.slice(0, 8),
            `使用提示：${usagePrompt}`
        ];
    return {
        id: `local-${draft.type}-${Date.now()}`,
        type: draft.type,
        formatVersion: 2,
        workshopKind: 'standard_module',
        title,
        subtitle: draft.subtitle.trim() || (draft.type === 'comfy_workflow' ? `${style || '自定义风格'} · ${scopeLabel}` : `${draft.mode} · 玩家贡献`),
        description: draft.description.trim() || `${draft.mode}可用的玩家贡献模块。`,
        tags,
        payload: draft.type === 'comfy_workflow'
            ? { schema: 'moranjianghu-creative-workshop-standard-module', version: 2, scope: draft.scope, style, workflowJson: draft.body.trim(), content: draft.body.trim(), contentBlocks, usagePrompt, safetyNotes }
            : { schema: 'moranjianghu-creative-workshop-standard-module', version: 2, mode: draft.mode, content: draft.body.trim(), contentBlocks, usagePrompt, safetyNotes },
        contentBlocks,
        usagePrompt,
        safetyNotes,
        injectionPreview: injectionPreview.length ? injectionPreview : ['暂未填写注入内容。'],
        source: 'local',
        contributor: contributor.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
};

const 构建模式包模块 = (draft: 贡献草稿, contributor: string): 创意工坊模块条目 => {
    const stamp = Date.now();
    const suiteTitle = draft.title.trim();
    const suiteId = `suite-${draft.mode}-${stamp}`;
    const baseMode = draft.modeRuntimeProfile.identity.baseMode || draft.mode;
    const tags = [
        baseMode,
        '模式包',
        ...draft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean)
    ].filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 12);
    const safetyNotes = 分割文本行(draft.safetyNotes);
    const usagePrompt = draft.usagePrompt.trim() || '作为完整模式包注入新建存档：模式专属世界书会统一接管题材口径、世界规则和能力体系。';
    const modeMetadata = 构建模式元数据(draft);
    const worldDetailGeneration = 构建世界细节生成配置(draft);
    const worldDetailContent = 渲染世界细节生成配置(worldDetailGeneration);
    const modeRuntimeProfile = 规范化模式运行时配置({
        ...draft.modeRuntimeProfile,
        identity: {
            ...draft.modeRuntimeProfile.identity,
            modeId: suiteId,
            displayName: suiteTitle,
            baseMode
        },
        economy: {
            ...draft.modeRuntimeProfile.economy,
            currencyDisplayMode: modeMetadata.currencyDisplayMode,
            marketName: modeMetadata.auctionName,
            marketVerb: modeMetadata.marketVerb
        },
        ability: {
            ...draft.modeRuntimeProfile.ability,
            skillPool: modeMetadata.skillNames
        },
        items: {
            ...draft.modeRuntimeProfile.items,
            initialItemPool: modeMetadata.presetItemKeywords
        },
        map: {
            ...draft.modeRuntimeProfile.map,
            mapPrompt: [
                modeMetadata.mapPrompt,
                !worldDetailGeneration.aiGenerate && worldDetailGeneration.mapDesign.trim()
                    ? '地图生成必须优先使用贡献者填写的地图层级与地图块介绍。'
                    : ''
            ].filter(Boolean).join('\n')
        },
        opening: {
            ...draft.modeRuntimeProfile.opening,
            defaultBackgrounds: modeMetadata.backgroundSuggestions,
            defaultTalents: modeMetadata.talentSuggestions
        }
    }, baseMode);
    const modeWorldbooks = 构建贡献模式世界书({ ...draft, modeRuntimeProfile }, suiteId, suiteTitle);
    const extractedPrompts = 从模式世界书提取提示词(modeWorldbooks);
    const contentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        {
            id: 'topic-main',
            title: '题材模板',
            purpose: '注入手动世界观提示词，定义基本口径、时代、货币、叙事边界和题材禁忌。',
            injectionTarget: 'manualWorldPrompt',
            content: draft.topicBody.trim()
        },
        {
            id: 'world-rules-main',
            title: '世界规则',
            purpose: '追加到世界观细化要求，约束势力、市场、地图、资源和社会规则。',
            injectionTarget: 'worldExtraRequirement',
            content: draft.worldRulesBody.trim()
        },
        {
            id: 'world-detail-main',
            title: '世界细节生成策略',
            purpose: '控制重要人物、重要势力和地图层级是由 AI 默认生成，还是优先使用贡献者自定义内容。',
            injectionTarget: 'worldExtraRequirement',
            content: worldDetailContent
        },
        {
            id: 'ability-main',
            title: '能力体系',
            purpose: '注入手动能力/境界提示词，约束成长体系、战力边界和技能命名。',
            injectionTarget: 'manualRealmPrompt',
            content: draft.abilityBody.trim()
        }
    ];
    const content = contentBlocks.map((block) => [`【${block.title}】`, block.content].join('\n')).join('\n\n');
    return {
        id: `local-${suiteId}-mode-package`,
        type: 'topic',
        formatVersion: 2,
        workshopKind: 'standard_module',
        title: suiteTitle,
        subtitle: draft.subtitle.trim() || `${modeRuntimeProfile.identity.baseMode} · 完整模式包`,
        description: draft.description.trim() || `${modeRuntimeProfile.identity.baseMode}完整模式包。`,
        tags,
        payload: {
            schema: 'moranjianghu-creative-workshop-mode-package',
            version: 3,
            suiteId,
            suiteTitle,
            packagePart: 'mode_package',
            mode: modeRuntimeProfile.identity.baseMode,
            modeMetadata,
            modeRuntimeProfile,
            worldDetailGeneration,
            modeWorldbooks,
            manualWorldPrompt: extractedPrompts.manualWorldPrompt,
            worldExtraRequirement: extractedPrompts.worldExtraRequirement,
            manualRealmPrompt: extractedPrompts.manualRealmPrompt,
            content,
            contentBlocks,
            usagePrompt,
            safetyNotes
        },
        worldDetailGeneration,
        modeWorldbooks,
        modeRuntimeProfile,
        contentBlocks,
        usagePrompt,
        safetyNotes,
        injectionPreview: [
            `完整模式包：${suiteTitle}`,
            `模式世界书：${modeWorldbooks[0]?.条目.length || 0} 条`,
            `适用题材：${modeRuntimeProfile.identity.baseMode}`,
            `市场名称：${modeMetadata.auctionName || '未填写'}`,
            `时间口径：${modeRuntimeProfile.time.displayFormat} / ${modeRuntimeProfile.time.narrativeStyle.slice(0, 80)}`,
            `世界细节：${worldDetailGeneration.aiGenerate ? 'AI 默认生成' : '贡献者自定义'}`,
            `地图口径：${modeMetadata.mapPrompt.slice(0, 120) || '未填写'}`,
            `题材口径：${draft.topicBody.trim().slice(0, 160)}`,
            `世界规则：${draft.worldRulesBody.trim().slice(0, 160)}`,
            `能力体系：${draft.abilityBody.trim().slice(0, 160)}`
        ],
        source: 'local',
        contributor: contributor.trim(),
        createdAt: new Date(stamp).toISOString(),
        updatedAt: new Date(stamp).toISOString()
    };
};

const CreativeWorkshopModal: React.FC<Props> = ({ open, onClose, onNovelDecomposition, onRequireLogin, apiConfig }) => {
    const [activeType, setActiveType] = useState<创意工坊模块类型>('topic');
    const [sourceFilter, setSourceFilter] = useState<来源筛选>('all');
    const [entries, setEntries] = useState<创意工坊模块条目[]>([]);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [contributor, setContributor] = useState('');
    const [anonymousContribution, setAnonymousContribution] = useState(false);
    const [cloudUsername, setCloudUsername] = useState('');
    const [previewEntry, setPreviewEntry] = useState<创意工坊模块条目 | null>(null);
    const [editingEntryId, setEditingEntryId] = useState('');
    const [editingDraft, setEditingDraft] = useState({ title: '', subtitle: '', description: '', tags: '', contributor: '', anonymous: false });
    const [contributionDraft, setContributionDraft] = useState<贡献草稿>(() => 空贡献草稿());
    const [currencySystemJsonDraft, setCurrencySystemJsonDraft] = useState(() => 格式化CurrencySystemJson(空贡献草稿().modeRuntimeProfile));
    const [currencySystemJsonError, setCurrencySystemJsonError] = useState('');
    const [showContributionForm, setShowContributionForm] = useState(true);
    const jsonImportInputRef = useRef<HTMLInputElement | null>(null);
    const contributionModule = useMemo(() => 构建贡献模块(contributionDraft, contributor), [contributionDraft, contributor]);
    const contributionModules = useMemo(() => (
        contributionDraft.type === 'comfy_workflow'
            ? [contributionModule]
            : [构建模式包模块(contributionDraft, contributor)]
    ), [contributionDraft, contributionModule, contributor]);
    const worldDetailsReady = contributionDraft.aiGenerateWorldDetails || 世界细节配置有自定义内容(构建世界细节生成配置(contributionDraft));
    const contributionReady = contributionDraft.title.trim().length > 0 && (
        contributionDraft.type === 'comfy_workflow'
            ? contributionDraft.body.trim().length > 0
            : contributionDraft.topicBody.trim().length > 0
                && contributionDraft.worldRulesBody.trim().length > 0
                && contributionDraft.abilityBody.trim().length > 0
                && contributionDraft.auctionName.trim().length > 0
                && contributionDraft.marketVerb.trim().length > 0
                && contributionDraft.mapPrompt.trim().length > 0
                && 分割短语(contributionDraft.skillNames).length > 0
                && 分割短语(contributionDraft.presetItemKeywords).length > 0
                && 分割短语(contributionDraft.backgroundSuggestions).length > 0
                && 分割短语(contributionDraft.talentSuggestions).length > 0
                && worldDetailsReady
    );
    useEffect(() => {
        if (currencySystemJsonError) return;
        setCurrencySystemJsonDraft(格式化CurrencySystemJson(contributionDraft.modeRuntimeProfile));
    }, [contributionDraft.modeRuntimeProfile.economy.currencySystem, currencySystemJsonError]);

    const 更新CurrencySystemJson = (value: string) => {
        setCurrencySystemJsonDraft(value);
        const trimmed = value.trim();
        if (!trimmed) {
            setCurrencySystemJsonError('');
            setContributionDraft((prev) => {
                const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, ['economy', 'currencySystem'], undefined);
                return {
                    ...prev,
                    modeRuntimeProfile: 规范化模式运行时配置(nextProfile, prev.mode)
                };
            });
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch (error) {
            setCurrencySystemJsonError(error instanceof Error ? `JSON 解析失败：${error.message}` : 'JSON 解析失败');
            return;
        }
        const currencySystem = 规范化显式CurrencySystem(parsed);
        if (!currencySystem) {
            setCurrencySystemJsonError('currencySystem 结构非法：请检查 id/name/baseUnitId、units、baseRate、order、aliases 和 baseUnit。');
            return;
        }
        setCurrencySystemJsonError('');
        setContributionDraft((prev) => {
            const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, ['economy', 'currencySystem'], currencySystem);
            return {
                ...prev,
                modeRuntimeProfile: 规范化模式运行时配置(nextProfile, prev.mode)
            };
        });
    };

    const 更新运行时配置字段 = (field: 运行时配置字段, value: any) => {
        setContributionDraft((prev) => {
            const parsedValue = field.type === 'list'
                ? 分割短语(String(value || ''))
                : field.type === 'record'
                    ? Object.fromEntries(
                        String(value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
                            const eqIdx = l.indexOf('=');
                            return eqIdx === -1 ? [l, ''] : [l.slice(0, eqIdx).trim(), l.slice(eqIdx + 1).trim()];
                        })
                    )
                    : value;
            const isBaseModeChange = field.path.join('.') === 'identity.baseMode' && 题材模式顺序.includes(parsedValue as 题材模式类型);
            if (isBaseModeChange) {
                const nextMode = parsedValue as 题材模式类型;
                return {
                    ...prev,
                    mode: nextMode,
                    ...创建默认模式元数据草稿(nextMode)
                };
            }
            const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, field.path, parsedValue);
            return {
                ...prev,
                modeRuntimeProfile: 规范化模式运行时配置(nextProfile, prev.mode)
            };
        });
    };

    const activeEntries = useMemo(
        () => entries.filter((entry) => 可展示工坊类型集合.has(entry.type) && entry.type === activeType && (sourceFilter === 'all' || entry.source === sourceFilter)),
        [activeType, entries, sourceFilter]
    );

    const refreshEntries = async () => {
        setLoading(true);
        try {
            const nextEntries = (await 列出创意工坊模块()).filter((entry) => 可展示工坊类型集合.has(entry.type));
            setEntries(nextEntries);
            if (!可展示工坊类型集合.has(activeType)) {
                setActiveType('topic');
            }
        } catch (error: any) {
            setStatus(`读取创意工坊失败：${error?.message || '未知错误'}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setPreviewEntry(null);
        const session = 读取云端游玩会话();
        setCloudUsername(session?.username || '');
        void refreshEntries();
    }, [open]);

    if (!open) return null;

    const 校验发布前ComfyUI工作流 = async (entry: 创意工坊模块条目) => {
        if (entry.type !== 'comfy_workflow') return;
        setStatus(`正在真实校验 ComfyUI 工作流「${entry.title}」能否生图...`);
        const workflowJson = 提取ComfyUI工作流模块JSON(entry);
        const result = await 校验ComfyUI工作流可生图({ settings: apiConfig, workflowJson });
        setStatus(`${result.message} 正在继续发布「${entry.title}」。`);
    };

    const 发布模块 = async (entry: 创意工坊模块条目) => {
        if (!cloudUsername) {
            setStatus('正在前往联机登录。登录后回到创意工坊即可继续发布。');
            onRequireLogin?.();
            return;
        }
        setBusyId(entry.id);
        try {
            await 校验发布前ComfyUI工作流(entry);
            const published = await 发布创意工坊模块({ module: entry, contributor, anonymous: anonymousContribution });
            setStatus(`已发布到社区工坊：${published.title}。`);
            await refreshEntries();
        } catch (error: any) {
            setStatus(`发布失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 发布贡献套装 = async () => {
        if (!contributionReady) {
            setStatus(contributionDraft.type === 'comfy_workflow' ? '请先填写模块名称和工作流内容。' : '请完整填写模式元数据，以及模式专属世界书的题材口径、世界规则和能力体系三段内容。');
            return;
        }
        if (!cloudUsername) {
            setStatus('正在前往联机登录。登录后回到创意工坊即可继续发布。');
            onRequireLogin?.();
            return;
        }
        setBusyId('contribution-suite');
        try {
            const published: 创意工坊模块条目[] = [];
            if (contributionDraft.type === 'comfy_workflow') {
                await 校验发布前ComfyUI工作流(contributionModules[0]);
            }
            for (const module of contributionModules) {
                published.push(await 发布创意工坊模块({ module, contributor, anonymous: anonymousContribution }));
            }
            setStatus(contributionDraft.type === 'comfy_workflow'
                ? `已发布到社区工坊：${published[0]?.title || contributionDraft.title}。`
                : `已发布完整模式包「${contributionDraft.title.trim()}」。`);
            setContributionDraft(空贡献草稿());
            await refreshEntries();
        } catch (error: any) {
            setStatus(`发布失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 开始编辑社区模块 = (entry: 创意工坊模块条目) => {
        setEditingEntryId(entry.id);
        setEditingDraft({
            title: entry.title || '',
            subtitle: entry.subtitle || '',
            description: entry.description || '',
            tags: (entry.tags || []).join('、'),
            contributor: entry.anonymous ? '' : (entry.contributor || cloudUsername),
            anonymous: entry.anonymous === true
        });
    };

    const 保存社区模块编辑 = async (entry: 创意工坊模块条目) => {
        setBusyId(entry.id);
        try {
            const updated = await 编辑创意工坊模块({
                id: entry.id,
                anonymous: editingDraft.anonymous,
                patch: {
                    title: editingDraft.title,
                    subtitle: editingDraft.subtitle,
                    description: editingDraft.description,
                    tags: editingDraft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean),
                    contributor: editingDraft.contributor
                }
            });
            setStatus(`已更新社区工坊：${updated.title}。`);
            setEditingEntryId('');
            await refreshEntries();
        } catch (error: any) {
            setStatus(`编辑失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 删除社区模块 = async (entry: 创意工坊模块条目) => {
        if (!window.confirm(`确定删除社区投稿「${entry.title}」吗？`)) return;
        setBusyId(entry.id);
        try {
            await 删除创意工坊模块(entry.id);
            setStatus(`已删除社区投稿：${entry.title}。`);
            await refreshEntries();
        } catch (error: any) {
            setStatus(`删除失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 保存贡献模块到本地 = async () => {
        if (!contributionReady) {
            setStatus('请先填写模块名称和注入内容。');
            return;
        }
        try {
            const modules = contributionModules.map((module) => 导入本地创意工坊模块(module));
            const first = modules[0];
            setStatus(contributionDraft.type === 'comfy_workflow'
                ? `已保存本地贡献「${first.title}」，可以在本地导入分区预览或发布。`
                : `已保存完整模式包「${contributionDraft.title.trim()}」。`);
            setActiveType(first.type);
            setSourceFilter('local');
            setPreviewEntry(first);
            setContributionDraft(空贡献草稿());
            await refreshEntries();
        } catch (error: any) {
            setStatus(`保存失败：${error?.message || '未知错误'}`);
        }
    };

    const 从JSON载荷提取创意工坊模块 = (payload: any): 创意工坊模块条目[] => {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload.flatMap((item) => 从JSON载荷提取创意工坊模块(item));
        if (Array.isArray(payload.modules)) return payload.modules.flatMap((item: any) => 从JSON载荷提取创意工坊模块(item));
        if (payload.module && typeof payload.module === 'object') return 从JSON载荷提取创意工坊模块(payload.module);
        if (payload.type && payload.title) return [payload as 创意工坊模块条目];
        return [];
    };

    const 导入JSON文件 = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        setBusyId('import-json');
        try {
            const imported: 创意工坊模块条目[] = [];
            for (const file of files) {
                const text = await file.text();
                const payload = JSON.parse(text);
                const modules = 从JSON载荷提取创意工坊模块(payload);
                if (modules.length === 0) {
                    throw new Error(`${file.name} 不是可识别的创意工坊 JSON`);
                }
                modules.forEach((module) => imported.push(导入本地创意工坊模块(module)));
            }
            const first = imported[0];
            setStatus(`已导入 ${imported.length} 个本地 JSON 预设${first ? `：${first.title}` : ''}`);
            if (first) {
                setActiveType(first.type);
                setPreviewEntry(first);
            }
            setSourceFilter('local');
            await refreshEntries();
        } catch (error: any) {
            setStatus(`导入 JSON 失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 渲染只读运行时字段 = (profile: ModeRuntimeProfile, section: 运行时配置分区, field: 运行时配置字段) => {
        const fieldType = field.type || 'text';
        const rawValue = 读取运行时路径值(profile, field.path);
        const key = `preview-${section.title}-${field.path.join('.')}`;
        if (fieldType === 'bool') {
            return (
                <label key={key} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-gray-200">
                    <input type="checkbox" checked={Boolean(rawValue)} readOnly disabled className="h-3.5 w-3.5 accent-wuxia-gold disabled:opacity-100" />
                    {field.label}
                </label>
            );
        }
        if (fieldType === 'baseMode') {
            return (
                <label key={key} className="block text-xs text-gray-300">
                    {field.label}
                    <select value={String(rawValue || profile.identity.baseMode)} disabled className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 opacity-100 outline-none">
                        {题材模式顺序.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                </label>
            );
        }
        if (fieldType === 'currencyMode') {
            return (
                <label key={key} className="block text-xs text-gray-300">
                    {field.label}
                    <select value={String(rawValue || profile.economy.currencyDisplayMode)} disabled className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 opacity-100 outline-none">
                        <option value="wuxia">武侠货币</option>
                        <option value="xianxia">仙侠货币</option>
                        <option value="fantasy">西方奇幻</option>
                        <option value="urban">都市/灵气复苏</option>
                        <option value="modern">现代现实</option>
                        <option value="apocalypse">末世物资</option>
                        <option value="infinite">主神奖励</option>
                    </select>
                </label>
            );
        }
        if (fieldType === 'timeFormatMode') {
            return (
                <label key={key} className="block text-xs text-gray-300">
                    {field.label}
                    <select value={String(rawValue || profile.time.displayFormat)} disabled className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 opacity-100 outline-none">
                        <option value="traditional">传统古法</option>
                        <option value="numeric">数字钟点</option>
                        <option value="western">西方奇幻</option>
                        <option value="modern">现代现实</option>
                        <option value="apocalypse">末日生存</option>
                        <option value="infinite">无限流任务</option>
                    </select>
                </label>
            );
        }
        if (fieldType === 'boolGroup') {
            const toggles = (typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}) as Record<string, boolean>;
            return (
                <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                    <div className="mb-1 font-bold">{field.label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {field.boolGroup?.map((opt) => (
                            <label key={opt.key} className="flex items-center gap-1.5 text-gray-400">
                                <input type="checkbox" checked={Boolean(toggles[opt.key])} readOnly disabled className="h-3 w-3 accent-wuxia-gold disabled:opacity-100" />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </label>
            );
        }
        if (fieldType === 'record' || fieldType === 'realmConfig') {
            const displayValue = fieldType === 'realmConfig'
                ? JSON.stringify(rawValue, null, 2)
                : 格式化运行时字段值(profile, field);
            return (
                <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                    {field.label}
                    <textarea value={displayValue} readOnly className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none font-mono" />
                </label>
            );
        }
        const value = 格式化运行时字段值(profile, field);
        const commonClass = 'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none';
        return (
            <label key={key} className={`block text-xs text-gray-300 ${fieldType === 'textarea' || fieldType === 'list' ? 'sm:col-span-2' : ''}`}>
                {field.label}
                {fieldType === 'textarea' || fieldType === 'list' ? (
                    <textarea value={value} readOnly className={`${commonClass} min-h-20 resize-y py-2 leading-5`} />
                ) : (
                    <input value={value} readOnly className={`${commonClass} h-10`} />
                )}
            </label>
        );
    };

    const 渲染注入预览页面 = (entry: 创意工坊模块条目) => {
        const runtimeProfile = 提取模块运行时配置(entry);
        const modeWorldbooks = 提取模块模式世界书(entry);
        const modeMetadata = 提取模块模式元数据(entry);
        const worldDetailGeneration = 提取模块世界细节生成配置(entry);
        const metadataFields = [
            ['题材模式', String(modeMetadata.mode || '')],
            ['货币显示', String(modeMetadata.currencyDisplayMode || '')],
            ['市场名称', String(modeMetadata.auctionName || '')],
            ['市场行为口径', String(modeMetadata.marketVerb || '')],
            ['地图口径', String(modeMetadata.mapPrompt || '')],
            ['时间显示基调', String(modeMetadata.timeDisplayFormat || '')],
            ['时间叙事口径', String(modeMetadata.timeNarrativeStyle || '')],
            ['技能建议', 格式化只读列表(modeMetadata.skillNames)],
            ['预设物品关键词', 格式化只读列表(modeMetadata.presetItemKeywords)],
            ['背景建议', 格式化只读列表(modeMetadata.backgroundSuggestions)],
            ['天赋建议', 格式化只读列表(modeMetadata.talentSuggestions)]
        ].filter(([, value]) => String(value).trim());
        const previewLines = entry.injectionPreview?.length ? entry.injectionPreview : [`payload：${JSON.stringify(entry.payload, null, 2)}`];
        return (
            <div className="space-y-4">
                <section className="rounded-xl border border-wuxia-gold/15 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">只读配置预览</div>
                            <h3 className="mt-2 text-xl font-serif font-bold text-gray-100">{entry.title}</h3>
                            <div className="mt-1 text-sm text-wuxia-gold/80">{entry.subtitle}</div>
                            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-300">{entry.description}</p>
                        </div>
                        <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-gray-300">{entry.source === 'cloud' ? '社区贡献' : entry.source === 'local' ? '本地导入' : '官方预设'}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {entry.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">{tag}</span>)}
                    </div>
                    {entry.usagePrompt && <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3 text-xs leading-5 text-gray-300">使用提示：{entry.usagePrompt}</div>}
                    {entry.safetyNotes?.length ? (
                        <ul className="mt-3 space-y-1 rounded-lg border border-amber-500/15 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/85">
                            {entry.safetyNotes.map((note, index) => <li key={index}>限制：{note}</li>)}
                        </ul>
                    ) : null}
                </section>

                {metadataFields.length ? (
                    <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">模式元数据</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {metadataFields.map(([label, value]) => (
                                <label key={label} className={`block text-xs text-gray-300 ${['地图口径', '技能建议', '预设物品关键词', '背景建议', '天赋建议'].includes(label) ? 'sm:col-span-2' : ''}`}>
                                    {label}
                                    {String(value).length > 80 || ['地图口径', '技能建议', '预设物品关键词', '背景建议', '天赋建议'].includes(label) ? (
                                        <textarea value={String(value)} readOnly className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none" />
                                    ) : (
                                        <input value={String(value)} readOnly className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none" />
                                    )}
                                </label>
                            ))}
                        </div>
                    </section>
                ) : null}

                {entry.type !== 'comfy_workflow' ? (
                    <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
                        <div className="text-xs font-bold tracking-[0.14em] text-emerald-200">世界细节生成</div>
                        <div className="mt-2 text-sm font-bold text-gray-100">
                            {worldDetailGeneration.aiGenerate ? 'AI 默认生成' : '贡献者自定义'}
                        </div>
                        {worldDetailGeneration.aiGenerate ? (
                            <div className="mt-2 text-xs leading-5 text-gray-400">该模块未锁定重要人物、重要势力或地图分布，开局时会按题材口径自动补全。</div>
                        ) : (
                            <div className="mt-3 grid gap-3">
                                {worldDetailGeneration.importantPeople && (
                                    <label className="block text-xs text-gray-300">
                                        重要人物
                                        <textarea value={worldDetailGeneration.importantPeople} readOnly className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none" />
                                    </label>
                                )}
                                {worldDetailGeneration.importantFactions && (
                                    <label className="block text-xs text-gray-300">
                                        重要势力 / 宗门 / 组织
                                        <textarea value={worldDetailGeneration.importantFactions} readOnly className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none" />
                                    </label>
                                )}
                                {worldDetailGeneration.mapDesign && (
                                    <label className="block text-xs text-gray-300">
                                        地图层级与地图块介绍
                                        <textarea value={worldDetailGeneration.mapDesign} readOnly className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none" />
                                    </label>
                                )}
                            </div>
                        )}
                    </section>
                ) : null}

                {runtimeProfile ? (
                    <section className="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-4">
                        <div className="text-xs font-bold tracking-[0.14em] text-sky-200">运行时模式配置</div>
                        <div className="mt-3 space-y-4">
                            {运行时配置分区列表.map((section) => (
                                <div key={section.title} className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="text-xs font-bold text-wuxia-gold">{section.title}</div>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {section.fields.map((field) => 渲染只读运行时字段(runtimeProfile, section, field))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {modeWorldbooks.length ? (
                    <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">模式专属世界书</div>
                        <div className="mt-3 space-y-3">
                            {modeWorldbooks.map((book) => (
                                <div key={book.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <div className="text-sm font-bold text-gray-100">{book.标题}</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-400">{book.描述}</div>
                                    <div className="mt-3 space-y-2">
                                        {book.条目.map((item) => (
                                            <div key={item.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="font-bold text-gray-100">{item.标题}</span>
                                                    <span className="text-gray-500">{item.类型}</span>
                                                    <span className="text-gray-500">优先级 {item.优先级}</span>
                                                </div>
                                                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-300">{item.内容}</pre>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">标准模块内容</div>
                    {entry.contentBlocks?.length ? (
                        <div className="mt-3 space-y-3">
                            {entry.contentBlocks.map((block) => (
                                <div key={block.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <div className="text-xs font-bold text-gray-100">{block.title} <span className="font-normal text-gray-500">· {block.injectionTarget || 'referenceOnly'}</span></div>
                                    <div className="mt-1 text-xs leading-5 text-gray-400">{block.purpose}</div>
                                    <textarea value={block.content} readOnly className="mt-2 min-h-32 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-gray-300 outline-none" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-1 text-xs leading-5 text-gray-300">
                            {previewLines.map((line, index) => <li key={index}>{line}</li>)}
                        </ul>
                    )}
                    <details className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
                        <summary className="cursor-pointer text-xs font-bold text-gray-200">原始模块数据</summary>
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-400">{JSON.stringify(entry.payload, null, 2)}</pre>
                    </details>
                </section>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[430] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div
                className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-wuxia-gold/25 bg-[linear-gradient(180deg,rgba(28,20,10,0.98),rgba(6,6,6,0.98))] shadow-[0_26px_90px_rgba(0,0,0,0.65)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-wuxia-gold/10 px-5 py-4">
                    {previewEntry ? (
                        <div className="min-w-0">
                            <button type="button" onClick={() => setPreviewEntry(null)} className="mb-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-200 hover:border-white/25">返回工坊</button>
                            <div className="text-xs font-mono tracking-[0.28em] text-wuxia-gold">INJECTION PREVIEW</div>
                            <h2 className="mt-2 truncate text-lg font-serif font-bold tracking-[0.18em] text-wuxia-gold">{previewEntry.title}</h2>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/75">
                                {构建预览页说明(previewEntry)}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <div className="text-xs font-mono tracking-[0.28em] text-wuxia-gold">CREATIVE WORKSHOP</div>
                            <h2 className="mt-2 text-lg font-serif font-bold tracking-[0.18em] text-wuxia-gold">创意工坊</h2>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/75">
                                玩家贡献内容的总入口。创意工坊聚焦世界观和天赋背景；开局配置保留在新建存档流程中单独调整。
                            </p>
                        </div>
                    )}
                    <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-black/30 text-xl text-amber-100 transition-colors hover:border-amber-300/50 hover:text-white" aria-label="关闭创意工坊" title="关闭">×</button>
                </div>

                <div className="max-h-[calc(92vh-118px)] overflow-y-auto p-5">
                    {previewEntry ? 渲染注入预览页面(previewEntry) : (
                    <>
                    <button type="button" onClick={() => { onClose(); onNovelDecomposition(); }} className="mb-4 w-full rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-left transition-colors hover:bg-emerald-500/15">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold tracking-[0.14em] text-emerald-300">小说分解模块</div>
                                <div className="mt-2 text-xs leading-5 text-gray-300">导入、拆章、续跑、分段校对、发布和下载小说分解分享 ZIP。</div>
                            </div>
                            <div className="shrink-0 border border-emerald-500/30 px-2 py-1 text-[10px] tracking-[0.14em] text-emerald-200">进入工作台</div>
                        </div>
                    </button>

                    <div className="mb-4 grid gap-2 sm:grid-cols-4">
                        {可展示工坊分区.map((section) => (
                            <button key={section.id} type="button" onClick={() => setActiveType(section.id)} className={`rounded-xl border p-3 text-left transition-colors ${activeType === section.id ? 'border-wuxia-gold/50 bg-wuxia-gold/15 text-wuxia-gold' : 'border-white/10 bg-white/[0.03] text-gray-200 hover:border-wuxia-gold/30'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-bold">{section.title}</div>
                                </div>
                                <div className="mt-1 text-[11px] leading-4 text-gray-400">{section.description}</div>
                            </button>
                        ))}
                    </div>

                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'builtin', 'cloud', 'local'] as 来源筛选[]).map((source) => (
                                <button key={source} type="button" onClick={() => setSourceFilter(source)} className={`rounded-lg border px-3 py-1.5 text-xs ${sourceFilter === source ? 'border-wuxia-gold/50 bg-wuxia-gold/15 text-wuxia-gold' : 'border-white/10 text-gray-300 hover:border-white/25'}`}>
                                    {source === 'all' ? '全部' : source === 'builtin' ? '官方预设' : source === 'cloud' ? '社区贡献' : '本地导入'}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                ref={jsonImportInputRef}
                                type="file"
                                accept="application/json,.json"
                                multiple
                                className="hidden"
                                onChange={(event) => void 导入JSON文件(event)}
                            />
                            <input value={contributor} onChange={(event) => setContributor(event.target.value)} placeholder="贡献者署名" className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/40" />
                            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-gray-200">
                                <input type="checkbox" checked={anonymousContribution} onChange={(event) => setAnonymousContribution(event.target.checked)} className="h-3.5 w-3.5 accent-wuxia-gold" />
                                匿名发布
                            </label>
                            <span className="text-[11px] text-gray-500">{cloudUsername ? `联机账号：${cloudUsername}` : '发布社区投稿需要先登录联机账号'}</span>
                            <button type="button" onClick={() => jsonImportInputRef.current?.click()} disabled={busyId === 'import-json'} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50">{busyId === 'import-json' ? '导入中' : '导入 JSON'}</button>
                            <button type="button" onClick={() => setShowContributionForm((value) => !value)} className="rounded-lg border border-wuxia-gold/25 px-3 py-2 text-xs text-wuxia-gold hover:border-wuxia-gold/45">{showContributionForm ? '收起贡献表单' : '贡献新预设'}</button>
                            <button type="button" onClick={() => void refreshEntries()} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-200 hover:border-white/25 disabled:opacity-50">{loading ? '刷新中' : '刷新社区'}</button>
                        </div>
                    </div>

                    {showContributionForm && (
                        <div className="mb-4 grid gap-4 rounded-xl border border-wuxia-gold/15 bg-white/[0.035] p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                            <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block text-xs text-gray-300">
                                        模块名称
                                        <input value={contributionDraft.title} onChange={(event) => setContributionDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="例如：门派暗线世界规则" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        副标题
                                        <input value={contributionDraft.subtitle} onChange={(event) => setContributionDraft((prev) => ({ ...prev, subtitle: event.target.value }))} placeholder="例如：势力渗透、暗线追踪" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="block text-xs text-gray-300">
                                        贡献类型
                                        <select value={contributionDraft.type} onChange={(event) => setContributionDraft((prev) => ({ ...prev, type: event.target.value as 创意工坊模块类型 }))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45">
                                            <option value="topic">完整模式包（模式专属世界书）</option>
                                            <option value="comfy_workflow">ComfyUI 工作流</option>
                                        </select>
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        适用模式
                                        <select
                                            value={contributionDraft.mode}
                                            onChange={(event) => {
                                                const mode = event.target.value as 题材模式类型;
                                                setContributionDraft((prev) => ({ ...prev, mode, ...创建默认模式元数据草稿(mode) }));
                                            }}
                                            className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                                        >
                                            {题材模式顺序.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                        </select>
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        标签
                                        <input value={contributionDraft.tags} onChange={(event) => setContributionDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder="逗号或空格分隔" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                </div>
                                {contributionDraft.type === 'comfy_workflow' && (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="block text-xs text-gray-300">
                                            工作流风格
                                            <input value={contributionDraft.style} onChange={(event) => setContributionDraft((prev) => ({ ...prev, style: event.target.value }))} placeholder="写实、国风、二次元、像素、NSFW 等" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                        </label>
                                        <label className="block text-xs text-gray-300">
                                            使用范围
                                            <select value={contributionDraft.scope} onChange={(event) => setContributionDraft((prev) => ({ ...prev, scope: event.target.value as 贡献草稿['scope'] }))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45">
                                                <option value="main">普通生图</option>
                                                <option value="scene">场景生图</option>
                                                <option value="nsfw">NSFW 生图</option>
                                                <option value="all">全部生图</option>
                                            </select>
                                        </label>
                                    </div>
                                )}
                                <label className="block text-xs text-gray-300">
                                    简介
                                    <input value={contributionDraft.description} onChange={(event) => setContributionDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="一句话说明这个预设会改变什么体验" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                </label>
                                {contributionDraft.type === 'comfy_workflow' ? (
                                    <label className="block text-xs text-gray-300">
                                        工作流内容
                                        <textarea value={contributionDraft.body} onChange={(event) => setContributionDraft((prev) => ({ ...prev, body: event.target.value }))} placeholder="粘贴 ComfyUI API Workflow JSON，或写清工作流下载/使用说明。" className="mt-1 min-h-36 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                ) : (
                                    <div className="grid gap-3">
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">模式元数据</div>
                                                    <div className="mt-1 text-[11px] leading-5 text-gray-500">用于开局界面、货币显示、市场入口、地图生成、技能/物品/背景/天赋建议。</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setContributionDraft((prev) => ({ ...prev, ...创建默认模式元数据草稿(prev.mode) }))}
                                                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-gray-200 hover:border-white/25"
                                                >
                                                    套用当前题材默认
                                                </button>
                                            </div>
                                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                <label className="block text-xs text-gray-300">
                                                    货币显示
                                                    <select value={contributionDraft.currencyDisplayMode} onChange={(event) => setContributionDraft((prev) => ({ ...prev, currencyDisplayMode: event.target.value as 贡献草稿['currencyDisplayMode'] }))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45">
                                                        <option value="wuxia">武侠货币</option>
                                                        <option value="xianxia">仙侠货币</option>
                                                        <option value="fantasy">西方奇幻</option>
                                                        <option value="urban">都市/灵气复苏</option>
                                                        <option value="modern">现代现实</option>
                                                        <option value="apocalypse">末世物资</option>
                                                        <option value="infinite">主神奖励</option>
                                                    </select>
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    市场名称
                                                    <input value={contributionDraft.auctionName} onChange={(event) => setContributionDraft((prev) => ({ ...prev, auctionName: event.target.value }))} placeholder="例如：市场、联盟商店、营地交易所" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300 sm:col-span-2">
                                                    市场行为口径
                                                    <input value={contributionDraft.marketVerb} onChange={(event) => setContributionDraft((prev) => ({ ...prev, marketVerb: event.target.value }))} placeholder="例如：流入市场、进入联盟商店、在营地交易所寄售" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300 sm:col-span-2">
                                                    地图口径
                                                    <textarea value={contributionDraft.mapPrompt} onChange={(event) => setContributionDraft((prev) => ({ ...prev, mapPrompt: event.target.value }))} placeholder="写清地图应按哪些地点、势力、设施、道路和资源点组织。" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    技能建议
                                                    <textarea value={contributionDraft.skillNames} onChange={(event) => setContributionDraft((prev) => ({ ...prev, skillNames: event.target.value }))} placeholder="用顿号/逗号/换行分隔，例如：调查、谈判、急救" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    预设物品关键词
                                                    <textarea value={contributionDraft.presetItemKeywords} onChange={(event) => setContributionDraft((prev) => ({ ...prev, presetItemKeywords: event.target.value }))} placeholder="用顿号/逗号/换行分隔，例如：净水、药品、电池" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    背景建议
                                                    <textarea value={contributionDraft.backgroundSuggestions} onChange={(event) => setContributionDraft((prev) => ({ ...prev, backgroundSuggestions: event.target.value }))} placeholder="用顿号/逗号/换行分隔，例如：维修工、医护、独行者" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    天赋建议
                                                    <textarea value={contributionDraft.talentSuggestions} onChange={(event) => setContributionDraft((prev) => ({ ...prev, talentSuggestions: event.target.value }))} placeholder="用顿号/逗号/换行分隔，例如：冷静判断、资源嗅觉" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                </label>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="text-xs font-bold tracking-[0.14em] text-emerald-200">世界细节生成</div>
                                                    <div className="mt-1 text-[11px] leading-5 text-gray-400">控制重要人物、重要势力和地图分布由 AI 默认生成，还是由贡献者先写好骨架。</div>
                                                </div>
                                                <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-black/20 px-3 py-2 text-xs text-emerald-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={contributionDraft.aiGenerateWorldDetails}
                                                        onChange={(event) => setContributionDraft((prev) => ({ ...prev, aiGenerateWorldDetails: event.target.checked }))}
                                                        className="h-3.5 w-3.5 accent-emerald-400"
                                                    />
                                                    默认由 AI 生成
                                                </label>
                                            </div>
                                            {!contributionDraft.aiGenerateWorldDetails && (
                                                <div className="mt-3 grid gap-3">
                                                    <label className="block text-xs text-gray-300">
                                                        重要人物
                                                        <textarea
                                                            value={contributionDraft.importantPeople}
                                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, importantPeople: event.target.value }))}
                                                            placeholder="写主要 NPC、关键人物关系、立场、可登场地点和长期目标。"
                                                            className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-emerald-400/60"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-gray-300">
                                                        重要势力 / 宗门 / 组织
                                                        <textarea
                                                            value={contributionDraft.importantFactions}
                                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, importantFactions: event.target.value }))}
                                                            placeholder="写势力名称、地盘、目标、冲突关系、代表资源或宗门/组织特色。"
                                                            className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-emerald-400/60"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-gray-300">
                                                        地图层级与地图块介绍
                                                        <textarea
                                                            value={contributionDraft.mapDesign}
                                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, mapDesign: event.target.value }))}
                                                            placeholder="按 寰宇 / 大地点 / 中地点 / 小地点 / 区地点 / 子地点 写地图分布、父子关系、区域描述、控制势力和剧情用途。"
                                                            className="mt-1 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-emerald-400/60"
                                                        />
                                                    </label>
                                                    {!worldDetailsReady && (
                                                        <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
                                                            未启用 AI 默认生成时，至少填写重要人物、重要势力或地图层级中的一项。
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <details open className="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-3">
                                            <summary className="cursor-pointer text-xs font-bold tracking-[0.14em] text-sky-200">
                                                运行时模式配置
                                            </summary>
                                            <div className="mt-3 space-y-4">
                                                {运行时配置分区列表.map((section) => (
                                                    <div key={section.title} className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="text-xs font-bold text-wuxia-gold">{section.title}</div>
                                                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                            {section.fields.map((field) => {
                                                                const fieldType = field.type || 'text';
                                                                const rawValue = 读取运行时路径值(contributionDraft.modeRuntimeProfile, field.path);
                                                                const key = `${section.title}-${field.path.join('.')}`;
                                                                if (fieldType === 'bool') {
                                                                    return (
                                                                        <label key={key} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-gray-200">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={Boolean(rawValue)}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.checked)}
                                                                                className="h-3.5 w-3.5 accent-wuxia-gold"
                                                                            />
                                                                            {field.label}
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'baseMode') {
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300">
                                                                            {field.label}
                                                                            <select
                                                                                value={String(rawValue || contributionDraft.mode)}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                                                                            >
                                                                                {题材模式顺序.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                                                            </select>
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'currencyMode') {
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300">
                                                                            {field.label}
                                                                            <select
                                                                                value={String(rawValue || contributionDraft.currencyDisplayMode)}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                                                                            >
                                                                                <option value="wuxia">武侠货币</option>
                                                                                <option value="xianxia">仙侠货币</option>
                                                                                <option value="fantasy">西方奇幻</option>
                                                                                <option value="urban">都市/灵气复苏</option>
                                                                                <option value="modern">现代现实</option>
                                                                                <option value="apocalypse">末世物资</option>
                                                                                <option value="infinite">主神奖励</option>
                                                                            </select>
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'timeFormatMode') {
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300">
                                                                            {field.label}
                                                                            <select
                                                                                value={String(rawValue || contributionDraft.modeRuntimeProfile.time.displayFormat)}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                                                                            >
                                                                                <option value="traditional">传统古法</option>
                                                                                <option value="numeric">数字钟点</option>
                                                                                <option value="western">西方奇幻</option>
                                                                                <option value="modern">现代现实</option>
                                                                                <option value="apocalypse">末日生存</option>
                                                                                <option value="infinite">无限流任务</option>
                                                                            </select>
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'boolGroup') {
                                                                    const toggles = (typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}) as Record<string, boolean>;
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                                                                            <div className="mb-1 font-bold">{field.label}</div>
                                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                                {field.boolGroup?.map((opt) => (
                                                                                    <label key={opt.key} className="flex items-center gap-1.5 text-gray-400">
                                                                                        <input type="checkbox" checked={Boolean(toggles[opt.key])}
                                                                                            onChange={(event) => 更新运行时配置字段(field, { ...toggles, [opt.key]: event.target.checked })}
                                                                                            className="h-3 w-3 accent-wuxia-gold" />
                                                                                        {opt.label}
                                                                                    </label>
                                                                                ))}
                                                                            </div>
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'record') {
                                                                    const recordValue = 格式化运行时字段值(contributionDraft.modeRuntimeProfile, field);
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                                                                            {field.label}
                                                                            <textarea value={recordValue}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                placeholder={field.placeholder || '每行一个，格式：键=值'}
                                                                                className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'realmConfig') {
                                                                    const realmValue = (() => {
                                                                        const v = 读取运行时路径值(contributionDraft.modeRuntimeProfile, field.path);
                                                                        if (!v || typeof v !== 'object') return '';
                                                                        return JSON.stringify(v, null, 2);
                                                                    })();
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                                                                            {field.label}
                                                                            <textarea value={realmValue}
                                                                                onChange={(event) => {
                                                                                    try {
                                                                                        const parsed = JSON.parse(event.target.value);
                                                                                        更新运行时配置字段(field, parsed);
                                                                                    } catch {
                                                                                        // JSON parse error — skip update
                                                                                    }
                                                                                }}
                                                                                placeholder='{"levelNames":[],"parseRules":[]}'
                                                                                className="mt-1 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45 font-mono" />
                                                                        </label>
                                                                    );
                                                                }
                                                                if (fieldType === 'currencySystemJson') {
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                                                                            {field.label}
                                                                            <textarea value={currencySystemJsonDraft}
                                                                                onChange={(event) => 更新CurrencySystemJson(event.target.value)}
                                                                                placeholder='{"id":"modern-credit","name":"现代信用点","baseUnitId":"credit","formatStyle":"single","units":[{"id":"credit","name":"信用点","symbol":"点","baseRate":1,"order":1,"aliases":["信用","点数"]}]}'
                                                                                className={`mt-1 min-h-36 w-full resize-y rounded-lg border ${currencySystemJsonError ? 'border-red-400/60' : 'border-white/10'} bg-black/30 px-3 py-2 font-mono text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45`} />
                                                                            <div className="mt-1 text-[11px] leading-5 text-gray-400">
                                                                                留空会清除显式 currencySystem，旧三层 currencyTiers 仍作为兼容 fallback。合法 JSON 会写入 economy.currencySystem。
                                                                            </div>
                                                                            {currencySystemJsonError && (
                                                                                <div className="mt-1 text-[11px] leading-5 text-red-300">{currencySystemJsonError}</div>
                                                                            )}
                                                                        </label>
                                                                    );
                                                                }
                                                                const value = 格式化运行时字段值(contributionDraft.modeRuntimeProfile, field);
                                                                const commonClass = 'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45';
                                                                return (
                                                                    <label key={key} className={`block text-xs text-gray-300 ${fieldType === 'textarea' ? 'sm:col-span-2' : ''}`}>
                                                                        {field.label}
                                                                        {fieldType === 'textarea' || fieldType === 'list' ? (
                                                                            <textarea
                                                                                value={value}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                placeholder={field.type === 'list' ? '用顿号、逗号或换行分隔' : field.placeholder}
                                                                                className={`${commonClass} min-h-20 resize-y py-2 leading-5`}
                                                                            />
                                                                        ) : (
                                                                            <input
                                                                                value={value}
                                                                                onChange={(event) => 更新运行时配置字段(field, event.target.value)}
                                                                                placeholder={field.placeholder}
                                                                                className={`${commonClass} h-10`}
                                                                            />
                                                                        )}
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                        <label className="block text-xs text-gray-300">
                                            世界书条目：题材口径
                                            <textarea value={contributionDraft.topicBody} onChange={(event) => setContributionDraft((prev) => ({ ...prev, topicBody: event.target.value }))} placeholder="写清题材口径：时代、地理、货币、社会常识、叙事禁忌、原著融合比例等。这会成为模式专属世界书的 world_lore 条目。" className="mt-1 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                        </label>
                                        <label className="block text-xs text-gray-300">
                                            世界书条目：世界规则
                                            <textarea value={contributionDraft.worldRulesBody} onChange={(event) => setContributionDraft((prev) => ({ ...prev, worldRulesBody: event.target.value }))} placeholder="写清世界运行规则：势力、资源、市场、科技/感染/地图/交易/阵营边界等。这会成为模式专属世界书的 system_rule 条目。" className="mt-1 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                        </label>
                                        <label className="block text-xs text-gray-300">
                                            世界书条目：能力体系
                                            <textarea value={contributionDraft.abilityBody} onChange={(event) => setContributionDraft((prev) => ({ ...prev, abilityBody: event.target.value }))} placeholder="写清境界/能力/战力等级、差距口径、成长资源、技能命名和判定边界。这会成为模式专属世界书的 system_rule 条目。" className="mt-1 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                        </label>
                                    </div>
                                )}
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block text-xs text-gray-300">
                                        使用提示
                                        <textarea value={contributionDraft.usagePrompt} onChange={(event) => setContributionDraft((prev) => ({ ...prev, usagePrompt: event.target.value }))} placeholder="例如：适合开启同人融合后作为模式专属世界书使用。" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        安全/限制说明
                                        <textarea value={contributionDraft.safetyNotes} onChange={(event) => setContributionDraft((prev) => ({ ...prev, safetyNotes: event.target.value }))} placeholder="每行一条，例如：不要包含本机路径、账号密钥或未授权素材。" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => void 保存贡献模块到本地()} disabled={!contributionReady} className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-45">保存到本地</button>
                                    <button type="button" onClick={() => void 发布贡献套装()} disabled={!contributionReady || Boolean(busyId)} title={cloudUsername ? '发布到社区工坊' : '点击后先登录联机账号'} className="rounded-lg border border-sky-500/35 bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/25 disabled:opacity-45">发布到社区</button>
                                    <button type="button" onClick={() => setContributionDraft(空贡献草稿())} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-200 hover:border-white/25">清空</button>
                                </div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                                <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">实时预览</div>
                                <div className="mt-3 text-base font-serif font-bold text-gray-100">{contributionDraft.title.trim() || '未命名预设'}</div>
                                <div className="mt-1 text-xs text-wuxia-gold/80">{contributionDraft.type === 'comfy_workflow' ? contributionModule.subtitle : `${contributionDraft.mode} · 完整模式包`}</div>
                                <p className="mt-2 text-sm leading-6 text-gray-300">{contributionDraft.description.trim() || (contributionDraft.type === 'comfy_workflow' ? contributionModule.description : '一次贡献一个模式专属世界书，包含题材口径、世界规则和能力体系。')}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {contributionModules[0]?.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">{tag}</span>)}
                                </div>
                                <div className="mt-3 rounded-lg border border-wuxia-gold/15 bg-black/30 p-3">
                                    <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">标准格式预览</div>
                                    <div className="mt-2 text-xs leading-5 text-gray-300">使用提示：{contributionDraft.type === 'comfy_workflow' ? contributionModule.usagePrompt : '完整模式包会以模式专属世界书的形式统一生效。'}</div>
                                    {contributionDraft.type !== 'comfy_workflow' && (
                                        <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-[11px] leading-5 text-emerald-100">
                                            世界细节：{contributionDraft.aiGenerateWorldDetails ? 'AI 默认生成' : '贡献者自定义'}
                                        </div>
                                    )}
                                    <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-300">
                                        {contributionModules.flatMap((module) => module.injectionPreview.slice(0, 4)).map((line, index) => <li key={index}>{line}</li>)}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {status && <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{status}</div>}

                    <div className="grid gap-3 lg:grid-cols-2">
                        {activeEntries.map((entry) => {
                            const canPublishEntry = entry.source !== 'builtin' && entry.source !== 'cloud' && (
                                entry.type === 'comfy_workflow' || typeof (entry.payload as any)?.suiteId === 'string'
                            );
                            const canManageEntry = entry.source === 'cloud' && Boolean(cloudUsername) && entry.ownerUsername === cloudUsername;
                            const editing = editingEntryId === entry.id;
                            return (
                                <div key={`${entry.source || 'builtin'}:${entry.id}`} className="rounded-xl border border-white/10 bg-black/25 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-serif font-bold text-gray-100">{entry.title}</h3>
                                            <div className="mt-1 text-xs text-wuxia-gold/80">{entry.subtitle}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">{entry.source === 'cloud' ? '社区贡献' : entry.source === 'local' ? '本地导入' : '官方预设'} · {entry.contributor || '匿名'}</div>
                                        </div>
                                        <div className="shrink-0 border border-white/15 px-2 py-0.5 text-[10px] text-gray-300">可注入</div>
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-gray-300">{entry.description}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {entry.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">{tag}</span>)}
                                    </div>
                                    {editing && (
                                        <div className="mt-3 space-y-2 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <input value={editingDraft.title} onChange={(event) => setEditingDraft((prev) => ({ ...prev, title: event.target.value }))} className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none focus:border-sky-400/50" placeholder="模块名称" />
                                                <input value={editingDraft.subtitle} onChange={(event) => setEditingDraft((prev) => ({ ...prev, subtitle: event.target.value }))} className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none focus:border-sky-400/50" placeholder="副标题" />
                                            </div>
                                            <input value={editingDraft.description} onChange={(event) => setEditingDraft((prev) => ({ ...prev, description: event.target.value }))} className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none focus:border-sky-400/50" placeholder="简介" />
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <input value={editingDraft.tags} onChange={(event) => setEditingDraft((prev) => ({ ...prev, tags: event.target.value }))} className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none focus:border-sky-400/50" placeholder="标签" />
                                                <input value={editingDraft.contributor} onChange={(event) => setEditingDraft((prev) => ({ ...prev, contributor: event.target.value }))} disabled={editingDraft.anonymous} className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-gray-100 outline-none focus:border-sky-400/50 disabled:opacity-50" placeholder="署名" />
                                            </div>
                                            <label className="inline-flex items-center gap-2 text-xs text-gray-200">
                                                <input type="checkbox" checked={editingDraft.anonymous} onChange={(event) => setEditingDraft((prev) => ({ ...prev, anonymous: event.target.checked }))} className="h-3.5 w-3.5 accent-wuxia-gold" />
                                                匿名显示
                                            </label>
                                        </div>
                                    )}
                                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                        <button type="button" onClick={() => setPreviewEntry(entry)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">预览注入</button>
                                        <button type="button" onClick={() => 下载JSON(entry)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">下载 JSON</button>
                                        <button type="button" onClick={() => void 复制文本(构建模块摘要(entry)).then((ok) => setStatus(ok ? `已复制「${entry.title}」注入摘要。` : '复制失败，请改用下载 JSON。'))} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">复制摘要</button>
                                        {canPublishEntry && (
                                            <button type="button" onClick={() => void 发布模块(entry)} disabled={Boolean(busyId)} title={cloudUsername ? '贡献社区' : '点击后先登录联机账号'} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/15 disabled:opacity-50">贡献社区</button>
                                        )}
                                        {canManageEntry && !editing ? (
                                            <button type="button" onClick={() => 开始编辑社区模块(entry)} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/15">编辑投稿</button>
                                        ) : null}
                                        {canManageEntry && editing ? (
                                            <button type="button" onClick={() => void 保存社区模块编辑(entry)} disabled={Boolean(busyId)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50">保存编辑</button>
                                        ) : null}
                                        {canManageEntry && editing ? (
                                            <button type="button" onClick={() => setEditingEntryId('')} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">取消编辑</button>
                                        ) : null}
                                        {canManageEntry ? (
                                            <button type="button" onClick={() => void 删除社区模块(entry)} disabled={Boolean(busyId)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15 disabled:opacity-50">删除投稿</button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreativeWorkshopModal;
