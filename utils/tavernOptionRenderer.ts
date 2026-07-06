/**
 * 酒馆（SillyTavern）选项栏安全渲染器
 *
 * 从预设中嵌入的选项渲染正则脚本里安全提取选项文本，
 * 转换为本项目 `action_options` 数组格式供游戏 UI 使用。
 *
 * 安全策略：
 * - 不执行任何 <script>/JS/DOM 操作
 * - 不加载外部资源（字体/图片/CDN）
 * - 从正则 match/replace 模式中提取纯文本选项
 * - 支持直接从 AI 输出的 <options> 标签中提取
 */

import type { 酒馆正则脚本结构, 酒馆正则脚本分类条目 } from '../models/system';

// ─── 选项栏文本提取 ───

/** 常见的选项栏标签格式正则 */
const OPTIONS_TAG_PATTERNS = [
    // <options>选项一：xxx 选项二：xxx 选项三：xxx 选项四：xxx</options>
    /<\s*options\s*>\s*?(?:>?\s*选项[一二三四五六七八九十]+[：:]\s*([^\n>]+?)(?:\s*>?\s*选项[一二三四五六七八九十]+[：:]\s*([^\n>]+?)(?:\s*>?\s*选项[一二三四五六七八九十]+[：:]\s*([^\n>]+?)(?:\s*>?\s*选项[一二三四五六七八九十]+[：:]\s*([^\n>]+?))?)?)?)?\s*<\s*\/\s*options\s*>/is,
    // <branches>... (英文模式)
    /<\s*branches\s*>\s*([\s\S]*?)<\s*\/\s*branches\s*>/is,
    // <option>单个选项</option> (逐个)
    /<\s*option\s*>\s*([\s\S]*?)<\s*\/\s*option\s*>/gi,
];

const 清理选项文本 = (value: string): string => (
    (value || '')
        .replace(/<\s*\/?\s*(?:details|summary|options|branches|option)\b[^>]*>/gi, '')
        .replace(/^[\s>*\-]+/g, '')
        .replace(/^(?:[A-ZＡ-Ｚ]|[a-zａ-ｚ]|[一二三四五六七八九十]|\d+)\s*[.)．、:：]\s*/u, '')
        .replace(/^选项\s*(?:[A-ZＡ-Ｚ]|[a-zａ-ｚ]|[一二三四五六七八九十]|\d+)?\s*[.)．、:：]?\s*/iu, '')
        .trim()
);

/**
 * 从 AI 输出文本中直接提取 <options>/<branches> 标签内的选项
 *
 * @param text AI 输出的原始文本
 * @returns 选项文本数组（可能为空）
 */
export const 从AI文本提取选项 = (text: string): string[] => {
    if (!text) return [];
    const options: string[] = [];

    // 模式1: <options>中文选项格式</options>
    const optionsBlockMatch = text.match(/<\s*options\s*>[\s\S]*?<\s*\/\s*options\s*>/i);
    if (optionsBlockMatch) {
        const block = optionsBlockMatch[0];
        const items = block.match(/选项[一二三四五六七八九十]+[：:]\s*([^\n>]+)/g);
        if (items) {
            for (const item of items) {
                const value = 清理选项文本(item.replace(/^[^：:]+[：:]\s*/, ''));
                if (value) options.push(value);
            }
        }
        // 回退: 逐行提取非空非标签行
        if (options.length === 0) {
            const lines = block
                .replace(/<\s*\/?\s*options\s*>/gi, '')
                .split(/\n/)
                .map(l => 清理选项文本(l))
                .filter(l => l && !l.startsWith('<'));
            options.push(...lines);
        }
    }

    // 模式2: <branches>...</branches>
    const branchesMatch = text.match(/<\s*branches\s*>([\s\S]*?)<\s*\/\s*branches\s*>/i);
    if (branchesMatch && options.length === 0) {
        const block = branchesMatch[1]
            .replace(/<\s*summary\b[^>]*>[\s\S]*?<\s*\/\s*summary\s*>/gi, '\n')
            .replace(/<\s*\/?\s*details\b[^>]*>/gi, '\n');
        const markedItems = [...block.matchAll(/(?:^|\n)\s*(?:[A-ZＡ-Ｚ]|[a-zａ-ｚ]|\d+)\s*[.)．、:：]\s*([\s\S]*?)(?=\n\s*(?:[A-ZＡ-Ｚ]|[a-zａ-ｚ]|\d+)\s*[.)．、:：]|\s*$)/g)]
            .map(match => 清理选项文本(match[1] || ''))
            .filter(Boolean);
        if (markedItems.length > 0) {
            options.push(...markedItems);
        } else {
            const lines = block
                .split(/\n/)
                .map(l => 清理选项文本(l))
                .filter(l => l && !l.startsWith('<'));
            options.push(...lines);
        }
    }

    // 模式3: <option>xxx</option> 逐个
    if (options.length === 0) {
        const individualOptions = [...text.matchAll(/<\s*option\s*>\s*([\s\S]*?)<\s*\/\s*option\s*>/gi)];
        for (const match of individualOptions) {
            const value = match[1].trim();
            const cleaned = 清理选项文本(value);
            if (cleaned) options.push(cleaned);
        }
    }

    return options;
};

