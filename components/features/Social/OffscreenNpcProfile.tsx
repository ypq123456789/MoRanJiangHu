import React from 'react';
import type { NPC结构 } from '../../../models/social';

export function OffscreenNpcProfile({ npc, onMeet, onForget }: {
    npc: NPC结构; onMeet?: () => void; onForget?: () => void;
}) {
    return (
        <section className="m-3 rounded-xl border border-gray-500/40 bg-ink-wash/5 p-5" aria-label="已知人物线索">
            <h3 className="text-xl font-serif font-bold text-wuxia-gold">{npc.姓名}</h3>
            <p className="mt-2 text-sm text-gray-400">{npc.身份} · 已闻其名 · 不在场</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-200">{npc.简介}</p>
            {(onMeet || onForget) && <div className="mt-5 flex flex-wrap gap-3 text-sm">
                {onMeet && <button type="button" className="rounded border border-current px-3 py-1 text-wuxia-gold" onClick={onMeet}>设为在场</button>}
                {onForget && <button type="button" className="rounded border border-current px-3 py-1 text-gray-400" onClick={onForget}>忘却此人</button>}
            </div>}
        </section>
    );
}
