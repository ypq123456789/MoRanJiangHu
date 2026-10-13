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
        const 创建组件段 = 源码.slice(起点, 起点 + 1600);

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

    // CodeRabbit PR#99 意见二：React.lazy 会缓存 rejected payload（_status=2），
    // 失败后不再调用 loader。游戏态禁了整页刷新，若没有重建路径，
    // 玩家点开某个弹窗失败一次就永远打不开。
    it('懒组件必须可重建，否则游戏态内失败后无法恢复', () => {
        const 源码 = 读源码('App.tsx');
        const 起点 = 源码.indexOf('const 创建可预加载懒组件');
        const 创建组件段 = 源码.slice(起点, 起点 + 1600);

        // 版本号必须来自登记簿，版本一变才能造出全新的 React.lazy 实例。
        expect(创建组件段).toMatch(/useSyncExternalStore/);
        expect(创建组件段).toContain('读取懒组件版本');
        expect(创建组件段).toContain('订阅懒组件重建');

        // 精确定位：所有 React.lazy 调用都必须落在「依赖数组含版本」的 useMemo 内。
        // 仅断言「出现过 useMemo」会被 App 里其它无关 useMemo 误命中。
        const allLazy = 创建组件段.match(/React\.lazy\(/g) || [];
        expect(allLazy.length).toBeGreaterThanOrEqual(1);
        const versionedMemo = 创建组件段.match(
            /React\.useMemo\(\s*\(\s*\)\s*=>\s*React\.lazy\([\s\S]*?\[\s*版本\s*\]/
        );
        expect(versionedMemo).not.toBeNull();
        // useMemo 里出现 React.lazy 的次数必须等于总数（不能有裸调用的漏网之鱼）
        const memoLazyCount = (versionedMemo?.[0].match(/React\.lazy\(/g) || []).length;
        expect(memoLazyCount).toBe(allLazy.length);
    });

    it('ModalErrorBoundary 必须在游戏态提供重试而非刷新', () => {
        const 源码 = 读源码('components/ui/ModalErrorBoundary.tsx');
        expect(源码).toContain('重置懒组件重建');
        expect(源码).toContain('isLazyImportInGameActive');
        // 游戏态内不得再出现刷新按钮的渲染分支条件。
        expect(源码).toMatch(/isLazyImportError && !游戏态内/);
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
