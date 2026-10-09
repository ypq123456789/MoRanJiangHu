import { describe, expect, it } from 'vitest';
import { calculateVariableReviewCapacity, assertVariableReviewCapacity, readReviewModelCapacity, validReviewContextTokens, DEFAULT_REVIEW_CONTEXT_WINDOW, assertReviewAbsoluteSize } from '../utils/variableReviewBudget';
import { normalizeVariableReviewSettings } from '../utils/variableReviewSettings';

const messages = [{ role: 'system', content: '审查事实，不重结算。' }, { role: 'user', content: JSON.stringify({ 世界: '真实正文与变量'.repeat(20000) }) }];
describe('变量审查模型感知容量', () => {
    it('超过旧160000字符仍可使用大窗口；小窗口拒绝', () => {
        const large = [{ role: 'user', content: '中文变量事实'.repeat(60000) }];
        const capacity = calculateVariableReviewCapacity({ messages: large, model: 'test', maxOutputTokens: 16384, contextWindowTokens: 1000000 });
        expect(capacity.characters).toBeGreaterThan(160000); expect(capacity.withinBudget).toBe(true);
        const small = calculateVariableReviewCapacity({ messages: large, model: 'test', maxOutputTokens: 16384, contextWindowTokens: 32000 });
        expect(() => assertVariableReviewCapacity(small)).toThrow('未发起请求');
    });
    it('metadata优先，缺失时使用明确的128000 token默认值', () => {
        const args = { messages: [], model: 'unlisted-model', maxOutputTokens: 8192 };
        expect(calculateVariableReviewCapacity(args)).toMatchObject({ contextWindowTokens: DEFAULT_REVIEW_CONTEXT_WINDOW, source: 'fallback' });
        expect(calculateVariableReviewCapacity({ ...args, metadata: { contextWindowTokens: 200000 } })).toMatchObject({ contextWindowTokens: 200000, source: 'metadata-context' });
        expect(calculateVariableReviewCapacity({ ...args, metadata: { inputTokenLimit: 100000 } })).toMatchObject({ contextWindowTokens: 100000, source: 'metadata-input' });
    });
    it('手动指定优先于metadata；自动模式尊重单独输入上限', () => {
        const args = { messages: [], model: 'test', maxOutputTokens: 16000, metadata: { contextWindowTokens: 200000, inputTokenLimit: 64000 } };
        expect(calculateVariableReviewCapacity(args).inputBudgetTokens).toBe(64000 - 8192);
        expect(calculateVariableReviewCapacity({ ...args, contextWindowTokens: 400000 })).toMatchObject({ source: 'manual', inputBudgetTokens: 400000 - 16000 - 16000 });
    });
    it('输出预算增大，会等量减少可用输入；Prompt增加会增加估算', () => {
        const a = calculateVariableReviewCapacity({ messages, model: 'test', maxOutputTokens: 8192, contextWindowTokens: 400000 });
        const b = calculateVariableReviewCapacity({ messages, model: 'test', maxOutputTokens: 32768, contextWindowTokens: 400000 });
        expect(a.inputBudgetTokens - b.inputBudgetTokens).toBe(32768 - 8192);
        const extra = calculateVariableReviewCapacity({ messages: [...messages, { role: 'user', content: '长审查策略'.repeat(10000) }], model: 'test', maxOutputTokens: 8192, contextWindowTokens: 400000 });
        expect(extra.estimatedInputTokens).toBeGreaterThan(a.estimatedInputTokens);
    });
    it('相同字符长度的中文/英文/JSON估算并不相同，保留封装和余量', () => {
        const estimate = (text: string) => calculateVariableReviewCapacity({ messages: [{ role: 'user', content: text }], model: 'test', maxOutputTokens: 8192 });
        expect(estimate('中文'.repeat(100)).estimatedInputTokens).toBeGreaterThan(estimate('ab'.repeat(100)).estimatedInputTokens);
        expect(estimate('{"a":1}'.repeat(30)).estimatedInputTokens).toBeGreaterThan(0);
        expect(estimate('')).toMatchObject({ safetyReserveTokens: 8192 });
    });
    it('metadata只接收可靠的整数容量字段，不把max_tokens或label当上下文', () => {
        expect(readReviewModelCapacity({ context_length: 200000, top_provider: { context_length: 128000 }, max_input_tokens: 64000 })).toEqual({ contextWindowTokens: 128000, inputTokenLimit: 64000 });
        expect(readReviewModelCapacity({ context_window: '256000', max_tokens: 1000000 })).toEqual({ contextWindowTokens: 256000 });
        expect(readReviewModelCapacity({ context_length: '128K', label: '1M', max_tokens: 1000000 })).toEqual({});
        expect(readReviewModelCapacity({ max_input_tokens: 1024 })).toEqual({ inputTokenLimit: 1024 });
        expect(calculateVariableReviewCapacity({ messages: [], model: 'test', maxOutputTokens: 8192, metadata: { inputTokenLimit: 1024 } }).withinBudget).toBe(false);
        expect(validReviewContextTokens(200000.5)).toBeUndefined(); expect(validReviewContextTokens(-1)).toBeUndefined();
    });
    it('窗口设置独立持久化，旧设置默认自动，损坏值不崩溃', () => {
        expect(normalizeVariableReviewSettings({})).toMatchObject({ contextWindowMode: 'auto' });
        expect(normalizeVariableReviewSettings({ contextWindowMode: 'custom', contextWindowTokens: 400000 })).toMatchObject({ contextWindowMode: 'custom', contextWindowTokens: 400000 });
        expect(normalizeVariableReviewSettings({ contextWindowMode: 'custom', contextWindowTokens: 2.5 }).contextWindowTokens).toBeUndefined();
    });
    it('字符保险只处理异常体积，计入before一次', () => {
        expect(() => assertReviewAbsoluteSize({ current: '数据'.repeat(100000), before: '数据'.repeat(100000) })).not.toThrow();
        expect(() => assertReviewAbsoluteSize({ current: '数据'.repeat(100) }, 10)).toThrow('工程字符安全上限');
    });
});
