import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { 地点树节点 } from '../../../utils/locationTree';
import { 提取NPC精确地图位置片段 } from '../../../utils/mapNpcLocation';

interface Props {
    /** 当前层子节点（保留兼容；连续地图优先使用 allNodes） */
    nodes: 地点树节点[];
    /** 完整地图树的根节点，用于「一张图无缝切换」 */
    allNodes?: 地点树节点[];
    currentNodeId: string;
    currentLocationName: string;
    onSelect: (node: 地点树节点) => void;
    onLocateCurrent: () => void;
    level?: 地点树节点['层级'];
    socialList?: any[];
    env?: { 大地点?: string; 中地点?: string; 小地点?: string; 具体地点?: string };
    viewLocationName?: string;
    viewPathNames?: string[];
    viewDescription?: string;
    viewNodeNpcs?: any[];
    /** 地点索引/面包屑当前选中的节点，变化时飞入对应区块 */
    selectedNodeId?: string;
    playerName?: string;
}

type 层级名 = 地点树节点['层级'];
type 视野 = { x: number; y: number; w: number; h: number };
type 区块 = { x: number; y: number; w: number; h: number };

interface 布局项 {
    node: 地点树节点;
    box: 区块;
    depth: number;
    /** 父块顶部给人物预留的轨道高度 */
    track: number;
    子节点: 布局项[];
}

interface 人物点 { name: string; player: boolean }

