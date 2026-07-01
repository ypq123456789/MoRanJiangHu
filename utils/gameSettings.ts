import { 游戏设置结构, 叙事平静值配置结构 } from '../types';
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

const 规范化字数不足处理方式 = (
    value: unknown,
    fallback: 游戏设置结构['字数不足处理方式']
): NonNullable<游戏设置结构['字数不足处理方式']> => (
    value === '仅提示' || value === '重新生成'
        ? value
        : fallback === '仅提示' ? '仅提示' : '重新生成'
);

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

const 规范化主剧情消息模式 = (
    value: unknown,
    fallback: 游戏设置结构['主剧情消息模式']
): 游戏设置结构['主剧情消息模式'] => (
    value === 'Gemini模式' || value === 'GPT' || value === 'DeepSeek标准' || value === 'DeepSeek锁格式' || value === 'GLM标准' || value === 'GLM锁格式'
        ? value
        : value === 'Gemini默认' || value === '默认'
            ? 'Gemini模式'
        : fallback
);

const 默认DeepSeek策略: 游戏设置结构['DeepSeek策略'] = {
    开局策略: '禁止开局',
    启用接管摘要: true,
    启用Prefix能力探测: true,
    启用输出健康度检测: true,
    健康度锁格式阈值: 85,
    健康度救场阈值: 60,
    续聊Thinking: false,
    开局Thinking: false
};

const 默认GLM策略: 游戏设置结构['GLM策略'] = {
    开局策略: '禁止开局',
    启用接管摘要: true,
    启用HTML注释思维链: true,
    启用Prefix能力探测: true,
    启用输出健康度检测: true,
    健康度锁格式阈值: 85,
    健康度救场阈值: 60,
    续聊Thinking: false,
    开局Thinking: false
};

const 约束百分比 = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.floor(parsed)));
};

const 规范化DeepSeek策略 = (
    value: unknown,
    fallback: 游戏设置结构['DeepSeek策略'] = 默认DeepSeek策略
): 游戏设置结构['DeepSeek策略'] => {
    const source = value && typeof value === 'object'
        ? value as Partial<游戏设置结构['DeepSeek策略']>
        : {};
    const fallbackSource = fallback || 默认DeepSeek策略;
    const openingStrategy = source.开局策略 === '标准开局' || source.开局策略 === '锁头开局' || source.开局策略 === '禁止开局'
        ? source.开局策略
        : fallbackSource.开局策略;
    return {
        开局策略: openingStrategy,
        启用接管摘要: 读取布尔(source.启用接管摘要, fallbackSource.启用接管摘要 !== false),
        启用Prefix能力探测: 读取布尔(source.启用Prefix能力探测, fallbackSource.启用Prefix能力探测 !== false),
        启用输出健康度检测: 读取布尔(source.启用输出健康度检测, fallbackSource.启用输出健康度检测 !== false),
        健康度锁格式阈值: 约束百分比(source.健康度锁格式阈值, fallbackSource.健康度锁格式阈值 ?? 85),
        健康度救场阈值: 约束百分比(source.健康度救场阈值, fallbackSource.健康度救场阈值 ?? 60),
        续聊Thinking: 读取布尔(source.续聊Thinking, fallbackSource.续聊Thinking === true),
        开局Thinking: 读取布尔(source.开局Thinking, fallbackSource.开局Thinking === true)
    };
};

