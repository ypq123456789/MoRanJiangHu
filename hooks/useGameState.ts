import { useState, useEffect, useRef, useCallback } from 'react';
import { 
    角色数据结构,
    环境信息结构, 
    聊天记录结构, 
    接口设置结构,
    提示词结构,
    ThemePreset,
    视觉设置结构,
    节日结构,
    NPC结构,
    世界数据结构,
    详细门派结构,
    任务结构,
    约定结构,
    剧情系统结构,
    剧情规划结构,
    游戏设置结构,
    记忆配置结构,
    记忆系统结构,
    战斗状态结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    图片管理设置结构,
    OpeningConfig,
} from '../types';
import { 默认中期转长期提示词, 默认短期转中期提示词, 默认NPC记忆总结提示词 } from '../prompts/runtime/defaults';
import { 节日列表 } from '../data/world'; 
import * as dbService from '../services/dbService';
import { THEMES, 应用主题到根元素 } from '../styles/themes';
import { 创建空接口设置, 规范化接口设置 } from '../utils/apiConfig';
import { 默认游戏设置, 规范化游戏设置 } from '../utils/gameSettings';
import { 设置键 } from '../utils/settingsSchema';
import { 规范化视觉设置 } from '../utils/visualSettings';
import { 默认图片管理设置, 规范化图片管理设置 } from '../utils/imageManagerSettings';
import {
    创建开场空白世界,
    创建开场空白剧情,
    创建空剧情规划,
    创建空门派状态
} from './useGame/storyState';

const 加载默认提示词 = async (): Promise<提示词结构[]> => {
    const mod = await import('../prompts');
    return Array.isArray(mod.默认提示词) ? mod.默认提示词 : [];
};

