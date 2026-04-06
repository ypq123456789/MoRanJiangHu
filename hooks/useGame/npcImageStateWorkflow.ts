import type { NPC生图任务记录, 香闺秘档部位类型 } from '../../types';
import { 获取图片展示地址, 压缩图片资源字段 } from '../../utils/imageAssets';

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
    const normalizedAsset = 压缩图片资源字段(raw);
    const 图片URL = typeof normalizedAsset?.图片URL === 'string' ? normalizedAsset.图片URL.trim() : undefined;
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
        : undefined;
    if (!图片URL && !本地路径 && !生图词组 && !原始描述 && !错误信息) return undefined;
    return {
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
};

export const 标准化香闺秘档部位档案 = (raw?: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const 胸部 = 标准化香闺秘档部位结果(raw?.胸部, '胸部');
    const 小穴 = 标准化香闺秘档部位结果(raw?.小穴, '小穴');
    const 屁穴 = 标准化香闺秘档部位结果(raw?.屁穴, '屁穴');
    if (!胸部 && !小穴 && !屁穴) return undefined;
    return {
        ...(胸部 ? { 胸部 } : {}),
        ...(小穴 ? { 小穴 } : {}),
        ...(屁穴 ? { 屁穴 } : {})
    };
};

export const 合并香闺秘档部位档案 = (currentRaw?: any, incomingRaw?: any) => {
    const current = 标准化香闺秘档部位档案(currentRaw) || {};
    const incoming = 标准化香闺秘档部位档案(incomingRaw) || {};
    return 标准化香闺秘档部位档案({
        胸部: incoming.胸部 || current.胸部,
        小穴: incoming.小穴 || current.小穴,
        屁穴: incoming.屁穴 || current.屁穴
    });
};

