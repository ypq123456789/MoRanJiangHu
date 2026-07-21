import { describe, expect, it } from 'vitest';
import {
    规范化工坊天赋列表,
    规范化工坊天赋列表详细,
    规范化工坊背景列表,
    规范化工坊背景列表详细,
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
        const detailed = 规范化工坊背景列表详细([
            { 名称: '唯心剑修', 描述: 'bd', 效果: 'be', 自带天赋: ['剑在心中', ''] }
        ]);
        expect(talents.find((item) => item.名称 === '剑在心中')?.隐藏).toBe(true);
        expect(talents.find((item) => item.名称 === '剑在心中')?.叙事约束).toBe('心剑');
        expect(detailed.items[0].自带天赋).toEqual(['剑在心中']);
        expect(detailed.issues.some((item) => item.kind === 'empty_name')).toBe(true);
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

    it('解析 JSON 数组与包装对象，透出规范化 issues', () => {
        const a = 解析工坊池JSON(
            '[{"名称":"T","描述":"d","效果":"e","隐藏":true}]',
            'talents',
            规范化工坊天赋列表详细
        );
        expect(a.items).toHaveLength(1);
        expect(a.items[0].隐藏).toBe(true);
        expect(a.issues).toEqual([]);

        const b = 解析工坊池JSON(
            '{"backgrounds":[{"名称":"B","描述":"d","效果":"e","自带天赋":["T",""]}]}',
            'backgrounds',
            规范化工坊背景列表详细
        );
        expect(b.items[0].自带天赋).toEqual(['T']);
        expect(b.issues.some((item) => item.kind === 'empty_name')).toBe(true);

        const invalid = 解析工坊池JSON(
            '[{"名称":"缺效果","描述":"d"},{"名称":"完整","描述":"d","效果":"e"}]',
            'talents',
            规范化工坊天赋列表详细
        );
        expect(invalid.items.map((item) => item.名称)).toEqual(['完整']);
        expect(invalid.issues.some((item) => item.kind === 'invalid_entry')).toBe(true);

        const bad = 解析工坊池JSON('{', 'talents', 规范化工坊天赋列表详细);
        expect(bad.items).toEqual([]);
        expect(bad.issues).toEqual([]);
        expect(bad.error).toMatch(/无法解析|括号|JSON/);
        expect(bad.rawError).toBeTruthy();
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

    it('丢弃缺字段条目时产生 invalid_entry', () => {
        const result = 校验工坊背景天赋池({
            backgrounds: [
                { 名称: '完整背景', 描述: 'd', 效果: 'e' },
                { 名称: '缺效果背景', 描述: 'd' }
            ],
            talents: [
                { 名称: '完整天赋', 描述: 'd', 效果: 'e' },
                { 名称: '缺描述', 效果: 'e' }
            ]
        });
        expect(result.backgrounds.map((item) => item.名称)).toEqual(['完整背景']);
        expect(result.talents.map((item) => item.名称)).toEqual(['完整天赋']);
        expect(result.issues.some((item) => item.kind === 'invalid_entry')).toBe(true);
        expect(result.ok).toBe(false);
    });

    it('背景扩展字段只保留合法形状', () => {
        const backgrounds = 规范化工坊背景列表([
            {
                名称: '带物资',
                描述: 'd',
                效果: 'e',
                初始物品: [{ 名称: '木剑', 数量: 1, 类型: '武器' }, { 数量: 2 }],
                开局货币: [{ 名称: '铜钱', 最小数量: 1, 最大数量: 5 }],
                多余字段: '应丢弃',
                自带天赋: ['T']
            }
        ]);
        expect(backgrounds).toHaveLength(1);
        expect(backgrounds[0].初始物品).toEqual([{ 名称: '木剑', 数量: 1, 类型: '武器' }]);
        expect(backgrounds[0].开局货币?.[0].名称).toBe('铜钱');
        expect((backgrounds[0] as any).多余字段).toBeUndefined();
        expect(backgrounds[0].自带天赋).toEqual(['T']);
    });

    it('重名条目记录 duplicate 诊断并保留最后一条', () => {
        const talentResult = 规范化工坊天赋列表详细([
            { 名称: '同名', 描述: '旧', 效果: '旧效', 隐藏: true },
            { 名称: '同名', 描述: '新', 效果: '新效' }
        ]);
        expect(talentResult.items).toHaveLength(1);
        expect(talentResult.items[0].描述).toBe('新');
        expect(talentResult.items[0].隐藏).toBeUndefined();
        expect(talentResult.issues.some((item) => item.reason === 'duplicate_name')).toBe(true);

        const bgResult = 规范化工坊背景列表详细([
            { 名称: '同背景', 描述: '旧', 效果: '旧', 自带天赋: ['A'] },
            { 名称: '同背景', 描述: '新', 效果: '新', 自带天赋: ['B'] }
        ]);
        expect(bgResult.items).toHaveLength(1);
        expect(bgResult.items[0].描述).toBe('新');
        expect(bgResult.items[0].自带天赋).toEqual(['B']);
        expect(bgResult.issues.some((item) => item.reason === 'duplicate_name')).toBe(true);
    });

    it('简版 normalize 仍可解析 JSON（issues 为空数组）', () => {
        const parsed = 解析工坊池JSON(
            '[{"名称":"T","描述":"d","效果":"e"}]',
            'talents',
            规范化工坊天赋列表
        );
        expect(parsed.items).toHaveLength(1);
        expect(parsed.issues).toEqual([]);
    });
});
