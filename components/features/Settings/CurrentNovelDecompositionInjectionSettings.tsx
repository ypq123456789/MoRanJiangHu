import React, { useEffect, useMemo, useState } from 'react';
import { OpeningConfig, 剧情系统结构, 接口设置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import { 获取激活小说拆分注入文本 } from '../../../services/novelDecompositionInjection';

interface Props {
    settings: 接口设置结构;
    story?: 剧情系统结构;
    openingConfig?: OpeningConfig;
    playerName?: string;
}

type 注入状态 = {
    loading: boolean;
    planning: string;
    worldEvolution: string;
    error: string;
    refreshedAt: number;
};

const 空状态: 注入状态 = {
    loading: false,
    planning: '',
    worldEvolution: '',
    error: '',
    refreshedAt: 0
};

const CurrentNovelDecompositionInjectionSettings: React.FC<Props> = ({ settings, story, openingConfig, playerName }) => {
    const [state, setState] = useState<注入状态>(空状态);

    const refresh = React.useCallback(async () => {
        setState((prev) => ({
            ...prev,
            loading: true,
            error: ''
        }));
        try {
            const [planning, worldEvolution] = await Promise.all([
                获取激活小说拆分注入文本(settings, 'planning', openingConfig, story, playerName),
                获取激活小说拆分注入文本(settings, 'world_evolution', openingConfig, story, playerName)
            ]);
            setState({
                loading: false,
                planning: planning.trim(),
                worldEvolution: worldEvolution.trim(),
                error: '',
                refreshedAt: Date.now()
            });
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: error?.message || '读取当前小说分解注入失败'
            }));
        }
    }, [openingConfig, playerName, settings, story]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const feature = settings?.功能模型占位;
    const sections = useMemo(() => ([
        {
            id: 'planning',
            title: '剧情规划分析独立API',
            enabled: feature?.小说拆分功能启用 === true && feature?.小说拆分规划分析注入 !== false,
            content: state.planning,
            emptyText: '当前没有可用的规划分析实时注入内容。可能是未启用小说分解、未设置激活数据集，或当前章节还未对齐到已完成分段。'
        },
        {
            id: 'world_evolution',
            title: '世界演变独立API',
            enabled: feature?.小说拆分功能启用 === true && feature?.小说拆分世界演变注入 !== false,
            content: state.worldEvolution,
            emptyText: '当前没有可用的世界演变实时注入内容。可能是未启用小说分解、未设置激活数据集，或当前章节还未对齐到已完成分段。'
        }
    ]), [feature?.小说拆分世界演变注入, feature?.小说拆分功能启用, feature?.小说拆分规划分析注入, state.planning, state.worldEvolution]);

    return (
        <div className="space-y-6">
            <div className="rounded-md border border-emerald-500/20 bg-black/25 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-emerald-200 font-serif font-bold text-xl">当前小说分解注入情况</h3>
                        <div className="mt-1 text-xs text-gray-400">
                            这里展示当前游玩存档下，实际供“剧情规划分析独立API”和“世界演变独立API”使用的实时小说分解注入内容。
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                            该页面读取的是当前存档实时对齐后的注入文本，不是工作台里保存的完整快照。
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-[11px] text-gray-500">
                            最近刷新：<span className="text-gray-300">{state.refreshedAt > 0 ? new Date(state.refreshedAt).toLocaleString() : '尚未刷新'}</span>
                        </div>
                        <GameButton onClick={() => { void refresh(); }} variant="secondary" className="px-4 py-2 text-xs" disabled={state.loading}>
                            {state.loading ? '刷新中...' : '立即刷新'}
                        </GameButton>
                    </div>
                </div>

                {state.error && (
                    <div className="rounded border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                        {state.error}
                    </div>
                )}

                {sections.map((section) => (
                    <div key={section.id} className="rounded border border-gray-800 bg-black/35 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-emerald-100">{section.title}</div>
                            <div className={`text-[11px] ${section.enabled ? 'text-emerald-300' : 'text-gray-500'}`}>
                                {section.enabled ? '已启用注入' : '当前链路未启用'}
                            </div>
                        </div>
                        <div className="mt-3 rounded border border-gray-800 bg-black/45">
                            {section.content ? (
                                <pre className="max-h-[420px] overflow-y-auto custom-scrollbar px-3 py-3 text-[11px] leading-relaxed whitespace-pre-wrap text-emerald-100">
                                    {section.content}
                                </pre>
                            ) : (
                                <div className="px-3 py-4 text-xs text-gray-500">
                                    {section.enabled ? section.emptyText : '该链路当前未启用小说分解注入，因此不会生成实时内容。'}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CurrentNovelDecompositionInjectionSettings;
