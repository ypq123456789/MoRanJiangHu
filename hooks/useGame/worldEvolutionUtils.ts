import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { normalizeCanonicalGameTime, 环境时间转标准串, 结构化时间转标准串 } from './timeUtils';
import { 格式化短期记忆展示文本 } from './memoryUtils';

type 世界演变命令 = {
    action: 'add' | 'set' | 'push' | 'delete';
    key: string;
    value: any;
};

const 任意时间转排序值 = (raw: unknown): number | null => {
    let canonical: string | null = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        canonical = 结构化时间转标准串(raw);
    } else if (typeof raw === 'string') {
        canonical = normalizeCanonicalGameTime(raw.trim());
    }
    if (!canonical) return null;
    const m = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return ((((year * 12) + month) * 31 + day) * 24 + hour) * 60 + minute;
};

export const 规范化世界演变命令列表 = (commands: 世界演变命令[]) => {
    const 允许路径前缀 = [
        '世界.活跃NPC列表',
        '世界.待执行事件',
        '世界.地图层级',
        '世界.进行中事件',
        '世界.已结算事件',
        '世界.世界镜头规划',
        '世界.江湖史册',
        '世界.势力列表',
        '世界.势力互动历史',
        '世界.拍卖行待投放物品',
        '环境.天气',
        '环境.环境变量',
        '环境.大地点',
        '环境.中地点',
        '环境.小地点',
        '环境.具体地点'
    ];
    return (Array.isArray(commands) ? commands : [])
        .map((cmd) => {
            const key = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
            return {
                action: cmd?.action,
                key,
                value: cmd?.value
            };
        })
        .filter((cmd): cmd is 世界演变命令 => (
            (cmd.action === 'add' || cmd.action === 'set' || cmd.action === 'push' || cmd.action === 'delete')
            && typeof cmd.key === 'string'
            && cmd.key.trim().length > 0
            && 允许路径前缀.some((prefix) => {
                const comparableKey = cmd.key.replace(/^gameState\./, '');
                return comparableKey === prefix || comparableKey.startsWith(`${prefix}.`) || comparableKey.startsWith(`${prefix}[`);
            })
        ));
};

const 客户可见世界大事上限 = 8;

const 世界尺度关键词 = [
    '江湖', '势力', '门派', '宗门', '帮派', '家族', '商会', '镖局', '官府', '黑市', '拍卖',
    '联盟', '围剿', '劫掠', '争夺', '封锁', '追缉', '商路', '镖路', '渡口', '州', '郡',
    '城', '县', '秘境', '传承', '残卷', '名宿', '魔教', '山寨', '灾', '疫', '粮', '盐',
    '矿', '水路', '码头', '边关', '战事', '通缉', '悬赏'
];

const 内部结构关键词 = [
    '活跃NPC列表', '活跃 NPC 列表', '活跃 NPC', '待执行事件', '进行中事件', '已结算事件',
    '世界镜头规划', '事件池', '后台活跃对象', '后台对象', '后台待执行', '后台结构',
    '命令', '变量', '字段', '路径', '数组', '结构', '对象', 'push', 'set ', 'delete ',
    '初始化', '补写', '写入', '纳入', '落地', '迁移', '补位', '审计', '条数', '峰值',
    '常态', '触发窗口', '计划执行时间', '最早执行时间', '最晚执行时间', '当前行动',
    '当前状态', '行动开始时间', '行动结束时间'
];

const 私人近景关键词 = ['叔父', '父亲', '母亲', '家丁', '丫鬟', '卧房', '厢房', '屋内', '院中', '演武场', '晨间', '考校'];

const 规整可见事件文本 = (raw: unknown): string => (typeof raw === 'string' ? raw : '')
    .trim()
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^【?说明】?\s*[:：]?\s*/, '')
    .trim();

const 包含任一关键词 = (text: string, keywords: string[]): boolean => keywords.some((keyword) => text.includes(keyword));

