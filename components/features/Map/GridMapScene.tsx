import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 世界数据结构 } from '../../../models/world';
import { 环境信息结构 } from '../../../models/environment';
import {
    构建已补齐地图空间场景,
    补齐世界地图空间字段,
    归一化地图文本,
    取地图层级显示名,
} from '../../../utils/mapSpatial';

interface Props {
    world: 世界数据结构;
    env: 环境信息结构;
    socialList?: any[];
    playerName?: string;
    debugEnabled?: boolean;
    compact?: boolean;
    onOpenPerson?: (person: any) => void;
}

type 选中对象类型 =
    | { id: string; kind: 'building'; data: any }
    | { id: string; kind: 'road'; data: any }
    | { id: string; kind: 'person'; data: any }
    | null;

const 取文本 = (value: unknown, fallback = '') => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
};

const 四角转点串 = (quad: Array<{ x: number; y: number }>) => (
    quad.map((point) => `${point.x},${point.y}`).join(' ')
);

const 点位文本 = (point: { x: number; y: number }) => `[${point.x.toFixed(1)}, ${point.y.toFixed(1)}]`;

const 路径文本 = (points: Array<{ x: number; y: number }>) => (
    points.map((point) => 点位文本(point)).join(' -> ')
);

const 计算中心 = (quad: Array<{ x: number; y: number }>) => ({
    x: quad.reduce((sum, point) => sum + point.x, 0) / quad.length,
    y: quad.reduce((sum, point) => sum + point.y, 0) / quad.length,
});

const 约束数值 = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const 扩展边界 = (
    bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
    point?: { x: number; y: number }
) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return bounds;
    if (!bounds) return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
    return {
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
    };
};

const 生成等高线 = (
    layer: any,
    buildings: any[],
    mapWidth: number,
    mapHeight: number
): Array<Array<{ x: number; y: number }>> => {
    const layerText = 归一化地图文本(`${layer?.名称 || ''}${layer?.描述 || ''}`);
    const hasTerrainHint = buildings.length === 0 || ['山', '岭', '峰', '谷', '坡', '崖', '林', '溪', '野', '郊', '荒'].some((key) => layerText.includes(key));

    const lines: Array<Array<{ x: number; y: number }>> = [];
    const lineCount = hasTerrainHint
        ? Math.max(4, Math.min(8, Math.floor(mapHeight / 4)))
        : Math.max(3, Math.min(5, Math.floor(mapHeight / 8)));
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const yBase = ((lineIndex + 1) / (lineCount + 1)) * mapHeight;
        const amplitude = 0.55 + (lineIndex % 3) * 0.22;
        const phase = (lineIndex + 1) * 0.9;
        const points: Array<{ x: number; y: number }> = [];
        const segments = 18;
        for (let step = 0; step <= segments; step += 1) {
            const x = (step / segments) * mapWidth;
            const y = yBase
                + Math.sin((x / Math.max(1, mapWidth)) * Math.PI * 2 + phase) * amplitude
                + Math.sin((x / Math.max(1, mapWidth)) * Math.PI * 4 + phase * 0.7) * 0.22;
            points.push({
                x: Math.max(0.5, Math.min(mapWidth - 0.5, x)),
                y: Math.max(0.5, Math.min(mapHeight - 0.5, y)),
            });
        }
        lines.push(points);
    }
    return lines;
};

const 生成地貌区域 = (
    layer: any,
    buildings: any[],
    mapWidth: number,
    mapHeight: number
) => {
    const layerText = 归一化地图文本(`${layer?.名称 || ''}${layer?.描述 || ''}${layer?.归属?.中地点 || ''}${layer?.归属?.小地点 || ''}`);
    const waterBias = ['溪', '河', '湖', '潭', '水', '江'].some((key) => layerText.includes(key));
    const waterPath = waterBias
        ? `M 0 ${mapHeight * 0.72} C ${mapWidth * 0.18} ${mapHeight * 0.62}, ${mapWidth * 0.32} ${mapHeight * 0.86}, ${mapWidth * 0.5} ${mapHeight * 0.72} S ${mapWidth * 0.82} ${mapHeight * 0.5}, ${mapWidth} ${mapHeight * 0.6} L ${mapWidth} ${mapHeight} L 0 ${mapHeight} Z`
        : `M 0 ${mapHeight * 0.78} C ${mapWidth * 0.18} ${mapHeight * 0.7}, ${mapWidth * 0.33} ${mapHeight * 0.92}, ${mapWidth * 0.52} ${mapHeight * 0.8} S ${mapWidth * 0.82} ${mapHeight * 0.66}, ${mapWidth} ${mapHeight * 0.74} L ${mapWidth} ${mapHeight} L 0 ${mapHeight} Z`;
    return {
        waterPath,
        hillPath: '',
        showWater: waterBias,
        showHills: false,
        showGreen: false
    };
};

const 构建层级链 = (layers: any[], selectedLayerId: string) => {
    const layerById = new Map(layers.map((layer) => [layer.ID, layer]));
    const result: any[] = [];
    const guard = new Set<string>();
    let cursor = layerById.get(selectedLayerId);
    while (cursor && !guard.has(cursor.ID)) {
        result.unshift(cursor);
        guard.add(cursor.ID);
        cursor = cursor.父级ID ? layerById.get(cursor.父级ID) : null;
    }
    return result;
};

