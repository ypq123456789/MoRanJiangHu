import React from 'react';
import {
    OpeningConfig,
    角色数据结构,
    视觉设置结构,
    接口设置结构,
    角色锚点结构,
    画师串预设结构,
    PNG画风预设结构
} from '../../../types';
import CharacterProfileCard from './CharacterProfileCard';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import { 获取图片展示地址 } from '../../../utils/imageAssets';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import type { 可分配六维属性键 } from '../../../utils/characterAttributePoints';
import { NPC是否扶她, NPC是否男娘 } from '../../../utils/npcGenderFlags';

type 主角生图选项 = {
    构图?: '头像' | '半身' | '立绘';
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    额外要求?: string;
    尺寸?: string;
};

interface Props {
    character: 角色数据结构;
    onClose: () => void;
    visualConfig?: 视觉设置结构;
    openingConfig?: OpeningConfig;
    apiConfig?: 接口设置结构;
    playerAnchor?: 角色锚点结构 | null;
    nsfwEnabled?: boolean;
    femboyNsfwEnabled?: boolean;
    onGeneratePlayerImage?: (options?: 主角生图选项) => Promise<void> | void;
    onGeneratePlayerSecretPartImage?: (part: string) => Promise<void> | void;
    onExtractPlayerAnchor?: (options?: { 名称?: string; 额外要求?: string }) => Promise<角色锚点结构 | null | void> | 角色锚点结构 | null | void;
    onSavePlayerAnchor?: (anchor: 角色锚点结构) => Promise<角色锚点结构 | null | void> | 角色锚点结构 | null | void;
    onDeletePlayerAnchor?: (anchorId: string) => Promise<void> | void;
    onSelectPlayerAvatarImage?: (imageId: string) => void;
    onClearPlayerAvatarImage?: () => void;
    onUploadPlayerAvatar?: (imageUrl: string) => void;
    onSelectPlayerPortraitImage?: (imageId: string) => void;
    onClearPlayerPortraitImage?: () => void;
    onUploadPlayerPortrait?: (imageUrl: string) => void;
    onRemovePlayerImageRecord?: (imageId: string) => void;
    onAllocateAttributePoint?: (key: 可分配六维属性键) => void;
}

type 页面标签 = 'image' | 'profile' | 'skills';

const 主角锚点绑定ID = '__player__';
const 输入框样式 = 'w-full rounded-xl border border-gray-800 bg-black/40 px-3 py-2.5 text-sm text-gray-200 outline-none transition-all focus:border-wuxia-gold/40';
const 文本域样式 = `${输入框样式} min-h-[88px] resize-y`;

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
        Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0)
    ));
};

const 格式化时间 = (value?: number): string => {
    if (!Number.isFinite(value)) return '未知时间';
    try {
        return new Date(value as number).toLocaleString('zh-CN', { hour12: false });
    } catch {
        return '未知时间';
    }
};

const 读取预设名称 = (preset?: 画师串预设结构 | PNG画风预设结构 | null): string => (
    typeof preset?.名称 === 'string' && preset.名称.trim() ? preset.名称.trim() : '未命名预设'
);

const 标签按钮样式 = (active: boolean): string => `inline-flex min-w-0 flex-1 items-center justify-center rounded-xl border px-3 py-2.5 text-sm tracking-[0.12em] transition-all xl:min-w-[112px] xl:px-5 xl:tracking-[0.22em] ${
    active
        ? 'border-wuxia-gold/60 bg-wuxia-gold/12 text-wuxia-gold shadow-[0_0_18px_rgba(212,175,55,0.15)]'
        : 'border-gray-800 bg-black/35 text-gray-400 hover:border-wuxia-gold/35 hover:text-wuxia-gold/80'
}`;

const 技艺等级序列 = ['未入门', '入门', '初窥', '小成', '大成', '登堂', '入室', '圆满', '宗师', '大宗师'];

const 获取技艺等级索引 = (level?: string): number => {
    const idx = 技艺等级序列.indexOf(String(level || ''));
    return idx >= 0 ? idx : 0;
};

const 获取技艺等级颜色 = (level?: string): string => {
    const idx = 获取技艺等级索引(level);
    if (idx <= 0) return 'text-gray-500';
    if (idx <= 2) return 'text-gray-300';
    if (idx <= 4) return 'text-emerald-300';
    if (idx <= 6) return 'text-cyan-300';
    if (idx <= 8) return 'text-wuxia-gold';
    return 'text-purple-300';
};

