import type { 创意工坊模块条目 } from '../data/creativeWorkshopModules';
import type { ModeRuntimeProfile, 世界书条目结构, 世界书作用域, 世界书结构, 小说拆分数据集结构, 题材模式类型 } from '../types';
import { 构建官方模式运行时配置, 规范化模式运行时配置, 渲染模式运行时配置世界书内容 } from '../utils/modeRuntimeProfile';
import { 构建小说拆分跨世界时间线规则, 小说拆分疑似无限流题材 } from './novelDecompositionTimelineConstraints';
import { generateNovelModePackCompletion, type NovelModePackCompletionResult } from './ai/storyTasks';
import type { 当前可用接口结构 } from '../utils/apiConfig';

const 全流程模式世界书作用域: 世界书作用域[] = ['main', 'opening', 'world_evolution', 'variable_calibration', 'story_plan', 'heroine_plan', 'tavern'];

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 生成安全ID片段 = (value: string): string => (
    (value || 'novel')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
        || 'novel'
);

const 去重文本列表 = (items: string[], maxCount = 40): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
        const normalized = 读取文本(raw).replace(/\s+/g, ' ');
        if (!normalized || normalized === '无') continue;
        const key = normalized.replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
        if (result.length >= maxCount) break;
    }
    return result;
};

const 格式化列表 = (title: string, items: string[], maxCount = 24): string => {
    const lines = 去重文本列表(items, maxCount);
    if (lines.length <= 0) return '';
    return [`【${title}】`, ...lines.map((line) => `- ${line}`)].join('\n');
};

const 格式化角色档案 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.角色档案) ? dataset.角色档案 : [])
        .map((item) => [
            item.名称,
            item.身份 ? `身份=${item.身份}` : '',
            item.所属势力 ? `势力=${item.所属势力}` : '',
            item.初始立场 ? `立场=${item.初始立场}` : '',
            item.状态摘要?.length ? `状态=${item.状态摘要.join('；')}` : '',
            item.首次出现 ? `首次出现=${item.首次出现}` : ''
        ].filter(Boolean).join('；'))
        .filter(Boolean)
);

const 格式化势力档案 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.势力档案) ? dataset.势力档案 : [])
        .map((item) => [
            item.名称,
            item.类型 ? `类型=${item.类型}` : '',
            item.地盘 ? `地盘=${item.地盘}` : '',
            item.当前状态 ? `状态=${item.当前状态}` : '',
            item.立场目标 ? `目标=${item.立场目标}` : '',
            item.首次出现 ? `首次出现=${item.首次出现}` : ''
        ].filter(Boolean).join('；'))
        .filter(Boolean)
);

const 格式化地点档案 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.地图地点档案) ? dataset.地图地点档案 : [])
        .map((item) => [
            item.名称,
            item.层级 ? `层级=${item.层级}` : '',
            item.上级地点 ? `上级=${item.上级地点}` : '',
            item.所属势力 ? `所属=${item.所属势力}` : '',
            item.地貌功能 ? `功能=${item.地貌功能}` : '',
            item.首次出现 ? `首次出现=${item.首次出现}` : ''
        ].filter(Boolean).join('；'))
        .filter(Boolean)
);

const 格式化物品档案 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.物品档案) ? dataset.物品档案 : [])
        .map((item) => [
            item.名称,
            item.类型 ? `类型=${item.类型}` : '',
            item.用途 ? `用途=${item.用途}` : '',
            item.所属人物 ? `人物=${item.所属人物}` : '',
            item.所属势力 ? `势力=${item.所属势力}` : '',
            item.首次出现 ? `首次出现=${item.首次出现}` : ''
        ].filter(Boolean).join('；'))
        .filter(Boolean)
);

const 格式化原著硬约束 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.分段列表) ? dataset.分段列表 : [])
        .flatMap((segment) => (Array.isArray(segment.原著硬约束) ? segment.原著硬约束 : [])
            .map((item) => item?.内容 || '')
        )
);

const 格式化分段时间线 = (dataset: 小说拆分数据集结构): string[] => (
    (Array.isArray(dataset.分段列表) ? dataset.分段列表 : [])
        .filter((segment) => segment.处理状态 === '已完成')
        .map((segment) => {
            const title = segment.章节范围 || segment.标题 || `第${segment.组号}组`;
            const range = `${segment.时间线起点 || '未知'} -> ${segment.时间线终点 || '未知'}`;
            const events = (segment.关键事件 || []).slice(0, 4).map((event) => `${event.事件名 || '事件'}@${event.开始时间 || segment.时间线起点 || '未知'}`).join('；');
            return `${title}：${range}${events ? `；关键事件=${events}` : ''}`;
        })
);

