import { strFromU8, unzipSync } from 'fflate';
import { 过滤疑似目录章节, 提取正文中的显式章节标题, 去掉正文开头重复章节标题, 重排章节序号 } from './novelStructureHeuristics';

export interface EPUB导入章节结构 {
    标题: string;
    内容: string;
    序号: number;
    href: string;
}

export interface EPUB导入结果结构 {
    标题: string;
    原始文本: string;
    章节列表: EPUB导入章节结构[];
}

interface EPUB资源项结构 {
    id: string;
    href: string;
    mediaType: string;
    properties: string;
}

const 章节标题规则 = [
    /^\s*第\s*[0-9零一二三四五六七八九十百千万两〇○]+\s*[章节回卷部篇集][^\n]*$/u,
    /^\s*(chapter|chap)\s*[0-9]+[^\n]*$/iu
];

const 块级标签 = new Set([
    'article', 'aside', 'blockquote', 'br', 'div', 'figcaption', 'figure', 'footer',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
    'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
]);

const 支持的正文媒体类型 = new Set([
    'application/xhtml+xml',
    'text/html',
    'application/xml',
    'text/xml'
]);

const 规范化路径 = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');

const 获取目录路径 = (value: string): string => {
    const normalized = 规范化路径(value);
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index) : '';
};

const 解析路径片段 = (value: string): string[] => 规范化路径(value)
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);

const 拼接相对路径 = (baseDir: string, href: string): string => {
    const stack = 解析路径片段(baseDir);
    解析路径片段(href).forEach((part) => {
        if (part === '.') return;
        if (part === '..') {
            stack.pop();
            return;
        }
        stack.push(part);
    });
    return stack.join('/');
};

const 清洗文本 = (value: string): string => value
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const 安全解码路径 = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const 获取压缩包文本 = (zipEntries: Record<string, Uint8Array>, filePath: string): string => {
    const normalizedPath = 规范化路径(filePath);
    const candidatePaths = Array.from(new Set([
        normalizedPath,
        安全解码路径(normalizedPath),
        encodeURI(normalizedPath),
        normalizedPath.replace(/#/g, '%23')
    ]));

    let entry: Uint8Array | undefined;
    for (const candidate of candidatePaths) {
        entry = zipEntries[candidate];
        if (entry) break;
    }

    if (!entry) {
        const matchedKey = Object.keys(zipEntries).find((key) => 安全解码路径(规范化路径(key)) === 安全解码路径(normalizedPath));
        if (matchedKey) {
            entry = zipEntries[matchedKey];
        }
    }

    if (!entry) {
        throw new Error(`EPUB 缺少文件：${normalizedPath}`);
    }

    try {
        return strFromU8(entry);
    } catch {
        return new TextDecoder('utf-8').decode(entry);
    }
};

const 解析XML = (content: string, fileLabel: string): Document => {
    const doc = new DOMParser().parseFromString(content, 'application/xml');
    if (doc.querySelector('parsererror')) {
        throw new Error(`解析 EPUB 文件失败：${fileLabel} 不是有效的 XML。`);
    }
    return doc;
};

const 获取首个标签文本 = (doc: Document, tagNames: string[]): string => {
    for (const tagName of tagNames) {
        const nodes = doc.getElementsByTagNameNS('*', tagName);
        if (nodes.length > 0) {
            const text = 清洗文本(nodes[0]?.textContent || '');
            if (text) return text;
        }
        const plainNodes = doc.getElementsByTagName(tagName);
        if (plainNodes.length > 0) {
            const text = 清洗文本(plainNodes[0]?.textContent || '');
            if (text) return text;
        }
    }
    return '';
};

const 从HTML提取正文 = (markup: string): { 标题: string; 内容: string; 图片数量: number } => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg').forEach((node) => node.remove());

    const body = doc.body || doc.documentElement;
    const chunks: string[] = [];

    const 追加换行 = () => {
        const last = chunks[chunks.length - 1];
        if (!last || last.endsWith('\n')) return;
        chunks.push('\n');
    };

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) chunks.push(text);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        const isBlock = 块级标签.has(tagName);
        if (tagName === 'br') {
            chunks.push('\n');
            return;
        }
        if (isBlock) 追加换行();

        Array.from(element.childNodes).forEach(walk);

        if (isBlock) 追加换行();
    };

    walk(body);

    const 标题 = 清洗文本(
        doc.querySelector('h1, h2, h3')?.textContent
        || doc.querySelector('title')?.textContent
        || ''
    );

    return {
        标题,
        图片数量: doc.querySelectorAll('img, image').length,
        内容: 清洗文本(chunks.join(' '))
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
    };
};

