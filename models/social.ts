
import type { NPC图片档案 } from './imageGeneration';
import type { 角色金钱 } from './character';
import type { CharacterAbilitySystems } from './system';

export type NPC性别 = '男' | '女' | '男娘' | '扶她';

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
    次数?: number;     // 同一事实内累计次数
    是否生理期?: boolean;
    受孕概率?: number;
    父亲姓名?: string;
    判定结果?: '未判定' | '待判定' | '已受孕' | '未受孕' | string;
    受孕时间?: string;
}

export interface 生理周期档案 {
    周期天数: number;
    生理期天数: number;
    基准日期?: string;
    上次开始日期?: string;
}

export interface 妊娠档案 {
    状态: string;
    受孕时间?: string;
    预计生产时间?: string;
    父亲姓名?: string;
    受孕概率?: number;
    来源记录数?: number;
    已生产?: boolean;
    生产时间?: string;
    子嗣ID?: string;
    子嗣姓名?: string;
}

export interface 生产记录 {
    生产时间: string;
    子嗣ID?: string;
    子嗣姓名?: string;
    父亲姓名?: string;
}

// 新增：子宫档案
export interface 子宫档案 {
    状态: string;       // "未受孕", "受孕中", "妊娠一月" 等
    宫口状态: string;   // "紧致", "微张", "松弛"
    生理周期?: 生理周期档案;
    内射记录: 子宫记录[];
    妊娠?: 妊娠档案;
    产后记录?: 生产记录[];
}

export type 亲密行为类型 = '口交' | '肛交' | '阴道交' | '乳交' | '手交' | '足交' | '股交';

export interface 首次亲密记录 {
    类型: 亲密行为类型;
    是否已发生: boolean;
    第一次对象?: string;
    第一次时间?: string;
    第一次描述?: string;
}

export interface 失贞档案 {
    是否失贞: boolean;
    第一次对象?: string;
    第一次时间?: string;
    第一次描述?: string;
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
    ID?: string;
    名称: string;
    类型?: string;
    数量?: number;
    堆叠数量?: number;
    价值?: number;
    品质?: string;
    描述?: string;
}

export interface NPC状态效果 {
    名称: string;
    描述: string;
    效果: string;
    结束时间?: string;
}

export interface NPC技艺 {
    名称: string;
    等级: string;
    熟练度?: number;
    描述?: string;
}

export interface NPC天赋 {
    名称: string;
    描述: string;
    效果: string;
}

export interface NPC出身背景 {
    名称: string;
    描述: string;
    效果: string;
}

export type 名器部位类型 = '胸部' | '小穴' | '屁穴' | '肉棒';
export type 名器品质类型 = '无' | '普通' | '稀有' | '极品' | '传说';

export interface 名器效果结构 {
    判定修正?: number; // 亲密、魅力、诱惑、双修等相关判定的建议修正
    魅力修正?: number;
    亲密推进修正?: number;
    双修收益修正?: number;
    风险修正?: number; // 易失控、惹祸、反噬、关系误判等风险
    标签?: string[];
    说明: string;
}

export interface 名器档案条目 {
    部位: 名器部位类型;
    名称: string; // 无名器时写“无名器”或“无对应名器”
    品质: 名器品质类型;
    来源世界书?: string;
    稳定描述: string;
    效果: 名器效果结构;
}

export interface NPC结构 {
    id: string;
    姓名: string; // 真实姓名：档案真值，正文默认不直接暴露
    叙事名称?: string; // 正文使用的称呼（如「少年」「白衣剑客」）；与真实姓名不同时道友录默认打码
    曾用名?: string[];
    性别: NPC性别;
    年龄: number;
    外观年龄?: number | string;
    生日?: string;
    境界: string;
    能力体系?: CharacterAbilitySystems;
    灵根?: string;
    灵根资质?: string;
    当前灵力?: number;
    最大灵力?: number;
    当前神识?: number;
    最大神识?: number;
    丹田状态?: string;
    道基状态?: string;
    心魔值?: number;
    功德?: number;
    业力?: number;
    身份: string;
    当前位置?: string; // NPC 当前所在的短地点名，用于地图与再登场判断
    当前地点?: string; // 兼容别名，优先与当前位置保持一致
    位置路径?: string; // 完整地点链，如“大地点 > 中地点 > 小地点 > 具体地点”
    当前任务?: string; // 已接受但尚未完成/取消的当前任务
    行动意图?: string; // NPC 下一步行动或正在执行的意图
    待执行指令?: string; // 玩家交代给 NPC 的待执行事项
    指令来源?: string; // 指令发出者，如“玩家/主角/某 NPC”
    指令时间?: string; // 指令成立的游戏内时间
    预期汇合地点?: string; // 离场后预计返回或汇合的位置
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
    天赋列表?: NPC天赋[];
    出身背景?: NPC出身背景;

