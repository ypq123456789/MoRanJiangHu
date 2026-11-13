import { describe, expect, it } from 'vitest';
import { 是否允许模式包完善运行回写, 计算小说模式包完善界面状态 } from '../hooks/useNovelModePackCompletion';
import { 标准化小说模式包完善记录 } from '../services/novelModePackCompletionStore';

const record = (patch: Record<string, any>) => 标准化小说模式包完善记录({
    id: 'dataset-1::武侠',
    数据集ID: 'dataset-1',
    题材: '武侠',
    数据集指纹: 'fingerprint',
    状态: 'paused',
    当前阶段: 'segment',
    总分段数: 5,
    已完成分段数: 1,
    下一个分段索引: 1,
    当前草稿: {},
    ...patch
});

describe('小说模式包完善界面状态', () => {
    it('目标记录加载完成前禁用开始操作', () => {
        const state = 计算小说模式包完善界面状态(null, false, false, false);
        expect(state.primaryAction).toBe('none');
        expect(state.statusText).toContain('正在加载');
        expect(state.canUseDraft).toBe(false);
    });

    it('目标记录加载失败后提供重试操作', () => {
        const state = 计算小说模式包完善界面状态(null, false, false, false, true);
        expect(state.primaryAction).toBe('retry');
        expect(state.statusText).toContain('加载失败');
    });

    it('暂停状态提供继续和从头重建，并阻止半成品发布', () => {
        const state = 计算小说模式包完善界面状态(record({ 状态: 'paused' }), false, true);
        expect(state.primaryAction).toBe('resume');
        expect(state.showRestart).toBe(true);
        expect(state.canUseDraft).toBe(false);
        expect(state.statusText).toContain('正在完善第 2 / 5 分段');
    });

    it('运行状态显示取消、当前标题和截断提示', () => {
        const state = 计算小说模式包完善界面状态(record({
            状态: 'running',
            当前分段ID: 'seg-2',
            当前分段标题: '第二部分',
            分段输入记录: [{
                分段ID: 'seg-1',
                原文总字符数: 10,
                实际输入字符数: 10,
                是否完整输入: true
            }, {
                分段ID: 'seg-2',
                原文总字符数: 30000,
                实际输入字符数: 24000,
                是否完整输入: false
            }]
        }), true, true);
        expect(state.primaryAction).toBe('cancel');
        expect(state.statusText).toContain('第二部分');
        expect(state.truncationText).toBe('本段输入已按上限截断');
    });

    it('暂停在最终整理时不会误报为正在整理', () => {
        const state = 计算小说模式包完善界面状态(record({
            状态: 'paused',
            当前阶段: 'finalize'
        }), false, true);
        expect(state.statusText).toContain('已暂停');
        expect(state.statusText).not.toContain('正在进行');
    });

    it('只有目标和运行令牌都匹配时才允许异步结果回写当前界面', () => {
        expect(是否允许模式包完善运行回写('a::武侠', 'a::武侠', 2, 2)).toBe(true);
        expect(是否允许模式包完善运行回写('b::武侠', 'a::武侠', 2, 2)).toBe(false);
        expect(是否允许模式包完善运行回写('a::武侠', 'a::武侠', 3, 2)).toBe(false);
    });

    it('只有最终完成且指纹匹配时才能使用草稿', () => {
        const completed = 计算小说模式包完善界面状态(record({ 状态: 'completed', 当前阶段: 'finalize' }), false, true);
        expect(completed.canUseDraft).toBe(true);
        expect(completed.statusText).toContain('已完成');
        expect(计算小说模式包完善界面状态(record({ 状态: 'completed' }), false, false).canUseDraft).toBe(false);
    });

    it('失败暂停时提供跳过分段，运行中不提供', () => {
        const paused = 计算小说模式包完善界面状态(record({
            状态: 'paused',
            最近失败分段索引: 2
        }), false, true);
        expect(paused.canSkipSegment).toBe(true);

        const running = 计算小说模式包完善界面状态(record({
            状态: 'running',
            最近失败分段索引: 2
        }), true, true);
        expect(running.canSkipSegment).toBe(false);
    });

    it('没有失败分段时不提供跳过，避免误跳正常进度', () => {
        const state = 计算小说模式包完善界面状态(record({ 状态: 'paused' }), false, true);
        expect(state.canSkipSegment).toBe(false);
    });

    it('展示已跳过段数，完成文案区分是否含跳过', () => {
        const withSkipped = 计算小说模式包完善界面状态(record({
            状态: 'completed',
            当前阶段: 'finalize',
            跳过分段ID列表: ['seg-2', 'seg-4']
        }), false, true);
        expect(withSkipped.skippedCount).toBe(2);
        expect(withSkipped.statusText).toContain('2 段为手动跳过');
        expect(withSkipped.canUseDraft).toBe(true);

        const clean = 计算小说模式包完善界面状态(record({ 状态: 'completed', 当前阶段: 'finalize' }), false, true);
        expect(clean.skippedCount).toBe(0);
        expect(clean.statusText).not.toContain('手动跳过');
    });
});
