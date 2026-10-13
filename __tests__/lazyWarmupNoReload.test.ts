import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 读源码 = (相对路径: string): string =>
    readFileSync(resolve(process.cwd(), 相对路径), 'utf-8');

describe('预热路径不得触发整页刷新', () => {
    // 回归：v1.0.679 把预热 effect 依赖收敛为 [state.view] 后，
    // 「读档」成了唯一且必然触发全量预热的入口。iOS Safari 上刚灌完存档
    // 内存处于峰值，任一 chunk 加载失败就整页刷新，
    // view 归零 -> 玩家刚读进来的对局丢失、回主页。
    it('App.tsx 的 preload 必须走 preloadLazyImport', () => {
        const 源码 = 读源码('App.tsx');
        const 起点 = 源码.indexOf('const 创建可预加载懒组件');
        expect(起点).toBeGreaterThanOrEqual(0);
        const 创建组件段 = 源码.slice(起点, 起点 + 900);

        // 精确断言：preload 的赋值目标必须使用不走 reload 的加载器。
        // 只断言「不含 wrappedLoader」不够——有人把 preload 改回
        // 直接包一层 lazyImportWithReload 时会漏过（已用变异测试验证过）。
        const preload赋值行 = 创建组件段
            .split('\n')
            .filter((line) => /\bpreload\s*=/.test(line));
        expect(preload赋值行.length).toBeGreaterThanOrEqual(1);
        for (const 行 of preload赋值行) {
            expect(行).toMatch(/preloadLazyImport|preloadLoader/);
            expect(行).not.toMatch(/lazyImportWithReload/);
        }
        expect(创建组件段).toContain('preloadLazyImport');
    });

    it('lazyImportWithReload 必须提供显式的禁止刷新开关', () => {
        const 源码 = 读源码('utils/lazyImportWithReload.ts');
        expect(源码).toContain('allowReload');
        expect(源码).toMatch(/allowReload\s*!==\s*false/);
        // preloadLazyImport 必须显式关闭刷新。
        expect(源码).toMatch(
            /preloadLazyImport[\s\S]*?allowReload:\s*false/
        );
    });

    it('App.tsx 必须随 view 同步游戏态标记', () => {
        const 源码 = 读源码('App.tsx');
        expect(源码).toMatch(
            /setLazyImportInGameActive\(\s*state\.view === 'game'\s*\)/
        );
    });

    it('预热失败只记日志，不弹刷新提示', () => {
        const 源码 = 读源码('App.tsx');
        const 预热段 = 源码.slice(
            源码.indexOf('const warmup = () => {'),
            源码.indexOf('const warmup = () => {') + 1200
        );
        expect(预热段).toContain('console.warn');
        expect(预热段).not.toContain('location.reload');
    });
});
