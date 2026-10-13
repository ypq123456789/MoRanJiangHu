import type { 开局预设方案结构 } from './newGamePresets';
import type { ModeRuntimeProfile, WorldMapDiyDraft, 游戏设置结构, 世界书结构, 世界书条目结构, 世界书类型, 世界书作用域, 酒馆预设结构 } from '../types';
import { 题材模式配置表, 题材模式顺序 } from '../utils/workshopEngine';
import { 构建官方模式运行时配置, 规范化模式运行时配置, 渲染模式运行时配置世界书内容 } from '../utils/modeRuntimeProfile';
import { 世界书条目是否生效 } from '../utils/worldbookFeatureLinkage';
import { 默认ComfyUI工作流JSON, 默认NSFWComfyUI工作流JSON } from './defaultComfyWorkflow';
import { 获取题材预设背景, 获取题材预设天赋 } from './presets';

export type 创意工坊模块类型 = 'topic' | 'world_rules' | 'opening' | 'ability' | 'comfy_workflow' | 'tavern_preset';
export type 创意工坊模块来源 = 'builtin' | 'cloud' | 'local';

export interface 创意工坊世界细节生成配置 {
    aiGenerate: boolean;
    importantPeople?: string;
    importantFactions?: string;
    mapDesign?: string;
    mapDiyDraft?: WorldMapDiyDraft;
}

export interface 创意工坊模块条目 {
    id: string;
    type: 创意工坊模块类型;
    formatVersion?: number;
    workshopKind?: 'standard_module';
    title: string;
    subtitle: string;
    description: string;
    tags: string[];
    payload: Record<string, unknown>;
    worldDetailGeneration?: 创意工坊世界细节生成配置;
    modeWorldbooks?: 世界书结构[];
    modeRuntimeProfile?: ModeRuntimeProfile;
    contentBlocks?: Array<{
        id: string;
        title: string;
        purpose: string;
        content: string;
            injectionTarget?: 'manualWorldPrompt' | 'worldExtraRequirement' | 'manualRealmPrompt' | 'openingExtraRequirement' | 'imageWorkflow' | 'referenceOnly';
    }>;
    usagePrompt?: string;
    safetyNotes?: string[];
    injectionPreview: string[];
    preset?: 开局预设方案结构;
    tavernPreset?: 酒馆预设结构;
    source?: 创意工坊模块来源;
    contributor?: string;
    createdAt?: string;
    updatedAt?: string;
    downloadUrl?: string;
    sha256?: string;
    ownerUserId?: string;
    ownerUsername?: string;
    version?: number;
    baseModuleId?: string;
    versionNote?: string;
    anonymous?: boolean;
}

export const 获取创意工坊模块来源标签 = (entry: Pick<创意工坊模块条目, 'source' | 'type' | 'anonymous' | 'contributor'>): string => {
    if (entry.source === 'cloud') return '社区贡献';
    if (entry.source === 'local') return '本地导入';
    if (entry.type === 'tavern_preset' && entry.anonymous && entry.contributor === '匿名玩家') return '社区贡献';
    return '官方预设';
};

export const 创意工坊模块可发布到社区 = (entry: 创意工坊模块条目): boolean => {
    if (entry.source !== 'local') return false;
    if (entry.type === 'comfy_workflow' || entry.type === 'tavern_preset') return true;
    if (entry.type !== 'topic') return false;
    return entry.workshopKind === 'standard_module' || typeof (entry.payload as any)?.suiteId === 'string';
};

const 全流程模式世界书作用域: 世界书作用域[] = ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'];

const 构建模式世界书条目 = (
    id: string,
    标题: string,
    内容: string,
    类型: 世界书类型,
    作用域: 世界书作用域[] = 全流程模式世界书作用域,
    优先级 = 80
): 世界书条目结构 => ({
    id,
    标题,
    内容: 内容.trim(),
    条目形态: 'normal',
    类型,
    作用域,
    注入模式: 'always',
    关键词: [],
    优先级,
    启用: true,
    创建时间: 0,
    更新时间: 0
});

const 构建模式专属世界书 = (params: {
    id: string;
    title: string;
    description: string;
    topicPrompt?: string;
    worldRulesPrompt?: string;
    abilityPrompt?: string;
    extraEntries?: 世界书条目结构[];
}): 世界书结构[] => {
    const entries: 世界书条目结构[] = [
        params.topicPrompt ? 构建模式世界书条目(`${params.id}-topic`, '题材口径', params.topicPrompt, 'world_lore', 全流程模式世界书作用域, 100) : null,
        params.worldRulesPrompt ? 构建模式世界书条目(`${params.id}-world-rules`, '世界规则', params.worldRulesPrompt, 'system_rule', 全流程模式世界书作用域, 95) : null,
        params.abilityPrompt ? 构建模式世界书条目(`${params.id}-ability`, '能力体系', params.abilityPrompt, 'system_rule', 全流程模式世界书作用域, 90) : null,
        ...(params.extraEntries || [])
    ].filter((entry): entry is 世界书条目结构 => Boolean(entry && entry.内容.trim()));
    return [{
        id: `${params.id}-worldbook`,
        标题: params.title,
        描述: params.description,
        常驻大纲: params.description,
        启用: true,
        内置: false,
        条目: entries,
        创建时间: 0,
        更新时间: 0
    }];
};

/**
 * 从模式包世界书提取三类提示词。
 *
 * 条目是否参与提取由两层判定决定：
 * 1. `条目.功能模块` 显式标记（见 models/worldbook.ts 的 世界书条目功能模块）——题包作者主动声明归属；
 * 2. 标题正则兜底——旧题包没有标记字段，仍按标题关键字识别为修炼/能力类。
 * 无论哪种方式，最终都要过 `世界书条目是否生效`，关闭修炼时修炼类条目一律不参与提取。
 */
export const 从模式世界书提取提示词 = (
    books: 世界书结构[] | undefined,
    config?: Partial<游戏设置结构> | null
): {
    manualWorldPrompt: string;
    worldExtraRequirement: string;
    manualRealmPrompt: string;
} => {
    const 修炼类标题正则 = /能力|境界|成长|战力|修为|功法|修炼|神通|法术|灵根|灵体|天赋|体质|技能|属性|等级|突破|丹药|法宝|灵宝|渡劫/;
    const 修炼开启 = config?.启用修炼体系 !== false;
    const allEntries = (Array.isArray(books) ? books : [])
        .flatMap((book) => Array.isArray(book?.条目) ? book.条目 : [])
        .filter((entry) => entry && typeof entry.内容 === 'string' && entry.内容.trim());
    // 开关联动第一层：条目自身启用 + 显式 归属模块未关闭，才进入提取
    const entries = allEntries.filter((entry) => 世界书条目是否生效(entry, config));
    const 渲染条目 = (entry: 世界书条目结构) => `【${entry.标题}】\n${entry.内容.trim()}`;
    // 修炼类判定：显式标记优先，标题正则兜底（旧题包没有标记字段）。
    // 修炼关闭时修炼类条目一律排除——既不进 manualRealmPrompt / manualWorldPrompt，
    // 也不能以「世界观」或「普通规则」的身份混进 worldExtraRequirement 绕过剥离。
    const 是修炼类 = (entry: 世界书条目结构) => (
        entry.功能模块 === 'cultivation' || 修炼类标题正则.test(entry.标题)
    );
    // world_lore 也必须过滤：旧包把「境界体系」之类的条目放在 world_lore 类型下，
    // 若只过滤 ability/rules 分支，它们会被原样写进开局世界观
    const worldLore = entries
        .filter((entry) => entry.类型 === 'world_lore' && (修炼开启 || !是修炼类(entry)))
        .map(渲染条目);
    const ability = 修炼开启 ? entries.filter(是修炼类).map(渲染条目) : [];
    const abilitySet = new Set(ability);
    const rules = entries
        .filter((entry) => entry.类型 !== 'world_lore' && !abilitySet.has(渲染条目(entry)))
        .filter((entry) => (修炼开启 ? true : !是修炼类(entry)))
        .map(渲染条目);
    return {
        manualWorldPrompt: worldLore.join('\n\n'),
        worldExtraRequirement: rules.join('\n\n'),
        manualRealmPrompt: ability.join('\n\n')
    };
};

const 通用属性 = {
    力量: 5,
    敏捷: 5,
    体质: 5,
    根骨: 5,
    悟性: 5,
    福源: 5
};

