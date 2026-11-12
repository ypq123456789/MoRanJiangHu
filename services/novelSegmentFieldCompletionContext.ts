import type { 小说拆分分段结构 } from '../models/novelDecomposition';
import { 分段字段补全单段原文最大字符数 } from '../prompts/runtime/novelSegmentFieldCompletion';

export { 分段字段补全单段原文最大字符数 };

const 标准化文本 = (value: unknown): string => (
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
);

const 标准化列表 = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.map(标准化文本).filter(Boolean)
        : []
);

const 追加列表区块 = (lines: string[], title: string, items: unknown, limit = 24): void => {
    const values = 标准化列表(items).slice(0, limit);
    if (values.length <= 0) return;
    lines.push(`【${title}】`, ...values);
};

const 可见信息内容列表 = (items: unknown): string[] => (
    Array.isArray(items)
        ? items.map((item: any) => 标准化文本(item?.内容 || item)).filter(Boolean)
        : []
);

export const 小说分段字段补全输出硬约束 = [
    '【额外约束】只提炼叙事规则、关系、势力关系、伏笔、回收点和节奏标签；不要复述露骨身体细节，不要输出色情描写。',
    '【输出硬约束】必须返回合法 JSON 对象。即使只有少量可确认内容，也至少返回“章节节奏”数组；没有把握的其他字段可以省略，但禁止空响应。'
].join('\n');

export interface 小说分段字段补全输入统计 {
    原文总字符数: number;
    实际输入字符数: number;
    是否完整输入: boolean;
}

export const 构建小说分段字段补全原文输入 = (segment: Pick<小说拆分分段结构, '原文内容'>): {
    text: string;
    inputStats: 小说分段字段补全输入统计;
} => {
    const 原文 = segment.原文内容 || '';
    const 原文总字符数 = 原文.length;
    const 实际输入字符数 = Math.min(原文总字符数, 分段字段补全单段原文最大字符数);
    const 是否完整输入 = 实际输入字符数 === 原文总字符数;
    const 正文 = 是否完整输入
        ? 原文
        : `${原文.slice(0, 分段字段补全单段原文最大字符数)}\n...(原文超过单次上限 ${分段字段补全单段原文最大字符数} 字，后续内容未送入模型)`;
    return {
        text: [正文, '', 小说分段字段补全输出硬约束].join('\n').trim(),
        inputStats: {
            原文总字符数,
            实际输入字符数,
            是否完整输入
        }
    };
};

export const 构建小说分段字段补全备用上下文 = (segment: 小说拆分分段结构): string => {
    const lines: string[] = [
        `【分段标题】${标准化文本(segment.标题)}`,
        `【本组概括】${标准化文本(segment.本组概括)}`
    ];

    追加列表区块(lines, '开局已成立事实', segment.开局已成立事实);
    追加列表区块(lines, '前组延续事实', segment.前组延续事实);
    追加列表区块(lines, '本组结束状态', segment.本组结束状态);
    追加列表区块(lines, '给下一组参考', segment.给下一组参考);
    追加列表区块(lines, '登场角色', segment.登场角色);
    追加列表区块(lines, '原著硬约束', 可见信息内容列表(segment.原著硬约束));
    追加列表区块(lines, '可提前铺垫', 可见信息内容列表(segment.可提前铺垫));

    if (Array.isArray(segment.角色档案) && segment.角色档案.length > 0) {
        lines.push('【已有角色档案】');
        segment.角色档案.slice(0, 24).forEach((item) => {
            lines.push([
                item?.名称,
                item?.身份,
                item?.所属势力,
                ...(item?.关系摘要 || []),
                ...(item?.状态摘要 || [])
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    if (Array.isArray(segment.势力档案) && segment.势力档案.length > 0) {
        lines.push('【已有势力档案】');
        segment.势力档案.slice(0, 16).forEach((item) => {
            lines.push([
                item?.名称,
                item?.类型,
                item?.地盘,
                item?.立场目标,
                item?.当前状态,
                ...(item?.关系摘要 || [])
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    if (Array.isArray(segment.地图地点档案) && segment.地图地点档案.length > 0) {
        lines.push('【已有地点档案】');
        segment.地图地点档案.slice(0, 16).forEach((item) => {
            lines.push([
                item?.名称,
                item?.层级,
                item?.上级地点,
                item?.所属势力,
                item?.地貌功能,
                ...(item?.关键设施 || [])
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    if (Array.isArray(segment.物品档案) && segment.物品档案.length > 0) {
        lines.push('【已有物品档案】');
        segment.物品档案.slice(0, 16).forEach((item) => {
            lines.push([
                item?.名称,
                item?.类型,
                item?.用途,
                item?.所属人物,
                item?.所属势力
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    if (Array.isArray(segment.关键事件) && segment.关键事件.length > 0) {
        lines.push('【关键事件】');
        segment.关键事件.slice(0, 24).forEach((item) => {
            lines.push([
                item?.事件名,
                item?.事件说明,
                ...(item?.前置条件 || []),
                ...(item?.触发条件 || []),
                ...(item?.阻断条件 || []),
                ...(item?.事件结果 || []),
                ...(item?.对下一组影响 || [])
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    if (Array.isArray(segment.角色推进) && segment.角色推进.length > 0) {
        lines.push('【角色推进】');
        segment.角色推进.slice(0, 24).forEach((item) => {
            lines.push([
                item?.角色名,
                ...(item?.本组前状态 || []),
                ...(item?.本组变化 || []),
                ...(item?.本组后状态 || []),
                ...(item?.对下一组影响 || [])
            ].map(标准化文本).filter(Boolean).join(' / '));
        });
    }

    // 备用上下文没有原文那种天然的长度约束：结构化字段单条可能很长，
    // 提示词层不再兜底截断后必须在这里限长，否则大分段会让请求直接超出模型上下文。
    // 先截正文再拼补全要求和输出硬约束，确保约束本身不会被切掉。
    const 正文 = lines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .join('\n');
    const 受限正文 = 正文.length > 分段字段补全单段原文最大字符数
        ? `${正文.slice(0, 分段字段补全单段原文最大字符数)}\n...(结构化上下文超过单次上限 ${分段字段补全单段原文最大字符数} 字，后续内容未送入模型)`
        : 正文;

    return [
        受限正文,
        '【补全要求】根据以上已由 AI 拆分出的结构化上下文，继续由 AI 补全世界观规则、世界边界规则、人物关系、势力关系、伏笔线索、回收点、章节节奏。只写有把握的信息，不要编造。',
        小说分段字段补全输出硬约束
    ].filter(Boolean).join('\n');
};
