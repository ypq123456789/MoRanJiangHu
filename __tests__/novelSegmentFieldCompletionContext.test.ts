import { describe, expect, it } from 'vitest';
import {
    构建小说分段字段补全原文输入,
    构建小说分段字段补全备用上下文,
    分段字段补全单段原文最大字符数
} from '../services/novelSegmentFieldCompletionContext';
import type { 小说拆分分段结构 } from '../models/novelDecomposition';

const 创建分段 = (patch: Partial<小说拆分分段结构>): 小说拆分分段结构 => ({
    id: patch.id || 'segment-test',
    数据集ID: 'dataset-test',
    组号: patch.组号 || 1,
    标题: patch.标题 || '测试分段',
    章节范围: patch.章节范围 || '第1章',
    章节标题: patch.章节标题 || ['第1章'],
    是否开局组: patch.是否开局组 ?? true,
    起始章序号: patch.起始章序号 || 1,
    结束章序号: patch.结束章序号 || 1,
    启用注入: patch.启用注入 ?? true,
    原文内容: patch.原文内容 || '',
    字数: patch.字数 || 0,
    原文摘要: patch.原文摘要 || '',
    本组概括: patch.本组概括 || '',
    开局已成立事实: patch.开局已成立事实 || [],
    前组延续事实: patch.前组延续事实 || [],
    本组结束状态: patch.本组结束状态 || [],
    给下一组参考: patch.给下一组参考 || [],
    原著硬约束: patch.原著硬约束 || [],
    可提前铺垫: patch.可提前铺垫 || [],
    关键事件: patch.关键事件 || [],
    角色推进: patch.角色推进 || [],
    登场角色: patch.登场角色 || [],
    角色档案: patch.角色档案 || [],
    势力档案: patch.势力档案 || [],
    地图地点档案: patch.地图地点档案 || [],
    物品档案: patch.物品档案 || [],
    世界观规则: patch.世界观规则 || [],
    世界边界规则: patch.世界边界规则 || [],
    人物关系: patch.人物关系 || [],
    势力关系: patch.势力关系 || [],
    伏笔线索: patch.伏笔线索 || [],
    回收点: patch.回收点 || [],
    章节节奏: patch.章节节奏 || [],
    时间线: patch.时间线 || [],
    时间线起点: patch.时间线起点 || '0001:01:01:00:00',
    时间线终点: patch.时间线终点 || '0001:01:01:00:00',
    处理状态: patch.处理状态 || '已完成',
    最近错误: patch.最近错误 || '',
    createdAt: patch.createdAt || 1,
    updatedAt: patch.updatedAt || 1
});

describe('小说分段字段补全上下文', () => {
    it('原文输入保留原文并要求 AI 返回合法 JSON', () => {
        const segment = 创建分段({
            原文内容: '原始剧情文本',
            本组概括: '概括不应替代原文'
        });

        const { text: input, inputStats } = 构建小说分段字段补全原文输入(segment);

        expect(input).toContain('原始剧情文本');
        expect(input).toContain('合法 JSON 对象');
        expect(input).toContain('章节节奏');
        expect(input).toContain('禁止空响应');
        expect(inputStats).toEqual({
            原文总字符数: 6,
            实际输入字符数: 6,
            是否完整输入: true
        });
    });

    it('超过单次上限时截断原文并保留输出硬约束', () => {
        const 原文内容 = '甲'.repeat(分段字段补全单段原文最大字符数 + 5_000);
        const segment = 创建分段({ 原文内容 });

        const { text: input, inputStats } = 构建小说分段字段补全原文输入(segment);

        expect(inputStats.原文总字符数).toBe(原文内容.length);
        expect(inputStats.实际输入字符数).toBe(分段字段补全单段原文最大字符数);
        expect(inputStats.是否完整输入).toBe(false);
        expect(input).toContain(`原文超过单次上限 ${分段字段补全单段原文最大字符数} 字`);
        // 截断不能让排在原文之后的硬约束一起被切掉
        expect(input).toContain('合法 JSON 对象');
        expect(input).toContain('禁止空响应');
    });

    it('备用上下文只使用已有结构化分解信息', () => {
        const segment = 创建分段({
            标题: '备用段',
            原文内容: '这段原文不应该进入备用上下文',
            本组概括: '角色甲发现了隐患',
            本组结束状态: ['角色甲暂时脱险'],
            原著硬约束: [{
                内容: '禁地开启需要信物',
                信息可见性: { 谁知道: ['角色甲'], 谁不知道: [], 是否仅读者视角可见: false }
            }],
            关键事件: [{
                事件名: '信物现身',
                事件说明: '信物第一次被确认存在',
                开始时间: '未知',
                最早开始时间: '未知',
                最迟开始时间: '未知',
                结束时间: '未知',
                前置条件: ['角色甲进入禁地'],
                触发条件: [],
                阻断条件: [],
                事件结果: ['信物线索成立'],
                对下一组影响: ['下一组可追查信物来源'],
                信息可见性: { 谁知道: ['角色甲'], 谁不知道: [], 是否仅读者视角可见: false }
            }],
            角色推进: [{
                角色名: '角色甲',
                本组前状态: ['不了解信物'],
                本组变化: ['得知信物线索'],
                本组后状态: ['开始追查信物'],
                对下一组影响: ['推动追查线']
            }]
        });

        const input = 构建小说分段字段补全备用上下文(segment);

        expect(input).toContain('备用段');
        expect(input).toContain('角色甲发现了隐患');
        expect(input).toContain('信物现身');
        expect(input).toContain('推动追查线');
        expect(input).toContain('合法 JSON 对象');
        expect(input).not.toContain('这段原文不应该进入备用上下文');
    });
});
