export type TXT章节标题层级 = 'volume' | 'chapter';

export type TXT章节标题识别结果 = {
    标题: string;
    原始标题: string;
    层级: TXT章节标题层级;
};

const 中文数字片段 = '[0-9０-９零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾佰仟]+';
const 英文章节序号片段 = '(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
const 卷级单位片段 = '[卷部篇册季集辑]';
const 章级单位片段 = '[章节回节话幕集]';
const 中文章节引用规则 = new RegExp(`第\\s*${中文数字片段}\\s*[卷部篇册季集辑章节回节话幕集]`, 'gu');
const 英文章节引用规则 = new RegExp(`\\b(?:chapter|chap|volume|vol(?:ume)?|book|part)\\s*(?:${英文章节序号片段})\\b`, 'giu');
const 目录标题规则 = /^(目录|目次|contents?|table\s+of\s+contents)$/iu;
const 特殊章节标题规则 = /^(?:序章|楔子|引子|序言|前言|引言|终章|尾声|后记|番外(?:篇)?|外传|附录|大结局|完本感言)(?:\s*[-—:：·•、.]\s*|\s+)?[^\n]{0,30}$/u;
const 英文特殊章节标题规则 = /^(?:prologue|epilogue|afterword|preface|foreword|appendix)(?:\s*[-—:：·•、.]\s*|\s+)?[^\n]{0,30}$/iu;
const 强章节标题规则 = [
    new RegExp(`^(?:正文\\s*)?(?:第\\s*${中文数字片段}\\s*${卷级单位片段}\\s*[｜|/·•、:：\\-— ]+\\s*)?(?:第\\s*${中文数字片段}\\s*${章级单位片段}|${章级单位片段}\\s*${中文数字片段})[^\\n]{0,40}$`, 'u'),
    new RegExp(`^(?:正文\\s*)?第\\s*${中文数字片段}\\s*${章级单位片段}[^\\n]{0,40}$`, 'u'),
    new RegExp(`^(?:正文\\s*)?${章级单位片段}\\s*${中文数字片段}[^\\n]{0,40}$`, 'u'),
    new RegExp(`^(?:chapter|chap)\\s*(?:${英文章节序号片段})\\b[^\\n]{0,40}$`, 'iu')
];
const 强卷标题规则 = [
    new RegExp(`^(?:正文\\s*)?第\\s*${中文数字片段}\\s*${卷级单位片段}[^\\n]{0,40}$`, 'u'),
    new RegExp(`^(?:正文\\s*)?${卷级单位片段}\\s*${中文数字片段}[^\\n]{0,40}$`, 'u'),
    /^(?:上|中|下|终)卷[^\n]{0,30}$/u,
    new RegExp(`^(?:volume|vol(?:ume)?|book|part)\\s*(?:${英文章节序号片段})\\b[^\\n]{0,40}$`, 'iu')
];
const 弱数字章节标题规则 = new RegExp(`^(?:正文\\s*)?(?:${中文数字片段})\\s*[、.．·\\-—]\\s*[^\\s].{0,28}$`, 'u');
const 标题前缀规则列表 = [
    new RegExp(`^(?:正文\\s*)?第\\s*${中文数字片段}\\s*[卷部篇册季集辑章节回节话幕集]\\s*`, 'u'),
    new RegExp(`^[卷部篇册季集辑章节回节话幕集]\\s*${中文数字片段}\\s*`, 'u'),
    /^(?:序章|楔子|引子|序言|前言|引言|终章|尾声|后记|番外(?:篇)?|外传|附录|大结局|完本感言)\s*/u,
    new RegExp(`^(?:chapter|chap|volume|vol(?:ume)?|book|part)\\s*(?:${英文章节序号片段})\\b\\s*`, 'iu'),
    /^(?:prologue|epilogue|afterword|preface|foreword|appendix)\s*/iu
];

const 规范化文本 = (value: string): string => value
    .replace(/\r\n/g, '\n')
    .replace(/\uFEFF/g, '')
    .trim();

const 规范化标题候选行 = (value: string): string => 规范化文本(value)
    .replace(/[\t\u3000 ]+/g, ' ')
    .replace(/[|｜]+/g, '｜')
    .trim();

const 标题外层包裹对列表: Array<readonly [string, string]> = [
    ['【', '】'],
    ['[', ']'],
    ['(', ')'],
    ['（', '）'],
    ['〈', '〉'],
    ['《', '》'],
    ['「', '」'],
    ['『', '』']
];

const 去掉外层标题装饰 = (value: string): string => {
    let current = 规范化标题候选行(value);
    let changed = true;
    while (changed && current) {
        changed = false;
        for (const [open, close] of 标题外层包裹对列表) {
            if (current.startsWith(open) && current.endsWith(close)) {
                current = current.slice(open.length, current.length - close.length).trim();
                changed = true;
                break;
            }
        }
    }
    return current.trim();
};

