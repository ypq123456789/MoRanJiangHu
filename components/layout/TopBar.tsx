import React, { useMemo, useRef, useState } from 'react';
import { 环境信息结构, 节日结构, 视觉设置结构 } from '../../types';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { normalizeCanonicalGameTime } from '../../hooks/useGame/timeUtils';
import { setNativeSystemBarsHidden } from '../../utils/nativeRuntime';

interface Props {
    环境: 环境信息结构;
    游戏初始时间?: string;
    timeFormat: '传统' | '数字';
    festivals?: 节日结构[];
    visualConfig?: 视觉设置结构;
}

const 颜色转透明度 = (color: string | undefined, alpha: number, fallback: string): string => {
    const source = (color || '').trim();
    const cssVarMatch = source.match(/^rgb\s*\(\s*var\((--[^)]+)\)\s*\)$/i);
    if (cssVarMatch) {
        return `rgba(var(${cssVarMatch[1]}), ${alpha})`;
    }
    const normalized = source.startsWith('#') ? source.slice(1) : source;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const TopItem: React.FC<{
    label: string;
    value: string | number;
    highlight?: boolean;
    visualConfig?: 视觉设置结构;
    isExpanded?: boolean;
    compact?: boolean;
    align?: 'left' | 'right';
    onClick?: () => void;
    onLongPress?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}> = ({ label, value, highlight, visualConfig, isExpanded, compact = false, align = 'left', onClick, onLongPress, onMouseEnter, onMouseLeave }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    const labelColor = 颜色转透明度(areaStyle.color as string | undefined, 0.62, 'rgba(230, 200, 110, 0.62)');
    const baseFontSize = Number(areaStyle.fontSize) || 14;
    const labelFontSize = compact ? `${Math.max(8, Math.round(baseFontSize * 0.58))}px` : `${Math.max(13, Math.round(baseFontSize * 0.96))}px`;
    const valueFontSize = compact ? `${Math.max(10, Math.round(baseFontSize * 0.76))}px` : `${Math.max(16, Math.round(baseFontSize * 1.14))}px`;
    
    // Long press logic
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const isLongPressActive = React.useRef(false);

    const handleTouchStart = () => {
        isLongPressActive.current = false;
        timerRef.current = setTimeout(() => {
            isLongPressActive.current = true;
            onLongPress?.();
        }, 500); // 500ms for long press
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        if (!isLongPressActive.current) {
            // If it wasn't a long press, treat it as a click
            onClick?.();
        } else {
            // Prevent the default click if it was a long press
            e.preventDefault();
        }
    };

    return (
        <div 
            className={`flex flex-col justify-center relative group cursor-pointer transition-all duration-300 ${compact ? `mx-0 w-[54px] ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}` : 'items-center mx-1 md:mx-4'} ${isExpanded ? (compact ? 'scale-[1.03]' : 'scale-110') : ''}`} 
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => isLongPressActive.current && e.preventDefault()} // Block context menu on long press
        >
            {!compact && <div className={`absolute -inset-1.5 border-x border-wuxia-gold/0 group-hover:border-wuxia-gold/20 transition-all duration-500 scale-y-50 group-hover:scale-y-100 ${isExpanded ? 'border-wuxia-gold/40 scale-y-100' : ''}`}></div>}
            <div className={compact ? 'w-full truncate tracking-[0.08em] mb-0' : 'tracking-[0.18em] mb-0.5'} style={{ ...areaStyle, color: labelColor, fontSize: labelFontSize, lineHeight: compact ? 1 : 1.1 }}>
                {label}
            </div>
            <div className={`${compact ? 'w-full truncate whitespace-nowrap' : 'whitespace-nowrap'} drop-shadow-md transition-transform ${highlight ? 'font-bold animate-pulse scale-[1.03]' : (compact ? '' : 'group-hover:scale-[1.03]')} ${isExpanded ? 'text-wuxia-gold font-bold' : ''}`} style={{ ...areaStyle, fontSize: valueFontSize, lineHeight: compact ? 1.05 : 1.15 }}>
                {value}
            </div>
        </div>
    );
};

