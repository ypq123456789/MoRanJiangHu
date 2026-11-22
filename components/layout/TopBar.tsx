import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { 环境信息结构, 节日结构, 视觉设置结构 } from '../../types';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { normalizeCanonicalGameTime } from '../../hooks/useGame/timeUtils';
import { setNativeSystemBarsHidden } from '../../utils/nativeRuntime';
import { 计算游戏历程天数 } from '../../utils/gameTimeJourney';
import './TopBar.css';

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

type AncestorToken = { type: 'seg'; text: string } | { type: 'ellipsis' };

export const buildVisibleAncestors = (ancestors: string[], collapseLevel: number): AncestorToken[] => {
    if (ancestors.length === 0) return [];
    if (ancestors.length === 1) {
        return collapseLevel >= 1 ? [{ type: 'ellipsis' }] : [{ type: 'seg', text: ancestors[0] }];
    }
    if (ancestors.length === 2) {
        if (collapseLevel <= 0) return [{ type: 'seg', text: ancestors[0] }, { type: 'seg', text: ancestors[1] }];
        if (collapseLevel === 1) return [{ type: 'ellipsis' }, { type: 'seg', text: ancestors[1] }];
        return [{ type: 'ellipsis' }];
    }
    if (collapseLevel <= 0) {
        return ancestors.map((text) => ({ type: 'seg' as const, text }));
    }
    if (collapseLevel === 1) {
        return [
            { type: 'seg', text: ancestors[0] },
            { type: 'ellipsis' },
            { type: 'seg', text: ancestors[ancestors.length - 1] },
        ];
    }
    if (collapseLevel === 2) {
        return [
            { type: 'ellipsis' },
            { type: 'seg', text: ancestors[ancestors.length - 1] },
        ];
    }
    return [{ type: 'ellipsis' }];
};

const getMaxCollapseLevel = (ancestorCount: number): number => {
    if (ancestorCount <= 0) return 0;
    if (ancestorCount === 1) return 1;
    if (ancestorCount === 2) return 2;
    return 3;
};

const WeatherIcon: React.FC<{ weather: string }> = ({ weather }) => {
    if (/[雷电]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 16a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 6.5" />
                <path d="M13 12l-2.2 4h2.7L11.5 21" />
            </svg>
        );
    }
    if (/[雨淋骤]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 15a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17 8.5a3.5 3.5 0 0 1 .5 6.5H6.5Z" />
                <path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
            </svg>
        );
    }
    if (/[雪霜冰]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
            </svg>
        );
    }
    if (/[雾霾岚烟]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M4 9h14M6 13h14M4 17h12" />
            </svg>
        );
    }
    if (/[风沙尘]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10h11a2.5 2.5 0 1 0-2.5-2.5" />
                <path d="M4 15h14a2 2 0 1 1-2 2" />
            </svg>
        );
    }
    if (/[阴云晦]/.test(weather)) {
        return (
            <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 17a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17 10.5a3.5 3.5 0 0 1 .5 6.5H6.5Z" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" className="topbar-weather-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
        </svg>
    );
};

const EnvironmentIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" className="topbar-env-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M3 7.5c1.7-1.6 3.5-1.6 5.2 0s3.5 1.6 5.2 0c1-.9 2-1.3 3.6-1" />
        <path d="M3 12.8c1.7-1.6 3.5-1.6 5.2 0s3.5 1.6 5.2 0c1-.9 2-1.3 3.6-1" />
    </svg>
);

const FullscreenIcon: React.FC<{ active: boolean }> = ({ active }) => (
    <svg viewBox="0 0 20 20" className="topbar-fullscreen-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {active ? (
            <>
                <path d="M7.5 3.5v4h-4" />
                <path d="M12.5 3.5v4h4" />
                <path d="M7.5 16.5v-4h-4" />
                <path d="M12.5 16.5v-4h4" />
            </>
        ) : (
            <>
                <path d="M7 3.5H3.5V7" />
                <path d="M13 3.5h3.5V7" />
                <path d="M7 16.5H3.5V13" />
                <path d="M13 16.5h3.5V13" />
            </>
        )}
    </svg>
);

const ChevronDownIcon: React.FC = () => (
    <svg viewBox="0 0 16 16" className="topbar-loc-chevron" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.5 6.25 8 9.75l3.5-3.5" />
    </svg>
);

const SealStarIcon: React.FC = () => (
    <svg viewBox="0 0 16 16" className="topbar-festival-icon" fill="currentColor" aria-hidden="true">
        <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4 8 1.5Z" />
    </svg>
);

const CalendarIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" className="topbar-journey-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.25" y="4.5" width="13.5" height="12.25" rx="2" />
        <path d="M6.75 2.75v3M13.25 2.75v3M3.5 8.5h13" />
    </svg>
);

