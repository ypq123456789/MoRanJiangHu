import type {
    世界数据结构,
    环境信息结构,
    地点归属结构,
    地图坐标点结构,
    地图四角坐标结构,
    地图层级类型,
    地图层级结构,
    地图建筑结构,
    地图道路结构,
    地图人物结构,
} from '../types';
import { 优化地图布局 } from './mapLayoutOptimizer';
import { 验证并修复地图数据 } from './mapValidator';

type 地图层尺寸结构 = { width: number; height: number };

type 地图空间补齐参数 = {
    env?: Partial<环境信息结构> | null;
};

export type 地图空间场景结构 = {
    层级列表: 地图层级结构[];
    当前层级: 地图层级结构 | null;
    当前层级链: 地图层级结构[];
    同级层级列表: 地图层级结构[];
    子层级列表: 地图层级结构[];
    当前层建筑物: 地图建筑结构[];
    当前层道路: 地图道路结构[];
    当前层人物: 地图人物结构[];
    当前玩家: 地图人物结构 | null;
    命中建筑ID列表: string[];
};

const 默认层级尺寸: Record<地图层级类型, 地图层尺寸结构> = {
    大地点: { width: 48, height: 48 },
    中地点: { width: 36, height: 36 },
    小地点: { width: 28, height: 28 },
    具体地点: { width: 24, height: 24 },
};

const 取文本 = (value: unknown, fallback = ''): string => {
    if (typeof value !== 'string') return fallback;
    const next = value.trim();
    return next || fallback;
};

const 取数字 = (value: unknown, fallback = 0): number => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const 取字符串数组 = (value: unknown): string[] => (
    Array.isArray(value)
        ? value
            .map((item) => 取文本(item))
            .filter(Boolean)
        : []
);

const 从候选读取文本 = (source: any, keys: string[], fallback = ''): string => {
    if (!source || typeof source !== 'object') return fallback;
    for (const key of keys) {
        const text = 取文本(source?.[key]);
        if (text) return text;
    }
    return fallback;
};

