import React, { useEffect, useMemo, useState } from 'react';
import type { CurrencySystem, CurrencyUnit, ModeRuntimeProfile } from '../../../models/system';
import {
    构建CurrencySystem模板,
    获取CurrencySystem预设模板列表,
    校验CurrencySystem草稿,
    type CurrencySystem预设模板ID
} from '../../../utils/modeRuntimeProfile';

interface Props {
    profile: ModeRuntimeProfile;
    onApply: (currencySystem: CurrencySystem) => void;
    onClear: () => void;
}

const 分割别名 = (value: string): string[] => value.split(/[，,、\n]+/u).map((item) => item.trim()).filter(Boolean);
const 格式化别名 = (aliases?: string[]): string => (aliases || []).join('、');
const 克隆 = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const 生成新增单位 = (units: CurrencyUnit[]): CurrencyUnit => {
    let index = units.length + 1;
    const ids = new Set(units.map((unit) => unit.id));
    while (ids.has(`unit-${index}`)) index += 1;
    return {
        id: `unit-${index}`,
        name: `货币${index}`,
        baseRate: 1,
        order: index
    };
};

const CurrencySystemEditor: React.FC<Props> = ({ profile, onApply, onClear }) => {
    const templates = useMemo(() => 获取CurrencySystem预设模板列表(), []);
    const 当前系统 = profile.economy.currencySystem;
    const [draft, setDraft] = useState<CurrencySystem>(() => 克隆(当前系统 || 构建CurrencySystem模板('topic-default', profile)));
    const [errors, setErrors] = useState<string[]>([]);

    useEffect(() => {
        setDraft(克隆(当前系统 || 构建CurrencySystem模板('topic-default', profile)));
        setErrors([]);
    }, [当前系统, profile.economy.currencyTiers, profile.economy.currencyDisplayMode]);

    const 应用草稿 = (next: CurrencySystem) => {
        setDraft(next);
        const result = 校验CurrencySystem草稿(next);
        setErrors(result.errors);
        if (result.currencySystem) onApply(result.currencySystem);
    };

    const 更新字段 = (patch: Partial<CurrencySystem>) => {
        应用草稿({ ...draft, ...patch });
    };

    const 更新单位 = (index: number, patch: Partial<CurrencyUnit>) => {
        const units = draft.units.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit);
        应用草稿({ ...draft, units });
    };

    const 删除单位 = (index: number) => {
        const removed = draft.units[index];
        const units = draft.units.filter((_, unitIndex) => unitIndex !== index);
        const baseUnitId = removed?.id === draft.baseUnitId ? (units.find((unit) => unit.baseRate === 1)?.id || units[0]?.id || '') : draft.baseUnitId;
        应用草稿({ ...draft, units, baseUnitId });
    };

    const 新增单位 = () => {
        应用草稿({ ...draft, units: [...draft.units, 生成新增单位(draft.units)] });
    };

    const 应用模板 = (templateId: CurrencySystem预设模板ID) => {
        应用草稿(构建CurrencySystem模板(templateId, profile));
    };

    return (
        <div className="sm:col-span-2 rounded-lg border border-wuxia-gold/20 bg-black/25 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-xs font-bold text-wuxia-gold">动态货币系统编辑器</div>
                    <div className="mt-1 text-[11px] leading-5 text-gray-400">
                        通过模板和表单配置新版货币系统；校验通过后写入 economy.currencySystem，清除后继续使用旧版三层货币。
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
                >
                    清除动态货币系统
                </button>
            </div>

            <label className="mt-3 block text-xs text-gray-300">
                预设模板
                <select
                    value=""
                    onChange={(event) => {
                        const templateId = event.target.value as CurrencySystem预设模板ID;
                        if (templateId) 应用模板(templateId);
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                >
                    <option value="">选择模板并覆盖当前动态货币系统</option>
                    {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                </select>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-gray-300">
                    体系 ID
                    <input
                        value={draft.id}
                        onChange={(event) => 更新字段({ id: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                    />
                </label>
                <label className="block text-xs text-gray-300">
                    体系名称
                    <input
                        value={draft.name}
                        onChange={(event) => 更新字段({ name: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                    />
                </label>
                <label className="block text-xs text-gray-300">
                    显示方式
                    <select
                        value={draft.formatStyle || 'compound'}
                        onChange={(event) => 更新字段({ formatStyle: event.target.value as CurrencySystem['formatStyle'] })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                    >
                        <option value="single">单一显示</option>
                        <option value="compound">复合显示</option>
                    </select>
                </label>
                <label className="block text-xs text-gray-300">
                    基础单位
                    <select
                        value={draft.baseUnitId}
                        onChange={(event) => 更新字段({ baseUnitId: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45"
                    >
                        {draft.units.map((unit) => (
                            <option key={unit.id || unit.name} value={unit.id}>{unit.name || unit.id}</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="mt-4 space-y-3">
                {draft.units.map((unit, index) => (
                    <div key={`${unit.id}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-gray-200">单位 {index + 1}</div>
                            <button
                                type="button"
                                onClick={() => 删除单位(index)}
                                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:border-red-400/45 hover:text-red-200"
                            >
                                删除
                            </button>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <label className="block text-[11px] text-gray-400">
                                单位ID
                                <input value={unit.id} onChange={(event) => 更新单位(index, { id: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                                <div className="mt-1 leading-4 text-gray-500">用于程序识别，建议使用英文或拼音，不要重复。</div>
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                单位名称
                                <input value={unit.name} onChange={(event) => 更新单位(index, { name: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                符号
                                <input value={unit.symbol || ''} onChange={(event) => 更新单位(index, { symbol: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                折算为基础单位
                                <input type="number" min={1} step={1} value={unit.baseRate} onChange={(event) => 更新单位(index, { baseRate: Number(event.target.value) })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                                <div className="mt-1 leading-4 text-gray-500">例如：若基础单位是铜钱，元宝填 100000 表示 1 元宝 = 100000 铜钱。</div>
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                显示顺序
                                <input type="number" step={1} value={unit.order} onChange={(event) => 更新单位(index, { order: Number(event.target.value) })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                            </label>
                            <label className="block text-[11px] text-gray-400 sm:col-span-3">
                                别名
                                <input value={格式化别名(unit.aliases)} onChange={(event) => 更新单位(index, { aliases: 分割别名(event.target.value) })}
                                    placeholder="多个别名用逗号、顿号或换行分隔"
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-wuxia-gold/45" />
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={新增单位}
                className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 hover:border-wuxia-gold/35 hover:text-wuxia-gold"
            >
                新增货币单位
            </button>

            {errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-200">
                    {errors.map((error) => <div key={error}>{error}</div>)}
                </div>
            )}
        </div>
    );
};

export default CurrencySystemEditor;
