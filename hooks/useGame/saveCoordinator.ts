import * as dbService from '../../services/dbService';
import { 后台同步存档到云端 } from '../../services/cloudPlayService';
import type {
    GameResponse,
    存档结构,
    聊天记录结构,
    场外对话消息结构,
    环境信息结构,
    角色数据结构,
    提示词结构,
    视觉设置结构,
    世界数据结构,
    战斗状态结构,
    详细门派结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    记忆系统结构,
    记忆配置结构,
    游戏设置结构,
    场景图片档案,
    角色锚点结构,
    OpeningConfig,
    叙事状态结构
} from '../../types';
import { 核心_世界观 } from '../../prompts/core/world';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 设置键 } from '../../utils/settingsSchema';
import { 环境时间转标准串 } from './timeUtils';
import {
    读取拍卖行状态,
    保存拍卖行状态,
    清理并补货,
    构建拍卖行存储作用域,
    type 拍卖行状态
} from '../../services/auctionHouse';
import { 规范化任务列表自动结算 } from '../../utils/taskCompat';
import { isNativeCapacitorEnvironment } from '../../utils/nativeRuntime';
import { buildHistoryDebugSummary, buildSaveDebugSummary, collectLargestStrings, collectValueStats, recordSaveLoadTrace } from '../../utils/saveLoadTrace';
import { 清理内嵌图片冗余字段 } from '../../utils/imageAssets';
import { 计算历史游玩回合数 } from '../../utils/saveTurn';
import { 修复旧姓名库误改NPC姓名列表 } from '../../utils/npcNameRepair';
import { 修复开局伙伴社交列表 } from '../../utils/openingCompanion';
import { 同步角色与门派状态 } from './storyState';
import { 规范化场外对话列表 } from './roleChatWorkflow';

const 收集图床图片地址 = (
    value: unknown,
    urls: Set<string>,
    seen: WeakSet<object> = new WeakSet()
): void => {
    if (typeof value === 'string') {
        const text = value.trim();
        if (是否可缓存图床图片地址(text)) urls.add(text);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
        value.forEach((item) => 收集图床图片地址(item, urls, seen));
        return;
    }
    Object.values(value as Record<string, unknown>).forEach((child) => 收集图床图片地址(child, urls, seen));
};

const 是否可缓存图床图片地址 = (value: string): boolean => {
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const url = new URL(value);
        return /^image1\.bacon159\.pp\.ua$/i.test(url.hostname)
            || /^image\.bacon159\.pp\.ua$/i.test(url.hostname)
            || /(^|\.)picui\.ogmua\.cn$/i.test(url.hostname)
            || /^imgurloss\.xqd\.cn$/i.test(url.hostname)
            || /\.(png|jpe?g|webp|gif|bmp)(?:$|[?#])/i.test(url.pathname);
    } catch {
        return false;
    }
};

const 后台缓存当前存档图床图片 = (save: 存档结构): void => {
    if (typeof window === 'undefined') return;
    const urls = new Set<string>();
    收集图床图片地址(save.角色数据, urls);
    收集图床图片地址(save.社交, urls);
    收集图床图片地址(save.场景图片档案, urls);
    收集图床图片地址(save.世界, urls);
    收集图床图片地址(save.拍卖行, urls);
    if (urls.size === 0) return;

    const native = isNativeCapacitorEnvironment();
    const queue = Array.from(urls).slice(0, native ? 16 : 60);
    const run = async () => {
        const poolSize = native ? 1 : 2;
        let cursor = 0;
        const worker = async () => {
            while (cursor < queue.length) {
                const url = queue[cursor++];
                await dbService.确保远程图片本地兜底(url).catch(() => undefined);
                await new Promise(resolve => window.setTimeout(resolve, native ? 350 : 100));
            }
        };
        await Promise.all(Array.from({ length: poolSize }, () => worker()));
    };

    const win = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    };
    if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => void run(), { timeout: native ? 12000 : 5000 });
        return;
    }
    window.setTimeout(() => void run(), native ? 8000 : 1200);
};

export type 自动存档快照结构 = {
    history?: 聊天记录结构[];
    场外对话?: 场外对话消息结构[];
    role?: 角色数据结构;
    env?: 环境信息结构;
    social?: any[];
    world?: 世界数据结构;
    battle?: 战斗状态结构;
    sect?: 详细门派结构;
    tasks?: any[];
    agreements?: any[];
    story?: 剧情系统结构;
    storyPlan?: 剧情规划结构;
    heroinePlan?: 女主剧情规划结构;
    fandomStoryPlan?: 同人剧情规划结构;
    fandomHeroinePlan?: 同人女主剧情规划结构;
    memory?: 记忆系统结构;
    openingConfig?: OpeningConfig;
    visualConfig?: 视觉设置结构;
    sceneImageArchive?: 场景图片档案;
    auctionHouse?: 拍卖行状态;
    叙事平静值?: 叙事状态结构;
    force?: boolean;
};

type 存档协调当前状态 = {
    历史记录: 聊天记录结构[];
    场外对话?: 场外对话消息结构[];
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
    记忆系统: 记忆系统结构;
    叙事平静值?: 叙事状态结构;
    openingConfig?: OpeningConfig;
    提示词池: 提示词结构[];
    游戏初始时间: string;
    gameConfig: 游戏设置结构;
    memoryConfig: 记忆配置结构;
    visualConfig: 视觉设置结构;
    sceneImageArchive: 场景图片档案;
    角色锚点列表: 角色锚点结构[];
    当前角色锚点ID: string;
};