const 从候选读取数值 = (source: any, keys: string[], fallback = 0): number => {
    if (!source || typeof source !== 'object') return fallback;
    for (const key of keys) {
        const value = source?.[key];
        if (value === undefined || value === null || value === '') continue;
        const parsed = 取数字(value, Number.NaN);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
};

const 从候选读取字符串数组 = (source: any, keys: string[]): string[] => {
    if (!source || typeof source !== 'object') return [];
    for (const key of keys) {
        const list = 取字符串数组(source?.[key]);
        if (list.length > 0) return list;
    }
    return [];
};

const 从候选读取坐标 = (source: any, keys: string[]): 地图坐标点结构 | null => {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        const point = 解析坐标点(source?.[key]);
        if (point) return point;
    }
    const x = 从候选读取数值(source, ['x', 'X', '横坐标', '坐标X'], Number.NaN);
    const y = 从候选读取数值(source, ['y', 'Y', '纵坐标', '坐标Y'], Number.NaN);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const 读取地图层级类型 = (item: any): 地图层级类型 => {
    const raw = 从候选读取文本(item, ['层级', '等级', '级别', '类型', '地图层级']);
    if ((['大地点', '中地点', '小地点', '具体地点'] as const).includes(raw as 地图层级类型)) return raw as 地图层级类型;
    if (/国家|天下|州郡|郡国|区域|国域/u.test(raw)) return '大地点';
    if (/城市|城镇|城池|宗门|门派|坊市|县城|府城/u.test(raw)) return '中地点';
    if (/街区|院落|山谷|村庄|建筑群|小地点|街坊|片区/u.test(raw)) return '小地点';
    if (/室内|房间|寝居|卧房|内室|具体地点|建筑物内部/u.test(raw)) return '具体地点';
    return '小地点';
};

const 从层级推断归属 = (item: any, layerType: 地图层级类型, name: string): 地点归属结构 => {
    const base = 规范化地点归属(item?.归属);
    const big = 取文本(base.大地点 || item?.大地点 || item?.国家 || item?.州郡 || item?.上级大地点);
    const mid = 取文本(base.中地点 || item?.中地点 || item?.城市 || item?.城镇 || item?.宗门 || item?.上级中地点);
    const small = 取文本(base.小地点 || item?.小地点 || item?.街区 || item?.院落 || item?.建筑 || item?.上级小地点);
    if (layerType === '大地点') return { 大地点: big || name, 中地点: '', 小地点: '' };
    if (layerType === '中地点') return { 大地点: big, 中地点: mid || name, 小地点: '' };
    if (layerType === '小地点') return { 大地点: big, 中地点: mid, 小地点: small || name };
    return { 大地点: big, 中地点: mid, 小地点: small };
};

export const 归一化地图文本 = (value: unknown): string => (
    String(value || '').trim().replace(/\s+/g, '').toLowerCase()
);

/**
 * 客户希望的四个固定地图层级：国家 / 城市 / 街区 / 建筑物内部。
 * 为了不破坏老存档的字段值，数据层仍然使用 大地点/中地点/小地点/具体地点，
 * UI 层通过这个映射显示成固定的四级名。
 */
export const 地图层级显示名映射: Record<地图层级类型, string> = {
    大地点: '国家',
    中地点: '城市',
    小地点: '街区',
    具体地点: '建筑物内部',
};
export const 取地图层级显示名 = (type?: 地图层级类型 | null): string => (
    type ? 地图层级显示名映射[type] || type : ''
);

const 稳定散列 = (text: string): number => {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash;
};

export const 生成地图对象ID = (prefix: string, ...parts: Array<unknown>): string => {
    const normalizedParts = parts
        .map((part) => 归一化地图文本(part))
        .filter(Boolean);
    if (normalizedParts.length === 0) {
        return `${prefix}-0`;
    }
    return `${prefix}-${稳定散列(normalizedParts.join('|')).toString(16)}`;
};

const 限制数值 = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const 创建矩形四角 = (x: number, y: number, width: number, height: number): 地图四角坐标结构 => ([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
]);

export const 计算四角中心 = (quad: 地图四角坐标结构): 地图坐标点结构 => ({
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
});

const 解析坐标点 = (raw: unknown): 地图坐标点结构 | null => {
    if (Array.isArray(raw) && raw.length >= 2) {
        const x = Number(raw[0]);
        const y = Number(raw[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    if (raw && typeof raw === 'object') {
        const source = raw as Record<string, unknown>;
        const x = Number(source.x ?? source.X ?? source.横坐标 ?? source.横 ?? source.left ?? source.leftX);
        const y = Number(source.y ?? source.Y ?? source.纵坐标 ?? source.纵 ?? source.top ?? source.topY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    const text = 取文本(raw);
    const match = text.match(/(-?\d+(?:\.\d+)?)\D+(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const 解析路径点数组 = (raw: unknown): 地图坐标点结构[] => {
    if (Array.isArray(raw)) {
        const points = raw
            .map((item) => 解析坐标点(item))
            .filter(Boolean) as 地图坐标点结构[];
        if (points.length > 0) return points;
    }
    if (typeof raw === 'string') {
        const matches = raw.match(/-?\d+(?:\.\d+)?/g) || [];
        const points: 地图坐标点结构[] = [];
        for (let index = 0; index + 1 < matches.length; index += 2) {
            const x = Number(matches[index]);
            const y = Number(matches[index + 1]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                points.push({ x, y });
            }
        }
        return points;
    }
    return [];
};

const 规范化坐标点 = (raw: unknown, fallback: 地图坐标点结构): 地图坐标点结构 => {
    const point = 解析坐标点(raw);
    return point || fallback;
};

const 规范化四角 = (
    raw: unknown,
    width: number,
    height: number,
    fallbackOrigin: 地图坐标点结构 = { x: 0, y: 0 }
): 地图四角坐标结构 => {
    if (Array.isArray(raw)) {
        const points = raw
            .map((item) => 解析坐标点(item))
            .filter(Boolean) as 地图坐标点结构[];
        if (points.length >= 4) {
            return [
                points[0],
                points[1],
                points[2],
                points[3],
            ];
        }
    }
    if (raw && typeof raw === 'object') {
        const source = raw as Record<string, unknown>;
        const candidates = [
            source.左上,
            source.右上,
            source.右下,
            source.左下,
        ].map((item) => 解析坐标点(item));
        if (candidates.every(Boolean)) {
            return candidates as 地图四角坐标结构;
        }
    }
    return 创建矩形四角(fallbackOrigin.x, fallbackOrigin.y, width, height);
};

const 规范化地点归属 = (raw?: unknown): 地点归属结构 => {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
        大地点: 取文本(source?.大地点),
        中地点: 取文本(source?.中地点),
        小地点: 取文本(source?.小地点),
    };
};

const 从环境构建归属 = (env?: Partial<环境信息结构> | null): 地点归属结构 => ({
    大地点: 取文本(env?.大地点),
    中地点: 取文本(env?.中地点),
    小地点: 取文本(env?.小地点),
});

const 层级名称命中 = (left: unknown, right: unknown): boolean => {
    const a = 归一化地图文本(left);
    const b = 归一化地图文本(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
};

const 构建层级唯一键 = (
    层级: 地图层级类型,
    归属: 地点归属结构,
    名称: string
): string => [
    层级,
    归一化地图文本(归属.大地点),
    归一化地图文本(归属.中地点),
    归一化地图文本(归属.小地点),
    归一化地图文本(名称),
].join('|');

const 获取层级尺寸 = (层级: 地图层级类型): 地图层尺寸结构 => 默认层级尺寸[层级];

const 计算散点坐标 = (
    name: string,
    width: number,
    height: number,
    index = 0
): 地图坐标点结构 => {
    const hash = 稳定散列(name || String(index));
    return {
        x: 限制数值(3 + (hash % Math.max(6, width - 5)), 2, Math.max(2, width - 2)),
        y: 限制数值(3 + ((hash >> 7) % Math.max(6, height - 5)), 2, Math.max(2, height - 2)),
    };
};

const 计算偏移坐标 = (
    base: 地图坐标点结构,
    layer: 地图层级结构,
    key: string,
    index: number,
    radius = 1.4
): 地图坐标点结构 => {
    const hash = 稳定散列(`${key}-${index}`);
    const angle = ((hash % 360) / 180) * Math.PI;
    const distance = radius * (0.55 + ((hash >> 8) % 45) / 100);
    return {
        x: 限制数值(base.x + Math.cos(angle) * distance, 1, Math.max(1, layer.网格宽度 - 1)),
        y: 限制数值(base.y + Math.sin(angle) * distance, 1, Math.max(1, layer.网格高度 - 1)),
    };
};

const 文本包含任一 = (text: unknown, keywords: string[]): boolean => {
    const normalized = 归一化地图文本(text);
    return Boolean(normalized) && keywords.some((keyword) => normalized.includes(归一化地图文本(keyword)));
};

const 是否室内居所位置 = (text: unknown): boolean => 文本包含任一(text, [
    '寝居',
    '卧房',
    '厢房',
    '房间',
    '屋内',
    '屋中',
    '屋舍',
    '居室',
    '住处',
    '内室',
    '柴房',
    '客房',
    '静室',
    '阁',
    '堂',
    '院',
    '庄',
    // 明确带"内"字的室内场景（如"荒庙内部"、"宗祠内部"、"大殿内部"）
    '内部',
    // 独立的"室"字（书室/暖室 等），配合 "具体地点" 层级才生效
    '室',
]);

const 是否室内层级 = (layer?: 地图层级结构 | null): boolean => {
    if (!layer) return false;
    // 只有"具体地点"层才会被视为室内；用户反馈：最后一级应该是建筑内部，由墙/门/房间组成，不应再有道路。
    // 为避免破坏旧存档里某些"具体地点"被当作子地点的用法，这里保持"名字命中才判为室内"。
    // 关键词扩充（庙/寺/观/祠/殿/塔/室/府/馆/内部）以覆盖"荒庙内部"等用户用例。
    if (layer.层级 !== '具体地点') return false;
    return 是否室内居所位置(`${layer.名称}${layer.描述}${layer.归属?.小地点 || ''}`);
};

const 是否野外位置 = (text: unknown): boolean => (
    !是否室内居所位置(text)
    && 文本包含任一(text, [
        '野外',
        '山',
        '岭',
        '峰',
        '谷',
        '坡',
        '崖',
        '林',
        '竹林',
        '密林',
        '树林',
        '溪',
        '河岸',
        '湖畔',
        '荒',
        '郊',
        '官道',
        '小径',
        '山道',
        '道旁',
        '村外',
        '城外',
    ])
);

const 是否近身位置 = (text: unknown): boolean => 文本包含任一(text, [
    '身边',
    '旁边',
    '附近',
    '眼前',
    '面前',
    '同席',
    '同桌',
    '同行',
    '跟随',
    '并肩',
    '在场',
]);

const 是否聚落层级 = (layer: 地图层级结构): boolean => {
    if (是否室内层级(layer)) return false;
    const text = `${layer.名称}${layer.描述}${layer.归属.中地点}${layer.归属.小地点}`;
    if (是否野外位置(text)) return false;
    if (文本包含任一(text, ['镇', '城', '坊', '市', '街', '巷', '村', '庄', '院', '宅', '府', '馆', '楼', '铺', '坊市', '客栈'])) return true;
    return layer.层级 === '小地点' || layer.层级 === '具体地点';
};

// 野外层级判定：用于让路网生成走"单主路贯穿"分支，而不是聚落横纵网格
const 是否野外层级 = (layer?: 地图层级结构 | null): boolean => {
    if (!layer) return false;
    if (是否室内层级(layer)) return false;
    const text = `${layer.名称}${layer.描述}${layer.归属?.中地点 || ''}${layer.归属?.小地点 || ''}`;
    return 是否野外位置(text);
};

// 顶层大区判定：用于让地图渲染为"多城市 + 城际道路 + 宏观地貌"
const 是否大区层级 = (layer?: 地图层级结构 | null): boolean => {
    if (!layer) return false;
    // 大地点层级 + 无父级，视为顶层大区
    return layer.层级 === '大地点' && !layer.父级ID;
};

const 生成序号文本 = (index: number): string => String(index + 1).padStart(2, '0');

const 获取聚落目标建筑数量 = (layer: 地图层级结构, currentCount: number, peopleHint = 0): number => {
    if (!是否聚落层级(layer)) return currentCount;
    const byPeople = Math.min(4, Math.ceil(Math.max(0, peopleHint) * 0.6));
    return Math.max(currentCount, byPeople);
};

const 计算野外坐标 = (
    key: string,
    layer: 地图层级结构,
    index: number
): 地图坐标点结构 => {
    const hash = 稳定散列(`${layer.ID}-${key}-${index}-wild`);
    const margin = 2.2;
    const usableWidth = Math.max(4, layer.网格宽度 - margin * 2);
    const usableHeight = Math.max(4, layer.网格高度 - margin * 2);
    const ridge = 0.5 + Math.sin((hash % 628) / 100) * 0.22;
    const x = margin + ((hash % 1000) / 999) * usableWidth;
    const yWave = Math.sin((x / Math.max(1, layer.网格宽度)) * Math.PI * 2 + ((hash >> 9) % 60) / 10);
    const y = margin + (ridge + yWave * 0.16) * usableHeight;
    return {
        x: 限制数值(x, margin, layer.网格宽度 - margin),
        y: 限制数值(y, margin, layer.网格高度 - margin),
    };
};

const 计算建筑入口坐标 = (
    building: 地图建筑结构,
    layer: 地图层级结构
): 地图坐标点结构 => {
    const center = 计算四角中心(building.四角坐标);
    const xs = building.四角坐标.map((point) => point.x);
    const ys = building.四角坐标.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const layerCenter = { x: layer.网格宽度 / 2, y: layer.网格高度 / 2 };
    const dx = center.x - layerCenter.x;
    const dy = center.y - layerCenter.y;
    if (Math.abs(dx) > Math.abs(dy)) {
        return {
            x: 限制数值(dx >= 0 ? minX - 0.7 : maxX + 0.7, 0.7, layer.网格宽度 - 0.7),
            y: 限制数值(center.y, 0.7, layer.网格高度 - 0.7),
        };
    }
    return {
        x: 限制数值(center.x, 0.7, layer.网格宽度 - 0.7),
        y: 限制数值(dy >= 0 ? minY - 0.7 : maxY + 0.7, 0.7, layer.网格高度 - 0.7),
    };
};

const 计算建筑边界 = (building: 地图建筑结构) => {
    const xs = building.四角坐标.map((point) => point.x);
    const ys = building.四角坐标.map((point) => point.y);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
};

const 从边界创建建筑四角 = (
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    layer: 地图层级结构
): 地图四角坐标结构 => {
    const width = Math.max(2.4, bounds.maxX - bounds.minX);
    const height = Math.max(2.2, bounds.maxY - bounds.minY);
    return 创建矩形四角(
        限制数值(bounds.minX, 0.6, Math.max(0.6, layer.网格宽度 - width - 0.6)),
        限制数值(bounds.minY, 0.6, Math.max(0.6, layer.网格高度 - height - 0.6)),
        Math.min(width, Math.max(2.4, layer.网格宽度 - 1.2)),
        Math.min(height, Math.max(2.2, layer.网格高度 - 1.2))
    );
};

const 建筑边界重叠 = (
    left: { minX: number; maxX: number; minY: number; maxY: number },
    right: { minX: number; maxX: number; minY: number; maxY: number },
    gap = 0.45
): boolean => (
    left.minX < right.maxX + gap
    && left.maxX + gap > right.minX
    && left.minY < right.maxY + gap
    && left.maxY + gap > right.minY
);

const 线段边界相交 = (
    from: 地图坐标点结构,
    to: 地图坐标点结构,
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean => {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    return minX <= bounds.maxX
        && maxX >= bounds.minX
        && minY <= bounds.maxY
        && maxY >= bounds.minY;
};

const 路径触及边界 = (
    points: 地图坐标点结构[],
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean => (
    points.some((point) => (
        point.x >= bounds.minX
        && point.x <= bounds.maxX
        && point.y >= bounds.minY
        && point.y <= bounds.maxY
    ))
    || points.some((point, index) => {
        const next = points[index + 1];
        return next ? 线段边界相交(point, next, bounds) : false;
    })
);

const 避让层级建筑重叠 = (
    layer: 地图层级结构,
    layerBuildings: 地图建筑结构[]
) => {
    const sortedBuildings = [...layerBuildings].sort((left, right) => {
        const leftCenter = 计算四角中心(left.四角坐标);
        const rightCenter = 计算四角中心(right.四角坐标);
        return leftCenter.y === rightCenter.y
            ? leftCenter.x - rightCenter.x
            : leftCenter.y - rightCenter.y;
    });

    const placedBounds: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
    sortedBuildings.forEach((building, index) => {
        let bounds = 计算建筑边界(building);
        const width = Math.max(2.4, bounds.maxX - bounds.minX);
        const height = Math.max(2.2, bounds.maxY - bounds.minY);
        let attempts = 0;
        while (placedBounds.some((placed) => 建筑边界重叠(bounds, placed)) && attempts < 36) {
            const columnCount = Math.max(1, Math.floor((layer.网格宽度 - 1.2) / (width + 0.8)));
            const column = (index + attempts) % columnCount;
            const row = Math.floor((index + attempts) / columnCount);
            const x = 0.8 + column * (width + 0.8);
            const y = 0.8 + row * (height + 0.8);
            bounds = {
                minX: 限制数值(x, 0.6, Math.max(0.6, layer.网格宽度 - width - 0.6)),
                maxX: 限制数值(x, 0.6, Math.max(0.6, layer.网格宽度 - width - 0.6)) + width,
                minY: 限制数值(y, 0.6, Math.max(0.6, layer.网格高度 - height - 0.6)),
                maxY: 限制数值(y, 0.6, Math.max(0.6, layer.网格高度 - height - 0.6)) + height,
            };
            attempts += 1;
        }
        building.四角坐标 = 从边界创建建筑四角(bounds, layer);
        placedBounds.push(计算建筑边界(building));
    });
};

const 推出建筑内部点 = (
    point: 地图坐标点结构,
    layer: 地图层级结构,
    layerBuildings: 地图建筑结构[],
    gap = 0.55
): 地图坐标点结构 => {
    let next = { ...point };
    layerBuildings.forEach((building) => {
        const bounds = 计算建筑边界(building);
        const inside = next.x > bounds.minX - gap
            && next.x < bounds.maxX + gap
            && next.y > bounds.minY - gap
            && next.y < bounds.maxY + gap;
        if (!inside) return;

        const distances = [
            { side: 'left', value: Math.abs(next.x - bounds.minX) },
            { side: 'right', value: Math.abs(bounds.maxX - next.x) },
            { side: 'top', value: Math.abs(next.y - bounds.minY) },
            { side: 'bottom', value: Math.abs(bounds.maxY - next.y) },
        ].sort((left, right) => left.value - right.value);
        const nearest = distances[0]?.side;
        if (nearest === 'left') next.x = bounds.minX - gap;
        if (nearest === 'right') next.x = bounds.maxX + gap;
        if (nearest === 'top') next.y = bounds.minY - gap;
        if (nearest === 'bottom') next.y = bounds.maxY + gap;
        next = {
            x: 限制数值(next.x, 0.7, layer.网格宽度 - 0.7),
            y: 限制数值(next.y, 0.7, layer.网格高度 - 0.7),
        };
    });
    return next;
};

const 点位键 = (point: { x: number; y: number }) => `${point.x},${point.y}`;

const 简化正交路径 = (points: 地图坐标点结构[]): 地图坐标点结构[] => {
    const deduped = points.filter((point, index) => {
        const prev = points[index - 1];
        return !prev || prev.x !== point.x || prev.y !== point.y;
    });
    if (deduped.length <= 2) return deduped;
    return deduped.filter((point, index) => {
        if (index === 0 || index === deduped.length - 1) return true;
        const prev = deduped[index - 1];
        const next = deduped[index + 1];
        const sameX = prev.x === point.x && point.x === next.x;
        const sameY = prev.y === point.y && point.y === next.y;
        return !sameX && !sameY;
    });
};

const 规划避让建筑正交路径 = (
    rawPoints: 地图坐标点结构[],
    layer: 地图层级结构,
    layerBuildings: 地图建筑结构[]
): 地图坐标点结构[] => {
    const sourcePoints = (Array.isArray(rawPoints) ? rawPoints : [])
        .map((point) => 推出建筑内部点(point, layer, layerBuildings, 0.85))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (sourcePoints.length < 2) return sourcePoints;

    const maxX = Math.max(1, Math.ceil(layer.网格宽度));
    const maxY = Math.max(1, Math.ceil(layer.网格高度));
    const obstacles = layerBuildings.map((building) => {
        const bounds = 计算建筑边界(building);
        return {
            minX: Math.floor(bounds.minX - 0.9),
            maxX: Math.ceil(bounds.maxX + 0.9),
            minY: Math.floor(bounds.minY - 0.9),
            maxY: Math.ceil(bounds.maxY + 0.9),
        };
    });
    const blocked = (x: number, y: number) => obstacles.some((bounds) => (
        x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
    ));
    const clampCell = (point: 地图坐标点结构) => ({
        x: Math.max(0, Math.min(maxX, Math.round(point.x))),
        y: Math.max(0, Math.min(maxY, Math.round(point.y))),
    });
    const nearestFreeCell = (point: 地图坐标点结构) => {
        const start = clampCell(point);
        if (!blocked(start.x, start.y)) return start;
        for (let radius = 1; radius <= Math.max(maxX, maxY); radius += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                for (let dy = -radius; dy <= radius; dy += 1) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const x = Math.max(0, Math.min(maxX, start.x + dx));
                    const y = Math.max(0, Math.min(maxY, start.y + dy));
                    if (!blocked(x, y)) return { x, y };
                }
            }
        }
        return start;
    };
    const routeSegment = (from: 地图坐标点结构, to: 地图坐标点结构): 地图坐标点结构[] => {
        const start = nearestFreeCell(from);
        const end = nearestFreeCell(to);
        const queue = [start];
        const cameFrom = new Map<string, string>();
        const visited = new Set([点位键(start)]);
        const dirs = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
        ].sort((left, right) => {
            const leftScore = Math.abs(end.x - (start.x + left.x)) + Math.abs(end.y - (start.y + left.y));
            const rightScore = Math.abs(end.x - (start.x + right.x)) + Math.abs(end.y - (start.y + right.y));
            return leftScore - rightScore;
        });
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current.x === end.x && current.y === end.y) break;
            dirs.forEach((dir) => {
                const next = { x: current.x + dir.x, y: current.y + dir.y };
                if (next.x < 0 || next.x > maxX || next.y < 0 || next.y > maxY) return;
                if (blocked(next.x, next.y)) return;
                const key = 点位键(next);
                if (visited.has(key)) return;
                visited.add(key);
                cameFrom.set(key, 点位键(current));
                queue.push(next);
            });
        }
        const endKey = 点位键(end);
        if (!visited.has(endKey)) {
            const mid = blocked(start.x, end.y) ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
            return 简化正交路径([start, nearestFreeCell(mid), end]);
        }
        const path: 地图坐标点结构[] = [end];
        let cursor = endKey;
        while (cursor !== 点位键(start)) {
            const prev = cameFrom.get(cursor);
            if (!prev) break;
            const [x, y] = prev.split(',').map(Number);
            path.push({ x, y });
            cursor = prev;
        }
        return 简化正交路径(path.reverse());
    };

    const routed: 地图坐标点结构[] = [];
    for (let index = 0; index < sourcePoints.length - 1; index += 1) {
        const segment = routeSegment(sourcePoints[index], sourcePoints[index + 1]);
        routed.push(...(index === 0 ? segment : segment.slice(1)));
    }
    return 简化正交路径(routed).map((point) => ({
        x: 限制数值(point.x, 0, maxX),
        y: 限制数值(point.y, 0, maxY),
    }));
};

const 计算最近路径点 = (
    point: 地图坐标点结构,
    roads: 地图道路结构[]
): 地图坐标点结构 | null => {
    let bestPoint: 地图坐标点结构 | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    roads.forEach((road) => {
        road.路径点.forEach((candidate) => {
            const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPoint = candidate;
            }
        });
    });
    return bestPoint;
};

const 计算矩形布局 = (
    layer: 地图层级结构,
    index: number,
    total: number
): 地图四角坐标结构 => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(total, 1))));
    const rows = Math.max(1, Math.ceil(total / columns));
    const padding = 2;
    const cellWidth = Math.max(4, (layer.网格宽度 - padding * 2) / columns);
    const cellHeight = Math.max(4, (layer.网格高度 - padding * 2) / rows);
    const rectWidth = Math.max(4.2, Math.min(8.2, cellWidth * 0.82));
    const rectHeight = Math.max(3.4, Math.min(6.8, cellHeight * 0.76));
    const column = index % columns;
    const row = Math.floor(index / columns);
    const originX = padding + column * cellWidth + (cellWidth - rectWidth) / 2;
    const originY = padding + row * cellHeight + (cellHeight - rectHeight) / 2;
    return 创建矩形四角(
        限制数值(originX, 1, Math.max(1, layer.网格宽度 - rectWidth - 1)),
        限制数值(originY, 1, Math.max(1, layer.网格高度 - rectHeight - 1)),
        rectWidth,
        rectHeight
    );
};

const 计算父层子层入口布局 = (
    parent: 地图层级结构,
    child: 地图层级结构,
    siblings: 地图层级结构[],
    index: number
): 地图四角坐标结构 => {
    const marginX = Math.max(2.2, parent.网格宽度 * 0.1);
    const marginY = Math.max(2.0, parent.网格高度 * 0.1);
    const usableWidth = Math.max(4, parent.网格宽度 - marginX * 2);
    const usableHeight = Math.max(4, parent.网格高度 - marginY * 2);
    const anchors = siblings.map((item) => ({
        x: Number(item.锚点坐标?.x),
        y: Number(item.锚点坐标?.y),
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const minX = anchors.length > 0 ? Math.min(...anchors.map((point) => point.x)) : 0;
    const maxX = anchors.length > 0 ? Math.max(...anchors.map((point) => point.x)) : 0;
    const minY = anchors.length > 0 ? Math.min(...anchors.map((point) => point.y)) : 0;
    const maxY = anchors.length > 0 ? Math.max(...anchors.map((point) => point.y)) : 0;
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, siblings.length))));
    const rows = Math.max(1, Math.ceil(Math.max(1, siblings.length) / columns));
    const gridX = ((index % columns) + 0.5) / columns;
    const gridY = (Math.floor(index / columns) + 0.5) / rows;
    const childAnchor = {
        x: Number(child.锚点坐标?.x),
        y: Number(child.锚点坐标?.y),
    };
    const normalizedX = rangeX > 0.01 && Number.isFinite(childAnchor.x)
        ? (childAnchor.x - minX) / rangeX
        : gridX;
    const normalizedY = rangeY > 0.01 && Number.isFinite(childAnchor.y)
        ? (childAnchor.y - minY) / rangeY
        : gridY;
    const centerX = marginX + 限制数值(normalizedX, 0.08, 0.92) * usableWidth;
    const centerY = marginY + 限制数值(normalizedY, 0.08, 0.92) * usableHeight;
    const width = child.层级 === '中地点'
        ? Math.min(7.2, Math.max(4.8, parent.网格宽度 * 0.12))
        : child.层级 === '小地点'
            ? Math.min(6.2, Math.max(4.1, parent.网格宽度 * 0.11))
            : Math.min(5.2, Math.max(3.4, parent.网格宽度 * 0.095));
    const height = child.层级 === '中地点'
        ? Math.min(5.2, Math.max(3.5, parent.网格高度 * 0.09))
        : child.层级 === '小地点'
            ? Math.min(4.6, Math.max(3.0, parent.网格高度 * 0.085))
            : Math.min(3.9, Math.max(2.4, parent.网格高度 * 0.075));
    return 创建矩形四角(
        限制数值(centerX - width / 2, 0.8, Math.max(0.8, parent.网格宽度 - width - 0.8)),
        限制数值(centerY - height / 2, 0.8, Math.max(0.8, parent.网格高度 - height - 0.8)),
        width,
        height
    );
};

