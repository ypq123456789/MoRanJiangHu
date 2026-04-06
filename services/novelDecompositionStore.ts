import type {
    小说拆分任务状态类型,
    小说拆分任务结构,
    小说拆分任务进度结构,
    小说拆分数据集结构,
    小说拆分分段模式类型,
    小说拆分树节点结构,
    小说拆分分段结构,
    小说拆分注入快照结构,
    小说拆分章节结构,
    小说拆分分段处理状态类型
} from '../types';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as dbService from './dbService';
import { 设置键 } from '../utils/settingsSchema';
import { 默认小说时间线起点, 尝试规范化小说时间锚点, 规范化小说时间锚点 } from './novelDecompositionTime';

const 小说拆分数据集版本 = 7;
const 小说拆分分享格式标识 = 'wuxia-novel-decomposition-zip';
const 小说拆分分享版本 = 1;
const 小说拆分分享清单文件 = 'manifest.json';
const 小说拆分分享分解文件 = 'decomposition.json';
const 小说拆分分享原文文件 = 'raw-content.json';

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value : '');
const 读取布尔 = (value: unknown, fallback = false): boolean => typeof value === 'boolean' ? value : fallback;
const 读取数字 = (value: unknown, fallback: number): number => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const 标准化登场角色项文本 = (value: unknown): string => 读取文本(value)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([（(])/g, '$1')
    .replace(/\s*([)）])/g, '$1')
    .trim();

const 合并同名登场角色 = (items: unknown[]): string[] => {
    const ordered: Array<{ 名字: string; identities: string[]; order: number }> = [];
    const indexMap = new Map<string, number>();
    const seenRaw = new Set<string>();
    const pushIdentity = (bucket: string[], value: string) => {
        const normalized = value.trim();
        if (!normalized) return;
        if (!bucket.includes(normalized)) {
            bucket.push(normalized);
        }
    };

    (Array.isArray(items) ? items : []).forEach((item, index) => {
        const raw = 标准化登场角色项文本(item);
        if (!raw || seenRaw.has(raw)) return;
        seenRaw.add(raw);
        const matched = raw.match(/^(.+?)[（(]\s*([\s\S]+?)\s*[)）]$/u);
        const 名字 = (matched?.[1] || raw).trim();
        const 身份 = (matched?.[2] || '').trim();
        if (!名字) return;
        const existingIndex = indexMap.get(名字);
        if (typeof existingIndex === 'number') {
            pushIdentity(ordered[existingIndex].identities, 身份);
            return;
        }
        const nextIndex = ordered.length;
        indexMap.set(名字, nextIndex);
        ordered.push({
            名字,
            identities: 身份 ? [身份] : [],
            order: index
        });
    });

    return ordered
        .sort((a, b) => a.order - b.order)
        .map((item) => (item.identities.length > 0 ? `${item.名字}(${item.identities.join(' / ')})` : item.名字));
};

const 生成ID = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 标准化任务状态 = (value: unknown): 小说拆分任务状态类型 => {
    switch (value) {
        case 'queued':
        case 'running':
        case 'paused':
        case 'completed':
        case 'failed':
        case 'cancelled':
        case 'idle':
            return value;
        default:
            return 'idle';
    }
};

const 标准化任务阶段 = (value: unknown): 小说拆分任务结构['当前阶段'] => {
    switch (value) {
        case 'prepare':
        case 'segmenting':
        case 'processing':
        case 'snapshotting':
        case 'completed':
        case 'failed':
        case 'idle':
            return value;
        default:
            return 'idle';
    }
};

const 标准化分段模式 = (value: unknown): 小说拆分分段模式类型 => {
    switch (value) {
        case 'n_chapters':
        case 'custom_ranges':
        case 'single_chapter':
            return value;
        default:
            return 'single_chapter';
    }
};

const 标准化来源类型 = (value: unknown): 小说拆分数据集结构['来源类型'] => {
    switch (value) {
        case 'txt':
        case 'epub':
        case 'shared_json':
        case 'novel':
            return value;
        default:
            return 'novel';
    }
};

const 标准化分段处理状态 = (value: unknown): 小说拆分分段处理状态类型 => {
    switch (value) {
        case '处理中':
        case '已完成':
        case '失败':
        case '待处理':
            return value;
        default:
            return '待处理';
    }
};

const 标准化时间线事件 = (raw: any) => ({
    标题: 读取文本(raw?.标题).trim(),
    时间锚点: 尝试规范化小说时间锚点(raw?.时间锚点, 默认小说时间线起点, 默认小说时间线起点),
    描述: 读取文本(raw?.描述).trim(),
    涉及角色: Array.isArray(raw?.涉及角色) ? raw.涉及角色.map((item: unknown) => 读取文本(item).trim()).filter(Boolean) : []
});

const 标准化文本数组 = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.map((item: unknown) => 读取文本(item).trim()).filter(Boolean)
        : []
);

const 标准化信息可见性 = (raw: any) => ({
    谁知道: 标准化文本数组(raw?.谁知道),
    谁不知道: 标准化文本数组(raw?.谁不知道),
    是否仅读者视角可见: 读取布尔(raw?.是否仅读者视角可见, false)
});

const 标准化可见信息条目 = (raw: any): 小说拆分分段结构['原著硬约束'][number] => ({
    内容: 读取文本(raw?.内容).trim(),
    信息可见性: 标准化信息可见性(raw?.信息可见性)
});

const 标准化可见信息条目数组 = (value: unknown): 小说拆分分段结构['原著硬约束'] => (
    Array.isArray(value)
        ? value
            .map((item: unknown) => 标准化可见信息条目(item))
            .filter((item) => item.内容)
        : []
);

