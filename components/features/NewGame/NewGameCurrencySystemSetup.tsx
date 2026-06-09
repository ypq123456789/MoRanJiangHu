import React, { useEffect, useMemo, useState } from 'react';
import InlineSelect from '../../ui/InlineSelect';
import type { CurrencySystem, CurrencyUnit, ModeRuntimeProfile } from '../../../models/system';
import {
    构建CurrencySystem模板,
    获取CurrencySystem预设模板列表,
    校验CurrencySystem草稿,
    type CurrencySystem预设模板ID
} from '../../../utils/modeRuntimeProfile';

interface Props {
    profile: ModeRuntimeProfile;
    onChangeProfile: (nextProfile: ModeRuntimeProfile) => void;
    compact?: boolean;
    onTouched?: () => void;
}

const 克隆 = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const 去重非空 = (items: Array<string | undefined>): string[] => Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));
type 模板选择值 = CurrencySystem预设模板ID | 'custom';

const 生成单位ID = (units: CurrencyUnit[]): string => {
    const ids = new Set(units.map((unit) => unit.id));
    let index = units.length + 1;
    while (ids.has(`unit-${index}`)) index += 1;
    return `unit-${index}`;
};

const 分配唯一单位ID = (preferredId: string, usedIds: Set<string>): string => {
    const trimmed = preferredId.trim();
    if (trimmed && !usedIds.has(trimmed)) return trimmed;
    let index = usedIds.size + 1;
    while (usedIds.has(`unit-${index}`)) index += 1;
    return `unit-${index}`;
};

const 位置兼容别名 = (index: number, total: number): string[] => {
    if (total <= 1) return ['基础货币'];
    if (index === 0) return ['上层货币'];
    if (index === total - 1) return ['底层货币'];
    if (total === 3 && index === 1) return ['中层货币'];
    return [];
};

export const 规范化新开局轻量CurrencySystem = (draft: CurrencySystem): { currencySystem?: CurrencySystem; errors: string[] } => {
    const units = Array.isArray(draft.units) ? draft.units : [];
    if (units.length <= 0) return { errors: ['至少需要 1 个货币单位。'] };
    const existingIds = new Set<string>();
    const normalizedUnits = units.map((unit, index) => {
        const id = 分配唯一单位ID(String(unit.id || ''), existingIds);
        existingIds.add(id);
        return {
            id,
            name: String(unit.name || `货币${index + 1}`).trim() || `货币${index + 1}`,
            ...(String(unit.symbol || '').trim() ? { symbol: String(unit.symbol || '').trim() } : {}),
            baseRate: Math.max(1, Math.floor(Number(unit.baseRate) || 1)),
            order: units.length - index,
            aliases: 去重非空([
                unit.name,
                unit.symbol,
                ...(unit.aliases || []),
                ...位置兼容别名(index, units.length)
            ])
        };
    });
    const fallbackBaseUnit = normalizedUnits.find((unit) => unit.baseRate === 1)?.id || normalizedUnits[normalizedUnits.length - 1].id;
    const baseUnitId = normalizedUnits.some((unit) => unit.id === draft.baseUnitId) ? draft.baseUnitId : fallbackBaseUnit;
    const finalUnits = normalizedUnits.map((unit) => unit.id === baseUnitId ? { ...unit, baseRate: 1 } : unit);
    return 校验CurrencySystem草稿({
        id: String(draft.id || '').trim() || 'custom-currency-system',
        name: String(draft.name || '').trim() || '自定义货币体系',
        baseUnitId,
        formatStyle: draft.formatStyle === 'single' || draft.formatStyle === 'compound' ? draft.formatStyle : 'compound',
        units: finalUnits
    });
};

const 新增单位 = (units: CurrencyUnit[]): CurrencyUnit => ({
    id: 生成单位ID(units),
    name: `货币${units.length + 1}`,
    baseRate: 1,
    order: 1
});

const 创建题材默认比对Profile = (profile: ModeRuntimeProfile): ModeRuntimeProfile => ({
    ...profile,
    economy: {
        ...profile.economy,
        currencySystem: undefined
    }
});