type 存档协调依赖 = {
    存档格式版本: number;
    自动存档最小间隔毫秒: number;
    深拷贝: <T>(value: T) => T;
    构建完整地点文本: (envLike?: any) => string;
    规范化环境信息: (envLike?: any) => 环境信息结构;
    规范化世界状态: (raw?: any) => 世界数据结构;
    规范化战斗状态: (raw?: any) => 战斗状态结构;
    规范化门派状态: (raw?: any) => 详细门派结构;
    规范化剧情状态: (raw?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构 | undefined;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    规范化记忆系统: (raw?: any) => 记忆系统结构;
    规范化可选开局配置: (raw?: any) => OpeningConfig | undefined;
    规范化记忆配置: (raw?: Partial<记忆配置结构> | null) => 记忆配置结构;
    规范化游戏设置: (raw?: Partial<游戏设置结构> | null) => 游戏设置结构;
    规范化视觉设置: (raw?: Partial<视觉设置结构> | null) => 视觉设置结构;
    规范化场景图片档案: (raw?: any) => 场景图片档案;
    规范化角色物品容器映射: (raw?: any, options?: { 当前时间?: unknown; 事件文本?: string; 启用饱腹口渴系统?: boolean }) => 角色数据结构;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    获取当前提示词池: () => 提示词结构[];
    创建开场空白环境: () => 环境信息结构;
    创建开场空白世界: () => 世界数据结构;
    创建开场空白战斗: () => 战斗状态结构;
    创建空门派状态: () => 详细门派结构;
    创建开场空白剧情: () => 剧情系统结构;
    应用并同步记忆系统: (memory: 记忆系统结构, options?: { 静默总结提示?: boolean }) => void;
    获取当前视觉设置: () => 视觉设置结构;
    setHasSave: (value: boolean) => void;
    setGameConfig: (value: 游戏设置结构) => void;
    setMemoryConfig: (value: 记忆配置结构) => void;
    设置视觉设置: (value: 视觉设置结构) => void;
    设置场景图片档案: (value: 场景图片档案) => void;
    设置游戏初始时间: (value: string) => void;
    设置角色锚点列表: (value: 角色锚点结构[]) => void;
    设置当前角色锚点ID: (value: string) => void;
    setView: (value: 'home' | 'game' | 'new_game') => void;
    setShowSaveLoad: (value: { show: boolean; mode: 'save' | 'load' }) => void;
    设置最近开局配置: (value: any) => void;
    设置角色: (value: 角色数据结构) => void;
    设置环境: (value: 环境信息结构) => void;
    设置社交: (value: any[]) => void;
    设置世界: (value: 世界数据结构) => void;
    设置战斗: (value: 战斗状态结构) => void;
    设置玩家门派: (value: 详细门派结构) => void;
    设置任务列表: (value: any[]) => void;
    设置约定列表: (value: any[]) => void;
    设置剧情: (value: 剧情系统结构) => void;
    设置剧情规划: (value: 剧情规划结构) => void;
    设置女主剧情规划: (value: 女主剧情规划结构 | undefined) => void;
    设置同人剧情规划: (value: 同人剧情规划结构 | undefined) => void;
    设置同人女主剧情规划: (value: 同人女主剧情规划结构 | undefined) => void;
    设置开局配置: (value: OpeningConfig | undefined) => void;
    设置提示词池: (value: 提示词结构[]) => void;
    设置历史记录: (value: 聊天记录结构[]) => void;
    设置叙事平静值: (value: 叙事状态结构) => void;
    设置场外对话?: (value: 场外对话消息结构[]) => void;
    清空重Roll快照: () => void;
    推入重Roll快照?: (snapshot: {
        玩家输入: string;
        游戏时间: string;
        回档前状态: {
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
            记忆系统: 记忆系统结构;
        };
        回档前持久态: {
            视觉设置: 视觉设置结构;
            场景图片档案: 场景图片档案;
        };
        回档前历史: 聊天记录结构[];
    }) => void;
    重置自动存档状态: () => void;
    切换生图存档作用域?: () => void;
    清除开局提示词基线?: () => Promise<void>;
    最近自动存档时间戳Ref: { current: number };
    最近自动存档签名Ref: { current: string };
};

const 读取核心提示词内容 = (
    promptPool: 提示词结构[] | undefined,
    promptId: string
): string => {
    const hit = (Array.isArray(promptPool) ? promptPool : []).find((item) => item?.id === promptId);
    return typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
};

const 写入或插入提示词 = (
    promptPool: 提示词结构[] | undefined,
    promptId: string,
    fallbackPrompt: 提示词结构,
    content: string
): 提示词结构[] => {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) return Array.isArray(promptPool) ? [...promptPool] : [];
    const sourcePool = Array.isArray(promptPool) ? [...promptPool] : [];
    const nextPrompt = {
        ...(sourcePool.find((item) => item.id === promptId) || fallbackPrompt),
        id: promptId,
        内容: normalizedContent,
        启用: true
    };
    return sourcePool.some((item) => item.id === promptId)
        ? sourcePool.map((item) => item.id === promptId ? nextPrompt : item)
        : [...sourcePool, nextPrompt];
};

const 构建存档历史记录 = (
    sourceHistory: 聊天记录结构[] | undefined,
    deps: Pick<存档协调依赖, '深拷贝'>
): 聊天记录结构[] => {
    const rawHistory = Array.isArray(sourceHistory) ? sourceHistory : [];
    const historyLength = rawHistory.length;
    if (historyLength <= 2 && rawHistory.some((item) => {
        const content = typeof item?.content === 'string' ? item.content : '';
        return content.includes('翻开') || content.includes('仔细研读') || content.includes('PLAYER ACTION');
    })) {
        console.warn('[存档预警] 历史记录异常短且内容像开局首条输入', {
            historyLength,
            firstContent: rawHistory[0]?.content?.slice(0, 80),
            role: rawHistory[0]?.role,
            timestamp: new Date().toISOString()
        });
    }
    return 清理历史瞬态滚动标记(deps.深拷贝(rawHistory));
};

export const 清理历史瞬态滚动标记 = (history: 聊天记录结构[] | undefined): 聊天记录结构[] => {
    if (!Array.isArray(history)) return [];
    return history.map((item) => {
        if (!item || typeof item !== 'object') return item;
        if (item.autoScrollToTurnIcon !== true && item.autoScrollToTurnStart !== true) return item;
        const next = { ...item };
        delete next.autoScrollToTurnIcon;
        delete next.autoScrollToTurnStart;
        return next;
    });
};

const 规范化文本签名 = (value: unknown): string => (
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
);

const 提取结构化正文 = (response: any): string => (
    (Array.isArray(response?.logs) ? response.logs : [])
        .map((log: any) => `${log?.sender || '旁白'}：${log?.text || ''}`)
        .filter((line: string) => line.trim().length > 0)
        .join('\n')
);

const 构建历史正文签名 = (history: 聊天记录结构[]) => {
    const fullTexts: string[] = [];
    const snippets: string[] = [];
    history.forEach((item) => {
        if (item?.role !== 'assistant' || !item.structuredResponse) return;
        const text = 规范化文本签名(提取结构化正文(item.structuredResponse));
        if (!text) return;
        fullTexts.push(text);
        snippets.push(text.slice(0, 80));
    });
    return {
        fullTexts,
        snippets: snippets.filter((item) => item.length >= 12),
        assistantCount: fullTexts.length
    };
};

