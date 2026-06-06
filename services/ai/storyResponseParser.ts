import { GameResponse } from '../../types';
import { 规范化对白日志 } from '../../utils/dialogueLogNormalizer';
import { 是否可信正文标签发送者, 规范化正文发送者名 } from '../../utils/dialogueSpeakerGuard';
import { 拆分判定日志与后续正文, 提取判定日志前缀, 是否判定日志文本 } from '../../utils/judgmentFormat';
import { parseJsonWithRepair } from '../../utils/jsonRepair';

export interface StoryParseOptions {
    validateTagCompleteness?: boolean;
    enableTagRepair?: boolean;
    requireActionOptionsTag?: boolean;
    requireDynamicWorldTag?: boolean;
    validateDialogueFormat?: boolean;
}

export class StoryResponseParseError extends Error {
    rawText: string;
    parseDetail?: string;

    constructor(message: string, rawText: string, parseDetail?: string) {
        super(message);
        this.name = 'StoryResponseParseError';
        this.rawText = rawText;
        this.parseDetail = parseDetail;
    }
}

const 转义正则片段 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const 协议标签列表 = ['thinking', '剧情规划', '变量规划', '正文', '短期记忆', '命令', '行动选项', '动态世界', 'judge'] as const;
const 协议标签集合 = new Set<string>(协议标签列表);
const 协议固定必填标签 = ['正文', '短期记忆'] as const;
const 默认解析选项: Required<StoryParseOptions> = {
    validateTagCompleteness: false,
    enableTagRepair: true,
    requireActionOptionsTag: false,
    requireDynamicWorldTag: false,
    validateDialogueFormat: false
};

const 规范化解析选项 = (options?: StoryParseOptions): Required<StoryParseOptions> => ({
    validateTagCompleteness: options?.validateTagCompleteness === true,
    enableTagRepair: options?.enableTagRepair !== false,
    requireActionOptionsTag: options?.requireActionOptionsTag === true,
    requireDynamicWorldTag: options?.requireDynamicWorldTag === true,
    validateDialogueFormat: options?.validateDialogueFormat === true
});

type 协议标签 = (typeof 协议标签列表)[number];
type 可标题恢复标签 = Extract<协议标签, '剧情规划' | '变量规划' | '正文' | '短期记忆' | '命令' | '行动选项' | '动态世界'>;

const 协议标签别名映射: Record<string, 协议标签> = {
    thinking: 'thinking',
    think: 'thinking',
    thought: 'thinking',
    thoughts: 'thinking',
    cot: 'thinking',
    剧情规划: '剧情规划',
    storyplan: '剧情规划',
    storyplanning: '剧情规划',
    narrativeplan: '剧情规划',
    变量规划: '变量规划',
    varplan: '变量规划',
    variableplan: '变量规划',
    variableplanning: '变量规划',
    正文: '正文',
    body: '正文',
    content: '正文',
    text: '正文',
    log: '正文',
    logs: '正文',
    story: '正文',
    短期记忆: '短期记忆',
    shortterm: '短期记忆',
    shorttermmemory: '短期记忆',
    shortmemory: '短期记忆',
    memory: '短期记忆',
    summary: '短期记忆',
    recap: '短期记忆',
    memo: '短期记忆',
    命令: '命令',
    command: '命令',
    commands: '命令',
    cmd: '命令',
    行动选项: '行动选项',
    actionoption: '行动选项',
    actionoptions: '行动选项',
    option: '行动选项',
    options: '行动选项',
    choice: '行动选项',
    choices: '行动选项',
    动态世界: '动态世界',
    dynamicworld: '动态世界',
    worldevent: '动态世界',
    worldevents: '动态世界',
    judge: 'judge'
};

const 协议标题匹配规则: Record<可标题恢复标签, RegExp> = {
    剧情规划: /^(?:【\s*)?(?:剧情规划|story\s*plan(?:ning)?|narrative\s*plan)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    变量规划: /^(?:【\s*)?(?:变量规划|var(?:iable)?\s*plan(?:ning)?)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    正文: /^(?:【\s*)?(?:正文|body|content|text|log|logs|story)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    短期记忆: /^(?:【\s*)?(?:短期记忆|short\s*term(?:\s*memory)?|summary|recap|memo)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    命令: /^(?:【\s*)?(?:命令|commands?|cmd)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    行动选项: /^(?:【\s*)?(?:行动选项|action\s*options?|options?|choices?)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    动态世界: /^(?:【\s*)?(?:动态世界|dynamic\s*world|world\s*events?)(?:\s*】)?\s*[:：]?\s*(.*)$/i
};

const 归一化标签括号符号 = (text: string): string => (
    (text || '')
        .replace(/\r\n/g, '\n')
        .replace(/[＜〈《]/g, '<')
        .replace(/[＞〉》]/g, '>')
);

const 归一化标签名键 = (tagName: string): string => (
    (tagName || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]/g, '')
);

const 归一化协议标签名 = (tagName: string): 协议标签 | '' => {
    const raw = (tagName || '').trim();
    if (!raw) return '';
    if (协议标签集合.has(raw)) return raw as 协议标签;
    return 协议标签别名映射[归一化标签名键(raw)] || '';
};

const 提取标题区块内容 = (text: string): Partial<Record<可标题恢复标签, string>> => {
    const sections: Record<可标题恢复标签, string[]> = {
        剧情规划: [],
        变量规划: [],
        正文: [],
        短期记忆: [],
        命令: [],
        行动选项: [],
        动态世界: []
    };
    const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
    let current: 可标题恢复标签 | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        let switched = false;
        for (const tag of Object.keys(协议标题匹配规则) as 可标题恢复标签[]) {
            const matched = line.match(协议标题匹配规则[tag]);
            if (matched) {
                current = tag;
                const firstLine = (matched[1] || '').trim();
                if (firstLine) sections[tag].push(firstLine);
                switched = true;
                break;
            }
        }
        if (switched) continue;
        if (current && line) {
            sections[current].push(rawLine.trimEnd());
        }
    }

    const result: Partial<Record<可标题恢复标签, string>> = {};
    for (const tag of Object.keys(sections) as 可标题恢复标签[]) {
        const payload = sections[tag].join('\n').trim();
        if (payload) result[tag] = payload;
    }
    return result;
};

