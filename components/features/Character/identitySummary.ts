import { 角色数据结构 } from '../../../types';

const 规范化身份片段 = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (['无', '无称号', 'none', '未设定', '未知'].includes(trimmed)) return '';
    return trimmed;
};

export const 构建角色身份摘要 = (character: 角色数据结构): string => {
    const 背景 = 规范化身份片段(character.出身背景?.名称);
    return 背景 || '江湖散人';
};