export const 合并NPC图片档案 = (currentNpc: any, payload: any) => {
    const currentArchive = currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {};
    const currentRecent = currentArchive?.最近生图结果 || currentNpc?.最近生图结果;
    const currentHistory = Array.isArray(currentArchive?.生图历史) ? currentArchive.生图历史 : (currentRecent ? [currentRecent] : []);
    const nextRecent = payload?.最近生图结果 || payload?.图片档案?.最近生图结果 || currentRecent;
    const incomingHistory = Array.isArray(payload?.图片档案?.生图历史)
        ? payload.图片档案.生图历史
        : (Array.isArray(payload?.生图历史) ? payload.生图历史 : []);
    const mergedHistory = [...incomingHistory, ...currentHistory]
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
                    : (mergedHistory[0]?.id || 生成NPC生图记录ID())
            };
        })()
        : undefined;
    const incomingSelectedAvatarImageId = typeof payload?.图片档案?.已选头像图片ID === 'string'
        ? payload.图片档案.已选头像图片ID.trim()
        : (typeof payload?.已选头像图片ID === 'string' ? payload.已选头像图片ID.trim() : '');
    const incomingSelectedPortraitImageId = typeof payload?.图片档案?.已选立绘图片ID === 'string'
        ? payload.图片档案.已选立绘图片ID.trim()
        : (typeof payload?.已选立绘图片ID === 'string' ? payload.已选立绘图片ID.trim() : '');
    const incomingSelectedBackgroundImageId = typeof payload?.图片档案?.已选背景图片ID === 'string'
        ? payload.图片档案.已选背景图片ID.trim()
        : (typeof payload?.已选背景图片ID === 'string' ? payload.已选背景图片ID.trim() : '');
    const fallbackAvatarId = mergedHistory.find((item) => item?.构图 === '头像' && item?.状态 === 'success' && item?.id)?.id
        || mergedHistory.find((item) => item?.构图 !== '部位特写' && item?.状态 === 'success' && item?.id)?.id
        || '';
    const selectedAvatarImageId = incomingSelectedAvatarImageId
        || (typeof currentArchive?.已选头像图片ID === 'string' ? currentArchive.已选头像图片ID.trim() : '')
        || fallbackAvatarId;
    const selectedPortraitImageId = incomingSelectedPortraitImageId
        || (typeof currentArchive?.已选立绘图片ID === 'string' ? currentArchive.已选立绘图片ID.trim() : '')
        || undefined;
    const selectedBackgroundImageId = incomingSelectedBackgroundImageId
        || (typeof currentArchive?.已选背景图片ID === 'string' ? currentArchive.已选背景图片ID.trim() : '')
        || undefined;
    const 香闺秘档部位档案 = 合并香闺秘档部位档案(
        currentArchive?.香闺秘档部位档案,
        payload?.图片档案?.香闺秘档部位档案 || payload?.香闺秘档部位档案
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
    const 更新社交并自动存档 = (updater: (prev: any[]) => { nextList: any[]; changed: boolean }) => {
        let changed = false;
        let socialSnapshot: any[] | null = null;
        deps.设置社交((prev: any) => {
            const baseList = Array.isArray(prev) ? prev : [];
            const result = updater(baseList);
            changed = result.changed;
            if (!changed) return prev;
            const normalizedList = deps.规范化社交列表(result.nextList, { 合并同名: false });
            socialSnapshot = normalizedList;
            return normalizedList;
        });
        if (changed && socialSnapshot) {
            deps.执行社交自动存档(socialSnapshot);
        }
    };

    const 更新NPC最近生图结果 = (npcKey: string, updater: (npc: any) => any) => {
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc, index) => {
                if (deps.获取NPC唯一标识(npc, index) !== npcKey) return npc;
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
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc, index) => {
                if (deps.获取NPC唯一标识(npc, index) !== npcKey) return npc;
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
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId)
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find((item: any) => item?.构图 === '头像' && item?.状态 === 'success' && item?.id)?.id
                        || nextHistory.find((item: any) => item?.构图 !== '部位特写' && item?.状态 === 'success' && item?.id)?.id
                        || undefined);
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        已选头像图片ID: nextSelectedAvatarImageId,
                        已选立绘图片ID: currentSelectedPortraitImageId,
                        已选背景图片ID: currentSelectedBackgroundImageId
                    },
                    最近生图结果: nextRecent
                };
            });
            return { nextList, changed };
        });
    };

    const 更新NPC香闺秘档部位结果 = (
        npcKey: string,
        part: 香闺秘档部位类型,
        updater: (current: any) => any
    ) => {
        更新社交并自动存档((baseList) => {
            let changed = false;
            const nextList = baseList.map((npc, index) => {
                if (deps.获取NPC唯一标识(npc, index) !== npcKey) return npc;
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
    }): NPC生图任务记录 => ({
        id: `npc_image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        目标类型: 'npc',
        NPC标识: params.npcKey,
        NPC姓名: typeof params.npc?.姓名 === 'string' ? params.npc.姓名.trim() || '未命名NPC' : '未命名NPC',
        NPC性别: params.npc?.性别 === '男' || params.npc?.性别 === '女' ? params.npc.性别 : undefined,
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
    });

    const 追加NPC生图任务 = (task: NPC生图任务记录) => {
        deps.设置NPC生图任务队列((prev: any) => [task, ...(Array.isArray(prev) ? prev : [])].slice(0, 100));
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
                    屁穴: currentSecretArchive?.屁穴?.id === imageId ? undefined : currentSecretArchive?.屁穴
                });
                const nextRecent = nextHistory[0];
                const currentSelectedAvatarImageId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
                const currentSelectedPortraitImageId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
                const currentSelectedBackgroundImageId = typeof archive?.已选背景图片ID === 'string' ? archive.已选背景图片ID.trim() : '';
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId)
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find((item: any) => item?.构图 === '头像' && item?.状态 === 'success' && item?.id)?.id
                        || nextHistory.find((item: any) => item?.构图 !== '部位特写' && item?.状态 === 'success' && item?.id)?.id
                        || undefined);
                return {
                    ...npc,
                    图片档案: nextHistory.length > 0 ? {
                        最近生图结果: nextRecent,
                        生图历史: nextHistory,
                        已选头像图片ID: nextSelectedAvatarImageId,
                        已选立绘图片ID: currentSelectedPortraitImageId === imageId ? undefined : currentSelectedPortraitImageId,
                        已选背景图片ID: currentSelectedBackgroundImageId === imageId ? undefined : currentSelectedBackgroundImageId,
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
        (history) => Boolean(history.find((item: any) => item?.id === imageId && item?.构图 === '头像' && item?.状态 === 'success' && 获取图片展示地址(item)))
    );

    const 清除NPC头像图片 = (npcId: string) => 更新NPC选图字段(npcId, '已选头像图片ID');

    const 选择NPC立绘图片 = (npcId: string, imageId: string) => 更新NPC选图字段(
        npcId,
        '已选立绘图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && (item?.构图 === '半身' || item?.构图 === '立绘') && item?.状态 === 'success' && 获取图片展示地址(item)))
    );

    const 清除NPC立绘图片 = (npcId: string) => 更新NPC选图字段(npcId, '已选立绘图片ID');

    const 选择NPC背景图片 = (npcId: string, imageId: string) => 更新NPC选图字段(
        npcId,
        '已选背景图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && item?.构图 !== '部位特写' && item?.状态 === 'success' && 获取图片展示地址(item)))
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
                        : currentSecretArchive?.屁穴
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
