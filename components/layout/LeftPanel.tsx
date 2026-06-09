import React from 'react';
import { OpeningConfig, 角色数据结构, 游戏设置结构, 视觉设置结构 } from '../../types';
import { use图片资源回源预取 } from '../../hooks/useImageAssetPrefetch';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { 获取图片资源文本地址 } from '../../utils/imageAssets';
import { 计算角色总气血 } from '../../utils/characterVitals';
import { 格式化世界观BaseAmount, 获取世界观简短货币汇率说明, 获取世界观货币槽位, 获取角色金钱BaseAmount, 获取货币显示模式, 获取货币兼容字段路径, 规范化角色金钱 } from '../../utils/currencyDisplay';
import { 获取题材资源文案 } from '../../utils/resourceLabels';

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

const use数值变化提示 = (value: number | string | undefined) => {
    const previousRef = React.useRef<number | null>(null);
    const [delta, setDelta] = React.useState<number | null>(null);
    const numeric = Number(value);
    React.useEffect(() => {
        if (!Number.isFinite(numeric)) return;
        const previous = previousRef.current;
        previousRef.current = numeric;
        if (previous === null || previous === numeric) return;
        setDelta(numeric - previous);
        const timer = window.setTimeout(() => setDelta(null), 2600);
        return () => window.clearTimeout(timer);
    }, [numeric]);
    return delta;
};

const WuxiaProgressBar: React.FC<{ 
    pct: number; 
    baseColor: string; 
    height?: string; 
    showGlow?: boolean;
    delta?: number | null;
    max?: number;
}> = ({ pct, baseColor: _baseColor, height = '6px', showGlow = true, delta = null, max = 0 }) => {
    const baseColor = '#d4af37';
    // 定义颜色的变体以模拟质感
    const style = {
        '--wuxia-base': baseColor,
        '--wuxia-light': `color-mix(in sRGB, ${baseColor} 40%, #fff)`,
        '--wuxia-dark': `color-mix(in sRGB, ${baseColor} 80%, #000)`,
        '--wuxia-glow': `color-mix(in sRGB, ${baseColor} 50%, transparent)`,
    } as React.CSSProperties;

  const safePct = Math.max(0, Math.min(100, pct));
  const deltaPct = delta !== null && Number.isFinite(delta) && Number.isFinite(max) && max > 0
      ? Math.min(100, Math.abs(delta) / max * 100)
      : 0;
  const deltaLeft = deltaPct > 0
      ? (delta! >= 0 ? Math.max(0, safePct - deltaPct) : safePct)
      : 0;

  return (
    <div 
        className="w-full bg-black/60 rounded-full overflow-hidden border border-gray-800/50 relative shadow-inner" 
        style={{ ...style, height }}
    >
        {/* 背景暗纹 */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, var(--wuxia-light) 1px, transparent 0)',
            backgroundSize: '8px 8px'
        }}></div>
        
        {/* 进度条主体 */}
        <div 
            className="h-full transition-all duration-700 ease-out relative"
            style={{ 
                width: `${safePct}%`,
                background: `linear-gradient(90deg, var(--wuxia-dark), var(--wuxia-base), var(--wuxia-light))`,
                boxShadow: showGlow ? `0 0 10px var(--wuxia-glow)` : 'none'
            }}
        >
            {/* 流光效果 */}
            <div className="absolute inset-0 w-full h-full overflow-hidden">
                <div className="absolute inset-0 animate-wuxia-flow" style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                    transform: 'skewX(-45deg) translateX(-100%)',
                }}></div>
            </div>
            
            {/* 头部高亮（类似玉石圆润感） */}
            <div className="absolute right-0 top-0 h-full w-2 bg-gradient-to-l from-white/30 to-transparent"></div>
        </div>
        {deltaPct > 0 && (
            <div
                className={`absolute top-0 h-full transition-all duration-700 ${delta! >= 0 ? 'bg-emerald-300/80 shadow-[0_0_8px_rgba(110,231,183,0.55)]' : 'bg-red-400/80 shadow-[0_0_8px_rgba(248,113,113,0.55)]'}`}
                style={{
                    left: `${deltaLeft}%`,
                    width: `${Math.max(1.4, deltaPct)}%`
                }}
            />
        )}
    </div>
  );
};

