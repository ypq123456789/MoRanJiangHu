import {
    角色数据结构,
    聊天记录结构,
    提示词结构,
    游戏设置结构,
    OpeningConfig
} from '../../types';
import { 默认COT伪装历史消息提示词 } from '../../prompts/runtime/defaults';
import { 核心_思维链, 核心_思维链_同人版 } from '../../prompts/core/cot';
import {
    核心_思维链_女主规划版,
    核心_思维链_NTL女主规划版,
    核心_思维链_同人女主规划版,
    核心_思维链_同人NTL女主规划版
} from '../../prompts/core/cotHeroine';
import { 写作_防止说话 } from '../../prompts/writing/noControl';
import { 获取酒馆预设顺序 } from '../../utils/tavernPreset';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';
import { 提取响应规划文本 } from './thinkingContext';
import { 变量命令提示词ID集合 } from '../../prompts/runtime/promptOwnership';

type 消息角色 = 'system' | 'user' | 'assistant';
type 内部消息来源 = 'preset' | 'worldbook' | 'history' | 'latest_input' | 'persona';

type 内部酒馆消息 = {
    role: 消息角色;
    content: string;
    source: 内部消息来源;
};

export type 酒馆消息 = {
    role: 消息角色;
    content: string;
};

export type 酒馆上下文结构 = {
    shortMemoryContext: string;
    contextPieces: {
        worldPrompt: string;
        地图建筑状态: string;
        同人设定摘要: string;
        境界体系提示词: string;
        otherPrompts: string;
        难度设置提示词: string;
        叙事人称提示词: string;
        字数设置提示词: string;
        COT提示词: string;
        格式提示词: string;
        离场NPC档案: string;
        长期记忆: string;
        中期记忆: string;
        在场NPC档案: string;
        剧情安排: string;
        女主剧情规划状态: string;
        世界状态: string;
        环境状态: string;
        角色状态: string;
        战斗状态: string;
        门派状态: string;
        任务状态: string;
        约定状态: string;
    };
};

export type 运行时提示词构建结果 = {
    promptPool: 提示词结构[];
    selectedCotPromptIds: string[];
};

const COT_PROMPT_SOURCE_MAP: Record<string, 提示词结构> = {
    [核心_思维链.id]: 核心_思维链,
    [核心_思维链_同人版.id]: 核心_思维链_同人版,
    [核心_思维链_女主规划版.id]: 核心_思维链_女主规划版,
    [核心_思维链_NTL女主规划版.id]: 核心_思维链_NTL女主规划版,
    [核心_思维链_同人女主规划版.id]: 核心_思维链_同人女主规划版,
    [核心_思维链_同人NTL女主规划版.id]: 核心_思维链_同人NTL女主规划版
};

const COT_PROMPT_IDS = new Set(Object.keys(COT_PROMPT_SOURCE_MAP));
const 生理系统关键词正则 = /(饱腹|口渴|水分|饥饿|脱水)/;
const 修炼体系禁用时移除提示词ID = new Set(['core_realm', 'stat_kungfu', 'stat_cultivation']);
const 主剧情剥离提示词ID = new Set([
    'core_story',
    'core_heroine_plan',
    'core_heroine_plan_ntl',
    'core_heroine_plan_cot',
    'core_heroine_plan_cot_ntl',
    ...变量命令提示词ID集合
]);
const NoControl关联整行规则 = [
    /^\s*-\s*若同时存在\s*`?<NoControl>`?.*$/u,
    /^\s*-\s*复核\s*`?<NoControl>`?.*$/u,
    /^.*It never overrides NoControl,.*$/u
];

const 获取提示词源 = (promptPool: 提示词结构[], id: string, fallback: 提示词结构): 提示词结构 => {
    return promptPool.find((item) => item.id === id) || fallback;
};

const 替换或注入提示词 = (
    promptPool: 提示词结构[],
    prompt: 提示词结构,
    enabled: boolean
): 提示词结构[] => {
    const nextPrompt = { ...prompt, 启用: enabled };
    const exists = promptPool.some((item) => item.id === prompt.id);
    if (!exists) return [...promptPool, nextPrompt];
    return promptPool.map((item) => item.id === prompt.id ? { ...item, 启用: enabled } : item);
};

