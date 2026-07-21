import * as textAIService from '../../services/ai/text';
import * as dbService from '../../services/dbService';
import { recordAiParseFailureDiagnostic } from '../../services/diagnosticContext';
import { recordDiagnosticLog } from '../../services/diagnosticLog';
import type {
    GameResponse,
    OpeningConfig,
    TavernCommand,
    提示词结构,
    记忆系统结构,
    聊天记录结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    环境信息结构,
    角色数据结构,
    世界数据结构,
    战斗状态结构,
    详细门派结构,
    内置提示词条目结构,
    世界书结构
} from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取世界演变接口配置, 获取规划分析接口配置, 获取变量计算接口配置, 获取文章优化接口配置, 获取地图自动更新接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 核心_开局思维链, 获取开局思维链提示词 } from '../../prompts/core/cotOpening';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 获取开场初始化任务提示词 } from '../../prompts/runtime/opening';
import { 构建开局配置提示词 } from '../../prompts/runtime/openingConfig';
import { 构建同人运行时提示词包, 校验境界体系提示词完整性 } from '../../prompts/runtime/fandom';
import { 数值_世界演化 } from '../../prompts/stats/world';
import { 构建字数要求提示词 } from '../../prompts/runtime/protocolDirectives';
import { 构建剧情风格助手提示词 } from '../../prompts/runtime/storyStyles';
import { 构建真实世界模式提示词 } from '../../prompts/runtime/realWorldMode';
import { 构建运行时额外提示词 } from '../../prompts/runtime/nsfw';
import { 获取DeepSeek主剧情兼容提示词 } from '../../prompts/runtime/deepseekMode';
import { 获取GLM主剧情兼容提示词 } from '../../prompts/runtime/glmMode';
import { 包装繁体任务提示, 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { 提取叙事约束块, 是否有叙事约束 } from '../../utils/narrativeConstraint';
import { 构建标签缺失补充提示 } from '../../utils/parseErrorHints';
import { 构建世界演变COT提示词, 世界演变COT伪装历史消息提示词 } from '../../prompts/runtime/worldEvolutionCot';
import { 构建开局世界演变初始化上下文, 开局世界演变初始化附加提示词 } from '../../prompts/runtime/openingWorldEvolutionInit';
import {
    构建开局规划初始化审计重点,
    构建开局规划初始化正文上下文,
    开局规划初始化附加提示词
} from '../../prompts/runtime/openingPlanningInit';
import { 构建规划性别比例约束摘要 } from '../../prompts/runtime/planningAnalysis';
import { 解析当前有效性别比例 } from '../../utils/genderRatioUtils';
import {
    开局变量生成附加提示词,
    构建开局变量生成审计重点
} from '../../prompts/runtime/openingVariableGenerationInit';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 获取游玩请求超时毫秒 } from '../../utils/gameRequestTimeouts';
import { 设置键 } from '../../utils/settingsSchema';
import {
    世界书本体槽位,
    构建世界书注入文本
} from '../../utils/worldbook';
import { 获取内置提示词槽位内容, 获取剧情风格内置槽位 } from '../../utils/builtinPrompts';
import {
    构建COT伪装提示词,
    构建酒馆预设消息链,
    酒馆预设模式可用,
    type 酒馆上下文结构
} from './promptRuntime';
import { 提取响应规划文本 } from './thinkingContext';
import { 环境时间转标准串 } from './timeUtils';
import { 规范化记忆系统, 规范化记忆配置, 构建即时记忆条目, 构建短期记忆条目, 写入四段记忆 } from './memoryUtils';
import { 构建世界演变上下文文本, 规范化世界演变命令列表, 整理客户可见世界大事 } from './worldEvolutionUtils';
import { 获取开局小说拆分注入文本, 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 同步剧情小说分解时间校准 } from '../../services/novelDecompositionCalibration';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import { 执行变量模型校准工作流 } from './variableModelWorkflow';
import { 合并变量校准结果到响应 as 合并变量生成结果到响应 } from './variableCalibrationMerge';
import { 保护开局生成门派状态 } from './storyState';
import { 修复开局伙伴社交列表 } from '../../utils/openingCompanion';
import { 同步在场NPC当前位置 } from './responseCommandProcessor';
import { 生成地图更新 } from './mapUpdateWorkflow';

const 开局规划分析请求超时毫秒 = 90000;
const 开场剧情慢首包提示毫秒 = 30000;
const 开场剧情首次流式响应超时毫秒 = 240000;

export const 安全触发开局主角自动生图 = async (
    trigger: ((player: 角色数据结构) => void | Promise<unknown>) | undefined,
    player: 角色数据结构,
    label: string = '主角开局生图触发'
): Promise<boolean> => {
    if (typeof trigger !== 'function') return false;
    try {
        await trigger(player);
        return true;
    } catch (error: any) {
        recordDiagnosticLog('warn', [`${label}失败`, {
            stage: 'opening_player_auto_image',
            message: error?.message || '',
            stack: typeof error?.stack === 'string' ? error.stack : undefined
        }]);
        console.warn(`${label}失败，已保持开局流程继续`, error);
        return false;
    }
};
const 开场剧情流式空闲超时毫秒 = 90000;
const 开场剧情默认最大输出Token = 32768;

type 开场命令基态 = {
    角色: 角色数据结构;
    环境: 环境信息结构;
    社交: any[];
    世界: 世界数据结构;
    战斗: 战斗状态结构;
    玩家门派: 详细门派结构;
    任务列表: any[];
    约定列表: any[];
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
};

const 补全开场剧情默认输出预算 = (apiConfig: 当前可用接口结构): 当前可用接口结构 => {
    const configured = Number(apiConfig?.maxTokens);
    if (Number.isFinite(configured) && configured > 0) return apiConfig;
    return {
        ...apiConfig,
        maxTokens: 开场剧情默认最大输出Token
    };
};

const 读取接口主机 = (baseUrl?: string): string => {
    const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!raw) return '';
    try {
        return new URL(raw).host;
    } catch {
        return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw.slice(0, 120);
    }
};

const 构建开局自动重试格式提示 = (attempt: number, lastError?: any): string => {
    if (attempt <= 1) return '';
    const reason = String(lastError?.parseDetail || lastError?.message || '上一版开局响应标签不完整').trim();
    return [
        '【开局自动重试格式修正】',
        `上一版被拒绝原因：${reason}`,
        '请完整重新生成第0回合，不要只输出补丁。',
        '硬性要求：顶层标签必须按顺序完整闭合：<thinking>...</thinking>、<正文>...</正文>、<短期记忆>...</短期记忆>、<变量规划>...</变量规划>；如启用行动选项，再输出完整 <行动选项>...</行动选项>。',
        '如果接近输出预算，优先结束当前段落并闭合所有已打开标签；不要继续扩写 Step、变量规划或说明导致尾部截断。',
        '正文仍必须遵守：每行只能是【旁白】、【角色名】或【判定】正文单位，角色台词必须用【角色名】。',
        '【角色名】只能是真实人物/NPC/临时龙套名；双手、指尖、眼睛、嘴唇、长剑、茶盏、衣袖、声音、气息、灵气、剑光等身体部位、物件或抽象对象必须写入【旁白】。'
    ].join('\n');
};

const 追加开局自动重试消息 = (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; prefix?: boolean }>,
    retryPrompt: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string; prefix?: boolean }> => {
    const prompt = retryPrompt.trim();
    if (!prompt) return messages;
    const retryMessage = { role: 'user' as const, content: prompt };
    const tail = messages[messages.length - 1];
    if (tail?.prefix === true) {
        return [...messages.slice(0, -1), retryMessage, tail];
    }
    return [...messages, retryMessage];
};

type 自动存档快照结构 = {
    history?: 聊天记录结构[];
    role?: 角色数据结构;
    env?: 环境信息结构;
    social?: any[];
    world?: 世界数据结构;
    battle?: 战斗状态结构;
    sect?: 详细门派结构;
    tasks?: any[];
    agreements?: any[];
    story?: 剧情系统结构;
    storyPlan?: 剧情规划结构;
    heroinePlan?: 女主剧情规划结构;
    fandomStoryPlan?: 同人剧情规划结构;
    fandomHeroinePlan?: 同人女主剧情规划结构;
    memory?: 记忆系统结构;
    openingConfig?: OpeningConfig;
    force?: boolean;
};