const 计算室内结构布局 = (
    layer: 地图层级结构,
    index: number,
    total: number,
    category?: string
): 地图四角坐标结构 => {
    const type = 取文本(category);
    if (type === '外墙') {
        return 创建矩形四角(0.8, 0.8, Math.max(3, layer.网格宽度 - 1.6), Math.max(3, layer.网格高度 - 1.6));
    }
    if (type === '门') {
        const doorWidth = Math.min(3.2, Math.max(2.2, layer.网格宽度 * 0.14));
        return 创建矩形四角((layer.网格宽度 - doorWidth) / 2, layer.网格高度 - 1.75, doorWidth, 0.7);
    }
    const roomIndex = Math.max(0, index - 1);
    const roomTotal = Math.max(1, total - 2);
    const columns = roomTotal <= 2 ? roomTotal : 2;
    const rows = Math.max(1, Math.ceil(roomTotal / columns));
    const paddingX = 3.0;
    const paddingY = 3.0;
    const usableWidth = Math.max(8, layer.网格宽度 - paddingX * 2);
    const usableHeight = Math.max(8, layer.网格高度 - paddingY * 2.4);
    const cellWidth = usableWidth / Math.max(1, columns);
    const cellHeight = usableHeight / rows;
    const width = Math.max(4.6, cellWidth * 0.82);
    const height = Math.max(3.6, cellHeight * 0.72);
    const column = roomIndex % Math.max(1, columns);
    const row = Math.floor(roomIndex / Math.max(1, columns));
    const x = paddingX + column * cellWidth + (cellWidth - width) / 2;
    const y = paddingY + row * cellHeight + (cellHeight - height) / 2;
    return 创建矩形四角(
        限制数值(x, 1.4, Math.max(1.4, layer.网格宽度 - width - 1.4)),
        限制数值(y, 1.4, Math.max(1.4, layer.网格高度 - height - 1.4)),
        Math.min(width, layer.网格宽度 - 2.8),
        Math.min(height, layer.网格高度 - 2.8)
    );
};

const 构建室内结构名称列表 = (layer: 地图层级结构): Array<{ name: string; category: string; desc: string }> => {
    const layerName = 取文本(layer.名称, '室内');
    const isLargeResidence = 文本包含任一(layerName, ['院', '庄', '府', '馆', '楼', '阁', '堂']);
    const rooms = isLargeResidence
        ? ['正厅', '内室', '侧厢', '屏风间']
        : ['起居间', '寝榻区', '屏风间'];
    return [
        { name: `${layerName}外墙`, category: '外墙', desc: `${layerName} 的外墙轮廓，用来标示室内边界。` },
        ...rooms.map((room) => ({
            name: `${layerName}${room}`,
            category: '房间',
            desc: `${layerName} 内的${room}。`,
        })),
        { name: `${layerName}门`, category: '门', desc: `${layerName} 的出入口。` },
    ];
};

const 计算道路附近落点 = (
    point: 地图坐标点结构,
    layer: 地图层级结构,
    key: string,
    index: number
): 地图坐标点结构 => {
    const hash = 稳定散列(`${layer.ID}-${key}-${index}-street`);
    const along = ((hash % 100) - 50) / 100;
    const side = ((hash >> 7) % 2 === 0 ? -1 : 1) * (0.55 + ((hash >> 11) % 28) / 100);
    return {
        x: 限制数值(point.x + along, 0.7, layer.网格宽度 - 0.7),
        y: 限制数值(point.y + side, 0.7, layer.网格高度 - 0.7),
    };
};

const 计算人物避让落点 = (
    point: 地图坐标点结构,
    layer: 地图层级结构,
    key: string,
    index: number,
    placed: 地图坐标点结构[],
    minDistance = 1.25
): 地图坐标点结构 => {
    let next = { ...point };
    let attempts = 0;
    while (placed.some((other) => Math.hypot(other.x - next.x, other.y - next.y) < minDistance) && attempts < 16) {
        const hash = 稳定散列(`${layer.ID}-${key}-${index}-${attempts}-person-spread`);
        const angle = ((hash % 360) / 180) * Math.PI;
        const radius = minDistance * (0.8 + attempts * 0.18);
        next = {
            x: 限制数值(point.x + Math.cos(angle) * radius, 0.7, layer.网格宽度 - 0.7),
            y: 限制数值(point.y + Math.sin(angle) * radius, 0.7, layer.网格高度 - 0.7),
        };
        attempts += 1;
    }
    placed.push(next);
    return next;
};

const 是否卷轴路线 = (road?: Pick<地图道路结构, '名称'> | null): boolean => (
    /卷轴路线|卷轴连线|图内连线|邻近路径/u.test(road?.名称 || '')
);

const 重排离散建筑布局 = (
    layer: 地图层级结构,
    layerBuildings: 地图建筑结构[]
) => {
    if (layerBuildings.length <= 1) return;
    if (是否聚落层级(layer)) {
        const center = { x: layer.网格宽度 * 0.5, y: layer.网格高度 * 0.52 };
        const radiusX = Math.min(layer.网格宽度 * 0.34, Math.max(layer.网格宽度 * 0.24, 8));
        const radiusY = Math.min(layer.网格高度 * 0.24, Math.max(layer.网格高度 * 0.16, 5));
        const total = layerBuildings.length;
        layerBuildings.forEach((building, index) => {
            const hash = 稳定散列(`${layer.ID}-${building.ID}-${index}-urban`);
            const angle = (-120 + (360 / Math.max(1, total)) * index) * Math.PI / 180;
            const point = {
                x: center.x + Math.cos(angle) * radiusX,
                y: center.y + Math.sin(angle) * radiusY,
            };
            const width = Math.min(4.8, Math.max(3.1, layer.网格宽度 * (0.088 + (hash % 8) / 500)));
            const height = Math.min(3.8, Math.max(2.5, layer.网格高度 * (0.078 + ((hash >> 3) % 8) / 520)));
            const x = point.x - width / 2;
            const y = point.y - height / 2;
            building.四角坐标 = 创建矩形四角(
                限制数值(x, 0.8, Math.max(0.8, layer.网格宽度 - width - 0.8)),
                限制数值(y, 0.8, Math.max(0.8, layer.网格高度 - height - 0.8)),
                width,
                height
            );
        });
        return;
    }
    const centers = layerBuildings.map((building) => 计算四角中心(building.四角坐标));
    const minX = Math.min(...centers.map((point) => point.x));
    const maxX = Math.max(...centers.map((point) => point.x));
    const minY = Math.min(...centers.map((point) => point.y));
    const maxY = Math.max(...centers.map((point) => point.y));
    const spreadX = maxX - minX;
    const spreadY = maxY - minY;
    const outOfReadableBounds = centers.some((point) => (
        point.x < 1.5 || point.x > layer.网格宽度 - 1.5 || point.y < 1.5 || point.y > layer.网格高度 - 1.5
    ));
    const tooScattered = spreadX > layer.网格宽度 * 0.58 || spreadY > layer.网格高度 * 0.58;
    if (!outOfReadableBounds && !tooScattered) return;

    const total = layerBuildings.length;
    const columns = Math.max(2, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / columns));
    const clusterWidth = Math.min(layer.网格宽度 * 0.58, Math.max(10, columns * 4.6));
    const clusterHeight = Math.min(layer.网格高度 * 0.46, Math.max(7, rows * 3.8));
    const originX = (layer.网格宽度 - clusterWidth) / 2;
    const originY = Math.max(1.2, (layer.网格高度 - clusterHeight) / 2);
    const cellWidth = clusterWidth / columns;
    const cellHeight = clusterHeight / rows;

    layerBuildings.forEach((building, index) => {
        const bounds = 计算建筑边界(building);
        const rawWidth = Math.max(2.8, bounds.maxX - bounds.minX);
        const rawHeight = Math.max(2.4, bounds.maxY - bounds.minY);
        const width = Math.min(7.2, Math.max(rawWidth, cellWidth * 0.78, 4.0));
        const height = Math.min(6.2, Math.max(rawHeight, cellHeight * 0.72, 3.2));
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = originX + column * cellWidth + (cellWidth - width) / 2;
        const y = originY + row * cellHeight + (cellHeight - height) / 2;
        building.四角坐标 = 创建矩形四角(
            限制数值(x, 0.8, Math.max(0.8, layer.网格宽度 - width - 0.8)),
            限制数值(y, 0.8, Math.max(0.8, layer.网格高度 - height - 0.8)),
            width,
            height
        );
    });
};