const 读取场景记录正文 = (record: any): string => {
    const raw = typeof record?.原始描述 === 'string' ? record.原始描述.trim() : '';
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw);
        return 规范化文本签名(parsed?.最新正文 || parsed?.bodyText || parsed?.正文 || '');
    } catch {
        return '';
    }
};

const 场景记录属于当前历史 = (
    record: any,
    signature: ReturnType<typeof 构建历史正文签名>
): boolean => {
    if (!record || typeof record !== 'object') return false;
    const bodyText = 读取场景记录正文(record);
    if (bodyText) {
        return signature.fullTexts.some((text) => text === bodyText || text.includes(bodyText) || bodyText.includes(text));
    }
    const summary = 规范化文本签名(record?.摘要);
    if (summary) {
        return signature.snippets.some((snippet) => summary.includes(snippet) || snippet.includes(summary.slice(0, 80)));
    }
    const turn = Number(record?.来源回合);
    if (Number.isFinite(turn)) {
        return turn >= 0 && turn <= signature.assistantCount;
    }
    return true;
};

const 过滤当前存档场景图片档案 = (
    archive: 场景图片档案 | undefined,
    history: 聊天记录结构[],
    deps: Pick<存档协调依赖, '规范化场景图片档案' | '深拷贝'>
): 场景图片档案 => {
    const normalized = deps.规范化场景图片档案(deps.深拷贝(archive || {}));
    const signature = 构建历史正文签名(history);
    const currentHistory = Array.isArray(normalized.生图历史) ? normalized.生图历史 : [];
    const filteredHistory = currentHistory.filter((record: any) => 场景记录属于当前历史(record, signature));
    const recent = normalized.最近生图结果 && 场景记录属于当前历史(normalized.最近生图结果, signature)
        ? normalized.最近生图结果
        : filteredHistory[0];
    return deps.规范化场景图片档案({
        ...normalized,
        最近生图结果: recent,
        生图历史: filteredHistory,
        当前壁纸图片ID: filteredHistory.some((item: any) => item?.id === normalized.当前壁纸图片ID)
            ? normalized.当前壁纸图片ID
            : undefined
    });
};

const 过滤当前存档角色锚点 = (
    anchors: 角色锚点结构[] | undefined,
    role: 角色数据结构 | undefined,
    social: any[] | undefined,
    currentAnchorId?: string
) => {
    const validNpcIds = new Set<string>(['__player__']);
    (Array.isArray(social) ? social : []).forEach((npc: any) => {
        const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
        if (id) validNpcIds.add(id);
    });
    const playerName = typeof role?.姓名 === 'string' ? role.姓名.trim() : '';
    const filtered = (Array.isArray(anchors) ? anchors : []).filter((anchor: any) => {
        if (!anchor || typeof anchor !== 'object') return false;
        const npcId = typeof anchor?.npcId === 'string' ? anchor.npcId.trim() : '';
        if (validNpcIds.has(npcId)) return true;
        if (npcId === '__player__') return true;
        if (!npcId && playerName && typeof anchor?.名称 === 'string' && anchor.名称.includes(playerName)) return true;
        return false;
    });
    const nextCurrentAnchorId = typeof currentAnchorId === 'string' && filtered.some((anchor) => anchor.id === currentAnchorId)
        ? currentAnchorId
        : '';
    return { anchors: filtered, currentAnchorId: nextCurrentAnchorId };
};

const 是否开局生成占位历史 = (history: 聊天记录结构[] | undefined): boolean => {
    if (!Array.isArray(history) || history.length !== 1) return false;
    const only = history[0];
    return only?.role === 'system'
        && typeof only?.content === 'string'
        && only.content.includes('正在生成开场内容');
};

const 从记忆文本恢复开局结构化响应 = (memory: 记忆系统结构 | undefined): GameResponse | null => {
    const entries = [
        ...(Array.isArray(memory?.回忆档案) ? memory.回忆档案.map((item: any) => item?.原文 || item?.概括) : []),
        ...(Array.isArray(memory?.即时记忆) ? memory.即时记忆 : []),
        ...(Array.isArray(memory?.短期记忆) ? memory.短期记忆 : [])
    ]
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    const source = entries.find((item) => /AI输出[:：]/u.test(item)) || entries[0] || '';
    if (!source) return null;
    const outputMatch = source.match(/AI输出[:：]\s*([\s\S]*)/u);
    const body = (outputMatch?.[1] || source).split('<<SHORT_TERM_SYNC>>')[0].trim();
    if (!body) return null;
    const logs = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^【([^】]+)】\s*(.*)$/u);
            return match
                ? { sender: match[1], text: match[2] || '' }
                : { sender: '旁白', text: line };
        })
        .filter((log) => log.text.trim().length > 0);
    if (logs.length === 0) return null;
    return { logs };
};

const 尝试修复完成开局但缺失历史的存档 = (
    save: Pick<存档结构, '时间戳' | '环境信息' | '游戏初始时间'>,
    loadedHistory: 聊天记录结构[],
    loadedMemory: 记忆系统结构,
    loadedStory: 剧情系统结构
): 聊天记录结构[] | null => {
    if (!是否开局生成占位历史(loadedHistory)) return null;
    const hasOpeningMemory = (Array.isArray(loadedMemory?.回忆档案) && loadedMemory.回忆档案.length > 0)
        || (Array.isArray(loadedMemory?.即时记忆) && loadedMemory.即时记忆.length > 0)
        || (Array.isArray(loadedMemory?.短期记忆) && loadedMemory.短期记忆.length > 0);
    const hasStoryState = Boolean(
        (loadedStory as any)?.当前章节?.标题
        || (loadedStory as any)?.当前章节?.摘要
        || ((loadedStory as any)?.当前章节?.正文片段 || []).length > 0
        || ((loadedStory as any)?.已知剧情节点 || []).length > 0
    );
    if (!hasOpeningMemory && !hasStoryState) return null;

    const restoredResponse = 从记忆文本恢复开局结构化响应(loadedMemory);
    if (!restoredResponse) return null;

    const timestamp = Number(save.时间戳) || Date.now();
    const gameTime = 环境时间转标准串(save.环境信息 as any) || save.游戏初始时间 || '未知时间';
    return [
        {
            role: 'assistant',
            content: 'Opening Story',
            structuredResponse: restoredResponse,
            timestamp,
            gameTime
        },
        {
            role: 'system',
            content: '[系统] 已从存档记忆恢复开局正文记录。该存档可能是在开局刚完成、界面历史尚未刷新时手动保存的；角色、环境、世界与记忆数据已按存档继续加载。',
            timestamp: timestamp + 1
        }
    ];
};

