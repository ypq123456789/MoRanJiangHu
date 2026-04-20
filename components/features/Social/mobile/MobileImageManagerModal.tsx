import React from 'react';
import MobileCustomSelect from './MobileCustomSelect';
import MobileFileUploader from './MobileFileUploader';
import type {
    NPC结构,
    NPC图片记录,
    场景图片档案,
    场景生图任务记录,
    NPC生图任务记录,
    图片管理筛选条件,
    图片生成状态类型,
    接口设置结构,
    图片管理设置结构,
    香闺秘档部位类型,
    画师串预设结构,
    角色锚点结构,
    模型词组转化器预设结构,
    词组转化器提示词预设结构,
    PNG画风预设结构
} from '../../../../types';
import { use图片资源回源预取 } from '../../../../hooks/useImageAssetPrefetch';
import { 获取图片展示地址, 获取图片资源文本地址, 是否存在本地图片副本, 格式化本地图片描述 } from '../../../../utils/imageAssets';
import ToggleSwitch from '../../../ui/ToggleSwitch';
import { 规范化接口设置 } from '../../../../utils/apiConfig';
import { 自动场景横屏尺寸选项, 自动场景竖屏尺寸选项 } from '../../../../utils/imageSizeOptions';

interface Props {
    socialList: NPC结构[];
    cultivationSystemEnabled?: boolean;
    queue: NPC生图任务记录[];
    sceneArchive: 场景图片档案;
    sceneQueue: 场景生图任务记录[];
    apiConfig?: 接口设置结构;
    imageManagerConfig?: 图片管理设置结构;
    currentPersistentWallpaper?: string;
    onSaveApiConfig?: (config: 接口设置结构) => Promise<void> | void;
    onSaveImageManagerConfig?: (config: 图片管理设置结构) => Promise<void> | void;
    onGenerateImage?: (npcId: string, options?: { 构图?: '头像' | '半身' | '立绘'; 画风?: '通用' | '二次元' | '写实' | '国风'; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string; 后台处理?: boolean }) => Promise<void> | void;
    onGenerateSecretPartImage?: (npcId: string, part: 香闺秘档部位类型 | '全部', options?: { 画风?: '通用' | '二次元' | '写实' | '国风'; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string; 后台处理?: boolean }) => Promise<void> | void;
    onRetryImage?: (npcId: string) => Promise<void> | void;
    onGenerateSceneImage?: (options?: { 画师串预设ID?: string; PNG画风预设ID?: string; 构图要求?: '纯场景' | '故事快照'; 尺寸?: string; 额外要求?: string; 后台处理?: boolean }) => Promise<void> | void;
    onSetPersistentWallpaper?: (imageUrl: string) => Promise<void> | void;
    onClearPersistentWallpaper?: () => Promise<void> | void;
    onSelectAvatarImage?: (npcId: string, imageId: string) => Promise<void> | void;
    onSelectPortraitImage?: (npcId: string, imageId: string) => Promise<void> | void;
    onSelectBackgroundImage?: (npcId: string, imageId: string) => Promise<void> | void;
    onClearAvatarImage?: (npcId: string) => Promise<void> | void;
    onClearPortraitImage?: (npcId: string) => Promise<void> | void;
    onClearBackgroundImage?: (npcId: string) => Promise<void> | void;
    onDeleteImageRecord?: (npcId: string, imageId: string) => Promise<void> | void;
    onClearImageHistory?: (npcId?: string) => Promise<void> | void;
    onDeleteQueueTask?: (taskId: string) => Promise<void> | void;
    onClearQueue?: (mode?: 'all' | 'completed') => Promise<void> | void;
    onSaveImageLocally?: (npcId: string, imageId: string) => Promise<void> | void;
    onApplySceneWallpaper?: (imageId: string) => Promise<void> | void;
    onClearSceneWallpaper?: () => Promise<void> | void;
    onDeleteSceneImage?: (imageId: string) => Promise<void> | void;
    onClearSceneHistory?: () => Promise<void> | void;
    onDeleteSceneQueueTask?: (taskId: string) => Promise<void> | void;
    onClearSceneQueue?: (mode?: 'all' | 'completed') => Promise<void> | void;
    onSaveSceneImageLocally?: (imageId: string) => Promise<void> | void;
    onSavePngStylePreset?: (preset: PNG画风预设结构) => Promise<PNG画风预设结构 | null | void> | PNG画风预设结构 | null | void;
    onDeletePngStylePreset?: (presetId: string) => Promise<void> | void;
    onParsePngStylePreset?: (file: File, options?: { 预设名称?: string; 额外要求?: string; 后台处理?: boolean }) => Promise<PNG画风预设结构 | null> | PNG画风预设结构 | null | void;
    onSetCurrentPngStylePreset?: (presetId: string) => Promise<void> | void;
    onExportPngStylePresets?: () => void;
    onImportPngStylePresets?: () => Promise<void> | void;
    onSaveCharacterAnchor?: (anchor: 角色锚点结构) => Promise<角色锚点结构 | null | void>;
    onDeleteCharacterAnchor?: (anchorId: string) => Promise<void> | void;
    onExtractCharacterAnchor?: (npcId: string, options?: { 名称?: string; 额外要求?: string }) => Promise<角色锚点结构 | null | void>;
    onClose: () => void;

    onSaveArtistPreset?: (preset: 画师串预设结构) => Promise<void>;
    onDeleteArtistPreset?: (presetId: string) => Promise<void>;
    onSaveModelConverterPreset?: (preset: 模型词组转化器预设结构) => Promise<void>;
    onDeleteModelConverterPreset?: (presetId: string) => Promise<void>;
    onSetModelConverterPresetEnabled?: (presetId: string, enabled: boolean) => Promise<void>;
    onSavePromptConverterPreset?: (preset: 词组转化器提示词预设结构) => Promise<void>;
    onDeletePromptConverterPreset?: (presetId: string) => Promise<void>;
    onImportPresets?: () => Promise<void>;
    onExportPresets?: () => Promise<void>;
}

type 页面标签类型 = 'manual' | 'library' | 'scene' | 'queue' | 'history' | 'presets' | 'rules';

type NPC图库分组 = {
    npc: NPC结构;
    records: NPC图片记录[];
};

type 合并队列记录 = {
    类型: 'npc' | 'scene';
    id: string;
    创建时间: number;
    状态: NPC生图任务记录['状态'];
    task: NPC生图任务记录 | 场景生图任务记录;
};

type 合并历史记录 = {
    类型: 'npc' | 'scene';
    key: string;
    时间: number;
    状态: 图片生成状态类型;
    npcRecord?: NPC图片记录;
    sceneRecord?: 场景图片档案['最近生图结果'];
};

const 状态样式: Record<图片生成状态类型, string> = {
    success: 'border-emerald-700 text-emerald-300 bg-emerald-950/20',
    failed: 'border-red-700 text-red-300 bg-red-950/20',
    pending: 'border-amber-700 text-amber-300 bg-amber-950/20'
};

const 状态文案: Record<图片生成状态类型, string> = {
    success: '成功',
    failed: '失败',
    pending: '生成中'
};

const 队列状态样式: Record<NPC生图任务记录['状态'], string> = {
    queued: 'border-slate-700 text-slate-300 bg-slate-950/40',
    running: 'border-sky-700 text-sky-300 bg-sky-950/30',
    success: 'border-emerald-700 text-emerald-300 bg-emerald-950/20',
    failed: 'border-red-700 text-red-300 bg-red-950/20'
};

const 队列状态文案: Record<NPC生图任务记录['状态'], string> = {
    queued: '排队中',
    running: '生成中',
    success: '已完成',
    failed: '失败'
};

const 来源文案: Record<NPC生图任务记录['来源'], string> = {
    auto: '自动',
    manual: '手动',
    retry: '重试'
};

const 生图阶段中文映射: Record<NonNullable<NPC生图任务记录['进度阶段']>, string> = {
    queued: '排队中',
    prompting: '词组转换中',
    generating: '生成图片中',
    saving: '保存结果中',
    success: '已完成',
    failed: '失败'
};

const 获取生图阶段中文 = (stage?: NPC生图任务记录['进度阶段']): string => {
    if (!stage) return '未记录';
    return 生图阶段中文映射[stage] || stage;
};

const 从任务状态推导阶段 = (status?: NPC生图任务记录['状态']): NPC生图任务记录['进度阶段'] | undefined => {
    if (!status) return undefined;
    if (status === 'queued') return 'queued';
    if (status === 'running') return 'generating';
    if (status === 'success') return 'success';
    if (status === 'failed') return 'failed';
    return undefined;
};

const 获取NPC构图文案 = (构图?: string, 部位?: string): string => {
    if (构图 === '场景') return '场景';
    if (构图 === '部位特写') {
        return 部位 ? `${部位}特写` : '部位特写';
    }
    if (构图 === '立绘') return '立绘';
    if (构图 === '半身') return '半身像';
    return '头像';
};

const 格式化时间 = (timestamp?: number): string => {
    if (!timestamp || !Number.isFinite(timestamp)) return '未记录';
    return new Date(timestamp).toLocaleString();
};

const 任务标识匹配NPC = (taskNpcKey: string | undefined, npcId: string | undefined): boolean => {
    const key = (taskNpcKey || '').trim();
    const id = (npcId || '').trim();
    if (!key || !id) return false;
    return key === id || key === `id:${id}`;
};

const 从任务标识提取NPCID = (taskNpcKey: string | undefined): string => {
    const key = (taskNpcKey || '').trim();
    if (!key) return '';
    if (key.startsWith('id:')) return key.slice(3).trim();
    return key;
};

const 读取NPC展示摘要 = (
    npc?: NPC结构 | null,
    options?: { cultivationSystemEnabled?: boolean }
): string => {
    if (!npc) return '';
    const 显示境界 = options?.cultivationSystemEnabled !== false;
    const fragments = [
        npc.姓名 ? `姓名：${npc.姓名}` : '',
        npc.性别 ? `性别：${npc.性别}` : '',
        Number.isFinite(npc.年龄) ? `年龄：${npc.年龄}` : '',
        显示境界 && npc.境界 ? `境界：${npc.境界}` : '',
        npc.身份 ? `身份：${npc.身份}` : '',
        npc.外貌描写 ? `外貌：${npc.外貌描写}` : '',
        npc.身材描写 ? `身材：${npc.身材描写}` : '',
        npc.衣着风格 ? `衣着：${npc.衣着风格}` : ''
    ].filter(Boolean);
    return fragments.join('\n');
};

const 读取角色锚点特征摘要 = (anchor?: 角色锚点结构 | null): string => {
    const features = anchor?.结构化特征;
    if (!features) return '未提取结构化特征';
    const lines = Object.entries(features)
        .map(([key, value]) => `${key}：${Array.isArray(value) ? value.filter(Boolean).join(', ') : ''}`)
        .filter((line) => !line.endsWith('：'));
    return lines.length > 0 ? lines.join('\n') : '未提取结构化特征';
};

const 角色锚点有可用内容 = (anchor?: Partial<角色锚点结构> | null): boolean => {
    const positive = (anchor?.正面提示词 || '')
        .split(',')
        .map((item) => item.trim())
        .some((item) => item.length > 0 && /[\p{L}\p{N}]/u.test(item));
    if (positive) return true;
    const features = anchor?.结构化特征;
    if (!features) return false;
    return Object.values(features).some((value) => (
        Array.isArray(value)
        && value.some((item) => typeof item === 'string' && item.trim().length > 0)
    ));
};

const 标签按钮样式 = (active: boolean): string => `shrink-0 rounded flex items-center justify-center px-4 py-2 text-sm font-serif tracking-wider transition-all duration-300 relative ${active
    ? 'text-wuxia-gold font-bold shadow-[inset_0_-2px_0_rgba(212,175,55,0.8)]'
    : 'text-wuxia-gold/40 hover:text-wuxia-gold/80'
    }`;

const 次级按钮样式 = (danger = false, small = false): string => `inline-flex items-center justify-center gap-2 rounded border font-serif tracking-widest transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] ${small ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
    } ${danger
        ? 'border-red-900/50 bg-red-950/30 text-red-300 hover:bg-red-900/50 hover:border-red-500 hover:text-red-100 hover:shadow-[0_0_15px_rgba(153,27,27,0.4)]'
        : 'border-wuxia-gold/30 bg-wuxia-gold/10 text-wuxia-gold/90 hover:bg-wuxia-gold/20 hover:border-wuxia-gold/60 hover:text-white hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] disabled:opacity-50 disabled:cursor-not-allowed'
    }`;

const 卡片样式 = 'rounded border border-wuxia-gold/20 bg-black/60 backdrop-blur-md shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]';
const 小标题样式 = 'text-[11px] text-wuxia-gold/60 tracking-widest font-serif block';

const 空状态: React.FC<{ title: string; desc?: string }> = ({ title, desc }) => (
    <div className="min-h-[200px] rounded border border-dashed border-wuxia-gold/20 bg-black/40 flex items-center justify-center text-center px-6">
        <div>
            <div className="text-base text-wuxia-gold/80 font-serif tracking-wider">{title}</div>
            {desc && <div className="text-[11px] text-gray-500 mt-2">{desc}</div>}
        </div>
    </div>
);

const MobileImageManagerModal: React.FC<Props> = ({
    socialList,
    cultivationSystemEnabled = true,
    queue,
    sceneArchive,
    sceneQueue,
    apiConfig,
    imageManagerConfig,
    currentPersistentWallpaper,
    onSaveApiConfig,
    onSaveImageManagerConfig,
    onGenerateImage,
    onGenerateSecretPartImage,
    onRetryImage,
    onGenerateSceneImage,
    onSetPersistentWallpaper,
    onClearPersistentWallpaper,
    onSelectAvatarImage,
    onSelectPortraitImage,
    onSelectBackgroundImage,
    onClearAvatarImage,
    onClearPortraitImage,
    onClearBackgroundImage,
    onDeleteImageRecord,
    onClearImageHistory,
    onDeleteQueueTask,
    onClearQueue,
    onSaveImageLocally,
    onApplySceneWallpaper,
    onClearSceneWallpaper,
    onDeleteSceneImage,
    onClearSceneHistory,
    onDeleteSceneQueueTask,
    onClearSceneQueue,
    onSaveSceneImageLocally,
    onSavePngStylePreset,
    onDeletePngStylePreset,
    onSetCurrentPngStylePreset,
    onParsePngStylePreset,
    onExportPngStylePresets,
    onImportPngStylePresets,
    onSaveCharacterAnchor,
    onDeleteCharacterAnchor,
    onExtractCharacterAnchor,
    onClose,
    onSaveArtistPreset,
    onDeleteArtistPreset,
    onSaveModelConverterPreset,
    onDeleteModelConverterPreset,
    onSetModelConverterPresetEnabled,
    onSavePromptConverterPreset,
    onDeletePromptConverterPreset,
    onImportPresets,
    onExportPresets
}) => {
    use图片资源回源预取(socialList, sceneArchive, currentPersistentWallpaper, apiConfig);
    const [activeTab, setActiveTab] = React.useState<页面标签类型>('manual');
    const [busyActionKey, setBusyActionKey] = React.useState('');
    const [actionError, setActionError] = React.useState('');

    const withBusyAction = async (key: string, runner: () => Promise<void> | void) => {
        if (busyActionKey) return;
        setBusyActionKey(key);
        setActionError('');
        try {
            await runner();
        } catch (error: any) {
            const message = typeof error?.message === 'string' && error.message.trim()
                ? error.message.trim()
                : '操作失败';
            setActionError(message);
        } finally {
            setBusyActionKey('');
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'manual':
                return <ManualTabContent {...propsForTabs} />;
            case 'library':
                return <LibraryTabContent {...propsForTabs} />;
            case 'scene':
                return <SceneTabContent {...propsForTabs} />;
            case 'queue':
                return <QueueTabContent {...propsForTabs} />;
            case 'history':
                return <HistoryTabContent {...propsForTabs} />;
            case 'presets':
                return <PresetsTabContent {...propsForTabs} />;
            case 'rules':
                return <RulesTabContent {...propsForTabs} />;
            default:
                return null;
        }
    };

    const propsForTabs: TabProps = {
        socialList,
        cultivationSystemEnabled,
        queue,
        sceneArchive,
        sceneQueue,
        apiConfig,
        imageManagerConfig,
        currentPersistentWallpaper,
        onSaveApiConfig,
        onSaveImageManagerConfig,
        onClose,
        onGenerateImage, onGenerateSecretPartImage, onRetryImage, onGenerateSceneImage, onSetPersistentWallpaper, onClearPersistentWallpaper,
        onSelectAvatarImage, onSelectPortraitImage, onSelectBackgroundImage,
        onClearAvatarImage, onClearPortraitImage, onClearBackgroundImage,
        onDeleteImageRecord, onClearImageHistory, onDeleteQueueTask, onClearQueue,
        onSaveImageLocally, onApplySceneWallpaper, onClearSceneWallpaper, onDeleteSceneImage, onClearSceneHistory,
        onDeleteSceneQueueTask, onClearSceneQueue, onSaveSceneImageLocally,
        onSavePngStylePreset, onDeletePngStylePreset, onSetCurrentPngStylePreset,
        onParsePngStylePreset, onExportPngStylePresets, onImportPngStylePresets,
        onSaveCharacterAnchor, onDeleteCharacterAnchor, onExtractCharacterAnchor,
        withBusyAction, busyActionKey, setActionError, setActiveTab,
        onSaveArtistPreset, onDeleteArtistPreset, onSaveModelConverterPreset, onDeleteModelConverterPreset,
        onSetModelConverterPresetEnabled, onSavePromptConverterPreset, onDeletePromptConverterPreset,
        onImportPresets, onExportPresets
    };

    return (
        <div className="fixed inset-0 z-[230] md:hidden flex flex-col bg-[#070708] text-gray-200 animate-fadeIn font-sans">
            <div className="absolute inset-0 bg-[url('/ui/wuxia-bg-texture.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>

            <div className="relative z-10 px-4 py-4 border-b border-wuxia-gold/20 bg-black/70 flex items-center justify-between shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                <div>
                    <div className="text-wuxia-gold font-serif font-bold tracking-[0.25em] text-lg text-shadow-glow">图像工作台</div>
                    <div className="text-[10px] text-wuxia-gold/50 mt-1 uppercase tracking-widest">Image Matrix</div>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded border border-wuxia-gold/30 bg-black/60 text-wuxia-gold/80 hover:bg-black/80 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="relative z-10 shrink-0 border-b border-wuxia-gold/15 bg-black/50 shadow-inner">
                <div className="flex overflow-x-auto no-scrollbar justify-between px-2">
                    <button className={标签按钮样式(activeTab === 'manual')} onClick={() => setActiveTab('manual')}>手动</button>
                    <button className={标签按钮样式(activeTab === 'library')} onClick={() => setActiveTab('library')}>图库</button>
                    <button className={标签按钮样式(activeTab === 'scene')} onClick={() => setActiveTab('scene')}>场景</button>
                    <button className={标签按钮样式(activeTab === 'queue')} onClick={() => setActiveTab('queue')}>队列</button>
                    <button className={标签按钮样式(activeTab === 'history')} onClick={() => setActiveTab('history')}>历史</button>
                    <button className={标签按钮样式(activeTab === 'presets')} onClick={() => setActiveTab('presets')}>资源</button>
                    <button className={标签按钮样式(activeTab === 'rules')} onClick={() => setActiveTab('rules')}>规则</button>
                </div>
            </div>

            {actionError && (
                <div className="relative z-10 m-4 rounded border border-red-900/40 bg-red-950/40 p-3 text-red-200 text-[11px] whitespace-pre-wrap font-serif shadow-inner">{actionError}</div>
            )}

            <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-gradient-to-b from-black/0 to-black/40">
                {renderContent()}
            </div>
        </div>
    );
};

