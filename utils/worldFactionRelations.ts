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
    scope: string;
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

export const 是内部ID = (value: string): boolean => /^(FCT-\d+|sect_[a-z0-9_/-]+|sect-member-[a-z0-9_/-]+)$/i.test(value.trim());

const 取势力范围 = (record: Record<string, unknown>): string => (
    取文本(record.地盘归属)
    || 取文本(record.势力范围)
    || 取文本(record.范围)
    || 取文本(record.所在地)
    || 取文本(record.区域)
    || '未分域'
);

const 取势力显示名 = (record: Record<string, unknown>, fallback = ''): string => {
    const name = 取文本(record.名称) || 取文本(record.name) || 取文本(record.显示名称) || 取文本(record.title);
    if (name && !是内部ID(name)) return name;
    return fallback;
};

export const 构建世界显示名解析器 = (
    factions: unknown,
    sects?: unknown
): ((value: unknown, fallback?: string) => string) => {
    const index = new Map<string, string>();
    const addRecord = (item: unknown, arrayIndex: number) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        const name = 取势力显示名(record);
        if (!name) return;
        [record.ID, record.id, record.名称, record.name].forEach((raw) => {
            const key = 取文本(raw);
            if (key) index.set(key, name);
        });
        index.set(name, name);
        index.set(`势力 ${arrayIndex + 1}`, name);
    };

    (Array.isArray(factions) ? factions : []).forEach(addRecord);
    (Array.isArray(sects) ? sects : (sects ? [sects] : [])).forEach(addRecord);

    return (value: unknown, fallback = ''): string => {
        const text = 取文本(value);
        if (!text) return fallback;
        if (index.has(text)) return index.get(text) || fallback;
        if (/[,，、\s]+/.test(text)) {
            const parts = text
                .split(/[,，、\s]+/u)
                .map((part) => index.get(part.trim()) || (是内部ID(part) ? '' : part.trim()))
                .filter(Boolean);
            return Array.from(new Set(parts)).join('、') || fallback;
        }
        if (是内部ID(text)) return fallback;
        return text;
    };
};

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
        const name = 取势力显示名(record, `势力 ${arrayIndex + 1}`);
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
        const sourceName = 取势力显示名(record, nameIndex.get(sourceId) || `势力 ${arrayIndex + 1}`);
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
    const rawNodes: 势力关系图节点[] = list
        .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const record = item as Record<string, unknown>;
            const id = 取文本(record.ID) || `faction-${index + 1}`;
            const name = 取势力显示名(record, `势力 ${index + 1}`);
            const scope = 取势力范围(record);
            return {
                id,
                name,
                scope,
                x: 50,
                y: 50
            };
        })
        .filter(Boolean) as 势力关系图节点[];
    const scopeNames = Array.from(new Set(rawNodes.map(node => node.scope)));
    const scopeCenters = new Map<string, { x: number; y: number }>();
    scopeNames.forEach((scope, index) => {
        const totalScopes = Math.max(scopeNames.length, 1);
        if (totalScopes === 1) {
            scopeCenters.set(scope, { x: 50, y: 50 });
            return;
        }
        const angle = (Math.PI * 2 * index / totalScopes) - Math.PI / 2;
        const radius = totalScopes <= 2 ? 24 : 30;
        scopeCenters.set(scope, {
            x: 50 + Math.cos(angle) * radius,
            y: 50 + Math.sin(angle) * radius
        });
    });
    const nodes = rawNodes.map((node) => {
        const sameScope = rawNodes.filter(item => item.scope === node.scope);
        const index = sameScope.findIndex(item => item.id === node.id);
        const center = scopeCenters.get(node.scope) || { x: 50, y: 50 };
        const total = Math.max(sameScope.length, 1);
        const angle = (Math.PI * 2 * index / total) - Math.PI / 2;
        const radius = scopeNames.length === 1
            ? (total <= 2 ? 26 : total <= 8 ? 34 : 39)
            : (total <= 2 ? 9 : total <= 5 ? 13 : 16);
        return {
            ...node,
            x: Math.max(8, Math.min(92, center.x + Math.cos(angle) * radius)),
            y: Math.max(8, Math.min(92, center.y + Math.sin(angle) * radius))
        };
    });
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

    return { nodes, edges };
};
