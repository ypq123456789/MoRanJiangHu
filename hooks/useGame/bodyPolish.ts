import type {
    GameResponse,
    提示词结构,
    接口设置结构,
    游戏设置结构,
    环境信息结构,
    战斗状态结构,
    角色数据结构
} from '../../types';
import * as textAIService from '../../services/ai/text';
import { 获取文章优化接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 默认文章优化提示词 } from '../../prompts/runtime/defaults';
import { 核心_文章优化思维链 } from '../../prompts/core/cotPolish';
import { 构建COT伪装提示词 } from './promptRuntime';
import { 环境时间转标准串 } from './timeUtils';
import { 规范化环境信息, 构建完整地点文本 } from './stateTransforms';

type 正文日志结构 = Array<{ sender: string; text: string }>;

type 正文润色依赖 = {
    apiConfig: 接口设置结构;
    gameConfig: 游戏设置结构;
    prompts: 提示词结构[];
    环境: 环境信息结构;
    剧情: any;
    社交: any[];
    战斗: 战斗状态结构;
    角色: 角色数据结构;
    文章优化已开启: boolean;
    深拷贝: <T,>(data: T) => T;
};

const 剥离首尾思考区段 = (text: string): string => {
    const source = typeof text === 'string' ? text : '';
    if (!source) return '';

    const bodyOpenRegex = /<\s*正文\s*>/gi;
    let bodyOpenMatch: RegExpExecArray | null = null;
    let lastBodyOpenMatch: RegExpExecArray | null = null;
    while ((bodyOpenMatch = bodyOpenRegex.exec(source)) !== null) {
        lastBodyOpenMatch = bodyOpenMatch;
    }
    if (lastBodyOpenMatch && typeof lastBodyOpenMatch.index === 'number') {
        return source.slice(lastBodyOpenMatch.index);
    }
    if (/<\s*(thinking|think)\s*>/i.test(source)) {
        return '';
    }
    return source;
};

const 提取正文标签内容 = (rawText: string): string => {
    const source = 剥离首尾思考区段(rawText);
    const match = source.match(/<正文>([\s\S]*?)<\/正文>/i);
    if (match && typeof match[1] === 'string') {
        return match[1].trim();
    }
    return '';
};

const 规范化正文发送者 = (senderRaw: string): string => {
    const sender = (senderRaw || '').trim();
    if (!sender) return '旁白';
    if (sender === '判定' || sender === '【判定】') return '【判定】';
    if (sender === 'NSFW判定' || sender === '【NSFW判定】') return '【NSFW判定】';
    return sender;
};

const 解析正文日志文本 = (bodyText: string): 正文日志结构 => {
    const source = (bodyText || '').trim();
    if (!source) return [];
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const logs: 正文日志结构 = [];
    let current: { sender: string; text: string } | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(/^【\s*([^】]+?)\s*】\s*(.*)$/);
        if (match) {
            const sender = 规范化正文发送者(match[1]);
            const text = (match[2] || '').trim();
            current = { sender, text };
            logs.push(current);
            continue;
        }
        if (current) {
            current.text = `${current.text}\n${line}`.trim();
            continue;
        }
        current = { sender: '旁白', text: line };
        logs.push(current);
    }

    return logs.filter(item => typeof item.text === 'string' && item.text.trim().length > 0);
};

const 构建正文文本 = (logs: 正文日志结构): string => {
    return (Array.isArray(logs) ? logs : [])
        .filter(item => item && typeof item.text === 'string' && item.text.trim().length > 0)
        .map(item => {
            const sender = (item.sender || '').trim();
            const senderToken = sender.startsWith('【') ? sender : `【${sender || '旁白'}】`;
            return `${senderToken}${item.text}`;
        })
        .join('\n');
};

const 是否判定正文发送者 = (senderRaw: string): boolean => {
    const sender = (senderRaw || '').trim();
    return sender === '【判定】' || sender === '【NSFW判定】' || sender === '判定' || sender === 'NSFW判定';
};

const 限制润色结果判定数量 = (
    sourceLogs: 正文日志结构,
    polishedLogs: 正文日志结构
): 正文日志结构 => {
    const safeSource = Array.isArray(sourceLogs) ? sourceLogs : [];
    const safePolished = Array.isArray(polishedLogs) ? polishedLogs : [];
    const sourceJudgeCount = safeSource.filter((item) => 是否判定正文发送者(item?.sender || '')).length;
    if (sourceJudgeCount <= 0) {
        return safePolished.filter((item) => !是否判定正文发送者(item?.sender || ''));
    }

    let keptJudgeCount = 0;
    return safePolished.filter((item) => {
        if (!是否判定正文发送者(item?.sender || '')) return true;
        keptJudgeCount += 1;
        return keptJudgeCount <= sourceJudgeCount;
    });
};

