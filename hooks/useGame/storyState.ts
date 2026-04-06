import type {
    WorldGenConfig,
    世界数据结构,
    战斗状态结构,
    详细门派结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    环境信息结构,
    聊天记录结构,
    角色数据结构,
    记忆系统结构
} from '../../types';

export type 开场命令基态 = {
    角色: 角色数据结构;
    环境: 环境信息结构;
    社交: any[];
    世界: 世界数据结构;
    战斗: 战斗状态结构;
    玩家门派: 详细门派结构;
    任务列表: any[];
    约定列表: any[];
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
};

const 取文本 = (value: any, fallback = ''): string => (
    typeof value === 'string' ? value.trim() : fallback
);

const 取数字 = (value: any, fallback = 0): number => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const 取布尔 = (value: any, fallback = false): boolean => (
    typeof value === 'boolean' ? value : fallback
);

const 取字符串数组 = (value: any): string[] => (
    Array.isArray(value)
        ? value
            .map((item) => 取文本(item))
            .filter(Boolean)
        : []
);

const 规范化章节时间校准 = (value: any): 剧情系统结构['章节时间校准'] => (
    Array.isArray(value)
        ? value
            .map((item: any) => ({
                关联分解组: Math.max(1, 取数字(item?.关联分解组, 1)),
                原始起始时间: 取文本(item?.原始起始时间),
                校准后起始时间: 取文本(item?.校准后起始时间),
                校准来源时间: 取文本(item?.校准来源时间)
            }))
            .filter((item) => item.原始起始时间 || item.校准后起始时间)
        : []
);

const 取数字数组 = (value: any): number[] => (
    Array.isArray(value)
        ? value
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item))
        : []
);

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const 创建开场空白角色 = (): 角色数据结构 => ({
    姓名: '',
    头像图片URL: '',
    性别: '男',
    年龄: 16,
    出生日期: '',
    外貌: '',
    性格: '',
    称号: '',
    境界: '',
    境界层级: 1,
    天赋列表: [],
    出身背景: { 名称: '', 描述: '', 效果: '' },
    所属门派ID: 'none',
    门派职位: '无',
    门派贡献: 0,
    金钱: { 金元宝: 0, 银子: 0, 铜钱: 0 },
    当前精力: 0,
    最大精力: 0,
    当前内力: 0,
    最大内力: 0,
    当前饱腹: 0,
    最大饱腹: 0,
    当前口渴: 0,
    最大口渴: 0,
    当前负重: 0,
    最大负重: 0,
    当前坐标X: 0,
    当前坐标Y: 0,
    力量: 0,
    敏捷: 0,
    体质: 0,
    根骨: 0,
    悟性: 0,
    福源: 0,
    头部当前血量: 0,
    头部最大血量: 0,
    头部状态: '',
    胸部当前血量: 0,
    胸部最大血量: 0,
    胸部状态: '',
    腹部当前血量: 0,
    腹部最大血量: 0,
    腹部状态: '',
    左手当前血量: 0,
    左手最大血量: 0,
    左手状态: '',
    右手当前血量: 0,
    右手最大血量: 0,
    右手状态: '',
    左腿当前血量: 0,
    左腿最大血量: 0,
    左腿状态: '',
    右腿当前血量: 0,
    右腿最大血量: 0,
    右腿状态: '',
    装备: {
        头部: '无',
        胸部: '无',
        盔甲: '无',
        内衬: '无',
        腿部: '无',
        手部: '无',
        足部: '无',
        主武器: '无',
        副武器: '无',
        暗器: '无',
        背部: '无',
        腰部: '无',
        坐骑: '无'
    },
    物品列表: [],
    功法列表: [],
    当前经验: 0,
    升级经验: 0,
    玩家BUFF: [],
    突破条件: []
});

export const 创建空门派状态 = (): 详细门派结构 => ({
    ID: 'none',
    名称: '无门无派',
    简介: '尚未加入任何门派。',
    门规: [],
    门派资金: 0,
    门派物资: 0,
    建设度: 0,
    玩家职位: '无',
    玩家贡献: 0,
    任务列表: [],
    兑换列表: [],
    重要成员: []
});

