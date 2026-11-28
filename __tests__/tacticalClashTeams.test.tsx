// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TacticalClashModal from '../components/features/Chat/TacticalClashModal';
import { 创建阵营交锋会话, 推演阵营交锋一拍, 构建场外战果注入块, 构建战术交锋阵容, 选定交锋对手 } from '../engine/plugins/clashPlugin';
import { 清洗导入存档 } from '../services/dbService';
import type { NPC结构, 战斗状态结构, 角色数据结构 } from '../types';

afterEach(cleanup);
const role = { 姓名: '玩家', 境界层级: 2, 当前精力: 50, 当前内力: 0 } as 角色数据结构;
const env = { 具体地点: '渡口' };
const npc = (姓名: string, fields: Partial<NPC结构> = {}): NPC结构 => ({
    id: 姓名, 姓名, 是否在场: true, 当前位置: '渡口', ...fields
} as NPC结构);
const companion = npc('同行剑客', { 是否队友: true, 关系状态: '旧日死敌' });
const neutral = npc('摆渡人');
const hostile = npc('敌将', { 关系状态: '敌对' });
const secondHostile = npc('追兵', { 关系: '死敌' } as Partial<NPC结构>);
const props = (social: NPC结构[]) => ({
    open: true, loading: false, role, env, social,
    pendingClashes: [], onCommitClash: vi.fn(), onClearClashes: vi.fn(), onClose: vi.fn()
});
const click = (name: RegExp | string) => {
    const confirm = screen.queryByRole('button', { name: /确认.*在交手距离内/ });
    if (name instanceof RegExp && confirm) fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name }));
};