const DetailCard: React.FC<{
    title: string;
    content: React.ReactNode;
    onClose?: () => void;
    visualConfig?: 视觉设置结构;
    className?: string; // Add className prop for custom positioning
    panelClassName?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}> = ({ title, content, onClose, visualConfig, className, panelClassName, onMouseEnter, onMouseLeave }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    return (
        <div 
            className={`absolute top-full mt-2 z-[100] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div
                className={`relative w-64 md:w-80 bg-black/90 backdrop-blur-md border border-wuxia-gold/30 rounded-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden group ${panelClassName || ''}`}
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onTouchEnd={(event) => event.stopPropagation()}
            >
                {/* Reference style elements */}
                <div className="pointer-events-none absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-wuxia-gold/40 to-transparent"></div>
                <div className="pointer-events-none absolute -right-16 -top-16 w-32 h-32 bg-wuxia-gold/5 rounded-full blur-3xl group-hover:bg-wuxia-gold/10 transition-colors duration-500"></div>
                
                <h3 className="text-wuxia-gold font-bold text-lg mb-3 border-b border-wuxia-gold/10 pb-1 flex justify-between items-center" style={areaStyle}>
                    {title}
                    {onClose && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onClose();
                            }}
                            onTouchStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onTouchEnd={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onClose();
                            }}
                            className="text-wuxia-gold/50 hover:text-wuxia-gold transition-colors text-xs p-1"
                            aria-label="关闭详情"
                        >
                            ✕
                        </button>
                    )}
                </h3>
                <div className="text-sm space-y-2 opacity-90 leading-relaxed" style={areaStyle}>
                    {content}
                </div>
            </div>
        </div>
    );
};

const Divider = () => (
    <div className="h-4 md:h-5 w-px bg-gradient-to-b from-transparent via-wuxia-gold/30 to-transparent mx-0.5 md:mx-1"></div>
);

const parseEnvTime = (env?: 环境信息结构): { year: number; month: number; day: number; hour: number; minute: number } | null => {
    if (!env || typeof env !== 'object') return null;
    const canonical = normalizeCanonicalGameTime((env as any)?.时间);
    if (!canonical) return null;
    const match = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    return { year, month, day, hour, minute };
};

const mapHourToWuxia = (hour: number): string => {
    if (hour >= 23 || hour < 1) return '子时';
    if (hour < 3) return '丑时';
    if (hour < 5) return '寅时';
    if (hour < 7) return '卯时';
    if (hour < 9) return '辰时';
    if (hour < 11) return '巳时';
    if (hour < 13) return '午时';
    if (hour < 15) return '未时';
    if (hour < 17) return '申时';
    if (hour < 19) return '酉时';
    if (hour < 21) return '戌时';
    return '亥时';
};

const mapMinuteToKe = (minute: number): string => {
    if (minute === 30) return '正刻';
    if (minute < 15) return '初刻';
    if (minute < 30) return '一刻';
    if (minute < 45) return '二刻';
    return '三刻';
};

const parseCanonicalGameTime = (raw?: string): { year: number; month: number; day: number; hour: number; minute: number } | null => {
    if (typeof raw !== 'string') return null;
    const match = raw.trim().match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute };
};

const hasFullscreenElement = () => {
    const doc = document as Document & {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
    };

    return !!(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement
    );
};

const MobileInfoCard: React.FC<{
    label: string;
    value: string;
    visualConfig?: 视觉设置结构;
    highlight?: boolean;
    isExpanded?: boolean;
    onClick?: () => void;
}> = ({ label, value, visualConfig, highlight = false, isExpanded = false, onClick }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    const labelColor = 颜色转透明度(areaStyle.color as string | undefined, 0.62, 'rgba(230, 200, 110, 0.62)');
    const baseFontSize = Number(areaStyle.fontSize) || 14;
    const labelFontSize = `${Math.max(8, Math.round(baseFontSize * 0.56))}px`;
    const valueFontSize = `${Math.max(10, Math.round(baseFontSize * 0.72))}px`;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative flex min-h-[42px] flex-col justify-center overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-all duration-300 ${
                isExpanded
                    ? 'border-wuxia-gold/70 bg-wuxia-gold/12 shadow-[0_0_18px_rgba(230,200,110,0.18)]'
                    : 'border-wuxia-gold/18 bg-white/[0.03] hover:border-wuxia-gold/40 hover:bg-white/[0.05]'
            }`}
        >
            <span
                className="truncate tracking-[0.14em]"
                style={{ ...areaStyle, color: labelColor, fontSize: labelFontSize, lineHeight: 1.05 }}
            >
                {label}
            </span>
            <span
                className={`mt-1 truncate drop-shadow-md ${highlight ? 'text-wuxia-gold font-bold' : ''}`}
                style={{ ...areaStyle, fontSize: valueFontSize, lineHeight: 1.1, fontWeight: highlight || isExpanded ? 700 : 500 }}
            >
                {value}
            </span>
        </button>
    );
};