const 提取候选命令文本 = (text: string): string => {
    const rawLines = (text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter(line => line.trim().length > 0)
        .filter(line => !/^<[^>]+>$/.test(line.trim()));

    const commandHeaderRegex = /^(?:(?:[-*•])\s*|\d+[.)、]\s*)?(add|set|push|delete)\s+([^\s=＝]+)(?:\s*(?:[=＝]\s*|\s+)([\s\S]+))?$/i;
    const commands: string[] = [];

    const 清理命令尾部分隔符 = (source: string): string => {
        const text = (source || '').trimEnd();
        if (!text) return '';
        let inString = false;
        let stringQuote = '';
        let escaped = false;
        let balance = 0;
        for (const ch of text) {
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === stringQuote) {
                    inString = false;
                    stringQuote = '';
                }
                continue;
            }
            if (ch === '"' || ch === '\'') {
                inString = true;
                stringQuote = ch;
                continue;
            }
            if (ch === '{' || ch === '[') {
                balance += 1;
                continue;
            }
            if (ch === '}' || ch === ']') {
                balance = Math.max(0, balance - 1);
            }
        }
        if (balance > 0) return text;
        return text.replace(/[；;，,]\s*$/, '').trimEnd();
    };

    const 计算括号平衡 = (source: string): number => {
        let balance = 0;
        let inString = false;
        let stringQuote = '';
        let escaped = false;
        for (const ch of source) {
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === stringQuote) {
                    inString = false;
                    stringQuote = '';
                }
                continue;
            }
            if (ch === '"' || ch === '\'') {
                inString = true;
                stringQuote = ch;
                continue;
            }
            if (ch === '{' || ch === '[') {
                balance += 1;
                continue;
            }
            if (ch === '}' || ch === ']') {
                balance -= 1;
            }
        }
        return balance;
    };
    const 收集多行命令值 = (
        lines: string[],
        startIndex: number,
        initialValueText: string
    ): { valueText: string; consumedUntil: number } => {
        let consumedUntil = startIndex;
        let valueText = (initialValueText || '').trim();
        const nextLine = lines[startIndex + 1]?.trim() || '';

        if (!valueText && (nextLine.startsWith('{') || nextLine.startsWith('['))) {
            consumedUntil += 1;
            valueText = lines[consumedUntil].trimEnd();
        }

        if (!(valueText.startsWith('{') || valueText.startsWith('['))) {
            return { valueText, consumedUntil };
        }

        let balance = 计算括号平衡(valueText);
        while (balance > 0 && consumedUntil + 1 < lines.length) {
            consumedUntil += 1;
            valueText = `${valueText}\n${lines[consumedUntil].trimEnd()}`;
            balance = 计算括号平衡(valueText);
        }

        return { valueText, consumedUntil };
    };

    for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i].trim();
        const match = line.match(commandHeaderRegex);
        if (!match) continue;

        let commandText = line.trimEnd();
        const multiLineValue = 收集多行命令值(rawLines, i, (match[3] || '').trim());
        let rawValueText = multiLineValue.valueText;
        if (multiLineValue.consumedUntil > i) {
            for (let cursor = i + 1; cursor <= multiLineValue.consumedUntil; cursor += 1) {
                commandText = `${commandText}\n${rawLines[cursor].trimEnd()}`;
            }
            i = multiLineValue.consumedUntil;
        }
        if (rawValueText && commandText === line.trimEnd() && (rawValueText.startsWith('{') || rawValueText.startsWith('['))) {
            let balance = 计算括号平衡(rawValueText);
            while (balance > 0 && i + 1 < rawLines.length) {
                i += 1;
                const nextRawLine = rawLines[i];
                commandText = `${commandText}\n${nextRawLine.trimEnd()}`;
                rawValueText = `${rawValueText}\n${nextRawLine.trimEnd()}`;
                balance = 计算括号平衡(rawValueText);
            }
        }
        commands.push(清理命令尾部分隔符(commandText));
    }

    return commands.join('\n').trim();
};

const 提取候选正文文本 = (text: string): string => {
    let stripped = (text || '').replace(/\r\n/g, '\n');
    for (const tag of ['剧情规划', '变量规划', '短期记忆', '命令', '行动选项', '动态世界', 'judge']) {
        const escapedTag = 转义正则片段(tag);
        stripped = stripped.replace(new RegExp(`<\\s*${escapedTag}\\s*>[\\s\\S]*?<\\s*/\\s*${escapedTag}\\s*>`, 'gi'), '\n');
    }
    stripped = stripped
        .replace(/<\s*\/?\s*thinking\s*>/gi, '\n')
        .replace(/<\s*\/?\s*think\s*>/gi, '\n');
    const lines = stripped
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/^<[^>]+>$/.test(line))
        .filter(line => !Object.values(协议标题匹配规则).some(rule => rule.test(line)));
    return lines.join('\n').trim();
};

const 清理正文残留协议内容 = (body: string): string => {
    let stripped = (body || '').replace(/\r\n/g, '\n');
    for (const tag of ['剧情规划', '变量规划', '短期记忆', '命令', '行动选项', '动态世界']) {
        const escapedTag = 转义正则片段(tag);
        stripped = stripped.replace(new RegExp(`<\\s*${escapedTag}\\s*>[\\s\\S]*?<\\s*/\\s*${escapedTag}\\s*>`, 'gi'), '\n');
    }
    const lines: string[] = [];
    for (const rawLine of stripped.split('\n')) {
        const line = rawLine.trim();
        const isNonBodyProtocolHeader = (Object.keys(协议标题匹配规则) as 可标题恢复标签[])
            .filter((tag) => tag !== '正文')
            .some((tag) => 协议标题匹配规则[tag].test(line));
        if (isNonBodyProtocolHeader) break;
        lines.push(rawLine);
    }
    return 清理正文初始化泄露内容(lines.join('\n')).trim();
};