const 规范化地图层级列表 = (world: any): 地图层级结构[] => (
    Array.isArray(world?.地图层级)
        ? world.地图层级
            .map((item: any, index: number) => {
                const name = 从候选读取文本(item, ['名称', '名字', '地点名称', 'name'], `未命名层级${index + 1}`);
                const layerType = 读取地图层级类型(item);
                const ownership = 从层级推断归属(item, layerType, name);
                const size = 获取层级尺寸(layerType);
                const range = item?.范围 && typeof item.范围 === 'object' ? item.范围 : {};
                const width = Math.max(8, 从候选读取数值(item, ['网格宽度', '宽度', 'width', '宽'], 从候选读取数值(range, ['宽', '宽度', 'width'], size.width)));
                const height = Math.max(8, 从候选读取数值(item, ['网格高度', '高度', 'height', '高'], 从候选读取数值(range, ['高', '高度', 'height'], size.height)));
                return {
                    ID: 从候选读取文本(item, ['ID', 'id', 'Id', '层级ID'], 生成地图对象ID('layer', layerType, ownership.大地点, ownership.中地点, ownership.小地点, name, index)),
                    名称: name,
                    层级: layerType,
                    描述: 从候选读取文本(item, ['描述', '说明', '简介', 'description']),
                    归属: ownership,
                    父级ID: 从候选读取文本(item, ['父级ID', '父ID', '父层ID', 'parentId', 'parentID']),
                    锚点坐标: 从候选读取坐标(item, ['锚点坐标', '中心坐标', '坐标', '父层坐标', '位置']) || { x: index * 12, y: index * 9 },
                    网格宽度: width,
                    网格高度: height,
                    边界四角坐标: 规范化四角(item?.边界四角坐标 ?? item?.四角坐标 ?? item?.范围四角, width, height),
                    建筑物ID列表: 从候选读取字符串数组(item, ['建筑物ID列表', '建筑列表', '主要建筑', '建筑物', '建筑']),
                    道路ID列表: 从候选读取字符串数组(item, ['道路ID列表', '道路列表', '主要道路', '道路']),
                    人物ID列表: 从候选读取字符串数组(item, ['人物ID列表', '人物列表', '人物']),
                };
            })
            .filter((item) => item.名称 || item.描述)
        : []
);

const 规范化地图建筑列表 = (world: any): 地图建筑结构[] => (
    Array.isArray(world?.地图建筑)
        ? world.地图建筑
            .map((item: any, index: number) => ({
                ID: 取文本(item?.ID, 生成地图对象ID('building', item?.名称, item?.所在层级ID, index)),
                名称: 取文本(item?.名称, `未命名建筑${index + 1}`),
                描述: 取文本(item?.描述),
                归属: 规范化地点归属(item?.归属),
                所在层级ID: 取文本(item?.所在层级ID ?? item?.层级ID),
                分类: 取文本(item?.分类, '建筑'),
                四角坐标: 规范化四角(item?.四角坐标 ?? item?.边界四角坐标, 5, 4),
            }))
            .filter((item) => item.名称)
        : []
);

const 规范化地图道路列表 = (world: any): 地图道路结构[] => (
    Array.isArray(world?.地图道路)
        ? world.地图道路
            .map((item: any, index: number) => ({
                ID: 取文本(item?.ID, 生成地图对象ID('road', item?.名称, item?.所在层级ID, index)),
                名称: 取文本(item?.名称, `未命名道路${index + 1}`),
                描述: 取文本(item?.描述),
                归属: 规范化地点归属(item?.归属),
                所在层级ID: 取文本(item?.所在层级ID ?? item?.层级ID),
                路径点: 解析路径点数组(item?.路径点 ?? item?.坐标点列表 ?? item?.路径)
                    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
            }))
            .filter((item) => item.名称 && item.路径点.length >= 2)
        : []
);

const 规范化地图人物列表 = (world: any): 地图人物结构[] => (
    Array.isArray(world?.地图人物)
        ? world.地图人物
            .map((item: any, index: number) => ({
                ID: 取文本(item?.ID, 生成地图对象ID('person', item?.名称, item?.所在层级ID, index)),
                名称: 取文本(item?.名称, `未命名人物${index + 1}`),
                描述: 取文本(item?.描述),
                归属: 规范化地点归属(item?.归属),
                所在层级ID: 取文本(item?.所在层级ID ?? item?.层级ID),
                坐标: 规范化坐标点(item?.坐标 ?? item?.位置坐标, { x: 12, y: 12 }),
                关联NPC: 取文本(item?.关联NPC ?? item?.关联人物 ?? item?.名称),
                是否当前玩家: item?.是否当前玩家 === true,
            }))
            .filter((item) => item.名称)
        : []
);

const 匹配层级名称 = (layer: 地图层级结构, env?: Partial<环境信息结构> | null): boolean => {
    if (!env) return false;
    if (layer.层级 === '具体地点') return 层级名称命中(layer.名称, env.具体地点);
    if (layer.层级 === '小地点') return 层级名称命中(layer.名称, env.小地点);
    if (layer.层级 === '中地点') return 层级名称命中(layer.名称, env.中地点);
    return 层级名称命中(layer.名称, env.大地点);
};

const 查找最佳名称层级 = (
    layers: 地图层级结构[],
    layerType: 地图层级类型,
    targetName: unknown
): 地图层级结构 | null => {
    const target = 归一化地图文本(targetName);
    if (!target) return null;
    const candidates = layers.filter((layer) => layer.层级 === layerType && 层级名称命中(layer.名称, targetName));
    if (candidates.length === 0) return null;
    return candidates
        .map((layer) => {
            const current = 归一化地图文本(layer.名称);
            const exact = current === target ? 2 : 0;
            const contains = current !== target && (target.includes(current) || current.includes(target)) ? 1 : 0;
            return {
                layer,
                score: exact * 1000 + contains * 100 + current.length,
            };
        })
        .sort((left, right) => right.score - left.score)[0]?.layer || null;
};

const 匹配层级与归属 = (layer: 地图层级结构, ownership: 地点归属结构, name: string): boolean => {
    const sameName = 层级名称命中(layer.名称, name);
    if (!sameName) return false;
    const sameBig = !ownership.大地点 || !layer.归属.大地点 || 层级名称命中(layer.归属.大地点, ownership.大地点);
    const sameMid = !ownership.中地点 || !layer.归属.中地点 || 层级名称命中(layer.归属.中地点, ownership.中地点);
    const sameSmall = !ownership.小地点 || !layer.归属.小地点 || 层级名称命中(layer.归属.小地点, ownership.小地点);
    return sameBig && sameMid && sameSmall;
};

const 追加唯一值 = (list: string[], value: string) => {
    if (!value) return;
    if (!list.includes(value)) {
        list.push(value);
    }
};

const 生成层级说明 = (layerType: 地图层级类型, name: string): string => {
    switch (layerType) {
        case '大地点':
            return `${name} 的上层区域网格。`;
        case '中地点':
            return `${name} 的区域骨架与交通边界。`;
        case '小地点':
            return `${name} 的可探索地点网格。`;
        case '具体地点':
        default:
            return `${name} 的局部平面与行走落点。`;
    }
};