export const 构建EPUB章节标题 = (title: string, index: number): string => {
    const normalizedTitle = 清洗文本(title).split('\n')[0]?.trim() || '';
    if (normalizedTitle && 章节标题规则.some((rule) => rule.test(normalizedTitle))) {
        return normalizedTitle;
    }
    return normalizedTitle ? `第${index}章 ${normalizedTitle}` : `第${index}章`;
};

const 提取EPUB章节号 = (title: string): number | null => {
    const matched = String(title || '').match(/^\s*第\s*([0-9０-９]+)\s*章/u);
    if (!matched) return null;
    const value = Number(matched[1].replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10)));
    return Number.isFinite(value) ? value : null;
};

export const 修复EPUB相邻章节倒序 = <T extends { 标题: string }>(chapters: T[]): T[] => {
    const repaired = [...chapters];
    for (let index = 0; index < repaired.length - 1; index += 1) {
        const currentNumber = 提取EPUB章节号(repaired[index].标题);
        const nextNumber = 提取EPUB章节号(repaired[index + 1].标题);
        const previousNumber = index > 0 ? 提取EPUB章节号(repaired[index - 1].标题) : null;
        const followingNumber = index + 2 < repaired.length ? 提取EPUB章节号(repaired[index + 2].标题) : null;
        if (
            currentNumber === null
            || nextNumber === null
            || currentNumber !== nextNumber + 1
            || (previousNumber !== null && previousNumber !== nextNumber - 1)
            || (followingNumber !== null && followingNumber !== currentNumber + 1)
        ) continue;
        [repaired[index], repaired[index + 1]] = [repaired[index + 1], repaired[index]];
        index += 1;
    }
    return repaired;
};

export const 是否跳过EPUB非正文资源 = (params: {
    href: string;
    properties: string;
    chapterText: string;
    title: string;
    bookTitle: string;
    imageCount: number;
}): boolean => {
    const normalizedHint = `${params.href} ${params.properties} ${params.title}`.toLowerCase();
    if (params.properties.toLowerCase().includes('nav')) return true;
    if (/cover|封面/.test(normalizedHint) && params.chapterText.length < 120) return true;
    if (/toc|contents|目录|目次|nav/.test(normalizedHint) && params.chapterText.length < 600) return true;
    if (params.bookTitle && params.chapterText.length < 80 && 清洗文本(params.chapterText) === 清洗文本(params.bookTitle)) return true;
    const leadingText = params.chapterText.slice(0, 500);
    if (/【本集内容简介】/u.test(leadingText)) return true;
    if (/【(?:本集后记|清羽散记|太泉后记|正文拾遗|六朝闲谈)】/u.test(leadingText)) return true;
    if (/六朝系列/u.test(params.title) && /(?:作者|简介|版本|校对|出版)/u.test(leadingText)) return true;
    if (
        params.chapterText.length < 80
        && /^(?:第\s*[0-9零一二三四五六七八九十百千万两〇○]+\s*集|[（(][一二三四五六七八九十]+[）)].*(?:篇|部))/u.test(params.title.trim())
    ) return true;
    if (
        params.imageCount > 0
        && params.chapterText.length < 120
        && /(?:地图|高手榜|人物榜|关系图|封底|插图|图册|局部[·・]|(?:^|\s)[^\s]{0,8}都[·・])/u.test(`${params.title} ${params.chapterText}`)
    ) return true;
    return false;
};

