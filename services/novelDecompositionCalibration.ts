import type {
    OpeningConfig,
    小说拆分数据集结构,
    小说拆分分段结构,
    剧情系统结构,
    章节时间校准结构
} from '../types';
import {
    获取当前激活小说拆分数据集,
    获取小说拆分数据集
} from './novelDecompositionStore';
import {
    计算小说时间偏移分钟,
    平移小说时间锚点,
    规范化小说时间锚点
} from './novelDecompositionTime';

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 读取数字 = (value: unknown, fallback = 0): number => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const 获取优先小说数据集 = async (openingConfig?: OpeningConfig): Promise<小说拆分数据集结构 | null> => {
    const preferredDatasetId = (
        openingConfig?.同人融合?.enabled === true
        && openingConfig?.同人融合?.启用附加小说 === true
    )
        ? 读取文本(openingConfig?.同人融合?.附加小说数据集ID)
        : '';
    return preferredDatasetId
        ? (await 获取小说拆分数据集(preferredDatasetId)) || await 获取当前激活小说拆分数据集()
        : await 获取当前激活小说拆分数据集();
};

const 获取已完成启用分段 = (dataset?: 小说拆分数据集结构 | null): 小说拆分分段结构[] => (
    (Array.isArray(dataset?.分段列表) ? dataset!.分段列表 : [])
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

const 查找对齐分段 = (
    segments: 小说拆分分段结构[],
    groupIndex: number
): 小说拆分分段结构 | undefined => {
    if (!Array.isArray(segments) || segments.length <= 0) return undefined;
    const exact = segments.find((segment) => (
        Math.max(1, Number(segment.组号) || 1) === groupIndex
    ));
    if (exact) return exact;
    const fallback = segments.find((segment) => (
        Math.max(1, Number(segment.组号) || 1) >= groupIndex
    ));
    return fallback || segments[segments.length - 1];
};

const 是否同一分段 = (
    left?: 小说拆分分段结构,
    right?: 小说拆分分段结构
): boolean => {
    if (!left || !right) return false;
    return (left.组号 || 0) === (right.组号 || 0)
        && (left.起始章序号 || 0) === (right.起始章序号 || 0)
        && (left.结束章序号 || 0) === (right.结束章序号 || 0);
};

export const 规范化章节时间校准列表 = (value: unknown): 章节时间校准结构[] => {
    const ordered = new Map<number, 章节时间校准结构>();
    (Array.isArray(value) ? value : []).forEach((item) => {
        const normalized: 章节时间校准结构 = {
            关联分解组: Math.max(1, Math.floor(读取数字((item as any)?.关联分解组, 1))),
            原始起始时间: 读取文本((item as any)?.原始起始时间),
            校准后起始时间: 读取文本((item as any)?.校准后起始时间),
            校准来源时间: 读取文本((item as any)?.校准来源时间)
        };
        if (!normalized.原始起始时间 || !normalized.校准后起始时间) return;
        ordered.set(normalized.关联分解组, normalized);
    });
    return Array.from(ordered.values()).sort((a, b) => a.关联分解组 - b.关联分解组);
};

const 写入对齐后的当前章节 = (
    story: 剧情系统结构,
    segment?: 小说拆分分段结构
): 剧情系统结构 => {
    if (!segment) {
        return {
            ...story,
            章节时间校准: 规范化章节时间校准列表(story?.章节时间校准)
        };
    }
    return {
        ...story,
        当前章节: {
            ...story.当前章节,
            当前分解组: Math.max(1, Number(segment.组号) || story?.当前章节?.当前分解组 || 1)
        },
        章节时间校准: 规范化章节时间校准列表(story?.章节时间校准)
    };
};

export const 同步剧情小说分解时间校准 = async (params: {
    previousStory?: 剧情系统结构 | null;
    nextStory: 剧情系统结构;
    currentGameTime?: string;
    openingConfig?: OpeningConfig;
    allowBootstrapCurrentGroup?: boolean;
}): Promise<剧情系统结构> => {
    const dataset = await 获取优先小说数据集(params.openingConfig);
    const segments = 获取已完成启用分段(dataset);
    if (segments.length <= 0) {
        return {
            ...params.nextStory,
            章节时间校准: 规范化章节时间校准列表(params.nextStory?.章节时间校准)
        };
    }

    const previousSegment = params.previousStory
        ? 查找对齐分段(segments, 获取当前分解组号(params.previousStory))
        : undefined;
    const nextSegment = 查找对齐分段(segments, 获取当前分解组号(params.nextStory));
    const alignedStory = 写入对齐后的当前章节(params.nextStory, nextSegment);
    if (!nextSegment) return alignedStory;

    const currentCalibrations = 规范化章节时间校准列表(alignedStory.章节时间校准);
    const hasCurrentAnchor = currentCalibrations.some((item) => item.关联分解组 === (nextSegment.组号 || 0));
    const shouldCreateAnchor = (
        params.allowBootstrapCurrentGroup === true && !hasCurrentAnchor
    ) || (
        previousSegment ? !是否同一分段(previousSegment, nextSegment) : false
    );
    if (!shouldCreateAnchor) {
        return {
            ...alignedStory,
            章节时间校准: currentCalibrations
        };
    }

    const originalStart = 读取文本(nextSegment.时间线起点);
    if (!originalStart) {
        return {
            ...alignedStory,
            章节时间校准: currentCalibrations
        };
    }

    const runtimeStart = 规范化小说时间锚点(
        params.currentGameTime,
        originalStart,
        originalStart
    );
    if (!runtimeStart) {
        return {
            ...alignedStory,
            章节时间校准: currentCalibrations
        };
    }

    const nextCalibrations = [
        ...currentCalibrations.filter((item) => item.关联分解组 < (nextSegment.组号 || 0)),
        {
            关联分解组: Math.max(1, Number(nextSegment.组号) || 1),
            原始起始时间: originalStart,
            校准后起始时间: runtimeStart,
            校准来源时间: runtimeStart
        }
    ];

    return {
        ...alignedStory,
        章节时间校准: 规范化章节时间校准列表(nextCalibrations)
    };
};

const 获取分段可用校准锚点 = (
    calibrations: 章节时间校准结构[],
    segment?: 小说拆分分段结构
): 章节时间校准结构 | undefined => {
    if (!segment) return undefined;
    const group = Math.max(1, Number(segment.组号) || 1);
    const matched = calibrations.filter((item) => item.关联分解组 <= group);
    return matched.length > 0 ? matched[matched.length - 1] : undefined;
};

export const 应用剧情小说时间校准到分段 = (
    segment: 小说拆分分段结构,
    calibrations: 章节时间校准结构[]
): 小说拆分分段结构 => {
    const anchor = 获取分段可用校准锚点(规范化章节时间校准列表(calibrations), segment);
    if (!anchor) return segment;
    const offsetMinutes = 计算小说时间偏移分钟(anchor.原始起始时间, anchor.校准后起始时间);
    if (!Number.isFinite(offsetMinutes) || offsetMinutes === 0) return segment;

    return {
        ...segment,
        时间线起点: 平移小说时间锚点(segment.时间线起点, offsetMinutes) || segment.时间线起点,
        时间线终点: 平移小说时间锚点(segment.时间线终点, offsetMinutes) || segment.时间线终点,
        关键事件: (Array.isArray(segment.关键事件) ? segment.关键事件 : []).map((event) => ({
            ...event,
            开始时间: 平移小说时间锚点(event.开始时间, offsetMinutes) || event.开始时间,
            最早开始时间: 平移小说时间锚点(event.最早开始时间, offsetMinutes) || event.最早开始时间,
            最迟开始时间: 平移小说时间锚点(event.最迟开始时间, offsetMinutes) || event.最迟开始时间,
            结束时间: 平移小说时间锚点(event.结束时间, offsetMinutes) || event.结束时间
        })),
        时间线: (Array.isArray(segment.时间线) ? segment.时间线 : []).map((timeline) => ({
            ...timeline,
            时间锚点: 平移小说时间锚点(timeline.时间锚点, offsetMinutes) || timeline.时间锚点
        }))
    };
};
