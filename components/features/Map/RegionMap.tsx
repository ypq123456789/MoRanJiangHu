import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { 地点树节点 } from '../../../utils/locationTree';
import { 构建地图人物标记, type 地图人物标记 as 人物点 } from '../../../utils/mapNpcLocation';
import { getRoomSlots, layoutRoomGrid, roomDoorPoint } from '../../../utils/roomFloorplan';
import { getRoomPassages } from '../../../utils/roomConnections';

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
    peopleByNode?: Map<string, 人物点[]>;
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
    fog?: 区块[];
    passages?: Array<[地点树节点, 地点树节点]>;
}

const WORLD: 视野 = { x: 0, y: 0, w: 1000, h: 680 };
const ORDER: Record<string, number> = { 寰宇: 0, 大地点: 1, 中地点: 2, 小地点: 3, 区地点: 4, 子地点: 5 };
const 层级标签: Record<层级名, string> = {
    寰宇: '界域', 大地点: '大陆', 中地点: '地域', 小地点: '城镇', 区地点: '场所', 子地点: '房间',
};
// 绘图色全部走 CSS 变量（.moran-map-surface / html[data-theme="day"] 覆盖）。
// SVG presentation attribute 里的常量色不会被主题规则改到，白天会留下深底金字。
const FILL: Record<层级名, string> = {
    寰宇: 'var(--mm-fill-0)',
    大地点: 'var(--mm-fill-1)',
    中地点: 'var(--mm-fill-2)',
    小地点: 'var(--mm-fill-3)',
    区地点: 'var(--mm-fill-4)',
    子地点: 'var(--mm-fill-5)',
};
const STROKE: Record<层级名, string> = {
    寰宇: 'var(--mm-stroke-0)',
    大地点: 'var(--mm-stroke-1)',
    中地点: 'var(--mm-stroke-2)',
    小地点: 'var(--mm-stroke-3)',
    区地点: 'var(--mm-stroke-4)',
    子地点: 'var(--mm-stroke-5)',
};
const 目标字号: Record<层级名, number> = {
    寰宇: 18, 大地点: 16, 中地点: 14, 小地点: 13, 区地点: 12, 子地点: 11,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
        if (node.层级 === '区地点' && kids.every(child => child.层级 === '子地点')) {
            // 轨道与内框固定，后来进入的人物或新房间不会移动已有格子。
            item.track = box.h * 0.16;
            const inner = {
                x: box.x + box.w * 0.03, y: box.y + item.track,
                w: box.w * 0.94, h: box.h * 0.80
            };
            const slots = getRoomSlots(kids);
            const used = new Set(slots.values());
            const roomCount = Array.from(used).reduce((count, index) => Math.max(count, index + 1), 0);
            const plan = layoutRoomGrid(node.ID, inner, roomCount);
            item.fog = [...plan.fog, ...plan.rooms.filter((_, index) => !used.has(index))];
            item.passages = getRoomPassages(kids);
            kids.forEach(child => item.子节点.push(排布子项(child, plan.rooms[slots.get(child.ID)!], depth + 1)));
            return;
        }
        if (kids.length === 0) return;

        // 按父块的宽高排网格。若每层两个孩子都左右分栏，五层后的房间就只剩一条竖线。
        const cols = clamp(Math.round(Math.sqrt(kids.length * box.w / box.h)), 1, kids.length);
        const rows = Math.ceil(kids.length / cols);
        const minSide = Math.min(box.w, box.h);
        const pad = clamp(Math.min(box.w / (cols + 1), box.h / (rows + 1)) * 0.16, Math.min(0.2, minSide * 0.08), 14);
        const 人数 = 人物映射.get(node.ID)?.length || 0;
        const track = 人数 > 0 ? Math.min(box.h * 0.20, 16 + (人数 > 3 ? 26 : 14)) : Math.min(box.h * 0.04, 6);
        item.track = track;
        const inner: 区块 = {
            x: box.x + pad,
            y: box.y + pad + track,
            w: Math.max(1, box.w - pad * 2),
            h: Math.max(1, box.h - pad * 2 - track),
        };
        const minInner = Math.min(inner.w, inner.h);
        const gap = clamp(Math.min(inner.w / (cols + 1), inner.h / (rows + 1)) * 0.18, Math.min(0.15, minInner * 0.08), 12);
        const cw = Math.max(0.6, (inner.w - gap * (cols + 1)) / cols);
        const ch = Math.max(0.6, (inner.h - gap * (rows + 1)) / rows);
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
    peopleByNode,
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
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; from: 视野; moved: boolean; captured: boolean } | null>(null);
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

    const 人物映射 = useMemo(() => peopleByNode || 构建地图人物标记(
        allNodes?.length ? allNodes : nodes, currentNodeId, socialList, playerName
    ), [peopleByNode, allNodes, nodes, currentNodeId, socialList, playerName]);

    const { flat, byId } = useMemo(() => {
        const 全部节点 = allNodes?.length ? allNodes : nodes;
        const roots = 全部节点.filter(root => root && (!root.父级ID || !全部节点.some(node => node.ID === root.父级ID)));
        return 排布地图树(roots, 人物映射);
    }, [allNodes, nodes, 人物映射]);

    // 根据最深层节点（房间/子地点）尺寸动态计算最小视野宽度，解除原先固定 70 (14.3x) 的放大上限
    const minViewW = useMemo(() => {
        let minBoxSpan = WORLD.w;
        flat.forEach((item) => {
            const span = Math.min(item.box.w, item.box.h);
            if (span > 0 && span < minBoxSpan) minBoxSpan = span;
        });
        return Math.min(minBoxSpan * 1.45, 40);
    }, [flat]);

    const 取消飞入动画 = useCallback(() => {
        if (tweenRef.current !== null) {
            cancelAnimationFrame(tweenRef.current);
            tweenRef.current = null;
        }
    }, []);

    const 飞入 = useCallback((box: 区块, pad = 22, animate = true) => {
        const from = viewRef.current;
        const ratio = from.w / Math.max(1, from.h);
        const effectivePad = pad <= 0
            ? 0
            : Math.min(pad, Math.max(box.w, box.h) * 0.28);
        let w = box.w + effectivePad * 2;
        let h = box.h + effectivePad * 2;
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
        if (!currentNodeId || 上次定位节点.current === currentNodeId) return;
        const target = byId.get(currentNodeId);
        // 布局还没建好时先不记为已定位，等 byId 里出现该节点再补一次；
        // 但只认 ID 变化，父组件重建 allNodes 不会把镜头拉回玩家位置。
        if (!target) return;
        上次定位节点.current = currentNodeId;
        飞入(target.box, 24, false);
    }, [currentNodeId, byId, 飞入]);

    // 地点索引/面包屑选中变化时飞入；点地图自身触发的选中不重复飞。
    useEffect(() => {
        if (!selectedNodeId || 已外部选中.current === selectedNodeId) return;
        已外部选中.current = selectedNodeId;
        const target = byId.get(selectedNodeId);
        if (target) 飞入(target.box, 24, true);
    }, [selectedNodeId, byId, 飞入]);

    const 缩放 = useCallback((factor: number) => {
        取消飞入动画();
        const cur = viewRef.current;
        const nw = clamp(cur.w * factor, minViewW, 1500);
        const nh = nw * (cur.h / cur.w);
        setView({
            x: cur.x - (nw - cur.w) / 2,
            y: cur.y - (nh - cur.h) / 2,
            w: nw,
            h: nh,
        });
    }, [取消飞入动画, minViewW]);

    // 原生 wheel 监听，避免 React 的 passive 监听无法 preventDefault。
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            // 用户手动缩放即接管镜头：先停掉尚未结束的飞入，否则下一帧会把它覆盖回去。
            取消飞入动画();
            // 拖动中滚轮：结束该次拖动手势，避免下一次 pointermove 用按下时的
            // 视野快照把刚缩放的 w/h 撤销（也不留下未消费的 click 抑制标记）。
            const drag = dragRef.current;
            if (drag) {
                dragRef.current = null;
                if (svg.hasPointerCapture(drag.pointerId)) svg.releasePointerCapture(drag.pointerId);
            }
            const rect = svg.getBoundingClientRect();
            const cur = viewRef.current;
            const scale = Math.min(rect.width / cur.w, rect.height / cur.h) || 1;
            const offsetX = (rect.width - cur.w * scale) / 2;
            const offsetY = (rect.height - cur.h * scale) / 2;
            const worldX = cur.x + (event.clientX - rect.left - offsetX) / scale;
            const worldY = cur.y + (event.clientY - rect.top - offsetY) / scale;
            const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
            const nw = clamp(cur.w * factor, minViewW, 1500);
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
    }, [取消飞入动画, minViewW]);

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        // 新手势不继承上一次手势残留的 click 抑制标记。
        suppressClickRef.current = false;
        // 普通点击不能捕获指针：否则浏览器把 click 派发给 svg 而不是区块 rect，
        // onSelect 永远不会触发。超过拖动阈值后再捕获，拖出画布也能继续平移。
        dragRef.current = {
            pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
            from: { ...viewRef.current }, moved: false, captured: false,
        };
    };
    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
            drag.moved = true;
            // 用户开始拖动即接管镜头，停掉飞入动画。
            取消飞入动画();
            if (!drag.captured) {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.captured = true;
            }
        }
        if (!drag.moved) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cur = viewRef.current;
        const scale = Math.min(rect.width / cur.w, rect.height / cur.h) || 1;
        // 宽高取当前视野而非按下时快照，避免拖动中滚轮缩放被下一次移动撤销。
        const next: 视野 = { ...cur, x: drag.from.x - dx / scale, y: drag.from.y - dy / scale };
        viewRef.current = next;
        setView(next);
    };
    const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        // 只有真正拖动过才抑制这次手势尾随的 click；普通点击照常派发到区块。
        if (drag.moved) suppressClickRef.current = true;
        dragRef.current = null;
        if (drag.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };
    const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        // pointercancel 之后不会派发 click，不能留下抑制标记吞掉下一次有效点击。
        dragRef.current = null;
        suppressClickRef.current = false;
        if (drag.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    const handleSelect = (node: 地点树节点) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        已外部选中.current = node.ID;
        onSelect(node);
        const target = byId.get(node.ID);
        if (target) 飞入(target.box, 24, true);
    };

    const 画布比例 = Math.min(容器.w / view.w, 容器.h / view.h) || 1;
    const px2world = 1 / 画布比例;
    // 名称是否显示由「框在屏幕上够不够大」决定，不再按整图视野宽度一刀切；
    // 否则全览时明明有空间的城镇也会变成空框，AI 生成的地名看不到。
    const 显示名 = view.w < 2400;
    const 显示人物名 = view.w < 1500;
    const 最小可读 = 8.5;

    const 显示室内细节 = (box: 区块) => box.w * 画布比例 > 40 && box.h * 画布比例 > 32
        && box.x < view.x + view.w && box.x + box.w > view.x
        && box.y < view.y + view.h && box.y + box.h > view.y;
    const 可见场所 = flat.filter(item => item.fog && 显示室内细节(item.box));
    const 可画人物 = (box: 区块) => Math.min(box.w, box.h) * 画布比例 >= 7;
    // 图例按「实际画出来的标记」显示：区块太小会跳过人物绘制，此时不应显示玩家/NPC 图例。
    const 可见人物 = (() => {
        let player = false;
        let npc = false;
        flat.forEach(item => {
            const markers = 人物映射.get(item.node.ID) || [];
            if (markers.length === 0) return;
            if (!可画人物(item.box)) return;
            markers.forEach(marker => { if (marker.player) player = true; else npc = true; });
        });
        return { player, npc };
    })();
    const isSpace = level === '寰宇';

    return (
        <div ref={wrapRef} className="relative h-full min-h-0 w-full overflow-hidden rounded-xl moran-map-surface"
            style={{ background: 'var(--mm-bg)', border: '1px solid var(--mm-border)' }}>
            <svg ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onDoubleClick={() => 飞入(WORLD, 0, true)}
            >
                <defs>
                    <pattern id="map-room-fog" patternUnits="userSpaceOnUse" width={8 * px2world} height={8 * px2world}>
                        <rect width={8 * px2world} height={8 * px2world} fill="var(--mm-fog)" />
                        <path d={`M0,${8 * px2world} l${8 * px2world},${-8 * px2world}`}
                            stroke="var(--mm-fog-line)" strokeWidth={px2world} />
                    </pattern>
                    <linearGradient id="map-bld-normal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--mm-bld-top)' }} />
                        <stop offset="100%" style={{ stopColor: 'var(--mm-bld-bottom)' }} />
                    </linearGradient>
                    <linearGradient id="map-bld-current" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--mm-bld-current-top)' }} />
                        <stop offset="100%" style={{ stopColor: 'var(--mm-bld-current-bottom)' }} />
                    </linearGradient>
                    <filter id="map-bld-shadow" x="-25%" y="-25%" width="150%" height="150%">
                        <feDropShadow dx="0" dy="0.3" stdDeviation="0.3" floodColor="rgba(0,0,0,0.45)" />
                    </filter>
                </defs>

                <rect x={WORLD.x} y={WORLD.y} width={WORLD.w} height={WORLD.h} rx={12}
                    style={{ fill: 'var(--mm-canvas)', stroke: 'var(--mm-canvas-stroke)' }} strokeWidth={2} pointerEvents="none" />

                {flat.map((item) => {
                    const { node, box } = item;
                    const x = box.x, y = box.y, w = box.w, h = box.h;
                    const isBuilding = node.层级 === '区地点' || node.层级 === '子地点';
                    const isPlayerHere = node.ID === currentNodeId;
                    const isSelected = node.ID === selectedNodeId;
                    const 有子节点 = item.子节点.length > 0 || Boolean(item.fog);
                    const radius = isBuilding
                        ? Math.min(5 * px2world, w * 0.1, h * 0.12)
                        : Math.min(10, Math.max(2 * px2world, Math.min(w, h) * 0.04));
                    const 框宽px = w * 画布比例;
                    const 框高px = h * 画布比例;
                    const 字px = Math.min(目标字号[node.层级] || 11, 框宽px * 0.26, 框高px * 0.42);
                    const nameSize = 字px * px2world;
                    // 旧实现副标题上限 9px、可读阈值 9.5px，导致控制势力永远不显示。
                    const 副标题字px = Math.min(10.5, 字px * 0.78, 框高px * 0.2);
                    const 显示副标题 = Boolean(node.控制势力) && 副标题字px >= 最小可读;
                    // 名称截断按「框在屏幕上能放几个字」算，避免全览时长地名糊成一团
                    const 可容字数 = Math.max(0, Math.floor(框宽px / Math.max(6, 字px * 0.98)));
                    const 叶名 = 可容字数 >= 2
                        ? (node.名称.length > 可容字数 ? `${node.名称.slice(0, 可容字数 - 1)}…` : node.名称)
                        : '';
                    const 父标签可容 = Math.max(0, Math.floor((框宽px - 14) / Math.max(6, Math.min(10.5, 框宽px * 0.18) * 0.98)));
                    const 父标签名 = 父标签可容 >= 2
                        ? (node.名称.length > 父标签可容 ? `${node.名称.slice(0, 父标签可容 - 1)}…` : node.名称)
                        : '';
                    const 屋檐缩进 = Math.min(8 * px2world, w * 0.14);
                    const 屋檐高度 = Math.min(6 * px2world, h * 0.22);

                    return (
                        <g key={node.ID}>
                            <rect data-node={node.ID} x={x} y={y} width={w} height={h} rx={radius}
                                strokeWidth={(isPlayerHere || isSelected ? 2.2 : 1.15) * px2world}
                                filter={isBuilding ? 'url(#map-bld-shadow)' : undefined}
                                style={{
                                    cursor: 'pointer',
                                    fill: isBuilding ? (isPlayerHere ? 'url(#map-bld-current)' : 'url(#map-bld-normal)') : FILL[node.层级],
                                    stroke: isPlayerHere || isSelected ? 'var(--mm-select)' : STROKE[node.层级],
                                }}
                                onClick={() => handleSelect(node)}
                            >
                                <title>{`${层级标签[node.层级]} · ${node.名称}${node.控制势力 ? `\n主导势力：${node.控制势力}` : ''}${node.描述 ? `\n${node.描述}` : ''}`}</title>
                            </rect>

                            {isBuilding && 框高px > 10 && (
                                <g pointerEvents="none">
                                    <line x1={x + 屋檐缩进} y1={y + 屋檐高度} x2={x + w - 屋檐缩进} y2={y + 屋檐高度}
                                        style={{ stroke: 'var(--mm-eave)' }} strokeWidth={0.9 * px2world} />
                                </g>
                            )}

                            {item.fog && 显示室内细节(box) && (
                                <g pointerEvents="none" aria-label="未探索房间">
                                    {item.fog.map((cell, i) => (
                                        <rect key={i} data-room-fog={node.ID} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
                                            fill="url(#map-room-fog)" stroke="var(--mm-fog-line)" strokeWidth={0.65 * px2world} />
                                    ))}
                                </g>
                            )}

                            {显示名 && !有子节点 && 字px >= 最小可读 && 叶名 && (
                                <g pointerEvents="none">
                                    <text x={x + w / 2} y={y + h / 2 - (显示副标题 ? nameSize * 0.34 : 0)}
                                        textAnchor="middle" dominantBaseline="middle"
                                        style={{
                                            fill: isPlayerHere ? 'var(--mm-label-current)' : 'var(--mm-label)',
                                            stroke: 'var(--mm-label-stroke)',
                                        }}
                                        strokeWidth={2 * px2world} paintOrder="stroke"
                                        fontSize={nameSize} fontFamily="serif" fontWeight="bold">
                                        {叶名}
                                    </text>
                                    {显示副标题 && (
                                        <text x={x + w / 2} y={y + h / 2 + nameSize * 0.98}
                                            textAnchor="middle" dominantBaseline="middle"
                                            style={{ fill: 'var(--mm-subtitle)', stroke: 'var(--mm-subtitle-stroke)' }}
                                            strokeWidth={1.5 * px2world} paintOrder="stroke"
                                            fontSize={副标题字px * px2world} fontFamily="serif">
                                            {node.控制势力}
                                        </text>
                                    )}
                                </g>
                            )}

                            {有子节点 && 框宽px > 60 && 框高px > 40 && 父标签名 && Math.min(10.5, 框宽px * 0.18) >= 最小可读 && (
                                <text x={x + 6 * px2world} y={y + 9 * px2world}
                                    textAnchor="start" dominantBaseline="middle" pointerEvents="none"
                                    style={{ fill: isPlayerHere ? 'var(--mm-parent-current)' : 'var(--mm-parent)' }}
                                    fontSize={Math.min(10.5, 框宽px * 0.18) * px2world} fontFamily="serif"
                                    fontWeight={isPlayerHere ? 'bold' : 'normal'}>
                                    {父标签名}
                                </text>
                            )}
                        </g>
                    );
                })}

                {可见场所.flatMap(venue => venue.passages?.map(([from, to]) => {
                    const a = byId.get(from.ID)!.box, b = byId.get(to.ID)!.box;
                    const start = roomDoorPoint(a, b), end = roomDoorPoint(b, a);
                    const key = JSON.stringify([from.ID, to.ID]);
                    return <g key={key} data-room-passage={key} pointerEvents="none">
                        <title>{from.名称} ↔ {to.名称}</title>
                        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                            stroke="var(--mm-passage)" strokeWidth={1.6 * px2world} strokeDasharray={`${3 * px2world} ${2 * px2world}`} />
                        {[start, end].map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={2.2 * px2world}
                            fill="var(--mm-passage)" stroke="var(--mm-halo)" strokeWidth={0.8 * px2world} />)}
                    </g>;
                }) || [])}

                {/* 人物统一最后绘制：无论父块还是子块，圆点与姓名都不会被遮挡。 */}
                {flat.map((item) => {
                    const markers = 人物映射.get(item.node.ID) || [];
                    if (markers.length === 0) return null;
                    const { x, y, w, h } = item.box;
                    const 框宽px = w * 画布比例;
                    const 框高px = h * 画布比例;
                    if (!可画人物(item.box)) return null;
                    const rpx = Math.max(1.6, Math.min(4.6, 框宽px * 0.055, 框高px * 0.085));
                    const r = rpx * px2world;
                    const 名字px = Math.min(12, 框宽px * 0.22);
                    // 单行容量按「可用宽度 / 圆点外径」算，超出就收成 +N 聚合标记，
                    // 避免密集人物把圆点甩到相邻区块上。
                    const 可用宽px = Math.max(1, 框宽px - rpx * 2 - 4);
                    const 单行容量 = Math.max(1, Math.floor(可用宽px / (rpx * 2.8)));
                    const 绘制标记: (人物点 & { aggregate?: boolean })[] = markers.length > 单行容量
                        ? [
                            ...markers.slice(0, 单行容量 - 1).map(marker => ({ ...marker })),
                            { name: `+${markers.length - 单行容量 + 1}`, player: false, aggregate: true },
                        ]
                        : markers.map(marker => ({ ...marker }));
                    const gapPx = Math.min(46, 可用宽px / Math.max(1, 绘制标记.length));
                    const 画名字 = 显示人物名 && 名字px >= 8
                        && gapPx >= (item.子节点.length > 0 ? 22 : 18)
                        && 框高px > (item.子节点.length > 0 ? 60 : 50);
                    const 房内下边距 = Math.max(h * 0.18, (rpx + (画名字 ? 名字px + 8 : 3)) * px2world);
                    const cy = item.子节点.length > 0
                        ? y + Math.min(item.track * 0.55, Math.max(r * 1.25, item.track * 0.42))
                        : y + h - 房内下边距;
                    return (
                        <g key={`people-${item.node.ID}`} data-people-node={item.node.ID} pointerEvents="none">
                            {绘制标记.map((marker, index) => {
                                const cx = x + w / 2 + (index - (绘制标记.length - 1) / 2) * gapPx * px2world;
                                const 名宽px = Math.max(1, 名字文本(marker.name).length) * 名字px * 0.95;
                                return (
                                    <g key={`${item.node.ID}-${marker.name}`}>
                                        <title>{marker.name}</title>
                                        <circle cx={cx} cy={cy} r={r + 1.1 * px2world} style={{ fill: 'var(--mm-halo)' }} />
                                        <circle cx={cx} cy={cy} r={r}
                                            style={{
                                                fill: marker.aggregate ? 'var(--mm-marker-aggregate)' : (marker.player ? 'var(--mm-marker-player)' : 'var(--mm-marker-npc)'),
                                                stroke: 'var(--mm-marker-stroke)',
                                            }}
                                            strokeWidth={1 * px2world} />
                                        {画名字 && !marker.aggregate && gapPx >= 名宽px * 1.05 && (
                                            <text x={cx} y={cy + r + (3 + 名字px / 2) * px2world}
                                                textAnchor="middle" dominantBaseline="middle"
                                                style={{
                                                    fill: marker.player ? 'var(--mm-marker-name-player)' : 'var(--mm-marker-name-npc)',
                                                    stroke: 'var(--mm-marker-name-stroke)',
                                                }}
                                                strokeWidth={2 * px2world} paintOrder="stroke"
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
                            onLocateCurrent();
                        },
                    },
                    { label: '⌂', title: '全览（双击地图同效）', action: () => 飞入(WORLD, 0, true) },
                ].map(button => (
                    <button key={button.label} onClick={button.action} title={button.title}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-wuxia-gold/30 bg-[#12161f]/90 text-sm text-wuxia-gold transition-colors hover:bg-wuxia-gold/15 [html[data-theme='day']_&]:border-amber-800/40">
                        {button.label}
                    </button>
                ))}
                <div className="text-center font-mono text-xs text-wuxia-gold/60">{(WORLD.w / view.w).toFixed(1)}x</div>
            </div>

            {/* 图例：只显示当前地图里实际出现的内容 */}
            <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-wuxia-gold/20 bg-[#12161f]/90 px-3 py-2 [html[data-theme='day']_&]:border-amber-800/30">
                <div className="mb-1 text-xs font-bold tracking-[0.18em] text-wuxia-gold/70">图例</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
                    {Array.from(new Set(flat.map(item => item.node.层级)))
                        .sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9))
                        .map(layer => (
                            <span key={layer} className="inline-flex items-center gap-1.5">
                                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: layer === '区地点' ? 'var(--mm-legend-block)' : FILL[layer] }} />
                                {层级标签[layer]}
                            </span>
                        ))}
                    {可见场所.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-3 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, var(--mm-fog), var(--mm-fog) 2px, var(--mm-fog-line) 3px)' }} />未探索房间</span>}
                    {可见场所.some(item => item.passages?.length) && <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--mm-passage)' }} />已知通路</span>}
                    {可见人物.player && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--mm-marker-player)', boxShadow: '0 0 0 1px var(--mm-marker-stroke)' }} />玩家</span>}
                    {可见人物.npc && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--mm-marker-npc)', boxShadow: '0 0 0 1px var(--mm-marker-stroke)' }} />NPC</span>}
                </div>
            </div>

            {/* 保留视图描述给读屏/调试，不影响画面 */}
            <span className="sr-only">{viewLocationName || currentLocationName}{viewPathNames?.length ? `：${viewPathNames.join(' > ')}` : ''}{viewDescription ? `，${viewDescription}` : ''}{viewNodeNpcs?.length ? `，在场 ${viewNodeNpcs.length} 人` : ''}{isSpace ? '，星空视图' : ''}</span>
        </div>
    );
};

export default RegionMap;
