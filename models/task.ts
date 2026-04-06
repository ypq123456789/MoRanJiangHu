
// 任务与约定系统定义

export type 任务状态 = '进行中' | '可提交' | '已完成' | '已失败';
export type 任务类型 = '主线' | '支线' | '门派' | '奇遇' | '悬赏' | '传闻';

export interface 任务目标 {
    描述: string;           // 任务目标描述
    当前进度: number;
    总需进度: number;
    完成状态: boolean;
}

export interface 任务结构 {
    标题: string;           // 任务标题
    描述: string;           // 任务背景描述
    类型: 任务类型;
    发布人: string;         // 发布者名称
    发布地点: string;       // 地点名
    推荐境界: string;       // 境界要求
    
    // 时间限制 (可选)
    截止时间?: string;      // YYYY:MM:DD:HH:MM
    
    当前状态: 任务状态;
    目标列表: 任务目标[];
    
    // 奖励 (描述性，用于显示)
    奖励描述: string[];     // 奖励描述列表
    
    // AI 辅助字段 (暗线)
    剧情暗线?: string;      // 给AI看的暗线说明
}

export type 约定状态 = '等待中' | '即将到来' | '已履行' | '已违约' | '已作废';
export type 约定性质 = '情感' | '交易' | '赌约' | '复仇' | '承诺';

export interface 约定结构 {
    对象: string;           // 对象名称
    头衔?: string;          // 展示头衔
    性质: 约定性质;
    
    标题: string;           // 约定标题
    誓言内容: string;       // 约定内容
    
    约定地点: string;
    约定时间: string;       // YYYY:MM:DD:HH:MM
    有效时段: number;       // 分钟，例如 60 分钟内到达有效
    
    当前状态: 约定状态;
    
    // 后果描述 (用于UI显示警示玩家)
    履行后果: string;       // "林清月好感度大幅提升，获得【剑宗信物】"
    违约后果: string;       // "林清月将视你为背信弃义之人，关系转为【冷漠】"
    
    背景故事?: string;      // AI上下文
}
