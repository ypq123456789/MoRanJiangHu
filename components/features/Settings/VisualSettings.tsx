import React, { useMemo, useRef, useState } from 'react';
import { 可用视觉区域, 区域文字样式结构, 字体资源结构, 视觉设置结构, 可用UI文字令牌, UI文字样式结构 } from '../../../types';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import GameButton from '../../ui/GameButton';
import InlineSelect from '../../ui/InlineSelect';
import { 获取图片资源文本地址, 是否图片资源引用 } from '../../../utils/imageAssets';
import {
    视觉区域列表,
    UI文字令牌列表,
    默认系统字体列表,
    获取区域文字样式,
    获取区域运行时样式,
    获取UI文字样式,
    规范化视觉设置
} from '../../../utils/visualSettings';

interface Props {
    settings: 视觉设置结构;
    onSave: (settings: 视觉设置结构) => void;
}

const 色板预设 = ['#f3f4f6', '#d1d5db', '#e6c86e', '#fca5a5', '#7dd3fc', '#86efac', '#f9a8d4', '#111827'];
const 区域标签映射 = Object.fromEntries(视觉区域列表.map(item => [item.key, item.label])) as Record<可用视觉区域, string>;
const UI令牌标签映射 = Object.fromEntries(UI文字令牌列表.map(item => [item.key, item.label])) as Record<可用UI文字令牌, string>;

const 解析十六进制颜色 = (color: string) => {
    const normalized = color.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16)
    };
};

