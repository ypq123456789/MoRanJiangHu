import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SuspenseTimeoutBoundary from '../components/ui/SuspenseTimeoutBoundary';
import { setLazyImportInGameActive } from '../utils/lazyImportWithReload';

const 读取节点文本 = (node: React.ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(读取节点文本).join('');
    if (!React.isValidElement(node)) return '';
    return 读取节点文本((node.props as { children?: React.ReactNode }).children);
};

const 查找按钮 = (node: React.ReactNode, label: string): (() => void) | null => {
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = 查找按钮(child, label);
            if (found) return found;
        }
        return null;
    }
    if (!React.isValidElement(node)) return null;
    const props = node.props as { children?: React.ReactNode; onClick?: () => void };
    if (node.type === 'button' && 读取节点文本(props.children).includes(label)) {
        return props.onClick || null;
    }
    return 查找按钮(props.children, label);
};

/** 直接构造实例并驱动状态，避开测试环境对 Suspense 调度时机的依赖。 */
const 构造实例 = (props: Record<string, unknown> = {}) => {
    const inst = new SuspenseTimeoutBoundary(
        { timeoutMs: 20000, children: null, ...props } as never,
        undefined as never
    );
    inst.setState = ((next: unknown) => {
        const patch = typeof next === 'function'
            ? (next as (s: { 已超时: boolean; 重建序号: number }) => { 已超时: boolean; 重建序号: number })(inst.state)
            : next;
        inst.state = { ...inst.state, ...(patch as object) };
    }) as typeof inst.setState;
    return inst;
};

const 推进到超时 = (inst: SuspenseTimeoutBoundary) => {
    (inst as unknown as { 开始计时: () => void }).开始计时();
    vi.advanceTimersByTime(20001);
};