const 标准化关键事件 = (raw: any) => {
    const 开始时间 = 尝试规范化小说时间锚点(raw?.开始时间, 默认小说时间线起点, 默认小说时间线起点);
    const 最早开始时间 = 尝试规范化小说时间锚点(
        raw?.最早开始时间,
        开始时间 || 默认小说时间线起点,
        开始时间 || 默认小说时间线起点
    );
    const 最迟开始时间 = 尝试规范化小说时间锚点(
        raw?.最迟开始时间,
        最早开始时间 || 开始时间 || 默认小说时间线起点,
        最早开始时间 || 开始时间 || 默认小说时间线起点
    );
    const 结束时间 = 尝试规范化小说时间锚点(
        raw?.结束时间,
        最迟开始时间 || 开始时间 || 默认小说时间线起点,
        最迟开始时间 || 开始时间 || 默认小说时间线起点
    );
    return {
        事件名: 读取文本(raw?.事件名).trim(),
        事件说明: 读取文本(raw?.事件说明).trim(),
        开始时间,
        最早开始时间,
        最迟开始时间,
        结束时间,
        前置条件: 标准化文本数组(raw?.前置条件),
        触发条件: 标准化文本数组(raw?.触发条件),
        阻断条件: 标准化文本数组(raw?.阻断条件),
        事件结果: 标准化文本数组(raw?.事件结果),
        对下一组影响: 标准化文本数组(raw?.对下一组影响),
        信息可见性: 标准化信息可见性(raw?.信息可见性)
    };
};

const 标准化角色推进 = (raw: any) => ({
    角色名: 读取文本(raw?.角色名).trim(),
    本组前状态: 标准化文本数组(raw?.本组前状态),
    本组变化: 标准化文本数组(raw?.本组变化),
    本组后状态: 标准化文本数组(raw?.本组后状态),
    对下一组影响: 标准化文本数组(raw?.对下一组影响)
});

const 构建分段时间线 = (params: {
    关键事件: ReturnType<typeof 标准化关键事件>[];
}): 小说拆分分段结构['时间线'] => {
    const result: 小说拆分分段结构['时间线'] = [];
    params.关键事件.forEach((event) => {
        const 时间锚点 = event.开始时间 || event.最早开始时间 || event.最迟开始时间 || event.结束时间;
        if (!event.事件名 && !event.事件说明 && !时间锚点) return;
        result.push({
            标题: event.事件名 || '未命名事件',
            时间锚点,
            描述: [event.事件说明, event.事件结果.length > 0 ? `结果：${event.事件结果.join('；')}` : ''].filter(Boolean).join('；'),
            涉及角色: []
        });
    });
    return result.filter((item) => item.标题 || item.描述 || item.时间锚点);
};

const 标准化章节 = (raw: any, 数据集ID: string): 小说拆分章节结构 => {
    const now = Date.now();
    const 内容 = 读取文本(raw?.内容);
    return {
        id: 读取文本(raw?.id).trim() || 生成ID('novel_chapter'),
        数据集ID,
        序号: Math.max(1, Math.floor(读取数字(raw?.序号, 1))),
        标题: 读取文本(raw?.标题).trim() || '未命名章节',
        内容,
        字数: Math.max(0, Math.floor(读取数字(raw?.字数, 内容.length))),
        createdAt: Math.floor(读取数字(raw?.createdAt, now)),
        updatedAt: Math.floor(读取数字(raw?.updatedAt, now))
    };
};

const 标准化分段 = (raw: any, 数据集ID: string): 小说拆分分段结构 => {
    const now = Date.now();
    const 原文内容 = 读取文本(raw?.原文内容 || raw?.原文);
    const 原文摘要 = 读取文本(raw?.原文摘要);
    const 起始章序号 = Math.max(1, Math.floor(读取数字(raw?.起始章序号, 1)));
    const 结束章序号 = Math.max(起始章序号, Math.floor(读取数字(raw?.结束章序号, raw?.起始章序号 ?? 1)));
    const 构建章节范围文本 = (start: number, end: number): string => (
        start === end ? `第${start}章` : `第${start}章-第${end}章`
    );
    const 标准化章节范围 = (value: unknown): string => {
        const normalized = 读取文本(value)
            .trim()
            .replace(/\s*[-~～—]+\s*/gu, '-');
        if (!normalized) {
            return 构建章节范围文本(起始章序号, 结束章序号);
        }
        if (/^[-~～—]/u.test(normalized)) {
            return 构建章节范围文本(起始章序号, 结束章序号);
        }
        return normalized;
    };
    const 关键事件 = Array.isArray(raw?.关键事件) ? raw.关键事件.map((item: unknown) => 标准化关键事件(item)) : [];
    const 时间线 = Array.isArray(raw?.时间线)
        ? raw.时间线.map((item: unknown) => 标准化时间线事件(item))
        : 构建分段时间线({
            关键事件
        });
    const 时间线起点 = 尝试规范化小说时间锚点(raw?.时间线起点, 默认小说时间线起点, 默认小说时间线起点);
    const 时间线终点 = 尝试规范化小说时间锚点(
        raw?.时间线终点,
        时间线起点 || 默认小说时间线起点,
        时间线起点 || 默认小说时间线起点
    );
    return {
        id: 读取文本(raw?.id).trim() || 生成ID('novel_segment'),
        数据集ID,
        组号: Math.max(1, Math.floor(读取数字(raw?.组号, 1))),
        标题: 读取文本(raw?.标题).trim() || '未命名分段',
        章节范围: 标准化章节范围(raw?.章节范围),
        章节标题: 标准化文本数组(raw?.章节标题),
        是否开局组: 读取布尔(raw?.是否开局组, false),
        起始章序号,
        结束章序号,
        启用注入: 读取布尔(raw?.启用注入, true),
        原文内容,
        字数: Math.max(0, Math.floor(读取数字(raw?.字数, 原文内容.length))),
        原文摘要,
        本组概括: 读取文本(raw?.本组概括).trim(),
        开局已成立事实: 标准化文本数组(raw?.开局已成立事实),
        前组延续事实: 标准化文本数组(raw?.前组延续事实),
        本组结束状态: 标准化文本数组(raw?.本组结束状态),
        给下一组参考: 标准化文本数组(raw?.给下一组参考),
        原著硬约束: 标准化可见信息条目数组(raw?.原著硬约束),
        可提前铺垫: 标准化可见信息条目数组(raw?.可提前铺垫),
        关键事件,
        角色推进: Array.isArray(raw?.角色推进) ? raw.角色推进.map((item: unknown) => 标准化角色推进(item)) : [],
        登场角色: 合并同名登场角色(raw?.登场角色),
        时间线,
        时间线起点,
        时间线终点,
        处理状态: 标准化分段处理状态(raw?.处理状态),
        最近错误: 读取文本(raw?.最近错误),
        createdAt: Math.floor(读取数字(raw?.createdAt, now)),
        updatedAt: Math.floor(读取数字(raw?.updatedAt, now))
    };
};

