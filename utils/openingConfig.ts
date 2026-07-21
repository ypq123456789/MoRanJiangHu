import type {
    OpeningConfig,
    OpeningRuntimeSnapshot,
    WorldGenConfig,
    初始伙伴配置结构,
    同人角色替换规则结构,
    游戏难度,
    初始关系模板类型,
    关系侧重类型,
    开局切入偏好类型,
    开局生成性别类型,
    题材模式类型,
    同人来源类型,
    同人融合强度类型,
    背景结构,
    天赋结构,
    角色数据结构
} from '../types';
import type { ModeRuntimeProfile } from '../models/system';
import { 获取题材模式配置, 获取题材模式选项, 规范化题材模式 } from './topicModeProfiles';
import { 构建官方模式运行时配置, 规范化模式运行时配置 } from './modeRuntimeProfile';
import { 是否自定义模式运行时配置 } from './effectiveTopicProfile';
import {
    创建主题默认属性分配,
    创建主题默认初始伙伴配置,
    创建主题默认开局配置,
    获取创意工坊属性字段,
    获取创意工坊新开局步骤列表
} from './workshopEngine';
import { normalizeCanonicalGameTime } from '../hooks/useGame/timeUtils';

export const 新开局步骤定义列表 = 获取创意工坊新开局步骤列表();
export const 新开局步骤列表 = 新开局步骤定义列表.map((step) => step.label);

export const 属性字段定义列表 = 获取创意工坊属性字段();
export const 属性键列表 = ['力量', '敏捷', '体质', '根骨', '悟性', '福源'] as const;
export const 默认属性值 = 属性字段定义列表[0]?.defaultValue ?? 3;
export const 属性最小值 = Math.min(...属性字段定义列表.map((field) => field.min));
export const 属性最大值 = Math.max(...属性字段定义列表.map((field) => field.max));
export type 属性分配结构 = Record<typeof 属性键列表[number], number>;

export const 默认开局时间 = '1:01:01:00:00';

export const 规范化开局时间 = (value?: unknown): string => (
    normalizeCanonicalGameTime(typeof value === 'string' ? value : '') || 默认开局时间
);

export type 难度设定结构 = {
    id: 游戏难度;
    label: string;
    shortLabel: string;
    description: string;
    起始属性点: number;
    天赋重Roll次数: number;
    判定修正: number;
    敌方强度: string;
    资源压力: string;
    失败代价: string;
    推荐人群: string;
};

export const 难度设定表: Record<游戏难度, 难度设定结构> = {
    relaxed: {
        id: 'relaxed',
        label: '轻松',
        shortLabel: '剧情模式',
        description: '适合先看世界、轻松体验剧情推进，资源与失败压力最低。',
        起始属性点: 38,
        天赋重Roll次数: 12,
        判定修正: 3,
        敌方强度: '敌人更保守，跨级压力下降',
        资源压力: '经验、掉落与恢复更宽松',
        失败代价: '多为轻伤、少量损耗或可补救后果',
        推荐人群: '想体验剧情、探索设定或测试新开局'
    },
    easy: {
        id: 'easy',
        label: '简单',
        shortLabel: '稳健养成',
        description: '适合正常养成但保留较高容错，资源循环比较顺。',
        起始属性点: 34,
        天赋重Roll次数: 8,
        判定修正: 1,
        敌方强度: '敌人略弱，普通冲突更好处理',
        资源压力: '收益略高，物价略低，恢复较稳定',
        失败代价: '会受伤或损失资源，但大多能补救',
        推荐人群: '第一次正式开档或想少一点折磨'
    },
    normal: {
        id: 'normal',
        label: '正常',
        shortLabel: '标准江湖',
        description: '标准体验，强调风险、收益、关系与代价之间的平衡。',
        起始属性点: 30,
        天赋重Roll次数: 5,
        判定修正: 0,
        敌方强度: '敌人按标准强度行动',
        资源压力: '收益与消耗按标准江湖压力结算',
        失败代价: '失败会带来伤势、关系或剧情门控损失',
        推荐人群: '想体验默认平衡的长期存档'
    },
    hard: {
        id: 'hard',
        label: '困难',
        shortLabel: '高压实战',
        description: '更看重路线规划、补给、人情和战术判断，失误更疼。',
        起始属性点: 26,
        天赋重Roll次数: 3,
        判定修正: -1,
        敌方强度: '敌人更积极，攻防与追击压力提升',
        资源压力: '收益减少，物价偏高，恢复更慢',
        失败代价: '更容易留下长期后遗症或丢失关键机会',
        推荐人群: '熟悉系统后想要更硬的生存压力'
    },
    extreme: {
        id: 'extreme',
        label: '极限',
        shortLabel: '残酷求生',
        description: '高风险挑战，任何错误都可能滚成不可逆后果。',
        起始属性点: 22,
        天赋重Roll次数: 1,
        判定修正: -3,
        敌方强度: '敌人强势且世界反应更严酷',
        资源压力: '收益稀缺，消耗和物价压力最高',
        失败代价: '可能触发重伤、残废、清算或主线断裂',
        推荐人群: '想要硬核求生和高失败代价'
    }
};

export const 难度总属性点映射: Record<游戏难度, number> = {
    relaxed: 难度设定表.relaxed.起始属性点,
    easy: 难度设定表.easy.起始属性点,
    normal: 难度设定表.normal.起始属性点,
    hard: 难度设定表.hard.起始属性点,
    extreme: 难度设定表.extreme.起始属性点
};

