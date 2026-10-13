import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SuspenseTimeoutBoundary from '../components/ui/SuspenseTimeoutBoundary';

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

    it('挂起超过阈值后降级为可点击的重试页，且提示玩家进度不会丢失', async () => {
        vi.useFakeTimers();
        try {
            // 手动构造实例以便直接驱动状态，避开测试环境对 Suspense 调度时机的依赖
            const inst = new SuspenseTimeoutBoundary(
                { timeoutMs: 20000, children: null },
                { 已超时: false, 重建序号: 0 }
            );
            inst.setState = ((next: unknown) => {
                const patch = typeof next === 'function'
                    ? (next as (s: { 已超时: boolean; 重建序号: number }) => { 已超时: boolean; 重建序号: number })(inst.state)
                    : next;
                inst.state = { ...inst.state, ...(patch as object) };
            }) as typeof inst.setState;

            // 触发挂起计时
            (inst as unknown as { 开始计时: () => void }).开始计时();
            expect(inst.state.已超时).toBe(false);

            // 推进 20s
            vi.advanceTimersByTime(20001);
            expect(inst.state.已超时).toBe(true);

            // 必须能渲染出可点击的恢复页
            const 恢复页 = inst.render();
            const 文本 = 读取节点文本(恢复页);
            expect(文本).toContain('界面加载超时');
            expect(文本).toContain('进度不会因此丢失');

            const 重试 = 查找按钮(恢复页, '重新加载');
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
            const inst = new SuspenseTimeoutBoundary(
                { timeoutMs: 20000, children: null },
                { 已超时: false, 重建序号: 0 }
            );
            inst.setState = ((next: unknown) => {
                const patch = typeof next === 'function'
                    ? (next as (s: { 已超时: boolean; 重建序号: number }) => { 已超时: boolean; 重建序号: number })(inst.state)
                    : next;
                inst.state = { ...inst.state, ...(patch as object) };
            }) as typeof inst.setState;

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