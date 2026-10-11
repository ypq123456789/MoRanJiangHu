import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

/**
 * iOS Safari 上「调屏幕尺寸就闪退回游戏菜单」的回归防线。
 *
 * 真实成因：Safari 地址栏伸缩/ 旋转 / 分屏会连续触发 resize，
 * 旧实现每次事件都直接写 viewportWidth，且 isMobile 用无滞回的 matchMedia 判定。
 * 宽度在 767px 断点附近抖动时 isMobile 高频翻转，App 里 28 处isMobile 分支
 * 同时换组件、整棵树卸载重建，叠加预热 effect 反复重跑，
 * Safari 内存被打满后系统杀掉标签页 —— 玩家看到的就是退回菜单页。
 */
describe('视口尺寸变化防抖与断点滞回', () => {
    it('resize 回调必须防抖，且忽略小于 1px 的宽度噪声', () => {
        // 防抖定时器
        expect(app).toMatch(/window\.addEventListener\('resize', update\)/);
        expect(app).toMatch(/window\.setTimeout\(\(\) => \{\s*\n\s*timerId = null;[\s\S]{0,400}?setViewportWidth\(width\);/);
        // 1px 噪声过滤
        expect(app).toMatch(/Math\.abs\(width - lastWidth\) < 1/);
    });

    it('同时监听 orientationchange，覆盖旋转场景', () => {
        expect(app).toMatch(/window\.addEventListener\('orientationchange', update\)/);
        expect(app).toMatch(/window\.removeEventListener\('orientationchange', update\)/);
    });

    it('isMobile 使用带滞回区间的宽度判定，不依赖裸 matchMedia', () => {
        // 滞回退出阈值必须高于进入阈值
        expect(app).toMatch(/const MOBILE_BREAKPOINT = 767;/);
        expect(app).toMatch(/const MOBILE_EXIT = MOBILE_BREAKPOINT \+ 48;/);
        expect(app).toMatch(/width <= MOBILE_BREAKPOINT/);
        expect(app).toMatch(/current \? width < MOBILE_EXIT : false/);
        // 旧的裸 matchMedia 判定不能残留在运行时路径上
        const runtimeMatches = app.match(/matchMedia\('\(max-width: 767px\)'\)/g) || [];
        expect(runtimeMatches).toHaveLength(0);
    });

    it('预热 effect 不再依赖 isMobile，避免翻转时整批重新预热', () => {
        // isMobile 通过 ref 读取
        expect(app).toMatch(/const mobile = isMobileRef\.current;/);
        expect(app).toMatch(/const priorityCount = mobile \? 5 : 9;/);

        // 必须定位到「预热 effect 本身」的依赖数组再断言。
        // 若只在整文件里搜 `}, [state.view]);`，别的 effect 恰好命中就会让测试
        // 放过「预热 effect 被改回 [state.view, isMobile]」这种回归。
        const warmupStart = app.indexOf('const warmup = () => {');
        expect(warmupStart).toBeGreaterThan(-1);
        // 该effect 的收尾依赖数组：从 warmup 定义往后找第一个 `}, [ ... ]);`
        const warmupTail = app.slice(warmupStart).match(/\},\s*\[([^\]]*)\]\);/);
        expect(warmupTail).not.toBeNull();
        const warmupDeps = (warmupTail?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);

        // 依赖里不能出现 isMobile，且应保留 state.view
        expect(warmupDeps).not.toContain('isMobile');
        expect(warmupDeps).toContain('state.view');
    });

    it('滞回判定在断点抖动下不会反复翻转', () => {
        // 提取 evaluate 的判定逻辑做等价仿真
        const MOBILE_BREAKPOINT = 767;
        const MOBILE_EXIT = MOBILE_BREAKPOINT + 48;

        const simulate = (startMobile: boolean, widths: number[]) => {
            let current = startMobile;
            const flips: boolean[] = [];
            for (const width of widths) {
                const next = width <= MOBILE_BREAKPOINT
                    ? true
                    : (current ? width < MOBILE_EXIT : false);
                if (next !== current) {
                    current = next;
                    flips.push(next);
                }
            }
            return flips;
        };

        // 关键性质：抖动序列里最多翻转一次，绝不来回横跳。
        // （进入移动端的判定保持 <=767px 不变，滞回只加在退出侧，
        //   因此从桌面掉到移动端仍会翻转一次，但之后立刻稳定。）
        expect(simulate(false, [800, 770, 760, 790, 765, 810]).length).toBeLessThanOrEqual(1);
        expect(simulate(true, [390, 780, 790, 770, 800, 810]).length).toBeLessThanOrEqual(1);

        // 真正的宽屏切换（超过滞回上限）仍要正常翻转
        expect(simulate(true, [390, 1200])).toEqual([false]);
        expect(simulate(false, [1200, 400])).toEqual([true]);
        // 刚好在滞回区间内不能退出，避免贴着阈值反复切换
        expect(simulate(true, [390, 800, 810, 814])).toEqual([]);
        expect(simulate(true, [390, 815])).toEqual([false]);
    });

    it('无滞回实现在同一抖动下会反复翻转（证明修复有效）', () => {
        const legacyFlips = (startMobile: boolean, widths: number[]) => {
            let current = startMobile;
            let flips = 0;
            for (const width of widths) {
                const next = width <= 767;
                if (next !== current) {
                    current = next;
                    flips += 1;
                }
            }
            return flips;
        };

        const MOBILE_BREAKPOINT = 767;
        const MOBILE_EXIT = MOBILE_BREAKPOINT + 48;
        const simulate = (startMobile: boolean, widths: number[]) => {
            let current = startMobile;
            let flips = 0;
            for (const width of widths) {
                const next = width <= MOBILE_BREAKPOINT
                    ? true
                    : (current ? width < MOBILE_EXIT : false);
                if (next !== current) {
                    current = next;
                    flips += 1;
                }
            }
            return flips;
        };

        // iPad 分屏拖动 / 窗口缩放时的典型抖动序列
        const jitter = [390, 780, 690, 800, 700, 810, 740, 820];

        const legacy = legacyFlips(true, jitter);
        const fixed = simulate(true, jitter);

        // 旧实现横跳 7 次，新实现最多 1 次
        expect(legacy).toBeGreaterThanOrEqual(6);
        expect(fixed).toBeLessThanOrEqual(1);
    });
});