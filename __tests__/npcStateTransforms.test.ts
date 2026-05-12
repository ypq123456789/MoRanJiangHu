import { describe, expect, it } from 'vitest';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';

describe('NPC old save compatibility', () => {
    it('repairs teammate combat caps, equipment and bag from legacy placeholders', () => {
        const [npc] = 规范化社交列表([
            {
                id: 'legacy_shen_ruoyan',
                姓名: '沈若嫣',
                性别: '女',
                身份: '青云山庄二小姐',
                境界: '开脉第二重',
                是否队友: true,
                当前血量: 0,
                最大血量: 1,
                当前精力: 72,
                最大精力: 1,
                当前内力: 15,
                最大内力: 1,
                攻击力: 0,
                防御力: 0,
                当前装备: {},
                背包: []
            }
        ], { 合并同名: false });

        expect(npc.最大血量).toBeGreaterThan(1);
        expect(npc.当前血量).toBe(npc.最大血量);
        expect(npc.最大精力).toBeGreaterThanOrEqual(72);
        expect(npc.最大内力).toBeGreaterThanOrEqual(15);
        expect(npc.攻击力).toBeGreaterThan(0);
        expect(npc.防御力).toBeGreaterThan(0);
        expect(npc.当前装备.主武器).not.toBe('无');
        expect(npc.当前装备.服装).not.toBe('无');
        expect(npc.背包.length).toBeGreaterThan(0);
    });

    it('replaces explanatory prose in NPC equipment slots with safe item names', () => {
        const [npc] = 规范化社交列表([
            {
                id: 'npc_bad_equipment_text',
                姓名: '林婉',
                性别: '女',
                身份: '青云门外门弟子',
                境界: '开脉第一重',
                当前装备: {
                    主武器: '根据她青云门外门弟子的身份，应该生成一柄轻便佩剑。',
                    服装: '服装：青云门外门弟子青衫；饰品：身份腰牌',
                    鞋履: '轻便布靴'
                },
                背包: []
            }
        ], { 合并同名: false });

        expect(npc.当前装备.主武器).toBe('青云佩剑');
        expect(npc.当前装备.服装).toBe('青云绣裙');
        expect(npc.当前装备.鞋履).toBe('轻便布靴');
        expect(npc.当前装备.主武器).not.toContain('根据');
        expect(npc.当前装备.服装).not.toContain('服装：');
    });
});
