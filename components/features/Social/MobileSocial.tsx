import React, { useEffect, useState } from 'react';
import { NPC结构 } from '../../../models/social';
import type { 香闺秘档部位类型 } from '../../../models/imageGeneration';
import { 构建NPC记忆展示结果 } from '../../../hooks/useGame/npcMemorySummary';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import { 获取图片展示地址, 获取图片资源文本地址 } from '../../../utils/imageAssets';
import { 格式化月日 } from '../../../utils/characterVitals';
import { IconBeads, IconHeart, IconMars, IconScroll } from '../../ui/Icons';
import type { OpeningConfig } from '../../../types';
import { 获取题材界面文案 } from '../../../utils/resourceLabels';
import { NPC是否扶她, NPC是否男性或男娘 } from '../../../utils/npcGenderFlags';

interface Props {
    socialList: NPC结构[];
    cultivationSystemEnabled?: boolean;
    onClose: () => void;
    selectedNpcId?: string | null;
    onSelectedNpcIdChange?: (npcId: string | null) => void;
    playerName?: string; // Add playerName prop to check for first time taker
    nsfwEnabled?: boolean;
    femboyNsfwEnabled?: boolean;
    onToggleMajorRole?: (npcId: string, nextIsMajor: boolean) => void;
    onTogglePresence?: (npcId: string, nextIsPresent: boolean) => void;
    onDeleteNpc?: (npcId: string) => void;
    onLearnSkill?: (npc: NPC结构, skill: any) => void;
    onRecruitToSect?: (npc: NPC结构) => void;
    onStealFromNpc?: (npc: NPC结构, target?: string) => void;
    onRetryImage?: (npcId: string, options?: { 构图?: NPC重绘构图 }) => void;
    playerSect?: any;
    openingConfig?: OpeningConfig;
}

type NPC重绘构图 = '头像' | '半身' | '立绘';

const NPC重绘构图选项: Array<{ value: NPC重绘构图; label: string; description: string }> = [
    { value: '头像', label: '头像', description: '用于名册头像和社交小图。' },
    { value: '半身', label: '半身', description: '用于详情卡片展示，上半身构图。' },
    { value: '立绘', label: '立绘', description: '用于角色详情和图册展示的完整立绘。' }
];

const 是女性角色 = (npc?: NPC结构 | null): boolean => String((npc as any)?.性别 || '').trim() === '女';
const 死亡状态正则 = /(死亡|已死|身亡|阵亡|战死|气绝|断气|毙命|殒命|已故)/;
const NPC是否死亡 = (npc?: NPC结构 | null): boolean => {
    if (!npc) return false;
    const 当前血量 = Number((npc as any).当前血量);
    const 最大血量 = Number((npc as any).最大血量);
    if (Number.isFinite(当前血量) && 当前血量 <= 0 && Number.isFinite(最大血量) && 最大血量 > 0) return true;
    const statusText = [
        (npc as any).状态,
        (npc as any).生死状态,
        (npc as any).生命状态,
        (npc as any).死亡描述
    ].filter(Boolean).join(' ');
    return 死亡状态正则.test(statusText);
};

const 计算社交排序权重 = (npc: NPC结构): number => {
    if ((npc as any)?.是否主要角色 === true) return 0;
    if ((npc as any)?.是否在场 === true) return 1;
    return 2;
};

type 社交筛选键 = 'all' | 'major' | 'present' | 'female' | 'male' | 'femboy' | 'futa';

const 移动社交筛选项: Array<{ key: 社交筛选键; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'major', label: '主要' },
    { key: 'present', label: '在场' },
    { key: 'female', label: '女性' },
    { key: 'male', label: '男性' },
    { key: 'femboy', label: '男娘' },
    { key: 'futa', label: '扶她' }
];

