import type { 物品图片档案 } from '../models/imageGeneration';

const 默认拍卖物品图片映射: Record<string, string> = {
    青锋短剑: 'https://cdn.nodeimage.com/i/BotZM3LfQPEZAR4SHgnDW10dNtygzxt8.png',
    雁翎护腕: 'https://cdn.nodeimage.com/i/bvbQAFPfqeept5fGHbsYRplgDvlotGpy.png',
    回春散: 'https://cdn.nodeimage.com/i/fDHFtkspJYRIsIezQXEgdXEsKiwZ6836.png',
    寒潭玄铁屑: 'https://cdn.nodeimage.com/i/ZdMxoqulGLCivJpdJJ2YB9GLJEQ2pyCY.png',
    '残页·归云步': 'https://cdn.nodeimage.com/i/gNi6KZT0bWQrfGajec8H2DHmjCFmZ206.png',
    乌金软甲: 'https://cdn.nodeimage.com/i/yndDgXUenzRwY3l4vlv4KDuORNzZ0QTc.png',
    无名刀谱拓本: 'https://cdn.nodeimage.com/i/vJk1qy6hhUcGYyz8VRFxJ8jDEOcLpLgt.png',
    南荒毒砂: 'https://cdn.nodeimage.com/i/yQPXBY9AM2sLri626qrke9F81YCXPRBa.png',
    白玉鱼佩: 'https://cdn.nodeimage.com/i/FlTGIrk3m1y4QDcbw7K5gUnQmQenJhV4.png',
    破军弩机: 'https://cdn.nodeimage.com/i/gVR656veF42c9ztenLYpHQ58Zg0s2s5E.png',
    药王谷旧丹方: 'https://cdn.nodeimage.com/i/lmAT0daIeKLmFAhIW2fWDo52UZ1Y4k3M.png'
};

export const 获取默认拍卖物品图片档案 = (itemName: string): 物品图片档案 | undefined => {
    const imageUrl = 默认拍卖物品图片映射[itemName];
    if (!imageUrl) return undefined;
    const id = `default_auction_${itemName}`;
    const record = {
        id,
        图片URL: imageUrl,
        生图词组: `默认拍卖行固定拍品写实图标（无文字）：${itemName}`,
        原始描述: itemName,
        使用模型: 'gpt-image-2',
        生成时间: 1778503458255,
        构图: '物品图标' as const,
        画风: '写实' as const,
        渲染风格: '写实道具' as const,
        尺寸: '1024x1024',
        状态: 'success' as const,
        来源: 'hosted' as const
    };
    return {
        最近生图结果: record,
        生图历史: [record],
        已选图标图片ID: id
    };
};
