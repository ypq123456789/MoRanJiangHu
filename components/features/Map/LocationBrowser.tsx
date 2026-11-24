import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 世界数据结构, 环境信息结构 } from '../../../types';
import { 构建地点树, type 地点树节点 } from '../../../utils/locationTree';
import { NPC属于地图视图, NPC位置命中名称 } from '../../../utils/mapNpcLocation';
import RegionMap from './RegionMap';

interface Props {
    world: 世界数据结构;
    env: 环境信息结构;
    onRegenerateMap?: () => Promise<boolean>;
    compact?: boolean;
    rawResponse?: string;
    socialList?: any[];
    playerName?: string;
    onInsertCommand?: (text: string) => void;
}

const 层级标签: Record<string, string> = {
    '寰宇': '界域',
    '大地点': '大陆',
    '中地点': '地域',
    '小地点': '城镇',
    '区地点': '场所',
    '子地点': '房间',
};

const 是否索引可见节点 = (node?: 地点树节点 | null): boolean => Boolean(node);

const 获取索引选中节点 = (
    node: 地点树节点 | null | undefined,
    nodeMap: Map<string, 地点树节点>
): 地点树节点 | null => {
    if (!node) return null;
    if (是否索引可见节点(node)) return node;
    return node.父级ID ? (nodeMap.get(node.父级ID) || null) : null;
};

