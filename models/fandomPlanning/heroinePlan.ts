export interface 同人女主阶段推进结构 {
    阶段名: string;
    关联分解组: number[];
    主推女主: string[];
    次推女主: string[];
    关联分歧线: string[];
    阶段目标: string[];
    禁止越级对象: string[];
    完成判定: string[];
    切换条件: string[];
}

export interface 同人女主条目结构 {
    女主姓名: string;
    类型: string;
    关联分解组: number[];
    关联原著关系线: string[];
    保持不变的原著基线: string[];
    当前偏转点: string[];
    所属分歧线: string[];
    当前关系状态: string;
    当前阶段: string;
    已成立事实: string[];
    阶段目标: string[];
    推进方式: string[];
    阻断因素: string[];
    允许突破条件: string[];
    失败后回退: string[];
}

export interface 同人女主互动事件结构 {
    女主姓名: string;
    事件名: string;
    事件说明: string;
    关联分解组: number[];
    关联原著事件: string[];
    关联分歧线: string[];
    计划触发时间: string;
    最早触发时间: string;
    最晚触发时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    成功结果: string[];
    失败结果: string[];
    与主剧情联动: string[];
    当前状态: string;
}

export interface 同人女主镜头结构 {
    女主姓名: string;
    关联分解组: number[];
    镜头标题: string;
    镜头内容: string;
    触发时间: string;
    触发条件: string[];
    关联事件: string[];
    关联分歧线: string[];
    沉淀内容: string[];
    当前状态: string;
}

export interface 同人女主剧情规划结构 {
    阶段推进: 同人女主阶段推进结构[];
    女主条目: 同人女主条目结构[];
    女主互动事件: 同人女主互动事件结构[];
    女主镜头规划: 同人女主镜头结构[];
}
