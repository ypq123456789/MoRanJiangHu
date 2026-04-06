import React from 'react';
import {
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
    apiConfig?: 接口设置结构;
    playerAnchor?: 角色锚点结构 | null;
    onGeneratePlayerImage?: (options?: 主角生图选项) => Promise<void> | void;
    onExtractPlayerAnchor?: (options?: { 名称?: string; 额外要求?: string }) => Promise<角色锚点结构 | null | void> | 角色锚点结构 | null | void;
    onSavePlayerAnchor?: (anchor: 角色锚点结构) => Promise<角色锚点结构 | null | void> | 角色锚点结构 | null | void;
    onDeletePlayerAnchor?: (anchorId: string) => Promise<void> | void;
    onSelectPlayerAvatarImage?: (imageId: string) => void;
    onClearPlayerAvatarImage?: () => void;
    onSelectPlayerPortraitImage?: (imageId: string) => void;
    onClearPlayerPortraitImage?: () => void;
    onRemovePlayerImageRecord?: (imageId: string) => void;
}

type 页面标签 = 'image' | 'profile';

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

const 标签按钮样式 = (active: boolean): string => `inline-flex min-w-[128px] flex-1 items-center justify-center rounded-xl border px-5 py-2.5 text-sm tracking-[0.22em] transition-all ${
    active
        ? 'border-wuxia-gold/60 bg-wuxia-gold/12 text-wuxia-gold shadow-[0_0_18px_rgba(212,175,55,0.15)]'
        : 'border-gray-800 bg-black/35 text-gray-400 hover:border-wuxia-gold/35 hover:text-wuxia-gold/80'
}`;

const CharacterModal: React.FC<Props> = ({
    character,
    onClose,
    visualConfig,
    apiConfig,
    playerAnchor,
    onGeneratePlayerImage,
    onExtractPlayerAnchor,
    onSavePlayerAnchor,
    onDeletePlayerAnchor,
    onSelectPlayerAvatarImage,
    onClearPlayerAvatarImage,
    onSelectPlayerPortraitImage,
    onClearPlayerPortraitImage,
    onRemovePlayerImageRecord
}) => {
    const [activeTab, setActiveTab] = React.useState<页面标签>('image');
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
            await onGeneratePlayerImage({
                构图: generateOptions.构图,
                画风: generateOptions.画风,
                画师串: (generateOptions.画师串 || '').trim() || undefined,
                画师串预设ID: (generateOptions.画师串预设ID || '').trim() || undefined,
                PNG画风预设ID: (generateOptions.PNG画风预设ID || '').trim() || undefined,
                额外要求: (generateOptions.额外要求 || '').trim() || undefined,
                尺寸: (generateOptions.尺寸 || '').trim() || undefined
            });
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
                <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-gray-800/60 bg-black/40 px-6 py-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold tracking-[0.25em] text-wuxia-gold">角色档案</h3>
                        <div className="mt-1 text-[11px] text-gray-500">主角信息与影像档案</div>
                    </div>

                    <div className="w-full max-w-[360px]">
                        <div className="mx-auto flex w-full items-center justify-center gap-2 rounded-2xl border border-wuxia-gold/15 bg-black/35 p-1.5">
                            <button type="button" onClick={() => setActiveTab('image')} className={标签按钮样式(activeTab === 'image')}>主角生图</button>
                            <button type="button" onClick={() => setActiveTab('profile')} className={标签按钮样式(activeTab === 'profile')}>档案</button>
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
                            <CharacterProfileCard character={character} visualConfig={visualConfig} />
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
                                    <div className="flex gap-2">
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

                                {history.length > 0 ? (
                                    <div className="mt-4 grid gap-4 max-h-[calc(88vh-260px)] overflow-y-auto pr-1 custom-scrollbar xl:grid-cols-2">
                                        {history.map((item: any) => {
                                            const imageUrl = 获取图片展示地址(item);
                                            const imageId = typeof item?.id === 'string' ? item.id.trim() : '';
                                            const isAvatar = Boolean(imageId) && imageId === selectedAvatarId;
                                            const isPortrait = Boolean(imageId) && imageId === selectedPortraitId;
                                            const canUseAsAvatar = item?.构图 === '头像' && item?.状态 === 'success' && Boolean(imageUrl);
                                            const canUseAsPortrait = (item?.构图 === '半身' || item?.构图 === '立绘') && item?.状态 === 'success' && Boolean(imageUrl);

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
                        </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CharacterModal;
