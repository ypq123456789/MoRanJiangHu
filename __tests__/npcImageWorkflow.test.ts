import { describe, expect, it, vi } from 'vitest';
import { 执行NPC生图工作流, 构建词组转化性别硬约束 } from '../hooks/useGame/npcImageWorkflow';

// 队列接续测试需要快速失败，跳过真实的重试等待（默认 3 次 + 1.2s/2.4s backoff）
vi.mock('../utils/imageGenerationRetry', () => ({
    生图最大自动重试次数: 0,
    执行生图模型调用带重试: (runner: () => Promise<unknown>) => runner()
}));

vi.mock('../services/ai/image', () => ({
    generateNpcImagePrompt: vi.fn(async () => ({ 原始描述: '{}', 生图词组: 'masterpiece, 1girl, inn background' })),
    buildNpcDirectImagePrompt: vi.fn(() => ({ 原始描述: '{}', 生图词组: 'masterpiece, 1girl, inn background' })),
    构建角色锚点注入提示词: vi.fn(() => ''),
    构建最终图片提示词: vi.fn((prompt: string) => ({
        前置正向提示词: '',
        主体正向提示词: prompt,
        后置正向提示词: '',
        最终正向提示词: prompt,
        最终负向提示词: 'lowres',
        带内联负面提示词的正向提示词: prompt,
        尺寸: '1024x1024',
        宽度: 1024,
        高度: 1024
    })),
    generateImageByPrompt: vi.fn(async () => ({ 图片URL: 'https://example.com/generated.png' })),
    persistImageAssetLocally: vi.fn(async (result: any) => result)
}));

const 构建NPC生图依赖 = (socialList: any[]) => {
    const 创建NPC生图任务 = vi.fn((params: any) => ({ id: 'task_1', ...params }));
    const 追加NPC生图任务 = vi.fn();
    return {
        deps: {
            apiConfig: {} as any,
            获取NPC唯一标识: (npc: any, index?: number) => {
                const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
                if (id) return `id:${id}`;
                const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
                if (name) return `name:${name}`;
                return `index:${index ?? -1}`;
            },
            获取社交列表: () => socialList,
            获取文生图接口配置: () => ({ 图片后端类型: 'openai', model: 'image-model' }) as any,
            获取生图词组转化器接口配置: () => null,
            获取生图画师串预设: () => null,
            获取当前PNG画风预设: () => null,
            获取NPC角色锚点: () => null,
            获取词组转化器预设提示词: () => '',
            接口配置是否可用: () => true,
            读取文生图功能配置: () => ({ 总开关: true, NPC开关: true, 使用词组转化器: false, NPC画风: '写实' }),
            NPC符合自动生图条件: () => true,
            NPC生图进行中集合: new Set<string>(),
            提取NPC生图基础数据: (npc: any) => npc,
            创建NPC生图任务,
            生成NPC生图记录ID: () => 'record_1',
            追加NPC生图任务,
            更新NPC生图任务: vi.fn(),
            更新NPC最近生图结果: vi.fn()
        },
        创建NPC生图任务,
        追加NPC生图任务
    };
};

describe('npc image workflow auto generation guard', () => {
    it('skips automatic generation when the latest social NPC already has a successful image', async () => {
        const staleNpc = { id: 'npc_su_wanqing', 姓名: '苏晚晴', 性别: '女' };
        const latestNpc = {
            ...staleNpc,
            图片档案: {
                最近生图结果: {
                    id: 'img_avatar_1',
                    状态: 'success',
                    构图: '头像',
                    图片URL: 'https://example.com/avatar.png'
                }
            }
        };
        const { deps, 创建NPC生图任务, 追加NPC生图任务 } = 构建NPC生图依赖([latestNpc]);

        await 执行NPC生图工作流(staleNpc, { 构图: '头像' }, deps as any);

        expect(创建NPC生图任务).not.toHaveBeenCalled();
        expect(追加NPC生图任务).not.toHaveBeenCalled();
        expect(deps.NPC生图进行中集合.size).toBe(0);
    });

    it('skips automatic generation when a name-key snapshot matches an id-backed NPC with a successful avatar', async () => {
        const staleNpc = { 姓名: '俞月荷', 性别: '女' };
        const latestNpc = {
            id: 'npc_yuyuehe',
            姓名: '俞月荷',
            性别: '女',
            图片档案: {
                最近生图结果: {
                    id: 'img_avatar_1',
                    状态: 'success',
                    构图: '头像',
                    图片URL: 'https://example.com/avatar.png'
                }
            }
        };
        const { deps, 创建NPC生图任务, 追加NPC生图任务 } = 构建NPC生图依赖([latestNpc]);

        await 执行NPC生图工作流(staleNpc, { 构图: '头像' }, deps as any);

        expect(创建NPC生图任务).not.toHaveBeenCalled();
        expect(追加NPC生图任务).not.toHaveBeenCalled();
        expect(deps.NPC生图进行中集合.size).toBe(0);
    });
});

