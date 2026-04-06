import type {
    小说拆分数据集结构,
    小说拆分树节点结构,
    小说拆分注入快照结构,
    小说拆分注入目标类型,
    OpeningConfig,
    接口设置结构,
    剧情系统结构
} from '../types';
import {
    读取小说拆分注入快照列表,
    获取当前激活小说拆分数据集,
    获取小说拆分数据集
} from './novelDecompositionStore';
import {
    应用剧情小说时间校准到分段,
    规范化章节时间校准列表
} from './novelDecompositionCalibration';
import { 获取同人角色替换规则列表 } from '../utils/openingConfig';

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value : '');
const 取有效可见性列表 = (items: unknown): string[] => (
    Array.isArray(items)
        ? items.map((item) => 读取文本(item).trim()).filter(Boolean)
        : []
);

const 规范化信息可见性 = (value: any) => ({
    谁知道: 取有效可见性列表(value?.谁知道),
    谁不知道: 取有效可见性列表(value?.谁不知道),
    是否仅读者视角可见: value?.是否仅读者视角可见 === true
});

const 规范化可见信息条目 = (value: any): 小说拆分数据集结构['分段列表'][number]['原著硬约束'][number] => ({
    内容: 读取文本(value?.内容).trim(),
    信息可见性: 规范化信息可见性(value?.信息可见性)
});

const 构建信息可见性行 = (value: any): string[] => {
    const normalized = 规范化信息可见性(value);
    const lines = [`是否仅读者视角可见：${normalized.是否仅读者视角可见 ? '是' : '否'}`];
    if (normalized.谁知道.length > 0) lines.unshift(`谁知道：${normalized.谁知道.join('、')}`);
    if (normalized.谁不知道.length > 0) lines.splice(lines.length - 1, 0, `谁不知道：${normalized.谁不知道.join('、')}`);
    return lines;
};

const 格式化信息可见性摘要 = (value: any): string => {
    const normalized = 规范化信息可见性(value);
    const parts: string[] = [];
    if (normalized.谁知道.length > 0) parts.push(`谁知道:${normalized.谁知道.join('、')}`);
    if (normalized.谁不知道.length > 0) parts.push(`谁不知道:${normalized.谁不知道.join('、')}`);
    if (normalized.是否仅读者视角可见) parts.push('仅读者视角');
    return parts.length > 0 ? `可见性:${parts.join('｜')}` : '';
};

const 格式化可见信息条目摘要 = (
    item: 小说拆分数据集结构['分段列表'][number]['原著硬约束'][number]
): string => {
    const normalized = 规范化可见信息条目(item);
    const visibility = 格式化信息可见性摘要(normalized.信息可见性);
    return [normalized.内容, visibility].filter(Boolean).join('｜');
};