const 规范化GLM策略 = (
    value: unknown,
    fallback: 游戏设置结构['GLM策略'] = 默认GLM策略
): 游戏设置结构['GLM策略'] => {
    const source = value && typeof value === 'object'
        ? value as Partial<游戏设置结构['GLM策略']>
        : {};
    const fallbackSource = fallback || 默认GLM策略;
    const openingStrategy = source.开局策略 === '标准开局' || source.开局策略 === '锁头开局' || source.开局策略 === '禁止开局'
        ? source.开局策略
        : fallbackSource.开局策略;
    return {
        开局策略: openingStrategy,
        启用接管摘要: 读取布尔(source.启用接管摘要, fallbackSource.启用接管摘要 !== false),
        启用HTML注释思维链: 读取布尔(source.启用HTML注释思维链, fallbackSource.启用HTML注释思维链 !== false),
        启用Prefix能力探测: 读取布尔(source.启用Prefix能力探测, fallbackSource.启用Prefix能力探测 !== false),
        启用输出健康度检测: 读取布尔(source.启用输出健康度检测, fallbackSource.启用输出健康度检测 !== false),
        健康度锁格式阈值: 约束百分比(source.健康度锁格式阈值, fallbackSource.健康度锁格式阈值 ?? 85),
        健康度救场阈值: 约束百分比(source.健康度救场阈值, fallbackSource.健康度救场阈值 ?? 60),
        续聊Thinking: 读取布尔(source.续聊Thinking, fallbackSource.续聊Thinking === true),
        开局Thinking: 读取布尔(source.开局Thinking, fallbackSource.开局Thinking === true)
    };
};

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
    字数要求: 1500,
    字数不足处理方式: '重新生成',
    叙事人称: '第二人称',
    启用行动选项: true,
    启用COT伪装注入: true,
    启用GPT模式: false,
    主剧情消息模式: 'Gemini模式',
    DeepSeek策略: 默认DeepSeek策略,
    GLM策略: 默认GLM策略,
    启用女主剧情规划: true,
    启用防止说话: true,
    启用真实世界模式: false,
    启用免责声明输出: false,
    启用标签检测完整性: false,
    启用标签修复: true,
    启用正文词汇审查: true,
    启用自动重试: false,
    启用标签协议失败自动回炉: true,
    禁用APK自动更新: false,
    启用回合结束自动存档: true,
    启用回合提示音: true,
    启用繁体模式: false,
    启用非流式输出: false,
    启用NSFW模式: false,
    启用男娘NSFW内容: true,
    启用亲密边界机制: true,
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
    额外提示词: 默认额外系统提示词,
    叙事平静值配置: {
        启用: false,
        无标签增量: 2,
        延续增量: 1,
        上限: 32,
        最低触发阈值: 12,
        阈值文本: [
            '一切如常。',
            '一切如常，有些细节可以留意。（1 个方向）',
            '一切如常，远处似乎有些变化。（2 个方向）',
            '太长时间没有变化了，或许该有些新的事。（3 个方向）',
            '风平浪静得太久了，可以有些新的动向了。（4 个方向）',
            '一切如常，只是似乎有什么事要发生了。'
        ]
    }
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

const 规范化叙事平静值配置 = (
    raw: any,
    fallback: 叙事平静值配置结构
): 叙事平静值配置结构 => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const fallbackTexts = Array.isArray(fallback?.阈值文本) ? fallback.阈值文本 : [];
    const sourceTexts = Array.isArray(source.阈值文本) ? source.阈值文本 : fallbackTexts;
    return {
        启用: typeof source.启用 === 'boolean' ? source.启用 : false,
        无标签增量: typeof source.无标签增量 === 'number' && Number.isFinite(source.无标签增量) && source.无标签增量 > 0
            ? Math.round(source.无标签增量) : (fallback?.无标签增量 ?? 2),
        延续增量: typeof source.延续增量 === 'number' && Number.isFinite(source.延续增量) && source.延续增量 > 0
            ? Math.round(source.延续增量) : (fallback?.延续增量 ?? 1),
        上限: typeof source.上限 === 'number' && Number.isFinite(source.上限) && source.上限 > 0
            ? Math.round(source.上限) : (fallback?.上限 ?? 32),
        最低触发阈值: typeof source.最低触发阈值 === 'number' && Number.isFinite(source.最低触发阈值) && source.最低触发阈值 >= 0
            ? Math.round(source.最低触发阈值) : (fallback?.最低触发阈值 ?? 12),
        阈值文本: sourceTexts.length > 0 ? sourceTexts : fallbackTexts
    };
};

