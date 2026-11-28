import { describe, expect, it } from 'vitest';
import { 构建变量模型任务提示词, 构建变量模型职责提示词 } from '../prompts/runtime/variableModel';

describe('variableModel prompts', () => {
    it('injects dialogue candidate guidance without forcing every speaker into long-term social records', () => {
        const prompt = 构建变量模型任务提示词({
            stateJson: '{}',
            response: {
                logs: [
                    { sender: '旁白', text: '院门外有人轻叩。' },
                    { sender: '护院1', text: '老爷吩咐过，闲人不得入内。' },
                    { sender: '杨青儿', text: '兄长，前厅来客了。' }
                ],
                tavern_commands: []
            } as any
        });

        expect(prompt).toContain('【本回合对白候选角色列表】');
        expect(prompt).toContain('候选1：护院1');
        expect(prompt).toContain('候选2：杨青儿');
        expect(prompt).toContain('仅提取了对白发送者');
        expect(prompt).toContain('正文点名的局外人仍需另外核查');
        expect(prompt).toContain('不是已经确认必须长期建档的正式 NPC');
    });

    it('tells the variable model to prefer story evidence for gender and only use ratio as a weak prior', () => {
        const systemPrompt = 构建变量模型职责提示词();

        expect(systemPrompt).toContain('其中 `性别` 必须优先由你根据正文和档案证据判断并显式写入');
        expect(systemPrompt).toContain('合法明确性别包含 `男/女/男娘/扶她`');
        expect(systemPrompt).toContain('不得把 `男娘`、`扶她` 或带有稳定对应设定的角色改写成 `女`');
        expect(systemPrompt).toContain('只有当正文、变量规划、已有社交档案和本回合命令合起来仍不足以判断时');
        expect(systemPrompt).toContain('你可以把这些配置当作最后一层弱先验来帮助裁决');
    });

    it('requires delta accounting for item inputs, outputs, and balances', () => {
        const systemPrompt = 构建变量模型职责提示词();

        expect(systemPrompt).toContain('输入物/输出物/余额');
        expect(systemPrompt).toContain('输入物离开背包时，对 `角色.物品列表[i]` 执行 `delete` 或 `sub 堆叠数量`');
        expect(systemPrompt).toContain('输出物进入背包时，对 `角色.物品列表` 执行 `push/add`');
        expect(systemPrompt).toContain('货币、贡献、信用、灵石等收支同步写入对应变量');
    });

    it('maps transaction and production facts to paired variable commands', () => {
        const systemPrompt = 构建变量模型职责提示词();

        expect(systemPrompt).toContain('卖出=扣原物+加收入');
        expect(systemPrompt).toContain('买入=扣货币+加物品');
        expect(systemPrompt).toContain('兑换=扣旧物+加新物');
        expect(systemPrompt).toContain('炼制/制作=扣材料+加成品');
        expect(systemPrompt).toContain('只写产出不扣输入');
    });

    it('keeps intimacy rules in their existing 16.1 and 16.2 slots', () => {
        const systemPrompt = 构建变量模型职责提示词();

        expect(systemPrompt).toContain('16.1 NSFW 模式下，主要女性/长期关系对象必须维护 `亲密边界档案`');
        expect(systemPrompt).toContain('16.2 正文或变量规划若确认发生亲密关系，变量命令必须能解释并落档“发生关系判定”');
    });
});
