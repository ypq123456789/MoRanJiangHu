import type { 世界数据结构 } from '../types';
import { 提取NPC地图位置片段 } from './mapNpcLocation';
import { 地图层级命名自检 } from '../prompts/runtime/mapLayerNaming';
import { getRoomPassages } from './roomConnections';
import { 构建地点树 } from './locationTree';

type 地图层级名 = '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点';

const 层级顺序: 地图层级名[] = ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'];
const 层级标签: Record<地图层级名, string> = {
    寰宇: '界域',
    大地点: '大陆',
    中地点: '地域',
    小地点: '城镇',
    区地点: '场所',
    子地点: '房间',
};

const 取文本 = (value: unknown, fallback = ''): string => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const 截断 = (text: string, max: number): string => (
    text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
);

const 归一化名称 = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

interface 提示节点 {
    ID: string;
    名称: string;
    层级: 地图层级名;
    父级ID: string;
    描述: string;
    叙事核心: string;
    控制势力: string;
    势力影响: string;
    连通房间: string[];
    子节点: 提示节点[];
}

/** 把世界基底里的扁平地图层级整理成真正的父子树（父级ID 可写名称）。 */
export const 收集地图提示节点 = (world?: 世界数据结构 | null): 提示节点[] => {
    const nodes: 提示节点[] = Array.from(构建地点树(world).节点映射.values(), layer => ({
        ID: layer.ID, 名称: layer.名称, 层级: layer.层级, 父级ID: layer.父级ID, 描述: layer.描述,
        叙事核心: layer.叙事核心 || '', 控制势力: layer.控制势力 || '', 势力影响: layer.势力影响 || '',
        连通房间: layer.连通房间 || [], 子节点: []
    }));
    const byId = new Map(nodes.map(node => [node.ID, node]));
    const roots: 提示节点[] = [];
    nodes.forEach((node) => {
        const parent = byId.get(node.父级ID);
        if (parent && parent !== node) parent.子节点.push(node);
        else roots.push(node);
    });

    const sortTree = (list: 提示节点[], visited: Set<string>) => {
        list.sort((a, b) => {
            const diff = 层级顺序.indexOf(a.层级) - 层级顺序.indexOf(b.层级);
            return diff !== 0 ? diff : a.名称.localeCompare(b.名称, 'zh');
        });
        list.forEach((node) => {
            if (visited.has(node.ID)) { node.子节点 = []; return; }
            visited.add(node.ID);
            sortTree(node.子节点, visited);
        });
    };
    sortTree(roots, new Set());
    return roots;
};

export interface 地图提示文本选项 {
    最大节点数?: number;
    描述截断?: number;
    /** 当前地点链上的名称：即使超过节点预算也必须连同祖先一起列出 */
    必留名称?: string[];
}

/** 缩进树文本：给 AI 看的是层级、父子、势力与叙事核心，不是坐标或网格。 */
export const 构建地图地点树文本 = (world?: 世界数据结构 | null, options: 地图提示文本选项 = {}): string => {
    const roots = 收集地图提示节点(world);
    if (roots.length === 0) return '暂无地图层级数据。';

    const 最大节点数 = Math.max(1, options.最大节点数 ?? 60);
    const 描述截断 = Math.max(8, options.描述截断 ?? 28);
    // 当前地点链必须与【当前地点链】保持一致：即使超出节点预算，
    // 当前地点及其祖先仍要在树文本中可见，否则模型会收到互相矛盾的约束。
    const 必留名称 = (options.必留名称 || []).map(value => 归一化名称(取文本(value))).filter(Boolean);
    const 必留节点 = new Set<string>();
    if (必留名称.length > 0) {
        const 全部: 提示节点[] = [];
        const collect = (list: 提示节点[]) => list.forEach(node => { 全部.push(node); collect(node.子节点); });
        collect(roots);
        const byId = new Map(全部.map(node => [node.ID, node]));
        const 标记祖先 = (node: 提示节点) => {
            const seen = new Set<string>();
            let cursor: 提示节点 | undefined = node;
            while (cursor && !seen.has(cursor.ID)) {
                seen.add(cursor.ID);
                必留节点.add(cursor.ID);
                cursor = byId.get(cursor.父级ID);
            }
        };
        全部.filter(node => 必留名称.includes(归一化名称(node.名称))).forEach(标记祖先);
    }

    const lines: string[] = [];
    const knownExits = new Map<string, string[]>();
    let 已列 = 0;
    let 另有 = 0;
    const 统计未列 = (node: 提示节点): number => {
        let count = 必留节点.has(node.ID) ? 0 : 1;
        node.子节点.forEach(child => { count += 统计未列(child); });
        return count;
    };

    const walk = (node: 提示节点, prefix: string, isLast: boolean) => {
        const 保留 = 必留节点.has(node.ID);
        if (!保留 && 已列 >= 最大节点数) { 另有 += 统计未列(node); return; }
        if (!保留) 已列 += 1;
        const 势力 = [node.控制势力 && `控制:${node.控制势力}`, node.势力影响 && `影响:${node.势力影响}`].filter(Boolean).join('，');
        const 节点描述 = 截断(node.描述, 描述截断);
        const 备注 = [node.叙事核心 && `叙事核心:${截断(node.叙事核心, 描述截断)}`, 节点描述].filter(Boolean).join('；');
        for (const [from, to] of getRoomPassages(node.子节点)) {
            for (const [room, next] of [[from, to], [to, from]]) {
                const exits = knownExits.get(room.ID) || [];
                exits.push(next.名称);
                knownExits.set(room.ID, exits);
            }
        }
        const exits = knownExits.get(node.ID);
        const 元信息 = [node.ID, 势力, 备注, exits?.length && '通往:' + exits.join('、')].filter(Boolean).join('｜');
        lines.push(`${prefix}${isLast ? '└' : '├'} [${node.层级}·${层级标签[node.层级]}] ${node.名称}${元信息 ? `（${元信息}）` : ''}`);
        const childPrefix = `${prefix}${isLast ? '  ' : '│ '}`;
        node.子节点.forEach((child, index) => walk(child, childPrefix, index === node.子节点.length - 1));
    };

    roots.forEach((root, index) => walk(root, '', index === roots.length - 1));
    if (另有 > 0) lines.push(`… 另有 ${另有} 个节点未列出；这些名称不在本树文本中，写剧情时优先使用上面已列出的地点。`);
    return lines.join('\n');
};

