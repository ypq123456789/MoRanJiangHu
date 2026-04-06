import React from 'react';
import {
    接口设置结构, 提示词结构, ThemePreset, 视觉设置结构, 节日结构, 聊天记录结构,
    游戏设置结构, 记忆配置结构, 记忆系统结构, NPC结构, TavernCommand, OpeningConfig, 剧情系统结构
} from '../../../../types';

const ApiSettings = React.lazy(() => import('../ApiSettings'));
const ImageGenerationSettings = React.lazy(() => import('../ImageGenerationSettings'));
const PromptManager = React.lazy(() => import('../PromptManager'));
const StorageManager = React.lazy(() => import('../StorageManager'));
const ThemeSettings = React.lazy(() => import('../ThemeSettings'));
const VisualSettings = React.lazy(() => import('../VisualSettings'));
const WorldSettings = React.lazy(() => import('../WorldSettings'));
const GameSettings = React.lazy(() => import('../GameSettings'));
const RealitySettings = React.lazy(() => import('../RealitySettings'));
const TavernPresetSettings = React.lazy(() => import('../TavernPresetSettings'));
const MemorySettings = React.lazy(() => import('../MemorySettings'));
const HistoryViewer = React.lazy(() => import('../HistoryViewer'));
const ContextViewer = React.lazy(() => import('../ContextViewer'));
const RecallModelSettings = React.lazy(() => import('../RecallModelSettings'));
const MemorySummaryModelSettings = React.lazy(() => import('../MemorySummaryModelSettings'));
const PolishModelSettings = React.lazy(() => import('../PolishModelSettings'));
const WorldEvolutionModelSettings = React.lazy(() => import('../WorldEvolutionModelSettings'));
const VariableModelSettings = React.lazy(() => import('../VariableModelSettings'));
const PlanningModelSettings = React.lazy(() => import('../PlanningModelSettings'));
const IndependentApiGptModeSettings = React.lazy(() => import('../IndependentApiGptModeSettings'));
const NovelDecompositionApiSettings = React.lazy(() => import('../NovelDecompositionApiSettings'));
const CurrentNovelDecompositionInjectionSettings = React.lazy(() => import('../CurrentNovelDecompositionInjectionSettings'));
const MusicSettings = React.lazy(() => import('../MusicSettings'));
const NpcManager = React.lazy(() => import('../NpcManager'));
const VariableManager = React.lazy(() => import('../VariableManager'));

type SettingsTab = 'api' | 'image_generation' | 'recall' | 'memory_summary_model' | 'polish' | 'world_evolution' | 'variable_model' | 'planning_model' | 'independent_api_gpt' | 'novel_decomposition' | 'novel_decomposition_runtime' | 'prompt' | 'storage' | 'theme' | 'visual' | 'world' | 'game' | 'reality' | 'tavern_preset' | 'memory' | 'history' | 'context' | 'music' | 'npc_management' | 'variable_manager';
type RuntimeStateSections = Record<'角色' | '环境' | '社交' | '世界' | '战斗' | '剧情' | '女主剧情规划' | '玩家门派' | '任务列表' | '约定列表' | '记忆系统', unknown>;

type ContextSection = {
    id: string;
    title: string;
    category: string;
    order: number;
    content: string;
    uploadTokens?: number;
};

type ContextSnapshot = {
    sections: ContextSection[];
    fullText: string;
    uploadTokens?: number;
    runtimePromptStates?: Record<string, {
        当前启用: boolean;
        原始启用: boolean;
        受运行时接管: boolean;
        运行时注入: boolean;
    }>;
};