const 去掉单段标题前缀 = (value: string): string => {
    let current = 去掉外层标题装饰(value);
    let changed = true;
    while (changed && current) {
        changed = false;
        for (const rule of 标题前缀规则列表) {
            const next = current
                .replace(rule, '')
                .replace(/^[｜|:：·•、.\-—/ ]+/u, '')
                .trim();
            if (next !== current) {
                current = next;
                changed = true;
            }
        }
    }
    return current.trim();
};

export const 规范化标题 = (title: string): string => {
    const normalized = 规范化标题候选行(title);
    if (!normalized) return '';
    const parts = normalized
        .split(/[｜|]/)
        .map((item) => 去掉单段标题前缀(item))
        .filter(Boolean);
    if (parts.length > 0) {
        return parts.join('｜').trim();
    }
    return 去掉单段标题前缀(normalized);
};

export const 识别TXT章节标题行 = (
    line: string,
    options?: { 上一行?: string; 下一行?: string }
): TXT章节标题识别结果 | null => {
    const 原始标题 = 规范化标题候选行(line);
    const 标题 = 去掉外层标题装饰(原始标题);
    if (!标题) return null;

    if (强章节标题规则.some((rule) => rule.test(标题)) || 特殊章节标题规则.test(标题) || 英文特殊章节标题规则.test(标题)) {
        return {
            标题,
            原始标题,
            层级: 'chapter'
        };
    }

    if (强卷标题规则.some((rule) => rule.test(标题))) {
        return {
            标题,
            原始标题,
            层级: 'volume'
        };
    }

    const 上一行为空 = !规范化文本(options?.上一行 || '');
    const 下一行文本 = 规范化文本(options?.下一行 || '');
    const 下一行为空 = !下一行文本;
    if (
        弱数字章节标题规则.test(标题)
        && 上一行为空
        && (下一行为空 || 下一行文本.length >= 12)
    ) {
        return {
            标题,
            原始标题,
            层级: 'chapter'
        };
    }

    return null;
};

export const 是否疑似目录章节 = (params: { 标题?: string; 内容?: string }): boolean => {
    const title = 规范化标题(params.标题 || '');
    const content = 规范化文本(params.内容 || '');
    if (!content) return false;

    const chapterRefCount = (content.match(中文章节引用规则) || []).length + (content.match(英文章节引用规则) || []).length;
    const prosePunctuationCount = (content.match(/[。！？!?]/g) || []).length;
    const lineCount = content.split('\n').map((item) => item.trim()).filter(Boolean).length;
    const titleLooksLikeCatalog = 目录标题规则.test(title);

    if (titleLooksLikeCatalog && chapterRefCount >= 2) {
        return true;
    }

    if (chapterRefCount >= 8 && prosePunctuationCount <= 2) {
        return true;
    }

    if (chapterRefCount >= 6 && lineCount <= 6 && prosePunctuationCount <= 3) {
        return true;
    }

    if (chapterRefCount >= 10 && chapterRefCount >= prosePunctuationCount * 3) {
        return true;
    }

    return false;
};

export const 过滤疑似目录章节 = <T extends { 标题?: string; 内容?: string }>(chapters: T[]): T[] => {
    if (!Array.isArray(chapters) || chapters.length <= 1) return chapters;
    const filtered = chapters.filter((chapter) => !是否疑似目录章节(chapter));
    return filtered.length > 0 ? filtered : chapters;
};

export const 提取正文中的显式章节标题 = (content: string): string => {
    const lines = 规范化文本(content)
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10);

    for (let index = 0; index < lines.length; index += 1) {
        const match = 识别TXT章节标题行(lines[index], {
            上一行: index > 0 ? lines[index - 1] : '',
            下一行: index < lines.length - 1 ? lines[index + 1] : ''
        });
        if (match) {
            return match.标题;
        }
    }
    return '';
};

export const 去掉正文开头重复章节标题 = (content: string, title: string): string => {
    const normalizedContent = 规范化文本(content);
    const normalizedTitle = 去掉外层标题装饰(title);
    if (!normalizedContent || !normalizedTitle) return normalizedContent;

    const lines = normalizedContent.split('\n');
    if (lines.length <= 0) return normalizedContent;
    const firstLine = 去掉外层标题装饰(lines[0]);
    if (firstLine !== normalizedTitle) return normalizedContent;

    return 规范化文本(lines.slice(1).join('\n'));
};

export const 重排章节序号 = <T extends { 序号: number }>(chapters: T[]): T[] => chapters.map((chapter, index) => ({
    ...chapter,
    序号: index + 1
}));
