import React from 'react';
import type { 存档结构 } from '../../../types';
import {
    云端游玩风险提示文本,
    已确认云端游玩风险,
    设置云端游玩风险确认,
    读取云端游玩会话,
    刷新云端游玩会话,
    注册云端游玩账号,
    登录云端游玩账号,
    清除云端游玩会话,
    启用对象存储云端游玩模式,
    清除对象存储云端游玩模式,
    已启用对象存储云端游玩模式,
    设置云端游玩存储模式,
    读取云端游玩存储模式,
    准备开启云端新存档,
    读取云端存档清单,
    读取缓存云端存档清单,
    复制全部本地存档到云端,
    导入云端存档到本地,
    保存云端存档为本地文件,
    下载云端存档包,
    删除云端存档节点,
    type 云端游玩账号,
    type 云端存档清单,
    type 云端存档摘要,
    type 云端下载进度,
    type 云端上传进度
} from '../../../services/cloudPlayService';
import {
    读取对象存储同步配置,
    列出对象存储云存档,
    下载对象存储云存档,
    删除对象存储云存档,
    增量同步到对象存储,
    type 对象存储云存档元数据,
    type 对象存储同步进度,
    type 对象存储同步配置
} from '../../../services/objectStorageSync';
import * as dbService from '../../../services/dbService';
import {
    同步云端设置,
    启动云端设置自动同步,
    停止云端设置自动同步,
    type 云端设置同步进度
} from '../../../services/cloudSettingsSync';
import { 导出ZIP存档文件 } from '../../../services/saveArchiveService';
import { 创建并记录ObjectURL, 延迟释放并记录ObjectURL } from '../../../utils/objectUrlLifecycle';
import CloudSettingsSyncPanel from './CloudSettingsSyncPanel';
import {
    构建对象存储云存档时间树,
    展开对象存储进度线,
    type 对象存储时间树节点
} from '../../../utils/cloudPlaySaveTree';

interface Props {
    onClose: () => void;
    onLoadGame: (save: 存档结构) => void | Promise<void>;
    onStartNewGame?: () => void;
    onConfigureObjectStorage?: () => void;
}

