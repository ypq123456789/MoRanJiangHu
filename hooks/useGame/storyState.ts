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
    记忆系统结构,
    OpeningConfig
} from '../../types';
import { 补齐世界地图空间字段 } from '../../utils/mapSpatial';
import { 职位等级排序 } from '../../models/sect';

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

const 门派职位贡献门槛: Record<string, number> = {
    杂役弟子: 0,
    外门弟子: 100,
    内门弟子: 350,
    真传弟子: 900,
    执事: 1600,
    长老: 3200,
    副掌门: 6500,
    掌门: 12000,
};

const 标准门派职位列表 = Object.keys(职位等级排序);

const 补全门派职位 = (source: any, totalContribution = 0, fallback = '无'): string => {
    let contributionRank = totalContribution > 0 ? '杂役弟子' : '无';
    Object.entries(门派职位贡献门槛).forEach(([rank, required]) => {
        if (totalContribution >= required) contributionRank = rank;
    });
    const candidates = [
        source?.玩家职位,
        source?.门派职位,
        source?.弟子等级,
        source?.弟子级别,
        source?.弟子身份,
        source?.身份,
        fallback,
    ].map((item) => 取文本(item)).filter(Boolean);
    const exact = candidates.find((item) => 标准门派职位列表.includes(item));
    if (exact) {
        return (职位等级排序[contributionRank] || 0) > (职位等级排序[exact] || 0) ? contributionRank : exact;
    }
    const matched = candidates
        .map((item) => 标准门派职位列表.find((rank) => item.includes(rank)))
        .find(Boolean);
    if (matched) {
        return (职位等级排序[contributionRank] || 0) > (职位等级排序[matched] || 0) ? contributionRank : matched;
    }
    if (fallback !== '无') {
        return (职位等级排序[contributionRank] || 0) > (职位等级排序[fallback] || 0) ? contributionRank : fallback;
    }
    return contributionRank;
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

const 无门派文本集合 = new Set(['', 'none', '无', '无门派', '无门无派', '尚未加入任何门派', '江湖散人', '散修', '无所属门派']);

export const 是否无门派标识 = (value: any): boolean => {
    if (value === null || value === undefined) return true;
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, '') : String(value).trim();
    return 无门派文本集合.has(normalized);
};

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
    技艺: [
        { 名称: '炼器', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '炼丹', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '医术', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '阵法', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '符箓', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '机关', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '采集', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' },
        { 名称: '鉴定', 等级: '未入门', 熟练度: 0, 描述: '尚未形成稳定技艺。' }
    ],
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
    累计贡献: 0,
    任务列表: [],
    兑换列表: [],
    藏经阁列表: [],
    重要成员: []
});

export const 创建占位门派状态 = (charData: 角色数据结构): 详细门派结构 => {
    if (是否无门派标识(charData?.所属门派ID) || (charData?.门派职位 !== undefined && 是否无门派标识(charData?.门派职位))) {
        return 创建空门派状态();
    }
    return {
        ...创建空门派状态(),
        ID: charData.所属门派ID,
        玩家职位: 补全门派职位(charData, 取数字(charData.门派贡献), '杂役弟子'),
        玩家贡献: 取数字(charData.门派贡献),
        累计贡献: 取数字(charData.门派贡献)
    };
};

const 创建默认门派任务列表 = (sectName: string): 详细门派结构['任务列表'] => ([
    {
        id: 'sect_default_patrol',
        标题: `${sectName}巡山`,
        描述: '沿山门、药田与外院走一圈，记录可疑行迹，维护门派日常秩序。',
        类型: '日常',
        难度: '1星',
        发布日期: '1:01:01:00:00',
        截止日期: '1:01:03:23:59',
        刷新日期: '每日',
        奖励贡献: 35,
        奖励资金: 80,
        奖励物品: ['辟谷丹 x1'],
        当前状态: '可接取'
    },
    {
        id: 'sect_default_gather',
        标题: '药圃采办',
        描述: '替丹房补齐清水、止血草与炭火，适合新入门弟子积攒贡献。',
        类型: '建设',
        难度: '1星',
        发布日期: '1:01:01:00:00',
        截止日期: '1:01:05:23:59',
        刷新日期: '每旬',
        奖励贡献: 55,
        奖励资金: 120,
        奖励物品: ['回气丹 x1'],
        当前状态: '可接取'
    },
    {
        id: 'sect_default_trial',
        标题: '后山试炼',
        描述: '前往后山石阶与竹林之间完成一次基础身法试炼。',
        类型: '历练',
        难度: '2星',
        发布日期: '1:01:01:00:00',
        截止日期: '1:01:10:23:59',
        刷新日期: '每月',
        奖励贡献: 120,
        奖励资金: 260,
        奖励物品: ['凝元丹 x1'],
        当前状态: '可接取'
    }
]);

