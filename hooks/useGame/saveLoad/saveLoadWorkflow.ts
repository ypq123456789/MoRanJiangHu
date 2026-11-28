import type {
    角色数据结构,
    场景图片档案,
    存档结构,
    战斗状态结构,
    环境信息结构,
    场外对话消息结构,
    场外交易记录结构,
    场外战果暂存结构,
    游戏设置结构,
    记忆系统结构,
    视觉设置结构,
    详细门派结构,
    聊天记录结构,
    OpeningConfig,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    剧情系统结构,
    世界数据结构,
    提示词结构,
    叙事状态结构,
    DirectorWorldBible
} from '../../../types';
import { 执行手动存档, 执行自动存档, 执行读取存档 } from '../saveCoordinator';
import type { 自动存档快照结构 } from '../saveCoordinator';
import { buildSaveDebugSummary, recordSaveLoadTrace } from '../../../utils/saveLoadTrace';

type 存档读取协调依赖 = Parameters<typeof 执行读取存档>[1];

type 存档编排工作流依赖 = {
    存档格式版本: number;
    自动存档最小间隔毫秒: number;
    深拷贝: <T>(value: T) => T;
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
    导演圣经?: DirectorWorldBible;
    上一回合导演圣经?: DirectorWorldBible;
    worldEvents?: string[];
    记忆系统: 记忆系统结构;
    叙事平静值?: 叙事状态结构;
    openingConfig?: OpeningConfig;
    提示词池: 提示词结构[];
    游戏初始时间: string;
    gameConfig: 游戏设置结构;
    memoryConfig: any;
    获取当前视觉设置快照: () => 视觉设置结构;
    获取当前场景图片档案快照: () => 场景图片档案;
    获取角色锚点列表: () => any[];
    获取当前角色锚点ID: () => string;
    规范化环境信息: (envLike?: any) => 环境信息结构;
    构建完整地点文本: (envLike?: any) => string;
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
    规范化记忆配置: (raw?: any) => any;
    规范化游戏设置: (raw?: any) => 游戏设置结构;
    规范化视觉设置: (raw?: any) => 视觉设置结构;
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
    setHasSave: (value: boolean) => void;
    setGameConfig: (value: 游戏设置结构) => void;
    setMemoryConfig: (value: any) => void;
    设置视觉设置: (value: 视觉设置结构) => void;
    设置场景图片档案: (value: 场景图片档案) => void;
    设置游戏初始时间: (value: string) => void;
    设置角色锚点列表: (value: any[]) => void;
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
    设置导演圣经?: (value: DirectorWorldBible | undefined) => void;
    设置上一回合导演圣经?: (value: DirectorWorldBible | undefined) => void;
    setWorldEvents?: (value: string[]) => void;
    设置开局配置: (value: OpeningConfig | undefined) => void;
    设置提示词池: (value: 提示词结构[]) => void;
    设置历史记录: (value: 聊天记录结构[]) => void;
    设置叙事平静值: (value: 叙事状态结构) => void;
    场外对话?: 场外对话消息结构[];
    设置场外对话: (value: 场外对话消息结构[]) => void;
    场外交易暂存?: 场外交易记录结构[];
    设置场外交易暂存?: (value: 场外交易记录结构[]) => void;
    场外战果暂存?: 场外战果暂存结构[];
    设置场外战果暂存?: (value: 场外战果暂存结构[]) => void;
    推送通知?: (payload: { title: string; message: string; tone?: 'info' | 'success' | 'error' }) => void;
    清空重Roll快照: () => void;
    推入重Roll快照: NonNullable<存档读取协调依赖['推入重Roll快照']>;
    重置自动存档状态: () => void;
    切换生图存档作用域?: () => void;
    清除开局提示词基线?: () => Promise<void>;
    最近自动存档时间戳Ref: { current: number };
    最近自动存档签名Ref: { current: string };
    读档前重置瞬态状态: () => void;
    读档后重置上下文: () => void;
    读档后定位到最新回合: () => void;
};

