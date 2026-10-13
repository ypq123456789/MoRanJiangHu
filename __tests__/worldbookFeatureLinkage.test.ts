import { describe, expect, it } from 'vitest';
import {
    世界书条目是否生效,
    过滤世界书条目,
    按功能开关过滤世界书,
    统计被联动隐藏的条目
} from '../utils/worldbookFeatureLinkage';
import { 从模式世界书提取提示词 } from '../data/creativeWorkshopModules';
import { 扁平化世界书条目, 规范化世界书列表, 选择生效世界书条目, 构建世界书注入文本 } from '../utils/worldbook';
import type { 世界书结构, 世界书条目结构 } from '../types';

const 造条目 = (over: Partial<世界书条目结构>): 世界书条目结构 => ({
    id: over.id || 'e1',
    标题: over.标题 || '默认条目',
    内容: over.内容 || '内容',
    类型: over.类型 || 'world_lore',
    作用域: over.作用域 || ['all'],
    注入模式: 'always',
    ...over
});

const 造书 = (条目: 世界书条目结构[]): 世界书结构 => ({
    id: 'b1',
    标题: '测试书',
    条目
});

describe('世界书条目开关联动', () => {
    it('无功能模块标记的条目始终生效', () => {
        const 条目 = 造条目({ 功能模块: undefined });
        expect(世界书条目是否生效(条目, { 启用修炼体系: false })).toBe(true);
    });

    it('关闭修炼时 cultivation 条目不生效', () => {
        const 条目 = 造条目({ 功能模块: 'cultivation' });
        expect(世界书条目是否生效(条目, { 启用修炼体系: false })).toBe(false);
        expect(世界书条目是否生效(条目, { 启用修炼体系: true })).toBe(true);
    });

    it('启用修炼体系缺省时视为开启', () => {
        expect(世界书条目是否生效(造条目({ 功能模块: 'cultivation' }), undefined)).toBe(true);
        expect(世界书条目是否生效(造条目({ 功能模块: 'cultivation' }), {})).toBe(true);
    });

    it('条目自身禁用时永不生效（与模块判定正交）', () => {
        const 条目 = 造条目({ 功能模块: 'cultivation', 启用: false });
        expect(世界书条目是否生效(条目, { 启用修炼体系: true })).toBe(false);
    });

    it('未登记的功能模块值不导致条目静默消失', () => {
        const 条目 = 造条目({ 功能模块: 'typo_module' as any });
        expect(世界书条目是否生效(条目, { 启用修炼体系: false, 启用饱腹口渴系统: false })).toBe(true);
    });

    it('survival 模块跟随饱腹口渴开关', () => {
        const 条目 = 造条目({ 功能模块: 'survival' });
        expect(世界书条目是否生效(条目, { 启用饱腹口渴系统: false })).toBe(false);
        expect(世界书条目是否生效(条目, { 启用饱腹口渴系统: true })).toBe(true);
    });

    it('空条目对象不生效', () => {
        expect(世界书条目是否生效(null)).toBe(false);
        expect(世界书条目是否生效(undefined)).toBe(false);
    });
});

describe('世界书批量过滤', () => {
    const 书 = 造书([
        造条目({ id: 'a', 标题: '境界体系' }),
        造条目({ id: 'b', 标题: '地理设定', 功能模块: undefined }),
        造条目({ id: 'c', 标题: '内功心法', 功能模块: 'cultivation' })
    ]);

    it('过滤单书条目', () => {
        const 结果 = 过滤世界书条目(书, { 启用修炼体系: false });
        expect(结果.map((e) => e.id)).toEqual(['a', 'b']);
    });

    it('过滤书列表但保留书本身（不丢书）', () => {
        const 结果 = 按功能开关过滤世界书([书], { 启用修炼体系: false });
        expect(结果).toHaveLength(1);
        expect(结果[0].id).toBe('b1');
    });

    it('统计被联动隐藏的条目，供 UI 提示玩家', () => {
        const 隐藏 = 统计被联动隐藏的条目(书, { 启用修炼体系: false });
        expect(隐藏.map((e) => e.id)).toEqual(['c']);
    });

    it('全部条目被隐藏时仍返回空书而非丢书', () => {
        const 全修炼 = 造书([造条目({ id: 'x', 功能模块: 'cultivation' })]);
        const 结果 = 按功能开关过滤世界书([全修炼], { 启用修炼体系: false });
        expect(结果).toHaveLength(1);
        expect(结果[0].条目).toEqual([]);
    });
});

describe('世界书规范化保留功能模块', () => {
    it('规范化不得丢弃 功能模块 字段', () => {
        const 规范 = 规范化世界书列表([造书([造条目({ id: 'k', 功能模块: 'cultivation' })])]);
        expect(规范[0].条目[0].功能模块).toBe('cultivation');
    });

    it('非法功能模块值归一为 undefined', () => {
        const 规范 = 规范化世界书列表([造书([造条目({ id: 'k', 功能模块: 'bogus' as any })])]);
        expect(规范[0].条目[0].功能模块).toBeUndefined();
    });

    it('扁平化时按开关过滤', () => {
        const 书列表 = [造书([
            造条目({ id: 'a', 标题: '地理' }),
            造条目({ id: 'c', 标题: '境界', 功能模块: 'cultivation' })
        ])];
        expect(扁平化世界书条目(书列表, { 启用修炼体系: false }).map((e) => e.id)).toEqual(['a']);
        expect(扁平化世界书条目(书列表, { 启用修炼体系: true })).toHaveLength(2);
    });
});