const 从旧版字段派生地图空间 = (
    seedLayers: 地图层级结构[],
    seedBuildings: 地图建筑结构[],
    world: any,
    options?: 地图空间补齐参数
) => {
    const layers = [...seedLayers];
    const layerById = new Map<string, 地图层级结构>();
    const layerKeyToId = new Map<string, string>();

    layers.forEach((layer) => {
        layerById.set(layer.ID, layer);
        layerKeyToId.set(构建层级唯一键(layer.层级, layer.归属, layer.名称), layer.ID);
    });

    const ensureLayer = (params: {
        层级: 地图层级类型;
        名称: string;
        归属: 地点归属结构;
        父级ID?: string;
        描述?: string;
        锚点坐标?: 地图坐标点结构 | null;
    }): string => {
        const name = 取文本(params.名称);
        if (!name) return '';
        const key = 构建层级唯一键(params.层级, params.归属, name);
        const existingId = layerKeyToId.get(key);
        if (existingId) {
            const existing = layerById.get(existingId);
            if (existing) {
                if (!existing.描述 && params.描述) existing.描述 = params.描述;
                if (!existing.父级ID && params.父级ID) existing.父级ID = params.父级ID;
                if ((existing.锚点坐标.x === 0 && existing.锚点坐标.y === 0) && params.锚点坐标) {
                    existing.锚点坐标 = params.锚点坐标;
                }
            }
            return existingId;
        }
        const size = 获取层级尺寸(params.层级);
        const id = 生成地图对象ID('layer', params.层级, params.归属.大地点, params.归属.中地点, params.归属.小地点, name);
        const layer: 地图层级结构 = {
            ID: id,
            名称: name,
            层级: params.层级,
            描述: 取文本(params.描述, 生成层级说明(params.层级, name)),
            归属: { ...params.归属 },
            父级ID: 取文本(params.父级ID),
            锚点坐标: params.锚点坐标 || { x: layers.length * 12, y: layers.length * 9 },
            网格宽度: size.width,
            网格高度: size.height,
            边界四角坐标: 创建矩形四角(0, 0, size.width, size.height),
            建筑物ID列表: [],
            道路ID列表: [],
            人物ID列表: [],
        };
        layers.push(layer);
        layerById.set(id, layer);
        layerKeyToId.set(key, id);
        return id;
    };

    const 旧版建筑列表 = Array.isArray(world?.建筑) ? world.建筑 : [];
    const 旧版地图列表 = Array.isArray(world?.地图) ? world.地图 : [];
    const 内部建筑映射 = new Map<string, string[]>();

    旧版地图列表.forEach((mapItem: any, index: number) => {
        const ownership = 规范化地点归属(mapItem?.归属);
        const mapName = 取文本(mapItem?.名称, `区域${index + 1}`);
        const anchor = 解析坐标点(mapItem?.坐标) || { x: index * 14, y: index * 11 };

        const bigId = ownership.大地点
            ? ensureLayer({
                层级: '大地点',
                名称: ownership.大地点,
                归属: {
                    大地点: ownership.大地点,
                    中地点: '',
                    小地点: '',
                },
                描述: `${ownership.大地点} 的上位地理层。`,
                锚点坐标: { x: Math.round(anchor.x / 4), y: Math.round(anchor.y / 4) },
            })
            : '';
        const midId = ownership.中地点
            ? ensureLayer({
                层级: '中地点',
                名称: ownership.中地点,
                归属: {
                    大地点: ownership.大地点,
                    中地点: ownership.中地点,
                    小地点: '',
                },
                父级ID: bigId || undefined,
                描述: `${ownership.中地点} 的交通与地貌层。`,
                锚点坐标: { x: Math.round(anchor.x / 2), y: Math.round(anchor.y / 2) },
            })
            : '';

        const smallName = ownership.小地点 || mapName;
        const smallId = ensureLayer({
            层级: '小地点',
            名称: smallName,
            归属: {
                大地点: ownership.大地点,
                中地点: ownership.中地点,
                小地点: smallName,
            },
            父级ID: midId || bigId || undefined,
            描述: 取文本(mapItem?.描述),
            锚点坐标: anchor,
        });

        const targetLayerId = mapName && !层级名称命中(mapName, smallName)
            ? ensureLayer({
                层级: '具体地点',
                名称: mapName,
                归属: {
                    大地点: ownership.大地点,
                    中地点: ownership.中地点,
                    小地点: smallName,
                },
                父级ID: smallId,
                描述: 取文本(mapItem?.描述),
                锚点坐标: anchor,
            })
            : smallId;

        const interiors = 取字符串数组(mapItem?.内部建筑);
        if (interiors.length > 0 && targetLayerId) {
            内部建筑映射.set(targetLayerId, Array.from(new Set([...(内部建筑映射.get(targetLayerId) || []), ...interiors])));
        }
    });

    const envOwnership = 从环境构建归属(options?.env);
    const envBigId = envOwnership.大地点
        ? ensureLayer({
            层级: '大地点',
            名称: envOwnership.大地点,
            归属: {
                大地点: envOwnership.大地点,
                中地点: '',
                小地点: '',
            },
            描述: `${envOwnership.大地点} 的上位地理层。`,
            锚点坐标: { x: 0, y: 0 },
        })
        : '';
    const envMidId = envOwnership.中地点
        ? ensureLayer({
            层级: '中地点',
            名称: envOwnership.中地点,
            归属: {
                大地点: envOwnership.大地点,
                中地点: envOwnership.中地点,
                小地点: '',
            },
            父级ID: envBigId || undefined,
            描述: `${envOwnership.中地点} 的交通与聚落层。`,
            锚点坐标: { x: 8, y: 8 },
        })
        : '';
    const envSmallId = 取文本(options?.env?.小地点)
        ? ensureLayer({
            层级: '小地点',
            名称: 取文本(options?.env?.小地点),
            归属: {
                大地点: envOwnership.大地点,
                中地点: envOwnership.中地点,
                小地点: 取文本(options?.env?.小地点),
            },
            父级ID: envMidId || envBigId || undefined,
            描述: `${取文本(options?.env?.小地点)} 的可探索平面层。`,
            锚点坐标: { x: 12, y: 12 },
        })
        : '';

    if (取文本(options?.env?.具体地点)) {
        ensureLayer({
            层级: '具体地点',
            名称: 取文本(options?.env?.具体地点),
            归属: {
                大地点: envOwnership.大地点,
                中地点: envOwnership.中地点,
                小地点: 取文本(options?.env?.小地点),
            },
            父级ID: envSmallId || envMidId || envBigId || undefined,
            描述: `${取文本(options?.env?.具体地点)} 的局部网格层。`,
            锚点坐标: { x: 12, y: 12 },
        });
    }

    const buildings = [...seedBuildings];
    const buildingLookup = new Map<string, string>();
    buildings.forEach((building) => {
        buildingLookup.set(`${building.所在层级ID}|${归一化地图文本(building.名称)}`, building.ID);
    });

    const 通过归属查找层级ID = (
        layerType: 地图层级类型,
        ownership: 地点归属结构,
        name: string
    ): string => {
        const matched = layers.find((layer) => layer.层级 === layerType && 匹配层级与归属(layer, ownership, name));
        return matched?.ID || '';
    };

    const selectTargetLayerForBuilding = (building: any): string => {
        const ownership = 规范化地点归属(building?.归属);
        const buildingName = 取文本(building?.名称);
        const exactSpecific = layers.find((layer) => layer.层级 === '具体地点' && 匹配层级与归属(layer, ownership, buildingName));
        if (exactSpecific) return exactSpecific.ID;
        const exactSmall = layers.find((layer) => layer.层级 === '小地点' && 匹配层级与归属(layer, ownership, ownership.小地点 || buildingName));
        if (exactSmall) return exactSmall.ID;
        const exactMid = layers.find((layer) => layer.层级 === '中地点' && 匹配层级与归属(layer, ownership, ownership.中地点 || buildingName));
        if (exactMid) return exactMid.ID;
        const exactBig = layers.find((layer) => layer.层级 === '大地点' && 匹配层级与归属(layer, ownership, ownership.大地点 || buildingName));
        return exactBig?.ID || '';
    };

    const buildingLayers = new Map<string, 地图建筑结构[]>();
    buildings.forEach((building) => {
        if (!building.所在层级ID) return;
        const bucket = buildingLayers.get(building.所在层级ID) || [];
        bucket.push(building);
        buildingLayers.set(building.所在层级ID, bucket);
    });

    const ensureBuilding = (params: {
        layerId: string;
        name: string;
        desc?: string;
        ownership: 地点归属结构;
        category?: string;
        quad?: 地图四角坐标结构;
    }) => {
        const key = `${params.layerId}|${归一化地图文本(params.name)}`;
        if (!params.layerId || !params.name || buildingLookup.has(key)) return;
        const layer = layerById.get(params.layerId);
        if (!layer) return;
        const layerBuildings = buildingLayers.get(params.layerId) || [];
        const nextIndex = layerBuildings.length;
        const nextTotal = Math.max(nextIndex + 1, 1);
        const building: 地图建筑结构 = {
            ID: 生成地图对象ID('building', params.layerId, params.name),
            名称: params.name,
            描述: 取文本(params.desc, 是否室内层级(layer) ? `${params.name} 的室内结构轮廓。` : `${params.name} 的建筑轮廓。`),
            归属: { ...params.ownership },
            所在层级ID: params.layerId,
            分类: 取文本(params.category, 是否室内层级(layer) ? '房间' : '建筑'),
            四角坐标: params.quad || (是否室内层级(layer)
                ? 计算室内结构布局(layer, nextIndex, nextTotal, params.category)
                : 计算矩形布局(layer, nextIndex, nextTotal)),
        };
        layerBuildings.push(building);
        buildingLayers.set(params.layerId, layerBuildings);
        buildings.push(building);
        buildingLookup.set(key, building.ID);
    };

    layers.forEach((layer) => {
        const source = (Array.isArray(world?.地图层级) ? world.地图层级 : []).find((item: any) => (
            层级名称命中(从候选读取文本(item, ['ID', 'id', 'Id', '层级ID']), layer.ID)
            || 层级名称命中(从候选读取文本(item, ['名称', '名字', '地点名称', 'name']), layer.名称)
        ));
        if (!source) return;
        const rawBuildings = 从候选读取字符串数组(source, ['主要建筑', '建筑列表', '建筑物', '建筑']);
        rawBuildings.forEach((name, index) => {
            const isSpecificName = layer.层级 === '小地点' || 是否室内居所位置(name);
            const childOwnership = {
                大地点: layer.归属.大地点,
                中地点: layer.归属.中地点,
                小地点: layer.层级 === '小地点' ? layer.归属.小地点 : '',
            };
            const childId = isSpecificName
                ? 通过归属查找层级ID('具体地点', childOwnership, name)
                : layer.层级 === '大地点'
                    ? 通过归属查找层级ID('中地点', { 大地点: layer.归属.大地点, 中地点: name, 小地点: '' }, name)
                    : layer.层级 === '中地点'
                        ? 通过归属查找层级ID('小地点', { 大地点: layer.归属.大地点, 中地点: layer.归属.中地点 || layer.名称, 小地点: name }, name)
                        : '';
            if (childId) return;
            ensureBuilding({
                layerId: layer.ID,
                name,
                desc: `${name} 属于 ${layer.名称} 的平面要素。`,
                ownership: childOwnership,
                category: layer.层级 === '大地点'
                    ? '城市/区域'
                    : layer.层级 === '中地点'
                        ? '小地点入口'
                        : isSpecificName
                            ? '室内入口'
                            : '建筑',
                quad: 计算矩形布局(layer, index, rawBuildings.length),
            });
        });
    });

    const findParentLayer = (layer: 地图层级结构): 地图层级结构 | null => {
        if (layer.层级 === '大地点') return null;
        const candidates = layer.层级 === '中地点'
            ? layers.filter((candidate) => candidate.层级 === '大地点')
            : layer.层级 === '小地点'
                ? layers.filter((candidate) => candidate.层级 === '中地点' || candidate.层级 === '大地点')
                : layers.filter((candidate) => candidate.层级 === '小地点' || candidate.层级 === '中地点' || candidate.层级 === '大地点');
        return candidates
            .map((candidate) => {
                let score = 0;
                if (layer.归属.大地点 && 层级名称命中(candidate.名称, layer.归属.大地点)) score += 50;
                if (layer.归属.中地点 && (层级名称命中(candidate.名称, layer.归属.中地点) || 层级名称命中(candidate.归属.中地点, layer.归属.中地点))) score += 40;
                if (layer.归属.小地点 && (层级名称命中(candidate.名称, layer.归属.小地点) || 层级名称命中(candidate.归属.小地点, layer.归属.小地点))) score += 35;
                if (candidate.层级 === '小地点') score += layer.层级 === '具体地点' ? 18 : 0;
                if (candidate.层级 === '中地点') score += layer.层级 === '小地点' ? 18 : layer.层级 === '具体地点' ? 8 : 0;
                if (candidate.层级 === '大地点') score += layer.层级 === '中地点' ? 18 : 2;
                return { candidate, score };
            })
            .filter((item) => item.score > 0 && item.candidate.ID !== layer.ID)
            .sort((left, right) => right.score - left.score)[0]?.candidate || null;
    };

    layers.forEach((layer) => {
        if (layer.父级ID && layerById.has(layer.父级ID)) return;
        const parent = findParentLayer(layer);
        if (parent) layer.父级ID = parent.ID;
    });

    const childLayersByParent = new Map<string, 地图层级结构[]>();
    layers.forEach((layer) => {
        const parentId = 取文本(layer.父级ID);
        if (!parentId || !layerById.has(parentId)) return;
        const bucket = childLayersByParent.get(parentId) || [];
        bucket.push(layer);
        childLayersByParent.set(parentId, bucket);
    });

    childLayersByParent.forEach((childLayers, parentId) => {
        const parent = layerById.get(parentId);
        if (!parent || 是否室内层级(parent)) return;
        childLayers.forEach((childLayer, index) => {
            const category = childLayer.层级 === '中地点'
                ? '城市/区域'
                : childLayer.层级 === '小地点'
                    ? '小地点入口'
                    : 是否室内层级(childLayer)
                        ? '室内入口'
                        : '地点入口';
            ensureBuilding({
                layerId: parent.ID,
                name: childLayer.名称,
                desc: `${childLayer.名称} 在 ${parent.名称} 中的层级入口。`,
                ownership: childLayer.归属,
                category,
                quad: 计算父层子层入口布局(parent, childLayer, childLayers, index),
            });
        });
    });

    内部建筑映射.forEach((names, layerId) => {
        const ownership = layerById.get(layerId)?.归属 || { 大地点: '', 中地点: '', 小地点: '' };
        names.forEach((name) => {
            const legacy = 旧版建筑列表.find((item: any) => 层级名称命中(item?.名称, name));
            ensureBuilding({
                layerId,
                name,
                desc: legacy?.描述,
                ownership: legacy ? 规范化地点归属(legacy?.归属) : ownership,
            });
        });
    });

    旧版建筑列表.forEach((building: any) => {
        const layerId = selectTargetLayerForBuilding(building);
        ensureBuilding({
            layerId,
            name: 取文本(building?.名称),
            desc: 取文本(building?.描述),
            ownership: 规范化地点归属(building?.归属),
        });
    });

    const envSpecificName = 取文本(options?.env?.具体地点);
    if (envSpecificName && 是否室内居所位置(envSpecificName)) {
        const specificLayer = layers.find((layer) => layer.层级 === '具体地点' && 层级名称命中(layer.名称, envSpecificName));
        const layerId = specificLayer?.ID || envSmallId || envMidId || envBigId || '';
        const ownership = specificLayer?.归属 || envOwnership;
        if (specificLayer) {
            构建室内结构名称列表(specificLayer).forEach((structure) => {
                ensureBuilding({
                    layerId,
                    name: structure.name,
                    desc: structure.desc,
                    ownership,
                    category: structure.category,
                });
            });
        }
    }

    const peopleHintByLayer = new Map<string, number>();
    const registerPeopleHint = (layerId: string) => {
        if (!layerId) return;
        peopleHintByLayer.set(layerId, (peopleHintByLayer.get(layerId) || 0) + 1);
    };
    (Array.isArray(world?.活跃NPC列表) ? world.活跃NPC列表 : []).forEach((npc: any) => {
        const pathText = [
            npc?.位置路径,
            npc?.当前位置,
            npc?.归属?.大地点,
            npc?.归属?.中地点,
            npc?.归属?.小地点,
        ].map((item) => 取文本(item)).filter(Boolean).join(' > ');
        const normalizedPath = 归一化地图文本(pathText);
        const fallbackName = npc?.当前位置;
        const layer = layers.find((candidate) => (
            (normalizedPath && normalizedPath.includes(归一化地图文本(candidate.名称)))
            || 层级名称命中(candidate.名称, fallbackName)
        ));
        registerPeopleHint(layer?.ID || envSmallId || envMidId || envBigId || '');
    });
    const envCurrentLayer = layers.find((layer) => (
        (取文本(options?.env?.具体地点) && layer.层级 === '具体地点' && 层级名称命中(layer.名称, options?.env?.具体地点))
        || (取文本(options?.env?.小地点) && layer.层级 === '小地点' && 层级名称命中(layer.名称, options?.env?.小地点))
    ));
    registerPeopleHint(envCurrentLayer?.ID || envSmallId || envMidId || envBigId || '');

    layers.forEach((layer) => {
        if (是否室内层级(layer)) {
            const existing = buildingLayers.get(layer.ID) || [];
            if (existing.length === 0) {
                构建室内结构名称列表(layer).forEach((structure) => {
                    ensureBuilding({
                        layerId: layer.ID,
                        name: structure.name,
                        desc: structure.desc,
                        ownership: layer.归属,
                        category: structure.category,
                    });
                });
            }
            return;
        }
        if (!是否聚落层级(layer)) return;
        const existing = buildingLayers.get(layer.ID) || [];
        const targetCount = 获取聚落目标建筑数量(layer, existing.length, peopleHintByLayer.get(layer.ID) || 0);
        const categories = layer.层级 === '具体地点'
            ? ['厢房', '廊屋', '仓房', '厨房', '偏厅', '门房', '柴房', '小院']
            : ['民居', '铺面', '客舍', '仓房', '茶棚', '院落', '工坊', '门楼', '厢房', '杂院'];
        for (let index = existing.length; index < targetCount; index += 1) {
            const category = categories[index % categories.length];
            ensureBuilding({
                layerId: layer.ID,
                name: `${layer.名称}${category}${生成序号文本(index)}`,
                desc: `${layer.名称} 中可供地图承接的${category}节点，后续剧情可继续细化。`,
                ownership: layer.归属,
                category,
            });
        }
    });

    buildings.forEach((building, index) => {
        const layer = layerById.get(building.所在层级ID);
        if (!layer) return;
        const siblings = buildings.filter((item) => item.所在层级ID === building.所在层级ID);
        if (是否室内层级(layer)) {
            const indoorIndex = siblings.findIndex((item) => item.ID === building.ID);
            building.四角坐标 = 计算室内结构布局(layer, indoorIndex >= 0 ? indoorIndex : index, Math.max(siblings.length, 1), building.分类);
        } else if (!building.四角坐标 || building.四角坐标.length < 4) {
            building.四角坐标 = 计算矩形布局(layer, index, Math.max(siblings.length, 1));
        }
        追加唯一值(layer.建筑物ID列表, building.ID);
    });

    // 存储优化器生成的道路，稍后添加到道路列表
    const 优化器道路列表: Array<{ layer: 地图层级结构; roads: Array<{ name: string; points: 地图坐标点结构[] }> }> = [];
    
    layers.forEach((layer) => {
        const layerBuildings = buildings.filter((building) => building.所在层级ID === layer.ID);
        if (是否室内层级(layer)) {
            layerBuildings.forEach((building, index) => {
                building.四角坐标 = 计算室内结构布局(layer, index, Math.max(layerBuildings.length, 1), building.分类);
            });
            return;
        }
        
        // 先尝试使用新的布局优化器
        const 优化结果 = 优化地图布局(layer, layerBuildings);
        if (优化结果.建筑.length > 0 && 优化结果.道路.length > 0) {
            // 应用优化后的建筑布局
            优化结果.建筑.forEach((优化建筑, index) => {
                if (layerBuildings[index]) {
                    layerBuildings[index].四角坐标 = 优化建筑.四角坐标;
                }
            });
            
            // 保存优化器生成的道路
            if (优化结果.道路.length > 0) {
                优化器道路列表.push({ layer, roads: 优化结果.道路 });
            }
        } else {
            // 如果优化器不适用，使用原有逻辑
            重排离散建筑布局(layer, layerBuildings);
        }
        
        避让层级建筑重叠(layer, layerBuildings);
    });

    return {
        layers,
        buildings,
        优化器道路列表,
    };
};