const 创建默认聚宝阁商品 = (): 详细门派结构['兑换列表'] => ([
    { id: 'sect_shop_bigu', 物品名称: '辟谷丹', 类型: '丹药', 兑换价格: 30, 库存: 12, 要求职位: '杂役弟子' },
    { id: 'sect_shop_huiqi', 物品名称: '回气丹', 类型: '丹药', 兑换价格: 70, 库存: 8, 要求职位: '外门弟子' },
    { id: 'sect_shop_ningyuan', 物品名称: '凝元丹', 类型: '丹药', 兑换价格: 120, 库存: 6, 要求职位: '外门弟子' },
    { id: 'sect_shop_pojing', 物品名称: '破境丹', 类型: '丹药', 兑换价格: 320, 库存: 2, 要求职位: '内门弟子' },
    { id: 'sect_shop_practice_sword', 物品名称: '青锋短剑', 类型: '装备', 兑换价格: 160, 库存: 3, 要求职位: '外门弟子' }
]);

const 创建默认藏经阁列表 = (): NonNullable<详细门派结构['藏经阁列表']> => ([
    { id: 'sect_lib_qingyun_sword', 名称: '青云剑法', 类型: '功法', 品阶: '凡品', 简介: '青云山门入门剑法，重在稳、准、连。', 要求职位: '外门弟子', 要求累计贡献: 0 },
    { id: 'sect_lib_clear_breath', 名称: '澄息诀', 类型: '心法', 品阶: '良品', 简介: '以吐纳平复气息，提高内力续航。', 要求职位: '外门弟子', 要求累计贡献: 150 },
    { id: 'sect_lib_cloud_step', 名称: '踏云步', 类型: '身法', 品阶: '良品', 简介: '借山阶与林风练步，利于闪避与追击。', 要求职位: '内门弟子', 要求累计贡献: 450 }
]);

const 功法品质权重: Record<string, number> = { 凡品: 1, 良品: 2, 上品: 3, 极品: 4, 绝世: 5, 传说: 6 };

const 从藏经阁条目创建功法 = (book: any, sectName: string) => {
    const bookName = 取文本(book?.名称, '未命名典籍');
    const inferredType = bookName.includes('剑') ? '剑法' : 取文本(book?.类型, '功法');
    const typeMap: Record<string, string> = { 功法: '招式', 剑法: '招式', 刀法: '招式', 拳法: '招式', 身法: '轻功', 心法: '内功', 杂学: '被动' };
    const quality = 功法品质权重[取文本(book?.品阶)] ? 取文本(book?.品阶) : '凡品';
    return {
        ID: `sect_${取文本(book?.id, bookName)}`,
        来源藏经ID: 取文本(book?.id),
        名称: bookName,
        描述: 取文本(book?.简介, '藏经阁所藏典籍。'),
        类型: typeMap[inferredType] || '招式',
        品质: quality,
        来源: `${sectName || '门派'}藏经阁`,
        当前重数: 1,
        最高重数: 10,
        当前熟练度: 0,
        升级经验: 100,
        突破条件: '勤修不辍，实战参悟',
        境界限制: 取文本(book?.要求职位, '无'),
        大成方向: '稳固根基',
        圆满效果: `${bookName}圆满后可强化对应武学表现。`,
        武器限制: [],
        消耗类型: inferredType === '心法' ? '内力' : '精力',
        消耗数值: 0,
        施展耗时: '1息',
        冷却时间: '0息',
        基础伤害: 0,
        加成属性: inferredType === '身法' ? '敏捷' : inferredType === '心法' ? '根骨' : '力量',
        加成系数: 0,
        内力系数: inferredType === '心法' ? 1 : 0,
        伤害类型: inferredType === '心法' ? '内功' : '物理',
        目标类型: '自身',
        最大目标数: 1,
        重数描述映射: [{ 重数: 1, 描述: 取文本(book?.简介, '初窥门径。') }],
        附带效果: [],
        被动修正: [],
        境界特效: []
    };
};