export const useGameState = () => {
    const 创建空角色 = (): 角色数据结构 => ({
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
        头部当前血量: 0, 头部最大血量: 0, 头部状态: '',
        胸部当前血量: 0, 胸部最大血量: 0, 胸部状态: '',
        腹部当前血量: 0, 腹部最大血量: 0, 腹部状态: '',
        左手当前血量: 0, 左手最大血量: 0, 左手状态: '',
        右手当前血量: 0, 右手最大血量: 0, 右手状态: '',
        左腿当前血量: 0, 左腿最大血量: 0, 左腿状态: '',
        右腿当前血量: 0, 右腿最大血量: 0, 右腿状态: '',
        装备: {
            头部: '无', 胸部: '无', 盔甲: '无', 内衬: '无', 腿部: '无', 手部: '无', 足部: '无',
            主武器: '无', 副武器: '无', 暗器: '无', 背部: '无', 腰部: '无', 坐骑: '无'
        },
        物品列表: [],
        功法列表: [],
        当前经验: 0,
        升级经验: 0,
        玩家BUFF: [],
        突破条件: []
    });
    const 创建空环境 = (): 环境信息结构 => ({
        时间: '1:01:01:00:00',
        大地点: '',
        中地点: '',
        小地点: '',
        具体地点: '',
        节日: null,
        天气: { 天气: '', 结束日期: '1:01:01:00:00' },
        环境变量: []
    });

    const 创建空世界 = (): 世界数据结构 => 创建开场空白世界();
    const 创建空门派 = (): 详细门派结构 => 创建空门派状态();
    const 创建空剧情 = (): 剧情系统结构 => 创建开场空白剧情();
    const 创建空剧情规划状态 = (): 剧情规划结构 => 创建空剧情规划();
    const 创建空女主剧情规划状态 = (): 女主剧情规划结构 | undefined => undefined;
    const 创建空同人剧情规划状态 = (): 同人剧情规划结构 | undefined => undefined;
    const 创建空同人女主剧情规划状态 = (): 同人女主剧情规划结构 | undefined => undefined;

    // View State
    const [view, setView] = useState<'home' | 'game' | 'new_game'>('home');
    const [hasSave, setHasSave] = useState(false);

    // Game State
    const [角色, 设置角色] = useState<角色数据结构>(() => 创建空角色());
    const [环境, 设置环境] = useState<环境信息结构>(() => 创建空环境());
    const [社交, 设置社交] = useState<NPC结构[]>([]);
    const [世界, 设置世界] = useState<世界数据结构>(() => 创建空世界()); 
    const [战斗, 设置战斗] = useState<战斗状态结构>(() => ({
        是否战斗中: false,
        敌方: []
    }));
    const [玩家门派, 设置玩家门派] = useState<详细门派结构>(() => 创建空门派());
    const [任务列表, 设置任务列表] = useState<任务结构[]>([]);
    const [约定列表, 设置约定列表] = useState<约定结构[]>([]);
    const [剧情, 设置剧情] = useState<剧情系统结构>(() => 创建空剧情()); 
    const [剧情规划, 设置剧情规划] = useState<剧情规划结构>(() => 创建空剧情规划状态());
    const [女主剧情规划, 设置女主剧情规划] = useState<女主剧情规划结构 | undefined>(() => 创建空女主剧情规划状态());
    const [同人剧情规划, 设置同人剧情规划] = useState<同人剧情规划结构 | undefined>(() => 创建空同人剧情规划状态());
    const [同人女主剧情规划, 设置同人女主剧情规划] = useState<同人女主剧情规划结构 | undefined>(() => 创建空同人女主剧情规划状态());
    const [开局配置, 设置开局配置] = useState<OpeningConfig | undefined>(undefined);
    const [游戏初始时间, 设置游戏初始时间] = useState('');

    // New Game State for Memory
    const [记忆系统, 设置记忆系统] = useState<记忆系统结构>({
        回忆档案: [],
        即时记忆: [],
        短期记忆: [],
        中期记忆: [],
        长期记忆: []
    });

    const [历史记录, 设置历史记录] = useState<聊天记录结构[]>([]);
    const [loading, setLoading] = useState(false);
    
    const [worldEvents, setWorldEvents] = useState<string[]>([]);
    
    // UI/System State
    const [showSettings, setShowSettings] = useState(false);
    const [showInventory, setShowInventory] = useState(false);
    const [showEquipment, setShowEquipment] = useState(false); 
    const [showBattle, setShowBattle] = useState(false);
    const [showSocial, setShowSocial] = useState(false);
    const [showTeam, setShowTeam] = useState(false); 
    const [showKungfu, setShowKungfu] = useState(false);
    const [showWorld, setShowWorld] = useState(false); 
    const [showMap, setShowMap] = useState(false);
    const [showSect, setShowSect] = useState(false);
    const [showTask, setShowTask] = useState(false);
    const [showAgreement, setShowAgreement] = useState(false);
    const [showStory, setShowStory] = useState(false);
    const [showHeroinePlan, setShowHeroinePlan] = useState(false);
    const [showMemory, setShowMemory] = useState(false);
    
    // Save/Load Modal
    const [showSaveLoad, setShowSaveLoad] = useState<{ show: boolean, mode: 'save' | 'load' }>({ show: false, mode: 'save' });

    const [activeTab, setActiveTab] = useState<'api' | 'image_generation' | 'recall' | 'memory_summary_model' | 'polish' | 'world_evolution' | 'variable_model' | 'planning_model' | 'independent_api_gpt' | 'novel_decomposition' | 'novel_decomposition_runtime' | 'prompt' | 'storage' | 'theme' | 'visual' | 'world' | 'game' | 'reality' | 'tavern_preset' | 'memory' | 'history' | 'context' | 'music' | 'npc_management' | 'variable_manager'>('api');
    
    // Config State
    const [apiConfig, setApiConfig] = useState<接口设置结构>(() => 创建空接口设置());
    const [visualConfig, setVisualConfig] = useState<视觉设置结构>(() => 规范化视觉设置({
        时间显示格式: '传统',
        渲染层数: 10,
        字体大小: 16,
        段落间距: 1.6,
        AI思考流式折叠: true
    }));
    const [imageManagerConfig, setImageManagerConfig] = useState<图片管理设置结构>(默认图片管理设置);
    const [gameConfig, setGameConfig] = useState<游戏设置结构>(默认游戏设置);

    const 默认记忆配置: 记忆配置结构 = {
        短期记忆阈值: 30,
        中期记忆阈值: 50,
        重要角色关键记忆条数N: 20,
        NPC记忆总结阈值: 20,
        即时消息上传条数N: 10,
        短期转中期提示词: 默认短期转中期提示词,
        中期转长期提示词: 默认中期转长期提示词,
        NPC记忆总结提示词: 默认NPC记忆总结提示词
    };
    const 规范化记忆配置 = (raw?: Partial<记忆配置结构> | null): 记忆配置结构 => ({
        ...默认记忆配置,
        ...(raw || {}),
        短期记忆阈值: Math.max(5, Number(raw?.短期记忆阈值 ?? 默认记忆配置.短期记忆阈值) || 默认记忆配置.短期记忆阈值),
        中期记忆阈值: Math.max(20, Number(raw?.中期记忆阈值 ?? 默认记忆配置.中期记忆阈值) || 默认记忆配置.中期记忆阈值),
        重要角色关键记忆条数N: Math.max(1, Number(raw?.重要角色关键记忆条数N ?? 默认记忆配置.重要角色关键记忆条数N) || 默认记忆配置.重要角色关键记忆条数N),
        NPC记忆总结阈值: Math.max(5, Number(raw?.NPC记忆总结阈值 ?? 默认记忆配置.NPC记忆总结阈值) || 默认记忆配置.NPC记忆总结阈值),
        即时消息上传条数N: Math.max(1, Number(raw?.即时消息上传条数N ?? 默认记忆配置.即时消息上传条数N) || 默认记忆配置.即时消息上传条数N),
        NPC记忆总结提示词: typeof raw?.NPC记忆总结提示词 === 'string' && raw.NPC记忆总结提示词.trim().length > 0
            ? raw.NPC记忆总结提示词
            : 默认记忆配置.NPC记忆总结提示词
    });
    
    const [memoryConfig, setMemoryConfig] = useState<记忆配置结构>(默认记忆配置);

    const [prompts, setPrompts] = useState<提示词结构[]>([]);
    const [promptsReady, setPromptsReady] = useState(false);
    const [festivals, setFestivals] = useState<节日结构[]>(节日列表);
    const [currentTheme, setCurrentTheme] = useState<ThemePreset>('ink');
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const recallAbortControllerRef = useRef<AbortController | null>(null);
    const variableGenerationAbortControllerRef = useRef<AbortController | null>(null);
    const prompts加载PromiseRef = useRef<Promise<提示词结构[]> | null>(null);

    const ensurePromptsLoaded = useCallback(async (): Promise<提示词结构[]> => {
        if (Array.isArray(prompts) && prompts.length > 0) {
            if (!promptsReady) setPromptsReady(true);
            return prompts;
        }
        if (!prompts加载PromiseRef.current) {
            prompts加载PromiseRef.current = 加载默认提示词()
                .then((loaded) => {
                    const safeLoaded = Array.isArray(loaded) ? loaded : [];
                    setPrompts((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : safeLoaded));
                    setPromptsReady(true);
                    return safeLoaded;
                })
                .finally(() => {
                    prompts加载PromiseRef.current = null;
                });
        }
        return prompts加载PromiseRef.current;
    }, [prompts, promptsReady]);

    // Check for saves
    useEffect(() => {
        const checkSaves = async () => {
             try {
                 const saves = await dbService.读取存档列表();
                 setHasSave(saves.length > 0);
             } catch (e) { console.error(e); }
        };
        checkSaves();
    }, [view]);

    // Init Settings
    useEffect(() => {
        const init = async () => {
            try {
                await dbService.迁移图片资源到独立存储();
                await dbService.预热图片资源缓存();
                const savedTheme = await dbService.读取设置(设置键.应用主题);
                if (savedTheme && THEMES[savedTheme as ThemePreset]) setCurrentTheme(savedTheme as ThemePreset);
                const savedApi = await dbService.读取设置(设置键.API配置);
                if (savedApi) {
                    setApiConfig(规范化接口设置(savedApi));
                } else {
                    setApiConfig(创建空接口设置());
                }
                const savedPrompts = await dbService.读取设置(设置键.提示词池);
                if (savedPrompts) {
                    setPrompts(savedPrompts as 提示词结构[]);
                    setPromptsReady(true);
                }
                const savedFestivals = await dbService.读取设置(设置键.节日配置);
                if (savedFestivals) setFestivals(savedFestivals as 节日结构[]);
                const savedVisual = await dbService.读取设置(设置键.视觉设置);
                if (savedVisual) {
                    setVisualConfig(规范化视觉设置(savedVisual as Partial<视觉设置结构>));
                }
                const savedImageManager = await dbService.读取设置(设置键.图片管理设置);
                if (savedImageManager) {
                    setImageManagerConfig(规范化图片管理设置(savedImageManager as Partial<图片管理设置结构>));
                }
                
                // New Settings
                const savedGameConfig = await dbService.读取设置(设置键.游戏设置);
                if (savedGameConfig) setGameConfig(规范化游戏设置(savedGameConfig as Partial<游戏设置结构>));
                const savedMemoryConfig = await dbService.读取设置(设置键.记忆设置);
                if (savedMemoryConfig) setMemoryConfig(规范化记忆配置(savedMemoryConfig as Partial<记忆配置结构>));

            } catch (e) { console.error(e); }
        };
        init();
    }, []);

    useEffect(() => {
        if (promptsReady || (Array.isArray(prompts) && prompts.length > 0)) return;
        let cancelled = false;
        const win = typeof window !== 'undefined' ? (window as Window & {
            requestIdleCallback?: (cb: () => void) => number;
            cancelIdleCallback?: (id: number) => void;
        }) : undefined;

        if (win?.requestIdleCallback) {
            const taskId = win.requestIdleCallback(() => {
                if (!cancelled) {
                    void ensurePromptsLoaded().catch(() => undefined);
                }
            });
            return () => {
                cancelled = true;
                win.cancelIdleCallback?.(taskId);
            };
        }

        const timer = window.setTimeout(() => {
            if (!cancelled) {
                void ensurePromptsLoaded().catch(() => undefined);
            }
        }, 300);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [ensurePromptsLoaded, prompts, promptsReady]);

    // Theme Application
    useEffect(() => {
        应用主题到根元素(currentTheme, document.documentElement);
        dbService.保存设置(设置键.应用主题, currentTheme);
    }, [currentTheme]);

    return {
        // State
        view, setView,
        hasSave, setHasSave,
        角色, 设置角色,
        环境, 设置环境,
        社交, 设置社交,
        世界, 设置世界,
        战斗, 设置战斗,
        玩家门派, 设置玩家门派,
        任务列表, 设置任务列表,
        约定列表, 设置约定列表,
        剧情, 设置剧情,
        剧情规划, 设置剧情规划,
        女主剧情规划, 设置女主剧情规划,
        同人剧情规划, 设置同人剧情规划,
        同人女主剧情规划, 设置同人女主剧情规划,
        开局配置, 设置开局配置,
        游戏初始时间, 设置游戏初始时间,
        历史记录, 设置历史记录,
        记忆系统, 设置记忆系统, 
        loading, setLoading,
        worldEvents, setWorldEvents,
        showSettings, setShowSettings,
        showInventory, setShowInventory,
        showEquipment, setShowEquipment,
        showBattle, setShowBattle,
        showSocial, setShowSocial,
        showTeam, setShowTeam,
        showKungfu, setShowKungfu,
        showWorld, setShowWorld,
        showMap, setShowMap,
        showSect, setShowSect,
        showTask, setShowTask,
        showAgreement, setShowAgreement,
        showStory, setShowStory,
        showHeroinePlan, setShowHeroinePlan,
        showMemory, setShowMemory,
        showSaveLoad, setShowSaveLoad, // New
        activeTab, setActiveTab,
        
        // Configs
        apiConfig, setApiConfig,
        visualConfig, setVisualConfig,
        imageManagerConfig, setImageManagerConfig,
        gameConfig, setGameConfig, 
        memoryConfig, setMemoryConfig, 
        
        prompts, setPrompts,
        promptsReady,
        ensurePromptsLoaded,
        festivals, setFestivals,
        currentTheme, setCurrentTheme,
        scrollRef, abortControllerRef, recallAbortControllerRef, variableGenerationAbortControllerRef
    };
};
