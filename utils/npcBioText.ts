/**
 * NPC 简介文本的保守去重。
 *
 * 模型偶尔会把同一句经历连写两遍，或把整段复述一次；这里只剔除
 * 「归一化后完全相同」的段落/句子，保留首次出现的顺序与原标点，
 * 不重写语义、不合并近义句，避免把正常排比误判成重复。
 */

const 归一化单元 = (value: string): string =>
    value
        .replace(/\s+/g, '')
        .replace(/[，,。．！？!?；;、：:…·"'“”‘’《》〈〉()（）\[\]【】\-—~～]/g, '');

const 切分句子 = (value: string): string[] =>
    value.match(/[^。！？!?，,；;]+[。！？!?，,；;]?/g)?.map(item => item.trim()).filter(Boolean)
    ?? (value.trim() ? [value.trim()] : []);

export const 整理NPC简介文本 = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const 原文 = value.trim();
    if (!原文) return '';

    const 已见段落 = new Set<string>();
    const 保留段落: string[] = [];
    for (const 段落 of 原文.split(/\n+/).map(item => item.trim()).filter(Boolean)) {
        const key = 归一化单元(段落);
        if (!key || 已见段落.has(key)) continue;
        已见段落.add(key);
        保留段落.push(段落);
    }

    const 已见句子 = new Set<string>();
    const 结果段落: string[] = [];
    for (const 段落 of 保留段落) {
        const 保留句子: string[] = [];
        for (const 句子 of 切分句子(段落)) {
            const key = 归一化单元(句子);
            if (!key || 已见句子.has(key)) continue;
            已见句子.add(key);
            保留句子.push(句子);
        }
        if (保留句子.length > 0) 结果段落.push(保留句子.join(''));
    }

    return 结果段落.join('\n');
};