const toGameMinuteValue = (time: { year: number; month: number; day: number; hour: number; minute: number } | null): number | null => {
    if (!time) return null;
    return (((time.year * 12 + time.month) * 31 + time.day) * 24 + time.hour) * 60 + time.minute;
};

type ExpandedType = 'weather' | 'environment' | 'time' | 'location' | 'festival' | 'journey' | null;

const TopBar: React.FC<Props> = ({ 环境, 游戏初始时间, timeFormat, festivals = [], visualConfig }) => {
    const [expandedType, setExpandedType] = useState<ExpandedType>(null);
    const [mobileCollapsed, setMobileCollapsed] = useState(false);
    const lastMobileDismissAtRef = useRef(0);

    const parsedTime = parseEnvTime(环境);
    const derivedDayCount = useMemo(() => {
        const current = toGameMinuteValue(parsedTime);
        const initial = toGameMinuteValue(parseCanonicalGameTime(游戏初始时间));
        if (current == null || initial == null) return 1;
        const diffMinutes = Math.max(0, current - initial);
        return Math.floor(diffMinutes / (24 * 60)) + 1;
    }, [parsedTime, 游戏初始时间]);
    const month = parsedTime?.month ?? null;
    const day = parsedTime?.day ?? null;
    const topBarStyle = 构建区域文字样式(visualConfig, '顶部栏');
    const 顶栏基础字号 = parseFloat(String(topBarStyle.fontSize ?? '')) || 14;
    const 顶栏字号 = (ratio: number, min = 13) => `${Math.max(min, Math.round(顶栏基础字号 * ratio))}px`;

    const numericTime = parsedTime
        ? `${parsedTime.hour.toString().padStart(2, '0')}:${parsedTime.minute.toString().padStart(2, '0')}`
        : '未知时间';
    const traditionalTime = parsedTime
        ? `${mapHourToWuxia(parsedTime.hour)} · ${mapMinuteToKe(parsedTime.minute)}`
        : '未知时刻';

    const displayTime = timeFormat === '数字' ? numericTime : traditionalTime;
    const fullDateStr = parsedTime
        ? `${parsedTime.year}年${parsedTime.month.toString().padStart(2, '0')}月${parsedTime.day.toString().padStart(2, '0')}日 ${displayTime}`
        : displayTime;
    const mobileDateStr = parsedTime
        ? `${parsedTime.year}年${parsedTime.month.toString().padStart(2, '0')}月${parsedTime.day.toString().padStart(2, '0')}日`
        : '未知日期';
    const mobileClockStr = displayTime;

    const currentFestival = useMemo(() => {
        if (month == null || day == null) return undefined;
        return festivals.find(f => f.月 === month && f.日 === day);
    }, [festivals, month, day]);

    const festivalDisplay = 环境?.节日?.名称?.trim()
        ? 环境.节日.名称.trim()
        : (currentFestival ? currentFestival.名称 : '平常日');
    const weatherDisplay = useMemo(() => {
        const rawWeather = (环境 as any)?.天气;
        if (rawWeather && typeof rawWeather === 'object') {
            const current = typeof rawWeather?.天气 === 'string' ? rawWeather.天气.trim() : '';
            return current || '未知';
        }
        return '未知';
    }, [环境]);
    const environmentDisplay = useMemo(() => {
        const envVars = Array.isArray(环境?.环境变量)
            ? 环境.环境变量
            : (环境?.环境变量 && typeof 环境.环境变量 === 'object' ? [环境.环境变量 as any] : []);
        if (envVars.length > 0) {
            const names = envVars
                .map((item: any) => (typeof item?.名称 === 'string' ? item.名称.trim() : ''))
                .filter(Boolean);
            if (names.length > 0) return names.join('、');
            const descriptions = envVars
                .map((item: any) => (typeof item?.描述 === 'string' ? item.描述.trim() : ''))
                .filter(Boolean);
            if (descriptions.length > 0) return descriptions[0];
        }
        return '无';
    }, [环境?.环境变量]);

    const weatherEnd = (环境 as any)?.天气?.结束日期 || '长久';
    const locationBadge = useMemo(() => {
        const rawSmall = typeof 环境?.小地点 === 'string' ? 环境.小地点.trim() : '';
        const rawSpecific = typeof 环境?.具体地点 === 'string' ? 环境.具体地点.trim() : '';
        let normalizedSpecific = rawSpecific;
        if (rawSmall && rawSpecific.startsWith(rawSmall)) {
            const stripped = rawSpecific.slice(rawSmall.length).replace(/^[\s\-—>·/|，,、。:：]+/, '').trim();
            if (stripped) normalizedSpecific = stripped;
        }
        const segments = [环境?.大地点, 环境?.中地点, rawSmall, normalizedSpecific]
            .map((part) => (typeof part === 'string' ? part.trim() : ''))
            .filter(Boolean);
        const uniqueSegments = segments.filter((part, idx) => segments.indexOf(part) === idx);
        return uniqueSegments.length > 0 ? uniqueSegments.join(' - ') : '未知地点';
    }, [环境?.大地点, 环境?.中地点, 环境?.小地点, 环境?.具体地点]);
    const mobileLocationBadge = useMemo(() => {
        const rawSmall = typeof 环境?.小地点 === 'string' ? 环境.小地点.trim() : '';
        const rawSpecific = typeof 环境?.具体地点 === 'string' ? 环境.具体地点.trim() : '';
        let normalizedSpecific = rawSpecific;
        if (rawSmall && rawSpecific.startsWith(rawSmall)) {
            const stripped = rawSpecific.slice(rawSmall.length).replace(/^[\s\-—>·/|，,、。:：]+/, '').trim();
            if (stripped) normalizedSpecific = stripped;
        }
        const segments = [环境?.中地点, rawSmall, normalizedSpecific]
            .map((part) => (typeof part === 'string' ? part.trim() : ''))
            .filter(Boolean);
        const uniqueSegments = segments.filter((part, idx) => segments.indexOf(part) === idx);
        return uniqueSegments.length > 0 ? uniqueSegments.join(' - ') : '未知地点';
    }, [环境?.中地点, 环境?.小地点, 环境?.具体地点]);

    React.useEffect(() => {
        const syncSystemBars = () => {
            void setNativeSystemBarsHidden(hasFullscreenElement());
        };

        document.addEventListener('fullscreenchange', syncSystemBars);
        return () => {
            document.removeEventListener('fullscreenchange', syncSystemBars);
            void setNativeSystemBarsHidden(false);
        };
    }, []);

    const toggleFullScreen = async () => {
        if (!hasFullscreenElement()) {
            try {
                await document.documentElement.requestFullscreen();
                await setNativeSystemBarsHidden(true);
            } catch (err: any) {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            }
        } else if (document.exitFullscreen) {
            try {
                await document.exitFullscreen();
                await setNativeSystemBarsHidden(false);
            } catch (err: any) {
                console.error(`Error attempting to exit full-screen mode: ${err.message} (${err.name})`);
            }
        } else {
            await setNativeSystemBarsHidden(false);
        }
    };

    const closeExpandedPanel = () => {
        lastMobileDismissAtRef.current = Date.now();
        setExpandedType(null);
    };

    const toggleExpanded = (type: Exclude<ExpandedType, null>) => {
        if (expandedType === type) {
            closeExpandedPanel();
            return;
        }
        if (Date.now() - lastMobileDismissAtRef.current < 300) {
            return;
        }
        setExpandedType(type);
    };

    const alternateTime = timeFormat === '数字' ? traditionalTime : numericTime;
    const environmentVars = Array.isArray(环境?.环境变量)
        ? 环境.环境变量
        : (环境?.环境变量 && typeof 环境.环境变量 === 'object' ? [环境.环境变量 as any] : []);

    const detailConfigs: Record<Exclude<ExpandedType, null>, { title: string; content: React.ReactNode }> = {
        weather: {
            title: '天象变更',
            content: (
                <>
                    <p><span className="text-wuxia-gold/60">当前天气：</span>{weatherDisplay}</p>
                    <p><span className="text-wuxia-gold/60">预计结束：</span>{weatherEnd}</p>
                </>
            ),
        },
        environment: {
            title: '周遭环境',
            content: (
                <div className="space-y-4">
                    {environmentVars.map((ev, i) => (
                        <div key={`${ev?.名称 || 'env'}_${i}`} className="border-l-2 border-wuxia-gold/20 pl-2">
                            <div className="font-bold text-wuxia-gold">{ev.名称}</div>
                            <div className="opacity-80 mt-1" style={{ fontSize: 顶栏字号(1, 14) }}>{ev.描述}</div>
                            {ev.效果 && <div className="text-green-400/80 mt-1 italic" style={{ fontSize: 顶栏字号(0.94, 13) }}>{ev.效果}</div>}
                        </div>
                    ))}
                    {environmentVars.length === 0 && <p>风平浪静，并无特殊环境。</p>}
                </div>
            ),
        },
        time: {
            title: '当前时刻',
            content: (
                <div className="space-y-2">
                    <p><span className="text-wuxia-gold/60">完整时间：</span>{fullDateStr}</p>
                    <p><span className="text-wuxia-gold/60">{timeFormat === '数字' ? '传统时刻：' : '数字时刻：'}</span>{alternateTime}</p>
                    <p><span className="text-wuxia-gold/60">当前日期：</span>{mobileDateStr}</p>
                </div>
            ),
        },
        location: {
            title: '当前地点',
            content: (
                <div className="space-y-2">
                    <p><span className="text-wuxia-gold/60">大地点：</span>{环境?.大地点 || '未知'}</p>
                    <p><span className="text-wuxia-gold/60">中地点：</span>{环境?.中地点 || '未知'}</p>
                    <p><span className="text-wuxia-gold/60">小地点：</span>{环境?.小地点 || '未知'}</p>
                    <p><span className="text-wuxia-gold/60">具体地点：</span>{环境?.具体地点 || '未知'}</p>
                </div>
            ),
        },
        festival: {
            title: '今日时节',
            content: (
                <div className="space-y-2">
                    <div className="text-lg font-bold text-wuxia-gold">{festivalDisplay}</div>
                    <div className="italic opacity-80" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.简介 || (currentFestival?.描述) || '正是寻常好时节。'}</div>
                    {(环境.节日?.效果 || currentFestival?.效果) && (
                        <div className="mt-3 rounded border border-wuxia-gold/10 bg-wuxia-gold/5 p-2">
                            <div className="mb-1 text-wuxia-gold/60" style={{ fontSize: 顶栏字号(0.9, 13) }}>时节影响</div>
                            <div className="text-wuxia-gold" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.效果 || currentFestival?.效果}</div>
                        </div>
                    )}
                </div>
            ),
        },
        journey: {
            title: '行程历程',
            content: (
                <div className="space-y-2">
                    <p><span className="text-wuxia-gold/60">当前进度：</span>第 {derivedDayCount} 天</p>
                    <p><span className="text-wuxia-gold/60">起始时间：</span>{游戏初始时间 ? normalizeCanonicalGameTime(游戏初始时间) || 游戏初始时间 : '未知'}</p>
                    <p><span className="text-wuxia-gold/60">当前时间：</span>{fullDateStr}</p>
                </div>
            ),
        },
    };

    const mobileItems = [
        { type: 'weather' as const, label: '天气', shortLabel: '气', value: weatherDisplay, highlight: false },
        { type: 'environment' as const, label: '环境', shortLabel: '境', value: environmentDisplay, highlight: false },
        { type: 'time' as const, label: '时程', shortLabel: '时', value: `${mobileClockStr} / 第${derivedDayCount}天`, highlight: false },
        { type: 'location' as const, label: '地点', shortLabel: '地', value: mobileLocationBadge, highlight: false },
        { type: 'festival' as const, label: '节日', shortLabel: '节', value: festivalDisplay, highlight: !!currentFestival },
    ];

    return (
        <div className="w-full relative overflow-visible z-50 bg-[#000] pt-[var(--app-safe-top,env(safe-area-inset-top,0px))] md:h-[58px] md:min-h-[58px] md:pt-0" style={{ color: topBarStyle.color, fontFamily: topBarStyle.fontFamily, fontStyle: topBarStyle.fontStyle }}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ink-black via-wuxia-gold/40 to-ink-black"></div>

            <div className="md:hidden pointer-events-none fixed inset-y-0 left-0 z-[85] flex items-start pt-[calc(var(--app-safe-top,env(safe-area-inset-top,0px))+12px)]">
                <div className="pointer-events-auto flex items-start gap-2 pl-2">
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (!mobileCollapsed) closeExpandedPanel();
                                setMobileCollapsed(prev => !prev);
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-wuxia-gold/20 bg-black/24 text-wuxia-gold shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-colors hover:border-wuxia-gold/40 hover:bg-black/36"
                            aria-label={mobileCollapsed ? '展开顶部信息栏' : '收起顶部信息栏'}
                            title={mobileCollapsed ? '展开顶部信息栏' : '收起顶部信息栏'}
                        >
                            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${mobileCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
                            </svg>
                        </button>

                        {!mobileCollapsed && (
                            <div className="flex flex-col gap-1.5 rounded-[18px] border border-wuxia-gold/12 bg-black/14 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                                {mobileItems.map((item) => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        onClick={() => toggleExpanded(item.type)}
                                        className={`group flex h-8 min-w-[42px] items-center justify-center rounded-xl border px-2 text-[11px] font-semibold tracking-[0.08em] transition-all ${
                                            expandedType === item.type
                                                ? 'border-wuxia-gold/60 bg-wuxia-gold/12 text-wuxia-gold shadow-[0_0_16px_rgba(230,200,110,0.14)]'
                                                : 'border-wuxia-gold/12 bg-black/18 text-wuxia-gold/80 hover:border-wuxia-gold/32 hover:bg-black/28'
                                        }`}
                                        aria-label={item.label}
                                        title={`${item.label}：${item.value}`}
                                    >
                                        <span className={`leading-none ${item.highlight ? 'text-wuxia-gold' : ''}`}>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!mobileCollapsed && expandedType && (
                        <DetailCard
                            title={detailConfigs[expandedType].title}
                            content={detailConfigs[expandedType].content}
                            onClose={closeExpandedPanel}
                            visualConfig={visualConfig}
                            className="left-full top-0 mt-0"
                            panelClassName="w-[min(72vw,320px)] max-w-[320px]"
                        />
                    )}
                </div>
            </div>

            <div className="hidden md:flex items-center justify-between w-full px-20 relative z-10 h-full">
                <div className="flex items-center">
                    <div className="flex items-center">
                        <div className="relative">
                            <TopItem 
                                label="天气" 
                                value={weatherDisplay} 
                                visualConfig={visualConfig} 
                                isExpanded={expandedType === 'weather'}
                                onMouseEnter={() => setExpandedType('weather')}
                                onMouseLeave={() => setExpandedType(null)}
                            />
                            {expandedType === 'weather' && (
                                <DetailCard 
                                    title={detailConfigs.weather.title}
                                    className="left-0"
                                    onMouseEnter={() => setExpandedType('weather')}
                                    onMouseLeave={() => setExpandedType(null)}
                                    visualConfig={visualConfig}
                                    content={
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 flex items-center justify-center bg-wuxia-gold/10 rounded-full border border-wuxia-gold/20">
                                                <svg viewBox="0 0 64 64" className="w-8 h-8">
                                                    <circle fill="#fbbf24" r="5" cy="24" cx="19"></circle>
                                                    <path d="M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z" fill="#f3f7fe"></path>
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold">{weatherDisplay}</p>
                                                <p className="text-wuxia-gold/60" style={{ fontSize: 顶栏字号(0.96, 13) }}>预计结束：{weatherEnd}</p>
                                            </div>
                                        </div>
                                    }
                                />
                            )}
                        </div>
                        <Divider />
                        <div className="relative">
                            <TopItem 
                                label="环境" 
                                value={environmentDisplay} 
                                visualConfig={visualConfig} 
                                isExpanded={expandedType === 'environment'}
                                onMouseEnter={() => setExpandedType('environment')}
                                onMouseLeave={() => setExpandedType(null)}
                            />
                            {expandedType === 'environment' && (
                                <DetailCard 
                                    title={detailConfigs.environment.title}
                                    className="left-0"
                                    onMouseEnter={() => setExpandedType('environment')}
                                    onMouseLeave={() => setExpandedType(null)}
                                    visualConfig={visualConfig}
                                    content={detailConfigs.environment.content}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="absolute left-1/2 top-0 transform -translate-x-1/2 h-full flex flex-col items-center justify-center pt-0 z-20">
                    <div className="hidden md:flex gap-8 md:gap-16 w-full justify-center absolute top-0">
                        <div className="w-[2px] h-7 md:h-8 bg-gradient-to-b from-wuxia-gold/40 to-black"></div>
                        <div className="w-[2px] h-7 md:h-8 bg-gradient-to-b from-wuxia-gold/40 to-black"></div>
                    </div>
                    <div onClick={toggleFullScreen} className="mt-0 md:mt-4 bg-[#111]/95 border border-wuxia-gold/25 md:border-2 md:border-double md:border-wuxia-gold/50 px-2 md:px-10 py-0.5 md:py-3 rounded-md md:rounded-lg shadow-[0_8px_18px_rgba(0,0,0,0.55)] relative flex flex-col items-center min-w-[104px] md:min-w-[240px] max-w-[118px] md:max-w-none transform md:hover:scale-105 transition-transform duration-500 pointer-events-none md:pointer-events-auto cursor-default md:cursor-pointer">
                        <div className="hidden md:block absolute top-1 left-1 w-2 h-2 border-t border-l border-wuxia-gold/50"></div>
                        <div className="hidden md:block absolute top-1 right-1 w-2 h-2 border-t border-r border-wuxia-gold/50"></div>
                        <div className="hidden md:block absolute bottom-1 left-1 w-2 h-2 border-b border-l border-wuxia-gold/50"></div>
                        <div className="hidden md:block absolute bottom-1 right-1 w-2 h-2 border-b border-r border-wuxia-gold/50"></div>
                        <div className="hidden md:block tracking-[0.08em] md:tracking-[0.1em] text-shadow" style={{ ...topBarStyle, fontWeight: 700, fontSize: 顶栏字号(1.24, 20), lineHeight: 1.3 }}>
                            {fullDateStr}
                        </div>
                        <div className="md:hidden text-shadow text-center leading-tight scale-[0.8]" style={{ color: topBarStyle.color }}>
                            <div style={{ ...topBarStyle, fontSize: 顶栏字号(0.78, 10), lineHeight: 1.05 }}>{mobileDateStr}</div>
                            <div style={{ ...topBarStyle, fontSize: 顶栏字号(0.94, 13), fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.05 }}>{mobileClockStr}</div>
                        </div>
                        <div
                            className="absolute -bottom-2.5 md:-bottom-3 hidden md:flex bg-wuxia-red px-2 md:px-3 py-[1px] md:py-[2px] rounded border border-wuxia-gold/30 shadow-md items-center gap-1 z-30 font-bold tracking-widest max-w-[220px] md:max-w-[460px]"
                            style={{ color: topBarStyle.color, fontFamily: topBarStyle.fontFamily, fontStyle: topBarStyle.fontStyle, fontSize: 顶栏字号(0.96, 13), lineHeight: 1.15 }}
                        >
                            <span className="hidden md:inline opacity-90 truncate" title={locationBadge}>{locationBadge}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center">
                    <div className="flex items-center">
                        <div className="relative">
                            <TopItem 
                                label="节日" 
                                value={festivalDisplay} 
                                highlight={!!currentFestival} 
                                visualConfig={visualConfig} 
                                isExpanded={expandedType === 'festival'}
                                onMouseEnter={() => setExpandedType('festival')}
                                onMouseLeave={() => setExpandedType(null)}
                            />
                            {expandedType === 'festival' && (
                                <DetailCard 
                                    title={detailConfigs.festival.title}
                                    className="right-0 origin-top-right"
                                    onMouseEnter={() => setExpandedType('festival')}
                                    onMouseLeave={() => setExpandedType(null)}
                                    visualConfig={visualConfig}
                                    content={detailConfigs.festival.content}
                                />
                            )}
                        </div>
                        <Divider />
                        <TopItem label="历程" value={`第 ${derivedDayCount} 天`} visualConfig={visualConfig} />
                    </div>
                </div>
            </div>
            <div className="absolute bottom-0 w-full h-[1px] bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
        </div>
    );
};

export default TopBar;
