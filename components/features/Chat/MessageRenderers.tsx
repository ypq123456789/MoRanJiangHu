import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { JudgmentThoughtBlock, NPC结构, 视觉设置结构 } from '../../../types';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
import { 获取图片展示地址, 获取图片资源文本地址 } from '../../../utils/imageAssets';
import { IconHeart, IconEye, IconBattery, IconShield, IconCompass, IconExplosion, IconDice } from '../../ui/Icons';

type JudgmentModifier = {
    key: string;
    label: string;
    value: number | null;
    raw: string;
    description?: string;
};

type ParsedJudgment = {
    category: string;
    eventName: string;
    result: string;
    target: string;
    score: number;
    difficulty: number;
    winner?: string;
    loser?: string;
    delta?: number;
    damage?: number;
    cost?: string;
    remaining?: string;
    consequence?: string;
    discovery?: string;
    modifiers: JudgmentModifier[];
};

const createEmptyJudgment = (): ParsedJudgment => ({
    category: '判定',
    eventName: '判定事件',
    result: '未知',
    target: '自身',
    score: 0,
    difficulty: 0,
    modifiers: []
});

const MODIFIER_LABELS: Record<string, string> = {
    基础: '基础',
    境界: '境界',
    环境: '环境',
    状态: '状态',
    幸运: '幸运',
    装备: '装备'
};

const parseModifier = (part: string): JudgmentModifier | null => {
    const modifierMatch = part.match(/^(基础|境界|环境|状态|幸运|装备)\s*([+\-]?\d+(?:\.\d+)?)(?:\s*[(（](.*?)[)）])?$/);
    if (!modifierMatch) return null;
    const [, key, valueRaw, desc] = modifierMatch;
    return {
        key,
        label: MODIFIER_LABELS[key] || key,
        value: Number(valueRaw),
        raw: part,
        description: desc?.trim() || undefined
    };
};

