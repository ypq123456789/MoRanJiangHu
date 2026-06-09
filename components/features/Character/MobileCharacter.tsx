import React, { useMemo, useState } from 'react';
import {
    角色数据结构,
    游戏设置结构,
    接口设置结构,
    OpeningConfig,
    角色锚点结构,
    画师串预设结构,
    PNG画风预设结构
} from '../../../types';
import { 构建角色身份摘要 } from './identitySummary';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import { 获取图片展示地址 } from '../../../utils/imageAssets';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import { 计算角色总气血 } from '../../../utils/characterVitals';
import { 获取世界观货币卡片信息, 获取角色金钱显示列表 } from '../../../utils/currencyDisplay';
import { 读取可分配属性点, type 可分配六维属性键 } from '../../../utils/characterAttributePoints';
import { 获取题材资源文案 } from '../../../utils/resourceLabels';

interface Props {
    character: 角色数据结构;
    gameConfig?: 游戏设置结构;
    openingConfig?: OpeningConfig;
    apiConfig?: 接口设置结构;
    playerAnchor?: 角色锚点结构 | null;
    onGeneratePlayerImage?: (options?: 主角生图选项) => Promise<void> | void;
    onSelectPlayerAvatarImage?: (imageId: string) => void;
    onClearPlayerAvatarImage?: () => void;
    onSelectPlayerPortraitImage?: (imageId: string) => void;
    onClearPlayerPortraitImage?: () => void;
    onRemovePlayerImageRecord?: (imageId: string) => void;
    onAllocateAttributePoint?: (key: 可分配六维属性键) => void;
    onClose: () => void;
}

type 主角生图选项 = {
    构图?: '头像' | '半身' | '立绘';
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    额外要求?: string;
    尺寸?: string;
};

type MobileCharacterView = 'profile' | 'skills' | 'stats' | 'image';

const 输入框样式 = 'w-full rounded-xl border border-gray-800 bg-black/40 px-3 py-2.5 text-sm text-gray-200 outline-none transition-all focus:border-wuxia-gold/40';
const 文本域样式 = `${输入框样式} min-h-[84px] resize-y`;

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