const 应用同人角色替换 = (
    text: string,
    openingConfig?: OpeningConfig,
    playerName?: string
): string => {
    const source = (text || '').trim();
    if (!source) return '';
    const rules = 获取同人角色替换规则列表(openingConfig, playerName)
        .sort((a, b) => {
            const lengthDiff = b.原名称.length - a.原名称.length;
            if (lengthDiff !== 0) return lengthDiff;
            return a.原名称.localeCompare(b.原名称, 'zh-Hans-CN');
        });
    if (
        openingConfig?.同人融合?.enabled !== true
        || openingConfig?.同人融合?.启用角色替换 !== true
        || rules.length <= 0
    ) {
        return source;
    }
    const placeholderPrefix = `__WUXIA_ROLE_REPLACE_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    let result = source;
    rules.forEach((rule, index) => {
        result = result.split(rule.原名称).join(`${placeholderPrefix}${index}__`);
    });
    rules.forEach((rule, index) => {
        result = result.split(`${placeholderPrefix}${index}__`).join(rule.替换为);
    });
    return result.trim();
};

const 扁平化树节点 = (nodes: 小说拆分树节点结构[], depth = 0): Array<{ node: 小说拆分树节点结构; depth: number }> => {
    const result: Array<{ node: 小说拆分树节点结构; depth: number }> = [];
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        result.push({ node, depth });
        if (Array.isArray(node.子节点) && node.子节点.length > 0) {
            result.push(...扁平化树节点(node.子节点, depth + 1));
        }
    });
    return result;
};

const 过滤目标树节点 = (
    nodes: 小说拆分树节点结构[],
    target: 小说拆分注入目标类型
): Array<{ node: 小说拆分树节点结构; depth: number }> => (
    扁平化树节点(nodes)
        .filter(({ node }) => Array.isArray(node.目标链路) && node.目标链路.includes(target))
        .sort((a, b) => {
            const depthDiff = a.depth - b.depth;
            if (depthDiff !== 0) return depthDiff;
            return (a.node.排序 || 0) - (b.node.排序 || 0);
        })
);

const 过滤目标树节点为树状 = (
    nodes: 小说拆分树节点结构[],
    target: 小说拆分注入目标类型
): 小说拆分树节点结构[] => (
    ((Array.isArray(nodes) ? nodes : [])
        .map((node) => {
            const children = 过滤目标树节点为树状(node.子节点 || [], target);
            const matchTarget = Array.isArray(node.目标链路) && node.目标链路.includes(target);
            if (!matchTarget && children.length <= 0) {
                return null;
            }
            return {
                ...node,
                子节点: children
            };
        })
        .filter(Boolean) as 小说拆分树节点结构[])
        .sort((a, b) => (a.排序 || 0) - (b.排序 || 0))
);

const 构建前缀 = (depth: number): string => {
    if (depth <= 0) return '• ';
    return `${'│  '.repeat(Math.max(0, depth - 1))}├─ `;
};

const 构建树状文本 = (title: string, items: Array<{ node: 小说拆分树节点结构; depth: number }>): string => {
    const lines: string[] = [`【${title}】`];
    items.forEach(({ node, depth }) => {
        const label = 读取文本(node.标题).trim() || '未命名节点';
        const body = 读取文本(node.内容).trim();
        lines.push(`${构建前缀(depth)}${label}`);
        if (body) {
            body.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
                lines.push(`${'│  '.repeat(depth + 1)}${line}`);
            });
        }
    });
    return lines.join('\n').trim();
};

const 构建分段注入文本行 = (segment: 小说拆分数据集结构['分段列表'][number], target: 小说拆分注入目标类型): string[] => {
    if (target === 'main_story') {
        return [
            segment.本组概括 ? `本组概括：${segment.本组概括}` : '',
            Array.isArray(segment.原著硬约束) && segment.原著硬约束.length > 0
                ? `原著硬约束：${segment.原著硬约束.map(格式化可见信息条目摘要).join('；')}`
                : ''
        ].filter(Boolean);
    }
    if (target === 'planning') {
        return [
            segment.本组概括 ? `本组概括：${segment.本组概括}` : '',
            Array.isArray(segment.开局已成立事实) && segment.开局已成立事实.length > 0 ? `开局已成立事实：${segment.开局已成立事实.join('；')}` : '',
            Array.isArray(segment.前组延续事实) && segment.前组延续事实.length > 0 ? `前组延续事实：${segment.前组延续事实.join('；')}` : '',
            Array.isArray(segment.本组结束状态) && segment.本组结束状态.length > 0 ? `本组结束状态：${segment.本组结束状态.join('；')}` : '',
            Array.isArray(segment.原著硬约束) && segment.原著硬约束.length > 0
                ? `原著硬约束：${segment.原著硬约束.map(格式化可见信息条目摘要).join('；')}`
                : '',
            Array.isArray(segment.可提前铺垫) && segment.可提前铺垫.length > 0
                ? `可提前铺垫：${segment.可提前铺垫.map(格式化可见信息条目摘要).join('；')}`
                : '',
            Array.isArray(segment.关键事件) && segment.关键事件.length > 0 ? `关键事件：${segment.关键事件.map((event) => [event.事件名, 格式化信息可见性摘要(event.信息可见性)].filter(Boolean).join('｜')).filter(Boolean).join('；')}` : '',
            Array.isArray(segment.角色推进) && segment.角色推进.length > 0 ? `角色推进：${segment.角色推进.map((item) => item.角色名).filter(Boolean).join('；')}` : '',
            segment.时间线起点 ? `区间时间：${segment.时间线起点} -> ${segment.时间线终点}` : ''
        ].filter(Boolean);
    }
    return [
        Array.isArray(segment.关键事件) && segment.关键事件.length > 0 ? `关键事件：${segment.关键事件.map((event) => [event.事件名, 格式化信息可见性摘要(event.信息可见性)].filter(Boolean).join('｜')).filter(Boolean).join('；')}` : '',
        Array.isArray(segment.本组结束状态) && segment.本组结束状态.length > 0 ? `本组结束状态：${segment.本组结束状态.join('；')}` : '',
        Array.isArray(segment.原著硬约束) && segment.原著硬约束.length > 0
            ? `原著硬约束：${segment.原著硬约束.map(格式化可见信息条目摘要).join('；')}`
            : '',
        Array.isArray(segment.可提前铺垫) && segment.可提前铺垫.length > 0
            ? `可提前铺垫：${segment.可提前铺垫.map(格式化可见信息条目摘要).join('；')}`
            : '',
        Array.isArray(segment.角色推进) && segment.角色推进.length > 0 ? `角色推进：${segment.角色推进.map((item) => item.角色名).filter(Boolean).join('；')}` : '',
        segment.登场角色.length > 0 ? `关联角色：${segment.登场角色.join('、')}` : '',
        segment.时间线起点 ? `区间时间：${segment.时间线起点} -> ${segment.时间线终点}` : ''
    ].filter(Boolean);
};

const 从分段构建回退节点 = (dataset: 小说拆分数据集结构, target: 小说拆分注入目标类型): Array<{ node: 小说拆分树节点结构; depth: number }> => {
    const result: Array<{ node: 小说拆分树节点结构; depth: number }> = [];
    if (target === 'planning' && (dataset.当前阶段概括 || '').trim()) {
        result.push({
            depth: 0,
            node: {
                id: `${dataset.id}_${target}_stage`,
                数据集ID: dataset.id,
                类型: 'stage_summary',
                标题: '当前阶段概括',
                内容: dataset.当前阶段概括 || '',
                目标链路: [target],
                排序: 10
            }
        });
    }
    dataset.分段列表
        .filter((segment) => segment.启用注入 !== false)
        .forEach((segment, index) => {
            const lines = 构建分段注入文本行(segment, target);
            if (lines.length <= 0) return;
            result.push({
                depth: 0,
                node: {
                    id: `${dataset.id}_${target}_segment_${segment.id}`,
                    数据集ID: dataset.id,
                    类型: 'segment',
                    标题: segment.标题 || `分段 ${index + 1}`,
                    内容: lines.join('\n'),
                    目标链路: [target],
                    关联分段ID列表: [segment.id],
                    排序: 100 + index
                }
            });
        });
    return result;
};

const 获取已完成启用分段 = (dataset: 小说拆分数据集结构): 小说拆分数据集结构['分段列表'] => (
    (Array.isArray(dataset.分段列表) ? dataset.分段列表 : [])
        .filter((segment) => segment.处理状态 === '已完成' && segment.启用注入 !== false)
        .sort((a, b) => {
            const groupDiff = (a.组号 || 0) - (b.组号 || 0);
            if (groupDiff !== 0) return groupDiff;
            const startDiff = (a.起始章序号 || 0) - (b.起始章序号 || 0);
            if (startDiff !== 0) return startDiff;
            return (a.结束章序号 || 0) - (b.结束章序号 || 0);
        })
);

const 获取当前分解组号 = (story?: 剧情系统结构 | null): number => {
    const currentGroup = Number(story?.当前章节?.当前分解组);
    if (Number.isFinite(currentGroup) && currentGroup > 0) return Math.floor(currentGroup);
    return 1;
};

const 查找对齐分段索引 = (
    segments: 小说拆分数据集结构['分段列表'],
    groupIndex: number
): number => {
    if (!Array.isArray(segments) || segments.length <= 0) return -1;
    const exactIndex = segments.findIndex((segment) => (
        Math.max(1, Number(segment.组号) || 1) === groupIndex
    ));
    if (exactIndex >= 0) return exactIndex;
    const fallbackIndex = segments.findIndex((segment) => (
        Math.max(1, Number(segment.组号) || 1) >= groupIndex
    ));
    if (fallbackIndex >= 0) return fallbackIndex;
    return segments.length - 1;
};

const 获取实时对齐分段索引 = (
    segments: 小说拆分数据集结构['分段列表'],
    story?: 剧情系统结构 | null
): number => {
    return 查找对齐分段索引(segments, 获取当前分解组号(story));
};

const 构建章节标签 = (segment: 小说拆分数据集结构['分段列表'][number]): string => {
    const start = Math.max(1, Number(segment?.起始章序号) || 1);
    const end = Math.max(start, Number(segment?.结束章序号) || start);
    const chapterText = start === end ? `第${start}章` : `第${start}章-第${end}章`;
    const title = 读取文本(segment?.标题).trim();
    return title ? `${chapterText}｜${title}` : chapterText;
};

const 读取章节范围文本 = (segment: 小说拆分数据集结构['分段列表'][number]): string => {
    const raw = 读取文本(segment?.章节范围)
        .trim()
        .replace(/\s*[-~～—]+\s*/gu, '-');
    if (!raw || /^[-~～—]/u.test(raw)) {
        return 构建章节标签(segment).split('｜')[0];
    }
    return raw;
};

const 追加区块 = (lines: string[], title: string, value?: string | null) => {
    const body = (value || '').trim();
    if (!body) return;
    lines.push(`【${title}】`);
    lines.push(body);
};

const 追加列表区块 = (lines: string[], title: string, values?: string[]) => {
    const list = (Array.isArray(values) ? values : []).map((item) => (item || '').trim()).filter(Boolean);
    if (list.length <= 0) return;
    lines.push(`【${title}】`);
    lines.push(...list);
};

const 提取命名区块内容 = (text: string, title: string): string => {
    const source = (text || '').replace(/\r\n/g, '\n').trim();
    if (!source) return '';
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`【${escapedTitle}】\\n([\\s\\S]*?)(?=\\n【[^\\n]+】|$)`, 'u');
    const matched = source.match(pattern);
    return (matched?.[1] || '').trim();
};

const 构建时间线区块 = (
    segment?: 小说拆分数据集结构['分段列表'][number],
    options?: { brief?: boolean }
): string => {
    if (!segment) return '';
    const brief = options?.brief === true;
    const timeline = Array.isArray(segment.关键事件) && segment.关键事件.length > 0
        ? segment.关键事件.map((event) => ({
            标题: event.事件名,
            时间锚点: event.开始时间 || event.最早开始时间 || event.最迟开始时间 || event.结束时间,
            描述: [event.事件说明, ...(event.事件结果 || [])].filter(Boolean).join('；'),
            涉及角色: []
        }))
        : (Array.isArray(segment.时间线) ? segment.时间线 : []);
    const lines: string[] = [];
    if ((segment.时间线起点 || '').trim()) {
        lines.push(`起始时间：${segment.时间线起点}`);
    }
    if ((segment.时间线终点 || '').trim()) {
        lines.push(`结束时间：${segment.时间线终点}`);
    }
    timeline.forEach((event, index) => {
        const title = (event?.标题 || '').trim() || `事件${index + 1}`;
        const anchor = (event?.时间锚点 || '').trim();
        const description = (event?.描述 || '').trim();
        if (brief) {
            const parts = [title];
            if (anchor) parts.push(`时间:${anchor}`);
            lines.push(`[${index + 1}] ${parts.join('｜')}`);
            return;
        }
        lines.push(`[${index + 1}] ${title}`);
        if (anchor) lines.push(`时间锚点：${anchor}`);
        if (description) lines.push(`描述：${description}`);
    });
    return lines.join('\n').trim();
};

type 小说拆分滑窗位置 = 'previous' | 'current' | 'next';
type 小说拆分章节事件写法 = 'none' | 'titles' | 'gates' | 'full';
type 小说拆分章节概括块 = { 章节名: string; 内容: string };

type 小说拆分章节注入配置 = {
    includeSummary: boolean;
    includeOpeningFacts: boolean;
    includeCarryFacts: boolean;
    includeEndState: boolean;
    includeNextReference: boolean;
    includeHardConstraints: boolean;
    includeForeshadowing: boolean;
    includeCharacters: boolean;
    includeTimeRange: boolean;
    includeTimeline: boolean;
    includeRoleProgress: boolean;
    eventMode: 小说拆分章节事件写法;
    summaryLimit: number;
    factLimit: number;
    eventLimit: number;
    progressLimit: number;
};

const 取有效文本列表 = (items: unknown, maxCount?: number): string[] => {
    const source = Array.isArray(items) ? items : [];
    const result = source
        .map((item) => 读取文本(item).trim())
        .filter(Boolean);
    return typeof maxCount === 'number' && maxCount > 0 ? result.slice(0, maxCount) : result;
};

const 按条数限制截取 = <T,>(items: T[] | undefined, limit: number): T[] => {
    const source = Array.isArray(items) ? items : [];
    return limit > 0 ? source.slice(0, limit) : source;
};

const 拼接列表字段 = (items: unknown, maxCount?: number): string => {
    const list = 取有效文本列表(items, maxCount);
    return list.length > 0 ? list.join('｜') : '无';
};

const 追加多行列表区块 = (lines: string[], title: string, items: unknown, maxCount: number) => {
    const list = 取有效文本列表(items, maxCount);
    if (list.length <= 0) return;
    lines.push(`${title}：`);
    lines.push(...list);
};

const 解析章节概括块 = (text: string): 小说拆分章节概括块[] => {
    const source = (text || '').replace(/\r\n/g, '\n').trim();
    if (!source) return [];
    const lines = source.split('\n');
    const result: 小说拆分章节概括块[] = [];
    let current: 小说拆分章节概括块 | null = null;

    const 推入当前条目 = () => {
        if (!current) return;
        const 章节名 = (current.章节名 || '').trim();
        const 内容 = (current.内容 || '').trim();
        if (章节名 || 内容) {
            result.push({ 章节名, 内容 });
        }
        current = null;
    };

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            if (current && current.内容) {
                current.内容 = `${current.内容}\n`;
            }
            return;
        }

        const chapterMatch = line.match(/^\[(.+?)\][：:]\s*(.*)$/u);
        if (chapterMatch) {
            推入当前条目();
            current = {
                章节名: (chapterMatch[1] || '').trim(),
                内容: (chapterMatch[2] || '').trim()
            };
            return;
        }

        if (!current) {
            current = { 章节名: '', 内容: line };
            return;
        }

        current.内容 = current.内容
            ? `${current.内容}\n${line}`
            : line;
    });

    推入当前条目();
    return result.filter((item) => item.章节名 || item.内容);
};

const 格式化章节概括块 = (items: 小说拆分章节概括块[]): string => (
    (Array.isArray(items) ? items : [])
        .map((item) => {
            const title = (item.章节名 || '').trim();
            const content = (item.内容 || '').trim();
            if (title && content) return `[${title}]：\n${content}`;
            if (title) return `[${title}]：`;
            return content;
        })
        .filter(Boolean)
        .join('\n')
        .trim()
);

const 获取滑窗概括注入文本 = (
    summary: string,
    target: 小说拆分注入目标类型,
    position: 小说拆分滑窗位置
): string => {
    const source = (summary || '').trim();
    if (!source) return '';
    if (target !== 'main_story' || position === 'current') return source;

    const chapterBlocks = 解析章节概括块(source);
    if (chapterBlocks.length <= 0) return source;

    return position === 'previous'
        ? 格式化章节概括块(chapterBlocks.slice(-1))
        : 格式化章节概括块(chapterBlocks.slice(0, 1));
};

const 追加可见信息条目区块 = (
    lines: string[],
    title: string,
    items: 小说拆分数据集结构['分段列表'][number]['原著硬约束'],
    maxCount: number
) => {
    const list = (Array.isArray(items) ? items : [])
        .map((item) => 规范化可见信息条目(item))
        .filter((item) => item.内容)
        .slice(0, maxCount > 0 ? maxCount : undefined);
    if (list.length <= 0) return;
    lines.push(`${title}：`);
    list.forEach((item, index) => {
        lines.push(`[${index + 1}] 内容：${item.内容}`);
        lines.push(...构建信息可见性行(item.信息可见性));
    });
};

const 读取分解组号 = (
    segment?: 小说拆分数据集结构['分段列表'][number],
    groupIndex?: number
): number => {
    const segmentGroup = Number(segment?.组号);
    if (Number.isFinite(segmentGroup) && segmentGroup > 0) return Math.floor(segmentGroup);
    if (typeof groupIndex === 'number' && groupIndex > 0) return Math.floor(groupIndex);
    return 0;
};

const 构建关键事件区块 = (
    events: 小说拆分数据集结构['分段列表'][number]['关键事件'],
    mode: 小说拆分章节事件写法,
    limit: number
): string[] => {
    if (mode === 'none') return [];
    const source = 按条数限制截取(events, limit);
    if (source.length <= 0) return [];
    const lines: string[] = ['关键事件：'];
    source.forEach((event, index) => {
        const title = 读取文本(event?.事件名).trim() || `事件${index + 1}`;
        const startTime = 读取文本(event?.开始时间).trim();
        const earliestTime = 读取文本(event?.最早开始时间).trim();
        const latestTime = 读取文本(event?.最迟开始时间).trim();
        const endTime = 读取文本(event?.结束时间).trim();
        const resultText = 拼接列表字段(event?.事件结果);
        const nextImpactText = 拼接列表字段(event?.对下一组影响);
        if (mode === 'titles') {
            const parts = [title];
            if (startTime || earliestTime || latestTime || endTime) {
                parts.push(`时间:${startTime || earliestTime || latestTime || endTime}`);
            }
            if (resultText !== '无') {
                parts.push(`结果:${resultText}`);
            }
            const visibilitySummary = 格式化信息可见性摘要(event?.信息可见性);
            if (visibilitySummary) {
                parts.push(visibilitySummary);
            }
            lines.push(`[${index + 1}] ${parts.join('｜')}`);
            return;
        }

        lines.push(`[${index + 1}] ${title}`);
        const description = 读取文本(event?.事件说明).trim();
        if (description) lines.push(`事件说明：${description}`);
        lines.push(`开始时间：${startTime || '无'}`);
        lines.push(`最早开始时间：${earliestTime || '无'}`);
        lines.push(`最迟开始时间：${latestTime || '无'}`);
        lines.push(`结束时间：${endTime || '无'}`);
        lines.push(`前置条件：${拼接列表字段(event?.前置条件)}`);
        lines.push(`触发条件：${拼接列表字段(event?.触发条件)}`);
        lines.push(`阻断条件：${拼接列表字段(event?.阻断条件)}`);
        lines.push(`事件结果：${resultText}`);
        lines.push(`对下一组影响：${nextImpactText}`);
        lines.push(...构建信息可见性行(event?.信息可见性));
    });
    return lines;
};

const 构建角色推进区块 = (
    items: 小说拆分数据集结构['分段列表'][number]['角色推进'],
    limit: number
): string[] => {
    const source = 按条数限制截取(items, limit);
    if (source.length <= 0) return [];
    const lines: string[] = ['角色推进：'];
    source.forEach((item, index) => {
        lines.push(`[${index + 1}] ${读取文本(item?.角色名).trim() || `角色${index + 1}`}`);
        lines.push(`本组前状态：${拼接列表字段(item?.本组前状态)}`);
        lines.push(`本组变化：${拼接列表字段(item?.本组变化)}`);
        lines.push(`本组后状态：${拼接列表字段(item?.本组后状态)}`);
        lines.push(`对下一组影响：${拼接列表字段(item?.对下一组影响)}`);
    });
    return lines;
};

const 获取章节注入配置 = (
    target: 小说拆分注入目标类型,
    position: 小说拆分滑窗位置
): 小说拆分章节注入配置 => {
    if (target === 'main_story') {
        if (position === 'current') {
            return {
                includeSummary: true,
                includeOpeningFacts: false,
                includeCarryFacts: false,
                includeEndState: false,
                includeNextReference: false,
                includeHardConstraints: true,
                includeForeshadowing: false,
                includeCharacters: false,
                includeTimeRange: true,
                includeTimeline: true,
                includeRoleProgress: false,
                eventMode: 'none',
                summaryLimit: 4,
                factLimit: 0,
                eventLimit: 0,
                progressLimit: 0
            };
        }
        return {
            includeSummary: true,
            includeOpeningFacts: false,
            includeCarryFacts: false,
            includeEndState: false,
            includeNextReference: false,
            includeHardConstraints: false,
            includeForeshadowing: false,
            includeCharacters: false,
            includeTimeRange: true,
            includeTimeline: false,
            includeRoleProgress: false,
            eventMode: 'none',
            summaryLimit: 3,
            factLimit: 0,
            eventLimit: 0,
            progressLimit: 0
        };
    }

    if (target === 'planning') {
        if (position === 'current') {
            return {
                includeSummary: true,
                includeOpeningFacts: true,
                includeCarryFacts: true,
                includeEndState: true,
                includeNextReference: false,
                includeHardConstraints: true,
                includeForeshadowing: true,
                includeCharacters: true,
                includeTimeRange: true,
                includeTimeline: false,
                includeRoleProgress: true,
                eventMode: 'full',
                summaryLimit: 4,
                factLimit: 0,
                eventLimit: 0,
                progressLimit: 0
            };
        }
        return {
            includeSummary: true,
            includeOpeningFacts: position === 'next',
            includeCarryFacts: position === 'next',
            includeEndState: position === 'previous',
            includeNextReference: false,
            includeHardConstraints: true,
            includeForeshadowing: position === 'next',
            includeCharacters: true,
            includeTimeRange: true,
            includeTimeline: false,
            includeRoleProgress: position === 'next',
            eventMode: 'gates',
            summaryLimit: 3,
            factLimit: 0,
            eventLimit: 0,
            progressLimit: 0
        };
    }

    if (position === 'current') {
        return {
            includeSummary: true,
            includeOpeningFacts: false,
            includeCarryFacts: true,
            includeEndState: true,
            includeNextReference: false,
            includeHardConstraints: true,
            includeForeshadowing: true,
            includeCharacters: true,
            includeTimeRange: true,
            includeTimeline: false,
            includeRoleProgress: false,
            eventMode: 'full',
            summaryLimit: 3,
            factLimit: 0,
            eventLimit: 0,
            progressLimit: 0
        };
    }

    return {
        includeSummary: true,
        includeOpeningFacts: false,
        includeCarryFacts: position === 'next',
        includeEndState: position === 'previous',
        includeNextReference: false,
        includeHardConstraints: true,
        includeForeshadowing: position === 'next',
        includeCharacters: true,
        includeTimeRange: true,
        includeTimeline: false,
        includeRoleProgress: false,
        eventMode: 'gates',
        summaryLimit: 2,
        factLimit: 0,
        eventLimit: 0,
        progressLimit: 0
    };
};

const 注入链路保留前一章节内容 = (target: 小说拆分注入目标类型): boolean => target === 'main_story';

const 构建章节区块文本 = (
    segment: 小说拆分数据集结构['分段列表'][number] | undefined,
    groupIndex: number | undefined,
    config: 小说拆分章节注入配置,
    target: 小说拆分注入目标类型,
    position: 小说拆分滑窗位置
): string => {
    if (!segment) return '';
    const lines: string[] = [];
    const resolvedGroup = 读取分解组号(segment, groupIndex);
    if (resolvedGroup > 0) {
        lines.push(`分解组号：${resolvedGroup}`);
    }
    lines.push(`章节范围：${读取章节范围文本(segment)}`);
    const chapterTitles = 取有效文本列表(segment.章节标题);
    if (chapterTitles.length > 0) {
        lines.push(`章节标题：${chapterTitles.join('｜')}`);
    }
    lines.push(`是否开局组：${segment.是否开局组 ? '是' : '否'}`);
    if (config.includeTimeRange && ((segment.时间线起点 || '').trim() || (segment.时间线终点 || '').trim())) {
        lines.push(`时间线范围：${(segment.时间线起点 || '').trim() || '未知'} -> ${(segment.时间线终点 || '').trim() || '未知'}`);
    }
    if (config.includeSummary) {
        追加区块(lines, '本组概括', 获取滑窗概括注入文本(segment.本组概括, target, position));
    }
    if (config.includeOpeningFacts) {
        追加多行列表区块(lines, '开局已成立事实', segment.开局已成立事实, config.factLimit);
    }
    if (config.includeCarryFacts) {
        追加多行列表区块(lines, '前组延续事实', segment.前组延续事实, config.factLimit);
    }
    if (config.includeEndState) {
        追加多行列表区块(lines, '本组结束状态', segment.本组结束状态, config.factLimit);
    }
    if (config.includeNextReference) {
        追加多行列表区块(lines, '给下一组参考', segment.给下一组参考, config.factLimit);
    }
    if (config.includeHardConstraints) {
        追加可见信息条目区块(lines, '原著硬约束', segment.原著硬约束, config.factLimit);
    }
    if (config.includeForeshadowing) {
        追加可见信息条目区块(lines, '可提前铺垫', segment.可提前铺垫, config.factLimit);
    }
    if (config.includeCharacters) {
        const characters = 取有效文本列表(segment.登场角色);
        if (characters.length > 0) {
            lines.push(`登场角色：${characters.join('、')}`);
        }
    }

    lines.push(...构建关键事件区块(segment.关键事件, config.eventMode, config.eventLimit));
    if (config.includeRoleProgress) {
        lines.push(...构建角色推进区块(segment.角色推进, config.progressLimit));
    }

    if (config.includeTimeline) {
        const timelineText = 构建时间线区块(segment, { brief: target === 'main_story' });
        if (timelineText) {
            lines.push('事件时间线：');
            lines.push(timelineText);
        }
    }
    return lines.join('\n').trim();
};

const 获取滑窗分段 = (
    dataset: 小说拆分数据集结构,
    story?: 剧情系统结构 | null
): {
    currentIndex: number;
    previous?: 小说拆分数据集结构['分段列表'][number];
    current?: 小说拆分数据集结构['分段列表'][number];
    next?: 小说拆分数据集结构['分段列表'][number];
} => {
    const calibrationList = 规范化章节时间校准列表(story?.章节时间校准);
    const segments = 获取已完成启用分段(dataset)
        .map((segment) => 应用剧情小说时间校准到分段(segment, calibrationList));
    if (segments.length <= 0) {
        return { currentIndex: -1 };
    }
    const currentIndex = 获取实时对齐分段索引(segments, story);
    return {
        currentIndex,
        previous: currentIndex > 0 ? segments[currentIndex - 1] : undefined,
        current: currentIndex >= 0 ? segments[currentIndex] : undefined,
        next: currentIndex >= 0 && currentIndex < segments.length - 1 ? segments[currentIndex + 1] : undefined
    };
};

const 构建滑窗注入头部 = (target: 小说拆分注入目标类型): string => {
    if (target === 'main_story') {
        return [
            '【小说分解滑窗注入｜主剧情执行】',
            '- 主剧情链路只读取最小原著锚点：前后章节只保留概括与时间范围，当前章节再额外保留本回合需要的原著边界与时间线锚点。其他执行细节交给规划分析与世界演变链路处理后，再通过它们的结果回流到主剧情上下文。',
            '- 读取顺序固定为：前一章节看上一组概括与时间尾点，当前章节看本回合原著锚点、必要边界与时间区间，下一章节看下一组概括与时间前瞻。'
        ].join('\n');
    }
    if (target === 'planning') {
        return [
            '【小说分解滑窗注入｜规划分析】',
            '- 规划分析链路只读取剧情执行相关信息：承接事实、结束状态、关键事件门槛与角色推进。',
            '- 若条目携带 `谁知道 / 谁不知道 / 是否仅读者视角可见`，必须把它当成信息边界：仅读者视角可见的内容只能作为暗线和风险来源，不能直接当成角色已知前提来抢跑推进。',
            '- 当前章节内容用于判断本章执行门槛和换章条件，下一章节内容用于判断下一组起点前提与禁止抢跑点。'
        ].join('\n');
    }
    return [
        '【小说分解滑窗注入｜世界演变】',
        '- 世界演变链路只读取世界执行相关信息：关键事件时间与条件、本组结束状态、原著硬约束、可提前铺垫与时间线范围。',
        '- 若条目携带 `谁知道 / 谁不知道 / 是否仅读者视角可见`，必须按信息边界维护后台世界：读者暗线可用于伏动和风险积累，但不能直接写成角色已知、势力已知或公开事实。',
        '- 当前章节内容用于判断后台 NPC、势力、事件和镜头此刻是否到达执行窗口，下一章节内容用于确认哪些状态只能预热不能抢跑。'
    ].join('\n');
};

const 构建统一滑窗章节注入 = (
    dataset: 小说拆分数据集结构,
    target: 小说拆分注入目标类型,
    story?: 剧情系统结构 | null
): string => {
    const { currentIndex, previous, current, next } = 获取滑窗分段(dataset, story);
    if (!current) return '';
    const lines: string[] = [构建滑窗注入头部(target)];
    if (注入链路保留前一章节内容(target)) {
        追加区块(
            lines,
            '前一章节内容',
            构建章节区块文本(
                previous,
                currentIndex > 0 ? currentIndex : undefined,
                获取章节注入配置(target, 'previous'),
                target,
                'previous'
            )
        );
    }
    追加区块(
        lines,
        '当前章节内容',
        构建章节区块文本(
            current,
            currentIndex >= 0 ? currentIndex + 1 : undefined,
            获取章节注入配置(target, 'current'),
            target,
            'current'
        )
    );
    追加区块(
        lines,
        '下一章节内容',
        构建章节区块文本(
            next,
            currentIndex >= 0 ? currentIndex + 2 : undefined,
            获取章节注入配置(target, 'next'),
            target,
            'next'
        )
    );
    return lines.join('\n').trim();
};

const 按上限裁切文本 = (text: string, maxChars: number): string => (
    maxChars > 0 && text.length > maxChars
        ? text.slice(0, maxChars).trim()
        : text
);

export const 构建小说拆分注入快照 = (
    dataset: 小说拆分数据集结构,
    target: 小说拆分注入目标类型,
    options?: { maxChars?: number }
): 小说拆分注入快照结构 => {
    const explicitNodes = 过滤目标树节点(dataset.注入树 || [], target);
    const explicitTreeNodes = 过滤目标树节点为树状(dataset.注入树 || [], target);
    const fallbackNodes = explicitNodes.length > 0 ? explicitNodes : 从分段构建回退节点(dataset, target);
    const title = target === 'main_story'
        ? '主剧情小说分解注入'
        : target === 'planning'
            ? '规划分析小说分解注入'
            : '世界演变小说分解注入';
    const text = 构建树状文本(title, fallbackNodes);
    const maxChars = typeof options?.maxChars === 'number'
        ? Math.max(0, Math.floor(options.maxChars))
        : 0;
    const finalText = 按上限裁切文本(text, maxChars);
    return {
        数据集ID: dataset.id,
        目标链路: target,
        标题: title,
        条目数: fallbackNodes.length,
        文本: finalText,
        节点列表: explicitTreeNodes.length > 0 ? explicitTreeNodes : fallbackNodes.map(({ node }) => node),
        updatedAt: Date.now()
    };
};

export const 构建全部小说拆分注入快照 = (
    dataset: 小说拆分数据集结构
): 小说拆分注入快照结构[] => [
    构建小说拆分注入快照(dataset, 'main_story'),
    构建小说拆分注入快照(dataset, 'planning'),
    构建小说拆分注入快照(dataset, 'world_evolution')
];

const 小说拆分链路已启用 = (settings: 接口设置结构 | null | undefined, target: 小说拆分注入目标类型): boolean => {
    const feature = settings?.功能模型占位;
    if (!feature?.小说拆分功能启用) return false;
    if (target === 'main_story') return feature.小说拆分主剧情注入 !== false;
    if (target === 'planning') return feature.小说拆分规划分析注入 !== false;
    return feature.小说拆分世界演变注入 !== false;
};

const 获取链路上限 = (settings: 接口设置结构 | null | undefined, target: 小说拆分注入目标类型): number => {
    void settings;
    void target;
    return 0;
};

const 获取优先数据集 = async (openingConfig?: OpeningConfig): Promise<小说拆分数据集结构 | null> => {
    const preferredDatasetId = (
        openingConfig?.同人融合?.enabled === true
        && openingConfig?.同人融合?.启用附加小说 === true
    )
        ? 读取文本(openingConfig?.同人融合?.附加小说数据集ID).trim()
        : '';
    return preferredDatasetId
        ? (await 获取小说拆分数据集(preferredDatasetId)) || await 获取当前激活小说拆分数据集()
        : await 获取当前激活小说拆分数据集();
};

const 构建实时章节注入文本 = (
    dataset: 小说拆分数据集结构,
    target: 小说拆分注入目标类型,
    story?: 剧情系统结构 | null
): string => {
    return 构建统一滑窗章节注入(dataset, target, story);
};

export const 获取激活小说拆分注入文本 = async (
    settings: 接口设置结构 | null | undefined,
    target: 小说拆分注入目标类型,
    openingConfig?: OpeningConfig,
    story?: 剧情系统结构 | null,
    playerName?: string
): Promise<string> => {
    if (!小说拆分链路已启用(settings, target)) return '';

    const activeDataset = await 获取优先数据集(openingConfig);
    if (!activeDataset) return '';

    const maxChars = 获取链路上限(settings, target);
    const runtimeText = 构建实时章节注入文本(activeDataset, target, story);
    if (runtimeText.trim()) {
        return 应用同人角色替换(按上限裁切文本(runtimeText, maxChars), openingConfig, playerName);
    }

    const snapshots = await 读取小说拆分注入快照列表();
    const matched = snapshots.find((item) => item.数据集ID === activeDataset.id && item.目标链路 === target);
    if (matched?.文本?.trim()) {
        return 应用同人角色替换(按上限裁切文本(matched.文本, maxChars), openingConfig, playerName);
    }

    return 应用同人角色替换(
        构建小说拆分注入快照(activeDataset, target, { maxChars }).文本,
        openingConfig,
        playerName
    );
};

export const 获取开局小说拆分注入文本 = async (
    settings: 接口设置结构 | null | undefined,
    openingConfig?: OpeningConfig,
    story?: 剧情系统结构 | null,
    playerName?: string
): Promise<string> => {
    return 获取激活小说拆分注入文本(settings, 'main_story', openingConfig, story, playerName);
};
