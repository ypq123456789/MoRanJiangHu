type ParseAttempt<T> = {
    ok: boolean;
    value: T | null;
    error?: string;
};

export interface JsonRepairResult<T = any> {
    value: T | null;
    repairedText: string;
    usedRepair: boolean;
    error?: string;
}

const tryParse = <T = any>(input: string): ParseAttempt<T> => {
    try {
        return { ok: true, value: JSON.parse(input) as T };
    } catch (error: any) {
        return { ok: false, value: null, error: error?.message || 'JSON 解析失败' };
    }
};

const stripFence = (input: string): string => {
    const trimmed = input.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    return trimmed;
};

const extractJsonBlock = (input: string): string => {
    const start = input.indexOf('{');
    const end = input.lastIndexOf('}');
    if (start >= 0 && end > start) return input.slice(start, end + 1);
    return input;
};

const replaceOutsideStrings = (input: string, mapper: (ch: string) => string): string => {
    let result = '';
    let inString = false;
    let escaped = false;

    for (const ch of input) {
        if (inString) {
            result += ch;
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            result += ch;
            continue;
        }
        result += mapper(ch);
    }

    return result;
};

const normalizeFullWidthPunctuation = (input: string): string => {
    const map: Record<string, string> = {
        '“': '"',
        '”': '"',
        '‘': "'",
        '’': "'",
        '，': ',',
        '：': ':',
        '；': ',',
    };
    return replaceOutsideStrings(input, (ch) => map[ch] ?? ch);
};

const normalizeSlashN = (input: string): string => {
    return input
        .replace(/\\\/n/g, '\\n')
        .replace(/\/n/g, '\\n');
};

const normalizeSingleQuoteJson = (input: string): string => {
    const escapeDoubleQuote = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return input
        .replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(\s*:)/g, (_m, p1, p2, p3) => `${p1}"${escapeDoubleQuote(p2)}"${p3}`)
        .replace(/(:\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}\]])/g, (_m, p1, p2) => `${p1}"${escapeDoubleQuote(p2)}"`);
};

const quoteBareKeys = (input: string): string => {
    return input.replace(/([{,]\s*)([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*)(\s*:)/g, '$1"$2"$3');
};

const insertMissingCommasBetweenPairs = (input: string): string => {
    return input.replace(/(["\]}0-9])\s*(?="[^"]+"\s*:)/g, '$1,');
};

const removeTrailingCommas = (input: string): string => {
    return input.replace(/,\s*([}\]])/g, '$1');
};

const trimIllegalTailPunctuation = (input: string): string => {
    return input.replace(/([}\]])[，。；;]+/g, '$1');
};

const endsInsideString = (input: string): boolean => {
    let inString = false;
    let escaped = false;

    for (const ch of input) {
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
        }
    }

    return inString;
};

const closeDanglingString = (input: string): string => {
    if (!endsInsideString(input)) return input;
    const tailMatch = input.match(/(\s*[}\]]+\s*)$/);
    if (tailMatch && typeof tailMatch.index === 'number') {
        const insertAt = tailMatch.index;
        return `${input.slice(0, insertAt)}"${input.slice(insertAt)}`;
    }
    return `${input}"`;
};

const findPrevNonWhitespaceIndex = (text: string, from: number): number => {
    for (let i = Math.min(from, text.length - 1); i >= 0; i--) {
        if (!/\s/.test(text[i])) return i;
    }
    return -1;
};

const findNextNonWhitespaceIndex = (text: string, from: number): number => {
    for (let i = Math.max(0, from); i < text.length; i++) {
        if (!/\s/.test(text[i])) return i;
    }
    return -1;
};