describe('模式世界书提取与修炼开关联动', () => {
    const 书 = [造书([
        造条目({ id: 'a', 标题: '地理设定', 类型: 'world_lore', 内容: '本世界地理' }),
        造条目({ id: 'b', 标题: '境界体系', 类型: 'system_rule', 内容: '练气到金丹' }),
        造条目({ id: 'c', 标题: '阵营规则', 类型: 'system_rule', 内容: '三方势力' })
    ])];

    it('修炼开启时按标题正则识别修炼类条目', () => {
        const 结果 = 从模式世界书提取提示词(书, { 启用修炼体系: true });
        expect(结果.manualRealmPrompt).toContain('境界体系');
        expect(结果.worldExtraRequirement).toContain('阵营规则');
    });

    it('修炼关闭时修炼类条目不进入任何输出', () => {
        const 结果 = 从模式世界书提取提示词(书, { 启用修炼体系: false });
        expect(结果.manualRealmPrompt).toBe('');
        expect(结果.worldExtraRequirement).not.toContain('境界体系');
        expect(结果.worldExtraRequirement).toContain('阵营规则');
    });

    it('显式 功能模块 标记优先于标题正则（标题不含关键字也归修炼类）', () => {
        const 标记书 = [造书([
            造条目({ id: 'm', 标题: '成长阶梯', 类型: 'system_rule', 功能模块: 'cultivation', 内容: '甲乙丙丁' })
        ])];
        const 结果 = 从模式世界书提取提示词(标记书, { 启用修炼体系: true });
        expect(结果.manualRealmPrompt).toContain('甲乙丙丁');
    });

    it('条目自身禁用时不参与提取', () => {
        const 禁用书 = [造书([造条目({ id: 'a', 标题: '地理设定', 启用: false })])];
        expect(从模式世界书提取提示词(禁用书, { 启用修炼体系: true }).manualWorldPrompt).toBe('');
    });

    it('缺省 config 时保持原有提取行为（向前兼容）', () => {
        const 结果 = 从模式世界书提取提示词(书);
        expect(结果.manualRealmPrompt).toContain('境界体系');
    });

    // Codex 指出：旧包把「境界体系」放在 world_lore 类型下，
    // 只过滤 ability/rules 分支会让它被原样写进开局世界观
    it('world_lore 类型的修炼条目在修炼关闭时也不进世界观', () => {
        const 旧包 = [造书([
            造条目({ id: 'a', 标题: '境界体系', 类型: 'world_lore', 内容: '练气到金丹' }),
            造条目({ id: 'b', 标题: '地理志', 类型: 'world_lore', 内容: '山川河流' })
        ])];
        const 结果 = 从模式世界书提取提示词(旧包, { 启用修炼体系: false });
        expect(结果.manualWorldPrompt).not.toContain('境界体系');
        expect(结果.manualWorldPrompt).toContain('地理志');
    });
});

describe('世界书注入链路必须收到 gameConfig', () => {
    // Codex/CodeRabbit 指出：选择生效世界书条目 是主注入入口，
    // 不传 gameConfig 时联动在真实对局中完全不生效
    const 书 = [{
        id: 'b1',
        标题: '联动书',
        启用: true,
        条目: [
            { id: 'a', 标题: '地理', 内容: '地理内容', 类型: 'world_lore' as const, 作用域: ['main' as const], 注入模式: 'always' as const },
            { id: 'c', 标题: '境界', 内容: '境界内容', 类型: 'system_rule' as const, 作用域: ['main' as const], 注入模式: 'always' as const, 功能模块: 'cultivation' as const }
        ]
    }];

    it('主注入入口按 gameConfig 过滤 cultivation 条目', () => {
        const 关闭 = 选择生效世界书条目({ books: 书, scopes: ['main'], gameConfig: { 启用修炼体系: false } });
        expect(关闭.map((e) => e.id)).toEqual(['a']);
        const 开启 = 选择生效世界书条目({ books: 书, scopes: ['main'], gameConfig: { 启用修炼体系: true } });
        expect(开启.map((e) => e.id)).toEqual(['a', 'c']);
    });

    it('不传 gameConfig 时保持原有行为（全部注入）', () => {
        expect(选择生效世界书条目({ books: 书, scopes: ['main'] }).map((e) => e.id)).toEqual(['a', 'c']);
    });

    it('构建世界书注入文本同样受 gameConfig 约束', () => {
        const 文本 = 构建世界书注入文本({ books: 书, scopes: ['main'], gameConfig: { 启用修炼体系: false } }).combinedText;
        expect(文本).not.toContain('境界内容');
        expect(文本).toContain('地理内容');
    });
});