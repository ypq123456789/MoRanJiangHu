/**
 * 地图数据验证器
 * 参考 WorldX 项目的 AI 审查+反馈循环模式：
 * - AI 生成地图数据后，进行结构化验证
 * - 发现问题时生成反馈描述，可用于指导 AI 修正
 * - 自动修复可修复的问题（坐标越界、建筑重叠等）
 */
import type {
    地图层级结构,
    地图建筑结构,
    地图道路结构,
    地图人物结构,
    地图坐标点结构,
    地图四角坐标结构,
} from '../types';
import { 计算四角中心, 创建矩形四角 } from './mapSpatial';

// ─── 验证结果类型 ─────────────────────────────────────────────────────────

export type 验证问题级别 = 'error' | 'warning';

export interface 地图验证问题 {
    级别: 验证问题级别;
    类别: string;
    对象ID: string;
    对象名称: string;
    描述: string;
    自动修复?: boolean;
}

export interface 地图验证结果 {
    通过: boolean;
    问题列表: 地图验证问题[];
    修复计数: number;
    反馈摘要: string;
}

// ─── 验证配置 ─────────────────────────────────────────────────────────────

const 最小建筑面积 = 1.5;
const 最大建筑面积比例 = 0.6; // 单个建筑不应超过层级面积的 60%
const 最小道路长度 = 1.0;
const 坐标容差 = 0.5; // 允许坐标略微越界的容差

// ─── 辅助函数 ─────────────────────────────────────────────────────────────

const 计算四角面积 = (quad: 地图四角坐标结构): number => {
    const width = Math.abs(quad[1].x - quad[0].x);
    const height = Math.abs(quad[2].y - quad[1].y);
    return width * height;
};

const 计算四角边界 = (quad: 地图四角坐标结构) => ({
    minX: Math.min(quad[0].x, quad[1].x, quad[2].x, quad[3].x),
    maxX: Math.max(quad[0].x, quad[1].x, quad[2].x, quad[3].x),
    minY: Math.min(quad[0].y, quad[1].y, quad[2].y, quad[3].y),
    maxY: Math.max(quad[0].y, quad[1].y, quad[2].y, quad[3].y),
});

const 矩形重叠面积 = (
    a: { minX: number; maxX: number; minY: number; maxY: number },
    b: { minX: number; maxX: number; minY: number; maxY: number }
): number => {
    const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
    return overlapX * overlapY;
};

const 计算路径总长度 = (points: 地图坐标点结构[]): number => {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
};

// ─── 坐标越界修复 ─────────────────────────────────────────────────────────

const 限制坐标到层级 = (
    point: 地图坐标点结构,
    layer: 地图层级结构
): 地图坐标点结构 => ({
    x: Math.max(0, Math.min(layer.网格宽度, point.x)),
    y: Math.max(0, Math.min(layer.网格高度, point.y)),
});

const 修复四角越界 = (
    quad: 地图四角坐标结构,
    layer: 地图层级结构
): 地图四角坐标结构 => [
    限制坐标到层级(quad[0], layer),
    限制坐标到层级(quad[1], layer),
    限制坐标到层级(quad[2], layer),
    限制坐标到层级(quad[3], layer),
];

// ─── 核心验证逻辑 ─────────────────────────────────────────────────────────

/**
 * 验证建筑坐标合理性
 */
export const 验证建筑空间 = (
    building: 地图建筑结构,
    layer: 地图层级结构,
    allBuildings: 地图建筑结构[]
): 地图验证问题[] => {
    const issues: 地图验证问题[] = [];
    const bounds = 计算四角边界(building.四角坐标);
    const layerArea = layer.网格宽度 * layer.网格高度;
    const buildingArea = 计算四角面积(building.四角坐标);

    // 检查坐标是否越界
    if (bounds.minX < -坐标容差 || bounds.minY < -坐标容差
        || bounds.maxX > layer.网格宽度 + 坐标容差
        || bounds.maxY > layer.网格高度 + 坐标容差) {
        issues.push({
            级别: 'warning',
            类别: '坐标越界',
            对象ID: building.ID,
            对象名称: building.名称,
            描述: `建筑「${building.名称}」坐标超出层级「${layer.名称}」边界(${layer.网格宽度}x${layer.网格高度})`,
            自动修复: true,
        });
    }

    // 检查面积是否过小
    if (buildingArea < 最小建筑面积) {
        issues.push({
            级别: 'warning',
            类别: '面积异常',
            对象ID: building.ID,
            对象名称: building.名称,
            描述: `建筑「${building.名称}」面积过小(${buildingArea.toFixed(1)})，可能是坐标错误`,
            自动修复: false,
        });
    }

    // 检查面积是否过大
    if (buildingArea > layerArea * 最大建筑面积比例) {
        issues.push({
            级别: 'warning',
            类别: '面积异常',
            对象ID: building.ID,
            对象名称: building.名称,
            描述: `建筑「${building.名称}」面积(${buildingArea.toFixed(1)})超过层级面积的${Math.round(最大建筑面积比例 * 100)}%`,
            自动修复: false,
        });
    }

    // 检查与其他建筑的重叠
    for (const other of allBuildings) {
        if (other.ID === building.ID) continue;
        const otherBounds = 计算四角边界(other.四角坐标);
        const overlap = 矩形重叠面积(bounds, otherBounds);
        const smallerArea = Math.min(buildingArea, 计算四角面积(other.四角坐标));
        if (overlap > smallerArea * 0.5) {
            issues.push({
                级别: 'warning',
                类别: '建筑重叠',
                对象ID: building.ID,
                对象名称: building.名称,
                描述: `建筑「${building.名称}」与「${other.名称}」重叠面积超过50%`,
                自动修复: false,
            });
            break; // 只报告一次
        }
    }

    return issues;
};