/**
 * 从选项渲染正则脚本的 replaceString 中提取选项捕获组模板
 *
 * 例如脚本 find 匹配 <options>选项一：$1 选项二：$2...</options>,
 * replaceString 中有 $1, $2, $3, $4 —— 提取这些捕获组的位置，
 * 在运行时从实际匹配结果中读取对应文本。
 *
 * @param script 选项渲染正则脚本
 * @returns 捕获组索引列表 ($1 → 1, $2 → 2, ...)
 */
const 提取选项捕获组索引 = (script: 酒馆正则脚本结构): number[] => {
    const indices: number[] = [];
    const replaceString = script.replaceString || '';
    // 匹配 $1, $2, $3, ... (不匹配 $0)
    const matches = replaceString.matchAll(/\$(\d+)/g);
    for (const match of matches) {
        const num = parseInt(match[1], 10);
        if (num > 0 && !indices.includes(num)) {
            indices.push(num);
        }
    }
    return indices.sort((a, b) => a - b);
};

/**
 * 使用选项渲染脚本对 AI 输出执行正则匹配，提取选项文本
 *
 * 安全策略：只执行正则 match，不执行 replaceString 的 HTML 渲染，
 * 只从捕获组中读取纯文本选项。
 *
 * @param text AI 输出文本
 * @param script 选项渲染脚本
 * @returns 选项文本数组
 */
export const 从正则脚本提取选项 = (
    text: string,
    script: 酒馆正则脚本结构
): string[] => {
    if (!text || script.disabled || !script.findRegex) return [];

    const indices = 提取选项捕获组索引(script);
    if (indices.length === 0) return [];

    // 解析 findRegex（支持 /pattern/flags 格式）
    const trimmed = script.findRegex.trim();
    let pattern = trimmed;
    let flags = 'i';

    const literalMatch = trimmed.match(/^\/(.+)\/([gimsuy]*)$/s);
    if (literalMatch) {
        pattern = literalMatch[1];
        flags = literalMatch[2] || 'i';
    }

    try {
        const regex = new RegExp(pattern, flags);
        const match = regex.exec(text);
        if (!match) return [];

        return indices
            .map(i => {
                const value = match[i];
                if (typeof value !== 'string') return '';
                // 清理: 去除前缀（如 "> 选项：" 等）和标签残留
                return value
                    .replace(/^[>\s]*(?:选项[一二三四五六七八九十]+[：:]\s*)?/u, '')
                    .replace(/<\s*\/?\s*(?:options|branches|option)\s*>/gi, '')
                    .trim();
            })
            .map(清理选项文本)
            .filter(v => v.length > 0);
    } catch {
        return [];
    }
};