const 标准化树节点 = (raw: any, 数据集ID: string): 小说拆分树节点结构 => ({
    id: 读取文本(raw?.id).trim() || 生成ID('novel_node'),
    数据集ID,
    父节点ID: 读取文本(raw?.父节点ID).trim() || undefined,
    类型: raw?.类型 || 'summary',
    标题: 读取文本(raw?.标题).trim() || '未命名节点',
    内容: 读取文本(raw?.内容),
    目标链路: Array.isArray(raw?.目标链路)
        ? raw.目标链路.filter((item: unknown) => item === 'main_story' || item === 'planning' || item === 'world_evolution')
        : [],
    关联分段ID列表: Array.isArray(raw?.关联分段ID列表) ? raw.关联分段ID列表.map((item: unknown) => 读取文本(item).trim()).filter(Boolean) : [],
    排序: Math.floor(读取数字(raw?.排序, 0)),
    子节点: Array.isArray(raw?.子节点) ? raw.子节点.map((item: unknown) => 标准化树节点(item, 数据集ID)) : []
});

export const 规范化小说拆分数据集 = (raw: any): 小说拆分数据集结构 => {
    const now = Date.now();
    const 数据集ID = 读取文本(raw?.id).trim() || 生成ID('novel_dataset');
    const 原始文本 = 读取文本(raw?.原始文本);
    const 章节列表 = Array.isArray(raw?.章节列表) ? raw.章节列表.map((item: unknown) => 标准化章节(item, 数据集ID)) : [];
    const 分段列表 = Array.isArray(raw?.分段列表) ? raw.分段列表.map((item: unknown) => 标准化分段(item, 数据集ID)) : [];
    return {
        id: 数据集ID,
        标题: 读取文本(raw?.标题).trim() || '未命名数据集',
        作品名: 读取文本(raw?.作品名).trim() || '未命名作品',
        来源类型: 标准化来源类型(raw?.来源类型),
        schemaVersion: Math.max(1, Math.floor(读取数字(raw?.schemaVersion, 小说拆分数据集版本))),
        原始文件名: 读取文本(raw?.原始文件名).trim(),
        原始文本长度: Math.max(0, Math.floor(读取数字(raw?.原始文本长度, 原始文本.length))),
        原始文本,
        原始文本摘要: 读取文本(raw?.原始文本摘要),
        总章节数: Math.max(0, Math.floor(读取数字(raw?.总章节数, 章节列表.length))),
        章节列表,
        分段模式: 标准化分段模式(raw?.分段模式),
        每批章数: Math.max(1, Math.floor(读取数字(raw?.每批章数, 1))),
        默认时间线起点: 规范化小说时间锚点(raw?.默认时间线起点, 默认小说时间线起点),
        是否识别原著时间线: 读取布尔(raw?.是否识别原著时间线, false),
        激活注入: 读取布尔(raw?.激活注入, false),
        当前阶段概括: 读取文本(raw?.当前阶段概括),
        核心角色摘要: 标准化文本数组(raw?.核心角色摘要),
        核心角色: 标准化文本数组(raw?.核心角色),
        分段列表,
        注入树: Array.isArray(raw?.注入树) ? raw.注入树.map((item: unknown) => 标准化树节点(item, 数据集ID)) : [],
        createdAt: Math.floor(读取数字(raw?.createdAt, now)),
        updatedAt: Math.floor(读取数字(raw?.updatedAt, now))
    };
};

export const 规范化小说拆分任务进度 = (raw: any): 小说拆分任务进度结构 => {
    const 总分段数 = Math.max(0, Math.floor(读取数字(raw?.总分段数, 0)));
    const 已完成分段数 = Math.max(0, Math.floor(读取数字(raw?.已完成分段数, 0)));
    const 失败分段数 = Math.max(0, Math.floor(读取数字(raw?.失败分段数, 0)));
    const 当前分段索引 = Math.max(0, Math.floor(读取数字(raw?.当前分段索引, 0)));
    const 百分比 = 总分段数 > 0
        ? Math.max(0, Math.min(100, Math.round((已完成分段数 / 总分段数) * 100)))
        : Math.max(0, Math.min(100, Math.floor(读取数字(raw?.百分比, 0))));

    return {
        总分段数,
        已完成分段数,
        失败分段数,
        当前分段索引,
        百分比
    };
};

export const 规范化小说拆分任务 = (raw: any): 小说拆分任务结构 => {
    const now = Date.now();
    return {
        id: 读取文本(raw?.id).trim() || 生成ID('novel_task'),
        数据集ID: 读取文本(raw?.数据集ID).trim(),
        名称: 读取文本(raw?.名称).trim() || '未命名拆分任务',
        状态: 标准化任务状态(raw?.状态),
        当前阶段: 标准化任务阶段(raw?.当前阶段),
        分段模式: 标准化分段模式(raw?.分段模式),
        每批章数: Math.max(1, Math.floor(读取数字(raw?.每批章数, 1))),
        后台运行: 读取布尔(raw?.后台运行, true),
        自动续跑: 读取布尔(raw?.自动续跑, true),
        单次处理批量: Math.max(1, Math.floor(读取数字(raw?.单次处理批量, 1))),
        自动重试次数: Math.max(0, Math.floor(读取数字(raw?.自动重试次数, 0))),
        当前游标: Math.max(0, Math.floor(读取数字(raw?.当前游标, 0))),
        已完成分段ID列表: Array.isArray(raw?.已完成分段ID列表) ? raw.已完成分段ID列表.map((item: unknown) => 读取文本(item).trim()).filter(Boolean) : [],
        失败分段ID列表: Array.isArray(raw?.失败分段ID列表) ? raw.失败分段ID列表.map((item: unknown) => 读取文本(item).trim()).filter(Boolean) : [],
        最近错误: 读取文本(raw?.最近错误),
        进度: 规范化小说拆分任务进度(raw?.进度),
        createdAt: Math.floor(读取数字(raw?.createdAt, now)),
        updatedAt: Math.floor(读取数字(raw?.updatedAt, now)),
        lastRunAt: raw?.lastRunAt ? Math.floor(读取数字(raw?.lastRunAt, now)) : undefined,
        completedAt: raw?.completedAt ? Math.floor(读取数字(raw?.completedAt, now)) : undefined
    };
};