const repairMissingCommaByParseError = (input: string, errorMessage?: string): string => {
    if (!errorMessage) return input;
    if (!/Expected ',' or '}' after property value in JSON/i.test(errorMessage)) return input;
    const posMatch = errorMessage.match(/position\s+(\d+)/i);
    const pos = posMatch ? Number(posMatch[1]) : NaN;
    if (!Number.isFinite(pos)) return input;

    const nextIdx = findNextNonWhitespaceIndex(input, pos);
    if (nextIdx < 0) return input;

    const prevIdx = findPrevNonWhitespaceIndex(input, nextIdx - 1);
    if (prevIdx < 0) return input;

    const prevCh = input[prevIdx];
    const nextCh = input[nextIdx];
    const beforeHasComma = prevCh === ',';
    const looksLikeAdjacentNextKey = nextCh === '"' || nextCh === '{' || nextCh === '[';
    const valueEnded = prevCh === '"' || prevCh === '}' || prevCh === ']' || /[0-9a-zA-Z]/.test(prevCh);

    if (!beforeHasComma && looksLikeAdjacentNextKey && valueEnded) {
        return `${input.slice(0, nextIdx)},${input.slice(nextIdx)}`;
    }
    return input;
};

const repairUnterminatedStringByParseError = (input: string, errorMessage?: string): string => {
    if (!errorMessage) return input;
    if (!/Unterminated string in JSON/i.test(errorMessage)) return input;
    return closeDanglingString(input);
};

const repairExpectedQuotedPropertyNameByParseError = (input: string, errorMessage?: string): string => {
    if (!errorMessage) return input;
    if (!/Expected double-quoted property name in JSON/i.test(errorMessage)) return input;
    const posMatch = errorMessage.match(/position\s+(\d+)/i);
    const pos = posMatch ? Number(posMatch[1]) : NaN;
    if (!Number.isFinite(pos)) return input;

    const nextIdx = findNextNonWhitespaceIndex(input, pos);
    if (nextIdx < 0) return input;
    const nextCh = input[nextIdx];

    const prevIdx = findPrevNonWhitespaceIndex(input, nextIdx - 1);
    if (prevIdx >= 0) {
        const prevCh = input[prevIdx];
        if ((nextCh === '}' || nextCh === ']') && prevCh === ',') {
            return `${input.slice(0, prevIdx)}${input.slice(prevIdx + 1)}`;
        }
    }

    if (nextCh === ',') {
        const afterComma = findNextNonWhitespaceIndex(input, nextIdx + 1);
        if (afterComma >= 0 && (input[afterComma] === '}' || input[afterComma] === ']')) {
            return `${input.slice(0, nextIdx)}${input.slice(nextIdx + 1)}`;
        }
    }

    const escapeDoubleQuote = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const singleQuotedKeyFixed = input.replace(
        /([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(\s*:)/g,
        (_m, p1, p2, p3) => `${p1}"${escapeDoubleQuote(p2)}"${p3}`
    );
    if (singleQuotedKeyFixed !== input) {
        return singleQuotedKeyFixed;
    }

    const keyStartChar = input[nextIdx];
    const isKeyStart = /[A-Za-z_\u4e00-\u9fa5]/.test(keyStartChar);
    if (isKeyStart) {
        let endIdx = nextIdx + 1;
        while (endIdx < input.length && /[A-Za-z0-9_\u4e00-\u9fa5-]/.test(input[endIdx])) {
            endIdx += 1;
        }
        const colonIdx = findNextNonWhitespaceIndex(input, endIdx);
        const prevTokenIdx = findPrevNonWhitespaceIndex(input, nextIdx - 1);
        const keyBoundaryOk = prevTokenIdx < 0 || input[prevTokenIdx] === '{' || input[prevTokenIdx] === ',';
        if (colonIdx >= 0 && input[colonIdx] === ':' && keyBoundaryOk) {
            const keyText = input.slice(nextIdx, endIdx);
            return `${input.slice(0, nextIdx)}"${keyText}"${input.slice(endIdx)}`;
        }
    }

    return quoteBareKeys(removeTrailingCommas(input));
};

const errorGuidedRepair = (input: string, firstError?: string): string => {
    let text = input;
    let lastError = firstError;
    for (let i = 0; i < 4; i++) {
        let next = repairMissingCommaByParseError(text, lastError);
        if (next === text) {
            next = repairExpectedQuotedPropertyNameByParseError(text, lastError);
        }
        if (next === text) {
            next = repairUnterminatedStringByParseError(text, lastError);
        }
        if (next === text) break;
        text = next;
        const parsed = tryParse(text);
        if (parsed.ok) return text;
        lastError = parsed.error;
    }
    return text;
};

const normalizeBracketBalance = (input: string): string => {
    let result = '';
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (const ch of input) {
        if (inString) {
            result += ch;
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            result += ch;
            continue;
        }

        if (ch === '{') {
            stack.push('}');
            result += ch;
            continue;
        }
        if (ch === '[') {
            stack.push(']');
            result += ch;
            continue;
        }
        if (ch === '}' || ch === ']') {
            const expected = stack[stack.length - 1];
            if (expected === ch) {
                stack.pop();
                result += ch;
            }
            continue;
        }
        result += ch;
    }

    // If stream output ends inside a string literal, close the quote first.
    if (inString) {
        result += '"';
    }

    if (stack.length > 0) {
        result += stack.reverse().join('');
    }
    return result;
};

const escapeRawLineBreaksInStrings = (input: string): string => {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inString) {
            if (escaped) {
                result += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                result += ch;
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
                result += ch;
                continue;
            }
            if (ch === '\n') {
                result += '\\n';
                continue;
            }
            if (ch === '\r') {
                if (input[i + 1] === '\n') i += 1;
                result += '\\n';
                continue;
            }
            result += ch;
            continue;
        }

        if (ch === '"') {
            inString = true;
            result += ch;
            continue;
        }
        result += ch;
    }

    return result;
};