const 创建开局散修基础功法 = (charData: 角色数据结构) => {
    const backgroundName = 取文本((charData as any)?.出身背景?.名称);
    const source = backgroundName ? `${backgroundName}旧学` : '开局经历';
    return {
        ID: 'opening_basic_breath',
        名称: '基础吐纳诀',
        描述: '由既有修炼经历沉淀出的入门吐纳法，足以解释主角开局内力与境界来源。',
        类型: '内功',
        品质: '凡品',
        来源: source,
        当前重数: 1,
        最高重数: 6,
        当前熟练度: 0,
        升级经验: 100,
        突破条件: '日常吐纳，循序渐进',
        境界限制: '无',
        大成方向: '稳固内息',
        圆满效果: '圆满后可略微提升内力恢复与修炼稳定性。',
        武器限制: [],
        消耗类型: '内力',
        消耗数值: 0,
        施展耗时: '1刻',
        冷却时间: '0息',
        基础伤害: 0,
        加成属性: '根骨',
        加成系数: 0,
        内力系数: 1,
        伤害类型: '内功',
        目标类型: '自身',
        最大目标数: 1,
        重数描述映射: [{ 重数: 1, 描述: '初步梳理气息，稳住丹田。' }],
        附带效果: [],
        被动修正: [],
        境界特效: []
    };
};

const 主角开局应有基础功法 = (charData: 角色数据结构): boolean => {
    const existing = Array.isArray((charData as any)?.功法列表) && (charData as any).功法列表.length > 0;
    if (existing) return false;
    const realmText = 取文本((charData as any)?.境界);
    const backgroundText = [
        取文本((charData as any)?.称号),
        取文本((charData as any)?.出身背景?.名称),
        取文本((charData as any)?.出身背景?.描述)
    ].join(' ');
    const impossibleText = `${realmText} ${backgroundText}`;
    if (/凡人|普通人|未入境|未修炼|不会武|不会功法|不通武艺/u.test(impossibleText)) return false;
    return 取数字((charData as any)?.当前内力) > 0
        || 取数字((charData as any)?.最大内力) > 0
        || 取数字((charData as any)?.境界层级) > 0
        || Boolean(realmText && !/无|未知|凡人|未入境/u.test(realmText));
};

const 补齐开局角色功法 = (charData: 角色数据结构, sect: 详细门派结构): 角色数据结构 => {
    const currentSkills = Array.isArray((charData as any)?.功法列表) ? 深拷贝((charData as any).功法列表) : [];
    return { ...charData, 功法列表: currentSkills };
};

const 提取家族门派姓氏 = (sectName: string): string => {
    const text = 取文本(sectName);
    const match = text.match(/^([\u4e00-\u9fa5])(?:家|氏|府|堡|庄|寨|族|门)/);
    return match?.[1] || '';
};

const 套用家族姓氏 = (name: string, surname: string): string => {
    const text = 取文本(name);
    if (!surname || text.length <= 0) return text;
    return `${surname}${text.slice(1)}`;
};