type 开场剧情生成依赖 = {
    apiConfig: any;
    环境: 环境信息结构;
    角色: 角色数据结构;
    世界: 世界数据结构;
    战斗: 战斗状态结构;
    玩家门派: 详细门派结构;
    任务列表: any[];
    约定列表: any[];
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
    gameConfig: any;
    memoryConfig: any;
    builtinPromptEntries: 内置提示词条目结构[];
    worldbooks: 世界书结构[];
    abortControllerRef: { current: AbortController | null };
    setPrompts: (value: 提示词结构[]) => void;
    设置历史记录: (value: 聊天记录结构[] | ((prev: 聊天记录结构[]) => 聊天记录结构[])) => void;
    设置角色: (value: 角色数据结构) => void;
    设置环境: (value: 环境信息结构) => void;
    设置社交: (value: any[]) => void;
    设置世界: (value: 世界数据结构) => void;
    设置战斗: (value: 战斗状态结构) => void;
    设置剧情: (value: 剧情系统结构) => void;
    设置剧情规划: (value: 剧情规划结构) => void;
    设置女主剧情规划: (value: 女主剧情规划结构) => void;
    设置同人剧情规划: (value: 同人剧情规划结构 | undefined) => void;
    设置同人女主剧情规划: (value: 同人女主剧情规划结构 | undefined) => void;
    设置玩家门派: (value: 详细门派结构) => void;
    设置任务列表: (value: any[]) => void;
    设置约定列表: (value: any[]) => void;
    设置开局文章优化进度: (value: any) => void;
    设置开局主剧情进度: (value: any) => void;
    设置开局变量生成进度: (value: any) => void;
    设置开局世界演变进度: (value: any) => void;
    设置开局规划进度: (value: any) => void;
    设置开局地图更新进度: (value: any) => void;
    设置游戏初始时间: (value: string) => void;
    记录变量生成上下文: (params: {
        playerInput: string;
        response: GameResponse;
    }) => void;
    setWorldEvents: (value: string[]) => void;
    应用并同步记忆系统: (memory: 记忆系统结构) => void;
    performAutoSave: (snapshot?: 自动存档快照结构) => Promise<void>;
    构建系统提示词: (promptPool: 提示词结构[], memoryData: 记忆系统结构, socialData: any[], statePayload: any, options?: any) => Promise<酒馆上下文结构 & {
        contextPieces: 酒馆上下文结构['contextPieces'] & {
            AI角色声明?: string;
            输出协议提示词?: string;
            字数要求提示词?: string;
            免责声明输出提示词?: string;
        };
    }> | (酒馆上下文结构 & {
        contextPieces: 酒馆上下文结构['contextPieces'] & {
            AI角色声明?: string;
            输出协议提示词?: string;
            字数要求提示词?: string;
            免责声明输出提示词?: string;
        };
    });
    processResponseCommands: (response: GameResponse, baseState?: 开场命令基态, options?: { applyState?: boolean }) => 开场命令基态;
    规范化环境信息: (envLike?: any) => 环境信息结构;
    规范化剧情状态: (raw?: any, envLike?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    规范化角色物品容器映射: (raw?: any, options?: { 启用饱腹口渴系统?: boolean; 题材模式?: unknown }) => 角色数据结构;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    规范化世界状态: (raw?: any) => 世界数据结构;
    规范化战斗状态: (raw?: any) => 战斗状态结构;
    规范化门派状态: (raw?: any) => 详细门派结构;
    游戏设置启用自动重试: (config: any) => boolean;
    执行带自动重试的生成请求: <T>(params: {
        enabled: boolean;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
        action: (attempt: number, lastError?: any) => Promise<T>;
    }) => Promise<T>;
    更新流式草稿为自动重试提示: (history: 聊天记录结构[], attempt: number, maxAttempts: number, reason: string) => 聊天记录结构[];
    替换流式草稿为失败提示: (history: 聊天记录结构[], errorMessage: string) => 聊天记录结构[];
    提取解析失败原始信息: (error: any) => string;
    获取原始AI消息: (raw: string) => string;
    估算消息Token: (messages: Array<{ role?: string; content?: string; name?: string }>, model?: string) => number;
    估算AI输出Token: (text: string, model?: string) => number;
    计算回复耗时秒: (startedAt: number, finishedAt?: number) => number;
    文章优化功能已开启: () => boolean;
    执行正文润色: (
        response: GameResponse,
        rawSource: string,
        options?: { manual?: boolean; playerInput?: string; signal?: AbortSignal; allowExpansionForLength?: boolean; minLength?: number; onDelta?: (delta: string, accumulated: string) => void }
    ) => Promise<{ applied: boolean; response: GameResponse; error?: string; rawText?: string }>;
    触发新增NPC自动生图: (npcs: any[]) => void;
    触发主角自动生图?: (player: 角色数据结构) => void | Promise<unknown>;
    触发场景自动生图: (params: {
        response: GameResponse;
        bodyText?: string;
        env?: any;
        turnNumber?: number;
        playerInput?: string;
        source?: 'auto' | 'manual';
        autoApply?: boolean;
    }) => void;
    提取新增NPC列表: (beforeList: any[], afterList: any[]) => any[];
};

const 构建开局角色建档摘要 = (
    roleData: any,
    options?: { cultivationSystemEnabled?: boolean }
): string => {
    const 启用修炼体系 = options?.cultivationSystemEnabled !== false;
    const 纯文本 = (value: unknown, fallback = '未提供'): string => {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed || fallback;
    };
    const 数值文本 = (value: unknown, fallback = '未提供'): string => (
        typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback
    );
    const 天赋列表 = Array.isArray(roleData?.天赋列表)
        ? roleData.天赋列表
            .map((item: any, index: number) => {
                const 名称 = 纯文本(item?.名称, '未提供');
                const 描述 = 纯文本(item?.描述, '未提供');
                const 效果 = 纯文本(item?.效果, '未提供');
                return `[${index}] 名称：${名称}｜描述：${描述}｜效果：${效果}`;
            })
            .filter(Boolean)
            .join('\n')
        : '';
    const 背景名称 = 纯文本(roleData?.出身背景?.名称);
    const 背景描述 = 纯文本(roleData?.出身背景?.描述);
    const 背景效果 = 纯文本(roleData?.出身背景?.效果);
    return [
        '【主角建档信息】',
        `- 主角姓名：${纯文本(roleData?.姓名)}`,
        `- 性别：${纯文本(roleData?.性别)}`,
        `- 年龄：${数值文本(roleData?.年龄)}`,
        `- 出生日期：${纯文本(roleData?.出生日期)}`,
        `- 外貌：${纯文本(roleData?.外貌)}`,
        `- 性格：${纯文本(roleData?.性格)}`,
        `- 称号：${纯文本(roleData?.称号)}`,
        ...(启用修炼体系 ? [`- 初始境界：${纯文本(roleData?.境界)}`] : []),
        `- 六维：力量 ${数值文本(roleData?.力量)} / 敏捷 ${数值文本(roleData?.敏捷)} / 体质 ${数值文本(roleData?.体质)} / 根骨 ${数值文本(roleData?.根骨)} / 悟性 ${数值文本(roleData?.悟性)} / 福源 ${数值文本(roleData?.福源)}`,
        `- 天赋数量：${Array.isArray(roleData?.天赋列表) ? roleData.天赋列表.length : 0}`,
        天赋列表 ? `- 天赋详情：\n${天赋列表}` : '- 天赋详情：无',
        `- 出身背景名称：${背景名称}`,
        `- 出身背景描述：${背景描述}`,
        `- 出身背景效果：${背景效果}`,
        `- 当前所属门派ID：${纯文本(roleData?.所属门派ID)}`,
        '- 穿着指导：主角的服装必须与性别、外貌、性格一致。扶她角色不得穿完全遮蔽下体的裤子，应选择裙装或能体现其性别特征的服饰；男娘角色同样应穿符合其性别表达的服装。AI 不得默认给所有角色套男装。',
        '以上建档信息仅作为本回合初始化依据，不代表这些字段已经自动写入前端变量；除非你在 `<变量规划>` 中明确列出需要初始化的内容，否则它们不算已进入本回合初始化结果。',
        '若建档已给出天赋或出身背景的 名称/描述/效果，生成开局时必须按原文完整承接，不得省略、压缩成只剩名称，或擅自改写其语义。'
    ].join('\n');
};

const 构建开局伙伴建档摘要 = (
    openingConfig?: OpeningConfig,
    options?: { cultivationSystemEnabled?: boolean }
): string => {
    const partners = (Array.isArray(openingConfig?.初始伙伴列表) && openingConfig.初始伙伴列表.length > 0
        ? openingConfig.初始伙伴列表
        : (openingConfig?.初始伙伴 ? [openingConfig.初始伙伴] : [])
    ).filter((partner) => partner && partner.enabled !== false && typeof partner.姓名 === 'string' && partner.姓名.trim());
    if (partners.length <= 0) return '';
    const 启用修炼体系 = options?.cultivationSystemEnabled !== false;
    const 纯文本 = (value: unknown, fallback = '未提供'): string => {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed || fallback;
    };
    const 数值文本 = (value: unknown, fallback = '未提供'): string => (
        typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback
    );
    const blocks = partners.map((partner, partnerIndex) => {
        const 天赋列表 = Array.isArray(partner.天赋列表)
            ? partner.天赋列表
                .map((item: any, index: number) => {
                    const 名称 = 纯文本(item?.名称, '未提供');
                    const 描述 = 纯文本(item?.描述, '未提供');
                    const 效果 = 纯文本(item?.效果, '未提供');
                    return `[${index}] 名称：${名称}｜描述：${描述}｜效果：${效果}`;
                })
                .filter(Boolean)
                .join('\n')
            : '';
        return [
            `【开局同伴 ${partnerIndex + 1}】`,
            `- 同伴姓名：${纯文本(partner.姓名)}`,
            `- 【姓名硬约束】该同伴的正式姓名只能是「${纯文本(partner.姓名)}」；不得改名、另起名、用近义名、用默认女主名替代，也不得把同一同伴拆成另一个姓名的 NPC。`,
            `- 性别：${纯文本(partner.性别)}`,
            `- 年龄：${数值文本(partner.年龄)}`,
            `- 出生日期：${数值文本(partner.出生月)}月${数值文本(partner.出生日)}日`,
            `- 与主角关系：${纯文本(partner.关系)}`,
            `- 外貌：${纯文本(partner.外貌)}`,
            `- 性格：${纯文本(partner.性格)}`,
            ...(启用修炼体系 ? ['- 初始境界：按同一难度和世界观合理推导，不得强行高于主角一个大阶。'] : []),
            `- 六维：力量 ${数值文本(partner.属性?.力量)} / 敏捷 ${数值文本(partner.属性?.敏捷)} / 体质 ${数值文本(partner.属性?.体质)} / 根骨 ${数值文本(partner.属性?.根骨)} / 悟性 ${数值文本(partner.属性?.悟性)} / 福源 ${数值文本(partner.属性?.福源)}`,
            `- 出身背景名称：${纯文本(partner.背景名称)}`,
            `- 出身背景描述：${纯文本(partner.背景描述)}`,
            `- 出身背景效果：${纯文本(partner.背景效果)}`,
            `- 天赋数量：${Array.isArray(partner.天赋列表) ? partner.天赋列表.length : 0}`,
            天赋列表 ? `- 天赋详情：\n${天赋列表}` : '- 天赋详情：无',
            `- 备注：${纯文本(partner.备注, '无')}`,
            '如果本段同伴建档信息启用，开局必须把该同伴作为第0回合已成立、可在第1回合直接互动的主要 NPC 写入 `<变量规划>` 的 `社交` 初始化内容。',
            `写入 \`社交\` 时，\`社交[i].姓名\` 必须严格等于「${纯文本(partner.姓名)}」；如果正文需要称呼或化名，只能写入“曾用名/对主角称呼/称呼类字段”，不能覆盖正式姓名。`
        ].join('\n');
    });
    return [
        `【开局同伴建档信息｜共 ${partners.length} 人】`,
        ...blocks,
        '每一名开局同伴都应与主角同场或有明确同行/汇合状态；必须包含完整 NPC 最小档案、是否主要角色=true、是否在场、位置、记忆、天赋列表、出身背景、技艺、战斗数值与七部位状态。'
    ].join('\n\n');
};

const 提取响应完整正文文本 = (response?: GameResponse): string => {
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    return logs
        .map((item) => `${item?.sender || '旁白'}：${item?.text || ''}`.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
};

const 格式化命令展示路径 = (key: string): string => key.replace(/^gameState\./, '');

const 序列化命令文本 = (cmd: TavernCommand): string => {
    const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
    const key = 格式化命令展示路径(typeof cmd?.key === 'string' ? cmd.key : '');
    if (action === 'delete') return `${action} ${key}`;
    try {
        return `${action} ${key} = ${JSON.stringify(cmd?.value ?? null)}`;
    } catch {
        return `${action} ${key} = ${String(cmd?.value ?? null)}`;
    }
};

const 构建带索引命令文本 = (commands: TavernCommand[], startIndex = 1): string[] => (
    (Array.isArray(commands) ? commands : [])
        .map((cmd, index) => {
            const text = 序列化命令文本(cmd);
            return text.trim() ? `[#${startIndex + index}] ${text}` : '';
        })
        .filter(Boolean)
);

const 过滤规划补丁命令 = (commands: TavernCommand[] | undefined, targets: string[]): TavernCommand[] => (
    (Array.isArray(commands) ? commands : []).filter((cmd) => {
        const key = 格式化命令展示路径(typeof cmd?.key === 'string' ? cmd.key.trim() : '');
        return targets.some((target) => key === target || key.startsWith(`${target}.`));
    })
);

const 创建开局规划超时错误 = (timeoutMs = 开局规划分析请求超时毫秒): Error => {
    const error = new Error(`开局规划分析请求超时（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒）`);
    error.name = 'TimeoutError';
    return error;
};

const 创建开场剧情流式超时错误 = (label: string, timeoutMs: number): Error => {
    const error = new Error(`开场剧情${label}（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒无新数据）`);
    error.name = 'TimeoutError';
    return error;
};

const 执行开场剧情流式请求带空闲超时 = async <T,>(
    parentSignal: AbortSignal,
    task: (signal: AbortSignal, markStreamActivity: () => void) => Promise<T>,
    requestTimeouts?: { firstResponseMs?: number; idleMs?: number }
): Promise<T> => {
    if (parentSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }
    const requestController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rejectTimeout: ((reason: Error) => void) | null = null;
    let settled = false;
    const abortByParent = () => requestController.abort(parentSignal.reason || new DOMException('Aborted', 'AbortError'));
    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    const startTimer = (timeoutMs: number, label: string) => {
        clearTimer();
        timer = setTimeout(() => {
            if (settled) return;
            const timeoutError = 创建开场剧情流式超时错误(label, timeoutMs);
            if (!requestController.signal.aborted) {
                requestController.abort(timeoutError);
            }
            rejectTimeout?.(timeoutError);
        }, timeoutMs);
    };
    const markStreamActivity = () => {
        startTimer(requestTimeouts?.idleMs || 开场剧情流式空闲超时毫秒, '流式输出空闲超时');
    };
    parentSignal.addEventListener('abort', abortByParent, { once: true });
    startTimer(requestTimeouts?.firstResponseMs || 开场剧情首次流式响应超时毫秒, '等待首次响应超时');
    try {
        return await Promise.race([
            task(requestController.signal, markStreamActivity),
            new Promise<T>((_, reject) => { rejectTimeout = reject; })
        ]);
    } catch (error) {
        const signalReason = requestController.signal.reason as any;
        if (requestController.signal.aborted && signalReason?.name === 'TimeoutError') {
            throw signalReason;
        }
        throw error;
    } finally {
        settled = true;
        parentSignal.removeEventListener('abort', abortByParent);
        clearTimer();
        rejectTimeout = null;
    }
};

const 执行开局规划带超时 = async <T,>(
    parentSignal: AbortSignal,
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 开局规划分析请求超时毫秒
): Promise<T> => {
    if (parentSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }
    const controller = new AbortController();
    const timeoutError = 创建开局规划超时错误(timeoutMs);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const abortByParent = () => controller.abort(parentSignal.reason || new DOMException('Aborted', 'AbortError'));
    parentSignal.addEventListener('abort', abortByParent, { once: true });
    try {
        return await Promise.race([
            task(controller.signal),
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    if (!controller.signal.aborted) {
                        controller.abort(timeoutError);
                    }
                    reject(timeoutError);
                }, timeoutMs);
            })
        ]);
    } catch (error) {
        if (controller.signal.aborted && controller.signal.reason === timeoutError) {
            throw timeoutError;
        }
        throw error;
    } finally {
        parentSignal.removeEventListener('abort', abortByParent);
        if (timer) {
            clearTimeout(timer);
        }
    }
};

const 读取提示词内容 = (promptPool: 提示词结构[], promptId: string): string => {
    const matched = Array.isArray(promptPool)
        ? promptPool.find((item) => item?.id === promptId)
        : undefined;
    return typeof matched?.内容 === 'string' ? matched.内容.trim() : '';
};

const 获取开局阶段渠道键 = (config: any, mainConfig?: any | null): string => {
    if (!config) return '';
    return [
        String(config.id || config.名称 || config.供应商 || '').trim(),
        String(config.baseUrl || '').trim().replace(/\/+$/, ''),
        String(config.apiKey || '').trim()
    ].filter(Boolean).join('|') || String(mainConfig?.id || mainConfig?.名称 || mainConfig?.供应商 || '').trim();
};

const 构建开局阶段模型信息 = (
    stageLabel: string,
    config: any,
    mainConfig?: any | null
): { channelName: string; modelName: string } => {
    const modelName = String(config?.model || mainConfig?.model || '').trim() || '未选择模型';
    const baseChannel = String(config?.名称 || config?.供应商 || mainConfig?.名称 || mainConfig?.供应商 || '').trim() || '未配置渠道';
    const isIndependent = Boolean(config && mainConfig && (
        String(config.baseUrl || '') !== String(mainConfig.baseUrl || '')
        || String(config.model || '') !== String(mainConfig.model || '')
        || String(config.apiKey || '') !== String(mainConfig.apiKey || '')
    ));
    return {
        channelName: isIndependent ? `${stageLabel}独立渠道：${baseChannel}` : baseChannel,
        modelName
    };
};

const 附加开局阶段模型信息 = <T extends { channelName?: string; modelName?: string }>(
    progress: T,
    info: { channelName: string; modelName: string }
): T => ({
    ...progress,
    channelName: progress.channelName || info.channelName,
    modelName: progress.modelName || info.modelName
});

