import React, { useMemo, useState } from 'react';
import { 环境信息结构, 节日结构, 视觉设置结构 } from '../../types';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { normalizeCanonicalGameTime } from '../../hooks/useGame/timeUtils';

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
    onClick?: () => void;
    onLongPress?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}> = ({ label, value, highlight, visualConfig, isExpanded, onClick, onLongPress, onMouseEnter, onMouseLeave }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    const labelColor = 颜色转透明度(areaStyle.color as string | undefined, 0.62, 'rgba(230, 200, 110, 0.62)');
    const baseFontSize = Number(areaStyle.fontSize) || 14;
    const labelFontSize = `${Math.max(13, Math.round(baseFontSize * 0.96))}px`;
    const valueFontSize = `${Math.max(16, Math.round(baseFontSize * 1.14))}px`;
    
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
            className={`flex flex-col items-center justify-center mx-1 md:mx-4 relative group cursor-pointer transition-all duration-300 ${isExpanded ? 'scale-110' : ''}`} 
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => isLongPressActive.current && e.preventDefault()} // Block context menu on long press
        >
            <div className={`absolute -inset-1.5 border-x border-wuxia-gold/0 group-hover:border-wuxia-gold/20 transition-all duration-500 scale-y-50 group-hover:scale-y-100 ${isExpanded ? 'border-wuxia-gold/40 scale-y-100' : ''}`}></div>
            <div className="tracking-[0.18em] mb-0.5" style={{ ...areaStyle, color: labelColor, fontSize: labelFontSize, lineHeight: 1.1 }}>
                {label}
            </div>
            <div className={`whitespace-nowrap drop-shadow-md transition-transform ${highlight ? 'font-bold animate-pulse scale-[1.03]' : 'group-hover:scale-[1.03]'} ${isExpanded ? 'text-wuxia-gold font-bold' : ''}`} style={{ ...areaStyle, fontSize: valueFontSize, lineHeight: 1.15 }}>
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
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}> = ({ title, content, onClose, visualConfig, className, onMouseEnter, onMouseLeave }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    return (
        <div 
            className={`absolute top-full mt-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="relative w-64 md:w-80 bg-black/90 backdrop-blur-md border border-wuxia-gold/30 rounded-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden group">
                {/* Reference style elements */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-wuxia-gold/40 to-transparent"></div>
                <div className="absolute -right-16 -top-16 w-32 h-32 bg-wuxia-gold/5 rounded-full blur-3xl group-hover:bg-wuxia-gold/10 transition-colors duration-500"></div>
                
                <h3 className="text-wuxia-gold font-bold text-lg mb-3 border-b border-wuxia-gold/10 pb-1 flex justify-between items-center" style={areaStyle}>
                    {title}
                    {onClose && <button onClick={onClose} className="text-wuxia-gold/50 hover:text-wuxia-gold transition-colors text-xs p-1">✕</button>}
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

const toGameMinuteValue = (time: { year: number; month: number; day: number; hour: number; minute: number } | null): number | null => {
    if (!time) return null;
    return (((time.year * 12 + time.month) * 31 + time.day) * 24 + time.hour) * 60 + time.minute;
};

const TopBar: React.FC<Props> = ({ 环境, 游戏初始时间, timeFormat, festivals = [], visualConfig }) => {
    const [mobileLeftMode, setMobileLeftMode] = useState<'weather' | 'environment'>('weather');
    const [mobileRightMode, setMobileRightMode] = useState<'journey' | 'festival'>('journey');
    const [expandedType, setExpandedType] = useState<'weather' | 'environment' | 'festival' | null>(null);

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
    const 顶栏基础字号 = Number(topBarStyle.fontSize) || 14;
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

    const mobileLeftLabel = mobileLeftMode === 'weather' ? '天气' : '环境';
    const mobileLeftValue = mobileLeftMode === 'weather'
        ? weatherDisplay
        : environmentDisplay;
    const mobileRightLabel = mobileRightMode === 'journey' ? '历程' : '节日';
    const mobileRightValue = mobileRightMode === 'journey'
        ? `第 ${derivedDayCount} 天`
        : festivalDisplay;
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

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    };

    const setExpanded = (type: 'weather' | 'environment' | 'festival' | null) => {
        setExpandedType(type);
    };

    const handleMobileToggle = (side: 'left' | 'right') => {
        if (side === 'left') {
            setMobileLeftMode(prev => (prev === 'weather' ? 'environment' : 'weather'));
        } else {
            setMobileRightMode(prev => (prev === 'journey' ? 'festival' : 'journey'));
        }
    };

    const handleMobileLongPress = (type: 'weather' | 'environment' | 'festival') => {
        if (expandedType === type) setExpandedType(null);
        else setExpandedType(type);
    };

    return (
        <div className="h-12 md:h-[58px] w-full flex items-center justify-center relative overflow-visible z-50 bg-[#000]" style={{ color: topBarStyle.color, fontFamily: topBarStyle.fontFamily, fontStyle: topBarStyle.fontStyle }}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ink-black via-wuxia-gold/40 to-ink-black"></div>
            <div className="flex items-center justify-between w-full px-4 md:px-20 relative z-10 h-full">
                <div className="flex items-center">
                    <div className="md:hidden relative">
                        <TopItem 
                            label={mobileLeftLabel} 
                            value={mobileLeftValue} 
                            visualConfig={visualConfig} 
                            isExpanded={expandedType === mobileLeftMode}
                            onClick={() => handleMobileToggle('left')} 
                            onLongPress={() => handleMobileLongPress(mobileLeftMode)}
                        />
                        {expandedType === 'weather' && mobileLeftMode === 'weather' && (
                            <DetailCard 
                                title="天象变更"
                                className="left-0"
                                onClose={() => setExpandedType(null)}
                                visualConfig={visualConfig}
                                content={
                                    <>
                                        <p><span className="text-wuxia-gold/60">当前天气：</span>{weatherDisplay}</p>
                                        <p><span className="text-wuxia-gold/60">预计结束：</span>{weatherEnd}</p>
                                    </>
                                }
                            />
                        )}
                        {expandedType === 'environment' && mobileLeftMode === 'environment' && (
                            <DetailCard 
                                title="周遭环境"
                                className="left-0"
                                onClose={() => setExpandedType(null)}
                                visualConfig={visualConfig}
                                content={
                                    <div className="space-y-4">
                                        {(环境.环境变量 || []).map((ev, i) => (
                                            <div key={i} className="border-l-2 border-wuxia-gold/20 pl-2">
                                                <div className="font-bold text-wuxia-gold">{ev.名称}</div>
                                                <div className="opacity-80 mt-1" style={{ fontSize: 顶栏字号(1, 14) }}>{ev.描述}</div>
                                                {ev.效果 && <div className="text-green-400/80 mt-1 italic" style={{ fontSize: 顶栏字号(0.94, 13) }}>{ev.效果}</div>}
                                            </div>
                                        ))}
                                        {(!环境.环境变量 || 环境.环境变量.length === 0) && <p>风平浪静，并无特殊环境。</p>}
                                    </div>
                                }
                            />
                        )}
                    </div>
                    <div className="hidden md:flex items-center">
                        <div className="relative">
                            <TopItem 
                                label="天气" 
                                value={weatherDisplay} 
                                visualConfig={visualConfig} 
                                isExpanded={expandedType === 'weather'}
                                onMouseEnter={() => setExpanded('weather')}
                                onMouseLeave={() => setExpanded(null)}
                            />
                            {expandedType === 'weather' && (
                                <DetailCard 
                                    title="天象变更"
                                    className="left-0"
                                    onMouseEnter={() => setExpanded('weather')}
                                    onMouseLeave={() => setExpanded(null)}
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
                                onMouseEnter={() => setExpanded('environment')}
                                onMouseLeave={() => setExpanded(null)}
                            />
                            {expandedType === 'environment' && (
                                <DetailCard 
                                    title="周遭环境"
                                    className="left-0"
                                    onMouseEnter={() => setExpanded('environment')}
                                    onMouseLeave={() => setExpanded(null)}
                                    visualConfig={visualConfig}
                                    content={
                                        <div className="space-y-4">
                                            {(环境.环境变量 || []).map((ev, i) => (
                                                <div key={i} className="border-l-2 border-wuxia-gold/20 pl-2">
                                                    <div className="font-bold text-wuxia-gold">{ev.名称}</div>
                                                    <div className="opacity-80 mt-1" style={{ fontSize: 顶栏字号(1, 14) }}>{ev.描述}</div>
                                                    {ev.效果 && <div className="text-green-400/80 mt-1 italic" style={{ fontSize: 顶栏字号(0.94, 13) }}>{ev.效果}</div>}
                                                </div>
                                            ))}
                                            {(!环境.环境变量 || 环境.环境变量.length === 0) && <p>风平浪静，并无特殊环境。</p>}
                                        </div>
                                    }
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="absolute left-1/2 top-0 transform -translate-x-1/2 h-full flex flex-col items-center justify-start pt-0 z-20">
                    <div className="flex gap-8 md:gap-16 w-full justify-center absolute top-0">
                        <div className="w-[2px] h-7 md:h-8 bg-gradient-to-b from-wuxia-gold/40 to-black"></div>
                        <div className="w-[2px] h-7 md:h-8 bg-gradient-to-b from-wuxia-gold/40 to-black"></div>
                    </div>
                    <div onClick={toggleFullScreen} className="mt-2.5 md:mt-4 bg-[#111] border-2 border-double border-wuxia-gold/50 px-4 md:px-10 py-1.5 md:py-3 rounded-lg shadow-[0_10px_20px_rgba(0,0,0,0.8)] relative flex flex-col items-center min-w-[164px] md:min-w-[240px] transform hover:scale-105 transition-transform duration-500 cursor-pointer">
                        <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-wuxia-gold/50"></div>
                        <div className="absolute top-1 right-1 w-2 h-2 border-t border-r border-wuxia-gold/50"></div>
                        <div className="absolute bottom-1 left-1 w-2 h-2 border-b border-l border-wuxia-gold/50"></div>
                        <div className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-wuxia-gold/50"></div>
                        <div className="hidden md:block tracking-[0.08em] md:tracking-[0.1em] text-shadow" style={{ ...topBarStyle, fontWeight: 700, fontSize: 顶栏字号(1.24, 20), lineHeight: 1.3 }}>
                            {fullDateStr}
                        </div>
                        <div className="md:hidden text-shadow text-center leading-tight" style={{ color: topBarStyle.color }}>
                            <div style={{ ...topBarStyle, fontSize: 顶栏字号(0.98, 13), lineHeight: 1.2 }}>{mobileDateStr}</div>
                            <div style={{ ...topBarStyle, fontSize: 顶栏字号(1.16, 17), fontWeight: 700, letterSpacing: '0.12em' }}>{mobileClockStr}</div>
                        </div>
                        <div
                            className="absolute -bottom-2.5 md:-bottom-3 bg-wuxia-red px-2 md:px-3 py-[1px] md:py-[2px] rounded border border-wuxia-gold/30 shadow-md flex items-center gap-1 z-30 font-bold tracking-widest max-w-[220px] md:max-w-[460px]"
                            style={{ color: topBarStyle.color, fontFamily: topBarStyle.fontFamily, fontStyle: topBarStyle.fontStyle, fontSize: 顶栏字号(0.96, 13), lineHeight: 1.15 }}
                        >
                            <span className="md:hidden opacity-90 truncate" title={mobileLocationBadge}>{mobileLocationBadge}</span>
                            <span className="hidden md:inline opacity-90 truncate" title={locationBadge}>{locationBadge}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center">
                    <div className="md:hidden relative">
                        <TopItem 
                            label={mobileRightLabel} 
                            value={mobileRightValue} 
                            highlight={mobileRightMode === 'festival' && !!currentFestival} 
                            visualConfig={visualConfig} 
                            isExpanded={expandedType === 'festival' && mobileRightMode === 'festival'}
                            onClick={() => handleMobileToggle('right')}
                            onLongPress={() => mobileRightMode === 'festival' && handleMobileLongPress('festival')}
                        />
                        {expandedType === 'festival' && mobileRightMode === 'festival' && (
                            <DetailCard 
                                title="今日时节"
                                className="right-0 origin-top-right"
                                onClose={() => setExpandedType(null)}
                                visualConfig={visualConfig}
                                content={
                                    <div className="space-y-2">
                                        <div className="text-lg font-bold text-wuxia-gold">{festivalDisplay}</div>
                                        <div className="italic opacity-80" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.简介 || (currentFestival?.描述) || '正是寻常好时节。'}</div>
                                        {(环境.节日?.效果 || currentFestival?.效果) && (
                                            <div className="mt-3 p-2 bg-wuxia-gold/5 border border-wuxia-gold/10 rounded">
                                                <div className="text-wuxia-gold/60 mb-1" style={{ fontSize: 顶栏字号(0.9, 13) }}>时节影响</div>
                                                <div className="text-wuxia-gold" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.效果 || currentFestival?.效果}</div>
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        )}
                    </div>
                    <div className="hidden md:flex items-center">
                        <div className="relative">
                            <TopItem 
                                label="节日" 
                                value={festivalDisplay} 
                                highlight={!!currentFestival} 
                                visualConfig={visualConfig} 
                                isExpanded={expandedType === 'festival'}
                                onMouseEnter={() => setExpanded('festival')}
                                onMouseLeave={() => setExpanded(null)}
                            />
                            {expandedType === 'festival' && (
                                <DetailCard 
                                    title="今日时节"
                                    className="right-0 origin-top-right"
                                    onMouseEnter={() => setExpanded('festival')}
                                    onMouseLeave={() => setExpanded(null)}
                                    visualConfig={visualConfig}
                                    content={
                                        <div className="space-y-2">
                                            <div className="text-lg font-bold text-wuxia-gold">{festivalDisplay}</div>
                                            <div className="italic opacity-80" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.简介 || (currentFestival?.描述) || '正是寻常好时节。'}</div>
                                            {(环境.节日?.效果 || currentFestival?.效果) && (
                                                <div className="mt-3 p-2 bg-wuxia-gold/5 border border-wuxia-gold/10 rounded">
                                                    <div className="text-wuxia-gold/60 mb-1" style={{ fontSize: 顶栏字号(0.9, 13) }}>时节影响</div>
                                                    <div className="text-wuxia-gold" style={{ fontSize: 顶栏字号(1, 14) }}>{环境.节日?.效果 || currentFestival?.效果}</div>
                                                </div>
                                            )}
                                        </div>
                                    }
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