describe('npc image workflow age constraints', () => {
    it('does not force cultivation longevity characters to look old', async () => {
        const constraint = 构建词组转化性别硬约束('女', 1000, {
            性别: '女',
            年龄: 1000,
            题材模式: '仙侠',
            境界层级: 24,
            身份: '元婴女修',
            境界: '元婴境',
            简介: '修行多年，驻颜有术，看起来依旧年轻。',
            外貌: '容貌清艳，神情沉静。'
        });

        expect(constraint).toContain('真实年龄只代表经历；外貌按成熟成年人描写');
        expect(constraint).toContain('不得仅因真实年龄称为老妇、老妪或老太婆');
        expect(constraint).not.toContain('85 years old');
    });

    it('uses four-base-gender constraints for femboy characters', async () => {
        const constraint = 构建词组转化性别硬约束('男娘', 22, {
            性别: '男娘',
            年龄: 22,
            身份: '戏班名伶',
            简介: '男身女相，台上常作闺秀装束。'
        });

        expect(constraint).toContain('输入资料中的性别是“男娘”');
        expect(constraint).toContain('不要改成普通壮汉');
        expect(constraint).toContain('femboy');
        expect(constraint).toContain('extremely feminine face');
        expect(constraint).toContain('youthful appearance');
    });

    it('keeps futanari defaults youthful and female-led', () => {
        const constraint = 构建词组转化性别硬约束('扶她', 28, {
            性别: '扶她',
            年龄: 28,
            身份: '女将军',
            简介: '英气逼人，却仍以美貌示人。'
        });

        expect(constraint).toContain('futanari');
        expect(constraint).toContain('youthful beautiful appearance');
        expect(constraint).toContain('heroic beauty');
        expect(constraint).toContain('女性主体');
        expect(constraint).toContain('日常默认不应主动露出');
    });
});

describe('npc image workflow young age prefix regression', () => {
    // 玩家反馈：18/20/32 岁年轻女性角色的提示词有时被加上 elderly appearance, aged face。
    // 根因：首次判定 young_adult 生成“不得仅因真实年龄称为老妇、老妪或老太婆”约束，
    // 二次判断把约束放回人物描述后，老态关键词匹配读到“老妇”却没识别“不得”，误入 elderly 分支。
    for (const 年龄 of [18, 20, 32]) {
        it(`keeps a ${年龄}-year-old female NPC young when the derived constraint is fed back`, () => {
            const baseData = {
                性别: '女',
                年龄,
                视觉年龄约束: '真实年龄只代表经历；外貌按青年成年人描写。；不得仅因真实年龄称为老妇、老妪或老太婆。',
                视觉年龄正向提示词: 'adult, young adult, youthful adult face'
            };
            const constraint = 构建词组转化性别硬约束('女', 年龄, baseData);

            // 正向区必须是青年/成熟成年，不能出现 elderly 分支的“elderly appearance, aged face”组合
            expect(constraint).toContain('开头必须包含：1woman, female, adult woman, feminine face, female body');
            expect(constraint).not.toContain('elderly appearance, aged face');
            expect(constraint).not.toContain('adult, elderly');
            // 约束原文仍会下发给词组转化器
            expect(constraint).toContain('不得仅因真实年龄称为老妇');
        });
    }

    it('uses the custom fixed gender prefix when configured', () => {
        const constraint = 构建词组转化性别硬约束('女', 20, { 性别: '女', 年龄: 20 }, '1woman, female, solo, woman');

        expect(constraint).toContain('1woman, female, solo, woman');
        expect(constraint).not.toContain('adult woman');
    });

    it('keeps built-in fixed gender prefix when no custom prefix is configured', () => {
        const constraint = 构建词组转化性别硬约束('女', 20, { 性别: '女', 年龄: 20 });

        expect(constraint).toContain('1woman, female, adult woman, feminine face, female body');
    });
});

