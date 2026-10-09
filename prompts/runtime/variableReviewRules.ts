import type { 提示词结构, 游戏设置结构 } from '../../types';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';
import { 构建变量路径登记表 } from '../../utils/variableRegistry';

export const buildVariableReviewRules = (state: Record<string, any>, promptPool: 提示词结构[], gameConfig: 游戏设置结构): string => {
    // 审查只需要字段含义与合法路径，不复用整套回合生成/初始化/结算规则和示例。
    const definition = promptPool.find(prompt => prompt.id === 'core_data' && prompt.启用)?.内容 || '';
    const structuralLines = 按功能开关过滤提示词内容(definition, gameConfig)
        .replace(/```[\s\S]*?```/g, '')
        .split('\n').map(line => line.trim())
        .filter(line => /^(?:#{1,4}\s|[├└│])/u.test(line));
    const schema = [...new Set(structuralLines)].join('\n');
    return [
        '【变量审查字段规则】',
        '只检查正文已成立事实与当前已结算变量的差异；不执行开局初始化、时间推进、自动恢复或整回合重结算。',
        '角色：资源、金钱、装备、物品、技能及身体状态；环境：当前时间、地点和天气；社交：持久NPC档案。',
        '世界：地图、势力、事件及NPC动向；战斗：当前战斗状态；玩家门派：组织与成员；任务列表、约定列表：已成立状态。',
        '金钱与钱包、实体货币、库存和装备必须联合核对，不能重复奖励、结算或凭备注补数值。',
        '字段为空不构成补齐依据；未提及不构成删除依据；所有命令继续受程序路径、NPC身份和经济保护校验。',
        '结构索引用于字段含义，不是初始化模板或剧情事实；实际值和身份以完整当前变量为准。',
        schema ? `【字段结构速查（去重，省略示例与普通回合规则）】\n${schema}` : '',
        '【当前结构路径索引（示例，非穷尽白名单）】',
        '数组[0]代表同类条目的结构；其它索引的字段读取完整当前变量。只能使用现有根路径和已知字段，最终合法性由程序按完整状态校验。',
        构建变量路径登记表(state).map(path => `- ${path}`).join('\n')
    ].filter(Boolean).join('\n');
};
