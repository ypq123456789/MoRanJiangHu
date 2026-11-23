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
import { 计算正文字数容错字数, 正文字数差距在容错内 } from '../../utils/bodyLengthTolerance';
import { 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { 默认文章优化提示词 } from '../../prompts/runtime/defaults';
import { 核心_文章优化思维链 } from '../../prompts/core/cotPolish';
import { 环境时间转标准串 } from './timeUtils';
import { 规范化环境信息, 构建完整地点文本 } from './stateTransforms';
import { 规范化对白日志 } from '../../utils/dialogueLogNormalizer';
import { 是否可信正文标签发送者, 规范化正文发送者名 } from '../../utils/dialogueSpeakerGuard';
import { 拆分判定日志与后续正文, 提取判定日志前缀, 是否判定日志文本 } from '../../utils/judgmentFormat';
import { 构建运行时额外提示词 } from '../../prompts/runtime/nsfw';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';
import { 是否裸标准游戏时间行, 检测裸标准游戏时间行, 是否正文段泄漏行 } from '../../utils/bodyTextSanitizer';
import { 获取游玩请求超时毫秒 } from '../../utils/gameRequestTimeouts';
import { 执行文章优化请求带超时 } from './polishRequestTimeout';

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
    onDelta?: (delta: string, accumulated: string) => void;
};

export const 统计润色正文字符数 = (logs: 正文日志结构): number => (
    (Array.isArray(logs) ? logs : [])
        .map((log) => (typeof log?.text === 'string' ? log.text : ''))
        .join('')
        .replace(/\s+/g, '')
        .length
);

export const 评估润色长度结果 = (params: {
    sourceLength: number;
    polishedLength: number;
    requiredLength: number;
    allowExpansionForLength?: boolean;
}): { ok: true } | { ok: false; error: string } => {
    const sourceLength = Math.max(0, Math.floor(params.sourceLength || 0));
    const polishedLength = Math.max(0, Math.floor(params.polishedLength || 0));
    const requiredLength = Math.max(50, Math.floor(params.requiredLength || 50));
    if (params.allowExpansionForLength === true) {
        if (!正文字数差距在容错内(polishedLength, requiredLength)) {
            const tolerance = 计算正文字数容错字数(requiredLength);
            return {
                ok: false,
                error: `优化后正文仍偏短：当前约 ${polishedLength} 字，目标至少 ${requiredLength} 字（容错 ${tolerance} 字），已保留原始草稿。`
            };
        }
        return { ok: true };
    }
    if (sourceLength >= requiredLength && polishedLength < Math.max(50, Math.floor(sourceLength * 0.75))) {
        return {
            ok: false,
            error: `优化后正文被明显压缩：原文约 ${sourceLength} 字，优化后约 ${polishedLength} 字，已保留原文。`
        };
    }
    return { ok: true };
};

const 文章优化协议确认句正则 = /好的[，,]?\s*将以\s*<\s*正文\s*>\s*<\s*\/\s*正文\s*>\s*包裹正文/gi;
const 文章优化协议标签说明正则 = /<\s*(?:短期记忆|变量规划|剧情规划|行动选项|thinking|think|正文)\s*>|<\s*\/\s*(?:短期记忆|变量规划|剧情规划|行动选项|thinking|think|正文)\s*>/gi;

const 规范化污染检测文本 = (text: string): string => (
    (typeof text === 'string' ? text : '')
        .replace(/\s+/g, '')
        .trim()
);