export const 创建占位门派状态 = (charData: 角色数据结构): 详细门派结构 => {
    if (!charData?.所属门派ID || charData.所属门派ID === 'none') {
        return 创建空门派状态();
    }
    return {
        ...创建空门派状态(),
        ID: charData.所属门派ID,
        玩家职位: 取文本(charData.门派职位, '成员'),
        玩家贡献: 取数字(charData.门派贡献)
    };
};

export const 规范化门派状态 = (raw?: any): 详细门派结构 => {
    const base = 创建空门派状态();
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        ID: 取文本(source?.ID, base.ID),
        名称: 取文本(source?.名称, base.名称),
        简介: typeof source?.简介 === 'string' ? source.简介 : base.简介,
        门规: Array.isArray(source?.门规) ? source.门规 : [],
        门派资金: 取数字(source?.门派资金, base.门派资金),
        门派物资: 取数字(source?.门派物资, base.门派物资),
        建设度: 取数字(source?.建设度, base.建设度),
        玩家职位: 取文本(source?.玩家职位, base.玩家职位),
        玩家贡献: 取数字(source?.玩家贡献, base.玩家贡献),
        任务列表: Array.isArray(source?.任务列表) ? source.任务列表 : [],
        兑换列表: Array.isArray(source?.兑换列表) ? source.兑换列表 : [],
        重要成员: Array.isArray(source?.重要成员) ? source.重要成员 : []
    };
};

export const 创建开场空白环境 = (): 环境信息结构 => ({
    时间: '1:01:01:00:00',
    大地点: '',
    中地点: '',
    小地点: '',
    具体地点: '',
    节日: null,
    天气: { 天气: '', 结束日期: '1:01:01:00:00' },
    环境变量: []
});

const 规范化地点归属 = (raw?: any) => ({
    大地点: 取文本(raw?.大地点),
    中地点: 取文本(raw?.中地点),
    小地点: 取文本(raw?.小地点)
});

export const 创建开场空白世界 = (): 世界数据结构 => ({
    活跃NPC列表: [],
    待执行事件: [],
    进行中事件: [],
    已结算事件: [],
    世界镜头规划: [],
    江湖史册: [],
    地图: [],
    建筑: []
});