export const 读取小说拆分数据集列表 = async (): Promise<小说拆分数据集结构[]> => {
    const raw = await dbService.读取设置(设置键.小说分解数据集);
    if (!Array.isArray(raw)) return [];
    const list = raw.map((item) => 规范化小说拆分数据集(item));
    if (list.length > 0 && !list.some((item) => item.激活注入)) {
        return list.map((item, index) => ({
            ...item,
            激活注入: index === 0
        }));
    }
    return list;
};

export const 保存小说拆分数据集列表 = async (items: 小说拆分数据集结构[]): Promise<void> => {
    const normalizedList = (Array.isArray(items) ? items : []).map((item) => 规范化小说拆分数据集(item));
    const ensured = normalizedList.length > 0 && !normalizedList.some((item) => item.激活注入)
        ? normalizedList.map((item, index) => ({ ...item, 激活注入: index === 0 }))
        : normalizedList;
    await dbService.保存设置(设置键.小说分解数据集, ensured.map((item) => 深拷贝(item)));
};

export const 读取小说拆分任务列表 = async (): Promise<小说拆分任务结构[]> => {
    const raw = await dbService.读取设置(设置键.小说分解任务);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => 规范化小说拆分任务(item));
};

export const 保存小说拆分任务列表 = async (items: 小说拆分任务结构[]): Promise<void> => {
    await dbService.保存设置(设置键.小说分解任务, (Array.isArray(items) ? items : []).map((item) => 深拷贝(规范化小说拆分任务(item))));
};

export const 读取小说拆分注入快照列表 = async (): Promise<小说拆分注入快照结构[]> => {
    const raw = await dbService.读取设置(设置键.小说分解注入快照);
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
        数据集ID: 读取文本(item?.数据集ID).trim(),
        目标链路: item?.目标链路 === 'planning' || item?.目标链路 === 'world_evolution' ? item.目标链路 : 'main_story',
        标题: 读取文本(item?.标题).trim() || '未命名注入快照',
        条目数: Math.max(0, Math.floor(读取数字(item?.条目数, 0))),
        文本: 读取文本(item?.文本),
        节点列表: Array.isArray(item?.节点列表)
            ? item.节点列表.map((node: unknown) => 标准化树节点(node, 读取文本(item?.数据集ID).trim()))
            : [],
        updatedAt: Math.floor(读取数字(item?.updatedAt, Date.now()))
    }));
};

export const 保存小说拆分注入快照列表 = async (items: 小说拆分注入快照结构[]): Promise<void> => {
    await dbService.保存设置(设置键.小说分解注入快照, (Array.isArray(items) ? items : []).map((item) => 深拷贝(item)));
};

export const 创建空小说拆分数据集 = (params?: Partial<小说拆分数据集结构>): 小说拆分数据集结构 => {
    const now = Date.now();
    return 规范化小说拆分数据集({
        id: params?.id || 生成ID('novel_dataset'),
        标题: params?.标题 || '未命名数据集',
        作品名: params?.作品名 || '未命名作品',
        来源类型: params?.来源类型 || 'novel',
        schemaVersion: 小说拆分数据集版本,
        原始文件名: params?.原始文件名 || '',
        原始文本长度: params?.原始文本长度 || 0,
        原始文本: params?.原始文本 || '',
        原始文本摘要: params?.原始文本摘要 || '',
        总章节数: params?.总章节数 || 0,
        章节列表: params?.章节列表 || [],
        分段模式: params?.分段模式 || 'single_chapter',
        每批章数: params?.每批章数 || 1,
        默认时间线起点: params?.默认时间线起点 || 默认小说时间线起点,
        是否识别原著时间线: params?.是否识别原著时间线 === true,
        激活注入: params?.激活注入 === true,
        当前阶段概括: params?.当前阶段概括 || '',
        核心角色摘要: params?.核心角色摘要 || [],
        核心角色: params?.核心角色 || [],
        分段列表: params?.分段列表 || [],
        注入树: params?.注入树 || [],
        createdAt: params?.createdAt || now,
        updatedAt: params?.updatedAt || now
    });
};

export const 创建小说拆分任务 = (params: {
    数据集ID: string;
    名称?: string;
    分段模式?: 小说拆分分段模式类型;
    每批章数?: number;
    单次处理批量?: number;
    自动重试次数?: number;
    后台运行?: boolean;
    自动续跑?: boolean;
    总分段数?: number;
}): 小说拆分任务结构 => {
    const now = Date.now();
    return 规范化小说拆分任务({
        id: 生成ID('novel_task'),
        数据集ID: params.数据集ID,
        名称: params.名称 || '小说分解任务',
        状态: 'queued',
        当前阶段: 'prepare',
        分段模式: params.分段模式 || 'single_chapter',
        每批章数: params.每批章数 || 1,
        后台运行: params.后台运行 !== false,
        自动续跑: params.自动续跑 !== false,
        单次处理批量: params.单次处理批量 || 1,
        自动重试次数: Math.max(0, params.自动重试次数 || 0),
        当前游标: 0,
        已完成分段ID列表: [],
        失败分段ID列表: [],
        进度: {
            总分段数: Math.max(0, params.总分段数 || 0),
            已完成分段数: 0,
            失败分段数: 0,
            当前分段索引: 0,
            百分比: 0
        },
        createdAt: now,
        updatedAt: now
    });
};

