import type { 生图任务来源类型, 角色数据结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import type { 图片记录来源类型 } from '../../models/imageGeneration';
import { 获取图片展示地址, 图片资源记录含可恢复地址 } from '../../utils/imageAssets';
import { 自动角色锚点视觉年龄是否过期, 解析视觉年龄 } from '../../utils/visualAge';
import { 主角角色锚点标识 } from './imagePresetWorkflow';
import { 合并NPC图片档案, 标准化香闺秘档部位档案, 标准化香闺秘档部位结果, 生成NPC生图记录ID } from './npcImageStateWorkflow';

type 主角生图选项 = {
    构图?: '头像' | '半身' | '立绘';
    画风?: 当前可用接口结构['画风'];
    画师串?: string;
    画师串预设ID?: string;
    PNG画风预设ID?: string;
    额外要求?: string;
    尺寸?: string;
};

type 主角图片工作流依赖 = {
    获取角色: () => 角色数据结构;
    设置角色: (updater: (prev: 角色数据结构) => 角色数据结构) => void;
    规范化角色物品容器映射: (raw?: any) => 角色数据结构;
    执行自动存档: (snapshot?: { role?: 角色数据结构; history?: any[]; force?: boolean }) => Promise<unknown> | unknown;
    获取历史记录: () => any[];
    推送右下角提示: (toast: { title: string; message: string; tone?: 'info' | 'success' | 'error'; previewUrl?: string }) => void;
    保存图片资源: (dataUrl: string) => Promise<string>;
    加载NPC生图工作流: () => Promise<any>;
    apiConfig: any;
    获取文生图接口配置: (config: any) => 当前可用接口结构 | null;
    获取生图词组转化器接口配置: (config: any) => 当前可用接口结构 | null;
    获取生图画师串预设: (config: any, scope: 'npc' | 'scene', preferredId?: string) => any;
    获取当前PNG画风预设: (presetId?: string) => any;
    读取主角角色锚点: () => any;
    提取主角角色锚点: (options?: { 名称?: string; 额外要求?: string }) => Promise<any>;
    自动角色锚点已启用?: () => boolean;
    获取词组转化器预设提示词: (config: any, scope: 'npc' | 'scene', mode?: 'default' | 'anchor') => string;
    接口配置是否可用: (config: 当前可用接口结构) => boolean;
    读取文生图功能配置: () => any;
    主角生图进行中集合: Set<string>;
    提取主角生图基础数据: (character: 角色数据结构) => any;
    创建NPC生图任务: (params: any) => any;
    生成NPC生图记录ID: () => string;
    追加NPC生图任务: (task: any) => void;
    更新NPC生图任务: (taskId: string, updater: (task: any) => any) => void;
    构建文生图额外要求: (extra?: string) => string;
};

export const 创建主角图片工作流 = (deps: 主角图片工作流依赖) => {
    const 主角头像自动补全失败冷却毫秒 = 10 * 60 * 1000;
    const 主角自动生图进行中识别毫秒 = 30 * 60 * 1000;
    let 主角头像自动补全下次允许时间 = 0;

    const 主角锚点是否匹配当前角色 = (anchor: any, playerSnapshot: 角色数据结构): boolean => {
        if (!anchor) return false;
        const currentGender = typeof playerSnapshot?.性别 === 'string' ? playerSnapshot.性别.trim() : '';
        const rawText = typeof anchor?.原始提取文本 === 'string' ? anchor.原始提取文本.trim() : '';
        if (!currentGender || !rawText) return true;
        try {
            const raw = JSON.parse(rawText);
            const anchorGender = typeof raw?.性别 === 'string' ? raw.性别.trim() : '';
            return !anchorGender || anchorGender === currentGender;
        } catch {
            return true;
        }
    };

    const 解析主角视觉年龄 = (playerSnapshot: 角色数据结构) => {
        const baseData = deps.提取主角生图基础数据(playerSnapshot);
        return 解析视觉年龄({
            actualAge: playerSnapshot?.年龄,
            explicitVisualAge: playerSnapshot?.外观年龄 ?? baseData?.外观年龄,
            topicMode: baseData?.题材模式,
            realmLevel: playerSnapshot?.境界层级 ?? baseData?.境界层级,
            realmText: playerSnapshot?.境界 ?? baseData?.境界,
            identity: playerSnapshot?.称号 || playerSnapshot?.出身背景?.名称 || baseData?.身份,
            appearance: playerSnapshot?.外貌 || baseData?.外貌,
            clothing: baseData?.衣着,
            // 视觉年龄约束 是上一轮解析产出的指令文本，不作为年龄判断输入（避免回灌误判 elderly）
            bio: [playerSnapshot?.性格, playerSnapshot?.出身背景?.描述].filter(Boolean).join('；'),
            race: (playerSnapshot as any)?.种族,
            species: (playerSnapshot as any)?.血统,
            additionalTexts: [playerSnapshot?.灵根, playerSnapshot?.灵根资质, playerSnapshot?.性转记录]
        });
    };

    const 更新角色并自动存档 = (updater: (prev: 角色数据结构) => 角色数据结构) => {
        let snapshot: 角色数据结构 | null = null;
        deps.设置角色((prev) => {
            const next = deps.规范化角色物品容器映射(updater(prev));
            snapshot = next;
            return next;
        });
        if (snapshot) {
            void Promise.resolve(deps.执行自动存档({ role: snapshot, history: deps.获取历史记录(), force: true }))
                .catch((error) => {
                    console.warn('生图结果写回后的自动存档失败（已隔离）', error);
                });
        }
    };

    const 更新玩家最近生图结果 = (updater: (player: 角色数据结构) => any) => {
        更新角色并自动存档((prev) => {
            const nextPlayer = updater(prev);
            const 图片档案 = 合并NPC图片档案(prev, nextPlayer);
            return {
                ...nextPlayer,
                图片档案,
                最近生图结果: 图片档案?.最近生图结果
            };
        });
    };

    const 更新玩家选图字段 = (
        field: '已选头像图片ID' | '已选立绘图片ID' | '已选背景图片ID',
        imageId?: string,
        validator?: (history: any[]) => boolean
    ) => {
        更新角色并自动存档((prev) => {
            const archive = prev?.图片档案 && typeof prev.图片档案 === 'object' ? prev.图片档案 : {};
            const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
            if (imageId) {
                const valid = validator ? validator(history) : true;
                if (!valid) return prev;
            } else if (typeof archive?.[field] !== 'string' || !archive[field]?.trim()) {
                return prev;
            }
            return {
                ...prev,
                图片档案: {
                    ...archive,
                    最近生图结果: archive?.最近生图结果 || prev?.最近生图结果,
                    生图历史: history,
                    [field]: imageId || undefined
                }
            };
        });
    };

    const updatePlayerAvatar = async (imageUrl: string) => {
        const dataUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
        if (!dataUrl) return;

        // 与 NPC 上传一致：存入 IndexedDB → 创建生图记录 → 写入图片档案
        const assetRef = await deps.保存图片资源(dataUrl);
        const uploadedAt = Date.now();
        const record = {
            id: 生成NPC生图记录ID(),
            图片URL: assetRef,
            本地路径: assetRef,
            生图词组: '手动上传',
            原始描述: '手动上传头像图片',
            使用模型: 'manual_upload',
            生成时间: uploadedAt,
            状态: 'success' as const,
            来源: 'upload' as 图片记录来源类型,
            构图: '头像' as const,
            上传文件名: '',
            上传时间: uploadedAt
        };

        更新角色并自动存档((prev) => {
            const archive = prev?.图片档案 && typeof prev.图片档案 === 'object' ? prev.图片档案 : {};
            const currentHistory = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
            const nextHistory = [record, ...currentHistory]
                .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
            return {
                ...prev,
                // 清除旧的裸 dataURL 字段，图片展示改为统一从图片档案取
                头像图片URL: '',
                图片档案: {
                    ...archive,
                    最近生图结果: record,
                    生图历史: nextHistory,
                    已选头像图片ID: record.id
                },
                最近生图结果: record
            };
        });
    };

    const updatePlayerPortrait = async (imageUrl: string) => {
        const dataUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
        if (!dataUrl) return;

        // 与 NPC 立绘上传一致：存入 IndexedDB → 创建生图记录 → 写入图片档案
        const assetRef = await deps.保存图片资源(dataUrl);
        const uploadedAt = Date.now();
        const record = {
            id: 生成NPC生图记录ID(),
            图片URL: assetRef,
            本地路径: assetRef,
            生图词组: '手动上传',
            原始描述: '手动上传立绘图片',
            使用模型: 'manual_upload',
            生成时间: uploadedAt,
            状态: 'success' as const,
            来源: 'upload' as 图片记录来源类型,
            构图: '立绘' as const,
            上传文件名: '',
            上传时间: uploadedAt
        };

        更新角色并自动存档((prev) => {
            const archive = prev?.图片档案 && typeof prev.图片档案 === 'object' ? prev.图片档案 : {};
            const currentHistory = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
            const nextHistory = [record, ...currentHistory]
                .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
            return {
                ...prev,
                图片档案: {
                    ...archive,
                    最近生图结果: record,
                    生图历史: nextHistory,
                    已选立绘图片ID: record.id
                },
                最近生图结果: record
            };
        });
    };

    const selectPlayerPortrait = (imageId: string) => {
        更新角色并自动存档((prev) => {
            const archive = prev?.图片档案 && typeof prev.图片档案 === 'object' ? prev.图片档案 : {};
            const currentSelectedPortraitId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
            if (currentSelectedPortraitId === imageId) return prev;
            const history = Array.isArray(archive?.生图历史) ? archive?.生图历史 : [];
            const valid = history.some((item: any) => item?.id === imageId && item?.状态 === 'success' && (item?.构图 === '立绘' || item?.构图 === '半身') && 图片资源记录含可恢复地址(item));
            if (!valid && imageId) return prev;
            return {
                ...prev,
                图片档案: {
                    ...archive,
                    已选立绘图片ID: imageId || undefined
                }
            };
        });
    };

    const 角色图片记录可视为自动占位 = (item: any, compositions: string[]): boolean => {
        if (!item || typeof item !== 'object') return false;
        if (!compositions.includes(String(item?.构图 || ''))) return false;
        if (item?.状态 === 'success') {
            return 图片资源记录含可恢复地址(item);
        }
        if (item?.状态 !== 'pending' && item?.状态 !== 'running') return false;
        const time = Number(item?.生成时间 || item?.创建时间 || item?.开始时间 || Date.now());
        return !Number.isFinite(time) || time <= 0 || Date.now() - time <= 主角自动生图进行中识别毫秒;
    };

    const 主角已有构图或正在生成 = (
        playerSnapshot: 角色数据结构 | undefined,
        compositions: string[],
        options?: { 检查头像URL?: boolean; selectedField?: '已选头像图片ID' | '已选立绘图片ID' }
    ): boolean => {
        const player = playerSnapshot || deps.获取角色();
        if (options?.检查头像URL && typeof player?.头像图片URL === 'string' && player.头像图片URL.trim()) return true;
        const archive = player?.图片档案 && typeof player.图片档案 === 'object' ? player.图片档案 : {};
        const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
        const selectedId = options?.selectedField && typeof archive?.[options.selectedField] === 'string'
            ? archive[options.selectedField].trim()
            : '';
        if (selectedId && history.some((item: any) => item?.id === selectedId && 角色图片记录可视为自动占位(item, compositions))) {
            return true;
        }
        const recent = archive?.最近生图结果 || player?.最近生图结果;
        return [recent, ...history].some((item: any) => 角色图片记录可视为自动占位(item, compositions));
    };

    const 主角已有头像 = (playerSnapshot?: 角色数据结构): boolean => {
        return 主角已有构图或正在生成(playerSnapshot, ['头像'], {
            检查头像URL: true,
            selectedField: '已选头像图片ID'
        });
    };

    const 主角已有非头像构图 = (playerSnapshot: 角色数据结构 | undefined, compositions: string[]): boolean => {
        return 主角已有构图或正在生成(playerSnapshot, compositions, {
            selectedField: '已选立绘图片ID'
        });
    };

    const selectPlayerAvatarImage = (imageId: string) => 更新玩家选图字段(
        '已选头像图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && item?.构图 === '头像' && item?.状态 === 'success' && 获取图片展示地址(item)))
    );

    const clearPlayerAvatarImage = () => 更新玩家选图字段('已选头像图片ID');

    const selectPlayerPortraitImage = (imageId: string) => 更新玩家选图字段(
        '已选立绘图片ID',
        imageId,
        (history) => Boolean(history.find((item: any) => item?.id === imageId && (item?.构图 === '半身' || item?.构图 === '立绘') && item?.状态 === 'success' && 获取图片展示地址(item)))
    );

    const clearPlayerPortraitImage = () => 更新玩家选图字段('已选立绘图片ID');

    const removePlayerImageRecord = (imageId: string) => {
        if (!imageId) return;
        更新角色并自动存档((prev) => {
            const archive = prev?.图片档案 && typeof prev.图片档案 === 'object' ? prev.图片档案 : {};
            const currentHistory = Array.isArray(archive?.生图历史)
                ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
                : (prev?.最近生图结果 ? [prev.最近生图结果] : []);
            const nextHistory = currentHistory.filter((item: any) => item?.id !== imageId);
            if (nextHistory.length === currentHistory.length) return prev;
            const currentSelectedAvatarImageId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
            const currentSelectedPortraitImageId = typeof archive?.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : '';
            const currentSelectedBackgroundImageId = typeof archive?.已选背景图片ID === 'string' ? archive.已选背景图片ID.trim() : '';
            const nextRecent = nextHistory[0];
                const nextSelectedAvatarImageId = currentSelectedAvatarImageId && nextHistory.some((item: any) => item?.id === currentSelectedAvatarImageId)
                    ? currentSelectedAvatarImageId
                    : (nextHistory.find((item: any) => item?.构图 === '头像' && item?.状态 === 'success' && item?.id)?.id
                        || nextHistory.find((item: any) => !['部位特写', '胸部', '小穴', '屁穴'].includes(item?.构图 as string) && item?.状态 === 'success' && item?.id)?.id
                        || undefined);
            return {
                ...prev,
                图片档案: nextHistory.length > 0 ? {
                    最近生图结果: nextRecent,
                    生图历史: nextHistory,
                    已选头像图片ID: nextSelectedAvatarImageId,
                    已选立绘图片ID: currentSelectedPortraitImageId === imageId ? undefined : currentSelectedPortraitImageId,
                    已选背景图片ID: currentSelectedBackgroundImageId === imageId ? undefined : currentSelectedBackgroundImageId
                } : undefined,
                最近生图结果: nextRecent
            };
        });
    };

    const 写入主角香闺秘档部位结果 = (part: string, updater: (current: any) => any): boolean => {
        let changed = false;
        更新角色并自动存档((prev) => {
            const archive = (prev as any)?.图片档案 && typeof (prev as any).图片档案 === 'object'
                ? (prev as any).图片档案
                : {};
            const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
            const nextPartResult = 标准化香闺秘档部位结果(updater((currentSecretArchive as any)?.[part]), part as any);
            const nextSecretArchive = 标准化香闺秘档部位档案({
                ...currentSecretArchive,
                [part]: nextPartResult
            });
            changed = true;
            return {
                ...prev,
                图片档案: {
                    ...archive,
                    香闺秘档部位档案: nextSecretArchive
                }
            };
        });
        return changed;
    };

    const 写入主角香闺秘档部位记录 = (part: string, record: any, options?: { 同步最近结果?: boolean }): boolean => {
        if (!record || typeof record !== 'object') return false;
        const shouldUpdateRecent = options?.同步最近结果 !== false;
        let changed = false;
        更新角色并自动存档((prev) => {
            const archive = (prev as any)?.图片档案 && typeof (prev as any).图片档案 === 'object'
                ? (prev as any).图片档案
                : {};
            const currentRecent = archive?.最近生图结果 || (prev as any)?.最近生图结果;
            const currentHistory = Array.isArray(archive?.生图历史)
                ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
                : (currentRecent ? [currentRecent] : []);
            const currentSecretArchive = 标准化香闺秘档部位档案(archive?.香闺秘档部位档案) || {};
            const nextRecord = {
                ...record,
                id: typeof record?.id === 'string' && record.id.trim()
                    ? record.id.trim()
                    : `player_secret_${part}_${Date.now()}`,
                部位: part,
                构图: '部位特写' as const,
                状态: record?.状态 || 'success'
            };
            const nextPartResult = 标准化香闺秘档部位结果({
                ...((currentSecretArchive as any)?.[part] || {}),
                ...nextRecord
            }, part as any);
            const nextHistory = [nextRecord, ...currentHistory.filter((item: any) => item?.id !== nextRecord.id)]
                .sort((a: any, b: any) => Number(b?.生成时间 || 0) - Number(a?.生成时间 || 0));
            const nextRecent = shouldUpdateRecent ? nextRecord : currentRecent;
            const nextSecretArchive = 标准化香闺秘档部位档案({
                ...currentSecretArchive,
                [part]: nextPartResult
            });
            changed = true;
            return {
                ...prev,
                图片档案: {
                    ...archive,
                    最近生图结果: nextRecent,
                    生图历史: nextHistory,
                    香闺秘档部位档案: nextSecretArchive
                },
                最近生图结果: nextRecent
            };
        });
        return changed;
    };

    const generatePlayerImage = async (
        options?: 主角生图选项,
        meta?: { source?: 生图任务来源类型; showToast?: boolean; playerSnapshot?: 角色数据结构 }
    ) => {
        const playerSnapshot = meta?.playerSnapshot || deps.获取角色();
        const playerName = typeof playerSnapshot?.姓名 === 'string' && playerSnapshot.姓名.trim() ? playerSnapshot.姓名.trim() : '主角';
        const existingAnchor = deps.读取主角角色锚点();
        const 主角视觉年龄 = 解析主角视觉年龄(playerSnapshot);
        const 锚点需要刷新 = existingAnchor
            ? 自动角色锚点视觉年龄是否过期(existingAnchor, 主角视觉年龄)
            : true;
        if (deps.自动角色锚点已启用?.() !== false && (!existingAnchor || !主角锚点是否匹配当前角色(existingAnchor, playerSnapshot) || 锚点需要刷新)) {
            try {
                await deps.提取主角角色锚点({
                    名称: `${playerName} 角色锚点`
                });
            } catch (error) {
                console.warn('主角生图前置锚点提取失败，继续使用基础资料生图', error);
            }
        }
        if (meta?.showToast !== false) {
            deps.推送右下角提示({
                title: '主角生图已提交',
                message: `${playerName}的${options?.构图 || '头像'}已进入生成流程。`,
                tone: 'info'
            });
        }
        try {
            const { 执行NPC生图工作流 } = await deps.加载NPC生图工作流();
            await 执行NPC生图工作流({
                id: 主角角色锚点标识,
                姓名: playerName,
                性别: playerSnapshot?.性别,
                年龄: playerSnapshot?.年龄,
                外观年龄: (playerSnapshot as any)?.外观年龄,
                身份: playerSnapshot?.称号 || playerSnapshot?.出身背景?.名称,
                境界: playerSnapshot?.境界,
                境界层级: playerSnapshot?.境界层级,
                简介: playerSnapshot?.出身背景?.描述,
                外貌: playerSnapshot?.外貌,
                性格: playerSnapshot?.性格
            }, {
                force: true,
                source: meta?.source || 'manual',
                ...options,
                额外要求: deps.构建文生图额外要求(options?.额外要求)
            }, {
                apiConfig: deps.apiConfig,
                获取NPC唯一标识: () => `id:${主角角色锚点标识}:${options?.构图 || '头像'}`,
                获取文生图接口配置: deps.获取文生图接口配置,
                获取生图词组转化器接口配置: deps.获取生图词组转化器接口配置,
                获取生图画师串预设: deps.获取生图画师串预设,
                获取当前PNG画风预设: deps.获取当前PNG画风预设,
                获取NPC角色锚点: () => {
                    const anchor = deps.读取主角角色锚点();
                    if (!anchor || anchor.生成时默认附加 !== true) return null;
                    if (!主角锚点是否匹配当前角色(anchor, playerSnapshot)) return null;
                    return anchor;
                },
                获取词组转化器预设提示词: deps.获取词组转化器预设提示词,
                接口配置是否可用: deps.接口配置是否可用,
                读取文生图功能配置: deps.读取文生图功能配置,
                NPC符合自动生图条件: () => true,
                NPC生图进行中集合: deps.主角生图进行中集合,
                提取NPC生图基础数据: () => deps.提取主角生图基础数据(playerSnapshot),
                创建NPC生图任务: (params: any) => ({ ...deps.创建NPC生图任务(params), id: `player_image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }),
                生成NPC生图记录ID: deps.生成NPC生图记录ID,
                追加NPC生图任务: deps.追加NPC生图任务,
                更新NPC生图任务: deps.更新NPC生图任务,
                更新NPC最近生图结果: (_npcKey: string, updater: (player: 角色数据结构) => any) => 更新玩家最近生图结果(updater)
            });
            if (meta?.showToast !== false) {
                const latestPlayer = deps.获取角色();
                const latestArchive = 合并NPC图片档案(latestPlayer?.图片档案, latestPlayer);
                const previewUrl = 获取图片展示地址(latestArchive?.最近生图结果 || latestPlayer?.最近生图结果);
                deps.推送右下角提示({
                    title: '主角生图完成',
                    message: `${playerName}的${options?.构图 || '头像'}已写入主角图片档案。`,
                    tone: 'success',
                    previewUrl: previewUrl || undefined
                });
            }
        } catch (error: any) {
            const message = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '主角生图失败';
            if (meta?.showToast !== false) {
                deps.推送右下角提示({ title: '主角生图失败', message, tone: 'error' });
            }
            throw error;
        }
    };

    const generatePlayerImageManually = async (options?: 主角生图选项) => {
        try {
            await generatePlayerImage(options, { source: 'manual', showToast: true });
        } catch {
            // generatePlayerImage 已经写入任务失败状态并弹出错误提示；这里吞掉异常，避免按钮点击产生全局 unhandledrejection。
        }
    };

    const generatePlayerImagesAutomatically = async (playerSnapshot?: 角色数据结构) => {
        const imageFeature = deps.读取文生图功能配置();
        if (!imageFeature?.总开关) return;
        const 当前主角已有头像 = () => 主角已有头像(playerSnapshot) || 主角已有头像(deps.获取角色());
        const 当前主角已有非头像构图 = (compositions: string[]) => (
            主角已有非头像构图(playerSnapshot, compositions)
            || 主角已有非头像构图(deps.获取角色(), compositions)
        );
        const targets: 主角生图选项[] = [
            当前主角已有头像() ? null : { 构图: '头像', 额外要求: '开局自动生成主角头像，强调面部辨识度、清晰五官与稳定角色特征。' },
            当前主角已有非头像构图(['半身']) ? null : { 构图: '半身', 额外要求: '开局自动生成主角半身像，强调上半身服饰、姿态、气质与身份辨识。' },
            当前主角已有非头像构图(['立绘']) ? null : { 构图: '立绘', 额外要求: '开局自动生成主角全身立绘，强调完整服饰、体态、武侠气质与角色稳定外观。' }
        ].filter(Boolean) as 主角生图选项[];
        if (targets.length === 0) return;
        let failedCount = 0;
        for (const target of targets) {
            if (target.构图 === '头像' && 当前主角已有头像()) continue;
            if (target.构图 === '半身' && 当前主角已有非头像构图(['半身'])) continue;
            if (target.构图 === '立绘' && 当前主角已有非头像构图(['立绘'])) continue;
            try {
                await generatePlayerImage(target, {
                    source: 'auto',
                    showToast: false,
                    playerSnapshot
                });
            } catch {
                failedCount += 1;
            }
        }
        if (failedCount > 0 && failedCount < targets.length) {
            deps.推送右下角提示({
                title: '主角开局生图部分完成',
                message: `已完成部分主角影像，另有 ${failedCount} 项生成失败，可稍后在主角生图中重试。`,
                tone: 'info'
            });
        } else if (failedCount === targets.length) {
            deps.推送右下角提示({
                title: '主角开局生图失败',
                message: '头像、半身与立绘均未生成成功，请检查文生图接口后重试。',
                tone: 'error'
            });
        }
    };

    const ensurePlayerAvatarEachTurn = async (playerSnapshot?: 角色数据结构) => {
        const imageFeature = deps.读取文生图功能配置();
        if (!imageFeature?.总开关) return;
        const player = playerSnapshot || deps.获取角色();
        if (主角已有头像(player) || 主角已有头像(deps.获取角色())) return;
        const now = Date.now();
        if (主角头像自动补全下次允许时间 > now) return;
        try {
            await generatePlayerImage({
                构图: '头像',
                额外要求: '每回合检查发现主角缺少头像，仅补全头像；强调面部辨识度、清晰五官与稳定角色特征。'
            }, {
                source: 'auto',
                showToast: false,
                playerSnapshot: player
            });
            主角头像自动补全下次允许时间 = 0;
        } catch (error) {
            主角头像自动补全下次允许时间 = Date.now() + 主角头像自动补全失败冷却毫秒;
            console.warn('主角每回合头像检查补全失败', error);
        }
    };

    const generatePlayerSecretPartImage = async (part: string) => {
        const player = deps.获取角色();
        const 主角视觉年龄 = 解析主角视觉年龄(player);
        if (!主角视觉年龄.isAdultSafetyApproved) {
            deps.推送右下角提示({
                title: `主角${part}图片生成失败`,
                message: '角色真实年龄或明确视觉年龄不满足成人私密生图要求。',
                tone: 'error'
            });
            return;
        }
        const secretKey = `player_secret_${part}`;
        if (deps.主角生图进行中集合.has(secretKey)) return;
        deps.主角生图进行中集合.add(secretKey);
        try {
            const npcWorkflow = await deps.加载NPC生图工作流();
            const secretArchive = (player as any)?.图片档案?.香闺秘档部位档案?.[part];
            const description = (player as any)?.[`${part}描述`] || '';
            if (!description) {
                deps.推送右下角提示({
                    title: `主角${part}描述为空`,
                    message: `请先在变量中为主角添加${part}描述，再生成图片。`,
                    tone: 'error'
                });
                return;
            }
            const artist串 = deps.获取生图画师串预设(deps.apiConfig, 'npc');
            const anchor = deps.读取主角角色锚点();
            const result = await npcWorkflow.执行NPC香闺秘档部位生图?.(
                { ...player, 是否主要角色: true, 姓名: player.姓名 },
                part,
                { source: 'manual' },
                {
                    获取文生图接口配置: deps.获取文生图接口配置,
                    获取生图词组转化器接口配置: deps.获取生图词组转化器接口配置,
                    获取生图画师串预设: deps.获取生图画师串预设,
                    获取当前PNG画风预设: deps.获取当前PNG画风预设,
                    读取主角角色锚点: deps.读取主角角色锚点,
                    接口配置是否可用: deps.接口配置是否可用,
                    读取文生图功能配置: deps.读取文生图功能配置,
                    获取词组转化器预设提示词: deps.获取词组转化器预设提示词,
                    自动角色锚点已启用: deps.自动角色锚点已启用,
                    提取主角生图基础数据: deps.提取主角生图基础数据,
                    创建NPC生图任务: deps.创建NPC生图任务,
                    生成NPC生图记录ID: deps.生成NPC生图记录ID,
                    追加NPC生图任务: deps.追加NPC生图任务,
                    更新NPC生图任务: deps.更新NPC生图任务,
                    构建文生图额外要求: deps.构建文生图额外要求,
                    设置社交: () => {},
                    规范化社交列表: (l: any[]) => l,
                    执行社交自动存档: () => {},
                    获取社交列表: () => [],
                    获取NPC唯一标识: () => '__player__',
                    设置NPC生图任务队列: () => {},
                    更新NPC香闺秘档部位结果: (_npcKey: string, targetPart: string, updater: (current: any) => any) => (
                        写入主角香闺秘档部位结果(targetPart, updater)
                    ),
                    写入NPC香闺秘档部位记录: (_npcKey: string, _part: string, record: any) => {
                        return 写入主角香闺秘档部位记录(_part || part, record, { 同步最近结果: false });
                    }
                }
            );
            if (result !== false) {
                deps.推送右下角提示({
                    title: `主角${part}图片生成完成`,
                    message: '可在角色档案中查看。',
                    tone: 'success'
                });
            }
        } catch (error) {
            console.warn(`主角${part}私密部位生图失败`, error);
            deps.推送右下角提示({
                title: `主角${part}图片生成失败`,
                message: error instanceof Error ? error.message : '未知错误',
                tone: 'error'
            });
        } finally {
            deps.主角生图进行中集合.delete(secretKey);
        }
    };

    return {
        updatePlayerAvatar,
        updatePlayerPortrait,
        selectPlayerPortrait,
        selectPlayerAvatarImage,
        clearPlayerAvatarImage,
        selectPlayerPortraitImage,
        clearPlayerPortraitImage,
        removePlayerImageRecord,
        generatePlayerImageManually,
        generatePlayerImagesAutomatically,
        ensurePlayerAvatarEachTurn,
        generatePlayerSecretPartImage
    };
};
