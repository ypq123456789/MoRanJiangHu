import type { 世界数据结构, 环境信息结构 } from '../types';

export type 地点层级类型 = '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点';

export interface 地点树节点 {
    ID: string;
    名称: string;
    层级: 地点层级类型;
    父级ID: string;
    描述: string;
    控制势力?: string;
    势力影响?: string;
    势力标签?: string[];
    在场人物?: string[];
    子节点: 地点树节点[];
}

export interface 地点树结构 {
    根节点: 地点树节点 | null;
    当前节点: 地点树节点 | null;
    节点映射: Map<string, 地点树节点>;
    面包屑: 地点树节点[];
    待补录房间?: 地点树节点;
}

const 取文本 = (v: unknown, fallback = ''): string => {
    if (typeof v !== 'string') return fallback;
    return v.trim() || fallback;
};

const 归一化地图文本 = (value: unknown): string => String(value || '').trim().replace(/\s+/g, '').toLowerCase();

/** 位置可以只写地名，也可省略路径中的层级；有明确写出的地名必须按顺序位于同一分支。 */
export const 地点路径匹配分支 = (raw: string, branchNames: string[]): boolean => {
    const name = 归一化地图文本(raw);
    if (!name) return false;
    const branch = branchNames.map(归一化地图文本);
    if (branch.includes(name)) return true;
    const parts = name.split(/[>＞／/\\·•\-—|｜,，、;；→]+/u).filter(Boolean);
    let cursor = -1;
    return parts.length > 0 && parts.every(part => {
        cursor = branch.indexOf(part, cursor + 1);
        return cursor !== -1;
    });
};

const 层级映射: Record<string, 地点层级类型> = {
    '寰宇': '寰宇', '大地点': '大地点', '中地点': '中地点', '小地点': '小地点',
    '子地点': '子地点', '具体地点': '区地点', '室内': '子地点', '房间': '子地点',
    '区地点': '区地点',
};

const 归一化层级 = (raw?: string): 地点层级类型 => 层级映射[raw || ''] || '小地点';

