import type { 存档结构 } from '../types';
import { 读取存档游玩回合数 } from './saveTurn';

const readText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 截断连线文本 = (value: string): string => {
    const normalized = readText(value).replace(/\s+/g, ' ');
    if (!normalized) return '';
    return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
};

const 读取历史用户输入 = (save: Partial<存档结构>, startIndex = 0): string => {
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const user = history.slice(Math.max(0, startIndex)).find((item: any) => item?.role === 'user' && readText(item.content));
    return 截断连线文本((user as any)?.content || '');
};

const 读取历史长度 = (save: Partial<存档结构>): number => {
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const explicit = Number((save.元数据 as any)?.历史记录条数);
    if (Number.isFinite(explicit) && explicit > history.length) return Math.floor(explicit);
    return history.length;
};

// [修复] 开局存档的历史记录[0] 始终是同一条系统占位消息（"系统: 正在生成开场内容..."），
// 不能作为不同开局之间的区分特征。必须跳过所有 system 角色，找到首条真实对话消息，
// 否则同角色名多次开局会被错误判定为"同一开局"而串到同一棵时间树（玩家反馈）。
const 是系统占位消息 = (item: any): boolean => {
    if (!item || typeof item !== 'object') return false;
    if (item.role === 'system') return true;
    // 兜底：role 缺失但内容是开场生成占位文案也视为系统消息
    const content = typeof item.content === 'string' ? item.content.trim() : '';
    return content.startsWith('系统:') || content.startsWith('系统：');
};

const 寻找首条非系统历史 = (history: any[]): any | null => {
    if (!Array.isArray(history)) return null;
    for (let index = 0; index < history.length; index += 1) {
        const item = history[index];
        if (!是系统占位消息(item)) return item || null;
    }
    return null;
};

const 读取首条历史签名 = (save: Partial<存档结构>): string => {
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const first = 寻找首条非系统历史(history) || history[0] || null;
    if (!first || typeof first !== 'object') return 'null';
    return JSON.stringify({
        role: first.role,
        content: typeof first.content === 'string' ? first.content.slice(0, 256).trim() : '',
        structuredResponse: Boolean(first.structuredResponse)
    });
};

const 是同一开局候选 = (save: Partial<存档结构>, candidate: Partial<存档结构>): boolean => {
    const currentName = readText(save.角色数据?.姓名);
    const candidateName = readText(candidate.角色数据?.姓名);
    if (currentName && candidateName && currentName !== candidateName) return false;

    const currentInitialTime = readText(save.游戏初始时间);
    const candidateInitialTime = readText(candidate.游戏初始时间);
    // [修复] 旧版本在此处直接 return currentInitialTime === candidateInitialTime，
    // 即只要初始时间匹配就视为同一开局。这会让同名"陆凡"等玩家在短时间内多次开局时，
    // 后几次开局被错误判定为与前次开局同一棵谱系（玩家反馈一）。修复：初始时间只是
    // 必要条件之一，最终还要看首条 AI 签名是否一致。
    if (currentInitialTime && candidateInitialTime && currentInitialTime !== candidateInitialTime) return false;

    const currentFirstHistory = 读取首条历史签名(save);
    const candidateFirstHistory = 读取首条历史签名(candidate);
    // [修复] 双方首条真实对话都不可用（AI 尚未响应），退化为时间戳近邻判别：
    // 1秒内的视为同一局（同一未完成开局），超过 1 秒视为不同局。
    if (currentFirstHistory === 'null' && candidateFirstHistory === 'null') {
        const currentTs = Number(save.时间戳 || 0);
        const candidateTs = Number(candidate.时间戳 || 0);
        if (currentTs > 0 && candidateTs > 0 && Math.abs(currentTs - candidateTs) > 1000) return false;
        return true;
    }
    if (currentFirstHistory !== candidateFirstHistory) return false;
    return true;
};

const 读取谱系回合数 = (save: Partial<存档结构>): number => {
    // 轻量视图没有完整历史记录，元数据回合数是唯一可靠来源。
    // 这种场景下轻量视图的元数据回合数已经在保存时被正确写入，
    // 不需要从历史重新计算。
    const historyLength = Array.isArray(save?.历史记录) ? save.历史记录.length : 0;
    const explicitHistoryLength = Number((save?.元数据 as any)?.历史记录条数);
    const isLikelyLightweightView = Number.isFinite(explicitHistoryLength)
        && explicitHistoryLength > historyLength;
    if (isLikelyLightweightView) {
        const explicit = Number((save?.元数据 as any)?.游戏回合数);
        if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
    }
    return 读取存档游玩回合数(save);
};

