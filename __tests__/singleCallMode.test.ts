import { describe, expect, it } from 'vitest';
import {
    构建省次数附加输出协议,
    提取省次数分节,
    过滤省次数流式草稿,
    type 省次数环节
} from '../utils/singleCallMode';
import {
    generatePolishedBody,
    generateVariableCalibrationUpdate,
    generateWorldEvolutionUpdate,
    generatePlanningAnalysis
} from '../services/ai/storyTasks';
import { parseStoryRawText } from '../services/ai/storyResponseParser';
import type { 当前可用接口结构 } from '../utils/apiConfig';

const 空接口 = { apiKey: '', baseUrl: '', model: '' } as 当前可用接口结构;

const 构造原始输出 = (分节: Partial<Record<省次数环节, string>>) => [
    '<正文>',
    '【旁白】雨停了。',
    '【李三】走吧。',
    '</正文>',
    '<命令>',
    'set 环境.天气 = 晴',
    '</命令>',
    '<省次数附加>',
    ...Object.entries(分节).map(([key, value]) => {
        const 标签: Record<string, string> = {
            polish: '润色正文',
            variable: '变量校准',
            world: '世界演变',
            planning: '规划分析',
            map: '地图更新'
        };
        return `<${标签[key]}>${value}</${标签[key]}>`;
    }),
    '</省次数附加>'
].join('\n');

describe('省次数模式 · 协议生成', () => {
    it('没有启用环节时不生成任何附加协议', () => {
        expect(构建省次数附加输出协议([])).toBe('');
    });

    it('只包含启用的环节，且要求附加块放在最后', () => {
        const 协议 = 构建省次数附加输出协议(['variable', 'map']);
        expect(协议).toContain('<变量校准>');
        expect(协议).toContain('<地图更新>');
        expect(协议).not.toContain('<润色正文>');
        expect(协议).not.toContain('<规划分析>');
        expect(协议).toContain('整个响应的最后一块');
    });
});

describe('省次数模式 · 分节提取', () => {
    it('拆出各环节原文，且不把分节命令混进主剧情', () => {
        const raw = 构造原始输出({
            polish: '<正文>【旁白】润色版。</正文>',
            variable: '<说明>\n- 气血变化\n</说明>\n<命令>\nset 角色.气血 = 80\n</命令>',
            map: 'set 世界.地图层级 = []'
        });
        const { storyText, sections } = 提取省次数分节(raw);

        expect(sections.polish).toContain('润色版');
        expect(sections.variable).toContain('set 角色.气血 = 80');
        expect(sections.map).toContain('世界.地图层级');
        expect(sections.world).toBeUndefined();
        expect(storyText).not.toContain('省次数附加');
        expect(storyText).not.toContain('set 角色.气血 = 80');

        const parsed = parseStoryRawText(storyText);
        expect(parsed.logs.length).toBe(2);
        expect(parsed.tavern_commands?.some(cmd => cmd.key === '环境.天气')).toBe(true);
    });

    it('外层包裹缺失时仍能按分节标签提取', () => {
        const raw = [
            '<正文>【旁白】正文。</正文>',
            '<变量校准><命令>set 角色.气血 = 70</命令></变量校准>'
        ].join('\n');
        const { storyText, sections } = 提取省次数分节(raw);
        expect(sections.variable).toContain('set 角色.气血 = 70');
        expect(storyText).toContain('【旁白】正文。');
        expect(storyText).not.toContain('变量校准');
    });

    it('外层包裹截断时不让半截协议污染正文解析', () => {
        const raw = '<正文>【旁白】正文。</正文>\n<省次数附加>\n<变量校准><命令>set 角色.气血 = 60';
        const { storyText, sections } = 提取省次数分节(raw);
        expect(storyText).not.toContain('省次数附加');
        // 未闭合的分节不采纳，交给调用方降级回独立请求，避免应用半截命令。
        expect(sections.variable).toBeUndefined();
    });

    it('流式草稿只展示主剧情正文', () => {
        const raw = 构造原始输出({ variable: '<命令>set 角色.气血 = 80</命令>' });
        const visible = 过滤省次数流式草稿(raw);
        expect(visible).toContain('雨停了');
        expect(visible).not.toContain('省次数附加');
        expect(visible).not.toContain('角色.气血');
    });
});

describe('省次数模式 · 预取结果直接复用', () => {
    it('润色阶段拿到预取文本时无需 API Key 也能解析', async () => {
        const result = await generatePolishedBody(
            '原文',
            '',
            空接口,
            undefined,
            undefined,
            undefined,
            undefined,
            '<正文>【旁白】润色后的正文。</正文>'
        );
        expect(result.bodyText).toContain('润色后的正文');
    });

    it('世界阶段拿到预取文本时无需 API Key 也能解析', async () => {
        const result = await generateWorldEvolutionUpdate(
            'worldContext',
            空接口,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            '<命令>\nset 世界.局势 = 动荡\n</命令>'
        );
        expect(result.commands.some(cmd => cmd.key === '世界.局势')).toBe(true);
    });

    it('规划阶段拿到预取文本时无需 API Key 也能解析', async () => {
        const result = await generatePlanningAnalysis(
            {
                playerName: '主角',
                currentStoryJson: '{}',
                currentHeroinePlanJson: '{}',
                worldJson: '{}',
                socialJson: '[]',
                envJson: '{}',
                recentBodiesText: '',
                auditFocusText: ''
            },
            空接口,
            undefined,
            undefined,
            '<说明>\n- 无需更新\n</说明>\n<命令>\n</命令>'
        );
        expect(result.shouldUpdate).toBe(false);
    });

    it('变量阶段拿到预取文本时无需 API Key 也能解析', async () => {
        const result = await generateVariableCalibrationUpdate(
            {
                stateJson: '{}',
                response: { logs: [{ sender: '旁白', text: '正文' }] } as any
            },
            空接口,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            '<说明>\n- 气血变化\n</说明>\n<命令>\nset 角色.气血 = 90\n</命令>'
        );
        expect(result.commands.some(cmd => cmd.key === '角色.气血')).toBe(true);
    });
});
