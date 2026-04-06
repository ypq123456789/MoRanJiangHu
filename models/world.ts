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

export interface 活跃NPC结构 {
    姓名: string;
    所属势力: string;
    当前位置: string;
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

export interface 世界数据结构 {
    活跃NPC列表: 活跃NPC结构[];
    待执行事件: 世界待执行事件结构[];
    进行中事件: 世界进行中事件结构[];
    已结算事件: 世界已结算事件结构[];
    世界镜头规划: 世界镜头结构[];
    江湖史册: 世界史册条目结构[];
    地图: 地图结构[];
    建筑: 建筑结构[];
}