const GridMapScene: React.FC<Props> = ({
    world,
    env,
    socialList = [],
    playerName = '',
    debugEnabled = false,
    compact = false,
    onOpenPerson,
}) => {
    const normalizedWorld = useMemo(() => 补齐世界地图空间字段(world, { env }), [world, env]);
    const defaultScene = useMemo(() => 构建已补齐地图空间场景(normalizedWorld, env, socialList, playerName), [normalizedWorld, env, socialList, playerName]);

    const layers = Array.isArray(normalizedWorld.地图层级) ? normalizedWorld.地图层级 : [];
    const buildings = Array.isArray(normalizedWorld.地图建筑) ? normalizedWorld.地图建筑 : [];
    const roads = Array.isArray(normalizedWorld.地图道路) ? normalizedWorld.地图道路 : [];
    const persistentPeople = Array.isArray(normalizedWorld.地图人物) ? normalizedWorld.地图人物 : [];
    const defaultLayerId = defaultScene.当前层级?.ID || layers[0]?.ID || '';

    const [selectedLayerId, setSelectedLayerId] = useState(defaultLayerId);
    const [selectedFeatureId, setSelectedFeatureId] = useState('');
    const [showNpcDebug, setShowNpcDebug] = useState(false);
    const [mapZoom, setMapZoom] = useState(1);
    const [mapFocusPoint, setMapFocusPoint] = useState<{ x: number; y: number } | null>(null);
    const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
    const dragStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startPan: { x: number; y: number };
        viewBox: { width: number; height: number };
        rect: { width: number; height: number };
    } | null>(null);

    useEffect(() => {
        setSelectedLayerId(defaultLayerId);
    }, [defaultLayerId]);

    useEffect(() => {
        setMapZoom(1);
        setMapPan({ x: 0, y: 0 });
        setMapFocusPoint(null);
    }, [selectedLayerId]);

    const selectedLayer = useMemo(
        () => layers.find((layer) => layer.ID === selectedLayerId) || layers[0] || null,
        [layers, selectedLayerId]
    );

    const currentLayerId = selectedLayer?.ID || '';
    const currentLayerBuildings = useMemo(
        () => buildings.filter((item) => item.所在层级ID === currentLayerId),
        [buildings, currentLayerId]
    );
    const currentLayerRoads = useMemo(
        () => roads.filter((item) => item.所在层级ID === currentLayerId),
        [roads, currentLayerId]
    );
    const shouldShowContourLines = true;
    const currentLayerPeople = useMemo(() => {
        const basePeople = persistentPeople.filter((item) => item.所在层级ID === currentLayerId);
        if (defaultScene.当前层级?.ID !== currentLayerId) {
            return basePeople;
        }
        const extraPeople = Array.isArray(defaultScene.当前层人物) ? defaultScene.当前层人物 : [];
        const normalizedPlayerName = 归一化地图文本(playerName);
        const hasPlayerPoint = basePeople.some((item) => (
            item?.是否当前玩家 === true
            || (normalizedPlayerName && 归一化地图文本(item?.名称) === normalizedPlayerName)
        ));
        const taken = new Set(basePeople.map((item) => `${item.所在层级ID}|${归一化地图文本(item.名称)}`));
        const combined = [
            ...basePeople,
            ...extraPeople.filter((item) => {
                const normalizedName = 归一化地图文本(item?.名称);
                if (hasPlayerPoint && (item?.是否当前玩家 === true || normalizedName === '主角' || (normalizedPlayerName && normalizedName === normalizedPlayerName))) {
                    return false;
                }
                const key = `${item.所在层级ID}|${normalizedName}`;
                if (taken.has(key)) return false;
                taken.add(key);
                return true;
            }),
        ];

        // B5 修复：地图 NPC 只允许显示"主角 + 社交面板已存在"的角色，避免出现社交里没有的"幽灵 NPC"。
        const socialNameSet = new Set(
            (Array.isArray(socialList) ? socialList : [])
                .map((npc: any) => 归一化地图文本(npc?.姓名 || npc?.名称))
                .filter(Boolean)
        );
        const socialIdSet = new Set(
            (Array.isArray(socialList) ? socialList : [])
                .map((npc: any) => (typeof npc?.id === 'string' ? npc.id.trim() : (typeof npc?.ID === 'string' ? npc.ID.trim() : '')))
                .filter(Boolean)
        );
        return combined.filter((person: any) => {
            // 主角/当前玩家始终保留
            if (person?.是否当前玩家 === true) return true;
            const normalizedName = 归一化地图文本(person?.名称);
            if (normalizedPlayerName && normalizedName === normalizedPlayerName) return true;
            if (normalizedName === '主角') return true;
            const linkedId = typeof person?.关联NPC === 'string'
                ? person.关联NPC.trim()
                : (typeof person?.关联NPCID === 'string'
                    ? person.关联NPCID.trim()
                    : (typeof person?.npcId === 'string' ? person.npcId.trim() : ''));
            if (linkedId && socialIdSet.has(linkedId)) return true;
            if (normalizedName && socialNameSet.has(normalizedName)) return true;
            // 其余视为幽灵 NPC，直接过滤
            return false;
        });
    }, [persistentPeople, defaultScene.当前层级?.ID, defaultScene.当前层人物, currentLayerId, playerName, socialList]);

    const layerChain = useMemo(
        () => (selectedLayer ? 构建层级链(layers, selectedLayer.ID) : []),
        [layers, selectedLayer]
    );
    const siblingLayers = useMemo(() => {
        if (!selectedLayer) return layers;
        const parentId = selectedLayer.父级ID || '';
        return layers.filter((layer) => (layer.父级ID || '') === parentId);
    }, [layers, selectedLayer]);
    const childLayers = useMemo(
        () => (selectedLayer ? layers.filter((layer) => layer.父级ID === selectedLayer.ID) : []),
        [layers, selectedLayer]
    );

    const mapWidth = Math.max(12, Number(selectedLayer?.网格宽度) || 24);
    const mapHeight = Math.max(12, Number(selectedLayer?.网格高度) || 24);
    const mapEdgePadding = Math.max(4, Math.min(8, Math.max(mapWidth, mapHeight) * 0.12));

    // 前端兜底：给没有坐标的 NPC 按稳定哈希分配一个靠近建筑入口/地图中心的位置。
    const currentLayerPeopleWithFallback = useMemo(() => {
        if (currentLayerPeople.length === 0) return currentLayerPeople;
        const stableHash = (input: string): number => {
            let h = 2166136261;
            for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
            return h >>> 0;
        };
        const anchors: Array<{ x: number; y: number }> = [];
        currentLayerBuildings.forEach((b: any) => {
            if (!Array.isArray(b?.四角坐标) || b.四角坐标.length < 4) return;
            const xs = b.四角坐标.map((p: any) => Number(p?.x) || 0);
            const ys = b.四角坐标.map((p: any) => Number(p?.y) || 0);
            anchors.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
        });
        if (anchors.length === 0) anchors.push({ x: mapWidth / 2, y: mapHeight / 2 });
        return currentLayerPeople.map((person: any) => {
            const px = Number(person?.坐标?.x);
            const py = Number(person?.坐标?.y);
            if (Number.isFinite(px) && Number.isFinite(py) && (px !== 0 || py !== 0)) return person;
            const seed = stableHash(`${currentLayerId}|${person?.ID || person?.名称 || ''}`);
            const anchor = anchors[seed % anchors.length];
            const angle = ((seed >> 4) % 360) * (Math.PI / 180);
            const radius = 1.2 + ((seed >> 8) % 100) / 60;
            return { ...person, 坐标: { x: 约束数值(anchor.x + Math.cos(angle) * radius, 1, mapWidth - 1), y: 约束数值(anchor.y + Math.sin(angle) * radius, 1, mapHeight - 1) } };
        });
    }, [currentLayerPeople, currentLayerBuildings, currentLayerId, mapWidth, mapHeight]);

    const features = useMemo(() => {
        const list: Array<{ id: string; kind: 'building' | 'road' | 'person'; data: any }> = [];
        currentLayerBuildings.forEach((item) => list.push({ id: `building:${item.ID}`, kind: 'building', data: item }));
        currentLayerRoads.forEach((item) => list.push({ id: `road:${item.ID}`, kind: 'road', data: item }));
        currentLayerPeopleWithFallback.forEach((item) => list.push({ id: `person:${item.ID}`, kind: 'person', data: item }));
        return list;
    }, [currentLayerBuildings, currentLayerRoads, currentLayerPeopleWithFallback]);

    useEffect(() => {
        if (!features.some((item) => item.id === selectedFeatureId)) {
            const preferredPerson = features.find((item) => item.kind === 'person' && item.data?.是否当前玩家);
            const preferredBuilding = features.find((item) => defaultScene.命中建筑ID列表.includes(item.data?.ID));
            setSelectedFeatureId(preferredPerson?.id || preferredBuilding?.id || features[0]?.id || '');
        }
    }, [features, selectedFeatureId, defaultScene.命中建筑ID列表]);

    const selectedFeature = useMemo<选中对象类型>(
        () => features.find((item) => item.id === selectedFeatureId) || null,
        [features, selectedFeatureId]
    );

    const 约束标签X = (x: number, width: number) => Math.max(0.25, Math.min(mapWidth - width - 0.25, x - width / 2));
    const 匹配社交人物 = (person: any) => {
        const normalizedName = 归一化地图文本(person?.名称);
        const linkedId = 取文本(person?.关联NPC || person?.关联NPCID || person?.npcId || person?.NPCID);
        return (Array.isArray(socialList) ? socialList : []).find((npc: any) => {
            const npcId = 取文本(npc?.id || npc?.ID);
            const npcName = 归一化地图文本(npc?.姓名);
            return (linkedId && npcId === linkedId) || (normalizedName && npcName === normalizedName);
        });
    };
    const 打开人物 = (person: any) => {
        setSelectedFeatureId(`person:${person.ID}`);
        if (person?.是否当前玩家 && person?.坐标) {
            setMapFocusPoint({ x: person.坐标.x, y: person.坐标.y });
            setMapPan({ x: 0, y: 0 });
            return;
        }
        const matchedNpc = 匹配社交人物(person);
        onOpenPerson?.(matchedNpc ? { ...matchedNpc, 地图人物: person } : person);
    };
    const currentPlace = 取文本(env?.具体地点, 取文本(env?.小地点, '未知地点'));
    const contourLines = useMemo(
        () => 生成等高线(selectedLayer, currentLayerBuildings, mapWidth, mapHeight),
        [selectedLayer, currentLayerBuildings, mapWidth, mapHeight]
    );
    const terrainRegions = useMemo(
        () => 生成地貌区域(selectedLayer, currentLayerBuildings, mapWidth, mapHeight),
        [selectedLayer, currentLayerBuildings, mapWidth, mapHeight]
    );
    const contentBounds = useMemo(() => {
        let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
        currentLayerBuildings.forEach((building) => {
            (Array.isArray(building?.四角坐标) ? building.四角坐标 : []).forEach((point: any) => {
                bounds = 扩展边界(bounds, point);
            });
        });
        currentLayerRoads.forEach((road) => {
            (Array.isArray(road?.路径点) ? road.路径点 : []).forEach((point: any) => {
                bounds = 扩展边界(bounds, point);
            });
        });
        currentLayerPeopleWithFallback.forEach((person) => {
            const point = person?.坐标;
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            bounds = 扩展边界(bounds, { x: point.x - mapEdgePadding, y: point.y - mapEdgePadding });
            bounds = 扩展边界(bounds, { x: point.x + mapEdgePadding, y: point.y + mapEdgePadding });
        });
        if (!bounds) return { x: -mapEdgePadding, y: -mapEdgePadding, width: mapWidth + mapEdgePadding * 2, height: mapHeight + mapEdgePadding * 2 };
        const rawWidth = Math.max(8, bounds.maxX - bounds.minX);
        const rawHeight = Math.max(8, bounds.maxY - bounds.minY);
        const padding = Math.max(rawWidth, rawHeight) * 0.18 + 4;
        const x = Math.max(-mapEdgePadding, bounds.minX - padding);
        const y = Math.max(-mapEdgePadding, bounds.minY - padding);
        const right = Math.min(mapWidth + mapEdgePadding, bounds.maxX + padding);
        const bottom = Math.min(mapHeight + mapEdgePadding, bounds.maxY + padding);
        const width = right - x;
        const height = bottom - y;
        return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
    }, [currentLayerBuildings, currentLayerRoads, currentLayerPeopleWithFallback, mapWidth, mapHeight, mapEdgePadding]);
    const mapViewBox = useMemo(() => {
        const zoom = 约束数值(mapZoom, 1, 8);
        const width = Math.max(1, contentBounds.width / zoom);
        const height = Math.max(1, contentBounds.height / zoom);
        const centerX = (mapFocusPoint?.x ?? (contentBounds.x + contentBounds.width / 2)) + mapPan.x;
        const centerY = (mapFocusPoint?.y ?? (contentBounds.y + contentBounds.height / 2)) + mapPan.y;
        const minX = -mapEdgePadding;
        const minY = -mapEdgePadding;
        const maxX = Math.max(minX, mapWidth + mapEdgePadding - width);
        const maxY = Math.max(minY, mapHeight + mapEdgePadding - height);
        const x = 约束数值(centerX - width / 2, minX, maxX);
        const y = 约束数值(centerY - height / 2, minY, maxY);
        return { x, y, width, height };
    }, [contentBounds, mapEdgePadding, mapFocusPoint, mapHeight, mapPan, mapWidth, mapZoom]);
    const handleMapWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        setMapZoom((prev) => 约束数值(Number((prev + direction * 0.35).toFixed(2)), 1, 8));
    }, []);
    const handleMapPointerDown = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return;
        if ((event.target as Element | null)?.closest?.('[data-map-feature]')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        dragStateRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startPan: mapPan,
            viewBox: { width: mapViewBox.width, height: mapViewBox.height },
            rect: { width: Math.max(1, rect.width), height: Math.max(1, rect.height) },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [mapPan, mapViewBox.height, mapViewBox.width]);
    const handleMapPointerMove = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const dx = (event.clientX - state.startClientX) / state.rect.width * state.viewBox.width;
        const dy = (event.clientY - state.startClientY) / state.rect.height * state.viewBox.height;
        setMapFocusPoint(null);
        setMapPan({
            x: state.startPan.x - dx,
            y: state.startPan.y - dy,
        });
    }, []);
    const handleMapPointerUp = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        const state = dragStateRef.current;
        if (state?.pointerId === event.pointerId) {
            dragStateRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);
    const inverseViewScale = Math.max(mapViewBox.width / 92, mapViewBox.height / 56);
    const buildingLabelFontSize = Math.max(0.96, 1.55 * inverseViewScale);
    const personLabelFontSize = Math.max(0.82, 1.05 * inverseViewScale);
    const personLabelHeight = Math.max(0.98, 1.28 * inverseViewScale);
    const personMarkerRadius = Math.max(0.26, 0.34 * inverseViewScale);
    const playerMarkerRadius = Math.max(0.34, 0.46 * inverseViewScale);
    const personOuterRadius = Math.max(0.36, 0.52 * inverseViewScale);
    const personLayouts = useMemo(() => {
        const placed: Array<{ x: number; y: number }> = [];
        const labelBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
        const intersects = (
            a: { x: number; y: number; width: number; height: number },
            b: { x: number; y: number; width: number; height: number }
        ) => (
            a.x < b.x + b.width
            && a.x + a.width > b.x
            && a.y < b.y + b.height
            && a.y + a.height > b.y
        );
        const scoreBox = (box: { x: number; y: number; width: number; height: number }) => {
            let score = 0;
            for (const placedBox of labelBoxes) {
                if (intersects(box, placedBox)) score += 1000;
            }
            for (const point of placed) {
                const closestX = 约束数值(point.x, box.x, box.x + box.width);
                const closestY = 约束数值(point.y, box.y, box.y + box.height);
                const distance = Math.hypot(point.x - closestX, point.y - closestY);
                if (distance < personOuterRadius * 1.5) score += 180;
            }
            if (box.x <= 0.25 || box.y <= 0.25 || box.x + box.width >= mapWidth - 0.25 || box.y + box.height >= mapHeight - 0.25) {
                score += 20;
            }
            return score;
        };
        const orderedPeople = [...currentLayerPeopleWithFallback].sort((a, b) => {
            const priorityA = (a?.是否当前玩家 ? 2 : 0) + (selectedFeatureId === `person:${a?.ID}` ? 1 : 0);
            const priorityB = (b?.是否当前玩家 ? 2 : 0) + (selectedFeatureId === `person:${b?.ID}` ? 1 : 0);
            return priorityB - priorityA;
        });
        return orderedPeople.map((person, index) => {
            const source = person?.坐标 || { x: 0, y: 0 };
            const minGap = personOuterRadius * 3.15;
            let x = 约束数值(Number(source.x) || 0, personOuterRadius, Math.max(personOuterRadius, mapWidth - personOuterRadius));
            let y = 约束数值(Number(source.y) || 0, personOuterRadius, Math.max(personOuterRadius, mapHeight - personOuterRadius));
            const overlaps = (candidateX: number, candidateY: number) => placed.some((point) => Math.hypot(point.x - candidateX, point.y - candidateY) < minGap);
            if (overlaps(x, y)) {
                let found = false;
                for (let ring = 1; ring <= 7 && !found; ring += 1) {
                    const radius = minGap * ring * 0.88;
                    const slots = 10 + ring * 5;
                    for (let slot = 0; slot < slots; slot += 1) {
                        const angle = (Math.PI * 2 * slot) / slots + index * 0.43;
                        const candidateX = 约束数值((Number(source.x) || 0) + Math.cos(angle) * radius, personOuterRadius, Math.max(personOuterRadius, mapWidth - personOuterRadius));
                        const candidateY = 约束数值((Number(source.y) || 0) + Math.sin(angle) * radius, personOuterRadius, Math.max(personOuterRadius, mapHeight - personOuterRadius));
                        if (!overlaps(candidateX, candidateY)) {
                            x = candidateX;
                            y = candidateY;
                            found = true;
                            break;
                        }
                    }
                }
            }
            placed.push({ x, y });
            const isImportant = person?.是否当前玩家 || selectedFeatureId === `person:${person?.ID}`;
            const labelText = person?.是否当前玩家 ? '主角' : String(person?.名称 || '').slice(0, isImportant ? 6 : 4);
            const labelWidth = Math.max(2.75 * inverseViewScale, (labelText.length * 0.86 + 0.95) * inverseViewScale);
            const offsets = [
                { dx: 0, dy: -(personOuterRadius + personLabelHeight + 0.18 * inverseViewScale) },
                { dx: 0, dy: personOuterRadius + 0.18 * inverseViewScale },
                { dx: personOuterRadius + 0.36 * inverseViewScale, dy: -personLabelHeight / 2 },
                { dx: -(personOuterRadius + labelWidth + 0.36 * inverseViewScale), dy: -personLabelHeight / 2 },
                { dx: personOuterRadius + 0.36 * inverseViewScale, dy: -(personOuterRadius + personLabelHeight * 0.75) },
                { dx: -(personOuterRadius + labelWidth + 0.36 * inverseViewScale), dy: -(personOuterRadius + personLabelHeight * 0.75) },
                { dx: personOuterRadius + 0.36 * inverseViewScale, dy: personOuterRadius * 0.52 },
                { dx: -(personOuterRadius + labelWidth + 0.36 * inverseViewScale), dy: personOuterRadius * 0.52 },
            ];
            let bestBox: { x: number; y: number; width: number; height: number } | null = null;
            let bestScore = Number.POSITIVE_INFINITY;
            offsets.forEach((offset, offsetIndex) => {
                const rawX = offset.dx === 0 ? x - labelWidth / 2 : x + offset.dx;
                const rawY = y + offset.dy;
                const box = {
                    x: 约束数值(rawX, 0.25, Math.max(0.25, mapWidth - labelWidth - 0.25)),
                    y: 约束数值(rawY, 0.25, Math.max(0.25, mapHeight - personLabelHeight - 0.25)),
                    width: labelWidth,
                    height: personLabelHeight,
                };
                const score = scoreBox(box) + offsetIndex;
                if (score < bestScore) {
                    bestScore = score;
                    bestBox = box;
                }
            });
            if (!bestBox) {
                bestBox = {
                    x: 约束标签X(x, labelWidth),
                    y: 约束数值(y - personOuterRadius - personLabelHeight - 0.18 * inverseViewScale, 0.25, Math.max(0.25, mapHeight - personLabelHeight - 0.25)),
                    width: labelWidth,
                    height: personLabelHeight,
                };
            }
            const labelVisible = isImportant || bestScore < 1000;
            if (labelVisible) {
                labelBoxes.push(bestBox);
            }
            return {
                person,
                x,
                y,
                labelText,
                labelX: bestBox.x,
                labelY: bestBox.y,
                labelWidth: bestBox.width,
                labelVisible,
                shifted: Math.hypot(x - (Number(source.x) || 0), y - (Number(source.y) || 0)) > 0.05,
                labelShifted: Math.hypot((bestBox.x + bestBox.width / 2) - x, (bestBox.y + bestBox.height / 2) - y) > personOuterRadius + personLabelHeight * 0.85,
            };
        });
    }, [currentLayerPeopleWithFallback, inverseViewScale, mapHeight, mapWidth, personLabelHeight, personOuterRadius, selectedFeatureId]);

    const npcDebugRows = useMemo(() => {
        const keys = [
            env?.具体地点,
            env?.小地点,
            env?.中地点,
            env?.大地点,
            selectedLayer?.名称,
            ...currentLayerBuildings.map((building) => building?.名称),
        ].map(归一化地图文本).filter(Boolean);
        return (Array.isArray(socialList) ? socialList : []).map((npc: any, index: number) => {
            const rawLocationText = [
                npc?.当前位置,
                npc?.所在地点,
                npc?.具体地点,
                npc?.地点,
                npc?.位置,
                npc?.归属?.大地点,
                npc?.归属?.中地点,
                npc?.归属?.小地点,
            ].map((item) => String(item || '')).filter(Boolean).join(' / ');
            const normalizedLocation = 归一化地图文本(rawLocationText);
            const hitKeys = keys.filter((key) => normalizedLocation.includes(key) || (normalizedLocation && key.includes(normalizedLocation)));
            return {
                id: npc?.id || npc?.姓名 || `map-npc-debug-${index}`,
                name: npc?.姓名 || '未命名',
                rawLocationText,
                finalVisible: npc?.是否在场 === true || hitKeys.length > 0,
            };
        });
    }, [socialList, env, selectedLayer?.名称, currentLayerBuildings]);

    const detailTitle = selectedFeature?.data?.名称 || selectedLayer?.名称 || currentPlace;
    const detailType = selectedFeature?.kind === 'building'
        ? (selectedFeature.data?.分类 === '房间' || selectedFeature.data?.分类 === '外墙' || selectedFeature.data?.分类 === '门' ? '室内结构' : '建筑面')
        : selectedFeature?.kind === 'road'
            ? '道路线'
            : selectedFeature?.kind === 'person'
                ? '人物点'
                : '层级';
    const detailBody = selectedFeature?.kind === 'building'
        ? `名称：${selectedFeature.data?.名称 || '未命名建筑'}\n分类：${selectedFeature.data?.分类 || '建筑'}\n${selectedFeature.data?.描述 || '暂无描述。'}\n四角坐标：${selectedFeature.data?.四角坐标?.map((point: any) => 点位文本(point)).join(' / ') || '无'}`
        : selectedFeature?.kind === 'road'
            ? `${selectedFeature.data?.描述 || '暂无描述。'}\n路径：${路径文本(selectedFeature.data?.路径点 || [])}`
            : selectedFeature?.kind === 'person'
                ? `${selectedFeature.data?.描述 || '暂无描述。'}\n坐标：${点位文本(selectedFeature.data?.坐标 || { x: 0, y: 0 })}`
                : `${selectedLayer?.描述 || '暂无描述。'}\n锚点：${selectedLayer ? 点位文本(selectedLayer.锚点坐标) : '无'}\n网格：${selectedLayer ? `${selectedLayer.网格宽度} x ${selectedLayer.网格高度}` : '无'}`;

    const layerSummaryText = selectedLayer
        ? `${取地图层级显示名(selectedLayer.层级)} / 锚点 ${点位文本(selectedLayer.锚点坐标)} / ${selectedLayer.网格宽度}x${selectedLayer.网格高度}`
        : '暂无层级';

    return (
        <div className={compact ? 'flex min-h-0 flex-col gap-3' : 'grid h-full min-h-0 grid-cols-[1fr_auto] gap-3'}>
            <section className="order-1 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#c7a56a]/45 bg-[#fffaf0]">
                <div className="flex items-center justify-between gap-3 border-b border-[#d8c4a2] bg-[#fffdf6] px-4 py-3">
                    <div className="min-w-0">
                        <div className="truncate font-serif text-2xl font-bold text-[#7a3f12]">{selectedLayer?.名称 || '未命中层级'}</div>
                        <div className="mt-1 truncate text-sm tracking-widest text-[#5f3a1e]">{env?.大地点 || '未知'} / {env?.中地点 || '未知'} / {env?.小地点 || '未知'} / {env?.具体地点 || '未知'}</div>
                    </div>
                    <div className="rounded-full border border-[#c7a56a]/55 bg-[#fff1d6] px-3 py-1 text-xs text-[#7a3f12]">
                        建筑 {currentLayerBuildings.length} / 道路 {currentLayerRoads.length} / 人物 {currentLayerPeopleWithFallback.length}
                    </div>
                </div>

                <div className={`relative ${compact ? 'h-[520px]' : 'aspect-square w-full'} overflow-hidden overscroll-contain`} onWheel={handleMapWheel}>
                        <div className="absolute right-3 top-3 z-10 rounded-full border border-[#c7a56a]/55 bg-[#fffaf0]/95 px-3 py-1 text-xs font-mono text-[#7a3f12]">
                            缩放 {mapZoom.toFixed(1)}x
                        </div>
                        <div className="absolute left-3 bottom-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-[#c7a56a]/55 bg-[#fffaf0]/95 px-3 py-2 shadow-[0_8px_24px_rgba(92,45,10,0.12)]">
                            <div className="mb-1 text-[10px] font-bold tracking-[0.18em] text-[#7a3f12]">图例</div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5f3a1e]">
                                <span className="inline-flex items-center gap-1.5"><i className="h-0 w-5 border-t border-dashed border-[#7e5824]/70" />等高线</span>
                                {terrainRegions.showWater && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm border border-[#1d6384]/45 bg-[#4fafd3]/45" />水体</span>}
                                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm border border-[#5c2d0a]/70 bg-[#f5e7c6]" />{selectedLayer?.层级 === '具体地点' && currentLayerRoads.length === 0 ? '房间/结构' : '建筑'}</span>
                                {currentLayerRoads.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="h-0 w-5 border-t-2 border-[#1f1b13]" />道路</span>}
                                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-[#5b4b8a] bg-[#c4b5fd]" />人物</span>
                                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-[#8a6a10] bg-[#f9d976]" />主角</span>
                            </div>
                        </div>
                        <svg
                            className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing touch-none"
                            viewBox={`${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.width} ${mapViewBox.height}`}
                            preserveAspectRatio="xMidYMid meet"
                            onPointerDown={handleMapPointerDown}
                            onPointerMove={handleMapPointerMove}
                            onPointerUp={handleMapPointerUp}
                            onPointerCancel={handleMapPointerUp}
                        >
                            {terrainRegions.showGreen && (
                                <rect
                                    x={0}
                                    y={0}
                                    width={mapWidth}
                                    height={mapHeight}
                                    fill="rgba(76, 130, 74, 0.12)"
                                    pointerEvents="none"
                                />
                            )}
                            {terrainRegions.showHills && (
                                <path
                                    d={terrainRegions.hillPath}
                                    fill="rgba(196, 157, 92, 0.24)"
                                    stroke="rgba(126, 88, 36, 0.38)"
                                    strokeWidth={0.12}
                                    pointerEvents="none"
                                />
                            )}
                            {terrainRegions.showWater && (
                                <path
                                    d={terrainRegions.waterPath}
                                    fill="rgba(79, 175, 211, 0.36)"
                                    stroke="rgba(29, 99, 132, 0.55)"
                                    strokeWidth={0.12}
                                    pointerEvents="none"
                                />
                            )}

                            {Array.from({ length: Math.floor(mapWidth) + 1 }).map((_, index) => (
                                <line
                                    key={`grid-x-${index}`}
                                    x1={index}
                                    y1={0}
                                    x2={index}
                                    y2={mapHeight}
                                    stroke={index % 4 === 0 ? 'rgba(146,64,14,0.32)' : 'rgba(126,88,36,0.18)'}
                                    strokeWidth={index % 4 === 0 ? 0.12 : 0.06}
                                    pointerEvents="none"
                                />
                            ))}
                            {Array.from({ length: Math.floor(mapHeight) + 1 }).map((_, index) => (
                                <line
                                    key={`grid-y-${index}`}
                                    x1={0}
                                    y1={index}
                                    x2={mapWidth}
                                    y2={index}
                                    stroke={index % 4 === 0 ? 'rgba(146,64,14,0.32)' : 'rgba(126,88,36,0.18)'}
                                    strokeWidth={index % 4 === 0 ? 0.12 : 0.06}
                                    pointerEvents="none"
                                />
                            ))}

                            {shouldShowContourLines && contourLines.map((points, index) => (
                                <polyline
                                    key={`contour-${index}`}
                                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                                    fill="none"
                                    stroke={index % 2 === 0 ? 'rgba(126, 88, 36, 0.34)' : 'rgba(138, 90, 43, 0.24)'}
                                    strokeWidth={0.12}
                                    strokeDasharray="0.6 0.45"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    pointerEvents="none"
                                />
                            ))}

                            {currentLayerRoads.map((road) => {
                                const active = selectedFeatureId === `road:${road.ID}`;
                                return (
                                    <g
                                        key={road.ID}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedFeatureId(`road:${road.ID}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedFeatureId(`road:${road.ID}`);
                                            }
                                        }}
                                        className="cursor-pointer"
                                        data-map-feature="road"
                                    >
                                        <polyline
                                            points={road.路径点.map((point: any) => `${point.x},${point.y}`).join(' ')}
                                            fill="none"
                                            stroke="rgba(8,8,7,0.86)"
                                            strokeWidth={active ? 1.05 : 0.86}
                                            strokeLinecap="butt"
                                            strokeLinejoin="miter"
                                            pointerEvents="none"
                                        />
                                        <polyline
                                            points={road.路径点.map((point: any) => `${point.x},${point.y}`).join(' ')}
                                            fill="none"
                                            stroke={active ? 'rgba(249, 217, 118, 0.92)' : 'rgba(214, 176, 84, 0.65)'}
                                            strokeWidth={active ? 0.38 : 0.26}
                                            strokeDasharray="0.55 0.42"
                                            strokeLinecap="butt"
                                            strokeLinejoin="miter"
                                            pointerEvents="none"
                                        />
                                    </g>
                                );
                            })}

                            {currentLayerBuildings.map((building) => {
                                const active = selectedFeatureId === `building:${building.ID}`;
                                const hit = defaultScene.命中建筑ID列表.includes(building.ID);
                                const center = 计算中心(building.四角坐标);
                                const showBuildingLabel = active || hit || !/^未命名/.test(取文本(building.名称));
                                return (
                                    <g
                                        key={building.ID}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedFeatureId(`building:${building.ID}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedFeatureId(`building:${building.ID}`);
                                            }
                                        }}
                                        className="cursor-pointer"
                                        data-map-feature="building"
                                    >
                                        <polygon
                                            points={四角转点串(building.四角坐标)}
                                            fill={active ? 'rgba(245, 196, 50, 0.42)' : hit ? 'rgba(245, 158, 11, 0.32)' : 'rgba(245, 231, 198, 0.58)'}
                                            stroke={active ? 'rgba(120, 53, 15, 1)' : hit ? 'rgba(180, 83, 9, 0.92)' : 'rgba(92, 45, 10, 0.82)'}
                                            strokeWidth={active ? 0.42 : 0.28}
                                            pointerEvents="none"
                                        />
                                        {showBuildingLabel && (
                                            <g pointerEvents="none">
                                                <text
                                                    x={center.x}
                                                    y={center.y}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="rgba(255,250,240,0.92)"
                                                    stroke="rgba(255,250,240,0.92)"
                                                    strokeWidth={0.38 * inverseViewScale}
                                                    fontSize={buildingLabelFontSize}
                                                >
                                                    {building.名称.slice(0, 6)}
                                                </text>
                                                <text
                                                    x={center.x}
                                                    y={center.y}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill={active || hit ? '#7a2e0e' : '#3f2a14'}
                                                    fontSize={buildingLabelFontSize}
                                                >
                                                    {building.名称.slice(0, 6)}
                                                </text>
                                            </g>
                                        )}
                                    </g>
                                );
                            })}

                            {personLayouts.map(({ person, x, y, labelText, labelX, labelY, labelWidth, labelVisible, shifted, labelShifted }) => {
                                const active = selectedFeatureId === `person:${person.ID}`;
                                const showLabel = labelVisible;
                                const markerRadius = person.是否当前玩家 ? playerMarkerRadius : personMarkerRadius;
                                return (
                                    <g
                                        key={person.ID}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => 打开人物(person)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                打开人物(person);
                                            }
                                        }}
                                        className="cursor-pointer"
                                        data-map-feature="person"
                                    >
                                        {shifted && (
                                            <line
                                                x1={person.坐标.x}
                                                y1={person.坐标.y}
                                                x2={x}
                                                y2={y}
                                                stroke="rgba(249,217,118,0.34)"
                                                strokeWidth={0.08 * inverseViewScale}
                                                strokeDasharray={`${0.18 * inverseViewScale} ${0.16 * inverseViewScale}`}
                                                pointerEvents="none"
                                            />
                                        )}
                                        <circle
                                            cx={x}
                                            cy={y}
                                            r={personOuterRadius}
                                            fill="rgba(5,8,14,0.72)"
                                            stroke={person.是否当前玩家 ? 'rgba(255,244,183,0.95)' : active ? 'rgba(249,217,118,0.86)' : 'rgba(255,255,255,0.28)'}
                                            strokeWidth={0.1 * inverseViewScale}
                                            pointerEvents="none"
                                        />
                                        <circle
                                            cx={x}
                                            cy={y}
                                            r={markerRadius}
                                            fill={person.是否当前玩家 ? 'rgba(249, 217, 118, 0.96)' : active ? 'rgba(147, 197, 253, 0.95)' : 'rgba(196, 181, 253, 0.85)'}
                                            stroke={person.是否当前玩家 ? 'rgba(255, 244, 183, 1)' : 'rgba(10,10,10,0.7)'}
                                            strokeWidth={0.16 * inverseViewScale}
                                            pointerEvents="auto"
                                        />
                                        {showLabel && (
                                            <>
                                                {labelShifted && (
                                                    <line
                                                        x1={x}
                                                        y1={y}
                                                        x2={labelX + labelWidth / 2}
                                                        y2={labelY + personLabelHeight / 2}
                                                        stroke="rgba(15,23,42,0.32)"
                                                        strokeWidth={0.05 * inverseViewScale}
                                                        pointerEvents="none"
                                                    />
                                                )}
                                                <rect
                                                    x={labelX}
                                                    y={labelY}
                                                    width={labelWidth}
                                                    height={personLabelHeight}
                                                    data-map-person-label={person.ID}
                                                    rx={Math.max(0.12, 0.24 * inverseViewScale)}
                                                    fill={person.是否当前玩家 ? 'rgba(63, 49, 12, 0.92)' : 'rgba(5, 8, 14, 0.92)'}
                                                    stroke={active ? 'rgba(249, 217, 118, 0.86)' : 'rgba(255,255,255,0.28)'}
                                                    strokeWidth={0.08 * inverseViewScale}
                                                    pointerEvents="none"
                                                />
                                                <text
                                                    x={labelX + labelWidth / 2}
                                                    y={labelY + personLabelHeight / 2}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill={person.是否当前玩家 ? '#fde68a' : 'rgba(229,231,235,0.92)'}
                                                    fontSize={personLabelFontSize}
                                                    pointerEvents="none"
                                                >
                                                    {labelText}
                                                </text>
                                            </>
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </section>

            <aside className={`${compact ? 'order-2 max-h-[520px] w-full' : 'order-2 w-[380px]'} min-h-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar`}>
                <div className="rounded-2xl border border-[#c7a56a]/45 bg-[#fffaf0] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2 text-sm font-bold tracking-widest text-[#7a3f12]">
                        <span>地图层级</span>
                        <span className="rounded border border-[#d8c4a2] bg-[#fffdf6] px-2 py-0.5 font-mono text-[#5f3a1e]">{layers.length}</span>
                    </div>

                    <div className="mb-3 rounded-xl border border-[#d8c4a2] bg-[#fffdf6] p-3">
                        <div className="text-xs font-bold tracking-[0.24em] text-[#8a5a2f]">当前路径</div>
                        <div className="mt-2 text-sm leading-6 text-[#4f2d16]">
                            {layerChain.length > 0 ? layerChain.map((layer, index) => (
                                <span key={layer.ID}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedLayerId(layer.ID)}
                                        className={`rounded px-1.5 py-0.5 transition-colors ${layer.ID === currentLayerId ? 'bg-[#fff1d6] text-[#b45309] font-bold' : 'hover:bg-[#fff1d6] hover:text-[#b45309]'}`}
                                    >
                                        {layer.名称}
                                    </button>
                                    {index < layerChain.length - 1 ? <span className="mx-1 text-[#a87945]">/</span> : null}
                                </span>
                            )) : '未命中层级'}
                        </div>
                        <div className="mt-2 text-xs text-[#6f4a26]">{layerSummaryText}</div>
                    </div>

                    <div className="space-y-2">
                        {siblingLayers.map((layer) => {
                            const active = layer.ID === currentLayerId;
                            return (
                                <button
                                    key={layer.ID}
                                    type="button"
                                    onClick={() => setSelectedLayerId(layer.ID)}
                                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                                        active
                                            ? 'border-[#b45309] bg-[#fff1d6] text-[#7a3f12] shadow-[0_0_16px_rgba(180,83,9,0.12)]'
                                            : 'border-[#d8c4a2] bg-[#fffdf6] text-[#4f2d16] hover:border-[#b45309]/55'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-serif text-sm font-bold">{layer.名称}</span>
                                        <span className="text-xs text-[#6f4a26]">{取地图层级显示名(layer.层级)}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-[#6f4a26]">
                                        建筑 {layer.建筑物ID列表.length} / 道路 {layer.道路ID列表.length} / 人物 {layer.人物ID列表.length}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {childLayers.length > 0 && (
                        <div className="mt-3 rounded-xl border border-[#d8c4a2] bg-[#fffdf6] p-3">
                            <div className="mb-2 text-xs font-bold tracking-[0.24em] text-[#8a5a2f]">下一级</div>
                            <div className="flex flex-wrap gap-2">
                                {childLayers.map((layer) => (
                                    <button
                                        key={layer.ID}
                                        type="button"
                                        onClick={() => setSelectedLayerId(layer.ID)}
                                        className="rounded-full border border-[#d8c4a2] bg-[#fffaf0] px-3 py-1.5 text-[11px] text-[#4f2d16] hover:border-[#b45309]/55 hover:text-[#b45309]"
                                    >
                                        {layer.名称}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-[#c7a56a]/45 bg-[#fffaf0] p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                            <div className="truncate font-serif text-lg font-bold text-[#7a3f12]">{detailTitle}</div>
                            <div className="mt-1 text-xs tracking-widest text-[#6f4a26]">{detailType}</div>
                        </div>
                        {selectedFeature?.kind === 'person' && selectedFeature.data?.是否当前玩家 && (
                            <span className="rounded-full border border-[#c7a56a]/55 bg-[#fff1d6] px-2 py-1 text-xs text-[#7a3f12] whitespace-nowrap">当前位置</span>
                        )}
                    </div>
                    <p className="whitespace-pre-line text-sm leading-6 text-[#4f2d16]">{detailBody}</p>
                    {selectedFeature?.kind === 'person' && !selectedFeature.data?.是否当前玩家 && onOpenPerson && (
                        <button
                            type="button"
                            onClick={() => {
                                const matchedNpc = 匹配社交人物(selectedFeature.data);
                                onOpenPerson(matchedNpc ? { ...matchedNpc, 地图人物: selectedFeature.data } : selectedFeature.data);
                            }}
                            className="mt-3 w-full rounded-lg border border-[#b45309]/45 bg-[#fff1d6] px-3 py-2 text-xs font-bold text-[#7a3f12] hover:bg-[#b45309] hover:text-white transition-colors"
                        >
                            查看角色
                        </button>
                    )}
                </div>

                <div className="rounded-2xl border border-[#c7a56a]/45 bg-[#fffaf0] p-4">
                    <div className="mb-2 text-xs font-bold tracking-widest text-[#8a5a2f]">当前层概况</div>
                    <div className="space-y-2 text-sm text-[#4f2d16]">
                        <div>当前命中地点：{currentPlace}</div>
                        <div>层级链：{layerChain.length > 0 ? layerChain.map((layer) => layer.名称).join(' / ') : '未知'}</div>
                        <div>建筑面：{currentLayerBuildings.length} 个</div>
                        <div>道路线：{currentLayerRoads.length} 条</div>
                        <div>人物点：{currentLayerPeopleWithFallback.length} 个</div>
                    </div>

                    {debugEnabled && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowNpcDebug((prev) => !prev)}
                                className="mt-4 w-full rounded-lg border border-sky-600/35 bg-sky-50 px-3 py-2 text-xs text-sky-800"
                            >
                                {showNpcDebug ? '收起 NPC 调试' : '展开 NPC 调试'}
                            </button>
                            {showNpcDebug && (
                                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-sky-600/20 bg-sky-50 p-3 custom-scrollbar">
                                    {npcDebugRows.length > 0 ? npcDebugRows.map((row) => (
                                        <div key={row.id} className="rounded-lg border border-[#d8c4a2] bg-[#fffdf6] px-3 py-2 text-[11px] text-[#4f2d16]">
                                            <span className="text-[#3f2a14]">{row.name}</span>
                                            <span className="mx-2 text-[#a87945]">/</span>
                                            <span className={row.finalVisible ? 'text-emerald-700' : 'text-[#6f4a26]'}>{row.finalVisible ? '会显示' : '未命中'}</span>
                                            <span className="ml-2 text-[#6f4a26]">{row.rawLocationText || '无位置字段'}</span>
                                        </div>
                                    )) : <div className="py-3 text-center text-xs text-[#6f4a26]">暂无 NPC 数据</div>}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
};

export default GridMapScene;
