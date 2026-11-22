import React from 'react';
import { 装备槽位列表 } from '../../utils/equipmentActions';
import type { 角色数据结构, 装备槽位 } from '../../types';
import StatDelta from './StatDelta';
import './CharacterJournal.css';

// Front view: the character's left is on the reader's right.
const bodyPositions = [
    ['头部', 66, 24], ['胸部', 66, 53], ['腹部', 66, 78],
    ['左手', 105, 98], ['右手', 27, 98], ['左腿', 81, 144], ['右腿', 51, 144],
] as const;

function readVital(value: unknown) {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

const injuryStates = new Set(['轻伤', '中伤', '重伤', '失能', '濒死', '死亡']);

function journalBodyStatus(current: number | undefined, max: number | undefined, reported: unknown) {
    if (current === undefined || max === undefined) return '未知';
    const status = typeof reported === 'string' ? reported.trim() : '';
    if (injuryStates.has(status)) return status;
    // 部位生命协议。旧档常把状态留为“正常”，此时以实际气血判断。
    const ratio = current / max;
    if (ratio >= 0.85) return '正常';
    if (ratio >= 0.60) return '轻伤';
    if (ratio >= 0.35) return '中伤';
    return current > 0 ? '重伤' : '气血耗尽';
}

function BodyJournal({ character }: { character: 角色数据结构 }) {
    const parts = bodyPositions.map(([name, x, y]) => {
        const current = readVital(character[`${name}当前血量`]);
        const max = readVital(character[`${name}最大血量`]) || undefined;
        const status = journalBodyStatus(current, max, character[`${name}状态`]);
        return { name, x, y, current, max, status, injured: status !== '正常' && status !== '未知' };
    });
    const injuries = parts.filter(part => part.injured);
    return (
        <>
            <svg className="journal-figure" viewBox="0 0 132 174" role="img" aria-label="正面身躯图，菱形标出受损部位">
                <g className="journal-silhouette" strokeLinejoin="round" strokeLinecap="round">
                    <path d="M60 12 Q57 7 61 4 Q66 0 71 5 Q74 9 70 12 M57 9 L78 5" />
                    <path d="M56 19 Q55 10 65 10 Q76 9 77 20 L75 28 Q73 36 66 38 Q58 36 56 28 Z" />
                    <path d="M56 21 Q64 20 68 15 Q71 19 77 21 M61 35 L60 40 M71 35 L72 40" />
                    <path d="M60 39 Q53 42 46 43 Q41 45 39 53 L31 74 L24 91 L33 95 L46 74
                        L51 63 L50 78 L44 109 Q54 115 66 117 Q80 115 88 109 L82 78 L81 63
                        L86 74 L99 95 L108 91 L101 74 L93 53 Q91 46 86 43 L72 39 L66 45 Z" />
                    <path d="M60 40 L71 50 M73 41 L57 68 M77 43 L61 70 M51 73 Q64 77 81 73 L82 79 Q65 83 50 79 Z
                        M71 80 Q75 88 70 100 L75 96 M57 85 L52 105 M80 92 L82 106 M32 88 L36 90 M96 90 L100 87" />
                    <path d="M25 92 L22 101 Q22 105 25 103 L28 99 Q27 106 30 103 L33 96
                        M107 92 L110 101 Q110 105 107 103 L104 99 Q105 106 102 103 L99 96" />
                    <path d="M48 112 Q48 126 46 139 L46 159 L55 159 L59 139 L66 119 L73 139 L77 159
                        L86 159 L86 139 Q84 126 84 112 M47 150 L56 151 M76 151 L85 150
                        M46 159 L41 165 Q40 169 46 168 L55 166 L55 159 M77 159 L77 166 L86 168 Q92 169 91 165 L86 159" />
                </g>
                {parts.map(part => (
                    <g key={part.name} transform={`translate(${part.x} ${part.y})`} data-part={part.name}>
                        {part.injured ? (
                            <g className="journal-wound">
                                <circle r="7" fill="none" stroke="currentColor" />
                                <path d="M0 -4 L4 0 0 4 -4 0Z" fill="currentColor" />
                            </g>
                        ) : <circle r="2" className="journal-dot" />}
                    </g>
                ))}
            </svg>
            {injuries.length ? (
                <div>
                    <h4 className="journal-caption">受损部位</h4>
                    <dl className="journal-readings">
                        {injuries.map(part => (
                            <div key={part.name}><dt>{part.name}</dt><dd>{part.current} / {part.max}</dd></div>
                        ))}
                    </dl>
                </div>
            ) : <p>{parts.every(part => part.status !== '未知') ? '各部位完好' : '部位气血待确认'}</p>}
            <details className="journal-details">
                <summary>全部部位</summary>
                <dl className="journal-readings">
                    {parts.map(part => (
                        <div key={part.name}>
                            <dt>{part.name}<small>{part.status}</small></dt>
                            <dd>{part.current ?? '—'} / {part.max ?? '—'} <StatDelta current={part.current} /></dd>
                        </div>
                    ))}
                </dl>
            </details>
        </>
    );
}

const slotIllustrations: Record<装备槽位, [string, string]> = {
    头部: ['头部', 'M3 13 Q3 5 8 4 Q13 4 13 13 Z M3 10 H13'],
    胸部: ['身体', 'M5 3 2 5 3 9 5 8 V14 H11 V8 L13 9 14 5 11 3 8 6 Z'],
    盔甲: ['盔甲', 'M4 3 8 5 12 3 14 6 12 8 11 12 8 14 5 12 4 8 2 6 Z M5 8 8 10 11 8'],
    内衬: ['内衬', 'M5 2 8 5 11 2 13 5 11 7 V14 H5 V7 L3 5 Z M10 5 6 10'],
    背部: ['背负', 'M4 6 Q4 3 8 3 Q12 3 12 6 V13 H4 Z M4 8 H12'],
    腰部: ['腰间', 'M2 6 H14 V10 H2 Z M7 5 H10 V11 H7 Z'],
    腿部: ['下装', 'M4 3 H12 L13 14 H9 L8 8 7 14 H3 Z'],
    足部: ['鞋履', 'M4 3 H10 V9 L14 11 V13 H3 L4 8 Z'],
    手部: ['护手', 'M5 3 12 5 10 13 3 11 Z M5 6 11 8'],
    主武器: ['主手', 'M3 13 6 10 M4 8 8 12 M6 9 12 3 14 2 13 6 8 11'],
    副武器: ['副手', 'M3 13 6 10 M4 8 8 12 M6 9 11 4 14 3 13 6 8 11'],
    暗器: ['暗器', 'M8 2 9 6 14 8 10 9 8 14 7 10 2 8 6 7 Z'],
    坐骑: ['坐骑', 'M4 14 Q4 11 8 8 L5 9 3 7 7 3 8 1 10 4 Q13 7 13 14 Z'],
};

function OutfitJournal({ character }: { character: 角色数据结构 }) {
    const slots = 装备槽位列表.map(key => {
        const [label, path] = slotIllustrations[key];
        const ref = character.装备?.[key];
        const value = typeof ref === 'string' ? ref.trim() : '';
        if (!value || value === '无') return { key, label, path, name: null };
        const item = character.物品列表?.find(item => item.ID === value || item.名称 === value);
        return { key, label, path, name: item?.名称 || value };
    });
    const worn = slots.filter(slot => slot.name);
    return (
        <>
            {worn.length ? (
                <dl className="journal-outfit">
                    {worn.map(slot => (
                        <div key={slot.key}>
                            <dt><svg viewBox="0 0 16 16" aria-hidden="true"><path d={slot.path} /></svg>{slot.label}</dt>
                            <dd>{slot.name}</dd>
                        </div>
                    ))}
                </dl>
            ) : <p>暂无穿戴</p>}
            <details className="journal-details">
                <summary>全部装备位</summary>
                <dl className="journal-readings">
                    {slots.map(slot => (
                        <div key={slot.key}><dt>{slot.label}</dt><dd>{slot.name ?? '空位'}</dd></div>
                    ))}
                </dl>
            </details>
        </>
    );
}

export default function CharacterJournal({ character }: { character: 角色数据结构 }) {
    const [active, setActive] = React.useState<'身躯' | '行头' | null>(null);
    const id = React.useId();
    const activeButton = React.useRef<HTMLButtonElement>(null);
    return (
        <section className="character-journal" aria-label="江湖手记">
            <h3>江湖手记</h3>
            <div className="journal-switch">
                {(['身躯', '行头'] as const).map(label => (
                    <button key={label} type="button" aria-expanded={active === label} aria-controls={id + label}
                        ref={active === label ? activeButton : undefined}
                        onClick={() => setActive(active === label ? null : label)}>{label}</button>
                ))}
                {active && <button type="button" className="journal-close" onClick={() => {
                    activeButton.current?.focus();
                    setActive(null);
                }}>收起</button>}
            </div>
            <div id={id + '身躯'} hidden={active !== '身躯'}>
                {active === '身躯' && <BodyJournal character={character} />}
            </div>
            <div id={id + '行头'} hidden={active !== '行头'}>
                {active === '行头' && <OutfitJournal character={character} />}
            </div>
        </section>
    );
}