const 按层级补齐道路 = (
    layers: 地图层级结构[],
    seedRoads: 地图道路结构[],
    buildings: 地图建筑结构[],
    优化器道路列表: Array<{ layer: 地图层级结构; roads: Array<{ name: string; points: 地图坐标点结构[] }> }>
): 地图道路结构[] => {
    const roads = [...seedRoads];
    const roadLookup = new Map<string, string>();
    const optimizerLayerIds = new Set(优化器道路列表.filter(({ roads: optimizerRoads }) => optimizerRoads.length > 0).map(({ layer }) => layer.ID));
    const optimizerRoadIds = new Set<string>();
    roads.forEach((road) => {
        roadLookup.set(`${road.所在层级ID}|${归一化地图文本(road.名称)}`, road.ID);
    });
    
    // 首先添加优化器生成的道路
    优化器道路列表.forEach(({ layer, roads: optimizerRoads }) => {
        if (是否室内层级(layer)) return;
        optimizerRoads.forEach((roadData) => {
            const key = `${layer.ID}|${归一化地图文本(roadData.name)}`;
            if (roadLookup.has(key)) return; // 避免重复
            
            const road: 地图道路结构 = {
                ID: 生成地图对象ID('road', layer.ID, roadData.name),
                名称: roadData.name,
                描述: `${layer.名称}的${roadData.name}`,
                归属: layer.归属,
                所在层级ID: layer.ID,
                路径点: roadData.points,
            };
            
            roads.push(road);
            roadLookup.set(key, road.ID);
            optimizerRoadIds.add(road.ID);
            追加唯一值(layer.道路ID列表, road.ID);
        });
    });

    layers.forEach((layer) => {
        if (是否室内层级(layer)) {
            for (let index = roads.length - 1; index >= 0; index -= 1) {
                if (roads[index].所在层级ID !== layer.ID) continue;
                roadLookup.delete(`${roads[index].所在层级ID}|${归一化地图文本(roads[index].名称)}`);
                roads.splice(index, 1);
            }
            layer.道路ID列表 = [];
            return;
        }
        // 野外层级：把已经存在的多条道路（聚落网格 / 主街 / 横巷 / 纵巷 等）先压缩为最多 1 条主路
        // 用户反馈："郊外荒庙道路不应该是网格样子，应该一条路贯穿地图，庙在路旁"
        if (是否野外层级(layer)) {
            const layerRoadIndices: number[] = [];
            for (let index = 0; index < roads.length; index += 1) {
                if (roads[index].所在层级ID === layer.ID) layerRoadIndices.push(index);
            }
            if (layerRoadIndices.length > 1) {
                // 优先保留"主路/官道/山道/野径/小径"等单主路名；否则保留路径点最多的一条
                const scoreRoad = (road: 地图道路结构): number => {
                    const name = road.名称 || '';
                    if (/官道|主路|大路|山道|大道/.test(name)) return 100;
                    if (/野径|小径|小路|石径|古道/.test(name)) return 80;
                    if (/主街|横巷|纵巷|街|巷|接入路|沿建筑/.test(name)) return -50;
                    return (road.路径点 || []).length;
                };
                const sorted = layerRoadIndices
                    .map((idx) => ({ idx, score: scoreRoad(roads[idx]) }))
                    .sort((a, b) => b.score - a.score);
                const keepIdx = sorted[0].idx;
                // 从后往前删除未保留项
                layerRoadIndices
                    .filter((idx) => idx !== keepIdx)
                    .sort((a, b) => b - a)
                    .forEach((idx) => {
                        const doomed = roads[idx];
                        roadLookup.delete(`${doomed.所在层级ID}|${归一化地图文本(doomed.名称)}`);
                        roads.splice(idx, 1);
                    });
            }
            // 清理并重建 layer.道路ID列表
            layer.道路ID列表 = roads.filter((r) => r.所在层级ID === layer.ID).map((r) => r.ID);
        }
        const layerBuildings = buildings.filter((building) => building.所在层级ID === layer.ID);
        const layerBounds = layerBuildings.length > 0
            ? layerBuildings.reduce((bounds, building) => {
                const current = 计算建筑边界(building);
                return {
                    minX: Math.min(bounds.minX, current.minX),
                    maxX: Math.max(bounds.maxX, current.maxX),
                    minY: Math.min(bounds.minY, current.minY),
                    maxY: Math.max(bounds.maxY, current.maxY),
                };
            }, { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY })
            : null;
        if (layerBounds) {
            const padding = Math.max(4, Math.min(layer.网格宽度, layer.网格高度) * 0.18);
            for (let index = roads.length - 1; index >= 0; index -= 1) {
                const road = roads[index];
                if (road.所在层级ID !== layer.ID) continue;
                if (optimizerLayerIds.has(layer.ID) && 是否聚落层级(layer) && !optimizerRoadIds.has(road.ID)) {
                    roadLookup.delete(`${road.所在层级ID}|${归一化地图文本(road.名称)}`);
                    roads.splice(index, 1);
                    continue;
                }
                if (是否聚落层级(layer) && (/沿建筑|接入路/u.test(road.名称) || road.路径点.length > 6)) {
                    roadLookup.delete(`${road.所在层级ID}|${归一化地图文本(road.名称)}`);
                    roads.splice(index, 1);
                    continue;
                }
                const touchesReadableCluster = 路径触及边界(road.路径点, {
                    minX: layerBounds.minX - padding,
                    maxX: layerBounds.maxX + padding,
                    minY: layerBounds.minY - padding,
                    maxY: layerBounds.maxY + padding,
                });
                if (!touchesReadableCluster) {
                    roadLookup.delete(`${road.所在层级ID}|${归一化地图文本(road.名称)}`);
                    roads.splice(index, 1);
                }
            }
        }
        const layerRoads = roads.filter((road) => road.所在层级ID === layer.ID);
        layerRoads.forEach((road) => 追加唯一值(layer.道路ID列表, road.ID));

        const buildingAnchors = layerBuildings.map((building) => ({
            building,
            center: 计算四角中心(building.四角坐标),
            entrance: 计算建筑入口坐标(building, layer),
        }));

        if (是否聚落层级(layer) && buildingAnchors.length >= 4 && !optimizerLayerIds.has(layer.ID)) {
            const xs = buildingAnchors.map((item) => item.center.x);
            const ys = buildingAnchors.map((item) => item.center.y);
            const minX = Math.max(1.2, Math.min(...xs) - 2.2);
            const maxX = Math.min(layer.网格宽度 - 1.2, Math.max(...xs) + 2.2);
            const minY = Math.max(1.2, Math.min(...ys) - 1.8);
            const maxY = Math.min(layer.网格高度 - 1.2, Math.max(...ys) + 1.8);
            const horizontalRows = Array.from(new Set(
                buildingAnchors
                    .map((item) => Number(item.entrance.y.toFixed(1)))
                    .sort((a, b) => a - b)
            )).filter((_, index, list) => index === 0 || index === list.length - 1 || index % 2 === 0).slice(0, 4);
            const verticalCols = Array.from(new Set(
                buildingAnchors
                    .map((item) => Number(item.entrance.x.toFixed(1)))
                    .sort((a, b) => a - b)
            )).filter((_, index, list) => index === 0 || index === list.length - 1 || index % 3 === 0).slice(0, 3);
            horizontalRows.forEach((y, index) => {
                const name = index === 0 ? '主街' : `横巷${生成序号文本(index - 1)}`;
                const key = `${layer.ID}|${归一化地图文本(name)}`;
                if (roadLookup.has(key)) return;
                const road: 地图道路结构 = {
                    ID: 生成地图对象ID('road', layer.ID, name),
                    名称: name,
                    描述: `${layer.名称} 内串联建筑门面的${name}。`,
                    归属: { ...layer.归属 },
                    所在层级ID: layer.ID,
                    路径点: [
                        { x: minX, y: 限制数值(y, minY, maxY) },
                        { x: maxX, y: 限制数值(y, minY, maxY) },
                    ],
                };
                roads.push(road);
                layerRoads.push(road);
                roadLookup.set(key, road.ID);
                追加唯一值(layer.道路ID列表, road.ID);
            });
            verticalCols.forEach((x, index) => {
                const name = index === 0 ? '纵街' : `纵巷${生成序号文本(index - 1)}`;
                const key = `${layer.ID}|${归一化地图文本(name)}`;
                if (roadLookup.has(key)) return;
                const road: 地图道路结构 = {
                    ID: 生成地图对象ID('road', layer.ID, name),
                    名称: name,
                    描述: `${layer.名称} 内连接街巷的${name}。`,
                    归属: { ...layer.归属 },
                    所在层级ID: layer.ID,
                    路径点: [
                        { x: 限制数值(x, minX, maxX), y: minY },
                        { x: 限制数值(x, minX, maxX), y: maxY },
                    ],
                };
                roads.push(road);
                layerRoads.push(road);
                roadLookup.set(key, road.ID);
                追加唯一值(layer.道路ID列表, road.ID);
            });
        }

        const mainRoadName = 是否聚落层级(layer) ? '主街' : '通行主路';
        const mainRoadKey = `${layer.ID}|${归一化地图文本(mainRoadName)}`;
        if (layerRoads.length === 0 || (!是否聚落层级(layer) && buildingAnchors.length > 1 && !roadLookup.has(mainRoadKey))) {
            if (buildingAnchors.length > 0) {
                const xs = buildingAnchors.map((item) => item.center.x);
                const ys = buildingAnchors.map((item) => item.center.y);
                const xSpread = Math.max(...xs) - Math.min(...xs);
                const ySpread = Math.max(...ys) - Math.min(...ys);
                const sortedAnchors = [...buildingAnchors].sort((left, right) => (
                    xSpread >= ySpread
                        ? left.center.x - right.center.x
                        : left.center.y - right.center.y
                ));
                const first = sortedAnchors[0].entrance;
                const last = sortedAnchors[sortedAnchors.length - 1].entrance;
                const mainPoints = sortedAnchors.length === 1
                    ? (
                        xSpread >= ySpread
                            ? [
                                { x: 限制数值(first.x - 4, 1, layer.网格宽度 - 1), y: first.y },
                                first,
                                { x: 限制数值(first.x + 4, 1, layer.网格宽度 - 1), y: first.y },
                            ]
                            : [
                                { x: first.x, y: 限制数值(first.y - 4, 1, layer.网格高度 - 1) },
                                first,
                                { x: first.x, y: 限制数值(first.y + 4, 1, layer.网格高度 - 1) },
                            ]
                    )
                    : (
                        xSpread >= ySpread
                            ? [
                                { x: 限制数值(first.x - 2, 1, layer.网格宽度 - 1), y: first.y },
                                ...sortedAnchors.map((item) => item.entrance),
                                { x: 限制数值(last.x + 2, 1, layer.网格宽度 - 1), y: last.y },
                            ]
                            : [
                                { x: first.x, y: 限制数值(first.y - 2, 1, layer.网格高度 - 1) },
                                ...sortedAnchors.map((item) => item.entrance),
                                { x: last.x, y: 限制数值(last.y + 2, 1, layer.网格高度 - 1) },
                            ]
                    );
                const mainRoad: 地图道路结构 = {
                    ID: 生成地图对象ID('road', layer.ID, mainRoadName),
                    名称: mainRoadName,
                    描述: 是否聚落层级(layer)
                        ? `${layer.名称} 中先形成的主街骨架，建筑沿街巷两侧展开。`
                        : `${layer.名称} 中串联主要落点的通行道路。`,
                    归属: { ...layer.归属 },
                    所在层级ID: layer.ID,
                    路径点: mainPoints,
                };
                roads.push(mainRoad);
                roadLookup.set(`${layer.ID}|${归一化地图文本(mainRoad.名称)}`, mainRoad.ID);
                追加唯一值(layer.道路ID列表, mainRoad.ID);
                layerRoads.push(mainRoad);
            } else if (layerRoads.length === 0) {
                const ridgeRoad: 地图道路结构 = {
                    ID: 生成地图对象ID('road', layer.ID, '野径'),
                    名称: '野径',
                    描述: `${layer.名称} 的自然小径，顺着地势绕行。`,
                    归属: { ...layer.归属 },
                    所在层级ID: layer.ID,
                    路径点: [
                        { x: 1.5, y: 限制数值(layer.网格高度 * 0.62, 1, layer.网格高度 - 1) },
                        { x: 限制数值(layer.网格宽度 * 0.28, 1, layer.网格宽度 - 1), y: 限制数值(layer.网格高度 * 0.48, 1, layer.网格高度 - 1) },
                        { x: 限制数值(layer.网格宽度 * 0.62, 1, layer.网格宽度 - 1), y: 限制数值(layer.网格高度 * 0.56, 1, layer.网格高度 - 1) },
                        { x: layer.网格宽度 - 1.5, y: 限制数值(layer.网格高度 * 0.38, 1, layer.网格高度 - 1) },
                    ],
                };
                roads.push(ridgeRoad);
                roadLookup.set(`${layer.ID}|${归一化地图文本(ridgeRoad.名称)}`, ridgeRoad.ID);
                追加唯一值(layer.道路ID列表, ridgeRoad.ID);
                layerRoads.push(ridgeRoad);
            }
        }

        buildingAnchors.forEach(({ building, entrance }) => {
            if (是否聚落层级(layer)) return;
            if (是否野外层级(layer)) return;
            const key = `${layer.ID}|${归一化地图文本(`${building.名称}接入路`)}`;
            if (roadLookup.has(key)) return;
            const nearestRoadPoint = 计算最近路径点(entrance, layerRoads);
            if (nearestRoadPoint && Math.hypot(nearestRoadPoint.x - entrance.x, nearestRoadPoint.y - entrance.y) <= 2.2) return;
            const safeEntrance = 推出建筑内部点(entrance, layer, layerBuildings);
            const safeNearestRoadPoint = nearestRoadPoint
                ? 推出建筑内部点(nearestRoadPoint, layer, layerBuildings)
                : null;
            const accessRoad: 地图道路结构 = {
                ID: 生成地图对象ID('road', layer.ID, building.名称, '接入路'),
                名称: `${building.名称}接入路`,
                描述: `从道路抵达 ${building.名称} 门前的短路，终点停在建筑边缘。`,
                归属: { ...layer.归属 },
                所在层级ID: layer.ID,
                路径点: safeNearestRoadPoint
                    ? [safeNearestRoadPoint, safeEntrance]
                    : [safeEntrance],
            };
            roads.push(accessRoad);
            roadLookup.set(key, accessRoad.ID);
            追加唯一值(layer.道路ID列表, accessRoad.ID);
        });

        roads
            .filter((road) => road.所在层级ID === layer.ID)
            .forEach((road) => {
                if (是否卷轴路线(road)) {
                    road.路径点 = road.路径点.map((point) => ({
                        x: 限制数值(point.x, 0.7, layer.网格宽度 - 0.7),
                        y: 限制数值(point.y, 0.7, layer.网格高度 - 0.7),
                    }));
                    return;
                }
                road.路径点 = 规划避让建筑正交路径(road.路径点, layer, layerBuildings);
            });

        // B9 保险：在聚落层再跑一次"建筑无重叠 + 路径避让"。
        // 用户反馈青石镇反复出现建筑重叠、道路穿建筑，这是一道最终兜底。
        if (是否聚落层级(layer) && layerBuildings.length > 0) {
            避让层级建筑重叠(layer, layerBuildings);
            roads
                .filter((road) => road.所在层级ID === layer.ID)
                .forEach((road) => {
                    if (是否卷轴路线(road)) return;
                    road.路径点 = 规划避让建筑正交路径(road.路径点, layer, layerBuildings);
                });
        }
    });

    return roads;
};

