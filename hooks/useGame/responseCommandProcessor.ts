import {
    GameResponse,
    角色数据结构,
    环境信息结构,
    世界数据结构,
    战斗状态结构,
    详细门派结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构
} from '../../types';
import { applyStateCommand, normalizeStateCommandKey } from '../../utils/stateHelpers';
import { 规范化任务列表自动结算 } from '../../utils/taskCompat';
import { sanitizeInventoryCommand } from './inventoryCommandGuard';

const 占位开局时间 = '1:01:01:00:00';

const 解析标准时间天值 = (raw?: string): number | null => {
    if (typeof raw !== 'string') return null;
    const match = raw.trim().match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (![year, month, day].every(Number.isFinite)) return null;
    return (Math.trunc(year) * 12 + Math.max(0, Math.trunc(month) - 1)) * 31 + Math.max(0, Math.trunc(day) - 1);
};

const 解析标准时间分值 = (raw?: string): number | null => {
    if (typeof raw !== 'string') return null;
    const match = raw.trim().match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    const dayValue = (Math.trunc(year) * 12 + Math.max(0, Math.trunc(month) - 1)) * 31 + Math.max(0, Math.trunc(day) - 1);
    return ((dayValue * 24) + Math.trunc(hour)) * 60 + Math.trunc(minute);
};

const 是否环境时间命令 = (rawKey: string): boolean => {
    const normalizedKey = normalizeStateCommandKey(rawKey);
    return normalizedKey === 'gameState.环境.时间';
};

const 是否游戏初始时间命令 = (rawKey: string): boolean => {
    const normalizedKey = normalizeStateCommandKey(rawKey || '');
    if (normalizedKey === 'gameState.游戏初始时间') return true;
    const trimmed = (rawKey || '').trim();
    return trimmed === '游戏初始时间' || trimmed === 'gameState.游戏初始时间';
};

const 是否时间回退或异常重置 = (oldTime: unknown, newValue: unknown): boolean => {
    const newCanonical = typeof newValue === 'string' ? newValue.trim() : '';
    if (!newCanonical) return true;
    if (newCanonical === 占位开局时间) return true;
    const newMinutes = 解析标准时间分值(newCanonical);
    if (newMinutes == null) return true;
    const oldCanonical = typeof oldTime === 'string' ? oldTime.trim() : '';
    if (!oldCanonical || oldCanonical === 占位开局时间) return false;
    const oldMinutes = 解析标准时间分值(oldCanonical);
    if (oldMinutes == null) return false;
    return newMinutes < oldMinutes;
};

