import React, { useEffect, useRef, useState } from 'react';
import * as dbService from '../../../services/dbService';
import { 导出ZIP存档文件, 解析ZIP存档文件 } from '../../../services/saveArchiveService';
import { 存档结构 } from '../../../types';
import { parseJsonWithRepair } from '../../../utils/jsonRepair';
import GameButton from '../../ui/GameButton';

interface Props {
    onClose: () => void;
    onLoadGame: (save: 存档结构) => void | Promise<void>;
    onSaveGame?: () => void | Promise<void>;
    mode: 'save' | 'load';
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

const SaveLoadModal: React.FC<Props> = ({ onClose, onLoadGame, onSaveGame, mode, requestConfirm }) => {
    const [saves, setSaves] = useState<存档结构[]>([]);
    const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('manual');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [saveProtectionEnabled, setSaveProtectionEnabled] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        void loadSaves();
    }, []);

    const loadSaves = async () => {
        setLoading(true);
        try {
            const [list, protect] = await Promise.all([
                dbService.读取存档列表(),
                dbService.读取存档保护状态()
            ]);
            setSaves(list);
            setSaveProtectionEnabled(protect);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const 读取地点文本 = (save: 存档结构): string => {
        const env = save.环境信息 || ({} as any);
        const list = [env.具体地点, env.小地点, env.中地点, env.大地点]
            .map((item: any) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
        return list[0] || '未知地点';
    };

    const 读取时间文本 = (save: 存档结构): string => {
        const env = save.环境信息 || ({} as any);
        const timeText = typeof (env as any)?.时间 === 'string' ? (env as any).时间.trim() : '';
        if (timeText) return timeText;
        const 年 = Number((env as any)?.年);
        const 月 = Number((env as any)?.月);
        const 日 = Number((env as any)?.日);
        const 时 = Number((env as any)?.时);
        const 分 = Number((env as any)?.分);
        const pad2 = (n: number) => Math.trunc(n).toString().padStart(2, '0');
        if ([年, 月, 日, 时, 分].every(Number.isFinite)) {
            return `${Math.trunc(年)}:${pad2(月)}:${pad2(日)}:${pad2(时)}:${pad2(分)}`;
        }
        const saveDate = new Date(save.时间戳);
        if (Number.isNaN(saveDate.getTime())) return '未知时间';
        return `${saveDate.getFullYear()}:${pad2(saveDate.getMonth() + 1)}:${pad2(saveDate.getDate())}:${pad2(saveDate.getHours())}:${pad2(saveDate.getMinutes())}`;
    };

    const 构建存档标题 = (save: 存档结构): string => {
        const roleName = typeof save.角色数据?.姓名 === 'string' ? save.角色数据.姓名.trim() : '';
        return roleName || '未知角色';
    };

    const 构建存档摘要 = (save: 存档结构): string => {
        const historyCount = typeof save.元数据?.历史记录条数 === 'number'
            ? save.元数据.历史记录条数
            : (Array.isArray(save.历史记录) ? save.历史记录.length : 0);
        const tags: string[] = [
            save.类型 === 'auto' ? '自动快照' : '手动快照',
            `历史 ${historyCount} 条`
        ];
        if (save.元数据?.历史记录是否裁剪) {
            tags.push('已裁剪');
        }
        return tags.join(' · ');
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (saveProtectionEnabled) {
            alert('存档保护已开启，请先在“设置-数据存储”中关闭后再删除存档。');
            return;
        }
        const ok = requestConfirm
            ? await requestConfirm({ title: '删除存档', message: '确定删除此存档吗？', confirmText: '删除', danger: true })
            : true;
        if (!ok) return;
        await dbService.删除存档(id);
        await loadSaves();
    };

    const handleLoadClick = async (save: 存档结构) => {
        if (mode !== 'load') return;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '读取存档',
                message: `读取存档：${构建存档标题(save)}（${读取地点文本(save)}）？`,
                confirmText: '读取'
            })
            : true;
        if (!ok) return;
        try {
            await Promise.resolve(onLoadGame(save));
        } catch (error: any) {
            console.error(error);
            alert(`读取失败：${error?.message || '未知错误'}`);
        }
    };

    const handleSave = async () => {
        if (!onSaveGame || syncing) return;
        setSyncing(true);
        try {
            await Promise.resolve(onSaveGame());
            setActiveTab('manual');
            await loadSaves();
        } catch (error: any) {
            console.error(error);
            alert(`保存失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleExport = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            const blob = await 导出ZIP存档文件();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:]/g, '-');
            link.href = url;
            link.download = `wuxia-saves-${stamp}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error(error);
            alert(`导出失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleTriggerImport = async () => {
        const ok = requestConfirm
            ? await requestConfirm({
                title: '导入存档',
                message: '支持导入 ZIP 存档包和旧版 JSON 存档，导入将以“合并+去重”方式写入本地存档，是否继续？',
                confirmText: '继续导入'
            })
            : true;
        if (!ok) return;
        fileInputRef.current?.click();
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;

        setSyncing(true);
        try {
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
                repairedTip = parsed.usedRepair ? '\n检测到文件存在格式问题，已本地自动修复后导入。' : '';
            }

            const result = await dbService.导入存档数据(payload, { 覆盖现有: false });
            await loadSaves();
            setActiveTab('manual');

            alert(`导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条。${repairedTip}`);
        } catch (error: any) {
            console.error(error);
            alert(`导入失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const filteredSaves = saves.filter((save) => {
        if (activeTab === 'auto') return save.类型 === 'auto';
        return save.类型 !== 'auto';
    });
    const busy = loading || syncing;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-4xl h-[600px] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] rounded-2xl relative overflow-hidden">

                <div className="h-16 shrink-0 border-b border-gray-800/50 bg-black/40 flex items-center justify-between px-6 relative z-50">
                    <h3 className="text-wuxia-gold font-serif font-bold text-2xl tracking-[0.3em] drop-shadow-md" style={{ fontFamily: 'var(--ui-页面标题-font-family, inherit)', fontSize: 'var(--ui-页面标题-font-size, 28px)', lineHeight: 'var(--ui-页面标题-line-height, 1.2)' }}>
                        {mode === 'save' ? '铭刻时光' : '时光回溯'}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-2xl" style={{ fontFamily: 'var(--ui-按钮-font-family, inherit)' }}>×</button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {mode === 'save' && (
                        <div className="w-[30%] bg-black/20 border-r border-gray-800/50 p-6 flex flex-col gap-4">
                            <h4 className="text-wuxia-gold font-bold text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--ui-分组标题-font-family, inherit)', fontSize: 'var(--ui-分组标题-font-size, 18px)' }}>手动存档</h4>
                            <p className="text-xs text-gray-400 leading-relaxed" style={{ fontFamily: 'var(--ui-辅助文本-font-family, inherit)', fontSize: 'var(--ui-辅助文本-font-size, 12px)', lineHeight: 'var(--ui-辅助文本-line-height, 1.5)' }}>
                                手动与自动存档都会完整保存全部内容。导出时会按 ZIP 拆分为图片、聊天记录、游戏数据三个目录。
                            </p>
                            <GameButton onClick={() => { void handleSave(); }} disabled={!onSaveGame || busy} variant="primary" className="w-full">
                                立即保存
                            </GameButton>
                        </div>
                    )}

                    <div className="flex-1 flex flex-col bg-ink-wash/5">
                        <div className="px-6 pt-4 pb-3 border-b border-gray-800/50 flex justify-end gap-2">
                            <GameButton
                                onClick={() => { void handleExport(); }}
                                disabled={busy}
                                variant="secondary"
                                className="px-4 py-2 text-xs"
                            >
                                导出存档
                            </GameButton>
                            <GameButton
                                onClick={() => { void handleTriggerImport(); }}
                                disabled={busy}
                                variant="secondary"
                                className="px-4 py-2 text-xs"
                            >
                                导入存档
                            </GameButton>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".zip,.json,application/zip,application/json,text/plain"
                                className="hidden"
                                onChange={(e) => { void handleImportFileChange(e); }}
                            />
                        </div>
                        {saveProtectionEnabled && (
                            <div className="px-6 py-2 text-[11px] text-emerald-300 bg-emerald-900/10 border-b border-emerald-800/30">
                                存档保护已开启，当前禁止删除存档。
                            </div>
                        )}

                        <div className="flex border-b border-gray-800/50">
                            <button
                                onClick={() => setActiveTab('manual')}
                                className={`flex-1 py-3 text-sm font-bold tracking-widest transition-colors ${activeTab === 'manual' ? 'bg-wuxia-gold/10 text-wuxia-gold border-b-2 border-wuxia-gold' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                手动存档
                            </button>
                            <button
                                onClick={() => setActiveTab('auto')}
                                className={`flex-1 py-3 text-sm font-bold tracking-widest transition-colors ${activeTab === 'auto' ? 'bg-wuxia-gold/10 text-wuxia-gold border-b-2 border-wuxia-gold' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                自动存档
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                            {filteredSaves.length === 0 && !loading && (
                                <div className="text-center text-gray-600 py-10">暂无记录</div>
                            )}
                            {loading && (
                                <div className="text-center text-gray-500 py-10">读取中...</div>
                            )}

                            {filteredSaves.map((save) => (
                                <div
                                    key={save.id}
                                    onClick={() => { void handleLoadClick(save); }}
                                    className={`relative bg-black/40 border border-gray-700 p-4 rounded-lg group transition-all flex flex-col gap-2 ${mode === 'load' ? 'cursor-pointer hover:border-wuxia-gold/50 hover:bg-black/60' : ''}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] px-1.5 rounded border ${save.类型 === 'auto' ? 'border-blue-500 text-blue-400' : 'border-wuxia-gold text-wuxia-gold'}`}>
                                                {save.类型 === 'auto' ? 'AUTO' : 'MANUAL'}
                                            </span>
                                            <span className="font-bold text-gray-200 text-sm">{构建存档标题(save)}</span>
                                            <span className="text-xs text-gray-500">
                                                {save.角色数据?.境界 || '未知境界'}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-600 font-mono" style={{ fontFamily: 'var(--ui-等宽信息-font-family, inherit)', fontSize: 'var(--ui-等宽信息-font-size, 12px)' }}>
                                            {读取时间文本(save)}
                                        </div>
                                    </div>

                                    <div className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">
                                        {读取地点文本(save)} · {读取时间文本(save)}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                        {构建存档摘要(save)}
                                    </div>

                                    <button
                                        onClick={(e) => { void handleDelete(save.id, e); }}
                                        className={`absolute top-4 right-4 transition-colors ${
                                            saveProtectionEnabled
                                                ? 'text-gray-700 opacity-40 cursor-not-allowed'
                                                : 'text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100'
                                        }`}
                                        title={saveProtectionEnabled ? '存档保护已开启' : '删除'}
                                        disabled={saveProtectionEnabled}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveLoadModal;