export const 构建地点树 = (
    world?: 世界数据结构 | null,
    env?: 环境信息结构 | null
): 地点树结构 => {
    const layers = Array.isArray(world?.地图层级) ? world.地图层级 : [];
    const 节点映射 = new Map<string, 地点树节点>();

    // 第一步：层级转节点
    layers.forEach((layer: any) => {
        const id = 取文本(layer?.ID) || `location:${JSON.stringify([layer?.父级ID, layer?.层级, layer?.名称])}`;
        节点映射.set(id, {
            ID: id,
            名称: 取文本(layer?.名称) || '未命名区域',
            层级: 归一化层级(layer?.层级),
            父级ID: 取文本(layer?.父级ID),
            描述: 取文本(layer?.描述),
            控制势力: 取文本(layer?.控制势力),
            势力影响: 取文本(layer?.势力影响),
            势力标签: Array.isArray(layer?.势力标签) ? layer.势力标签.map((item: unknown) => 取文本(item)).filter(Boolean) : [],
            子节点: [],
        });
    });

    // 第二步：名称→ID索引
    const nameToId = new Map<string, string>();
    节点映射.forEach(n => {
        const nm = 归一化地图文本(n.名称);
        if (nm && !nameToId.has(nm)) nameToId.set(nm, n.ID);
    });

    // 第2.5步：寰宇去重——只保留第一个寰宇，其余降为大地点
    const 寰宇节点s = Array.from(节点映射.values()).filter(n => n.层级 === '寰宇');
    if (寰宇节点s.length > 1) {
        const keeper = 寰宇节点s[0];
        寰宇节点s.slice(1).forEach(dup => {
            dup.层级 = '大地点';
            dup.父级ID = keeper.ID;
            keeper.子节点.push(dup);
        });
    }

    // 第三步：合并重名（同层+同父）
    const keyFn = (n: 地点树节点) => `${归一化地图文本(n.名称)}|${n.层级}|${n.父级ID}`;
    const groups = new Map<string, 地点树节点[]>();
    节点映射.forEach(n => {
        const k = keyFn(n);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(n);
    });
    groups.forEach(g => {
        if (g.length < 2) return;
        const keeper = g[0];
        g.slice(1).forEach(dup => {
            if (!keeper.描述 && dup.描述) keeper.描述 = dup.描述;
            if (!keeper.控制势力 && dup.控制势力) keeper.控制势力 = dup.控制势力;
            if (!keeper.势力影响 && dup.势力影响) keeper.势力影响 = dup.势力影响;
            if ((!keeper.势力标签 || keeper.势力标签.length <= 0) && dup.势力标签 && dup.势力标签.length > 0) keeper.势力标签 = dup.势力标签;
            节点映射.forEach(n => { if (n.父级ID === dup.ID) n.父级ID = keeper.ID; });
            dup.子节点.forEach(c => { if (!keeper.子节点.some(kc => kc.ID === c.ID)) { keeper.子节点.push(c); c.父级ID = keeper.ID; } });
            节点映射.delete(dup.ID);
        });
    });

    // 第四步：建立父子关系（带名称回退）
    节点映射.forEach(node => {
        let pid = node.父级ID;
        if (!pid || pid === node.ID) return;
        if (!节点映射.has(pid)) {
            const nm = nameToId.get(归一化地图文本(pid));
            if (nm) { pid = nm; node.父级ID = nm; }
        }
        if (!节点映射.has(pid)) return;
        const parent = 节点映射.get(pid)!;
        if (!parent.子节点.some(c => c.ID === node.ID)) parent.子节点.push(node);
    });

    // 第五步：找根节点
    const nodes = Array.from(节点映射.values());
    const 层级优先级: Record<string, number> = { '寰宇': 0, '大地点': 1, '中地点': 2, '小地点': 3, '区地点': 4, '子地点': 5 };
    let rootNodes = nodes.filter(n => !n.父级ID || !节点映射.has(n.父级ID))
        .sort((a, b) => (层级优先级[a.层级] ?? 5) - (层级优先级[b.层级] ?? 5));
    if (rootNodes.length === 0 && nodes.length > 0) {
        nodes.sort((a, b) => (层级优先级[a.层级] ?? 5) - (层级优先级[b.层级] ?? 5))[0].父级ID = '';
        rootNodes = [nodes[0]];
    }
    const root = rootNodes[0] || null;

    // 环境的四个字段有时带整段路径。逐级用已匹配的祖先消歧，同名房间不会串到另一座建筑。
    let currentNode: 地点树节点 | null = null;
    let 待补录房间: 地点树节点 | undefined;
    if (env) {
        const named = (name: string) => nodes.filter(n => 归一化地图文本(n.名称) === 归一化地图文本(name));
        for (const field of ['大地点', '中地点', '小地点', '具体地点'] as const) {
            const raw = 取文本(env[field]);
            if (!raw) continue;
            const parts = named(raw).length ? [raw] : raw.split(/[>＞／/·•\-—|｜]+/u).map(s => s.trim()).filter(Boolean);
            for (const [index, name] of parts.entries()) {
                const parent: 地点树节点 | null = currentNode;
                const matches = named(name);
                const local = parent && matches.find(n => {
                    let node: 地点树节点 | undefined = n;
                    const seen = new Set<string>();
                    while (node && !seen.has(node.ID)) {
                        if (node.ID === parent.ID) return true;
                        seen.add(node.ID);
                        node = 节点映射.get(node.父级ID);
                    }
                    return false;
                });
                if (local) {
                    currentNode = local;
                } else if (parent?.层级 === '区地点' && field === '具体地点' && index === parts.length - 1
                    && !matches.some(n => n.层级 !== '子地点') && !/^(未知|无|不明|未指定|待定)$/u.test(name)) {
                    // 只补环境明确给出的「已知场所 > 具体地点」。不猜测玩家进了同建筑的哪一间房。
                    const room: 地点树节点 = {
                        ID: `room:${JSON.stringify([parent.ID, name])}`, 名称: name,
                        层级: '子地点', 父级ID: parent.ID, 描述: '', 子节点: []
                    };
                    parent.子节点.push(room);
                    节点映射.set(room.ID, room);
                    currentNode = 待补录房间 = room;
                } else if (matches.length) {
                    currentNode = matches[0];
                }
            }
        }
    }
    if (!currentNode) currentNode = root;

    // 第七步：面包屑
    const 面包屑: 地点树节点[] = [];
    let cursor: 地点树节点 | null = currentNode;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.ID)) {
        面包屑.unshift(cursor);
        visited.add(cursor.ID);
        cursor = cursor.父级ID && 节点映射.has(cursor.父级ID) ? 节点映射.get(cursor.父级ID) || null : null;
    }

    return { 根节点: root, 当前节点: currentNode, 节点映射, 面包屑, 待补录房间 };
};

