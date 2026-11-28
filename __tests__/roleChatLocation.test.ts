import { describe, expect, it } from 'vitest';
import { 判断角色对话位置, 角色对话确认键 } from '../utils/roleChatLocation';

const 环境 = { 大地点: '临安城', 中地点: '城南', 小地点: '仁心堂', 具体地点: '后院药房' };

describe('角色对话位置判定', () => {
    it('同一具体地点仍要求玩家确认真实交谈距离', () => {
        const result = 判断角色对话位置({ id: 'a', 姓名: '沈听澜', 是否在场: true, 当前位置: '后院药房' }, 环境);
        expect(result).toMatchObject({ 可选: true, 需要确认: true, 状态: 'nearby' });
    });

    it('只记录到上级地点时标记距离不确定，不擅自判断很近', () => {
        const result = 判断角色对话位置({ id: 'a', 姓名: '沈听澜', 是否在场: true, 当前位置: '临安城' }, 环境);
        expect(result).toMatchObject({ 可选: true, 需要确认: true, 状态: 'uncertain' });
    });

    it('在场者确实缺少位置时显示记录不足，并要求确认距离', () => {
        const result = 判断角色对话位置({ 姓名: '同场人物', 是否在场: true }, 环境);
        expect(result).toMatchObject({ 状态: 'uncertain', 可选: true, 需要确认: true, 地点摘要: '位置未记录' });
        expect(result.原因).toContain('记录不足');
    });

    it('明确位于另一具体地点时禁止直接聊天', () => {
        const result = 判断角色对话位置({ id: 'a', 姓名: '沈听澜', 是否在场: true, 位置路径: '临安城 > 城北 > 渡口' }, 环境);
        expect(result.可选).toBe(false);
        expect(result.原因).toContain('主行动接近');
    });

    it('不在场与死亡角色不能被确认绕过', () => {
        expect(判断角色对话位置({ 姓名: '甲', 是否在场: false }, 环境).可选).toBe(false);
        expect(判断角色对话位置({ 姓名: '乙', 是否在场: true, 是否死亡: true }, 环境).可选).toBe(false);
    });

    it('地点变化会改变确认键，使旧确认自动失效', () => {
        const npc = { id: 'a', 姓名: '沈听澜', 是否在场: true, 当前位置: '后院药房' };
        expect(角色对话确认键(npc, 环境)).not.toBe(角色对话确认键(npc, { ...环境, 具体地点: '前厅' }));
    });
});
