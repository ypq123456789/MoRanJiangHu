import { describe, expect, it, vi } from 'vitest';
import type { 天赋结构, 背景结构 } from '../types';
import {
    过滤可见天赋,
    过滤玩家可自选天赋,
    解析背景自带天赋,
    合并玩家与背景天赋,
    统计玩家自选天赋数量,
    更换背景后的天赋列表,
    是否背景自带天赋,
    是否允许玩家自选天赋
} from '../utils/backgroundTalentBinding';

const t = (partial: Partial<天赋结构> & Pick<天赋结构, '名称'>): 天赋结构 => ({
    名称: partial.名称,
    描述: partial.描述 || `${partial.名称}描述`,
    效果: partial.效果 || `${partial.名称}效果`,
    ...(partial.叙事约束 ? { 叙事约束: partial.叙事约束 } : {}),
    ...(partial.隐藏 ? { 隐藏: true } : {})
});

const bg = (partial: Partial<背景结构> & Pick<背景结构, '名称'>): 背景结构 => ({
    名称: partial.名称,
    描述: partial.描述 || `${partial.名称}描述`,
    效果: partial.效果 || `${partial.名称}效果`,
    ...(partial.自带天赋 ? { 自带天赋: partial.自带天赋 } : {})
});

describe('backgroundTalentBinding', () => {
    const 剑在心中 = t({ 名称: '剑在心中', 隐藏: true, 叙事约束: '心剑不灭' });
    const 人情练达 = t({ 名称: '人情练达' });
    const 药灵体 = t({ 名称: '药灵体' });
    const catalog = [剑在心中, 人情练达, 药灵体];

    it('过滤可见天赋时排除隐藏项', () => {
        expect(过滤可见天赋(catalog).map((item) => item.名称)).toEqual(['人情练达', '药灵体']);
    });

    it('过滤玩家可自选天赋与可见池一致', () => {
        expect(过滤玩家可自选天赋(catalog).map((item) => item.名称)).toEqual(['人情练达', '药灵体']);
        expect(是否允许玩家自选天赋(剑在心中)).toBe(false);
        expect(是否允许玩家自选天赋(人情练达)).toBe(true);
    });

    it('非隐藏天赋保持可见', () => {
        expect(过滤可见天赋([人情练达, 药灵体])).toHaveLength(2);
    });

    it('背景引用可 resolve 隐藏天赋', () => {
        const background = bg({ 名称: '唯心剑修', 自带天赋: ['剑在心中'] });
        const resolved = 解析背景自带天赋(background, catalog);
        expect(resolved).toHaveLength(1);
        expect(resolved[0].名称).toBe('剑在心中');
        expect(resolved[0].隐藏).toBe(true);
    });

    it('引用不存在时跳过且不抛错，并回调 onMiss', () => {
        const background = bg({ 名称: '测试', 自带天赋: ['不存在的天赋', '人情练达'] });
        const onMiss = vi.fn();
        const resolved = 解析背景自带天赋(background, catalog, { onMiss });
        expect(resolved.map((item) => item.名称)).toEqual(['人情练达']);
        expect(onMiss).toHaveBeenCalledWith({
            backgroundName: '测试',
            missing: ['不存在的天赋'],
            catalogSize: 3
        });
    });

    it('合并时 onMiss 透传', () => {
        const background = bg({ 名称: '唯心剑修', 自带天赋: ['剑在心中', '不存在'] });
        const onMiss = vi.fn();
        const merged = 合并玩家与背景天赋({
            玩家自选: [人情练达],
            背景: background,
            天赋目录: catalog,
            onMiss
        });
        expect(merged.map((item) => item.名称)).toEqual(['人情练达', '剑在心中']);
        expect(onMiss).toHaveBeenCalledWith({
            backgroundName: '唯心剑修',
            missing: ['不存在'],
            catalogSize: 3
        });
    });

    it('玩家自选与背景自带叠加且同名去重', () => {
        const background = bg({ 名称: '唯心剑修', 自带天赋: ['剑在心中', '人情练达'] });
        const merged = 合并玩家与背景天赋({
            玩家自选: [人情练达, 药灵体],
            背景: background,
            天赋目录: catalog
        });
        expect(merged.map((item) => item.名称)).toEqual(['人情练达', '药灵体', '剑在心中']);
    });

    it('自带不计入玩家自选数量上限统计', () => {
        expect(统计玩家自选天赋数量([人情练达, 药灵体])).toBe(2);
        expect(统计玩家自选天赋数量([])).toBe(0);
    });

    it('无自带字段的旧背景兼容', () => {
        const background = bg({ 名称: '寒门子弟' });
        expect(解析背景自带天赋(background, catalog)).toEqual([]);
        expect(合并玩家与背景天赋({
            玩家自选: [人情练达],
            背景: background,
            天赋目录: catalog
        }).map((item) => item.名称)).toEqual(['人情练达']);
    });

    it('换背景：旧自带从最终列表消失，新自带出现，玩家自选保留', () => {
        const 旧背景 = bg({ 名称: '唯心剑修', 自带天赋: ['剑在心中'] });
        const 新背景2 = bg({ 名称: '宗门旧徒', 自带天赋: ['药灵体'] });

        const step1 = 更换背景后的天赋列表({
            旧背景,
            新背景: 新背景2,
            玩家自选: [人情练达, 剑在心中],
            天赋目录: catalog
        });
        // 玩家自选层会剥离隐藏项
        expect(step1.玩家自选.map((item) => item.名称)).toEqual(['人情练达']);
        expect(step1.最终列表.map((item) => item.名称)).toEqual(['人情练达', '药灵体']);
        expect(step1.最终列表.some((item) => item.名称 === '剑在心中')).toBe(false);
    });

    it('是否背景自带天赋用于内部护栏', () => {
        const background = bg({ 名称: '唯心剑修', 自带天赋: ['剑在心中'] });
        expect(是否背景自带天赋('剑在心中', background)).toBe(true);
        expect(是否背景自带天赋('人情练达', background)).toBe(false);
    });
});
