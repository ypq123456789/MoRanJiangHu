import type { 游戏设置结构 } from '../models/system';
import type { 世界书功能模块结构, 世界书条目结构, 世界书结构 } from '../models/worldbook';
import { 功能模块是否启用 } from './promptFeatureToggles';

/**
 * 世界书条目与设置开关的联动。
 *
 * 背景：世界书是**全局设置**（IndexedDB settings store，不进存档），而
 * `gameConfig.启用修炼体系` 是**存档级**。两者粒度不一致，多存档切换时必须明确语义。
 *
 * 本模块采用的语义：**联动只影响「是否注入」，不改写世界书本身，也不回写存档设置**。
 * 即：存档 A 关了修炼 → 进入存档 B 时那条修炼条目会重新生效；
 * 世界书里的条目和它的功能模块归属永远保持玩家/题包编辑时的样子。
 * 这样既满足「开关联动世界书」，又不会让某个存档悄悄污染全局设置。
 *
 * 注入判定与 utils/promptFeatureToggles.ts 共用 `功能模块是否启用`，避免两套口径漂移。
 */

/** 条目是否应当在当前设置下注入：条目自身启用 && 归属模块未被关闭 */
export const 世界书条目是否生效 = (
    entry: 世界书条目结构 | null | undefined,
    config?: Partial<游戏设置结构> | null
): boolean => {
    if (!entry) return false;
    if (entry.启用 === false) return false;
    return 功能模块是否启用(entry.功能模块, config);
};

/** 过滤单个世界书的条目 */
export const 过滤世界书条目 = (
    book: 世界书结构,
    config?: Partial<游戏设置结构> | null
): 世界书功能模块结构['条目'] => (
    Array.isArray(book?.条目) ? book.条目.filter((entry) => 世界书条目是否生效(entry, config)) : []
);

/**
 * 按设置开关过滤世界书：剔除归属模块已关闭的条目。
 * 整本世界书若已无生效条目则**保留空条目书**而不是删除——调用方通常按书 id 查找，
 * 直接丢书会让上层拿不到 undefined 并且难以区分「被过滤」与「不存在」。
 */
export const 按功能开关过滤世界书 = (
    books: 世界书结构[] | null | undefined,
    config?: Partial<游戏设置结构> | null
): 世界书结构[] => {
    const list = Array.isArray(books) ? books : [];
    return list.map((book) => ({
        ...book,
        条目: 过滤世界书条目(book, config)
    }));
};

/**
 * 供 UI 展示：统计某本世界书有多少条目被当前开关隐藏。
 * 玩家需要知道「关掉这个开关会少注入哪几条」，否则关完才发现内容消失。
 */
export const 统计被联动隐藏的条目 = (
    book: 世界书结构 | null | undefined,
    config?: Partial<游戏设置结构> | null
): 世界书条目结构[] => {
    const entries = Array.isArray(book?.条目) ? book.条目 : [];
    return entries.filter((entry) => entry && entry.启用 !== false && !功能模块是否启用(entry.功能模块, config));
};