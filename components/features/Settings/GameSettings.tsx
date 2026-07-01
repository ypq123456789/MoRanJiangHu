import React, { useEffect, useRef, useState } from 'react';
import { 游戏设置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { normalizeCanonicalGameTime } from '../../../hooks/useGame/timeUtils';

interface Props {
    settings: 游戏设置结构;
    onSave: (settings: 游戏设置结构) => void;
    gameInitialTime?: string;
    currentGameTime?: string;
    journeyDayCount?: number;
    onRepairGameInitialTime?: (nextTime: string) => 游戏初始时间修复结果 | Promise<游戏初始时间修复结果>;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    性别比例演变预设?: boolean;
}

type 游戏初始时间修复结果 = { ok: boolean; message: string; value?: string };

export const 提交游戏初始时间修复 = async (params: {
    input: string;
    currentInitialTime?: string;
    currentGameTime?: string;
    onRepair?: (nextTime: string) => 游戏初始时间修复结果 | Promise<游戏初始时间修复结果>;
    confirm?: (message: string) => boolean | Promise<boolean>;
}): Promise<游戏初始时间修复结果> => {
    const canonical = normalizeCanonicalGameTime((params.input || '').trim());
    if (!canonical) {
        return { ok: false, message: '请输入合法的游戏时间格式，例如 2026:12:21:21:25。' };
    }
    if (!params.onRepair) {
        return { ok: false, message: '当前修复入口尚未就绪。' };
    }
    const oldTime = params.currentInitialTime?.trim() || '未知';
    const currentTime = params.currentGameTime?.trim() || '未知';
    const confirmed = params.confirm
        ? await params.confirm(`将历程起始时间从「${oldTime}」改为「${canonical}」。\n\n此操作只影响右上角历程天数计算，不会改变当前游戏时间（${currentTime}）。\n\n确定应用修正吗？`)
        : true;
    if (!confirmed) {
        return { ok: false, message: '已取消修正。' };
    }
    return params.onRepair(canonical);
};

const GameSettings: React.FC<Props> = ({ settings, onSave, gameInitialTime, currentGameTime, journeyDayCount, onRepairGameInitialTime, requestConfirm, 性别比例演变预设 }) => {
    const [form, setForm] = useState<游戏设置结构>(settings);
    const [wordCountDraft, setWordCountDraft] = useState(() => String(settings.字数要求 ?? ''));
    const [initialTimeDraft, setInitialTimeDraft] = useState('');
    const [repairMessage, setRepairMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [repairBusy, setRepairBusy] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [openMenu, setOpenMenu] = useState<'perspective' | 'style' | 'ntl' | 'mainStoryMode' | 'shortBodyHandling' | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const 叙事人称选项: Array<{ value: 游戏设置结构['叙事人称']; label: string }> = [
        { value: '第一人称', label: '第一人称 (我)' },
        { value: '第二人称', label: '第二人称 (你)' },
        { value: '第三人称', label: '第三人称 (他/姓名)' }
    ];
    const 剧情风格选项: Array<{ value: 游戏设置结构['剧情风格']; label: string }> = [
        { value: '后宫', label: '后宫' },
        { value: '修炼', label: '修炼' },
        { value: '一般', label: '一般' },
        { value: '修罗场', label: '修罗场' },
        { value: '纯爱', label: '纯爱' },
        { value: 'NTL后宫', label: 'NTL后宫' }
    ];
    const NTL后宫档位选项: Array<{ value: 游戏设置结构['NTL后宫档位']; label: string }> = [
        { value: '禁止乱伦', label: '禁止乱伦' },
        { value: '假乱伦', label: '假乱伦' },
        { value: '无限制', label: '无限制' }
    ];
    const 主剧情消息模式选项: Array<{ value: 游戏设置结构['主剧情消息模式']; label: string; description: string }> = [
        { value: 'Gemini模式', label: 'Gemini模式', description: '沿用项目原始 Gemini 组包方式。' },
        { value: 'GPT', label: 'GPT兼容', description: '最后一条 user 使用真实玩家输入。' },
        { value: 'DeepSeek标准', label: 'DeepSeek标准续聊', description: 'DeepSeek 推荐续聊模式，关闭伪装思考，真实 user 直发。' },
        { value: 'DeepSeek锁格式', label: 'DeepSeek锁格式', description: '使用 prefix/prefill 锁定 <正文> 开头；接口不支持时会自动回退到标准模式。' },
        { value: 'GLM标准', label: 'GLM标准续聊', description: 'GLM/智谱 推荐续聊模式，使用 HTML 注释思维链，关闭伪装思考。' },
        { value: 'GLM锁格式', label: 'GLM锁格式', description: '锁定 HTML 注释思维链开头；接口不支持时会自动回退到标准模式。' }
    ];
    const 字数不足处理选项: Array<{ value: NonNullable<游戏设置结构['字数不足处理方式']>; label: string; description: string }> = [
        { value: '重新生成', label: '字数不足时重新生成', description: '默认。正文明显短于字数要求时会进入扩写、重试或恢复流程；小幅不足会直接容错提示。' },
        { value: '仅提示', label: '字数不足时仅提示', description: '正文不足时不阻断本回合，只提示当前字数差距并继续显示正文。' }
    ];
    const 当前主剧情消息模式 = form.主剧情消息模式 || (form.启用GPT模式 ? 'GPT' : 'Gemini模式');
    const 当前DeepSeek策略 = form.DeepSeek策略 || {
        开局策略: '禁止开局',
        启用接管摘要: true,
        启用Prefix能力探测: true,
        启用输出健康度检测: true,
        健康度锁格式阈值: 85,
        健康度救场阈值: 60,
        续聊Thinking: false,
        开局Thinking: false
    };
    const 当前GLM策略 = form.GLM策略 || {
        开局策略: '禁止开局',
        启用接管摘要: true,
        启用HTML注释思维链: true,
        启用Prefix能力探测: true,
        启用输出健康度检测: true,
        健康度锁格式阈值: 85,
        健康度救场阈值: 60,
        续聊Thinking: false,
        开局Thinking: false
    };
    const 当前为DeepSeek模式 = 当前主剧情消息模式 === 'DeepSeek标准' || 当前主剧情消息模式 === 'DeepSeek锁格式';
    const 当前为GLM模式 = 当前主剧情消息模式 === 'GLM标准' || 当前主剧情消息模式 === 'GLM锁格式';
    const 解析百分比输入 = (value: string, fallback: number): number => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, Math.min(100, parsed));
    };
    useEffect(() => {
        setForm(settings);
        setWordCountDraft(String(settings.字数要求 ?? ''));
    }, [settings]);

    useEffect(() => {
        if (!openMenu) return;

        const handlePointerDown = (event: MouseEvent) => {
            const root = rootRef.current;
            if (!root) return;
            if (event.target instanceof Node && root.contains(event.target)) return;
            setOpenMenu(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenMenu(null);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [openMenu]);

    const handleSave = () => {
        onSave(form);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const 实时应用更新 = (patch: Partial<游戏设置结构>) => {
        const next = { ...form, ...patch };
        setForm(next);
        onSave(next);
    };

    const 提交字数要求 = () => {
        const normalizedText = wordCountDraft.trim();
        const parsed = Number(normalizedText);
        const nextValue = Number.isFinite(parsed) && parsed > 0
            ? Math.max(50, Math.floor(parsed))
            : (Number.isFinite(Number(form.字数要求)) ? Math.max(50, Math.floor(Number(form.字数要求))) : 1500);
        setWordCountDraft(String(nextValue));
        实时应用更新({ 字数要求: nextValue });
    };

    const handleRepairInitialTime = async () => {
        if (repairBusy) return;
        setRepairBusy(true);
        setRepairMessage(null);
        try {
            const result = await 提交游戏初始时间修复({
                input: initialTimeDraft,
                currentInitialTime: gameInitialTime,
                currentGameTime,
                onRepair: onRepairGameInitialTime,
                confirm: async (message) => {
                    if (requestConfirm) {
                        return requestConfirm({
                            title: '修正历程起始时间',
                            message,
                            confirmText: '应用修正',
                            cancelText: '取消'
                        });
                    }
                    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
                        return window.confirm(message);
                    }
                    return true;
                }
            });
            if (result.ok) {
                setInitialTimeDraft('');
                setRepairMessage({ tone: 'success', text: result.message || '已修正历程起始时间，请手动保存进度。' });
            } else {
                setRepairMessage({ tone: result.message === '已取消修正。' ? 'info' : 'error', text: result.message });
            }
        } catch (error: any) {
            setRepairMessage({ tone: 'error', text: error?.message || '修正失败，请稍后重试。' });
        } finally {
            setRepairBusy(false);
        }
    };

    const 渲染内置下拉 = (params: {
        menuKey: 'perspective' | 'style' | 'ntl' | 'mainStoryMode' | 'shortBodyHandling';
        value: string;
        options: Array<{ value: string; label: string; description?: string }>;
        onChange: (value: string) => void;
    }) => {
        const selected = params.options.find(option => option.value === params.value);
        const isOpen = openMenu === params.menuKey;

        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpenMenu(prev => (prev === params.menuKey ? null : params.menuKey))}
                    className={`w-full bg-black/40 border p-3 text-left rounded-md transition-all flex items-center justify-between ${
                        isOpen ? 'border-wuxia-gold text-white' : 'border-gray-600 text-white'
                    }`}
                >
                    <span>{selected?.label || '请选择'}</span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180 text-wuxia-gold' : ''}`}
                    >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-black/95 border border-wuxia-gold/40 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden">
                        <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
                            {params.options.map(option => {
                                const active = option.value === params.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            params.onChange(option.value);
                                            setOpenMenu(null);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                                            active
                                                ? 'bg-wuxia-gold/15 text-wuxia-gold'
                                                : 'text-gray-200 hover:bg-white/5'
                                        }`}
                                    >
                                        <span>{option.label}</span>
                                        {active && (
                                            <span className="text-xs text-wuxia-gold/80">当前</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={rootRef} className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">游戏设定</h3>
                {showSuccess && <span className="text-green-400 text-xs font-bold animate-pulse">✔ 设定已保存</span>}
            </div>
            
            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="space-y-2">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">主剧情消息模式</div>
                        <div className="text-xs text-gray-400 mt-1">控制主剧情链路如何组织最后一轮消息。DeepSeek 模式会使用真实用户输入，并默认关闭 COT 伪装注入。</div>
                    </div>
                    {渲染内置下拉({
                        menuKey: 'mainStoryMode',
                        value: 当前主剧情消息模式,
                        options: 主剧情消息模式选项,
                        onChange: (value) => {
                            const nextMode = value as 游戏设置结构['主剧情消息模式'];
                            实时应用更新({
                                主剧情消息模式: nextMode,
                                启用GPT模式: nextMode === 'GPT' || nextMode === 'DeepSeek标准' || nextMode === 'DeepSeek锁格式' || nextMode === 'GLM标准' || nextMode === 'GLM锁格式'
                            });
                        }
                    })}
                    <div className="text-xs text-gray-500">{主剧情消息模式选项.find(option => option.value === 当前主剧情消息模式)?.description}</div>
                </div>
            </div>

            {当前为DeepSeek模式 && (
                <div className="space-y-3 rounded-md border border-cyan-400/30 bg-cyan-950/20 p-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">DeepSeek 主线稳定性策略</div>
                        <div className="text-xs text-gray-400 mt-1">用于降低续聊组包污染、reasoning 泄漏和格式漂移风险；若当前接口不支持 prefix，会自动降级为标准续聊。</div>
                    </div>
                    <label className="block space-y-1">
                        <span className="text-xs text-gray-300">开局策略</span>
                        <select
                            value={当前DeepSeek策略.开局策略 || '禁止开局'}
                            onChange={(event) => 实时应用更新({
                                DeepSeek策略: {
                                    ...当前DeepSeek策略,
                                    开局策略: event.target.value as 游戏设置结构['DeepSeek策略']['开局策略']
                                }
                            })}
                            className="w-full bg-black/50 border border-cyan-400/30 p-2 text-white outline-none rounded-md"
                        >
                            <option value="禁止开局">禁止开局，稳定模型起盘后接管</option>
                            <option value="标准开局">标准开局</option>
                            <option value="锁头开局">锁头开局（实验）</option>
                        </select>
                    </label>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">接管摘要</div>
                        <ToggleSwitch
                            checked={当前DeepSeek策略.启用接管摘要 !== false}
                            onChange={(next) => 实时应用更新({ DeepSeek策略: { ...当前DeepSeek策略, 启用接管摘要: next } })}
                            ariaLabel="切换DeepSeek接管摘要"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">Prefix能力探测</div>
                        <ToggleSwitch
                            checked={当前DeepSeek策略.启用Prefix能力探测 !== false}
                            onChange={(next) => 实时应用更新({ DeepSeek策略: { ...当前DeepSeek策略, 启用Prefix能力探测: next } })}
                            ariaLabel="切换DeepSeek Prefix能力探测"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">输出健康度检测</div>
                        <ToggleSwitch
                            checked={当前DeepSeek策略.启用输出健康度检测 !== false}
                            onChange={(next) => 实时应用更新({ DeepSeek策略: { ...当前DeepSeek策略, 启用输出健康度检测: next } })}
                            ariaLabel="切换DeepSeek输出健康度检测"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block space-y-1">
                            <span className="text-xs text-gray-300">锁格式阈值</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={当前DeepSeek策略.健康度锁格式阈值 ?? 85}
                                onChange={(event) => 实时应用更新({
                                    DeepSeek策略: {
                                        ...当前DeepSeek策略,
                                        健康度锁格式阈值: 解析百分比输入(event.target.value, 85)
                                    }
                                })}
                                className="w-full bg-black/50 border border-cyan-400/30 p-2 text-white outline-none rounded-md"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-xs text-gray-300">救场阈值</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={当前DeepSeek策略.健康度救场阈值 ?? 60}
                                onChange={(event) => 实时应用更新({
                                    DeepSeek策略: {
                                        ...当前DeepSeek策略,
                                        健康度救场阈值: 解析百分比输入(event.target.value, 60)
                                    }
                                })}
                                className="w-full bg-black/50 border border-cyan-400/30 p-2 text-white outline-none rounded-md"
                            />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between gap-4 rounded-md border border-cyan-400/20 bg-black/20 p-3">
                            <div className="text-xs text-gray-300">续聊Thinking</div>
                            <ToggleSwitch
                                checked={当前DeepSeek策略.续聊Thinking === true}
                                onChange={(next) => 实时应用更新({ DeepSeek策略: { ...当前DeepSeek策略, 续聊Thinking: next } })}
                                ariaLabel="切换DeepSeek续聊Thinking"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-md border border-cyan-400/20 bg-black/20 p-3">
                            <div className="text-xs text-gray-300">开局Thinking</div>
                            <ToggleSwitch
                                checked={当前DeepSeek策略.开局Thinking === true}
                                onChange={(next) => 实时应用更新({ DeepSeek策略: { ...当前DeepSeek策略, 开局Thinking: next } })}
                                ariaLabel="切换DeepSeek开局Thinking"
                            />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500">{'稳定模型救场配置在「接口配置中心」的 DeepSeek 稳定救场模型中设置；未配置时会退回稳定提示词救场。'}</div>
                </div>
            )}

            {当前为GLM模式 && (
                <div className="space-y-3 rounded-md border border-green-400/30 bg-green-950/20 p-4">
                    <div>
                        <div className="text-sm text-wuxia-gold font-bold">GLM 主线稳定性策略</div>
                        <div className="text-xs text-gray-400 mt-1">{"针对智谱 GLM 系列模型的兼容优化；使用 HTML 注释思维链替代 <thinking> 标签，避免与 GLM 原生思考机制冲突。"}</div>
                    </div>
                    <label className="block space-y-1">
                        <span className="text-xs text-gray-300">开局策略</span>
                        <select
                            value={当前GLM策略.开局策略 || '禁止开局'}
                            onChange={(event) => 实时应用更新({
                                GLM策略: {
                                    ...当前GLM策略,
                                    开局策略: event.target.value as 游戏设置结构['GLM策略']['开局策略']
                                }
                            })}
                            className="w-full bg-black/50 border border-green-400/30 p-2 text-white outline-none rounded-md"
                        >
                            <option value="禁止开局">禁止开局，稳定模型起盘后接管</option>
                            <option value="标准开局">标准开局</option>
                            <option value="锁头开局">锁头开局（实验）</option>
                        </select>
                    </label>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">接管摘要</div>
                        <ToggleSwitch
                            checked={当前GLM策略.启用接管摘要 !== false}
                            onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 启用接管摘要: next } })}
                            ariaLabel="切换GLM接管摘要"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">HTML注释思维链</div>
                        <ToggleSwitch
                            checked={当前GLM策略.启用HTML注释思维链 !== false}
                            onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 启用HTML注释思维链: next } })}
                            ariaLabel="切换GLM HTML注释思维链"
                        />
                    </div>
                    <div className="text-xs text-gray-500">{"启用后，思维链将使用 HTML 注释 <!-- ... --> 替代 <thinking> 标签，避免与 GLM 原生思考机制冲突。"}</div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">Prefix能力探测</div>
                        <ToggleSwitch
                            checked={当前GLM策略.启用Prefix能力探测 !== false}
                            onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 启用Prefix能力探测: next } })}
                            ariaLabel="切换GLM Prefix能力探测"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-300">输出健康度检测</div>
                        <ToggleSwitch
                            checked={当前GLM策略.启用输出健康度检测 !== false}
                            onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 启用输出健康度检测: next } })}
                            ariaLabel="切换GLM输出健康度检测"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block space-y-1">
                            <span className="text-xs text-gray-300">锁格式阈值</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={当前GLM策略.健康度锁格式阈值 ?? 85}
                                onChange={(event) => 实时应用更新({
                                    GLM策略: {
                                        ...当前GLM策略,
                                        健康度锁格式阈值: 解析百分比输入(event.target.value, 85)
                                    }
                                })}
                                className="w-full bg-black/50 border border-green-400/30 p-2 text-white outline-none rounded-md"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-xs text-gray-300">救场阈值</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={当前GLM策略.健康度救场阈值 ?? 60}
                                onChange={(event) => 实时应用更新({
                                    GLM策略: {
                                        ...当前GLM策略,
                                        健康度救场阈值: 解析百分比输入(event.target.value, 60)
                                    }
                                })}
                                className="w-full bg-black/50 border border-green-400/30 p-2 text-white outline-none rounded-md"
                            />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between gap-4 rounded-md border border-green-400/20 bg-black/20 p-3">
                            <div className="text-xs text-gray-300">续聊Thinking</div>
                            <ToggleSwitch
                                checked={当前GLM策略.续聊Thinking === true}
                                onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 续聊Thinking: next } })}
                                ariaLabel="切换GLM续聊Thinking"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-md border border-green-400/20 bg-black/20 p-3">
                            <div className="text-xs text-gray-300">开局Thinking</div>
                            <ToggleSwitch
                                checked={当前GLM策略.开局Thinking === true}
                                onChange={(next) => 实时应用更新({ GLM策略: { ...当前GLM策略, 开局Thinking: next } })}
                                ariaLabel="切换GLM开局Thinking"
                            />
                        </div>
                    </div>
                    <div className="text-xs text-gray-500">稳定模型救场配置在「接口配置中心」的 GLM 稳定救场模型中设置；未配置时会退回稳定提示词救场。</div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm text-wuxia-cyan font-bold">字数要求</label>
                    <input 
                        type="text"
                        inputMode="numeric"
                        value={wordCountDraft}
                        onChange={(e) => {
                            setWordCountDraft(e.target.value.replace(/[^\d]/g, ''));
                        }}
                        onBlur={提交字数要求}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                        className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider"
                        placeholder="例如 450"
                    />
                    <div className="text-xs text-gray-500">实际校验会保留少量容错；越接近目标，越容易直接通过并只提示。</div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm text-wuxia-cyan font-bold">字数不足处理</label>
                    {渲染内置下拉({
                        menuKey: 'shortBodyHandling',
                        value: form.字数不足处理方式 || '重新生成',
                        options: 字数不足处理选项,
                        onChange: (value) => 实时应用更新({ 字数不足处理方式: value as NonNullable<游戏设置结构['字数不足处理方式']> })
                    })}
                    <div className="text-xs text-gray-400">{字数不足处理选项.find(option => option.value === (form.字数不足处理方式 || '重新生成'))?.description}</div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm text-wuxia-cyan font-bold">叙事人称</label>
                    {渲染内置下拉({
                        menuKey: 'perspective',
                        value: form.叙事人称,
                        options: 叙事人称选项,
                        onChange: (value) => 实时应用更新({ 叙事人称: value as 游戏设置结构['叙事人称'] })
                    })}
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm text-wuxia-cyan font-bold">剧情风格</label>
                    {渲染内置下拉({
                        menuKey: 'style',
                        value: form.剧情风格,
                        options: 剧情风格选项,
                        onChange: (value) => 实时应用更新({ 剧情风格: value as 游戏设置结构['剧情风格'] })
                    })}
                    <div className="text-xs text-gray-400">将作为 AI 助手消息注入在本轮上下文末尾，并位于 COT 伪装消息之前。</div>
                </div>
                {form.剧情风格 === 'NTL后宫' && (
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm text-wuxia-cyan font-bold">NTL后宫档位</label>
                        {渲染内置下拉({
                            menuKey: 'ntl',
                            value: form.NTL后宫档位,
                            options: NTL后宫档位选项,
                            onChange: (value) => 实时应用更新({ NTL后宫档位: value as 游戏设置结构['NTL后宫档位'] })
                        })}
                        <div className="text-xs text-gray-400">用于控制“禁忌关系”强度，仅在 NTL 后宫风格下生效。</div>
                    </div>
                )}
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">研发 / 诊断模式</div>
                        <div className="text-xs text-gray-400 mt-1">开启后显示运行日志、NPC 管理、变量管理、地图 NPC 调试等高级排错入口；关闭后普通玩家界面更干净。</div>
                    </div>
                    <ToggleSwitch
                        checked={(form as any).启用研发诊断模式 === true}
                        onChange={(next) => 实时应用更新({ 启用研发诊断模式: next } as any)}
                        ariaLabel="切换研发诊断模式"
                    />
                </div>
            </div>

            <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-950/15 p-4">
                <div>
                    <div className="text-sm text-wuxia-cyan font-bold">高级存档修复</div>
                    <div className="text-xs text-gray-400 mt-1">
                        此功能用于修复旧存档历程天数异常。修改后会影响右上角历程天数计算，不会改变当前游戏时间。应用后请手动保存进度。
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded border border-wuxia-gold/10 bg-black/25 p-3">
                        <div className="text-[11px] text-gray-500">当前游戏初始时间</div>
                        <div className="mt-1 break-all font-mono text-sm text-gray-100">{gameInitialTime?.trim() || '未知'}</div>
                    </div>
                    <div className="rounded border border-wuxia-gold/10 bg-black/25 p-3">
                        <div className="text-[11px] text-gray-500">当前环境时间</div>
                        <div className="mt-1 break-all font-mono text-sm text-gray-100">{currentGameTime?.trim() || '未知'}</div>
                    </div>
                    <div className="rounded border border-wuxia-gold/10 bg-black/25 p-3">
                        <div className="text-[11px] text-gray-500">当前历程天数</div>
                        <div className="mt-1 font-mono text-sm text-gray-100">第 {Number.isFinite(journeyDayCount) ? journeyDayCount : 1} 天</div>
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <label className="block space-y-1">
                        <span className="text-xs text-gray-300">新的游戏初始时间</span>
                        <input
                            type="text"
                            value={initialTimeDraft}
                            onChange={(event) => {
                                setInitialTimeDraft(event.target.value);
                                if (repairMessage?.tone === 'error') setRepairMessage(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleRepairInitialTime();
                                }
                            }}
                            className="w-full rounded-md border border-amber-500/30 bg-black/50 p-3 font-mono text-sm text-white outline-none transition-all focus:border-wuxia-gold"
                            placeholder="2026:12:21:21:25"
                        />
                    </label>
                    <GameButton
                        type="button"
                        variant="secondary"
                        disabled={repairBusy || !initialTimeDraft.trim()}
                        onClick={() => { void handleRepairInitialTime(); }}
                        className="w-full md:w-auto disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {repairBusy ? '应用中' : '应用修正'}
                    </GameButton>
                </div>
                {repairMessage && (
                    <div className={`rounded border px-3 py-2 text-xs ${
                        repairMessage.tone === 'success'
                            ? 'border-green-500/30 bg-green-500/10 text-green-300'
                            : repairMessage.tone === 'info'
                                ? 'border-gray-500/30 bg-gray-500/10 text-gray-300'
                                : 'border-red-500/35 bg-red-500/10 text-red-300'
                    }`}>
                        {repairMessage.text}
                    </div>
                )}
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">仅手动更新 APK</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，APK 不再自动检查更新或弹出更新提示；需要你手动打开更新日志或点击 APK 下载。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.禁用APK自动更新 === true}
                        onChange={(next) => 实时应用更新({ 禁用APK自动更新: next })}
                        ariaLabel="切换仅手动更新 APK"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">行动选项功能</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，将在上下文注入“行动选项规范”，并要求输出 \`&lt;行动选项&gt;\` 标签。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用行动选项 !== false}
                        onChange={(next) => 实时应用更新({ 启用行动选项: next })}
                        ariaLabel="切换行动选项功能"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">防抢话（NoControl）</div>
                        <div className="text-xs text-gray-400 mt-1">默认开启；若当前酒馆预设已包含防抢话规则，则优先使用玩家导入的预设。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用防止说话 !== false}
                        onChange={(next) => 实时应用更新({ 启用防止说话: next })}
                        ariaLabel="切换防止说话"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">COT伪装历史消息注入</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，会在 \`user:开始任务\` 之后注入一条伪装历史消息，用于强化思考段输出习惯。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用COT伪装注入 !== false}
                        onChange={(next) => 实时应用更新({ 启用COT伪装注入: next })}
                        ariaLabel="切换COT伪装历史消息注入"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">GPT模式</div>
                        <div className="text-xs text-gray-400 mt-1">这里控制主剧情链路。开启后，\`user:开始任务\` 会改为本回合真实用户输入，并移除 AI 角色里的“本回合玩家输入”注入；其他独立 API 可在“独立 API GPT 模式”页单独配置。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用GPT模式 === true}
                        onChange={(next) => 实时应用更新({ 启用GPT模式: next })}
                        ariaLabel="切换GPT模式"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">免责声明输出要求</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，AI 会在本回合最后追加独立免责声明段落；不会插入到正文中间。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用免责声明输出 === true}
                        onChange={(next) => 实时应用更新({ 启用免责声明输出: next })}
                        ariaLabel="切换免责声明输出要求"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">标签检测完整性</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，系统会校验 `&lt;正文&gt;`/`&lt;短期记忆&gt;`/`&lt;命令&gt;` 三个标签是否完整，不完整会直接报错并阻止写入。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用标签检测完整性 === true}
                        onChange={(next) => 实时应用更新({ 启用标签检测完整性: next })}
                        ariaLabel="切换标签检测完整性"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">标签自动修复</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，系统会在解析前自动修复常见标签错误（如重复开标签、缺失闭标签）。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用标签修复 !== false}
                        onChange={(next) => 实时应用更新({ 启用标签修复: next })}
                        ariaLabel="切换标签自动修复"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">正文词汇审查</div>
                        <div className="text-xs text-gray-400 mt-1">默认开启。关闭后会跳过女性模板名黑名单、内部档案名称泄露等正文词汇类拦截；标签结构、人称一致性和 NPC 结构保护仍会继续生效。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用正文词汇审查 !== false}
                        onChange={(next) => 实时应用更新({ 启用正文词汇审查: next })}
                        ariaLabel="切换正文词汇审查"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">生成失败自动重试</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，生成或解析报错时会直接自动重试，最多 3 次；中间不会立即进入错误修改区域或重试确认弹窗。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用自动重试 === true}
                        onChange={(next) => 实时应用更新({ 启用自动重试: next })}
                        ariaLabel="切换生成失败自动重试"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">标签协议失败自动回炉</div>
                        <div className="text-xs text-gray-400 mt-1">默认开启。遇到标签结构不完整时，会把缺失标签或顺序问题直接发回给 AI 再重写一次；如果你手动关闭，失败时会明确提示优先重ROLL。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用标签协议失败自动回炉 !== false}
                        onChange={(next) => 实时应用更新({ 启用标签协议失败自动回炉: next })}
                        ariaLabel="切换标签协议失败自动回炉"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">每回合结束自动存档</div>
                        <div className="text-xs text-gray-400 mt-1">默认开启。正文落地和后台队列收尾时都会写入最近自动存档，减少刷新或更新页面后丢失新进度、图片绑定和角色状态的情况。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用回合结束自动存档 !== false}
                        onChange={(next) => 实时应用更新({ 启用回合结束自动存档: next })}
                        ariaLabel="切换每回合结束自动存档"
                    />
                </div>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">回合提示音</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，每回合生成结束时播放短促提示音。网页和 APK 均支持。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用回合提示音 !== false}
                        onChange={(next) => 实时应用更新({ 启用回合提示音: next })}
                        ariaLabel="切换回合提示音"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">繁体模式</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，会向各个 AI 生成功能注入繁体中文输出指令，要求新生成的正文、回忆、规划、地图等游戏内容使用繁体中文；不会强制转换界面按钮或已有存档旧文本。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用繁体模式 === true}
                        onChange={(next) => 实时应用更新({ 启用繁体模式: next })}
                        ariaLabel="切换繁体模式"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">全局非流式输出</div>
                        <div className="text-xs text-gray-400 mt-1">开启后强制所有阶段使用非流式请求（AI 一次性返回），覆盖各阶段的独立设置。默认关闭（流式输出，逐段返回结果）。各阶段的独立非流式开关可在「流程页面」每阶段设置区中调整。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用非流式输出 === true}
                        onChange={(next) => 实时应用更新({ 启用非流式输出: next })}
                        ariaLabel="切换全局非流式输出"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">女主剧情规划</div>
                        <div className="text-xs text-gray-400 mt-1">开启后保留女主规划状态，并启用每回合独立规划分析链路；主剧情只读取状态，不再直接维护女主规划提示词。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用女主剧情规划 === true}
                        onChange={(next) => 实时应用更新({ 启用女主剧情规划: next })}
                        ariaLabel="切换女主剧情规划"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">NSFW模式</div>
                        <div className="text-xs text-gray-400 mt-1">开启后才会注入独立 NSFW 提示词，并在江湖谱中显示女主私密档案 UI；关闭时提示词与 UI 都不生效。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用NSFW模式 === true}
                        onChange={(next) => 实时应用更新({ 启用NSFW模式: next })}
                        ariaLabel="切换NSFW模式"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">男娘 / 扶她相关 NSFW 内容</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，NSFW 模式下会为男性、男娘、扶她主要角色补齐男娘设定、扶她设定、肉棒描述、屁穴描述等档案，并允许相关私密特写；关闭后不再提示生成，也隐藏相关入口。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用男娘NSFW内容 !== false}
                        onChange={(next) => 实时应用更新({ 启用男娘NSFW内容: next })}
                        disabled={form.启用NSFW模式 !== true}
                        ariaLabel="切换男娘/扶她相关NSFW内容"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">亲密边界与场合机制</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，亲密推进会检查自愿、场合、好感、角色性格和部位边界；公开或不合适场景默认克制，越界请求会被拒绝并可能降低好感。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用亲密边界机制 !== false}
                        onChange={(next) => 实时应用更新({ 启用亲密边界机制: next })}
                        disabled={form.启用NSFW模式 !== true}
                        ariaLabel="切换亲密边界与场合机制"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">饱腹与水分系统</div>
                        <div className="text-xs text-gray-400 mt-1">关闭后，将停止注入饱腹/口渴相关提示词，并隐藏前端对应状态条；旧存档字段会保留但不再重点管理。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用饱腹口渴系统 !== false}
                        onChange={(next) => 实时应用更新({ 启用饱腹口渴系统: next })}
                        ariaLabel="切换饱腹与水分系统"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">修炼体系相关内容</div>
                        <div className="text-xs text-gray-400 mt-1">关闭后，将停止注入境界/功法/内力/修炼相关提示词与上下文，并关闭前端功法模块；旧存档字段保留但不再重点管理。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用修炼体系 !== false}
                        onChange={(next) => 实时应用更新({ 启用修炼体系: next })}
                        ariaLabel="切换修炼体系相关内容"
                    />
                </div>
            </div>

            <div className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">性别比例自动演变</div>
                        <div className="text-xs text-gray-400 mt-1">开启后，世界演变环节会根据剧情自动调整性别比例（世界级+地点级），并生成对应的个体性转命令；关闭后性别比例不受AI自动调整。</div>
                        {性别比例演变预设 != null && (
                            <div className="text-xs text-amber-400/80 mt-1">
                                ⚙ 创意工坊叙事要求已锁定为{性别比例演变预设 ? '开启' : '关闭'}，此开关暂不可调整
                            </div>
                        )}
                    </div>
                    <ToggleSwitch
                        checked={性别比例演变预设 != null ? 性别比例演变预设 : form.性别比例自动演变 === true}
                        onChange={性别比例演变预设 != null ? undefined : (next) => 实时应用更新({ 性别比例自动演变: next })}
                        disabled={性别比例演变预设 != null}
                        ariaLabel="切换性别比例自动演变"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm text-wuxia-cyan font-bold">额外要求提示词 (Custom Prompt)</label>
                <textarea 
                    value={form.额外提示词}
                    onChange={(e) => {
                        const nextValue = e.target.value;
                        setForm(prev => ({ ...prev, 额外提示词: nextValue }));
                    }}
                    onBlur={(e) => {
                        const next = { ...form, 额外提示词: e.currentTarget.value };
                        setForm(next);
                        onSave(next);
                    }}
                    className="w-full h-32 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none custom-scrollbar"
                    placeholder="在此输入需要追加到 Prompt 最后的特殊指令，例如：'严禁使用现代词汇'..."
                />
            </div>

            <div className="pt-6 border-t border-wuxia-gold/20 mt-8 space-y-4">
                <div className="text-base font-bold text-wuxia-gold">叙事平静值</div>
                <div className="text-xs text-gray-400">监控连续无剧情波折的回合数。当平静计数达到最低触发阈值后，按等分区段向 AI 注入推进文本，引导剧情自然发展。AI 输出 <code className="text-wuxia-cyan">&lt;情节事件&gt;</code> 标签（介入/退出/结束→归零，延续→+1，无标签→+2）驱动计数器。</div>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-wuxia-cyan font-bold">启用叙事平静值</div>
                        <div className="text-xs text-gray-500 mt-1">开启后每回合检测 AI 输出的情节事件标签并更新平静计数。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.叙事平静值配置?.启用 === true}
                        onChange={(next) => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 启用: next } })}
                        ariaLabel="切换叙事平静值"
                    />
                </div>

                {form.叙事平静值配置?.启用 === true && (
                    <div className="space-y-3 pl-2 border-l-2 border-wuxia-gold/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="text-xs text-gray-400">无标签增量</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={form.叙事平静值配置?.无标签增量 ?? 2}
                                    onChange={(e) => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 无标签增量: Math.max(1, Number(e.target.value) || 2) } })}
                                    className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-2 text-white outline-none rounded-md transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">延续增量</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={form.叙事平静值配置?.延续增量 ?? 1}
                                    onChange={(e) => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 延续增量: Math.max(1, Number(e.target.value) || 1) } })}
                                    className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-2 text-white outline-none rounded-md transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">上限</label>
                                <input
                                    type="number"
                                    min={10}
                                    max={99}
                                    value={form.叙事平静值配置?.上限 ?? 32}
                                    onChange={(e) => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 上限: Math.max(10, Number(e.target.value) || 32) } })}
                                    className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-2 text-white outline-none rounded-md transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">最低触发阈值</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={form.叙事平静值配置?.最低触发阈值 ?? 12}
                                    onChange={(e) => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 最低触发阈值: Math.max(1, Number(e.target.value) || 12) } })}
                                    className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-2 text-white outline-none rounded-md transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">阈值文本（从最低触发阈值到上限等分段落，每段一个推进提示）</label>
                            {(form.叙事平静值配置?.阈值文本 || []).map((text, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 w-8 shrink-0">第{i + 1}段</span>
                                    <input
                                        type="text"
                                        value={text}
                                        onChange={(e) => {
                                            const next = [...(form.叙事平静值配置?.阈值文本 || [])];
                                            next[i] = e.target.value;
                                            实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 阈值文本: next } });
                                        }}
                                        className="flex-1 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-2 text-white text-sm outline-none rounded-md transition-all"
                                    />
                                    <button
                                        onClick={() => {
                                            const next = (form.叙事平静值配置?.阈值文本 || []).filter((_, idx) => idx !== i);
                                            实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 阈值文本: next } });
                                        }}
                                        className="text-xs text-red-400 hover:text-red-300 px-2 shrink-0"
                                    >删除</button>
                                </div>
                            ))}
                            <button
                                onClick={() => 实时应用更新({ 叙事平静值配置: { ...(form.叙事平静值配置 || {}), 阈值文本: [...(form.叙事平静值配置?.阈值文本 || []), ''] } })}
                                className="text-xs text-wuxia-cyan hover:text-wuxia-gold transition-colors"
                            >+ 添加段落</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-6 border-t border-wuxia-gold/20 mt-8 flex justify-end">
                <GameButton onClick={handleSave} variant="primary" className="w-full md:w-auto px-8">
                    保存设定
                </GameButton>
            </div>
        </div>
    );
};

export default GameSettings;