const 收集题材模式候选文本 = (dataset: 小说拆分数据集结构): string[] => (
    [
        dataset.标题,
        dataset.作品名,
        dataset.原始文本摘要,
        dataset.当前阶段概括,
        ...(dataset.世界观规则 || []),
        ...(dataset.世界边界规则 || []),
        ...(dataset.分段列表 || []).flatMap((segment) => [
            segment.标题,
            segment.本组概括,
            ...(segment.世界观规则 || []),
            ...(segment.世界边界规则 || []),
            ...(segment.关键事件 || []).flatMap((event) => [event.事件名, event.事件说明])
        ])
    ].map(读取文本).filter(Boolean)
);

const 末日丧尸正向证据正则 = /(末日丧尸|末世丧尸|丧尸|感染者|尸潮|生化感染|病毒感染|感染区|避难所|幸存者营地|幸存者小队|安全区|封锁线|灾变|物资券|瓶盖)/iu;
const 否定末日丧尸证据正则 = /(?:(?:没有|不存在|并非|不是|不属于|不含|未出现|不得|禁止|不要|避免)(?:[^。！？；;，,]{0,32})?(末日丧尸|末世丧尸|末世|丧尸|感染者|尸潮|生化感染|病毒感染|感染区|避难所|幸存者|安全区|封锁线|灾变|物资券|瓶盖)|非(?:末日|末世|丧尸|灾变))/iu;

const 是有效末日丧尸证据 = (line: string): boolean => (
    末日丧尸正向证据正则.test(line) && !否定末日丧尸证据正则.test(line)
);

const 推断题材模式 = (dataset: 小说拆分数据集结构): 题材模式类型 => {
    const lines = 收集题材模式候选文本(dataset);
    const text = lines.join('\n');

    if (小说拆分疑似无限流题材(dataset)) return '无限流';
    if (lines.some(是有效末日丧尸证据)) return '末日丧尸';
    if (/(修仙|仙门|灵气|金丹|筑基|元婴|宗门)/u.test(text)) return '仙侠';
    if (/(魔法|骑士|王国|教会|地下城|冒险者公会)/u.test(text)) return '西方奇幻';
    if (/(都市|现代|公司|学校|手机|网络|医院|写字楼|Z市)/iu.test(text)) return '现代都市';
    return '武侠';
};

export const 解析小说模式包题材 = (
    dataset: 小说拆分数据集结构,
    baseMode?: 题材模式类型
): 题材模式类型 => baseMode || 推断题材模式(dataset);

const 构建模式世界书条目 = (
    id: string,
    标题: string,
    内容: string,
    类型: 世界书条目结构['类型'],
    优先级: number
): 世界书条目结构 => ({
    id,
    标题,
    内容: 内容.trim(),
    条目形态: 'normal',
    类型,
    作用域: 全流程模式世界书作用域,
    注入模式: 'always',
    关键词: [],
    优先级,
    启用: true,
    创建时间: 0,
    更新时间: 0
});

const 构建模式元数据内容 = (dataset: 小说拆分数据集结构, profile: ModeRuntimeProfile): string => [
    `来源作品：${dataset.作品名 || dataset.标题 || '未命名作品'}`,
    `基础题材：${profile.identity.baseMode}`,
    `同人/IP模式：是`,
    `章节数：${dataset.总章节数 || dataset.章节列表?.length || 0}`,
    `分解组数：${dataset.分段列表?.length || 0}`,
    `默认时间线起点：${dataset.默认时间线起点 || '0001:01:01:00:00'}`,
    '用途：由小说分解工作台生成，可在新建同人存档时作为完整模式包套用。'
].join('\n');