export const 计算远处联动阈值 = (config: 叙事平静值配置结构 | undefined | null): number => {
    if (!config) return Infinity;
    const 下限 = typeof config.最低触发阈值 === 'number' && Number.isFinite(config.最低触发阈值)
        ? config.最低触发阈值 : 12;
    const 上限 = typeof config.上限 === 'number' && Number.isFinite(config.上限)
        ? config.上限 : 32;
    const 段数 = Math.max(1, Array.isArray(config.阈值文本) ? config.阈值文本.length : 0);
    const 段宽 = (上限 - 下限) / 段数;
    return 下限 + 段宽 * 2;
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
        字数不足处理方式: 规范化字数不足处理方式(source.字数不足处理方式, fallback.字数不足处理方式),
        叙事人称: 规范化叙事人称(source.叙事人称, fallback.叙事人称),
        启用行动选项: 读取布尔(source.启用行动选项, fallback.启用行动选项 !== false),
        启用COT伪装注入: 读取布尔(source.启用COT伪装注入, fallback.启用COT伪装注入 !== false),
        启用GPT模式: 读取布尔(source.启用GPT模式, fallback.启用GPT模式 === true),
        主剧情消息模式: 规范化主剧情消息模式(source.主剧情消息模式, fallback.主剧情消息模式 || 'Gemini模式'),
        DeepSeek策略: 规范化DeepSeek策略(source.DeepSeek策略, fallback.DeepSeek策略 || 默认DeepSeek策略),
        GLM策略: 规范化GLM策略(source.GLM策略, fallback.GLM策略 || 默认GLM策略),
        启用女主剧情规划: 读取布尔(source.启用女主剧情规划, fallback.启用女主剧情规划 !== false),
        启用防止说话: 读取布尔(source.启用防止说话, fallback.启用防止说话 !== false),
        启用真实世界模式: 读取布尔(source.启用真实世界模式, fallback.启用真实世界模式 === true),
        启用免责声明输出: 读取布尔(source.启用免责声明输出, fallback.启用免责声明输出 === true),
        启用标签检测完整性: 读取布尔(source.启用标签检测完整性, fallback.启用标签检测完整性 === true),
        启用标签修复: 读取布尔(source.启用标签修复, fallback.启用标签修复 !== false),
        启用正文词汇审查: 读取布尔(source.启用正文词汇审查, fallback.启用正文词汇审查 !== false),
        启用自动重试: 读取布尔(source.启用自动重试, fallback.启用自动重试 === true),
        启用标签协议失败自动回炉: 读取布尔(source.启用标签协议失败自动回炉, fallback.启用标签协议失败自动回炉 !== false),
        禁用APK自动更新: 读取布尔(source.禁用APK自动更新, fallback.禁用APK自动更新 === true),
        启用回合结束自动存档: 读取布尔((source as any).启用回合结束自动存档, fallback.启用回合结束自动存档 !== false),
        启用繁体模式: 读取布尔(source.启用繁体模式, fallback.启用繁体模式 === true),
        启用非流式输出: 读取布尔(source.启用非流式输出, fallback.启用非流式输出 === true),
        启用NSFW模式: 读取布尔(source.启用NSFW模式, fallback.启用NSFW模式 === true),
        启用男娘NSFW内容: 读取布尔(source.启用男娘NSFW内容, fallback.启用男娘NSFW内容 !== false),
        启用亲密边界机制: 读取布尔(source.启用亲密边界机制, fallback.启用亲密边界机制 !== false),
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
        额外提示词: 规范化额外提示词(source.额外提示词, fallback.额外提示词),
        叙事平静值配置: 规范化叙事平静值配置(source.叙事平静值配置, fallback.叙事平静值配置)
    };
};