const 获取资源清单 = (opfDoc: Document): EPUB资源项结构[] => Array.from(opfDoc.getElementsByTagNameNS('*', 'item')).map((node) => {
    const element = node as Element;
    return {
        id: element.getAttribute('id') || '',
        href: element.getAttribute('href') || '',
        mediaType: (element.getAttribute('media-type') || '').trim().toLowerCase(),
        properties: (element.getAttribute('properties') || '').trim()
    };
}).filter((item) => item.id && item.href);

const 获取阅读顺序 = (opfDoc: Document, manifestMap: Map<string, EPUB资源项结构>): EPUB资源项结构[] => {
    const spineItems = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'))
        .map((node) => node as Element)
        .filter((element) => (element.getAttribute('linear') || 'yes').toLowerCase() !== 'no')
        .map((element) => manifestMap.get(element.getAttribute('idref') || ''))
        .filter((item): item is EPUB资源项结构 => Boolean(item));

    if (spineItems.length > 0) return spineItems;

    return Array.from(manifestMap.values())
        .filter((item) => 支持的正文媒体类型.has(item.mediaType))
        .sort((a, b) => a.href.localeCompare(b.href, 'zh-CN'));
};

export const 从EPUB文件提取小说内容 = async (file: File): Promise<EPUB导入结果结构> => {
    const zipEntries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const containerText = 获取压缩包文本(zipEntries, 'META-INF/container.xml');
    const containerDoc = 解析XML(containerText, 'META-INF/container.xml');
    const rootfile = containerDoc.getElementsByTagNameNS('*', 'rootfile')[0] || containerDoc.getElementsByTagName('rootfile')[0];
    const packagePath = 规范化路径(rootfile?.getAttribute('full-path') || '');
    if (!packagePath) {
        throw new Error('EPUB 缺少 OPF 包路径。');
    }

    const opfText = 获取压缩包文本(zipEntries, packagePath);
    const opfDoc = 解析XML(opfText, packagePath);
    const manifestItems = 获取资源清单(opfDoc);
    const manifestMap = new Map(manifestItems.map((item) => [item.id, item]));
    const packageDir = 获取目录路径(packagePath);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '').trim() || '导入作品';
    const bookTitle = 获取首个标签文本(opfDoc, ['title']) || fallbackTitle;
    const orderedItems = 获取阅读顺序(opfDoc, manifestMap);

    const 章节列表: EPUB导入章节结构[] = [];

    orderedItems.forEach((item) => {
        if (!支持的正文媒体类型.has(item.mediaType)) return;
        try {
            const htmlPath = 拼接相对路径(packageDir, item.href);
            const htmlText = 获取压缩包文本(zipEntries, htmlPath);
            const parsed = 从HTML提取正文(htmlText);
            if (!parsed.内容) return;
            const explicitTitle = 提取正文中的显式章节标题(parsed.内容);
            const resolvedTitle = explicitTitle || parsed.标题;
            const cleanedContent = explicitTitle
                ? 去掉正文开头重复章节标题(parsed.内容, explicitTitle)
                : parsed.内容;
            if (!cleanedContent) return;
            if (是否跳过EPUB非正文资源({
                href: item.href,
                properties: item.properties,
                chapterText: cleanedContent,
                title: resolvedTitle,
                bookTitle,
                imageCount: parsed.图片数量
            })) return;

            const 序号 = 章节列表.length + 1;
            章节列表.push({
                标题: 构建EPUB章节标题(resolvedTitle, 序号),
                内容: cleanedContent,
                序号,
                href: item.href
            });
        } catch {
            // 单个资源损坏时跳过，避免整本 EPUB 导入中断。
        }
    });

    const filteredChapters = 重排章节序号(修复EPUB相邻章节倒序(过滤疑似目录章节(章节列表)));

    if (filteredChapters.length <= 0) {
        throw new Error('EPUB 中未找到可导入的正文章节。');
    }

    const 原始文本 = filteredChapters.map((chapter) => `${chapter.标题}\n${chapter.内容}`).join('\n\n');

    return {
        标题: bookTitle,
        原始文本,
        章节列表: filteredChapters
    };
};