export const 构建小说拆分模式包创意工坊模块 = (params: {
    dataset: 小说拆分数据集结构;
    contributor?: string;
    baseMode?: 题材模式类型;
    now?: number;
    aiCompletion?: Partial<ModeRuntimeProfile> | null;
}): 创意工坊模块条目 => {
    const dataset = params.dataset;
    const now = params.now || Date.now();
    const iso = new Date(now).toISOString();
    const workName = dataset.作品名 || dataset.标题 || '未命名小说';
    const baseMode = 解析小说模式包题材(dataset, params.baseMode);
    const suiteId = `novel-${生成安全ID片段(workName)}-${now}`;
    const suiteTitle = `${workName}同人模式包`;
    const crossWorldRules = 构建小说拆分跨世界时间线规则(dataset);
    const hasInfiniteEvidence = baseMode === '无限流' || 小说拆分疑似无限流题材(dataset);
    const officialProfile = 构建官方模式运行时配置(baseMode);

    // Merge AI completion fields over the official profile when available
    const mergedProfile = params.aiCompletion
        ? 合并AI补全到模式运行时配置(officialProfile, params.aiCompletion, baseMode, hasInfiniteEvidence)
        : officialProfile;
    const crossWorldNarrativeStyle = hasInfiniteEvidence
        ? '同人小说分解模式包已启用跨世界时间线硬约束：主世界/主神空间时间、任务世界本地时间、进入离开事件和世界流速必须分开判断。'
        : '同人小说分解模式包已启用跨世界时间线硬约束：主世界时间、外部世界本地时间、进入离开事件和世界流速必须分开判断。';
    const timelineConflictChecks = hasInfiniteEvidence
        ? ['同一任务世界两次进入间隔冲突', '不同世界时间流速冲突', '时代标签叠加冲突', '原著势力出场年代冲突']
        : ['同一外部世界两次进入间隔冲突', '不同世界时间流速冲突', '时代标签叠加冲突', '原著势力出场年代冲突'];

    const modeRuntimeProfile = 规范化模式运行时配置({
        ...mergedProfile,
        identity: {
            ...officialProfile.identity,
            modeId: suiteId,
            displayName: suiteTitle,
            baseMode,
            isFandomIp: true
        },
        time: {
            ...officialProfile.time,
            narrativeStyle: [
                officialProfile.time.narrativeStyle,
                crossWorldRules.length > 0 ? crossWorldNarrativeStyle : '同人小说分解模式包会优先遵守原著时间线锚点，不得按章节距离自行压缩时间。'
            ].join('\n'),
            progressionPrompt: [
                officialProfile.time.progressionPrompt,
                '若小说分解世界书给出原著时间线或时间流速证据，剧情推进必须先贴住该证据，再处理玩家偏转。'
            ].join('\n')
        },
        validation: {
            ...officialProfile.validation,
            conflictChecks: 去重文本列表([
                ...officialProfile.validation.conflictChecks,
                ...timelineConflictChecks
            ], 16)
        }
    }, baseMode);

    const topicBody = [
        `本模式包来自小说分解工作台，来源作品为《${workName}》。`,
        dataset.当前阶段概括 ? `当前阶段概括：${dataset.当前阶段概括}` : '',
        格式化列表('核心角色', dataset.核心角色?.length ? dataset.核心角色 : dataset.核心角色摘要 || [], 16),
        格式化列表('角色档案', 格式化角色档案(dataset), 32),
        格式化列表('地图地点档案', 格式化地点档案(dataset), 32),
        '使用口径：新建同人存档时，开局、规划、世界演变必须优先承接小说分解资产中已成立的原著事实；玩家偏转只能发生在不违背硬约束的空间内。'
    ].filter(Boolean).join('\n\n');

    const worldRulesBody = [
        格式化列表('世界观规则', dataset.世界观规则 || [], 32),
        格式化列表('世界边界规则', dataset.世界边界规则 || [], 32),
        格式化列表('原著硬约束', 格式化原著硬约束(dataset), 40),
        格式化列表('势力档案', 格式化势力档案(dataset), 32),
        格式化列表('人物关系', dataset.人物关系 || [], 24),
        格式化列表('势力关系', dataset.势力关系 || [], 24),
        格式化列表('伏笔线索', dataset.伏笔线索 || [], 24),
        格式化列表('回收点', dataset.回收点 || [], 24)
    ].filter(Boolean).join('\n\n') || '沿用原著已经分解出的世界观、势力、地点和硬约束；未在原文成立的内容不得擅自补完为事实。';

    const abilityBody = [
        `基础题材能力口径：${modeRuntimeProfile.ability.primaryAxis}`,
        `成长阶段：${modeRuntimeProfile.ability.progressionNames.join('、')}`,
        `结算规则：${modeRuntimeProfile.ability.combatResolution}`,
        格式化列表('物品档案', 格式化物品档案(dataset), 32),
        格式化列表('章节节奏', dataset.章节节奏 || [], 18)
    ].filter(Boolean).join('\n\n');

    const timelineBody = [
        格式化列表('跨世界时间线硬约束', crossWorldRules, 18),
        格式化列表('分解组时间线', 格式化分段时间线(dataset), 40)
    ].filter(Boolean).join('\n\n') || '原著时间线未给出跨世界证据时，仍需按分解组时间线保守推进，不得抢跑未来事件。';

    const modeWorldbooks: 世界书结构[] = [{
        id: `${suiteId}-worldbook`,
        标题: `${suiteTitle}世界书`,
        描述: '由小说分解工作台生成的同人模式世界书；用于统一注入原著口径、世界规则、能力体系和时间线硬约束。',
        常驻大纲: `来源《${workName}》；开局、规划、世界演变需遵守原著分解资产。`,
        启用: true,
        内置: false,
        创建时间: now,
        更新时间: now,
        条目: [
            构建模式世界书条目(`${suiteId}-metadata`, '模式元数据', 构建模式元数据内容(dataset, modeRuntimeProfile), 'system_rule', 106),
            构建模式世界书条目(`${suiteId}-runtime-profile`, '运行时模式配置', 渲染模式运行时配置世界书内容(modeRuntimeProfile), 'system_rule', 105),
            构建模式世界书条目(`${suiteId}-topic`, '小说题材口径', topicBody, 'world_lore', 100),
            构建模式世界书条目(`${suiteId}-world-rules`, '原著世界规则', worldRulesBody, 'system_rule', 96),
            构建模式世界书条目(`${suiteId}-timeline`, '跨世界时间线硬约束', timelineBody, 'system_rule', 98),
            构建模式世界书条目(`${suiteId}-ability`, '能力体系与物品口径', abilityBody, 'system_rule', 90)
        ].filter((entry) => entry.内容)
    }];

    const contentBlocks: NonNullable<创意工坊模块条目['contentBlocks']> = [
        {
            id: 'topic-main',
            title: '小说题材口径',
            purpose: '注入手动世界观提示词，定义来源作品、角色地点、开局承接和同人口径。',
            injectionTarget: 'manualWorldPrompt',
            content: topicBody
        },
        {
            id: 'world-rules-main',
            title: '原著世界规则',
            purpose: '追加到世界观细化要求，约束世界规则、势力状态、关系、伏笔和原著边界。',
            injectionTarget: 'worldExtraRequirement',
            content: worldRulesBody
        },
        {
            id: 'ability-main',
            title: '能力体系与物品口径',
            purpose: '注入手动能力/境界提示词，约束成长体系、战力边界、物品和章节节奏。',
            injectionTarget: 'manualRealmPrompt',
            content: abilityBody
        },
        {
            id: 'timeline-main',
            title: '跨世界时间线硬约束',
            purpose: '作为模式世界书强制注入，避免不同世界时间流速、时代标签和两次进入间隔被混淆。',
            injectionTarget: 'worldExtraRequirement',
            content: timelineBody
        }
    ];

    const content = contentBlocks.map((block) => [`【${block.title}】`, block.content].join('\n')).join('\n\n');
    const tags = 去重文本列表([baseMode, '小说分解', '同人模式包', '模式包', crossWorldRules.length > 0 ? '跨世界时间线' : '', dataset.来源类型], 12);
    const safetyNotes = [
        '该模式包由小说分解结果自动生成，发布前建议复核作品名、时间线、角色档案和势力档案。',
        hasInfiniteEvidence
            ? '无限流作品必须确认主世界时间、任务世界本地时间、进入离开事件和世界流速没有被混写。'
            : '跨世界作品必须确认主世界时间、外部世界本地时间、进入离开事件和世界流速没有被混写。'
    ];

    return {
        // 同一数据集重复「生成本地模式包」时应覆盖旧副本，而不是按时间戳堆积多条同名记录。
        id: `local-novel-${dataset.id || suiteId}-mode-package`,
        type: 'topic',
        formatVersion: 2,
        workshopKind: 'standard_module',
        title: suiteTitle,
        subtitle: `${baseMode} · 小说分解同人模式包`,
        description: `由《${workName}》小说分解数据集生成的同人模式包，包含模式世界书、原著规则、能力体系和时间线硬约束。`,
        tags,
        payload: {
            schema: 'moranjianghu-creative-workshop-mode-package',
            version: 3,
            suiteId,
            suiteTitle,
            packagePart: 'mode_package',
            mode: baseMode,
            sourceDatasetId: dataset.id,
            sourceWorkName: workName,
            modeMetadata: {
                value: baseMode,
                label: baseMode,
                shortLabel: baseMode,
                group: baseMode === '无限流' ? 'infinite' : undefined,
                source: 'novel_decomposition'
            },
            modeRuntimeProfile,
            modeWorldbooks,
            manualWorldPrompt: topicBody,
            worldExtraRequirement: [worldRulesBody, timelineBody].filter(Boolean).join('\n\n'),
            manualRealmPrompt: abilityBody,
            content,
            contentBlocks,
            usagePrompt: '作为完整模式包注入新建同人存档：模式专属世界书会统一接管来源作品口径、世界规则、能力体系和跨世界时间线硬约束。',
            safetyNotes
        },
        modeWorldbooks,
        modeRuntimeProfile,
        contentBlocks,
        usagePrompt: '作为完整模式包注入新建同人存档；建议先在创意工坊预览模式世界书，再用于新开局。',
        safetyNotes,
        injectionPreview: [
            `完整模式包：${suiteTitle}`,
            `适用题材：${baseMode}`,
            `模式世界书：${modeWorldbooks[0]?.条目.length || 0} 条`,
            `章节/分段：${dataset.总章节数 || dataset.章节列表?.length || 0} / ${dataset.分段列表?.length || 0}`,
            `跨世界时间线：${crossWorldRules.length > 0 ? '已生成硬约束' : '未识别到跨世界证据，按原著时间线保守推进'}`,
            `题材口径：${topicBody.slice(0, 140)}`,
            `世界规则：${worldRulesBody.slice(0, 140)}`,
            `时间线：${timelineBody.slice(0, 140)}`
        ],
        source: 'local',
        contributor: params.contributor || '',
        createdAt: iso,
        updatedAt: iso
    };
};