describe('Suspense 挂起超时边界', () => {
    it('子节点正常渲染时不显示任何兜底 UI', () => {
        const html = renderToStaticMarkup(
            React.createElement(
                SuspenseTimeoutBoundary,
                { timeoutMs: 1000 },
                React.createElement('div', null, '对局正文内容')
            )
        );
        expect(html).toContain('对局正文内容');
        expect(html).not.toContain('界面加载超时');
        expect(html).not.toContain('卷轴展开中');
    });

    it('挂起超过阈值后降级为可点击的恢复页，重试可重置状态', async () => {
        vi.useFakeTimers();
        try {
            const inst = 构造实例();
            推进到超时(inst);
            expect(inst.state.已超时).toBe(true);

            const 恢复页 = inst.render();
            const 文本 = 读取节点文本(恢复页);
            expect(文本).toContain('界面加载超时');

            const 重试 = 查找按钮(恢复页, '重试加载');
            expect(重试).toBeTypeOf('function');
            重试?.();
            expect(inst.state.已超时).toBe(false);
            expect(inst.state.重建序号).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('chunk 及时加载成功时不得误报超时（卸载即清计时）', async () => {
        vi.useFakeTimers();
        try {
            const inst = 构造实例();
            const 内部 = inst as unknown as { 开始计时: () => void; 清除计时: () => void };
            内部.开始计时();
            // 模拟 chunk 加载完成 → fallback 卸载 → 清计时
            内部.清除计时();
            vi.advanceTimersByTime(60000);
            expect(inst.state.已超时).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('CodeRabbit Major #1：提供 onDismiss 时渲染关闭按钮，点击后回调并收起浮层', () => {
        vi.useFakeTimers();
        try {
            const onDismiss = vi.fn();
            const inst = 构造实例({ onDismiss });
            推进到超时(inst);

            const 恢复页 = inst.render();
            const 关闭 = 查找按钮(恢复页, '关闭');
            expect(关闭).toBeTypeOf('function');
            关闭?.();
            expect(onDismiss).toHaveBeenCalledTimes(1);
            // 浮层必须收起，否则关掉面板后玩家仍被遮住
            expect(inst.state.已超时).toBe(false);
            // 且不得重挂载子树（重建序号不变）：chunk pending 时重挂载只会再超时一次
            expect(inst.state.重建序号).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('未提供 onDismiss 时不渲染关闭按钮', () => {
        vi.useFakeTimers();
        try {
            const inst = 构造实例();
            推进到超时(inst);
            const 恢复页 = inst.render();
            expect(查找按钮(恢复页, '关闭')).toBeNull();
            // 没有 onDismiss 时至少保留重试入口
            expect(查找按钮(恢复页, '重试加载')).toBeTypeOf('function');
        } finally {
            vi.useRealTimers();
        }
    });

    it('onDismissLabel 可覆盖关闭按钮文案（游戏态最外层用「自动保存并返回主界面」）', () => {
        vi.useFakeTimers();
        try {
            const inst = 构造实例({ onDismiss: () => {}, onDismissLabel: '自动保存并返回主界面' });
            推进到超时(inst);
            const 恢复页 = inst.render();
            expect(查找按钮(恢复页, '自动保存并返回主界面')).toBeTypeOf('function');
        } finally {
            vi.useRealTimers();
        }
    });

    it('CodeRabbit Major #2：游戏态内提示进度不丢失，且不渲染整页刷新按钮', () => {
        vi.useFakeTimers();
        setLazyImportInGameActive(true);
        try {
            const inst = 构造实例({ onDismiss: () => {} });
            推进到超时(inst);
            const 恢复页 = inst.render();
            const 文本 = 读取节点文本(恢复页);
            expect(文本).toContain('进度不会因此丢失');
            // 游戏态 view 不持久化，刷新 = 丢掉未保存的对局，绝不能给这个按钮
            expect(文本).not.toContain('刷新整个页面');
            expect(查找按钮(恢复页, '关闭提示，先保存进度')).toBeTypeOf('function');
        } finally {
            setLazyImportInGameActive(false);
            vi.useRealTimers();
        }
    });

    it('非游戏态保留整页刷新入口与「关闭本界面」按钮', () => {
        vi.useFakeTimers();
        setLazyImportInGameActive(false);
        try {
            const inst = 构造实例({ onDismiss: () => {} });
            推进到超时(inst);
            const 恢复页 = inst.render();
            const 文本 = 读取节点文本(恢复页);
            expect(文本).toContain('刷新整个页面');
            expect(查找按钮(恢复页, '关闭本界面')).toBeTypeOf('function');
        } finally {
            vi.useRealTimers();
        }
    });

    it('App.tsx：所有懒加载边界必须走带超时的实现，不能回退裸 Suspense', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
        expect(source).toContain("import SuspenseTimeoutBoundary from './components/ui/SuspenseTimeoutBoundary'");
        //裸 React.Suspense fallback 已被移除，避免出现永不降级的转圈
        expect(source).not.toMatch(/<React\.Suspense\s+fallback/);
        expect(source).not.toContain('懒加载占位');
        // 懒加载边界必须包上超时边界，且阈值必须落在合理区间（1s~60s）。
        // 只写 \d+ 会被「99999999（等于永不超时）」这种变异放过，必须卡上下界。
        expect(source).toMatch(/const 懒加载边界[\s\S]{0,200}<SuspenseTimeoutBoundary\s+timeoutMs=\{(\d+)\}/);
        const 面板阈值 = Number(
            source.match(/const 懒加载边界[\s\S]{0,200}<SuspenseTimeoutBoundary\s+timeoutMs=\{(\d+)\}/)?.[1]
        );
        expect(面板阈值).toBeGreaterThanOrEqual(1000);
        expect(面板阈值).toBeLessThanOrEqual(60000);
        // 游戏态分支必须有外层挂起超时兜底，阈值同样受约束
        const gameIdx = source.indexOf("state.view === 'game' && (");
        expect(gameIdx).toBeGreaterThan(-1);
        const gameBlock = source.slice(gameIdx, gameIdx + 1200);
        expect(gameBlock).toMatch(/<SuspenseTimeoutBoundary\s+timeoutMs=\{(\d+)\}/);
        const 主界面阈值 = Number(
            gameBlock.match(/<SuspenseTimeoutBoundary\s+timeoutMs=\{(\d+)\}/)?.[1]
        );
        expect(主界面阈值).toBeGreaterThanOrEqual(1000);
        expect(主界面阈值).toBeLessThanOrEqual(60000);
    });

    it('App.tsx：懒加载边界必须透传 onDismiss，且每个面板实例都要接关闭入口', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
        // 定义处透传
        expect(source).toMatch(
            /const 懒加载边界[\s\S]{0,300}<SuspenseTimeoutBoundary\s+timeoutMs=\{\d+\}\s+onDismiss=\{onDismiss\}/
        );
        // 每个 <懒加载边界> 实例都必须带 onDismiss，否则该面板超时后没有不刷新页面的出路
        const 用法总数 = (source.match(/<懒加载边界(?=[ >\n])/g) || []).length;
        const 带关闭入口 = (source.match(/<懒加载边界\s+onDismiss=/g) || []).length;
        expect(用法总数).toBeGreaterThanOrEqual(25);
        expect(带关闭入口).toBe(用法总数);
    });

    it('App.tsx：游戏态最外层兜底必须带 onDismiss 逃生口（自动保存返回主界面）', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
        const gameIdx = source.indexOf("state.view === 'game' && (");
        const gameBlock = source.slice(gameIdx, gameIdx + 1200);
        // 游戏态禁刷新，唯一的整页级出路是「保存并回主界面」
        expect(gameBlock).toMatch(/<SuspenseTimeoutBoundary[^>]*onDismiss=\{[^}]*handleReturnToHomeWithAutoSave/);
    });

    it('超时阈值不得为 0 或负数（否则等同无兜底）', () => {
        const boundarySource = fs.readFileSync(
            path.join(process.cwd(), 'components', 'ui', 'SuspenseTimeoutBoundary.tsx'),
            'utf8'
        );
        const 默认值 = Number(boundarySource.match(/\?\?\s*(\d+)\s*\)?\s*;?\s*$/m)?.[1]
            || boundarySource.match(/this\.props\.timeoutMs \?\? (\d+)/)?.[1]);
        expect(默认值).toBeGreaterThanOrEqual(1000);
        expect(默认值).toBeLessThanOrEqual(60000);
    });

    it('挂起计时器必须在 fallback 卸载时清掉（加载成功不得误报超时）', () => {
        const boundarySource = fs.readFileSync(
            path.join(process.cwd(), 'components', 'ui', 'SuspenseTimeoutBoundary.tsx'),
            'utf8'
        );
        // effect 必须 `return onDone`（作为 cleanup），否则 chunk 加载成功后计时器仍在跑，
        // 会把正常加载误判成超时。
        expect(boundarySource).toMatch(/onStart\(\);\s*return\s+onDone;/);
        // 且组件卸载时也要清
        expect(boundarySource).toMatch(/componentWillUnmount\(\)[\s\S]{0,120}清除计时\(\)/);
        expect(boundarySource).not.toMatch(/return undefined;/);
    });

    it('游戏态分支的超时兜底必须包在 ModalErrorBoundary 之内（两层同时在）', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
        const gameIdx = source.indexOf("state.view === 'game' && (");
        const gameBlock = source.slice(gameIdx, gameIdx + 1200);
        const boundaryIdx = gameBlock.indexOf('<ModalErrorBoundary');
        const suspenseIdx = gameBlock.indexOf('<SuspenseTimeoutBoundary');
        expect(boundaryIdx).toBeGreaterThanOrEqual(0);
        expect(suspenseIdx).toBeGreaterThan(boundaryIdx);
    });
});
