import { 地点路径匹配分支, type 地点树节点 } from './locationTree';

export type NPC地图环境 = {
    大地点?: string;
    中地点?: string;
    小地点?: string;
    具体地点?: string;
};

type 地图节点摘录 = Pick<地点树节点, 'ID' | '名称'>;

const 取文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const 归一化NPC地图文本 = (value: unknown): string => (
    String(value || '').trim().replace(/\s+/g, '').toLowerCase()
);

export const 地图文本相互命中 = (left: unknown, right: unknown): boolean => {
    const a = 归一化NPC地图文本(left);
    const b = 归一化NPC地图文本(right);
    if (!a || !b) return false;
    if (a === b) return true;
    return (a.length >= 2 && b.includes(a)) || (b.length >= 2 && a.includes(b));
};

const 拆分位置文本 = (value: unknown): string[] => {
    const text = 取文本(value);
    if (!text) return [];
    return [text, ...text.split(/[>＞／/\\·•\-—|｜,，、;；→]+/u)].map(取文本).filter(Boolean);
};

const 去重归一文本 = (items: unknown[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    items.forEach((item) => {
        const normalized = 归一化NPC地图文本(item);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
};

export const 提取NPC地图位置片段 = (npc: any): string[] => {
    if (!npc || typeof npc !== 'object') return [];
    const rawItems = [
        ...拆分位置文本(npc?.位置路径),
        ...拆分位置文本(npc?.当前位置),
        ...拆分位置文本(npc?.当前地点),
        ...拆分位置文本(npc?.所在地点),
        ...拆分位置文本(npc?.所在位置),
        ...拆分位置文本(npc?.具体地点),
        ...拆分位置文本(npc?.地点),
        ...拆分位置文本(npc?.位置),
        ...拆分位置文本(npc?.归属?.具体地点),
        ...拆分位置文本(npc?.归属?.小地点),
        ...拆分位置文本(npc?.归属?.中地点),
        ...拆分位置文本(npc?.归属?.大地点),
    ];
    return 去重归一文本(rawItems);
};

const 提取NPC位置记录 = (npc: any): string[] => [
    npc?.位置路径, npc?.当前位置, npc?.当前地点, npc?.所在地点, npc?.所在位置,
    npc?.具体地点, npc?.地点, npc?.位置, npc?.归属?.具体地点
].map(取文本).filter(Boolean);

export const 提取NPC精确地图位置片段 = (npc: any): string[] =>
    去重归一文本(提取NPC位置记录(npc).flatMap(拆分位置文本));

export const NPC有显式地图位置 = (npc: any): boolean => 提取NPC地图位置片段(npc).length > 0;

export interface 地图人物标记 { name: string; player: boolean }

/** 地图画布、地点索引共用人物落点。已知同一场所的在场人物可跟随玩家细化到房间。 */
export const 构建地图人物标记 = (
    roots: 地点树节点[], currentId: string, social: any[], playerName: string
): Map<string, 地图人物标记[]> => {
    const nodes: { node: 地点树节点; name: string; ancestors: string[] }[] = [];
    const visited = new Set<string>();
    const collect = (node: 地点树节点, ancestors: string[]) => {
        if (visited.has(node.ID)) return;
        visited.add(node.ID);
        const name = 归一化NPC地图文本(node.名称);
        nodes.push({ node, name, ancestors });
        (node.子节点 || []).forEach(child => collect(child, [...ancestors, name]));
    };
    roots.forEach(root => collect(root, []));
    const result = new Map<string, 地图人物标记[]>();
    const placed = new Set<string>();
    const add = (id: string, name: string, player: boolean) => {
        if (!id || !name || placed.has(name)) return;
        const group = result.get(id) || [];
        group.push({ name, player });
        placed.add(name);
        result.set(id, group);
    };
    add(currentId, playerName.trim(), true);
    const current = nodes.find(entry => entry.node.ID === currentId);
    const currentBranch = current ? [...current.ancestors, current.name] : [];
    for (const npc of social) {
        const records = 提取NPC位置记录(npc);
        const parts = 去重归一文本(records.flatMap(拆分位置文本));
        const name = 取文本(npc?.姓名) || 取文本(npc?.名称);
        if (!parts.length) {
            if (npc?.是否在场 === true) add(currentId, name, false);
            continue;
        }
        const exact = nodes.filter(entry => parts.includes(entry.name));
        const candidates = exact.length ? exact : nodes.filter(entry =>
            entry.name.length >= 2 && parts.some(part => part.includes(entry.name)));
        const ancestorsMatched = (ancestors: string[]) => ancestors.filter(label =>
            parts.some(part => part.includes(label))).length;
        candidates.sort((a, b) => ancestorsMatched(b.ancestors) - ancestorsMatched(a.ancestors)
            || (exact.length ? 0 : b.name.length - a.name.length)
            || b.ancestors.length - a.ancestors.length
            || Number(npc.是否在场 === true && b.node.ID === currentId) - Number(npc.是否在场 === true && a.node.ID === currentId));
        const onPlayerBranch = records.every(record => 地点路径匹配分支(record, currentBranch));
        const target = candidates.find(entry => entry.node.ID !== currentId || onPlayerBranch)?.node;
        if (!target) continue;
        const sameBuilding = npc?.是否在场 === true && current?.node.层级 === '子地点'
            && target.ID === current.node.父级ID && target.层级 === '区地点' && onPlayerBranch;
        add(sameBuilding ? currentId : target.ID, name, false);
    }
    return result;
};

export const NPC有精确地图位置 = (npc: any): boolean => 提取NPC精确地图位置片段(npc).length > 0;

export const NPC位置命中名称 = (npc: any, name: unknown): boolean => {
    const target = 归一化NPC地图文本(name);
    if (!target) return false;
    return 提取NPC地图位置片段(npc).some((part) => 地图文本相互命中(part, target));
};

export const 构建当前地点候选 = (
    env?: NPC地图环境 | null,
    currentLocationName?: string
): string[] => 去重归一文本([
    currentLocationName,
    env?.具体地点,
    env?.小地点,
    env?.中地点,
    env?.大地点,
]);

export const 构建当前叶子地点候选 = (
    env?: NPC地图环境 | null,
    currentLocationName?: string
): string[] => 去重归一文本([
    currentLocationName,
    env?.具体地点,
]);

export const NPC显式位置命中任一 = (npc: any, names: unknown[]): boolean => {
    const parts = 提取NPC地图位置片段(npc);
    if (parts.length === 0) return false;
    return names.some((name) => parts.some((part) => 地图文本相互命中(part, name)));
};

export const NPC精确位置命中任一 = (npc: any, names: unknown[]): boolean => {
    const parts = 提取NPC精确地图位置片段(npc);
    if (parts.length === 0) return false;
    return names.some((name) => parts.some((part) => 地图文本相互命中(part, name)));
};

export const 选择NPC精确匹配地图节点 = (
    npc: any,
    nodes: 地图节点摘录[]
): 地图节点摘录 | null => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const parts = 提取NPC精确地图位置片段(npc);
    if (parts.length === 0) return null;
    const exact = nodes.find((node) => {
        const nodeName = 归一化NPC地图文本(node?.名称);
        return Boolean(nodeName && parts.some((part) => part === nodeName));
    });
    if (exact) return exact;
    return nodes.find((node) => {
        const nodeName = 归一化NPC地图文本(node?.名称);
        return Boolean(nodeName && parts.some((part) => 地图文本相互命中(part, nodeName)));
    }) || null;
};

export const 选择NPC匹配地图节点 = (
    npc: any,
    nodes: 地图节点摘录[],
    options: {
        env?: NPC地图环境 | null;
        currentLocationName?: string;
    } = {}
): 地图节点摘录 | null => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const parts = 提取NPC地图位置片段(npc);

    const exact = nodes.find((node) => {
        const nodeName = 归一化NPC地图文本(node?.名称);
        return Boolean(nodeName && parts.some((part) => part === nodeName));
    });
    if (exact) return exact;

    const fuzzy = nodes.find((node) => NPC位置命中名称(npc, node?.名称));
    if (fuzzy) return fuzzy;

    const currentLeafNames = 构建当前叶子地点候选(options.env, options.currentLocationName);
    const currentNode = nodes.find((node) => currentLeafNames.some((name) => 地图文本相互命中(node?.名称, name)));
    if (!currentNode) return null;

    const hasExplicitLocation = parts.length > 0;
    if (!hasExplicitLocation && npc?.是否在场 === true) return currentNode;
    if (hasExplicitLocation && NPC显式位置命中任一(npc, currentLeafNames)) return currentNode;
    return null;
};

export const NPC属于地图视图 = (
    npc: any,
    nodes: 地图节点摘录[],
    options: {
        env?: NPC地图环境 | null;
        currentLocationName?: string;
        viewNodeName?: string;
        viewPathNames?: string[];
    } = {}
): boolean => {
    if (选择NPC匹配地图节点(npc, nodes, options)) return true;

    const viewNames = 去重归一文本([
        options.viewNodeName,
        ...(Array.isArray(options.viewPathNames) ? options.viewPathNames : []),
    ]);
    const currentNames = 构建当前地点候选(options.env, options.currentLocationName);
    const parts = 提取NPC地图位置片段(npc);

    if (parts.length > 0) {
        return viewNames.some((name) => parts.some((part) => 地图文本相互命中(part, name)));
    }

    if (npc?.是否在场 !== true) return false;
    return viewNames.length === 0 || viewNames.some((name) => currentNames.some((current) => 地图文本相互命中(name, current)));
};