const 计算相对亮度 = (color: string) => {
    const rgb = 解析十六进制颜色(color);
    if (!rgb) return 1;
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const 构建预览背景样式 = (fontColor: string) => {
    const luminance = 计算相对亮度(fontColor);
    const isLightText = luminance > 0.42;
    return {
        background: isLightText
            ? 'linear-gradient(180deg, rgba(12,12,14,0.96), rgba(24,20,18,0.98))'
            : 'linear-gradient(180deg, rgba(248,245,238,0.96), rgba(226,216,196,0.96))',
        borderColor: isLightText ? 'rgba(255,255,255,0.1)' : 'rgba(68,58,40,0.25)',
        boxShadow: isLightText
            ? 'inset 0 1px 0 rgba(255,255,255,0.04)'
            : 'inset 0 1px 0 rgba(255,255,255,0.55)'
    };
};

const FrontSlider: React.FC<{
    label: string;
    description?: string;
    min: number;
    max: number;
    step: number;
    value: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, description, min, max, step, value, suffix = '', onChange }) => {
    const ratio = ((value - min) / (max - min || 1)) * 100;
    return (
        <div className="rounded-xl border border-gray-800/80 bg-black/25 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                    <div className="text-sm font-semibold text-gray-200">{label}</div>
                    {description && <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{description}</div>}
                </div>
                <div className="min-w-[72px] rounded-md border border-wuxia-gold/30 bg-wuxia-gold/10 px-2.5 py-1 text-center font-mono text-xs text-wuxia-gold">
                    {Number.isInteger(value) ? value : value.toFixed(1)}{suffix}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-300 transition-colors hover:border-wuxia-gold hover:text-wuxia-gold"
                >
                    -
                </button>
                <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full border border-gray-800 bg-gray-900">
                        <div className="h-full bg-gradient-to-r from-wuxia-gold/60 to-wuxia-cyan/60" style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {Array.from({ length: Math.floor((max - min) / step) + 1 }).slice(0, 7).map((_, idx, arr) => {
                            const tickValue = Number((min + ((max - min) / Math.max(1, arr.length - 1)) * idx).toFixed(1));
                            return (
                                <button
                                    key={`${label}-${tickValue}`}
                                    type="button"
                                    onClick={() => onChange(tickValue)}
                                    className={`rounded border px-2 py-1 text-[10px] transition-colors ${Math.abs(value - tickValue) < 0.05 ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'}`}
                                >
                                    {Number.isInteger(tickValue) ? tickValue : tickValue.toFixed(1)}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-300 transition-colors hover:border-wuxia-gold hover:text-wuxia-gold"
                >
                    +
                </button>
            </div>
        </div>
    );
};

const SegmentedButtons: React.FC<{
    label: string;
    options: Array<{ label: string; value: string }>;
    value: string;
    onChange: (value: string) => void;
}> = ({ label, options, value, onChange }) => (
    <div className="space-y-2">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="grid grid-cols-2 gap-2">
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`relative z-10 rounded-lg border px-3 py-2 text-sm transition-all ${value === option.value ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold shadow-[0_0_12px_rgba(230,200,110,0.08)]' : 'border-gray-800 bg-black/30 text-gray-300 hover:border-gray-600'}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </div>
);

const ColorPickerPanel: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
    const [draft, setDraft] = useState(value);
    React.useEffect(() => setDraft(value), [value]);

    const 提交颜色 = () => {
        const normalized = draft.trim();
        if (/^#([0-9a-fA-F]{6})$/.test(normalized)) onChange(normalized);
    };

    return (
        <div className="space-y-3">
            <div className="text-xs text-gray-400">字体颜色</div>
            <div className="flex flex-wrap gap-2">
                {色板预设.map(color => (
                    <button
                        key={color}
                        type="button"
                        onClick={() => onChange(color)}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${value.toLowerCase() === color.toLowerCase() ? 'scale-110 border-white shadow-[0_0_0_2px_rgba(230,200,110,0.5)]' : 'border-black/40 hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                        title={color}
                    />
                ))}
            </div>
            <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg border border-gray-700" style={{ backgroundColor: value }} />
                <div className="flex-1 rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                    <div className="mb-1 text-[10px] text-gray-500">HEX</div>
                    <div className="flex items-center gap-2">
                        <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={提交颜色}
                            className="w-full bg-transparent text-sm text-gray-200 outline-none"
                            placeholder="#E6C86E"
                        />
                        <button type="button" onClick={提交颜色} className="rounded border border-wuxia-gold/40 px-2 py-1 text-[11px] text-wuxia-gold">
                            应用
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SectionCard: React.FC<React.PropsWithChildren<{ title?: string; description?: string; actions?: React.ReactNode }>> = ({ title, description, actions, children }) => (
    <div className="rounded-2xl border border-gray-800/80 bg-black/25 p-4 md:p-5">
        {(title || actions) && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    {title && <h4 className="font-bold text-paper-white">{title}</h4>}
                    {description && <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>}
                </div>
                {actions}
            </div>
        )}
        {children}
    </div>
);

const VisualSettings: React.FC<Props> = ({ settings, onSave }) => {
    use图片资源回源预取(settings?.背景图片);
    const backgroundFileInputRef = useRef<HTMLInputElement>(null);
    const fontFileInputRef = useRef<HTMLInputElement>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [activeArea, setActiveArea] = useState<可用视觉区域>('聊天');
    const [activeUiToken, setActiveUiToken] = useState<可用UI文字令牌>('页面标题');
    const normalizedSettings = useMemo(() => 规范化视觉设置(settings), [settings]);
    const activeAreaStyle = 获取区域文字样式(normalizedSettings, activeArea);
    const activeRuntimeStyle = 获取区域运行时样式(normalizedSettings, activeArea);
    const activeUiStyle = 获取UI文字样式(normalizedSettings, activeUiToken);
    const 当前字体 = (normalizedSettings.字体资源列表 || 默认系统字体列表).find(item => item.id === activeAreaStyle.字体ID);
    const 当前UI字体 = (normalizedSettings.字体资源列表 || 默认系统字体列表).find(item => item.id === activeUiStyle.字体ID);
    const 字体选项 = (normalizedSettings.字体资源列表 || 默认系统字体列表).map(item => ({ label: item.名称, value: item.id }));
    const 自定义已启用 = activeAreaStyle.启用自定义 !== false;
    const 背景图片资源化 = useMemo(
        () => 是否图片资源引用(normalizedSettings.背景图片),
        [normalizedSettings.背景图片]
    );
    const 背景图片输入值 = useMemo(
        () => (背景图片资源化 ? '' : (normalizedSettings.背景图片 || '')),
        [背景图片资源化, normalizedSettings.背景图片]
    );
    const 背景图片预览地址 = useMemo(
        () => 获取图片资源文本地址(normalizedSettings.背景图片),
        [normalizedSettings.背景图片]
    );
    const previewSurfaceStyle = useMemo(
        () => 构建预览背景样式(activeAreaStyle.字体颜色 || '#f3f4f6'),
        [activeAreaStyle.字体颜色]
    );

    const handleSave = (newSettings: 视觉设置结构) => {
        const next = 规范化视觉设置(newSettings);
        onSave(next);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    const 更新区域样式 = (area: 可用视觉区域, patch: Partial<区域文字样式结构>) => {
        const nextAreaStyles = {
            ...(normalizedSettings.区域文字样式 || {}),
            [area]: {
                ...(normalizedSettings.区域文字样式?.[area] || 获取区域文字样式(normalizedSettings, area)),
                ...patch,
                启用自定义: patch.启用自定义 ?? true
            }
        };
        const next: 视觉设置结构 = { ...normalizedSettings, 区域文字样式: nextAreaStyles };
        if (area === '聊天') {
            next.字体大小 = Number(nextAreaStyles.聊天?.字号) || normalizedSettings.字体大小;
            next.段落间距 = Number(nextAreaStyles.聊天?.行高) || normalizedSettings.段落间距;
        }
        handleSave(next);
    };

    const 切换自定义开关 = () => {
        更新区域样式(activeArea, { 启用自定义: !自定义已启用 });
    };
    const 更新UI文字样式 = (token: 可用UI文字令牌, patch: Partial<UI文字样式结构>) => {
        const nextUiStyles = {
            ...(normalizedSettings.UI文字样式 || {}),
            [token]: {
                ...(normalizedSettings.UI文字样式?.[token] || 获取UI文字样式(normalizedSettings, token)),
                ...patch,
                启用自定义: patch.启用自定义 ?? true
            }
        };
        handleSave({ ...normalizedSettings, UI文字样式: nextUiStyles });
    };

    const toggleTimeFormat = (format: '传统' | '数字') => handleSave({ ...normalizedSettings, 时间显示格式: format });
    const handleBackgroundUrlChange = (value: string) => handleSave({ ...normalizedSettings, 背景图片: value });

    const handleBackgroundFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => handleSave({ ...normalizedSettings, 背景图片: String(reader.result || '') });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleFontImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const id = `upload-${Date.now()}`;
            const font: 字体资源结构 = {
                id,
                名称: file.name.replace(/\.[^.]+$/, ''),
                fontFamily: `"Font_${id}"`,
                来源: 'upload',
                文件名: file.name,
                mimeType: file.type,
                dataUrl: String(reader.result || '')
            };
            const nextSettings = 规范化视觉设置({
                ...normalizedSettings,
                字体资源列表: [...(normalizedSettings.字体资源列表 || 默认系统字体列表), font],
                区域文字样式: {
                    ...(normalizedSettings.区域文字样式 || {}),
                    [activeArea]: {
                        ...(normalizedSettings.区域文字样式?.[activeArea] || 获取区域文字样式(normalizedSettings, activeArea)),
                        字体ID: id,
                        启用自定义: true
                    }
                }
            });
            onSave(nextSettings);
            setShowSuccess(true);
            window.setTimeout(() => setShowSuccess(false), 2000);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const clearBackground = () => handleSave({ ...normalizedSettings, 背景图片: '' });

    const removeImportedFont = (fontId: string) => {
        const nextFonts = (normalizedSettings.字体资源列表 || []).filter(item => item.id !== fontId || item.来源 === 'system');
        const nextAreaStyles = { ...(normalizedSettings.区域文字样式 || {}) };
        const nextUiStyles = { ...(normalizedSettings.UI文字样式 || {}) };
        (Object.keys(nextAreaStyles) as 可用视觉区域[]).forEach(area => {
            if (nextAreaStyles[area]?.字体ID === fontId) {
                nextAreaStyles[area] = {
                    ...nextAreaStyles[area],
                    字体ID: 默认系统字体列表[0].id,
                    启用自定义: true,
                    字形: nextAreaStyles[area]?.字形 || 'normal'
                };
            }
        });
        (Object.keys(nextUiStyles) as 可用UI文字令牌[]).forEach(token => {
            if (nextUiStyles[token]?.字体ID === fontId) {
                nextUiStyles[token] = {
                    ...nextUiStyles[token],
                    字体ID: 默认系统字体列表[0].id,
                    启用自定义: true,
                    字形: nextUiStyles[token]?.字形 || 'normal'
                };
            }
        });
        handleSave({ ...normalizedSettings, 字体资源列表: nextFonts, 区域文字样式: nextAreaStyles, UI文字样式: nextUiStyles });
    };

    const 预览文本 =
        activeArea === '旁白'
            ? '风雪压檐，客栈灯火微摇，门外马蹄声忽近忽远，似有旧人踏夜而来。'
            : activeArea === '角色对话'
                ? '“阁下既然来了，何不入内饮一盏热酒，再谈江湖旧账？”'
                : activeArea === '判定'
                    ? '身法判定｜成功｜触发对象 自身｜判定值 78 / 难度 55｜环境 +10（夜色掩护）'
                    : activeArea === '顶部栏'
                        ? '甲子年·三月初七　巳时 · 二刻'
                        : activeArea === '左侧栏'
                            ? '角色状态 / 身躯 / 行头 / 钱财'
                            : activeArea === '右侧栏'
                                ? '战斗 / 背包 / 剧情 / 江湖设置'
                                : activeArea === '角色档案'
                                    ? '江湖身份文牒：沈孤鸿，寒门出身，持剑行走北地十六州。'
                                    : '你抬手按住刀柄，目光越过堂前人影，只听风里隐约传来铁器相击之声。';
    const UI预览文本 = activeUiToken === '页面标题'
        ? '主界面 / 设置中心 / 主要页头'
        : activeUiToken === '分组标题'
            ? '图片管理 / 变量管理 / 字体设置'
            : activeUiToken === '按钮'
                ? '保存设置 / 应用上限 / 新增 NPC'
                : activeUiToken === '标签'
                    ? '当前壁纸 / 历史上限 / 队列总数'
                    : activeUiToken === '数字'
                        ? '10 / 128 / 2026-03-19'
                        : activeUiToken === '等宽信息'
                            ? '剧情.关键剧情变量组[0]'
                            : activeUiToken === '辅助文本'
                                ? '用于次要说明、注释与空状态提示'
                                : '用于全站主要 UI 的常规正文与表单文字';

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 animate-fadeIn">
            <input ref={backgroundFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundFileUpload} />
            <input ref={fontFileInputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" className="hidden" onChange={handleFontImport} />

            <div className="shrink-0 border-b border-wuxia-gold/30 pb-3">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold font-serif text-wuxia-gold">视觉与显示</h3>
                    </div>
                    {showSuccess && <span className="text-xs font-bold text-green-400 animate-pulse">✔ 配置已保存</span>}
                </div>
            </div>

            <div className="shrink-0 rounded-2xl border border-wuxia-gold/30 bg-[linear-gradient(180deg,rgba(10,10,10,0.96),rgba(18,14,10,0.98))] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-semibold text-wuxia-gold">预览区域 · {区域标签映射[activeArea]}</div>
                    <div className="text-[11px] text-gray-500">当前字体：{当前字体?.名称 || '未选择'}</div>
                </div>
                <div
                    className="min-h-[40px] whitespace-pre-wrap rounded-xl border px-3 py-2"
                    style={{
                        ...previewSurfaceStyle,
                        fontFamily: 当前字体?.fontFamily,
                        color: activeRuntimeStyle.字体颜色,
                        fontStyle: activeRuntimeStyle.字形,
                        fontSize: `${Math.max(12, Number(activeRuntimeStyle.字号) || 16)}px`,
                        lineHeight: activeRuntimeStyle.行高,
                        maxHeight: '64px',
                        overflow: 'hidden'
                    }}
                >
                    {预览文本}
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-800/80 bg-black/20">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-[#0b0b0c] via-[#0b0b0c]/92 to-transparent" />
                <div className="h-full overflow-y-auto px-1 pb-2 pt-4 custom-scrollbar">
                    <div className="space-y-5 px-3 pb-3 md:px-4">
                        <SectionCard
                            title="区域字体与颜色控制"
                            description="一个功能接一个功能，全部纵向排列。先选区域，再按顺序修改字体、字形、颜色、字号、行高与导入字体。"
                            actions={<GameButton onClick={() => fontFileInputRef.current?.click()} variant="secondary" className="px-4 py-2 text-xs">导入字体</GameButton>}
                        >
                            <div className="space-y-4">
                                <div>
                                    <div className="mb-2 text-xs text-gray-400">选择编辑区域</div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {视觉区域列表.map(item => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => setActiveArea(item.key)}
                                                className={`rounded-xl border px-3 py-3 text-left transition-all ${activeArea === item.key ? 'border-wuxia-gold bg-wuxia-gold/10 shadow-[0_0_20px_rgba(230,200,110,0.08)]' : 'border-gray-800 bg-black/25 hover:border-gray-600'}`}
                                            >
                                                <div className="text-sm font-semibold text-gray-200">{item.label}</div>
                                                <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{item.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-wuxia-gold/20 bg-[linear-gradient(145deg,rgba(10,10,10,0.85),rgba(22,18,12,0.92))] p-4">
                                    <div className="mb-4 flex items-center justify-between gap-4">
                                        <div>
                                            <div className="font-semibold text-wuxia-gold">当前编辑：{区域标签映射[activeArea]}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">每个设置块独立纵向排列，避免左右并排带来的阅读和点击干扰。</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={切换自定义开关}
                                            className={`relative inline-flex h-7 w-14 items-center rounded-full border transition-all ${自定义已启用 ? 'border-wuxia-cyan bg-wuxia-cyan/20' : 'border-gray-700 bg-black/40'}`}
                                            aria-pressed={自定义已启用}
                                        >
                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-paper-white shadow transition-transform ${自定义已启用 ? 'translate-x-8' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <div className="mb-2 text-xs text-gray-400">字体选择</div>
                                            <InlineSelect value={activeAreaStyle.字体ID} options={字体选项} onChange={(value) => 更新区域样式(activeArea, { 字体ID: value })} placeholder="选择字体" />
                                        </div>

                                        <SegmentedButtons
                                            label="字形样式"
                                            value={activeAreaStyle.字形}
                                            options={[{ label: '正体', value: 'normal' }, { label: '斜体', value: 'italic' }]}
                                            onChange={(value) => 更新区域样式(activeArea, { 字形: value as 'normal' | 'italic' })}
                                        />

                                        <ColorPickerPanel value={activeAreaStyle.字体颜色} onChange={(value) => 更新区域样式(activeArea, { 字体颜色: value })} />

                                        <FrontSlider
                                            label="字号"
                                            description="使用纯前端按钮与刻度控制，不使用浏览器原生滑杆 UI。"
                                            min={12}
                                            max={52}
                                            step={1}
                                            value={Number(activeAreaStyle.字号) || 16}
                                            suffix="px"
                                            onChange={(value) => 更新区域样式(activeArea, { 字号: value })}
                                        />

                                        <FrontSlider
                                            label="行高"
                                            description="适合正文、对话与判定信息的阅读节奏微调。"
                                            min={1.2}
                                            max={2.4}
                                            step={0.1}
                                            value={Number(activeAreaStyle.行高) || 1.6}
                                            onChange={(value) => 更新区域样式(activeArea, { 行高: value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="已导入字体"
                            description="仅显示前端自定义按钮，不展示浏览器原生文件选择控件。导入后可立即应用到当前区域。"
                        >
                            <div className="space-y-2">
                                {(normalizedSettings.字体资源列表 || []).filter(item => item.来源 === 'upload').length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-800 px-4 py-4 text-center text-sm text-gray-500">当前没有导入字体，可通过上方“导入字体”按钮加载本地字体文件。</div>
                                ) : (
                                    (normalizedSettings.字体资源列表 || []).filter(item => item.来源 === 'upload').map(item => (
                                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-black/25 px-3 py-3">
                                            <div>
                                                <div className="text-sm text-gray-200">{item.名称}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">{item.文件名 || item.id}</div>
                                            </div>
                                            <button type="button" onClick={() => removeImportedFont(item.id)} className="rounded border border-red-900/60 bg-red-900/10 px-3 py-1.5 text-xs text-red-400">
                                                移除
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="聊天正文默认排版"
                            description="这里同步映射到“聊天正文”区域，兼容旧存档结构。"
                        >
                            <div className="space-y-4">
                                <FrontSlider label="正文字号" min={12} max={52} step={1} value={Number(normalizedSettings.字体大小) || 16} suffix="px" onChange={(value) => 更新区域样式('聊天', { 字号: value })} />
                                <FrontSlider label="段落行间距" min={1.2} max={2.4} step={0.1} value={Number(normalizedSettings.段落间距) || 1.6} onChange={(value) => 更新区域样式('聊天', { 行高: value })} />
                            </div>
                        </SectionCard>

                        <SectionCard title="渲染层数 (Render Layers)" description={`当前: ${normalizedSettings.渲染层数 || 10} 回合`}>
                            <FrontSlider
                                label="最近渲染回合数"
                                description="仅渲染最近 N 回合以优化性能，更早记录可在互动历史查看。"
                                min={10}
                                max={100}
                                step={5}
                                value={normalizedSettings.渲染层数 || 10}
                                onChange={(value) => handleSave({ ...normalizedSettings, 渲染层数: Math.round(value) })}
                            />
                        </SectionCard>

                        <SectionCard
                            title="AI思考流式折叠"
                            description="流式传输时默认隐藏前置思考内容，仅保留“正在思考”提示；关闭后继续显示完整思考内容。"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="max-w-[520px] text-xs leading-relaxed text-gray-500">该项仅影响思考内容在流式输出中的可见方式，不影响正文结果。</div>
                                <button
                                    type="button"
                                    onClick={() => handleSave({ ...normalizedSettings, AI思考流式折叠: normalizedSettings.AI思考流式折叠 === false })}
                                    className={`relative inline-flex h-7 w-14 items-center rounded-full border transition-all ${normalizedSettings.AI思考流式折叠 !== false ? 'border-wuxia-cyan bg-wuxia-cyan/20' : 'border-gray-700 bg-black/40'}`}
                                >
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-paper-white shadow transition-transform ${normalizedSettings.AI思考流式折叠 !== false ? 'translate-x-8' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="全局 UI 字体 Token"
                            description="用于首页、新游戏、设置中心、图片管理、保存读取等主要可视化 UI。内容区域字体保持独立。"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {UI文字令牌列表.map(item => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setActiveUiToken(item.key)}
                                            className={`rounded-xl border px-3 py-3 text-left transition-all ${activeUiToken === item.key ? 'border-wuxia-gold bg-wuxia-gold/10 shadow-[0_0_20px_rgba(230,200,110,0.08)]' : 'border-gray-800 bg-black/25 hover:border-gray-600'}`}
                                        >
                                            <div className="text-sm font-semibold text-gray-200">{item.label}</div>
                                            <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{item.description}</div>
                                        </button>
                                    ))}
                                </div>
                                <div className="rounded-xl border border-wuxia-gold/20 bg-[linear-gradient(145deg,rgba(10,10,10,0.85),rgba(22,18,12,0.92))] p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-wuxia-gold">当前编辑：{UI令牌标签映射[activeUiToken]}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">当前字体：{当前UI字体?.名称 || '未选择'}</div>
                                        </div>
                                    </div>
                                    <div
                                        className="mb-4 min-h-[40px] whitespace-pre-wrap rounded-xl border px-3 py-3"
                                        style={{
                                            ...previewSurfaceStyle,
                                            fontFamily: 当前UI字体?.fontFamily,
                                            color: activeUiStyle.字体颜色,
                                            fontStyle: activeUiStyle.字形,
                                            fontSize: `${Math.max(11, Number(activeUiStyle.字号) || 14)}px`,
                                            lineHeight: activeUiStyle.行高
                                        }}
                                    >
                                        {UI预览文本}
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="mb-2 text-xs text-gray-400">字体选择</div>
                                            <InlineSelect value={activeUiStyle.字体ID} options={字体选项} onChange={(value) => 更新UI文字样式(activeUiToken, { 字体ID: value })} placeholder="选择字体" />
                                        </div>
                                        <SegmentedButtons
                                            label="字形样式"
                                            value={activeUiStyle.字形}
                                            options={[{ label: '正体', value: 'normal' }, { label: '斜体', value: 'italic' }]}
                                            onChange={(value) => 更新UI文字样式(activeUiToken, { 字形: value as 'normal' | 'italic' })}
                                        />
                                        <ColorPickerPanel value={activeUiStyle.字体颜色} onChange={(value) => 更新UI文字样式(activeUiToken, { 字体颜色: value })} />
                                        <FrontSlider label="字号" min={10} max={48} step={1} value={Number(activeUiStyle.字号) || 14} suffix="px" onChange={(value) => 更新UI文字样式(activeUiToken, { 字号: value })} />
                                        <FrontSlider label="行高" min={1.1} max={2.2} step={0.1} value={Number(activeUiStyle.行高) || 1.5} onChange={(value) => 更新UI文字样式(activeUiToken, { 行高: value })} />
                                    </div>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="底部栏显示"
                            description="控制游戏底部“世界大事 / 版本号”整条栏位是否显示。开启关闭显示后，将直接隐藏整个底部栏。"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="max-w-[520px] text-xs leading-relaxed text-gray-500">默认显示。关闭后，桌面端底部状态栏和移动端底部世界大事栏都会一起隐藏。</div>
                                <button
                                    type="button"
                                    onClick={() => handleSave({ ...normalizedSettings, 底部滚动关闭显示: normalizedSettings.底部滚动关闭显示 !== true })}
                                    className={`relative inline-flex h-7 w-14 items-center rounded-full border transition-all ${normalizedSettings.底部滚动关闭显示 === true ? 'border-gray-700 bg-black/40' : 'border-wuxia-cyan bg-wuxia-cyan/20'}`}
                                >
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-paper-white shadow transition-transform ${normalizedSettings.底部滚动关闭显示 === true ? 'translate-x-1' : 'translate-x-8'}`} />
                                </button>
                            </div>
                        </SectionCard>

                        <SectionCard title="顶部时间显示格式" description={`当前: ${normalizedSettings.时间显示格式}`}>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => toggleTimeFormat('传统')}
                                    className={`relative overflow-hidden border p-4 text-left transition-all duration-300 ${normalizedSettings.时间显示格式 === '传统' ? 'border-wuxia-gold bg-wuxia-gold/10' : 'border-gray-700 bg-black/40 hover:border-gray-500'}`}
                                >
                                    <div className="mb-1 text-xl font-serif text-wuxia-gold">巳时</div>
                                    <div className="text-xs text-gray-400">传统天干地支</div>
                                    {normalizedSettings.时间显示格式 === '传统' && <div className="absolute right-0 top-0 h-3 w-3 bg-wuxia-gold" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleTimeFormat('数字')}
                                    className={`relative overflow-hidden border p-4 text-left transition-all duration-300 ${normalizedSettings.时间显示格式 === '数字' ? 'border-wuxia-gold bg-wuxia-gold/10' : 'border-gray-700 bg-black/40 hover:border-gray-500'}`}
                                >
                                    <div className="mb-1 text-xl font-serif text-wuxia-gold">09:00</div>
                                    <div className="text-xs text-gray-400">现代数字时钟</div>
                                    {normalizedSettings.时间显示格式 === '数字' && <div className="absolute right-0 top-0 h-3 w-3 bg-wuxia-gold" />}
                                </button>
                            </div>
                        </SectionCard>

                        <SectionCard title="自定义背景" description="背景图片将显示在水墨噪点之下。建议使用深色调图片以保证文字清晰度。">
                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-800 bg-black/25 px-3 py-3">
                                    <div className="mb-1 text-[11px] text-gray-500">图片链接 (URL)</div>
                                    <input
                                        value={背景图片输入值}
                                        onChange={(e) => handleBackgroundUrlChange(e.target.value)}
                                        placeholder="https://example.com/image.jpg"
                                        className="w-full bg-transparent text-sm text-gray-200 outline-none"
                                    />
                                    {背景图片资源化 && (
                                        <div className="mt-2 text-[11px] text-gray-500">
                                            当前使用应用内图片资源。如需改回外链，请直接输入新的 URL。
                                        </div>
                                    )}
                                </div>
                                {背景图片预览地址 && (
                                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-black/25">
                                        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-[11px] text-gray-500">
                                            <span>当前背景预览</span>
                                            <span>{背景图片资源化 ? '应用内资源' : '外链图片'}</span>
                                        </div>
                                        <div className="aspect-[16/6] bg-cover bg-center" style={{ backgroundImage: `url(${背景图片预览地址})` }} />
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <GameButton onClick={() => backgroundFileInputRef.current?.click()} variant="secondary" className="flex-1 text-xs">上传本地图片</GameButton>
                                    {normalizedSettings.背景图片 && <GameButton onClick={clearBackground} variant="danger" className="text-xs sm:px-4">清除</GameButton>}
                                </div>
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VisualSettings;