const 通过路径匹配层级 = (
    layers: 地图层级结构[],
    pathText: string,
    fallbackName = ''
): 地图层级结构 | null => {
    const normalizedPath = 归一化地图文本(pathText);
    if (!normalizedPath && !fallbackName) return null;

    const specific = layers.find((layer) => (
        layer.层级 === '具体地点'
        && (
            normalizedPath.includes(归一化地图文本(layer.名称))
            || 层级名称命中(layer.名称, fallbackName)
        )
    ));
    if (specific) return specific;

    const small = layers.find((layer) => (
        layer.层级 === '小地点'
        && (
            normalizedPath.includes(归一化地图文本(layer.名称))
            || 层级名称命中(layer.名称, fallbackName)
        )
    ));
    if (small) return small;

    const mid = layers.find((layer) => (
        layer.层级 === '中地点'
        && (
            normalizedPath.includes(归一化地图文本(layer.名称))
            || 层级名称命中(layer.名称, fallbackName)
        )
    ));
    if (mid) return mid;

    const big = layers.find((layer) => (
        layer.层级 === '大地点'
        && (
            normalizedPath.includes(归一化地图文本(layer.名称))
            || 层级名称命中(layer.名称, fallbackName)
        )
    ));
    return big || null;
};

const 匹配位置建筑 = (
    buildings: 地图建筑结构[],
    layer: 地图层级结构,
    locationText: unknown
): 地图建筑结构 | null => {
    const normalizedLocation = 归一化地图文本(locationText);
    if (!normalizedLocation) return null;
    return buildings.find((building) => (
        building.所在层级ID === layer.ID
        && (
            normalizedLocation.includes(归一化地图文本(building.名称))
            || 层级名称命中(building.名称, locationText)
        )
    )) || null;
};

const 计算人物落点 = (params: {
    name: string;
    layer: 地图层级结构;
    buildings: 地图建筑结构[];
    locationText: string;
    index: number;
    nearPoint?: 地图坐标点结构 | null;
    forceNear?: boolean;
}): 地图坐标点结构 => {
    if ((params.forceNear || 是否近身位置(params.locationText)) && params.nearPoint) {
        return 计算偏移坐标(params.nearPoint, params.layer, params.name, params.index, 1.25);
    }

    const matchedBuilding = 匹配位置建筑(params.buildings, params.layer, params.locationText);
    if (matchedBuilding) {
        return 计算偏移坐标(
            计算四角中心(matchedBuilding.四角坐标),
            params.layer,
            params.name,
            params.index,
            0.85
        );
    }

    if (是否野外位置(params.locationText) || params.buildings.filter((building) => building.所在层级ID === params.layer.ID).length === 0) {
        return 计算野外坐标(params.name, params.layer, params.index);
    }

    const layerBuildings = params.buildings.filter((building) => building.所在层级ID === params.layer.ID);
    const hash = 稳定散列(`${params.layer.ID}-${params.name}-${params.index}-resident`);
    const building = layerBuildings[hash % layerBuildings.length];
    const entrance = 计算建筑入口坐标(building, params.layer);
    return 计算道路附近落点(entrance, params.layer, params.name, params.index);
};