const normalizeBase = (input: string): string => {
    return input.replace(/^\uFEFF/, '').trim();
};

const repairJsonText = (input: string): string => {
    let text = normalizeBase(input);
    text = stripFence(text);
    text = extractJsonBlock(text);
    text = normalizeSlashN(text);
    text = normalizeFullWidthPunctuation(text);
    text = normalizeSingleQuoteJson(text);
    text = quoteBareKeys(text);
    text = insertMissingCommasBetweenPairs(text);
    text = removeTrailingCommas(text);
    text = trimIllegalTailPunctuation(text);
    text = closeDanglingString(text);
    text = normalizeBracketBalance(text);
    text = escapeRawLineBreaksInStrings(text);
    return text.trim();
};

const dedupeCandidates = (candidates: string[]): string[] => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of candidates) {
        const value = item.trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        list.push(value);
    }
    return list;
};

export const parseJsonWithRepair = <T = any>(input: string): JsonRepairResult<T> => {
    const source = normalizeBase(input || '');
    const candidates = dedupeCandidates([
        source,
        stripFence(source),
        extractJsonBlock(source),
        extractJsonBlock(stripFence(source)),
    ]);

    for (const candidate of candidates) {
        const parsed = tryParse<T>(candidate);
        if (parsed.ok) {
            return {
                value: parsed.value,
                repairedText: candidate,
                usedRepair: candidate !== source,
            };
        }
    }

    let lastError = 'JSON 解析失败';
    for (const candidate of candidates) {
        const repaired = repairJsonText(candidate);
        const parsed = tryParse<T>(repaired);
        if (parsed.ok) {
            return {
                value: parsed.value,
                repairedText: repaired,
                usedRepair: true,
            };
        }
        const guided = errorGuidedRepair(repaired, parsed.error);
        if (guided !== repaired) {
            const guidedParsed = tryParse<T>(guided);
            if (guidedParsed.ok) {
                return {
                    value: guidedParsed.value,
                    repairedText: guided,
                    usedRepair: true,
                };
            }
            if (guidedParsed.error) lastError = guidedParsed.error;
        }
        if (parsed.error) lastError = parsed.error;
    }

    const fallback = repairJsonText(source);
    return {
        value: null,
        repairedText: fallback,
        usedRepair: true,
        error: lastError,
    };
};

export const formatJsonWithRepair = (input: string, fallback: string): string => {
    const parsed = parseJsonWithRepair<any>(input);
    if (parsed.value === null) return fallback;
    try {
        return JSON.stringify(parsed.value, null, 2);
    } catch {
        return parsed.repairedText || fallback;
    }
};