export const 是否后台世界工程描述 = (raw: unknown): boolean => {
    const text = 规整可见事件文本(raw);
    if (!text) return true;
    const compact = text.replace(/\s+/g, '');
    const hasInternal = 包含任一关键词(text, 内部结构关键词) || 包含任一关键词(compact, 内部结构关键词.map((item) => item.replace(/\s+/g, '')));
    if (hasInternal) return true;

    const hasWorldScale = 包含任一关键词(text, 世界尺度关键词);
    const hasPrivateLocal = 包含任一关键词(text, 私人近景关键词);
    return hasPrivateLocal && !hasWorldScale;
};

const 取对象文本字段 = (value: any, fields: string[]): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    for (const field of fields) {
        const raw = value[field];
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (Array.isArray(raw) && raw.length > 0) {
            const joined = raw.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean).join('，');
            if (joined) return joined;
        }
    }
    return '';
};

const 取物品名称列表 = (value: any): string[] => {
    const list = Array.isArray(value) ? value : [value];
    return list
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object' && typeof item.名称 === 'string') return item.名称.trim();
            return '';
        })
        .filter(Boolean);
};

const 从世界命令生成可见大事 = (commands: 世界演变命令[]): string[] => {
    const results: string[] = [];
    (Array.isArray(commands) ? commands : []).forEach((cmd) => {
        const key = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '').replace(/^gameState\./, '');
        const value = cmd?.value;
        if (!key || cmd?.action === 'delete') return;

        if (key.startsWith('世界.势力互动历史')) {
            const summary = 取对象文本字段(value, ['事件摘要', '描述', '当前进展']);
            const factions = Array.isArray(value?.参与势力) ? value.参与势力.filter(Boolean).join('、') : '';
            const type = typeof value?.类型 === 'string' ? value.类型.trim() : '势力互动';
            if (summary) {
                results.push(factions ? `${factions}发生${type}：${summary}` : summary);
            }
            return;
        }

        if (key.startsWith('世界.拍卖行待投放物品')) {
            const names = 取物品名称列表(value).slice(0, 3);
            if (names.length > 0) {
                results.push(`市场传出风声：${names.join('、')}开始流入市面，引动多方打探。`);
            }
            return;
        }

        if (key.startsWith('世界.进行中事件') || key.startsWith('世界.已结算事件')) {
            const title = 取对象文本字段(value, ['事件名', '标题']);
            const detail = 取对象文本字段(value, ['当前进展', '事件结果', '长期影响', '事件说明']);
            if (title && detail) results.push(`${title}：${detail}`);
            else if (title) results.push(title);
            return;
        }

        if (key.startsWith('世界.江湖史册')) {
            const title = 取对象文本字段(value, ['标题']);
            const detail = 取对象文本字段(value, ['归档内容', '长期影响']);
            if (title && detail) results.push(`${title}：${detail}`);
            else if (title) results.push(title);
            return;
        }

        if (key.startsWith('世界.势力列表') && Array.isArray(value) && value.length > 0) {
            const names = value
                .map((item) => item && typeof item === 'object' && typeof item.名称 === 'string' ? item.名称.trim() : '')
                .filter(Boolean)
                .slice(0, 5);
            if (names.length > 0) {
                results.push(`江湖势力格局初定：${names.join('、')}等势力各据一方，关系暗流开始发酵。`);
            }
        }
    });
    return results;
};

export const 整理客户可见世界大事 = (
    updates: string[],
    commands: 世界演变命令[] = []
): string[] => {
    const fromUpdates = (Array.isArray(updates) ? updates : [])
        .map(规整可见事件文本)
        .filter(Boolean)
        .filter((item) => !是否后台世界工程描述(item));
    const synthesized = 从世界命令生成可见大事(commands)
        .map(规整可见事件文本)
        .filter(Boolean)
        .filter((item) => !是否后台世界工程描述(item));
    const seen = new Set<string>();
    return [...fromUpdates, ...synthesized]
        .filter((item) => {
            if (seen.has(item)) return false;
            seen.add(item);
            return true;
        })
        .slice(0, 客户可见世界大事上限);
};

