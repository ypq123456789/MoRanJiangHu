import React from 'react';
import {
    订阅云端设置同步状态,
    读取云端设置同步状态,
    上传本机设置,
    拉取云端设置,
    type 云端设置同步状态
} from '../../../services/cloudSettingsSync';

/**
 * 云端设置同步状态面板
 *
 * 类似旧存档谱系迁移的状态条：实时展示后台静默同步的进度、统计与错误，
 * 并提供手动「立即同步 / 拉取云端」按钮。数据来自全局同步状态订阅，
 * 后台静默同步（防抖上传、前台拉取）也会实时反映到这里。
 */

const 阶段文案: Record<云端设置同步状态['stage'], string> = {
    idle: '空闲',
    collect: '整理设置',
    encrypt: '加密中',
    upload: '上传中',
    download: '拉取云端',
    decrypt: '解密中',
    merge: '合并中',
    done: '已完成',
    error: '失败'
};

const 阶段样式: Record<云端设置同步状态['stage'], string> = {
    idle: 'border-slate-600/60 text-gray-300 bg-black/40',
    collect: 'border-violet-500/50 text-violet-200 bg-violet-950/30',
    encrypt: 'border-violet-500/50 text-violet-200 bg-violet-950/30',
    upload: 'border-violet-400/60 text-violet-100 bg-violet-950/40',
    download: 'border-sky-500/50 text-sky-200 bg-sky-950/30',
    decrypt: 'border-sky-500/50 text-sky-200 bg-sky-950/30',
    merge: 'border-sky-500/50 text-sky-200 bg-sky-950/30',
    done: 'border-emerald-600/50 text-emerald-300 bg-emerald-950/25',
    error: 'border-red-700/60 text-red-300 bg-red-950/30'
};

const 阶段进度: Record<云端设置同步状态['stage'], number> = {
    idle: 0,
    collect: 10,
    download: 25,
    decrypt: 40,
    merge: 55,
    encrypt: 70,
    upload: 85,
    done: 100,
    error: 100
};

const 格式化时间 = (value?: string): string => {
    if (!value) return '未记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未记录';
    const pad2 = (num: number) => Math.trunc(num).toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

const 统计项: React.FC<{ label: string; value: React.ReactNode; tone?: 'normal' | 'good' | 'warn' | 'danger' }> = ({ label, value, tone = 'normal' }) => {
    const toneClass = {
        normal: 'border-violet-400/15 bg-black/35 text-gray-200',
        good: 'border-emerald-900/40 bg-emerald-950/10 text-emerald-300',
        warn: 'border-amber-900/40 bg-amber-950/10 text-amber-300',
        danger: 'border-red-900/40 bg-red-950/10 text-red-300'
    }[tone];
    return (
        <div className={`rounded border ${toneClass} p-2`}>
            <div className="text-[10px] text-violet-200/50 tracking-widest font-serif">{label}</div>
            <div className="text-base font-semibold mt-1">{value}</div>
        </div>
    );
};

const CloudSettingsSyncPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const [status, setStatus] = React.useState<云端设置同步状态>(() => 读取云端设置同步状态());
    const [manualBusy, setManualBusy] = React.useState<'' | 'sync' | 'pull'>('');

    React.useEffect(() => 订阅云端设置同步状态((next) => setStatus(next)), []);

    const running = status.running || manualBusy !== '';
    const percent = status.stage === 'idle' ? 0 : 阶段进度[status.stage];
    const isActive = running && status.stage !== 'done' && status.stage !== 'error' && status.stage !== 'idle';

    const handleSync = async () => {
        if (running) return;
        setManualBusy('sync');
        try {
            await 上传本机设置();
        } catch (error: any) {
            console.warn('手动设置同步失败:', error);
        } finally {
            setManualBusy('');
        }
    };

    const handlePull = async () => {
        if (running) return;
        setManualBusy('pull');
        try {
            await 拉取云端设置();
        } catch (error: any) {
            console.warn('手动拉取云端设置失败:', error);
        } finally {
            setManualBusy('');
        }
    };

    return (
        <div className="rounded border border-violet-400/25 bg-black/40 p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-serif text-sm tracking-[0.16em] text-violet-200">设置云同步</div>
                <div className="flex items-center gap-2">
                    {status.pendingUpload && (
                        <span className="rounded-full border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-300">
                            待重试
                        </span>
                    )}
                    <span className={`rounded-full border px-3 py-1 text-xs font-serif tracking-wider ${阶段样式[status.stage]} ${isActive ? 'animate-pulse' : ''}`}>
                        {阶段文案[status.stage]}
                    </span>
                </div>
            </div>

            <div className="mt-2 text-xs text-gray-400">
                登录后所有设置（含自定义开局预设、图片资源）自动加密同步到云端账号；后台同步无需手动操作。
            </div>

            <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                    <span className="min-w-0 truncate">{status.message || (running ? '同步中...' : '后台静默同步，无操作需要') }</span>
                    {status.changed > 0 && <span className="shrink-0 text-violet-200/80">恢复 {status.changed} 项</span>}
                </div>
                <div className="h-2 rounded-full bg-black/70 border border-violet-400/10 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${status.stage === 'error' ? 'bg-red-500/80' : 'bg-violet-400/80'} ${isActive ? 'animate-pulse' : ''}`}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>

            {!compact && (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <统计项 label="设置项" value={status.settingCount} />
                    <统计项 label="图片资源" value={status.assetCount} />
                    <统计项
                        label="最近上传"
                        value={<span className="text-sm font-normal">{格式化时间(status.lastUploadAt)}</span>}
                        tone={status.lastUploadAt ? 'good' : 'normal'}
                    />
                    <统计项
                        label="最近下载"
                        value={<span className="text-sm font-normal">{格式化时间(status.lastDownloadAt)}</span>}
                        tone={status.lastDownloadAt ? 'good' : 'normal'}
                    />
                </div>
            )}

            {status.lastError && (
                <div className="mt-3 rounded border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300 break-words">
                    最近错误：{status.lastError}
                </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={running}
                    onClick={() => { void handleSync(); }}
                    className="border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/20 disabled:opacity-50"
                >
                    {manualBusy === 'sync' ? '同步中...' : '立即同步'}
                </button>
                <button
                    type="button"
                    disabled={running}
                    onClick={() => { void handlePull(); }}
                    className="border border-sky-400/35 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/10 disabled:opacity-50"
                >
                    {manualBusy === 'pull' ? '拉取中...' : '从云端拉取'}
                </button>
            </div>
        </div>
    );
};

export default CloudSettingsSyncPanel;