interface Props {
    activeTab: SettingsTab;
    onTabChange: (tab: SettingsTab) => void;
    onClose: () => void;
    apiConfig: 接口设置结构;
    visualConfig: 视觉设置结构;
    gameConfig?: 游戏设置结构;
    memoryConfig?: 记忆配置结构;
    prompts: 提示词结构[];
    festivals: 节日结构[];
    currentTheme: ThemePreset;
    history: 聊天记录结构[];
    memorySystem?: 记忆系统结构;
    socialList: NPC结构[];
    runtimeState: RuntimeStateSections;
    currentStory?: 剧情系统结构;
    openingConfig?: OpeningConfig;
    contextSnapshot?: ContextSnapshot;
    onSaveApi: (config: 接口设置结构) => void;
    onSaveVisual: (config: 视觉设置结构) => void;
    onSaveGame?: (config: 游戏设置结构) => void;
    onSaveMemory?: (config: 记忆配置结构) => void;
    onCreateNpc: (seed?: Partial<NPC结构>) => NPC结构 | void;
    onSaveNpc: (npcId: string, npc: NPC结构) => void;
    onDeleteNpc: (npcId: string) => void;
    onStartNpcMemorySummary?: (npcId: string) => void;
    onUploadNpcImage: (npcId: string, slot: '头像' | '立绘' | '背景' | '胸部' | '小穴' | '屁穴', payload: { dataUrl: string; fileName?: string }) => Promise<unknown> | unknown;
    onReplaceVariableSection: (section: keyof RuntimeStateSections, value: unknown) => void;
    onApplyVariableCommand: (command: TavernCommand) => void;
    onUpdatePrompts: (prompts: 提示词结构[]) => void;
    onUpdateFestivals: (festivals: 节日结构[]) => void;
    onThemeChange: (theme: ThemePreset) => void;
    onReturnToHome?: () => void;
    isHome?: boolean;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

const MobileSettingsModal: React.FC<Props> = ({
    activeTab, onTabChange, onClose,
    apiConfig, visualConfig, gameConfig, memoryConfig, prompts, festivals, currentTheme, history, memorySystem, socialList, runtimeState, currentStory, openingConfig, contextSnapshot,
    onSaveApi, onSaveVisual, onSaveGame, onSaveMemory, onCreateNpc, onSaveNpc, onDeleteNpc, onStartNpcMemorySummary, onUploadNpcImage, onReplaceVariableSection, onApplyVariableCommand, onUpdatePrompts, onUpdateFestivals, onThemeChange,
    onReturnToHome, isHome, requestConfirm
}) => {
    const tabItems = [
        { id: 'game', label: '游戏' },
        { id: 'reality', label: '真实' },
        { id: 'tavern_preset', label: '酒馆' },
        { id: 'world', label: '世界' },
        { id: 'memory', label: '记忆' },
        { id: 'visual', label: '视觉' },
        { id: 'npc_management', label: 'NPC' },
        { id: 'variable_manager', label: '变量' },
        { id: 'music', label: '音乐' },
        { id: 'history', label: '历史' },
        { id: 'context', label: '上下文' },
        { id: 'api', label: '接口' },
        { id: 'image_generation', label: '文生图' },
        { id: 'recall', label: '回忆' },
        { id: 'memory_summary_model', label: '总结' },
        { id: 'polish', label: '优化' },
        { id: 'world_evolution', label: '演变' },
        { id: 'variable_model', label: '变量' },
        { id: 'planning_model', label: '规划' },
        { id: 'independent_api_gpt', label: '独立GPT' },
        { id: 'novel_decomposition', label: '拆分接口' },
        { id: 'novel_decomposition_runtime', label: '拆分注入' },
        { id: 'prompt', label: '提示词' },
        { id: 'theme', label: '风格' },
        { id: 'storage', label: '存储' }
    ] as const;

    const 设置加载占位 = (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-wuxia-gold/10 bg-black/20 text-xs tracking-[0.18em] text-wuxia-gold/70">
            设置载入中…
        </div>
    );

    const renderTabContent = () => {
        if (activeTab === 'api') return <ApiSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'image_generation') return <ImageGenerationSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'recall') return <RecallModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'memory_summary_model') return <MemorySummaryModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'polish') return <PolishModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'world_evolution') return <WorldEvolutionModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'variable_model') return <VariableModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'planning_model') return <PlanningModelSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'independent_api_gpt' && gameConfig && onSaveGame) return <IndependentApiGptModeSettings settings={gameConfig} onSave={onSaveGame} />;
        if (activeTab === 'novel_decomposition') return <NovelDecompositionApiSettings settings={apiConfig} onSave={onSaveApi} />;
        if (activeTab === 'novel_decomposition_runtime') {
            return (
                <CurrentNovelDecompositionInjectionSettings
                    settings={apiConfig}
                    story={currentStory}
                    openingConfig={openingConfig}
                    playerName={typeof (runtimeState?.角色 as any)?.姓名 === 'string' ? (runtimeState.角色 as any).姓名 : ''}
                />
            );
        }
        if (activeTab === 'prompt') return <PromptManager prompts={prompts} onUpdate={onUpdatePrompts} requestConfirm={requestConfirm} runtimePromptStates={contextSnapshot?.runtimePromptStates} />;
        if (activeTab === 'world') return <WorldSettings festivals={festivals || []} onUpdate={onUpdateFestivals} requestConfirm={requestConfirm} />;
        if (activeTab === 'theme') return <ThemeSettings currentTheme={currentTheme} onThemeChange={onThemeChange} />;
        if (activeTab === 'visual') return <VisualSettings settings={visualConfig} onSave={onSaveVisual} />;
        if (activeTab === 'npc_management') {
            return (
                <NpcManager
                    socialList={socialList}
                    memoryConfig={memoryConfig}
                    onStartNpcMemorySummary={onStartNpcMemorySummary}
                    onCreateNpc={onCreateNpc}
                    onSaveNpc={onSaveNpc}
                    onDeleteNpc={onDeleteNpc}
                    onUploadNpcImage={onUploadNpcImage}
                />
            );
        }
        if (activeTab === 'variable_manager') {
            return (
                <VariableManager
                    runtimeState={runtimeState}
                    onReplaceSection={onReplaceVariableSection}
                    onApplyCommand={onApplyVariableCommand}
                />
            );
        }
        if (activeTab === 'music') return <MusicSettings />;
        if (activeTab === 'storage') return <StorageManager requestConfirm={requestConfirm} />;
        if (activeTab === 'history') return <HistoryViewer history={history} memorySystem={memorySystem} />;
        if (activeTab === 'context' && contextSnapshot) {
            return (
                <ContextViewer
                    snapshot={contextSnapshot}
                    memoryConfig={memoryConfig}
                    onSaveMemory={onSaveMemory}
                />
            );
        }
        if (activeTab === 'context') {
            return (
                <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-wuxia-gold/10 bg-black/20 text-sm tracking-[0.2em] text-wuxia-gold/70">
                    上下文计算中…
                </div>
            );
        }
        if (activeTab === 'game' && gameConfig && onSaveGame) return <GameSettings settings={gameConfig} onSave={onSaveGame} />;
        if (activeTab === 'reality' && gameConfig && onSaveGame) return <RealitySettings settings={gameConfig} onSave={onSaveGame} />;
        if (activeTab === 'tavern_preset' && gameConfig && onSaveGame) return <TavernPresetSettings settings={gameConfig} onSave={onSaveGame} />;
        if (activeTab === 'memory' && memoryConfig && onSaveMemory) return <MemorySettings settings={memoryConfig} onSave={onSaveMemory} />;
        return null;
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[220] flex items-center justify-center p-0 sm:p-4 md:hidden animate-fadeIn">
            <div className="w-full h-full sm:h-[90vh] bg-[#0b0b0c]/95 border-0 sm:border border-wuxia-gold/30 rounded-none sm:rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] flex flex-col">
                <div className="shrink-0 px-4 py-3 border-b border-gray-800/70 bg-black/35">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-wuxia-gold font-serif font-bold tracking-[0.28em] text-sm" style={{ fontFamily: 'var(--ui-页面标题-font-family, inherit)', fontSize: 'var(--ui-页面标题-font-size, 22px)' }}>设 定</div>
                            <div className="text-[10px] text-gray-500 mt-1">移动端面板</div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isHome && onReturnToHome && (
                                <button
                                    onClick={onReturnToHome}
                                    className="px-2.5 py-1 text-[10px] rounded border border-red-900/60 text-red-400 bg-red-900/10"
                                >
                                    返回
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-700 bg-black/50 text-gray-300"
                                title="关闭"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2 min-w-max">
                            {tabItems.map(item => (
                                <button
                                    key={`mobile-tab-${item.id}`}
                                    onClick={() => onTabChange(item.id as any)}
                                    className={`px-3 py-1.5 rounded-full text-[11px] border transition-colors ${
                                        activeTab === item.id
                                            ? 'border-wuxia-gold bg-wuxia-gold/12 text-wuxia-gold'
                                            : 'border-gray-800 text-gray-500 bg-black/40'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 bg-ink-wash/5">
                    <React.Suspense fallback={设置加载占位}>
                        {renderTabContent()}
                    </React.Suspense>
                </div>
            </div>
        </div>
    );
};

export default MobileSettingsModal;