const 初始化泄露标题规则 = /^(?:#{1,6}\s*)?\d+[.、]\s*(角色初始化|环境初始化|社交初始化|门派与任务初始化)(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*$/;
const 初始化泄露行规则 = /^(?:[-*]\s*)?(?:\*\*)?(基础信息|基础属性|境界系统|属性数值|六维|天赋列表|身体状态|资产|资产与物品|装备与物品|装备中|物品列表|坐标|时间|地点层级|天气|玩家门派|任务列表|NPC\d+|Item\d+|Task\d+)(?:\*\*)?\s*[：:]/;
const 初始化泄露列表行规则 = /^(?:[-*]\s*)?(?:\*\*[^*]+?\*\*|(?:姓名|年龄|性别|身份|称号|境界|境界层级|内力|精力|饱腹|口渴|头部|胸部|腹部|左手|右手|左腿|右腿|金钱|装备中|物品列表|地点层级|天气|玩家门派)\b|[\[\{]?(?:NPC|Item|Task)\d+|\[\d+\]\s*名称[：:])/;

const 清理正文初始化泄露内容 = (body: string): string => {
    const source = (body || '').replace(/\r\n/g, '\n');
    if (!source.trim()) return '';
    const lines = source.split('\n');
    const result: string[] = [];
    let inInitLeakBlock = false;
    let removedCount = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        const startsInitSection = 初始化泄露标题规则.test(line);
        if (startsInitSection) {
            inInitLeakBlock = true;
            removedCount += 1;
            continue;
        }

        if (inInitLeakBlock) {
            if (!line || /^(?:#{1,6}\s*)?\d+[.、]\s*/.test(line) || 初始化泄露行规则.test(line) || 初始化泄露列表行规则.test(line)) {
                removedCount += 1;
                continue;
            }
            if (/^[-*]\s+/.test(line)) {
                removedCount += 1;
                continue;
            }
            inInitLeakBlock = false;
        }

        if (初始化泄露行规则.test(line) && removedCount > 0) {
            removedCount += 1;
            continue;
        }
        result.push(rawLine);
    }

    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const 写入协议标签段 = (
    source: string,
    tag: 可标题恢复标签,
    payload: string,
    options?: { 缺失时默认内容?: string; 允许空内容?: boolean }
): string => {
    const text = source || '';
    const escapedTag = 转义正则片段(tag);
    const blockRegex = new RegExp(`(<\\s*${escapedTag}\\s*>)([\\s\\S]*?)(<\\s*/\\s*${escapedTag}\\s*>)`, 'i');
    const matched = text.match(blockRegex);
    const normalizedPayload = (payload || '').trim();
    const fallback = options?.缺失时默认内容 ?? '';
    const finalPayload = normalizedPayload || fallback;

    if (matched) {
        const currentPayload = (matched[2] || '').trim();
        if (!currentPayload && finalPayload) {
            return text.replace(blockRegex, `<${tag}>${finalPayload}</${tag}>`);
        }
        return text;
    }

    if (!finalPayload && options?.允许空内容 !== true) {
        return text;
    }
    const prefix = text.trimEnd();
    const lineBreak = prefix.length > 0 ? '\n' : '';
    return `${prefix}${lineBreak}<${tag}>${finalPayload}</${tag}>`;
};

const 补全协议缺失区块 = (content: string): string => {
    let text = content || '';
    const sections = 提取标题区块内容(text);
    const 正文候选 = sections.正文 || 提取候选正文文本(text);
    const 短期候选 = sections.短期记忆 || '';
    const 命令候选 = sections.命令 || 提取候选命令文本(text);

    text = 写入协议标签段(text, '正文', 正文候选, { 允许空内容: true });
    text = 写入协议标签段(text, '短期记忆', 短期候选, { 缺失时默认内容: '无' });
    if (命令候选) {
        text = 写入协议标签段(text, '命令', 命令候选, { 允许空内容: true });
    }

    if (sections.行动选项) {
        text = 写入协议标签段(text, '行动选项', sections.行动选项, { 允许空内容: true });
    }
    if (sections.动态世界) {
        text = 写入协议标签段(text, '动态世界', sections.动态世界, { 允许空内容: true });
    }
    return text;
};

const 统计标签数量 = (text: string, tag: string): { open: number; close: number } => {
    const escapedTag = 转义正则片段(tag);
    const open = (text.match(new RegExp(`<\\s*${escapedTag}\\s*>`, 'gi')) || []).length;
    const close = (text.match(new RegExp(`<\\s*/\\s*${escapedTag}\\s*>`, 'gi')) || []).length;
    return { open, close };
};

const 提取标签载荷列表_含空内容 = (text: string, tag: string): string[] => {
    if (!text || !tag) return [];
    const escapedTag = 转义正则片段(tag);
    const regex = new RegExp(`<\\s*${escapedTag}\\s*>\\s*([\\s\\S]*?)\\s*<\\s*/\\s*${escapedTag}\\s*>`, 'gi');
    const payloads: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
        payloads.push((match[1] || '').trim());
    }
    return payloads;
};

export const 提取首尾思考区段 = (text: string): { thinking: string; textWithoutThinking: string; matched: boolean } => {
    const source = typeof text === 'string' ? text : '';
    if (!source) return { thinking: '', textWithoutThinking: '', matched: false };

    const thinkingCloseRegex = /<\s*\/\s*(thinking|think)\s*>/gi;
    let closeMatch: RegExpExecArray | null = null;
    let lastThinkingCloseMatch: RegExpExecArray | null = null;
    while ((closeMatch = thinkingCloseRegex.exec(source)) !== null) {
        lastThinkingCloseMatch = closeMatch;
    }
    if (lastThinkingCloseMatch && typeof lastThinkingCloseMatch.index === 'number') {
        const closeTag = lastThinkingCloseMatch[0] || '';
        const splitIndex = lastThinkingCloseMatch.index + closeTag.length;
        const thinkingRaw = source.slice(0, splitIndex);
        const textWithoutThinking = source.slice(splitIndex);
        const thinking = thinkingRaw.replace(/<\s*\/?\s*(thinking|think)\s*>/gi, '').trim();
        return { thinking, textWithoutThinking, matched: true };
    }

    const bodyOpenRegex = /<\s*正文\s*>/gi;
    let bodyOpenMatch: RegExpExecArray | null = null;
    let lastBodyOpenMatch: RegExpExecArray | null = null;
    while ((bodyOpenMatch = bodyOpenRegex.exec(source)) !== null) {
        lastBodyOpenMatch = bodyOpenMatch;
    }
    if (lastBodyOpenMatch && typeof lastBodyOpenMatch.index === 'number') {
        const thinkingRaw = source.slice(0, lastBodyOpenMatch.index);
        const thinking = thinkingRaw.replace(/<\s*\/?\s*(thinking|think)\s*>/gi, '').trim();
        const textWithoutThinking = source.slice(lastBodyOpenMatch.index);
        return { thinking, textWithoutThinking, matched: true };
    }

    if (!/<\s*(thinking|think)\s*>/i.test(source)) {
        return { thinking: '', textWithoutThinking: source, matched: false };
    }

    return {
        thinking: source.replace(/<\s*\/?\s*(thinking|think)\s*>/gi, '').trim(),
        textWithoutThinking: '',
        matched: true
    };
};

const 检测标签完整性问题 = (text: string, _options: Required<StoryParseOptions>): string[] => {
    const issues: string[] = [];
    const thinkingSegment = 提取首尾思考区段(text);
    const textForValidation = thinkingSegment.matched ? thinkingSegment.textWithoutThinking : text;
    const requiredTags = [...协议固定必填标签];

    for (const tag of requiredTags) {
        const stats = 统计标签数量(textForValidation, tag);
        if (stats.open === 0) {
            issues.push(`缺少 <${tag}> 开始标签`);
        }
        if (stats.close === 0) {
            issues.push(`缺少 </${tag}> 闭合标签`);
        }
        if (stats.open !== stats.close) {
            issues.push(`<${tag}> 开闭标签数量不一致（${stats.open}/${stats.close}）`);
        }
        if (stats.open > 0 && stats.close > 0) {
            const payloads = 提取标签载荷列表_含空内容(textForValidation, tag);
            if (payloads.length === 0 || payloads.every(item => item.length === 0)) {
                issues.push(`<${tag}> 标签内容为空`);
            }
        }
    }
    return issues;
};

const 修复标签协议文本 = (content: string): string => {
    const text = 归一化标签括号符号(content || '');
    if (!text.trim()) return text;

    const tagRegex = /<\s*(\/?)\s*([A-Za-z0-9_\-\u3400-\u9fff]+)\s*>/g;
    const stack: string[] = [];
    let lastIndex = 0;
    let rebuilt = '';
    let match: RegExpExecArray | null = null;

    while ((match = tagRegex.exec(text)) !== null) {
        const rawToken = match[0];
        const isClosing = (match[1] || '') === '/';
        const tagNameRaw = (match[2] || '').trim();
        const tagName = 归一化协议标签名(tagNameRaw);
        const isAuxiliaryNestedTag = tagName === 'judge';

        rebuilt += text.slice(lastIndex, match.index);
        lastIndex = tagRegex.lastIndex;

        if (!tagName) {
            rebuilt += rawToken;
            continue;
        }

        if (!isClosing) {
            if (isAuxiliaryNestedTag) {
                if (stack.length > 0 && stack[stack.length - 1] === tagName) {
                    stack.pop();
                    rebuilt += `</${tagName}>`;
                } else {
                    stack.push(tagName);
                    rebuilt += `<${tagName}>`;
                }
                continue;
            }

            while (stack.length > 0 && stack[stack.length - 1] !== tagName) {
                const top = stack[stack.length - 1];
                if (top === 'judge') break;
                const closing = stack.pop() as string;
                rebuilt += `</${closing}>`;
            }

            if (stack.length > 0 && stack[stack.length - 1] === tagName) {
                stack.pop();
                rebuilt += `</${tagName}>`;
            } else {
                stack.push(tagName);
                rebuilt += `<${tagName}>`;
            }
            continue;
        }

        if (stack.length === 0) {
            continue;
        }

        if (stack[stack.length - 1] === tagName) {
            stack.pop();
            rebuilt += `</${tagName}>`;
            continue;
        }

        while (stack.length > 0 && stack[stack.length - 1] !== tagName) {
            const top = stack[stack.length - 1];
            if (!isAuxiliaryNestedTag && top === 'judge') {
                const closing = stack.pop() as string;
                rebuilt += `</${closing}>`;
                continue;
            }
            if (isAuxiliaryNestedTag) break;
            const closing = stack.pop() as string;
            rebuilt += `</${closing}>`;
        }
        if (stack.length > 0 && stack[stack.length - 1] === tagName) {
            stack.pop();
            rebuilt += `</${tagName}>`;
        }
    }

    rebuilt += text.slice(lastIndex);
    while (stack.length > 0) {
        rebuilt += `</${stack.pop() as string}>`;
    }
    return 补全协议缺失区块(rebuilt);
};

const 提取标签内容列表 = (
    text: string,
    tag: string,
    options?: { 兼容错误闭合?: boolean }
): string[] => {
    if (!text || !tag) return [];
    const escapedTag = 转义正则片段(tag);
    const closeTag = options?.兼容错误闭合
        ? `(?:</${escapedTag}>|<${escapedTag}>)`
        : `</${escapedTag}>`;
    const regex = new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*${closeTag}`, 'gi');
    const list: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
        const payload = (match[1] || '').trim();
        if (payload) list.push(payload);
    }
    return list;
};

export const 提取首个标签内容 = (
    text: string,
    tag: string,
    options?: { 兼容错误闭合?: boolean }
): string => {
    const list = 提取标签内容列表(text, tag, options);
    return list[0] || '';
};

const 规范化日志发送者 = (senderRaw: string): string => {
    return 规范化正文发送者名(senderRaw);
};

const 是否判定类日志发送者 = (senderRaw: string): boolean => {
    const sender = (senderRaw || '').trim();
    return Boolean(提取判定日志前缀(sender))
        || /^(【)?(?:判定|NSFW判定|先机|瞄准|接战|对撞|对抗|防御|化解|伤害|态势|反击|反馈|消耗|洞察|衰退)(】)?$/.test(sender);
};

const 正文冒号说话人排除集合 = new Set([
    '地点', '时间', '天气', '任务', '命令', '短期记忆', '中期记忆', '长期记忆', '即时记忆',
    '剧情规划', '变量规划', '正文', '行动选项', '动态世界', '触发对象', '对象', '判定值',
    '难度', '胜方', '败方', '差值', '伤害值', '消耗', '剩余', '后果', '发现度',
    '基础', '环境', '状态', '幸运', '装备', '结果', '奖励', '获得', '失去'
]);

const 解析无括号正文发送者行 = (_line: string): { sender: string; text: string } | null => {
    // Disabled: only explicit bracketed speakers 【角色名】 are allowed to mark dialogue.
    // Treat bare-colon lines (如 `角色: 文本`) as narration. Return null to prevent
    // implicit speaker extraction.
    return null;
};

const 解析判定日志行 = (line: string): { sender: string; text: string; trailingBody?: string } | null => {
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

const Judge标签残片行正则 = /^\s*(?:<|&lt;)\s*\/?\s*judge\s*(?:>|&gt;)\s*$/i;
const Judge数值起始行正则 = /^判定值\s*[+\-]?\d+(?:\.\d+)?\s*\/\s*难度\s*[+\-]?\d+(?:\.\d+)?/;
const Judge明细延续行正则 = /^(?:触发对象|对象|判定值|难度|基础\s*B|环境\s*E|状态\s*S|幸运\s*L|装备\s*Q|胜方|败方|差值|失败窗口|硬失败|结果)\s*(?:[=:：]|[（(]|[A-Za-z＋+\-0-9])/;
const Judge标题残片行正则 = /^(?:【\s*[^】｜\n\r]{1,16}\s*】|\[\s*[^\]｜\n\r]{1,16}\s*\])\s*[^｜\n\r]{0,80}$/;

const 是否Judge标签残片行 = (line: string): boolean => Judge标签残片行正则.test(line.trim());
const 是否Judge数值起始行 = (line: string): boolean => Judge数值起始行正则.test(line.trim());
const 是否Judge明细延续行 = (line: string): boolean => Judge明细延续行正则.test(line.trim());

const 下一条非空行 = (lines: string[], startIndex: number): string => {
    for (let index = startIndex; index < lines.length; index += 1) {
        const line = (lines[index] || '').trim();
        if (line) return line;
    }
    return '';
};

const 清理正文Judge残片 = (body: string): string => {
    const lines = (body || '').replace(/\r\n/g, '\n').split('\n');
    const result: string[] = [];
    let inOrphanJudgeDetail = false;

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index] || '';
        const line = rawLine.trim();

        if (是否Judge标签残片行(line)) {
            continue;
        }

        const nextNonEmpty = 下一条非空行(lines, index + 1);
        if (
            !inOrphanJudgeDetail
            && Judge标题残片行正则.test(line)
            && 是否Judge数值起始行(nextNonEmpty)
        ) {
            inOrphanJudgeDetail = true;
            continue;
        }

        if (是否Judge数值起始行(line)) {
            inOrphanJudgeDetail = true;
            continue;
        }

        if (inOrphanJudgeDetail) {
            if (!line) {
                inOrphanJudgeDetail = false;
                result.push(rawLine);
                continue;
            }
            if (是否Judge明细延续行(line) || 是否Judge标签残片行(line)) {
                continue;
            }
            inOrphanJudgeDetail = false;
        }

        result.push(rawLine);
    }

    return result.join('\n')
        .replace(/(?:<|&lt;)\s*\/?\s*judge\s*(?:>|&gt;)/gi, '\n')
        .replace(/[\t ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const 提取正文中的Judge区块 = (body: string): { cleanBody: string; judgeBlocks: GameResponse['judge_blocks'] } => {
    const source = (body || '').replace(/\r\n/g, '\n');
    if (!source.trim()) {
        return { cleanBody: '', judgeBlocks: undefined };
    }

    const judgeBlocks: NonNullable<GameResponse['judge_blocks']> = [];
    const cleanBody = source.replace(/<\s*judge\s*>([\s\S]*?)(?:<\s*\/\s*judge\s*>|<\s*judge\s*>|$)/gi, (_full, payload: string) => {
        const normalized = (payload || '').replace(/\r\n/g, '\n').trim();
        if (normalized) {
            judgeBlocks.push({
                raw: normalized,
                text: normalized,
                attachedTo: `judge_${judgeBlocks.length + 1}`,
                isNsfw: /NSFW判定/i.test(normalized)
            });
        }
        return '\n';
    })
        .replace(/(^|\n)\s*<\s*\/??\s*judge\s*>\s*(?=\n|$)/gi, '$1')
        .replace(/[\t ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

    return {
        cleanBody: 清理正文Judge残片(cleanBody),
        judgeBlocks: judgeBlocks.length > 0 ? judgeBlocks : undefined
    };
};

const 解析正文日志 = (body: string): Array<{ sender: string; text: string }> => {
    if (!body || !body.trim()) return [];
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const logs: Array<{ sender: string; text: string }> = [];
    let current: { sender: string; text: string } | null = null;
    const 写入旁白行 = (value: string) => {
        const text = (value || '').trimEnd();
        if (!text.trim()) return;
        if (current?.sender === '旁白') {
            current.text = `${current.text}\n${text}`.trimEnd();
            return;
        }
        current = { sender: '旁白', text };
        logs.push(current);
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (current) {
                current.text = `${current.text}\n`;
            }
            continue;
        }

        const judgmentLine = 解析判定日志行(line);
        if (judgmentLine) {
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
            const sender = 规范化日志发送者(match[1]);
            const text = (match[2] || '').trim();
            if (!是否可信正文标签发送者(sender)) {
                写入旁白行(rawLine.trimEnd());
                continue;
            }
            current = { sender, text };
            logs.push(current);
            continue;
        }

        const currentIsJudgment = current && (是否判定类日志发送者(current.sender) || 是否判定日志文本(current.text));
        const plainSenderLine = 解析无括号正文发送者行(line);
        if (plainSenderLine) {
            current = plainSenderLine;
            logs.push(current);
            continue;
        }
        if (currentIsJudgment) {
            写入旁白行(rawLine.trimEnd());
            continue;
        }

        if (current) {
            current.text = `${current.text}\n${rawLine.trimEnd()}`.trimEnd();
            continue;
        }

        写入旁白行(rawLine.trimEnd());
    }

    return logs.filter(item => item.text.trim().length > 0);
};

const 无标签人物动作动词正则 = /^(?:将|把|给|向|对|朝|走|站|坐|停|回|转|看|望|抬|低|点|摇|皱|叹|笑|冷笑|苦笑|轻笑|沉|伸|握|按|收|拔|举|放|推|扶|拂|敛|挑|倒|取|递|开口|提醒|解释|说道|说|道|问|答)/;
const 无标签口语起始正则 = /^(?:我|我们|咱|咱们|你|你们|这事|那就|既然|今天|明天|现在|眼下|先|别|不要|必须|可以|应该|不是|恐怕|看来|听我|放心|等等|走|快|慢着|且慢|好|嗯|不行|没错|自然|当然|只要)/;
const 无标签叙事动作特征正则 = /(?:走到|来到|回到|站在|坐在|望向|看向|拿起|放下|推开|打开|穿过|掠过|落在|映在|吹过|响起|传来|升起|落下|归鞘|倒了|喝了|吃了|伸手|抬手|皱眉|点头|摇头|叹息|沉默|停下|转身)/;
const 无标签非人名短语正则 = /^(?:随着|伴随|当他|当她|当你|当我|如果|若是|只是|这是|那是|这个|那个|这种|那种|此时|这时|随后|然后|接着|同时|终于|突然|忽然|仍然|已经|开始|继续|所有|全场|一切|空气|雨声|风声|灯光|夜色|晨光|脚步|声音)/;
const 无标签口语证据正则 = /[我你咱]|[？?！!]|(?:吧|吗|呢|啊|呀|嘛|呗|啦|喂|哼|嗯|唔|哦|行|好|滚|停|走|快|慢着|且慢)[。！？!?…~～]*$/;

const 提取无标签动作行人物名 = (line: string): string => {
    const text = (line || '').trim();
    for (let length = 4; length >= 2; length -= 1) {
        const name = text.slice(0, length);
        const rest = text.slice(length);
        if (!/^[\u4e00-\u9fff]{2,4}$/.test(name)) continue;
        if (无标签非人名短语正则.test(name)) continue;
        if (/[冷苦轻]$/.test(name) && /^笑/.test(rest)) continue;
        if (无标签人物动作动词正则.test(rest)) return name;
    }
    return '';
};

const 是否像无标签口语行 = (line: string): boolean => {
    const text = (line || '').trim();
    if (text.length < 6 || text.length > 260) return false;
    if (/^【\s*[^】]+?\s*】/.test(text) || /[“"「『][^”"」』\n]{1,500}[”"」』]/.test(text)) return false;
    if (!无标签口语证据正则.test(text)) return false;
    if (无标签叙事动作特征正则.test(text) && !/[我你咱]/.test(text)) return false;
    return 无标签口语起始正则.test(text) || /[？?！!]$/.test(text) || /(?:吧|吗|呢|啊|罢|了)$/.test(text);
};

const 检测正文对话格式问题 = (_body: string): string | null => {
  return null;
};

const 清理命令尾部分隔符 = (source: string): string => {
    const text = (source || '').trimEnd();
    if (!text) return '';
    let inString = false;
    let stringQuote = '';
    let escaped = false;
    let balance = 0;
    for (const ch of text) {
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === stringQuote) {
                inString = false;
                stringQuote = '';
            }
            continue;
        }
        if (ch === '"' || ch === '\'') {
            inString = true;
            stringQuote = ch;
            continue;
        }
        if (ch === '{' || ch === '[') {
            balance += 1;
            continue;
        }
        if (ch === '}' || ch === ']') {
            balance = Math.max(0, balance - 1);
        }
    }
    if (balance > 0) return text;
    return text.replace(/[；;，,]\s*$/, '').trimEnd();
};

const 归一化命令动作 = (rawAction: string): 'add' | 'set' | 'push' | 'delete' | 'sub' | '' => {
    const action = (rawAction || '').trim().toLowerCase();
    switch (action) {
        case 'add':
        case 'set':
        case 'push':
        case 'delete':
        case 'sub':
            return action;
        case '增加':
        case '新增':
        case '累加':
            return 'add';
        case '设置':
        case '设为':
        case '写入':
            return 'set';
        case '追加':
        case '插入':
            return 'push';
        case '删除':
        case '移除':
            return 'delete';
        case '扣减':
        case '减少':
            return 'sub';
        default:
            return '';
    }
};

const 清理命令包裹文本 = (input: string): string => (
    (input || '')
        .replace(/\r\n/g, '\n')
        .replace(/^<\s*命令\s*>\s*/i, '')
        .replace(/\s*<\s*\/\s*命令\s*>\s*$/i, '')
        .replace(/^```(?:json|text|plaintext|markdown)?\s*/i, '')
        .replace(/```$/i, '')
        .trim()
);

const 解析命令值 = (rawValue: string | undefined): any => {
    const text = 预处理命令文本((rawValue || '').trim()).trim();
    if (!text) return null;

    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1);
    }

    if (/^(true|false)$/i.test(text)) {
        return text.toLowerCase() === 'true';
    }
    if (/^null$/i.test(text)) {
        return null;
    }
    if (/^[+\-]?\d+(?:\.\d+)?$/.test(text)) {
        const num = Number(text);
        if (Number.isFinite(num)) return num;
    }

    const jsonCandidate = parseJsonWithRepair<any>(text);
    if (jsonCandidate.value !== null) return jsonCandidate.value;

    if (text.startsWith('{') || text.startsWith('[')) {
        const stripped = text.replace(/^\s*[\[{]\s*\n?/, '').replace(/\n?\s*[\]}]\s*$/, '').trim();
        const wrapped = text.startsWith('[') ? `[${stripped}]` : `{${stripped}}`;
        const repaired = parseJsonWithRepair<any>(wrapped);
        if (repaired.value !== null) return repaired.value;
    }

    return text;
};

type 标准命令结构 = { action: 'add' | 'set' | 'push' | 'delete'; key: string; value: any };

const 标准化命令对象列表 = (raw: any): 标准命令结构[] => {
    if (!raw || typeof raw !== 'object') return [];
    const 合法动作集合 = new Set(['add', 'set', 'push', 'delete', 'sub']);

    const 归一化动作 = (actionRaw: string): 'add' | 'set' | 'push' | 'delete' => (
        (actionRaw === 'sub' ? 'add' : actionRaw) as 'add' | 'set' | 'push' | 'delete'
    );

    const 构建命令 = (actionRaw: string, keyRaw: any, valueRaw: any): 标准命令结构 | null => {
        const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
        if (!key) return null;
        const normalizedAction = 归一化动作(actionRaw);
        const normalizedValue = actionRaw === 'sub' && typeof valueRaw === 'number'
            ? -valueRaw
            : (valueRaw === undefined ? null : valueRaw);
        return {
            action: normalizedAction,
            key,
            value: normalizedValue
        };
    };

    // 兼容 action/key 格式
    const actionRaw = typeof raw.action === 'string' ? raw.action.trim().toLowerCase() : '';
    if (合法动作集合.has(actionRaw)) {
        const command = 构建命令(actionRaw, raw.key, raw.value);
        return command ? [command] : [];
    }

    // 兼容 op/path 格式：{"op":"set","path":"角色.姓名","value":"弦月"}
    const opRaw = typeof raw.op === 'string' ? raw.op.trim().toLowerCase() : '';
    if (合法动作集合.has(opRaw)) {
        const command = 构建命令(opRaw, raw.path, raw.value);
        return command ? [command] : [];
    }

    // 兼容对象映射格式：{"set":{"角色.姓名":"弦月"}} / {"push":{"社交":{...}}}
    for (const action of ['add', 'set', 'push', 'delete'] as const) {
        const payload = raw[action];
        if (payload === undefined || payload === null) continue;

        if (typeof payload === 'string') {
            const command = 构建命令(action, payload, raw.value);
            return command ? [command] : [];
        }

        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            return Object.entries(payload)
                .map(([entryKey, entryValue]) => 构建命令(action, entryKey, action === 'delete' ? null : entryValue))
                .filter((item): item is 标准命令结构 => Boolean(item));
        }
    }

    return [];
};

/**
 * 预处理命令文本：清理 JS 风格注释和简单算术表达式，使其成为合法 JSON。
 */
const 预处理命令文本 = (input: string): string => {
    // 1. 移除字符串外的单行注释 (// ...)
    const lines = input.replace(/\r\n/g, '\n').split('\n');
    const cleaned = lines.map(line => {
        let inString = false;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inString) {
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === '"') { inString = false; }
                continue;
            }
            if (ch === '"') { inString = true; continue; }
            if (ch === '/' && line[i + 1] === '/') {
                return line.slice(0, i).trimEnd();
            }
        }
        return line;
    }).join('\n');

    // 2. 将字符串外的简单算术表达式 (如 100 + 13*22 + 3*10) 求值为数字
    //    匹配 value 位置的纯数字算术表达式（仅含 +, -, *, / 和数字空格）
    return cleaned.replace(
        /(:\s*)([0-9][0-9+\-*/ ]+[0-9])\s*(?=[,}\]\n])/g,
        (_match, prefix: string, expr: string) => {
            const trimmed = expr.trim();
            // 只在表达式含有运算符时才求值
            if (!/[+\-*/]/.test(trimmed)) return `${prefix}${trimmed}`;
            // 校验安全性：只允许数字、运算符和空格
            if (!/^[0-9+\-*/ .()]+$/.test(trimmed)) return `${prefix}${trimmed}`;
            try {
                const result = new Function(`return (${trimmed})`)() as number;
                if (Number.isFinite(result)) return `${prefix}${result}`;
            } catch { /* 表达式无效则保留原文 */ }
            return `${prefix}${trimmed}`;
        }
    );
};

export const 解析命令块 = (commandBlock: string): Array<{ action: 'add' | 'set' | 'push' | 'delete'; key: string; value: any }> => {
    const raw = 清理命令包裹文本(commandBlock);
    if (!raw) return [];
    if (raw === '无' || raw.toLowerCase() === 'none') return [];
    // 预处理：清理注释和算术表达式
    const text = 预处理命令文本(raw);

    const parsed = parseJsonWithRepair<any>(text);
    if (parsed.value !== null) {
        if (Array.isArray(parsed.value)) {
            return parsed.value
                .flatMap((item) => 标准化命令对象列表(item));
        }
        if (parsed.value && Array.isArray(parsed.value.tavern_commands)) {
            return parsed.value.tavern_commands
                .flatMap((item: any) => 标准化命令对象列表(item));
        }
    }

    const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !line.startsWith('```'));
    const commands: Array<{ action: 'add' | 'set' | 'push' | 'delete'; key: string; value: any }> = [];
    const 计算括号平衡 = (source: string): number => {
        let balance = 0;
        let inString = false;
        let stringQuote = '';
        let escaped = false;
        for (const ch of source) {
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === stringQuote) {
                    inString = false;
                    stringQuote = '';
                }
                continue;
            }
            if (ch === '"' || ch === '\'') {
                inString = true;
                stringQuote = ch;
                continue;
            }
            if (ch === '{' || ch === '[') {
                balance += 1;
                continue;
            }
            if (ch === '}' || ch === ']') {
                balance -= 1;
            }
        }
        return balance;
    };
    const 收集多行命令值 = (
        sourceLines: string[],
        startIndex: number,
        initialValueText: string
    ): { valueText: string; consumedUntil: number } => {
        let consumedUntil = startIndex;
        let valueText = (initialValueText || '').trim();
        const nextLine = sourceLines[startIndex + 1]?.trim() || '';

        if (!valueText && (nextLine.startsWith('{') || nextLine.startsWith('['))) {
            consumedUntil += 1;
            valueText = sourceLines[consumedUntil];
        }

        if (!(valueText.startsWith('{') || valueText.startsWith('['))) {
            return { valueText, consumedUntil };
        }

        let balance = 计算括号平衡(valueText);
        while (balance > 0 && consumedUntil + 1 < sourceLines.length) {
            consumedUntil += 1;
            valueText = `${valueText}\n${sourceLines[consumedUntil]}`;
            balance = 计算括号平衡(valueText);
        }

        return { valueText, consumedUntil };
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const normalized = line
            .replace(/^\[#\d+\]\s*/i, '')
            .replace(/^#\d+\s*/i, '')
            .replace(/^\[\d+\]\s*/i, '')
            .replace(/^(?:(?:[\-*•])\s*|\d+[.)、]\s*)/, '')
            .trim();
        const match = normalized.match(/^([^\s=＝:：]+)\s+([^\s=＝:：]+)(?:\s*(?:=|＝|:|：|=>)\s*|\s+)?([\s\S]+)?$/i);
        if (!match) continue;
        const actionRaw = 归一化命令动作(match[1]);
        if (!actionRaw) continue;
        const action = (actionRaw === 'sub' ? 'add' : actionRaw) as 'add' | 'set' | 'push' | 'delete';
        const key = (match[2] || '').trim();
        if (!key) continue;
        const multiLineValue = actionRaw === 'delete'
            ? { valueText: '', consumedUntil: i }
            : 收集多行命令值(lines, i, (match[3] || '').trim());
        i = multiLineValue.consumedUntil;
        let value = actionRaw === 'delete' ? null : 解析命令值(清理命令尾部分隔符(multiLineValue.valueText));
        if (actionRaw === 'sub' && typeof value === 'number') {
            value = -value;
        }
        commands.push({ action, key, value });
    }

    return commands;
};

const 解析行动选项块 = (optionsBlock: string): string[] => {
    const text = (optionsBlock || '').trim();
    if (!text) return [];
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);
};

export const 解析动态世界块 = (dynamicBlock: string): string[] => {
    const text = (dynamicBlock || '').trim();
    if (!text) return [];
    if (text === '无' || text.toLowerCase() === 'none') return [];
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);
};

const 解析标签协议响应 = (content: string, options?: Required<StoryParseOptions>): GameResponse | null => {
    const text = (content || '').trim();
    if (!text) return null;

    const thinkingSegment = 提取首尾思考区段(text);
    const textWithoutThinking = thinkingSegment.textWithoutThinking;
    const titleSections = 提取标题区块内容(textWithoutThinking);
    const thinkingParts = 提取标签内容列表(text, 'thinking', { 兼容错误闭合: true });
    const bodyBlock = 提取首个标签内容(textWithoutThinking, '正文') || titleSections.正文 || '';
    const storyPlanBlock = 提取首个标签内容(textWithoutThinking, '剧情规划', { 兼容错误闭合: true }) || titleSections.剧情规划 || '';
    const variablePlanBlock = 提取首个标签内容(textWithoutThinking, '变量规划', { 兼容错误闭合: true }) || titleSections.变量规划 || '';
    const shortTerm = 提取首个标签内容(textWithoutThinking, '短期记忆', { 兼容错误闭合: true }) || titleSections.短期记忆 || '';
    const commandBlock = 提取首个标签内容(textWithoutThinking, '命令') || titleSections.命令 || '';
    const actionOptionsBlock = 提取首个标签内容(textWithoutThinking, '行动选项') || titleSections.行动选项 || '';
    const dynamicWorldBlock = 提取首个标签内容(textWithoutThinking, '动态世界') || titleSections.动态世界 || '';
    const bodyJudgeExtraction = 提取正文中的Judge区块(清理正文残留协议内容(bodyBlock || ''));
    const fallbackJudgeBlocks = 提取标签内容列表(textWithoutThinking, 'judge', { 兼容错误闭合: true })
        .map(item => item.replace(/\r\n/g, '\n').trim())
        .filter(Boolean)
        .map((item, index) => ({
            raw: item,
            text: item,
            attachedTo: `judge_${index + 1}`,
            isNsfw: /NSFW判定/i.test(item)
        }));
    const judgeBlocks = bodyJudgeExtraction.judgeBlocks && bodyJudgeExtraction.judgeBlocks.length > 0
        ? bodyJudgeExtraction.judgeBlocks
        : (fallbackJudgeBlocks.length > 0 ? fallbackJudgeBlocks : undefined);
    const nativeThinking = 提取标签内容列表(text, 'think', { 兼容错误闭合: true })
        .map(item => item.trim())
        .filter(Boolean)
        .join('\n\n');

    const dialogueFormatIssue = options?.validateDialogueFormat
        ? 检测正文对话格式问题(bodyJudgeExtraction.cleanBody)
        : null;
    if (dialogueFormatIssue) {
        throw new StoryResponseParseError(
            `${dialogueFormatIssue}。请重新生成本回合，并确保每句角色对白单独使用【角色名】开头，旁白只写动作与环境。`,
            content,
            dialogueFormatIssue
        );
    }

    let logs = 规范化对白日志(解析正文日志(bodyJudgeExtraction.cleanBody));
    if (logs.length === 0) {
        const fallbackBody = titleSections.正文 || 提取候选正文文本(textWithoutThinking);
        const stripped = 提取正文中的Judge区块(清理正文初始化泄露内容(fallbackBody)).cleanBody
            .replace(/<[^>]+>/g, '\n');
        if (/【[^】]+】/.test(stripped)) {
            logs = 规范化对白日志(解析正文日志(stripped));
        }
    }
    const commands = 解析命令块(commandBlock);
    const actionOptions = 解析行动选项块(actionOptionsBlock);
    const dynamicWorld = 解析动态世界块(dynamicWorldBlock);
    const explicitThinking = thinkingParts.map(item => item.trim()).filter(Boolean).join('\n\n').trim();
    const thinking = (thinkingSegment.thinking || explicitThinking || '').trim();

    if (logs.length === 0) {
        return null;
    }

    return {
        thinking_pre: thinking ? `<thinking>${thinking}</thinking>` : undefined,
        thinking_native: nativeThinking || undefined,
        t_plan: storyPlanBlock || undefined,
        t_var_plan: variablePlanBlock || undefined,
        logs,
        tavern_commands: commands.length > 0 ? commands : undefined,
        shortTerm: shortTerm || undefined,
        action_options: actionOptions.length > 0 ? actionOptions : undefined,
        dynamic_world: dynamicWorld.length > 0 ? dynamicWorld : undefined,
        judge_blocks: judgeBlocks
    };
};

const 修复思考区后半段标签协议文本 = (sourceText: string): string => {
    const source = typeof sourceText === 'string' ? sourceText : '';
    if (!source) return '';

    const thinkingSegment = 提取首尾思考区段(source);
    if (!thinkingSegment.matched) {
        return 修复标签协议文本(source);
    }

    const tail = thinkingSegment.textWithoutThinking;
    if (!tail) {
        return source;
    }

    const prefixLength = Math.max(0, source.length - tail.length);
    const prefix = source.slice(0, prefixLength);
    const repairedTail = 修复标签协议文本(tail);
    return `${prefix}${repairedTail}`;
};

const 归一化JSON结构响应 = (raw: any): GameResponse => {
    const logs = 规范化对白日志(Array.isArray(raw?.logs)
        ? raw.logs
            .map((item: any) => {
                if (typeof item === 'string') {
                    return { sender: '旁白', text: item };
                }
                if (item && typeof item === 'object') {
                    return {
                        sender: typeof item.sender === 'string' ? item.sender : '旁白',
                        text: typeof item.text === 'string' ? item.text : String(item.text ?? '')
                    };
                }
                return null;
            })
            .filter((item: any) => item && item.text.trim().length > 0)
        : []);

    const thinkingFieldKeys = [
        't_input',
        't_plan',
        't_var_plan',
        't_state',
        't_branch',
        't_precheck',
        't_logcheck',
        't_var',
        't_npc',
        't_cmd',
        't_audit',
        't_fix',
        't_mem',
        't_opts'
    ] as const;
    const normalizedThinkingFields = Object.fromEntries(
        thinkingFieldKeys
            .filter((key) => typeof raw?.[key] === 'string' && raw[key].trim().length > 0)
            .map((key) => [key, raw[key]])
    ) as Partial<GameResponse>;
    const normalizedTavernCommands = Array.isArray(raw?.tavern_commands)
        ? raw.tavern_commands
            .flatMap((item: any) => 标准化命令对象列表(item))
        : undefined;

    return {
        thinking_pre: typeof raw?.thinking_pre === 'string' ? raw.thinking_pre : undefined,
        thinking_native: typeof raw?.thinking_native === 'string' ? raw.thinking_native : undefined,
        logs,
        ...normalizedThinkingFields,
        thinking_post: typeof raw?.thinking_post === 'string' ? raw.thinking_post : undefined,
        tavern_commands: normalizedTavernCommands,
        shortTerm: typeof raw?.shortTerm === 'string' ? raw.shortTerm : undefined,
        action_options: Array.isArray(raw?.action_options)
            ? raw.action_options
                .map((item: any) => {
                    if (typeof item === 'string') return item.trim();
                    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
                    if (item && typeof item === 'object') {
                        const candidate = item.text ?? item.label ?? item.action ?? item.name ?? item.id;
                        if (typeof candidate === 'string') return candidate.trim();
                    }
                    return '';
                })
                .filter((item: string) => item.trim().length > 0)
            : undefined,
        dynamic_world: Array.isArray(raw?.dynamic_world)
            ? raw.dynamic_world
                .map((item: any) => {
                    if (typeof item === 'string') return item.trim();
                    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
                    if (item && typeof item === 'object') {
                        const candidate = item.text ?? item.content ?? item.title ?? item.id;
                        if (typeof candidate === 'string') return candidate.trim();
                    }
                    return '';
                })
                .filter((item: string) => item.trim().length > 0)
            : undefined,
        judge_blocks: Array.isArray(raw?.judge_blocks)
            ? raw.judge_blocks
                .map((item: any) => {
                    const rawText = typeof item?.raw === 'string' ? item.raw.trim() : (typeof item === 'string' ? item.trim() : '');
                    const text = typeof item?.text === 'string' ? item.text.trim() : rawText;
                    if (!rawText && !text) return null;
                    return {
                        raw: rawText || text,
                        text: text || rawText,
                        attachedTo: typeof item?.attachedTo === 'string' && item.attachedTo.trim().length > 0 ? item.attachedTo.trim() : undefined,
                        isNsfw: item?.isNsfw === true
                    };
                })
                .filter((item: any) => item && ((item.raw || item.text || '').trim().length > 0))
            : undefined
    };
};

export const parseStoryRawText = (content: string, options?: StoryParseOptions): GameResponse => {
    const parseOptions = 规范化解析选项(options || 默认解析选项);
    const rawText = typeof content === 'string' ? content : '';
    const normalizedText = parseOptions.enableTagRepair
        ? 修复思考区后半段标签协议文本(rawText)
        : rawText;

    if (parseOptions.validateTagCompleteness) {
        const issues = 检测标签完整性问题(normalizedText, parseOptions);
        if (issues.length > 0) {
            const detail = `标签完整性校验失败：\n- ${issues.join('\n- ')}`;
            throw new StoryResponseParseError(detail, rawText, detail);
        }
    }

    const tagged = 解析标签协议响应(normalizedText, parseOptions);
    if (tagged && tagged.logs.some(log => typeof log?.text === 'string' && log.text.trim().length > 0)) {
        return tagged;
    }

    const parsed = parseJsonWithRepair<any>(normalizedText);
    if (parsed.value && typeof parsed.value === 'object') {
        const normalized = 归一化JSON结构响应(parsed.value);
        const hasRenderableLogs = normalized.logs.some((log) => (
            typeof log?.text === 'string' && log.text.trim().length > 0
        ));
        if (hasRenderableLogs) {
            return normalized;
        }
        const hasThinking = Object.keys(normalized).some((key) => {
            const isThinkingField = key.startsWith('t_') || key === 'thinking_pre' || key === 'thinking_post';
            return isThinkingField && typeof (normalized as any)[key] === 'string' && (normalized as any)[key].trim().length > 0;
        });
        const detail = hasThinking
            ? '缺少 <正文> 有效内容（疑似响应截断）'
            : '返回内容结构不完整（缺少 <正文> 或 logs）';
        throw new StoryResponseParseError(detail, rawText, detail);
    }
    const parsedError = typeof parsed.error === 'string' ? parsed.error.trim() : '';
    const normalizedParsedError = /json\s*解析失败/i.test(parsedError) ? '' : parsedError;
    const detail = normalizedParsedError
        ? `返回内容不符合标签协议：${normalizedParsedError}`
        : '返回内容不符合标签协议（未匹配到完整标签结构）';
    throw new StoryResponseParseError(detail, rawText, detail);
};
