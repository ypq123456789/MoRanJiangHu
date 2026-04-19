import React, { useEffect, useMemo, useState } from 'react';
import { GameResponse, NPC结构, 视觉设置结构 } from '../../../types';
import { NarratorRenderer, CharacterRenderer, JudgmentRenderer } from './MessageRenderers';
import GameButton from '../../ui/GameButton';
import { 构建区域文字样式 } from '../../../utils/visualSettings';

interface Props {
    response: GameResponse;
    turnNumber: number;
    isLatest?: boolean;
    rawJson?: string;
    inputTokens?: number;
    responseDurationSec?: number;
    outputTokens?: number;
    onSaveEdit: (newRawText: string) => Promise<string | null> | string | null;
    onPolishTurn?: () => Promise<string | null> | string | null;
    fontSize?: number;
    lineHeight?: number;
    collapseThinkingStream?: boolean;
    visualConfig?: 视觉设置结构;
    socialList?: NPC结构[];
    playerProfile?: { 姓名?: string; 头像图片URL?: string };
    turnAnchorRef?: React.Ref<HTMLDivElement>;
}

const TurnItem: React.FC<Props> = ({
    response,
    turnNumber,
    isLatest = false,
    rawJson,
    inputTokens,
    responseDurationSec,
    outputTokens,
    onSaveEdit,
    onPolishTurn,
    fontSize = 16,
    lineHeight = 1.6,
    collapseThinkingStream = true,
    visualConfig,
    socialList,
    playerProfile,
    turnAnchorRef
}) => {
    const formatRawJson = (raw?: string) => raw || '（该回合未记录原始文本）';

    const [showThinking, setShowThinking] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(formatRawJson(rawJson));
    const [parseError, setParseError] = useState<string | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    const [polishError, setPolishError] = useState<string | null>(null);
    const [showOriginalBody, setShowOriginalBody] = useState(false);
    const chatStyle = 构建区域文字样式(visualConfig, '聊天');

    type 思考阶段 = 'pre' | 'post';
    type 思考分组 = { id: string; label: string; phase: 思考阶段; keys: Array<keyof GameResponse> };

    const thinkingGroups: 思考分组[] = [
        { id: 'native', label: '模型原生思维链', phase: 'pre', keys: ['thinking_native'] },
        { id: 'legacy_pre', label: '前置思考', phase: 'pre', keys: ['thinking_pre'] },
        { id: 'input', label: '玩家输入思考', phase: 'pre', keys: ['t_input'] },
        { id: 'var_plan', label: '变量规划思考', phase: 'pre', keys: ['t_var_plan'] },
        { id: 'plan', label: '剧情规划思考', phase: 'pre', keys: ['t_plan'] },
        { id: 'state', label: '玩家变量思考', phase: 'pre', keys: ['t_state'] },
        { id: 'branch', label: '剧情编排思考', phase: 'pre', keys: ['t_branch'] },
        { id: 'precheck', label: '命令预检思考', phase: 'pre', keys: ['t_precheck'] },
        { id: 'logcheck', label: '正文校验思考', phase: 'post', keys: ['t_logcheck'] },
        { id: 'var', label: '变量变化思考', phase: 'post', keys: ['t_var'] },
        { id: 'npc', label: 'NPC在场思考', phase: 'post', keys: ['t_npc'] },
        { id: 'cmd', label: '命令输出思考', phase: 'post', keys: ['t_cmd'] },
        { id: 'audit', label: '命令核对思考', phase: 'post', keys: ['t_audit'] },
        { id: 'fix', label: '命令纠正思考', phase: 'post', keys: ['t_fix'] },
        { id: 'legacy_post', label: '复核思考', phase: 'post', keys: ['thinking_post'] },
        { id: 'mem', label: '短期记忆思考', phase: 'post', keys: ['t_mem'] },
        { id: 'opts', label: '快速选项思考', phase: 'post', keys: ['t_opts'] }
    ];

    const hasThinkingValue = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
    const 提取思考正文 = (value: string): string => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        const closeRegex = /<\s*\/\s*(thinking|think)\s*>/gi;
        let closeMatch: RegExpExecArray | null = null;
        let lastCloseMatch: RegExpExecArray | null = null;
        while ((closeMatch = closeRegex.exec(trimmed)) !== null) lastCloseMatch = closeMatch;
        if (lastCloseMatch && typeof lastCloseMatch.index === 'number') {
            return trimmed.slice(0, lastCloseMatch.index).replace(/<\s*\/?\s*(thinking|think)\s*>/gi, '').trim();
        }
        const wrapped = trimmed.match(/^<(thinking|think)>\s*([\s\S]*?)\s*$/i);
        if (wrapped && typeof wrapped[2] === 'string') return wrapped[2].trim();
        return trimmed;
    };

    const 获取首个命中字段 = (keys: Array<keyof GameResponse>) => {
        for (const key of keys) {
            const value = response[key];
            if (hasThinkingValue(value)) return { key: key as string, value: 提取思考正文(value) };
        }
        return null;
    };

    const knownThinkingKeys = new Set(thinkingGroups.flatMap(item => item.keys.map(key => key as string)));
    const thinkingExtras = Object.keys(response)
        .filter(key => (key.startsWith('t_') || key.startsWith('thinking_')) && !knownThinkingKeys.has(key) && hasThinkingValue((response as any)[key]))
        .map(key => ({ key, label: `扩展思考 · ${key.replace(/^t_/, '').replace(/^thinking_/, '')}`, value: 提取思考正文((response as any)[key] as string), phase: 'post' as const }));

    const thinkingBlocks = [
        ...thinkingGroups.map(item => {
            const hit = 获取首个命中字段(item.keys);
            if (!hit) return null;
            return { key: hit.key, label: item.label, value: hit.value, phase: item.phase };
        }).filter(Boolean),
        ...thinkingExtras
    ] as Array<{ key: string; label: string; value: string; phase: 思考阶段 }>;

    const preThinkingBlocks = thinkingBlocks.filter(item => item.phase === 'pre');
    const postThinkingBlocks = thinkingBlocks.filter(item => item.phase === 'post');
    const isDisclaimerLog = (log: { sender?: string; text?: string }) => {
        const sender = (log?.sender || '').trim();
        const text = (log?.text || '').trim();
        if (sender === 'disclaimer' || sender === '免责声明' || sender === '【免责声明】') return true;
        return /^【\s*免责声明\s*】/.test(text);
    };

    const 已优化正文 = response.body_optimized === true;
    const 优化标识文本 = response.body_optimized_manual ? '已手动优化' : '已自动优化';
    const 原始正文日志 = Array.isArray(response.body_original_logs) ? response.body_original_logs : [];
    const 可切换原文优化视图 = 已优化正文 && 原始正文日志.length > 0;
    const 当前正文来源提示 = showOriginalBody && 可切换原文优化视图 ? '原文' : '优化';

    useEffect(() => {
        if (!可切换原文优化视图 && showOriginalBody) setShowOriginalBody(false);
    }, [可切换原文优化视图, showOriginalBody]);

    const 当前正文日志 = showOriginalBody && 可切换原文优化视图 ? 原始正文日志 : (Array.isArray(response.logs) ? response.logs : []);
    const displayLogs = 当前正文日志
        .filter(log => !isDisclaimerLog(log))
        .map((log) => ({
            ...log,
            text: String(log?.text || '')
                .replace(/<\s*judge\s*>[\s\S]*?(?:<\s*\/\s*judge\s*>|$)/gi, '')
                .replace(/^\s+/, '')
        }))
        .filter(log => log.text.trim().length > 0);
    const judgeBlocks = Array.isArray(response.judge_blocks)
        ? response.judge_blocks.filter(block => ((block?.text || block?.raw || '').trim().length > 0))
        : [];
    const 判定前缀正则 = /^(【判定】|【NSFW判定】|【先机】|【瞄准】|【接战】|【对撞】|【对抗】|【防御】|【化解】|【伤害】|【态势】|【反击】|【反馈】|【消耗】|【洞察】|【衰退】)/;
    const 判定日志索引映射 = useMemo(() => {
        let currentJudgmentIndex = -1;
        return displayLogs.map((log) => {
            if (判定前缀正则.test(log.sender || '')) {
                currentJudgmentIndex += 1;
                return currentJudgmentIndex;
            }
            return -1;
        });
    }, [displayLogs]);
    const 正文文本 = displayLogs.map(log => log.text || '').join('\n');
    const 中文计数 = (正文文本.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const commands = Array.isArray(response.tavern_commands) ? response.tavern_commands : [];
    const calibrationReports = Array.isArray(response.variable_calibration_report) ? response.variable_calibration_report : [];
    const calibrationCommands = Array.isArray(response.variable_calibration_commands) ? response.variable_calibration_commands : [];
    const hasCalibrationRecord = calibrationReports.length > 0 || calibrationCommands.length > 0;
    const [showCommandChanges, setShowCommandChanges] = useState(false);
    const [showCalibrationDetails, setShowCalibrationDetails] = useState(false);
    const [commandViewMode, setCommandViewMode] = useState<'compact' | 'full'>('compact');
    const commandStats = commands.reduce((acc, cmd) => {
        if (cmd?.action === 'set') acc.set += 1;
        if (cmd?.action === 'add') acc.add += 1;
        if (cmd?.action === 'push') acc.push += 1;
        if (cmd?.action === 'delete') acc.delete += 1;
        return acc;
    }, { set: 0, add: 0, push: 0, delete: 0 });

    const 命令标签映射: Record<'set' | 'add' | 'push' | 'delete', string> = { set: 'SET', add: 'ADD', push: 'PUSH', delete: 'DEL' };
    const 命令样式映射: Record<'set' | 'add' | 'push' | 'delete', string> = {
        set: 'border-blue-500/40 text-blue-200 bg-blue-500/15',
        add: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/15',
        push: 'border-violet-500/40 text-violet-200 bg-violet-500/15',
        delete: 'border-rose-500/40 text-rose-200 bg-rose-500/15'
    };

    const 格式化命令值 = (value: unknown): string => {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (value === null || value === undefined) return 'null';
        try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    };

    const 是否使用预格式化 = (value: unknown): boolean => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'object') return true;
        if (typeof value === 'string' && (value.includes('\n') || value.length > 80)) return true;
        return false;
    };

    const 生成简约值文本 = (value: unknown): string => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (typeof value === 'string') {
            const trimmed = value.replace(/\s+/g, ' ').trim();
            return trimmed.length > 36 ? `${trimmed.slice(0, 36)}...` : trimmed;
        }
        if (Array.isArray(value)) return `数组(${value.length})`;
        if (typeof value === 'object') {
            const keys = Object.keys(value as Record<string, unknown>);
            return `对象{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
        }
        return String(value);
    };

    const commandPanelTitle = isLatest ? '最新变量变化' : '本回合变量变化';
    const canEditRaw = isLatest;

    const handleSave = async () => {
        if (!canEditRaw) {
            setParseError('仅最新回合支持编辑原文，较早回合仅支持查看。');
            return;
        }
        setIsSavingEdit(true);
        try {
            const error = await Promise.resolve(onSaveEdit(editValue));
            if (typeof error === 'string' && error.trim().length > 0) {
                setParseError(error);
                return;
            }
            setIsEditing(false);
            setParseError(null);
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleManualPolish = async () => {
        if (!onPolishTurn || isPolishing) return;
        setIsPolishing(true);
        setPolishError(null);
        try {
            const result = await Promise.resolve(onPolishTurn());
            if (typeof result === 'string' && result.trim().length > 0) setPolishError(result);
        } finally {
            setIsPolishing(false);
        }
    };

    const handleToggleBodyView = () => {
        if (!可切换原文优化视图) return;
        setShowOriginalBody(prev => !prev);
    };

    if (isEditing) {
        return (
            <div className="w-full bg-black/80 border border-wuxia-gold p-4 my-4 relative z-50">
                <h4 className="text-wuxia-gold mb-2 font-mono text-xs">{canEditRaw ? '/// DEBUG: EDIT RESPONSE RAW TEXT ///' : '/// DEBUG: VIEW RESPONSE RAW TEXT ///'}</h4>
                <textarea className={`w-full h-96 bg-gray-900 text-green-400 font-mono text-xs p-4 outline-none border resize-y ${canEditRaw ? 'border-gray-700' : 'border-gray-800 opacity-90'}`} value={editValue} onChange={(e) => setEditValue(e.target.value)} readOnly={!canEditRaw} />
                {!canEditRaw && <div className="text-amber-300 text-xs mt-2">较早回合仅支持查看原文；只有最新回合支持编辑并重新解析。</div>}
                {parseError && <div className="text-red-500 text-xs mt-2">Error: {parseError}</div>}
                <div className="flex justify-end gap-2 mt-2">
                    <GameButton variant="secondary" onClick={() => setIsEditing(false)} className="py-1 px-3 text-xs">关闭</GameButton>
                    {canEditRaw && <GameButton variant="primary" onClick={() => { void handleSave(); }} className="py-1 px-3 text-xs" disabled={isSavingEdit}>{isSavingEdit ? '重解析中...' : '保存并重解析'}</GameButton>}
                </div>
            </div>
        );
    }

    const turnDisplay = turnNumber === 0 ? '开场剧情' : `第 ${turnNumber} 回合`;
    const hasInputTokens = typeof inputTokens === 'number' && Number.isFinite(inputTokens) && inputTokens > 0;
    const hasDuration = typeof responseDurationSec === 'number' && Number.isFinite(responseDurationSec) && responseDurationSec > 0;
    const hasOutputTokens = typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens > 0;
    const 上传Token文本 = hasInputTokens ? Math.floor(inputTokens!).toLocaleString('en-US') : '0';
    const 输出Token文本 = hasOutputTokens ? Math.floor(outputTokens!).toLocaleString('en-US') : '0';

    return (
        <div className="w-full mb-4 relative animate-slide-in group/turn">
            <div ref={turnAnchorRef} className="mb-6 relative w-full px-1.5 sm:px-4">
                <div className="relative mx-auto flex w-fit items-start sm:w-full sm:items-center sm:justify-center sm:gap-0">
                {/* 左侧容器：移动端贴边悬挂在回合牌左侧，桌面端保持左半区收拢 */}
                <div className="absolute top-0 right-[calc(100%+4px)] flex shrink-0 items-center gap-1 flex-nowrap sm:static sm:right-auto sm:flex-1 sm:min-w-0 sm:justify-end sm:gap-2 sm:pr-2">
                    {onPolishTurn && (
                        <button 
                            onClick={() => { void handleManualPolish(); }} 
                            disabled={isPolishing} 
                            className={`p-1 sm:p-1.5 rounded-lg border transition-all shrink-0 ${isPolishing ? 'border-amber-500/70 text-amber-200 bg-amber-500/15' : 'border-white/10 text-gray-400 hover:text-amber-300 hover:border-amber-500/50 hover:bg-white/5'}`} 
                            title={isPolishing ? '正在优化正文...' : '手动优化正文'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isPolishing ? 'animate-spin' : ''}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.25 2.25 0 1 1 3.182 3.182L8.25 19.462 3 21l1.538-5.25 12.324-11.263Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.5 18 11.25" />
                            </svg>
                        </button>
                    )}
                    {thinkingBlocks.length > 0 ? (
                        <button 
                            onClick={() => setShowThinking(!showThinking)} 
                            className={`p-1 sm:p-1.5 rounded-lg border transition-all shrink-0 ${showThinking ? 'bg-wuxia-cyan/30 border-wuxia-cyan/60 text-wuxia-cyan' : 'border-white/10 text-gray-400 hover:text-wuxia-cyan hover:border-wuxia-cyan/50 hover:bg-white/5'}`} 
                            title={collapseThinkingStream ? '查看已折叠的AI思考' : '查看AI思考'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-3.5 sm:h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A8.959 8.959 0 0 1 3 12c0-.778.099-1.533.284-2.253" />
                            </svg>
                        </button>
                    ) : null}
                </div>

                {/* 中间核心标题区域：提高透明度 */}
                <div className="shrink-0 flex flex-col items-center min-w-0 max-w-[46vw] sm:max-w-none">
                    {可切换原文优化视图 ? (
                        <button type="button" onClick={handleToggleBodyView} className="bg-black/40 border border-wuxia-gold/15 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm shadow-md min-w-[96px] sm:min-w-[136px] max-w-full text-center transition-all hover:border-wuxia-gold/40 hover:bg-black/60 hover:scale-[1.02] group/turnbtn active:scale-95" title={`点击切换到${showOriginalBody ? '优化' : '原文'}视图`}>
                            <span className="text-[12px] sm:text-[13px] text-wuxia-gold/80 font-serif font-bold tracking-[0.14em] sm:tracking-[0.3em] uppercase block text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] truncate">{turnDisplay}</span>
                            <span className="text-[9px] sm:text-[10px] text-amber-300/40 tracking-[0.04em] sm:tracking-[0.1em] block mt-0.5 group-hover/turnbtn:text-amber-300/80 transition-colors uppercase leading-none font-sans truncate">{`${优化标识文本} · ${当前正文来源提示}`}</span>
                        </button>
                    ) : (
                        <div className="bg-black/40 border border-wuxia-gold/15 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm shadow-md min-w-[96px] sm:min-w-[136px] max-w-full text-center">
                            <span className="text-[12px] sm:text-[13px] text-wuxia-gold/80 font-serif font-bold tracking-[0.14em] sm:tracking-[0.3em] uppercase block text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] truncate">{turnDisplay}</span>
                            {已优化正文 && <span className="text-[9px] sm:text-[10px] text-amber-300/40 tracking-[0.06em] sm:tracking-[0.15em] block mt-0.5 uppercase leading-none font-sans truncate">{优化标识文本}</span>}
                        </div>
                    )}

                </div>

                {/* 右侧容器：移动端贴边悬挂在回合牌右侧，桌面端保持右半区收拢 */}
                <div className="absolute top-0 left-[calc(100%+4px)] flex shrink-0 items-center gap-1 flex-nowrap sm:static sm:left-auto sm:flex-1 sm:min-w-0 sm:justify-start sm:gap-2 sm:pl-2">
                    {hasCalibrationRecord && (
                        <button
                            onClick={() => {
                                setShowCalibrationDetails(prev => !prev);
                                setShowCommandChanges(false);
                            }}
                            className={`p-1 sm:p-1.5 rounded-lg border transition-all shrink-0 ${showCalibrationDetails ? 'bg-sky-500/20 border-sky-500/60 text-sky-200' : 'border-white/10 text-sky-400 hover:text-sky-300 hover:border-sky-500/50 hover:bg-white/5'}`}
                            title="查看变量生成记录"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-3.5 sm:h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m6 2.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </button>
                    )}
                    {isLatest && commands.length > 0 && (
                        <button 
                            onClick={() => {
                                setShowCommandChanges(prev => !prev);
                                setShowCalibrationDetails(false);
                            }} 
                            className={`p-1 sm:p-1.5 rounded-lg border transition-all shrink-0 ${showCommandChanges ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200' : 'border-white/10 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50 hover:bg-white/5'}`} 
                            title={`查看${commandPanelTitle}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-3.5 sm:h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 6.75h16.5m-16.5 6.75h16.5" /></svg>
                        </button>
                    )}
                    <button 
                        onClick={() => { setParseError(null); setEditValue(formatRawJson(rawJson)); setIsEditing(true); }} 
                        className="p-1 sm:p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-wuxia-gold hover:border-wuxia-gold/50 hover:bg-white/10 transition-all shrink-0" 
                        title={canEditRaw ? '查看/编辑原文' : '查看原文'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-3.5 sm:h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                        </svg>
                    </button>
                </div>
                </div>
                {(hasInputTokens || hasDuration || hasOutputTokens) && (
                    <div className="mt-1.5 flex justify-center">
                        <div className="inline-flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-2.5 py-1 rounded-full bg-black/40 border border-white/5 shadow-sm max-w-full">
                            <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-violet-300 opacity-60">
                                    <path fillRule="evenodd" d="M10 18a.75.75 0 0 1-.75-.75V7.56L6.53 10.28a.75.75 0 1 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 1 1-1.06 1.06l-2.72-2.72v9.69A.75.75 0 0 1 10 18Z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[11px] font-mono text-violet-200/85 font-bold">{上传Token文本}</span>
                            </div>
                            <div className="w-px h-2 bg-white/5"></div>
                            <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-wuxia-cyan opacity-50">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[11px] font-mono text-wuxia-cyan/80 font-bold">{hasDuration ? Math.floor(responseDurationSec!) : 0}s</span>
                            </div>
                            <div className="w-px h-2 bg-white/5"></div>
                            <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-amber-500 opacity-50">
                                    <path fillRule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v9.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V2.75A.75.75 0 0 1 10 2Z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[11px] font-mono text-amber-500/80 font-bold">{hasOutputTokens ? 输出Token文本 : '0'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 展开面板区域：居中展开，不使用绝对定位，避免移动端溢出并保证清晰度 */}
            <div className="px-4 space-y-4 mb-6">
                {showCommandChanges && isLatest && commands.length > 0 && (
                    <div className="mx-auto w-[min(100%,720px)] p-4 bg-[#121417] border-y border-emerald-500/30 text-xs text-gray-300 font-mono leading-relaxed shadow-xl animate-in fade-in slide-in-from-top-2 duration-300 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500/40"></div>
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-white/5">
                            <div className="flex flex-col">
                                <div className="text-emerald-300 font-bold tracking-[0.2em] flex items-center gap-2 uppercase">
                                    {commandPanelTitle}
                                </div>
                                <div className="text-[10px] text-emerald-500/60 mt-0.5 tracking-tighter">
                                    COUNT: {commands.length} | SET:{commandStats.set} ADD:{commandStats.add} PUSH:{commandStats.push} DEL:{commandStats.delete}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-white/5">
                                <button onClick={() => setCommandViewMode('compact')} className={`px-2 py-0.5 text-[9px] rounded transition-all ${commandViewMode === 'compact' ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-500/40' : 'text-gray-600 hover:text-gray-400'}`}>简约</button>
                                <button onClick={() => setCommandViewMode('full')} className={`px-2 py-0.5 text-[9px] rounded transition-all ${commandViewMode === 'full' ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-500/40' : 'text-gray-600 hover:text-gray-400'}`}>详情</button>
                            </div>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar-thin space-y-2 pr-1">
                            {commands.map((cmd, idx) => {
                                const valueText = 格式化命令值(cmd?.value);
                                const compactValueText = 生成简约值文本(cmd?.value);
                                const needPre = 是否使用预格式化(cmd?.value);
                                const isCompact = commandViewMode === 'compact';
                                return (
                                    <div key={`${cmd.action}-${cmd.key}-${idx}`} className={`rounded border transition-all ${isCompact ? 'border-white/5 bg-black/20 hover:bg-black/40' : 'border-emerald-500/10 bg-black/40'}`}>
                                        <div className="flex items-center justify-between p-2 flex-wrap gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter uppercase ${命令样式映射[cmd.action]}`}>{命令标签映射[cmd.action]}</span>
                                                <span className="font-mono text-[11px] text-gray-200 font-bold">{cmd.key}</span>
                                            </div>
                                            {isCompact && cmd.action !== 'delete' && (
                                                <div className="text-[10px] flex items-center gap-1.5">
                                                    <span className="opacity-30 text-emerald-500/50">{cmd.action === 'set' ? '→' : cmd.action === 'add' ? 'Δ' : '≫'}</span>
                                                    <span className={cmd.action === 'add' ? 'text-emerald-400 font-bold' : 'text-emerald-400/80'}>{cmd.action === 'add' && !compactValueText.startsWith('-') ? `+${compactValueText}` : compactValueText}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!isCompact && cmd.action !== 'delete' && (
                                            <div className="px-2 pb-2">
                                                <pre className="rounded bg-black/60 border border-white/5 p-2 text-[10px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words">{valueText}</pre>
                                            </div>
                                        )}
                                        {cmd.action === 'delete' && (
                                            <div className="px-2 pb-2 text-[9px] text-rose-500/40 italic flex items-center gap-1">
                                                <span className="not-italic">✕</span> 已移除
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {showCalibrationDetails && hasCalibrationRecord && (
                    <div className="mx-auto w-[min(100%,720px)] p-4 bg-[#0f1216] border-y border-sky-500/30 text-xs text-gray-300 leading-relaxed shadow-xl animate-in fade-in slide-in-from-top-2 duration-300 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-sky-500/40"></div>
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-white/5">
                            <div className="flex flex-col">
                                <div className="text-sky-300 font-bold tracking-[0.2em] flex items-center gap-2 uppercase">
                                    变量生成报告
                                </div>
                                <div className="text-[10px] text-sky-500/60 mt-0.5 tracking-tighter">
                                    {response.variable_calibration_model ? `ENGINE: ${response.variable_calibration_model}` : 'UNKNOWN ENGINE'}
                                </div>
                            </div>
                            <button onClick={() => setShowCalibrationDetails(false)} className="px-2 py-0.5 text-[9px] rounded border border-white/10 text-gray-500 hover:text-white transition-all uppercase">CLOSE</button>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar-thin pr-1">
                            {calibrationReports.length > 0 && (
                                <div className="mb-6">
                                    <div className="text-[9px] font-black text-sky-400/50 mb-2 uppercase tracking-widest border-b border-sky-500/10 pb-1">Summary</div>
                                    <div className="space-y-2">
                                        {calibrationReports.map((report, index) => (
                                            <div key={`report-${index}`} className="p-3 bg-black/40 border border-sky-500/10 text-[11px] text-gray-200">
                                                {report}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {calibrationCommands.length > 0 && (
                                <div>
                                    <div className="text-[9px] font-black text-sky-400/50 mb-2 uppercase tracking-widest border-b border-sky-500/10 pb-1">
                                        Supplements（补充命令） · {calibrationCommands.length}
                                    </div>
                                    <div className="space-y-2.5 font-mono">
                                        {calibrationCommands.map((cmd, idx) => (
                                            <div key={`cal-${cmd.action}-${cmd.key}-${idx}`} className="rounded border border-sky-500/10 bg-black/40 p-2">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex px-1 py-0.5 rounded text-[8px] font-black tracking-tighter uppercase ${命令样式映射[cmd.action]}`}>{命令标签映射[cmd.action]}</span>
                                                        <span className="font-mono text-[11px] text-sky-100/90 font-bold">{cmd.key}</span>
                                                    </div>
                                                </div>
                                                <pre className="rounded bg-black/60 border border-white/5 p-2 text-[10px] leading-relaxed text-sky-100/70 whitespace-pre-wrap break-words italic">{生成简约值文本(cmd?.value)}</pre>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>


            {isPolishing && <div className="mb-4 flex justify-center"><div className="inline-flex items-center gap-2 rounded-full border border-amber-500/45 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200"><span className="inline-block w-3 h-3 border-2 border-amber-200/40 border-t-amber-200 rounded-full animate-spin" /><span>正文优化中...</span></div></div>}
            {polishError && <div className="mb-4 text-center text-[11px] text-amber-300/90">{polishError}</div>}

            {showThinking && preThinkingBlocks.length > 0 && (
                <div className="mb-6 mx-4 p-4 bg-gray-900/80 border-t border-b border-wuxia-cyan/30 text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap shadow-inner relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-wuxia-cyan/50"></div>
                    <span className="text-wuxia-cyan/70 block mb-2 font-bold text-[10px] tracking-widest">【AI前置思考】</span>
                    <div className="space-y-4">{preThinkingBlocks.map(block => <div key={block.key}><span className="text-wuxia-cyan/80 block mb-1">{`· ${block.label}`}</span><div>{block.value}</div></div>)}</div>
                </div>
            )}

            <div className="mt-2 space-y-2">
                {displayLogs.map((log, idx) => {
                    const matchedJudgeBlock = 判定日志索引映射[idx] >= 0 ? judgeBlocks[判定日志索引映射[idx]] : undefined;
                    if (log.sender === '旁白') return <NarratorRenderer key={idx} text={log.text} visualConfig={visualConfig} />;
                    if (判定前缀正则.test(log.sender || '')) {
                        const isNsfw = log.sender?.includes('NSFW');
                        return <JudgmentRenderer key={idx} text={log.text} thoughtBlock={matchedJudgeBlock} isNsfw={isNsfw} visualConfig={visualConfig} prefix={log.sender} />;
                    }
                    return <CharacterRenderer key={idx} sender={log.sender} text={log.text} visualConfig={visualConfig} socialList={socialList} playerProfile={playerProfile} />;
                })}
            </div>

            {showThinking && postThinkingBlocks.length > 0 && (
                <div className="mt-4 p-3 bg-gray-900/50 border-l border-wuxia-cyan/30 text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">
                    <span className="text-wuxia-cyan/70 block mb-2">【AI复核思考】</span>
                    <div className="space-y-4">{postThinkingBlocks.map(block => <div key={block.key}><span className="text-wuxia-cyan/80 block mb-1">{`· ${block.label}`}</span><div>{block.value}</div></div>)}</div>
                </div>
            )}

            <div className="mt-2 flex justify-between items-center opacity-0 group-hover/turn:opacity-100 transition-opacity duration-300 gap-4">
                <span className="text-[11px] text-gray-600">中文计数: {中文计数}字</span>
                {response.shortTerm && <span className="text-[11px] text-gray-600 max-w-[200px] truncate" title={response.shortTerm}>记忆: {response.shortTerm}</span>}
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-px bg-gray-800"></div>
        </div>
    );
};

export default TurnItem;
