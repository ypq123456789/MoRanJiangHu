import { describe, expect, it } from 'vitest';
import { 修补开局角色姓名占位 } from '../utils/openingProtagonistName';

describe('开局场景主角姓名兜底（玩家反馈三）', () => {
    it('AI 返回空姓名时回填玩家开局命名', () => {
        const aiRole = { 姓名: '', 境界: '炼气' };
        const baseRole = { 姓名: '陆凡' };
        const changed = 修补开局角色姓名占位(aiRole, baseRole);
        expect(changed).toBe(true);
        expect(aiRole.姓名).toBe('陆凡');
    });

    it('AI 返回"未命名"时回填玩家开局命名', () => {
        const aiRole = { 姓名: '未命名' };
        const baseRole = { 姓名: '陆凡' };
        const changed = 修补开局角色姓名占位(aiRole, baseRole);
        expect(changed).toBe(true);
        expect(aiRole.姓名).toBe('陆凡');
    });

    it('AI 返回"未知角色"时回填玩家开局命名', () => {
        const aiRole = { 姓名: '未知角色' };
        const baseRole = { 姓名: '陆凡' };
        const changed = 修补开局角色姓名占位(aiRole, baseRole);
        expect(changed).toBe(true);
        expect(aiRole.姓名).toBe('陆凡');
    });

    it('AI 返回具体姓名时绝不覆盖', () => {
        const aiRole = { 姓名: '墨衣客' };
        const baseRole = { 姓名: '陆凡' };
        const changed = 修补开局角色姓名占位(aiRole, baseRole);
        expect(changed).toBe(false);
        expect(aiRole.姓名).toBe('墨衣客');
    });

    it('baseRole 为空 / 没有姓名时不动 AI 返回的角色', () => {
        const aiRole = { 姓名: '墨衣客' };
        expect(修补开局角色姓名占位(aiRole, null)).toBe(false);
        expect(aiRole.姓名).toBe('墨衣客');
        expect(修补开局角色姓名占位(aiRole, { 姓名: '' })).toBe(false);
        expect(aiRole.姓名).toBe('墨衣客');
    });

    it('AI 角色为 null 时返回 false 不报错', () => {
        expect(修补开局角色姓名占位(null as any, { 姓名: '陆凡' })).toBe(false);
    });

    it('小写/带空格占位符（unnamed / UNKNOWN /  未命名  ）同样回填', () => {
        const base = { 姓名: '陆凡' };
        expect(修补开局角色姓名占位({ 姓名: 'unnamed' }, base)).toBe(true);
        expect(修补开局角色姓名占位({ 姓名: 'UNKNOWN' }, base)).toBe(true);
        expect(修补开局角色姓名占位({ 姓名: '  未命名  ' }, base)).toBe(true);
    });
});
