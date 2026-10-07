/**
 * 功能模型配置建议的问号说明弹层。
 *
 * 挂在「功能模型工作流」流程图的每张卡片旁，回答「这个功能该配什么模型」。
 * 文案来自 `data/modelConfigAdvice.ts`，与 `stageToggleTips`（回答「开了做什么」）互补。
 */
import React, { useEffect, useRef, useState } from 'react';
import { 功能模型配置建议, type 功能模型建议 } from '../../../data/modelConfigAdvice';

const 档位标签: Array<{ key: keyof 功能模型建议['推荐档位']; className: string }> = [
    { key: '省钱', className: 'text-emerald-300' },
    { key: '均衡', className: 'text-cyan-300' },
    { key: '效果', className: 'text-amber-300' }
];

export const 功能模型建议说明: React.FC<{ stageId: string }> = ({ stageId }) => {
    const 建议 = 功能模型配置建议[stageId];
    const [展开, set展开] = useState(false);
    const [向上展开, 设置向上展开] = useState(false);
    const 容器Ref = useRef<HTMLDivElement | null>(null);

    // 设置页的这些标题常靠近面板顶部，固定向上展开会被视口裁掉。
    // 打开前先量一下：上方放不下就改向下展开。
    const 切换展开 = () => {
        if (!展开) {
            const rect = 容器Ref.current?.getBoundingClientRect();
            const 估算弹层高度 = 320;
            设置向上展开(Boolean(rect) && rect.top > 估算弹层高度 + 16);
        }
        set展开((prev) => !prev);
    };

    useEffect(() => {
        if (!展开) return undefined;
        const 点击外部关闭 = (event: MouseEvent) => {
            if (!容器Ref.current?.contains(event.target as Node)) set展开(false);
        };
        const 按Esc关闭 = (event: KeyboardEvent) => {
            if (event.key === 'Escape') set展开(false);
        };
        // 延到下一帧再监听，避免打开这次点击立刻被当成「外部点击」关掉。
        const timer = window.setTimeout(() => {
            document.addEventListener('mousedown', 点击外部关闭);
            document.addEventListener('keydown', 按Esc关闭);
        }, 0);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('mousedown', 点击外部关闭);
            document.removeEventListener('keydown', 按Esc关闭);
        };
    }, [展开]);

    if (!建议) return null;

    return (
        <div ref={容器Ref} className="relative inline-flex shrink-0">
            <button
                type="button"
                aria-label={`查看${建议.功能名}的模型配置建议`}
                aria-expanded={展开}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    切换展开();
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 bg-black/30 text-[10px] leading-none text-gray-400 transition-colors hover:border-wuxia-gold/70 hover:text-wuxia-gold cursor-help"
            >
                ?
            </button>
            {展开 && (
                <div className={`absolute right-0 z-50 w-[19rem] max-w-[calc(100vw-3rem)] rounded-md border border-wuxia-gold/35 bg-gray-950 px-3 py-2.5 text-left text-[11px] leading-5 text-gray-200 shadow-xl ${
                    向上展开 ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}>
                    <div className="mb-1 text-[12px] font-bold text-wuxia-gold">{建议.功能名} · 模型配置建议</div>
                    <div className="mb-2 text-gray-300">{建议.作用}</div>

                    <div className="mb-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-gray-400">
                        <span className="text-gray-300">不独立配置：</span>{建议.不独立配置}
                    </div>

                    <div className="mb-2 space-y-1">
                        {档位标签.map(({ key, className }) => (
                            <div key={key} className="flex gap-1.5">
                                <span className={`shrink-0 font-bold ${className}`}>{key}</span>
                                <span className="text-gray-300">{建议.推荐档位[key]}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mb-2">
                        <span className="text-gray-300">常见误区：</span>{建议.常见误区}
                    </div>

                    {建议.中转站注意 && (
                        <div className="rounded border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 text-amber-200/90">
                            <span className="font-bold">中转站注意：</span>{建议.中转站注意}
                        </div>
                    )}

                    <div className={`absolute right-3 border-4 border-transparent ${
                        向上展开 ? 'top-full border-t-gray-950' : 'bottom-full border-b-gray-950'
                    }`} />
                </div>
            )}
        </div>
    );
};

export default 功能模型建议说明;