export type 响应命令处理状态 = {
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

type 响应命令处理依赖 = {
    规范化环境信息: (envLike?: any) => 环境信息结构;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    规范化世界状态: (raw?: any) => 世界数据结构;
    规范化战斗状态: (raw?: any) => 战斗状态结构;
    规范化门派状态: (raw?: any) => 详细门派结构;
    规范化剧情状态: (raw?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构 | undefined;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    规范化角色物品容器映射: (raw?: any, options?: { 当前时间?: unknown; 事件文本?: string }) => 角色数据结构;
    战斗结束自动清空: (battle: 战斗状态结构, story?: 剧情系统结构) => 战斗状态结构;
    设置角色?: (value: 角色数据结构) => void;
    设置环境?: (value: 环境信息结构) => void;
    设置社交?: (value: any[]) => void;
    设置世界?: (value: 世界数据结构) => void;
    设置战斗?: (value: 战斗状态结构) => void;
    设置玩家门派?: (value: 详细门派结构) => void;
    设置任务列表?: (value: any[]) => void;
    设置约定列表?: (value: any[]) => void;
    设置剧情?: (value: 剧情系统结构) => void;
    设置剧情规划?: (value: 剧情规划结构) => void;
    设置女主剧情规划?: (value: 女主剧情规划结构 | undefined) => void;
    设置同人剧情规划?: (value: 同人剧情规划结构 | undefined) => void;
    设置同人女主剧情规划?: (value: 同人女主剧情规划结构 | undefined) => void;
    命令后校准?: (state: 响应命令处理状态) => { state: 响应命令处理状态; corrections?: string[] } | 响应命令处理状态;
};

const 归一化文本键 = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().replace(/\s+/g, '').toLowerCase()
        : ''
);

const 噪声对白发送者片段正则 = /(?:轻声|低声|细语|小声|柔声|温声|沉声|冷声|厉声|压低|喃喃|喃语|嘀咕|说道|说着|问道|答道|开口|补充|解释|提醒|笑着|苦笑|皱眉|抬眼|抬头|看向|望向|回头|点头|摇头|叹息|擦净|将|把|并|却|已经|刚刚)/;
const 噪声对白发送者收尾正则 = /(?:地|着|了|道|问|说)$/;
const 噪声对白发送者完整短语正则 = /^(?:(?:他|她|它|你|我|他们|她们|对方|那人|此人|有人|众人))?(?:只能|只好|只得|不得不|勉强|连忙|赶紧|急忙|仍旧|还是|却|并|但|又|便|就|再)?(?:强辩|辩解|解释|补充|提醒|回答|答话|应声|开口|说道|说着|问道|答道|低声|轻声|沉声|苦笑|皱眉|点头|摇头|叹息|看向|望向|回头|抬眼|抬头|擦净)$/;

const 是否噪声对白发送者 = (sender: string): boolean => {
    const name = (sender || '').trim();
    if (!name) return true;
    if (/[，。！？；：、,.!?;:\s\n\r]/.test(name)) return true;
    if (噪声对白发送者完整短语正则.test(name)) return true;
    if (/^(?:他|她|它|你|我|他们|她们|对方|那人|此人|有人|众人).{1,10}$/.test(name) && 噪声对白发送者片段正则.test(name)) return true;
    if (name.length >= 4 && 噪声对白发送者收尾正则.test(name) && 噪声对白发送者片段正则.test(name)) return true;
    return false;
};

const 是否对白NPC发送者 = (senderRaw: unknown, playerNameRaw: unknown): boolean => {
    const sender = typeof senderRaw === 'string' ? senderRaw.trim() : '';
    if (!sender) return false;
    if (/^【?(?:旁白|判定|NSFW判定|免责声明|系统|旁述|叙述|作者|提示|错误)】?$/i.test(sender)) return false;
    if (/^(?:disclaimer|system|narrator|assistant|user)$/i.test(sender)) return false;
    if (是否噪声对白发送者(sender)) return false;
    const playerName = 归一化文本键(playerNameRaw);
    if (playerName && 归一化文本键(sender) === playerName) return false;
    return sender.length <= 16;
};

const 稳定哈希文本 = (text: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

const 补入对白发送者到社交 = (
    response: GameResponse,
    socialList: any[],
    playerName?: string
): any[] => {
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    if (logs.length <= 0) return socialList;

    const existingKeys = new Set(
        (Array.isArray(socialList) ? socialList : [])
            .flatMap((npc: any) => [npc?.id, npc?.姓名, npc?.名称])
            .map(归一化文本键)
            .filter(Boolean)
    );
    const dialogueNameKeys = new Set<string>();
    const pendingNames: string[] = [];
    logs.forEach((log: any) => {
        const sender = typeof log?.sender === 'string' ? log.sender.trim() : '';
        const key = 归一化文本键(sender);
        if (!是否对白NPC发送者(sender, playerName)) return;
        dialogueNameKeys.add(key);
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        pendingNames.push(sender);
    });

    const markedSocialList = (Array.isArray(socialList) ? socialList : []).map((npc: any) => {
        const keys = [npc?.id, npc?.姓名, npc?.名称].map(归一化文本键).filter(Boolean);
        if (!keys.some((key) => dialogueNameKeys.has(key))) return npc;
        return {
            ...npc,
            对白登场: true,
            自动补全头像: true
        };
    });

    if (pendingNames.length <= 0) return markedSocialList;
    const inferredNpcs = pendingNames.map((name) => ({
        id: `npc_dialogue_${稳定哈希文本(name)}`,
        姓名: name,
        性别: '未知',
        年龄: undefined,
        境界: '未知境界',
        身份: '剧情对话人物',
        是否在场: true,
        是否队友: false,
        是否主要角色: false,
        对白登场: true,
        自动补全头像: true,
        好感度: 0,
        关系状态: '初识',
        简介: `在剧情对话中登场的人物：${name}。`,
        记忆: []
    }));
    return [...markedSocialList, ...inferredNpcs];
};

const 拆分事实句 = (text: string): string[] => (
    (text || '')
        .split(/[。！？!?；;\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
);

const 提取对白发送者集合 = (response: GameResponse, playerName?: string): Set<string> => {
    const result = new Set<string>();
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    logs.forEach((log: any) => {
        const sender = typeof log?.sender === 'string' ? log.sender.trim() : '';
        if (!是否对白NPC发送者(sender, playerName)) return;
        result.add(归一化文本键(sender));
    });
    return result;
};

const 现场缺席事实正则 = /(不在(?:场|此处|现场|身边)|未在(?:场|此处|现场|身边)|离场|离开|退下|退走|散去|走远|远在|留守|待命|守在|守于|驻守|回到|返回|躲在|藏在|被押走|被带走|被拖走|逃走|逃离|不见踪影)/;
const 现场确认事实正则 = /(在场|在此|现场|身侧|身旁|旁边|面前|眼前|跟前|近前|席间|堂中|厅中|屋内|房内|院中|站在|立在|坐在|跪在|伏在|靠在|走进|进入|赶来|来到|现身|出声|开口|说道|问道|答道|回应|看着|望向|盯着|拔刀|出手|跪下|行礼|沉默|皱眉|冷笑|微笑)/;
const 同行确认事实正则 = /(同行|随行|随队|随我|随主角|跟随|跟着|一同|一起|同去|同往|同来|带着|领着|率领|听令|听命|出列|列队|编队|队伍|队友|同伴|伴随|护送|压阵|随身|并肩|并行)/;
const 同行离队事实正则 = /(离队|退队|不再同行|不再随行|分道扬镳|各自行动|分头行动|留守|待命|退下|退走|离开|散去|走远|留在|驻守)/;
const 同行群体事实正则 = /((?:约|近|将近|足有|共有|共)?[一二三四五六七八九十百千万两\d]{1,5}(?:余|多|来)?(?:个|名|位|队|群|拨|批)?[^。！？\n\r]{0,16}(?:同门|师弟|师兄|师妹|弟子|门人|护卫|随从|部众|精锐|人手|队员|帮众|兵卒|亲卫|随员|船工|水手|镖师))/;
const 敌对或阻拦事实正则 = /(敌方|敌人|敌军|敌阵|敌手|对手|贼人|杀手|守卫|护院|拦路|拦住|阻拦|围住|围攻|袭击|攻击|交战|厮杀|追杀|堵截|拔刀相向|兵刃相向)/;
const 随行者占位名正则 = /^随行者([1-9]\d*)$/;

const NPC已死亡 = (npc: any): boolean => {
    const statusText = [
        npc?.死亡描述,
        ...(Array.isArray(npc?.DEBUFF) ? npc.DEBUFF.flatMap((item: any) => [item?.名称, item?.描述, item?.效果]) : [])
    ].filter(Boolean).join(' ');
    return 死亡状态正则.test(statusText);
};

const 判断NPC本回合是否在场 = (
    npc: any,
    responseFactText: string,
    dialogueSenderKeys: Set<string>
): boolean | undefined => {
    const name = 读取NPC名称(npc);
    const key = 归一化文本键(name);
    if (key && dialogueSenderKeys.has(key)) return true;
    if (!name || !responseFactText.includes(name)) return false;
    const relatedSentences = 拆分事实句(responseFactText).filter((sentence) => sentence.includes(name));
    if (relatedSentences.length <= 0) return false;
    if (relatedSentences.some((sentence) => 现场缺席事实正则.test(sentence))) return false;
    if (relatedSentences.some((sentence) => 现场确认事实正则.test(sentence))) return true;
    if (relatedSentences.some((sentence) => 同行确认事实正则.test(sentence))) return true;
    return undefined;
};

const 构建环境位置路径 = (env?: Partial<环境信息结构> | null): string => (
    [env?.大地点, env?.中地点, env?.小地点, env?.具体地点]
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean)
        .join(' > ')
);

const 同步在场NPC当前位置 = (
    socialList: any[],
    env?: Partial<环境信息结构> | null
): any[] => {
    if (!Array.isArray(socialList) || socialList.length <= 0) return socialList;
    const currentLocation = typeof env?.具体地点 === 'string' && env.具体地点.trim()
        ? env.具体地点.trim()
        : ([env?.小地点, env?.中地点, env?.大地点]
            .map((item) => typeof item === 'string' ? item.trim() : '')
            .find(Boolean) || '');
    const locationPath = 构建环境位置路径(env);
    if (!currentLocation && !locationPath) return socialList;

    return socialList.map((npc: any) => {
        if (!npc || typeof npc !== 'object' || npc.是否在场 !== true) return npc;
        const next = { ...npc };
        if (currentLocation) {
            next.当前位置 = currentLocation;
            next.当前地点 = currentLocation;
        }
        if (locationPath) next.位置路径 = locationPath;
        return next;
    });
};

const 同步当前视角在场状态 = (
    response: GameResponse,
    socialList: any[],
    playerName?: string
): any[] => {
    if (!Array.isArray(socialList) || socialList.length <= 0) return socialList;
    const responseFactText = 提取响应事实文本(response);
    if (!responseFactText.trim()) return socialList;
    const dialogueSenderKeys = 提取对白发送者集合(response, playerName);
    return socialList.map((npc: any) => {
        if (!npc || typeof npc !== 'object') return npc;
        if (NPC已死亡(npc)) return { ...npc, 是否在场: false };
        const nextPresent = 判断NPC本回合是否在场(npc, responseFactText, dialogueSenderKeys);
        if (nextPresent === undefined) return npc;
        return npc.是否在场 === nextPresent ? npc : { ...npc, 是否在场: nextPresent };
    });
};

const 中文数字值: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
};

const 解析中文整数 = (value: string): number => {
    const text = (value || '').trim();
    if (!text) return NaN;
    const digit = Number(text);
    if (Number.isFinite(digit)) return digit;
    if (!text.includes('十')) return 中文数字值[text] ?? NaN;
    const [left, right] = text.split('十');
    const tens = left ? (中文数字值[left] ?? NaN) : 1;
    const ones = right ? (中文数字值[right] ?? NaN) : 0;
    if (!Number.isFinite(tens) || !Number.isFinite(ones)) return NaN;
    return tens * 10 + ones;
};

const 提取人数 = (text: string): number => {
    const match = (text || '').match(/(?:约|近|将近|足有|共有|共)?([一二三四五六七八九十两\d]{1,5})(?:余|多|来)?(?:个|名|位|人|队员|同门|弟子|护卫|随从|精锐|水手|镖师|兵卒|亲卫|随员)?/);
    const value = match ? 解析中文整数(match[1]) : NaN;
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(80, Math.floor(value)));
};

const 构建随行者ID = (groupLabel: string, index: number): string => `npc_companion_${稳定哈希文本(groupLabel)}_${index}`;

const 提取同行群体信息 = (responseFactText: string): { 名称: string; 人数: number } | null => {
    const sentences = 拆分事实句(responseFactText);
    const matchedSentence = sentences.find((sentence) => (
        同行确认事实正则.test(sentence)
        && !同行离队事实正则.test(sentence)
        && !敌对或阻拦事实正则.test(sentence)
        && 同行群体事实正则.test(sentence)
    ));
    const raw = matchedSentence?.match(同行群体事实正则)?.[1]?.trim() || '';
    if (!raw) return null;
    const 名称 = raw.replace(/^(?:约|近|将近|足有|共有|共)/, '').replace(/\s+/g, '');
    const 人数 = 提取人数(raw);
    return 人数 > 0 ? { 名称, 人数 } : null;
};

const 是否随行群体条目 = (npc: any): boolean => {
    const name = 读取NPC名称(npc);
    const identity = typeof npc?.身份 === 'string' ? npc.身份.trim() : '';
    return identity === '随行队伍' || (npc?.是否队友 === true && 提取人数(name) > 1 && /同门|弟子|护卫|随从|精锐|队伍|队员|水手|镖师|兵卒|亲卫|随员|难度/.test(name));
};

const 创建随行者条目 = (groupLabel: string, index: number, template?: any): any => ({
    ...(template && typeof template === 'object' ? template : {}),
    id: 构建随行者ID(groupLabel, index),
    姓名: `随行者${index}`,
    性别: template?.性别 || '未知',
    年龄: template?.年龄,
    境界: template?.境界 || '未知境界',
    身份: template?.身份 && template.身份 !== '随行队伍' ? template.身份 : '随行者',
    是否在场: true,
    是否队友: true,
    是否主要角色: false,
    好感度: Number.isFinite(Number(template?.好感度)) ? Number(template.好感度) : 0,
    关系状态: '同行',
    简介: `本回合剧情明确随主角行动的第 ${index} 名成员，来源：${groupLabel}。`,
    记忆: Array.isArray(template?.记忆) ? template.记忆 : []
});

const 拆分随行群体条目 = (list: any[]): any[] => {
    const result: any[] = [];
    const existingNames = new Set(
        (Array.isArray(list) ? list : [])
            .map((npc: any) => 读取NPC名称(npc))
            .filter((name: string) => name && !随行者占位名正则.test(name))
    );
    (Array.isArray(list) ? list : []).forEach((npc: any) => {
        if (!npc || typeof npc !== 'object' || !是否随行群体条目(npc)) {
            result.push(npc);
            return;
        }
        const groupLabel = 读取NPC名称(npc) || npc?.简介 || '随行队伍';
        const count = 提取人数(groupLabel);
        if (count <= 1) {
            result.push(npc);
            return;
        }
        for (let i = 1; i <= count; i += 1) {
            const placeholderName = `随行者${i}`;
            if (existingNames.has(placeholderName)) continue;
            result.push(创建随行者条目(groupLabel, i, npc));
        }
    });
    return result;
};

const 提取响应实名 = (response: GameResponse, playerName?: string): string[] => {
    const names: string[] = [];
    const seen = new Set<string>();
    const push = (value: unknown) => {
        const name = typeof value === 'string' ? value.trim() : '';
        if (!是否对白NPC发送者(name, playerName)) return;
        const key = 归一化文本键(name);
        if (!key || seen.has(key) || 随行者占位名正则.test(name)) return;
        seen.add(key);
        names.push(name);
    };
    (Array.isArray(response?.logs) ? response.logs : []).forEach((log: any) => push(log?.sender));
    return names;
};

const 是否明确同行实名 = (name: string, responseFactText: string): boolean => {
    const key = 归一化文本键(name);
    if (!key) return false;
    return 拆分事实句(responseFactText).some((sentence) => (
        sentence.includes(name)
        && 同行确认事实正则.test(sentence)
        && !同行离队事实正则.test(sentence)
        && !敌对或阻拦事实正则.test(sentence)
    ));
};

const 用实名替换随行占位 = (response: GameResponse, list: any[], playerName?: string): any[] => {
    const names = 提取响应实名(response, playerName);
    if (names.length <= 0 || !Array.isArray(list) || list.length <= 0) return list;
    const responseFactText = 提取响应事实文本(response);
    let next = [...list];
    let changed = false;
    names.forEach((name) => {
        if (!是否明确同行实名(name, responseFactText)) return;
        const nameKey = 归一化文本键(name);
        const existingIndex = next.findIndex((npc: any) => 归一化文本键(读取NPC名称(npc)) === nameKey);
        const placeholderIndex = next.findIndex((npc: any) => npc?.是否队友 === true && 随行者占位名正则.test(读取NPC名称(npc)));
        if (placeholderIndex < 0) {
            if (existingIndex >= 0) {
                const npc = next[existingIndex];
                if (npc?.是否队友 !== true || npc?.是否在场 !== true) {
                    next[existingIndex] = { ...npc, 是否队友: true, 是否在场: true };
                    changed = true;
                }
            }
            return;
        }
        const existing = existingIndex >= 0 ? next[existingIndex] : null;
        const placeholder = next[placeholderIndex];
        next[placeholderIndex] = {
            ...placeholder,
            ...(existing && typeof existing === 'object' ? existing : {}),
            id: existing?.id || `npc_companion_named_${稳定哈希文本(name)}`,
            姓名: name,
            是否在场: true,
            是否队友: true,
            关系状态: existing?.关系状态 && existing.关系状态 !== '未知' ? existing.关系状态 : '同行',
            简介: existing?.简介 || `原随行占位成员已在正文中点名为：${name}。`
        };
        if (existingIndex >= 0 && existingIndex !== placeholderIndex) {
            next = next.filter((_, index) => index !== existingIndex);
        }
        changed = true;
    });
    return changed ? next : list;
};

const 应用同行事实到队伍 = (
    response: GameResponse,
    socialList: any[],
    playerName?: string
): any[] => {
    if (!Array.isArray(socialList)) return socialList;
    const responseFactText = 提取响应事实文本(response);
    if (!responseFactText.trim()) return socialList;
    const sentences = 拆分事实句(responseFactText);
    let changed = false;
    const nextList = socialList.map((npc: any) => {
        if (!npc || typeof npc !== 'object') return npc;
        const name = 读取NPC名称(npc);
        if (!name || 归一化文本键(name) === 归一化文本键(playerName)) return npc;
        const relatedSentences = sentences.filter((sentence) => sentence.includes(name));
        if (relatedSentences.length <= 0) return npc;
        if (relatedSentences.some((sentence) => 同行离队事实正则.test(sentence))) {
            if (npc.是否队友 !== true) return npc;
            changed = true;
            return { ...npc, 是否队友: false };
        }
        if (!relatedSentences.some((sentence) => 同行确认事实正则.test(sentence))) return npc;
        if (npc.是否队友 === true && npc.是否在场 === true) return npc;
        changed = true;
        return {
            ...npc,
            是否队友: true,
            是否在场: true,
            关系状态: typeof npc.关系状态 === 'string' && npc.关系状态.trim() && npc.关系状态 !== '未知'
                ? npc.关系状态
                : '同行'
        };
    });

    const expandedExisting = 拆分随行群体条目(nextList);
    const groupInfo = 提取同行群体信息(responseFactText);
    const withGroup = (() => {
        if (!groupInfo) return expandedExisting;
        const existingCompanionCount = expandedExisting.filter((npc: any) => npc?.是否队友 === true).length;
        if (existingCompanionCount >= groupInfo.人数) return expandedExisting;
        const additions: any[] = [];
        for (let i = existingCompanionCount + 1; i <= groupInfo.人数; i += 1) {
            additions.push(创建随行者条目(groupInfo.名称, i));
        }
        return [...expandedExisting, ...additions];
    })();
    const renamed = 用实名替换随行占位(response, withGroup, playerName);
    return changed || renamed !== socialList ? renamed : socialList;
};

const 装备槽位列表 = ['头部', '胸部', '盔甲', '内衬', '腿部', '手部', '足部', '主武器', '副武器', '暗器', '背部', '腰部', '坐骑'] as const;
type 装备槽位 = typeof 装备槽位列表[number];
const 装备槽位集合 = new Set<string>(装备槽位列表);

const 是空装备值 = (value: unknown): boolean => (
    value === undefined
    || value === null
    || (typeof value === 'string' && /^(?:|无|空置|空|none|null|undefined)$/i.test(value.trim()))
);

const 提取响应事实文本 = (response: GameResponse): string => {
    const parts: string[] = [];
    if (typeof (response as any)?.body === 'string') parts.push((response as any).body);
    if (typeof (response as any)?.正文 === 'string') parts.push((response as any).正文);
    if (typeof (response as any)?.summary === 'string') parts.push((response as any).summary);
    if (Array.isArray(response?.logs)) {
        response.logs.forEach((log: any) => {
            if (typeof log?.content === 'string') parts.push(log.content);
            if (typeof log?.text === 'string') parts.push(log.text);
            if (typeof log?.message === 'string') parts.push(log.message);
        });
    }
    return parts.join('\n');
};

const 体内射精事实正则 = /(内射|中出|射(?:进|入|在)(?:了)?(?:[^。！？\n\r]{0,24})?(?:体内|阴道|小穴|蜜穴|子宫|宫口|最深处)|精液(?:[^。！？\n\r]{0,24})?(?:灌入|注入|射入|填满|流入|涌入|进入)(?:[^。！？\n\r]{0,24})?(?:体内|阴道|小穴|蜜穴|子宫|宫口|最深处)|(?:子宫|宫口|最深处)(?:[^。！？\n\r]{0,24})?(?:精液|白浊))/;
const 初次关系事实正则 = /(破处|初夜|第一次|失身|处子(?:之身)?(?:已|被|给|让)?|不再是处女|不再未经人事|插(?:进|入)|贯穿|进入(?:了)?(?:[^。！？\n\r]{0,24})?(?:小穴|阴道|蜜穴|体内|最深处)|(?:小穴|阴道|蜜穴)(?:[^。！？\n\r]{0,24})?(?:被|已|让)?(?:进入|占有|贯穿|破开)|体内射精|内射|中出)/;
const 私密状态未经历正则 = /(未经人事|未经房事|未曾人事|未曾经人事|尚未人事|尚未完全开发|未完全开发|处子|处女|完璧|无人采撷|未被使用|未曾使用|未开苞|初绽未开)/;

const 是否女性NPC = (npc: any): boolean => (
    typeof npc?.性别 === 'string' && npc.性别.trim() === '女'
);

const 读取NPC名称 = (npc: any): string => (
    typeof npc?.姓名 === 'string' && npc.姓名.trim()
        ? npc.姓名.trim()
        : typeof npc?.名称 === 'string' && npc.名称.trim()
            ? npc.名称.trim()
            : ''
);

const 提取生理事实相关女性NPC索引 = (responseFactText: string, socialList: any[]): number | null => {
    if (!体内射精事实正则.test(responseFactText) && !初次关系事实正则.test(responseFactText)) return null;

    const femaleCandidates = (Array.isArray(socialList) ? socialList : [])
        .map((npc: any, index: number) => ({ npc, index, name: 读取NPC名称(npc) }))
        .filter((item) => 是否女性NPC(item.npc));
    if (femaleCandidates.length <= 0) return null;

    const mentioned = femaleCandidates.filter((item) => item.name && responseFactText.includes(item.name));
    if (mentioned.length === 1) return mentioned[0].index;
    if (mentioned.length > 1) {
        const presentMentioned = mentioned.filter((item) => item.npc?.是否在场 === true);
        if (presentMentioned.length === 1) return presentMentioned[0].index;
        const mainMentioned = mentioned.filter((item) => item.npc?.是否主要角色 === true);
        if (mainMentioned.length === 1) return mainMentioned[0].index;
        return mentioned[0].index;
    }

    const presentFemale = femaleCandidates.filter((item) => item.npc?.是否在场 === true);
    if (presentFemale.length === 1) return presentFemale[0].index;
    return null;
};

const 构建体内射精记录描述 = (responseFactText: string, playerName?: string): string => {
    const normalized = responseFactText.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/[^。！？\n\r]{0,36}(?:内射|中出|射(?:进|入)|精液|白浊|子宫|宫口)[^。！？\n\r]{0,56}[。！？]?/);
    const detail = (match?.[0] || '').trim();
    const actor = playerName || '主角';
    return detail ? `${actor}与其发生体内射精事件：${detail}` : `${actor}与其发生体内射精事件。`;
};

