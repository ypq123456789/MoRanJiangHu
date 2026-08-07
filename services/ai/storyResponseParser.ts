import { GameResponse } from '../../types';
import { 规范化对白日志 } from '../../utils/dialogueLogNormalizer';
import { 是否可信正文标签发送者, 是否疑似叙事说话人提取候选, 规范化正文发送者名 } from '../../utils/dialogueSpeakerGuard';
import { 拆分判定日志与后续正文, 提取判定日志前缀, 是否判定日志文本 } from '../../utils/judgmentFormat';
import { 提取并清理Judge区块 } from '../../utils/judgeBlockExtractor';
import { parseJsonWithRepair } from '../../utils/jsonRepair';
import { 是否裸标准游戏时间行, 检测裸标准游戏时间行 } from '../../utils/bodyTextSanitizer';
import { 剥离强调标记 } from '../../utils/stateHelpers';

export interface StoryParseOptions {
    validateTagCompleteness?: boolean;
    enableTagRepair?: boolean;
    requireActionOptionsTag?: boolean;
    requireDynamicWorldTag?: boolean;
    validateDialogueFormat?: boolean;
    knownSpeakers?: string[];
}

export class StoryResponseParseError extends Error {
    rawText: string;
    parseDetail?: string;
    protocolIssues?: string[];

    constructor(message: string, rawText: string, parseDetail?: string, protocolIssues?: string[]) {
        super(message);
        this.name = 'StoryResponseParseError';
        this.rawText = rawText;
        this.parseDetail = parseDetail;
        this.protocolIssues = Array.isArray(protocolIssues) ? protocolIssues : undefined;
    }
}

const 转义正则片段 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const 协议标签列表 = ['thinking', '角色名单', '剧情规划', '变量规划', '正文', '短期记忆', '命令', '行动选项', '动态世界', 'judge'] as const;
const 协议标签集合 = new Set<string>(协议标签列表);
const 协议固定必填标签 = ['正文', '短期记忆'] as const;
const 酒馆元标签列表 = [
    'current_event',
    'progress',
    'tucao',
    'konatan_planning',
    'setup',
    'status',
    'state',
    'metadata'
] as const;
const 酒馆元标签集合 = new Set<string>(酒馆元标签列表);
const 酒馆状态行规则 = /^(?:当前主线任务|当前支线事件|最新使用支线事件编号|时间推进)\s*[:：]/;
const 默认解析选项: Required<StoryParseOptions> = {
    validateTagCompleteness: false,
    enableTagRepair: true,
    requireActionOptionsTag: false,
    requireDynamicWorldTag: false,
    validateDialogueFormat: false,
    knownSpeakers: []
};

const 规范化已知说话人列表 = (items?: string[]): string[] => (
    Array.from(new Set((Array.isArray(items) ? items : [])
        .map(item => 规范化正文发送者名(item || ''))
        .filter(item => item && item !== '旁白')))
);

const 规范化解析选项 = (options?: StoryParseOptions): Required<StoryParseOptions> => ({
    validateTagCompleteness: options?.validateTagCompleteness === true,
    enableTagRepair: options?.enableTagRepair !== false,
    requireActionOptionsTag: options?.requireActionOptionsTag === true,
    requireDynamicWorldTag: options?.requireDynamicWorldTag === true,
    validateDialogueFormat: options?.validateDialogueFormat === true,
    knownSpeakers: 规范化已知说话人列表(options?.knownSpeakers)
});

type 协议标签 = (typeof 协议标签列表)[number];
type 可标题恢复标签 = Extract<协议标签, '剧情规划' | '变量规划' | '正文' | '短期记忆' | '命令' | '行动选项' | '动态世界'>;