const 补齐地图人物 = (
    layers: 地图层级结构[],
    seedPeople: 地图人物结构[],
    buildings: 地图建筑结构[],
    world: any
): 地图人物结构[] => {
    const people = [...seedPeople];
    const peopleLookup = new Map<string, string>();
    const placedByLayer = new Map<string, 地图坐标点结构[]>();
    people.forEach((person) => {
        peopleLookup.set(`${person.所在层级ID}|${归一化地图文本(person.名称)}`, person.ID);
        if (!placedByLayer.has(person.所在层级ID)) placedByLayer.set(person.所在层级ID, []);
        placedByLayer.get(person.所在层级ID)!.push(person.坐标);
    });

    (Array.isArray(world?.活跃NPC列表) ? world.活跃NPC列表 : []).forEach((npc: any, index: number) => {
        const name = 取文本(npc?.姓名);
        if (!name) return;
        const pathText = [
            npc?.位置路径,
            npc?.当前位置,
            npc?.归属?.大地点,
            npc?.归属?.中地点,
            npc?.归属?.小地点,
        ].map((item) => 取文本(item)).filter(Boolean).join(' > ');
        const layer = 通过路径匹配层级(layers, pathText, npc?.当前位置);
        if (!layer) return;
        const key = `${layer.ID}|${归一化地图文本(name)}`;
        if (peopleLookup.has(key)) return;
        const rawPoint = 计算人物落点({
            name,
            layer,
            buildings,
            locationText: pathText,
            index,
        });
        const point = 计算人物避让落点(rawPoint, layer, name, index, placedByLayer.get(layer.ID) || [], 1.35);
        if (!placedByLayer.has(layer.ID)) placedByLayer.set(layer.ID, [point]);
        const person: 地图人物结构 = {
            ID: 生成地图对象ID('person', layer.ID, name),
            名称: name,
            描述: [取文本(npc?.当前状态), 取文本(npc?.当前行动)].filter(Boolean).join(' / '),
            归属: { ...layer.归属 },
            所在层级ID: layer.ID,
            坐标: point,
            关联NPC: name,
            是否当前玩家: false,
        };
        people.push(person);
        peopleLookup.set(key, person.ID);
    });

    return people;
};

export const 补齐世界地图空间字段 = (
    worldLike: Partial<世界数据结构> | null | undefined,
    options?: 地图空间补齐参数
): 世界数据结构 => {
    const world = worldLike && typeof worldLike === 'object' ? worldLike as 世界数据结构 : {} as 世界数据结构;
    const baseLayers = 规范化地图层级列表(world);
    const baseBuildings = 规范化地图建筑列表(world);
    const baseRoads = 规范化地图道路列表(world);
    const basePeople = 规范化地图人物列表(world);

    const { layers, buildings, 优化器道路列表 } = 从旧版字段派生地图空间(baseLayers, baseBuildings, world, options);
    const roads = 按层级补齐道路(layers, baseRoads, buildings, 优化器道路列表);
    const people = 补齐地图人物(layers, basePeople, buildings, world);

    const layerById = new Map(layers.map((layer) => [layer.ID, layer]));
    layers.forEach((layer) => {
        layer.建筑物ID列表 = [];
        layer.道路ID列表 = [];
        layer.人物ID列表 = [];
    });
    buildings.forEach((building) => {
        const layer = layerById.get(building.所在层级ID);
        if (layer) 追加唯一值(layer.建筑物ID列表, building.ID);
    });
    roads.forEach((road) => {
        const layer = layerById.get(road.所在层级ID);
        if (layer) 追加唯一值(layer.道路ID列表, road.ID);
    });
    people.forEach((person) => {
        const layer = layerById.get(person.所在层级ID);
        if (layer) 追加唯一值(layer.人物ID列表, person.ID);
    });

    // 验证并修复地图数据（参考 WorldX 的审查循环模式）
    验证并修复地图数据(layers, buildings, roads, people);

    return {
        ...world,
        地图层级: layers,
        地图建筑: buildings,
        地图道路: roads,
        地图人物: people,
    };
};

const 查找当前层级 = (
    world: 世界数据结构,
    env?: Partial<环境信息结构> | null
): { layer: 地图层级结构 | null; matchedBuildingIds: string[] } => {
    const layers = Array.isArray(world.地图层级) ? world.地图层级 : [];
    const buildings = Array.isArray(world.地图建筑) ? world.地图建筑 : [];
    const currentPlace = 取文本(env?.具体地点);

    const matchedBuildings = currentPlace
        ? buildings.filter((building) => 层级名称命中(building.名称, currentPlace))
        : [];

    if (matchedBuildings.length > 0) {
        const exactLayer = 查找最佳名称层级(layers, '具体地点', env?.具体地点);
        if (exactLayer) {
            const layerBuildings = buildings.filter((building) => building.所在层级ID === exactLayer.ID);
            const exactMatchedBuildings = layerBuildings.filter((building) => 层级名称命中(building.名称, currentPlace));
            return {
                layer: exactLayer,
                matchedBuildingIds: exactMatchedBuildings.length > 0
                    ? exactMatchedBuildings.map((item) => item.ID)
                    : []
            };
        }
        const layer = layers.find((item) => item.ID === matchedBuildings[0].所在层级ID) || null;
        return { layer, matchedBuildingIds: matchedBuildings.map((item) => item.ID) };
    }

    const exactSpecific = 查找最佳名称层级(layers, '具体地点', env?.具体地点);
    if (exactSpecific) return { layer: exactSpecific, matchedBuildingIds: [] };

    const exactSmall = 查找最佳名称层级(layers, '小地点', env?.小地点);
    if (exactSmall) return { layer: exactSmall, matchedBuildingIds: [] };

    const exactMiddle = 查找最佳名称层级(layers, '中地点', env?.中地点);
    if (exactMiddle) return { layer: exactMiddle, matchedBuildingIds: [] };

    const exactBig = 查找最佳名称层级(layers, '大地点', env?.大地点);
    if (exactBig) return { layer: exactBig, matchedBuildingIds: [] };

    return {
        layer: layers[0] || null,
        matchedBuildingIds: [],
    };
};

const 组装层级链 = (layers: 地图层级结构[], currentLayer: 地图层级结构 | null): 地图层级结构[] => {
    if (!currentLayer) return [];
    const layerById = new Map(layers.map((layer) => [layer.ID, layer]));
    const chain: 地图层级结构[] = [];
    let cursor: 地图层级结构 | undefined | null = currentLayer;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.ID)) {
        chain.unshift(cursor);
        guard.add(cursor.ID);
        cursor = cursor.父级ID ? layerById.get(cursor.父级ID) || null : null;
    }
    return chain;
};

const 构建临时人物 = (
    world: 世界数据结构,
    env?: Partial<环境信息结构> | null,
    socialList?: any[],
    playerName?: string
): 地图人物结构[] => {
    const layers = Array.isArray(world.地图层级) ? world.地图层级 : [];
    const buildings = Array.isArray(world.地图建筑) ? world.地图建筑 : [];
    const transientPeople: 地图人物结构[] = [];
    const placedByLayer = new Map<string, 地图坐标点结构[]>();
    const usedKeys = new Set<string>();

    const { layer: currentLayer } = 查找当前层级(world, env);
    let playerPoint: 地图坐标点结构 | null = null;
    if (currentLayer) {
        const currentPlayerName = 取文本(playerName, 取文本((env as any)?.主角姓名, '主角'));
        const currentPlace = 取文本(env?.具体地点);
        const matchedBuilding = 匹配位置建筑(buildings, currentLayer, currentPlace);
        playerPoint = matchedBuilding
            ? 计算偏移坐标(计算四角中心(matchedBuilding.四角坐标), currentLayer, currentPlayerName, 0, 0.45)
            : 计算人物落点({
                name: currentPlayerName,
                layer: currentLayer,
                buildings,
                locationText: [
                    env?.具体地点,
                    env?.小地点,
                    env?.中地点,
                    env?.大地点,
                ].map((item) => 取文本(item)).filter(Boolean).join(' > '),
                index: 0,
            });
        const spreadPlayerPoint = 计算人物避让落点(playerPoint, currentLayer, currentPlayerName, 0, placedByLayer.get(currentLayer.ID) || [], 1.35);
        if (!placedByLayer.has(currentLayer.ID)) placedByLayer.set(currentLayer.ID, [spreadPlayerPoint]);
        transientPeople.push({
            ID: 'player-current',
            名称: currentPlayerName,
            描述: [取文本(env?.具体地点), 取文本(env?.小地点)].filter(Boolean).join(' / '),
            归属: { ...currentLayer.归属 },
            所在层级ID: currentLayer.ID,
            坐标: spreadPlayerPoint,
            关联NPC: currentPlayerName,
            是否当前玩家: true,
        });
        usedKeys.add(`${currentLayer.ID}|${归一化地图文本(currentPlayerName)}`);
        usedKeys.add(`${currentLayer.ID}|${归一化地图文本('主角')}`);
    }

    (Array.isArray(socialList) ? socialList : []).forEach((npc: any, index: number) => {
        const name = 取文本(npc?.姓名, npc?.name || `同场角色${index + 1}`);
        const pathText = [
            npc?.当前位置,
            npc?.所在地点,
            npc?.具体地点,
            npc?.地点,
            npc?.位置,
            npc?.归属?.大地点,
            npc?.归属?.中地点,
            npc?.归属?.小地点,
        ].map((item) => 取文本(item)).filter(Boolean).join(' > ');
        const layer = 通过路径匹配层级(layers, pathText, npc?.当前位置 || npc?.具体地点) || currentLayer;
        if (!layer) return;
        const key = `${layer.ID}|${归一化地图文本(name)}`;
        if (usedKeys.has(key)) return;
        usedKeys.add(key);
        const isSameCurrentLayer = Boolean(currentLayer && layer.ID === currentLayer.ID);
        const rawPoint = 计算人物落点({
            name,
            layer,
            buildings,
            locationText: pathText,
            index: index + 1,
            nearPoint: isSameCurrentLayer ? playerPoint : null,
            forceNear: npc?.是否在场 === true,
        });
        const point = 计算人物避让落点(rawPoint, layer, name, index + 1, placedByLayer.get(layer.ID) || [], 1.35);
        if (!placedByLayer.has(layer.ID)) placedByLayer.set(layer.ID, [point]);
        transientPeople.push({
            ID: `scene-${生成地图对象ID('person', layer.ID, name)}`,
            名称: name,
            描述: [取文本(npc?.关系), 取文本(npc?.当前状态), 取文本(npc?.介绍)].filter(Boolean).join(' / '),
            归属: { ...layer.归属 },
            所在层级ID: layer.ID,
            坐标: point,
            关联NPC: name,
            是否当前玩家: false,
        });
    });

    return transientPeople;
};

export const 构建已补齐地图空间场景 = (
    normalizedWorld: Partial<世界数据结构> | null | undefined,
    env?: Partial<环境信息结构> | null,
    socialList?: any[],
    playerName?: string
): 地图空间场景结构 => {
    const world = normalizedWorld && typeof normalizedWorld === 'object' ? normalizedWorld as 世界数据结构 : {} as 世界数据结构;
    const layers = Array.isArray(world.地图层级) ? world.地图层级 : [];
    const buildings = Array.isArray(world.地图建筑) ? world.地图建筑 : [];
    const roads = Array.isArray(world.地图道路) ? world.地图道路 : [];
    const basePeople = Array.isArray(world.地图人物) ? world.地图人物 : [];
    const transientPeople = 构建临时人物(world, env, socialList, playerName);
    const transientKeys = new Set(transientPeople.map((item) => `${item.所在层级ID}|${归一化地图文本(item.名称)}`));
    const people = [
        ...basePeople.filter((item) => !transientKeys.has(`${item.所在层级ID}|${归一化地图文本(item.名称)}`)),
        ...transientPeople,
    ];

    const { layer: currentLayer, matchedBuildingIds } = 查找当前层级(world, env);
    const currentLayerId = currentLayer?.ID || '';
    const sameParentId = currentLayer?.父级ID || '';

    return {
        层级列表: layers,
        当前层级: currentLayer,
        当前层级链: 组装层级链(layers, currentLayer),
        同级层级列表: currentLayer
            ? layers.filter((layer) => (layer.父级ID || '') === sameParentId)
            : layers,
        子层级列表: currentLayer
            ? layers.filter((layer) => layer.父级ID === currentLayer.ID)
            : [],
        当前层建筑物: buildings.filter((building) => building.所在层级ID === currentLayerId),
        当前层道路: roads.filter((road) => road.所在层级ID === currentLayerId),
        当前层人物: people.filter((person) => person.所在层级ID === currentLayerId),
        当前玩家: people.find((person) => person.是否当前玩家) || null,
        命中建筑ID列表: matchedBuildingIds,
    };
};

export const 构建地图空间场景 = (
    worldLike: Partial<世界数据结构> | null | undefined,
    env?: Partial<环境信息结构> | null,
    socialList?: any[],
    playerName?: string
): 地图空间场景结构 => (
    构建已补齐地图空间场景(
        补齐世界地图空间字段(worldLike, { env }),
        env,
        socialList,
        playerName
    )
);
