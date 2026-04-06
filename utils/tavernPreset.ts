import {
    酒馆预设结构,
    酒馆预设消息角色类型,
    酒馆预设顺序结构,
    酒馆预设顺序项结构,
    酒馆预设提示词结构
} from '../models/system';

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value : '');
const 读取布尔 = (value: unknown): boolean => value === true;
const 读取数值 = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.floor(parsed);
    }
    return null;
};

const 规范化角色 = (raw: unknown, systemPrompt: unknown): 酒馆预设消息角色类型 => {
    if (raw === 'system' || raw === 'user' || raw === 'assistant') return raw;
    if (systemPrompt === true) return 'system';
    return 'system';
};

const 规范化提示词 = (raw: unknown): 酒馆预设提示词结构 | null => {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as any;
    const identifier = 读取文本(source.identifier).trim();
    if (!identifier) return null;
    const name = 读取文本(source.name || source.title).trim();
    return {
        identifier,
        ...(name ? { name } : {}),
        role: 规范化角色(source.role, source.system_prompt),
        content: 读取文本(source.content),
        system_prompt: 读取布尔(source.system_prompt)
    };
};

const 规范化顺序项 = (raw: unknown): 酒馆预设顺序项结构 | null => {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as any;
    const identifier = 读取文本(source.identifier).trim();
    if (!identifier) return null;
    return {
        identifier,
        enabled: source.enabled !== false
    };
};

const 规范化顺序 = (raw: unknown): 酒馆预设顺序结构 | null => {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as any;
    const characterId = 读取数值(source.character_id);
    const orderRaw = Array.isArray(source.order) ? source.order : [];
    const order = orderRaw
        .map((item) => 规范化顺序项(item))
        .filter((item): item is 酒馆预设顺序项结构 => Boolean(item));
    if (characterId === null || order.length === 0) return null;
    return {
        character_id: characterId,
        order
    };
};

export const 规范化酒馆预设 = (raw: unknown): 酒馆预设结构 | null => {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as any;
    const promptsRaw = Array.isArray(source.prompts) ? source.prompts : [];
    const promptOrderRaw = Array.isArray(source.prompt_order) ? source.prompt_order : [];

    const prompts = promptsRaw
        .map((item) => 规范化提示词(item))
        .filter((item): item is 酒馆预设提示词结构 => Boolean(item));
    const prompt_order = promptOrderRaw
        .map((item) => 规范化顺序(item))
        .filter((item): item is 酒馆预设顺序结构 => Boolean(item));

    if (prompts.length === 0 || prompt_order.length === 0) return null;
    return { prompts, prompt_order };
};

export const 获取酒馆预设角色ID列表 = (preset: 酒馆预设结构 | null | undefined): number[] => {
    if (!preset || !Array.isArray(preset.prompt_order)) return [];
    return Array.from(new Set(preset.prompt_order.map((item) => item.character_id)));
};

export const 获取酒馆预设顺序 = (
    preset: 酒馆预设结构 | null | undefined,
    selectedCharacterId?: number | null
): 酒馆预设顺序结构 | null => {
    if (!preset || !Array.isArray(preset.prompt_order) || preset.prompt_order.length === 0) return null;
    const normalizedId = typeof selectedCharacterId === 'number' && Number.isFinite(selectedCharacterId)
        ? Math.floor(selectedCharacterId)
        : null;
    if (normalizedId !== null) {
        const matched = preset.prompt_order.find((item) => item.character_id === normalizedId);
        if (matched) return matched;
    }
    const preferredDefault = preset.prompt_order.find((item) => item.character_id === 100001);
    if (preferredDefault) return preferredDefault;
    return preset.prompt_order[0] || null;
};
