export type 原著推进状态类型 = '未开始' | '推进中' | '已完成';

export interface 章节时间校准结构 {
    关联分解组: number;
    原始起始时间: string;
    校准后起始时间: string;
    校准来源时间: string;
}

export interface 当前章节结构 {
    标题: string;
    当前分解组: number;
    原著章节标题: string;
    原著推进状态: 原著推进状态类型;
    原著换章条件: string[];
    原著切换说明: string[];
    已完成摘要: string[];
    当前待解问题: string[];
    切章后沉淀要点: string[];
}

export interface 下一章预告结构 {
    标题: string;
    大纲: string[];
    进入条件: string[];
    风险提示: string[];
}

export interface 历史章节结构 {
    标题: string;
    所属章节范围: string;
    所属分解组: number;
    章节总结: string[];
    延续事项: string[];
    关系变化: string[];
    势力变化: string[];
    地点变化: string[];
    资源变化: string[];
    分歧线变化: string[];
    记录时间: string;
}

export interface 剧情系统结构 {
    当前章节: 当前章节结构;
    下一章预告: 下一章预告结构;
    历史卷宗: 历史章节结构[];
    章节时间校准: 章节时间校准结构[];
}
