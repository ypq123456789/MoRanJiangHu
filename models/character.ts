
import { 游戏物品 } from './item';
import { 功法结构 } from './kungfu';
import type { NPC图片档案 } from './imageGeneration';
import { 天赋结构, 背景结构 } from '../types';

// 角色相关定义 - 解耦自 types.ts

export interface 角色装备 {
    头部: string; // 物品ID 或 名称
    胸部: string;
    盔甲: string;
    内衬: string;
    腿部: string;
    手部: string; // 护腕/手套
    足部: string; // 鞋子

    主武器: string;
    副武器: string;
    暗器: string;

    背部: string; // 背部挂件/披风/特殊装备
    腰部: string; // 腰带/玉佩/挂饰
    
    坐骑: string;
}

export interface 角色金钱 {
    上层货币: number;
    中层货币: number;
    底层货币: number;
    baseAmount?: number;
    金元宝?: number;
    银子?: number;
    铜钱?: number;
}

export interface 玩家BUFF结构 {
    索引?: number;
    名称: string;
    描述: string;
    效果: string;
    结束时间: string; // YYYY:MM:DD:HH:MM
}

export interface 突破条件结构 {
    索引?: number;
    名称: string;
    描述: string;
    要求: string;
    当前进度: string;
}

export interface 角色技艺 {
    名称: string;
    等级: string;
    熟练度?: number;
    描述?: string;
}

export interface 角色数据结构 {
    姓名: string;
    头像图片URL?: string;
    图片档案?: NPC图片档案;
    最近生图结果?: NPC图片档案['最近生图结果'];
    性别: string;
    年龄: number;
    出生日期: string;  // 格式: N月N日
    外貌: string;      // 角色外貌描述
    性格: string;
    
    称号: string;
    境界: string;
    境界层级: number;
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
    
    // New: Talents and Background
    天赋列表: 天赋结构[];
    出身背景: 背景结构;

    // 门派相关
    所属门派ID: string; // "none" 为江湖散人
    门派职位: string;
    门派贡献: number;
    金钱: 角色金钱;

    // 生存状态
    当前精力: number;
    最大精力: number;
    当前内力: number;
    最大内力: number;
    当前饱腹: number;
    最大饱腹: number;
    当前口渴: number;
    最大口渴: number;

    // 负重系统
    当前负重: number; // 单位: 斤 (实时计算: Σ物品重量*数量)
    最大负重: number; // 有效负重上限：基础最大负重 + 储物袋/储物戒指扩容加成
    基础最大负重?: number; // 不含储物扩容的基础上限，用于避免重复叠加
    储物负重加成?: {
        储物袋: number;
        储物戒指: number;
        总计: number;
    };
    当前坐标X?: number;
    当前坐标Y?: number;

    // 六维属性
    力量: number;
    敏捷: number;
    体质: number;
    根骨: number;
    悟性: number;
    福源: number;
    可分配属性点?: number;

    // 身体部位状态
    头部当前血量: number; 头部最大血量: number; 头部状态: string;
    胸部当前血量: number; 胸部最大血量: number; 胸部状态: string;
    腹部当前血量: number; 腹部最大血量: number; 腹部状态: string;
    左手当前血量: number; 左手最大血量: number; 左手状态: string;
    右手当前血量: number; 右手最大血量: number; 右手状态: string;
    左腿当前血量: number; 左腿最大血量: number; 左腿状态: string;
    右腿当前血量: number; 右腿最大血量: number; 右腿状态: string;

    // 装备 (仅存引用)
    装备: 角色装备;
    
    // 实际物品数据 (扁平化列表)
    物品列表: 游戏物品[];

    // 功法列表
    功法列表: 功法结构[];

    // 生活与江湖技艺
    技艺: 角色技艺[];

    当前经验: number;
    升级经验: number;

    玩家BUFF: 玩家BUFF结构[];
    突破条件: 突破条件结构[];
}
