import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 游戏设置结构, 酒馆预设结构 } from '../../../types';
import ToggleSwitch from '../../ui/ToggleSwitch';
import GameButton from '../../ui/GameButton';
import { parseJsonWithRepair } from '../../../utils/jsonRepair';
import { 酒馆提示词后处理选项 } from '../../../utils/gameSettings';
import { 规范化酒馆预设, 获取酒馆预设角色ID列表, 获取酒馆预设顺序 } from '../../../utils/tavernPreset';

interface Props {
    settings: 游戏设置结构;
    onSave: (settings: 游戏设置结构) => void;
}

const 生成预设ID = (): string => `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 解析角色ID = (preset: 酒馆预设结构 | null | undefined, value: unknown): number | null => {
    if (!preset) return null;
    const parsed = typeof value === 'number' && Number.isFinite(value)
        ? Math.floor(value)
        : (typeof value === 'string' && value.trim() ? Math.floor(Number(value)) : null);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return 获取酒馆预设顺序(preset, parsed)?.character_id ?? null;
    }
    return 获取酒馆预设顺序(preset, null)?.character_id ?? null;
};

const TavernPresetSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<游戏设置结构>(settings);
    const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
    const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [dirty, setDirty] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setForm(settings);
        setDirty(false);
        setExpandedItemKey(null);
    }, [settings]);

    const presetList = useMemo(() => (
        Array.isArray(form.酒馆预设列表) ? form.酒馆预设列表 : []
    ), [form.酒馆预设列表]);
    const selectedPresetId = useMemo(() => {
        const rawId = typeof form.当前酒馆预设ID === 'string' ? form.当前酒馆预设ID.trim() : '';
        if (rawId && presetList.some((item) => item.id === rawId)) return rawId;
        return presetList[0]?.id || null;
    }, [form.当前酒馆预设ID, presetList]);
    const selectedEntry = useMemo(() => (
        presetList.find((item) => item.id === selectedPresetId) || null
    ), [presetList, selectedPresetId]);
    const preset = selectedEntry?.预设 || form.酒馆预设 || null;
    const characterIds = useMemo(() => 获取酒馆预设角色ID列表(preset), [preset]);
    const selectedCharacterId = useMemo(() => {
        const candidate = form.酒馆预设角色ID ?? selectedEntry?.角色ID ?? null;
        return 解析角色ID(preset, candidate);
    }, [form.酒馆预设角色ID, selectedEntry?.角色ID, preset]);
    const selectedOrder = useMemo(() => 获取酒馆预设顺序(preset, selectedCharacterId), [preset, selectedCharacterId]);
    const promptMap = useMemo(() => {
        const map = new Map<string, any>();
        (Array.isArray(preset?.prompts) ? preset!.prompts : []).forEach((item: any) => {
            if (!item?.identifier) return;
            if (!map.has(item.identifier)) map.set(item.identifier, item);
        });
        return map;
    }, [preset]);
    const shownOrder = useMemo(() => {
        const order = Array.isArray(selectedOrder?.order) ? selectedOrder!.order : [];
        const indexed = order.map((item, orderIndex) => ({ item, orderIndex }));
        if (!showOnlyEnabled) return indexed;
        return indexed.filter((entry) => entry.item.enabled === true);
    }, [selectedOrder, showOnlyEnabled]);

    useEffect(() => {
        setExpandedItemKey(null);
    }, [selectedPresetId, selectedCharacterId, showOnlyEnabled]);

    const 应用配置 = (nextConfig: 游戏设置结构, options?: { autoSave?: boolean; tip?: string }) => {
        setForm(nextConfig);
        if (options?.autoSave) {
            onSave(nextConfig);
            setDirty(false);
        } else {
            setDirty(true);
        }
        if (options?.tip) setMessage(options.tip);
    };

    const 更新当前条目 = (
        patch: Partial<{ 名称: string; 预设: 酒馆预设结构; 角色ID: number | null }>,
        options?: { autoSave?: boolean; tip?: string }
    ) => {
        if (!selectedEntry) return;
        const nextList = presetList.map((entry) => {
            if (entry.id !== selectedEntry.id) return entry;
            const nextPreset = patch.预设 || entry.预设;
            const nextRoleId = patch.角色ID !== undefined ? patch.角色ID : entry.角色ID;
            return {
                ...entry,
                ...(patch.名称 !== undefined ? { 名称: patch.名称 } : {}),
                ...(patch.预设 ? { 预设: patch.预设 } : {}),
                ...(patch.角色ID !== undefined ? { 角色ID: 解析角色ID(nextPreset, nextRoleId) } : {})
            };
        });
        const active = nextList.find((item) => item.id === selectedEntry.id) || null;
        const nextConfig: 游戏设置结构 = {
            ...form,
            酒馆预设列表: nextList,
            当前酒馆预设ID: active?.id || null,
            酒馆预设: active?.预设 || null,
            酒馆预设名称: active?.名称 || '',
            酒馆预设角色ID: 解析角色ID(active?.预设 || null, patch.角色ID ?? form.酒馆预设角色ID ?? active?.角色ID ?? null)
        };
        应用配置(nextConfig, options);
    };

    const 切换预设 = (presetId: string) => {
        const nextEntry = presetList.find((item) => item.id === presetId) || null;
        if (!nextEntry) return;
        const nextCharacterId = 解析角色ID(nextEntry.预设, nextEntry.角色ID);
        const nextConfig: 游戏设置结构 = {
            ...form,
            当前酒馆预设ID: nextEntry.id,
            酒馆预设: nextEntry.预设,
            酒馆预设名称: nextEntry.名称,
            酒馆预设角色ID: nextCharacterId
        };
        应用配置(nextConfig, { autoSave: true, tip: `已切换到预设：${nextEntry.名称}` });
    };

    const 保存本地改动 = () => {
        onSave(form);
        setDirty(false);
        setMessage('酒馆预设改动已保存。');
    };

    const 修改顺序项启用 = (identifier: string, enabled: boolean) => {
        const currentPreset = selectedEntry?.预设 || null;
        const currentOrder = 获取酒馆预设顺序(currentPreset, selectedCharacterId);
        if (!currentPreset || !currentOrder) return;

        const nextPreset: 酒馆预设结构 = {
            ...currentPreset,
            prompts: [...currentPreset.prompts],
            prompt_order: currentPreset.prompt_order.map((group) => {
                if (group.character_id !== currentOrder.character_id) return group;
                return {
                    ...group,
                    order: group.order.map((item) => (
                        item.identifier === identifier
                            ? { ...item, enabled }
                            : item
                    ))
                };
            })
        };
        更新当前条目({ 预设: nextPreset });
    };

    const 修改提示词字段 = (identifier: string, patch: Partial<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
        const currentPreset = selectedEntry?.预设 || null;
        if (!currentPreset) return;

        const nextPreset: 酒馆预设结构 = {
            ...currentPreset,
            prompt_order: [...currentPreset.prompt_order],
            prompts: currentPreset.prompts.map((item) => (
                item.identifier === identifier
                    ? {
                        ...item,
                        ...(patch.role ? { role: patch.role } : {}),
                        ...(typeof patch.content === 'string' ? { content: patch.content } : {})
                    }
                    : item
            ))
        };
        更新当前条目({ 预设: nextPreset });
    };

    const 更新当前条目名称 = (value: string) => {
        const nextName = value.trim();
        if (!selectedEntry || !nextName || nextName === selectedEntry.名称) return;
        更新当前条目({ 名称: nextName }, { autoSave: true, tip: '预设名称已更新。' });
    };

    const 导入预设文件 = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;

        try {
            const text = await file.text();
            const parsed = parseJsonWithRepair<any>(text);
            if (!parsed.value) {
                throw new Error(parsed.error || 'JSON 解析失败');
            }
            const normalized = 规范化酒馆预设(parsed.value);
            if (!normalized) {
                throw new Error('该文件不是可用的酒馆预设（缺少 prompts / prompt_order）。');
            }

            const nextEntry = {
                id: 生成预设ID(),
                名称: file.name || `酒馆预设_${presetList.length + 1}`,
                预设: normalized,
                角色ID: 解析角色ID(normalized, null),
                导入时间: Date.now()
            };
            const nextList = [...presetList, nextEntry];
            const nextConfig: 游戏设置结构 = {
                ...form,
                启用酒馆预设模式: true,
                酒馆预设列表: nextList,
                当前酒馆预设ID: nextEntry.id,
                酒馆预设: nextEntry.预设,
                酒馆预设角色ID: nextEntry.角色ID ?? null,
                酒馆预设名称: nextEntry.名称
            };
            应用配置(nextConfig, {
                autoSave: true,
                tip: `已导入酒馆预设：${nextEntry.名称}${parsed.usedRepair ? '（已自动修复格式）' : ''}`
            });
        } catch (error: any) {
            setMessage(`导入失败：${error?.message || '未知错误'}`);
        }
    };

    const 删除当前预设 = () => {
        if (!selectedEntry) return;
        const currentIndex = presetList.findIndex((item) => item.id === selectedEntry.id);
        const nextList = presetList.filter((item) => item.id !== selectedEntry.id);
        if (nextList.length === 0) {
            const nextConfig: 游戏设置结构 = {
                ...form,
                启用酒馆预设模式: false,
                酒馆预设列表: [],
                当前酒馆预设ID: null,
                酒馆预设: null,
                酒馆预设角色ID: null,
                酒馆预设名称: ''
            };
            应用配置(nextConfig, { autoSave: true, tip: '已删除最后一个预设，酒馆预设模式已关闭。' });
            return;
        }

        const fallbackIndex = Math.min(currentIndex, nextList.length - 1);
        const nextEntry = nextList[fallbackIndex];
        const nextConfig: 游戏设置结构 = {
            ...form,
            酒馆预设列表: nextList,
            当前酒馆预设ID: nextEntry.id,
            酒馆预设: nextEntry.预设,
            酒馆预设角色ID: 解析角色ID(nextEntry.预设, nextEntry.角色ID),
            酒馆预设名称: nextEntry.名称
        };
        应用配置(nextConfig, { autoSave: true, tip: `已删除预设，当前切换为：${nextEntry.名称}` });
    };

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">酒馆预设</h3>
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>启用酒馆预设模式</span>
                    <ToggleSwitch
                        checked={form.启用酒馆预设模式 === true}
                        onChange={(next) => {
                            const nextConfig = { ...form, 启用酒馆预设模式: next };
                            应用配置(nextConfig, { autoSave: true });
                        }}
                        ariaLabel="切换酒馆预设模式"
                    />
                </label>

                <div className="flex gap-2 flex-wrap">
                    <GameButton
                        onClick={() => fileInputRef.current?.click()}
                        variant="secondary"
                        className="px-4 py-2 text-xs"
                    >
                        导入酒馆预设
                    </GameButton>
                    <GameButton
                        onClick={删除当前预设}
                        variant="secondary"
                        className="px-4 py-2 text-xs"
                        disabled={!selectedEntry}
                    >
                        删除当前预设
                    </GameButton>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json,text/plain"
                        className="hidden"
                        onChange={(e) => { void 导入预设文件(e); }}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-300">当前预设</label>
                        <select
                            value={selectedPresetId ?? ''}
                            onChange={(e) => 切换预设(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-white rounded-md outline-none focus:border-wuxia-gold text-xs"
                        >
                            {presetList.length === 0 && <option value="">未导入</option>}
                            {presetList.map((item, index) => (
                                <option key={item.id} value={item.id}>{index + 1}. {item.名称}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-gray-300">预设名称</label>
                        <input
                            defaultValue={selectedEntry?.名称 || ''}
                            key={selectedEntry?.id || 'no-preset'}
                            onBlur={(e) => 更新当前条目名称(e.currentTarget.value)}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-white rounded-md outline-none focus:border-wuxia-gold text-xs"
                            placeholder="输入预设名称后失焦保存"
                            disabled={!selectedEntry}
                        />
                    </div>
                </div>

                {characterIds.length > 0 && (
                    <div className="space-y-1">
                        <label className="text-xs text-gray-300">预设角色槽位</label>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-500">当前</span>
                            <select
                                value={selectedCharacterId ?? ''}
                                onChange={(e) => {
                                    const parsed = Number(e.target.value);
                                    const nextCharacterId = Number.isFinite(parsed) ? Math.floor(parsed) : null;
                                    更新当前条目(
                                        { 角色ID: nextCharacterId },
                                        { autoSave: true, tip: '角色槽位已切换。' }
                                    );
                                }}
                                className="w-28 bg-black/50 border border-gray-700 px-2 py-1.5 text-white rounded-md outline-none focus:border-wuxia-gold text-xs"
                            >
                                {characterIds.map((id) => (
                                    <option key={id} value={id}>{id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">角色卡角色描述（用于 {'{{char}}'} / &lt;charname&gt;）</label>
                    <textarea
                        value={typeof form.酒馆角色卡描述 === 'string' ? form.酒馆角色卡描述 : ''}
                        onChange={(e) => {
                            const nextValue = e.target.value;
                            setForm((prev) => ({ ...prev, 酒馆角色卡描述: nextValue }));
                            setDirty(true);
                        }}
                        onBlur={(e) => {
                            const nextConfig: 游戏设置结构 = {
                                ...form,
                                酒馆角色卡描述: e.currentTarget.value
                            };
                            应用配置(nextConfig, { autoSave: true, tip: '角色卡角色描述已保存。' });
                        }}
                        className="w-full h-20 bg-black/50 border border-gray-700 p-2 text-white rounded-md outline-none focus:border-wuxia-gold text-xs leading-relaxed resize-y custom-scrollbar"
                        placeholder="默认留空"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">提示词后处理方式</label>
                    <select
                        value={form.酒馆提示词后处理 || '未选择'}
                        onChange={(e) => {
                            const nextValue = e.target.value as NonNullable<游戏设置结构['酒馆提示词后处理']>;
                            const nextConfig: 游戏设置结构 = {
                                ...form,
                                酒馆提示词后处理: nextValue
                            };
                            应用配置(nextConfig, {
                                autoSave: true,
                                tip: `已切换酒馆提示词后处理：${nextValue}`
                            });
                        }}
                        className="w-full bg-black/50 border border-gray-700 p-2 text-white rounded-md outline-none focus:border-wuxia-gold text-xs"
                    >
                        {酒馆提示词后处理选项.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                    <div className="text-[11px] text-gray-500">
                        {(酒馆提示词后处理选项.find((item) => item.value === (form.酒馆提示词后处理 || '未选择'))?.description) || '保持默认处理。'}
                    </div>
                </div>

                {message && <div className="text-xs text-wuxia-cyan">{message}</div>}
            </div>

            {preset && selectedOrder && (
                <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-300">
                            当前顺序项：{selectedOrder.order.length}，启用：{selectedOrder.order.filter((item) => item.enabled === true).length}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                            <span>仅看启用</span>
                            <ToggleSwitch
                                checked={showOnlyEnabled}
                                onChange={setShowOnlyEnabled}
                                ariaLabel="仅看启用项"
                            />
                        </label>
                    </div>

                    <div className="space-y-3 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
                        {shownOrder.map(({ item: slot, orderIndex }) => {
                            const prompt = promptMap.get(slot.identifier) as any;
                            const role = prompt?.role === 'user' || prompt?.role === 'assistant' ? prompt.role : 'system';
                            const content = typeof prompt?.content === 'string' ? prompt.content : '';
                            const name = typeof prompt?.name === 'string' ? prompt.name.trim() : '';
                            const displayName = name || `条目 ${orderIndex + 1}`;
                            const isBuiltinWorldOrHistory = slot.identifier === 'worldInfoBefore' || slot.identifier === 'worldInfoAfter' || slot.identifier === 'chatHistory';
                            const itemKey = `${slot.identifier}_${orderIndex}`;
                            const isExpanded = expandedItemKey === itemKey;

                            return (
                                <div key={itemKey} className="rounded-md border border-gray-700/70 bg-black/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey))}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="text-xs text-wuxia-cyan truncate">{displayName}</div>
                                            <div className="text-[11px] text-gray-500 truncate">顺序 #{orderIndex + 1}</div>
                                        </button>
                                        <label className="flex items-center gap-2 text-xs text-gray-300">
                                            <span>启用</span>
                                            <ToggleSwitch
                                                checked={slot.enabled === true}
                                                onChange={(next) => 修改顺序项启用(slot.identifier, next)}
                                                ariaLabel={`切换 ${slot.identifier} 启用状态`}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey))}
                                            className="text-gray-400 hover:text-wuxia-gold transition-colors"
                                            aria-label={isExpanded ? '收起编辑区' : '展开编辑区'}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={1.8}
                                                stroke="currentColor"
                                                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </button>
                                    </div>

                                    {isExpanded && !prompt && (
                                        <div className="text-[11px] text-gray-500">该顺序项未匹配到 prompts 内容，可能是内置占位符。</div>
                                    )}

                                    {isExpanded && prompt && (
                                        <>
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-300">角色</label>
                                                <div className="inline-flex items-center rounded-md border border-gray-700 bg-black/50 p-1 gap-1">
                                                    {(['system', 'user', 'assistant'] as const).map((roleOption) => {
                                                        const active = role === roleOption;
                                                        return (
                                                            <button
                                                                key={roleOption}
                                                                type="button"
                                                                onClick={() => 修改提示词字段(slot.identifier, { role: roleOption })}
                                                                className={`px-2 py-1 rounded text-[11px] leading-none transition-colors ${
                                                                    active
                                                                        ? 'bg-wuxia-gold/20 text-wuxia-gold border border-wuxia-gold/40'
                                                                        : 'text-gray-300 border border-transparent hover:bg-white/5'
                                                                }`}
                                                            >
                                                                {roleOption}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-300">内容</label>
                                                <textarea
                                                    value={content}
                                                    onChange={(e) => 修改提示词字段(slot.identifier, { content: e.target.value })}
                                                    className="w-full h-28 bg-black/50 border border-gray-700 p-2 text-white rounded-md outline-none focus:border-wuxia-gold text-xs leading-relaxed resize-y custom-scrollbar"
                                                />
                                            </div>
                                            {isBuiltinWorldOrHistory && (
                                                <div className="text-[11px] text-amber-300/80">
                                                    该标识在本项目中由运行时注入：worldInfo* 使用世界书内容，chatHistory 使用真实对话历史。
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-2 border-t border-gray-700/60">
                        <GameButton
                            onClick={保存本地改动}
                            variant="primary"
                            className="w-full"
                            disabled={!dirty}
                        >
                            {dirty ? '保存预设改动' : '无未保存改动'}
                        </GameButton>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TavernPresetSettings;