const 协议标签别名映射: Record<string, 协议标签> = {
    thinking: 'thinking',
    think: 'thinking',
    thought: 'thinking',
    thoughts: 'thinking',
    cot: 'thinking',
    角色名单: '角色名单',
    rolelist: '角色名单',
    characterlist: '角色名单',
    speakers: '角色名单',
    cast: '角色名单',
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
    剧情规划: /^(?:#{1,6}\s*)?(?:【\s*)?(?:剧情规划|story\s*plan(?:ning)?|narrative\s*plan)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    变量规划: /^(?:#{1,6}\s*)?(?:【\s*)?(?:变量规划|var(?:iable)?\s*plan(?:ning)?)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    正文: /^(?:#{1,6}\s*)?(?:【\s*)?(?:正文|body|content|text|log|logs|story)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    短期记忆: /^(?:#{1,6}\s*)?(?:【\s*)?(?:短期记忆|short\s*term(?:\s*memory)?|summary|recap|memo)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    命令: /^(?:#{1,6}\s*)?(?:【\s*)?(?:命令|commands?|cmd)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    行动选项: /^(?:#{1,6}\s*)?(?:【\s*)?(?:行动选项|action\s*options?|options?|choices?)(?:\s*】)?\s*[:：]?\s*(.*)$/i,
    动态世界: /^(?:#{1,6}\s*)?(?:【\s*)?(?:动态世界|dynamic\s*world|world\s*events?)(?:\s*】)?\s*[:：]?\s*(.*)$/i
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

const 归一化酒馆元标签名 = (tagName: string): string => (
    (tagName || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]/g, '_')
);

const 是否酒馆元标签名 = (tagName: string): boolean => (
    酒馆元标签集合.has(归一化酒馆元标签名(tagName))
);

const 剥离酒馆元标签区块 = (text: string): string => {
    let stripped = (text || '').replace(/\r\n/g, '\n');
    for (const tag of 酒馆元标签列表) {
        const escapedTag = 转义正则片段(tag);
        stripped = stripped.replace(new RegExp(`<\\s*${escapedTag}\\s*>[\\s\\S]*?<\\s*/\\s*${escapedTag}\\s*>`, 'gi'), '\n');
        stripped = stripped.replace(new RegExp(`<\\s*/?\\s*${escapedTag}\\s*>`, 'gi'), '\n');
    }
    return stripped;
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
    let stripped = 剥离酒馆元标签区块(text || '');
    for (const tag of ['剧情规划', '变量规划', '短期记忆', '命令', '行动选项', '动态世界', 'judge']) {
        for (const variant of 协议标签所有写法(tag)) {
            const escapedTag = 转义正则片段(variant);
            stripped = stripped.replace(new RegExp(`<\\s*${escapedTag}\\s*>[\\s\\S]*?<\\s*/\\s*${escapedTag}\\s*>`, 'gi'), '\n');
        }
    }
    stripped = stripped
        .replace(/<\s*\/?\s*thinking\s*>/gi, '\n')
        .replace(/<\s*\/?\s*think\s*>/gi, '\n');
    const lines = stripped
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/^<[^>]+>$/.test(line))
        .filter(line => !酒馆状态行规则.test(line))
        .filter(line => !Object.values(协议标题匹配规则).some(rule => rule.test(line)));
    return lines.join('\n').trim();
};

// 变量命令泄漏检测：模型偶尔会把状态/记忆命令块直接接在正文末尾，例如
//   【环境.时间】\n"1:01:01:07:00"\n【俞月荷.好感度】\n=62\n【俞月荷.记忆】\n=push 社交[0].记忆 {...}
// 这类内容不是正文对白，必须从展示正文里剥离。正文协议只允许【人名】标签，
// 方括号内出现点号路径（环境.时间）或数组索引（社交[0]）即可判定为变量命令泄漏。
const 变量命令路径标签行规则 = /^【\s*[^】\n]*(?:[.．][^】\n]+|\[\s*\d+\s*\])[^】\n]*】\s*(?:[=＝].*)?$/u;
const 变量命令动词行规则 = /^(?:[-*•]\s*|\d+[.)、]\s*)?(?:add|set|push|delete)\s+[^\s=＝]+/i;
const 变量命令赋值行规则 = /^【\s*[^】\n]+】\s*(?:[=＝]|\bpush\b|\bset\b|\badd\b|\bdelete\b)/iu;
// markdown 列表形式的变量赋值，例如：
//   - 角色.内力: 89 -> 69
//   - 社交[0].好感度: 40 -> 45
//   - 环境.时间:
// 特征：以列表符号开头，键中带点号路径或数组索引，后跟冒号。
const 路径赋值列表行规则 = /^[-*•]\s*[^\s:：（(]*(?:[.．][^\s:：（(]+|\[\s*\d+\s*\])[^\s:：（(]*\s*[:：]/u;

const 是否变量命令泄漏行 = (line: string): boolean => (
    变量命令路径标签行规则.test(line)
    || 变量命令动词行规则.test(line)
    || 变量命令赋值行规则.test(line)
    || 路径赋值列表行规则.test(line)
);

// 检测畸形/半开的非正文协议标签行，例如模型只输出 `<变量规划` 而漏掉闭合 `>`，
// 或写成 `<变量规划>`、`<variable_plan`、`</短期记忆` 等。成对标签块删除正则无法命中这类残缺标签，
// 因此需要在逐行扫描时按“正文之外的协议标签起始”截断。
const 提取行首标签名 = (line: string): string => {
    const match = (line || '').trim().match(/^<\s*\/?\s*([A-Za-z0-9_\u3400-\u9fff]+)/);
    return match ? (match[1] || '') : '';
};
const 是否畸形非正文协议标签行 = (line: string): boolean => {
    const tagToken = 提取行首标签名(line);
    if (!tagToken) return false;
    const normalized = 归一化协议标签名(tagToken);
    return Boolean(normalized)
        && 协议标签集合.has(normalized)
        && normalized !== '正文'
        && normalized !== 'judge';
};

const 清理正文残留协议内容 = (body: string): string => {
    let stripped = 剥离酒馆元标签区块(body || '');
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
        if (isNonBodyProtocolHeader || 酒馆状态行规则.test(line) || 是否变量命令泄漏行(line) || 是否畸形非正文协议标签行(line)) break;
        lines.push(rawLine);
    }
    return 清理正文初始化泄露内容(清理正文HTML注释残片(lines.join('\n'))).trim();
};

const 清理正文HTML注释残片 = (body: string): string => {
    const source = (body || '').replace(/\r\n/g, '\n');
    if (!source.trim()) return '';
    const result: string[] = [];
    let inComment = false;

    for (const rawLine of source.split('\n')) {
        let line = rawLine;
        let guard = 0;
        while (line.length > 0 && guard < 20) {
            guard += 1;
            if (inComment) {
                const endIndex = line.indexOf('-->');
                if (endIndex < 0) {
                    line = '';
                    break;
                }
                line = line.slice(endIndex + 3);
                inComment = false;
                continue;
            }

            const htmlCommentStart = line.search(/<!--|<!\s*$/);
            if (htmlCommentStart < 0) break;
            const before = line.slice(0, htmlCommentStart);
            const afterStart = line.slice(htmlCommentStart);
            const endIndex = afterStart.indexOf('-->');
            if (endIndex < 0) {
                line = before;
                inComment = true;
                break;
            }
            line = `${before}${afterStart.slice(endIndex + 3)}`;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^--(?:\s|>|$)/.test(trimmed)) {
            inComment = !trimmed.includes('-->');
            continue;
        }
        result.push(line);
    }

    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
        if (是否裸标准游戏时间行(line)) {
            removedCount += 1;
            continue;
        }
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

// 除 <正文> 外的协议区块标签，用于定位「裸正文」与结构化区块的分界点。
const 正文之后协议区块标签: 可标题恢复标签[] = ['剧情规划', '变量规划', '短期记忆', '命令', '行动选项', '动态世界'];

// 取某规范协议标签的全部写法（规范名 + 所有别名），供「裸正文包裹」与「候选正文提取」
// 识别模型可能使用的缩写/英文别名（如 <选项> / <options> / <choice> 等）。
const 协议标签所有写法 = (canonical: string): string[] => {
    const aliases = Object.keys(协议标签别名映射).filter(k => 协议标签别名映射[k] === canonical);
    return Array.from(new Set([canonical, ...aliases]));
};

const 定位首个协议区块位置 = (text: string): number => {
    let position = -1;
    for (const tag of 正文之后协议区块标签) {
        for (const variant of 协议标签所有写法(tag)) {
            const escapedTag = 转义正则片段(variant);
            const matched = (text || '').match(new RegExp(`<\\s*${escapedTag}\\s*>`, 'i'));
            if (matched && typeof matched.index === 'number' && (position < 0 || matched.index < position)) {
                position = matched.index;
            }
        }
    }
    return position;
};

// [修复] 模型省略 <正文> 标签、直接输出裸正文时，旧实现把补全的 <正文> 追加到文本末尾。
// 由于 提取首尾思考区段 会把「最后一个 <正文> 之前的全部内容」判定为思考区，
// 追加在末尾会导致前面的 <短期记忆>/<行动选项>/<命令> 等区块被整体吞进思考区，
// 进而误报「缺少 <行动选项> 标签」。此处改为在首个协议区块之前就地包裹裸正文。
const 就地包裹裸正文 = (content: string, 正文候选: string): string => {
    const text = content || '';
    if (/<\s*正文\s*>/i.test(text)) return text;

    const 首个协议位置 = 定位首个协议区块位置(text);
    if (首个协议位置 < 0) return text;

    const head = text.slice(0, 首个协议位置);
    const tail = text.slice(首个协议位置);
    const thinkingCloseMatches = [...head.matchAll(/<\s*\/\s*(?:thinking|think)\s*>/gi)];
    const lastThinkingClose = thinkingCloseMatches.length > 0
        ? thinkingCloseMatches[thinkingCloseMatches.length - 1]
        : null;
    const splitAt = lastThinkingClose && typeof lastThinkingClose.index === 'number'
        ? lastThinkingClose.index + (lastThinkingClose[0] || '').length
        : 0;
    const 思考前缀 = head.slice(0, splitAt);
    const 裸正文 = 提取候选正文文本(head.slice(splitAt)) || (正文候选 || '').trim();
    const 前缀片段 = 思考前缀.trimEnd();

    return `${前缀片段}${前缀片段 ? '\n' : ''}<正文>${裸正文}</正文>\n${tail}`;
};

const 补全协议缺失区块 = (content: string): string => {
    let text = content || '';
    const sections = 提取标题区块内容(text);
    const 正文候选 = sections.正文 || 提取候选正文文本(text);
    const 短期候选 = sections.短期记忆 || '';
    const 命令候选 = sections.命令 || 提取候选命令文本(text);

    text = 就地包裹裸正文(text, 正文候选);
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

/**
 * 将 GLM HTML 注释思维链 <!-- ... --> 转换为标准 <thinking>...</thinking> 格式，
 * 使后续解析流程无需感知 GLM 特殊格式。
 * 仅在文本开头或助手前缀后紧接 <!-- 时触发转换，避免误转正文中的合法 HTML 注释。
 */
const 转换HTML注释思维链 = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    // 匹配助手前缀后面的 <!-- ... --> 思维链块
    // GLM 会用 <!-- --> 包裹思考内容，可能出现在文本开头或 assistant prefix 之后
    const htmlCommentThinkingRegex = /^(?:<!--\s*)([\s\S]*?)(?:\s*-->\s*\n*)/;
    const match = text.match(htmlCommentThinkingRegex);
    if (match) {
        const thinkingContent = match[1] || '';
        const rest = text.slice(match[0].length);
        return `<thinking>\n${thinkingContent.trim()}\n</thinking>\n${rest}`;
    }
    return text;
};

/**
 * 清理 GLM 模型特有的 <math>...</math> 标签（数学公式残留），
 * 避免 LaTeX 公式污染正文或干扰标签协议解析。
 */
const 清理GLMMath标签 = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/<math[\s>][\s\S]*?<\/math>/gi, '')
        .replace(/<math[\s>][\s\S]*?(?=<正文>|<短期记忆>|<命令>|<行动选项>|$)/gi, '')
        .replace(/<\/math>/gi, '');
};

export const 提取首尾思考区段 = (text: string): { thinking: string; textWithoutThinking: string; matched: boolean } => {
    let source = typeof text === 'string' ? text : '';
    if (!source) return { thinking: '', textWithoutThinking: '', matched: false };

    // [修复] 兼容 SillyTavern 风格 subtext 思维链注释块（<!-- begin_of_Subtext_think --> ... -->）。
    // 模型有时用它代替/包裹标准 <thinking> 标签；未闭合时截到下一个协议标签为止（边界覆盖全部协议标签，
    // 避免吞掉后续 <短期记忆>/<命令> 等状态块），防止思维链内容（含引号对白）残留进正文触发格式误报。
    const subtext思考片段: string[] = [];
    const 协议标签边界分支 = ['think', ...协议标签列表].join('|');
    source = source.replace(
        new RegExp(`<!--\\s*begin_of_Subtext_think\\s*-->([\\s\\S]*?)(?:<!--\\s*end_of_Subtext_think\\s*-->|(?=<\\s*\\/?\\s*(?:${协议标签边界分支})(?:\\s|>))|$)`, 'gi'),
        (_whole, inner: string) => {
            if ((inner || '').trim()) subtext思考片段.push(inner.trim());
            return '';
        }
    );
    const subtextThinking = subtext思考片段.join('\n').trim();

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
        return {
            thinking: [subtextThinking, thinking].filter(Boolean).join('\n').trim(),
            textWithoutThinking,
            matched: true
        };
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
        return {
            thinking: [subtextThinking, thinking].filter(Boolean).join('\n').trim(),
            textWithoutThinking,
            matched: true
        };
    }

    if (!/<\s*(thinking|think)\s*>/i.test(source)) {
        return {
            thinking: subtextThinking,
            textWithoutThinking: source,
            matched: subtextThinking.length > 0
        };
    }

    return {
        thinking: [subtextThinking, source.replace(/<\s*\/?\s*(thinking|think)\s*>/gi, '').trim()].filter(Boolean).join('\n').trim(),
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
    const openStack: string[] = [];
    const tagRegex = /<\s*(\/?)\s*([A-Za-z0-9_\-\u3400-\u9fff]+)\s*>/g;
    let match: RegExpExecArray | null = null;
    while ((match = tagRegex.exec(textForValidation)) !== null) {
        const isClosing = (match[1] || '') === '/';
        const tag = 归一化协议标签名(match[2] || '');
        if (!tag || !协议标签集合.has(tag)) continue;
        if (!isClosing) {
            openStack.push(tag);
            continue;
        }
        const lastIndex = openStack.lastIndexOf(tag);
        if (lastIndex >= 0) {
            openStack.splice(lastIndex);
        }
    }
    const tail = textForValidation.trimEnd();
    if (openStack.length > 0 && tail.length > 0) {
        const lastOpenTag = openStack[openStack.length - 1];
        const tailSnippet = tail.slice(Math.max(0, tail.length - 80)).replace(/\s+/g, ' ').trim();
        issues.push(`疑似输出在 <${lastOpenTag}> 内被截断或未完成闭合；请提高最大输出Token，或让模型优先闭合标签。末尾片段：${tailSnippet}`);
    }
    return issues;
};

const 构建标签协议错误详情 = (issues: string[]): string => {
    const normalized = issues
        .map(item => String(item || '').trim())
        .filter(Boolean);
    if (normalized.length <= 0) {
        return '返回内容不符合标签协议（未匹配到完整标签结构）';
    }
    return `返回内容不符合标签协议：\n- ${normalized.join('\n- ')}`;
};

const 分析标签协议缺失问题 = (text: string, options: Required<StoryParseOptions>): string[] => {
    const normalizedText = 归一化标签括号符号(text || '');
    const issues: string[] = [];
    const requiredTags = new Set<string>(协议固定必填标签);
    if (options.requireActionOptionsTag) requiredTags.add('行动选项');
    if (options.requireDynamicWorldTag) requiredTags.add('动态世界');

    for (const tag of requiredTags) {
        const openRegex = new RegExp(`<\\s*${转义正则片段(tag)}\\s*>`, 'i');
        const closeRegex = new RegExp(`<\\s*/\\s*${转义正则片段(tag)}\\s*>`, 'i');
        const hasOpen = openRegex.test(normalizedText);
        const hasClose = closeRegex.test(normalizedText);
        if (!hasOpen && !hasClose) {
            issues.push(`缺少 <${tag}>...</${tag}> 标签`);
            continue;
        }
        if (!hasOpen) issues.push(`缺少 <${tag}> 起始标签`);
        if (!hasClose) issues.push(`缺少 </${tag}> 结束标签`);
    }

    if (!/<\s*正文\s*>/i.test(normalizedText) && /^(?:【[^】]+】|[^\n]{0,20}[：:]).+/m.test(normalizedText)) {
        issues.push('检测到疑似正文内容，但没有用 <正文>...</正文> 包裹');
    }

    // 标签修复会为缺失的正文补上空壳 <正文></正文>，此时上面的「缺少标签」分支不会命中，
    // 需要单独提示正文为空，避免只剩下无意义的 JSON 解析错误。
    const 正文区块匹配 = normalizedText.match(/<\s*正文\s*>([\s\S]*?)<\s*\/\s*正文\s*>/i);
    if (正文区块匹配 && !(正文区块匹配[1] || '').trim()) {
        issues.push('<正文>...</正文> 内容为空');
    }

    if (/(?:标签协议|输出格式|请按标签|完整闭合|只输出标签)/.test(normalizedText) && !/<\s*正文\s*>/i.test(normalizedText)) {
        issues.push('输出里混入了协议说明文字，没有直接给出正式正文');
    }

    const openTags = Array.from(normalizedText.matchAll(/<\s*([^/\s>]+)\s*>/g))
        .map(match => 归一化协议标签名(match[1]))
        .filter((tag): tag is 协议标签 => Boolean(tag) && tag !== 'judge');
    const bodyIndex = openTags.indexOf('正文');
    const shortTermIndex = openTags.indexOf('短期记忆');
    if (bodyIndex >= 0 && shortTermIndex >= 0 && shortTermIndex < bodyIndex) {
        issues.push('顶层标签顺序错误：<短期记忆> 出现在 <正文> 之前');
    }

    return Array.from(new Set(issues));
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
                stack.pop();
                if (tagName === '正文') {
                    const unmatchedOpenIndex = rebuilt.lastIndexOf('<judge>');
                    if (unmatchedOpenIndex >= 0) {
                        rebuilt = `${rebuilt.slice(0, unmatchedOpenIndex)}${rebuilt.slice(unmatchedOpenIndex + '<judge>'.length)}`;
                    }
                } else {
                    rebuilt += '</judge>';
                }
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

const 合并重复正文标签 = (content: string): string => {
    const source = content || '';
    const bodyRegex = /<\s*正文\s*>\s*([\s\S]*?)\s*<\s*\/\s*正文\s*>/gi;
    const matches = Array.from(source.matchAll(bodyRegex));
    if (matches.length <= 1) return source;

    const payload = matches
        .map((match) => (match[1] || '').trim())
        .filter(Boolean)
        .join('\n');
    const first = matches[0];
    const firstIndex = first.index ?? 0;
    const last = matches[matches.length - 1];
    const lastIndex = (last.index ?? firstIndex) + last[0].length;
    const between = source.slice(firstIndex, lastIndex)
        .replace(bodyRegex, '')
        .trim();
    if (between) return source;

    return `${source.slice(0, firstIndex)}<正文>\n${payload}\n</正文>${source.slice(lastIndex)}`;
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

const 正文冒号元数据键排除集合 = new Set([
    'time', 'scene', 'location', 'place', 'weather', 'date', 'day', 'status', 'state',
    'setting', 'progress', 'event', 'summary', 'memo', 'memory', 'note', 'notes',
    'task', 'objective', 'goal', 'title', 'chapter', 'act', 'episode'
]);

const 识别无括号正文发送者行 = (line: string, declaredNames?: Set<string>): { sender: string; text: string } | null => {
    const match = (line || '').trim().match(/^([A-Za-z][A-Za-z0-9_· -]{1,23}|[\u4e00-\u9fff]{2,4})(?:[（(][^）)\n]{1,16}[）)])?\s*[:：]\s*(.+)$/u);
    if (!match) return null;
    const sender = 规范化日志发送者(match[1] || '');
    if (!sender) return null;
    if (正文冒号说话人排除集合.has(sender)) return null;
    const lowerSender = sender.toLowerCase();
    const isAsciiSender = /^[a-z][a-z0-9_· -]{1,23}$/i.test(sender);
    if (正文冒号元数据键排除集合.has(lowerSender)) return null;
    if (isAsciiSender && !declaredNames?.has(sender)) return null;
    if (!是否可信正文标签发送者(sender, { allowUnknownName: true, declaredNames })) return null;
    return {
        sender,
        text: (match[2] || '').trim()
    };
};

const 解析无括号正文发送者行 = (_line: string): { sender: string; text: string } | null => {
    // 正式正文协议只允许【角色名】标记对白；冒号格式仅用于检测并交给局部修复器。
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

    const extraction = 提取并清理Judge区块(source);
    const judgeBlocks: NonNullable<GameResponse['judge_blocks']> = extraction.blocks.map((normalized, index) => ({
        raw: normalized,
        text: normalized,
        attachedTo: `judge_${index + 1}`,
        isNsfw: /NSFW判定/i.test(normalized)
    }));

    return {
        cleanBody: 清理正文Judge残片(extraction.cleanText),
        judgeBlocks: judgeBlocks.length > 0 ? judgeBlocks : undefined
    };
};

const 解析角色名单标签 = (tagContent: string): Set<string> => {
    const text = (tagContent || '').trim();
    if (!text) return new Set();
    const names = new Set<string>();
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        for (const rawName of line.split(/[,，、\s]+/)) {
            const name = rawName.trim();
            if (name && /^[\u4e00-\u9fa5]{2,6}$/u.test(name)) {
                names.add(name);
            }
        }
    }
    return names;
};

const 提取残缺角色名单标签 = (text: string): string => {
    if (!text) return '';
    const match = text.match(/<角色名单>\s*([\s\S]*?)(?:<\/(?:角色名单|正文|短期记忆|thinking|命令|动态世界|变量规划|剧情规划|行动选项|judge)\s*>|<(?:角色名单|正文|短期记忆|thinking|命令|动态世界|变量规划|剧情规划|行动选项|judge)\s*>|$)/i);
    return match?.[1]?.trim() || '';
};

const 是否完整闭合的角色对白 = (value: string): boolean => {
    const source = (value || '').trim();
    if (!source) return false;
    const openerIndex = source.search(/[“"「『]/u);
    if (openerIndex < 0) return false;
    const prefix = source.slice(0, openerIndex).trim();
    if (prefix && !/^(?:（[^）]{0,120}）|\([^)]{0,120}\)|\*[^*]{0,120}\*)$/u.test(prefix)) return false;
    const opener = source[openerIndex];
    const closer = opener === '“' ? '”'
        : opener === '「' ? '」'
            : opener === '『' ? '』'
                : '"';
    const closingIndex = source.indexOf(closer, openerIndex + 1);
    return closingIndex === source.length - 1;
};

// 说话人标签只会出现在句子边界之后。若「】」与下一个「【」之间的文本不是以句末标点收尾，
// 说明后面那个「【…】」是正文内部的物品名或强调标记（例如「【角色】“查看【青霜剑】。”」），
// 此时拆行会把同一句对白割裂，必须跳过。between 为空（两个标签紧挨）时视为可拆。
const 标签前句末收尾正则 = /(?:^|[。！？!?…；;：:”’"'』」）)])$/;

const 预处理未换行标签正文 = (body: string): string => {
    const normalized = body.replace(/\r\n/g, '\n');
    // 只在「同一行内存在『】…【』边界」时才需要处理。不能用整段换行总数判断：
    // 正文别处的换行足够多时，仍可能有某一行把多个标签挤在一起。
    if (!/】[^\n【】]*【/.test(normalized)) return normalized;
    // 换行插在下一个【之前（而非】之后），否则单独的【标签】会被下游当成空行丢弃，
    // 而夹在正文里的【标签】又不会被识别为独立说话人。
    // 用先行断言不消费下一个标签，保证一行里连续多个标签能被逐个拆开。
    return normalized.replace(/】([^\n【】]*)(?=【)/g, (matched, between: string) => (
        标签前句末收尾正则.test(between.trimEnd()) ? `】${between}\n` : matched
    ));
};

const 解析正文日志 = (body: string, declaredNames?: Set<string>): Array<{ sender: string; text: string }> => {
    if (!body || !body.trim()) return [];
    const lines = 预处理未换行标签正文(body).split('\n');
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
            if (!是否可信正文标签发送者(sender, { declaredNames })) {
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

        // 角色对白已经闭合后，后续没有标签的行属于叙事，而不是继续挂在角色气泡里。
        // 这兼容酒馆预设偶尔省略【旁白】标签的输出，同时避免同一角色的下一句对白
        // 与中间叙事合并后只渲染出第一句气泡。
        if (current && current.sender !== '旁白' && 是否完整闭合的角色对白(current.text)) {
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
const 显式标签行正则 = /^【\s*([^】]+?)\s*】\s*(.*)$/;
const 方括号疑似说话人行正则 = /^\[\s*([A-Za-z0-9_\u4e00-\u9fff·]{1,16})\s*\]\s*(.{1,800})$/u;
const 显式说话引号正则 = /([A-Za-z0-9_\u4e00-\u9fff·]{1,14})[^。！？!?；;\n]{0,40}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:，,]?\s*[“"「『][^”"」』\n]{1,500}[”"」』]/u;
const 裸引号整行正则 = /^[“"「『][^”"」』\n]{1,500}[”"」』][。！？!?…~～]*$/u;
const 孤立标点行正则 = /^[。！？!?；;，,.、…]+$/u;
const 指节泛白套话正则 = /(?:指节|指关节|指尖|手指|拳头)[^。！？!?；;\n]{0,32}(?:发白|泛白|泛起白|泛起苍白|泛起青白|苍白|惨白|青白|失血色|没有血色)|(?:发白|泛白|苍白|惨白|青白|失血色|没有血色)[^。！？!?；;\n]{0,16}(?:指节|指关节|指尖|手指|拳头)/u;
const 正文引号闭合表: Record<string, string> = {
    '“': '”',
    '「': '」',
    '『': '』',
    '‘': '’',
    '"': '"'
};

const 提取无标签动作行人物名 = (line: string, declaredNames?: Set<string>): string => {
    const text = (line || '').trim();
    for (let length = 4; length >= 2; length -= 1) {
        const name = text.slice(0, length);
        const rest = text.slice(length);
        if (!/^[\u4e00-\u9fff]{2,4}$/.test(name)) continue;
        if (无标签非人名短语正则.test(name) || 是否疑似叙事说话人提取候选(name, { declaredNames })) continue;
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

const 提取显式说话引号人物名 = (line: string, declaredNames?: Set<string>): string => {
    const source = (line || '').trim();
    const quoteIndex = source.search(/[“"「『]/);
    const prefix = quoteIndex >= 0 ? source.slice(0, quoteIndex) : source;
    const recent = (prefix.split(/[。！？!?；;\n]/).pop() || prefix).trim();
    const actionNameRegex = /([\u4e00-\u9fff]{2,4})(?=[^，,。！？!?；;\n]{0,36}(?:正(?:在)?|已|也|还|仍|负手|收剑|抬|回|点|看|盯|望|站|坐|走|停|俯|侧|拱|抱|伸|皱|沉|笑|低|上前|退|转|放|握|按|举|落|扬|垂|敛|挑|拔|收|推|扶|拂|掠|倚|跪|躬|作|朝|向|对|把|将|眼神|声音|语气|声)[^。！？!?；;\n]{0,48}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:，,]?\s*$)/gu;
    let actionMatch: RegExpExecArray | null = null;
    let actionSpeaker = '';
    while ((actionMatch = actionNameRegex.exec(recent)) !== null) {
        actionSpeaker = actionMatch[1] || actionSpeaker;
    }
    if (actionSpeaker) {
        const sender = 规范化日志发送者(actionSpeaker.replace(/[负收抬回点看盯望站坐走停俯侧拱抱伸皱沉笑低转放握按举落扬垂敛挑拔推扶拂掠倚跪躬作朝向对把将声]$/u, ''));
        if (是否疑似叙事说话人提取候选(sender, { declaredNames })) return '';
        if (是否可信正文标签发送者(sender, { allowUnknownName: true, declaredNames })) return sender;
    }

    const match = source.match(显式说话引号正则);
    if (!match) return '';
    const rawSpeaker = (match[1] || '')
        .split(/[，,、\s]/)
        .filter(Boolean)
        .pop() || '';
    const sender = 规范化日志发送者(rawSpeaker);
    if (是否疑似叙事说话人提取候选(sender, { declaredNames })) return '';
    if (!是否可信正文标签发送者(sender, { allowUnknownName: true, declaredNames })) return '';
    return sender;
};

const 检测正文引号内换行问题 = (body: string): string | null => {
    const lines = (body || '').replace(/\r\n/g, '\n').split('\n');
    const stack: Array<{ close: string; lineNumber: number; lineText: string }> = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const rawLine = lines[lineIndex] || '';
        const lineNumber = lineIndex + 1;
        if (stack.length > 0 && rawLine.trim()) {
            const opener = stack[stack.length - 1];
            return `正文第${opener.lineNumber}行的引号内容跨行到了第${lineNumber}行；引号内文字必须保持在同一正文行内`;
        }
        for (let charIndex = 0; charIndex < rawLine.length; charIndex += 1) {
            const char = rawLine[charIndex];
            const expectedClose = stack[stack.length - 1]?.close;
            if (expectedClose && char === expectedClose) {
                stack.pop();
                continue;
            }
            if (char === '"' && rawLine[charIndex - 1] === '\\') continue;
            const close = 正文引号闭合表[char];
            if (!close) continue;
            if (char === '"' && expectedClose === '"') {
                stack.pop();
            } else {
                stack.push({ close, lineNumber, lineText: rawLine.trim() });
            }
        }
        if (stack.length > 0 && lineIndex < lines.length - 1) {
            const nextNonEmptyIndex = lines.findIndex((item, index) => index > lineIndex && item.trim().length > 0);
            if (nextNonEmptyIndex >= 0) {
                const opener = stack[stack.length - 1];
                return `正文第${opener.lineNumber}行的引号内容跨行到了第${nextNonEmptyIndex + 1}行；引号内文字必须保持在同一正文行内`;
            }
        }
    }
    return null;
};

const 提取首段正文引号对白余文 = (text: string): string => {
    const source = (text || '').trim();
    if (!/^[“"「『]/.test(source)) return '';
    const opener = source[0];
    const closer = 正文引号闭合表[opener] || '';
    if (!closer) return '';
    const closingIndex = source.indexOf(closer, 1);
    if (closingIndex <= 0) return '';
    return source.slice(closingIndex + 1).trim();
};

const 检测正文对白格式问题 = (body: string, declaredNames?: Set<string>): string | null => {
    const quoteIssue = 检测正文引号内换行问题(body);
    if (quoteIssue) return quoteIssue;

    const lines = (body || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !是否判定日志文本(line));
    if (lines.length < 1) return null;

    const 协议标签开头正则 = /^【\s*(旁白|[^】]+?)\s*】\s*$/;
    const 裸文正文行正则 = /^(?!【\s*[^】]+?\s*】)(?!\[\s*[^\]]+\s*\])(?!<[^>]+>)(?![“"「『]).\S+/;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const tagMatch = line.match(显式标签行正则);
        if (tagMatch) {
            const sender = 规范化日志发送者(tagMatch[1] || '');
            const text = (tagMatch[2] || '').trim();
            if (孤立标点行正则.test(text)) {
                return `正文第${index + 1}行只有孤立标点「${text}」，必须局部重写相邻正文，不能让标点单独成行`;
            }
            const stalePhrase = text.match(指节泛白套话正则)?.[0]?.trim();
            if (stalePhrase) {
                return `正文第${index + 1}行包含高频套话「${stalePhrase}」，必须局部重写该句，避免“指节/指关节/手指/拳头泛白”类描写`;
            }
            if (sender === '旁白') {
                const quotedSpeaker = 提取显式说话引号人物名(text, declaredNames);
                if (quotedSpeaker) return `疑似角色「${quotedSpeaker}」的对白写在【旁白】行内`;
            } else {
                const trailingNarration = 提取首段正文引号对白余文(text);
                if (trailingNarration) {
                    return `正文第${index + 1}行的【${sender}】对白闭合后又接了旁白「${trailingNarration.slice(0, 40)}」；必须拆成【${sender}】对白行和【旁白】叙事行`;
                }
            }
            if (!text && 协议标签开头正则.test(line)) {
                const nextLine = lines[index + 1] || '';
                if (sender !== '旁白' && nextLine && /^[“"「『]/.test(nextLine)) {
                    return `正文第${index + 1}行只有空的【${sender}】标签，后续引号对白没有和角色标签写在同一行；必须改为【${sender}】对白行，若对白后有叙事则另起【旁白】行`;
                }
                if (nextLine && 裸文正文行正则.test(nextLine)) {
                    return `正文第${index + 1}行只有空的【${sender}】标签，后续裸文未带正文协议标签；每个非空正文行必须以【旁白】、【角色名】或【判定】开头`;
                }
                if (nextLine && 裸引号整行正则.test(nextLine)) {
                    return `正文第${index + 1}行只有空的【${sender}】标签，后续裸引号对白没有使用【角色名】标签`;
                }
            }
            continue;
        }

        if (孤立标点行正则.test(line)) {
            return `正文第${index + 1}行只有孤立标点「${line}」，必须局部重写相邻正文，不能让标点单独成行`;
        }
        const stalePhrase = line.match(指节泛白套话正则)?.[0]?.trim();
        if (stalePhrase) {
            return `正文第${index + 1}行包含高频套话「${stalePhrase}」，必须局部重写该句，避免“指节/指关节/手指/拳头泛白”类描写`;
        }
        const squareSpeaker = line.match(方括号疑似说话人行正则);
        if (squareSpeaker) {
            const sender = 规范化日志发送者(squareSpeaker[1] || '');
            if (是否可信正文标签发送者(sender, { allowUnknownName: true }) && !正文冒号说话人排除集合.has(sender)) {
                return `疑似角色「${sender}」的对白使用了[]标签，必须改为【${sender}】`;
            }
        }

        const colonLine = 识别无括号正文发送者行(line, declaredNames);
        if (colonLine) {
            return `疑似角色「${colonLine.sender}」的对白使用了冒号格式，必须改为【${colonLine.sender}】开头`;
        }

        const quotedSpeaker = 提取显式说话引号人物名(line, declaredNames);
        if (quotedSpeaker) {
            return `疑似角色「${quotedSpeaker}」的对白嵌在旁白引号中，没有使用【角色名】标签`;
        }

        const actionSpeaker = 提取无标签动作行人物名(line, declaredNames);
        const nextLine = lines[index + 1] || '';
        if (actionSpeaker && (是否像无标签口语行(nextLine) || 裸引号整行正则.test(nextLine))) {
            return `疑似角色「${actionSpeaker}」的对白没有使用【角色名】标签`;
        }
    }
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
    const text = 剥离强调标记(预处理命令文本((rawValue || '').trim()).trim());
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

type 标准命令结构 = { action: 'add' | 'set' | 'push' | 'delete' | 'sub'; key: string; value: any };

const 标准化命令对象列表 = (raw: any): 标准命令结构[] => {
    if (!raw || typeof raw !== 'object') return [];
    const 合法动作集合 = new Set(['add', 'set', 'push', 'delete', 'sub']);

    const 归一化动作 = (actionRaw: string): 'add' | 'set' | 'push' | 'delete' | 'sub' => (
        actionRaw as 'add' | 'set' | 'push' | 'delete' | 'sub'
    );

    const 构建命令 = (actionRaw: string, keyRaw: any, valueRaw: any): 标准命令结构 | null => {
        const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
        if (!key) return null;
        const normalizedAction = 归一化动作(actionRaw);
        const normalizedValue = valueRaw === undefined ? null : valueRaw;
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

export const 解析命令块 = (commandBlock: string): Array<{ action: 'add' | 'set' | 'push' | 'delete' | 'sub'; key: string; value: any }> => {
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
    const commands: Array<{ action: 'add' | 'set' | 'push' | 'delete' | 'sub'; key: string; value: any }> = [];
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
        const action = actionRaw as 'add' | 'set' | 'push' | 'delete' | 'sub';
        const key = (match[2] || '').trim();
        if (!key) continue;
        const multiLineValue = actionRaw === 'delete'
            ? { valueText: '', consumedUntil: i }
            : 收集多行命令值(lines, i, (match[3] || '').trim());
        i = multiLineValue.consumedUntil;
        let value = actionRaw === 'delete' ? null : 解析命令值(清理命令尾部分隔符(multiLineValue.valueText));
        commands.push({ action, key, value });
    }

    return commands;
};

const 解析行动选项块 = (optionsBlock: string): string[] => {
    const text = (optionsBlock || '').trim();
    if (!text) return [];
    const 协议标签行正则 = /^<\s*\/?\s*(?:thinking|think|正文|短期记忆|变量规划|剧情规划|行动选项|命令|动态世界|judge)\s*[\]>]\s*$/i;
    const 单行标签正则 = /^<\s*\/?\s*([A-Za-z0-9_-]+)\s*[\]>]\s*$/i;
    const isIzumiStateLine = (line: string): boolean => {
        const tagMatch = line.match(单行标签正则);
        if (tagMatch && 是否酒馆元标签名(tagMatch[1] || '')) return true;
        if (酒馆状态行规则.test(line)) return true;
        if (/^PG\.\d+(?:\.\d+)?$/i.test(line)) return true;
        return false;
    };
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line
            .replace(/^[-*]\s*/, '')
            .replace(/^\d+\.\s*/, '')
            .replace(/^>\s*(?:选项|option|choice)\s*(?:[一二三四五六七八九十\d]+)?\s*[:：]\s*/i, '')
            .trim())
        .filter(line => !协议标签行正则.test(line))
        .filter(line => !isIzumiStateLine(line))
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

const 解析标签协议响应 = (content: string, options?: Required<StoryParseOptions>, declaredNames?: Set<string>): GameResponse | null => {
    const text = (content || '').trim();
    if (!text) return null;

    const thinkingSegment = 提取首尾思考区段(text);
    const textWithoutThinking = thinkingSegment.textWithoutThinking;
    const titleSections = 提取标题区块内容(textWithoutThinking);
    const thinkingParts = 提取标签内容列表(text, 'thinking', { 兼容错误闭合: true });
    const bodyBlocks = 提取标签内容列表(textWithoutThinking, '正文');
    const bodyBlock = bodyBlocks.length > 0 ? bodyBlocks.join('\n') : (titleSections.正文 || '');
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
        ? 检测正文对白格式问题(bodyJudgeExtraction.cleanBody, declaredNames)
        : null;
    const leakedCanonicalGameTimeLine = options?.validateDialogueFormat
        ? 检测裸标准游戏时间行(bodyBlock || '')
        : null;
    if (leakedCanonicalGameTimeLine) {
        throw new StoryResponseParseError(
            `正文混入标准时间真值行「${leakedCanonicalGameTimeLine}」，必须改写成自然叙事时间表达。请局部修复本回合正文：不要直接暴露 1:01:01:06:30 这类后台标准时间字符串。`,
            content,
            `正文混入标准时间真值行「${leakedCanonicalGameTimeLine}」`,
            [`正文混入标准时间真值行「${leakedCanonicalGameTimeLine}」`]
        );
    }
    if (dialogueFormatIssue) {
        throw new StoryResponseParseError(
            `${dialogueFormatIssue}。请局部修复本回合正文：角色对白必须单独使用【角色名】开头，旁白只写动作、环境与心理；正文行不能只剩孤立标点，也不能保留被指出的高频套话。`,
            content,
            dialogueFormatIssue
        );
    }

    let logs = 规范化对白日志(解析正文日志(bodyJudgeExtraction.cleanBody, declaredNames));
    if (logs.length === 0) {
        const fallbackBody = titleSections.正文 || 提取候选正文文本(textWithoutThinking);
        const stripped = 提取正文中的Judge区块(清理正文初始化泄露内容(fallbackBody)).cleanBody
            .replace(/<[^>]+>/g, '\n');
        if (/【[^】]+】/.test(stripped)) {
            logs = 规范化对白日志(解析正文日志(stripped, declaredNames));
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

    if (options?.requireActionOptionsTag && actionOptions.length === 0) {
        const detail = '缺少 <行动选项>...</行动选项> 标签或标签内容为空';
        throw new StoryResponseParseError(
            构建标签协议错误详情([detail]),
            content,
            detail,
            [detail]
        );
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
        return 修复标签协议文本(合并重复正文标签(source));
    }

    const tail = thinkingSegment.textWithoutThinking;
    if (!tail) {
        return source;
    }

    const prefixLength = Math.max(0, source.length - tail.length);
    const prefix = source.slice(0, prefixLength);
    const repairedTail = 修复标签协议文本(合并重复正文标签(tail));
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
    // 预处理：将 GLM HTML 注释思维链转换为标准 <thinking> 格式
    const preprocessedText = 合并重复正文标签(转换HTML注释思维链(清理GLMMath标签(rawText)));
    const declaredNames = 解析角色名单标签(
        提取首个标签内容(preprocessedText, '角色名单', { 兼容错误闭合: true })
        || 提取首个标签内容(preprocessedText, 'rolelist')
        || 提取首个标签内容(preprocessedText, 'speakers')
        || 提取首个标签内容(preprocessedText, 'cast')
        || 提取残缺角色名单标签(preprocessedText)
        || '');
    parseOptions.knownSpeakers.forEach(name => declaredNames.add(name));
    const normalizedText = parseOptions.enableTagRepair
        ? 修复思考区后半段标签协议文本(preprocessedText)
        : preprocessedText;

    if (parseOptions.validateTagCompleteness) {
        const issues = 检测标签完整性问题(normalizedText, parseOptions);
        if (issues.length > 0) {
            const normalizedIssues = issues.map(item => `标签完整性校验失败：${item}`);
            const detail = 构建标签协议错误详情(normalizedIssues);
            throw new StoryResponseParseError(detail, rawText, detail, normalizedIssues);
        }
    }

    const tagged = 解析标签协议响应(normalizedText, parseOptions, declaredNames);
    const declaredSpeakerList = declaredNames.size > 0 ? [...declaredNames] : undefined;

    if (tagged && tagged.logs.some(log => typeof log?.text === 'string' && log.text.trim().length > 0)) {
        if (declaredSpeakerList) tagged.declaredSpeakers = declaredSpeakerList;
        return tagged;
    }

    const parsed = parseJsonWithRepair<any>(normalizedText);
    if (parsed.value && typeof parsed.value === 'object') {
        const normalized = 归一化JSON结构响应(parsed.value);
        const hasRenderableLogs = normalized.logs.some((log) => (
            typeof log?.text === 'string' && log.text.trim().length > 0
        ));
        if (hasRenderableLogs) {
            if (declaredSpeakerList) normalized.declaredSpeakers = declaredSpeakerList;
            return normalized;
        }
        const hasThinking = Object.keys(normalized).some((key) => {
            const isThinkingField = key.startsWith('t_') || key === 'thinking_pre' || key === 'thinking_post';
            return isThinkingField && typeof (normalized as any)[key] === 'string' && (normalized as any)[key].trim().length > 0;
        });
        const detail = hasThinking
            ? '缺少 <正文> 有效内容（疑似响应截断）'
            : '返回内容结构不完整（缺少 <正文> 或 logs）';
        throw new StoryResponseParseError(detail, rawText, detail, [detail]);
    }
    const parsedError = typeof parsed.error === 'string' ? parsed.error.trim() : '';
    const normalizedParsedError = /json\s*解析失败/i.test(parsedError) ? '' : parsedError;
    const protocolIssues = 分析标签协议缺失问题(normalizedText, parseOptions);
    if (normalizedParsedError) {
        protocolIssues.push(normalizedParsedError);
    }
    const detail = 构建标签协议错误详情(protocolIssues);
    throw new StoryResponseParseError(detail, rawText, detail, protocolIssues);
};