export const 创建存读档工作流 = (deps: 存档编排工作流依赖) => {
    const 构建当前状态 = () => ({
        历史记录: deps.历史记录,
        场外对话: deps.场外对话,
        场外交易暂存: deps.场外交易暂存,
        场外战果暂存: deps.场外战果暂存,
        worldEvents: deps.worldEvents,
        角色: deps.角色,
        环境: deps.环境,
        社交: deps.社交,
        世界: deps.世界,
        战斗: deps.战斗,
        玩家门派: deps.玩家门派,
        任务列表: deps.任务列表,
        约定列表: deps.约定列表,
        剧情: deps.剧情,
        剧情规划: deps.剧情规划,
        女主剧情规划: deps.女主剧情规划,
        同人剧情规划: deps.同人剧情规划,
        同人女主剧情规划: deps.同人女主剧情规划,
        导演圣经: deps.导演圣经,
        上一回合导演圣经: deps.上一回合导演圣经,
        记忆系统: deps.记忆系统,
        叙事平静值: deps.叙事平静值,
        openingConfig: deps.openingConfig,
        提示词池: deps.提示词池,
        游戏初始时间: deps.游戏初始时间,
        gameConfig: deps.gameConfig,
        memoryConfig: deps.memoryConfig,
        visualConfig: deps.获取当前视觉设置快照(),
        sceneImageArchive: deps.获取当前场景图片档案快照(),
        角色锚点列表: deps.获取角色锚点列表(),
        当前角色锚点ID: deps.获取当前角色锚点ID()
    });

    const 构建协调依赖 = () => ({
        存档格式版本: deps.存档格式版本,
        自动存档最小间隔毫秒: deps.自动存档最小间隔毫秒,
        深拷贝: deps.深拷贝,
        构建完整地点文本: deps.构建完整地点文本,
        规范化环境信息: deps.规范化环境信息,
        规范化世界状态: deps.规范化世界状态,
        规范化战斗状态: deps.规范化战斗状态,
        规范化门派状态: deps.规范化门派状态,
        规范化剧情状态: deps.规范化剧情状态,
        规范化剧情规划状态: deps.规范化剧情规划状态,
        规范化女主剧情规划状态: deps.规范化女主剧情规划状态,
        规范化同人剧情规划状态: deps.规范化同人剧情规划状态,
        规范化同人女主剧情规划状态: deps.规范化同人女主剧情规划状态,
        规范化记忆系统: deps.规范化记忆系统,
        规范化可选开局配置: deps.规范化可选开局配置,
        规范化记忆配置: deps.规范化记忆配置,
        规范化游戏设置: deps.规范化游戏设置,
        规范化视觉设置: deps.规范化视觉设置,
        获取当前视觉设置: deps.获取当前视觉设置快照,
        规范化场景图片档案: deps.规范化场景图片档案,
        规范化角色物品容器映射: deps.规范化角色物品容器映射,
        规范化社交列表: deps.规范化社交列表,
        获取当前提示词池: deps.获取当前提示词池,
        创建开场空白环境: deps.创建开场空白环境,
        创建开场空白世界: deps.创建开场空白世界,
        创建开场空白战斗: deps.创建开场空白战斗,
        创建空门派状态: deps.创建空门派状态,
        创建开场空白剧情: deps.创建开场空白剧情,
        应用并同步记忆系统: deps.应用并同步记忆系统,
        setHasSave: deps.setHasSave,
        setGameConfig: deps.setGameConfig,
        setMemoryConfig: deps.setMemoryConfig,
        设置视觉设置: deps.设置视觉设置,
        设置场景图片档案: deps.设置场景图片档案,
        设置游戏初始时间: deps.设置游戏初始时间,
        设置角色锚点列表: deps.设置角色锚点列表,
        设置当前角色锚点ID: deps.设置当前角色锚点ID,
        setView: deps.setView,
        setShowSaveLoad: deps.setShowSaveLoad,
        设置最近开局配置: deps.设置最近开局配置,
        设置角色: deps.设置角色,
        设置环境: deps.设置环境,
        设置社交: deps.设置社交,
        设置世界: deps.设置世界,
        设置战斗: deps.设置战斗,
        设置玩家门派: deps.设置玩家门派,
        设置任务列表: deps.设置任务列表,
        设置约定列表: deps.设置约定列表,
        设置剧情: deps.设置剧情,
        设置剧情规划: deps.设置剧情规划,
        设置女主剧情规划: deps.设置女主剧情规划,
        设置同人剧情规划: deps.设置同人剧情规划,
        设置同人女主剧情规划: deps.设置同人女主剧情规划,
        设置导演圣经: deps.设置导演圣经,
        设置上一回合导演圣经: deps.设置上一回合导演圣经,
        setWorldEvents: deps.setWorldEvents,
        设置开局配置: deps.设置开局配置,
        设置提示词池: deps.设置提示词池,
        设置历史记录: deps.设置历史记录,
        设置叙事平静值: deps.设置叙事平静值,
        设置场外对话: deps.设置场外对话,
        设置场外交易暂存: deps.设置场外交易暂存,
        设置场外战果暂存: deps.设置场外战果暂存,
        推送通知: deps.推送通知,
        清空重Roll快照: deps.清空重Roll快照,
        推入重Roll快照: deps.推入重Roll快照,
        重置自动存档状态: deps.重置自动存档状态,
        切换生图存档作用域: deps.切换生图存档作用域,
        清除开局提示词基线: deps.清除开局提示词基线,
        最近自动存档时间戳Ref: deps.最近自动存档时间戳Ref,
        最近自动存档签名Ref: deps.最近自动存档签名Ref
    });

    const handleSaveGame = async () => 执行手动存档(
        构建当前状态(),
        构建协调依赖()
    );

    const performAutoSave = async (snapshot?: 自动存档快照结构) => 执行自动存档(
        构建当前状态(),
        构建协调依赖(),
        snapshot
    );

    const handleLoadGame = async (save: 存档结构) => {
        const startAt = Date.now();
        recordSaveLoadTrace('workflow.loadGame.start', {
            id: save?.id,
            save: buildSaveDebugSummary(save)
        });
        deps.读档前重置瞬态状态();
        recordSaveLoadTrace('workflow.loadGame.beforeCoordinator', {
            id: save?.id,
            elapsedMs: Date.now() - startAt
        });
        await 执行读取存档(
            save,
            构建协调依赖()
        );
        recordSaveLoadTrace('workflow.loadGame.afterCoordinator', {
            id: save?.id,
            elapsedMs: Date.now() - startAt
        });
        deps.读档后重置上下文();
        recordSaveLoadTrace('workflow.loadGame.afterContextReset', {
            id: save?.id,
            elapsedMs: Date.now() - startAt
        });
        deps.读档后定位到最新回合();
        recordSaveLoadTrace('workflow.loadGame.done', {
            id: save?.id,
            elapsedMs: Date.now() - startAt
        });
        // 进场后内存曲线快照：iOS Safari「一进存档就刷新」疑为内存峰值导致
        // WebKit 杀标签页重载（表现为页面自己刷新、view 归零回主页）。
        // 在进场后 2s / 8s 各记一条；若 Safari 真的杀页面，这些 trace 会中断，
        // 中断点本身就是证据。trace 默认关闭，不影响正常玩法性能。
        if (typeof window !== 'undefined') {
            [2000, 8000].forEach((delayMs) => {
                window.setTimeout(() => {
                    recordSaveLoadTrace('workflow.loadGame.afterEnter', {
                        id: save?.id,
                        delayMs,
                        historyCount: Array.isArray(save.历史记录) ? save.历史记录.length : 0
                    });
                }, delayMs);
            });
        }
    };

    return {
        handleSaveGame,
        performAutoSave,
        handleLoadGame
    };
};
