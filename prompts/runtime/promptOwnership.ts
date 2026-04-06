import type { 提示词结构 } from '../../types';

export const 变量命令提示词ID列表 = [
    'core_data',
    'core_rules',
    'stat_body',
    'stat_char',
    'stat_combat',
    'stat_cultivation',
    'stat_drop',
    'stat_exp',
    'stat_item',
    'stat_item_weight_ref',
    'stat_kungfu',
    'stat_npc',
    'stat_other',
    'stat_recovery',
    'stat_world_evo',
    'diff_check_relaxed',
    'diff_check_easy',
    'diff_check_normal',
    'diff_check_hard',
    'diff_check_extreme',
    'diff_game_relaxed',
    'diff_game_easy',
    'diff_game_normal',
    'diff_game_hard',
    'diff_game_extreme',
    'diff_phys_relaxed',
    'diff_phys_easy',
    'diff_phys_normal',
    'diff_phys_hard',
    'diff_phys_extreme'
] as const;

export const 变量命令提示词ID集合 = new Set<string>(变量命令提示词ID列表);

const 提取提示词定位 = (content: string): string => {
    const source = (content || '').trim();
    const matched = source.match(/定位[：:]\s*([^\n]{1,120})/u);
    return (matched?.[1] || '').trim();
};

export const 是变量命令提示词 = (prompt?: Pick<提示词结构, 'id'> | null): boolean => (
    Boolean(prompt?.id) && 变量命令提示词ID集合.has(String(prompt?.id))
);

export const 提取启用变量命令提示词 = (
    promptPool: 提示词结构[],
    options?: { includeWorldEvolution?: boolean }
): 提示词结构[] => (
    (Array.isArray(promptPool) ? promptPool : [])
        .filter((prompt) => prompt?.启用 === true)
        .filter((prompt) => {
            if (!是变量命令提示词(prompt)) return false;
            if (options?.includeWorldEvolution === false && prompt.id === 'stat_world_evo') return false;
            return true;
        })
);

const 构建提示词分组文本 = (title: string, prompts: 提示词结构[]): string => {
    const sections = prompts
        .map((prompt) => {
            const content = typeof prompt?.内容 === 'string' ? prompt.内容.trim() : '';
            if (!content) return '';
            return `### ${prompt.标题 || prompt.id}\n${content}`;
        })
        .filter(Boolean);
    if (sections.length <= 0) return '';
    return `【${title}】\n${sections.join('\n\n')}`;
};

export const 构建变量命令提示词汇总 = (
    promptPool: 提示词结构[],
    options?: { includeWorldEvolution?: boolean }
): string => {
    const prompts = 提取启用变量命令提示词(promptPool, options);
    if (prompts.length <= 0) return '';

    const grouped = [
        构建提示词分组文本('变量结构与命令规则', prompts.filter((prompt) => prompt.id.startsWith('core_'))),
        构建提示词分组文本('难度、判定与生理规则', prompts.filter((prompt) => prompt.id.startsWith('diff_'))),
        构建提示词分组文本('数值、档案与成长规则', prompts.filter((prompt) => prompt.id.startsWith('stat_')))
    ].filter(Boolean);

    if (grouped.length <= 0) return '';

    return [
        '【变量命令提示词总表】',
        '- 以下提示词全部视为“独立变量命令链路”的正式规则来源；主剧情正文链路不再直接承担这些结构、公式与命令职责。',
        ...grouped
    ].join('\n\n').trim();
};

export const 构建主剧情难度摘要提示词 = (promptPool: 提示词结构[]): string => {
    const enabled = (Array.isArray(promptPool) ? promptPool : []).filter((prompt) => prompt?.启用 === true);
    const gamePrompt = enabled.find((prompt) => prompt?.id?.startsWith('diff_game_'));
    const physiologyPrompt = enabled.find((prompt) => prompt?.id?.startsWith('diff_phys_'));
    const checkPrompt = enabled.find((prompt) => prompt?.id?.startsWith('diff_check_'));

    const lines = ['【当前难度摘要】'];

    if (gamePrompt) {
        lines.push(`- ${gamePrompt.标题 || '游戏难度'}：${提取提示词定位(gamePrompt.内容) || '保持本回合整体风险、资源压力与失败代价的叙事尺度。'}`);
    }
    if (physiologyPrompt) {
        lines.push(`- ${physiologyPrompt.标题 || '生理难度'}：${提取提示词定位(physiologyPrompt.内容) || '决定恢复、疲劳、饥渴与伤势在正文里的持续压迫感。'}`);
    }
    if (checkPrompt) {
        lines.push(`- ${checkPrompt.标题 || '判定难度'}：${提取提示词定位(checkPrompt.内容) || '决定判定成功窗口、失败压力与跨境风险的叙事尺度。'}`);
    }

    return lines.length > 1 ? lines.join('\n').trim() : '';
};
