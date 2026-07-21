import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 从模式世界书提取提示词, 创意工坊模块分区, 创意工坊模块可发布到社区, 获取创意工坊模块来源标签, 是否完整模式包Payload, type 创意工坊模块条目, type 创意工坊模块类型, type 创意工坊世界细节生成配置 } from '../../../data/creativeWorkshopModules';
import { 获取题材预设背景, 获取题材预设天赋 } from '../../../data/presets';
import type { 接口设置结构, ModeRuntimeProfile, 世界书结构, 世界书条目结构 } from '../../../types';
import {
    从创意工坊模块提取背景天赋池,
    格式化背景天赋池JSON,
    格式化背景天赋校验状态文案,
    构建背景天赋池摘要行,
    校验创意工坊模块背景天赋,
    校验工坊背景天赋池,
    规范化工坊背景列表,
    规范化工坊背景列表详细,
    规范化工坊天赋列表,
    规范化工坊天赋列表详细,
    解析工坊池JSON
} from '../../../utils/workshopBackgroundTalentMeta';
import { 模式市场行情影响类型列表, type CurrencySystem, type 题材模式类型, type 模式市场行情模板 } from '../../../models/system';
import { 题材模式配置表, 题材模式顺序 } from '../../../utils/topicModeProfiles';
import { 构建货币系统模板, 构建官方模式运行时配置, 规范化模式运行时配置, 渲染模式运行时配置世界书内容, 规范化显式货币系统 } from '../../../utils/modeRuntimeProfile';
import { 获取题材界面文案, 获取题材资源文案, 获取题材档案文案 } from '../../../utils/resourceLabels';
import { 按题材获取类别映射, 规范能力类别键列表 } from '../../../utils/abilityCategoryLabels';
import { 开局生成性别选项 } from '../../../utils/openingConfig';
import {
    编辑创意工坊模块,
    删除创意工坊模块,
    删除本地创意工坊模块,
    发布创意工坊模块,
    导入本地创意工坊模块,
    合并最新本地创意工坊模块,
    更新本地创意工坊模块,
    列出创意工坊模块,
    提取ComfyUI工作流模块JSON
} from '../../../services/creativeWorkshop';
import { 读取云端游玩会话 } from '../../../services/cloudPlayService';
import { 校验ComfyUI工作流可生图 } from '../../../services/ai/comfyWorkflowValidation';
import CurrencySystemEditor from './CurrencySystemEditor';
import { 规范化酒馆预设 } from '../../../utils/tavernPreset';

interface Props {
    open: boolean;
    onClose: () => void;
    onNovelDecomposition: () => void;
    onRequireLogin?: () => void;
    apiConfig?: 接口设置结构;
}