const 构建初夜描述 = (responseFactText: string, playerName?: string): string => {
    const normalized = responseFactText.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/[^。！？\n\r]{0,36}(?:破处|初夜|第一次|失身|插(?:进|入)|贯穿|进入|内射|中出)[^。！？\n\r]{0,56}[。！？]?/);
    const detail = (match?.[0] || '').trim();
    const actor = playerName || '主角';
    return detail ? `${actor}与其发生初次亲密关系：${detail}` : `${actor}与其发生初次亲密关系。`;
};

const 更新小穴经历状态描述 = (rawValue: unknown): string | undefined => {
    const text = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!text) return undefined;
    const stateNote = '已发生初次关系，原“未经人事”状态失效';
    if (text.includes(stateNote)) return text;
    if (私密状态未经历正则.test(text)) {
        return text.replace(私密状态未经历正则, stateNote);
    }
    return `${text}；状态：${stateNote}。`;
};

const 生成临时内射记录日期 = (envLike: any): string => (
    typeof envLike?.时间 === 'string' && envLike.时间.trim()
        ? envLike.时间.trim()
        : new Date().toISOString()
);

const 应用生理事实到女性NPC = (
    response: GameResponse,
    socialList: any[],
    envLike: any,
    playerName?: string
): any[] => {
    const responseFactText = 提取响应事实文本(response);
    const targetIndex = 提取生理事实相关女性NPC索引(responseFactText, socialList);
    if (targetIndex === null) return socialList;

    const hasInternalEjaculation = 体内射精事实正则.test(responseFactText);
    const hasFirstSexFact = hasInternalEjaculation || 初次关系事实正则.test(responseFactText);
    const eventDate = 生成临时内射记录日期(envLike);
    const description = 构建体内射精记录描述(responseFactText, playerName);
    const firstNightDescription = 构建初夜描述(responseFactText, playerName);
    return socialList.map((npc: any, index: number) => {
        if (index !== targetIndex || !npc || typeof npc !== 'object') return npc;
        const currentWomb = npc.子宫 && typeof npc.子宫 === 'object' ? npc.子宫 : {};
        const currentRecords = Array.isArray(currentWomb.内射记录) ? currentWomb.内射记录 : [];
        const alreadyRecorded = currentRecords.some((record: any) => (
            typeof record?.日期 === 'string'
            && record.日期 === eventDate
            && typeof record?.描述 === 'string'
            && record.描述.includes('体内射精事件')
        ));
        const nextRecords = alreadyRecorded
            ? currentRecords
            : [
                ...currentRecords,
                {
                    日期: eventDate,
                    描述: description,
                    怀孕判定日: '待判定'
                }
            ];
        const nextVulvaDescription = hasFirstSexFact ? 更新小穴经历状态描述(npc.小穴描述) : undefined;
        const shouldRecordFirstNight = hasFirstSexFact && (npc.是否处女 === true || typeof npc.是否处女 !== 'boolean' || !npc.初夜夺取者);
        return {
            ...npc,
            ...(hasFirstSexFact ? {
                是否处女: false,
                初夜夺取者: npc.初夜夺取者 || playerName || '主角',
                初夜时间: npc.初夜时间 || eventDate,
                初夜描述: npc.初夜描述 || (shouldRecordFirstNight ? firstNightDescription : undefined),
                ...(nextVulvaDescription ? { 小穴描述: nextVulvaDescription } : {})
            } : {}),
            子宫: {
                状态: typeof currentWomb.状态 === 'string' && currentWomb.状态.trim()
                    ? currentWomb.状态
                    : '未受孕',
                宫口状态: typeof currentWomb.宫口状态 === 'string' && currentWomb.宫口状态.trim()
                    ? currentWomb.宫口状态
                    : '射精后待观察',
                ...currentWomb,
                内射记录: hasInternalEjaculation ? nextRecords : currentRecords
            }
        };
    });
};

