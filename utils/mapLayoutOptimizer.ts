/**
 * 地图布局优化器
 * 参考真实城镇设计，生成更合理的建筑和道路布局
 */

import type {
    地图层级结构,
    地图建筑结构,
    地图道路结构,
    地图坐标点结构,
    地图四角坐标结构,
} from '../models/world';

type 道路网格 = {
    横向道路: Array<{ y: number; name: string }>;
    纵向道路: Array<{ x: number; name: string }>;
};

const 限制数值 = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 判断是否为聚落层级（城镇、村庄等）
 */
const 是否聚落层级 = (layer: 地图层级结构): boolean => {
    const text = `${layer?.名称 || ''}${layer?.描述 || ''}`.toLowerCase();
    return /镇|城|坊|市|街|巷|村|庄|院|宅|府|馆|楼|铺|居/.test(text);
};

/**
 * 生成城镇道路网格
 * 参考真实城镇：主干道形成骨架，次要道路形成街区
 */
export const 生成城镇道路网格 = (层级: 地图层级结构, 建筑数量: number): 道路网格 => {
    const { 网格宽度: width, 网格高度: height } = 层级;
    
    // 根据建筑数量决定道路密度
    const 道路数量 = Math.max(2, Math.min(3, Math.ceil(建筑数量 / 8)));
    
    const 横向道路: Array<{ y: number; name: string }> = [];
    const 纵向道路: Array<{ x: number; name: string }> = [];
    
    // 生成横向道路（东西向）
    for (let i = 0; i < 道路数量; i++) {
        const y = (height / (道路数量 + 1)) * (i + 1);
        const name = i === 0 ? '主街' : i === 1 ? '南街' : `横巷${i - 1}`;
        横向道路.push({ y, name });
    }
    
    // 生成纵向道路（南北向）
    for (let i = 0; i < 道路数量; i++) {
        const x = (width / (道路数量 + 1)) * (i + 1);
        const name = i === 0 ? '中央大道' : i === 1 ? '东街' : `纵巷${i - 1}`;
        纵向道路.push({ x, name });
    }
    
    return { 横向道路, 纵向道路 };
};

/**
 * 沿道路布置建筑
 * 建筑沿道路两侧排列，形成街区
 */
export const 沿道路布置建筑 = (
    层级: 地图层级结构,
    道路网格: 道路网格,
    建筑列表: 地图建筑结构[]
): 地图建筑结构[] => {
    const { 网格宽度: width, 网格高度: height } = 层级;
    const { 横向道路, 纵向道路 } = 道路网格;
    
    const 优化后的建筑: 地图建筑结构[] = [];
    const 建筑尺寸 = Math.max(2.5, Math.min(4.5, Math.floor(width / 7)));
    
    // 计算街区
    const 街区列表: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
    
    for (let i = 0; i < 纵向道路.length + 1; i++) {
        for (let j = 0; j < 横向道路.length + 1; j++) {
            const minX = i === 0 ? 1.5 : 纵向道路[i - 1].x + 0.8;
            const maxX = i === 纵向道路.length ? width - 1.5 : 纵向道路[i].x - 0.8;
            const minY = j === 0 ? 1.5 : 横向道路[j - 1].y + 0.8;
            const maxY = j === 横向道路.length ? height - 1.5 : 横向道路[j].y - 0.8;
            
            if (maxX - minX >= 建筑尺寸 && maxY - minY >= 建筑尺寸) {
                街区列表.push({ minX, maxX, minY, maxY });
            }
        }
    }
    
    // 在每个街区内放置建筑
    建筑列表.forEach((建筑, index) => {
        if (index >= 街区列表.length) {
            // 如果街区不够，使用原有坐标
            优化后的建筑.push(建筑);
            return;
        }
        
        const 街区 = 街区列表[index];
        const 可用宽度 = 街区.maxX - 街区.minX;
        const 可用高度 = 街区.maxY - 街区.minY;
        
        // 建筑占据街区的65-75%空间，留出间隙
        const 实际宽度 = Math.min(建筑尺寸, 可用宽度 * 0.7);
        const 实际高度 = Math.min(建筑尺寸, 可用高度 * 0.7);
        
        // 建筑在街区内居中，略微偏向道路一侧
        const x = 街区.minX + (可用宽度 - 实际宽度) / 2;
        const y = 街区.minY + (可用高度 - 实际高度) / 2;
        
        const 四角坐标: 地图四角坐标结构 = [
            { x, y },
            { x: x + 实际宽度, y },
            { x: x + 实际宽度, y: y + 实际高度 },
            { x, y: y + 实际高度 },
        ];
        
        优化后的建筑.push({
            ...建筑,
            四角坐标,
        });
    });
    
    return 优化后的建筑;
};

/**
 * 生成道路路径点
 */