const FlatBar: React.FC<{ label: string; current: number; max: number; type: 'stamina' | 'inner' | 'food' | 'water' | 'load' | 'exp' | 'hp'; visualConfig?: 视觉设置结构; commandDelta?: number | null }> = ({ label, current, max, type, visualConfig, commandDelta = null }) => {
    const baseColor = '#d4af37';
    
    const pct = Math.min((current / (max || 1)) * 100, 100);
    const areaStyle = 构建区域文字样式(visualConfig, '左侧栏');
    const 基础字号 = Number(areaStyle.fontSize) || 13;
    const 标题字号 = Math.max(14, Math.round(基础字号 * 1.02));
    const 数值字号 = Math.max(13, Math.round(基础字号 * 0.98));
    const liveDelta = use数值变化提示(current);
    const delta = commandDelta ?? liveDelta;

    return (
        <div className={`group last:mb-0 rounded px-1 py-px transition-all duration-300 ${delta !== null ? (delta >= 0 ? 'bg-emerald-400/10 ring-1 ring-emerald-300/40' : 'bg-red-500/10 ring-1 ring-red-400/45') : ''}`}>
            <div className="flex justify-between items-end px-0.5">
                <span className="tracking-widest group-hover:text-wuxia-gold transition-colors font-medium flex items-center gap-1" style={{ ...areaStyle, fontSize: `${标题字号}px`, lineHeight: 1.2 }}>
                    <span className="w-1 h-1 rounded-full bg-wuxia-gold/40"></span>
                    {label}
                </span>
                <span className="inline-flex items-center gap-1 font-mono group-hover:text-gray-300 opacity-90" style={{ color: areaStyle.color, fontSize: `${数值字号}px` }}>
                    {delta !== null && (
                        <span className={`rounded border px-1 text-[10px] font-black ${delta >= 0 ? 'border-emerald-300/50 text-emerald-200' : 'border-red-300/50 text-red-200'}`}>
                            {delta > 0 ? '+' : ''}{delta}
                        </span>
                    )}
                    {current}/{max}
                </span>
            </div>
            <WuxiaProgressBar pct={pct} baseColor={baseColor} height="3px" delta={delta} max={max} />
        </div>
    );
};

