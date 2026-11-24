import React from 'react';
import {
    取NPC叙事名,
    取NPC真实名,
    取NPC稳定键,
    NPC名称需要打码
} from '../../../utils/npcNarrativeName';

interface Props {
    npc: any;
    revealed: boolean;
    onToggleReveal: (npcId: string) => void;
    className?: string;
    /** 详情大标题用大字号，列表卡片用默认字号 */
    nameClassName?: string;
}

/**
 * 道友录名称：正文称呼 + 真实姓名。
 * 两者不同时真实姓名默认打码，悬浮提示剧透，点击/回车揭示，再点收起。
 * 用 span[role=button] 而不是 button —— 列表卡片外层本身已是 button。
 */
export default function NpcRevealableName({
    npc,
    revealed,
    onToggleReveal,
    className = '',
    nameClassName = ''
}: Props) {
    const 叙事名 = 取NPC叙事名(npc);
    const 真实名 = 取NPC真实名(npc);
    const 需打码 = NPC名称需要打码(npc);
    const key = 取NPC稳定键(npc);
    const 打码中 = 需打码 && !revealed;
    const 提示 = 打码中
        ? `剧透：点击揭示真实姓名「${真实名}」，可能破坏叙事悬念`
        : 需打码
            ? '真实姓名已揭示，点击重新打码'
            : `真实姓名：${真实名}`;

    const 切换 = (event: React.MouseEvent | React.KeyboardEvent) => {
        if (!需打码) return;
        event.stopPropagation();
        onToggleReveal(key);
    };

    return (
        <span className={`inline-flex min-w-0 items-center ${className}`}>
            <span className={`min-w-0 truncate ${nameClassName}`} data-narrative-name>{叙事名}</span>
            {需打码 && (
                <>
                    <span aria-hidden="true" className="mx-1 shrink-0 opacity-40">/</span>
                    <span
                        role="button"
                        tabIndex={0}
                        title={提示}
                        aria-label={提示}
                        aria-pressed={revealed}
                        data-real-name-toggle={key}
                        onClick={切换}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                切换(event);
                            }
                        }}
                        className="inline-flex min-w-0 cursor-help items-center rounded px-0.5 text-wuxia-gold/80 transition-colors hover:text-wuxia-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-wuxia-gold/60 [html[data-theme='day']_&]:text-amber-900"
                    >
                        <span
                            className={`min-w-0 truncate ${打码中 ? 'npc-real-name-mosaic' : ''}`}
                            data-real-name={revealed ? 真实名 : undefined}
                        >{真实名}</span>
                    </span>
                </>
            )}
        </span>
    );
}