const 攻略目标事实正则 = /(攻略(?:目标|对象)|目标(?:女主|女性|女子|姑娘)|锁定(?:为)?(?:女主|攻略对象|攻略目标)|追求对象|心仪对象|倾慕对象|重点推进(?:对象)?|纳入(?:女主|攻略|关系)(?:线|对象|目标)?)/;
const 关系成立事实正则 = /(发生(?:了)?关系|确立(?:了)?关系|关系(?:已经|正式)?(?:成立|确定|突破|升温)|成为(?:道侣|伴侣|恋人|情人|红颜|妻子|夫人)|结为(?:道侣|伴侣|夫妻)|定情|互许终身|私定终身|双修关系|亲密关系(?:成立|确定|突破)?|初次亲密关系|初夜|破处|失身|内射|中出)/;
const 关系目标字段正则 = /(攻略|女主|目标|追求|心仪|倾慕|恋人|伴侣|道侣|情人|红颜|妻子|夫人|定情|亲密|初夜|失身|双修|发生关系|关系突破)/;

const 提取关系目标事实文本 = (response: GameResponse): string => {
    const parts = [提取响应事实文本(response)];
    if (Array.isArray(response?.tavern_commands)) {
        response.tavern_commands.forEach((cmd: any) => {
            parts.push(typeof cmd?.key === 'string' ? cmd.key : '');
            if (typeof cmd?.value === 'string') {
                parts.push(cmd.value);
            } else if (cmd?.value && typeof cmd.value === 'object') {
                try {
                    parts.push(JSON.stringify(cmd.value));
                } catch {
                    // ignore non-serializable command values
                }
            }
        });
    }
    return parts.filter(Boolean).join('\n');
};

