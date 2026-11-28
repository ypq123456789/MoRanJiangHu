// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SectModal from '../components/features/Sect/SectModal';
import MobileSect from '../components/features/Sect/MobileSect';
import InputArea from '../components/features/Chat/InputArea';
import { 获取门派所在状态, 构建门派研习行动, 已习得门派藏经 } from '../utils/sectLibrary';
import { 规范化环境信息 } from '../hooks/useGame/stateTransforms';

afterEach(cleanup);

const book = { id: 'b1', 名称: '引泉诀', 品阶: '上品', 类型: '心法', 简介: '调息引泉', 要求职位: '杂役弟子', 要求累计贡献: 10 };
const sect = { ID: 's1', 名称: '青崖真宫', 玩家职位: '杂役弟子', 玩家贡献: 30, 重要成员: [], 兑换列表: [], 藏经阁列表: [book], 门规: [], 任务列表: [] } as any;
const current = (小地点: string, 具体地点 = '') => ({ 小地点, 具体地点 } as any);

describe('门派藏经研习', () => {
    it('区分门派驻地、外出与缺少位置资料', () => {
        expect(获取门派所在状态(sect, current('青崖真宫', '藏经阁'))).toBe('门内');
        expect(获取门派所在状态(sect, current('青崖真宫外院'))).toBe('门内');
        expect(获取门派所在状态(sect, current('河东', '青崖真宫山门外'))).toBe('门外');
        expect(获取门派所在状态(sect, current('青崖真宫', '山门外'))).toBe('门外');
        expect(获取门派所在状态(sect, current('铁骨帮', '藏经阁'))).toBe('门外');
        expect(获取门派所在状态(sect, current('未知'))).toBe('未知');
        const world = { 地图层级: [{ ID: 'hall', 名称: '凌云殿', 层级: '区地点', 控制势力: '青崖真宫' }] } as any;
        expect(获取门派所在状态(sect, current('凌云殿'), world)).toBe('门内');
        expect(获取门派所在状态(sect, current('外地客栈'), world)).toBe('门外');
        const renamedFaction = {
            势力列表: [{ ID: sect.ID, 名称: '青崖剑宗' }],
            地图层级: [{ ID: 'hall', 名称: '凌云殿', 层级: '区地点', 控制势力: '青崖剑宗' }]
        } as any;
        expect(获取门派所在状态(sect, current('凌云殿'), renamedFaction)).toBe('门内');
    });

    it('按实际建筑和房间判断到场，势力辖下的整座城镇不能解锁门派研习', () => {
        const world = {
            地图层级: [
                { ID: 'town', 名称: '青萍镇', 层级: '小地点', 控制势力: '青崖真宫' },
                { ID: 'inn', 名称: '悦来客栈', 层级: '区地点', 父级ID: 'town' },
                { ID: 'hall', 名称: '观澜院', 层级: '区地点', 父级ID: 'town', 控制势力: '青崖真宫' },
                { ID: 'study', 名称: '书房', 层级: '子地点', 父级ID: 'hall' }
            ],
            势力列表: [{ ID: 's1', 名称: '青崖真宫', 地盘归属: '青萍镇' }]
        } as any;
        expect(获取门派所在状态(sect, current('青萍镇', '悦来客栈'), world)).toBe('门外');
        expect(获取门派所在状态(sect, current('青萍镇'), world)).toBe('门外');
        const raw = { 小地点: '青萍镇', 区地点: '观澜院', 子地点: '书房' };
        const normalized = 规范化环境信息(raw);
        expect(normalized.具体地点).toBe('观澜院 > 书房');
        expect(获取门派所在状态(sect, normalized, world)).toBe('门内');
        expect(规范化环境信息({ ...raw, 具体地点: '悦来客栈' }).具体地点).toBe('悦来客栈');
        expect(获取门派所在状态(sect, 规范化环境信息({ ...raw, 子地点: '山门外' }), world)).toBe('门外');
    });

    it.each([[SectModal, '藏经阁', '聚宝阁'], [MobileSect, '藏经', '兑换']] as const)(
        '两阁显示所在地，仅允许在门内发起学习', (Panel, library, exchange) => {
            const onLearnBook = vi.fn();
            const props = { sectData: sect, onClose: vi.fn(), onLearnBook };
            const { rerender } = render(<Panel {...props} sectLocation="门外" />);
            fireEvent.click(screen.getByRole('button', { name: library }));
            expect(screen.getByText(/当前不在青崖真宫/)).toBeTruthy();
            const button = screen.getAllByRole('button').find(node => node.hasAttribute('disabled') && node.textContent?.includes('学习'));
            expect(button).toBeTruthy();
            fireEvent.click(button!);
            expect(onLearnBook).not.toHaveBeenCalled();
            rerender(<Panel {...props} sectLocation="门内" />);
            fireEvent.click(screen.getByRole('button', { name: /^学习/ }));
            expect(onLearnBook).toHaveBeenCalledWith(book);
            fireEvent.click(screen.getByRole('button', { name: exchange }));
            expect(screen.getByText(/当前位于青崖真宫/)).toBeTruthy();
        });

    it('学习请求追加至可编辑草稿，重复选择不重复添加，发送后才交给 AI', () => {
        const draft = 构建门派研习行动(sect, book);
        expect(draft).toContain('要求累计贡献 10');
        expect(draft).toContain('引泉诀');
        const onSend = vi.fn(async () => ({}));
        const props = { onSend, onStop: vi.fn(), onRegenerate: vi.fn(), loading: false };
        const { rerender } = render(<InputArea {...props} />);
        const input = screen.getByRole('textbox', { name: '行动草稿' }) as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: '先问守阁师兄。' } });
        for (const token of [1, 2]) rerender(<InputArea {...props} externalDraft={{ text: draft, token }} />);
        expect(input.value).toBe('先问守阁师兄。\n' + draft);
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSend).toHaveBeenCalledWith('先问守阁师兄。\n' + draft, expect.any(Boolean), expect.any(Object));
        expect(已习得门派藏经([{ 名称: book.名称 }], book)).toBe(true);
        expect(已习得门派藏经([], book)).toBe(false);
    });

    it('转述中的研习请求可以独立追加，发送中收到的多条草稿留给下回合', async () => {
        const draft = 构建门派研习行动(sect, book);
        const quoted = '转述给师兄：' + draft;
        let resolveSend!: (value: {}) => void;
        const onSend = vi.fn(() => new Promise<{}>(resolve => { resolveSend = resolve; }));
        const props = { onSend, onStop: vi.fn(), onRegenerate: vi.fn(), loading: false };
        const { rerender } = render(<InputArea {...props} />);
        const input = screen.getByRole('textbox', { name: '行动草稿' }) as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: quoted } });
        rerender(<InputArea {...props} externalDraft={{ text: draft, token: 1 }} />);
        expect(input.value).toBe(quoted + '\n' + draft);
        fireEvent.keyDown(input, { key: 'Enter' });
        rerender(<InputArea {...props} externalDraft={{ text: '去问师父。', token: 2 }} />);
        rerender(<InputArea {...props} externalDraft={{ text: '去找师姐。', token: 3 }} />);
        await act(async () => { resolveSend({}); });
        expect(onSend).toHaveBeenCalledWith(quoted + '\n' + draft, expect.any(Boolean), expect.any(Object));
        expect(input.value).toBe('去问师父。\n去找师姐。');
    });

    it.each(['发送成功', '发送失败', '手动恢复', '放弃恢复'] as const)(
        '%s时按回合保留研习草稿，重复选择只留一条',
        async (outcome) => {
            const draft = 构建门派研习行动(sect, book);
            const original = '先问守阁师兄。\n' + draft;
            const extra = '再去找师父。';
            type SendResult = Awaited<ReturnType<React.ComponentProps<typeof InputArea>['onSend']>>;
            let finish!: (result: SendResult) => void;
            const onSend = vi.fn(() => new Promise<SendResult>(resolve => { finish = resolve; }));
            const props = { onSend, onStop: vi.fn(), onRegenerate: vi.fn(), onRecoverParseErrorRaw: vi.fn(() => null), loading: false };
            const { rerender } = render(<InputArea {...props} />);
            const input = screen.getByRole('textbox', { name: '行动草稿' }) as HTMLTextAreaElement;
            fireEvent.change(input, { target: { value: original } });
            fireEvent.keyDown(input, { key: 'Enter' });
            [extra, draft, draft].forEach((text, i) => rerender(<InputArea {...props} externalDraft={{ text, token: i + 1 }} />));
            expect(onSend).toHaveBeenCalledWith(original, expect.any(Boolean), expect.any(Object));
            expect(input.value).toBe([original, extra, draft].join('\n'));

            const needsRepair = outcome === '手动恢复' || outcome === '放弃恢复';
            await act(async () => finish(needsRepair
                ? { cancelled: true, needRerollConfirm: true, parseErrorRawText: '待修复的正文' }
                : { cancelled: outcome === '发送失败' }));
            if (outcome === '手动恢复') {
                await act(async () => { fireEvent.click(screen.getByRole('button', { name: '手动编辑后应用' })); });
                expect(props.onRecoverParseErrorRaw).toHaveBeenCalledWith('待修复的正文', false);
            } else if (outcome === '放弃恢复') {
                fireEvent.click(screen.getByRole('button', { name: '关闭解析修复弹窗' }));
            }
            const expected = outcome === '发送失败' || outcome === '放弃恢复'
                ? [original, extra].join('\n')
                : [extra, draft].join('\n');
            rerender(<InputArea {...props} externalDraft={{ text: draft, token: 4 }} />);
            expect(input.value).toBe(expected);
            onSend.mockResolvedValueOnce({});
            await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
            expect(onSend).toHaveBeenLastCalledWith(expected, expect.any(Boolean), expect.any(Object));
        }
    );
});
