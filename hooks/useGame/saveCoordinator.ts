import * as dbService from '../../services/dbService';
import type {
    存档结构,
    聊天记录结构,
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
    OpeningConfig
} from '../../types';
import { 核心_世界观 } from '../../prompts/core/world';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 设置键 } from '../../utils/settingsSchema';
import { 环境时间转标准串 } from './timeUtils';

export type 自动存档快照结构 = {
    history?: 聊天记录结构[];
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
    force?: boolean;
};

type 存档协调当前状态 = {
    历史记录: 聊天记录结构[];
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
    规范化角色物品容器映射: (raw?: any) => 角色数据结构;
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
    清空重Roll快照: () => void;
    重置自动存档状态: () => void;
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
    return deps.深拷贝(rawHistory);
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
    const historySnapshot = 构建存档历史记录(historySource, deps);
    const roleSource = snapshot?.role ? snapshot.role : currentState.角色;
    const envSource = snapshot?.env ? snapshot.env : currentState.环境;
    const socialSource = Array.isArray(snapshot?.social) ? snapshot.social : currentState.社交;
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
    const openingConfigSource = snapshot?.openingConfig ?? currentState.openingConfig;
    const visualSource = snapshot?.visualConfig ? snapshot.visualConfig : currentState.visualConfig;
    const sceneImageArchiveSource = snapshot?.sceneImageArchive
        ? snapshot.sceneImageArchive
        : currentState.sceneImageArchive;
    const coreWorldPrompt = 读取核心提示词内容(currentState.提示词池, 'core_world');
    const coreRealmPrompt = 读取核心提示词内容(currentState.提示词池, 'core_realm');
    const 核心提示词快照 = (coreWorldPrompt || coreRealmPrompt)
        ? {
            世界观母本: coreWorldPrompt || undefined,
            境界体系: coreRealmPrompt || undefined
        }
        : undefined;

    return {
        类型: type,
        时间戳: Date.now(),
        元数据: {
            schemaVersion: deps.存档格式版本,
            历史记录条数: historySnapshot.length,
            历史记录是否裁剪: false,
            自动存档签名: type === 'auto' ? (autoSignature || '') : undefined
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
        剧情: deps.规范化剧情状态(deps.深拷贝(storySource)),
        剧情规划: deps.规范化剧情规划状态(deps.深拷贝(storyPlanSource)),
        女主剧情规划: deps.规范化女主剧情规划状态(heroinePlanSource ? deps.深拷贝(heroinePlanSource) : undefined),
        同人剧情规划: deps.规范化同人剧情规划状态(
            fandomStoryPlanSource ? deps.深拷贝(fandomStoryPlanSource) : undefined
        ),
        同人女主剧情规划: deps.规范化同人女主剧情规划状态(
            fandomHeroinePlanSource ? deps.深拷贝(fandomHeroinePlanSource) : undefined
        ),
        记忆系统: deps.规范化记忆系统(deps.深拷贝(memorySource)),
        openingConfig: deps.规范化可选开局配置(deps.深拷贝(openingConfigSource)),
        游戏设置: deps.深拷贝(currentState.gameConfig),
        记忆配置: deps.深拷贝(currentState.memoryConfig),
        视觉设置: deps.规范化视觉设置(deps.深拷贝(visualSource || {})),
        场景图片档案: deps.规范化场景图片档案(deps.深拷贝(sceneImageArchiveSource)),
        核心提示词快照,
        角色锚点列表: deps.深拷贝(currentState.角色锚点列表),
        当前角色锚点ID: currentState.当前角色锚点ID
    };
};

export const 执行手动存档 = async (
    currentState: 存档协调当前状态,
    deps: 存档协调依赖
): Promise<void> => {
    const save = 创建存档数据('manual', currentState, deps);
    await dbService.保存存档(save);
    deps.setHasSave(true);
};

export const 执行自动存档 = async (
    currentState: 存档协调当前状态,
    deps: 存档协调依赖,
    snapshot?: 自动存档快照结构
): Promise<void> => {
    const historySource = Array.isArray(snapshot?.history)
        ? snapshot.history
        : (Array.isArray(currentState.历史记录) ? currentState.历史记录 : []);
    const 显式携带历史快照 = Array.isArray(snapshot?.history);
    const forceSave = snapshot?.force === true;
    if (!forceSave && (!Array.isArray(historySource) || historySource.length === 0)) return;

    const signature = 构建自动存档签名(snapshot, currentState, deps);
    const now = Date.now();
    if (!forceSave && signature && signature === deps.最近自动存档签名Ref.current) return;
    if (
        !forceSave
        && !显式携带历史快照
        && deps.最近自动存档时间戳Ref.current > 0
        && now - deps.最近自动存档时间戳Ref.current < deps.自动存档最小间隔毫秒
    ) {
        return;
    }

    try {
        const save = 创建存档数据('auto', currentState, deps, signature, snapshot);
        await dbService.保存存档(save);
        deps.最近自动存档签名Ref.current = signature;
        deps.最近自动存档时间戳Ref.current = now;
        deps.setHasSave(true);
    } catch (error) {
        console.error('自动存档失败', error);
    }
};

export const 执行读取存档 = async (
    save: 存档结构,
    deps: 存档协调依赖
): Promise<void> => {
    deps.清空重Roll快照();
    deps.重置自动存档状态();
    deps.设置最近开局配置(null);

    const saveGameConfig = save.游戏设置 ? deps.规范化游戏设置(save.游戏设置) : undefined;
    deps.设置角色(deps.规范化角色物品容器映射(save.角色数据));
    deps.设置环境(deps.规范化环境信息(save.环境信息 || deps.创建开场空白环境()));
    deps.设置社交(deps.规范化社交列表(save.社交 || []));
    deps.设置世界(deps.规范化世界状态(save.世界 || deps.创建开场空白世界()));
    deps.设置战斗(deps.规范化战斗状态(save.战斗 || deps.创建开场空白战斗()));
    deps.设置玩家门派(save.玩家门派 || deps.创建空门派状态());
    deps.设置任务列表(save.任务列表 || []);
    deps.设置约定列表(save.约定列表 || []);
    deps.设置剧情(deps.规范化剧情状态(save.剧情 || deps.创建开场空白剧情()));
    deps.设置剧情规划(deps.规范化剧情规划状态((save as any).剧情规划));
    deps.设置女主剧情规划(deps.规范化女主剧情规划状态((save as any).女主剧情规划));
    deps.设置同人剧情规划(deps.规范化同人剧情规划状态((save as any).同人剧情规划));
    deps.设置同人女主剧情规划(deps.规范化同人女主剧情规划状态((save as any).同人女主剧情规划));
    deps.设置开局配置(deps.规范化可选开局配置(save.openingConfig));
    const promptSnapshot = save.核心提示词快照 && typeof save.核心提示词快照 === 'object'
        ? save.核心提示词快照
        : undefined;
    if (promptSnapshot) {
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
    }
    deps.设置历史记录(Array.isArray(save.历史记录) ? save.历史记录 : []);
    deps.应用并同步记忆系统(deps.规范化记忆系统(save.记忆系统), { 静默总结提示: true });

    if (saveGameConfig) deps.setGameConfig(saveGameConfig);
    if (save.记忆配置) deps.setMemoryConfig(deps.规范化记忆配置(save.记忆配置));
    const incomingVisual = save.视觉设置 && typeof save.视觉设置 === 'object' ? save.视觉设置 : null;
    const currentVisual = deps.获取当前视觉设置();
    if (incomingVisual) {
        const mergedVisual = deps.规范化视觉设置({
            ...currentVisual,
            ...incomingVisual
        });
        deps.设置视觉设置(mergedVisual);
    } else {
        deps.设置视觉设置(deps.规范化视觉设置(currentVisual || {}));
    }
    if (save.场景图片档案 && typeof save.场景图片档案 === 'object') {
        deps.设置场景图片档案(deps.规范化场景图片档案(save.场景图片档案));
    } else {
        deps.设置场景图片档案(deps.规范化场景图片档案({}));
    }
    deps.设置游戏初始时间(typeof save.游戏初始时间 === 'string' ? save.游戏初始时间 : '');
    deps.设置角色锚点列表(Array.isArray(save.角色锚点列表) ? deps.深拷贝(save.角色锚点列表) : []);
    deps.设置当前角色锚点ID(typeof save.当前角色锚点ID === 'string' ? save.当前角色锚点ID : '');

    deps.setHasSave(true);
    deps.setView('game');
    deps.setShowSaveLoad({ show: false, mode: 'load' });
};
