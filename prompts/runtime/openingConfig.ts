import type { OpeningConfig } from '../../types';
import { 构建修炼体系附加块 } from '../../utils/promptFeatureToggles';

export const 构建开局配置提示词 = (openingConfig?: OpeningConfig | null): string => {
    if (!openingConfig) return '';
    const 关系侧重 = Array.isArray(openingConfig.关系侧重) && openingConfig.关系侧重.length > 0
        ? openingConfig.关系侧重.join('、')
        : '无';
    return [
        '【本次开局配置约束】',
        `- 关系侧重：${关系侧重}。生成初始社交网时，应优先让人物结构与关系情绪落在这些方向上。`,
        `- 开局切入偏好：${openingConfig.开局切入偏好}。第一幕镜头与气氛优先贴近该切入方式，不要无痕偏离。`,
        '- 若开局偏好与建档、世界观存在冲突，以建档硬约束和 world_prompt 为上位，但仍应尽量保留关系侧重与切入偏好的方向。'
    ].join('\n');
};

export const 构建世界观同人融合提示词 = (openingConfig?: OpeningConfig | null): string => {
    const fandom = openingConfig?.同人融合;
    const title = typeof fandom?.作品名 === 'string' ? fandom.作品名.trim() : '';
    if (!fandom?.enabled || !title) return '';
    const rolePolicy = fandom.保留原著角色
        ? '允许原著角色、原著势力或其直接变体进入世界母本，但仍要保证本项目武侠成长体系与长期叙事可运行。'
        : '只吸收原著世界观母题、气质、势力逻辑、地理审美或价值冲突，不直接保留原著角色实体。';
    return [
        '【同人融合世界观要求】',
        `- 参考来源：${title}（${fandom.来源类型}）。`,
        `- 融合强度：${fandom.融合强度}。`,
        `- 角色保留策略：${rolePolicy}`,
        '- 此要求只作用于 world_prompt 生成，不要在世界观阶段写成粉丝设定清单、角色介绍或剧情提纲。',
        '- 融合后的结果仍必须是当前存档可长期运行的原创世界母本，并兼容本项目既有成长口径。',
        构建修炼体系附加块('- 若启用修炼体系，结果还必须兼容本项目既有境界口径。')
    ].join('\n');
};
