export type 图片尺寸方向类型 = 'square' | 'portrait' | 'landscape';

export interface 图片尺寸选项结构 {
    value: string;
    label: string;
    宽: number;
    高: number;
    方向: 图片尺寸方向类型;
}

const 创建尺寸选项 = (
    宽: number,
    高: number,
    比例: string,
    说明: string,
    方向: 图片尺寸方向类型
): 图片尺寸选项结构 => ({
    value: `${宽}x${高}`,
    label: `${宽}x${高} (${比例}, ${说明})`,
    宽,
    高,
    方向
});

const 按值去重 = (options: 图片尺寸选项结构[]): 图片尺寸选项结构[] => {
    const seen = new Set<string>();
    return options.filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
    });
};

const 按值索引 = (options: 图片尺寸选项结构[]): Map<string, 图片尺寸选项结构> => (
    new Map(options.map((item) => [item.value, item]))
);

export const 常用文生图尺寸选项: 图片尺寸选项结构[] = [
    创建尺寸选项(512, 512, '1:1', '图标', 'square'),
    创建尺寸选项(640, 640, '1:1', '图标', 'square'),
    创建尺寸选项(512, 768, '2:3', '竖直', 'portrait'),
    创建尺寸选项(768, 512, '3:2', '水平', 'landscape'),
    创建尺寸选项(1024, 1024, '1:1', 'SDXL', 'square'),
    创建尺寸选项(1216, 832, '19:13', '超高清', 'landscape'),
    创建尺寸选项(832, 1216, '13:19', '超高清', 'portrait')
];

const 自动场景附加尺寸选项: 图片尺寸选项结构[] = [
    创建尺寸选项(576, 1024, '9:16', '竖屏', 'portrait'),
    创建尺寸选项(720, 1280, '9:16', '竖屏高清', 'portrait'),
    创建尺寸选项(864, 1536, '9:16', '竖屏高精', 'portrait'),
    创建尺寸选项(768, 1024, '3:4', '竖屏', 'portrait'),
    创建尺寸选项(832, 1216, '13:19', '超高清', 'portrait'),
    创建尺寸选项(1024, 1280, '4:5', '竖屏', 'portrait'),
    创建尺寸选项(1024, 1536, '2:3', '竖屏', 'portrait'),
    创建尺寸选项(1024, 576, '16:9', '横屏', 'landscape'),
    创建尺寸选项(1216, 832, '19:13', '超高清', 'landscape'),
    创建尺寸选项(1280, 720, '16:9', '横屏高清', 'landscape'),
    创建尺寸选项(1536, 864, '16:9', '横屏高精', 'landscape'),
    创建尺寸选项(1152, 640, '18:10', '横屏', 'landscape'),
    创建尺寸选项(1024, 640, '8:5', '横屏', 'landscape'),
    创建尺寸选项(1024, 768, '4:3', '横屏', 'landscape'),
    创建尺寸选项(1024, 832, '5:4', '横屏', 'landscape')
];

const 所有尺寸选项映射 = 按值索引(按值去重([
    ...自动场景附加尺寸选项,
    ...常用文生图尺寸选项
]));

const 按顺序取尺寸选项 = (values: string[]): 图片尺寸选项结构[] => (
    values
        .map((value) => 所有尺寸选项映射.get(value))
        .filter((item): item is 图片尺寸选项结构 => Boolean(item))
);

export const 自动场景竖屏尺寸选项: 图片尺寸选项结构[] = 按顺序取尺寸选项([
    '576x1024',
    '720x1280',
    '768x1024',
    '832x1216',
    '864x1536',
    '1024x1024',
    '1024x1280',
    '1024x1536',
    '512x768'
]);

export const 自动场景横屏尺寸选项: 图片尺寸选项结构[] = 按顺序取尺寸选项([
    '1024x576',
    '1152x640',
    '1216x832',
    '1280x720',
    '1536x864',
    '1024x640',
    '1024x768',
    '1024x832',
    '1024x1024',
    '768x512'
]);
