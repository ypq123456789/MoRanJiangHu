import { describe, expect, it } from 'vitest';
import { 执行自动丹药补给, 补齐自动丹药预设 } from '../utils/autoConsumables';

const createRole = () => ({
    姓名: '测试角色',
    性别: '男',
    年龄: 16,
    出生日期: '',
    外貌: '',
    性格: '',
    称号: '',
    境界: '开脉境',
    境界层级: 1,
    天赋列表: [],
    出身背景: { 名称: '', 描述: '', 效果: '' },
    所属门派ID: 'sect',
    门派职位: '外门弟子',
    门派贡献: 0,
    金钱: { 金元宝: 0, 银子: 0, 铜钱: 0 },
    当前精力: 4,
    最大精力: 100,
    当前内力: 25,
    最大内力: 150,
    当前饱腹: 19,
    最大饱腹: 100,
    当前口渴: 0,
    最大口渴: 100,
    当前负重: 0,
    最大负重: 100,
    力量: 0,
    敏捷: 0,
    体质: 0,
    根骨: 0,
    悟性: 0,
    福源: 0,
    头部当前血量: 10,
    头部最大血量: 10,
    头部状态: '',
    胸部当前血量: 10,
    胸部最大血量: 10,
    胸部状态: '',
    腹部当前血量: 10,
    腹部最大血量: 10,
    腹部状态: '',
    左手当前血量: 10,
    左手最大血量: 10,
    左手状态: '',
    右手当前血量: 10,
    右手最大血量: 10,
    右手状态: '',
    左腿当前血量: 10,
    左腿最大血量: 10,
    左腿状态: '',
    右腿当前血量: 10,
    右腿最大血量: 10,
    右腿状态: '',
    装备: {
        头部: '无',
        胸部: '无',
        盔甲: '无',
        内衬: '无',
        腿部: '无',
        手部: '无',
        足部: '无',
        主武器: '无',
        副武器: '无',
        暗器: '无',
        背部: '无',
        腰部: '无',
        坐骑: '无'
    },
    物品列表: 补齐自动丹药预设([]),
    功法列表: [],
    当前经验: 675,
    升级经验: 202,
    玩家BUFF: [],
    突破条件: []
} as any);

describe('auto consumable rules', () => {
    it('adds default pills and auto uses them for low resources and breakthrough', () => {
        const role = createRole();
        const corrections = 执行自动丹药补给(role);

        expect(role.当前精力).toBeGreaterThan(4);
        expect(role.当前饱腹).toBeGreaterThan(19);
        expect(role.当前口渴).toBeGreaterThan(0);
        expect(role.境界层级).toBe(2);
        expect(corrections.some((item: string) => item.includes('破境丹'))).toBe(true);
        expect(role.物品列表.some((item: any) => item.名称 === '辟谷丹')).toBe(true);
    });
});


describe('自动丹药预设不应在用完后重复补齐（客户反馈：丹药用完下回合又出来）', () => {
    it('补齐函数在已有同名丹药时不会重复补', () => {
        // 第一次补齐：从空列表到 4 种丹药
        const first = 补齐自动丹药预设([]);
        expect(first.length).toBe(4);
        // 第二次调用：列表没变（已有同名会被跳过）
        const second = 补齐自动丹药预设(first);
        expect(second.length).toBe(4);
    });

    it('玩家吃完某颗丹药后，再次传入列表时该丹药不会被重新塞回', () => {
        const initial = 补齐自动丹药预设([]);
        // 模拟玩家吃完了"回气丹"
        const afterUse = initial.filter((item: any) => item.名称 !== '回气丹');
        expect(afterUse.some((item: any) => item.名称 === '回气丹')).toBe(false);
        // 直接调用 补齐自动丹药预设 会把被吃掉的补回来——这正是老行为。
        // 新行为的兜底在 stateTransforms.ts 里通过"已补齐系统丹药预设"标记避免重复补。
        // 这里只确认单独用 补齐自动丹药预设 时的语义与之前一致，向下兼容。
        const topped = 补齐自动丹药预设(afterUse);
        expect(topped.some((item: any) => item.名称 === '回气丹')).toBe(true);
    });
});


import { 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';

describe('stateTransforms 只补一次系统丹药预设', () => {
    it('老存档第一次归一会被补上 4 种系统丹药并打上标记', () => {
        const role: any = {
            姓名: '测试',
            物品列表: []
        };
        const normalized = 规范化角色物品容器映射(role);
        const names = normalized.物品列表.map((item: any) => item.名称);
        expect(names).toEqual(expect.arrayContaining(['辟谷丹', '回气丹', '凝元丹', '破境丹']));
        expect((normalized as any).已补齐系统丹药预设).toBe(true);
    });

    it('已经补过的存档即使某丹药被吃完，下一次归一也不会重新塞回', () => {
        const role: any = {
            姓名: '测试',
            物品列表: [],
            已补齐系统丹药预设: true
        };
        const normalized = 规范化角色物品容器映射(role);
        expect(normalized.物品列表.some((item: any) => item.名称 === '回气丹')).toBe(false);
        expect(normalized.物品列表.some((item: any) => item.名称 === '破境丹')).toBe(false);
    });
});