const LocationTreeItem: React.FC<{
    node: 地点树节点;
    selectedId: string;
    playerLocationId: string;
    playerAncestorIds: Set<string>;
    depth: number;
    onSelect: (node: 地点树节点) => void;
    socialList?: any[];
    playerName?: string;
}> = ({ node, selectedId, playerLocationId, playerAncestorIds, depth, onSelect, socialList = [], playerName = '' }) => {
    if (depth > 30) return null;
    if (!是否索引可见节点(node)) return null;
    const inPlayerPath = playerAncestorIds.has(node.ID);
    const [expanded, setExpanded] = useState(depth < 2 || inPlayerPath);
    useEffect(() => {
        if (inPlayerPath) setExpanded(true);
    }, [inPlayerPath]);
    const isSelected = node.ID === selectedId;
    const isPlayerLocation = node.ID === playerLocationId;
    const visibleChildren = node.子节点.filter(c => c.ID !== node.ID && 是否索引可见节点(c));
    const hasChildren = visibleChildren.length > 0;

    // 叶子节点：计算在场NPC
    const leafNpcs = useMemo(() => {
        if (hasChildren || socialList.length === 0) return [];
        const matched = socialList.filter((npc: any) => NPC位置命中名称(npc, node.名称));
        const safePlayerName = playerName.trim();
        if (safePlayerName) {
            const hasPlayer = matched.some((npc: any) => String(npc?.姓名 || npc?.名称 || '').trim() === safePlayerName);
            if (!hasPlayer && isPlayerLocation) {
                matched.unshift({ 姓名: safePlayerName, 名称: safePlayerName, 是否玩家本人: true });
            }
        }
        return matched;
    }, [hasChildren, socialList, node.名称, playerName, isPlayerLocation]);

    return (
        <div>
            <div
                className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer transition-colors text-base
                    ${isSelected ? 'bg-wuxia-gold/10 border border-wuxia-gold/30 text-wuxia-gold' : isPlayerLocation ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'hover:bg-white/5 text-gray-300'}
                `}
                style={{ paddingLeft: `${2 + depth * 12}px` }}
                onClick={() => {
                    onSelect(node);
                }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        className="text-sm text-gray-500 w-3 shrink-0 hover:text-gray-300"
                        onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(!expanded);
                        }}
                        title={expanded ? '收起' : '展开'}
                    >
                        {expanded ? '▾' : '▸'}
                    </button>
                ) : (
                    <span className="w-3 shrink-0" />
                )}
                <span className="truncate">{node.名称}</span>
                {isPlayerLocation && <span className="text-sm text-emerald-400 ml-1 shrink-0">●</span>}
                {node.控制势力 && <span className="hidden min-[420px]:inline text-sm text-amber-300/80 ml-1 shrink truncate max-w-[80px]">{node.控制势力}</span>}
                {leafNpcs.length > 0 && (
                    <span className="ml-auto flex items-center gap-0.5 shrink-0 max-w-[120px] overflow-hidden">
                        {leafNpcs.slice(0, 3).map((npc: any, i: number) => {
                            const npcColors = ['#d49090','#90b4d4','#90d490','#d4c490','#b490d4','#90d4c4'];
                            const c = npc?.是否玩家本人 ? '#f0d76a' : npcColors[Math.abs((npc?.姓名 || npc?.名称 || '').length) % npcColors.length];
                            return (
                                <span key={i} className="text-xs px-1 py-0.5 rounded font-bold truncate"
                                    style={{ background: c, color: '#2a1000', maxWidth: '50px' }}>
                                    {String(npc?.姓名 || npc?.名称 || '?').slice(0, 3)}
                                </span>
                            );
                        })}
                        {leafNpcs.length > 3 && <span className="text-xs text-gray-500">+{leafNpcs.length - 3}</span>}
                    </span>
                )}
                {!hasChildren && leafNpcs.length === 0 && (
                    <span className="text-xs text-gray-500 ml-auto shrink-0">{层级标签[node.层级]}</span>
                )}
                {hasChildren && (
                    <span className="text-xs text-gray-500 ml-auto shrink-0">{层级标签[node.层级]}</span>
                )}
            </div>
            {expanded && hasChildren && (
                <div>
                    {visibleChildren.map(child => (
                        <LocationTreeItem key={child.ID} node={child} selectedId={selectedId} playerLocationId={playerLocationId} playerAncestorIds={playerAncestorIds} depth={depth + 1} onSelect={onSelect} socialList={socialList} playerName={playerName} />
                    ))}
                </div>
            )}
        </div>
    );
};

const LocationBrowser: React.FC<Props> = ({ world, env, onRegenerateMap, compact = false, rawResponse = '', socialList = [], playerName = '', onInsertCommand }) => {
    const tree = useMemo(() => 构建地点树(world, env), [world, env]);
    const [selectedNode, setSelectedNode] = useState<地点树节点 | null>(() => 获取索引选中节点(tree.当前节点, tree.节点映射));
    const [regenerating, setRegenerating] = useState(false);
    // 长路径默认折叠，省略号本身是可聚焦的展开按钮，键盘也能打开被折叠的祖先。
    const [展开面包屑, set展开面包屑] = useState(false);
    useEffect(() => { set展开面包屑(false); }, [selectedNode?.ID]);

    // 诊断：检查数据是否到达
    const layerCount = Array.isArray((world as any)?.地图层级) ? (world as any).地图层级.length : 0;

    // 当前所在位置的所有祖先ID，用于自动展开树
    const playerAncestorIds = useMemo(() => {
        const ids = new Set<string>();
        let cursor = tree.当前节点;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor.ID)) {
            ids.add(cursor.ID);
            visited.add(cursor.ID);
            cursor = cursor.父级ID ? (tree.节点映射.get(cursor.父级ID) || null) : null;
        }
        return ids;
    }, [tree.当前节点]);

    // 仅在 tree 变化时同步选中节点
    const treeVersionRef = useRef(0);
    React.useEffect(() => {
        treeVersionRef.current += 1;
        const nextSelected = 获取索引选中节点(tree.当前节点, tree.节点映射);
        if (nextSelected) setSelectedNode(nextSelected);
    }, [tree]);

    const currentViewNode = selectedNode || tree.根节点;
    const childNodes = currentViewNode ? currentViewNode.子节点 : [];

    // 面包屑
    const breadcrumb = useMemo(() => {
        if (!selectedNode) return [];
        const chain: 地点树节点[] = [];
        let cursor: 地点树节点 | null = selectedNode;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor.ID)) {
            chain.unshift(cursor);
            visited.add(cursor.ID);
            cursor = cursor.父级ID ? (tree.节点映射.get(cursor.父级ID) || null) : null;
        }
        return chain;
    }, [selectedNode, tree]);

    // 选中节点的在场NPC
    const selectedNodeNpcs = useMemo(() => {
        if (!selectedNode || socialList.length === 0) return [];
        const viewPathNames = breadcrumb.map((node) => node.名称);
        return socialList.filter((npc: any) => {
            if (NPC位置命中名称(npc, selectedNode.名称)) return true;
            return NPC属于地图视图(npc, selectedNode.子节点, {
                env,
                currentLocationName: tree.当前节点?.名称 || '',
                viewNodeName: selectedNode.名称,
                viewPathNames,
            });
        });
    }, [selectedNode, socialList, breadcrumb, env, tree.当前节点]);

    const selectedNodePeople = useMemo(() => {
        const people = [...selectedNodeNpcs];
        const safePlayerName = playerName.trim();
        if (!selectedNode) return people;
        const currentName = tree.当前节点?.名称 || '';
        const selectedNames = new Set<string>([
            selectedNode.名称,
            ...selectedNode.子节点.map((node) => node.名称),
            ...breadcrumb.map((node) => node.名称)
        ].filter(Boolean));
        const envNames = [env?.具体地点, env?.小地点, env?.中地点, env?.大地点].map((name) => String(name || '').trim()).filter(Boolean);
        const locationMatches = selectedNames.has(currentName)
            || envNames.some((name) => selectedNames.has(name))
            || breadcrumb.some((node) => node.ID === tree.当前节点?.ID)
            || selectedNode.ID === tree.当前节点?.父级ID;
        if (!locationMatches) return people;

        const appendUnique = (person: any) => {
            const name = String(person?.姓名 || person?.名称 || '').trim();
            if (!name) return;
            if (people.some((existing: any) => String(existing?.姓名 || existing?.名称 || '').trim() === name)) return;
            people.push(person);
        };

        if (safePlayerName) {
            const hasPlayer = people.some((existing: any) => String(existing?.姓名 || existing?.名称 || '').trim() === safePlayerName);
            if (!hasPlayer) people.unshift({ 姓名: safePlayerName, 名称: safePlayerName, 是否玩家本人: true });
        }
        return people;
    }, [selectedNodeNpcs, playerName, selectedNode, tree.当前节点, breadcrumb, env]);

    const 折叠面包屑 = breadcrumb.length > 3 && !展开面包屑;
    const 显示链 = 折叠面包屑 ? breadcrumb.slice(-2) : breadcrumb;
    const 被折叠名 = breadcrumb.slice(0, -2).map(node => node.名称).join(' / ');
    const rightPanelWidth = compact ? 'min-h-0' : 'w-[320px]';

    return (
        <div className={`${compact ? 'grid grid-rows-[minmax(0,1fr)_minmax(220px,42dvh)] gap-2 overflow-hidden' : 'flex gap-4'} h-full min-h-0`}>
            {/* 左侧：区域地图 */}
            <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-[#0a0d14] ${compact ? '' : 'flex-1'}`}>
                {/* 面包屑 */}
                <div className="flex items-start gap-2 border-b border-wuxia-gold/10 bg-black/40 px-4 py-2 shrink-0">
                    {/* 返回上一层 */}
                    {selectedNode?.父级ID && tree.节点映射.has(selectedNode.父级ID) && (
                        <button
                            onClick={() => setSelectedNode(tree.节点映射.get(selectedNode.父级ID!)!)}
                            className="shrink-0 w-6 h-6 rounded border border-gray-700 bg-black/40 text-gray-400 hover:text-white hover:border-gray-500 flex items-center justify-center text-xs transition-colors mt-0.5"
                            title="返回上一层"
                        >
                            ←
                        </button>
                    )}
                    <div className={`flex items-center gap-1 flex-wrap min-w-0 flex-1 leading-tight ${breadcrumb.length > 5 ? 'text-xs' : 'text-sm'}`}>
                        {/* 路径过长时折叠前几级，但省略号必须是可点击、可聚焦的按钮：
                            展开后被折叠的祖先仍可逐个选中，键盘用户也能 Tab 到它。 */}
                        {折叠面包屑 && (
                            <button type="button"
                                className="px-1 text-gray-400 shrink-0 rounded hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-wuxia-gold/60"
                                title={`展开完整路径：${被折叠名}`}
                                aria-label={`展开完整路径：${被折叠名}`}
                                aria-expanded={false}
                                onClick={() => set展开面包屑(true)}>
                                …
                            </button>
                        )}
                        {!折叠面包屑 && breadcrumb.length > 3 && (
                            <button type="button"
                                className="px-1 text-gray-500 shrink-0 rounded hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-wuxia-gold/60"
                                title="收起路径" aria-label="收起路径" aria-expanded={true}
                                onClick={() => set展开面包屑(false)}>
                                ⋯
                            </button>
                        )}
                        {显示链.map((node, i) => {
                            const isLast = i === 显示链.length - 1;
                            return (
                                <React.Fragment key={node.ID}>
                                    {(i > 0 || 折叠面包屑) && <span className="text-gray-600 shrink-0">/</span>}
                                    <button
                                        onClick={() => setSelectedNode(node)}
                                        className={`tracking-wider px-1 py-0.5 rounded transition-colors whitespace-nowrap
                                            ${isLast
                                                ? 'text-wuxia-gold font-bold'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        {node.名称}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {onRegenerateMap && (
                        <button
                            disabled={regenerating}
                            onClick={async () => {
                                setRegenerating(true);
                                try { await onRegenerateMap(); } finally { setRegenerating(false); }
                            }}
                            className="shrink-0 rounded-full border border-wuxia-gold/30 bg-wuxia-gold/5 px-3 py-1 text-sm text-wuxia-gold hover:bg-wuxia-gold/15 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                            {regenerating ? '解析中…' : '回忆解析'}
                        </button>
                    )}
                </div>

                {/* 地图区域 */}
                <div className="flex-1 min-h-0 p-3">
                    <RegionMap
                        nodes={childNodes}
                        allNodes={tree.根节点 ? [tree.根节点] : []}
                        selectedNodeId={selectedNode?.ID}
                        playerName={playerName}
                        currentNodeId={tree.当前节点?.ID || ''}
                        currentLocationName={tree.当前节点?.名称 || ''}
                        onSelect={setSelectedNode}
                        onLocateCurrent={() => {
                            const cur = tree.当前节点;
                            if (!cur) return;
                            const parent = cur.父级ID && tree.节点映射.has(cur.父级ID) ? tree.节点映射.get(cur.父级ID)! : null;
                            if (parent) setSelectedNode(parent);
                            else setSelectedNode(cur);
                        }}
                        level={currentViewNode?.层级 || '大地点'}
                        socialList={socialList}
                        env={env}
                        viewLocationName={currentViewNode?.名称 || ''}
                        viewPathNames={breadcrumb.map((node) => node.名称)}
                        viewDescription={currentViewNode?.描述 || ''}
                        viewNodeNpcs={selectedNodePeople}
                    />
                </div>
            </div>

            {/* 右侧面板：三栏固定高度 */}
            <div className={`${rightPanelWidth} grid gap-2 min-h-0 ${compact ? 'overflow-hidden' : 'shrink-0'}`} style={{
                height: compact ? '100%' : '100%',
                gridTemplateRows: compact ? 'minmax(110px,1fr) minmax(72px,auto) minmax(76px,0.8fr)' : '1fr auto auto',
            }}>

                {/* 框一：地点索引 — 最长 */}
                <div className="flex flex-col overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-[#0a0d14] min-h-0">
                    <div className="border-b border-wuxia-gold/10 bg-black/40 px-4 py-3 shrink-0">
                        <h3 className="text-sm font-bold tracking-[0.2em] text-gray-400 uppercase">地点索引</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        {tree.根节点 ? (
                            <LocationTreeItem node={tree.根节点} selectedId={selectedNode?.ID || ''} playerLocationId={tree.当前节点?.ID || ''} playerAncestorIds={playerAncestorIds} depth={0} onSelect={setSelectedNode} socialList={socialList} playerName={playerName} />
                        ) : (
                            <div className="p-4 text-sm text-gray-500 text-center space-y-2">
                                <div>暂无地点数据</div>
                                <div className="text-xs text-gray-600">层级：{layerCount} | 节点：{tree.节点映射.size} | 根：{tree.根节点 ? '有' : '无'}</div>
                                {onRegenerateMap && (
                                    <button disabled={regenerating} onClick={async () => { setRegenerating(true); try { await onRegenerateMap(); } finally { setRegenerating(false); } }}
                                        className="mt-2 px-3 py-1 rounded border border-wuxia-gold/30 bg-wuxia-gold/5 text-xs text-wuxia-gold hover:bg-wuxia-gold/10 transition-colors disabled:opacity-50">
                                        {regenerating ? '解析中…' : '回忆解析'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 框二：区域介绍 — 中等 */}
                <div className="flex flex-col overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-[#0a0d14]">
                    <div className="border-b border-wuxia-gold/10 bg-black/40 px-4 py-3 shrink-0">
                        <h3 className="text-sm font-bold tracking-[0.2em] text-gray-400 uppercase">区域介绍</h3>
                    </div>
                    <div className="p-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: '180px' }}>
                        {selectedNode ? (
                            <>
                                <div className="text-xs tracking-widest text-gray-500 mb-1">{层级标签[selectedNode.层级]} · {selectedNode.子节点.length} 个子区域</div>
                                <div className="text-sm font-bold text-gray-200 mb-1">{(selectedNode as any).名称 || ''}</div>
                                {(selectedNode.控制势力 || selectedNode.势力影响 || (selectedNode.势力标签 && selectedNode.势力标签.length > 0)) && (
                                    <div className="mb-2 rounded border border-amber-400/20 bg-amber-400/5 px-2 py-1.5 text-sm text-amber-100/90">
                                        {selectedNode.控制势力 && <div><span className="text-amber-300">主导势力：</span>{selectedNode.控制势力}</div>}
                                        {selectedNode.势力影响 && <div className="mt-0.5"><span className="text-amber-300">势力分布：</span>{selectedNode.势力影响}</div>}
                                        {selectedNode.势力标签 && selectedNode.势力标签.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {selectedNode.势力标签.map((tag) => (
                                                    <span key={tag} className="rounded border border-amber-300/20 bg-black/30 px-1.5 py-0.5 text-xs text-amber-200/80">{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {((selectedNode as any).描述) ? (
                                    <div className="text-sm text-gray-400 leading-relaxed">{(selectedNode as any).描述}</div>
                                ) : (
                                    <div className="text-sm text-gray-600">暂无描述</div>
                                )}
                                {onInsertCommand && (
                                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const name = String((selectedNode as any).名称 || '').trim();
                                                if (name) onInsertCommand(`前往【${name}】`);
                                            }}
                                            className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-1.5 text-sm font-bold text-wuxia-gold hover:bg-wuxia-gold/20"
                                        >
                                            前往此地
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const name = String((selectedNode as any).名称 || '').trim();
                                                const desc = String((selectedNode as any).描述 || '').trim();
                                                if (name) onInsertCommand(`查看【${name}】详情${desc ? `：${desc}` : ''}`);
                                            }}
                                            className="rounded-lg border border-gray-700 bg-black/40 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
                                        >
                                            查看详情
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-sm text-gray-600">点击地点查看详情</div>
                        )}
                    </div>
                </div>

                {/* 框三：解析日志 — 最矮，固定高度 */}
                <div className="flex flex-col overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-[#0a0d14]">
                    <div className="border-b border-wuxia-gold/10 bg-black/40 px-4 py-3 shrink-0">
                        <h3 className="text-sm font-bold tracking-[0.2em] text-gray-400 uppercase">
                            回忆解析日志
                            {regenerating && <span className="ml-2 text-wuxia-gold animate-pulse text-xs">● 流式输出中…</span>}
                            {!regenerating && rawResponse && <span className="ml-2 text-emerald-400 text-xs">● 解析完成</span>}
                        </h3>
                    </div>
                    <div className="overflow-y-auto p-3 custom-scrollbar" style={{ height: compact ? '100px' : '150px' }}>
                        {rawResponse ? (
                            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-400 font-mono">{rawResponse}</pre>
                        ) : (
                            <div className="text-sm text-gray-600">点击"回忆解析"后，AI 会从回忆库重建地图，过程将在此流式显示。</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default LocationBrowser;
