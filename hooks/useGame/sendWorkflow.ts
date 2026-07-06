import * as textAIService from '../../services/ai/text';
import { recordAiParseFailureDiagnostic } from '../../services/diagnosticContext';
import { recordDiagnosticLog } from '../../services/diagnosticLog';
import type { GameResponse, OpeningConfig, 聊天记录结构, 记忆系统结构, 角色数据结构, 剧情系统结构, 剧情规划结构, 女主剧情规划结构, 同人剧情规划结构, 同人女主剧情规划结构, 世界书结构, 内置提示词条目结构, 叙事状态结构, 叙事平静值配置结构 } from '../../types';
import { 获取主剧情接口配置, 获取剧情回忆接口配置, 获取文章优化接口配置, 获取变量计算接口配置, 获取世界演变接口配置, 获取规划分析接口配置, 获取地图自动更新接口配置, 接口配置是否可用, 变量校准功能已启用 as 变量生成功能已启用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 计算正文字数容错字数, 正文字数差距在容错内 } from '../../utils/bodyLengthTolerance';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 规范化记忆配置, 规范化记忆系统, 构建即时记忆条目, 构建短期记忆条目, 写入四段记忆 } from './memoryUtils';
import { 提取剧情回忆标签 } from './memoryRecall';
import { 执行剧情回忆检索 } from './recallWorkflow';
import { 构建主剧情请求参数, type 主剧情系统上下文 } from './mainStoryRequest';
import { 环境时间转标准串 } from './timeUtils';
import { 检测文章优化协议确认污染 } from './bodyPolish';
import { 分析世界到期触发 } from './worldEvolutionUtils';
import { 按世界演变分流净化响应 } from './storyResponseGuards';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import type { 自动存档快照结构 } from './saveCoordinator';
import type { 世界演变触发参数, 世界演变执行结果 } from './worldEvolutionWorkflow';
import type { 地图更新执行结果 } from './mapUpdateWorkflow';
import { 生成地图更新 } from './mapUpdateWorkflow';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 同步剧情小说分解时间校准 } from '../../services/novelDecompositionCalibration';
import { 提取命中新女性角色姓名黑名单 } from '../../utils/femaleNameSelector';
import { 检测社交删除风险命令 } from '../../utils/npcRetentionGuard';
import { 构建标签缺失补充提示 } from '../../utils/parseErrorHints';
import { 对AI输出执行酒馆正则 } from '../../utils/tavernRegexEngine';
import { 从AI文本提取选项, 提取酒馆选项 } from '../../utils/tavernOptionRenderer';
import { 获取预设已分类正则脚本 } from '../../utils/tavernPreset';
import { 从文本解析推理块 } from '../../utils/tavernTemplateEngine';

type 回忆检索进度 = {
    phase: 'start' | 'stream' | 'done' | 'error';
    text?: string;
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type 正文润色进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type 正文字数不足信息 = {
    actual: number;
    required: number;
    shortage: number;
    tolerance: number;
    withinTolerance: boolean;
    message: string;
};

type 变量生成进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type 独立阶段标识 = 'polish' | 'world' | 'planning' | 'variable' | 'map';
type 独立阶段失败决策 = 'retry' | 'skip';
type 独立阶段失败决策参数 = {
    stageId: 独立阶段标识;
    stageLabel: string;
    errorText: string;
    manualAttempt?: number;
};

type 规划分析进度 = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type 世界演变进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled' | 'stream';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type 地图更新进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

export const 构建中断流式草稿历史 = (params: {
    baseHistory: 聊天记录结构[];
    draftText?: string;
    draftTimestamp?: number;
    gameTime?: string;
    summary?: string;
    detailPrefix?: string;
}): 聊天记录结构[] | null => {
    const draft = typeof params.draftText === 'string' ? params.draftText.trim() : '';
    if (!draft) return null;
    const summary = (params.summary || '主剧情生成中断').trim();
    const detailPrefix = (params.detailPrefix || '本次主剧情后续处理失败').trim();
    const timestamp = Number.isFinite(Number(params.draftTimestamp)) && Number(params.draftTimestamp) > 0
        ? Number(params.draftTimestamp)
        : Date.now();
    return [
        ...params.baseHistory,
        {
            role: 'assistant',
            content: draft,
            timestamp,
            gameTime: params.gameTime
        },
        {
            role: 'system',
            content: `[系统提示]: ${detailPrefix}，已保留上方流式正文草稿，可复制或编辑后重解析。错误：${summary}`,
            timestamp: Date.now()
        }
    ];
};

const 格式化命令展示路径 = (key: string): string => key.replace(/^gameState\./, '');
const 队列命令展示数量上限 = 120;
const 队列命令展示单行上限 = 1800;
const 主剧情首次响应超时毫秒 = 90_000;
const 主剧情流式空闲超时毫秒 = 120_000;

const 读取接口主机 = (baseUrl?: string): string => {
    const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!raw) return '';
    try {
        return new URL(raw).host;
    } catch {
        return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw.slice(0, 120);
    }
};

export const 统计正文字符数 = (response: GameResponse): number => (
    (Array.isArray(response.logs) ? response.logs : [])
        .map((log) => (typeof log?.text === 'string' ? log.text : ''))
        .join('')
        .replace(/\s+/g, '')
        .length
);

export const 获取主剧情正文不足信息 = (response: GameResponse, minLength: number): 正文字数不足信息 | null => {
    const required = Number.isFinite(minLength) ? Math.max(50, Math.floor(minLength)) : 0;
    if (required <= 0) return null;
    const actual = 统计正文字符数(response);
    if (actual >= required) return null;
    const shortage = required - actual;
    const tolerance = 计算正文字数容错字数(required);
    const withinTolerance = 正文字数差距在容错内(actual, required);
    return {
        actual,
        required,
        shortage,
        tolerance,
        withinTolerance,
        message: withinTolerance
            ? `正文略短：当前约 ${actual} 字，低于设置要求 ${required} 字，差 ${shortage} 字（容错 ${tolerance} 字内）。`
            : `正文过短：当前约 ${actual} 字，低于设置要求 ${required} 字，差 ${shortage} 字。`
    };
};

export const 校验主剧情正文最低字数 = (response: GameResponse, minLength: number, rawText: string) => {
    const shortage = 获取主剧情正文不足信息(response, minLength);
    if (!shortage) return;
    if (shortage.withinTolerance) return;
    const error = new textAIService.StoryResponseParseError(
        `${shortage.message}请完整重写本回合正文，并保持标签协议完整。`,
        rawText,
        shortage.message
    );
    (error as any).reasonType = 'body_length_shortage';
    (error as any).bodyLengthShortage = shortage;
    throw error;
};

export const 是否正文字数不足错误 = (error: any): boolean => (
    error?.reasonType === 'body_length_shortage'
    || Boolean(error?.bodyLengthShortage)
    || /正文(?:过短|略短)/.test(String(error?.parseDetail || error?.message || ''))
);

export const 提取自动重试原因文本 = (error: any): string => {
    if (是否正文字数不足错误(error)) {
        return '正文过短，正在补足正文';
    }
    if (error instanceof textAIService.StoryResponseParseError || error?.name === 'StoryResponseParseError') {
        return '解析失败，正在重新生成';
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    return '请求失败，正在重试';
};

export const 校验响应未命中女性姓名黑名单 = (
    response: GameResponse,
    rawText: string,
    stageLabel = '主剧情',
    currentSocial?: any[]
) => {
    const hits = 提取命中新女性角色姓名黑名单({
        response,
        currentSocial
    });
    if (hits.length <= 0) return;
    const detail = `${stageLabel}命中女性模板姓名黑名单：${hits.join('、')}。请完整重新生成本回合正文和变量命令，改用更贴合世界观的原创真实姓名，并保持正文 sender 与社交姓名一致。`;
    const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
    (error as any).parseDetail = detail;
    throw error;
};

export const 校验响应人称一致性 = (
    response: GameResponse,
    rawText: string,
    expectedPov: string
) => {
    const bodyText = 构建叙事人称检测文本(response);
    if (!bodyText) return;
    const sample = bodyText.slice(0, 2000);
    const playerName = typeof response?.角色?.姓名 === 'string' ? response.角色.姓名.trim() : '';
    const secondPersonNarrationCount = 统计明显第二人称叙述(sample);
    if (expectedPov === '第二人称') {
        const hasHeShe = playerName && new RegExp(转义正则片段(playerName)).test(sample);
        if (secondPersonNarrationCount <= 0 && hasHeShe) {
            const detail = `叙事人称不符：设置了第二人称但正文使用了第三人称（出现主角姓名"${playerName}"而未出现"你"）。请用第二人称"你"重新生成正文。`;
            const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
            (error as any).parseDetail = detail;
            throw error;
        }
    } else if (expectedPov === '第一人称') {
        const hasI = 统计明显第一人称叙述(sample) > 0;
        if (!hasI && secondPersonNarrationCount >= 2) {
            const detail = '叙事人称不符：设置了第一人称但正文使用了第二人称。请用第一人称"我"重新生成正文。';
            const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
            (error as any).parseDetail = detail;
            throw error;
        }
    } else if (expectedPov === '第三人称') {
        if (secondPersonNarrationCount >= 2) {
            const detail = `叙事人称不符：设置了第三人称但正文使用了第二人称。请用第三人称"${playerName || '他/她'}"重新生成正文。`;
            const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
            (error as any).parseDetail = detail;
            throw error;
        }
    }
};

const 名器档案占位名称集合 = new Set(['无', '无名器', '无对应名器', '普通', '正常', '暂无', '不详', '未知', '待补充']);

const 规范化名器档案名称 = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().replace(/[\s\u3000]+/g, '')
        : ''
);

const 收集有效名器档案名称 = (currentSocial: any[]): string[] => {
    if (!Array.isArray(currentSocial)) return [];
    const names = new Set<string>();
    currentSocial.forEach((npc) => {
        const archives = Array.isArray(npc?.名器档案) ? npc.名器档案 : [];
        archives.forEach((item: any) => {
            const name = 规范化名器档案名称(item?.名称);
            if (!name || name.length < 2 || 名器档案占位名称集合.has(name)) return;
            names.add(name);
        });
    });
    return Array.from(names).sort((a, b) => b.length - a.length);
};

const 构建玩家可见正文文本 = (response: GameResponse): string => (
    (Array.isArray(response?.logs) ? response.logs : [])
        .map((log: any) => typeof log?.text === 'string' ? log.text : '')
        .filter(Boolean)
        .join('\n')
);

const 统计固定词出现次数 = (source: string, word: string): number => {
    if (!source || !word) return 0;
    let count = 0;
    let index = source.indexOf(word);
    while (index >= 0) {
        count += 1;
        index = source.indexOf(word, index + word.length);
    }
    return count;
};

const 提取空泛强调词滥用 = (bodyText: string): { word: string; count: number; reason: string } | null => {
    const compactText = (bodyText || '').replace(/\s+/g, '');
    if (!compactText) return null;

    const word = '极其';
    const count = 统计固定词出现次数(compactText, word);
    if (count <= 0) return null;
    if (compactText.includes(`${word}${word}`)) {
        return { word, count, reason: `连续重复「${word}」` };
    }
    if (count >= 4) {
        return { word, count, reason: `短段内高频出现 ${count} 次` };
    }
    return null;
};

const 校验响应正文未滥用空泛强调词 = (
    response: GameResponse,
    rawText: string,
    stageLabel = '主剧情'
) => {
    const issue = 提取空泛强调词滥用(构建玩家可见正文文本(response));
    if (!issue) return;
    const detail = `${stageLabel}正文滥用空泛强调词「${issue.word}」：${issue.reason}。请完整重写本回合正文，改用具体动作、感官、环境压力和可见阻力来表达强度，不能用大量「${issue.word}」硬抬情绪。`;
    const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
    (error as any).parseDetail = detail;
    throw error;
};

export const 校验响应未泄露名器档案名称 = (
    response: GameResponse,
    currentSocial: any[],
    rawText: string,
    stageLabel = '主剧情'
) => {
    const bodyText = 规范化名器档案名称(构建玩家可见正文文本(response));
    if (!bodyText) return;
    const leaked = 收集有效名器档案名称(currentSocial).filter((name) => bodyText.includes(name));
    if (leaked.length <= 0) return;
    const detail = `${stageLabel}正文泄露了内部名器档案名称：${leaked.slice(0, 5).join('、')}。名器档案名称只能用于结构化档案、判定和生图内部提示，不得出现在玩家可见正文；请完整重写本回合正文，改用代称、体质特征或自然描写。`;
    const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
    (error as any).parseDetail = detail;
    throw error;
};

export const 校验响应正文词汇审查 = (
    response: GameResponse,
    currentSocial: any[],
    rawText: string,
    stageLabel = '主剧情',
    enabled = true
) => {
    if (enabled === false) return;
    校验响应未命中女性姓名黑名单(
        response,
        rawText,
        stageLabel,
        currentSocial
    );
    校验响应未泄露名器档案名称(
        response,
        currentSocial,
        rawText,
        stageLabel
    );
    校验响应正文未滥用空泛强调词(
        response,
        rawText,
        stageLabel
    );
};

const 叙事人称元信息行正则 = /(?:玩家输入|玩家指令|当前指令|系统提示|任务提示|行动选项|选项|提示|总结|Step|已知事实|协议命中|当前地点|当前时间)/i;
const 第二人称叙述动作正则 = /你\s*(?:走|来到|进入|推开|看见|望向|抬手|伸手|感到|觉得|意识到|决定|继续|停下|听见|发现|坐下|站起|转身|拿起|打开|闭上|回头|靠近|离开)/g;
const 第一人称叙述动作正则 = /我\s*(?:走|来到|进入|推开|看见|望向|抬手|伸手|感到|觉得|意识到|决定|继续|停下|听见|发现|坐下|站起|转身|拿起|打开|闭上|回头|靠近|离开)/g;

const 转义正则片段 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const 移除引号内文本 = (value: string): string => {
    let text = value || '';
    const quoteRules = [
        /“[^”]*”/g,
        /「[^」]*」/g,
        /『[^』]*』/g,
        /"[^"]*"/g,
        /'[^']*'/g
    ];
    for (const rule of quoteRules) {
        text = text.replace(rule, '');
    }
    return text;
};

const 净化叙事人称检测文本 = (value: string): string => 移除引号内文本(value)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !叙事人称元信息行正则.test(line))
    .join('\n');

const 构建叙事人称检测文本 = (response: GameResponse): string => {
    if (!Array.isArray(response?.logs)) return '';
    return response.logs
        .filter((log: any) => {
            const sender = typeof log?.sender === 'string' ? log.sender.trim() : '';
            return !sender || sender === '旁白';
        })
        .map((log: any) => typeof log?.text === 'string' ? 净化叙事人称检测文本(log.text) : '')
        .filter(Boolean)
        .join('\n');
};

const 统计明显第二人称叙述 = (value: string): number => (value.match(第二人称叙述动作正则) || []).length;
const 统计明显第一人称叙述 = (value: string): number => (value.match(第一人称叙述动作正则) || []).length;

const 规范化姓名键 = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().replace(/[\s\u3000]+/g, '')
        : ''
);

const 提取社交姓名改写 = (response: GameResponse, currentSocial: any[]): string[] => {
    if (!Array.isArray(response?.tavern_commands) || !Array.isArray(currentSocial)) return [];
    const issues: string[] = [];
    response.tavern_commands.forEach((cmd: any) => {
        if ((cmd?.action || 'set') !== 'set') return;
        const key = typeof cmd?.key === 'string' ? cmd.key.replace(/^gameState\./, '') : '';
        const direct = key.match(/^社交\[(\d+)\]\.姓名$/);
        const whole = key.match(/^社交\[(\d+)\]$/);
        const index = direct ? Number(direct[1]) : (whole ? Number(whole[1]) : NaN);
        if (!Number.isInteger(index) || index < 0) return;
        const currentName = 规范化姓名键(currentSocial[index]?.姓名);
        const nextName = direct
            ? 规范化姓名键(cmd?.value)
            : 规范化姓名键(cmd?.value?.姓名);
        if (currentName && nextName && currentName !== nextName) {
            issues.push(`社交[${index}].姓名：${currentName} -> ${nextName}`);
        }
    });
    return issues;
};

