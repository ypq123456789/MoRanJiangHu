import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as dbService from '../../../services/dbService';
import { 解析ZIP存档文件 } from '../../../services/saveArchiveService';
import { parseJsonWithRepair } from '../../../utils/jsonRepair';
import { 设置分类定义表, 设置键, type 设置分类类型 } from '../../../utils/settingsSchema';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';

interface Props {
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

const StorageManager: React.FC<Props> = ({ requestConfirm }) => {
    const [info, setInfo] = useState<dbService.StorageBreakdown>({
        usage: 0,
        quota: 0,
        details: { saves: 0, settings: 0, prompts: 0, api: 0, imageAssets: 0, cache: 0 }
    });
    const [managedSettings, setManagedSettings] = useState<dbService.设置管理项[]>([]);
    const [protectApiKey, setProtectApiKey] = useState(false);
    const [protectCustomPreset, setProtectCustomPreset] = useState(false);
    const [protectSaves, setProtectSaves] = useState(false);
    const [importOverwrite, setImportOverwrite] = useState(false);
    const [runningAction, setRunningAction] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const settingsTemplateInputRef = useRef<HTMLInputElement | null>(null);

    const pushNotice = (type: 'success' | 'error', text: string) => {
        setNotice({ type, text });
        window.setTimeout(() => setNotice(null), 2400);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatTime = (value: number | null) => {
        if (!value) return '未知';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '未知';
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const refreshStorageView = async () => {
        const [storageInfo, settingsInfo, savedProtect] = await Promise.all([
            dbService.获取详细存储信息(),
            dbService.获取设置管理清单(),
            dbService.读取存档保护状态()
        ]);
        setInfo(storageInfo);
        setManagedSettings(settingsInfo);
        setProtectSaves(savedProtect);
    };

    useEffect(() => {
        void (async () => {
            try {
                await refreshStorageView();
            } catch (error: any) {
                pushNotice('error', `读取存储设置失败：${error?.message || '未知错误'}`);
            }
        })();
    }, []);

    const groupedSettings = useMemo(() => {
        const map = new Map<设置分类类型 | 'unknown', dbService.设置管理项[]>();
        managedSettings.forEach((item) => {
            const key = item.category;
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key)!.push(item);
        });
        return Array.from(map.entries());
    }, [managedSettings]);

    const handleToggleSaveProtection = async (next: boolean) => {
        if (runningAction) return;
        const prev = protectSaves;
        setProtectSaves(next);
        try {
            await dbService.设置存档保护状态(next);
            await refreshStorageView();
            pushNotice('success', next ? '存档保护已开启' : '存档保护已关闭');
        } catch (error: any) {
            setProtectSaves(prev);
            pushNotice('error', `存档保护设置失败：${error?.message || '未知错误'}`);
        }
    };

    const runWithConfirm = async (
        actionKey: string,
        options: {
            title: string;
            message: string;
            confirmText?: string;
            onRun: () => Promise<void>;
            reloadAfterDone?: boolean;
        }
    ) => {
        if (runningAction) return;
        const ok = requestConfirm
            ? await requestConfirm({
                title: options.title,
                message: options.message,
                confirmText: options.confirmText || '确认',
                danger: true
            })
            : true;
        if (!ok) return;
        try {
            setRunningAction(actionKey);
            await options.onRun();
            if (options.reloadAfterDone) {
                window.location.reload();
                return;
            }
            await refreshStorageView();
            pushNotice('success', '操作完成');
        } catch (error: any) {
            pushNotice('error', `操作失败：${error?.message || '未知错误'}`);
        } finally {
            setRunningAction(null);
        }
    };

    const handleDeleteSetting = async (item: dbService.设置管理项) => {
        await runWithConfirm(`delete_${item.key}`, {
            title: `删除 ${item.label}`,
            message: item.internal
                ? `确定删除系统项“${item.label}”吗？这类记录通常用于保护开关或迁移标记。`
                : `确定删除“${item.label}”吗？`,
            confirmText: '删除',
            onRun: async () => {
                await dbService.删除设置(item.key);
            }
        });
    };

    const handleClearAll = async () => {
        const protectionText = [
            protectSaves ? '存档数据' : null,
            protectApiKey ? 'API 配置（不含生图预设）' : null,
            protectCustomPreset ? '自定义背景/天赋/开局方案' : null
        ].filter(Boolean).join('、');
        await runWithConfirm('clear_all', {
            title: '清空全部数据',
            message: protectionText
                ? `确定清空全部数据吗？未受保护的存档、提示词、世界书、文生图预设、图片档案、缓存与其它本地数据都会被清空；将保留：${protectionText}。`
                : '确定清空全部数据吗？存档、提示词、世界书、文生图预设、图片档案、缓存与其它本地数据都会被清空，且不可撤销。',
            confirmText: '清空全部',
            onRun: async () => {
                await dbService.清空全部数据({
                    保留APIKey: protectApiKey,
                    保留自定义背景天赋: protectCustomPreset
                });
            },
            reloadAfterDone: true
        });
    };

    const handleForceWipeAll = async () => {
        await runWithConfirm('force_wipe_all', {
            title: '彻底删除全部数据（忽略保护）',
            message: '此操作将忽略所有保护开关，强制清空存档、设置、API、提示词、内置提示词、世界书、生图预设、图库档案、图片资源、自定义背景/天赋/开局方案与缓存，且不可恢复。是否继续？',
            confirmText: '彻底删除',
            onRun: async () => {
                await dbService.强制彻底清空全部数据();
            },
            reloadAfterDone: true
        });
    };

    const handleClearAllSaves = async () => {
        if (protectSaves) {
            pushNotice('error', '存档保护已开启，请先关闭后再删除存档。');
            return;
        }
        await runWithConfirm('clear_saves', {
            title: '删除全部存档',
            message: '确定删除全部手动/自动存档吗？',
            confirmText: '删除',
            onRun: async () => {
                await dbService.清空存档数据();
            }
        });
    };

    const handleClearAllSettings = async () => {
        const protectionText = [
            protectApiKey ? 'API 配置（不含生图预设）' : null,
            protectCustomPreset ? '自定义背景/天赋/开局方案' : null
        ].filter(Boolean).join('、');
        await runWithConfirm('clear_all_settings', {
            title: '清空全部设置',
            message: protectionText
                ? `确定清空全部设置吗？未受保护的提示词、世界书、文生图预设、图库档案与其它设置都会恢复默认；将保留：${protectionText}。`
                : '确定清空全部设置吗？未受保护的提示词、世界书、文生图预设、图库档案与其它设置都会恢复默认。',
            confirmText: '清空设置',
            onRun: async () => {
                await dbService.清空全部设置({
                    保留APIKey: protectApiKey,
                    保留自定义背景天赋: protectCustomPreset
                });
            },
            reloadAfterDone: true
        });
    };

    const handleClearCache = async () => {
        await runWithConfirm('clear_cache', {
            title: '清除缓存',
            message: '确定清除系统缓存吗？此操作不会删除存档和设置。',
            confirmText: '清除',
            onRun: async () => {
                await dbService.清除系统缓存();
            }
        });
    };

    const handleDeleteCustomPreset = async () => {
        await runWithConfirm('delete_custom_preset', {
            title: '删除自定义背景/天赋/开局方案',
            message: '确定删除“自定义背景图 + 自定义天赋/身份背景词条 + 自定义开局方案”吗？',
            confirmText: '删除',
            onRun: async () => {
                await dbService.清除自定义背景与天赋();
            }
        });
    };

    const handleDeleteImageGallery = async () => {
        await runWithConfirm('delete_image_gallery', {
            title: '删除图库相关内容',
            message: '确定删除图库相关内容吗？这会清空场景图库档案，以及所有存档中的 NPC 图片档案、最近生图结果，并回收未引用图片资源。',
            confirmText: '删除图库',
            onRun: async () => {
                await dbService.清除图库相关内容();
            }
        });
    };

    const handleDeleteImagePrompts = async () => {
        await runWithConfirm('delete_image_prompts', {
            title: '删除图片相关提示词与预设',
            message: '确定删除图片相关提示词与预设吗？这会清空画师串预设、词组转化器规则预设、角色锚点、PNG 画风预设，并重置图片相关默认负面词配置。',
            confirmText: '删除提示词',
            onRun: async () => {
                await dbService.清除图片相关提示词与预设();
            }
        });
    };

    const handleTriggerImportSaves = async () => {
        if (runningAction) return;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '导入存档',
                message: importOverwrite
                    ? '将先清空当前全部存档，再导入文件中的存档。是否继续？'
                    : '将以“合并+去重”方式导入存档。是否继续？',
                confirmText: '继续导入',
                danger: importOverwrite
            })
            : true;
        if (!ok) return;
        fileInputRef.current?.click();
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = '';
        if (!file || runningAction) return;

        try {
            setRunningAction('import_saves');
            let payload: unknown;
            let repairedTip = '';
            if (/\.zip$/i.test(file.name) || /application\/zip/i.test(file.type)) {
                payload = await 解析ZIP存档文件(file);
            } else {
                const fileText = await file.text();
                const parsed = parseJsonWithRepair<any>(fileText);
                if (!parsed.value) {
                    throw new Error(parsed.error || 'JSON 解析失败');
                }
                payload = parsed.value;
                repairedTip = parsed.usedRepair ? '（文件有格式问题，已自动修复）' : '';
            }
            const result = await dbService.导入存档数据(payload, { 覆盖现有: importOverwrite });
            await refreshStorageView();
            pushNotice('success', `导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条${repairedTip}`);
        } catch (error: any) {
            pushNotice('error', `导入失败：${error?.message || '未知错误'}`);
        } finally {
            setRunningAction(null);
        }
    };