// #region Tab Content Components

interface TabProps extends Props {
    withBusyAction: (key: string, runner: () => Promise<void> | void) => Promise<void>;
    busyActionKey: string;
    setActionError: (error: string) => void;
    setActiveTab: (tab: 页面标签类型) => void;
}

interface PresetEditorProps {
    editState: { type: 'artist' | 'modelConverter' | 'promptConverter'; preset: any; isNew: boolean; };
    onClose: () => void;
    onSave: (preset: any) => Promise<void>;
    apiConfig?: 接口设置结构;
    busyActionKey: string;
}

const ManualTabContent: React.FC<TabProps> = ({ socialList, cultivationSystemEnabled, queue, apiConfig, onGenerateImage, onGenerateSecretPartImage, withBusyAction, busyActionKey, setActionError, setActiveTab }) => {
    const [selectedNpcId, setSelectedNpcId] = React.useState('');
    const [composition, setComposition] = React.useState<'头像' | '半身' | '立绘' | '自定义'>('头像');
    const [customComposition, setCustomComposition] = React.useState('');
    const [style, setStyle] = React.useState<'无要求' | '通用' | '二次元' | '写实' | '国风'>('无要求');
    const [sizePreset, setSizePreset] = React.useState<'none' | '1:1' | '3:4' | '9:16' | '16:9' | 'custom'>('none');
    const [sizeScale, setSizeScale] = React.useState<'1x' | '2x'>('2x');
    const [width, setWidth] = React.useState('1024');
    const [height, setHeight] = React.useState('1024');
    const [artistPresetId, setArtistPresetId] = React.useState('');
    const [pngPresetId, setPngPresetId] = React.useState('');
    const [extraRequirement, setExtraRequirement] = React.useState('');
    const [backgroundMode, setBackgroundMode] = React.useState(true);
    const [statusText, setStatusText] = React.useState('');
    const [secretStyle, setSecretStyle] = React.useState<'无要求' | '通用' | '二次元' | '写实' | '国风'>('无要求');
    const [secretSizePreset, setSecretSizePreset] = React.useState<'none' | '1:1' | '3:4' | '9:16' | '16:9' | 'custom'>('1:1');
    const [secretSizeScale, setSecretSizeScale] = React.useState<'1x' | '2x'>('1x');
    const [secretWidth, setSecretWidth] = React.useState('1024');
    const [secretHeight, setSecretHeight] = React.useState('1024');
    const [secretArtistPresetId, setSecretArtistPresetId] = React.useState('');
    const [secretPngPresetId, setSecretPngPresetId] = React.useState('');
    const [secretExtraRequirement, setSecretExtraRequirement] = React.useState('');
    const [secretSubmitAt, setSecretSubmitAt] = React.useState(0);
    const [secretStatusText, setSecretStatusText] = React.useState('');

    const npcOptions = React.useMemo(() => (Array.isArray(socialList) ? socialList : []).filter(n => n?.id).sort((a, b) => (a.是否主要角色 === b.是否主要角色) ? 0 : a.是否主要角色 ? -1 : 1), [socialList]);
    const selectedNpc = React.useMemo(() => npcOptions.find(n => n.id === selectedNpcId), [npcOptions, selectedNpcId]);
    const selectedNpcSummary = React.useMemo(
        () => 读取NPC展示摘要(selectedNpc, { cultivationSystemEnabled }),
        [cultivationSystemEnabled, selectedNpc]
    );
    const secretPartRecords = React.useMemo(() => {
        const archive = selectedNpc?.图片档案?.香闺秘档部位档案;
        return [
            { part: '胸部' as const, label: '胸部特写', description: selectedNpc?.胸部描述 || '暂无记录', result: archive?.胸部 },
            { part: '小穴' as const, label: '小穴特写', description: selectedNpc?.小穴描述 || '暂无记录', result: archive?.小穴 },
            { part: '屁穴' as const, label: '屁穴特写', description: selectedNpc?.屁穴描述 || '暂无记录', result: archive?.屁穴 }
        ];
    }, [selectedNpc]);

    const presetFeature = React.useMemo(() => 规范化接口设置(apiConfig).功能模型占位, [apiConfig]);
    const currentPngStylePresetId = (presetFeature?.当前PNG画风预设ID || '').trim();
    const pngStylePresets = React.useMemo<PNG画风预设结构[]>(
        () => (Array.isArray(presetFeature?.PNG画风预设列表) ? presetFeature.PNG画风预设列表 : []).filter((item) => item && typeof item === 'object'),
        [presetFeature?.PNG画风预设列表]
    );
    const artistPresets = React.useMemo<画师串预设结构[]>(() => (
        Array.isArray(presetFeature?.画师串预设列表) ? presetFeature.画师串预设列表 : []
    ).filter(item => item && !String(item.id || '').startsWith('png_artist_') && (item.适用范围 === 'npc' || item.适用范围 === 'all')), [presetFeature]);
    const defaultArtistPresetId = React.useMemo(() => {
        const candidate = typeof presetFeature?.当前NPC画师串预设ID === 'string' ? presetFeature.当前NPC画师串预设ID.trim() : '';
        if (candidate && artistPresets.some(item => item.id === candidate)) return candidate;
        return artistPresets[0]?.id || '';
    }, [artistPresets, presetFeature]);
    const defaultPngPresetId = React.useMemo(() => {
        if (currentPngStylePresetId && pngStylePresets.some((item) => item.id === currentPngStylePresetId)) return currentPngStylePresetId;
        return pngStylePresets[0]?.id || '';
    }, [currentPngStylePresetId, pngStylePresets]);
    const 当前手动角色锚点 = React.useMemo(() => {
        if (!selectedNpcId) return null;
        return (Array.isArray(presetFeature?.角色锚点列表) ? presetFeature.角色锚点列表 : []).find((item: any) => item?.npcId === selectedNpcId) || null;
    }, [presetFeature, selectedNpcId]);

    React.useEffect(() => {
        if (!selectedNpcId && npcOptions.length > 0) setSelectedNpcId(npcOptions[0].id);
    }, [npcOptions, selectedNpcId]);

    React.useEffect(() => {
        setSecretSubmitAt(0);
        setSecretStatusText('');
    }, [selectedNpcId]);

    React.useEffect(() => {
        if (artistPresetId && artistPresets.some(item => item.id === artistPresetId)) return;
        setArtistPresetId(defaultArtistPresetId || '');
    }, [artistPresets, defaultArtistPresetId, artistPresetId]);
    React.useEffect(() => {
        if (pngPresetId && pngStylePresets.some(item => item.id === pngPresetId)) return;
        setPngPresetId(defaultPngPresetId || '');
    }, [defaultPngPresetId, pngPresetId, pngStylePresets]);

    React.useEffect(() => {
        if (secretArtistPresetId && artistPresets.some(item => item.id === secretArtistPresetId)) return;
        setSecretArtistPresetId(defaultArtistPresetId || '');
    }, [artistPresets, defaultArtistPresetId, secretArtistPresetId]);
    React.useEffect(() => {
        if (secretPngPresetId && pngStylePresets.some(item => item.id === secretPngPresetId)) return;
        setSecretPngPresetId(defaultPngPresetId || '');
    }, [defaultPngPresetId, pngStylePresets, secretPngPresetId]);

    const 尺寸基准: Record<'1:1' | '3:4' | '9:16' | '16:9', { 宽: number; 高: number; 描述: string }> = {
        '1:1': { 宽: 1024, 高: 1024, 描述: '1:1 正方' },
        '3:4': { 宽: 768, 高: 1024, 描述: '3:4 半身' },
        '9:16': { 宽: 576, 高: 1024, 描述: '9:16 竖构图' },
        '16:9': { 宽: 1024, 高: 576, 描述: '16:9 横构图' }
    };

    const 获取尺寸预设 = React.useCallback((preset: '1:1' | '3:4' | '9:16' | '16:9', scale: '1x' | '2x') => {
        const base = 尺寸基准[preset];
        const factor = scale === '2x' ? 2 : 1;
        return {
            宽: String(base.宽 * factor),
            高: String(base.高 * factor),
            描述: base.描述
        };
    }, []);

    const presetSize = React.useMemo(() => {
        if (sizePreset === 'custom' || sizePreset === 'none') return null;
        return 获取尺寸预设(sizePreset, sizeScale);
    }, [获取尺寸预设, sizePreset, sizeScale]);

    const secretPresetSize = React.useMemo(() => {
        if (secretSizePreset === 'custom' || secretSizePreset === 'none') return null;
        return 获取尺寸预设(secretSizePreset, secretSizeScale);
    }, [获取尺寸预设, secretSizePreset, secretSizeScale]);

    React.useEffect(() => {
        if (sizePreset === 'custom' || sizePreset === 'none') return;
        const preset = 获取尺寸预设(sizePreset, sizeScale);
        if (!preset) return;
        setWidth(preset.宽);
        setHeight(preset.高);
    }, [sizePreset, sizeScale, 获取尺寸预设]);

    React.useEffect(() => {
        if (secretSizePreset === 'custom' || secretSizePreset === 'none') return;
        const preset = 获取尺寸预设(secretSizePreset, secretSizeScale);
        if (!preset) return;
        setSecretWidth(preset.宽);
        setSecretHeight(preset.高);
    }, [secretSizePreset, secretSizeScale, 获取尺寸预设]);

    React.useEffect(() => {
        if (composition === '自定义') return;
        if (sizePreset !== 'none') {
            setSizePreset('none');
        }
    }, [composition, sizePreset]);

    const isCustomComposition = composition === '自定义';

    const sizeValue = React.useMemo(() => {
        if (!isCustomComposition) return undefined;
        if (sizePreset === 'none') return undefined;
        const w = width.trim();
        const h = height.trim();
        if (!w || !h) return undefined;
        if (!/^\d+$/.test(w) || !/^\d+$/.test(h)) return undefined;
        return `${w}x${h}`;
    }, [height, isCustomComposition, sizePreset, width]);

    const secretSizeValue = React.useMemo(() => {
        if (secretSizePreset === 'none') return undefined;
        const w = secretWidth.trim();
        const h = secretHeight.trim();
        if (!w || !h) return undefined;
        if (!/^\d+$/.test(w) || !/^\d+$/.test(h)) return undefined;
        return `${w}x${h}`;
    }, [secretHeight, secretSizePreset, secretWidth]);

    const recentTask = React.useMemo(() => {
        if (!selectedNpcId) return null;
        return (Array.isArray(queue) ? queue : []).find(task => 任务标识匹配NPC(task.NPC标识, selectedNpcId)) || null;
    }, [queue, selectedNpcId]);
    const recentSecretTask = React.useMemo(() => {
        if (!selectedNpcId || !secretSubmitAt) return null;
        return (Array.isArray(queue) ? queue : []).find(task => (
            任务标识匹配NPC(task.NPC标识, selectedNpcId)
            && task.构图 === '部位特写'
            && (task.创建时间 || 0) >= secretSubmitAt
        )) || null;
    }, [queue, secretSubmitAt, selectedNpcId]);

    const handleSubmit = async () => {
        if (!onGenerateImage || !selectedNpcId) return;
        if (composition === '自定义' && !customComposition.trim()) {
            setActionError('请先填写自定义构图描述。');
            return;
        }
        const customCompositionText = composition === '自定义' ? customComposition.trim() : '';
        const mergedExtraRequirement = [
            customCompositionText ? `构图要求：${customCompositionText}` : '',
            extraRequirement.trim()
        ].filter(Boolean).join('。');
        const resolvedComposition: '头像' | '半身' | '立绘' = composition === '自定义' ? '立绘' : composition;
        const resolvedStyle = style === '二次元' || style === '写实' || style === '国风'
            ? style
            : undefined;
        const resolvedSize = isCustomComposition ? sizeValue : undefined;
        setStatusText('');
        setActionError('');
        await withBusyAction(`manual_generate_${selectedNpcId}`, async () => {
            try {
                await onGenerateImage(selectedNpcId, {
                    构图: resolvedComposition,
                    画风: resolvedStyle,
                    尺寸: resolvedSize,
                    画师串预设ID: artistPresetId || undefined,
                    PNG画风预设ID: pngPresetId || undefined,
                    额外要求: mergedExtraRequirement || undefined,
                    后台处理: backgroundMode
                });
                setStatusText(backgroundMode ? '后台任务已提交，可前往“队列”页查看进度。' : '任务已提交，请在“队列”页查看进度');
                if (backgroundMode) {
                    setTimeout(() => setActiveTab('queue'), 800);
                }
            } catch (e: any) {
                throw e; // re-throw for withBusyAction to catch
            }
        });
    };
    const handleSecretPartSubmit = async (part: 香闺秘档部位类型 | '全部') => {
        if (!onGenerateSecretPartImage || !selectedNpcId) return;
        const resolvedStyle = secretStyle === '二次元' || secretStyle === '写实' || secretStyle === '国风'
            ? secretStyle
            : undefined;
        const resolvedSize = secretSizeValue;
        const resolvedExtraRequirement = secretExtraRequirement.trim();
        setSecretSubmitAt(Date.now());
        setSecretStatusText(part === '全部'
            ? '三处特写已提交，正在加入图片队列。'
            : `${part}特写已提交，正在加入图片队列。`);
        setActionError('');
        await withBusyAction(`mobile_secret_${selectedNpcId}_${part}`, async () => {
            try {
                await onGenerateSecretPartImage(selectedNpcId, part, {
                    画风: resolvedStyle,
                    画师串预设ID: secretArtistPresetId || undefined,
                    PNG画风预设ID: secretPngPresetId || undefined,
                    额外要求: resolvedExtraRequirement || undefined,
                    尺寸: resolvedSize,
                    后台处理: backgroundMode
                });
                setSecretStatusText(part === '全部'
                    ? (backgroundMode ? '三处特写已转入后台，可前往“队列”页查看进度。' : '三处特写生成完成，历史记录已更新。')
                    : (backgroundMode ? `${part}特写已转入后台，可前往“队列”页查看进度。` : `${part}特写生成完成，历史记录已更新。`));
            } catch (error) {
                setSecretStatusText(part === '全部'
                    ? '三处特写提交后出现失败，请查看下方状态或队列。'
                    : `${part}特写提交后出现失败，请查看下方状态或队列。`);
                throw error;
            }
        });
    };

    return (
        <div className="space-y-4 text-sm px-1">
            <div className={`${卡片样式} p-4 space-y-4`}>
                <div className="space-y-2">
                    <label className={小标题样式}>选择角色</label>
                    <MobileCustomSelect
                        value={selectedNpcId}
                        options={npcOptions.map((npc) => ({ value: npc.id, label: `${npc.姓名}${npc.是否主要角色 ? ' · 主要角色' : ''}` }))}
                        onChange={setSelectedNpcId}
                        placeholder="暂无可选角色"
                    />
                </div>
                <div className={`rounded border px-3 py-2 text-[11px] ${当前手动角色锚点?.是否启用 !== false
                    ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-300'
                    : 当前手动角色锚点
                        ? 'border-yellow-900/40 bg-yellow-950/20 text-yellow-300'
                        : 'border-wuxia-gold/15 bg-black/30 text-gray-400'
                    }`}>
                    {!selectedNpcId
                        ? '未选择角色，无法检查角色锚点。'
                        : !当前手动角色锚点
                            ? '该角色未绑定角色锚点，手动生图将只使用常规提示词。'
                            : 当前手动角色锚点.是否启用 === false
                                ? `该角色已绑定角色锚点，但当前处于停用状态：${当前手动角色锚点.名称 || '未命名锚点'}`
                                : `该角色锚点已启用，手动生图会自动附加：${当前手动角色锚点.名称 || '未命名锚点'}`}
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>构图设置</label>
                    <div className="grid grid-cols-4 gap-2">
                        <button className={标签按钮样式(composition === '头像')} onClick={() => setComposition('头像')}>头像</button>
                        <button className={标签按钮样式(composition === '半身')} onClick={() => setComposition('半身')}>半身</button>
                        <button className={标签按钮样式(composition === '立绘')} onClick={() => setComposition('立绘')}>立绘</button>
                        <button className={标签按钮样式(composition === '自定义')} onClick={() => setComposition('自定义')}>自定义</button>
                    </div>
                    {isCustomComposition && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] text-wuxia-gold/50">自定义构图说明</div>
                            <input
                                value={customComposition}
                                onChange={(e) => {
                                    setCustomComposition(e.target.value);
                                    setActionError('');
                                }}
                                placeholder="例如：45度侧脸半身、古风战斗姿势"
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors"
                            />
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>画风选择</label>
                    <div className="grid grid-cols-5 gap-2">
                        {(['无要求', '通用', '二次元', '写实', '国风'] as const).map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => {
                                    setStyle(item);
                                }}
                                className={`rounded border px-2 py-2 text-[11px] font-serif transition-all duration-300 ${style === item ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'}`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className={小标题样式}>分辨率 / 比例</label>
                    <div className="grid grid-cols-6 gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (!isCustomComposition) return;
                                setSizePreset('none');
                            }}
                            disabled={!isCustomComposition}
                            className={`rounded border px-2 py-2 text-[11px] transition-all duration-300 ${sizePreset === 'none' ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'} ${!isCustomComposition ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            无要求
                        </button>
                        {(['1:1', '3:4', '9:16', '16:9'] as const).map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                    if (!isCustomComposition) return;
                                    setSizePreset(preset);
                                }}
                                disabled={!isCustomComposition}
                                className={`rounded border px-2 py-2 text-[11px] transition-all duration-300 ${sizePreset === preset ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'} ${!isCustomComposition ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                {preset}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                if (!isCustomComposition) return;
                                setSizePreset('custom');
                            }}
                            disabled={!isCustomComposition}
                            className={`rounded border px-2 py-2 text-[11px] transition-all duration-300 ${sizePreset === 'custom' ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'} ${!isCustomComposition ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            自定义
                        </button>
                    </div>
                    {isCustomComposition && sizePreset !== 'custom' && sizePreset !== 'none' && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">倍率</span>
                            {(['1x', '2x'] as const).map((scale) => (
                                <button
                                    key={scale}
                                    type="button"
                                    onClick={() => setSizeScale(scale)}
                                    className={`rounded border px-2 py-1 text-[10px] transition-all duration-300 ${sizeScale === scale ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'}`}
                                >
                                    {scale.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <div className="text-[10px] text-gray-500 mb-1">宽 (px)</div>
                            <input
                                value={width}
                                onChange={(e) => {
                                    setWidth(e.target.value);
                                    setSizePreset('custom');
                                }}
                                disabled={!isCustomComposition || sizePreset !== 'custom'}
                                placeholder={presetSize?.宽 || '1024'}
                                className={`w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-wuxia-gold/90 outline-none transition-colors ${!isCustomComposition || sizePreset !== 'custom' ? 'opacity-60 cursor-not-allowed' : 'focus:border-wuxia-gold/50'}`}
                            />
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 mb-1">高 (px)</div>
                            <input
                                value={height}
                                onChange={(e) => {
                                    setHeight(e.target.value);
                                    setSizePreset('custom');
                                }}
                                disabled={!isCustomComposition || sizePreset !== 'custom'}
                                placeholder={presetSize?.高 || '1024'}
                                className={`w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-wuxia-gold/90 outline-none transition-colors ${!isCustomComposition || sizePreset !== 'custom' ? 'opacity-60 cursor-not-allowed' : 'focus:border-wuxia-gold/50'}`}
                            />
                        </div>
                    </div>
                    <div className="text-[10px] text-wuxia-gold/50">当前尺寸：{sizeValue || (sizePreset === 'none' || !isCustomComposition ? '无要求' : '未填写')}</div>
                    {!isCustomComposition && (
                        <div className="text-[10px] text-wuxia-gold/50">内置构图已包含推荐尺寸，选择自定义构图后可启用。</div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className={小标题样式}>画师串预设</label>
                    <MobileCustomSelect
                        value={artistPresetId}
                        options={[
                            { value: '', label: '- 未选择预设 -' },
                            ...artistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={setArtistPresetId}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>PNG画风预设</label>
                    <MobileCustomSelect
                        value={pngPresetId}
                        options={[
                            { value: '', label: '不启用' },
                            ...pngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={setPngPresetId}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>额外要求</label>
                    <textarea value={extraRequirement} onChange={(e) => setExtraRequirement(e.target.value)} placeholder="如：雨夜、冷色调、氛围光..." rows={2} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-3 text-wuxia-gold/80 outline-none focus:border-wuxia-gold/50 transition-colors resize-none font-serif text-[13px] placeholder:text-wuxia-gold/20 custom-scrollbar" />
                </div>
                <div className="rounded border border-wuxia-gold/10 bg-black/30 p-3 flex items-center justify-between gap-3 shadow-inner">
                    <div>
                        <div className="text-sm font-serif text-wuxia-gold/90">后台处理</div>
                        <div className="text-[10px] text-wuxia-gold/50 mt-1">后台处理不会阻塞当前操作。</div>
                    </div>
                    <ToggleSwitch checked={backgroundMode} onChange={setBackgroundMode} ariaLabel='切换后台处理模式' />
                </div>
                <button onClick={handleSubmit} disabled={!!busyActionKey || !selectedNpcId} className="w-full rounded border border-wuxia-gold/50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-wuxia-gold/20 via-wuxia-gold/5 to-transparent py-3 text-wuxia-gold font-serif font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:shadow-[0_0_25px_rgba(212,175,55,0.4)] transition-all disabled:opacity-50 disabled:grayscale">
                    {busyActionKey ? '正在提交...' : (backgroundMode ? '加入队列' : '立即生成')}
                </button>
            </div>
            {statusText && <div className="rounded border border-wuxia-gold/40 bg-wuxia-gold/10 p-3 text-wuxia-gold/90 text-xs shadow-inner font-serif tracking-wider text-center">{statusText}</div>}
            {recentTask && (
                <div className={`${卡片样式} p-3 text-xs text-gray-300 space-y-2 relative overflow-hidden group border-wuxia-gold/30 hover:border-wuxia-gold/50`}>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-wuxia-gold/10 to-transparent pointer-events-none"></div>
                    <div className='font-serif text-sm text-wuxia-gold/90 tracking-widest border-b border-wuxia-gold/20 pb-2 mb-2 inline-block'>最近任务</div>
                    <div className='flex justify-between'><span>状态:</span> <span className='text-wuxia-gold'>{队列状态文案[recentTask.状态]}</span></div>
                    <div className='flex justify-between'><span>阶段:</span> <span>{获取生图阶段中文(recentTask.进度阶段 || 从任务状态推导阶段(recentTask.状态))}</span></div>
                    <div className='text-wuxia-gold/50 break-words mt-1'>进度: {recentTask.进度文本 || '暂无进度信息'}</div>
                    {recentTask.错误信息 && <div className='text-red-400 break-words mt-1 bg-red-950/20 px-2 py-1 rounded border border-red-900/40'>错误: {recentTask.错误信息}</div>}
                </div>
            )}
            {selectedNpcSummary && (
                <div className={`${卡片样式} p-3 text-xs text-wuxia-gold/70 whitespace-pre-wrap space-y-2 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-wuxia-gold/5 to-transparent`}>
                    <div className='font-serif text-sm text-wuxia-gold tracking-widest'>角色资料预览</div>
                    <div className='p-2 border-t border-wuxia-gold/10 leading-relaxed font-serif'>{selectedNpcSummary}</div>
                </div>
            )}
            {selectedNpc && !Boolean(selectedNpc?.性别 && selectedNpc.性别.includes('男')) && (
                <div className={`${卡片样式} p-4 space-y-3 relative overflow-hidden group`}>
                    <div className="absolute -left-10 -top-10 w-32 h-32 bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-pink-900/20 to-transparent blur-xl pointer-events-none"></div>
                    <div className="flex items-center justify-between gap-3 relative z-10 border-b border-pink-900/30 pb-3">
                        <div>
                            <div className="font-serif font-bold text-sm tracking-widest text-[#e8b4b8] text-shadow-glow">私密部位特写</div>
                            <div className="text-[10px] text-pink-200/50 mt-1">生成角色私密部位特写图片。</div>
                        </div>
                        <button onClick={() => { void handleSecretPartSubmit('全部'); }} disabled={!!busyActionKey || !onGenerateSecretPartImage} className="shrink-0 px-3 py-1.5 rounded border border-pink-900/50 bg-pink-950/30 text-[#e8b4b8] text-xs font-serif tracking-widest hover:bg-pink-900/50 hover:border-pink-500 transition-all shadow-[inset_0_0_10px_rgba(232,180,184,0.1)]">
                            {busyActionKey === `mobile_secret_${selectedNpcId}_全部` ? '生成中...' : '全部生成'}
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className={小标题样式}>画风选择</label>
                            <div className="grid grid-cols-5 gap-2">
                                {(['无要求', '通用', '二次元', '写实', '国风'] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setSecretStyle(item)}
                                        className={`rounded border px-2 py-1.5 text-[11px] font-serif transition-all duration-300 ${secretStyle === item ? 'border-pink-300 bg-pink-900/30 text-pink-100 shadow-[0_0_10px_rgba(244,114,182,0.25)]' : 'border-pink-900/30 bg-black/40 text-pink-200/50 hover:border-pink-500/60'}`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={小标题样式}>分辨率 / 比例</label>
                            <div className="grid grid-cols-6 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSecretSizePreset('none')}
                                    className={`rounded border px-2 py-1.5 text-[11px] transition-all duration-300 ${secretSizePreset === 'none' ? 'border-pink-300 bg-pink-900/30 text-pink-100 shadow-[0_0_10px_rgba(244,114,182,0.25)]' : 'border-pink-900/30 bg-black/40 text-pink-200/50 hover:border-pink-500/60'}`}
                                >
                                    无要求
                                </button>
                                {(['1:1', '3:4', '9:16', '16:9'] as const).map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setSecretSizePreset(preset)}
                                        className={`rounded border px-2 py-1.5 text-[11px] transition-all duration-300 ${secretSizePreset === preset ? 'border-pink-300 bg-pink-900/30 text-pink-100 shadow-[0_0_10px_rgba(244,114,182,0.25)]' : 'border-pink-900/30 bg-black/40 text-pink-200/50 hover:border-pink-500/60'}`}
                                    >
                                        {preset}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setSecretSizePreset('custom')}
                                    className={`rounded border px-2 py-1.5 text-[11px] transition-all duration-300 ${secretSizePreset === 'custom' ? 'border-pink-300 bg-pink-900/30 text-pink-100 shadow-[0_0_10px_rgba(244,114,182,0.25)]' : 'border-pink-900/30 bg-black/40 text-pink-200/50 hover:border-pink-500/60'}`}
                                >
                                    自定义
                                </button>
                            </div>
                            {secretSizePreset !== 'custom' && secretSizePreset !== 'none' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-pink-200/50">倍率</span>
                                    {(['1x', '2x'] as const).map((scale) => (
                                        <button
                                            key={scale}
                                            type="button"
                                            onClick={() => setSecretSizeScale(scale)}
                                            className={`rounded border px-2 py-1 text-[10px] transition-all duration-300 ${secretSizeScale === scale ? 'border-pink-300 bg-pink-900/30 text-pink-100' : 'border-pink-900/30 bg-black/40 text-pink-200/50 hover:border-pink-500/60'}`}
                                        >
                                            {scale.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-[10px] text-pink-200/50 mb-1">宽 (px)</div>
                                    <input
                                        value={secretWidth}
                                        onChange={(e) => {
                                            setSecretWidth(e.target.value);
                                            setSecretSizePreset('custom');
                                        }}
                                        disabled={secretSizePreset !== 'custom'}
                                        placeholder={secretPresetSize?.宽 || '1024'}
                                        className={`w-full rounded border border-pink-900/30 bg-black/50 px-3 py-2 text-xs text-pink-100 outline-none transition-colors ${secretSizePreset !== 'custom' ? 'opacity-60 cursor-not-allowed' : 'focus:border-pink-300'}`}
                                    />
                                </div>
                                <div>
                                    <div className="text-[10px] text-pink-200/50 mb-1">高 (px)</div>
                                    <input
                                        value={secretHeight}
                                        onChange={(e) => {
                                            setSecretHeight(e.target.value);
                                            setSecretSizePreset('custom');
                                        }}
                                        disabled={secretSizePreset !== 'custom'}
                                        placeholder={secretPresetSize?.高 || '1024'}
                                        className={`w-full rounded border border-pink-900/30 bg-black/50 px-3 py-2 text-xs text-pink-100 outline-none transition-colors ${secretSizePreset !== 'custom' ? 'opacity-60 cursor-not-allowed' : 'focus:border-pink-300'}`}
                                    />
                                </div>
                            </div>
                            <div className="text-[10px] text-pink-200/50">当前尺寸：{secretSizeValue || (secretSizePreset === 'none' ? '无要求' : '未填写')}</div>
                        </div>
                        <div className="space-y-1">
                            <label className={小标题样式}>画师串预设</label>
                            <MobileCustomSelect
                                value={secretArtistPresetId}
                                options={[
                                    { value: '', label: '- 未选择预设 -' },
                                    ...artistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                                ]}
                                onChange={setSecretArtistPresetId}
                                variant="pink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className={小标题样式}>PNG画风预设</label>
                            <MobileCustomSelect
                                value={secretPngPresetId}
                                options={[
                                    { value: '', label: '不启用' },
                                    ...pngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                                ]}
                                onChange={setSecretPngPresetId}
                                variant="pink"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className={小标题样式}>额外要求</label>
                            <textarea value={secretExtraRequirement} onChange={(e) => setSecretExtraRequirement(e.target.value)} placeholder="如：近景柔光、细节清晰..." rows={2} className="w-full rounded border border-pink-900/30 bg-black/50 p-3 text-pink-100/80 outline-none focus:border-pink-300 transition-colors resize-none font-serif text-[13px] placeholder:text-pink-200/30 custom-scrollbar" />
                        </div>
                    </div>

                    {(secretStatusText || recentSecretTask) && (
                        <div className="rounded border border-pink-900/30 bg-pink-950/20 p-3 text-[11px] text-pink-200/80 space-y-1 font-serif">
                            {secretStatusText && <div>{secretStatusText}</div>}
                            {recentSecretTask && <div className="text-[#e8b4b8] break-words">{获取NPC构图文案(recentSecretTask.构图, recentSecretTask.部位)} / {队列状态文案[recentSecretTask.状态]} / {recentSecretTask.进度文本 || '任务处理中。'}</div>}
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-3 relative z-10">
                        {secretPartRecords.map((item) => {
                            const imageSrc = 获取图片展示地址(item.result);
                            return (
                                <div key={item.part} className="rounded border border-pink-900/20 bg-black/40 p-3 space-y-3 hover:border-pink-700/40 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-serif tracking-widest text-[#e8b4b8]">{item.label}</div>
                                        <button onClick={() => { void handleSecretPartSubmit(item.part); }} disabled={!!busyActionKey || !onGenerateSecretPartImage} className="px-2.5 py-1 rounded border border-pink-900/50 bg-black/50 text-[#e8b4b8] text-[10px] tracking-widest hover:bg-pink-950 hover:border-pink-500 transition-all">
                                            {busyActionKey === `mobile_secret_${selectedNpcId}_${item.part}` ? '生成中...' : (imageSrc ? '重新生成' : '生成')}
                                        </button>
                                    </div>
                                    {imageSrc ? (
                                        <img src={imageSrc} alt={`${selectedNpc.姓名}${item.label}`} className="w-full aspect-square object-cover rounded border border-pink-900/30 bg-black/60 shadow-inner" />
                                    ) : (
                                        <div className="w-full aspect-square rounded border border-dashed border-pink-900/30 bg-pink-950/10 flex items-center justify-center text-[11px] text-pink-200/30 text-center font-serif px-3">
                                            暂无图片
                                        </div>
                                    )}
                                    <div className="text-[11px] text-pink-200/60 font-serif leading-relaxed line-clamp-2 hover:line-clamp-none transition-all">{item.description}</div>
                                    {item.result?.状态 === 'failed' && (
                                        <div className="text-[10px] text-red-400/80 bg-red-950/20 px-2 py-1 rounded border border-red-900/30">错误：{item.result?.错误信息 || '生成失败'}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const LibraryTabContent: React.FC<TabProps> = ({
    socialList,
    currentPersistentWallpaper,
    onSelectAvatarImage,
    onSelectPortraitImage,
    onSelectBackgroundImage,
    onClearAvatarImage,
    onClearPortraitImage,
    onClearBackgroundImage,
    onSaveImageLocally,
    onDeleteImageRecord,
    onClearImageHistory,
    onSetPersistentWallpaper,
    onClearPersistentWallpaper,
    onRetryImage,
    withBusyAction,
    busyActionKey,
    setActiveTab
}) => {
    const [openNpcId, setOpenNpcId] = React.useState<string | null>(null);
    const [imageViewer, setImageViewer] = React.useState<{ src: string; alt: string } | null>(null);
    const [npcFilter, setNpcFilter] = React.useState('');
    const records = React.useMemo<NPC图片记录[]>(() => (
        (Array.isArray(socialList) ? socialList : []).flatMap(npc =>
            (Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : (npc.最近生图结果 ? [npc.最近生图结果] : []))
                .filter(item => item && typeof item === 'object')
                .map(result => ({ 目标类型: 'npc' as const, NPC标识: npc.id, NPC姓名: npc.姓名, NPC性别: npc.性别, 是否主要角色: npc.是否主要角色, 结果: result }))
        ).sort((a, b) => (b.结果?.生成时间 || 0) - (a.结果?.生成时间 || 0))
    ), [socialList]);

    const groups = React.useMemo<NPC图库分组[]>(() => {
        const map = new Map<string, NPC图片记录[]>();
        records.forEach(r => {
            const key = r.NPC标识 || '';
            if (!key) return;
            const arr = map.get(key) || [];
            arr.push(r);
            map.set(key, arr);
        });
        return (Array.isArray(socialList) ? socialList : []).map(npc => ({ npc, records: map.get(npc.id) || [] })).filter(g => g.records.length > 0).sort((a, b) => (a.npc.是否主要角色 === b.npc.是否主要角色) ? 0 : a.npc.是否主要角色 ? -1 : 1);
    }, [records, socialList]);

    const 打开图片查看器 = React.useCallback((src?: string, alt?: string) => {
        const normalizedSrc = typeof src === 'string' ? src.trim() : '';
        if (!normalizedSrc) return;
        setImageViewer({ src: normalizedSrc, alt: (alt || '图片预览').trim() || '图片预览' });
    }, []);

    if (groups.length === 0) return <空状态 title="图库为空" desc="请先在“手动”标签页为角色生成图片。" />

    return (
        <div className="space-y-4 px-1 pb-4">
            {groups.map((group) => (
                <div key={group.npc.id} className={`${卡片样式} p-0 overflow-hidden`}>
                    <div className="flex items-center justify-between font-serif p-3 bg-gradient-to-r from-black/60 to-transparent cursor-pointer hover:bg-black/40 transition-colors" onClick={() => setOpenNpcId(openNpcId === group.npc.id ? null : group.npc.id)}>
                        <div className="flex flex-col">
                            <span className="font-bold tracking-widest text-[#d4af37] text-[15px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{group.npc.姓名}</span>
                            <span className="text-[10px] text-[#A67C00] mt-0.5 tracking-widest">({group.records.length} 张)</span>
                        </div>
                        <button className="text-xs text-[#A67C00] font-serif border border-[#A67C00]/40 rounded px-2 py-1 bg-black/30">
                            {openNpcId === group.npc.id ? '收起' : '展开'}
                        </button>
                    </div>
                    {openNpcId === group.npc.id && (
                        <div className="border-t border-[#d4af37]/20 bg-black/40 p-3 space-y-4">
                            {onClearImageHistory && (
                                <div className='flex justify-end mb-2'>
                                    <button onClick={() => withBusyAction(`clear_hist_${group.npc.id}`, () => onClearImageHistory(group.npc.id))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空此角色记录</button>
                                </div>
                            )}
                            {group.records.map((record) => {
                                const img = record.结果;
                                const imageId = typeof img.id === 'string' ? img.id : '';
                                const src = 获取图片展示地址(img);
                                const isAvatar = group.npc.图片档案?.已选头像图片ID === imageId;
                                const isPortrait = group.npc.图片档案?.已选立绘图片ID === imageId;
                                const isBackground = group.npc.图片档案?.已选背景图片ID === imageId;
                                const normalizedPersistentWallpaper = (currentPersistentWallpaper || '').trim();
                                const isPersistentWallpaper = Boolean(src && normalizedPersistentWallpaper && src === normalizedPersistentWallpaper);
                                const selectedLabels = [
                                    isAvatar ? '已设头像' : '',
                                    isPortrait ? '已设立绘' : '',
                                    isBackground ? '已设背景' : '',
                                    isPersistentWallpaper ? '常驻壁纸' : ''
                                ].filter(Boolean);
                                return (
                                    <div key={`${group.npc.id}_${imageId || img.生成时间}`} className="rounded border border-[#d4af37]/20 bg-black/50 p-3 space-y-3 relative group hover:border-[#d4af37]/50 transition-colors shadow-inner">
                                        <div className="absolute inset-0 bg-gradient-to-b from-[#d4af37]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                        {src ? (
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    className="block w-full"
                                                    onClick={() => 打开图片查看器(src, `${group.npc.姓名} ${获取NPC构图文案(img.构图, img.部位)}`)}
                                                >
                                                    <img src={src} className="w-full rounded border border-[#d4af37]/30" alt={group.npc.姓名} />
                                                </button>
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent h-1/3 pointer-events-none rounded-b"></div>
                                            </div>
                                        ) : (
                                            <div className="text-[#a67c00]/60 font-serif tracking-widest p-6 text-center border border-dashed border-[#d4af37]/20 rounded">图片不可用</div>
                                        )}
                                        <div className="flex items-center justify-between font-serif relative z-10">
                                            <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${状态样式[img.状态 || 'success']}`}>{状态文案[img.状态 || 'success']}</span>
                                            <span className='text-[#a67c00]/60 text-[10px] tracking-wider'>{格式化时间(img.生成时间)}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-serif relative z-10">本地路径：{格式化本地图片描述(img.本地路径)}</div>
                                        {selectedLabels.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 relative z-10">
                                                {selectedLabels.map((label) => (
                                                    <span key={`${imageId}_${label}`} className="rounded border border-emerald-900 bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-300 font-serif tracking-widest">
                                                        {label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-2 justify-end flex-wrap relative z-10">
                                            <div className="flex gap-2 justify-end flex-wrap">
                                                {onSelectAvatarImage && imageId && img.构图 === '头像' && (
                                                    <button
                                                        onClick={() => withBusyAction(`select_avatar_${imageId}`, () => (
                                                            isAvatar ? onClearAvatarImage?.(group.npc.id) : onSelectAvatarImage(group.npc.id, imageId)
                                                        ))}
                                                        disabled={!!busyActionKey}
                                                        className={次级按钮样式(false, true)}
                                                    >
                                                        {isAvatar ? '取消设为头像' : '设为头像'}
                                                    </button>
                                                )}
                                                {onSelectPortraitImage && imageId && (img.构图 === '半身' || img.构图 === '立绘') && (
                                                    <button
                                                        onClick={() => withBusyAction(`select_portrait_${imageId}`, () => (
                                                            isPortrait ? onClearPortraitImage?.(group.npc.id) : onSelectPortraitImage(group.npc.id, imageId)
                                                        ))}
                                                        disabled={!!busyActionKey}
                                                        className={次级按钮样式(false, true)}
                                                    >
                                                        {isPortrait ? '取消设为立绘' : '设为立绘'}
                                                    </button>
                                                )}
                                                {onSelectBackgroundImage && imageId && src && img.状态 === 'success' && (
                                                    <button
                                                        onClick={() => withBusyAction(`select_background_${imageId}`, () => (
                                                            isBackground ? onClearBackgroundImage?.(group.npc.id) : onSelectBackgroundImage(group.npc.id, imageId)
                                                        ))}
                                                        disabled={!!busyActionKey}
                                                        className={次级按钮样式(false, true)}
                                                    >
                                                        {isBackground ? '取消设为背景' : '设为背景'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex gap-2 justify-end flex-wrap">
                                                {onSetPersistentWallpaper && src && img.状态 === 'success' && (
                                                    <button
                                                        onClick={() => withBusyAction(`set_persistent_${imageId}`, () => (
                                                            isPersistentWallpaper ? onClearPersistentWallpaper?.() : onSetPersistentWallpaper(src)
                                                        ))}
                                                        disabled={!!busyActionKey}
                                                        className={次级按钮样式(false, true)}
                                                    >
                                                        {isPersistentWallpaper ? '取消常驻壁纸' : '设为常驻壁纸'}
                                                    </button>
                                                )}
                                                {onSaveImageLocally && imageId && !是否存在本地图片副本(img) && (
                                                    <button onClick={() => withBusyAction(`save_local_${imageId}`, () => onSaveImageLocally(group.npc.id, imageId))} disabled={!!busyActionKey} className={次级按钮样式(false, true)}>保存到本地</button>
                                                )}
                                                {onDeleteImageRecord && imageId && (
                                                    <button onClick={() => withBusyAction(`delete_img_${imageId}`, () => onDeleteImageRecord(group.npc.id, imageId))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>删除</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const SceneTabContent: React.FC<TabProps> = ({
    apiConfig,
    sceneArchive,
    sceneQueue,
    imageManagerConfig,
    currentPersistentWallpaper,
    onGenerateSceneImage,
    onApplySceneWallpaper,
    onClearSceneWallpaper,
    onSetPersistentWallpaper,
    onClearPersistentWallpaper,
    onSaveImageManagerConfig,
    onSaveSceneImageLocally,
    onDeleteSceneImage,
    onClearSceneHistory,
    onDeleteSceneQueueTask,
    onClearSceneQueue,
    withBusyAction,
    busyActionKey
}) => {
    const [imageViewer, setImageViewer] = React.useState<{ src: string; alt: string } | null>(null);
    const sceneHistory = React.useMemo(() => (Array.isArray(sceneArchive?.生图历史) ? sceneArchive.生图历史 : []).slice().sort((a, b) => (b?.生成时间 || 0) - (a?.生成时间 || 0)), [sceneArchive]);
    const sceneQueueList = React.useMemo(() => (Array.isArray(sceneQueue) ? sceneQueue : []).slice().sort((a, b) => (b.创建时间 || 0) - (a.创建时间 || 0)), [sceneQueue]);
    const sceneArchiveLimit = Math.max(1, Number(imageManagerConfig?.场景图历史上限) || 10);
    const currentWallpaperId = sceneArchive?.当前壁纸图片ID || '';
    const currentWallpaper = React.useMemo(() => sceneHistory.find(item => item?.id === currentWallpaperId) || (sceneArchive?.最近生图结果?.id === currentWallpaperId ? sceneArchive.最近生图结果 : null), [sceneArchive, sceneHistory, currentWallpaperId]);
    React.useEffect(() => {
        setSceneArchiveLimitDraft(String(sceneArchiveLimit));
    }, [sceneArchiveLimit]);
    const handleSaveSceneArchiveLimit = async () => {
        if (!onSaveImageManagerConfig) return;
        const nextLimit = Math.max(1, Math.min(100, Number(sceneArchiveLimitDraft) || sceneArchiveLimit));
        await onSaveImageManagerConfig({ 场景图历史上限: nextLimit });
        setSceneArchiveLimitDraft(String(nextLimit));
    };
    const presetFeature = React.useMemo(() => 规范化接口设置(apiConfig).功能模型占位, [apiConfig]);
    const sceneArtistPresets = React.useMemo<画师串预设结构[]>(
        () => (Array.isArray(presetFeature?.画师串预设列表) ? presetFeature.画师串预设列表 : []).filter((item) => item && !String(item.id || '').startsWith('png_artist_') && (item.适用范围 === 'scene' || item.适用范围 === 'all')),
        [presetFeature]
    );
    const currentScenePngStylePresetId = (presetFeature?.当前PNG画风预设ID || '').trim();
    const scenePngStylePresets = React.useMemo<PNG画风预设结构[]>(
        () => (Array.isArray(presetFeature?.PNG画风预设列表) ? presetFeature.PNG画风预设列表 : []).filter((item) => item && typeof item === 'object'),
        [presetFeature?.PNG画风预设列表]
    );
    const defaultSceneArtistPresetId = React.useMemo(() => {
        const candidate = typeof presetFeature?.当前场景画师串预设ID === 'string' ? presetFeature.当前场景画师串预设ID.trim() : '';
        if (candidate && sceneArtistPresets.some((item) => item.id === candidate)) return candidate;
        return sceneArtistPresets[0]?.id || '';
    }, [presetFeature, sceneArtistPresets]);
    const defaultScenePngPresetId = React.useMemo(() => {
        if (currentScenePngStylePresetId && scenePngStylePresets.some((item) => item.id === currentScenePngStylePresetId)) return currentScenePngStylePresetId;
        return scenePngStylePresets[0]?.id || '';
    }, [currentScenePngStylePresetId, scenePngStylePresets]);
    const defaultSceneCompositionRequirement = React.useMemo(
        () => (presetFeature?.自动场景生图构图要求 === '故事快照' ? '故事快照' : '纯场景'),
        [presetFeature]
    );
    const defaultSceneOrientation = React.useMemo(
        () => (presetFeature?.自动场景生图横竖屏 === '竖屏' ? '竖屏' : '横屏'),
        [presetFeature]
    );
    const defaultSceneResolution = React.useMemo(() => {
        const value = typeof presetFeature?.自动场景生图分辨率 === 'string' ? presetFeature.自动场景生图分辨率.trim() : '';
        return value || (defaultSceneOrientation === '竖屏' ? '576x1024' : '1024x576');
    }, [defaultSceneOrientation, presetFeature]);
    const [sceneManualArtistPresetId, setSceneManualArtistPresetId] = React.useState('');
    const [sceneManualPngPresetId, setSceneManualPngPresetId] = React.useState('');
    const [sceneCompositionRequirement, setSceneCompositionRequirement] = React.useState<'纯场景' | '故事快照'>(defaultSceneCompositionRequirement);
    const [sceneOrientation, setSceneOrientation] = React.useState<'横屏' | '竖屏'>(defaultSceneOrientation);
    const [sceneResolution, setSceneResolution] = React.useState(defaultSceneResolution);
    const [sceneExtraRequirement, setSceneExtraRequirement] = React.useState('');
    const [sceneBackgroundMode, setSceneBackgroundMode] = React.useState(true);
    const [sceneStatusText, setSceneStatusText] = React.useState('');
    const [sceneArchiveLimitDraft, setSceneArchiveLimitDraft] = React.useState(String(imageManagerConfig?.场景图历史上限 || 10));
    const sceneResolutionOptions = React.useMemo(() => {
        return sceneOrientation === '竖屏' ? 自动场景竖屏尺寸选项 : 自动场景横屏尺寸选项;
    }, [sceneOrientation]);
    const selectedSceneArtistPreset = React.useMemo(
        () => sceneArtistPresets.find((item) => item.id === sceneManualArtistPresetId) || null,
        [sceneArtistPresets, sceneManualArtistPresetId]
    );
    const selectedScenePngPreset = React.useMemo(
        () => scenePngStylePresets.find((item) => item.id === sceneManualPngPresetId) || null,
        [sceneManualPngPresetId, scenePngStylePresets]
    );
    const 打开图片查看器 = React.useCallback((src?: string, alt?: string) => {
        const normalizedSrc = typeof src === 'string' ? src.trim() : '';
        if (!normalizedSrc) return;
        setImageViewer({ src: normalizedSrc, alt: (alt || '图片预览').trim() || '图片预览' });
    }, []);

    React.useEffect(() => {
        if (sceneManualArtistPresetId && sceneArtistPresets.some((item) => item.id === sceneManualArtistPresetId)) return;
        setSceneManualArtistPresetId(defaultSceneArtistPresetId || '');
    }, [defaultSceneArtistPresetId, sceneArtistPresets, sceneManualArtistPresetId]);
    React.useEffect(() => {
        if (sceneManualPngPresetId && scenePngStylePresets.some((item) => item.id === sceneManualPngPresetId)) return;
        setSceneManualPngPresetId(defaultScenePngPresetId || '');
    }, [defaultScenePngPresetId, sceneManualPngPresetId, scenePngStylePresets]);

    React.useEffect(() => {
        if (sceneResolution && sceneResolutionOptions.some((option) => option.value === sceneResolution)) return;
        setSceneResolution(sceneResolutionOptions[0]?.value || '');
    }, [sceneResolution, sceneResolutionOptions]);

    return (
        <div className="space-y-4 px-1 pb-4">
            <div className={`${卡片样式} p-4 space-y-4`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div>
                        <div className="text-sm text-wuxia-gold font-serif font-bold tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">当前壁纸</div>
                        <div className="text-[10px] text-wuxia-gold/50 mt-1 truncate max-w-[180px]">{currentWallpaper?.摘要 || '暂无场景描述'}</div>
                    </div>
                    {onGenerateSceneImage && (
                        <button
                            onClick={() => withBusyAction('gen_scene', async () => {
                                setSceneStatusText(sceneBackgroundMode ? '场景任务正在转入后台处理。' : '正在提交场景生成任务...');
                                await onGenerateSceneImage({
                                    画师串预设ID: sceneManualArtistPresetId || undefined,
                                    PNG画风预设ID: sceneManualPngPresetId || undefined,
                                    构图要求: sceneCompositionRequirement,
                                    尺寸: sceneResolution || undefined,
                                    额外要求: sceneExtraRequirement.trim() || undefined,
                                    后台处理: sceneBackgroundMode
                                });
                                setSceneStatusText(sceneBackgroundMode ? '场景任务已转入后台，可前往“队列”页查看进度。' : '场景任务已提交，请等待队列更新。');
                            })}
                            disabled={!!busyActionKey}
                            className={次级按钮样式(false, true)}
                        >
                            {busyActionKey === 'gen_scene' ? '生成中...' : (sceneBackgroundMode ? '加入队列' : '按正文生成')}
                        </button>
                    )}
                </div>
                <div className="rounded border border-wuxia-gold/20 bg-black/30 px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-serif text-wuxia-gold/90">后台处理</div>
                        <div className="text-[10px] text-wuxia-gold/50 mt-1">开启后，场景生成会进入后台队列。</div>
                    </div>
                    <ToggleSwitch checked={sceneBackgroundMode} onChange={setSceneBackgroundMode} ariaLabel='切换场景后台处理模式' />
                </div>
                <div className="rounded border border-wuxia-gold/20 bg-black/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-serif text-wuxia-gold/90">历史上限</div>
                            <div className="text-[10px] text-wuxia-gold/50 mt-1">当前 {sceneHistory.length} / {sceneArchiveLimit}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={sceneArchiveLimitDraft}
                                onChange={(e) => setSceneArchiveLimitDraft(e.target.value)}
                                className="w-20 rounded border border-wuxia-gold/20 bg-black/50 px-2 py-1.5 text-xs text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50"
                            />
                            <button type="button" onClick={() => { void handleSaveSceneArchiveLimit(); }} className={次级按钮样式(false, true)}>
                                应用
                            </button>
                        </div>
                    </div>
                </div>
                {sceneStatusText && (
                    <div className="rounded border border-wuxia-gold/20 bg-black/30 px-3 py-2 text-[11px] text-wuxia-gold/80">
                        {sceneStatusText}
                    </div>
                )}
                <div className="space-y-2">
                    <label className={小标题样式}>场景构图要求</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['纯场景', '故事快照'] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setSceneCompositionRequirement(mode)}
                                className={`rounded border px-3 py-2 text-[11px] font-serif transition-all duration-300 ${sceneCompositionRequirement === mode ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                    <div className="text-[10px] text-gray-500">纯场景为景观环境，故事快照包含人物互动。</div>
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>画面方向</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['横屏', '竖屏'] as const).map((orientation) => (
                            <button
                                key={orientation}
                                type="button"
                                onClick={() => setSceneOrientation(orientation)}
                                className={`rounded border px-3 py-2 text-[11px] font-serif transition-all duration-300 ${sceneOrientation === orientation ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]' : 'border-wuxia-gold/20 bg-black/40 text-gray-400 hover:border-wuxia-gold/50'}`}
                            >
                                {orientation}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>分辨率 / 比例</label>
                    <div className="space-y-2">
                        <MobileCustomSelect
                            value={sceneResolution}
                            options={sceneResolutionOptions}
                            onChange={setSceneResolution}
                        />
                        <input
                            value={sceneResolution}
                            onChange={(e) => setSceneResolution(e.target.value)}
                            placeholder="自定义分辨率，如 1280x720"
                            className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors font-serif"
                        />
                        <div className="text-[10px] text-wuxia-gold/50">当前尺寸：{sceneResolution || '未选择'}</div>
                        <div className="text-[10px] text-amber-300/80">提示：部分后端只支持固定分辨率，填写不支持的尺寸会导致生成失败。</div>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>额外要求</label>
                    <textarea
                        value={sceneExtraRequirement}
                        onChange={(e) => setSceneExtraRequirement(e.target.value)}
                        placeholder="如：远景、夜雨江湖、人物剪影..."
                        rows={2}
                        className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-3 text-wuxia-gold/80 outline-none focus:border-wuxia-gold/50 transition-colors resize-none font-serif text-[13px] placeholder:text-wuxia-gold/20 custom-scrollbar"
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>场景画师串预设</label>
                    <MobileCustomSelect
                        value={sceneManualArtistPresetId}
                        options={sceneArtistPresets.length === 0
                            ? [{ value: '', label: '未配置预设' }]
                            : sceneArtistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        }
                        onChange={setSceneManualArtistPresetId}
                        disabled={sceneArtistPresets.length === 0}
                    />
                    <div className="rounded border border-wuxia-gold/10 bg-black/40 p-2 text-[10px] text-wuxia-gold/60 space-y-1">
                        <div><span className="text-emerald-400/70">正面：</span>{selectedSceneArtistPreset?.正面提示词?.trim() || '无'}</div>
                        <div><span className="text-red-400/70">负面：</span>{selectedSceneArtistPreset?.负面提示词?.trim() || '无'}</div>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>场景PNG画风预设</label>
                    <MobileCustomSelect
                        value={sceneManualPngPresetId}
                        options={[
                            { value: '', label: '不启用' },
                            ...scenePngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={setSceneManualPngPresetId}
                    />
                    <div className="rounded border border-wuxia-gold/10 bg-black/40 p-2 text-[10px] text-wuxia-gold/60 space-y-1">
                        <div><span className="text-emerald-400/70">PNG正面：</span>{selectedScenePngPreset?.正面提示词?.trim() || '无'}</div>
                        <div><span className="text-red-400/70">PNG负面：</span>{selectedScenePngPreset?.负面提示词?.trim() || '无'}</div>
                    </div>
                </div>
                {获取图片展示地址(currentWallpaper) ? (
                    <button
                        type="button"
                        className="relative block w-full text-left group"
                        onClick={() => 打开图片查看器(获取图片展示地址(currentWallpaper), currentWallpaper?.摘要 || '当前场景壁纸')}
                    >
                        <img src={获取图片展示地址(currentWallpaper)} alt="当前壁纸" className="w-full rounded border border-wuxia-gold/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent h-1/3 pointer-events-none rounded-b"></div>
                        <div className="absolute inset-0 rounded flex items-center justify-center bg-black/0 group-active:bg-black/20 transition-colors">
                            <div className="rounded-full border border-wuxia-gold/40 bg-black/55 px-3 py-2 text-[11px] text-wuxia-gold shadow-[0_0_12px_rgba(212,175,55,0.15)]">
                                点击查看大图
                            </div>
                        </div>
                    </button>
                ) : (
                    <div className="text-[#a67c00]/60 font-serif tracking-widest p-6 text-center border border-dashed border-[#d4af37]/20 rounded">暂无场景壁纸</div>
                )}
                <div className="text-[10px] text-gray-500 font-serif">玉简留存：{格式化本地图片描述(currentWallpaper?.本地路径)}</div>
            </div>

            {sceneQueueList.length > 0 && (
                <div className={`${卡片样式} p-4 space-y-3`}>
                    <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                        <div className="text-sm text-wuxia-gold font-serif font-bold tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">场景队列 ({sceneQueueList.length})</div>
                        <div className="flex gap-2 text-xs">
                            {onClearSceneQueue && <button onClick={() => withBusyAction('clear_sq_comp', () => onClearSceneQueue('completed'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清理已完成</button>}
                            {onClearSceneQueue && <button onClick={() => withBusyAction('clear_sq_all', () => onClearSceneQueue('all'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空队列</button>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        {sceneQueueList.map(task => (
                            <div key={task.id} className="rounded border border-wuxia-gold/20 bg-black/40 p-3 text-xs space-y-2 font-serif relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-wuxia-gold/5 to-transparent pointer-events-none"></div>
                                <div className="flex items-center justify-between relative z-10">
                                    <span className='truncate max-w-[150px] text-wuxia-gold/90'>{task.摘要 || '场景生成任务'}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${队列状态样式[task.状态]}`}>{队列状态文案[task.状态]}</span>
                                </div>
                                <div className="text-wuxia-gold/50 text-[10px] relative z-10">{task.进度文本 || '正在生成图片...'}</div>
                                <div className="flex gap-2 justify-end relative z-10">
                                    {onDeleteSceneQueueTask && <button onClick={() => withBusyAction(`del_sq_${task.id}`, () => onDeleteSceneQueueTask(task.id))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>镇压</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={`${卡片样式} p-4 space-y-3`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm text-wuxia-gold font-serif font-bold tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">场景历史 ({sceneHistory.length})</div>
                    {onClearSceneHistory && <button onClick={() => withBusyAction('clear_scene_hist', onClearSceneHistory)} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空历史</button>}
                </div>
                {sceneHistory.length === 0 && <div className='text-[#a67c00]/60 font-serif tracking-widest p-6 text-center border border-dashed border-[#d4af37]/20 rounded'>暂无场景历史记录。</div>}
                <div className="grid grid-cols-1 gap-4">
                    {sceneHistory.map(item => {
                        const imageId = typeof item?.id === 'string' ? item.id : '';
                        const src = 获取图片展示地址(item);
                        const isCurrent = Boolean(imageId) && imageId === currentWallpaperId;
                        const normalizedPersistentWallpaper = (currentPersistentWallpaper || '').trim();
                        const isPersistent = Boolean(src && normalizedPersistentWallpaper && src === normalizedPersistentWallpaper);
                        const canUse = Boolean(imageId && src && (item?.状态 || 'success') === 'success');
                        return (
                            <div key={imageId || item.生成时间} className="rounded border border-wuxia-gold/30 bg-black/50 p-3 space-y-3 font-serif relative group hover:border-wuxia-gold/60 transition-colors shadow-inner">
                                <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                {src ? (
                                    <div className="relative">
                                        <img src={src} className="w-full rounded border border-wuxia-gold/20" alt={item?.摘要 || '场景壁纸'} />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent h-1/3 pointer-events-none rounded-b"></div>
                                    </div>
                                ) : (
                                    <div className="text-[#a67c00]/60 p-6 text-center border border-dashed border-[#d4af37]/20 rounded">图片不可用</div>
                                )}
                                <div className="text-sm text-wuxia-gold/90 font-bold tracking-widest relative z-10">{item?.摘要 || '未命名场景'}</div>
                                <div className="text-[10px] text-wuxia-gold/50 relative z-10 flex justify-between">
                                    <span>回合：{item?.来源回合 || '未知'}</span>
                                    <span>{格式化时间(item?.生成时间)}</span>
                                </div>
                                <div className="text-[10px] text-gray-500 relative z-10">本地路径：{格式化本地图片描述(item?.本地路径)}</div>
                                {isCurrent && <div className='text-center text-xs py-1.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-900 tracking-widest'>当前壁纸</div>}
                                <div className="flex gap-2 justify-end flex-wrap relative z-10">
                                    {onApplySceneWallpaper && canUse && (
                                        <button
                                            onClick={() => withBusyAction(`apply_wp_${imageId}`, () => (isCurrent ? onClearSceneWallpaper?.() : onApplySceneWallpaper(imageId)))}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            {isCurrent ? '取消设置壁纸' : '设为壁纸'}
                                        </button>
                                    )}
                                    {onSetPersistentWallpaper && canUse && src && (
                                        <button
                                            onClick={() => withBusyAction(`set_persistent_scene_${imageId}`, () => (isPersistent ? onClearPersistentWallpaper?.() : onSetPersistentWallpaper(src)))}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            {isPersistent ? '取消常驻壁纸' : '设为常驻壁纸'}
                                        </button>
                                    )}
                                    {onSaveSceneImageLocally && canUse && !是否存在本地图片副本(item) && <button onClick={() => withBusyAction(`save_scene_${imageId}`, () => onSaveSceneImageLocally(imageId))} disabled={!!busyActionKey} className={次级按钮样式(false, true)}>保存到本地</button>}
                                    {onDeleteSceneImage && imageId && <button onClick={() => withBusyAction(`del_scene_${imageId}`, () => onDeleteSceneImage(imageId))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>删除</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[320] bg-black/95 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
                    onClick={() => setImageViewer(null)}
                >
                    <div
                        className="relative max-w-[94vw] max-h-[92vh] rounded-lg overflow-hidden border border-[#d4af37]/20 shadow-[0_0_40px_rgba(212,175,55,0.18)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <img src={imageViewer.src} alt={imageViewer.alt} className="max-w-[94vw] max-h-[92vh] object-contain bg-black" />
                        <button
                            type="button"
                            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-gray-700 text-gray-300"
                            onClick={() => setImageViewer(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const QueueTabContent: React.FC<TabProps> = ({ queue, sceneQueue, onRetryImage, onDeleteQueueTask, onClearQueue, onDeleteSceneQueueTask, onClearSceneQueue, withBusyAction, busyActionKey }) => {
    const combinedQueue = React.useMemo<合并队列记录[]>(() => {
        const sceneRecords = (Array.isArray(sceneQueue) ? sceneQueue : []).map(task => ({ 类型: 'scene' as const, id: task.id, 创建时间: task.创建时间 || 0, 状态: task.状态, task }));
        const npcRecords = (Array.isArray(queue) ? queue : []).map(task => ({ 类型: 'npc' as const, id: task.id, 创建时间: task.创建时间 || 0, 状态: task.状态, task }));
        return [...npcRecords, ...sceneRecords].sort((a, b) => b.创建时间 - a.创建时间);
    }, [queue, sceneQueue]);

    if (combinedQueue.length === 0) return <空状态 title="队列为空" desc="新的生成请求会显示在这里。" />

    return (
        <div className="space-y-4 px-1 pb-4">
            <div className="flex gap-2 justify-end flex-wrap">
                {onClearQueue && <button onClick={() => withBusyAction('clear_q_comp', () => onClearQueue('completed'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>散去残魂 (清NPC完成)</button>}
                {onClearQueue && <button onClick={() => withBusyAction('clear_q_all', () => onClearQueue('all'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>破除凡尘 (清空NPC)</button>}
                {onClearSceneQueue && <button onClick={() => withBusyAction('clear_sq_comp', () => onClearSceneQueue('completed'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空已完成场景</button>}
                {onClearSceneQueue && <button onClick={() => withBusyAction('clear_sq_all', () => onClearSceneQueue('all'))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空场景</button>}
            </div>
            {combinedQueue.map(entry => {
                if (entry.类型 === 'scene') {
                    const task = entry.task as 场景生图任务记录;
                    return (
                        <div key={task.id} className={`${卡片样式} p-3 text-xs space-y-2 font-serif relative overflow-hidden group hover:border-[#d4af37]/50`}>
                            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-cyan-900/10 to-transparent pointer-events-none"></div>
                            <div className="flex items-center justify-between relative z-10">
                                <span className='font-bold text-cyan-500/90 tracking-widest'>{task.摘要 || '场景生成任务'}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${队列状态样式[task.状态]}`}>{队列状态文案[task.状态]}</span>
                            </div>
                            <div className='text-[10px] text-[#A67C00]/60 relative z-10'>{格式化时间(task.创建时间)}</div>
                            <div className="text-wuxia-gold/60 relative z-10">{task.进度文本 || task.错误信息 || '正在生成图片...'}</div>
                            <div className="flex gap-2 justify-end relative z-10">
                                {onDeleteSceneQueueTask && <button onClick={() => withBusyAction(`del_sq_${task.id}`, () => onDeleteSceneQueueTask(task.id))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>删除</button>}
                            </div>
                        </div>
                    )
                }
                const task = entry.task as NPC生图任务记录;
                return (
                    <div key={task.id} className={`${卡片样式} p-3 text-xs space-y-2 font-serif relative overflow-hidden group hover:border-[#d4af37]/50`}>
                        <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-[#d4af37]/10 to-transparent pointer-events-none"></div>
                        <div className="flex items-center justify-between relative z-10">
                            <span className='font-bold text-[#d4af37] tracking-widest'>{task.NPC姓名} ({获取NPC构图文案(task.构图, task.部位)})</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${队列状态样式[task.状态]}`}>{队列状态文案[task.状态]}</span>
                        </div>
                        <div className='text-[10px] text-[#A67C00]/60 relative z-10'>{格式化时间(task.创建时间)}</div>
                        <div className="text-wuxia-gold/60 relative z-10">{task.进度文本 || task.错误信息 || '正在生成图片...'}</div>
                        <div className="flex gap-2 justify-end relative z-10">
                            {task.状态 === 'failed' && onRetryImage && task.构图 !== '部位特写' && <button onClick={() => withBusyAction(`retry_${task.id}`, () => onRetryImage(从任务标识提取NPCID(task.NPC标识)))} disabled={!!busyActionKey} className={次级按钮样式(false, true)}>重试</button>}
                            {onDeleteQueueTask && <button onClick={() => withBusyAction(`del_q_${task.id}`, () => onDeleteQueueTask(task.id))} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>删除</button>}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

const HistoryTabContent: React.FC<TabProps> = ({
    socialList,
    sceneArchive,
    currentPersistentWallpaper,
    onClearImageHistory,
    onClearSceneHistory,
    onSetPersistentWallpaper,
    onClearPersistentWallpaper,
    withBusyAction,
    busyActionKey
}) => {
    const [imageViewer, setImageViewer] = React.useState<{ src: string; alt: string } | null>(null);
    const 打开图片查看器 = React.useCallback((src?: string, alt?: string) => {
        const normalizedSrc = typeof src === 'string' ? src.trim() : '';
        if (!normalizedSrc) return;
        setImageViewer({ src: normalizedSrc, alt: (alt || '图片预览').trim() || '图片预览' });
    }, []);
    const combinedHistory = React.useMemo<合并历史记录[]>(() => {
        const npcItems: 合并历史记录[] = (Array.isArray(socialList) ? socialList : []).flatMap(npc =>
            (Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : (npc.最近生图结果 ? [npc.最近生图结果] : []))
                .filter(item => item && typeof item === 'object')
                .map(result => ({ 类型: 'npc' as const, key: `${npc.id}_${result.id || result.生成时间}`, 时间: result.生成时间 || 0, 状态: result.状态 || 'success', npcRecord: { 目标类型: 'npc', NPC标识: npc.id, NPC姓名: npc.姓名, NPC性别: npc.性别, 是否主要角色: npc.是否主要角色, 结果: result } }))
        );
        const sceneItems: 合并历史记录[] = (Array.isArray(sceneArchive?.生图历史) ? sceneArchive.生图历史 : [])
            .map(result => ({ 类型: 'scene' as const, key: `scene_${result.id || result.生成时间}`, 时间: result.生成时间 || 0, 状态: result.状态 || 'success', sceneRecord: result }));

        return [...npcItems, ...sceneItems].sort((a, b) => b.时间 - a.时间);
    }, [socialList, sceneArchive]);

    if (combinedHistory.length === 0) return <空状态 title="历史为空" desc="所有生成记录（不论成败）都会显示在这里。" />

    return (
        <div className="space-y-4 px-1 pb-4">
            <div className="flex gap-2 justify-end flex-wrap">
                {onClearImageHistory && <button onClick={() => withBusyAction('clear_npc_hist_all', () => onClearImageHistory())} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空NPC历史</button>}
                {onClearSceneHistory && <button onClick={() => withBusyAction('clear_scene_hist_all', () => onClearSceneHistory())} disabled={!!busyActionKey} className={次级按钮样式(true, true)}>清空场景历史</button>}
            </div>
            {combinedHistory.map(entry => {
                if (entry.类型 === 'scene' && entry.sceneRecord) {
                    const result = entry.sceneRecord;
                    const imageSrc = 获取图片展示地址(result);
                    const normalizedPersistentWallpaper = (currentPersistentWallpaper || '').trim();
                    const isPersistent = Boolean(imageSrc && normalizedPersistentWallpaper && imageSrc === normalizedPersistentWallpaper);
                    return (
                        <details key={entry.key} className={`${卡片样式} p-3 text-xs space-y-2 font-serif group`}>
                            <summary className='flex items-center justify-between outline-none cursor-pointer'>
                                <span className='font-bold text-cyan-500/90 tracking-widest truncate max-w-[150px]'>{result.摘要 || '场景记录'}</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${状态样式[result.状态 || 'success']}`}>{状态文案[result.状态 || 'success']}</span>
                                    <span className="text-[#A67C00] transition-transform group-open:rotate-180">▼</span>
                                </div>
                            </summary>
                            <div className='border-t border-[#d4af37]/20 pt-3 mt-3 space-y-2'>
                                {imageSrc && (
                                    <button
                                        type="button"
                                        onClick={() => 打开图片查看器(imageSrc, result.摘要 || '场景图片')}
                                        className="w-full block text-left"
                                    >
                                        <img src={imageSrc} alt='场景图片' className='w-full rounded border border-[#d4af37]/20 shadow-[0_0_15px_rgba(212,175,55,0.1)]' />
                                    </button>
                                )}
                                <div className='text-[#A67C00]/60 text-[10px]'>{格式化时间(result.生成时间)}</div>
                                {result.错误信息 && <div className='text-red-400 break-words bg-red-950/20 px-2 py-1 rounded border border-red-900/30'>错误: {result.错误信息}</div>}
                                <div className='text-[#d4af37]/60 break-words'>模型: {result.使用模型 || '未记录'}</div>
                                <div className='text-[#d4af37]/60 break-words'>最终正向提示词: {result.最终正向提示词 || result.生图词组 || '未记录'}</div>
                                {result.最终负向提示词 && <div className='text-[#d4af37]/60 break-words'>最终负面提示词: {result.最终负向提示词}</div>}
                                <div className="flex justify-end gap-2 flex-wrap">
                                    {imageSrc && (
                                        <button
                                            onClick={() => 打开图片查看器(imageSrc, result.摘要 || '场景图片')}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            查看大图
                                        </button>
                                    )}
                                    {onSetPersistentWallpaper && imageSrc && (result.状态 || 'success') === 'success' && (
                                        <button
                                            onClick={() => withBusyAction(`set_persistent_scene_hist_${result.id || result.生成时间}`, () => (isPersistent ? onClearPersistentWallpaper?.() : onSetPersistentWallpaper(imageSrc)))}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            {isPersistent ? '取消常驻壁纸' : '设为常驻壁纸'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </details>
                    )
                }
                if (entry.类型 === 'npc' && entry.npcRecord) {
                    const result = entry.npcRecord.结果;
                    const imageSrc = 获取图片展示地址(result);
                    const normalizedPersistentWallpaper = (currentPersistentWallpaper || '').trim();
                    const isPersistent = Boolean(imageSrc && normalizedPersistentWallpaper && imageSrc === normalizedPersistentWallpaper);
                    return (
                        <details key={entry.key} className={`${卡片样式} p-3 text-xs space-y-2 font-serif group`}>
                            <summary className='flex items-center justify-between outline-none cursor-pointer'>
                                <span className='font-bold text-[#d4af37] tracking-widest'>{entry.npcRecord.NPC姓名} ({获取NPC构图文案(result.构图, result.部位)})</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${状态样式[result.状态 || 'success']}`}>{状态文案[result.状态 || 'success']}</span>
                                    <span className="text-[#A67C00] transition-transform group-open:rotate-180">▼</span>
                                </div>
                            </summary>
                            <div className='border-t border-[#d4af37]/20 pt-3 mt-3 space-y-2'>
                                {imageSrc && (
                                    <button
                                        type="button"
                                        onClick={() => 打开图片查看器(imageSrc, `${entry.npcRecord.NPC姓名} 图片`)}
                                        className="w-full block text-left"
                                    >
                                        <img src={imageSrc} alt='NPC图片' className='w-full rounded border border-[#d4af37]/20 shadow-[0_0_15px_rgba(212,175,55,0.1)]' />
                                    </button>
                                )}
                                <div className='text-[#A67C00]/60 text-[10px]'>{格式化时间(result.生成时间)}</div>
                                {result.错误信息 && <div className='text-red-400 break-words bg-red-950/20 px-2 py-1 rounded border border-red-900/30'>错误: {result.错误信息}</div>}
                                <div className='text-[#d4af37]/60 break-words'>模型: {result.使用模型 || '未记录'}</div>
                                <div className='text-[#d4af37]/60 break-words'>最终正向提示词: {result.最终正向提示词 || result.生图词组 || '未记录'}</div>
                                {result.最终负向提示词 && <div className='text-[#d4af37]/60 break-words'>最终负面提示词: {result.最终负向提示词}</div>}
                                <div className='text-[#d4af37]/60 break-words'>原始描述: {result.原始描述 || '未记录'}</div>
                                <div className="flex justify-end gap-2 flex-wrap">
                                    {imageSrc && (
                                        <button
                                            onClick={() => 打开图片查看器(imageSrc, `${entry.npcRecord.NPC姓名} 图片`)}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            查看大图
                                        </button>
                                    )}
                                    {onSetPersistentWallpaper && imageSrc && (result.状态 || 'success') === 'success' && (
                                        <button
                                            onClick={() => withBusyAction(`set_persistent_npc_hist_${result.id || result.生成时间}`, () => (isPersistent ? onClearPersistentWallpaper?.() : onSetPersistentWallpaper(imageSrc)))}
                                            disabled={!!busyActionKey}
                                            className={次级按钮样式(false, true)}
                                        >
                                            {isPersistent ? '取消常驻壁纸' : '设为常驻壁纸'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </details>
                    )
                }
                return null;
            })}
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[320] bg-black/95 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
                    onClick={() => setImageViewer(null)}
                >
                    <div
                        className="relative max-w-[94vw] max-h-[92vh] rounded-lg overflow-hidden border border-[#d4af37]/20 shadow-[0_0_40px_rgba(212,175,55,0.18)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <img src={imageViewer.src} alt={imageViewer.alt} className="max-w-[94vw] max-h-[92vh] object-contain bg-black" />
                        <button
                            type="button"
                            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-gray-700 text-gray-300"
                            onClick={() => setImageViewer(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

const PresetEditor: React.FC<PresetEditorProps> = ({ editState, onClose, onSave, apiConfig, busyActionKey }) => {
    const { type, preset: initialPreset, isNew } = editState;
    const [preset, setPreset] = React.useState(initialPreset);
    const presetConfig = React.useMemo(() => 规范化接口设置(apiConfig), [apiConfig]);
    const promptPresets = React.useMemo(() => Array.isArray(presetConfig.功能模型占位?.词组转化器提示词预设列表) ? presetConfig.功能模型占位.词组转化器提示词预设列表 : [], [presetConfig]);
    const npcPromptPresets = React.useMemo(() => promptPresets.filter((item) => item.类型 === 'npc'), [promptPresets]);
    const scenePromptPresets = React.useMemo(() => promptPresets.filter((item) => item.类型 === 'scene'), [promptPresets]);
    const sceneJudgePromptPresets = React.useMemo(() => promptPresets.filter((item) => item.类型 === 'scene_judge'), [promptPresets]);

    const updateField = (field: string, value: any) => {
        setPreset((p: any) => ({ ...p, [field]: value }));
    };

    const renderFields = () => {
        switch (type) {
            case 'artist':
                return (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className={小标题样式}>名号</label>
                            <input value={preset.名称} onChange={e => updateField('名称', e.target.value)} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors font-serif" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>画师串</label>
                            <textarea value={preset.画师串 || ''} onChange={e => updateField('画师串', e.target.value)} rows={3} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>正面提示词</label>
                            <textarea value={preset.正面提示词} onChange={e => updateField('正面提示词', e.target.value)} rows={4} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>负面提示词</label>
                            <textarea value={preset.负面提示词} onChange={e => updateField('负面提示词', e.target.value)} rows={4} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>适用范围</label>
                            <MobileCustomSelect
                                value={preset.适用范围}
                                options={[
                                    { value: 'all', label: '通用' },
                                    { value: 'npc', label: 'NPC' },
                                    { value: 'scene', label: '场景' }
                                ]}
                                onChange={(value) => updateField('适用范围', value)}
                            />
                        </div>
                    </div>
                );
            case 'modelConverter':
                return (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className={小标题样式}>预设名称</label>
                            <input value={preset.名称} onChange={e => updateField('名称', e.target.value)} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors font-serif" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>模型专属提示词</label>
                            <textarea value={preset.模型专属提示词} onChange={e => updateField('模型专属提示词', e.target.value)} rows={5} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>锚定模式模型提示词</label>
                            <textarea value={preset.锚定模式模型提示词 || ''} onChange={e => updateField('锚定模式模型提示词', e.target.value)} rows={4} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>绑定NPC生成预设</label>
                            <MobileCustomSelect
                                value={preset.NPC词组转化器提示词预设ID || ''}
                                options={[
                                    { value: '', label: '未选择' },
                                    ...npcPromptPresets.map((item) => ({ value: item.id, label: item.名称 }))
                                ]}
                                onChange={(value) => updateField('NPC词组转化器提示词预设ID', value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>绑定场景生成预设</label>
                            <MobileCustomSelect
                                value={preset.场景词组转化器提示词预设ID || ''}
                                options={[
                                    { value: '', label: '未选择' },
                                    ...scenePromptPresets.map((item) => ({ value: item.id, label: item.名称 }))
                                ]}
                                onChange={(value) => updateField('场景词组转化器提示词预设ID', value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>绑定场景判定预设</label>
                            <MobileCustomSelect
                                value={preset.场景判定提示词预设ID || ''}
                                options={[
                                    { value: '', label: '未选择' },
                                    ...sceneJudgePromptPresets.map((item) => ({ value: item.id, label: item.名称 }))
                                ]}
                                onChange={(value) => updateField('场景判定提示词预设ID', value)}
                            />
                        </div>
                    </div>
                );
            case 'promptConverter':
                return (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className={小标题样式}>预设名称</label>
                            <input value={preset.名称} onChange={e => updateField('名称', e.target.value)} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors font-serif" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>类型</label>
                            <MobileCustomSelect
                                value={preset.类型}
                                options={[
                                    { value: 'npc', label: '化身 (NPC)' },
                                    { value: 'scene', label: '场景' },
                                    { value: 'scene_judge', label: '场景判定' }
                                ]}
                                onChange={(value) => updateField('类型', value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>提示词</label>
                            <textarea value={preset.提示词} onChange={e => updateField('提示词', e.target.value)} rows={8} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        {preset.类型 !== 'scene_judge' && (
                            <div className="space-y-1.5">
                                <label className={小标题样式}>{preset.类型 === 'scene' ? '场景角色锚定模式提示词' : '角色锚定模式提示词'}</label>
                                <textarea value={preset.类型 === 'scene' ? (preset.场景角色锚定模式提示词 || preset.角色锚定模式提示词 || '') : (preset.角色锚定模式提示词 || '')} onChange={e => updateField(preset.类型 === 'scene' ? '场景角色锚定模式提示词' : '角色锚定模式提示词', e.target.value)} rows={5} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className={小标题样式}>无锚点回退提示词</label>
                            <textarea value={preset.无锚点回退提示词 || ''} onChange={e => updateField('无锚点回退提示词', e.target.value)} rows={4} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={小标题样式}>输出格式提示词</label>
                            <textarea value={preset.输出格式提示词 || ''} onChange={e => updateField('输出格式提示词', e.target.value)} rows={3} className="w-full rounded border border-wuxia-gold/20 bg-black/50 p-2 text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-colors resize-y font-serif text-[13px] custom-scrollbar" />
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    const title = isNew ? '新增预设' : '编辑预设';

    return (
        <div className={`${卡片样式} p-4 space-y-4`}>
            <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                <h3 className="text-sm font-bold font-serif tracking-widest text-wuxia-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{title}</h3>
                <button onClick={onClose} className={次级按钮样式(false, true)}>收起</button>
            </div>
            <div className="space-y-4 text-sm px-1">
                {renderFields()}
                <button onClick={() => onSave(preset)} disabled={!!busyActionKey} className="w-full rounded border border-wuxia-gold/50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-wuxia-gold/20 via-wuxia-gold/5 to-transparent py-3 text-wuxia-gold font-serif font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:shadow-[0_0_25px_rgba(212,175,55,0.4)] transition-all disabled:opacity-50 disabled:grayscale mt-2">
                    {busyActionKey ? '保存中...' : '保存'}
                </button>
            </div>
        </div>
    )
}

const PresetsTabContent: React.FC<TabProps> = ({
    socialList,
    apiConfig,
    onSaveApiConfig,
    withBusyAction,
    busyActionKey,
    onSaveArtistPreset,
    onDeleteArtistPreset,
    onSaveModelConverterPreset,
    onDeleteModelConverterPreset,
    onSetModelConverterPresetEnabled,
    onSavePromptConverterPreset,
    onDeletePromptConverterPreset,
    onImportPresets,
    onExportPresets,
    onSavePngStylePreset,
    onDeletePngStylePreset,
    onParsePngStylePreset,
    onSaveCharacterAnchor,
    onDeleteCharacterAnchor,
    onExtractCharacterAnchor,
    onExportPngStylePresets,
    onImportPngStylePresets,
}) => {
    const [editState, setEditState] = React.useState<null | { type: 'artist' | 'modelConverter' | 'promptConverter'; preset: any; isNew: boolean; }>(null);
    const [pngPresetEditorId, setPngPresetEditorId] = React.useState('');
    const [pngPresetDraft, setPngPresetDraft] = React.useState<PNG画风预设结构 | null>(null);
    const [pngPresetImportName, setPngPresetImportName] = React.useState('');
    const [pngPresetImportRequirement, setPngPresetImportRequirement] = React.useState('');
    const [characterAnchorEditorId, setCharacterAnchorEditorId] = React.useState('');
    const [characterAnchorDraft, setCharacterAnchorDraft] = React.useState<角色锚点结构 | null>(null);
    const [characterAnchorNpcId, setCharacterAnchorNpcId] = React.useState('');
    const [characterAnchorExtractRequirement, setCharacterAnchorExtractRequirement] = React.useState('');
    const [characterAnchorExtractStage, setCharacterAnchorExtractStage] = React.useState<'idle' | 'extracting' | 'done' | 'error'>('idle');
    const [characterAnchorExtractMessage, setCharacterAnchorExtractMessage] = React.useState('');
    const [pngImportStage, setPngImportStage] = React.useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
    const [pngImportMessage, setPngImportMessage] = React.useState('');
    const [pngImportBackgroundMode, setPngImportBackgroundMode] = React.useState(true);
    const presetConfig = React.useMemo(() => 规范化接口设置(apiConfig), [apiConfig]);
    const feature = presetConfig.功能模型占位;
    const currentPngStylePresetId = (feature?.当前PNG画风预设ID || '').trim();
    const pngStylePresets = React.useMemo<PNG画风预设结构[]>(
        () => (Array.isArray(feature?.PNG画风预设列表) ? feature.PNG画风预设列表 : []).filter((item) => item && typeof item === 'object'),
        [feature?.PNG画风预设列表]
    );
    const characterAnchors = React.useMemo<角色锚点结构[]>(
        () => (Array.isArray(feature?.角色锚点列表) ? feature.角色锚点列表 : []).filter((item) => item && typeof item === 'object'),
        [feature?.角色锚点列表]
    );
    const characterAnchorNpcOptions = React.useMemo(() => {
        const optionMap = new Map<string, { value: string; label: string; 是否失效: boolean }>();
        (Array.isArray(socialList) ? socialList : []).forEach((npc) => {
            const npcId = typeof npc?.id === 'string' ? npc.id.trim() : '';
            if (!npcId) return;
            optionMap.set(npcId, {
                value: npcId,
                label: typeof npc?.姓名 === 'string' && npc.姓名.trim() ? npc.姓名.trim() : npcId,
                是否失效: false
            });
        });
        characterAnchors.forEach((anchor) => {
            const npcId = typeof anchor?.npcId === 'string' ? anchor.npcId.trim() : '';
            if (!npcId || optionMap.has(npcId)) return;
            const fallbackName = (anchor?.名称 || '').trim() || npcId;
            optionMap.set(npcId, {
                value: npcId,
                label: `${fallbackName} · 已失效`,
                是否失效: true
            });
        });
        return Array.from(optionMap.values());
    }, [characterAnchors, socialList]);
    React.useEffect(() => {
        if (pngPresetEditorId && pngStylePresets.some((item) => item.id === pngPresetEditorId)) return;
        setPngPresetEditorId(pngStylePresets[0]?.id || '');
    }, [pngPresetEditorId, pngStylePresets]);
    React.useEffect(() => {
        if (characterAnchorNpcId) return;
        if (characterAnchors[0]?.npcId) {
            setCharacterAnchorNpcId(characterAnchors[0].npcId);
        }
    }, [characterAnchorNpcId, characterAnchors]);
    React.useEffect(() => {
        if (!pngPresetEditorId) {
            setPngPresetDraft(null);
            return;
        }
        const preset = pngStylePresets.find((item) => item.id === pngPresetEditorId) || null;
        setPngPresetDraft(preset ? { ...preset } : null);
    }, [pngPresetEditorId, pngStylePresets]);
    React.useEffect(() => {
        const anchor = (
            (characterAnchorEditorId
                ? characterAnchors.find((item) => item.id === characterAnchorEditorId)
                : null)
            || (characterAnchorNpcId
                ? characterAnchors.find((item) => item.npcId === characterAnchorNpcId)
                : null)
            || null
        );
        if (!anchor) {
            if (characterAnchorEditorId) {
                setCharacterAnchorEditorId('');
            }
            setCharacterAnchorDraft(null);
            return;
        }
        if (anchor.id !== characterAnchorEditorId) {
            setCharacterAnchorEditorId(anchor.id);
        }
        if (anchor.npcId && anchor.npcId !== characterAnchorNpcId) {
            setCharacterAnchorNpcId(anchor.npcId);
        }
        setCharacterAnchorDraft({ ...anchor });
    }, [characterAnchorEditorId, characterAnchorNpcId, characterAnchors]);
    const updatePngPresetDraft = (updater: (preset: PNG画风预设结构) => PNG画风预设结构) => {
        setPngPresetDraft((prev) => {
            if (!prev) return prev;
            return updater(prev);
        });
    };
    const handleImportPngFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        const file = event.target.files[0];
        event.target.value = '';
        if (!onParsePngStylePreset) return;
        setPngImportStage('parsing');
        setPngImportMessage(`正在解析与提炼：${file.name}`);
        await withBusyAction('import_png_style', async () => {
            try {
                const preset = await onParsePngStylePreset(file, {
                    预设名称: pngPresetImportName.trim() || undefined,
                    额外要求: pngPresetImportRequirement.trim() || undefined,
                    后台处理: pngImportBackgroundMode
                });
                if (pngImportBackgroundMode) {
                    setPngPresetImportName('');
                    setPngPresetImportRequirement('');
                    setPngImportStage('done');
                    setPngImportMessage('PNG 已转入后台解析，可继续其他操作。');
                    return;
                }
                if (preset && preset.id) {
                    setPngPresetImportName('');
                    setPngPresetImportRequirement('');
                    setPngPresetEditorId(preset.id);
                    setPngImportStage('done');
                    setPngImportMessage('PNG 已解析完成，画风预设已更新。');
                } else {
                    setPngImportStage('error');
                    setPngImportMessage('PNG 解析失败：未返回预设数据。');
                }
            } catch (error: any) {
                const message = typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : 'PNG 解析失败。';
                setPngImportStage('error');
                setPngImportMessage(message);
                throw error;
            }
        });
    };
    const handleSavePngPreset = async () => {
        if (!pngPresetDraft || !onSavePngStylePreset) return;
        await withBusyAction(`save_png_${pngPresetDraft.id}`, async () => {
            await onSavePngStylePreset({
                ...pngPresetDraft,
                名称: (pngPresetDraft.名称 || '').trim() || 'PNG画风预设',
                原始正面提示词: (pngPresetDraft.原始正面提示词 || '').trim(),
                剥离后正面提示词: (pngPresetDraft.剥离后正面提示词 || '').trim(),
                AI提炼正面提示词: (pngPresetDraft.AI提炼正面提示词 || '').trim(),
                正面提示词: (pngPresetDraft.正面提示词 || '').trim(),
                负面提示词: (pngPresetDraft.负面提示词 || '').trim(),
                画师串: (pngPresetDraft.画师串 || '').trim(),
                画师命中项: Array.isArray(pngPresetDraft.画师命中项) ? pngPresetDraft.画师命中项.map((item: unknown) => String(item).trim()).filter(Boolean) : [],
                updatedAt: Date.now()
            });
        });
    };
    const handleDeletePngPreset = async () => {
        if (!pngPresetDraft || !onDeletePngStylePreset) return;
        await withBusyAction(`delete_png_${pngPresetDraft.id}`, async () => {
            await onDeletePngStylePreset(pngPresetDraft.id);
            setPngPresetEditorId('');
            setPngPresetDraft(null);
        });
    };

    const handleExtractCharacterAnchor = async () => {
        const npcId = characterAnchorNpcId || characterAnchorDraft?.npcId || '';
        if (!npcId || !onExtractCharacterAnchor) return;
        const targetNpc = (Array.isArray(socialList) ? socialList : []).find((item) => item?.id === npcId) || null;
        setCharacterAnchorExtractStage('extracting');
        setCharacterAnchorExtractMessage(`正在提取角色锚点：${targetNpc?.姓名 || '未命名角色'}`);
        await withBusyAction(`extract_character_anchor_${npcId}`, async () => {
            try {
                const anchor = await onExtractCharacterAnchor(npcId, {
                    名称: characterAnchorDraft?.名称 || (targetNpc?.姓名 ? `${targetNpc.姓名} 角色锚点` : '角色锚点'),
                    额外要求: characterAnchorExtractRequirement.trim() || undefined
                });
                if (anchor && 'id' in anchor && anchor.id && 角色锚点有可用内容(anchor)) {
                    setCharacterAnchorNpcId(npcId);
                    setCharacterAnchorEditorId(anchor.id);
                    setCharacterAnchorDraft({ ...anchor });
                    setCharacterAnchorExtractStage('done');
                    setCharacterAnchorExtractMessage(`角色锚点已更新：${targetNpc?.姓名 || anchor.名称 || '未命名角色'}`);
                } else {
                    setCharacterAnchorExtractStage('error');
                    setCharacterAnchorExtractMessage('角色锚点提取失败：未返回有效内容。');
                }
            } catch (error: any) {
                const message = typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : '角色锚点提取失败。';
                setCharacterAnchorExtractStage('error');
                setCharacterAnchorExtractMessage(message);
                throw error;
            }
        });
    };

    const handleSaveCharacterAnchor = async () => {
        const npcId = characterAnchorDraft?.npcId || characterAnchorNpcId || '';
        if (!npcId || !characterAnchorDraft || !onSaveCharacterAnchor) return;
        await withBusyAction(`save_character_anchor_${characterAnchorDraft.id || npcId}`, async () => {
            const saved = await onSaveCharacterAnchor({
                ...characterAnchorDraft,
                npcId,
                名称: (characterAnchorDraft.名称 || '').trim() || '角色锚点',
                正面提示词: (characterAnchorDraft.正面提示词 || '').trim(),
                负面提示词: (characterAnchorDraft.负面提示词 || '').trim(),
                updatedAt: Date.now()
            });
            if (saved && 'id' in saved && saved.id) {
                setCharacterAnchorEditorId(saved.id);
                setCharacterAnchorDraft({ ...saved });
            }
        });
    };

    const handleDeleteCharacterAnchor = async () => {
        const anchorId = characterAnchorDraft?.id || characterAnchorEditorId;
        if (!anchorId || !onDeleteCharacterAnchor) return;
        await withBusyAction(`delete_character_anchor_${anchorId}`, async () => {
            await onDeleteCharacterAnchor(anchorId);
            setCharacterAnchorEditorId('');
            setCharacterAnchorNpcId('');
            setCharacterAnchorDraft(null);
        });
    };
    const autoNpcArtistPresets = React.useMemo(
        () => (feature?.画师串预设列表 || []).filter((preset) => preset && !String(preset.id || '').startsWith('png_artist_') && (preset?.适用范围 === 'npc' || preset?.适用范围 === 'all')),
        [feature?.画师串预设列表]
    );
    const autoSceneArtistPresets = React.useMemo(
        () => (feature?.画师串预设列表 || []).filter((preset) => preset && !String(preset.id || '').startsWith('png_artist_') && (preset?.适用范围 === 'scene' || preset?.适用范围 === 'all')),
        [feature?.画师串预设列表]
    );
    const activeModelTransformerPreset = React.useMemo(
        () => (feature?.模型词组转化器预设列表 || []).find((preset) => preset?.是否启用 === true) || null,
        [feature?.模型词组转化器预设列表]
    );
    const sceneJudgePresets = React.useMemo(
        () => (feature?.词组转化器提示词预设列表 || []).filter((preset) => preset?.类型 === 'scene_judge'),
        [feature?.词组转化器提示词预设列表]
    );
    const 当前生效场景判定预设ID = activeModelTransformerPreset?.场景判定提示词预设ID || feature?.当前场景判定提示词预设ID || '';

    const handleSaveAutoArtistPreset = React.useCallback(async (scope: 'npc' | 'scene', presetId: string) => {
        if (!onSaveApiConfig) return;
        await withBusyAction(`save_auto_artist_${scope}`, async () => {
            const nextConfig = 规范化接口设置({
                ...presetConfig,
                功能模型占位: {
                    ...presetConfig.功能模型占位,
                    当前NPC画师串预设ID: scope === 'npc' ? presetId : presetConfig.功能模型占位.当前NPC画师串预设ID,
                    当前场景画师串预设ID: scope === 'scene' ? presetId : presetConfig.功能模型占位.当前场景画师串预设ID
                }
            });
            await onSaveApiConfig(nextConfig);
        });
    }, [onSaveApiConfig, presetConfig, withBusyAction]);

    const handleSaveAutoPngPreset = React.useCallback(async (scope: 'npc' | 'scene', presetId: string) => {
        if (!onSaveApiConfig) return;
        await withBusyAction(`save_auto_png_${scope}`, async () => {
            const nextConfig = 规范化接口设置({
                ...presetConfig,
                功能模型占位: {
                    ...presetConfig.功能模型占位,
                    当前NPCPNG画风预设ID: scope === 'npc' ? presetId : presetConfig.功能模型占位.当前NPCPNG画风预设ID,
                    当前场景PNG画风预设ID: scope === 'scene' ? presetId : presetConfig.功能模型占位.当前场景PNG画风预设ID
                }
            });
            await onSaveApiConfig(nextConfig);
        });
    }, [onSaveApiConfig, presetConfig, withBusyAction]);

    const handleSaveSceneJudgePreset = React.useCallback(async (presetId: string) => {
        if (!onSaveApiConfig) return;
        await withBusyAction('save_scene_judge_preset', async () => {
            const nextConfig = 规范化接口设置({
                ...presetConfig,
                功能模型占位: {
                    ...presetConfig.功能模型占位,
                    当前场景判定提示词预设ID: presetId
                }
            });
            await onSaveApiConfig(nextConfig);
        });
    }, [onSaveApiConfig, presetConfig, withBusyAction]);

    const handleSave = React.useCallback(async (preset: any) => {
        if (!editState) return;
        const { type } = editState;
        const action = async () => {
            switch (type) {
                case 'artist': if (onSaveArtistPreset) await onSaveArtistPreset(preset); break;
                case 'modelConverter': if (onSaveModelConverterPreset) await onSaveModelConverterPreset(preset); break;
                case 'promptConverter': if (onSavePromptConverterPreset) await onSavePromptConverterPreset(preset); break;
            }
            setEditState(null);
        };
        await withBusyAction(`save_preset_${preset.id}`, action);
    }, [editState, onSaveArtistPreset, onSaveModelConverterPreset, onSavePromptConverterPreset, withBusyAction]);

    const handleAdd = (type: 'artist' | 'modelConverter' | 'promptConverter') => {
        let newPreset: any;
        const id = `new_${Date.now()}`;
        switch (type) {
            case 'artist': newPreset = { id, 名称: '', 画师串: '', 正面提示词: '', 负面提示词: '', 适用范围: 'all' }; break;
            case 'modelConverter': newPreset = { id, 名称: '', 模型专属提示词: '', 锚定模式模型提示词: '', 是否启用: true, NPC词组转化器提示词预设ID: '', 场景词组转化器提示词预设ID: '', 场景判定提示词预设ID: '' }; break;
            case 'promptConverter': newPreset = { id, 名称: '', 类型: 'npc', 提示词: '', 角色锚定模式提示词: '', 场景角色锚定模式提示词: '', 无锚点回退提示词: '', 输出格式提示词: '' }; break;
        }
        setEditState({ type, preset: newPreset, isNew: true });
    };

    const handleEdit = (type: 'artist' | 'modelConverter' | 'promptConverter', preset: any) => {
        setEditState({ type, preset, isNew: false });
    };

    const handleDelete = async (type: 'artist' | 'modelConverter' | 'promptConverter', id: string) => {
        const action = async () => {
            switch (type) {
                case 'artist': if (onDeleteArtistPreset) await onDeleteArtistPreset(id); break;
                case 'modelConverter': if (onDeleteModelConverterPreset) await onDeleteModelConverterPreset(id); break;
                case 'promptConverter': if (onDeletePromptConverterPreset) await onDeletePromptConverterPreset(id); break;
            }
        };
        await withBusyAction(`delete_preset_${id}`, action);
    }

    if (editState) {
        return <PresetEditor editState={editState} onClose={() => setEditState(null)} onSave={handleSave} apiConfig={apiConfig} busyActionKey={busyActionKey} />;
    }

    return (
        <div className="space-y-4 px-1 pb-4">
            {(onImportPresets || onExportPresets) && (
                <div className={`${卡片样式} p-4 flex gap-3 justify-center border-wuxia-gold/20 shadow-inner`}>
                    {onImportPresets && <button onClick={() => withBusyAction('import_presets', onImportPresets)} disabled={!!busyActionKey} className={次级按钮样式()}>导入</button>}
                    {onExportPresets && <button onClick={() => withBusyAction('export_presets', onExportPresets)} disabled={!!busyActionKey} className={次级按钮样式()}>导出</button>}
                </div>
            )}

            <div className={`${卡片样式} p-4 space-y-4 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">角色锚点</div>
                    <div className="text-[10px] text-wuxia-gold/50 mt-1">角色锚点严格跟随 NPC，每个角色只保留一个锚点，后续生图自动带入。</div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <div>
                        <label className={小标题样式}>绑定 NPC</label>
                        <MobileCustomSelect
                            value={characterAnchorDraft?.npcId || characterAnchorNpcId}
                            options={[
                                { value: '', label: '请选择角色' },
                                ...characterAnchorNpcOptions.map((npc) => ({ value: npc.value, label: npc.label }))
                            ]}
                            onChange={(nextNpcId) => {
                                setCharacterAnchorEditorId('');
                                setCharacterAnchorNpcId(nextNpcId);
                            }}
                            disabled={characterAnchorExtractStage === 'extracting'}
                        />
                    </div>
                    <div>
                        <label className={小标题样式}>提取附加要求</label>
                        <input
                            type="text"
                            value={characterAnchorExtractRequirement}
                            onChange={(e) => setCharacterAnchorExtractRequirement(e.target.value)}
                            placeholder="例如：强调发色、瞳色、胸型、常驻衣着"
                            disabled={characterAnchorExtractStage === 'extracting'}
                            className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all"
                        />
                    </div>
                </div>

                {characterAnchorExtractMessage && (
                    <div className={`rounded border px-3 py-2 text-[11px] ${characterAnchorExtractStage === 'error'
                        ? 'border-red-900/40 bg-red-950/20 text-red-300'
                        : characterAnchorExtractStage === 'done'
                            ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-300'
                            : 'border-wuxia-gold/20 bg-black/30 text-wuxia-gold/80'
                        }`}>
                        {characterAnchorExtractMessage}
                    </div>
                )}

                <div className="flex flex-wrap gap-2 justify-center">
                    <button type="button" onClick={() => { void handleExtractCharacterAnchor(); }} disabled={!onExtractCharacterAnchor || !(characterAnchorNpcId || characterAnchorDraft?.npcId) || characterAnchorExtractStage === 'extracting'} className={次级按钮样式()}>{characterAnchorExtractStage === 'extracting' ? '提取中...' : 'AI提取锚点'}</button>
                    <button type="button" onClick={() => { void handleSaveCharacterAnchor(); }} disabled={!onSaveCharacterAnchor || !characterAnchorDraft || characterAnchorExtractStage === 'extracting'} className={次级按钮样式()}>保存锚点</button>
                    <button type="button" onClick={() => { void handleDeleteCharacterAnchor(); }} disabled={!onDeleteCharacterAnchor || !characterAnchorDraft?.id || characterAnchorExtractStage === 'extracting'} className={次级按钮样式(true)}>删除锚点</button>
                </div>

                <div className="space-y-2">
                    <label className={小标题样式}>锚点列表</label>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                        {characterAnchors.length === 0 ? (
                            <div className="rounded border border-dashed border-wuxia-gold/20 bg-black/20 p-4 text-[11px] text-wuxia-gold/40 text-center font-serif">
                                暂无角色锚点
                            </div>
                        ) : (
                            characterAnchors.map((anchor) => {
                                const isSelected = anchor.id === characterAnchorEditorId;
                                const npcName = characterAnchorNpcOptions.find((item) => item.value === anchor.npcId)?.label || anchor.名称;
                                return (
                                    <button
                                        key={anchor.id}
                                        type="button"
                                        onClick={() => {
                                            setCharacterAnchorEditorId(anchor.id);
                                            setCharacterAnchorNpcId(anchor.npcId);
                                        }}
                                        className={`w-full rounded border p-2 text-left transition-all duration-300 ${isSelected ? 'border-wuxia-gold/80 bg-wuxia-gold/10 shadow-[0_0_12px_rgba(212,175,55,0.25)]' : 'border-wuxia-gold/10 bg-black/40 hover:border-wuxia-gold/40'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className={`text-[12px] font-serif truncate ${isSelected ? 'text-wuxia-gold' : 'text-gray-300'}`}>{anchor.名称 || '未命名锚点'}</div>
                                                <div className="text-[10px] text-gray-500 truncate">{npcName || '未绑定角色'}</div>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded border ${anchor.是否启用 ? 'border-emerald-700/50 text-emerald-300 bg-emerald-950/20' : 'border-gray-700 text-gray-400 bg-black/30'}`}>{anchor.是否启用 ? '启用' : '停用'}</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {characterAnchorDraft ? (
                    <div className="space-y-3">
                        <div>
                            <label className={小标题样式}>锚点名称</label>
                            <input
                                type="text"
                                value={characterAnchorDraft.名称}
                                onChange={(e) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 名称: e.target.value } : prev)}
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-sm text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-all font-serif"
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <div className="rounded border border-wuxia-gold/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                                <div className="text-[11px] text-gray-400">启用锚点</div>
                                <ToggleSwitch checked={characterAnchorDraft.是否启用 !== false} onChange={(next) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 是否启用: next } : prev)} ariaLabel="切换角色锚点启用" />
                            </div>
                            <div className="rounded border border-wuxia-gold/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                                <div className="text-[11px] text-gray-400">NPC 生图默认附加</div>
                                <ToggleSwitch checked={characterAnchorDraft.生成时默认附加 === true} onChange={(next) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 生成时默认附加: next } : prev)} ariaLabel="切换默认附加" />
                            </div>
                            <div className="rounded border border-wuxia-gold/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                                <div className="text-[11px] text-gray-400">场景生图自动注入</div>
                                <ToggleSwitch checked={characterAnchorDraft.场景生图自动注入 === true} onChange={(next) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 场景生图自动注入: next } : prev)} ariaLabel="切换场景联动" />
                            </div>
                        </div>
                        <div>
                            <label className={小标题样式}>正面提示词</label>
                            <textarea value={characterAnchorDraft.正面提示词} onChange={(e) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 正面提示词: e.target.value } : prev)} rows={4} className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all custom-scrollbar resize-y font-mono" />
                        </div>
                        <div>
                            <label className={小标题样式}>负面提示词</label>
                            <textarea value={characterAnchorDraft.负面提示词} onChange={(e) => setCharacterAnchorDraft((prev) => prev ? { ...prev, 负面提示词: e.target.value } : prev)} rows={2} className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all custom-scrollbar resize-y font-mono" />
                        </div>
                        <div className="rounded border border-wuxia-gold/10 bg-black/30 p-3 text-[11px] text-gray-400 whitespace-pre-wrap break-words font-mono">
                            {读取角色锚点特征摘要(characterAnchorDraft)}
                        </div>
                    </div>
                ) : (
                    <div className="rounded border border-dashed border-wuxia-gold/20 bg-black/20 p-4 text-[11px] text-wuxia-gold/40 text-center font-serif">
                        请选择一个 NPC，再直接 AI 提取该角色的唯一锚点。
                    </div>
                )}
            </div>

            <div className={`${卡片样式} p-4 space-y-4 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">PNG画风预设</div>
                    <div className="text-[10px] text-wuxia-gold/50 mt-1">导入 PNG 提炼画风后，可复用生图提示词与封面。</div>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                    <button
                        type="button"
                        onClick={() => { if (onExportPngStylePresets) onExportPngStylePresets(); }}
                        disabled={!onExportPngStylePresets}
                        className={次级按钮样式()}
                    >
                        导出预设
                    </button>
                    <button
                        type="button"
                        onClick={() => { if (onImportPngStylePresets) void onImportPngStylePresets(); }}
                        disabled={!onImportPngStylePresets}
                        className={次级按钮样式()}
                    >
                        导入预设
                    </button>
                    <MobileFileUploader
                        accept="image/png"
                        onFileSelect={(file) => { void handleImportPngFile({ target: { files: [file] } } as any); }}
                        className={次级按钮样式()}
                    >
                        导入 PNG
                    </MobileFileUploader>
                </div>

                <div className="space-y-2">
                    <label className={小标题样式}>预设列表</label>
                    <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                        {pngStylePresets.length === 0 ? (
                            <div className="rounded border border-dashed border-wuxia-gold/20 bg-black/20 p-4 text-[11px] text-wuxia-gold/40 text-center font-serif">
                                暂无 PNG 画风预设
                            </div>
                        ) : (
                            pngStylePresets.map((preset) => {
                                const isSelected = preset.id === pngPresetEditorId;
                                const coverSrc = preset.封面 ? 获取图片资源文本地址(preset.封面) : '';
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => {
                                            setPngPresetEditorId(preset.id);
                                        }}
                                        className={`w-full rounded border p-2 text-left transition-all duration-300 ${isSelected ? 'border-wuxia-gold/80 bg-wuxia-gold/10 shadow-[0_0_12px_rgba(212,175,55,0.25)]' : 'border-wuxia-gold/10 bg-black/40 hover:border-wuxia-gold/40'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-16 h-12 rounded border overflow-hidden bg-black/60 flex items-center justify-center ${isSelected ? 'border-wuxia-gold/60' : 'border-wuxia-gold/20'}`}>
                                                {coverSrc ? (
                                                    <img src={coverSrc} alt={preset.名称} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="text-[10px] text-gray-500">无封面</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-[12px] font-serif truncate ${isSelected ? 'text-wuxia-gold' : 'text-gray-300'}`}>{preset.名称 || '未命名预设'}{preset.id === currentPngStylePresetId ? ' · 当前' : ''}</div>
                                                <div className="text-[10px] text-gray-500 line-clamp-2">{preset.正面提示词 || '未提炼画风内容'}</div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => { void handleSavePngPreset(); }}
                            disabled={!pngPresetDraft || !onSavePngStylePreset}
                            className={次级按钮样式(false, true)}
                        >
                            保存修改
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleDeletePngPreset(); }}
                            disabled={!pngPresetDraft || !onDeletePngStylePreset}
                            className={次级按钮样式(true, true)}
                        >
                            删除预设
                        </button>
                    </div>
                </div>

                {pngPresetDraft ? (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <label className={小标题样式}>封面</label>
                            <div className="rounded border border-wuxia-gold/20 bg-black/40 aspect-[4/3] overflow-hidden flex items-center justify-center">
                                {pngPresetDraft.封面 ? (
                                    <img src={获取图片资源文本地址(pngPresetDraft.封面)} alt={pngPresetDraft.名称} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-[10px] text-gray-500">未设置封面</div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className={小标题样式}>预设名称</label>
                            <input
                                type="text"
                                value={pngPresetDraft.名称}
                                onChange={(e) => updatePngPresetDraft((preset) => ({ ...preset, 名称: e.target.value }))}
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-sm text-wuxia-gold/90 outline-none focus:border-wuxia-gold/50 transition-all font-serif"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded border border-wuxia-gold/10 bg-black/40 p-2">
                                <div className="text-wuxia-gold/50 mb-1">来源</div>
                                <div className="text-gray-300">{pngPresetDraft.来源}</div>
                            </div>
                            <div className="rounded border border-wuxia-gold/10 bg-black/40 p-2">
                                <div className="text-wuxia-gold/50 mb-1">LoRA 数量</div>
                                <div className="text-gray-300">{pngPresetDraft.参数?.LoRA列表?.length || 0}</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className={小标题样式}>正面提示词</label>
                            <textarea
                                value={pngPresetDraft.正面提示词}
                                onChange={(e) => updatePngPresetDraft((preset) => ({ ...preset, 正面提示词: e.target.value }))}
                                rows={3}
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all custom-scrollbar resize-y font-mono"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className={小标题样式}>画师串</label>
                            <textarea
                                value={pngPresetDraft.画师串 || ''}
                                onChange={(e) => updatePngPresetDraft((preset) => ({ ...preset, 画师串: e.target.value }))}
                                rows={2}
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all custom-scrollbar resize-y font-mono"
                            />
                        </div>

                        <div className="rounded border border-wuxia-gold/10 bg-black/30 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className={小标题样式}>优先复刻原参数</div>
                                    <div className="text-[10px] text-gray-500 mt-1">开启后，当前 PNG 预设会连同步数、采样器、CFG、SMEA 等参数一起下发；分辨率与 Seed 会自动剔除。</div>
                                </div>
                                <ToggleSwitch
                                    checked={pngPresetDraft.优先复刻原参数 === true}
                                    onChange={(next) => updatePngPresetDraft((preset) => ({ ...preset, 优先复刻原参数: next }))}
                                    ariaLabel="切换优先复刻原参数"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className={小标题样式}>负面提示词</label>
                            <textarea
                                value={pngPresetDraft.负面提示词}
                                onChange={(e) => updatePngPresetDraft((preset) => ({ ...preset, 负面提示词: e.target.value }))}
                                rows={2}
                                className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all custom-scrollbar resize-y font-mono"
                            />
                        </div>

                        <details className="group/details">
                            <summary className={`text-[11px] text-gray-400 cursor-pointer select-none hover:text-wuxia-gold transition-colors outline-none flex items-center gap-1 before:content-['▶'] before:text-[8px] before:transition-transform group-open/details:before:rotate-90`}>
                                解析参数与元数据
                            </summary>
                            <div className="mt-2 space-y-2 text-[10px] text-gray-400/80">
                                <div className="rounded border border-wuxia-gold/10 bg-black/60 p-3 whitespace-pre-wrap break-words font-mono">
                                    {pngPresetDraft.参数 ? JSON.stringify(pngPresetDraft.参数, null, 2) : '未解析参数'}
                                </div>
                                <div className="rounded border border-wuxia-gold/10 bg-black/60 p-3 whitespace-pre-wrap break-words font-mono">
                                    {pngPresetDraft.原始元数据 || '未记录原始元数据'}
                                </div>
                            </div>
                        </details>
                    </div>
                ) : (
                    <div className="rounded border border-dashed border-wuxia-gold/20 bg-black/20 p-6 text-sm text-wuxia-gold/40 text-center font-serif">
                        尚未选择 PNG 画风预设。请导入 PNG 或从列表选择预设。
                    </div>
                )}

                <div className="pt-3 border-t border-wuxia-gold/10 space-y-2">
                    <div>
                        <label className={小标题样式}>导入时预设名称</label>
                        <input
                            type="text"
                            value={pngPresetImportName}
                            onChange={(e) => setPngPresetImportName(e.target.value)}
                            placeholder="可选，默认使用 PNG 文件名"
                            className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all"
                        />
                    </div>
                    <div>
                        <label className={小标题样式}>额外提炼要求</label>
                        <input
                            type="text"
                            value={pngPresetImportRequirement}
                            onChange={(e) => setPngPresetImportRequirement(e.target.value)}
                            placeholder="例如：偏重画风、光影、材质与线条风格"
                            className="w-full rounded border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-xs text-gray-300 outline-none focus:border-wuxia-gold/50 transition-all"
                        />
                    </div>
                    <div className="rounded border border-wuxia-gold/20 bg-black/30 px-3 py-2 flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-serif text-wuxia-gold/90">后台处理</div>
                            <div className="text-[10px] text-wuxia-gold/50 mt-1">开启后，PNG 解析会在后台继续执行。</div>
                        </div>
                        <ToggleSwitch checked={pngImportBackgroundMode} onChange={setPngImportBackgroundMode} ariaLabel='切换PNG解析后台处理模式' />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                        {pngImportStage === 'parsing' && (
                            <>
                                <span className="w-3 h-3 rounded-full border border-wuxia-gold border-t-transparent animate-spin" />
                                <span className="text-wuxia-gold/80">{pngImportMessage || '正在解析 PNG...'}</span>
                            </>
                        )}
                        {pngImportStage === 'done' && (
                            <span className="text-emerald-400">{pngImportMessage || 'PNG 解析完成。'}</span>
                        )}
                        {pngImportStage === 'error' && (
                            <span className="text-red-400">{pngImportMessage || 'PNG 解析失败。'}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className={`${卡片样式} p-4 space-y-4 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">自动生图画师串</div>
                    <div className="text-[10px] text-wuxia-gold/50 mt-1">NPC 与场景默认使用的画师串预设。</div>
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>NPC自动生图预设</label>
                    <MobileCustomSelect
                        value={feature?.当前NPC画师串预设ID || ''}
                        options={[
                            { value: '', label: '不启用' },
                            ...autoNpcArtistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveAutoArtistPreset('npc', value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>NPC自动PNG预设</label>
                    <MobileCustomSelect
                        value={feature?.当前NPCPNG画风预设ID || ''}
                        options={[
                            { value: '', label: '不启用' },
                            ...pngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveAutoPngPreset('npc', value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>场景自动生图预设</label>
                    <MobileCustomSelect
                        value={feature?.当前场景画师串预设ID || ''}
                        options={[
                            { value: '', label: '不启用' },
                            ...autoSceneArtistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveAutoArtistPreset('scene', value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>场景自动PNG预设</label>
                    <MobileCustomSelect
                        value={feature?.当前场景PNG画风预设ID || ''}
                        options={[
                            { value: '', label: '不启用' },
                            ...pngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveAutoPngPreset('scene', value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey}
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>当前生效场景判定预设</label>
                    <MobileCustomSelect
                        value={当前生效场景判定预设ID}
                        options={[
                            { value: '', label: '不启用' },
                            ...sceneJudgePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveSceneJudgePreset(value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey || !!activeModelTransformerPreset}
                    />
                    <div className="text-[10px] text-wuxia-gold/40 font-serif">
                        {activeModelTransformerPreset ? `已使用预设：${activeModelTransformerPreset.名称}` : '未使用模型预设时，此处为默认场景判定预设。'}
                    </div>
                </div>
            </div>
            <div className={`${卡片样式} p-4 space-y-3 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">画师串预设</div>
                    {onSaveArtistPreset && <button onClick={() => handleAdd('artist')} className={次级按钮样式(false, true)}>新增</button>}
                </div>
                <div className="space-y-3">
                    {(feature?.画师串预设列表 || []).map(p => (
                        <div key={p.id} className='rounded border border-wuxia-gold/20 bg-black/40 p-3 space-y-3 font-serif relative group hover:border-[#d4af37]/50 transition-colors'>
                            <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            <div className="flex justify-between items-start relative z-10 w-full">
                                <details className="w-full">
                                    <summary className='text-wuxia-gold/90 font-bold tracking-widest cursor-pointer outline-none flex items-center justify-between group-details'>
                                        <span>{p.名称} <span className='text-wuxia-gold/40 text-[10px] ml-1 font-normal'>({p.适用范围})</span></span>
                                        <div className="flex gap-2 shrink-0 ml-2">
                                            {onSaveArtistPreset && <button onClick={(e) => { e.preventDefault(); handleEdit('artist', p); }} className={次级按钮样式(false, true)}>编辑</button>}
                                            {onDeleteArtistPreset && <button onClick={(e) => { e.preventDefault(); handleDelete('artist', p.id); }} className={次级按钮样式(true, true)}>删除</button>}
                                        </div>
                                    </summary>
                                    <div className='mt-3 pt-3 border-t border-wuxia-gold/20 space-y-2 text-wuxia-gold/60 text-[11px] whitespace-pre-wrap break-words'>
                                        <div><span className="text-emerald-400/80 font-bold">正面:</span> {p.正面提示词 || '无生之气'}</div>
                                        <div><span className="text-red-400/80 font-bold">负面:</span> {p.负面提示词 || '无死之气'}</div>
                                    </div>
                                </details>
                            </div>
                        </div>
                    ))}
                    {((feature?.画师串预设列表 || []).length === 0) && <div className="text-center text-[#a67c00]/60 font-serif tracking-widest py-4 border border-dashed border-[#d4af37]/20 rounded">暂无预设。</div>}
                </div>
            </div>

            <div className={`${卡片样式} p-4 space-y-3 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">模型预设组</div>
                    {onSaveModelConverterPreset && <button onClick={() => handleAdd('modelConverter')} className={次级按钮样式(false, true)}>新增</button>}
                </div>
                <div className="space-y-3">
                    {(feature?.模型词组转化器预设列表 || []).map(p => (
                        <div key={p.id} className='rounded border border-wuxia-gold/20 bg-black/40 p-3 space-y-3 font-serif relative group hover:border-[#d4af37]/50 transition-colors'>
                            <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            <div className="flex justify-between items-start relative z-10 w-full flex-col">
                                <details className="w-full">
                                    <summary className='text-wuxia-gold/90 font-bold tracking-widest cursor-pointer outline-none flex items-center justify-between group-details'>
                                        <div className="flex items-center gap-2">
                                            {onSetModelConverterPresetEnabled && <div onClick={(e) => e.preventDefault()}><ToggleSwitch checked={!!p.是否启用} onChange={(val) => withBusyAction(`toggle_preset_${p.id}`, () => onSetModelConverterPresetEnabled(p.id, val))} ariaLabel={`启用/禁用 ${p.名称}`} /></div>}
                                            <span className={p.是否启用 ? 'text-wuxia-gold shadow-glow' : 'text-wuxia-gold/40'}>{p.名称}</span>
                                        </div>
                                        <div className="flex gap-2 shrink-0 ml-2 items-center">
                                            {onSaveModelConverterPreset && <button onClick={(e) => { e.preventDefault(); handleEdit('modelConverter', p); }} className={次级按钮样式(false, true)}>编辑</button>}
                                            {onDeleteModelConverterPreset && <button onClick={(e) => { e.preventDefault(); handleDelete('modelConverter', p.id); }} className={次级按钮样式(true, true)}>删除</button>}
                                        </div>
                                    </summary>
                                    <div className='mt-3 pt-3 border-t border-wuxia-gold/20 space-y-1 text-wuxia-gold/60 text-[11px] whitespace-pre-wrap break-words leading-relaxed'>
                                        {p.模型专属提示词 || '未填写'}
                                    </div>
                                </details>
                            </div>
                        </div>
                    ))}
                    {((feature?.模型词组转化器预设列表 || []).length === 0) && <div className="text-center text-[#a67c00]/60 font-serif tracking-widest py-4 border border-dashed border-[#d4af37]/20 rounded">暂无模型预设。</div>}
                </div>
            </div>

            <div className={`${卡片样式} p-4 space-y-3 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">转化器预设</div>
                    {onSavePromptConverterPreset && <button onClick={() => handleAdd('promptConverter')} className={次级按钮样式(false, true)}>新增</button>}
                </div>
                <div className="space-y-3">
                    {(feature?.词组转化器提示词预设列表 || []).map(p => (
                        <div key={p.id} className='rounded border border-wuxia-gold/20 bg-black/40 p-3 space-y-3 font-serif relative group hover:border-[#d4af37]/50 transition-colors'>
                            <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            <div className="flex justify-between items-start relative z-10 w-full">
                                <details className="w-full">
                                    <summary className='text-wuxia-gold/90 font-bold tracking-widest cursor-pointer outline-none flex items-center justify-between group-details'>
                                        <span>{p.名称} <span className='text-wuxia-gold/40 text-[10px] ml-1 font-normal'>({p.类型})</span></span>
                                        <div className="flex gap-2 shrink-0 ml-2">
                                            {onSavePromptConverterPreset && <button onClick={(e) => { e.preventDefault(); handleEdit('promptConverter', p); }} className={次级按钮样式(false, true)}>编辑</button>}
                                            {onDeletePromptConverterPreset && <button onClick={(e) => { e.preventDefault(); handleDelete('promptConverter', p.id); }} className={次级按钮样式(true, true)}>删除</button>}
                                        </div>
                                    </summary>
                                    <div className='mt-3 pt-3 border-t border-wuxia-gold/20 space-y-1 text-wuxia-gold/60 text-[11px] whitespace-pre-wrap break-words leading-relaxed'>
                                        {p.提示词 || '未填写'}
                                    </div>
                                </details>
                            </div>
                        </div>
                    ))}
                    {((feature?.词组转化器提示词预设列表 || []).length === 0) && <div className="text-center text-[#a67c00]/60 font-serif tracking-widest py-4 border border-dashed border-[#d4af37]/20 rounded">暂无转化器预设。</div>}
                </div>
            </div>
        </div>
    )
}

const RulesTabContent: React.FC<TabProps> = ({
    apiConfig,
    onSaveApiConfig,
    withBusyAction,
    busyActionKey,
    onSaveModelConverterPreset,
    onDeleteModelConverterPreset,
    onSetModelConverterPresetEnabled,
    onSavePromptConverterPreset,
    onDeletePromptConverterPreset,
    onImportPresets,
    onExportPresets
}) => {
    const [editState, setEditState] = React.useState<null | { type: 'modelConverter' | 'promptConverter'; preset: any; isNew: boolean; }>(null);
    const presetConfig = React.useMemo(() => 规范化接口设置(apiConfig), [apiConfig]);
    const feature = presetConfig.功能模型占位;
    const activeModelTransformerPreset = React.useMemo(
        () => (feature?.模型词组转化器预设列表 || []).find((preset) => preset?.是否启用 === true) || null,
        [feature?.模型词组转化器预设列表]
    );
    const sceneJudgePresets = React.useMemo(
        () => (feature?.词组转化器提示词预设列表 || []).filter((preset) => preset?.类型 === 'scene_judge'),
        [feature?.词组转化器提示词预设列表]
    );
    const 当前生效场景判定预设ID = activeModelTransformerPreset?.场景判定提示词预设ID || feature?.当前场景判定提示词预设ID || '';

    const handleSaveSceneJudgePreset = React.useCallback(async (presetId: string) => {
        if (!onSaveApiConfig) return;
        await withBusyAction('save_mobile_scene_judge_preset', async () => {
            const nextConfig = 规范化接口设置({
                ...presetConfig,
                功能模型占位: {
                    ...presetConfig.功能模型占位,
                    当前场景判定提示词预设ID: presetId
                }
            });
            await onSaveApiConfig(nextConfig);
        });
    }, [onSaveApiConfig, presetConfig, withBusyAction]);

    const handleToggleCompatibilityMode = React.useCallback(async (enabled: boolean) => {
        if (!onSaveApiConfig) return;
        await withBusyAction('save_mobile_transformer_compatibility', async () => {
            const nextConfig = 规范化接口设置({
                ...presetConfig,
                功能模型占位: {
                    ...presetConfig.功能模型占位,
                    词组转化兼容模式: enabled
                }
            });
            await onSaveApiConfig(nextConfig);
        });
    }, [onSaveApiConfig, presetConfig, withBusyAction]);

    const handleSave = React.useCallback(async (preset: any) => {
        if (!editState) return;
        await withBusyAction(`save_rule_preset_${preset.id}`, async () => {
            if (editState.type === 'modelConverter') {
                await onSaveModelConverterPreset?.(preset);
            } else {
                await onSavePromptConverterPreset?.(preset);
            }
            setEditState(null);
        });
    }, [editState, onSaveModelConverterPreset, onSavePromptConverterPreset, withBusyAction]);

    const handleAdd = React.useCallback((type: 'modelConverter' | 'promptConverter') => {
        const id = `new_${Date.now()}`;
        const preset = type === 'modelConverter'
            ? { id, 名称: '', 模型专属提示词: '', 锚定模式模型提示词: '', 是否启用: true, NPC词组转化器提示词预设ID: '', 场景词组转化器提示词预设ID: '', 场景判定提示词预设ID: '' }
            : { id, 名称: '', 类型: 'npc', 提示词: '', 角色锚定模式提示词: '', 场景角色锚定模式提示词: '', 无锚点回退提示词: '', 输出格式提示词: '' };
        setEditState({ type, preset, isNew: true });
    }, []);

    const handleDelete = React.useCallback(async (type: 'modelConverter' | 'promptConverter', id: string) => {
        await withBusyAction(`delete_rule_preset_${id}`, async () => {
            if (type === 'modelConverter') {
                await onDeleteModelConverterPreset?.(id);
            } else {
                await onDeletePromptConverterPreset?.(id);
            }
        });
    }, [onDeleteModelConverterPreset, onDeletePromptConverterPreset, withBusyAction]);

    if (editState) {
        return <PresetEditor editState={editState} onClose={() => setEditState(null)} onSave={handleSave} apiConfig={apiConfig} busyActionKey={busyActionKey} />;
    }

    return (
        <div className="space-y-4 px-1 pb-4">
            {(onImportPresets || onExportPresets) && (
                <div className={`${卡片样式} p-4 flex gap-3 justify-center border-wuxia-gold/20 shadow-inner`}>
                    {onImportPresets && <button onClick={() => withBusyAction('import_rule_presets', onImportPresets)} disabled={!!busyActionKey} className={次级按钮样式()}>导入规则</button>}
                    {onExportPresets && <button onClick={() => withBusyAction('export_rule_presets', onExportPresets)} disabled={!!busyActionKey} className={次级按钮样式()}>导出规则</button>}
                </div>
            )}

            <div className={`${卡片样式} p-4 space-y-4 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">规则入口</div>
                    <div className="text-[10px] text-wuxia-gold/50 mt-1">移动端已按 PC 结构拆分出独立规则页。</div>
                </div>
                <div className="rounded border border-wuxia-gold/20 bg-black/30 px-3 py-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-serif text-wuxia-gold/90">兼容模式</div>
                        <div className="text-[10px] text-wuxia-gold/50 mt-1">开启后，画师串与 PNG 画风正面词会先交给 AI 提炼，再并入最终提示词。</div>
                    </div>
                    <ToggleSwitch
                        checked={feature?.词组转化兼容模式 === true}
                        onChange={(enabled) => { void handleToggleCompatibilityMode(enabled); }}
                        ariaLabel="切换词组转化兼容模式"
                    />
                </div>
                <div className="space-y-2">
                    <label className={小标题样式}>当前生效场景判定预设</label>
                    <MobileCustomSelect
                        value={当前生效场景判定预设ID}
                        options={[
                            { value: '', label: '不启用' },
                            ...sceneJudgePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))
                        ]}
                        onChange={(value) => { void handleSaveSceneJudgePreset(value); }}
                        disabled={!onSaveApiConfig || !!busyActionKey || !!activeModelTransformerPreset}
                    />
                    <div className="text-[10px] text-wuxia-gold/40 font-serif">
                        {activeModelTransformerPreset ? `已使用预设：${activeModelTransformerPreset.名称}` : '未启用模型规则集时，此处作为默认场景判定规则。'}
                    </div>
                </div>
            </div>

            <div className={`${卡片样式} p-4 space-y-3 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">模型规则集</div>
                    {onSaveModelConverterPreset && <button onClick={() => handleAdd('modelConverter')} className={次级按钮样式(false, true)}>新增</button>}
                </div>
                <div className="space-y-3">
                    {(feature?.模型词组转化器预设列表 || []).map((preset) => (
                        <div key={preset.id} className="rounded border border-wuxia-gold/20 bg-black/40 p-3 space-y-3 font-serif relative group hover:border-[#d4af37]/50 transition-colors">
                            <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            <details className="relative z-10 w-full">
                                <summary className="text-wuxia-gold/90 font-bold tracking-widest cursor-pointer outline-none flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {onSetModelConverterPresetEnabled && <div onClick={(e) => e.preventDefault()}><ToggleSwitch checked={!!preset.是否启用} onChange={(value) => withBusyAction(`toggle_mobile_rule_${preset.id}`, () => onSetModelConverterPresetEnabled(preset.id, value))} ariaLabel={`切换${preset.名称}`} /></div>}
                                        <span className={preset.是否启用 ? 'text-wuxia-gold shadow-glow' : 'text-wuxia-gold/40'}>{preset.名称}</span>
                                    </div>
                                    <div className="flex gap-2 shrink-0 ml-2">
                                        {onSaveModelConverterPreset && <button onClick={(e) => { e.preventDefault(); setEditState({ type: 'modelConverter', preset, isNew: false }); }} className={次级按钮样式(false, true)}>编辑</button>}
                                        {onDeleteModelConverterPreset && <button onClick={(e) => { e.preventDefault(); void handleDelete('modelConverter', preset.id); }} className={次级按钮样式(true, true)}>删除</button>}
                                    </div>
                                </summary>
                                <div className="mt-3 pt-3 border-t border-wuxia-gold/20 space-y-2 text-wuxia-gold/60 text-[11px] whitespace-pre-wrap break-words leading-relaxed">
                                    {preset.模型专属提示词 || '未填写'}
                                </div>
                            </details>
                        </div>
                    ))}
                    {((feature?.模型词组转化器预设列表 || []).length === 0) && <div className="text-center text-[#a67c00]/60 font-serif tracking-widest py-4 border border-dashed border-[#d4af37]/20 rounded">暂无模型规则集。</div>}
                </div>
            </div>

            <div className={`${卡片样式} p-4 space-y-3 border-wuxia-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]`}>
                <div className="flex items-center justify-between border-b border-wuxia-gold/20 pb-2">
                    <div className="text-sm font-serif font-bold tracking-widest text-[#d4af37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">转化器规则模板</div>
                    {onSavePromptConverterPreset && <button onClick={() => handleAdd('promptConverter')} className={次级按钮样式(false, true)}>新增</button>}
                </div>
                <div className="space-y-3">
                    {(feature?.词组转化器提示词预设列表 || []).map((preset) => (
                        <div key={preset.id} className="rounded border border-wuxia-gold/20 bg-black/40 p-3 space-y-3 font-serif relative group hover:border-[#d4af37]/50 transition-colors">
                            <div className="absolute inset-0 bg-gradient-to-b from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            <details className="relative z-10 w-full">
                                <summary className="text-wuxia-gold/90 font-bold tracking-widest cursor-pointer outline-none flex items-center justify-between">
                                    <span>{preset.名称} <span className="text-wuxia-gold/40 text-[10px] ml-1 font-normal">({preset.类型})</span></span>
                                    <div className="flex gap-2 shrink-0 ml-2">
                                        {onSavePromptConverterPreset && <button onClick={(e) => { e.preventDefault(); setEditState({ type: 'promptConverter', preset, isNew: false }); }} className={次级按钮样式(false, true)}>编辑</button>}
                                        {onDeletePromptConverterPreset && <button onClick={(e) => { e.preventDefault(); void handleDelete('promptConverter', preset.id); }} className={次级按钮样式(true, true)}>删除</button>}
                                    </div>
                                </summary>
                                <div className="mt-3 pt-3 border-t border-wuxia-gold/20 space-y-1 text-wuxia-gold/60 text-[11px] whitespace-pre-wrap break-words leading-relaxed">
                                    {preset.提示词 || '未填写'}
                                </div>
                            </details>
                        </div>
                    ))}
                    {((feature?.词组转化器提示词预设列表 || []).length === 0) && <div className="text-center text-[#a67c00]/60 font-serif tracking-widest py-4 border border-dashed border-[#d4af37]/20 rounded">暂无转化器规则模板。</div>}
                </div>
            </div>
        </div>
    );
};

// #endregion

export default MobileImageManagerModal;
