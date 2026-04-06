// 环境相关定义 - 解耦自 types.ts

export interface 环境节日信息结构 {
    名称: string;
    简介: string;
    效果: string;
}

export interface 结构化时间信息结构 {
    年: number;
    月: number;
    日: number;
    时: number;
    分: number;
}

export interface 天气信息结构 {
    天气: string;
    结束日期: string; // YYYY:MM:DD:HH:MM
}

export interface 环境变量结构 {
    名称: string; // 四字
    描述: string;
    效果: string;
}

export interface 环境信息结构 {
    时间: string; // YYYY:MM:DD:HH:MM，环境时间唯一真值
    大地点: string;
    中地点: string;
    小地点: string;
    具体地点: string;
    节日: 环境节日信息结构 | null;
    天气: 天气信息结构;
    环境变量: 环境变量结构[];
}
