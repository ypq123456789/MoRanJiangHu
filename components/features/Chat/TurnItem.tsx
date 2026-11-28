import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GameLog, GameResponse, NPC结构, 视觉设置结构 } from '../../../types';
import { NarratorRenderer, CharacterRenderer, JudgmentRenderer, RewardRenderer, TavernHtmlRenderer } from './MessageRenderers';
import type { 酒馆沙箱动作 } from '../../../models/system';
import GameButton from '../../ui/GameButton';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
import { 剥离外层引号, 规范化可渲染对白日志 } from '../../../utils/dialogueLogNormalizer';
import { 提取并清理Judge区块 } from '../../../utils/judgeBlockExtractor';
import { 拆分判定日志与后续正文, 提取判定日志前缀, 是否判定日志文本 } from '../../../utils/judgmentFormat';

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
    playerProfile?: { 姓名?: string; 头像图片URL?: string; 天赋列表?: any[]; 出身背景?: any };
    onOpenNpcDetail?: (npcId: string) => void;
    inventoryItems?: any[];
    onOpenInventoryItem?: (itemRef: string) => void;
    turnAnchorRef?: React.Ref<HTMLDivElement>;
    variableGenerationPending?: boolean;
    /** 酒馆沙箱桥接回调：注入文本到输入框 / 发送消息 */
    onTavernAction?: (action: 酒馆沙箱动作) => void;
}

const 格式化日志原始片段 = (log?: Partial<GameLog> | null): string => {
    const raw = typeof log?.rawText === 'string' ? log.rawText.trim() : '';
    if (raw) return raw;
    const sender = (log?.sender || '旁白').trim() || '旁白';
    const text = typeof log?.text === 'string' ? log.text.trim() : String(log?.text ?? '').trim();
    if (!text) return '（该段没有可显示的原始片段）';
    return sender === '旁白' ? `【旁白】${text}` : `【${sender}】${text}`;
};

const 提取正文标签内容 = (raw?: string): string => {
    const source = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n') : '';
    if (!source.trim()) return '';
    const match = source.match(/<\s*正文\s*>\s*([\s\S]*?)(?:<\s*\/\s*正文\s*>|$)/i);
    return (match?.[1] || '').trim();
};

type 原文片段 = { raw: string; text: string; sender: string };

const 标签片段 = (raw: string): 原文片段 => {
    const tag = raw.match(/^(?:【\s*([^】]+?)\s*】|\[\s*([^\]]+?)\s*\])/u);
    return { raw, text: raw.slice(tag?.[0].length || 0), sender: (tag?.[1] || tag?.[2] || '').trim() };
};

const 提取原始回复正文片段 = (raw?: string): 原文片段[] => {
    const source = typeof raw === 'string' ? raw.trim() : '';
    if (!source) return [];
    try {
        const parsed = JSON.parse(source);
        if (Array.isArray(parsed?.logs)) {
            return parsed.logs
                .flatMap((item: Partial<GameLog> | string | null) => {
                    if (typeof item === 'string' && item.trim()) return [标签片段(item.trim())];
                    if (!item || typeof item !== 'object') return [];
                    return [{ raw: JSON.stringify(item, null, 2), text: String(item.text ?? ''), sender: String(item.sender ?? '').trim() }];
                });
        }
    } catch {
        // 标签协议原文会走下面的正文块拆分。
    }

    const body = 提取正文标签内容(source);
    if (!body) return [];
    const snippets: string[] = [];
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^<\s*\/?\s*judge\s*>/i.test(trimmed)) continue;
        if (/^(?:【\s*[^】]+?\s*】|\[\s*[^\]]+?\s*\])/.test(trimmed) || snippets.length === 0) {
            snippets.push(trimmed);
        } else {
            snippets[snippets.length - 1] = `${snippets[snippets.length - 1]}\n${trimmed}`;
        }
    }
    return snippets.map(标签片段);
};