export const 计算谱系短哈希 = (value: string): string => {
    let left = 0x811c9dc5;
    let right = 0x01000193;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        left ^= code;
        left = Math.imul(left, 0x01000193);
        right ^= code + index;
        right = Math.imul(right, 0x811c9dc5);
    }
    return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
};

export const 读取存档系列ID = (save: Partial<存档结构>): string => {
    const existing = readText((save.元数据 as any)?.存档系列ID);
    if (existing) return existing;
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    // [修复] 与 读取首条历史签名 保持一致：必须跳过系统占位消息，
    // 否则同角色名开局会产生完全相同的 seed 哈希，seriesId 撞车后被串到同一条时间树。
    const firstHistory = 寻找首条非系统历史(history);
    const env: any = save.环境信息 || {};
    const seed = {
        title: readText(save.角色数据?.姓名),
        initialTime: readText(save.游戏初始时间),
        firstHistory,
        firstLocation: readText(env.具体地点 || env.小地点 || env.中地点 || env.大地点)
    };
    return `series-${计算谱系短哈希(JSON.stringify(seed))}`;
};

export const 读取存档谱系哈希 = (save: Partial<存档结构>): string => (
    readText((save.元数据 as any)?.存档哈希)
);

export const 选择存档父节点 = (
    save: Partial<存档结构>,
    candidates: Array<Partial<存档结构>>
): Partial<存档结构> | null => {
    const seriesId = 读取存档系列ID(save);
    const currentHash = 读取存档谱系哈希(save);
    const currentAutoNodeId = readText((save.元数据 as any)?.自动存档节点ID);
    const historyCount = 读取历史长度(save);
    const timestamp = Number(save.时间戳 || 0);
    const explicitParentHash = readText((save.元数据 as any)?.存档父节点哈希);
    if (explicitParentHash) {
        const explicit = candidates.find((item) => 读取存档谱系哈希(item) === explicitParentHash);
        if (explicit) return explicit;
    }
    return candidates
        .filter((item) => 读取存档谱系哈希(item) && 读取存档谱系哈希(item) !== currentHash)
        .filter((item) => !currentAutoNodeId || readText((item.元数据 as any)?.自动存档节点ID) !== currentAutoNodeId)
        .filter((item) => 读取存档系列ID(item) === seriesId)
        .filter((item) => 读取历史长度(item) <= historyCount)
        .filter((item) => Number(item.时间戳 || 0) <= timestamp || timestamp <= 0)
        .sort((a, b) => {
            const byHistory = 读取历史长度(b) - 读取历史长度(a);
            if (byHistory !== 0) return byHistory;
            return Number(b.时间戳 || 0) - Number(a.时间戳 || 0);
        })[0] || null;
};

const 选择可继承系列父节点 = (
    save: Partial<存档结构>,
    candidates: Array<Partial<存档结构>>
): Partial<存档结构> | null => {
    const currentHash = 读取存档谱系哈希(save);
    const currentAutoNodeId = readText((save.元数据 as any)?.自动存档节点ID);
    const historyCount = 读取历史长度(save);
    const timestamp = Number(save.时间戳 || 0);
    return candidates
        .filter((item) => 读取存档谱系哈希(item) && 读取存档谱系哈希(item) !== currentHash)
        .filter((item) => readText((item.元数据 as any)?.存档系列ID))
        .filter((item) => !currentAutoNodeId || readText((item.元数据 as any)?.自动存档节点ID) !== currentAutoNodeId)
        .filter((item) => 是同一开局候选(save, item))
        .filter((item) => 读取历史长度(item) <= historyCount)
        .filter((item) => Number(item.时间戳 || 0) <= timestamp || timestamp <= 0)
        .sort((a, b) => {
            const byHistory = 读取历史长度(b) - 读取历史长度(a);
            if (byHistory !== 0) return byHistory;
            return Number(b.时间戳 || 0) - Number(a.时间戳 || 0);
        })[0] || null;
};