const 构建自动存档签名 = (
    snapshot: {
        history?: 聊天记录结构[];
        env?: 环境信息结构;
        memory?: 记忆系统结构;
    } | undefined,
    currentState: 存档协调当前状态,
    deps: Pick<存档协调依赖, '构建完整地点文本' | '规范化环境信息' | '规范化记忆系统'>
): string => {
    const historyBase = Array.isArray(snapshot?.history)
        ? snapshot.history
        : (Array.isArray(currentState.历史记录) ? currentState.历史记录 : []);
    const envBase = snapshot?.env
        ? deps.规范化环境信息(snapshot.env)
        : deps.规范化环境信息(currentState.环境);
    const memoryBase = snapshot?.memory
        ? deps.规范化记忆系统(snapshot.memory)
        : deps.规范化记忆系统(currentState.记忆系统);
    const historySize = historyBase.length;
    const latestMsg = historySize > 0 ? historyBase[historySize - 1] : null;
    const latestDigest = latestMsg
        ? `${latestMsg.role}:${latestMsg.timestamp}:${(latestMsg.content || '').toString().slice(0, 30)}`
        : 'none';
    const timeText = 环境时间转标准串(envBase) || '';
    const locationText = deps.构建完整地点文本(envBase) || '';
    const memoryRound = Array.isArray(memoryBase?.回忆档案) ? memoryBase.回忆档案.length : 0;
    const memorySize = `${memoryBase.即时记忆?.length || 0}/${memoryBase.短期记忆?.length || 0}/${memoryBase.中期记忆?.length || 0}/${memoryBase.长期记忆?.length || 0}`;
    return `${timeText}|${locationText}|${historySize}|${memoryRound}|${memorySize}|${latestDigest}`;
};

const 生成自动存档节点ID = (save: Omit<存档结构, 'id'>): string => {
    const turn = 计算历史游玩回合数(save.历史记录);
    const env = save.环境信息 || ({} as any);
    const timeText = 环境时间转标准串(env) || `${save.时间戳 || Date.now()}`;
    const locationText = [env.具体地点, env.小地点, env.中地点, env.大地点]
        .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .join('/');
    return `turn:${turn}|time:${timeText}|loc:${locationText}`;
};

let 自动存档串行队列: Promise<void> = Promise.resolve();

const 构建读档后重Roll快照 = (
    save: 存档结构,
    loaded: {
        role: 角色数据结构;
        env: 环境信息结构;
        social: any[];
        world: 世界数据结构;
        battle: 战斗状态结构;
        sect: 详细门派结构;
        tasks: any[];
        agreements: any[];
        story: 剧情系统结构;
        storyPlan: 剧情规划结构;
        heroinePlan?: 女主剧情规划结构;
        fandomStoryPlan?: 同人剧情规划结构;
        fandomHeroinePlan?: 同人女主剧情规划结构;
        memory: 记忆系统结构;
        visual: 视觉设置结构;
        sceneArchive: 场景图片档案;
    },
    deps: Pick<存档协调依赖, '深拷贝' | '规范化环境信息' | '规范化记忆系统'>
) => {
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    let userIndex = -1;
    for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i]?.role === 'user' && typeof history[i]?.content === 'string' && history[i].content.trim()) {
            userIndex = i;
            break;
        }
    }
    if (userIndex < 0 || !history.slice(userIndex + 1).some((item) => item?.role === 'assistant')) return null;
    const 玩家输入 = String(history[userIndex]?.content || '').trim();
    if (!玩家输入) return null;
    return {
        玩家输入,
        审查基准来源: '读档重建' as const,
        游戏时间: 环境时间转标准串(loaded.env) || '未知时间',
        回档前状态: {
            角色: deps.深拷贝(loaded.role),
            环境: deps.规范化环境信息(deps.深拷贝(loaded.env)),
            社交: deps.深拷贝(loaded.social),
            世界: deps.深拷贝(loaded.world),
            战斗: deps.深拷贝(loaded.battle),
            玩家门派: deps.深拷贝(loaded.sect),
            任务列表: deps.深拷贝(loaded.tasks),
            约定列表: deps.深拷贝(loaded.agreements),
            剧情: deps.深拷贝(loaded.story),
            剧情规划: deps.深拷贝(loaded.storyPlan),
            女主剧情规划: deps.深拷贝(loaded.heroinePlan),
            同人剧情规划: deps.深拷贝(loaded.fandomStoryPlan),
            同人女主剧情规划: deps.深拷贝(loaded.fandomHeroinePlan),
            记忆系统: deps.深拷贝(deps.规范化记忆系统(loaded.memory)),
            叙事平静值: deps.深拷贝(loaded.叙事平静值 || { 平静计数: 0, 情节事件记录: [] })
        },
        回档前持久态: {
            视觉设置: deps.深拷贝(loaded.visual),
            场景图片档案: deps.深拷贝(loaded.sceneArchive)
        },
        回档前历史: deps.深拷贝(history.slice(0, userIndex))
    };
};