export const 写入小说拆分数据集 = async (dataset: 小说拆分数据集结构): Promise<小说拆分数据集结构[]> => {
    const list = await 读取小说拆分数据集列表();
    const normalized = 规范化小说拆分数据集({
        ...dataset,
        updatedAt: Date.now()
    });
    const hasExisting = list.some((item) => item.id === normalized.id);
    const merged = hasExisting
        ? list.map((item) => item.id === normalized.id ? normalized : item)
        : [normalized, ...list];
    const next = normalized.激活注入
        ? merged.map((item) => ({ ...item, 激活注入: item.id === normalized.id }))
        : (!merged.some((item) => item.激活注入) && merged.length > 0
            ? merged.map((item, index) => ({ ...item, 激活注入: index === 0 }))
            : merged);
    await 保存小说拆分数据集列表(next);
    return next;
};

export const 设置小说拆分激活数据集 = async (datasetId: string): Promise<小说拆分数据集结构[]> => {
    const list = await 读取小说拆分数据集列表();
    const next = list.map((item) => ({
        ...item,
        激活注入: item.id === datasetId,
        updatedAt: item.id === datasetId ? Date.now() : item.updatedAt
    }));
    await 保存小说拆分数据集列表(next);
    return next;
};

export const 获取当前激活小说拆分数据集 = async (): Promise<小说拆分数据集结构 | null> => {
    const list = await 读取小说拆分数据集列表();
    return list.find((item) => item.激活注入) || list[0] || null;
};

export const 获取小说拆分数据集 = async (datasetId: string): Promise<小说拆分数据集结构 | null> => {
    const normalizedId = 读取文本(datasetId).trim();
    if (!normalizedId) return null;
    const list = await 读取小说拆分数据集列表();
    return list.find((item) => item.id === normalizedId) || null;
};

export const 写入小说拆分任务 = async (task: 小说拆分任务结构): Promise<小说拆分任务结构[]> => {
    const list = await 读取小说拆分任务列表();
    const normalized = 规范化小说拆分任务({
        ...task,
        updatedAt: Date.now()
    });
    const next = list.some((item) => item.id === normalized.id)
        ? list.map((item) => item.id === normalized.id ? normalized : item)
        : [normalized, ...list];
    await 保存小说拆分任务列表(next);
    return next;
};

export const 更新小说拆分任务状态 = async (
    taskId: string,
    状态: 小说拆分任务状态类型,
    options?: { 最近错误?: string; lastRunAt?: number; completedAt?: number; 当前阶段?: 小说拆分任务结构['当前阶段'] }
): Promise<小说拆分任务结构[]> => {
    const list = await 读取小说拆分任务列表();
    const now = Date.now();
    const next = list.map((item) => {
        if (item.id !== taskId) return item;
        const shouldClearRecentError = typeof options?.最近错误 === 'undefined'
            && (状态 === 'queued' || 状态 === 'running' || 状态 === 'completed');
        const shouldResetCompletedAt = typeof options?.completedAt === 'undefined'
            && (状态 === 'queued' || 状态 === 'running');
        return 规范化小说拆分任务({
            ...item,
            状态,
            当前阶段: options?.当前阶段
                ?? (状态 === 'completed'
                    ? 'completed'
                    : 状态 === 'failed'
                        ? 'failed'
                        : 状态 === 'queued'
                            ? 'processing'
                            : 状态 === 'running' && item.当前阶段 === 'failed'
                                ? 'processing'
                        : item.当前阶段),
            最近错误: options?.最近错误 ?? (shouldClearRecentError ? '' : item.最近错误),
            lastRunAt: options?.lastRunAt ?? (状态 === 'running' ? now : item.lastRunAt),
            completedAt: options?.completedAt ?? (状态 === 'completed' ? now : shouldResetCompletedAt ? undefined : item.completedAt),
            updatedAt: now
        });
    });
    await 保存小说拆分任务列表(next);
    return next;
};

export const 更新小说拆分任务进度 = async (
    taskId: string,
    patch: Partial<小说拆分任务结构> & { 进度?: Partial<小说拆分任务进度结构> }
): Promise<小说拆分任务结构[]> => {
    const list = await 读取小说拆分任务列表();
    const now = Date.now();
    const next = list.map((item) => {
        if (item.id !== taskId) return item;
        const 进度 = 规范化小说拆分任务进度({
            ...item.进度,
            ...(patch.进度 || {})
        });
        return 规范化小说拆分任务({
            ...item,
            ...patch,
            进度,
            updatedAt: now
        });
    });
    await 保存小说拆分任务列表(next);
    return next;
};

export const 删除小说拆分任务 = async (taskId: string): Promise<小说拆分任务结构[]> => {
    const list = await 读取小说拆分任务列表();
    const next = list.filter((item) => item.id !== taskId);
    await 保存小说拆分任务列表(next);
    return next;
};

export const 删除小说拆分数据集 = async (datasetId: string): Promise<{
    数据集列表: 小说拆分数据集结构[];
    任务列表: 小说拆分任务结构[];
    注入快照列表: 小说拆分注入快照结构[];
}> => {
    const [datasets, tasks, snapshots] = await Promise.all([
        读取小说拆分数据集列表(),
        读取小说拆分任务列表(),
        读取小说拆分注入快照列表()
    ]);
    const nextDatasets = datasets.filter((item) => item.id !== datasetId);
    const ensuredDatasets = nextDatasets.length > 0 && !nextDatasets.some((item) => item.激活注入)
        ? nextDatasets.map((item, index) => ({ ...item, 激活注入: index === 0 }))
        : nextDatasets;
    const nextTasks = tasks.filter((item) => item.数据集ID !== datasetId);
    const nextSnapshots = snapshots.filter((item) => item.数据集ID !== datasetId);
    await Promise.all([
        保存小说拆分数据集列表(ensuredDatasets),
        保存小说拆分任务列表(nextTasks),
        保存小说拆分注入快照列表(nextSnapshots)
    ]);
    return {
        数据集列表: ensuredDatasets,
        任务列表: nextTasks,
        注入快照列表: nextSnapshots
    };
};

