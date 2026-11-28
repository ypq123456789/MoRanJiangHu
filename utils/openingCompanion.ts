import type { NPC结构, OpeningConfig, 角色数据结构 } from '../types';
import { normalizeNpcNameKey } from './npcName';

const 规范化文本键 = normalizeNpcNameKey;

const 取文本 = (value: unknown, fallback = ''): string => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const 清理标点文本 = (value: unknown, fallback = ''): string => (
    取文本(value, fallback)
        .replace(/([。！？!?；;])\1+/g, '$1')
        .trim()
);

const 句子化 = (label: string, value: unknown): string => {
    const text = 清理标点文本(value)
        .replace(/[。！？!?；;]+$/g, '');
    return text ? `${label}${text}。` : '';
};

const 取数字 = (value: unknown, fallback = 0): number => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const 取伙伴属性 = (attrs: any, key: '力量' | '敏捷' | '体质' | '根骨' | '悟性' | '福源'): number => {
    const value = Number(attrs?.[key]);
    return Number.isFinite(value) ? value : 5;
};

const 稳定哈希文本 = (text: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

export const 读取伙伴列表 = (openingConfig?: OpeningConfig) => {
    const source = Array.isArray(openingConfig?.初始伙伴列表) && openingConfig.初始伙伴列表.length > 0
        ? openingConfig.初始伙伴列表
        : (openingConfig?.初始伙伴 ? [openingConfig.初始伙伴] : []);
    return source
        .map((partner, index) => ({ partner, name: 取文本(partner?.姓名), index }))
        .filter((item) => item.partner && item.partner.enabled !== false && item.name);
};

// 旧档的开局伙伴标签可能在来源、身份、分组或关系字段中；剧情描述不作为入队凭据。
export const 有开局伙伴身份标记 = (npc: Partial<NPC结构> & { 关系?: unknown; 分组?: unknown }): boolean => (
    npc.保留开局伙伴设定属性 === true
    || [npc.来源, npc.身份, npc.关系状态, npc.关系, npc.分组, npc.境界]
        .some((value) => /^(?:初始|开局)(?:伙伴|同伴)$/u.test(取文本(value)))
);

export const 恢复开局伙伴队伍身份 = (social: NPC结构[], config?: OpeningConfig, playerName?: string): NPC结构[] => {
    const configured = new Set(读取伙伴列表(config).map(({ name }) => 规范化文本键(name)));
    const player = 规范化文本键(playerName);
    return social.map((npc) => {
        const name = 规范化文本键(npc?.姓名);
        if (!name || name === player || npc.是否队友 === false) return npc;
        if (!configured.has(name) && !有开局伙伴身份标记(npc)) {
            return npc.是否队友 === undefined && 有同行关系(npc) ? { ...npc, 是否队友: true } : npc;
        }
        if (npc.是否队友 && npc.来源 === '开局伙伴') return npc;
        return { ...npc, 是否队友: true, 来源: '开局伙伴' };
    });
};

export const 有同行关系 = (npc: Partial<NPC结构> & { 关系?: unknown }): boolean => (
    /^(?:主角的?)?(?:同伴|队友|同行伙伴|随行伙伴|结伴同行|并肩作战的伙伴)$/u.test(取文本(npc.关系, 取文本(npc.关系状态)))
);

const 读取伙伴 = (openingConfig?: OpeningConfig) => 读取伙伴列表(openingConfig)[0] || null;

const 生成单个开局伙伴ID = (
    partner: NonNullable<OpeningConfig['初始伙伴']>,
    name: string,
    playerName?: string,
    index = 0
): string => {
    const relation = 取文本(partner.关系, '开局伙伴');
    const indexSeed = index > 0 ? `|${index}` : '';
    return `npc_opening_partner_${稳定哈希文本(`${playerName || ''}|${name}|${relation}${indexSeed}`)}`;
};

export const 生成开局伙伴ID = (openingConfig?: OpeningConfig, playerName?: string): string => {
    const data = 读取伙伴(openingConfig);
    if (!data) return '';
    return 生成单个开局伙伴ID(data.partner, data.name, playerName, data.index);
};

const 构建单个初始伙伴NPC = (
    partner: NonNullable<OpeningConfig['初始伙伴']>,
    name: string,
    index: number,
    openingConfig?: OpeningConfig,
    player?: Partial<角色数据结构>
): NPC结构 | null => {
    // 兜底：若玩家把开局伙伴姓名填成主角本人姓名，跳过该伙伴，避免主角被当作 NPC 进入社交列表。
    const playerKey = 规范化文本键(player?.姓名);
    if (playerKey && 规范化文本键(name) === playerKey) return null;
    const relation = 取文本(partner.关系, '开局伙伴');
    const birthday = `${取数字(partner.出生月, 1)}月${取数字(partner.出生日, 1)}日`;
    const attrs = partner.属性 || {};
    const 力量 = 取伙伴属性(attrs, '力量');
    const 敏捷 = 取伙伴属性(attrs, '敏捷');
    const 体质 = 取伙伴属性(attrs, '体质');
    const 根骨 = 取伙伴属性(attrs, '根骨');
    const 悟性 = 取伙伴属性(attrs, '悟性');
    const 福源 = 取伙伴属性(attrs, '福源');
    const maxHp = Math.max(30, 体质 * 10);
    const maxEnergy = Math.max(30, 体质 * 8);
    const maxInternal = Math.max(20, (根骨 + 悟性) * 4);
    // 开局伙伴的初始位置不要硬编码为"主角身边"——该字符串与地图节点名对不上，
    // 又会被 `同步在场NPC当前位置` 当作"已有显式位置"而跳过同步，导致伙伴无法在地图显示。
    // 这里留空，后续由 `同步在场NPC当前位置` 从环境信息正确填充到真实地点名。
    const location = 取文本((player as any)?.当前位置 || (player as any)?.当前地点 || (player as any)?.具体地点, '');
    const isInfinite = openingConfig?.题材模式 === '无限流';
    const introParts = [
        `${name}是主角的${relation}。`,
        句子化('外貌：', partner.外貌),
        句子化('性格：', partner.性格),
        句子化('备注：', partner.备注)
    ].filter(Boolean);

    return {
        id: 生成单个开局伙伴ID(partner, name, 取文本(player?.姓名), index),
        姓名: name,
        来源: '开局伙伴',
        保留开局伙伴设定属性: true,
        曾用名: [],
        性别: partner.性别 === '男' ? '男' : '女',
        年龄: 取数字(partner.年龄, 18),
        生日: birthday,
        境界: isInfinite ? '新人轮回者' : '初始同伴',
        境界层级: 1,
        身份: relation,
        当前位置: location,
        当前地点: location,
        位置路径: location,
        是否在场: true,
        是否队友: true,
        是否主要角色: true,
        好感度: 60,
        关系状态: relation,
        简介: introParts.join('') || `${name}是开局已存在的随行伙伴。`,
        头像图片URL: 取文本(partner.头像图片URL),
        图片档案: partner.图片档案 && typeof partner.图片档案 === 'object' ? partner.图片档案 : undefined,
        核心性格特征: 清理标点文本(partner.性格, '与主角关系密切，愿意同行。'),
        天赋列表: Array.isArray(partner.天赋列表)
            ? partner.天赋列表.map((item) => ({
                名称: 取文本(item?.名称, '未命名天赋'),
                描述: 取文本(item?.描述, '开局伙伴建档天赋。'),
                效果: 取文本(item?.效果, '待剧情展开。')
            }))
            : [],
        出身背景: {
            名称: 取文本(partner.背景名称, '开局伙伴'),
            描述: 取文本(partner.背景描述, '由玩家在开局伙伴页设定。'),
            效果: 取文本(partner.背景效果, '影响开局关系与能力倾向。')
        },
        力量,
        敏捷,
        体质,
        根骨,
        悟性,
        福源,
        攻击力: Math.max(1, 力量 * 2),
        防御力: Math.max(1, 体质),
        当前血量: maxHp,
        最大血量: maxHp,
        当前精力: maxEnergy,
        最大精力: maxEnergy,
        当前内力: maxInternal,
        最大内力: maxInternal,
        头部当前血量: 20,
        头部最大血量: 20,
        头部状态: '正常',
        胸部当前血量: 30,
        胸部最大血量: 30,
        胸部状态: '正常',
        腹部当前血量: 30,
        腹部最大血量: 30,
        腹部状态: '正常',
        左手当前血量: 20,
        左手最大血量: 20,
        左手状态: '正常',
        右手当前血量: 20,
        右手最大血量: 20,
        右手状态: '正常',
        左腿当前血量: 25,
        左腿最大血量: 25,
        左腿状态: '正常',
        右腿当前血量: 25,
        右腿最大血量: 25,
        右腿状态: '正常',
        当前装备: {},
        背包: [],
        BUFF: [],
        DEBUFF: [],
        技艺: [],
        外貌描写: 清理标点文本(partner.外貌),
        记忆: []
    };
};

export const 构建初始伙伴NPC列表 = (
    openingConfig?: OpeningConfig,
    player?: Partial<角色数据结构>
): NPC结构[] => 读取伙伴列表(openingConfig)
    .map((data) => 构建单个初始伙伴NPC(data.partner, data.name, data.index, openingConfig, player))
    .filter((item): item is NPC结构 => Boolean(item));

export const 构建初始伙伴NPC = (
    openingConfig?: OpeningConfig,
    player?: Partial<角色数据结构>
): NPC结构 | null => 构建初始伙伴NPC列表(openingConfig, player)[0] || null;

const 是否疑似同一开局伙伴 = (npc: any, seed: NPC结构): boolean => {
    if (!npc) return false;
    const nameKey = 规范化文本键(seed.姓名);
    const npcKeys = [npc.id, npc.ID, npc.姓名, npc.名称, ...(Array.isArray(npc.曾用名) ? npc.曾用名 : [])].map(规范化文本键);
    if (npcKeys.includes(规范化文本键(seed.id)) || npcKeys.includes(nameKey)) return true;

    const relation = 规范化文本键(seed.关系状态 || seed.身份);
    const birthday = 规范化文本键(seed.生日);
    const text = [
        npc.身份,
        npc.关系状态,
        npc.简介,
        npc.当前任务,
        npc.行动意图
    ].map(规范化文本键).join('|');
    const sameProfile = (
        规范化文本键(npc.性别) === 规范化文本键(seed.性别)
        && 取数字(npc.年龄, -1) === seed.年龄
        && (!birthday || 规范化文本键(npc.生日).includes(birthday))
    );
    const companionFlag = npc.是否队友 === true || npc.是否主要角色 === true || npc.是否在场 === true;
    return companionFlag && sameProfile && Boolean(relation && text.includes(relation));
};

const 是否明确同一开局伙伴 = (npc: any, seed: NPC结构): boolean => {
    if (!npc) return false;
    const seedId = 规范化文本键(seed.id);
    const seedName = 规范化文本键(seed.姓名);
    const npcKeys = [npc.id, npc.ID, npc.姓名, npc.名称, ...(Array.isArray(npc.曾用名) ? npc.曾用名 : [])].map(规范化文本键);
    return Boolean(
        (seedId && npcKeys.includes(seedId))
        || (seedName && npcKeys.includes(seedName))
    );
};

const 查找开局伙伴种子 = (
    npc: any,
    seeds: NPC结构[],
    fuzzyMatchedSeedIds: Set<string>
): NPC结构 | null => {
    const exactMatches = seeds.filter((seed) => 是否明确同一开局伙伴(npc, seed));
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return null;

    const fuzzyMatches = seeds.filter((seed) => 是否疑似同一开局伙伴(npc, seed));
    if (fuzzyMatches.length !== 1) return null;

    const matched = fuzzyMatches[0];
    if (seeds.length > 1 && fuzzyMatchedSeedIds.has(matched.id)) return null;
    fuzzyMatchedSeedIds.add(matched.id);
    return matched;
};

export const 修复开局伙伴社交列表 = (
    socialList: any[],
    openingConfig?: OpeningConfig,
    player?: Partial<角色数据结构>
): any[] => {
    const seeds = 构建初始伙伴NPC列表(openingConfig, player);
    if (seeds.length <= 0) return Array.isArray(socialList) ? socialList : [];

    const source = Array.isArray(socialList) ? socialList : [];
    const mergedBySeed = new Map<string, any>();
    const fuzzyMatchedSeedIds = new Set<string>();
    const next: any[] = [];

    source.forEach((npc) => {
        const seed = 查找开局伙伴种子(npc, seeds, fuzzyMatchedSeedIds);
        if (seed) {
            const merged = mergedBySeed.get(seed.id);
            const seedArchive = seed.图片档案 && typeof seed.图片档案 === 'object' ? seed.图片档案 : undefined;
            const mergedArchive = merged?.图片档案 && typeof merged.图片档案 === 'object' ? merged.图片档案 : undefined;
            const npcArchive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : undefined;
            mergedBySeed.set(seed.id, {
                ...seed,
                ...merged,
                ...npc,
                id: seed.id,
                姓名: seed.姓名,
                头像图片URL: 取文本(npc?.头像图片URL, 取文本(merged?.头像图片URL, 取文本(seed.头像图片URL))),
                图片档案: npcArchive || mergedArchive || seedArchive,
                曾用名: Array.from(new Set([
                    ...(Array.isArray(seed.曾用名) ? seed.曾用名 : []),
                    ...(Array.isArray(merged?.曾用名) ? merged.曾用名 : []),
                    ...(Array.isArray(npc?.曾用名) ? npc.曾用名 : []),
                    取文本(npc?.姓名) && 取文本(npc?.姓名) !== seed.姓名 ? 取文本(npc?.姓名) : ''
                ].filter(Boolean))),
                性别: seed.性别,
                年龄: seed.年龄,
                生日: seed.生日,
                天赋列表: seed.天赋列表,
                出身背景: seed.出身背景,
                来源: seed.来源,
                保留开局伙伴设定属性: true,
                境界: 取文本(npc?.境界).replace(/未知境界|未明境界|不详/g, '').trim() || seed.境界,
                境界层级: seed.境界层级,
                力量: seed.力量,
                敏捷: seed.敏捷,
                体质: seed.体质,
                根骨: seed.根骨,
                悟性: seed.悟性,
                福源: seed.福源,
                是否队友: npc.是否队友 ?? merged?.是否队友 ?? seed.是否队友,
                是否主要角色: true,
                关系状态: 取文本(npc?.关系状态, seed.关系状态) || seed.关系状态
            });
            return;
        }
        next.push(npc);
    });

    return [
        ...seeds.map((seed) => mergedBySeed.get(seed.id) || seed),
        ...next
    ];
};
