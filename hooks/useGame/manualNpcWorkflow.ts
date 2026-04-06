import type { NPC结构, 图片记录来源类型, 香闺秘档部位类型 } from '../../types';
import { 生成NPC生图记录ID } from './npcImageStateWorkflow';

type 手动NPC工作流依赖 = {
    获取环境: () => any;
    环境时间转标准串: (env: any) => string;
    规范化社交列表: (list: any[], options?: { 合并同名?: boolean }) => any[];
    设置社交: (updater: any) => void;
    执行社交自动存档: (socialSnapshot: NPC结构[]) => void;
    保存图片资源: (dataUrl: string) => Promise<string>;
};

const 生成手动NPCID = (): string => `npc_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const 创建手动NPC工作流 = (deps: 手动NPC工作流依赖) => {
    const 更新社交并执行即时自动存档 = (updater: (list: NPC结构[]) => NPC结构[]) => {
        let socialSnapshot: NPC结构[] | null = null;
        deps.设置社交((prev: any) => {
            const nextList = updater(Array.isArray(prev) ? prev : []);
            const normalizedList = deps.规范化社交列表(nextList, { 合并同名: false });
            socialSnapshot = normalizedList;
            return normalizedList;
        });
        if (socialSnapshot) {
            deps.执行社交自动存档(socialSnapshot);
        }
        return socialSnapshot;
    };

    const 创建默认NPC = (seed?: Partial<NPC结构>): NPC结构 => {
        const 环境 = deps.获取环境();
        const nowText = deps.环境时间转标准串(环境) || 环境?.时间 || '';
        const rawNpc: NPC结构 = {
            id: seed?.id || 生成手动NPCID(),
            姓名: seed?.姓名 || '未命名NPC',
            性别: seed?.性别 === '男' ? '男' : '女',
            年龄: Number(seed?.年龄) || 18,
            生日: seed?.生日 || '',
            境界: seed?.境界 || '未知',
            身份: seed?.身份 || '',
            是否在场: seed?.是否在场 === true,
            是否队友: seed?.是否队友 === true,
            是否主要角色: seed?.是否主要角色 === true,
            好感度: Number(seed?.好感度) || 0,
            关系状态: seed?.关系状态 || '陌生',
            对主角称呼: seed?.对主角称呼 || '',
            简介: seed?.简介 || '',
            核心性格特征: seed?.核心性格特征 || '',
            好感度突破条件: seed?.好感度突破条件 || '',
            关系突破条件: seed?.关系突破条件 || '',
            关系网变量: Array.isArray(seed?.关系网变量) ? seed.关系网变量 : [],
            攻击力: Number(seed?.攻击力) || 0,
            防御力: Number(seed?.防御力) || 0,
            上次更新时间: seed?.上次更新时间 || nowText,
            当前血量: Number(seed?.当前血量) || 0,
            最大血量: Number(seed?.最大血量) || 0,
            当前精力: Number(seed?.当前精力) || 0,
            最大精力: Number(seed?.最大精力) || 0,
            当前内力: Number(seed?.当前内力) || 0,
            最大内力: Number(seed?.最大内力) || 0,
            当前装备: seed?.当前装备 || {},
            背包: Array.isArray(seed?.背包) ? seed.背包 : [],
            外貌描写: seed?.外貌描写 || '',
            身材描写: seed?.身材描写 || '',
            衣着风格: seed?.衣着风格 || '',
            胸部描述: seed?.胸部描述 || '',
            小穴描述: seed?.小穴描述 || '',
            屁穴描述: seed?.屁穴描述 || '',
            性癖: seed?.性癖 || '',
            敏感点: seed?.敏感点 || '',
            子宫: seed?.子宫 || {
                状态: '未受孕',
                宫口状态: '紧致',
                内射记录: []
            },
            是否处女: seed?.是否处女,
            初夜夺取者: seed?.初夜夺取者 || '',
            初夜时间: seed?.初夜时间 || '',
            初夜描述: seed?.初夜描述 || '',
            记忆: Array.isArray(seed?.记忆) ? seed.记忆 : [],
            总结记忆: Array.isArray(seed?.总结记忆) ? seed.总结记忆 : [],
            图片档案: seed?.图片档案 || {},
            最近生图结果: seed?.最近生图结果
        };
        return deps.规范化社交列表([rawNpc], { 合并同名: false })[0] || rawNpc;
    };

    const createNpcManually = (seed?: Partial<NPC结构>) => {
        const createdNpc = 创建默认NPC(seed);
        更新社交并执行即时自动存档((prev) => [...prev, createdNpc]);
        return createdNpc;
    };

    const updateNpcManually = (npcId: string, nextNpc: NPC结构) => {
        if (!npcId || !nextNpc) return;
        const normalizedNpc = 创建默认NPC({ ...nextNpc, id: npcId });
        更新社交并执行即时自动存档((prev) => prev.map((npc) => npc?.id === npcId ? normalizedNpc : npc));
    };

    const deleteNpcManually = (npcId: string) => {
        if (!npcId) return;
        更新社交并执行即时自动存档((prev) => prev.filter((npc) => npc && npc.id !== npcId));
    };

    const updateNpcMajorRole = (npcId: string, isMajor: boolean) => {
        if (!npcId) return;
        更新社交并执行即时自动存档((prev) => prev.map((npc: any) => (
            !npc || npc.id !== npcId ? npc : { ...npc, 是否主要角色: isMajor }
        )));
    };

    const updateNpcPresence = (npcId: string, isPresent: boolean) => {
        if (!npcId) return;
        更新社交并执行即时自动存档((prev) => prev.map((npc: any) => (
            !npc || npc.id !== npcId ? npc : { ...npc, 是否在场: isPresent }
        )));
    };

    const removeNpc = (npcId: string) => {
        if (!npcId) return;
        更新社交并执行即时自动存档((prev) => prev.filter((npc: any) => npc && npc.id !== npcId));
    };

    const uploadNpcImageToSlot = async (
        npcId: string,
        slot: '头像' | '立绘' | '背景' | 香闺秘档部位类型,
        payload: { dataUrl: string; fileName?: string }
    ) => {
        const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl.trim() : '';
        if (!npcId || !dataUrl) return null;
        const assetRef = await deps.保存图片资源(dataUrl);
        const uploadedAt = Date.now();
        const commonRecord = {
            id: 生成NPC生图记录ID(),
            图片URL: assetRef,
            本地路径: assetRef,
            生图词组: '手动上传',
            原始描述: `手动上传${slot}图片`,
            使用模型: 'manual_upload',
            生成时间: uploadedAt,
            状态: 'success' as const,
            来源: 'upload' as 图片记录来源类型,
            上传文件名: payload?.fileName || '',
            上传时间: uploadedAt
        };
        更新社交并执行即时自动存档((prev) => prev.map((npc) => {
            if (!npc || npc.id !== npcId) return npc;
            const archive = npc?.图片档案 && typeof npc.图片档案 === 'object' ? npc.图片档案 : {};
            if (slot === '胸部' || slot === '小穴' || slot === '屁穴') {
                return {
                    ...npc,
                    图片档案: {
                        ...archive,
                        香闺秘档部位档案: {
                            ...(archive.香闺秘档部位档案 || {}),
                            [slot]: {
                                ...commonRecord,
                                部位: slot,
                                构图: '部位特写',
                                描述文本: `手动上传${slot}图片`
                            }
                        }
                    }
                };
            }
            const record = {
                ...commonRecord,
                构图: slot === '头像' ? '头像' as const : '立绘' as const
            };
            const nextHistory = [record, ...(Array.isArray(archive.生图历史) ? archive.生图历史 : []).filter((item: any) => item?.id !== record.id)]
                .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
            return {
                ...npc,
                最近生图结果: record,
                图片档案: {
                    ...archive,
                    最近生图结果: record,
                    生图历史: nextHistory,
                    已选头像图片ID: slot === '头像' ? record.id : archive.已选头像图片ID,
                    已选立绘图片ID: slot === '立绘' ? record.id : archive.已选立绘图片ID,
                    已选背景图片ID: slot === '背景' ? record.id : archive.已选背景图片ID,
                    香闺秘档部位档案: archive.香闺秘档部位档案
                }
            };
        }));
        return assetRef;
    };

    return {
        createNpcManually,
        updateNpcManually,
        deleteNpcManually,
        uploadNpcImageToSlot,
        updateNpcMajorRole,
        updateNpcPresence,
        removeNpc
    };
};