export const 执行正文润色 = async (
    baseResponse: GameResponse,
    rawText: string,
    deps: 正文润色依赖,
    options?: { manual?: boolean; playerInput?: string }
): Promise<{ response: GameResponse; applied: boolean; error?: string; rawText?: string }> => {
    if (!deps.文章优化已开启) {
        return { response: baseResponse, applied: false, error: '文章优化已关闭。' };
    }

    const polishApi = 获取文章优化接口配置(deps.apiConfig);
    if (!接口配置是否可用(polishApi)) {
        return { response: baseResponse, applied: false, error: '文章优化模型未配置可用接口。' };
    }

    const featureConfig = deps.apiConfig?.功能模型占位;
    const promptText = typeof featureConfig?.文章优化提示词 === 'string' && featureConfig.文章优化提示词.trim().length > 0
        ? featureConfig.文章优化提示词
        : 默认文章优化提示词;
    const runtimeGameConfig = 规范化游戏设置(deps.gameConfig);
    const playerName = typeof deps.角色?.姓名 === 'string' ? deps.角色.姓名.trim() : '';
    const playerDisplayName = playerName || '主角';
    const polishFormatSection = (() => {
        const coreFormatPrompt = deps.prompts.find((item) => item.id === 'core_format');
        const content = typeof coreFormatPrompt?.内容 === 'string' ? coreFormatPrompt.内容 : '';
        if (!content.trim()) return '';
        const match = content.match(/##\s*2\.\s*正文结构与叙事约束（硬约束 \+ 质量约束）([\s\S]*?)(?=\n##\s*3\.|\n<\/输出结构与指令场景>|$)/);
        if (!match) return '';
        const body = (match[1] || '').trim();
        if (!body) return '';
        return [
            '【附加格式协议（自动注入）】',
            '## 2. 正文结构与叙事约束（硬约束 + 质量约束）',
            body
        ].join('\n');
    })();
    const polishEmotionGuard = (() => {
        const emotionPrompt = deps.prompts.find((item) => item.id === 'write_emotion_guard');
        const content = typeof emotionPrompt?.内容 === 'string' ? emotionPrompt.内容.trim() : '';
        if (content) return `【附加情绪守卫（自动注入）】\n${content}`;
        return [
            '【附加情绪守卫（自动注入）】',
            '- 禁止角色因单次小事直接崩溃、疯癫、人格反转。',
            '- 强情绪必须具备“多回合累积 + 当回合触发点”。',
            '- 优先复杂情绪，禁止无条件崇拜/无条件毁灭。'
        ].join('\n');
    })();
    const polishOutputContract = [
        '【输出结构硬约束】',
        '1) 你必须输出 <thinking>...</thinking> 与 <正文>...</正文> 两个顶层标签块，顺序固定为 thinking 在前、正文在后。',
        '2) <正文> 内部允许按主剧情正文协议保留判定子结构；命中判定时，只能把 <judge>...</judge> 作为 <正文> 内部标签插入，不得升成顶层标签。',
        '3) 除上述两个顶层标签外，禁止输出其他顶层内容（解释、命令、免责声明、代码块等）。',
        '4) 系统只会提取 <正文> 内容用于最终渲染。'
    ].join('\n');
    const polishSceneContext = (() => {
        const currentEnv = 规范化环境信息(deps.环境);
        const currentStory = deps.剧情 && typeof deps.剧情 === 'object' ? deps.剧情 : ({} as any);
        const npcInSceneNames = (Array.isArray(deps.社交) ? deps.社交 : [])
            .filter((npc: any) => npc && npc.是否在场 === true)
            .map((npc: any) => (typeof npc?.姓名 === 'string' ? npc.姓名.trim() : ''))
            .filter(Boolean)
            .slice(0, 12);
        const inSceneNames = Array.from(new Set([
            `${playerDisplayName}（用户）`,
            ...npcInSceneNames
        ].filter(Boolean)));
        const perspectiveContext = (() => {
            if (runtimeGameConfig.叙事人称 === '第一人称') {
                return `第一人称；若主角直接发言，统一使用【${playerDisplayName}】作为说话标签，不得写成【我】或【你】。`;
            }
            if (runtimeGameConfig.叙事人称 === '第三人称') {
                return `第三人称；叙事可使用“${playerDisplayName}”或“他/她”，若主角直接发言，统一使用【${playerDisplayName}】作为说话标签。`;
            }
            return `第二人称；叙事可使用“你”，若主角直接发言，统一使用【${playerDisplayName}】作为说话标签，不得写成【你】或【我】。`;
        })();
        const chapterTitle = typeof currentStory?.当前章节?.标题 === 'string' && currentStory.当前章节.标题.trim()
            ? currentStory.当前章节.标题.trim()
            : '未命名章节';
        return [
            '【文章优化上下文（自动注入）】',
            `- 当前叙事人称: ${perspectiveContext}`,
            `- 当前剧情风格: ${runtimeGameConfig.剧情风格}`,
            `- 当前时间: ${环境时间转标准串(currentEnv) || '未知时间'}`,
            `- 当前地点: ${构建完整地点文本(currentEnv) || '未知地点'}`,
            `- 在场角色: ${inSceneNames.length > 0 ? inSceneNames.join('、') : '无明确在场角色'}`,
            `- 当前主线章节: ${chapterTitle}`
        ].join('\n');
    })();
    const polishPerspectiveRule = (() => {
        if (runtimeGameConfig.叙事人称 === '第一人称') {
            return `第一人称：旁白叙事可使用“我”，不得混入“你/他/她”作为主角叙述；若主角直接发言，发言标签统一使用【${playerDisplayName}】，不得写成【我】或【你】。`;
        }
        if (runtimeGameConfig.叙事人称 === '第三人称') {
            return `第三人称：主角统一使用“${playerDisplayName}”或“他/她”，不得混入“我/你”作为主角叙述；若主角直接发言，发言标签统一使用【${playerDisplayName}】。`;
        }
        return `第二人称：主角统一使用“你”，不得混入“我/他/她”作为主角叙述；若主角直接发言，发言标签统一使用【${playerDisplayName}】，不得写成【你】或【我】。`;
    })();
    const polishLengthRule = `字数要求：<正文>标签内总字数应不少于${Math.max(50, Number(runtimeGameConfig.字数要求) || 450)}字。`;
    const polishActionRule = [
        '主角动作守恒：不得新增、删除、替换主角关键动作。',
        '主角动作结构：尽量写成“起手动作 -> 执行动作 -> 结果反馈”。',
        '禁止替主角补写未输入的关键决策与台词。',
        '主角身份锁定：不得把主角称谓、主角代词或主角所属动作替换为任何在场 NPC 姓名。'
    ].join('\n');
    const normalizedPlayerInput = typeof options?.playerInput === 'string'
        ? options.playerInput.trim()
        : '';
    const polishPlayerInputRule = [
        '【本回合玩家输入（附加）】',
        normalizedPlayerInput || '（无有效输入）',
        '【玩家发言判定要求（附加）】',
        '1) 你必须先基于“本回合玩家输入”判断：玩家是否有明确发言（明确台词/引号内对白/显式说话动词）。',
        '2) 若判定“无明确发言”：禁止为主角补写对白；正文应直接写 NPC 反应、环境反馈与动作结果。',
        '3) 若判定“有明确发言”：仅可保留与输入一致的玩家发言，不得擅自扩写玩家台词。'
    ].join('\n');
    const polishBracketRule = [
        '【括号补描写禁令（附加）】',
        '1) 禁止在【旁白】/【角色名】行中使用“（……）”或“(...)”补充描写、语气、心理、解释。',
        '2) 括号信息必须改写为独立句并并入上下文动作链。',
        '3) 仅【判定】结构内协议字段(说明)可保留。'
    ].join('\n');
    const polishRuntimeGuard = [
        '【动态同步约束】',
        polishPerspectiveRule,
        polishLengthRule,
        polishActionRule,
        polishPlayerInputRule,
        polishBracketRule
    ].join('\n');
    const effectivePolishPrompt = [
        promptText,
        polishFormatSection,
        polishEmotionGuard,
        polishRuntimeGuard,
        polishSceneContext,
        polishOutputContract,
        核心_文章优化思维链.内容
    ]
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .join('\n\n');
    const polishExtraPrompt = typeof runtimeGameConfig.额外提示词 === 'string'
        ? runtimeGameConfig.额外提示词.trim()
        : '';
    const polishCotPseudoPrompt = runtimeGameConfig.启用COT伪装注入 !== false
        ? 构建COT伪装提示词(runtimeGameConfig)
        : '';

    const sourceLogs = Array.isArray(baseResponse.body_original_logs) && baseResponse.body_original_logs.length > 0
        ? baseResponse.body_original_logs
        : (baseResponse.logs || []);
    const sourceBody = 提取正文标签内容(rawText) || 构建正文文本(sourceLogs);
    if (!sourceBody.trim()) {
        return { response: baseResponse, applied: false, error: '正文为空，无法优化。' };
    }

    const polishedResult = await textAIService.generatePolishedBody(
        sourceBody,
        effectivePolishPrompt,
        polishApi,
        undefined,
        polishExtraPrompt,
        polishCotPseudoPrompt
    );
    const polishedLogs = 限制润色结果判定数量(
        sourceLogs,
        解析正文日志文本(polishedResult.bodyText)
    );
    if (polishedLogs.length === 0) {
        return { response: baseResponse, applied: false, error: '优化后正文为空，已保留原文。', rawText: polishedResult.rawText };
    }

    return {
        response: {
            ...baseResponse,
            logs: polishedLogs,
            body_optimized: true,
            body_optimized_manual: options?.manual === true,
            body_optimized_at: Date.now(),
            body_optimized_model: polishApi.model,
            body_original_logs: Array.isArray(baseResponse.body_original_logs) && baseResponse.body_original_logs.length > 0
                ? baseResponse.body_original_logs
                : (Array.isArray(baseResponse.logs) ? deps.深拷贝(baseResponse.logs) : [])
        },
        applied: true,
        rawText: polishedResult.rawText
    };
};