export const 筛选可后台续跑任务 = (tasks: 小说拆分任务结构[]): 小说拆分任务结构[] => (
    (Array.isArray(tasks) ? tasks : []).filter((task) => (
        task.后台运行 === true
        && task.自动续跑 === true
        && (task.状态 === 'queued' || task.状态 === 'running')
    ))
);

export const 获取小说拆分任务排序分值 = (task: 小说拆分任务结构): number => {
    const 状态优先级: Record<小说拆分任务状态类型, number> = {
        running: 100,
        queued: 90,
        failed: 80,
        paused: 40,
        idle: 30,
        completed: 20,
        cancelled: 10
    };
    return 状态优先级[task.状态] || 0;
};

export const 获取小说拆分任务状态文本 = (status: 小说拆分任务状态类型): string => {
    switch (status) {
        case 'queued':
            return '排队中';
        case 'running':
            return '运行中';
        case 'paused':
            return '已暂停';
        case 'completed':
            return '已完成';
        case 'failed':
            return '失败';
        case 'cancelled':
            return '已取消';
        default:
            return '待命';
    }
};

const 获取小说拆分阶段文本 = (stage: 小说拆分任务结构['当前阶段']): string => {
    switch (stage) {
        case 'prepare':
            return '准备数据';
        case 'segmenting':
            return '自动拆章';
        case 'processing':
            return '分段整理';
        case 'snapshotting':
            return '刷新注入';
        case 'completed':
            return '完成';
        case 'failed':
            return '失败';
        default:
            return '待命';
    }
};

export const 获取小说拆分任务摘要 = (task: 小说拆分任务结构): string => {
    const progress = task.进度;
    return [
        `${获取小说拆分任务状态文本(task.状态)} ${progress.百分比}%`,
        `阶段 ${获取小说拆分阶段文本(task.当前阶段)}`,
        `已完成 ${progress.已完成分段数}/${progress.总分段数}`,
        progress.失败分段数 > 0 ? `失败 ${progress.失败分段数}` : '',
        `断点 ${task.当前游标}`
    ].filter(Boolean).join(' · ');
};

export const 构建空注入快照 = (params: {
    数据集ID: string;
    目标链路: 小说拆分注入快照结构['目标链路'];
    标题: string;
}): 小说拆分注入快照结构 => ({
    数据集ID: params.数据集ID,
    目标链路: params.目标链路,
    标题: params.标题,
    条目数: 0,
    文本: '',
    节点列表: [],
    updatedAt: Date.now()
});

