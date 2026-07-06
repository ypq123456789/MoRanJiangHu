export type 势力关系边 = {
    sourceId: string;
    sourceName: string;
    targetId: string;
    targetName: string;
    relation: string;
};

export type 势力关系色调 = 'good' | 'neutral' | 'bad';

export type 势力关系图节点 = {
    id: string;
    name: string;
    x: number;
    y: number;
};

export type 势力关系图边 = 势力关系边 & {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    tone: 势力关系色调;
};

const 取文本 = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const 规范关系 = (value: unknown): string => {
    if (typeof value === 'string') return value.trim() || '未知';
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        for (const key of ['关系', 'relation', '类型', 'type']) {
            const text = 取文本(record[key]);
            if (text) return text;
        }
    }
    return '未知';
};

export const 构建势力名称索引 = (factions: unknown): Map<string, string> => {
    const index = new Map<string, string>();
    (Array.isArray(factions) ? factions : []).forEach((item, arrayIndex) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        const id = 取文本(record.ID) || `faction-${arrayIndex + 1}`;
        const name = 取文本(record.名称) || `势力 ${arrayIndex + 1}`;
        index.set(id, name);
        index.set(name, name);
    });
    return index;
};

export const 解析势力关系条目 = (
    relationNet: unknown,
    nameIndex: Map<string, string>
): Array<{ targetId: string; targetName: string; relation: string }> => {
    const relations: Array<{ targetId: string; targetName: string; relation: string }> = [];
    const pushRelation = (targetRaw: unknown, relationRaw: unknown) => {
        const targetId = 取文本(targetRaw);
        if (!targetId) return;
        relations.push({
            targetId,
            targetName: nameIndex.get(targetId) || targetId,
            relation: 规范关系(relationRaw)
        });
    };

    if (Array.isArray(relationNet)) {
        relationNet.forEach((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return;
            const record = item as Record<string, unknown>;
            const explicitTarget = record.势力 ?? record.名称 ?? record.ID ?? record.target ?? record.targetId;
            if (explicitTarget) {
                pushRelation(explicitTarget, record.关系 ?? record.relation ?? record.类型 ?? record.type);
                return;
            }
            const [key, value] = Object.entries(record)[0] || [];
            if (key) pushRelation(key, value);
        });
        return relations;
    }

    if (relationNet && typeof relationNet === 'object') {
        Object.entries(relationNet as Record<string, unknown>).forEach(([key, value]) => {
            pushRelation(key, value);
        });
    }

    return relations;
};

export const 构建势力关系边列表 = (factions: unknown): 势力关系边[] => {
    const list = Array.isArray(factions) ? factions : [];
    const nameIndex = 构建势力名称索引(list);
    const seen = new Set<string>();
    const edges: 势力关系边[] = [];

    list.forEach((item, arrayIndex) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        const sourceId = 取文本(record.ID) || `faction-${arrayIndex + 1}`;
        const sourceName = 取文本(record.名称) || nameIndex.get(sourceId) || `势力 ${arrayIndex + 1}`;
        解析势力关系条目(record.关系网, nameIndex).forEach((relation) => {
            if (relation.targetId === sourceId || relation.targetName === sourceName) return;
            const pairKey = [sourceId, relation.targetId].sort().join('|');
            const dedupeKey = `${pairKey}|${relation.relation}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            edges.push({
                sourceId,
                sourceName,
                targetId: relation.targetId,
                targetName: relation.targetName,
                relation: relation.relation
            });
        });
    });

    return edges;
};

export const 归类势力关系色调 = (relation: string): 势力关系色调 => {
    const text = 取文本(relation);
    if (/敌|仇|冲突|战争|围剿|敌对| hostile/i.test(text)) return 'bad';
    if (/友|盟|联盟|同盟|亲善|合作|友好| ally|alliance|friendly/i.test(text)) return 'good';
    return 'neutral';
};

export const 构建势力关系图数据 = (factions: unknown): {
    nodes: 势力关系图节点[];
    edges: 势力关系图边[];
} => {
    const list = Array.isArray(factions) ? factions : [];
    const nodes: 势力关系图节点[] = list
        .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const record = item as Record<string, unknown>;
            const id = 取文本(record.ID) || `faction-${index + 1}`;
            const name = 取文本(record.名称) || `势力 ${index + 1}`;
            const total = Math.max(list.length, 1);
            const angle = (Math.PI * 2 * index / total) - Math.PI / 2;
            const radius = total <= 2 ? 28 : 36;
            return {
                id,
                name,
                x: 50 + Math.cos(angle) * radius,
                y: 50 + Math.sin(angle) * radius
            };
        })
        .filter(Boolean) as 势力关系图节点[];
    const nodeByKey = new Map<string, 势力关系图节点>();
    nodes.forEach((node) => {
        nodeByKey.set(node.id, node);
        nodeByKey.set(node.name, node);
    });

    const edges = 构建势力关系边列表(list)
        .map((edge) => {
            const source = nodeByKey.get(edge.sourceId) || nodeByKey.get(edge.sourceName);
            const target = nodeByKey.get(edge.targetId) || nodeByKey.get(edge.targetName);
            if (!source || !target) return null;
            return {
                ...edge,
                sourceX: source.x,
                sourceY: source.y,
                targetX: target.x,
                targetY: target.y,
                tone: 归类势力关系色调(edge.relation)
            };
        })
        .filter(Boolean) as 势力关系图边[];
    const edgePairKeys = new Set(edges.map((edge) => [edge.sourceId, edge.targetId].sort().join('|')));

    nodes.forEach((source, sourceIndex) => {
        nodes.slice(sourceIndex + 1).forEach((target) => {
            const pairKey = [source.id, target.id].sort().join('|');
            if (edgePairKeys.has(pairKey)) return;
            edgePairKeys.add(pairKey);
            edges.push({
                sourceId: source.id,
                sourceName: source.name,
                targetId: target.id,
                targetName: target.name,
                relation: '中立',
                sourceX: source.x,
                sourceY: source.y,
                targetX: target.x,
                targetY: target.y,
                tone: 'neutral'
            });
        });
    });

    return { nodes, edges };
};