    // --- 基础属性（所有 NPC 都应补齐，与主角六维同口径） ---
    力量?: number;
    敏捷?: number;
    体质?: number;
    根骨?: number;
    悟性?: number;
    福源?: number;
    境界层级?: number;

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

    // --- 身体部位状态（所有 NPC 与主角同口径；用于伤势、战斗和医治判定） ---
    头部当前血量?: number; 头部最大血量?: number; 头部状态?: string;
    胸部当前血量?: number; 胸部最大血量?: number; 胸部状态?: string;
    腹部当前血量?: number; 腹部最大血量?: number; 腹部状态?: string;
    左手当前血量?: number; 左手最大血量?: number; 左手状态?: string;
    右手当前血量?: number; 右手最大血量?: number; 右手状态?: string;
    左腿当前血量?: number; 左腿最大血量?: number; 左腿状态?: string;
    右腿当前血量?: number; 右腿最大血量?: number; 右腿状态?: string;

    // --- 装备、物品与状态（运行时会为所有 NPC 补齐最小结构） ---
    当前装备?: NPC装备栏;
    背包?: NPC背包物品[];
    金钱?: Partial<角色金钱>;
    BUFF?: NPC状态效果[];
    DEBUFF?: NPC状态效果[];
    技艺?: NPC技艺[];

    // --- 扁平化：外貌相关 ---
    外貌描写?: string;
    身材描写?: string;
    衣着风格?: string;

    // --- 扁平化：私密相关（新版） ---
    胸部描述?: string; // 应包含胸型/体量 + 乳头乳晕大小与颜色等
    小穴描述?: string; // 应包含入口/内部/容纳尺度/颜色/湿润度等
    屁穴描述?: string; // 应包含颜色/松紧/湿润度/使用痕迹等
    肉棒描述?: string; // 男性/男娘主要角色的私密常态档案
    男娘设定?: string; // 男性主要角色可选的女性化气质、衣着与身体表达设定
    扶她设定?: string; // 扶她/半男娘/跨性别设定的长期档案锚点，和男娘设定同级
    名器档案?: 名器档案条目[]; // 结构化名器机制，供判定、关系推进、生图和叙事一致性读取
    性癖?: string; // 偏好与倾向
    敏感点?: string; // 主要敏感区域
    亲密边界档案?: {
        基准矜持度?: number; // 0-100，越高越重视名声、节奏与边界
        ASD基准值?: number; // 0-100，反轻浮/名声自保基础值，越高越容易阻止过快性推进
        欲望基准?: number; // 0-100，越高越容易被私密氛围调动，但仍需要自愿
        场合敏感度?: number; // 0-100，越高越排斥公开/危险/不合时宜场景
        公开场合克制?: boolean;
        关系门槛?: Record<string, number>; // 行为类型 -> 建议最低好感度
        ASD部位阈值?: Record<string, number>; // 行为/部位 -> 需要越过的反轻浮阈值
        部位边界?: Record<string, { 阻止力度?: number; ASD值?: number; 替代建议?: string[]; 说明?: string }>;
        越界反应?: string;
    };

    // --- 子宫/孕产相关 (女性专属) ---
    子宫?: 子宫档案; // 当前子宫档案（内射记录为数组）

    // --- 扁平化：初夜与状态 ---
    是否处女?: boolean;
    初夜夺取者?: string;
    初夜时间?: string;
    初夜描述?: string;
    失贞档案?: 失贞档案;
    首次亲密记录?: 首次亲密记录[];

    // 记忆系统
    记忆: NPC记忆[];
    总结记忆?: NPC总结记忆[];

    // 文生图
     图片档案?: NPC图片档案;
     最近生图结果?: NPC图片档案['最近生图结果'];
      性转记录?: string; // 历史追溯字段，记录曾经发生的性转事实

    // --- 元数据 ---
    来源?: string; // NPC 来源（如 "原创"、"同人"、"世界书" 等）
    保留开局伙伴设定属性?: boolean; // 开局伙伴标记，防止运行时覆盖初始设定
    头像图片URL?: string; // 头像图片地址
    立绘图片URL?: string; // 立绘图片地址
}