const 创建默认同门列表 = (sectName: string): 详细门派结构['重要成员'] => {
    const familySurname = 提取家族门派姓氏(sectName);
    const withSurname = (name: string) => 套用家族姓氏(name, familySurname);
    return [
        { id: 'sect_member_master', 姓名: withSurname('沈若嫣'), 性别: '女', 年龄: 19, 境界: '开脉境二重', 身份: '少庄主', 简介: `主理${sectName}内外事务，行事果断。` },
        { id: 'sect_member_elder', 姓名: withSurname('杨震'), 性别: '男', 年龄: 42, 境界: '通玄境圆满', 身份: '执事', 简介: '负责传功与巡山，赏罚分明。' },
        { id: 'sect_member_true', 姓名: withSurname('陆明澈'), 性别: '男', 年龄: 24, 境界: '开脉境九重', 身份: '真传弟子', 简介: '常随长老外出办事，是同辈里最早独当一面的弟子。' },
        { id: 'sect_member_inner', 姓名: withSurname('苏晚晴'), 性别: '女', 年龄: 21, 境界: '开脉境五重', 身份: '内门弟子', 简介: '负责整理藏经阁借阅名册，待人温和但记性极好。' },
        { id: 'sect_member_apprentice', 姓名: withSurname('曹雄'), 性别: '男', 年龄: 17, 境界: '锻劲境初期', 身份: '外门弟子', 简介: '新入门不久，常在练武场切磋。' },
        { id: 'sect_member_outer_lan', 姓名: withSurname('许青萝'), 性别: '女', 年龄: 16, 境界: '锻劲境圆满', 身份: '外门弟子', 简介: '消息灵通，常帮同门打听任务布告的风向。' },
        { id: 'sect_member_worker', 姓名: withSurname('赵平安'), 性别: '男', 年龄: 15, 境界: '未入境', 身份: '杂役弟子', 简介: '管着偏院柴米和药圃杂务，很多门内琐事都绕不开他。' },
        { id: 'sect_member_minor_01', 姓名: withSurname('韩小霜'), 性别: '女', 年龄: 18, 境界: '锻劲境中期', 身份: '外门弟子', 简介: '普通同门，常在晨课与巡山队伍中露面。' }
    ];
};

const 补齐门派重要成员 = (sectName: string, sourceMembers: unknown): 详细门派结构['重要成员'] => {
    const explicitMembers = Array.isArray(sourceMembers) ? sourceMembers.filter((item) => item && typeof item === 'object') : [];
    const defaults = 创建默认同门列表(sectName);
    const usedNames = new Set(explicitMembers.map((item: any) => 取文本(item?.姓名)).filter(Boolean));
    const usedIds = new Set(explicitMembers.map((item: any) => 取文本(item?.id)).filter(Boolean));
    const filled = [...explicitMembers];
    for (const member of defaults) {
        const memberName = 取文本((member as any)?.姓名);
        const memberId = 取文本((member as any)?.id);
        if ((memberName && usedNames.has(memberName)) || (memberId && usedIds.has(memberId))) continue;
        filled.push(member);
        if (memberName) usedNames.add(memberName);
        if (memberId) usedIds.add(memberId);
    }
    return filled;
};

export const 创建开局门派状态 = (
    charData: 角色数据结构,
    openingConfig?: OpeningConfig
): 详细门派结构 => {
    const shouldCreateSect = openingConfig?.开局生成门派 !== false
        && (openingConfig?.初始关系模板 === '师门牵引'
            || openingConfig?.开局切入偏好 === '门派起手'
            || openingConfig?.关系侧重?.includes('师门') === true
            || !是否无门派标识(charData?.所属门派ID)
            || !是否无门派标识(charData?.门派职位));
    if (!shouldCreateSect) return 创建空门派状态();

    const baseName = !是否无门派标识(charData?.所属门派ID)
        ? 取文本(charData.所属门派ID, '青云山庄')
        : '青云山庄';
    const contribution = Math.max(0, 取数字(charData?.门派贡献, 100));
    const playerRank = 补全门派职位(charData, contribution, '外门弟子');
    const normalized = 规范化门派状态({
        ID: baseName,
        名称: baseName,
        玩家职位: playerRank,
        玩家贡献: contribution,
        累计贡献: contribution,
        重要成员: openingConfig?.开局生成同门 === false ? [] : 创建默认同门列表(baseName)
    });
    return openingConfig?.开局生成同门 === false ? { ...normalized, 重要成员: [] } : normalized;
};