/**
 * 验证道路空间合理性
 */
export const 验证道路空间 = (
    road: 地图道路结构,
    layer: 地图层级结构
): 地图验证问题[] => {
    const issues: 地图验证问题[] = [];

    // 检查路径点数量
    if (road.路径点.length < 2) {
        issues.push({
            级别: 'error',
            类别: '路径无效',
            对象ID: road.ID,
            对象名称: road.名称,
            描述: `道路「${road.名称}」路径点不足2个`,
            自动修复: false,
        });
        return issues;
    }

    // 检查路径点是否越界
    const outOfBounds = road.路径点.some((p) =>
        p.x < -坐标容差 || p.y < -坐标容差
        || p.x > layer.网格宽度 + 坐标容差
        || p.y > layer.网格高度 + 坐标容差
    );
    if (outOfBounds) {
        issues.push({
            级别: 'warning',
            类别: '坐标越界',
            对象ID: road.ID,
            对象名称: road.名称,
            描述: `道路「${road.名称}」部分路径点超出层级边界`,
            自动修复: true,
        });
    }

    // 检查路径长度
    const length = 计算路径总长度(road.路径点);
    if (length < 最小道路长度) {
        issues.push({
            级别: 'warning',
            类别: '路径过短',
            对象ID: road.ID,
            对象名称: road.名称,
            描述: `道路「${road.名称}」总长度(${length.toFixed(1)})过短`,
            自动修复: false,
        });
    }

    return issues;
};

/**
 * 验证人物坐标合理性
 */
export const 验证人物空间 = (
    person: 地图人物结构,
    layer: 地图层级结构,
    buildings: 地图建筑结构[]
): 地图验证问题[] => {
    const issues: 地图验证问题[] = [];

    // 检查坐标是否越界
    if (person.坐标.x < -坐标容差 || person.坐标.y < -坐标容差
        || person.坐标.x > layer.网格宽度 + 坐标容差
        || person.坐标.y > layer.网格高度 + 坐标容差) {
        issues.push({
            级别: 'warning',
            类别: '坐标越界',
            对象ID: person.ID,
            对象名称: person.名称,
            描述: `人物「${person.名称}」坐标超出层级边界`,
            自动修复: true,
        });
    }

    // 检查坐标是否为零点（AI 常见错误）
    if (person.坐标.x === 0 && person.坐标.y === 0) {
        issues.push({
            级别: 'warning',
            类别: '坐标无效',
            对象ID: person.ID,
            对象名称: person.名称,
            描述: `人物「${person.名称}」坐标为(0,0)，可能是 AI 未正确生成`,
            自动修复: true,
        });
    }

    return issues;
};

/**
 * 验证层级间的空间一致性
 */
export const 验证层级一致性 = (
    layers: 地图层级结构[],
    buildings: 地图建筑结构[]
): 地图验证问题[] => {
    const issues: 地图验证问题[] = [];

    for (const layer of layers) {
        // 检查层级尺寸是否合理
        if (layer.网格宽度 <= 0 || layer.网格高度 <= 0) {
            issues.push({
                级别: 'error',
                类别: '层级尺寸',
                对象ID: layer.ID,
                对象名称: layer.名称,
                描述: `层级「${layer.名称}」尺寸无效(${layer.网格宽度}x${layer.网格高度})`,
                自动修复: false,
            });
        }

        // 检查子层级入口建筑是否存在于父层级
        if (layer.父级ID) {
            const parent = layers.find((l) => l.ID === layer.父级ID);
            if (parent) {
                const entranceBuilding = buildings.find((b) =>
                    b.所在层级ID === parent.ID
                    && (b.分类 === '小地点入口' || b.分类 === '室内入口' || b.分类 === '城市区域')
                    && b.名称.includes(layer.名称)
                );
                if (!entranceBuilding && buildings.some((b) => b.所在层级ID === parent.ID)) {
                    issues.push({
                        级别: 'warning',
                        类别: '层级关联',
                        对象ID: layer.ID,
                        对象名称: layer.名称,
                        描述: `子层级「${layer.名称}」在父层级「${parent.名称}」中缺少入口建筑`,
                        自动修复: false,
                    });
                }
            }
        }
    }

    return issues;
};