const VitalBar: React.FC<{ label: string; current: number; max: number; color: string }> = ({ label, current, max, color: _color }) => {
    const pct = Math.min((current / (max || 1)) * 100, 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-500">
                <span>{label}</span>
                <span className="font-mono text-gray-300">{current}/{max}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full border border-gray-800 bg-gray-900">
                <div className="h-full bg-gradient-to-r from-wuxia-gold/70 via-wuxia-gold to-wuxia-gold/80" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const BodyRow: React.FC<{ name: string; current: number; max: number }> = ({ name, current, max }) => {
    const pct = Math.min((current / (max || 1)) * 100, 100);
    return (
        <div className="flex items-center gap-2">
            <span className="w-10 text-[10px] text-gray-400">{name}</span>
            <div className="flex-1 h-1.5 overflow-hidden rounded-full border border-gray-800 bg-gray-900">
                <div className="h-full bg-gradient-to-r from-wuxia-gold/70 via-wuxia-gold to-wuxia-gold/80" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-12 text-right font-mono text-[10px] text-gray-500">{current}/{max}</span>
        </div>
    );
};

const MobileStatCard: React.FC<{ label: string; value: string | number; accent?: boolean }> = ({ label, value, accent = false }) => (
    <div className="rounded-xl border border-gray-800 bg-black/25 px-3 py-2.5">
        <div className="text-[10px] tracking-[0.2em] text-gray-500">{label}</div>
        <div className={`mt-1 text-sm ${accent ? 'text-wuxia-gold' : 'text-gray-200'}`}>{value}</div>
    </div>
);

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

const MobileCharacter: React.FC<Props> = ({
    character,
    gameConfig,
    openingConfig,
    apiConfig,
    playerAnchor,
    onGeneratePlayerImage,
    onSelectPlayerAvatarImage,
    onClearPlayerAvatarImage,
    onSelectPlayerPortraitImage,
    onClearPlayerPortraitImage,
    onRemovePlayerImageRecord,
    onAllocateAttributePoint,
    onClose
}) => {
    use图片资源回源预取(character);
    const 总气血 = useMemo(() => 计算角色总气血(character), [character]);
    const 资源文案 = 获取题材资源文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const [activeView, setActiveView] = useState<MobileCharacterView>('profile');
    const [busyAction, setBusyAction] = useState('');
    const [generateOptions, setGenerateOptions] = useState<主角生图选项>({
        构图: '头像',
        画风: '二次元',
        画师串: '',
        画师串预设ID: '',
        PNG画风预设ID: '',
        额外要求: '',
        尺寸: ''
    });
    const 金钱 = character.金钱 || { 金元宝: 0, 银子: 0, 铜钱: 0 };
    const 钱财显示列表 = 获取角色金钱显示列表(金钱, openingConfig, character);
    const 货币卡片 = 获取世界观货币卡片信息(openingConfig, character);
    const 玩家BUFF列表 = Array.isArray(character.玩家BUFF) ? character.玩家BUFF : [];
    const 天赋列表 = Array.isArray(character.天赋列表) ? character.天赋列表 : [];
    const 技艺列表 = useMemo(
        () => (Array.isArray((character as any)?.技艺) ? [...(character as any).技艺] : [])
            .filter((item) => item && typeof item === 'object')
            .sort((a, b) => {
                const levelDiff = 获取技艺等级索引(b?.等级) - 获取技艺等级索引(a?.等级);
                if (levelDiff !== 0) return levelDiff;
                return Number(b?.熟练度 || 0) - Number(a?.熟练度 || 0);
            }),
        [character]
    );
    const 启用饱腹口渴系统 = gameConfig?.启用饱腹口渴系统 !== false;
    const 启用修炼体系 = gameConfig?.启用修炼体系 !== false;
    const 身份信息 = useMemo(() => 构建角色身份摘要(character), [character]);
    const normalizedApiConfig = useMemo(() => 规范化接口设置(apiConfig), [apiConfig]);
    const feature = normalizedApiConfig.功能模型占位;
    const artistPresets = useMemo<画师串预设结构[]>(
        () => (Array.isArray(feature?.画师串预设列表) ? feature.画师串预设列表 : []).filter(
            (item) => item && !String(item.id || '').startsWith('png_artist_') && (item.适用范围 === 'npc' || item.适用范围 === 'all')
        ),
        [feature?.画师串预设列表]
    );
    const pngStylePresets = useMemo<PNG画风预设结构[]>(
        () => (Array.isArray(feature?.PNG画风预设列表) ? feature.PNG画风预设列表 : []).filter((item) => item && typeof item === 'object'),
        [feature?.PNG画风预设列表]
    );
    const archive = character?.图片档案;
    const history = useMemo(
        () => (Array.isArray(archive?.生图历史) ? archive.生图历史 : []).filter((item) => item && typeof item === 'object'),
        [archive]
    );
    const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
    const selectedPortraitId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
    const recentImageRecord = archive?.最近生图结果 && typeof archive.最近生图结果 === 'object' ? archive.最近生图结果 : null;
    const selectedAvatarRecord = history.find((item: any) => typeof item?.id === 'string' && item.id.trim() === selectedAvatarId)
        || (recentImageRecord?.id === selectedAvatarId ? recentImageRecord : null)
        || history.find((item: any) => item?.构图 === '头像' && item?.状态 === 'success')
        || (recentImageRecord?.构图 === '头像' && recentImageRecord?.状态 === 'success' ? recentImageRecord : null);
    const selectedPortraitRecord = history.find((item: any) => typeof item?.id === 'string' && item.id.trim() === selectedPortraitId) || null;
    const avatarUrl = 获取图片展示地址(selectedAvatarRecord) || character?.头像图片URL || '';
    const portraitUrl = 获取图片展示地址(selectedPortraitRecord) || '';
    const selectedArtistPreset = useMemo(
        () => artistPresets.find((item) => item.id === (generateOptions.画师串预设ID || '').trim()) || null,
        [artistPresets, generateOptions.画师串预设ID]
    );
    const selectedPngPreset = useMemo(
        () => pngStylePresets.find((item) => item.id === (generateOptions.PNG画风预设ID || '').trim()) || null,
        [pngStylePresets, generateOptions.PNG画风预设ID]
    );

    const 可用属性点 = 读取可分配属性点(character);
    const attributes: Array<{ key: string; attributeKey: 可分配六维属性键; val: number }> = [
        { key: '力', attributeKey: '力量', val: character.力量 },
        { key: '敏', attributeKey: '敏捷', val: character.敏捷 },
        { key: '体', attributeKey: '体质', val: character.体质 },
        { key: '根', attributeKey: '根骨', val: character.根骨 },
        { key: '悟', attributeKey: '悟性', val: character.悟性 },
        { key: '福', attributeKey: '福源', val: character.福源 },
    ];
    const 读取仙侠文本字段 = (key: string): string => {
        const value = (character as any)?.[key];
        return typeof value === 'string' ? value.trim() : '';
    };
    const 读取仙侠数字字段 = (key: string): number => {
        const value = Number((character as any)?.[key]);
        return Number.isFinite(value) ? value : 0;
    };
    const 仙侠档案字段 = [
        { label: '灵根', value: 读取仙侠文本字段('灵根') || '未记录', accent: true },
        { label: '灵根资质', value: 读取仙侠文本字段('灵根资质') || '未记录' },
        { label: '灵力', value: `${读取仙侠数字字段('当前灵力')}/${读取仙侠数字字段('最大灵力')}`, accent: true },
        { label: '神识', value: `${读取仙侠数字字段('当前神识')}/${读取仙侠数字字段('最大神识')}` },
        { label: '丹田状态', value: 读取仙侠文本字段('丹田状态') || '未记录' },
        { label: '道基状态', value: 读取仙侠文本字段('道基状态') || '未记录' },
        { label: '心魔值', value: 读取仙侠数字字段('心魔值') },
        { label: '功德', value: 读取仙侠数字字段('功德') },
        { label: '业力', value: 读取仙侠数字字段('业力') },
    ];
    const 显示仙侠档案 = ['灵根', '灵根资质', '丹田状态', '道基状态'].some((key) => 读取仙侠文本字段(key))
        || ['当前灵力', '最大灵力', '当前神识', '最大神识', '心魔值', '功德', '业力'].some((key) => 读取仙侠数字字段(key) !== 0);

    const bodyParts = [
        { name: '头部', current: character.头部当前血量, max: character.头部最大血量 },
        { name: '胸部', current: character.胸部当前血量, max: character.胸部最大血量 },
        { name: '腹部', current: character.腹部当前血量, max: character.腹部最大血量 },
        { name: '左手', current: character.左手当前血量, max: character.左手最大血量 },
        { name: '右手', current: character.右手当前血量, max: character.右手最大血量 },
        { name: '左腿', current: character.左腿当前血量, max: character.左腿最大血量 },
        { name: '右腿', current: character.右腿当前血量, max: character.右腿最大血量 },
    ];

    const equipmentOrder: { key: keyof typeof character.装备; label: string }[] = [
        { key: '头部', label: '头部' },
        { key: '胸部', label: '身体' },
        { key: '背部', label: '背负' },
        { key: '腰部', label: '腰间' },
        { key: '腿部', label: '下装' },
        { key: '足部', label: '鞋履' },
        { key: '手部', label: '护手' },
        { key: '主武器', label: '主手' },
        { key: '副武器', label: '副手' },
        { key: '暗器', label: '暗器' },
        { key: '坐骑', label: '坐骑' },
    ];

    const getEquipName = (key: keyof typeof character.装备) => {
        const idOrName = character.装备[key];
        if (idOrName === '无') return '无';
        const item = character.物品列表.find(i => i.ID === idOrName || i.名称 === idOrName);
        return item ? item.名称 : idOrName;
    };

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

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm md:hidden animate-fadeIn">
            <div className="relative flex h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[1.4rem] border border-wuxia-gold/25 bg-[#090909] shadow-[0_0_60px_rgba(0,0,0,0.85)]">
                <div className="relative shrink-0 border-b border-wuxia-gold/15 bg-[linear-gradient(180deg,rgba(230,200,110,0.10),rgba(0,0,0,0))] px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-black/50 shadow-[0_0_16px_rgba(212,175,55,0.12)]">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={`${character.姓名}头像`} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-lg font-bold text-wuxia-gold/70">
                                        {(character.姓名 || '侠').slice(0, 1)}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] tracking-[0.35em] text-wuxia-gold/60">角色档案</div>
                                <h3 className="mt-1 truncate text-xl font-bold tracking-[0.18em] text-wuxia-gold">{character.姓名}</h3>
                                <p className="mt-1 text-[11px] text-gray-400">
                                    {启用修炼体系 ? `${character.称号 || '无称号'} · ${character.境界}` : (character.称号 || '无称号')}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-black/45 text-gray-400 transition-all hover:border-wuxia-red hover:text-wuxia-red"
                            title="关闭"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                        {[
                            { id: 'profile', label: '档案' },
                            { id: 'skills', label: '技艺' },
                            { id: 'stats', label: '属性' },
                            { id: 'image', label: '影像' },
                        ].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveView(item.id as MobileCharacterView)}
                                className={`rounded-full border px-3 py-1.5 text-[11px] tracking-[0.15em] transition-all ${
                                    activeView === item.id
                                        ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold'
                                        : 'border-gray-800 bg-black/20 text-gray-400'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar bg-[radial-gradient(circle_at_top,rgba(120,90,30,0.10),transparent_30%)] p-4 space-y-4">
                    {activeView === 'profile' && (
                        <>
                            <div className="overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.10),rgba(0,0,0,0.15))]">
                                <div className="flex gap-3 p-4">
                                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-black/50">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt={`${character.姓名}头像`} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-wuxia-gold/70">
                                                {(character.姓名 || '侠').slice(0, 1)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] tracking-[0.32em] text-wuxia-gold/65">侠客印记</div>
                                        <div className="mt-2 text-lg font-semibold text-wuxia-gold">{character.姓名}</div>
                                        <div className="mt-1 text-[12px] text-gray-300">
                                            {启用修炼体系 ? `${character.称号 || '无称号'} · ${character.境界}` : (character.称号 || '无称号')}
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                                            <div className="rounded-lg border border-gray-800 bg-black/30 px-2.5 py-2 text-gray-300">头像 {selectedAvatarId ? '已绑定' : '未绑定'}</div>
                                            <div className="rounded-lg border border-gray-800 bg-black/30 px-2.5 py-2 text-gray-300">立绘 {selectedPortraitId ? '已绑定' : '未绑定'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.32em] text-wuxia-gold/65">身份文牒</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <MobileStatCard label="背景" value={character.出身背景?.名称 || '无'} accent />
                                    <MobileStatCard label="身份" value={身份信息} />
                                    {启用修炼体系 && <MobileStatCard label="境界" value={character.境界} accent />}
                                    <MobileStatCard label="负重" value={`${character.当前负重}/${character.最大负重}`} />
                                </div>
                            </div>

                            {显示仙侠档案 && (
                                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                                    <div className="mb-3 text-[10px] tracking-[0.32em] text-emerald-200/75">仙侠修真</div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {仙侠档案字段.map((item) => (
                                            <MobileStatCard key={item.label} label={item.label} value={item.value} accent={item.accent} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.32em] text-wuxia-gold/65">外貌描摹</div>
                                <p className="text-[13px] leading-7 text-gray-300">{character.外貌 || '暂无外貌记录。'}</p>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.32em] text-wuxia-gold/65">性格批注</div>
                                <p className="text-[13px] leading-7 text-gray-300">{character.性格 || '暂无性格记录。'}</p>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.32em] text-wuxia-gold/65">出身批注</div>
                                <p className="text-[13px] leading-7 text-gray-300">{character.出身背景?.描述 || '暂无背景描述。'}</p>
                                {character.出身背景?.效果 && (
                                    <div className="mt-3 rounded-xl border border-wuxia-gold/15 bg-white/[0.03] px-3 py-2.5 text-[12px] leading-6 text-wuxia-gold/90">
                                        {character.出身背景.效果}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-wuxia-red/20 bg-[linear-gradient(180deg,rgba(120,20,20,0.12),rgba(0,0,0,0.12))] p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-[10px] tracking-[0.32em] text-wuxia-red/80">天赋卷宗</div>
                                    <div className="text-[10px] text-gray-500">共 {天赋列表.length} 项</div>
                                </div>
                                <div className="space-y-3">
                                    {天赋列表.length > 0 ? (
                                        天赋列表.map((talent, index) => (
                                            <div key={`${talent.名称}-${index}`} className="rounded-xl border border-wuxia-red/15 bg-black/25 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-sm font-semibold tracking-[0.08em] text-wuxia-gold">{talent.名称}</span>
                                                    <span className="text-[10px] text-wuxia-red/70">天赋 {index + 1}</span>
                                                </div>
                                                <p className="mt-2 text-[12px] leading-6 text-gray-300">{talent.描述 || '暂无描述。'}</p>
                                                {talent.效果 && (
                                                    <div className="mt-2 rounded-lg border border-wuxia-gold/15 bg-white/[0.03] px-2.5 py-2 text-[11px] leading-5 text-wuxia-gold/90">
                                                        {talent.效果}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-gray-700 px-3 py-5 text-center text-sm text-gray-500">
                                            暂无天赋记录
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.32em] text-wuxia-gold/65">基础六维</div>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {attributes.map((attr) => (
                                        <div key={attr.key} className="rounded-xl border border-gray-800 bg-white/[0.03] px-2 py-3 text-center">
                                            <div className="text-[10px] tracking-[0.18em] text-gray-500">{attr.key}</div>
                                            <div className="mt-1 text-base font-mono font-bold text-wuxia-gold">{attr.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setActiveView('skills')}
                                className="w-full rounded-2xl border border-wuxia-gold/25 bg-wuxia-gold/10 px-4 py-3 text-left transition-all hover:border-wuxia-gold/50 hover:bg-wuxia-gold/15"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] tracking-[0.32em] text-wuxia-gold/75">技艺面板</div>
                                        <div className="mt-1 text-sm text-gray-200">查看医术、毒术、机关、采集、鉴定等技艺进度</div>
                                    </div>
                                    <div className="rounded-full border border-wuxia-gold/25 bg-black/25 px-2.5 py-1 font-mono text-xs text-wuxia-gold">{技艺列表.length} 项</div>
                                </div>
                            </button>
                        </>
                    )}

                    {activeView === 'skills' && (
                        <>
                            <div className="rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[10px] tracking-[0.32em] text-wuxia-gold/65">主角技艺</div>
                                        <div className="mt-1 text-[12px] leading-6 text-gray-400">技艺会随剧情学习、实践、请教与突破更新。</div>
                                    </div>
                                    <div className="rounded-full border border-wuxia-gold/25 bg-black/35 px-2.5 py-1 font-mono text-xs text-wuxia-gold">{技艺列表.length}</div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {技艺列表.length > 0 ? 技艺列表.map((skill: any, index: number) => {
                                    const name = String(skill?.名称 || '未命名技艺').trim();
                                    const level = String(skill?.等级 || '未入门').trim();
                                    const progress = Math.max(0, Math.min(100, Number(skill?.熟练度 || 0)));
                                    return (
                                        <div key={`${name}-${index}`} className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-base font-semibold tracking-[0.12em] text-gray-100">{name}</div>
                                                    <div className={`mt-1 text-xs ${获取技艺等级颜色(level)}`}>{level}</div>
                                                </div>
                                                <div className="shrink-0 rounded-full border border-wuxia-gold/20 bg-wuxia-gold/10 px-2.5 py-1 font-mono text-[11px] text-wuxia-gold">{progress}/100</div>
                                            </div>
                                            <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/5 bg-black/70">
                                                <div className="h-full bg-gradient-to-r from-wuxia-gold/55 to-wuxia-gold transition-all" style={{ width: `${progress}%` }} />
                                            </div>
                                            <p className="mt-3 text-[12px] leading-6 text-gray-400">{skill?.描述 || '尚未形成稳定技艺。'}</p>
                                        </div>
                                    );
                                }) : (
                                    <div className="rounded-xl border border-dashed border-gray-700 bg-black/25 px-3 py-8 text-center text-sm text-gray-500">
                                        尚无技艺记录。开局或剧情学习后会自动写入这里。
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {activeView === 'stats' && (
                        <>
                            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-xl font-serif font-bold text-wuxia-gold">{character.姓名}</div>
                                        <div className="mt-1 text-[11px] text-gray-400">{character.称号 || '无称号'}</div>
                                    </div>
                                    {启用修炼体系 && (
                                        <div className="text-right">
                                            <div className="text-[10px] text-gray-500">境界</div>
                                            <div className="text-sm font-bold text-wuxia-red">{character.境界}</div>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                                    <span className="rounded border border-gray-800 bg-black/40 px-2 py-1 text-gray-300">性别 {character.性别}</span>
                                    <span className="rounded border border-gray-800 bg-black/40 px-2 py-1 text-gray-300">年龄 {character.年龄}</span>
                                    <span className="rounded border border-gray-800 bg-black/40 px-2 py-1 font-mono text-gray-300">负重 {character.当前负重}/{character.最大负重}</span>
                                    {钱财显示列表.map((item) => (
                                        <span key={item} className="rounded border border-gray-800 bg-black/40 px-2 py-1 font-mono text-gray-300">{item}</span>
                                    ))}
                                </div>
                                <div className="mt-3 rounded-xl border border-wuxia-gold/15 bg-black/25 px-3 py-2.5">
                                    <div className="text-[10px] tracking-[0.24em] text-wuxia-gold/75">{货币卡片.title}</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-200">{货币卡片.summary}</div>
                                    <div className="mt-1.5 text-[11px] leading-5 text-gray-400">{货币卡片.exchangeHint}</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div className="text-[10px] tracking-[0.3em] text-wuxia-gold/70">六维属性</div>
                                    {可用属性点 > 0 && (
                                        <div className="rounded-full border border-wuxia-gold/35 bg-wuxia-gold/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-wuxia-gold">
                                            可分配 {可用属性点}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {attributes.map((attr) => (
                                        <div key={attr.key} className="relative rounded-lg border border-gray-800 px-2 py-2 text-center transition-colors hover:border-wuxia-gold/50">
                                            <div className="text-[9px] text-gray-500">{attr.key}</div>
                                            <div className="text-sm font-bold font-mono text-wuxia-gold">{attr.val}</div>
                                            {可用属性点 > 0 && onAllocateAttributePoint && (
                                                <button
                                                    type="button"
                                                    onClick={() => onAllocateAttributePoint(attr.attributeKey)}
                                                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-wuxia-gold/40 bg-wuxia-gold/15 text-sm font-bold leading-none text-wuxia-gold transition-transform hover:scale-105 hover:bg-wuxia-gold/25"
                                                    aria-label={`分配1点到${attr.attributeKey}`}
                                                    title={`分配1点到${attr.attributeKey}`}
                                                >
                                                    +
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4 space-y-3">
                                <div className="text-[10px] tracking-[0.3em] text-wuxia-gold/70">状态</div>
                                <VitalBar label={`总${资源文案.气血}`} current={总气血.当前} max={总气血.最大} color="bg-red-700" />
                                <VitalBar label={资源文案.精力} current={character.当前精力} max={character.最大精力} color="bg-teal-500" />
                                {启用修炼体系 && (
                                    <VitalBar label={资源文案.能量} current={character.当前内力} max={character.最大内力} color="bg-indigo-500" />
                                )}
                                {启用饱腹口渴系统 && (
                                    <>
                                        <VitalBar label="饱腹" current={character.当前饱腹} max={character.最大饱腹} color="bg-amber-500" />
                                        <VitalBar label="水分" current={character.当前口渴} max={character.最大口渴} color="bg-blue-500" />
                                    </>
                                )}
                                <VitalBar label="经验" current={character.当前经验} max={character.升级经验} color="bg-wuxia-gold" />
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4 space-y-2">
                                <div className="text-[10px] tracking-[0.3em] text-wuxia-gold/70">身躯</div>
                                {bodyParts.map((part) => (
                                    <BodyRow key={part.name} name={part.name} current={part.current} max={part.max} />
                                ))}
                            </div>

                            {玩家BUFF列表.length > 0 && (
                                <div className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                    <div className="mb-2 text-[10px] tracking-[0.3em] text-wuxia-gold/70">玩家BUFF</div>
                                    <div className="space-y-2">
                                        {玩家BUFF列表.map((buff, i) => (
                                            <div key={`${buff.索引}-${i}`} className="rounded border border-wuxia-cyan/20 bg-black/40 px-2 py-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-[10px] text-wuxia-cyan">{buff.名称 || `BUFF${i + 1}`}</span>
                                                    <span className="whitespace-nowrap text-[9px] text-gray-500">{buff.结束时间 || '常驻'}</span>
                                                </div>
                                                {buff.效果 && (
                                                    <div className="mt-1 text-[9px] leading-snug text-gray-300">
                                                        {buff.效果}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                <div className="mb-2 text-[10px] tracking-[0.3em] text-wuxia-gold/70">行头</div>
                                <div className="space-y-2">
                                    {equipmentOrder.map((item) => (
                                        <div key={item.key} className="flex justify-between border-b border-gray-800/60 pb-1 text-[10px] last:border-0">
                                            <span className="text-gray-500">{item.label}</span>
                                            <span className="max-w-[180px] truncate text-right text-gray-300" title={getEquipName(item.key)}>
                                                {getEquipName(item.key)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {activeView === 'image' && (
                        <>
                            <div className="rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <MobileStatCard label="影像总数" value={`${history.length} 张`} accent />
                                    <MobileStatCard label="角色锚点" value={playerAnchor?.名称 || '未建立'} />
                                    <MobileStatCard label="头像绑定" value={selectedAvatarId ? '已设置' : '未设置'} />
                                    <MobileStatCard label="立绘绑定" value={selectedPortraitId ? '已设置' : '未设置'} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="overflow-hidden rounded-2xl border border-gray-800 bg-black/25">
                                    <div className="px-3 py-2 text-[10px] tracking-[0.26em] text-wuxia-gold/65">当前头像</div>
                                    <div className="aspect-square bg-black">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt={`${character.姓名}当前头像`} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-xs text-gray-600">未设置头像</div>
                                        )}
                                    </div>
                                </div>
                                <div className="overflow-hidden rounded-2xl border border-gray-800 bg-black/25">
                                    <div className="px-3 py-2 text-[10px] tracking-[0.26em] text-wuxia-gold/65">当前立绘</div>
                                    <div className="aspect-square bg-black">
                                        {portraitUrl ? (
                                            <img src={portraitUrl} alt={`${character.姓名}当前立绘`} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-xs text-gray-600">未设置立绘</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {selectedAvatarId && (
                                    <button type="button" onClick={() => onClearPlayerAvatarImage?.()} className="rounded-full border border-gray-700 px-3 py-1.5 text-[11px] text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red">
                                        清空头像
                                    </button>
                                )}
                                {selectedPortraitId && (
                                    <button type="button" onClick={() => onClearPlayerPortraitImage?.()} className="rounded-full border border-gray-700 px-3 py-1.5 text-[11px] text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red">
                                        清空立绘
                                    </button>
                                )}
                            </div>

                            <div className="rounded-2xl border border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(20,16,12,0.96),rgba(8,8,8,0.96))] p-4">
                                <div className="border-b border-wuxia-gold/10 pb-3">
                                    <div className="text-sm font-bold tracking-[0.2em] text-wuxia-gold">主角生图</div>
                                    <div className="mt-1 text-[11px] text-gray-500">移动端可直接生成头像、半身或立绘，并立刻回写到主角影像档案。</div>
                                </div>

                                <div className="mt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">构图</div>
                                            <select value={generateOptions.构图 || '头像'} onChange={(e) => 更新生图选项('构图', e.target.value as 主角生图选项['构图'])} className={输入框样式}>
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
                                        <textarea value={generateOptions.画师串 || ''} onChange={(e) => 更新生图选项('画师串', e.target.value)} className={文本域样式} placeholder="可补充服饰、气质、镜头、光影等要求" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">额外要求</div>
                                            <input value={generateOptions.额外要求 || ''} onChange={(e) => 更新生图选项('额外要求', e.target.value)} className={输入框样式} placeholder="例如：更贴近江湖写意" />
                                        </div>
                                        <div>
                                            <div className="mb-2 text-[11px] tracking-[0.22em] text-gray-500">尺寸</div>
                                            <input value={generateOptions.尺寸 || ''} onChange={(e) => 更新生图选项('尺寸', e.target.value)} className={输入框样式} placeholder="如 768x1152" />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => { void handleGenerate(); }}
                                        disabled={!onGeneratePlayerImage || Boolean(busyAction)}
                                        className="w-full rounded-xl border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-wuxia-gold transition-all hover:bg-wuxia-gold/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {busyAction ? '生成中...' : `生成${generateOptions.构图 || '影像'}`}
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4">
                                <div className="mb-3 text-[10px] tracking-[0.3em] text-wuxia-gold/70">生图记录</div>
                                <div className="space-y-3">
                                    {history.length > 0 ? history.map((item: any) => {
                                        const imageUrl = 获取图片展示地址(item);
                                        const imageId = typeof item?.id === 'string' ? item.id.trim() : '';
                                        const isAvatar = Boolean(imageId) && imageId === selectedAvatarId;
                                        const isPortrait = Boolean(imageId) && imageId === selectedPortraitId;
                                        const canUseAsAvatar = item?.构图 === '头像' && item?.状态 === 'success' && Boolean(imageUrl);
                                        const canUseAsPortrait = (item?.构图 === '半身' || item?.构图 === '立绘') && item?.状态 === 'success' && Boolean(imageUrl);

                                        return (
                                            <div key={imageId || `${item?.构图 || 'image'}_${item?.生成时间 || 0}`} className="overflow-hidden rounded-xl border border-gray-800 bg-black/35">
                                                <div className="relative h-44 bg-black">
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
                                                        <button type="button" disabled={!canUseAsAvatar} onClick={() => imageId && onSelectPlayerAvatarImage?.(imageId)} className={`rounded-lg border px-2 py-2 text-[11px] transition-colors ${isAvatar ? 'border-wuxia-gold/40 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-700 bg-black/40 text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold'} disabled:cursor-not-allowed disabled:opacity-40`}>
                                                            {isAvatar ? '当前头像' : '设为头像'}
                                                        </button>
                                                        <button type="button" disabled={!canUseAsPortrait} onClick={() => imageId && onSelectPlayerPortraitImage?.(imageId)} className={`rounded-lg border px-2 py-2 text-[11px] transition-colors ${isPortrait ? 'border-wuxia-gold/40 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-700 bg-black/40 text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold'} disabled:cursor-not-allowed disabled:opacity-40`}>
                                                            {isPortrait ? '当前立绘' : '设为立绘'}
                                                        </button>
                                                        <button type="button" disabled={!imageId} onClick={() => imageId && onRemovePlayerImageRecord?.(imageId)} className="rounded-lg border border-wuxia-red/20 bg-black/40 px-2 py-2 text-[11px] text-gray-300 transition-colors hover:border-wuxia-red hover:text-wuxia-red disabled:cursor-not-allowed disabled:opacity-40">
                                                            删除
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="rounded-xl border border-dashed border-gray-700 px-3 py-8 text-center text-sm text-gray-500">
                                            还没有主角生图记录。生成头像、半身或立绘后，会直接写入这里并支持绑定头像与立绘。
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileCharacter;