    const handleExportDevSettingsTemplate = async () => {
        if (runningAction) return;
        try {
            setRunningAction('export_dev_settings_template');
            const payload = await dbService.导出研发设置模板();
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const link = document.createElement('a');
            link.href = url;
            link.download = `wuxia-dev-settings-template-${stamp}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            pushNotice('success', '研发设置模板已导出。');
        } catch (error: any) {
            pushNotice('error', `导出失败：${error?.message || '未知错误'}`);
        } finally {
            setRunningAction(null);
        }
    };

    const handleTriggerImportDevSettingsTemplate = async () => {
        if (runningAction) return;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '导入研发设置模板',
                message: '将覆盖当前 API/独立模型/文生图相关设置，不会导入提示词与默认模板内容。是否继续？',
                confirmText: '继续导入',
                danger: false
            })
            : true;
        if (!ok) return;
        settingsTemplateInputRef.current?.click();
    };

    const handleImportDevSettingsTemplateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = '';
        if (!file || runningAction) return;

        try {
            setRunningAction('import_dev_settings_template');
            const fileText = await file.text();
            const parsed = parseJsonWithRepair<any>(fileText);
            if (!parsed.value) {
                throw new Error(parsed.error || 'JSON 解析失败');
            }
            const result = await dbService.导入研发设置模板(parsed.value);
            const repairedTip = parsed.usedRepair ? '（文件有格式问题，已自动修复）' : '';
            await refreshStorageView();
            pushNotice('success', `导入完成：已应用 ${result.appliedKeys.length} 项设置${repairedTip}`);
        } catch (error: any) {
            pushNotice('error', `导入失败：${error?.message || '未知错误'}`);
        } finally {
            setRunningAction(null);
        }
    };

    const getPercent = (val: number) => Math.min((val / (info.usage || 1)) * 100, 100);
    const renderNotice = () => notice ? (
        <div className={`text-xs px-3 py-2 border rounded ${
            notice.type === 'success'
                ? 'border-green-500/40 bg-green-900/20 text-green-300'
                : 'border-wuxia-red/40 bg-red-900/20 text-red-300'
        }`}>
            {notice.text}
        </div>
    ) : null;

    return (
        <div className="space-y-6 h-full flex flex-col">
            {renderNotice()}

            <div className="bg-black/30 p-5 border border-gray-700/50 rounded-lg">
                <div className="flex justify-between items-end mb-3">
                    <h4 className="text-wuxia-gold font-serif font-bold">本地存储概览</h4>
                    <span className="text-xs text-gray-400 font-mono">
                        总占用: <span className="text-white font-bold">{formatBytes(info.usage)}</span> / {formatBytes(info.quota)}
                    </span>
                </div>

                <div className="w-full h-4 bg-gray-900 rounded-full overflow-hidden flex mb-4 border border-gray-800">
                    <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${getPercent(info.details.saves)}%` }} title="存档"></div>
                    <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${getPercent(info.details.prompts)}%` }} title="提示词"></div>
                    <div className="h-full bg-green-600 transition-all duration-500" style={{ width: `${getPercent(info.details.settings)}%` }} title="其他设置"></div>
                    <div className="h-full bg-yellow-600 transition-all duration-500" style={{ width: `${getPercent(info.details.api)}%` }} title="API配置"></div>
                    <div className="h-full bg-pink-600 transition-all duration-500" style={{ width: `${getPercent(info.details.imageAssets)}%` }} title="图片资源"></div>
                    <div className="h-full bg-gray-600 transition-all duration-500" style={{ width: `${getPercent(info.details.cache)}%` }} title="系统缓存"></div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-blue-400 uppercase tracking-wider mb-1">存档</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.saves)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-purple-400 uppercase tracking-wider mb-1">提示词</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.prompts)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-green-400 uppercase tracking-wider mb-1">设置</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.settings)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1">API</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.api)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-pink-400 uppercase tracking-wider mb-1">图片</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.imageAssets)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">缓存</span>
                        <span className="text-xs font-mono text-gray-300">{formatBytes(info.details.cache)}</span>
                    </div>
                </div>
            </div>

            <div className="bg-black/30 p-5 border border-gray-700/50 rounded-lg space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h4 className="text-wuxia-gold font-serif font-bold">设置存储清单</h4>
                        <div className="text-xs text-gray-400 mt-1">
                            当前共识别 {managedSettings.length} 项设置。所有条目均来自统一设置 schema，而不是页面硬编码。
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void refreshStorageView(); }}
                        className="px-3 py-1.5 border border-gray-600 bg-black/40 text-xs text-gray-200 hover:bg-gray-800/50 disabled:opacity-50"
                        disabled={Boolean(runningAction)}
                    >
                        刷新清单
                    </button>
                </div>

                {groupedSettings.length === 0 && (
                    <div className="text-sm text-gray-500 border border-dashed border-gray-700 rounded px-3 py-4">
                        当前没有已保存的设置项。
                    </div>
                )}

                <div className="space-y-4">
                    {groupedSettings.map(([category, items]) => {
                        const categoryMeta = category === 'unknown' ? null : 设置分类定义表[category];
                        return (
                            <div key={category} className="border border-gray-700/50 rounded-lg bg-black/20">
                                <div className="px-4 py-3 border-b border-gray-700/50">
                                    <div className="text-sm text-wuxia-gold font-semibold">
                                        {items[0]?.categoryLabel || '未登记项'}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-1">
                                        {categoryMeta?.description || '尚未登记到设置 schema 的遗留或调试项。'}
                                    </div>
                                </div>
                                <div className="p-3 space-y-3">
                                    {items.map((item) => (
                                        <div key={item.key} className="border border-gray-800 rounded-lg bg-black/30 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h5 className="text-sm text-gray-100 font-medium">{item.label}</h5>
                                                        {item.internal && (
                                                            <span className="px-2 py-0.5 text-[10px] rounded border border-amber-500/40 text-amber-300 bg-amber-950/20">
                                                                系统项
                                                            </span>
                                                        )}
                                                        {!item.known && (
                                                            <span className="px-2 py-0.5 text-[10px] rounded border border-gray-500/40 text-gray-300 bg-gray-900/30">
                                                                未登记
                                                            </span>
                                                        )}
                                                        {item.key === 设置键.API配置 && protectApiKey && (
                                                            <span className="px-2 py-0.5 text-[10px] rounded border border-emerald-500/40 text-emerald-300 bg-emerald-950/20">
                                                                受保留开关保护
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1">{item.description}</div>
                                                    <div className="text-[11px] text-gray-500 font-mono mt-2 break-all">{item.key}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleDeleteSetting(item); }}
                                                    className="shrink-0 px-3 py-1.5 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                                                    disabled={Boolean(runningAction)}
                                                >
                                                    删除
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-[11px] text-gray-400">
                                                <div className="border border-gray-800 rounded px-2 py-1.5">
                                                    摘要：<span className="text-gray-200">{item.summary}</span>
                                                </div>
                                                <div className="border border-gray-800 rounded px-2 py-1.5">
                                                    大小：<span className="text-gray-200">{formatBytes(item.size)}</span>
                                                </div>
                                                <div className="border border-gray-800 rounded px-2 py-1.5">
                                                    更新时间：<span className="text-gray-200">{formatTime(item.updatedAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-black/30 p-5 border border-gray-700/50 rounded-lg space-y-3">
                <h4 className="text-wuxia-gold font-serif font-bold">存档迁移</h4>
                <div className="text-xs text-gray-400">
                    支持导入由本项目导出的 ZIP 存档包或 JSON 存档文件，适用于新设备迁移。
                </div>
                <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-300 select-none">覆盖现有存档后再导入</label>
                    <ToggleSwitch
                        checked={importOverwrite}
                        onChange={setImportOverwrite}
                        ariaLabel="切换覆盖导入模式"
                        disabled={Boolean(runningAction)}
                    />
                </div>
                <div className="text-[11px] text-gray-500">
                    关闭时：合并并自动去重。开启时：先清空存档再导入（受存档保护开关限制）。
                </div>
                <GameButton
                    onClick={() => { void handleTriggerImportSaves(); }}
                    variant="secondary"
                    className="w-full py-2 text-sm disabled:opacity-50"
                    disabled={Boolean(runningAction)}
                >
                    {runningAction === 'import_saves' ? '导入中...' : '导入存档'}
                </GameButton>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.json,application/zip,application/json,text/plain"
                    className="hidden"
                    onChange={(e) => { void handleImportFileChange(e); }}
                />
            </div>

            <div className="bg-black/30 p-5 border border-gray-700/50 rounded-lg space-y-3">
                <h4 className="text-wuxia-gold font-serif font-bold">研发设置模板</h4>
                <div className="text-xs text-gray-400">
                    导出/导入用于研发迁移的轻量设置模板，仅包含功能开关、模型/API 与文生图相关配置，不包含提示词池和默认提示词文本。
                </div>
                {renderNotice()}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <GameButton
                        onClick={() => { void handleExportDevSettingsTemplate(); }}
                        variant="secondary"
                        className="w-full py-2 text-sm disabled:opacity-50"
                        disabled={Boolean(runningAction)}
                    >
                        {runningAction === 'export_dev_settings_template' ? '导出中...' : '导出研发设置模板'}
                    </GameButton>
                    <GameButton
                        onClick={() => { void handleTriggerImportDevSettingsTemplate(); }}
                        variant="secondary"
                        className="w-full py-2 text-sm disabled:opacity-50"
                        disabled={Boolean(runningAction)}
                    >
                        {runningAction === 'import_dev_settings_template' ? '导入中...' : '导入研发设置模板'}
                    </GameButton>
                </div>
                <div className="text-[11px] text-gray-500">
                    适合跨环境同步“开关 + API 地址/模型/密钥 + 文生图配置”，避免提示词版本被旧存档覆盖。
                </div>
                <input
                    ref={settingsTemplateInputRef}
                    type="file"
                    accept=".json,application/json,text/plain"
                    className="hidden"
                    onChange={(e) => { void handleImportDevSettingsTemplateChange(e); }}
                />
            </div>

            <div className="border-t border-gray-800/50 pt-4 mt-auto shrink-0">
                <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-300 select-none">启用存档保护（禁止删档）</label>
                        <ToggleSwitch
                            checked={protectSaves}
                            onChange={(next) => { void handleToggleSaveProtection(next); }}
                            ariaLabel="切换存档保护开关"
                            disabled={Boolean(runningAction)}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-300 select-none">清理时保留 API 配置</label>
                        <ToggleSwitch
                            checked={protectApiKey}
                            onChange={setProtectApiKey}
                            ariaLabel="切换清理时保留 API 配置"
                            disabled={Boolean(runningAction)}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-300 select-none">清理时保留自定义背景/天赋/开局方案</label>
                        <ToggleSwitch
                            checked={protectCustomPreset}
                            onChange={setProtectCustomPreset}
                            ariaLabel="切换清理时保留自定义背景和天赋"
                            disabled={Boolean(runningAction)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleClearAllSaves}
                        disabled={Boolean(runningAction) || protectSaves}
                    >
                        删除全部存档 {protectSaves ? '（已受保护）' : ''}
                    </button>
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleClearCache}
                        disabled={Boolean(runningAction)}
                    >
                        清除系统缓存
                    </button>
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleDeleteCustomPreset}
                        disabled={Boolean(runningAction)}
                    >
                        删除自定义背景/天赋/开局方案
                    </button>
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleDeleteImageGallery}
                        disabled={Boolean(runningAction)}
                    >
                        删除图库相关内容
                    </button>
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleDeleteImagePrompts}
                        disabled={Boolean(runningAction)}
                    >
                        删除图片相关提示词与预设
                    </button>
                    <button
                        type="button"
                        className="text-left px-3 py-2 border border-wuxia-red/40 bg-black/30 hover:bg-wuxia-red/10 text-xs text-gray-200 disabled:opacity-50"
                        onClick={handleClearAllSettings}
                        disabled={Boolean(runningAction)}
                    >
                        清空全部设置
                    </button>
                </div>

                <GameButton
                    onClick={handleClearAll}
                    variant="danger"
                    className="w-full py-2 text-sm disabled:opacity-50 mt-4"
                    disabled={Boolean(runningAction)}
                >
                    {runningAction === 'clear_all' ? '处理中...' : '清空全部数据 (重置游戏)'}
                </GameButton>
                {protectSaves && (
                    <div className="mt-2 text-[11px] text-emerald-300/90">
                        存档保护已启用，执行“清空全部数据”时将保留全部存档。
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleForceWipeAll}
                    className="mt-2 w-full px-3 py-2 border border-red-500/60 bg-red-950/40 hover:bg-red-900/40 text-xs text-red-200 disabled:opacity-50"
                    disabled={Boolean(runningAction)}
                >
                    {runningAction === 'force_wipe_all' ? '处理中...' : '彻底删除全部数据（忽略保护）'}
                </button>
                <div className="mt-1 text-[11px] text-red-300/90">
                    该操作无视存档保护与保留选项，直接清空全部本地数据并恢复默认状态。
                </div>
            </div>
        </div>
    );
};

export default StorageManager;