export const 创建存档数据 = (
    type: 'manual' | 'auto',
    currentState: 存档协调当前状态,
    deps: 存档协调依赖,
    autoSignature?: string,
    snapshot?: 自动存档快照结构
): Omit<存档结构, 'id'> => {
    const historySource = Array.isArray(snapshot?.history)
        ? snapshot.history
        : (Array.isArray(currentState.历史记录) ? currentState.历史记录 : []);
    const roleSource = snapshot?.role ? snapshot.role : currentState.角色;
    const envSource = snapshot?.env ? snapshot.env : currentState.环境;
    const rawSocialSource = Array.isArray(snapshot?.social) ? snapshot.social : currentState.社交;
    const worldSource = snapshot?.world ? snapshot.world : currentState.世界;
    const battleSource = snapshot?.battle ? snapshot.battle : currentState.战斗;
    const sectSource = snapshot?.sect ? snapshot.sect : currentState.玩家门派;
    const tasksSource = Array.isArray(snapshot?.tasks) ? snapshot.tasks : currentState.任务列表;
    const agreementsSource = Array.isArray(snapshot?.agreements) ? snapshot.agreements : currentState.约定列表;
    const storySource = snapshot?.story ? snapshot.story : currentState.剧情;
    const storyPlanSource = snapshot?.storyPlan ? snapshot.storyPlan : currentState.剧情规划;
    const heroinePlanSource = snapshot?.heroinePlan ?? currentState.女主剧情规划;
    const fandomStoryPlanSource = snapshot?.fandomStoryPlan ?? currentState.同人剧情规划;
    const fandomHeroinePlanSource = snapshot?.fandomHeroinePlan ?? currentState.同人女主剧情规划;
    const memorySource = snapshot?.memory ? snapshot.memory : deps.规范化记忆系统(currentState.记忆系统);
    const normalizedMemorySource = deps.规范化记忆系统(deps.深拷贝(memorySource));
    const storyForSave = deps.规范化剧情状态(deps.深拷贝(storySource));
    const historySnapshot = (() => {
        const built = 构建存档历史记录(historySource, deps);
        return 尝试修复完成开局但缺失历史的存档(
            {
                时间戳: Date.now(),
                环境信息: envSource,
                游戏初始时间: currentState.游戏初始时间
            },
            built,
            normalizedMemorySource,
            storyForSave
        ) || built;
    })();
    const openingConfigSource = snapshot?.openingConfig ?? currentState.openingConfig;
    const socialSource = 修复开局伙伴社交列表(rawSocialSource, openingConfigSource, roleSource);
    const visualSource = snapshot?.visualConfig ? snapshot.visualConfig : currentState.visualConfig;
    const sceneImageArchiveSource = snapshot?.sceneImageArchive
        ? snapshot.sceneImageArchive
        : currentState.sceneImageArchive;
    清理内嵌图片冗余字段(roleSource, { maxNodes: 50000 });
    清理内嵌图片冗余字段(socialSource, { maxNodes: 70000 });
    清理内嵌图片冗余字段(sceneImageArchiveSource, { maxNodes: 20000 });
    const auctionHouseScope = 构建拍卖行存储作用域({
        游戏初始时间: currentState.游戏初始时间,
        角色数据: roleSource,
        环境信息: envSource,
        历史记录: historySnapshot
    });
    const auctionHouseSource = snapshot?.auctionHouse || 清理并补货(读取拍卖行状态(auctionHouseScope, { 题材模式: openingConfigSource?.题材模式, 模式运行时: openingConfigSource?.modeRuntimeProfile }), { 题材模式: openingConfigSource?.题材模式, 模式运行时: openingConfigSource?.modeRuntimeProfile });
    const filteredSceneImageArchive = 过滤当前存档场景图片档案(sceneImageArchiveSource, historySnapshot, deps);
    const filteredCharacterAnchors = 过滤当前存档角色锚点(
        currentState.角色锚点列表,
        roleSource,
        socialSource,
        currentState.当前角色锚点ID
    );
    const coreWorldPrompt = 读取核心提示词内容(currentState.提示词池, 'core_world');
    const coreRealmPrompt = 读取核心提示词内容(currentState.提示词池, 'core_realm');
    const 核心提示词快照 = (coreWorldPrompt || coreRealmPrompt)
        ? {
            世界观母本: coreWorldPrompt || undefined,
            境界体系: coreRealmPrompt || undefined
        }
        : undefined;

    const 现实保存时间戳 = Date.now();

    return {
        类型: type,
        时间戳: 现实保存时间戳,
        元数据: {
            schemaVersion: deps.存档格式版本,
            历史记录条数: historySnapshot.length,
            游戏回合数: 计算历史游玩回合数(historySnapshot),
            历史记录是否裁剪: false,
            自动存档签名: type === 'auto' ? (autoSignature || '') : undefined,
            现实保存时间戳,
            现实保存时间ISO: new Date(现实保存时间戳).toISOString()
        },
        游戏初始时间: currentState.游戏初始时间,
        角色数据: deps.深拷贝(roleSource),
        环境信息: deps.规范化环境信息(deps.深拷贝(envSource)),
        历史记录: historySnapshot,
        社交: deps.深拷贝(socialSource),
        世界: deps.深拷贝(worldSource),
        战斗: deps.深拷贝(battleSource),
        玩家门派: deps.深拷贝(sectSource),
        任务列表: deps.深拷贝(tasksSource),
        约定列表: deps.深拷贝(agreementsSource),
        剧情: storyForSave,
        剧情规划: deps.规范化剧情规划状态(deps.深拷贝(storyPlanSource)),
        女主剧情规划: deps.规范化女主剧情规划状态(heroinePlanSource ? deps.深拷贝(heroinePlanSource) : undefined),
        同人剧情规划: deps.规范化同人剧情规划状态(
            fandomStoryPlanSource ? deps.深拷贝(fandomStoryPlanSource) : undefined
        ),
        同人女主剧情规划: deps.规范化同人女主剧情规划状态(
            fandomHeroinePlanSource ? deps.深拷贝(fandomHeroinePlanSource) : undefined
        ),
        记忆系统: normalizedMemorySource,
        openingConfig: deps.规范化可选开局配置(deps.深拷贝(openingConfigSource)),
        游戏设置: deps.深拷贝(currentState.gameConfig),
        记忆配置: deps.深拷贝(currentState.memoryConfig),
        视觉设置: deps.规范化视觉设置(deps.深拷贝(visualSource || {})),
        场景图片档案: filteredSceneImageArchive,
        核心提示词快照,
        角色锚点列表: deps.深拷贝(filteredCharacterAnchors.anchors),
        当前角色锚点ID: filteredCharacterAnchors.currentAnchorId,
        拍卖行: deps.深拷贝(auctionHouseSource),
        叙事平静值: deps.深拷贝(snapshot?.叙事平静值 || currentState.叙事平静值 || { 平静计数: 0, 情节事件记录: [] }),
        场外对话: 规范化场外对话列表(deps.深拷贝(
            Array.isArray(snapshot?.场外对话)
                ? snapshot.场外对话
                : (Array.isArray(currentState.场外对话) ? currentState.场外对话 : [])
        ))
    };
};