const 构建角色 = (姓名: string, 背景名称: string, 天赋名称列表: string[]): 开局预设方案结构['character'] => ({
    姓名,
    性别: '男',
    年龄: 18,
    出生月: 1,
    出生日: 1,
    外貌: '衣着利落，随身带着符合题材的基础行囊。',
    性格: '谨慎、可靠，遇事先观察局势再行动。',
    属性: { ...通用属性 },
    背景名称,
    天赋名称列表
});

const 构建题材预设 = (
    id: string,
    名称: string,
    简介: string,
    mode: keyof typeof 题材模式配置表,
    character: 开局预设方案结构['character'],
    openingExtraRequirement = ''
): 开局预设方案结构 => {
    const profile = 题材模式配置表[mode];
    const modeRuntimeProfile = 构建官方模式运行时配置(mode);
    return {
        id,
        名称,
        简介,
        worldConfig: {
            ...profile.worldDefaults,
            difficulty: 'normal',
            manualWorldPrompt: profile.promptLines.join('\n'),
            manualRealmPrompt: '',
            modeRuntimeProfile
        },
        character,
        openingConfig: {
            配置约束启用: true,
            题材模式: mode,
            modeRuntimeProfile,
            初始关系模板: mode === '末日丧尸' ? '独行少系' : mode === '现代都市' ? '世家官门' : '师门牵引',
            关系侧重: mode === '末日丧尸' ? ['友情', '利益'] : ['师门', '友情'],
            开局切入偏好: mode === '末日丧尸' ? '风波前夜' : mode === '现代都市' ? '日常低压' : '门派起手',
            开局生成门派: true,
            开局生成同门: true,
            允许生成性别: ['男', '女', '男娘', '扶她'],
            生成性别锁定: false,
            初始伙伴: {
                enabled: true,
                姓名: '',
                性别: '女',
                年龄: 18,
                出生月: 1,
                出生日: 1,
                外貌: '眉眼清亮，行动干练。',
                性格: '稳重可靠，愿意和主角共同承担风险。',
                属性: { ...通用属性 },
                背景名称: '',
                背景描述: '',
                背景效果: '',
                天赋列表: [],
                关系: '开局同行者',
                备注: ''
            },
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
        },
        openingStreaming: true,
        openingExtraRequirement
    };
};

export const 创意工坊模块分区: Array<{ id: 创意工坊模块类型; title: string; description: string }> = [
    { id: 'topic', title: '模式包', description: '一次注入题材模板、世界规则和能力体系。' },
    { id: 'tavern_preset', title: '酒馆预设', description: '分享 SillyTavern 提示词、顺序开关和正则脚本配置。' },
    { id: 'comfy_workflow', title: 'ComfyUI 工作流', description: '分享可用于普通、场景或 NSFW 生图的 API workflow JSON。' }
];

const 题材默认角色: Record<keyof typeof 题材模式配置表, { 姓名: string; 背景: string; 天赋: string[]; 开局补充: string }> = {
    武侠: { 姓名: '沈砚', 背景: '镖局少东家', 天赋: ['稳扎稳打', '人情练达'], 开局补充: '第一幕从镖局、门派外门、药铺或江湖小镇切入，保持武侠尺度。' },
    仙侠: { 姓名: '沈玄', 背景: '散修遗孤', 天赋: ['灵觉敏锐', '道心澄明'], 开局补充: '第一幕从低阶宗门、坊市或灵田压力切入，不直接赠送高阶法宝。' },
    西方奇幻: { 姓名: '莱恩', 背景: '冒险者学徒', 天赋: ['魔力亲和', '骑士誓言'], 开局补充: '第一幕从冒险者公会、边境酒馆、护送委托、魔物骚扰或地下城入口切入，不直接赠送神器。' },
    灵气复苏: { 姓名: '林澈', 背景: '大学生', 天赋: ['灵觉敏锐', '社区纽带'], 开局补充: '第一幕从校园、医院、研究点或异常封控现场切入，保留现代社会惯性。' },
    都市修仙: { 姓名: '许临安', 背景: '古玩店学徒', 天赋: ['灵觉敏锐', '市井耳目'], 开局补充: '第一幕从公司、家族、人脉债务或城市暗市切入，不要直接进入成熟宗门社会。' },
    现代都市: { 姓名: '周行', 背景: '白领文职', 天赋: ['人情练达', '账房脑子'], 开局补充: '第一幕从现实工作、家庭、人情、商业或城市案件切入，不写成超凡常态。' },
    末日丧尸: { 姓名: '陈砾', 背景: '维修工', 天赋: ['独行者', '守夜人'], 开局补充: '第一幕从安全屋、医院遗址、商超搜索或营地冲突切入。' },
    无限流: { 姓名: '周砚', 背景: '恐怖片影迷', 天赋: ['情报记忆', '恐惧抗性'], 开局补充: '第一幕从主神空间醒来、主神任务倒计时、队伍新人互相试探和第一次恐怖片任务切入。' }
};

const 构建题材模块 = (mode: keyof typeof 题材模式配置表): 创意工坊模块条目 => {
    const profile = 题材模式配置表[mode];
    const actor = 题材默认角色[mode];
    const backgrounds = 获取题材预设背景(mode);
    const talents = 获取题材预设天赋(mode);
    return {
        id: `topic-${profile.value}`,
        type: 'topic',
        title: `${profile.shortLabel}题材模板`,
        subtitle: `${profile.worldSizeLabel}、${profile.dynastyLabel}、${profile.tianjiaoLabel}`,
        description: `把新开局切换到${profile.label}口径，注入货币、地图空间、势力关系和基础叙事边界。`,
        tags: [profile.shortLabel, profile.currencyDisplayMode, profile.group],
        payload: {
            ...profile,
            backgrounds,
            talents
        },
        injectionPreview: [
            `worldConfig.worldExtraRequirement：${profile.worldDefaults.worldExtraRequirement}`,
            `worldConfig.manualWorldPrompt：${profile.promptLines.join(' / ')}`,
            `openingConfig.题材模式：${mode}`,
            `货币/市场口径：${profile.currencyExchangePrompt}`,
            `身份背景池：${backgrounds.slice(0, 6).map((item) => item.名称).join('、')}`,
            `天赋池：${talents.slice(0, 6).map((item) => item.名称).join('、')}`
        ],
        source: 'builtin',
        contributor: '官方',
        preset: 构建题材预设(`workshop_topic_${profile.value}`, `工坊·${profile.shortLabel}`, `${profile.label}开局模板。`, mode, 构建角色(actor.姓名, actor.背景, actor.天赋), actor.开局补充)
    };
};

const 构建世界规则模块 = (mode: keyof typeof 题材模式配置表): 创意工坊模块条目 => {
    const profile = 题材模式配置表[mode];
    const isZombie = mode === '末日丧尸';
    const extraPayload = isZombie ? {
        infectionRules: '感染以咬伤、血液和污染体液传播；风险受伤口、防护装备、暴露时间、噪音、血腥味和光源影响。',
        quarantineRules: '营地、医院、军方残部和隔离区会设置检疫、观察期、物资消毒和感染者处置规则。',
        threatRules: '噪音、血腥味、强光、拥挤路线和错误移动会提高尸群聚集风险；防护装备会降低但不能免疫风险。'
    } : {};
    return {
        id: `world-rules-${profile.value}`,
        type: 'world_rules',
        title: isZombie ? '末日丧尸世界规则' : `${profile.shortLabel}世界规则`,
        subtitle: `${profile.auctionName}、${profile.marketVerb}`,
        description: isZombie
            ? '补齐末日丧尸的感染路径、防护隔离、噪音仇恨、营地信用、补给折价和地图组织规则。'
            : `为${profile.label}补齐世界边界、交易折价、地图组织和资源规则。`,
        tags: isZombie ? [profile.shortLabel, '感染机制', '营地信用'] : [profile.shortLabel, '世界规则', '货币'],
        payload: {
            worldExtraRequirement: profile.worldDefaults.worldExtraRequirement,
            currencyExchangePrompt: profile.currencyExchangePrompt,
            marketVerb: profile.marketVerb,
            mapPrompt: profile.mapPrompt,
            ...extraPayload
        },
        injectionPreview: [
            `worldConfig.worldExtraRequirement：${profile.worldDefaults.worldExtraRequirement}`,
            `货币折算提示：${profile.currencyExchangePrompt}`,
            `地图生成提示：${profile.mapPrompt}`,
            `市场行为词：${profile.marketVerb}`,
            ...(isZombie ? [
                '感染机制：咬伤、血液和污染体液传播，防护装备降低但不能免疫风险。',
                '仇恨规则：噪音、血腥味、强光和拥挤路线会提高尸群聚集风险。',
                '营地规则：检疫、隔离、物资消毒、通行权和营地信用会影响交易。'
            ] : [])
        ],
        source: 'builtin',
        contributor: '官方',
        preset: 构建题材预设(
            `workshop_world_rules_${profile.value}`,
            `工坊·${profile.shortLabel}世界规则`,
            `${profile.label}世界规则包。`,
            mode,
            构建角色(题材默认角色[mode].姓名, 题材默认角色[mode].背景, 题材默认角色[mode].天赋),
            isZombie
                ? `${profile.worldDefaults.worldExtraRequirement} 感染规则：咬伤/血液/污染体液传播；噪音、血腥味、光源和防护装备影响风险；营地会执行检疫、隔离、物资消毒和通行权规则。`
                : profile.worldDefaults.worldExtraRequirement
        )
    };
};