const 无限流模板污染正则 = /(主神|无限流|轮回者|轮回小队|轮回空间|轮回任务|任务世界|剧情世界|奖励点|支线剧情|基因锁|兑换强化|回归倒计时|主神商城|队伍房间|主神光球|隐藏支线|回归通道|infinite)/iu;
const 末日丧尸模板污染正则 = /(末日丧尸|末世丧尸|末日风|末日生存|末日废土|末日物资|现代末日|丧尸|感染者|尸潮|生化感染|病毒感染|感染区|避难所|幸存者|安全区|封锁线|灾变|物资券|瓶盖|罐头|防护服|防毒面具|血污|废墟|apocalypse|survival)/iu;

const 文本含无限流模板污染 = (value: unknown): boolean => {
    if (typeof value === 'string') return 无限流模板污染正则.test(value);
    if (Array.isArray(value)) return value.some(文本含无限流模板污染);
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some(文本含无限流模板污染);
    }
    return false;
};

const 文本含末日丧尸模板污染 = (value: unknown): boolean => {
    if (typeof value === 'string') return 末日丧尸模板污染正则.test(value);
    if (Array.isArray(value)) return value.some(文本含末日丧尸模板污染);
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some(文本含末日丧尸模板污染);
    }
    return false;
};

const 可合并AI补全值 = (
    value: unknown,
    options: { 允许无限流模板补全: boolean; 允许末日丧尸模板补全: boolean }
): boolean => (
    (options.允许无限流模板补全 || !文本含无限流模板污染(value))
    && (options.允许末日丧尸模板补全 || !文本含末日丧尸模板污染(value))
);