export const 执行手动存档 = async (
    currentState: 存档协调当前状态,
    deps: 存档协调依赖
): Promise<void> => {
    const save = 创建存档数据('manual', currentState, deps);
    const persistedSave = await dbService.保存存档并读取(save);
    后台同步存档到云端(persistedSave);
    deps.setHasSave(true);
};

const 执行自动存档内核 = async (
    currentState: 存档协调当前状态,
    deps: 存档协调依赖,
    snapshot?: 自动存档快照结构
): Promise<存档结构 | null> => {
    const historySource = Array.isArray(snapshot?.history)
        ? snapshot.history
        : (Array.isArray(currentState.历史记录) ? currentState.历史记录 : []);
    const 显式携带历史快照 = Array.isArray(snapshot?.history);
    const forceSave = snapshot?.force === true;
    if (!forceSave && (!Array.isArray(historySource) || historySource.length === 0)) return null;

    const signature = 构建自动存档签名(snapshot, currentState, deps);
    const now = Date.now();
    if (!forceSave && signature && signature === deps.最近自动存档签名Ref.current) return;
    if (
        !forceSave
        && !显式携带历史快照
        && deps.最近自动存档时间戳Ref.current > 0
        && now - deps.最近自动存档时间戳Ref.current < deps.自动存档最小间隔毫秒
    ) {
        return null;
    }

    try {
        const save = 创建存档数据('auto', currentState, deps, signature, snapshot);
        const nodeId = 生成自动存档节点ID(save);
        save.元数据 = {
            ...(save.元数据 || {}),
            自动存档签名: `node:${nodeId}`,
            自动存档节点ID: nodeId
        } as any;
        const persistedSave = await dbService.保存存档并读取(save);
        后台同步存档到云端(persistedSave);
        deps.最近自动存档签名Ref.current = signature;
        deps.最近自动存档时间戳Ref.current = now;
        deps.setHasSave(true);
        return persistedSave;
    } catch (error) {
        console.error('自动存档失败', error);
        if (forceSave) throw error;
        return null;
    }
};

export const 执行自动存档 = async (
    currentState: 存档协调当前状态,
    deps: 存档协调依赖,
    snapshot?: 自动存档快照结构
): Promise<存档结构 | null> => {
    const run = () => 执行自动存档内核(currentState, deps, snapshot);
    const task = 自动存档串行队列.then(run, run);
    自动存档串行队列 = task.then(() => undefined, () => undefined);
    return task;
};