describe('战术交锋的实际出招入口', () => {
    it('距离不明和同在附近均须确认，切换目标和地点后重新确认', () => {
        const inputs = props([hostile, npc('追兵', { 关系状态: '死敌', 当前位置: '云州' })]);
        const { rerender } = render(<TacticalClashModal {...inputs} env={{ 大地点: '云州', ...env }} />);
        const move = () => screen.getByRole<HTMLButtonElement>('button', { name: /卸力借势/ });
        expect(move().disabled).toBe(true);
        fireEvent.click(move());
        expect(screen.queryByLabelText('出招拆解实录')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /确认敌将在交手距离内/ }));
        expect(move().disabled).toBe(false);
        const target = screen.getByRole('combobox', { name: '当前交锋目标' });
        fireEvent.change(target, { target: { value: 'npc:追兵' } });
        expect(move().disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /确认追兵在交手距离内/ }));
        expect(move().disabled).toBe(false);
        rerender(<TacticalClashModal {...inputs} env={{ 大地点: '云州', 具体地点: '东门' }} />);
        expect(move().disabled).toBe(true);
    });

    it('旧战斗生命归零排除切磋与己方，明确离队优先于关系和来源', () => {
        const roster = 构建战术交锋阵容(role, [
            npc('败将', { 曾用名: ['旧名'], 是否队友: true }), npc('退队', { 是否队友: false, 来源: '开局伙伴', 关系状态: '同行伙伴' })
        ], env, { 是否战斗中: true, 敌方: [{ 名字: '旧名', 当前血量: 0 }] } as 战斗状态结构);
        expect(roster.allies.map(f => f.profile.name)).toEqual(['玩家']);
        expect(roster.sparringPartners.map(f => f.profile.name)).toEqual(['退队']);
    });

    it('主招击破唯一目标后支援停手，其余支援只扣目标实有余势', () => {
        const build = (extra: NPC结构[]) => 创建阵营交锋会话(构建战术交锋阵容(role, [companion, hostile, ...extra], env), '生死交锋')!;
        const only = build([]);
        only.enemyPosture = only.enemies[0].posture = 1;
        expect(推演阵营交锋一拍(only, 'deflect', false).logs[0].summary).not.toContain('同行剑客牵制敌将');
        const several = build([secondHostile, npc('另一同伴', { 是否队友: true })]);
        several.enemies[1].posture = 2;
        const result = 推演阵营交锋一拍(several, 'deflect', false);
        expect(result.logs[0].summary).toContain('同行剑客牵制追兵（架势 -2%）');
        expect(result.logs[0].summary).toContain('另一同伴牵制敌将');
    });
    it('独处或仅有同伴和旁观者时不开战，明确指定同伴才进行单人切磋', () => {
        const inputs = { ...props([companion, neutral]), role: { ...role, 当前精力: 3 } };
        const { rerender } = render(<TacticalClashModal {...inputs} />);
        expect(screen.queryByRole('button', { name: /强攻压招/ })).toBeNull();
        expect(screen.getByLabelText('己方阵容').textContent).toContain(companion.姓名);
        click('切磋试探');
        expect(screen.queryByRole('button', { name: /强攻压招/ })).toBeNull();
        const choose = screen.getByRole('combobox', { name: '切磋对象' });
        fireEvent.change(choose, { target: { value: within(choose).getByRole<HTMLOptionElement>('option', { name: /同行剑客/ }).value } });
        expect(screen.getByLabelText('己方阵容').textContent).not.toContain(companion.姓名);
        click(/卸力借势/);
        click(/借势脱身/);
        click('结算体力并写入主剧情');
        const { record, nextRole } = inputs.onCommitClash.mock.calls[0][0];
        expect(record.模式).toBe('切磋试探');
        expect(record.敌方阵容).toEqual([companion.姓名]);
        expect(nextRole.当前内力).toBe(0);
        expect(nextRole.当前精力).toBe(3);
        expect(record.主角伤势消耗描述).toContain('精力-0');
        rerender(<TacticalClashModal {...inputs} social={[]} />);
        expect(screen.queryByRole('button', { name: /强攻压招/ })).toBeNull();
    });

    it('双方多人逐拍互攻，换目标保留架势，战果存档往返后仍写清敌我', () => {
        const inputs = props([companion, neutral, hostile, secondHostile,
            npc('离场敌人', { 关系状态: '死敌', 是否在场: false }),
            npc('异地同伴', { 是否队友: true, 当前位置: '山顶' })]);
        render(<TacticalClashModal {...inputs} />);
        const allies = screen.getByLabelText('己方阵容');
        const enemies = screen.getByLabelText('敌方阵容');
        expect(allies.textContent).toContain(companion.姓名);
        expect(allies.textContent).not.toContain('异地同伴');
        expect(enemies.textContent).not.toMatch(/同行剑客|摆渡人|离场敌人/);
        expect(enemies.textContent).toContain(hostile.姓名);
        expect(enemies.textContent).toContain(secondHostile.姓名);
        click(/卸力借势/);
        const firstBeat = screen.getByLabelText('出招拆解实录').textContent!;
        for (const name of [companion.姓名, hostile.姓名, secondHostile.姓名]) expect(firstBeat).toContain(name);
        const target = screen.getByRole('combobox', { name: '当前交锋目标' });
        fireEvent.change(target, { target: { value: within(target).getByRole<HTMLOptionElement>('option', { name: /追兵/ }).value } });
        expect(screen.getByLabelText('出招拆解实录').textContent).toBe(firstBeat);
        click(/强攻压招/);
        expect(screen.getByLabelText('出招拆解实录').textContent).toContain('第 2 拍');
        click(/借势脱身/);
        click('结算体力并写入主剧情');
        expect(inputs.onCommitClash).toHaveBeenCalledTimes(1);
        const { record } = inputs.onCommitClash.mock.calls[0][0];
        expect(record.己方阵容).toEqual([role.姓名, companion.姓名]);
        expect(record.敌方阵容).toEqual([hostile.姓名, secondHostile.姓名]);
        const loaded = 清洗导入存档({ 角色数据: role, 环境信息: env, 社交: inputs.social, 历史记录: [], 场外战果暂存: [record] });
        const prompt = 构建场外战果注入块(loaded?.场外战果暂存);
        expect(prompt).toContain('己方「玩家、同行剑客」');
        expect(prompt).toContain('敌方「敌将、追兵」');
    });

    it('旧战斗名单排除同伴和化名、退场者，合并同时有社交档案的敌人', () => {
        const battle = { 是否战斗中: true, 敌方: [
            { 名字: '同行剑客', 当前血量: 10 }, { 名字: '青衣客', 当前血量: 10 },
            { 名字: '阵前校尉', 当前血量: 50 }, { 名字: '阵前校尉', 当前血量: 50 },
            { 名字: '援兵', 当前血量: 20 }, { 名字: '败将', 当前血量: 0 }
        ] } as 战斗状态结构;
        const roster = 构建战术交锋阵容(role, [
            { ...companion, 叙事名称: '青衣客' }, npc('阵前校尉'), npc('败将', { 关系状态: '仇敌' }),
            npc('新伙伴', { 关系: '同行伙伴' } as Partial<NPC结构>), npc('路人', { 关系状态: '非敌对' })
        ], env, battle);
        expect(roster.allies.map((fighter) => fighter.profile.name)).toEqual(['玩家', '同行剑客', '新伙伴']);
        expect(roster.enemies.map((fighter) => fighter.profile.name)).toEqual(['阵前校尉', '援兵']);
    });

    it('首名敌人被击破后自动转移目标并继续，己方尚有同伴时仍可接战', () => {
        const roster = 构建战术交锋阵容(role, [companion, hostile, secondHostile], env);
        const start = 创建阵营交锋会话(roster, '生死交锋')!;
        expect(选定交锋对手(start, roster.allies[1].key)).toBe(start);
        let fight = start;
        let switchedTarget = false;
        for (let step = 0; step < 25 && !fight.finished; step++) {
            const move = fight.predictedEnemyBias === 'press' ? 'deflect' : fight.predictedEnemyBias === 'feint' ? 'press' : 'feint';
            const next = 推演阵营交锋一拍(fight, move, false);
            if (!next.enemies[0].posture && next.enemies[1].posture > 0) {
                expect(next.finished).toBe(false);
                expect(next.targetKey).toBe(next.enemies[1].key);
                switchedTarget = true;
            }
            fight = next;
        }
        expect(fight.outcome).toBe('胜出');
        expect(switchedTarget).toBe(true);
        expect(fight.enemies.every((fighter) => fighter.posture === 0)).toBe(true);
        expect(roster.enemies.every((fighter) => fighter.posture === 100)).toBe(true);

        const losing = 创建阵营交锋会话(构建战术交锋阵容(role, [
            companion, npc('强敌', { 关系状态: '死敌', 境界层级: 6 }), secondHostile
        ], env), '生死交锋')!;
        fight = losing;
        let companionTookOver = false;
        for (let step = 0; step < 25 && !fight.finished; step++) {
            const move = fight.predictedEnemyBias === 'press' ? 'feint' : fight.predictedEnemyBias === 'feint' ? 'deflect' : 'press';
            fight = 推演阵营交锋一拍(fight, move, false);
            if (fight.allies[0].posture === 0 && fight.allies[1].posture > 0) {
                expect(fight.finished).toBe(false);
                companionTookOver = true;
            }
        }
        expect(companionTookOver).toBe(true);
        expect(fight.outcome).toBe('落败撤离');
        expect(fight.allies.every((fighter) => fighter.posture === 0)).toBe(true);
    });

    it('旁观者离场不重置进度，当前敌人离场后接战余敌，关闭放弃演练且保留旧战果', () => {
        const inputs = props([companion, neutral, hostile, secondHostile]);
        const oldRecord = {
            id: 'old', 对手姓名: '山贼', 模式: '生死交锋' as const, 结果: '胜出' as const,
            回合数: 2, 战果摘要: '已在旧渡口击退山贼', 主角伤势消耗描述: '略有消耗', 时间: 1
        };
        const saved = [oldRecord];
        const { rerender } = render(<TacticalClashModal {...inputs} pendingClashes={saved} />);
        click(/卸力借势/);
        const beat = screen.getByLabelText('出招拆解实录').textContent;
        rerender(<TacticalClashModal {...inputs} social={[companion, hostile, secondHostile]} pendingClashes={saved} />);
        expect(screen.getByLabelText('出招拆解实录').textContent).toBe(beat);
        rerender(<TacticalClashModal {...inputs} social={[companion, { ...hostile, 当前位置: '山顶' }, secondHostile]} pendingClashes={saved} />);
        expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '当前交锋目标' }).selectedOptions[0].textContent).toBe(secondHostile.姓名);
        expect(screen.getByLabelText('出招拆解实录').textContent).toBe(beat);
        click(/强攻压招/);
        expect(screen.getByLabelText('出招拆解实录').textContent).toContain('第 2 拍');
        rerender(<TacticalClashModal {...inputs} social={[companion]} pendingClashes={saved} />);
        expect(screen.queryByRole('button', { name: /强攻压招/ })).toBeNull();
        rerender(<TacticalClashModal {...inputs} social={[companion, secondHostile]} pendingClashes={saved} />);
        expect(screen.queryByLabelText('出招拆解实录')).toBeNull();
        click(/卸力借势/);
        rerender(<TacticalClashModal {...inputs} open={false} pendingClashes={saved} />);
        rerender(<TacticalClashModal {...inputs} pendingClashes={saved} />);
        expect(inputs.onCommitClash).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('出招拆解实录')).toBeNull();
        expect(screen.getByText(oldRecord.战果摘要)).toBeTruthy();
        expect(构建场外战果注入块(saved)).toContain(oldRecord.战果摘要);
    });

    it('同一战果连续点击结算时只扣一次体力、存一份记录', () => {
        const inputs = props([hostile]);
        render(<TacticalClashModal {...inputs} />);
        click(/卸力借势/);
        click(/借势脱身/);
        const settle = screen.getByRole<HTMLButtonElement>('button', { name: '结算体力并写入主剧情' });
        act(() => { settle.click(); settle.click(); });
        expect(inputs.onCommitClash).toHaveBeenCalledTimes(1);
        expect(settle.disabled).toBe(true);
    });
});