const 设置可用补全字段 = (
    target: Record<string, any>,
    source: Record<string, any>,
    key: string,
    options: { 允许无限流模板补全: boolean; 允许末日丧尸模板补全: boolean },
    isValid: (value: unknown) => boolean = (value) => value !== undefined && value !== null && value !== ''
): void => {
    const value = source[key];
    if (isValid(value) && 可合并AI补全值(value, options)) {
        target[key] = value;
    }
};

const 设置可用补全分区 = (
    result: Record<string, any>,
    section: string,
    patch: Partial<ModeRuntimeProfile>,
    options: { 允许无限流模板补全: boolean; 允许末日丧尸模板补全: boolean },
    fill: (target: Record<string, any>, source: Record<string, any>) => void
): void => {
    const source = (patch as any)[section];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    const target: Record<string, any> = {};
    fill(target, source as Record<string, any>);
    if (Object.keys(target).length > 0) {
        result[section] = target;
    }
};

const 清理AI补全草稿配置 = (
    patch: Partial<ModeRuntimeProfile>,
    baseMode: 题材模式类型,
    允许无限流模板补全: boolean
): Record<string, any> => {
    const result: Record<string, any> = {};
    const options = {
        允许无限流模板补全,
        允许末日丧尸模板补全: baseMode === '末日丧尸'
    };
    const 非空数组 = (value: unknown) => Array.isArray(value) && value.length > 0;
    const 至少三项数组 = (value: unknown) => Array.isArray(value) && value.length >= 3;

    设置可用补全分区(result, 'economy', patch, options, (target, source) => {
        ['primaryCurrency', 'accountingUnit', 'exchangeRules', 'marketName', 'marketVerb', 'currencyTiers'].forEach((key) => {
            设置可用补全字段(target, source, key, options);
        });
    });
    设置可用补全分区(result, 'ability', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'primaryAxis', options);
        设置可用补全字段(target, source, 'progressionNames', options, 至少三项数组);
        设置可用补全字段(target, source, 'combatResolution', options);
        设置可用补全字段(target, source, 'skillPool', options, 非空数组);
        设置可用补全字段(target, source, 'kungfuTypes', options, 非空数组);
    });
    设置可用补全分区(result, 'opening', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'defaultBackgrounds', options, 非空数组);
        设置可用补全字段(target, source, 'defaultTalents', options, 非空数组);
    });
    设置可用补全分区(result, 'organization', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'organizationName', options);
        设置可用补全字段(target, source, 'memberName', options);
        设置可用补全字段(target, source, 'contributionName', options);
        设置可用补全字段(target, source, 'rankNames', options, 非空数组);
    });
    设置可用补全分区(result, 'map', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'locationTypes', options, 非空数组);
        设置可用补全字段(target, source, 'poiTypes', options, 非空数组);
        设置可用补全字段(target, source, 'mapPrompt', options);
    });
    设置可用补全分区(result, 'npc', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'defaultIdentityPool', options, 非空数组);
        设置可用补全字段(target, source, 'relationTemplates', options, 非空数组);
    });
    设置可用补全分区(result, 'image', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'characterClothingEra', options);
        设置可用补全字段(target, source, 'sceneMaterials', options);
        设置可用补全字段(target, source, 'visualStyle', options);
    });
    设置可用补全分区(result, 'time', patch, options, (target, source) => {
        设置可用补全字段(target, source, 'calendarName', options);
        设置可用补全字段(target, source, 'narrativeStyle', options);
    });

    return result;
};

