export interface 剧情任务结构 {
    标题: string;
    任务说明: string;
    计划执行时间: string;
    最早执行时间: string;
    最晚执行时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    执行动作: string[];
    完成判定: string[];
    失败后转移: string[];
    完成后沉淀: string[];
    关联人物: string[];
    关联地点: string[];
    关联势力: string[];
    当前状态: string;
}

export interface 剧情延续事项结构 {
    标题: string;
    延续原因: string[];
    当前状态: string[];
    延续到何时: string;
    后续接续条件: string[];
    终止条件: string[];
}

export interface 剧情待触发事件结构 {
    事件名: string;
    事件说明: string;
    计划触发时间: string;
    最早触发时间: string;
    最晚触发时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    成功结果: string[];
    失败结果: string[];
    当前状态: string;
}

export interface 剧情镜头结构 {
    镜头标题: string;
    镜头内容: string;
    触发时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    关联任务: string[];
    关联人物: string[];
    关联地点: string[];
    沉淀内容: string[];
    当前状态: string;
}

export interface 剧情换章规则结构 {
    本章完成判定: string[];
    允许切章条件: string[];
    禁止切章条件: string[];
    切章后需沉淀内容: string[];
    切章后需清空字段: string[];
    切章后需重建字段: string[];
}

export interface 剧情规划结构 {
    当前章目标: string[];
    当前章任务: 剧情任务结构[];
    跨章延续事项: 剧情延续事项结构[];
    待触发事件: 剧情待触发事件结构[];
    镜头规划: 剧情镜头结构[];
    换章规则: 剧情换章规则结构;
}
