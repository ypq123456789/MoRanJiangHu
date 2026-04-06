import { 内置画师标签词库 } from './artistTagDictionary';

export type 画师命中来源类型 = 'rule' | 'dictionary';

export type 画师命中项结构 = {
    token: string;
    normalized: string;
    source: 画师命中来源类型;
};

export type 画师拆分结果 = {
    画师串: string;
    剩余正面提示词: string;
    画师命中项: string[];
    画师Tokens: string[];
    剩余Tokens: string[];
    命中详情: 画师命中项结构[];
};

const 词库集合 = new Set(内置画师标签词库.map((item) => item.trim().toLowerCase()).filter(Boolean));

const 清理包裹符号 = (text: string): string => {
    let current = (text || '').trim();
    let changed = true;
    while (changed && current.length > 1) {
        changed = false;
        const wrappers: Array<[string, string]> = [
            ['(', ')'],
            ['[', ']'],
            ['{', '}'],
            ['<', '>']
        ];
        for (const [left, right] of wrappers) {
            if (current.startsWith(left) && current.endsWith(right)) {
                current = current.slice(1, -1).trim();
                changed = true;
            }
        }
    }
    return current;
};

const 去除权重包裹 = (text: string): string => {
    let current = (text || '').trim();
    let changed = true;
    while (changed) {
        changed = false;
        const weighted = current.match(/^\s*\d+(?:\.\d+)?::([\s\S]*)::\s*$/);
        if (weighted?.[1]) {
            current = weighted[1].trim();
            changed = true;
        }
    }
    return current;
};

const 规范化画师匹配文本 = (text: string): string => {
    return 清理包裹符号(去除权重包裹(text))
        .replace(/^artist\s*:/i, '')
        .replace(/^artists\s*:/i, '')
        .replace(/^art\s+by\s+/i, '')
        .replace(/^drawn\s+by\s+/i, '')
        .replace(/^illustrated\s+by\s+/i, '')
        .replace(/^by\s+/i, '')
        .replace(/^in\s+style\s+of\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

const 是显式画师模式 = (text: string): boolean => {
    const cleaned = 去除权重包裹(text).trim();
    return /^(artist|artists)\s*:/i.test(cleaned)
        || /^art\s+by\s+/i.test(cleaned)
        || /^drawn\s+by\s+/i.test(cleaned)
        || /^illustrated\s+by\s+/i.test(cleaned)
        || /^by\s+[a-z0-9_ .'-]{2,}$/i.test(cleaned)
        || /^in\s+style\s+of\s+[a-z0-9_ .'-]{2,}$/i.test(cleaned)
        || /\(artist\)$/i.test(cleaned)
        || /\bartist\b/i.test(cleaned);
};

const 是否画师Token = (token: string): { matched: boolean; source?: 画师命中来源类型; normalized: string } => {
    const normalized = 规范化画师匹配文本(token);
    if (!normalized) {
        return { matched: false, normalized: '' };
    }
    if (是显式画师模式(token)) {
        return { matched: true, source: 'rule', normalized };
    }
    if (词库集合.has(normalized)) {
        return { matched: true, source: 'dictionary', normalized };
    }
    return { matched: false, normalized };
};

export const 按顶层逗号拆分提示词 = (text: string): string[] => {
    const source = (text || '').replace(/\r?\n+/g, ', ');
    const result: string[] = [];
    let current = '';
    let escapeNext = false;
    let inWeighted = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let angleDepth = 0;

    const pushCurrent = () => {
        const trimmed = current.trim();
        if (trimmed) result.push(trimmed);
        current = '';
    };

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (escapeNext) {
            current += char;
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            current += char;
            escapeNext = true;
            continue;
        }

        if (char === ':' && next === ':') {
            current += '::';
            i += 1;
            inWeighted = !inWeighted;
            continue;
        }

        if (!inWeighted) {
            if (char === '(') parenDepth += 1;
            if (char === ')' && parenDepth > 0) parenDepth -= 1;
            if (char === '[') bracketDepth += 1;
            if (char === ']' && bracketDepth > 0) bracketDepth -= 1;
            if (char === '{') braceDepth += 1;
            if (char === '}' && braceDepth > 0) braceDepth -= 1;
            if (char === '<') angleDepth += 1;
            if (char === '>' && angleDepth > 0) angleDepth -= 1;
        }

        if (
            char === ','
            && !inWeighted
            && parenDepth === 0
            && bracketDepth === 0
            && braceDepth === 0
            && angleDepth === 0
        ) {
            pushCurrent();
            continue;
        }

        current += char;
    }

    pushCurrent();
    return result;
};

export const 本地拆分画师标签 = (positivePrompt: string): 画师拆分结果 => {
    const tokens = 按顶层逗号拆分提示词(positivePrompt);
    const 画师Tokens: string[] = [];
    const 剩余Tokens: string[] = [];
    const 命中详情: 画师命中项结构[] = [];

    for (const token of tokens) {
        const hit = 是否画师Token(token);
        if (hit.matched && hit.source) {
            画师Tokens.push(token);
            命中详情.push({
                token,
                normalized: hit.normalized,
                source: hit.source
            });
            continue;
        }
        剩余Tokens.push(token);
    }

    return {
        画师串: 画师Tokens.join(', '),
        剩余正面提示词: 剩余Tokens.join(', '),
        画师命中项: 画师Tokens.slice(),
        画师Tokens,
        剩余Tokens,
        命中详情
    };
};