const 关联原始片段 = (logs: GameLog[], sources: 原文片段[]): GameLog[] => {
    let sourceIndex = 0;
    let offset = 0;
    return logs.map((log, index) => {
        const snippets = new Set<string>();
        for (const line of String(log.text || '').split('\n')) {
            const words = 剥离外层引号(line);
            if (!words) continue;
            const narrator = log.sender === '旁白';
            for (let i = sourceIndex; i < sources.length; i++) {
                const source = sources[i];
                if (!narrator && source.sender && source.sender !== '旁白' && source.sender !== log.sender) continue;
                const from = i === sourceIndex ? offset : 0;
                let phrase = words;
                let at = source.text.indexOf(phrase, from);
                // 挂在角色标签下的动作转为旁白时会补回主语。
                if (at < 0 && narrator && source.sender && words.startsWith(source.sender)) {
                    phrase = words.slice(source.sender.length);
                    at = phrase ? source.text.indexOf(phrase, from) : -1;
                }
                if (at < 0) continue;
                snippets.add(source.raw);
                sourceIndex = i;
                offset = at + phrase.length;
                break;
            }
        }
        if (log.rawText) return log;
        const positional = sources.length === logs.length ? sources[index]?.raw : '';
        return { ...log, rawText: [...snippets].join('\n') || positional || 格式化日志原始片段(log) };
    });
};

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
    onOpenNpcDetail,
    inventoryItems,
    onOpenInventoryItem,
    turnAnchorRef,
    variableGenerationPending = false,
    onTavernAction,
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
    const [expandedRawLogKey, setExpandedRawLogKey] = useState<string | null>(null);
    const chatStyle = 构建区域文字样式(visualConfig, '聊天');
    const 紧凑字号 = 'var(--ui-compact-font-size, 14px)';
    const 微字号 = 'var(--ui-micro-font-size, 12px)';
    const 紧凑等宽字号 = 'var(--ui-compact-mono-font-size, 12px)';

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
    const 使用整回合原始片段映射 = !已优化正文 || (showOriginalBody && 可切换原文优化视图);
    const 原始回复正文片段 = useMemo(
        () => (使用整回合原始片段映射 ? 提取原始回复正文片段(rawJson) : []),
        [rawJson, 使用整回合原始片段映射]
    );
    const 当前正文日志带原始片段 = 关联原始片段(当前正文日志, 原始回复正文片段);
    const displayLogs = 规范化可渲染对白日志(当前正文日志带原始片段
        .filter(log => !isDisclaimerLog(log))
        .map((log) => ({
            ...log,
            text: 提取并清理Judge区块(String(log?.text || '')).cleanText
                .replace(/^\s+/, '')
        }))
        .flatMap((log) => {
            const split = 拆分判定日志与后续正文(log.text);
            if (!split) return [log];
            const rawText = 格式化日志原始片段(log);
            return [
                { ...log, text: split.judgmentText, rawText },
                { sender: '旁白', text: split.trailingBody, rawText }
            ];
        })
        .filter(log => log.text.trim().length > 0));
    const 是否奖励日志 = (sender: string, text: string): boolean => (
        sender.trim() === '奖励'
        || /【\s*(?:任务完成|奖励到账)\s*】/.test(text)
    );
    const judgeBlocks = Array.isArray(response.judge_blocks)
        ? response.judge_blocks.filter(block => ((block?.text || block?.raw || '').trim().length > 0))
        : [];
    const 判定日志索引映射 = useMemo(() => {
        let currentJudgmentIndex = -1;
        return displayLogs.map((log) => {
            if (是否判定日志文本(log.sender) || 是否判定日志文本(log.text)) {
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

    const getRawLogKey = (index: number) => `raw-log-${turnNumber}-${index}`;
    const toggleRawLogPreview = (index: number) => {
        const key = getRawLogKey(index);
        setExpandedRawLogKey(prev => prev === key ? null : key);
    };

    const renderRawLogPanel = (log: GameLog, index: number) => {
        const key = getRawLogKey(index);
        if (expandedRawLogKey !== key) return null;
        return (
            <div className="mx-auto my-2 w-[min(100%,768px)] overflow-hidden rounded-lg border border-amber-600/35 bg-[#fffaf0] text-[#20160a] shadow-[0_10px_28px_rgba(111,59,19,0.16)]" data-raw-response-panel="true">
                <div className="flex items-center justify-between gap-3 border-b border-amber-700/20 bg-[#f5e6c8] px-4 py-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-black tracking-[0.12em] text-stone-950">第 {index + 1} 段原始回复片段</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-stone-600">当前气泡进入解析/渲染前的来源片段</div>
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded border border-stone-500/40 bg-white/80 px-3 py-1.5 text-xs font-bold text-stone-800 transition hover:bg-white"
                        onClick={() => setExpandedRawLogKey(null)}
                    >
                        关闭
                    </button>
                </div>
                <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words bg-white/90 p-4 font-mono text-[12px] leading-[1.8] text-stone-950" style={{ fontSize: 紧凑等宽字号 }} data-raw-response-text="true">
                    {格式化日志原始片段(log)}
                </pre>
            </div>
        );
    };

    if (isEditing) {
        return (
            <div className="w-full bg-black/80 border border-wuxia-gold p-4 my-4 relative z-50">
                <h4 className="text-wuxia-gold mb-2 font-mono" style={{ fontSize: 紧凑等宽字号 }}>{canEditRaw ? '/// DEBUG: EDIT RESPONSE RAW TEXT ///' : '/// DEBUG: VIEW RESPONSE RAW TEXT ///'}</h4>
                <textarea className={`w-full h-96 bg-gray-900 text-green-400 font-mono p-4 outline-none border resize-y ${canEditRaw ? 'border-gray-700' : 'border-gray-800 opacity-90'}`} style={{ fontSize: 紧凑等宽字号 }} value={editValue} onChange={(e) => setEditValue(e.target.value)} readOnly={!canEditRaw} />
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
    const hasInputTokens = !variableGenerationPending && typeof inputTokens === 'number' && Number.isFinite(inputTokens) && inputTokens > 0;
    const hasDuration = !variableGenerationPending && typeof responseDurationSec === 'number' && Number.isFinite(responseDurationSec) && responseDurationSec > 0;
    const hasOutputTokens = !variableGenerationPending && typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens > 0;
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
                            <span className="text-wuxia-gold/80 font-serif font-bold tracking-[0.14em] sm:tracking-[0.3em] uppercase block text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] truncate" style={{ fontSize: 紧凑字号 }}>{turnDisplay}</span>
                            <span className="text-amber-300/40 tracking-[0.04em] sm:tracking-[0.1em] block mt-0.5 group-hover/turnbtn:text-amber-300/80 transition-colors uppercase leading-none font-sans truncate" style={{ fontSize: 微字号 }}>{`${优化标识文本} · ${当前正文来源提示}`}</span>
                        </button>
                    ) : (
                        <div className="bg-black/40 border border-wuxia-gold/15 px-2.5 sm:px-5 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm shadow-md min-w-[96px] sm:min-w-[136px] max-w-full text-center">
                            <span className="text-wuxia-gold/80 font-serif font-bold tracking-[0.14em] sm:tracking-[0.3em] uppercase block text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] truncate" style={{ fontSize: 紧凑字号 }}>{turnDisplay}</span>
                            {已优化正文 && <span className="text-amber-300/40 tracking-[0.06em] sm:tracking-[0.15em] block mt-0.5 uppercase leading-none font-sans truncate" style={{ fontSize: 微字号 }}>{优化标识文本}</span>}
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
                {(variableGenerationPending || hasInputTokens || hasDuration || hasOutputTokens) && (
                    <div className="mt-1.5 flex justify-center">
                        <div className="inline-flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-2.5 py-1 rounded-full bg-black/40 border border-white/5 shadow-sm max-w-full">
                            {variableGenerationPending ? (
                                <div className="flex items-center gap-2 text-wuxia-cyan/80">
                                    <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-wuxia-cyan/30 border-t-wuxia-cyan animate-spin"></span>
                                    <span className="font-mono font-bold tracking-[0.12em]" style={{ fontSize: 紧凑等宽字号 }}>变量生成中</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-violet-300 opacity-60">
                                            <path fillRule="evenodd" d="M10 18a.75.75 0 0 1-.75-.75V7.56L6.53 10.28a.75.75 0 1 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 1 1-1.06 1.06l-2.72-2.72v9.69A.75.75 0 0 1 10 18Z" clipRule="evenodd" />
                                        </svg>
                                        <span className="font-mono text-violet-200/85 font-bold" style={{ fontSize: 紧凑等宽字号 }}>{上传Token文本}</span>
                                    </div>
                                    <div className="w-px h-2 bg-white/5"></div>
                                    <div className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-wuxia-cyan opacity-50">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                                        </svg>
                                        <span className="font-mono text-wuxia-cyan/80 font-bold" style={{ fontSize: 紧凑等宽字号 }}>{hasDuration ? Math.floor(responseDurationSec!) : 0}s</span>
                                    </div>
                                    <div className="w-px h-2 bg-white/5"></div>
                                    <div className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-amber-500 opacity-50">
                                            <path fillRule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v9.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V2.75A.75.75 0 0 1 10 2Z" clipRule="evenodd" />
                                        </svg>
                                        <span className="font-mono text-amber-500/80 font-bold" style={{ fontSize: 紧凑等宽字号 }}>{hasOutputTokens ? 输出Token文本 : '0'}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 展开面板区域：居中展开，不使用绝对定位，避免移动端溢出并保证清晰度 */}
            <div className="px-4 space-y-4 mb-6">
                {showCommandChanges && isLatest && commands.length > 0 && (
                    <div className="mx-auto w-[min(100%,720px)] p-4 bg-[#121417] border-y border-emerald-500/30 text-gray-300 font-mono leading-relaxed shadow-xl animate-in fade-in slide-in-from-top-2 duration-300 relative overflow-hidden" style={{ fontSize: 紧凑等宽字号 }}>
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500/40"></div>
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-white/5">
                            <div className="flex flex-col">
                                <div className="text-emerald-300 font-bold tracking-[0.2em] flex items-center gap-2 uppercase">
                                    {commandPanelTitle}
                                </div>
                                <div className="text-emerald-500/60 mt-0.5 tracking-tighter" style={{ fontSize: 微字号 }}>
                                    COUNT: {commands.length} | SET:{commandStats.set} ADD:{commandStats.add} PUSH:{commandStats.push} DEL:{commandStats.delete}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-white/5">
                                <button onClick={() => setCommandViewMode('compact')} className={`px-2 py-0.5 rounded transition-all ${commandViewMode === 'compact' ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-500/40' : 'text-gray-600 hover:text-gray-400'}`} style={{ fontSize: 微字号 }}>简约</button>
                                <button onClick={() => setCommandViewMode('full')} className={`px-2 py-0.5 rounded transition-all ${commandViewMode === 'full' ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-500/40' : 'text-gray-600 hover:text-gray-400'}`} style={{ fontSize: 微字号 }}>详情</button>
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
                                                <span className={`inline-flex px-1.5 py-0.5 rounded font-black tracking-tighter uppercase ${命令样式映射[cmd.action]}`} style={{ fontSize: 微字号 }}>{命令标签映射[cmd.action]}</span>
                                                <span className="font-mono text-gray-200 font-bold" style={{ fontSize: 紧凑等宽字号 }}>{cmd.key}</span>
                                            </div>
                                            {isCompact && cmd.action !== 'delete' && (
                                                <div className="flex items-center gap-1.5" style={{ fontSize: 微字号 }}>
                                                    <span className="opacity-30 text-emerald-500/50">{cmd.action === 'set' ? '→' : cmd.action === 'add' ? 'Δ' : '≫'}</span>
                                                    <span className={cmd.action === 'add' ? 'text-emerald-400 font-bold' : 'text-emerald-400/80'}>{cmd.action === 'add' && !compactValueText.startsWith('-') ? `+${compactValueText}` : compactValueText}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!isCompact && cmd.action !== 'delete' && (
                                            <div className="px-2 pb-2">
                                                <pre className="rounded bg-black/60 border border-white/5 p-2 leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words" style={{ fontSize: 微字号 }}>{valueText}</pre>
                                            </div>
                                        )}
                                        {cmd.action === 'delete' && (
                                            <div className="px-2 pb-2 text-rose-500/40 italic flex items-center gap-1" style={{ fontSize: 微字号 }}>
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
                    <div className="mx-auto w-[min(100%,720px)] p-4 bg-[#0f1216] border-y border-sky-500/30 text-gray-300 leading-relaxed shadow-xl animate-in fade-in slide-in-from-top-2 duration-300 relative overflow-hidden" style={{ fontSize: 紧凑字号 }}>
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-sky-500/40"></div>
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-white/5">
                            <div className="flex flex-col">
                                <div className="text-sky-300 font-bold tracking-[0.2em] flex items-center gap-2 uppercase">
                                    变量生成报告
                                </div>
                                <div className="text-sky-500/60 mt-0.5 tracking-tighter" style={{ fontSize: 微字号 }}>
                                    {response.variable_calibration_model ? `ENGINE: ${response.variable_calibration_model}` : 'UNKNOWN ENGINE'}
                                </div>
                            </div>
                            <button onClick={() => setShowCalibrationDetails(false)} className="px-2 py-0.5 rounded border border-white/10 text-gray-500 hover:text-white transition-all uppercase" style={{ fontSize: 微字号 }}>CLOSE</button>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar-thin pr-1">
                            {calibrationReports.length > 0 && (
                                <div className="mb-6">
                                    <div className="font-black text-sky-400/50 mb-2 uppercase tracking-widest border-b border-sky-500/10 pb-1" style={{ fontSize: 微字号 }}>Summary</div>
                                    <div className="space-y-2">
                                        {calibrationReports.map((report, index) => (
                                            <div key={`report-${index}`} className="p-3 bg-black/40 border border-sky-500/10 text-gray-200" style={{ fontSize: 紧凑字号 }}>
                                                {report}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {calibrationCommands.length > 0 && (
                                <div>
                                    <div className="font-black text-sky-400/50 mb-2 uppercase tracking-widest border-b border-sky-500/10 pb-1" style={{ fontSize: 微字号 }}>
                                        Supplements（补充命令） · {calibrationCommands.length}
                                    </div>
                                    <div className="space-y-2.5 font-mono">
                                        {calibrationCommands.map((cmd, idx) => (
                                            <div key={`cal-${cmd.action}-${cmd.key}-${idx}`} className="rounded border border-sky-500/10 bg-black/40 p-2">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex px-1 py-0.5 rounded font-black tracking-tighter uppercase ${命令样式映射[cmd.action]}`} style={{ fontSize: 微字号 }}>{命令标签映射[cmd.action]}</span>
                                                        <span className="font-mono text-sky-100/90 font-bold" style={{ fontSize: 紧凑等宽字号 }}>{cmd.key}</span>
                                                    </div>
                                                </div>
                                                <pre className="rounded bg-black/60 border border-white/5 p-2 leading-relaxed text-sky-100/70 whitespace-pre-wrap break-words italic" style={{ fontSize: 微字号 }}>{生成简约值文本(cmd?.value)}</pre>
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
                    const rawSender = log.sender || '';
                    const rawText = log.text || '';
                    const textJudgmentPrefix = 提取判定日志前缀(rawText);
                    const senderJudgmentPrefix = 提取判定日志前缀(rawSender);
                    const textStartsWithJudgment = Boolean(textJudgmentPrefix);
                    const openThisRawLog = () => toggleRawLogPreview(idx);
                    let renderedLog: React.ReactNode;

                    // 优先检测酒馆预设 HTML 产出
                    const htmlContent = (log as any).htmlContent as string | undefined;
                    const htmlRenderMode = (log as any).htmlRenderMode as 'sandbox' | 'purify' | undefined;
                    if (htmlContent && htmlRenderMode) {
                        renderedLog = (
                            <TavernHtmlRenderer
                                htmlContent={htmlContent}
                                htmlRenderMode={htmlRenderMode}
                                onTavernAction={onTavernAction}
                            />
                        );
                        // 如果 htmlContent 之外还有文本内容，也渲染文本
                        if (rawText.trim() && !((log as any).htmlContent === rawText)) {
                            renderedLog = (
                                <React.Fragment>
                                    {rawSender === '旁白'
                                        ? <NarratorRenderer text={rawText} visualConfig={visualConfig} inventoryItems={inventoryItems} onOpenInventoryItem={onOpenInventoryItem} socialList={socialList} playerProfile={playerProfile} onOpenNpcDetail={onOpenNpcDetail} onOpenRawResponse={openThisRawLog} />
                                        : <CharacterRenderer sender={rawSender} text={rawText} visualConfig={visualConfig} socialList={socialList} playerProfile={playerProfile} onOpenNpcDetail={onOpenNpcDetail} inventoryItems={inventoryItems} onOpenInventoryItem={onOpenInventoryItem} onOpenRawResponse={openThisRawLog} />
                                    }
                                    <TavernHtmlRenderer htmlContent={htmlContent} htmlRenderMode={htmlRenderMode} onTavernAction={onTavernAction} />
                                </React.Fragment>
                            );
                        }
                    } else if (是否奖励日志(rawSender, rawText)) {
                        renderedLog = <RewardRenderer text={rawText} visualConfig={visualConfig} onOpenRawResponse={openThisRawLog} />;
                    } else if (rawSender === '旁白' && !textStartsWithJudgment) {
                        renderedLog = <NarratorRenderer text={rawText} visualConfig={visualConfig} inventoryItems={inventoryItems} onOpenInventoryItem={onOpenInventoryItem} socialList={socialList} playerProfile={playerProfile} onOpenNpcDetail={onOpenNpcDetail} onOpenRawResponse={openThisRawLog} />;
                    } else if (senderJudgmentPrefix || textStartsWithJudgment) {
                        const prefix = senderJudgmentPrefix || textJudgmentPrefix || rawSender;
                        const isNsfw = prefix.includes('NSFW');
                        renderedLog = <JudgmentRenderer text={rawText} thoughtBlock={matchedJudgeBlock} isNsfw={isNsfw} visualConfig={visualConfig} prefix={prefix} onOpenRawResponse={openThisRawLog} />;
                    } else {
                        renderedLog = <CharacterRenderer sender={rawSender} text={rawText} visualConfig={visualConfig} socialList={socialList} playerProfile={playerProfile} onOpenNpcDetail={onOpenNpcDetail} inventoryItems={inventoryItems} onOpenInventoryItem={onOpenInventoryItem} onOpenRawResponse={openThisRawLog} />;
                    }
                    return (
                        <React.Fragment key={idx}>
                            {renderedLog}
                            {renderRawLogPanel(log, idx)}
                        </React.Fragment>
                    );
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

// React.memo：编辑/重解析会用全新引用替换 history，导致窗口内所有 TurnItem 重渲染。
// ChatList 传入的 onSaveEdit/onPolishTurn 是内联箭头（每次新建引用），但对固定 key 的回合语义稳定，
// 因此自定义比较器忽略函数 prop 引用，仅比较真正影响渲染的值。
const 回合渲染属性相等 = (prev: Props, next: Props): boolean => {
    if (prev.response !== next.response) return false;
    if (prev.turnNumber !== next.turnNumber) return false;
    if (prev.isLatest !== next.isLatest) return false;
    if (prev.rawJson !== next.rawJson) return false;
    if (prev.inputTokens !== next.inputTokens) return false;
    if (prev.responseDurationSec !== next.responseDurationSec) return false;
    if (prev.outputTokens !== next.outputTokens) return false;
    if (prev.fontSize !== next.fontSize) return false;
    if (prev.lineHeight !== next.lineHeight) return false;
    if (prev.collapseThinkingStream !== next.collapseThinkingStream) return false;
    if (prev.visualConfig !== next.visualConfig) return false;
    if (prev.socialList !== next.socialList) return false;
    if (prev.playerProfile !== next.playerProfile) return false;
    if (prev.inventoryItems !== next.inventoryItems) return false;
    if (prev.variableGenerationPending !== next.variableGenerationPending) return false;
    if (prev.turnAnchorRef !== next.turnAnchorRef) return false;
    // onSaveEdit/onPolishTurn/onOpenNpcDetail/onOpenInventoryItem/onTavernAction 为语义稳定的回调，忽略引用差异。
    return true;
};

const MemoizedTurnItem = React.memo(TurnItem, 回合渲染属性相等);

export default MemoizedTurnItem;
