import { describe, expect, it } from 'vitest';
import { 创建开场基础状态 } from '../hooks/useGame/storyState';
import { 修复开局伙伴社交列表 } from '../utils/openingCompanion';
import { 构建开局变量生成承接提示 } from '../prompts/runtime/openingVariableGenerationInit';
import { 从圣经初始化世界势力与社交 } from '../engine/storyV2/worldBibleGenerator';
import { 创建空白导演圣经 } from '../models/directorBible';

const 创建开局配置 = (name = '沈青萝') => ({
    题材模式: '武侠',
    初始关系模板: '青梅旧识',
    关系侧重: ['情缘'],
    开局切入偏好: '在途起手',
    开局生成门派: false,
    开局生成同门: false,
    初始伙伴: {
        enabled: true,
        姓名: name,
        性别: '女',
        年龄: 19,
        出生月: 3,
        出生日: 12,
        外貌: '青衣负剑，眉眼清冷。',
        性格: '谨慎但护短。',
        属性: {
            力量: 11,
            敏捷: 13,
            体质: 12,
            根骨: 14,
            悟性: 15,
            福源: 10
        },
        背景名称: '旧雨同舟',
        背景描述: '自幼与主角相识，一路同行。',
        背景效果: '更容易信任主角。',
        天赋列表: [
            { 名称: '听风辨意', 描述: '善察言观色。', 效果: '更容易发现伏笔。' }
        ],
        关系: '青梅竹马',
        备注: '玩家指定姓名必须保留。'
    },
    同人融合: {
        enabled: false,
        作品名: '',
        来源类型: '小说',
        融合强度: '轻度映射',
        保留原著角色: true,
        启用角色替换: false,
        替换目标角色名: '',
        附加替换角色名列表: [],
        附加角色替换规则列表: [],
        启用附加小说: false,
        附加小说数据集ID: ''
    }
} as any);