const NPC字段是否含关系目标语义 = (npc: any): boolean => {
    const scalarText = [
        npc?.关系状态,
        npc?.身份,
        npc?.简介,
        npc?.核心性格特征,
        npc?.关系突破条件,
        npc?.好感度突破条件,
        npc?.对主角称呼,
        npc?.备注,
        npc?.标签
    ].filter((value) => typeof value === 'string').join(' ');
    if (关系目标字段正则.test(scalarText)) return true;
    const relationText = Array.isArray(npc?.关系网变量)
        ? npc.关系网变量.map((item: any) => [item?.对象姓名, item?.关系, item?.备注].filter(Boolean).join(' ')).join(' ')
        : '';
    if (关系目标字段正则.test(relationText)) return true;
    const memoryText = Array.isArray(npc?.记忆)
        ? npc.记忆.map((item: any) => typeof item?.内容 === 'string' ? item.内容 : '').join(' ')
        : '';
    return 关系目标字段正则.test(memoryText);
};

const 应用女性关系目标主要角色兜底 = (
    response: GameResponse,
    socialList: any[]
): any[] => {
    if (!Array.isArray(socialList) || socialList.length <= 0) return socialList;
    const factText = 提取关系目标事实文本(response);
    const hasGlobalTargetFact = 攻略目标事实正则.test(factText) || 关系成立事实正则.test(factText);
    let changed = false;
    const nextList = socialList.map((npc: any) => {
        if (!npc || typeof npc !== 'object' || !是否女性NPC(npc) || npc?.是否主要角色 === true) return npc;
        const name = 读取NPC名称(npc);
        const mentionedAsTarget = Boolean(name && factText.includes(name) && hasGlobalTargetFact);
        const fieldMarked = NPC字段是否含关系目标语义(npc);
        if (!mentionedAsTarget && !fieldMarked) return npc;
        changed = true;
        return { ...npc, 是否主要角色: true };
    });
    return changed ? nextList : socialList;
};

