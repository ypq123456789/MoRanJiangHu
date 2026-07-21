import { describe, expect, it } from 'vitest';
import {
    规范化工坊天赋列表,
    规范化工坊背景列表,
    校验背景自带天赋引用,
    校验工坊背景天赋池,
    构建背景天赋池摘要行,
    解析工坊池JSON,
    从创意工坊模块提取背景天赋池
} from '../utils/workshopBackgroundTalentMeta';
import type { 创意工坊模块条目 } from '../data/creativeWorkshopModules';

describe('workshopBackgroundTalentMeta', () => {
    it('规范化保留隐藏与自带引用', () => {
        const talents = 规范化工坊天赋列表([
            { 名称: '剑在心中', 描述: 'd', 效果: 'e', 隐藏: true, 叙事约束: '心剑' },
            { 名称: '人情练达', 描述: 'd2', 效果: 'e2' }
        ]);
        const backgrounds = 规范化工坊背景列表([
            { 名称: '唯心剑修', 描述: 'bd', 效果: 'be', 自带天赋: ['剑在心中', ''] }
        ]);
        expect(talents.find((item) => item.名称 === '剑在心中')?.隐藏).toBe(true);
        expect(talents.find((item) => item.名称 === '剑在心中')?.叙事约束).toBe('心剑');
        expect(backgrounds[0].自带天赋).toEqual(['剑在心中']);
    });

    it('校验悬空自带引用', () => {
        const result = 校验工坊背景天赋池({
            backgrounds: [{ 名称: '唯心剑修', 描述: 'd', 效果: 'e', 自带天赋: ['剑在心中', '不存在'] }],
            talents: [{ 名称: '剑在心中', 描述: 'd', 效果: 'e', 隐藏: true }]
        });
        expect(result.ok).toBe(false);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].ref).toBe('不存在');
    });

    it('引用齐全时 ok', () => {
        const issues = 校验背景自带天赋引用(
            [{ 名称: 'A', 描述: 'd', 效果: 'e', 自带天赋: ['T1'] }],
            [{ 名称: 'T1', 描述: 'd', 效果: 'e', 隐藏: true }]
        );
        expect(issues).toEqual([]);
    });

    it('摘要包含隐藏与自带信息', () => {
        const lines = 构建背景天赋池摘要行({
            backgrounds: [{ 名称: '唯心剑修', 描述: 'd', 效果: 'e', 自带天赋: ['剑在心中'] }],
            talents: [
                { 名称: '剑在心中', 描述: 'd', 效果: 'e', 隐藏: true },
                { 名称: '人情练达', 描述: 'd', 效果: 'e' }
            ]
        });
        expect(lines.some((line) => line.includes('隐藏 1'))).toBe(true);
        expect(lines.some((line) => line.includes('自带:剑在心中'))).toBe(true);
        expect(lines.some((line) => line.includes('（隐藏）'))).toBe(true);
    });

    it('解析 JSON 数组与包装对象', () => {
        const a = 解析工坊池JSON('[{"名称":"T","描述":"d","效果":"e","隐藏":true}]', 'talents', 规范化工坊天赋列表);
        expect(a.items).toHaveLength(1);
        expect(a.items[0].隐藏).toBe(true);
        const b = 解析工坊池JSON('{"backgrounds":[{"名称":"B","描述":"d","效果":"e","自带天赋":["T"]}]}', 'backgrounds', 规范化工坊背景列表);
        expect(b.items[0].自带天赋).toEqual(['T']);
        const bad = 解析工坊池JSON('{', 'talents', 规范化工坊天赋列表);
        expect(bad.error).toBeTruthy();
    });

    it('从模块 payload 提取池', () => {
        const entry = {
            id: 'x',
            type: 'topic',
            title: 't',
            subtitle: 's',
            description: 'd',
            tags: [],
            payload: {
                backgrounds: [{ 名称: 'B', 描述: 'd', 效果: 'e', 自带天赋: ['H'] }],
                talents: [{ 名称: 'H', 描述: 'd', 效果: 'e', 隐藏: true }]
            }
        } as unknown as 创意工坊模块条目;
        const pool = 从创意工坊模块提取背景天赋池(entry);
        expect(pool.backgrounds[0].名称).toBe('B');
        expect(pool.talents[0].隐藏).toBe(true);
    });
});