describe('开局伙伴姓名保护', () => {
    it('V2 世界注册只将已启用的具名伙伴编入队伍，保留导演的叙事关系', () => {
        const config = 创建开局配置('沈青萝');
        config.初始伙伴列表 = [
            config.初始伙伴, { ...config.初始伙伴, 姓名: '阿棠' },
            { ...config.初始伙伴, 姓名: '有名的看客', enabled: false }
        ];
        const bible = 创建空白导演圣经();
        bible.核心卡司 = ['有名的看客', '沈青萝', '阿棠', '已登场掌柜'].map((name, index) => ({
            id: 'CAST-' + index, 姓名: name, 是否已登场: true,
            人际渊源: [{ 对象: '陆青', 真实关系与心思: '愿意协助寻回家书，暗地里留意主角行踪。' }]
        })) as any;
        const { initialSocial } = 从圣经初始化世界势力与社交(bible, [], config, { 姓名: '陆青' } as any);
        expect(initialSocial.map(entry => entry.姓名)).toEqual(['沈青萝', '阿棠']);
        expect(initialSocial.filter((entry: any) => entry.是否队友).map((entry) => entry.姓名)).toEqual(['沈青萝', '阿棠']);
        expect(initialSocial.find((entry) => entry.姓名 === '沈青萝')).toMatchObject({
            来源: '开局伙伴', 是否队友: true, 是否在场: true, 关系: '愿意协助寻回家书，暗地里留意主角行踪。'
        });
    });
    it('开场基态不会将主角撇号变体作为伙伴，且不会删除正常空格差异', () => {
        const same = 创建开场基础状态({ 姓名: "O'Connor" } as any, {} as any, 创建开局配置('O’Connor'));
        expect(same.社交).toEqual([]);
        const different = 创建开场基础状态({ 姓名: 'Emily Carter' } as any, {} as any, 创建开局配置('EmilyCarter'));
        expect(different.社交.map(npc => npc.姓名)).toEqual(['EmilyCarter']);
    });
    it('开场基础状态会直接创建玩家指定姓名的伙伴', () => {
        const openingConfig = 创建开局配置('沈青萝');
        const base = 创建开场基础状态(
            { 姓名: '陆行舟', 当前地点: '青石渡口' } as any,
            {} as any,
            openingConfig
        );

        expect(base.社交).toHaveLength(1);
        expect(base.社交[0].姓名).toBe('沈青萝');
        expect(base.社交[0].是否队友).toBe(true);
        expect(base.社交[0].是否主要角色).toBe(true);
        expect(base.社交[0].关系状态).toBe('青梅竹马');
    });

    it('开局伙伴建档会清理重复句号并保留预设头像立绘', () => {
        const openingConfig = 创建开局配置('俞月荷');
        openingConfig.初始伙伴.外貌 = '绝世大美女，眉眼清亮，衣着利落，随身带着惯用行囊。。';
        openingConfig.初始伙伴.性格 = '稳重可靠，重诺守信，遇事会主动提醒主角风险。。';
        openingConfig.初始伙伴.头像图片URL = 'https://image.example/avatar.png';
        openingConfig.初始伙伴.图片档案 = {
            已选头像图片ID: 'avatar',
            已选立绘图片ID: 'portrait',
            生图历史: [
                { id: 'avatar', 构图: '头像', 状态: 'success', 本地路径: 'https://image.example/avatar.png' },
                { id: 'portrait', 构图: '全身立绘', 状态: 'success', 本地路径: 'https://image.example/portrait.png' }
            ]
        };

        const base = 创建开场基础状态(
            { 姓名: '陆行舟', 当前地点: '青石渡口' } as any,
            {} as any,
            openingConfig
        );

        const partner = base.社交[0] as any;
        expect(partner.姓名).toBe('俞月荷');
        expect(JSON.stringify(partner)).not.toContain('。。');
        expect(partner.头像图片URL).toBe('https://image.example/avatar.png');
        expect(partner.图片档案?.已选头像图片ID).toBe('avatar');
        expect(partner.图片档案?.已选立绘图片ID).toBe('portrait');
    });

    it('AI 误生成同伴姓名时会合并回玩家指定姓名并保留曾用名', () => {
        const openingConfig = 创建开局配置('沈青萝');
        const fixed = 修复开局伙伴社交列表([
            {
                id: 'npc_ai_wrong_name',
                姓名: '苏婉儿',
                性别: '女',
                年龄: 19,
                生日: '3月12日',
                身份: '青梅竹马',
                是否在场: true,
                是否队友: true,
                是否主要角色: true,
                好感度: 70,
                关系状态: '青梅竹马',
                简介: '主角的青梅竹马，随行同伴。',
                记忆: []
            }
        ], openingConfig, { 姓名: '陆行舟' } as any);

        expect(fixed).toHaveLength(1);
        expect(fixed[0].姓名).toBe('沈青萝');
        expect(fixed[0].曾用名).toContain('苏婉儿');
        expect(fixed[0].是否队友).toBe(true);
        expect(fixed[0].是否主要角色).toBe(true);
    });

    it('变量生成同时保留本地同伴和 AI 同名同伴时只落一条档案', () => {
        const openingConfig = 创建开局配置('俞月荷');
        const fixed = 修复开局伙伴社交列表([
            {
                id: 'npc_opening_partner_seed',
                姓名: '俞月荷',
                性别: '女',
                年龄: 19,
                生日: '3月12日',
                身份: '青梅竹马',
                是否队友: true,
                是否主要角色: true,
                关系状态: '青梅竹马'
            },
            {
                id: 'npc_ai_same_name',
                姓名: '俞月荷',
                性别: '女',
                年龄: 19,
                生日: '3月12日',
                身份: '自幼相识的同行伙伴',
                是否在场: true,
                是否队友: true,
                是否主要角色: true,
                关系状态: '青梅竹马',
                简介: '俞月荷是主角自幼相识的同行伙伴。'
            }
        ], openingConfig, { 姓名: '杨培强' } as any);

        expect(fixed.filter((npc: any) => npc.姓名 === '俞月荷')).toHaveLength(1);
        expect(fixed).toHaveLength(1);
        expect(fixed[0].是否队友).toBe(true);
        expect(fixed[0].是否主要角色).toBe(true);
    });

    it('多伙伴画像相近时不会把 AI 生成的陌生同伴反复合并到第一个伙伴', () => {
        const openingConfig = 创建开局配置('林清澜');
        openingConfig.初始伙伴列表 = [
            {
                ...openingConfig.初始伙伴,
                姓名: '林清澜',
                关系: '同门伙伴',
                外貌: '青衣负剑。'
            },
            {
                ...openingConfig.初始伙伴,
                姓名: '俞月荷',
                关系: '同门伙伴',
                外貌: '白裙佩刀。'
            }
        ];
        openingConfig.初始伙伴 = openingConfig.初始伙伴列表[0];

        const fixed = 修复开局伙伴社交列表([
            {
                id: 'npc_ai_wrong_name_1',
                姓名: '苏婉儿',
                性别: '女',
                年龄: 19,
                生日: '3月12日',
                身份: '同门伙伴',
                是否在场: true,
                是否队友: true,
                是否主要角色: true,
                好感度: 88,
                关系状态: '同门伙伴',
                简介: '第一段 AI 生成的同门伙伴资料。'
            },
            {
                id: 'npc_ai_wrong_name_2',
                姓名: '柳若雪',
                性别: '女',
                年龄: 19,
                生日: '3月12日',
                身份: '同门伙伴',
                是否在场: true,
                是否队友: true,
                是否主要角色: true,
                好感度: 66,
                关系状态: '同门伙伴',
                简介: '第二段 AI 生成的同门伙伴资料。'
            }
        ], openingConfig, { 姓名: '陆行舟' } as any);

        const lin = fixed.find((npc: any) => npc.姓名 === '林清澜');
        const yu = fixed.find((npc: any) => npc.姓名 === '俞月荷');
        expect(lin).toBeTruthy();
        expect(yu).toBeTruthy();
        expect(lin?.简介).toContain('青衣负剑');
        expect(yu?.简介).toContain('白裙佩刀');
        expect(lin?.曾用名 || []).not.toContain('柳若雪');
        expect(yu?.曾用名 || []).not.toContain('苏婉儿');
        expect(fixed.filter((npc: any) => npc.姓名 === '林清澜')).toHaveLength(1);
        expect(fixed.filter((npc: any) => npc.姓名 === '俞月荷')).toHaveLength(1);
    });

    it('开局变量生成承接提示会携带同伴姓名硬约束', () => {
        const prompt = 构建开局变量生成承接提示({
            currentGameTime: '第0回合',
            openingRoleSetupText: '主角：陆行舟',
            openingPartnerSetupText: '【开局同伴建档信息】\n- 同伴姓名：沈青萝\n- 【姓名硬约束】该同伴的正式姓名只能是「沈青萝」',
            openingConfigText: '开局切入：在途起手'
        });

        expect(prompt).toContain('开局同伴建档承接信息');
        expect(prompt).toContain('沈青萝');
        expect(prompt).toContain('姓名硬约束');
    });
});