const 构建能力模块 = (mode: keyof typeof 题材模式配置表): 创意工坊模块条目 => {
    const profile = 题材模式配置表[mode];
    const manualRealmPrompt = profile.manualRealmPrompt;
    const actor = 题材默认角色[mode];
    const preset = 构建题材预设(`workshop_ability_${profile.value}`, `工坊·${profile.shortLabel}能力体系`, `${profile.label}能力边界包。`, mode, 构建角色(actor.姓名, actor.背景, actor.天赋));
    return {
        id: `ability-${profile.value}`,
        type: 'ability',
        title: `${profile.shortLabel}能力体系`,
        subtitle: profile.skillNames.slice(0, 4).join('、'),
        description: `为${profile.label}注入成长边界、技能方向和手动能力/境界提示词。`,
        tags: [profile.shortLabel, '能力体系', '成长边界'],
        payload: { manualRealmPrompt, skillNames: profile.skillNames },
        injectionPreview: [
            `worldConfig.manualRealmPrompt：${manualRealmPrompt}`,
            `可用技艺：${profile.skillNames.join('、')}`,
            `能力边界：${profile.promptLines.join(' / ')}`
        ],
        source: 'builtin',
        contributor: '官方',
        preset: {
            ...preset,
            worldConfig: {
                ...preset.worldConfig,
                manualRealmPrompt
            }
        }
    };
};

const 构建ComfyUI工作流模块 = (
    id: string,
    title: string,
    style: string,
    scope: 'main' | 'scene' | 'nsfw' | 'all',
    workflowJson: string,
    description: string
): 创意工坊模块条目 => {
    let nodeCount = 0;
    try {
        nodeCount = Object.keys(JSON.parse(workflowJson)).length;
    } catch {
        nodeCount = 0;
    }
    return {
        id,
        type: 'comfy_workflow',
        title,
        subtitle: `${style} · ${scope === 'nsfw' ? 'NSFW 生图' : scope === 'scene' ? '场景生图' : '普通生图'}`,
        description,
        tags: ['ComfyUI', 'Workflow', style, scope],
        payload: {
            workflowJson,
            scope,
            style,
            nodeCount
        },
        injectionPreview: [
            `适用范围：${scope}`,
            `风格：${style}`,
            `节点数量：${nodeCount}`,
            '注入方式：选择后写入对应 ComfyUI Workflow JSON，并关闭“使用默认工作流”。'
        ],
        source: 'builtin',
        contributor: '官方'
    };
};

const 双人成行V11酒馆预设模块: 创意工坊模块条目 = {
    id: 'tavern-preset-double-journey-v11',
    type: 'tavern_preset',
    formatVersion: 2,
    workshopKind: 'standard_module',
    title: '双人成行v11.0墨染江湖适配版',
    subtitle: '玩家贡献 · SillyTavern 酒馆预设',
    description: '玩家贡献的双人成行 v11 墨染江湖适配预设，在云端工坊不可用时仍可离线选择。',
    tags: ['酒馆预设', 'SillyTavern', '双人成行'],
    payload: {
        schema: 'moranjianghu-creative-workshop-tavern-preset',
        version: 1,
        presetPath: '/tavern-presets/double-journey-v11.json'
    },
    usagePrompt: '在设置里的酒馆预设下拉框选择后直接启用；预设内的提示词启用状态和正则脚本开关会随 JSON 保留。',
    safetyNotes: ['该预设来自玩家上传内容，启用后请按当前模型能力复核提示词和正则脚本效果。'],
    injectionPreview: [
        '类型：SillyTavern 酒馆预设',
        '版本：双人成行 v11.0 墨染江湖适配版',
        '包含：prompts、prompt_order、generation 参数、regex_scripts 扩展',
        '开关状态：保留 prompt_order enabled 与 regex_scripts disabled 状态'
    ],
    source: 'builtin',
    contributor: '匿名玩家',
    anonymous: true
};

const Izumi0623酒馆预设模块: 创意工坊模块条目 = {
    id: 'tavern-preset-izumi-0623',
    type: 'tavern_preset',
    formatVersion: 2,
    workshopKind: 'standard_module',
    title: 'Izumi 0623',
    subtitle: '玩家贡献 · SillyTavern 酒馆预设',
    description: '玩家上传的 Izumi 0623 酒馆预设，包含提示词顺序、启用开关、生成参数和正则脚本兼容信息。',
    tags: ['酒馆预设', 'SillyTavern', 'Izumi'],
    payload: {
        schema: 'moranjianghu-creative-workshop-tavern-preset',
        version: 1,
        presetPath: '/tavern-presets/izumi-0623.json'
    },
    usagePrompt: '在设置里的酒馆预设下拉框选择后直接启用；预设内的提示词启用状态和正则脚本开关会随 JSON 保留。',
    safetyNotes: ['该预设来自玩家上传内容，启用后请按当前模型能力复核提示词和正则脚本效果。'],
    injectionPreview: [
        '类型：SillyTavern 酒馆预设',
        '来源：匿名玩家上传',
        '包含：prompts、prompt_order、generation 参数、regex_scripts 扩展',
        '开关状态：保留 prompt_order enabled 与 regex_scripts disabled 状态'
    ],
    source: 'builtin',
    contributor: '匿名玩家',
    anonymous: true
};

const 推断注入目标 = (entry: 创意工坊模块条目): NonNullable<创意工坊模块条目['contentBlocks']>[number]['injectionTarget'] => {
    if (entry.type === 'ability') return 'manualRealmPrompt';
    if (entry.type === 'comfy_workflow') return 'imageWorkflow';
    if (entry.type === 'tavern_preset') return 'referenceOnly';
    if (entry.type === 'world_rules' || entry.type === 'topic' || entry.type === 'opening') return 'manualWorldPrompt';
    return 'referenceOnly';
};

const 统一为标准模块格式 = (entry: 创意工坊模块条目): 创意工坊模块条目 => {
    if (entry.formatVersion === 2 && entry.workshopKind === 'standard_module' && entry.contentBlocks?.length) return entry;
    const injectionTarget = 推断注入目标(entry);
    const payloadContent = typeof entry.payload?.content === 'string'
        ? entry.payload.content
        : entry.type === 'comfy_workflow'
            ? String(entry.payload?.workflowJson || '')
            : entry.type === 'tavern_preset'
                ? String(entry.payload?.presetPath || JSON.stringify(entry.payload?.tavernPreset || entry.tavernPreset || {}, null, 2))
            : entry.injectionPreview.join('\n');
    const content = payloadContent.trim() || JSON.stringify(entry.payload || {}, null, 2);
    const blockTitle = entry.type === 'comfy_workflow'
        ? 'ComfyUI 工作流'
        : entry.type === 'tavern_preset'
            ? '酒馆预设'
        : entry.type === 'ability'
            ? '能力与境界规则'
            : entry.type === 'topic'
                ? '题材开局规则'
                : '世界规则';
    const usagePrompt = entry.type === 'comfy_workflow'
        ? '在文生图设置中选择该工作流；确保 ComfyUI API 工作流 JSON 有效，并按需要保留占位符。'
        : entry.type === 'tavern_preset'
            ? '在酒馆预设设置中选择该预设；提示词顺序、启用开关和正则脚本状态会随预设保留。'
        : entry.type === 'ability'
            ? '作为手动能力/境界提示词注入，用于约束成长体系、战力边界和技能命名。'
            : '作为手动世界观提示词注入，用于约束开局世界、势力、货币、地图和叙事边界。';
    const safetyNotes = entry.type === 'comfy_workflow'
        ? ['发布工作流前请移除本机路径、私有节点地址和个人密钥。']
        : entry.type === 'tavern_preset'
            ? ['发布酒馆预设前请确认 JSON 不包含账号密钥、本机路径或不可公开的私有内容。']
        : ['投稿内容应避免泄露个人隐私、账号密钥或不可公开的版权素材。'];
    const contentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        {
            id: `${entry.id}-main`,
            title: blockTitle,
            purpose: entry.description || '作为创意工坊标准模块的主要注入内容。',
            injectionTarget,
            content
        }
    ];
    return {
        ...entry,
        formatVersion: 2,
        workshopKind: 'standard_module',
        contentBlocks,
        usagePrompt,
        safetyNotes,
        payload: {
            ...entry.payload,
            schema: 'moranjianghu-creative-workshop-standard-module',
            version: 2,
            content,
            contentBlocks,
            usagePrompt,
            safetyNotes
        }
    };
};

