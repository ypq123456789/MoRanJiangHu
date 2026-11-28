import { describe, expect, it } from 'vitest';
import { 核心_输出格式 } from '../prompts/core/format';
import { 获取开场初始化任务提示词 } from '../prompts/runtime/opening';

describe('正文对白分行提示', () => {
    it('主剧情模板将姓名说明置于台词示例外，示范角色先动作再开口', () => {
        const prompt = 核心_输出格式.内容;
        expect(prompt).not.toMatch(/`【[^】]+】台词[（(][^`\n]*`/u);
        expect(prompt).toMatch(/^【旁白】[^\n]*李秋雨[^\n]*压低声音[^\n]*\n【李秋雨】“[^”\n]+”$/mu);
    });

    it('开局任务要求括号动作另写旁白，沉默时只写旁白', () => {
        const prompt = 获取开场初始化任务提示词();
        expect(prompt).toMatch(/动作[^\n]*语气[^\n]*【旁白】/u);
        expect(prompt).toContain('没开口时只写旁白');
    });
});