export const 剥离NoControl关联提示词 = (content: string): string => (
    (content || '')
        .split('\n')
        .filter((line) => !NoControl关联整行规则.some((rule) => rule.test(line)))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

const 剥离主剧情世界命令_COT = (content: string): string => {
    if (!content) return '';
    let out = content;
    out = out.replace(/\n\s*-\s*`(?:gameState\.)?世界`\s*/g, '\n');
    out = out.replace(/\n### 1\.5\)\s*世界动态演进预检[\s\S]*?(?=\n### 1\.6\))/g, '\n');
    out = out.replace(/\n\s*###\s*1\.5\)\s*世界动态演进预检[^\n]*/g, '\n');
    out = out.replace(/\n\s*-\s*世界动态[^\n]*/g, '\n');
    out = out.replace(/\n\s*-\s*结构化存储是否正确：`(?:gameState\.)?世界`[^\n]*/g, '\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
};

const 剥离主剧情世界命令_格式 = (content: string): string => {
    if (!content) return '';
    let out = content;
    out = out.replace(/\n□ 世界事件维护：[\s\S]*?(?=\n\n---)/g, '\n');
    out = out.replace(/\n\s*-\s*`(?:gameState\.)?世界[^\n]*/g, '\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
};

const 同人模式已启用 = (openingConfig?: OpeningConfig | null): boolean => {
    const title = typeof openingConfig?.同人融合?.作品名 === 'string'
        ? openingConfig.同人融合.作品名.trim()
        : '';
    return openingConfig?.同人融合?.enabled === true && title.length > 0;
};

const 选择剧情COT提示词ID = (
    config: 游戏设置结构,
    options?: { openingConfig?: OpeningConfig | null }
): string => {
    const heroineEnabled = config?.启用女主剧情规划 === true;
    const ntlEnabled = heroineEnabled && config?.剧情风格 === 'NTL后宫';
    const fandomEnabled = 同人模式已启用(options?.openingConfig);

    if (fandomEnabled && heroineEnabled) {
        return ntlEnabled
            ? 核心_思维链_同人NTL女主规划版.id
            : 核心_思维链_同人女主规划版.id;
    }
    if (fandomEnabled) {
        return 核心_思维链_同人版.id;
    }
    if (heroineEnabled) {
        return ntlEnabled
            ? 核心_思维链_NTL女主规划版.id
            : 核心_思维链_女主规划版.id;
    }
    return 核心_思维链.id;
};

const 提取AI身份名称 = (aiRoleDeclaration: string): string => {
    const source = typeof aiRoleDeclaration === 'string' ? aiRoleDeclaration : '';
    if (!source.trim()) return 'AI';
    const patterns = [
        /你是[“"'`]?([^”"'`\n]{1,80})[”"'`]?/u,
        /以[“"'`]?([^”"'`\n]{1,80})[”"'`]?的身份回复/u
    ];
    for (const pattern of patterns) {
        const matched = source.match(pattern);
        const candidate = matched?.[1]?.trim();
        if (candidate) return candidate;
    }
    return 'AI';
};

export const 构建COT伪装提示词 = (
    config: 游戏设置结构,
    aiRoleDeclaration?: string
): string => {
    const template = 默认COT伪装历史消息提示词.trim();
    const aiIdentity = 提取AI身份名称(aiRoleDeclaration || '');
    const withIdentity = template.replace(/<AI身份名称占位>/g, aiIdentity);
    if (config?.启用行动选项 !== false) {
        const baseLine = '好的，将以<正文></正文>包裹正文，<正文>前以<thinking>作为开头进行思考并以</thinking>闭合：';
        const actionRequiredLine = '好的，将以<正文></正文>包裹正文，并且本次会在<短期记忆>、<变量规划>、<剧情规划>等回合标签之后输出<行动选项></行动选项>，<正文>前以<thinking>作为开头进行思考并以</thinking>闭合：';
        return withIdentity.includes(baseLine)
            ? withIdentity.replace(baseLine, actionRequiredLine)
            : `${withIdentity}\n${actionRequiredLine}`;
    }
    return withIdentity;
};

export const 酒馆预设模式可用 = (config: 游戏设置结构): boolean => {
    if (config?.启用酒馆预设模式 !== true) return false;
    const preset = config?.酒馆预设;
    return Boolean(
        preset
        && Array.isArray(preset.prompts)
        && preset.prompts.length > 0
        && Array.isArray(preset.prompt_order)
        && preset.prompt_order.length > 0
    );
};

export const 规范化比较文本 = (text: string): string => (text || '').replace(/\s+/g, ' ').trim();

const 从复合提示词中剥离子块 = (composed: string, block: string): string => {
    const source = typeof composed === 'string' ? composed : '';
    const target = typeof block === 'string' ? block : '';
    if (!source.trim() || !target.trim()) return source.trim();
    const normalizedTarget = 规范化比较文本(target);
    return source
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter((item) => item && 规范化比较文本(item) !== normalizedTarget)
        .join('\n\n');
};

const 匹配酒馆COT占位符 = (content: string): boolean => (
    /\{\{\s*cot\s*\}\}/i.test(typeof content === 'string' ? content : '')
);

const 匹配酒馆格式占位符 = (content: string): boolean => (
    /\{\{\s*格式\s*\}\}/i.test(typeof content === 'string' ? content : '')
    || /\{\{\s*format\s*\}\}/i.test(typeof content === 'string' ? content : '')
);

const 构建酒馆世界书文本 = (
    contextPieces: 酒馆上下文结构['contextPieces'],
    shortMemoryContext: string,
    options?: {
        包含COT提示词?: boolean;
        其他提示词覆盖?: string;
        COT提示词覆盖?: string;
        剧情安排后附加文本?: string;
    }
): string => {
    const otherPrompts = typeof options?.其他提示词覆盖 === 'string'
        ? options.其他提示词覆盖
        : contextPieces.otherPrompts;
    const includeCot = options?.包含COT提示词 !== false;
    const cotPrompt = typeof options?.COT提示词覆盖 === 'string' && options.COT提示词覆盖.trim()
        ? options.COT提示词覆盖.trim()
        : contextPieces.COT提示词;
    const storyAppend = typeof options?.剧情安排后附加文本 === 'string'
        ? options.剧情安排后附加文本.trim()
        : '';
    return [
        contextPieces.worldPrompt,
        contextPieces.地图建筑状态,
        contextPieces.同人设定摘要,
        contextPieces.境界体系提示词,
        contextPieces.离场NPC档案,
        otherPrompts,
        contextPieces.难度设置提示词,
        contextPieces.叙事人称提示词,
        contextPieces.字数设置提示词,
        contextPieces.长期记忆,
        contextPieces.中期记忆,
        contextPieces.剧情安排,
        storyAppend,
        contextPieces.在场NPC档案,
        contextPieces.女主剧情规划状态,
        contextPieces.世界状态,
        contextPieces.环境状态,
        contextPieces.角色状态,
        contextPieces.战斗状态,
        contextPieces.门派状态,
        contextPieces.任务状态,
        contextPieces.约定状态,
        shortMemoryContext,
        includeCot ? cotPrompt : ''
    ]
        .filter((item) => (item || '').trim().length > 0)
        .join('\n\n');
};

const 酒馆占位历史标题集合 = new Set(['Structured Response', 'Opening Story']);

const 序列化酒馆正文行 = (sender: unknown, text: unknown): string => {
    const normalizedSender = typeof sender === 'string' ? sender.trim() : '';
    const normalizedText = typeof text === 'string' ? text : '';
    if (!normalizedSender) return normalizedText;
    const normalizedTag = /^【[^】]+】$/.test(normalizedSender)
        ? normalizedSender
        : `【${normalizedSender}】`;
    return `${normalizedTag}${normalizedText}`;
};

const 提取酒馆聊天记录内容 = (
    item: 聊天记录结构,
    options?: { includePlan?: boolean }
): string => {
    const timePrefix = item?.gameTime ? `【${item.gameTime}】\n` : '';
    if (item?.role === 'user') {
        const userText = typeof item?.content === 'string' ? item.content.trim() : '';
        return userText ? `${timePrefix}玩家：${userText}` : '';
    }

    if (item?.role === 'assistant' && item?.structuredResponse) {
        const bodyLogs = Array.isArray(item.structuredResponse?.body_original_logs)
            ? item.structuredResponse.body_original_logs
            : [];
        const normalizedLogs = bodyLogs.length > 0
            ? bodyLogs
            : (Array.isArray(item.structuredResponse?.logs) ? item.structuredResponse.logs : []);
        const reconstructed = normalizedLogs
            .map((log: any) => 序列化酒馆正文行(log?.sender, log?.text))
            .filter((line) => line.trim().length > 0)
            .join('\n')
            .trim();
        const planText = options?.includePlan === true
            ? 提取响应规划文本(item.structuredResponse)
            : '';
        const sections = [
            reconstructed,
            planText ? `【上回合AI剧情规划】\n<剧情规划>\n${planText}\n</剧情规划>` : ''
        ].filter((section) => section.trim().length > 0);
        if (sections.length > 0) return `${timePrefix}${sections.join('\n')}`.trim();
    }

    const rawContent = typeof item?.content === 'string' ? item.content.trim() : '';
    if (!rawContent || 酒馆占位历史标题集合.has(rawContent)) return '';
    return `${timePrefix}${rawContent}`.trim();
};

const 构建酒馆聊天历史消息 = (
    chatHistory: 聊天记录结构[]
): Array<{ role: 'user' | 'assistant'; content: string }> => {
    const history = Array.isArray(chatHistory) ? chatHistory : [];
    const lastPlannableIndex = history.reduce((lastIndex, item, index) => (
        item?.role === 'assistant' && item?.structuredResponse ? index : lastIndex
    ), -1);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    history.forEach((item, index) => {
        if (item?.role !== 'user' && item?.role !== 'assistant') return;
        const content = 提取酒馆聊天记录内容(item, {
            includePlan: index === lastPlannableIndex
        });
        if (!content.length) return;
        messages.push({
            role: item.role as 'user' | 'assistant',
            content
        });
    });

    return messages;
};

const 提取玩家身份 = (
    playerRole?: 角色数据结构 | null,
    options?: { includeRealm?: boolean }
): string => {
    if (!playerRole) return '';
    const title = typeof playerRole?.称号 === 'string' ? playerRole.称号.trim() : '';
    const realm = options?.includeRealm === false
        ? ''
        : (typeof playerRole?.境界 === 'string' ? playerRole.境界.trim() : '');
    const sect = typeof playerRole?.门派职位 === 'string' ? playerRole.门派职位.trim() : '';
    return [title, realm, sect].filter(Boolean).join(' / ');
};

const 构建玩家设定文本 = (params: {
    playerName?: string;
    playerAge?: string;
    playerBirthday?: string;
    playerAppearance?: string;
    playerIdentity?: string;
}): string => {
    const playerName = (params.playerName || '').trim();
    const ageBirthday = (() => {
        const age = (params.playerAge || '').trim();
        const birthday = (params.playerBirthday || '').trim();
        if (age && birthday) return `${age}岁，生于${birthday}`;
        if (age) return `${age}岁`;
        if (birthday) return `生于${birthday}`;
        return '';
    })();
    return [
        playerName ? `姓名：${playerName}` : '',
        ageBirthday,
        (params.playerAppearance || '').trim() ? `外貌：${params.playerAppearance?.trim()}` : '',
        (params.playerIdentity || '').trim() ? `身份：${params.playerIdentity?.trim()}` : ''
    ]
        .filter(Boolean)
        .join('\n')
        .trim();
};

const 替换酒馆预设变量 = (params: {
    content: string;
    latestUserInput: string;
    playerName?: string;
    charCardDescription?: string;
    cotPrompt?: string;
    formatPrompt?: string;
}): { content: string; usedLatestInput: boolean } => {
    const source = typeof params.content === 'string' ? params.content : '';
    const latestUserInput = (params.latestUserInput || '').trim();
    const playerName = (params.playerName || '').trim();
    const charCardDescription = (params.charCardDescription || '').trim();
    const cotPrompt = (params.cotPrompt || '').trim();
    const formatPrompt = (params.formatPrompt || '').trim();

    let usedLatestInput = false;
    const inputPatterns = [
        /\{\{\s*userinput\s*\}\}/gi,
        /\{\{\s*input\s*\}\}/gi,
        /\{\{\s*lastinput\s*\}\}/gi,
        /<\s*userinput\s*>/gi,
        /<\s*user_input\s*>/gi,
        /<\s*input\s*>/gi
    ];

    let resolved = source;
    inputPatterns.forEach((pattern) => {
        if (pattern.test(resolved)) {
            usedLatestInput = true;
            resolved = resolved.replace(pattern, latestUserInput);
        }
    });

    if (playerName) {
        resolved = resolved.replace(/\{\{\s*user\s*\}\}/gi, playerName);
    }
    resolved = resolved.replace(/\{\{\s*char\s*\}\}/gi, charCardDescription);
    resolved = resolved.replace(/<\s*charname\s*>/gi, charCardDescription);
    resolved = resolved.replace(/\{\{\s*cot\s*\}\}/gi, cotPrompt);
    resolved = resolved.replace(/\{\{\s*格式\s*\}\}/gi, formatPrompt);
    resolved = resolved.replace(/\{\{\s*format\s*\}\}/gi, formatPrompt);

    return {
        content: resolved.trim(),
        usedLatestInput
    };
};

const 应用酒馆消息后处理 = (
    messages: 内部酒馆消息[],
    mode: NonNullable<游戏设置结构['酒馆提示词后处理']>
): 酒馆消息[] => {
    const mapped = messages.map<酒馆消息>((item) => {
        if (mode === '严格') {
            if (item.source === 'history' || item.source === 'latest_input') {
                return { role: item.role, content: item.content };
            }
            return { role: 'system', content: item.content };
        }
        if (mode === '半严格') {
            if (item.source === 'history' || item.source === 'latest_input') {
                return { role: item.role, content: item.content };
            }
            return {
                role: item.role === 'assistant' ? 'user' : item.role,
                content: item.content
            };
        }
        if (mode === '单一用户') {
            if (item.source === 'history' || item.source === 'latest_input') {
                return { role: item.role, content: item.content };
            }
            return {
                role: item.role === 'system' ? 'system' : 'user',
                content: item.content
            };
        }
        return { role: item.role, content: item.content };
    });

    const merged: 酒馆消息[] = [];
    mapped.forEach((item) => {
        const trimmed = (item.content || '').trim();
        if (!trimmed) return;
        const last = merged[merged.length - 1];
        if (last && last.role === item.role) {
            last.content = `${last.content}\n\n${trimmed}`.trim();
            return;
        }
        merged.push({ role: item.role, content: trimmed });
    });
    return merged;
};

export const 构建运行时提示词池 = (
    promptPool: 提示词结构[],
    config: 游戏设置结构,
    options?: {
        启用世界演变分流?: boolean;
        openingConfig?: OpeningConfig | null;
        强制剧情COT提示词ID?: string;
    }
): 运行时提示词构建结果 => {
    const selectedCotPromptId = typeof options?.强制剧情COT提示词ID === 'string' && options.强制剧情COT提示词ID.trim()
        ? options.强制剧情COT提示词ID.trim()
        : 选择剧情COT提示词ID(config, {
            openingConfig: options?.openingConfig
        });
    const selectedCotPrompt = 获取提示词源(
        promptPool,
        selectedCotPromptId,
        COT_PROMPT_SOURCE_MAP[selectedCotPromptId]
    );

    let effectivePromptPool = promptPool.filter((item) => !COT_PROMPT_IDS.has(item.id));
    effectivePromptPool = [...effectivePromptPool, { ...selectedCotPrompt, 启用: true }];
    effectivePromptPool = 替换或注入提示词(
        effectivePromptPool,
        获取提示词源(promptPool, 写作_防止说话.id, 写作_防止说话),
        config.启用防止说话 !== false
    );

    if (config.启用防止说话 === false) {
        effectivePromptPool = effectivePromptPool.map((item) => (
            typeof item?.内容 === 'string'
                ? { ...item, 内容: 剥离NoControl关联提示词(item.内容) }
                : item
        ));
    }

    if (config.启用饱腹口渴系统 === false) {
        effectivePromptPool = effectivePromptPool
            .filter((item) => !item.id.startsWith('diff_phys_'))
            .map((item) => {
                const content = typeof item.内容 === 'string' ? item.内容 : '';
                if (!生理系统关键词正则.test(content)) return item;
                const trimmed = content
                    .split('\n')
                    .filter((line) => !生理系统关键词正则.test(line))
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                return { ...item, 内容: trimmed };
            });
    }

    if (config.启用修炼体系 === false) {
        effectivePromptPool = effectivePromptPool.filter((item) => !修炼体系禁用时移除提示词ID.has(item.id));
    }

    effectivePromptPool = effectivePromptPool.map((item) => (
        typeof item?.内容 === 'string'
            ? { ...item, 内容: 按功能开关过滤提示词内容(item.内容, config) }
            : item
    ));

    effectivePromptPool = effectivePromptPool.filter((item) => !主剧情剥离提示词ID.has(item.id));

    if (options?.启用世界演变分流 === true) {
        effectivePromptPool = effectivePromptPool
            .filter((item) => item.id !== 'stat_world_evo')
            .map((item) => {
                if (COT_PROMPT_IDS.has(item.id)) {
                    return {
                        ...item,
                        内容: 剥离主剧情世界命令_COT(item.内容)
                    };
                }
                if (item.id === 'core_format') {
                    return {
                        ...item,
                        内容: 剥离主剧情世界命令_格式(item.内容)
                    };
                }
                if (item.id === 'core_rules') {
                    return {
                        ...item,
                        内容: (item.内容 || '').replace(/\n\s*-\s*`gameState\.世界`\s*/g, '\n')
                    };
                }
                return item;
            });
    }

    return {
        promptPool: effectivePromptPool,
        selectedCotPromptIds: [selectedCotPromptId]
    };
};

export const 构建酒馆预设消息链 = (params: {
    config: 游戏设置结构;
    context: 酒馆上下文结构;
    chatHistory: 聊天记录结构[];
    latestUserInput: string;
    playerName?: string;
    playerRole?: 角色数据结构 | null;
    overrideCotPrompt?: string;
    overrideStoryAppendPrompt?: string;
    worldbookExtraTexts?: string[];
}): 酒馆消息[] => {
    const preset = params.config?.酒馆预设 || null;
    const selectedOrder = 获取酒馆预设顺序(preset, params.config?.酒馆预设角色ID);
    if (!preset || !selectedOrder) return [];

    const promptMap = new Map(
        (Array.isArray(preset.prompts) ? preset.prompts : [])
            .map((item) => [item.identifier, item] as const)
    );
    const enabledOrderSlots = (Array.isArray(selectedOrder.order) ? selectedOrder.order : [])
        .filter((slot) => Boolean(slot) && slot.enabled !== false);
    const useCotVariableInjection = enabledOrderSlots.some((slot) => {
        const identifier = typeof slot.identifier === 'string' ? slot.identifier.trim() : '';
        if (!identifier) return false;
        const prompt = promptMap.get(identifier);
        const rawContent = typeof prompt?.content === 'string' ? prompt.content : '';
        return 匹配酒馆COT占位符(rawContent);
    });
    const useFormatVariableInjection = enabledOrderSlots.some((slot) => {
        const identifier = typeof slot.identifier === 'string' ? slot.identifier.trim() : '';
        if (!identifier) return false;
        const prompt = promptMap.get(identifier);
        const rawContent = typeof prompt?.content === 'string' ? prompt.content : '';
        return 匹配酒馆格式占位符(rawContent);
    });
    const resolvedCotPrompt = typeof params.overrideCotPrompt === 'string' && params.overrideCotPrompt.trim()
        ? params.overrideCotPrompt.trim()
        : params.context.contextPieces.COT提示词;
    const worldbookOtherPrompts = useFormatVariableInjection
        ? 从复合提示词中剥离子块(
            params.context.contextPieces.otherPrompts,
            params.context.contextPieces.格式提示词
        )
        : params.context.contextPieces.otherPrompts;
    const worldbookText = 构建酒馆世界书文本(
        params.context.contextPieces,
        params.context.shortMemoryContext,
        {
            包含COT提示词: !useCotVariableInjection,
            其他提示词覆盖: worldbookOtherPrompts,
            COT提示词覆盖: resolvedCotPrompt,
            剧情安排后附加文本: params.overrideStoryAppendPrompt
        }
    );
    const combinedWorldbookText = [
        worldbookText,
        ...(Array.isArray(params.worldbookExtraTexts) ? params.worldbookExtraTexts : [])
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
    ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
    const historyMessages = 构建酒馆聊天历史消息(params.chatHistory);
    const latestInput = (params.latestUserInput || '').trim();
    const playerName = (params.playerName || '').trim();
    const playerRole = params.playerRole || null;
    const playerAge = typeof playerRole?.年龄 === 'number' && Number.isFinite(playerRole.年龄)
        ? String(Math.max(0, Math.floor(playerRole.年龄)))
        : '';
    const playerBirthday = typeof playerRole?.出生日期 === 'string' ? playerRole.出生日期.trim() : '';
    const playerAppearance = typeof playerRole?.外貌 === 'string' ? playerRole.外貌.trim() : '';
    const playerIdentity = 提取玩家身份(playerRole, {
        includeRealm: params.config?.启用修炼体系 !== false
    });
    const playerProfile = 构建玩家设定文本({
        playerName,
        playerAge,
        playerBirthday,
        playerAppearance,
        playerIdentity
    });
    const charCardDescription = typeof params.config?.酒馆角色卡描述 === 'string'
        ? params.config.酒馆角色卡描述
        : '';
    const 历史已包含最新输入 = (): boolean => {
        if (!latestInput) return false;
        for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
            const item = historyMessages[i];
            if (item.role !== 'user') continue;
            return (item.content || '').trim() === latestInput;
        }
        return false;
    };
    const messages: 内部酒馆消息[] = [];
    let worldbookInjected = false;
    let chatHistoryInjected = false;
    let latestInputInjected = false;

    enabledOrderSlots.forEach((slot) => {
        const identifier = typeof slot.identifier === 'string' ? slot.identifier.trim() : '';
        if (!identifier) return;

        if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
            if (!worldbookInjected && combinedWorldbookText) {
                messages.push({ role: 'system', content: combinedWorldbookText, source: 'worldbook' });
                worldbookInjected = true;
            }
            return;
        }
        if (identifier === 'chatHistory') {
            historyMessages.forEach((msg) => messages.push({ ...msg, source: 'history' }));
            if (历史已包含最新输入()) latestInputInjected = true;
            chatHistoryInjected = true;
            return;
        }
        if (identifier === 'personaDescription') {
            if (playerProfile) {
                const prompt = promptMap.get(identifier);
                const role = prompt?.role === 'user' || prompt?.role === 'assistant' ? prompt.role : 'system';
                messages.push({ role, content: playerProfile, source: 'persona' });
            }
            return;
        }
        if (identifier === 'userInput' || identifier === 'user_input' || identifier === 'latestUserInput' || identifier === 'input') {
            if (latestInput) {
                messages.push({ role: 'user', content: latestInput, source: 'latest_input' });
                latestInputInjected = true;
            }
            return;
        }

        const prompt = promptMap.get(identifier);
        const rawContent = typeof prompt?.content === 'string' ? prompt.content : '';
        const resolved = 替换酒馆预设变量({
            content: rawContent,
            latestUserInput: latestInput,
            playerName,
            charCardDescription,
            cotPrompt: resolvedCotPrompt,
            formatPrompt: params.context.contextPieces.格式提示词
        });
        const content = resolved.content;
        if (!content) return;
        if (resolved.usedLatestInput) latestInputInjected = true;
        const role = prompt?.role === 'user' || prompt?.role === 'assistant' ? prompt.role : 'system';
        messages.push({ role, content, source: 'preset' });
    });

    if (!worldbookInjected && combinedWorldbookText) {
        messages.push({ role: 'system', content: combinedWorldbookText, source: 'worldbook' });
    }
    if (!chatHistoryInjected) {
        historyMessages.forEach((msg) => messages.push({ ...msg, source: 'history' }));
        if (历史已包含最新输入()) latestInputInjected = true;
    }
    if (!latestInputInjected && latestInput) {
        messages.push({ role: 'user', content: latestInput, source: 'latest_input' });
    }

    return 应用酒馆消息后处理(messages, params.config?.酒馆提示词后处理 || '未选择');
};