const MobileSocial: React.FC<Props> = ({
    socialList,
    cultivationSystemEnabled = true,
    onClose,
    selectedNpcId,
    onSelectedNpcIdChange,
    playerName = "少侠",
    nsfwEnabled = false,
    femboyNsfwEnabled = true,
    onToggleMajorRole,
    onTogglePresence,
    onDeleteNpc,
    onLearnSkill,
    onRecruitToSect,
    onStealFromNpc,
    onRetryImage,
    playerSect,
    openingConfig
}) => {
    const sortedSocialList = React.useMemo(() => (
        [...socialList].sort((a, b) => {
            const weightDiff = 计算社交排序权重(a) - 计算社交排序权重(b);
            if (weightDiff !== 0) return weightDiff;
            return socialList.indexOf(a) - socialList.indexOf(b);
        })
    ), [socialList]);
    const 获取NPC稳定ID = React.useCallback((npc: any, index = 0): string => (
        String(npc?.id || npc?.ID || npc?.姓名 || `npc-${index}`).trim()
    ), []);
    const [selectedId, setSelectedId] = useState<string | null>(
        sortedSocialList.length > 0 ? 获取NPC稳定ID(sortedSocialList[0], 0) : null
    );
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [activeFilter, setActiveFilter] = useState<社交筛选键>('all');
    const 显示境界 = cultivationSystemEnabled !== false;
    const [香闺展示模式, set香闺展示模式] = useState<Record<string, 'text' | 'image'>>({});
    const [showFullBackground, setShowFullBackground] = useState<boolean>(false);
    const 界面文案 = 获取题材界面文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const 组织名称 = String(playerSect?.名称 || '').trim();
    const 当前组织为末世营地 = /末日|丧尸|营地|避难|安全点|据点|车队|搜救|后勤|巡逻|物资|燃油|口粮|弹药|尸群/u.test(JSON.stringify(playerSect || {}));
    const 当前组织为无限流 = /主神|轮回|小队|奖励点|支线剧情|基因锁|主神空间|副本/u.test(JSON.stringify(playerSect || {}));
    const 格式化关系状态 = React.useCallback((value?: string) => {
        const text = String(value || '').trim() || '萍水相逢';
        if (当前组织为末世营地) return text.replace(/同门/g, '同伴').replace(/门派成员/g, '营地成员');
        if (当前组织为无限流) return text.replace(/同门/g, '轮回者').replace(/门派成员/g, '小队成员').replace(/宗门成员/g, '轮回者');
        return text;
    }, [当前组织为末世营地, 当前组织为无限流]);
    const NPC已属当前组织 = React.useCallback((npc: any): boolean => {
        if (!npc || !组织名称 || ['none', '无', '无门无派', '未加入', '散人'].includes(组织名称)) return false;
        const text = [
            npc?.身份,
            npc?.关系,
            npc?.关系状态,
            npc?.简介,
            npc?.记忆,
            npc?.当前任务,
            npc?.位置路径,
            npc?.所属组织,
            npc?.所属门派,
            npc?.所属营地
        ].filter(Boolean).join(' ');
        if (npc?.是否队友 === true) return true;
        if (text.includes(组织名称)) return true;
        if (当前组织为末世营地) return /同营|营地成员|营地队友|队伍成员|同队|同伴|同事/u.test(text);
        if (当前组织为无限流) return /轮回者|小队成员|队友|同队|轮回队友|队伍成员/u.test(text);
        return /同门|门派成员|宗门成员|同宗|同派/u.test(text);
    }, [组织名称, 当前组织为末世营地, 当前组织为无限流]);
    const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null);
    const [imageViewerZoom, setImageViewerZoom] = useState(1);
    const [imageRetryTarget, setImageRetryTarget] = useState<NPC结构 | null>(null);
    const [stealTargets, setStealTargets] = useState<Record<string, string>>({});

    const filteredSocialList = React.useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase();
        return sortedSocialList.filter((npc) => {
            const filterMatched = (() => {
                switch (activeFilter) {
                    case 'major':
                        return Boolean(npc.是否主要角色);
                    case 'present':
                        return Boolean(npc.是否在场);
                    case 'female':
                        return npc.性别 === '女';
                    case 'male':
                        return npc.性别 === '男' || npc.性别 === '男性';
                    case 'femboy':
                        return npc.性别 === '男娘' || (String((npc as any)?.性别 || '').includes('男娘'));
                    case 'futa':
                        return npc.性别 === '扶她' || (String((npc as any)?.性别 || '').includes('扶她'));
                    case 'all':
                    default:
                        return true;
                }
            })();
            if (!filterMatched) return false;
            if (!keyword) return true;
            const haystack = [
                npc.姓名,
                npc.身份,
                npc.关系状态,
                npc.境界,
                npc.对主角称呼,
                (npc as any).对主角称呼,
                npc.当前位置,
                npc.当前地点
            ]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                .join(' ')
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [activeFilter, searchKeyword, sortedSocialList]);

    useEffect(() => {
        if (filteredSocialList.length === 0) {
            setSelectedId(null);
            return;
        }
        if (!selectedId || !filteredSocialList.some((item, index) => 获取NPC稳定ID(item, index) === selectedId)) {
            setSelectedId(获取NPC稳定ID(filteredSocialList[0], 0));
        }
    }, [filteredSocialList, selectedId, 获取NPC稳定ID]);

    useEffect(() => {
        if (!selectedNpcId) return;
        const matched = sortedSocialList.find((item, index) => 获取NPC稳定ID(item, index) === selectedNpcId || item?.姓名 === selectedNpcId);
        if (!matched) return;
        setSelectedId(获取NPC稳定ID(matched, sortedSocialList.indexOf(matched)));
    }, [selectedNpcId, sortedSocialList, 获取NPC稳定ID]);

    useEffect(() => {
        // 关闭或切换角色时折叠背景
        setShowFullBackground(false);
        setImageViewer(null);
        setImageViewerZoom(1);
    }, [selectedId]);

    const currentNPC = sortedSocialList.find((n, index) => 获取NPC稳定ID(n, index) === selectedId || n.姓名 === selectedId);
    const adjacentNPCs = React.useMemo(() => {
        if (!currentNPC) return [] as NPC结构[];
        const currentIndex = sortedSocialList.findIndex((npc) => npc.id === currentNPC.id);
        if (currentIndex < 0) return [currentNPC];
        return sortedSocialList.filter((_, index) => Math.abs(index - currentIndex) <= 1);
    }, [currentNPC, sortedSocialList]);
    use图片资源回源预取(currentNPC, adjacentNPCs);
    const 当前记忆展示 = React.useMemo(
        () => currentNPC ? 构建NPC记忆展示结果(currentNPC.总结记忆, currentNPC.记忆) : { 总结记忆: [], 记忆: [], 原始总数: 0 },
        [currentNPC]
    );
    const 当前角色是女性 = 是女性角色(currentNPC);
    const 当前角色是扶她 = NPC是否扶她(currentNPC);
    const 当前角色是男性 = NPC是否男性或男娘(currentNPC);
    const 当前角色已死亡 = NPC是否死亡(currentNPC);
    const 展示女性扩展 = 当前角色是女性 && !当前角色是扶她 && Boolean(currentNPC?.是否主要角色);
    const 展示女性私密档案 = 展示女性扩展 && nsfwEnabled;
    const 展示男性私密档案 = 当前角色是男性 && Boolean(currentNPC?.是否主要角色) && nsfwEnabled && femboyNsfwEnabled;

    // [DEBUG] 私密部位图片调试日志
    useEffect(() => {
        if (!currentNPC) return;
        const npcName = currentNPC?.姓名 || 'unknown';
        const archive = (currentNPC as any)?.图片档案;
        const secretArchive = archive?.香闺秘档部位档案;
        const history = archive?.生图历史;
        console.group(`[私密图调试-移动端] NPC: ${npcName}`);
        console.log('条件状态:', {
            nsfwEnabled, femboyNsfwEnabled, 当前角色是女性, 当前角色是男性, 当前角色是扶她,
            是否主要角色: currentNPC?.是否主要角色, 展示女性扩展, 展示女性私密档案, 展示男性私密档案, 性别: currentNPC?.性别,
        });
        console.log('香闺秘档部位档案:', secretArchive || '不存在');
        if (secretArchive) {
            (['胸部', '小穴', '屁穴', '肉棒'] as 香闺秘档部位类型[]).forEach(part => {
                const entry = secretArchive[part];
                console.log(`  [${part}]:`, entry ? { 状态: entry?.状态, 图片URL: entry?.图片URL?.slice(0, 80), 获取图片展示地址: 获取图片展示地址(entry) || '空' } : '无记录');
            });
        }
        if (Array.isArray(history)) {
            const secret = history.filter((h: any) => ['部位特写', '胸部', '小穴', '屁穴', '肉棒'].includes(h?.构图) || ['胸部', '小穴', '屁穴', '肉棒'].includes(h?.部位));
            console.log(`生图历史(私密): ${secret.length} 条`, secret.map((h: any) => ({ 部位: h?.部位, 状态: h?.状态, url: 获取图片展示地址(h) || '空' })));
        }
        console.groupEnd();
    }, [currentNPC?.id, nsfwEnabled, femboyNsfwEnabled]);
    const 取首个非空文本 = (...values: unknown[]): string => {
        for (const value of values) {
            if (typeof value !== 'string') continue;
            const text = value.trim();
            if (!text) continue;
            const normalized = text.replace(/\s+/g, '');
            if (/^(未知|不详|暂无|暂无记录|未记录|待补充|待完善|未提供|未填写|\?+|n\/a)$/i.test(normalized)) continue;
            return text;
        }
        return '';
    };
    const 格式化生日 = (value: string): string => 格式化月日(value);
    const 读取外貌 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).外貌描写,
        (npc as any).外貌,
        (npc as any).档案?.外貌要点,
        (npc as any).档案?.外貌描写
    );
    const 读取身材 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).身材描写,
        (npc as any).身材,
        (npc as any).档案?.身材要点,
        (npc as any).档案?.身材描写
    );
    const 读取衣着 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).衣着风格,
        (npc as any).衣着,
        (npc as any).档案?.衣着风格,
        (npc as any).档案?.衣着要点
    );
    const 读取生日 = (npc: NPC结构): string => 格式化生日(取首个非空文本(
        (npc as any).生日,
        (npc as any).出生日期,
        (npc as any).档案?.生日
    ));
    const 读取对主角称呼 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).对主角称呼,
        (npc as any).档案?.对主角称呼
    );
    const 清理名器描述标签 = (value: string): string => {
        const text = 取首个非空文本(value);
        if (!text) return '';
        return text
            .replace(/^[\s"'""''【】\[\]（）()]*[^：:]{1,18}[：:]\s*/u, '')
            .replace(/(?:胸部|小穴|屁穴|肉棒)?\s*(?:拥有|带有|具备)?\s*[""']?[^，。；;：:]{1,18}[""']?\s*名器标签[，。；;]?\s*/gu, '')
            .replace(/名器标签[：:]\s*[^，。；;]+[，。；;]?\s*/gu, '')
            .trim();
    };
    const 读取胸部描述 = (npc: NPC结构): string => 清理名器描述标签(取首个非空文本((npc as any).胸部描述));
    const 读取小穴描述 = (npc: NPC结构): string => 清理名器描述标签(取首个非空文本((npc as any).小穴描述));
    const 读取屁穴描述 = (npc: NPC结构): string => 清理名器描述标签(取首个非空文本((npc as any).屁穴描述));
    const 读取肉棒描述 = (npc: NPC结构): string => 清理名器描述标签(取首个非空文本((npc as any).肉棒描述));
    const 读取男娘设定 = (npc: NPC结构): string => {
        return 取首个非空文本((npc as any).男娘设定);
    };
    const 读取扶她设定 = (npc: NPC结构): string => {
        return 取首个非空文本((npc as any).扶她设定);
    };
    const 清理私密占位 = (value: string): string => {
        const text = 取首个非空文本(value);
        return /^(未知|不详|待定|待开发|暂无记录|无)$/u.test(text) ? '' : text;
    };
    const 读取性癖 = (npc: NPC结构): string => 清理私密占位(取首个非空文本(
        (npc as any).性癖
    ));
    const 读取敏感点 = (npc: NPC结构): string => 清理私密占位(取首个非空文本((npc as any).敏感点));
    const 读取名器档案 = (npc: NPC结构): Array<{ 部位: string; 名称: string; 品质: string; 稳定描述: string; 标签: string[] }> => {
        const source = Array.isArray((npc as any)?.名器档案) ? (npc as any).名器档案 : [];
        return source
            .map((item: any) => ({
                部位: typeof item?.部位 === 'string' ? item.部位.trim() : '',
                名称: typeof item?.名称 === 'string' ? item.名称.trim() : '',
                品质: typeof item?.品质 === 'string' ? item.品质.trim() : '',
                稳定描述: typeof item?.稳定描述 === 'string' ? item.稳定描述.trim() : '',
                标签: Array.from(new Set([
                    typeof item?.名称 === 'string' ? item.名称.trim() : '',
                    ...(Array.isArray(item?.效果?.标签)
                        ? item.效果.标签.map((tag: unknown) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean)
                        : [])
                ].filter(Boolean))).slice(0, 4)
            }))
            .filter((item) => item.部位 && item.名称);
    };
    const 读取香闺秘档图片结果 = (npc: NPC结构, part: 香闺秘档部位类型) => {
        const source = (npc as any)?.图片档案?.香闺秘档部位档案?.[part];
        const sourceDisplayUrl = source && typeof source === 'object' ? 获取图片展示地址(source) : '';
        // [显示端调试] 记录读取时 ref 能否解析为可展示地址
        if (source && !sourceDisplayUrl) {
            console.warn(`[香闺秘档·显示端] ${npc?.姓名 || '?'} 的 ${part} 有部位档案但获取图片展示地址返回空`, {
                hasLocalPath: Boolean(source?.本地路径),
                localPathPrefix: typeof source?.本地路径 === 'string' ? source.本地路径.slice(0, 60) : '',
                hasImageUrl: Boolean(source?.图片URL),
                imageUrlPrefix: typeof source?.图片URL === 'string' ? source.图片URL.slice(0, 60) : '',
                状态: source?.状态,
                id: source?.id
            });
        }
        if (source && sourceDisplayUrl) return source;
        const history = Array.isArray((npc as any)?.图片档案?.生图历史) ? (npc as any).图片档案.生图历史 : [];
        // 优先从历史中查找可展示的成功记录
        const match = history
            .filter((item: any) => item?.部位 === part && item?.状态 !== 'failed' && item?.状态 !== 'pending' && 获取图片展示地址(item))
            .sort((a: any, b: any) => Number(b?.生成时间 || 0) - Number(a?.生成时间 || 0))[0];
        if (match) return match;
        // 没有可展示记录时，返回当前部位档案或最近的 failed 记录，让 UI 能正确显示失败状态
        if (source?.状态 === 'failed' || source?.状态 === 'pending') return source;
        const latestFailedOrPending = history
            .filter((item: any) => item?.部位 === part && (item?.状态 === 'failed' || item?.状态 === 'pending'))
            .sort((a: any, b: any) => Number(b?.生成时间 || 0) - Number(a?.生成时间 || 0))[0];
        if (latestFailedOrPending) return latestFailedOrPending;
        return undefined;
    };
    const 读取关系网 = (npc: NPC结构): Array<{ 对象姓名: string; 关系: string; 备注?: string }> => {
        if (!Array.isArray(npc?.关系网变量)) return [];
        return npc.关系网变量
            .map((item: any) => ({
                对象姓名: typeof item?.对象姓名 === 'string' ? item.对象姓名.trim() : '',
                关系: typeof item?.关系 === 'string' ? item.关系.trim() : '',
                备注: typeof item?.备注 === 'string' ? item.备注.trim() : undefined
            }))
            .filter(item => item.对象姓名 && item.关系);
    };
    const 读取当前子宫档案 = (npc: NPC结构) => {
        const source = (npc as any)?.子宫;
        if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
        const 内射记录 = Array.isArray((source as any)?.内射记录)
            ? (source as any).内射记录.map((rec: any) => ({
                日期: typeof rec?.日期 === 'string' ? rec.日期 : '未知时间',
                描述: typeof rec?.描述 === 'string' ? rec.描述 : '',
                怀孕判定日: typeof rec?.怀孕判定日 === 'string' ? rec.怀孕判定日 : '未知时间'
            }))
            : [];
        return {
            状态: typeof (source as any)?.状态 === 'string' ? (source as any).状态 : '未知',
            宫口状态: typeof (source as any)?.宫口状态 === 'string' ? (source as any).宫口状态 : '紧闭',
            内射记录
        };
    };
    const 读取NPC背包 = (npc: NPC结构): Array<{ 名称: string; 类型?: string; 数量?: number }> => (
        Array.isArray((npc as any)?.背包) ? (npc as any).背包 : []
    ).map((item: any) => (
        typeof item === 'string'
            ? { 名称: item.trim(), 类型: '杂物', 数量: 1 }
            : { 名称: item?.名称 || '未命名物品', 类型: item?.类型 || '杂物', 数量: Number(item?.数量 || item?.堆叠数量 || 1) }
    )).filter((item) => item.名称);
    const 读取NPC状态 = (npc: NPC结构, key: 'BUFF' | 'DEBUFF') => (
        Array.isArray((npc as any)?.[key]) ? (npc as any)[key] : []
    ).filter((item: any) => item && typeof item === 'object');
    const 读取NPC技艺 = (npc: NPC结构) => (
        Array.isArray((npc as any)?.技艺) ? (npc as any).技艺 : []
    ).filter((item: any) => item && typeof item === 'object');
    const 可请求学艺 = (skill: any): boolean => Number.isFinite(Number(skill?.熟练度));
    const 构建偷窃目标列表 = (npc: NPC结构): string[] => {
        const bagTargets = 读取NPC背包(npc).map((item) => item.名称).filter(Boolean).slice(0, 8);
        return Array.from(new Set([
            '随机随身物品',
            '钱袋/灵石袋',
            ...bagTargets,
            '贴身信物',
            '内衣/贴身衣物',
            '自定义目标'
        ]));
    };
    const 读取偷窃目标 = (npc: NPC结构): string => {
        const npcKey = String(npc?.id || (npc as any)?.ID || npc?.姓名 || 'npc');
        return stealTargets[npcKey] || '随机随身物品';
    };
    const 写入偷窃目标 = (npc: NPC结构, target: string) => {
        const npcKey = String(npc?.id || (npc as any)?.ID || npc?.姓名 || 'npc');
        if (target === '自定义目标') {
            const custom = window.prompt(`想从「${npc.姓名 || '目标'}」身上偷什么？`, '内衣/贴身衣物');
            setStealTargets(prev => ({ ...prev, [npcKey]: (custom || '随机随身物品').trim() || '随机随身物品' }));
            return;
        }
        setStealTargets(prev => ({ ...prev, [npcKey]: target }));
    };
    const 当前关系网 = currentNPC ? 读取关系网(currentNPC) : [];
    // 关系驱动面板：女性主要角色按原逻辑展示；任何角色只要带关系网变量数据也展示，
    // 避免 AI 已写入关系网变量的新角色因未标"主要角色"而整栏不可见。
    const 展示关系驱动面板 = 展示女性扩展 || 当前关系网.length > 0;
    const 当前子宫档案 = currentNPC ? 读取当前子宫档案(currentNPC) : undefined;
    const 读取失贞档案 = (npc: NPC结构) => {
        const source = (npc as any)?.失贞档案;
        if (source && typeof source === 'object' && !Array.isArray(source)) {
            return {
                是否失贞: Boolean(source.是否失贞),
                第一次对象: 取首个非空文本(source.第一次对象),
                第一次时间: 取首个非空文本(source.第一次时间),
                第一次描述: 取首个非空文本(source.第一次描述)
            };
        }
        if ((npc as any).是否处女 === false || (npc as any).初夜夺取者 || (npc as any).初夜时间 || (npc as any).初夜描述) {
            return {
                是否失贞: (npc as any).是否处女 === false,
                第一次对象: 取首个非空文本((npc as any).初夜夺取者),
                第一次时间: 取首个非空文本((npc as any).初夜时间),
                第一次描述: 取首个非空文本((npc as any).初夜描述)
            };
        }
        return undefined;
    };
    const 读取首次亲密记录 = (npc: NPC结构) => (
        Array.isArray((npc as any)?.首次亲密记录) ? (npc as any).首次亲密记录 : []
    ).map((record: any) => ({
        类型: 取首个非空文本(record?.类型),
        是否已发生: Boolean(record?.是否已发生),
        第一次对象: 取首个非空文本(record?.第一次对象),
        第一次时间: 取首个非空文本(record?.第一次时间),
        第一次描述: 取首个非空文本(record?.第一次描述)
    })).filter((record: any) => record.类型);
    const 当前失贞档案 = currentNPC ? 读取失贞档案(currentNPC) : undefined;
    const 亲密行为类型显示顺序 = ['阴道交', '肛交', '口交', '乳交', '手交', '足交', '股交'];
    const 当前首次亲密记录 = currentNPC ? (() => {
        const records = 读取首次亲密记录(currentNPC);
        const byType = new Map(records.map((record: any) => [record.类型, record]));
        if (当前失贞档案?.是否失贞 && !byType.has('阴道交') && !当前角色是男性) {
            byType.set('阴道交', {
                类型: '阴道交',
                是否已发生: true,
                第一次对象: 当前失贞档案.第一次对象,
                第一次时间: 当前失贞档案.第一次时间,
                第一次描述: 当前失贞档案.第一次描述
            });
        }
        return 亲密行为类型显示顺序.map((type) => byType.get(type) || { 类型: type, 是否已发生: false });
    })() : [];
    const 切换重要角色状态 = (npc: NPC结构) => {
        if (!onToggleMajorRole) return;
        onToggleMajorRole(npc.id, !Boolean(npc.是否主要角色));
    };
    const 切换在场状态 = (npc: NPC结构) => {
        if (!onTogglePresence) return;
        onTogglePresence(npc.id, !Boolean(npc.是否在场));
    };
    const 删除角色 = (npc: NPC结构) => {
        if (!onDeleteNpc) return;
        if (npc.是否主要角色) return;
        const confirmed = window.confirm(`确认删除角色「${npc.姓名}」？此操作不可撤销。`);
        if (!confirmed) return;
        onDeleteNpc(npc.id);
    };
    const 获取NPC图片历史 = (npc: any) => {
        if (!npc) return [];
        const archive = npc?.图片档案;
        const history = Array.isArray(archive?.生图历史)
            ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
            : [];
        const recent = archive?.最近生图结果 && typeof archive.最近生图结果 === 'object'
            ? archive.最近生图结果
            : (npc?.最近生图结果 && typeof npc.最近生图结果 === 'object' ? npc.最近生图结果 : undefined);
        const merged = recent ? [recent, ...history] : history;
        return merged
            .filter((item: any, index: number, list: any[]) => {
                const itemId = typeof item?.id === 'string' ? item.id : '';
                return !itemId || list.findIndex((candidate: any) => candidate?.id === itemId) === index;
            })
            .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
    };

    const 提取符合条件图片记录 = (
        npc: any,
        predicate: (item: any) => boolean,
        selectedImageId?: string
    ) => {
        const history = 获取NPC图片历史(npc);
        const normalizedSelectedId = typeof selectedImageId === 'string' ? selectedImageId.trim() : '';
        if (normalizedSelectedId) {
            const selected = history.find((item: any) => (
                item?.id === normalizedSelectedId
                && item?.状态 === 'success'
                && 获取图片展示地址(item)
                && predicate(item)
            ));
            if (selected) return selected;
        }
        return history.find((item: any) => item?.状态 === 'success' && 获取图片展示地址(item) && predicate(item));
    };

    const 提取头像图片地址 = (npc: any) => 获取图片展示地址(提取符合条件图片记录(
        npc,
        (item) => item?.构图 === '头像',
        npc?.图片档案?.已选头像图片ID
    ));
    const 提取立绘图片地址 = (npc: any) => {
        const fromArchive = 获取图片展示地址(提取符合条件图片记录(
            npc,
            (item) => item?.构图 === '立绘' || item?.构图 === '半身',
            npc?.图片档案?.已选立绘图片ID
        ));
        return fromArchive || 获取图片资源文本地址(npc?.立绘图片URL);
    };
    const 提取背景图片地址 = (npc: any) => 获取图片展示地址(提取符合条件图片记录(
        npc,
        (item) => item?.构图 !== '部位特写',
        npc?.图片档案?.已选背景图片ID
    ));

    const 当前头像 = 提取头像图片地址(currentNPC);
    const 当前立绘 = 提取立绘图片地址(currentNPC);
    const 当前详情主图 = 当前立绘 || 当前头像;
    const 当前背景 = 提取背景图片地址(currentNPC) || 当前立绘 || 当前头像;
    const 打开图片查看器 = (src?: string, alt?: string) => {
        const normalizedSrc = typeof src === 'string' ? src.trim() : '';
        if (!normalizedSrc) return;
        setImageViewerZoom(1);
        setImageViewer({ src: normalizedSrc, alt: (alt || '图片预览').trim() || '图片预览' });
    };
    const 关闭图片查看器 = () => {
        setImageViewer(null);
        setImageViewerZoom(1);
    };
    const 打开重绘选择 = (npc?: NPC结构 | null) => {
        if (!npc || !onRetryImage) return;
        setImageRetryTarget(npc);
    };
    const 提交重绘选择 = (构图: NPC重绘构图) => {
        if (!imageRetryTarget || !onRetryImage) return;
        onRetryImage(imageRetryTarget.id, { 构图 });
        setImageRetryTarget(null);
    };
    const 调整图片缩放 = (delta: number) => {
        setImageViewerZoom((prev) => Math.min(3, Math.max(0.5, Number((prev + delta).toFixed(2)))));
    };

    useEffect(() => {
        if (!imageViewer) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                关闭图片查看器();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [imageViewer]);

    const 香闺部位列表: Array<{ key: 香闺秘档部位类型; label: string; text: string }> = currentNPC
        ? (当前角色是扶她
            ? [
                { key: '胸部', label: '胸部描述', text: 读取胸部描述(currentNPC) || '暂无记录' },
                { key: '小穴', label: '小穴描述', text: 读取小穴描述(currentNPC) || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: 读取屁穴描述(currentNPC) || '暂无记录' },
                { key: '肉棒', label: '肉棒描述', text: 读取肉棒描述(currentNPC) || '暂无记录' }
            ]
            : 当前角色是男性
            ? [
                { key: '肉棒', label: '肉棒描述', text: 读取肉棒描述(currentNPC) || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: 读取屁穴描述(currentNPC) || '暂无记录' }
            ]
            : [
                { key: '胸部', label: '胸部描述', text: 读取胸部描述(currentNPC) || '暂无记录' },
                { key: '小穴', label: '小穴描述', text: 读取小穴描述(currentNPC) || '暂无记录' },
                { key: '屁穴', label: '屁穴描述', text: 读取屁穴描述(currentNPC) || '暂无记录' }
            ])
        : [];
    const 当前名器档案 = currentNPC ? 读取名器档案(currentNPC) : [];
    const 读取部位名器档案 = (part: string) => 当前名器档案.find((item) => item.部位 === part);
    const 名器标签框: React.FC<{ part: string }> = ({ part }) => {
        const archive = 读取部位名器档案(part);
        if (!archive) return null;
        return (
            <div className="mb-1.5 rounded border border-fuchsia-800/35 bg-fuchsia-950/15 p-1.5">
                <div className="flex flex-wrap items-center gap-1 leading-none">
                    <span className="text-[8px] font-bold tracking-[0.14em] text-fuchsia-300">名器</span>
                    <span className="text-[10px] font-bold text-fuchsia-100">{archive.名称 || '无名器'}</span>
                    <span className={`rounded border px-1 py-0.5 text-[8px] leading-none ${archive.品质 === '无' ? 'border-gray-700 text-gray-500' : 'border-wuxia-gold/40 text-wuxia-gold'}`}>{archive.品质 || '未定'}</span>
                </div>
            </div>
        );
    };
    const 生成香闺部位键 = (npcId: string, part: 香闺秘档部位类型) => `${npcId}_${part}`;

    // Helper for Privacy Tags
    const PrivateTag: React.FC<{ label: string; value?: string; color?: string }> = ({ label, value, color = "text-pink-300" }) => (
        <div className="social-private-tag flex flex-col bg-black/40 border border-gray-800 p-2 rounded relative group active:border-pink-500/50 transition-colors">
            <span className="social-private-label text-[9px] text-gray-500 uppercase tracking-widest mb-1">{label}</span>
            <span className={`social-private-value font-serif text-[11px] ${color} drop-shadow-sm`}>{value || "???"}</span>
        </div>
    );
    const 首次亲密档案框: React.FC = () => {
        if (!当前失贞档案 && 当前首次亲密记录.length <= 0) return null;
        const 详情提示 = (text?: string) => {
            const value = typeof text === 'string' ? text.trim() : '';
            if (!value) return null;
            return <span title={value} className="rounded border border-pink-500/30 px-1 py-0.5 text-[8px] text-pink-200/80">详情</span>;
        };
        return (
            <div className="social-intimacy-archive mb-4 rounded-lg border border-pink-900/35 bg-black/45 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-bold tracking-[0.18em] text-pink-300">NSFW经历档案</span>
                    {当前失贞档案 && (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] ${当前失贞档案.是否失贞 ? 'border-wuxia-gold/40 text-wuxia-gold bg-wuxia-gold/10' : 'border-pink-700/40 text-pink-300 bg-pink-950/20'}`}>
                            {当前失贞档案.是否失贞 ? '已失贞' : '未失贞'}
                        </span>
                    )}
                </div>
                <div className="space-y-1.5">
                    {当前首次亲密记录.map((record: any) => (
                        <div key={record.类型} className="social-intimacy-record rounded border border-pink-900/25 bg-black/35 p-2 text-[10px]">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="font-bold text-pink-300">{record.类型}</span>
                                <span className={`rounded px-1.5 py-0.5 text-[8px] ${record.是否已发生 ? 'bg-pink-500/15 text-pink-200' : 'bg-gray-800 text-gray-500'}`}>{record.是否已发生 ? '已发生' : '未发生'}</span>
                            </div>
                            {record.是否已发生 ? (
                                <div className="space-y-0.5 text-pink-100/85">
                                    <div className="flex items-center gap-1"><span className="text-gray-500">第一次交给：</span><span>{record.第一次对象 || '未知对象'}</span>{详情提示(record.第一次描述)}</div>
                                    <div><span className="text-gray-500">时间：</span>{record.第一次时间 || '未知时间'}</div>
                                </div>
                            ) : (
                                <div className="text-[9px] text-gray-500">尚未发生</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };
    const RelationTag: React.FC<{ label: string; value?: string; accent?: string }> = ({ label, value, accent = "text-cyan-300" }) => (
        <div className="social-relation-tag bg-black/30 border border-gray-800 rounded p-2.5 h-full">
            <div className="social-private-label text-[9px] text-gray-500 uppercase tracking-widest mb-1.5">{label}</div>
            <div className={`social-private-value text-[11px] font-serif leading-relaxed ${accent}`}>{value?.trim() || "暂无记录"}</div>
        </div>
    );
    const 在场切换文案 = currentNPC
        ? (当前角色已死亡 ? '已故不可调度' : currentNPC.是否在场 ? '暂时离场' : '召回到场')
        : '调度状态';
    const 当前状态文案 = currentNPC
        ? (当前角色已死亡 ? '已故' : currentNPC.是否在场 ? '在场中' : '暂未在场')
        : '暂无记录';
    const 当前称呼文案 = currentNPC ? (读取对主角称呼(currentNPC) || '暂无记录') : '暂无记录';
    const 当前生日文案 = currentNPC ? (读取生日(currentNPC) || '暂无记录') : '暂无记录';
    const 读取数值 = (source: any, key: string, fallback = 0): number => {
        const parsed = Number(source?.[key]);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const NPC六维属性 = currentNPC ? [
        ['力', '力量', 读取数值(currentNPC, '力量')],
        ['敏', '敏捷', 读取数值(currentNPC, '敏捷')],
        ['体', '体质', 读取数值(currentNPC, '体质')],
        ['根', '根骨', 读取数值(currentNPC, '根骨')],
        ['悟', '悟性', 读取数值(currentNPC, '悟性')],
        ['福', '福源', 读取数值(currentNPC, '福源')]
    ] : [];
    const NPC天赋列表 = Array.isArray((currentNPC as any)?.天赋列表)
        ? (currentNPC as any).天赋列表.filter((item: any) => item?.名称)
        : [];
    const NPC出身背景 = (currentNPC as any)?.出身背景 && typeof (currentNPC as any).出身背景 === 'object'
        ? (currentNPC as any).出身背景
        : null;
    const 当前主题 = typeof document !== 'undefined' ? document.documentElement.dataset.theme || '' : '';
    const 当前是白天主题 = 当前主题 === 'day';
    const 右侧信息卡样式: React.CSSProperties = {
        background: 当前是白天主题 ? '#fffdf7' : 'rgba(18, 13, 9, 0.92)',
        backgroundImage: 'none'
    };
    const 右侧首卡样式: React.CSSProperties = {
        background: 当前是白天主题 ? '#fffdf7' : 'rgba(18, 13, 9, 0.92)',
        backgroundImage: 'none',
        borderColor: 当前是白天主题 ? 'rgba(181, 130, 66, 0.32)' : undefined
    };
    const 标题文字样式: React.CSSProperties = {
        color: 当前是白天主题 ? '#7a4a18' : 'rgb(var(--c-wuxia-gold))',
        textShadow: 'none',
        filter: 'none'
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-0 sm:p-4 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 w-full h-full sm:h-[90vh] sm:rounded-2xl border-0 sm:border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 flex flex-col relative overflow-hidden">
                
                {/* Header */}
                <div className="h-14 shrink-0 border-b border-white/10 bg-gradient-to-r from-black/80 to-black/40 px-3 relative z-[100]">
                    <div className="mx-auto flex h-full w-full max-w-[20.4rem] items-center justify-between">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-wuxia-gold/25 bg-black/35 px-2 py-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                            <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                            <h3 className="text-[1rem] text-wuxia-gold font-serif font-bold tracking-[0.08em] drop-shadow-md">{界面文案.标题.社交}</h3>
                            <span className="rounded-full border border-wuxia-gold/20 px-1.5 py-0.5 text-[8px] text-wuxia-gold/70 font-mono tracking-[0.18em]">卷宗</span>
                        </div>
                        <button 
                            onClick={onClose}
                            className="inline-flex h-10 min-w-[2.7rem] items-center justify-center rounded-[1rem] border border-wuxia-gold/20 bg-black/55 px-2.5 text-wuxia-gold/85 transition-all active:border-wuxia-gold/50 active:bg-wuxia-gold/10"
                            title="关闭"
                        >
                            <span className="text-[0.9rem] font-serif font-bold tracking-[0.18em]">返</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="ml-0.5 h-3.5 w-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="social-modal-body flex-1 flex flex-col overflow-hidden relative z-0">
                    <div className="shrink-0 border-b border-white/5 bg-gradient-to-b from-black/80 to-black/90 relative z-[90] px-3 pt-1 pb-3 shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
                        <div className="mx-auto w-full max-w-[21.75rem]">
                            <div className="mx-auto w-full max-w-[20.4rem]">
                                <div className="mb-1 flex items-center justify-between text-[9px] leading-none text-wuxia-gold/65 tracking-[0.2em]">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full border border-wuxia-gold/45 bg-black/50"></span>
                                        名册
                                    </div>
                                    <span className="rounded-xl border border-wuxia-gold/25 bg-black/45 px-3 py-0.5 text-wuxia-gold/80 font-mono leading-none">
                                        {filteredSocialList.length}/{sortedSocialList.length}
                                    </span>
                                </div>
                                <div className="mb-2 flex items-center gap-1.5 rounded-[1.3rem] border border-wuxia-gold/18 bg-black/35 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0 text-wuxia-gold/60">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.4a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z" />
                                    </svg>
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchKeyword}
                                        onChange={(event) => setSearchKeyword(event.target.value)}
                                        placeholder="搜索人物..."
                                        className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            searchInputRef.current?.focus();
                                            searchInputRef.current?.select();
                                        }}
                                        className="shrink-0 rounded-full border border-wuxia-gold/18 bg-black/45 px-2.5 py-0.5 text-[10px] tracking-[0.16em] text-wuxia-gold/75 transition-colors active:bg-wuxia-gold/10"
                                    >
                                        寻人
                                    </button>
                                </div>
                                <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                                    {移动社交筛选项.map((filter) => (
                                        <button
                                            key={filter.key}
                                            type="button"
                                            onClick={() => setActiveFilter(filter.key)}
                                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] transition-all ${
                                                activeFilter === filter.key
                                                    ? 'border-wuxia-gold/50 bg-wuxia-gold/10 text-wuxia-gold shadow-[0_0_14px_rgba(212,175,55,0.15)]'
                                                    : 'border-white/10 bg-black/35 text-gray-300'
                                            }`}
                                        >
                                            <span className="mr-1 text-wuxia-gold/60">●</span>
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
                                {filteredSocialList.map((npc, rosterIndex) => {
                                    const npcStableId = 获取NPC稳定ID(npc, rosterIndex);
                                    const npcDead = NPC是否死亡(npc);
                                    const rosterMainImage = 提取头像图片地址(npc) || 提取立绘图片地址(npc);
                                    return (
                                    /* 名册横向卡：
                                       w-[15rem] 控整卡宽度
                                       h-[7rem] 控整卡高度
                                       rounded-[1.45rem] 控整卡圆角
                                       px-1.5 py-1.5 控整卡内边距 */
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        key={npcStableId}
                                        onClick={() => {
                                            setSelectedId(npcStableId);
                                            onSelectedNpcIdChange?.(npcStableId);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            setSelectedId(npcStableId);
                                            onSelectedNpcIdChange?.(npcStableId);
                                        }}
                                        className={`w-[15rem] h-[7rem] shrink-0 snap-start rounded-[1.45rem] border px-1.5 py-1.5 transition-all relative group overflow-hidden text-left ${
                                            selectedId === npcStableId
                                            ? 'border-wuxia-gold/40 bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(0,0,0,0.22)_45%,rgba(255,255,255,0.02))] shadow-[0_0_18px_rgba(212,175,55,0.12)]'
                                            : 'border-white/10 bg-white/[0.03] active:bg-white/[0.05]'
                                        }`}
                                    >
                                        {selectedId === npcStableId && (
                                            <div className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)] z-10"></div>
                                        )}
                                        <div className="flex h-full items-stretch gap-2">
                                            {/* 头像区：
                                                w-[6.25rem] 控头像框宽度
                                                h-full + self-stretch 让头像框上下贴齐卡片
                                                rounded-[1.2rem] 控头像框圆角 */}
                                            <div className={`relative h-full w-[6.25rem] shrink-0 self-stretch rounded-[1.2rem] overflow-hidden border bg-black/50 shadow-[0_12px_28px_rgba(0,0,0,0.32)] ${npcDead ? 'border-gray-500/50' : 'border-white/10'}`}>
                                            {rosterMainImage ? (
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    className="block h-full w-full"
                                                    title="查看头像"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        打开图片查看器(rosterMainImage, `${npc.姓名} 头像`);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        打开图片查看器(rosterMainImage, `${npc.姓名} 头像`);
                                                    }}
                                                >
                                                    <img src={rosterMainImage} alt={npc.姓名} className={`w-full h-full object-cover object-center ${npcDead ? 'grayscale opacity-60' : ''}`} />
                                                </div>
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center font-serif font-bold text-3xl ${npcDead ? 'text-gray-500/60 grayscale' : 是女性角色(npc) ? 'text-pink-500/50' : 'text-blue-500/50'}`}>
                                                    {npc.姓名[0]}
                                                </div>
                                            )}
                                            {npcDead && (
                                                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[8px] tracking-widest text-gray-200">
                                                    已故
                                                </div>
                                            )}
                                            {onRetryImage && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); 打开重绘选择(npc); }}
                                                    className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded border border-wuxia-gold/30 bg-black/60 text-wuxia-gold/80 hover:bg-wuxia-gold/20 hover:text-wuxia-gold transition-all z-10"
                                                >
                                                    重绘
                                                </button>
                                            )}
                                        </div>
                                        {/* 名册卡右侧文案区：
                                            第 1 行是 名字 + 好感度
                                            第 2 行开始是下面三层信息
                                            这里整体主要改字号、行间距、左右排布 */}
                                        <div className="min-w-0 flex-1 flex flex-col justify-start py-0">
                                            {/* 名字和好感度：
                                                gap-1 控两者间距 */}
                                            <div className="flex min-w-0 items-center gap-1">
                                                {/* 名字：
                                                    text-[1.3rem] 控名字字号
                                                    truncate 控超长省略
                                                    leading-none 压紧行高 */}
                                                <div className={`min-w-0 shrink truncate font-serif font-bold text-[1.3rem] leading-none ${selectedId === npc.id ? 'text-wuxia-gold drop-shadow-sm' : 'text-gray-100'}`}>
                                                    {npc.姓名}
                                                </div>
                                                {/* 好感度小框：
                                                    px-1.5 py-0.5 控框大小
                                                    text-[9px] 控小框文字大小 */}
                                                <div className="shrink-0 rounded-full border border-pink-500/25 bg-pink-500/8 px-1.5 py-0.5 text-[9px] leading-none font-mono text-pink-300/90">
                                                    {/* IconHeart size={9} 控爱心图标大小 */}
                                                    <span className="inline-flex items-center gap-0.5"><IconHeart size={9} />{npc.好感度}</span>
                                                </div>
                                            </div>
                                            {/* 三层信息：
                                                mt-0.5 控和名字那一行的距离
                                                space-y-0.5 控三层之间上下间距
                                                第 1 行境界
                                                第 2 行离场/要角
                                                第 3 行关系/身份 */}
                                            <div className="mt-0.5 space-y-0.5">
                                                {显示境界 && npc.境界 && (
                                                    /* 境界框：
                                                       px-1 py-0.5 控框大小
                                                       text-[8px] 控字号 */
                                                    <div className="inline-flex w-fit whitespace-nowrap rounded-full border border-white/10 bg-black/35 px-1 py-0.5 text-[8px] leading-none text-gray-300">
                                                        {npc.境界}
                                                    </div>
                                                )}
                                                {/* 离场 / 要角 这一行：
                                                    gap-0.5 控两个框之间间距 */}
                                                <div className="flex min-w-0 flex-wrap gap-0.5">
                                                    {/* 离场框：
                                                        px-1 py-0.5 控框大小
                                                        text-[8px] 控字号 */}
                                                    <div className={`inline-flex w-fit whitespace-nowrap rounded-full border px-1 py-0.5 text-[8px] leading-none ${
                                                        npcDead
                                                            ? 'border-gray-500/30 text-gray-400'
                                                            : npc.是否在场
                                                                ? 'border-emerald-500/30 text-emerald-300'
                                                                : 'border-white/10 text-gray-400'
                                                    }`}>
                                                        {npcDead ? '已故' : npc.是否在场 ? '在场' : '离场'}
                                                    </div>
                                                    {npc.是否主要角色 && (
                                                        /* 要角框：
                                                           px-1 py-0.5 控框大小
                                                           text-[8px] 控字号 */
                                                        <div className="inline-flex w-fit whitespace-nowrap rounded-full border border-wuxia-gold/35 bg-wuxia-gold/10 px-1 py-0.5 text-[8px] leading-none text-wuxia-gold">
                                                            要角
                                                        </div>
                                                    )}
                                                </div>
                                                {/* 生死之交 / 游方医女 这一行：
                                                    gap-1 控两段文字之间距离
                                                    text-[8px] 控这一行整体字号 */}
                                                <div className="flex min-w-0 items-center gap-1 text-[8px] leading-none">
                                                    <div className="shrink-0 text-pink-300/85">
                                                        {格式化关系状态(npc.关系状态)}
                                                    </div>
                                                    <div className="min-w-0 shrink text-gray-400 truncate">
                                                        {npc.身份 || '江湖散人'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        </div>
                                    </div>
                                );})}
                                {filteredSocialList.length === 0 && (
                                     <div className="w-full rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 py-8 text-center text-gray-500 text-xs font-serif flex flex-col items-center gap-2">
                                        <IconBeads size={20} className="opacity-50" />
                                        {sortedSocialList.length > 0 ? '没有符合筛选的人物' : '暂无结识之人'}
                                     </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Bottom: JRPG Detail Screen */}
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-black z-10 flex flex-col relative">
                        {/* Global Background for Detail Area */}
                        <div className={`w-full transition-[height] duration-500 overflow-hidden relative z-0 shrink-0 ${showFullBackground ? 'h-[45vh]' : 'h-0'}`}>
                            {当前背景 ? (
                                <div 
                                    className="w-full h-full bg-cover transition-opacity duration-500 opacity-90 opacity-100 bg-no-repeat"
                                    style={{ 
                                        backgroundImage: `url(${当前背景})`,
                                        backgroundPosition: 'center 10%'
                                    }}
                                    onClick={() => 打开图片查看器(当前背景, `${currentNPC?.姓名 || '角色'} 背景`)}
                                >
                                    <div
                                        className="social-background-image-dim absolute inset-0 pointer-events-none"
                                        style={{ backgroundImage: 'linear-gradient(to top, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.18))' }}
                                    ></div>
                                </div>
                            ) : (
                                <div className="w-full h-full bg-ink-wash/5 bg-cover bg-center opacity-70"></div>
                            )}
                            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-wuxia-gold/20 to-transparent pointer-events-none"></div>
                        </div>

                        {/* Detail Content Wrapping */}
                        <div className="relative z-10 -mt-1 rounded-t-xl bg-black min-h-full">
                            {currentNPC ? (
                                /* 详情区主纵向容器：
                                    `p-4` 控整个详情区四周内边距。
                                    `gap-4` 控这一层所有直属子元素之间的默认上下间距。
                                    这里会影响：
                                    - "展开背景卷轴"按钮
                                    - 下方主信息卡
                                    - 后续的人设档案、技艺状态等模块

                                    如果你想统一缩小整列模块之间的距离，可以改这里的 `gap-4`。
                                    但如果你只想改"展开背景卷轴"按钮和下面信息栏上边框的距离，
                                    优先改下面按钮上的 `mb-2`，会更精准，不会影响后面其他模块。 */
                                <div className="p-2 flex flex-col gap-[0.6rem] pb-12">
                                {/* 背景卷轴展开/收起按钮：
                                    这颗按钮就在主信息卡（下面那块大信息栏）正上方。

                                    距离控制重点：
                                    `mb-2` = 这颗按钮到底下主信息卡上边框的额外下边距。
                                    - 想更贴近下面信息栏：改成 `mb-1`、`mb-0.5`、`mb-0`
                                    - 想拉开更远：改成 `mb-3`、`mb-4`

                                    其它常改项：
                                    `py-1.5` 控按钮高度
                                    `gap-2` 控左右箭头和中间文字的间距
                                    `text-[10px]` 控按钮文字大小 */}
                                {(当前背景 || 当前详情主图) && (
                                    <button 
                                        onClick={() => setShowFullBackground(!showFullBackground)}
                                        className="w-full py-1.5 bg-gradient-to-r from-transparent via-wuxia-gold/10 to-transparent border-y border-wuxia-gold/20 flex items-center justify-center gap-2 text-[10px] text-wuxia-gold/70 tracking-widest font-serif active:bg-wuxia-gold/20 transition-all mb-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                        {showFullBackground ? '收起背景卷轴' : '展开背景卷轴'}
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </button>
                                )}

                                {/* 主信息卡 / 信息栏大框：
                                    这块就是"展开背景卷轴"按钮正下方的大信息栏。
                                    它和上面按钮的距离，优先由上面按钮的 `mb-2` 控制；
                                    同时也会受父级纵向容器 `gap-4` 影响。

                                    如果你看到"怎么改 mb-2 还是感觉有点空"，
                                    再回头检查上面的 `gap-4`。 */}
                                {/* Dossier Hero Card */}
                                <div className="relative overflow-hidden rounded-[1.7rem] border border-wuxia-gold/20 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_34%),linear-gradient(180deg,rgba(31,22,15,0.96),rgba(13,10,8,0.98))] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.5)] origin-top animate-fadeIn">
                                    <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.025),transparent_28%,transparent_72%,rgba(212,175,55,0.05))] pointer-events-none"></div>
                                    <div className="relative z-10 grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] gap-3 items-start">
                                        <div className="flex min-w-0 flex-col gap-2.5">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                className="relative w-full overflow-hidden rounded-[1.35rem] border border-wuxia-gold/25 bg-black/55 shadow-[0_18px_30px_rgba(0,0,0,0.42)] aspect-[3/4]"
                                                onClick={() => 打开图片查看器(当前详情主图, `${currentNPC.姓名}${当前立绘 ? ' 立绘' : ' 头像'}`)}
                                                onKeyDown={(event) => {
                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                    event.preventDefault();
                                                    打开图片查看器(当前详情主图, `${currentNPC.姓名}${当前立绘 ? ' 立绘' : ' 头像'}`);
                                                }}
                                                title={当前详情主图 ? '点击查看图片大图' : ''}
                                            >
                                                {当前详情主图 ? (
                                                    <>
                                                        <img src={当前详情主图} alt={currentNPC.姓名} className={`absolute inset-0 h-full w-full object-cover object-top ${当前角色已死亡 ? 'grayscale opacity-65' : ''}`} />
                                                        <div
                                                            className="absolute inset-0 pointer-events-none"
                                                            style={{ backgroundImage: 'linear-gradient(to top, rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0))' }}
                                                        ></div>
                                                        {当前角色已死亡 && (
                                                            <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-[10px] tracking-[0.25em] text-gray-200">
                                                                已故
                                                            </div>
                                                        )}
                                                        {onRetryImage && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); 打开重绘选择(currentNPC); }}
                                                                className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded border border-wuxia-gold/30 bg-black/60 text-wuxia-gold/80 hover:bg-wuxia-gold/20 hover:text-wuxia-gold transition-all z-10"
                                                            >
                                                                重绘
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center font-serif text-5xl text-wuxia-gold/30">{currentNPC.姓名[0]}</div>
                                                )}
                                            </div>
                                            {/* 左侧立绘下方的三颗操作按钮：
                                                这里控制的是"召回到场 / 设为重要 / 忘却此人"这整组按钮。
                                                `space-y-2` 控制按钮与按钮之间的垂直间距。
                                                如果想让三颗按钮挨得更近，改小为 `space-y-1.5` 或 `space-y-1`。
                                                如果想让按钮之间更松一点，就改大。 */}
                                            <div className="space-y-1.5">
                                                {/* 在场状态按钮：
                                                    功能：切换 NPC 是否在场。
                                                    `h-[3rem]` 控按钮高度。
                                                    `rounded-[1.35rem]` 控胶囊圆角大小。
                                                    `px-4` 控左右内边距，也会影响按钮看起来"宽不宽松"。
                                                    `text-sm` 控文字字号。
                                                    `gap-2` 控图标和文字之间的距离。
                                                    `w-full` 让按钮横向占满这一列宽度。

                                                    下面三种状态样式分别对应：
                                                    1. 已死亡：灰色禁用态。
                                                    2. 当前在场：绿色高亮态。
                                                    3. 当前不在场：默认暗色态，按下时带绿色反馈。

                                                    如果你想统一把这组三个按钮做得更紧凑，
                                                    最常改的是：`h-[3rem]`、`rounded-[1.35rem]`、`px-4`、`text-sm`。 */}
                                                <button
                                                    type="button"
                                                    onClick={() => 切换在场状态(currentNPC)}
                                                    disabled={当前角色已死亡}
                                                    className={`flex h-[2.7rem] w-full items-center justify-center gap-2 rounded-[1.35rem] border px-4 text-sm font-serif tracking-[0.04em] transition-all ${
                                                        当前角色已死亡
                                                            ? 'cursor-not-allowed border-gray-800 bg-black/45 text-gray-600'
                                                            : currentNPC.是否在场
                                                                ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:bg-emerald-900/30'
                                                                : 'border-white/10 bg-black/50 text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:bg-emerald-500/10 active:border-emerald-500/30 active:text-emerald-300'
                                                    }`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                                    </svg>
                                                    {在场切换文案}
                                                </button>
                                                {/* 重要角色按钮：
                                                    功能：把当前 NPC 标记为"重要角色"或取消重要标记。
                                                    尺寸参数和上一颗按钮基本一致：
                                                    `h-[3rem]` 高度
                                                    `rounded-[1.35rem]` 圆角
                                                    `px-4` 左右内边距
                                                    `text-sm` 文字大小
                                                    `gap-2` 图标与文字间距

                                                    状态区别：
                                                    - 已设重要：金色高亮
                                                    - 未设重要：默认暗色

                                                    如果你只想单独调这一颗按钮更显眼，
                                                    主要改这里的边框色、背景色、文字色那几段状态 class。 */}
                                                <button
                                                    type="button"
                                                    onClick={() => 切换重要角色状态(currentNPC)}
                                                    className={`flex h-[2.7rem] w-full items-center justify-center gap-2 rounded-[1.35rem] border px-4 text-sm font-serif tracking-[0.04em] transition-all ${
                                                        currentNPC.是否主要角色
                                                            ? 'border-wuxia-gold/50 bg-wuxia-gold/10 text-wuxia-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                                            : 'border-white/10 bg-black/50 text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                                    }`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                                                    </svg>
                                                    {currentNPC.是否主要角色 ? '已设重要' : '设为重要'}
                                                </button>
                                                {onRecruitToSect && (() => {
                                                    const 已属当前组织 = NPC已属当前组织(currentNPC);
                                                    const inviteLabel = 当前组织为末世营地 ? '邀入营地' : 当前组织为无限流 ? '邀入小队' : '邀入门派';
                                                    return (
                                                    <button
                                                        type="button"
                                                        onClick={() => onRecruitToSect(currentNPC)}
                                                        disabled={当前角色已死亡 || 已属当前组织}
                                                        title={已属当前组织 ? (当前组织为末世营地 ? '已是同营地' : 当前组织为无限流 ? '已是队友' : '已是同门') : inviteLabel}
                                                        className={`flex h-[2.7rem] w-full items-center justify-center rounded-[1.35rem] border px-4 text-sm font-serif tracking-[0.04em] transition-colors ${
                                                            当前角色已死亡 || 已属当前组织
                                                                ? 'cursor-not-allowed border-gray-800 bg-black/45 text-gray-600'
                                                                : 'border-cyan-500/35 bg-cyan-950/20 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:bg-cyan-800/30'
                                                        }`}
                                                    >
                                                        {已属当前组织 ? (当前组织为末世营地 ? '已在营地' : 当前组织为无限流 ? '已在小队' : '已入门派') : inviteLabel}
                                                    </button>
                                                    );
                                                })()}
                                                {onStealFromNpc && (
                                                    <div className="flex w-full overflow-hidden rounded-[1.35rem] border border-amber-500/35 bg-amber-950/15 text-amber-100">
                                                        <select
                                                            value={读取偷窃目标(currentNPC)}
                                                            onChange={(event) => 写入偷窃目标(currentNPC, event.target.value)}
                                                            disabled={当前角色已死亡}
                                                            className="h-[2.7rem] min-w-0 flex-1 bg-black/45 px-3 text-sm text-amber-100 outline-none"
                                                        >
                                                            {构建偷窃目标列表(currentNPC).map(target => <option key={target} value={target}>{target}</option>)}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => onStealFromNpc(currentNPC, 读取偷窃目标(currentNPC))}
                                                            disabled={当前角色已死亡}
                                                            className={`h-[2.7rem] shrink-0 border-l px-4 text-sm font-serif tracking-[0.04em] transition-colors ${
                                                                当前角色已死亡
                                                                    ? 'cursor-not-allowed border-gray-800 text-gray-600'
                                                                    : 'border-amber-500/35 active:bg-amber-900/25'
                                                            }`}
                                                        >
                                                            偷窃
                                                        </button>
                                                    </div>
                                                )}
                                                {/* 删除角色按钮：
                                                    功能：删除当前 NPC。
                                                    当 NPC 已经被标记为"重要角色"时，这颗按钮会禁用。

                                                    外形控制点：
                                                    `h-[3rem]` 控高度
                                                    `rounded-[1.35rem]` 控圆角
                                                    `px-4` 控左右留白
                                                    `text-sm` 控文字大小

                                                    和前两颗按钮不同的是，这里没有 `gap-2`，
                                                    因为它只有文字，没有左侧图标。

                                                    状态区别：
                                                    - 重要角色：灰色禁用态
                                                    - 可删除：默认暗色，按下时变红

                                                    如果你想让这颗按钮更像"危险操作"，
                                                    可以增强 `active:border-red-500`、`active:text-red-400`、`active:bg-red-500/10`
                                                    这些红色反馈，或者直接给默认态加一点偏红边框。 */}
                                                <button
                                                    type="button"
                                                    onClick={() => 删除角色(currentNPC)}
                                                    disabled={Boolean(currentNPC.是否主要角色)}
                                                    className={`flex h-[2.7rem] w-full items-center justify-center rounded-[1.35rem] border px-4 text-sm font-serif tracking-[0.04em] transition-colors ${
                                                        currentNPC.是否主要角色
                                                            ? 'border-gray-800 text-gray-700 cursor-not-allowed bg-black/50'
                                                            : 'border-white/30 bg-black/35 text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:border-red-500 active:text-red-400 active:bg-red-500/10'
                                                    }`}
                                                >
                                                    忘却此人
                                                </button>
                                            </div>
                                        </div>
                                        {/* 详情右栏：
                                            space-y-2.5 控上方主卡和下方四张小卡之间的总间距
                                            上面是主信息卡，下面四张是身份/状态/称呼/生日小卡 */}
                                        <div className="min-w-0 space-y-2.5">
                                            {/* 主信息卡：
                                                rounded-[1.35rem] 控圆角
                                                p-3.5 控整张卡内边距
                                                这里改名字、关系框、好感框、性别/年龄框、境界框 */}
                                            <div className="rounded-[1rem] border border-wuxia-gold/18 p-2" style={右侧首卡样式}>
                                                <div className="min-w-0 w-full">
                                                    {/* 详情名字：
                                                        text-[1.5rem] 控名字字号
                                                        tracking-[0.04em] 控字间距 */}
                                                    <h2 className="truncate font-serif text-[1.5rem] font-black leading-none tracking-[0.04em]" style={标题文字样式}>
                                                        {currentNPC.姓名}
                                                    </h2>
                                                </div>
                                                {/* 关系框 + 好感框这一行：
                                                    mt-2.5 控和名字的距离
                                                    gap-2 控左右间距 */}
                                                <div className="mt-1 flex items-start justify-between gap-1">
                                                    {/* 关系状态框：
                                                        px-2.5 py-1 控框大小
                                                        text-[10px] 控字号 */}
                                                    <div className="inline-flex w-fit whitespace-nowrap items-center rounded-lg border border-wuxia-gold/20 bg-black/35 px-1 py-0.5 text-[8px] font-bold leading-none text-wuxia-gold/90">
                                                        {格式化关系状态(currentNPC.关系状态)}
                                                    </div>
                                                    {/* 好感度大框：
                                                        px-2 py-1.5 控框大小
                                                        rounded-2xl 控圆角 */}
                                                    <div className="shrink-0 rounded-2xl border border-pink-500/25 bg-pink-500/8 px-1 py-[0.49rem] text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                                        {/* 爱心行：
                                                            text-[10px] 控小字
                                                            IconHeart size={11} 控图标
                                                            text-[1rem] 控好感度数字大小 */}
                                                        <div className="inline-flex items-center gap-1 text-[10px] text-pink-300/80">
                                                            <IconHeart size={16} />
                                                            <span className="font-serif text-[1rem] font-bold text-pink-200">{currentNPC.好感度}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* 性别/年龄框 + 境界框：
                                                    mt-1.5 控与上一行距离
                                                    gap-2 控两个框之间间距 */}
                                                <div className="mt-0 flex flex-wrap gap-1">
                                                    {/* 性别/年龄框：
                                                        px-2.5 py-1 控框大小
                                                        text-[10px] 控字号 */}
                                                    <span className={`rounded-lg border px-1 py-0.5 text-[8px] leading-none ${当前角色是女性 ? 'border-pink-500/25 bg-pink-500/8 text-pink-300' : 'border-blue-500/25 bg-blue-500/8 text-blue-300'}`}>
                                                        {currentNPC.性别} | {currentNPC.年龄}岁
                                                    </span>
                                                    {显示境界 && currentNPC.境界 && (
                                                        /* 详情境界框：
                                                           px-2.5 py-1 控框大小
                                                           text-[10px] 控字号 */
                                                        <span className="rounded-lg border border-wuxia-gold/20 bg-black/35 px-1 py-0.5 text-[8px] leading-none text-wuxia-gold/90">
                                                            LV.{currentNPC.境界}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* 下方四个信息小卡：
                                                rounded-[1rem] 控小卡圆角
                                                p-1 控小卡内边距
                                                标题行改 text-[9px] 和 mb-1.5
                                                正文改 text-[1.35rem] 和 leading-tight */}
                                            <div className="rounded-[0.5rem] border border-white/10 p-1" style={右侧信息卡样式}>
                                                <div className="mb-0.5 text-[8px] tracking-[0.18em] text-gray-500">身份</div>
                                                <div className="text-[1rem] font-serif leading-tight text-gray-100">{currentNPC.身份 || '暂无记录'}</div>
                                            </div>
                                            <div className="rounded-[0.5rem] border border-white/10 p-1" style={右侧信息卡样式}>
                                                <div className="mb-0.5 text-[8px] tracking-[0.18em] text-gray-500">状态</div>
                                                <div className="text-[1rem] font-serif leading-tight text-gray-100">{当前状态文案}</div>
                                            </div>
                                            <div className="rounded-[0.5rem] border border-white/10 p-1" style={右侧信息卡样式}>
                                                <div className="mb-0.5 text-[8px] tracking-[0.18em] text-gray-500">称呼</div>
                                                <div className="text-[1rem] font-serif leading-tight text-gray-100">{当前称呼文案}</div>
                                            </div>
                                            <div className="rounded-[0.5rem] border border-white/10 p-1" style={右侧信息卡样式}>
                                                <div className="mb-0.5 text-[8px] tracking-[0.18em] text-gray-500">生日</div>
                                                <div className="text-[1rem] font-serif leading-tight text-gray-100">{当前生日文案}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Shared Bio Section */}
                                <div className="bg-black/40 p-4 border border-white/10 rounded-xl relative overflow-hidden active:border-wuxia-gold/30 transition-colors shadow-lg">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full filter blur-xl pointer-events-none"></div>
                                    <h4 className="flex items-center gap-1.5 text-wuxia-gold/80 font-serif font-bold mb-2 uppercase tracking-[0.2em] text-xs">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                        人设档案
                                    </h4>
                                    <p className="text-gray-300 font-serif leading-relaxed text-xs relative z-10">
                                        {currentNPC.简介 || "暂无详细生平记录。"}
                                    </p>
                                </div>

                                <div className="bg-black/40 border border-sky-900/30 rounded-xl p-3.5 shadow-lg">
                                    <h4 className="text-sky-300/90 font-serif font-bold mb-3 uppercase tracking-[0.18em] text-xs flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-sky-400/70"></span>
                                        基础六维与天赋
                                    </h4>
                                    <div className="mb-3 grid grid-cols-3 gap-1.5">
                                        {NPC六维属性.map(([shortLabel, label, value]) => (
                                            <div key={label} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
                                                <div className="text-[9px] tracking-[0.14em] text-gray-500">{shortLabel}</div>
                                                <div className="mt-0.5 flex items-baseline justify-between gap-1">
                                                    <span className="text-[9px] text-gray-400">{label}</span>
                                                    <span className="font-mono text-xs text-gray-100">{value}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mb-3 rounded border border-amber-500/20 bg-amber-950/10 p-2">
                                        <div className="mb-1 text-[9px] tracking-[0.18em] text-amber-300/80">出身背景</div>
                                        <div className="text-xs font-serif text-amber-100">{NPC出身背景?.名称 || '暂无记录'}</div>
                                        <div className="mt-1 text-[10px] leading-5 text-gray-300">{NPC出身背景?.效果 || NPC出身背景?.描述 || '尚未记录背景效果。'}</div>
                                    </div>
                                    <div className="mb-3 rounded border border-violet-500/20 bg-violet-950/10 p-2">
                                        <div className="mb-1 text-[9px] tracking-[0.18em] text-violet-300/80">天赋背景</div>
                                        {NPC天赋列表.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {NPC天赋列表.map((talent: any, idx: number) => (
                                                    <div key={`${talent.名称}-${idx}`} className="rounded border border-white/10 bg-black/25 px-2 py-1">
                                                        <div className="text-[10px] font-bold text-violet-100">{talent.名称}</div>
                                                        <div className="mt-0.5 text-[9px] leading-4 text-gray-300">{talent.效果 || talent.描述 || '待记录'}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <span className="text-[10px] text-gray-600">暂无天赋记录</span>}
                                    </div>
                                </div>

                                <div className="bg-black/40 border border-sky-900/30 rounded-xl p-3.5 shadow-lg">
                                    <h4 className="text-sky-300/90 font-serif font-bold mb-3 uppercase tracking-[0.18em] text-xs flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-sky-400/70"></span>
                                        技艺与随身状态
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="rounded border border-white/10 bg-black/25 p-2">
                                            <div className="mb-1.5 text-[9px] tracking-[0.18em] text-wuxia-gold/70">装备</div>
                                            <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-300">
                                                {Object.entries((currentNPC as any).当前装备 || {}).map(([key, value]) => (
                                                    <div key={key} className="flex justify-between gap-2 rounded bg-black/25 px-1.5 py-1"><span className="text-gray-500">{key}</span><span className="truncate">{String(value || '无')}</span></div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded border border-white/10 bg-black/25 p-2">
                                            <div className="mb-1.5 text-[9px] tracking-[0.18em] text-wuxia-gold/70">背包</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {读取NPC背包(currentNPC).length > 0 ? 读取NPC背包(currentNPC).map((item, idx) => (
                                                    <span key={`${item.名称}-${idx}`} className="rounded border border-gray-700 bg-black/40 px-2 py-1 text-[9px] text-gray-300">
                                                        {item.名称}{item.数量 && item.数量 > 1 ? ` x${item.数量}` : ''}
                                                    </span>
                                                )) : <span className="text-[10px] text-gray-600">暂无物品</span>}
                                            </div>
                                        </div>
                                        <div className="rounded border border-white/10 bg-black/25 p-2">
                                            <div className="mb-1.5 text-[9px] tracking-[0.18em] text-emerald-300/80">BUFF / DEBUFF</div>
                                            <div className="space-y-1 text-[9px]">
                                                {[...读取NPC状态(currentNPC, 'BUFF').map((item: any) => ({ ...item, tone: 'text-emerald-200' })), ...读取NPC状态(currentNPC, 'DEBUFF').map((item: any) => ({ ...item, tone: 'text-red-200' }))].map((item: any, idx) => (
                                                    <div key={`${item.名称}-${idx}`} className={`rounded border border-white/10 bg-black/35 px-2 py-1 ${item.tone}`}>{item.名称 || '未命名状态'} · {item.效果 || item.描述 || '待记录'}</div>
                                                ))}
                                                {读取NPC状态(currentNPC, 'BUFF').length + 读取NPC状态(currentNPC, 'DEBUFF').length <= 0 ? <span className="text-[10px] text-gray-600">暂无状态</span> : null}
                                            </div>
                                        </div>
                                        <div className="rounded border border-white/10 bg-black/25 p-2">
                                            <div className="mb-1.5 text-[9px] tracking-[0.18em] text-sky-300/80">技艺</div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {读取NPC技艺(currentNPC).map((skill: any, idx) => (
                                                    <div key={`${skill.名称}-${idx}`} className="rounded border border-sky-900/30 bg-sky-950/10 px-2 py-1">
                                                        <div className="flex items-start justify-between gap-1">
                                                            <div className="min-w-0 text-[9px] text-sky-100">{skill.名称}</div>
                                                            {onLearnSkill && 可请求学艺(skill) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onLearnSkill(currentNPC, skill)}
                                                                    className="shrink-0 rounded border border-sky-400/30 bg-sky-900/30 px-1.5 py-0.5 text-[8px] text-sky-100"
                                                                >
                                                                    学艺
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="text-[8px] text-gray-500">{skill.等级 || '未入门'} · {Number(skill.熟练度 || 0)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {展示关系驱动面板 && (
                                    <div className="bg-cyan-950/10 p-4 border border-cyan-900/40 rounded-xl shadow-lg relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-900/50 via-cyan-500/20 to-transparent"></div>
                                        <div className="flex items-center justify-between mb-3 relative z-10">
                                            <h4 className="flex items-center gap-1.5 text-cyan-400/90 font-serif font-bold uppercase tracking-widest text-xs">
                                                <span className="w-1 h-3 bg-cyan-500/50"></span>
                                                关系驱动面板
                                            </h4>
                                            <span className="text-[8px] text-cyan-500/50 tracking-widest border border-cyan-900/50 px-1 py-0.5 rounded font-mono">DYNAMIC</span>
                                        </div>
                                        {展示女性扩展 && (
                                            <div className="flex flex-col gap-2 relative z-10">
                                                <RelationTag label="核心性格特征" value={currentNPC.核心性格特征} accent="text-cyan-200" />
                                                <RelationTag label="好感突破条件" value={currentNPC.好感度突破条件} accent="text-emerald-200" />
                                                <RelationTag label="关系突破条件" value={currentNPC.关系突破条件} accent="text-amber-200" />
                                            </div>
                                        )}
                                        <div className="mt-3 p-3 border border-pink-900/30 bg-black/40 rounded-lg relative z-10">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="text-[9px] text-pink-400 uppercase tracking-widest flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                                        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                    </svg>
                                                    关系网变量
                                                </div>
                                                <div className="text-[9px] text-gray-500 font-mono text-center">共 {当前关系网.length} 名记录</div>
                                            </div>
                                            {当前关系网.length > 0 ? (
                                                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar pr-1">
                                                    {当前关系网.map((edge, idx) => (
                                                        <div key={`${edge.对象姓名}_${edge.关系}_${idx}`} className="bg-pink-950/10 border-l-2 border-pink-900/40 rounded-r p-1.5 active:bg-pink-900/20 transition-colors">
                                                            <div className="flex justify-between items-start mb-0.5">
                                                                <div className="text-[10px] text-pink-100 font-bold truncate">
                                                                    <span className="text-pink-400/60 font-normal mr-1">对象:</span>{edge.对象姓名}
                                                                </div>
                                                                <div className="text-[9px] bg-pink-900/30 px-1 py-0.5 rounded text-pink-300 whitespace-nowrap ml-1 shrink-0">
                                                                    {edge.关系}
                                                                </div>
                                                            </div>
                                                            {edge.备注 && (
                                                                <div className="text-[9px] text-pink-200/60 mt-1 leading-relaxed border-t border-pink-900/20 pt-1">{edge.备注}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-2 opacity-50">
                                                    <div className="text-[9px] font-mono text-pink-300">NO CONNECTIONS DETECTED</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Memory Lane */}
                                <div className="bg-black/40 p-4 border border-white/10 rounded-xl relative overflow-hidden shadow-lg">
                                    <h4 className="flex items-center gap-1.5 text-gray-400 font-serif font-bold mb-3 uppercase tracking-[0.2em] text-xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-gray-500">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                        </svg>
                                        共同记忆
                                    </h4>
                                    <div className="space-y-4 max-h-60 overflow-y-auto no-scrollbar pr-1">
                                        {当前记忆展示.总结记忆.length > 0 && (
                                            <div>
                                                <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-wuxia-gold/70">总结记忆</div>
                                                <div className="space-y-2">
                                                    {当前记忆展示.总结记忆.map((mem) => (
                                                        <div key={`summary-${mem.标签}`} className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-2.5">
                                                            <div className="flex flex-wrap items-center gap-1.5 text-[8px] text-wuxia-gold/80 font-mono">
                                                                <span>{mem.标签}</span>
                                                                <span>{mem.索引范围}</span>
                                                                <span>{mem.时间}</span>
                                                            </div>
                                                            <div className="mt-1.5 text-[11px] text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {当前记忆展示.记忆.length > 0 && (
                                            <div>
                                                <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-gray-500">原始记忆</div>
                                                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px before:h-full before:w-px before:bg-gradient-to-b before:from-transparent before:via-gray-800 before:to-transparent">
                                                    {当前记忆展示.记忆.slice().reverse().map((mem) => (
                                                        <div key={`memory-${mem.原始索引}`} className="relative flex items-start group is-active">
                                                            <div className="flex items-center justify-center w-2.5 h-2.5 rounded-full border border-gray-600 bg-gray-800 mt-[7px] shrink-0 z-10"></div>
                                                            <div className="w-[calc(100%-1rem)] ml-3 p-2 rounded-lg border border-white/5 bg-black/50 shadow-sm">
                                                                <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                                                                    <div className="text-[8px] text-gray-500 font-mono tracking-wider">{mem.时间}</div>
                                                                    <div className="text-[8px] text-wuxia-gold/70 font-mono">{mem.标签}</div>
                                                                </div>
                                                                <div className="text-[11px] text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {当前记忆展示.原始总数 === 0 && (
                                            <div className="text-center text-[10px] text-gray-600 py-4 uppercase tracking-widest font-mono">NO MEMORIES</div>
                                        )}
                                    </div>
                                </div>

                                {/* [DEBUG] 私密部位图片调试面板 */}
                                {currentNPC && (
                                    <details className="rounded-lg border border-yellow-600/40 bg-yellow-950/20 p-3 text-[10px] font-mono text-yellow-200/80">
                                        <summary className="cursor-pointer text-yellow-400 font-bold text-xs mb-2">🔍 私密图调试 — {currentNPC.姓名}</summary>
                                        <div className="space-y-1 mt-2">
                                            <div>nsfwEnabled: <b className={nsfwEnabled ? 'text-green-400' : 'text-red-400'}>{String(nsfwEnabled)}</b> | femboyNsfwEnabled: <b className={femboyNsfwEnabled ? 'text-green-400' : 'text-red-400'}>{String(femboyNsfwEnabled)}</b></div>
                                            <div>性别: <b>{currentNPC.性别}</b> | 主要角色: <b className={currentNPC?.是否主要角色 ? 'text-green-400' : 'text-red-400'}>{String(currentNPC?.是否主要角色)}</b></div>
                                            <div>女性: <b className={当前角色是女性 ? 'text-green-400' : 'text-gray-500'}>{String(当前角色是女性)}</b> | 男性: <b className={当前角色是男性 ? 'text-green-400' : 'text-gray-500'}>{String(当前角色是男性)}</b> | 扶她: <b className={当前角色是扶她 ? 'text-green-400' : 'text-gray-500'}>{String(当前角色是扶她)}</b></div>
                                            <div>女性扩展: <b className={展示女性扩展 ? 'text-green-400' : 'text-red-400'}>{String(展示女性扩展)}</b> | 女性私密: <b className={展示女性私密档案 ? 'text-green-400' : 'text-red-400'}>{String(展示女性私密档案)}</b> | 男性私密: <b className={展示男性私密档案 ? 'text-green-400' : 'text-red-400'}>{String(展示男性私密档案)}</b></div>
                                            <div className="border-t border-yellow-600/30 pt-1 mt-1">
                                                {(['胸部', '小穴', '屁穴', '肉棒'] as 香闺秘档部位类型[]).map(part => {
                                                    const result = 读取香闺秘档图片结果(currentNPC, part);
                                                    const url = 获取图片展示地址(result);
                                                    const raw = (currentNPC as any)?.图片档案?.香闺秘档部位档案?.[part];
                                                    return (
                                                        <div key={part} className="flex items-center gap-2 py-0.5">
                                                            <span className="text-yellow-400 w-10">{part}:</span>
                                                            <span className={url ? 'text-green-400' : 'text-red-400'}>{url ? '有图' : '无图'}</span>
                                                            {raw && <span className="text-gray-500">状态={raw?.状态 || '?'}</span>}
                                                            {raw?.图片URL && <span className="text-gray-600 truncate max-w-[120px]" title={raw.图片URL}>{raw.图片URL.slice(0, 35)}...</span>}
                                                            {!raw && <span className="text-gray-600">无记录</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </details>
                                )}
                                {/* Female Expansions */}
                                {展示女性扩展 ? (
                                    <div className="space-y-4 animate-fadeIn">
                                        {/* Appearance Section */}
                                        <div className="bg-gradient-to-br from-pink-950/10 to-black/60 p-4 border border-pink-900/30 rounded-xl relative overflow-hidden shadow-lg group">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full filter blur-xl transition-colors pointer-events-none"></div>
                                            <div className="absolute -bottom-2 -right-2 text-[60px] text-pink-500/5 font-serif pointer-events-none select-none">颜</div>
                                            
                                            <h4 className="flex items-center gap-1.5 text-pink-300/80 font-serif font-bold mb-2.5 uppercase tracking-widest text-xs relative z-10">
                                                <span className="w-1.5 h-1.5 rounded-full bg-pink-400/50"></span>
                                                绝世容颜
                                            </h4>
                                            
                                            <div className="relative z-10">
                                                <div className="mb-3 pl-2.5 border-l-2 border-pink-500/30">
                                                    <p className="text-gray-200 font-serif leading-relaxed italic text-[11px]">"{读取外貌(currentNPC) || '暂无外貌描写'}"</p>
                                                </div>
                                                <div className="flex flex-col gap-1.5 text-[10px] text-gray-400 bg-black/40 p-2.5 rounded-lg border border-white/5">
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        <div className="flex items-start gap-1.5">
                                                            <span className="text-pink-400/70 shrink-0 mt-px">生日</span>
                                                            <span className="text-gray-300 leading-relaxed">{读取生日(currentNPC) || '暂无记录'}</span>
                                                        </div>
                                                        <div className="flex items-start gap-1.5">
                                                            <span className="text-pink-400/70 shrink-0 mt-px">称呼</span>
                                                            <span className="text-gray-300 leading-relaxed">{读取对主角称呼(currentNPC) || '暂无记录'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-1.5">
                                                        <span className="text-pink-400/70 shrink-0 mt-px">身材</span>
                                                        <span className="text-gray-300 leading-relaxed">{读取身材(currentNPC) || '暂无记录'}</span>
                                                    </div>
                                                    <div className="flex items-start gap-1.5">
                                                        <span className="text-pink-400/70 shrink-0 mt-px">衣着</span>
                                                        <span className="text-gray-300 leading-relaxed">{读取衣着(currentNPC) || '暂无记录'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {展示女性私密档案 && (
                                        <div className="relative bg-black/40 border border-pink-900/40 rounded-xl p-4 shadow-lg active:border-pink-900/60 transition-colors">
                                            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-pink-900/50 via-pink-500/20 to-transparent"></div>
                                            <div className="flex items-center justify-between mb-4 relative z-10">
                                                <h4 className="text-pink-400 font-serif font-bold text-xs flex items-center gap-1.5 tracking-widest">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                                        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                    </svg>
                                                    香闺秘档
                                                    <span className="text-[7px] bg-pink-950/50 border border-pink-500/30 px-1 py-0.5 rounded text-pink-300/80 font-mono ml-1">TOP SECRET</span>
                                                </h4>
                                                {currentNPC.是否处女 && (
                                                    <span className="text-[8px] bg-pink-500/10 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30 flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-pink-400 animate-pulse"></span>
                                                        守身如玉
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* SPECIAL EVENT: FIRST TIME TAKEN BY PLAYER */}
                                             {!currentNPC.是否处女 && currentNPC.初夜夺取者 === playerName && (
                                                <div className="mb-4 p-3 bg-gradient-to-r from-pink-950/80 to-black border border-pink-500/40 rounded-lg relative overflow-hidden">
                                                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-wuxia-gold/5 blur-xl"></div>
                                                    <div className="relative z-10 flex flex-col">
                                                        <div className="flex items-center gap-1.5 mb-1.5">
                                                            <div className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/80"></div>
                                                            <div className="text-[9px] text-pink-300/80 tracking-widest uppercase">铭心刻骨 · 初夜</div>
                                                        </div>
                                                        <div className="font-serif text-pink-100 text-[11px] flex items-end gap-1.5 flex-wrap">
                                                            <span className="text-wuxia-gold/80 text-[10px] font-mono bg-wuxia-gold/10 px-1 rounded border border-wuxia-gold/20 mr-1">{currentNPC.初夜时间}</span>
                                                            <span>交给</span>
                                                            <span className="text-wuxia-gold font-bold text-base drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]">{currentNPC.初夜夺取者}</span>
                                                            {currentNPC.初夜描述 && (
                                                                <span title={currentNPC.初夜描述} className="rounded border border-pink-500/30 px-1 py-0.5 text-[8px] text-pink-200/80">详情</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                 </div>
                                             )}

                                             <首次亲密档案框 />

                                             <div className="flex flex-col gap-2 mb-4">
                                                {香闺部位列表.map((item) => {
                                                    const result = 读取香闺秘档图片结果(currentNPC, item.key);
                                                    const imageUrl = 获取图片展示地址(result);
                                                    const modeKey = 生成香闺部位键(currentNPC.id, item.key);
                                                    const canShowImage = Boolean(imageUrl);
                                                    const mode = 香闺展示模式[modeKey] || (canShowImage ? 'image' : 'text');
                                                    const handleToggleMode = () => {
                                                        if (!canShowImage) return;
                                                        set香闺展示模式(prev => ({ ...prev, [modeKey]: mode === 'image' ? 'text' : 'image' }));
                                                    };
                                                    return (
                                                        <div key={item.key} className="p-2.5 rounded-lg border bg-black/60 border-pink-900/30 active:border-pink-700/50 transition-colors flex gap-3">
                                                            <div className="flex flex-col items-center gap-1.5 shrink-0 justify-center min-w-[3.5rem] border-r border-pink-900/30 pr-3 mr-1">
                                                                <div className="text-[10px] text-pink-400 tracking-widest font-bold whitespace-nowrap">{item.label}</div>
                                                                <button
                                                                    type="button"
                                                                    disabled={!canShowImage}
                                                                    onClick={handleToggleMode}
                                                                    className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${canShowImage ? 'border-pink-500/50 text-pink-300 active:bg-pink-500/20' : 'border-gray-800 text-gray-600'}`}
                                                                >
                                                                    {canShowImage ? (mode === 'image' ? '看文' : '看图') : '无图'}
                                                                </button>
                                                            </div>
                                                            <div className={`flex-1 overflow-hidden rounded bg-black/40 border border-white/5 relative ${mode === 'image' && canShowImage ? 'aspect-[4/3]' : ''}`}>
                                                                {mode === 'image' && canShowImage ? (
                                                                    <button
                                                                        type="button"
                                                                        className="absolute inset-0 block w-full h-full"
                                                                        onClick={() => 打开图片查看器(imageUrl, `${currentNPC.姓名}${item.label}特写`)}
                                                                    >
                                                                        <img src={imageUrl} alt={`${currentNPC.姓名}${item.label}特写`} className="absolute inset-0 w-full h-full object-cover" />
                                                                    </button>
                                                                ) : (
                                                                    <div className="p-2 py-1 max-h-24 overflow-y-auto no-scrollbar">
                                                                        <名器标签框 part={item.key} />
                                                                        <p className="font-serif leading-relaxed text-[11px] text-pink-100/90 italic">
                                                                            {item.text}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mb-4">
                                                <PrivateTag label="性癖" value={读取性癖(currentNPC) || '暂无记录'} color="text-pink-400" />
                                                <PrivateTag label="敏感点" value={读取敏感点(currentNPC) || '暂无记录'} color="text-red-400" />
                                            </div>

                                            {/* Womb & Pregnancy Records */}
                                            <div className="bg-gradient-to-br from-pink-950/20 to-black/80 border border-pink-900/30 rounded-lg p-3.5 relative overflow-hidden group">
                                                <div className="absolute -top-6 -right-6 w-20 h-20 bg-pink-600/5 rounded-full filter blur-xl pointer-events-none"></div>
                                                <div className="flex items-center justify-between mb-2.5 relative z-10">
                                                    <h5 className="text-[11px] text-pink-400/90 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                        <span className="w-1 h-3 bg-pink-500/70 rounded-full"></span>
                                                        子宫档案
                                                    </h5>
                                                    <span className="text-[8px] bg-black/60 border border-pink-900/50 px-1 py-0.5 rounded text-pink-300 font-mono shadow-inner tracking-wider">
                                                        ST: {当前子宫档案?.状态 || 'UKN'}
                                                    </span>
                                                </div>
                                                
                                                <div className="mb-3 text-[10px] text-gray-400/80 flex items-center gap-2 bg-black/40 p-2 rounded border border-white/5 relative z-10">
                                                    <span className="shrink-0 text-pink-500/50">宫口状态</span>
                                                    <span className="text-pink-200 font-serif">{当前子宫档案?.宫口状态 || '紧闭'}</span>
                                                </div>

                                                <div className="relative z-10">
                                                    <h6 className="text-[8px] text-pink-500/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                        <span className="h-px flex-1 bg-pink-900/30"></span>
                                                        内射记录
                                                        <span className="h-px flex-1 bg-pink-900/30"></span>
                                                    </h6>
                                                    <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-1">
                                                        {Array.isArray(当前子宫档案?.内射记录) && 当前子宫档案!.内射记录.length > 0 ? (
                                                            当前子宫档案!.内射记录.map((rec, idx) => (
                                                                <div key={idx} className="bg-black/60 p-2.5 rounded border border-pink-900/20 text-[10px] relative overflow-hidden">
                                                                    <div className="text-wuxia-gold/80 font-mono text-[9px] mb-1">[{rec.日期}]</div>
                                                                    <div className="text-pink-100/90 font-serif leading-relaxed mb-1.5">{rec.描述}</div>
                                                                    <div className="text-[8px] text-pink-400/60 flex items-center gap-1 pt-1 border-t border-pink-900/20">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-2.5 h-2.5">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                                        </svg>
                                                                        孕检期: {rec.怀孕判定日}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center py-4 bg-black/20 rounded border border-dashed border-white/5">
                                                                <span className="text-[9px] text-gray-600 font-mono tracking-widest">NO RECORDS</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                ) : 展示男性私密档案 ? (
                                    <div className="space-y-4 animate-fadeIn">
                                        <div className="bg-gradient-to-br from-sky-950/20 to-black/60 p-4 border border-sky-700/40 rounded-xl relative overflow-hidden shadow-lg">
                                            <h4 className="flex items-center gap-1.5 text-sky-200 font-serif font-bold mb-2.5 uppercase tracking-widest text-xs">
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-300/70"></span>
                                                男性秘档
                                            </h4>
                                            <div className="space-y-3">
                                                <PrivateTag label="男娘设定" value={读取男娘设定(currentNPC) || '暂无记录'} color="text-sky-300" />
                                                <PrivateTag label="扶她设定" value={读取扶她设定(currentNPC) || '暂无记录'} color="text-sky-300" />
                                                <首次亲密档案框 />
                                                <div className="flex flex-col gap-2">
                                                    {香闺部位列表.map((item) => {
                                                        const result = 读取香闺秘档图片结果(currentNPC, item.key);
                                                        const imageUrl = 获取图片展示地址(result);
                                                        const modeKey = 生成香闺部位键(currentNPC.id, item.key);
                                                        const canShowImage = Boolean(imageUrl);
                                                        const mode = 香闺展示模式[modeKey] || (canShowImage ? 'image' : 'text');
                                                        return (
                                                            <div key={item.key} className="p-2.5 rounded-lg border bg-black/60 border-sky-800/45 flex gap-3">
                                                                <div className="flex flex-col items-center gap-1.5 shrink-0 justify-center min-w-[3.5rem] border-r border-sky-800/45 pr-3 mr-1">
                                                                    <div className="text-[10px] text-sky-200 tracking-widest font-bold whitespace-nowrap">{item.label}</div>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!canShowImage}
                                                                        onClick={() => canShowImage && set香闺展示模式(prev => ({ ...prev, [modeKey]: mode === 'image' ? 'text' : 'image' }))}
                                                                        className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${canShowImage ? 'border-sky-500/60 text-sky-200 active:bg-sky-500/20' : 'border-gray-800 text-gray-600'}`}
                                                                    >
                                                                        {canShowImage ? (mode === 'image' ? '看文' : '看图') : '无图'}
                                                                    </button>
                                                                </div>
                                                                <div className={`flex-1 overflow-hidden rounded bg-black/40 border border-white/5 relative ${mode === 'image' && canShowImage ? 'aspect-[4/3]' : ''}`}>
                                                                    {mode === 'image' && canShowImage ? (
                                                                        <button type="button" className="absolute inset-0 block w-full h-full" onClick={() => 打开图片查看器(imageUrl, `${currentNPC.姓名}${item.label}特写`)}>
                                                                            <img src={imageUrl} alt={`${currentNPC.姓名}${item.label}特写`} className="absolute inset-0 w-full h-full object-cover" />
                                                                        </button>
                                                                    ) : (
                                                                        <div className="p-2 py-1 max-h-24 overflow-y-auto no-scrollbar">
                                                                            <p className="font-serif leading-relaxed text-[11px] text-sky-100/90 italic">{item.text}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <PrivateTag label="性癖" value={读取性癖(currentNPC) || '暂无记录'} color="text-pink-400" />
                                                    <PrivateTag label="敏感点" value={读取敏感点(currentNPC) || '暂无记录'} color="text-red-400" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-55 bg-black/20 rounded-xl border border-dashed border-white/10 p-6 text-center mt-4">
                                        <div className="text-3xl mb-3 font-serif text-wuxia-gold/50 inline-flex">
                                            {当前角色是女性 ? <IconHeart size={30} /> : <IconMars size={30} />}
                                        </div>
                                        <div className="text-xs font-serif text-gray-500 tracking-widest uppercase">
                                            {当前角色是女性 ? '女性扩展档案待激活' : '资料封存'}
                                        </div>
                                        <div className="text-[8px] text-gray-600 mt-1 font-mono">
                                            {当前角色是女性 ? 'SET AS IMPORTANT TO UNLOCK EXTENDED PROFILE' : 'CONFIDENTIAL INFO NOT AVAILABLE'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 font-serif w-full absolute inset-0 z-10 pt-20">
                                <IconScroll size={52} className="mb-4 opacity-20 text-wuxia-gold filter drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
                                <span className="text-lg tracking-[0.4em] text-wuxia-gold/80 uppercase">请选择人物档案</span>
                                <span className="text-[8px] font-mono mt-3 opacity-50 border border-white/10 px-2 py-0.5 rounded">SELECT ROSTER PROFILE</span>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </div>
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[260] bg-black/95 backdrop-blur-sm flex items-center justify-end p-3 pr-8 animate-fadeIn"
                    onClick={关闭图片查看器}
                >
                    <button
                        type="button"
                        className="fixed right-3 top-3 z-[285] flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-red-600/95 text-white shadow-[0_0_24px_rgba(220,38,38,0.95)] backdrop-blur-md transition-transform active:scale-95"
                        onClick={(event) => {
                            event.stopPropagation();
                            关闭图片查看器();
                        }}
                        aria-label="关闭图片预览"
                        title="关闭图片预览"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div className="fixed right-3 top-[4.5rem] z-[285] flex overflow-hidden rounded-full border border-white/20 bg-black/75 text-xs text-white shadow-lg backdrop-blur-md" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="px-3 py-2 active:bg-white/15" onClick={() => 调整图片缩放(-0.25)} aria-label="缩小图片">-</button>
                        <button type="button" className="border-x border-white/15 px-3 py-2 active:bg-white/15" onClick={() => setImageViewerZoom(1)} aria-label="重置缩放">{Math.round(imageViewerZoom * 100)}%</button>
                        <button type="button" className="px-3 py-2 active:bg-white/15" onClick={() => 调整图片缩放(0.25)} aria-label="放大图片">+</button>
                    </div>
                    <div
                        className="relative flex h-[92vh] w-[85vw] items-center justify-end overflow-auto rounded-lg border border-wuxia-gold/20 shadow-[0_0_40px_rgba(212,175,55,0.18)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <img
                            src={imageViewer.src}
                            alt={imageViewer.alt}
                            className="max-w-[85vw] max-h-[92vh] object-contain bg-black transition-transform duration-150 origin-center"
                            style={{ transform: `scale(${imageViewerZoom})` }}
                        />
                    </div>
                </div>
            )}
            {imageRetryTarget && (
                <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm" onClick={() => setImageRetryTarget(null)}>
                    <div className="w-full max-w-sm rounded-2xl border border-wuxia-gold/30 bg-[#120d09] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)]" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <div className="text-base font-bold text-wuxia-gold">选择重绘构图</div>
                                <div className="mt-1 text-[11px] text-gray-400">当前角色：{imageRetryTarget.姓名 || '未命名NPC'}</div>
                            </div>
                            <button type="button" className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-gray-300 active:border-red-400/50 active:text-red-200" onClick={() => setImageRetryTarget(null)}>关闭</button>
                        </div>
                        <div className="grid gap-2">
                            {NPC重绘构图选项.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all active:border-wuxia-gold/50 active:bg-wuxia-gold/10"
                                    onClick={() => 提交重绘选择(option.value)}
                                >
                                    <div className="text-sm font-bold text-gray-100">{option.label}</div>
                                    <div className="mt-1 text-[11px] leading-relaxed text-gray-400">{option.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileSocial;
