import React from 'react';
import { 视觉设置结构, 可用视觉区域, 区域文字样式结构, 字体资源结构, 可用UI文字令牌, UI文字样式结构 } from '../types';

export const 默认系统字体列表: 字体资源结构[] = [
    { id: 'system-serif', 名称: '古雅衬线', fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', 来源: 'system' },
    { id: 'system-sans', 名称: '清晰黑体', fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif', 来源: 'system' },
    { id: 'system-mono', 名称: '等宽机刻', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace', 来源: 'system' },
    { id: 'system-song', 名称: '宋韵正文', fontFamily: '"SimSun", "Songti SC", serif', 来源: 'system' },
    { id: 'system-kai', 名称: '行云楷体', fontFamily: '"KaiTi", "STKaiti", serif', 来源: 'system' }
];

export const 默认区域样式: Record<可用视觉区域, Required<Pick<区域文字样式结构, '启用自定义' | '字体ID' | '字体颜色' | '字号' | '行高' | '字形'>>> = {
    聊天: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#f3f4f6', 字号: 16, 行高: 1.6, 字形: 'normal' },
    旁白: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#d1d5db', 字号: 16, 行高: 1.9, 字形: 'normal' },
    角色对话: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#111827', 字号: 16, 行高: 1.7, 字形: 'normal' },
    判定: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#f5e7a1', 字号: 15, 行高: 1.5, 字形: 'normal' },
    顶部栏: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#e6c86e', 字号: 14, 行高: 1.3, 字形: 'normal' },
    左侧栏: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#f3f4f6', 字号: 13, 行高: 1.45, 字形: 'normal' },
    右侧栏: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#e6c86e', 字号: 13, 行高: 1.45, 字形: 'normal' },
    角色档案: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#f3f4f6', 字号: 15, 行高: 1.7, 字形: 'normal' }
};

export const 默认UI文字样式: Record<可用UI文字令牌, Required<Pick<UI文字样式结构, '启用自定义' | '字体ID' | '字体颜色' | '字号' | '行高' | '字形'>>> = {
    页面标题: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#e6c86e', 字号: 28, 行高: 1.2, 字形: 'normal' },
    分组标题: { 启用自定义: false, 字体ID: 'system-serif', 字体颜色: '#f3f4f6', 字号: 18, 行高: 1.35, 字形: 'normal' },
    正文: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#e5e7eb', 字号: 14, 行高: 1.6, 字形: 'normal' },
    辅助文本: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#9ca3af', 字号: 12, 行高: 1.5, 字形: 'normal' },
    按钮: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#f3f4f6', 字号: 13, 行高: 1.2, 字形: 'normal' },
    标签: { 启用自定义: false, 字体ID: 'system-sans', 字体颜色: '#d1d5db', 字号: 11, 行高: 1.3, 字形: 'normal' },
    数字: { 启用自定义: false, 字体ID: 'system-mono', 字体颜色: '#f5e7a1', 字号: 13, 行高: 1.2, 字形: 'normal' },
    等宽信息: { 启用自定义: false, 字体ID: 'system-mono', 字体颜色: '#d1d5db', 字号: 12, 行高: 1.45, 字形: 'normal' }
};

const 主题联动区域颜色: Record<可用视觉区域, string> = {
    聊天: 'rgb(var(--c-paper-white))',
    旁白: 'rgb(var(--c-paper-white))',
    角色对话: 'rgb(var(--c-ink-black))',
    判定: 'rgb(var(--c-wuxia-gold))',
    顶部栏: 'rgb(var(--c-wuxia-gold))',
    左侧栏: 'rgb(var(--c-paper-white))',
    右侧栏: 'rgb(var(--c-wuxia-gold))',
    角色档案: 'rgb(var(--c-paper-white))'
};

export const 视觉区域列表: Array<{ key: 可用视觉区域; label: string; description: string }> = [
    { key: '聊天', label: '聊天正文', description: '用户发言、流式草稿与整体正文默认样式。' },
    { key: '旁白', label: '旁白', description: '剧情叙述、环境描写与小说式段落。' },
    { key: '角色对话', label: '角色对话', description: '角色气泡、姓名牌与对白正文。' },
    { key: '判定', label: '判定卡', description: '判定结果、数值与修饰项卡片。' },
    { key: '顶部栏', label: '顶部栏', description: '天气、时间、节日与地点牌匾。' },
    { key: '左侧栏', label: '左侧栏', description: '角色面板、状态条、装备区。' },
    { key: '右侧栏', label: '右侧栏', description: '系统菜单与操作入口。' },
    { key: '角色档案', label: '角色档案', description: '角色档案弹窗与文牒信息。' }
];

export const UI文字令牌列表: Array<{ key: 可用UI文字令牌; label: string; description: string }> = [
    { key: '页面标题', label: '页面标题', description: '首页、大标题、主要页头。' },
    { key: '分组标题', label: '分组标题', description: '卡片标题、区块标题。' },
    { key: '正文', label: '正文', description: '常规说明、表单与信息正文。' },
    { key: '辅助文本', label: '辅助文本', description: '说明提示、次要注释与空状态。' },
    { key: '按钮', label: '按钮', description: '按钮与主要交互文案。' },
    { key: '标签', label: '标签', description: '小标签、徽记与表头。' },
    { key: '数字', label: '数字', description: '计数、数值、统计块。' },
    { key: '等宽信息', label: '等宽信息', description: '代码、路径、JSON 与调试信息。' }
];

const 生成上传字体族名 = (font: 字体资源结构) => `"Font_${font.id}"`;

export const 规范化视觉设置 = (raw?: Partial<视觉设置结构> | null): 视觉设置结构 => {
    const 字体资源列表 = [
        ...默认系统字体列表,
        ...((Array.isArray(raw?.字体资源列表) ? raw!.字体资源列表 : [])
            .filter((item): item is 字体资源结构 => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.fontFamily === 'string'))
            .map((item): 字体资源结构 => ({
                ...item,
                来源: item.来源 === 'upload' ? 'upload' : 'system',
                名称: typeof item.名称 === 'string' && item.名称.trim() ? item.名称.trim() : item.id,
                fontFamily: item.来源 === 'upload' ? 生成上传字体族名(item) : item.fontFamily
            })))
    ].reduce<字体资源结构[]>((acc, item) => {
        if (acc.some(existing => existing.id === item.id)) return acc;
        acc.push(item);
        return acc;
    }, []);

    const 区域文字样式 = Object.keys(默认区域样式).reduce((acc, key) => {
        const typedKey = key as 可用视觉区域;
        const fallback = 默认区域样式[typedKey];
        const incoming = raw?.区域文字样式?.[typedKey] || {};
        acc[typedKey] = {
            启用自定义: incoming.启用自定义 === true,
            字体ID: typeof incoming.字体ID === 'string' && incoming.字体ID.trim() ? incoming.字体ID : fallback.字体ID,
            字体颜色: typeof incoming.字体颜色 === 'string' && incoming.字体颜色.trim() ? incoming.字体颜色 : fallback.字体颜色,
            字号: Number(incoming.字号) || (typedKey === '聊天' ? Number(raw?.字体大小) || fallback.字号 : fallback.字号),
            行高: Number(incoming.行高) || (typedKey === '聊天' ? Number(raw?.段落间距) || fallback.行高 : fallback.行高),
            字形: incoming.字形 === 'italic' || incoming.字形 === 'normal' ? incoming.字形 : fallback.字形
        };
        return acc;
    }, {} as Record<可用视觉区域, 区域文字样式结构>);

    const UI文字样式 = Object.keys(默认UI文字样式).reduce((acc, key) => {
        const typedKey = key as 可用UI文字令牌;
        const fallback = 默认UI文字样式[typedKey];
        const incoming = raw?.UI文字样式?.[typedKey] || {};
        acc[typedKey] = {
            启用自定义: incoming.启用自定义 === true,
            字体ID: typeof incoming.字体ID === 'string' && incoming.字体ID.trim() ? incoming.字体ID : fallback.字体ID,
            字体颜色: typeof incoming.字体颜色 === 'string' && incoming.字体颜色.trim() ? incoming.字体颜色 : fallback.字体颜色,
            字号: Number(incoming.字号) || fallback.字号,
            行高: Number(incoming.行高) || fallback.行高,
            字形: incoming.字形 === 'italic' || incoming.字形 === 'normal' ? incoming.字形 : fallback.字形
        };
        return acc;
    }, {} as Record<可用UI文字令牌, UI文字样式结构>);

    return {
        时间显示格式: raw?.时间显示格式 === '数字' ? '数字' : '传统',
        背景图片: typeof raw?.背景图片 === 'string' ? raw.背景图片 : '',
        常驻壁纸: typeof raw?.常驻壁纸 === 'string' ? raw.常驻壁纸 : '',
        渲染层数: Math.max(1, Number(raw?.渲染层数) || 10),
        字体大小: Number(raw?.字体大小) || 区域文字样式.聊天.字号,
        段落间距: Number(raw?.段落间距) || 区域文字样式.聊天.行高,
        AI思考流式折叠: raw?.AI思考流式折叠 !== false,
        底部滚动关闭显示: raw?.底部滚动关闭显示 === true,
        字体资源列表,
        区域文字样式,
        UI文字样式
    };
};

export const 获取区域文字样式 = (settings: 视觉设置结构 | undefined, area: 可用视觉区域): Required<Pick<区域文字样式结构, '启用自定义' | '字体ID' | '字体颜色' | '字号' | '行高' | '字形'>> => {
    const normalized = 规范化视觉设置(settings);
    const target = normalized.区域文字样式?.[area] || 默认区域样式[area];
    return {
        启用自定义: target.启用自定义 === true,
        字体ID: target.字体ID || 默认区域样式[area].字体ID,
        字体颜色: target.字体颜色 || 默认区域样式[area].字体颜色,
        字号: Number(target.字号) || 默认区域样式[area].字号,
        行高: Number(target.行高) || 默认区域样式[area].行高,
        字形: target.字形 === 'italic' || target.字形 === 'normal' ? target.字形 : 默认区域样式[area].字形
    };
};

export const 获取区域运行时样式 = (settings: 视觉设置结构 | undefined, area: 可用视觉区域): Required<Pick<区域文字样式结构, '启用自定义' | '字体ID' | '字体颜色' | '字号' | '行高' | '字形'>> => {
    const stored = 获取区域文字样式(settings, area);
    if (stored.启用自定义 === true) {
        return stored;
    }
    const fallback = 默认区域样式[area];
    return {
        启用自定义: false,
        字体ID: fallback.字体ID,
        字体颜色: 主题联动区域颜色[area],
        字号: fallback.字号,
        行高: fallback.行高,
        字形: fallback.字形
    };
};

export const 获取字体资源 = (settings: 视觉设置结构 | undefined, fontId?: string): 字体资源结构 => {
    const normalized = 规范化视觉设置(settings);
    const matched = normalized.字体资源列表?.find(item => item.id === fontId);
    return matched || 默认系统字体列表[0];
};

export const 获取UI文字样式 = (settings: 视觉设置结构 | undefined, token: 可用UI文字令牌): Required<Pick<UI文字样式结构, '启用自定义' | '字体ID' | '字体颜色' | '字号' | '行高' | '字形'>> => {
    const normalized = 规范化视觉设置(settings);
    const target = normalized.UI文字样式?.[token] || 默认UI文字样式[token];
    return {
        启用自定义: target.启用自定义 === true,
        字体ID: target.字体ID || 默认UI文字样式[token].字体ID,
        字体颜色: target.字体颜色 || 默认UI文字样式[token].字体颜色,
        字号: Number(target.字号) || 默认UI文字样式[token].字号,
        行高: Number(target.行高) || 默认UI文字样式[token].行高,
        字形: target.字形 === 'italic' || target.字形 === 'normal' ? target.字形 : 默认UI文字样式[token].字形
    };
};

export const 构建UI文字样式 = (settings: 视觉设置结构 | undefined, token: 可用UI文字令牌): React.CSSProperties => {
    const style = 获取UI文字样式(settings, token);
    const font = 获取字体资源(settings, style.字体ID);
    return {
        fontFamily: font.fontFamily,
        color: style.字体颜色,
        fontStyle: style.字形,
        fontSize: `${style.字号}px`,
        lineHeight: style.行高
    };
};

export const 构建UI文字CSS变量 = (settings: 视觉设置结构 | undefined): React.CSSProperties => {
    const normalized = 规范化视觉设置(settings);
    return UI文字令牌列表.reduce<React.CSSProperties>((acc, item) => {
        const style = 获取UI文字样式(normalized, item.key);
        const font = 获取字体资源(normalized, style.字体ID);
        const tokenKey = item.key;
        acc[`--ui-${tokenKey}-font-family` as any] = font.fontFamily;
        acc[`--ui-${tokenKey}-font-size` as any] = `${style.字号}px`;
        acc[`--ui-${tokenKey}-line-height` as any] = String(style.行高);
        acc[`--ui-${tokenKey}-color` as any] = style.字体颜色;
        acc[`--ui-${tokenKey}-font-style` as any] = style.字形;
        return acc;
    }, {});
};

export const 构建区域文字样式 = (settings: 视觉设置结构 | undefined, area: 可用视觉区域): React.CSSProperties => {
    const areaStyle = 获取区域运行时样式(settings, area);
    const font = 获取字体资源(settings, areaStyle.字体ID);
    return {
        fontFamily: font.fontFamily,
        color: areaStyle.字体颜色,
        fontStyle: areaStyle.字形,
        fontSize: `${areaStyle.字号}px`,
        lineHeight: areaStyle.行高
    };
};

export const 构建字体注入样式文本 = (settings: 视觉设置结构 | undefined): string => {
    const normalized = 规范化视觉设置(settings);
    return (normalized.字体资源列表 || [])
        .filter(item => item.来源 === 'upload' && item.dataUrl)
        .map(item => `@font-face { font-family: ${生成上传字体族名(item)}; src: url(${JSON.stringify(item.dataUrl)}) format("truetype"); font-display: swap; }`)
        .join('\n');
};
