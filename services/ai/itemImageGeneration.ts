import type { 接口设置结构, 物品生图结果 } from '../../types';
import type { 游戏物品 } from '../../models/item';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取文生图接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 合并物品图片档案 } from '../../utils/itemImage';
import { generateImageByPrompt, persistImageAssetLocally } from './image';

type 物品生图来源位置 = '背包' | '拍卖行';

export interface 物品图标生成选项 {
    source?: 'auto' | 'manual' | 'retry';
    sourceLocation?: 物品生图来源位置;
    force?: boolean;
    size?: string;
    imageApi?: 当前可用接口结构 | null;
    signal?: AbortSignal;
    recordId?: string;
}

export interface 物品图标生成结果 {
    nextItem: 游戏物品;
    imageRecord: 物品生图结果;
    prompt: string;
    imageApi: 当前可用接口结构;
}

const 读取文本 = (value: unknown, fallback = '') => (
    typeof value === 'string' ? value.trim() : fallback
);

/**
 * 仅用于写入 `视觉描述` 字段的原始文本。
 * 注意：物品生图的 prompt 必须避免出现"名称:X 类型:Y 品质:Z"这种结构化中文键值对，
 * 否则大量模型会直接把它当成要画在图上的文字/标签 (历史事故：青钢剑图上出现 "名称:青钢剑 类型:武型 品质:良品")。
 * 这里只保留描述性自然语言，不保留字段标签。
 */
export const 构建物品视觉描述 = (item: any): string => {
    const parts: string[] = [];
    const 描述 = 读取文本(item?.描述);
    if (描述) parts.push(描述);
    if (Array.isArray(item?.词条列表) && item.词条列表.length > 0) {
        const 词条文案 = item.词条列表
            .map((entry: any) => [entry?.名称, entry?.属性, entry?.数值].filter(Boolean).join(' '))
            .filter(Boolean)
            .join('；');
        if (词条文案) parts.push(词条文案);
    }
    const 来源 = 读取文本(item?.来源描述);
    if (来源) parts.push(来源);
    const 关联 = 读取文本(item?.关联事件);
    if (关联) parts.push(关联);
    return parts.join('\n');
};

const 获取渲染风格要求 = (style: string): string => {
    switch (style) {
        case '写实道具':
            return 'photorealistic single prop product photography, isolated physical object only, real metal leather cloth wood or paper materials, studio lighting, tactile surface detail, neutral matte background, no card design, no UI icon layout, no poster layout, no ink painting, no guofeng illustration, no text, no letters, no label, no inscription, no logo, no watermark';
        case '像素图标':
            return 'high-end pixel art item icon, crisp silhouette, readable at small size, no text, no letters, no label, no logo, no watermark';
        case '3D渲染':
            return 'stylized 3D single prop render, centered product lighting, soft shadow, no card design, no text, no letters, no label, no inscription, no logo, no watermark';
        case '国风插画':
        default:
            return 'Chinese wuxia illustration style, ink wash texture, refined golden rim light';
    }
};

const 物品类型转英文 = (type: string): string => {
    const map: Record<string, string> = {
        '武器': 'weapon', '武型': 'weapon', '剑': 'sword', '刀': 'saber',
        '防具': 'armor', '盔甲': 'armor', '衣服': 'garment',
        '消耗品': 'consumable', '丹药': 'medicinal pill', '药': 'medicine',
        '材料': 'crafting material', '符箓': 'talisman', '秘籍': 'scroll',
        '任务': 'key item', '杂物': 'miscellaneous object',
        '饰品': 'accessory', '暗器': 'hidden weapon'
    };
    for (const [cn, en] of Object.entries(map)) {
        if (type.includes(cn)) return en;
    }
    return 'prop';
};

const 物品品质转英文 = (quality: string): string => {
    const map: Record<string, string> = {
        '传说': 'legendary', '绝世': 'mythic', '极品': 'top grade',
        '稀有': 'rare', '珍品': 'rare', '良品': 'fine', '精品': 'fine',
        '普通': 'common', '凡品': 'common', '杂物': 'cheap'
    };
    for (const [cn, en] of Object.entries(map)) {
        if (quality.includes(cn)) return en;
    }
    return 'common';
};

const 物品名称转英文描述 = (name: string): string => {
    // 常见武侠物品名称到英文视觉描述的映射
    const map: Record<string, string> = {
        '木牌': 'wooden plaque tablet', '身份木牌': 'wooden identity plaque with carved text',
        '令牌': 'metal command token', '腰牌': 'waist badge token',
        '铜牌': 'bronze badge', '铁牌': 'iron plaque',
        '玉佩': 'jade pendant', '玉牌': 'jade plaque',
        '信物': 'keepsake token', '印章': 'seal stamp',
        '钥匙': 'ornate key', '锦囊': 'silk pouch',
        '卷轴': 'scroll', '书信': 'letter scroll',
        '地图': 'map scroll', '银票': 'silver banknote',
        '食盒': 'wooden food box', '酒壶': 'wine gourd',
        '灯笼': 'paper lantern', '火折子': 'fire starter flint',
        '绳索': 'hemp rope', '包袱': 'cloth bundle',
        '银两': 'silver ingots', '铜钱': 'copper coins',
    };
    for (const [cn, en] of Object.entries(map)) {
        if (name.includes(cn)) return en;
    }
    // 通用关键词推断
    if (/牌|令|符/.test(name)) return 'wooden or metal plaque token';
    if (/壶|瓶|罐/.test(name)) return 'ceramic or metal container vessel';
    if (/匣|盒|箱/.test(name)) return 'wooden box or case';
    if (/书|卷|册|经/.test(name)) return 'ancient book or scroll';
    if (/袋|囊|包/.test(name)) return 'cloth pouch or bag';
    return '';
};