const 构建世界状态可见命令 = (worldLike: any): 世界演变命令[] => {
    const world = worldLike && typeof worldLike === 'object' ? worldLike : {};
    const commands: 世界演变命令[] = [];
    const pushArray = (key: string, list: unknown) => {
        if (!Array.isArray(list)) return;
        list.forEach((value) => commands.push({ action: 'push', key, value }));
    };

    if (Array.isArray(world.势力列表) && world.势力列表.length > 0) {
        commands.push({ action: 'set', key: '世界.势力列表', value: world.势力列表 });
    }
    pushArray('世界.势力互动历史', world.势力互动历史);
    pushArray('世界.拍卖行待投放物品', world.拍卖行待投放物品);
    pushArray('世界.进行中事件', world.进行中事件);
    pushArray('世界.已结算事件', world.已结算事件);
    pushArray('世界.江湖史册', world.江湖史册);
    return commands;
};

export const 整理世界状态客户可见大事 = (
    worldLike: any,
    fallbackUpdates: string[] = []
): string[] => 整理客户可见世界大事(
    Array.isArray(fallbackUpdates) ? fallbackUpdates : [],
    构建世界状态可见命令(worldLike)
);

export const 分析世界到期触发 = (worldLike: any, envLike: any) => {
    const currentCanonical = 环境时间转标准串(envLike) || (typeof envLike?.时间 === 'string' ? normalizeCanonicalGameTime(envLike.时间) : null);
    const currentSort = currentCanonical ? 任意时间转排序值(currentCanonical) : null;
    const world = worldLike && typeof worldLike === 'object' ? worldLike : {};
    if (currentSort === null) {
        return {
            hasDue: false,
            currentTime: currentCanonical || '',
            eventDueList: [] as Array<{ id: string; title: string }>,
            npcDueList: [] as Array<{ id: string; name: string; reason: string }>,
            summaryHints: [] as string[]
        };
    }

    const eventDueList = (Array.isArray(world?.进行中事件) ? world.进行中事件 : [])
        .map((evt: any, index: number) => {
            const title = typeof evt?.事件名 === 'string' ? evt.事件名.trim() : '';
            const id = title || `事件#${index + 1}`;
            const endSort = 任意时间转排序值((evt as any)?.预计结束时间);
            if (endSort === null || endSort > currentSort) return null;
            return { id, title };
        })
        .filter(Boolean) as Array<{ id: string; title: string }>;

    const npcDueList = (Array.isArray(world?.活跃NPC列表) ? world.活跃NPC列表 : [])
        .map((npc: any, index: number) => {
            const name = typeof npc?.姓名 === 'string' && npc.姓名.trim().length > 0 ? npc.姓名.trim() : `NPC#${index + 1}`;
            const id = name;
            const actionEndSort = 任意时间转排序值((npc as any)?.行动结束时间);
            if (actionEndSort !== null && actionEndSort <= currentSort) {
                return { id, name, reason: '行动结束时间已到' };
            }
            return null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; reason: string }>;

    const summaryHints = [
        ...eventDueList.map(item => `事件到期：${item.id}《${item.title}》需要结算/迁移`),
        ...npcDueList.map(item => `NPC行动到期：${item.id}(${item.name})${item.reason}，需要推进下一阶段`)
    ];

    return {
        hasDue: summaryHints.length > 0,
        currentTime: currentCanonical || '',
        eventDueList,
        npcDueList,
        summaryHints
    };
};

const 格式化世界演变展示上下文 = <T,>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map((item, index) => {
            const formatted = 格式化世界演变展示上下文(item);
            if (formatted && typeof formatted === 'object' && !Array.isArray(formatted)) {
                return {
                    [`[${index}]`]: index,
                    ...(formatted as Record<string, unknown>)
                };
            }
            return formatted;
        }) as T;
    }
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([key]) => key !== '索引')
            .map(([key, child]) => [key, 格式化世界演变展示上下文(child)])
    ) as T;
};

