import { describe, expect, it } from 'vitest';
import { 开场初始化任务提示词 } from '../prompts/runtime/opening';
import { 开局变量生成附加提示词 } from '../prompts/runtime/openingVariableGenerationInit';

describe('opening task prompt', () => {
    it('requires AI-authored plot-specific opening tasks instead of fixed local templates', () => {
        expect(开场初始化任务提示词).toContain('不得复用固定任务名');
        expect(开场初始化任务提示词).toContain('问道初途');
        expect(开场初始化任务提示词).toContain('守住第一夜');
        expect(开场初始化任务提示词).toContain('站稳第一步');
        expect(开局变量生成附加提示词).toContain('任务必须根据第0回合正文');
        expect(开局变量生成附加提示词).toContain('不得复用固定任务名');
    });
});
