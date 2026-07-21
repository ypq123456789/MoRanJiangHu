import { describe, expect, it } from 'vitest';
import { 合并去重背景, 合并去重天赋 } from '../utils/customNewGamePresets';

describe('customNewGamePresets merge', () => {
    it('合并背景时合并去重自带天赋', () => {
        const list = 合并去重背景([
            { 名称: '唯心剑修', 描述: 'd1', 效果: 'e1', 自带天赋: ['剑在心中'] },
            { 名称: '唯心剑修', 描述: 'd2', 效果: 'e2', 自带天赋: ['剑在心中', '人情练达'] },
            { 名称: '唯心剑修', 描述: 'd3', 效果: 'e3' }
        ] as any);
        expect(list).toHaveLength(1);
        expect(list[0].描述).toBe('d3');
        expect(list[0].自带天赋).toEqual(['剑在心中', '人情练达']);
    });

    it('合并天赋时禁止可见条目降级隐藏', () => {
        const list = 合并去重天赋([
            { 名称: '剑在心中', 描述: '隐', 效果: 'e', 隐藏: true, 叙事约束: '心剑' },
            { 名称: '剑在心中', 描述: '可见版', 效果: 'e2' }
        ] as any);
        expect(list).toHaveLength(1);
        expect(list[0].描述).toBe('可见版');
        expect(list[0].隐藏).toBe(true);
        expect(list[0].叙事约束).toBe('心剑');
    });
});
