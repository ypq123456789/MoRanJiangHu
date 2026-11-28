

// 门派任务系统与详细定义

const 无门派文本集合 = new Set(['', 'none', '无', '无门派', '无门无派', '尚未加入任何门派', '江湖散人', '散修', '无所属门派']);

export const 是否无门派标识 = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, '') : String(value).trim();
    return 无门派文本集合.has(normalized);
};

export type 门派任务状态 = '可接取' | '进行中' | '已完成' | '已失败' | '已过期';
export type 门派任务类型 = '日常' | '悬赏' | '建设' | '历练';

export interface 门派任务 {
    id: string;
    标题: string;
    描述: string;
    类型: 门派任务类型;
    难度: string; // 展示难度文本，如“1星”/“困难”
    
    // 时间限制 (YYYY:MM:DD:HH:MM)
    发布日期: string;
    截止日期: string;
    刷新日期: string; // 只有日常任务或特定循环任务有此字段
    
    // 奖励
    奖励贡献: number;
    奖励资金: number;
    奖励物品?: string[]; // 物品描述数组，如 ["物品名称 x 数量"]

    当前状态: 门派任务状态;
}

export interface 门派商品 {
    id: string;
    物品名称: string; // 直接使用中文名称
    描述?: string; // 物品描述
    类型: '武学' | '丹药' | '装备' | '材料' | string;
    品质?: string; // 物品品质
    重量?: number; // 物品重量
    兑换价格: number; // 贡献点
    库存: number;
    要求职位: string; // e.g. "内门弟子"
}

export interface 门派藏经 {
    id: string;
    名称: string;
    类型: '功法' | '身法' | '心法' | '杂学' | string;
    品阶: string;
    简介: string;
    要求职位: string;
    要求累计贡献: number;
}

export interface 门派成员简报 {
    id: string; // 保持ID用于唯一索引，但UI显示用以下字段
    姓名: string;
    性别: '男' | '女';
    年龄: number;
    境界: string;
    身份: string;
    简介: string; // 极短的简介
}

export interface 门派战力分布 {
    凡俗?: number;
    入门?: number;
    中坚?: number;
    高手?: number;
    顶尖?: number;
    [key: string]: number | undefined;
}

export interface 门派月俸规则 {
    基础俸禄: number;
    贡献系数: number;
    规模系数: number;
    发放说明: string;
}

// 玩家所属门派的详细结构 (继承自基础势力，但字段更多)
export interface 详细门派结构 {
    ID: string;
    名称: string;
    简介: string;
    门规: string[];
    组织语义?: string;
    组织类型?: string;
    题材组织类型?: string;
    
    // 资源
    门派资金: number;
    门派物资: number;
    建设度: number;
    门派等级?: string;
    门派规模?: string;
    弟子总数?: number;
    战力分布?: 门派战力分布;
    财富评级?: string;
    月俸规则?: 门派月俸规则;
    上次俸禄月份?: string;
    
    // 玩家相关
    玩家职位: string; // 外门弟子, 内门弟子, 真传弟子, 长老, 供奉
    玩家贡献: number;
    累计贡献?: number;
    
    // 动态列表
    任务列表: 门派任务[];
    兑换列表: 门派商品[];
    藏经阁列表?: 门派藏经[];
    
    // 人员表
    重要成员: 门派成员简报[];
}

export const 职位等级排序: Record<string, number> = {
    "杂役弟子": 1,
    "外门弟子": 2,
    "内门弟子": 3,
    "真传弟子": 4,
    "执事": 5,
    "长老": 6,
    "副掌门": 7,
    "掌门": 8,
    "营地成员": 1,
    "外勤成员": 2,
    "巡逻队员": 2,
    "维修工": 2,
    "医疗员": 2,
    "搜救队员": 3,
    "物资协调员": 3,
    "安全骨干": 4,
    "指挥骨干": 5,
    "副负责人": 6,
    "负责人": 7,
    "成员": 1,
    "外勤": 2,
    "技术成员": 2,
    "行政联系人": 2,
    "项目骨干": 4
};