export const 检测文章优化协议确认污染 = (text: string): { polluted: boolean; reason: string; repeats: number } => {
    const source = typeof text === 'string' ? text : '';
    const compact = 规范化污染检测文本(source);
    if (!compact) return { polluted: false, reason: '', repeats: 0 };

    const repeats = (compact.match(文章优化协议确认句正则) || []).length;
    const hasBodyOpen = /<\s*正文\s*>/i.test(source);
    const hasBodyClose = /<\s*\/\s*正文\s*>/i.test(source);
    const visibleBody = 提取正文标签内容(source);
    const visibleBodyLength = visibleBody.replace(/\s+/g, '').length;
    const protocolTagMentions = (source.match(文章优化协议标签说明正则) || []).length;

    if (repeats >= 2) {
        return {
            polluted: true,
            reason: `文章优化模型反复输出协议确认句 ${repeats} 次，疑似陷入复读循环。`,
            repeats
        };
    }

    if (repeats >= 1 && (!hasBodyOpen || !hasBodyClose || visibleBodyLength < 20) && protocolTagMentions >= 3) {
        return {
            polluted: true,
            reason: '文章优化模型输出了协议确认说明，但没有给出可用正文。',
            repeats
        };
    }

    return { polluted: false, reason: '', repeats };
};

const 检测文章优化时间真值污染 = (text: string): { polluted: boolean; reason: string; line: string } | null => {
    const line = 检测裸标准游戏时间行(text || '');
    if (!line) return null;
    return {
        polluted: true,
        line,
        reason: `正文混入标准时间真值行「${line}」，必须改写成自然叙事时间表达，不能直接显示后台标准时间字符串。`
    };
};

const 构建文章优化流式守卫 = (
    onDelta?: (delta: string, accumulated: string) => void
): ((delta: string, accumulated: string) => void) | undefined => {
    if (typeof onDelta !== 'function') return undefined;
    return (delta: string, accumulated: string) => {
        onDelta(delta, accumulated);
        const pollution = 检测文章优化协议确认污染(accumulated);
        if (pollution.polluted) {
            throw new Error(`${pollution.reason} 已中断本次正文优化并准备重试。`);
        }
    };
};

const 是否文章优化协议污染错误 = (error: any): boolean => {
    const message = String(error?.message || error || '');
    return /协议确认|复读循环|确认说明|禁止协议确认复读|标准时间真值行|后台标准时间字符串/.test(message);
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
    return 规范化正文发送者名(senderRaw);
};

const 解析判定正文行 = (line: string): { sender: string; text: string; trailingBody?: string } | null => {
    const text = (line || '').trim();
    const prefix = 提取判定日志前缀(text);
    if (!prefix) return null;
    const split = 拆分判定日志与后续正文(text);
    return {
        sender: prefix,
        text: split?.judgmentText || text,
        trailingBody: split?.trailingBody
    };
};

const 是否应合并硬换行片段 = (previousText: string, nextLine: string): boolean => {
    const previous = (previousText || '').trim();
    const next = (nextLine || '').trim();
    if (!previous || !next) return false;
    if (/^[，,。！？!?；;：:、）)\]】]/.test(next)) return true;
    if (/【[^】\n]{1,24}】[，,。！？!?；;：:]?$/.test(next)) return true;
    if (/(?:摸到了两个坚硬的物体|平日里习惯随身携带的|另一件则是他的|另一件是他的|一把是他|一件是他|则是他的)$/.test(previous)) return true;
    if (!/[。！？!?；;”"」』）)]$/.test(previous) && /^[\u4e00-\u9fa5A-Za-z0-9【《“"「『（(]/.test(next) && next.length <= 36) return true;
    return false;
};

const 合并正文续行 = (previousText: string, nextLine: string): string => {
    const previous = (previousText || '').trim();
    const next = (nextLine || '').trim();
    if (!previous) return next;
    if (!next) return previous;
    return 是否应合并硬换行片段(previous, next)
        ? `${previous}${next}`.trim()
        : `${previous}\n${next}`.trim();
};