const WORLD: 视野 = { x: 0, y: 0, w: 1000, h: 680 };
const ORDER: Record<string, number> = { 寰宇: 0, 大地点: 1, 中地点: 2, 小地点: 3, 区地点: 4, 子地点: 5 };
const 层级标签: Record<层级名, string> = {
    寰宇: '界域', 大地点: '大陆', 中地点: '地域', 小地点: '城镇', 区地点: '场所', 子地点: '房间',
};
const FILL: Record<层级名, string> = {
    寰宇: 'rgba(96,132,180,0.18)',
    大地点: 'rgba(104,150,116,0.20)',
    中地点: 'rgba(170,140,85,0.20)',
    小地点: 'rgba(196,160,100,0.24)',
    区地点: 'url(#map-bld-normal)',
    子地点: 'rgba(232,206,160,0.26)',
};
const STROKE: Record<层级名, string> = {
    寰宇: 'rgba(140,180,230,0.34)',
    大地点: 'rgba(130,180,140,0.38)',
    中地点: 'rgba(200,170,110,0.40)',
    小地点: 'rgba(200,165,105,0.38)',
    区地点: 'rgba(214,180,126,0.55)',
    子地点: 'rgba(224,200,158,0.45)',
};
const 目标字号: Record<层级名, number> = {
    寰宇: 18, 大地点: 16, 中地点: 14, 小地点: 13, 区地点: 12, 子地点: 11,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const 稳定哈希数 = (input: string): number => {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};

const 名字文本 = (name: string) => (name && name.length > 4 ? `${name.slice(0, 4)}…` : name) || '';

/** 父块顶部留人物轨道，子块从轨道下方开始排；人物另有最上层绘制，不会被压住。 */
function 排布地图树(roots: 地点树节点[], 人物映射: Map<string, 人物点[]>): { flat: 布局项[]; byId: Map<string, 布局项> } {
    const flat: 布局项[] = [];
    const byId = new Map<string, 布局项>();
    const visited = new Set<string>();

    const walk = (node: 地点树节点, box: 区块, depth: number) => {
        if (visited.has(node.ID)) return;
        visited.add(node.ID);
        const kids = (node.子节点 || []).filter(kid => kid && kid.ID !== node.ID && !visited.has(kid.ID));
        const item: 布局项 = { node, box, depth, track: 0, 子节点: [] };
        flat.push(item);
        byId.set(node.ID, item);
        if (kids.length === 0) return;

        const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
        const rows = Math.ceil(kids.length / cols);
        const pad = Math.max(2, Math.min(box.w / (cols + 1), box.h / (rows + 1)) * 0.22);
        const 人数 = 人物映射.get(node.ID)?.length || 0;
        const track = 人数 > 0 ? Math.min(box.h * 0.24, 16 + (人数 > 3 ? 26 : 14)) : Math.min(box.h * 0.06, 8);
        item.track = track;
        const inner: 区块 = {
            x: box.x + pad,
            y: box.y + pad + track,
            w: Math.max(2, box.w - pad * 2),
            h: Math.max(2, box.h - pad * 2 - track),
        };
        const gap = Math.max(2, Math.min(inner.w / (cols + 1), inner.h / (rows + 1)) * 0.22);
        const cw = Math.max(1.5, (inner.w - gap * (cols + 1)) / cols);
        const ch = Math.max(1.5, (inner.h - gap * (rows + 1)) / rows);
        kids.forEach((kid, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const child = 排布子项(kid, {
                x: inner.x + gap + col * (cw + gap),
                y: inner.y + gap + row * (ch + gap),
                w: cw,
                h: ch,
            }, depth + 1);
            item.子节点.push(child);
        });
    };

    // 拆成内部函数，避免递归时重复创建临时数组
    function 排布子项(node: 地点树节点, box: 区块, depth: number): 布局项 {
        const before = flat.length;
        walk(node, box, depth);
        return flat[before] || { node, box, depth, track: 0, 子节点: [] };
    }

    roots.forEach(root => walk(root, WORLD, 0));
    return { flat, byId };
}

const RegionMap: React.FC<Props> = ({
    nodes,
    allNodes,
    currentNodeId,
    currentLocationName,
    onSelect,
    onLocateCurrent,
    level,
    socialList = [],
    env,
    viewLocationName,
    viewPathNames,
    viewDescription,
    viewNodeNpcs,
    selectedNodeId,
    playerName = '',
}) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [容器, set容器] = useState({ w: 800, h: 520 });
    const [view, setView] = useState<视野>({ ...WORLD });
    const viewRef = useRef(view);
    const tweenRef = useRef<number | null>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; from: 视野; moved: boolean } | null>(null);
    const suppressClickRef = useRef(false);
    const 已外部选中 = useRef<string | null>(null);

    useEffect(() => { viewRef.current = view; }, [view]);

    useLayoutEffect(() => {
        const target = wrapRef.current;
        if (!target) return;
        const update = () => set容器({ w: Math.max(240, target.clientWidth), h: Math.max(200, target.clientHeight) });
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(target);
        return () => observer.disconnect();
    }, []);

    // NPC 落点：同名只保留一次，只认位置路径里真实出现的节点，多个命中取最深。
    const 人物映射 = useMemo(() => {
        const result = new Map<string, 人物点[]>();
        const add = (id: string, person: 人物点) => {
            if (!id) return;
            const list = result.get(id) || [];
            if (list.some(item => item.name === person.name)) return;
            list.push(person);
            result.set(id, list);
        };
        const 源节点 = allNodes?.length ? allNodes : nodes;
        const 全部 = 源节点.flatMap(root => [root, ...(function collect(node: 地点树节点): 地点树节点[] {
            return (node.子节点 || []).flatMap(child => [child, ...collect(child)]);
        })(root)]);
        const 深到浅 = [...全部].sort((a, b) => {
            const depth = (node: 地点树节点) => {
                let d = 0;
                let cursor = node;
                const seen = new Set<string>();
                while (cursor?.父级ID && !seen.has(cursor.ID) && seen.size < 30) {
                    seen.add(cursor.ID);
                    const parent = 全部.find(item => item.ID === cursor.父级ID);
                    if (!parent) break;
                    cursor = parent;
                    d += 1;
                }
                return d;
            };
            return depth(b) - depth(a);
        });
        const 已见 = new Set<string>();
        (Array.isArray(socialList) ? socialList : []).forEach((npc: any) => {
            const name = String(npc?.姓名 || npc?.名称 || '').trim();
            if (!name || 已见.has(name)) return;
            已见.add(name);
            const parts = 提取NPC精确地图位置片段(npc);
            let target: 地点树节点 | null = null;
            for (const node of 深到浅) {
                const nodeName = node.名称.replace(/\s+/g, '').toLowerCase();
                if (nodeName && parts.some(part => part === nodeName || (part.length >= 2 && part.includes(nodeName)))) {
                    target = node;
                    break;
                }
            }
            if (!target && npc?.是否在场 === true) target = 全部.find(node => node.ID === currentNodeId) || null;
            if (target) add(target.ID, { name, player: false });
        });
        const me = playerName.trim();
        if (me && currentNodeId) add(currentNodeId, { name: me, player: true });
        return result;
    }, [allNodes, nodes, socialList, currentNodeId, playerName]);

    const { flat, byId } = useMemo(() => {
        const 全部节点 = allNodes?.length ? allNodes : nodes;
        const roots = 全部节点.filter(root => root && (!root.父级ID || !全部节点.some(node => node.ID === root.父级ID)));
        return 排布地图树(roots, 人物映射);
    }, [allNodes, nodes, 人物映射]);

    const 飞入 = useCallback((box: 区块, pad = 22, animate = true) => {
        const from = viewRef.current;
        const ratio = from.w / Math.max(1, from.h);
        let w = box.w + pad * 2;
        let h = box.h + pad * 2;
        if (w / h < ratio) w = h * ratio; else h = w / ratio;
        const to: 视野 = {
            x: box.x + box.w / 2 - w / 2,
            y: box.y + box.h / 2 - h / 2,
            w,
            h,
        };
        if (!animate) {
            if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
            tweenRef.current = null;
            viewRef.current = to;
            setView(to);
            return;
        }
        const start = performance.now();
        if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
        const step = (t: number) => {
            const k = clamp((t - start) / 420, 0, 1);
            const e = 1 - Math.pow(1 - k, 3);
            const next: 视野 = {
                x: from.x + (to.x - from.x) * e,
                y: from.y + (to.y - from.y) * e,
                w: from.w + (to.w - from.w) * e,
                h: from.h + (to.h - from.h) * e,
            };
            viewRef.current = next;
            setView(next);
            if (k < 1) tweenRef.current = requestAnimationFrame(step);
            else tweenRef.current = null;
        };
        tweenRef.current = requestAnimationFrame(step);
    }, []);

    useEffect(() => () => {
        if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    }, []);

    // 当前所在地点变化时，自动把镜头放到玩家所在区块。
    // 注意只按 ID 变化触发：父组件每次渲染都会重建 allNodes/人物映射，若把 byId 当依赖
    // 直接飞入，玩家点开别的区块看详情时镜头会被立刻拉回去。
    const 上次定位节点 = useRef<string | null>(null);
    useEffect(() => {
        if (上次定位节点.current === currentNodeId) return;
        上次定位节点.current = currentNodeId;
        const target = byId.get(currentNodeId);
        if (target) 飞入(target.box, 24, false);
    }, [currentNodeId, byId, 飞入]);

    // 地点索引/面包屑选中变化时飞入；点地图自身触发的选中不重复飞。
    useEffect(() => {
        if (!selectedNodeId || 已外部选中.current === selectedNodeId) return;
        已外部选中.current = selectedNodeId;
        const target = byId.get(selectedNodeId);
        if (target) 飞入(target.box, 24, true);
    }, [selectedNodeId, byId, 飞入]);

    const 缩放 = useCallback((factor: number) => {
        const cur = viewRef.current;
        const nw = clamp(cur.w * factor, 70, 1500);
        const nh = nw * (cur.h / cur.w);
        setView({
            x: cur.x - (nw - cur.w) / 2,
            y: cur.y - (nh - cur.h) / 2,
            w: nw,
            h: nh,
        });
    }, []);

    // 原生 wheel 监听，避免 React 的 passive 监听无法 preventDefault。
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = svg.getBoundingClientRect();
            const cur = viewRef.current;
            const scale = Math.min(rect.width / cur.w, rect.height / cur.h) || 1;
            const offsetX = (rect.width - cur.w * scale) / 2;
            const offsetY = (rect.height - cur.h * scale) / 2;
            const worldX = cur.x + (event.clientX - rect.left - offsetX) / scale;
            const worldY = cur.y + (event.clientY - rect.top - offsetY) / scale;
            const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
            const nw = clamp(cur.w * factor, 70, 1500);
            const nh = nw * (cur.h / cur.w);
            const next: 视野 = {
                x: worldX - (worldX - cur.x) * (nw / cur.w),
                y: worldY - (worldY - cur.y) * (nh / cur.h),
                w: nw,
                h: nh,
            };
            viewRef.current = next;
            setView(next);
        };
        svg.addEventListener('wheel', onWheel, { passive: false });
        return () => svg.removeEventListener('wheel', onWheel);
    }, []);

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, from: { ...viewRef.current }, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = Math.min(rect.width / drag.from.w, rect.height / drag.from.h) || 1;
        const next: 视野 = { ...drag.from, x: drag.from.x - dx / scale, y: drag.from.y - dy / scale };
        viewRef.current = next;
        setView(next);
    };
    const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        if (drag.moved) suppressClickRef.current = true;
        dragRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleSelect = (node: 地点树节点) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        已外部选中.current = node.ID;
        onSelect(node);
        const target = byId.get(node.ID);
        if (target) 飞入(target.box, 24, true);
    };

    const 画布比例 = Math.min(容器.w / Math.max(1, view.w), 容器.h / Math.max(1, view.h)) || 1;
    const px2world = 1 / 画布比例;
    // 名称是否显示由「框在屏幕上够不够大」决定，不再按整图视野宽度一刀切；
    // 否则全览时明明有空间的城镇也会变成空框，AI 生成的地名看不到。
    const 显示名 = view.w < 2400;
    const 显示人物名 = view.w < 1500;
    const 最小可读 = 9.5;

    const 有建筑 = flat.some(item => item.node.层级 === '区地点' || item.node.层级 === '子地点');
    const 有人物 = 人物映射.size > 0;
    const isSpace = level === '寰宇';

    return (
        <div ref={wrapRef} className="relative h-full min-h-[400px] w-full overflow-hidden rounded-xl"
            style={{ background: '#0a0d14', border: '1px solid rgba(190,158,92,0.24)' }}>
            <svg ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={() => 飞入(WORLD, 0, true)}
            >
                <defs>
                    <linearGradient id="map-bld-normal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e9d7af" />
                        <stop offset="100%" stopColor="#b99560" />
                    </linearGradient>
                    <linearGradient id="map-bld-current" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#efb266" />
                        <stop offset="100%" stopColor="#b96b20" />
                    </linearGradient>
                    <filter id="map-bld-shadow" x="-25%" y="-25%" width="150%" height="150%">
                        <feDropShadow dx="0" dy="0.3" stdDeviation="0.3" floodColor="rgba(0,0,0,0.45)" />
                    </filter>
                </defs>

                <rect x={WORLD.x} y={WORLD.y} width={WORLD.w} height={WORLD.h} rx={12}
                    fill="rgba(28,34,44,0.92)" stroke="rgba(190,158,92,0.22)" strokeWidth={2} pointerEvents="none" />

                {flat.map((item) => {
                    const { node, box } = item;
                    const x = box.x, y = box.y, w = box.w, h = box.h;
                    const isBuilding = node.层级 === '区地点' || node.层级 === '子地点';
                    const isPlayerHere = node.ID === currentNodeId;
                    const isSelected = node.ID === selectedNodeId;
                    const 有子节点 = item.子节点.length > 0;
                    const radius = isBuilding ? Math.min(4, w * 0.05) : Math.min(10, Math.max(3, w * 0.02));
                    const 框宽px = w * 画布比例;
                    const 框高px = h * 画布比例;
                    const 字px = Math.min(目标字号[node.层级] || 11, 框宽px * 0.24, 框高px * 0.34);
                    const nameSize = 字px * px2world;
                    // 名称截断按「框在屏幕上能放几个字」算，避免全览时长地名糊成一团
                    const 可容字数 = Math.max(0, Math.floor(框宽px / Math.max(6, 字px * 0.98)));
                    const 叶名 = 可容字数 >= 2
                        ? (node.名称.length > 可容字数 ? `${node.名称.slice(0, 可容字数 - 1)}…` : node.名称)
                        : '';
                    const 父标签可容 = Math.max(0, Math.floor((框宽px - 14) / Math.max(6, Math.min(10.5, 框宽px * 0.18) * 0.98)));
                    const 父标签名 = 父标签可容 >= 2
                        ? (node.名称.length > 父标签可容 ? `${node.名称.slice(0, 父标签可容 - 1)}…` : node.名称)
                        : '';
                    const 门朝向 = 稳定哈希数(node.ID) % 4;
                    // 门/屋顶按 CSS 像素给尺寸（MapLibre 式标注口径），不要按世界坐标比例放大
                    const 门宽 = Math.min(14 * px2world, w * 0.34);
                    const 门高 = Math.min(8 * px2world, h * 0.3);
                    const 屋檐缩进 = Math.min(8 * px2world, w * 0.14);
                    const 屋檐高度 = Math.min(6 * px2world, h * 0.22);

                    return (
                        <g key={node.ID}>
                            <rect data-node={node.ID} x={x} y={y} width={w} height={h} rx={radius}
                                fill={isBuilding ? (isPlayerHere ? 'url(#map-bld-current)' : 'url(#map-bld-normal)') : FILL[node.层级]}
                                stroke={isPlayerHere || isSelected ? 'rgba(255,196,96,0.95)' : STROKE[node.层级]}
                                strokeWidth={(isPlayerHere || isSelected ? 1.6 : Math.max(0.8, Math.min(2, w * 0.012)))}
                                filter={isBuilding ? 'url(#map-bld-shadow)' : undefined}
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSelect(node)}
                            >
                                <title>{`${层级标签[node.层级]} · ${node.名称}${node.控制势力 ? `\n主导势力：${node.控制势力}` : ''}${node.描述 ? `\n${node.描述}` : ''}`}</title>
                            </rect>

                            {isBuilding && 框高px > 10 && (
                                <g pointerEvents="none">
                                    <line x1={x + 屋檐缩进} y1={y + 屋檐高度} x2={x + w - 屋檐缩进} y2={y + 屋檐高度}
                                        stroke="rgba(74,46,18,0.35)" strokeWidth={Math.max(0.6 * px2world, 0.6)} />
                                    {门朝向 === 0 && <rect x={x + w / 2 - 门宽 / 2} y={y + h - 门高} width={门宽} height={门高}
                                        rx={0.4 * px2world} fill="rgba(64,36,14,0.45)" />}
                                    {门朝向 === 1 && <rect x={x + w - 门高} y={y + h / 2 - 门宽 / 2} width={门高} height={门宽}
                                        rx={0.4 * px2world} fill="rgba(64,36,14,0.45)" />}
                                    {门朝向 === 2 && <rect x={x + w / 2 - 门宽 / 2} y={y} width={门宽} height={门高}
                                        rx={0.4 * px2world} fill="rgba(64,36,14,0.45)" />}
                                    {门朝向 === 3 && <rect x={x} y={y + h / 2 - 门宽 / 2} width={门高} height={门宽}
                                        rx={0.4 * px2world} fill="rgba(64,36,14,0.45)" />}
                                </g>
                            )}

                            {显示名 && !有子节点 && 字px >= 最小可读 && 叶名 && (
                                <g pointerEvents="none">
                                    <text x={x + w / 2} y={y + h / 2 - (node.控制势力 ? nameSize * 0.34 : 0)}
                                        textAnchor="middle" dominantBaseline="middle"
                                        fill={isPlayerHere ? '#ffe0a8' : 'rgba(250,240,220,0.94)'}
                                        stroke="rgba(8,11,18,0.9)" strokeWidth={2 * px2world} paintOrder="stroke"
                                        fontSize={nameSize} fontFamily="serif" fontWeight="bold">
                                        {叶名}
                                    </text>
                                    {node.控制势力 && Math.min(9, 字px * 0.78, 框高px * 0.2) >= 最小可读 && (
                                        <text x={x + w / 2} y={y + h / 2 + nameSize * 0.98}
                                            textAnchor="middle" dominantBaseline="middle"
                                            fill="rgba(236,212,170,0.78)"
                                            stroke="rgba(8,11,18,0.85)" strokeWidth={1.5 * px2world} paintOrder="stroke"
                                            fontSize={Math.min(9, 字px * 0.78) * px2world} fontFamily="serif">
                                            {node.控制势力}
                                        </text>
                                    )}
                                </g>
                            )}

                            {有子节点 && 框宽px > 60 && 框高px > 40 && 父标签名 && Math.min(10.5, 框宽px * 0.18) >= 最小可读 && (
                                <text x={x + 6 * px2world} y={y + 9 * px2world}
                                    textAnchor="start" dominantBaseline="middle" pointerEvents="none"
                                    fill={isPlayerHere ? '#ffd48a' : 'rgba(248,230,196,0.92)'}
                                    fontSize={Math.min(10.5, 框宽px * 0.18) * px2world} fontFamily="serif"
                                    fontWeight={isPlayerHere ? 'bold' : 'normal'}>
                                    {父标签名}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* 人物统一最后绘制：无论父块还是子块，圆点与姓名都不会被遮挡。 */}
                {flat.map((item) => {
                    const markers = 人物映射.get(item.node.ID) || [];
                    if (markers.length === 0) return null;
                    const { x, y, w, h } = item.box;
                    const 框宽px = w * 画布比例;
                    const 框高px = h * 画布比例;
                    if (框宽px <= 26 || 框高px <= 16) return null;
                    const rpx = Math.min(4.6, 框宽px * 0.055, 框高px * 0.085);
                    const r = Math.max(0.8, rpx * px2world);
                    const 名字px = Math.min(12, 框宽px * 0.22);
                    const gapPx = clamp(框宽px / markers.length, rpx * 2.6, 46);
                    const 画名字 = 显示人物名 && 名字px >= 8
                        && gapPx >= (item.子节点.length > 0 ? 22 : 18)
                        && 框高px > (item.子节点.length > 0 ? 60 : 26);
                    const cy = item.子节点.length > 0
                        ? y + Math.max(4, item.track * 0.42)
                        : y + h - Math.max(r * 2.4, 7 * px2world);
                    return (
                        <g key={`people-${item.node.ID}`} pointerEvents="none">
                            {markers.map((marker, index) => {
                                const cx = x + w / 2 + (index - (markers.length - 1) / 2) * gapPx * px2world;
                                const 名宽px = Math.max(1, 名字文本(marker.name).length) * 名字px * 0.95;
                                return (
                                    <g key={`${item.node.ID}-${marker.name}`}>
                                        <circle cx={cx} cy={cy} r={r + 1.1 * px2world} fill="rgba(250,244,230,0.95)" />
                                        <circle cx={cx} cy={cy} r={r}
                                            fill={marker.player ? '#40c870' : '#f06090'}
                                            stroke={marker.player ? '#1f7a3f' : '#c03060'}
                                            strokeWidth={1 * px2world} />
                                        {画名字 && gapPx >= 名宽px * 1.05 && (
                                            <text x={cx} y={cy + r + 4 * px2world}
                                                textAnchor="middle" dominantBaseline="middle"
                                                fill={marker.player ? '#86efac' : '#f9a8d4'}
                                                stroke="rgba(8,11,18,0.92)" strokeWidth={2 * px2world} paintOrder="stroke"
                                                fontSize={名字px * px2world} fontFamily="serif" fontWeight="bold">
                                                {名字文本(marker.name)}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}
            </svg>

            {/* 工具栏 */}
            <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
                {[
                    { label: '+', title: '放大', action: () => 缩放(1 / 1.25) },
                    { label: '−', title: '缩小', action: () => 缩放(1.25) },
                    {
                        label: '⊙', title: `定位到${currentLocationName || '当前位置'}`,
                        action: () => {
                            const target = byId.get(currentNodeId);
                            if (target) 飞入(target.box, 24, true);
                            else onLocateCurrent();
                        },
                    },
                    { label: '⌂', title: '全览（双击地图同效）', action: () => 飞入(WORLD, 0, true) },
                ].map(button => (
                    <button key={button.label} onClick={button.action} title={button.title}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-wuxia-gold/30 bg-[#12161f]/90 text-sm text-wuxia-gold transition-colors hover:bg-wuxia-gold/15">
                        {button.label}
                    </button>
                ))}
                <div className="text-center font-mono text-xs text-wuxia-gold/60">{(WORLD.w / view.w).toFixed(1)}x</div>
            </div>

            {/* 图例：只显示当前地图里实际出现的内容 */}
            <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-wuxia-gold/20 bg-[#12161f]/90 px-3 py-2">
                <div className="mb-1 text-xs font-bold tracking-[0.18em] text-wuxia-gold/70">图例</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
                    {Array.from(new Set(flat.map(item => item.node.层级)))
                        .sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9))
                        .map(layer => (
                            <span key={layer} className="inline-flex items-center gap-1.5">
                                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: layer === '区地点' ? '#c89a5c' : FILL[layer] }} />
                                {层级标签[layer]}
                            </span>
                        ))}
                    {有建筑 && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm border border-amber-600/60 bg-amber-700/40" />场所</span>}
                    {playerName && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#40c870] ring-1 ring-[#1f7a3f]" />玩家</span>}
                    {有人物 && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#f06090] ring-1 ring-[#c03060]" />NPC</span>}
                </div>
            </div>

            {/* 保留视图描述给读屏/调试，不影响画面 */}
            <span className="sr-only">{viewLocationName || currentLocationName}{viewPathNames?.length ? `：${viewPathNames.join(' > ')}` : ''}{viewDescription ? `，${viewDescription}` : ''}{viewNodeNpcs?.length ? `，在场 ${viewNodeNpcs.length} 人` : ''}{isSpace ? '，星空视图' : ''}</span>
        </div>
    );
};

export default RegionMap;
