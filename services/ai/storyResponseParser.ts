import { GameResponse } from '../../types';
import { parseJsonWithRepair } from '../../utils/jsonRepair';

export interface StoryParseOptions {
    validateTagCompleteness?: boolean;
    enableTagRepair?: boolean;
    requireActionOptionsTag?: boolean;
    requireDynamicWorldTag?: boolean;
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
    requireDynamicWorldTag: false
};

const 规范化解析选项 = (options?: StoryParseOptions): Required<StoryParseOptions> => ({
    validateTagCompleteness: options?.validateTagCompleteness === true,
    enableTagRepair: options?.enableTagRepair !== false,
    requireActionOptionsTag: options?.requireActionOptionsTag === true,
    requireDynamicWorldTag: options?.requireDynamicWorldTag === true
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
    const sender = (senderRaw || '').trim();
    if (!sender) return '旁白';
    if (sender === '判定' || sender === '【判定】') return '【判定】';
    if (sender === 'NSFW判定' || sender === '【NSFW判定】') return '【NSFW判定】';
    return sender;
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
        cleanBody,
        judgeBlocks: judgeBlocks.length > 0 ? judgeBlocks : undefined
    };
};

const 解析正文日志 = (body: string): Array<{ sender: string; text: string }> => {
    if (!body || !body.trim()) return [];
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const logs: Array<{ sender: string; text: string }> = [];
    let current: { sender: string; text: string } | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (current) {
                current.text = `${current.text}\n`;
            }
            continue;
        }

        const match = line.match(/^【\s*([^】]+?)\s*】\s*(.*)$/);
        if (match) {
            const sender = 规范化日志发送者(match[1]);
            const text = (match[2] || '').trim();
            current = { sender, text };
            logs.push(current);
            continue;
        }

        if (current) {
            current.text = `${current.text}\n${rawLine.trimEnd()}`.trimEnd();
            continue;
        }

        current = { sender: '旁白', text: rawLine.trimEnd() };
        logs.push(current);
    }

    return logs.filter(item => item.text.trim().length > 0);
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

const 解析标签协议响应 = (content: string): GameResponse | null => {
    const text = (content || '').trim();
    if (!text) return null;

    const thinkingSegment = 提取首尾思考区段(text);
    const textWithoutThinking = thinkingSegment.textWithoutThinking;
    const titleSections = 提取标题区块内容(textWithoutThinking);
    const thinkingParts = 提取标签内容列表(text, 'thinking', { 兼容错误闭合: true });
    const bodyBlock = 提取首个标签内容(textWithoutThinking, '正文');
    const storyPlanBlock = 提取首个标签内容(textWithoutThinking, '剧情规划', { 兼容错误闭合: true }) || titleSections.剧情规划 || '';
    const variablePlanBlock = 提取首个标签内容(textWithoutThinking, '变量规划', { 兼容错误闭合: true }) || titleSections.变量规划 || '';
    const shortTerm = 提取首个标签内容(textWithoutThinking, '短期记忆', { 兼容错误闭合: true }) || titleSections.短期记忆 || '';
    const commandBlock = 提取首个标签内容(textWithoutThinking, '命令') || titleSections.命令 || '';
    const actionOptionsBlock = 提取首个标签内容(textWithoutThinking, '行动选项') || titleSections.行动选项 || '';
    const dynamicWorldBlock = 提取首个标签内容(textWithoutThinking, '动态世界') || titleSections.动态世界 || '';
    const bodyJudgeExtraction = 提取正文中的Judge区块(bodyBlock || '');
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

    let logs = 解析正文日志(bodyJudgeExtraction.cleanBody);
    if (logs.length === 0) {
        const stripped = 提取正文中的Judge区块(textWithoutThinking).cleanBody
            .replace(/<[^>]+>/g, '\n');
        if (/【[^】]+】/.test(stripped)) {
            logs = 解析正文日志(stripped);
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
    const logs = Array.isArray(raw?.logs)
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
        : [];

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

    const tagged = 解析标签协议响应(normalizedText);
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
