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
        '世界.地图',
        '世界.建筑',
        '世界.进行中事件',
        '世界.已结算事件',
        '世界.世界镜头规划',
        '世界.江湖史册',
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
    const evolutionCandidates = [
        ...dynamicHints.map(item => `线索驱动：${item}`),
        ...dueHints.map(item => `到期驱动：${item}`)
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
        '【本回合可触发演变候选】',
        evolutionCandidates.length > 0 ? evolutionCandidates.map(item => `- ${item}`).join('\n') : '- 无'
    ].join('\n');
};