const 死亡事实肯定正则 = /(死亡|已死|身亡|阵亡|战死|气绝|断气|毙命|殒命|咽气|当场(?:死|亡|身亡|毙命)|再无(?:气息|生机)|命丧|头颅落地|心脉(?:断绝|俱断)|被[^。！？\n\r]{0,24}杀死|杀死(?:了)?)/;
const 死亡事实否定正则 = /(未死|没死|没有死|并未死|尚未死|不曾死|差点|险些|几乎|差一点|差些|昏死|假死|装死|濒死|垂死|重伤|保住(?:了)?性命|留有一线生机|逃过一劫)/;
const 死亡状态正则 = /(死亡|已死|身亡|阵亡|战死|气绝|断气|毙命|殒命|已故)/;

const 提取死亡事实句 = (responseFactText: string): string => {
    const sentences = 拆分事实句(responseFactText);
    return sentences.find((sentence) => 死亡事实肯定正则.test(sentence) && !死亡事实否定正则.test(sentence)) || '';
};

const 提取死亡事实相关NPC索引 = (deathSentence: string, socialList: any[]): number | null => {
    if (!deathSentence) return null;
    const candidates = (Array.isArray(socialList) ? socialList : [])
        .map((npc: any, index: number) => ({ npc, index, name: 读取NPC名称(npc) }))
        .filter((item) => item.name);
    const mentioned = candidates.filter((item) => deathSentence.includes(item.name));
    if (mentioned.length === 1) return mentioned[0].index;
    if (mentioned.length > 1) {
        const scored = mentioned
            .map((item) => {
                const escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const 被动死亡 = new RegExp(`${escapedName}[^。！？\\n\\r]{0,12}被[^。！？\\n\\r]{0,36}(?:杀死|斩杀|击杀|害死|毙命|贯穿|斩落|刺死|砍死)`).test(deathSentence);
                const 主体死亡 = new RegExp(`${escapedName}[^。！？\\n\\r]{0,24}(?:死亡|已死|身亡|阵亡|战死|气绝|断气|毙命|殒命|咽气|再无(?:气息|生机)|心脉(?:断绝|俱断))`).test(deathSentence);
                const 宾语死亡 = new RegExp(`(?:杀死|斩杀|击杀|害死|刺死|砍死)(?:了)?[^。！？\\n\\r]{0,12}${escapedName}`).test(deathSentence);
                const 疑似施害者 = new RegExp(`${escapedName}[^。！？\\n\\r]{0,12}(?:杀死|斩杀|击杀|害死|刺死|砍死)`).test(deathSentence);
                return {
                    ...item,
                    score: (被动死亡 ? 4 : 0) + (主体死亡 ? 3 : 0) + (宾语死亡 ? 4 : 0) - (疑似施害者 ? 3 : 0)
                };
            })
            .sort((a, b) => b.score - a.score || deathSentence.indexOf(a.name) - deathSentence.indexOf(b.name));
        if (scored[0]?.score > 0 && scored[0].score > (scored[1]?.score ?? -Infinity)) return scored[0].index;
        const presentMentioned = mentioned.filter((item) => item.npc?.是否在场 === true);
        if (presentMentioned.length === 1) return presentMentioned[0].index;
        const exactNameFirst = [...mentioned].sort((a, b) => deathSentence.indexOf(a.name) - deathSentence.indexOf(b.name));
        return exactNameFirst[0].index;
    }
    return null;
};

const NPC死亡字段含无依据死亡状态 = (npc: any): boolean => {
    const statusText = [npc?.状态, npc?.生死状态, npc?.生命状态].filter(Boolean).join(' ');
    return 死亡状态正则.test(statusText);
};

const NPC已有死亡依据 = (npc: any): boolean => {
    const evidenceText = [
        npc?.死亡描述,
        ...(Array.isArray(npc?.DEBUFF) ? npc.DEBUFF.flatMap((item: any) => [item?.名称, item?.描述, item?.效果]) : [])
    ].filter(Boolean).join(' ');
    return 死亡状态正则.test(evidenceText);
};

const 清理无依据死亡状态 = (socialList: any[]): any[] => {
    if (!Array.isArray(socialList) || socialList.length <= 0) return socialList;
    let changed = false;
    const nextList = socialList.map((npc: any) => {
        if (!npc || typeof npc !== 'object') return npc;
        if (!NPC死亡字段含无依据死亡状态(npc) || NPC已有死亡依据(npc)) return npc;
        changed = true;
        const next = { ...npc };
        if (死亡状态正则.test(String(next.状态 || ''))) {
            const hp = Number(next.当前血量);
            const maxHp = Number(next.最大血量);
            if (Number.isFinite(hp) && hp <= 0 && Number.isFinite(maxHp) && maxHp > 0) {
                next.状态 = '重伤';
            } else {
                delete next.状态;
            }
        }
        if (死亡状态正则.test(String(next.生死状态 || ''))) delete next.生死状态;
        if (死亡状态正则.test(String(next.生命状态 || ''))) delete next.生命状态;
        if (死亡状态正则.test(String(next.死亡描述 || ''))) delete next.死亡描述;
        return next;
    });
    return changed ? nextList : socialList;
};

const 生成死亡事实日期 = (envLike: any): string => (
    typeof envLike?.时间 === 'string' && envLike.时间.trim()
        ? envLike.时间.trim()
        : new Date().toISOString()
);