const DetailCard: React.FC<{
    title: string;
    content: React.ReactNode;
    onClose?: () => void;
    onExpand?: () => void;
    visualConfig?: 视觉设置结构;
    className?: string; // Add className prop for custom positioning
    panelClassName?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}> = ({ title, content, onClose, onExpand, visualConfig, className, panelClassName, onMouseEnter, onMouseLeave }) => {
    const areaStyle = 构建区域文字样式(visualConfig, '顶部栏');
    return (
        <div 
            role="region"
            aria-label={title}
            className={`absolute top-full mt-1.5 z-[100] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200 ${className || ''}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div
                className={`relative w-64 md:w-80 bg-black/90 backdrop-blur-md border border-wuxia-gold/30 rounded-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden group ${panelClassName || ''}`}
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
            >
                {/* Reference style elements */}
                <div className="pointer-events-none absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-wuxia-gold/40 to-transparent"></div>
                <div className="pointer-events-none absolute -right-16 -top-16 w-32 h-32 bg-wuxia-gold/5 rounded-full blur-3xl group-hover:bg-wuxia-gold/10 transition-colors duration-500"></div>
                
                <h3 className="text-wuxia-gold font-bold text-lg mb-3 border-b border-wuxia-gold/10 pb-1 flex justify-between items-center gap-3" style={areaStyle}>
                    {title}
                    <span className="flex shrink-0 items-center gap-1">
                        {onExpand && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onExpand();
                                }}
                                onTouchStart={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onTouchEnd={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onExpand();
                                }}
                                className="inline-flex h-6 items-center gap-1 rounded-full border border-wuxia-gold/20 px-2 text-[11px] text-wuxia-gold/70 transition-colors hover:border-wuxia-gold/45 hover:text-wuxia-gold"
                                aria-label="展开详情"
                                title="展开详情"
                            >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H3v5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 21H3v-5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 21h5v-5" />
                                </svg>
                                展开
                            </button>
                        )}
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
                    </span>
                </h3>
                <div className="text-sm space-y-2 opacity-90 leading-relaxed" style={areaStyle}>
                    {content}
                </div>
            </div>
        </div>
    );
};

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

const 构建日期短文本 = (parsedTime: { month: number; day: number } | null | undefined): string => {
    if (!parsedTime) return '未知日期';
    return `${parsedTime.month}/${parsedTime.day}`;
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

type ExpandedType = 'weather' | 'environment' | 'time' | 'location' | 'festival' | 'journey' | null;

const MobileInfoButton: React.FC<{
    label: string;
    active?: boolean;
    highlight?: boolean;
    title?: string;
    onClick: () => void;
}> = ({ label, active = false, highlight = false, title, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex h-8 min-w-[38px] items-center justify-center rounded-[18px] border px-1.5 text-[11px] font-semibold tracking-[0.04em] transition-all ${
            active
                ? 'border-wuxia-gold/70 bg-wuxia-gold/14 text-wuxia-gold shadow-[0_0_18px_rgba(230,200,110,0.14)]'
                : 'border-wuxia-gold/18 bg-black/22 text-wuxia-gold/85 hover:border-wuxia-gold/38 hover:bg-black/34'
        } ${highlight ? 'text-wuxia-gold' : ''}`}
        style={{ touchAction: 'manipulation' }}
        aria-label={label}
        title={title || label}
    >
        <span className="leading-none">{label}</span>
    </button>
);

const TopBar: React.FC<Props> = ({ 环境, 游戏初始时间, timeFormat, festivals = [], visualConfig }) => {
    const [expandedType, setExpandedType] = useState<ExpandedType>(null);
    const [desktopExpandedType, setDesktopExpandedType] = useState<ExpandedType>(null);
    const [pinnedType, setPinnedType] = useState<ExpandedType>(null);
    const [fullscreenDetailType, setFullscreenDetailType] = useState<Exclude<ExpandedType, null> | null>(null);
    const [mobileCollapsed, setMobileCollapsed] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(() => (typeof document !== 'undefined' ? hasFullscreenElement() : false));
    const [barSize, setBarSize] = useState('0x0');
    const [fontLoadTick, setFontLoadTick] = useState(0);
    const [collapseState, setCollapseState] = useState<{ key: string; level: number }>({ key: '', level: 0 });

    const lastMobileDismissAtRef = useRef(0);
    const topbarRef = useRef<HTMLDivElement | null>(null);
    const barGridRef = useRef<HTMLDivElement | null>(null);
    const leftSlotRef = useRef<HTMLDivElement | null>(null);
    const rightSlotRef = useRef<HTMLDivElement | null>(null);
    const locationInnerRef = useRef<HTMLSpanElement | null>(null);
    const fullscreenDialogRef = useRef<HTMLDivElement | null>(null);
    const fullscreenCloseBtnRef = useRef<HTMLButtonElement | null>(null);
    const pinnedTypeRef = useRef<ExpandedType>(null);
    const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggerRefs = useRef<Partial<Record<Exclude<ExpandedType, null>, HTMLButtonElement | null>>>({});

    pinnedTypeRef.current = pinnedType;

    const parsedTime = parseEnvTime(环境);
    const derivedDayCount = useMemo(() => {
        return 计算游戏历程天数(parsedTime, parseCanonicalGameTime(游戏初始时间));
    }, [parsedTime, 游戏初始时间]);
    const month = parsedTime?.month ?? null;
    const day = parsedTime?.day ?? null;
    const topBarStyle = 构建区域文字样式(visualConfig, '顶部栏');
    const customTopBarEnabled = Boolean(visualConfig?.区域文字样式?.顶部栏?.启用自定义);
    const 顶栏基础字号 = parseFloat(String(topBarStyle.fontSize ?? '')) || 14;
    const 顶栏字号 = (ratio: number, min = 13) => `${Math.max(min, Math.round(顶栏基础字号 * ratio))}px`;
    const desktopFontScale = customTopBarEnabled
        ? Number(Math.max(0.85, Math.min(1.25, 顶栏基础字号 / 15)).toFixed(3))
        : 1;

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

    const 环境节日名称 = typeof 环境?.节日?.名称 === 'string' ? 环境.节日.名称.trim() : '';
    const 环境节日是否匹配当前日期 = !!currentFestival && !!环境节日名称 && 环境节日名称 === currentFestival.名称;
    const festivalDisplay = currentFestival
        ? currentFestival.名称
        : (环境节日是否匹配当前日期 ? 环境节日名称 : '平常日');
    const hasActiveFestival = Boolean(currentFestival);
    const dateBadge = 构建日期短文本(parsedTime);
    const weatherDisplay = useMemo(() => {
        const rawWeather = (环境 as any)?.天气;
        if (rawWeather && typeof rawWeather === 'object') {
            const current = typeof rawWeather?.天气 === 'string' ? rawWeather.天气.trim() : '';
            return current || '未知';
        }
        return '未知';
    }, [环境]);

    const environmentVars = useMemo(() => (
        Array.isArray(环境?.环境变量)
            ? 环境.环境变量
            : (环境?.环境变量 && typeof 环境.环境变量 === 'object' ? [环境.环境变量 as any] : [])
    ), [环境?.环境变量]);

    const environmentDisplay = useMemo(() => {
        if (environmentVars.length > 0) {
            const names = environmentVars
                .map((item: any) => (typeof item?.名称 === 'string' ? item.名称.trim() : ''))
                .filter(Boolean);
            if (names.length > 0) return names.join('、');
            const descriptions = environmentVars
                .map((item: any) => (typeof item?.描述 === 'string' ? item.描述.trim() : ''))
                .filter(Boolean);
            if (descriptions.length > 0) return descriptions[0];
        }
        return '无';
    }, [environmentVars]);

    const desktopEnvText = useMemo(() => {
        if (environmentVars.length === 0) return '';
        const names = environmentVars
            .map((item: any) => (typeof item?.名称 === 'string' ? item.名称.trim() : ''))
            .filter((value) => value && value !== '无' && value !== '无特殊环境');
        if (names.length > 0) return names.join('、');
        const descriptions = environmentVars
            .map((item: any) => (typeof item?.描述 === 'string' ? item.描述.trim() : ''))
            .filter((value) => value && value !== '无' && value !== '无特殊环境');
        return descriptions[0] || '';
    }, [environmentVars]);

    const weatherEnd = (环境 as any)?.天气?.结束日期 || '长久';

    const locationSegments = useMemo(() => {
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
        // Only collapse adjacent duplicates so the deepest valid field is never dropped when it shares a name with a higher ancestor.
        const dedupedSegments = segments.filter((part, idx) => idx === 0 || part !== segments[idx - 1]);
        return dedupedSegments.length > 0 ? dedupedSegments : ['未知地点'];
    }, [环境?.大地点, 环境?.中地点, 环境?.小地点, 环境?.具体地点]);

    const locationSlashPath = useMemo(() => locationSegments.join(' / '), [locationSegments]);
    const currentLocation = locationSegments[locationSegments.length - 1] || '未知地点';
    const ancestorLocations = useMemo(() => locationSegments.slice(0, -1), [locationSegments]);
    const maxCollapseLevel = getMaxCollapseLevel(ancestorLocations.length);
    const measureKey = `${locationSlashPath}|${barSize}|${desktopEnvText}|${hasActiveFestival ? festivalDisplay : ''}|${weatherDisplay}|${derivedDayCount}|${customTopBarEnabled ? `${desktopFontScale}:${String(topBarStyle.fontFamily || '')}` : 'default'}|${fontLoadTick}`;
    const effectiveCollapseLevel = collapseState.key === measureKey ? Math.min(collapseState.level, maxCollapseLevel) : 0;
    const visibleAncestors = useMemo(
        () => buildVisibleAncestors(ancestorLocations, effectiveCollapseLevel),
        [ancestorLocations, effectiveCollapseLevel]
    );

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

    useEffect(() => {
        const syncSystemBars = () => {
            const fullscreenActive = hasFullscreenElement();
            setIsFullscreen(fullscreenActive);
            void setNativeSystemBarsHidden(fullscreenActive);
        };

        document.addEventListener('fullscreenchange', syncSystemBars);
        return () => {
            document.removeEventListener('fullscreenchange', syncSystemBars);
            void setNativeSystemBarsHidden(false);
        };
    }, []);

    useEffect(() => {
        const barEl = barGridRef.current;
        if (!barEl) return;
        const updateSize = () => {
            const nextSize = `${Math.floor(barEl.clientWidth)}x${Math.floor(barEl.clientHeight)}`;
            setBarSize((prev) => (prev === nextSize ? prev : nextSize));
        };
        updateSize();
        const cleanupFns: Array<() => void> = [];
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateSize);
            observer.observe(barEl);
            cleanupFns.push(() => observer.disconnect());
        }
        window.addEventListener('resize', updateSize);
        cleanupFns.push(() => window.removeEventListener('resize', updateSize));

        let cancelled = false;
        const fontSet = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
        const handleFontLoadingDone = () => {
            if (!cancelled) setFontLoadTick((prev) => prev + 1);
        };
        fontSet?.addEventListener('loadingdone', handleFontLoadingDone);
        cleanupFns.push(() => fontSet?.removeEventListener('loadingdone', handleFontLoadingDone));
        if (fontSet?.ready) {
            void fontSet.ready.then(() => {
                if (!cancelled) setFontLoadTick((prev) => prev + 1);
            });
        }
        return () => {
            cancelled = true;
            cleanupFns.forEach((fn) => fn());
        };
    }, []);

    useLayoutEffect(() => {
        if (effectiveCollapseLevel >= maxCollapseLevel) return;
        const barEl = barGridRef.current;
        const leftEl = leftSlotRef.current;
        const rightEl = rightSlotRef.current;
        const innerEl = locationInnerRef.current;
        if (!barEl || !leftEl || !rightEl || !innerEl) return;
        if (barEl.clientWidth <= 0) return;

        const barStyle = window.getComputedStyle(barEl);
        const padX = (parseFloat(barStyle.paddingLeft) || 0) + (parseFloat(barStyle.paddingRight) || 0);
        const colGap = parseFloat(barStyle.columnGap) || 12;
        const sideWidth = Math.max(leftEl.offsetWidth, rightEl.offsetWidth);
        // Prefer symmetric clearance first so center stays visually centered; keep generous breathing room on narrow desktop.
        const symmetricAvail = barEl.clientWidth - padX - sideWidth * 2 - colGap * 2 - 12;
        const totalAvail = barEl.clientWidth - padX - leftEl.offsetWidth - rightEl.offsetWidth - colGap * 2 - 12;
        const proportionCap = barEl.clientWidth <= 1120
            ? Math.floor(barEl.clientWidth * 0.48)
            : Math.floor(barEl.clientWidth * 0.56);
        const rawAvail = Math.max(symmetricAvail, Math.min(totalAvail, symmetricAvail + 48));
        const maxCenterWidth = Math.max(96, Math.floor(Math.min(rawAvail, proportionCap)));
        const neededWidth = Math.ceil(innerEl.scrollWidth) + 16;

        if (neededWidth > maxCenterWidth) {
            setCollapseState({ key: measureKey, level: effectiveCollapseLevel + 1 });
        }
    }, [effectiveCollapseLevel, maxCollapseLevel, measureKey]);

    const clearHoverCloseTimer = useCallback(() => {
        if (hoverCloseTimerRef.current) {
            clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => clearHoverCloseTimer();
    }, [clearHoverCloseTimer]);

    useEffect(() => {
        if (desktopExpandedType === 'environment' && !desktopEnvText) {
            setDesktopExpandedType(null);
            if (pinnedType === 'environment') setPinnedType(null);
        }
        if (desktopExpandedType === 'festival' && !hasActiveFestival) {
            setDesktopExpandedType(null);
            if (pinnedType === 'festival') setPinnedType(null);
        }
    }, [desktopExpandedType, pinnedType, desktopEnvText, hasActiveFestival]);

    const closeDesktopPanel = useCallback((returnFocus = false) => {
        clearHoverCloseTimer();
        const prevType = desktopExpandedType;
        setPinnedType(null);
        setDesktopExpandedType(null);
        if (returnFocus && prevType) {
            triggerRefs.current[prevType]?.focus();
        }
    }, [clearHoverCloseTimer, desktopExpandedType]);

    const closeFullscreenDetail = useCallback(() => {
        clearHoverCloseTimer();
        const prevType = fullscreenDetailType;
        setFullscreenDetailType(null);
        setPinnedType(null);
        setDesktopExpandedType(null);
        if (prevType) {
            requestAnimationFrame(() => {
                const primary = triggerRefs.current[prevType];
                if (primary && primary.isConnected) {
                    primary.focus();
                    return;
                }
                const fallback = triggerRefs.current.journey
                    || triggerRefs.current.location
                    || triggerRefs.current.weather;
                fallback?.focus();
            });
        }
    }, [clearHoverCloseTimer, fullscreenDetailType]);

    useEffect(() => {
        if (!fullscreenDetailType) return;
        if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < 768) return;
        const dialog = fullscreenDialogRef.current;
        if (!dialog || !dialog.contains(document.activeElement)) {
            fullscreenCloseBtnRef.current?.focus();
        }
    }, [fullscreenDetailType, barSize]);

    useEffect(() => {
        if (!desktopExpandedType && !fullscreenDetailType) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (fullscreenDetailType) {
                event.preventDefault();
                closeFullscreenDetail();
                return;
            }
            if (desktopExpandedType) {
                event.preventDefault();
                const focusInsideTopbar = Boolean(
                    topbarRef.current &&
                    document.activeElement &&
                    topbarRef.current.contains(document.activeElement)
                );
                closeDesktopPanel(focusInsideTopbar);
            }
        };

        const handlePointerDown = (event: PointerEvent) => {
            if (fullscreenDetailType) return;
            const target = event.target as Node | null;
            if (topbarRef.current && target && !topbarRef.current.contains(target)) {
                closeDesktopPanel(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('pointerdown', handlePointerDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [desktopExpandedType, fullscreenDetailType, closeDesktopPanel, closeFullscreenDetail]);

    const openDesktopOnHover = (type: Exclude<ExpandedType, null>) => {
        clearHoverCloseTimer();
        if (pinnedTypeRef.current && pinnedTypeRef.current !== type) return;
        setDesktopExpandedType(type);
    };

    const scheduleDesktopHoverClose = (type: Exclude<ExpandedType, null>) => {
        clearHoverCloseTimer();
        if (pinnedTypeRef.current === type) return;
        hoverCloseTimerRef.current = setTimeout(() => {
            if (pinnedTypeRef.current === type) return;
            const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
            if (activeEl && activeEl instanceof HTMLElement && activeEl.closest('.desktop-topbar-card')) {
                return;
            }
            setDesktopExpandedType((prev) => (prev === type ? null : prev));
        }, 140);
    };

    const toggleDesktopPin = (type: Exclude<ExpandedType, null>) => {
        clearHoverCloseTimer();
        if (pinnedType === type && desktopExpandedType === type) {
            setPinnedType(null);
            setDesktopExpandedType(null);
            return;
        }
        setPinnedType(type);
        setDesktopExpandedType(type);
    };

    const toggleFullScreen = async () => {
        if (!hasFullscreenElement()) {
            try {
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
                await setNativeSystemBarsHidden(true);
            } catch (err: any) {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            }
        } else if (document.exitFullscreen) {
            try {
                await document.exitFullscreen();
                setIsFullscreen(false);
                await setNativeSystemBarsHidden(false);
            } catch (err: any) {
                console.error(`Error attempting to exit full-screen mode: ${err.message} (${err.name})`);
            }
        } else {
            setIsFullscreen(false);
            await setNativeSystemBarsHidden(false);
        }
    };

    const closeExpandedPanel = () => {
        lastMobileDismissAtRef.current = Date.now();
        setExpandedType(null);
    };

    const openFullscreenDetail = (type: Exclude<ExpandedType, null>) => {
        clearHoverCloseTimer();
        setPinnedType(type);
        setDesktopExpandedType(type);
        setFullscreenDetailType(type);
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
                    <div className="text-wuxia-gold/60" style={{ fontSize: 顶栏字号(0.9, 13) }}>{dateBadge}</div>
                    <div className="italic opacity-80" style={{ fontSize: 顶栏字号(1, 14) }}>{(currentFestival?.描述) || (环境节日是否匹配当前日期 ? 环境.节日?.简介 : '') || '正是寻常好时节。'}</div>
                    {((currentFestival?.效果) || (环境节日是否匹配当前日期 ? 环境.节日?.效果 : '')) && (
                        <div className="mt-3 rounded border border-wuxia-gold/10 bg-wuxia-gold/5 p-2">
                            <div className="mb-1 text-wuxia-gold/60" style={{ fontSize: 顶栏字号(0.9, 13) }}>时节影响</div>
                            <div className="text-wuxia-gold" style={{ fontSize: 顶栏字号(1, 14) }}>{currentFestival?.效果 || (环境节日是否匹配当前日期 ? 环境.节日?.效果 : '')}</div>
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
        { type: 'time' as const, label: '时程', shortLabel: '时', value: `${dateBadge} ${mobileClockStr} / 第${derivedDayCount}天`, highlight: false },
        { type: 'location' as const, label: '地点', shortLabel: '地', value: mobileLocationBadge, highlight: false },
        { type: 'festival' as const, label: '节日', shortLabel: '节', value: festivalDisplay, highlight: !!currentFestival },
    ];

    const desktopLocationDetailContent = (
        <div className="space-y-2">
            <div className="desktop-topbar-card-summary">{locationSlashPath}</div>
            {detailConfigs.location.content}
        </div>
    );

    const desktopBarStyle: React.CSSProperties = customTopBarEnabled
        ? ({
            ['--topbar-custom-ink' as any]: topBarStyle.color,
            ['--topbar-scale' as any]: String(desktopFontScale),
        } as React.CSSProperties)
        : {};

    const handleFullscreenDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;
        const container = fullscreenDialogRef.current;
        if (!container) return;
        const focusables = Array.from(
            container.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
        if (focusables.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey) {
            if (document.activeElement === first || !container.contains(document.activeElement)) {
                event.preventDefault();
                last.focus();
            }
        } else if (document.activeElement === last || !container.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div
            ref={topbarRef}
            className="desktop-game-topbar w-full relative overflow-visible z-[230] pt-[var(--app-safe-top,env(safe-area-inset-top,0px))] md:h-[58px] md:min-h-[58px] md:pt-0"
            style={{ color: topBarStyle.color, fontFamily: topBarStyle.fontFamily, fontStyle: topBarStyle.fontStyle }}
        >
            <div className="md:hidden absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ink-black via-wuxia-gold/40 to-ink-black"></div>

            <div className="md:hidden fixed left-2 top-[calc(var(--app-safe-top,env(safe-area-inset-top,0px))+60px)] z-[88] flex items-start gap-2 pointer-events-auto">
                <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (!mobileCollapsed) closeExpandedPanel();
                                setMobileCollapsed(prev => !prev);
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-[20px] border border-wuxia-gold/24 bg-black/30 text-wuxia-gold shadow-[0_8px_22px_rgba(0,0,0,0.3)] backdrop-blur-md transition-colors hover:border-wuxia-gold/40 hover:bg-black/42"
                            style={{ touchAction: 'manipulation' }}
                            aria-label={mobileCollapsed ? '展开顶部信息栏' : '收起顶部信息栏'}
                            title={mobileCollapsed ? '展开顶部信息栏' : '收起顶部信息栏'}
                        >
                            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${mobileCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
                            </svg>
                        </button>

                        {!mobileCollapsed && (
                            <div className="flex max-h-[min(46vh,380px)] flex-col gap-1.5 overflow-y-auto rounded-[22px] border border-wuxia-gold/14 bg-black/18 p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-md no-scrollbar">
                                {mobileItems.map((item) => (
                                    <MobileInfoButton
                                        key={item.type}
                                        label={item.label}
                                        active={expandedType === item.type}
                                        highlight={item.highlight}
                                        onClick={() => toggleExpanded(item.type)}
                                        title={`${item.label}：${item.value}`}
                                    />
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
                            className="left-full top-0 ml-1 mt-0"
                            panelClassName="w-[min(62vw,300px)] max-w-[300px]"
                        />
                    )}
                </div>
            </div>

            <div
                ref={barGridRef}
                className={`desktop-topbar-grid hidden md:grid ${customTopBarEnabled ? 'desktop-topbar-grid--custom' : ''}`}
                style={desktopBarStyle}
            >
                {/* Left · 天时：天气为主，环境有值才显示软囊 */}
                <div ref={leftSlotRef} className="desktop-topbar-left">
                    <div
                        className="desktop-topbar-slot"
                        onMouseEnter={() => openDesktopOnHover('weather')}
                        onMouseLeave={() => scheduleDesktopHoverClose('weather')}
                    >
                        <button
                            ref={(el) => { triggerRefs.current.weather = el; }}
                            type="button"
                            className="topbar-btn topbar-weather-btn"
                            aria-expanded={desktopExpandedType === 'weather'}
                            aria-label={`天气：${weatherDisplay}`}
                            title={`天气：${weatherDisplay}（预计结束：${weatherEnd}）`}
                            onClick={() => toggleDesktopPin('weather')}
                        >
                            <WeatherIcon weather={weatherDisplay} />
                            <span className="topbar-weather-text">{weatherDisplay}</span>
                        </button>
                        {desktopExpandedType === 'weather' && (
                            <DetailCard
                                title={detailConfigs.weather.title}
                                className="left-0"
                                onClose={() => closeDesktopPanel(true)}
                                onExpand={() => openFullscreenDetail('weather')}
                                onMouseEnter={() => openDesktopOnHover('weather')}
                                onMouseLeave={() => scheduleDesktopHoverClose('weather')}
                                visualConfig={visualConfig}
                                content={
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 flex items-center justify-center bg-wuxia-gold/10 rounded-full border border-wuxia-gold/20 shrink-0">
                                            <WeatherIcon weather={weatherDisplay} />
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

                    {desktopEnvText && (
                        <div
                            className="desktop-topbar-slot"
                            onMouseEnter={() => openDesktopOnHover('environment')}
                            onMouseLeave={() => scheduleDesktopHoverClose('environment')}
                        >
                            <button
                                ref={(el) => { triggerRefs.current.environment = el; }}
                                type="button"
                                className="topbar-btn topbar-env-pill"
                                aria-expanded={desktopExpandedType === 'environment'}
                                aria-label={`环境：${desktopEnvText}`}
                                title={`周遭环境：${desktopEnvText}`}
                                onClick={() => toggleDesktopPin('environment')}
                            >
                                <EnvironmentIcon />
                                <span className="topbar-env-text">{desktopEnvText}</span>
                            </button>
                            {desktopExpandedType === 'environment' && (
                                <DetailCard
                                    title={detailConfigs.environment.title}
                                    className="left-0"
                                    onClose={() => closeDesktopPanel(true)}
                                    onExpand={() => openFullscreenDetail('environment')}
                                    onMouseEnter={() => openDesktopOnHover('environment')}
                                    onMouseLeave={() => scheduleDesktopHoverClose('environment')}
                                    visualConfig={visualConfig}
                                    content={detailConfigs.environment.content}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Center · 时空：日期时辰全屏入口 + 地点双层锚点 */}
                <div className="desktop-topbar-center">
                    <button
                        type="button"
                        onClick={() => { void toggleFullScreen(); }}
                        className="desktop-game-topbar-date-card topbar-btn topbar-datetime-btn"
                        aria-pressed={isFullscreen}
                        aria-label={`${fullDateStr}，${isFullscreen ? '退出全屏' : '进入全屏'}`}
                        title={isFullscreen ? '点击退出全屏' : '点击进入全屏'}
                    >
                        {parsedTime && (
                            <>
                                <span className="topbar-date-text">{mobileDateStr}</span>
                                <span className="topbar-datetime-sep" aria-hidden="true" />
                            </>
                        )}
                        <span className="topbar-time-text">{displayTime}</span>
                        <FullscreenIcon active={isFullscreen} />
                    </button>

                    <div
                        className="desktop-topbar-slot desktop-topbar-slot--center"
                        onMouseEnter={() => openDesktopOnHover('location')}
                        onMouseLeave={() => scheduleDesktopHoverClose('location')}
                    >
                        <button
                            ref={(el) => { triggerRefs.current.location = el; }}
                            type="button"
                            className={`topbar-btn topbar-location-btn ${effectiveCollapseLevel >= maxCollapseLevel ? 'topbar-location-btn--final-fallback' : ''}`}
                            aria-expanded={desktopExpandedType === 'location'}
                            aria-label={`当前地点：${locationSlashPath}，查看完整层级`}
                            title={locationSlashPath}
                            data-collapse-level={effectiveCollapseLevel}
                            onClick={() => toggleDesktopPin('location')}
                        >
                            <span ref={locationInnerRef} className="topbar-location-inner">
                                {visibleAncestors.map((token, idx) => (
                                    <React.Fragment key={token.type === 'ellipsis' ? `ellipsis-${idx}` : `${token.text}-${idx}`}>
                                        {token.type === 'ellipsis' ? (
                                            <span className="topbar-loc-ellipsis" aria-hidden="true">…</span>
                                        ) : (
                                            <span className="topbar-loc-seg">{token.text}</span>
                                        )}
                                        <span className="topbar-loc-sep" aria-hidden="true">›</span>
                                    </React.Fragment>
                                ))}
                                <span className="topbar-loc-current-wrap">
                                    <span className="topbar-loc-anchor" aria-hidden="true" />
                                    <span className="topbar-loc-current">{currentLocation}</span>
                                    <ChevronDownIcon />
                                </span>
                            </span>
                        </button>
                        {desktopExpandedType === 'location' && (
                            <DetailCard
                                title={detailConfigs.location.title}
                                className="left-1/2 -translate-x-1/2"
                                onClose={() => closeDesktopPanel(true)}
                                onExpand={() => openFullscreenDetail('location')}
                                onMouseEnter={() => openDesktopOnHover('location')}
                                onMouseLeave={() => scheduleDesktopHoverClose('location')}
                                visualConfig={visualConfig}
                                content={desktopLocationDetailContent}
                            />
                        )}
                    </div>
                </div>

                {/* Right · 岁时：古籍朱印节日轻签（有节日才显） + 历程 */}
                <div ref={rightSlotRef} className="desktop-topbar-right">
                    {hasActiveFestival && (
                        <div
                            className="desktop-topbar-slot"
                            onMouseEnter={() => openDesktopOnHover('festival')}
                            onMouseLeave={() => scheduleDesktopHoverClose('festival')}
                        >
                            <button
                                ref={(el) => { triggerRefs.current.festival = el; }}
                                type="button"
                                className="topbar-btn topbar-festival-seal"
                                aria-expanded={desktopExpandedType === 'festival'}
                                aria-label={`节日：${festivalDisplay}`}
                                title={`今日时节：${festivalDisplay}`}
                                onClick={() => toggleDesktopPin('festival')}
                            >
                                <SealStarIcon />
                                <span className="topbar-festival-text">{festivalDisplay}</span>
                            </button>
                            {desktopExpandedType === 'festival' && (
                                <DetailCard
                                    title={detailConfigs.festival.title}
                                    className="right-0 origin-top-right"
                                    onClose={() => closeDesktopPanel(true)}
                                    onExpand={() => openFullscreenDetail('festival')}
                                    onMouseEnter={() => openDesktopOnHover('festival')}
                                    onMouseLeave={() => scheduleDesktopHoverClose('festival')}
                                    visualConfig={visualConfig}
                                    content={detailConfigs.festival.content}
                                />
                            )}
                        </div>
                    )}

                    <div
                        className="desktop-topbar-slot"
                        onMouseEnter={() => openDesktopOnHover('journey')}
                        onMouseLeave={() => scheduleDesktopHoverClose('journey')}
                    >
                        <button
                            ref={(el) => { triggerRefs.current.journey = el; }}
                            type="button"
                            className="topbar-btn topbar-journey-btn"
                            aria-expanded={desktopExpandedType === 'journey'}
                            aria-label={`历程：第 ${derivedDayCount} 天`}
                            title={`行程历程：第 ${derivedDayCount} 天`}
                            onClick={() => toggleDesktopPin('journey')}
                        >
                            <CalendarIcon />
                            <span>第 {derivedDayCount} 天</span>
                        </button>
                        {desktopExpandedType === 'journey' && (
                            <DetailCard
                                title={detailConfigs.journey.title}
                                className="right-0 origin-top-right"
                                onClose={() => closeDesktopPanel(true)}
                                onExpand={() => openFullscreenDetail('journey')}
                                onMouseEnter={() => openDesktopOnHover('journey')}
                                onMouseLeave={() => scheduleDesktopHoverClose('journey')}
                                visualConfig={visualConfig}
                                content={detailConfigs.journey.content}
                            />
                        )}
                    </div>
                </div>
            </div>
            {fullscreenDetailType && (
                <div
                    className="fixed inset-0 z-[260] hidden items-center justify-center bg-black/72 px-10 py-12 backdrop-blur-md md:flex"
                    onClick={closeFullscreenDetail}
                >
                    <div
                        ref={fullscreenDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={detailConfigs[fullscreenDetailType].title}
                        onKeyDown={handleFullscreenDialogKeyDown}
                        className="relative flex max-h-[min(760px,calc(100vh-6rem))] w-[min(860px,calc(100vw-5rem))] flex-col overflow-hidden rounded-2xl border border-wuxia-gold/35 bg-[#070604]/95 p-6 text-wuxia-gold shadow-[0_24px_90px_rgba(0,0,0,0.72)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="pointer-events-none absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
                        <div className="mb-5 flex items-center justify-between gap-4 border-b border-wuxia-gold/15 pb-3">
                            <h2 className="font-bold tracking-[0.18em] text-wuxia-gold" style={{ ...topBarStyle, fontSize: 顶栏字号(1.35, 20), lineHeight: 1.25 }}>
                                {detailConfigs[fullscreenDetailType].title}
                            </h2>
                            <button
                                ref={fullscreenCloseBtnRef}
                                type="button"
                                onClick={closeFullscreenDetail}
                                className="inline-flex h-8 items-center rounded-full border border-wuxia-gold/25 px-3 text-sm text-wuxia-gold/75 transition-colors hover:border-wuxia-gold/55 hover:text-wuxia-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-wuxia-gold"
                            >
                                收起
                            </button>
                        </div>
                        <div
                            tabIndex={0}
                            aria-label={`${detailConfigs[fullscreenDetailType].title}内容`}
                            className="min-h-0 flex-1 overflow-y-auto rounded pr-1 leading-8 text-wuxia-gold/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wuxia-gold/60"
                            style={{ ...topBarStyle, fontSize: 顶栏字号(1.08, 15) }}
                        >
                            {fullscreenDetailType === 'location'
                                ? desktopLocationDetailContent
                                : detailConfigs[fullscreenDetailType].content}
                        </div>
                    </div>
                </div>
            )}
            <div className="absolute bottom-0 w-full h-[1px] bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
        </div>
    );
};

export default TopBar;
