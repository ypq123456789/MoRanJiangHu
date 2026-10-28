import type { NPC生图任务记录, 香闺秘档部位类型 } from '../../types';
import { 获取图片展示地址, 图片资源记录含可恢复地址, 压缩图片资源字段 } from '../../utils/imageAssets';
import { recordDiagnosticLog } from '../../services/diagnosticLog';

const 调试日志 = (message: string, data?: unknown) => {
    if (import.meta.env.DEV) {
        console.log(message, data);
    }
    recordDiagnosticLog('debug', message, data);
};

type NPC图片状态工作流依赖 = {
    设置社交: (updater: any) => void;
    规范化社交列表: (list: any[], options?: any) => any[];
    执行社交自动存档: (socialSnapshot: any[]) => void;
    获取社交列表: () => any[];
    获取NPC唯一标识: (npc: any, index?: number) => string;
    设置NPC生图任务队列: (updater: any) => void;
    加载图片AI服务: () => Promise<any>;
};

export const 生成NPC生图记录ID = (): string => `npc_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const 标准化NPC图片结果 = (raw: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const normalized = 压缩图片资源字段(raw);
    return {
        ...normalized,
        id: typeof normalized?.id === 'string' && normalized.id.trim().length > 0 ? normalized.id.trim() : 生成NPC生图记录ID()
    };
};

export const 标准化香闺秘档部位结果 = (raw: any, part: 香闺秘档部位类型) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    // 保留原始图片URL：压缩图片资源字段在有本地路径时会丢弃图片URL，
    // 但香闺秘档部位档案的图片URL是恢复本地资源的必要兜底信息，
    // 不应被压缩掉。先从原始数据读取图片URL，再应用压缩。
    const rawImageUrl = typeof raw?.图片URL === 'string' ? raw.图片URL.trim() : undefined;
    const normalizedAsset = 压缩图片资源字段(raw);
    // 如果压缩后的图片URL为空但原始数据有图片URL，恢复它
    const 图片URL = (typeof normalizedAsset?.图片URL === 'string' ? normalizedAsset.图片URL.trim() : undefined) || rawImageUrl || undefined;
    const 本地路径 = typeof normalizedAsset?.本地路径 === 'string' ? normalizedAsset.本地路径.trim() : undefined;
    const 生图词组 = typeof raw?.生图词组 === 'string' ? raw.生图词组.trim() : '';
    const 原始描述 = typeof raw?.原始描述 === 'string' ? raw.原始描述.trim() : '';
    const 使用模型 = typeof raw?.使用模型 === 'string' ? raw.使用模型.trim() : '';
    const 画师串 = typeof raw?.画师串 === 'string' ? raw.画师串.trim() : undefined;
    const 描述文本 = typeof raw?.描述文本 === 'string' ? raw.描述文本.trim() : undefined;
    const 错误信息 = typeof raw?.错误信息 === 'string' ? raw.错误信息.trim() : undefined;
    const 生成时间 = Number.isFinite(Number(raw?.生成时间)) ? Number(raw.生成时间) : Date.now();
    const 状态 = raw?.状态 === 'success' || raw?.状态 === 'failed' || raw?.状态 === 'pending'
        ? raw.状态
        : 图片URL || 本地路径
            ? 'success'
        : undefined;
    // [修复] pending 占位记录不应持久化到部位档案：
    // 生图任务进度由任务队列维护，部位档案只应保留最终结果。
    // 若 pending 占位被中断（网络异常/页面刷新/切角色），会永久残留为无图占位，
    // 导致 UI 端"部位档案存在但获取图片展示地址返回空"，并覆盖之前已有的 success 记录。
    if (状态 === 'pending' && !图片URL && !本地路径) {
        调试日志(`[香闺秘档调试] 标准化丢弃: ${part} 状态=pending 且无图片地址`, { id: raw?.id });
        return undefined;
    }
    if (!图片URL && !本地路径 && !生图词组 && !原始描述 && !错误信息) {
        调试日志(`[香闺秘档调试] 标准化丢弃: ${part} 无任何有效字段`, { id: raw?.id, 状态 });
        return undefined;
    }
    const result = {
        id: typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : `npc_secret_${part}_${生成时间}`,
        部位: part,
        图片URL,
        本地路径,
        生图词组,
        原始描述,
        使用模型,
        生成时间,
        构图: '部位特写' as const,
        画风: raw?.画风,
        画师串,
        状态,
        错误信息,
        描述文本
    };
    调试日志(`[香闺秘档调试] 标准化通过: ${part}`, {
        id: result.id,
        状态: result.状态,
        hasImageUrl: Boolean(result.图片URL),
        hasLocalPath: Boolean(result.本地路径),
        imageUrlPrefix: result.图片URL?.slice(0, 60),
        localPathPrefix: result.本地路径?.slice(0, 60)
    });
    return result;
};

export const 标准化香闺秘档部位档案 = (raw?: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const 胸部 = 标准化香闺秘档部位结果(raw?.胸部, '胸部');
    const 小穴 = 标准化香闺秘档部位结果(raw?.小穴, '小穴');
    const 屁穴 = 标准化香闺秘档部位结果(raw?.屁穴, '屁穴');
    const 肉棒 = 标准化香闺秘档部位结果(raw?.肉棒, '肉棒');
    if (!胸部 && !小穴 && !屁穴 && !肉棒) return undefined;
    return {
        ...(胸部 ? { 胸部 } : {}),
        ...(小穴 ? { 小穴 } : {}),
        ...(屁穴 ? { 屁穴 } : {}),
        ...(肉棒 ? { 肉棒 } : {})
    };
};

const 读取记录原始描述姓名 = (record: any): string => {
    const rawText = typeof record?.原始描述 === 'string' ? record.原始描述.trim() : '';
    if (!rawText) return '';
    try {
        const parsed = JSON.parse(rawText);
        const directName = typeof parsed?.姓名 === 'string' ? parsed.姓名.trim() : '';
        if (directName) return directName;
        return typeof parsed?.视觉相关字段?.姓名 === 'string' ? parsed.视觉相关字段.姓名.trim() : '';
    } catch {
        return '';
    }
};

const 读取记录原始描述性别 = (record: any): string => {
    const rawText = typeof record?.原始描述 === 'string' ? record.原始描述.trim() : '';
    if (!rawText) return '';
    try {
        const parsed = JSON.parse(rawText);
        const directGender = typeof parsed?.性别 === 'string' ? parsed.性别.trim() : '';
        if (directGender) return directGender;
        return typeof parsed?.视觉相关字段?.性别 === 'string' ? parsed.视觉相关字段.性别.trim() : '';
    } catch {
        return '';
    }
};

const 读取记录目标姓名 = (record: any): string => (
    typeof record?.NPC姓名 === 'string' && record.NPC姓名.trim()
        ? record.NPC姓名.trim()
        : 读取记录原始描述姓名(record)
);

const 读取记录目标性别 = (record: any): string => (
    typeof record?.NPC性别 === 'string' && record.NPC性别.trim()
        ? record.NPC性别.trim()
        : 读取记录原始描述性别(record)
);

const 读取目标性别 = (source: any): '男' | '女' | '男娘' | '扶她' | '' => {
    const gender = typeof source?.性别 === 'string' ? source.性别.trim() : '';
    if (gender === '男') return '男';
    if (gender === '女') return '女';
    if (gender === '男娘') return '男娘';
    if (gender === '扶她') return '扶她';
    return '';
};

const 私密构图集合 = new Set(['部位特写', '胸部', '小穴', '屁穴', '肉棒']);

const 是否私密图片记录 = (record: any): boolean => {
    const composition = typeof record?.构图 === 'string' ? record.构图.trim() : '';
    const part = typeof record?.部位 === 'string' ? record.部位.trim() : '';
    if (私密构图集合.has(composition) || 私密构图集合.has(part)) return true;
    const id = typeof record?.id === 'string' ? record.id : '';
    return /^npc_secret_/i.test(id);
};

const 是否可作头像图片 = (record: any): boolean => (
    record?.构图 === '头像'
    && record?.状态 === 'success'
    && !是否私密图片记录(record)
    && Boolean(record?.id)
    && Boolean(获取图片展示地址(record))
);

const 是否可作立绘图片 = (record: any): boolean => (
    (record?.构图 === '半身' || record?.构图 === '立绘')
    // 背景上传的记录沿用「立绘」构图以兼容旧读取路径，必须按用途排除，
    // 否则会被当作立绘展示（CodeRabbit PR #117）。
    && record?.图片用途 !== '背景'
    && record?.状态 === 'success'
    && !是否私密图片记录(record)
    && Boolean(record?.id)
    && Boolean(获取图片展示地址(record))
);

const 是否可作背景图片 = (record: any): boolean => (
    (record?.构图 === '背景' || record?.图片用途 === '背景')
    && record?.状态 === 'success'
    && !是否私密图片记录(record)
    && Boolean(record?.id)
    && Boolean(获取图片展示地址(record))
);

const 香闺秘档部位列表: 香闺秘档部位类型[] = ['胸部', '小穴', '屁穴', '肉棒'];

const 是否可作香闺秘档部位图片 = (record: any): boolean => {
    const part = record?.部位;
    const composition = typeof record?.构图 === 'string' ? record.构图.trim() : '';
    const status = typeof record?.状态 === 'string' ? record.状态.trim() : '';
    return 香闺秘档部位列表.includes(part)
        && (composition === '部位特写' || 私密构图集合.has(composition) || /^npc_secret_/i.test(String(record?.id || '')))
        && status !== 'failed'
        && status !== 'pending'
        && Boolean(record?.id)
        && 图片资源记录含可恢复地址(record);
};

export const 从历史回填香闺秘档部位档案 = (currentArchive: any, history: any[], meta?: { npcKey?: string; npcName?: string; source?: string }) => {
    const currentSecretArchive = 标准化香闺秘档部位档案(currentArchive?.香闺秘档部位档案) || {};
    let changed = false;
    const nextSecretArchive: any = { ...currentSecretArchive };
    香闺秘档部位列表.forEach((part) => {
        const current = nextSecretArchive?.[part];
        if (current && 图片资源记录含可恢复地址(current)) return;
        const fallback = history
            .filter((item: any) => item?.部位 === part && 是否可作香闺秘档部位图片(item))
            .sort((a: any, b: any) => Number(b?.生成时间 || 0) - Number(a?.生成时间 || 0))[0];
        if (!fallback) return;
        nextSecretArchive[part] = fallback;
        changed = true;
        recordDiagnosticLog('warn', 'NPC私密部位图片档案自动回填', {
            npcKey: meta?.npcKey,
            npcName: meta?.npcName,
            source: meta?.source,
            part,
            recordId: fallback?.id,
            hasImageUrl: Boolean(fallback?.图片URL),
            hasLocalPath: Boolean(fallback?.本地路径),
            displayable: Boolean(获取图片展示地址(fallback)),
            historyCount: history.length
        });
    });
    return changed ? 标准化香闺秘档部位档案(nextSecretArchive) : currentSecretArchive;
};

const 生图记录属于当前角色 = (currentNpc: any, record: any): boolean => {
    if (!record || typeof record !== 'object') return false;
    const currentName = typeof currentNpc?.姓名 === 'string' ? currentNpc.姓名.trim() : '';
    const recordName = 读取记录目标姓名(record);
    if (currentName && recordName && currentName !== recordName) return false;
    const currentGender = 读取目标性别(currentNpc);
    const recordGender = 读取目标性别({ 性别: 读取记录目标性别(record) });
    if (currentGender && recordGender && currentGender !== recordGender) return false;
    return true;
};

export const 合并香闺秘档部位档案 = (currentRaw?: any, incomingRaw?: any) => {
    const current = 标准化香闺秘档部位档案(currentRaw) || {};
    const incoming = 标准化香闺秘档部位档案(incomingRaw) || {};
    return 标准化香闺秘档部位档案({
        胸部: incoming.胸部 || current.胸部,
        小穴: incoming.小穴 || current.小穴,
        屁穴: incoming.屁穴 || current.屁穴,
        肉棒: incoming.肉棒 || current.肉棒
    });
};

export const 合并NPC图片档案 = (currentNpc: any, payload: any) => {
    const currentArchive = currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {};
    const currentRecent = currentArchive?.最近生图结果 || currentNpc?.最近生图结果;
    const currentHistory = (Array.isArray(currentArchive?.生图历史) ? currentArchive.生图历史 : (currentRecent ? [currentRecent] : []))
        .filter((item: any) => 生图记录属于当前角色(currentNpc, item));
    const rawNextRecent = payload?.最近生图结果 || payload?.图片档案?.最近生图结果 || currentRecent;
    const nextRecent = 生图记录属于当前角色(currentNpc, rawNextRecent) ? rawNextRecent : currentRecent;
    const rawIncomingHistory = Array.isArray(payload?.图片档案?.生图历史)
        ? payload.图片档案.生图历史
        : (Array.isArray(payload?.生图历史) ? payload.生图历史 : []);
    const incomingHistory = rawIncomingHistory.filter((item: any) => 生图记录属于当前角色(currentNpc, item));
    const baseMergedHistory = [...incomingHistory, ...currentHistory]
        .filter((item) => item && typeof item === 'object')
        .reduce<any[]>((acc, item) => {
            const normalizedItem = 标准化NPC图片结果(item);
            if (!normalizedItem) return acc;
            if (!acc.some((existing) => existing.id === normalizedItem.id)) {
                acc.push(normalizedItem);
            }
            return acc;
        }, [])
        .sort((a, b) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
    const normalizedRecent = nextRecent
        ? (() => {
            const normalized = 标准化NPC图片结果(nextRecent);
            if (!normalized) return undefined;
            return {
                ...normalized,
                id: typeof normalized.id === 'string' && normalized.id.trim()
                    ? normalized.id
                    : (baseMergedHistory[0]?.id || 生成NPC生图记录ID())
            };
        })()
        : undefined;
    const mergedHistory = [normalizedRecent, ...baseMergedHistory]
        .filter((item) => item && typeof item === 'object')
        .reduce<any[]>((acc, item) => {
            const normalizedItem = 标准化NPC图片结果(item);
            if (!normalizedItem) return acc;
            if (!acc.some((existing) => existing.id === normalizedItem.id)) {
                acc.push(normalizedItem);
            }
            return acc;
        }, [])
        .sort((a, b) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
    const incomingSelectedAvatarImageId = typeof payload?.图片档案?.已选头像图片ID === 'string'
        ? payload.图片档案.已选头像图片ID.trim()
        : (typeof payload?.已选头像图片ID === 'string' ? payload.已选头像图片ID.trim() : '');
    const incomingSelectedPortraitImageId = typeof payload?.图片档案?.已选立绘图片ID === 'string'
        ? payload.图片档案.已选立绘图片ID.trim()
        : (typeof payload?.已选立绘图片ID === 'string' ? payload.已选立绘图片ID.trim() : '');
    const incomingSelectedBackgroundImageId = typeof payload?.图片档案?.已选背景图片ID === 'string'
        ? payload.图片档案.已选背景图片ID.trim()
        : (typeof payload?.已选背景图片ID === 'string' ? payload.已选背景图片ID.trim() : '');
    const fallbackAvatarId = mergedHistory.find(是否可作头像图片)?.id || '';
    const fallbackPortraitId = mergedHistory.find(是否可作立绘图片)?.id
        || '';
    const currentSelectedAvatar = typeof currentArchive?.已选头像图片ID === 'string' ? currentArchive.已选头像图片ID.trim() : '';
    const selectedAvatarImageId = (
        incomingSelectedAvatarImageId && mergedHistory.some((item) => item?.id === incomingSelectedAvatarImageId && 是否可作头像图片(item))
            ? incomingSelectedAvatarImageId
            : ''
    )
        || (currentSelectedAvatar && mergedHistory.some((item) => item?.id === currentSelectedAvatar && 是否可作头像图片(item)) ? currentSelectedAvatar : '')
        || fallbackAvatarId;
    const currentSelectedPortrait = typeof currentArchive?.已选立绘图片ID === 'string' ? currentArchive.已选立绘图片ID.trim() : '';
    const selectedPortraitImageId = (
        incomingSelectedPortraitImageId && mergedHistory.some((item) => item?.id === incomingSelectedPortraitImageId && 是否可作立绘图片(item))
            ? incomingSelectedPortraitImageId
            : ''
    )
        || (currentSelectedPortrait && mergedHistory.some((item) => item?.id === currentSelectedPortrait && 是否可作立绘图片(item)) ? currentSelectedPortrait : '')
        || fallbackPortraitId
        || undefined;
    const selectedBackgroundImageId = incomingSelectedBackgroundImageId
        || (typeof currentArchive?.已选背景图片ID === 'string' ? currentArchive.已选背景图片ID.trim() : '')
        || undefined;
    const rawSecretArchive = 合并香闺秘档部位档案(
        currentArchive?.香闺秘档部位档案,
        payload?.图片档案?.香闺秘档部位档案 || payload?.香闺秘档部位档案
    );
    const 香闺秘档部位档案 = 从历史回填香闺秘档部位档案(
        { 香闺秘档部位档案: rawSecretArchive },
        mergedHistory,
        {
            npcKey: currentNpc?.id,
            npcName: currentNpc?.姓名,
            source: 'merge'
        }
    );
    return {
        最近生图结果: normalizedRecent,
        生图历史: mergedHistory,
        已选头像图片ID: selectedAvatarImageId || undefined,
        已选立绘图片ID: selectedPortraitImageId || undefined,
        已选背景图片ID: selectedBackgroundImageId || undefined,
        ...(香闺秘档部位档案 ? { 香闺秘档部位档案 } : {})
    };
};

const 生图阶段中文映射: Record<NonNullable<NPC生图任务记录['进度阶段']>, string> = {
    queued: '排队中',
    prompting: '词组转换中',
    generating: '生成图片中',
    saving: '保存结果中',
    success: '已完成',
    failed: '失败'
};

export const 获取生图阶段中文 = (stage?: NPC生图任务记录['进度阶段']): string => {
    if (!stage) return '未记录';
    return 生图阶段中文映射[stage] || stage;
};

export const 创建NPC图片状态工作流 = (deps: NPC图片状态工作流依赖) => {
    const 读取NPC姓名 = (npc: any): string => (
        typeof npc?.姓名 === 'string' ? npc.姓名.trim() : ''
    );

    const 解析Name标识姓名 = (npcKey: string): string => {
        if (typeof npcKey !== 'string' || !npcKey.startsWith('name:')) return '';
        const body = npcKey.slice('name:'.length);
        const withoutSuffix = body.split('::')[0] || '';
        const parts = withoutSuffix.split(':').filter(Boolean);
        return (parts.length >= 2 ? parts.slice(1).join(':') : withoutSuffix).trim();
    };

    const 查找NPC生图目标索引 = (baseList: any[], npcKey: string, record?: any): number => {
        const exactIndex = baseList.findIndex((npc, index) => deps.获取NPC唯一标识(npc, index) === npcKey);
        if (exactIndex >= 0) return exactIndex;

        const name = 解析Name标识姓名(npcKey);
        if (name) {
            const nameIndex = baseList.findIndex((npc) => 读取NPC姓名(npc) === name);
            if (nameIndex >= 0) return nameIndex;
        }

        const recordName = 读取记录目标姓名(record);
        if (!recordName) return -1;
        const recordGender = 读取目标性别({ 性别: 读取记录目标性别(record) });
        const matches = baseList
            .map((npc, index) => ({ npc, index }))
            .filter(({ npc }) => {
                if (读取NPC姓名(npc) !== recordName) return false;
                const npcGender = 读取目标性别(npc);
                return !recordGender || !npcGender || npcGender === recordGender;
            });
        return matches.length === 1 ? matches[0].index : -1;
    };

    const 更新社交并自动存档 = (updater: (prev: any[]) => { nextList: any[]; changed: boolean }): boolean => {
        const baseList = deps.获取社交列表();
        const result = updater(Array.isArray(baseList) ? baseList : []);
        if (!result.changed) return false;
        // [接收端调试] 规范化前：记录 result.nextList 中有香闺秘档部位档案的 NPC
        const beforeNormalization = result.nextList
            .filter((npc: any) => npc?.图片档案?.香闺秘档部位档案)
            .map((npc: any) => {
                const sa = npc.图片档案.香闺秘档部位档案;
                const parts: 香闺秘档部位类型[] = ['胸部', '小穴', '屁穴', '肉棒'];
                const partSummary: Record<string, any> = {};
                for (const p of parts) {
                    if (sa[p]) {
                        partSummary[p] = {
                            id: sa[p].id || '',
                            状态: sa[p].状态 || '',
                            hasLocalPath: Boolean(sa[p].本地路径),
                            hasImageUrl: Boolean(sa[p].图片URL),
                            localPathPrefix: typeof sa[p].本地路径 === 'string' ? sa[p].本地路径.slice(0, 50) : '',
                        };
                    }
                }
                return { name: npc.姓名 || '', partSummary };
            });
        const normalizedList = deps.规范化社交列表(result.nextList, { 合并同名: false });
        // [接收端调试] 规范化后：记录 normalizedList 中有香闺秘档部位档案的 NPC
        const afterNormalization = normalizedList
            .filter((npc: any) => npc?.图片档案?.香闺秘档部位档案)
            .map((npc: any) => {
                const sa = npc.图片档案.香闺秘档部位档案;
                const parts: 香闺秘档部位类型[] = ['胸部', '小穴', '屁穴', '肉棒'];
                const partSummary: Record<string, any> = {};
                for (const p of parts) {
                    if (sa[p]) {
                        partSummary[p] = {
                            id: sa[p].id || '',
                            状态: sa[p].状态 || '',
                            hasLocalPath: Boolean(sa[p].本地路径),
                            hasImageUrl: Boolean(sa[p].图片URL),
                            localPathPrefix: typeof sa[p].本地路径 === 'string' ? sa[p].本地路径.slice(0, 50) : '',
                        };
                    }
                }
                return { name: npc.姓名 || '', partSummary };
            });
        // 只在规范化前后有差异时输出，避免日志噪音
        const beforeJson = JSON.stringify(beforeNormalization);
        const afterJson = JSON.stringify(afterNormalization);
        if (beforeJson !== afterJson) {
            recordDiagnosticLog('warn', '[香闺秘档写入·接收端] 规范化前后香闺秘档部位档案有变化', {
                before: beforeNormalization,
                after: afterNormalization
            });
        }
        deps.设置社交(() => normalizedList);
        deps.执行社交自动存档(normalizedList);
        return true;
    };

    const 更新NPC最近生图结果 = (npcKey: string, updater: (npc: any) => any) => {
        更新社交并自动存档((baseList) => {
            let changed = false;
            const targetIndex = 查找NPC生图目标索引(baseList, npcKey);
            const nextList = baseList.map((npc, index) => {
                if (index !== targetIndex) return npc;
                changed = true;
                const nextNpc = updater(npc);
                const 图片档案 = 合并NPC图片档案(npc, nextNpc);
                return {
                    ...nextNpc,
                    图片档案,
                    最近生图结果: 图片档案.最近生图结果
                };
            });
            return { nextList, changed };
        });
    };

    const 写入NPC图片历史记录 = (
        npcKey: string,
        record: any,
        options?: { 同步最近结果?: boolean }
    ) => {
        if (!record || typeof record !== 'object') return;
        const shouldUpdateRecent = options?.同步最近结果 !== false;
        let writeInfo: any = null;
        更新社交并自动存档((baseList) => {
            let changed = false;
            const targetIndex = 查找NPC生图目标索引(baseList, npcKey);
            const nextList = baseList.map((npc, index) => {
                if (index !== targetIndex) return npc;
                changed = true;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const currentRecent = archive?.最近生图结果 || npc?.最近生图结果;
                const currentHistory = Array.isArray(archive?.生图历史)
                    ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
                    : (currentRecent ? [currentRecent] : []);
                const nextRecord = {
                    ...record,
                    id: typeof record?.id === 'string' && record.id.trim()
                        ? record.id.trim()
                        : 生成NPC生图记录ID()
                };
                const nextHistory = [nextRecord, ...currentHistory.filter((item: any) => item?.id !== nextRecord.id)]
                    .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
                const nextRecent = shouldUpdateRecent ? nextRecord : currentRecent;
                const currentSelectedAvatarImageId = typeof archive?.已选头像图片ID === 'string'
                    ? archive.已选头像图片ID.trim()
                    : undefined;
                const currentSelectedPortraitImageId = typeof archive?.已选立绘图片ID === 'string'
                    ? archive.已选立绘图片ID.trim()
                    : undefined;
                const currentSelectedBackgroundImageId = typeof archive?.已选背景图片ID === 'string'
                    ? archive.已选背景图片ID.trim()
                    : undefined;
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId && 是否可作头像图片(item))
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find(是否可作头像图片)?.id || undefined);
                const nextSelectedPortraitImageId = currentSelectedPortraitImageId && nextHistory.some((item: any) => item?.id === currentSelectedPortraitImageId && 是否可作立绘图片(item))
                    ? currentSelectedPortraitImageId
                    : (nextHistory.find(是否可作立绘图片)?.id || undefined);
                const nextSecretArchive = 从历史回填香闺秘档部位档案(archive, nextHistory, {
                    npcKey,
                    npcName: npc?.姓名,
                    source: 'write-history'
                });
                writeInfo = {
                    npcKey,
                    npcName: npc?.姓名 || '',
                    recordId: nextRecord.id,
                    composition: nextRecord.构图 || '',
                    part: nextRecord.部位 || '',
                    status: nextRecord.状态 || 'success',
                    historyCount: nextHistory.length,
                    hasImageUrl: Boolean(nextRecord.图片URL),
                    hasLocalPath: Boolean(nextRecord.本地路径),
                    syncedRecent: shouldUpdateRecent
                };
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        已选头像图片ID: nextSelectedAvatarImageId,
                        已选立绘图片ID: nextSelectedPortraitImageId,
                        已选背景图片ID: currentSelectedBackgroundImageId,
                        ...(nextSecretArchive ? { 香闺秘档部位档案: nextSecretArchive } : {})
                    },
                    最近生图结果: nextRecent
                };
            });
            return { nextList, changed };
        });
        recordDiagnosticLog(writeInfo ? 'info' : 'warn', '[NPC图片历史] 写入记录', writeInfo || {
            npcKey,
            recordId: record?.id,
            composition: record?.构图 || '',
            part: record?.部位 || '',
            status: record?.状态 || 'success',
            matched: false
        });
    };

    const 更新NPC香闺秘档部位结果 = (
        npcKey: string,
        part: 香闺秘档部位类型,
        updater: (current: any) => any
    ) => {
        return 更新社交并自动存档((baseList) => {
            let changed = false;
            const targetIndex = 查找NPC生图目标索引(baseList, npcKey);
            const nextList = baseList.map((npc, index) => {
                if (index !== targetIndex) return npc;
                changed = true;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
                const nextPartResult = 标准化香闺秘档部位结果(updater(currentSecretArchive?.[part]), part);
                const nextSecretArchive = 标准化香闺秘档部位档案({
                    ...currentSecretArchive,
                    [part]: nextPartResult
                });
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        香闺秘档部位档案: nextSecretArchive
                    }
                };
            });
            return { nextList, changed };
        });
    };

    const 写入NPC香闺秘档部位记录 = (
        npcKey: string,
        part: 香闺秘档部位类型,
        record: any,
        options?: { 同步最近结果?: boolean }
    ): boolean => {
        if (!record || typeof record !== 'object') return false;
        const shouldUpdateRecent = options?.同步最近结果 !== false;
        // [发送端调试] 记录入参关键字段，便于追踪图片在哪一步丢失
        const baseListForLog = Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : [];
        const matchedNpcIndexForLog = 查找NPC生图目标索引(baseListForLog, npcKey, record);
        const matchedNpcForLog = matchedNpcIndexForLog >= 0 ? baseListForLog[matchedNpcIndexForLog] : undefined;
        recordDiagnosticLog('info', '[香闺秘档写入·发送端] 进入写入流程', {
            npcKey,
            part,
            recordId: record?.id,
            recordHasImageUrl: Boolean(record?.图片URL),
            recordHasLocalPath: Boolean(record?.本地路径),
            recordLocalPathPrefix: typeof record?.本地路径 === 'string' ? record.本地路径.slice(0, 60) : '',
            recordImageUrlPrefix: typeof record?.图片URL === 'string' ? record.图片URL.slice(0, 60) : '',
            recordStatus: record?.状态,
            recordComposition: record?.构图,
            recordPart: record?.部位,
            socialListSize: baseListForLog.length,
            matchedNpcFound: Boolean(matchedNpcForLog),
            matchedNpcName: typeof matchedNpcForLog?.姓名 === 'string' ? matchedNpcForLog.姓名 : '',
            matchedNpcHasArchive: Boolean(matchedNpcForLog?.图片档案),
            matchedNpcArchiveKeys: matchedNpcForLog?.图片档案 ? Object.keys(matchedNpcForLog.图片档案) : [],
            allSocialKeys: baseListForLog.slice(0, 20).map((n: any, i: number) => ({
                key: deps.获取NPC唯一标识(n, i),
                name: typeof n?.姓名 === 'string' ? n.姓名 : ''
            }))
        });
        let writeInfo: any = null;
        const updated = 更新社交并自动存档((baseList) => {
            let changed = false;
            const targetIndex = 查找NPC生图目标索引(baseList, npcKey, record);
            const nextList = baseList.map((npc, index) => {
                if (index !== targetIndex) return npc;
                changed = true;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const currentRecent = archive?.最近生图结果 || npc?.最近生图结果;
                const currentHistory = Array.isArray(archive?.生图历史)
                    ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
                    : (currentRecent ? [currentRecent] : []);
                const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
                const nextRecord = {
                    ...record,
                    id: typeof record?.id === 'string' && record.id.trim()
                        ? record.id.trim()
                        : 生成NPC生图记录ID(),
                    部位: part,
                    构图: '部位特写' as const
                };
                const nextPartResult = 标准化香闺秘档部位结果({
                    ...(currentSecretArchive?.[part] || {}),
                    ...nextRecord
                }, part);
                // pending且无图片时不覆盖已有的success记录
                const resolvedPartResult = nextPartResult ?? currentSecretArchive?.[part];
                const nextHistory = [nextRecord, ...currentHistory.filter((item: any) => item?.id !== nextRecord.id)]
                    .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
                const nextRecent = shouldUpdateRecent ? nextRecord : currentRecent;
                const nextSecretArchive = 标准化香闺秘档部位档案({
                    ...currentSecretArchive,
                    [part]: resolvedPartResult
                });
                const currentSelectedAvatarImageId = typeof archive?.已选头像图片ID === 'string'
                    ? archive.已选头像图片ID.trim()
                    : undefined;
                const currentSelectedPortraitImageId = typeof archive?.已选立绘图片ID === 'string'
                    ? archive.已选立绘图片ID.trim()
                    : undefined;
                const currentSelectedBackgroundImageId = typeof archive?.已选背景图片ID === 'string'
                    ? archive.已选背景图片ID.trim()
                    : undefined;
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId && 是否可作头像图片(item))
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find(是否可作头像图片)?.id || undefined);
                const nextSelectedPortraitImageId = currentSelectedPortraitImageId && nextHistory.some((item: any) => item?.id === currentSelectedPortraitImageId && 是否可作立绘图片(item))
                    ? currentSelectedPortraitImageId
                    : (nextHistory.find(是否可作立绘图片)?.id || undefined);
                writeInfo = {
                    npcKey,
                    npcName: npc?.姓名 || '',
                    part,
                    recordId: nextRecord.id,
                    status: nextRecord.状态 || 'success',
                    historyCount: nextHistory.length,
                    secretArchiveParts: Object.keys(nextSecretArchive || {}),
                    hasImageUrl: Boolean(nextRecord.图片URL),
                    hasLocalPath: Boolean(nextRecord.本地路径),
                    syncedRecent: shouldUpdateRecent
                };
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        已选头像图片ID: nextSelectedAvatarImageId,
                        已选立绘图片ID: nextSelectedPortraitImageId,
                        已选背景图片ID: currentSelectedBackgroundImageId,
                        ...(nextSecretArchive ? { 香闺秘档部位档案: nextSecretArchive } : {})
                    },
                    最近生图结果: nextRecent
                };
            });
            return { nextList, changed };
        });
        if (writeInfo) {
            recordDiagnosticLog('info', '[NPC私密部位历史] 写入记录', writeInfo);
        }
        if (!updated) {
            const availableNpcKeys = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : [])
                .map((npc: any, index: number) => deps.获取NPC唯一标识(npc, index))
                .filter(Boolean)
                .slice(0, 20);
            recordDiagnosticLog('error', 'NPC私密部位图片写回目标缺失', {
                npcKey,
                part,
                recordId: record?.id,
                availableNpcKeys
            });
        }
        return updated;
    };

    const 创建NPC生图任务 = (params: {
        npc: any;
        npcKey: string;
        source: any;
        modelName: string;
        构图: '头像' | '半身' | '立绘' | '部位特写';
        部位?: 香闺秘档部位类型;
        画风?: any;
        画师串?: string;
        额外要求?: string;
        尺寸?: string;
    }): NPC生图任务记录 => {
        const normalizedGender = 读取目标性别(params.npc);
        return {
            id: `npc_image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            目标类型: 'npc',
            NPC标识: params.npcKey,
            NPC姓名: typeof params.npc?.姓名 === 'string' ? params.npc.姓名.trim() || '未命名NPC' : '未命名NPC',
            NPC性别: normalizedGender || undefined,
            NPC性别状态: normalizedGender ? 'explicit' : 'unknown',
            NPC身份: typeof params.npc?.身份 === 'string' ? params.npc.身份.trim() || undefined : undefined,
            是否主要角色: params.npc?.是否主要角色 === true,
            来源: params.source,
            状态: 'queued',
            创建时间: Date.now(),
            使用模型: params.modelName,
            原始描述: '',
            生图词组: '',
            构图: params.构图,
            部位: params.部位,
            画风: params.画风,
            画师串: params.画师串,
            额外要求: params.额外要求,
            尺寸: params.尺寸,
            进度阶段: 'queued',
            进度文本: '任务已入队，等待开始。'
        };
    };

    const 追加NPC生图任务 = (task: NPC生图任务记录) => {
        deps.设置NPC生图任务队列((prev: any) => {
            const list = Array.isArray(prev) ? prev : [];
            // 去重：同NPC+同构图+同部位且仍在排队/运行中的任务不重复添加
            const dedupeKey = `${task.NPC标识}|${task.构图}|${task.部位 || ''}`;
            const isDuplicate = list.some((t) =>
                t?.状态 === 'queued' || t?.状态 === 'running'
                    ? `${t.NPC标识}|${t.构图}|${t.部位 || ''}` === dedupeKey
                    : false
            );
            if (isDuplicate) return list;
            return [task, ...list].slice(0, 100);
        });
    };

    const 更新NPC生图任务 = (taskId: string, updater: (task: NPC生图任务记录) => NPC生图任务记录) => {
        deps.设置NPC生图任务队列((prev: any) => (Array.isArray(prev) ? prev : []).map((task) => (
            task.id === taskId ? updater(task) : task
        )));
    };

    const 删除NPC生图任务 = (taskId: string) => {
        if (!taskId) return;
        deps.设置NPC生图任务队列((prev: any) => (Array.isArray(prev) ? prev : []).filter((task) => task?.id !== taskId));
    };

    const 清空NPC生图任务队列 = (mode: 'all' | 'completed' = 'all') => {
        deps.设置NPC生图任务队列((prev: any) => {
            const baseList = Array.isArray(prev) ? prev : [];
            if (mode === 'all') return [];
            return baseList.filter((task) => task?.状态 === 'queued' || task?.状态 === 'running');
        });
    };

    const 删除NPC图片记录 = (npcId: string, imageId: string) => {
        if (!npcId || !imageId) return;
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc: any) => {
                if (!npc || npc.id !== npcId) return npc;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const currentHistory = Array.isArray(archive?.生图历史)
                    ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
                    : (npc?.最近生图结果 ? [npc.最近生图结果] : []);
                const nextHistory = currentHistory.filter((item: any) => item?.id !== imageId);
                if (nextHistory.length === currentHistory.length) return npc;
                changed = true;
                const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
                const nextSecretArchive = 标准化香闺秘档部位档案({
                    胸部: currentSecretArchive?.胸部?.id === imageId ? undefined : currentSecretArchive?.胸部,
                    小穴: currentSecretArchive?.小穴?.id === imageId ? undefined : currentSecretArchive?.小穴,
                    屁穴: currentSecretArchive?.屁穴?.id === imageId ? undefined : currentSecretArchive?.屁穴,
                    肉棒: currentSecretArchive?.肉棒?.id === imageId ? undefined : currentSecretArchive?.肉棒
                });
                const nextRecent = nextHistory[0];
                const currentSelectedAvatarImageId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
                const currentSelectedPortraitImageId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
                const currentSelectedBackgroundImageId = typeof archive?.已选背景图片ID === 'string' ? archive.已选背景图片ID.trim() : '';
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId && 是否可作头像图片(item))
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find(是否可作头像图片)?.id || undefined);
                // 立绘/背景删除后回退到历史中最后一个可用的图片
                const nextSelectedPortraitImageId = currentSelectedPortraitImageId === imageId
                    ? (nextHistory.find(是否可作立绘图片)?.id || undefined)
                    : currentSelectedPortraitImageId;
                const nextSelectedBackgroundImageId = currentSelectedBackgroundImageId === imageId
                    ? (nextHistory.find(是否可作背景图片)?.id || undefined)
                    : currentSelectedBackgroundImageId;
                return {
                    ...npc,
                    图片档案: nextHistory.length > 0 ? {
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        已选头像图片ID: nextSelectedAvatarImageId,
                        已选立绘图片ID: nextSelectedPortraitImageId,
                        已选背景图片ID: nextSelectedBackgroundImageId,
                        ...(nextSecretArchive ? { 香闺秘档部位档案: nextSecretArchive } : {})
                    } : undefined,
                    最近生图结果: nextRecent
                };
            });
            return { nextList, changed };
        });
    };

    const 清空NPC图片历史 = (npcId?: string) => {
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc: any) => {
                if (!npc) return npc;
                if (npcId && npc.id !== npcId) return npc;
                const hasArchive = Boolean(npc?.图片档案?.最近生图结果) || (Array.isArray(npc?.图片档案?.生图历史) && npc.图片档案.生图历史.length > 0) || Boolean(npc?.最近生图结果);
                if (!hasArchive) return npc;
                changed = true;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const recent = archive?.最近生图结果 || npc?.最近生图结果;
                return {
                    ...npc,
                    图片档案: recent ? {
                        最近生图结果: recent,
                        生图历史: [],
                        已选头像图片ID: typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID : undefined,
                        已选立绘图片ID: typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID : undefined,
                        已选背景图片ID: typeof archive?.已选背景图片ID === 'string' ? archive.已选背景图片ID : undefined
                    } : undefined,
                    最近生图结果: recent
                };
            });
            return { nextList, changed };
        });
    };

    const 更新NPC选图字段 = (npcId: string, field: '已选头像图片ID' | '已选立绘图片ID' | '已选背景图片ID', imageId?: string, validator?: (history: any[]) => boolean) => {
        if (!npcId) return;
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc: any) => {
                if (!npc || npc.id !== npcId) return npc;
                const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
                const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
                if (imageId) {
                    const valid = validator ? validator(history) : true;
                    if (!valid) return npc;
                } else if (typeof archive?.[field] !== 'string' || !archive[field].trim()) {
                    return npc;
                }
                changed = true;
                console.info('[npc.image.slot.set]', {
                    npcId,
                    npcName: npc?.姓名 || `NPC(${npcId})`,
                    field,
                    imageId: imageId || undefined,
                    previousImageId: archive?.[field] || undefined,
                    source: 'manual'
                });
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        最近生图结果: archive?.最近生图结果 || npc?.最近生图结果,
                        生图历史: history,
                        [field]: imageId || undefined
                    }
                };
            });
            return { nextList, changed };
        });
    };

    const 选择NPC头像图片 = (npcId: string, imageId: string) => 更新NPC选图字段(
        npcId,
        '已选头像图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && 是否可作头像图片(item)))
    );

    const 清除NPC头像图片 = (npcId: string) => 更新NPC选图字段(npcId, '已选头像图片ID');

    const 选择NPC立绘图片 = (npcId: string, imageId: string) => 更新NPC选图字段(
        npcId,
        '已选立绘图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && 是否可作立绘图片(item)))
    );

    const 清除NPC立绘图片 = (npcId: string) => 更新NPC选图字段(npcId, '已选立绘图片ID');

    const 选择NPC背景图片 = (npcId: string, imageId: string) => 更新NPC选图字段(
        npcId,
        '已选背景图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && !是否私密图片记录(item) && item?.状态 === 'success' && 获取图片展示地址(item)))
    );

    const 清除NPC背景图片 = (npcId: string) => 更新NPC选图字段(npcId, '已选背景图片ID');

    const 保存NPC图片本地副本 = async (npcId: string, imageId: string) => {
        if (!npcId || !imageId) return;
        const npc = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : []).find((item: any) => item?.id === npcId);
        const history = Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : [];
        const target = history.find((item: any) => item?.id === imageId);
        if (!target) return;
        const imageAIService = await deps.加载图片AI服务();
        const localized = await imageAIService.persistImageAssetLocally({
            图片URL: target?.图片URL,
            本地路径: target?.本地路径
        });
        if (!localized.本地路径) return;

        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((item: any) => {
                if (!item || item.id !== npcId) return item;
                const archive = item?.图片档案 && typeof item.图片档案 === 'object' ? item.图片档案 : {};
                const currentHistory = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
                const nextHistory = currentHistory.map((record: any) => (
                    record?.id === imageId
                        ? {
                            ...record,
                            图片URL: localized.图片URL || record?.图片URL,
                            本地路径: localized.本地路径
                        }
                        : record
                ));
                const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
                const nextSecretArchive = 标准化香闺秘档部位档案({
                    胸部: currentSecretArchive?.胸部?.id === imageId
                        ? { ...currentSecretArchive.胸部, 图片URL: localized.图片URL || currentSecretArchive.胸部?.图片URL, 本地路径: localized.本地路径 }
                        : currentSecretArchive?.胸部,
                    小穴: currentSecretArchive?.小穴?.id === imageId
                        ? { ...currentSecretArchive.小穴, 图片URL: localized.图片URL || currentSecretArchive.小穴?.图片URL, 本地路径: localized.本地路径 }
                        : currentSecretArchive?.小穴,
                    屁穴: currentSecretArchive?.屁穴?.id === imageId
                        ? { ...currentSecretArchive.屁穴, 图片URL: localized.图片URL || currentSecretArchive.屁穴?.图片URL, 本地路径: localized.本地路径 }
                        : currentSecretArchive?.屁穴,
                    肉棒: currentSecretArchive?.肉棒?.id === imageId
                        ? { ...currentSecretArchive.肉棒, 图片URL: localized.图片URL || currentSecretArchive.肉棒?.图片URL, 本地路径: localized.本地路径 }
                        : currentSecretArchive?.肉棒
                });
                changed = true;
                const nextRecent = archive?.最近生图结果?.id === imageId
                    ? { ...archive.最近生图结果, 图片URL: localized.图片URL || archive?.最近生图结果?.图片URL, 本地路径: localized.本地路径 }
                    : item?.最近生图结果?.id === imageId
                        ? { ...item.最近生图结果, 图片URL: localized.图片URL || item?.最近生图结果?.图片URL, 本地路径: localized.本地路径 }
                        : archive?.最近生图结果 || item?.最近生图结果;
                return {
                    ...item,
                    图片档案: {
                        ...archive,
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        ...(nextSecretArchive ? { 香闺秘档部位档案: nextSecretArchive } : {})
                    },
                    最近生图结果: nextRecent
                };
            });
            return { nextList, changed };
        });
    };

    return {
        更新NPC最近生图结果,
        写入NPC图片历史记录,
        更新NPC香闺秘档部位结果,
        写入NPC香闺秘档部位记录,
        获取生图阶段中文,
        创建NPC生图任务,
        追加NPC生图任务,
        更新NPC生图任务,
        删除NPC生图任务,
        清空NPC生图任务队列,
        删除NPC图片记录,
        清空NPC图片历史,
        选择NPC头像图片,
        清除NPC头像图片,
        选择NPC立绘图片,
        清除NPC立绘图片,
        选择NPC背景图片,
        清除NPC背景图片,
        保存NPC图片本地副本
    };
};
