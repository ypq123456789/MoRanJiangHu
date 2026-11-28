import React, { useState } from 'react';
import type { 玩家可见世界圣经概览 } from '../../../engine/storyV2/legacySaveBridge';

function Spoiler({ label, children }: { label: string; children: React.ReactNode }) {
    const [revealed, setRevealed] = useState(false);
    return (
        <div className="mt-2 space-y-2">
            <button
                type="button"
                aria-label={`${revealed ? '收起' : '揭示'}${label}`}
                aria-expanded={revealed}
                onClick={() => setRevealed(value => !value)}
                className="rounded-md border border-current px-3 py-1.5 text-xs text-wuxia-gold focus-visible:outline focus-visible:outline-2 [html[data-theme='day']_&]:text-amber-900"
            >
                {!revealed && <span aria-hidden="true" className="mr-2 tracking-tight">▨▨▨</span>}
                {revealed ? '收起剧透' : '点击查看剧透'}
            </button>
            {revealed && children}
        </div>
    );
}

export function ActSolution({ act }: { act: 玩家可见世界圣经概览['公开分幕大纲'][number] }) {
    if (!act.主角目标与破局路径) return null;
    return (
        <div className="mt-2 text-xs leading-6 text-gray-300">
            <span>破局方向</span>
            <Spoiler key={act.主角目标与破局路径} label={`第 ${act.幕次} 幕破局方向`}>
                <p>{act.主角目标与破局路径}</p>
            </Spoiler>
        </div>
    );
}

export function WorldTiers({ tiers }: { tiers: 玩家可见世界圣经概览['空间阶梯'] }) {
    return (
        <Spoiler key={JSON.stringify(tiers)} label="天地空间阶梯">
            <div className="space-y-3">
                {tiers.map(tier => (
                    <div key={tier.层级序号} className="rounded-xl border border-gray-800 bg-black/35 p-3 text-xs leading-6 md:p-4">
                        <div className="font-bold text-amber-200">L{tier.层级序号} · {tier.层级名称}</div>
                        {tier.典型区域.length > 0 && <div className="mt-1 text-gray-400">代表地域：{tier.典型区域.join('、')}</div>}
                        {tier.准入壁垒 && <div className="text-gray-400">准入壁垒：{tier.准入壁垒}</div>}
                        {tier.核心资源与垄断者 && <div className="text-gray-400">核心资源与垄断者：{tier.核心资源与垄断者}</div>}
                        {tier.主要压迫冲突 && <div className="text-gray-300">主导冲突：{tier.主要压迫冲突}</div>}
                    </div>
                ))}
            </div>
        </Spoiler>
    );
}
