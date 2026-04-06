import { ThemePreset } from '../types';

type 主题定义 = {
    id: ThemePreset;
    name: string;
    description: string;
    source: string;
    colors: string[];
    variables: Record<string, string>;
};

export const 主题列表: 主题定义[] = [
    {
        id: 'ink',
        name: '墨色经典',
        description: '参考传统黑金 UI 与国风界面常用搭配，沉稳、厚重。',
        colors: ['#0E0D0B', '#1A1A1A', '#E6C86E', '#44AAAA'],
        source: '常见国风 UI：黑 / 金 / 青点缀',
        variables: {
            '--c-ink-black': '14 13 11',
            '--c-ink-gray': '26 26 26',
            '--c-wuxia-gold': '230 200 110',
            '--c-wuxia-gold-dark': '138 114 54',
            '--c-wuxia-cyan': '68 170 170',
            '--c-wuxia-red': '163 24 24',
            '--c-paper-white': '230 230 230'
        }
    },
    {
        id: 'azure',
        name: '青鸾入梦',
        description: '参考高对比深绿与亮青配色，偏现代阅读体验。',
        colors: ['#060F0C', '#0C261C', '#3CEB96', '#B4F0DC'],
        source: '深绿 + 亮薄荷推荐系',
        variables: {
            '--c-ink-black': '6 15 12',
            '--c-ink-gray': '12 38 28',
            '--c-wuxia-gold': '60 235 150',
            '--c-wuxia-gold-dark': '30 110 60',
            '--c-wuxia-cyan': '180 240 220',
            '--c-wuxia-red': '163 24 24',
            '--c-paper-white': '225 250 242'
        }
    },
    {
        id: 'ember',
        name: '赤金残阳',
        description: '参考夕照、铜火、琥珀调，强调戏剧感与热烈氛围。',
        colors: ['#100806', '#2E1412', '#F29A4A', '#BE3023'],
        source: '暖橙 / 铜红 / 琥珀推荐系',
        variables: {
            '--c-ink-black': '16 8 6',
            '--c-ink-gray': '46 20 18',
            '--c-wuxia-gold': '242 154 74',
            '--c-wuxia-gold-dark': '166 78 31',
            '--c-wuxia-cyan': '255 214 153',
            '--c-wuxia-red': '190 48 35',
            '--c-paper-white': '248 232 214'
        }
    },
    {
        id: 'jade',
        name: '寒玉山岚',
        description: '重新调整为偏冷墨绿与玉石灰青，不再与其他主题重复。',
        colors: ['#050F09', '#143A26', '#84D6AD', '#D2F5E3'],
        source: '冷玉 / 山岚 / 灰青推荐系',
        variables: {
            '--c-ink-black': '5 15 9',
            '--c-ink-gray': '20 58 38',
            '--c-wuxia-gold': '132 214 173',
            '--c-wuxia-gold-dark': '46 120 82',
            '--c-wuxia-cyan': '210 255 236',
            '--c-wuxia-red': '142 62 48',
            '--c-paper-white': '238 248 240'
        }
    },
    {
        id: 'violet',
        name: '紫阙夜华',
        description: '参考夜紫、宫阙、秘术感配色，适合异色或诡秘风格。',
        colors: ['#09060F', '#221636', '#B484FF', '#DAC7FF'],
        source: '深紫 / 薰衣草 / 淡银紫推荐系',
        variables: {
            '--c-ink-black': '9 6 15',
            '--c-ink-gray': '34 22 54',
            '--c-wuxia-gold': '180 132 255',
            '--c-wuxia-gold-dark': '98 64 168',
            '--c-wuxia-cyan': '218 199 255',
            '--c-wuxia-red': '210 92 140',
            '--c-paper-white': '241 236 255'
        }
    },
    {
        id: 'moon',
        name: '霜月清辉',
        description: '参考月白、冰蓝、夜空银调，适合更轻的长时间浏览。',
        colors: ['#060810', '#2D3646', '#A0C4FF', '#DCF0FF'],
        source: '月蓝 / 冰白 / 雾灰推荐系',
        variables: {
            '--c-ink-black': '6 8 16',
            '--c-ink-gray': '45 54 70',
            '--c-wuxia-gold': '160 196 255',
            '--c-wuxia-gold-dark': '82 112 171',
            '--c-wuxia-cyan': '220 233 255',
            '--c-wuxia-red': '126 156 214',
            '--c-paper-white': '242 247 255'
        }
    },
    {
        id: 'crimson',
        name: '绯霞惊鸿',
        description: '参考樱绯、酒红、胭脂粉系，适合偏情绪化剧情风格。',
        colors: ['#0F0608', '#37121A', '#E86E7E', '#FFD2DA'],
        source: '玫瑰红 / 酒红 / 粉白推荐系',
        variables: {
            '--c-ink-black': '15 6 8',
            '--c-ink-gray': '55 18 26',
            '--c-wuxia-gold': '232 110 126',
            '--c-wuxia-gold-dark': '145 53 69',
            '--c-wuxia-cyan': '255 210 218',
            '--c-wuxia-red': '178 28 52',
            '--c-paper-white': '255 240 244'
        }
    },
    {
        id: 'sand',
        name: '朔漠旧卷',
        description: '参考羊皮纸、风沙、旧卷轴配色，偏古卷与沙土气质。',
        colors: ['#0C0A07', '#4A3B2E', '#D6B16C', '#F8F1E0'],
        source: '沙金 / 羊皮纸 / 褐土推荐系',
        variables: {
            '--c-ink-black': '12 10 7',
            '--c-ink-gray': '74 59 46',
            '--c-wuxia-gold': '214 177 108',
            '--c-wuxia-gold-dark': '141 105 51',
            '--c-wuxia-cyan': '242 227 193',
            '--c-wuxia-red': '176 96 62',
            '--c-paper-white': '248 241 224'
        }
    }
];

export const THEMES: Record<ThemePreset, Record<string, string>> = Object.fromEntries(
    主题列表.map((theme) => [theme.id, theme.variables])
) as Record<ThemePreset, Record<string, string>>;

export const 获取主题定义 = (theme: ThemePreset): 主题定义 => (
    主题列表.find((item) => item.id === theme) || 主题列表[0]
);

export const 应用主题到根元素 = (theme: ThemePreset, root?: HTMLElement) => {
    const target = root || document.documentElement;
    const definition = 获取主题定义(theme);
    Object.entries(definition.variables).forEach(([key, value]) => {
        target.style.setProperty(key, value);
    });
    target.dataset.theme = definition.id;
};
