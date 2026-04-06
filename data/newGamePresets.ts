import type { OpeningConfig, WorldGenConfig, 游戏难度 } from '../types';

export type 属性分配 = {
    力量: number;
    敏捷: number;
    体质: number;
    根骨: number;
    悟性: number;
    福源: number;
};

export type 开局预设方案结构 = {
    id: string;
    名称: string;
    简介: string;
    worldConfig: Partial<WorldGenConfig>;
    character: {
        姓名: string;
        性别: string;
        年龄: number;
        出生月: number;
        出生日: number;
        外貌: string;
        性格: string;
        属性: 属性分配;
        背景名称: string;
        天赋名称列表: string[];
    };
    openingConfig?: OpeningConfig;
    openingStreaming?: boolean;
    openingExtraRequirement?: string;
};

export const 开局预设方案列表: 开局预设方案结构[] = [];