const 应用死亡事实到NPC = (
    response: GameResponse,
    socialList: any[],
    envLike: any
): any[] => {
    const responseFactText = 提取响应事实文本(response);
    const deathSentence = 提取死亡事实句(responseFactText);
    const targetIndex = 提取死亡事实相关NPC索引(deathSentence, socialList);
    if (targetIndex === null) return 清理无依据死亡状态(socialList);

    const eventDate = 生成死亡事实日期(envLike);
    return socialList.map((npc: any, index: number) => {
        if (index !== targetIndex || !npc || typeof npc !== 'object') return npc;
        const currentDebuffs = Array.isArray(npc.DEBUFF) ? npc.DEBUFF : [];
        const hasDeathDebuff = currentDebuffs.some((item: any) => {
            const text = [item?.名称, item?.描述, item?.效果].filter(Boolean).join(' ');
            return 死亡状态正则.test(text);
        });
        const deathDebuff = {
            名称: '死亡',
            描述: deathSentence || '角色已死亡。',
            效果: '角色已死亡，气血归零，不能继续作为在场行动角色。',
            开始时间: eventDate,
            结束时间: '永久'
        };
        return {
            ...npc,
            当前血量: 0,
            状态: '死亡',
            生死状态: '死亡',
            生命状态: '死亡',
            是否在场: false,
            死亡时间: npc.死亡时间 || eventDate,
            死亡描述: npc.死亡描述 || deathSentence,
            DEBUFF: hasDeathDebuff
                ? currentDebuffs.map((item: any) => {
                    const text = [item?.名称, item?.描述, item?.效果].filter(Boolean).join(' ');
                    return 死亡状态正则.test(text)
                        ? { ...deathDebuff, ...item, 名称: item?.名称 || '死亡' }
                        : item;
                })
                : [...currentDebuffs, deathDebuff]
        };
    });
};

const 装备移除触发正则 = /(卸下|脱下|取下|摘下|换下|换装|更换|丢弃|扔掉|遗弃|卖出|售卖|出售|卖给|卖了|卖掉|上架|典当|赠予|交给|交出|缴械|被夺|夺走|抢走|没收|遗失|失落|掉落|损坏|毁坏|破碎|断裂|烧毁|腐蚀|消耗|报废|解除装备|卸除装备)/;

const 命令是否有装备移除触发 = (cmd: any, responseFactText: string): boolean => {
    const commandText = [
        cmd?.key,
        typeof cmd?.value === 'string' ? cmd.value : '',
        typeof cmd?.reason === 'string' ? cmd.reason : '',
        typeof cmd?.原因 === 'string' ? cmd.原因 : '',
        typeof cmd?.说明 === 'string' ? cmd.说明 : '',
        responseFactText
    ].filter(Boolean).join('\n');
    return 装备移除触发正则.test(commandText);
};

