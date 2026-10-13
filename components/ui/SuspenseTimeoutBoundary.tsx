import React from 'react';

type 挂起超时边界Props = {
    children?: React.ReactNode;
    /**
     * 挂起超过该毫秒数后放弃等待，转为可点击的恢复页。
     * 默认 20s：iOS Safari 在低端机上加载大 chunk 偶发需要 10s 以上，
     * 但绝不该无限转圈——玩家需要一个出口。
     */
    timeoutMs?: number;
};

type 挂起超时边界State = {
    已超时: boolean;
    /** 递增即强制子树整体重挂载，让 lazy 重新发起 import。 */
    重建序号: number;
};

/**
 * 给 Suspense 兜底的「挂起超时」边界。
 *
 * 为什么必须有它：ErrorBoundary 只能捕获渲染期throw，
 * **捕获不到 Suspense 的挂起状态**。一旦某个懒加载 chunk 的
 * Promise 一直 pending（iOS Safari 内存压力下的连接半开、
 * CF 边缘缓存把某个 chunk 卡在中间态等），fallback 会永久显示，
 * 玩家看到的就是「卷轴展开中…」无限转圈，且没有任何自救入口。
 *
 * 配合 utils/lazyImportWithReload 里「游戏态禁止整页刷新」的保护时
 * 尤其关键：禁掉 reload 就必须给同层的重试出路，
 * 否则等于把玩家锁死在转圈里。
 */
export class 挂起超时边界 extends React.Component<
    挂起超时边界Props,
    挂起超时边界State
> {
    state: 挂起超时边界State = { 已超时: false, 重建序号: 0 };

    private 计时器: ReturnType<typeof setTimeout> | null = null;

    componentWillUnmount() {
        this.清除计时();
    }

    private 清除计时 = () => {
        if (this.计时器 !== null) {
            clearTimeout(this.计时器);
            this.计时器 = null;
        }
    };

    /**
     * 由 fallback 挂载时调用，开始计时；
     * 由 fallback 卸载时调用（即 chunk 成功加载、Suspense 恢复渲染），清除计时。
     * 这样「加载成功」和「加载挂起」两条路径都能正确收尾，不会误报超时。
     */
    private 开始计时 = () => {
        this.清除计时();
        this.计时器 = setTimeout(() => {
            this.setState({ 已超时: true });
        }, this.props.timeoutMs ?? 20000);
    };

    private handleRetry = () => {
        this.清除计时();
        this.setState((prev) => ({ 已超时: false, 重建序号: prev.重建序号 + 1 }));
    };

    render() {
        if (this.state.已超时) {
            return (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#f8f4e8]/96 px-6 py-10 text-center">
                    <div className="w-full max-w-md rounded-2xl border border-wuxia-gold/35 bg-[#fffaf0] px-6 py-6 text-[#7a4a1f] shadow-[0_18px_42px_rgba(120,82,38,0.18)]">
                        <div className="text-base font-semibold tracking-[0.12em]">界面加载超时</div>
                        <div className="mt-3 text-sm leading-6 opacity-90">
                            这个面板加载得太慢或中途断开了。你的进度不会因此丢失。
                            请先保存当前进度，再点下面的按钮重试；也可以关闭本界面后重新进入。
                        </div>
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg border border-wuxia-gold/40 bg-wuxia-gold/12 px-5 text-sm text-wuxia-gold"
                        >
                            重新加载
                        </button>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-3 block w-full text-xs opacity-70 underline underline-offset-2"
                        >
                            刷新整个页面（会退出当前对局）
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <React.Suspense
                fallback={<挂起计时器 onStart={this.开始计时} onDone={this.清除计时} />}
            >
                <React.Fragment key={this.state.重建序号}>
                    {this.props.children}
                </React.Fragment>
            </React.Suspense>
        );
    }
}

/**
 * 只负责在挂起期间启停计时器。
 * 挂载 = 开始计时，卸载 = chunk 已加载、Suspense 恢复渲染，清除计时。
 */
const 挂起计时器: React.FC<{ onStart: () => void; onDone: () => void }> = ({ onStart, onDone }) => {
    React.useEffect(() => {
        onStart();
        return onDone;
    }, [onStart, onDone]);
    return (
        <div className="lazy-scroll-loading pointer-events-none fixed inset-0 z-[260] flex items-center justify-center bg-[#f8f4e8]/70 px-6 py-10 text-center backdrop-blur-[2px]">
            <div
                className="lazy-scroll-shell rounded-2xl border border-wuxia-gold/35 bg-[#fffaf0]/95 px-6 py-5 text-[#7a4a1f] shadow-[0_18px_42px_rgba(120,82,38,0.18)]"
                style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}
            >
                <div className="lazy-scroll-title tracking-[0.22em]">卷轴展开中…</div>
                <div className="lazy-scroll-skeleton mt-5 grid gap-3 text-left" aria-hidden="true">
                    <div className="h-4 w-28 rounded-full bg-wuxia-gold/20" />
                    <div className="h-20 rounded-xl border border-wuxia-gold/20 bg-white/60" />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="h-16 rounded-lg border border-wuxia-gold/15 bg-white/55" />
                        <div className="h-16 rounded-lg border border-wuxia-gold/15 bg-white/55" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default 挂起超时边界;