/**
 * 从多个选项渲染脚本中提取选项（取第一个有结果的脚本）
 *
 * @param text AI 输出文本
 * @param classifiedScripts 已分类的脚本列表
 * @returns 选项文本数组
 */
export const 从选项脚本提取选项 = (
    text: string,
    classifiedScripts: 酒馆正则脚本分类条目[]
): string[] => {
    const optionScripts = classifiedScripts.filter(
        ({ safetyType }) => safetyType === '选项渲染'
    );

    for (const { script } of optionScripts) {
        if (script.disabled) continue;
        // 只对 AI_OUTPUT (2) 和 USER_INPUT (1) placement 的脚本提取选项
        if (script.placement.length > 0 && !script.placement.includes(2) && !script.placement.includes(1)) continue;

        const options = 从正则脚本提取选项(text, script);
        if (options.length > 0) return options;
    }

    return [];
};

/**
 * 综合提取选项：先从 AI 文本标签提取，再从正则脚本提取
 *
 * @param text AI 输出文本
 * @param extensions 预设的 extensions 对象
 * @returns 选项文本数组
 */
export const 提取酒馆选项 = (
    text: string,
    extensions: Record<string, unknown> | undefined
): string[] => {
    // 1) 先尝试从文本中直接提取 <options> 标签
    const directOptions = 从AI文本提取选项(text);
    if (directOptions.length > 0) return directOptions;

    // 2) 若标签提取失败，再尝试从正则脚本提取
    const raw = (extensions as any)?.regex_scripts;
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const classifiedScripts = raw
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => {
            const script = 规范化正则脚本简易(item);
            if (!script) return null;
            const isOptionScript = 是否选项渲染脚本简易(script);
            return {
                script,
                safetyType: isOptionScript ? '选项渲染' as const : '其他' as const,
            };
        })
        .filter((item): item is { script: 酒馆正则脚本结构; safetyType: '选项渲染' | '其他' } => item !== null);

    return 从选项脚本提取选项(text, classifiedScripts);
};

// ─── 内部简易函数（避免循环依赖 tavernPreset.ts） ───

const 规范化正则脚本简易 = (raw: any): 酒馆正则脚本结构 | null => {
    if (!raw || typeof raw !== 'object') return null;
    const findRegex = typeof raw.findRegex === 'string' ? raw.findRegex.trim() : '';
    if (!findRegex) return null;
    return {
        id: typeof raw.id === 'string' ? raw.id : `regex_${Date.now()}`,
        scriptName: typeof raw.scriptName === 'string' ? raw.scriptName : '未命名',
        findRegex,
        replaceString: typeof raw.replaceString === 'string' ? raw.replaceString : '',
        trimStrings: Array.isArray(raw.trimStrings) ? raw.trimStrings.filter((s: any) => typeof s === 'string') : [],
        placement: Array.isArray(raw.placement)
            ? raw.placement.filter((n: any) => typeof n === 'number' && Number.isFinite(n))
            : [],
        disabled: raw.disabled === true,
        markdownOnly: raw.markdownOnly === true,
        promptOnly: raw.promptOnly === true,
        runOnEdit: raw.runOnEdit === true,
        substituteRegex: typeof raw.substituteRegex === 'number' ? raw.substituteRegex : 0,
        minDepth: typeof raw.minDepth === 'number' ? raw.minDepth : -1,
        maxDepth: typeof raw.maxDepth === 'number' ? raw.maxDepth : 0,
    };
};

const 是否选项渲染脚本简易 = (script: 酒馆正则脚本结构): boolean => {
    if (script.disabled) return false;
    const findRegex = script.findRegex.toLowerCase();
    const replaceString = script.replaceString.toLowerCase();
    const scriptName = script.scriptName.toLowerCase();
    const targetsOptionBlock = /<\s*(options|branches)/.test(findRegex);
    const rendersHtml = /```html|<!doctype html|<html|<style|class\s*=/.test(replaceString);
    return /data-option-text|option-link|option-list/.test(replaceString)
        || (targetsOptionBlock && rendersHtml && /选项栏|option|choice/.test(scriptName));
};