const parseNumericValue = (value: string): number | null => {
    const match = value.match(/[+\-]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const parseJudgmentText = (text: string): ParsedJudgment => {
    const parts = text.split('｜').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return createEmptyJudgment();

    const rawEventName = parts[0] || '判定事件';
    const prefixMatch = rawEventName.match(/^【([^】]+)】\s*(.*)$/);
    const bracketTypeMatch = (prefixMatch?.[2] || rawEventName).match(/^\[([^\]]+)\]\s*(.*)$/);
    const category = bracketTypeMatch?.[1]?.trim() || prefixMatch?.[1]?.trim() || '判定';
    const cleanEventName = (bracketTypeMatch?.[2] || prefixMatch?.[2] || rawEventName).trim();

    const parsed: ParsedJudgment = {
        ...createEmptyJudgment(),
        category,
        modifiers: [],
        eventName: cleanEventName || '判定事件'
    };

    const isResultToken = (token: string) => /(?:结果=)?(成功|失败|大成功|大失败|极成功|极失败|胜利|落败|锁定|偏离|致残|重创|肢残|骨折|破防|截脉|格挡|僵持)/.test(token);
    
    for (const part of parts) {
        if (part.startsWith('结果=')) {
            parsed.result = part.replace(/^结果=/, '').trim();
        } else if (isResultToken(part)) {
            parsed.result = part;
        }
    }

    if (parsed.result === '未知' && parts.length > 1) {
        const fallbackResult = parts[1];
        const isFieldToken = /^(?:触发对象|对象|判定值|胜方|败方|差值|伤害值|消耗|剩余|后果|发现度)[:：\s]/.test(fallbackResult)
            || /^(基础|境界|环境|状态|幸运|装备)\s*[+\-]?\d/.test(fallbackResult) || fallbackResult.startsWith('结果=');
        if (!isFieldToken) {
            parsed.result = fallbackResult;
        }
    }

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (isResultToken(part)) continue;

        const targetMatch = part.match(/^(?:触发对象\s+|对象[:：]\s*)(.+)$/);
        if (targetMatch) {
            parsed.target = targetMatch[1].trim() || parsed.target;
            continue;
        }
        const scoreDiffMatch = part.match(/^判定值\s*([+\-]?\d+(?:\.\d+)?)\s*\/\s*难度\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (scoreDiffMatch) {
            parsed.score = Number(scoreDiffMatch[1]);
            parsed.difficulty = Number(scoreDiffMatch[2]);
            continue;
        }
        const winnerMatch = part.match(/^胜方[:：]\s*(.+)$/);
        if (winnerMatch) {
            parsed.winner = winnerMatch[1].trim();
            continue;
        }
        const loserMatch = part.match(/^败方[:：]\s*(.+)$/);
        if (loserMatch) {
            parsed.loser = loserMatch[1].trim();
            continue;
        }
        const deltaMatch = part.match(/^差值\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (deltaMatch) {
            parsed.delta = Number(deltaMatch[1]);
            continue;
        }
        const damageMatch = part.match(/^伤害值\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (damageMatch) {
            parsed.damage = Number(damageMatch[1]);
            continue;
        }
        const costMatch = part.match(/^消耗[:：]\s*(.+)$/);
        if (costMatch) {
            parsed.cost = costMatch[1].trim();
            continue;
        }
        const remainingMatch = part.match(/^剩余[:：]\s*(.+)$/);
        if (remainingMatch) {
            parsed.remaining = remainingMatch[1].trim();
            continue;
        }
        const consequenceMatch = part.match(/^后果[:：]\s*(.+)$/);
        if (consequenceMatch) {
            parsed.consequence = consequenceMatch[1].trim();
            continue;
        }
        const discoveryMatch = part.match(/^发现度[:：]\s*(.+)$/);
        if (discoveryMatch) {
            parsed.discovery = discoveryMatch[1].trim();
            continue;
        }
        const modifier = parseModifier(part);
        if (modifier) {
            parsed.modifiers.push(modifier);
            continue;
        }
        if (part.startsWith('基础') || part.startsWith('境界') || part.startsWith('环境') || part.startsWith('状态') || part.startsWith('幸运') || part.startsWith('装备')) {
            const key = part.slice(0, 2);
            const valueMatch = part.match(/[+\-]?\d+(?:\.\d+)?/);
            const descMatch = part.match(/[(（](.*?)[)）]/);
            parsed.modifiers.push({
                key,
                label: MODIFIER_LABELS[key] || key,
                value: valueMatch ? Number(valueMatch[0]) : null,
                raw: part,
                description: descMatch ? descMatch[1].trim() : undefined
            });
        }
    }

    return parsed;
};

const 提取判定前缀名称 = (prefix?: string): string => {
    const normalized = (prefix || '').trim();
    const match = normalized.match(/^【([^】]+)】$/);
    return match?.[1]?.trim() || normalized;
};

export const NarratorRenderer: React.FC<{ text: string; visualConfig?: 视觉设置结构 }> = ({ text, visualConfig }) => {
    const style = 构建区域文字样式(visualConfig, '旁白');
    return (
        <div className="w-full my-1 px-8 py-2 bg-white/5 backdrop-blur-sm border-x-4 border-wuxia-gold/55 leading-relaxed relative overflow-hidden rounded-md shadow-lg transition-all duration-300" style={style}>
            <p className="relative z-10 whitespace-pre-wrap break-words tracking-wide" style={{ fontSize: 'inherit', lineHeight: 'inherit' }}>{text}</p>
        </div>
    );
};

const 获取NPC头像地址 = (sender: string, socialList?: NPC结构[]): string => {
    const normalizedSender = (sender || '').trim();
    if (!normalizedSender) return '';
    const candidates = (Array.isArray(socialList) ? socialList : []).filter((npc) => {
        const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
        return name === normalizedSender;
    });
    for (const npc of candidates) {
        const history = Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : [];
        const selectedAvatarImageId = typeof npc?.图片档案?.已选头像图片ID === 'string'
            ? npc.图片档案.已选头像图片ID.trim()
            : '';
        const selectedAvatarRecord = selectedAvatarImageId
            ? history.find((item) => item?.id === selectedAvatarImageId && item?.状态 === 'success' && 获取图片展示地址(item))
            : undefined;
        if (获取图片展示地址(selectedAvatarRecord)) {
            return 获取图片展示地址(selectedAvatarRecord);
        }
        const avatarRecord = history.find((item) => item?.状态 === 'success' && item?.构图 === '头像' && 获取图片展示地址(item));
        if (获取图片展示地址(avatarRecord)) {
            return 获取图片展示地址(avatarRecord);
        }
        const recent = npc?.图片档案?.最近生图结果 || npc?.最近生图结果;
        if (recent?.状态 === 'success' && 获取图片展示地址(recent)) {
            return 获取图片展示地址(recent);
        }
    }
    return '';
};

const 规范化称呼 = (value: string): string => value.trim().replace(/^[【\[\(（「『]+/, '').replace(/[】\]\)）」』]+$/, '').trim();

const 是否主角称呼 = (sender: string, playerName?: string): boolean => {
    const normalized = 规范化称呼(sender);
    if (!normalized) return false;
    if (normalized === '你' || normalized === '我') return true;
    if (playerName && normalized === playerName.trim()) return true;
    return false;
};

type 玩家资料 = {
    姓名?: string;
    头像图片URL?: string;
};

const 获取匹配NPC = (sender: string, socialList?: NPC结构[]): NPC结构 | null => {
    const normalizedSender = (sender || '').trim();
    if (!normalizedSender) return null;
    const list = Array.isArray(socialList) ? socialList : [];
    return list.find((npc) => {
        const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
        return name === normalizedSender;
    }) || null;
};

export const CharacterRenderer: React.FC<{
    sender: string;
    text: string;
    visualConfig?: 视觉设置结构;
    socialList?: NPC结构[];
    playerProfile?: 玩家资料;
    onOpenNpcDetail?: (npcId: string) => void;
}> = ({ sender, text, visualConfig, socialList, playerProfile, onOpenNpcDetail }) => {
    use图片资源回源预取(playerProfile?.头像图片URL, socialList);
    const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
    const colors = ['bg-red-900', 'bg-blue-900', 'bg-emerald-900', 'bg-violet-900', 'bg-amber-900'];
    const colorIdx = sender.charCodeAt(0) % colors.length;
    const bgClass = colors[colorIdx];
    const style = 构建区域文字样式(visualConfig, '角色对话');
    const usePlayerAvatar = 是否主角称呼(sender, playerProfile?.姓名);
    const matchedNpc = usePlayerAvatar ? null : 获取匹配NPC(sender, socialList);
    const avatarUrl = usePlayerAvatar ? 获取图片资源文本地址(playerProfile?.头像图片URL) : 获取NPC头像地址(sender, socialList);
    const handleAvatarClick = () => {
        if (matchedNpc?.id && onOpenNpcDetail) {
            onOpenNpcDetail(matchedNpc.id);
            return;
        }
        if (avatarUrl) {
            setAvatarPreviewOpen(true);
        }
    };
    const roleNameStyle: React.CSSProperties = {
        ...style,
        color: '#f3f4f6',
        fontSize: `clamp(10px, calc(${style.fontSize || '16px'} * 0.75), 14px)`,
        lineHeight: 1.2,
        fontWeight: 'bold'
    };

    return (
        <div className="flex w-full my-3 items-start group pl-1 min-w-0">
            <div className="flex flex-col items-center mr-2.5 sm:mr-5 relative z-20 shrink-0">
                <div className={`w-11 h-11 sm:w-16 sm:h-16 ${avatarUrl ? 'bg-black/60' : bgClass} rounded-xl sm:rounded-2xl flex items-center justify-center text-white/90 font-black text-lg sm:text-2xl shadow-[0_8px_16px_rgba(0,0,0,0.6)] border border-white/10 sm:border-2 ring-1 ring-wuxia-gold/20 relative overflow-hidden transition-all group-hover:scale-105 group-hover:ring-wuxia-gold/40 duration-500`}>
                    <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay"></div>
                    {avatarUrl ? (
                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            className="relative z-10 h-full w-full"
                            aria-label={matchedNpc?.id ? `打开 ${sender} 人物详情` : `放大查看 ${sender} 头像`}
                        >
                            <img src={avatarUrl} alt={`${sender} 头像`} className="w-full h-full object-cover" />
                        </button>
                    ) : (
                        <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{sender[0]}</span>
                    )}
                    <div className="absolute inset-0 border border-inset border-white/5 pointer-events-none"></div>
                </div>
                <div className="mt-1.5 sm:mt-2 bg-black/90 border border-wuxia-gold/30 px-2 sm:px-3 py-0.5 rounded shadow-[0_4px_8px_rgba(0,0,0,0.5)] z-20 max-w-[64px] sm:max-w-[90px] text-center backdrop-blur-md relative">
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-wuxia-gold/40 rounded-full"></div>
                    <span className="tracking-wider truncate block" style={roleNameStyle}>{sender}</span>
                </div>
            </div>
            <div className="relative flex-1 mt-0.5 sm:mt-1 min-w-0">
                <div className="relative bg-[#fcfaf7] px-3.5 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] border border-black/10 z-10 min-h-[52px] sm:min-h-[64px] flex items-center group-hover:border-wuxia-gold/40 transition-colors duration-500">
                    <div className="absolute top-3.5 sm:top-4 -left-1.5 w-3 h-3 sm:w-4 sm:h-4 bg-[#fcfaf7] rotate-45 border-l border-b border-black/10 -z-10"></div>
                    <p className="font-medium relative z-10 tracking-wide whitespace-pre-wrap break-words leading-relaxed text-[#1a1a1a]" style={style}>{text}</p>
                </div>
            </div>
            {avatarUrl && avatarPreviewOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[1002] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => setAvatarPreviewOpen(false)}
                >
                    <div
                        className="relative max-h-[88vh] max-w-[88vw]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setAvatarPreviewOpen(false)}
                            className="absolute top-2 right-2 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-xs text-white/90 transition hover:bg-black/75"
                        >
                            关闭
                        </button>
                        <img
                            src={avatarUrl}
                            alt={`${sender} 头像`}
                            className="max-h-[88vh] max-w-[88vw] rounded-2xl border border-white/10 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export const JudgmentRenderer: React.FC<{ text: string; thoughtBlock?: JudgmentThoughtBlock; isNsfw?: boolean; visualConfig?: 视觉设置结构; prefix?: string }> = ({ text, thoughtBlock, isNsfw, visualConfig, prefix }) => {
    const parsed = parseJudgmentText(text);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showThought, setShowThought] = useState(false);
    const thoughtLines = useMemo(() => (thoughtBlock?.text || thoughtBlock?.raw || '')
        .replace(/^【\s*(?:NSFW)?判定\s*】.*$/gmi, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean), [thoughtBlock?.raw, thoughtBlock?.text]);
    
    const scoreValue = parsed.score;
    const difficultyValue = parsed.difficulty;
    const result = parsed.result;
    const style = 构建区域文字样式(visualConfig, '判定');
    const hasScorePair = Number.isFinite(scoreValue) && Number.isFinite(difficultyValue) && (scoreValue !== 0 || difficultyValue !== 0);
    const displayCategory = parsed.category !== '判定'
        ? parsed.category
        : (提取判定前缀名称(prefix) || parsed.category);
    const scoreDelta = hasScorePair ? scoreValue - difficultyValue : null;
    const summaryItems = [
        parsed.winner ? `胜方：${parsed.winner}` : '',
        parsed.loser ? `败方：${parsed.loser}` : '',
        parsed.discovery ? `发现度：${parsed.discovery}` : '',
        parsed.consequence ? `后果：${parsed.consequence}` : ''
    ].filter(Boolean);

    const isSuccess = /(成功|大成功|极成功|胜方|锁定)/.test(result) && !/(失败|大失败|极失败|败方|偏离)/.test(result);
    const isCrit = /(大成功|极成功|大失败|极失败|致残|重创)/.test(result);

    const getTheme = () => {
        if (isNsfw) return {
            border: 'border-pink-500/50',
            bg: 'bg-gradient-to-br from-pink-950/90 to-purple-900/90',
            accent: 'text-pink-400',
            successColor: isSuccess ? 'text-pink-300' : 'text-pink-500/70',
            bar: 'bg-pink-500',
            icon: <IconHeart size={22} />,
            glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]'
        };

        const categoryKey = `${prefix || ''} ${displayCategory}`.trim();
        if (categoryKey.includes('洞察') || categoryKey.includes('瞄准') || categoryKey.includes('识破')) return {
            border: 'border-amber-500/50',
            bg: 'bg-gradient-to-br from-[#1a1500]/95 to-black/95',
            accent: 'text-amber-400',
            successColor: isSuccess ? 'text-amber-200' : 'text-amber-600',
            bar: 'bg-amber-500',
            icon: <IconEye size={22} />,
            glow: 'shadow-[0_0_15px_rgba(245,158,11,0.3)]'
        };
        if (categoryKey.includes('反馈') || categoryKey.includes('消耗') || categoryKey.includes('衰退')) return {
            border: 'border-emerald-500/50',
            bg: 'bg-gradient-to-br from-[#001a0a]/95 to-black/95',
            accent: 'text-emerald-400',
            successColor: isSuccess ? 'text-emerald-200' : 'text-emerald-600',
            bar: 'bg-emerald-500',
            icon: <IconBattery size={22} />,
            glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]'
        };
        if (categoryKey.includes('先机') || categoryKey.includes('防御') || categoryKey.includes('化解') || categoryKey.includes('闪避') || categoryKey.includes('对策')) return {
            border: 'border-cyan-500/50',
            bg: 'bg-gradient-to-br from-[#001a1a]/95 to-black/95',
            accent: 'text-cyan-400',
            successColor: isSuccess ? 'text-cyan-200' : 'text-cyan-600',
            bar: 'bg-cyan-500',
            icon: <IconShield size={22} />,
            glow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]'
        };
        if (categoryKey.includes('态势')) return {
            border: 'border-violet-500/50',
            bg: 'bg-gradient-to-br from-[#12001a]/95 to-black/95',
            accent: 'text-violet-300',
            successColor: isSuccess ? 'text-violet-200' : 'text-violet-500',
            bar: 'bg-violet-500',
            icon: <IconCompass size={22} />,
            glow: 'shadow-[0_0_15px_rgba(139,92,246,0.28)]'
        };
        if (categoryKey.includes('接战') || categoryKey.includes('对撞') || categoryKey.includes('对抗') || categoryKey.includes('伤害') || categoryKey.includes('反击')) return {
            border: 'border-orange-500/50',
            bg: 'bg-gradient-to-br from-[#1a0f00]/95 to-black/95',
            accent: 'text-orange-400',
            successColor: isSuccess ? 'text-orange-200' : 'text-orange-600',
            bar: 'bg-orange-500',
            icon: <IconExplosion size={22} />,
            glow: 'shadow-[0_0_15px_rgba(249,115,22,0.3)]'
        };

        return {
            border: isSuccess ? 'border-wuxia-gold/50' : 'border-gray-600/50',
            bg: isSuccess ? 'bg-gradient-to-br from-[#1a1500]/90 to-black/90' : 'bg-gradient-to-br from-gray-900/90 to-black/90',
            accent: isSuccess ? 'text-wuxia-gold' : 'text-gray-400',
            successColor: isSuccess ? 'text-yellow-200' : 'text-gray-300',
            bar: isSuccess ? 'bg-wuxia-gold' : 'bg-gray-500',
            icon: <IconDice size={22} />,
            glow: isSuccess ? 'shadow-[0_0_15px_rgba(212,175,55,0.2)]' : ''
        };
    };

    const theme = getTheme();

    return (
        <div className="w-full my-4 sm:my-6 px-1.5 sm:px-4 relative group transition-all duration-500 transform hover:scale-[1.01] flex justify-center" style={style}>
            {/* 动态背景发光 */}
            <div className={`absolute inset-0 w-full sm:w-11/12 md:w-5/6 lg:w-3/4 mx-auto rounded-xl ${theme.glow} opacity-40 blur-xl -z-10 transition-opacity group-hover:opacity-70`}></div>
            
            <div className={`relative z-10 w-full sm:w-11/12 md:w-5/6 lg:w-3/4 border-2 ${theme.border} rounded-xl shadow-2xl overflow-hidden ${theme.bg} backdrop-blur-md`}>
                {/* 顶部标题栏 */}
                <button
                    type="button"
                    className="relative w-full flex items-center justify-between gap-1 sm:gap-4 px-2 sm:px-4 py-2 sm:py-3 border-b border-white/10 bg-black/40 text-left transition-colors duration-300 hover:bg-black/50"
                    onClick={() => setIsExpanded(prev => !prev)}
                >
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0 pr-1 sm:pr-4 flex-1">
                        <span className="shrink-0 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{theme.icon}</span>
                        <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 shrink-0">{displayCategory}</span>
                        <span className={`font-black text-xs sm:text-base tracking-[0.1em] sm:tracking-[0.2em] ${theme.accent} truncate`} style={{ fontFamily: style.fontFamily, fontStyle: style.fontStyle }}>{parsed.eventName}</span>
                    </div>

                    {!isExpanded && (
                        <div className={`text-sm sm:text-lg font-black italic tracking-widest sm:tracking-[0.2em] ${theme.successColor} drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] shrink-0 px-1 sm:px-2`} style={{ fontFamily: style.fontFamily }}>
                            {result}
                        </div>
                    )}
                    
                    <div className="flex items-center gap-1 sm:gap-3 shrink-0 ml-auto">
                        {isExpanded && (
                            <div className="hidden sm:flex text-[10px] bg-white/5 px-2.5 py-1 rounded-full text-gray-400 border border-white/10 backdrop-blur-sm">
                                <span className="opacity-40 mr-1.5 font-sans tracking-tighter">对象</span>
                                <span className="text-gray-200 font-bold max-w-[80px] truncate">{parsed.target}</span>
                            </div>
                        )}
                        <span className="text-[9px] font-mono opacity-50 text-gray-300 border border-white/10 px-1 py-0.5 rounded">{isExpanded ? '收起' : '展开'}</span>
                    </div>
                </button>

                {isExpanded && (
                <div className="p-5 flex flex-col items-center relative">
                    {/* 暴击/大成功时的背景扫光 */}
                    {isCrit && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-12 bg-gradient-to-r from-transparent via-white to-transparent rotate-[35deg] animate-sweep"></div>
                        </div>
                    )}

                    {hasScorePair && (
                        <div className="flex items-center gap-5 sm:gap-8 mb-4 sm:mb-6 relative mt-1 sm:mt-2">
                            <div className="flex flex-col items-center">
                                <span className="text-[8px] sm:text-[9px] text-gray-500 tracking-[0.2em] sm:tracking-[0.3em] mb-1.5 opacity-60">难度值</span>
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-gray-500 font-mono font-black text-lg sm:text-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">{difficultyValue}</div>
                            </div>

                            <div className="text-white/10 font-thin text-3xl sm:text-4xl select-none">/</div>

                            <div className="flex flex-col items-center group/score">
                                <span className={`text-[8px] sm:text-[9px] ${theme.accent} tracking-[0.2em] sm:tracking-[0.3em] mb-1.5 opacity-80 font-bold`}>判定值</span>
                                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 ${isSuccess ? theme.border : 'border-gray-800'} ${isSuccess ? 'bg-white/5' : 'bg-black/60'} flex items-center justify-center font-black text-3xl sm:text-4xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] ${theme.successColor} relative overflow-hidden transition-all duration-700 group-hover/score:scale-110`} style={{ fontFamily: style.fontFamily, fontStyle: style.fontStyle }}>
                                    {scoreValue}
                                    {isSuccess && (
                                        <>
                                            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
                                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent"></div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="w-full flex flex-col items-center text-center">
                        <div className={`text-2xl sm:text-3xl font-black italic tracking-[0.2em] sm:tracking-[0.25em] mb-3 sm:mb-5 ${theme.successColor} drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] filter`} style={{ fontFamily: style.fontFamily }}>{result}</div>
                        
                        {/* 战斗核心数值区域 */}
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-w-full px-2 mb-4 sm:mb-5">
                            {parsed.target !== '自身' && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-black/50 border border-white/10 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 text-gray-500 bg-white/5">对象</span>
                                    <span className="px-2 py-1 text-gray-200 font-bold max-w-[100px] truncate">{parsed.target}</span>
                                </div>
                            )}

                            {typeof parsed.damage === 'number' && (
                                <div className="flex items-center text-[11px] sm:text-[13px] bg-rose-950/40 border border-rose-500/50 rounded-lg overflow-hidden shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse">
                                    <span className="px-2 py-1 bg-rose-500/20 text-rose-300 font-bold tracking-widest">伤害</span>
                                    <span className="px-2.5 py-1 text-rose-100 font-black font-mono">-{parsed.damage}</span>
                                </div>
                            )}

                            {parsed.cost && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-cyan-950/40 border border-cyan-500/30 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400">消耗</span>
                                    <span className="px-2 py-1 text-cyan-200 font-bold">{parsed.cost}</span>
                                </div>
                            )}
                            
                            {parsed.remaining && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-emerald-950/40 border border-emerald-500/30 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400">剩余</span>
                                    <span className="px-2 py-1 text-emerald-200 font-bold">{parsed.remaining}</span>
                                </div>
                            )}
                            
                            {(typeof parsed.delta === 'number' || typeof scoreDelta === 'number') && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-amber-950/40 border border-amber-500/30 rounded-lg overflow-hidden shrink-0 hover:bg-amber-900/40 transition-colors">
                                    <span className="px-2 py-1 bg-amber-500/10 text-amber-500">差额</span>
                                    <span className={`px-2 py-1 font-bold font-mono ${(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!) >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                                        {(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!) > 0 ? '+' : ''}{(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {summaryItems.length > 0 && (
                            <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center max-w-[95%] mb-4">
                                {summaryItems.map((item, i) => (
                                    <div key={`${item}-${i}`} className="text-[9px] sm:text-[10px] px-2.5 sm:px-3 py-1 rounded border border-white/5 bg-black/40 text-gray-300 whitespace-nowrap">
                                        {item}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-w-full px-2">
                            {parsed.modifiers.map((detail, i) => {
                                const isPositive = typeof detail.value === 'number' && detail.value > 0;
                                const isNegative = typeof detail.value === 'number' && detail.value < 0;
                                
                                return (
                                    <div 
                                        key={`${detail.key}-${i}`} 
                                        className={`text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border backdrop-blur-md transition-all hover:translate-y-[-2px] flex items-center gap-1.5 ${
                                            isPositive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_2px_8px_rgba(16,185,129,0.2)]' : 
                                            isNegative ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_2px_8px_rgba(244,63,94,0.2)]' : 
                                            'border-white/10 bg-white/5 text-gray-400'
                                        } whitespace-nowrap`}
                                    >
                                        <span className="opacity-60 font-sans tracking-tight uppercase">{detail.label}</span>
                                        <span className="font-black font-mono text-[11px] sm:text-xs">
                                            {detail.value === null ? detail.raw : `${detail.value >= 0 ? `+${detail.value}` : detail.value}`}
                                        </span>
                                        {detail.description && (
                                            <span className="ml-0.5 opacity-90 text-[9px] sm:text-[10px] bg-gradient-to-b from-white/10 to-transparent px-1.5 py-0.5 rounded-sm border border-white/10 italic text-white shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{detail.description}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* 判定思考展开 */}
                        {thoughtLines.length > 0 && (
                            <div className="w-full mt-6 pt-4 border-t border-white/5 text-left">
                                <button
                                    type="button"
                                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 rounded-xl border transition-all duration-300 ${showThought ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:text-white hover:border-white/10'}`}
                                    onClick={() => setShowThought(prev => !prev)}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${theme.bar} ${showThought ? 'animate-pulse' : ''}`}></div>
                                        <span className="text-[10px] font-bold tracking-[0.2em] opacity-80">判定思考</span>
                                    </div>
                                    <span className="text-[9px] font-mono opacity-50">{showThought ? '收起' : '展开'}</span>
                                </button>
                                {showThought && (
                                    <div className="mt-3 rounded-xl border border-white/5 bg-black/60 p-4 text-[13px] leading-relaxed text-gray-300 whitespace-pre-wrap break-words font-sans animate-in fade-in slide-in-from-top-2">
                                        {thoughtLines.join('\n')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                )}
            </div>
            {isCrit && <div className={`absolute inset-0 w-full sm:w-11/12 md:w-5/6 lg:w-3/4 mx-auto rounded-xl bg-gradient-to-r ${isNsfw ? 'from-pink-500/20' : 'from-wuxia-gold/20'} to-transparent blur-md -z-10`}></div>}
        </div>
    );
};
