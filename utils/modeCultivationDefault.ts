import type { ModeRuntimeProfile, OpeningConfig, WorldGenConfig, 题材模式类型 } from '../models/system';
import { 是否自定义模式运行时配置 } from './effectiveTopicProfile';

/**
 * 题材包「启用修炼」默认值解析。
 *
 * 背景：ModeRuntimeProfile.identity.usesCultivation 此前是死字段——市场里可以编辑，
 * 但只被用于拼描述文本和选头像风格，从不进入提示词裁剪链。真正生效的是存档级
 * `游戏设置结构.启用修炼体系`（见 utils/promptFeatureToggles.ts 的三层剥离）。
 * 本模块把两者接起来，语义为「默认」而非「强制」。
 *
 * 为什么不接官方题材：官方模式的 usesCultivation 由 baseMode 的 group 推导，
 * 若一并接线会让所有现代/都市题材的新存档默认关掉修炼，属于超出本次范围的行为变更。
 * 因此只有自定义题材包（市场/工坊产出的 modeId 不在官方集合内）才提供默认值。
 */

/**
 * 读取自定义题材包声明的修炼默认值。
 * 返回 undefined 表示「不提供默认值」，调用方应保持当前设置不变。
 */
export const 解析题材包修炼默认值 = (
    mode?: 题材模式类型 | null,
    runtimeProfile?: ModeRuntimeProfile | null
): boolean | undefined => {
    if (!runtimeProfile) return undefined;
    if (!是否自定义模式运行时配置(runtimeProfile, mode)) return undefined;
    const declared = runtimeProfile.identity?.usesCultivation;
    if (typeof declared !== 'boolean') return undefined;
    return declared;
};

/**
 * 从开局配置 / 世界生成配置里解析题材包修炼默认值（后者用于 DIY 工具等只有 worldConfig 的场景）。
 */
export const 解析当前题材修炼默认值 = (
    openingConfig?: OpeningConfig | null,
    worldConfig?: WorldGenConfig | null
): boolean | undefined => {
    const runtimeProfile = openingConfig?.modeRuntimeProfile
        || worldConfig?.modeRuntimeProfile
        || null;
    const mode = openingConfig?.题材模式
        || worldConfig?.modeRuntimeProfile?.identity?.baseMode
        || null;
    return 解析题材包修炼默认值(mode, runtimeProfile);
};

/**
 * 题材包修炼开关相关的存档设置字段。
 * 单独抽出来给泛型用，避免调用方传入字面量对象时 TypeScript 推导出过窄的类型，
 * 导致读 `启用修炼体系已手动设置` 报TS2339。
 */
export interface 修炼开关设置 {
    启用修炼体系?: boolean;
    启用修炼体系已手动设置?: boolean;
}

/**
 * 把题材包默认值落到存档设置上。
 *
 * 「默认」语义：仅当玩家从未手动改过该开关时才写入；
 * 一旦玩家在设置页动过（启用修炼体系已手动设置 === true），题材包不再覆盖。
 */
export const 应用题材包修炼默认值 = <T extends 修炼开关设置>(
    gameConfig: T | null | undefined,
    packDefault: boolean | undefined
): 修炼开关设置 => {
    if (packDefault === undefined) return (gameConfig || {}) as 修炼开关设置;
    const current = gameConfig || ({} as T);
    if (current.启用修炼体系已手动设置 === true) return current as 修炼开关设置;
    return { ...current, 启用修炼体系: packDefault };
};

/**
 * 玩家手动改动后调用：锁定该开关，题材包默认值不再覆盖。
 */
export const 标记修炼开关已手动设置 = <T extends 修炼开关设置>(
    gameConfig: T
): 修炼开关设置 => ({ ...gameConfig, 启用修炼体系已手动设置: true });