const 克隆章节并重映射 = (
    items: 小说拆分章节结构[],
    nextDatasetId: string,
    chapterIdMap: Map<string, string>
): 小说拆分章节结构[] => items.map((item, index) => {
    const nextId = 生成ID('novel_chapter');
    chapterIdMap.set(item.id, nextId);
    return {
        ...item,
        id: nextId,
        数据集ID: nextDatasetId,
        序号: Math.max(1, item.序号 || index + 1),
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
});

const 克隆分段并重映射 = (
    items: 小说拆分分段结构[],
    nextDatasetId: string,
    segmentIdMap: Map<string, string>
): 小说拆分分段结构[] => items.map((item) => {
    const nextId = 生成ID('novel_segment');
    segmentIdMap.set(item.id, nextId);
    return {
        ...item,
        id: nextId,
        数据集ID: nextDatasetId,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
});

const 重映射树节点列表 = (
    items: 小说拆分树节点结构[],
    nextDatasetId: string,
    nodeIdMap: Map<string, string>,
    segmentIdMap?: Map<string, string>
): 小说拆分树节点结构[] => {
    const collect = (nodes: 小说拆分树节点结构[]) => {
        nodes.forEach((node) => {
            nodeIdMap.set(node.id, 生成ID('novel_node'));
            if (Array.isArray(node.子节点) && node.子节点.length > 0) {
                collect(node.子节点);
            }
        });
    };
    const cloneNode = (node: 小说拆分树节点结构): 小说拆分树节点结构 => ({
        ...node,
        id: nodeIdMap.get(node.id) || 生成ID('novel_node'),
        数据集ID: nextDatasetId,
        父节点ID: node.父节点ID ? (nodeIdMap.get(node.父节点ID) || undefined) : undefined,
        关联分段ID列表: Array.isArray(node.关联分段ID列表)
            ? node.关联分段ID列表.map((item) => segmentIdMap?.get(item) || item)
            : [],
        子节点: Array.isArray(node.子节点) ? node.子节点.map(cloneNode) : []
    });
    collect(items);
    return items.map(cloneNode);
};

const 重映射注入快照列表 = (
    items: 小说拆分注入快照结构[],
    nextDatasetId: string,
    nodeIdMap: Map<string, string>,
    segmentIdMap: Map<string, string>
): 小说拆分注入快照结构[] => items.map((item) => ({
    ...item,
    数据集ID: nextDatasetId,
    节点列表: 重映射树节点列表(item.节点列表 || [], nextDatasetId, nodeIdMap, segmentIdMap),
    updatedAt: Date.now()
}));

type 小说拆分分享清单结构 = {
    format: string;
    version: number;
    exportedAt: string;
    decompositionFile: string;
    rawFile: string;
};

type 小说拆分分享分解文件结构 = {
    schema: string;
    version: number;
    exportedAt: string;
    datasets: any[];
    tasks: any[];
    snapshots: any[];
};

type 小说拆分分享原文项结构 = {
    datasetId: string;
    原始文件名: string;
    原始文本: string;
    章节内容映射: Record<string, string>;
    分段原文映射: Record<string, string>;
};

type 小说拆分分享原文文件结构 = {
    schema: string;
    version: number;
    exportedAt: string;
    datasets: 小说拆分分享原文项结构[];
};

const 构建小说拆分分享原文项 = (dataset: 小说拆分数据集结构): 小说拆分分享原文项结构 => ({
    datasetId: dataset.id,
    原始文件名: dataset.原始文件名 || '',
    原始文本: dataset.原始文本 || '',
    章节内容映射: Object.fromEntries((dataset.章节列表 || []).map((chapter) => [chapter.id, chapter.内容 || ''])),
    分段原文映射: Object.fromEntries((dataset.分段列表 || []).map((segment) => [segment.id, segment.原文内容 || '']))
});

const 构建小说拆分分享分解数据集 = (dataset: 小说拆分数据集结构): 小说拆分数据集结构 => 规范化小说拆分数据集({
    ...深拷贝(dataset),
    原始文本: '',
    章节列表: (dataset.章节列表 || []).map((chapter) => ({
        ...chapter,
        内容: ''
    })),
    分段列表: (dataset.分段列表 || []).map((segment) => ({
        ...segment,
        原文内容: ''
    }))
});

const 合并小说拆分分享原文 = (
    dataset: 小说拆分数据集结构,
    rawEntry?: 小说拆分分享原文项结构
): 小说拆分数据集结构 => {
    if (!rawEntry) return dataset;
    return 规范化小说拆分数据集({
        ...dataset,
        原始文件名: rawEntry.原始文件名 || dataset.原始文件名,
        原始文本: rawEntry.原始文本 || '',
        原始文本长度: (rawEntry.原始文本 || '').length || dataset.原始文本长度,
        原始文本摘要: (rawEntry.原始文本 || '').trim().slice(0, 240) || dataset.原始文本摘要,
        章节列表: (dataset.章节列表 || []).map((chapter) => ({
            ...chapter,
            内容: rawEntry.章节内容映射?.[chapter.id] || ''
        })),
        分段列表: (dataset.分段列表 || []).map((segment) => ({
            ...segment,
            原文内容: rawEntry.分段原文映射?.[segment.id] || ''
        }))
    });
};

export const 导出小说拆分分享数据 = async (options?: {
    datasetId?: string;
    includeTasks?: boolean;
    includeSnapshots?: boolean;
}): Promise<Blob> => {
    const [datasets, tasks, snapshots] = await Promise.all([
        读取小说拆分数据集列表(),
        读取小说拆分任务列表(),
        读取小说拆分注入快照列表()
    ]);
    const targetDatasets = options?.datasetId
        ? datasets.filter((item) => item.id === options.datasetId)
        : datasets;
    if (targetDatasets.length <= 0) {
        throw new Error('当前没有可导出的小说分解数据集');
    }
    const datasetIds = new Set(targetDatasets.map((item) => item.id));
    const exportedAt = new Date().toISOString();
    const decompositionPayload: 小说拆分分享分解文件结构 = {
        schema: 小说拆分分享格式标识,
        version: 小说拆分分享版本,
        exportedAt,
        datasets: targetDatasets.map((item) => 构建小说拆分分享分解数据集(item)),
        tasks: options?.includeTasks === false
            ? []
            : tasks.filter((item) => datasetIds.has(item.数据集ID)).map((item) => 深拷贝(item)),
        snapshots: options?.includeSnapshots === false
            ? []
            : snapshots.filter((item) => datasetIds.has(item.数据集ID)).map((item) => 深拷贝(item))
    };
    const rawPayload: 小说拆分分享原文文件结构 = {
        schema: 小说拆分分享格式标识,
        version: 小说拆分分享版本,
        exportedAt,
        datasets: targetDatasets.map((item) => 构建小说拆分分享原文项(item))
    };
    const manifest: 小说拆分分享清单结构 = {
        format: 小说拆分分享格式标识,
        version: 小说拆分分享版本,
        exportedAt,
        decompositionFile: 小说拆分分享分解文件,
        rawFile: 小说拆分分享原文文件
    };

    const files: Record<string, Uint8Array> = {
        [小说拆分分享清单文件]: strToU8(JSON.stringify(manifest, null, 2)),
        [小说拆分分享分解文件]: strToU8(JSON.stringify(decompositionPayload, null, 2)),
        [小说拆分分享原文文件]: strToU8(JSON.stringify(rawPayload, null, 2))
    };
    return new Blob([zipSync(files)], { type: 'application/zip' });
};

export const 导入小说拆分分享数据 = async (
    file: Blob,
    options?: { includeRawText?: boolean }
): Promise<{
    importedDatasetIds: string[];
    datasetCount: number;
    taskCount: number;
    snapshotCount: number;
}> => {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const manifestEntry = entries[小说拆分分享清单文件];
    if (!manifestEntry) {
        throw new Error('导入失败：ZIP 包内缺少 manifest.json。');
    }

    let manifest: 小说拆分分享清单结构;
    try {
        manifest = JSON.parse(strFromU8(manifestEntry));
    } catch (error: any) {
        throw new Error(`导入失败：manifest 解析失败：${error?.message || '格式错误'}`);
    }

    if (manifest?.format !== 小说拆分分享格式标识) {
        throw new Error(`导入失败：不支持的分享包类型“${读取文本(manifest?.format) || '未知类型'}”。`);
    }
    if (Math.max(1, Math.floor(读取数字(manifest?.version, 1))) > 小说拆分分享版本) {
        throw new Error(`导入失败：分享包版本 ${manifest.version} 高于当前支持版本 ${小说拆分分享版本}。`);
    }

    const decompositionEntry = entries[manifest.decompositionFile || 小说拆分分享分解文件];
    if (!decompositionEntry) {
        throw new Error('导入失败：ZIP 包内缺少 decomposition.json。');
    }

    let parsed: 小说拆分分享分解文件结构;
    try {
        parsed = JSON.parse(strFromU8(decompositionEntry));
    } catch (error: any) {
        throw new Error(`导入失败：decomposition.json 解析失败：${error?.message || '格式错误'}`);
    }

    const schema = 读取文本(parsed?.schema).trim();
    const version = Math.max(1, Math.floor(读取数字(parsed?.version, 1)));
    if (schema !== 小说拆分分享格式标识) {
        throw new Error(`导入失败：分解数据格式“${schema || '未知类型'}”不受支持。`);
    }
    if (version > 小说拆分分享版本) {
        throw new Error(`导入失败：分享包版本 ${version} 高于当前支持版本 ${小说拆分分享版本}。`);
    }
    const sourceDatasets = Array.isArray(parsed?.datasets) ? parsed.datasets : [];
    if (sourceDatasets.length <= 0) {
        throw new Error('导入失败：未找到可用的数据集内容。');
    }

    const sourceTasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    const sourceSnapshots = Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
    let rawMap = new Map<string, 小说拆分分享原文项结构>();
    if (options?.includeRawText !== false) {
        const rawEntry = entries[manifest.rawFile || 小说拆分分享原文文件];
        if (rawEntry) {
            try {
                const rawPayload = JSON.parse(strFromU8(rawEntry)) as 小说拆分分享原文文件结构;
                rawMap = new Map(
                    (Array.isArray(rawPayload?.datasets) ? rawPayload.datasets : [])
                        .map((item) => [读取文本(item?.datasetId).trim(), item] as const)
                        .filter(([datasetId]) => Boolean(datasetId))
                );
            } catch (error: any) {
                throw new Error(`导入失败：raw-content.json 解析失败：${error?.message || '格式错误'}`);
            }
        }
    }

    const [existingDatasets, existingTasks, existingSnapshots] = await Promise.all([
        读取小说拆分数据集列表(),
        读取小说拆分任务列表(),
        读取小说拆分注入快照列表()
    ]);

    const nextDatasets = [...existingDatasets];
    const nextTasks = [...existingTasks];
    const nextSnapshots = [...existingSnapshots];
    const importedDatasetIds: string[] = [];
    const hasExistingActive = existingDatasets.some((item) => item.激活注入);

    sourceDatasets.forEach((rawDataset: any, datasetIndex: number) => {
        const normalizedDataset = 合并小说拆分分享原文(
            规范化小说拆分数据集(rawDataset),
            rawMap.get(读取文本(rawDataset?.id).trim())
        );
        const nextDatasetId = 生成ID('novel_dataset');
        const chapterIdMap = new Map<string, string>();
        const segmentIdMap = new Map<string, string>();
        const nodeIdMap = new Map<string, string>();
        const nextChapters = 克隆章节并重映射(normalizedDataset.章节列表 || [], nextDatasetId, chapterIdMap);
        const nextSegments = 克隆分段并重映射(normalizedDataset.分段列表 || [], nextDatasetId, segmentIdMap);
        const nextNodes = 重映射树节点列表(normalizedDataset.注入树 || [], nextDatasetId, nodeIdMap, segmentIdMap);
        const nextDataset = 规范化小说拆分数据集({
            ...normalizedDataset,
            id: nextDatasetId,
            来源类型: 'shared_json',
            schemaVersion: Math.max(小说拆分数据集版本, normalizedDataset.schemaVersion || 1),
            标题: normalizedDataset.标题 || normalizedDataset.作品名 || `导入数据集 ${datasetIndex + 1}`,
            作品名: normalizedDataset.作品名 || normalizedDataset.标题 || `导入作品 ${datasetIndex + 1}`,
            激活注入: !hasExistingActive && importedDatasetIds.length <= 0 && datasetIndex === 0,
            章节列表: nextChapters,
            总章节数: nextChapters.length,
            分段列表: nextSegments,
            注入树: nextNodes,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        nextDatasets.unshift(nextDataset);
        importedDatasetIds.push(nextDatasetId);

        sourceTasks
            .filter((item: any) => 读取文本(item?.数据集ID).trim() === normalizedDataset.id)
            .forEach((rawTask: any) => {
                const normalizedTask = 规范化小说拆分任务(rawTask);
                nextTasks.unshift(规范化小说拆分任务({
                    ...normalizedTask,
                    id: 生成ID('novel_task'),
                    数据集ID: nextDatasetId,
                    已完成分段ID列表: normalizedTask.已完成分段ID列表.map((item) => segmentIdMap.get(item) || item),
                    失败分段ID列表: normalizedTask.失败分段ID列表.map((item) => segmentIdMap.get(item) || item),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }));
            });

        const nextSnapshotNodeMap = new Map<string, string>();
        sourceSnapshots
            .filter((item: any) => 读取文本(item?.数据集ID).trim() === normalizedDataset.id)
            .forEach((rawSnapshot: any) => {
                const normalizedSnapshot = {
                    数据集ID: nextDatasetId,
                    目标链路: rawSnapshot?.目标链路 === 'planning' || rawSnapshot?.目标链路 === 'world_evolution' ? rawSnapshot.目标链路 : 'main_story',
                    标题: 读取文本(rawSnapshot?.标题).trim() || '未命名注入快照',
                    条目数: Math.max(0, Math.floor(读取数字(rawSnapshot?.条目数, 0))),
                    文本: 读取文本(rawSnapshot?.文本),
                    节点列表: Array.isArray(rawSnapshot?.节点列表)
                        ? rawSnapshot.节点列表.map((node: unknown) => 标准化树节点(node, nextDatasetId))
                        : [],
                    updatedAt: Date.now()
                } as 小说拆分注入快照结构;
                nextSnapshots.unshift(...重映射注入快照列表([normalizedSnapshot], nextDatasetId, nextSnapshotNodeMap, segmentIdMap));
            });
    });

    await Promise.all([
        保存小说拆分数据集列表(nextDatasets),
        保存小说拆分任务列表(nextTasks),
        保存小说拆分注入快照列表(nextSnapshots)
    ]);

    return {
        importedDatasetIds,
        datasetCount: importedDatasetIds.length,
        taskCount: nextTasks.length - existingTasks.length,
        snapshotCount: nextSnapshots.length - existingSnapshots.length
    };
};