type 开局阶段计时进度 = {
    phase?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

const 开局阶段已结束 = (phase?: string): boolean => (
    phase === 'done'
    || phase === 'error'
    || phase === 'skipped'
    || phase === 'cancelled'
);

export const 执行开场剧情生成工作流 = async (
    contextData: any,
    promptSnapshot: 提示词结构[],
    useStreaming: boolean,
    apiForOpening: 当前可用接口结构,
    options: {
        命令基态?: 开场命令基态;
        开局额外要求?: string;
        开局配置?: OpeningConfig;
    } | undefined,
    deps: 开场剧情生成依赖
): Promise<void> => {
    const initialHistory: 聊天记录结构[] = [
        {
            role: 'system',
            content: '系统: 正在生成开场内容...',
            timestamp: Date.now()
        }
    ];
    deps.设置历史记录(initialHistory);
    let openingStreamHeartbeat: ReturnType<typeof setInterval> | null = null;
    let openingDeltaReceived = false;
    let openingAnyDeltaReceived = false;
    const openingEnv = deps.规范化环境信息(contextData?.环境 || deps.环境);
    let streamMarker = 0;
    const openingRequestStartedAt = Date.now();
    let openingInputTokens = 0;

    try {
        const 写入或插入提示词 = (
            promptPool: 提示词结构[],
            promptId: string,
            fallbackPrompt: 提示词结构,
            content: string
        ): 提示词结构[] => {
            const nextPrompt = {
                ...(promptPool.find((item) => item.id === promptId) || fallbackPrompt),
                id: promptId,
                内容: content,
                启用: true
            };
            return promptPool.some((item) => item.id === promptId)
                ? promptPool.map((item) => item.id === promptId ? nextPrompt : item)
                : [...promptPool, nextPrompt];
        };
        const controller = new AbortController();
        deps.abortControllerRef.current = controller;

        const openingMem: 记忆系统结构 = { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] };
        const openingStatePayload = {
            角色: contextData.角色 || deps.角色,
            环境: openingEnv,
            世界: contextData.世界 || deps.世界,
            战斗: contextData.战斗 || deps.战斗,
            玩家门派: contextData.玩家门派 || deps.玩家门派,
            任务列表: contextData.任务列表 || deps.任务列表,
            约定列表: contextData.约定列表 || deps.约定列表,
            剧情: deps.规范化剧情状态(contextData.剧情 || deps.剧情, openingEnv),
            剧情规划: deps.规范化剧情规划状态((contextData as any).剧情规划 ?? deps.剧情规划),
            女主剧情规划: deps.规范化女主剧情规划状态(contextData.女主剧情规划 ?? deps.女主剧情规划),
            同人剧情规划: deps.规范化同人剧情规划状态((contextData as any).同人剧情规划 ?? deps.同人剧情规划),
            同人女主剧情规划: deps.规范化同人女主剧情规划状态((contextData as any).同人女主剧情规划 ?? deps.同人女主剧情规划),
            开局配置: options?.开局配置
        };
        const openingNovelDecompositionPrompt = await 获取开局小说拆分注入文本(
            deps.apiConfig,
            options?.开局配置,
            openingStatePayload.剧情,
            openingStatePayload?.角色?.姓名 || deps.角色?.姓名 || ''
        );

        const openingGameConfig = 规范化游戏设置(deps.gameConfig);
        const 开局功能模型占位 = deps.apiConfig?.功能模型占位;
        const 开局全局非流式输出 = openingGameConfig.启用非流式输出 === true;
        // 开局后处理与局内一致：尊重全局/分功能“非流式输出”设置；未开启时走真实流式请求。
        const 开局变量计算非流式输出 = 开局全局非流式输出 || 开局功能模型占位?.变量计算非流式输出 === true;
        const 开局世界演变非流式输出 = 开局全局非流式输出 || 开局功能模型占位?.世界演变非流式输出 === true;
        const 开局规划分析非流式输出 = 开局全局非流式输出 || 开局功能模型占位?.规划分析非流式输出 === true;
        const 开局地图更新非流式输出 = 开局全局非流式输出 || 开局功能模型占位?.地图自动更新非流式输出 === true;
        const 开局独立阶段自动重试已启用 = deps.游戏设置启用自动重试(openingGameConfig);
        const 请求开局阶段失败决策 = async (stageLabel: string, errorText: string): Promise<'retry' | 'skip'> => {
            const message = [
                `${stageLabel}请求失败：`,
                errorText || '未知错误',
                '',
                '选择“重试”会重新执行当前阶段；选择“跳过”会继续后续阶段。'
            ].join('\n');
            if (typeof window !== 'undefined') {
                return window.confirm(`${message}\n\n按“确定”重试，按“取消”跳过。`) ? 'retry' : 'skip';
            }
            return 'skip';
        };
        const 执行可重试开局阶段 = async <T,>(params: {
            stageLabel: string;
            run: () => Promise<T>;
            forceAutoRetry?: boolean;
            beforeAttempt?: (attempt: number) => void;
            onAutoRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
            onError?: (errorText: string) => void;
            onSkip?: (errorText: string) => void;
            getErrorText?: (error: any) => string;
        }): Promise<{ completed: boolean; result?: T }> => {
            let manualAttempt = 0;
            while (true) {
                manualAttempt += 1;
                params.beforeAttempt?.(manualAttempt);
                try {
                    const result = await deps.执行带自动重试的生成请求<T>({
                        enabled: params.forceAutoRetry === true || 开局独立阶段自动重试已启用,
                        action: params.run,
                        onRetry: params.onAutoRetry
                    });
                    return { completed: true, result };
                } catch (error: any) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    const errorText = params.getErrorText
                        ? params.getErrorText(error)
                        : (
                            deps.提取解析失败原始信息(error)
                            || error?.message
                            || '未知错误'
                        );
                    params.onError?.(errorText);
                    const decision = await 请求开局阶段失败决策(params.stageLabel, errorText);
                    if (decision === 'retry') {
                        continue;
                    }
                    params.onSkip?.(errorText);
                    return { completed: false };
                }
            }
        };
        const 启用修炼体系 = openingGameConfig.启用修炼体系 !== false;
        const openingHasNarrativeConstraint = 是否有叙事约束((openingStatePayload?.角色 || deps.角色)?.天赋列表);
        let openingPromptSnapshot = promptSnapshot.map(p => {
            if (p.id === 'core_cot') {
                return {
                    ...核心_开局思维链,
                    id: 'core_cot',
                    内容: 获取开局思维链提示词(openingGameConfig, { hasNarrativeConstraint: openingHasNarrativeConstraint }),
                    启用: true
                };
            }
            return p;
        });
        const openingTavernPresetModeEnabled = 酒馆预设模式可用(openingGameConfig);
        const openingDeepSeekMode = openingGameConfig.主剧情消息模式;
        const openingDeepSeekModeEnabled = openingDeepSeekMode === 'DeepSeek标准' || openingDeepSeekMode === 'DeepSeek锁格式';
        const openingGLMModeEnabled = openingDeepSeekMode === 'GLM标准' || openingDeepSeekMode === 'GLM锁格式';
        const openingRuntimeGptMode = (
            openingGameConfig.启用GPT模式 === true
            || openingDeepSeekMode === 'GPT'
            || openingDeepSeekModeEnabled
            || openingGLMModeEnabled
        );
        const openingDeepSeekPrefixMode = openingDeepSeekMode === 'DeepSeek锁格式'
            && openingGameConfig.DeepSeek策略?.开局策略 === '锁头开局'
            && openingGameConfig.DeepSeek策略?.启用Prefix能力探测 !== false;
        const openingGLMPrefixMode = openingDeepSeekMode === 'GLM锁格式'
            && openingGameConfig.GLM策略?.开局策略 === '锁头开局'
            && openingGameConfig.GLM策略?.启用Prefix能力探测 !== false;
        const openingGLMHTMLCommentThinking = openingGLMModeEnabled && openingGameConfig.GLM策略?.启用HTML注释思维链 !== false;
        const openingRealmPromptRaw = 启用修炼体系
            ? (openingPromptSnapshot.find((item) => item.id === 'core_realm')?.内容 || '').trim()
            : '';
        const 同人已启用 = Boolean(
            options?.开局配置?.同人融合?.enabled
            && typeof options?.开局配置?.同人融合?.作品名 === 'string'
            && options.开局配置.同人融合.作品名.trim()
        );
        let openingRealmPrompt = openingRealmPromptRaw.includes('开局后此处会被完整替换')
            ? ''
            : openingRealmPromptRaw;
        let openingRealmValidation = 启用修炼体系
            ? 校验境界体系提示词完整性(openingRealmPrompt)
            : { ok: true, normalizedText: '', reason: '' };
        if (启用修炼体系 && openingRealmValidation.ok) {
            openingRealmPrompt = openingRealmValidation.normalizedText;
            if (openingRealmPrompt !== openingRealmPromptRaw) {
                openingPromptSnapshot = 写入或插入提示词(
                    openingPromptSnapshot,
                    核心_境界体系.id,
                    核心_境界体系,
                    openingRealmPrompt
                );
            }
        }
        if (启用修炼体系 && 同人已启用 && !openingRealmValidation.ok) {
            deps.设置历史记录([
                ...initialHistory,
                {
                    role: 'assistant',
                    content: '【生成中】同人境界体系预生成...',
                    timestamp: Date.now() + 1
                }
            ]);
            const generatedOpeningRealmPrompt = await textAIService.generateFandomRealmData(
                {
                    openingConfig: options?.开局配置
                },
                apiForOpening,
                undefined,
                '【开局用途】本次生成结果会先用于第0回合开局。请优先保证主角初始境界、开场出场 NPC、门派前辈、潜在敌手与第一幕冲突都能直接按原著体系落位，不要只写抽象高端设定。'
            );
            openingRealmValidation = 校验境界体系提示词完整性(generatedOpeningRealmPrompt);
            if (!openingRealmValidation.ok) {
                throw new Error('同人开局前置失败：境界体系生成结果仍不完整，已阻止继续使用默认体系开局。');
            }
            openingRealmPrompt = openingRealmValidation.normalizedText;
            openingPromptSnapshot = 写入或插入提示词(
                openingPromptSnapshot,
                核心_境界体系.id,
                核心_境界体系,
                openingRealmPrompt
            );
            deps.setPrompts(openingPromptSnapshot);
            await dbService.保存设置(设置键.提示词池, openingPromptSnapshot).catch((error) => {
                recordDiagnosticLog('error', ['开局持久化同人境界体系失败', {
                    message: error?.message || '',
                    stack: typeof error?.stack === 'string' ? error.stack : undefined
                }]);
                console.error('开局前置持久化同人境界体系失败', error);
            });
        }
        const fandomPromptBundle = 构建同人运行时提示词包({
            openingConfig: options?.开局配置,
            realmPrompt: openingRealmPrompt
        });
        const openingTaskPrompt = 按功能开关过滤提示词内容(获取内置提示词槽位内容({
            entries: deps.builtinPromptEntries,
            slotId: openingGameConfig.启用饱腹口渴系统 === false
                ? 世界书本体槽位.开局初始化任务_禁用生存
                : 世界书本体槽位.开局初始化任务_启用生存,
            fallback: 获取开场初始化任务提示词(openingGameConfig)
        }), openingGameConfig);
        const openingTaskPromptWithFandom = 按功能开关过滤提示词内容([
            openingTaskPrompt,
            fandomPromptBundle.开局任务补丁
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim(), openingGameConfig);
        const filteredOpeningNovelDecompositionPrompt = 按功能开关过滤提示词内容(
            openingNovelDecompositionPrompt,
            openingGameConfig
        );
        const openingNovelDecompositionSystemPrompt = filteredOpeningNovelDecompositionPrompt
            ? `【小说分解章节锚点】\n${filteredOpeningNovelDecompositionPrompt}`
            : '';

        const openingContext = await deps.构建系统提示词(
            openingPromptSnapshot,
            openingMem,
            contextData.社交 || [],
            openingStatePayload,
            {
                禁用世界演变分流: true,
                注入剧情推动协议: false,
                注入女主剧情规划协议: false,
                世界书作用域: openingTavernPresetModeEnabled ? ['opening', 'tavern'] : ['opening'],
                世界书附加文本: [
                    openingTaskPromptWithFandom,
                    openingNovelDecompositionSystemPrompt,
                    构建开局配置提示词(options?.开局配置),
                    typeof options?.开局额外要求 === 'string' ? options.开局额外要求 : '',
                    (openingGameConfig as any)?.activeModuleExtraRules || ''
                ],
                openingConfig: options?.开局配置,
                强制剧情COT提示词ID: 'core_cot'
            }
        );

        streamMarker = Date.now();
        if (useStreaming) {
            const openingStreamWaitingStartedAt = Date.now();
            deps.设置历史记录([
                ...initialHistory,
                {
                    role: 'assistant',
                    content: '',
                    timestamp: streamMarker,
                    gameTime: 环境时间转标准串(openingEnv) || '未知时间'
                }
            ]);
            let pulse = 0;
            openingStreamHeartbeat = setInterval(() => {
                if (openingDeltaReceived || openingAnyDeltaReceived) return;
                pulse = (pulse + 1) % 4;
                const dots = '.'.repeat(pulse) || '.';
                const waitingMs = Date.now() - openingStreamWaitingStartedAt;
                const waitingText = waitingMs >= 开场剧情慢首包提示毫秒
                    ? `【等待中】模型首包较慢，仍在等待开场剧情${dots}`
                    : `【生成中】开场剧情生成${dots}`;
                deps.设置历史记录(prev => prev.map(item => {
                    if (
                        item.timestamp === streamMarker &&
                        item.role === 'assistant' &&
                        !item.structuredResponse
                    ) {
                        return { ...item, content: waitingText };
                    }
                    return item;
                }));
            }, 420);
        }

        const openingCotPseudoEnabled = (openingDeepSeekModeEnabled || openingGLMModeEnabled) ? false : openingGameConfig.启用COT伪装注入 !== false;
        const openingLengthRequirementPrompt = openingContext.contextPieces.字数要求提示词
            || 构建字数要求提示词(1000);
        const openingDisclaimerRequirementPrompt = openingContext.contextPieces.免责声明输出提示词 || undefined;
        const openingOutputProtocolPrompt = openingContext.contextPieces.输出协议提示词;
        const openingPerspectivePrompt = openingContext.contextPieces.叙事人称提示词 || '';
        const openingStyleAssistantPrompt = 按功能开关过滤提示词内容(
            获取内置提示词槽位内容({
                entries: deps.builtinPromptEntries,
                slotId: 获取剧情风格内置槽位('opening', openingGameConfig.剧情风格, openingGameConfig?.NTL后宫档位),
                fallback: 构建剧情风格助手提示词(
                    openingGameConfig.剧情风格,
                    openingGameConfig?.NTL后宫档位,
                    openingGameConfig
                )
            }),
            openingGameConfig
        );
        const openingRealWorldModePrompt = openingGameConfig.启用真实世界模式 === true
            ? 获取内置提示词槽位内容({
                entries: deps.builtinPromptEntries,
                slotId: 世界书本体槽位.真实世界模式,
                fallback: 构建真实世界模式提示词(openingGameConfig)
            })
            : '';
        const openingDeepSeekModePrompt = 获取DeepSeek主剧情兼容提示词(openingGameConfig);
        const openingGLMModePrompt = 获取GLM主剧情兼容提示词(openingGameConfig);
        const openingTraditionalChinesePrompt = 获取繁体输出指令(openingGameConfig);
        const openingCotPseudoPrompt = openingCotPseudoEnabled
            ? 构建COT伪装提示词(
                openingGameConfig,
                openingContext.contextPieces.AI角色声明
            )
            : '';
        const openingCotPrompt = [
            openingContext.contextPieces.COT提示词,
            fandomPromptBundle.开局COT补丁
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim();
        const openingNormalizedExtraPrompt = !openingTavernPresetModeEnabled
            ? 按功能开关过滤提示词内容(
                构建运行时额外提示词(openingGameConfig.额外提示词 || '', openingGameConfig),
                openingGameConfig
            )
            : '';
        const openingCustomExtraPrompt = typeof options?.开局额外要求 === 'string'
            ? options.开局额外要求.trim()
            : '';
        const openingCombinedExtraPrompt = [
            openingNormalizedExtraPrompt,
            openingCustomExtraPrompt ? `【开局额外要求】\n${openingCustomExtraPrompt}` : ''
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim();
        const openingRoleSetupText = 构建开局角色建档摘要(openingStatePayload?.角色 || deps.角色, {
            cultivationSystemEnabled: 启用修炼体系
        });
        const openingPartnerSetupText = 构建开局伙伴建档摘要(options?.开局配置, {
            cultivationSystemEnabled: 启用修炼体系
        });
        const openingConfigText = 构建开局配置提示词(options?.开局配置, options?.开局额外要求);
        const openingNarrativeConstraintBlock = 提取叙事约束块(
            (openingStatePayload?.角色 || deps.角色)?.天赋列表
        );
        const openingLatestUserInputRole: 'assistant' | 'user' = (
            openingTavernPresetModeEnabled
            || openingRuntimeGptMode
            || openingDeepSeekModeEnabled
        ) ? 'user' : 'assistant';

        const playerSetupContext = [
            ...(openingNarrativeConstraintBlock ? [openingNarrativeConstraintBlock, ''] : []),
            '【本次任务】',
            '请基于 world_prompt、下列主角建档信息、当前标签协议与开局额外要求，生成第0回合开场，并输出自然语言、完整详细的 `<变量规划>` 作为本回合初始化结果说明。',
            '不要把下列建档信息视为已经自动注入前端变量或已自动写入当前状态；除非你在 `<变量规划>` 中明确列出需要初始化的内容，否则这些内容都不算已进入本回合初始化结果。',
            '',
            按功能开关过滤提示词内容(fandomPromptBundle.开局任务补丁, openingGameConfig),
            '',
            openingRoleSetupText,
            '',
            openingPartnerSetupText,
            '',
            openingConfigText,
            '',
            '【执行要求】',
            '- 先完成沉浸式第一幕，再把需要落地的可写域整理成完整详细的 `<变量规划>`。',
            '- `<变量规划>` 要把初始化结果详细写清，确保前台初始化信息完整、清楚、可直接承接。',
            '- 第0回合 `<变量规划>` 不是摘要，而是第1回合直接使用的完整前台初始化稿；就算某部分主要承接建档，也要把当前终态、成立依据、新增对象或字段、本回合已发生变化写清。',
            '- `<变量规划>` 一律用自然语言写成说明稿，不要写命令语法或伪 JSON。'
        ].join('\n');
        const openingLatestUserInputAsModel = 包装繁体任务提示([
            playerSetupContext,
            '\n以下为最新任务要求：',
            `<用户输入>${openingTaskPrompt}</用户输入>`
        ].join('\n'), openingGameConfig);
        const openingLatestUserInputForTavern = 包装繁体任务提示([
            openingLatestUserInputAsModel,
            openingCustomExtraPrompt ? `【开局额外要求】\n${openingCustomExtraPrompt}` : ''
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim(), openingGameConfig);
        const openingCotPromptForTavern = (() => {
            const source = openingCotPrompt || (openingPromptSnapshot.find((p) => p.id === 'core_cot')?.内容 || 核心_开局思维链.内容 || '').trim();
            if (!source) return '';
            return source;
        })();
        let openingOrderedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        if (openingTavernPresetModeEnabled) {
            openingOrderedMessages = 构建酒馆预设消息链({
                config: openingGameConfig,
                context: openingContext,
                chatHistory: [],
                latestUserInput: openingLatestUserInputForTavern,
                playerName: openingStatePayload?.角色?.姓名 || deps.角色?.姓名 || '',
                playerRole: openingStatePayload?.角色 || deps.角色,
                overrideCotPrompt: openingCotPromptForTavern,
                overrideStoryAppendPrompt: openingNovelDecompositionSystemPrompt,
                worldbookExtraTexts: [
                    openingPerspectivePrompt,
                    openingStyleAssistantPrompt,
                    openingRealWorldModePrompt,
                    openingDeepSeekModePrompt,
                    openingTraditionalChinesePrompt,
                    openingCombinedExtraPrompt,
                    openingDisclaimerRequirementPrompt || ''
                ]
            });
        } else {
            const pushOpening = (
                role: 'system' | 'user' | 'assistant',
                content?: string,
                pushOptions?: { openingUserInput?: boolean }
            ) => {
                const trimmed = (content || '').trim();
                if (!trimmed) return;
                const normalizedRole: 'system' | 'user' | 'assistant' = role;
                openingOrderedMessages.push({ role: normalizedRole, content: trimmed });
            };
            pushOpening('system', openingContext.contextPieces.叙事约束提示词);
            pushOpening('system', openingContext.contextPieces.AI角色声明);
            pushOpening('system', openingContext.contextPieces.worldPrompt);
            pushOpening('system', openingContext.contextPieces.同人设定摘要);
            pushOpening('system', openingContext.contextPieces.境界体系提示词);
            pushOpening('system', openingNovelDecompositionSystemPrompt);
            pushOpening('system', openingContext.contextPieces.otherPrompts);
            pushOpening('system', openingContext.contextPieces.难度设置提示词);
            pushOpening('system', openingContext.contextPieces.叙事人称提示词);
            pushOpening('system', openingContext.contextPieces.字数设置提示词);
            pushOpening('system', openingStyleAssistantPrompt);
            pushOpening('system', openingRealWorldModePrompt);
            pushOpening('system', openingDeepSeekModePrompt);
            pushOpening('system', openingGLMModePrompt);
            pushOpening('system', openingTraditionalChinesePrompt);
            pushOpening('user', openingCombinedExtraPrompt);
            pushOpening('user', openingDisclaimerRequirementPrompt || '');
            pushOpening('system', openingCotPrompt);
            pushOpening(openingLatestUserInputRole, openingLatestUserInputAsModel, { openingUserInput: true });
            if (!openingRuntimeGptMode) {
                pushOpening('user', 包装繁体任务提示('开始任务', openingGameConfig));
            }
            if (openingCotPseudoEnabled) {
                pushOpening('assistant', openingCotPseudoPrompt);
            }
            if (openingDeepSeekPrefixMode) {
                openingOrderedMessages.push({ role: 'assistant', content: '<thinking>\n', prefix: true } as any);
            }
            if (openingGLMPrefixMode) {
                openingOrderedMessages.push({ role: 'assistant', content: openingGLMHTMLCommentThinking ? '<!-- \n' : '<thinking>\n', prefix: true } as any);
            }
        }

        const openingAutoRetryEnabled = deps.游戏设置启用自动重试(openingGameConfig);
        const apiForOpeningRequest = 补全开场剧情默认输出预算(apiForOpening);
        openingInputTokens = deps.估算消息Token(openingOrderedMessages, apiForOpeningRequest?.model);
        recordDiagnosticLog('info', ['开局主剧情请求开始', {
            stage: 'opening_story',
            model: apiForOpeningRequest?.model || '',
            supplier: apiForOpeningRequest?.供应商 || '',
            baseUrlHost: 读取接口主机(apiForOpeningRequest?.baseUrl),
            streaming: useStreaming,
            maxTokens: apiForOpeningRequest?.maxTokens,
            inputTokens: openingInputTokens,
            messageCount: openingOrderedMessages.length,
            validateTagCompleteness: openingGameConfig.启用标签检测完整性 === true,
            enableTagRepair: openingGameConfig.启用标签修复 !== false,
            requireActionOptionsTag: openingGameConfig.启用行动选项 !== false,
            autoRetryEnabled: openingAutoRetryEnabled
        }]);
        const aiResult = await deps.执行带自动重试的生成请求<textAIService.StoryResponseResult>({
            enabled: openingAutoRetryEnabled,
            onRetry: (attempt, maxAttempts, reason) => {
                if (useStreaming && !openingAnyDeltaReceived) {
                    deps.设置历史记录(prev => deps.更新流式草稿为自动重试提示(prev, attempt, maxAttempts, reason));
                }
            },
            action: async (attempt, lastError) => {
                if (useStreaming && !openingAnyDeltaReceived) {
                    openingDeltaReceived = false;
                }
                const openingRetryFormatPrompt = 构建开局自动重试格式提示(attempt, lastError);
                const openingMessagesForAttempt = 追加开局自动重试消息(openingOrderedMessages, openingRetryFormatPrompt);
                const requestOpeningStory = (
                    signal: AbortSignal,
                    markStreamActivity?: () => void
                ) => textAIService.generateStoryResponse(
                        '',
                        '',
                        '',
                        apiForOpeningRequest,
                        signal,
                        useStreaming
                            ? {
                                stream: true,
                                onDelta: (_delta, accumulated) => {
                                    openingDeltaReceived = true;
                                    openingAnyDeltaReceived = true;
                                    if (openingStreamHeartbeat) {
                                        clearInterval(openingStreamHeartbeat);
                                        openingStreamHeartbeat = null;
                                    }
                                    markStreamActivity?.();
                                    deps.设置历史记录(prev => prev.map(item => {
                                        if (
                                            item.timestamp === streamMarker &&
                                            item.role === 'assistant' &&
                                            !item.structuredResponse
                                        ) {
                                            return { ...item, content: accumulated };
                                        }
                                        return item;
                                    }));
                                }
                            }
                            : undefined,
                        openingTavernPresetModeEnabled ? '' : openingCombinedExtraPrompt,
                        {
                            orderedMessages: openingMessagesForAttempt,
                            enableCotInjection: openingCotPseudoEnabled,
                            leadingSystemPrompt: openingContext.contextPieces.AI角色声明,
                            styleAssistantPrompt: [openingPerspectivePrompt, openingStyleAssistantPrompt, openingRealWorldModePrompt].filter(Boolean).join('\n\n'),
                            outputProtocolPrompt: openingOutputProtocolPrompt,
                            cotPseudoHistoryPrompt: openingCotPseudoPrompt,
                            lengthRequirementPrompt: openingLengthRequirementPrompt,
                            disclaimerRequirementPrompt: openingDisclaimerRequirementPrompt,
                            validateTagCompleteness: openingGameConfig.启用标签检测完整性 === true,
                            enableTagRepair: openingGameConfig.启用标签修复 !== false,
                            requireActionOptionsTag: openingGameConfig.启用行动选项 !== false,
                            prefixMode: openingDeepSeekPrefixMode || openingGLMPrefixMode,
                            disableThinking: (openingGameConfig.DeepSeek策略?.开局Thinking !== true) && (openingGameConfig.GLM策略?.开局Thinking !== true),
                            stripReasoning: (openingGameConfig.DeepSeek策略?.开局Thinking !== true) && (openingGameConfig.GLM策略?.开局Thinking !== true),
                            includeReasoning: (openingGameConfig.DeepSeek策略?.开局Thinking === true) || (openingGameConfig.GLM策略?.开局Thinking === true),
                            glmHTMLCommentThinking: openingGLMHTMLCommentThinking
                        }
                    );
                if (!useStreaming) {
                    return requestOpeningStory(controller.signal);
                }
                return 执行开场剧情流式请求带空闲超时(
                    controller.signal,
                    (signal, markStreamActivity) => requestOpeningStory(signal, markStreamActivity),
                    获取游玩请求超时毫秒(openingGameConfig.游玩请求超时设置)
                );
            }
        });
        let aiData = aiResult.response;
        recordDiagnosticLog('info', ['开局主剧情解析成功', {
            stage: 'opening_story',
            rawTextLength: typeof aiResult.rawText === 'string' ? aiResult.rawText.length : 0,
            logsCount: Array.isArray(aiData?.logs) ? aiData.logs.length : 0,
            commandCount: Array.isArray(aiData?.tavern_commands) ? aiData.tavern_commands.length : 0,
            hasShortTerm: typeof aiData?.shortTerm === 'string' && aiData.shortTerm.trim().length > 0,
            hasVariablePlan: typeof aiData?.t_var_plan === 'string' && aiData.t_var_plan.trim().length > 0,
            actionOptionsCount: Array.isArray(aiData?.action_options) ? aiData.action_options.length : 0,
            outputTokens: deps.估算AI输出Token(deps.获取原始AI消息(aiResult.rawText), apiForOpeningRequest?.model)
        }]);
        if (openingStreamHeartbeat) clearInterval(openingStreamHeartbeat);

        deps.设置开局主剧情进度({
            phase: 'done',
            text: '主剧情已生成，后续为独立初始化阶段。',
            rawText: typeof aiResult.rawText === 'string' ? aiResult.rawText : '',
            channelName: apiForOpeningRequest?.供应商 || '',
            modelName: apiForOpeningRequest?.model || ''
        });

        const commandBaseState = options?.命令基态 || {
            角色: contextData.角色 || deps.角色,
            环境: contextData.环境 || deps.环境,
            社交: contextData.社交 || [],
            世界: contextData.世界 || deps.世界,
            战斗: contextData.战斗 || deps.战斗,
            玩家门派: contextData.玩家门派 || deps.玩家门派,
            任务列表: Array.isArray(contextData.任务列表) ? contextData.任务列表 : deps.任务列表,
            约定列表: Array.isArray(contextData.约定列表) ? contextData.约定列表 : deps.约定列表,
            剧情: deps.规范化剧情状态(contextData.剧情 || deps.剧情, contextData.环境 || deps.环境),
            剧情规划: deps.规范化剧情规划状态((contextData as any).剧情规划 ?? deps.剧情规划),
            女主剧情规划: deps.规范化女主剧情规划状态(contextData.女主剧情规划 ?? deps.女主剧情规划),
            同人剧情规划: deps.规范化同人剧情规划状态((contextData as any).同人剧情规划 ?? deps.同人剧情规划),
            同人女主剧情规划: deps.规范化同人女主剧情规划状态((contextData as any).同人女主剧情规划 ?? deps.同人女主剧情规划)
        };
        const 保护开局门派 = <T extends 开场命令基态>(state: T): T => 保护开局生成门派状态(
            state,
            commandBaseState,
            options?.开局配置
        );
        let openingBodyText = 提取响应完整正文文本(aiData);
        let openingVariablePlanText = typeof aiData?.t_var_plan === 'string' ? aiData.t_var_plan.trim() : '';
        let openingPlanText = 提取响应规划文本(aiData);
        const openingWorldPrompt = 按功能开关过滤提示词内容(
            读取提示词内容(openingPromptSnapshot, 'core_world'),
            openingGameConfig
        );
        const openingRealmPromptNormalized = (() => {
            if (!启用修炼体系) return '';
            const raw = 读取提示词内容(openingPromptSnapshot, 'core_realm');
            return raw.includes('开局后此处会被完整替换') ? '' : raw;
        })();
        const openingWorldEvolutionPrompt = 按功能开关过滤提示词内容(
            读取提示词内容(openingPromptSnapshot, 'stat_world_evo') || ((数值_世界演化.内容 || '').trim()),
            openingGameConfig
        );
        const openingRuntimeFandomBundle = 构建同人运行时提示词包({
            openingConfig: options?.开局配置,
            worldPrompt: openingWorldPrompt,
            realmPrompt: openingRealmPromptNormalized
        });
        let responseForExecution: GameResponse = {
            ...aiData,
            tavern_commands: Array.isArray(aiData?.tavern_commands) ? [...aiData.tavern_commands] : []
        };
        let simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
        const 渲染开场结构化正文草稿 = () => {
            if (!useStreaming) return;
            const draftDisplayData: GameResponse = {
                ...aiData,
                tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
            };
            const draftTimestamp = Date.now();
            deps.设置历史记录(prev => prev.map(item => {
                if (
                    item.timestamp === streamMarker
                    && item.role === 'assistant'
                ) {
                    return {
                        ...item,
                        content: 'Opening Story',
                        structuredResponse: draftDisplayData,
                        rawJson: deps.获取原始AI消息(aiResult.rawText),
                        gameTime: 环境时间转标准串(simulatedOpeningState.环境) || item.gameTime || '未知时间',
                        inputTokens: openingInputTokens,
                        responseDurationSec: deps.计算回复耗时秒(openingRequestStartedAt, draftTimestamp),
                        outputTokens: deps.估算AI输出Token(deps.获取原始AI消息(aiResult.rawText), apiForOpeningRequest?.model)
                    };
                }
                return item;
            }));
        };
        渲染开场结构化正文草稿();
        const 立即并入开局变量状态 = (nextResponse: GameResponse) => {
            simulatedOpeningState = 保护开局门派(deps.processResponseCommands(nextResponse, commandBaseState));
            const appliedTime = 环境时间转标准串(simulatedOpeningState.环境);
            if (appliedTime) {
                deps.设置游戏初始时间(appliedTime);
            }
            return simulatedOpeningState;
        };
        let 主角开局生图已触发 = false;
        let 开局NPC生图已触发签名 = '';
        const 构建开局NPC生图签名 = (npcList: any[]): string => (
            (Array.isArray(npcList) ? npcList : [])
                .map((npc: any, index: number) => {
                    const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
                    const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
                    return id || name || `index:${index}`;
                })
                .filter(Boolean)
                .join('|')
        );
        const 尽早触发开局NPC生图 = (sourceState: any = simulatedOpeningState) => {
            const npcList = Array.isArray(sourceState?.社交) ? sourceState.社交 : [];
            if (npcList.length === 0) return;
            const signature = 构建开局NPC生图签名(npcList);
            if (!signature || 开局NPC生图已触发签名 === signature) return;
            开局NPC生图已触发签名 = signature;
            try {
                deps.触发新增NPC自动生图(npcList);
            } catch (error) {
                console.warn('开局 NPC 生图提前触发失败，已保持开局流程继续', error);
            }
        };
        const 尽早触发主角开局生图 = () => {
            if (主角开局生图已触发) return;
            主角开局生图已触发 = true;
            const trigger = deps.触发主角自动生图;
            void 安全触发开局主角自动生图(trigger, simulatedOpeningState.角色 || commandBaseState.角色, '主角开局生图触发');
        };
        let openingWorldInitUpdates: string[] = [];

        const openingPolishApi = 获取文章优化接口配置(deps.apiConfig);
        const openingVariableApi = 获取变量计算接口配置(deps.apiConfig);
        const openingStageTiming: Record<string, { startedAt: number; finishedAt?: number }> = {};
        const 附加开局阶段运行信息 = <T extends 开局阶段计时进度 & { channelName?: string; modelName?: string }>(
            stageId: string,
            progress: T,
            info: { channelName: string; modelName: string }
        ): T => {
            const now = Date.now();
            const current = openingStageTiming[stageId] || { startedAt: now };
            if (progress.phase === 'start') {
                current.startedAt = current.startedAt || now;
                current.finishedAt = undefined;
            } else if (开局阶段已结束(progress.phase)) {
                current.finishedAt = current.finishedAt || now;
            }
            openingStageTiming[stageId] = current;
            const finishedAt = current.finishedAt;
            const elapsedMs = typeof progress.elapsedMs === 'number'
                ? progress.elapsedMs
                : Math.max(0, (finishedAt || now) - current.startedAt);
            return 附加开局阶段模型信息({
                ...progress,
                startedAt: progress.startedAt || current.startedAt,
                finishedAt: progress.finishedAt || finishedAt,
                elapsedMs
            }, info);
        };
        const openingPolishInfo = 构建开局阶段模型信息('文章优化', openingPolishApi, apiForOpening);
        const 设置开局文章优化进度 = (progress: any) => {
            deps.设置开局文章优化进度(附加开局阶段运行信息('polish', progress, openingPolishInfo));
        };
        const 开局文章优化变量可并行 = deps.文章优化功能已开启()
            && 接口配置是否可用(openingPolishApi)
            && 接口配置是否可用(openingVariableApi)
            && 获取开局阶段渠道键(openingPolishApi, apiForOpening) !== 获取开局阶段渠道键(openingVariableApi, apiForOpening);
        const 执行开局文章优化阶段 = () => 执行可重试开局阶段({
            stageLabel: '开局文章优化',
            beforeAttempt: (attempt) => {
                设置开局文章优化进度({
                    phase: 'start',
                    text: attempt > 1
                        ? `正在重新优化开局正文...（第 ${attempt} 次手动重试）`
                        : (开局文章优化变量可并行 ? '正在并行优化开局正文...' : '正在优化开局正文...')
                });
            },
            onAutoRetry: (attempt, maxAttempts, reason) => {
                设置开局文章优化进度({
                    phase: 'start',
                    text: `开局文章优化请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                });
            },
            run: () => deps.执行正文润色(
                responseForExecution,
                aiResult.rawText,
                {
                    playerInput: '',
                    signal: controller.signal,
                    allowExpansionForLength: true,
                    minLength: openingGameConfig.字数要求,
                    onDelta: (_delta: string, accumulated: string) => {
                        设置开局文章优化进度({
                            phase: 'start',
                            text: '正在流式优化开局正文...',
                            rawText: accumulated
                        });
                    }
                }
            ),
            onError: (errorText) => {
                设置开局文章优化进度({
                    phase: 'error',
                    text: `${errorText || '开局文章优化失败'}\n等待选择：重试当前阶段，或跳过继续。`
                });
            },
            onSkip: (errorText) => {
                设置开局文章优化进度({
                    phase: 'skipped',
                    text: `开局文章优化失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                });
            },
            getErrorText: (error: any) => error?.message || '开局文章优化失败'
        });
        const 应用开局文章优化结果 = (polishStage: any) => {
            const polished = polishStage?.result;
            if (polishStage?.completed && polished) {
                if (polished.applied) {
                    responseForExecution = {
                        ...polished.response,
                        tavern_commands: Array.isArray(responseForExecution.tavern_commands)
                            ? [...responseForExecution.tavern_commands]
                            : []
                    };
                    aiData = responseForExecution;
                    openingBodyText = 提取响应完整正文文本(aiData);
                    openingVariablePlanText = typeof aiData?.t_var_plan === 'string' ? aiData.t_var_plan.trim() : openingVariablePlanText;
                    openingPlanText = 提取响应规划文本(aiData) || openingPlanText;
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                    渲染开场结构化正文草稿();
                    设置开局文章优化进度({
                        phase: 'done',
                        text: `开局正文已优化（模型：${polished.response.body_optimized_model || '未知'}）。`,
                        rawText: polished.rawText || ''
                    });
                } else {
                    设置开局文章优化进度({
                        phase: 'skipped',
                        text: polished.error || '开局文章优化未应用，保留原文。',
                        rawText: polished.rawText || ''
                    });
                }
            }
        };
        let pendingOpeningPolishStage: Promise<any> | null = null;
        if (!deps.文章优化功能已开启()) {
            设置开局文章优化进度({
                phase: 'skipped',
                text: '文章优化功能未开启，已跳过。'
            });
        } else if (接口配置是否可用(openingPolishApi)) {
            if (开局文章优化变量可并行) {
                pendingOpeningPolishStage = 执行开局文章优化阶段();
            } else {
                应用开局文章优化结果(await 执行开局文章优化阶段());
            }
        } else {
            设置开局文章优化进度({
                phase: 'skipped',
                text: '文章优化独立链路未启用，已跳过。'
            });
        }

        const openingVariableInfo = 构建开局阶段模型信息('变量生成', openingVariableApi, apiForOpening);
        const 设置开局变量生成进度 = (progress: any) => {
            deps.设置开局变量生成进度(附加开局阶段运行信息('variable', progress, openingVariableInfo));
        };
        if (接口配置是否可用(openingVariableApi)) {
            const variableStage = await 执行可重试开局阶段({
                stageLabel: '开局变量生成',
                beforeAttempt: (attempt) => {
                    设置开局变量生成进度({
                        phase: 'start',
                        text: attempt > 1
                            ? `正在重新生成开局变量...（第 ${attempt} 次手动重试）`
                            : (开局文章优化变量可并行 ? '正在并行生成开局变量...' : '正在生成开局变量...')
                    });
                },
                onAutoRetry: (attempt, maxAttempts, reason) => {
                    设置开局变量生成进度({
                        phase: 'start',
                        text: `开局变量生成请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                    });
                },
                run: async () => {
                    const openingCurrentGameTime = 环境时间转标准串(simulatedOpeningState.环境) || '未知时间';
                    const openingVariableAudit = 构建开局变量生成审计重点({
                        fandomEnabled: openingRuntimeFandomBundle.enabled
                    });
                    const variableWorldbookExtra = 按功能开关过滤提示词内容(构建世界书注入文本({
                        books: deps.worldbooks,
                        scopes: ['variable_calibration'],
                        environment: simulatedOpeningState.环境,
                        social: simulatedOpeningState.社交,
                        history: [],
                        extraTexts: [openingBodyText, openingVariablePlanText]
                    }).combinedText, openingGameConfig);
                    const variableExtraPrompt = [
                        开局变量生成附加提示词,
                        openingVariableAudit,
                        variableWorldbookExtra
                    ]
                        .filter(Boolean)
                        .join('\n\n');
                    return 执行变量模型校准工作流(
                        {
                            playerInput: '',
                            parsedResponse: responseForExecution,
                            baseState: {
                                角色: commandBaseState.角色,
                                环境: commandBaseState.环境,
                                世界: commandBaseState.世界,
                                社交: commandBaseState.社交,
                                战斗: commandBaseState.战斗,
                                玩家门派: commandBaseState.玩家门派,
                                任务列表: commandBaseState.任务列表,
                                约定列表: commandBaseState.约定列表
                            },
                            promptPool: openingPromptSnapshot,
                            worldEvolutionEnabled: false,
                            builtinPromptEntries: deps.builtinPromptEntries,
                            worldbooks: deps.worldbooks,
                            signal: controller.signal,
                            extraPromptAppend: variableExtraPrompt,
                            openingConfig: options?.开局配置,
                            isOpeningRound: true,
                            openingTaskContext: {
                                currentGameTime: openingCurrentGameTime,
                                openingRoleSetupText,
                                openingPartnerSetupText,
                                openingConfigText
                            },
                            onStreamDelta: 开局变量计算非流式输出
                                ? undefined
                                : (_delta: string, accumulated: string) => {
                                    if (controller.signal.aborted) return;
                                    设置开局变量生成进度({
                                        phase: 'start',
                                        text: '正在流式生成开局变量...',
                                        rawText: accumulated
                                    });
                                }
                        },
                        {
                            apiConfig: deps.apiConfig,
                            gameConfig: deps.gameConfig
                        }
                    );
                },
                onError: (errorText) => {
                    设置开局变量生成进度({
                        phase: 'error',
                        text: `${errorText || '开局变量生成失败'}\n等待选择：重试当前阶段，或跳过继续。`
                    });
                },
                onSkip: (errorText) => {
                    设置开局变量生成进度({
                        phase: 'skipped',
                        text: `开局变量生成失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                    });
                },
                getErrorText: (error: any) => error?.message || '开局变量生成失败'
            });
            const openingVariableResult = variableStage.result;
            const openingVariableStartIndex = (Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0) + 1;
            if (variableStage?.completed) {
                const variableCommands = Array.isArray(openingVariableResult?.commands)
                    ? openingVariableResult.commands
                    : [];
                设置开局变量生成进度({
                    phase: variableCommands.length > 0 ? 'done' : 'skipped',
                    text: variableCommands.length > 0
                        ? '开局变量生成完成。'
                        : '开局变量生成未产生更新。',
                    rawText: typeof openingVariableResult?.rawText === 'string' ? openingVariableResult.rawText : '',
                    commandTexts: 构建带索引命令文本(variableCommands, openingVariableStartIndex)
                });
                if (openingVariableResult && variableCommands.length > 0) {
                    responseForExecution = 合并变量生成结果到响应(responseForExecution, openingVariableResult);
                    aiData = {
                        ...aiData,
                        variable_calibration_report: responseForExecution.variable_calibration_report,
                        variable_calibration_commands: responseForExecution.variable_calibration_commands,
                        variable_calibration_model: responseForExecution.variable_calibration_model
                    };
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                    立即并入开局变量状态(responseForExecution);
                    设置开局变量生成进度({
                        phase: 'done',
                        text: '开局变量生成完成，并已立即并入前台初始化状态。',
                        rawText: typeof openingVariableResult?.rawText === 'string' ? openingVariableResult.rawText : '',
                        commandTexts: 构建带索引命令文本(variableCommands, openingVariableStartIndex)
                    });
                    尽早触发开局NPC生图(simulatedOpeningState);
                    尽早触发主角开局生图();
                }
            }
        } else {
            设置开局变量生成进度({
                phase: 'skipped',
                text: '变量生成独立链路未启用，已跳过。'
            });
            尽早触发主角开局生图();
        }
        if (pendingOpeningPolishStage) {
            应用开局文章优化结果(await pendingOpeningPolishStage);
        }
        尽早触发主角开局生图();

        const worldEvolutionFeatureEnabled = deps.apiConfig?.功能模型占位?.世界演变功能启用 !== false;
        const planningFeatureEnabled = deps.apiConfig?.功能模型占位?.规划分析功能启用 !== false;
        const mapGenerationEnabled = deps.apiConfig?.功能模型占位?.地图生成功能启用 !== false;
        const openingWorldApi = 获取世界演变接口配置(deps.apiConfig);
        const openingPlanningApi = 获取规划分析接口配置(deps.apiConfig);
        const openingMapApi = 获取地图自动更新接口配置(deps.apiConfig);
        const openingWorldInfo = 构建开局阶段模型信息('动态世界', openingWorldApi, apiForOpening);
        const openingPlanningInfo = 构建开局阶段模型信息('规划分析', openingPlanningApi, apiForOpening);
        const openingMapInfo = 构建开局阶段模型信息('地图更新', openingMapApi, apiForOpening);
        const 设置开局世界演变进度 = (progress: any) => {
            deps.设置开局世界演变进度(附加开局阶段运行信息('world', progress, openingWorldInfo));
        };
        const 设置开局规划进度 = (progress: any) => {
            deps.设置开局规划进度(附加开局阶段运行信息('planning', progress, openingPlanningInfo));
        };
        const 设置开局地图更新进度 = (progress: any) => {
            deps.设置开局地图更新进度(附加开局阶段运行信息('map', progress, openingMapInfo));
        };
        const 开局可用并行阶段 = [
            worldEvolutionFeatureEnabled && 接口配置是否可用(openingWorldApi)
                ? { id: 'world', channelKey: 获取开局阶段渠道键(openingWorldApi, apiForOpening) }
                : null,
            planningFeatureEnabled && 接口配置是否可用(openingPlanningApi)
                ? { id: 'planning', channelKey: 获取开局阶段渠道键(openingPlanningApi, apiForOpening) }
                : null,
            mapGenerationEnabled && 接口配置是否可用(openingMapApi)
                ? { id: 'map', channelKey: 获取开局阶段渠道键(openingMapApi, apiForOpening) }
                : null
        ].filter(Boolean) as Array<{ id: string; channelKey: string }>;
        const 开局后处理可并行 = 开局可用并行阶段.length > 1
            && new Set(开局可用并行阶段.map((item) => item.channelKey)).size === 开局可用并行阶段.length;
        let pendingOpeningWorldStage: Promise<any> | null = null;
        let pendingOpeningMapStage: Promise<any> | null = null;
        let openingMapProgressSettled = false;
        if (!worldEvolutionFeatureEnabled) {
            设置开局世界演变进度({
                phase: 'skipped',
                text: '动态世界功能未开启，已跳过。'
            });
        } else if (接口配置是否可用(openingWorldApi)) {
            const 运行开局动态世界阶段 = () => 执行可重试开局阶段({
                stageLabel: '开局动态世界',
                beforeAttempt: (attempt) => {
                    设置开局世界演变进度({
                        phase: 'start',
                        text: attempt > 1
                            ? `正在重新初始化动态世界...（第 ${attempt} 次手动重试）`
                            : (开局后处理可并行 ? '正在初始化动态世界...（与规划分析/地图更新并行）' : '正在初始化动态世界...')
                    });
                },
                onAutoRetry: (attempt, maxAttempts, reason) => {
                    设置开局世界演变进度({
                        phase: 'start',
                        text: `开局动态世界请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                    });
                },
                run: async () => {
                    const worldCommandTexts = 构建带索引命令文本(responseForExecution.tavern_commands || []);
                    const worldInitContext = 构建开局世界演变初始化上下文({
                        openingBodyText,
                        openingPlanText,
                        openingCommandTexts: worldCommandTexts,
                        currentGameTime: 环境时间转标准串(simulatedOpeningState.环境) || '未知时间'
                    });
                    const worldbookExtra = 按功能开关过滤提示词内容(构建世界书注入文本({
                        books: deps.worldbooks,
                        scopes: ['world_evolution'],
                        environment: simulatedOpeningState.环境,
                        world: simulatedOpeningState.世界,
                        history: [],
                        extraTexts: [openingBodyText, openingPlanText, ...worldCommandTexts]
                    }).combinedText, openingGameConfig);
                    const worldNovelDecompositionPrompt = await 获取激活小说拆分注入文本(
                        deps.apiConfig,
                        'world_evolution',
                        options?.开局配置,
                        simulatedOpeningState.剧情,
                        simulatedOpeningState.角色?.姓名 || deps.角色?.姓名 || ''
                    );
                    const worldExtraPrompt = [
                        开局世界演变初始化附加提示词,
                        worldInitContext,
                        worldbookExtra,
                        按功能开关过滤提示词内容(worldNovelDecompositionPrompt, openingGameConfig),
                        按功能开关过滤提示词内容(openingRuntimeFandomBundle.同人设定摘要, openingGameConfig),
                        启用修炼体系 ? openingRuntimeFandomBundle.境界母板补丁 : '',
                        openingTraditionalChinesePrompt
                    ]
                        .filter(Boolean)
                        .join('\n\n');
                    const worldContext = 构建世界演变上下文文本({
                        worldPrompt: openingWorldPrompt,
                        worldEvolutionPrompt: openingWorldEvolutionPrompt,
                        envData: simulatedOpeningState.环境,
                        worldData: simulatedOpeningState.世界,
                        storyData: simulatedOpeningState.剧情,
                        shortMemoryTexts: [],
                        scriptText: openingBodyText || '暂无',
                        currentTurnBody: openingBodyText,
                        currentTurnPlanText: openingPlanText,
                        currentTurnCommandsText: 构建带索引命令文本(responseForExecution.tavern_commands || [])
                            .map((line) => line.replace(/^\[#(\d+)\]\s*/, '#$1 '))
                            .join('\n'),
                        currentGameTime: 环境时间转标准串(simulatedOpeningState.环境) || '',
                        dynamicHints: Array.isArray(responseForExecution.dynamic_world) ? responseForExecution.dynamic_world : [],
                        dueHints: []
                    });
                    return textAIService.generateWorldEvolutionUpdate(
                        worldContext,
                        openingWorldApi,
                        controller.signal,
                        worldExtraPrompt,
                        openingGameConfig.启用COT伪装注入 !== false ? 世界演变COT伪装历史消息提示词 : '',
                        构建世界演变COT提示词({ fandom: openingRuntimeFandomBundle.enabled }),
                        openingRuntimeFandomBundle.enabled,
                        openingGameConfig.独立APIGPT模式?.世界演变 === true,
                        开局世界演变非流式输出
                            ? undefined
                            : {
                                stream: true,
                                onDelta: (_delta: string, accumulated: string) => {
                                    if (controller.signal.aborted) return;
                                    设置开局世界演变进度({
                                        phase: 'start',
                                        text: '正在流式初始化动态世界...',
                                        rawText: accumulated
                                    });
                                }
                            }
                    );
                },
                onError: (errorText) => {
                    设置开局世界演变进度({
                        phase: 'error',
                        text: `${errorText || '动态世界初始化失败'}\n等待选择：重试当前阶段，或跳过继续。`
                    });
                },
                onSkip: (errorText) => {
                    设置开局世界演变进度({
                        phase: 'skipped',
                        text: `动态世界初始化失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                    });
                },
                getErrorText: (error: any) => error?.message || '动态世界初始化失败'
            });
            const worldStage = 开局后处理可并行 ? null : await 运行开局动态世界阶段();
            if (开局后处理可并行) {
                pendingOpeningWorldStage = 运行开局动态世界阶段();
            }
            const worldResult = worldStage?.result;
            if (worldStage?.completed && worldResult) {
                const worldInitCommands = 规范化世界演变命令列表(worldResult.commands as any);
                openingWorldInitUpdates = 整理客户可见世界大事(
                    Array.isArray(worldResult.updates)
                        ? worldResult.updates.map((item) => (item || '').trim()).filter(Boolean)
                        : [],
                    worldInitCommands
                );
                设置开局世界演变进度({
                    phase: worldInitCommands.length > 0 || openingWorldInitUpdates.length > 0
                        ? 'done'
                        : 'skipped',
                    text: (
                        worldInitCommands.length > 0 || openingWorldInitUpdates.length > 0
                            ? '动态世界初始化完成。'
                            : '动态世界初始化未产生更新。'
                    ),
                    rawText: worldResult.rawText,
                    commandTexts: 构建带索引命令文本(worldInitCommands)
                });
                if (worldInitCommands.length > 0) {
                    responseForExecution = {
                        ...responseForExecution,
                        tavern_commands: [
                            ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                            ...worldInitCommands
                        ]
                    };
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                }
            }
        } else {
            设置开局世界演变进度({
                phase: 'skipped',
                text: '动态世界接口未配置，已跳过。'
            });
        }

        // 代码兜底：确保开局地图层级正确初始化
        try {
            const envNow = simulatedOpeningState.环境;
            const existingLayers = Array.isArray((simulatedOpeningState.世界 as any)?.地图层级) ? [...(simulatedOpeningState.世界 as any).地图层级] : [];
            const layerNames = new Set(existingLayers.map((l: any) => l?.名称));
            const bigPlace = envNow?.大地点 || '未知大陆';
            let seq = existingLayers.length;
            const addLayer = (name: string, level: string, parentId: string) => {
                if (!name || layerNames.has(name)) return;
                seq += 1;
                existingLayers.push({ ID: `DT-${String(seq).padStart(3, '0')}`, 名称: name, 层级: level, 父级ID: parentId, 描述: '' });
                layerNames.add(name);
            };
            addLayer('诸天万界', '寰宇', '');
            addLayer(bigPlace, '大地点', '太古界');
            addLayer(envNow?.中地点 || '', '中地点', bigPlace);
            addLayer(envNow?.小地点 || '', '小地点', envNow?.中地点 || bigPlace);
            addLayer(envNow?.具体地点 || '', '区地点', envNow?.小地点 || envNow?.中地点 || bigPlace);
            if (existingLayers.length > (Array.isArray((simulatedOpeningState.世界 as any)?.地图层级) ? (simulatedOpeningState.世界 as any).地图层级.length : 0)) {
                simulatedOpeningState = {
                    ...simulatedOpeningState,
                    世界: { ...simulatedOpeningState.世界, 地图层级: existingLayers } as any,
                };
            }
        } catch (_) { /* 静默 */ }

        const 运行开局地图阶段 = () => {
            const mapBaseState = simulatedOpeningState;
            const mapBaseResponse = responseForExecution;
            const mapBaseAiData = aiData;
            return 执行可重试开局阶段({
                stageLabel: '开局地图更新',
                beforeAttempt: (attempt) => {
                    设置开局地图更新进度({
                        phase: 'start',
                        text: attempt > 1
                            ? `正在重新执行开局地图更新...（第 ${attempt} 次手动重试）`
                            : (开局后处理可并行 ? '正在根据开局正文与初始化变量更新地图...（与动态世界/规划分析并行）' : '正在根据开局正文与初始化变量更新地图...')
                    });
                },
                onAutoRetry: (attempt, maxAttempts, reason) => {
                    设置开局地图更新进度({
                        phase: 'start',
                        text: `开局地图更新请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                    });
                },
                run: async () => {
                    const mapContextResponse: GameResponse = {
                        ...mapBaseAiData,
                        tavern_commands: Array.isArray(mapBaseResponse.tavern_commands)
                            ? [...mapBaseResponse.tavern_commands]
                            : []
                    };
                    const result = await 生成地图更新({
                        mode: 'auto_incremental',
                        apiSettings: deps.apiConfig,
                        环境: mapBaseState.环境,
                        世界: mapBaseState.世界,
                        社交: mapBaseState.社交,
                        角色: mapBaseState.角色,
                        gameConfig: openingGameConfig,
                        worldbooks: deps.worldbooks,
                        currentResponse: mapContextResponse,
                        stateBase: mapBaseState,
                        signal: controller.signal,
                        onDelta: 开局地图更新非流式输出
                            ? undefined
                            : (_delta: string, accumulated: string) => {
                                if (controller.signal.aborted) return;
                                设置开局地图更新进度({
                                    phase: 'start',
                                    text: '正在流式更新开局地图...',
                                    rawText: accumulated
                                });
                            }
                    });
                    if (result.phase === 'error') {
                        throw new Error(result.statusText || '开局地图更新失败');
                    }
                    return result;
                },
                onError: (errorText) => {
                    设置开局地图更新进度({
                        phase: 'error',
                        text: `${errorText || '开局地图更新失败'}\n等待选择：重试当前阶段，或跳过继续。`
                    });
                },
                onSkip: (errorText) => {
                    设置开局地图更新进度({
                        phase: 'skipped',
                        text: `开局地图更新失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                    });
                },
                getErrorText: (error: any) => error?.message || '开局地图更新失败'
            });
        };
        if (!mapGenerationEnabled) {
            openingMapProgressSettled = true;
            设置开局地图更新进度({
                phase: 'skipped',
                text: '地图生成功能未开启，已跳过开局地图更新。'
            });
        } else if (!接口配置是否可用(openingMapApi)) {
            openingMapProgressSettled = true;
            设置开局地图更新进度({
                phase: 'skipped',
                text: '地图更新独立链路未启用，已跳过。'
            });
        } else if (开局后处理可并行) {
            pendingOpeningMapStage = 运行开局地图阶段();
        }

        if (!planningFeatureEnabled) {
            设置开局规划进度({
                phase: 'skipped',
                text: '规划分析功能未开启，已跳过。'
            });
        } else if (接口配置是否可用(openingPlanningApi)) {
            const planningStage = await 执行可重试开局阶段({
                stageLabel: '开局规划分析',
                forceAutoRetry: true,
                beforeAttempt: (attempt) => {
                    设置开局规划进度({
                        phase: 'start',
                        text: attempt > 1
                            ? `正在重新初始化剧情与规划...（第 ${attempt} 次手动重试）`
                            : (开局后处理可并行 ? '正在初始化剧情与规划...（与动态世界/地图更新并行）' : '正在初始化剧情与规划...')
                    });
                },
                onAutoRetry: (attempt, maxAttempts, reason) => {
                    设置开局规划进度({
                        phase: 'start',
                        text: `开局规划请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                    });
                },
                run: async () => {
                    const heroineEnabled = options?.开局配置?.启用女主剧情规划 !== undefined
                        ? options.开局配置.启用女主剧情规划 === true
                        : openingGameConfig.启用女主剧情规划 === true;
                    const fandomEnabled = openingRuntimeFandomBundle.enabled;
                    const activeStoryPlan = fandomEnabled
                        ? deps.规范化同人剧情规划状态(simulatedOpeningState.同人剧情规划)
                        : deps.规范化剧情规划状态(simulatedOpeningState.剧情规划);
                    const activeHeroinePlan = heroineEnabled
                        ? (
                            fandomEnabled
                                ? deps.规范化同人女主剧情规划状态(simulatedOpeningState.同人女主剧情规划)
                                : deps.规范化女主剧情规划状态(simulatedOpeningState.女主剧情规划)
                        )
                        : undefined;
                    const activeStoryPlanTargets = fandomEnabled
                        ? ['同人剧情规划', 'gameState.同人剧情规划']
                        : ['剧情规划', 'gameState.剧情规划'];
                    const activeHeroinePlanTargets = fandomEnabled
                        ? ['同人女主剧情规划', 'gameState.同人女主剧情规划']
                        : ['女主剧情规划', 'gameState.女主剧情规划'];
                    const planningRecentBodiesText = 构建开局规划初始化正文上下文({
                        openingBodyText,
                        openingPlanText,
                        currentGameTime: 环境时间转标准串(simulatedOpeningState.环境) || '未知时间'
                    });
                    const planningAuditFocusText = 构建开局规划初始化审计重点({
                        fandomEnabled: openingRuntimeFandomBundle.enabled,
                        heroineEnabled
                    });
                    const planningWorldbookExtra = 按功能开关过滤提示词内容(构建世界书注入文本({
                        books: deps.worldbooks,
                        scopes: heroineEnabled ? ['story_plan', 'heroine_plan'] : ['story_plan'],
                        environment: simulatedOpeningState.环境,
                        social: simulatedOpeningState.社交,
                        world: simulatedOpeningState.世界,
                        history: [],
                        extraTexts: [openingBodyText, openingPlanText]
                    }).combinedText, openingGameConfig);
                    const planningNovelDecompositionPrompt = await 获取激活小说拆分注入文本(
                        deps.apiConfig,
                        'planning',
                        options?.开局配置,
                        simulatedOpeningState.剧情,
                        simulatedOpeningState.角色?.姓名 || deps.角色?.姓名 || ''
                    );
                    const genderRatioConstraintText = 构建规划性别比例约束摘要(
                        options?.开局配置?.modeRuntimeProfile?.npc?.genderRatio,
                        simulatedOpeningState.世界?.性别比例,
                        解析当前有效性别比例(simulatedOpeningState.环境, simulatedOpeningState.世界?.地图层级, simulatedOpeningState.世界?.性别比例, options?.开局配置?.modeRuntimeProfile?.npc?.genderRatio)
                    );
                    const planningExtraPrompt = [
                        开局规划初始化附加提示词,
                        planningWorldbookExtra,
                        按功能开关过滤提示词内容(planningNovelDecompositionPrompt, openingGameConfig),
                        按功能开关过滤提示词内容(openingRuntimeFandomBundle.同人设定摘要, openingGameConfig),
                        启用修炼体系 ? openingRuntimeFandomBundle.境界母板补丁 : '',
                        openingTraditionalChinesePrompt
                    ]
                        .filter(Boolean)
                        .join('\n\n');
                    const planningTimeouts = 获取游玩请求超时毫秒(openingGameConfig.游玩请求超时设置);
                    const planningResult = await 执行开局规划带超时(controller.signal, (signal) => textAIService.generatePlanningAnalysis({
                        playerName: (simulatedOpeningState.角色?.姓名 || deps.角色?.姓名 || '').trim() || '未命名',
                        currentStoryJson: JSON.stringify(裁剪修炼体系上下文数据({
                            剧情: simulatedOpeningState.剧情 || {},
                            [fandomEnabled ? '同人剧情规划' : '剧情规划']: activeStoryPlan || {}
                        }, openingGameConfig), null, 2),
                        currentHeroinePlanJson: JSON.stringify(裁剪修炼体系上下文数据(
                            heroineEnabled
                                ? { [fandomEnabled ? '同人女主剧情规划' : '女主剧情规划']: activeHeroinePlan || {} }
                                : {},
                            openingGameConfig
                        ), null, 2),
                        worldJson: JSON.stringify(裁剪修炼体系上下文数据(simulatedOpeningState.世界 || {}, openingGameConfig), null, 2),
                        socialJson: JSON.stringify(裁剪修炼体系上下文数据(simulatedOpeningState.社交 || [], openingGameConfig), null, 2),
                        envJson: JSON.stringify(裁剪修炼体系上下文数据(simulatedOpeningState.环境 || {}, openingGameConfig), null, 2),
                        recentBodiesText: planningRecentBodiesText,
                        currentPlanText: openingPlanText,
                        auditFocusText: planningAuditFocusText,
                        genderRatioConstraintText,
                        heroineEnabled,
                        ntlEnabled: openingGameConfig.剧情风格 === 'NTL后宫',
                        fandomEnabled,
                        extraPrompt: planningExtraPrompt,
                        gptMode: openingGameConfig.独立APIGPT模式?.规划分析 === true
                    }, openingPlanningApi, signal, 开局规划分析非流式输出
                        ? undefined
                        : {
                            stream: true,
                            onDelta: (_delta: string, accumulated: string) => {
                                if (controller.signal.aborted) return;
                                设置开局规划进度({
                                    phase: 'start',
                                    text: '正在流式初始化剧情规划...',
                                    rawText: accumulated
                                });
                            }
                        }), planningTimeouts.firstResponseMs);
                    const planningCommands = [
                        ...过滤规划补丁命令(planningResult.commands, ['剧情', 'gameState.剧情']),
                        ...过滤规划补丁命令(planningResult.commands, activeStoryPlanTargets),
                        ...(heroineEnabled
                            ? 过滤规划补丁命令(planningResult.commands, activeHeroinePlanTargets)
                            : [])
                    ];
                    return {
                        planningResult,
                        planningCommands
                    };
                },
                onError: (errorText) => {
                    设置开局规划进度({
                        phase: 'error',
                        text: `${errorText || '剧情规划初始化失败'}\n等待选择：重试当前阶段，或跳过继续。`
                    });
                },
                onSkip: (errorText) => {
                    设置开局规划进度({
                        phase: 'skipped',
                        text: `剧情规划初始化失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                    });
                },
                getErrorText: (error: any) => error?.message || '剧情规划初始化失败'
            });
            const planningStageResult = planningStage.result;
            if (planningStage?.completed && planningStageResult) {
                const { planningResult, planningCommands } = planningStageResult;
                设置开局规划进度({
                    phase: planningResult.shouldUpdate && planningCommands.length > 0 ? 'done' : 'skipped',
                    text: planningResult.shouldUpdate && planningCommands.length > 0
                        ? '剧情规划初始化完成。'
                        : '剧情规划初始化未产生更新。',
                    rawText: typeof planningResult?.rawText === 'string' ? planningResult.rawText : '',
                    commandTexts: 构建带索引命令文本(planningCommands)
                });
                if (planningResult.shouldUpdate && planningCommands.length > 0) {
                    responseForExecution = {
                        ...responseForExecution,
                        tavern_commands: [
                            ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                            ...planningCommands
                        ]
                    };
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                }
            }
        } else {
            设置开局规划进度({
                phase: 'skipped',
                text: '规划分析独立链路未启用，已跳过。'
            });
        }

        if (pendingOpeningWorldStage) {
            const worldStage = await pendingOpeningWorldStage;
            const worldResult = worldStage?.result;
            if (worldStage?.completed && worldResult) {
                const worldInitCommands = 规范化世界演变命令列表(worldResult.commands as any);
                openingWorldInitUpdates = 整理客户可见世界大事(
                    Array.isArray(worldResult.updates)
                        ? worldResult.updates.map((item) => (item || '').trim()).filter(Boolean)
                        : [],
                    worldInitCommands
                );
                设置开局世界演变进度({
                    phase: worldInitCommands.length > 0 || openingWorldInitUpdates.length > 0
                        ? 'done'
                        : 'skipped',
                    text: (
                        worldInitCommands.length > 0 || openingWorldInitUpdates.length > 0
                            ? '动态世界初始化完成。'
                            : '动态世界初始化未产生更新。'
                    ),
                    rawText: worldResult.rawText,
                    commandTexts: 构建带索引命令文本(worldInitCommands)
                });
                if (worldInitCommands.length > 0) {
                    responseForExecution = {
                        ...responseForExecution,
                        tavern_commands: [
                            ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                            ...worldInitCommands
                        ]
                    };
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                }
            }
        }

        if (!openingMapProgressSettled) {
            const mapStage = pendingOpeningMapStage
                ? await pendingOpeningMapStage
                : await 运行开局地图阶段();
            const mapResult = mapStage.result;
            if (mapStage?.completed && mapResult) {
                const mapCommands = Array.isArray(mapResult.commands) ? mapResult.commands : [];
                const mapStartIndex = (Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0) + 1;
                设置开局地图更新进度({
                    phase: mapResult.phase,
                    text: mapResult.statusText || (mapCommands.length > 0 ? '开局地图更新完成。' : '开局地图无需更新。'),
                    rawText: mapResult.rawText,
                    commandTexts: 构建带索引命令文本(mapCommands, mapStartIndex)
                });
                if (mapCommands.length > 0) {
                    responseForExecution = {
                        ...responseForExecution,
                        tavern_commands: [
                            ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                            ...mapCommands
                        ]
                    };
                    simulatedOpeningState = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState, { applyState: false }));
                }
            }
        }

        const displayAiData: GameResponse = {
            ...aiData,
            logs: Array.isArray(responseForExecution.logs) ? [...responseForExecution.logs] : aiData.logs,
            tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
        };
        const openingStateAfterCommands = 保护开局门派(deps.processResponseCommands(responseForExecution, commandBaseState));
        openingStateAfterCommands.社交 = 修复开局伙伴社交列表(
            openingStateAfterCommands.社交,
            options?.开局配置,
            openingStateAfterCommands.角色 || commandBaseState.角色
        );
        // 修复开局伙伴社交列表可能补入 AI 尚未生成的种子伙伴（位置为空），
        // 这里再同步一次：把没有显式位置的在场 NPC 的 当前位置/位置路径 用当前环境地点填充，
        // 确保开局伙伴能正确显示在地图上（地图显示由社交 NPC 位置字段驱动）。
        openingStateAfterCommands.社交 = 同步在场NPC当前位置(openingStateAfterCommands.社交, openingStateAfterCommands.环境);
        const openingNewNpcList = deps.提取新增NPC列表(commandBaseState.社交, openingStateAfterCommands.社交);
        const hasOpeningCommands = Array.isArray(responseForExecution?.tavern_commands) && responseForExecution.tavern_commands.length > 0;
        if (!hasOpeningCommands) {
            deps.设置角色(deps.规范化角色物品容器映射(openingStateAfterCommands.角色, {
                启用饱腹口渴系统: openingGameConfig.启用饱腹口渴系统,
                题材模式: options?.开局配置?.题材模式
            }));
            deps.设置环境(deps.规范化环境信息(openingStateAfterCommands.环境));
            deps.设置世界(deps.规范化世界状态(openingStateAfterCommands.世界));
            deps.设置战斗(deps.规范化战斗状态(openingStateAfterCommands.战斗));
            deps.设置剧情(deps.规范化剧情状态(openingStateAfterCommands.剧情, openingStateAfterCommands.环境));
            deps.设置剧情规划(deps.规范化剧情规划状态(openingStateAfterCommands.剧情规划));
            deps.设置女主剧情规划(deps.规范化女主剧情规划状态(openingStateAfterCommands.女主剧情规划));
            deps.设置同人剧情规划(deps.规范化同人剧情规划状态(openingStateAfterCommands.同人剧情规划));
            deps.设置同人女主剧情规划(deps.规范化同人女主剧情规划状态(openingStateAfterCommands.同人女主剧情规划));
        }
        deps.设置社交(deps.规范化社交列表(openingStateAfterCommands.社交));
        const opening命令后门派 = deps.规范化门派状态(openingStateAfterCommands.玩家门派);
        const opening命令后任务 = Array.isArray(openingStateAfterCommands.任务列表)
            ? openingStateAfterCommands.任务列表
            : [];
        const opening命令后约定 = Array.isArray(openingStateAfterCommands.约定列表)
            ? openingStateAfterCommands.约定列表
            : [];
        deps.设置玩家门派(opening命令后门派);
        deps.设置任务列表(opening命令后任务);
        deps.设置约定列表(opening命令后约定);
        deps.setWorldEvents(openingWorldInitUpdates.slice(0, 30));

        const openingCanonicalTime = 环境时间转标准串(openingStateAfterCommands?.环境);
        const openingTime = openingCanonicalTime
            || 环境时间转标准串(contextData?.环境)
            || '未知时间';
        const openingStoryAfterCalibration = await 同步剧情小说分解时间校准({
            nextStory: deps.规范化剧情状态(openingStateAfterCommands.剧情, openingStateAfterCommands.环境),
            currentGameTime: openingTime,
            openingConfig: options?.开局配置,
            allowBootstrapCurrentGroup: true
        });
        if (openingCanonicalTime) {
            deps.设置游戏初始时间(openingCanonicalTime);
        }
        deps.设置剧情(openingStoryAfterCalibration);
        const openingFreshMemory: 记忆系统结构 = {
            回忆档案: [],
            即时记忆: [],
            短期记忆: [],
            中期记忆: [],
            长期记忆: []
        };

        const openingImmediateEntry = 构建即时记忆条目(openingTime, '', displayAiData, { 省略玩家输入: true });
        const openingShortEntry = 构建短期记忆条目(openingTime, displayAiData);
        const openingMemoryConfig = 规范化记忆配置(deps.memoryConfig);
        const openingAiTimestamp = Date.now();
        const openingMemoryAfterWrite = 写入四段记忆(
            规范化记忆系统(openingFreshMemory),
            openingImmediateEntry,
            openingShortEntry,
            {
                immediateLimit: openingMemoryConfig.即时消息上传条数N,
                shortLimit: openingMemoryConfig.短期记忆阈值,
                midLimit: openingMemoryConfig.中期记忆阈值,
                recordTime: openingTime,
                timestamp: openingTime
            }
        );
        deps.应用并同步记忆系统(openingMemoryAfterWrite);

        const newAiMsg: 聊天记录结构 = {
            role: 'assistant',
            content: 'Opening Story',
            structuredResponse: displayAiData,
            rawJson: deps.获取原始AI消息(aiResult.rawText),
            timestamp: openingAiTimestamp,
            gameTime: openingTime,
            inputTokens: openingInputTokens,
            responseDurationSec: deps.计算回复耗时秒(openingRequestStartedAt, openingAiTimestamp),
            outputTokens: deps.估算AI输出Token(deps.获取原始AI消息(aiResult.rawText), apiForOpening?.model)
        };
        if (useStreaming) {
            deps.设置历史记录(prev => prev.map(item => {
                if (
                    item.timestamp === streamMarker &&
                    item.role === 'assistant'
                ) {
                    return { ...newAiMsg };
                }
                return item;
            }));
        } else {
            deps.设置历史记录([...initialHistory, newAiMsg]);
        }
        deps.记录变量生成上下文({
            playerInput: '',
            response: displayAiData
        });

        const openingNpcImageTargets = Array.isArray(openingStateAfterCommands.社交)
            ? openingStateAfterCommands.社交
            : openingNewNpcList;
        if (openingNpcImageTargets.length > 0) {
            尽早触发开局NPC生图({ 社交: openingNpcImageTargets });
        }

        if (openingBodyText.trim()) {
            deps.触发场景自动生图({
                response: displayAiData,
                bodyText: openingBodyText,
                env: openingStateAfterCommands.环境,
                turnNumber: 0,
                playerInput: '',
                source: 'auto',
                autoApply: true
            });
        }

        const opening玩家门派 = deps.规范化门派状态(openingStateAfterCommands.玩家门派);
        const opening任务列表 = Array.isArray(openingStateAfterCommands.任务列表)
            ? openingStateAfterCommands.任务列表
            : [];
        const opening约定列表 = Array.isArray(openingStateAfterCommands.约定列表)
            ? openingStateAfterCommands.约定列表
            : [];
        void deps.performAutoSave({
            history: [...initialHistory, newAiMsg],
            role: openingStateAfterCommands.角色,
            env: openingStateAfterCommands.环境,
            social: openingStateAfterCommands.社交,
            world: openingStateAfterCommands.世界,
            battle: openingStateAfterCommands.战斗,
            sect: opening玩家门派,
            tasks: opening任务列表,
            agreements: opening约定列表,
            story: openingStoryAfterCalibration,
            storyPlan: openingStateAfterCommands.剧情规划,
            heroinePlan: openingStateAfterCommands.女主剧情规划,
            fandomStoryPlan: openingStateAfterCommands.同人剧情规划,
            fandomHeroinePlan: openingStateAfterCommands.同人女主剧情规划,
            memory: openingMemoryAfterWrite,
            openingConfig: options?.开局配置
        });
        void 安全触发开局主角自动生图(deps.触发主角自动生图, openingStateAfterCommands.角色, '主角开局最终生图补发');
    } catch (e: any) {
        if (openingStreamHeartbeat) clearInterval(openingStreamHeartbeat);
        deps.设置开局主剧情进度({
            phase: 'error',
            text: e?.message || '主剧情生成失败。',
            rawText: typeof e?.rawText === 'string' ? e.rawText : ''
        });
        if (e?.name === 'AbortError') {
            deps.设置历史记录(initialHistory);
            throw e;
        }
        if (e instanceof textAIService.StoryResponseParseError || e?.name === 'StoryResponseParseError') {
            const parseErrorRaw = deps.提取解析失败原始信息(e);
            const parseErrorRawText = typeof e?.rawText === 'string' ? e.rawText : '';
            const parseErrorWithHint = 构建标签缺失补充提示({
                parseErrorDetail: parseErrorRaw,
                apiConfig: apiForOpening
            });
            const parseErrorTime = 环境时间转标准串(openingEnv)
                || 环境时间转标准串(contextData?.环境)
                || '未知时间';
            recordAiParseFailureDiagnostic({
                stage: 'opening_story',
                error: e,
                rawText: parseErrorRawText,
                apiConfig: apiForOpening,
                streaming: useStreaming,
                validateTagCompleteness: 规范化游戏设置(deps.gameConfig).启用标签检测完整性 === true,
                enableTagRepair: 规范化游戏设置(deps.gameConfig).启用标签修复 !== false,
                requireActionOptionsTag: 规范化游戏设置(deps.gameConfig).启用行动选项 !== false,
                inputTokens: openingInputTokens,
                outputTokens: deps.估算AI输出Token(parseErrorRawText, apiForOpening?.model),
                gameTime: parseErrorTime
            });
            if (deps.游戏设置启用自动重试(规范化游戏设置(deps.gameConfig))) {
                const failureText = `[开局生成失败] ${parseErrorWithHint}\n自动重试次数已耗尽，可使用快速重开再次尝试。`;
                if (useStreaming) {
                    deps.设置历史记录(prev => ([
                        ...deps.替换流式草稿为失败提示(prev, parseErrorWithHint),
                        {
                            role: 'system',
                            content: failureText,
                            timestamp: Date.now() + 1
                        }
                    ]));
                } else {
                    deps.设置历史记录([
                        ...initialHistory,
                        {
                            role: 'system',
                            content: failureText,
                            timestamp: Date.now()
                        }
                    ]);
                }
                return;
            }
            const parseFailureResponse: GameResponse = {
                logs: [
                    { sender: '旁白', text: `【开局解析失败】${parseErrorWithHint}` },
                    { sender: '旁白', text: '可点击本回合右上角“查看/编辑原文”，修复后保存重解析。' }
                ]
            };
            const parseFailureAiMsg: 聊天记录结构 = {
                role: 'assistant',
                content: 'Opening Parse Failed',
                structuredResponse: parseFailureResponse,
                rawJson: parseErrorRawText || parseErrorRaw,
                timestamp: Date.now(),
                gameTime: parseErrorTime,
                inputTokens: openingInputTokens,
                responseDurationSec: deps.计算回复耗时秒(openingRequestStartedAt),
                outputTokens: deps.估算AI输出Token(parseErrorRawText, apiForOpening?.model)
            };
            const parseFailureSystemMsg: 聊天记录结构 = {
                role: 'system',
                content: `[开局生成失败] ${parseErrorWithHint}\n可编辑原文重解析，或使用快速重开重试。`,
                timestamp: Date.now() + 1
            };
            if (useStreaming) {
                deps.设置历史记录(prev => {
                    let replaced = false;
                    const patched = prev.map(item => {
                        if (
                            item.timestamp === streamMarker &&
                            item.role === 'assistant' &&
                            !item.structuredResponse
                        ) {
                            replaced = true;
                            return parseFailureAiMsg;
                        }
                        return item;
                    });
                    const withAi = replaced ? patched : [...patched, parseFailureAiMsg];
                    return [...withAi, parseFailureSystemMsg];
                });
            } else {
                deps.设置历史记录([...initialHistory, parseFailureAiMsg, parseFailureSystemMsg]);
            }
            return;
        }
        console.error('Story Gen Failed', e);
        throw e;
    } finally {
        if (openingStreamHeartbeat) clearInterval(openingStreamHeartbeat);
        deps.abortControllerRef.current = null;
    }
};