export const 补全存档谱系元数据 = <T extends Partial<存档结构>>(
    save: T,
    candidates: Array<Partial<存档结构>> = []
): T => {
    const metadata: Record<string, unknown> = {
        ...((save.元数据 && typeof save.元数据 === 'object') ? save.元数据 : {})
    };
    const inheritedParent = !readText(metadata.存档系列ID)
        ? 选择可继承系列父节点({ ...save, 元数据: metadata } as Partial<存档结构>, candidates)
        : null;
    const inheritedSeriesId = readText((inheritedParent?.元数据 as any)?.存档系列ID);
    const seriesId = readText(metadata.存档系列ID) || inheritedSeriesId || 读取存档系列ID({ ...save, 元数据: metadata } as Partial<存档结构>);
    metadata.存档系列ID = seriesId;
    const explicitParentHash = readText(metadata.存档父节点哈希);
    const explicitRootHash = readText(metadata.存档根节点哈希);
    const explicitDepth = Number(metadata.存档谱系深度);
    const parent = 选择存档父节点({ ...save, 元数据: metadata } as Partial<存档结构>, candidates);
    const parentHash = parent ? 读取存档谱系哈希(parent) : explicitParentHash;
    const parentHistoryCount = parent ? 读取历史长度(parent) : 0;
    const existingBranchInput = readText(metadata.存档分支输入);
    const branchInput = parent
        ? 读取历史用户输入(save, parentHistoryCount)
        : (!parentHash && !existingBranchInput ? 读取历史用户输入(save, 0) : '');
    const rootHash = parent
        ? readText((parent.元数据 as any)?.存档根节点哈希) || parentHash
        : explicitRootHash || readText(metadata.存档哈希) || parentHash;
    if (parentHash) {
        metadata.存档父节点哈希 = parentHash;
        metadata.存档根节点哈希 = rootHash || readText(metadata.存档哈希);
        metadata.存档谱系深度 = parent
            ? Math.max(0, Number((parent.元数据 as any)?.存档谱系深度 || 0) + 1)
            : (Number.isFinite(explicitDepth) && explicitDepth > 0 ? Math.floor(explicitDepth) : 1);
        metadata.存档分支输入 = branchInput || existingBranchInput || '继续游玩';
    } else {
        const selfHash = readText(metadata.存档哈希);
        metadata.存档父节点哈希 = '';
        metadata.存档根节点哈希 = selfHash || rootHash || '';
        metadata.存档谱系深度 = 0;
        metadata.游戏回合数 = 0;
        metadata.存档分支输入 = '开局';
    }
    metadata.存档谱系版本 = 1;
    return {
        ...save,
        元数据: metadata as any
    };
};

export interface 本地存档谱系修复结果<T extends Partial<存档结构>> {
    saves: T[];
    changed: boolean;
    repairedGroups: number;
    repairedNodes: number;
}

const 比较谱系顺序 = (a: Partial<存档结构>, b: Partial<存档结构>): number => {
    const turnDiff = 读取谱系回合数(a) - 读取谱系回合数(b);
    if (turnDiff !== 0) return turnDiff;
    const depthDiff = Number((a.元数据 as any)?.存档谱系深度 || 0) - Number((b.元数据 as any)?.存档谱系深度 || 0);
    if (depthDiff !== 0) return depthDiff;
    return Number(a.时间戳 || 0) - Number(b.时间戳 || 0);
};

const 是可信谱系根 = (item: Partial<存档结构>): boolean => (
    !readText((item.元数据 as any)?.存档父节点哈希)
    && 读取谱系回合数(item) === 0
    && Number((item.元数据 as any)?.存档谱系深度 || 0) === 0
);

const 收集谱系子树 = <T extends Partial<存档结构>>(
    root: T,
    childrenByParent: Map<string, T[]>
): T[] => {
    const collected: T[] = [];
    const seen = new Set<string>();
    const walk = (item: T) => {
        const hash = 读取存档谱系哈希(item);
        if (!hash || seen.has(hash)) return;
        seen.add(hash);
        collected.push(item);
        const children = [...(childrenByParent.get(hash) || [])].sort(比较谱系顺序);
        children.forEach(walk);
    };
    walk(root);
    return collected;
};

