import type { 世界数据结构, 环境信息结构 } from '../types';
import { readRoomExits } from './roomConnections';

export type 地点层级类型 = '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点';

export interface 地点树节点 {
    ID: string;
    名称: string;
    层级: 地点层级类型;
    父级ID: string;
    描述: string;
    叙事核心?: string;
    控制势力?: string;
    势力影响?: string;
    势力标签?: string[];
    在场人物?: string[];
    连通房间?: string[];
    房间格序?: number;
    子节点: 地点树节点[];
}

export interface 地点树结构 {
    根节点: 地点树节点 | null;
    当前节点: 地点树节点 | null;
    节点映射: Map<string, 地点树节点>;
    面包屑: 地点树节点[];
    待补录房间?: 地点树节点;
    已定位场所?: 地点树节点;
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

const 合并地点资料 = (keeper: 地点树节点, extra: 地点树节点) => {
    keeper.描述 ||= extra.描述;
    keeper.叙事核心 ||= extra.叙事核心;
    if (extra.连通房间?.length) keeper.连通房间 = [...new Set([...(keeper.连通房间 || []), ...extra.连通房间])];
    keeper.控制势力 ||= extra.控制势力;
    keeper.势力影响 ||= extra.势力影响;
    keeper.势力标签 = [...new Set([...(keeper.势力标签 || []), ...(extra.势力标签 || [])])];
};

export const 构建地点树 = (
    world?: 世界数据结构 | null,
    env?: 环境信息结构 | null,
    同伴: readonly 同场位置证据[] = []
): 地点树结构 => {
    const layers = Array.isArray(world?.地图层级) ? world.地图层级 : [];
    const 节点映射 = new Map<string, 地点树节点>();
    const 归属路径 = new Map<string, string[]>();

    // 第一步：层级转节点
    layers.forEach((layer: any) => {
        if (!layer || typeof layer !== 'object') return;
        const name = 取文本(layer.名称);
        const owners = [layer.归属?.大地点, layer.归属?.中地点, layer.归属?.小地点].map(value => 取文本(value))
            .filter(value => value && 归一化地图文本(value) !== 归一化地图文本(name));
        const rawId = 取文本(layer.ID);
        let id = rawId || `location:${JSON.stringify([取文本(layer.父级ID), 归一化层级(layer.层级), name])}`;
        // 已补录房间可能直接引用旧算法生成的父 ID，仅在两个无 ID 节点的归属不同时区分。
        if (!rawId && 节点映射.has(id) && JSON.stringify(归属路径.get(id) || []) !== JSON.stringify(owners)) {
            id += ':' + JSON.stringify(owners);
        }
        if (owners.length) 归属路径.set(id, owners);
        const node: 地点树节点 = {
            ID: id,
            名称: 取文本(layer?.名称) || '未命名区域',
            层级: 归一化层级(layer?.层级),
            父级ID: 取文本(layer?.父级ID),
            描述: 取文本(layer?.描述),
            叙事核心: 取文本(layer?.叙事核心),
            ...(layer?.连通房间 ? { 连通房间: readRoomExits(layer.连通房间) } : {}),
            ...(Number.isSafeInteger(layer.房间格序) ? { 房间格序: layer.房间格序 } : {}),
            控制势力: 取文本(layer?.控制势力),
            势力影响: 取文本(layer?.势力影响),
            势力标签: Array.isArray(layer?.势力标签) ? layer.势力标签.map((item: unknown) => 取文本(item)).filter(Boolean) : [],
            子节点: [],
        };
        const existing = 节点映射.get(id);
        if (existing) 合并地点资料(existing, node);
        else 节点映射.set(id, node);
    });

    // 第2.5步：寰宇去重——只保留第一个寰宇，其余降为大地点
    const 寰宇节点s = Array.from(节点映射.values()).filter(n => n.层级 === '寰宇');
    if (寰宇节点s.length > 1) {
        const keeper = 寰宇节点s[0];
        寰宇节点s.slice(1).forEach(dup => {
            dup.层级 = '大地点';
            dup.父级ID = keeper.ID;
        });
    }

    // 先连上级，再用已有归属消歧旧档中用名称填写的父级。
    const 层级优先级: Record<地点层级类型, number> = { '寰宇': 0, '大地点': 1, '中地点': 2, '小地点': 3, '区地点': 4, '子地点': 5 };
    const 同名节点 = new Map<string, 地点树节点[]>();
    const 同父节点 = new Map<string, 地点树节点>();
    const 合并ID = new Map<string, string>();
    for (const node of [...节点映射.values()].sort((a, b) => 层级优先级[a.层级] - 层级优先级[b.层级])) {
        let pid = 合并ID.get(node.父级ID) || node.父级ID;
        if (pid && !节点映射.has(pid)) {
            const matches = (同名节点.get(归一化地图文本(pid)) || []).filter(place => 层级优先级[place.层级] < 层级优先级[node.层级]);
            const adjacent = matches.filter(place => 层级优先级[place.层级] + 1 === 层级优先级[node.层级]);
            let candidates = adjacent.length ? adjacent : matches;
            const owners = 归属路径.get(node.ID);
            if (candidates.length > 1 && owners) {
                candidates = candidates.filter(place => {
                    const branch: string[] = [];
                    const seen = new Set<string>();
                    let ancestor: 地点树节点 | undefined = place;
                    while (ancestor && !seen.has(ancestor.ID)) {
                        seen.add(ancestor.ID);
                        branch.unshift(ancestor.名称);
                        ancestor = 节点映射.get(ancestor.父级ID);
                    }
                    return owners.every(owner => 地点路径匹配分支(owner, branch));
                });
            }
            if (candidates.length === 1) pid = candidates[0].ID;
        }
        node.父级ID = pid;
        const name = 归一化地图文本(node.名称);
        const key = JSON.stringify([pid && !节点映射.has(pid) ? node.ID : pid, node.层级, name]);
        const kept = 同父节点.get(key);
        if (kept) {
            合并地点资料(kept, node);
            合并ID.set(node.ID, kept.ID);
            节点映射.delete(node.ID);
            continue;
        }
        同父节点.set(key, node);
        const named = 同名节点.get(name) || [];
        named.push(node);
        同名节点.set(name, named);
    }
    const nodes = [...节点映射.values()];
    for (const node of nodes) {
        node.父级ID = 合并ID.get(node.父级ID) || node.父级ID;
        if (node.连通房间?.length) node.连通房间 = [...new Set(node.连通房间.map(ref => 合并ID.get(ref) || ref))];
        const parent = 节点映射.get(node.父级ID);
        if (parent && parent !== node) parent.子节点.push(node);
    }

    // 第五步：找根节点
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
    let 已定位场所: 地点树节点 | undefined;
    if (env) {
        const named = (name: string) => nodes.filter(n => 归一化地图文本(n.名称) === 归一化地图文本(name));
        for (const field of ['大地点', '中地点', '小地点', '具体地点'] as const) {
            const raw = 取文本(env[field]);
            if (!raw) continue;
            const parts = named(raw).length ? [raw] : raw.split(/[>＞／/·•\-—|｜]+/u).map(s => s.trim()).filter(Boolean);
            for (const [index, name] of parts.entries()) {
                const parent: 地点树节点 | null = currentNode;
                const matches = named(name);
                const local = parent ? matches.filter(n => {
                    let node: 地点树节点 | undefined = n;
                    const seen = new Set<string>();
                    while (node && !seen.has(node.ID)) {
                        if (node.ID === parent.ID) return true;
                        seen.add(node.ID);
                        node = 节点映射.get(node.父级ID);
                    }
                    return false;
                }) : matches;
                if (local.length === 1) {
                    currentNode = local[0];
                } else if (parent?.层级 === '区地点' && field === '具体地点') {
                    if (local.length || index !== parts.length - 1 || /^(未知|无|不明|未指定|待定)$/u.test(name)) break;
                    // 只补环境明确给出的「已知场所 > 具体地点」。不猜测玩家进了同建筑的哪一间房。
                    const room: 地点树节点 = {
                        ID: `room:${JSON.stringify([parent.ID, name])}`, 名称: name,
                        层级: '子地点', 父级ID: parent.ID, 描述: '', 子节点: []
                    };
                    parent.子节点.push(room);
                    节点映射.set(room.ID, room);
                    currentNode = 待补录房间 = room;
                }
            }
        }
    }
    // 仅在同场队友明确记录了同一房间且其余位置证据也在这条分支上时细化。
    if (currentNode?.层级 === '区地点' && env?.具体地点 &&
        地点路径匹配分支(currentNode.名称, [env.具体地点.split(/\s*[>＞／/]\s*/u).at(-1) || ''])) {
        const venuePath: string[] = [];
        const seen = new Set<string>();
        let ancestor: 地点树节点 | undefined = currentNode;
        while (ancestor && !seen.has(ancestor.ID)) {
            seen.add(ancestor.ID);
            venuePath.unshift(ancestor.名称);
            ancestor = 节点映射.get(ancestor.父级ID);
        }
        const companions = (Array.isArray(同伴) ? 同伴 : []).filter(npc => npc?.是否队友 === true && npc.是否在场 === true);
        const rooms = currentNode.子节点.filter(room => room.层级 === '子地点' && companions.some(npc => {
            const records = [npc.位置路径, npc.当前位置, npc.当前地点, npc.具体地点].map(value => 取文本(value)).filter(Boolean);
            const branch = [...venuePath, room.名称];
            return records.some(record => 归一化地图文本(record.split(/[>＞／/\\·•\-—|｜,，、;；→]+/u).at(-1)) === 归一化地图文本(room.名称))
                && records.every(record => 地点路径匹配分支(record, branch));
        }));
        if (rooms.length === 1) {
            已定位场所 = currentNode;
            currentNode = rooms[0];
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

    return { 根节点: root, 当前节点: currentNode, 节点映射, 面包屑, 待补录房间, 已定位场所 };
};

type 同场位置证据 = { 是否在场?: boolean; 是否队友?: boolean; 位置路径?: unknown; 当前位置?: unknown; 当前地点?: unknown; 具体地点?: unknown };

export const 细化环境所在房间 = <T extends Partial<环境信息结构>>(world: 世界数据结构 | undefined, env: T, 同伴?: readonly 同场位置证据[]): T => {
    if (!env?.具体地点 || !world?.地图层级?.length) return env;
    const tree = 构建地点树(world, env as 环境信息结构, 同伴);
    if (!tree.已定位场所 || !tree.当前节点) return env;
    return { ...env, 具体地点: env.具体地点.trim() + ' > ' + tree.当前节点.名称 };
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
