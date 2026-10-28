import type { NPC结构, 图片记录来源类型, 香闺秘档部位类型 } from '../../types';
import type { 详细门派结构 } from '../../models/sect';
import { 生成NPC生图记录ID } from './npcImageStateWorkflow';
import { recordDiagnosticLog } from '../../services/diagnosticLog';

type 手动NPC工作流依赖 = {
    获取环境: () => any;
    环境时间转标准串: (env: any) => string;
    规范化社交列表: (list: any[], options?: { 合并同名?: boolean }) => any[];
    设置社交: (updater: any) => void;
    获取玩家门派?: () => 详细门派结构 | undefined;
    设置玩家门派?: (updater: any) => void;
    执行社交自动存档: (socialSnapshot: NPC结构[], sectSnapshot?: 详细门派结构) => void;
    执行NPC变量本地备份?: (socialSnapshot: NPC结构[], options?: { 标签?: string }) => void | Promise<void>;
    保存图片资源: (dataUrl: string) => Promise<string>;
};

const 生成手动NPCID = (): string => `npc_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 取首个非空文本 = (...values: unknown[]): string => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
};

const 规范化匹配键 = (value: unknown): string => (
    typeof value === 'string' ? value.trim().replace(/\s+/g, '').toLowerCase() : ''
);

const 取NPC匹配键集合 = (npc: any): Set<string> => new Set(
    [npc?.id, npc?.ID, npc?.姓名, npc?.名称]
        .map(规范化匹配键)
        .filter(Boolean)
);

const 规范化NPC性别 = (value: unknown): '男' | '女' | '男娘' | '扶她' => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.includes('扶她')) return '扶她';
    if (text.includes('男娘')) return '男娘';
    if (/^(男|男性|男子|男修|男性修士)$/u.test(text)) return '男';
    if (/^(女|女性|女子|女修|女性修士)$/u.test(text)) return '女';
    return '女';
};

const 门派成员匹配NPC = (member: any, npc: any, memberIndex: number, sectId?: string): boolean => {
    if (!member || !npc) return false;
    const npcKeys = 取NPC匹配键集合(npc);
    const syntheticId = `sect_member_${sectId || 'unknown'}_${memberIndex}`;
    return [member?.id, member?.ID, member?.姓名, member?.名称, syntheticId]
        .map(规范化匹配键)
        .filter(Boolean)
        .some((key) => npcKeys.has(key));
};

const 移除NPC关联门派成员 = (
    sect: 详细门派结构 | undefined,
    npc: any
): 详细门派结构 | null => {
    if (!sect || !Array.isArray(sect.重要成员) || sect.重要成员.length === 0 || !npc) return null;
    if (npc?.来源 !== '玩家门派.重要成员' && !取NPC匹配键集合(npc).size) return null;
    const nextMembers = sect.重要成员.filter((member: any, index: number) => (
        !门派成员匹配NPC(member, npc, index, sect.ID)
    ));
    if (nextMembers.length === sect.重要成员.length) return null;
    return { ...sect, 重要成员: nextMembers };
};

const 生成生日 = (npc: any, nowText: string): string => {
    const seed = 取首个非空文本(npc?.id, npc?.姓名, npc?.身份, nowText);
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
    }
    const positive = Math.abs(hash);
    const month = (positive % 12) + 1;
    const day = (Math.floor(positive / 12) % 28) + 1;
    return `${month}月${day}日`;
};

const 构建女性重要角色档案初稿 = (npc: any, nowText: string): any => {
    if (!npc || npc.性别 !== '女' || npc.是否主要角色 !== true) return npc;
    const name = 取首个非空文本(npc?.姓名, '她');
    const identity = 取首个非空文本(npc?.身份, npc?.境界, '江湖女子');
    const personality = 取首个非空文本(npc?.核心性格特征, npc?.简介, '气质沉静，言行自持');
    const appearance = 取首个非空文本(npc?.外貌描写, npc?.外貌, npc?.档案?.外貌要点, npc?.档案?.外貌描写);
    const body = 取首个非空文本(npc?.身材描写, npc?.身材, npc?.档案?.身材要点, npc?.档案?.身材描写);
    const clothing = 取首个非空文本(npc?.衣着风格, npc?.衣着, npc?.档案?.衣着风格, npc?.档案?.衣着要点);
    const relationship = 取首个非空文本(npc?.关系状态, '初识');

    const next = {
        ...npc,
        生日: 取首个非空文本(npc?.生日, npc?.出生日期, npc?.档案?.生日) || 生成生日(npc, nowText),
        对主角称呼: 取首个非空文本(npc?.对主角称呼, npc?.档案?.对主角称呼) || (relationship.includes('陌生') || relationship.includes('初识') ? '少侠' : '公子'),
        外貌描写: appearance || `${name}眉眼清丽，气韵与${identity}身份相称，神态里带着不易忽略的辨识度。`,
        身材描写: body || `${name}身形匀称，仪态收放有度，行动间能看出长期行走江湖或修习武艺留下的利落线条。`,
        衣着风格: clothing || `${name}常着与${identity}相配的衣裙，配色素雅而整洁，细节处保留个人偏好。`,
        胸部描述: 取首个非空文本(npc?.胸部描述) || `${name}胸部轮廓自然协调，与整体身形比例相称，档案细节待后续剧情补充。`,
        小穴描述: 取首个非空文本(npc?.小穴描述) || `${name}私密档案已建立，具体状态保持为未公开记录，等待后续剧情自然补充。`,
        屁穴描述: 取首个非空文本(npc?.屁穴描述) || `${name}后庭档案已建立，当前无特殊经历记录，等待后续剧情自然补充。`,
        肉棒描述: 取首个非空文本(npc?.肉棒描述) || `${name}男性私密档案已建立，具体状态保持为未公开记录，等待后续剧情自然补充。`,
        男娘设定: 取首个非空文本(npc?.男娘设定) || '',
        扶她设定: 取首个非空文本((npc as any)?.扶她设定) || '',
        性癖: 取首个非空文本(npc?.性癖) || `受${personality}影响，更重视信任、情绪安全与关系递进。`,
        敏感点: 取首个非空文本(npc?.敏感点) || '耳侧、颈侧、腰背等近身接触区域较易触动情绪反应。',
        子宫: npc?.子宫 && typeof npc.子宫 === 'object' && !Array.isArray(npc.子宫)
            ? {
                状态: 取首个非空文本(npc.子宫.状态) || '未受孕',
                宫口状态: 取首个非空文本(npc.子宫.宫口状态) || '紧闭',
                内射记录: Array.isArray(npc.子宫.内射记录) ? npc.子宫.内射记录 : []
            }
            : {
                状态: '未受孕',
                宫口状态: '紧闭',
                内射记录: []
            }
    };
    return next;
};

export const 创建手动NPC工作流 = (deps: 手动NPC工作流依赖) => {
    const 更新社交并执行即时自动存档 = (
        updater: (list: NPC结构[]) => NPC结构[],
        options?: { 延迟自动存档?: boolean }
    ) => {
        let socialSnapshot: NPC结构[] | null = null;
        deps.设置社交((prev: any) => {
            const nextList = updater(Array.isArray(prev) ? prev : []);
            const normalizedList = deps.规范化社交列表(nextList, { 合并同名: false });
            socialSnapshot = normalizedList;
            return normalizedList;
        });
        if (socialSnapshot && !options?.延迟自动存档) {
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
            性别: 规范化NPC性别(seed?.性别),
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
            力量: Number((seed as any)?.力量) || 0,
            敏捷: Number((seed as any)?.敏捷) || 0,
            体质: Number((seed as any)?.体质) || 0,
            根骨: Number((seed as any)?.根骨) || 0,
            悟性: Number((seed as any)?.悟性) || 0,
            福源: Number((seed as any)?.福源) || 0,
            境界层级: Number((seed as any)?.境界层级) || 1,
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
            肉棒描述: (seed as any)?.肉棒描述 || '',
            男娘设定: (seed as any)?.男娘设定 || '',
            扶她设定: (seed as any)?.扶她设定 || '',
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
            天赋列表: Array.isArray(seed?.天赋列表) ? seed.天赋列表 : [],
            出身背景: seed?.出身背景 && typeof seed.出身背景 === 'object' && !Array.isArray(seed.出身背景) ? seed.出身背景 : undefined,
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

    const 删除NPC并清理关联门派成员 = (npcId: string) => {
        if (!npcId) return;
        let removedNpc: NPC结构 | null = null;
        let sectSnapshot: 详细门派结构 | null = null;
        let beforeDeleteSnapshot: NPC结构[] = [];
        const socialSnapshot = 更新社交并执行即时自动存档((prev) => {
            beforeDeleteSnapshot = deps.规范化社交列表(prev, { 合并同名: false });
            removedNpc = prev.find((npc: any) => npc && (npc.id === npcId || npc.ID === npcId)) || null;
            return prev.filter((npc: any) => npc && npc.id !== npcId && npc.ID !== npcId);
        }, { 延迟自动存档: true });
        if (removedNpc && beforeDeleteSnapshot.length > 0) {
            void Promise.resolve(deps.执行NPC变量本地备份?.(beforeDeleteSnapshot, {
                标签: `删除 ${removedNpc.姓名 || removedNpc.id || npcId} 前`
            })).catch((backupError) => {
                recordDiagnosticLog('warn', ['删除NPC前备份失败', {
                    message: backupError?.message || '',
                    stack: typeof backupError?.stack === 'string' ? backupError.stack : undefined
                }]);
                console.warn('删除 NPC 前本地备份失败', backupError);
            });
        }
        if (removedNpc && deps.获取玩家门派 && deps.设置玩家门派) {
            const nextSect = 移除NPC关联门派成员(deps.获取玩家门派(), removedNpc);
            if (nextSect) {
                sectSnapshot = nextSect;
                deps.设置玩家门派(nextSect);
            }
        }
        if (socialSnapshot) {
            deps.执行社交自动存档(socialSnapshot, sectSnapshot || undefined);
        }
    };

    const deleteNpcManually = (npcId: string) => {
        删除NPC并清理关联门派成员(npcId);
    };

    const updateNpcMajorRole = (npcId: string, isMajor: boolean) => {
        if (!npcId) return;
        const 环境 = deps.获取环境();
        const nowText = deps.环境时间转标准串(环境) || 环境?.时间 || '';
        更新社交并执行即时自动存档((prev) => prev.map((npc: any) => (
            !npc || npc.id !== npcId
                ? npc
                : 构建女性重要角色档案初稿({ ...npc, 是否主要角色: isMajor }, nowText)
        )));
    };

    const updateNpcPresence = (npcId: string, isPresent: boolean) => {
        if (!npcId) return;
        更新社交并执行即时自动存档((prev) => prev.map((npc: any) => (
            !npc || npc.id !== npcId ? npc : { ...npc, 是否在场: isPresent }
        )));
    };

    const removeNpc = (npcId: string) => {
        删除NPC并清理关联门派成员(npcId);
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
            if (slot === '胸部' || slot === '小穴' || slot === '屁穴' || slot === '肉棒') {
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
                构图: slot === '头像' ? '头像' as const : '立绘' as const,
                // 背景图沿用「立绘」构图以兼容既有读取路径，但显式标记用途，
                // 避免被按构图取立绘的展示逻辑误当成立绘（见 CodeRabbit PR #117）。
                图片用途: slot as '头像' | '立绘' | '背景'
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
