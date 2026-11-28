import React from 'react';
import type { 势力关系图节点 } from '../../../utils/worldFactionRelations';
import './factionReputation.css';

export function FactionReputationChart({ nodes }: { nodes: 势力关系图节点[] }) {
    if (!nodes.length) return null;
    return (
        <figure className="faction-reputation" aria-label="主角势力声望">
            <figcaption>主角势力声望</figcaption>
            <div className="faction-axis-row" aria-hidden="true"><span /><div className="faction-axis-scale"><span>−100</span><span>0</span><span>+100</span></div></div>
            <ul>{nodes.map(({ id, name, reputation, isPlayerFaction }) => {
                const tone = reputation === undefined ? 'unknown' : reputation > 0 ? 'positive' : reputation < 0 ? 'negative' : 'neutral';
                const label = reputation === undefined ? '未记录' : reputation < 0 ? `−${-reputation}` : reputation > 0 ? `+${reputation}` : '0';
                return (
                    <li key={id} className="faction-axis-row" data-tone={tone}>
                        <span className="faction-axis-name">{name}{isPlayerFaction && <small className="faction-membership">主角所属</small>}</span>
                        <div className="faction-axis-track">
                            {reputation !== undefined && <i style={{ left: `${50 + Math.min(reputation, 0) / 2}%`, width: `${Math.abs(reputation) / 2}%` }} />}
                            <span className="faction-axis-value" style={{ left: `clamp(1.5rem, ${50 + (reputation || 0) / 2}%, calc(100% - 1.5rem))` }}>{label}</span>
                        </div>
                    </li>
                );
            })}</ul>
        </figure>
    );
}
