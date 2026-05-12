export type 游戏时间格式 = string;

export interface 地点归属结构 {
    大地点: string;
    中地点: string;
    小地点: string;
}

export interface 地图结构 {
    名称: string;
    坐标: string;
    描述: string;
    归属: 地点归属结构;
    内部建筑: string[];
}

export interface 建筑结构 {
    名称: string;
    描述: string;
    归属: 地点归属结构;
}

export type 地图层级类型 = '大地点' | '中地点' | '小地点' | '具体地点';

export interface 地图坐标点结构 {
    x: number;
    y: number;
}

export type 地图四角坐标结构 = [
    地图坐标点结构,
    地图坐标点结构,
    地图坐标点结构,
    地图坐标点结构
];

export interface 地图层级结构 {
    ID: string;
    名称: string;
    层级: 地图层级类型;
    描述: string;
    归属: 地点归属结构;
    父级ID?: string;
    锚点坐标: 地图坐标点结构;
    网格宽度: number;
    网格高度: number;
    边界四角坐标: 地图四角坐标结构;
    建筑物ID列表: string[];
    道路ID列表: string[];
    人物ID列表: string[];
}

export interface 地图建筑结构 {
    ID: string;
    名称: string;
    描述: string;
    归属: 地点归属结构;
    所在层级ID: string;
    分类: string;
    四角坐标: 地图四角坐标结构;
}

export interface 地图道路结构 {
    ID: string;
    名称: string;
    描述: string;
    归属: 地点归属结构;
    所在层级ID: string;
    路径点: 地图坐标点结构[];
}

export interface 地图人物结构 {
    ID: string;
    名称: string;
    描述: string;
    归属: 地点归属结构;
    所在层级ID: string;
    坐标: 地图坐标点结构;
    关联NPC: string;
    是否当前玩家: boolean;
}

export interface 活跃NPC结构 {
    姓名: string;
    所属势力: string;
    当前位置: string;
    位置路径?: string;
    当前状态: string;
    当前行动: string;
    行动开始时间: 游戏时间格式;
    行动结束时间: 游戏时间格式;
}

export interface 世界待执行事件结构 {
    事件名: string;
    类型: string;
    事件说明: string;
    计划执行时间: 游戏时间格式;
    最早执行时间: 游戏时间格式;
    最晚执行时间: 游戏时间格式;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    执行后影响: string[];
    错过后影响: string[];
    关联人物: string[];
    关联势力: string[];
    关联地点: string[];
    关联分解组: number[];
    关联分歧线: string[];
    当前状态: string;
}

export interface 世界进行中事件结构 {
    事件名: string;
    类型: string;
    事件说明: string;
    开始时间: 游戏时间格式;
    预计结束时间: 游戏时间格式;
    当前进展: string;
    已产生影响: string[];
    关联人物: string[];
    关联势力: string[];
    关联地点: string[];
    关联分解组: number[];
    关联分歧线: string[];
}

export interface 世界已结算事件结构 {
    事件名: string;
    类型: string;
    事件说明: string;
    结算时间: 游戏时间格式;
    事件结果: string[];
    长期影响: string[];
    是否进入史册: boolean;
    关联人物: string[];
    关联势力: string[];
    关联地点: string[];
    关联分解组: number[];
    关联分歧线: string[];
}

export interface 世界镜头结构 {
    镜头标题: string;
    镜头内容: string;
    触发时间: 游戏时间格式;
    触发条件: string[];
    关联人物: string[];
    关联地点: string[];
    关联分解组: number[];
    关联分歧线: string[];
    沉淀内容: string[];
    当前状态: string;
}

export interface 世界史册条目结构 {
    标题: string;
    归档时间: 游戏时间格式;
    归档内容: string[];
    长期影响: string[];
    关联人物: string[];
    关联势力: string[];
    关联地点: string[];
    关联分歧线: string[];
}

// ─── 势力系统 ───────────────────────────────────────────────────────────────

export type 势力类型 = '门派' | '家族' | '商会' | '镖局' | '官府' | '帮派' | '散修联盟' | '其他';
export type 势力关系标签 = '友好' | '中立' | '敌对' | '从属' | '联盟';

export interface 势力库藏物品 {
    名称: string;
    类型: string;
    品质: string;
    描述?: string;
    预置图片URL?: string;
}

export interface 势力结构 {
    ID: string;
    名称: string;
    类型: 势力类型;
    实力等级: number; // 1-10
    地盘归属: string; // 关联地图层级名称
    描述: string;
    代表性物品风格: string; // 如"以剑器和内功心法见长"
    关系网: Record<string, 势力关系标签>; // key 为其他势力 ID
    库藏物品池: 势力库藏物品[];
    当前状态: string;
}

export interface 势力互动事件 {
    ID: string;
    类型: '交易' | '攻杀' | '劫掠' | '联盟' | '围剿' | '互赠' | '竞拍' | '其他';
    参与势力: string[]; // 势力 ID 列表
    事件摘要: string;
    流出物品: 势力库藏物品[];
    发生时间?: 游戏时间格式;
}

export interface 世界数据结构 {
    活跃NPC列表: 活跃NPC结构[];
    待执行事件: 世界待执行事件结构[];
    进行中事件: 世界进行中事件结构[];
    已结算事件: 世界已结算事件结构[];
    世界镜头规划: 世界镜头结构[];
    江湖史册: 世界史册条目结构[];
    地图: 地图结构[];
    建筑: 建筑结构[];
    地图层级: 地图层级结构[];
    地图建筑: 地图建筑结构[];
    地图道路: 地图道路结构[];
    地图人物: 地图人物结构[];
    // 势力系统
    势力列表: 势力结构[];
    势力互动历史: 势力互动事件[];
    拍卖行待投放物品: 势力库藏物品[];
}