export interface 地图上下文选项 extends 地图提示文本选项 {
    最大人物数?: number;
}

/** 剧情/规划共用的地图上下文：地点树 + 当前位置链 + 人物落点 + 使用规则。 */
export const 构建地图上下文提示词 = (
    world?: 世界数据结构 | null,
    env?: { 大地点?: string; 中地点?: string; 小地点?: string; 具体地点?: string } | null,
    socialList?: any[],
    options: 地图上下文选项 = {}
): string => {
    const 最大人物数 = Math.max(5, options.最大人物数 ?? 30);
    const 当前链名称 = [env?.大地点, env?.中地点, env?.小地点, env?.具体地点]
        .map(value => 取文本(value))
        .filter(Boolean);
    const 当前地点链 = 当前链名称.join(' > ') || '未知';

    const 人物行 = (Array.isArray(socialList) ? socialList : [])
        .slice(0, 最大人物数)
        .map((npc: any) => {
            const name = 取文本(npc?.姓名) || 取文本(npc?.名称);
            if (!name) return '';
            const 原始位置 = 取文本(npc?.位置路径)
                || 取文本(npc?.当前位置)
                || 取文本(npc?.具体地点)
                || 提取NPC地图位置片段(npc)[0]
                || '未标注';
            const 状态 = npc?.是否在场 === true ? '在场' : '不在场';
            return `- ${name}｜${状态}｜位置：${截断(原始位置, 80)}`;
        })
        .filter(Boolean)
        .join('\n') || '暂无';

    return [
        '【地图地点树（权威数据；已收录地点必须沿用这里的原名，新地点按下方规则处理）】',
        构建地图地点树文本(world, {
            最大节点数: options.最大节点数,
            描述截断: options.描述截断,
            必留名称: 当前链名称,
        }),
        '',
        `【当前地点链】${当前地点链}`,
        '',
        '【人物所在地点（地图人物显示由这里驱动，不写进地图层级节点）】',
        人物行,
        '',
        '【地图与剧情结合规则】',
        '- 房间的「通往」是已探明的直接通路。两个房间同属一处场所不能证明相通；若发现新门或通道，剧情写清两端房间，由地图更新登记。',
        '- 剧情、规划、对白、传闻、追缉、商路引用已收录地点时，必须沿用地点树里的真实名称与层级，不要凭空造一个同名不同层的地点；未收录的新地点按下方新地点规则处理。',
        '- 引用地点时利用该节点的「控制势力 / 影响 / 叙事核心」写具体压力：谁在把守、什么资源紧张、什么传闻正在扩散、上层矛盾如何落到当前城镇。',
        '- 人物跨地点移动时，在社交状态里同步写 `当前位置 / 位置路径 / 具体地点`；同一个人物只能有一个最细落点。',
        '- 剧情可以自然探索到新地点：正文允许首次出现新地名（探索本来就是发现过程），但已收录地点必须用地点树里的原名，新地点名称同样要符合层级命名契约，并在本回合响应后由地图更新阶段登记进 `世界.地图层级`，后续回合沿用登记名。',
        '- 名称必须遵守层级命名契约：城镇层只写城镇专名（扬州/金陵式），坊市、码头、街区、帮派大营、商号分号、客栈这类城镇内部地点一律作为区地点挂在城镇之下。' + 地图层级命名自检,
    ].join('\n');
};
