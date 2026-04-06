import type { GameResponse, 生图任务来源类型 } from '../../types';

type 场景生图触发参数 = {
    response: GameResponse;
    bodyText?: string;
    env?: any;
    turnNumber?: number;
    playerInput?: string;
    source?: 生图任务来源类型;
    autoApply?: boolean;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    构图要求?: '纯场景' | '故事快照';
    尺寸?: string;
    额外要求?: string;
    强制执行?: boolean;
};

type 手动场景生图参数 = {
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    构图要求?: '纯场景' | '故事快照';
    尺寸?: string;
    额外要求?: string;
    后台处理?: boolean;
};

type 场景生图触发工作流依赖 = {
    获取环境: () => any;
    获取角色: () => any;
    获取社交列表: () => any[];
    获取历史记录: () => any[];
    获取接口配置: () => any;
    规范化环境信息: (raw: any) => any;
    深拷贝: <T,>(value: T) => T;
    环境时间转标准串: (env: any) => string;
    构建完整地点文本: (env: any) => string;
    修炼体系已启用: () => boolean;
    提取NPC生图基础数据: (npc: any) => any;
    读取文生图功能配置: () => {
        场景画风?: any;
        场景构图要求: '纯场景' | '故事快照';
        场景尺寸: string;
    };
    场景模式已开启: () => boolean;
    构建文生图额外要求: (extra?: string) => string;
    加载场景生图工作流: () => Promise<any>;
    获取场景文生图接口配置: (...args: any[]) => any;
    获取生图词组转化器接口配置: (...args: any[]) => any;
    获取生图画师串预设: (...args: any[]) => any;
    获取当前PNG画风预设: (presetId?: string) => any;
    获取场景角色锚点: (sceneContext: unknown) => any;
    获取词组转化器预设提示词: (...args: any[]) => any;
    接口配置是否可用: (...args: any[]) => boolean;
    创建场景生图任务: (params: any) => any;
    生成场景生图记录ID: () => string;
    追加场景生图任务: (task: any) => void;
    更新场景生图任务: (taskId: string, updater: (task: any) => any) => void;
    更新场景图片档案: (updater: (archive: any) => any) => void;
    应用场景图片为壁纸: (imageId: string) => Promise<any> | any;
    获取当前自动应用任务ID: () => string;
    设置当前自动应用任务ID: (requestId: string) => void;
    记录后台场景监控: (item: { since: number; 摘要: string }) => void;
    推送右下角提示: (toast: { title: string; message: string; tone?: 'info' | 'success' | 'error' }) => void;
};

const 生成场景摘要 = (bodyText: string, envLike: any, 环境时间转标准串: (env: any) => string): string => {
    const body = (bodyText || '').replace(/\s+/g, ' ').trim();
    const location = [envLike?.大地点, envLike?.中地点, envLike?.小地点, envLike?.具体地点]
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .join(' / ');
    const timeText = 环境时间转标准串(envLike) || (typeof envLike?.时间 === 'string' ? envLike.时间.trim() : '');
    const weather = typeof envLike?.天气?.天气 === 'string' ? envLike.天气.天气.trim() : '';
    return [location, weather, timeText, body.slice(0, 80)].filter(Boolean).join(' · ');
};

const 提取正文包裹片段 = (bodyText: string): string[] => {
    const tokens: string[] = [];
    const regex = /【([^【】]{1,24})】/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(bodyText || '')) !== null) {
        const token = (match[1] || '').trim();
        if (!token || tokens.includes(token)) continue;
        tokens.push(token);
    }
    return tokens;
};

