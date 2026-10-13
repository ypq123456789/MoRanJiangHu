import React from 'react';
import { isDynamicImportFetchError, isLazyImportInGameActive } from '../../utils/lazyImportWithReload';
import { 重置懒组件重建 } from '../../utils/lazyComponentRebuild';

export class ModalErrorBoundary extends React.Component<
    {
        children: React.ReactNode;
        title: string;
        onClose?: () => void;
        /** 游戏态加载失败时要重建的懒组件 importKey（移动/桌面两套可同时给）。 */
        importKeys?: string[];
    },
    { error: Error | null; 重试序号: number }
> {
    state: { error: Error | null; 重试序号: number } = { error: null, 重试序号: 0 };

    static getDerivedStateFromError(error: Error): Partial<{ error: Error | null; 重试序号: number }> {
        // React 约定：这里只返回需要更新的字段。
        // 重试序号不在此重置——它只在 handleRetry 清空 error 时递增，
        // 用来强制重新挂载 children 以配合懒组件重建。
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error('Modal render failed:', error);
    }

    handleRetry = () => {
        this.props.importKeys?.forEach((importKey) => {
            // 重建出全新的 React.lazy 实例，绕开 React 缓存的 rejected payload。
            重置懒组件重建(importKey);
        });
        this.setState((prev) => ({ error: null, 重试序号: prev.重试序号 + 1 }));
    };

    render() {
        if (!this.state.error) {
            return <React.Fragment key={this.state.重试序号}>{this.props.children}</React.Fragment>;
        }

        const isLazyImportError = isDynamicImportFetchError(this.state.error);
        // 游戏态内不允许刷新页面（view 不持久化，刷新= 退出对局 + 丢进度），
        // 只能靠重建懒组件重试。
        const 游戏态内 = isLazyImportInGameActive();
        const 可重试 = isLazyImportError
            && 游戏态内
            && (this.props.importKeys?.length || 0) > 0;

        return (
            <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/88 px-5 py-8">
                <div className="w-full max-w-md rounded-2xl border border-red-500/45 bg-[#120909] p-5 text-red-100 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                    <div className="text-base font-semibold tracking-[0.12em] text-red-200">{this.props.title}</div>
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-red-100/90">
                        {this.state.error.message || '界面渲染失败'}
                    </div>
                    <div className="mt-4 text-xs leading-5 text-red-200/70">
                        {isLazyImportError
                            ? (游戏态内
                                ? '当前进度不会因此丢失。请先保存进度，再点击「重新加载」重试打开本界面。'
                                : '检测到页面资源已经更新，但当前页面还停留在旧版本。点击下面按钮刷新后，通常就能直接恢复。')
                            : '这次错误已写入运行日志。可打开"设置 → 运行日志"查看详情、复制诊断或点击"上报日志"提交给维护人员。'}
                    </div>
                    {可重试 && (
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 text-sm text-wuxia-gold"
                        >
                            重新加载
                        </button>
                    )}
                    {isLazyImportError && !游戏态内 && (
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 text-sm text-wuxia-gold"
                        >
                            刷新重试
                        </button>
                    )}
                    {this.props.onClose && (
                        <button
                            type="button"
                            onClick={this.props.onClose}
                            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-red-300/40 bg-red-950/40 px-4 text-sm text-red-50"
                        >
                            关闭
                        </button>
                    )}
                </div>
            </div>
        );
    }
}