export const 获取难度设定 = (difficulty?: 游戏难度): 难度设定结构 => (
    难度设定表[difficulty || 'normal'] || 难度设定表.normal
);

export const 获取题材化难度设定 = (
    difficulty?: 游戏难度,
    mode?: 题材模式类型
): 难度设定结构 => {
    const base = 获取难度设定(difficulty);
    const profile = 获取题材模式配置(mode);
    if (profile.group === 'infinite') {
        return {
            ...base,
            shortLabel: base.id === 'normal' ? '标准轮回' : base.shortLabel,
            资源压力: base.id === 'normal'
                ? '奖励点、支线剧情与道具消耗按主神任务压力结算'
                : base.资源压力.replace(/江湖/g, '轮回任务'),
            失败代价: base.id === 'extreme'
                ? '可能触发重伤、队友死亡、支线失败、抹杀风险或主线断裂'
                : base.失败代价.replace(/伤势、关系或剧情门控/g, '伤势、队伍关系、奖励惩罚或任务门控')
        };
    }
    if (profile.group === 'apocalypse' && base.id === 'normal') {
        return {
            ...base,
            shortLabel: '标准求生',
            资源压力: '补给、感染风险和营地信用按标准末日压力结算'
        };
    }
    if (profile.group === 'modern' && base.id === 'normal') {
        return {
            ...base,
            shortLabel: '标准现实',
            资源压力: '资金、人情、时间和机会成本按标准现实压力结算'
        };
    }
    return base;
};

export const 初始关系模板选项: Array<{ value: 初始关系模板类型; label: string; hint: string }> = [
    { value: '独行少系', label: '独行少系', hint: '初始社交网收束为 1~2 人，更偏向孤身闯荡。' },
    { value: '家族牵引', label: '家族牵引', hint: '优先生成家人、族人、旧宅与家业压力。' },
    { value: '师门牵引', label: '师门牵引', hint: '优先生成师父、同门、门规与门内承接。' },
    { value: '世家官门', label: '世家官门', hint: '偏向门第、人脉、礼法与现实资源网络。' },
    { value: '青梅旧识', label: '青梅旧识', hint: '优先生成旧交、故人和情感承接线。' },
    { value: '旧仇旧债', label: '旧仇旧债', hint: '开局社会关系带着旧账、旧怨与压力源。' }
];

export const 关系侧重选项: Array<{ value: 关系侧重类型; label: string }> = [
    { value: '亲情', label: '亲情' },
    { value: '友情', label: '友情' },
    { value: '师门', label: '师门' },
    { value: '情缘', label: '情缘' },
    { value: '利益', label: '利益' },
    { value: '仇怨', label: '仇怨' }
];

export const 开局切入偏好选项: Array<{ value: 开局切入偏好类型; label: string; hint: string }> = [
    { value: '日常低压', label: '日常低压', hint: '优先从生活流、环境感和轻关系起步。' },
    { value: '在途起手', label: '在途起手', hint: '开局落在赶路、渡口、驿路、山道等途中场景。' },
    { value: '家宅起手', label: '家宅起手', hint: '优先落在卧房、院落、铺面、旧宅等内场。' },
    { value: '门派起手', label: '门派起手', hint: '优先落在山门、偏院、堂口、习武地等门派场景。' },
    { value: '风波前夜', label: '风波前夜', hint: '允许有将起未起的异动，但仍保持第一幕克制。' }
];

export type 题材开局配置文案 = {
    intro: string;
    relationHelper: string;
    organizationEnabled: boolean;
    organizationTitle: string;
    organizationDescription: string;
    memberTitle: string;
    memberDescription: string;
    organizationOffHint: string;
    relationLabels: Partial<Record<关系侧重类型, string>>;
    cutInLabels: Partial<Record<开局切入偏好类型, { label: string; hint: string }>>;
    promptBoundary: string;
};

const 应用运行时组织文案 = (
    copy: 题材开局配置文案,
    runtimeProfile?: unknown
): 题材开局配置文案 => {
    const normalized = runtimeProfile ? 规范化模式运行时配置(runtimeProfile) : null;
    const organizationName = normalized?.organization?.organizationName?.trim();
    const memberName = normalized?.organization?.memberName?.trim();
    if (!organizationName && !memberName) return copy;
    const finalOrganization = organizationName || '组织';
    const finalMember = memberName || '成员';
    return {
        ...copy,
        organizationTitle: `开局生成${finalOrganization}`,
        organizationDescription: `开启后第0回合会生成可承接的${finalOrganization}、相关据点或初始组织关系。`,
        memberTitle: `开局生成${finalMember}`,
        memberDescription: `开启后生成初始${finalMember}、同行者、联系人或组织成员名录。`,
        relationLabels: {
            ...copy.relationLabels,
            师门: finalOrganization
        },
        cutInLabels: {
            ...copy.cutInLabels,
            门派起手: {
                label: `${finalOrganization}起手`,
                hint: `优先落在${finalOrganization}据点、集合点、任务现场或组织关系承接处。`
            }
        }
    };
};

