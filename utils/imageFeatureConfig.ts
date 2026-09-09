import type { 接口设置结构 } from '../types';

/**
 * 文生图功能配置：从 apiConfig 中提取玩家在"文生图"设置页填的所有开关与偏好，
 * 并提供统一的 总开关/NPC开关/物品开关/场景开关 字段供生图工作流判断。
 *
 * 与 useGame 内的同名闭包等价；拆出来是为了让单测可以直接构造接口设置并断言行为。
 *
 * [修复] 总开关必须严格等于 文生图功能启用。旧版本 OR 上 NPC/物品/场景自动任务
 * 开关，导致玩家关掉总开关但子开关还在时，总开关仍为 true、自动生图照常被触发并报错
 * （玩家反馈）。总开关就是总开关——只有它自己决定全局文生图是否启用。
 */
export interface 文生图功能配置结构 {
    readonly 总开关: boolean;
    readonly NPC开关: boolean;
    readonly 物品开关: boolean;
    readonly 场景开关: boolean;
    readonly 使用词组转化器: boolean;
    readonly 性别筛选: '男' | '女' | '全部';
    readonly 重要性筛选: '全部' | '仅重要';
    readonly NPC画风: '通用' | '二次元' | '写实' | '国风';
    readonly 场景画风: '通用' | '二次元' | '写实' | '国风';
    readonly 场景构图要求: '纯场景' | '故事快照' | '剧照';
    readonly 场景横竖屏: '横屏' | '竖屏';
    readonly 场景尺寸: string;
    readonly 用头像: boolean;
    readonly 用立绘: boolean;
    readonly 用半身: boolean;
    readonly 用私密部位: boolean;
}

export const 解析文生图功能配置 = (apiConfig: 接口设置结构 | null | undefined): 文生图功能配置结构 => {
    const feature = (apiConfig?.功能模型占位 || {}) as any;
    const 当前后端 = feature?.文生图后端类型 === 'novelai' || feature?.文生图后端类型 === 'comfyui'
        ? feature.文生图后端类型
        : 'other';
    const 场景横竖屏: '横屏' | '竖屏' = feature?.自动场景生图横竖屏 === '竖屏' ? '竖屏' : '横屏';
    const 场景尺寸 = typeof feature?.自动场景生图分辨率 === 'string' && feature.自动场景生图分辨率.trim()
        ? feature.自动场景生图分辨率.trim()
        : (场景横竖屏 === '竖屏' ? '576x1024' : '1024x576');
    const 总开关已开启 = Boolean(feature?.文生图功能启用);
    return {
        总开关: 总开关已开启,
        NPC开关: 总开关已开启 && Boolean(feature?.NPC生图启用),
        物品开关: 总开关已开启 && Boolean(feature?.物品自动生图启用),
        场景开关: 总开关已开启 && Boolean(feature?.自动场景生图启用),
        使用词组转化器: 当前后端 === 'novelai'
            ? true
            : feature?.NPC生图使用词组转化器 !== false,
        性别筛选: feature?.NPC生图性别筛选 === '男' || feature?.NPC生图性别筛选 === '女' || feature?.NPC生图性别筛选 === '全部'
            ? feature.NPC生图性别筛选
            : '全部',
        重要性筛选: feature?.NPC生图重要性筛选 === '仅重要' || feature?.NPC生图重要性筛选 === '全部'
            ? feature?.NPC生图重要性筛选
            : '全部',
        NPC画风: feature?.自动NPC生图画风 === '二次元' || feature?.自动NPC生图画风 === '写实' || feature?.自动NPC生图画风 === '国风'
            ? feature?.自动NPC生图画风
            : '通用',
        场景画风: feature?.自动场景生图画风 === '二次元' || feature?.自动场景生图画风 === '写实' || feature?.自动场景生图画风 === '国风'
            ? feature?.自动场景生图画风
            : '通用',
        场景构图要求: feature?.自动场景生图构图要求 === '故事快照' || feature?.自动场景生图构图要求 === '剧照'
            ? feature?.自动场景生图构图要求
            : '纯场景',
        场景横竖屏,
        场景尺寸,
        用头像: feature?.自动生图子类型启用头像 !== false,
        用立绘: feature?.自动生图子类型启用立绘 !== false,
        用半身: feature?.自动生图子类型启用半身 !== false,
        用私密部位: feature?.自动生图子类型启用私密部位 !== false
    };
};
