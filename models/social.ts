
import type { NPC图片档案 } from './imageGeneration';

export type NPC性别 = '男' | '女';

export interface NPC记忆 {
    内容: string;
    时间: string; // 结构化时间戳字符串
}

export interface NPC总结记忆 {
    内容: string;
    时间: string; // [开始时间-结束时间]
    开始时间: string;
    结束时间: string;
    开始索引: number;
    结束索引: number;
    条数: number;
}

export interface NPC关系边 {
    对象姓名: string;
    关系: string; // 当前 NPC 与对象的关系类型
    备注?: string;
}

// 新增：子宫内射/使用记录
export interface 子宫记录 {
    日期: string;      // 发生日期
    描述: string;      // 行为描述 (e.g. "于客栈中被内射...")
    怀孕判定日: string; // 预计进行受孕判定的日期
}

// 新增：子宫档案
export interface 子宫档案 {
    状态: string;       // "未受孕", "受孕中", "妊娠一月" 等
    宫口状态: string;   // "紧致", "微张", "松弛"
    内射记录: 子宫记录[];
}

// 新增：NPC装备结构
export interface NPC装备栏 {
    主武器?: string;
    副武器?: string;
    服装?: string; // 外衣/道袍/裙装
    饰品?: string;
    内衣?: string; // 肚兜/抹胸/胸罩
    内裤?: string; // 亵裤/底裤
    袜饰?: string; // 罗袜/腿环
    鞋履?: string;
}

export interface NPC背包物品 {
    名称: string;
}

export interface NPC结构 {
    id: string;
    姓名: string;
    性别: NPC性别;
    年龄: number;
    生日?: string;
    境界: string;
    身份: string;
    是否在场: boolean; // 是否处于当前场景
    是否队友: boolean; // 是否被编入玩家队伍
    是否主要角色: boolean;
    好感度: number;
    关系状态: string;
    对主角称呼?: string;
    简介: string;
    核心性格特征?: string; // 一句话锚定角色主性格（用于关系演化）
    好感度突破条件?: string; // 下一阶段好感提升的触发条件
    关系突破条件?: string; // 关系状态升级/转折的触发条件
    关系网变量?: NPC关系边[]; // 重要女性角色的关系网变量（谁-和谁-是什么关系）

    // --- 队伍战斗属性 (仅队友强制需要；非队友可省略) ---
    攻击力?: number; 
    防御力?: number;
    上次更新时间?: string; // 数据更新的时间戳/日期字符串

    // --- 生存属性 (仅队友强制需要；非队友可省略) ---
    当前血量?: number;
    最大血量?: number;
    当前精力?: number;
    最大精力?: number;
    当前内力?: number;
    最大内力?: number;

    // --- 装备与物品 (仅队友强制需要；非队友可省略) ---
    当前装备?: NPC装备栏;
    背包?: NPC背包物品[]; // 物品名称数组

    // --- 扁平化：外貌相关 ---
    外貌描写?: string;
    身材描写?: string;
    衣着风格?: string;

    // --- 扁平化：私密相关（新版） ---
    胸部描述?: string; // 应包含胸型/体量 + 乳头乳晕大小与颜色等
    小穴描述?: string; // 应包含入口/内部/容纳尺度/颜色/湿润度等
    屁穴描述?: string; // 应包含颜色/松紧/湿润度/使用痕迹等
    性癖?: string; // 偏好与倾向
    敏感点?: string; // 主要敏感区域

    // --- 子宫/孕产相关 (女性专属) ---
    子宫?: 子宫档案; // 当前子宫档案（内射记录为数组）

    // --- 扁平化：初夜与状态 ---
    是否处女?: boolean;
    初夜夺取者?: string;
    初夜时间?: string;
    初夜描述?: string;

    // 记忆系统
    记忆: NPC记忆[];
    总结记忆?: NPC总结记忆[];

    // 文生图
    图片档案?: NPC图片档案;
    最近生图结果?: NPC图片档案['最近生图结果'];
}