const 写入谱系节点元数据 = <T extends Partial<存档结构>>(
    ordered: T[],
    rootHash: string,
    seriesId: string,
    startIndex = 0,
    parentBeforeFirst = ''
): number => {
    let repairedNodes = 0;
    ordered.forEach((save, offset) => {
        const metadata = save.元数据 as any;
        const index = startIndex + offset;
        const wasPatched = metadata.__补丁挂载标志 === true;
        const explicitParentHash = offset === 0 ? '' : (parentBeforeFirst && !readText(metadata.存档父节点哈希)
            ? parentBeforeFirst
            : 读取存档谱系哈希(ordered[offset - 1]));
        // 谱系深度：以"父节点的深度 + 1"为基准回退值（而非 DFS 的 index）。
        // 显式深度在「有效且不小于父深度+1」时被保留；否则使用父深度+1。
        // 被重新挂接的节点必须按新父位置对齐深度，绝不保留与父链脱节的旧深度。
        const previousItem = offset === 0 ? null : ordered[offset - 1];
        const parentDepthBase = previousItem
            ? Math.max(0, Number((previousItem.元数据 as any)?.存档谱系深度 || 0))
            : -1;
        const desiredDepth = offset === 0 ? 0 : parentDepthBase + 1;
        const explicitDepth = Number(metadata.存档谱系深度);
        const nextDepth = offset === 0
            ? 0
            : (wasPatched
                ? desiredDepth
                : (Number.isFinite(explicitDepth) && explicitDepth >= desiredDepth
                    ? Math.floor(explicitDepth)
                    : desiredDepth));
        // 回合数：显式值有效（有限非负）时一律保留（含被补丁节点，CodeRabbit #2），
        // 仅在显式值无效时才回退重算，避免下载/迁移档被本地重算错写。
        const explicitTurn = Number(metadata.游戏回合数);
        const nextGameRound = offset === 0
            ? (Number.isFinite(explicitTurn) && explicitTurn >= 0 ? Math.floor(explicitTurn) : 0)
            : (Number.isFinite(explicitTurn) && explicitTurn >= 0
                ? Math.floor(explicitTurn)
                : 读取谱系回合数(save));
        const nextParentHash = offset === 0
            ? ''
            : (readText(metadata.存档父节点哈希) || explicitParentHash);
        const nextBranchInput = offset === 0
            ? '开局'
            : (readText(metadata.存档分支输入) || 读取历史用户输入(save, 0) || '继续游玩');
        if (
            metadata.存档系列ID !== seriesId
            || metadata.存档根节点哈希 !== rootHash
            || metadata.存档父节点哈希 !== nextParentHash
            || metadata.存档谱系深度 !== nextDepth
            || metadata.游戏回合数 !== nextGameRound
            || metadata.存档分支输入 !== nextBranchInput
            || metadata.存档谱系版本 !== 1
        ) {
            repairedNodes += 1;
        }
        metadata.存档系列ID = seriesId;
        metadata.存档根节点哈希 = rootHash;
        metadata.存档父节点哈希 = nextParentHash;
        metadata.存档谱系深度 = nextDepth;
        metadata.游戏回合数 = nextGameRound;
        metadata.存档分支输入 = nextBranchInput;
        metadata.存档谱系版本 = 1;
        delete metadata.__补丁挂载标志;
    });
    return repairedNodes;
};