const MiniBodyPart: React.FC<{ name: string; current: number; max: number; status: string; visualConfig?: 视觉设置结构 }> = ({ name, current, max, visualConfig }) => {
    const pct = (current / (max || 1)) * 100;
    const color = '#d4af37';
    const areaStyle = 构建区域文字样式(visualConfig, '左侧栏');
    const 基础字号 = Number(areaStyle.fontSize) || 13;
    const 名称字号 = Math.max(13, Math.round(基础字号 * 0.96));
    const 数值字号 = Math.max(13, Math.round(基础字号 * 0.92));
    const delta = use数值变化提示(current);

    return (
        <div className={`flex items-center justify-between gap-2 w-full h-[18px] border-b border-gray-800/20 last:border-0 hover:bg-white/5 transition-colors px-1 group/part ${delta !== null ? (delta >= 0 ? 'bg-emerald-400/10' : 'bg-red-500/15') : ''}`}>
            <span className="leading-none whitespace-nowrap text-right w-8" style={{ ...areaStyle, fontSize: `${名称字号}px`, opacity: 0.85 }}>{name}</span>
            <div className="flex-1 self-center">
                <WuxiaProgressBar pct={pct} baseColor={color} height="4px" showGlow={false} delta={delta} max={max} />
            </div>
            <span className="font-mono w-[48px] text-right leading-none group-hover/part:text-wuxia-red transition-colors" style={{ color: 'rgba(156,163,175,0.8)', fontSize: `${数值字号}px` }}>
                {delta !== null && <span className={delta >= 0 ? 'mr-1 text-emerald-200' : 'mr-1 text-red-200'}>{delta > 0 ? '+' : ''}{delta}</span>}
                {current}
            </span>
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
    const 金钱 = 规范化角色金钱(角色.金钱);
    const 玩家BUFF列表 = Array.isArray(角色.玩家BUFF) ? 角色.玩家BUFF : [];
    const 启用饱腹口渴系统 = gameConfig?.启用饱腹口渴系统 !== false;
    const 启用修炼体系 = gameConfig?.启用修炼体系 !== false;
    const areaStyle = 构建区域文字样式(visualConfig, '左侧栏');
    const 基础字号 = Number(areaStyle.fontSize) || 13;
    const 缩放字号 = (ratio: number, min = 13) => `${Math.max(min, Math.round(基础字号 * ratio))}px`;
    const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
    const [身躯折叠, set身躯折叠] = React.useState(false);
    const [行头折叠, set行头折叠] = React.useState(false);
    const 玩家头像地址 = React.useMemo(() => {
        const archive = 角色?.图片档案;
        const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
        const history = Array.isArray(archive?.生图历史) ? archive!.生图历史 : [];
        const recent = archive?.最近生图结果;
        const selectedAvatar = history.find((item: any) => item?.id === selectedAvatarId)
            || (recent?.id === selectedAvatarId ? recent : null)
            || history.find((item: any) => item?.构图 === '头像' && item?.状态 === 'success')
            || (recent?.构图 === '头像' && recent?.状态 === 'success' ? recent : null);
        return 获取图片资源文本地址(selectedAvatar?.本地路径 || selectedAvatar?.图片URL || 角色.头像图片URL);
    }, [角色]);

    const bodyParts = [
        { name: '头部', current: 角色.头部当前血量, max: 角色.头部最大血量, status: 角色.头部状态 },
        { name: '胸部', current: 角色.胸部当前血量, max: 角色.胸部最大血量, status: 角色.胸部状态 },
        { name: '腹部', current: 角色.腹部当前血量, max: 角色.腹部最大血量, status: 角色.腹部状态 },
        { name: '左手', current: 角色.左手当前血量, max: 角色.左手最大血量, status: 角色.左手状态 },
        { name: '右手', current: 角色.右手当前血量, max: 角色.右手最大血量, status: 角色.右手状态 },
        { name: '左腿', current: 角色.左腿当前血量, max: 角色.左腿最大血量, status: 角色.左腿状态 },
        { name: '右腿', current: 角色.右腿当前血量, max: 角色.右腿最大血量, status: 角色.右腿状态 },
    ];
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
    const 使用动态CurrencySystem显示 = Boolean(openingConfig?.modeRuntimeProfile?.economy?.currencySystem);
    const 世界观货币文本 = 使用动态CurrencySystem显示
        ? 格式化世界观BaseAmount(
            获取角色金钱BaseAmount(角色.金钱, openingConfig?.modeRuntimeProfile, 货币模式),
            openingConfig,
            角色
        )
        : '';
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

    const equipmentOrder: { key: keyof typeof 角色.装备; label: string }[] = [
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

    const getEquipName = (key: keyof typeof 角色.装备) => {
        const idOrName = 角色.装备[key];
        if (idOrName === '无') return '无';
        const item = 角色.物品列表.find(i => i.ID === idOrName || i.名称 === idOrName);
        return item ? item.名称 : idOrName;
    };

    const handleAvatarButtonClick = () => {
        avatarInputRef.current?.click();
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
        <div className="left-panel-body h-full flex flex-col p-3 border-r border-gray-900 relative overflow-y-auto overflow-x-hidden no-scrollbar bg-transparent" style={areaStyle}>
            <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
            />
            <div className="mb-2 h-[120px] border-b border-gray-800/50 pb-2 shrink-0 flex flex-col items-center justify-center">
                <div className="w-full flex items-center justify-between gap-3">
                    <div className="min-w-0 flex flex-col items-center justify-center flex-1">
                        <div className="w-full text-wuxia-gold/70 italic text-center leading-tight whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: 缩放字号(1, 14) }}>{角色.称号 || '无称号'}</div>
                        <button
                            type="button"
                            onClick={onOpenCharacter}
                            className="relative border border-wuxia-gold/40 px-3 py-2 bg-ink-black/50 shadow-[0_0_15px_rgba(230,200,110,0.05)] transition-all duration-300 hover:border-wuxia-gold hover:bg-black/70 hover:shadow-[0_0_20px_rgba(230,200,110,0.12)] focus:outline-none focus:ring-1 focus:ring-wuxia-gold/60 disabled:cursor-default disabled:hover:border-wuxia-gold/40 disabled:hover:bg-ink-black/50 disabled:hover:shadow-[0_0_15px_rgba(230,200,110,0.05)]"
                            title="查看角色档案"
                            disabled={!onOpenCharacter}
                        >
                            <div className="absolute top-0 left-0 w-0.5 h-0.5 bg-wuxia-gold"></div>
                            <div className="absolute top-0 right-0 w-0.5 h-0.5 bg-wuxia-gold"></div>
                            <div className="absolute bottom-0 left-0 w-0.5 h-0.5 bg-wuxia-gold"></div>
                            <div className="absolute bottom-0 right-0 w-0.5 h-0.5 bg-wuxia-gold"></div>
                            <div className="text-wuxia-gold font-bold tracking-[0.3em] vertical-text text-center select-none drop-shadow-md min-h-[60px] flex items-center justify-center w-full leading-none" style={{ fontFamily: areaStyle.fontFamily, fontStyle: areaStyle.fontStyle, fontSize: 缩放字号(1.5, 22) }}>
                                {角色.姓名}
                            </div>
                        </button>
                        {启用修炼体系 && (
                            <div className="mt-2 bg-wuxia-red/90 border border-red-800/50 text-white px-2 py-0.5 rounded-sm whitespace-nowrap shadow-sm" style={{ fontSize: 缩放字号(1, 14) }}>{角色.境界}</div>
                        )}
                    </div>
                    <div className="mx-2 h-[90px] w-px shrink-0 self-center bg-gradient-to-b from-transparent via-wuxia-gold/55 to-transparent"></div>
                    <button
                        type="button"
                        onClick={handleAvatarButtonClick}
                        className="avatar-container-card -translate-x-[10%] shrink-0 self-center focus:outline-none focus:ring-1 focus:ring-wuxia-gold/50"
                        title="点击上传头像"
                    >
                        <div className="avatar-card-blob"></div>
                        <div className="avatar-card-bg">
                            {玩家头像地址 ? (
                                <img
                                    src={玩家头像地址}
                                    alt={`${角色.姓名 || '角色'}头像`}
                                    className="h-full w-full object-cover rounded-[8px]"
                                />
                            ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-white/5 to-black/50 text-wuxia-gold/70 rounded-[8px]">
                                    <div className="font-bold tracking-[0.16em] opacity-90" style={{ fontSize: 缩放字号(1.12, 16) }}>
                                        {(角色.姓名 || '侠').slice(0, 1)}
                                    </div>
                                    <div className="mt-1 uppercase tracking-[0.2em] text-gray-500" style={{ fontSize: 缩放字号(0.94, 13) }}>
                                        上传头像
                                    </div>
                                </div>
                            )}
                        </div>
                    </button>
                </div>
            </div>

            <div className="mb-2 shrink-0 flex flex-col gap-0.5">
                <FlatBar label={`总${资源文案.气血}`} current={总气血.当前} max={总气血.最大} type="hp" visualConfig={visualConfig} commandDelta={总气血变化} />
                <FlatBar label={资源文案.精力} current={角色.当前精力} max={角色.最大精力} type="stamina" visualConfig={visualConfig} commandDelta={读取本回合数值变化(latestCommands, '角色.当前精力')} />
                {启用修炼体系 && (
                    <FlatBar label={资源文案.能量} current={角色.当前内力} max={角色.最大内力} type="inner" visualConfig={visualConfig} commandDelta={读取本回合数值变化(latestCommands, '角色.当前内力')} />
                )}
                {启用饱腹口渴系统 && (
                    <>
                        <FlatBar label="饱腹" current={角色.当前饱腹} max={角色.最大饱腹} type="food" visualConfig={visualConfig} commandDelta={读取本回合数值变化(latestCommands, '角色.当前饱腹')} />
                        <FlatBar label="水分" current={角色.当前口渴} max={角色.最大口渴} type="water" visualConfig={visualConfig} commandDelta={读取本回合数值变化(latestCommands, '角色.当前口渴')} />
                    </>
                )}
                <FlatBar label="经验" current={角色.当前经验} max={角色.升级经验} type="exp" visualConfig={visualConfig} commandDelta={读取本回合数值变化(latestCommands, '角色.当前经验')} />
            </div>
            <div className="mb-2 shrink-0 border border-gray-800/60 bg-black/30 px-2 py-1 flex items-center justify-between gap-2 overflow-hidden font-mono" style={{ color: 'rgba(209,213,219,1)', fontSize: 缩放字号(1, 14) }}>
                <span className="shrink-0 whitespace-nowrap text-gray-500">钱财</span>
                <span className="min-w-0 flex-1 whitespace-normal break-words text-right text-[10px] leading-4 sm:text-[11px]">
                    {使用动态CurrencySystem显示 ? 世界观货币文本 : 货币槽位.map((slot, index) => (
                        <React.Fragment key={slot.key}>
                            {index > 0 ? ' / ' : ''}
                            {slot.label} {(金钱变化 as any)[slot.key] !== null && <span className={(金钱变化 as any)[slot.key] >= 0 ? 'text-emerald-200' : 'text-red-200'}>({(金钱变化 as any)[slot.key] > 0 ? '+' : ''}{(金钱变化 as any)[slot.key]})</span>} {(金钱 as any)[slot.key]}
                        </React.Fragment>
                    ))}
                </span>
            </div>
            <div className="mb-2 -mt-1 shrink-0 px-1 text-[10px] leading-4 text-gray-500">
                {货币汇率说明}
            </div>

            {onOpenVariableManager && (
                <button
                    type="button"
                    onClick={onOpenVariableManager}
                    className="mb-2 shrink-0 w-full border border-wuxia-cyan/40 bg-wuxia-cyan/10 px-2 py-1.5 text-center font-bold tracking-[0.22em] text-wuxia-cyan transition-colors hover:border-wuxia-gold hover:text-wuxia-gold"
                    style={{ fontSize: 缩放字号(0.98, 13) }}
                >
                    变量管理
                </button>
            )}

            <div className="shrink-0 flex flex-col mb-1">
                <div className="border border-gray-800 bg-white/5 p-1.5 flex flex-col relative group hover:border-gray-700 transition-colors">
                    <button
                        type="button"
                        onClick={() => set身躯折叠(prev => !prev)}
                        className="text-wuxia-gold/70 mb-1 uppercase tracking-[0.2em] text-center bg-black/80 -mt-3 mx-auto px-2 w-fit border border-gray-900 shadow-sm hover:text-wuxia-gold transition-colors cursor-pointer flex items-center gap-1"
                        style={{ fontSize: 缩放字号(1.02, 14) }}
                    >
                        身躯
                        <span className={`transition-transform ${身躯折叠 ? '' : 'rotate-180'}`} style={{ fontSize: 缩放字号(0.75, 10) }}>▼</span>
                    </button>
                    {!身躯折叠 && (
                        <div className="flex-col pr-1 space-y-0.5">
                            {bodyParts.map((part) => (
                                <MiniBodyPart key={part.name} name={part.name} current={part.current} max={part.max} status={part.status} visualConfig={visualConfig} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {玩家BUFF列表.length > 0 && (
                <div className="mb-3 shrink-0 border border-gray-800 bg-white/5 p-2">
                    <h3 className="text-wuxia-cyan/80 mb-2 uppercase tracking-[0.2em] text-center" style={{ fontSize: 缩放字号(1.02, 14) }}>玩家BUFF</h3>
                    <div className="space-y-1.5">
                        {玩家BUFF列表.map((buff, i) => (
                            <div key={`${buff.索引}-${i}`} className="border border-wuxia-cyan/20 bg-black/40 px-2 py-1">
                                <div className="flex items-center justify-between gap-2" style={{ fontSize: 缩放字号(1, 14) }}>
                                    <span className="text-wuxia-cyan truncate">{buff.名称 || `BUFF${i + 1}`}</span>
                                    <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: 缩放字号(0.94, 13) }}>{buff.结束时间 || '常驻'}</span>
                                </div>
                                {buff.效果 && <div className="text-gray-300 mt-0.5 leading-tight" style={{ fontSize: 缩放字号(0.94, 13) }}>{buff.效果}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="shrink-0 pt-2 border-t border-gray-800/50 flex-1 overflow-y-auto no-scrollbar">
                <div className="border border-gray-800 bg-white/5 p-1.5 flex flex-col relative group hover:border-gray-700 transition-colors">
                    <button
                        type="button"
                        onClick={() => set行头折叠(prev => !prev)}
                        className="text-wuxia-gold/70 mb-1 uppercase tracking-[0.2em] text-center bg-black/80 -mt-3 mx-auto px-2 w-fit border border-gray-900 shadow-sm hover:text-wuxia-gold transition-colors cursor-pointer flex items-center gap-1"
                        style={{ fontSize: 缩放字号(1.02, 14) }}
                    >
                        行头
                        <span className={`transition-transform ${行头折叠 ? '' : 'rotate-180'}`} style={{ fontSize: 缩放字号(0.75, 10) }}>▼</span>
                    </button>
                    {!行头折叠 && (
                        <div className="space-y-1">
                            {equipmentOrder.map((item) => (
                                <div key={item.key} className="flex justify-between items-center group cursor-help border-b border-gray-800/30 pb-0.5 last:border-0 hover:bg-white/5 px-1" style={{ fontSize: 缩放字号(1, 14) }}>
                                    <span className="text-gray-500 group-hover:text-wuxia-gold transition-colors w-8">{item.label}</span>
                                    <span className="truncate text-right flex-1" title={getEquipName(item.key)} style={{ color: areaStyle.color }}>{getEquipName(item.key)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute bottom-1 left-0 w-full flex justify-center opacity-20 pointer-events-none">
                <div className="w-1/2 h-px bg-gradient-to-r from-transparent via-wuxia-red to-transparent"></div>
            </div>
        </div>
    );
};

export default LeftPanel;