export const 规范化门派状态 = (raw?: any): 详细门派结构 => {
    const base = 创建空门派状态();
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const id = 取文本(source?.ID, base.ID);
    const name = 取文本(source?.名称, base.名称);
    const playerRankSource = 取文本(source?.玩家职位, base.玩家职位);
    const hasExplicitInactiveMarker = (
        (source?.ID !== undefined && 是否无门派标识(id))
        || (source?.名称 !== undefined && 是否无门派标识(name))
        || (source?.玩家职位 !== undefined && 是否无门派标识(playerRankSource))
    );
    const hasActiveMarker = !是否无门派标识(id) || (!是否无门派标识(name) && name !== base.名称) || !是否无门派标识(playerRankSource);
    const isActiveSect = hasActiveMarker && !hasExplicitInactiveMarker;
    if (!isActiveSect) return base;
    const displayName = isActiveSect && name === base.名称 ? (id === 'none' ? '青云山庄' : id) : name;
    const playerContribution = 取数字(source?.玩家贡献, base.玩家贡献);
    const totalContribution = Math.max(
        playerContribution,
        取数字(source?.累计贡献 ?? source?.历史贡献 ?? source?.累计生成贡献, playerContribution)
    );
    const playerRank = 补全门派职位(source, totalContribution, isActiveSect ? '杂役弟子' : base.玩家职位);
    return {
        ID: id,
        名称: displayName,
        简介: typeof source?.简介 === 'string' && source.简介.trim()
            ? source.简介
            : (isActiveSect ? `${displayName}依山而建，兼重修行、任务与贡献兑换。` : base.简介),
        门规: Array.isArray(source?.门规) && source.门规.length > 0
            ? source.门规
            : (isActiveSect ? ['不可同门相残', '任务所得须如实登记', '藏经阁典籍不得私自外传'] : []),
        门派资金: 取数字(source?.门派资金, isActiveSect ? 1200 : base.门派资金),
        门派物资: 取数字(source?.门派物资, isActiveSect ? 350 : base.门派物资),
        建设度: 取数字(source?.建设度, isActiveSect ? 180 : base.建设度),
        玩家职位: playerRank,
        玩家贡献: playerContribution,
        累计贡献: totalContribution,
        任务列表: Array.isArray(source?.任务列表) && source.任务列表.length > 0 ? source.任务列表 : (isActiveSect ? 创建默认门派任务列表(displayName) : []),
        兑换列表: Array.isArray(source?.兑换列表) && source.兑换列表.length > 0 ? source.兑换列表 : (isActiveSect ? 创建默认聚宝阁商品() : []),
        藏经阁列表: Array.isArray(source?.藏经阁列表) && source.藏经阁列表.length > 0 ? source.藏经阁列表 : (isActiveSect ? 创建默认藏经阁列表() : []),
        重要成员: isActiveSect ? 补齐门派重要成员(displayName, source?.重要成员) : []
    };
};

export const 保护开局生成门派状态 = <T extends { 玩家门派?: any; 角色?: any }>(
    nextState: T,
    baseState: { 玩家门派?: any; 角色?: any },
    openingConfig?: OpeningConfig
): T => {
    const baseSect = 规范化门派状态(baseState?.玩家门派);
    const nextSect = 规范化门派状态(nextState?.玩家门派);
    const shouldKeepGeneratedSect = openingConfig?.开局生成门派 !== false
        && !是否无门派标识(baseSect.ID)
        && 是否无门派标识(nextSect.ID);
    if (!shouldKeepGeneratedSect) return nextState;

    const nextRole = nextState?.角色 && typeof nextState.角色 === 'object'
        ? {
            ...nextState.角色,
            所属门派ID: baseSect.ID,
            门派职位: baseSect.玩家职位,
            门派贡献: Math.max(
                取数字(nextState.角色?.门派贡献),
                取数字(baseSect.玩家贡献),
                取数字(baseSect.累计贡献)
            )
        }
        : nextState?.角色;

    return {
        ...nextState,
        玩家门派: baseSect,
        角色: nextRole
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
    建筑: [],
    地图层级: [],
    地图建筑: [],
    地图道路: [],
    地图人物: [],
    势力列表: [],
    势力互动历史: [],
    拍卖行待投放物品: []
});