const 货币系统指纹 = (system: CurrencySystem): string => JSON.stringify({
    id: system.id,
    name: system.name,
    baseUnitId: system.baseUnitId,
    formatStyle: system.formatStyle || 'compound',
    units: (system.units || []).map((unit) => ({
        id: unit.id,
        name: unit.name,
        symbol: unit.symbol || '',
        baseRate: Number(unit.baseRate) || 1,
        order: Number(unit.order) || 1
    }))
});

const 匹配模板ID = (
    system: CurrencySystem,
    profile: ModeRuntimeProfile,
    templates: Array<{ id: CurrencySystem预设模板ID; label: string }>
): 模板选择值 => {
    const currentFingerprint = 货币系统指纹(system);
    const matchedPreset = templates
        .filter((template) => template.id !== 'topic-default')
        .find((template) => 货币系统指纹(构建CurrencySystem模板(template.id, profile)) === currentFingerprint);
    if (matchedPreset) return matchedPreset.id;

    const topicDefault = 构建CurrencySystem模板('topic-default', 创建题材默认比对Profile(profile));
    if (货币系统指纹(topicDefault) === currentFingerprint) return 'topic-default';
    return 'custom';
};

const NewGameCurrencySystemSetup: React.FC<Props> = ({ profile, onChangeProfile, compact = false, onTouched }) => {
    const templates = useMemo(() => 获取CurrencySystem预设模板列表(), []);
    const templateOptions = useMemo<Array<{ value: 模板选择值; label: string }>>(() => [
        ...templates.map((template) => ({ value: template.id, label: template.label })),
        { value: 'custom', label: '自定义货币系统' }
    ], [templates]);
    const [draft, setDraft] = useState<CurrencySystem>(() => 克隆(profile.economy.currencySystem || 构建CurrencySystem模板('topic-default', profile)));
    const [errors, setErrors] = useState<string[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<模板选择值>(() => (
        匹配模板ID(profile.economy.currencySystem || 构建CurrencySystem模板('topic-default', 创建题材默认比对Profile(profile)), profile, templates)
    ));

    useEffect(() => {
        const nextDraft = 克隆(profile.economy.currencySystem || 构建CurrencySystem模板('topic-default', profile));
        setDraft(nextDraft);
        setSelectedTemplateId(匹配模板ID(nextDraft, profile, templates));
        setErrors([]);
    }, [profile.economy.currencySystem, profile.economy.currencyTiers, profile.economy.currencyDisplayMode, profile, templates]);

    const 写入草稿 = (nextDraft: CurrencySystem, touched = true, templateId: 模板选择值 = 'custom') => {
        setDraft(nextDraft);
        setSelectedTemplateId(templateId);
        if (touched) onTouched?.();
        const result = 规范化新开局轻量CurrencySystem(nextDraft);
        setErrors(result.errors);
        if (!result.currencySystem) return;
        onChangeProfile({
            ...profile,
            economy: {
                ...profile.economy,
                currencySystem: result.currencySystem
            }
        });
    };

    const 应用模板 = (templateId: CurrencySystem预设模板ID) => {
        写入草稿(构建CurrencySystem模板(templateId, profile), true, templateId);
    };

    const 更新单位 = (index: number, patch: Partial<CurrencyUnit>) => {
        const units = draft.units.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit);
        写入草稿({ ...draft, units });
    };

    const 删除单位 = (index: number) => {
        const units = draft.units.filter((_, unitIndex) => unitIndex !== index);
        const baseUnitId = units.some((unit) => unit.id === draft.baseUnitId)
            ? draft.baseUnitId
            : units[units.length - 1]?.id || '';
        写入草稿({ ...draft, units, baseUnitId });
    };

    const 单位名称列表 = draft.units.map((unit) => unit.name || unit.id).filter(Boolean).join(' / ');
    const baseUnit = draft.units.find((unit) => unit.id === draft.baseUnitId) || draft.units[draft.units.length - 1];
    const preview = `当前：${draft.name || '货币体系'}｜${draft.formatStyle === 'single' ? '单一显示' : '复合显示'}｜${draft.formatStyle === 'single' ? `基础单位：${baseUnit?.name || '未设置'}` : 单位名称列表}`;

    return (
        <div className={`rounded-2xl border border-wuxia-gold/20 bg-black/30 ${compact ? 'p-3 space-y-3' : 'p-4 space-y-4'}`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="text-sm font-bold text-wuxia-gold">货币系统</div>
                    <div className="mt-1 text-[11px] leading-5 text-gray-400">选择模板后可轻量修改名称、符号和换算比例。越靠上的单位等级越高。</div>
                </div>
                <div className="text-[10px] text-wuxia-cyan font-mono tracking-[0.18em]">CURRENCY</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-5 text-gray-300">{preview}</div>
            <label className="block text-xs text-gray-300">
                预设模板
                <div className="mt-1">
                    <InlineSelect<模板选择值>
                        value={selectedTemplateId}
                        options={templateOptions}
                        onChange={(value) => {
                            if (value === 'custom') {
                                setSelectedTemplateId('custom');
                                return;
                            }
                            应用模板(value);
                        }}
                        buttonClassName="h-10 rounded-lg border-white/10 bg-black/40 px-3 py-0 text-sm"
                        panelClassName="max-w-full"
                    />
                </div>
                {selectedTemplateId === 'custom' && (
                    <div className="mt-1 text-[11px] text-wuxia-cyan">已自定义：当前货币体系与预设模板不完全一致。</div>
                )}
            </label>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-gray-300">
                    货币体系名称
                    <input value={draft.name} onChange={(event) => 写入草稿({ ...draft, name: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                </label>
                <label className="block text-xs text-gray-300">
                    显示方式
                    <select value={draft.formatStyle || 'compound'} onChange={(event) => 写入草稿({ ...draft, formatStyle: event.target.value as CurrencySystem['formatStyle'] })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45">
                        <option value="single">单一显示</option>
                        <option value="compound">复合显示</option>
                    </select>
                </label>
                <label className="block text-xs text-gray-300 md:col-span-2">
                    基础单位
                    <select value={draft.baseUnitId} onChange={(event) => 写入草稿({ ...draft, baseUnitId: event.target.value, units: draft.units.map((unit) => unit.id === event.target.value ? { ...unit, baseRate: 1 } : unit) })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45">
                        {draft.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name || unit.id}</option>)}
                    </select>
                </label>
            </div>
            <div className="space-y-3">
                {draft.units.map((unit, index) => (
                    <div key={`${unit.id}-${index}`} className="rounded-xl border border-white/10 bg-black/25 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-gray-200">单位 {index + 1}</div>
                            <button type="button" onClick={() => 删除单位(index)} className="text-[11px] text-gray-400 hover:text-red-200">删除</button>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                            <label className="block text-[11px] text-gray-400">
                                单位名称
                                <input value={unit.name} onChange={(event) => 更新单位(index, { name: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                符号
                                <input value={unit.symbol || ''} onChange={(event) => 更新单位(index, { symbol: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/45" />
                            </label>
                            <label className="block text-[11px] text-gray-400">
                                折算为基础单位
                                <input type="number" min={1} step={1} value={unit.id === draft.baseUnitId ? 1 : unit.baseRate}
                                    onChange={(event) => 更新单位(index, { baseRate: Number(event.target.value) })}
                                    disabled={unit.id === draft.baseUnitId}
                                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-gray-100 outline-none disabled:opacity-60 focus:border-wuxia-gold/45" />
                            </label>
                        </div>
                    </div>
                ))}
            </div>
            <button type="button" onClick={() => 写入草稿({ ...draft, units: [...draft.units, 新增单位(draft.units)] })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 hover:border-wuxia-gold/35 hover:text-wuxia-gold">
                新增货币单位
            </button>
            {errors.length > 0 && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-200">
                    {errors.map((error) => <div key={error}>{error}</div>)}
                </div>
            )}
        </div>
    );
};

export default NewGameCurrencySystemSetup;