const 序列化世界演变展示上下文 = (value: unknown): string => JSON.stringify(
    格式化世界演变展示上下文(value),
    null,
    2
).replace(
    /^(\s*)"(\[\d+\])":\s*\d+,?$/gm,
    '$1"$2"'
);

const 提炼世界演变剧情锚点 = (storyLike: unknown) => {
    const story = storyLike && typeof storyLike === 'object' && !Array.isArray(storyLike)
        ? storyLike as Record<string, unknown>
        : {};
    const 当前章节 = story.当前章节 && typeof story.当前章节 === 'object' && !Array.isArray(story.当前章节)
        ? story.当前章节
        : {};
    const 下一章预告 = story.下一章预告 && typeof story.下一章预告 === 'object' && !Array.isArray(story.下一章预告)
        ? story.下一章预告
        : {};
    const 历史卷宗 = Array.isArray(story.历史卷宗) ? story.历史卷宗.slice(-2) : [];
    return {
        当前章节,
        下一章预告,
        历史卷宗
    };
};

const 取世界数组 = (worldLike: unknown, key: string): unknown[] => {
    const world = worldLike && typeof worldLike === 'object' && !Array.isArray(worldLike)
        ? worldLike as Record<string, unknown>
        : {};
    return Array.isArray(world[key]) ? world[key] as unknown[] : [];
};

const 取结构文本 = (value: unknown, fields: string[]): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const record = value as Record<string, unknown>;
    for (const field of fields) {
        const text = typeof record[field] === 'string' ? record[field].trim() : '';
        if (text) return text;
    }
    return '';
};

export const 构建世界结构健康提示 = (worldLike: unknown): string[] => {
    const pendingEvents = 取世界数组(worldLike, '待执行事件');
    const ongoingEvents = 取世界数组(worldLike, '进行中事件');
    const activeNpcs = 取世界数组(worldLike, '活跃NPC列表');
    const factions = 取世界数组(worldLike, '势力列表');
    const factionHistory = 取世界数组(worldLike, '势力互动历史');
    const worldShots = 取世界数组(worldLike, '世界镜头规划');
    const hints: string[] = [];

    if (pendingEvents.length === 0 && ongoingEvents.length === 0) {
        const factionSignals = factions
            .map((item) => {
                const name = 取结构文本(item, ['名称', 'ID']);
                const state = 取结构文本(item, ['当前状态', '描述']);
                return name && state ? `${name}：${state}` : name;
            })
            .filter(Boolean)
            .slice(0, 4);
        hints.push([
            '风云变幻断档：当前 `世界.待执行事件` 与 `世界.进行中事件` 都为空。',
            factionSignals.length > 0
                ? `请优先检查这些势力余波能否转为有因果来源的待执行或进行中事件：${factionSignals.join('；')}。`
                : '请优先从既有世界张力、短期记忆、剧情规划、势力余波、追缉链、封锁线或传闻链中补出可信事件。',
            '若已有开始原因、当前进展与影响面，应 `push 世界.进行中事件 = {...}`；若只具备时间/条件门槛，应 `push 世界.待执行事件 = {...}`；没有可信来源才保持空并说明原因。'
        ].join(' '));
    } else if (ongoingEvents.length === 0 && (pendingEvents.length > 0 || factionHistory.length > 0 || worldShots.length > 0 || activeNpcs.length > 0)) {
        hints.push('世界事件推进检查：当前 `世界.进行中事件` 为空，但已有待执行事件、势力风闻、世界镜头或活跃 NPC；请检查是否有事件已满足启动条件，可以迁入 `世界.进行中事件`。');
    } else if (ongoingEvents.length < 3 && (factions.length >= 2 || factionHistory.length > 0)) {
        hints.push('世界事件偏少：当前 `世界.进行中事件` 低于常态，请检查势力矛盾、交易余波、追缉封锁或旧线续段是否足以补位；补位必须有来源、进展和影响面。');
    }

    if (factions.length >= 2 && factionHistory.length === 0) {
        hints.push('势力互动历史为空：已有多个势力时，若本回合或当前状态出现交易、冲突、庇护、敌对、联盟或资源流向，请补 `世界.势力互动历史`，不要只改势力描述。');
    }

    return hints;
};

