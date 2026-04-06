
// 功法系统定义 (扁平化设计)

export type 功法类型 = '内功' | '外功' | '轻功' | '绝技' | '被动';
export type 功法品质 = '凡品' | '良品' | '上品' | '极品' | '绝世' | '传说';
export type 伤害类型 = '物理' | '内功' | '真实' | '混合';
export type 消耗类型 = '内力' | '精力' | '气血';
export type 目标类型 = '单体' | '全体' | '扇形' | '自身' | '随机';

export interface 技能效果 {
    名称: string;
    触发概率: string;  // 百分比字符串，例如 "35%"
    持续时间: string;  // 带单位字符串，例如 "15分钟"
    数值参数: string;
    生效间隔: string;  // 带单位字符串，例如 "1分钟"
}

export interface 被动修正 {
    属性名: string;
    数值: number;
    类型: '固定值' | '百分比';
}

export interface 功法重数描述结构 {
    重数: number;
    描述: string;
}

export interface 境界特效 {
    解锁重数: number;
    描述: string;
}

export interface 功法结构 {
    ID: string;
    名称: string;
    描述: string;
    类型: 功法类型;
    品质: 功法品质;
    来源: string;

    当前重数: number;
    最高重数: number;
    当前熟练度: number;
    升级经验: number;
    突破条件: string;
    境界限制: string;
    大成方向: string;
    圆满效果: string;

    武器限制: string[];

    消耗类型: 消耗类型;
    消耗数值: number;
    施展耗时: string;  // 带单位字符串
    冷却时间: string;  // 带单位字符串

    基础伤害: number;
    加成属性: string;
    加成系数: number;
    内力系数: number;
    伤害类型: 伤害类型;

    目标类型: 目标类型;
    最大目标数: number;

    重数描述映射: 功法重数描述结构[];
    附带效果: 技能效果[];
    被动修正: 被动修正[];
    境界特效: 境界特效[];
}