export const 执行读取存档 = async (
    save: 存档结构,
    deps: 存档协调依赖
): Promise<void> => {
    const startAt = Date.now();
    const trace = (stage: string, payload: Record<string, unknown> = {}) => {
        recordSaveLoadTrace(`coordinator.${stage}`, {
            id: save?.id,
            elapsedMs: Date.now() - startAt,
            native: isNativeCapacitorEnvironment(),
            ...payload
        });
    };

    trace('start', {
        save: buildSaveDebugSummary(save)
    });
    deps.清空重Roll快照();
    deps.重置自动存档状态();
    deps.切换生图存档作用域?.();
    deps.设置最近开局配置(null);
    // [修复] 读档后旧的“开局提示词基线”不再适用，避免快速重开误恢复到别的局的基线
    void deps.清除开局提示词基线?.();
    trace('reset.done');

    const saveHistoryCount = Array.isArray(save.历史记录) ? save.历史记录.length : 0;
    const shouldTrustPersistedHeavyFields = isNativeCapacitorEnvironment()
        && Number(save.元数据?.schemaVersion || 0) >= deps.存档格式版本
        && saveHistoryCount >= 80;
    const cleanupResult = {
        role: 清理内嵌图片冗余字段(save.角色数据, { maxNodes: 50000 }),
        social: 清理内嵌图片冗余字段(save.社交, { maxNodes: 70000 }),
        sceneArchive: 清理内嵌图片冗余字段(save.场景图片档案, { maxNodes: 20000 })
    };
    trace('heavyFieldPolicy', {
        shouldTrustPersistedHeavyFields,
        schemaVersion: save.元数据?.schemaVersion,
        expectedSchemaVersion: deps.存档格式版本,
        historyCount: saveHistoryCount,
        cleanupResult
    });

    const saveGameConfig = save.游戏设置 ? deps.规范化游戏设置(save.游戏设置) : undefined;
    const normalizedEnv = deps.规范化环境信息(save.环境信息 || deps.创建开场空白环境());
    trace('normalize.basic.done', {
        hasGameConfig: Boolean(saveGameConfig),
        envTime: (normalizedEnv as any)?.时间,
        envLocation: (normalizedEnv as any)?.具体地点
    });
    trace('role.prepare.start', {
        trusted: shouldTrustPersistedHeavyFields,
        roleStats: collectValueStats(save.角色数据, 12000),
        largestStrings: collectLargestStrings(save.角色数据, { limit: 8, maxNodes: 20000 })
    });
    let loadedRole = shouldTrustPersistedHeavyFields
        ? ((save.角色数据 || {}) as 角色数据结构)
        : deps.规范化角色物品容器映射(save.角色数据, {
            当前时间: normalizedEnv,
            启用饱腹口渴系统: saveGameConfig?.启用饱腹口渴系统
        });
    trace('role.prepare.done', {
        trusted: shouldTrustPersistedHeavyFields,
        roleStats: collectValueStats(loadedRole, 12000),
        largestStrings: collectLargestStrings(loadedRole, { limit: 8, maxNodes: 20000 })
    });
    deps.设置角色(loadedRole);
    trace('role.set.done');
    deps.设置环境(normalizedEnv);
    trace('env.set.done');
    trace('social.prepare.start', {
        trusted: shouldTrustPersistedHeavyFields,
        socialCount: Array.isArray(save.社交) ? save.社交.length : 0,
        socialStats: collectValueStats(save.社交, 16000)
    });
    let loadedSocial = shouldTrustPersistedHeavyFields
        ? (Array.isArray(save.社交) ? save.社交 : [])
        : deps.规范化社交列表(save.社交 || [], { 合并同名: false });
    const nameRepairResult = 修复旧姓名库误改NPC姓名列表(loadedSocial);
    if (nameRepairResult.已修复数量 > 0) {
        loadedSocial = nameRepairResult.列表;
    }
    trace('social.prepare.done', {
        trusted: shouldTrustPersistedHeavyFields,
        socialCount: loadedSocial.length,
        repairedNameCount: nameRepairResult.已修复数量,
        socialStats: collectValueStats(loadedSocial, 16000)
    });
    deps.设置社交(loadedSocial);
    trace('roleEnvSocial.set.done', {
        trusted: shouldTrustPersistedHeavyFields,
        socialCount: loadedSocial.length
    });
    const rawWorld = save.世界 || deps.创建开场空白世界();
    // 删除旧地图坐标字段
    ['地图', '建筑', '地图建筑', '地图道路', '地图人物'].forEach(k => { if (k in (rawWorld as any)) (rawWorld as any)[k] = []; });
    // 检测并清除旧格式地图层级（没有寰宇节点的视为旧数据）
    const layers = Array.isArray((rawWorld as any)?.地图层级) ? (rawWorld as any).地图层级 : [];
    if (layers.length > 0 && !layers.some((l: any) => l?.层级 === '寰宇')) {
        (rawWorld as any).地图层级 = [];
    }
    const normalizedWorld = deps.规范化世界状态(rawWorld);
    ['地图', '建筑', '地图建筑', '地图道路', '地图人物'].forEach(k => { if (k in (normalizedWorld as any)) (normalizedWorld as any)[k] = []; });
    deps.设置世界(normalizedWorld);
    trace('world.set.done', {
        layers: Array.isArray((normalizedWorld as any)?.地图层级) ? (normalizedWorld as any).地图层级.length : 0
    });
    const loadedBattle = deps.规范化战斗状态(save.战斗 || deps.创建开场空白战斗());
    let loadedSect = deps.规范化门派状态(save.玩家门派 || deps.创建空门派状态());
    const syncedSectState = 同步角色与门派状态({
        角色: loadedRole,
        玩家门派: loadedSect
    });
    loadedRole = syncedSectState.角色;
    loadedSect = deps.规范化门派状态(syncedSectState.玩家门派);
    const loadedTasks = 规范化任务列表自动结算(save.任务列表 || []);
    const loadedAgreements = Array.isArray(save.约定列表) ? save.约定列表 : [];
    deps.设置角色(loadedRole);
    deps.设置战斗(loadedBattle);
    deps.设置玩家门派(loadedSect);
    deps.设置任务列表(loadedTasks);
    deps.设置约定列表(loadedAgreements);
    trace('battleSectTasks.set.done', {
        taskCount: Array.isArray(save.任务列表) ? save.任务列表.length : 0,
        agreementCount: Array.isArray(save.约定列表) ? save.约定列表.length : 0
    });
    const loadedStory = deps.规范化剧情状态(save.剧情 || deps.创建开场空白剧情());
    const loadedStoryPlan = deps.规范化剧情规划状态((save as any).剧情规划);
    const loadedHeroinePlan = deps.规范化女主剧情规划状态((save as any).女主剧情规划);
    const loadedFandomStoryPlan = deps.规范化同人剧情规划状态((save as any).同人剧情规划);
    const loadedFandomHeroinePlan = deps.规范化同人女主剧情规划状态((save as any).同人女主剧情规划);
    deps.设置剧情(loadedStory);
    deps.设置剧情规划(loadedStoryPlan);
    deps.设置女主剧情规划(loadedHeroinePlan);
    deps.设置同人剧情规划(loadedFandomStoryPlan);
    deps.设置同人女主剧情规划(loadedFandomHeroinePlan);
    deps.设置开局配置(deps.规范化可选开局配置(save.openingConfig));
    trace('storyPlans.set.done');
    const promptSnapshot = save.核心提示词快照 && typeof save.核心提示词快照 === 'object'
        ? save.核心提示词快照
        : undefined;
    if (promptSnapshot) {
        trace('promptSnapshot.start', {
            hasWorldPrompt: typeof promptSnapshot.世界观母本 === 'string' && Boolean(promptSnapshot.世界观母本.trim()),
            hasRealmPrompt: typeof promptSnapshot.境界体系 === 'string' && Boolean(promptSnapshot.境界体系.trim())
        });
        let nextPromptPool = Array.isArray(deps.获取当前提示词池())
            ? [...deps.获取当前提示词池()]
            : [];
        if (typeof promptSnapshot.世界观母本 === 'string' && promptSnapshot.世界观母本.trim()) {
            nextPromptPool = 写入或插入提示词(
                nextPromptPool,
                核心_世界观.id,
                核心_世界观,
                promptSnapshot.世界观母本
            );
        }
        if (typeof promptSnapshot.境界体系 === 'string' && promptSnapshot.境界体系.trim()) {
            nextPromptPool = 写入或插入提示词(
                nextPromptPool,
                核心_境界体系.id,
                核心_境界体系,
                promptSnapshot.境界体系
            );
        }
        if (nextPromptPool.length > 0) {
            deps.设置提示词池(nextPromptPool);
            await dbService.保存设置(设置键.提示词池, nextPromptPool);
        }
        trace('promptSnapshot.done');
    }
    let loadedHistoryForState = 清理历史瞬态滚动标记(
        Array.isArray(save.历史记录) ? deps.深拷贝(save.历史记录) : []
    );
    const loadedMemory = deps.规范化记忆系统(save.记忆系统);
    const repairedOpeningHistory = 尝试修复完成开局但缺失历史的存档(
        save,
        loadedHistoryForState,
        loadedMemory,
        loadedStory
    );
    if (repairedOpeningHistory) {
        trace('opening.history.repaired', {
            originalHistory: buildHistoryDebugSummary(loadedHistoryForState),
            repairedHistory: buildHistoryDebugSummary(repairedOpeningHistory)
        });
        loadedHistoryForState = repairedOpeningHistory;
    }
    const metadataCount = save?.元数据?.历史记录条数;
    if (typeof metadataCount === 'number' && metadataCount >= 10 && loadedHistoryForState.length <= 2) {
        console.error('[存档异常] 读档历史记录与元数据严重不符', {
            id: save?.id,
            元数据条数: metadataCount,
            实际恢复: loadedHistoryForState.length,
            首条内容: loadedHistoryForState[0]?.content?.slice(0, 80) || '(空)',
            schemaVersion: save?.元数据?.schemaVersion,
            时间戳: save?.时间戳
        });
    }
    trace('history.set.start', {
        history: buildHistoryDebugSummary(loadedHistoryForState)
    });
    deps.设置历史记录(loadedHistoryForState);
    trace('history.set.done');
    // 场外对话（侧聊暂存）随存档恢复；旧存档没有该字段时按空数组处理（向后兼容）。
    deps.设置场外对话?.(规范化场外对话列表(deps.深拷贝(Array.isArray((save as any).场外对话) ? (save as any).场外对话 : [])));
    deps.应用并同步记忆系统(loadedMemory, { 静默总结提示: true });
    deps.设置叙事平静值(save.叙事平静值 || { 平静计数: 0, 情节事件记录: [] });
    trace('memory.set.done', {
        memory: {
            archive: Array.isArray(save.记忆系统?.回忆档案) ? save.记忆系统?.回忆档案.length : 0,
            instant: Array.isArray(save.记忆系统?.即时记忆) ? save.记忆系统?.即时记忆.length : 0,
            short: Array.isArray(save.记忆系统?.短期记忆) ? save.记忆系统?.短期记忆.length : 0,
            middle: Array.isArray(save.记忆系统?.中期记忆) ? save.记忆系统?.中期记忆.length : 0,
            long: Array.isArray(save.记忆系统?.长期记忆) ? save.记忆系统?.长期记忆.length : 0
        }
    });

    if (saveGameConfig) deps.setGameConfig(saveGameConfig);
    if (save.记忆配置) deps.setMemoryConfig(deps.规范化记忆配置(save.记忆配置));
    const incomingVisual = save.视觉设置 && typeof save.视觉设置 === 'object' ? save.视觉设置 : null;
    const currentVisual = deps.获取当前视觉设置();
    let loadedVisual: 视觉设置结构;
    if (incomingVisual) {
        const mergedVisual = deps.规范化视觉设置({
            ...currentVisual,
            ...incomingVisual
        });
        loadedVisual = mergedVisual;
        deps.设置视觉设置(loadedVisual);
    } else {
        loadedVisual = deps.规范化视觉设置(currentVisual || {});
        deps.设置视觉设置(loadedVisual);
    }
    trace('configs.set.done', {
        hasIncomingVisual: Boolean(incomingVisual)
    });
    const loadedHistory = loadedHistoryForState;
    let loadedSceneArchive: 场景图片档案;
    if (save.场景图片档案 && typeof save.场景图片档案 === 'object') {
        trace('sceneArchive.set.start', {
            sceneHistory: Array.isArray(save.场景图片档案.生图历史) ? save.场景图片档案.生图历史.length : 0
        });
        loadedSceneArchive = 过滤当前存档场景图片档案(save.场景图片档案, loadedHistory, deps);
        deps.设置场景图片档案(loadedSceneArchive);
    } else {
        trace('sceneArchive.empty.start');
        loadedSceneArchive = deps.规范化场景图片档案({});
        deps.设置场景图片档案(loadedSceneArchive);
    }
    trace('sceneArchive.set.done');
    deps.设置游戏初始时间(typeof save.游戏初始时间 === 'string' ? save.游戏初始时间 : '');
    const loadedAnchors = 过滤当前存档角色锚点(
        Array.isArray(save.角色锚点列表) ? deps.深拷贝(save.角色锚点列表) : [],
        save.角色数据,
        save.社交,
        typeof save.当前角色锚点ID === 'string' ? save.当前角色锚点ID : ''
    );
    deps.设置角色锚点列表(loadedAnchors.anchors);
    deps.设置当前角色锚点ID(loadedAnchors.currentAnchorId);
    trace('anchors.set.done', {
        anchors: loadedAnchors.anchors.length,
        currentAnchorId: loadedAnchors.currentAnchorId
    });
    const auctionScope = 构建拍卖行存储作用域(save);
    const loadedAuctionState = save.拍卖行 && typeof save.拍卖行 === 'object'
        ? 清理并补货(save.拍卖行 as 拍卖行状态, { 题材模式: save.openingConfig?.题材模式, 模式运行时: save.openingConfig?.modeRuntimeProfile })
        : 清理并补货(读取拍卖行状态(auctionScope, { 题材模式: save.openingConfig?.题材模式, 模式运行时: save.openingConfig?.modeRuntimeProfile }), { 题材模式: save.openingConfig?.题材模式, 模式运行时: save.openingConfig?.modeRuntimeProfile });
    保存拍卖行状态(loadedAuctionState, auctionScope);
    trace('auction.set.done');
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('moranjianghu:auction-house-loaded', {
            detail: { scope: auctionScope, state: loadedAuctionState }
        }));
    }
    const restoredRerollSnapshot = deps.推入重Roll快照 ? 构建读档后重Roll快照(save, {
        role: loadedRole,
        env: normalizedEnv,
        social: loadedSocial,
        world: normalizedWorld,
        battle: loadedBattle,
        sect: loadedSect,
        tasks: loadedTasks,
        agreements: loadedAgreements,
        story: loadedStory,
        storyPlan: loadedStoryPlan,
        heroinePlan: loadedHeroinePlan,
        fandomStoryPlan: loadedFandomStoryPlan,
        fandomHeroinePlan: loadedFandomHeroinePlan,
        memory: loadedMemory,
        visual: loadedVisual,
        sceneArchive: loadedSceneArchive
    }, deps) : null;
    if (restoredRerollSnapshot && deps.推入重Roll快照) {
        deps.推入重Roll快照(restoredRerollSnapshot);
    }
    trace('reroll.restore.done', {
        restored: Boolean(restoredRerollSnapshot),
        historyCount: loadedHistory.length
    });

    // [防御] 检测"开局中途存档"：历史记录只有一条 "正在生成开场内容..."
    // 这种存档通常是在新游戏开局过程中（API 请求尚未完成时）被保存的，
    // 读档后会导致主内容区空白、只显示开局占位消息。
    const isOpeningIncomplete = 是否开局生成占位历史(loadedHistory);
    if (isOpeningIncomplete) {
        trace('incomplete.opening.save.detected', {
            historyLength: loadedHistory.length,
            historyContent: loadedHistory[0]?.content
        });
        deps.设置历史记录([
            {
                role: 'system',
                content: '[系统] 检测到当前存档是在开局过程中保存的，开局内容未完成生成。请在聊天框输入任意指令重新触发开局，或返回主页开始新游戏。',
                timestamp: Date.now()
            }
        ]);
    }

    trace('view.set.start');
    deps.setHasSave(true);
    deps.setView('game');
    deps.setShowSaveLoad({ show: false, mode: 'load' });
    trace('view.set.done');
    trace('imageCache.schedule.start');
    后台缓存当前存档图床图片(save);
    trace('done');
};