export const 修复本地存档谱系列表 = <T extends Partial<存档结构>>(
    saves: T[]
): 本地存档谱系修复结果<T> => {
    const next = saves.map((save) => ({
        ...save,
        元数据: {
            ...((save.元数据 && typeof save.元数据 === 'object') ? save.元数据 : {})
        }
    })) as T[];
    const bySeries = new Map<string, T[]>();
    next.forEach((save) => {
        const seriesId = readText((save.元数据 as any)?.存档系列ID);
        const hash = 读取存档谱系哈希(save);
        if (!seriesId || !hash) return;
        bySeries.set(seriesId, [...(bySeries.get(seriesId) || []), save]);
    });

    let repairedGroups = 0;
    let repairedNodes = 0;
    bySeries.forEach((items) => {
        const hashToItem = new Map(items.map((item) => [读取存档谱系哈希(item), item]).filter(([hash]) => Boolean(hash)) as Array<[string, T]>);
        // 第一遍：基于已声明的存档父节点哈希 建立子表。
        const childrenByParent = new Map<string, T[]>();
        items.forEach((item) => {
            const parentHash = readText((item.元数据 as any)?.存档父节点哈希);
            if (!parentHash || !hashToItem.has(parentHash)) return;
            childrenByParent.set(parentHash, [...(childrenByParent.get(parentHash) || []), item]);
        });

        // 第二遍：补全"存档父节点哈希 已声明但本组找不到 / 或父哈希缺失 且 存档根节点哈希
        // 指向组内某 item"的节点。典型场景：只下载到中段、缺父；以及一些孤儿新存档。
        // 关键设计：
        //  a) 保留各自 seriesId/rootHash，绝不强行把所有根并到 primary 上；
        //  b) 仅当目标 matchedRoot 是组内真实根（自身无父、未被任何人当父指向）且
        //     挂接不会使当前 item 变成自身后代（防环）时才补挂，否则拒绝（CodeRabbit #4）。
        const isKnownChild = (item: T): boolean => {
            const hash = 读取存档谱系哈希(item);
            if (!hash) return false;
            for (const list of childrenByParent.values()) {
                if (list.includes(item)) return true;
            }
            return false;
        };
        // matchedRoot 需是"可信根"：自身无父哈希，或父哈希在本组解析不到（视为断档根），
        // 且尚未被任何其他节点挂在名下。
        const isTrustedRootCandidate = (item: T): boolean => {
            if (isKnownChild(item)) return false;
            const parentHash = readText((item.元数据 as any)?.存档父节点哈希);
            if (!parentHash) return true;
            return !hashToItem.has(parentHash);
        };
        // 从 item 出发沿"已有子表"可达的节点集合——若 matchedRoot 可达 item 自身则成环，必须拒绝。
        const 会形成环 = (root: T, child: T): boolean => {
            const startHash = 读取存档谱系哈希(root);
            if (!startHash) return false;
            const stack = [...(childrenByParent.get(startHash) || [])];
            const visited = new Set<T>();
            while (stack.length > 0) {
                const current = stack.pop() as T;
                if (!current || visited.has(current)) continue;
                visited.add(current);
                if (current === child) return true;
                const currentHash = 读取存档谱系哈希(current);
                if (!currentHash) continue;
                const nextChildren = childrenByParent.get(currentHash);
                if (nextChildren) stack.push(...nextChildren);
            }
            return false;
        };
        items.forEach((item) => {
            const metadata = item.元数据 as any;
            const explicitParentHash = readText(metadata.存档父节点哈希);
            // 父哈希已声明且组内能找到 → 第一遍已收，无需修补
            if (explicitParentHash && hashToItem.has(explicitParentHash)) return;
            const rootHash = readText(metadata.存档根节点哈希);
            if (!rootHash) return;
            const matchedRoot = hashToItem.get(rootHash);
            if (!matchedRoot || matchedRoot === item) return;
            // CodeRabbit #4：拒绝把 item 挂到一个会形成环的目标上，
            // 且目标必须是组内可信根（自身无父 / 父断档 / 未被他人当子）。
            if (!isTrustedRootCandidate(matchedRoot)) return;
            if (会形成环(matchedRoot, item)) return;
            const matchedHash = 读取存档谱系哈希(matchedRoot);
            if (!matchedHash) return;
            metadata.存档父节点哈希 = matchedHash;
            // 标记此节点被父哈希修补：写入时使用新的挂接位置而非保留旧 depth/turn，
            // 避免出现"自称深度 17 却在第 1 个位置"的歧义。
            metadata.__补丁挂载标志 = true;
            childrenByParent.set(matchedHash, [...(childrenByParent.get(matchedHash) || []), item]);
        });

        // 第三遍：识别所有"根"——未被任何其他节点指向其作为父、且自身有哈希。
        // 这里是关键：原本会把"未挂接的根"强接到 primary 链末尾，导致不同存档被错并到同一棵。
        // 现在每个根各自成独立一棵子树，原始 seriesId/rootHash 不被改写到另一棵树。
        const allChildren = new Set<T>();
        childrenByParent.forEach((list) => list.forEach((child) => allChildren.add(child)));
        const roots = items
            .filter((item) => !allChildren.has(item))
            .filter((item) => 读取存档谱系哈希(item))
            .sort(比较谱系顺序);

        let groupChanged = 0;
        roots.forEach((root) => {
            const rootHash = 读取存档谱系哈希(root);
            const seriesId = readText((root.元数据 as any)?.存档系列ID);
            if (!rootHash || !seriesId) return;
            const component = 收集谱系子树(root, childrenByParent);
            groupChanged += 写入谱系节点元数据(component, rootHash, seriesId, 0, '');
        });

        if (groupChanged > 0) {
            repairedNodes += groupChanged;
            repairedGroups += 1;
        }
    });

    return {
        saves: next,
        changed: repairedNodes > 0,
        repairedGroups,
        repairedNodes
    };
};