export const 创建场景生图触发工作流 = (deps: 场景生图触发工作流依赖) => {
    const 提取场景主角快照 = () => {
        const 角色 = deps.获取角色();
        const 启用修炼体系 = deps.修炼体系已启用();
        const 身份片段 = [
            角色?.称号,
            角色?.门派职位,
            启用修炼体系 ? 角色?.境界 : ''
        ].filter((item) => typeof item === 'string' && item.trim().length > 0);
        return {
            姓名: 角色?.姓名 || '主角',
            性别: 角色?.性别 || '未知',
            年龄: typeof 角色?.年龄 === 'number' ? 角色.年龄 : undefined,
            身份: 身份片段.join(' / ') || '未知身份',
            外貌: typeof 角色?.外貌 === 'string' ? 角色.外貌.trim() : '',
            性格: typeof 角色?.性格 === 'string' ? 角色.性格.trim() : ''
        };
    };

    const 提取场景NPC快照 = (npc: any) => {
        const base = deps.提取NPC生图基础数据(npc);
        return Object.fromEntries(
            Object.entries({
                id: typeof npc?.id === 'string' ? npc.id.trim() : '',
                姓名: typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '',
                性别: base?.性别,
                年龄: typeof npc?.年龄 === 'number' ? npc.年龄 : undefined,
                身份: typeof npc?.身份 === 'string' ? npc.身份.trim() : '',
                境界: typeof base?.境界 === 'string' ? base.境界.trim() : '',
                外貌: base?.外貌,
                身材: base?.身材,
                衣着: base?.衣着,
                是否在场: typeof npc?.是否在场 === 'boolean' ? npc.是否在场 : undefined,
                是否主要角色: typeof npc?.是否主要角色 === 'boolean' ? npc.是否主要角色 : undefined
            }).filter(([, value]) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string') return value.trim().length > 0;
                return true;
            })
        );
    };

    const 构建场景人物快照 = (bodyText: string, response?: GameResponse) => {
        const bracketTokens = 提取正文包裹片段(bodyText);
        const senderNames = (Array.isArray(response?.logs) ? response.logs : [])
            .map((log) => (typeof log?.sender === 'string' ? log.sender.trim() : ''))
            .filter((sender) => (
                sender.length > 0
                && sender !== '旁白'
                && sender !== '【判定】'
                && sender !== '【NSFW判定】'
                && sender !== 'disclaimer'
                && sender !== '免责声明'
            ));
        const explicitNames = [...new Set([...bracketTokens, ...senderNames])];
        const 角色 = deps.获取角色();
        const playerName = typeof 角色?.姓名 === 'string' ? 角色.姓名.trim() : '';
        const npcList = Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : [];
        const matchedNpcList = npcList.filter((npc) => {
            const npcName = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
            return npcName.length > 0 && explicitNames.includes(npcName);
        });
        const presentNpcList = npcList.filter((npc) => npc?.是否在场 === true);
        const combinedNpcMap = new Map<string, any>();
        [...matchedNpcList, ...presentNpcList].forEach((npc, index) => {
            const key = typeof npc?.id === 'string' && npc.id.trim()
                ? `id:${npc.id.trim()}`
                : `name:${typeof npc?.姓名 === 'string' ? npc.姓名.trim() : index}`;
            if (!combinedNpcMap.has(key)) {
                combinedNpcMap.set(key, npc);
            }
        });
        const sameNameNpcList = playerName
            ? npcList.filter((npc) => typeof npc?.姓名 === 'string' && npc.姓名.trim() === playerName)
            : [];

        return {
            正文包裹片段: bracketTokens,
            正文明确提及名称: explicitNames,
            主角是否被明确提及: playerName ? explicitNames.includes(playerName) : false,
            主角快照: 提取场景主角快照(),
            正文命中NPC: matchedNpcList.map(提取场景NPC快照),
            本地在场NPC: presentNpcList.map(提取场景NPC快照),
            与主角同名NPC: sameNameNpcList.map(提取场景NPC快照),
            场景人物总览: Array.from(combinedNpcMap.values()).map(提取场景NPC快照)
        };
    };

    const 触发场景自动生图 = (params: 场景生图触发参数) => {
        const bodyText = (params.bodyText || '').trim();
        if (!bodyText || (!deps.场景模式已开启() && !params.强制执行)) return;
        const envSnapshot = deps.规范化环境信息(deps.深拷贝(params.env || deps.获取环境()));
        const imageFeature = deps.读取文生图功能配置();
        const effectiveComposition = params.构图要求 || imageFeature.场景构图要求;
        const characterSnapshot = effectiveComposition === '故事快照'
            ? 构建场景人物快照(bodyText, params.response)
            : null;
        const sceneContext = {
            大地点: envSnapshot?.大地点 || '',
            中地点: envSnapshot?.中地点 || '',
            小地点: envSnapshot?.小地点 || '',
            具体地点: envSnapshot?.具体地点 || '',
            时间: deps.环境时间转标准串(envSnapshot) || envSnapshot?.时间 || '未知时间',
            地点: deps.构建完整地点文本(envSnapshot),
            天气: envSnapshot?.天气?.天气 || '',
            玩家输入: params.playerInput || '',
            最新正文: bodyText,
            场景目标: effectiveComposition === '故事快照'
                ? '基于当前正文还原这一刻的场景快照，包含环境、动作、站位、人物关系和在场角色外观，不是空背景。'
                : '生成纯环境壁纸：完整描绘地点、建筑、自然物、天气与光影层次，让环境成为唯一主体。',
            ...(characterSnapshot ? { 人物快照: characterSnapshot } : {})
        };
        const requestId = `scene_apply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        deps.设置当前自动应用任务ID(requestId);
        void deps.加载场景生图工作流()
            .then(({ 执行场景生图工作流 }) => 执行场景生图工作流(
                {
                    bodyText,
                    sceneContext,
                    source: params.source || 'auto',
                    来源回合: params.turnNumber,
                    摘要: 生成场景摘要(bodyText, envSnapshot, deps.环境时间转标准串),
                    autoApply: params.autoApply !== false,
                    请求标识: requestId,
                    画风: imageFeature.场景画风,
                    画师串预设ID: params.画师串预设ID,
                    构图要求: effectiveComposition,
                    尺寸: params.尺寸 || imageFeature.场景尺寸,
                    额外要求: deps.构建文生图额外要求(params.额外要求),
                    强制执行: params.强制执行
                },
                {
                    apiConfig: deps.获取接口配置(),
                    获取场景文生图接口配置: deps.获取场景文生图接口配置,
                    获取生图词组转化器接口配置: deps.获取生图词组转化器接口配置,
                    获取生图画师串预设: deps.获取生图画师串预设,
                    获取当前PNG画风预设: deps.获取当前PNG画风预设,
                    获取场景角色锚点: deps.获取场景角色锚点,
                    获取词组转化器预设提示词: deps.获取词组转化器预设提示词,
                    接口配置是否可用: deps.接口配置是否可用,
                    场景模式已开启: deps.场景模式已开启,
                    创建场景生图任务: deps.创建场景生图任务,
                    生成场景生图记录ID: deps.生成场景生图记录ID,
                    追加场景生图任务: deps.追加场景生图任务,
                    更新场景生图任务: deps.更新场景生图任务,
                    更新场景图片档案: deps.更新场景图片档案,
                    应用场景图片为壁纸: deps.应用场景图片为壁纸,
                    当前任务允许自动应用: (requestIdToCheck?: string) => (
                        Boolean(requestIdToCheck) && requestIdToCheck === deps.获取当前自动应用任务ID()
                    )
                }
            ))
            .catch((error) => {
                console.error('场景生图任务执行失败', error);
            });
    };

    const 生成场景壁纸 = async (options?: 手动场景生图参数) => {
        const 历史记录 = deps.获取历史记录();
        const latestAssistantIndex = [...历史记录].map((item, index) => ({ item, index }))
            .reverse()
            .find(({ item }) => item?.role === 'assistant' && item?.structuredResponse)?.index;
        if (typeof latestAssistantIndex !== 'number') return;
        const latestAssistant = 历史记录[latestAssistantIndex];
        const latestResponse = latestAssistant?.structuredResponse;
        if (!latestResponse) return;
        const bodyText = (Array.isArray(latestResponse.logs) ? latestResponse.logs : [])
            .map((log) => `${log?.sender || '旁白'}：${log?.text || ''}`)
            .filter((line) => line.trim().length > 0)
            .join('\n');
        if (!bodyText.trim()) return;
        const latestUserInput = (() => {
            for (let i = latestAssistantIndex - 1; i >= 0; i -= 1) {
                const historyItem = 历史记录[i];
                if (historyItem?.role !== 'user') continue;
                const text = typeof historyItem?.content === 'string' ? historyItem.content.trim() : '';
                if (text) return text;
            }
            return '';
        })();
        const assistantTurnNumber = 历史记录
            .slice(0, latestAssistantIndex + 1)
            .filter((item) => item?.role === 'assistant' && item?.structuredResponse)
            .length;
        const 场景摘要 = 生成场景摘要(bodyText, deps.获取环境(), deps.环境时间转标准串) || '当前正文场景';
        if (options?.后台处理) {
            deps.记录后台场景监控({
                since: Date.now(),
                摘要: 场景摘要
            });
            deps.推送右下角提示({
                title: '场景生图已提交',
                message: `${场景摘要}已转入后台生成，可在场景队列查看进度。`,
                tone: 'info'
            });
        }
        触发场景自动生图({
            response: latestResponse,
            bodyText,
            env: deps.获取环境(),
            turnNumber: assistantTurnNumber,
            playerInput: latestUserInput,
            source: 'manual',
            autoApply: true,
            画师串预设ID: options?.画师串预设ID,
            PNG画风预设ID: options?.PNG画风预设ID,
            构图要求: options?.构图要求,
            尺寸: options?.尺寸,
            额外要求: options?.额外要求,
            强制执行: true
        });
    };

    return {
        触发场景自动生图,
        生成场景壁纸,
        生成场景摘要,
        构建场景人物快照
    };
};
