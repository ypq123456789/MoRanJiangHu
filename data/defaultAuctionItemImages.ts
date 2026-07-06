import type { 物品图片档案 } from '../models/imageGeneration';

const 预置图床基础地址 = 'https://msjh.bacon159.pp.ua/api/preset-image';

const 构建拍卖物品图床URL = (fileName: string): string => (
    `${预置图床基础地址}/${encodeURIComponent(fileName)}`
);

const 默认拍卖物品图片映射: Record<string, string> = {
    青锋短剑: 构建拍卖物品图床URL('qingfeng-duanjian.png'),
    雁翎护腕: 构建拍卖物品图床URL('yanling-huwan.png'),
    回春散: 构建拍卖物品图床URL('huichun-san.png'),
    寒潭玄铁屑: 构建拍卖物品图床URL('hantan-xuantiexie.png'),
    '残页·归云步': 构建拍卖物品图床URL('canye-guiyunbu.png'),
    乌金软甲: 构建拍卖物品图床URL('wujin-ruanjia.png'),
    无名刀谱拓本: 构建拍卖物品图床URL('wuming-daopu-taben.png'),
    南荒毒砂: 构建拍卖物品图床URL('nanhuang-dusha.png'),
    白玉鱼佩: 构建拍卖物品图床URL('baiyu-yupei.png'),
    破军弩机: 构建拍卖物品图床URL('pojun-nuji.png'),
    药王谷旧丹方: 构建拍卖物品图床URL('yaowanggu-jiudanfang.png'),
    青玉飞剑: 构建拍卖物品图床URL('qingyu-feijian.png'),
    赤纹丹炉: 构建拍卖物品图床URL('chiwen-danlu.png'),
    下品灵石袋: 构建拍卖物品图床URL('xiapin-lingshidai.png'),
    雷击桃木: 构建拍卖物品图床URL('leiji-taomu.png'),
    清心符箓: 构建拍卖物品图床URL('qingxin-fulu.png'),
    筑基丹残瓶: 构建拍卖物品图床URL('zhuji-dan-canping.png'),
    碧水阵盘: 构建拍卖物品图床URL('bishui-zhenpan.png'),
    储物戒: 构建拍卖物品图床URL('chuwu-jie.png'),
    星砂一撮: 构建拍卖物品图床URL('xingsha-yicuo.png'),
    云纹法袍: 构建拍卖物品图床URL('yunwen-fapao.png'),
    火鸦羽: 构建拍卖物品图床URL('huoya-yu.png')
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