const 势力名称后缀正则 = '(?:家族|世家|氏族|宗门|门派|商会|镖局|官府|帮派|联盟|山庄|武馆|书院|寺|观|教|宫|谷|岛|寨|庄|堡|门|派|宗|帮|盟|氏)';
const 地盘线索正则 = '[\\u4e00-\\u9fa5]{1,6}(?:州|郡|城|县|府|国|关|镇|山|谷|岛|港|渡|域)';
const 势力包裹符号正则 = /[\s"'“”‘’「」『』《》【】（）()、，,。.!！?？:：;；]/g;
const 候选势力噪声词 = new Set([
    '机会', '大会', '晚会', '不会', '便会', '只会', '就会', '却会', '总会',
    '入门', '出门', '山门', '门', '派', '宗', '帮', '盟', '氏'
]);

const 规范化势力名称 = (raw: unknown): string => (
    typeof raw === 'string' ? raw : ''
)
    .replace(势力包裹符号正则, '')
    .trim();

const 清理地盘线索 = (raw: unknown): string => 规范化势力名称(raw)
    .replace(/^.*[了在至到赴入出往从向于]/, '')
    .trim();

const 清理候选势力名称 = (raw: string, territory?: string): string => {
    let name = 规范化势力名称(raw)
        .replace(/^[的之与和及同由从向在对为把将被令让使其这那此]+/, '')
        .replace(/[的之与和及同由从向在对为把将被令让使其这那此]+$/, '');

    const cleanedTerritory = 清理地盘线索(territory || '');
    if (cleanedTerritory && name.startsWith(cleanedTerritory) && name.length > cleanedTerritory.length + 1) {
        name = name.slice(cleanedTerritory.length);
    }

    const embeddedTerritory = name.match(new RegExp(`^(${地盘线索正则})(${势力名称后缀正则.replace('(?:', '[\\u4e00-\\u9fa5]{2,12}(?:')})$`));
    if (embeddedTerritory?.[2]) {
        name = embeddedTerritory[2];
    }

    return name;
};

const 推断势力类型 = (name: string): string => {
    if (/家族|世家|氏族|氏$/.test(name)) return '家族';
    if (/商会/.test(name)) return '商会';
    if (/镖局/.test(name)) return '镖局';
    if (/官府|府衙|衙门/.test(name)) return '官府';
    if (/联盟|盟$/.test(name)) return '散修联盟';
    if (/帮派|帮$|寨|堡/.test(name)) return '帮派';
    if (/宗门|门派|宗$|门$|派$|寺|观|教|宫|谷|岛|山庄|武馆|书院/.test(name)) return '门派';
    return '其他';
};

const 提取既有势力名称集合 = (worldLike: unknown): string[] => {
    const world = worldLike && typeof worldLike === 'object' && !Array.isArray(worldLike)
        ? worldLike as Record<string, unknown>
        : {};
    const factionList = Array.isArray(world.势力列表) ? world.势力列表 : [];
    return factionList
        .flatMap((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const record = item as Record<string, unknown>;
            return [record.名称, record.ID]
                .map(规范化势力名称)
                .filter(Boolean);
        });
};

const 是否候选势力噪声 = (name: string): boolean => {
    if (name.length < 2 || name.length > 12) return true;
    if (候选势力噪声词.has(name)) return true;
    if (/^[一二三四五六七八九十百千万年月日时刻]+/.test(name)) return true;
    return false;
};

const 势力名称已存在 = (name: string, existingNames: string[]): boolean => {
    const normalized = 规范化势力名称(name);
    if (!normalized) return true;
    return existingNames.some((existing) => {
        if (!existing) return false;
        return existing === normalized || existing.includes(normalized) || normalized.includes(existing);
    });
};

const 取证据片段 = (text: string, start: number, length: number): string => text
    .slice(Math.max(0, start - 12), Math.min(text.length, start + length + 12))
    .replace(/\s+/g, ' ')
    .trim();

export const 提取正文势力补录线索 = (params: {
    text?: string;
    worldData?: unknown;
}): string[] => {
    const text = (params.text || '').trim();
    if (!text) return [];

    const existingNames = 提取既有势力名称集合(params.worldData);
    const candidates = new Map<string, { 名称: string; 类型: string; 地盘线索: string; 证据: string }>();
    const addCandidate = (rawName: string, start: number, rawLength: number, territory?: string) => {
        const name = 清理候选势力名称(rawName, territory);
        if (是否候选势力噪声(name)) return;
        if (势力名称已存在(name, existingNames)) return;

        const key = 规范化势力名称(name);
        if (!key || candidates.has(key)) return;
        candidates.set(key, {
            名称: name,
            类型: 推断势力类型(name),
            地盘线索: 清理地盘线索(territory || ''),
            证据: 取证据片段(text, start, rawLength)
        });
    };

    const regionPattern = new RegExp(`(${地盘线索正则})[的境内所属所辖一带附近\\s，、：:；;“"‘'「『《]*([\\u4e00-\\u9fa5]{2,12}${势力名称后缀正则})[”"’'」』》]?`, 'g');
    for (const match of text.matchAll(regionPattern)) {
        const territory = match[1] || '';
        const rawName = match[2] || '';
        const nameOffset = match[0].indexOf(rawName);
        addCandidate(rawName, match.index + Math.max(0, nameOffset), rawName.length, territory);
    }

    const quotedPattern = new RegExp(`[“"‘'「『《]([\\u4e00-\\u9fa5]{2,12}${势力名称后缀正则})[”"’'」』》]`, 'g');
    for (const match of text.matchAll(quotedPattern)) {
        const rawName = match[1] || '';
        const nameOffset = match[0].indexOf(rawName);
        addCandidate(rawName, match.index + Math.max(0, nameOffset), rawName.length);
    }

    const standalonePattern = new RegExp(`(?:^|[^\\u4e00-\\u9fa5])([\\u4e00-\\u9fa5]{2,12}${势力名称后缀正则})(?=$|[^\\u4e00-\\u9fa5])`, 'g');
    for (const match of text.matchAll(standalonePattern)) {
        const rawName = match[1] || '';
        const nameOffset = match[0].indexOf(rawName);
        addCandidate(rawName, match.index + Math.max(0, nameOffset), rawName.length);
    }

    return Array.from(candidates.values())
        .slice(0, 5)
        .map((candidate) => {
            const territoryText = candidate.地盘线索 || '未明';
            return `正文提到疑似新势力「${candidate.名称}」（类型倾向：${candidate.类型}，地盘线索：${territoryText}，证据：${candidate.证据}）。当前世界.势力列表未包含；若它具备资源、地盘、血缘组织、商路、冲突或政治影响，请用 \`push 世界.势力列表 = {...}\` 补完整势力结构，并同步必要的关系网或势力互动。`;
        });
};

export const 构建世界演变上下文文本 = (params: {
    worldPrompt?: string;
    worldEvolutionPrompt?: string;
    envData?: unknown;
    worldData?: unknown;
    storyData?: unknown;
    shortMemoryTexts?: string[];
    scriptText?: string;
    currentTurnBody?: string;
    currentTurnPlanText?: string;
    currentTurnCommandsText?: string;
    currentGameTime?: string;
    dynamicHints?: string[];
    dueHints?: string[];
    genderEvolutionEnabled?: boolean;
}): string => {
    const memoryBlock = (Array.isArray(params.shortMemoryTexts) ? params.shortMemoryTexts : [])
        .map((item) => 格式化短期记忆展示文本(item || ''))
        .filter(Boolean)
        .join('\n') || '暂无';
    const scriptBlock = (params.scriptText || '').trim() || '暂无';
    const currentTurnBody = (params.currentTurnBody || '').trim() || '暂无';
    const currentTurnPlanText = (params.currentTurnPlanText || '').trim() || '无';
    const currentTurnCommandsText = (params.currentTurnCommandsText || '').trim() || '无';
    const currentGameTime = (params.currentGameTime || '').trim() || '未知时间';
    const dynamicHints = (Array.isArray(params.dynamicHints) ? params.dynamicHints : [])
        .map(item => (item || '').trim())
        .filter(Boolean);
    const dueHints = (Array.isArray(params.dueHints) ? params.dueHints : [])
        .map(item => (item || '').trim())
        .filter(Boolean);
    const factionBackfillHints = 提取正文势力补录线索({
        text: [currentTurnBody, currentTurnPlanText, currentTurnCommandsText].filter(Boolean).join('\n'),
        worldData: params.worldData
    });
    const healthHints = 构建世界结构健康提示(params.worldData);
    const evolutionCandidates = [
        ...dynamicHints.map(item => `线索驱动：${item}`),
        ...dueHints.map(item => `到期驱动：${item}`),
        ...healthHints.map(item => `结构健康：${item}`),
        ...factionBackfillHints.map(item => `势力补录：${item}`)
    ];

    return [
        '【世界观提示词】',
        (params.worldPrompt || '').trim() || '暂无',
        '',
        '【世界演化规则】',
        (params.worldEvolutionPrompt || '').trim() || '暂无',
        '',
        '【当前游戏内时间】',
        currentGameTime,
        '',
        '【当前环境】',
        序列化世界演变展示上下文(params.envData ?? {}),
        '',
        '【当前世界】',
        序列化世界演变展示上下文(params.worldData ?? {}),
        '',
        '【当前剧情锚点】',
        序列化世界演变展示上下文(提炼世界演变剧情锚点(params.storyData)),
        '',
        '【本回合前台已发生事实】',
        currentTurnBody,
        '',
        '【本回合<剧情规划>】',
        currentTurnPlanText,
        '',
        '【本回合主链已落地命令】',
        currentTurnCommandsText,
        '',
        '【短期记忆（最近）】',
        memoryBlock,
        '',
        '【最近数回合前台回顾】',
        scriptBlock,
        '',
        '【动态世界线索】',
        dynamicHints.length > 0 ? dynamicHints.map(item => `- ${item}`).join('\n') : '- 无',
        '',
        '【到期触发摘要】',
        dueHints.length > 0 ? dueHints.map(item => `- ${item}`).join('\n') : '- 无',
        '',
        '【世界结构健康检查】',
        healthHints.length > 0 ? healthHints.map(item => `- ${item}`).join('\n') : '- 无',
        '',
        '【正文势力补录候选】',
        factionBackfillHints.length > 0 ? factionBackfillHints.map(item => `- ${item}`).join('\n') : '- 无',
        '',
        '【本回合可触发演变候选】',
        evolutionCandidates.length > 0 ? evolutionCandidates.map(item => `- ${item}`).join('\n') : '- 无',
        '',
        ...(params.genderEvolutionEnabled ? [
            '【性别比例演变状态】',
            '开启'
        ] : [])
    ].join('\n');
};