export const 规范化世界状态 = (raw?: any): 世界数据结构 => {
    const world = raw && typeof raw === 'object' ? raw : {};

    return {
        活跃NPC列表: Array.isArray(world?.活跃NPC列表)
            ? world.活跃NPC列表
                .map((item: any) => ({
                    姓名: 取文本(item?.姓名),
                    所属势力: 取文本(item?.所属势力),
                    当前位置: 取文本(item?.当前位置),
                    当前状态: 取文本(item?.当前状态),
                    当前行动: 取文本(item?.当前行动),
                    行动开始时间: 取文本(item?.行动开始时间),
                    行动结束时间: 取文本(item?.行动结束时间)
                }))
                .filter((item) => item.姓名 || item.当前状态 || item.当前行动)
            : [],
        待执行事件: Array.isArray(world?.待执行事件)
            ? world.待执行事件
                .map((item: any) => ({
                    事件名: 取文本(item?.事件名),
                    类型: 取文本(item?.类型),
                    事件说明: 取文本(item?.事件说明),
                    计划执行时间: 取文本(item?.计划执行时间),
                    最早执行时间: 取文本(item?.最早执行时间),
                    最晚执行时间: 取文本(item?.最晚执行时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    执行后影响: 取字符串数组(item?.执行后影响),
                    错过后影响: 取字符串数组(item?.错过后影响),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联势力: 取字符串数组(item?.关联势力),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.事件名 || item.事件说明)
            : [],
        进行中事件: Array.isArray(world?.进行中事件)
            ? world.进行中事件
                .map((item: any) => ({
                    事件名: 取文本(item?.事件名),
                    类型: 取文本(item?.类型),
                    事件说明: 取文本(item?.事件说明),
                    开始时间: 取文本(item?.开始时间),
                    预计结束时间: 取文本(item?.预计结束时间),
                    当前进展: 取文本(item?.当前进展),
                    已产生影响: 取字符串数组(item?.已产生影响),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联势力: 取字符串数组(item?.关联势力),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联分歧线: 取字符串数组(item?.关联分歧线)
                }))
                .filter((item) => item.事件名 || item.事件说明)
            : [],
        已结算事件: Array.isArray(world?.已结算事件)
            ? world.已结算事件
                .map((item: any) => ({
                    事件名: 取文本(item?.事件名),
                    类型: 取文本(item?.类型),
                    事件说明: 取文本(item?.事件说明),
                    结算时间: 取文本(item?.结算时间),
                    事件结果: 取字符串数组(item?.事件结果),
                    长期影响: 取字符串数组(item?.长期影响),
                    是否进入史册: 取布尔(item?.是否进入史册),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联势力: 取字符串数组(item?.关联势力),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联分歧线: 取字符串数组(item?.关联分歧线)
                }))
                .filter((item) => item.事件名 || item.事件说明)
            : [],
        世界镜头规划: Array.isArray(world?.世界镜头规划)
            ? world.世界镜头规划
                .map((item: any) => ({
                    镜头标题: 取文本(item?.镜头标题),
                    镜头内容: 取文本(item?.镜头内容),
                    触发时间: 取文本(item?.触发时间),
                    触发条件: 取字符串数组(item?.触发条件),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    沉淀内容: 取字符串数组(item?.沉淀内容),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.镜头标题 || item.镜头内容)
            : [],
        江湖史册: Array.isArray(world?.江湖史册)
            ? world.江湖史册
                .map((item: any) => ({
                    标题: 取文本(item?.标题),
                    归档时间: 取文本(item?.归档时间),
                    归档内容: 取字符串数组(item?.归档内容),
                    长期影响: 取字符串数组(item?.长期影响),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联势力: 取字符串数组(item?.关联势力),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分歧线: 取字符串数组(item?.关联分歧线)
                }))
                .filter((item) => item.标题 || item.归档内容.length > 0)
            : [],
        地图: Array.isArray(world?.地图)
            ? world.地图
                .map((item: any) => ({
                    名称: 取文本(item?.名称),
                    坐标: 取文本(item?.坐标),
                    描述: 取文本(item?.描述),
                    归属: 规范化地点归属(item?.归属),
                    内部建筑: 取字符串数组(item?.内部建筑)
                }))
                .filter((item) => item.名称 || item.描述)
            : [],
        建筑: Array.isArray(world?.建筑)
            ? world.建筑
                .map((item: any) => ({
                    名称: 取文本(item?.名称),
                    描述: 取文本(item?.描述),
                    归属: 规范化地点归属(item?.归属)
                }))
                .filter((item) => item.名称 || item.描述)
            : []
    };
};

export const 创建开场空白战斗 = (): 战斗状态结构 => ({
    是否战斗中: false,
    敌方: []
});

const 规范化敌方条目 = (rawEnemy: any): 战斗状态结构['敌方'][number] => ({
    名字: 取文本(rawEnemy?.名字),
    境界: 取文本(rawEnemy?.境界),
    简介: 取文本(rawEnemy?.简介),
    技能: 取字符串数组(rawEnemy?.技能),
    战斗力: 取数字(rawEnemy?.战斗力),
    防御力: 取数字(rawEnemy?.防御力),
    当前血量: 取数字(rawEnemy?.当前血量),
    最大血量: 取数字(rawEnemy?.最大血量),
    当前精力: 取数字(rawEnemy?.当前精力),
    最大精力: 取数字(rawEnemy?.最大精力),
    当前内力: 取数字(rawEnemy?.当前内力),
    最大内力: 取数字(rawEnemy?.最大内力)
});

export const 规范化战斗状态 = (raw?: any): 战斗状态结构 => {
    const battle = raw && typeof raw === 'object' ? raw : {};
    return {
        是否战斗中: battle?.是否战斗中 === true,
        敌方: Array.isArray(battle?.敌方)
            ? battle.敌方.map(规范化敌方条目).filter((item) => item.名字 || item.简介)
            : []
    };
};

export const 创建开场空白剧情 = (): 剧情系统结构 => ({
    当前章节: {
        标题: '',
        当前分解组: 1,
        原著章节标题: '',
        原著推进状态: '未开始',
        原著换章条件: [],
        原著切换说明: [],
        已完成摘要: [],
        当前待解问题: [],
        切章后沉淀要点: []
    },
    下一章预告: {
        标题: '',
        大纲: [],
        进入条件: [],
        风险提示: []
    },
    历史卷宗: [],
    章节时间校准: []
});

export const 规范化剧情状态 = (raw?: any): 剧情系统结构 => {
    const story = raw && typeof raw === 'object' ? raw : {};
    const chapter = story?.当前章节 && typeof story.当前章节 === 'object' ? story.当前章节 : {};
    const preview = story?.下一章预告 && typeof story.下一章预告 === 'object' ? story.下一章预告 : {};
    return {
        当前章节: {
            标题: 取文本(chapter?.标题),
            当前分解组: Math.max(1, 取数字(chapter?.当前分解组, 1)),
            原著章节标题: 取文本(chapter?.原著章节标题),
            原著推进状态: chapter?.原著推进状态 === '已完成'
                ? '已完成'
                : chapter?.原著推进状态 === '推进中'
                    ? '推进中'
                    : '未开始',
            原著换章条件: 取字符串数组(chapter?.原著换章条件),
            原著切换说明: 取字符串数组(chapter?.原著切换说明),
            已完成摘要: 取字符串数组(chapter?.已完成摘要),
            当前待解问题: 取字符串数组(chapter?.当前待解问题),
            切章后沉淀要点: 取字符串数组(chapter?.切章后沉淀要点)
        },
        下一章预告: {
            标题: 取文本(preview?.标题),
            大纲: 取字符串数组(preview?.大纲),
            进入条件: 取字符串数组(preview?.进入条件),
            风险提示: 取字符串数组(preview?.风险提示)
        },
        历史卷宗: Array.isArray(story?.历史卷宗)
            ? story.历史卷宗
                .map((item: any) => ({
                    标题: 取文本(item?.标题),
                    所属章节范围: 取文本(item?.所属章节范围),
                    所属分解组: Math.max(1, 取数字(item?.所属分解组, 1)),
                    章节总结: 取字符串数组(item?.章节总结),
                    延续事项: 取字符串数组(item?.延续事项),
                    关系变化: 取字符串数组(item?.关系变化),
                    势力变化: 取字符串数组(item?.势力变化),
                    地点变化: 取字符串数组(item?.地点变化),
                    资源变化: 取字符串数组(item?.资源变化),
                    分歧线变化: 取字符串数组(item?.分歧线变化),
                    记录时间: 取文本(item?.记录时间)
                }))
                .filter((item) => item.标题 || item.章节总结.length > 0)
            : [],
        章节时间校准: 规范化章节时间校准(story?.章节时间校准)
    };
};

export const 创建空剧情规划 = (): 剧情规划结构 => ({
    当前章目标: [],
    当前章任务: [],
    跨章延续事项: [],
    待触发事件: [],
    镜头规划: [],
    换章规则: {
        本章完成判定: [],
        允许切章条件: [],
        禁止切章条件: [],
        切章后需沉淀内容: [],
        切章后需清空字段: [],
        切章后需重建字段: []
    }
});

export const 规范化剧情规划状态 = (raw?: any): 剧情规划结构 => {
    const plan = raw && typeof raw === 'object' ? raw : {};
    const chapterRule = plan?.换章规则 && typeof plan.换章规则 === 'object' ? plan.换章规则 : {};
    return {
        当前章目标: 取字符串数组(plan?.当前章目标),
        当前章任务: Array.isArray(plan?.当前章任务)
            ? plan.当前章任务
                .map((item: any) => ({
                    标题: 取文本(item?.标题),
                    任务说明: 取文本(item?.任务说明),
                    计划执行时间: 取文本(item?.计划执行时间),
                    最早执行时间: 取文本(item?.最早执行时间),
                    最晚执行时间: 取文本(item?.最晚执行时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    执行动作: 取字符串数组(item?.执行动作),
                    完成判定: 取字符串数组(item?.完成判定),
                    失败后转移: 取字符串数组(item?.失败后转移),
                    完成后沉淀: 取字符串数组(item?.完成后沉淀),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联势力: 取字符串数组(item?.关联势力),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.标题 || item.任务说明)
            : [],
        跨章延续事项: Array.isArray(plan?.跨章延续事项)
            ? plan.跨章延续事项
                .map((item: any) => ({
                    标题: 取文本(item?.标题),
                    延续原因: 取字符串数组(item?.延续原因),
                    当前状态: 取字符串数组(item?.当前状态),
                    延续到何时: 取文本(item?.延续到何时),
                    后续接续条件: 取字符串数组(item?.后续接续条件),
                    终止条件: 取字符串数组(item?.终止条件)
                }))
                .filter((item) => item.标题 || item.当前状态.length > 0)
            : [],
        待触发事件: Array.isArray(plan?.待触发事件)
            ? plan.待触发事件
                .map((item: any) => ({
                    事件名: 取文本(item?.事件名),
                    事件说明: 取文本(item?.事件说明),
                    计划触发时间: 取文本(item?.计划触发时间),
                    最早触发时间: 取文本(item?.最早触发时间),
                    最晚触发时间: 取文本(item?.最晚触发时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    成功结果: 取字符串数组(item?.成功结果),
                    失败结果: 取字符串数组(item?.失败结果),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.事件名 || item.事件说明)
            : [],
        镜头规划: Array.isArray(plan?.镜头规划)
            ? plan.镜头规划
                .map((item: any) => ({
                    镜头标题: 取文本(item?.镜头标题),
                    镜头内容: 取文本(item?.镜头内容),
                    触发时间: 取文本(item?.触发时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    关联任务: 取字符串数组(item?.关联任务),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联地点: 取字符串数组(item?.关联地点),
                    沉淀内容: 取字符串数组(item?.沉淀内容),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.镜头标题 || item.镜头内容)
            : [],
        换章规则: {
            本章完成判定: 取字符串数组(chapterRule?.本章完成判定),
            允许切章条件: 取字符串数组(chapterRule?.允许切章条件),
            禁止切章条件: 取字符串数组(chapterRule?.禁止切章条件),
            切章后需沉淀内容: 取字符串数组(chapterRule?.切章后需沉淀内容),
            切章后需清空字段: 取字符串数组(chapterRule?.切章后需清空字段),
            切章后需重建字段: 取字符串数组(chapterRule?.切章后需重建字段)
        }
    };
};

export const 创建空女主剧情规划 = (): 女主剧情规划结构 => ({
    阶段推进: [],
    女主条目: [],
    女主互动事件: [],
    女主镜头规划: []
});

export const 规范化女主剧情规划状态 = (raw?: any): 女主剧情规划结构 | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const plan = raw;
    return {
        阶段推进: Array.isArray(plan?.阶段推进)
            ? plan.阶段推进
                .map((item: any) => ({
                    阶段名: 取文本(item?.阶段名),
                    阶段目标: 取字符串数组(item?.阶段目标),
                    主推女主: 取字符串数组(item?.主推女主),
                    次推女主: 取字符串数组(item?.次推女主),
                    禁止越级对象: 取字符串数组(item?.禁止越级对象),
                    关联剧情任务: 取字符串数组(item?.关联剧情任务),
                    阶段完成判定: 取字符串数组(item?.阶段完成判定),
                    切换条件: 取字符串数组(item?.切换条件)
                }))
                .filter((item) => item.阶段名 || item.阶段目标.length > 0)
            : [],
        女主条目: Array.isArray(plan?.女主条目)
            ? plan.女主条目
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    类型: 取文本(item?.类型),
                    当前关系状态: 取文本(item?.当前关系状态),
                    当前阶段: 取文本(item?.当前阶段),
                    已成立事实: 取字符串数组(item?.已成立事实),
                    阶段目标: 取字符串数组(item?.阶段目标),
                    推进方式: 取字符串数组(item?.推进方式),
                    阻断因素: 取字符串数组(item?.阻断因素),
                    允许突破条件: 取字符串数组(item?.允许突破条件),
                    失败后回退: 取字符串数组(item?.失败后回退)
                }))
                .filter((item) => item.女主姓名)
            : [],
        女主互动事件: Array.isArray(plan?.女主互动事件)
            ? plan.女主互动事件
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    事件名: 取文本(item?.事件名),
                    事件说明: 取文本(item?.事件说明),
                    计划触发时间: 取文本(item?.计划触发时间),
                    最早触发时间: 取文本(item?.最早触发时间),
                    最晚触发时间: 取文本(item?.最晚触发时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    成功结果: 取字符串数组(item?.成功结果),
                    失败结果: 取字符串数组(item?.失败结果),
                    关联剧情任务: 取字符串数组(item?.关联剧情任务),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.女主姓名 || item.事件名)
            : [],
        女主镜头规划: Array.isArray(plan?.女主镜头规划)
            ? plan.女主镜头规划
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    镜头标题: 取文本(item?.镜头标题),
                    镜头内容: 取文本(item?.镜头内容),
                    触发时间: 取文本(item?.触发时间),
                    触发条件: 取字符串数组(item?.触发条件),
                    关联事件: 取字符串数组(item?.关联事件),
                    关联剧情任务: 取字符串数组(item?.关联剧情任务),
                    沉淀内容: 取字符串数组(item?.沉淀内容),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.女主姓名 || item.镜头标题)
            : []
    };
};

export const 创建空同人剧情规划 = (): 同人剧情规划结构 => ({
    当前对齐信息: {
        当前分解组: 1,
        当前章节范围: '',
        当前章节标题: [],
        当前承接方式: '',
        当前原著状态: [],
        当前已形成偏转: []
    },
    当前章目标: [],
    当前章任务: [],
    分歧线: [],
    待触发事件: [],
    镜头规划: [],
    换组规则: {
        当前组完成判定: [],
        下一组进入条件: [],
        禁止换组条件: [],
        换组后沉淀内容: [],
        换组后需清空字段: [],
        换组后需重建字段: []
    }
});

export const 规范化同人剧情规划状态 = (raw?: any): 同人剧情规划结构 | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const plan = raw;
    const align = plan?.当前对齐信息 && typeof plan.当前对齐信息 === 'object' ? plan.当前对齐信息 : {};
    const switchRule = plan?.换组规则 && typeof plan.换组规则 === 'object' ? plan.换组规则 : {};
    return {
        当前对齐信息: {
            当前分解组: Math.max(1, 取数字(align?.当前分解组, 1)),
            当前章节范围: 取文本(align?.当前章节范围),
            当前章节标题: 取字符串数组(align?.当前章节标题),
            当前承接方式: 取文本(align?.当前承接方式),
            当前原著状态: 取字符串数组(align?.当前原著状态),
            当前已形成偏转: 取字符串数组(align?.当前已形成偏转)
        },
        当前章目标: 取字符串数组(plan?.当前章目标),
        当前章任务: Array.isArray(plan?.当前章任务)
            ? plan.当前章任务
                .map((item: any) => ({
                    标题: 取文本(item?.标题),
                    任务说明: 取文本(item?.任务说明),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联原著事件: 取字符串数组(item?.关联原著事件),
                    保持不变的原著基线: 取字符串数组(item?.保持不变的原著基线),
                    当前偏转点: 取字符串数组(item?.当前偏转点),
                    计划执行时间: 取文本(item?.计划执行时间),
                    最早执行时间: 取文本(item?.最早执行时间),
                    最晚执行时间: 取文本(item?.最晚执行时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    执行动作: 取字符串数组(item?.执行动作),
                    完成判定: 取字符串数组(item?.完成判定),
                    偏转后果: 取字符串数组(item?.偏转后果),
                    未偏转后果: 取字符串数组(item?.未偏转后果),
                    完成后沉淀: 取字符串数组(item?.完成后沉淀),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.标题 || item.任务说明)
            : [],
        分歧线: Array.isArray(plan?.分歧线)
            ? plan.分歧线
                .map((item: any) => ({
                    分歧线名: 取文本(item?.分歧线名),
                    起点事件: 取文本(item?.起点事件),
                    关联分解组: 取数字数组(item?.关联分解组),
                    偏转原因: 取字符串数组(item?.偏转原因),
                    与原著不同之处: 取字符串数组(item?.与原著不同之处),
                    当前阶段: 取文本(item?.当前阶段),
                    影响范围: 取字符串数组(item?.影响范围),
                    下一步扩大条件: 取字符串数组(item?.下一步扩大条件),
                    回收条件: 取字符串数组(item?.回收条件),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.分歧线名 || item.起点事件)
            : [],
        待触发事件: Array.isArray(plan?.待触发事件)
            ? plan.待触发事件
                .map((item: any) => ({
                    事件名: 取文本(item?.事件名),
                    事件说明: 取文本(item?.事件说明),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联原著事件: 取字符串数组(item?.关联原著事件),
                    计划触发时间: 取文本(item?.计划触发时间),
                    最早触发时间: 取文本(item?.最早触发时间),
                    最晚触发时间: 取文本(item?.最晚触发时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    触发后影响: 取字符串数组(item?.触发后影响),
                    错过后影响: 取字符串数组(item?.错过后影响),
                    若偏转则转入哪条分歧线: 取字符串数组(item?.若偏转则转入哪条分歧线),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.事件名 || item.事件说明)
            : [],
        镜头规划: Array.isArray(plan?.镜头规划)
            ? plan.镜头规划
                .map((item: any) => ({
                    镜头标题: 取文本(item?.镜头标题),
                    关联分解组: 取数字数组(item?.关联分解组),
                    镜头内容: 取文本(item?.镜头内容),
                    触发时间: 取文本(item?.触发时间),
                    触发条件: 取字符串数组(item?.触发条件),
                    关联人物: 取字符串数组(item?.关联人物),
                    关联地点: 取字符串数组(item?.关联地点),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    作用: 取字符串数组(item?.作用),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.镜头标题 || item.镜头内容)
            : [],
        换组规则: {
            当前组完成判定: 取字符串数组(switchRule?.当前组完成判定),
            下一组进入条件: 取字符串数组(switchRule?.下一组进入条件),
            禁止换组条件: 取字符串数组(switchRule?.禁止换组条件),
            换组后沉淀内容: 取字符串数组(switchRule?.换组后沉淀内容),
            换组后需清空字段: 取字符串数组(switchRule?.换组后需清空字段),
            换组后需重建字段: 取字符串数组(switchRule?.换组后需重建字段)
        }
    };
};

export const 创建空同人女主剧情规划 = (): 同人女主剧情规划结构 => ({
    阶段推进: [],
    女主条目: [],
    女主互动事件: [],
    女主镜头规划: []
});

export const 规范化同人女主剧情规划状态 = (raw?: any): 同人女主剧情规划结构 | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const plan = raw;
    return {
        阶段推进: Array.isArray(plan?.阶段推进)
            ? plan.阶段推进
                .map((item: any) => ({
                    阶段名: 取文本(item?.阶段名),
                    关联分解组: 取数字数组(item?.关联分解组),
                    主推女主: 取字符串数组(item?.主推女主),
                    次推女主: 取字符串数组(item?.次推女主),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    阶段目标: 取字符串数组(item?.阶段目标),
                    禁止越级对象: 取字符串数组(item?.禁止越级对象),
                    完成判定: 取字符串数组(item?.完成判定),
                    切换条件: 取字符串数组(item?.切换条件)
                }))
                .filter((item) => item.阶段名 || item.阶段目标.length > 0)
            : [],
        女主条目: Array.isArray(plan?.女主条目)
            ? plan.女主条目
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    类型: 取文本(item?.类型),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联原著关系线: 取字符串数组(item?.关联原著关系线),
                    保持不变的原著基线: 取字符串数组(item?.保持不变的原著基线),
                    当前偏转点: 取字符串数组(item?.当前偏转点),
                    所属分歧线: 取字符串数组(item?.所属分歧线),
                    当前关系状态: 取文本(item?.当前关系状态),
                    当前阶段: 取文本(item?.当前阶段),
                    已成立事实: 取字符串数组(item?.已成立事实),
                    阶段目标: 取字符串数组(item?.阶段目标),
                    推进方式: 取字符串数组(item?.推进方式),
                    阻断因素: 取字符串数组(item?.阻断因素),
                    允许突破条件: 取字符串数组(item?.允许突破条件),
                    失败后回退: 取字符串数组(item?.失败后回退)
                }))
                .filter((item) => item.女主姓名)
            : [],
        女主互动事件: Array.isArray(plan?.女主互动事件)
            ? plan.女主互动事件
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    事件名: 取文本(item?.事件名),
                    事件说明: 取文本(item?.事件说明),
                    关联分解组: 取数字数组(item?.关联分解组),
                    关联原著事件: 取字符串数组(item?.关联原著事件),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    计划触发时间: 取文本(item?.计划触发时间),
                    最早触发时间: 取文本(item?.最早触发时间),
                    最晚触发时间: 取文本(item?.最晚触发时间),
                    前置条件: 取字符串数组(item?.前置条件),
                    触发条件: 取字符串数组(item?.触发条件),
                    阻断条件: 取字符串数组(item?.阻断条件),
                    成功结果: 取字符串数组(item?.成功结果),
                    失败结果: 取字符串数组(item?.失败结果),
                    与主剧情联动: 取字符串数组(item?.与主剧情联动),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.女主姓名 || item.事件名)
            : [],
        女主镜头规划: Array.isArray(plan?.女主镜头规划)
            ? plan.女主镜头规划
                .map((item: any) => ({
                    女主姓名: 取文本(item?.女主姓名),
                    关联分解组: 取数字数组(item?.关联分解组),
                    镜头标题: 取文本(item?.镜头标题),
                    镜头内容: 取文本(item?.镜头内容),
                    触发时间: 取文本(item?.触发时间),
                    触发条件: 取字符串数组(item?.触发条件),
                    关联事件: 取字符串数组(item?.关联事件),
                    关联分歧线: 取字符串数组(item?.关联分歧线),
                    沉淀内容: 取字符串数组(item?.沉淀内容),
                    当前状态: 取文本(item?.当前状态)
                }))
                .filter((item) => item.女主姓名 || item.镜头标题)
            : []
    };
};

export const 创建开场基础状态 = (charData: 角色数据结构, _worldConfig: WorldGenConfig) => ({
    角色: 深拷贝(charData),
    环境: 创建开场空白环境(),
    游戏初始时间: '',
    社交: [],
    世界: 创建开场空白世界(),
    战斗: 创建开场空白战斗(),
    玩家门派: 创建占位门派状态(charData),
    任务列表: [],
    约定列表: [],
    剧情: 创建开场空白剧情(),
    剧情规划: 创建空剧情规划(),
    女主剧情规划: undefined as 女主剧情规划结构 | undefined,
    同人剧情规划: undefined as 同人剧情规划结构 | undefined,
    同人女主剧情规划: undefined as 同人女主剧情规划结构 | undefined
});

export const 创建开场命令基态 = (_roleBase?: 角色数据结构): 开场命令基态 => ({
    角色: 创建开场空白角色(),
    环境: 创建开场空白环境(),
    社交: [],
    世界: 创建开场空白世界(),
    战斗: 创建开场空白战斗(),
    玩家门派: 创建空门派状态(),
    任务列表: [],
    约定列表: [],
    剧情: 创建开场空白剧情(),
    剧情规划: 创建空剧情规划(),
    女主剧情规划: undefined,
    同人剧情规划: undefined,
    同人女主剧情规划: undefined
});

export const 构建前端清空开场状态 = (
    openingBase: ReturnType<typeof 创建开场基础状态>
): ReturnType<typeof 创建开场基础状态> => ({
    ...openingBase,
    角色: 创建开场空白角色(),
    环境: 创建开场空白环境(),
    社交: [],
    世界: 创建开场空白世界(),
    战斗: 创建开场空白战斗(),
    玩家门派: 创建空门派状态(),
    任务列表: [],
    约定列表: [],
    剧情: 创建开场空白剧情(),
    剧情规划: 创建空剧情规划(),
    女主剧情规划: undefined,
    同人剧情规划: undefined,
    同人女主剧情规划: undefined
});

export const 创建空记忆系统 = (): 记忆系统结构 => ({
    回忆档案: [],
    即时记忆: [],
    短期记忆: [],
    中期记忆: [],
    长期记忆: []
});

export const 战斗结束自动清空 = (battleLike: any): 战斗状态结构 => {
    const battle = 规范化战斗状态(battleLike);
    const 存活敌方 = battle.敌方.filter((enemy) => enemy.当前血量 > 0 || enemy.最大血量 <= 0);
    if (battle.是否战斗中 !== true || 存活敌方.length <= 0) {
        return 创建开场空白战斗();
    }
    return {
        ...battle,
        敌方: 存活敌方
    };
};

export const 按回合窗口裁剪历史 = (sourceHistory: 聊天记录结构[], roundLimit: number): 聊天记录结构[] => {
    const history = Array.isArray(sourceHistory) ? sourceHistory : [];
    const normalizedLimit = Math.max(0, Math.floor(Number(roundLimit) || 0));
    if (normalizedLimit <= 0) return [];

    const turnAnchors = history
        .map((item, idx) => (item.role === 'assistant' && item.structuredResponse ? idx : -1))
        .filter((idx) => idx >= 0);

    if (turnAnchors.length <= normalizedLimit) return [...history];

    const firstVisibleTurnPos = turnAnchors.length - normalizedLimit;
    if (firstVisibleTurnPos <= 0) return [...history];

    const prevTurnAnchor = turnAnchors[firstVisibleTurnPos - 1];
    const sliceStart = Math.min(history.length, prevTurnAnchor + 1);
    return history.slice(sliceStart);
};
