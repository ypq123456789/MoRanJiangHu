import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    接口设置结构,
    功能模型占位配置结构,
    小说拆分分段结构,
    小说拆分事件结构,
    小说拆分信息可见性结构,
    小说拆分可见信息条目结构,
    小说拆分角色推进结构,
    小说拆分来源类型,
    小说拆分树节点结构,
    小说拆分注入目标类型
} from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import {
    读取小说拆分任务列表,
    读取小说拆分数据集列表,
    获取小说拆分任务状态文本,
    获取小说拆分任务摘要,
    筛选可后台续跑任务,
    创建空小说拆分数据集,
    创建小说拆分任务,
    写入小说拆分数据集,
    写入小说拆分任务,
    更新小说拆分任务进度,
    更新小说拆分任务状态,
    删除小说拆分任务,
    删除小说拆分数据集,
    读取小说拆分注入快照列表,
    设置小说拆分激活数据集,
    导出小说拆分分享数据,
    导入小说拆分分享数据,
    保存小说拆分注入快照列表
} from '../../../services/novelDecompositionStore';
import { 小说拆分后台调度服务, type 小说拆分调度状态结构 } from '../../../services/novelDecompositionScheduler';
import { 初始化小说拆分运行时, 请求中断小说拆分任务 } from '../../../services/novelDecompositionRuntime';
import { 构建全部小说拆分注入快照 } from '../../../services/novelDecompositionInjection';
import { 从EPUB文件提取小说内容 } from '../../../services/epubImport';
import { 从原始文本提取章节, 根据章节生成分段列表, 聚合小说拆分数据集 } from '../../../services/novelDecompositionPipeline';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    onNotify?: (toast: { title: string; message: string; tone?: 'info' | 'success' | 'error' }) => void;
    mode?: 'desktop' | 'mobile';
}

interface 分段编辑草稿 {
    标题: string;
    本组概括文本: string;
    开局已成立事实文本: string;
    前组延续事实文本: string;
    本组结束状态文本: string;
    给下一组参考文本: string;
    原著硬约束: 小说拆分可见信息条目结构[];
    可提前铺垫: 小说拆分可见信息条目结构[];
    登场角色文本: string;
    时间线起点: string;
    时间线终点: string;
    关键事件: 小说拆分事件结构[];
    角色推进: 小说拆分角色推进结构[];
}

const 来源类型文本映射: Record<小说拆分来源类型, string> = {
    novel: '普通小说',
    txt: 'TXT 导入',
    epub: 'EPUB 导入',
    shared_json: '分享 ZIP'
};

const 注入目标文本映射: Record<小说拆分注入目标类型, string> = {
    main_story: '主剧情',
    planning: '规划分析',
    world_evolution: '世界演变'
};

const 树节点类型文本映射: Record<小说拆分树节点结构['类型'], string> = {
    summary: '总览节点',
    stage_summary: '阶段概括',
    timeline_group: '时间线分组',
    timeline_event: '时间线事件',
    segment_group: '分段分组',
    segment: '分段节点'
};

const 列表项前缀正则 = /^(?:\[\d+\]\s*|[-*•]\s*|\d+[.)、]\s*)/;
const 统计括号差值 = (value: string): number => {
    let balance = 0;
    for (const char of (value || '')) {
        if (char === '(' || char === '（') balance += 1;
        if (char === ')' || char === '）') balance -= 1;
    }
    return balance;
};
const 存在未闭合括号 = (value: string): boolean => 统计括号差值(value) > 0;
const 标准化列表项文本 = (value: string): string => (value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([（(])/g, '$1')
    .replace(/\s*([)）])/g, '$1')
    .trim();

const 格式化索引列表文本 = (items: string[]): string => (
    (Array.isArray(items) ? items : [])
        .map((item) => String(item || '').replace(/\r\n/g, '\n').trim())
        .filter(Boolean)
        .map((item, index) => {
            const lines = item.split('\n').map((line) => line.trim()).filter(Boolean);
            if (lines.length <= 1) return `[${index + 1}] ${item}`;
            return [
                `[${index + 1}] ${lines[0]}`,
                ...lines.slice(1).map((line) => `    ${line}`)
            ].join('\n');
        })
        .join('\n')
);

const 解析索引列表文本 = (value: string): string[] => {
    const result: string[] = [];
    let current = '';
    const lines = (value || '').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        const normalized = line.replace(列表项前缀正则, '').trim();
        if (!normalized || /^无$/i.test(normalized)) return;
        if (列表项前缀正则.test(line)) {
            if (current && 存在未闭合括号(current)) {
                current = `${current} ${normalized}`.trim();
                return;
            }
            if (current) result.push(标准化列表项文本(current));
            current = normalized;
            return;
        }
        if (current && 存在未闭合括号(current)) {
            current = `${current} ${normalized}`.trim();
            return;
        }
        normalized
            .split(/[、，,；;]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => {
                if (current) {
                    result.push(标准化列表项文本(current));
                    current = '';
                }
                result.push(标准化列表项文本(item));
            });
    });
    if (current) {
        result.push(标准化列表项文本(current));
    }
    return result;
};

const 合并同名登场角色文本列表 = (items: string[]): string[] => {
    const ordered: Array<{ 名字: string; 身份列表: string[]; order: number }> = [];
    const indexMap = new Map<string, number>();

    (Array.isArray(items) ? items : []).forEach((item, index) => {
        const raw = 标准化列表项文本(String(item || ''));
        if (!raw) return;
        const matched = raw.match(/^(.+?)[（(]\s*([\s\S]+?)\s*[)）]$/u);
        const 名字 = (matched?.[1] || raw).trim();
        const 身份 = (matched?.[2] || '').trim();
        if (!名字) return;
        const existingIndex = indexMap.get(名字);
        if (typeof existingIndex === 'number') {
            if (身份 && !ordered[existingIndex].身份列表.includes(身份)) {
                ordered[existingIndex].身份列表.push(身份);
            }
            return;
        }
        indexMap.set(名字, ordered.length);
        ordered.push({
            名字,
            身份列表: 身份 ? [身份] : [],
            order: index
        });
    });

    return ordered
        .sort((a, b) => a.order - b.order)
        .map((item) => (item.身份列表.length > 0 ? `${item.名字}(${item.身份列表.join(' / ')})` : item.名字));
};

const 输入框样式 = 'w-full border border-gray-700 bg-black/50 p-2 text-white rounded-md outline-none focus:border-emerald-400';
const 文本域样式 = 'w-full border border-gray-700 bg-black/50 p-3 text-white rounded-md outline-none focus:border-emerald-400 resize-y';
const 格式化逐行列表文本 = (items: string[]): string => (
    (Array.isArray(items) ? items : [])
        .map((item) => 标准化列表项文本(String(item || '')))
        .filter(Boolean)
        .join('\n')
);
const 规范化字符串列表 = (items: string[]): string[] => 解析索引列表文本(格式化逐行列表文本(items));
const 文本存在内容 = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const 列表存在内容 = (items: string[]): boolean => 规范化字符串列表(items).length > 0;
const 创建空信息可见性 = (): 小说拆分信息可见性结构 => ({
    谁知道: [],
    谁不知道: [],
    是否仅读者视角可见: false
});

const 创建空可见信息条目 = (): 小说拆分可见信息条目结构 => ({
    内容: '',
    信息可见性: 创建空信息可见性()
});

const 创建空关键事件 = (): 小说拆分事件结构 => ({
    事件名: '',
    事件说明: '',
    开始时间: '',
    最早开始时间: '',
    最迟开始时间: '',
    结束时间: '',
    前置条件: [],
    触发条件: [],
    阻断条件: [],
    事件结果: [],
    对下一组影响: [],
    信息可见性: 创建空信息可见性()
});

const 创建空角色推进 = (): 小说拆分角色推进结构 => ({
    角色名: '',
    本组前状态: [],
    本组变化: [],
    本组后状态: [],
    对下一组影响: []
});

const 清理可见信息条目列表 = (items: 小说拆分可见信息条目结构[]): 小说拆分可见信息条目结构[] => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            内容: String(item?.内容 || '').trim(),
            信息可见性: {
                谁知道: 规范化字符串列表(item?.信息可见性?.谁知道 || []),
                谁不知道: 规范化字符串列表(item?.信息可见性?.谁不知道 || []),
                是否仅读者视角可见: item?.信息可见性?.是否仅读者视角可见 === true
            }
        }))
        .filter((item) => 文本存在内容(item.内容))
);

const 清理关键事件列表 = (items: 小说拆分事件结构[]): 小说拆分事件结构[] => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            事件名: String(item?.事件名 || '').trim(),
            事件说明: String(item?.事件说明 || '').trim(),
            开始时间: String(item?.开始时间 || '').trim(),
            最早开始时间: String(item?.最早开始时间 || '').trim(),
            最迟开始时间: String(item?.最迟开始时间 || '').trim(),
            结束时间: String(item?.结束时间 || '').trim(),
            前置条件: 规范化字符串列表(item?.前置条件 || []),
            触发条件: 规范化字符串列表(item?.触发条件 || []),
            阻断条件: 规范化字符串列表(item?.阻断条件 || []),
            事件结果: 规范化字符串列表(item?.事件结果 || []),
            对下一组影响: 规范化字符串列表(item?.对下一组影响 || []),
            信息可见性: {
                谁知道: 规范化字符串列表(item?.信息可见性?.谁知道 || []),
                谁不知道: 规范化字符串列表(item?.信息可见性?.谁不知道 || []),
                是否仅读者视角可见: item?.信息可见性?.是否仅读者视角可见 === true
            }
        }))
        .filter((item) => (
            文本存在内容(item.事件名)
            || 文本存在内容(item.事件说明)
            || 文本存在内容(item.开始时间)
            || 文本存在内容(item.最早开始时间)
            || 文本存在内容(item.最迟开始时间)
            || 文本存在内容(item.结束时间)
            || 列表存在内容(item.前置条件)
            || 列表存在内容(item.触发条件)
            || 列表存在内容(item.阻断条件)
            || 列表存在内容(item.事件结果)
            || 列表存在内容(item.对下一组影响)
        ))
);

const 清理角色推进列表 = (items: 小说拆分角色推进结构[]): 小说拆分角色推进结构[] => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            角色名: String(item?.角色名 || '').trim(),
            本组前状态: 规范化字符串列表(item?.本组前状态 || []),
            本组变化: 规范化字符串列表(item?.本组变化 || []),
            本组后状态: 规范化字符串列表(item?.本组后状态 || []),
            对下一组影响: 规范化字符串列表(item?.对下一组影响 || [])
        }))
        .filter((item) => (
            文本存在内容(item.角色名)
            || 列表存在内容(item.本组前状态)
            || 列表存在内容(item.本组变化)
            || 列表存在内容(item.本组后状态)
            || 列表存在内容(item.对下一组影响)
        ))
);