const formatTime = (value: string | number | undefined): string => {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '未知时间';
    const pad2 = (num: number) => Math.trunc(num).toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatBytes = (bytes?: number): string => {
    if (!Number.isFinite(bytes || 0) || !bytes) return '未知大小';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const clampPercent = (value: number | undefined): number => {
    if (!Number.isFinite(value || NaN)) return 0;
    return Math.max(0, Math.min(100, Math.round(value || 0)));
};

type 云端时间树节点 = 云端存档摘要 & { children: 云端时间树节点[] };

const 扁平化云端树节点 = (nodes: 云端时间树节点[]): 云端存档摘要[] => {
    const result: 云端存档摘要[] = [];
    const walk = (list: 云端时间树节点[]) => {
        list.forEach((node) => {
            const { children, ...summary } = node;
            result.push(summary);
            if (children?.length) walk(children);
        });
    };
    walk(nodes);
    return result;
};

const 扁平化对象存储树节点 = (nodes: 对象存储时间树节点[]): 对象存储云存档元数据[] => {
    const result: 对象存储云存档元数据[] = [];
    const walk = (list: 对象存储时间树节点[]) => {
        list.forEach((node) => {
            const { children, ...metadata } = node;
            result.push(metadata as 对象存储云存档元数据);
            if (children?.length) walk(children);
        });
    };
    walk(nodes);
    return result;
};

const 估算云端复制进度 = (progress: 云端上传进度 | null): number => {
    if (!progress) return 0;
    const total = Math.max(1, Number(progress.total || 0));
    const current = Math.max(0, Number(progress.current || 0));
    const base = progress.total ? ((Math.max(0, current - 1) / total) * 100) : 0;
    const inner = clampPercent(progress.percent) / total;
    return clampPercent(progress.stage === 'done' ? 100 : base + inner);
};

const 估算对象存储复制进度 = (progress: 对象存储同步进度 | null): number => {
    if (!progress) return 0;
    if (progress.stage === 'done') return 100;
    const stageBase: Record<对象存储同步进度['stage'], number> = {
        prepare: 8,
        directory: 4,
        upload: 45,
        download: 45,
        manifest: 88,
        done: 100
    };
    const total = Math.max(1, Number(progress.total || 0));
    const current = Math.max(0, Number(progress.current || 0));
    const within = progress.total ? Math.min(35, (current / total) * 35) : 0;
    return clampPercent((stageBase[progress.stage] || 0) + within);
};

const buildSeriesKey = (item: 云端存档摘要): string => item.seriesId || item.rootCloudId || item.title || item.cloudId;

const buildCloudSaveTrees = (saves: 云端存档摘要[]): Array<{ key: string; title: string; latest: 云端存档摘要; roots: 云端时间树节点[]; count: number; totalBytes: number }> => {
    const groups = new Map<string, 云端存档摘要[]>();
    saves.forEach((item) => {
        const key = buildSeriesKey(item);
        groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()].map(([key, items]) => {
        const nodes = new Map<string, 云端时间树节点>();
        items.forEach((item) => nodes.set(item.cloudId, { ...item, children: [] }));
        const roots: 云端时间树节点[] = [];
        nodes.forEach((node) => {
            const parent = node.parentCloudId ? nodes.get(node.parentCloudId) : undefined;
            if (parent) parent.children.push(node);
            else roots.push(node);
        });
        const sortNodes = (list: 云端时间树节点[]) => {
            list.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
            list.forEach((node) => sortNodes(node.children));
        };
        sortNodes(roots);
        const latest = [...items].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0];
        return {
            key,
            title: latest?.title || '未知角色',
            latest,
            roots,
            count: items.length,
            totalBytes: items.reduce((sum, item) => sum + Math.max(0, Number(item.packageSize || 0)), 0)
        };
    }).sort((a, b) => Number(b.latest?.timestamp || 0) - Number(a.latest?.timestamp || 0));
};

const CloudPlayModal: React.FC<Props> = ({ onClose, onLoadGame, onStartNewGame, onConfigureObjectStorage }) => {
    const [riskAccepted, setRiskAccepted] = React.useState(() => 已确认云端游玩风险());
    const [session, setSession] = React.useState<云端游玩账号 | null>(() => 读取云端游玩会话());
    const [storageMode, setStorageMode] = React.useState<'tg' | 'object'>(() => 读取云端游玩存储模式() || 'tg');
    const [objectStorageConfig, setObjectStorageConfig] = React.useState<对象存储同步配置 | null>(null);
    const [objectStorageSaves, setObjectStorageSaves] = React.useState<对象存储云存档元数据[]>([]);
    const [mode, setMode] = React.useState<'login' | 'register'>('login');
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [manifest, setManifest] = React.useState<云端存档清单 | null>(null);
    const [manifestLoading, setManifestLoading] = React.useState(false);
    const [manifestLoaded, setManifestLoaded] = React.useState(false);
    const [manifestError, setManifestError] = React.useState('');
    const [objectStorageRefreshing, setObjectStorageRefreshing] = React.useState(false);
    const [objectStorageLoaded, setObjectStorageLoaded] = React.useState(false);
    const [objectStorageError, setObjectStorageError] = React.useState('');
    const [busy, setBusy] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [uploadProgress, setUploadProgress] = React.useState<云端上传进度 | null>(null);
    const [objectUploadProgress, setObjectUploadProgress] = React.useState<对象存储同步进度 | null>(null);
    const [downloadProgress, setDownloadProgress] = React.useState<云端下载进度 | null>(null);
    const [settingsSyncProgress, setSettingsSyncProgress] = React.useState<云端设置同步进度 | null>(null);
    const [selectedCloudSeriesKey, setSelectedCloudSeriesKey] = React.useState<string | null>(null);
    const [selectedObjectSeriesKey, setSelectedObjectSeriesKey] = React.useState<string | null>(null);
    const cloudSaveTrees = React.useMemo(() => buildCloudSaveTrees(manifest?.saves || []), [manifest]);
    const objectStorageSaveTrees = React.useMemo(() => 构建对象存储云存档时间树(objectStorageSaves), [objectStorageSaves]);
    const selectedCloudSeries = React.useMemo(
        () => cloudSaveTrees.find((series) => series.key === selectedCloudSeriesKey) || null,
        [cloudSaveTrees, selectedCloudSeriesKey]
    );
    const selectedObjectSeries = React.useMemo(
        () => objectStorageSaveTrees.find((series) => series.key === selectedObjectSeriesKey) || null,
        [objectStorageSaveTrees, selectedObjectSeriesKey]
    );
    const selectedObjectTimeline = React.useMemo(
        () => selectedObjectSeries ? 展开对象存储进度线(selectedObjectSeries.roots) : [],
        [selectedObjectSeries]
    );

    const manifestRef = React.useRef<云端存档清单 | null>(null);
    const manifestRequestIdRef = React.useRef(0);
    const objectRequestIdRef = React.useRef(0);
    const sessionRef = React.useRef<云端游玩账号 | null>(session);
    const skipAutoRefreshUserIdRef = React.useRef('');
    React.useEffect(() => {
        manifestRef.current = manifest;
    }, [manifest]);
    React.useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    const refreshManifest = React.useCallback(async (
        targetSession = sessionRef.current,
        options?: { skipSessionRefresh?: boolean }
    ) => {
        if (!targetSession) return;
        const requestId = manifestRequestIdRef.current + 1;
        manifestRequestIdRef.current = requestId;
        setManifestLoading(true);
        setManifestLoaded(false);
        setManifestError('');
        try {
            const activeSession = options?.skipSessionRefresh
                ? targetSession
                : await 刷新云端游玩会话(targetSession);
            if (requestId !== manifestRequestIdRef.current) return;
            if (
                activeSession.manifestUrl !== targetSession.manifestUrl
                || activeSession.manifestUpdatedAt !== targetSession.manifestUpdatedAt
            ) {
                setSession(activeSession);
            }
            const next = await 读取云端存档清单(activeSession);
            if (requestId !== manifestRequestIdRef.current) return;
            setManifest(next);
            setManifestError('');
            setMessage(next.saves.length > 0 ? `已读取 ${next.saves.length} 个云端存档。` : '当前云端还没有存档。');
        } catch (error: any) {
            if (requestId !== manifestRequestIdRef.current) return;
            const errorMessage = error?.message || '未知错误';
            setManifestError(errorMessage);
            const cached = manifestRef.current || 读取缓存云端存档清单(targetSession);
            if (cached) setManifest(cached);
            setMessage(cached
                ? `读取云端存档失败：${errorMessage}。已保留上次成功读取的 ${cached.saves.length} 个云端存档，稍后可重试刷新。`
                : `读取云端存档失败：${errorMessage}`);
        } finally {
            if (requestId === manifestRequestIdRef.current) {
                setManifestLoading(false);
                setManifestLoaded(true);
            }
        }
    }, []);

    React.useEffect(() => {
        if (!riskAccepted || !session?.userId || storageMode !== 'tg') return;
        if (skipAutoRefreshUserIdRef.current === session.userId) {
            skipAutoRefreshUserIdRef.current = '';
            return;
        }
        void refreshManifest(sessionRef.current || session);
    }, [riskAccepted, session?.userId, storageMode, refreshManifest]);

    React.useEffect(() => {
        if (!riskAccepted || !已启用对象存储云端游玩模式()) return;
        void handleUseObjectStorage(false);
    }, [riskAccepted]);

    const handleAcceptRisk = () => {
        设置云端游玩风险确认();
        setRiskAccepted(true);
    };

    const handleUseTgStorage = () => {
        设置云端游玩存储模式('tg');
        const savedSession = sessionRef.current || 读取云端游玩会话();
        setObjectStorageConfig(null);
        setObjectStorageSaves([]);
        setObjectStorageLoaded(false);
        setObjectStorageError('');
        setManifestError('');
        if (savedSession) {
            setManifestLoaded(false);
            setManifestLoading(true);
            setSession(savedSession);
            setStorageMode('tg');
            setMessage('已切换为 TG 图床云端游玩。');
            if (storageMode === 'tg') {
                void refreshManifest(savedSession);
            }
        } else {
            setStorageMode('tg');
            setMessage('已切换为 TG 图床模式，请登录账号后继续。');
        }
    };

    const handleUseObjectStorage = async (openConfigOnFailure = true) => {
        const requestId = objectRequestIdRef.current + 1;
        objectRequestIdRef.current = requestId;
        setObjectStorageRefreshing(true);
        setObjectStorageLoaded(false);
        setObjectStorageError('');
        setBusy('object-storage-check');
        setMessage('正在检查对象存储配置并读取云端存档...');
        try {
            const config = await 读取对象存储同步配置();
            if (requestId !== objectRequestIdRef.current) return;
            if (!config) {
                setObjectStorageError('尚未配置对象存储。');
                setMessage('尚未配置对象存储，正在打开配置页。');
                if (openConfigOnFailure) onConfigureObjectStorage?.();
                return;
            }
            const list = await 列出对象存储云存档(config);
            if (requestId !== objectRequestIdRef.current) return;
            启用对象存储云端游玩模式();
            setObjectStorageConfig(config);
            setObjectStorageSaves(list);
            setObjectStorageError('');
            setStorageMode('object');
            setRiskAccepted(true);
            setMessage(list.length > 0 ? `对象存储连接成功，已读取 ${list.length} 个云端存档。` : '对象存储连接成功，当前云端还没有存档。');
        } catch (error: any) {
            if (requestId !== objectRequestIdRef.current) return;
            const errorMessage = error?.message || '未知错误';
            setObjectStorageError(errorMessage);
            setMessage(openConfigOnFailure
                ? `对象存储不可用：${errorMessage}。正在打开配置页。`
                : `读取对象存储云端存档失败：${errorMessage}`);
            if (openConfigOnFailure) onConfigureObjectStorage?.();
        } finally {
            if (requestId === objectRequestIdRef.current) {
                setObjectStorageRefreshing(false);
                setObjectStorageLoaded(true);
                setBusy('');
            }
        }
    };

    const handleAuth = async () => {
        setBusy('auth');
        setMessage('');
        try {
            const nextSession = mode === 'register'
                ? await 注册云端游玩账号(username, password)
                : await 登录云端游玩账号(username, password);
            设置云端游玩存储模式('tg');
            skipAutoRefreshUserIdRef.current = nextSession.userId;
            setManifest(null);
            setManifestLoading(true);
            setManifestLoaded(false);
            setManifestError('');
            setSession(nextSession);
            setStorageMode('tg');
            setUsername('');
            setPassword('');
            setMessage(mode === 'register' ? '注册成功，正在读取云端存档与设置...' : '登录成功，正在读取云端存档与设置...');
            const manifestPromise = refreshManifest(nextSession, { skipSessionRefresh: true });
            const settingsResult = await 同步云端设置(nextSession, (progress) => {
                setSettingsSyncProgress(progress);
                setMessage(`设置同步：${progress.message}`);
            });
            // 退出登录时会停止自动同步；重新登录/注册后必须显式重启，否则后续设置变更不会自动上传。
            启动云端设置自动同步();
            await manifestPromise;
            if (!settingsResult.ok) {
                setMessage(`登录成功，但设置同步失败：${settingsResult.error || '未知错误'}，稍后将自动重试。`);
            } else if (!manifestRef.current || manifestRef.current.saves.length === 0) {
                setMessage(`${mode === 'register' ? '注册成功' : '登录成功'}，设置已同步（${settingsResult.settingCount ?? 0} 项）。`);
            }
        } catch (error: any) {
            setMessage(`${mode === 'register' ? '注册' : '登录'}失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleLogout = () => {
        停止云端设置自动同步();
        清除云端游玩会话();
        清除对象存储云端游玩模式();
        manifestRequestIdRef.current += 1;
        setSession(null);
        setManifest(null);
        setManifestLoading(false);
        setManifestLoaded(false);
        setManifestError('');
        setSelectedCloudSeriesKey(null);
        setSettingsSyncProgress(null);
        setMessage('已退出云端游玩。');
    };

    const handleSyncSettings = async () => {
        if (!session) return;
        setBusy('settings-sync');
        setMessage('');
        try {
            const result = await 同步云端设置(session, (progress) => {
                setSettingsSyncProgress(progress);
                setMessage(`设置同步：${progress.message}`);
            });
            setMessage(result.ok
                ? `设置同步完成：共 ${result.settingCount ?? 0} 项，云端恢复 ${result.changed ?? 0} 项。`
                : `设置同步失败：${result.error || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleStartNewCloudSave = React.useCallback(() => {
        if (!onStartNewGame) return;
        const prepared = 准备开启云端新存档(storageMode);
        if (!prepared) {
            setMessage('请先登录 TG 图床云端账号，或切换到对象存储后再开启新存档。');
            return;
        }
        setStorageMode(prepared);
        onStartNewGame();
    }, [onStartNewGame, storageMode]);

    const handleCopyLocal = async () => {
        if (!session) return;
        setBusy('copy');
        setUploadProgress({ stage: 'manifest', current: 0, total: 0, percent: 1, message: '正在准备复制本地存档到 TG 图床云端...' });
        setMessage('正在复制本地存档到云端...');
        try {
            const result = await 复制全部本地存档到云端(session, (progress) => {
                setUploadProgress(progress);
                setMessage(progress.message);
            });
            setSession(result.session);
            setMessage(`复制完成：新增 ${result.uploaded} 个，跳过重复 ${result.skipped} 个。`);
            await refreshManifest(result.session);
        } catch (error: any) {
            const cached = manifest || 读取缓存云端存档清单(session);
            if (cached) setManifest(cached);
            setMessage(cached
                ? `复制失败：${error?.message || '未知错误'}。已有云端存档列表已保留（${cached.saves.length} 个），本次失败不会删除云端旧存档。`
                : `复制失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleLoadCloudSave = async (item: 云端存档摘要) => {
        if (!session) return;
        设置云端游玩存储模式('tg');
        setBusy(`load:${item.cloudId}`);
        setDownloadProgress(null);
        setMessage('正在下载并解密云端存档...');
        try {
            const payload = await 下载云端存档包(session, item, (progress) => {
                setDownloadProgress(progress);
                setMessage(progress.message);
            });
            const save = payload.saves[0];
            if (!save) throw new Error('云端存档包内没有可读取的存档。');
            await dbService.导入存档数据({ saves: payload.saves }, { 覆盖现有: false }).catch((error) => {
                console.warn('云端游玩载入时写入本地谱系索引失败:', error);
            });
            await Promise.resolve(onLoadGame(save));
            onClose();
        } catch (error: any) {
            setMessage(`载入失败：${error?.message || '未知错误'}`);
        } finally {
            setDownloadProgress(null);
            setBusy('');
        }
    };

    const handleConvertCloudSaveToLocalPlay = async (item: 云端存档摘要) => {
        if (!session) return;
        setBusy(`local:${item.cloudId}`);
        setDownloadProgress(null);
        setMessage('正在下载云端存档并转换为本地游玩...');
        try {
            const payload = await 下载云端存档包(session, item, (progress) => {
                setDownloadProgress(progress);
                setMessage(progress.message);
            });
            const save = payload.saves[0];
            if (!save) throw new Error('云端存档包内没有可读取的存档。');
            await dbService.导入存档数据({ saves: payload.saves }, { 覆盖现有: false });
            设置云端游玩存储模式('local');
            setStorageMode('tg');
            setMessage('已转换为本地存档，正在进入本地游玩...');
            await Promise.resolve(onLoadGame(save));
            onClose();
        } catch (error: any) {
            setMessage(`转换为本地游玩失败：${error?.message || '未知错误'}`);
        } finally {
            setDownloadProgress(null);
            setBusy('');
        }
    };

    const handleImportCloudSave = async (item: 云端存档摘要) => {
        if (!session) return;
        setBusy(`import:${item.cloudId}`);
        setDownloadProgress(null);
        setMessage('正在导入云端存档到本地...');
        try {
            const result = await 导入云端存档到本地(session, item);
            setMessage(`导入完成：新增 ${result.imported} 个，跳过重复 ${result.skipped} 个。`);
        } catch (error: any) {
            setMessage(`导入失败：${error?.message || '未知错误'}`);
        } finally {
            setDownloadProgress(null);
            setBusy('');
        }
    };

    const handleExportCloudSave = async (item: 云端存档摘要) => {
        if (!session) return;
        setBusy(`export:${item.cloudId}`);
        setMessage('正在准备本地下载文件...');
        try {
            await 保存云端存档为本地文件(session, item);
            setMessage('已开始下载云端存档 ZIP。');
        } catch (error: any) {
            setMessage(`导出失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleDeleteCloudSave = async (item: 云端存档摘要) => {
        if (!session) return;
        if (!window.confirm(`确定删除云端时间节点「${item.title} ${formatTime(item.savedAt)}」吗？如果它下面还有后续节点，系统会自动重写后续差分链。`)) return;
        setBusy(`delete:${item.cloudId}`);
        setMessage('正在删除云端时间节点并重写后续差分链...');
        try {
            const result = await 删除云端存档节点(session, item);
            setSession(result.session);
            setManifest(result.manifest);
            setMessage(result.rebased > 0
                ? `已删除该时间节点，并重写 ${result.rebased} 个后续节点的差分链。`
                : '已删除该云端时间节点。');
        } catch (error: any) {
            setMessage(`删除失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleRefreshObjectStorage = async () => {
        if (!objectStorageConfig) {
            await handleUseObjectStorage(false);
            return;
        }
        const requestId = objectRequestIdRef.current + 1;
        objectRequestIdRef.current = requestId;
        setObjectStorageRefreshing(true);
        setObjectStorageLoaded(false);
        setObjectStorageError('');
        setBusy('object-refresh');
        setMessage('正在刷新对象存储云端存档...');
        try {
            const list = await 列出对象存储云存档(objectStorageConfig);
            if (requestId !== objectRequestIdRef.current) return;
            setObjectStorageSaves(list);
            setObjectStorageError('');
            setMessage(list.length > 0 ? `已读取 ${list.length} 个对象存储云端存档。` : '对象存储云端暂无存档。');
        } catch (error: any) {
            if (requestId !== objectRequestIdRef.current) return;
            const errorMessage = error?.message || '未知错误';
            setObjectStorageError(errorMessage);
            setMessage(`刷新对象存储失败：${errorMessage}`);
        } finally {
            if (requestId === objectRequestIdRef.current) {
                setObjectStorageRefreshing(false);
                setObjectStorageLoaded(true);
                setBusy('');
            }
        }
    };

    const handleCopyLocalToObjectStorage = async () => {
        if (!objectStorageConfig) return;
        setBusy('object-copy');
        setObjectUploadProgress({ stage: 'directory', message: '正在准备复制本地存档到对象存储...' });
        setMessage('正在复制本地存档到对象存储...');
        try {
            const result = await 增量同步到对象存储(objectStorageConfig, undefined, (progress) => {
                setObjectUploadProgress(progress);
                setMessage(progress.message);
            });
            const list = await 列出对象存储云存档(objectStorageConfig);
            setObjectStorageSaves(list);
            setMessage(`复制完成：上传 ${result.uploaded} 个，跳过重复 ${result.skipped} 个，云端去重 ${result.deduped || 0} 个。`);
        } catch (error: any) {
            setMessage(`复制失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleLoadObjectStorageSave = async (item: 对象存储云存档元数据) => {
        if (!objectStorageConfig) return;
        设置云端游玩存储模式('object');
        setBusy(`object-load:${item.id}`);
        setMessage('正在读取对象存储云端存档...');
        try {
            const { save, saves } = await 下载对象存储云存档(objectStorageConfig, item, (progress) => setMessage(progress.message));
            await dbService.导入存档数据({ saves: saves.length > 0 ? saves : [save] }, { 覆盖现有: false }).catch((error) => {
                console.warn('对象存储云端游玩载入时写入本地谱系索引失败:', error);
            });
            await Promise.resolve(onLoadGame(save));
            onClose();
        } catch (error: any) {
            setMessage(`载入失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleConvertObjectStorageSaveToLocalPlay = async (item: 对象存储云存档元数据) => {
        if (!objectStorageConfig) return;
        setBusy(`object-local:${item.id}`);
        setMessage('正在下载对象存储云端存档并转换为本地游玩...');
        try {
            const { save, saves } = await 下载对象存储云存档(objectStorageConfig, item, (progress) => setMessage(progress.message));
            await dbService.导入存档数据({ saves: saves.length > 0 ? saves : [save] }, { 覆盖现有: false });
            设置云端游玩存储模式('local');
            setStorageMode('tg');
            setMessage('已转换为本地存档，正在进入本地游玩...');
            await Promise.resolve(onLoadGame(save));
            onClose();
        } catch (error: any) {
            setMessage(`转换为本地游玩失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleImportObjectStorageSave = async (item: 对象存储云存档元数据) => {
        if (!objectStorageConfig) return;
        setBusy(`object-import:${item.id}`);
        setMessage('正在导入对象存储云端存档到本地...');
        try {
            const { save } = await 下载对象存储云存档(objectStorageConfig, item, (progress) => setMessage(progress.message));
            const result = await dbService.导入存档数据({ saves: [save] }, { 覆盖现有: false });
            setMessage(`导入完成：新增 ${result.imported} 个，跳过重复 ${result.skipped} 个。`);
        } catch (error: any) {
            setMessage(`导入失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleExportObjectStorageSave = async (item: 对象存储云存档元数据) => {
        if (!objectStorageConfig) return;
        setBusy(`object-export:${item.id}`);
        setMessage('正在准备对象存储存档下载文件...');
        try {
            const { save } = await 下载对象存储云存档(objectStorageConfig, item, (progress) => setMessage(progress.message));
            const blob = await 导出ZIP存档文件({ saves: [save], includeImages: true });
            const safeTitle = (item.title || 'object-save').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 40) || 'object-save';
            const url = 创建并记录ObjectURL(blob, {
                source: 'CloudPlayModal.handleExportObjectStorageSave',
                kind: 'object-storage-save-export',
                detail: { saveId: item.id, title: item.title, hash: item.hash }
            });
            try {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `墨染江湖_对象存储存档_${safeTitle}_${(item.hash || item.id).slice(-8)}.zip`;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
            } finally {
                延迟释放并记录ObjectURL(url, {
                    source: 'CloudPlayModal.handleExportObjectStorageSave',
                    kind: 'object-storage-save-export',
                    detail: { reason: 'download-clicked', saveId: item.id }
                }, 1000);
            }
            setMessage('已开始下载对象存储存档 ZIP。');
        } catch (error: any) {
            setMessage(`导出失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleDeleteObjectStorageSave = async (item: 对象存储云存档元数据) => {
        if (!objectStorageConfig) return;
        if (!window.confirm(`确定删除对象存储云端存档「${item.title || '未知角色'} ${formatTime(item.syncedAt || item.savedAt)}」吗？这会从云端列表移除该节点。`)) return;
        setBusy(`object-delete:${item.id}`);
        setMessage('正在删除对象存储云端存档...');
        try {
            const result = await 删除对象存储云存档(objectStorageConfig, item, (progress) => setMessage(progress.message));
            setObjectStorageSaves(result.saves);
            setMessage(result.removed
                ? `已删除对象存储云端存档。${result.warnings.length ? `部分旧文件可能需稍后清理：${result.warnings[0]}` : ''}`
                : '未找到要删除的对象存储云端存档，列表已刷新。');
        } catch (error: any) {
            setMessage(`删除失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleDeleteCloudSaveSeries = async (series: { key: string; title: string; roots: 云端时间树节点[]; count: number }) => {
        if (!session) return;
        const allNodes = 扁平化云端树节点(series.roots);
        if (allNodes.length === 0) return;
        if (!window.confirm(`确定删除整个云端系列「${series.title}」吗？这将删除该系列下的全部 ${allNodes.length} 个存档节点，且不可恢复。`)) return;
        setBusy(`delete-series:${series.key}`);
        setMessage(`正在删除云端系列「${series.title}」的 ${allNodes.length} 个节点...`);
        try {
            let currentSession = session;
            let currentManifest: 云端存档清单 | null = null;
            let deleted = 0;
            for (const node of allNodes) {
                try {
                    const result = await 删除云端存档节点(currentSession, node);
                    currentSession = result.session;
                    currentManifest = result.manifest;
                    if (result.removed) deleted += 1;
                } catch {
                    // 单个节点删除失败时继续删除其他节点
                }
            }
            setSession(currentSession);
            if (currentManifest) setManifest(currentManifest);
            setSelectedCloudSeriesKey(null);
            setMessage(`已删除云端系列「${series.title}」中的 ${deleted}/${allNodes.length} 个节点。`);
        } catch (error: any) {
            setMessage(`删除系列失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const handleDeleteObjectStorageSaveSeries = async (series: { key: string; title: string; roots: 对象存储时间树节点[]; count: number }) => {
        if (!objectStorageConfig) return;
        const allNodes = 扁平化对象存储树节点(series.roots);
        if (allNodes.length === 0) return;
        if (!window.confirm(`确定删除对象存储系列「${series.title}」吗？这将删除该系列下的全部 ${allNodes.length} 个存档节点，且不可恢复。`)) return;
        setBusy(`object-delete-series:${series.key}`);
        setMessage(`正在删除对象存储系列「${series.title}」的 ${allNodes.length} 个节点...`);
        try {
            let currentSaves: 对象存储云存档元数据[] | null = null;
            let deleted = 0;
            let allWarnings: string[] = [];
            for (const node of allNodes) {
                try {
                    const result = await 删除对象存储云存档(objectStorageConfig, node, (progress) => setMessage(`${deleted + 1}/${allNodes.length}: ${progress.message}`));
                    if (result.removed) deleted += 1;
                    currentSaves = result.saves;
                    allWarnings.push(...result.warnings);
                } catch {
                    // 单个节点删除失败时继续删除其他节点
                }
            }
            if (currentSaves) setObjectStorageSaves(currentSaves);
            setSelectedObjectSeriesKey(null);
            const warningText = allWarnings.length ? ` 部分旧文件可能需稍后清理。` : '';
            setMessage(`已删除对象存储系列「${series.title}」中的 ${deleted}/${allNodes.length} 个节点。${warningText}`);
        } catch (error: any) {
            setMessage(`删除系列失败：${error?.message || '未知错误'}`);
        } finally {
            setBusy('');
        }
    };

    const renderObjectStorageCard = (item: 对象存储时间树节点): React.ReactNode => (
        <div className="w-[min(16rem,calc(100vw-4rem))] shrink-0 snap-start border border-sky-400/15 bg-black/25 px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-serif text-sm font-bold text-paper-white">{item.title || '未知角色'}</span>
                <span className={`border px-1.5 py-0.5 text-[10px] ${item.seriesId ? 'border-emerald-400/25 text-emerald-200' : 'border-amber-400/25 text-amber-200'}`}>
                    {item.seriesId ? '新谱系' : '旧存档'}
                </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-gray-400">
                {item.type === 'auto' ? '自动存档' : '手动存档'} · 第 {Math.max(0, Math.floor(Number(item.turnCount || 0)))} 回合 · {item.location || '未知地点'} · {item.gameTime || '未知时间'}
            </div>
            <div className="text-[11px] text-gray-500">
                {formatTime(item.syncedAt || item.savedAt)} · {formatBytes(item.size)} · #{(item.hash || item.id).slice(-8)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" disabled={busy === `object-load:${item.id}`} onClick={() => { void handleLoadObjectStorageSave(item); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-2.5 py-1.5 text-xs text-wuxia-gold hover:bg-wuxia-gold/20 disabled:opacity-50">
                    {busy === `object-load:${item.id}` ? '读取中...' : '选择游玩'}
                </button>
                <button type="button" disabled={busy === `object-import:${item.id}`} onClick={() => { void handleImportObjectStorageSave(item); }} className="border border-emerald-400/30 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50">
                    导入
                </button>
                <button type="button" disabled={busy === `object-local:${item.id}`} onClick={() => { void handleConvertObjectStorageSaveToLocalPlay(item); }} className="border border-amber-300/35 bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-400/15 disabled:opacity-50">
                    {busy === `object-local:${item.id}` ? '转换中...' : '转本地游玩'}
                </button>
                <button type="button" disabled={busy === `object-export:${item.id}`} onClick={() => { void handleExportObjectStorageSave(item); }} className="border border-sky-400/30 px-2.5 py-1.5 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">
                    下载
                </button>
                <button type="button" disabled={busy === `object-delete:${item.id}`} onClick={() => { void handleDeleteObjectStorageSave(item); }} className="border border-red-400/30 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                    {busy === `object-delete:${item.id}` ? '删除中...' : '删除'}
                </button>
            </div>
        </div>
    );

    const renderCloudCard = (item: 云端时间树节点): React.ReactNode => (
        <div className="w-[min(16rem,calc(100vw-4rem))] shrink-0 snap-start border border-wuxia-gold/15 bg-black/25 px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-serif text-sm font-bold text-paper-white">{item.title}</span>
                {item.packageFormat === 'delta' && <span className="border border-emerald-400/20 px-1.5 py-0.5 text-[10px] text-emerald-200">差分</span>}
                {item.packageFormat === 'snapshot' && <span className="border border-sky-400/20 px-1.5 py-0.5 text-[10px] text-sky-200">快照</span>}
                <span className={`border px-1.5 py-0.5 text-[10px] ${item.seriesId ? 'border-emerald-400/25 text-emerald-200' : 'border-amber-400/25 text-amber-200'}`}>
                    {item.seriesId ? '新谱系' : '旧存档'}
                </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-gray-400">
                {item.type === 'auto' ? '自动存档' : '手动存档'} · 第 {Math.max(0, Math.floor(Number(item.turnCount || 0)))} 回合 · {item.location} · {item.gameTime}
            </div>
            <div className="text-[11px] text-gray-500">
                {formatTime(item.savedAt)} · {formatBytes(item.packageSize)} · #{item.syncHash.slice(0, 8)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" disabled={busy === `load:${item.cloudId}`} onClick={() => { void handleLoadCloudSave(item); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-2.5 py-1.5 text-xs text-wuxia-gold hover:bg-wuxia-gold/20 disabled:opacity-50">
                    {busy === `load:${item.cloudId}` ? '读取中...' : '选择游玩'}
                </button>
                <button type="button" disabled={busy === `import:${item.cloudId}`} onClick={() => { void handleImportCloudSave(item); }} className="border border-emerald-400/30 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50">
                    导入
                </button>
                <button type="button" disabled={busy === `local:${item.cloudId}`} onClick={() => { void handleConvertCloudSaveToLocalPlay(item); }} className="border border-amber-300/35 bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-400/15 disabled:opacity-50">
                    {busy === `local:${item.cloudId}` ? '转换中...' : '转本地游玩'}
                </button>
                <button type="button" disabled={busy === `export:${item.cloudId}`} onClick={() => { void handleExportCloudSave(item); }} className="border border-sky-400/30 px-2.5 py-1.5 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">
                    下载
                </button>
                <button type="button" disabled={busy === `delete:${item.cloudId}`} onClick={() => { void handleDeleteCloudSave(item); }} className="border border-red-400/30 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                    {busy === `delete:${item.cloudId}` ? '删除中...' : '删除'}
                </button>
            </div>
        </div>
    );

    const renderObjectStorageTimeline = (items: 对象存储时间树节点[]): React.ReactNode => (
        <div className="inline-flex min-w-full snap-x snap-mandatory items-start gap-0 px-1">
            {items.map((item, index) => (
                <React.Fragment key={item.id || item.hash || index}>
                    {index > 0 && (
                        <div className="flex w-14 shrink-0 items-center pt-16 sm:w-20" aria-hidden="true">
                            <div className="h-px flex-1 bg-sky-400/40" />
                            <div className="h-2 w-2 rotate-45 border-r border-t border-sky-300/75" />
                        </div>
                    )}
                    {renderObjectStorageCard(item)}
                </React.Fragment>
            ))}
        </div>
    );

    const renderCloudNode = (item: 云端时间树节点, root = false): React.ReactNode => (
        <div key={item.cloudId} className="inline-flex flex-col items-start">
            <div className="flex items-center">
                {!root && (
                    <div className="flex w-14 shrink-0 items-center sm:w-20" aria-hidden="true">
                        <div className="h-px flex-1 bg-wuxia-gold/40" />
                        <div className="h-2 w-2 rotate-45 border-r border-t border-wuxia-gold/75" />
                    </div>
                )}
                {renderCloudCard(item)}
            </div>
            {item.children.length > 0 && (
                <div className="ml-28 mt-3 flex items-start gap-4 border-t border-wuxia-gold/20 pt-3 sm:ml-32">
                    {item.children.map((child) => renderCloudNode(child))}
                </div>
            )}
        </div>
    );

    const disabled = Boolean(busy);

    return (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-wuxia-gold/30 bg-ink-black/95 text-paper-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-wuxia-gold/20 px-5 py-4">
                <div>
                    <div className="font-serif text-lg font-bold tracking-[0.2em] text-wuxia-gold">云端游玩</div>
                    <div className="mt-1 text-xs text-gray-400">这里只显示云端存档；保存时会先写入本地，再后台同步到云端。</div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-9 w-9 border border-red-400/40 bg-red-900/40 text-red-100 transition-colors hover:bg-red-800/70"
                    title="关闭"
                >
                    X
                </button>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                {!riskAccepted ? (
                    <div className="mx-auto max-w-2xl border border-amber-400/35 bg-amber-950/30 p-5">
                        <div className="font-serif text-base font-bold tracking-[0.16em] text-amber-200">风险提示</div>
                        <p className="mt-4 text-sm leading-7 text-amber-50">{云端游玩风险提示文本}</p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button type="button" onClick={onClose} className="border border-gray-500/50 px-4 py-2 text-sm text-gray-200 hover:bg-white/5">
                                取消
                            </button>
                            <button type="button" onClick={handleAcceptRisk} className="border border-amber-300/50 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-500/25">
                                我已了解风险
                            </button>
                            <button type="button" disabled={busy === 'object-storage-check'} onClick={() => { void handleUseObjectStorage(); }} className="border border-sky-300/50 bg-sky-500/15 px-4 py-2 text-sm font-bold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50">
                                {busy === 'object-storage-check' ? '检查中...' : '我不用TG图床存储，我要用自己的对象存储'}
                            </button>
                        </div>
                    </div>
                ) : storageMode === 'object' ? (
                    <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border border-sky-400/20 bg-sky-500/10 px-4 py-3">
                            <div>
                                <div className="text-sm text-sky-100">当前使用：自己的对象存储</div>
                                <div className="mt-1 text-xs text-sky-100/60">{objectStorageConfig?.bucket || '未配置'} · {objectStorageConfig?.prefix || 'MoRanJiangHu'}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {onStartNewGame && (
                                    <button type="button" onClick={handleStartNewCloudSave} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                        开启新存档
                                    </button>
                                )}
                                <button type="button" disabled={objectStorageRefreshing} onClick={() => { void handleRefreshObjectStorage(); }} className="border border-sky-400/35 px-3 py-2 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">
                                    {objectStorageRefreshing ? '刷新中...' : '刷新云存档'}
                                </button>
                                <button type="button" disabled={busy === 'object-copy'} onClick={() => { void handleCopyLocalToObjectStorage(); }} className="border border-emerald-400/35 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50">
                                    本地一键复制到对象存储
                                </button>
                                <button type="button" disabled={busy === 'object-storage-check'} onClick={() => { 启用对象存储云端游玩模式(); onConfigureObjectStorage?.(); }} className="border border-gray-500/40 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 disabled:opacity-50">
                                    修改对象存储配置
                                </button>
                                <button type="button" disabled={busy === 'object-storage-check'} onClick={handleUseTgStorage} className="border border-amber-400/35 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/10 disabled:opacity-50">
                                    切换到TG图床
                                </button>
                            </div>
                        </div>

                        {objectUploadProgress && busy === 'object-copy' && (
                            <div className="border border-sky-400/25 bg-sky-950/20 px-4 py-3 text-sm text-sky-50">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{objectUploadProgress.message}</span>
                                    <span className="text-xs text-sky-100/70">
                                        {objectUploadProgress.current && objectUploadProgress.total ? `${objectUploadProgress.current}/${objectUploadProgress.total}` : objectUploadProgress.stage}
                                    </span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                                    <div
                                        className="h-full rounded-full bg-sky-300 transition-all duration-300"
                                        style={{ width: `${估算对象存储复制进度(objectUploadProgress)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {session && <CloudSettingsSyncPanel />}

                        <div className="grid gap-4">
                            {(objectStorageRefreshing || (!objectStorageLoaded && !objectStorageError)) && objectStorageSaveTrees.length <= 0 ? (
                                <div role="status" aria-live="polite" className="border border-dashed border-sky-400/30 bg-sky-950/10 px-4 py-8 text-center text-sm text-sky-100">
                                    正在读取对象存储云端存档…
                                </div>
                            ) : objectStorageError && objectStorageSaveTrees.length <= 0 ? (
                                <div className="border border-dashed border-red-400/30 bg-red-950/10 px-4 py-8 text-center text-sm text-red-100">
                                    读取对象存储云端存档失败：{objectStorageError}
                                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                                        <button type="button" onClick={() => { void handleRefreshObjectStorage(); }} className="border border-sky-400/40 bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/25">
                                            重试读取
                                        </button>
                                        {onConfigureObjectStorage && (
                                            <button type="button" onClick={() => { 启用对象存储云端游玩模式(); onConfigureObjectStorage(); }} className="border border-gray-500/40 px-4 py-2 text-xs text-gray-200 hover:bg-white/5">
                                                修改对象存储配置
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : objectStorageSaveTrees.length <= 0 ? (
                                <div className="border border-dashed border-sky-400/25 px-4 py-8 text-center text-sm text-gray-400">
                                    对象存储云端暂无存档。这里不混入本地存档；可以开启新存档，或先把本地存档复制到对象存储。
                                    {onStartNewGame && (
                                        <button type="button" onClick={handleStartNewCloudSave} className="mx-auto mt-4 block border border-wuxia-gold/40 bg-wuxia-gold/10 px-4 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                            开启新存档
                                        </button>
                                    )}
                                </div>
                            ) : selectedObjectSeries ? (
                                <div className="min-w-0 border border-sky-400/20 bg-black/15 p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-sky-400/10 pb-2">
                                        <div>
                                            <div className="font-serif text-sm font-bold tracking-[0.12em] text-sky-100">{selectedObjectSeries.title}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">
                                                进度点 {selectedObjectSeries.displayCount} 个 · 云端节点 {selectedObjectSeries.count} 个 · 云端包合计 {formatBytes(selectedObjectSeries.totalBytes)} · 最新 {formatTime(selectedObjectSeries.latest?.syncedAt || selectedObjectSeries.latest?.savedAt)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => { void handleLoadObjectStorageSave(selectedObjectSeries.latest); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                                读取最新
                                            </button>
                                            <button type="button" onClick={() => { void handleConvertObjectStorageSaveToLocalPlay(selectedObjectSeries.latest); }} className="border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/15">
                                                转为本地存档并本地游玩
                                            </button>
                                            <button type="button" onClick={() => setSelectedObjectSeriesKey(null)} className="border border-gray-500/40 px-3 py-2 text-xs text-gray-200 hover:bg-white/5">
                                                返回系列列表
                                            </button>
                                        </div>
                                    </div>
                                    <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-3 touch-pan-x custom-scrollbar">
                                        {renderObjectStorageTimeline(selectedObjectTimeline)}
                                    </div>
                                </div>
                            ) : (
                                objectStorageSaveTrees.map((series) => (
                                    <div key={series.key} className="min-w-0 border border-sky-400/20 bg-black/15 p-3">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-sky-400/10 pb-2">
                                            <div>
                                                <div className="font-serif text-sm font-bold tracking-[0.12em] text-sky-100">{series.title}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">
                                                    进度点 {series.displayCount} 个 · 云端节点 {series.count} 个 · 云端包合计 {formatBytes(series.totalBytes)} · 最新 {formatTime(series.latest?.syncedAt || series.latest?.savedAt)}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => { void handleLoadObjectStorageSave(series.latest); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                                    读取最新
                                                </button>
                                                <button type="button" onClick={() => { void handleConvertObjectStorageSaveToLocalPlay(series.latest); }} className="border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/15">
                                                    转本地游玩
                                                </button>
                                                <button type="button" onClick={() => setSelectedObjectSeriesKey(series.key)} className="border border-sky-400/35 px-3 py-2 text-xs text-sky-100 hover:bg-sky-500/10">
                                                    选择节点
                                                </button>
                                                <button type="button" disabled={busy === `object-delete-series:${series.key}`} onClick={() => { void handleDeleteObjectStorageSaveSeries(series); }} className="border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                                                    {busy === `object-delete-series:${series.key}` ? '删除中...' : '删除系列'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-gray-500">同一角色的对象存储云端节点已整理为连续进度线；此处不显示本地存档，重复自动节点会自动收敛。</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : !session ? (
                    <div className="mx-auto max-w-md border border-wuxia-gold/20 bg-black/35 p-5">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setMode('login')} className={`flex-1 border px-3 py-2 text-sm ${mode === 'login' ? 'border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold' : 'border-gray-600 text-gray-300'}`}>
                                登录
                            </button>
                            <button type="button" onClick={() => setMode('register')} className={`flex-1 border px-3 py-2 text-sm ${mode === 'register' ? 'border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold' : 'border-gray-600 text-gray-300'}`}>
                                注册
                            </button>
                        </div>
                        <label className="mt-5 block text-xs tracking-[0.16em] text-gray-400">用户名</label>
                        <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-sm text-paper-white outline-none focus:border-wuxia-gold" />
                        <label className="mt-4 block text-xs tracking-[0.16em] text-gray-400">密码</label>
                        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="mt-2 w-full border border-wuxia-gold/20 bg-black/50 px-3 py-2 text-sm text-paper-white outline-none focus:border-wuxia-gold" />
                        <button type="button" disabled={disabled} onClick={() => { void handleAuth(); }} className="mt-5 w-full border border-wuxia-gold/40 bg-wuxia-gold/15 px-4 py-3 font-serif text-sm font-bold tracking-[0.18em] text-wuxia-gold hover:bg-wuxia-gold/25 disabled:opacity-50">
                            {busy === 'auth' ? '处理中...' : mode === 'register' ? '注册并进入' : '登录云端'}
                        </button>
                        <button type="button" disabled={busy === 'object-storage-check'} onClick={() => { void handleUseObjectStorage(); }} className="mt-3 w-full border border-sky-400/35 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50">
                            切换到自己的对象存储
                        </button>
                    </div>
                ) : (
                    <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border border-wuxia-gold/15 bg-black/30 px-4 py-3">
                            <div>
                                <div className="text-sm text-wuxia-gold">当前账号：{session.username}</div>
                                <div className="mt-1 text-xs text-gray-500">ID：{session.userId}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {onStartNewGame && (
                                    <button type="button" onClick={handleStartNewCloudSave} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                        开启新存档
                                    </button>
                                )}
                                <button type="button" disabled={manifestLoading} onClick={() => { void refreshManifest(); }} className="border border-sky-400/35 px-3 py-2 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">
                                    刷新云存档
                                </button>
                                <button type="button" disabled={busy === 'settings-sync'} onClick={() => { void handleSyncSettings(); }} className="border border-violet-400/35 px-3 py-2 text-xs text-violet-100 hover:bg-violet-500/10 disabled:opacity-50">
                                    {busy === 'settings-sync' ? '设置同步中...' : '同步全部设置'}
                                </button>
                                <button type="button" disabled={busy === 'copy'} onClick={() => { void handleCopyLocal(); }} className="border border-emerald-400/35 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50">
                                    本地一键复制到云端
                                </button>
                                <button type="button" onClick={handleLogout} className="border border-gray-500/40 px-3 py-2 text-xs text-gray-200 hover:bg-white/5">
                                    退出账号
                                </button>
                                <button type="button" disabled={busy === 'object-storage-check'} onClick={() => { void handleUseObjectStorage(); }} className="border border-sky-400/35 px-3 py-2 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50">
                                    切换到对象存储
                                </button>
                            </div>
                        </div>

                        <CloudSettingsSyncPanel />

                        {uploadProgress && busy === 'copy' && (
                            <div className="border border-emerald-400/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-50">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{uploadProgress.message}</span>
                                    <span className="text-xs text-emerald-100/70">
                                        {uploadProgress.current && uploadProgress.total ? `${uploadProgress.current}/${uploadProgress.total} · ` : ''}
                                        {uploadProgress.attempt ? `第 ${uploadProgress.attempt}/${uploadProgress.maxAttempts || uploadProgress.attempt} 次 · ` : ''}
                                        {uploadProgress.uploadBytes ? formatBytes(uploadProgress.uploadBytes) : ''}
                                    </span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                                    <div
                                        className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                                        style={{ width: `${估算云端复制进度(uploadProgress)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {downloadProgress && busy.startsWith('load:') && (
                            <div className="border border-sky-400/25 bg-sky-950/20 px-4 py-3 text-sm text-sky-50">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{downloadProgress.message}</span>
                                    <span className="text-xs text-sky-100/70">
                                        {downloadProgress.current && downloadProgress.total ? `${downloadProgress.current}/${downloadProgress.total} · ` : ''}
                                        {downloadProgress.attempt ? `第 ${downloadProgress.attempt}/${downloadProgress.maxAttempts || downloadProgress.attempt} 次` : ''}
                                    </span>
                                </div>
                                <div className="mt-2 text-xs leading-6 text-sky-100/70">
                                    TG 图床偶尔会短暂返回 500，系统会自动重试；只要这里仍在显示读取进度，请先等待完成。
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4">
                            {(manifestLoading || (!manifestLoaded && !manifestError && Boolean(session) && riskAccepted && storageMode === 'tg')) && cloudSaveTrees.length <= 0 ? (
                                <div role="status" aria-live="polite" className="border border-dashed border-sky-400/30 bg-sky-950/10 px-4 py-8 text-center text-sm text-sky-100">
                                    正在读取云端存档…
                                </div>
                            ) : manifestError && cloudSaveTrees.length <= 0 ? (
                                <div className="border border-dashed border-red-400/30 bg-red-950/10 px-4 py-8 text-center text-sm text-red-100">
                                    读取云端存档失败：{manifestError}
                                    <button type="button" onClick={() => { void refreshManifest(); }} className="mx-auto mt-4 block border border-sky-400/40 bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/25">
                                        重试读取
                                    </button>
                                </div>
                            ) : cloudSaveTrees.length <= 0 ? (
                                <div className="border border-dashed border-wuxia-gold/25 px-4 py-8 text-center text-sm text-gray-400">
                                    暂无云端存档。这里不混入本地存档；可以开启新存档，或先把本地存档复制到云端。
                                    {onStartNewGame && (
                                        <button type="button" onClick={handleStartNewCloudSave} className="mx-auto mt-4 block border border-wuxia-gold/40 bg-wuxia-gold/10 px-4 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                            开启新存档
                                        </button>
                                    )}
                                </div>
                            ) : selectedCloudSeries ? (
                                <div className="min-w-0 border border-wuxia-gold/20 bg-black/15 p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-wuxia-gold/10 pb-2">
                                        <div>
                                            <div className="font-serif text-sm font-bold tracking-[0.12em] text-wuxia-gold">{selectedCloudSeries.title}</div>
                                            <div className="mt-1 text-[11px] text-gray-500">
                                                时间树 {selectedCloudSeries.count} 个节点 · 云端包合计 {formatBytes(selectedCloudSeries.totalBytes)} · 最新 {formatTime(selectedCloudSeries.latest?.savedAt)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => { void handleLoadCloudSave(selectedCloudSeries.latest); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                                读取最新
                                            </button>
                                            <button type="button" onClick={() => { void handleConvertCloudSaveToLocalPlay(selectedCloudSeries.latest); }} className="border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/15">
                                                转为本地存档并本地游玩
                                            </button>
                                            <button type="button" onClick={() => setSelectedCloudSeriesKey(null)} className="border border-gray-500/40 px-3 py-2 text-xs text-gray-200 hover:bg-white/5">
                                                返回系列列表
                                            </button>
                                        </div>
                                    </div>
                                    <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain pb-3 touch-pan-x custom-scrollbar">
                                        <div className="inline-flex min-w-full snap-x snap-mandatory items-start gap-4 px-1">
                                            {selectedCloudSeries.roots.map((root) => renderCloudNode(root, true))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                cloudSaveTrees.map((series) => (
                                    <div key={series.key} className="min-w-0 border border-wuxia-gold/20 bg-black/15 p-3">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-wuxia-gold/10 pb-2">
                                            <div>
                                                <div className="font-serif text-sm font-bold tracking-[0.12em] text-wuxia-gold">{series.title}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">
                                                    时间树 {series.count} 个节点 · 云端包合计 {formatBytes(series.totalBytes)} · 最新 {formatTime(series.latest?.savedAt)}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => { void handleLoadCloudSave(series.latest); }} className="border border-wuxia-gold/40 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/20">
                                                    读取最新
                                                </button>
                                                <button type="button" onClick={() => { void handleConvertCloudSaveToLocalPlay(series.latest); }} className="border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/15">
                                                    转本地游玩
                                                </button>
                                                <button type="button" onClick={() => setSelectedCloudSeriesKey(series.key)} className="border border-sky-400/35 px-3 py-2 text-xs text-sky-100 hover:bg-sky-500/10">
                                                    选择节点
                                                </button>
                                                <button type="button" disabled={busy === `delete-series:${series.key}`} onClick={() => { void handleDeleteCloudSaveSeries(series); }} className="border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                                                    {busy === `delete-series:${series.key}` ? '删除中...' : '删除系列'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-gray-500">同一起始存档已归并为一个云端系列；此处不显示本地存档，选择节点后可读取任意时间树节点。</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {settingsSyncProgress && busy === 'settings-sync' && (
                <div className="border-t border-violet-400/15 bg-violet-950/20 px-5 py-2 text-xs text-violet-100">
                    设置同步：{settingsSyncProgress.message}
                    {settingsSyncProgress.settingCount ? ` · ${settingsSyncProgress.settingCount} 项设置` : ''}
                    {settingsSyncProgress.assetCount ? ` · ${settingsSyncProgress.assetCount} 张图片` : ''}
                </div>
            )}
            {message && (
                <div className="border-t border-wuxia-gold/15 bg-black/50 px-5 py-3 text-sm text-gray-200">
                    {message}
                </div>
            )}
        </div>
    );
};

export default CloudPlayModal;