const 构建标准内容模块 = (params: {
    id: string;
    type: 'world_rules' | 'ability' | 'topic';
    title: string;
    subtitle: string;
    description: string;
    tags: string[];
    mode: keyof typeof 题材模式配置表;
    contributor: string;
    suiteId?: string;
    suiteTitle?: string;
    blocks: NonNullable<创意工坊模块条目['contentBlocks']>;
    usagePrompt: string;
    safetyNotes?: string[];
}): 创意工坊模块条目 => {
    const content = params.blocks
        .map((block) => [`【${block.title}】`, block.content.trim()].filter(Boolean).join('\n'))
        .join('\n\n');
    const actor = 题材默认角色[params.mode];
    const backgrounds = 获取题材预设背景(params.mode);
    const talents = 获取题材预设天赋(params.mode);
    const preset = 构建题材预设(
        `workshop_${params.id}`,
        `工坊·${params.title}`,
        params.description,
        params.mode,
        构建角色(actor.姓名, actor.背景, actor.天赋),
        params.type === 'world_rules' || params.type === 'topic' ? content : ''
    );
    return {
        id: params.id,
        type: params.type,
        formatVersion: 2,
        workshopKind: 'standard_module',
        title: params.title,
        subtitle: params.subtitle,
        description: params.description,
        tags: params.tags,
        payload: {
            schema: 'moranjianghu-creative-workshop-standard-module',
            version: 2,
            suiteId: params.suiteId,
            suiteTitle: params.suiteTitle,
            packagePart: params.type,
            mode: params.mode,
            content,
            contentBlocks: params.blocks,
            usagePrompt: params.usagePrompt,
            safetyNotes: params.safetyNotes || [],
            backgrounds,
            talents
        },
        contentBlocks: params.blocks,
        usagePrompt: params.usagePrompt,
        safetyNotes: params.safetyNotes || [],
        injectionPreview: [
            `标准格式：v2 / ${params.type}`,
            ...(params.suiteTitle ? [`完整模式包：${params.suiteTitle}`] : []),
            ...params.blocks.slice(0, 4).map((block) => `${block.injectionTarget || 'referenceOnly'}：${block.title} - ${block.purpose}`),
            `身份背景池：${backgrounds.slice(0, 6).map((item) => item.名称).join('、')}`,
            `天赋池：${talents.slice(0, 6).map((item) => item.名称).join('、')}`,
            `使用提示：${params.usagePrompt}`
        ],
        source: 'builtin',
        contributor: params.contributor,
        preset: params.type === 'ability'
            ? {
                ...preset,
                worldConfig: {
                    ...preset.worldConfig,
                    manualRealmPrompt: content
                }
            }
            : preset
    };
};

const 玩家贡献者 = 'disfuckc0rd';
const 轨迹套装ID = 'community-trails-suite';
const 综武套装ID = 'community-crossover-wuxia-suite';
const 女骑套装ID = 'community-rideress-suite';
const 宝可梦套装ID = 'community-pokemon-suite';

