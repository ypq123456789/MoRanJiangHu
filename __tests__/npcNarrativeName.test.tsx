// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import NpcRevealableName from '../components/features/Social/NpcRevealableName';
import { 整理NPC简介文本 } from '../utils/npcBioText';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';

// React scheduler 用 setImmediate；环境销毁前用同一队列把 pending 工作放完，
// 否则多文件并发时会出现 "window is not defined" 的 unhandled error。
afterAll(async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
});

describe('NPC 简介去重', () => {
    it('完全重复的句子只保留首次出现', () => {
        expect(整理NPC简介文本('她自幼习武。后来拜入青云门。她自幼习武。'))
            .toBe('她自幼习武。后来拜入青云门。');
    });

    it('整段复述只保留一次', () => {
        const 段 = '她自幼习武，后来拜入青云门。';
        expect(整理NPC简介文本(`${段}\n${段}`)).toBe(段);
    });

    it('标点或空白不同也算重复，但语义不同的排比保留', () => {
        expect(整理NPC简介文本('她会剑法，她会剑法！')).toBe('她会剑法，');
        expect(整理NPC简介文本('她会剑法，她会医术，她会轻功。'))
            .toBe('她会剑法，她会医术，她会轻功。');
    });
});

describe('NPC 叙事名称规范化', () => {
    it('叙事名与真名不同时保留', () => {
        const list = 规范化社交列表([{ id: 'NPC001', 姓名: '李慕白', 叙事名称: '少年', 性别: '男' }]);
        expect(list[0]?.叙事名称).toBe('少年');
    });

    it('叙事名等于真名或为空时不落库，老存档自然回退到姓名', () => {
        const same = 规范化社交列表([{ id: 'NPC002', 姓名: '李慕白', 叙事名称: '李慕白' }]);
        expect(same[0]?.叙事名称).toBeUndefined();
        const legacy = 规范化社交列表([{ id: 'NPC003', 姓名: '李慕白' }]);
        expect(legacy[0]?.叙事名称).toBeUndefined();
    });

    it('空叙事名别名与占位值被丢弃', () => {
        const list = 规范化社交列表([
            { id: 'NPC004', 姓名: '李慕白', 叙事名称: '   ' },
            { id: 'NPC005', 姓名: '沈千山', 叙事称呼: '未知' },
        ]);
        expect(list.every((npc: any) => !npc?.叙事名称)).toBe(true);
    });
});

describe('道友录剧透打码交互', () => {
    const npc = { id: 'NPC001', 姓名: '李慕白', 叙事名称: '少年' };

    it('叙事名直出，真名默认马赛克且悬浮提示剧透', () => {
        const { container } = render(
            <NpcRevealableName npc={npc} revealed={false} onToggleReveal={vi.fn()} />
        );
        expect(container.querySelector('[data-narrative-name]')?.textContent).toBe('少年');
        const toggle = container.querySelector('[data-real-name-toggle]')!;
        expect(toggle).not.toBeNull();
        expect(toggle.textContent).toContain('李慕白');
        expect(toggle.querySelector('.npc-real-name-mosaic')).not.toBeNull();
        expect(toggle.getAttribute('title')).toContain('剧透');
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('点击与键盘回车都能请求揭示', () => {
        const onToggle = vi.fn();
        const { container } = render(
            <NpcRevealableName npc={npc} revealed={false} onToggleReveal={onToggle} />
        );
        const toggle = container.querySelector('[data-real-name-toggle]')!;
        fireEvent.click(toggle);
        fireEvent.keyDown(toggle, { key: 'Enter' });
        expect(onToggle).toHaveBeenCalledTimes(2);
        expect(onToggle).toHaveBeenCalledWith('NPC001');
    });

    it('揭示后去掉马赛克，再点可收起', () => {
        const { container } = render(
            <NpcRevealableName npc={npc} revealed onToggleReveal={vi.fn()} />
        );
        const toggle = container.querySelector('[data-real-name-toggle]')!;
        expect(toggle.querySelector('.npc-real-name-mosaic')).toBeNull();
        expect(toggle.querySelector('[data-real-name]')?.textContent).toBe('李慕白');
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
    });

    it('没有叙事名或两者相同时不显示剧透入口', () => {
        const { container } = render(
            <NpcRevealableName npc={{ id: 'NPC002', 姓名: '李慕白' }} revealed={false} onToggleReveal={vi.fn()} />
        );
        expect(container.querySelector('[data-real-name-toggle]')).toBeNull();
        expect(container.querySelector('[data-narrative-name]')?.textContent).toBe('李慕白');
    });
});

describe('双名称提示词约束', () => {
    const 读 = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

    it('数据契约声明叙事名称字段且正文只准用叙事名', () => {
        expect(读('prompts/core/data.ts')).toContain('id/姓名/叙事名称/身份');
    });

    it('润色与正文格式协议不再强行把对白标签改回真实姓名', () => {
        const polish = 读('prompts/core/cotPolish.ts');
        const format = 读('prompts/core/format.ts');
        expect(polish).toContain('NPC 有叙事名称时填叙事名称');
        expect(format).toContain('NPC 有叙事名称时用叙事名称');
        expect(format).not.toContain('【真实角色名】台词');
    });

    it('NPC 上下文把叙事名称注入给 AI', () => {
        const ctx = 读('hooks/useGame/npcContext.ts');
        expect(ctx).toContain('叙事名称: typeof npc?.叙事名称');
    });
});