const 净化角色装备命令 = (
    cmd: any,
    currentEquipment: Record<string, any>,
    responseFactText: string
): any | null => {
    const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
    if (!normalizedKey.startsWith('gameState.角色.装备')) return cmd;
    const action = (cmd?.action || 'set') as string;
    const allowRemoval = 命令是否有装备移除触发(cmd, responseFactText);
    if (allowRemoval) return cmd;

    const rest = normalizedKey.slice('gameState.角色.装备'.length).replace(/^\./, '');
    if (!rest) {
        if (action === 'delete') return null;
        if (cmd?.value && typeof cmd.value === 'object' && !Array.isArray(cmd.value)) {
            const nextValue = { ...cmd.value };
            let changed = false;
            装备槽位列表.forEach((slot) => {
                if (!(slot in nextValue)) return;
                if (!是空装备值(nextValue[slot])) return;
                if (是空装备值(currentEquipment?.[slot])) return;
                nextValue[slot] = currentEquipment[slot];
                changed = true;
            });
            return changed ? { ...cmd, value: nextValue } : cmd;
        }
        if (是空装备值(cmd?.value) && Object.values(currentEquipment || {}).some((value) => !是空装备值(value))) {
            return null;
        }
        return cmd;
    }

    const slot = rest.split(/[.\[]/, 1)[0];
    if (!装备槽位集合.has(slot)) return cmd;
    if ((action === 'delete' || 是空装备值(cmd?.value)) && !是空装备值(currentEquipment?.[slot])) {
        return null;
    }
    return cmd;
};

export const 执行响应命令处理 = (
    response: GameResponse,
    currentState: 响应命令处理状态,
    deps: 响应命令处理依赖,
    baseState?: Partial<响应命令处理状态>,
    options?: {
        applyState?: boolean;
    }
): 响应命令处理状态 => {
    const shouldApplyState = options?.applyState !== false;
    let charBuffer = baseState?.角色 || currentState.角色;
    let envBuffer = deps.规范化环境信息(baseState?.环境 || currentState.环境);
    let socialBuffer = Array.isArray(baseState?.社交) ? baseState.社交 : currentState.社交;
    let worldBuffer = deps.规范化世界状态(baseState?.世界 || currentState.世界);
    let battleBuffer = deps.规范化战斗状态(baseState?.战斗 || currentState.战斗);
    let sectBuffer = deps.规范化门派状态(baseState?.玩家门派 || currentState.玩家门派);
    let tasksBuffer = Array.isArray(baseState?.任务列表) ? baseState.任务列表 : currentState.任务列表;
    let agreementsBuffer = Array.isArray(baseState?.约定列表) ? baseState.约定列表 : currentState.约定列表;
    let storyBuffer = deps.规范化剧情状态(baseState?.剧情 || currentState.剧情);
    let storyPlanBuffer = deps.规范化剧情规划状态(baseState?.剧情规划 || currentState.剧情规划);
    let heroinePlanBuffer = deps.规范化女主剧情规划状态(baseState?.女主剧情规划 ?? currentState.女主剧情规划);
    let fandomStoryPlanBuffer = deps.规范化同人剧情规划状态(baseState?.同人剧情规划 ?? currentState.同人剧情规划);
    let fandomHeroinePlanBuffer = deps.规范化同人女主剧情规划状态(baseState?.同人女主剧情规划 ?? currentState.同人女主剧情规划);

    const responseFactText = 提取响应事实文本(response);
    if (Array.isArray(response.tavern_commands)) {
        response.tavern_commands.forEach(cmd => {
            const safeCmd = sanitizeInventoryCommand(
                净化角色装备命令(cmd, charBuffer?.装备 || {}, responseFactText),
                charBuffer,
                responseFactText
            );
            if (!safeCmd) return;
            if (是否游戏初始时间命令(safeCmd.key)) {
                return;
            }
            if (是否环境时间命令(safeCmd.key) && safeCmd.action === 'set') {
                if (是否时间回退或异常重置(envBuffer?.时间, safeCmd.value)) {
                    return;
                }
            }
            const result = applyStateCommand(
                charBuffer,
                envBuffer,
                socialBuffer,
                worldBuffer,
                battleBuffer,
                storyBuffer,
                storyPlanBuffer,
                heroinePlanBuffer,
                fandomStoryPlanBuffer,
                fandomHeroinePlanBuffer,
                sectBuffer,
                tasksBuffer,
                agreementsBuffer,
                safeCmd.key,
                safeCmd.value,
                safeCmd.action
            );
            charBuffer = result.char;
            envBuffer = result.env;
            socialBuffer = result.social;
            worldBuffer = result.world;
            battleBuffer = result.battle;
            sectBuffer = result.sect;
            tasksBuffer = Array.isArray(result.tasks) ? result.tasks : [];
            agreementsBuffer = Array.isArray(result.agreements) ? result.agreements : [];
            storyBuffer = result.story;
            storyPlanBuffer = result.storyPlan;
            heroinePlanBuffer = result.heroinePlan;
            fandomStoryPlanBuffer = result.fandomStoryPlan;
            fandomHeroinePlanBuffer = result.fandomHeroinePlan;
        });

        envBuffer = deps.规范化环境信息(envBuffer);
        socialBuffer = deps.规范化社交列表(socialBuffer, { 合并同名: false });
        worldBuffer = deps.规范化世界状态(worldBuffer);
        sectBuffer = deps.规范化门派状态(sectBuffer);
        storyPlanBuffer = deps.规范化剧情规划状态(storyPlanBuffer);
        heroinePlanBuffer = deps.规范化女主剧情规划状态(heroinePlanBuffer);
        fandomStoryPlanBuffer = deps.规范化同人剧情规划状态(fandomStoryPlanBuffer);
        fandomHeroinePlanBuffer = deps.规范化同人女主剧情规划状态(fandomHeroinePlanBuffer);

        battleBuffer = deps.战斗结束自动清空(battleBuffer, storyBuffer);
        charBuffer = deps.规范化角色物品容器映射(charBuffer, {
            当前时间: envBuffer,
            事件文本: responseFactText
        });
        socialBuffer = deps.规范化社交列表(
            补入对白发送者到社交(response, socialBuffer, charBuffer?.姓名),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            应用生理事实到女性NPC(response, socialBuffer, envBuffer, charBuffer?.姓名),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            应用女性关系目标主要角色兜底(response, socialBuffer),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            应用死亡事实到NPC(response, socialBuffer, envBuffer),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            同步当前视角在场状态(response, socialBuffer, charBuffer?.姓名),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            应用同行事实到队伍(response, socialBuffer, charBuffer?.姓名),
            { 合并同名: false }
        );
        socialBuffer = deps.规范化社交列表(
            同步在场NPC当前位置(socialBuffer, envBuffer),
            { 合并同名: false }
        );
        storyBuffer = deps.规范化剧情状态(storyBuffer);

        let finalState: 响应命令处理状态 = {
            角色: charBuffer,
            环境: deps.规范化环境信息(envBuffer),
            社交: socialBuffer,
            世界: deps.规范化世界状态(worldBuffer),
            战斗: battleBuffer,
            玩家门派: deps.规范化门派状态(sectBuffer),
            任务列表: 规范化任务列表自动结算(Array.isArray(tasksBuffer) ? tasksBuffer : []),
            约定列表: Array.isArray(agreementsBuffer) ? agreementsBuffer : [],
            剧情: storyBuffer,
            剧情规划: deps.规范化剧情规划状态(storyPlanBuffer),
            女主剧情规划: deps.规范化女主剧情规划状态(heroinePlanBuffer),
            同人剧情规划: deps.规范化同人剧情规划状态(fandomStoryPlanBuffer),
            同人女主剧情规划: deps.规范化同人女主剧情规划状态(fandomHeroinePlanBuffer)
        };
        const calibrated = deps.命令后校准?.(finalState);
        if (calibrated) {
            finalState = 'state' in calibrated ? calibrated.state : calibrated;
        }

        if (shouldApplyState) {
            deps.设置角色?.(finalState.角色);
            deps.设置环境?.(finalState.环境);
            deps.设置社交?.(finalState.社交);
            deps.设置世界?.(finalState.世界);
            deps.设置战斗?.(finalState.战斗);
            deps.设置玩家门派?.(finalState.玩家门派);
            deps.设置任务列表?.(finalState.任务列表);
            deps.设置约定列表?.(finalState.约定列表);
            deps.设置剧情?.(finalState.剧情);
            deps.设置剧情规划?.(finalState.剧情规划);
            deps.设置女主剧情规划?.(finalState.女主剧情规划);
            deps.设置同人剧情规划?.(finalState.同人剧情规划);
            deps.设置同人女主剧情规划?.(finalState.同人女主剧情规划);
        }

        return finalState;
    }

    const normalizedEnv = deps.规范化环境信息(envBuffer);
    const normalizedSocial = deps.规范化社交列表(
        同步在场NPC当前位置(
            应用同行事实到队伍(
                response,
                同步当前视角在场状态(
                    response,
                    应用死亡事实到NPC(
                        response,
                        应用女性关系目标主要角色兜底(
                            response,
                            应用生理事实到女性NPC(
                                response,
                                补入对白发送者到社交(response, socialBuffer, charBuffer?.姓名),
                                envBuffer,
                                charBuffer?.姓名
                            )
                        ),
                        envBuffer
                    ),
                    charBuffer?.姓名
                ),
                charBuffer?.姓名
            ),
            normalizedEnv
        ),
        { 合并同名: false }
    );

    let finalState: 响应命令处理状态 = {
        角色: charBuffer,
        环境: normalizedEnv,
        社交: normalizedSocial,
        世界: deps.规范化世界状态(worldBuffer),
        战斗: battleBuffer,
        玩家门派: deps.规范化门派状态(sectBuffer),
        任务列表: 规范化任务列表自动结算(Array.isArray(tasksBuffer) ? tasksBuffer : []),
        约定列表: Array.isArray(agreementsBuffer) ? agreementsBuffer : [],
        剧情: deps.规范化剧情状态(storyBuffer),
        剧情规划: deps.规范化剧情规划状态(storyPlanBuffer),
        女主剧情规划: deps.规范化女主剧情规划状态(heroinePlanBuffer),
        同人剧情规划: deps.规范化同人剧情规划状态(fandomStoryPlanBuffer),
        同人女主剧情规划: deps.规范化同人女主剧情规划状态(fandomHeroinePlanBuffer)
    };
    const calibrated = deps.命令后校准?.(finalState);
    if (calibrated) {
        finalState = 'state' in calibrated ? calibrated.state : calibrated;
        if (shouldApplyState) {
            deps.设置角色?.(finalState.角色);
            deps.设置环境?.(finalState.环境);
            deps.设置社交?.(finalState.社交);
            deps.设置世界?.(finalState.世界);
            deps.设置战斗?.(finalState.战斗);
            deps.设置玩家门派?.(finalState.玩家门派);
            deps.设置任务列表?.(finalState.任务列表);
            deps.设置约定列表?.(finalState.约定列表);
            deps.设置剧情?.(finalState.剧情);
            deps.设置剧情规划?.(finalState.剧情规划);
            deps.设置女主剧情规划?.(finalState.女主剧情规划);
            deps.设置同人剧情规划?.(finalState.同人剧情规划);
            deps.设置同人女主剧情规划?.(finalState.同人女主剧情规划);
        }
    };
    return finalState;
};