export const 规范化世界状态 = (raw?: any): 世界数据结构 => {
    const world = raw && typeof raw === 'object' ? raw : {};
    const normalizedWorld: 世界数据结构 = {
        活跃NPC列表: Array.isArray(world?.活跃NPC列表)
            ? world.活跃NPC列表
                .map((item: any) => ({
                    姓名: 取文本(item?.姓名),
                    所属势力: 取文本(item?.所属势力),
                    当前位置: 取文本(item?.当前位置),
                    位置路径: 取文本(item?.位置路径),
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
            : [],
        地图层级: Array.isArray(world?.地图层级) ? world.地图层级 : [],
        地图建筑: Array.isArray(world?.地图建筑) ? world.地图建筑 : [],
        地图道路: Array.isArray(world?.地图道路) ? world.地图道路 : [],
        地图人物: Array.isArray(world?.地图人物) ? world.地图人物 : [],
        // 势力系统（旧存档兼容：缺失时默认为空数组）
        势力列表: Array.isArray(world?.势力列表) ? world.势力列表 : [],
        势力互动历史: Array.isArray(world?.势力互动历史) ? world.势力互动历史 : [],
        拍卖行待投放物品: Array.isArray(world?.拍卖行待投放物品) ? world.拍卖行待投放物品 : []
    };

    return 补齐世界地图空间字段(normalizedWorld);
};

export const 创建开场空白战斗 = (): 战斗状态结构 => ({
    是否战斗中: false,
    敌方: []
});

const 读取敌方境界阶位 = (enemy: any): number => {
    const text = [enemy?.境界, enemy?.简介, enemy?.名字].map((value) => 取文本(value)).join(' ');
    let rank = 1;
    [
        [/凡人|普通|未入道|无修为/, 1],
        [/炼体|锻体/, 2],
        [/开脉|通脉/, 3],
        [/聚息|聚气|凝气/, 4],
        [/筑基|归元/, 5],
        [/凝真|玄照/, 6],
        [/金丹|玄丹/, 8],
        [/元婴/, 10],
        [/化神/, 13],
        [/炼虚/, 16],
        [/合体/, 20],
        [/大乘|渡劫/, 24]
    ].forEach(([pattern, value]) => {
        if ((pattern as RegExp).test(text)) rank = Math.max(rank, value as number);
    });
    if (/后期|圆满|巅峰/.test(text)) rank += 1;
    return Math.max(1, rank);
};

const 规范化敌方基础属性 = (rawEnemy: any) => {
    const rank = 读取敌方境界阶位(rawEnemy);
    const text = [rawEnemy?.名字, rawEnemy?.境界, rawEnemy?.简介, ...(Array.isArray(rawEnemy?.技能) ? rawEnemy.技能 : [])].map((value) => 取文本(value)).join(' ');
    const base = Math.max(3, 6 + rank * 2);
    const read = (key: string, fallback: number) => {
        const value = 取数字(rawEnemy?.[key], NaN);
        return Number.isFinite(value) && value > 0 ? Math.ceil(value) : Math.max(1, Math.ceil(fallback));
    };
    return {
        力量: read('力量', base + (/刀|斧|锤|拳|猛|力/.test(text) ? 3 : 0)),
        敏捷: read('敏捷', base + (/剑|刺|影|弓|暗器|快/.test(text) ? 3 : 0)),
        体质: read('体质', base + (/盾|甲|体|横练|护/.test(text) ? 3 : 0)),
        根骨: read('根骨', base + (/内功|道|术|气|长老/.test(text) ? 3 : 0)),
        悟性: read('悟性', base + (/术|阵|符|谋|智|师/.test(text) ? 3 : 0)),
        福源: read('福源', Math.max(1, base - 1)),
        境界层级: Math.max(1, Math.ceil(取数字(rawEnemy?.境界层级, rank)))
    };
};

const 规范化敌方条目 = (rawEnemy: any): 战斗状态结构['敌方'][number] => {
    const attrs = 规范化敌方基础属性(rawEnemy);
    return {
        名字: 取文本(rawEnemy?.名字),
        境界: 取文本(rawEnemy?.境界),
        简介: 取文本(rawEnemy?.简介),
        技能: 取字符串数组(rawEnemy?.技能),
        ...attrs,
        战斗力: 取数字(rawEnemy?.战斗力, Math.ceil(attrs.力量 * 1.5 + attrs.敏捷 * 0.8 + attrs.境界层级 * 4)),
        防御力: 取数字(rawEnemy?.防御力, Math.ceil(attrs.体质 * 1.3 + attrs.根骨 * 0.9 + attrs.境界层级 * 3)),
        当前血量: 取数字(rawEnemy?.当前血量, Math.ceil(72 + attrs.体质 * 4.2 + attrs.根骨 * 2.4 + attrs.力量 * 1.2 + attrs.境界层级 * 12)),
        最大血量: 取数字(rawEnemy?.最大血量, Math.ceil(72 + attrs.体质 * 4.2 + attrs.根骨 * 2.4 + attrs.力量 * 1.2 + attrs.境界层级 * 12)),
        当前精力: 取数字(rawEnemy?.当前精力, Math.ceil(36 + attrs.体质 * 3.2 + attrs.根骨 * 2.2 + attrs.境界层级 * 9)),
        最大精力: 取数字(rawEnemy?.最大精力, Math.ceil(36 + attrs.体质 * 3.2 + attrs.根骨 * 2.2 + attrs.境界层级 * 9)),
        当前内力: 取数字(rawEnemy?.当前内力, Math.ceil(18 + attrs.根骨 * 3.6 + attrs.悟性 * 3.2 + attrs.境界层级 * 10)),
        最大内力: 取数字(rawEnemy?.最大内力, Math.ceil(18 + attrs.根骨 * 3.6 + attrs.悟性 * 3.2 + attrs.境界层级 * 10))
    };
};

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

export const 创建开场基础状态 = (charData: 角色数据结构, _worldConfig: WorldGenConfig, openingConfig?: OpeningConfig) => {
    const 玩家门派 = 创建开局门派状态(charData, openingConfig);
    const 角色 = 补齐开局角色功法(深拷贝(charData), 玩家门派);
    return {
        角色,
        环境: 创建开场空白环境(),
        游戏初始时间: '',
        社交: [],
        世界: 创建开场空白世界(),
        战斗: 创建开场空白战斗(),
        玩家门派,
        任务列表: [],
        约定列表: [],
        剧情: 创建开场空白剧情(),
        剧情规划: 创建空剧情规划(),
        女主剧情规划: undefined as 女主剧情规划结构 | undefined,
        同人剧情规划: undefined as 同人剧情规划结构 | undefined,
        同人女主剧情规划: undefined as 同人女主剧情规划结构 | undefined
    };
};

export const 创建开场命令基态 = (openingBase?: Partial<ReturnType<typeof 创建开场基础状态>>): 开场命令基态 => ({
    角色: openingBase?.角色 ? 深拷贝(openingBase.角色) : 创建开场空白角色(),
    环境: openingBase?.环境 ? 深拷贝(openingBase.环境) : 创建开场空白环境(),
    社交: Array.isArray(openingBase?.社交) ? 深拷贝(openingBase.社交) : [],
    世界: openingBase?.世界 ? 深拷贝(openingBase.世界) : 创建开场空白世界(),
    战斗: openingBase?.战斗 ? 深拷贝(openingBase.战斗) : 创建开场空白战斗(),
    玩家门派: openingBase?.玩家门派 ? 规范化门派状态(openingBase.玩家门派) : 创建空门派状态(),
    任务列表: Array.isArray(openingBase?.任务列表) ? 深拷贝(openingBase.任务列表) : [],
    约定列表: Array.isArray(openingBase?.约定列表) ? 深拷贝(openingBase.约定列表) : [],
    剧情: openingBase?.剧情 ? 规范化剧情状态(openingBase.剧情) : 创建开场空白剧情(),
    剧情规划: openingBase?.剧情规划 ? 规范化剧情规划状态(openingBase.剧情规划) : 创建空剧情规划(),
    女主剧情规划: openingBase?.女主剧情规划 ? 规范化女主剧情规划状态(openingBase.女主剧情规划) : undefined,
    同人剧情规划: openingBase?.同人剧情规划 ? 规范化同人剧情规划状态(openingBase.同人剧情规划) : undefined,
    同人女主剧情规划: openingBase?.同人女主剧情规划 ? 规范化同人女主剧情规划状态(openingBase.同人女主剧情规划) : undefined
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
