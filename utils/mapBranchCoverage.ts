type BranchNode = { ID?: string; 父级ID?: string; 名称?: string; 层级?: string };

const 下级类型: Record<string, string> = { 寰宇: '大地点', 大地点: '中地点', 中地点: '小地点' };

function 统计地图分支缺口(nodes: BranchNode[]) {
    const children = new Map<string, Set<string>>();
    const ids = new Set(nodes.map(node => node?.ID).filter(Boolean));
    const parentsByName = new Map<string, BranchNode[]>();
    const 地点标识 = (node: BranchNode) => node.ID || JSON.stringify([node.父级ID || '', node.层级, node.名称]);
    for (const node of nodes) {
        const level = 下级类型[node?.层级 || ''];
        if (!level || typeof node.名称 !== 'string') continue;
        const key = JSON.stringify([node.名称.trim(), level]);
        const matches = parentsByName.get(key) || [];
        matches.push(node);
        parentsByName.set(key, matches);
    }
    for (const node of nodes) {
        if (!node?.父级ID || typeof node.名称 !== 'string' || !node.名称.trim()) continue;
        const matches = parentsByName.get(JSON.stringify([node.父级ID, node.层级]));
        const parent = ids.has(node.父级ID) ? node.父级ID : matches?.length === 1 ? 地点标识(matches[0]) : '';
        if (!parent) continue;
        const key = JSON.stringify([parent, node.层级]);
        const names = children.get(key) || new Set<string>();
        names.add(node.名称.trim());
        children.set(key, names);
    }
    const gaps = new Map<string, { count: number; description: string }>();
    for (const node of nodes) {
        const level = 下级类型[node?.层级 || ''];
        if (!level) continue;
        const key = JSON.stringify([地点标识(node), level]);
        const count = children.get(key)?.size || 0;
        if (count < 2) gaps.set(key, { count, description: '「' + node.名称 + '」' +
            (node.ID ? '(' + node.ID + ')' : '') + ' 只有 ' + count + ' 个不同的' + level });
    }
    return gaps;
}

/** Incremental updates may repair old saves over several turns, but cannot introduce or widen gaps. */
export function 查找地图分支缺口(nodes: BranchNode[], previous?: BranchNode[]): string[] {
    const previousGaps = previous && 统计地图分支缺口(previous);
    return Array.from(统计地图分支缺口(nodes)).filter(([key, gap]) =>
        gap.count < (previousGaps?.get(key)?.count ?? 2)).map(([, gap]) => gap.description);
}