describe('npc image workflow full-flow age prefix regression', () => {
    const 读取最后任务更新 = (deps: any) => {
        const 更新任务 = deps.更新NPC生图任务 as unknown as ReturnType<typeof vi.fn>;
        const 最后调用 = 更新任务.mock.calls.at(-1);
        expect(最后调用).toBeTruthy();
        return 最后调用![1]({ id: 'task_1', 状态: 'running' } as any);
    };

    it('never adds elderly prefix for a young female NPC through the whole workflow', async () => {
        const npc = {
            id: 'npc_young_female',
            姓名: '阿禾',
            性别: '女',
            年龄: 18,
            身份: '客栈侍女',
            外貌: '容貌清秀，眉眼灵动。',
            简介: '在客栈长大，性格伶俐。'
        };
        const { deps } = 构建NPC生图依赖([npc]);
        // 模拟真实链路：提取生图基础数据时首判 young_adult，产出含“老妇”字样的约束字段
        deps.提取NPC生图基础数据 = (source: any) => ({
            ...source,
            视觉年龄约束: '真实年龄只代表经历；外貌按青年成年人描写。；不得仅因真实年龄称为老妇、老妪或老太婆。',
            视觉年龄正向提示词: 'adult, young adult, youthful adult face'
        });

        await 执行NPC生图工作流(npc, { 构图: '头像', force: true }, deps as any);

        const 任务 = 读取最后任务更新(deps);
        expect(任务.状态).toBe('success');
        expect(任务.最终正向提示词).toContain('young adult');
        expect(任务.最终正向提示词).not.toContain('elderly appearance');
        expect(任务.最终正向提示词).not.toContain('aged face');
        expect(任务.性别固定前缀来源).toBe('default');
    });

    it('uses the configured custom fixed prefix through the whole workflow', async () => {
        const npc = { id: 'npc_young_female_2', 姓名: '阿菱', 性别: '女', 年龄: 20 };
        const { deps } = 构建NPC生图依赖([npc]);
        deps.apiConfig = {
            功能模型占位: {
                NPC生图固定前缀自定义_女: '1woman, female, solo focus'
            }
        } as any;

        await 执行NPC生图工作流(npc, { 构图: '头像', force: true }, deps as any);

        const 任务 = 读取最后任务更新(deps);
        expect(任务.最终正向提示词).toContain('1woman, female, solo focus');
        expect(任务.最终正向提示词).not.toContain('adult woman');
        expect(任务.性别固定前缀来源).toBe('custom');
    });
});

// 回归：v1.0.706 线上事故。NPC 生图队列用 `void` 接续下一项，
// 续跑任务撞上第三方渠道 402/403 时没有接收方，直接冒到 window.unhandledrejection，
// 被 index.html 的 preboot 误判成「应用启动失败」，整屏遮罩盖死游戏。
describe('npc image workflow queue continuation isolation', () => {
    it('never leaks a queue continuation failure as a global unhandled rejection', async () => {
        const imageService = await import('../services/ai/image');
        const generateMock = imageService.generateImageByPrompt as unknown as ReturnType<typeof vi.fn>;
        generateMock.mockRejectedValue(new Error('API Error: 403 - insufficient_credits'));

        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
        process.on('unhandledRejection', onUnhandled);

        const npcA = { id: 'npc_queue_a', 姓名: '甲', 性别: '女' };
        const npcB = { id: 'npc_queue_b', 姓名: '乙', 性别: '女' };
        const { deps } = 构建NPC生图依赖([npcA, npcB]);

        try {
            const first = 执行NPC生图工作流(npcA, { 构图: '头像', force: true }, deps as any);
            // 计数已被第一项占用 → 第二项走队列，等第一项结束后由 finally 接续
            await 执行NPC生图工作流(npcB, { 构图: '头像', force: true }, deps as any);
            await expect(first).rejects.toThrow();
            await new Promise((resolve) => setTimeout(resolve, 80));
            expect(unhandled).toHaveLength(0);
        } finally {
            process.off('unhandledRejection', onUnhandled);
            generateMock.mockReset();
        }
    });
});