export const 校验响应未改写既有NPC姓名 = (
    response: GameResponse,
    currentSocial: any[],
    rawText: string,
    stageLabel = '主剧情'
) => {
    const issues = 提取社交姓名改写(response, currentSocial);
    if (issues.length <= 0) return;
    const detail = `${stageLabel}试图改写已生成 NPC 姓名：${issues.join('；')}。前端不会修改既有变量，请完整重新生成本回合正文和变量命令；已有 NPC 姓名必须原样保留。`;
    const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
    (error as any).parseDetail = detail;
    throw error;
};

export const 校验响应未删除既有NPC = (
    response: GameResponse,
    currentSocial: any[],
    rawText: string,
    stageLabel = '主剧情'
) => {
    const issues = 检测社交删除风险命令(
        Array.isArray(response?.tavern_commands) ? response.tavern_commands : [],
        currentSocial
    );
    if (issues.length <= 0) return;
    const detail = `${stageLabel}试图删除或整组替换既有 NPC：${issues.join('；')}。请完整重新生成本回合正文和变量命令；未经玩家手动确认，任何 NPC 都只能更新字段、标记死亡或离场，不能从社交变量中删除。`;
    const error = new textAIService.StoryResponseParseError(detail, rawText, detail);
    (error as any).parseDetail = detail;
    throw error;
};

const 构建正文文本 = (response: GameResponse): string => (
    (Array.isArray(response.logs) ? response.logs : [])
        .filter((log) => log && typeof log.text === 'string' && log.text.trim().length > 0)
        .map((log) => {
            const sender = (log.sender || '旁白').trim() || '旁白';
            const tag = sender.startsWith('【') ? sender : `【${sender}】`;
            return `${tag}${log.text.trim()}`;
        })
        .join('\n')
);

const 创建主剧情流式超时错误 = (stage: string, timeoutMs: number): Error => {
    const isFirstResponse = stage === '等待首次响应超时';
    const suffix = isFirstResponse ? '' : '无新增量';
    const error = new Error(`主剧情乾坤推演${stage}（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒${suffix}）`);
    error.name = 'TimeoutError';
    return error;
};

const 主剧情协议必需标签 = ['正文', '短期记忆', '命令'];

const 规范化已知对白姓名 = (value: unknown): string => (
    typeof value === 'string' ? value.replace(/[【】\[\]「」『』“”"']/g, '').replace(/\s+/g, '').trim() : ''
);

export const 收集主剧情已知对白说话人 = (
    playerRole?: Partial<角色数据结构> | null,
    socialList?: any[]
): string[] => {
    const names = new Set<string>();
    const addName = (value: unknown) => {
        const name = 规范化已知对白姓名(value);
        if (name && name !== '旁白' && name !== '奖励') names.add(name);
    };

    addName(playerRole?.姓名);
    (Array.isArray(socialList) ? socialList : []).forEach((npc: any) => {
        if (!npc || typeof npc !== 'object') return;
        const shouldTrust = npc.是否在场 === true
            || npc.是否主要角色 === true
            || npc.是否队友 === true
            || npc.对白登场 === true;
        if (!shouldTrust) return;
        addName(npc.姓名);
        addName(npc.名称);
    });

    return Array.from(names);
};

const 标签块已完整闭合 = (text: string, tag: string): boolean => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`<\\s*${escaped}\\s*>[\\s\\S]*?<\\s*\\/\\s*${escaped}\\s*>`, 'i').test(text);
};