export const 获取题材开局配置文案 = (mode?: 题材模式类型, runtimeProfile?: unknown): 题材开局配置文案 => {
    const typedRuntime = runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile as ModeRuntimeProfile : undefined;
    const effectiveMode = typedRuntime && 是否自定义模式运行时配置(typedRuntime, mode)
        ? typedRuntime.identity.baseMode
        : mode;
    const profile = 获取题材模式配置(effectiveMode);
    if (profile.group === 'apocalypse') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式；末日题材会按幸存者语境生成关系与场景。',
            relationHelper: '会优先影响初始幸存者关系网的情绪结构。',
            organizationEnabled: true,
            organizationTitle: '开局生成营地',
            organizationDescription: '开启后第0回合会生成可承接的营地、避难所、车队、军方残部或幸存者小队。',
            memberTitle: '开局生成队友',
            memberDescription: '开启后生成初始队友、营地成员、临时同行者或幸存者关系名录。',
            organizationOffHint: '',
            relationLabels: { 师门: '队伍', 友情: '互助', 利益: '物资', 仇怨: '冲突' },
            cutInLabels: {
                在途起手: { label: '转移起手', hint: '开局落在转移、搜刮、撤离、车队或封锁线附近。' },
                家宅起手: { label: '避难点起手', hint: '优先落在家中、避难所、仓库、药房或临时安全屋。' },
                门派起手: { label: '营地起手', hint: '优先落在幸存者营地、临时据点、军方残部或安全区边缘。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    if (profile.group === 'modern') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式；现代都市会按现实社会语境生成关系与场景。',
            relationHelper: '会优先影响初始现实社交网、职场/家庭/城市关系的情绪结构。',
            organizationEnabled: true,
            organizationTitle: '开局生成组织',
            organizationDescription: '开启后第0回合会生成可承接的公司、学校、社区、项目组、门店或合作团队。',
            memberTitle: '开局生成成员',
            memberDescription: '开启后生成联系人、同事、亲友、邻里、合作对象或组织成员名录。',
            organizationOffHint: '',
            relationLabels: { 师门: '职场', 情缘: '情感', 利益: '合作', 仇怨: '矛盾' },
            cutInLabels: {
                在途起手: { label: '通勤起手', hint: '开局落在通勤、出差、路口、地铁、网约车或城市移动途中。' },
                家宅起手: { label: '住处起手', hint: '优先落在出租屋、家中、小区、店铺或办公室。' },
                门派起手: { label: '组织起手', hint: '优先落在公司、学校、社区、项目组、门店或合作现场。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    if (profile.group === 'urban_xianxia') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式和隐秘组织/同道生成。',
            relationHelper: '会优先影响初始社交网、现实身份与隐秘圈层的情绪结构。',
            organizationEnabled: true,
            organizationTitle: profile.value === '灵气复苏' ? '开局生成机构' : '开局生成隐门',
            organizationDescription: profile.value === '灵气复苏'
                ? '开启后可生成研究小组、临时管控机构、觉醒者互助点或异常处理小队，而不是古代门派。'
                : '开启后可生成隐秘修行家族、暗线组织、同道据点或都市隐门。',
            memberTitle: profile.value === '灵气复苏' ? '开局生成协作者' : '开局生成同道',
            memberDescription: profile.value === '灵气复苏'
                ? '开启后生成协作者、调查员、研究员、觉醒者同伴或互助者名录。'
                : '开启后生成同道、师承联系人、家族成员或暗线伙伴名录。',
            organizationOffHint: '',
            relationLabels: { 师门: profile.value === '灵气复苏' ? '机构' : '隐门', 利益: '资源', 仇怨: '旧怨' },
            cutInLabels: {
                在途起手: { label: '城市途中', hint: '开局落在通勤、调查、转移、赶赴异常点或城市途中场景。' },
                家宅起手: { label: '住处起手', hint: '优先落在住处、学校、医院、公司、店铺或家族据点。' },
                门派起手: { label: profile.value === '灵气复苏' ? '机构起手' : '隐门起手', hint: profile.value === '灵气复苏' ? '优先落在研究机构、管控点、互助点或异常处理现场。' : '优先落在隐门据点、家族内场、暗市入口或修行圈碰头处。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    if (profile.group === 'xianxia') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式和宗门/同道生成。',
            relationHelper: '会优先影响初始修真社交网的情绪结构。',
            organizationEnabled: true,
            organizationTitle: '开局生成宗门',
            organizationDescription: '开启后第0回合会直接拥有可用宗门、仙坊或修真势力承接。',
            memberTitle: '开局生成同道',
            memberDescription: '开启后会生成师长、同门、道友或宗门外缘人物名录。',
            organizationOffHint: '',
            relationLabels: { 师门: '宗门' },
            cutInLabels: {
                在途起手: { label: '行旅起手', hint: '开局落在赶路、飞舟、坊市路口、山道或秘境入口途中。' },
                家宅起手: { label: '洞府起手', hint: '优先落在洞府、院落、仙坊住处、家族旧宅等内场。' },
                门派起手: { label: '宗门起手', hint: '优先落在山门、外门院、讲经堂、演法台或宗门任务现场。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    if (profile.group === 'western_fantasy') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式和公会/冒险者生成。',
            relationHelper: '会优先影响初始冒险队伍、公会、骑士团、学院或教会关系的情绪结构。',
            organizationEnabled: true,
            organizationTitle: '开局生成公会',
            organizationDescription: '开启后第0回合会生成可承接的冒险者公会、骑士团、魔法学院、教会、佣兵团或商会。',
            memberTitle: '开局生成冒险者',
            memberDescription: '开启后生成初始队友、公会成员、骑士、法师学徒、牧师、佣兵或委托联系人名录。',
            organizationOffHint: '',
            relationLabels: { 师门: '公会', 友情: '同伴', 利益: '委托', 仇怨: '阵营' },
            cutInLabels: {
                在途起手: { label: '旅途起手', hint: '开局落在护送、行商路、边境道路、森林或地下城入口附近。' },
                家宅起手: { label: '酒馆起手', hint: '优先落在旅店、酒馆、公会宿舍、教会客房或学院宿舍。' },
                门派起手: { label: '公会起手', hint: '优先落在冒险者公会、骑士团驻地、学院课堂或教会任务现场。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    if (profile.group === 'infinite') {
        return 应用运行时组织文案({
            intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式和轮回小队生成。',
            relationHelper: '会优先影响初始轮回小队、资深者、新人和任务利益关系的情绪结构。',
            organizationEnabled: true,
            organizationTitle: '开局生成轮回小队',
            organizationDescription: '开启后第0回合会生成可承接的轮回小队、队伍房间、资深者或主神空间初始组织关系。',
            memberTitle: '开局生成轮回者',
            memberDescription: '开启后生成轮回者、新人、资深者、队友或临时同盟名录。',
            organizationOffHint: '',
            relationLabels: { 师门: '轮回小队', 友情: '队友', 利益: '奖励', 仇怨: '团战' },
            cutInLabels: {
                在途起手: { label: '投放途中', hint: '开局落在任务投放、倒计时、车厢/走廊/入口或进入副本途中。' },
                家宅起手: { label: '队伍房间起手', hint: '优先落在队伍房间、主神广场、训练场或休整空间。' },
                门派起手: { label: '轮回小队起手', hint: '优先落在轮回小队集合、主神光球说明规则或资深者带新人现场。' }
            },
            promptBoundary: profile.promptBoundary
        }, runtimeProfile);
    }
    return 应用运行时组织文案({
        intro: '题材模式已移到“世界观”。这里只决定初始关系侧重、第一幕切入方式和初始门派生成。',
        relationHelper: '会优先影响初始社交网的情绪结构。',
        organizationEnabled: true,
        organizationTitle: '开局生成门派',
        organizationDescription: '开启后第0回合会直接拥有可用门派，而不是只靠旧存档兜底。',
        memberTitle: '开局生成同门',
        memberDescription: '开启后会生成多层次同门名录，少数主要角色加若干普通同门。',
        organizationOffHint: '',
        relationLabels: {},
        cutInLabels: {},
        promptBoundary: profile.promptBoundary
    }, runtimeProfile);
};

/**
 * 仅当 runtime 来自自定义模式包时才参与选项换源；
 * 官方模式自动生成的 runtime 不进入，保证官方模式选项文案与历史版本逐字节一致。
 */
export const 仅自定义运行时 = (mode?: 题材模式类型, runtimeProfile?: unknown): unknown => {
    if (!runtimeProfile || typeof runtimeProfile !== 'object') return undefined;
    return 是否自定义模式运行时配置(runtimeProfile as any, mode) ? runtimeProfile : undefined;
};

export const 获取题材关系侧重选项 = (mode?: 题材模式类型, runtimeProfile?: unknown): Array<{ value: 关系侧重类型; label: string }> => {
    const copy = 获取题材开局配置文案(mode, 仅自定义运行时(mode, runtimeProfile));
    return 关系侧重选项.map((item) => ({ ...item, label: copy.relationLabels[item.value] || item.label }));
};

export const 获取题材开局切入偏好选项 = (mode?: 题材模式类型, runtimeProfile?: unknown): Array<{ value: 开局切入偏好类型; label: string; hint: string }> => {
    const copy = 获取题材开局配置文案(mode, 仅自定义运行时(mode, runtimeProfile));
    return 开局切入偏好选项.map((item) => ({ ...item, ...(copy.cutInLabels[item.value] || {}) }));
};

export const 题材模式选项: Array<{ value: 题材模式类型; label: string; hint: string }> = 获取题材模式选项();

export const 开局生成性别选项: Array<{ value: 开局生成性别类型; label: string }> = [
    { value: '男', label: '男' },
    { value: '女', label: '女' },
    { value: '男娘', label: '男娘' },
    { value: '扶她', label: '扶她' }
];

export const 默认开局生成性别列表: 开局生成性别类型[] = 开局生成性别选项.map((item) => item.value);

export const 规范化开局生成性别列表 = (value: unknown): 开局生成性别类型[] => {
    const rawList = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(/[\r\n,，、;；\s]+/u)
            : [];
    const allowed = new Set<开局生成性别类型>(默认开局生成性别列表);
    const seen = new Set<开局生成性别类型>();
    const result: 开局生成性别类型[] = [];
    rawList.forEach((item) => {
        const next = 读取文本(item) as 开局生成性别类型;
        if (!allowed.has(next) || seen.has(next)) return;
        seen.add(next);
        result.push(next);
    });
    return result.length > 0 ? result : [...默认开局生成性别列表];
};

export const 同人来源类型选项: Array<{ value: 同人来源类型; label: string }> = [
    { value: '小说', label: '小说' },
    { value: '动漫', label: '动漫' },
    { value: '游戏', label: '游戏' },
    { value: '影视', label: '影视' }
];

export const 同人融合强度选项: Array<{ value: 同人融合强度类型; label: string; hint: string }> = [
    { value: '轻度映射', label: '轻度映射', hint: '只借设定气质与世界母题，不直接搬角色。' },
    { value: '中度混编', label: '中度混编', hint: '允许部分势力、设定和风格直接进入原创世界。' },
    { value: '显性同台', label: '显性同台', hint: '允许原著角色或势力直接以世界母本形式存在。' }
];

export const 默认开局配置 = (): OpeningConfig => ({
    ...创建主题默认开局配置('武侠'),
    modeRuntimeProfile: 构建官方模式运行时配置('武侠'),
    允许生成性别: [...默认开局生成性别列表],
    生成性别锁定: false,
    自定义开局时间: 默认开局时间
});

export const 默认初始伙伴配置 = (): 初始伙伴配置结构 => ({
    ...创建主题默认初始伙伴配置(),
    属性: 创建默认属性分配()
});

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 角色替换名称分隔正则 = /[\r\n,，、;；]+/u;

const 规范化创意工坊上下文 = (value: unknown, fallbackMode: OpeningConfig['题材模式']) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value as any : {};
    const 已选模式原始值 = 读取文本(source?.已选模式);
    const 已选模式 = 题材模式选项.some((item) => item.value === 已选模式原始值)
        ? 已选模式原始值 as OpeningConfig['题材模式']
        : undefined;
    const rawItems = source?.已选子项 && typeof source.已选子项 === 'object' && !Array.isArray(source.已选子项)
        ? source.已选子项 as Record<string, unknown>
        : {};
    const 已选子项 = Object.fromEntries(
        Object.entries(rawItems)
            .map(([key, raw]) => [key, 读取文本(raw)])
            .filter(([key, raw]) => ['topic', 'world_rules', 'opening', 'ability', 'comfy_workflow'].includes(key) && Boolean(raw))
    ) as Partial<Record<'topic' | 'world_rules' | 'opening' | 'ability' | 'comfy_workflow', string>>;
    if (!已选模式 && Object.keys(已选子项).length <= 0) return undefined;
    return {
        已选模式: 已选模式 || fallbackMode,
        ...(Object.keys(已选子项).length > 0 ? { 已选子项 } : {})
    };
};

const 规范化快照背景列表 = (value: unknown): 背景结构[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: any) => {
            const 名称 = 读取文本(item?.名称);
            const 描述 = 读取文本(item?.描述);
            const 效果 = 读取文本(item?.效果);
            if (!名称 || !描述 || !效果) return null;
            const 初始物品 = Array.isArray(item?.初始物品)
                ? item.初始物品.map((entry: any) => {
                    if (!entry || typeof entry !== 'object') {
                        const name = 读取文本(entry);
                        return name ? { 名称: name } : null;
                    }
                    const name = 读取文本(entry?.名称);
                    if (!name) return null;
                    const quantity = Number(entry?.数量);
                    return {
                        名称: name,
                        ...(Number.isFinite(quantity) && quantity > 0 ? { 数量: quantity } : {}),
                        ...(entry?.描述 ? { 描述: 读取文本(entry.描述) } : {}),
                        ...(entry?.类型 ? { 类型: 读取文本(entry.类型) } : {})
                    };
                }).filter(Boolean)
                : undefined;
            const 自带天赋 = Array.isArray(item?.自带天赋)
                ? item.自带天赋.map((name: unknown) => 读取文本(name)).filter(Boolean)
                : undefined;
            return {
                名称,
                描述,
                效果,
                ...(初始物品 && 初始物品.length > 0 ? { 初始物品 } : {}),
                ...(自带天赋 && 自带天赋.length > 0 ? { 自带天赋 } : {})
            };
        })
        .filter(Boolean) as 背景结构[];
};

const 规范化快照天赋列表 = (value: unknown): 天赋结构[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: any) => {
            const 名称 = 读取文本(item?.名称);
            const 描述 = 读取文本(item?.描述);
            const 效果 = 读取文本(item?.效果);
            if (!名称 || !描述 || !效果) return null;
            return {
                名称,
                描述,
                效果,
                叙事约束: item?.叙事约束,
                ...(item?.隐藏 === true ? { 隐藏: true as const } : {})
            };
        })
        .filter(Boolean) as 天赋结构[];
};

const 规范化运行时快照 = (value: unknown): OpeningConfig['runtimeSnapshot'] | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const worldConfig = (value as any)?.worldConfig;
    const charData = (value as any)?.charData;
    if (!worldConfig || typeof worldConfig !== 'object' || Array.isArray(worldConfig)) return undefined;
    if (!charData || typeof charData !== 'object' || Array.isArray(charData)) return undefined;
    return {
        worldConfig: {
            worldName: 读取文本((worldConfig as any)?.worldName),
            worldSize: (worldConfig as any)?.worldSize === '弹丸之地' || (worldConfig as any)?.worldSize === '九州宏大' || (worldConfig as any)?.worldSize === '无尽位面'
                ? (worldConfig as any).worldSize
                : '九州宏大',
            dynastySetting: 读取文本((worldConfig as any)?.dynastySetting),
            sectDensity: (worldConfig as any)?.sectDensity === '稀少' || (worldConfig as any)?.sectDensity === '适中' || (worldConfig as any)?.sectDensity === '林立'
                ? (worldConfig as any).sectDensity
                : '适中',
            tianjiaoSetting: 读取文本((worldConfig as any)?.tianjiaoSetting),
            worldExtraRequirement: 读取文本((worldConfig as any)?.worldExtraRequirement),
            manualWorldPrompt: 读取文本((worldConfig as any)?.manualWorldPrompt),
            manualRealmPrompt: 读取文本((worldConfig as any)?.manualRealmPrompt),
            difficulty: ['relaxed', 'easy', 'normal', 'hard', 'extreme'].includes((worldConfig as any)?.difficulty)
                ? (worldConfig as any).difficulty
                : 'normal',
            ...(worldConfig && typeof (worldConfig as any)?.modeRuntimeProfile === 'object'
                ? { modeRuntimeProfile: 规范化模式运行时配置((worldConfig as any).modeRuntimeProfile) }
                : {})
        } as WorldGenConfig,
        charData: {
            ...((charData as any) || {}),
            姓名: 读取文本((charData as any)?.姓名),
            性别: 读取文本((charData as any)?.性别),
            年龄: Number.isFinite(Number((charData as any)?.年龄)) ? Number((charData as any).年龄) : undefined,
            出身背景: (charData as any)?.出身背景 && typeof (charData as any).出身背景 === 'object'
                ? {
                    名称: 读取文本((charData as any).出身背景?.名称),
                    描述: 读取文本((charData as any).出身背景?.描述),
                    效果: 读取文本((charData as any).出身背景?.效果)
                }
                : undefined,
            天赋列表: 规范化快照天赋列表((charData as any)?.天赋列表)
        } as Partial<角色数据结构>,
        openingStreaming: (value as any)?.openingStreaming !== false,
        openingExtraPrompt: 读取文本((value as any)?.openingExtraPrompt),
        activeModuleExtraRules: 读取文本((value as any)?.activeModuleExtraRules),
        modeBackgrounds: 规范化快照背景列表((value as any)?.modeBackgrounds),
        modeTalents: 规范化快照天赋列表((value as any)?.modeTalents)
    } as OpeningConfig['runtimeSnapshot'];
};
export const 规范化角色替换名称列表 = (value: unknown): string[] => {
    const rawList = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(角色替换名称分隔正则)
            : [];
    const result: string[] = [];
    const seen = new Set<string>();
    rawList.forEach((item) => {
        const name = 读取文本(item);
        if (!name || seen.has(name)) return;
        seen.add(name);
        result.push(name);
    });
    return result;
};

export const 规范化角色替换规则列表 = (value: unknown): 同人角色替换规则结构[] => {
    const source = Array.isArray(value) ? value : [];
    const result: 同人角色替换规则结构[] = [];
    source.forEach((item) => {
        const 原名称 = 读取文本((item as 同人角色替换规则结构 | null | undefined)?.原名称);
        const 替换为 = 读取文本((item as 同人角色替换规则结构 | null | undefined)?.替换为);
        if (!原名称 || !替换为) return;
        result.push({ 原名称, 替换为 });
    });
    return result;
};

export const 获取同人角色替换规则列表 = (
    config?: OpeningConfig | null,
    playerName?: string
): 同人角色替换规则结构[] => {
    const ruleMap = new Map<string, string>();
    const resolvedPlayerName = 读取文本(playerName);
    const 写入规则 = (原名称: unknown, 替换为: unknown) => {
        const sourceName = 读取文本(原名称);
        const replacementName = 读取文本(替换为);
        if (!sourceName || !replacementName || sourceName === replacementName) return;
        ruleMap.set(sourceName, replacementName);
    };

    写入规则(config?.同人融合?.替换目标角色名, resolvedPlayerName);
    规范化角色替换名称列表(config?.同人融合?.附加替换角色名列表)
        .forEach((name) => 写入规则(name, resolvedPlayerName));
    规范化角色替换规则列表(config?.同人融合?.附加角色替换规则列表)
        .forEach((rule) => 写入规则(rule.原名称, rule.替换为));

    return Array.from(ruleMap.entries()).map(([原名称, 替换为]) => ({ 原名称, 替换为 }));
};

export const 格式化角色替换规则摘要 = (
    rules: 同人角色替换规则结构[],
    options?: { maxItems?: number }
): string => {
    const list = 规范化角色替换规则列表(rules).map((rule) => `${rule.原名称} -> ${rule.替换为}`);
    if (list.length <= 0) return '';
    const maxItems = Math.max(1, Math.floor(options?.maxItems || 3));
    if (list.length <= maxItems) return list.join('；');
    return `${list.slice(0, maxItems).join('；')} 等${list.length}项`;
};

export const 获取难度总属性点 = (difficulty?: 游戏难度): number => (
    获取难度设定(difficulty).起始属性点
);

export const 创建默认属性分配 = (): 属性分配结构 => ({
    ...创建主题默认属性分配()
});

export const 计算属性总点数 = (attributes: Partial<属性分配结构>): number => (
    属性键列表.reduce((sum, key) => sum + (Number.isFinite(attributes[key]) ? Number(attributes[key]) : 默认属性值), 0)
);

export const 创建平均属性分配 = (totalBudget: number): 属性分配结构 => {
    const next = 创建默认属性分配();
    let remaining = Math.max(0, Math.floor(totalBudget) - 计算属性总点数(next));
    let index = 0;
    while (remaining > 0 && 属性键列表.some((key) => next[key] < 属性最大值)) {
        const key = 属性键列表[index % 属性键列表.length];
        if (next[key] < 属性最大值) {
            next[key] += 1;
            remaining -= 1;
        }
        index += 1;
    }
    return next;
};

export const 创建随机属性分配 = (totalBudget: number, random: () => number = Math.random): 属性分配结构 => {
    const next = 创建默认属性分配();
    let remaining = Math.max(0, Math.floor(totalBudget) - 计算属性总点数(next));
    while (remaining > 0 && 属性键列表.some((key) => next[key] < 属性最大值)) {
        const availableKeys = 属性键列表.filter((key) => next[key] < 属性最大值);
        const key = availableKeys[Math.floor(random() * availableKeys.length)] || availableKeys[0];
        next[key] += 1;
        remaining -= 1;
    }
    return next;
};

const 规范化属性分配 = (value: any) => {
    const fallback = 创建默认属性分配();
    const result = { ...fallback };
    属性键列表.forEach((key) => {
        const num = Number(value?.[key]);
        result[key] = Number.isFinite(num)
            ? Math.max(属性最小值, Math.min(属性最大值, Math.floor(num)))
            : fallback[key];
    });
    return result;
};

const 规范化天赋列表 = (value: unknown): 初始伙伴配置结构['天赋列表'] => (
    Array.isArray(value)
        ? value
            .map((item: any) => ({
                名称: 读取文本(item?.名称),
                描述: 读取文本(item?.描述),
                效果: 读取文本(item?.效果),
                叙事约束: item?.叙事约束,
                ...(item?.隐藏 === true ? { 隐藏: true as const } : {})
            }))
            .filter((item) => item.名称 && item.描述 && item.效果)
            .slice(0, 3)
        : []
);

const 规范化开局运行时快照 = (raw?: any): OpeningRuntimeSnapshot | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const modeWorldbooks = Array.isArray(raw?.modeWorldbooks)
        ? raw.modeWorldbooks.filter((item: any) => item && typeof item === 'object' && !Array.isArray(item)) as NonNullable<OpeningRuntimeSnapshot['modeWorldbooks']>
        : [];
    const workshopSelection = raw?.workshopSelection && typeof raw.workshopSelection === 'object' && !Array.isArray(raw.workshopSelection)
        ? (() => {
            const selectedMode = 读取文本(raw.workshopSelection.selectedMode) as NonNullable<OpeningRuntimeSnapshot['workshopSelection']>['selectedMode'];
            const selectedModules = raw.workshopSelection.selectedModules && typeof raw.workshopSelection.selectedModules === 'object' && !Array.isArray(raw.workshopSelection.selectedModules)
                ? Object.fromEntries(
                    Object.entries(raw.workshopSelection.selectedModules)
                        .map(([key, value]) => [key, 读取文本(value)])
                        .filter(([, value]) => value)
                ) as NonNullable<NonNullable<OpeningRuntimeSnapshot['workshopSelection']>['selectedModules']>
                : undefined;
            if (!selectedMode && (!selectedModules || Object.keys(selectedModules).length <= 0)) return undefined;
            return {
                ...(selectedMode ? { selectedMode } : {}),
                ...(selectedModules && Object.keys(selectedModules).length > 0 ? { selectedModules } : {})
            };
        })()
        : undefined;
    const modeBackgrounds = Array.isArray(raw?.modeBackgrounds)
        ? raw.modeBackgrounds
            .map((item: any) => {
                const 自带天赋 = Array.isArray(item?.自带天赋)
                    ? item.自带天赋.map((name: unknown) => 读取文本(name)).filter(Boolean)
                    : undefined;
                return {
                    名称: 读取文本(item?.名称),
                    描述: 读取文本(item?.描述),
                    效果: 读取文本(item?.效果),
                    ...(自带天赋 && 自带天赋.length > 0 ? { 自带天赋 } : {})
                };
            })
            .filter((item: { 名称: string; 描述: string; 效果: string }) => item.名称 && item.描述 && item.效果)
        : [];
    const modeTalents = Array.isArray(raw?.modeTalents)
        ? raw.modeTalents
            .map((item: any) => ({
                名称: 读取文本(item?.名称),
                描述: 读取文本(item?.描述),
                效果: 读取文本(item?.效果),
                叙事约束: item?.叙事约束,
                ...(item?.隐藏 === true ? { 隐藏: true as const } : {})
            }))
            .filter((item: { 名称: string; 描述: string; 效果: string }) => item.名称 && item.描述 && item.效果)
        : [];
    const mainStoryDirection = 读取文本(raw?.mainStoryDirection);
    const hiddenPlotPolicy = 读取文本(raw?.hiddenPlotPolicy);
    const snapshot: OpeningRuntimeSnapshot = {
        openingStreaming: raw?.openingStreaming !== false,
        openingExtraRequirement: 读取文本(raw?.openingExtraRequirement),
        openingExtraPrompt: 读取文本(raw?.openingExtraPrompt),
        activeModuleExtraRules: 读取文本(raw?.activeModuleExtraRules),
        ...(mainStoryDirection ? { mainStoryDirection } : {}),
        ...(hiddenPlotPolicy ? { hiddenPlotPolicy } : {}),
        ...(modeWorldbooks.length > 0 ? { modeWorldbooks } : {}),
        ...(workshopSelection ? { workshopSelection } : {}),
        ...(modeBackgrounds.length > 0 ? { modeBackgrounds } : {}),
        ...(modeTalents.length > 0 ? { modeTalents } : {})
    };
    if (
        snapshot.openingStreaming === true
        && !snapshot.openingExtraRequirement
        && !snapshot.openingExtraPrompt
        && !snapshot.activeModuleExtraRules
        && !snapshot.mainStoryDirection
        && !snapshot.hiddenPlotPolicy
        && modeWorldbooks.length <= 0
        && !workshopSelection?.selectedMode
        && (!workshopSelection?.selectedModules || Object.keys(workshopSelection.selectedModules).length <= 0)
        && modeBackgrounds.length <= 0
        && modeTalents.length <= 0
    ) {
        return undefined;
    }
    return snapshot;
};

export const 规范化初始伙伴配置 = (raw?: any): 初始伙伴配置结构 => {
    const fallback = 默认初始伙伴配置();
    return {
        enabled: raw?.enabled !== false,
        头像图片URL: 读取文本(raw?.头像图片URL),
        图片档案: raw?.图片档案 && typeof raw.图片档案 === 'object' && !Array.isArray(raw.图片档案)
            ? raw.图片档案
            : undefined,
        姓名: 读取文本(raw?.姓名),
        性别: 读取文本(raw?.性别) || fallback.性别,
        年龄: Number.isFinite(Number(raw?.年龄)) ? Math.max(1, Math.floor(Number(raw.年龄))) : fallback.年龄,
        出生月: Number.isFinite(Number(raw?.出生月)) ? Math.max(1, Math.min(12, Math.floor(Number(raw.出生月)))) : fallback.出生月,
        出生日: Number.isFinite(Number(raw?.出生日)) ? Math.max(1, Math.min(30, Math.floor(Number(raw.出生日)))) : fallback.出生日,
        外貌: 读取文本(raw?.外貌) || fallback.外貌,
        性格: 读取文本(raw?.性格) || fallback.性格,
        属性: 规范化属性分配(raw?.属性),
        背景名称: 读取文本(raw?.背景名称),
        背景描述: 读取文本(raw?.背景描述),
        背景效果: 读取文本(raw?.背景效果),
        天赋列表: 规范化天赋列表(raw?.天赋列表),
        关系: 读取文本(raw?.关系) || fallback.关系,
        备注: 读取文本(raw?.备注)
    };
};

export const 规范化初始伙伴列表 = (raw?: any, legacy?: any): 初始伙伴配置结构[] => {
    const source = Array.isArray(raw) ? raw : (legacy ? [legacy] : []);
    return source.map((item) => 规范化初始伙伴配置(item));
};

export const 规范化开局配置 = (raw?: any): OpeningConfig => {
    const fallback = 默认开局配置();
    const 题材模式 = 规范化题材模式(raw?.题材模式 || fallback.题材模式);
    const 初始关系模板 = 初始关系模板选项.some((item) => item.value === raw?.初始关系模板)
        ? raw.初始关系模板
        : fallback.初始关系模板;
    const 关系侧重 = Array.isArray(raw?.关系侧重)
        ? raw.关系侧重
            .map((item: unknown) => 读取文本(item))
            .filter((item: string): item is 关系侧重类型 => 关系侧重选项.some((option) => option.value === item))
            .slice(0, 2)
        : fallback.关系侧重;
    const 开局切入偏好 = 开局切入偏好选项.some((item) => item.value === raw?.开局切入偏好)
        ? raw.开局切入偏好
        : fallback.开局切入偏好;
    const 来源类型 = 同人来源类型选项.some((item) => item.value === raw?.同人融合?.来源类型)
        ? raw.同人融合.来源类型
        : fallback.同人融合.来源类型;
    const 融合强度 = 同人融合强度选项.some((item) => item.value === raw?.同人融合?.融合强度)
        ? raw.同人融合.融合强度
        : fallback.同人融合.融合强度;
    const 同人融合启用 = raw?.同人融合?.enabled === true;
    const 启用附加小说 = 同人融合启用 && raw?.同人融合?.启用附加小说 === true;

    const 初始伙伴列表 = 规范化初始伙伴列表(raw?.初始伙伴列表, raw?.初始伙伴 ?? fallback.初始伙伴);
    const 第一初始伙伴 = 初始伙伴列表[0] || 规范化初始伙伴配置(raw?.初始伙伴 ?? fallback.初始伙伴);

    return {
        配置约束启用: raw?.配置约束启用 !== false,
        题材模式,
        modeRuntimeProfile: 规范化模式运行时配置(raw?.modeRuntimeProfile, 题材模式),
        runtimeSnapshot: 规范化开局运行时快照(raw?.runtimeSnapshot),
        初始关系模板,
        关系侧重: 关系侧重.length > 0 ? 关系侧重 : fallback.关系侧重,
        开局切入偏好,
        自定义开局时间: 规范化开局时间(raw?.自定义开局时间 ?? fallback.自定义开局时间),
        开局生成门派: raw?.开局生成门派 !== false,
        开局生成同门: raw?.开局生成同门 !== false,
        允许生成性别: 规范化开局生成性别列表(
            raw?.允许生成性别
            ?? raw?.modeRuntimeProfile?.opening?.allowedGeneratedGenders
            ?? fallback.允许生成性别
        ),
        生成性别锁定: raw?.生成性别锁定 === true || raw?.modeRuntimeProfile?.opening?.lockGeneratedGenders === true,
        初始伙伴列表,
        初始伙伴: 第一初始伙伴,
        同人融合: {
            enabled: 同人融合启用,
            作品名: 读取文本(raw?.同人融合?.作品名),
            来源类型,
            融合强度,
            保留原著角色: raw?.同人融合?.保留原著角色 === true,
            启用角色替换: raw?.同人融合?.启用角色替换 === true,
            替换目标角色名: 读取文本(raw?.同人融合?.替换目标角色名),
            附加替换角色名列表: 规范化角色替换名称列表(raw?.同人融合?.附加替换角色名列表),
            附加角色替换规则列表: 规范化角色替换规则列表(raw?.同人融合?.附加角色替换规则列表),
            启用附加小说,
            附加小说数据集ID: 启用附加小说 ? 读取文本(raw?.同人融合?.附加小说数据集ID) : ''
        }
    };
};

export const 规范化可选开局配置 = (raw?: any): OpeningConfig | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    return 规范化开局配置(raw);
};