type 来源筛选 = 'all' | 'builtin' | 'cloud' | 'local';
type 货币系统编辑模式 = 'dynamic' | 'legacy' | 'json';
const 可展示工坊类型: 创意工坊模块类型[] = ['topic', 'tavern_preset', 'comfy_workflow'];
const 可展示工坊类型集合 = new Set<创意工坊模块类型>(可展示工坊类型);
const 可展示工坊分区 = 创意工坊模块分区.filter((section) => 可展示工坊类型集合.has(section.id));
const 默认生成性别占位 = `${开局生成性别选项.map((item) => item.value).join('、')}；留空默认全选`;
type 运行时配置字段类型 = 'text' | 'textarea' | 'list' | 'record' | 'number' | 'bool' | 'boolGroup' | 'baseMode' | 'currencyMode' | 'timeFormatMode' | 'realmConfig' | 'currencySystemModeSelector' | 'economyGroupTitle' | 'currencySystemEditor' | 'currencySystemJson' | 'json' | 'marketTemplates' | 'uiLabels';
type 运行时配置字段 = { label: string; path: string[]; type?: 运行时配置字段类型; placeholder?: string; expectedShape?: 'array' | 'object'; boolGroup?: { label: string; key: string }[] };
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
            { label: '货币系统模式', path: ['economy', '__currencySystemMode'], type: 'currencySystemModeSelector' },
            { label: '新版动态货币系统（推荐）', path: ['economy', '__dynamicCurrency'], type: 'economyGroupTitle', placeholder: '支持单一货币、多层货币、自定义单位。推荐新模板使用。' },
            { label: '可视化 currencySystem 编辑器', path: ['economy', 'currencySystem'], type: 'currencySystemEditor' },
            { label: '旧版三层货币系统（兼容）', path: ['economy', '__legacyCurrency'], type: 'economyGroupTitle', placeholder: '用于旧模板兼容。当未启用新版动态货币系统时生效。' },
            { label: '货币显示', path: ['economy', 'currencyDisplayMode'], type: 'currencyMode' },
            { label: '上层货币名称', path: ['economy', 'currencyTiers', 'upperName'] },
            { label: '中层货币名称', path: ['economy', 'currencyTiers', 'middleName'] },
            { label: '底层货币名称', path: ['economy', 'currencyTiers', 'lowerName'] },
            { label: '上转中汇率', path: ['economy', 'currencyTiers', 'upperToMiddleRate'] },
            { label: '中转底汇率', path: ['economy', 'currencyTiers', 'middleToLowerRate'] },
            { label: '高级配置', path: ['economy', '__advancedCurrency'], type: 'economyGroupTitle', placeholder: '普通用户建议使用上方可视化编辑器；熟悉 JSON 的用户可在这里精修。' },
            { label: '高级 currencySystem JSON', path: ['economy', 'currencySystem'], type: 'currencySystemJson' },
            { label: '经济说明与市场口径', path: ['economy', '__marketCurrency'], type: 'economyGroupTitle', placeholder: '下方内容不决定新版/旧版货币模式，只用于约束题材描述、市场名称、物品类型和禁用关键词。' },
            { label: '题材货币说明', path: ['economy', 'primaryCurrency'], type: 'textarea' },
            { label: '底层记账单位', path: ['economy', 'accountingUnit'] },
            { label: '旧版换算说明（仅无 currencySystem 时生效）', path: ['economy', 'exchangeRules'], type: 'textarea' },
            { label: '市场名称', path: ['economy', 'marketName'] },
            { label: '市场行情模板（可选）', path: ['economy', 'marketEventTemplates'], type: 'marketTemplates' },
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
            { label: 'NPC 自动生图风格', path: ['npc', 'autoImageStyle'], type: 'textarea' }
        ]
    },
    {
        title: '世界叙事',
        fields: [
            { label: '性别比例自动演变', path: ['性别比例演变预设'], type: 'bool' },
            { label: 'NPC 男女比例（男:女）', path: ['npc', 'genderRatio'], type: 'text' },
            { label: '启用叙事平静值', path: ['叙事平静值配置', '启用'], type: 'bool' },
            { label: '无标签增量', path: ['叙事平静值配置', '无标签增量'], type: 'number' },
            { label: '延续增量', path: ['叙事平静值配置', '延续增量'], type: 'number' },
            { label: '上限', path: ['叙事平静值配置', '上限'], type: 'number' },
            { label: '最低触发阈值', path: ['叙事平静值配置', '最低触发阈值'], type: 'number' },
            { label: '阈值文本', path: ['叙事平静值配置', '阈值文本'], type: 'list' }
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
        title: '界面文案覆盖',
        fields: [
            { label: '界面文案覆盖（可选）', path: ['uiLabels'], type: 'uiLabels' }
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

export type 贡献草稿 = {
    title: string;
    subtitle: string;
    description: string;
    type: 创意工坊模块类型;
    moduleKind: 'mode_package' | 'standard';
    mode: 题材模式类型;
    currencyDisplayMode: 'wuxia' | 'xianxia' | 'fantasy' | 'urban' | 'modern' | 'apocalypse' | 'infinite';
    auctionName: string;
    marketVerb: string;
    mapPrompt: string;
    skillNames: string;
    presetItemKeywords: string;
    backgroundSuggestions: string;
    talentSuggestions: string;
    /** 完整出身背景池 JSON（含可选 自带天赋 引用） */
    backgroundsPoolJson: string;
    /** 完整天赋池 JSON（含可选 隐藏 / 叙事约束） */
    talentsPoolJson: string;
    modeRuntimeProfile: ModeRuntimeProfile;
    tags: string;
    body: string;
    topicBody: string;
    worldRulesBody: string;
    abilityBody: string;
    mainStoryDirection: string;
    hiddenPlotPolicy: string;
    worldEvolutionPolicy: string;
    aiGenerateWorldDetails: boolean;
    importantPeople: string;
    importantFactions: string;
    mapDesign: string;
    usagePrompt: string;
    safetyNotes: string;
    style: string;
    scope: 'main' | 'scene' | 'nsfw' | 'all';
    versionNote: string;
    sourceModuleSnapshot?: 创意工坊模块条目;
    mapDiyDraft?: 创意工坊世界细节生成配置['mapDiyDraft'];
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

const 构建模块摘要 = (entry: 创意工坊模块条目): string => {
    const poolCheck = 校验创意工坊模块背景天赋(entry);
    const poolLines = (poolCheck.backgrounds.length > 0 || poolCheck.talents.length > 0)
        ? ['', '出身/天赋池：', ...构建背景天赋池摘要行(poolCheck)]
        : [];
    return [
        `《${entry.title}》`,
        entry.description,
        `标签：${entry.tags.join('、')}`,
        entry.usagePrompt ? `使用提示：${entry.usagePrompt}` : '',
        ...poolLines,
        '',
        entry.contentBlocks?.length ? '内容分段：' : '注入预览：',
        ...(entry.contentBlocks?.length
            ? entry.contentBlocks.map((block) => `【${block.title}】${block.purpose}\n${block.content}`)
            : (entry.injectionPreview?.length ? entry.injectionPreview : [`模块数据：${JSON.stringify(entry.payload, null, 2)}`]))
    ].filter(Boolean).join('\n');
};

const 解析草稿背景天赋池 = (draft: 贡献草稿, mode: 题材模式类型) => {
    const fallback = 构建模式默认背景天赋池JSON(mode);
    const bgParse = 解析工坊池JSON(draft.backgroundsPoolJson || fallback.backgroundsPoolJson, 'backgrounds', 规范化工坊背景列表详细);
    const talentParse = 解析工坊池JSON(draft.talentsPoolJson || fallback.talentsPoolJson, 'talents', 规范化工坊天赋列表详细);
    const backgrounds = bgParse.items.length > 0 ? bgParse.items : 规范化工坊背景列表(获取题材预设背景(mode));
    const talents = talentParse.items.length > 0 ? talentParse.items : 规范化工坊天赋列表(获取题材预设天赋(mode));
    // 首次 JSON 规范化 issues（invalid_entry / empty_name 等）在清洗后二次校验中会丢失，必须合并透出
    const issues = [
        ...(bgParse.error ? [{ kind: 'invalid_json' as const, message: `背景池 ${bgParse.error}` }] : []),
        ...(talentParse.error ? [{ kind: 'invalid_json' as const, message: `天赋池 ${talentParse.error}` }] : []),
        ...(bgParse.issues || []),
        ...(talentParse.issues || []),
        ...校验工坊背景天赋池({ backgrounds, talents }).issues
    ];
    return { backgrounds, talents, issues, bgParse, talentParse };
};

const 构建模式默认背景天赋池JSON = (mode: 题材模式类型): Pick<贡献草稿, 'backgroundsPoolJson' | 'talentsPoolJson'> => ({
    backgroundsPoolJson: 格式化背景天赋池JSON(获取题材预设背景(mode) as any[]),
    talentsPoolJson: 格式化背景天赋池JSON(获取题材预设天赋(mode) as any[])
});

export const 空贡献草稿 = (): 贡献草稿 => ({
    title: '',
    subtitle: '',
    description: '',
    type: 'topic',
    moduleKind: 'mode_package',
    mode: '武侠',
    ...创建默认模式元数据草稿('武侠'),
    ...构建模式默认背景天赋池JSON('武侠'),
    tags: '',
    body: '',
    topicBody: '',
    worldRulesBody: '',
    abilityBody: '',
    mainStoryDirection: '',
    hiddenPlotPolicy: '',
    worldEvolutionPolicy: '',
    aiGenerateWorldDetails: false,
    importantPeople: '',
    importantFactions: '',
    mapDesign: '',
    usagePrompt: '',
    safetyNotes: '',
    style: '',
    scope: 'main',
    versionNote: ''
});

export const 构建官方模板草稿 = (mode: 题材模式类型): 贡献草稿 => {
    const profile = 题材模式配置表[mode];
    const isModernCity = mode === '现代都市';
    return {
        ...空贡献草稿(),
        mode,
        ...创建默认模式元数据草稿(mode),
        ...构建模式默认背景天赋池JSON(mode),
        title: `${mode}模式包模板`,
        subtitle: `${mode} · 官方默认值模板`,
        description: `以${mode}官方默认配置生成的模式包模板，可下载后修改或直接在表单中改造。`,
        aiGenerateWorldDetails: true,
        topicBody: profile.promptLines.join('\n'),
        worldRulesBody: [
            profile.worldDefaults.worldExtraRequirement,
            profile.promptBoundary,
            `社会与势力格局：${profile.worldDefaults.dynastySetting}`,
            `人物成长环境：${profile.worldDefaults.tianjiaoSetting}`
        ].filter(Boolean).join('\n'),
        abilityBody: profile.manualRealmPrompt,
        mainStoryDirection: isModernCity
            ? '主线优先承接现实日常、工作学习、家庭朋友、兴趣成长和城市生活中的可解决问题；允许轻松、温暖、幽默与阶段性小目标，不默认升级为超凡危机、黑恶阴谋或生死主线。'
            : `主线围绕${profile.hint}自然展开，优先承接玩家选择、当前关系和可持续成长，不用无依据的更大危机强行改写玩家正在体验的方向。`,
        hiddenPlotPolicy: isModernCity
            ? '暗线可以来自人情误会、职场信息差、家庭心事、邻里传闻或小型现实悬念；保持可理解、可回收、不过度阴谋化，不默认扩张为跨国组织、超凡黑幕、连环命案或全城灾难。'
            : '暗线必须来自已出现的人物、势力、资源或信息差，按证据逐步铺垫并保留回收路径；不得凭空升级规模，也不得越过玩家行动提前把伏笔写成既成事实。',
        worldEvolutionPolicy: isModernCity
            ? '后台世界按现实社会节奏推进：公司、学校、社区、家庭、商业、交通与公共事件产生有限且合乎常识的变化；优先生活气息和关系余波，不为制造刺激而持续生成重大事故、犯罪升级或系统性崩坏。'
            : `后台世界遵循${profile.label}的社会秩序、资源逻辑和时间尺度渐进变化；演变应留下可追踪余波，但不得脱离当前题材或持续用灾难抢走玩家主线。`
    };
};

const 分割文本行 = (value: string): string[] => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const 分割短语 = (value: string): string[] => value.split(/[，,、\n]+/).map((line) => line.trim()).filter(Boolean);
const 读取运行时路径值 = (profile: ModeRuntimeProfile, path: string[]): any => (
    path.reduce((current: any, key) => current?.[key], profile as any)
);

const 格式化性别比例值 = (value: unknown): string | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    if (typeof obj.男 === 'number' && typeof obj.女 === 'number') {
        const parts = [`男:${obj.男}`, `女:${obj.女}`];
        if (typeof obj.男娘 === 'number') parts.push(`男娘:${obj.男娘}`);
        if (typeof obj.扶她 === 'number') parts.push(`扶她:${obj.扶她}`);
        return parts.join(' / ');
    }
    return null;
};

const 格式化运行时字段值 = (profile: ModeRuntimeProfile, field: 运行时配置字段): string => {
    const value = 读取运行时路径值(profile, field.path);
    if (typeof value === 'undefined' || value === null) return '';
    if (field.type === 'currencySystemJson' || field.type === 'json') return JSON.stringify(value, null, 2);
    if (field.type === 'record') {
        if (typeof value === 'object' && !Array.isArray(value)) {
            return Object.entries(value).map(([k, v]) => `${k}=${v}`).join('\n');
        }
        return String(value);
    }
    if (Array.isArray(value)) return value.join('、');
    const 性别比例文本 = 格式化性别比例值(value);
    if (性别比例文本) return 性别比例文本;
    return typeof value === 'string' ? value : String(value ?? '');
};

const 格式化货币系统Json = (profile: ModeRuntimeProfile): string => {
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

const Json运行时字段编辑器: React.FC<{
    label: string;
    placeholder?: string;
    value: unknown;
    onApply: (parsed: any) => void;
    expectedShape?: 'array' | 'object';
}> = ({ label, placeholder, value, onApply, expectedShape }) => {
    const serialize = (input: unknown): string => (input === undefined || input === null ? '' : JSON.stringify(input, null, 2));
    const [text, setText] = React.useState(() => serialize(value));
    const [error, setError] = React.useState('');
    const [focused, setFocused] = React.useState(false);
    const externalText = serialize(value);
    // 外部草稿变化（切换模式、重置、导入回填）时同步编辑框；聚焦编辑期间不打断输入
    React.useEffect(() => {
        if (!focused) {
            setText(externalText);
            setError('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [externalText, focused]);
    const handleBlur = () => {
        setFocused(false);
        const trimmed = text.trim();
        if (!trimmed) {
            setError('');
            onApply(undefined);
            return;
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (expectedShape === 'array' && !Array.isArray(parsed)) {
                setError('该字段需要 JSON 数组，当前输入不是数组，未写入。');
                return;
            }
            if (expectedShape === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
                setError('该字段需要 JSON 对象，当前输入不是对象，未写入。');
                return;
            }
            setError('');
            onApply(parsed);
        } catch {
            setError('JSON 无法解析，字段未写入；请修正后再离开输入框。');
        }
    };
    return (
        <label className="block text-xs text-gray-300 [html[data-theme='day']_&]:text-gray-800 sm:col-span-2">
            {label}
            <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={`mt-1 min-h-28 w-full resize-y rounded-lg border ${error ? 'border-red-400/60 [html[data-theme=\'day\']_&]:border-red-600' : 'border-white/10 [html[data-theme=\'day\']_&]:border-amber-900/30'} bg-black/30 px-3 py-2 font-mono text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45 [html[data-theme='day']_&]:bg-white/85 [html[data-theme='day']_&]:text-gray-900 [html[data-theme='day']_&]:placeholder:text-gray-600`}
            />
            <div className="mt-1 text-[11px] leading-5 text-gray-400 [html[data-theme='day']_&]:text-gray-700">留空并移开焦点会清除该字段；合法 JSON 会在移开焦点时写入模式包运行时配置。</div>
            {error && <div className="mt-1 text-[11px] leading-5 text-red-300 [html[data-theme='day']_&]:text-red-700">{error}</div>}
        </label>
    );
};

const 市场行情模板编辑器: React.FC<{
    value: unknown;
    onApply: (templates: 模式市场行情模板[] | undefined) => void;
}> = ({ value, onApply }) => {
    const templates = Array.isArray(value) ? value as 模式市场行情模板[] : [];
    const incompleteRows = templates.map((template, index) => (!String(template.标题 || '').trim() || !String(template.描述 || '').trim() ? index : -1)).filter((index) => index >= 0);
    const update = (index: number, patch: Partial<模式市场行情模板>) => {
        onApply(templates.map((template, current) => current === index ? { ...template, ...patch } : template));
    };
    const remove = (index: number) => {
        const next = templates.filter((_, current) => current !== index);
        onApply(next.length ? next : undefined);
    };
    return (
        <div className="sm:col-span-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-xs font-bold text-gray-200">市场行情模板（可选）</div>
                    <div className="mt-1 text-[11px] leading-5 text-gray-400">自定义包未填写时使用题材中性行情；官方模式仍保留官方模板。最多保存 24 条。</div>
                </div>
                <button type="button" disabled={templates.length >= 24} onClick={() => onApply([...templates, { 标题: '', 描述: '', 影响类型: '全部', 价格倍率: 1 }])} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45">添加行情（{templates.length}/24）</button>
            </div>
            <div className="mt-3 space-y-3">
                {templates.length === 0 ? <div className="rounded border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-gray-500">尚未配置自定义行情模板</div> : null}
                {templates.map((template, index) => (
                    <div key={index} className={`grid gap-2 rounded-lg border ${incompleteRows.includes(index) ? 'border-red-400/45' : 'border-white/10'} bg-white/[0.025] p-3 sm:grid-cols-12`}>
                        <label className="text-[11px] text-gray-400 sm:col-span-3">标题
                            <input maxLength={40} value={template.标题 || ''} onChange={(event) => update(index, { 标题: event.target.value })} placeholder="节礼采买" className="mt-1 h-9 w-full rounded border border-white/10 bg-black/30 px-2 text-xs text-gray-100 outline-none focus:border-wuxia-gold/45" />
                        </label>
                        <label className="text-[11px] text-gray-400 sm:col-span-5">描述
                            <input maxLength={200} value={template.描述 || ''} onChange={(event) => update(index, { 描述: event.target.value })} placeholder="年节将近，衣料首饰行情看涨。" className="mt-1 h-9 w-full rounded border border-white/10 bg-black/30 px-2 text-xs text-gray-100 outline-none focus:border-wuxia-gold/45" />
                        </label>
                        <label className="text-[11px] text-gray-400 sm:col-span-2">影响类型
                            <select value={template.影响类型 || '全部'} onChange={(event) => update(index, { 影响类型: event.target.value as 模式市场行情模板['影响类型'] })} className="mt-1 h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-gray-100 outline-none focus:border-wuxia-gold/45">
                                {模式市场行情影响类型列表.map((type) => <option key={type} value={type}>{type}</option>) }
                            </select>
                        </label>
                        <label className="text-[11px] text-gray-400 sm:col-span-2">价格倍率
                            <input type="number" min="0.2" max="5" step="0.05" value={template.价格倍率 ?? ''} onChange={(event) => update(index, { 价格倍率: event.target.value as unknown as number })} className="mt-1 h-9 w-full rounded border border-white/10 bg-black/30 px-2 text-xs text-gray-100 outline-none focus:border-wuxia-gold/45" />
                        </label>
                        <label className="text-[11px] text-gray-400 sm:col-span-10">热点标签
                            <input maxLength={24} value={template.热点标签 || ''} onChange={(event) => update(index, { 热点标签: event.target.value || undefined })} placeholder="可选，如：节礼采买" className="mt-1 h-9 w-full rounded border border-white/10 bg-black/30 px-2 text-xs text-gray-100 outline-none focus:border-wuxia-gold/45" />
                        </label>
                        <div className="flex items-end sm:col-span-2"><button type="button" onClick={() => remove(index)} className="h-9 w-full rounded border border-red-500/25 bg-red-500/10 px-2 text-[11px] text-red-200 hover:bg-red-500/20">删除</button></div>
                    </div>
                ))}
            </div>
            {incompleteRows.length > 0 && <div className="mt-2 text-[11px] leading-5 text-red-300">第 {incompleteRows.map((index) => index + 1).join('、')} 条行情缺少标题或描述，补全后才能保存。</div>}
        </div>
    );
};

type 界面文案分区名 = NonNullable<ModeRuntimeProfile['uiLabels']> extends infer T ? keyof T : never;
const 界面文案分区顺序: Array<{ key: 界面文案分区名; label: string }> = [
    { key: '菜单', label: '菜单' }, { key: '标题', label: '标题' }, { key: '组织', label: '组织' }, { key: '资源', label: '资源' },
    { key: '档案', label: '档案' }, { key: '能力类别', label: '能力类别' }, { key: '向导', label: '向导' }, { key: '密度选项', label: '密度选项' }
];

const 获取界面文案分区默认值 = (mode: 题材模式类型, section: 界面文案分区名): Record<string, string> => {
    if (section === '菜单' || section === '标题' || section === '组织') return 获取题材界面文案(mode)[section] as unknown as Record<string, string>;
    if (section === '资源') {
        const labels = 获取题材资源文案(mode);
        return { 分组标题: labels.分组标题, 气血: labels.气血, 精力: labels.精力, 能量: labels.能量 };
    }
    if (section === '档案') return 获取题材档案文案(mode) as unknown as Record<string, string>;
    if (section === '能力类别') {
        const mapped = 按题材获取类别映射(mode);
        return Object.fromEntries(规范能力类别键列表.map((key) => [key, mapped[key] || key]));
    }
    const profile = 题材模式配置表[mode];
    if (section === '密度选项') return Object.fromEntries(profile.densityOptions.map((option) => [option.value, option.label]));
    return {
        worldSizeLabel: profile.worldSizeLabel,
        worldSizeHint: profile.worldSizeHint,
        dynastyLabel: profile.dynastyLabel,
        dynastyHint: profile.dynastyHint,
        densityLabel: profile.densityLabel,
        densityPromptLabel: profile.densityPromptLabel,
        tianjiaoLabel: profile.tianjiaoLabel
    };
};

const 界面文案覆盖编辑器: React.FC<{
    mode: 题材模式类型;
    value: ModeRuntimeProfile['uiLabels'];
    onApply: (labels: ModeRuntimeProfile['uiLabels'] | undefined) => void;
}> = ({ mode, value, onApply }) => {
    const [section, setSection] = useState<界面文案分区名>('菜单');
    const defaults = 获取界面文案分区默认值(mode, section);
    const overrides = (value?.[section] || {}) as Record<string, string>;
    const unknownKeys = Object.keys(overrides).filter((key) => !Object.prototype.hasOwnProperty.call(defaults, key));
    const update = (key: string, nextValue: string) => {
        const nextSection = { ...overrides };
        if (nextValue) nextSection[key] = nextValue;
        else delete nextSection[key];
        const next = { ...(value || {}) } as NonNullable<ModeRuntimeProfile['uiLabels']>;
        if (Object.keys(nextSection).length) (next as any)[section] = nextSection;
        else delete (next as any)[section];
        onApply(Object.keys(next).length ? next : undefined);
    };
    return (
        <div className="sm:col-span-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-bold text-gray-200">界面文案覆盖（可选）</div>
            <div className="mt-1 text-[11px] leading-5 text-gray-400">只填写需要改名的项目；留空即继承当前基础题材。右侧灰字为官方默认文案。</div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {界面文案分区顺序.map((item) => (
                    <button key={String(item.key)} type="button" onClick={() => setSection(item.key)} className={`shrink-0 rounded px-2.5 py-1.5 text-[11px] ${section === item.key ? 'bg-wuxia-gold/20 text-wuxia-gold border border-wuxia-gold/35' : 'border border-white/10 text-gray-400 hover:text-gray-200'}`}>{item.label}</button>
                ))}
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {Object.entries(defaults).map(([key, defaultValue]) => (
                    <label key={key} className="grid gap-1 rounded border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] sm:items-center">
                        <span className="min-w-0 text-[11px] text-gray-300"><span className="font-mono text-gray-500">{key}</span><span className="ml-2 break-all">默认：{defaultValue}</span></span>
                        <input maxLength={120} value={overrides[key] || ''} onChange={(event) => update(key, event.target.value)} placeholder="留空继承默认文案" className="h-9 min-w-0 rounded border border-white/10 bg-black/30 px-2 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-wuxia-gold/45" />
                    </label>
                ))}
            </div>
            {unknownKeys.length ? (
                <div className="mt-3 rounded border border-amber-500/25 bg-amber-500/10 p-2">
                    <div className="text-[11px] font-bold text-amber-200">未识别键（当前引擎不会消费）</div>
                    <div className="mt-2 space-y-1.5">
                        {unknownKeys.map((key) => (
                            <div key={key} className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate text-[11px] text-gray-300">{key} = {overrides[key]}</code>
                                <button type="button" onClick={() => update(key, '')} className="shrink-0 rounded border border-red-500/25 px-2 py-1 text-[10px] text-red-200">清除</button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const 格式化只读列表 = (value: unknown): string => {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('、');
    return typeof value === 'string' ? value : '';
};

const 是否普通对象 = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const 深合并普通对象 = (base: unknown, overlay: unknown): Record<string, any> => {
    const result: Record<string, any> = 是否普通对象(base) ? JSON.parse(JSON.stringify(base)) : {};
    if (!是否普通对象(overlay)) return result;
    for (const [key, value] of Object.entries(overlay)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' || value === undefined) continue;
        result[key] = 是否普通对象(value) && 是否普通对象(result[key]) ? 深合并普通对象(result[key], value) : value;
    }
    return result;
};

const 提取模块原始运行时配置 = (entry: 创意工坊模块条目): Record<string, any> => {
    const payload = entry.payload as any;
    const nested = 是否普通对象(payload?.modeRuntimeProfile) ? payload.modeRuntimeProfile : {};
    const top = 是否普通对象(entry.modeRuntimeProfile) ? entry.modeRuntimeProfile : {};
    return 深合并普通对象(nested, top);
};

const 提取模块运行时配置 = (entry: 创意工坊模块条目): ModeRuntimeProfile | null => {
    const rawProfile = 提取模块原始运行时配置(entry);
    if (!Object.keys(rawProfile).length) return null;
    const payload = entry.payload as any;
    const baseMode = rawProfile.identity?.baseMode || payload?.mode || '武侠';
    return 规范化模式运行时配置(rawProfile, baseMode);
};

const 合并世界书来源 = (payloadBooks: 世界书结构[], topBooks: 世界书结构[]): 世界书结构[] => {
    const result = payloadBooks.map((book) => JSON.parse(JSON.stringify(book)) as 世界书结构);
    for (const top of topBooks) {
        const index = result.findIndex((book) => book.id === top.id);
        if (index < 0) {
            result.push(JSON.parse(JSON.stringify(top)) as 世界书结构);
            continue;
        }
        const payloadBook = result[index];
        const entries = [...(payloadBook.条目 || [])];
        for (const topEntry of top.条目 || []) {
            const entryIndex = entries.findIndex((item) => item.id === topEntry.id);
            if (entryIndex < 0) entries.push(topEntry);
            else entries[entryIndex] = { ...entries[entryIndex], ...topEntry };
        }
        result[index] = { ...payloadBook, ...top, 条目: entries };
    }
    return result;
};

const 提取模块模式世界书 = (entry: 创意工坊模块条目): 世界书结构[] => {
    const payload = entry.payload as any;
    const top = Array.isArray(entry.modeWorldbooks) ? entry.modeWorldbooks : [];
    const nested = Array.isArray(payload?.modeWorldbooks) ? payload.modeWorldbooks : [];
    return 合并世界书来源(nested, top);
};

const 提取模块内容块 = (entry: 创意工坊模块条目): NonNullable<创意工坊模块条目['contentBlocks']> => {
    const payload = entry.payload as any;
    const nested = Array.isArray(payload?.contentBlocks) ? payload.contentBlocks : [];
    const top = Array.isArray(entry.contentBlocks) ? entry.contentBlocks : [];
    const result = nested.map((block: any) => ({ ...block }));
    for (const block of top) {
        const index = result.findIndex((item: any) => item.id === block.id);
        if (index < 0) result.push({ ...block });
        else result[index] = { ...result[index], ...block };
    }
    return result;
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

const 提取模块原始世界细节生成配置 = (entry: 创意工坊模块条目): Record<string, any> => {
    const payload = entry.payload as any;
    const nested = 是否普通对象(payload?.worldDetailGeneration) ? payload.worldDetailGeneration : {};
    const top = 是否普通对象(entry.worldDetailGeneration) ? entry.worldDetailGeneration : {};
    return 深合并普通对象(nested, top);
};

const 提取模块世界细节生成配置 = (entry: 创意工坊模块条目): 创意工坊世界细节生成配置 => {
    const raw = 提取模块原始世界细节生成配置(entry);
    if (!Object.keys(raw).length) return { aiGenerate: true };
    return {
        aiGenerate: raw.aiGenerate !== false,
        importantPeople: typeof raw.importantPeople === 'string' ? raw.importantPeople.trim() : '',
        importantFactions: typeof raw.importantFactions === 'string' ? raw.importantFactions.trim() : '',
        mapDesign: typeof raw.mapDesign === 'string' ? raw.mapDesign.trim() : '',
        mapDiyDraft: raw.mapDiyDraft && typeof raw.mapDiyDraft === 'object' && !Array.isArray(raw.mapDiyDraft) ? raw.mapDiyDraft : undefined
    };
};

const 官方题材模式集: ReadonlySet<string> = new Set(Object.keys(题材模式配置表));

type 模式包正文分区 = 'topic' | 'worldRules' | 'ability';
const 读取模式包正文 = (entry: 创意工坊模块条目, section: 模式包正文分区): string => {
    const payload = entry.payload as any;
    const blocks = 提取模块内容块(entry) as Array<{ id?: string; title?: string; injectionTarget?: string; content?: string }>;
    const config = section === 'topic'
        ? { id: 'topic-main', title: '题材模板', worldbookTitle: '题材口径', payloadKey: 'manualWorldPrompt', target: 'manualWorldPrompt' }
        : section === 'worldRules'
            ? { id: 'world-rules-main', title: '世界规则', worldbookTitle: '世界规则', payloadKey: 'worldExtraRequirement', target: 'worldExtraRequirement' }
            : { id: 'ability-main', title: '能力体系', worldbookTitle: '能力体系', payloadKey: 'manualRealmPrompt', target: 'manualRealmPrompt' };
    const exact = blocks.find((block) => block.id === config.id || block.id?.endsWith(`-${config.id}`));
    if (typeof exact?.content === 'string' && exact.content.trim()) return exact.content;
    const books = 提取模块模式世界书(entry);
    const managedBook = books.find((book) => (book.条目 || []).some((item) => 标准世界书条目键(item.id) === section)) || books.find((book) => (book.条目 || []).filter((item) => 标准世界书条目标题.has(item.标题)).length >= 3);
    const managedEntries = managedBook?.条目 || [];
    const byId = managedEntries.find((item) => 标准世界书条目键(item.id) === section);
    if (byId?.内容?.trim()) return byId.内容;
    const byTitle = managedEntries.filter((item) => item.标题 === config.worldbookTitle);
    if (byTitle.length === 1 && byTitle[0].内容?.trim()) return byTitle[0].内容;
    if (typeof payload?.[config.payloadKey] === 'string' && payload[config.payloadKey].trim()) return payload[config.payloadKey];
    const titled = blocks.filter((block) => block.title === config.title);
    const standardTitleCount = new Set(blocks.filter((block) => ['题材模板', '世界规则', '能力体系'].includes(block.title || '')).map((block) => block.title)).size;
    if (standardTitleCount >= 3 && titled.length === 1 && titled[0].content?.trim()) return titled[0].content;
    const extracted = 从模式世界书提取提示词(books) as any;
    if (typeof extracted?.[config.payloadKey] === 'string' && extracted[config.payloadKey].trim()) return extracted[config.payloadKey];
    return blocks.filter((block) => block.injectionTarget === config.target).map((block) => block.content?.trim()).filter(Boolean).join('\n\n');
};

const 是否模式包模块 = (entry: 创意工坊模块条目): boolean => 是否完整模式包Payload(entry.payload);

export const 从模式包Payload构建模块 = (payload: any): 创意工坊模块条目 | null => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== 'moranjianghu-creative-workshop-mode-package') return null;
    const title = typeof payload.suiteTitle === 'string' && payload.suiteTitle.trim() ? payload.suiteTitle.trim() : '导入模式包';
    const id = typeof payload.suiteId === 'string' && payload.suiteId.trim() ? payload.suiteId.trim() : `payload-mode-package-${Date.now()}`;
    return {
        id: `local-${id}-mode-package`,
        type: 'topic',
        formatVersion: 2,
        workshopKind: 'standard_module',
        title,
        subtitle: `${payload.mode || payload.modeRuntimeProfile?.identity?.baseMode || '武侠'} · 完整模式包`,
        description: typeof payload.description === 'string' ? payload.description : '',
        tags: [payload.mode || payload.modeRuntimeProfile?.identity?.baseMode || '武侠', '模式包'],
        payload,
        worldDetailGeneration: payload.worldDetailGeneration,
        modeWorldbooks: Array.isArray(payload.modeWorldbooks) ? payload.modeWorldbooks : undefined,
        modeRuntimeProfile: payload.modeRuntimeProfile,
        contentBlocks: Array.isArray(payload.contentBlocks) ? payload.contentBlocks : undefined,
        usagePrompt: typeof payload.usagePrompt === 'string' ? payload.usagePrompt : '',
        safetyNotes: Array.isArray(payload.safetyNotes) ? payload.safetyNotes : [],
        injectionPreview: [`完整模式包：${title}`],
        source: 'local',
        contributor: ''
    };
};

const 数组转短语 = (value: unknown): string => (Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean).join('、') : '');

const 合法货币显示模式 = (value: unknown): 贡献草稿['currencyDisplayMode'] | '' => (
    typeof value === 'string' && ['wuxia', 'xianxia', 'fantasy', 'urban', 'modern', 'apocalypse', 'infinite'].includes(value)
        ? value as 贡献草稿['currencyDisplayMode']
        : ''
);

/**
 * 反向映射：把已保存/导入的工坊模块还原为可编辑的贡献草稿（「以此为底稿编辑」）。
 * 模式包模块还原完整表单；普通 topic/ability/comfy_workflow 模块还原正文表单；
 * 酒馆预设没有对应表单形态，返回 null。
 * 保存时只更新表单管理的标准世界书条目，额外世界书、条目及其注入元数据原样保留。
 */
export const 模块转贡献草稿 = (entry: 创意工坊模块条目): 贡献草稿 | null => {
    if (!entry || entry.type === 'tavern_preset') return null;
    const payload = entry.payload as any;
    const 世界细节 = 提取模块世界细节生成配置(entry);
    const 基础 = {
        title: (entry.title || '').trim(),
        subtitle: (entry.subtitle || '').trim(),
        description: (entry.description || '').trim(),
        usagePrompt: (entry.usagePrompt || payload?.usagePrompt || '').trim(),
        safetyNotes: (Array.isArray(entry.safetyNotes) ? entry.safetyNotes : Array.isArray(payload?.safetyNotes) ? payload.safetyNotes : []).join('\n'),
        versionNote: (entry.versionNote || '').trim(),
        aiGenerateWorldDetails: 世界细节.aiGenerate !== false,
        importantPeople: 世界细节.importantPeople || '',
        importantFactions: 世界细节.importantFactions || '',
        mapDesign: 世界细节.mapDesign || '',
        mapDiyDraft: 世界细节.mapDiyDraft,
        sourceModuleSnapshot: JSON.parse(JSON.stringify(entry)) as 创意工坊模块条目
    };
    if (是否模式包模块(entry)) {
        const runtime = 提取模块运行时配置(entry);
        if (!runtime) return null;
        const baseMode = (官方题材模式集.has(runtime.identity.baseMode) ? runtime.identity.baseMode : '武侠') as 题材模式类型;
        const metadata = 提取模块模式元数据(entry);
        const 用户标签 = (entry.tags || []).filter((tag) => tag !== baseMode && tag !== '模式包');
        return {
            ...空贡献草稿(),
            ...基础,
            type: 'topic',
            moduleKind: 'mode_package',
            mode: baseMode,
            tags: 用户标签.join('、'),
            currencyDisplayMode: 合法货币显示模式(metadata.currencyDisplayMode) || runtime.economy.currencyDisplayMode as 贡献草稿['currencyDisplayMode'] || 'wuxia',
            auctionName: String(metadata.auctionName || ''),
            marketVerb: String(metadata.marketVerb || ''),
            mapPrompt: String(metadata.mapPrompt || ''),
            skillNames: 数组转短语(metadata.skillNames),
            presetItemKeywords: 数组转短语(metadata.presetItemKeywords),
            backgroundSuggestions: 数组转短语(metadata.backgroundSuggestions),
            talentSuggestions: 数组转短语(metadata.talentSuggestions),
            backgroundsPoolJson: (() => {
                const pool = 从创意工坊模块提取背景天赋池(entry);
                if (pool.backgrounds.length > 0) return 格式化背景天赋池JSON(pool.backgrounds);
                return 构建模式默认背景天赋池JSON(baseMode).backgroundsPoolJson;
            })(),
            talentsPoolJson: (() => {
                const pool = 从创意工坊模块提取背景天赋池(entry);
                if (pool.talents.length > 0) return 格式化背景天赋池JSON(pool.talents);
                return 构建模式默认背景天赋池JSON(baseMode).talentsPoolJson;
            })(),
            modeRuntimeProfile: runtime,
            topicBody: 读取模式包正文(entry, 'topic'),
            worldRulesBody: 读取模式包正文(entry, 'worldRules'),
            abilityBody: 读取模式包正文(entry, 'ability'),
            mainStoryDirection: typeof payload?.mainStoryDirection === 'string' ? payload.mainStoryDirection : '',
            hiddenPlotPolicy: typeof payload?.hiddenPlotPolicy === 'string' ? payload.hiddenPlotPolicy : '',
            worldEvolutionPolicy: typeof payload?.worldEvolutionPolicy === 'string' ? payload.worldEvolutionPolicy : ''
        };
    }
    const mode = (官方题材模式集.has(String(payload?.mode)) ? payload.mode : (entry.tags || []).find((tag) => 官方题材模式集.has(tag)) || '武侠') as 题材模式类型;
    const blocks = (entry.contentBlocks || payload?.contentBlocks || []) as Array<{ content?: string }>;
    const body = typeof payload?.workflowJson === 'string' && payload.workflowJson
        ? payload.workflowJson
        : (typeof blocks[0]?.content === 'string' && blocks[0].content) || (typeof payload?.content === 'string' ? payload.content : '');
    const entryType: 创意工坊模块类型 = entry.type === 'ability' || entry.type === 'comfy_workflow' ? entry.type : 'topic';
    return {
        ...空贡献草稿(),
        ...创建默认模式元数据草稿(mode),
        ...构建模式默认背景天赋池JSON(mode),
        ...基础,
        type: entryType,
        moduleKind: 'standard',
        mode,
        tags: (entry.tags || []).filter((tag) => tag !== mode && tag !== '酒馆预设').join('、'),
        body,
        style: typeof payload?.style === 'string' ? payload.style : '',
        scope: ['main', 'scene', 'nsfw', 'all'].includes(payload?.scope) ? payload.scope : 'main'
    };
};

const 构建预览页说明 = (entry: 创意工坊模块条目): string => {
    if (entry.type === 'tavern_preset') {
        return '完整只读预设页。这里展示该酒馆预设携带的 prompts、prompt_order、每个选项的启用状态和原始模块数据。';
    }
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
    mapDesign: draft.mapDesign.trim(),
    mapDiyDraft: draft.mapDiyDraft
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
        },
        {
            id: `${suiteId}-narrative-main-story`,
            标题: '主线方向',
            内容: draft.mainStoryDirection.trim() ? `【模式包主线方向】\n${draft.mainStoryDirection.trim()}\n\n边界：本规则只调整叙事取向，不得覆盖变量协议、命令格式、数据结构、安全规则或存档一致性规则。` : '',
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'story_plan', 'heroine_plan'],
            注入模式: 'always',
            关键词: [],
            优先级: 99,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-narrative-hidden-plot`,
            标题: '暗线策略',
            内容: draft.hiddenPlotPolicy.trim() ? `【模式包暗线策略】\n${draft.hiddenPlotPolicy.trim()}\n\n边界：本规则只调整叙事取向，不得覆盖变量协议、命令格式、数据结构、安全规则或存档一致性规则。` : '',
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'opening', 'story_plan', 'heroine_plan', 'world_evolution'],
            注入模式: 'always',
            关键词: [],
            优先级: 98,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        },
        {
            id: `${suiteId}-narrative-world-evolution`,
            标题: '世界推进规则',
            内容: draft.worldEvolutionPolicy.trim() ? `【模式包世界推进规则】\n${draft.worldEvolutionPolicy.trim()}\n\n边界：本规则只调整叙事取向，不得覆盖变量协议、命令格式、数据结构、安全规则或存档一致性规则。` : '',
            条目形态: 'normal',
            类型: 'system_rule',
            作用域: ['main', 'world_evolution', 'story_plan'],
            注入模式: 'always',
            关键词: [],
            优先级: 97,
            启用: true,
            创建时间: Date.now(),
            更新时间: Date.now()
        }
    ].filter((entry) => entry.内容) as 世界书条目结构[]
}];

type 标准世界书条目类型 = 模式包正文分区 | 'metadata' | 'runtime' | 'worldDetails';
const 标准世界书条目标题 = new Set(['模式元数据', '运行时模式配置', '世界细节生成策略', '题材口径', '世界规则', '能力体系']);
const 受管叙事条目后缀与标题 = new Map([
    ['-narrative-main-story', '主线方向'],
    ['-narrative-hidden-plot', '暗线策略'],
    ['-narrative-world-evolution', '世界推进规则']
]);
const 是受管叙事条目 = (entry: 世界书条目结构): boolean => (
    [...受管叙事条目后缀与标题.entries()].some(([suffix, title]) => entry.id.endsWith(suffix) && entry.标题 === title)
);
const 标准世界书条目后缀: Array<[string, 标准世界书条目类型]> = [
    ['-runtime-profile', 'runtime'], ['-world-details', 'worldDetails'], ['-world-rules', 'worldRules'],
    ['-metadata', 'metadata'], ['-topic', 'topic'], ['-ability', 'ability']
];
const 标准世界书条目键 = (id?: string): 标准世界书条目类型 | null => {
    const hit = 标准世界书条目后缀.find(([suffix]) => typeof id === 'string' && id.endsWith(suffix));
    return hit?.[1] || null;
};

const 合并模式世界书 = (original: 世界书结构[], generated: 世界书结构[]): 世界书结构[] => {
    if (!original.length) return generated;
    const generatedBook = generated[0];
    if (!generatedBook) return original;
    const generatedIds = new Set((generatedBook.条目 || []).map((entry) => entry.id));
    const managedByExactId = original.findIndex((book) => (book.条目 || []).some((entry) => generatedIds.has(entry.id)));
    const legacyManagedIndex = original.findIndex((book) => (book.条目 || []).filter((entry) => 标准世界书条目标题.has(entry.标题)).length >= 3);
    const managedBookIndex = managedByExactId >= 0 ? managedByExactId : legacyManagedIndex;
    if (managedBookIndex < 0) return [...original, generatedBook];
    const legacyFallback = managedByExactId < 0;
    const managed = original[managedBookIndex];
    const generatedById = new Map<string, 世界书条目结构>();
    const generatedByTitle = new Map<string, 世界书条目结构>();
    for (const entry of generatedBook.条目 || []) {
        generatedById.set(entry.id, entry);
        generatedByTitle.set(entry.标题, entry);
    }
    const titleCounts = new Map<string, number>();
    for (const entry of managed.条目 || []) titleCounts.set(entry.标题, (titleCounts.get(entry.标题) || 0) + 1);
    const seen = new Set<string>();
    const entries = (managed.条目 || []).filter((entry) => generatedIds.has(entry.id) || !是受管叙事条目(entry)).map((entry) => {
        const next = generatedById.get(entry.id) || (legacyFallback && titleCounts.get(entry.标题) === 1 ? generatedByTitle.get(entry.标题) : undefined);
        if (!next) return entry;
        seen.add(next.id);
        return { ...entry, 内容: next.内容, 更新时间: next.更新时间 };
    });
    const missing = (generatedBook.条目 || []).filter((entry) => !seen.has(entry.id));
    return original.map((book, index) => index === managedBookIndex ? {
        ...book,
        标题: generatedBook.标题,
        描述: generatedBook.描述,
        常驻大纲: generatedBook.常驻大纲,
        更新时间: generatedBook.更新时间,
        条目: [...entries, ...missing]
    } : book);
};

const 标准内容块配置: Array<{ id: string; title: string }> = [
    { id: 'topic-main', title: '题材模板' },
    { id: 'world-rules-main', title: '世界规则' },
    { id: 'world-detail-main', title: '世界细节生成策略' },
    { id: 'ability-main', title: '能力体系' }
];

type 工坊内容块 = NonNullable<创意工坊模块条目['contentBlocks']>[number];
const 合并模式包内容块 = (
    original: NonNullable<创意工坊模块条目['contentBlocks']>,
    generated: NonNullable<创意工坊模块条目['contentBlocks']>
): NonNullable<创意工坊模块条目['contentBlocks']> => {
    if (!original.length) return generated;
    const generatedIds = new Set(generated.map((block) => block.id));
    const hasCanonicalIds = original.some((block) => generatedIds.has(block.id));
    const standardTitles = new Set(标准内容块配置.map((item) => item.title));
    const legacyFallback = !hasCanonicalIds && original.filter((block) => standardTitles.has(block.title)).length >= 3;
    const generatedById = new Map<string, 工坊内容块>();
    const generatedByTitle = new Map<string, 工坊内容块>();
    for (const block of generated) {
        generatedById.set(block.id, block);
        generatedByTitle.set(block.title, block);
    }
    const titleCounts = new Map<string, number>();
    for (const block of original) titleCounts.set(block.title, (titleCounts.get(block.title) || 0) + 1);
    const seen = new Set<string>();
    const merged = original.map((block) => {
        const next = generatedById.get(block.id) || (legacyFallback && titleCounts.get(block.title) === 1 ? generatedByTitle.get(block.title) : undefined);
        if (!next) return block;
        seen.add(next.id);
        return { ...block, content: next.content };
    });
    return [...merged, ...generated.filter((block) => !seen.has(block.id))];
};

const 剥离模式包Payload字段 = (payload: Record<string, unknown>): Record<string, unknown> => {
    const {
        suiteId: _suiteId, suiteTitle: _suiteTitle, packagePart: _packagePart, modeMetadata: _modeMetadata,
        modeRuntimeProfile: _modeRuntimeProfile, worldDetailGeneration: _worldDetailGeneration, modeWorldbooks: _modeWorldbooks,
        manualWorldPrompt: _manualWorldPrompt, worldExtraRequirement: _worldExtraRequirement, manualRealmPrompt: _manualRealmPrompt,
        mainStoryDirection: _mainStoryDirection, hiddenPlotPolicy: _hiddenPlotPolicy, worldEvolutionPolicy: _worldEvolutionPolicy,
        sourceModuleParts: _sourceModuleParts, ...rest
    } = payload as any;
    return rest;
};

export const 构建贡献模块 = (draft: 贡献草稿, contributor: string, existingEntries?: 创意工坊模块条目[]): 创意工坊模块条目 => {
    const title = draft.title.trim();
    const source = draft.sourceModuleSnapshot;
    const sourceIsModePackage = Boolean(source && 是否模式包模块(source));
    const rawSourcePayload = source?.payload && typeof source.payload === 'object' && !Array.isArray(source.payload) ? source.payload as Record<string, unknown> : {};
    const sourcePayload = sourceIsModePackage ? 剥离模式包Payload字段(rawSourcePayload) : rawSourcePayload;
    const effectiveContributor = contributor.trim() || source?.contributor || '';
    const sameSourceChain = Boolean(source && !sourceIsModePackage && source.title === title && (!source.contributor || source.contributor === effectiveContributor));
    const matchingEntry = existingEntries?.find((entry) => entry.title === title && entry.contributor === effectiveContributor && !是否模式包模块(entry));
    const baseId = matchingEntry?.baseModuleId || (sameSourceChain ? source?.baseModuleId : undefined) || `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingVersions = existingEntries?.filter((entry) => entry.baseModuleId === baseId || (entry.title === title && entry.contributor === effectiveContributor && !entry.baseModuleId)) || [];
    const maxVersion = Math.max(0, ...existingVersions.map((entry) => Number(entry.version) || 0), sameSourceChain ? Number(source?.version || 0) : 0);
    const nextVersion = maxVersion + 1;
    const bodyLines = 分割文本行(draft.body);
    const tavernPreset = (() => {
        if (draft.type !== 'tavern_preset') return null;
        try {
            return 规范化酒馆预设(JSON.parse(draft.body.trim() || '{}'));
        } catch {
            return null;
        }
    })();
    const tags = [
        draft.type === 'tavern_preset' ? '酒馆预设' : draft.mode,
        ...draft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean)
    ].filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 12);
    const style = draft.style.trim();
    const scopeLabel = draft.scope === 'nsfw' ? 'NSFW 生图' : draft.scope === 'scene' ? '场景生图' : draft.scope === 'all' ? '通用生图' : '普通生图';
    const injectionTarget = draft.type === 'ability' ? 'manualRealmPrompt' : draft.type === 'comfy_workflow' ? 'imageWorkflow' : draft.type === 'tavern_preset' ? 'referenceOnly' : 'manualWorldPrompt';
    const generatedContentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        {
            id: `${draft.type}-main`,
            title: draft.type === 'ability' ? '能力与境界规则' : draft.type === 'comfy_workflow' ? 'ComfyUI 工作流' : draft.type === 'tavern_preset' ? '酒馆预设 JSON' : '世界与题材规则',
            purpose: draft.type === 'comfy_workflow' ? '提供可导入的生图工作流或工作流说明。' : draft.type === 'tavern_preset' ? '提供可直接选择的 SillyTavern 酒馆预设。' : '作为模型注入的主要规则内容。',
            injectionTarget,
            content: draft.body.trim()
        }
    ];
    const originalContentBlocks = source && !sourceIsModePackage ? 提取模块内容块(source) : [];
    const contentBlocks = 合并模式包内容块(originalContentBlocks, generatedContentBlocks);
    const safetyNotes = 分割文本行(draft.safetyNotes);
    const usagePrompt = draft.usagePrompt.trim() || (draft.type === 'comfy_workflow'
        ? '在文生图设置中选择该工作流；发布前请确认 JSON 可用。'
        : draft.type === 'tavern_preset'
            ? '在酒馆预设设置中选择该预设；提示词顺序、启用开关和正则脚本状态会随预设保留。'
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
        : draft.type === 'tavern_preset'
            ? [
                '标准格式：v2 / tavern_preset',
                `提示词：${tavernPreset?.prompts.length || 0} 条`,
                `顺序槽位：${tavernPreset?.prompt_order.reduce((sum, group) => sum + group.order.length, 0) || 0} 项`,
                `正则脚本：${tavernPreset?.兼容性?.正则脚本总数 || 0} 条`,
                '开关状态：保留 prompt_order enabled 与 regex_scripts disabled 状态'
            ]
        : [
            `标准格式：v2 / ${draft.type}`,
            `适用题材：${draft.mode}`,
            `模块类型：${可展示工坊分区.find((section) => section.id === draft.type)?.title || draft.type}`,
            ...bodyLines.slice(0, 8),
            `使用提示：${usagePrompt}`
        ];
    return {
        ...(source || {}),
        id: `local-${draft.type}-${Date.now()}`,
        type: draft.type,
        formatVersion: 2,
        workshopKind: 'standard_module',
        title,
        subtitle: draft.subtitle.trim() || (draft.type === 'comfy_workflow' ? `${style || '自定义风格'} · ${scopeLabel}` : draft.type === 'tavern_preset' ? '玩家贡献 · SillyTavern 酒馆预设' : `${draft.mode} · 玩家贡献`),
        description: draft.description.trim() || (draft.type === 'tavern_preset' ? '玩家贡献的酒馆预设，可在酒馆预设设置中直接选择使用。' : `${draft.mode}可用的玩家贡献模块。`),
        tags,
        payload: draft.type === 'comfy_workflow'
            ? { ...sourcePayload, schema: 'moranjianghu-creative-workshop-standard-module', version: 2, scope: draft.scope, style, workflowJson: draft.body.trim(), content: draft.body.trim(), contentBlocks, usagePrompt, safetyNotes }
            : draft.type === 'tavern_preset'
                ? { ...sourcePayload, schema: 'moranjianghu-creative-workshop-tavern-preset', version: 1, tavernPreset, content: draft.body.trim(), contentBlocks, usagePrompt, safetyNotes }
                : { ...sourcePayload, schema: 'moranjianghu-creative-workshop-standard-module', version: 2, mode: draft.mode, content: draft.body.trim(), contentBlocks, usagePrompt, safetyNotes },
        tavernPreset: tavernPreset || undefined,
        contentBlocks,
        modeRuntimeProfile: undefined,
        modeWorldbooks: undefined,
        worldDetailGeneration: undefined,
        usagePrompt,
        safetyNotes,
        injectionPreview: injectionPreview.length ? injectionPreview : ['暂未填写注入内容。'],
        source: 'local',
        contributor: effectiveContributor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: nextVersion,
        baseModuleId: baseId,
        versionNote: draft.versionNote?.trim() || ''
    };
};

export const 构建模式包模块 = (draft: 贡献草稿, contributor: string, existingEntries?: 创意工坊模块条目[]): 创意工坊模块条目 => {
    const stamp = Date.now();
    const suiteTitle = draft.title.trim();
    const source = draft.sourceModuleSnapshot;
    const sourcePayload = source?.payload && typeof source.payload === 'object' && !Array.isArray(source.payload) ? source.payload as Record<string, unknown> : {};
    const sourceSuiteId = typeof (sourcePayload as any).suiteId === 'string' ? (sourcePayload as any).suiteId : '';
    const effectiveContributor = contributor.trim() || source?.contributor || '';
    const sameSourceChain = Boolean(source && source.title === suiteTitle && (!source.contributor || source.contributor === effectiveContributor));
    const matchingEntry = existingEntries?.find((entry) => entry.title === suiteTitle && entry.contributor === effectiveContributor && 是否模式包模块(entry));
    const baseId = matchingEntry?.baseModuleId || (sameSourceChain ? source?.baseModuleId || sourceSuiteId : undefined) || `suite-${draft.mode}-${stamp}`;
    const existingVersions = existingEntries?.filter((entry) => entry.baseModuleId === baseId || (entry.title === suiteTitle && entry.contributor === effectiveContributor && !entry.baseModuleId)) || [];
    const maxVersion = Math.max(0, ...existingVersions.map((entry) => Number(entry.version) || 0), sameSourceChain ? Number(source?.version || 0) : 0);
    const nextVersion = maxVersion + 1;
    const suiteId = baseId;
    const baseMode = draft.modeRuntimeProfile.identity.baseMode || draft.mode;
    const tags = [
        baseMode,
        '模式包',
        ...draft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean)
    ].filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 12);
    const safetyNotes = 分割文本行(draft.safetyNotes);
    const usagePrompt = draft.usagePrompt.trim() || '作为完整模式包注入新建存档：模式专属世界书会统一接管题材口径、世界规则和能力体系。';
    const modeMetadata = 构建模式元数据(draft);
    const normalizedWorldDetailGeneration = 构建世界细节生成配置(draft);
    const worldDetailGeneration = 深合并普通对象(source ? 提取模块原始世界细节生成配置(source) : {}, normalizedWorldDetailGeneration) as 创意工坊世界细节生成配置;
    const worldDetailContent = 渲染世界细节生成配置(normalizedWorldDetailGeneration);
    const normalizedModeRuntimeProfile = 规范化模式运行时配置({
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
                !worldDetailGeneration.aiGenerate && (worldDetailGeneration.mapDesign || '').trim()
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
    const modeRuntimeProfile = 深合并普通对象(source ? 提取模块原始运行时配置(source) : {}, normalizedModeRuntimeProfile) as ModeRuntimeProfile;
    const generatedWorldbooks = 构建贡献模式世界书({ ...draft, modeRuntimeProfile }, suiteId, suiteTitle);
    const originalWorldbooks = source ? 提取模块模式世界书(source) : [];
    const modeWorldbooks = 合并模式世界书(originalWorldbooks, generatedWorldbooks);
    const extractedPrompts = 从模式世界书提取提示词(modeWorldbooks);
    const 背景天赋池 = 解析草稿背景天赋池(draft, baseMode);
    const generatedContentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
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
    const originalContentBlocks = source ? 提取模块内容块(source) : [];
    const contentBlocks = 合并模式包内容块(originalContentBlocks, generatedContentBlocks);
    const content = contentBlocks.map((block) => [`【${block.title}】`, block.content].join('\n')).join('\n\n');
    return {
        ...(source || {}),
        id: `local-${suiteId}-v${nextVersion}-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'topic',
        formatVersion: 2,
        workshopKind: 'standard_module',
        title: suiteTitle,
        subtitle: draft.subtitle.trim() || `${modeRuntimeProfile.identity.baseMode} · 完整模式包`,
        description: draft.description.trim() || `${modeRuntimeProfile.identity.baseMode}完整模式包。`,
        tags,
        payload: {
            ...sourcePayload,
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
            mainStoryDirection: draft.mainStoryDirection.trim() || undefined,
            hiddenPlotPolicy: draft.hiddenPlotPolicy.trim() || undefined,
            worldEvolutionPolicy: draft.worldEvolutionPolicy.trim() || undefined,
            backgrounds: 背景天赋池.backgrounds,
            talents: 背景天赋池.talents,
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
            `能力体系：${draft.abilityBody.trim().slice(0, 160)}`,
            ...构建背景天赋池摘要行(背景天赋池)
        ],
        source: 'local',
        contributor: effectiveContributor,
        createdAt: new Date(stamp).toISOString(),
        updatedAt: new Date(stamp).toISOString(),
        version: nextVersion,
        baseModuleId: baseId,
        versionNote: draft.versionNote?.trim() || ''
    };
};

const CreativeWorkshopModal: React.FC<Props> = ({ open, onClose, onNovelDecomposition, onRequireLogin, apiConfig }) => {
    const [activeType, setActiveType] = useState<创意工坊模块类型>('topic');
    const [sourceFilter, setSourceFilter] = useState<来源筛选>('all');
    const [entries, setEntries] = useState<创意工坊模块条目[]>([]);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [reportTarget, setReportTarget] = useState<{ id: string; title: string } | null>(null);
    const [reportText, setReportText] = useState('');
    const [reportGameText, setReportGameText] = useState('');
    const [contributor, setContributor] = useState('');
    const [anonymousContribution, setAnonymousContribution] = useState(false);
    const [cloudUsername, setCloudUsername] = useState('');
    const [previewEntry, setPreviewEntry] = useState<创意工坊模块条目 | null>(null);
    const [previewTavernPreset, setPreviewTavernPreset] = useState<ReturnType<typeof 规范化酒馆预设> | null>(null);
    const [previewTavernPresetStatus, setPreviewTavernPresetStatus] = useState('');
    const [editingEntryId, setEditingEntryId] = useState('');
    const [editingDraft, setEditingDraft] = useState({ title: '', subtitle: '', description: '', tags: '', contributor: '', anonymous: false, moduleJson: '' });
    const [contributionDraft, setContributionDraft] = useState<贡献草稿>(() => 空贡献草稿());
    const [currencySystemJsonDraft, setCurrencySystemJsonDraft] = useState(() => 格式化货币系统Json(空贡献草稿().modeRuntimeProfile));
    const [currencySystemJsonError, setCurrencySystemJsonError] = useState('');
    const [currencySystemEditMode, setCurrencySystemEditMode] = useState<货币系统编辑模式>(() => (
        空贡献草稿().modeRuntimeProfile.economy.currencySystem ? 'dynamic' : 'legacy'
    ));
    const [showContributionForm, setShowContributionForm] = useState(false);
    const [templateMode, setTemplateMode] = useState<题材模式类型>('武侠');
    const jsonImportInputRef = useRef<HTMLInputElement | null>(null);
    const contributionFormRef = useRef<HTMLDivElement | null>(null);
    const refreshRequestIdRef = useRef(0);
    const contributionModule = useMemo(() => 构建贡献模块(contributionDraft, contributor, entries), [contributionDraft, contributor, entries]);
    const isModePackageDraft = contributionDraft.type === 'topic' && contributionDraft.moduleKind === 'mode_package';
    const contributionModules = useMemo(() => (
        isModePackageDraft
            ? [构建模式包模块(contributionDraft, contributor, entries)]
            : [contributionModule]
    ), [contributionDraft, contributionModule, contributor, isModePackageDraft]);
    const worldDetailsReady = contributionDraft.aiGenerateWorldDetails || 世界细节配置有自定义内容(构建世界细节生成配置(contributionDraft));
    const marketTemplatesReady = (contributionDraft.modeRuntimeProfile.economy.marketEventTemplates || []).every((template) => String(template.标题 || '').trim() && String(template.描述 || '').trim());
    const contributionReady = contributionDraft.title.trim().length > 0 && (
        !isModePackageDraft
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
                && marketTemplatesReady
    );
    useEffect(() => {
        if (currencySystemJsonError) return;
        setCurrencySystemJsonDraft(格式化货币系统Json(contributionDraft.modeRuntimeProfile));
    }, [contributionDraft.modeRuntimeProfile.economy.currencySystem, currencySystemJsonError]);
    useEffect(() => {
        setCurrencySystemEditMode((prev) => (
            prev === 'json'
                ? prev
                : contributionDraft.modeRuntimeProfile.economy.currencySystem ? 'dynamic' : 'legacy'
        ));
    }, [contributionDraft.modeRuntimeProfile.economy.currencySystem]);

    useEffect(() => {
        let cancelled = false;
        setPreviewTavernPreset(null);
        setPreviewTavernPresetStatus('');
        if (!previewEntry || previewEntry.type !== 'tavern_preset') return () => { cancelled = true; };

        const 加载预设 = async () => {
            try {
                const rawPreset = previewEntry.tavernPreset || previewEntry.payload?.tavernPreset;
                if (rawPreset) {
                    const normalized = 规范化酒馆预设(rawPreset);
                    if (!normalized) throw new Error('该条目携带的预设 JSON 缺少 prompts / prompt_order。');
                    if (!cancelled) setPreviewTavernPreset(normalized);
                    return;
                }
                if (typeof previewEntry.payload?.presetPath === 'string') {
                    setPreviewTavernPresetStatus('正在读取酒馆预设 JSON...');
                    const response = await fetch(String(previewEntry.payload.presetPath), { cache: 'no-store' });
                    if (!response.ok) throw new Error(`预设读取失败（HTTP ${response.status}）。`);
                    const normalized = 规范化酒馆预设(await response.json());
                    if (!normalized) throw new Error('该预设 JSON 缺少 prompts / prompt_order。');
                    if (!cancelled) {
                        setPreviewTavernPreset(normalized);
                        setPreviewTavernPresetStatus('');
                    }
                    return;
                }
                throw new Error('该条目没有可读取的酒馆预设 JSON。');
            } catch (error: any) {
                if (!cancelled) setPreviewTavernPresetStatus(`无法读取预设：${error?.message || '未知错误'}`);
            }
        };

        void 加载预设();
        return () => { cancelled = true; };
    }, [previewEntry]);

    const 重置贡献草稿 = () => {
        const nextDraft = 空贡献草稿();
        setContributionDraft(nextDraft);
        setCurrencySystemJsonDraft(格式化货币系统Json(nextDraft.modeRuntimeProfile));
        setCurrencySystemJsonError('');
        setCurrencySystemEditMode(nextDraft.modeRuntimeProfile.economy.currencySystem ? 'dynamic' : 'legacy');

    };

    const 贡献草稿有未保存内容 = (): boolean => {
        const { sourceModuleSnapshot: _source, ...currentComparable } = contributionDraft;
        const { sourceModuleSnapshot: _emptySource, ...emptyComparable } = 空贡献草稿();
        return Boolean(contributionDraft.sourceModuleSnapshot) || JSON.stringify(currentComparable) !== JSON.stringify(emptyComparable);
    };

    const 确认并清空贡献草稿 = () => {
        if (贡献草稿有未保存内容() && !window.confirm('清空会永久丢弃当前所有未保存内容，包括运行时配置、行情、界面文案和世界书正文。确定继续吗？')) return;
        重置贡献草稿();
    };

    const 提交工坊反馈 = () => {
        if (!reportTarget || !reportText.trim()) return;
        const key = `moranjianghu.workshop.reports.${reportTarget.id}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({
            text: reportText.trim(),
            gameText: reportGameText.trim() || undefined,
            createdAt: new Date().toISOString(),
            userAgent: navigator.userAgent.slice(0, 120)
        });
        localStorage.setItem(key, JSON.stringify(existing));
        setStatus(`已提交对「${reportTarget.title}」的反馈，感谢！`);
        setReportTarget(null);
        setReportText('');
        setReportGameText('');
    };

    const 获取反馈数量 = (entryId: string): number => {
        try {
            const key = `moranjianghu.workshop.reports.${entryId}`;
            return JSON.parse(localStorage.getItem(key) || '[]').length;
        } catch { return 0; }
    };

    const 更新货币系统Json = (value: string) => {
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
        const currencySystem = 规范化显式货币系统(parsed);
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
            let parsedValue: any;
            if (field.type === 'list') {
                parsedValue = 分割短语(String(value || ''));
            } else if (field.type === 'record') {
                parsedValue = Object.fromEntries(
                    String(value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
                        const eqIdx = l.indexOf('=');
                        return eqIdx === -1 ? [l, ''] : [l.slice(0, eqIdx).trim(), l.slice(eqIdx + 1).trim()];
                    })
                );
            } else if (field.type === 'number') {
                const num = Number(value);
                parsedValue = Number.isFinite(num) ? num : 0;
            } else {
                parsedValue = value;
            }
            const fieldPath = field.path.join('.');
            const isBaseModeChange = fieldPath === 'identity.baseMode' && 题材模式顺序.includes(parsedValue as 题材模式类型);
            if (isBaseModeChange) {
                const nextMode = parsedValue as 题材模式类型;
                const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, field.path, nextMode);
                return { ...prev, mode: nextMode, modeRuntimeProfile: nextProfile };
            }
            const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, field.path, parsedValue);
            const metadataPatch: Partial<贡献草稿> = {};
            if (fieldPath === 'economy.currencyDisplayMode') metadataPatch.currencyDisplayMode = parsedValue;
            if (fieldPath === 'economy.marketName') metadataPatch.auctionName = String(parsedValue || '');
            if (fieldPath === 'economy.marketVerb') metadataPatch.marketVerb = String(parsedValue || '');
            if (fieldPath === 'map.mapPrompt') metadataPatch.mapPrompt = String(parsedValue || '');
            if (fieldPath === 'ability.skillPool') metadataPatch.skillNames = 数组转短语(parsedValue);
            if (fieldPath === 'items.initialItemPool') metadataPatch.presetItemKeywords = 数组转短语(parsedValue);
            if (fieldPath === 'opening.defaultBackgrounds') metadataPatch.backgroundSuggestions = 数组转短语(parsedValue);
            if (fieldPath === 'opening.defaultTalents') metadataPatch.talentSuggestions = 数组转短语(parsedValue);
            const deferNormalization = field.type === 'marketTemplates' || field.type === 'uiLabels';
            return {
                ...prev,
                ...metadataPatch,
                modeRuntimeProfile: deferNormalization ? nextProfile : 规范化模式运行时配置(nextProfile, prev.mode)
            };
        });
    };

    const 应用可视化货币系统 = (currencySystem: CurrencySystem) => {
        setCurrencySystemJsonError('');
        setCurrencySystemJsonDraft(JSON.stringify(currencySystem, null, 2));
        setContributionDraft((prev) => {
            const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, ['economy', 'currencySystem'], currencySystem);
            return {
                ...prev,
                modeRuntimeProfile: 规范化模式运行时配置(nextProfile, prev.mode)
            };
        });
    };

    const 清除可视化货币系统 = () => {
        setCurrencySystemJsonError('');
        setCurrencySystemJsonDraft('');
        setContributionDraft((prev) => {
            const nextProfile = 写入运行时路径值(prev.modeRuntimeProfile, ['economy', 'currencySystem'], undefined);
            return {
                ...prev,
                modeRuntimeProfile: 规范化模式运行时配置(nextProfile, prev.mode)
            };
        });
    };

    const 切换货币系统编辑模式 = (mode: 货币系统编辑模式) => {
        setCurrencySystemEditMode(mode);
        if (mode === 'dynamic' && !contributionDraft.modeRuntimeProfile.economy.currencySystem) {
            应用可视化货币系统(构建货币系统模板('topic-default', contributionDraft.modeRuntimeProfile));
            return;
        }
        if (mode === 'legacy') {
            清除可视化货币系统();
        }
    };

    const activeEntries = useMemo(
        () => entries.filter((entry) => 可展示工坊类型集合.has(entry.type) && entry.type === activeType && (sourceFilter === 'all' || entry.source === sourceFilter)),
        [activeType, entries, sourceFilter]
    );

    const [selectedVersionByGroup, setSelectedVersionByGroup] = useState<Record<string, string>>({});

    const groupedEntries = useMemo(() => {
        const groups = new Map<string, { key: string; title: string; contributor: string; versions: 创意工坊模块条目[] }>();
        for (const entry of activeEntries) {
            const ownerKey = entry.ownerUserId || entry.ownerUsername || entry.contributor || 'anon';
            const groupKey = `${ownerKey}::${entry.baseModuleId || entry.title}`;
            let group = groups.get(groupKey);
            if (!group) {
                group = { key: groupKey, title: entry.title, contributor: entry.contributor || '', versions: [] };
                groups.set(groupKey, group);
            }
            group.versions.push({ ...entry });
        }
        for (const group of groups.values()) {
            group.versions.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return aTime - bTime || a.id.localeCompare(b.id);
            });
            group.versions.forEach((versionEntry, index) => {
                versionEntry.version = index + 1;
                if (!versionEntry.baseModuleId) versionEntry.baseModuleId = group.key;
            });
            group.versions.sort((a, b) => (b.version || 1) - (a.version || 1));
        }
        return Array.from(groups.values());
    }, [activeEntries]);

    const getDisplayEntry = (group: { key: string; versions: 创意工坊模块条目[] }): 创意工坊模块条目 => {
        const selected = selectedVersionByGroup[group.key];
        if (selected) {
            const found = group.versions.find(v => v.id === selected);
            if (found) return found;
        }
        return group.versions[0];
    };

    const refreshEntries = async (options?: { forceRefresh?: boolean }) => {
        const requestId = ++refreshRequestIdRef.current;
        setLoading(true);
        try {
            let refreshWarning = '';
            const nextEntries = (await 列出创意工坊模块({
                forceRefresh: options?.forceRefresh === true,
                onRefreshFallback: (message) => { refreshWarning = message; }
            })).filter((entry) => 可展示工坊类型集合.has(entry.type));
            if (requestId !== refreshRequestIdRef.current) return;
            if (refreshWarning) setStatus(refreshWarning);
            setEntries(nextEntries);
            if (!可展示工坊类型集合.has(activeType)) {
                setActiveType('topic');
            }
        } catch (error: any) {
            if (requestId === refreshRequestIdRef.current) setStatus(`读取创意工坊失败：${error?.message || '未知错误'}`);
        } finally {
            if (requestId === refreshRequestIdRef.current) setLoading(false);
        }
    };

    const 同步本地模块列表 = () => {
        refreshRequestIdRef.current += 1;
        setLoading(false);
        setEntries((currentEntries) => 合并最新本地创意工坊模块(currentEntries));
    };

    const 处理下载JSON = (entry: 创意工坊模块条目) => {
        try {
            下载JSON(entry);
            setStatus(`已下载 JSON：${entry.id}.json`);
        } catch (error: any) {
            setStatus(`下载 JSON 失败：${error?.message || '未知错误'}`);
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
            await refreshEntries({ forceRefresh: true });
        } catch (error: any) {
            setStatus(`发布失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 发布贡献套装 = async () => {
        if (!contributionReady) {
            setStatus(isModePackageDraft ? '请完整填写模式元数据，以及模式专属世界书的题材口径、世界规则和能力体系三段内容。' : contributionDraft.type === 'comfy_workflow' ? '请先填写模块名称和工作流内容。' : contributionDraft.type === 'tavern_preset' ? '请先填写预设名称并粘贴酒馆预设 JSON。' : '请先填写模块名称和注入正文。');
            return;
        }
        if (contributionDraft.type === 'tavern_preset' && !contributionModule.tavernPreset) {
            setStatus('酒馆预设 JSON 无效：需要包含 prompts 和 prompt_order。');
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
            const poolWarning = 格式化背景天赋校验状态文案(校验创意工坊模块背景天赋(published[0] || contributionModules[0]).issues);
            setStatus([
                isModePackageDraft
                    ? `已发布完整模式包「${contributionDraft.title.trim()}」。`
                    : `已发布到社区工坊：${published[0]?.title || contributionDraft.title}。`,
                poolWarning
            ].filter(Boolean).join(' '));
            重置贡献草稿();
            await refreshEntries({ forceRefresh: true });
        } catch (error: any) {
            setStatus(`发布失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 构建编辑模块JSON = (entry: 创意工坊模块条目): string => {
        const { downloadUrl: _downloadUrl, sha256: _sha256, ...editable } = entry as any;
        return JSON.stringify(editable, null, 2);
    };

    const 解析编辑模块草稿 = (entry: 创意工坊模块条目): 创意工坊模块条目 => {
        let parsed: any = {};
        const rawJson = editingDraft.moduleJson.trim();
        if (rawJson) {
            parsed = JSON.parse(rawJson);
            if (parsed?.module && typeof parsed.module === 'object' && !Array.isArray(parsed.module)) parsed = parsed.module;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('完整 JSON 必须是单个创意工坊模块对象，或包含 module 字段的导出文件。');
        }
        return {
            ...entry,
            ...parsed,
            id: entry.id,
            type: entry.type,
            source: entry.source,
            title: editingDraft.title.trim() || parsed.title || entry.title,
            subtitle: editingDraft.subtitle.trim() || parsed.subtitle || entry.subtitle,
            description: editingDraft.description.trim() || parsed.description || entry.description,
            tags: editingDraft.tags.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean),
            contributor: editingDraft.anonymous ? '匿名玩家' : (editingDraft.contributor.trim() || parsed.contributor || entry.contributor || ''),
            anonymous: editingDraft.anonymous
        } as 创意工坊模块条目;
    };

    const 替换贡献草稿 = (next: 贡献草稿, reason: string): boolean => {
        if (贡献草稿有未保存内容() && !window.confirm(`${reason}会覆盖当前未保存的贡献草稿。确定继续吗？`)) return false;
        setContributionDraft(next);
        setCurrencySystemJsonError('');
        setShowContributionForm(true);
        return true;
    };

    const 以模块为底稿编辑 = (entry: 创意工坊模块条目) => {
        const draft = 模块转贡献草稿(entry);
        if (!draft) {
            setStatus('该模块类型暂不支持载入贡献表单编辑。');
            return;
        }
        if (!替换贡献草稿(draft, `载入「${entry.title}」`)) return;
        setStatus(`已把「${entry.title}」完整载入贡献表单。保存时只更新表单管理的标准字段，额外世界书、预设和扩展载荷会保留；请按需修改模块名称以创建新版本。`);
        window.setTimeout(() => contributionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };

    const 下载官方模板 = () => {
        const entry = 构建模式包模块(构建官方模板草稿(templateMode), '官方模板');
        下载JSON(entry);
        setStatus(`已下载「${templateMode}」官方模式包模板 JSON，可在外部编辑后通过「导入 JSON 测试」带回。`);
    };

    const 以官方模板起草 = () => {
        if (!替换贡献草稿(构建官方模板草稿(templateMode), `载入「${templateMode}」官方模板`)) return;
        setStatus(`已按「${templateMode}」官方默认值初始化贡献表单。`);
        window.setTimeout(() => contributionFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };

    const 开始编辑模块 = (entry: 创意工坊模块条目) => {
        setEditingEntryId(entry.id);
        setEditingDraft({
            title: entry.title || '',
            subtitle: entry.subtitle || '',
            description: entry.description || '',
            tags: (entry.tags || []).join('、'),
            contributor: entry.anonymous ? '' : (entry.contributor || cloudUsername),
            anonymous: entry.anonymous === true,
            moduleJson: 构建编辑模块JSON(entry)
        });
    };

    const 保存模块编辑 = async (entry: 创意工坊模块条目) => {
        setBusyId(entry.id);
        try {
            const module = 解析编辑模块草稿(entry);
            const patch = {
                title: module.title,
                subtitle: module.subtitle,
                description: module.description,
                tags: module.tags,
                contributor: module.contributor || '',
                module
            };
            const updated = entry.source === 'local'
                ? 更新本地创意工坊模块(entry.id, module)
                : await 编辑创意工坊模块({
                    id: entry.id,
                    anonymous: editingDraft.anonymous,
                    patch
                });
            setStatus(entry.source === 'local' ? `已更新本地导入：${updated.title}。` : `已更新社区工坊：${updated.title}。`);
            setEditingEntryId('');
            if (entry.source === 'local') 同步本地模块列表();
            else await refreshEntries({ forceRefresh: true });
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
            await refreshEntries({ forceRefresh: true });
        } catch (error: any) {
            setStatus(`删除失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 删除本地模块 = async (entry: 创意工坊模块条目) => {
        if (!window.confirm(`确定删除本地导入「${entry.title}」吗？这只会移除当前浏览器/设备里的测试副本，不会删除社区投稿。`)) return;
        setBusyId(entry.id);
        try {
            删除本地创意工坊模块(entry.id);
            setStatus(`已删除本地导入：${entry.title}。`);
            if (previewEntry?.id === entry.id) setPreviewEntry(null);
            同步本地模块列表();
        } catch (error: any) {
            setStatus(`删除本地导入失败：${error?.message || '未知错误'}`);
        } finally {
            setBusyId('');
        }
    };

    const 保存贡献模块到本地 = async () => {
        if (!contributionReady) {
            setStatus('请先填写模块名称和注入内容。');
            return;
        }
        if (contributionDraft.type === 'tavern_preset' && !contributionModule.tavernPreset) {
            setStatus('酒馆预设 JSON 无效：需要包含 prompts 和 prompt_order。');
            return;
        }
        try {
            const modules = contributionModules.map((module) => 导入本地创意工坊模块(module));
            const first = modules[0];
            const poolWarning = 格式化背景天赋校验状态文案(校验创意工坊模块背景天赋(first).issues);
            setStatus([
                isModePackageDraft
                    ? `已保存完整模式包「${contributionDraft.title.trim()}」到本地测试列表；要分享给其他玩家请点击发布到社区。`
                    : `已保存本地测试「${first.title}」，可在本地导入分区预览；要分享给其他玩家请点击发布到社区。`,
                poolWarning
            ].filter(Boolean).join(' '));
            setActiveType(first.type);
            setSourceFilter('local');
            重置贡献草稿();
            同步本地模块列表();
            setPreviewEntry(first);
        } catch (error: any) {
            setStatus(`保存失败：${error?.message || '未知错误'}`);
        }
    };

    const 从JSON载荷提取创意工坊模块 = (payload: any): 创意工坊模块条目[] => {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload.flatMap((item) => 从JSON载荷提取创意工坊模块(item));
        if (Array.isArray(payload.modules)) return payload.modules.flatMap((item: any) => 从JSON载荷提取创意工坊模块(item));
        const payloadModePackage = 从模式包Payload构建模块(payload);
        if (payloadModePackage) return [payloadModePackage];
        if (payload.module && typeof payload.module === 'object') return 从JSON载荷提取创意工坊模块(payload.module);
        if (payload.type && payload.title) return [payload as 创意工坊模块条目];
        const tavernPreset = 规范化酒馆预设(payload);
        if (tavernPreset) {
            return [{
                id: `local-tavern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'tavern_preset',
                formatVersion: 2,
                workshopKind: 'standard_module',
                title: '玩家上传酒馆预设',
                subtitle: '玩家自行上传 · SillyTavern 酒馆预设',
                description: '玩家上传的酒馆预设，可在酒馆预设设置中直接选择使用。',
                tags: ['酒馆预设', 'SillyTavern'],
                payload: {
                    schema: 'moranjianghu-creative-workshop-tavern-preset',
                    version: 1,
                    tavernPreset
                },
                tavernPreset,
                usagePrompt: '在酒馆预设设置中选择该预设；提示词顺序、启用开关和正则脚本状态会随预设保留。',
                safetyNotes: ['本地上传内容只保存在当前浏览器/设备；公开发布前请确认不包含私密信息。'],
                injectionPreview: [
                    `提示词：${tavernPreset.prompts.length} 条`,
                    `顺序槽位：${tavernPreset.prompt_order.reduce((sum, group) => sum + group.order.length, 0)} 项`,
                    `正则脚本：${tavernPreset.兼容性?.正则脚本总数 || 0} 条`,
                    '开关状态：保留 prompt_order enabled 与 regex_scripts disabled 状态'
                ],
                source: 'local',
                contributor: contributor.trim()
            }];
        }
        return [];
    };

    const 导入JSON文件 = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        setBusyId('import-json');
        try {
            const candidates: 创意工坊模块条目[] = [];
            for (const file of files) {
                const text = await file.text();
                const payload = JSON.parse(text);
                const modules = 从JSON载荷提取创意工坊模块(payload).map((module) => (
                    module.type === 'tavern_preset' && module.title === '玩家上传酒馆预设'
                        ? { ...module, title: file.name.replace(/\.json$/i, '') || module.title }
                        : module
                ));
                if (modules.length === 0) {
                    throw new Error(`${file.name} 不是可识别的创意工坊 JSON`);
                }
                candidates.push(...modules);
            }
            const imported = candidates.map((module) => 导入本地创意工坊模块(module));
            const first = imported[0];
            const poolWarnings = imported
                .map((module) => 格式化背景天赋校验状态文案(校验创意工坊模块背景天赋(module).issues))
                .filter(Boolean);
            setStatus([
                `已导入 ${imported.length} 个本地 JSON 预设${first ? `：${first.title}` : ''}。本地导入只保存在当前浏览器/设备，用于预览和测试；需要公开分享时请点击发布到社区。`,
                ...poolWarnings
            ].filter(Boolean).join(' '));
            if (first) {
                setActiveType(first.type);
                setPreviewEntry(first);
            }
            setSourceFilter('local');
            同步本地模块列表();
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
        if (
            field.path.some((part) => part.startsWith('__'))
            || fieldType === 'currencySystemModeSelector'
            || fieldType === 'economyGroupTitle'
            || fieldType === 'currencySystemEditor'
        ) {
            return null;
        }
        if (fieldType === 'currencySystemJson' || fieldType === 'json') {
            const displayValue = rawValue ? JSON.stringify(rawValue, null, 2) : '';
            return (
                <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                    {field.label}
                    <textarea value={displayValue} readOnly className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-gray-100 outline-none font-mono" />
                </label>
            );
        }
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

    const 渲染酒馆预设预览页面 = (entry: 创意工坊模块条目) => {
        const preset = previewTavernPreset;
        const promptMap = new Map<string, NonNullable<typeof preset>['prompts'][number]>();
        (preset?.prompts || []).forEach((prompt) => {
            if (prompt.identifier && !promptMap.has(prompt.identifier)) promptMap.set(prompt.identifier, prompt);
        });
        const regexCount = Array.isArray((preset?.extensions as any)?.regex_scripts) ? (preset!.extensions as any).regex_scripts.length : 0;

        return (
            <div className="space-y-4">
                <section className="rounded-xl border border-wuxia-gold/15 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">只读酒馆预设</div>
                            <h3 className="mt-2 text-xl font-serif font-bold text-gray-100">{entry.title}</h3>
                            <div className="mt-1 text-sm text-wuxia-gold/80">{entry.subtitle}</div>
                            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-300">{entry.description}</p>
                        </div>
                        <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-gray-300">{entry.contributor || (entry.anonymous ? '匿名玩家' : '创意工坊')}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {entry.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">{tag}</span>)}
                    </div>
                    {entry.usagePrompt && <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3 text-xs leading-5 text-gray-300">使用提示：{entry.usagePrompt}</div>}
                </section>

                {previewTavernPresetStatus ? (
                    <section className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">{previewTavernPresetStatus}</section>
                ) : null}

                {preset ? (
                    <>
                        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
                            <div className="text-xs font-bold tracking-[0.14em] text-emerald-200">预设概览</div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-4">
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="text-[11px] text-gray-400">Prompts</div>
                                    <div className="mt-1 text-lg font-bold text-gray-100">{preset.prompts.length}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="text-[11px] text-gray-400">角色槽位</div>
                                    <div className="mt-1 text-lg font-bold text-gray-100">{preset.prompt_order.length}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="text-[11px] text-gray-400">正则脚本</div>
                                    <div className="mt-1 text-lg font-bold text-gray-100">{regexCount}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="text-[11px] text-gray-400">生成参数</div>
                                    <div className="mt-1 text-lg font-bold text-gray-100">{preset.generationParams ? '已携带' : '未携带'}</div>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">Prompt Order 与开启状态</div>
                            <div className="mt-3 space-y-4">
                                {preset.prompt_order.map((group) => (
                                    <div key={group.character_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                        <div className="text-sm font-bold text-gray-100">角色槽位 {group.character_id}</div>
                                        <div className="mt-3 space-y-2">
                                            {group.order.map((orderItem, index) => {
                                                const prompt = promptMap.get(orderItem.identifier);
                                                const enabled = orderItem.enabled === true;
                                                return (
                                                    <div key={`${group.character_id}-${orderItem.identifier}-${index}`} className="rounded-lg border border-white/10 bg-black/25 p-3">
                                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                                            <span className={`rounded-full border px-2 py-0.5 ${enabled ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-gray-500/30 bg-gray-500/10 text-gray-400'}`}>{enabled ? '已开启' : '已关闭'}</span>
                                                            <span className="font-mono text-gray-400">#{index + 1}</span>
                                                            <span className="font-mono text-wuxia-gold">{orderItem.identifier}</span>
                                                            {prompt?.name && <span className="font-bold text-gray-100">{prompt.name}</span>}
                                                            {prompt?.role && <span className="text-gray-500">{prompt.role}</span>}
                                                        </div>
                                                        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-300">{prompt?.content || '未找到对应 prompt 内容。'}</pre>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <details className="rounded-xl border border-white/10 bg-black/25 p-4">
                            <summary className="cursor-pointer text-xs font-bold text-gray-200">原始酒馆预设 JSON</summary>
                            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-400">{JSON.stringify(preset, null, 2)}</pre>
                        </details>
                    </>
                ) : null}
            </div>
        );
    };

    const 渲染注入预览页面 = (entry: 创意工坊模块条目) => {
        if (entry.type === 'tavern_preset') return 渲染酒馆预设预览页面(entry);
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
                        <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-gray-300">{获取创意工坊模块来源标签(entry)}</div>
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

                {(() => {
                    const poolCheck = 校验创意工坊模块背景天赋(entry);
                    if (poolCheck.backgrounds.length <= 0 && poolCheck.talents.length <= 0) return null;
                    const hiddenTalents = poolCheck.talents.filter((item) => item.隐藏 === true);
                    const builtinBackgrounds = poolCheck.backgrounds.filter((item) => Array.isArray(item.自带天赋) && item.自带天赋!.length > 0);
                    return (
                        <section className="rounded-xl border border-rose-400/20 bg-rose-950/10 p-4">
                            <div className="text-xs font-bold tracking-[0.14em] text-rose-100/90">出身背景 / 天赋池</div>
                            <div className="mt-2 text-[11px] leading-5 text-gray-400">
                                完整池用于开局成角引用。隐藏天赋不进玩家选择池，仅可通过背景自带注入；玩家选角不会看到隐藏自带明细。
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-gray-300">
                                    背景 {poolCheck.backgrounds.length} · 含自带引用 {builtinBackgrounds.length}
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-gray-300">
                                    天赋 {poolCheck.talents.length} · 隐藏 {hiddenTalents.length}
                                </div>
                            </div>
                            {poolCheck.issues.length > 0 && (
                                <ul className="mt-3 space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/90">
                                    {poolCheck.issues.map((issue, index) => (
                                        <li key={`${issue.message}-${index}`}>校验：{issue.message}</li>
                                    ))}
                                </ul>
                            )}
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <div>
                                    <div className="text-[11px] font-bold text-gray-200">背景池</div>
                                    <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                                        {poolCheck.backgrounds.map((bg) => (
                                            <div key={bg.名称} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                                <div className="text-sm text-gray-100">{bg.名称}</div>
                                                <div className="mt-1 text-[11px] leading-5 text-gray-400">{bg.效果}</div>
                                                {Array.isArray(bg.自带天赋) && bg.自带天赋.length > 0 && (
                                                    <div className="mt-1 text-[11px] text-rose-100/85">自带天赋：{bg.自带天赋.join('、')}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold text-gray-200">天赋池</div>
                                    <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                                        {poolCheck.talents.map((talent) => (
                                            <div key={talent.名称} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                                                <div className="text-sm text-gray-100">
                                                    {talent.名称}
                                                    {talent.隐藏 ? <span className="ml-2 text-[10px] text-rose-300/90">隐藏</span> : null}
                                                </div>
                                                <div className="mt-1 text-[11px] leading-5 text-gray-400">{talent.效果}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    );
                })()}

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
                            <div className="text-xs font-mono tracking-[0.28em] text-wuxia-gold">{previewEntry.type === 'tavern_preset' ? 'PRESET PREVIEW' : 'INJECTION PREVIEW'}</div>
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
                            <button type="button" onClick={() => jsonImportInputRef.current?.click()} disabled={busyId === 'import-json'} title="导入 JSON 只保存到当前浏览器/设备，用于本地预览和测试。完整 JSON 可以让 AI 生成后直接导入。" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50">{busyId === 'import-json' ? '导入中' : '导入 JSON 测试'}</button>
                            <button type="button" onClick={() => setShowContributionForm((value) => !value)} className="rounded-lg border border-wuxia-gold/25 px-3 py-2 text-xs text-wuxia-gold hover:border-wuxia-gold/45">{showContributionForm ? '收起贡献表单' : '贡献新预设'}</button>
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1">
                                <select value={templateMode} onChange={(event) => setTemplateMode(event.target.value as 题材模式类型)} className="h-7 rounded border border-white/10 bg-black/40 px-1.5 text-[11px] text-gray-200 outline-none focus:border-wuxia-gold/40">
                                    {题材模式顺序.map((mode) => (
                                        <option key={mode} value={mode}>{mode}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={下载官方模板} title="下载所选官方模式的完整模式包 JSON 模板，可在外部编辑后导入" className="rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-gray-200 hover:border-white/25">下载官方模板</button>
                                <button type="button" onClick={以官方模板起草} title="按所选官方模式的默认值初始化下方贡献表单" className="rounded border border-wuxia-gold/25 px-2 py-1.5 text-[11px] text-wuxia-gold hover:border-wuxia-gold/45">载入表单</button>
                            </div>
                            <button type="button" onClick={() => void refreshEntries({ forceRefresh: true })} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-200 hover:border-white/25 disabled:opacity-50">{loading ? '刷新中' : '刷新社区'}</button>
                        </div>
                    </div>

                    {showContributionForm && (
                        <div ref={contributionFormRef} className="mb-4 grid min-w-0 gap-4 rounded-xl border border-wuxia-gold/15 bg-white/[0.035] p-4 [&_div]:min-w-0 [&_input]:min-w-0 [&_label]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                            <div className="min-w-0 space-y-3">
                                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] leading-5 text-emerald-100">
                                    底稿编辑会保留原模块的额外世界书、预设、地图 DIY 与扩展载荷；表单只更新自己管理的标准字段。建议保留原模块名称以继续版本链，或改名另存新包。
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block text-xs text-gray-300">
                                        模块名称
                                        <input value={contributionDraft.title} onChange={(event) => setContributionDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="例如：门派暗线世界规则" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        副标题
                                        <input value={contributionDraft.subtitle} onChange={(event) => setContributionDraft((prev) => ({ ...prev, subtitle: event.target.value }))} placeholder="例如：势力渗透、暗线追踪" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        版本说明
                                        <input value={contributionDraft.versionNote} onChange={(event) => setContributionDraft((prev) => ({ ...prev, versionNote: event.target.value }))} placeholder="如：修复XX、新增YY" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                                    </label>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="block text-xs text-gray-300">
                                        贡献类型
                                        <select
                                            value={isModePackageDraft ? 'topic_mode_package' : contributionDraft.type === 'topic' ? 'topic_standard' : contributionDraft.type}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                if (value === 'topic_mode_package') setContributionDraft((prev) => ({ ...prev, type: 'topic', moduleKind: 'mode_package' }));
                                                else if (value === 'topic_standard') setContributionDraft((prev) => ({ ...prev, type: 'topic', moduleKind: 'standard' }));
                                                else setContributionDraft((prev) => ({ ...prev, type: value as 创意工坊模块类型, moduleKind: 'standard' }));
                                            }}
                                            className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                                        >
                                            <option value="topic_mode_package">完整模式包（模式专属世界书）</option>
                                            <option value="topic_standard">普通题材补充模块</option>
                                            <option value="tavern_preset">酒馆预设</option>
                                            <option value="comfy_workflow">ComfyUI 工作流</option>
                                        </select>
                                    </label>
                                    <label className="block text-xs text-gray-300">
                                        适用模式
                                        <select
                                            value={contributionDraft.mode}
                                            onChange={(event) => {
                                                const mode = event.target.value as 题材模式类型;
                                                if (mode === contributionDraft.mode) return;
                                                if (!window.confirm('切换适用模式会重置模式元数据、运行时配置与出身/天赋池。确定继续吗？')) return;
                                                setContributionDraft((prev) => ({
                                                    ...prev,
                                                    mode,
                                                    ...创建默认模式元数据草稿(mode),
                                                    ...构建模式默认背景天赋池JSON(mode)
                                                }));
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
                                {!isModePackageDraft ? (
                                    <label className="block text-xs text-gray-300">
                                        {contributionDraft.type === 'tavern_preset' ? '酒馆预设 JSON' : contributionDraft.type === 'comfy_workflow' ? '工作流内容' : '模块注入正文'}
                                        <textarea
                                            value={contributionDraft.body}
                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, body: event.target.value }))}
                                            placeholder={contributionDraft.type === 'tavern_preset' ? '粘贴 SillyTavern 酒馆预设 JSON，prompts / prompt_order 以及开关状态会被保留。' : contributionDraft.type === 'comfy_workflow' ? '粘贴 ComfyUI API Workflow JSON，或写清工作流下载/使用说明。' : '填写该普通模块要注入的世界观、规则或题材补充正文。'}
                                            className="mt-1 min-h-36 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45"
                                        />
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
                                                    onClick={() => {
                                                        if (!window.confirm('将全部模式元数据与运行时配置重置为当前题材默认值。确定继续吗？')) return;
                                                        setContributionDraft((prev) => ({ ...prev, ...创建默认模式元数据草稿(prev.mode) }));
                                                    }}
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
                                                <div className="sm:col-span-2 rounded-xl border border-rose-400/20 bg-rose-950/10 p-3 space-y-3">
                                                    <div>
                                                        <div className="text-xs font-bold text-rose-100/90">出身 / 天赋完整池（高级 JSON）</div>
                                                        <div className="mt-1 text-[11px] leading-5 text-gray-400">
                                                            与上方「建议」不同：这里是开局实际可解析的池。天赋可写 &quot;隐藏&quot;: true；背景可写 &quot;自带天赋&quot;: [&quot;名称&quot;]。玩家选角不会剧透隐藏自带。
                                                        </div>
                                                    </div>
                                                    {(() => {
                                                        const check = 解析草稿背景天赋池(contributionDraft, contributionDraft.mode);
                                                        return check.issues.length > 0 ? (
                                                            <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[11px] leading-5 text-amber-100/90">
                                                                {check.issues.map((issue, index) => (
                                                                    <li key={`${issue.message}-${index}`}>校验：{issue.message}</li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <div className="text-[11px] text-emerald-200/80">
                                                                池校验通过：背景 {check.backgrounds.length} · 天赋 {check.talents.length}
                                                            </div>
                                                        );
                                                    })()}
                                                    <label className="block text-xs text-gray-300">
                                                        背景池 JSON
                                                        <textarea
                                                            value={contributionDraft.backgroundsPoolJson}
                                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, backgroundsPoolJson: event.target.value }))}
                                                            placeholder='[{"名称":"唯心剑修","描述":"...","效果":"...","自带天赋":["剑在心中"]}]'
                                                            className="mt-1 min-h-32 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45"
                                                        />
                                                    </label>
                                                    <label className="block text-xs text-gray-300">
                                                        天赋池 JSON
                                                        <textarea
                                                            value={contributionDraft.talentsPoolJson}
                                                            onChange={(event) => setContributionDraft((prev) => ({ ...prev, talentsPoolJson: event.target.value }))}
                                                            placeholder='[{"名称":"剑在心中","描述":"...","效果":"...","隐藏":true,"叙事约束":"..."}]'
                                                            className="mt-1 min-h-32 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45"
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setContributionDraft((prev) => ({
                                                            ...prev,
                                                            ...构建模式默认背景天赋池JSON(prev.mode)
                                                        }))}
                                                        className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold"
                                                    >
                                                        重置为当前题材官方默认池
                                                    </button>
                                                </div>
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
                                                                const fieldPath = field.path.join('.');
                                                                if (section.title === '经济系统') {
                                                                    const isDynamicField = fieldType === 'currencySystemEditor' || fieldPath === 'economy.__dynamicCurrency';
                                                                    const isLegacyField = fieldType === 'currencyMode' || fieldPath.startsWith('economy.currencyTiers') || fieldPath === 'economy.__legacyCurrency';
                                                                    const isJsonField = fieldType === 'currencySystemJson' || fieldPath === 'economy.__advancedCurrency';
                                                                    if (isDynamicField && currencySystemEditMode !== 'dynamic') return null;
                                                                    if (isLegacyField && currencySystemEditMode !== 'legacy') return null;
                                                                    if (isJsonField && currencySystemEditMode !== 'json') return null;
                                                                }
                                                                if (fieldType === 'currencySystemModeSelector') {
                                                                    const modeText = currencySystemEditMode === 'dynamic'
                                                                        ? '当前使用新版动态货币系统，支持单一货币、多层货币和自定义单位。'
                                                                        : currencySystemEditMode === 'legacy'
                                                                            ? '当前使用旧版三层货币系统，仅适合兼容旧模板。'
                                                                            : '高级模式直接编辑 economy.currencySystem，普通用户建议使用新版动态货币系统。';
                                                                    const options: Array<{ value: 货币系统编辑模式; label: string }> = [
                                                                        { value: 'dynamic', label: '新版动态货币系统（推荐）' },
                                                                        { value: 'legacy', label: '旧版三层货币系统（兼容）' },
                                                                        { value: 'json', label: '高级 JSON 配置' }
                                                                    ];
                                                                    return (
                                                                        <div key={key} className="sm:col-span-2 rounded-lg border border-wuxia-gold/25 bg-wuxia-gold/[0.06] px-3 py-3">
                                                                            <div className="text-xs font-bold text-wuxia-gold">{field.label}</div>
                                                                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                                                                {options.map((option) => (
                                                                                    <button
                                                                                        key={option.value}
                                                                                        type="button"
                                                                                        onClick={() => 切换货币系统编辑模式(option.value)}
                                                                                        className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                                                                                            currencySystemEditMode === option.value
                                                                                                ? 'border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold'
                                                                                                : 'border-white/10 bg-black/25 text-gray-300 hover:border-wuxia-gold/35 hover:text-wuxia-gold'
                                                                                        }`}
                                                                                    >
                                                                                        {option.label}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                            <div className="mt-2 text-[11px] leading-5 text-gray-300">{modeText}</div>
                                                                            <div className="mt-1 text-[11px] leading-5 text-gray-500">
                                                                                模式不会额外写入持久化字段；游戏实际根据 economy.currencySystem 是否存在决定优先使用新版动态货币或旧版 currencyTiers fallback。
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                if (fieldType === 'economyGroupTitle') {
                                                                    const dynamicEnabled = Boolean(contributionDraft.modeRuntimeProfile.economy.currencySystem);
                                                                    const legacyNote = field.path.join('.') === 'economy.__legacyCurrency' && dynamicEnabled
                                                                        ? '当前新版动态货币已启用，以下三层配置仅作为兼容保留。'
                                                                        : field.placeholder;
                                                                    return (
                                                                        <div key={key} className="sm:col-span-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                                                            <div className="text-xs font-bold text-wuxia-gold">{field.label}</div>
                                                                            {legacyNote && <div className="mt-1 text-[11px] leading-5 text-gray-400">{legacyNote}</div>}
                                                                        </div>
                                                                    );
                                                                }
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
                                                                    return (
                                                                        <Json运行时字段编辑器
                                                                            key={`${key}-realm-config`}
                                                                            label={field.label}
                                                                            placeholder='{"levelNames":[],"parseRules":[]}'
                                                                            value={读取运行时路径值(contributionDraft.modeRuntimeProfile, field.path)}
                                                                            expectedShape="object"
                                                                            onApply={(parsed) => 更新运行时配置字段(field, parsed)}
                                                                        />
                                                                    );
                                                                }
                                                                if (fieldType === 'currencySystemEditor') {
                                                                    return (
                                                                        <CurrencySystemEditor
                                                                            key={key}
                                                                            profile={contributionDraft.modeRuntimeProfile}
                                                                            onApply={应用可视化货币系统}
                                                                            onClear={清除可视化货币系统}
                                                                        />
                                                                    );
                                                                }
                                                                if (fieldType === 'currencySystemJson') {
                                                                    return (
                                                                        <label key={key} className="block text-xs text-gray-300 sm:col-span-2">
                                                                            {field.label}
                                                                            <textarea value={currencySystemJsonDraft}
                                                                                onChange={(event) => 更新货币系统Json(event.target.value)}
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
                                                                if (fieldType === 'marketTemplates') {
                                                                    return (
                                                                        <市场行情模板编辑器
                                                                            key={`${key}-market-templates`}
                                                                            value={读取运行时路径值(contributionDraft.modeRuntimeProfile, field.path)}
                                                                            onApply={(templates) => 更新运行时配置字段(field, templates)}
                                                                        />
                                                                    );
                                                                }
                                                                if (fieldType === 'uiLabels') {
                                                                    return (
                                                                        <界面文案覆盖编辑器
                                                                            key={`${key}-ui-labels`}
                                                                            mode={contributionDraft.modeRuntimeProfile.identity.baseMode || contributionDraft.mode}
                                                                            value={contributionDraft.modeRuntimeProfile.uiLabels}
                                                                            onApply={(labels) => 更新运行时配置字段(field, labels)}
                                                                        />
                                                                    );
                                                                }
                                                                if (fieldType === 'json') {
                                                                    return (
                                                                        <Json运行时字段编辑器
                                                                            key={`${key}-json`}
                                                                            label={field.label}
                                                                            placeholder={field.placeholder}
                                                                            value={读取运行时路径值(contributionDraft.modeRuntimeProfile, field.path)}
                                                                            expectedShape={field.expectedShape}
                                                                            onApply={(parsed) => 更新运行时配置字段(field, parsed)}
                                                                        />
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
                                        <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3">
                                            <div className="text-xs font-bold tracking-[0.14em] text-sky-200">叙事方向控制（可选）</div>
                                            <div className="mt-1 text-[11px] leading-5 text-gray-400">分别覆盖主线、暗线和后台世界推进倾向；留空时保持旧模式包行为。这里只调整叙事方向，不会覆盖变量协议、命令格式、数据结构、安全规则或存档一致性规则。</div>
                                            <div className="mt-3 grid gap-3">
                                                <label className="block text-xs text-gray-300">
                                                    主线方向
                                                    <textarea value={contributionDraft.mainStoryDirection} onChange={(event) => setContributionDraft((prev) => ({ ...prev, mainStoryDirection: event.target.value }))} placeholder="例如：以轻松日常、工作生活、友情和兴趣成长为主，不默认升级成生死危机。" className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-sky-400/60" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    暗线策略
                                                    <textarea value={contributionDraft.hiddenPlotPolicy} onChange={(event) => setContributionDraft((prev) => ({ ...prev, hiddenPlotPolicy: event.target.value }))} placeholder="例如：暗线只做生活伏笔和人情误会，不过度阴谋化，不生成跨国黑幕。" className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-sky-400/60" />
                                                </label>
                                                <label className="block text-xs text-gray-300">
                                                    世界推进规则
                                                    <textarea value={contributionDraft.worldEvolutionPolicy} onChange={(event) => setContributionDraft((prev) => ({ ...prev, worldEvolutionPolicy: event.target.value }))} placeholder="例如：后台按现实社会节奏平缓变化，优先生活气息和关系余波，不持续制造重大事故。" className="mt-1 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-500 focus:border-sky-400/60" />
                                                </label>
                                            </div>
                                        </div>
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
                                    <button type="button" onClick={确认并清空贡献草稿} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-200 hover:border-white/25">清空</button>
                                </div>
                            </div>
                            <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
                                <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">实时预览</div>
                                <div className="mt-3 text-base font-serif font-bold text-gray-100">{contributionDraft.title.trim() || '未命名预设'}</div>
                                <div className="mt-1 text-xs text-wuxia-gold/80">{isModePackageDraft ? `${contributionDraft.mode} · 完整模式包` : contributionModule.subtitle}</div>
                                <p className="mt-2 text-sm leading-6 text-gray-300">{contributionDraft.description.trim() || (isModePackageDraft ? '一次贡献一个模式专属世界书，包含题材口径、世界规则和能力体系。' : contributionModule.description)}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {contributionModules[0]?.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">{tag}</span>)}
                                </div>
                                <div className="mt-3 rounded-lg border border-wuxia-gold/15 bg-black/30 p-3">
                                    <div className="text-xs font-bold tracking-[0.14em] text-wuxia-gold">标准格式预览</div>
                                    <div className="mt-2 text-xs leading-5 text-gray-300">使用提示：{isModePackageDraft ? '完整模式包会以模式专属世界书的形式统一生效。' : contributionModule.usagePrompt}</div>
                                    {isModePackageDraft && (
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
                        {groupedEntries.map((group) => {
                            const entry = getDisplayEntry(group);
                            const canPublishEntry = 创意工坊模块可发布到社区(entry);
                            const canManageEntry = entry.source === 'cloud' && Boolean(cloudUsername) && entry.ownerUsername === cloudUsername;
                            const canDeleteLocalEntry = entry.source === 'local';
                            const canEditEntry = canDeleteLocalEntry || canManageEntry;
                            const editing = editingEntryId === entry.id;
                            const hasVersions = group.versions.length > 1;
                            return (
                                <div key={group.key} className="rounded-xl border border-white/10 bg-black/25 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-serif font-bold text-gray-100">{entry.title}{typeof entry.version === 'number' && entry.version > 1 ? <span className="ml-2 inline-block rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-mono text-amber-200">v{entry.version}</span> : null}</h3>
                                            {hasVersions && (
                                                <select
                                                    value={entry.id}
                                                    onChange={(e) => setSelectedVersionByGroup(prev => ({ ...prev, [group.key]: e.target.value }))}
                                                    className="mt-1 h-7 rounded border border-amber-500/30 bg-black/50 px-2 text-[11px] text-amber-200 outline-none"
                                                >
                                                    {group.versions.map(v => (
                                                        <option key={v.id} value={v.id}>
                                                            v{v.version || 1}{v.versionNote ? ` - ${v.versionNote}` : ''} ({v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '未知日期'})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            <div className="mt-1 text-xs text-wuxia-gold/80">{entry.subtitle}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">{获取创意工坊模块来源标签(entry)} · {entry.contributor || '匿名'}{entry.versionNote ? ` · ${entry.versionNote}` : ''}</div>
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
                                            <label className="block text-xs text-gray-300">
                                                完整模块 JSON
                                                <textarea
                                                    value={editingDraft.moduleJson}
                                                    onChange={(event) => setEditingDraft((prev) => ({ ...prev, moduleJson: event.target.value }))}
                                                    className="mt-1 min-h-48 w-full resize-y rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-[11px] leading-5 text-gray-100 outline-none placeholder:text-gray-500 focus:border-sky-400/50"
                                                    spellCheck={false}
                                                />
                                            </label>
                                            <div className="text-[11px] leading-5 text-gray-400">
                                                上方名称、简介、标签会覆盖 JSON 中对应字段；payload、contentBlocks、模式世界书等完整内容会随 JSON 一起保存。
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                        <button type="button" onClick={() => setPreviewEntry(entry)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">{entry.type === 'tavern_preset' ? '预览预设' : '预览注入'}</button>
                                        {entry.type !== 'tavern_preset' ? (
                                            <button type="button" onClick={() => 以模块为底稿编辑(entry)} title="把这个模块完整载入下方贡献表单，用可视化表单修改后另存" className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-2 text-xs text-wuxia-gold hover:bg-wuxia-gold/20">以此为底稿编辑</button>
                                        ) : null}
                                        <button type="button" onClick={() => 处理下载JSON(entry)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">下载 JSON</button>
                                        <button type="button" onClick={() => void 复制文本(构建模块摘要(entry)).then((ok) => setStatus(ok ? `已复制「${entry.title}」注入摘要。` : '复制失败，请改用下载 JSON。'))} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">复制摘要</button>
                                        {canPublishEntry && (
                                            <button type="button" onClick={() => void 发布模块(entry)} disabled={Boolean(busyId)} title={cloudUsername ? '把这个本地测试模块发布到社区工坊' : '点击后先登录联机账号'} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/15 disabled:opacity-50">发布到社区</button>
                                        )}
                                        {canDeleteLocalEntry ? (
                                            <button type="button" onClick={() => void 删除本地模块(entry)} disabled={Boolean(busyId)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15 disabled:opacity-50">删除本地导入</button>
                                        ) : null}
                                        {canEditEntry && !editing ? (
                                            <button type="button" onClick={() => 开始编辑模块(entry)} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/15">{entry.source === 'local' ? '编辑本地 JSON' : '编辑投稿 JSON'}</button>
                                        ) : null}
                                        {canEditEntry && editing ? (
                                            <button type="button" onClick={() => void 保存模块编辑(entry)} disabled={Boolean(busyId)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50">保存编辑</button>
                                        ) : null}
                                        {canEditEntry && editing ? (
                                            <button type="button" onClick={() => setEditingEntryId('')} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-200 hover:border-white/25">取消编辑</button>
                                        ) : null}
                                        {canManageEntry ? (
                                            <button type="button" onClick={() => void 删除社区模块(entry)} disabled={Boolean(busyId)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15 disabled:opacity-50">删除投稿</button>
                                        ) : null}
                                        <button type="button" onClick={() => { setReportTarget({ id: entry.id, title: entry.title }); setReportText(''); setReportGameText(''); }} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/15">反馈问题{获取反馈数量(entry.id) > 0 ? ` (${获取反馈数量(entry.id)})` : ''}</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </>
                    )}
                </div>
            </div>
            {reportTarget && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setReportTarget(null)}>
                    <div className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-[#11100d] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-amber-200">反馈「{reportTarget.title}」</h3>
                        <p className="mt-1 text-xs text-gray-400">你的反馈会帮助贡献者定位和修复问题。</p>
                        <textarea
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            placeholder="描述你遇到的问题..."
                            className="mt-4 h-24 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-amber-500/40 resize-none"
                        />
                        <textarea
                            value={reportGameText}
                            onChange={(e) => setReportGameText(e.target.value)}
                            placeholder="粘贴相关游玩文本记录（可选，帮助贡献者理解问题情境）..."
                            className="mt-2 h-20 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-gray-300 outline-none placeholder:text-gray-500 focus:border-amber-500/40 resize-none font-mono"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setReportTarget(null)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-200 hover:border-white/25">取消</button>
                            <button type="button" onClick={提交工坊反馈} disabled={!reportText.trim()} className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-40">提交反馈</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreativeWorkshopModal;