export const 主剧情流式草稿已具备完整协议 = (
    draftText: string,
    options?: {
        requireActionOptionsTag?: boolean;
        requireDynamicWorldTag?: boolean;
        acceptTavernBranches?: boolean;
    }
): boolean => {
    const text = typeof draftText === 'string' ? draftText.trim() : '';
    if (!text) return false;
    if (
        options?.acceptTavernBranches
        && 标签块已完整闭合(text, 'branches')
        && 从AI文本提取选项(text).length > 0
        && text
            .replace(/<\s*branches\s*>[\s\S]*?<\s*\/\s*branches\s*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim().length > 0
    ) {
        return true;
    }
    const requiredTags = [
        ...主剧情协议必需标签,
        ...(options?.requireActionOptionsTag ? ['行动选项'] : []),
        ...(options?.requireDynamicWorldTag ? ['动态世界'] : [])
    ];
    return requiredTags.every((tag) => 标签块已完整闭合(text, tag));
};

export const 尝试解析完整主剧情流式草稿 = (
    draftText: string,
    requestOptions?: {
        validateTagCompleteness?: boolean;
        enableTagRepair?: boolean;
        requireActionOptionsTag?: boolean;
        requireDynamicWorldTag?: boolean;
        acceptTavernBranches?: boolean;
        validateDialogueFormat?: boolean;
        knownSpeakers?: string[];
    }
): textAIService.StoryResponseResult | null => {
    const rawText = typeof draftText === 'string' ? draftText.trim() : '';
    if (!主剧情流式草稿已具备完整协议(rawText, requestOptions)) return null;
    try {
        const tavernOptions = requestOptions?.acceptTavernBranches ? 从AI文本提取选项(rawText) : [];
        const response = textAIService.parseStoryRawText(rawText, {
            validateTagCompleteness: requestOptions?.validateTagCompleteness,
            enableTagRepair: requestOptions?.enableTagRepair,
            requireActionOptionsTag: requestOptions?.acceptTavernBranches ? false : requestOptions?.requireActionOptionsTag,
            requireDynamicWorldTag: requestOptions?.requireDynamicWorldTag,
            validateDialogueFormat: requestOptions?.validateDialogueFormat,
            knownSpeakers: requestOptions?.knownSpeakers
        });
        if (tavernOptions.length > 0 && (!Array.isArray(response.action_options) || response.action_options.length === 0)) {
            response.action_options = tavernOptions;
        }
        const hasBody = Array.isArray(response.logs)
            && response.logs.some((log) => typeof log?.text === 'string' && log.text.trim().length > 0);
        return hasBody ? { response, rawText } : null;
    } catch {
        return null;
    }
};

const 构建标签协议失败自动回炉提示 = (reason: string, requireActionOptionsTag: boolean): string => [
    '【标签协议失败自动回炉】',
    `上一版被拒绝原因：${reason || '返回内容不符合标签协议'}`,
    '请不要解释原因，不要输出协议说明，不要输出补丁，只能完整重写本回合。',
    '硬性要求：顶层标签必须完整闭合，至少包含 <正文>...</正文>、<短期记忆>...</短期记忆>、<命令>...</命令>。',
    requireActionOptionsTag
        ? '当前已开启行动选项，必须额外补全 <行动选项>...</行动选项>。'
        : '若未开启行动选项，不要额外编造无关顶层标签。',
    '如果接近输出上限，优先收束正文并闭合所有已打开标签。'
].join('\n');

const 是否正文质量审查错误 = (error: any): boolean => {
    const text = String(error?.parseDetail || error?.message || '');
    return /正文.*(?:空泛强调词|高频套话|硬抬情绪|低质量)|(?:空泛强调词|高频套话|硬抬情绪)/u.test(text);
};

const 构建正文质量失败自动重写提示 = (reason: string): string => [
    '【自动重试正文质量修正】',
    `上一版被拒绝原因：${reason || '正文质量审查未通过'}`,
    '请完整重新生成本回合，不要只输出补丁，不要解释原因。',
    '硬性要求：删除空泛强调词堆叠，尤其不要连续或高频使用“极其、非常、无比、极度”等万能加强词。',
    '硬性要求：用具体动作、感官反馈、环境压力、可见阻力和人物反应来表达强度，不要用重复副词硬抬情绪。',
    '仍需保持 <正文>、<短期记忆>、<命令> 等标签协议完整闭合。'
].join('\n');

const 执行主剧情流式请求带空闲超时 = async <T,>(
    parentSignal: AbortSignal,
    task: (signal: AbortSignal, markStreamActivity: () => void) => Promise<T>,
    resolveCompletedDraft?: () => T | null
): Promise<T> => {
    if (parentSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const requestController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rejectTimeout: ((reason?: any) => void) | null = null;
    let hasStreamActivity = false;
    const streamTrace = {
        requestStartAt: Date.now(),
        firstDeltaAt: null as number | null,
        lastDeltaAt: null as number | null,
        deltaCount: 0
    };

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    const abortByParent = () => {
        requestController.abort(parentSignal.reason || new DOMException('Aborted', 'AbortError'));
    };
    const startTimer = () => {
        clearTimer();
        const timeoutMs = hasStreamActivity ? 主剧情流式空闲超时毫秒 : 主剧情首次响应超时毫秒;
        timer = setTimeout(() => {
            const completedResult = hasStreamActivity ? resolveCompletedDraft?.() : null;
            if (completedResult) {
                const diagnosticInfo = {
                    reason: 'acceptedDraft_and_aborted_stream',
                    timeoutMs,
                    hasStreamActivity,
                    firstDeltaAt: streamTrace.firstDeltaAt,
                    lastDeltaAt: streamTrace.lastDeltaAt,
                    deltaCount: streamTrace.deltaCount,
                    idleSinceLastDeltaMs: streamTrace.lastDeltaAt ? Date.now() - streamTrace.lastDeltaAt : null,
                    totalElapsedMs: Date.now() - streamTrace.requestStartAt,
                    completedResult
                };
                console.warn('[主剧情流式超时] 已收到完整协议草稿，接受当前草稿并中止尾部挂起连接', {
                    timeoutMs,
                    hasStreamActivity,
                    timeoutStage: '流式输出空闲超时',
                    firstDeltaAt: streamTrace.firstDeltaAt,
                    lastDeltaAt: streamTrace.lastDeltaAt,
                    deltaCount: streamTrace.deltaCount,
                    idleSinceLastDeltaMs: streamTrace.lastDeltaAt ? Date.now() - streamTrace.lastDeltaAt : null,
                    totalElapsedMs: Date.now() - streamTrace.requestStartAt
                });
                recordDiagnosticLog('warn', ['主剧情流式超时-接受完整草稿', diagnosticInfo]);
                rejectTimeout?.(completedResult);
                try {
                    requestController.abort(new DOMException('Completed stream draft accepted', 'AbortError'));
                } catch {
                    requestController.abort();
                }
                return;
            }
            const timeoutStage = hasStreamActivity ? '流式输出空闲超时' : '等待首次响应超时';
            const timeoutError = 创建主剧情流式超时错误(timeoutStage, timeoutMs);
            const diagnosticInfo = {
                timeoutMs,
                hasStreamActivity,
                timeoutStage,
                requestStartAt: streamTrace.requestStartAt,
                firstDeltaAt: streamTrace.firstDeltaAt,
                lastDeltaAt: streamTrace.lastDeltaAt,
                deltaCount: streamTrace.deltaCount,
                idleSinceLastDeltaMs: streamTrace.lastDeltaAt ? Date.now() - streamTrace.lastDeltaAt : null,
                totalElapsedMs: Date.now() - streamTrace.requestStartAt
            };
            console.warn(`[主剧情流式超时] ${timeoutStage}，准备中止本次请求并交给自动重试`, {
                ...diagnosticInfo,
                reason: timeoutError.message
            });
            recordDiagnosticLog('warn', ['主剧情流式超时', diagnosticInfo]);
            try {
                requestController.abort(timeoutError);
            } catch {
                requestController.abort();
            }
            rejectTimeout?.(timeoutError);
        }, timeoutMs);
    };
    const markStreamActivity = () => {
        hasStreamActivity = true;
        const now = Date.now();
        if (streamTrace.firstDeltaAt === null) streamTrace.firstDeltaAt = now;
        streamTrace.lastDeltaAt = now;
        streamTrace.deltaCount++;
        startTimer();
    };

    parentSignal.addEventListener('abort', abortByParent, { once: true });
    startTimer();

    try {
        return await Promise.race([
            task(requestController.signal, markStreamActivity),
            new Promise<T>((resolve, reject) => {
                rejectTimeout = (reason?: any) => {
                    if (reason && typeof reason === 'object' && 'response' in reason && 'rawText' in reason) {
                        resolve(reason as T);
                        return;
                    }
                    reject(reason);
                };
            })
        ]);
    } catch (error) {
        const signalReason = requestController.signal.reason as any;
        if (requestController.signal.aborted && signalReason?.name === 'TimeoutError') {
            throw signalReason;
        }
        throw error;
    } finally {
        clearTimer();
        parentSignal.removeEventListener('abort', abortByParent);
    }
};

const 获取队列调试时间 = (): number => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const 记录队列工作流调试 = (label: string, details: Record<string, unknown> = {}, warn = false) => {
    const payload = {
        at: new Date().toISOString(),
        label,
        ...details
    };
    const log = warn ? console.warn : console.debug;
    log("[MoRanQueueDebug] workflow", payload);
};

const 计时同步队列步骤 = <T,>(label: string, run: () => T, details: Record<string, unknown> = {}): T => {
    const startedAt = 获取队列调试时间();
    try {
        return run();
    } finally {
        const durationMs = Math.round(获取队列调试时间() - startedAt);
        if (durationMs > 80) {
            记录队列工作流调试(label, { ...details, durationMs }, true);
        }
    }
};

const 让出主线程 = (): Promise<void> => new Promise((resolve) => {
    if (typeof window === 'undefined') {
        setTimeout(resolve, 0);
        return;
    }
    window.setTimeout(resolve, 0);
});

const 获取响应命令数量 = (response: Partial<GameResponse> | null | undefined): number => (
    Array.isArray(response?.tavern_commands) ? response.tavern_commands.length : 0
);

const 截断队列命令展示文本 = (value: string): string => {
    if (value.length <= 队列命令展示单行上限) return value;
    const headLength = Math.floor(队列命令展示单行上限 * 0.68);
    const tailLength = 队列命令展示单行上限 - headLength;
    return [
        value.slice(0, headLength),
        `[队列调试] 单条命令展示文本过长，已截断：原始 ${value.length} 字符。`,
        value.slice(value.length - tailLength)
    ].join("\n");
};

const 安全序列化队列命令值 = (value: unknown, key: string): string => 计时同步队列步骤(
    "serializeCommandValue",
    () => {
        let serialized = "";
        try {
            serialized = JSON.stringify(value ?? null);
        } catch {
            serialized = String(value ?? null);
        }
        if (serialized.length > 队列命令展示单行上限) {
            记录队列工作流调试("serializeCommandValue.large", {
                key,
                length: serialized.length
            }, true);
        }
        return 截断队列命令展示文本(serialized);
    },
    { key }
);

const 序列化命令文本 = (cmd: any): string => {
    const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
    const key = 格式化命令展示路径(typeof cmd?.key === 'string' ? cmd.key : '');
    if (action === 'delete') return `${action} ${key}`;
    return `${action} ${key} = ${安全序列化队列命令值(cmd?.value ?? null, key)}`;
};

const 构建带索引命令文本 = (commands: any[], startIndex: number): string[] => {
    const list = Array.isArray(commands) ? commands : [];
    if (list.length > 队列命令展示数量上限) {
        记录队列工作流调试("buildCommandDisplayText.largeList", {
            commandCount: list.length,
            renderedCount: 队列命令展示数量上限
        }, true);
    }
    const rendered = list
        .slice(0, 队列命令展示数量上限)
        .map((cmd, index) => {
            const body = 序列化命令文本(cmd);
            return body.trim() ? `[#${startIndex + index}] ${body}` : '';
        })
        .filter(Boolean);
    if (list.length > 队列命令展示数量上限) {
        rendered.push(`[队列调试] 命令列表过长，已截断展示：共 ${list.length} 条，仅展示前 ${队列命令展示数量上限} 条。`);
    }
    return rendered;
};

type 队列阶段模型信息 = {
    channelName?: string;
    modelName?: string;
};

type 队列阶段计时进度 = {
    phase?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

const 队列阶段已结束 = (phase?: string): boolean => (
    phase === 'done'
    || phase === 'error'
    || phase === 'skipped'
    || phase === 'cancelled'
);

const 获取队列阶段渠道键 = (config: any, mainConfig?: any | null): string => {
    if (!config) return '';
    return [
        String(config.id || config.名称 || config.供应商 || '').trim(),
        String(config.baseUrl || '').trim().replace(/\/+$/, ''),
        String(config.apiKey || '').trim()
    ].filter(Boolean).join('|') || String(mainConfig?.id || mainConfig?.名称 || mainConfig?.供应商 || '').trim();
};

const 构建队列阶段模型信息 = (
    stageLabel: string,
    config: any,
    mainConfig?: any | null
): 队列阶段模型信息 => {
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

const 合并变量结果到展示响应 = (
    displayResponse: GameResponse,
    mergedParsed: GameResponse
): GameResponse => ({
    ...displayResponse,
    tavern_commands: Array.isArray(mergedParsed.tavern_commands) ? mergedParsed.tavern_commands : [],
    variable_calibration_report: mergedParsed.variable_calibration_report,
    variable_calibration_commands: mergedParsed.variable_calibration_commands,
    variable_calibration_model: mergedParsed.variable_calibration_model
});

const 附加队列阶段模型信息 = <T extends { channelName?: string; modelName?: string }>(
    progress: T,
    info: 队列阶段模型信息
): T => ({
    ...progress,
    channelName: progress.channelName || info.channelName,
    modelName: progress.modelName || info.modelName
});

export type 发送选项 = {
    onRecallProgress?: (progress: 回忆检索进度) => void;
    onPolishProgress?: (progress: 正文润色进度) => void;
    onWorldEvolutionProgress?: (progress: 世界演变进度) => void;
    onPlanningProgress?: (progress: 规划分析进度) => void;
    onVariableGenerationProgress?: (progress: 变量生成进度) => void;
    onMapUpdateProgress?: (progress: 地图更新进度) => void;
    onStageFailureDecision?: (params: 独立阶段失败决策参数) => Promise<独立阶段失败决策> | 独立阶段失败决策;
};

export type 发送结果 = {
    cancelled?: boolean;
    attachedRecallPreview?: string;
    preparedRecallTag?: string;
    needRecallConfirm?: boolean;
    recallFailed?: boolean;
    needRerollConfirm?: boolean;
    parseErrorMessage?: string;
    parseErrorDetail?: string;
    parseErrorRawText?: string;
    errorDetail?: string;
    errorTitle?: string;
    recoveryHint?: string;
};

type 回合快照结构 = {
    玩家输入: string;
    游戏时间: string;
    回档前状态: {
        角色: any;
        环境: any;
        社交: any[];
        世界: any;
        战斗: any;
        玩家门派: any;
        任务列表: any[];
        约定列表: any[];
        剧情: 剧情系统结构;
        剧情规划: 剧情规划结构;
        女主剧情规划?: 女主剧情规划结构;
        同人剧情规划?: 同人剧情规划结构;
        同人女主剧情规划?: 同人女主剧情规划结构;
        记忆系统: 记忆系统结构;
        叙事平静值?: 叙事状态结构;
    };
    回档前持久态: {
        视觉设置: any;
        场景图片档案: any;
    };
    回档前历史: 聊天记录结构[];
};

type 主剧情发送当前状态 = {
    历史记录: 聊天记录结构[];
    记忆系统: 记忆系统结构;
    角色: 角色数据结构;
    环境: any;
    社交: any[];
    世界: any;
    战斗: any;
    玩家门派: any;
    任务列表: any[];
    约定列表: any[];
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
    开局配置?: OpeningConfig;
    游戏初始时间?: string;
    loading: boolean;
    gameConfig: any;
    apiConfig: any;
    memoryConfig: any;
    visualConfig: any;
    sceneImageArchive: any;
    prompts: any[];
    内置提示词列表: 内置提示词条目结构[];
    世界书列表: 世界书结构[];
    叙事平静值?: 叙事状态结构;
    叙事平静值配置?: 叙事平静值配置结构;
};

type 主剧情发送依赖 = {
    abortControllerRef: { current: AbortController | null };
    recallAbortControllerRef: { current: AbortController | null };
    前台发送序号Ref?: { current: number };
    setLoading: (value: boolean) => void;
    set后台队列处理中: (value: boolean) => void;
    setShowSettings: (value: boolean) => void;
    设置剧情: (value: 剧情系统结构) => void;
    设置历史记录: (value: 聊天记录结构[] | ((prev: 聊天记录结构[]) => 聊天记录结构[])) => void;
    设置叙事平静值: (value: 叙事状态结构) => void;
    应用并同步记忆系统: (memory: 记忆系统结构, options?: { 静默总结提示?: boolean }) => void;
    构建系统提示词: (promptPool: any[], memoryData: 记忆系统结构, socialData: any[], statePayload: any, options?: any) => Promise<主剧情系统上下文 & {
        runtimePromptStates: Record<string, any>;
    }> | (主剧情系统上下文 & {
        runtimePromptStates: Record<string, any>;
    });
    processResponseCommands: (
        response: GameResponse,
        baseState?: Partial<响应命令处理状态>,
        options?: { applyState?: boolean }
    ) => 响应命令处理状态;
    performAutoSave: (snapshot?: 自动存档快照结构) => Promise<void>;
    执行NPC变量自动备份?: (socialList: any[], options?: { 标签?: string }) => void | Promise<void>;
    执行正文润色: (
        baseResponse: GameResponse,
        rawText: string,
        options?: { manual?: boolean; playerInput?: string; signal?: AbortSignal; allowExpansionForLength?: boolean; minLength?: number }
    ) => Promise<{ response: GameResponse; applied: boolean; error?: string; rawText?: string }>;
    执行世界演变更新: (params?: 世界演变触发参数) => Promise<世界演变执行结果>;
    触发新增NPC自动生图: (npcs: any[]) => void;
    触发对白NPC头像补全: (npcs: any[]) => void;
    检查主角每回合生图: (player: 角色数据结构) => void;
    触发场景自动生图: (params: {
        response: GameResponse;
        bodyText?: string;
        env?: any;
        turnNumber?: number;
        playerInput?: string;
        source?: 'auto' | 'manual' | 'retry';
        autoApply?: boolean;
    }) => void;
    应用常驻壁纸为背景: () => Promise<void> | void;
    提取新增NPC列表: (beforeList: any[], afterList: any[]) => any[];
    推入重Roll快照: (snapshot: 回合快照结构) => void;
    弹出重Roll快照: () => 回合快照结构 | undefined;
    回档到快照: (snapshot: 回合快照结构, options?: { 保留图片状态?: boolean }) => void;
    深拷贝: <T>(value: T) => T;
    按回合窗口裁剪历史: (history: 聊天记录结构[], rounds: number) => 聊天记录结构[];
    规范化环境信息: (envLike?: any) => any;
    规范化剧情状态: (raw?: any, envLike?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构 | undefined;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    规范化世界状态: (raw?: any) => any;
    游戏设置启用自动重试: (config?: any) => boolean;
    执行带自动重试的生成请求: <T>(params: {
        enabled: boolean;
        action: (attempt: number, lastError?: any) => Promise<T>;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
    }) => Promise<T>;
    更新流式草稿为自动重试提示: (history: 聊天记录结构[], attempt: number, maxAttempts: number, reason?: string) => 聊天记录结构[];
    提取解析失败原始信息: (error: any) => string;
    提取原始报错详情: (error: any) => string;
    格式化错误详情: (error: any) => string;
    获取原始AI消息: (rawText: string) => string;
    估算消息Token: (messages: Array<{ role?: string; content?: string; name?: string }>, model?: string) => number;
    估算AI输出Token: (text: string, model?: string) => number;
    计算回复耗时秒: (startedAt: number, finishedAt?: number) => number;
    文章优化功能已开启: () => boolean;
    后台执行统一规划分析: (params: {
        state: {
            环境: any;
            社交: any[];
            世界: any;
            剧情: 剧情系统结构;
            剧情规划: 剧情规划结构;
            女主剧情规划?: 女主剧情规划结构;
            同人剧情规划?: 同人剧情规划结构;
            同人女主剧情规划?: 同人女主剧情规划结构;
        };
        playerInput: string;
        gameTime: string;
        response: GameResponse;
        shouldApply?: () => boolean;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
        onStreamDelta?: (delta: string, accumulated: string) => void;
        signal?: AbortSignal;
    }) => Promise<{ updated: boolean; message: string; rawText?: string; commands: any[]; storyPlanCommands?: any[]; heroinePlanCommands?: any[] }>;
    后台执行变量生成: (params: {
        snapshot: 回合快照结构;
        parsedResponse: GameResponse;
        displayResponse?: GameResponse;
        rawText: string;
        playerInput: string;
        inputTokens?: number;
        responseDurationSec?: number;
        worldEvolutionUpdated?: boolean;
        extraPromptAppend?: string;
        onProgress?: (progress: 变量生成进度) => void;
    }) => Promise<void>;
    执行变量生成并合并响应: (params: {
        snapshot: 回合快照结构;
        parsedResponse: GameResponse;
        mergeTargetResponse?: GameResponse;
        displayResponse?: GameResponse;
        rawText: string;
        playerInput: string;
        inputTokens?: number;
        responseDurationSec?: number;
        worldEvolutionUpdated?: boolean;
        extraPromptAppend?: string;
        onProgress?: (progress: 变量生成进度) => void;
    }) => Promise<{
        mergedParsed: GameResponse;
        mergedDisplayResponse: GameResponse;
        variableCalibration: {
            commands: any[];
            reports: string[];
            rawText: string;
            model: string;
        } | null;
    } | null>;
};

const 提取全部情节事件 = (rawText: string): Array<{ prefix: string; event: string }> => {
    const results: Array<{ prefix: string; event: string }> = [];
    const regex = /<情节事件>([\s\S]*?)<\/情节事件>/gi;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
        const full = match[1].trim();
        const pm = full.match(/^(介入|退出|结束|延续)[：:]?\s*/);
        if (pm) {
            results.push({ prefix: pm[1], event: full.slice(pm[0].length).trim() });
        }
    }
    return results;
};

const 计算本回合目标计数 = (
    tags: Array<{ prefix: string }>,
    当前计数: number,
    config: 叙事平静值配置结构
): number => {
    const 上限 = config.上限 ?? 32;
    const 无标签增量 = config.无标签增量 ?? 2;
    const 延续增量 = config.延续增量 ?? 1;
    if (tags.length === 0) {
        return Math.min(当前计数 + 无标签增量, 上限);
    }
    const candidates = tags.map(t => {
        if (t.prefix === '介入' || t.prefix === '退出' || t.prefix === '结束') return 0;
        return Math.min(当前计数 + 延续增量, 上限);
    });
    return Math.min(...candidates);
};

export const 执行主剧情发送工作流 = async (
    content: string,
    isStreaming: boolean,
    currentState: 主剧情发送当前状态,
    deps: 主剧情发送依赖,
    options?: 发送选项
): Promise<发送结果> => {
    let historyBeforeSend = [...currentState.历史记录];
    const lastMessage = historyBeforeSend.length > 0 ? historyBeforeSend[historyBeforeSend.length - 1] : null;

    if (
        lastMessage
        && lastMessage.role === 'system'
        && typeof lastMessage.content === 'string'
        && lastMessage.content.startsWith('[系统错误]:')
        && historyBeforeSend.length >= 2
    ) {
        const userMessageCandidate = historyBeforeSend[historyBeforeSend.length - 2];
        if (userMessageCandidate.role === 'user') {
            historyBeforeSend = historyBeforeSend.slice(0, -2);
            deps.设置历史记录(historyBeforeSend);
        }
    }

    if (!content.trim() || currentState.loading) return {};

    const activeApi = 获取主剧情接口配置(currentState.apiConfig);
    if (!接口配置是否可用(activeApi)) {
        alert('请先在设置中填写 API 地址/API Key，并选择主剧情使用模型');
        deps.setShowSettings(true);
        return { cancelled: true };
    }
    const stageModelInfo = {
        recall: 构建队列阶段模型信息('剧情回忆', 获取剧情回忆接口配置(currentState.apiConfig), activeApi),
        polish: 构建队列阶段模型信息('文章优化', 获取文章优化接口配置(currentState.apiConfig), activeApi),
        variable: 构建队列阶段模型信息('变量生成', 获取变量计算接口配置(currentState.apiConfig), activeApi),
        world: 构建队列阶段模型信息('动态世界', 获取世界演变接口配置(currentState.apiConfig), activeApi),
        planning: 构建队列阶段模型信息('规划分析', 获取规划分析接口配置(currentState.apiConfig), activeApi),
        map: 构建队列阶段模型信息('地图更新', 获取地图自动更新接口配置(currentState.apiConfig), activeApi)
    };
    const stageTiming: Partial<Record<独立阶段标识 | 'recall', { startedAt: number; finishedAt?: number }>> = {};
    const 附加队列阶段运行信息 = <T extends 队列阶段计时进度 & { channelName?: string; modelName?: string }>(
        stageId: 独立阶段标识 | 'recall',
        progress: T,
        info: 队列阶段模型信息
    ): T => {
        const now = Date.now();
        const current = stageTiming[stageId] || { startedAt: now };
        if (progress.phase === 'start' || progress.phase === 'stream') {
            current.startedAt = current.startedAt || now;
            current.finishedAt = undefined;
        } else if (队列阶段已结束(progress.phase)) {
            current.finishedAt = current.finishedAt || now;
        }
        stageTiming[stageId] = current;
        const finishedAt = current.finishedAt;
        const elapsedMs = typeof progress.elapsedMs === 'number'
            ? progress.elapsedMs
            : Math.max(0, (finishedAt || now) - current.startedAt);
        return 附加队列阶段模型信息({
            ...progress,
            startedAt: progress.startedAt || current.startedAt,
            finishedAt: progress.finishedAt || finishedAt,
            elapsedMs
        }, info);
    };
    if (options) {
        const originalOptions = options;
        options = {
            ...originalOptions,
            onRecallProgress: originalOptions.onRecallProgress
                ? (progress) => originalOptions.onRecallProgress?.(附加队列阶段运行信息('recall', progress, stageModelInfo.recall))
                : undefined,
            onPolishProgress: originalOptions.onPolishProgress
                ? (progress) => originalOptions.onPolishProgress?.(附加队列阶段运行信息('polish', progress, stageModelInfo.polish))
                : undefined,
            onVariableGenerationProgress: originalOptions.onVariableGenerationProgress
                ? (progress) => originalOptions.onVariableGenerationProgress?.(附加队列阶段运行信息('variable', progress, stageModelInfo.variable))
                : undefined,
            onWorldEvolutionProgress: originalOptions.onWorldEvolutionProgress
                ? (progress) => originalOptions.onWorldEvolutionProgress?.(附加队列阶段运行信息('world', progress, stageModelInfo.world))
                : undefined,
            onPlanningProgress: originalOptions.onPlanningProgress
                ? (progress) => originalOptions.onPlanningProgress?.(附加队列阶段运行信息('planning', progress, stageModelInfo.planning))
                : undefined,
            onMapUpdateProgress: originalOptions.onMapUpdateProgress
                ? (progress) => originalOptions.onMapUpdateProgress?.(附加队列阶段运行信息('map', progress, stageModelInfo.map))
                : undefined
        };
    }

    const mainRequestStartedAt = Date.now();
    const controller = new AbortController();
    deps.abortControllerRef.current = controller;
    const recallConfig = currentState.apiConfig?.功能模型占位 || ({} as any);
    const recallFeatureEnabled = Boolean(recallConfig.剧情回忆独立模型开关);
    const recallMinRound = Math.max(1, Number(recallConfig.剧情回忆最早触发回合) || 10);
    const normalizedMemBeforeSend = 规范化记忆系统(currentState.记忆系统);
    const nextRound = (Array.isArray(normalizedMemBeforeSend.回忆档案) ? normalizedMemBeforeSend.回忆档案.length : 0) + 1;
    const recallRoundReady = nextRound >= recallMinRound;
    const extracted = 提取剧情回忆标签(content);
    let sendInput = extracted.cleanInput || content.trim();
    let recallTag = extracted.recallTag;
    let attachedRecallPreview = '';
    // 动态超时：基础 + 每 10 回合追加，封顶上限。上下文越长，检索越慢，死板 25s 不够用。
    const recallMemoryConfig = 规范化记忆配置(currentState.memoryConfig);
    const recallBaseSeconds = Math.max(5, Number(recallMemoryConfig.剧情回忆检索基础超时秒数) || 25);
    const recallPer10Seconds = Math.max(0, Number(recallMemoryConfig.剧情回忆检索每10回合追加秒数) || 6);
    const recallMaxSeconds = Math.max(recallBaseSeconds, Number(recallMemoryConfig.剧情回忆检索最大超时秒数) || 180);
    const recallScaledSeconds = recallBaseSeconds + Math.floor(Math.max(0, nextRound - 1) / 10) * recallPer10Seconds;
    const recallTimeoutMs = Math.min(recallMaxSeconds, recallScaledSeconds) * 1000;
    const recallMaxAttempts = 2;

    const createRecallTimeoutError = () => {
        const error = new Error(`剧情回忆检索超时（${Math.max(1, Math.ceil(recallTimeoutMs / 1000))} 秒）`);
        error.name = 'TimeoutError';
        return error;
    };

    const runRecallAttempt = async () => {
        const recallController = new AbortController();
        deps.recallAbortControllerRef.current = recallController;
        const abortRecall = () => recallController.abort();
        controller.signal.addEventListener('abort', abortRecall, { once: true });

        try {
            return await new Promise<Awaited<ReturnType<typeof 执行剧情回忆检索>>>((resolve, reject) => {
                const timeoutId = window.setTimeout(() => {
                    recallController.abort();
                    reject(createRecallTimeoutError());
                }, recallTimeoutMs);

                执行剧情回忆检索(
                    sendInput,
                    normalizedMemBeforeSend,
                    currentState.apiConfig,
                    {
                        signal: recallController.signal,
                        onDelta: (_delta, accumulated) => {
                            options?.onRecallProgress?.({ phase: 'stream', text: accumulated });
                        }
                    },
                    currentState.gameConfig
                ).then(resolve).catch(reject).finally(() => {
                    window.clearTimeout(timeoutId);
                });
            });
        } finally {
            controller.signal.removeEventListener('abort', abortRecall);
            if (deps.recallAbortControllerRef.current === recallController) {
                deps.recallAbortControllerRef.current = null;
            }
        }
    };

    if (recallFeatureEnabled && recallRoundReady && !recallTag) {
        try {
            options?.onRecallProgress?.({ phase: 'start', text: '正在检索剧情回忆...' });
            let recalled = null;
            for (let attempt = 1; attempt <= recallMaxAttempts; attempt += 1) {
                options?.onRecallProgress?.({
                    phase: 'start',
                    text: attempt > 1
                        ? `正在重试剧情回忆检索（${attempt}/${recallMaxAttempts}）...`
                        : '正在检索剧情回忆...'
                });
                try {
                    recalled = await runRecallAttempt();
                    break;
                } catch (error: any) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    if (attempt >= recallMaxAttempts) {
                        throw error;
                    }
                    options?.onRecallProgress?.({
                        phase: 'error',
                        text: `${error?.message || '剧情回忆检索失败'}\n正在自动重试...`
                    });
                }
            }
            if (!recalled) {
                deps.abortControllerRef.current = null;
                deps.recallAbortControllerRef.current = null;
                options?.onRecallProgress?.({ phase: 'error', text: '已开启剧情回忆模型，但未配置可用接口。' });
                deps.setShowSettings(true);
                return {
                    cancelled: true,
                    recallFailed: true,
                    errorTitle: '剧情回忆未配置',
                    errorDetail: '已开启剧情回忆模型，但未配置可用接口。'
                };
            }
            attachedRecallPreview = recalled.previewText;
            options?.onRecallProgress?.({ phase: 'done', text: recalled.previewText });
            const silentConfirm = Boolean(currentState.apiConfig?.功能模型占位?.剧情回忆静默确认);
            if (!silentConfirm) {
                deps.abortControllerRef.current = null;
                deps.recallAbortControllerRef.current = null;
                return {
                    cancelled: true,
                    attachedRecallPreview: recalled.previewText,
                    preparedRecallTag: recalled.tagContent,
                    needRecallConfirm: true
                };
            }
            recallTag = recalled.tagContent;
        } catch (error: any) {
            console.error('剧情回忆检索失败', error);
            options?.onRecallProgress?.({ phase: 'error', text: error?.message || '剧情回忆检索失败' });
            deps.abortControllerRef.current = null;
            deps.recallAbortControllerRef.current = null;
            return {
                cancelled: true,
                recallFailed: true,
                errorTitle: '剧情回忆检索失败',
                errorDetail: error?.message || '未知错误'
            };
        }
    }

    if (!sendInput.trim()) {
        deps.abortControllerRef.current = null;
        deps.recallAbortControllerRef.current = null;
        return { cancelled: true };
    }
    const 本次发送序号 = deps.前台发送序号Ref ? (deps.前台发送序号Ref.current += 1) : 0;
    const 本次仍是最新前台回合 = () => !deps.前台发送序号Ref || deps.前台发送序号Ref.current === 本次发送序号;

    const canonicalTime = 环境时间转标准串(currentState.环境);
    const currentGameTime = canonicalTime || '未知时间';
    const memBeforeSend = normalizedMemBeforeSend;
    deps.推入重Roll快照({
        玩家输入: sendInput,
        游戏时间: currentGameTime,
        回档前状态: {
            角色: deps.深拷贝(currentState.角色),
            环境: deps.规范化环境信息(deps.深拷贝(currentState.环境)),
            社交: deps.深拷贝(currentState.社交),
            世界: deps.深拷贝(currentState.世界),
            战斗: deps.深拷贝(currentState.战斗),
            玩家门派: deps.深拷贝(currentState.玩家门派),
            任务列表: deps.深拷贝(currentState.任务列表),
            约定列表: deps.深拷贝(currentState.约定列表),
            剧情: deps.深拷贝(currentState.剧情),
            剧情规划: deps.深拷贝(currentState.剧情规划),
            女主剧情规划: deps.深拷贝(currentState.女主剧情规划),
            同人剧情规划: deps.深拷贝(currentState.同人剧情规划),
            同人女主剧情规划: deps.深拷贝(currentState.同人女主剧情规划),
            记忆系统: deps.深拷贝(memBeforeSend),
            叙事平静值: deps.深拷贝(currentState.叙事平静值 || { 平静计数: 0, 情节事件记录: [] })
        },
        回档前持久态: {
            视觉设置: deps.深拷贝(currentState.visualConfig),
            场景图片档案: deps.深拷贝(currentState.sceneImageArchive)
        },
        回档前历史: deps.深拷贝(historyBeforeSend)
    });
    void Promise.resolve(deps.执行NPC变量自动备份?.(currentState.社交, {
        标签: `回合发送前 · ${currentGameTime}`
    })).catch((error) => {
        recordDiagnosticLog('warn', ['NPC变量自动备份失败', {
            message: error?.message || '',
            stack: typeof error?.stack === 'string' ? error.stack : undefined
        }]);
        console.warn('NPC变量自动备份失败', error);
    });

    const normalizedMemoryConfig = 规范化记忆配置(currentState.memoryConfig);
    const immediateUploadLimit = Math.max(1, Number(normalizedMemoryConfig.即时消息上传条数N) || 10);
    const roundsBeforeCurrentInput = Math.max(0, immediateUploadLimit - 1);
    const contextHistory = deps.按回合窗口裁剪历史(historyBeforeSend, roundsBeforeCurrentInput);
    const updatedMemSys = 规范化记忆系统(memBeforeSend);

    const newUserMsg: 聊天记录结构 = {
        role: 'user',
        content: sendInput,
        timestamp: Date.now(),
        gameTime: currentGameTime
    };
    const updatedContextHistory = [...contextHistory, newUserMsg];
    const updatedDisplayHistory = [...historyBeforeSend, newUserMsg];
    deps.设置历史记录(updatedDisplayHistory);
    deps.setLoading(true);

    const 独立阶段自动重试已启用 = deps.游戏设置启用自动重试(规范化游戏设置(currentState.gameConfig));
    const 请求独立阶段失败决策 = async (params: 独立阶段失败决策参数): Promise<独立阶段失败决策> => {
        const message = [
            `${params.stageLabel}请求失败：`,
            params.errorText || '未知错误',
            '',
            '选择“重试”会重新执行当前阶段；选择“跳过”会保留当前结果并继续后续阶段。'
        ].join('\n');
        if (options?.onStageFailureDecision) {
            const result = await Promise.resolve(options.onStageFailureDecision(params));
            return result === 'retry' ? 'retry' : 'skip';
        }
        if (typeof window !== 'undefined') {
            return window.confirm(`${message}\n\n确定要重试当前阶段吗？`) ? 'retry' : 'skip';
        }
        return 'skip';
    };
    const 执行可重试独立阶段 = async <T,>(params: {
        stageId: 独立阶段标识;
        stageLabel: string;
        run: () => Promise<T>;
        beforeAttempt?: (attempt: number) => void;
        onAutoRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
        onError?: (errorText: string) => void;
        onSkip?: (errorText: string) => void;
        getErrorText?: (error: any) => string;
        useGlobalAutoRetry?: boolean;
        skipFailureDecision?: boolean;
    }): Promise<{ completed: boolean; result?: T }> => {
        let manualAttempt = 0;
        while (true) {
            if (controller.signal.aborted) {
                throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
            }
            manualAttempt += 1;
            params.beforeAttempt?.(manualAttempt);
            try {
                const result = await deps.执行带自动重试的生成请求<T>({
                    enabled: params.useGlobalAutoRetry !== false && 独立阶段自动重试已启用,
                    action: params.run,
                    onRetry: params.onAutoRetry
                });
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }
                return { completed: true, result };
            } catch (error: any) {
                if (error?.name === 'AbortError') {
                    throw error;
                }
                const errorText = params.getErrorText
                    ? params.getErrorText(error)
                    : (
                        deps.提取原始报错详情(error)
                        || deps.格式化错误详情(error)
                        || error?.message
                        || '未知错误'
                );
                params.onError?.(errorText);
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }
                if (params.skipFailureDecision) {
                    params.onSkip?.(errorText);
                    return { completed: false };
                }
                const decision = await 请求独立阶段失败决策({
                    stageId: params.stageId,
                    stageLabel: params.stageLabel,
                    errorText,
                    manualAttempt
                });
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }
                if (decision === 'retry') {
                    continue;
                }
                params.onSkip?.(errorText);
                return { completed: false };
            }
        }
    };

    let 后台队列已启动 = false;
    let streamMarker = 0;
    let latestStreamDraftText = '';

    try {
        const recallContextActiveForMain = recallFeatureEnabled && Boolean(recallTag);
        const builtContext = await deps.构建系统提示词(
            currentState.prompts,
            updatedMemSys,
            currentState.社交,
            {
                角色: currentState.角色,
                环境: deps.规范化环境信息(currentState.环境),
                世界: currentState.世界,
                战斗: currentState.战斗,
                玩家门派: currentState.玩家门派,
                任务列表: currentState.任务列表,
                约定列表: currentState.约定列表,
                剧情: deps.规范化剧情状态(currentState.剧情, currentState.环境),
                女主剧情规划: deps.规范化女主剧情规划状态(currentState.女主剧情规划),
                开局配置: currentState.开局配置,
                游戏初始时间: currentState.游戏初始时间 || '',
                叙事平静值: currentState.叙事平静值,
                叙事平静值配置: currentState.叙事平静值配置
            },
            {
                ...(recallContextActiveForMain
                    ? { 禁用中期长期记忆: true, 禁用短期记忆: true }
                    : {}),
                世界书作用域: 规范化游戏设置(currentState.gameConfig).启用酒馆预设模式 === true ? ['main', 'tavern'] : ['main'],
                世界书附加文本: [sendInput, recallTag || '']
            }
        );

        if (isStreaming) {
            streamMarker = Date.now();
            deps.设置历史记录([
                ...updatedDisplayHistory,
                {
                    role: 'assistant',
                    content: '',
                    timestamp: streamMarker,
                    gameTime: currentGameTime
                }
            ]);
        }

        const {
            runtimeGameConfig,
            tavernPresetModeEnabled,
            runtimeCotPseudoEnabled,
            deepSeekPrefixMode,
            glmPrefixMode,
            glmHTMLCommentThinking,
            lengthRequirementPrompt,
            disclaimerRequirementPrompt,
            outputProtocolPrompt,
            styleAssistantPrompt,
            realWorldModePrompt,
            cotPseudoPrompt,
            orderedMessages,
            extraPromptForService
        } = 构建主剧情请求参数({
            gameConfig: currentState.gameConfig,
            apiConfig: currentState.apiConfig,
            builtContext,
            updatedContextHistory,
            updatedMemSys,
            sendInput,
            recallTag,
            novelDecompositionPrompt: await 获取激活小说拆分注入文本(
                currentState.apiConfig,
                'main_story',
                currentState.开局配置,
                deps.规范化剧情状态(currentState.剧情, currentState.环境),
                currentState.角色?.姓名 || ''
            ),
            playerRole: currentState.角色,
            builtinPromptEntries: currentState.内置提示词列表,
            worldbooks: currentState.世界书列表
        });
        const inputTokens = deps.估算消息Token(orderedMessages, activeApi?.model);
        const knownDialogueSpeakers = 收集主剧情已知对白说话人(currentState.角色, currentState.社交);
        recordDiagnosticLog('info', ['主剧情请求开始', {
            stage: 'main_story',
            model: activeApi?.model || '',
            supplier: activeApi?.供应商 || '',
            baseUrlHost: 读取接口主机(activeApi?.baseUrl),
            streaming: isStreaming,
            maxTokens: activeApi?.maxTokens,
            inputTokens,
            messageCount: orderedMessages.length,
            validateTagCompleteness: runtimeGameConfig.启用标签检测完整性 === true,
            enableTagRepair: runtimeGameConfig.启用标签修复 !== false,
            requireActionOptionsTag: runtimeGameConfig.启用行动选项 !== false,
            knownDialogueSpeakerCount: knownDialogueSpeakers.length,
            autoRetryEnabled: deps.游戏设置启用自动重试(runtimeGameConfig)
        }]);

        const aiResult = await deps.执行带自动重试的生成请求<textAIService.StoryResponseResult>({
            enabled: deps.游戏设置启用自动重试(runtimeGameConfig),
            onRetry: (attempt, maxAttempts, reason) => {
                recordDiagnosticLog('warn', ['主剧情重试', {
                    attempt,
                    maxAttempts,
                    reason: typeof reason === 'string' ? reason : reason?.message || '',
                    errorName: reason?.name || '',
                    streaming: isStreaming
                }]);
                if (isStreaming) {
                    deps.设置历史记录(prev => deps.更新流式草稿为自动重试提示(prev, attempt, maxAttempts, reason));
                }
            },
            action: async (attempt, lastError) => {
                const lastErrorIsBodyLengthShortage = 是否正文字数不足错误(lastError);
                const lastErrorIsBodyQualityIssue = 是否正文质量审查错误(lastError);
                const protocolRetryPrompt = (
                    attempt > 1
                    && !lastErrorIsBodyLengthShortage
                    && runtimeGameConfig.启用标签协议失败自动回炉 !== false
                    && (lastError instanceof textAIService.StoryResponseParseError || lastError?.name === 'StoryResponseParseError')
                )
                    ? 构建标签协议失败自动回炉提示(
                        String(lastError?.parseDetail || lastError?.message || '返回内容不符合标签协议').trim(),
                        runtimeGameConfig.启用行动选项 !== false
                    )
                    : '';
                const retryFormatPrompt = attempt > 1
                    ? (lastErrorIsBodyLengthShortage ? [
                        '【自动重试正文补足】',
                        `上一版被拒绝原因：${lastError?.parseDetail || lastError?.message || '正文低于字数要求'}`,
                        '请完整重新生成本回合，不要只输出补丁。',
                        `硬性要求：<正文> 内可见正文必须达到至少 ${runtimeGameConfig.字数要求} 字。`,
                        '优先补充动作过程、感官反馈、环境承接、NPC反应、结果余波和必要对白；不要压缩成总结、提纲或清单。',
                        '仍需保持 <正文>、<短期记忆>、<命令> 等标签协议完整闭合。'
                    ].join('\n') : (lastErrorIsBodyQualityIssue
                        ? 构建正文质量失败自动重写提示(
                            lastError?.parseDetail || lastError?.message || '正文质量审查未通过'
                        )
                        : [
                        '【自动重试格式修正】',
                        `上一版被拒绝原因：${lastError?.parseDetail || lastError?.message || '正文协议不合格'}`,
                        '请完整重新生成本回合，不要只输出补丁。',
                        '硬性要求：<正文> 内所有角色对白必须单独成行，并以【角色名】开头；没有【角色名】的行只能写旁白、动作、环境或判定。',
                        '硬性要求：【旁白】、【角色名】、【判定】标签后必须直接跟本行正文内容，禁止空标签后下一行接裸文或裸引号。',
                        '硬性要求：【角色名】行只写该角色说出口的台词；台词后的动作、环境、心理或叙事结果必须另起【旁白】行，禁止对白与旁白混在同一行。',
                        '硬性要求：【角色名】只能是真实人物/NPC/临时龙套名；双手、指尖、眼睛、嘴唇、长剑、茶盏、衣袖、声音、气息、灵气、剑光等身体部位、物件或抽象对象必须写入【旁白】。',
                        '如果一句话是某个角色说出口的内容，不允许写成无标签普通段落。'
                    ].join('\n')))
                    : '';
                const requestStory = (
                    signal: AbortSignal,
                    markStreamActivity?: () => void
                ) => textAIService.generateStoryResponse(
                        '',
                        '',
                        '',
                        activeApi,
                        signal,
                        isStreaming
                            ? {
                                stream: true,
                                onDelta: (_delta, accumulated) => {
                                    markStreamActivity?.();
                                    latestStreamDraftText = accumulated;
                                    deps.设置历史记录(prev => prev.map(item => {
                                        if (
                                            item.timestamp === streamMarker
                                            && item.role === 'assistant'
                                            && !item.structuredResponse
                                        ) {
                                            return { ...item, content: accumulated };
                                        }
                                        return item;
                                    }));
                                }
                            }
                            : undefined,
                        extraPromptForService,
                        {
                            orderedMessages,
                            enableCotInjection: runtimeCotPseudoEnabled,
                            leadingSystemPrompt: builtContext.contextPieces.AI角色声明,
                            styleAssistantPrompt: tavernPresetModeEnabled
                                ? ''  // 酒馆模式：外部预设主导风格，不注入项目风格助手
                                : [styleAssistantPrompt, realWorldModePrompt].filter(Boolean).join('\n\n'),
                            outputProtocolPrompt: tavernPresetModeEnabled
                                ? ''  // 酒馆模式：不注入项目输出协议
                                : outputProtocolPrompt,
                            cotPseudoHistoryPrompt: cotPseudoPrompt,
                            lengthRequirementPrompt: [tavernPresetModeEnabled ? '' : lengthRequirementPrompt, retryFormatPrompt, protocolRetryPrompt, (() => {
                                const pov = runtimeGameConfig.叙事人称;
                                if (pov === '第一人称') return '【人称硬约束】本回合正文必须使用第一人称"我"指代主角，严禁使用"你/他/她"指代主角。';
                                if (pov === '第三人称') return '【人称硬约束】本回合正文必须使用第三人称指代主角（用主角姓名或"他/她"），严禁使用"我/你"指代主角。';
                                return '【人称硬约束】本回合正文必须使用第二人称"你"指代主角，严禁使用"我/他/她"或主角姓名指代主角。旁白中出现主角姓名作为叙述主语时，必须改为"你"。';
                            })()].filter(Boolean).join('\n\n'),
                            disclaimerRequirementPrompt: tavernPresetModeEnabled ? '' : disclaimerRequirementPrompt,
                            validateTagCompleteness: runtimeGameConfig.启用标签检测完整性 === true,
                            enableTagRepair: runtimeGameConfig.启用标签修复 !== false,
                            validateDialogueFormat: true,
                            knownSpeakers: knownDialogueSpeakers,
                            requireActionOptionsTag: tavernPresetModeEnabled ? false : runtimeGameConfig.启用行动选项 !== false,
                            errorDetailLimit: Number.POSITIVE_INFINITY,
                            prefixMode: deepSeekPrefixMode || glmPrefixMode,
                            disableThinking: (runtimeGameConfig.DeepSeek策略?.续聊Thinking !== true) && (runtimeGameConfig.GLM策略?.续聊Thinking !== true),
                            stripReasoning: (runtimeGameConfig.DeepSeek策略?.续聊Thinking !== true) && (runtimeGameConfig.GLM策略?.续聊Thinking !== true),
                            includeReasoning: (runtimeGameConfig.DeepSeek策略?.续聊Thinking === true) || (runtimeGameConfig.GLM策略?.续聊Thinking === true),
                            glmHTMLCommentThinking: glmHTMLCommentThinking
                        }
                    );

                const storyResult = !isStreaming
                    ? await requestStory(controller.signal)
                    : await 执行主剧情流式请求带空闲超时(
                        controller.signal,
                        (signal, markStreamActivity) => requestStory(signal, markStreamActivity),
                        () => 尝试解析完整主剧情流式草稿(latestStreamDraftText, {
                            validateTagCompleteness: runtimeGameConfig.启用标签检测完整性 === true,
                            enableTagRepair: runtimeGameConfig.启用标签修复 !== false,
                            requireActionOptionsTag: tavernPresetModeEnabled ? false : runtimeGameConfig.启用行动选项 !== false,
                            validateDialogueFormat: true,
                            knownSpeakers: knownDialogueSpeakers,
                            acceptTavernBranches: tavernPresetModeEnabled
                        })
                    );
                const rawStoryText = deps.获取原始AI消息(storyResult.rawText);
                校验响应正文词汇审查(
                    storyResult.response,
                    currentState.社交,
                    rawStoryText,
                    "主剧情",
                    runtimeGameConfig.启用正文词汇审查 !== false
                );
                校验响应人称一致性(
                    storyResult.response,
                    rawStoryText,
                    runtimeGameConfig.叙事人称 || '第二人称'
                );
                校验响应未改写既有NPC姓名(
                    storyResult.response,
                    currentState.社交,
                    rawStoryText,
                    "主剧情"
                );
                校验响应未删除既有NPC(
                    storyResult.response,
                    currentState.社交,
                    rawStoryText,
                    "主剧情"
                );
                return storyResult;
            }
        });
        recordDiagnosticLog('info', ['主剧情解析成功', {
            stage: 'main_story',
            rawTextLength: typeof aiResult.rawText === 'string' ? aiResult.rawText.length : 0,
            logsCount: Array.isArray(aiResult.response?.logs) ? aiResult.response.logs.length : 0,
            commandCount: Array.isArray(aiResult.response?.tavern_commands) ? aiResult.response.tavern_commands.length : 0,
            hasShortTerm: typeof aiResult.response?.shortTerm === 'string' && aiResult.response.shortTerm.trim().length > 0,
            hasVariablePlan: typeof aiResult.response?.t_var_plan === 'string' && aiResult.response.t_var_plan.trim().length > 0,
            hasStoryPlan: typeof aiResult.response?.t_plan === 'string' && aiResult.response.t_plan.trim().length > 0,
            actionOptionsCount: Array.isArray(aiResult.response?.action_options) ? aiResult.response.action_options.length : 0,
            outputTokens: deps.估算AI输出Token(deps.获取原始AI消息(aiResult.rawText), activeApi?.model)
        }]);

        const worldEvolutionFeatureEnabled = currentState.apiConfig?.功能模型占位?.世界演变功能启用 !== false;
        const planningFeatureEnabled = currentState.apiConfig?.功能模型占位?.规划分析功能启用 !== false;
        const worldEvolutionSplitEnabled = worldEvolutionFeatureEnabled && 接口配置是否可用(获取世界演变接口配置(currentState.apiConfig));
        // 让出主线程，避免连续深拷贝 + processResponseCommands 阻塞 UI 导致"未响应"
        await 让出主线程();
        const mainCommandBaseState = {
            角色: deps.深拷贝(currentState.角色),
            环境: deps.深拷贝(currentState.环境),
            社交: deps.深拷贝(currentState.社交),
            世界: deps.深拷贝(currentState.世界),
            战斗: deps.深拷贝(currentState.战斗),
            玩家门派: deps.深拷贝(currentState.玩家门派),
            任务列表: deps.深拷贝(currentState.任务列表),
            约定列表: deps.深拷贝(currentState.约定列表),
            剧情: deps.深拷贝(currentState.剧情),
            女主剧情规划: deps.深拷贝(currentState.女主剧情规划)
        };
        await 让出主线程();
        let aiData = 按世界演变分流净化响应(aiResult.response, worldEvolutionSplitEnabled).response;
        let displayAiData = aiData;

        const socialBeforeMainCommands = deps.深拷贝(currentState.社交);
        const rawAiText = deps.获取原始AI消息(aiResult.rawText);
        let mainLengthShortage = 获取主剧情正文不足信息(aiData, runtimeGameConfig.字数要求);
        const shortBodyOnlyWarn = runtimeGameConfig.字数不足处理方式 === '仅提示';
        let shouldRegenerateForLength = Boolean(mainLengthShortage && !mainLengthShortage.withinTolerance && !shortBodyOnlyWarn);
        const allowShortDraftForPolish = Boolean(shouldRegenerateForLength && deps.文章优化功能已开启());
        if (mainLengthShortage && !shouldRegenerateForLength) {
            options?.onPolishProgress?.({
                phase: "skipped",
                text: mainLengthShortage.withinTolerance
                    ? `${mainLengthShortage.message} 已保留本回合正文，仅提示不重新生成。`
                    : `${mainLengthShortage.message} 已按设置保留本回合正文，仅提示不重新生成。`
            });
        }
        if (mainLengthShortage && shouldRegenerateForLength && !allowShortDraftForPolish) {
            校验主剧情正文最低字数(aiData, runtimeGameConfig.字数要求, rawAiText);
        }
        if (mainLengthShortage && shouldRegenerateForLength && allowShortDraftForPolish) {
            options?.onPolishProgress?.({
                phase: "start",
                text: `${mainLengthShortage.message} 已先保留为剧情大纲，并交给文章优化扩写。`
            });
        }
        if (mainLengthShortage && shouldRegenerateForLength && !allowShortDraftForPolish && 接口配置是否可用(activeApi)) {
            options?.onPolishProgress?.({
                phase: "start",
                text: `${mainLengthShortage.message} 正在基于原文补足正文，不重新生成整回合。`
            });
            const sourceBody = 构建正文文本(aiData);
            const expandPrompt = [
                '你是《墨色江湖》的正文补足器。',
                '任务不是重新生成整回合，而是在不改变事实、不新增命令含义的前提下，只扩写用户给出的 <正文>。',
                '必须保留原正文里的判定结果、人物关系、地点、物品、台词含义和事件顺序。',
                `本次 <正文> 可见字数目标至少 ${runtimeGameConfig.字数要求} 字；可以补充动作过程、感官反馈、环境承接、NPC反应和结果余波。`,
                '所有角色对白必须继续使用【角色名】开头；旁白使用【旁白】。',
                '【角色名】只能是真实人物/NPC/临时龙套名；双手、指尖、眼睛、嘴唇、长剑、茶盏、衣袖、声音、气息、灵气、剑光等身体部位、物件或抽象对象必须写入【旁白】。',
                '物品、角色天赋、出身背景等可查看档案引用必须使用《名称》，不得使用【名称】，避免与旁白、角色名、判定协议标签混淆。',
                '只输出 <thinking>...</thinking><正文>...</正文>，不要输出命令、记忆或解释。'
            ].join('\n');
            const expanded = await textAIService.generatePolishedBody(
                sourceBody,
                expandPrompt,
                activeApi,
                controller.signal,
                '',
                ''
            );
            const expandedPollution = 检测文章优化协议确认污染(expanded.rawText || expanded.bodyText || '');
            if (expandedPollution.polluted) {
                throw new textAIService.StoryResponseParseError(
                    `${expandedPollution.reason}已打断本次正文补足，请重试。`,
                    expanded.rawText || rawAiText,
                    expandedPollution.reason
                );
            }
            const expandedResponse = textAIService.parseStoryRawText(
                `<正文>\n${expanded.bodyText}\n</正文>\n<短期记忆>无</短期记忆>`,
                { validateDialogueFormat: true, enableTagRepair: true, knownSpeakers: knownDialogueSpeakers }
            );
            const expandedAiData: GameResponse = {
                ...aiData,
                logs: expandedResponse.logs,
                body_original_logs: Array.isArray((aiData as any).body_original_logs) && (aiData as any).body_original_logs.length > 0
                    ? (aiData as any).body_original_logs
                    : aiData.logs
            };
            const expandedShortage = 获取主剧情正文不足信息(expandedAiData, runtimeGameConfig.字数要求);
            if (expandedShortage && !expandedShortage.withinTolerance) {
                throw new textAIService.StoryResponseParseError(
                    `${expandedShortage.message}原文补足后仍不足，请重试。`,
                    expanded.rawText || rawAiText,
                    expandedShortage.message
                );
            }
            aiData = expandedAiData;
            displayAiData = expandedAiData;
            mainLengthShortage = expandedShortage;
            shouldRegenerateForLength = false;
            options?.onPolishProgress?.({
                phase: "done",
                text: '已基于原文补足正文，保留本回合原有命令与记忆。'
            });
        }

        if (!deps.文章优化功能已开启()) {
            options?.onPolishProgress?.({
                phase: 'skipped',
                text: '正文优化功能未开启，已跳过。'
            });
        }

        let responseForExecution: GameResponse = {
            ...aiData,
            tavern_commands: Array.isArray(aiData.tavern_commands) ? [...aiData.tavern_commands] : []
        };
        await 让出主线程();
        let simulatedState = 计时同步队列步骤(
            "main.simulateResponseCommands",
            () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
            { commandCount: 获取响应命令数量(responseForExecution) }
        );
        const turnSnapshot: 回合快照结构 = {
            玩家输入: sendInput,
            游戏时间: currentGameTime,
            回档前状态: {
                角色: deps.深拷贝(currentState.角色),
                环境: deps.规范化环境信息(deps.深拷贝(currentState.环境)),
                社交: deps.深拷贝(currentState.社交),
                世界: deps.深拷贝(currentState.世界),
                战斗: deps.深拷贝(currentState.战斗),
                玩家门派: deps.深拷贝(currentState.玩家门派),
                任务列表: deps.深拷贝(currentState.任务列表),
                约定列表: deps.深拷贝(currentState.约定列表),
                剧情: deps.深拷贝(currentState.剧情),
                剧情规划: deps.深拷贝(currentState.剧情规划),
                女主剧情规划: deps.深拷贝(currentState.女主剧情规划),
                同人剧情规划: deps.深拷贝(currentState.同人剧情规划),
                同人女主剧情规划: deps.深拷贝(currentState.同人女主剧情规划),
                记忆系统: deps.深拷贝(memBeforeSend),
                叙事平静值: deps.深拷贝(currentState.叙事平静值 || { 平静计数: 0, 情节事件记录: [] })
            },
            回档前持久态: {
                视觉设置: deps.深拷贝(currentState.visualConfig),
                场景图片档案: deps.深拷贝(currentState.sceneImageArchive)
            },
            回档前历史: deps.深拷贝(historyBeforeSend)
        };

        let finalParsedResponse: GameResponse = responseForExecution;
        let finalDisplayResponse: GameResponse = {
            ...displayAiData,
            tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
        };
        let planningDisplayMetadata: Partial<GameResponse> = {};
        const mainStoryVariableResponse: GameResponse = {
            ...displayAiData,
            tavern_commands: Array.isArray(aiData?.tavern_commands) ? [...aiData.tavern_commands] : []
        };
        const 立即并入变量生成状态 = (nextResponse: GameResponse) => {
            simulatedState = 计时同步队列步骤(
                "variable.applyImmediateResponseCommands",
                () => deps.processResponseCommands(nextResponse, mainCommandBaseState),
                { commandCount: 获取响应命令数量(nextResponse) }
            );
            return simulatedState;
        };
        await 让出主线程();
        const immediateState = 计时同步队列步骤(
            "main.applyImmediateResponseCommands",
            () => deps.processResponseCommands(finalParsedResponse, mainCommandBaseState),
            { commandCount: 获取响应命令数量(finalParsedResponse) }
        );
        let finalState = immediateState;
        finalDisplayResponse = {
            ...finalDisplayResponse,
            logs: Array.isArray(finalParsedResponse.logs) ? [...finalParsedResponse.logs] : finalDisplayResponse.logs
        };

        // ─── 酒馆正则引擎：对 AI 输出执行安全清理 + 提取选项栏 + 标记 HTML 产出 ───
        const tavernPreset = runtimeGameConfig?.酒馆预设;
        const tavernPresetMode = runtimeGameConfig?.启用酒馆预设模式 === true && tavernPreset;
        if (tavernPresetMode && tavernPreset?.extensions) {
            // 对 AI 输出的 logs 文本执行正则替换（安全清理+HTML美化+JS交互都执行）
            const regexScripts = 获取预设已分类正则脚本(tavernPreset);
            if (regexScripts.length > 0) {
                // 动态导入沙箱桥接检测函数（避免非酒馆模式的整包开销）
                const { 需要iframe沙箱渲染, 需要HTML美化渲染, 包含HTML代码块, 提取HTML代码块内容, 清洗HTML美化产出 } = await import('../../utils/tavernSandboxBridge');

                const processedLogs = (Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [])
                    .map((log: any) => {
                        if (!log || typeof log?.text !== 'string' || !log.text.trim()) return log;
                        const originalText = log.text;
                        const cleanedText = 对AI输出执行酒馆正则(
                            log.text,
                            tavernPreset.extensions as Record<string, unknown>,
                            { isMarkdown: true }
                        );
                        if (cleanedText === originalText) return log;

                        // 检测正则替换后的产出是否包含 HTML/JS 内容
                        // 1. 含 ````html` 代码块 → 提取 HTML 内容
                        if (包含HTML代码块(cleanedText)) {
                            const htmlBlocks = 提取HTML代码块内容(cleanedText);
                            if (htmlBlocks.length > 0) {
                                const combinedHtml = htmlBlocks.join('\n');
                                // 非文本部分（代码块外的纯文本）
                                const remainingText = cleanedText.replace(/```html\s*\n?[\s\S]*?```/gi, '').trim();
                                if (需要iframe沙箱渲染(combinedHtml)) {
                                    return { ...log, text: remainingText || log.text, htmlContent: combinedHtml, htmlRenderMode: 'sandbox' as const };
                                }
                                // HTML 美化（含标签但无 <script>）
                                const purifiedHtml = 清洗HTML美化产出(combinedHtml);
                                return { ...log, text: remainingText || log.text, htmlContent: purifiedHtml, htmlRenderMode: 'purify' as const };
                            }
                        }

                        // 2. 不在代码块中但直接包含 HTML/JS
                        if (需要iframe沙箱渲染(cleanedText)) {
                            return { ...log, text: originalText, htmlContent: cleanedText, htmlRenderMode: 'sandbox' as const };
                        }
                        if (需要HTML美化渲染(cleanedText)) {
                            const purifiedHtml = 清洗HTML美化产出(cleanedText);
                            return { ...log, htmlContent: purifiedHtml, htmlRenderMode: 'purify' as const };
                        }

                        // 3. 纯文本替换（安全清理脚本）
                        return cleanedText !== originalText ? { ...log, text: cleanedText } : log;
                    });
                finalDisplayResponse = { ...finalDisplayResponse, logs: processedLogs };

                // 从选项渲染脚本提取选项（如果当前 action_options 为空）
                if (!Array.isArray(finalDisplayResponse.action_options) || finalDisplayResponse.action_options.length === 0) {
                    const allBodyText = processedLogs
                        .map((log: any) => log?.text || '')
                        .filter((t: string) => t.trim())
                        .join('\n');
                    const extractedOptions = 提取酒馆选项(allBodyText, tavernPreset.extensions as Record<string, unknown>);
                    if (extractedOptions.length > 0) {
                        finalDisplayResponse = {
                            ...finalDisplayResponse,
                            action_options: extractedOptions
                        };
                    }
                }
            }

            // ─── Reasoning 模板：从 AI 输出中解析推理/思维块 ───
            const reasoningTemplate = tavernPreset.reasoning;
            if (reasoningTemplate?.prefix && reasoningTemplate.suffix) {
                const bodyLogs = Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [];
                if (bodyLogs.length > 0) {
                    const parsedLogs = bodyLogs.map((log: any) => {
                        if (!log || typeof log?.text !== 'string' || !log.text.trim()) return log;
                        const parsed = 从文本解析推理块({
                            text: log.text,
                            template: reasoningTemplate,
                            strict: false,
                        });
                        if (!parsed || !parsed.reasoning.trim()) return log;
                        // 将推理内容移至 log.reasoning，正文保留 content
                        return {
                            ...log,
                            text: parsed.content,
                            reasoning: parsed.reasoning,
                        };
                    });
                    finalDisplayResponse = { ...finalDisplayResponse, logs: parsedLogs };
                }
            }
        }
        const nextGameTime = 环境时间转标准串(immediateState.环境) || "未知时间";
        const immediateEntry = 构建即时记忆条目(nextGameTime, sendInput, finalDisplayResponse);
        const shortEntry = 构建短期记忆条目(nextGameTime, finalDisplayResponse);
        const aiTurnTimestamp = Date.now();
        const responseDurationSec = deps.计算回复耗时秒(mainRequestStartedAt, aiTurnTimestamp);
        const nextMemory = 写入四段记忆(
            规范化记忆系统(memBeforeSend),
            immediateEntry,
            shortEntry,
            {
                immediateLimit: normalizedMemoryConfig.即时消息上传条数N,
                shortLimit: normalizedMemoryConfig.短期记忆阈值,
                midLimit: normalizedMemoryConfig.中期记忆阈值,
                recordTime: nextGameTime,
                timestamp: nextGameTime
            }
        );
        deps.应用并同步记忆系统(nextMemory);

        const newAiMsg: 聊天记录结构 = {
            role: "assistant",
            content: "Structured Response",
            structuredResponse: finalDisplayResponse,
            rawJson: rawAiText,
            timestamp: aiTurnTimestamp,
            gameTime: nextGameTime,
            inputTokens,
            responseDurationSec,
            outputTokens: deps.估算AI输出Token(rawAiText, activeApi?.model),
            autoScrollToTurnStart: true
        };
        if (isStreaming) {
            deps.设置历史记录(prev => {
                const streamIndex = prev.findIndex(item => (
                    item.timestamp === streamMarker
                    && item.role === "assistant"
                    && !item.structuredResponse
                ));
                const fallbackIndex = streamIndex >= 0
                    ? streamIndex
                    : (() => {
                        for (let index = prev.length - 1; index >= 0; index -= 1) {
                            const item = prev[index];
                            if (item?.role === "assistant" && !item.structuredResponse) return index;
                        }
                        return -1;
                    })();
                if (fallbackIndex < 0) return [...prev, { ...newAiMsg }];
                return prev.map((item, index) => index === fallbackIndex ? { ...newAiMsg } : item);
            });
        } else {
            deps.设置历史记录([...updatedDisplayHistory, newAiMsg]);
        }

        let 本回合更新后的叙事平静值: 叙事状态结构 | null = null;
        const 叙事平静值配置 = 规范化游戏设置(currentState.gameConfig)?.叙事平静值配置;
        if (叙事平静值配置?.启用) {
            const 当前叙事状态 = currentState.叙事平静值 || { 平静计数: 0, 情节事件记录: [] };
            const 本回合事件列表 = 提取全部情节事件(rawAiText);
            const 可记录事件 = 本回合事件列表.filter(t => t.prefix !== '延续');
            const 新状态 = {
                平静计数: 计算本回合目标计数(本回合事件列表, 当前叙事状态.平静计数 ?? 0, 叙事平静值配置),
                情节事件记录: [...(当前叙事状态.情节事件记录 || [])]
            };
            if (可记录事件.length > 0) {
                for (const ev of 可记录事件) {
                    新状态.情节事件记录 = [
                        ...新状态.情节事件记录.slice(-29),
                        `[回合${nextRound}] ${ev.prefix}：${ev.event}`
                    ];
                }
            }
            本回合更新后的叙事平静值 = 新状态;
            deps.设置叙事平静值(新状态);
        }

        const pushedNpcList = deps.提取新增NPC列表(socialBeforeMainCommands, finalState.社交);
        if (pushedNpcList.length > 0) {
            deps.触发新增NPC自动生图(pushedNpcList);
        }
        deps.触发对白NPC头像补全(finalState.社交);
        deps.检查主角每回合生图(finalState.角色);

        const latestBodyText = (Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [])
            .map((log) => `${log?.sender || "旁白"}：${log?.text || ""}`)
            .filter((line) => line.trim().length > 0)
            .join("\n");
        if (latestBodyText.trim()) {
            void Promise.resolve(deps.应用常驻壁纸为背景()).catch((error) => {
                recordDiagnosticLog('warn', ['应用常驻壁纸失败', {
                    message: error?.message || '',
                    stack: typeof error?.stack === 'string' ? error.stack : undefined
                }]);
                console.error("应用常驻壁纸失败", error);
            });
            deps.触发场景自动生图({
                response: finalDisplayResponse,
                bodyText: latestBodyText,
                env: finalState.环境,
                turnNumber: nextRound,
                playerInput: sendInput,
                source: "auto",
                autoApply: true
            });
        }

        const 回合结束自动存档已开启 = 规范化游戏设置(immediateState.gameConfig || currentState.gameConfig).启用回合结束自动存档 !== false;

        deps.set后台队列处理中(true);
        后台队列已启动 = true;
        void (async () => {
            try {
                const 文章优化开启 = deps.文章优化功能已开启();
                const 变量生成配置 = 获取变量计算接口配置(currentState.apiConfig);
                const 变量生成总开关开启 = 变量生成功能已启用(currentState.apiConfig);
                const 变量生成开启 = 变量生成总开关开启 && 接口配置是否可用(变量生成配置);
                const 文章优化配置 = 获取文章优化接口配置(currentState.apiConfig);
                const 文章优化变量可并行 = 文章优化开启
                    && 变量生成开启
                    && 接口配置是否可用(文章优化配置)
                    && 获取队列阶段渠道键(文章优化配置, activeApi) !== 获取队列阶段渠道键(变量生成配置, activeApi);

                const 执行文章优化阶段 = async () => {
                    if (!文章优化开启) return null;
                    const polishStage = await 执行可重试独立阶段({
                        stageId: "polish",
                        stageLabel: "文章优化",
                        beforeAttempt: (attempt) => {
                            options?.onPolishProgress?.({
                                phase: "start",
                                text: attempt > 1
                                    ? `正在重新提取并润色<正文>内容...（第 ${attempt} 次手动重试）`
                                    : (文章优化变量可并行 ? "正在并行提取并润色<正文>内容..." : "正在后台提取并润色<正文>内容...")
                            });
                        },
                        onAutoRetry: (attempt, maxAttempts, reason) => {
                            options?.onPolishProgress?.({
                                phase: "start",
                                text: `正文优化请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                            });
                        },
                        run: () => deps.执行正文润色(
                            aiData,
                            rawAiText,
                            {
                                playerInput: sendInput,
                                signal: controller.signal,
                                allowExpansionForLength: allowShortDraftForPolish,
                                minLength: runtimeGameConfig.字数要求
                            }
                        ),
                        onError: (errorText) => {
                            options?.onPolishProgress?.({
                                phase: "error",
                                text: `${errorText || "正文优化失败，已保留原文。"}\n等待选择：重试当前阶段，或跳过继续。`
                            });
                        },
                        onSkip: (errorText) => {
                            options?.onPolishProgress?.({
                                phase: "skipped",
                                text: `正文优化失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                            });
                        }
                    });
                    return polishStage;
                };

                const 应用文章优化结果 = (polishStage: Awaited<ReturnType<typeof 执行文章优化阶段>>) => {
                    const polished = polishStage?.result;
                    if (polishStage?.completed && polished) {
                        if (polished.applied) {
                            displayAiData = polished.response;
                            finalDisplayResponse = {
                                ...displayAiData,
                                tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                            };
                            options?.onPolishProgress?.({
                                phase: "done",
                                text: `已应用优化结果（模型：${polished.response.body_optimized_model || "未知"}）`,
                                rawText: polished.rawText
                            });
                            const polishedAiMsg: 聊天记录结构 = {
                                ...newAiMsg,
                                structuredResponse: finalDisplayResponse
                            };
                            deps.设置历史记录(prev => {
                                const targetIndex = prev.findIndex(item => item.timestamp === aiTurnTimestamp && item.role === "assistant");
                                const fallbackIndex = targetIndex >= 0
                                    ? targetIndex
                                    : (() => {
                                        for (let index = prev.length - 1; index >= 0; index -= 1) {
                                            const item = prev[index];
                                            if (item?.role === "assistant" && !item.structuredResponse) return index;
                                        }
                                        return -1;
                                    })();
                                if (fallbackIndex < 0) return [...prev, { ...polishedAiMsg, autoScrollToTurnIcon: false, autoScrollToTurnStart: true }];
                                return prev.map((item, index) => {
                                    if (index !== fallbackIndex) return item;
                                    return {
                                        ...item,
                                        ...polishedAiMsg,
                                        autoScrollToTurnIcon: false,
                                        autoScrollToTurnStart: item.autoScrollToTurnStart === true || polishedAiMsg.autoScrollToTurnStart === true
                                    };
                                });
                            });
                        } else {
                            options?.onPolishProgress?.({
                                phase: "done",
                                text: polished.error || "优化未生效，已保留原文。",
                                rawText: polished.rawText
                            });
                        }
                    }
                };

                let variableGenerationResult: Awaited<ReturnType<typeof deps.执行变量生成并合并响应>> = null;
                const 变量生成前命令数 = Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0;
                const 执行变量生成阶段 = async (baseDisplayResponse: GameResponse) => 执行可重试独立阶段({
                    stageId: "variable",
                    stageLabel: "变量生成",
                    beforeAttempt: (attempt) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "start",
                            text: attempt > 1
                                ? `正在重新执行变量生成...（第 ${attempt} 次手动重试）`
                                : (文章优化变量可并行 ? "正在并行执行变量生成..." : "正在执行变量生成...")
                        });
                    },
                    onAutoRetry: (attempt, maxAttempts, reason) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "start",
                            text: `变量生成请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                        });
                    },
                    run: () => deps.执行变量生成并合并响应({
                        snapshot: turnSnapshot,
                        parsedResponse: mainStoryVariableResponse,
                        mergeTargetResponse: responseForExecution,
                        displayResponse: baseDisplayResponse,
                        rawText: rawAiText,
                        playerInput: sendInput,
                        inputTokens,
                        responseDurationSec: deps.计算回复耗时秒(mainRequestStartedAt),
                        worldEvolutionUpdated: false,
                        onProgress: options?.onVariableGenerationProgress
                    }),
                    onError: (errorText) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "error",
                            text: `${errorText || "变量生成失败"}\n等待选择：重试当前阶段，或跳过继续。`
                        });
                    },
                    onSkip: (errorText) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "skipped",
                            text: `变量生成失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                        });
                    },
                    getErrorText: (error: any) => (
                        deps.提取原始报错详情(error)
                        || error?.message
                        || "变量生成失败"
                    )
                });
                let variableStage: Awaited<ReturnType<typeof 执行变量生成阶段>> | null = null;
                if (!变量生成开启) {
                    options?.onVariableGenerationProgress?.({
                        phase: "skipped",
                        text: 变量生成总开关开启
                            ? "变量生成接口未配置，已跳过。"
                            : "变量生成功能已关闭，已跳过。"
                    });
                    const polishStage = await 执行文章优化阶段();
                    应用文章优化结果(polishStage);
                } else {
                    if (文章优化变量可并行) {
                        const baseDisplayResponse = finalDisplayResponse;
                        const [polishStage, parallelVariableStage] = await Promise.all([
                            执行文章优化阶段(),
                            执行变量生成阶段(baseDisplayResponse)
                        ]);
                        应用文章优化结果(polishStage);
                        variableStage = parallelVariableStage;
                    } else {
                        const polishStage = await 执行文章优化阶段();
                        应用文章优化结果(polishStage);
                        variableStage = await 执行变量生成阶段(finalDisplayResponse);
                    }
                }
                variableGenerationResult = variableStage?.result ?? null;
                if (variableStage?.completed && variableGenerationResult?.mergedParsed) {
                    responseForExecution = variableGenerationResult.mergedParsed;
                    finalParsedResponse = variableGenerationResult.mergedParsed;
                    finalDisplayResponse = 合并变量结果到展示响应(displayAiData, variableGenerationResult.mergedParsed);
                    displayAiData = finalDisplayResponse;
                    await 让出主线程();
                    simulatedState = 计时同步队列步骤(
                        "variable.simulateMergedResponseCommands",
                        () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
                        { commandCount: 获取响应命令数量(responseForExecution) }
                    );
                    if (Array.isArray(responseForExecution.tavern_commands) && responseForExecution.tavern_commands.length > 0) {
                        await 让出主线程();
                        立即并入变量生成状态(responseForExecution);
                    }
                    if (variableGenerationResult.variableCalibration) {
                        options?.onVariableGenerationProgress?.({
                            phase: "done",
                            text: `变量生成完成，新增 ${variableGenerationResult.variableCalibration.commands.length} 条变量命令${variableGenerationResult.variableCalibration.model ? `（${variableGenerationResult.variableCalibration.model}）` : ""}，并已立即并入当前前台状态。`,
                            rawText: variableGenerationResult.variableCalibration.rawText,
                            commandTexts: 构建带索引命令文本(
                                variableGenerationResult.variableCalibration.commands,
                                变量生成前命令数 + 1
                            )
                        });
                    }
                }
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }
                let worldEvolutionResult: 世界演变执行结果 | null = null;
                let planningResult: Awaited<ReturnType<typeof deps.后台执行统一规划分析>> | null = null;
                let mapUpdateResult: 地图更新执行结果 | null = null;
                const 变量生成后命令数 = Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0;
                const mapGenerationEnabled = currentState.apiConfig?.功能模型占位?.地图生成功能启用 !== false;
                const parallelStageEntries = [
                    { id: 'world', enabled: worldEvolutionSplitEnabled, config: 获取世界演变接口配置(currentState.apiConfig) },
                    { id: 'planning', enabled: planningFeatureEnabled, config: 获取规划分析接口配置(currentState.apiConfig) },
                    { id: 'map', enabled: mapGenerationEnabled, config: 获取地图自动更新接口配置(currentState.apiConfig) }
                ].filter((item) => item.enabled && 接口配置是否可用(item.config));
                const parallelChannelKeys = parallelStageEntries.map((item) => 获取队列阶段渠道键(item.config, activeApi)).filter(Boolean);
                const 后处理三阶段可并行 = parallelStageEntries.length >= 2
                    && parallelChannelKeys.length === parallelStageEntries.length
                    && new Set(parallelChannelKeys).size === parallelChannelKeys.length;

                const 执行动态世界阶段 = async (
                    stateSnapshot: typeof simulatedState,
                    responseSnapshot: GameResponse,
                    displaySnapshot: GameResponse
                ): Promise<世界演变执行结果 | null> => {
                    if (!worldEvolutionFeatureEnabled) {
                        options?.onWorldEvolutionProgress?.({
                            phase: "skipped",
                            text: "动态世界功能未开启，已跳过本轮世界推演。"
                        });
                        return null;
                    }
                    if (!worldEvolutionSplitEnabled) {
                        options?.onWorldEvolutionProgress?.({
                            phase: "skipped",
                            text: "动态世界接口未配置，已跳过。"
                        });
                        return null;
                    }
                    const worldStage = await 执行可重试独立阶段({
                        stageId: "world",
                        stageLabel: "动态世界",
                        beforeAttempt: (attempt) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "start",
                                text: attempt > 1
                                    ? `正在重新执行动态世界更新...（第 ${attempt} 次手动重试）`
                                    : (后处理三阶段可并行 ? "正在并行执行动态世界更新..." : "正在执行动态世界更新...")
                            });
                        },
                        onAutoRetry: (attempt, maxAttempts, reason) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "start",
                                text: `动态世界请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                            });
                        },
                        run: async () => {
                            const worldContextResponse: GameResponse = {
                                ...displaySnapshot,
                                tavern_commands: Array.isArray(responseSnapshot.tavern_commands) ? [...responseSnapshot.tavern_commands] : []
                            };
                            const result = await deps.执行世界演变更新({
                                来源: "story_dynamic",
                                动态世界线索: [],
                                applyCommands: false,
                                currentResponse: worldContextResponse,
                                stateBase: stateSnapshot,
                                signal: controller.signal,
                                onStreamDelta: options?.onWorldEvolutionProgress
                                    ? (_delta, accumulated) => {
                                        options?.onWorldEvolutionProgress?.({
                                            phase: "stream",
                                            text: accumulated
                                        });
                                    }
                                    : undefined
                            });
                            if (result.phase === "error") {
                                const wrappedError = new Error(result.statusText || "动态世界更新失败");
                                (wrappedError as Error & { stageResult?: 世界演变执行结果 }).stageResult = result;
                                throw wrappedError;
                            }
                            return result;
                        },
                        getErrorText: (error: any) => (
                            error?.stageResult?.statusText
                            || deps.提取原始报错详情(error)
                            || error?.message
                            || "动态世界更新失败"
                        ),
                        onError: (errorText) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "error",
                                text: `${errorText || "动态世界更新失败"}\n等待选择：重试当前阶段，或跳过继续。`
                            });
                        },
                        onSkip: (errorText) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "skipped",
                                text: `动态世界更新失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                            });
                        }
                    });
                    return worldStage.result || null;
                };

                const 执行规划分析阶段 = async (
                    stateSnapshot: typeof simulatedState,
                    responseSnapshot: GameResponse
                ): Promise<Awaited<ReturnType<typeof deps.后台执行统一规划分析>> | null> => {
                    if (!planningFeatureEnabled) {
                        options?.onPlanningProgress?.({
                            phase: "skipped",
                            text: "规划分析功能未开启，已跳过本轮规划分析。"
                        });
                        return null;
                    }
                    const planningStage = await 执行可重试独立阶段({
                        stageId: "planning",
                        stageLabel: "规划分析",
                        useGlobalAutoRetry: false,
                        beforeAttempt: (attempt) => {
                            options?.onPlanningProgress?.({
                                phase: "start",
                                text: attempt > 1
                                    ? `正在重新分析并修订剧情规划...（第 ${attempt} 次手动重试）`
                                    : (后处理三阶段可并行 ? "正在并行分析并修订剧情规划..." : "正在分析并修订剧情规划...")
                            });
                        },
                        onAutoRetry: (attempt, maxAttempts, reason) => {
                            options?.onPlanningProgress?.({
                                phase: "start",
                                text: `规划分析请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                            });
                        },
                        run: () => deps.后台执行统一规划分析({
                            state: {
                                环境: stateSnapshot.环境,
                                社交: stateSnapshot.社交,
                                世界: stateSnapshot.世界,
                                剧情: stateSnapshot.剧情,
                                剧情规划: stateSnapshot.剧情规划,
                                女主剧情规划: stateSnapshot.女主剧情规划,
                                同人剧情规划: stateSnapshot.同人剧情规划,
                                同人女主剧情规划: stateSnapshot.同人女主剧情规划
                            },
                            playerInput: sendInput,
                            gameTime: 环境时间转标准串(stateSnapshot.环境) || "未知时间",
                            response: responseSnapshot,
                            shouldApply: 本次仍是最新前台回合,
                            onRetry: (attempt, maxAttempts, reason) => {
                                options?.onPlanningProgress?.({
                                    phase: "start",
                                    text: `规划分析请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                                });
                            },
                            onStreamDelta: options?.onPlanningProgress
                                ? (_delta, accumulated) => {
                                    options?.onPlanningProgress?.({
                                        phase: "stream",
                                        text: accumulated
                                    });
                                }
                                : undefined,
                            signal: controller.signal
                        }),
                        onError: (errorText) => {
                            options?.onPlanningProgress?.({
                                phase: "error",
                                text: `${errorText || "规划分析失败"}\n规划分析失败不会阻塞本回合，已自动跳过。`
                            });
                        },
                        onSkip: (errorText) => {
                            options?.onPlanningProgress?.({
                                phase: "skipped",
                                text: `规划分析失败，已自动跳过；本回合正文和其他后台结果保留。${errorText ? `\n${errorText}` : ""}`
                            });
                        },
                        getErrorText: (error: any) => (
                            deps.提取原始报错详情(error)
                            || error?.message
                            || "规划分析失败"
                        ),
                        skipFailureDecision: true
                    });
                    return planningStage.result || null;
                };

                const 执行地图更新阶段 = async (
                    stateSnapshot: typeof simulatedState,
                    responseSnapshot: GameResponse,
                    displaySnapshot: GameResponse
                ): Promise<地图更新执行结果 | null> => {
                    if (!mapGenerationEnabled) {
                        options?.onMapUpdateProgress?.({
                            phase: 'skipped',
                            text: '地图生成功能未开启，已跳过本轮地图更新。'
                        });
                        return null;
                    }
                    const mapUpdateStage = await 执行可重试独立阶段({
                        stageId: "map",
                        stageLabel: "地图更新",
                        beforeAttempt: (attempt) => {
                            options?.onMapUpdateProgress?.({
                                phase: "start",
                                text: attempt > 1
                                    ? `正在重新执行地图更新...（第 ${attempt} 次手动重试）`
                                    : (后处理三阶段可并行 ? "正在并行执行地图更新..." : "正在执行地图更新...")
                            });
                        },
                        onAutoRetry: (attempt, maxAttempts, reason) => {
                            options?.onMapUpdateProgress?.({
                                phase: "start",
                                text: `地图更新请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                            });
                        },
                        run: async () => {
                            const mapContextResponse: GameResponse = {
                                ...displaySnapshot,
                                tavern_commands: Array.isArray(responseSnapshot.tavern_commands) ? [...responseSnapshot.tavern_commands] : []
                            };
                            const result = await 生成地图更新({
                                mode: 'auto_incremental',
                                apiSettings: currentState.apiConfig,
                                环境: stateSnapshot.环境,
                                世界: stateSnapshot.世界,
                                社交: stateSnapshot.社交,
                                角色: stateSnapshot.角色,
                                gameConfig: currentState.gameConfig,
                                worldbooks: currentState.世界书列表,
                                currentResponse: mapContextResponse,
                                stateBase: stateSnapshot,
                                signal: controller.signal
                            });
                            if (result.phase === 'error') {
                                const wrappedError = new Error(result.statusText || '地图更新失败');
                                (wrappedError as Error & { stageResult?: 地图更新执行结果 }).stageResult = result;
                                throw wrappedError;
                            }
                            return result;
                        },
                        getErrorText: (error: any) => (
                            error?.stageResult?.statusText
                            || deps.提取原始报错详情(error)
                            || error?.message
                            || "地图更新失败"
                        ),
                        onError: (errorText) => {
                            options?.onMapUpdateProgress?.({
                                phase: "error",
                                text: `${errorText || "地图更新失败"}\n等待选择：重试当前阶段，或跳过继续。`
                            });
                        },
                        onSkip: (errorText) => {
                            options?.onMapUpdateProgress?.({
                                phase: "skipped",
                                text: `地图更新失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                            });
                        }
                    });
                    return mapUpdateStage.result || null;
                };

                if (后处理三阶段可并行) {
                    const parallelState = simulatedState;
                    const parallelResponse = {
                        ...responseForExecution,
                        tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                    } as GameResponse;
                    const parallelDisplay = {
                        ...displayAiData,
                        tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                    } as GameResponse;
                    [worldEvolutionResult, planningResult, mapUpdateResult] = await Promise.all([
                        执行动态世界阶段(parallelState, parallelResponse, parallelDisplay),
                        执行规划分析阶段(parallelState, parallelResponse),
                        执行地图更新阶段(parallelState, parallelResponse, parallelDisplay)
                    ]);
                } else {
                    worldEvolutionResult = await 执行动态世界阶段(simulatedState, responseForExecution, displayAiData);
                    if (!本次仍是最新前台回合()) {
                        options?.onWorldEvolutionProgress?.({
                            phase: "skipped",
                            text: "新的正文回合已经开始，本轮动态世界结果已作为过期后台结果丢弃。"
                        });
                        return;
                    }
                    if (controller.signal.aborted) {
                        throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                    }
                    if (worldEvolutionResult && worldEvolutionResult.commands.length > 0) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...worldEvolutionResult.commands
                            ]
                        };
                        await 让出主线程();
                        simulatedState = 计时同步队列步骤(
                            "world.simulateMergedResponseCommands",
                            () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
                            { commandCount: 获取响应命令数量(responseForExecution), worldCommandCount: worldEvolutionResult.commands.length }
                        );
                    }
                    planningResult = await 执行规划分析阶段(simulatedState, responseForExecution);
                    if (!本次仍是最新前台回合()) {
                        options?.onPlanningProgress?.({
                            phase: "skipped",
                            text: "新的正文回合已经开始，本轮规划分析结果已作为过期后台结果丢弃。"
                        });
                        return;
                    }
                    if (controller.signal.aborted) {
                        throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                    }
                    if (planningResult?.commands?.length) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...planningResult.commands
                            ]
                        };
                        await 让出主线程();
                        simulatedState = 计时同步队列步骤(
                            "planning.simulateMergedResponseCommands",
                            () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
                            { commandCount: 获取响应命令数量(responseForExecution), planningCommandCount: planningResult.commands.length }
                        );
                    }
                    mapUpdateResult = await 执行地图更新阶段(simulatedState, responseForExecution, displayAiData);
                }
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }

                if (!本次仍是最新前台回合()) {
                    options?.onMapUpdateProgress?.({
                        phase: "skipped",
                        text: "新的正文回合已经开始，本轮后处理结果已作为过期后台结果丢弃。"
                    });
                    return;
                }

                let 当前命令偏移 = 变量生成后命令数;
                if (worldEvolutionResult) {
                    options?.onWorldEvolutionProgress?.({
                        phase: worldEvolutionResult.phase,
                        text: worldEvolutionResult.statusText || (worldEvolutionResult.ok ? "动态世界更新完成。" : "动态世界未产生更新。"),
                        rawText: worldEvolutionResult.rawText,
                        commandTexts: 构建带索引命令文本(worldEvolutionResult.commands, 当前命令偏移 + 1)
                    });
                    if (后处理三阶段可并行 && worldEvolutionResult.commands.length > 0) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...worldEvolutionResult.commands
                            ]
                        };
                    }
                    当前命令偏移 += worldEvolutionResult.commands.length;
                }

                if (planningResult) {
                    options?.onPlanningProgress?.({
                        phase: planningResult.updated ? "done" : "skipped",
                        text: planningResult.message,
                        rawText: planningResult.rawText,
                        commandTexts: 构建带索引命令文本(planningResult.commands, 当前命令偏移 + 1)
                    });
                    if (planningResult.updated || planningResult.commands.length > 0) {
                        planningDisplayMetadata = {
                            planning_analysis_updated: planningResult.updated,
                            planning_analysis_report: planningResult.message,
                            planning_analysis_commands: Array.isArray(planningResult.commands) ? [...planningResult.commands] : []
                        };
                    }
                    if (后处理三阶段可并行 && planningResult.commands.length > 0) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...planningResult.commands
                            ]
                        };
                    }
                    当前命令偏移 += planningResult.commands.length;
                }

                if (mapUpdateResult) {
                    options?.onMapUpdateProgress?.({
                        phase: mapUpdateResult.phase,
                        text: mapUpdateResult.statusText || (mapUpdateResult.ok ? "地图更新完成。" : "地图更新未产生更新。"),
                        rawText: mapUpdateResult.rawText,
                        commandTexts: 构建带索引命令文本(mapUpdateResult.commands, 当前命令偏移 + 1)
                    });
                    if (mapUpdateResult.commands.length > 0) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...mapUpdateResult.commands
                            ]
                        };
                    }
                    当前命令偏移 += mapUpdateResult.commands.length;
                }

                if (后处理三阶段可并行 && (
                    (worldEvolutionResult?.commands.length || 0) > 0
                    || (planningResult?.commands.length || 0) > 0
                    || (mapUpdateResult?.commands.length || 0) > 0
                )) {
                    await 让出主线程();
                    simulatedState = 计时同步队列步骤(
                        "parallelPost.simulateMergedResponseCommands",
                        () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
                        {
                            commandCount: 获取响应命令数量(responseForExecution),
                            worldCommandCount: worldEvolutionResult?.commands.length || 0,
                            planningCommandCount: planningResult?.commands.length || 0,
                            mapCommandCount: mapUpdateResult?.commands.length || 0
                        }
                    );
                } else if (!后处理三阶段可并行 && mapUpdateResult && mapUpdateResult.commands.length > 0) {
                    await 让出主线程();
                    simulatedState = 计时同步队列步骤(
                        "map.simulateMergedResponseCommands",
                        () => deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false }),
                        { commandCount: 获取响应命令数量(responseForExecution), mapCommandCount: mapUpdateResult.commands.length }
                    );
                }
                finalParsedResponse = responseForExecution;
                finalDisplayResponse = {
                    ...displayAiData,
                    ...planningDisplayMetadata,
                    tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                };

                await 让出主线程();
                if (controller.signal.aborted) {
                    throw controller.signal.reason || new DOMException('Aborted', 'AbortError');
                }
                finalState = 计时同步队列步骤(
                    "queue.finalApplyResponseCommands",
                    () => deps.processResponseCommands(finalParsedResponse, mainCommandBaseState),
                    { commandCount: 获取响应命令数量(finalParsedResponse) }
                );
                const calibratedFinalStory = await 同步剧情小说分解时间校准({
                    previousStory: currentState.剧情,
                    nextStory: finalState.剧情,
                    currentGameTime: 环境时间转标准串(finalState.环境) || currentGameTime,
                    openingConfig: currentState.开局配置
                });
                finalState = {
                    ...finalState,
                    剧情: deps.规范化剧情状态(calibratedFinalStory, finalState.环境)
                };
                deps.设置剧情(finalState.剧情);
                finalDisplayResponse = {
                    ...finalDisplayResponse,
                    logs: displayAiData.logs || finalDisplayResponse.logs
                };

                const queuedAiMsg: 聊天记录结构 = {
                    ...newAiMsg,
                    structuredResponse: finalDisplayResponse
                };
                deps.设置历史记录(prev => {
                    const targetIndex = prev.findIndex(item => item.timestamp === aiTurnTimestamp && item.role === "assistant");
                    const fallbackIndex = targetIndex >= 0
                        ? targetIndex
                        : (() => {
                            for (let index = prev.length - 1; index >= 0; index -= 1) {
                                const item = prev[index];
                                if (item?.role === "assistant" && !item.structuredResponse) return index;
                            }
                            return -1;
                        })();
                    if (fallbackIndex < 0) return [...prev, { ...queuedAiMsg, autoScrollToTurnIcon: false, autoScrollToTurnStart: true }];
                    return prev.map((item, index) => {
                        if (index !== fallbackIndex) return item;

                        return {
                            ...item,
                            ...queuedAiMsg,
                            autoScrollToTurnIcon: false,
                            autoScrollToTurnStart: item.autoScrollToTurnStart === true || queuedAiMsg.autoScrollToTurnStart === true
                        };
                    });
                });

                const queuedNpcList = deps.提取新增NPC列表(socialBeforeMainCommands, finalState.社交);
                if (queuedNpcList.length > 0) {
                    deps.触发新增NPC自动生图(queuedNpcList);
                }
                deps.触发对白NPC头像补全(finalState.社交);
                deps.检查主角每回合生图(finalState.角色);

                if (回合结束自动存档已开启) {
                    await deps.performAutoSave({
                        history: [...updatedDisplayHistory, queuedAiMsg],
                        role: finalState.角色,
                        env: finalState.环境,
                        social: finalState.社交,
                        world: finalState.世界,
                        battle: finalState.战斗,
                        sect: finalState.玩家门派,
                        tasks: finalState.任务列表,
                        agreements: finalState.约定列表,
                        story: finalState.剧情,
                        storyPlan: finalState.剧情规划,
                        heroinePlan: finalState.女主剧情规划,
                        fandomStoryPlan: finalState.同人剧情规划,
                        fandomHeroinePlan: finalState.同人女主剧情规划,
                        memory: nextMemory,
                        叙事平静值: 本回合更新后的叙事平静值 || undefined,
                        force: true
                    });
                }
            } catch (backgroundError: any) {
                if (backgroundError?.name === "AbortError") {
                    options?.onPolishProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    options?.onVariableGenerationProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    options?.onWorldEvolutionProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    options?.onPlanningProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    options?.onMapUpdateProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    recordDiagnosticLog('info', ['后台队列已取消', {
                        reason: backgroundError?.message || 'parent signal aborted'
                    }]);
                    return;
                }
                recordDiagnosticLog('error', ['后台队列执行失败', {
                    message: backgroundError?.message || '',
                    name: backgroundError?.name || typeof backgroundError,
                    stack: typeof backgroundError?.stack === 'string' ? backgroundError.stack : undefined
                }]);
                console.error("后台队列执行失败", backgroundError);
                options?.onPlanningProgress?.({
                    phase: "error",
                    text: backgroundError?.message || "后台队列执行失败"
                });
                options?.onMapUpdateProgress?.({
                    phase: "error",
                    text: backgroundError?.message || "后台队列执行失败"
                });
            } finally {
                deps.set后台队列处理中(false);
                if (deps.abortControllerRef.current === controller) {
                    deps.abortControllerRef.current = null;
                }
            }
        })();
        return { attachedRecallPreview };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            const snapshot = deps.弹出重Roll快照();
            if (snapshot) {
                deps.回档到快照(snapshot);
            } else {
                deps.设置历史记录(historyBeforeSend);
                deps.应用并同步记忆系统(memBeforeSend);
            }
            recordDiagnosticLog('info', ['主剧情请求被用户取消', {
                draftTextLength: (latestStreamDraftText || '').length,
                gameTime: currentGameTime,
                hadSnapshot: !!snapshot
            }]);
            return { cancelled: true };
        }

        if (error instanceof textAIService.StoryResponseParseError || error?.name === 'StoryResponseParseError') {
            deps.应用并同步记忆系统(memBeforeSend);
            const parseErrorRaw = deps.提取解析失败原始信息(error);
            const parseErrorRawText = typeof error?.rawText === 'string' ? error.rawText : '';
            const preservedDraftHistory = 构建中断流式草稿历史({
                baseHistory: updatedDisplayHistory,
                draftText: latestStreamDraftText || parseErrorRawText,
                draftTimestamp: streamMarker,
                gameTime: currentGameTime,
                summary: parseErrorRaw,
                detailPrefix: '主剧情解析失败'
            });
            deps.设置历史记录(preservedDraftHistory || historyBeforeSend);
            if (preservedDraftHistory) {
                void deps.performAutoSave({ history: preservedDraftHistory, force: true });
            }
            const parseFailureGameConfig = 规范化游戏设置(currentState.gameConfig);
            const parseFailureApi = 获取主剧情接口配置(currentState.apiConfig);
            const parseErrorWithHint = 构建标签缺失补充提示({
                parseErrorDetail: parseErrorRaw,
                apiConfig: parseFailureApi
            });
            const parseErrorTitle = /叙事人称不符/.test([
                parseErrorRaw,
                error?.parseDetail,
                error?.message
            ].filter(Boolean).join('\n'))
                ? '叙事人称不符'
                : '标签结构不完整';
            recordAiParseFailureDiagnostic({
                stage: 'main_story',
                error,
                rawText: parseErrorRawText,
                apiConfig: parseFailureApi,
                streaming: isStreaming,
                validateTagCompleteness: parseFailureGameConfig.启用标签检测完整性 === true,
                enableTagRepair: parseFailureGameConfig.启用标签修复 !== false,
                requireActionOptionsTag: parseFailureGameConfig.启用行动选项 !== false,
                inputTokens: deps.估算消息Token(
                    Array.isArray(currentState.历史记录)
                        ? currentState.历史记录.map((item: any) => ({ role: item?.role, content: item?.content || item?.rawJson || '' }))
                        : [],
                    parseFailureApi?.model
                ),
                outputTokens: deps.估算AI输出Token(parseErrorRawText, parseFailureApi?.model),
                gameTime: currentGameTime
            });
            if (deps.游戏设置启用自动重试(规范化游戏设置(currentState.gameConfig))) {
                if (!preservedDraftHistory) {
                    deps.设置历史记录([...updatedDisplayHistory, {
                        role: 'system',
                        content: `[系统错误]: ${parseErrorRaw}`,
                        timestamp: Date.now()
                    }]);
                }
                return {
                    cancelled: true,
                    needRerollConfirm: true,
                    parseErrorMessage: parseErrorWithHint,
                    parseErrorDetail: parseErrorWithHint,
                    parseErrorRawText,
                    errorTitle: parseErrorTitle,
                    recoveryHint: '可直接手动补全缺失标签后恢复，或尝试自动修复恢复；如果不想保留这版内容，也可以直接重ROLL。'
                };
            }
            return {
                cancelled: true,
                needRerollConfirm: true,
                parseErrorMessage: parseErrorWithHint,
                parseErrorDetail: parseFailureGameConfig.启用标签协议失败自动回炉 === false
                    ? `${parseErrorWithHint}\n\n当前已关闭“标签协议失败自动回炉”。最佳选择是直接重ROLL；若想保留这版内容，可点“查看/编辑原文”后修复缺失标签再重解析。`
                    : parseErrorWithHint,
                parseErrorRawText,
                errorTitle: parseErrorTitle,
                recoveryHint: '可直接手动补全缺失标签后恢复，或尝试自动修复恢复；如果不想保留这版内容，也可以直接重ROLL。'
            };
        }

        if (error?.name === 'TimeoutError') {
            recordDiagnosticLog('warn', ['主剧情流式超时-外部兜底', {
                errorMessage: error?.message || '',
                draftTextLength: (latestStreamDraftText || '').length,
                gameTime: currentGameTime,
                stack: typeof error?.stack === 'string' ? error.stack : undefined
            }]);
        } else {
            recordDiagnosticLog('error', ['主剧情请求未预期错误', {
                message: error?.message || '',
                name: error?.name || typeof error,
                gameTime: currentGameTime,
                draftTextLength: (latestStreamDraftText || '').length,
                stack: typeof error?.stack === 'string' ? error.stack : undefined
            }]);
        }

        const detail = deps.格式化错误详情(error);
        const summary = typeof error?.message === 'string' && error.message.trim().length > 0
            ? error.message
            : (typeof error === 'string' ? error : '未知错误');
        const errorMsg: 聊天记录结构 = {
            role: 'system',
            content: `[系统错误]: ${summary}`,
            timestamp: Date.now()
        };
        const preservedDraftHistory = 构建中断流式草稿历史({
            baseHistory: updatedDisplayHistory,
            draftText: latestStreamDraftText,
            draftTimestamp: streamMarker,
            gameTime: currentGameTime,
            summary,
            detailPrefix: '主剧情请求失败'
        });
        const nextHistory = preservedDraftHistory || [...updatedDisplayHistory, errorMsg];
        deps.设置历史记录(nextHistory);
        if (preservedDraftHistory) {
            void deps.performAutoSave({ history: preservedDraftHistory, force: true });
            return {
                cancelled: true,
                needRerollConfirm: true,
                parseErrorMessage: summary,
                parseErrorDetail: `${summary}\n\n已保留上方流式正文草稿。你可以在下面直接补全草稿后恢复，也可以点“重ROLL”回到本回合开始前。`,
                parseErrorRawText: latestStreamDraftText,
                errorTitle: '主剧情已中断，草稿已保留',
                recoveryHint: '若这版草稿还有价值，可以直接在此补全文本、补齐标签后恢复；如果这版已经跑偏，直接重ROLL最安全。'
            };
        }
        return {
            cancelled: true,
            errorDetail: detail,
            errorTitle: '请求失败'
        };
    } finally {
        deps.setLoading(false);
        if (!后台队列已启动 && deps.abortControllerRef.current === controller) {
            deps.abortControllerRef.current = null;
        }
        deps.recallAbortControllerRef.current = null;
    }
};