const 轨迹题材模块 = 构建标准内容模块({
    id: 'community-trails-topic-template',
    type: 'topic',
    title: '轨迹题材模板',
    subtitle: '塞姆利亚、导力革命、游击士协会',
    description: '把开局切到轨迹系列同人冒险口径，统一塞姆利亚大陆、导力科技、米拉货币和协会/军政组织叙事。',
    tags: ['同人融合', '轨迹', '题材模板', '导力'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 轨迹套装ID,
    suiteTitle: '轨迹系列完整模式包',
    usagePrompt: '作为完整模式包的题材入口使用；建议再同时启用同套世界规则和能力体系。',
    safetyNotes: ['同人角色年龄、所属组织和经历必须随七曜历年份同步。'],
    blocks: [
        {
            id: 'topic-core',
            title: '题材入口',
            purpose: '设定本局基础舞台。',
            injectionTarget: 'manualWorldPrompt',
            content: '本局为轨迹系列同人冒险题材，舞台以塞姆利亚大陆为核心；游击士协会、各国军政势力、猎兵团、结社、财团和学院组织都可以作为长期剧情来源。'
        },
        {
            id: 'topic-currency',
            title: '货币与物资',
            purpose: '替换默认江湖交易词。',
            injectionTarget: 'manualWorldPrompt',
            content: '常规货币统一使用米拉；交易品以导力器、回路、药品、旅行装备、情报委托和地方特产为主，不使用银子、灵石、丹药作为默认经济核心。'
        }
    ]
});

const 轨迹世界规则模块 = 构建标准内容模块({
    id: 'community-trails-world-rules',
    type: 'world_rules',
    title: '轨迹世界规则包',
    subtitle: '塞姆利亚大陆、导力科技年表、米拉货币',
    description: '把轨迹系列世界观整理为可注入的世界规则，强调导力科技民用化时间线、国家组织登场口径和米拉货币。',
    tags: ['同人融合', '轨迹', '世界规则', '米拉'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 轨迹套装ID,
    suiteTitle: '轨迹系列完整模式包',
    usagePrompt: '适合开启同人融合后使用；建议作品名写“空之轨迹/零之轨迹/闪之轨迹/创之轨迹/黎之轨迹”，并在正文提示中要求按对应年份查角色年龄与科技阶段。',
    safetyNotes: ['同人角色年龄必须按当前年份定位，避免年龄 OOC。', '科技道具必须受七曜历民用化时间限制。'],
    blocks: [
        {
            id: 'world-core',
            title: '世界核心',
            purpose: '规定舞台与角色来源。',
            injectionTarget: 'manualWorldPrompt',
            content: '故事舞台为塞姆利亚大陆；国家、组织、势力和原著角色可陆续登场。原著角色登场时必须结合当前七曜历年份定位年龄、阵营与经历，不得把少年期角色写成成年期状态。'
        },
        {
            id: 'orbal-timeline',
            title: '导力科技时间线',
            purpose: '避免早期剧情提前出现民用导力设备。',
            injectionTarget: 'manualWorldPrompt',
            content: '1195 年前民间科技以蒸汽科技和畜力为主；1195 年导力科技由军用逐渐转入民用；1196 年民用个人战术导力器开始流入市场；1200 年出现民用导力列车；1201 年出现民用飞艇运输；1204 年初民用导力通讯系统才逐渐铺开。'
        },
        {
            id: 'currency',
            title: '米拉货币',
            purpose: '统一交易口径。',
            injectionTarget: 'manualWorldPrompt',
            content: '轨迹世界所有普通金钱单位统一称为米拉。换算口径：1 铜 = 1 米拉，1 银 = 100 米拉，1 金 = 10000 米拉。剧情中不要使用铜钱、银子、金元宝、灵石作为常规货币显示。'
        }
    ]
});

const 轨迹能力模块 = 构建标准内容模块({
    id: 'community-trails-ability-system',
    type: 'ability',
    title: '轨迹战力境界表',
    subtitle: 'F级到S级、导力魔法、战技边界',
    description: '把轨迹角色战力拆为 F/E/D/C/B/A/A+/A++/准S/S，并补充导力魔法、战技和装备对战力的影响。',
    tags: ['同人融合', '轨迹', '能力体系', '战力平衡'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 轨迹套装ID,
    suiteTitle: '轨迹系列完整模式包',
    usagePrompt: '用于 manualRealmPrompt。角色实力应根据表现倒推等级，不要写成修炼到某境界后自动获得力量。',
    safetyNotes: ['战力等级仅描述单兵能力，坦克、装甲、古代遗物和大型导力阵列需要另行估算。'],
    blocks: [
        {
            id: 'realm-map',
            title: '境界映射母板',
            purpose: '替换默认境界命名。',
            injectionTarget: 'manualRealmPrompt',
            content: '1-2 为 F级，3-6 为 E级，7-10 为 D级，11-14 为 C级，15-18 为 B级，19-22 为 A级，24 为达人级（A+），27 为流派极致（A++），33 为准S级，43 为 S级。'
        },
        {
            id: 'combat-boundary',
            title: '能力边界',
            purpose: '约束战斗强度。',
            injectionTarget: 'manualRealmPrompt',
            content: 'D级对应准游击士、普通士兵、落魄猎兵和基础战技/初级导力魔法；C级对应正游击士、精英士兵和成熟战技；B级为经验丰富游击士、特殊精英部队和年轻一辈优秀者；A级为高阶猎兵、正骑士、执行者/使徒弱者等级；S级为大陆顶尖单兵极限。'
        },
        {
            id: 'gap-rules',
            title: '差距口径',
            purpose: '指导强弱判定。',
            injectionTarget: 'manualRealmPrompt',
            content: '差值 1-2 为小差距，3-5 为明显差距，6-9 为压制差距，10+ 为断层差距。跨大境时即使数值差小，也应体现气机质量、经验和掌控力差异。'
        }
    ]
});

const 综武题材模块 = 构建标准内容模块({
    id: 'community-crossover-wuxia-topic-template',
    type: 'topic',
    title: '综武题材模板',
    subtitle: '多作者武侠融合、门派江湖、八年前缓启动',
    description: '把开局切到综合武侠同人融合口径，统一多作者角色、门派、朝廷和江湖事件的登场方式。',
    tags: ['同人融合', '综武', '题材模板', '江湖'],
    mode: '武侠',
    contributor: 玩家贡献者,
    suiteId: 综武套装ID,
    suiteTitle: '综武世界完整模式包',
    usagePrompt: '作为综武完整模式包的题材入口使用；建议与同套世界规则和能力体系一起启用。',
    safetyNotes: ['跨作品角色不要强行挤在同一事件里，优先按地域、门派和年代逐步展开。'],
    blocks: [
        {
            id: 'topic-core',
            title: '题材入口',
            purpose: '设定本局综合武侠舞台。',
            injectionTarget: 'manualWorldPrompt',
            content: '本局为综合武侠同人融合题材，可融合金庸、古龙、黄易、梁羽生、温瑞安、风云等武侠源流；江湖由门派、镖局、朝廷、异族势力、商会和隐秘组织共同构成。'
        },
        {
            id: 'topic-pace',
            title: '开局节奏',
            purpose: '避免开局撞满原著主线。',
            injectionTarget: 'manualWorldPrompt',
            content: '开局应从地方门派、镖局、小镇风波、师门任务或朝廷边缘事件切入，让原著人物以传闻、支线委托或地域事件逐渐出现。'
        }
    ]
});

const 综武世界规则模块 = 构建标准内容模块({
    id: 'community-crossover-wuxia-world-rules',
    type: 'world_rules',
    title: '综武世界规则包',
    subtitle: '金古黄梁温风多线融合、八年前时间线',
    description: '整理综合武侠世界的国家、门派、原著角色比例和时间线规则，让原著角色与杜撰角色按比例共同登场。',
    tags: ['同人融合', '综武', '世界规则', '原著角色'],
    mode: '武侠',
    contributor: 玩家贡献者,
    suiteId: 综武套装ID,
    suiteTitle: '综武世界完整模式包',
    usagePrompt: '适合开启同人融合；建议作品名写“多情剑客无情剑/射雕英雄传/天龙八部/大唐双龙传/风云等综武”。',
    safetyNotes: ['原著角色与事件要尊重各作品时间顺序；涉及射雕/神雕/倚天等强时间线作品时优先保持原著前后关系。'],
    blocks: [
        {
            id: 'source-ratio',
            title: '角色与门派比例',
            purpose: '避免全是杜撰角色。',
            injectionTarget: 'manualWorldPrompt',
            content: '原著小说门派与杜撰门派比例建议不低于 3:1；重要门派掌门和中流砥柱优先使用原著角色；出场人物中原著角色与杜撰角色比例不低于 1.5:1。'
        },
        {
            id: 'timeline',
            title: '八年前时间线',
            purpose: '让开局不会立刻撞上全部原著主线。',
            injectionTarget: 'manualWorldPrompt',
            content: '默认游戏时间设在多数原著剧情开始前 8 年；前 8 年可以使用原著背景事件和倒推事件，但不主动触发完整原著主线。第 8 年后解除该限制，原著事件与杜撰事件按约 1:1 推进。'
        },
        {
            id: 'world-layout',
            title: '地缘与势力',
            purpose: '建立综武大地图。',
            injectionTarget: 'manualWorldPrompt',
            content: '汉人区域有大隋/大唐、大宋、大明与大理；北方异族帝国有吐蕃、蒙元、辽金、大清；西方有西夏。南北少林、明教与日月神教等相近概念应拆分清楚。'
        }
    ]
});

const 综武能力模块 = 构建标准内容模块({
    id: 'community-crossover-wuxia-ability-system',
    type: 'ability',
    title: '综武境界提示模板',
    subtitle: '多作者武侠战力平衡',
    description: '为综合武侠世界提供战力平衡口径，避免某一作者体系碾压其他体系。',
    tags: ['同人融合', '综武', '能力体系', '战力平衡'],
    mode: '武侠',
    contributor: 玩家贡献者,
    suiteId: 综武套装ID,
    suiteTitle: '综武世界完整模式包',
    usagePrompt: '用于 manualRealmPrompt；同一境界内可用招式、经验、兵器、内功属性和地形拉开差异。',
    safetyNotes: ['跨作品角色交手时以剧情表现、江湖名望和具体战场条件综合判断。'],
    blocks: [
        {
            id: 'balance',
            title: '跨作品平衡',
            purpose: '防止单一体系碾压。',
            injectionTarget: 'manualRealmPrompt',
            content: '金庸、古龙、黄易、梁羽生、温瑞安、风云等体系的顶尖角色需要保持可比较的江湖战力，不允许某一作者系列天然完全碾压其他系列。'
        },
        {
            id: 'factors',
            title: '胜负因素',
            purpose: '丰富判定。',
            injectionTarget: 'manualRealmPrompt',
            content: '战斗胜负受内功深厚、招式克制、轻功、兵器、毒、暗器、阵法、地形、情报、心境和伤势影响；不要只按名气直接判定胜负。'
        }
    ]
});

const 女骑题材模块 = 构建标准内容模块({
    id: 'community-rideress-topic-template',
    type: 'topic',
    title: '女骑题材模板',
    subtitle: '成人奇幻、双人战斗、光暗阵营',
    description: '把开局切到成人向奇幻女骑世界口径，只保留成年人自愿搭档、荒诞爽文和光暗阵营冲突。',
    tags: ['成人向', '奇幻', '题材模板', '女骑'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 女骑套装ID,
    suiteTitle: '女骑世界完整模式包',
    usagePrompt: '仅在 NSFW 成人模式下作为完整模式包入口使用；必须同时遵守成年人、自愿、可退出原则。',
    safetyNotes: ['已移除未成年、近亲和非自愿内容。', '亲密关系必须明确为成年人自愿。'],
    blocks: [
        {
            id: 'topic-core',
            title: '题材入口',
            purpose: '建立安全版女骑成人奇幻舞台。',
            injectionTarget: 'manualWorldPrompt',
            content: '本局为成人奇幻女骑题材，舞台包含帝国、教会、骑士团、魔法学院、冒险者公会、魔王军、精灵、兽人、龙族、吸血鬼与魅魔等势力。所有亲密关系和搭档关系均限定为成年人自愿。'
        },
        {
            id: 'topic-pair',
            title: '搭档叙事',
            purpose: '限定题材核心互动。',
            injectionTarget: 'manualWorldPrompt',
            content: '成年骑女与成年骑士的搭档关系可体现战斗配合、契约、默契、补给和情感张力，但不得把未成年人、强迫或不可退出关系作为开局设定。'
        }
    ]
});

const 女骑世界规则模块 = 构建标准内容模块({
    id: 'community-rideress-world-rules',
    type: 'world_rules',
    title: '女骑世界规则包',
    subtitle: '成人向奇幻、骑女/骑士组合、光暗阵营',
    description: '整理成人向西方奇幻女骑世界的社会结构、战斗组合、光暗阵营和 B 级片式荒诞文风。',
    tags: ['成人向', '奇幻', '世界规则', '女骑'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 女骑套装ID,
    suiteTitle: '女骑世界完整模式包',
    usagePrompt: '仅适合开启 NSFW 成人模式并确认角色均为成年人时使用；不要把未成年人训练、近亲性行为或非自愿内容写入开局。',
    safetyNotes: ['本内置版已移除未成年人与近亲性内容，只保留成年人自愿组合的成人奇幻设定。', '所有亲密描写必须遵循成年人、自愿、可退出原则。'],
    blocks: [
        {
            id: 'world-core',
            title: '世界核心',
            purpose: '建立女骑世界的成人奇幻基调。',
            injectionTarget: 'manualWorldPrompt',
            content: '这是一个西方奇幻世界，有帝国、骑士团、魔法学院、教会、冒险者公会、精灵、兽人、龙、魔王、吸血鬼、魅魔等阵营。光明势力大体在东，黑暗势力大体在西，人类城市采用类似分封制度。'
        },
        {
            id: 'rider-pair',
            title: '骑女/骑士组合',
            purpose: '定义战斗职业结构。',
            injectionTarget: 'manualWorldPrompt',
            content: '成年人骑女与成年骑士可以组成高机动双人战斗组合。女性承担主要机动与防护，男性通过配合与能量传导提供爆发和续航。所有角色必须为成年人且自愿结成搭档。'
        },
        {
            id: 'tone',
            title: '文风与社会',
            purpose: '约束叙事味道。',
            injectionTarget: 'manualWorldPrompt',
            content: '叙事风格接近网文与 B 级电影式荒诞爽文：通俗、直白、节奏快、一本正经地处理夸张规则。女性在社会中多担任城主、将军、校长、公会高层、骑士团长或学院院长等职位。'
        }
    ]
});

const 女骑能力模块 = 构建标准内容模块({
    id: 'community-rideress-ability-system',
    type: 'ability',
    title: '女骑境界表',
    subtitle: '驮马/军马/战马到神骑士',
    description: '把女骑世界的双人战斗能力拆为女/男双名称境界，并强调组合战力与单独战力不同。',
    tags: ['成人向', '女骑', '能力体系', '双人战斗'],
    mode: '西方奇幻',
    contributor: 玩家贡献者,
    suiteId: 女骑套装ID,
    suiteTitle: '女骑世界完整模式包',
    usagePrompt: '用于 manualRealmPrompt。判定时区分女性单独战力、男性单独战力和成年搭档组合战力。',
    safetyNotes: ['所有搭档关系必须为成年人自愿。'],
    blocks: [
        {
            id: 'realm-map',
            title: '境界映射母板',
            purpose: '替换默认境界名称。',
            injectionTarget: 'manualRealmPrompt',
            content: '1-4 为驮马/驮骑士，5-8 为军马/军骑士，9-12 为战马/战骑士，13-16 为天马/天骑士，17-20 为龙马/龙骑士，21/22/24 为皇马/皇骑士，27 为帝马/帝骑士，33 为圣马/圣骑士，43 为神马/神骑士。'
        },
        {
            id: 'pair-combat',
            title: '组合战力',
            purpose: '定义双人战斗算法。',
            injectionTarget: 'manualRealmPrompt',
            content: '女性单独仍有战斗力但续航下降；男性单独通常难以发挥战斗力；成年人搭档骑乘配合时可把男性等级作为增益叠加到女性战斗表现上，但受体力、心态、配合默契和战场干扰影响。'
        }
    ]
});

const 宝可梦题材模块 = 构建标准内容模块({
    id: 'community-pokemon-topic-template',
    type: 'topic',
    title: '宝可梦题材模板',
    subtitle: '训练家旅行、道馆徽章、属性克制',
    description: '把玩家上传的宝可梦题材模板整理为完整模式包入口，统一宝可梦图鉴、精灵球、联盟奖章、P币和羁绊叙事。',
    tags: ['宝可梦', '动画同人', '题材模板', '冒险'],
    mode: '现代都市',
    contributor: 玩家贡献者,
    suiteId: 宝可梦套装ID,
    suiteTitle: '宝可梦冒险完整模式包',
    usagePrompt: '作为宝可梦完整模式包的题材入口使用；建议同时启用同套世界规则和能力体系。',
    safetyNotes: ['保持训练家冒险基调，宝可梦不是普通掉落素材。', '联盟规则和宝可梦中心应承担伤病恢复与比赛秩序。'],
    blocks: [
        {
            id: 'topic-core',
            title: '题材入口',
            purpose: '设定宝可梦冒险基础。',
            injectionTarget: 'manualWorldPrompt',
            content: '本局为宝可梦冒险题材，以训练家旅行、道馆挑战、联盟大会、宝可梦图鉴、属性克制、精灵球和伙伴羁绊为核心。小智、研究所、地区博士、火箭队等元素可按剧情需要登场或映射。'
        },
        {
            id: 'topic-currency',
            title: '货币与交易',
            purpose: '替换默认现代/修炼经济。',
            injectionTarget: 'manualWorldPrompt',
            content: '三层货币的底层货币可命名为 P币/宝可梦币；核心交易物为精灵球、伤药、解毒药、树果、技能学习器、露营用品、训练器材和旅行补给。不要使用银子、灵石、丹药或现代商业合同作为默认成长资源。'
        }
    ]
});

const 宝可梦世界规则模块 = 构建标准内容模块({
    id: 'community-pokemon-world-rules',
    type: 'world_rules',
    title: '宝可梦世界规则包',
    subtitle: '生态遭遇、联盟秩序、中心与商店',
    description: '补齐宝可梦冒险需要的世界规则：野外生态、收服流程、联盟道馆、宝可梦中心、市场和反派组织。',
    tags: ['宝可梦', '世界规则', '联盟', '生态'],
    mode: '现代都市',
    contributor: 玩家贡献者,
    suiteId: 宝可梦套装ID,
    suiteTitle: '宝可梦冒险完整模式包',
    usagePrompt: '用于 manualWorldPrompt/worldExtraRequirement；适合和宝可梦题材模板、能力体系一起启用。',
    safetyNotes: ['常规推进不以杀死宝可梦或肢解掉落为奖励。', '训练家对战应遵守联盟规则，违规冲突需在正文中承担后果。'],
    blocks: [
        {
            id: 'world-ecology',
            title: '野外生态与遭遇',
            purpose: '让地图与宝可梦分布相关。',
            injectionTarget: 'manualWorldPrompt',
            content: '野生宝可梦分布受道路、森林、洞窟、水域、城市、天气、昼夜和栖息地影响。遭遇应体现观察、接近、战斗、安抚、投球或撤退选择，不把宝可梦当作普通怪物掉落。'
        },
        {
            id: 'world-league',
            title: '联盟与设施',
            purpose: '建立社会秩序。',
            injectionTarget: 'manualWorldPrompt',
            content: '地区联盟管理道馆、徽章、图鉴登记、正式比赛和训练家资格；宝可梦中心负责治疗、住宿、通信与基础托管；友好商店出售精灵球、药品、树果和旅行补给。'
        },
        {
            id: 'world-conflict',
            title: '反派与冲突边界',
            purpose: '让冒险有风险但不偏离题材。',
            injectionTarget: 'manualWorldPrompt',
            content: '火箭队或类似反派组织可以偷猎、走私、抢夺稀有宝可梦、干扰比赛或操纵舆论；主线冲突应围绕伙伴保护、联盟秩序、生态危机和训练家成长展开。'
        }
    ]
});

const 宝可梦能力模块 = 构建标准内容模块({
    id: 'community-pokemon-ability-system',
    type: 'ability',
    title: '宝可梦能力体系',
    subtitle: '训练家段位、徽章权限、宝可梦成长',
    description: '把默认修炼境界替换为训练家成长、宝可梦等级、属性克制、招式、特性、道具和羁绊体系。',
    tags: ['宝可梦', '能力体系', '训练家', '属性克制'],
    mode: '现代都市',
    contributor: 玩家贡献者,
    suiteId: 宝可梦套装ID,
    suiteTitle: '宝可梦冒险完整模式包',
    usagePrompt: '用于 manualRealmPrompt。角色成长主要来自训练家指挥、宝可梦培育和徽章权限，不写成修仙突破。',
    safetyNotes: ['人类通常不直接以肉身和宝可梦对打，除非剧情明确是特殊能力者或特殊世界线。'],
    blocks: [
        {
            id: 'trainer-rank',
            title: '训练家段位',
            purpose: '替换境界名称。',
            injectionTarget: 'manualRealmPrompt',
            content: '人物成长以训练家段位表达：新手训练家、见习训练家、道馆挑战者、资深训练家、精英训练家、馆主级、四天王候补、冠军级、传说级事件参与者。徽章主要解锁服从度、旅行权限、联盟赛事资格和社会信用。'
        },
        {
            id: 'pokemon-growth',
            title: '宝可梦成长',
            purpose: '定义战斗算法。',
            injectionTarget: 'manualRealmPrompt',
            content: '宝可梦战力由等级、属性、种族特点、个体差异、招式池、特性、携带道具、状态异常、天气/场地和训练家指挥共同决定；属性克制和战术选择可以让弱势方翻盘。'
        },
        {
            id: 'human-skills',
            title: '人类技能',
            purpose: '限定主角可提升能力。',
            injectionTarget: 'manualRealmPrompt',
            content: '训练家可提升指挥、观察、培育、护理、露营、路线规划、战术阅读、临场心理和团队管理技能；除非用户另设特殊能力，否则人类不通过境界突破获得超自然战斗力。'
        }
    ]
});

const 取模块文本 = (entry: 创意工坊模块条目, preferredTarget?: NonNullable<创意工坊模块条目['contentBlocks']>[number]['injectionTarget']): string => {
    const payload = entry.payload || {};
    const direct = entry.type === 'world_rules'
        ? payload.worldExtraRequirement
        : entry.type === 'ability'
            ? payload.manualRealmPrompt
            : payload.manualWorldPrompt;
    const directText = typeof direct === 'string' ? direct.trim() : '';
    if (directText) return directText;
    const matchedBlock = (entry.contentBlocks || []).find((block) => !preferredTarget || block.injectionTarget === preferredTarget);
    if (matchedBlock?.content?.trim()) return matchedBlock.content.trim();
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    if (content) return content;
    if (entry.type === 'world_rules' && entry.preset?.openingExtraRequirement?.trim()) return entry.preset.openingExtraRequirement.trim();
    if (entry.type === 'ability' && entry.preset?.worldConfig?.manualRealmPrompt?.trim()) return entry.preset.worldConfig.manualRealmPrompt.trim();
    return entry.injectionPreview.join('\n').trim();
};

const 重标注内容块 = (
    entry: 创意工坊模块条目,
    fallbackTitle: string,
    injectionTarget: NonNullable<创意工坊模块条目['contentBlocks']>[number]['injectionTarget']
): NonNullable<创意工坊模块条目['contentBlocks']> => {
    const blocks = entry.contentBlocks?.length
        ? entry.contentBlocks
        : [{
            id: `${entry.id}-content`,
            title: fallbackTitle,
            purpose: entry.description,
            content: 取模块文本(entry, injectionTarget),
            injectionTarget
        }];
    return blocks.map((block, index) => ({
        ...block,
        id: `${entry.id}-${block.id || index}`,
        title: block.title || fallbackTitle,
        injectionTarget
    }));
};

const 是普通对象 = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const 深合并模块对象 = (base: unknown, overlay: unknown): Record<string, any> => {
    const result: Record<string, any> = 是普通对象(base) ? JSON.parse(JSON.stringify(base)) : {};
    if (!是普通对象(overlay)) return result;
    for (const [key, value] of Object.entries(overlay)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' || value === undefined) continue;
        result[key] = 是普通对象(value) && 是普通对象(result[key]) ? 深合并模块对象(result[key], value) : JSON.parse(JSON.stringify(value));
    }
    return result;
};

const 合并模块世界书 = (...sources: unknown[]): 世界书结构[] => {
    const result: 世界书结构[] = [];
    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        for (const rawBook of source) {
            if (!是普通对象(rawBook) || typeof rawBook.id !== 'string') continue;
            const book = JSON.parse(JSON.stringify(rawBook)) as 世界书结构;
            const index = result.findIndex((item) => item.id === book.id);
            if (index < 0) {
                result.push(book);
                continue;
            }
            const entries = [...(result[index].条目 || [])];
            for (const item of book.条目 || []) {
                const entryIndex = entries.findIndex((existing) => existing.id === item.id);
                if (entryIndex < 0) entries.push(item);
                else entries[entryIndex] = { ...entries[entryIndex], ...item };
            }
            result[index] = { ...result[index], ...book, 条目: entries };
        }
    }
    return result;
};

const 读取分段运行时配置 = (entry?: 创意工坊模块条目): Record<string, any> => entry
    ? 深合并模块对象(是普通对象((entry.payload as any)?.modeRuntimeProfile) ? (entry.payload as any).modeRuntimeProfile : {}, 是普通对象(entry.modeRuntimeProfile) ? entry.modeRuntimeProfile : {})
    : {};

export const 是否完整模式包Payload = (payload: unknown): boolean => 是普通对象(payload)
    && (payload.packagePart === 'mode_package' || payload.schema === 'moranjianghu-creative-workshop-mode-package');

const 构建整合模式包 = (topic: 创意工坊模块条目, worldRules?: 创意工坊模块条目, ability?: 创意工坊模块条目): 创意工坊模块条目 => {
    const mode = topic.preset?.openingConfig?.题材模式 || (topic.payload as any)?.mode || (topic.payload as any)?.value;
    const profile = 题材模式配置表[mode as keyof typeof 题材模式配置表];
    const suiteId = typeof topic.payload?.suiteId === 'string' ? topic.payload.suiteId : '';
    const suiteTitle = typeof topic.payload?.suiteTitle === 'string' ? topic.payload.suiteTitle : '';
    const title = suiteTitle
        || (profile ? `${profile.shortLabel}模式包` : topic.title.replace(/题材模板|模板|世界规则包|能力体系/g, '').replace(/包包/g, '包').trim() || `${topic.title}模式包`);
    const manualWorldPrompt = 取模块文本(topic, 'manualWorldPrompt');
    const worldExtraRequirement = worldRules ? 取模块文本(worldRules, 'worldExtraRequirement') : '';
    const manualRealmPrompt = ability ? 取模块文本(ability, 'manualRealmPrompt') : '';
    const backgrounds = Array.isArray((topic.payload as any)?.backgrounds) ? (topic.payload as any).backgrounds : 获取题材预设背景(mode);
    const talents = Array.isArray((topic.payload as any)?.talents) ? (topic.payload as any).talents : 获取题材预设天赋(mode);
    const mergedPayload = 深合并模块对象(深合并模块对象(topic.payload, worldRules?.payload), ability?.payload);
    const rawRuntimeProfile = 深合并模块对象(深合并模块对象(读取分段运行时配置(topic), 读取分段运行时配置(worldRules)), 读取分段运行时配置(ability));
    const modeRuntimeProfile = 规范化模式运行时配置({
        ...rawRuntimeProfile,
        identity: {
            ...rawRuntimeProfile.identity,
            modeId: suiteId || (profile?.value || topic.id),
            displayName: suiteTitle || title,
            baseMode: mode,
            isFandomIp: Boolean(suiteId && !String(suiteId).startsWith('official-'))
        }
    }, mode);
    const contentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        ...重标注内容块(topic, '题材模板', 'manualWorldPrompt'),
        ...(worldRules ? 重标注内容块(worldRules, '世界规则', 'worldExtraRequirement') : []),
        ...(ability ? 重标注内容块(ability, '能力体系', 'manualRealmPrompt') : [])
    ];
    const generatedModeWorldbooks = 构建模式专属世界书({
        id: suiteId || `mode-${profile?.value || topic.id}`,
        title: `${title}世界书`,
        description: `${title}的模式专属世界书。切换/启用该模式包时，这组世界书决定题材口径、世界规则和能力体系。`,
        topicPrompt: manualWorldPrompt,
        worldRulesPrompt: worldExtraRequirement,
        abilityPrompt: manualRealmPrompt,
        extraEntries: [
            构建模式世界书条目(
                `${suiteId || `mode-${profile?.value || topic.id}`}-runtime-profile`,
                '运行时模式配置',
                渲染模式运行时配置世界书内容(modeRuntimeProfile),
                'system_rule',
                全流程模式世界书作用域,
                104
            )
        ]
    });
    const modeWorldbooks = 合并模块世界书(
        (topic.payload as any)?.modeWorldbooks, topic.modeWorldbooks,
        (worldRules?.payload as any)?.modeWorldbooks, worldRules?.modeWorldbooks,
        (ability?.payload as any)?.modeWorldbooks, ability?.modeWorldbooks,
        generatedModeWorldbooks
    );
    const preset = topic.preset ? {
        ...topic.preset,
        worldConfig: {
            ...topic.preset.worldConfig,
            manualWorldPrompt: '',
            worldExtraRequirement: worldExtraRequirement || topic.preset.worldConfig.worldExtraRequirement,
            manualRealmPrompt: '',
            modeRuntimeProfile
        },
        openingConfig: topic.preset.openingConfig
            ? {
                ...topic.preset.openingConfig,
                modeRuntimeProfile,
                允许生成性别: modeRuntimeProfile.opening.allowedGeneratedGenders,
                生成性别锁定: modeRuntimeProfile.opening.lockGeneratedGenders
            }
            : topic.preset.openingConfig,
        openingExtraRequirement: worldExtraRequirement || topic.preset.openingExtraRequirement || ''
    } : undefined;
    return {
        ...topic,
        id: suiteId ? `${suiteId}-mode-package` : `mode-package-${profile?.value || topic.id}`,
        type: 'topic',
        title,
        subtitle: `${topic.subtitle}${worldRules ? ` · ${worldRules.subtitle}` : ''}${ability ? ` · ${ability.subtitle}` : ''}`,
        description: topic.description.replace('题材模板', '模式包'),
        tags: Array.from(new Set([...topic.tags, ...(worldRules?.tags || []), ...(ability?.tags || []), '模式包'])).slice(0, 12),
        payload: {
            ...mergedPayload,
            schema: 'moranjianghu-creative-workshop-mode-package',
            version: 3,
            suiteId: suiteId || undefined,
            suiteTitle: suiteTitle || title,
            packagePart: 'mode_package',
            mode,
            modeMetadata: profile ? {
                value: profile.value,
                label: profile.label,
                shortLabel: profile.shortLabel,
                group: profile.group,
                auctionName: profile.auctionName,
                marketVerb: profile.marketVerb,
                currencyDisplayMode: profile.currencyDisplayMode,
                skillNames: profile.skillNames,
                presetItemKeywords: profile.presetItemKeywords
            } : undefined,
            modeRuntimeProfile,
            modeWorldbooks,
            manualWorldPrompt,
            worldExtraRequirement,
            manualRealmPrompt,
            backgrounds,
            talents,
            content: contentBlocks.map((block) => [`【${block.title}】`, block.content.trim()].filter(Boolean).join('\n')).join('\n\n'),
            contentBlocks,
            usagePrompt: '作为完整模式包注入新建存档：模式专属世界书会统一接管题材口径、世界规则和能力体系；旧版手动提示词字段仅作兼容。',
            safetyNotes: topic.safetyNotes || [],
            sourceModuleParts: {
                topic: { payload: topic.payload, modeRuntimeProfile: topic.modeRuntimeProfile, modeWorldbooks: topic.modeWorldbooks, contentBlocks: topic.contentBlocks },
                ...(worldRules ? { world_rules: { payload: worldRules.payload, modeRuntimeProfile: worldRules.modeRuntimeProfile, modeWorldbooks: worldRules.modeWorldbooks, contentBlocks: worldRules.contentBlocks } } : {}),
                ...(ability ? { ability: { payload: ability.payload, modeRuntimeProfile: ability.modeRuntimeProfile, modeWorldbooks: ability.modeWorldbooks, contentBlocks: ability.contentBlocks } } : {})
            }
        },
        modeWorldbooks,
        modeRuntimeProfile,
        contentBlocks,
        usagePrompt: '作为完整模式包注入新建存档：模式专属世界书会统一接管题材口径、世界规则和能力体系。',
        injectionPreview: [
            '标准格式：v3 / mode_package / modeWorldbooks',
            `模式世界书：${modeWorldbooks[0]?.标题 || title}`,
            `世界书条目：${modeWorldbooks[0]?.条目.length || 0} 条`,
            `题材口径：${manualWorldPrompt.slice(0, 120)}`,
            ...(worldExtraRequirement ? [`世界规则：${worldExtraRequirement.slice(0, 120)}`] : []),
            ...(manualRealmPrompt ? [`能力体系：${manualRealmPrompt.slice(0, 120)}`] : []),
            `身份背景池：${backgrounds.slice(0, 6).map((item: any) => item?.名称).filter(Boolean).join('、')}`,
            `天赋池：${talents.slice(0, 6).map((item: any) => item?.名称).filter(Boolean).join('、')}`
        ],
        preset
    };
};

export const 整合创意工坊模式包 = (entries: 创意工坊模块条目[]): 创意工坊模块条目[] => {
    const passthrough = entries.filter((entry) => (
        entry.type === 'comfy_workflow'
        || entry.type === 'tavern_preset'
        || entry.type === 'opening'
        || (entry.type === 'topic' && 是否完整模式包Payload(entry.payload))
    ));
    const standardEntries = entries.filter((entry) => (
        (entry.type === 'topic' || entry.type === 'world_rules' || entry.type === 'ability')
        && !(entry.type === 'topic' && 是否完整模式包Payload(entry.payload))
    ));
    const keyOf = (entry: 创意工坊模块条目): string => {
        const suiteId = typeof entry.payload?.suiteId === 'string' ? entry.payload.suiteId : '';
        const mode = entry.preset?.openingConfig?.题材模式 || (entry.payload as any)?.mode || (entry.payload as any)?.value || '';
        const packagePart = entry.payload?.packagePart;
        const isSuitePart = packagePart === 'topic' || packagePart === 'world_rules' || packagePart === 'ability';
        if (suiteId && isSuitePart) return `suite:${suiteId}`;
        if (entry.source === 'builtin') return `builtin:${entry.contributor || ''}:${mode || entry.id}`;
        if (isSuitePart) {
            return `legacy-suite:${entry.source || 'unknown'}:${entry.contributor || ''}:${mode || entry.id}`;
        }
        return `entry:${entry.source || 'unknown'}:${entry.id}`;
    };
    const groups = new Map<string, Partial<Record<'topic' | 'world_rules' | 'ability', 创意工坊模块条目>>>();
    standardEntries.forEach((entry) => {
        const key = keyOf(entry);
        const group = groups.get(key) || {};
        if (entry.type === 'topic' || entry.type === 'world_rules' || entry.type === 'ability') {
            group[entry.type] = entry;
        }
        groups.set(key, group);
    });
    const packages = Array.from(groups.entries()).map(([groupKey, group]) => {
        const topic = group.topic || group.world_rules || group.ability;
        if (!topic) return null;
        return groupKey.startsWith('entry:') ? topic : 构建整合模式包(topic, group.world_rules, group.ability);
    }).filter(Boolean) as 创意工坊模块条目[];
    return [...packages, ...passthrough];
};

const 原始创意工坊模块列表: 创意工坊模块条目[] = [
    ...题材模式顺序.map(构建题材模块),
    ...题材模式顺序.map(构建世界规则模块),
    ...题材模式顺序.map(构建能力模块),
    轨迹题材模块,
    轨迹世界规则模块,
    轨迹能力模块,
    综武题材模块,
    综武世界规则模块,
    综武能力模块,
    女骑题材模块,
    女骑世界规则模块,
    女骑能力模块,
    宝可梦题材模块,
    宝可梦世界规则模块,
    宝可梦能力模块,
    双人成行V11酒馆预设模块,
    Izumi0623酒馆预设模块,
    构建ComfyUI工作流模块('comfy-workflow-default-main', '默认普通 ComfyUI 工作流', '通用写实', 'main', 默认ComfyUI工作流JSON, '官方默认普通生图 workflow，适合 NPC、物品和常规画面。'),
    构建ComfyUI工作流模块('comfy-workflow-default-scene', '默认场景 ComfyUI 工作流', '场景氛围', 'scene', 默认ComfyUI工作流JSON, '官方默认场景生图 workflow，适合环境、地点和横竖屏场景图。'),
    构建ComfyUI工作流模块('comfy-workflow-default-nsfw', '默认 NSFW ComfyUI 工作流', 'NSFW 成人向', 'nsfw', 默认NSFWComfyUI工作流JSON, '官方默认 NSFW 生图 workflow，适合私密部位与成人向独立接口。')
].map(统一为标准模块格式);

export const 创意工坊模块列表: 创意工坊模块条目[] = 整合创意工坊模式包(原始创意工坊模块列表);