export const 清洗小说模式包累积草稿 = (
    dataset: 小说拆分数据集结构,
    baseMode: 题材模式类型,
    draft: Partial<ModeRuntimeProfile>
): Partial<ModeRuntimeProfile> => {
    const resolvedMode = 解析小说模式包题材(dataset, baseMode);
    const hasInfiniteEvidence = resolvedMode === '无限流' || 小说拆分疑似无限流题材(dataset);
    return 清理AI补全草稿配置(draft, resolvedMode, hasInfiniteEvidence);
};

/** Deep-merge AI completion fields over the official profile. */
const 合并AI补全到模式运行时配置 = (
    base: ModeRuntimeProfile,
    patch: Partial<ModeRuntimeProfile>,
    baseMode: 题材模式类型,
    允许无限流模板补全: boolean
): ModeRuntimeProfile => {
    const result = { ...base };
    const mergeOptions = {
        允许无限流模板补全,
        允许末日丧尸模板补全: baseMode === '末日丧尸'
    };

    if (patch.economy && typeof patch.economy === 'object') {
        result.economy = { ...result.economy };
        const eco = patch.economy as any;
        if (eco.primaryCurrency && 可合并AI补全值(eco.primaryCurrency, mergeOptions)) result.economy.primaryCurrency = eco.primaryCurrency;
        if (eco.accountingUnit && 可合并AI补全值(eco.accountingUnit, mergeOptions)) result.economy.accountingUnit = eco.accountingUnit;
        if (eco.exchangeRules && 可合并AI补全值(eco.exchangeRules, mergeOptions)) result.economy.exchangeRules = eco.exchangeRules;
        if (eco.marketName && 可合并AI补全值(eco.marketName, mergeOptions)) result.economy.marketName = eco.marketName;
        if (eco.marketVerb && 可合并AI补全值(eco.marketVerb, mergeOptions)) result.economy.marketVerb = eco.marketVerb;
        if (eco.currencyTiers && typeof eco.currencyTiers === 'object' && !Array.isArray(eco.currencyTiers) && 可合并AI补全值(eco.currencyTiers, mergeOptions)) {
            result.economy.currencyTiers = { ...result.economy.currencyTiers };
            if (eco.currencyTiers.upperName) result.economy.currencyTiers.upperName = eco.currencyTiers.upperName;
            if (eco.currencyTiers.middleName) result.economy.currencyTiers.middleName = eco.currencyTiers.middleName;
            if (eco.currencyTiers.lowerName) result.economy.currencyTiers.lowerName = eco.currencyTiers.lowerName;
        } else if (eco.currencyTiers && typeof eco.currencyTiers === 'string' && 可合并AI补全值(eco.currencyTiers, mergeOptions)) {
            // AI sometimes returns currencyTiers as a string like "金元宝/银子/铜钱"
            const parts = (eco.currencyTiers as string).split(/[\/、,，]/).map((s: string) => s.trim()).filter(Boolean);
            if (parts.length >= 3) {
                result.economy.currencyTiers = { ...result.economy.currencyTiers };
                result.economy.currencyTiers.upperName = parts[0];
                result.economy.currencyTiers.middleName = parts[1];
                result.economy.currencyTiers.lowerName = parts[2];
                console.log('[AI补全] currencyTiers 从字符串解析:', eco.currencyTiers, '→', parts.slice(0, 3));
            } else {
                console.warn('[AI补全] currencyTiers 字符串分割不足3段，已跳过:', eco.currencyTiers);
            }
        } else if (Array.isArray(eco.currencyTiers) && eco.currencyTiers.length >= 3 && 可合并AI补全值(eco.currencyTiers, mergeOptions)) {
            // AI sometimes returns currencyTiers as an array like ["金元宝","银子","铜钱"]
            result.economy.currencyTiers = { ...result.economy.currencyTiers };
            result.economy.currencyTiers.upperName = String(eco.currencyTiers[0] || '');
            result.economy.currencyTiers.middleName = String(eco.currencyTiers[1] || '');
            result.economy.currencyTiers.lowerName = String(eco.currencyTiers[2] || '');
            console.log('[AI补全] currencyTiers 从数组解析:', eco.currencyTiers);
        } else if (eco.currencyTiers && 可合并AI补全值(eco.currencyTiers, mergeOptions)) {
            console.warn('[AI补全] currencyTiers 类型无法识别，已跳过:', typeof eco.currencyTiers, eco.currencyTiers);
        }
        // Log other skipped economy fields for diagnostic
        const knownEcoKeys = ['primaryCurrency', 'accountingUnit', 'exchangeRules', 'marketName', 'marketVerb', 'currencyTiers'];
        const unknownEcoKeys = Object.keys(eco).filter(k => !knownEcoKeys.includes(k));
        if (unknownEcoKeys.length > 0) {
            console.warn('[AI补全] economy 中存在未合并的字段:', unknownEcoKeys);
        }
    }

    if (patch.ability && typeof patch.ability === 'object') {
        result.ability = { ...result.ability };
        const abil = patch.ability as any;
        if (abil.primaryAxis && 可合并AI补全值(abil.primaryAxis, mergeOptions)) result.ability.primaryAxis = abil.primaryAxis;
        if (Array.isArray(abil.progressionNames) && abil.progressionNames.length >= 3 && 可合并AI补全值(abil.progressionNames, mergeOptions)) {
            result.ability.progressionNames = abil.progressionNames;
        }
        if (abil.combatResolution && 可合并AI补全值(abil.combatResolution, mergeOptions)) result.ability.combatResolution = abil.combatResolution;
        if (Array.isArray(abil.skillPool) && abil.skillPool.length > 0 && 可合并AI补全值(abil.skillPool, mergeOptions)) {
            result.ability.skillPool = abil.skillPool;
        }
        if (Array.isArray(abil.kungfuTypes) && abil.kungfuTypes.length > 0 && 可合并AI补全值(abil.kungfuTypes, mergeOptions)) {
            result.ability.kungfuTypes = abil.kungfuTypes;
        }
    }

    if (patch.opening && typeof patch.opening === 'object') {
        result.opening = { ...result.opening };
        const opening = patch.opening as any;
        if (Array.isArray(opening.defaultBackgrounds) && opening.defaultBackgrounds.length > 0 && 可合并AI补全值(opening.defaultBackgrounds, mergeOptions)) {
            result.opening.defaultBackgrounds = opening.defaultBackgrounds;
        }
        if (Array.isArray(opening.defaultTalents) && opening.defaultTalents.length > 0 && 可合并AI补全值(opening.defaultTalents, mergeOptions)) {
            result.opening.defaultTalents = opening.defaultTalents;
        }
    }

    if (patch.organization && typeof patch.organization === 'object') {
        result.organization = { ...result.organization };
        const org = patch.organization as any;
        if (org.organizationName && 可合并AI补全值(org.organizationName, mergeOptions)) result.organization.organizationName = org.organizationName;
        if (org.memberName && 可合并AI补全值(org.memberName, mergeOptions)) result.organization.memberName = org.memberName;
        if (org.contributionName && 可合并AI补全值(org.contributionName, mergeOptions)) result.organization.contributionName = org.contributionName;
        if (Array.isArray(org.rankNames) && org.rankNames.length > 0 && 可合并AI补全值(org.rankNames, mergeOptions)) {
            result.organization.rankNames = org.rankNames;
        }
    }

    if (patch.map && typeof patch.map === 'object') {
        result.map = { ...result.map };
        const map = patch.map as any;
        if (Array.isArray(map.locationTypes) && map.locationTypes.length > 0 && 可合并AI补全值(map.locationTypes, mergeOptions)) {
            result.map.locationTypes = map.locationTypes;
        }
        if (Array.isArray(map.poiTypes) && map.poiTypes.length > 0 && 可合并AI补全值(map.poiTypes, mergeOptions)) {
            result.map.poiTypes = map.poiTypes;
        }
        if (map.mapPrompt && 可合并AI补全值(map.mapPrompt, mergeOptions)) result.map.mapPrompt = map.mapPrompt;
    }

    if (patch.npc && typeof patch.npc === 'object') {
        result.npc = { ...result.npc };
        const npc = patch.npc as any;
        if (Array.isArray(npc.defaultIdentityPool) && npc.defaultIdentityPool.length > 0 && 可合并AI补全值(npc.defaultIdentityPool, mergeOptions)) {
            result.npc.defaultIdentityPool = npc.defaultIdentityPool;
        }
        if (Array.isArray(npc.relationTemplates) && npc.relationTemplates.length > 0 && 可合并AI补全值(npc.relationTemplates, mergeOptions)) {
            result.npc.relationTemplates = npc.relationTemplates;
        }
    }

    if (patch.image && typeof patch.image === 'object') {
        result.image = { ...result.image };
        const image = patch.image as any;
        if (image.characterClothingEra && 可合并AI补全值(image.characterClothingEra, mergeOptions)) result.image.characterClothingEra = image.characterClothingEra;
        if (image.sceneMaterials && 可合并AI补全值(image.sceneMaterials, mergeOptions)) result.image.sceneMaterials = image.sceneMaterials;
        if (image.visualStyle && 可合并AI补全值(image.visualStyle, mergeOptions)) result.image.visualStyle = image.visualStyle;
    }

    if (patch.time && typeof patch.time === 'object') {
        const time = patch.time as any;
        if (time.calendarName && 可合并AI补全值(time.calendarName, mergeOptions)) {
            result.time = { ...result.time, calendarName: time.calendarName };
        }
        if (time.narrativeStyle && 可合并AI补全值(time.narrativeStyle, mergeOptions)) {
            result.time = { ...result.time, narrativeStyle: [result.time.narrativeStyle, time.narrativeStyle].filter(Boolean).join('\n') };
        }
    }

    return result;
};

export type { NovelModePackCompletionResult };

/**
 * Front-end function: calls AI to generate a runtime-profile completion
 * for a novel-decomposition mode pack, returning the patch object.
 */
export const AI补全小说模式包配置 = async (
    params: {
        dataset: 小说拆分数据集结构;
        apiConfig: 当前可用接口结构;
        baseMode?: 题材模式类型;
        signal?: AbortSignal;
        onDelta?: (delta: string, accumulated: string) => void;
    }
): Promise<NovelModePackCompletionResult> => {
    const { dataset, apiConfig, signal, onDelta } = params;
    const streamOptions = onDelta ? { stream: true, onDelta } : undefined;
    const result = await generateNovelModePackCompletion(dataset, apiConfig, streamOptions, signal);
    return {
        ...result,
        completion: 清洗小说模式包累积草稿(
            dataset,
            解析小说模式包题材(dataset, params.baseMode),
            result.completion as Partial<ModeRuntimeProfile>
        ) as Record<string, any>
    };
};
