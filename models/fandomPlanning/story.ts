export interface 同人对齐信息结构 {
    当前分解组: number;
    当前章节范围: string;
    当前章节标题: string[];
    当前承接方式: string;
    当前原著状态: string[];
    当前已形成偏转: string[];
}

export interface 同人剧情任务结构 {
    标题: string;
    任务说明: string;
    关联分解组: number[];
    关联原著事件: string[];
    保持不变的原著基线: string[];
    当前偏转点: string[];
    计划执行时间: string;
    最早执行时间: string;
    最晚执行时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    执行动作: string[];
    完成判定: string[];
    偏转后果: string[];
    未偏转后果: string[];
    完成后沉淀: string[];
    当前状态: string;
}

export interface 同人分歧线结构 {
    分歧线名: string;
    起点事件: string;
    关联分解组: number[];
    偏转原因: string[];
    与原著不同之处: string[];
    当前阶段: string;
    影响范围: string[];
    下一步扩大条件: string[];
    回收条件: string[];
    当前状态: string;
}

export interface 同人待触发事件结构 {
    事件名: string;
    事件说明: string;
    关联分解组: number[];
    关联原著事件: string[];
    计划触发时间: string;
    最早触发时间: string;
    最晚触发时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    触发后影响: string[];
    错过后影响: string[];
    若偏转则转入哪条分歧线: string[];
    当前状态: string;
}

export interface 同人镜头结构 {
    镜头标题: string;
    关联分解组: number[];
    镜头内容: string;
    触发时间: string;
    触发条件: string[];
    关联人物: string[];
    关联地点: string[];
    关联分歧线: string[];
    作用: string[];
    当前状态: string;
}

export interface 同人换组规则结构 {
    当前组完成判定: string[];
    下一组进入条件: string[];
    禁止换组条件: string[];
    换组后沉淀内容: string[];
    换组后需清空字段: string[];
    换组后需重建字段: string[];
}

export interface 同人剧情规划结构 {
    当前对齐信息: 同人对齐信息结构;
    当前章目标: string[];
    当前章任务: 同人剧情任务结构[];
    分歧线: 同人分歧线结构[];
    待触发事件: 同人待触发事件结构[];
    镜头规划: 同人镜头结构[];
    换组规则: 同人换组规则结构;
}