// ─── 主验证入口 ─────────────────────────────────────────────────────────

/**
 * 验证并修复地图数据
 * 参考 WorldX 的审查模式：验证 → 报告问题 → 自动修复可修复项 → 生成反馈摘要
 *
 * @param layers 地图层级列表
 * @param buildings 建筑列表（会被原地修改以修复问题）
 * @param roads 道路列表（会被原地修改以修复问题）
 * @param persons 人物列表（会被原地修改以修复问题）
 * @returns 验证结果，包含问题列表和反馈摘要
 */
export const 验证并修复地图数据 = (
    layers: 地图层级结构[],
    buildings: 地图建筑结构[],
    roads: 地图道路结构[],
    persons: 地图人物结构[]
): 地图验证结果 => {
    const allIssues: 地图验证问题[] = [];
    let fixCount = 0;

    // 层级一致性验证
    allIssues.push(...验证层级一致性(layers, buildings));

    // 逐层验证建筑、道路、人物
    for (const layer of layers) {
        const layerBuildings = buildings.filter((b) => b.所在层级ID === layer.ID);
        const layerRoads = roads.filter((r) => r.所在层级ID === layer.ID);
        const layerPersons = persons.filter((p) => p.所在层级ID === layer.ID);

        // 验证建筑
        for (const building of layerBuildings) {
            const issues = 验证建筑空间(building, layer, layerBuildings);
            for (const issue of issues) {
                if (issue.自动修复 && issue.类别 === '坐标越界') {
                    building.四角坐标 = 修复四角越界(building.四角坐标, layer);
                    fixCount++;
                }
            }
            allIssues.push(...issues);
        }

        // 验证道路
        for (const road of layerRoads) {
            const issues = 验证道路空间(road, layer);
            for (const issue of issues) {
                if (issue.自动修复 && issue.类别 === '坐标越界') {
                    road.路径点 = road.路径点.map((p) => 限制坐标到层级(p, layer));
                    fixCount++;
                }
            }
            allIssues.push(...issues);
        }

        // 验证人物
        for (const person of layerPersons) {
            const issues = 验证人物空间(person, layer, layerBuildings);
            for (const issue of issues) {
                if (issue.自动修复) {
                    if (issue.类别 === '坐标越界') {
                        person.坐标 = 限制坐标到层级(person.坐标, layer);
                        fixCount++;
                    } else if (issue.类别 === '坐标无效') {
                        // 放置到层级中心附近
                        person.坐标 = {
                            x: layer.网格宽度 * (0.4 + Math.random() * 0.2),
                            y: layer.网格高度 * (0.4 + Math.random() * 0.2),
                        };
                        fixCount++;
                    }
                }
            }
            allIssues.push(...issues);
        }
    }

    // 生成反馈摘要（可用于指导 AI 修正）
    const errors = allIssues.filter((i) => i.级别 === 'error');
    const warnings = allIssues.filter((i) => i.级别 === 'warning');
    const unfixed = allIssues.filter((i) => !i.自动修复);

    let feedback = '';
    if (errors.length > 0) {
        feedback += `严重问题(${errors.length})：${errors.map((e) => e.描述).join('；')}。`;
    }
    if (unfixed.length > 0) {
        const grouped = new Map<string, string[]>();
        for (const issue of unfixed) {
            const list = grouped.get(issue.类别) || [];
            list.push(issue.描述);
            grouped.set(issue.类别, list);
        }
        const parts: string[] = [];
        for (const [category, descriptions] of grouped) {
            parts.push(`${category}(${descriptions.length}): ${descriptions.slice(0, 3).join('；')}`);
        }
        if (parts.length > 0) {
            feedback += (feedback ? '\n' : '') + `需关注：${parts.join('。')}`;
        }
    }
    if (fixCount > 0) {
        feedback += (feedback ? '\n' : '') + `已自动修复 ${fixCount} 处坐标越界/无效问题。`;
    }

    return {
        通过: errors.length === 0,
        问题列表: allIssues,
        修复计数: fixCount,
        反馈摘要: feedback || '地图数据验证通过，无异常。',
    };
};
