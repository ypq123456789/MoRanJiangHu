import React, { useEffect, useRef, useState } from 'react';
import { Directory, Filesystem } from '@capacitor/filesystem';
import * as dbService from '../../../services/dbService';
import {
    读取云端游玩会话,
    读取云端游玩存储模式,
    设置云端游玩存储模式,
    上传本地存档到云端
} from '../../../services/cloudPlayService';
import { 增量同步到对象存储, 读取对象存储同步配置 } from '../../../services/objectStorageSync';
import { 创建存档ZIP流式写入, 导出ZIP存档文件, 解析ZIP存档文件 } from '../../../services/saveArchiveService';
import { 存档结构 } from '../../../types';
import { parseJsonWithRepair } from '../../../utils/jsonRepair';
import { isNativeCapacitorEnvironment } from '../../../utils/nativeRuntime';
import { 创建并记录ObjectURL, 延迟释放并记录ObjectURL } from '../../../utils/objectUrlLifecycle';
import { buildSaveDebugSummary, recordSaveLoadError, recordSaveLoadTrace } from '../../../utils/saveLoadTrace';
import { 读取存档游玩回合数 } from '../../../utils/saveTurn';
import GameButton from '../../ui/GameButton';

interface Props {
    onClose: () => void;
    onLoadGame: (save: 存档结构) => void | Promise<void>;
    onSaveGame?: () => void | Promise<void>;
    mode: 'save' | 'load';
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

type 存档列表项 = dbService.存档摘要结构;
type 本地时间树节点 = 存档列表项 & { children: 本地时间树节点[] };
type 本地时间树系列 = { key: string; hash: string; title: string; latest: 存档列表项; roots: 本地时间树节点[]; count: number; manualCount: number; autoCount: number };

const 需要刷新回合数摘要 = (save: 存档列表项): boolean => (
    !Boolean((save.元数据 as any)?.摘要缺失)
    && typeof save.id === 'number'
    && typeof save.元数据?.游戏回合数 !== 'number'
    && Number(save.元数据?.历史记录条数 || 0) > 0
);

const 读取本地系列Key = (save: 存档列表项): string => {
    const metadataSeriesId = typeof save.元数据?.存档系列ID === 'string' ? save.元数据.存档系列ID.trim() : '';
    if (metadataSeriesId) return metadataSeriesId;
    const rootHash = typeof save.元数据?.存档根节点哈希 === 'string' ? save.元数据.存档根节点哈希.trim() : '';
    if (rootHash) return rootHash;
    const roleName = typeof save.角色数据?.姓名 === 'string' && save.角色数据.姓名.trim() ? save.角色数据.姓名.trim() : '未知角色';
    return `legacy-${roleName}`;
};

const 计算文本短哈希 = (text: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const SaveLoadModal: React.FC<Props> = ({ onClose, onLoadGame, onSaveGame, mode, requestConfirm }) => {
    const [saves, setSaves] = useState<存档列表项[]>([]);
    const pageSize = isNativeCapacitorEnvironment() ? 24 : 80;
    const [visibleSaveCount, setVisibleSaveCount] = useState(pageSize);
    const [hasMoreSaves, setHasMoreSaves] = useState(false);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [saveProtectionEnabled, setSaveProtectionEnabled] = useState(false);
    const [transferMessage, setTransferMessage] = useState('');
    const [cloudPlayMode, setCloudPlayMode] = useState<'tg' | 'object' | null>(() => 读取云端游玩存储模式());
    const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => new Set());
    const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
    const [lineageMigrationStatus, setLineageMigrationStatus] = useState(() => dbService.读取旧存档谱系迁移状态());
    const [hydratingVisibleSummaries, setHydratingVisibleSummaries] = useState(false);
    const [saveMenuOpen, setSaveMenuOpen] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const hydratedSummaryIdsRef = useRef<Set<number>>(new Set());
    const hydratedSummaryCountRef = useRef(0);
    const hydrateRunningRef = useRef(false);
    // [读档看门狗] 大存档读取可能超过 25s；期间给出"仍在读取"提示，
    // 避免玩家误以为卡死而杀掉应用（读档是重同步转换，需要时间）
    const loadWatchdogRef = useRef<number | null>(null);

    useEffect(() => {
        void loadSaves(true);
        setCloudPlayMode(读取云端游玩存储模式());
    }, []);

    useEffect(() => dbService.订阅旧存档谱系迁移状态((status) => {
        setLineageMigrationStatus(status);
        if (status.stage === 'completed' || status.stage === 'failed') {
            void loadSaves(true);
        }
    }), []);

    useEffect(() => {
        void dbService.启动旧存档谱系迁移();
    }, []);

    useEffect(() => {
        if (hydrateRunningRef.current || syncing) return;
        const native = isNativeCapacitorEnvironment();
        const hydrateLimit = native ? pageSize : 40;
        const hydrateCandidates = saves.slice(0, hydrateLimit);
        const nextTarget = hydrateCandidates.find((save) => (
            (是旧版缺摘要存档(save) || 需要刷新回合数摘要(save))
            && typeof save.id === 'number'
            && !hydratedSummaryIdsRef.current.has(save.id)
        ));
        if (!nextTarget || typeof nextTarget.id !== 'number') {
            if (native && transferMessage.startsWith('正在恢复存档列表详情')) {
                setTransferMessage('存档列表详情已恢复。');
            }
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            const id = nextTarget.id as number;
            hydrateRunningRef.current = true;
            hydratedSummaryIdsRef.current.add(id);
            hydratedSummaryCountRef.current += 1;
            recordSaveLoadTrace('modal.summaryHydrate.start', {
                id,
                view: 'combined',
                native,
                count: hydratedSummaryCountRef.current
            });
            if (native) {
                const missingTotal = hydrateCandidates.filter((save) => 是旧版缺摘要存档(save) || 需要刷新回合数摘要(save)).length;
                setTransferMessage(`正在恢复存档列表详情：${hydratedSummaryCountRef.current} / ${hydratedSummaryCountRef.current + Math.max(0, missingTotal - 1)}`);
            }
            void dbService.补全存档摘要(id)
                .then((summary) => {
                    recordSaveLoadTrace('modal.summaryHydrate.done', {
                        id,
                        hasSummary: Boolean(summary),
                        historyCount: summary?.元数据?.历史记录条数,
                        type: summary?.类型
                    });
                    if (cancelled || !summary) return;
                    setSaves((current) => current.map((item) => item.id === id ? summary : item));
                })
                .catch((error) => {
                    recordSaveLoadError('modal.summaryHydrate.error', error, { id, view: 'combined' });
                    console.warn('补全旧存档摘要失败:', error);
                })
                .finally(() => {
                    recordSaveLoadTrace('modal.summaryHydrate.finally', { id, view: 'combined' });
                    hydrateRunningRef.current = false;
                });
        }, native ? 260 : 80);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [saves, pageSize, syncing, transferMessage]);

    useEffect(() => {
        setVisibleSaveCount(pageSize);
    }, [pageSize, saves.length]);

    const loadSaves = async (reset = true) => {
        setLoading(true);
        const startAt = Date.now();
        try {
            const usePagedNativeList = isNativeCapacitorEnvironment();
            const offset = reset ? 0 : saves.length;
            recordSaveLoadTrace('modal.list.start', {
                reset,
                view: 'combined',
                offset,
                pageSize,
                usePagedNativeList
            });
            const [list, protect] = await Promise.all([
                usePagedNativeList
                    ? dbService.读取存档摘要列表({ limit: pageSize, offset })
                    : dbService.读取存档摘要列表(),
                dbService.读取存档保护状态()
            ]);
            recordSaveLoadTrace('modal.list.done', {
                reset,
                view: 'combined',
                count: list.length,
                missingSummaryCount: list.filter((item) => 是旧版缺摘要存档(item)).length,
                firstId: list[0]?.id,
                lastId: list[list.length - 1]?.id,
                elapsedMs: Date.now() - startAt
            });
            setSaves((current) => reset ? list : [...current, ...list]);
            setHasMoreSaves(usePagedNativeList && list.length >= pageSize);
            setSaveProtectionEnabled(protect);
        } catch (error) {
            recordSaveLoadError('modal.list.error', error, {
                reset,
                view: 'combined',
                elapsedMs: Date.now() - startAt
            });
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const 读取地点文本 = (save: 存档列表项): string => {
        const env = save.环境信息 || ({} as any);
        const list = [env.具体地点, env.小地点, env.中地点, env.大地点]
            .map((item: any) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
        return list[0] || '未知地点';
    };

    const 读取时间文本 = (save: 存档列表项): string => {
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

    const 读取现实保存时间文本 = (save: 存档列表项): string => {
        if (是旧版缺摘要存档(save)) return '正在恢复详情';
        const timestamp = Number(save.元数据?.现实保存时间戳 || save.时间戳 || 0);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '保存时间未知';
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '保存时间未知';
        const pad2 = (n: number) => Math.trunc(n).toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    };

    const 构建存档标题 = (save: 存档列表项): string => {
        if (是旧版缺摘要存档(save)) return '正在恢复详情';
        const roleName = typeof save.角色数据?.姓名 === 'string' ? save.角色数据.姓名.trim() : '';
        return roleName || '未知角色';
    };

    const 构建安全文件名片段 = (value: string, fallback: string): string => {
        const normalized = value
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized || fallback;
    };

    const 构建存档摘要 = (save: 存档列表项): string => {
        if (是旧版缺摘要存档(save)) return '正在读取存档摘要，请稍候';
        const turnCount = 读取存档游玩回合数(save);
        const tags: string[] = [
            `保存于 ${读取现实保存时间文本(save)}`,
            需要刷新回合数摘要(save) ? '正在校准回合数' : `第 ${turnCount} 回合`
        ];
        if (save.元数据?.历史记录是否裁剪) {
            tags.push('已裁剪');
        }
        return tags.join(' · ');
    };

    const 是新谱系存档 = (save: 存档列表项): boolean => Boolean(save.元数据?.存档系列ID && save.元数据?.存档谱系版本);

    const 读取存档类型标签 = (save: 存档列表项): string => {
        if (是旧版缺摘要存档(save)) return '恢复中';
        return save.类型 === 'auto' ? '自动快照' : '手动快照';
    };

    const 读取存档短哈希 = (save: 存档列表项): string => dbService.计算存档摘要短哈希(save);
    const 读取存档回合标签 = (save: 存档列表项): string => (
        需要刷新回合数摘要(save) ? '回合数校准中' : `第 ${读取存档游玩回合数(save)} 回合`
    );

    const 构建本地时间树 = (items: 存档列表项[]): 本地时间树系列[] => {
        const groups = new Map<string, 存档列表项[]>();
        items.forEach((item) => {
            const key = 读取本地系列Key(item);
            groups.set(key, [...(groups.get(key) || []), item]);
        });
        return [...groups.entries()].map(([key, list]) => {
            const nodes = list.map((item) => ({ ...item, children: [] } as 本地时间树节点));
            const nodeByHash = new Map<string, 本地时间树节点>();
            nodes.forEach((node) => {
                const fullHash = typeof node.元数据?.存档哈希 === 'string' ? node.元数据.存档哈希.trim() : '';
                const shortHash = 读取存档短哈希(node);
                if (fullHash) nodeByHash.set(fullHash, node);
                if (fullHash) nodeByHash.set(fullHash.slice(0, 16), node);
                if (fullHash) nodeByHash.set(fullHash.slice(-8), node);
                if (shortHash) nodeByHash.set(shortHash, node);
            });
            const roots: 本地时间树节点[] = [];
            nodes.forEach((node) => {
                const parentHash = typeof node.元数据?.存档父节点哈希 === 'string' ? node.元数据.存档父节点哈希.trim() : '';
                const parent = parentHash ? nodeByHash.get(parentHash) || nodeByHash.get(parentHash.slice(0, 16)) || nodeByHash.get(parentHash.slice(-8)) : undefined;
                if (parent) parent.children.push(node);
                else roots.push(node);
            });
            const sortNodes = (tree: 本地时间树节点[]) => {
                tree.sort((a, b) => Number(a.元数据?.现实保存时间戳 || a.时间戳 || 0) - Number(b.元数据?.现实保存时间戳 || b.时间戳 || 0));
                tree.forEach((node) => sortNodes(node.children));
            };
            sortNodes(roots);
            const latest = [...list].sort((a, b) => Number(b.元数据?.现实保存时间戳 || b.时间戳 || 0) - Number(a.元数据?.现实保存时间戳 || a.时间戳 || 0))[0];
            const hashSource = JSON.stringify({
                key,
                root: latest?.元数据?.存档根节点哈希 || '',
                nodes: nodes.map((node) => 读取存档短哈希(node)).sort()
            });
            return {
                key,
                hash: 计算文本短哈希(hashSource),
                title: 构建存档标题(latest),
                latest,
                roots,
                count: list.length,
                manualCount: list.filter((item) => item.类型 !== 'auto').length,
                autoCount: list.filter((item) => item.类型 === 'auto').length
            };
        }).sort((a, b) => Number(b.latest?.元数据?.现实保存时间戳 || b.latest?.时间戳 || 0) - Number(a.latest?.元数据?.现实保存时间戳 || a.latest?.时间戳 || 0));
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (saveProtectionEnabled) {
            alert('存档保护已开启，请先在”设置-数据存储”中关闭后再删除存档。');
            return;
        }
        // [修复] 加强删除中间节点的警告——删除谱系树中间节点会导致后续节点不可用
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除存档',
                message: '确定删除此存档吗？\n\n⚠ 警告：如果此存档是一棵谱系树的中间节点（非末尾），删除后同一棵树上更晚的节点将无法正常读取，甚至可能导致所有后续存档数据丢失。\n\n如果只想清理空间，建议删除整棵存档树（在存档详情中选择”删除存档树并重建”）。',
                confirmText: '删除',
                danger: true
            })
            : true;
        if (!ok) return;
        try {
            await dbService.删除存档(id);
            await loadSaves();
        } catch (error: any) {
            console.error('删除存档失败:', error);
            alert(`删除失败：${error?.message || '未知错误'}`);
        }
    };

    const handleDeleteSeries = async (series: 本地时间树系列, e: React.MouseEvent) => {
        e.stopPropagation();
        if (saveProtectionEnabled) {
            alert('存档保护已开启，请先在“设置-数据存储”中关闭后再删除存档。');
            return;
        }
        const ids = 展平本地时间树(series.roots)
            .map((save) => save.id)
            .filter((id): id is number => typeof id === 'number');
        if (ids.length <= 0) return;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除整棵时间树',
                message: `确定删除“${series.title}”这一整棵时间树吗？将删除 ${ids.length} 个本地存档节点，包含手动 ${series.manualCount} 个、自动 ${series.autoCount} 个。此操作不可恢复。`,
                confirmText: `删除 ${ids.length} 个节点`,
                danger: true
            })
            : true;
        if (!ok) return;
        setSyncing(true);
        setTransferMessage(`正在删除时间树：${ids.length} 个节点...`);
        try {
            const deleted = await dbService.批量删除存档(ids);
            if (selectedSeriesKey === series.key) setSelectedSeriesKey(null);
            setTransferMessage(`已删除时间树：${deleted} 个节点。`);
            await loadSaves();
        } catch (error: any) {
            console.error(error);
            setTransferMessage(`删除失败：${error?.message || '未知错误'}`);
            alert(`删除失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleDeleteTreeAndRebuild = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setSaveMenuOpen(null);
        if (saveProtectionEnabled) {
            alert('存档保护已开启，请先在"设置-数据存储"中关闭后再操作。');
            return;
        }
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除存档树并重建',
                message: '将删除整个存档树（包括所有分支和历史版本），然后重新保存当前存档为全量存档。确定继续吗？',
                confirmText: '删除树并重建',
                danger: true
            })
            : true;
        if (!ok) return;
        setSyncing(true);
        setTransferMessage('正在删除存档树并重建...');
        try {
            await dbService.删除存档树并重新保存全量存档(id);
            setTransferMessage('存档树已删除，当前存档已重新保存为全量存档。');
            await loadSaves();
        } catch (error: any) {
            console.error(error);
            setTransferMessage(`操作失败：${error?.message || '未知错误'}`);
            alert(`操作失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const 删除按钮类名 = `absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
        saveProtectionEnabled
            ? 'border-gray-700 bg-black/20 text-gray-700 opacity-50 cursor-not-allowed'
            : 'border-red-400/35 bg-red-950/40 text-red-200 shadow-[0_0_14px_rgba(248,113,113,0.18)] hover:border-red-300 hover:bg-red-800/55 hover:text-white sm:opacity-75 sm:group-hover:opacity-100'
    }`;

    const 读取完整存档 = async (save: 存档列表项): Promise<存档结构> => {
        const id = typeof save.id === 'number' ? save.id : 0;
        if (!id) throw new Error('存档 ID 缺失，无法读取完整存档。');
        const startAt = Date.now();
        recordSaveLoadTrace('modal.fullRead.start', {
            id,
            type: save.类型,
            listHistoryCount: save.元数据?.历史记录条数,
            view: 'combined'
        });
        const fullSave = await dbService.读取存档(id);
        if (!fullSave) throw new Error('存档不存在或已被删除。');
        recordSaveLoadTrace('modal.fullRead.done', {
            id,
            elapsedMs: Date.now() - startAt,
            save: buildSaveDebugSummary(fullSave)
        });
        return fullSave;
    };

    const handleLoadClick = async (save: 存档列表项) => {
        if (mode !== 'load') return;
        const id = typeof save.id === 'number' ? save.id : 0;
        const startAt = Date.now();
        recordSaveLoadTrace('modal.loadClick.start', {
            id,
            type: save.类型,
            view: 'combined',
            listHistoryCount: save.元数据?.历史记录条数,
            missingSummary: 是旧版缺摘要存档(save)
        });
        const ok = requestConfirm
            ? await requestConfirm({
                title: '读取存档',
                message: `读取存档：${构建存档标题(save)}（${读取地点文本(save)}）？`,
                confirmText: '读取'
            })
            : true;
        recordSaveLoadTrace('modal.loadClick.confirm', { id, ok });
        if (!ok) return;
        try {
            setSyncing(true);
            setTransferMessage(`正在读取：${构建存档标题(save)}`);
            // [修复] 大存档在低端机上同步读档转换可能耗时较长；超过 25s 给玩家明确提示，
            // 并把看门狗事件写入诊断日志（trace 开启时），便于后续定位卡读点
            loadWatchdogRef.current = window.setTimeout(() => {
                recordSaveLoadTrace('modal.loadClick.watchdog', {
                    id,
                    elapsedMs: Date.now() - startAt,
                    message: '读档耗时超过 25s，仍在执行存档状态重建，请耐心等待'
                });
                setTransferMessage(`存档较大，仍在恢复存档状态（${构建存档标题(save)}）… 请耐心等待`);
            }, 25000);
            const fullSave = await 读取完整存档(save);
            recordSaveLoadTrace('modal.loadClick.beforeOnLoad', {
                id,
                elapsedMs: Date.now() - startAt,
                save: buildSaveDebugSummary(fullSave)
            });
            await Promise.resolve(onLoadGame(fullSave));
            recordSaveLoadTrace('modal.loadClick.afterOnLoad', {
                id,
                elapsedMs: Date.now() - startAt
            });
        } catch (error: any) {
            recordSaveLoadError('modal.loadClick.error', error, {
                id,
                elapsedMs: Date.now() - startAt
            });
            console.error(error);
            const 存档标识 = 构建存档标题(save);
            alert(`读取失败：${error?.message || '未知错误'}\n\n存档：${存档标识}（#${id}）\n\n若反复失败，可先导出此档备份，或到“设置-数据存储”关闭存档保护后删除异常节点。`);
        } finally {
            if (loadWatchdogRef.current !== null) {
                window.clearTimeout(loadWatchdogRef.current);
                loadWatchdogRef.current = null;
            }
            recordSaveLoadTrace('modal.loadClick.finally', {
                id,
                elapsedMs: Date.now() - startAt
            });
            setSyncing(false);
            setTransferMessage('');
        }
    };

    const handleSave = async () => {
        if (!onSaveGame || syncing) return;
        setSyncing(true);
        setTransferMessage('');
        try {
            await Promise.resolve(onSaveGame());
            await loadSaves();
        } catch (error: any) {
            console.error(error);
            alert(`保存失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleHydrateVisibleSummaries = async () => {
        if (hydratingVisibleSummaries || syncing) return;
        const targets = visibleSaves
            .filter((save) => 是旧版缺摘要存档(save))
            .map((save) => save.id)
            .filter((id): id is number => typeof id === 'number');
        if (targets.length <= 0) return;

        setHydratingVisibleSummaries(true);
        setTransferMessage(`正在恢复当前页存档详情：0 / ${targets.length}`);
        let completed = 0;
        try {
            for (const id of targets) {
                recordSaveLoadTrace('modal.manualSummaryHydrate.itemStart', { id, completed, total: targets.length });
                const summary = await dbService.补全存档摘要(id);
                completed += 1;
                recordSaveLoadTrace('modal.manualSummaryHydrate.itemDone', {
                    id,
                    completed,
                    total: targets.length,
                    hasSummary: Boolean(summary),
                    historyCount: summary?.元数据?.历史记录条数
                });
                if (summary) {
                    setSaves((current) => current.map((item) => item.id === id ? summary : item));
                }
                setTransferMessage(`正在恢复当前页存档详情：${completed} / ${targets.length}`);
                await new Promise((resolve) => window.setTimeout(resolve, isNativeCapacitorEnvironment() ? 700 : 120));
            }
            setTransferMessage('当前页存档详情已恢复。');
        } catch (error: any) {
            console.error(error);
            setTransferMessage(`恢复详情中断：${error?.message || '未知错误'}`);
        } finally {
            setHydratingVisibleSummaries(false);
        }
    };

    const blobToBase64 = async (blob: Blob): Promise<string> => (
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const commaIndex = result.indexOf(',');
                resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = () => reject(reader.error || new Error('读取导出文件失败'));
            reader.readAsDataURL(blob);
        })
    );

    const bytesToBase64 = (bytes: Uint8Array): string => {
        let binary = '';
        const blockSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += blockSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
        }
        return btoa(binary);
    };

    const saveArchiveToDevice = async (blob: Blob, fileName: string): Promise<boolean> => {
        if (!isNativeCapacitorEnvironment()) return false;

        await Filesystem.writeFile({
            path: fileName,
            data: await blobToBase64(blob),
            directory: Directory.Documents,
            recursive: false
        });
        return true;
    };

    const downloadArchiveBlob = async (blob: Blob, fileName: string, options?: { batch?: boolean }): Promise<void> => {
        if (await saveArchiveToDevice(blob, fileName)) {
            setTransferMessage(`已导出到设备文档目录：${fileName}`);
            if (!options?.batch) alert(`导出完成：${fileName}\n已保存到设备文档目录。`);
            return;
        }

        const url = 创建并记录ObjectURL(blob, {
            source: 'SaveLoadModal.downloadArchiveBlob',
            kind: 'save-archive-export',
            detail: { fileName }
        });
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        延迟释放并记录ObjectURL(url, {
            source: 'SaveLoadModal.downloadArchiveBlob',
            kind: 'save-archive-export',
            detail: { fileName, reason: 'download-clicked' }
        }, options?.batch ? 0 : 30_000);
        if (options?.batch) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
        setTransferMessage(`已开始下载：${fileName}`);
    };

    const handleExportAll = async () => {
        if (syncing) return;
        setSyncing(true);
        setTransferMessage('正在整理全部存档包...');
        let completed = 0;
        let total = 0;
        let nativeExportPath = '';
        try {
            const nativeExport = isNativeCapacitorEnvironment();
            const allSummaries = (await dbService.读取存档摘要列表())
                .filter((item) => typeof item.id === 'number');
            if (allSummaries.length === 0) {
                throw new Error('当前没有可导出的存档');
            }
            total = allSummaries.length;
            const stamp = new Date().toISOString().replace(/[:]/g, '-');
            const fileName = `wuxia-saves-${stamp}.zip`;

            if (nativeExport) {
                nativeExportPath = fileName;
                let firstChunk = true;
                await Filesystem.deleteFile({ path: fileName, directory: Directory.Documents }).catch(() => undefined);
                await 创建存档ZIP流式写入({
                    total: allSummaries.length,
                    readSave: (index) => 读取完整存档(allSummaries[index]),
                    writeChunk: async (chunk) => {
                        const chunkSize = 256 * 1024;
                        for (let offset = 0; offset < chunk.length; offset += chunkSize) {
                            const data = bytesToBase64(chunk.subarray(offset, offset + chunkSize));
                            if (firstChunk) {
                                await Filesystem.writeFile({ path: fileName, data, directory: Directory.Documents, recursive: false });
                                firstChunk = false;
                            } else {
                                await Filesystem.appendFile({ path: fileName, data, directory: Directory.Documents });
                            }
                        }
                    },
                    onProgress: ({ current, total, save }) => {
                        completed = current;
                        setTransferMessage(`正在写入总存档包 ${current} / ${total}：${save.角色数据?.姓名 || '未知角色'}`);
                    }
                });
            } else {
                const root = await navigator.storage?.getDirectory?.();
                if (!root) throw new Error('当前浏览器不支持低内存单文件导出，请使用最新版 Chrome 或 APK');
                const tempName = `.moran-export-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`;
                const handle = await root.getFileHandle(tempName, { create: true });
                const writable = await handle.createWritable();
                let cleanupDeferred = false;
                try {
                    await 创建存档ZIP流式写入({
                        total: allSummaries.length,
                        readSave: (index) => 读取完整存档(allSummaries[index]),
                        writeChunk: (chunk) => writable.write(chunk),
                        onProgress: ({ current, total, save }) => {
                            completed = current;
                            setTransferMessage(`正在生成总存档包 ${current} / ${total}：${save.角色数据?.姓名 || '未知角色'}`);
                        }
                    });
                    await writable.close();
                    const archiveFile = await handle.getFile();
                    await downloadArchiveBlob(archiveFile, fileName);
                    cleanupDeferred = true;
                    window.setTimeout(() => { void root.removeEntry(tempName).catch(() => undefined); }, 60_000);
                } catch (error) {
                    await writable.abort().catch(() => undefined);
                    throw error;
                } finally {
                    if (!cleanupDeferred) await root.removeEntry(tempName).catch(() => undefined);
                }
            }

            const destination = nativeExport ? '设备文档目录' : '浏览器下载目录';
            setTransferMessage(`全部导出完成：共 ${completed} 条，已合并为一个 ZIP 保存到${destination}。`);
            alert(`导出完成：共 ${completed} 条存档。\n已合并为一个 ZIP 保存到${destination}。`);
        } catch (error: any) {
            console.error(error);
            if (nativeExportPath) {
                await Filesystem.deleteFile({ path: nativeExportPath, directory: Directory.Documents }).catch(() => undefined);
            }
            const progressText = total > 0 ? `已处理 ${completed} / ${total} 条。` : '';
            setTransferMessage(`导出失败：${error?.message || '未知错误'}${progressText ? ` ${progressText}` : ''}`);
            alert(`导出失败：${error?.message || '未知错误'}${progressText ? `\n${progressText}` : ''}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleExportOne = async (save: 存档列表项, event: React.MouseEvent) => {
        event.stopPropagation();
        if (syncing) return;
        setSyncing(true);
        const title = 构建存档标题(save);
        setTransferMessage(`正在整理单个存档：${title}`);
        try {
            const fullSave = await 读取完整存档(save);
            const blob = await 导出ZIP存档文件({ saves: [fullSave] });
            const stamp = new Date(save.时间戳 || Date.now()).toISOString().replace(/[:]/g, '-');
            const titlePart = 构建安全文件名片段(title, 'save');
            const typePart = save.类型 === 'auto' ? 'auto' : 'manual';
            const fileName = `wuxia-save-${typePart}-${stamp}-${titlePart}.zip`;
            await downloadArchiveBlob(blob, fileName);

        } catch (error: any) {
            console.error(error);
            setTransferMessage(`导出失败：${error?.message || '未知错误'}`);
            alert(`导出失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleConvertLocalToCloudPlay = async (save: 存档列表项, event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (syncing) return;
        const accepted = requestConfirm
            ? await requestConfirm({
                title: '转为云端游玩',
                message: '会先把此存档上传到当前云端存储，然后读取该节点进入云端游玩。确定继续吗？',
                confirmText: '上传并游玩',
                cancelText: '取消'
            })
            : window.confirm('会先把此存档上传到当前云端存储，然后读取该节点进入云端游玩。确定继续吗？');
        if (!accepted) return;
        setSyncing(true);
        setTransferMessage('正在准备转换为云端存档...');
        try {
            const fullSave = await 读取完整存档(save);
            const mode = 读取云端游玩存储模式();
            if (mode === 'object') {
                const config = await 读取对象存储同步配置();
                await 增量同步到对象存储(config, [fullSave], (progress) => setTransferMessage(progress.message));
                设置云端游玩存储模式('object');
                setCloudPlayMode('object');
                setTransferMessage('已转换为对象存储云端存档，正在进入云端游玩...');
                await Promise.resolve(onLoadGame(fullSave));
                onClose();
                return;
            }
            const session = 读取云端游玩会话();
            if (session) {
                await 上传本地存档到云端(session, fullSave, (progress) => setTransferMessage(progress.message));
                设置云端游玩存储模式('tg');
                setCloudPlayMode('tg');
                setTransferMessage('已转换为 TG 图床云端存档，正在进入云端游玩...');
                await Promise.resolve(onLoadGame(fullSave));
                onClose();
                return;
            }
            throw new Error('尚未启用云端游玩。请先在“云端游玩”里登录或配置对象存储，再转换此存档。');
        } catch (error: any) {
            setTransferMessage(`转换失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleTriggerImport = () => {
        if (syncing) return;
        setTransferMessage('请选择要导入的 ZIP 或 JSON 存档文件。');
        fileInputRef.current?.click();
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;

        const ok = requestConfirm
            ? await requestConfirm({
                title: '导入存档',
                message: `将导入文件“${file.name}”，并以“合并+去重”方式写入本地存档，是否继续？`,
                confirmText: '继续导入'
            })
            : true;
        if (!ok) {
            setTransferMessage('已取消导入。');
            return;
        }

        setSyncing(true);
        setTransferMessage(`正在导入：${file.name}`);
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

            setTransferMessage(`导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条。`);
            alert(`导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条。${repairedTip}`);
        } catch (error: any) {
            console.error(error);
            setTransferMessage(`导入失败：${error?.message || '未知错误'}`);
            alert(`导入失败：${error?.message || '未知错误'}`);
        } finally {
            setSyncing(false);
        }
    };

    const 是旧版缺摘要存档 = (save: 存档列表项): boolean => Boolean((save.元数据 as any)?.摘要缺失);

    const filteredSaves = saves;
    const saveTrees = 构建本地时间树(filteredSaves);
    const visibleSaveTrees = saveTrees.slice(0, visibleSaveCount);
    const 展平本地时间树 = (nodes: 本地时间树节点[]): 本地时间树节点[] => nodes.flatMap((node) => [node, ...展平本地时间树(node.children)]);
    const visibleSaves = visibleSaveTrees.flatMap((series) => 展平本地时间树(series.roots));
    const hasMoreRenderedSaves = visibleSaveCount < saveTrees.length;
    const busy = loading || syncing;
    const lineageTotal = Math.max(0, Number(lineageMigrationStatus.legacySaves) || 0);
    const lineageDone = Math.min(lineageTotal, Math.max(0, Number(lineageMigrationStatus.convertedSaves || 0) + Number(lineageMigrationStatus.failedSaves || 0)));
    const lineagePercent = lineageTotal > 0 ? Math.round((lineageDone / lineageTotal) * 100) : (lineageMigrationStatus.stage === 'completed' ? 100 : 0);
    const showLineageMigration = lineageMigrationStatus.stage === 'scanning'
        || lineageMigrationStatus.stage === 'running'
        || ((lineageMigrationStatus.stage === 'completed' || lineageMigrationStatus.stage === 'failed') && lineageMigrationStatus.legacySaves > 0);
    const selectedSeries = selectedSeriesKey ? saveTrees.find((series) => series.key === selectedSeriesKey) || null : null;

    const toggleSeries = (key: string) => {
        setExpandedSeries((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const renderLocalNode = (save: 本地时间树节点, level = 0): React.ReactNode => (
        <div key={save.id} className="space-y-2">
            <div
                onClick={() => { void handleLoadClick(save); }}
                className={`relative bg-black/40 border border-gray-700 p-4 rounded-lg group transition-all flex flex-col gap-2 ${mode === 'load' ? 'cursor-pointer hover:border-wuxia-gold/50 hover:bg-black/60' : ''}`}
                style={{ marginLeft: `${Math.min(level, 5) * 18}px` }}
            >
                <div className="flex items-start pr-8">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`text-[10px] px-1.5 rounded border ${是旧版缺摘要存档(save) ? 'border-gray-500 text-gray-300' : (save.类型 === 'auto' ? 'border-blue-500 text-blue-400' : 'border-wuxia-gold text-wuxia-gold')}`}>
                            {读取存档类型标签(save)}
                        </span>
                        <span className={`text-[10px] px-1.5 rounded border ${是新谱系存档(save) ? 'border-emerald-500/60 text-emerald-300' : 'border-amber-500/50 text-amber-300'}`} title={是新谱系存档(save) ? '新存档：已写入时间树谱系，可用于云端差分同步' : '旧存档：兼容读取，尚未写入新时间树谱系'}>
                            {是新谱系存档(save) ? '新谱系' : '旧存档'}
                        </span>
                        <span className="text-[10px] px-1.5 rounded border border-sky-500/40 text-sky-300">
                            {level === 0 ? '起点' : `+${level}`}
                        </span>
                        <span className="font-bold text-gray-200 text-sm">{构建存档标题(save)}</span>
                        <span className="text-xs text-gray-500">
                            {save.角色数据?.境界 || '未知境界'}
                        </span>
                        <span className="rounded border border-gray-700 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-wuxia-cyan/80" title="存档短哈希，用于区分同名同时间附近的存档">
                            #{读取存档短哈希(save)}
                        </span>
                    </div>
                </div>

                <div className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">
                    {读取地点文本(save)} · 游戏内 {读取时间文本(save)}
                </div>
                <div className="text-[11px] text-gray-500">
                    {构建存档摘要(save)}
                </div>

                <button
                    onClick={(event) => { void handleExportOne(save, event); }}
                    className="absolute bottom-4 right-4 rounded border border-wuxia-cyan/35 bg-black/50 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-wuxia-cyan opacity-0 transition-all hover:border-wuxia-cyan hover:bg-wuxia-cyan/15 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="只导出这一条存档"
                    disabled={busy}
                >
                    导出此档
                </button>
                <button
                    onClick={(event) => { void handleConvertLocalToCloudPlay(save, event); }}
                    className="absolute bottom-4 right-24 rounded border border-emerald-400/35 bg-black/50 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-emerald-100 opacity-0 transition-all hover:border-emerald-300 hover:bg-emerald-500/15 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="上传此档并切换为云端游玩"
                    disabled={busy}
                >
                    转云端游玩
                </button>


                {save.类型 === 'manual' && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); setSaveMenuOpen(saveMenuOpen === save.id ? null : save.id); }}
                            className="absolute top-3 right-14 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-600 bg-black/50 text-gray-300 opacity-0 transition-all hover:border-wuxia-gold hover:text-wuxia-gold group-hover:opacity-100"
                            title="更多操作"
                        >
                            <span className="text-lg leading-none">⋮</span>
                        </button>
                        {saveMenuOpen === save.id && (
                            <div className="absolute top-12 right-3 z-10 min-w-[160px] rounded border border-gray-700 bg-black/95 shadow-xl">
                                <button
                                    onClick={(e) => { void handleDeleteTreeAndRebuild(save.id!, e); }}
                                    className="w-full px-4 py-2 text-left text-sm text-red-300 hover:bg-red-900/20"
                                >
                                    删除存档树并重建
                                </button>
                            </div>
                        )}
                    </>
                )}
                <button
                    onClick={(e) => { void handleDelete(save.id, e); }}
                    className={删除按钮类名}
                    title={saveProtectionEnabled ? '存档保护已开启' : '删除'}
                    disabled={saveProtectionEnabled}
                >
                    <span className="sr-only">{saveProtectionEnabled ? '存档保护已开启' : '删除存档'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                </button>
            </div>
            {save.children.length > 0 && save.children.map((child) => renderLocalNode(child, level + 1))}
        </div>
    );

    const renderLocalCard = (save: 本地时间树节点): React.ReactNode => (
        <div
            onClick={() => { void handleLoadClick(save); }}
            className={`relative w-[min(16.5rem,calc(100vw-4rem))] shrink-0 snap-start bg-black/40 border border-gray-700 p-3.5 rounded-lg group transition-all flex flex-col gap-2 ${mode === 'load' ? 'cursor-pointer hover:border-wuxia-gold/50 hover:bg-black/60' : ''}`}
        >
            <div className="flex items-start pr-7">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`text-[10px] px-1.5 rounded border ${是旧版缺摘要存档(save) ? 'border-gray-500 text-gray-300' : (save.类型 === 'auto' ? 'border-blue-500 text-blue-400' : 'border-wuxia-gold text-wuxia-gold')}`}>
                        {读取存档类型标签(save)}
                    </span>
                    <span className={`text-[10px] px-1.5 rounded border ${是新谱系存档(save) ? 'border-emerald-500/60 text-emerald-300' : 'border-amber-500/50 text-amber-300'}`} title={是新谱系存档(save) ? '新存档：已写入时间树谱系，可用于云端差分同步' : '旧存档：兼容读取，尚未写入新时间树谱系'}>
                        {是新谱系存档(save) ? '新谱系' : '旧存档'}
                    </span>
                    <span className="font-bold text-gray-200 text-sm">{构建存档标题(save)}</span>
                </div>
            </div>
            <div className="text-xs text-gray-400 border-l-2 border-gray-700 pl-2">
                {读取地点文本(save)} · 游戏内 {读取时间文本(save)}
            </div>
            <div className="text-[11px] text-gray-500">
                {构建存档摘要(save)}
            </div>
            <div className="rounded border border-gray-700 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-wuxia-cyan/80 w-fit" title="存档短哈希，用于区分同名同时间附近的存档">
                #{读取存档短哈希(save)}
            </div>
            <button
                onClick={(event) => { void handleExportOne(save, event); }}
                className="absolute bottom-4 right-4 rounded border border-wuxia-cyan/35 bg-black/50 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-wuxia-cyan opacity-0 transition-all hover:border-wuxia-cyan hover:bg-wuxia-cyan/15 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="只导出这一条存档"
                disabled={busy}
            >
                导出此档
            </button>
            <button
                onClick={(event) => { void handleConvertLocalToCloudPlay(save, event); }}
                className="absolute bottom-4 right-24 rounded border border-emerald-400/35 bg-black/50 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-emerald-100 opacity-0 transition-all hover:border-emerald-300 hover:bg-emerald-500/15 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="上传此档并切换为云端游玩"
                disabled={busy}
            >
                转云端游玩
            </button>
            <button
                onClick={(e) => { void handleDelete(save.id, e); }}
                className={删除按钮类名}
                title={saveProtectionEnabled ? '存档保护已开启' : '删除'}
                disabled={saveProtectionEnabled}
            >
                <span className="sr-only">{saveProtectionEnabled ? '存档保护已开启' : '删除存档'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
            </button>
        </div>
    );

    const renderLocalTimelineNode = (save: 本地时间树节点, root = false): React.ReactNode => (
        <div key={save.id} className="inline-flex flex-col items-start">
            <div className="flex items-center">
                {!root && (
                    <div className="flex w-14 shrink-0 items-center sm:w-20" aria-hidden="true">
                        <div className="h-px flex-1 bg-wuxia-gold/40" />
                        <div className="h-2 w-2 rotate-45 border-r border-t border-wuxia-gold/70" />
                    </div>
                )}
                {renderLocalCard(save)}
            </div>
            {save.children.length > 0 && (
                <div className="ml-36 mt-3 flex items-start gap-4 border-t border-wuxia-gold/20 pt-3">
                    {save.children.map((child) => renderLocalTimelineNode(child))}
                </div>
            )}
        </div>
    );

    const renderSeriesTimeline = (series: 本地时间树系列): React.ReactNode => {
        const roots = series.roots.length > 0 ? series.roots : [];
        if (roots.length <= 0) return null;
        const ordered = 展平本地时间树(roots);
        return (
            <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-4 touch-pan-x custom-scrollbar">
                <div className="inline-flex min-w-full snap-x snap-mandatory items-center gap-0 px-1 pr-8">
                    {ordered.map((node, index) => (
                        <React.Fragment key={node.id}>
                            {index > 0 && (
                                <div className="flex w-14 shrink-0 items-center sm:w-20" aria-hidden="true">
                                    <div className="h-px flex-1 bg-wuxia-gold/45" />
                                    <div className="h-2 w-2 rotate-45 border-r border-t border-wuxia-gold/75" />
                                </div>
                            )}
                            {renderLocalCard(node)}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] flex items-stretch justify-stretch p-0 animate-fadeIn sm:items-center sm:justify-center sm:p-4">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full h-[100svh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] relative overflow-hidden sm:h-[min(82vh,820px)] sm:w-[min(1280px,calc(100vw-2rem))] sm:rounded-2xl">

                <div className="h-14 shrink-0 border-b border-gray-800/50 bg-black/40 flex items-center justify-between px-4 relative z-50 sm:h-16 sm:px-6">
                    <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.22em] drop-shadow-md sm:text-2xl sm:tracking-[0.3em]" style={{ fontFamily: 'var(--ui-页面标题-font-family, inherit)', lineHeight: 'var(--ui-页面标题-line-height, 1.2)' }}>
                        {mode === 'save' ? '铭刻时光' : '本地存档'}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-2xl" style={{ fontFamily: 'var(--ui-按钮-font-family, inherit)' }}>×</button>
                </div>

                <div className="min-h-0 flex-1 flex flex-col overflow-hidden sm:flex-row">
                    {mode === 'save' && (
                        <div className="shrink-0 bg-black/20 border-b border-gray-800/50 p-4 flex flex-col gap-3 sm:w-[30%] sm:border-b-0 sm:border-r sm:p-6 sm:gap-4">
                            <h4 className="text-wuxia-gold font-bold text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--ui-分组标题-font-family, inherit)', fontSize: 'var(--ui-分组标题-font-size, 18px)' }}>铭刻当前进度</h4>
                            <p className="text-xs text-gray-400 leading-relaxed" style={{ fontFamily: 'var(--ui-辅助文本-font-family, inherit)', fontSize: 'var(--ui-辅助文本-font-size, 12px)', lineHeight: 'var(--ui-辅助文本-line-height, 1.5)' }}>
                                手动与自动存档会写入同一起始进度的时间树谱系信息；本地保留可独立读取的完整存档，云端同步会优先使用谱系差分压缩。导出时会按 ZIP 拆分为图片、聊天记录、游戏数据三个目录。
                            </p>
                            {cloudPlayMode && (
                                <div className="rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs leading-6 text-sky-100">
                                    当前处于云端游玩模式（{cloudPlayMode === 'object' ? '对象存储' : 'TG图床'}）。保存存档会同步保存到云端和本地。
                                </div>
                            )}
                            <GameButton onClick={() => { void handleSave(); }} disabled={!onSaveGame || busy} variant="primary" className="w-full">
                                立即保存
                            </GameButton>
                        </div>
                    )}

                    <div className="min-h-0 min-w-0 flex-1 flex flex-col bg-ink-wash/5">
                        <div className="max-w-full overflow-x-auto overscroll-x-contain border-b border-gray-800/50 px-4 pt-3 pb-3 touch-pan-x custom-scrollbar sm:px-6 sm:pt-4">
                            <div className="flex min-w-max justify-end gap-2">
                            {isNativeCapacitorEnvironment() && saves.some((save) => 是旧版缺摘要存档(save)) && (
                                <GameButton
                                    onClick={() => { void handleHydrateVisibleSummaries(); }}
                                    disabled={busy || hydratingVisibleSummaries}
                                    variant="secondary"
                                    className="px-4 py-2 text-xs"
                                >
                                    恢复当前页详情
                                </GameButton>
                            )}
                            <GameButton
                                onClick={() => { void handleExportAll(); }}
                                disabled={busy}
                                variant="secondary"
                                className="px-4 py-2 text-xs"
                            >
                                导出全部存档
                            </GameButton>
                            <GameButton
                                onClick={handleTriggerImport}
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
                                className="absolute h-px w-px opacity-0 pointer-events-none"
                                aria-label="选择要导入的存档文件"
                                onChange={(e) => { void handleImportFileChange(e); }}
                            />
                            </div>
                        </div>
                        {transferMessage && (
                            <div className="px-6 py-2 text-[11px] text-wuxia-cyan bg-wuxia-cyan/10 border-b border-wuxia-cyan/25 [html[data-theme='day']_&]:bg-cyan-100 [html[data-theme='day']_&]:text-cyan-900 [html[data-theme='day']_&]:border-cyan-300">
                                {transferMessage}
                            </div>
                        )}
                        {saveProtectionEnabled && (
                            <div className="px-6 py-2 text-[11px] text-emerald-300 bg-emerald-900/10 border-b border-emerald-800/30">
                                存档保护已开启，当前禁止删除存档。
                            </div>
                        )}
                        {showLineageMigration && (
                            <div className="px-6 py-3 text-[11px] text-sky-100 bg-sky-950/35 border-b border-sky-700/30">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                        旧存档谱系转换：{lineageMigrationStatus.lastMessage}
                                    </span>
                                    <span>{lineageTotal > 0 ? `${lineageDone}/${lineageTotal}` : `${lineagePercent}%`}</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full border border-sky-400/20 bg-black/40">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${lineageMigrationStatus.stage === 'failed' ? 'bg-amber-300' : 'bg-sky-300'}`}
                                        style={{ width: `${lineagePercent}%` }}
                                    />
                                </div>
                                <div className="mt-1 text-[10px] text-sky-100/70">
                                    旧存档会保留原数据，只补上新谱系字段；未完成时关闭页面，下次进入会继续转换。
                                </div>
                            </div>
                        )}

                        <div className="border-b border-gray-800/50 px-4 py-3 text-xs leading-5 text-gray-400 sm:px-6">
                            <span className="font-semibold tracking-[0.16em] text-wuxia-gold">本地存档节点</span>
                            <span className="ml-3">这里显示设备本地存档；云端游玩时，自动与手动存档也会先落本地，再同步到云端。自动与手动节点合并在同一棵时间树中，并单独标注来源。</span>
                        </div>

                        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y custom-scrollbar p-4 space-y-3 sm:p-6">
                            {filteredSaves.length === 0 && !loading && (
                                <div className="text-center text-gray-600 py-10">暂无记录</div>
                            )}
                            {loading && (
                                <div className="text-center text-gray-500 py-10">读取中...</div>
                            )}

                            {selectedSeries ? (
                                <div className="min-h-full min-w-0 rounded-lg border border-wuxia-gold/25 bg-black/20 p-3 sm:p-4">
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-wuxia-gold/15 pb-3">
                                        <div>
                                            <div className="font-serif text-base font-bold tracking-[0.12em] text-wuxia-gold">{selectedSeries.title}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">
                                                时间树 {selectedSeries.count} 个节点（手动 {selectedSeries.manualCount} / 自动 {selectedSeries.autoCount}） · #{selectedSeries.hash} · 最新 {读取存档回合标签(selectedSeries.latest)} · {读取现实保存时间文本(selectedSeries.latest)} · {读取地点文本(selectedSeries.latest)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { void handleLoadClick(selectedSeries.latest); }}
                                                className="rounded border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-semibold text-wuxia-gold hover:bg-wuxia-gold/20"
                                            >
                                                读取最新存档
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(event) => { void handleConvertLocalToCloudPlay(selectedSeries.latest, event); }}
                                                disabled={busy}
                                                className="rounded border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                转为云端存档并云端游玩
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(event) => { void handleDeleteSeries(selectedSeries, event); }}
                                                disabled={busy || saveProtectionEnabled}
                                                className="rounded border border-red-400/35 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-100 hover:border-red-300 hover:bg-red-800/45 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                删除整棵时间树
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedSeriesKey(null)}
                                                className="rounded border border-gray-600 px-3 py-2 text-xs text-gray-200 hover:bg-white/5"
                                            >
                                                返回系列列表
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mb-3 text-[11px] leading-5 text-gray-500">
                                        横向线路按存档父子关系展开；读取中间节点继续游玩后，后续存档会在这里形成分叉，箭头表示时间推进方向。
                                    </div>
                                    <div className="max-h-[calc(100svh-17rem)] overflow-y-auto overscroll-y-contain pr-1 touch-pan-y custom-scrollbar sm:max-h-none sm:overflow-y-visible sm:pr-0">
                                        {renderSeriesTimeline(selectedSeries)}
                                    </div>
                                </div>
                            ) : visibleSaveTrees.map((series) => {
                                const expanded = expandedSeries.has(series.key);
                                return (
                                    <div key={series.key} onClick={() => { void handleLoadClick(series.latest); }} className={`rounded-lg border border-wuxia-gold/20 bg-black/20 p-3 ${mode === 'load' ? 'cursor-pointer hover:border-wuxia-gold/45 hover:bg-black/30' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedSeriesKey(series.key);
                                                toggleSeries(series.key);
                                            }}
                                            className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-wuxia-gold/10 pb-2 text-left"
                                        >
                                            <div>
                                                <div className="font-serif text-sm font-bold tracking-[0.12em] text-wuxia-gold">{series.title}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">
                                                    时间树 {series.count} 个节点（手动 {series.manualCount} / 自动 {series.autoCount}） · #{series.hash} · 最新 {读取存档回合标签(series.latest)} · {读取现实保存时间文本(series.latest)} · {读取地点文本(series.latest)}
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-wuxia-cyan">{series.count > 1 ? '展开时间树选择存档' : '查看时间树'}</div>
                                        </button>
                                        <div className="mt-3 text-[11px] text-gray-500">
                                            点击本系列会直接读取最新存档；{series.count > 1 ? '展开后可从完整时间树中选择任意节点。' : '只有一个节点时默认收起，避免占用列表空间。'}
                                        </div>
                                        {series.count === 1 && (
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-wuxia-gold/10 pt-3">
                                                <div className="font-mono text-[10px] text-wuxia-cyan/75" title="存档短哈希，用于区分同名同时间附近的存档">
                                                    #{读取存档短哈希(series.latest)}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(event) => { void handleExportOne(series.latest, event); }}
                                                    className="rounded border border-wuxia-cyan/35 bg-black/30 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-wuxia-cyan transition-colors hover:border-wuxia-cyan hover:bg-wuxia-cyan/15 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title="只导出这一条存档"
                                                    disabled={busy}
                                                >
                                                    导出此档
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => { void handleConvertLocalToCloudPlay(series.latest, event); }}
                                                    disabled={busy}
                                                    className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-emerald-100 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title="上传此档并切换为云端游玩"
                                                >
                                                    转云端游玩
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => { void handleDelete(series.latest.id, event); }}
                                                    disabled={busy || saveProtectionEnabled}
                                                    className="rounded border border-red-400/35 bg-red-950/35 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-red-200 transition-colors hover:border-red-300 hover:bg-red-800/45 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title={saveProtectionEnabled ? '存档保护已开启' : '删除此档'}
                                                >
                                                    删除此档
                                                </button>
                                            </div>
                                        )}
                                        {series.count > 1 && (
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-wuxia-gold/10 pt-3">
                                                <div className="text-[11px] text-gray-500">
                                                    可一次清理整个系列，避免长存档逐个删除节点。
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(event) => { void handleDeleteSeries(series, event); }}
                                                    disabled={busy || saveProtectionEnabled}
                                                    className="rounded border border-red-400/35 bg-red-950/35 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-red-200 transition-colors hover:border-red-300 hover:bg-red-800/45 disabled:cursor-not-allowed disabled:opacity-40"
                                                    title={saveProtectionEnabled ? '存档保护已开启' : '删除此时间树的全部节点'}
                                                >
                                                    删除整棵时间树
                                                </button>
                                            </div>
                                        )}
                                        {expanded && series.count === 1 && (
                                            <div className="mt-3">
                                                {renderLocalCard(series.latest as 本地时间树节点)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {!selectedSeries && (hasMoreRenderedSaves || hasMoreSaves) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (hasMoreRenderedSaves) {
                                            setVisibleSaveCount((count) => count + pageSize);
                                        } else {
                                            void loadSaves(false);
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-full rounded-lg border border-wuxia-cyan/35 bg-black/30 px-4 py-3 text-xs font-semibold tracking-wider text-wuxia-cyan transition-colors hover:border-wuxia-cyan hover:bg-wuxia-cyan/15"
                                >
                                    加载更多存档（已显示 {visibleSaveTrees.length} 个系列）
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveLoadModal;