const 结构化列表文本域: React.FC<{
    label: string;
    value: string[];
    onChange: (value: string[]) => void;
    rows?: number;
    helper?: string;
    placeholder?: string;
}> = ({ label, value, onChange, rows = 4, helper, placeholder }) => (
    <div className="space-y-1">
        <label className="text-xs text-gray-300">{label}</label>
        {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
        <textarea
            value={格式化逐行列表文本(value)}
            onChange={(e) => onChange(解析索引列表文本(e.target.value))}
            rows={rows}
            placeholder={placeholder}
            className={文本域样式}
        />
    </div>
);

const 结构化文本输入: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    helper?: string;
    placeholder?: string;
}> = ({ label, value, onChange, helper, placeholder }) => (
    <div className="space-y-1">
        <label className="text-xs text-gray-300">{label}</label>
        {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={输入框样式}
        />
    </div>
);

const 结构化条目卡片: React.FC<{
    title: string;
    subtitle?: string;
    onDelete: () => void;
    children: React.ReactNode;
}> = ({ title, subtitle, onDelete, children }) => (
    <div className="rounded border border-gray-800 bg-black/35 p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-sm font-medium text-gray-100 break-all">{title}</div>
                {subtitle && <div className="mt-1 text-[11px] text-gray-500">{subtitle}</div>}
            </div>
            <button
                type="button"
                onClick={onDelete}
                className="shrink-0 rounded border border-red-500/30 bg-red-950/10 px-3 py-1.5 text-[11px] text-red-200 hover:bg-red-950/25"
            >
                删除
            </button>
        </div>
        {children}
    </div>
);

const 过滤目标注入树节点 = (
    nodes: 小说拆分树节点结构[],
    target: 小说拆分注入目标类型
): 小说拆分树节点结构[] => (
    ((Array.isArray(nodes) ? nodes : [])
        .map((node) => {
            const children = 过滤目标注入树节点(node.子节点 || [], target);
            const matched = Array.isArray(node.目标链路) && node.目标链路.includes(target);
            if (!matched && children.length <= 0) {
                return null;
            }
            return {
                ...node,
                子节点: children
            };
        })
        .filter(Boolean) as 小说拆分树节点结构[])
        .sort((a, b) => (a.排序 || 0) - (b.排序 || 0))
);

const 注入树节点预览: React.FC<{
    node: 小说拆分树节点结构;
    depth?: number;
}> = ({ node, depth = 0 }) => {
    const children = Array.isArray(node.子节点) ? node.子节点 : [];
    const body = (node.内容 || '').trim();
    const relatedCount = Array.isArray(node.关联分段ID列表)
        ? node.关联分段ID列表.filter(Boolean).length
        : 0;

    return (
        <div className="space-y-2" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
            <div className="rounded border border-emerald-500/15 bg-black/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.03)]">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-gray-100 break-all">{node.标题 || '未命名节点'}</div>
                    <span className="inline-flex items-center rounded border border-emerald-500/20 bg-emerald-950/20 px-2 py-0.5 text-[10px] text-emerald-200">
                        {树节点类型文本映射[node.类型] || node.类型}
                    </span>
                    {relatedCount > 0 && (
                        <span className="inline-flex items-center rounded border border-gray-700 bg-black/30 px-2 py-0.5 text-[10px] text-gray-300">
                            关联分段 {relatedCount}
                        </span>
                    )}
                </div>
                {body && (
                    <div className="mt-2 rounded border border-gray-800 bg-black/35 px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-emerald-100">
                        {body}
                    </div>
                )}
            </div>
            {children.length > 0 && (
                <div className="ml-4 border-l border-emerald-500/20 pl-4 space-y-2">
                    {children.map((child) => (
                        <注入树节点预览 key={child.id} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

type 工作台标签页 = 'import' | 'datasets' | 'chapters' | 'segments' | 'tasks' | 'snapshots';

const NovelDecompositionSettings: React.FC<Props> = ({ settings, onSave, requestConfirm, onNotify, mode = 'desktop' }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [loadingBoard, setLoadingBoard] = useState(false);
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [datasetsCount, setDatasetsCount] = useState(0);
    const [datasetList, setDatasetList] = useState<Awaited<ReturnType<typeof 读取小说拆分数据集列表>>>([]);
    const [tasks, setTasks] = useState<Awaited<ReturnType<typeof 读取小说拆分任务列表>>>([]);
    const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof 读取小说拆分注入快照列表>>>([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');
    const [selectedSegmentId, setSelectedSegmentId] = useState('');
    const [showStrategySection, setShowStrategySection] = useState(false);
    const [showChapterSection, setShowChapterSection] = useState(false);
    const [showSegmentSection, setShowSegmentSection] = useState(false);
    const [showLiveMonitor, setShowLiveMonitor] = useState(false);
    const [expandedChapterId, setExpandedChapterId] = useState('');
    const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
    const [mobileTab, setMobileTab] = useState<工作台标签页>('import');
    const [expandedSnapshotTreeKeys, setExpandedSnapshotTreeKeys] = useState<Record<string, boolean>>({});
    const [segmentDraft, setSegmentDraft] = useState<分段编辑草稿>({
        标题: '',
        本组概括文本: '',
        开局已成立事实文本: '',
        前组延续事实文本: '',
        本组结束状态文本: '',
        给下一组参考文本: '',
        原著硬约束: [],
        可提前铺垫: [],
        登场角色文本: '',
        时间线起点: '',
        时间线终点: '',
        关键事件: [],
        角色推进: []
    });
    const [schedulerState, setSchedulerState] = useState<小说拆分调度状态结构>(() => 小说拆分后台调度服务.getState());
    const importJsonInputRef = useRef<HTMLInputElement | null>(null);
    const importTxtInputRef = useRef<HTMLInputElement | null>(null);
    const importEpubInputRef = useRef<HTMLInputElement | null>(null);
    const 实时流区域Ref = useRef<HTMLPreElement | null>(null);
    const 实时日志区域Ref = useRef<HTMLDivElement | null>(null);

    const clearTaskBoardMessage = () => {
        setMessage('');
    };

    const 设置状态消息 = (nextMessage: string) => {
        setMessage(nextMessage);
    };

    const 推送错误提示 = (nextMessage: string) => {
        setMessage(nextMessage);
        onNotify?.({
            title: '小说分解异常',
            message: nextMessage,
            tone: 'error'
        });
    };

    const 切换快照树展开 = (key: string) => {
        setExpandedSnapshotTreeKeys((prev) => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
    }, [settings]);

    const refreshBoard = async () => {
        setLoadingBoard(true);
        try {
            const [datasets, taskList, snapshotList] = await Promise.all([
                读取小说拆分数据集列表(),
                读取小说拆分任务列表(),
                读取小说拆分注入快照列表()
            ]);
            const sortedDatasets = datasets.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            setDatasetList(sortedDatasets);
            setDatasetsCount(datasets.length);
            setTasks(taskList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
            setSnapshots(snapshotList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
            setSelectedDatasetId((prev) => {
                if (prev && sortedDatasets.some((item) => item.id === prev)) return prev;
                return sortedDatasets[0]?.id || '';
            });
        } catch (error: any) {
            推送错误提示(`读取小说分解任务看板失败：${error?.message || '未知错误'}`);
        } finally {
            setLoadingBoard(false);
        }
    };

    useEffect(() => {
        void refreshBoard();
    }, []);

    useEffect(() => {
        初始化小说拆分运行时();
        const unsubscribe = 小说拆分后台调度服务.subscribe((state) => {
            setSchedulerState(state);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!schedulerState.lastTickAt || schedulerState.busy) return;
        void refreshBoard();
    }, [schedulerState.lastTickAt, schedulerState.busy]);

    useEffect(() => {
        const el = 实时流区域Ref.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [schedulerState.liveStreamText]);

    useEffect(() => {
        const el = 实时日志区域Ref.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [schedulerState.recentLogs]);

    useEffect(() => {
        if (!form.功能模型占位.小说拆分功能启用 || !form.功能模型占位.小说拆分后台运行) {
            小说拆分后台调度服务.stop();
            return;
        }
        小说拆分后台调度服务.start();
        return () => {
            小说拆分后台调度服务.stop();
        };
    }, [form.功能模型占位.小说拆分功能启用, form.功能模型占位.小说拆分后台运行]);

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const 获取当前小说拆分任务策略补丁 = () => ({
        单次处理批量: Math.max(1, Number(form.功能模型占位.小说拆分单次处理批量) || 1),
        自动重试次数: Math.max(0, Number(form.功能模型占位.小说拆分自动重试次数) || 0),
        后台运行: Boolean(form.功能模型占位.小说拆分后台运行),
        自动续跑: Boolean(form.功能模型占位.小说拆分自动续跑)
    });

    const 同步小说拆分任务策略 = async (options?: {
        taskId?: string;
        datasetId?: string;
    }) => {
        const strategyPatch = 获取当前小说拆分任务策略补丁();
        const currentTasks = await 读取小说拆分任务列表();
        const targetTasks = currentTasks.filter((item) => {
            if (item.状态 === 'cancelled') return false;
            if (options?.taskId && item.id !== options.taskId) return false;
            if (options?.datasetId && item.数据集ID !== options.datasetId) return false;
            return true;
        });
        await Promise.all(targetTasks.map((item) => (
            更新小说拆分任务进度(item.id, strategyPatch)
        )));
    };

    const 准备手动继续小说拆分任务 = async (taskId: string) => {
        const currentTasks = await 读取小说拆分任务列表();
        const targetTask = currentTasks.find((item) => item.id === taskId);
        if (!targetTask) return;

        const currentDatasets = await 读取小说拆分数据集列表();
        const targetDataset = currentDatasets.find((item) => item.id === targetTask.数据集ID);
        if (!targetDataset || !Array.isArray(targetDataset.分段列表) || targetDataset.分段列表.length <= 0) {
            return;
        }

        const firstIncompleteIndex = targetDataset.分段列表.findIndex((item) => item.处理状态 !== '已完成');
        if (firstIncompleteIndex < 0) return;

        const firstIncompleteSegment = targetDataset.分段列表[firstIncompleteIndex];
        if (firstIncompleteSegment?.处理状态 !== '失败') return;

        await 写入小说拆分数据集({
            ...targetDataset,
            分段列表: targetDataset.分段列表.map((item, index) => (
                index === firstIncompleteIndex
                    ? {
                        ...item,
                        处理状态: '待处理',
                        最近错误: '',
                        updatedAt: Date.now()
                    }
                    : item
            )),
            updatedAt: Date.now()
        });
    };

    const handleSave = async () => {
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        await 同步小说拆分任务策略();
        await refreshBoard();
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    const runningTaskCount = tasks.filter((item) => item.状态 === 'running').length;
    const resumableTaskCount = 筛选可后台续跑任务(tasks).length;
    const selectedDataset = datasetList.find((item) => item.id === selectedDatasetId) || datasetList[0] || null;
    const selectedSnapshots = snapshots.filter((item) => item.数据集ID === (selectedDataset?.id || ''));
    const selectedSnapshotTrees = useMemo<Record<小说拆分注入目标类型, 小说拆分树节点结构[]>>(() => ({
        main_story: 过滤目标注入树节点(selectedDataset?.注入树 || [], 'main_story'),
        planning: 过滤目标注入树节点(selectedDataset?.注入树 || [], 'planning'),
        world_evolution: 过滤目标注入树节点(selectedDataset?.注入树 || [], 'world_evolution')
    }), [selectedDataset?.注入树]);
    const selectedDatasetTasks = useMemo(() => tasks.filter((item) => item.数据集ID === (selectedDataset?.id || '')), [tasks, selectedDataset?.id]);
    const selectedSegment = selectedDataset?.分段列表.find((item) => item.id === selectedSegmentId) || selectedDataset?.分段列表[0] || null;
    const mobileTabs = useMemo(() => ([
        { id: 'import' as const, label: '导入与配置' },
        { id: 'datasets' as const, label: '数据集' },
        { id: 'chapters' as const, label: '章节筛选' },
        { id: 'segments' as const, label: '分段校对' },
        { id: 'tasks' as const, label: '任务管理' },
        { id: 'snapshots' as const, label: '注入快照' }
    ]), []);
    const previewChapters = useMemo(() => {
        if (!selectedDataset) return [];
        if (Array.isArray(selectedDataset.章节列表) && selectedDataset.章节列表.length > 0) {
            return selectedDataset.章节列表;
        }
        const previewText = (selectedDataset.原始文本 || '').trim();
        if (!previewText) return [];
        return 从原始文本提取章节({
            ...selectedDataset,
            原始文本: previewText,
            原始文本长度: previewText.length
        });
    }, [selectedDataset]);
    const chapterProgressList = useMemo(() => {
        return previewChapters.map((chapter) => {
            const segment = selectedDataset?.分段列表.find((item) => (
                chapter.序号 >= item.起始章序号 && chapter.序号 <= item.结束章序号
            )) || null;
            const task = selectedDatasetTasks[0] || null;
            const status: 小说拆分分段结构['处理状态'] | 'idle' = segment?.处理状态 || (task ? '待处理' : 'idle');
            return {
                chapter,
                segment,
                task,
                status
            };
        });
    }, [previewChapters, selectedDataset?.分段列表, selectedDatasetTasks]);
    const chapterProgressSummary = useMemo(() => {
        const summary = {
            total: chapterProgressList.length,
            completed: 0,
            running: 0,
            failed: 0,
            pending: 0,
            idle: 0
        };
        chapterProgressList.forEach((item) => {
            if (item.status === '已完成') summary.completed += 1;
            else if (item.status === '处理中') summary.running += 1;
            else if (item.status === '失败') summary.failed += 1;
            else if (item.status === '待处理') summary.pending += 1;
            else summary.idle += 1;
        });
        return summary;
    }, [chapterProgressList]);
    const 已全选章节 = previewChapters.length > 0 && selectedChapterIds.length === previewChapters.length;

    useEffect(() => {
        setExpandedChapterId((prev) => {
            if (prev && previewChapters.some((item) => item.id === prev)) return prev;
            return '';
        });
    }, [previewChapters]);

    useEffect(() => {
        setSelectedChapterIds((prev) => prev.filter((id) => previewChapters.some((chapter) => chapter.id === id)));
    }, [previewChapters]);

    useEffect(() => {
        const segmentList = selectedDataset?.分段列表 || [];
        setSelectedSegmentId((prev) => {
            if (prev && segmentList.some((item) => item.id === prev)) return prev;
            return segmentList[0]?.id || '';
        });
    }, [selectedDataset?.id, selectedDataset?.分段列表]);

    useEffect(() => {
        const segment = selectedSegment;
        if (!segment) {
            setSegmentDraft({
                标题: '',
                本组概括文本: '',
                开局已成立事实文本: '',
                前组延续事实文本: '',
                本组结束状态文本: '',
                给下一组参考文本: '',
                原著硬约束: [],
                可提前铺垫: [],
                登场角色文本: '',
                时间线起点: '',
                时间线终点: '',
                关键事件: [],
                角色推进: []
            });
            return;
        }
        setSegmentDraft({
            标题: segment.标题 || '',
            本组概括文本: segment.本组概括 || '',
            开局已成立事实文本: 格式化索引列表文本(segment.开局已成立事实 || []),
            前组延续事实文本: 格式化索引列表文本(segment.前组延续事实 || []),
            本组结束状态文本: 格式化索引列表文本(segment.本组结束状态 || []),
            给下一组参考文本: 格式化索引列表文本(segment.给下一组参考 || []),
            原著硬约束: 清理可见信息条目列表(segment.原著硬约束 || []),
            可提前铺垫: 清理可见信息条目列表(segment.可提前铺垫 || []),
            登场角色文本: 格式化索引列表文本(segment.登场角色 || []),
            时间线起点: segment.时间线起点 || '',
            时间线终点: segment.时间线终点 || '',
            关键事件: 清理关键事件列表(segment.关键事件 || []),
            角色推进: 清理角色推进列表(segment.角色推进 || [])
        });
    }, [selectedSegment?.id]);

    const formatTime = (value: number | null | undefined): string => {
        if (!value) return '未运行';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '未运行';
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const 获取章节进度文本 = (status: 小说拆分分段结构['处理状态'] | 'idle') => {
        switch (status) {
            case '已完成':
                return '已完成';
            case '处理中':
                return '处理中';
            case '失败':
                return '失败';
            case '待处理':
                return '待处理';
            default:
                return '未建任务';
        }
    };

    const 获取章节进度样式 = (status: 小说拆分分段结构['处理状态'] | 'idle') => {
        switch (status) {
            case '已完成':
                return 'border-emerald-500/30 bg-emerald-950/15 text-emerald-200';
            case '处理中':
                return 'border-sky-500/30 bg-sky-950/15 text-sky-200';
            case '失败':
                return 'border-red-500/30 bg-red-950/15 text-red-200';
            case '待处理':
                return 'border-amber-500/30 bg-amber-950/15 text-amber-200';
            default:
                return 'border-gray-700 bg-black/30 text-gray-400';
        }
    };

    const 拆分章节标题显示 = (title: string, fallbackOrder: number): { 标签: string; 标题: string } => {
        const normalizedTitle = (title || '').trim();
        if (!normalizedTitle) {
            return {
                标签: `第${fallbackOrder}章`,
                标题: `第${fallbackOrder}章`
            };
        }

        const parts = normalizedTitle
            .split(/[｜|]/)
            .map((item) => item.trim())
            .filter(Boolean);
        const 主标题 = parts.length > 0 ? parts[parts.length - 1] : normalizedTitle;
        const 前缀标签 = parts.length > 1 ? parts.slice(0, -1).join('｜') : '';
        const match = 主标题.match(/^(第[0-9零一二三四五六七八九十百千万两〇○]+[章节回卷部篇册季集辑节话幕])\s*(.*)$/u);
        if (match) {
            return {
                标签: [前缀标签, match[1].trim()].filter(Boolean).join('｜'),
                标题: match[2].trim() || match[1].trim()
            };
        }

        if (前缀标签) {
            return {
                标签: 前缀标签,
                标题: 主标题
            };
        }

        return {
            标签: `第${fallbackOrder}章`,
            标题: normalizedTitle
        };
    };

    const 根据章节重建原始文本 = (chapters: typeof previewChapters): string => chapters
        .map((chapter) => {
            const title = (chapter.标题 || '').trim();
            const content = (chapter.内容 || '').trim();
            return [title, content].filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n');

    const 读取UTF8文本文件 = async (file: File): Promise<string> => (
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
            reader.readAsText(file, 'utf-8');
        })
    );

    const persistDatasetWithSnapshots = async (
        dataset: typeof selectedDataset extends null ? never : NonNullable<typeof selectedDataset>,
        successMessage: string,
        options?: { requeueTasks?: boolean }
    ) => {
        const aggregatedDataset = 聚合小说拆分数据集(dataset);
        await 写入小说拆分数据集(aggregatedDataset);
        const normalizedDataset = (await 读取小说拆分数据集列表()).find((item) => item.id === aggregatedDataset.id) || aggregatedDataset;
        const rebuiltSnapshots = 构建全部小说拆分注入快照(normalizedDataset);
        const nextSnapshots = [
            ...snapshots.filter((item) => item.数据集ID !== normalizedDataset.id),
            ...rebuiltSnapshots
        ];
        await 保存小说拆分注入快照列表(nextSnapshots);

        if (options?.requeueTasks) {
            await 重置数据集任务断点(normalizedDataset.id, normalizedDataset.分段列表.length);
        }

        setMessage(successMessage);
        await refreshBoard();
    };

    const 重置数据集任务断点 = async (datasetId: string, totalSegments: number) => {
        const relatedTasks = tasks.filter((item) => item.数据集ID === datasetId && item.状态 !== 'cancelled');
        const strategyPatch = 获取当前小说拆分任务策略补丁();
        await Promise.all(relatedTasks.map((item) => (
            更新小说拆分任务进度(item.id, {
                ...strategyPatch,
                状态: 'queued',
                当前阶段: totalSegments > 0 ? 'processing' : 'prepare',
                当前游标: 0,
                已完成分段ID列表: [],
                失败分段ID列表: [],
                最近错误: '',
                completedAt: undefined,
                进度: {
                    总分段数: Math.max(0, totalSegments),
                    已完成分段数: 0,
                    失败分段数: 0,
                    当前分段索引: 0,
                    百分比: 0
                }
            })
        )));
    };

    const 构建待重新拆分数据集 = (
        dataset: NonNullable<typeof selectedDataset>,
        chapters: typeof previewChapters
    ): NonNullable<typeof selectedDataset> => {
        const now = Date.now();
        const 原始文本 = 根据章节重建原始文本(chapters);
        return {
            ...dataset,
            原始文本,
            原始文本长度: 原始文本.length,
            原始文本摘要: 原始文本.trim().slice(0, 240),
            章节列表: chapters.map((chapter, index) => ({
                ...chapter,
                数据集ID: dataset.id,
                序号: index + 1,
                updatedAt: now
            })),
            总章节数: chapters.length,
            分段列表: [],
            当前阶段概括: '',
            核心角色摘要: [],
            注入树: [],
            updatedAt: now
        };
    };

    const 获取当前分段配置 = () => {
        const 每批章数 = Math.max(1, Number(form.功能模型占位.小说拆分按N章分组) || 1);
        return {
            分段模式: (每批章数 > 1 ? 'n_chapters' : 'single_chapter') as 'n_chapters' | 'single_chapter',
            每批章数
        };
    };

    const 数据集分段需要重建 = (
        dataset: NonNullable<typeof selectedDataset>,
        expectedSegments: 小说拆分分段结构[],
        分段模式: NonNullable<typeof selectedDataset>['分段模式']
    ) => {
        if (!Array.isArray(dataset.章节列表) || dataset.章节列表.length <= 0) return false;
        if (dataset.分段模式 !== 分段模式) return true;
        if ((dataset.每批章数 || 1) !== expectedSegments.reduce((max, segment) => Math.max(max, (segment.结束章序号 - segment.起始章序号 + 1) || 1), 1)) {
            return true;
        }
        if ((dataset.分段列表 || []).length !== expectedSegments.length) return true;
        return expectedSegments.some((segment, index) => {
            const current = dataset.分段列表[index];
            if (!current) return true;
            return current.起始章序号 !== segment.起始章序号 || current.结束章序号 !== segment.结束章序号;
        });
    };

    const handleCreateEmptyDataset = async () => {
        try {
            const index = datasetsCount + 1;
            await 写入小说拆分数据集(创建空小说拆分数据集({
                标题: `测试数据集 ${index}`,
                作品名: `未命名作品 ${index}`,
                分段模式: form.功能模型占位.小说拆分按N章分组 > 1 ? 'n_chapters' : 'single_chapter',
                每批章数: form.功能模型占位.小说拆分按N章分组
            }));
            设置状态消息('已创建空白小说分解数据集。');
            await refreshBoard();
        } catch (error: any) {
            推送错误提示(`创建空白数据集失败：${error?.message || '未知错误'}`);
        }
    };

    const handleStartTaskForDataset = async (
        dataset?: NonNullable<typeof selectedDataset>,
        options?: { successMessage?: string }
    ) => {
        clearTaskBoardMessage();
        const initialDataset = dataset || selectedDataset || datasetList[0];
        let targetDataset = initialDataset;
        if (!targetDataset) {
            setMessage('请先创建或导入至少一个小说分解数据集。');
            return;
        }
        try {
            小说拆分后台调度服务.resetLiveState({
                stageText: '准备开始任务',
                keepTask: false,
                keepLastResult: false
            });
            const { 分段模式, 每批章数 } = 获取当前分段配置();
            if (Array.isArray(targetDataset.章节列表) && targetDataset.章节列表.length > 0) {
                const expectedSegments = 根据章节生成分段列表({
                    ...targetDataset,
                    分段模式,
                    每批章数
                }, targetDataset.章节列表);
                if (数据集分段需要重建(targetDataset, expectedSegments, 分段模式)) {
                    targetDataset = 聚合小说拆分数据集({
                        ...targetDataset,
                        分段模式,
                        每批章数,
                        分段列表: expectedSegments,
                        当前阶段概括: '',
                        核心角色摘要: [],
                        注入树: [],
                        updatedAt: Date.now()
                    });
                    await persistDatasetWithSnapshots(targetDataset, '已按当前分组配置重建分段并开始任务。');
                }
            }
            const reusableTasks = tasks
                .filter((item) => item.数据集ID === targetDataset.id && item.状态 !== 'cancelled')
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            if (reusableTasks.length > 0) {
                await 重置数据集任务断点(targetDataset.id, targetDataset.分段列表.length);
            } else {
                await 写入小说拆分任务(创建小说拆分任务({
                    数据集ID: targetDataset.id,
                    名称: `${targetDataset.作品名} 拆分任务`,
                    分段模式: targetDataset.分段模式,
                    每批章数: targetDataset.每批章数,
                    单次处理批量: form.功能模型占位.小说拆分单次处理批量,
                    自动重试次数: form.功能模型占位.小说拆分自动重试次数,
                    后台运行: form.功能模型占位.小说拆分后台运行,
                    自动续跑: form.功能模型占位.小说拆分自动续跑,
                    总分段数: targetDataset.分段列表.length
                }));
            }
            const 当前调度状态 = 小说拆分后台调度服务.getState();
            if (form.功能模型占位.小说拆分后台运行) {
                if (!当前调度状态.running) {
                    小说拆分后台调度服务.start();
                } else {
                    await 小说拆分后台调度服务.tick();
                }
            } else {
                await 小说拆分后台调度服务.tick();
            }
            设置状态消息(options?.successMessage || '已开始当前数据集任务。');
            await refreshBoard();
        } catch (error: any) {
            推送错误提示(`开始任务失败：${error?.message || '未知错误'}`);
        }
    };

    const handleImportNovelSource = async (params: {
        title: string;
        fileName: string;
        text: string;
        sourceType: 小说拆分来源类型;
        successMessage: string;
    }) => {
        const baseName = params.title.trim() || `导入作品 ${datasetsCount + 1}`;
        const nextDataset = 创建空小说拆分数据集({
            标题: baseName,
            作品名: baseName,
            来源类型: params.sourceType,
            原始文件名: params.fileName,
            原始文本: params.text,
            原始文本长度: params.text.length,
            原始文本摘要: params.text.trim().slice(0, 240),
            分段模式: form.功能模型占位.小说拆分按N章分组 > 1 ? 'n_chapters' : 'single_chapter',
            每批章数: form.功能模型占位.小说拆分按N章分组,
            激活注入: true
        });
        await 写入小说拆分数据集(nextDataset);
        await refreshBoard();
        setSelectedDatasetId(nextDataset.id);
        设置状态消息(params.successMessage);
    };

    const handleImportTxtFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const text = await 读取UTF8文本文件(file);
            const baseName = file.name.replace(/\.[^.]+$/, '').trim() || `导入作品 ${datasetsCount + 1}`;
            await handleImportNovelSource({
                title: baseName,
                fileName: file.name,
                text,
                sourceType: 'txt',
                successMessage: `已导入 TXT《${baseName}》。请先检查章节，确认后再点击“开始任务”。`
            });
        } catch (error: any) {
            推送错误提示(`导入 TXT 失败：${error?.message || '未知错误'}`);
        }
    };

    const handleImportEpubFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const parsed = await 从EPUB文件提取小说内容(file);
            const baseName = (parsed.标题 || file.name.replace(/\.[^.]+$/, '')).trim() || `导入作品 ${datasetsCount + 1}`;
            await handleImportNovelSource({
                title: baseName,
                fileName: file.name,
                text: parsed.原始文本,
                sourceType: 'epub',
                successMessage: `已导入 EPUB《${baseName}》。请先检查章节，确认后再点击“开始任务”。`
            });
        } catch (error: any) {
            推送错误提示(`导入 EPUB 失败：${error?.message || '未知错误'}`);
        }
    };

    const handleSetActiveDataset = async () => {
        if (!selectedDataset) {
            setMessage('请先选择一个数据集。');
            return;
        }
        try {
            await 设置小说拆分激活数据集(selectedDataset.id);
            设置状态消息(`已将“${selectedDataset.作品名 || selectedDataset.标题}”设为当前注入数据集。`);
            await refreshBoard();
        } catch (error: any) {
            推送错误提示(`切换激活数据集失败：${error?.message || '未知错误'}`);
        }
    };

    const handleDeleteCurrentDataset = async () => {
        if (!selectedDataset) {
            setMessage('请先选择一个数据集。');
            return;
        }
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除小说分解数据集',
                message: `确定删除“${selectedDataset.作品名 || selectedDataset.标题}”吗？其关联任务和注入快照也会一起删除。`,
                confirmText: '删除',
                cancelText: '取消',
                danger: true
            })
            : true;
        if (!ok) return;

        try {
            const result = await 删除小说拆分数据集(selectedDataset.id);
            const nextSelectedId = result.数据集列表[0]?.id || '';
            setSelectedDatasetId(nextSelectedId);
            设置状态消息('已删除当前数据集，以及其关联任务和注入快照。');
            await refreshBoard();
        } catch (error: any) {
            推送错误提示(`删除数据集失败：${error?.message || '未知错误'}`);
        }
    };

    const 更新结构化列表字段 = (
        key: '关键事件' | '角色推进',
        index: number,
        field: string,
        value: any
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: (prev[key] as any[]).map((item, itemIndex) => (
                itemIndex === index ? { ...item, [field]: value } : item
            ))
        } as 分段编辑草稿));
    };

    const 更新结构化列表可见性字段 = <K extends keyof 小说拆分信息可见性结构>(
        key: '关键事件',
        index: number,
        field: K,
        value: 小说拆分信息可见性结构[K]
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: (prev[key] as 小说拆分事件结构[]).map((item, itemIndex) => (
                itemIndex === index
                    ? {
                        ...item,
                        信息可见性: {
                            ...(item.信息可见性 || 创建空信息可见性()),
                            [field]: value
                        }
                    }
                    : item
            ))
        } as 分段编辑草稿));
    };

    const 更新可见信息条目字段 = (
        key: '原著硬约束' | '可提前铺垫',
        index: number,
        field: keyof Pick<小说拆分可见信息条目结构, '内容'>,
        value: string
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: prev[key].map((item, itemIndex) => (
                itemIndex === index ? { ...item, [field]: value } : item
            ))
        }));
    };

    const 更新可见信息条目可见性字段 = <K extends keyof 小说拆分信息可见性结构>(
        key: '原著硬约束' | '可提前铺垫',
        index: number,
        field: K,
        value: 小说拆分信息可见性结构[K]
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: prev[key].map((item, itemIndex) => (
                itemIndex === index
                    ? {
                        ...item,
                        信息可见性: {
                            ...(item.信息可见性 || 创建空信息可见性()),
                            [field]: value
                        }
                    }
                    : item
            ))
        }));
    };

    const 新增可见信息条目 = (key: '原著硬约束' | '可提前铺垫') => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: [...prev[key], 创建空可见信息条目()]
        }));
    };

    const 删除可见信息条目 = (key: '原著硬约束' | '可提前铺垫', index: number) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: prev[key].filter((_, itemIndex) => itemIndex !== index)
        }));
    };

    const 新增结构化列表项 = (
        key: '关键事件' | '角色推进',
        factory: () => any
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: [...(prev[key] as any[]), factory()]
        } as 分段编辑草稿));
    };

    const 删除结构化列表项 = (
        key: '关键事件' | '角色推进',
        index: number
    ) => {
        setSegmentDraft((prev) => ({
            ...prev,
            [key]: (prev[key] as any[]).filter((_, itemIndex) => itemIndex !== index)
        } as 分段编辑草稿));
    };

    const handleSaveSegmentEdit = async () => {
        if (!selectedDataset || !selectedSegment) {
            setMessage('请先选择一个分段。');
            return;
        }
        try {
            const mergedCharacters = 合并同名登场角色文本列表(解析索引列表文本(segmentDraft.登场角色文本));
            const nextDataset = {
                ...selectedDataset,
                分段列表: selectedDataset.分段列表.map((item) => item.id === selectedSegment.id ? {
                    ...item,
                    标题: segmentDraft.标题.trim() || item.标题,
                    本组概括: segmentDraft.本组概括文本.trim(),
                    开局已成立事实: 解析索引列表文本(segmentDraft.开局已成立事实文本),
                    前组延续事实: 解析索引列表文本(segmentDraft.前组延续事实文本),
                    本组结束状态: 解析索引列表文本(segmentDraft.本组结束状态文本),
                    给下一组参考: 解析索引列表文本(segmentDraft.给下一组参考文本),
                    原著硬约束: 清理可见信息条目列表(segmentDraft.原著硬约束),
                    可提前铺垫: 清理可见信息条目列表(segmentDraft.可提前铺垫),
                    登场角色: mergedCharacters,
                    时间线起点: segmentDraft.时间线起点.trim() || item.时间线起点,
                    时间线终点: segmentDraft.时间线终点.trim() || item.时间线终点,
                    关键事件: 清理关键事件列表(segmentDraft.关键事件),
                    角色推进: 清理角色推进列表(segmentDraft.角色推进),
                    updatedAt: Date.now()
                } : item)
            };
            await persistDatasetWithSnapshots(
                nextDataset,
                mergedCharacters.length < 解析索引列表文本(segmentDraft.登场角色文本).length
                    ? '已保存分段编辑结果，并自动合并同名登场角色。'
                    : '已保存分段编辑结果，并立即刷新注入快照。'
            );
        } catch (error: any) {
            推送错误提示(`保存分段编辑失败：${error?.message || '未知错误'}`);
        }
    };

    const handleToggleSegmentInjection = async (segmentId: string) => {
        if (!selectedDataset) return;
        try {
            const target = selectedDataset.分段列表.find((item) => item.id === segmentId);
            if (!target) return;
            const nextDataset = {
                ...selectedDataset,
                分段列表: selectedDataset.分段列表.map((item) => item.id === segmentId ? {
                    ...item,
                    启用注入: item.启用注入 === false,
                    updatedAt: Date.now()
                } : item)
            };
            await persistDatasetWithSnapshots(nextDataset, target.启用注入 === false ? '已重新启用该分段注入。' : '已关闭该分段注入。');
        } catch (error: any) {
            推送错误提示(`切换分段注入失败：${error?.message || '未知错误'}`);
        }
    };

    const handleRegenerateSegment = async (segmentId: string) => {
        if (!selectedDataset) return;
        try {
            const nextDataset = {
                ...selectedDataset,
                分段列表: selectedDataset.分段列表.map((item) => item.id === segmentId ? {
                    ...item,
                    启用注入: true,
                    本组概括: '',
                    开局已成立事实: [],
                    前组延续事实: [],
                    本组结束状态: [],
                    给下一组参考: [],
                    原著硬约束: [],
                    可提前铺垫: [],
                    关键事件: [],
                    角色推进: [],
                    登场角色: [],
                    时间线: [],
                    时间线起点: item.时间线起点,
                    时间线终点: item.时间线终点,
                    处理状态: '待处理' as 小说拆分分段结构['处理状态'],
                    最近错误: '',
                    updatedAt: Date.now()
                } : item)
            };
            await persistDatasetWithSnapshots(nextDataset, '已将该分段打回待重新生成，关联任务会从断点继续。', { requeueTasks: true });
        } catch (error: any) {
            推送错误提示(`标记分段重生成失败：${error?.message || '未知错误'}`);
        }
    };

    const handleRetryFailedSegments = async () => {
        if (!selectedDataset) {
            setMessage('请先选择一个数据集。');
            return;
        }
        const failedCount = selectedDataset.分段列表.filter((item) => item.处理状态 === '失败').length;
        if (failedCount <= 0) {
            setMessage('当前数据集没有失败分段。');
            return;
        }

        try {
            const nextDataset = {
                ...selectedDataset,
                分段列表: selectedDataset.分段列表.map((item) => item.处理状态 === '失败' ? {
                    ...item,
                    启用注入: true,
                    处理状态: '待处理' as 小说拆分分段结构['处理状态'],
                    最近错误: '',
                    updatedAt: Date.now()
                } : item)
            };
            await persistDatasetWithSnapshots(nextDataset, `已重置 ${failedCount} 个失败分段，关联任务会继续续跑。`, { requeueTasks: true });
        } catch (error: any) {
            推送错误提示(`重置失败分段失败：${error?.message || '未知错误'}`);
        }
    };

    const handleExportSelectedDataset = async () => {
        if (!selectedDataset) {
            setMessage('请先选择一个数据集。');
            return;
        }
        try {
            const zipBlob = await 导出小说拆分分享数据({
                datasetId: selectedDataset.id,
                includeTasks: true,
                includeSnapshots: true
            });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${selectedDataset.作品名 || selectedDataset.标题 || 'novel_decomposition'}_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            设置状态消息('已导出当前数据集的小说分解分享 ZIP。');
        } catch (error: any) {
            推送错误提示(`导出小说分解 ZIP 失败：${error?.message || '未知错误'}`);
        }
    };

    const handleImportShareFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const includeRawText = requestConfirm
                ? await requestConfirm({
                    title: '是否导入原文',
                    message: '该 ZIP 内的原文已与分解结果分离存放。\n\n选择“导入原文”会同时恢复原始正文、章节正文与分段原文；选择“仅导入分解”则只恢复已拆分结果，体积更轻，但无法在工作台查看原文或基于原文重新拆分。',
                    confirmText: '导入原文',
                    cancelText: '仅导入分解'
                })
                : true;
            const result = await 导入小说拆分分享数据(file, { includeRawText });
            await refreshBoard();
            if (result.importedDatasetIds.length > 0) {
                setSelectedDatasetId(result.importedDatasetIds[0]);
            }
            设置状态消息(`已导入分解 ZIP：数据集 ${result.datasetCount} 个，任务 ${result.taskCount} 个，快照 ${result.snapshotCount} 个。${includeRawText ? '已同时导入原文。' : '本次未导入原文。'}`);
        } catch (error: any) {
            推送错误提示(`导入分解 ZIP 失败：${error?.message || '未知错误'}`);
        }
    };

    const handleToggleChapterSelection = (chapterId: string) => {
        setSelectedChapterIds((prev) => prev.includes(chapterId)
            ? prev.filter((item) => item !== chapterId)
            : [...prev, chapterId]);
    };

    const handleToggleSelectAllChapters = () => {
        if (previewChapters.length <= 0) return;
        setSelectedChapterIds(已全选章节 ? [] : previewChapters.map((chapter) => chapter.id));
    };

    const handleDeleteSelectedChapters = async () => {
        if (!selectedDataset) {
            setMessage('请先选择一个数据集。');
            return;
        }
        if (selectedChapterIds.length <= 0) {
            setMessage('请先勾选要删除的章节。');
            return;
        }
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除已选章节',
                message: `确定删除当前勾选的 ${selectedChapterIds.length} 个章节吗？删除后会清空原有分段结果，并将任务断点重置为待重新开始。`,
                confirmText: '删除章节',
                cancelText: '取消',
                danger: true
            })
            : true;
        if (!ok) return;

        try {
            const chapterIdSet = new Set(selectedChapterIds);
            const nextChapters = previewChapters.filter((chapter) => !chapterIdSet.has(chapter.id));
            const nextDataset = 构建待重新拆分数据集(selectedDataset, nextChapters);
            setSelectedChapterIds([]);
            setExpandedChapterId('');
            await persistDatasetWithSnapshots(
                nextDataset,
                nextChapters.length > 0
                    ? `已删除 ${selectedChapterIds.length} 个章节。请检查剩余章节后重新开始任务。`
                    : '已删除当前勾选章节。当前数据集已无章节，请先补充原文或重新导入后再开始任务。',
                { requeueTasks: true }
            );
        } catch (error: any) {
            推送错误提示(`删除章节失败：${error?.message || '未知错误'}`);
        }
    };

    const handleChangeTaskStatus = async (taskId: string, nextStatus: 'paused' | 'queued' | 'cancelled') => {
        clearTaskBoardMessage();
        try {
            if (nextStatus === 'paused' || nextStatus === 'cancelled') {
                请求中断小说拆分任务(taskId, nextStatus);
                小说拆分后台调度服务.reportProgress({
                    taskId,
                    stageText: nextStatus === 'paused' ? '任务暂停请求已提交' : '任务取消请求已提交',
                    message: nextStatus === 'paused' ? '正在尝试中断当前小说分解请求。' : '正在尝试取消当前小说分解请求。',
                    level: 'warning'
                });
            }
            if (nextStatus === 'queued') {
                await 同步小说拆分任务策略({ taskId });
                await 准备手动继续小说拆分任务(taskId);
                小说拆分后台调度服务.resetLiveState({
                    stageText: '准备继续任务',
                    keepTask: false,
                    keepLastResult: false
                });
            }
            await 更新小说拆分任务状态(taskId, nextStatus);
            设置状态消息(nextStatus === 'paused' ? '任务已暂停。' : nextStatus === 'queued' ? '任务已恢复到排队状态。' : '任务已取消。');
            await refreshBoard();
            if (nextStatus === 'queued') {
                void 小说拆分后台调度服务.tick().then(() => {
                    void refreshBoard();
                });
            }
        } catch (error: any) {
            推送错误提示(`更新任务状态失败：${error?.message || '未知错误'}`);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        const ok = requestConfirm
            ? await requestConfirm({
                title: '删除小说分解任务',
                message: '确定删除这个小说分解任务吗？已保存的数据集不会一起删除。',
                confirmText: '删除',
                cancelText: '取消',
                danger: true
            })
            : true;
        if (!ok) return;
        try {
            await 删除小说拆分任务(taskId);
            设置状态消息('任务已删除。');
            await refreshBoard();
        } catch (error: any) {
            推送错误提示(`删除任务失败：${error?.message || '未知错误'}`);
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-full overflow-hidden text-sm animate-fadeIn">
            <input
                ref={importTxtInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => { void handleImportTxtFile(e); }}
                className="hidden"
            />
            <input
                ref={importEpubInputRef}
                type="file"
                accept=".epub,application/epub+zip"
                onChange={(e) => { void handleImportEpubFile(e); }}
                className="hidden"
            />
            <input
                ref={importJsonInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => { void handleImportShareFile(e); }}
                className="hidden"
            />

            <div className="shrink-0 w-full md:w-40 lg:w-48 border-b md:border-b-0 md:border-r border-gray-800/60 bg-black/40 p-3 overflow-y-auto custom-scrollbar flex flex-row md:flex-col gap-1.5">
                <div className="hidden md:block mb-4 px-2">
                    <h3 className="text-wuxia-gold font-serif font-bold text-base">小说分解</h3>
                    <div className="mt-1 text-[10px] text-gray-500 leading-tight">工作台与全局设置</div>
                </div>
                <div className="flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                    {mobileTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setMobileTab(tab.id)}
                            className={`text-left rounded-lg px-3 py-2.5 text-xs transition-colors whitespace-nowrap ${
                                mobileTab === tab.id
                                    ? 'bg-wuxia-gold/10 text-wuxia-gold border border-wuxia-gold/20 font-medium'
                                    : 'border border-transparent text-gray-400 hover:bg-black/40 hover:text-gray-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-6 relative bg-black/20">
            {mobileTab === 'import' && (
                <div className="space-y-6 max-w-5xl mx-auto">
                    <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                            <div>
                                <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">快速导入</h4>
                                <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl">
                                    推荐先直接导入小说 TXT、EPUB 或分解 ZIP。TXT / EPUB 会先创建数据集，方便你检查章节、删除目录页后再手动开始任务；分解 ZIP 会导入已拆好的结构结果，并可选择是否同时带入原文。
                                </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-3 bg-black/30 rounded-lg px-4 py-2 border border-white/5">
                                <div className="text-center">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">数据集</div>
                                    <div className="text-sm font-bold text-gray-200">{datasetsCount}</div>
                                </div>
                                <div className="w-px h-6 bg-white/10"></div>
                                <div className="text-center">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">任务</div>
                                    <div className="text-sm font-bold text-gray-200">{tasks.length}</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button
                                onClick={() => importTxtInputRef.current?.click()}
                                className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-white/5 bg-black/30 hover:bg-wuxia-gold/5 hover:border-wuxia-gold/30 transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border border-white/5 group-hover:border-wuxia-gold/20 text-gray-300 group-hover:text-wuxia-gold">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <span className="text-sm font-medium text-gray-300 group-hover:text-wuxia-gold">导入 TXT</span>
                            </button>
                            <button
                                onClick={() => importEpubInputRef.current?.click()}
                                className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-white/5 bg-black/30 hover:bg-wuxia-gold/5 hover:border-wuxia-gold/30 transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border border-white/5 group-hover:border-wuxia-gold/20 text-gray-300 group-hover:text-wuxia-gold">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                </div>
                                <span className="text-sm font-medium text-gray-300 group-hover:text-wuxia-gold">导入 EPUB</span>
                            </button>
                            <button
                                onClick={() => importJsonInputRef.current?.click()}
                                className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-white/5 bg-black/30 hover:bg-wuxia-gold/5 hover:border-wuxia-gold/30 transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border border-white/5 group-hover:border-wuxia-gold/20 text-gray-300 group-hover:text-wuxia-gold">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                </div>
                                <span className="text-sm font-medium text-gray-300 group-hover:text-wuxia-gold">导入分解 ZIP</span>
                            </button>
                            <button
                                onClick={() => void handleCreateEmptyDataset()}
                                className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-white/10 bg-black/10 hover:bg-white/5 hover:border-white/30 transition-all duration-300"
                            >
                                <div className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border border-white/5 group-hover:border-white/20 text-gray-400 group-hover:text-gray-200">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                </div>
                                <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">新建空白集</span>
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md shadow-lg overflow-hidden transition-all duration-300">
                        <div
                            className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => setShowStrategySection((prev) => !prev)}
                        >
                            <div>
                                <h4 className="text-base font-serif font-semibold text-gray-200 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    任务与注入策略
                                </h4>
                                <div className="mt-1 text-xs text-gray-500">
                                    调整批量拆分、后台续跑或全局注入策略。
                                </div>
                            </div>
                            <div className={`p-2 rounded-full bg-black/30 border border-white/5 transition-transform duration-300 ${showStrategySection ? 'rotate-180' : ''}`}>
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>

                        {showStrategySection && (
                            <div className="p-6 border-t border-white/5 bg-black/20 space-y-8 animate-fadeIn">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">按 N 章分组</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={1}
                                                value={form.功能模型占位.小说拆分按N章分组}
                                                onChange={(e) => updatePlaceholder('小说拆分按N章分组', Math.max(1, Number(e.target.value) || 1))}
                                                className="w-full border border-white/10 bg-black/40 px-4 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">单次处理批量</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={1}
                                                value={form.功能模型占位.小说拆分单次处理批量}
                                                onChange={(e) => updatePlaceholder('小说拆分单次处理批量', Math.max(1, Number(e.target.value) || 1))}
                                                className="w-full border border-white/10 bg-black/40 px-4 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">自动重试次数</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={0}
                                                value={form.功能模型占位.小说拆分自动重试次数}
                                                onChange={(e) => updatePlaceholder('小说拆分自动重试次数', Math.max(0, Number(e.target.value) || 0))}
                                                className="w-full border border-white/10 bg-black/40 px-4 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-white/5">
                                    <div className="mb-4 text-xs font-medium text-gray-400 uppercase tracking-wider">后台与注入控制</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                        <label className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-transparent hover:border-white/5 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:text-wuxia-gold transition-colors text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                                                <span className="text-sm text-gray-300">后台自动拆分</span>
                                            </div>
                                            <ToggleSwitch checked={Boolean(form.功能模型占位.小说拆分后台运行)} onChange={(checked) => updatePlaceholder('小说拆分后台运行', checked)} ariaLabel="切换后台拆分" />
                                        </label>
                                        <label className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-transparent hover:border-white/5 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:text-wuxia-gold transition-colors text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></div>
                                                <span className="text-sm text-gray-300">自动从断点续跑</span>
                                            </div>
                                            <ToggleSwitch checked={Boolean(form.功能模型占位.小说拆分自动续跑)} onChange={(checked) => updatePlaceholder('小说拆分自动续跑', checked)} ariaLabel="切换自动续跑" />
                                        </label>
                                        <label className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-transparent hover:border-white/5 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:text-blue-400 transition-colors text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                                                <span className="text-sm text-gray-300">主剧情三章滑窗注入</span>
                                            </div>
                                            <ToggleSwitch checked={Boolean(form.功能模型占位.小说拆分主剧情注入)} onChange={(checked) => updatePlaceholder('小说拆分主剧情注入', checked)} ariaLabel="切换主剧情注入" />
                                        </label>
                                        <label className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-transparent hover:border-white/5 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:text-purple-400 transition-colors text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
                                                <span className="text-sm text-gray-300">规划分析当前章注入</span>
                                            </div>
                                            <ToggleSwitch checked={Boolean(form.功能模型占位.小说拆分规划分析注入)} onChange={(checked) => updatePlaceholder('小说拆分规划分析注入', checked)} ariaLabel="切换规划分析注入" />
                                        </label>
                                        <label className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-transparent hover:border-white/5 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:text-emerald-400 transition-colors text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                                                <span className="text-sm text-gray-300">世界演变当前章注入</span>
                                            </div>
                                            <ToggleSwitch checked={Boolean(form.功能模型占位.小说拆分世界演变注入)} onChange={(checked) => updatePlaceholder('小说拆分世界演变注入', checked)} ariaLabel="切换世界演变注入" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {mobileTab === 'datasets' && (
            <div className="space-y-6 max-w-5xl mx-auto">
                <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 border-b border-white/5 pb-6">
                        <div className="flex-1">
                            <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">小说库与注入来源</h4>
                            <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl">
                                这里管理所有的分解数据集，可在此切换正在用于游戏的主剧情注入小说。
                            </div>
                        </div>
                        <div className="w-full lg:w-80 shrink-0">
                            <div className="text-xs text-gray-500 mb-2 font-medium">选择数据集</div>
                            <InlineSelect
                                value={selectedDataset?.id || ''}
                                options={datasetList.map((dataset) => ({
                                    value: dataset.id,
                                    label: `${dataset.激活注入 ? '★ 正在注入 | ' : ''}${dataset.作品名 || dataset.标题 || dataset.id}`
                                }))}
                                onChange={(value) => setSelectedDatasetId(value)}
                                placeholder={datasetList.length > 0 ? '选择数据集' : '暂无数据集'}
                                disabled={datasetList.length <= 0}
                                buttonClassName="bg-black/40 border-white/10 py-3 rounded-lg hover:border-wuxia-gold/30 hover:bg-black/60 transition-all text-gray-200"
                            />
                        </div>
                    </div>

                    {!selectedDataset ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl border border-dashed border-white/10 bg-black/20">
                            <svg className="w-12 h-12 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <div className="text-sm font-medium text-gray-400">目前还没有数据集</div>
                            <div className="mt-1 text-xs text-gray-500">请先使用“导入与配置”面板导入 TXT、EPUB 或分享 ZIP。</div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">当前作品</div>
                                    <div className="text-sm font-bold text-gray-200 truncate" title={selectedDataset.作品名 || selectedDataset.标题}>{selectedDataset.作品名 || selectedDataset.标题}</div>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors relative overflow-hidden group">
                                    <div className={`absolute inset-0 opacity-10 transition-opacity ${selectedDataset.激活注入 ? 'bg-wuxia-gold group-hover:opacity-20' : 'bg-transparent'}`}></div>
                                    <div className="relative">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">注入状态</div>
                                        <div className={`text-sm font-bold ${selectedDataset.激活注入 ? 'text-wuxia-gold' : 'text-gray-400'}`}>{selectedDataset.激活注入 ? '★ 当前注入中' : '未激活'}</div>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">数据来源</div>
                                    <div className="text-sm font-bold text-gray-200">{来源类型文本映射[selectedDataset.来源类型] || selectedDataset.来源类型}</div>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">章节 / 分段</div>
                                    <div className="text-sm font-bold text-gray-200"><span className="text-blue-400">{selectedDataset.总章节数}</span> / <span className="text-emerald-400">{selectedDataset.分段列表.length}</span></div>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">原文长度</div>
                                    <div className="text-sm font-bold text-gray-200">{(selectedDataset.原始文本长度 || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-black/30 p-4 hover:bg-white/5 transition-colors">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">关联任务</div>
                                    <div className="text-sm font-bold text-gray-200">{selectedDatasetTasks.length}</div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <button
                                    onClick={() => void handleSetActiveDataset()}
                                    className={`px-6 py-2.5 rounded-lg text-xs font-medium transition-all ${selectedDataset.激活注入 ? 'bg-wuxia-gold/20 text-wuxia-gold border border-wuxia-gold/30 cursor-default' : 'bg-wuxia-gold/80 text-black hover:bg-wuxia-gold border border-wuxia-gold'}`}
                                    disabled={selectedDataset.激活注入}
                                >
                                    {selectedDataset.激活注入 ? '已是当前注入目标' : '设为当前注入'}
                                </button>
                                <button
                                    onClick={() => void handleStartTaskForDataset()}
                                    className="px-5 py-2.5 rounded-lg text-xs font-medium border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-all"
                                >
                                    {selectedDatasetTasks.length > 0 ? '重新开始任务' : '开始任务'}
                                </button>
                                <button
                                    onClick={() => void handleExportSelectedDataset()}
                                    className="px-5 py-2.5 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                                >
                                    导出分享 ZIP
                                </button>
                                <div className="flex-1"></div>
                                <button
                                    onClick={() => void handleDeleteCurrentDataset()}
                                    className="px-5 py-2.5 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                                >
                                    删除数据集
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {mobileTab === 'chapters' && (
            <div className="space-y-6 max-w-5xl mx-auto h-full flex flex-col">
                <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">章节浏览与筛选</h4>
                            <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl">
                                管理当前数据集的拆章结果，支持批量勾选删除无需注入的目录或番外。
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowChapterSection((prev) => !prev)}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
                            >
                                {showChapterSection ? '收起列表' : '展开列表'}
                                <svg className={`w-3.5 h-3.5 transition-transform ${showChapterSection ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {!showChapterSection ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">列表已折叠</div>
                            <div className="mt-1 text-xs text-gray-500">点击上方按钮展开以查看或筛选章节。</div>
                        </div>
                    </div>
                ) : !selectedDataset ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">未选择数据集</div>
                            <div className="mt-1 text-xs text-gray-500">请先在“数据集”页选择要操作的列表。</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                            <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">可浏览章节</div>
                                <div className="text-lg font-bold text-gray-200">{previewChapters.length}</div>
                            </div>
                            <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                                <div className="text-[10px] text-emerald-500/80 uppercase tracking-wider mb-1">已完成章节</div>
                                <div className="text-lg font-bold text-emerald-400">{chapterProgressSummary.completed}</div>
                            </div>
                            <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                                <div className="text-[10px] text-blue-500/80 uppercase tracking-wider mb-1">处理中/待处理</div>
                                <div className="text-lg font-bold text-blue-400">{chapterProgressSummary.running + chapterProgressSummary.pending}</div>
                            </div>
                            <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                                <div className="text-[10px] text-red-500/80 uppercase tracking-wider mb-1">失败章节</div>
                                <div className="text-lg font-bold text-red-400">{chapterProgressSummary.failed}</div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-white/5 bg-black/30 p-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="text-xs text-gray-400">
                                当前已勾选 <span className="text-wuxia-gold font-bold px-1">{selectedChapterIds.length}</span> / {previewChapters.length} 章。
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={handleToggleSelectAllChapters}
                                    className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                                    disabled={previewChapters.length <= 0}
                                >
                                    {已全选章节 ? '取消全选' : '全选章节'}
                                </button>
                                <button
                                    onClick={() => void handleDeleteSelectedChapters()}
                                    className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${selectedChapterIds.length > 0 ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'border-white/5 bg-black/20 text-gray-600 cursor-not-allowed'}`}
                                    disabled={selectedChapterIds.length <= 0}
                                >
                                    删除已选 ({selectedChapterIds.length})
                                </button>
                            </div>
                        </div>

                        {previewChapters.length <= 0 ? (
                            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                                <div className="text-center">
                                    <div className="text-sm font-medium text-gray-400">暂无可浏览章节</div>
                                    <div className="mt-1 text-xs text-gray-500">当前数据集无有效章节数据。</div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 rounded-xl border border-white/5 bg-black/30 overflow-hidden flex flex-col relative">
                                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none"></div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {chapterProgressList.map(({ chapter, segment, status }) => {
                                        const chapterDisplay = 拆分章节标题显示(chapter.标题 || '', chapter.序号);
                                        const checked = selectedChapterIds.includes(chapter.id);
                                        return (
                                            <div key={chapter.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors group">
                                                <label className="flex items-start gap-4 px-6 py-4 cursor-pointer">
                                                    <div className="pt-1 shrink-0">
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-wuxia-gold border-wuxia-gold text-black' : 'border-gray-600 bg-black/50 group-hover:border-wuxia-gold/50'}`}>
                                                            {checked && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleToggleChapterSelection(chapter.id)}
                                                            className="sr-only"
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                                                            <span className="text-[11px] font-medium text-gray-500 bg-black/40 px-2 py-0.5 rounded border border-white/5">{chapterDisplay.标签}</span>
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${获取章节进度样式(status)}`}>
                                                                {获取章节进度文本(status)}
                                                            </span>
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${segment?.启用注入 === false ? 'border-gray-700 bg-black/50 text-gray-400' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'}`}>
                                                                {segment ? (segment.启用注入 === false ? '注入关' : '注入开') : '未分段'}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm font-medium text-gray-200 group-hover:text-wuxia-gold transition-colors truncate">
                                                            {chapterDisplay.标题}
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
                                                            <div className="flex items-center gap-1.5">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                <span>{chapter.字数 || chapter.内容.length || 0} 字</span>
                                                            </div>
                                                            {segment && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                                    <span className="truncate max-w-[200px]" title={segment.标题}>{segment.标题}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}

            {mobileTab === 'segments' && (
            <div className="space-y-6 h-full flex flex-col">
                <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">分段条目双栏校对</h4>
                            <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl">
                                手工校对分段概括、事实约束、关键事件与角色推进，并支持临时关闭注入或打回重做。
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowSegmentSection((prev) => !prev)}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
                            >
                                {showSegmentSection ? '退出全屏' : '双栏模式'}
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {!showSegmentSection ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">面板已折叠</div>
                            <div className="mt-1 text-xs text-gray-500">点击上方按钮进入双栏模式进行深度校对。</div>
                        </div>
                    </div>
                ) : !selectedDataset ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">未选择数据集</div>
                            <div className="mt-1 text-xs text-gray-500">后台完成拆分后，这里会出现可编辑的分段条目。</div>
                        </div>
                    </div>
                ) : selectedDataset.分段列表.length <= 0 ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">暂无分段</div>
                            <div className="mt-1 text-xs text-gray-500">请先在任务管理中启动拆分，系统会自动生成分段。</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex min-h-0 gap-6">
                        <div className="w-80 shrink-0 flex flex-col rounded-xl border border-white/5 bg-black/30 overflow-hidden">
                            <div className="p-4 border-b border-white/5 bg-black/40">
                                <div className="text-xs font-medium text-gray-300">全部分段目录</div>
                                <div className="mt-1 text-[10px] text-gray-500">共 {selectedDataset.分段列表.length} 个分段</div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                {selectedDataset.分段列表.map((segment, index) => (
                                    <button
                                        key={segment.id}
                                        onClick={() => setSelectedSegmentId(segment.id)}
                                        className={`w-full text-left rounded-lg p-3 transition-all ${selectedSegment?.id === segment.id ? 'border border-wuxia-gold/30 bg-wuxia-gold/10' : 'border border-transparent bg-black/20 hover:bg-white/5 hover:border-white/10'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className={`text-sm font-medium truncate ${selectedSegment?.id === segment.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                                {segment.标题 || `分段 ${index + 1}`}
                                            </div>
                                            <div className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${segment.启用注入 === false ? 'bg-gray-800 text-gray-400' : 'bg-emerald-950/50 text-emerald-400'}`}>
                                                {segment.启用注入 === false ? '注入关' : '注入开'}
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-gray-500 mb-2">
                                            第 {segment.起始章序号} - {segment.结束章序号} 章
                                        </div>
                                        <div className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                            {segment.本组概括 || segment.原文摘要 || '暂无概括'}
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
                                            <span className={`px-1.5 py-0.5 rounded border ${
                                                segment.处理状态 === '已完成' ? 'border-emerald-500/20 text-emerald-400' :
                                                segment.处理状态 === '处理中' ? 'border-blue-500/20 text-blue-400' :
                                                segment.处理状态 === '失败' ? 'border-red-500/20 text-red-400' :
                                                'border-amber-500/20 text-amber-400'
                                            }`}>
                                                {segment.处理状态}
                                            </span>
                                            <div className="flex gap-2">
                                                <span title="事件数">⚡ {segment.关键事件.length}</span>
                                                <span title="角色变化">👤 {segment.角色推进.length}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col min-w-0 rounded-xl border border-white/5 bg-black/30 overflow-hidden relative">
                            {!selectedSegment ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-gray-500 text-sm">请在左侧选择一个分段进行校对</div>
                                </div>
                            ) : (
                                <>
                                    <div className="shrink-0 p-4 border-b border-white/5 bg-black/40 flex flex-wrap items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">分段状态</span>
                                                <span className={`text-sm font-bold ${
                                                    selectedSegment.处理状态 === '已完成' ? 'text-emerald-400' :
                                                    selectedSegment.处理状态 === '失败' ? 'text-red-400' : 'text-blue-400'
                                                }`}>{selectedSegment.处理状态}</span>
                                            </div>
                                            <div className="w-px h-8 bg-white/10"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">注入开关</span>
                                                <span className="text-sm font-bold text-gray-200">{selectedSegment.启用注入 === false ? '已关闭' : '开启中'}</span>
                                            </div>
                                            <div className="w-px h-8 bg-white/10"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">分段字数</span>
                                                <span className="text-sm font-bold text-gray-200">{selectedSegment.字数 || 0}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => void handleToggleSegmentInjection(selectedSegment.id)}
                                                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${selectedSegment.启用注入 === false ? 'border-wuxia-gold/30 text-wuxia-gold hover:bg-wuxia-gold/10' : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'}`}
                                            >
                                                {selectedSegment.启用注入 === false ? '重新启用注入' : '临时关闭注入'}
                                            </button>
                                            <button
                                                onClick={() => void handleRegenerateSegment(selectedSegment.id)}
                                                className="px-3 py-1.5 rounded text-xs font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
                                            >
                                                重置该段重做
                                            </button>
                                        </div>
                                    </div>

                                    {selectedSegment.最近错误 && (
                                        <div className="shrink-0 p-3 bg-red-950/30 border-b border-red-900/30">
                                            <div className="text-xs text-red-400 font-medium flex items-start gap-2">
                                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <span>最近错误：{selectedSegment.最近错误}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-24">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">分段标题</label>
                                                <input
                                                    type="text"
                                                    value={segmentDraft.标题}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 标题: e.target.value }))}
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">时间线 (起点 - 终点)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={segmentDraft.时间线起点}
                                                        onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 时间线起点: e.target.value }))}
                                                        placeholder="YYYY:MM:DD:HH:MM"
                                                        className="flex-1 border border-white/10 bg-black/40 px-3 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all font-mono text-xs"
                                                    />
                                                    <span className="text-gray-500">-</span>
                                                    <input
                                                        type="text"
                                                        value={segmentDraft.时间线终点}
                                                        onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 时间线终点: e.target.value }))}
                                                        placeholder="YYYY:MM:DD:HH:MM"
                                                        className="flex-1 border border-white/10 bg-black/40 px-3 py-2.5 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all font-mono text-xs"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">本组概括 (上帝视角)</label>
                                            <textarea
                                                value={segmentDraft.本组概括文本}
                                                onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 本组概括文本: e.target.value }))}
                                                rows={4}
                                                className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">开局已成立事实</label>
                                                <textarea
                                                    value={segmentDraft.开局已成立事实文本}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 开局已成立事实文本: e.target.value }))}
                                                    rows={5}
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">前组延续事实</label>
                                                <textarea
                                                    value={segmentDraft.前组延续事实文本}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 前组延续事实文本: e.target.value }))}
                                                    rows={5}
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y font-mono text-xs"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                            <div className="rounded-xl border border-white/5 bg-black/20 p-5 space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h5 className="text-sm font-medium text-wuxia-gold">原著硬约束</h5>
                                                        <div className="mt-1 text-[10px] text-gray-500">本组结束后仍不能越过的原著边界</div>
                                                    </div>
                                                    <button
                                                        onClick={() => 新增可见信息条目('原著硬约束')}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                                                        title="新增硬约束"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {segmentDraft.原著硬约束.map((item, index) => (
                                                        <div key={`原著硬约束_${index}`} className="group relative rounded-lg border border-white/5 bg-black/40 p-4 hover:border-white/10 transition-colors">
                                                            <button
                                                                onClick={() => 删除可见信息条目('原著硬约束', index)}
                                                                className="absolute top-3 right-3 p-1.5 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                            <div className="space-y-4">
                                                                <div className="pr-8">
                                                                    <label className="text-[10px] text-gray-500 mb-1 block">约束内容</label>
                                                                    <input
                                                                        type="text"
                                                                        value={item.内容}
                                                                        onChange={(e) => 更新可见信息条目字段('原著硬约束', index, '内容', e.target.value)}
                                                                        className="w-full bg-transparent border-b border-white/10 px-0 py-1 text-sm text-gray-200 focus:border-wuxia-gold outline-none transition-colors"
                                                                        placeholder="输入约束事实..."
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="text-[10px] text-gray-500 mb-1 block">谁知道</label>
                                                                        <textarea
                                                                            value={格式化逐行列表文本(item.信息可见性?.谁知道 || [])}
                                                                            onChange={(e) => 更新可见信息条目可见性字段('原著硬约束', index, '谁知道', 解析索引列表文本(e.target.value))}
                                                                            rows={2}
                                                                            className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-gray-500 mb-1 block">谁不知道</label>
                                                                        <textarea
                                                                            value={格式化逐行列表文本(item.信息可见性?.谁不知道 || [])}
                                                                            onChange={(e) => 更新可见信息条目可见性字段('原著硬约束', index, '谁不知道', 解析索引列表文本(e.target.value))}
                                                                            rows={2}
                                                                            className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <label className="flex items-center gap-2 mt-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={item.信息可见性?.是否仅读者视角可见 === true}
                                                                        onChange={(e) => 更新可见信息条目可见性字段('原著硬约束', index, '是否仅读者视角可见', e.target.checked)}
                                                                        className="w-3.5 h-3.5 rounded bg-black/50 border-white/20 text-wuxia-gold focus:ring-wuxia-gold/30"
                                                                    />
                                                                    <span className="text-xs text-gray-400 cursor-pointer">仅读者/系统可知 (暗线)</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-white/5 bg-black/20 p-5 space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h5 className="text-sm font-medium text-wuxia-gold">可提前铺垫</h5>
                                                        <div className="mt-1 text-[10px] text-gray-500">可提前酝酿但未正式爆发的前摇线索</div>
                                                    </div>
                                                    <button
                                                        onClick={() => 新增可见信息条目('可提前铺垫')}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                                                        title="新增铺垫"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {segmentDraft.可提前铺垫.map((item, index) => (
                                                        <div key={`可提前铺垫_${index}`} className="group relative rounded-lg border border-white/5 bg-black/40 p-4 hover:border-white/10 transition-colors">
                                                            <button
                                                                onClick={() => 删除可见信息条目('可提前铺垫', index)}
                                                                className="absolute top-3 right-3 p-1.5 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                            <div className="space-y-4">
                                                                <div className="pr-8">
                                                                    <label className="text-[10px] text-gray-500 mb-1 block">铺垫内容</label>
                                                                    <input
                                                                        type="text"
                                                                        value={item.内容}
                                                                        onChange={(e) => 更新可见信息条目字段('可提前铺垫', index, '内容', e.target.value)}
                                                                        className="w-full bg-transparent border-b border-white/10 px-0 py-1 text-sm text-gray-200 focus:border-wuxia-gold outline-none transition-colors"
                                                                        placeholder="输入铺垫线索..."
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="text-[10px] text-gray-500 mb-1 block">谁知道</label>
                                                                        <textarea
                                                                            value={格式化逐行列表文本(item.信息可见性?.谁知道 || [])}
                                                                            onChange={(e) => 更新可见信息条目可见性字段('可提前铺垫', index, '谁知道', 解析索引列表文本(e.target.value))}
                                                                            rows={2}
                                                                            className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-gray-500 mb-1 block">谁不知道</label>
                                                                        <textarea
                                                                            value={格式化逐行列表文本(item.信息可见性?.谁不知道 || [])}
                                                                            onChange={(e) => 更新可见信息条目可见性字段('可提前铺垫', index, '谁不知道', 解析索引列表文本(e.target.value))}
                                                                            rows={2}
                                                                            className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <label className="flex items-center gap-2 mt-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={item.信息可见性?.是否仅读者视角可见 === true}
                                                                        onChange={(e) => 更新可见信息条目可见性字段('可提前铺垫', index, '是否仅读者视角可见', e.target.checked)}
                                                                        className="w-3.5 h-3.5 rounded bg-black/50 border-white/20 text-wuxia-gold focus:ring-wuxia-gold/30"
                                                                    />
                                                                    <span className="text-xs text-gray-400 cursor-pointer">仅读者/系统可知 (暗线)</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">本组结束状态</label>
                                                <textarea
                                                    value={segmentDraft.本组结束状态文本}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 本组结束状态文本: e.target.value }))}
                                                    rows={5}
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">给下一组参考</label>
                                                <textarea
                                                    value={segmentDraft.给下一组参考文本}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 给下一组参考文本: e.target.value }))}
                                                    rows={5}
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">登场角色</label>
                                                <textarea
                                                    value={segmentDraft.登场角色文本}
                                                    onChange={(e) => setSegmentDraft((prev) => ({ ...prev, 登场角色文本: e.target.value }))}
                                                    rows={5}
                                                    placeholder="名字(身份)"
                                                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-gray-200 rounded-lg outline-none focus:border-wuxia-gold/50 focus:ring-1 focus:ring-wuxia-gold/20 transition-all leading-relaxed resize-y font-mono text-xs"
                                                />
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-white/5 bg-black/20 p-6 space-y-6">
                                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                                <div>
                                                    <h5 className="text-base font-serif font-semibold text-wuxia-gold">关键事件定义</h5>
                                                    <div className="mt-1 text-xs text-gray-500">维护本组可执行的事件门槛、前后条件及影响沉淀。</div>
                                                </div>
                                                <button
                                                    onClick={() => 新增结构化列表项('关键事件', 创建空关键事件)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 text-wuxia-gold text-xs hover:bg-wuxia-gold/20 transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                    新增事件
                                                </button>
                                            </div>

                                            {segmentDraft.关键事件.map((item, index) => (
                                                <div key={`关键事件_${index}`} className="rounded-lg border border-white/10 bg-black/40 overflow-hidden relative group">
                                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => 删除结构化列表项('关键事件', index)}
                                                            className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                    <div className="p-5 space-y-6">
                                                        <div className="pr-10">
                                                            <input
                                                                type="text"
                                                                value={item.事件名}
                                                                onChange={(e) => 更新结构化列表字段('关键事件', index, '事件名', e.target.value)}
                                                                className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-wuxia-gold px-0 py-1 text-lg font-serif text-gray-100 placeholder-gray-600 outline-none transition-colors"
                                                                placeholder="未命名事件..."
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">开始时间</label>
                                                                <input
                                                                    type="text"
                                                                    value={item.开始时间}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '开始时间', e.target.value)}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">结束时间</label>
                                                                <input
                                                                    type="text"
                                                                    value={item.结束时间}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '结束时间', e.target.value)}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">最早开始</label>
                                                                <input
                                                                    type="text"
                                                                    value={item.最早开始时间}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '最早开始时间', e.target.value)}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">最迟开始</label>
                                                                <input
                                                                    type="text"
                                                                    value={item.最迟开始时间}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '最迟开始时间', e.target.value)}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="text-[10px] text-gray-500 mb-1 block">事件说明</label>
                                                            <textarea
                                                                value={item.事件说明}
                                                                onChange={(e) => 更新结构化列表字段('关键事件', index, '事件说明', e.target.value)}
                                                                rows={2}
                                                                className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">前置条件</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.前置条件)}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '前置条件', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">触发条件</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.触发条件)}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '触发条件', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">阻断条件</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.阻断条件)}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '阻断条件', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">事件结果</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.事件结果)}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '事件结果', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">对下一组影响</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.对下一组影响)}
                                                                    onChange={(e) => 更新结构化列表字段('关键事件', index, '对下一组影响', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-y"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="bg-black/20 rounded border border-white/5 p-3">
                                                            <div className="text-[10px] text-gray-500 mb-2">事件可见范围设定</div>
                                                            <div className="grid grid-cols-2 gap-3 mb-2">
                                                                <input
                                                                    type="text"
                                                                    value={item.信息可见性?.谁知道?.join('，') || ''}
                                                                    onChange={(e) => 更新结构化列表可见性字段('关键事件', index, '谁知道', e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean))}
                                                                    placeholder="谁知道 (逗号分隔)"
                                                                    className="w-full bg-transparent border-b border-white/10 px-1 py-1 text-xs text-gray-300 focus:border-wuxia-gold outline-none"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={item.信息可见性?.谁不知道?.join('，') || ''}
                                                                    onChange={(e) => 更新结构化列表可见性字段('关键事件', index, '谁不知道', e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean))}
                                                                    placeholder="谁不知道 (逗号分隔)"
                                                                    className="w-full bg-transparent border-b border-white/10 px-1 py-1 text-xs text-gray-300 focus:border-wuxia-gold outline-none"
                                                                />
                                                            </div>
                                                            <label className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.信息可见性?.是否仅读者视角可见 === true}
                                                                    onChange={(e) => 更新结构化列表可见性字段('关键事件', index, '是否仅读者视角可见', e.target.checked)}
                                                                    className="w-3 h-3 rounded bg-black/50 border-white/20 text-wuxia-gold focus:ring-wuxia-gold/30"
                                                                />
                                                                <span className="text-[10px] text-gray-400">仅读者/系统可知</span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="rounded-xl border border-white/5 bg-black/20 p-6 space-y-6">
                                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                                <div>
                                                    <h5 className="text-base font-serif font-semibold text-wuxia-gold">角色状态推进</h5>
                                                    <div className="mt-1 text-xs text-gray-500">记录本组内角色在前后状态上的变化和影响承接。</div>
                                                </div>
                                                <button
                                                    onClick={() => 新增结构化列表项('角色推进', 创建空角色推进)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 text-wuxia-gold text-xs hover:bg-wuxia-gold/20 transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                    新增角色推进
                                                </button>
                                            </div>

                                            {segmentDraft.角色推进.map((item, index) => (
                                                <div key={`角色推进_${index}`} className="rounded-lg border border-white/10 bg-black/40 p-4 relative group">
                                                    <button
                                                        onClick={() => 删除结构化列表项('角色推进', index)}
                                                        className="absolute top-3 right-3 p-1.5 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                    <div className="space-y-4 pr-8">
                                                        <div>
                                                            <input
                                                                type="text"
                                                                value={item.角色名}
                                                                onChange={(e) => 更新结构化列表字段('角色推进', index, '角色名', e.target.value)}
                                                                className="w-48 bg-transparent border-b border-white/10 px-0 py-1 text-sm font-bold text-wuxia-gold focus:border-wuxia-gold outline-none transition-colors"
                                                                placeholder="输入角色名..."
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">组前状态</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.本组前状态)}
                                                                    onChange={(e) => 更新结构化列表字段('角色推进', index, '本组前状态', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">本组变化</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.本组变化)}
                                                                    onChange={(e) => 更新结构化列表字段('角色推进', index, '本组变化', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">组后状态</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.本组后状态)}
                                                                    onChange={(e) => 更新结构化列表字段('角色推进', index, '本组后状态', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-500 mb-1 block">下组影响</label>
                                                                <textarea
                                                                    value={格式化逐行列表文本(item.对下一组影响)}
                                                                    onChange={(e) => 更新结构化列表字段('角色推进', index, '对下一组影响', 解析索引列表文本(e.target.value))}
                                                                    rows={3}
                                                                    className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-wuxia-gold/50 outline-none resize-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent border-t border-white/5 pointer-events-none">
                                        <div className="flex justify-end pointer-events-auto">
                                            <button
                                                onClick={() => void handleSaveSegmentEdit()}
                                                className="px-8 py-3 rounded-xl bg-wuxia-gold text-black font-bold shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:bg-yellow-500 hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                                            >
                                                保存当前分段更改
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
            )}

            {mobileTab === 'tasks' && (
            <div className="space-y-6 max-w-5xl mx-auto">
                <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/5 pb-6">
                        <div className="flex-1">
                            <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">任务管理器</h4>
                            <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl">
                                管理拆分任务与后台扫描，监控任务进度、阶段状态与实时日志。
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => void handleStartTaskForDataset()}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-wuxia-gold/30 bg-wuxia-gold/10 text-wuxia-gold hover:bg-wuxia-gold/20 transition-all disabled:opacity-50"
                                disabled={loadingBoard || !selectedDataset}
                            >
                                {selectedDatasetTasks.length > 0 ? '重新开始任务' : '开始任务'}
                            </button>
                            <button
                                onClick={() => {
                                    clearTaskBoardMessage();
                                    if (schedulerState.running) {
                                        小说拆分后台调度服务.stop();
                                        设置状态消息('已停止后台扫描。');
                                    } else {
                                        小说拆分后台调度服务.start();
                                        设置状态消息('已启动后台扫描。');
                                    }
                                }}
                                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${schedulerState.running ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                            >
                                {schedulerState.running ? '停止扫描' : '启动后台扫描'}
                            </button>
                            <button
                                onClick={() => {
                                    clearTaskBoardMessage();
                                    void 小说拆分后台调度服务.tick().then(() => void refreshBoard());
                                }}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                            >
                                立即推进
                            </button>
                            <button
                                onClick={() => void refreshBoard()}
                                className="p-2 rounded-lg border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                                disabled={loadingBoard}
                                title="刷新面板"
                            >
                                <svg className={`w-4 h-4 ${loadingBoard ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">数据集</div>
                            <div className="text-lg font-bold text-gray-200">{datasetsCount}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">总任务</div>
                            <div className="text-lg font-bold text-gray-200">{tasks.length}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">扫描中/挂起</div>
                            <div className="text-lg font-bold text-gray-200"><span className="text-wuxia-gold">{runningTaskCount}</span> / {resumableTaskCount}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">调度器状态</div>
                            <div className={`text-sm font-bold mt-1 ${schedulerState.running ? 'text-emerald-400' : 'text-gray-400'}`}>{schedulerState.running ? (schedulerState.busy ? '● 扫描处理中' : '● 运行监控中') : '○ 已停止'}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">大模型执行器</div>
                            <div className={`text-sm font-bold mt-1 ${schedulerState.executorReady ? 'text-emerald-400' : 'text-amber-400'}`}>{schedulerState.executorReady ? '已接入' : '未就绪'}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/30 p-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">轮询频率</div>
                            <div className="text-sm font-bold mt-1 text-gray-200">{Math.max(1, Math.floor((schedulerState.intervalMs || 0) / 1000))} s/次</div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h5 className="text-sm font-medium text-gray-300 px-1">任务队列</h5>
                        </div>
                        {tasks.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                                <div className="text-sm font-medium text-gray-400 mb-1">当前无任务</div>
                                <div className="text-xs text-gray-500">导入小说并开始拆分后，将在此显示任务进度。</div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tasks.slice(0, 8).map((task) => (
                                    <div key={task.id} className={`rounded-xl border bg-black/30 p-5 transition-all ${task.状态 === 'running' ? 'border-wuxia-gold/30 shadow-[0_0_15px_rgba(212,175,55,0.05)]' : 'border-white/5 hover:border-white/10'}`}>
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-gray-200 truncate">{task.名称}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={task.id}>ID: {task.id}</div>
                                            </div>
                                            <div className={`shrink-0 px-2 py-1 rounded text-[10px] font-medium border ${
                                                task.状态 === 'running' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                                task.状态 === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                                task.状态 === 'failed' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                                task.状态 === 'paused' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                                'bg-gray-500/10 border-gray-500/30 text-gray-400'
                                            }`}>
                                                {获取小说拆分任务状态文本(task.状态)}
                                            </div>
                                        </div>

                                        <div className="text-[11px] text-gray-400 mb-3 line-clamp-2">
                                            {获取小说拆分任务摘要(task)}
                                        </div>

                                        <div className="mb-3">
                                            <div className="flex justify-between text-[10px] text-gray-500 mb-1.5">
                                                <span>进度 {(task.进度.百分比 || 0).toFixed(1)}%</span>
                                                <span>{task.进度.已完成分段数} / {task.进度.总分段数} 段</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-black/50 overflow-hidden border border-white/5">
                                                <div
                                                    className={`h-full transition-all duration-500 ${
                                                        task.状态 === 'failed' ? 'bg-red-500' :
                                                        task.状态 === 'completed' ? 'bg-emerald-500' :
                                                        task.状态 === 'running' ? 'bg-blue-500' : 'bg-gray-500'
                                                    }`}
                                                    style={{ width: `${Math.max(0, Math.min(100, task.进度.百分比))}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
                                            <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                <span>批 {task.单次处理批量}</span>
                                                <span>{task.后台运行 ? '后台开' : '后台关'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(task.状态 === 'running' || task.状态 === 'queued') && (
                                                    <button onClick={() => void handleChangeTaskStatus(task.id, 'paused')} className="px-2.5 py-1 rounded bg-black/40 border border-white/10 text-[10px] text-gray-300 hover:bg-white/5 transition-colors">暂停</button>
                                                )}
                                                {(task.状态 === 'paused' || task.状态 === 'failed') && (
                                                    <button onClick={() => void handleChangeTaskStatus(task.id, 'queued')} className="px-2.5 py-1 rounded bg-blue-950/30 border border-blue-500/30 text-[10px] text-blue-300 hover:bg-blue-900/50 transition-colors">继续</button>
                                                )}
                                                {task.状态 !== 'completed' && task.状态 !== 'cancelled' && (
                                                    <button onClick={() => void handleChangeTaskStatus(task.id, 'cancelled')} className="px-2.5 py-1 rounded bg-black/40 border border-white/10 text-[10px] text-gray-300 hover:bg-white/5 transition-colors">取消</button>
                                                )}
                                                <button onClick={() => void handleDeleteTask(task.id)} className="px-2.5 py-1 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 hover:bg-red-900/40 transition-colors">删除</button>
                                            </div>
                                        </div>

                                        {task.最近错误 && (
                                            <div className="mt-3 p-2.5 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400">
                                                {task.最近错误}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 flex flex-col">
                        <div className="flex items-center justify-between">
                            <h5 className="text-sm font-medium text-gray-300 px-1">调度监控</h5>
                            <button
                                onClick={() => setShowLiveMonitor((prev) => !prev)}
                                className="text-xs text-wuxia-gold hover:underline"
                            >
                                {showLiveMonitor ? '收起流式面板' : '展开流式面板'}
                            </button>
                        </div>
                        
                        <div className="rounded-xl border border-white/5 bg-black/30 p-4 space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">当前状态</div>
                            <div className="text-xs text-gray-300 truncate" title={schedulerState.currentTaskName || '无活动任务'}>
                                <span className="text-gray-500 mr-2">任务</span> {schedulerState.currentTaskName || '—'}
                            </div>
                            <div className="text-xs text-gray-300">
                                <span className="text-gray-500 mr-2">阶段</span> {schedulerState.currentStageText || '等待中'}
                            </div>
                            <div className="text-xs text-gray-300">
                                <span className="text-gray-500 mr-2">扫描</span> {formatTime(schedulerState.lastTickAt)}
                            </div>
                        </div>

                        {showLiveMonitor && (
                            <div className="flex flex-col md:flex-row gap-4 h-[360px] shrink-0">
                                <div className="flex-1 flex flex-col rounded-xl border border-cyan-500/20 bg-black/40 overflow-hidden relative h-full">
                                    <div className="px-3 py-2 bg-cyan-950/30 border-b border-cyan-500/20 flex justify-between items-center absolute top-0 left-0 right-0 z-10 backdrop-blur-sm">
                                        <span className="text-[10px] font-medium text-cyan-300 uppercase tracking-wider">模型流式输出</span>
                                        <span className="flex h-2 w-2 relative">
                                            {schedulerState.busy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>}
                                            <span className={`relative inline-flex rounded-full h-2 w-2 ${schedulerState.busy ? 'bg-cyan-500' : 'bg-gray-600'}`}></span>
                                        </span>
                                    </div>
                                    <pre
                                        ref={实时流区域Ref}
                                        className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-10 text-[10px] font-mono text-cyan-100 leading-relaxed whitespace-pre-wrap break-words"
                                    >
                                        {schedulerState.liveStreamText || '>> 等待模型响应...'}
                                    </pre>
                                </div>
                                <div className="flex-1 md:max-w-md flex flex-col rounded-xl border border-white/5 bg-black/30 overflow-hidden h-full">
                                    <div className="px-3 py-2 bg-black/40 border-b border-white/5">
                                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">最近日志</span>
                                    </div>
                                    <div ref={实时日志区域Ref} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                        {(schedulerState.recentLogs || []).length === 0 ? (
                                            <div className="text-[10px] text-gray-600 text-center py-4">暂无日志记录</div>
                                        ) : (
                                            schedulerState.recentLogs.map((log) => (
                                                <div key={log.id} className="text-[10px] leading-relaxed border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                                    <div className="flex justify-between text-gray-500 mb-0.5">
                                                        <span>{formatTime(log.timestamp).split(' ')[1]}</span>
                                                        <span className={log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-emerald-400' : 'text-blue-400'}>{log.level}</span>
                                                    </div>
                                                    <div className="text-gray-300">{log.text}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {selectedDataset && (
                    <div className="rounded-xl border border-white/5 bg-black/20 p-5 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h5 className="text-sm font-medium text-gray-300">当前数据集处理进度纵览</h5>
                            <div className="text-[10px] text-gray-500 bg-black/40 px-2 py-1 rounded">共 {chapterProgressSummary.total} 章</div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                            {chapterProgressList.map(({ chapter, status }) => (
                                <div key={`progress_${chapter.id}`} className={`p-2 rounded border ${
                                    status === '已完成' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' :
                                    status === '处理中' ? 'bg-blue-950/20 border-blue-500/20 text-blue-400' :
                                    status === '失败' ? 'bg-red-950/20 border-red-500/20 text-red-400' :
                                    status === '待处理' ? 'bg-amber-950/20 border-amber-500/20 text-amber-400' :
                                    'bg-black/30 border-white/5 text-gray-500'
                                }`} title={chapter.标题}>
                                    <div className="text-[10px] font-medium truncate">{拆分章节标题显示(chapter.标题 || '', chapter.序号).标签}</div>
                                    <div className="text-[10px] opacity-70 mt-0.5">{status}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            )}

            {mobileTab === 'snapshots' && (
            <div className="space-y-6 max-w-5xl mx-auto h-full flex flex-col">
                <div className="rounded-xl border border-white/5 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-md p-6 shadow-xl shrink-0">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 border-b border-white/5 pb-6">
                        <div className="flex-1">
                            <h4 className="text-lg font-serif font-semibold text-wuxia-gold tracking-wide">注入快照查看</h4>
                            <div className="mt-1.5 text-xs text-gray-400/80 leading-relaxed max-w-2xl space-y-1">
                                <p>展示当前数据集生成的三套树状注入文本，分别对应主剧情、规划分析与世界演变链路。</p>
                                <p className="text-gray-500">主剧情保留概括，规划分析承接门控信息，世界演变承接状态变化。此处展示完整快照；运行时按链路注入上限裁剪。</p>
                            </div>
                        </div>
                        <div className="w-full lg:w-80 shrink-0">
                            <div className="text-xs text-gray-500 mb-2 font-medium">选择数据集</div>
                            <InlineSelect
                                value={selectedDataset?.id || ''}
                                options={datasetList.map((dataset) => ({
                                    value: dataset.id,
                                    label: dataset.作品名 || dataset.标题 || dataset.id
                                }))}
                                onChange={(value) => setSelectedDatasetId(value)}
                                placeholder={datasetList.length > 0 ? '选择数据集' : '暂无数据集'}
                                disabled={datasetList.length <= 0}
                                buttonClassName="bg-black/40 border-white/10 py-3 rounded-lg hover:border-wuxia-gold/30 hover:bg-black/60 transition-all text-gray-200"
                            />
                        </div>
                    </div>
                </div>

                {!selectedDataset ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">未选择数据集</div>
                            <div className="mt-1 text-xs text-gray-500">导入或创建数据集后，后台拆分完成时会在这里生成树状快照。</div>
                        </div>
                    </div>
                ) : selectedSnapshots.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20">
                        <div className="text-center">
                            <div className="text-sm font-medium text-gray-400">暂无快照数据</div>
                            <div className="mt-1 text-xs text-gray-500">数据集“{selectedDataset.作品名 || selectedDataset.标题}”还未生成快照。请先启动任务。</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                        {selectedSnapshots.map((snapshot) => {
                            const treeNodes = selectedSnapshotTrees[snapshot.目标链路] || [];
                            const snapshotTreeKey = `${snapshot.数据集ID}_${snapshot.目标链路}`;
                            const treeExpanded = expandedSnapshotTreeKeys[snapshotTreeKey] === true;
                            
                            const getIconForLink = (link: string) => {
                                if (link === 'main_story') return <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
                                if (link === 'planning') return <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
                                return <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
                            };

                            return (
                                <div key={snapshotTreeKey} className="rounded-xl border border-white/5 bg-black/30 overflow-hidden shadow-lg">
                                    <div className="p-5 border-b border-white/5 bg-black/40 flex flex-wrap items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2.5 rounded-lg bg-black/50 border border-white/5`}>
                                                {getIconForLink(snapshot.目标链路)}
                                            </div>
                                            <div>
                                                <div className="text-base font-bold text-gray-100">{snapshot.标题}</div>
                                                <div className="mt-1 text-xs text-gray-500 flex items-center gap-3">
                                                    <span>{注入目标文本映射[snapshot.目标链路]}链路</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                                    <span>条目数 {snapshot.条目数}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                                    <span>根节点 {treeNodes.length}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                                    <span>更新于 {formatTime(snapshot.updatedAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-medium text-wuxia-gold">树状上下文视图</div>
                                            <button
                                                onClick={() => 切换快照树展开(snapshotTreeKey)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-black/40 text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
                                            >
                                                {treeExpanded ? '收起树视图' : '展开树视图'}
                                                <svg className={`w-3 h-3 transition-transform ${treeExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                        </div>

                                        {!treeExpanded ? (
                                            <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center">
                                                <div className="text-sm text-gray-400">视图已折叠</div>
                                                <div className="mt-1 text-xs text-gray-500">点击上方按钮展开以查看当前链路的注入树结构。</div>
                                            </div>
                                        ) : treeNodes.length > 0 ? (
                                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar rounded-lg border border-white/5 bg-black/40 p-4">
                                                {treeNodes.map((node) => (
                                                    <注入树节点预览 key={node.id} node={node} />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center">
                                                <div className="text-sm text-gray-400">无树状数据</div>
                                                <div className="mt-1 text-xs text-gray-500">当前链路暂无可渲染的节点数据，可能需要刷新或重新聚合。</div>
                                            </div>
                                        )}

                                        <details className="group rounded-lg border border-white/5 bg-black/30 overflow-hidden">
                                            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium text-gray-300 flex items-center justify-between hover:bg-white/5 transition-colors">
                                                <span className="flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                                    查看原始文本快照
                                                </span>
                                                <svg className="w-3.5 h-3.5 text-gray-500 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </summary>
                                            <div className="border-t border-white/5 bg-black/50 p-4">
                                                <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap text-emerald-100 max-h-64 overflow-y-auto custom-scrollbar">
                                                    {snapshot.文本 || '暂无内容'}
                                                </pre>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            )}

            {message && <p className="text-xs text-emerald-300 animate-pulse">{message}</p>}

            <div className="pt-6 border-t border-emerald-500/20 mt-8">
                <GameButton onClick={handleSave} variant="primary" className="w-full">
                    {showSuccess ? '✔ 配置已保存' : '保存设置'}
                </GameButton>
            </div>
            </div>
        </div>
    );
};

export default NovelDecompositionSettings;