export const 解析正文日志文本 = (bodyText: string, options?: { declaredNames?: Set<string> }): 正文日志结构 => {
    const source = (bodyText || '').trim();
    if (!source) return [];
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const logs: 正文日志结构 = [];
    let current: { sender: string; text: string } | null = null;
    let pendingDialogueSender = '';
    const 写入旁白行 = (value: string) => {
        const text = (value || '').trim();
        if (!text) return;
        if (current?.sender === '旁白') {
            current.text = 合并正文续行(current.text, text);
            return;
        }
        current = { sender: '旁白', text };
        logs.push(current);
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (是否裸标准游戏时间行(line)) continue;
        // 正文段泄漏兜底：酒馆预设/模型偶尔把变量命令、规划、选项、动态世界、命令等混进正文，
        // 这些内容一般粘在正文尾部，遇到即停止收集，避免被当成旁白续行渲染进正文。
        if (是否正文段泄漏行(line)) break;
        const judgmentLine = 解析判定正文行(line);
        if (judgmentLine) {
            pendingDialogueSender = '';
            current = { sender: judgmentLine.sender, text: judgmentLine.text };
            logs.push(current);
            if (judgmentLine.trailingBody) {
                current = { sender: '旁白', text: judgmentLine.trailingBody };
                logs.push(current);
            }
            continue;
        }
        const match = line.match(/^【\s*([^】]+?)\s*】\s*(.*)$/);
        if (match) {
            const sender = 规范化正文发送者(match[1]);
            const text = (match[2] || '').trim();
            if (!是否可信正文标签发送者(sender, { declaredNames: options?.declaredNames })) {
                pendingDialogueSender = '';
                写入旁白行(line);
                continue;
            }
            pendingDialogueSender = text ? '' : sender;
            current = { sender, text };
            logs.push(current);
            continue;
        }
        if (pendingDialogueSender && current?.sender === pendingDialogueSender && !current.text.trim()) {
            current.text = line;
            pendingDialogueSender = '';
            continue;
        }
        pendingDialogueSender = '';
        if (current && (是否判定正文发送者(current.sender) || 是否判定日志文本(current.text))) {
            写入旁白行(line);
            continue;
        }
        if (current) {
            current.text = 合并正文续行(current.text, line);
            continue;
        }
        写入旁白行(line);
    }

    return 规范化对白日志(logs.filter(item => typeof item.text === 'string' && item.text.trim().length > 0));
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
    return sender === '【判定】'
        || sender === '【NSFW判定】'
        || sender === '判定'
        || sender === 'NSFW判定'
        || Boolean(提取判定日志前缀(sender));
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

const 是否角色正文发送者 = (senderRaw: string): boolean => {
    const sender = (senderRaw || '').replace(/[【】]/g, '').trim();
    if (!sender || sender === '旁白' || sender === '奖励') return false;
    return !是否判定正文发送者(sender);
};

const 统计角色对白条数 = (logs: 正文日志结构): number => (
    (Array.isArray(logs) ? logs : [])
        .filter((item) => 是否角色正文发送者(item?.sender || '') && typeof item?.text === 'string' && item.text.trim().length > 0)
        .length
);

const 角色行开头引号正则 = /^[“"「『]/;
const 角色行结尾引号正则 = /[”"」』]$/;
const 角色行叙事特征正则 = /(?:她|他|你|我|众人|旁边|车轮|马蹄|目光|视线|脚步|裙摆|衣袖|风声|雨声|声音|说完|说罢|说着|看了|望了|靠了|抬头|低头|转身|收回|走到|驶上|发出|响起|掠过|落在|停在)/;

const 查找首段角色引号闭合位置 = (text: string): number => {
    const source = (text || '').trim();
    if (!source) return -1;
    const open = source[0];
    const close = open === '“' ? '”'
        : open === '「' ? '」'
            : open === '『' ? '』'
                : open === '"' ? '"'
                    : '';
    if (!close) return -1;
    return source.indexOf(close, 1);
};

const 剥离角色行外层引号 = (text: string): string => {
    const source = (text || '').trim();
    const closingIndex = 查找首段角色引号闭合位置(source);
    if (closingIndex === source.length - 1 && 角色行开头引号正则.test(source) && 角色行结尾引号正则.test(source)) {
        return source.slice(1, -1).trim();
    }
    return source;
};

export const 净化角色对白行 = (logs: 正文日志结构): 正文日志结构 => {
    const result: 正文日志结构 = [];
    (Array.isArray(logs) ? logs : []).forEach((item) => {
        const sender = 规范化正文发送者(item?.sender || '旁白');
        const text = typeof item?.text === 'string' ? item.text.trim() : '';
        if (!text) return;
        if (!是否角色正文发送者(sender)) {
            result.push({ sender, text });
            return;
        }

        const closingIndex = 查找首段角色引号闭合位置(text);
        if (closingIndex > 0) {
            const quoted = text.slice(1, closingIndex).trim();
            const rest = text.slice(closingIndex + 1).trim();
            if (quoted) result.push({ sender, text: quoted });
            if (rest) result.push({ sender: '旁白', text: rest });
            return;
        }

        if (!/[我你咱？?！!]|(?:吧|吗|呢|啊|呀|嘛|呗|啦|喂|哼|嗯|唔|哦|行|好|当然|自然|可以|不行|回来|看看)/.test(text) && 角色行叙事特征正则.test(text)) {
            result.push({ sender: '旁白', text });
            return;
        }

        result.push({ sender, text: 剥离角色行外层引号(text) });
    });
    return 规范化对白日志(result);
};

export const 执行正文润色 = async (
    baseResponse: GameResponse,
    rawText: string,
    deps: 正文润色依赖,
    options?: { manual?: boolean; playerInput?: string; signal?: AbortSignal; allowExpansionForLength?: boolean; minLength?: number; prefetchedRawText?: string }
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
    // [修复] 从社交列表构建已声明角色名集合，传给解析正文日志文本，
    // 避免润色后的角色对话标签被误判为不可信而跌入旁白
    const declaredNames = new Set<string>([
        playerDisplayName,
        ...(Array.isArray(deps.社交) ? deps.社交 : []).map((npc: any) =>
            typeof npc?.姓名 === 'string' ? npc.姓名.trim() : ''
        ).filter(Boolean)
    ]);
    // [修复] 开局第一回合 deps.社交 为空，补充原始 AI 回复中已识别的说话人名字，
    // 确保润色后的正文不会因社交列表未初始化而丢失对话框
    if (Array.isArray(baseResponse.logs)) {
        for (const log of baseResponse.logs) {
            const sender = 规范化正文发送者(log?.sender || '');
            if (sender && sender !== '旁白' && sender !== '奖励' && !是否判定正文发送者(sender)) {
                declaredNames.add(sender);
            }
        }
    }
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
        '4) 系统只会提取 <正文> 内容用于最终渲染。',
        '5) 角色对白必须是口语台词，使用【角色名】独占一行；旁白、动作、心理、第三人称叙述、设定说明绝不能写进【角色名】行。',
        '6) “随着她/随着他/如果/此时/这时/然后/接着”等叙事短语不是人物名，禁止作为【角色名】标签。',
        '6.1) “双手/指尖/眼睛/嘴唇/长剑/茶盏/衣袖/声音/气息/灵气/剑光”等身体部位、物件或抽象对象也不是人物名，必须归入【旁白】。',
        '7) 原文已有的【角色名】对白条数不得减少；缺标签对白要补正确角色名，不得把角色对白合并成【旁白】。',
        '8) 物品、角色天赋、出身背景等可查看档案引用统一使用《名称》，例如《随身短刃》《智能手机》《安全屋直觉》；禁止写成【名称】，因为【...】只用于旁白、角色名和判定标签。',
        '9) 《名称》必须保留在同一句内，不得把书名号或名称单独拆成新行。'
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
            `- 当前主线章节: ${chapterTitle}`,
            '- 地名约束: 润色只改文字表现，不替换地名、不把建筑/据点名改写成城镇名，也不新增地图上不存在的地点。'
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
    const requiredBodyLength = Math.max(50, Number(options?.minLength ?? runtimeGameConfig.字数要求) || 450);
    const polishLengthRule = [
        `字数要求：<正文>标签内总字数应不少于${requiredBodyLength}字。`,
        options?.allowExpansionForLength === true
            ? [
                '本次原始正文低于字数要求，但仍是可用剧情大纲；你必须把它当作“已发生事实大纲”展开成完整正文。',
                '展开时只能补足原大纲已经指向的动作过程、感官反馈、环境承接、NPC反应和结果余波，不得新增新事件、新判定、新地点、新角色或改变结果。',
                '不得只复述大纲、不得用摘要/设定条目/概述式语言收束，必须写成可直接阅读的小说正文。'
            ].join('\n')
            : [
                '正常润色不得压缩原文信息量；润色后正文可略短，但不能把完整正文改写成大纲、摘要或设定说明。',
                '若字数要求与“同等信息量”冲突，优先保持完整可读正文，不要为了简洁牺牲动作、效果、人物设定和NPC互动细节。'
            ].join('\n')
    ].join('\n');
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
        polishBracketRule,
        获取繁体输出指令(runtimeGameConfig)
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
    const polishExtraPrompt = 按功能开关过滤提示词内容(
        构建运行时额外提示词(runtimeGameConfig.额外提示词 || '', runtimeGameConfig),
        runtimeGameConfig
    );
    const polishCotPseudoPrompt = '';
    const guardedOnDelta = 构建文章优化流式守卫(deps.onDelta);
    const shouldNonStream = deps.gameConfig?.启用非流式输出 || featureConfig?.文章优化非流式输出;
    const requestTimeouts = 获取游玩请求超时毫秒(runtimeGameConfig.游玩请求超时设置);
    const requestSignal = options?.signal ?? new AbortController().signal;

    const sourceLogs = Array.isArray(baseResponse.body_original_logs) && baseResponse.body_original_logs.length > 0
        ? baseResponse.body_original_logs
        : (baseResponse.logs || []);
    const sourceDialogueCount = 统计角色对白条数(sourceLogs);
    const sourceBody = 提取正文标签内容(rawText) || 构建正文文本(sourceLogs);
    if (!sourceBody.trim()) {
        return { response: baseResponse, applied: false, error: '正文为空，无法优化。' };
    }

    const 执行一次文章优化 = async (prompt: string, retryHint = '', bodyOverride?: string, prefetchedRawText?: string) => {
        const result = await 执行文章优化请求带超时({
            parentSignal: requestSignal,
            firstResponseTimeoutMs: requestTimeouts.firstResponseMs,
            streamIdleTimeoutMs: requestTimeouts.idleMs,
            task: (signal, onTimeoutDelta) => textAIService.generatePolishedBody(
                (bodyOverride || '').trim() || sourceBody,
                retryHint ? `${prompt}\n\n${retryHint}` : prompt,
                polishApi,
                signal,
                polishExtraPrompt,
                polishCotPseudoPrompt,
                !shouldNonStream && guardedOnDelta ? {
                    stream: true,
                    onDelta: (delta, accumulated) => {
                        onTimeoutDelta(delta, accumulated);
                        guardedOnDelta(delta, accumulated);
                    }
                } : undefined,
                prefetchedRawText
            ),
            resolveCompletedDraft: (accumulated) => {
                if (!/<正文>[\s\S]*<\/正文>/.test(accumulated)) return null;
                return {
                    rawText: accumulated,
                    bodyText: 提取正文标签内容(accumulated)
                };
            }
        });
        const pollution = 检测文章优化协议确认污染(result.rawText || result.bodyText || '');
        if (pollution.polluted) {
            throw new Error(pollution.reason);
        }
        const timePollution = 检测文章优化时间真值污染(result.bodyText || result.rawText || '');
        if (timePollution?.polluted) {
            throw new Error(timePollution.reason);
        }
        return result;
    };
    const 提取可续写半成品正文 = (result: { bodyText?: string; rawText?: string } | undefined, logs: 正文日志结构): string => {
        const body = (result?.bodyText || '').trim();
        if (body) return body;
        const rawBody = 提取正文标签内容(result?.rawText || '').trim();
        if (rawBody) return rawBody;
        return 构建正文文本(logs).trim();
    };

    let polishedResult;
    try {
        polishedResult = await 执行一次文章优化(effectivePolishPrompt, '', undefined, options?.prefetchedRawText);
    } catch (error) {
        if (options?.signal?.aborted || !是否文章优化协议污染错误(error)) throw error;
        polishedResult = await 执行一次文章优化(effectivePolishPrompt, [
            '【自动重试：禁止协议确认复读】',
            '上一版输出陷入“好的，将以 <正文> 标签输出”的确认句复读，没有给出可用正文。',
            '这次禁止输出“好的，将以……”等确认、解释或协议说明；直接输出 <thinking>...</thinking><正文>...</正文>。',
            '如果你准备确认格式，不要写确认文字，直接把润色后的正文写入 <正文>。'
        ].join('\n'));
    }
    let polishedLogs = 净化角色对白行(规范化对白日志(限制润色结果判定数量(
        sourceLogs,
        解析正文日志文本(polishedResult.bodyText, { declaredNames })
    )));
    if (polishedLogs.length === 0) {
        return { response: baseResponse, applied: false, error: '优化后正文为空，已保留原文。', rawText: polishedResult.rawText };
    }
    if (sourceDialogueCount > 0 && 统计角色对白条数(polishedLogs) < sourceDialogueCount) {
        // 对白标签丢失，尝试重生成一次
        const dialogueRetryPrompt = [
            effectivePolishPrompt,
            '【对白保留要求】',
            `原文包含 ${sourceDialogueCount} 条角色对白（格式为 "【角色名】：内容" 或 "「角色名」：内容"），优化后必须完整保留所有对白标签，不能丢失、合并或改写任何一条。`,
            '对白标签是独立变量系统识别角色互动的关键锚点，丢失会导致角色关系和情绪状态无法同步。'
        ].join('\n\n');
        const dialogueRetryResult = await 执行一次文章优化(dialogueRetryPrompt, [
            '【自动重试：禁止协议确认复读】',
            '不得输出“好的，将以……”等确认句；必须直接给出完整 <正文> 内容。'
        ].join('\n'));
        const dialogueRetryLogs = 净化角色对白行(规范化对白日志(限制润色结果判定数量(
            sourceLogs,
            解析正文日志文本(dialogueRetryResult.bodyText, { declaredNames })
        )));
        if (dialogueRetryLogs.length > 0 && 统计角色对白条数(dialogueRetryLogs) >= sourceDialogueCount) {
            polishedResult = dialogueRetryResult;
            polishedLogs = dialogueRetryLogs;
        } else {
            polishedResult = dialogueRetryResult.rawText ? dialogueRetryResult : polishedResult;
            return { response: baseResponse, applied: false, error: '文章优化重试后仍丢失角色对白标签，已保留原文。', rawText: polishedResult.rawText };
        }
    }
    const sourceLength = 统计润色正文字符数(sourceLogs);
    let polishedLength = 统计润色正文字符数(polishedLogs);
    let lengthCheck = 评估润色长度结果({
        sourceLength,
        polishedLength,
        requiredLength: requiredBodyLength,
        allowExpansionForLength: options?.allowExpansionForLength
    });
    if (!lengthCheck.ok && options?.allowExpansionForLength === true && !options?.signal?.aborted) {
        const requiredEnough = requiredBodyLength;
        const tolerance = 计算正文字数容错字数(requiredEnough);
        const retryPrompt = [
            effectivePolishPrompt,
            '【自动二次扩写要求】',
            `上一版优化正文约 ${polishedLength} 字，未达到本回合目标 ${requiredEnough} 字，且超出 ${tolerance} 字容错，因此必须重新扩写。`,
            `这次 <正文> 内可见正文尽量不少于 ${requiredEnough} 字；若只差 ${tolerance} 字以内可以接受，但不要只说明“已扩写”，必须把扩写后的正文实际写入 <正文> 标签。`,
            '只能沿用原始正文已经成立的事实补足动作过程、感官反馈、环境承接、NPC反应和结果余波；不得新增判定、改写结果或跳到新事件。'
        ].join('\n\n');
        const retryResult = await 执行一次文章优化(retryPrompt, [
            '【自动重试：禁止协议确认复读】',
            '不得输出“好的，将以……”等确认句；必须把扩写后的小说正文实际写入 <正文> 标签。'
        ].join('\n'));
        const retryLogs = 净化角色对白行(规范化对白日志(限制润色结果判定数量(
            sourceLogs,
            解析正文日志文本(retryResult.bodyText, { declaredNames })
        )));
        const retryLength = 统计润色正文字符数(retryLogs);
        const retryCheck = 评估润色长度结果({
            sourceLength,
            polishedLength: retryLength,
            requiredLength: requiredBodyLength,
            allowExpansionForLength: true
        });
        if (retryLogs.length > 0 && retryCheck.ok) {
            polishedResult = retryResult;
            polishedLogs = retryLogs;
            polishedLength = retryLength;
            lengthCheck = retryCheck;
            if (sourceDialogueCount > 0 && 统计角色对白条数(polishedLogs) < sourceDialogueCount) {
                return { response: baseResponse, applied: false, error: '文章优化二次扩写丢失了角色对白标签，已保留原文。', rawText: polishedResult.rawText };
            }
        } else if (!retryCheck.ok) {
            const partialBody = 提取可续写半成品正文(retryResult, retryLogs.length > 0 ? retryLogs : polishedLogs);
            if (partialBody && !options?.signal?.aborted) {
                const continuationPrompt = [
                    effectivePolishPrompt,
                    '【自动抗截断续写要求】',
                    `上一版扩写正文约 ${retryLength} 字，仍低于目标 ${requiredEnough} 字，疑似模型输出被截断或过早收束。`,
                    '下面会同时提供“原始事实大纲”和“上一版半成品正文”。你必须保留半成品中已经写出的有效正文，从断点继续补足，并输出一版从开头到结尾都完整的 <正文>。',
                    '禁止只输出续写片段；禁止重新压缩成摘要；禁止改变事实、判定数量、角色名、已发生结果或跳到新事件。',
                    `最终 <正文> 内可见正文尽量不少于 ${requiredEnough} 字；必须闭合 </正文> 标签。`
                ].join('\n\n');
                const continuationSource = [
                    '【原始正文事实大纲】',
                    sourceBody,
                    '',
                    '【上一版半成品正文，疑似截断】',
                    partialBody
                ].join('\n');
                const continuationResult = await 执行一次文章优化(continuationPrompt, [
                    '【自动重试：续写补全】',
                    '请把上一版半成品正文续写补完整，并输出完整 <thinking>...</thinking><正文>...</正文>。'
                ].join('\n'), continuationSource);
                const continuationLogs = 净化角色对白行(规范化对白日志(限制润色结果判定数量(
                    sourceLogs,
                    解析正文日志文本(continuationResult.bodyText, { declaredNames })
                )));
                const continuationLength = 统计润色正文字符数(continuationLogs);
                const continuationCheck = 评估润色长度结果({
                    sourceLength,
                    polishedLength: continuationLength,
                    requiredLength: requiredBodyLength,
                    allowExpansionForLength: true
                });
                if (continuationLogs.length > 0 && continuationCheck.ok) {
                    polishedResult = continuationResult;
                    polishedLogs = continuationLogs;
                    polishedLength = continuationLength;
                    lengthCheck = continuationCheck;
                    if (sourceDialogueCount > 0 && 统计角色对白条数(polishedLogs) < sourceDialogueCount) {
                        return { response: baseResponse, applied: false, error: '文章优化抗截断续写丢失了角色对白标签，已保留原文。', rawText: polishedResult.rawText };
                    }
                } else {
                    lengthCheck = {
                        ok: false,
                        error: `文章优化未应用：抗截断续写后正文仍偏短（当前约 ${continuationLength} 字，目标至少 ${requiredEnough} 字，容错 ${tolerance} 字），已保留原始正文。`
                    };
                    polishedResult = continuationResult.rawText ? continuationResult : retryResult;
                }
            } else {
                lengthCheck = {
                    ok: false,
                    error: `文章优化未应用：二次扩写后正文仍偏短（当前约 ${retryLength} 字，目标至少 ${requiredEnough} 字，容错 ${tolerance} 字），已保留原始正文。`
                };
            }
        }
    }
    if (!lengthCheck.ok) {
        return {
            response: baseResponse,
            applied: false,
            error: lengthCheck.error,
            rawText: polishedResult.rawText
        };
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
