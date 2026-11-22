import React from 'react';
import CharacterJournal from './CharacterJournal';
import StatDelta from './StatDelta';
import { OpeningConfig, 角色数据结构, 游戏设置结构, 视觉设置结构 } from '../../types';
import { use图片资源回源预取 } from '../../hooks/useImageAssetPrefetch';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { 注册受保护图片资源, 取消受保护图片资源, 是否图片资源引用 } from '../../utils/imageAssets';
import { 取头像姓氏 } from '../../utils/chineseName';
import { 计算角色总气血 } from '../../utils/characterVitals';
import { 格式化世界观BaseAmount, 格式化角色金钱补充字段, 获取角色金钱补充字段, 获取世界观简短货币汇率说明, 获取世界观货币槽位, 获取角色金钱BaseAmount, 获取货币显示模式, 获取货币兼容字段路径, 规范化角色金钱 } from '../../utils/currencyDisplay';
import { 获取题材资源文案 } from '../../utils/resourceLabels';
import { 提取人物头像地址, 提取人物头像资源引用 } from '../../utils/personAvatar';

interface Props {
    角色: 角色数据结构;
    onOpenCharacter?: () => void;
    onOpenVariableManager?: () => void;
    onUploadAvatar?: (imageUrl: string) => void;
    visualConfig?: 视觉设置结构;
    gameConfig?: 游戏设置结构;
    openingConfig?: OpeningConfig;
    latestCommands?: any[];
}

const ThinBar = ({ current, max }: { current: number; max: number }) => {
    const pct = max > 0 ? Math.max(0, Math.min(100, current / max * 100)) : 0;
    return (
        <div aria-hidden="true" className="h-[2px] overflow-hidden rounded-full bg-paper-white/15">
            <div className="h-full bg-wuxia-gold transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
    );
};

const FlatBar = ({ label, current, max, fullWidth = false, commandDelta = null }: {
    label: string; current: number; max: number; fullWidth?: boolean; commandDelta?: number | null;
}) => {
    return (
        <div className={fullWidth ? 'col-span-2' : 'min-w-0'}>
            <div className={`mb-1 flex flex-wrap items-baseline gap-x-1 ${fullWidth ? 'justify-between' : 'flex-col'}`}>
                <span className="text-[0.88em]">{label}</span>
                <span className="flex flex-wrap items-baseline gap-x-1 font-mono text-[0.82em] tabular-nums">
                    <span className="break-all">{current}<wbr />/{max}</span>
                    <StatDelta current={current} commandDelta={commandDelta} />
                </span>
            </div>
            <ThinBar current={current} max={max} />
        </div>
    );
};

const 读取本回合数值变化 = (commands: any[], path: string): number | null => {
    const total = commands.reduce((sum, cmd) => {
        const key = String(cmd?.key || '').replace(/^gameState\./, '');
        if (key !== path) return sum;
        const value = Number(cmd?.value);
        if (!Number.isFinite(value)) return sum;
        if (cmd?.action === 'add') return sum + value;
        if (cmd?.action === 'sub') return sum - value;
        return sum;
    }, 0);
    return total === 0 ? null : total;
};

