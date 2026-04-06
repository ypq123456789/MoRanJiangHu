import type { 香闺秘档部位类型 } from '../../../types';

type 右下角提示参数 = {
    title: string;
    message: string;
    tone?: 'info' | 'success' | 'error';
};

type 手动图片动作工作流依赖 = {
    获取社交列表: () => any[];
    记录后台手动生图监控: (payload: { npcId: string; since: number; npcName: string; 构图: '头像' | '半身' | '立绘' }) => void;
    记录后台私密生图监控: (payload: { npcId: string; since: number; npcName: string; 部位: 香闺秘档部位类型 }) => void;
    推送右下角提示: (toast: 右下角提示参数) => void;
    执行单个NPC生图: (npc: any, options?: any) => Promise<void>;
    执行NPC香闺秘档部位生图: (npc: any, part: 香闺秘档部位类型, options?: any) => Promise<void>;
};

type 手动NPC生图选项 = {
    构图?: '头像' | '半身' | '立绘';
    画风?: any;
    画师串?: string;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    额外要求?: string;
    尺寸?: string;
    后台处理?: boolean;
};

type 手动私密生图选项 = {
    画风?: any;
    画师串?: string;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    额外要求?: string;
    尺寸?: string;
    后台处理?: boolean;
};

const 获取NPC名称 = (npc: any): string => (
    typeof npc?.姓名 === 'string' && npc.姓名.trim() ? npc.姓名.trim() : '未命名NPC'
);

export const 创建手动图片动作工作流 = (deps: 手动图片动作工作流依赖) => {
    const generateNpcImageManually = async (
        npcId: string,
        options?: 手动NPC生图选项
    ) => {
        if (!npcId) return;
        const targetNpc = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : []).find((npc: any) => npc && npc.id === npcId);
        if (!targetNpc) return;

        if (options?.后台处理) {
            deps.记录后台手动生图监控({
                npcId,
                since: Date.now(),
                npcName: 获取NPC名称(targetNpc),
                构图: options?.构图 || '头像'
            });
        }

        void deps.执行单个NPC生图(targetNpc, {
            force: true,
            source: 'manual',
            构图: options?.构图,
            画风: options?.画风,
            画师串: options?.画师串,
            画师串预设ID: options?.画师串预设ID,
            PNG画风预设ID: options?.PNG画风预设ID,
            额外要求: options?.额外要求,
            尺寸: options?.尺寸
        }).catch((error) => {
            console.error('手动NPC生图任务执行失败', error);
        });
    };

    const generateNpcSecretPartImage = async (
        npcId: string,
        part: 香闺秘档部位类型 | '全部',
        options?: 手动私密生图选项
    ) => {
        if (!npcId) return;
        const targetNpc = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : []).find((npc: any) => npc && npc.id === npcId);
        if (!targetNpc) return;

        const targetParts: 香闺秘档部位类型[] = part === '全部' ? ['胸部', '小穴', '屁穴'] : [part];
        const npcName = 获取NPC名称(targetNpc);

        if (options?.后台处理) {
            const monitorSince = Date.now();
            targetParts.forEach((currentPart) => {
                deps.记录后台私密生图监控({
                    npcId,
                    since: monitorSince,
                    npcName,
                    部位: currentPart
                });
            });
            deps.推送右下角提示({
                title: '香闺秘档特写已提交',
                message: part === '全部'
                    ? `${npcName}的三处特写已转入后台生成，可在图片队列查看进度。`
                    : `${npcName}的${part}特写已转入后台生成，可在图片队列查看进度。`,
                tone: 'info'
            });
            void (async () => {
                const errors: string[] = [];
                for (const currentPart of targetParts) {
                    try {
                        await deps.执行NPC香闺秘档部位生图(targetNpc, currentPart, options);
                    } catch (error: any) {
                        const message = typeof error?.message === 'string' && error.message.trim()
                            ? error.message.trim()
                            : `${currentPart}特写生成失败`;
                        errors.push(`${currentPart}：${message}`);
                    }
                }
                if (errors.length > 0) {
                    deps.推送右下角提示({
                        title: '香闺秘档特写失败',
                        message: errors.join('；'),
                        tone: 'error'
                    });
                }
            })();
            return;
        }

        deps.推送右下角提示({
            title: '香闺秘档特写已提交',
            message: part === '全部'
                ? `${npcName}的三处特写已加入生成流程，可在图片队列查看进度。`
                : `${npcName}的${part}特写已加入生成流程，可在图片队列查看进度。`,
            tone: 'info'
        });
        const errors: string[] = [];
        for (const currentPart of targetParts) {
            try {
                await deps.执行NPC香闺秘档部位生图(targetNpc, currentPart, options);
            } catch (error: any) {
                const message = typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : `${currentPart}特写生成失败`;
                errors.push(`${currentPart}：${message}`);
            }
        }
        if (errors.length > 0) {
            deps.推送右下角提示({
                title: '香闺秘档特写生成失败',
                message: errors.join('；'),
                tone: 'error'
            });
            throw new Error(errors.join('\n'));
        }
        deps.推送右下角提示({
            title: '香闺秘档特写生成完成',
            message: part === '全部'
                ? `${npcName}的三处特写已全部写入图片档案。`
                : `${npcName}的${part}特写已写入图片档案。`,
            tone: 'success'
        });
    };

    const retryNpcImageGeneration = async (npcId: string) => {
        if (!npcId) return;
        const targetNpc = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : []).find((npc: any) => npc && npc.id === npcId);
        if (!targetNpc) return;
        const comp = targetNpc?.图片档案?.最近生图结果?.构图 || targetNpc?.最近生图结果?.构图;
        const validComp = ['头像', '半身', '立绘'].includes(comp as string) ? (comp as '头像' | '半身' | '立绘') : undefined;
        await deps.执行单个NPC生图(targetNpc, {
            force: true,
            source: 'retry',
            构图: validComp
        });
    };

    return {
        generateNpcImageManually,
        generateNpcSecretPartImage,
        retryNpcImageGeneration
    };
};