const CharacterModal: React.FC<Props> = ({
    character,
    onClose,
    visualConfig,
    openingConfig,
    apiConfig,
    playerAnchor,
    nsfwEnabled = false,
    femboyNsfwEnabled = true,
    onGeneratePlayerImage,
    onGeneratePlayerSecretPartImage,
    onExtractPlayerAnchor,
    onSavePlayerAnchor,
    onDeletePlayerAnchor,
    onSelectPlayerAvatarImage,
    onClearPlayerAvatarImage,
    onUploadPlayerAvatar,
    onSelectPlayerPortraitImage,
    onClearPlayerPortraitImage,
    onUploadPlayerPortrait,
    onRemovePlayerImageRecord,
    onAllocateAttributePoint
}) => {
    use图片资源回源预取(character);
    const [activeTab, setActiveTab] = React.useState<页面标签>('image');
    const avatarUploadInputRef = React.useRef<HTMLInputElement | null>(null);
    const portraitUploadInputRef = React.useRef<HTMLInputElement | null>(null);

    const handleUploadFile = (event: React.ChangeEvent<HTMLInputElement>, onUpload?: (imageUrl: string) => void) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (result) onUpload?.(result);
        };
        reader.readAsDataURL(file);
    };
    const [busyAction, setBusyAction] = React.useState('');
    const [anchorExtractRequirement, setAnchorExtractRequirement] = React.useState('');
    const [anchorExtractStage, setAnchorExtractStage] = React.useState<'idle' | 'extracting' | 'done' | 'error'>('idle');
    const [anchorExtractMessage, setAnchorExtractMessage] = React.useState('');
    const [anchorDraft, setAnchorDraft] = React.useState<角色锚点结构 | null>(playerAnchor ? { ...playerAnchor } : null);
    const [generateOptions, setGenerateOptions] = React.useState<主角生图选项>({
        构图: '半身',
        画风: '二次元',
        画师串: '',
        画师串预设ID: '',
        PNG画风预设ID: '',
        额外要求: '',
        尺寸: ''
    });

    const normalizedApiConfig = React.useMemo(() => 规范化接口设置(apiConfig), [apiConfig]);
    const feature = normalizedApiConfig.功能模型占位;
    const artistPresets = React.useMemo<画师串预设结构[]>(
        () => (Array.isArray(feature?.画师串预设列表) ? feature.画师串预设列表 : []).filter(
            (item) => item && !String(item.id || '').startsWith('png_artist_') && (item.适用范围 === 'npc' || item.适用范围 === 'all')
        ),
        [feature?.画师串预设列表]
    );
    const pngStylePresets = React.useMemo<PNG画风预设结构[]>(
        () => (Array.isArray(feature?.PNG画风预设列表) ? feature.PNG画风预设列表 : []).filter((item) => item && typeof item === 'object'),
        [feature?.PNG画风预设列表]
    );
    const archive = character?.图片档案;
    const skills = React.useMemo(
        () => (Array.isArray((character as any)?.技艺) ? [...(character as any).技艺] : [])
            .filter((item) => item && typeof item === 'object')
            .sort((a, b) => {
                const levelDiff = 获取技艺等级索引(b?.等级) - 获取技艺等级索引(a?.等级);
                if (levelDiff !== 0) return levelDiff;
                return Number(b?.熟练度 || 0) - Number(a?.熟练度 || 0);
            }),
        [character]
    );
    const history = React.useMemo(
        () => (Array.isArray(archive?.生图历史) ? archive.生图历史 : []).filter((item) => item && typeof item === 'object'),
        [archive]
    );
    const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
    const selectedPortraitId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
    const selectedArtistPreset = React.useMemo(
        () => artistPresets.find((item) => item.id === (generateOptions.画师串预设ID || '').trim()) || null,
        [artistPresets, generateOptions.画师串预设ID]
    );
    const selectedPngPreset = React.useMemo(
        () => pngStylePresets.find((item) => item.id === (generateOptions.PNG画风预设ID || '').trim()) || null,
        [pngStylePresets, generateOptions.PNG画风预设ID]
    );

    const 主角性别 = String(character?.性别 || '').trim();
    const 主角是扶她 = NPC是否扶她(character);
    const 主角是男娘 = NPC是否男娘(character);
    const 主角是男性纯 = 主角性别 === '男' && !主角是男娘 && !主角是扶她;
    const 主角展示香闺秘档 = nsfwEnabled && !主角是男性纯;

    const 主角香闺部位列表: Array<{ key: string; label: string; text: string }> = 主角展示香闺秘档
        ? (主角是扶她
            ? [
                { key: '胸部', label: '胸部描述', text: (character as any)?.胸部描述 || '暂无记录' },
                { key: '小穴', label: '小穴描述', text: (character as any)?.小穴描述 || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: (character as any)?.屁穴描述 || '暂无记录' },
                { key: '肉棒', label: '肉棒描述', text: (character as any)?.肉棒描述 || '暂无记录' }
            ]
            : 主角是男娘
            ? [
                { key: '肉棒', label: '肉棒描述', text: (character as any)?.肉棒描述 || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: (character as any)?.屁穴描述 || '暂无记录' }
            ]
            : [
                { key: '胸部', label: '胸部描述', text: (character as any)?.胸部描述 || '暂无记录' },
                { key: '小穴', label: '小穴描述', text: (character as any)?.小穴描述 || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: (character as any)?.屁穴描述 || '暂无记录' }
            ])
        : [];

    React.useEffect(() => {
        setAnchorDraft(playerAnchor ? { ...playerAnchor } : null);
    }, [playerAnchor]);

    React.useEffect(() => {
        setGenerateOptions((prev) => ({
            ...prev,
            画风: prev.画风 || feature?.自动NPC生图画风 || '二次元',
            画师串预设ID: prev.画师串预设ID || feature?.当前NPC画师串预设ID || '',
            PNG画风预设ID: prev.PNG画风预设ID || feature?.当前NPCPNG画风预设ID || ''
        }));
    }, [feature?.当前NPCPNG画风预设ID, feature?.当前NPC画师串预设ID, feature?.自动NPC生图画风]);

    const runAction = async (key: string, action?: () => Promise<void> | void) => {
        if (!action || busyAction) return;
        try {
            setBusyAction(key);
            await action();
        } finally {
            setBusyAction('');
        }
    };

    const 更新生图选项 = <K extends keyof 主角生图选项>(key: K, value: 主角生图选项[K]) => {
        setGenerateOptions((prev) => ({ ...prev, [key]: value }));
    };

    const handleGenerate = async () => {
        if (!onGeneratePlayerImage) return;
        await runAction(`generate_${generateOptions.构图 || 'image'}`, async () => {
            await Promise.resolve(onGeneratePlayerImage({
                构图: generateOptions.构图,
                画风: generateOptions.画风,
                画师串: (generateOptions.画师串 || '').trim() || undefined,
                画师串预设ID: (generateOptions.画师串预设ID || '').trim() || undefined,
                PNG画风预设ID: (generateOptions.PNG画风预设ID || '').trim() || undefined,
                额外要求: (generateOptions.额外要求 || '').trim() || undefined,
                尺寸: (generateOptions.尺寸 || '').trim() || undefined
            })).catch(() => undefined);
        });
    };

    const handleExtractAnchor = async () => {
        if (!onExtractPlayerAnchor) return;
        setAnchorExtractStage('extracting');
        setAnchorExtractMessage(`正在提取 ${character?.姓名 || '主角'} 的角色锚点`);
        await runAction('extract_player_anchor', async () => {
            try {
                const extracted = await onExtractPlayerAnchor({
                    名称: anchorDraft?.名称 || `${character?.姓名 || '主角'} 角色锚点`,
                    额外要求: anchorExtractRequirement.trim() || undefined
                });
                if (extracted && 'id' in extracted && extracted.id && 角色锚点有可用内容(extracted)) {
                    setAnchorDraft({ ...extracted });
                    setAnchorExtractStage('done');
                    setAnchorExtractMessage(`角色锚点已更新：${extracted.名称 || character?.姓名 || '主角'}`);
                } else {
                    setAnchorExtractStage('error');
                    setAnchorExtractMessage('角色锚点提取失败：未返回有效内容。');
                }
            } catch (error: any) {
                const message = typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : '角色锚点提取失败。';
                setAnchorExtractStage('error');
                setAnchorExtractMessage(message);
                throw error;
            }
        });
    };

    const handleSaveAnchor = async () => {
        if (!onSavePlayerAnchor || !anchorDraft) return;
        await runAction(`save_player_anchor_${anchorDraft.id || 'new'}`, async () => {
            const saved = await onSavePlayerAnchor({
                ...anchorDraft,
                npcId: anchorDraft.npcId || 主角锚点绑定ID,
                名称: (anchorDraft.名称 || '').trim() || `${character?.姓名 || '主角'} 角色锚点`,
                正面提示词: (anchorDraft.正面提示词 || '').trim(),
                负面提示词: (anchorDraft.负面提示词 || '').trim(),
                updatedAt: Date.now()
            });
            if (saved && 'id' in saved && saved.id) {
                setAnchorDraft({ ...saved });
            }
        });
    };

    const handleDeleteAnchor = async () => {
        const anchorId = anchorDraft?.id || playerAnchor?.id || '';
        if (!anchorId || !onDeletePlayerAnchor) return;
        await runAction(`delete_player_anchor_${anchorId}`, async () => {
            await onDeletePlayerAnchor(anchorId);
            setAnchorDraft(null);
            setAnchorExtractStage('idle');
            setAnchorExtractMessage('');
        });
    };

    return (
        <div className="fixed inset-0 z-[200] hidden md:flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="relative flex h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-wuxia-gold/30 bg-ink-black/95 shadow-[0_0_80px_rgba(0,0,0,0.9)]">
                <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,360px)_auto] items-center gap-3 border-b border-gray-800/60 bg-black/40 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)_minmax(40px,1fr)] lg:gap-4 lg:px-6">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold tracking-[0.25em] text-wuxia-gold">角色档案</h3>
                        <div className="mt-1 text-[11px] text-gray-500">主角信息与影像档案</div>
                    </div>

                    <div className="w-full min-w-0 max-w-[360px]">
                        <div className="mx-auto flex w-full items-center justify-center gap-2 rounded-2xl border border-wuxia-gold/15 bg-black/35 p-1.5">
                            <button type="button" onClick={() => setActiveTab('profile')} className={标签按钮样式(activeTab === 'profile')}>档案</button>
                            <button type="button" onClick={() => setActiveTab('skills')} className={标签按钮样式(activeTab === 'skills')}>技艺</button>
                            <button type="button" onClick={() => setActiveTab('image')} className={标签按钮样式(activeTab === 'image')}>生图</button>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-black/50 text-gray-400 transition-all hover:border-wuxia-red hover:text-wuxia-red"
                            title="关闭"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(120,90,30,0.08),transparent_35%)] p-5 custom-scrollbar md:p-6">
                    {activeTab === 'profile' ? (
                        <div className="flex justify-center">
                            <CharacterProfileCard
                                character={character}
                                visualConfig={visualConfig}
                                openingConfig={openingConfig}
                                onAllocateAttributePoint={onAllocateAttributePoint}
                            />
                        </div>
                    ) : activeTab === 'skills' ? (
                        <div className="mx-auto w-full max-w-6xl space-y-5">
                            <section className="rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(20,16,12,0.96),rgba(8,8,8,0.96))] p-5 shadow-[0_0_35px_rgba(0,0,0,0.45)]">
                                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-wuxia-gold/10 pb-4">
                                    <div>
                                        <div className="text-sm font-bold tracking-[0.26em] text-wuxia-gold">主角技艺面板</div>
                                        <div className="mt-1 text-[11px] text-gray-500">医术、毒术、机关、采集、鉴定等生活与江湖技艺会在这里集中显示。</div>
                                    </div>
                                    <div className="rounded-full border border-wuxia-gold/20 bg-black/35 px-3 py-1 text-xs text-wuxia-gold/80">共 {skills.length} 项</div>
                                </div>

                                {skills.length > 0 ? (
                                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {skills.map((skill: any, index: number) => {
                                            const name = String(skill?.名称 || '未命名技艺').trim();
                                            const level = String(skill?.等级 || '未入门').trim();
                                            const progress = Math.max(0, Math.min(100, Number(skill?.熟练度 || 0)));
                                            return (
                                                <div key={`${name}-${index}`} className="rounded-xl border border-gray-800 bg-black/35 p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-base font-semibold tracking-[0.12em] text-gray-100">{name}</div>
                                                            <div className={`mt-1 text-xs ${获取技艺等级颜色(level)}`}>{level}</div>
                                                        </div>
                                                        <div className="shrink-0 rounded-full border border-wuxia-gold/20 bg-wuxia-gold/10 px-2 py-1 font-mono text-[11px] text-wuxia-gold">{progress}/100</div>
                                                    </div>
                                                    <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/5 bg-black/70">
                                                        <div className="h-full bg-gradient-to-r from-wuxia-gold/55 to-wuxia-gold transition-all" style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <p className="mt-3 min-h-[44px] text-xs leading-6 text-gray-400">{skill?.描述 || '尚未形成稳定技艺。'}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="mt-5 rounded-xl border border-dashed border-gray-700 bg-black/25 px-4 py-10 text-center text-sm text-gray-500">
                                        尚无技艺记录。开局或剧情学习后会自动写入这里。
                                    </div>
                                )}
                            </section>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <section className="rounded-2xl border border-wuxia-gold/15 bg-black/30 p-4 shadow-[0_0_24px_rgba(0,0,0,0.35)]">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-xl border border-gray-800/80 bg-black/35 px-4 py-3">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500">影像总数</div>
                                        <div className="mt-1 text-base font-semibold text-wuxia-gold">{history.length} 张</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-800/80 bg-black/35 px-4 py-3">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500">头像绑定</div>
                                        <div className="mt-1 text-sm text-gray-200">{selectedAvatarId ? '已设置' : '未设置'}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-800/80 bg-black/35 px-4 py-3">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500">立绘绑定</div>
                                        <div className="mt-1 text-sm text-gray-200">{selectedPortraitId ? '已设置' : '未设置'}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-800/80 bg-black/35 px-4 py-3">
                                        <div className="text-[10px] tracking-[0.2em] text-gray-500">角色锚点</div>
                                        <div className="mt-1 text-sm text-gray-200">{playerAnchor?.名称 ? playerAnchor.名称 : '未建立'}</div>
                                    </div>
                                </div>
                            </section>

                            <div className="grid gap-6 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                                <div className="space-y-5">
                                <section className="rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(20,16,12,0.96),rgba(8,8,8,0.96))] p-5 shadow-[0_0_35px_rgba(0,0,0,0.45)]">
                                    <div className="border-b border-wuxia-gold/10 pb-4">
                                        <div className="text-sm font-bold tracking-[0.2em] text-wuxia-gold">主角生图</div>
                                        <div className="mt-1 text-[11px] text-gray-500">主角影像独立管理，预设选择与自定义画师串可叠加使用。</div>
                                    </div>

                                    <div className="mt-4 space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">构图</div>
                                                <select value={generateOptions.构图 || '半身'} onChange={(e) => 更新生图选项('构图', e.target.value as 主角生图选项['构图'])} className={输入框样式}>
                                                    <option value="头像">头像</option>
                                                    <option value="半身">半身</option>
                                                    <option value="立绘">立绘</option>
                                                </select>
                                            </div>
                                            <div>
                                                <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">画风</div>
                                                <select value={generateOptions.画风 || '二次元'} onChange={(e) => 更新生图选项('画风', e.target.value as 主角生图选项['画风'])} className={输入框样式}>
                                                    <option value="通用">通用</option>
                                                    <option value="二次元">二次元</option>
                                                    <option value="写实">写实</option>
                                                    <option value="国风">国风</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">画师串预设</div>
                                            <select value={generateOptions.画师串预设ID || ''} onChange={(e) => 更新生图选项('画师串预设ID', e.target.value)} className={输入框样式}>
                                                <option value="">不使用</option>
                                                {artistPresets.map((preset) => (
                                                    <option key={preset.id} value={preset.id}>{读取预设名称(preset)}</option>
                                                ))}
                                            </select>
                                            {selectedArtistPreset && (
                                                <div className="mt-2 rounded-xl border border-gray-800 bg-black/30 px-3 py-2 text-[11px] leading-5 text-gray-400">
                                                    {selectedArtistPreset.画师串 || selectedArtistPreset.正面提示词 || '当前预设未记录具体内容'}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">PNG 画风 / PNG 画师串</div>
                                            <select value={generateOptions.PNG画风预设ID || ''} onChange={(e) => 更新生图选项('PNG画风预设ID', e.target.value)} className={输入框样式}>
                                                <option value="">不使用</option>
                                                {pngStylePresets.map((preset) => (
                                                    <option key={preset.id} value={preset.id}>{读取预设名称(preset)}</option>
                                                ))}
                                            </select>
                                            {selectedPngPreset && (
                                                <div className="mt-2 rounded-xl border border-gray-800 bg-black/30 px-3 py-2 text-[11px] leading-5 text-gray-400">
                                                    {selectedPngPreset.画师串 || selectedPngPreset.正面提示词 || '当前 PNG 预设未记录可复用内容'}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">自定义画师串</div>
                                            <textarea
                                                value={generateOptions.画师串 || ''}
                                                onChange={(e) => 更新生图选项('画师串', e.target.value)}
                                                placeholder="可补充特定画师串、材质、笔触或渲染描述"
                                                className={文本域样式}
                                            />
                                        </div>

                                        <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
                                            <div>
                                                <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">额外要求</div>
                                                <textarea
                                                    value={generateOptions.额外要求 || ''}
                                                    onChange={(e) => 更新生图选项('额外要求', e.target.value)}
                                                    placeholder="例如：强调发饰、衣料、站姿、表情或光影氛围"
                                                    className={文本域样式}
                                                />
                                            </div>
                                            <div>
                                                <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">尺寸</div>
                                                <input
                                                    type="text"
                                                    value={generateOptions.尺寸 || ''}
                                                    onChange={(e) => 更新生图选项('尺寸', e.target.value)}
                                                    placeholder="如 832x1216"
                                                    className={输入框样式}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => void handleGenerate()}
                                            disabled={!onGeneratePlayerImage || Boolean(busyAction)}
                                            className="w-full rounded-xl border border-wuxia-gold/25 bg-wuxia-gold/10 px-4 py-3 text-sm tracking-[0.2em] text-wuxia-gold transition-all hover:border-wuxia-gold hover:bg-wuxia-gold/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {busyAction.startsWith('generate_') ? '生成中...' : `生成${generateOptions.构图 || '主角影像'}`}
                                        </button>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(20,16,12,0.96),rgba(8,8,8,0.96))] p-5 shadow-[0_0_35px_rgba(0,0,0,0.45)]">
                                    <div className="border-b border-wuxia-gold/10 pb-4">
                                        <div className="text-sm font-bold tracking-[0.2em] text-wuxia-gold">主角角色锚点</div>
                                        <div className="mt-1 text-[11px] text-gray-500">可直接查看、编辑、删除锚点，也可重新 AI 提取。</div>
                                    </div>

                                    <div className="mt-4 space-y-4">
                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">提取附加要求</div>
                                            <input
                                                type="text"
                                                value={anchorExtractRequirement}
                                                onChange={(e) => setAnchorExtractRequirement(e.target.value)}
                                                placeholder="例如：突出发色、瞳色、衣着层次、体型比例"
                                                className={输入框样式}
                                            />
                                        </div>

                                        {anchorExtractMessage && (
                                            <div className={`rounded-xl border px-3 py-2 text-[11px] ${
                                                anchorExtractStage === 'error'
                                                    ? 'border-red-900/40 bg-red-950/20 text-red-300'
                                                    : anchorExtractStage === 'done'
                                                        ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-300'
                                                        : 'border-wuxia-gold/20 bg-black/30 text-wuxia-gold/80'
                                            }`}>
                                                {anchorExtractMessage}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => void handleExtractAnchor()} disabled={!onExtractPlayerAnchor || Boolean(busyAction)} className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 px-3 py-2 text-xs tracking-[0.2em] text-cyan-100 transition-all hover:border-cyan-500 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                                                {busyAction === 'extract_player_anchor' ? '提取中...' : 'AI 提取锚点'}
                                            </button>
                                            <button type="button" onClick={() => void handleSaveAnchor()} disabled={!onSavePlayerAnchor || !anchorDraft || Boolean(busyAction)} className="rounded-lg border border-wuxia-gold/20 bg-black/35 px-3 py-2 text-xs tracking-[0.2em] text-gray-200 transition-all hover:border-wuxia-gold hover:text-wuxia-gold disabled:cursor-not-allowed disabled:opacity-50">
                                                保存锚点
                                            </button>
                                            <button type="button" onClick={() => void handleDeleteAnchor()} disabled={!onDeletePlayerAnchor || !(anchorDraft?.id || playerAnchor?.id) || Boolean(busyAction)} className="rounded-lg border border-wuxia-red/25 bg-black/35 px-3 py-2 text-xs tracking-[0.2em] text-gray-300 transition-all hover:border-wuxia-red hover:text-wuxia-red disabled:cursor-not-allowed disabled:opacity-50">
                                                删除锚点
                                            </button>
                                        </div>

                                        {anchorDraft ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">锚点名称</div>
                                                    <input
                                                        type="text"
                                                        value={anchorDraft.名称 || ''}
                                                        onChange={(e) => setAnchorDraft((prev) => prev ? { ...prev, 名称: e.target.value } : prev)}
                                                        className={输入框样式}
                                                    />
                                                </div>

                                                <div className="grid gap-2">
                                                    <div className="rounded-xl border border-gray-800 bg-black/30 px-3 py-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-[11px] text-gray-400">启用锚点</div>
                                                            <ToggleSwitch checked={anchorDraft.是否启用 !== false} onChange={(next) => setAnchorDraft((prev) => prev ? { ...prev, 是否启用: next } : prev)} ariaLabel="切换主角锚点启用" />
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl border border-gray-800 bg-black/30 px-3 py-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-[11px] text-gray-400">生图默认附加</div>
                                                            <ToggleSwitch checked={anchorDraft.生成时默认附加 === true} onChange={(next) => setAnchorDraft((prev) => prev ? { ...prev, 生成时默认附加: next } : prev)} ariaLabel="切换主角锚点默认附加" />
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl border border-gray-800 bg-black/30 px-3 py-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-[11px] text-gray-400">场景生图自动注入</div>
                                                            <ToggleSwitch checked={anchorDraft.场景生图自动注入 === true} onChange={(next) => setAnchorDraft((prev) => prev ? { ...prev, 场景生图自动注入: next } : prev)} ariaLabel="切换场景生图自动注入" />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">正面提示词</div>
                                                    <textarea
                                                        value={anchorDraft.正面提示词 || ''}
                                                        onChange={(e) => setAnchorDraft((prev) => prev ? { ...prev, 正面提示词: e.target.value } : prev)}
                                                        className={文本域样式}
                                                    />
                                                </div>

                                                <div>
                                                    <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">负面提示词</div>
                                                    <textarea
                                                        value={anchorDraft.负面提示词 || ''}
                                                        onChange={(e) => setAnchorDraft((prev) => prev ? { ...prev, 负面提示词: e.target.value } : prev)}
                                                        className={`${输入框样式} min-h-[72px] resize-y`}
                                                    />
                                                </div>

                                                <div className="rounded-xl border border-gray-800 bg-black/30 p-3 text-[11px] leading-5 text-gray-400 whitespace-pre-wrap break-words">
                                                    {读取角色锚点特征摘要(anchorDraft)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-dashed border-gray-700 bg-black/25 px-4 py-8 text-center text-sm text-gray-500">
                                                还没有主角锚点。可直接 AI 提取后再手动微调。
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                            <section className="min-h-0 rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(20,16,12,0.96),rgba(8,8,8,0.96))] p-5 shadow-[0_0_35px_rgba(0,0,0,0.45)]">
                                <div className="flex items-start justify-between gap-3 border-b border-wuxia-gold/10 pb-4">
                                    <div>
                                        <div className="text-sm font-bold tracking-[0.2em] text-wuxia-gold">主角影像档案</div>
                                        <div className="mt-1 text-[11px] text-gray-500">
                                            已存 {history.length} 张
                                            {playerAnchor?.名称 ? ` · 当前锚点：${playerAnchor.名称}` : ' · 当前锚点：未建立'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap justify-end">
                                        {onUploadPlayerAvatar && (
                                            <button
                                                type="button"
                                                onClick={() => avatarUploadInputRef.current?.click()}
                                                className="rounded-full border border-wuxia-gold/30 px-3 py-1 text-[11px] text-wuxia-gold/80 transition-colors hover:border-wuxia-gold hover:text-wuxia-gold"
                                            >
                                                上传头像
                                            </button>
                                        )}
                                        {onUploadPlayerPortrait && (
                                            <button
                                                type="button"
                                                onClick={() => portraitUploadInputRef.current?.click()}
                                                className="rounded-full border border-wuxia-gold/30 px-3 py-1 text-[11px] text-wuxia-gold/80 transition-colors hover:border-wuxia-gold hover:text-wuxia-gold"
                                            >
                                                上传立绘
                                            </button>
                                        )}
                                        {selectedAvatarId && (
                                            <button
                                                type="button"
                                                onClick={() => onClearPlayerAvatarImage?.()}
                                                className="rounded-full border border-gray-700 px-3 py-1 text-[11px] text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red"
                                            >
                                                清空头像
                                            </button>
                                        )}
                                        {selectedPortraitId && (
                                            <button
                                                type="button"
                                                onClick={() => onClearPlayerPortraitImage?.()}
                                                className="rounded-full border border-gray-700 px-3 py-1 text-[11px] text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red"
                                            >
                                                清空立绘
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <input
                                    ref={avatarUploadInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleUploadFile(e, onUploadPlayerAvatar)}
                                />
                                <input
                                    ref={portraitUploadInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleUploadFile(e, onUploadPlayerPortrait)}
                                />

                                {history.length > 0 ? (
                                    <div className="mt-4 grid gap-4 max-h-[calc(88vh-260px)] overflow-y-auto pr-1 custom-scrollbar xl:grid-cols-2">
                                        {history.map((item: any) => {
                                            const imageUrl = 获取图片展示地址(item);
                                            const imageId = typeof item?.id === 'string' ? item.id.trim() : '';
                                            const isAvatar = Boolean(imageId) && imageId === selectedAvatarId;
                                            const isPortrait = Boolean(imageId) && imageId === selectedPortraitId;
                                            const canUseAsAvatar = item?.构图 === '头像' && item?.状态 === 'success' && Boolean(imageUrl);
                                            const canUseAsPortrait = (item?.构图 === '半身' || item?.构图 === '立绘') && item?.图片用途 !== '背景' && item?.状态 === 'success' && Boolean(imageUrl);

                                            return (
                                                <div key={imageId || `${item?.构图 || 'image'}_${item?.生成时间 || 0}`} className="overflow-hidden rounded-xl border border-gray-800 bg-black/35">
                                                    <div className="relative h-56 bg-black">
                                                        {imageUrl ? (
                                                            <img src={imageUrl} alt={`${character.姓名 || '主角'}${item?.构图 || '影像'}`} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center text-sm text-gray-600">暂无可展示图片</div>
                                                        )}
                                                        <div className="absolute left-2 top-2 rounded-full border border-black/30 bg-black/65 px-2 py-1 text-[11px] text-wuxia-gold">{item?.构图 || '未分类'}</div>
                                                        {isAvatar && <div className="absolute right-2 top-2 rounded-full border border-wuxia-gold/35 bg-black/70 px-2 py-1 text-[11px] text-wuxia-gold">当前头像</div>}
                                                        {!isAvatar && isPortrait && <div className="absolute right-2 top-2 rounded-full border border-wuxia-gold/35 bg-black/70 px-2 py-1 text-[11px] text-wuxia-gold">当前立绘</div>}
                                                    </div>

                                                    <div className="space-y-3 p-3">
                                                        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                                                            <div>{item?.使用模型 || '未记录模型'}</div>
                                                            <div className="text-right">{item?.状态 === 'success' ? '成功' : item?.状态 === 'failed' ? '失败' : '处理中'}</div>
                                                            <div>{item?.画风 || '未记录画风'}</div>
                                                            <div className="text-right">{格式化时间(item?.生成时间)}</div>
                                                        </div>

                                                        {(item?.尺寸 || item?.画师串) && (
                                                            <div className="rounded-lg border border-gray-800 bg-black/25 px-3 py-2 text-[11px] leading-5 text-gray-400">
                                                                {item?.尺寸 ? <div>尺寸：{item.尺寸}</div> : null}
                                                                {item?.画师串 ? <div className="line-clamp-3 break-words">画师串：{item.画师串}</div> : null}
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-3 gap-2">
                                                            <button type="button" disabled={!canUseAsAvatar} onClick={() => imageId && onSelectPlayerAvatarImage?.(imageId)} className={`rounded-lg border px-3 py-2 text-xs transition-colors ${isAvatar ? 'border-wuxia-gold/40 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-700 bg-black/40 text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold'} disabled:cursor-not-allowed disabled:opacity-40`}>
                                                                {isAvatar ? '当前头像' : '设为头像'}
                                                            </button>
                                                            <button type="button" disabled={!canUseAsPortrait} onClick={() => imageId && onSelectPlayerPortraitImage?.(imageId)} className={`rounded-lg border px-3 py-2 text-xs transition-colors ${isPortrait ? 'border-wuxia-gold/40 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-700 bg-black/40 text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold'} disabled:cursor-not-allowed disabled:opacity-40`}>
                                                                {isPortrait ? '当前立绘' : '设为立绘'}
                                                            </button>
                                                            <button type="button" disabled={!imageId} onClick={() => imageId && onRemovePlayerImageRecord?.(imageId)} className="rounded-lg border border-wuxia-red/20 bg-black/40 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red disabled:cursor-not-allowed disabled:opacity-40">
                                                                删除
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-xl border border-dashed border-gray-700 bg-black/25 px-4 py-10 text-center text-sm text-gray-500">
                                        还没有主角生图记录。生成头像、半身或立绘后，会直接写入这里并支持删除、切换头像与立绘。
                                    </div>
                                )}
                            </section>

                            {主角展示香闺秘档 && 主角香闺部位列表.length > 0 && (
                                <section className="min-h-0 rounded-2xl border border-pink-500/20 bg-[linear-gradient(180deg,rgba(20,12,16,0.96),rgba(8,8,8,0.96))] p-5 shadow-[0_0_35px_rgba(0,0,0,0.45)]">
                                    <div className="flex items-start justify-between gap-3 border-b border-pink-500/10 pb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-bold tracking-[0.2em] text-pink-300">香闺秘档</div>
                                                <span className="rounded-full border border-pink-400/30 bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold tracking-[0.15em] text-pink-300/80">TOP SECRET</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-gray-500">主角私密部位档案</div>
                                        </div>
                                    </div>

                                    {/* 初夜记录 */}
                                    {(character as any)?.初夜夺取者 && (
                                        <div className="mt-4 mb-4 p-4 bg-gradient-to-r from-pink-950/80 to-black border border-pink-500/40 rounded-lg relative overflow-hidden">
                                            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-wuxia-gold/5 blur-xl"></div>
                                            <div className="relative z-10 flex flex-col">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/80"></div>
                                                    <div className="text-[10px] text-pink-300/80 tracking-widest uppercase">铭心刻骨 · 初夜</div>
                                                </div>
                                                <div className="font-serif text-pink-100 text-sm flex items-end gap-2 flex-wrap">
                                                    {(character as any)?.初夜时间 && (
                                                        <span className="text-wuxia-gold/80 text-xs font-mono bg-wuxia-gold/10 px-1 rounded border border-wuxia-gold/20 mr-1">{(character as any).初夜时间}</span>
                                                    )}
                                                    <span>交给</span>
                                                    <span className="text-wuxia-gold font-bold text-lg drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]">{(character as any).初夜夺取者}</span>
                                                    {(character as any)?.初夜描述 && (
                                                        <span title={(character as any).初夜描述} className="cursor-help rounded border border-pink-500/30 px-1.5 py-0.5 text-[10px] text-pink-200/80">详情</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 首次亲密记录 */}
                                    {Array.isArray((character as any)?.首次亲密记录) && (character as any).首次亲密记录.length > 0 && (
                                        <div className="mt-4 mb-4 space-y-2">
                                            <div className="text-[10px] text-pink-500/60 uppercase tracking-widest flex items-center gap-2">
                                                <span className="h-px flex-1 bg-pink-900/30"></span>
                                                首次亲密记录
                                                <span className="h-px flex-1 bg-pink-900/30"></span>
                                            </div>
                                            {(character as any).首次亲密记录.map((rec: any, idx: number) => (
                                                <div key={idx} className="bg-black/40 p-3 rounded border border-pink-900/20 text-xs hover:border-pink-900/40 transition-colors">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-pink-400 font-bold">{rec?.类型 || '亲密'}</span>
                                                        <span className="text-wuxia-gold/60 font-mono text-[10px]">{rec?.时间 || ''}</span>
                                                        {rec?.对象 && <span className="text-pink-200/80">对象：{rec.对象}</span>}
                                                    </div>
                                                    {rec?.描述 && <div className="text-pink-100/80 font-serif leading-relaxed">{rec.描述}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-4 grid grid-cols-3 gap-3">
                                        {主角香闺部位列表.map((item) => {
                                            const partArchive = archive?.香闺秘档部位档案?.[item.key as keyof typeof archive.香闺秘档部位档案];
                                            const imageUrl = partArchive ? 获取图片展示地址(partArchive as any) : '';
                                            const hasImage = Boolean(imageUrl);
                                            // 名器档案
                                            const 名器 = Array.isArray((character as any)?.名器档案)
                                                ? (character as any).名器档案.find((m: any) => m?.部位 === item.key)
                                                : undefined;

                                            return (
                                                <div key={item.key} className="overflow-hidden rounded-xl border border-pink-500/15 bg-black/35">
                                                    <div className="relative h-36 bg-black">
                                                        {hasImage ? (
                                                            <img src={imageUrl} alt={`${character.姓名}${item.label}`} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center text-xs text-gray-600">暂无图片</div>
                                                        )}
                                                        <div className="absolute left-2 top-2 rounded-full border border-pink-400/25 bg-black/65 px-2 py-0.5 text-[10px] text-pink-300">{item.label}</div>
                                                    </div>
                                                    <div className="p-2.5">
                                                        {/* 名器标签 */}
                                                        {名器 && 名器.名称 && 名器.名称 !== '无名器' && 名器.名称 !== '无对应名器' && (
                                                            <div className="mb-1.5 flex items-center gap-1 flex-wrap">
                                                                <span className="text-[9px] px-1 py-0.5 rounded border border-pink-500/30 bg-pink-500/10 text-pink-300">{名器.名称}</span>
                                                                {名器.品质 && 名器.品质 !== '无' && (
                                                                    <span className={`text-[8px] px-1 py-0.5 rounded border ${
                                                                        名器.品质 === '传说' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300' :
                                                                        名器.品质 === '极品' ? 'border-purple-500/40 bg-purple-500/10 text-purple-300' :
                                                                        名器.品质 === '稀有' ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' :
                                                                        'border-gray-600/40 bg-gray-600/10 text-gray-400'
                                                                    }`}>{名器.品质}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="line-clamp-3 text-[11px] leading-5 text-gray-400">{item.text}</div>
                                                        <button
                                                            type="button"
                                                            onClick={() => onGeneratePlayerSecretPartImage?.(item.key)}
                                                            className="mt-2 w-full rounded-lg border border-pink-500/25 bg-pink-500/8 px-2 py-1.5 text-[10px] text-pink-200 transition-colors hover:border-pink-400/40 hover:bg-pink-500/15"
                                                        >
                                                            {hasImage ? '重新生成' : '生成图片'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* 性癖 & 敏感点 */}
                                    {((character as any)?.性癖 || (character as any)?.敏感点) && (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {(character as any)?.性癖 && (
                                                <span className="rounded-full border border-pink-500/20 bg-pink-500/8 px-2.5 py-1 text-[10px] text-pink-200/80">性癖：{(character as any).性癖}</span>
                                            )}
                                            {(character as any)?.敏感点 && (
                                                <span className="rounded-full border border-pink-500/20 bg-pink-500/8 px-2.5 py-1 text-[10px] text-pink-200/80">敏感点：{(character as any).敏感点}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* 子宫档案（女性/扶她主角） */}
                                    {!主角是男性纯 && (character as any)?.子宫 && (
                                        <div className="mt-4 bg-gradient-to-br from-pink-950/20 to-black/80 border border-pink-900/30 rounded-lg p-4 relative overflow-hidden">
                                            <div className="absolute -top-6 -right-6 w-24 h-24 bg-pink-600/5 rounded-full filter blur-xl"></div>
                                            <div className="flex items-center justify-between mb-3 relative z-10">
                                                <h5 className="text-xs text-pink-400/90 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                    <span className="w-1 h-3 bg-pink-500/70 rounded-full"></span>
                                                    子宫档案
                                                </h5>
                                                <span className="text-[10px] bg-black/60 border border-pink-900/50 px-1.5 py-0.5 rounded text-pink-300 font-mono shadow-inner tracking-wider">
                                                    STATUS: {(character as any).子宫?.状态 || 'UNKNOWN'}
                                                </span>
                                            </div>

                                            <div className="mb-4 text-xs text-gray-400/80 flex items-center gap-2 bg-black/40 p-2 rounded border border-white/5 relative z-10">
                                                <span className="shrink-0 text-pink-500/50">宫口状态</span>
                                                <span className="text-pink-200 font-serif">{(character as any).子宫?.宫口状态 || '紧闭'}</span>
                                            </div>

                                            <div className="relative z-10">
                                                <h6 className="text-[9px] text-pink-500/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                    <span className="h-px flex-1 bg-pink-900/30"></span>
                                                    内射记录
                                                    <span className="h-px flex-1 bg-pink-900/30"></span>
                                                </h6>
                                                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                                    {Array.isArray((character as any).子宫?.内射记录) && (character as any).子宫.内射记录.length > 0 ? (
                                                        (character as any).子宫.内射记录.map((rec: any, idx: number) => (
                                                            <div key={idx} className="bg-black/60 p-2.5 rounded border border-pink-900/20 text-xs hover:border-pink-900/40 transition-colors">
                                                                <div className="text-wuxia-gold/80 font-mono text-[10px] mb-1">[{rec?.日期 || ''}]</div>
                                                                <div className="text-pink-100/90 font-serif leading-relaxed mb-1.5">{rec?.描述 || ''}</div>
                                                                {rec?.怀孕判定日 && (
                                                                    <div className="text-[9px] text-pink-400/60 flex items-center gap-1 pt-1 border-t border-pink-900/20">
                                                                        孕检期: {rec.怀孕判定日}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center py-4 bg-black/20 rounded border border-dashed border-white/5">
                                                            <span className="text-[10px] text-gray-600 font-mono tracking-widest">NO RECORDS</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}
                        </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CharacterModal;