export const 生成道路路径 = (
    层级: 地图层级结构,
    道路网格: 道路网格,
    建筑列表: 地图建筑结构[] = []
): Array<{ name: string; points: 地图坐标点结构[] }> => {
    const { 网格宽度: width, 网格高度: height } = 层级;
    const 道路列表: Array<{ name: string; points: 地图坐标点结构[] }> = [];
    const 建筑点 = 建筑列表.flatMap((建筑) => Array.isArray(建筑.四角坐标) ? 建筑.四角坐标 : []);
    const clusterMinX = 建筑点.length > 0 ? Math.max(0.8, Math.min(...建筑点.map((point) => point.x)) - 1.2) : 0.5;
    const clusterMaxX = 建筑点.length > 0 ? Math.min(width - 0.8, Math.max(...建筑点.map((point) => point.x)) + 1.2) : width - 0.5;
    const clusterMinY = 建筑点.length > 0 ? Math.max(0.8, Math.min(...建筑点.map((point) => point.y)) - 1.2) : 0.5;
    const clusterMaxY = 建筑点.length > 0 ? Math.min(height - 0.8, Math.max(...建筑点.map((point) => point.y)) + 1.2) : height - 0.5;
    
    // 横向道路
    道路网格.横向道路.forEach(({ y, name }) => {
        道路列表.push({
            name,
            points: [
                { x: clusterMinX, y },
                { x: clusterMaxX, y },
            ],
        });
    });
    
    // 纵向道路
    道路网格.纵向道路.forEach(({ x, name }) => {
        道路列表.push({
            name,
            points: [
                { x, y: clusterMinY },
                { x, y: clusterMaxY },
            ],
        });
    });
    
    return 道路列表;
};

const 计算环形坐标 = (
    count: number,
    radiusX: number,
    radiusY: number,
    startDeg: number,
    center: 地图坐标点结构
): 地图坐标点结构[] => {
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, index) => {
        const angle = (startDeg + (360 / count) * index) * Math.PI / 180;
        return {
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY,
        };
    });
};

const 生成卷轴环形建筑布局 = (
    层级: 地图层级结构,
    建筑列表: 地图建筑结构[]
): 地图建筑结构[] => {
    const { 网格宽度: width, 网格高度: height } = 层级;
    const center = { x: width * 0.5, y: height * 0.52 };
    const radiusX = Math.min(width * 0.34, Math.max(width * 0.24, 8));
    const radiusY = Math.min(height * 0.24, Math.max(height * 0.16, 5));
    const points = 计算环形坐标(建筑列表.length, radiusX, radiusY, -120, center);

    return 建筑列表.map((建筑, index) => {
        const point = points[index] || center;
        const hash = Array.from(`${层级.ID}-${建筑.ID}-${index}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const buildingWidth = Math.min(4.8, Math.max(3.1, width * (0.088 + (hash % 8) / 500)));
        const buildingHeight = Math.min(3.8, Math.max(2.5, height * (0.078 + ((hash >> 3) % 8) / 520)));
        const x = 限制数值(point.x - buildingWidth / 2, 0.9, Math.max(0.9, width - buildingWidth - 0.9));
        const y = 限制数值(point.y - buildingHeight / 2, 0.9, Math.max(0.9, height - buildingHeight - 0.9));
        const 四角坐标: 地图四角坐标结构 = [
            { x, y },
            { x: x + buildingWidth, y },
            { x: x + buildingWidth, y: y + buildingHeight },
            { x, y: y + buildingHeight },
        ];

        return {
            ...建筑,
            四角坐标,
        };
    });
};

const 计算建筑朝中心入口 = (
    建筑: 地图建筑结构,
    center: 地图坐标点结构
): 地图坐标点结构 => {
    const xs = 建筑.四角坐标.map((point) => point.x);
    const ys = 建筑.四角坐标.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const buildingCenter = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
    };
    const dx = center.x - buildingCenter.x;
    const dy = center.y - buildingCenter.y;
    if (Math.abs(dx) > Math.abs(dy)) {
        return {
            x: dx >= 0 ? maxX : minX,
            y: buildingCenter.y,
        };
    }
    return {
        x: buildingCenter.x,
        y: dy >= 0 ? maxY : minY,
    };
};

const 生成卷轴连线路径 = (
    层级: 地图层级结构,
    建筑列表: 地图建筑结构[]
): Array<{ name: string; points: 地图坐标点结构[] }> => {
    const center = { x: 层级.网格宽度 * 0.5, y: 层级.网格高度 * 0.52 };
    return 建筑列表.slice(0, 6).map((建筑, index) => ({
        name: `卷轴路线${String(index + 1).padStart(2, '0')}`,
        points: [
            center,
            计算建筑朝中心入口(建筑, center),
        ],
    }));
};

/**
 * 优化建筑和道路布局
 * 主入口函数
 */
export const 优化地图布局 = (
    层级: 地图层级结构,
    建筑列表: 地图建筑结构[]
): {
    建筑: 地图建筑结构[];
    道路: Array<{ name: string; points: 地图坐标点结构[] }>;
} => {
    // 只对聚落层级且建筑数量足够的情况进行优化
    if (!是否聚落层级(层级) || 建筑列表.length < 4) {
        return {
            建筑: 建筑列表,
            道路: [],
        };
    }

    // v11.0.2 APK 的地图更像卷轴节点图：当前区域居中，关键建筑环绕，路线从中心放射。
    const 优化后的建筑 = 生成卷轴环形建筑布局(层级, 建筑列表);
    const 道路路径 = 生成卷轴连线路径(层级, 优化后的建筑);
    
    return {
        建筑: 优化后的建筑,
        道路: 道路路径,
    };
};