export const 补录环境所在房间 = (world: 世界数据结构, env: 环境信息结构): 世界数据结构 => {
    if (!env?.具体地点 || !world?.地图层级?.length) return world;
    const room = 构建地点树(world, env).待补录房间;
    if (!room) return world;
    return { ...world, 地图层级: [...world.地图层级, {
        ID: room.ID, 名称: room.名称, 层级: '子地点', 父级ID: room.父级ID, 描述: '',
        归属: { 大地点: env.大地点, 中地点: env.中地点, 小地点: env.小地点 },
        锚点坐标: { x: 0, y: 0 }, 网格宽度: 1, 网格高度: 1,
        边界四角坐标: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        建筑物ID列表: [], 道路ID列表: [], 人物ID列表: []
    }] };
};

/**
 * 从六层地图节点中提取开局默认最深落点（优先落到第一个有「子地点/房间」的分支最底层）。
 */
export const 提取世界基底初始落点 = (
    layers: any[], env?: Partial<环境信息结构> | null
): { 大地点: string; 中地点: string; 小地点: string; 具体地点: string } | null => {
    if (!Array.isArray(layers) || layers.length === 0) return null;
    const tree = 构建地点树({ 地图层级: layers } as any, null);
    const nodes = Array.from(tree.节点映射.values());
    if (nodes.length === 0) return null;

    const getAncestorChain = (node: 地点树节点): 地点树节点[] => {
        const chain: 地点树节点[] = [];
        let cursor: 地点树节点 | null = node;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor.ID)) {
            chain.unshift(cursor);
            seen.add(cursor.ID);
            cursor = cursor.父级ID ? (tree.节点映射.get(cursor.父级ID) || null) : null;
        }
        return chain;
    };

    const upperLocations = [env?.大地点, env?.中地点, env?.小地点].map(value => 取文本(value)).filter(Boolean);
    const candidates = upperLocations.length ? nodes.filter(node => {
        const path = getAncestorChain(node).map(ancestor => ancestor.名称);
        return upperLocations.every(location => 地点路径匹配分支(location, path));
    }) : nodes;
    const leafRoom = candidates.find(n => n.层级 === '子地点')
        || candidates.find(n => n.层级 === '区地点')
        || candidates.find(n => n.层级 === '小地点')
        || candidates.find(n => n.层级 === '中地点')
        || candidates.find(n => n.层级 === '大地点');
    if (!leafRoom) return null;

    const chain = getAncestorChain(leafRoom);
    const pick = (level: 地点层级类型) => chain.find(c => c.层级 === level)?.名称 || '';
    const big = pick('大地点');
    const mid = pick('中地点') || big;
    const small = pick('小地点') || mid;
    const specific = pick('子地点') || pick('区地点') || small;
    return { 大地点: big, 中地点: mid, 小地点: small, 具体地点: specific };
};

export const 获取兄弟节点 = (node: 地点树节点 | null, tree: 地点树结构): 地点树节点[] => {
    if (!node) return [];
    if (node.父级ID && tree.节点映射.has(node.父级ID)) return tree.节点映射.get(node.父级ID)!.子节点;
    return tree.根节点 ? [tree.根节点] : [];
};
