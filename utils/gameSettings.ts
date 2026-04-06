import { 游戏设置结构 } from '../types';
import { 默认额外系统提示词, 旧版默认额外系统提示词 } from '../prompts/runtime/defaults';
import { 获取酒馆预设顺序, 规范化酒馆预设 } from './tavernPreset';

const 最低字数要求 = 50;

export type 酒馆后处理选项 = {
    value: NonNullable<游戏设置结构['酒馆提示词后处理']>;
    label: string;
    description: string;
};

export const 酒馆提示词后处理选项: 酒馆后处理选项[] = [
    { value: '未选择', label: '未选择', description: '保持酒馆预设原始角色分布。' },
    { value: '单一用户', label: '单一用户', description: '将酒馆提示词中的非 system 预设消息统一为 user。' },
    { value: '严格', label: '严格', description: '将酒馆提示词中的预设消息统一提升为 system，仅保留真实历史角色。' },
    { value: '半严格', label: '半严格', description: '保留 system，assistant 预设消息改为 user。' }
];

const 读取布尔 = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
);

const 读取文本 = (value: unknown): string => (
    typeof value === 'string' ? value : ''
);

const 规范化额外提示词 = (value: unknown, fallback: string): string => {
    const candidate = typeof value === 'string' ? value : fallback;
    const trimmed = candidate.trim();
    if (!trimmed) return 默认额外系统提示词;
    if (trimmed === 旧版默认额外系统提示词.trim()) return 默认额外系统提示词;
    return candidate;
};

const 规范化字数要求 = (value: unknown, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(最低字数要求, Math.floor(value));
    }
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^\d]/g, ''));
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.max(最低字数要求, Math.floor(parsed));
        }
    }
    return Math.max(最低字数要求, Math.floor(fallback));
};

const 规范化叙事人称 = (
    value: unknown,
    fallback: 游戏设置结构['叙事人称']
): 游戏设置结构['叙事人称'] => (
    value === '第一人称' || value === '第二人称' || value === '第三人称'
        ? value
        : fallback
);

const 规范化剧情风格 = (
    value: unknown,
    fallback: 游戏设置结构['剧情风格']
): 游戏设置结构['剧情风格'] => (
    value === '后宫' || value === '修炼' || value === '一般' || value === '修罗场' || value === '纯爱' || value === 'NTL后宫'
        ? value
        : fallback
);

const 规范化NTL档位 = (
    value: unknown,
    fallback: 游戏设置结构['NTL后宫档位']
): 游戏设置结构['NTL后宫档位'] => (
    value === '禁止乱伦' || value === '假乱伦' || value === '无限制'
        ? value
        : fallback
);

const 规范化酒馆后处理 = (
    value: unknown,
    fallback: NonNullable<游戏设置结构['酒馆提示词后处理']>
): NonNullable<游戏设置结构['酒馆提示词后处理']> => (
    value === '单一用户' || value === '严格' || value === '半严格' || value === '未选择'
        ? value
        : fallback
);

export const 默认独立APIGPT模式设置: NonNullable<游戏设置结构['独立APIGPT模式']> = {
    剧情回忆: false,
    记忆总结: false,
    文章优化: false,
    世界演变: false,
    变量生成: false,
    规划分析: false,
    小说拆分: false
};

const 规范化独立APIGPT模式设置 = (
    value: unknown,
    fallback: NonNullable<游戏设置结构['独立APIGPT模式']>
): NonNullable<游戏设置结构['独立APIGPT模式']> => {
    const source = value && typeof value === 'object'
        ? value as Partial<NonNullable<游戏设置结构['独立APIGPT模式']>>
        : {};
    return {
        剧情回忆: 读取布尔(source.剧情回忆, fallback.剧情回忆 === true),
        记忆总结: 读取布尔(source.记忆总结, fallback.记忆总结 === true),
        文章优化: 读取布尔(source.文章优化, fallback.文章优化 === true),
        世界演变: 读取布尔(source.世界演变, fallback.世界演变 === true),
        变量生成: 读取布尔(source.变量生成, fallback.变量生成 === true),
        规划分析: 读取布尔(source.规划分析, fallback.规划分析 === true),
        小说拆分: 读取布尔(source.小说拆分, fallback.小说拆分 === true)
    };
};

export const 默认游戏设置: 游戏设置结构 = {
    字数要求: 650,
    叙事人称: '第二人称',
    启用行动选项: true,
    启用COT伪装注入: true,
    启用GPT模式: false,
    启用女主剧情规划: true,
    启用防止说话: true,
    启用真实世界模式: false,
    启用免责声明输出: false,
    启用标签检测完整性: false,
    启用标签修复: true,
    启用自动重试: false,
    启用NSFW模式: false,
    启用饱腹口渴系统: true,
    启用修炼体系: true,
    剧情风格: '一般',
    NTL后宫档位: '无限制',
    启用酒馆预设模式: false,
    酒馆预设列表: [],
    当前酒馆预设ID: null,
    酒馆提示词后处理: '未选择',
    酒馆角色卡描述: '',
    酒馆预设: null,
    酒馆预设角色ID: null,
    酒馆预设名称: '',
    独立APIGPT模式: 默认独立APIGPT模式设置,
    额外提示词: 默认额外系统提示词
};

