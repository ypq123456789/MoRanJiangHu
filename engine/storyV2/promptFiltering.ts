import type { 世界书结构, 提示词结构, 游戏设置结构 } from '../../types';

const 冗杂数值提示词ID集合 = new Set([
    'core_data',
    'core_memory_rules',
    'stat_combat',
    'stat_body',
    'stat_drop',
    'stat_item_weight_ref',
    'core_cot_combat',
    'stat_world_evo',
    'stat_char',
    'stat_item',
    'stat_kungfu',
    'stat_other',
    'stat_exp',
    'stat_cultivation',
    'stat_npc',
    'stat_recovery'
]);

const 亲密器官世界书正则 = /(名器|yin_yang_record|buttock|anal|臀部|后穴|私密|肉棒|小穴)/i;
const 酒馆冲突条目正则 = /(快捷回复|墨染江湖A-J|必须生成完整10条|NSFW-A|视角切换|双线叙事|镜头转换|时间跳转|平行世界|平行事件|双子札记|丨伏笔|丨摘要|丨平行世界|丨双子札记|新摘要|大总结)/i;

/**
 * 过滤掉战斗公式、部位HP、掉落/物价/拍卖行及冗杂手写变量命令规则（2.0 由后端统一导演处理状态同步），
 * 保留核心叙事/格式/境界与人设法则。
 */
export const 构建2_0写作规则池 = (
    rawPool: 提示词结构[],
    coreWorldText?: string
): 提示词结构[] => {
    const out: 提示词结构[] = [];
    for (const item of rawPool || []) {
        if (!item) continue;
        if (冗杂数值提示词ID集合.has(item.id)) continue;
        let nextContent = item.内容 || '';
        if (item.id === 'core_world' && typeof coreWorldText === 'string' && coreWorldText.trim()) {
            nextContent = coreWorldText.trim();
        }
        // Strip legacy auction-house, battle-lock, combat check phases, or manual variable-command syntax
        nextContent = nextContent
            .replace(/[^\n]*拍卖行[^\n]*\n?/g, '')
            .replace(/[^\n]*处于战斗中[^\n]*\n?/g, '')
            .replace(/[^\n]*战斗\s*6\s*阶段[^\n]*\n?/g, '')
            .replace(/[^\n]*<变量规划>[^\n]*\n?/g, '')
            .replace(/[^\n]*<剧情规划>[^\n]*\n?/g, '')
            .trim();
        out.push({
            ...item,
            内容: nextContent
        });
    }
    return out;
};

/**
 * 在保留用户钟爱文风与反套路调校的前提下，屏蔽酒馆预设里会劫持 2.0 引擎的
 * “10 条 A-J 选项（含视角切换/强塞 NSFW）”“自带伏笔/平行世界/双子札记”等冲突模块。
 */
export const 净化2_0酒馆预设 = (gameConfig: 游戏设置结构): 游戏设置结构 => {
    const preset = gameConfig?.酒馆预设;
    if (!gameConfig?.启用酒馆预设模式 || !preset) return gameConfig;
    const cloned: 游戏设置结构 = JSON.parse(JSON.stringify(gameConfig));
    const targetPreset = cloned.酒馆预设;
    if (!targetPreset) return cloned;

    const disabledIds = new Set<string>();
    if (Array.isArray(targetPreset.prompts)) {
        targetPreset.prompts = targetPreset.prompts.map((entry: any) => {
            if (!entry) return entry;
            const hay = `${entry.name || ''}\n${entry.content || ''}`;
            if (酒馆冲突条目正则.test(hay)) {
                if (entry.identifier) disabledIds.add(String(entry.identifier));
                return { ...entry, enabled: false };
            }
            return entry;
        });
    }

    if (disabledIds.size > 0 && Array.isArray(targetPreset.prompt_order)) {
        targetPreset.prompt_order = targetPreset.prompt_order.map((grp: any) => {
            if (!grp || !Array.isArray(grp.order)) return grp;
            return {
                ...grp,
                order: grp.order.map((slot: any) => (
                    slot && disabledIds.has(String(slot.identifier))
                        ? { ...slot, enabled: false }
                        : slot
                ))
            };
        });
    }

    // Remove HTML <options>/<branches> rendering regex scripts if present
    const ext = targetPreset.extensions as any;
    if (ext && Array.isArray(ext.regex_scripts)) {
        ext.regex_scripts = ext.regex_scripts.filter((script: any) => {
            const label = `${script?.scriptName || ''}\n${script?.findRegex || ''}`;
            return !/(options|branches|选项|快捷回复|伏笔|摘要)/i.test(label);
        });
    }

    return cloned;
};

/**
 * 隔离重度 NSFW 器官词库世界书：
 * - 导演/世界推演永远不注入；
 * - 主剧情仅当明确处于亲密场景时才保留。
 */
export const 过滤非场景世界书 = (
    books: 世界书结构[],
    allowIntimateBooks: boolean
): 世界书结构[] => {
    if (allowIntimateBooks) return books || [];
    return (books || []).filter((book) => {
        const key = `${book?.id || ''} ${book?.标题 || (book as any)?.name || ''}`;
        return !亲密器官世界书正则.test(key);
    });
};