const 构建物品视觉主体描述 = (item: any): string => {
    const name = 读取文本(item?.名称);
    const typeEn = 物品类型转英文(读取文本(item?.类型, '物品'));
    const qualityEn = 物品品质转英文(读取文本(item?.品质, '普通'));
    const nameEn = 物品名称转英文描述(name);
    const description = 读取文本(item?.视觉描述 || item?.描述);
    const tags = Array.isArray(item?.视觉标签)
        ? item.视觉标签.map((tag: unknown) => 读取文本(tag)).filter(Boolean).join(', ')
        : '';
    return [
        nameEn ? `a single ${qualityEn} ${nameEn}` : `a single ${qualityEn} ${typeEn} prop`,
        description ? `form and materials: ${description}` : '',
        tags ? `material cues: ${tags}` : ''
    ].filter(Boolean).join('\n');
};

export const 构建物品图提示词 = (
    item: any,
    options?: { 画风?: string; 渲染风格?: string; 来源位置?: 物品生图来源位置 }
): string => {
    const style = options?.画风 || '写实';
    const renderStyle = options?.渲染风格 || '写实道具';
    // 精简 prompt：只保留"风格 + 物体 + 绝不画文字"三块核心，避免因 prompt 过长被模型忽略关键指令
    return [
        renderStyle === '写实道具'
            ? 'photorealistic product photo of a single physical game prop, centered on a plain neutral background, realistic materials and soft shadow'
            : 'single game prop asset on a plain neutral background, centered composition, clean silhouette',
        获取渲染风格要求(renderStyle),
        style === '写实' ? 'photorealistic' : style,
        构建物品视觉主体描述(item),
        'absolutely no text, no letters, no numbers, no Chinese characters, no captions, no labels, no watermarks, no logos, no UI, no card frame, no badges'
    ].filter(Boolean).join('\n');
};

export const 生成物品图标 = async (
    item: 游戏物品,
    apiConfig: 接口设置结构,
    options?: 物品图标生成选项
): Promise<物品图标生成结果> => {
    const imageApi = options?.imageApi || 获取文生图接口配置(apiConfig);
    if (!接口配置是否可用(imageApi)) {
        throw new Error('请先在设置的“文生图”中配置可用接口，再生成物品图。');
    }

    const feature = apiConfig?.功能模型占位;
    const style = feature?.自动物品生图画风 || '写实';
    const renderStyle = feature?.自动物品生图渲染风格 || '写实道具';
    const size = 读取文本(options?.size || feature?.自动物品生图分辨率, '1024x1024') || '1024x1024';
    const sourceLocation = options?.sourceLocation || '背包';
    const enrichedItem: 游戏物品 = {
        ...(item as any),
        视觉描述: 读取文本((item as any)?.视觉描述) || 构建物品视觉描述(item),
    };
    const prompt = 构建物品图提示词(enrichedItem, {
        画风: style,
        渲染风格: renderStyle,
        来源位置: sourceLocation
    });
    const rawResult = await generateImageByPrompt(prompt, imageApi, options?.signal, {
        构图: '头像',
        尺寸: size,
        附加正向提示词: renderStyle === '写实道具'
            ? 'single physical object only, photorealistic product photo, centered product composition, neutral matte studio background, clean silhouette, realistic material, no card design, no UI, no frame, no badges, no text, no letters, no label, no inscription, no logo, no watermark'
            : 'single physical object only, centered composition, clean silhouette, no card design, no UI, no frame, no badges, no text, no letters, no label, no inscription, no logo, no watermark',
        附加负面提示词: 'person, human, face, hand, text, typography, letters, words, numbers, caption, label, plaque, sign, inscription, Chinese characters, English letters, calligraphy, seal, stamp, logo, watermark, signature, title, poster text, item card, game card, trading card, UI overlay, interface, badge, quality badge, rarity badge, speech bubble, dialogue box, border frame, decorative frame, white background, cluttered background, ink wash, guofeng illustration, Chinese painting, brush strokes, anime, cartoon, flat illustration',
    });
    const localResult = await persistImageAssetLocally(rawResult);
    const imageRecord: 物品生图结果 = {
        id: options?.recordId || `item_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        图片URL: localResult.图片URL,
        本地路径: localResult.本地路径,
        生图词组: prompt,
        最终正向提示词: localResult.最终正向提示词,
        最终负向提示词: localResult.最终负向提示词,
        原始描述: JSON.stringify(enrichedItem, null, 2),
        使用模型: imageApi.model || imageApi.图片后端类型 || 'image-model',
        生成时间: Date.now(),
        构图: '物品图标',
        画风: style as 物品生图结果['画风'],
        渲染风格: renderStyle as 物品生图结果['渲染风格'],
        尺寸: size,
        状态: 'success',
        来源: 'generated',
    };
    const nextItem: 游戏物品 = {
        ...(enrichedItem as any),
        视觉描述来源: (enrichedItem as any).视觉描述来源 || '规则生成',
        图片档案: 合并物品图片档案(enrichedItem, imageRecord),
    };

    return { nextItem, imageRecord, prompt, imageApi };
};