const LeftPanel: React.FC<Props> = ({ 角色, onOpenCharacter, onOpenVariableManager, onUploadAvatar, visualConfig, gameConfig, openingConfig, latestCommands = [] }) => {
    use图片资源回源预取(角色);
    const [showRates, setShowRates] = React.useState(false);
    const rateId = React.useId();
    const 金钱 = 规范化角色金钱(角色.金钱);
    const 玩家BUFF列表 = Array.isArray(角色.玩家BUFF) ? 角色.玩家BUFF : [];
    const 启用饱腹口渴系统 = gameConfig?.启用饱腹口渴系统 !== false;
    const 启用修炼体系 = gameConfig?.启用修炼体系 !== false;
    const areaStyle = 构建区域文字样式(visualConfig, '左侧栏');
    const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
    const 玩家头像地址 = 提取人物头像地址(角色);
    const avatarButtonRef = React.useRef<HTMLButtonElement>(null);
    const previewRef = React.useRef<HTMLDialogElement>(null);
    const [loadedAvatar, setLoadedAvatar] = React.useState('');
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const avatarReady = Boolean(玩家头像地址 && loadedAvatar === 玩家头像地址);

    React.useEffect(() => {
        if (!previewOpen) return;
        const desktop = window.matchMedia('(min-width: 768px)');
        const closeIfHidden = () => {
            if (!desktop.matches || !玩家头像地址) previewRef.current?.close();
        };
        closeIfHidden();
        desktop.addEventListener('change', closeIfHidden);
        return () => desktop.removeEventListener('change', closeIfHidden);
    }, [previewOpen, 玩家头像地址]);

    // 保护主角头像的图片资源引用，防止被物品生图等批量图片操作淘汰出缓存
    React.useEffect(() => {
        const avatarRef = 提取人物头像资源引用(角色);
        if (avatarRef && 是否图片资源引用(avatarRef)) {
            注册受保护图片资源(avatarRef);
        }
        return () => {
            if (avatarRef && 是否图片资源引用(avatarRef)) {
                取消受保护图片资源(avatarRef);
            }
        };
    }, [角色]);

    const 总气血 = React.useMemo(() => 计算角色总气血(角色), [角色]);
    const 资源文案 = 获取题材资源文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const 总气血变化 = React.useMemo(() => {
        const weighted = [
            ['角色.头部当前血量', 2.4],
            ['角色.胸部当前血量', 2],
            ['角色.腹部当前血量', 1.5],
            ['角色.左手当前血量', 0.65],
            ['角色.右手当前血量', 0.65],
            ['角色.左腿当前血量', 0.9],
            ['角色.右腿当前血量', 0.9]
        ].reduce((sum, [path, weight]) => sum + (读取本回合数值变化(latestCommands, String(path)) || 0) * Number(weight), 0);
        return weighted === 0 ? null : Math.round(weighted);
    }, [latestCommands]);
    const 货币模式 = 获取货币显示模式(openingConfig, 角色);
    const 货币槽位 = 获取世界观货币槽位(openingConfig, 角色);
    const 货币汇率说明 = 获取世界观简短货币汇率说明(openingConfig?.modeRuntimeProfile, 货币模式);
    const 使用动态货币系统显示 = Boolean(openingConfig?.modeRuntimeProfile?.economy?.currencySystem);
    const 世界观货币文本 = 使用动态货币系统显示
        ? 格式化世界观BaseAmount(
            获取角色金钱BaseAmount(角色.金钱, openingConfig?.modeRuntimeProfile, 货币模式),
            openingConfig,
            角色
        )
        : '';
    // 兜底：三层货币/题材别名都解析不出余额时，直接显示 角色.金钱 里其余的正数字段，
    // 避免仙侠(灵石)、现代(现金)、末世(通用点数)等题材下"变量里有钱、左栏全是 0"。
    const 钱财全部为零 = 使用动态货币系统显示
        ? 获取角色金钱BaseAmount(角色.金钱, openingConfig?.modeRuntimeProfile, 货币模式) <= 0
        : 货币槽位.every((slot) => Number((金钱 as any)[slot.key] ?? 0) <= 0);
    const 补充钱财文本 = 钱财全部为零 ? 格式化角色金钱补充字段(获取角色金钱补充字段(角色.金钱)) : '';
    const 金钱变化 = React.useMemo(() => Object.fromEntries(
        货币槽位.map((slot) => [
            slot.key,
            获取货币兼容字段路径(slot.key).reduce<number | null>((sum, path) => {
                const delta = 读取本回合数值变化(latestCommands, path);
                if (delta === null) return sum;
                return (sum || 0) + delta;
            }, null)
        ])
    ) as Record<string, number | null>, [latestCommands, 货币槽位]);

    const handleAvatarButtonClick = () => {
        if (avatarReady) {
            previewRef.current?.showModal();
            setPreviewOpen(true);
        } else {
            avatarInputRef.current?.click();
        }
    };

    const handleAvatarError = () => {
        setLoadedAvatar('');
        if (previewRef.current?.open) previewRef.current.close();
    };

    const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result) return;
            onUploadAvatar?.(result);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="left-panel-body h-full min-h-0 flex flex-col px-2.5 py-4 xl:px-4 relative overflow-y-auto overflow-x-hidden no-scrollbar bg-transparent" style={areaStyle}>
            <dialog ref={previewRef} aria-label="角色头像预览"
                className="m-auto max-h-[92dvh] max-w-[92vw] overflow-auto rounded-lg border border-paper-white/20 bg-ink-black p-4 text-paper-white shadow-xl backdrop:bg-ink-black/75"
                onClose={() => { setPreviewOpen(false); avatarButtonRef.current?.focus(); }}>
                <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarFileChange} />
                <div className="mb-3 flex items-center justify-between gap-6">
                    <h2 className="font-serif">角色头像</h2>
                    <button type="button" onClick={() => previewRef.current?.close()} className="px-2 py-1">关闭</button>
                </div>
                {previewOpen && 玩家头像地址 && (
                    <img src={玩家头像地址} alt={`${角色.姓名 || '角色'}的完整头像`} onError={handleAvatarError}
                        className="mx-auto block h-auto max-h-[max(4rem,calc(92dvh-8rem))] w-[min(76vw,40rem)] max-w-full object-contain" />
                )}
                <button type="button" onClick={() => avatarInputRef.current?.click()}
                    className="mt-3 px-2 py-1 text-wuxia-gold hover:underline">更换头像</button>
            </dialog>
            <header className={`mb-4 flex shrink-0 items-center border-b border-paper-white/15 pb-4 ${avatarReady ? 'gap-1 xl:gap-2' : 'gap-2'}`}>
                <button type="button" ref={avatarButtonRef} onClick={handleAvatarButtonClick}
                    title={avatarReady ? '查看完整头像' : '点击上传头像'} aria-label={avatarReady ? '查看完整头像' : '上传角色头像'}
                    aria-haspopup={avatarReady ? 'dialog' : undefined}
                    className={`relative grid ${avatarReady ? 'h-[64px] w-[64px]' : 'h-9 w-9 xl:h-11 xl:w-11'} shrink-0 place-items-center overflow-hidden rounded-full bg-ink-gray font-serif text-lg text-wuxia-gold hover:ring-1 hover:ring-wuxia-gold`}>
                    {!avatarReady && 取头像姓氏(角色.姓名 || '')}
                    {玩家头像地址 && (
                        <img key={玩家头像地址} src={玩家头像地址} alt={`${角色.姓名 || '角色'}头像`}
                            className={`absolute inset-0 h-full w-full object-cover ${avatarReady ? '' : 'invisible'}`}
                            onLoad={() => setLoadedAvatar(玩家头像地址)} onError={handleAvatarError} />
                    )}
                </button>
                <div className="min-w-0 leading-snug">
                    <button type="button" onClick={onOpenCharacter} disabled={!onOpenCharacter} title="查看角色档案"
                        className="break-all text-left font-serif text-[1.25em] font-bold hover:text-wuxia-gold">
                        {角色.姓名}
                    </button>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[0.8em]">
                        {启用修炼体系 && <span className="text-wuxia-gold">{角色.境界}</span>}
                        <span className="break-all">{角色.称号 || '无称号'}</span>
                    </div>
                </div>
            </header>

            <div className="mb-4 grid shrink-0 grid-cols-2 gap-x-3 gap-y-2.5">
                <FlatBar label={`总${资源文案.气血}`} current={总气血.当前} max={总气血.最大} fullWidth commandDelta={总气血变化} />
                <FlatBar label={资源文案.精力} current={角色.当前精力} max={角色.最大精力} commandDelta={读取本回合数值变化(latestCommands, '角色.当前精力')} />
                {启用修炼体系 && (
                    <FlatBar label={资源文案.能量} current={角色.当前内力} max={角色.最大内力} commandDelta={读取本回合数值变化(latestCommands, '角色.当前内力')} />
                )}
                {启用饱腹口渴系统 && (
                    <>
                        <FlatBar label="饱腹" current={角色.当前饱腹} max={角色.最大饱腹} commandDelta={读取本回合数值变化(latestCommands, '角色.当前饱腹')} />
                        <FlatBar label="水分" current={角色.当前口渴} max={角色.最大口渴} commandDelta={读取本回合数值变化(latestCommands, '角色.当前口渴')} />
                    </>
                )}
                <FlatBar label="经验" current={角色.当前经验} max={角色.升级经验} commandDelta={读取本回合数值变化(latestCommands, '角色.当前经验')} />
            </div>
            <div className="mb-3 shrink-0 border-t border-paper-white/15 pt-3">
                <span className="text-[0.85em]">钱财</span>
                <div className="mt-1 flex items-baseline justify-between gap-2 text-[0.85em] leading-relaxed">
                    <div className="min-w-0 break-words tabular-nums">
                        {补充钱财文本 ? 补充钱财文本 : 使用动态货币系统显示 ? 世界观货币文本 : 货币槽位.map((slot, index) => {
                            const delta = 金钱变化[slot.key];
                            return (
                                <React.Fragment key={slot.key}>
                                    {index > 0 ? ' / ' : ''}
                                    <span className="inline-block max-w-full">
                                        {slot.label} {delta !== null && (
                                            <span className={delta >= 0 ? 'text-wuxia-cyan' : 'text-wuxia-gold'}>
                                                ({delta > 0 ? '+' : ''}{delta})
                                            </span>
                                        )} {金钱[slot.key]}
                                    </span>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {货币汇率说明 && (
                        <button type="button" aria-expanded={showRates} aria-controls={rateId}
                            onClick={() => setShowRates(open => !open)} className="shrink-0 text-wuxia-gold hover:underline">
                            换算
                        </button>
                    )}
                </div>
                <p id={rateId} hidden={!showRates} className="mt-1 break-words text-[0.78em]">{货币汇率说明}</p>
            </div>

            {玩家BUFF列表.length > 0 && (
                <div className="mb-3 shrink-0 border-t border-paper-white/15 pt-2">
                    <h3 className="mb-2 text-[0.85em]">玩家BUFF</h3>
                    <div className="space-y-1.5">
                        {玩家BUFF列表.map((buff, i) => (
                            <div key={`${buff.索引}-${i}`} className="text-[0.85em]">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="break-all text-wuxia-gold">{buff.名称 || `BUFF${i + 1}`}</span>
                                    <span className="text-paper-white/70">{buff.结束时间 || '常驻'}</span>
                                </div>
                                {buff.效果 && <div className="mt-0.5 break-words leading-snug">{buff.效果}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <CharacterJournal character={角色} />
            {onOpenVariableManager && (
                <button type="button" onClick={onOpenVariableManager}
                    className="mt-3 self-start py-1 text-[0.85em] text-wuxia-gold underline-offset-4 hover:underline">
                    变量管理
                </button>
            )}
        </div>
    );
};

export default LeftPanel;