export const 解析酒馆预设角色ID = (
    value: unknown,
    preset: ReturnType<typeof 规范化酒馆预设>
): number | null => {
    if (!preset) return null;
    const parsed = typeof value === 'number' && Number.isFinite(value)
        ? Math.floor(value)
        : (typeof value === 'string' && value.trim() ? Math.floor(Number(value)) : null);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return 获取酒馆预设顺序(preset, parsed)?.character_id ?? null;
    }
    return 获取酒馆预设顺序(preset, null)?.character_id ?? null;
};

export const 规范化酒馆预设列表 = (
    rawList: unknown
): Array<NonNullable<游戏设置结构['酒馆预设列表']>[number]> => {
    const listRaw = Array.isArray(rawList) ? rawList : [];
    return listRaw.reduce<Array<NonNullable<游戏设置结构['酒馆预设列表']>[number]>>((acc, item, index) => {
        if (!item || typeof item !== 'object') return acc;
        const source = item as any;
        const preset = 规范化酒馆预设(source.预设);
        if (!preset) return acc;
        const idRaw = 读取文本(source.id).trim();
        const id = idRaw || `preset_${index + 1}`;
        const nameRaw = 读取文本(source.名称).trim();
        const name = nameRaw || `酒馆预设${index + 1}`;
        acc.push({
            id,
            名称: name,
            预设: preset,
            角色ID: 解析酒馆预设角色ID(source.角色ID, preset),
            导入时间: typeof source.导入时间 === 'number' && Number.isFinite(source.导入时间)
                ? Math.floor(source.导入时间)
                : Date.now()
        });
        return acc;
    }, []);
};

export const 规范化游戏设置 = (
    raw?: Partial<游戏设置结构> | null,
    options?: { fallback?: Partial<游戏设置结构> | null }
): 游戏设置结构 => {
    const fallback = options?.fallback ? 规范化游戏设置(options.fallback) : 默认游戏设置;
    const source = raw && typeof raw === 'object' ? raw as Partial<游戏设置结构> & Record<string, unknown> : {};
    const normalizedPresetList = 规范化酒馆预设列表(
        source.酒馆预设列表 ?? fallback.酒馆预设列表
    );
    const selectedPresetIdRaw = 读取文本(source.当前酒馆预设ID ?? fallback.当前酒馆预设ID).trim();
    const selectedPresetEntry = (
        (selectedPresetIdRaw
            ? normalizedPresetList.find((item) => item.id === selectedPresetIdRaw)
            : null)
        || normalizedPresetList[0]
        || null
    );
    const selectedPreset = selectedPresetEntry?.预设 || null;
    const selectedCharacterId = 解析酒馆预设角色ID(
        source.酒馆预设角色ID ?? selectedPresetEntry?.角色ID ?? fallback.酒馆预设角色ID,
        selectedPreset
    );

    return {
        ...fallback,
        ...source,
        字数要求: 规范化字数要求(source.字数要求, fallback.字数要求),
        叙事人称: 规范化叙事人称(source.叙事人称, fallback.叙事人称),
        启用行动选项: 读取布尔(source.启用行动选项, fallback.启用行动选项 !== false),
        启用COT伪装注入: 读取布尔(source.启用COT伪装注入, fallback.启用COT伪装注入 !== false),
        启用GPT模式: 读取布尔(source.启用GPT模式, fallback.启用GPT模式 === true),
        启用女主剧情规划: 读取布尔(source.启用女主剧情规划, fallback.启用女主剧情规划 !== false),
        启用防止说话: 读取布尔(source.启用防止说话, fallback.启用防止说话 !== false),
        启用真实世界模式: 读取布尔(source.启用真实世界模式, fallback.启用真实世界模式 === true),
        启用免责声明输出: 读取布尔(source.启用免责声明输出, fallback.启用免责声明输出 === true),
        启用标签检测完整性: 读取布尔(source.启用标签检测完整性, fallback.启用标签检测完整性 === true),
        启用标签修复: 读取布尔(source.启用标签修复, fallback.启用标签修复 !== false),
        启用自动重试: 读取布尔(source.启用自动重试, fallback.启用自动重试 === true),
        启用NSFW模式: 读取布尔(source.启用NSFW模式, fallback.启用NSFW模式 === true),
        启用饱腹口渴系统: 读取布尔(source.启用饱腹口渴系统, fallback.启用饱腹口渴系统 !== false),
        启用修炼体系: 读取布尔(source.启用修炼体系, fallback.启用修炼体系 !== false),
        剧情风格: 规范化剧情风格(source.剧情风格, fallback.剧情风格),
        NTL后宫档位: 规范化NTL档位(source.NTL后宫档位, fallback.NTL后宫档位),
        启用酒馆预设模式: 读取布尔(source.启用酒馆预设模式, fallback.启用酒馆预设模式 === true),
        酒馆预设列表: normalizedPresetList,
        当前酒馆预设ID: selectedPresetEntry?.id || null,
        酒馆提示词后处理: 规范化酒馆后处理(source.酒馆提示词后处理, fallback.酒馆提示词后处理 || '未选择'),
        酒馆角色卡描述: typeof source.酒馆角色卡描述 === 'string'
            ? source.酒馆角色卡描述
            : fallback.酒馆角色卡描述,
        酒馆预设: selectedPreset,
        酒馆预设角色ID: selectedCharacterId,
        酒馆预设名称: selectedPresetEntry?.名称 || '',
        独立APIGPT模式: 规范化独立APIGPT模式设置(
            source.独立APIGPT模式,
            fallback.独立APIGPT模式 || 默认独立APIGPT模式设置
        ),
        额外提示词: 规范化额外提示词(source.额外提示词, fallback.额外提示词)
    };
};
