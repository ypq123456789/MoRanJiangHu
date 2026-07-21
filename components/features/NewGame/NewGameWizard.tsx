import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameButton from '../../ui/GameButton';
import { 接口设置结构, OpeningConfig, WorldGenConfig, 小说拆分数据集结构, 角色数据结构, 天赋结构, 背景结构, 游戏难度, 初始伙伴配置结构, 世界书结构 } from '../../../types';
import { 预设天赋, 预设背景, 获取题材预设天赋, 获取题材预设背景 } from '../../../data/presets';
import type { 开局预设方案结构 } from '../../../data/newGamePresets';
import { 从模式世界书提取提示词, type 创意工坊模块条目, type 创意工坊模块类型, type 创意工坊世界细节生成配置 } from '../../../data/creativeWorkshopModules';
import type { CurrencySystem, 题材模式类型 } from '../../../models/system';
import { OrnateBorder } from '../../ui/decorations/OrnateBorder';
import InlineSelect from '../../ui/InlineSelect';
import NewGameDiyTools from './NewGameDiyTools';
import GeneratedGenderSelector from './GeneratedGenderSelector';
import NewGameCurrencySystemSetup from './NewGameCurrencySystemSetup';
import * as dbService from '../../../services/dbService';
import { 读取小说拆分数据集列表 } from '../../../services/novelDecompositionStore';
import { 合并去重开局预设方案, 标准化开局预设方案, 生成自定义开局预设ID, 自定义开局预设存储键, 构建开局运行时快照, 构建预设表单恢复结果, 构建预设直开恢复结果, 获取快速重开运行时恢复参数 } from '../../../utils/customNewGamePresets';
import {
    获取题材关系侧重选项,
    获取题材开局切入偏好选项,
    获取题材开局配置文案,
    同人来源类型选项,
    同人融合强度选项,
    题材模式选项,
    属性最大值,
    属性最小值,
    创建平均属性分配,
    创建默认属性分配,
    创建随机属性分配,
    新开局步骤定义列表,
    默认初始伙伴配置,
    默认开局配置,
    默认开局时间,
    获取题材化难度设定,
    获取难度总属性点,
    获取同人角色替换规则列表,
    格式化角色替换规则摘要,
    规范化开局生成性别列表,
    规范化开局配置,
    规范化可选开局配置
} from '../../../utils/openingConfig';
import {
    合并题材世界默认值,
    创建主题默认世界配置,
    获取创意工坊角色默认值,
    获取创意工坊难度选项,
    获取创意工坊世界规模选项,
    清理官方题材手动提示词残留,
    题材模式顺序
} from '../../../utils/workshopEngine';
import { 构建官方模式运行时配置, 构建货币系统模板, 规范化模式运行时配置 } from '../../../utils/modeRuntimeProfile';
import { 解析生效题材配置 } from '../../../utils/effectiveTopicProfile';
import { 构建题材显示摘要 } from '../../../utils/topicModeDisplay';
import { 构建默认技艺 } from '../../../utils/skillDefaults';
import { 默认境界母板提示词 } from '../../../prompts/runtime/fandom';
import { 设置键 } from '../../../utils/settingsSchema';
import { 根据名称映射天赋抽卡, 根据名称映射抽卡, 补全天赋抽卡名称列表, 补全抽卡名称列表, 天赋抽卡数量, 出身抽卡数量, 抽取天赋卡牌, 抽取卡牌 } from '../../../utils/talentDraw';
import {
    过滤可见天赋,
    过滤玩家可自选天赋,
    合并玩家与背景天赋,
    是否允许玩家自选天赋,
    报告背景自带天赋解析缺失
} from '../../../utils/backgroundTalentBinding';
import { 构建开局世界观生成提示词预览 } from '../../../utils/worldGenerationPromptPreview';
import { normalizeWorldMapDraft } from '../../../utils/newGameDiy';
import { 获取主剧情接口配置, 接口配置是否可用 } from '../../../utils/apiConfig';
import { 请求模型文本 } from '../../../services/ai/chatCompletionClient';
import { 下载创意工坊模块, 列出创意工坊模块, 读取本地创意工坊模块 } from '../../../services/creativeWorkshop';

interface Props {
    onComplete: (
        worldConfig: WorldGenConfig, 
        charData: 角色数据结构, 
        openingConfig: OpeningConfig | undefined,
        mode: 'all' | 'step',
        openingStreaming: boolean,
        openingExtraPrompt?: string,
        activeModuleExtraRules?: string
    ) => void;
    onCancel: () => void;
    loading: boolean;
    apiConfig?: 接口设置结构;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    isStreamingDefault?: boolean;
}

const STEP_CONFIGS = [...新开局步骤定义列表];
const STEPS = STEP_CONFIGS.map((item) => item.label);
type 新开局步骤ID = typeof STEP_CONFIGS[number]['id'];
const 查找新开局步骤索引 = (id: 新开局步骤ID): number => {
    const index = STEP_CONFIGS.findIndex((item) => item.id === id);
    return index >= 0 ? index : 0;
};
const 自定义天赋存储键 = 设置键.自定义天赋;
const 自定义背景存储键 = 设置键.自定义背景;
type 自定义开局预设元信息 = {
    名称: string;
    简介: string;
};
type 货币偏好 = 'follow_mode' | 'custom' | 'legacy';
type 属性结构 = {
    力量: number;
    敏捷: number;
    体质: number;
    根骨: number;
    悟性: number;
    福源: number;
};
const 难度下拉选项 = 获取创意工坊难度选项() as Array<{ value: 游戏难度; label: string }>;
const 世界版图下拉选项 = 获取创意工坊世界规模选项() as Array<{ value: WorldGenConfig['worldSize']; label: string }>;
const 创意工坊类型标签: Record<创意工坊模块类型, string> = {
    topic: '模式包',
    world_rules: '世界规则',
    opening: '开局配置',
    ability: '能力体系',
    comfy_workflow: 'ComfyUI 工作流',
    tavern_preset: '酒馆预设'
};

const 读取模块世界细节生成配置 = (module: 创意工坊模块条目): 创意工坊世界细节生成配置 => {
    const payload = module.payload as any;
    const raw = module.worldDetailGeneration || payload?.worldDetailGeneration;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { aiGenerate: true };
    }
    return {
        aiGenerate: raw.aiGenerate !== false,
        importantPeople: typeof raw.importantPeople === 'string' ? raw.importantPeople.trim() : '',
        importantFactions: typeof raw.importantFactions === 'string' ? raw.importantFactions.trim() : '',
        mapDesign: typeof raw.mapDesign === 'string' ? raw.mapDesign.trim() : '',
        mapDiyDraft: raw.mapDiyDraft && typeof raw.mapDiyDraft === 'object' && !Array.isArray(raw.mapDiyDraft)
            ? normalizeWorldMapDraft(raw.mapDiyDraft)
            : undefined
    };
};

const 渲染模块世界细节要求 = (config: 创意工坊世界细节生成配置): string => {
    if (config.aiGenerate) return '';
    return [
        '【创意工坊自定义世界细节】',
        '该模式包要求优先使用贡献者自定义的重要人物、重要势力和地图分布；AI 只能补齐空白与细节，不得另起一套核心世界骨架。',
        config.importantPeople ? `【重要人物】\n${config.importantPeople}` : '',
        config.importantFactions ? `【重要势力/宗门/组织】\n${config.importantFactions}` : '',
        config.mapDesign ? `【地图层级与地图块介绍】\n${config.mapDesign}` : ''
    ].filter(Boolean).join('\n\n');
};
type DropdownProps = {
    value: number;
    options: number[];
    suffix: string;
    open: boolean;
    onToggle: () => void;
    onSelect: (next: number) => void;
    containerRef: React.RefObject<HTMLDivElement>;
};

const CompactDropdown: React.FC<DropdownProps> = ({
    value,
    options,
    suffix,
    open,
    onToggle,
    onSelect,
    containerRef,
}) => (
    <div className="relative" ref={containerRef}>
        <button
            type="button"
            onClick={onToggle}
            className="w-full bg-black/40 border border-gray-600 p-3 text-white outline-none focus:border-wuxia-gold rounded-md flex items-center justify-between gap-2"
        >
            <span className="font-mono text-sm">{value}{suffix}</span>
            <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
        </button>
        {open && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-black/95 border border-gray-700 rounded-md shadow-[0_12px_30px_rgba(0,0,0,0.6)] z-50">
                <div className="max-h-[336px] overflow-y-auto custom-scrollbar py-1">
                    {options.map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onSelect(opt)}
                            className={`w-full px-3 h-7 flex items-center text-sm font-mono transition-colors ${
                                opt === value ? 'bg-wuxia-gold/20 text-wuxia-gold' : 'text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            {opt}{suffix}
                        </button>
                    ))}
                </div>
            </div>
        )}
    </div>
);

const 开关按钮: React.FC<{
    checked: boolean;
    label: string;
    onToggle: () => void;
}> = ({ checked, label, onToggle }) => (
    <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm transition-all ${
            checked
                ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold'
                : 'border-gray-700 bg-black/30 text-gray-300 hover:border-wuxia-gold/35'
        }`}
    >
        <span
            className={`h-2.5 w-2.5 rounded-full transition-all ${
                checked ? 'bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.65)]' : 'bg-gray-600'
            }`}
        />
        <span>{label}</span>
    </button>
);

const NewGameWizard: React.FC<Props> = ({ onComplete, onCancel, loading, apiConfig, requestConfirm, isStreamingDefault = true }) => {
    const [step, setStep] = useState(0);
    const 角色默认值 = useMemo(() => 获取创意工坊角色默认值(), []);
    const effectiveOpeningStreaming = isStreamingDefault !== false;

    // --- State: World Config ---
    const [worldConfig, setWorldConfig] = useState<WorldGenConfig>(() => 创建主题默认世界配置('武侠'));

    // --- State: Character Config ---
    const [charName, setCharName] = useState('');
    const [charGender, setCharGender] = useState(角色默认值.gender);
    const [charAge, setCharAge] = useState(角色默认值.age);
    const [charAppearance, setCharAppearance] = useState(角色默认值.appearance);
    const [charPersonality, setCharPersonality] = useState(角色默认值.personality);
    const [charAvatarUrl, setCharAvatarUrl] = useState('');
    const [charPortraitUrl, setCharPortraitUrl] = useState('');
    const [birthMonth, setBirthMonth] = useState(角色默认值.birthMonth);
    const [birthDay, setBirthDay] = useState(角色默认值.birthDay);
    const [monthOpen, setMonthOpen] = useState(false);
    const [dayOpen, setDayOpen] = useState(false);
    const monthRef = useRef<HTMLDivElement>(null);
    const dayRef = useRef<HTMLDivElement>(null);
    const manualWorldPromptInputRef = useRef<HTMLInputElement>(null);
    const manualRealmPromptInputRef = useRef<HTMLInputElement>(null);
    
    const [stats, setStats] = useState<属性结构>(创建默认属性分配);
    const [openingConfig, setOpeningConfig] = useState<OpeningConfig>(默认开局配置);
    const [openingConfigEnabled, setOpeningConfigEnabled] = useState(true);
    const [partnerEnabled, setPartnerEnabled] = useState(true);
    const [partnerName, setPartnerName] = useState('');
    const [partnerGender, setPartnerGender] = useState('女');
    const [partnerAge, setPartnerAge] = useState(18);
    const [partnerBirthMonth, setPartnerBirthMonth] = useState(1);
    const [partnerBirthDay, setPartnerBirthDay] = useState(1);
    const [partnerAppearance, setPartnerAppearance] = useState('眉眼清亮，衣着利落，随身带着惯用行囊。');
    const [partnerPersonality, setPartnerPersonality] = useState('稳重可靠，重诺守信，遇事会主动提醒主角风险。');
    const [partnerAvatarUrl, setPartnerAvatarUrl] = useState('');
    const [partnerPortraitUrl, setPartnerPortraitUrl] = useState('');
    const [partnerRelation, setPartnerRelation] = useState('自幼相识的同行伙伴');
    const [partnerNote, setPartnerNote] = useState('');
    const [partnerStats, setPartnerStats] = useState<属性结构>(创建默认属性分配);
    const [partnerBackground, setPartnerBackground] = useState<背景结构>(预设背景[0]);
    const [partnerTalents, setPartnerTalents] = useState<天赋结构[]>([]);
    const [partnerList, setPartnerList] = useState<初始伙伴配置结构[]>(() => [默认初始伙伴配置()]);
    const [activePartnerIndex, setActivePartnerIndex] = useState(0);

    // Talents & Background
    const [selectedBackground, setSelectedBackground] = useState<背景结构>(预设背景[0]);
    const [出身选择模式, set出身选择模式] = useState<'抽卡' | '列表'>('抽卡');
    const [出身抽卡名称列表, set出身抽卡名称列表] = useState<string[]>([]);
    const [出身抽卡轮次, set出身抽卡轮次] = useState(1);
    const [出身已重Roll次数, set出身已重Roll次数] = useState(0);
    const [selectedTalents, setSelectedTalents] = useState<天赋结构[]>([]);
    const [天赋选择模式, set天赋选择模式] = useState<'抽卡' | '列表'>('抽卡');
    const [天赋抽卡名称列表, set天赋抽卡名称列表] = useState<string[]>([]);
    const [天赋抽卡轮次, set天赋抽卡轮次] = useState(1);
    const [天赋已重Roll次数, set天赋已重Roll次数] = useState(0);
    const [自定义天赋列表, 设置自定义天赋列表] = useState<天赋结构[]>([]);
    const [自定义背景列表, 设置自定义背景列表] = useState<背景结构[]>([]);
    const [模式包天赋列表, 设置模式包天赋列表] = useState<天赋结构[]>([]);
    const [模式包背景列表, 设置模式包背景列表] = useState<背景结构[]>([]);
    const [模式包世界书列表, 设置模式包世界书列表] = useState<世界书结构[]>([]);
    const [自定义开局预设列表, 设置自定义开局预设列表] = useState<开局预设方案结构[]>([]);
    const [小说拆分数据集列表, 设置小说拆分数据集列表] = useState<小说拆分数据集结构[]>([]);
    const [创意工坊模块列表, 设置创意工坊模块列表] = useState<创意工坊模块条目[]>([]);
    const [已选创意工坊模式, 设置已选创意工坊模式] = useState<题材模式类型 | ''>('');
    const [已选创意工坊子项, 设置已选创意工坊子项] = useState<Partial<Record<创意工坊模块类型, string>>>({});
    const [创意工坊注入状态, 设置创意工坊注入状态] = useState('');
    const [创意工坊注入中, 设置创意工坊注入中] = useState(false);
    const [activeModuleExtraRules, setActiveModuleExtraRules] = useState('');
    const [货币偏好, 设置货币偏好] = useState<货币偏好>('follow_mode');

    // Custom Inputs
    const [customTalent, setCustomTalent] = useState<天赋结构>({ 名称: '', 描述: '', 效果: '' });
    const [showCustomTalent, setShowCustomTalent] = useState(false);
    const [正在编辑天赋名, set正在编辑天赋名] = useState('');
    const [customBackground, setCustomBackground] = useState<背景结构>({ 名称: '', 描述: '', 效果: '' });
    const [showCustomBackground, setShowCustomBackground] = useState(false);
    const [正在编辑背景名, set正在编辑背景名] = useState('');
    const [showCustomPresetEditor, setShowCustomPresetEditor] = useState(false);
    const [正在编辑开局预设ID, set正在编辑开局预设ID] = useState('');
    const [customPresetMeta, setCustomPresetMeta] = useState<自定义开局预设元信息>({ 名称: '', 简介: '' });
    const [openingExtraRequirement, setOpeningExtraRequirement] = useState('');
    const [显示世界观生成提示词, set显示世界观生成提示词] = useState(false);
    const [世界观生成提示词状态, set世界观生成提示词状态] = useState('');
    const 世界观请求模式 = worldConfig.worldExtraRequirement.trim() ? 'AI 细化世界观' : 'AI 生成世界观';
    const [aiFrameworkStatus, setAiFrameworkStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

    // --- Logic ---
    const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
    const 标准化天赋 = (raw: 天赋结构): 天赋结构 | null => {
        const 名称 = raw?.名称?.trim() || '';
        const 描述 = raw?.描述?.trim() || '';
        const 效果 = raw?.效果?.trim() || '';
        if (!名称 || !描述 || !效果) return null;
        const 叙事约束 = typeof raw?.叙事约束 === 'string' ? raw.叙事约束.trim() : '';
        return {
            名称,
            描述,
            效果,
            ...(叙事约束 ? { 叙事约束 } : {}),
            ...(raw?.隐藏 === true ? { 隐藏: true } : {})
        };
    };
    const 标准化背景 = (raw: 背景结构): 背景结构 | null => {
        const 名称 = raw?.名称?.trim() || '';
        const 描述 = raw?.描述?.trim() || '';
        const 效果 = raw?.效果?.trim() || '';
        if (!名称 || !描述 || !效果) return null;
        const 自带天赋 = Array.isArray(raw?.自带天赋)
            ? raw.自带天赋.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
            : undefined;
        return {
            名称,
            描述,
            效果,
            初始物品: raw.初始物品,
            可选初始物品: raw.可选初始物品,
            开局货币: raw.开局货币,
            ...(自带天赋 && 自带天赋.length > 0 ? { 自带天赋 } : {})
        };
    };
    const 合并去重天赋 = (rawList: 天赋结构[]): 天赋结构[] => {
        const map = new Map<string, 天赋结构>();
        rawList.forEach((item) => {
            const normalized = 标准化天赋(item);
            if (!normalized) return;
            map.set(normalized.名称, normalized);
        });
        return Array.from(map.values());
    };
    const 合并去重背景 = (rawList: 背景结构[]): 背景结构[] => {
        const map = new Map<string, 背景结构>();
        rawList.forEach((item) => {
            const normalized = 标准化背景(item);
            if (!normalized) return;
            map.set(normalized.名称, normalized);
        });
        return Array.from(map.values());
    };
    const 当前题材预设背景 = useMemo(() => 获取题材预设背景(openingConfig.题材模式), [openingConfig.题材模式]);
    const 当前题材预设天赋 = useMemo(() => 获取题材预设天赋(openingConfig.题材模式), [openingConfig.题材模式]);
    const 恢复链有效模块键 = useMemo(
        () => {
            const builtinKeys = 创意工坊模块列表
                .filter((item) => item.type !== 'topic')
                .map((item) => `${item.source || 'builtin'}:${item.id}`);
            const localKeys = 读取本地创意工坊模块()
                .filter((item) => item.type !== 'topic')
                .map((item) => `local:${item.id}`);
            const allKeys = [...builtinKeys, ...localKeys];
            return allKeys.length > 0 ? new Set(allKeys) : undefined;
        },
        []
    );
    const 当前题材预设背景名称集合 = useMemo(() => new Set(当前题材预设背景.map(item => item.名称)), [当前题材预设背景]);
    const 当前题材预设天赋名称集合 = useMemo(() => new Set(当前题材预设天赋.map(item => item.名称)), [当前题材预设天赋]);
    const 全部背景选项 = useMemo(
        () => 合并去重背景([...模式包背景列表, ...当前题材预设背景, ...自定义背景列表]),
        [模式包背景列表, 当前题材预设背景, 自定义背景列表]
    );
    const 全部天赋选项 = useMemo(
        () => 合并去重天赋([...模式包天赋列表, ...当前题材预设天赋, ...自定义天赋列表]),
        [模式包天赋列表, 当前题材预设天赋, 自定义天赋列表]
    );
    // 选择池仅展示非隐藏天赋；隐藏天赋仅在成角/局内注入，选角 UI 不展示
    const 可见天赋选项 = useMemo(() => 过滤可见天赋(全部天赋选项), [全部天赋选项]);
    const 最终主角天赋列表 = useMemo(
        () => 合并玩家与背景天赋({
            玩家自选: selectedTalents,
            背景: selectedBackground,
            天赋目录: 全部天赋选项
        }),
        [selectedTalents, selectedBackground, 全部天赋选项]
    );
    const 当前抽卡出身选项 = useMemo(
        () => 根据名称映射抽卡(出身抽卡名称列表, 全部背景选项),
        [出身抽卡名称列表, 全部背景选项]
    );
    const 当前抽卡天赋选项 = useMemo(
        () => 根据名称映射天赋抽卡(天赋抽卡名称列表, 可见天赋选项),
        [天赋抽卡名称列表, 可见天赋选项]
    );
    useEffect(() => {
        set出身抽卡名称列表(prev => 补全抽卡名称列表(prev, 全部背景选项, 出身抽卡数量));
    }, [全部背景选项]);
    useEffect(() => {
        set天赋抽卡名称列表(prev => 补全天赋抽卡名称列表(prev, 可见天赋选项, 天赋抽卡数量));
    }, [可见天赋选项]);
    useEffect(() => {
        setSelectedBackground(prev => 全部背景选项.some(item => item.名称 === prev.名称) ? prev : 全部背景选项[0] || 预设背景[0]);
        setPartnerBackground(prev => 全部背景选项.some(item => item.名称 === prev.名称) ? prev : 全部背景选项[0] || 预设背景[0]);
        // 玩家自选：须在目录中且非隐藏；背景自带不写入 selectedTalents
        setSelectedTalents(prev => 过滤玩家可自选天赋(
            prev.filter(item => 全部天赋选项.some(option => option.名称 === item.名称))
        ));
        setPartnerTalents(prev => 过滤玩家可自选天赋(
            prev.filter(item => 全部天赋选项.some(option => option.名称 === item.名称))
        ));
    }, [全部背景选项, 全部天赋选项]);
    useEffect(() => {
        set出身已重Roll次数(0);
        set出身抽卡轮次(1);
        set天赋已重Roll次数(0);
        set天赋抽卡轮次(1);
    }, [worldConfig.difficulty]);
    const 重抽出身卡牌 = () => {
        if (出身剩余重Roll次数 <= 0) {
            alert(`当前难度“${当前难度设定.label}”的出身重 roll 次数已用完`);
            return;
        }
        set出身抽卡名称列表(抽取卡牌(全部背景选项, 出身抽卡数量).map(item => item.名称));
        set出身抽卡轮次(prev => prev + 1);
        set出身已重Roll次数(prev => prev + 1);
    };
    const 重抽天赋卡牌 = () => {
        if (天赋剩余重Roll次数 <= 0) {
            alert(`当前难度“${当前难度设定.label}”的天赋重 roll 次数已用完`);
            return;
        }
        set天赋抽卡名称列表(prev => {
            const targetCount = Math.max(0, Math.min(天赋抽卡数量, 可见天赋选项.length));
            const 可用天赋名称集合 = new Set(可见天赋选项.map(item => item.名称));
            const 已选天赋名称 = selectedTalents
                .map(item => item.名称)
                .filter((名称, index, list) => 可用天赋名称集合.has(名称) && list.indexOf(名称) === index);
            const 固定名称 = [
                ...prev.filter(名称 => 已选天赋名称.includes(名称)),
                ...已选天赋名称.filter(名称 => !prev.includes(名称))
            ].slice(0, targetCount);
            const 固定名称集合 = new Set(固定名称);
            const 补充名称 = 抽取天赋卡牌(
                可见天赋选项.filter(item => !固定名称集合.has(item.名称)),
                targetCount - 固定名称.length
            ).map(item => item.名称);
            return [...固定名称, ...补充名称];
        });
        set天赋抽卡轮次(prev => prev + 1);
        set天赋已重Roll次数(prev => prev + 1);
    };
    const 选择出身背景 = (bg: 背景结构) => {
        setSelectedBackground(bg);
    };
    const 取消选择天赋 = (名称: string) => {
        setSelectedTalents(prev => prev.filter(item => item.名称 !== 名称));
    };
    const 重置自定义天赋编辑 = () => {
        setCustomTalent({ 名称: '', 描述: '', 效果: '' });
        set正在编辑天赋名('');
        setShowCustomTalent(false);
    };
    const 重置自定义背景编辑 = () => {
        setCustomBackground({ 名称: '', 描述: '', 效果: '' });
        set正在编辑背景名('');
        setShowCustomBackground(false);
    };
    const 重置自定义开局预设编辑 = () => {
        setCustomPresetMeta({ 名称: '', 简介: '' });
        set正在编辑开局预设ID('');
        setShowCustomPresetEditor(false);
    };
    const 根据名称查找背景 = (名称: string): 背景结构 => {
        const hit = [...全部背景选项, ...预设背景, ...自定义背景列表].find(item => item.名称 === 名称);
        return hit || 预设背景[0];
    };
    const 根据名称查找天赋列表 = (名称列表: string[]): 天赋结构[] => (
        名称列表
            .map((名称) => [...全部天赋选项, ...预设天赋, ...自定义天赋列表].find(item => item.名称 === 名称))
            .filter((item): item is 天赋结构 => Boolean(item))
            .slice(0, 3)
    );
    const 提取模块背景列表 = (module: 创意工坊模块条目): 背景结构[] => {
        const payload = module.payload as any;
        const rawList = Array.isArray(payload?.backgrounds)
            ? payload.backgrounds
            : Array.isArray(payload?.characterBackgrounds)
                ? payload.characterBackgrounds
                : [];
        return rawList.map((item: 背景结构) => 标准化背景(item)).filter((item: 背景结构 | null): item is 背景结构 => Boolean(item));
    };
    const 提取模块天赋列表 = (module: 创意工坊模块条目): 天赋结构[] => {
        const payload = module.payload as any;
        const rawList = Array.isArray(payload?.talents)
            ? payload.talents
            : Array.isArray(payload?.characterTalents)
                ? payload.characterTalents
                : [];
        return rawList.map((item: 天赋结构) => 标准化天赋(item)).filter((item: 天赋结构 | null): item is 天赋结构 => Boolean(item));
    };
    const 按候选名称查找背景 = (名称: string, candidates: 背景结构[]): 背景结构 | null => (
        candidates.find(item => item.名称 === 名称) || null
    );
    const 按候选名称查找天赋列表 = (名称列表: string[], candidates: 天赋结构[]): 天赋结构[] => (
        名称列表
            .map((名称) => candidates.find(item => item.名称 === 名称))
            .filter((item): item is 天赋结构 => Boolean(item))
            .slice(0, 3)
    );
    const 获取预设恢复题材模式 = (preset: 开局预设方案结构): 题材模式类型 => {
        const normalizedOpeningConfig = 规范化可选开局配置(preset.openingConfig);
        const runtimeRestore = 获取快速重开运行时恢复参数({
            openingConfig: preset.openingConfig,
            openingStreaming: preset.openingStreaming,
            openingExtraRequirement: preset.openingExtraRequirement,
            validModuleKeys: 恢复链有效模块键
        });
        return (runtimeRestore.modeRuntimeProfile?.identity.baseMode
            || normalizedOpeningConfig?.题材模式
            || openingConfig.题材模式) as 题材模式类型;
    };
    const 构建预设恢复候选池 = (preset: 开局预设方案结构) => {
        const presetMode = 获取预设恢复题材模式(preset);
        const presetModeBackgrounds = 获取题材预设背景(presetMode);
        const presetModeTalents = 获取题材预设天赋(presetMode);
        return {
            fallbackBackgrounds: 合并去重背景([...presetModeBackgrounds, ...自定义背景列表, ...全部背景选项]),
            fallbackTalents: 合并去重天赋([...presetModeTalents, ...自定义天赋列表, ...全部天赋选项]),
            selectedBackgroundCatalog: 合并去重背景([...presetModeBackgrounds, ...自定义背景列表, ...全部背景选项]),
            selectedTalentCatalog: 合并去重天赋([...presetModeTalents, ...自定义天赋列表, ...全部天赋选项])
        };
    };
    const 读取图片文件 = (file: File, setter: (value: string) => void) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(file);
    };
    const 构建开局图片档案 = (avatarUrl: string, portraitUrl: string, prefix: string) => {
        const history: any[] = [];
        const avatar = avatarUrl.trim();
        const portrait = portraitUrl.trim();
        if (avatar) {
            history.push({
                id: `${prefix}_avatar`,
                构图: '头像',
                状态: 'success',
                图片URL: avatar,
                本地路径: avatar,
                生图词组: '开局前玩家设置头像',
                原始描述: '开局前玩家设置头像',
                使用模型: 'manual-upload',
                生成时间: Date.now()
            });
        }
        if (portrait) {
            history.push({
                id: `${prefix}_portrait`,
                构图: '立绘',
                状态: 'success',
                图片URL: portrait,
                本地路径: portrait,
                生图词组: '开局前玩家设置立绘',
                原始描述: '开局前玩家设置立绘',
                使用模型: 'manual-upload',
                生成时间: Date.now() - 1
            });
        }
        return history.length > 0
            ? {
                最近生图结果: history[0],
                生图历史: history,
                ...(avatar ? { 已选头像图片ID: `${prefix}_avatar` } : {}),
                ...(portrait ? { 已选立绘图片ID: `${prefix}_portrait` } : {})
            }
            : undefined;
    };
    const 构建角色数据 = (params?: {
        角色名?: string;
        性别?: string;
        年龄?: number;
        外貌?: string;
        性格?: string;
        出生月?: number;
        出生日?: number;
        属性?: 属性结构;
        背景?: 背景结构;
        天赋列表?: 天赋结构[];
    }): 角色数据结构 => {
        const 最终属性 = params?.属性 || stats;
        const 最终年龄 = params?.年龄 ?? charAge;
        const 初始境界层级 = 1;
        const 初始境界名称 = '';
        const 初始升级经验 = Math.floor(
            110
            + 初始境界层级 * 24
            + Math.max(0, 初始境界层级 - 4) * 10
            + Math.max(0, 初始境界层级 - 8) * 12
            + Math.max(0, 初始境界层级 - 12) * 16
            + Math.max(0, 初始境界层级 - 16) * 20
            + Math.max(0, 初始境界层级 - 20) * 26
            + Math.max(0, 初始境界层级 - 24) * 34
            + Math.max(0, 初始境界层级 - 27) * 42
            + Math.max(0, 初始境界层级 - 33) * 56
        );
        const 最大精力 = Math.floor(
            36
            + 最终属性.体质 * 6.2
            + 最终属性.根骨 * 3.4
            + 初始境界层级 * 5.2
            + Math.max(0, 初始境界层级 - 4) * 2.2
            + Math.max(0, 初始境界层级 - 8) * 2.6
            + Math.max(0, 初始境界层级 - 12) * 3.1
            + Math.max(0, 初始境界层级 - 16) * 3.8
            + Math.max(0, 初始境界层级 - 20) * 4.8
            + Math.max(0, 初始境界层级 - 24) * 6.0
            + Math.max(0, 初始境界层级 - 27) * 7.2
            + Math.max(0, 初始境界层级 - 33) * 9.0
        );
        const 最大内力 = Math.floor(
            18
            + 最终属性.根骨 * 7.4
            + 最终属性.悟性 * 6.6
            + 初始境界层级 * 6.0
            + Math.max(0, 初始境界层级 - 4) * 2.6
            + Math.max(0, 初始境界层级 - 8) * 3.2
            + Math.max(0, 初始境界层级 - 12) * 4.0
            + Math.max(0, 初始境界层级 - 16) * 5.0
            + Math.max(0, 初始境界层级 - 20) * 6.4
            + Math.max(0, 初始境界层级 - 24) * 8.2
            + Math.max(0, 初始境界层级 - 27) * 9.6
            + Math.max(0, 初始境界层级 - 33) * 12.0
        );
        const 最大饱腹 = Math.floor(
            72
            + 最终属性.体质 * 2.2
            + 最终属性.力量 * 1.2
            + 初始境界层级 * 2.8
            + Math.max(0, 初始境界层级 - 4) * 0.7
            + Math.max(0, 初始境界层级 - 8) * 0.8
            + Math.max(0, 初始境界层级 - 12) * 1.0
            + Math.max(0, 初始境界层级 - 16) * 1.2
            + Math.max(0, 初始境界层级 - 20) * 1.5
            + Math.max(0, 初始境界层级 - 24) * 1.9
            + Math.max(0, 初始境界层级 - 27) * 2.2
            + Math.max(0, 初始境界层级 - 33) * 2.8
        );
        const 最大口渴 = Math.floor(
            72
            + 最终属性.体质 * 2.1
            + 最终属性.根骨 * 1.3
            + 初始境界层级 * 2.8
            + Math.max(0, 初始境界层级 - 4) * 0.7
            + Math.max(0, 初始境界层级 - 8) * 0.8
            + Math.max(0, 初始境界层级 - 12) * 1.0
            + Math.max(0, 初始境界层级 - 16) * 1.2
            + Math.max(0, 初始境界层级 - 20) * 1.5
            + Math.max(0, 初始境界层级 - 24) * 1.9
            + Math.max(0, 初始境界层级 - 27) * 2.2
            + Math.max(0, 初始境界层级 - 33) * 2.8
        );
        const 最大负重 = Math.floor(
            82
            + 最终属性.力量 * 10.5
            + 最终属性.体质 * 2.4
            + 初始境界层级 * 2.4
            + Math.max(0, 初始境界层级 - 4) * 1.2
            + Math.max(0, 初始境界层级 - 8) * 1.4
            + Math.max(0, 初始境界层级 - 12) * 1.8
            + Math.max(0, 初始境界层级 - 16) * 2.2
            + Math.max(0, 初始境界层级 - 20) * 2.8
            + Math.max(0, 初始境界层级 - 24) * 3.5
            + Math.max(0, 初始境界层级 - 27) * 4.0
            + Math.max(0, 初始境界层级 - 33) * 5.0
        );
        const 当前精力 = 最大精力;
        const 当前内力 = Math.floor(最大内力 * 0.9);
        const 当前饱腹 = Math.floor(最大饱腹 * 0.8);
        const 当前口渴 = Math.floor(最大口渴 * 0.8);
        const 总最大血量 = Math.floor(
            92
            + 最终属性.体质 * 5.2
            + 最终属性.根骨 * 3.0
            + 最终属性.力量 * 1.6
            + 初始境界层级 * 5.0
            + Math.max(0, 初始境界层级 - 4) * 2.4
            + Math.max(0, 初始境界层级 - 8) * 2.8
            + Math.max(0, 初始境界层级 - 12) * 3.4
            + Math.max(0, 初始境界层级 - 16) * 4.2
            + Math.max(0, 初始境界层级 - 20) * 5.2
            + Math.max(0, 初始境界层级 - 24) * 6.6
            + Math.max(0, 初始境界层级 - 27) * 7.8
            + Math.max(0, 初始境界层级 - 33) * 9.8
        );
        const 头部最大血量 = Math.round(总最大血量 * 0.15);
        const 胸部最大血量 = Math.round(总最大血量 * 0.22);
        const 腹部最大血量 = Math.round(总最大血量 * 0.20);
        const 左手最大血量 = Math.round(总最大血量 * 0.11);
        const 右手最大血量 = Math.round(总最大血量 * 0.11);
        const 左腿最大血量 = Math.round(总最大血量 * 0.105);
        const 右腿最大血量 = Math.max(
            1,
            总最大血量 - 头部最大血量 - 胸部最大血量 - 腹部最大血量 - 左手最大血量 - 右手最大血量 - 左腿最大血量
        );

        const avatarUrl = charAvatarUrl.trim();
        const portraitUrl = charPortraitUrl.trim();
        const imageArchive = 构建开局图片档案(avatarUrl, portraitUrl, 'opening_player');
        return {
            出生日期: `${params?.出生月 ?? birthMonth}月${params?.出生日 ?? birthDay}日`,
            ...(avatarUrl ? { 头像图片URL: avatarUrl } : {}),
            ...(portraitUrl ? { 立绘图片URL: portraitUrl } : {}),
            ...(imageArchive ? { 图片档案: imageArchive, 最近生图结果: imageArchive.最近生图结果 } : {}),
            ...(最终属性 as any),
            姓名: (params?.角色名 ?? charName).trim(),
            性别: (params?.性别 ?? charGender).trim() || '未设定',
            年龄: 最终年龄,
            外貌: (params?.外貌 ?? charAppearance).trim() || '相貌平常，衣着朴素。',
            性格: (params?.性格 ?? charPersonality).trim() || '未设定',
            天赋列表: params?.天赋列表 ?? 合并玩家与背景天赋({
                玩家自选: selectedTalents,
                背景: params?.背景 ?? selectedBackground,
                天赋目录: 全部天赋选项,
                onMiss: 报告背景自带天赋解析缺失
            }),
            出身背景: params?.背景 ?? selectedBackground,
            称号: '初出茅庐', 境界: 初始境界名称, 境界层级: 初始境界层级,
            所属门派ID: 'none', 门派职位: '无', 门派贡献: 0,
            金钱: { 金元宝: 0, 银子: 0, 铜钱: 0 },
            当前精力, 最大精力,
            当前内力, 最大内力,
            当前饱腹, 最大饱腹,
            当前口渴, 最大口渴,
            当前负重: 0, 最大负重,
            头部当前血量: 头部最大血量, 头部最大血量, 头部状态: '正常',
            胸部当前血量: 胸部最大血量, 胸部最大血量, 胸部状态: '正常',
            腹部当前血量: 腹部最大血量, 腹部最大血量, 腹部状态: '正常',
            左手当前血量: 左手最大血量, 左手最大血量, 左手状态: '正常',
            右手当前血量: 右手最大血量, 右手最大血量, 右手状态: '正常',
            左腿当前血量: 左腿最大血量, 左腿最大血量, 左腿状态: '正常',
            右腿当前血量: 右腿最大血量, 右腿最大血量, 右腿状态: '正常',
            装备: { 头部: '无', 胸部: '无', 盔甲: '无', 内衬: '无', 腿部: '无', 手部: '无', 足部: '无', 主武器: '无', 副武器: '无', 暗器: '无', 背部: '无', 腰部: '无', 坐骑: '无' },
            物品列表: [], 功法列表: [],
            技艺: 构建默认技艺(openingConfig.题材模式, openingConfig.modeRuntimeProfile),
            当前经验: 0, 升级经验: 初始升级经验, 玩家BUFF: [], 突破条件: []
        };
    };
    const 从伙伴配置读取立绘URL = (partner: 初始伙伴配置结构): string => {
        const history = Array.isArray(partner.图片档案?.生图历史) ? partner.图片档案.生图历史 : [];
        return String(
            partner?.立绘图片URL ||
            history.find((item: any) => item?.id === partner.图片档案?.已选立绘图片ID)?.图片URL ||
            history.find((item: any) => item?.构图 === '立绘')?.图片URL ||
            ''
        );
    };
    const 载入伙伴配置到表单 = (partner: 初始伙伴配置结构) => {
        setPartnerEnabled(partner.enabled !== false);
        setPartnerName(partner.姓名);
        setPartnerGender(partner.性别);
        setPartnerAge(partner.年龄);
        setPartnerBirthMonth(partner.出生月);
        setPartnerBirthDay(partner.出生日);
        setPartnerAppearance(partner.外貌);
        setPartnerPersonality(partner.性格);
        setPartnerAvatarUrl(partner.头像图片URL || '');
        setPartnerPortraitUrl(从伙伴配置读取立绘URL(partner));
        setPartnerRelation(partner.关系);
        setPartnerNote(partner.备注);
        setPartnerStats(partner.属性);
        setPartnerBackground({
            名称: partner.背景名称 || 预设背景[0].名称,
            描述: partner.背景描述 || 预设背景[0].描述,
            效果: partner.背景效果 || 预设背景[0].效果
        });
        setPartnerTalents(过滤玩家可自选天赋((partner.天赋列表 || []) as 天赋结构[]));
    };
    const 应用预设到表单 = (preset: 开局预设方案结构, options?: { 保持当前步骤?: boolean }) => {
        const presetRestoreCatalog = 构建预设恢复候选池(preset);
        const restored = 构建预设表单恢复结果(preset, {
            ...presetRestoreCatalog,
            validModuleKeys: 恢复链有效模块键
        });
        const normalizedOpeningConfig = 规范化可选开局配置(preset.openingConfig);
        const restoredWorldMode = (restored.modeRuntimeProfile?.identity.baseMode || normalizedOpeningConfig?.题材模式 || openingConfig.题材模式) as OpeningConfig['题材模式'];
        const nextWorldConfig: WorldGenConfig = 清理官方题材手动提示词残留({
            ...创建主题默认世界配置(restoredWorldMode),
            ...preset.worldConfig,
            ...(restored.modeRuntimeProfile ? { modeRuntimeProfile: restored.modeRuntimeProfile } : {})
        });
        const restoredOpeningConfig = normalizedOpeningConfig
            ? {
                ...normalizedOpeningConfig,
                ...(restored.modeRuntimeProfile ? { modeRuntimeProfile: restored.modeRuntimeProfile } : {}),
                ...(restored.runtimeSnapshot ? { runtimeSnapshot: restored.runtimeSnapshot } : {})
            }
            : 默认开局配置();
        setWorldConfig(nextWorldConfig);
        setCharName(preset.character.姓名);
        setCharGender(preset.character.性别);
        setCharAge(preset.character.年龄);
        setBirthMonth(preset.character.出生月);
        setBirthDay(preset.character.出生日);
        setCharAppearance(preset.character.外貌);
        setCharPersonality(preset.character.性格);
        setStats(preset.character.属性);
        setSelectedBackground(restored.selectedBackground);
        setSelectedTalents(restored.selectedTalents);
        const normalizedPartnerList = normalizedOpeningConfig?.初始伙伴列表?.length
            ? normalizedOpeningConfig.初始伙伴列表
            : [restoredOpeningConfig?.初始伙伴 || 默认初始伙伴配置()];
        const normalizedPartner = normalizedPartnerList[0] || 默认初始伙伴配置();
        setOpeningConfigEnabled(Boolean(normalizedOpeningConfig) && normalizedOpeningConfig?.配置约束启用 !== false);
        setOpeningConfig(restoredOpeningConfig);
        const restoredCurrencySystem = restoredOpeningConfig.modeRuntimeProfile?.economy.currencySystem;
        设置货币偏好(!restoredCurrencySystem
            ? (restoredOpeningConfig.modeRuntimeProfile ? 'legacy' : 'follow_mode')
            : (() => {
                const topicDefault = 构建货币系统模板('topic-default', {
                    ...restoredOpeningConfig.modeRuntimeProfile!,
                    economy: { ...restoredOpeningConfig.modeRuntimeProfile!.economy, currencySystem: undefined }
                });
                const fingerprint = (s: CurrencySystem) => JSON.stringify({
                    id: s.id, name: s.name, baseUnitId: s.baseUnitId,
                    formatStyle: s.formatStyle || 'compound',
                    units: (s.units || []).map(u => ({ id: u.id, name: u.name, symbol: u.symbol || '', baseRate: Number(u.baseRate) || 1, order: Number(u.order) || 1 }))
                });
                return fingerprint(restoredCurrencySystem) === fingerprint(topicDefault) ? 'follow_mode' : 'custom';
            })());
        setPartnerList(normalizedPartnerList);
        setActivePartnerIndex(0);
        载入伙伴配置到表单(normalizedPartner);
        setOpeningExtraRequirement(restored.openingExtraRequirement ?? '');
        setActiveModuleExtraRules(restored.activeModuleExtraRules ?? '');
        设置模式包背景列表(restored.模式包背景列表);
        设置模式包天赋列表(restored.模式包天赋列表);
        设置模式包世界书列表(restored.modeWorldbooks || []);
        设置已选创意工坊模式(restored.workshopSelection?.selectedMode || '');
        设置已选创意工坊子项(restored.workshopSelection?.selectedModules || {});
        if (!options?.保持当前步骤) setStep(1);
    };
    const 当前性别模式: '男' | '女' | '男娘' | '扶她' | '自定义' = ['男', '女', '男娘', '扶她'].includes(charGender.trim())
        ? charGender.trim() as '男' | '女' | '男娘' | '扶她'
        : '自定义';
    const 选择性别 = (next: '男' | '女' | '男娘' | '扶她' | '自定义') => {
        if (next === '自定义') {
            setCharGender(prev => (['男', '女', '男娘', '扶她'].includes(prev.trim()) ? '' : prev));
            return;
        }
        setCharGender(next);
    };
    const 当前伙伴性别模式: '男' | '女' | '男娘' | '扶她' | '自定义' = ['男', '女', '男娘', '扶她'].includes(partnerGender.trim())
        ? partnerGender.trim() as '男' | '女' | '男娘' | '扶她'
        : '自定义';
    const 选择伙伴性别 = (next: '男' | '女' | '男娘' | '扶她' | '自定义') => {
        if (next === '自定义') {
            setPartnerGender(prev => (['男', '女', '男娘', '扶她'].includes(prev.trim()) ? '' : prev));
            return;
        }
        setPartnerGender(next);
    };

    const totalStatBudget = useMemo(() => 获取难度总属性点(worldConfig.difficulty), [worldConfig.difficulty]);
    const usedPoints = Object.values(stats).reduce((a, b) => a + b, 0);
    const remainingPoints = totalStatBudget - usedPoints;
    const partnerUsedPoints = Object.values(partnerStats).reduce((a, b) => a + b, 0);
    const partnerRemainingPoints = totalStatBudget - partnerUsedPoints;
    const stepProgress = ((step + 1) / STEPS.length) * 100;
    const currentStepLabel = STEPS[step] || '创建';
    const 当前题材配置 = useMemo(() => 解析生效题材配置(openingConfig.题材模式, openingConfig.modeRuntimeProfile), [openingConfig.题材模式, openingConfig.modeRuntimeProfile]);
    const 当前题材显示摘要 = useMemo(
        () => 构建题材显示摘要(openingConfig.题材模式, openingConfig.modeRuntimeProfile),
        [openingConfig.题材模式, openingConfig.modeRuntimeProfile]
    );
    const 当前难度设定 = useMemo(() => 获取题材化难度设定(worldConfig.difficulty, openingConfig.题材模式), [worldConfig.difficulty, openingConfig.题材模式]);
    const 出身剩余重Roll次数 = Math.max(0, 当前难度设定.天赋重Roll次数 - 出身已重Roll次数);
    const 天赋剩余重Roll次数 = Math.max(0, 当前难度设定.天赋重Roll次数 - 天赋已重Roll次数);
    const 当前出身展示列表 = 出身选择模式 === '抽卡' ? 当前抽卡出身选项 : 全部背景选项;
    const 难度判定修正文本 = 当前难度设定.判定修正 > 0 ? `+${当前难度设定.判定修正}` : String(当前难度设定.判定修正);
    const selectedTalentNames = selectedTalents.map(item => item.名称);
    const 背景长期说明 = '背景代表长期身份资源、社会关系、风险来源与成长路径，不应只决定第一幕处境。';
    const 天赋说明 = '天赋代表长期倾向与修行适配，优先影响成长曲线、事件判定与路线优势。';
    const 当前附加小说数据集 = useMemo(
        () => 小说拆分数据集列表.find((item) => item.id === openingConfig.同人融合.附加小说数据集ID) || null,
        [openingConfig.同人融合.附加小说数据集ID, 小说拆分数据集列表]
    );
    const 当前角色替换规则列表 = useMemo(
        () => 获取同人角色替换规则列表(openingConfig, charName),
        [openingConfig, charName]
    );
    const 构建伙伴开局配置 = () => {
        const fallback = 默认初始伙伴配置();
        return {
            ...fallback,
            enabled: partnerEnabled,
            姓名: partnerName.trim(),
            性别: partnerGender.trim(),
            年龄: partnerAge,
            出生月: partnerBirthMonth,
            出生日: partnerBirthDay,
            外貌: partnerAppearance.trim(),
            性格: partnerPersonality.trim(),
            属性: partnerStats,
            头像图片URL: partnerAvatarUrl.trim(),
            图片档案: 构建开局图片档案(partnerAvatarUrl, partnerPortraitUrl, 'opening_partner'),
            背景名称: partnerBackground.名称,
            背景描述: partnerBackground.描述,
            背景效果: partnerBackground.效果,
            天赋列表: partnerTalents,
            关系: partnerRelation.trim(),
            备注: partnerNote.trim()
        };
    };
    const 同步当前伙伴到列表 = (): 初始伙伴配置结构[] => {
        const current = 构建伙伴开局配置();
        const safeIndex = Math.max(0, Math.min(activePartnerIndex, Math.max(0, partnerList.length - 1)));
        const next = partnerList.length > 0 ? [...partnerList] : [current];
        next[safeIndex] = current;
        setPartnerList(next);
        return next;
    };
    const 获取当前伙伴列表快照 = (): 初始伙伴配置结构[] => {
        const current = 构建伙伴开局配置();
        const safeIndex = Math.max(0, Math.min(activePartnerIndex, Math.max(0, partnerList.length - 1)));
        const next = partnerList.length > 0 ? [...partnerList] : [current];
        next[safeIndex] = current;
        return next;
    };
    const 切换当前伙伴 = (index: number) => {
        const next = 同步当前伙伴到列表();
        const safeIndex = Math.max(0, Math.min(index, next.length - 1));
        setActivePartnerIndex(safeIndex);
        载入伙伴配置到表单(next[safeIndex] || 默认初始伙伴配置());
    };
    const 新增开局伙伴 = () => {
        const next = [...同步当前伙伴到列表(), 默认初始伙伴配置()];
        const nextIndex = next.length - 1;
        setPartnerList(next);
        setActivePartnerIndex(nextIndex);
        载入伙伴配置到表单(next[nextIndex]);
        setPartnerEnabled(true);
    };
    const 删除当前伙伴 = () => {
        const next = 同步当前伙伴到列表().filter((_, index) => index !== activePartnerIndex);
        const fallbackList = next.length > 0 ? next : [默认初始伙伴配置()];
        const nextIndex = Math.max(0, Math.min(activePartnerIndex, fallbackList.length - 1));
        setPartnerList(fallbackList);
        setActivePartnerIndex(nextIndex);
        载入伙伴配置到表单(fallbackList[nextIndex]);
    };
    const 构建有效开局配置 = (): OpeningConfig | undefined => {
        if (!openingConfigEnabled && !partnerEnabled && !openingConfig.题材模式) return undefined;
        const nextPartnerList = 获取当前伙伴列表快照().map((partner) => ({
            ...partner,
            enabled: partnerEnabled && partner.enabled !== false
        }));
        return 规范化开局配置({
            ...openingConfig,
            配置约束启用: openingConfigEnabled,
            初始伙伴: nextPartnerList[0],
            初始伙伴列表: nextPartnerList
        });
    };

    const 当前有效开局配置 = useMemo(
        () => 构建有效开局配置(),
        [
            openingConfigEnabled,
            partnerEnabled,
            openingConfig,
            partnerName,
            partnerGender,
            partnerAge,
            partnerBirthMonth,
            partnerBirthDay,
            partnerAppearance,
            partnerPersonality,
            partnerStats,
            partnerAvatarUrl,
            partnerPortraitUrl,
            partnerBackground,
            partnerTalents,
            partnerRelation,
            partnerNote,
            partnerList,
            activePartnerIndex
        ]
    );

    const 当前世界观生成提示词预览 = useMemo(() => 构建开局世界观生成提示词预览({
        worldConfig,
        charData: 构建角色数据(),
        openingConfig: 当前有效开局配置
    }), [
        worldConfig,
        charName,
        charGender,
        charAge,
        charAppearance,
        charPersonality,
        charAvatarUrl,
        charPortraitUrl,
        birthMonth,
        birthDay,
        stats,
        selectedBackground,
        selectedTalents,
        openingConfigEnabled,
        openingConfig,
        当前有效开局配置
    ]);
    const 当前主剧情接口配置 = useMemo(() => apiConfig ? 获取主剧情接口配置(apiConfig) : null, [apiConfig]);
    const aiFrameworkAvailable = 接口配置是否可用(当前主剧情接口配置);
    const 当前开局配置文案 = useMemo(
        () => 获取题材开局配置文案(openingConfig.题材模式, openingConfig.modeRuntimeProfile),
        [openingConfig.题材模式, openingConfig.modeRuntimeProfile]
    );
    const 当前关系侧重选项 = useMemo(() => 获取题材关系侧重选项(openingConfig.题材模式, openingConfig.modeRuntimeProfile), [openingConfig.题材模式, openingConfig.modeRuntimeProfile]);
    const 当前开局切入偏好选项 = useMemo(() => 获取题材开局切入偏好选项(openingConfig.题材模式, openingConfig.modeRuntimeProfile), [openingConfig.题材模式, openingConfig.modeRuntimeProfile]);
    const 当前伙伴关系占位 = 当前题材配置.group === 'apocalypse'
        ? '例如：同路幸存者、搜救搭档、营地队友、旧识'
        : 当前题材配置.group === 'modern'
            ? '例如：青梅竹马、同事、邻居、项目搭档、好友'
            : 当前题材配置.group === 'urban_xianxia'
                ? '例如：青梅竹马、同道、调查搭档、机构协作者'
            : 当前题材配置.group === 'xianxia'
                ? '例如：青梅竹马、同门道友、护道人、好友'
                : '例如：青梅竹马、同门师妹、护卫、好友';
    const 构建运行时生成性别补丁 = (modeRuntimeProfile?: OpeningConfig['modeRuntimeProfile']) => ({
        允许生成性别: 规范化开局生成性别列表(modeRuntimeProfile?.opening?.allowedGeneratedGenders),
        生成性别锁定: modeRuntimeProfile?.opening?.lockGeneratedGenders === true
    });
    const 清除运行时货币系统 = <T extends OpeningConfig['modeRuntimeProfile']>(modeRuntimeProfile: T): T => {
        if (!modeRuntimeProfile) return modeRuntimeProfile;
        return {
            ...modeRuntimeProfile,
            economy: {
                ...modeRuntimeProfile.economy,
                currencySystem: undefined
            }
        } as T;
    };
    const 保留自定义货币系统 = (modeRuntimeProfile: NonNullable<OpeningConfig['modeRuntimeProfile']>) => {
        if (货币偏好 === 'legacy') return 清除运行时货币系统(modeRuntimeProfile);
        const currentCurrencySystem = openingConfig.modeRuntimeProfile?.economy.currencySystem;
        if (货币偏好 !== 'custom' || !currentCurrencySystem) return modeRuntimeProfile;
        return {
            ...modeRuntimeProfile,
            economy: {
                ...modeRuntimeProfile.economy,
                currencySystem: currentCurrencySystem as CurrencySystem
            }
        };
    };
    const 更新开局货币系统 = (
        nextProfile: NonNullable<OpeningConfig['modeRuntimeProfile']>,
        preference: 'follow_mode' | 'custom' = 'custom'
    ) => {
        设置货币偏好(preference);
        setOpeningConfig((prev) => ({
            ...prev,
            modeRuntimeProfile: nextProfile
        }));
        setWorldConfig((prev) => ({
            ...prev,
            modeRuntimeProfile: nextProfile
        }));
    };
    const 使用旧版三层货币系统 = () => {
        设置货币偏好('legacy');
        setOpeningConfig((prev) => ({
            ...prev,
            modeRuntimeProfile: 清除运行时货币系统(prev.modeRuntimeProfile)
        }));
        setWorldConfig((prev) => ({
            ...prev,
            modeRuntimeProfile: 清除运行时货币系统(prev.modeRuntimeProfile)
        }));
    };
    const 更新题材模式 = (题材模式: OpeningConfig['题材模式']) => {
        const modeRuntimeProfile = 保留自定义货币系统(构建官方模式运行时配置(题材模式));
        设置模式包背景列表([]);
        设置模式包天赋列表([]);
        设置模式包世界书列表([]);
        setOpeningConfig((prev) => ({
            ...prev,
            题材模式,
            modeRuntimeProfile,
            ...构建运行时生成性别补丁(modeRuntimeProfile)
        }));
        setWorldConfig((prev) => ({
            ...(合并题材世界默认值(题材模式, prev) as WorldGenConfig),
            modeRuntimeProfile
        }));
    };

    const 拼接额外要求 = (current: string | undefined, addition: string): string => {
        const base = (current || '').trim();
        const extra = addition.trim();
        if (!extra) return base;
        if (!base) return extra;
        if (base.includes(extra)) return base;
        return `${base}\n${extra}`;
    };

    const 创意工坊模块键 = (entry: 创意工坊模块条目): string => `${entry.source || 'builtin'}:${entry.id}`;

    const 按键查找创意工坊模块 = (moduleKey: string): 创意工坊模块条目 | undefined => (
        创意工坊模块列表.find((item) => 创意工坊模块键(item) === moduleKey)
    );

    const 按模式查找官方工坊模块 = (mode: 题材模式类型, type: 创意工坊模块类型): 创意工坊模块条目 | undefined => (
        创意工坊模块列表.find((entry) => (
            entry.source === 'builtin'
            && entry.type === type
            && entry.preset?.openingConfig?.题材模式 === mode
        ))
    );

    const 读取模块模式 = (entry: 创意工坊模块条目): 题材模式类型 | '' => {
        const mode = entry.preset?.openingConfig?.题材模式 || (entry.payload as any)?.mode || (entry.payload as any)?.value;
        return 题材模式顺序.includes(mode as 题材模式类型) ? mode as 题材模式类型 : '';
    };

    const 应用创意工坊模块到开局 = async (moduleKey: string) => {
        设置创意工坊注入状态('');
        if (!moduleKey) return;
        const entry = 按键查找创意工坊模块(moduleKey);
        if (!entry) return;
        设置创意工坊注入中(true);
        try {
            const module = await 下载创意工坊模块(entry);
            const mode = 读取模块模式(module);
            if (mode) 更新题材模式(mode);
            const modeRuntimeProfile = 保留自定义货币系统(规范化模式运行时配置(
                module.modeRuntimeProfile || (module.payload as any)?.modeRuntimeProfile,
                mode || openingConfig.题材模式
            ));
            const resolvedMode = modeRuntimeProfile.identity.baseMode as 题材模式类型;
            const moduleBackgrounds = 提取模块背景列表(module);
            const moduleTalents = 提取模块天赋列表(module);
            const modeWorldbooks = Array.isArray(module.modeWorldbooks) ? module.modeWorldbooks : Array.isArray((module.payload as any)?.modeWorldbooks) ? (module.payload as any).modeWorldbooks : [];
            const worldDetailGeneration = 读取模块世界细节生成配置(module);
            const worldDetailRequirement = 渲染模块世界细节要求(worldDetailGeneration);
            const extraParts: string[] = [];
            if (module.safetyNotes?.length) {
                extraParts.push('【模块安全说明】', ...module.safetyNotes.map((n) => `- ${n}`));
            }
            if (module.usagePrompt) {
                extraParts.push('【模块使用说明】', module.usagePrompt);
            }
            if (moduleBackgrounds.length > 0) {
                extraParts.push(
                    '【本世界可用出身背景池】',
                    ...moduleBackgrounds.map((b, i) => `${i + 1}. ${b.名称}：${b.描述}${b.效果 ? `（效果：${b.效果}）` : ''}`)
                );
            }
            if (moduleTalents.length > 0) {
                extraParts.push(
                    '【本世界可用天赋池】',
                    ...moduleTalents.map((t, i) => `${i + 1}. ${t.名称}：${t.描述}${t.效果 ? `（效果：${t.效果}）` : ''}`)
                );
            }
            setActiveModuleExtraRules(extraParts.join('\n'));
            设置模式包背景列表(moduleBackgrounds);
            设置模式包天赋列表(moduleTalents);
            设置模式包世界书列表(modeWorldbooks);
            const backgroundCandidates = 合并去重背景([
                ...moduleBackgrounds,
                ...获取题材预设背景(resolvedMode),
                ...全部背景选项,
                ...自定义背景列表,
                ...预设背景
            ]);
            const talentCandidates = 合并去重天赋([
                ...moduleTalents,
                ...获取题材预设天赋(resolvedMode),
                ...全部天赋选项,
                ...自定义天赋列表,
                ...预设天赋
            ]);
            const presetCharacter = module.preset?.character;
            if (presetCharacter?.背景名称) {
                const nextBackground = 按候选名称查找背景(presetCharacter.背景名称, backgroundCandidates);
                if (nextBackground) setSelectedBackground(nextBackground);
            }
            if (presetCharacter?.天赋名称列表?.length) {
                const nextTalents = 按候选名称查找天赋列表(presetCharacter.天赋名称列表, talentCandidates);
                if (nextTalents.length > 0) setSelectedTalents(nextTalents);
            }
            setOpeningConfig((prev) => ({
                ...prev,
                题材模式: modeRuntimeProfile.identity.baseMode,
                modeRuntimeProfile,
                ...构建运行时生成性别补丁(modeRuntimeProfile)
            }));
            setWorldConfig((prev) => ({
                ...prev,
                modeRuntimeProfile,
                ...(worldDetailGeneration.mapDiyDraft?.enabled ? { mapDiyDraft: { ...worldDetailGeneration.mapDiyDraft, enabled: true } } : {})
            }));
            const content = String((module.payload as any)?.content || '').trim();
            const isModePackage = (module.payload as any)?.packagePart === 'mode_package' || (module.payload as any)?.schema === 'moranjianghu-creative-workshop-mode-package';
            if (module.type === 'topic') {
                if (module.preset) {
                    setWorldConfig((prev) => ({
                        ...prev,
                        ...module.preset!.worldConfig,
                        modeRuntimeProfile,
                        manualWorldPrompt: isModePackage ? (prev.manualWorldPrompt || '') : (prev.manualWorldPrompt || module.preset!.worldConfig.manualWorldPrompt || ''),
                        manualRealmPrompt: isModePackage ? (prev.manualRealmPrompt || '') : (prev.manualRealmPrompt || module.preset!.worldConfig.manualRealmPrompt || '')
                    }));
                    if (module.preset.openingConfig?.题材模式) {
                        const normalizedModuleOpening = 规范化开局配置({
                            ...module.preset.openingConfig,
                            modeRuntimeProfile
                        });
                        setOpeningConfig((prev) => ({
                            ...prev,
                            题材模式: normalizedModuleOpening.题材模式,
                            modeRuntimeProfile,
                            允许生成性别: normalizedModuleOpening.允许生成性别,
                            生成性别锁定: normalizedModuleOpening.生成性别锁定
                        }));
                    }
                }
                const extractedPrompts = 从模式世界书提取提示词(modeWorldbooks);
                const topicPrompt = String(extractedPrompts.manualWorldPrompt || (module.payload as any)?.manualWorldPrompt || (isModePackage ? module.preset?.worldConfig?.manualWorldPrompt : '') || (!module.preset ? content : '')).trim();
                if (topicPrompt) {
                    if (isModePackage) {
                        setWorldConfig((prev) => ({ ...prev, worldExtraRequirement: 拼接额外要求(prev.worldExtraRequirement, topicPrompt) }));
                    } else {
                        setWorldConfig((prev) => ({ ...prev, manualWorldPrompt: 拼接额外要求(prev.manualWorldPrompt, topicPrompt) }));
                    }
                }
                const worldExtra = String(extractedPrompts.worldExtraRequirement || (module.payload as any)?.worldExtraRequirement || module.preset?.openingExtraRequirement || worldDetailRequirement || '').trim();
                if (worldExtra) setWorldConfig((prev) => ({ ...prev, worldExtraRequirement: 拼接额外要求(prev.worldExtraRequirement, worldExtra) }));
                const realmPrompt = String(extractedPrompts.manualRealmPrompt || (module.payload as any)?.manualRealmPrompt || module.preset?.worldConfig?.manualRealmPrompt || '').trim();
                if (realmPrompt) {
                    if (isModePackage) {
                        setWorldConfig((prev) => ({ ...prev, worldExtraRequirement: 拼接额外要求(prev.worldExtraRequirement, realmPrompt) }));
                    } else {
                        setWorldConfig((prev) => ({ ...prev, manualRealmPrompt: realmPrompt }));
                    }
                }
            } else if (module.type === 'world_rules') {
                const extra = String((module.payload as any)?.worldExtraRequirement || module.preset?.openingExtraRequirement || content).trim();
                if (extra) setWorldConfig((prev) => ({ ...prev, worldExtraRequirement: 拼接额外要求(prev.worldExtraRequirement, extra) }));
            } else if (module.type === 'ability') {
                const realmPrompt = String((module.payload as any)?.manualRealmPrompt || module.preset?.worldConfig?.manualRealmPrompt || content).trim();
                if (realmPrompt) setWorldConfig((prev) => ({ ...prev, manualRealmPrompt: realmPrompt }));
            }
            设置创意工坊注入状态(`已注入「${module.title}」的模式专属世界书、身份背景池和天赋池。可在后续步骤继续微调角色与开局要求。`);
        } catch (error: any) {
            设置创意工坊注入状态(`工坊预设注入失败：${error?.message || '未知错误'}`);
        } finally {
            设置创意工坊注入中(false);
        }
    };

    const 选择创意工坊子项 = (type: 创意工坊模块类型, moduleKey: string) => {
        设置已选创意工坊子项((prev) => ({ ...prev, [type]: moduleKey }));
        void 应用创意工坊模块到开局(moduleKey);
    };

    const 选择创意工坊模式 = (mode: 题材模式类型 | '') => {
        设置已选创意工坊模式(mode);
        if (!mode) {
            设置已选创意工坊子项({});
            return;
        }
        更新题材模式(mode);
        const next: Partial<Record<创意工坊模块类型, string>> = {};
        const entry = 按模式查找官方工坊模块(mode, 'topic');
        if (entry) {
            const key = 创意工坊模块键(entry);
            next.topic = key;
            void 应用创意工坊模块到开局(key);
        }
        设置已选创意工坊子项(next);
    };

    const 解析AI框架JSON = (raw: string): any => {
        const source = (raw || '').trim();
        if (!source) throw new Error('AI 输出为空');
        const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
        const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
        if (!candidate || !candidate.startsWith('{')) throw new Error('AI 没有返回可解析的 JSON');
        return JSON.parse(candidate);
    };

    const runAiFrameworkAssist = async () => {
        if (!接口配置是否可用(当前主剧情接口配置)) {
            setAiFrameworkStatus({ type: 'error', message: '请先在设置中配置可用的主剧情 API。' });
            return;
        }
        setAiFrameworkStatus({ type: 'loading', message: '正在让 AI 补全开局框架...' });
        try {
            const prompt = [
                '你是文字冒险游戏的新开局框架助手。请根据当前表单，补全适合快速开局测试的角色身份、天赋、伙伴与玩家世界观草稿/细化要求。',
                '必须只输出 JSON，不要输出 Markdown、解释或多余文本。',
                'JSON 结构：',
                '{"worldPatch":{"worldName":"","dynastySetting":"","tianjiaoSetting":"","worldExtraRequirement":""},"character":{"外貌":"","性格":"","背景":{"名称":"","描述":"","效果":""},"天赋列表":[{"名称":"","描述":"","效果":""}]},"partner":{"enabled":true,"姓名":"","性别":"","年龄":18,"外貌":"","性格":"","背景":{"名称":"","描述":"","效果":""},"天赋列表":[{"名称":"","描述":"","效果":""}],"关系":"","备注":""},"openingExtraRequirement":""}',
                '要求：',
                '- 背景和天赋必须能长期影响玩法，不要只写一句第一幕设定。',
                '- 伙伴必须适合开局同行，并给出清楚关系，不要抢主角戏。',
                `- 当前题材模式是“${当前题材显示摘要.label}”，必须严格沿用对应世界观、身份背景、天赋、交易和地图口径。`,
                ...当前题材显示摘要.promptLines.map((line) => `- 题材核心边界：${line}`),
                `- 开局边界：${当前题材显示摘要.promptBoundary}`,
                `- 货币/交易口径：${当前题材显示摘要.currencyPrompt}`,
                `- 统一换算口径：${当前题材显示摘要.currencyExchangePrompt}`,
                `- 地图/势力口径：${当前题材显示摘要.mapPrompt}`,
                `- 推荐背景方向：${当前题材显示摘要.backgroundSuggestions.join('、')}`,
                `- 推荐天赋方向：${当前题材显示摘要.talentSuggestions.join('、')}`,
                `- 预设物品方向：${当前题材显示摘要.presetItemKeywords.join('、')}`,
                `当前世界配置：${JSON.stringify(worldConfig)}`,
                `当前主角：${JSON.stringify({ 姓名: charName, 性别: charGender, 年龄: charAge, 外貌: charAppearance, 性格: charPersonality, 背景: selectedBackground, 玩家自选天赋: selectedTalents, 天赋列表: 最终主角天赋列表 })}`,
                `说明：天赋列表含背景自带注入项；玩家选角不可见的隐藏自带仅在成角后写入角色。`,
                `当前开局配置：${JSON.stringify(openingConfigEnabled ? openingConfig : null)}`,
                `当前伙伴列表：${JSON.stringify(获取当前伙伴列表快照().map((partner) => ({ enabled: partner.enabled, 姓名: partner.姓名, 性别: partner.性别, 年龄: partner.年龄, 外貌: partner.外貌, 性格: partner.性格, 背景: { 名称: partner.背景名称, 描述: partner.背景描述, 效果: partner.背景效果 }, 天赋列表: partner.天赋列表, 关系: partner.关系, 备注: partner.备注 })))}`
            ].join('\n\n');
            const raw = await 请求模型文本(当前主剧情接口配置!, [
                { role: 'system', content: '你只输出严格 JSON。' },
                { role: 'user', content: prompt }
            ], { temperature: 0.7, errorDetailLimit: Number.POSITIVE_INFINITY });
            const parsed = 解析AI框架JSON(raw);
            const worldPatch = parsed?.worldPatch && typeof parsed.worldPatch === 'object' ? parsed.worldPatch : {};
            setWorldConfig(prev => ({
                ...prev,
                worldName: typeof worldPatch.worldName === 'string' && worldPatch.worldName.trim() ? worldPatch.worldName.trim() : prev.worldName,
                dynastySetting: typeof worldPatch.dynastySetting === 'string' && worldPatch.dynastySetting.trim() ? worldPatch.dynastySetting.trim() : prev.dynastySetting,
                tianjiaoSetting: typeof worldPatch.tianjiaoSetting === 'string' && worldPatch.tianjiaoSetting.trim() ? worldPatch.tianjiaoSetting.trim() : prev.tianjiaoSetting,
                worldExtraRequirement: [prev.worldExtraRequirement.trim(), typeof worldPatch.worldExtraRequirement === 'string' ? worldPatch.worldExtraRequirement.trim() : ''].filter(Boolean).join('\n\n')
            }));

            const nextBackground = 标准化背景(parsed?.character?.背景);
            if (nextBackground) {
                设置自定义背景列表(prev => 合并去重背景([...prev, nextBackground]));
                setSelectedBackground(nextBackground);
            }
            const nextTalents = Array.isArray(parsed?.character?.天赋列表)
                ? parsed.character.天赋列表.map((item: 天赋结构) => 标准化天赋(item)).filter(Boolean) as 天赋结构[]
                : [];
            if (nextTalents.length > 0) {
                设置自定义天赋列表(prev => 合并去重天赋([...prev, ...nextTalents]));
                setSelectedTalents(nextTalents.slice(0, 3));
            }
            if (typeof parsed?.character?.外貌 === 'string' && parsed.character.外貌.trim()) setCharAppearance(parsed.character.外貌.trim());
            if (typeof parsed?.character?.性格 === 'string' && parsed.character.性格.trim()) setCharPersonality(parsed.character.性格.trim());

            const nextPartner = parsed?.partner && typeof parsed.partner === 'object' ? parsed.partner : {};
            setPartnerEnabled(nextPartner.enabled !== false);
            if (typeof nextPartner.姓名 === 'string' && nextPartner.姓名.trim()) setPartnerName(nextPartner.姓名.trim());
            if (typeof nextPartner.性别 === 'string' && nextPartner.性别.trim()) setPartnerGender(nextPartner.性别.trim());
            if (Number.isFinite(Number(nextPartner.年龄))) setPartnerAge(Math.max(1, Math.min(999, Math.round(Number(nextPartner.年龄)))));
            if (typeof nextPartner.外貌 === 'string' && nextPartner.外貌.trim()) setPartnerAppearance(nextPartner.外貌.trim());
            if (typeof nextPartner.性格 === 'string' && nextPartner.性格.trim()) setPartnerPersonality(nextPartner.性格.trim());
            if (typeof nextPartner.关系 === 'string' && nextPartner.关系.trim()) setPartnerRelation(nextPartner.关系.trim());
            if (typeof nextPartner.备注 === 'string' && nextPartner.备注.trim()) setPartnerNote(nextPartner.备注.trim());
            const nextPartnerBackground = 标准化背景(nextPartner.背景);
            if (nextPartnerBackground) {
                设置自定义背景列表(prev => 合并去重背景([...prev, nextPartnerBackground]));
                setPartnerBackground(nextPartnerBackground);
            }
            const nextPartnerTalents = Array.isArray(nextPartner.天赋列表)
                ? nextPartner.天赋列表.map((item: 天赋结构) => 标准化天赋(item)).filter(Boolean) as 天赋结构[]
                : [];
            if (nextPartnerTalents.length > 0) {
                设置自定义天赋列表(prev => 合并去重天赋([...prev, ...nextPartnerTalents]));
                setPartnerTalents(nextPartnerTalents.slice(0, 3));
            }
            if (typeof parsed?.openingExtraRequirement === 'string' && parsed.openingExtraRequirement.trim()) {
                setOpeningExtraRequirement(prev => [prev.trim(), parsed.openingExtraRequirement.trim()].filter(Boolean).join('\n\n'));
            }
            setAiFrameworkStatus({ type: 'success', message: 'AI 已补全背景、天赋、伙伴与开局要求，可继续微调或直接生成。' });
        } catch (error: any) {
            setAiFrameworkStatus({ type: 'error', message: `AI 补全失败：${error?.message || '未知错误'}` });
        }
    };
    const 读取UTF8文本文件 = async (file: File): Promise<string> => (
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
            reader.readAsText(file, 'utf-8');
        })
    );
    const 导出文本文件 = (filename: string, content: string) => {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };
    const 导入手动提示词文件 = async (
        event: React.ChangeEvent<HTMLInputElement>,
        field: 'manualWorldPrompt' | 'manualRealmPrompt'
    ) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const text = await 读取UTF8文本文件(file);
            setWorldConfig((prev) => ({
                ...prev,
                [field]: text
            }));
        } catch (error: any) {
            alert(error?.message || '读取文件失败');
        }
    };
    const 导出手动世界观提示词 = () => {
        const content = worldConfig.manualWorldPrompt.trim();
        if (!content) {
            alert('当前没有可导出的手动世界观提示词。');
            return;
        }
        导出文本文件(`${worldConfig.worldName || 'world'}-世界观提示词.txt`, content);
    };
    const 导出手动境界提示词 = () => {
        const content = worldConfig.manualRealmPrompt.trim();
        if (!content) {
            alert('当前没有可导出的手动境界提示词。');
            return;
        }
        导出文本文件(`${worldConfig.worldName || 'world'}-境界提示词.txt`, content);
    };
    const 导出境界提示词模板 = () => {
        导出文本文件('境界提示词模板.txt', 默认境界母板提示词);
    };
    const 导出世界观生成请求提示词 = () => {
        导出文本文件(`${worldConfig.worldName || 'world'}-开局世界观生成请求.txt`, 当前世界观生成提示词预览);
        set世界观生成提示词状态(`已导出${世界观请求模式}请求。`);
        window.setTimeout(() => set世界观生成提示词状态(''), 2200);
    };
    const 复制世界观生成请求提示词 = async () => {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error('当前浏览器不支持剪贴板写入');
            }
            await navigator.clipboard.writeText(当前世界观生成提示词预览);
            set世界观生成提示词状态(`已复制${世界观请求模式}请求。`);
        } catch (error) {
            导出文本文件(`${worldConfig.worldName || 'world'}-开局世界观生成请求.txt`, 当前世界观生成提示词预览);
            set世界观生成提示词状态('复制失败，已改为导出文本文件。');
        }
        window.setTimeout(() => set世界观生成提示词状态(''), 2600);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (monthRef.current && monthRef.current.contains(target)) return;
            if (dayRef.current && dayRef.current.contains(target)) return;
            setMonthOpen(false);
            setDayOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const 加载自定义建角配置 = async () => {
            try {
                const [savedTalents, savedBackgrounds, savedStartPresets, savedNovelDatasets, workshopModules] = await Promise.all([
                    dbService.读取设置(自定义天赋存储键),
                    dbService.读取设置(自定义背景存储键),
                    dbService.读取设置(自定义开局预设存储键),
                    读取小说拆分数据集列表(),
                    列出创意工坊模块().catch(() => [] as 创意工坊模块条目[])
                ]);
                if (Array.isArray(savedTalents)) {
                    设置自定义天赋列表(合并去重天赋(savedTalents as 天赋结构[]));
                }
                if (Array.isArray(savedBackgrounds)) {
                    设置自定义背景列表(合并去重背景(savedBackgrounds as 背景结构[]));
                }
                if (Array.isArray(savedStartPresets)) {
                    设置自定义开局预设列表(合并去重开局预设方案(savedStartPresets.map(item => 标准化开局预设方案(item)).filter(Boolean) as 开局预设方案结构[]));
                }
                if (Array.isArray(workshopModules)) {
                    设置创意工坊模块列表(workshopModules.filter((item) => item.type === 'topic'));
                }
                设置小说拆分数据集列表(savedNovelDatasets);
            } catch (error) {
                console.error('加载自定义身份/天赋/开局方案失败', error);
            }
        };
        加载自定义建角配置();
    }, []);

    useEffect(() => {
        if (!openingConfig.同人融合.附加小说数据集ID) return;
        if (小说拆分数据集列表.some((item) => item.id === openingConfig.同人融合.附加小说数据集ID)) return;
        setOpeningConfig((prev) => ({
            ...prev,
            同人融合: {
                ...prev.同人融合,
                启用附加小说: false,
                附加小说数据集ID: ''
            }
        }));
    }, [openingConfig.同人融合.附加小说数据集ID, 小说拆分数据集列表]);

    const handleStatChange = (key: keyof typeof stats, delta: number) => {
        const current = stats[key];
        if (delta > 0 && remainingPoints <= 0) return;
        if (delta < 0 && current <= 属性最小值) return;
        if (delta > 0 && current >= 属性最大值) return;
        setStats({ ...stats, [key]: current + delta });
    };

    const 平均分配主角属性 = () => setStats(创建平均属性分配(totalStatBudget));
    const 随机分配主角属性 = () => setStats(创建随机属性分配(totalStatBudget));

    const toggleRelationFocus = (value: OpeningConfig['关系侧重'][number]) => {
        setOpeningConfig((prev) => {
            const exists = prev.关系侧重.includes(value);
            if (exists) {
                return {
                    ...prev,
                    关系侧重: prev.关系侧重.filter((item) => item !== value)
                };
            }
            if (prev.关系侧重.length >= 2) {
                return prev;
            }
            return {
                ...prev,
                关系侧重: [...prev.关系侧重, value]
            };
        });
    };

    const 选择附加小说数据集 = (datasetId: string) => {
        const matched = 小说拆分数据集列表.find((item) => item.id === datasetId) || null;
        setOpeningConfig((prev) => ({
            ...prev,
            同人融合: {
                ...prev.同人融合,
                启用附加小说: Boolean(datasetId),
                附加小说数据集ID: datasetId,
                作品名: matched?.作品名 || matched?.标题 || prev.同人融合.作品名,
                来源类型: '小说'
            }
        }));
    };
    const 新增附加角色替换规则 = () => {
        setOpeningConfig((prev) => ({
            ...prev,
            同人融合: {
                ...prev.同人融合,
                附加角色替换规则列表: [
                    ...prev.同人融合.附加角色替换规则列表,
                    { 原名称: '', 替换为: '' }
                ]
            }
        }));
    };
    const 更新附加角色替换规则 = (
        index: number,
        field: '原名称' | '替换为',
        value: string
    ) => {
        setOpeningConfig((prev) => ({
            ...prev,
            同人融合: {
                ...prev.同人融合,
                附加角色替换规则列表: prev.同人融合.附加角色替换规则列表.map((rule, ruleIndex) => (
                    ruleIndex === index
                        ? { ...rule, [field]: value }
                        : rule
                ))
            }
        }));
    };
    const 删除附加角色替换规则 = (index: number) => {
        setOpeningConfig((prev) => ({
            ...prev,
            同人融合: {
                ...prev.同人融合,
                附加角色替换规则列表: prev.同人融合.附加角色替换规则列表.filter((_, ruleIndex) => ruleIndex !== index)
            }
        }));
    };

    const 校验属性点是否合法 = (): boolean => {
        if (remainingPoints < 0) {
            alert(`当前属性总点数超过 ${worldConfig.difficulty.toUpperCase()} 难度上限，请先回收 ${Math.abs(remainingPoints)} 点。`);
            setStep(2);
            return false;
        }
        if (partnerEnabled && partnerRemainingPoints < 0) {
            alert(`开局伙伴属性总点数超过 ${worldConfig.difficulty.toUpperCase()} 难度上限，请先回收 ${Math.abs(partnerRemainingPoints)} 点。`);
            setStep(3);
            return false;
        }
        return true;
    };

    const handleNextStep = () => {
        if (step === 2 && !校验属性点是否合法()) return;
        if (step === 3 && !校验属性点是否合法()) return;
        setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    };

    const togglePartnerTalent = (t: 天赋结构) => {
        if (partnerTalents.find(x => x.名称 === t.名称)) {
            setPartnerTalents(partnerTalents.filter(x => x.名称 !== t.名称));
            return;
        }
        if (!是否允许玩家自选天赋(t)) {
            alert('隐藏天赋不能作为伙伴自选。');
            return;
        }
        if (partnerTalents.length >= 3) {
            alert("伙伴最多选择3个天赋");
            return;
        }
        setPartnerTalents([...partnerTalents, t]);
    };

    const 更新伙伴属性 = (key: keyof 属性结构, value: number) => {
        setPartnerStats(prev => ({ ...prev, [key]: Math.max(属性最小值, Math.min(属性最大值, value)) }));
    };
    const 平均分配伙伴属性 = () => setPartnerStats(创建平均属性分配(totalStatBudget));
    const 随机分配伙伴属性 = () => setPartnerStats(创建随机属性分配(totalStatBudget));

    const toggleTalent = (t: 天赋结构) => {
        if (selectedTalents.find(x => x.名称 === t.名称)) {
            setSelectedTalents(selectedTalents.filter(x => x.名称 !== t.名称));
            return;
        }
        if (!是否允许玩家自选天赋(t)) {
            alert('隐藏天赋不能作为玩家自选，请通过背景自带引用注入。');
            return;
        }
        if (selectedTalents.length >= 3) {
            alert("最多选择3个天赋");
            return;
        }
        setSelectedTalents([...selectedTalents, t]);
    };

    const addCustomTalent = async () => {
        const normalized = 标准化天赋(customTalent);
        if (!normalized) {
            alert("请完整填写自定义天赋（名称/描述/效果）");
            return;
        }
        if (预设天赋.some(item => item.名称 === normalized.名称) && 正在编辑天赋名 !== normalized.名称) {
            alert('该天赋名称与系统预设重复，请改名后保存。');
            return;
        }
        const 原名称 = 正在编辑天赋名 || normalized.名称;
        const 已选同名 = selectedTalents.some(x => x.名称 === 原名称 || x.名称 === normalized.名称);
        const 可写入玩家自选 = 是否允许玩家自选天赋(normalized);
        if (可写入玩家自选 && !已选同名 && selectedTalents.length >= 3) {
            alert("最多选择3个天赋");
            return;
        }
        const 下一个自定义天赋列表 = 合并去重天赋([
            ...自定义天赋列表.filter(item => item.名称 !== 原名称 && item.名称 !== normalized.名称),
            normalized
        ]);
        设置自定义天赋列表(下一个自定义天赋列表);
        setSelectedTalents(prev => {
            const withoutOriginal = prev.filter(item => item.名称 !== 原名称 && item.名称 !== normalized.名称);
            if (!可写入玩家自选) return withoutOriginal;
            if (已选同名) return [...withoutOriginal, normalized];
            return [...withoutOriginal, normalized];
        });
        重置自定义天赋编辑();
        try {
            await dbService.保存设置(自定义天赋存储键, 下一个自定义天赋列表);
        } catch (error) {
            console.error('保存自定义天赋失败', error);
        }
    };

    const addCustomBackground = async () => {
        const normalized = 标准化背景(customBackground);
        if (!normalized) {
            alert("请完整填写自定义身份（名称/描述/效果）");
            return;
        }
        if (预设背景.some(item => item.名称 === normalized.名称) && 正在编辑背景名 !== normalized.名称) {
            alert('该身份名称与系统预设重复，请改名后保存。');
            return;
        }
        const 原名称 = 正在编辑背景名 || normalized.名称;
        const 下一个自定义背景列表 = 合并去重背景([
            ...自定义背景列表.filter(item => item.名称 !== 原名称 && item.名称 !== normalized.名称),
            normalized
        ]);
        设置自定义背景列表(下一个自定义背景列表);
        setSelectedBackground(normalized);
        重置自定义背景编辑();
        try {
            await dbService.保存设置(自定义背景存储键, 下一个自定义背景列表);
        } catch (error) {
            console.error('保存自定义身份失败', error);
        }
    };

    const 编辑自定义天赋 = (item: 天赋结构) => {
        setCustomTalent(item);
        set正在编辑天赋名(item.名称);
        setShowCustomTalent(true);
    };
    const 删除自定义天赋 = async (name: string) => {
        const nextList = 自定义天赋列表.filter(item => item.名称 !== name);
        设置自定义天赋列表(nextList);
        setSelectedTalents(prev => prev.filter(item => item.名称 !== name));
        if (正在编辑天赋名 === name) {
            重置自定义天赋编辑();
        }
        try {
            await dbService.保存设置(自定义天赋存储键, nextList);
        } catch (error) {
            console.error('删除自定义天赋失败', error);
        }
    };
    const 编辑自定义背景 = (item: 背景结构) => {
        setCustomBackground(item);
        set正在编辑背景名(item.名称);
        setShowCustomBackground(true);
    };
    const 删除自定义背景 = async (name: string) => {
        const nextList = 自定义背景列表.filter(item => item.名称 !== name);
        设置自定义背景列表(nextList);
        if (selectedBackground.名称 === name) {
            setSelectedBackground(预设背景[0]);
        }
        if (正在编辑背景名 === name) {
            重置自定义背景编辑();
        }
        try {
            await dbService.保存设置(自定义背景存储键, nextList);
        } catch (error) {
            console.error('删除自定义身份失败', error);
        }
    };

    const 构建当前表单开局预设 = (meta?: Partial<自定义开局预设元信息> & { id?: string }): 开局预设方案结构 => {
        const effectiveOpeningConfig = 构建有效开局配置();
        const runtimeSnapshot = 构建开局运行时快照({
            openingConfig: effectiveOpeningConfig,
            openingStreaming: effectiveOpeningStreaming,
            openingExtraRequirement: openingExtraRequirement.trim(),
            activeModuleExtraRules: activeModuleExtraRules.trim(),
            modeWorldbooks: 模式包世界书列表,
            workshopSelection: {
                selectedMode: 已选创意工坊模式,
                selectedModules: 已选创意工坊子项
            },
            modeBackgrounds: 模式包背景列表,
            modeTalents: 模式包天赋列表
        });
        return {
            id: meta?.id || 正在编辑开局预设ID || 生成自定义开局预设ID(),
            名称: meta?.名称?.trim() || customPresetMeta.名称.trim(),
            简介: meta?.简介?.trim() || customPresetMeta.简介.trim() || '自定义开局方案',
            worldConfig: {
                ...worldConfig,
                worldExtraRequirement: worldConfig.worldExtraRequirement?.trim() || '',
                manualWorldPrompt: worldConfig.manualWorldPrompt?.trim() || '',
                manualRealmPrompt: worldConfig.manualRealmPrompt?.trim() || ''
            },
            character: {
                姓名: charName.trim(),
                性别: charGender.trim(),
                年龄: charAge,
                出生月: birthMonth,
                出生日: birthDay,
                外貌: charAppearance.trim(),
                性格: charPersonality.trim(),
                属性: { ...stats },
                背景名称: selectedBackground?.名称 || '',
                天赋名称列表: selectedTalents.map(item => item.名称).slice(0, 3)
            },
            openingConfig: effectiveOpeningConfig
                ? {
                    ...effectiveOpeningConfig,
                    ...(runtimeSnapshot ? { runtimeSnapshot } : {})
                }
                : undefined,
            openingStreaming: effectiveOpeningStreaming,
            openingExtraRequirement: openingExtraRequirement.trim()
        };
    };

    const 保存自定义开局预设列表 = async (nextList: 开局预设方案结构[]) => {
        设置自定义开局预设列表(nextList);
        try {
            await dbService.保存设置(自定义开局预设存储键, nextList);
        } catch (error) {
            console.error('保存自定义开局方案失败', error);
        }
    };

    const 保存当前为自定义开局方案 = async () => {
        const 名称 = customPresetMeta.名称.trim();
        if (!名称) {
            alert('请先填写方案名称');
            return;
        }
        const 目标ID = 正在编辑开局预设ID || '';
        const 名称冲突 = 自定义开局预设列表.some(item => item.名称 === 名称 && item.id !== 目标ID);
        if (名称冲突) {
            alert('该方案名称已存在，请改名后保存。');
            return;
        }
        const nextPreset = 标准化开局预设方案(构建当前表单开局预设());
        if (!nextPreset) {
            alert('当前方案内容无效，无法保存。');
            return;
        }
        const nextList = 合并去重开局预设方案([
            ...自定义开局预设列表.filter(item => item.id !== nextPreset.id),
            nextPreset
        ]);
        await 保存自定义开局预设列表(nextList);
        重置自定义开局预设编辑();
    };

    const 编辑自定义开局方案信息 = (preset: 开局预设方案结构) => {
        setCustomPresetMeta({ 名称: preset.名称, 简介: preset.简介 || '' });
        set正在编辑开局预设ID(preset.id);
        setShowCustomPresetEditor(true);
        setStep(0);
    };

    const 用当前配置覆盖开局方案 = async (preset: 开局预设方案结构) => {
        const nextPreset = 标准化开局预设方案(构建当前表单开局预设({
            id: preset.id,
            名称: preset.名称,
            简介: preset.简介
        }));
        if (!nextPreset) return;
        const nextList = 合并去重开局预设方案([
            ...自定义开局预设列表.filter(item => item.id !== preset.id),
            nextPreset
        ]);
        await 保存自定义开局预设列表(nextList);
    };

    const 删除自定义开局方案 = async (presetId: string) => {
        const nextList = 自定义开局预设列表.filter(item => item.id !== presetId);
        await 保存自定义开局预设列表(nextList);
        if (正在编辑开局预设ID === presetId) {
            重置自定义开局预设编辑();
        }
    };

    const handleGenerate = async (preset?: 开局预设方案结构) => {
        const presetRestoreCatalog = preset ? 构建预设恢复候选池(preset) : null;
        const presetRuntime = preset
            ? 构建预设直开恢复结果(preset, {
                validModuleKeys: 恢复链有效模块键,
                ...(presetRestoreCatalog || {})
            })
            : null;
        const effectiveWorldConfig = presetRuntime?.worldConfig || worldConfig;
        const effectiveOpeningConfig = presetRuntime?.openingConfig || 构建有效开局配置();
        const effectiveBackground = presetRuntime?.selectedBackground || selectedBackground;
        if (effectiveBackground?.初始物品?.length && effectiveOpeningConfig?.modeRuntimeProfile) {
            const 初始物品名称列表 = effectiveBackground.初始物品
                .map((item: any) => {
                    if (typeof item === 'string') return item;
                    const name = item?.名称?.trim();
                    return name || null;
                })
                .filter(Boolean);
            effectiveOpeningConfig.modeRuntimeProfile = {
                ...effectiveOpeningConfig.modeRuntimeProfile,
                items: {
                    ...effectiveOpeningConfig.modeRuntimeProfile.items,
                    initialItemPool: 初始物品名称列表
                }
            };
        }
        const effectiveName = preset?.character.姓名 ?? charName;
        const effectiveGender = preset?.character.性别 ?? charGender;
        const effectiveRoleReplaceRules = 获取同人角色替换规则列表(effectiveOpeningConfig, effectiveName);
        if (!effectiveName.trim()) {
            alert("请先填写角色姓名");
            setStep(2);
            return;
        }
        if (!effectiveGender.trim()) {
            alert("请先填写角色性别");
            setStep(2);
            return;
        }
        if (!preset && !校验属性点是否合法()) return;
        if (!preset && partnerEnabled && !partnerName.trim()) {
            alert("已启用开局伙伴，请先填写伙伴姓名，或关闭伙伴。");
            setStep(3);
            return;
        }
        if (!preset && partnerEnabled && !partnerGender.trim()) {
            alert("已启用开局伙伴，请先填写伙伴性别，或关闭伙伴。");
            setStep(3);
            return;
        }
        if (effectiveOpeningConfig?.同人融合.enabled && !effectiveOpeningConfig.同人融合.作品名.trim()) {
            alert('已启用同人融合，请先填写作品名。');
            setStep(0);
            return;
        }
        if (
            effectiveOpeningConfig?.同人融合.enabled
            && effectiveOpeningConfig.同人融合.启用附加小说
            && !effectiveOpeningConfig.同人融合.附加小说数据集ID.trim()
        ) {
            alert('已启用附加小说，请先选择一个小说分解数据集。');
            setStep(0);
            return;
        }
        if (
            effectiveOpeningConfig?.同人融合.enabled
            && effectiveOpeningConfig.同人融合.启用角色替换
            && effectiveRoleReplaceRules.length <= 0
        ) {
            alert('已启用同人角色替换，请先填写至少一条有效替换规则。');
            setStep(0);
            return;
        }
        const charData = (() => {
            if (!preset) return 构建角色数据();
            const 预设成角背景 = presetRuntime?.selectedBackground || 根据名称查找背景(preset.character.背景名称);
            const 预设玩家自选天赋 = presetRuntime?.selectedTalents?.length
                ? presetRuntime.selectedTalents
                : 根据名称查找天赋列表(preset.character.天赋名称列表);
            const 预设天赋目录 = 合并去重天赋([
                ...(presetRuntime?.全部天赋选项 || []),
                ...全部天赋选项
            ]);
            return 构建角色数据({
                角色名: preset.character.姓名,
                性别: preset.character.性别,
                年龄: preset.character.年龄,
                外貌: preset.character.外貌,
                性格: preset.character.性格,
                出生月: preset.character.出生月,
                出生日: preset.character.出生日,
                属性: preset.character.属性,
                背景: 预设成角背景,
                天赋列表: 合并玩家与背景天赋({
                    玩家自选: 过滤玩家可自选天赋(预设玩家自选天赋),
                    背景: 预设成角背景,
                    天赋目录: 预设天赋目录,
                    onMiss: 报告背景自带天赋解析缺失
                })
            });
        })();
        const runtimeRestore = preset
            ? 构建预设直开恢复结果({
                ...preset,
                openingConfig: effectiveOpeningConfig,
                openingExtraRequirement: preset?.openingExtraRequirement ?? openingExtraRequirement
            }, {
                validModuleKeys: 恢复链有效模块键
            })
            : 获取快速重开运行时恢复参数({
                openingConfig: effectiveOpeningConfig,
                openingExtraRequirement: openingExtraRequirement,
                activeModuleExtraRules,
                openingStreaming: effectiveOpeningStreaming,
                validModuleKeys: 恢复链有效模块键
            });
        const effectiveOpeningExtraRequirement = runtimeRestore.openingExtraRequirement || '';
        const runtimeOpeningConfig = runtimeRestore.modeRuntimeProfile || runtimeRestore.runtimeSnapshot
            ? {
                ...effectiveOpeningConfig,
                ...(runtimeRestore.modeRuntimeProfile ? { modeRuntimeProfile: runtimeRestore.modeRuntimeProfile } : {}),
                ...(runtimeRestore.runtimeSnapshot ? { runtimeSnapshot: runtimeRestore.runtimeSnapshot } : {})
            }
            : effectiveOpeningConfig;
        const runtimeWorldConfig = (runtimeRestore.modeRuntimeProfile
            ? { ...effectiveWorldConfig, modeRuntimeProfile: runtimeRestore.modeRuntimeProfile }
            : effectiveWorldConfig) as WorldGenConfig;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '确认创建',
                message: runtimeRestore.openingStreaming
                    ? '开局将直接以流式方式生成并展示开场剧情。是否继续创建？'
                    : '开局将以非流式方式生成并展示开场剧情。是否继续创建？',
                confirmText: '开始生成'
            })
            : true;
        if (!ok) return;
        onComplete(
            runtimeWorldConfig,
            charData,
            runtimeOpeningConfig as OpeningConfig | undefined,
            'all',
            runtimeRestore.openingStreaming,
            effectiveOpeningExtraRequirement.trim(),
            runtimeRestore.activeModuleExtraRules || undefined
        );
    };

    if (loading) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-black/90 text-wuxia-gold z-50">
                <div className="text-2xl font-serif font-bold animate-pulse mb-2">正在生成...</div>
                <div className="text-xs font-mono text-gray-500">请稍候</div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex bg-black relative overflow-hidden z-50">
            {/* Background */}
            <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: 'url(/assets/images/world_map_bg.jpg)' }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/90 backdrop-blur-md"></div>
            
            {/* Left Sidebar Navigation */}
            <div className="relative z-10 w-72 border-r border-gray-800 bg-black/60 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
                <div className="p-8 border-b border-gray-800">
                    <div className="text-[10px] tracking-[0.4em] text-wuxia-gold/60 font-mono mb-2">WORLD GENESIS</div>
                    <h2 className="text-4xl font-serif font-bold text-wuxia-gold" style={{ fontFamily: 'var(--ui-页面标题-font-family, inherit)' }}>创世录</h2>
                </div>
                
                <div className="flex-1 py-6 px-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                    {STEPS.map((s, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                if (step === 2 && idx !== 2 && !校验属性点是否合法()) return;
                                if (step === 3 && idx !== 3 && !校验属性点是否合法()) return;
                                setStep(idx);
                            }}
                            className={`w-full text-left px-5 py-4 rounded-xl transition-all duration-300 flex items-center gap-4 group ${
                                step === idx 
                                    ? 'bg-gradient-to-r from-wuxia-gold/20 to-transparent border-l-4 border-wuxia-gold text-wuxia-gold shadow-[inset_0_0_20px_rgba(212,175,55,0.05)]' 
                                    : 'border-l-4 border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'
                            }`}
                        >
                            <span className={`font-mono text-sm transition-colors ${step === idx ? 'text-wuxia-gold' : 'text-gray-600 group-hover:text-gray-400'}`}>0{idx + 1}</span>
                            <span className="font-bold tracking-wider text-[15px]">{s}</span>
                        </button>
                    ))}
                </div>
                
                <div className="p-6 border-t border-gray-800 bg-black/40">
                    <GameButton onClick={onCancel} variant="secondary" className="w-full py-3 !border-red-500/30 !text-red-500/80 hover:!bg-red-500/10 hover:!text-red-500 hover:!border-red-500/60 transition-all">
                        放弃创建
                    </GameButton>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col overflow-hidden bg-ink-wash/5">
                <div className="h-16 border-b border-gray-800/60 bg-black/40 flex items-center px-8 shadow-sm">
                    <span className="text-sm font-bold text-wuxia-gold tracking-widest">{currentStepLabel}</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative">
                    
                    {/* STEP 1: WORLD SETTINGS */}
                    {step === 0 && (
                        <div className="animate-slide-in max-w-4xl mx-auto">
                            <OrnateBorder className="p-4 md:p-8">
                                <h3 className="text-xl font-serif font-bold text-wuxia-gold border-b border-wuxia-gold/30 pb-3 mb-6">世界法则设定</h3>
                                
                                <div className="space-y-6">
                                    {自定义开局预设列表.length > 0 && (
                                        <div className="rounded-2xl border border-wuxia-gold/25 bg-wuxia-gold/5 p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm text-wuxia-gold font-bold">开局预设方案</div>
                                                    <div className="text-[11px] text-gray-500 mt-1">保存后的方案会优先出现在世界观页，可直接套用、编辑或跳过表单步骤直接开局。</div>
                                                </div>
                                                <span className="text-[10px] text-wuxia-cyan font-mono tracking-[0.18em]">CUSTOM</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {自定义开局预设列表.map((preset) => (
                                                    <div key={preset.id} className="rounded-xl border border-gray-700/80 bg-black/35 p-4 space-y-3">
                                                        <div>
                                                            <div className="text-base font-serif text-wuxia-gold">{preset.名称}</div>
                                                            <div className="text-xs text-gray-400 mt-1 leading-5 line-clamp-2">{preset.简介 || '自定义开局方案'}</div>
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 leading-5">
                                                            {preset.character.姓名 || '未命名主角'} / {preset.character.性别 || '未设性别'} / {preset.character.背景名称 || '未设背景'}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <GameButton onClick={() => 应用预设到表单(preset)} variant="secondary" className="py-2 text-xs">套用查看</GameButton>
                                                            <GameButton onClick={() => { void handleGenerate(preset); }} variant="primary" className="py-2 text-xs">以此方案开局</GameButton>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <button type="button" onClick={() => 编辑自定义开局方案信息(preset)} className="text-[11px] text-wuxia-cyan hover:text-white">编辑信息</button>
                                                            <button type="button" onClick={() => { void 用当前配置覆盖开局方案(preset); }} className="text-[11px] text-wuxia-gold hover:text-white">覆盖保存</button>
                                                            <button type="button" onClick={() => { void 删除自定义开局方案(preset.id); }} className="text-[11px] text-red-400 hover:text-red-200">删除</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="text-sm text-emerald-300 font-bold">创意工坊模式</div>
                                                <div className="mt-1 text-[11px] leading-6 text-gray-400">
                                                    模式包现在以“模式专属世界书”为核心，一次选择就会写入题材口径、世界规则与能力体系。开局配置仍保留在新建存档流程里单独调整。
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-emerald-200 font-mono tracking-[0.18em]">WORKSHOP</span>
                                        </div>
                                        <InlineSelect
                                            value={已选创意工坊模式}
                                            options={[
                                                { value: '', label: '不使用工坊模式' },
                                                ...题材模式顺序.map((mode) => ({ value: mode, label: `${mode}模式` }))
                                            ]}
                                            onChange={选择创意工坊模式}
                                            disabled={创意工坊注入中 || 创意工坊模块列表.length <= 0}
                                        />
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {(() => {
                                                const type: 创意工坊模块类型 = 'topic';
                                                const selectedKey = 已选创意工坊子项[type] || '';
                                                const selectedEntry = selectedKey ? 按键查找创意工坊模块(selectedKey) : null;
                                                const options = 创意工坊模块列表.filter((entry) => entry.type === type);
                                                return (
                                                    <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2 md:col-span-2">
                                                        <div className="text-[11px] font-bold text-emerald-200">{创意工坊类型标签[type]}</div>
                                                        <InlineSelect
                                                            value={selectedKey}
                                                            options={[
                                                                { value: '', label: '不使用模式包' },
                                                                ...options.map((entry) => ({
                                                                    value: 创意工坊模块键(entry),
                                                                    label: `${读取模块模式(entry) || '通用'} · ${entry.title}`
                                                                }))
                                                            ]}
                                                            onChange={(moduleKey) => 选择创意工坊子项(type, moduleKey)}
                                                            disabled={创意工坊注入中 || options.length <= 0}
                                                        />
                                                        {selectedEntry && (
                                                            <div className="text-[11px] leading-5 text-gray-400">
                                                                {selectedEntry.injectionPreview.slice(0, 4).map((line, index) => <div key={`${selectedKey}-${index}`}>- {line}</div>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        {创意工坊注入状态 && (
                                            <div className={`text-[11px] ${创意工坊注入状态.includes('失败') ? 'text-red-300' : 'text-emerald-200'}`}>{创意工坊注入状态}</div>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-wuxia-gold/20 bg-black/30 p-4 space-y-4">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="text-sm text-wuxia-gold font-bold">题材模式</div>
                                                <div className="mt-1 text-[11px] leading-6 text-gray-400">
                                                    {当前题材显示摘要.hint} 题材会同步影响世界观、身份背景、天赋卷宗、地图版图、势力密度、市场入口和预设物品。
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-wuxia-cyan font-mono tracking-[0.18em]">{当前题材显示摘要.shortLabel}</div>
                                        </div>
                                        <InlineSelect
                                            value={openingConfig.题材模式}
                                            options={题材模式选项.map((item) => ({ value: item.value, label: item.label }))}
                                            onChange={更新题材模式}
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-5">
                                            <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                                                <div className="text-gray-500">市场入口</div>
                                                <div className="mt-1 text-gray-200">{当前题材显示摘要.marketName}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                                                <div className="text-gray-500">{当前题材配置.densityLabel}</div>
                                                <div className="mt-1 text-gray-200">{worldConfig.sectDensity}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                                                <div className="text-gray-500">交易口径</div>
                                                <div className="mt-1 text-gray-200 line-clamp-2">{当前题材显示摘要.currencyPrompt}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/8 bg-black/30 p-3 md:col-span-3">
                                                <div className="text-gray-500">统一换算</div>
                                                <div className="mt-1 text-gray-200">{当前题材显示摘要.currencyExchangePrompt}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {openingConfig.modeRuntimeProfile && (
                                        <NewGameCurrencySystemSetup
                                            profile={openingConfig.modeRuntimeProfile}
                                            onChangeProfile={更新开局货币系统}
                                            onUseLegacyCurrency={使用旧版三层货币系统}
                                            onTouched={(touched) => 设置货币偏好(touched ? 'custom' : 'follow_mode')}
                                        />
                                    )}
                                    {货币偏好 === 'legacy' ? (
                                        <div className="rounded-xl border border-wuxia-cyan/20 bg-wuxia-cyan/[0.06] px-3 py-2 text-[11px] leading-5 text-wuxia-cyan">
                                            当前已切换为旧版三层货币系统，会保留题材的 currencyTiers；如需重新启用新版动态货币，请在上方选择“题材默认”或其他模板。
                                        </div>
                                    ) : 货币偏好 === 'custom' && (
                                        <div className="rounded-xl border border-wuxia-gold/15 bg-wuxia-gold/[0.04] px-3 py-2 text-[11px] leading-5 text-wuxia-gold">
                                            已保留你自定义的货币系统；如需使用题材默认，可在上方重新选择“题材默认”模板。
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">世界名称</label>
                                            <input 
                                                value={worldConfig.worldName}
                                                onChange={e => setWorldConfig({...worldConfig, worldName: e.target.value})}
                                                className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">游戏难度</label>
                                            <InlineSelect
                                                value={worldConfig.difficulty}
                                                options={难度下拉选项}
                                                onChange={(difficulty) => setWorldConfig({ ...worldConfig, difficulty })}
                                            />
                                        </div>
                                        <div className="md:col-span-2 rounded-2xl border border-wuxia-gold/20 bg-black/30 p-4">
                                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-bold text-wuxia-gold">
                                                        {当前难度设定.label} · {当前难度设定.shortLabel}
                                                    </div>
                                                    <div className="mt-1 text-xs leading-6 text-gray-400">{当前难度设定.description}</div>
                                                </div>
                                                <div className="text-[11px] text-gray-500 md:text-right">推荐：{当前难度设定.推荐人群}</div>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-3">
                                                    <div className="text-gray-500">起始属性点</div>
                                                    <div className="mt-1 text-lg font-mono text-wuxia-gold">{当前难度设定.起始属性点}</div>
                                                </div>
                                                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-3">
                                                    <div className="text-gray-500">天赋重 roll</div>
                                                    <div className="mt-1 text-lg font-mono text-wuxia-cyan">{当前难度设定.天赋重Roll次数}</div>
                                                </div>
                                                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-3">
                                                    <div className="text-gray-500">玩家判定修正</div>
                                                    <div className={`mt-1 text-lg font-mono ${当前难度设定.判定修正 >= 0 ? 'text-green-400' : 'text-red-400'}`}>{难度判定修正文本}</div>
                                                </div>
                                                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-3">
                                                    <div className="text-gray-500">失败代价</div>
                                                    <div className="mt-1 text-[11px] leading-5 text-gray-300">{当前难度设定.失败代价}</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-5 text-gray-400">
                                                <div>敌方强度：{当前难度设定.敌方强度}</div>
                                                <div>资源压力：{当前难度设定.资源压力}</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">{当前题材配置.worldSizeLabel}</label>
                                            <InlineSelect
                                                value={worldConfig.worldSize}
                                                options={世界版图下拉选项}
                                                onChange={(worldSize) => setWorldConfig({ ...worldConfig, worldSize })}
                                            />
                                            <div className="text-[11px] text-gray-500 leading-5">{当前题材配置.worldSizeHint}</div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">{当前题材配置.densityLabel}</label>
                                            <InlineSelect
                                                value={worldConfig.sectDensity}
                                                options={当前题材配置.densityOptions}
                                                onChange={(sectDensity) => setWorldConfig({ ...worldConfig, sectDensity })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">势力数量（留空由密度决定）</label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min={3}
                                                    max={15}
                                                    step={1}
                                                    value={worldConfig.factionCount ?? 8}
                                                    onChange={(e) => setWorldConfig({ ...worldConfig, factionCount: Number(e.target.value) })}
                                                    className="flex-1 accent-wuxia-gold"
                                                />
                                                <span className="text-wuxia-gold font-bold w-8 text-center">{worldConfig.factionCount ?? '自动'}</span>
                                            </div>
                                            <div className="text-[11px] text-gray-500 leading-5">拖动选择 3-15 个势力，或保持默认由 AI 根据题材和密度自行决定。</div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">自定义势力（可选）</label>
                                            <textarea
                                                value={worldConfig.customFactions || ''}
                                                onChange={(e) => setWorldConfig({ ...worldConfig, customFactions: e.target.value })}
                                                placeholder={'可预设势力名称、简介和等级，每行一个，例如：\n天机阁 - 江湖情报组织，等级7，掌控天下消息\n药王谷 - 医道世家，等级5，擅长炼丹解毒'}
                                                className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none font-serif"
                                            />
                                            <div className="text-[11px] text-gray-500 leading-5">AI 会优先使用这些势力，只在基础上补齐数量和细节。</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">{当前题材配置.dynastyLabel} (自定义)</label>
                                        <input 
                                            value={worldConfig.dynastySetting}
                                            onChange={e => setWorldConfig({...worldConfig, dynastySetting: e.target.value})}
                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider"
                                        />
                                        <div className="text-[11px] text-gray-500 leading-5">{当前题材配置.dynastyHint}</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">{当前题材配置.tianjiaoLabel} (自定义)</label>
                                        <textarea 
                                            value={worldConfig.tianjiaoSetting}
                                            onChange={e => setWorldConfig({...worldConfig, tianjiaoSetting: e.target.value})}
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">玩家世界观草稿与细化要求 (可选)</label>
                                        <textarea
                                            value={worldConfig.worldExtraRequirement}
                                            onChange={e => setWorldConfig({ ...worldConfig, worldExtraRequirement: e.target.value })}
                                            placeholder="可以写你已经想好的世界观片段、地名、势力、规则或风格。AI 会优先保留这些内容，只在基础上补全细节。"
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <div className="text-[11px] text-gray-500">仅作用于世界观提示词生成；AI 会按你的草稿细化，不直接改写角色初始状态。</div>
                                    </div>

                                    <div className="space-y-3 rounded-2xl border border-wuxia-gold/20 bg-black/25 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="text-sm text-wuxia-gold font-bold">{世界观请求模式}提示词</div>
                                                <div className="mt-1 text-[11px] leading-6 text-gray-500">
                                                    {worldConfig.worldExtraRequirement.trim() ? '会把上方草稿作为优先输入，请 AI 在此基础上细化。' : '未填写草稿时，会请 AI 从当前题材和世界参数生成完整世界母本。'}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <GameButton
                                                    onClick={() => set显示世界观生成提示词(prev => !prev)}
                                                    variant="secondary"
                                                    className="px-3 py-2 text-xs"
                                                >
                                                    {显示世界观生成提示词 ? '收起' : '查看'}
                                                </GameButton>
                                                <GameButton
                                                    onClick={() => { void 复制世界观生成请求提示词(); }}
                                                    variant="secondary"
                                                    className="px-3 py-2 text-xs"
                                                >
                                                    复制
                                                </GameButton>
                                                <GameButton
                                                    onClick={导出世界观生成请求提示词}
                                                    variant="secondary"
                                                    className="px-3 py-2 text-xs"
                                                >
                                                    导出
                                                </GameButton>
                                            </div>
                                        </div>
                                        {世界观生成提示词状态 && (
                                            <div className="text-[11px] text-green-400">{世界观生成提示词状态}</div>
                                        )}
                                        {显示世界观生成提示词 && (
                                            <textarea
                                                readOnly
                                                value={当前世界观生成提示词预览}
                                                className="h-72 w-full resize-y rounded-md border border-wuxia-gold/20 bg-black/50 p-3 font-mono text-[11px] leading-5 text-gray-200 outline-none custom-scrollbar"
                                            />
                                        )}
                                    </div>

                                    <div className="space-y-4 rounded-2xl border border-wuxia-cyan/20 bg-black/25 p-4">
                                        <div>
                                            <div className="text-sm text-wuxia-cyan font-bold">手动提示词文件</div>
                                            <div className="text-[11px] text-gray-500 mt-1 leading-6">
                                                可直接导入现成的世界观提示词或境界体系提示词。导入后会优先使用手动内容，不再请求对应的生成步骤；若两者都已提供，就会直接进入开局剧情生成。
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <label className="text-sm text-gray-200 font-bold">手动世界观提示词</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            ref={manualWorldPromptInputRef}
                                                            type="file"
                                                            accept=".txt,.md,text/plain,text/markdown"
                                                            className="hidden"
                                                            onChange={(event) => { void 导入手动提示词文件(event, 'manualWorldPrompt'); }}
                                                        />
                                                        <GameButton
                                                            onClick={() => manualWorldPromptInputRef.current?.click()}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-xs"
                                                        >
                                                            导入文件
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出手动世界观提示词}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-xs"
                                                            disabled={!worldConfig.manualWorldPrompt.trim()}
                                                        >
                                                            导出
                                                        </GameButton>
                                                        {worldConfig.manualWorldPrompt.trim() && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setWorldConfig((prev) => ({ ...prev, manualWorldPrompt: '' }))}
                                                                className="text-[11px] text-gray-500 hover:text-white"
                                                            >
                                                                清空
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={worldConfig.manualWorldPrompt}
                                                    onChange={(e) => setWorldConfig((prev) => ({ ...prev, manualWorldPrompt: e.target.value }))}
                                                    placeholder="支持直接粘贴 <世界观>...</世界观> 或 world_prompt 正文。"
                                                    className="w-full h-40 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-xs text-white outline-none rounded-md transition-all resize-none"
                                                />
                                                <div className="text-[11px] text-gray-500">留空则继续走世界观生成；填写后会直接写入 `core_world`，保存自定义开局方案时也会一并保存。</div>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <label className="text-sm text-gray-200 font-bold">手动境界提示词</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            ref={manualRealmPromptInputRef}
                                                            type="file"
                                                            accept=".txt,.md,text/plain,text/markdown"
                                                            className="hidden"
                                                            onChange={(event) => { void 导入手动提示词文件(event, 'manualRealmPrompt'); }}
                                                        />
                                                        <GameButton
                                                            onClick={() => manualRealmPromptInputRef.current?.click()}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-xs"
                                                        >
                                                            导入文件
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出手动境界提示词}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-xs"
                                                            disabled={!worldConfig.manualRealmPrompt.trim()}
                                                        >
                                                            导出
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出境界提示词模板}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-xs"
                                                        >
                                                            导出模板
                                                        </GameButton>
                                                        {worldConfig.manualRealmPrompt.trim() && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setWorldConfig((prev) => ({ ...prev, manualRealmPrompt: '' }))}
                                                                className="text-[11px] text-gray-500 hover:text-white"
                                                            >
                                                                清空
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={worldConfig.manualRealmPrompt}
                                                    onChange={(e) => setWorldConfig((prev) => ({ ...prev, manualRealmPrompt: e.target.value }))}
                                                    placeholder="支持直接粘贴 <境界体系>...</境界体系> 或完整的【境界映射母板】结构。"
                                                    className="w-full h-40 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-xs text-white outline-none rounded-md transition-all resize-none"
                                                />
                                                <div className="text-[11px] text-gray-500">这里会复用现有境界体系完整性校验；结构不全时会直接阻止开局。保存自定义开局方案时也会一并保存。</div>
                                            </div>
                                        </div>
                                    </div>

                            <OrnateBorder className="p-6 md:p-7">
                                <div className="border-b border-wuxia-gold/30 pb-4 mb-5">
                                    <div className="text-[11px] uppercase tracking-[0.35em] text-wuxia-red/70 font-mono">Fandom Blend</div>
                                    <h3 className="text-2xl font-serif font-bold text-wuxia-gold mt-2">同人融合</h3>
                                    <p className="text-xs text-gray-400 mt-2 leading-6">仅作用于世界观生成，不会单独进入开局初始化提示词。</p>
                                </div>

                                <div className="space-y-5">
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                        <div>
                                            <div className="text-sm text-gray-200">启用同人融合</div>
                                            <div className="text-[11px] text-gray-500 mt-1">关闭时完全按原创世界生成。</div>
                                        </div>
                                        <开关按钮
                                            checked={openingConfig.同人融合.enabled}
                                            label={openingConfig.同人融合.enabled ? '已启用' : '已关闭'}
                                            onToggle={() => setOpeningConfig((prev) => ({
                                                ...prev,
                                                同人融合: prev.同人融合.enabled
                                                    ? {
                                                        ...prev.同人融合,
                                                        enabled: false,
                                                        启用附加小说: false,
                                                        附加小说数据集ID: ''
                                                    }
                                                    : { ...prev.同人融合, enabled: true }
                                            }))}
                                        />
                                    </div>

                                    {openingConfig.同人融合.enabled && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="space-y-2 md:col-span-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">作品名</label>
                                                <input
                                                    value={openingConfig.同人融合.作品名}
                                                    onChange={(e) => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: { ...prev.同人融合, 作品名: e.target.value }
                                                    }))}
                                                    placeholder="例如：雪中悍刀行 / 诛仙 / 仙剑奇侠传"
                                                    className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all"
                                                />
                                                <div className="text-[11px] text-gray-500">
                                                    若下方启用附加小说，选择数据集时会自动把作品名同步为对应小说，方便同人规划与注入保持一致。
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">来源类型</label>
                                                <InlineSelect
                                                    value={openingConfig.同人融合.来源类型}
                                                    options={同人来源类型选项}
                                                    onChange={(来源类型) => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: { ...prev.同人融合, 来源类型 }
                                                    }))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">融合强度</label>
                                                <InlineSelect
                                                    value={openingConfig.同人融合.融合强度}
                                                    options={同人融合强度选项.map((item) => ({ value: item.value, label: item.label }))}
                                                    onChange={(融合强度) => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: { ...prev.同人融合, 融合强度 }
                                                    }))}
                                                />
                                                <div className="text-[11px] text-gray-500 leading-6">
                                                    {同人融合强度选项.find((item) => item.value === openingConfig.同人融合.融合强度)?.hint}
                                                </div>
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <开关按钮
                                                    checked={openingConfig.同人融合.保留原著角色}
                                                    label="保留原著角色实体"
                                                    onToggle={() => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: { ...prev.同人融合, 保留原著角色: !prev.同人融合.保留原著角色 }
                                                    }))}
                                                />
                                                <div className="text-[11px] text-gray-500">关闭时只吸收作品母题、势力气质和设定结构，不直接保留原著角色。</div>
                                            </div>
                                            <div className="space-y-3 md:col-span-2 rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4">
                                                <开关按钮
                                                    checked={openingConfig.同人融合.启用角色替换}
                                                    label="启用同人角色替换"
                                                    onToggle={() => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: {
                                                            ...prev.同人融合,
                                                            启用角色替换: !prev.同人融合.启用角色替换
                                                        }
                                                    }))}
                                                />
                                                <div className="text-[11px] text-gray-500 leading-6">
                                                    仅在“小说分解注入文本”进入主剧情 / 规划 / 世界演变上下文前做替换，不修改原数据集内容，也不影响外部存储。
                                                </div>
                                                {openingConfig.同人融合.启用角色替换 && (
                                                    <div className="space-y-3">
                                                        <label className="text-sm text-wuxia-cyan font-bold">被替换的原著角色名</label>
                                                        <input
                                                            type="text"
                                                            value={openingConfig.同人融合.替换目标角色名}
                                                            onChange={(e) => setOpeningConfig((prev) => ({
                                                                ...prev,
                                                                同人融合: {
                                                                    ...prev.同人融合,
                                                                    替换目标角色名: e.target.value
                                                                }
                                                            }))}
                                                            placeholder="例如：徐凤年"
                                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all"
                                                        />
                                                        <div className="text-[11px] text-gray-500">
                                                            这个主名称默认会在注入时替换成当前主角姓名，不会改动界面外显的原始小说数据。
                                                        </div>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <label className="text-sm text-wuxia-cyan font-bold">附加替换规则（可选）</label>
                                                                <button
                                                                    type="button"
                                                                    onClick={新增附加角色替换规则}
                                                                    className="px-3 py-1.5 rounded-full border border-wuxia-gold/35 text-[11px] text-wuxia-gold hover:bg-wuxia-gold/10 transition-colors"
                                                                >
                                                                    新增一条
                                                                </button>
                                                            </div>
                                                            {openingConfig.同人融合.附加角色替换规则列表.length > 0 ? (
                                                                <div className="space-y-3">
                                                                    {openingConfig.同人融合.附加角色替换规则列表.map((rule, index) => (
                                                                        <div key={`replace-rule-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                                                            <input
                                                                                type="text"
                                                                                value={rule.原名称}
                                                                                onChange={(e) => 更新附加角色替换规则(index, '原名称', e.target.value)}
                                                                                placeholder="原著里的名字，例如：小年"
                                                                                className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={rule.替换为}
                                                                                onChange={(e) => 更新附加角色替换规则(index, '替换为', e.target.value)}
                                                                                placeholder="替换成，例如：阿轩"
                                                                                className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => 删除附加角色替换规则(index)}
                                                                                className="px-3 py-2 rounded-md border border-red-500/30 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                                                                            >
                                                                                删除
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="text-[11px] text-gray-500">
                                                                    可以单独指定别名、小名、称呼或化名要替换成什么名字，例如“小年 -&gt; 阿轩”、“世子殿下 -&gt; 轩哥”。
                                                                </div>
                                                            )}
                                                            <div className="text-[11px] text-gray-500">
                                                                附加规则不会再强制绑定当前主角姓名，每条都按你填写的“原名称 -&gt; 替换为”执行。
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-3 md:col-span-2 rounded-2xl border border-wuxia-cyan/20 bg-black/25 p-4">
                                                <开关按钮
                                                    checked={openingConfig.同人融合.启用附加小说}
                                                    label="启用附加小说分解"
                                                    onToggle={() => setOpeningConfig((prev) => ({
                                                        ...prev,
                                                        同人融合: {
                                                            ...prev.同人融合,
                                                            启用附加小说: !prev.同人融合.启用附加小说,
                                                            附加小说数据集ID: !prev.同人融合.启用附加小说 ? prev.同人融合.附加小说数据集ID : ''
                                                        }
                                                    }))}
                                                />
                                                <div className="text-[11px] text-gray-500 leading-6">
                                                    允许前端同时保存多部小说的分解数据，但本次存档只会注入这里选定的那一部；未启用时，本存档不会注入小说分解内容。
                                                </div>
                                                <InlineSelect
                                                    value={openingConfig.同人融合.附加小说数据集ID}
                                                    options={小说拆分数据集列表.map((dataset) => ({
                                                        value: dataset.id,
                                                        label: dataset.作品名 || dataset.标题 || dataset.id
                                                    }))}
                                                    onChange={选择附加小说数据集}
                                                    placeholder={小说拆分数据集列表.length > 0 ? '选择附加小说数据集' : '暂无已导入的小说分解数据'}
                                                    disabled={!openingConfig.同人融合.启用附加小说 || 小说拆分数据集列表.length <= 0}
                                                />
                                                <div className="text-[11px] text-gray-500">
                                                    {小说拆分数据集列表.length <= 0
                                                        ? '还没有可选的数据集，请先在首页的小说分解工作台导入 TXT / EPUB 或分解 JSON。'
                                                        : 当前附加小说数据集
                                                            ? `当前选择：${当前附加小说数据集.作品名 || 当前附加小说数据集.标题}，后续主剧情 / 规划分析 / 世界演变都会优先使用这部小说的分解注入。`
                                                            : '启用后请选择一部小说分解数据集。'}
                                                </div>
                                                
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </OrnateBorder>

                                    <NewGameDiyTools
                                        worldConfig={worldConfig}
                                        charData={构建角色数据()}
                                        openingConfig={当前有效开局配置}
                                        apiConfig={apiConfig}
                                        onChange={setWorldConfig}
                                    />

                                    
                                </div>
                            </OrnateBorder>
                        </div>
                    )}

                    {/* STEP 3: CHARACTER BASIC */}
                    {step === 2 && (
                        <div className="animate-slide-in max-w-4xl mx-auto">
                            <h3 className="text-lg md:text-xl font-serif font-bold text-wuxia-gold border-b border-wuxia-gold/30 pb-3 mb-6">侠客名录</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                                {/* Left: Info */}
                                <div className="md:col-span-2 space-y-6">
                                    <OrnateBorder className="p-6">
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">姓名</label>
                                            <input
                                                value={charName}
                                                onChange={e => setCharName(e.target.value)}
                                                placeholder="在此输入你的名号"
                                                className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider"
                                            />
                                        </div>
                                    </OrnateBorder>
                                    
                                    <OrnateBorder className="p-6">
                                        <div className="space-y-4">
                                             <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">性别</label>
                                                 <div className="grid grid-cols-5 gap-2">
                                                     <button onClick={() => 选择性别('男')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '男' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>男</button>
                                                     <button onClick={() => 选择性别('女')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '女' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>女</button>
                                                     <button onClick={() => 选择性别('男娘')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '男娘' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>男娘</button>
                                                     <button onClick={() => 选择性别('扶她')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '扶她' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>扶她</button>
                                                     <button onClick={() => 选择性别('自定义')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '自定义' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>自定义</button>
                                                </div>
                                                {当前性别模式 === '自定义' && (
                                                    <input
                                                        value={charGender}
                                                        onChange={e => setCharGender(e.target.value)}
                                                        placeholder="输入自定义性别称谓"
                                                        className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all"
                                                    />
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">诞辰</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <CompactDropdown
                                                        value={birthMonth}
                                                        options={monthOptions}
                                                        suffix="月"
                                                        open={monthOpen}
                                                        onToggle={() => {
                                                            setMonthOpen((prev) => !prev);
                                                            setDayOpen(false);
                                                        }}
                                                        onSelect={(next) => {
                                                            setBirthMonth(next);
                                                            setMonthOpen(false);
                                                        }}
                                                        containerRef={monthRef as any}
                                                    />
                                                    <CompactDropdown
                                                        value={birthDay}
                                                        options={dayOptions}
                                                        suffix="日"
                                                        open={dayOpen}
                                                        onToggle={() => {
                                                            setDayOpen((prev) => !prev);
                                                            setMonthOpen(false);
                                                        }}
                                                        onSelect={(next) => {
                                                            setBirthDay(next);
                                                            setDayOpen(false);
                                                        }}
                                                        containerRef={dayRef as any}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </OrnateBorder>
                                    <OrnateBorder className="p-6">
                                        <div className="space-y-2">
                                             <label className="text-sm text-wuxia-cyan font-bold">年龄</label>
                                             <div className='flex items-center gap-4'>
                                                <input type="number" min={14} max={100} value={charAge} onChange={e => setCharAge(parseInt(e.target.value))} className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider" />
                                             </div>
                                         </div>
                                     </OrnateBorder>
                                    <OrnateBorder className="p-6">
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">外貌</label>
                                            <textarea
                                                value={charAppearance}
                                                onChange={e => setCharAppearance(e.target.value)}
                                                placeholder="描述角色外貌、气质与常见穿着"
                                                className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                            />
                                        </div>
                                    </OrnateBorder>

                                    <OrnateBorder className="p-6">
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">性格</label>
                                            <textarea
                                                value={charPersonality}
                                                onChange={e => setCharPersonality(e.target.value)}
                                                placeholder="描述主角的稳定性格倾向、处事方式与情绪底色"
                                                className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                            />
                                            <div className="rounded-xl border border-wuxia-cyan/20 bg-black/30 p-3">
                                                <div className="text-[10px] tracking-[0.25em] text-wuxia-cyan/70 font-mono">COT FOCUS</div>
                                                <div className="mt-2 text-[11px] leading-6 text-gray-300">
                                                    这段性格会直接进入系统提示词，COT 会据此推导主角的行事风格、情绪触发点、接受阈值与关系边界，而不是用前端关键词模板硬分析。
                                                </div>
                                            </div>
                                        </div>
                                    </OrnateBorder>
                                    <OrnateBorder className="p-6">
                                        <div className="space-y-3">
                                            <label className="text-sm text-wuxia-cyan font-bold">开局影像</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="aspect-square rounded-lg border border-wuxia-gold/25 bg-black/40 overflow-hidden flex items-center justify-center text-xs text-gray-500">
                                                        {charAvatarUrl ? <img src={charAvatarUrl} alt="主角头像预览" className="h-full w-full object-cover" /> : '头像'}
                                                    </div>
                                                    <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 text-[11px] font-medium text-wuxia-gold transition-colors hover:bg-wuxia-gold/20">
                                                        选择头像
                                                        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && 读取图片文件(e.target.files[0], setCharAvatarUrl)} className="sr-only" />
                                                    </label>
                                                </div>
                                                <div className="min-w-0 space-y-2">
                                                    <div className="aspect-square rounded-lg border border-wuxia-gold/25 bg-black/40 overflow-hidden flex items-center justify-center text-xs text-gray-500">
                                                        {charPortraitUrl ? <img src={charPortraitUrl} alt="主角立绘预览" className="h-full w-full object-contain" /> : '立绘'}
                                                    </div>
                                                    <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 text-[11px] font-medium text-wuxia-gold transition-colors hover:bg-wuxia-gold/20">
                                                        选择立绘
                                                        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && 读取图片文件(e.target.files[0], setCharPortraitUrl)} className="sr-only" />
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={charAvatarUrl.startsWith('data:') ? '' : charAvatarUrl} onChange={(e) => setCharAvatarUrl(e.target.value)} placeholder="头像 URL，可选" className="w-full bg-black/50 border border-gray-700 focus:border-wuxia-gold p-2 text-xs text-white outline-none rounded" />
                                                <input value={charPortraitUrl.startsWith('data:') ? '' : charPortraitUrl} onChange={(e) => setCharPortraitUrl(e.target.value)} placeholder="立绘 URL，可选" className="w-full bg-black/50 border border-gray-700 focus:border-wuxia-gold p-2 text-xs text-white outline-none rounded" />
                                            </div>
                                        </div>
                                    </OrnateBorder>
                                </div>

                                {/* Right: Stats */}
                                <div className="md:col-span-3">
                                    <OrnateBorder className="h-full">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-wuxia-gold font-bold text-lg">天资根骨</span>
                                            <span className={`text-sm font-mono transition-colors ${remainingPoints >= 0 ? 'text-green-400' : 'text-red-400'}`}>剩余点数: {remainingPoints}</span>
                                        </div>
                                        <div className="mb-3 grid grid-cols-2 gap-2">
                                            <button type="button" onClick={平均分配主角属性} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/15">平均分配</button>
                                            <button type="button" onClick={随机分配主角属性} className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/15">随机分配</button>
                                        </div>
                                        <div className="mb-4 rounded-xl border border-wuxia-gold/15 bg-black/25 px-4 py-3 text-[11px] leading-6 text-gray-400">
                                            当前难度总点数上限：<span className="text-wuxia-gold">{totalStatBudget}</span>。
                                            六维默认值均为 <span className="text-wuxia-gold">{属性最小值}</span>，单项最高 <span className="text-wuxia-gold">{属性最大值}</span>。
                                            判定修正 <span className={当前难度设定.判定修正 >= 0 ? 'text-green-400' : 'text-red-400'}>{难度判定修正文本}</span>，天赋可重 roll <span className="text-wuxia-cyan">{当前难度设定.天赋重Roll次数}</span> 次。
                                        </div>
                                        <div className="space-y-4 pt-4 border-t border-wuxia-gold/20">
                                            {Object.entries(stats).map(([key, val]) => (
                                                <div key={key} className="flex items-center justify-between">
                                                    <span className="text-gray-300 text-base font-serif w-16">{key}</span>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleStatChange(key as any, -1)} className="w-8 h-8 bg-gray-800 text-gray-400 hover:text-white rounded-md disabled:opacity-50" disabled={val <= 属性最小值}>-</button>
                                                        <span className="w-8 text-center text-wuxia-cyan font-bold text-lg">{val}</span>
                                                        <button onClick={() => handleStatChange(key as any, 1)} className="w-8 h-8 bg-gray-800 text-gray-400 hover:text-white rounded-md disabled:opacity-50" disabled={remainingPoints <= 0 || val >= 属性最大值}>+</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </OrnateBorder>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: TALENTS & BACKGROUND */}
                    {step === 1 && (
                        <div className="space-y-8 animate-slide-in max-w-6xl mx-auto">
                            <OrnateBorder className="p-4 md:p-5 bg-black/30">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[11px] uppercase tracking-[0.28em] text-wuxia-cyan/70 font-mono">Mode Fit</div>
                                        <div className="mt-1 text-sm text-gray-300">当前模式：<span className="text-wuxia-gold">{当前题材显示摘要.label}</span></div>
                                    </div>
                                    <GameButton
                                        onClick={() => { void runAiFrameworkAssist(); }}
                                        disabled={aiFrameworkStatus.type === 'loading' || !接口配置是否可用(当前主剧情接口配置)}
                                        variant="secondary"
                                        className="px-4 py-2 text-xs"
                                    >
                                        {aiFrameworkStatus.type === 'loading' ? 'AI 生成中' : 'AI 生成本模式身份/天赋'}
                                    </GameButton>
                                </div>
                                {aiFrameworkStatus.message && (
                                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                                        aiFrameworkStatus.type === 'error'
                                            ? 'border-red-500/30 bg-red-500/10 text-red-200'
                                            : aiFrameworkStatus.type === 'success'
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                : 'border-wuxia-cyan/25 bg-wuxia-cyan/10 text-wuxia-cyan'
                                    }`}>
                                        {aiFrameworkStatus.message}
                                    </div>
                                )}
                            </OrnateBorder>
                            <OrnateBorder className="p-6 md:p-7 bg-gradient-to-br from-black/70 via-black/55 to-wuxia-gold/5">
                                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-wuxia-gold/30 pb-4 mb-5">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.35em] text-wuxia-cyan/70 font-mono">Origin Archive</div>
                                        <h3 className="text-2xl font-serif font-bold text-wuxia-gold mt-2">身份背景</h3>
                                        <p className="text-xs text-gray-400 mt-2 leading-6">{背景长期说明}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (showCustomBackground) {
                                                重置自定义背景编辑();
                                                return;
                                            }
                                            setShowCustomBackground(true);
                                        }}
                                        className="text-xs text-wuxia-cyan hover:text-wuxia-gold transition-colors"
                                    >
                                        {showCustomBackground ? '收起自定义身份编辑器' : '+ 自定义身份'}
                                    </button>
                                </div>

                                <div className="mb-5 rounded-2xl border border-wuxia-gold/20 bg-black/35 px-4 py-4 shadow-[inset_0_0_20px_rgba(212,175,55,0.06)]">
                                    <div className="text-[11px] tracking-[0.28em] text-wuxia-gold/70 font-mono">已选身份</div>
                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                        <div className="text-xl font-serif text-wuxia-gold">{selectedBackground.名称 || '未选择身份'}</div>
                                        <span className="rounded-full border border-wuxia-cyan/30 bg-wuxia-cyan/10 px-3 py-1 text-[11px] text-wuxia-cyan">长期身份标签</span>
                                    </div>
                                    <p className="mt-3 text-sm text-gray-300 leading-7">{selectedBackground.描述 || '该身份会持续影响主角的社会位置、资源路径与他人对你的预期。'}</p>
                                    <div className="mt-4 rounded-xl border border-wuxia-cyan/20 bg-black/30 px-4 py-3 text-sm text-wuxia-cyan/90 leading-7">
                                        <span className="text-wuxia-gold/80 mr-2">长期作用：</span>
                                        {selectedBackground.效果 || '未填写'}
                                    </div>
                                </div>

                                {showCustomBackground && (
                                    <div className="bg-black/40 border border-wuxia-cyan/30 p-4 mb-5 rounded-2xl space-y-3">
                                        <input
                                            placeholder="身份名称（例：江南王世子）"
                                            value={customBackground.名称}
                                            onChange={e => setCustomBackground({ ...customBackground, 名称: e.target.value })}
                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all"
                                        />
                                        <textarea
                                            placeholder="身份描述：说明其来历、处境、社会定位"
                                            value={customBackground.描述}
                                            onChange={e => setCustomBackground({ ...customBackground, 描述: e.target.value })}
                                            className="w-full h-20 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <textarea
                                            placeholder="长期作用：说明这个身份会长期影响哪些资源、关系、风险、路线"
                                            value={customBackground.效果}
                                            onChange={e => setCustomBackground({ ...customBackground, 效果: e.target.value })}
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <input
                                            placeholder="自带天赋名称（可选，逗号分隔，引用天赋池，如：剑在心中）"
                                            value={(customBackground.自带天赋 || []).join('，')}
                                            onChange={e => {
                                                const 自带天赋 = e.target.value
                                                    .split(/[,，、\s]+/)
                                                    .map((item) => item.trim())
                                                    .filter(Boolean);
                                                setCustomBackground({
                                                    ...customBackground,
                                                    ...(自带天赋.length > 0 ? { 自带天赋 } : { 自带天赋: undefined })
                                                });
                                            }}
                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all"
                                        />
                                        <div className="text-[11px] text-gray-500">不要只写“开局获得什么”，优先写会长期生效的人脉、身份压力、资源权限、势力关联。自带天赋从天赋池按名称引用，可选隐藏天赋。</div>
                                        <div className="flex gap-2">
                                            <GameButton onClick={addCustomBackground} variant="secondary" className="flex-1 py-2 text-xs">{正在编辑背景名 ? '保存身份修改' : '保存并使用自定义身份'}</GameButton>
                                            <GameButton onClick={重置自定义背景编辑} variant="secondary" className="px-4 py-2 text-xs opacity-80">取消</GameButton>
                                        </div>
                                    </div>
                                )}

                                {自定义背景列表.length > 0 && (
                                    <div className="mb-5 rounded-2xl border border-gray-800 bg-black/25 p-4">
                                        <div className="text-[11px] tracking-[0.25em] text-gray-500 font-mono">已保存自定义身份</div>
                                        <div className="mt-3 space-y-2">
                                            {自定义背景列表.map((bg) => (
                                                <div key={bg.名称} className="rounded-xl border border-gray-800 bg-black/30 px-4 py-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-gray-200 truncate">{bg.名称}</div>
                                                        <div className="text-[11px] text-gray-500 truncate">{bg.效果}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button type="button" onClick={() => setSelectedBackground(bg)} className="text-[11px] text-wuxia-gold hover:text-white">使用</button>
                                                        <button type="button" onClick={() => 编辑自定义背景(bg)} className="text-[11px] text-wuxia-cyan hover:text-white">编辑</button>
                                                        <button type="button" onClick={() => { void 删除自定义背景(bg.名称); }} className="text-[11px] text-red-400 hover:text-red-200">删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                
                                <div className="mb-5 rounded-2xl border border-gray-800 bg-black/25 p-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div>
                                            <div className="text-[11px] uppercase tracking-[0.28em] text-wuxia-cyan/70 font-mono">Origin Draw #{出身抽卡轮次}</div>
                                            <div className="mt-1 text-xs text-gray-500">抽卡模式本轮展示 {当前抽卡出身选项.length}/{Math.min(出身抽卡数量, 全部背景选项.length)} 个出身；已用 {出身已重Roll次数}/{当前难度设定.天赋重Roll次数} 次。</div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex rounded-full border border-gray-700 bg-black/35 p-1 text-xs">
                                                {(['抽卡', '列表'] as const).map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => set出身选择模式(mode)}
                                                        className={`rounded-full px-4 py-1.5 transition-all ${
                                                            出身选择模式 === mode
                                                                ? 'border border-wuxia-cyan/45 bg-wuxia-cyan/20 text-wuxia-cyan'
                                                                : 'text-gray-400 hover:text-wuxia-gold'
                                                        }`}
                                                    >
                                                        {mode === '抽卡' ? '抽卡模式' : '全部列表'}
                                                    </button>
                                                ))}
                                            </div>
                                            {出身选择模式 === '抽卡' && (
                                                <button
                                                    type="button"
                                                    onClick={重抽出身卡牌}
                                                    disabled={出身剩余重Roll次数 <= 0}
                                                    className="rounded-full border border-wuxia-gold/40 bg-wuxia-gold/10 px-4 py-2 text-xs text-wuxia-gold transition-colors hover:border-wuxia-gold hover:bg-wuxia-gold/20 hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-black/30 disabled:text-gray-600"
                                                >
                                                    重抽出身 {出身剩余重Roll次数}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {当前出身展示列表.map((bg, idx) => {
                                        const isSelected = selectedBackground.名称 === bg.名称;
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedBackground(bg)}
                                                className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300 ${
                                                    isSelected
                                                        ? 'border-wuxia-gold bg-gradient-to-br from-wuxia-gold/15 via-black/70 to-black/70 shadow-[0_0_24px_rgba(212,175,55,0.16)]'
                                                        : 'border-gray-700 bg-black/25 hover:border-wuxia-gold/45 hover:bg-black/35'
                                                }`}
                                            >
                                                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-wuxia-gold/80 via-wuxia-cyan/70 to-transparent"></div>
                                                <div className="p-5 pl-6">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className={`font-bold text-base font-serif ${isSelected ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                                            {bg.名称}
                                                            {!当前题材预设背景名称集合.has(bg.名称) ? ' · 自定义' : ''}
                                                        </div>
                                                        <span className={`text-[10px] tracking-[0.25em] font-mono ${isSelected ? 'text-wuxia-cyan' : 'text-gray-500 group-hover:text-wuxia-cyan/70'}`}>IDENTITY</span>
                                                    </div>
                                                    <div className="mt-3 text-sm text-gray-400 leading-6">{bg.描述}</div>
                                                    <div className="mt-4 rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-wuxia-cyan/90 leading-6">
                                                        <span className="text-wuxia-gold/80 mr-2">长期效果</span>
                                                        {bg.效果}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="p-6 md:p-7 bg-gradient-to-br from-black/65 to-wuxia-red/5">
                                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-wuxia-gold/30 pb-4 mb-5">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.3em] text-wuxia-red/70 font-mono">Fate Traits</div>
                                        <h3 className="mt-2 text-2xl font-serif font-bold text-wuxia-gold">天赋卷宗</h3>
                                        <p className="text-xs text-gray-400 mt-2 leading-6">{天赋说明}</p>
                                    </div>
                                    <div className="flex flex-col items-start md:items-end gap-3">
                                        <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                                            {selectedTalentNames.length > 0 ? selectedTalentNames.map(name => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() => 取消选择天赋(name)}
                                                    className="rounded-full border border-wuxia-red/35 bg-wuxia-red/10 px-3 py-1 text-xs text-wuxia-red transition-colors hover:border-wuxia-red hover:bg-wuxia-red/20 hover:text-white"
                                                >
                                                    {name} ×
                                                </button>
                                            )) : (
                                                <span className="text-xs text-gray-500">尚未选择天赋</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-gray-500">最多自选 {selectedTalents.length}/3 个，天赋更偏向长期成长路线。</div>
                                        <button
                                            onClick={() => {
                                                if (showCustomTalent) {
                                                    重置自定义天赋编辑();
                                                    return;
                                                }
                                                setShowCustomTalent(true);
                                            }}
                                            className="text-xs text-wuxia-cyan hover:text-wuxia-gold transition-colors"
                                        >
                                            {showCustomTalent ? '收起自定义天赋编辑器' : '+ 自定义天赋'}
                                        </button>
                                    </div>
                                </div>

                                {showCustomTalent && (
                                    <OrnateBorder className="p-4 bg-black/35 mb-5">
                                        <div className="space-y-3">
                                            <input placeholder="天赋名称" value={customTalent.名称} onChange={e => setCustomTalent({...customTalent, 名称: e.target.value})} className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all" />
                                            <textarea placeholder="天赋描述：说明天赋偏向与风格" value={customTalent.描述} onChange={e => setCustomTalent({...customTalent, 描述: e.target.value})} className="w-full h-20 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none" />
                                            <textarea placeholder="长期效果：说明会长期强化哪些成长、判定或路线" value={customTalent.效果} onChange={e => setCustomTalent({...customTalent, 效果: e.target.value})} className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none" />
                                            <label className="flex items-center gap-2 text-xs text-gray-300">
                                                <input
                                                    type="checkbox"
                                                    checked={customTalent.隐藏 === true}
                                                    onChange={(e) => setCustomTalent({
                                                        ...customTalent,
                                                        隐藏: e.target.checked ? true : undefined
                                                    })}
                                                />
                                                隐藏天赋（不进入抽卡/列表选择池，仅可通过背景自带等方式注入）
                                            </label>
                                            <div className="flex gap-2">
                                                <GameButton onClick={addCustomTalent} variant="secondary" className="flex-1 py-2 text-xs">{正在编辑天赋名 ? '保存天赋修改' : '保存自定义天赋'}</GameButton>
                                                <GameButton onClick={重置自定义天赋编辑} variant="secondary" className="px-4 py-2 text-xs opacity-80">取消</GameButton>
                                            </div>
                                        </div>
                                    </OrnateBorder>
                                )}

                                {自定义天赋列表.length > 0 && (
                                    <div className="mb-5 rounded-2xl border border-gray-800 bg-black/25 p-4">
                                        <div className="text-[11px] tracking-[0.25em] text-gray-500 font-mono">已保存自定义天赋</div>
                                        <div className="mt-3 space-y-2">
                                            {自定义天赋列表.map((talent) => (
                                                <div key={talent.名称} className="rounded-xl border border-gray-800 bg-black/30 px-4 py-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-gray-200 truncate">
                                                            {talent.名称}
                                                            {talent.隐藏 === true ? <span className="ml-2 text-[10px] text-rose-300/80">隐藏</span> : null}
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 truncate">{talent.效果}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTalent(talent)}
                                                            disabled={talent.隐藏 === true && !selectedTalents.some(item => item.名称 === talent.名称)}
                                                            className="text-[11px] text-wuxia-gold hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
                                                            title={talent.隐藏 === true ? '隐藏天赋仅能通过背景自带引用注入' : undefined}
                                                        >
                                                            {selectedTalents.some(item => item.名称 === talent.名称)
                                                                ? '取消使用'
                                                                : (talent.隐藏 === true ? '仅自带' : '使用')}
                                                        </button>
                                                        <button type="button" onClick={() => 编辑自定义天赋(talent)} className="text-[11px] text-wuxia-cyan hover:text-white">编辑</button>
                                                        <button type="button" onClick={() => { void 删除自定义天赋(talent.名称); }} className="text-[11px] text-red-400 hover:text-red-200">删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </OrnateBorder>

                            <OrnateBorder className="p-6 md:p-7">
                                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-wuxia-gold/30 pb-4 mb-5">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.35em] text-wuxia-red/70 font-mono">Talent Matrix</div>
                                        <h3 className="text-2xl font-serif font-bold text-wuxia-gold mt-2">天赋选择</h3>
                                        <p className="text-xs text-gray-400 mt-2 leading-6">选择最多三个天赋，组合出你的长期成长风格、擅长判定与可走路线。</p>
                                        <p className="mt-2 rounded-xl border border-wuxia-cyan/20 bg-wuxia-cyan/5 px-3 py-2 text-[11px] text-gray-300 leading-5">
                                            当前题材：<span className="text-wuxia-gold">{当前题材显示摘要.label}</span>。想切到西幻风格时，回到“世界观”页选择“西方奇幻 / 西幻模式包”，这里的天赋卷宗会自动刷新为魔力、骑士、公会与冒险者口径。
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-start md:items-end gap-2">
                                        <div className="flex rounded-full border border-gray-700 bg-black/35 p-1 text-xs">
                                            {(['抽卡', '列表'] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => set天赋选择模式(mode)}
                                                    className={`rounded-full px-4 py-1.5 transition-all ${
                                                        天赋选择模式 === mode
                                                            ? 'bg-wuxia-red/25 text-wuxia-red border border-wuxia-red/45'
                                                            : 'text-gray-400 hover:text-wuxia-gold'
                                                    }`}
                                                >
                                                    {mode === '抽卡' ? '抽卡模式' : '全部列表'}
                                                </button>
                                            ))}
                                        </div>
                                        {天赋选择模式 === '抽卡' ? (
                                            <button
                                                type="button"
                                                onClick={重抽天赋卡牌}
                                                disabled={天赋剩余重Roll次数 <= 0}
                                                className="rounded-full border border-wuxia-cyan/40 bg-wuxia-cyan/10 px-4 py-2 text-xs text-wuxia-cyan transition-all hover:border-wuxia-gold hover:text-wuxia-gold disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-black/30 disabled:text-gray-600"
                                            >
                                                重 roll（剩余 {天赋剩余重Roll次数}）
                                            </button>
                                        ) : (
                                            <div className="text-xs text-gray-500">建议搭配：战斗 + 生存 + 社交 / 探索，角色会更立体</div>
                                        )}
                                    </div>
                                </div>

                                {天赋选择模式 === '抽卡' && (
                                    <div className="mb-5 rounded-2xl border border-wuxia-red/25 bg-gradient-to-br from-wuxia-red/10 via-black/30 to-wuxia-cyan/5 px-4 py-3">
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                            <div>
                                                <div className="text-[11px] uppercase tracking-[0.3em] text-wuxia-red/70 font-mono">Draw Round #{天赋抽卡轮次}</div>
                                                <div className="mt-1 text-sm text-gray-300">本轮抽出 {当前抽卡天赋选项.length}/{Math.min(天赋抽卡数量, 可见天赋选项.length)} 张天赋卡，当前难度可重 roll {当前难度设定.天赋重Roll次数} 次。</div>
                                            </div>
                                            <div className="text-[11px] text-gray-500">已用 {天赋已重Roll次数}/{当前难度设定.天赋重Roll次数} 次；已选天赋会保留，可点击上方标签取消。</div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {(天赋选择模式 === '抽卡' ? 当前抽卡天赋选项 : 可见天赋选项).map((t, idx) => {
                                        const isSelected = !!selectedTalents.find(x => x.名称 === t.名称);
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => toggleTalent(t)}
                                                className={`group rounded-2xl border cursor-pointer transition-all duration-300 overflow-hidden ${
                                                    isSelected
                                                        ? 'border-wuxia-red bg-gradient-to-br from-wuxia-red/15 via-black/70 to-black/70 shadow-[0_0_22px_rgba(190,30,45,0.16)]'
                                                        : 'border-gray-700 bg-black/25 hover:border-wuxia-red/45 hover:bg-black/35'
                                                }`}
                                            >
                                                <div className="p-5">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className={`font-bold text-base font-serif ${isSelected ? 'text-wuxia-red' : 'text-gray-200'}`}>
                                                            {t.名称}
                                                            {!当前题材预设天赋名称集合.has(t.名称) ? ' · 自定义' : ''}
                                                        </div>
                                                        <span className={`text-[10px] tracking-[0.25em] font-mono ${isSelected ? 'text-wuxia-cyan' : 'text-gray-500 group-hover:text-wuxia-cyan/70'}`}>{isSelected ? 'SELECTED' : 'TRAIT'}</span>
                                                    </div>
                                                    <div className="mt-3 text-sm text-gray-400 leading-6">{t.描述}</div>
                                                    <div className="mt-4 rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-wuxia-cyan/90 leading-6">
                                                        <span className="text-wuxia-gold/80 mr-2">长期效果</span>
                                                        {t.效果}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </OrnateBorder>
                        </div>
                    )}

                    {/* STEP 4: COMPANION */}
                    {step === 3 && (
                        <div className="space-y-8 animate-slide-in max-w-6xl mx-auto">
                            <OrnateBorder className="p-6 md:p-7">
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                    <div>
                                        <div className="text-sm text-gray-200">启用开局伙伴</div>
                                        <div className="text-[11px] text-gray-500 mt-1">开启后会把伙伴列表作为第0回合已成立的主要 NPC 写入开局初始化；可继续添加，不设上限。</div>
                                    </div>
                                    <开关按钮
                                        checked={partnerEnabled}
                                        label={partnerEnabled ? '已启用' : '已关闭'}
                                        onToggle={() => setPartnerEnabled((prev) => !prev)}
                                    />
                                </div>
                            </OrnateBorder>

                            {partnerEnabled ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <OrnateBorder className="p-6 space-y-4 lg:col-span-2">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <h3 className="text-lg font-serif font-bold text-wuxia-gold">伙伴列表</h3>
                                                <p className="mt-1 text-xs text-gray-500">当前共 {Math.max(1, partnerList.length)} 名伙伴。切换前会自动保存当前编辑内容。</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={同步当前伙伴到列表} className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/10 px-3 py-2 text-xs font-bold text-wuxia-cyan hover:bg-wuxia-cyan/15">保存当前伙伴</button>
                                                <button type="button" onClick={新增开局伙伴} className="rounded-lg border border-wuxia-gold/35 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/15">添加伙伴</button>
                                                <button type="button" onClick={删除当前伙伴} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/15">删除当前</button>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                            {partnerList.map((partner, index) => {
                                                const active = index === activePartnerIndex;
                                                return (
                                                    <button key={`${index}-${partner.姓名 || 'partner'}`} type="button" onClick={() => 切换当前伙伴(index)} className={`min-w-[150px] rounded-xl border px-3 py-3 text-left transition-all ${active ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 bg-black/25 text-gray-300 hover:border-wuxia-gold/35'}`}>
                                                        <div className="text-xs text-gray-500">伙伴 {index + 1}</div>
                                                        <div className="mt-1 truncate text-sm font-bold">{index === activePartnerIndex ? (partnerName.trim() || partner.姓名 || '未填写姓名') : (partner.姓名 || '未填写姓名')}</div>
                                                        <div className="mt-1 truncate text-[11px] text-gray-500">{index === activePartnerIndex ? (partnerRelation.trim() || partner.关系 || '未填写关系') : (partner.关系 || '未填写关系')}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </OrnateBorder>
                                    <OrnateBorder className="p-6 space-y-4">
                                        <h3 className="text-xl font-serif font-bold text-wuxia-gold border-b border-wuxia-gold/30 pb-3">同伴基础</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">姓名</label>
                                                <input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="同伴名号" className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-wuxia-cyan font-bold">年龄</label>
                                                <input type="number" min={14} max={100} value={partnerAge} onChange={e => setPartnerAge(parseInt(e.target.value) || 18)} className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">性别</label>
                                             <div className="grid grid-cols-5 gap-2">
                                                 <button onClick={() => 选择伙伴性别('男')} className={`p-3 rounded text-center transition-all ${当前伙伴性别模式 === '男' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>男</button>
                                                 <button onClick={() => 选择伙伴性别('女')} className={`p-3 rounded text-center transition-all ${当前伙伴性别模式 === '女' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>女</button>
                                                 <button onClick={() => 选择伙伴性别('男娘')} className={`p-3 rounded text-center transition-all ${当前伙伴性别模式 === '男娘' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>男娘</button>
                                                 <button onClick={() => 选择伙伴性别('扶她')} className={`p-3 rounded text-center transition-all ${当前伙伴性别模式 === '扶她' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>扶她</button>
                                                 <button onClick={() => 选择伙伴性别('自定义')} className={`p-3 rounded text-center transition-all ${当前伙伴性别模式 === '自定义' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>自定义</button>
                                            </div>
                                            {当前伙伴性别模式 === '自定义' && (
                                                <input value={partnerGender} onChange={e => setPartnerGender(e.target.value)} placeholder="输入自定义性别称谓" className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all" />
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="text-xs text-wuxia-cyan font-bold">出生月份</label>
                                                <input type="number" min={1} max={12} value={partnerBirthMonth} onChange={e => setPartnerBirthMonth(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))} aria-label="同伴出生月份" className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs text-wuxia-cyan font-bold">出生日期</label>
                                                <input type="number" min={1} max={30} value={partnerBirthDay} onChange={e => setPartnerBirthDay(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))} aria-label="同伴出生日期" className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">与主角关系</label>
                                            <input value={partnerRelation} onChange={e => setPartnerRelation(e.target.value)} placeholder={当前伙伴关系占位} className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">外貌</label>
                                            <textarea value={partnerAppearance} onChange={e => setPartnerAppearance(e.target.value)} className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">性格</label>
                                            <textarea value={partnerPersonality} onChange={e => setPartnerPersonality(e.target.value)} className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none" />
                                        </div>
                                        <div className="rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4 space-y-3">
                                            <div className="text-sm text-wuxia-cyan font-bold">开局影像</div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="aspect-square rounded-lg border border-wuxia-gold/25 bg-black/40 overflow-hidden flex items-center justify-center text-xs text-gray-500">
                                                        {partnerAvatarUrl ? <img src={partnerAvatarUrl} alt="伙伴头像预览" className="h-full w-full object-cover" /> : '头像'}
                                                    </div>
                                                    <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 text-[11px] font-medium text-wuxia-gold transition-colors hover:bg-wuxia-gold/20">
                                                        选择头像
                                                        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && 读取图片文件(e.target.files[0], setPartnerAvatarUrl)} className="sr-only" />
                                                    </label>
                                                </div>
                                                <div className="min-w-0 space-y-2">
                                                    <div className="aspect-square rounded-lg border border-wuxia-gold/25 bg-black/40 overflow-hidden flex items-center justify-center text-xs text-gray-500">
                                                        {partnerPortraitUrl ? <img src={partnerPortraitUrl} alt="伙伴立绘预览" className="h-full w-full object-contain" /> : '立绘'}
                                                    </div>
                                                    <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 text-[11px] font-medium text-wuxia-gold transition-colors hover:bg-wuxia-gold/20">
                                                        选择立绘
                                                        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && 读取图片文件(e.target.files[0], setPartnerPortraitUrl)} className="sr-only" />
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={partnerAvatarUrl.startsWith('data:') ? '' : partnerAvatarUrl} onChange={(e) => setPartnerAvatarUrl(e.target.value)} placeholder="头像 URL，可选" className="w-full bg-black/50 border border-gray-700 focus:border-wuxia-gold p-2 text-xs text-white outline-none rounded" />
                                                <input value={partnerPortraitUrl.startsWith('data:') ? '' : partnerPortraitUrl} onChange={(e) => setPartnerPortraitUrl(e.target.value)} placeholder="立绘 URL，可选" className="w-full bg-black/50 border border-gray-700 focus:border-wuxia-gold p-2 text-xs text-white outline-none rounded" />
                                            </div>
                                        </div>
                                    </OrnateBorder>

                                    <OrnateBorder className="p-6 space-y-5">
                                        <h3 className="text-xl font-serif font-bold text-wuxia-gold border-b border-wuxia-gold/30 pb-3">同伴属性与经历</h3>
                                        <div className="rounded-2xl border border-gray-800 bg-black/30 p-4">
                                            <div className="flex items-center justify-between text-xs mb-3">
                                                <span className="text-gray-400">难度属性上限</span>
                                                <span className={partnerRemainingPoints < 0 ? 'text-red-400' : 'text-wuxia-gold'}>{partnerUsedPoints}/{totalStatBudget}</span>
                                            </div>
                                            <div className="mb-3 grid grid-cols-2 gap-2">
                                                <button type="button" onClick={平均分配伙伴属性} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/15">平均分配</button>
                                                <button type="button" onClick={随机分配伙伴属性} className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-2 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold/15">随机分配</button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {Object.entries(partnerStats).map(([key, value]) => (
                                                    <div key={key} className="rounded-xl border border-gray-800 bg-black/25 p-3">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm text-gray-300">{key}</span>
                                                            <span className="font-mono text-wuxia-gold">{value}</span>
                                                        </div>
                                                        <input type="range" min={属性最小值} max={属性最大值} value={value} onChange={e => 更新伙伴属性(key as keyof 属性结构, Number(e.target.value))} className="w-full accent-wuxia-gold" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">身份背景</label>
                                            <InlineSelect value={partnerBackground.名称} options={全部背景选项.map((item) => ({ value: item.名称, label: item.名称 }))} onChange={(name) => setPartnerBackground(根据名称查找背景(name))} />
                                            <div className="rounded-xl border border-wuxia-cyan/20 bg-black/30 p-3 text-xs text-gray-300 leading-6">{partnerBackground.描述}</div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">天赋（最多3个）</label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                                {可见天赋选项.map((talent) => {
                                                    const active = partnerTalents.some((item) => item.名称 === talent.名称);
                                                    return (
                                                        <button key={talent.名称} type="button" onClick={() => togglePartnerTalent(talent)} className={`rounded-xl border p-3 text-left transition-all ${active ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 bg-black/25 text-gray-300 hover:border-wuxia-gold/35'}`}>
                                                            <div className="text-sm font-bold">{talent.名称}</div>
                                                            <div className="mt-1 text-[11px] text-gray-500 line-clamp-2">{talent.效果}</div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">备注</label>
                                            <textarea value={partnerNote} onChange={e => setPartnerNote(e.target.value)} placeholder="补充同伴必须保留的设定、禁忌或开局状态" className="w-full h-20 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none" />
                                        </div>
                                    </OrnateBorder>
                                </div>
                            ) : (
                                <OrnateBorder className="p-8 text-center text-sm text-gray-400">开局伙伴已关闭，本次开局将按主角和开局配置自然生成初始社交。</OrnateBorder>
                            )}
                        </div>
                    )}

                    {/* STEP 5: OPENING CONFIG */}
                    {step === 4 && (
                        <div className="space-y-8 animate-slide-in max-w-5xl mx-auto">
                            <OrnateBorder className="p-6 md:p-7">
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                    <div>
                                        <div className="text-sm text-gray-200">启用开局配置</div>
                                        <div className="text-[11px] text-gray-500 mt-1">关闭时不额外注入关系侧重和切入偏好，按世界观与角色档案自然开局。</div>
                                    </div>
                                    <开关按钮
                                        checked={openingConfigEnabled}
                                        label={openingConfigEnabled ? '已启用' : '未启用'}
                                        onToggle={() => setOpeningConfigEnabled((prev) => !prev)}
                                    />
                                </div>
                            </OrnateBorder>

                            {openingConfigEnabled ? (
                                <>
                            <OrnateBorder className="p-6 md:p-7">
                                <div className="border-b border-wuxia-gold/30 pb-4 mb-5">
                                    <div className="text-[11px] uppercase tracking-[0.35em] text-wuxia-cyan/70 font-mono">Opening Structure</div>
                                    <h3 className="text-2xl font-serif font-bold text-wuxia-gold mt-2">开局配置</h3>
                                    <p className="text-xs text-gray-400 mt-2 leading-6">{当前开局配置文案.intro}</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="rounded-2xl border border-wuxia-gold/20 bg-black/25 p-4 text-xs leading-6 text-gray-400">
                                        <div className="text-sm text-wuxia-gold font-bold">当前题材：{当前题材显示摘要.label}</div>
                                        <div className="mt-1">{当前题材显示摘要.hint}</div>
                                        <div className="mt-2 text-gray-500">市场入口：{当前题材显示摘要.marketName}；{当前题材显示摘要.currencyPrompt}；{当前题材显示摘要.currencyExchangePrompt}</div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-sm text-wuxia-cyan font-bold">开局切入偏好</label>
                                        <InlineSelect
                                            value={openingConfig.开局切入偏好}
                                            options={当前开局切入偏好选项.map((item) => ({ value: item.value, label: item.label }))}
                                            onChange={(开局切入偏好) => setOpeningConfig((prev) => ({ ...prev, 开局切入偏好 }))}
                                        />
                                        <div className="text-[11px] text-gray-500 leading-6">
                                            {当前开局切入偏好选项.find((item) => item.value === openingConfig.开局切入偏好)?.hint}
                                        </div>
                                        <div className="pt-2 space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">开局时间</label>
                                            <input
                                                value={openingConfig.自定义开局时间 || 默认开局时间}
                                                onChange={(e) => setOpeningConfig((prev) => ({ ...prev, 自定义开局时间: e.target.value }))}
                                                placeholder={默认开局时间}
                                                className="w-full bg-black/40 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 outline-none focus:border-wuxia-gold/60"
                                            />
                                            <div className="text-[11px] text-gray-500 leading-5">格式：年:月:日:时:分，例如 {默认开局时间}。</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <label className="text-sm text-wuxia-cyan font-bold">关系侧重（最多 2 项）</label>
                                    <div className="mt-3 flex flex-wrap gap-3">
                                        {当前关系侧重选项.map((item) => {
                                            const active = openingConfig.关系侧重.includes(item.value);
                                            const disabled = !active && openingConfig.关系侧重.length >= 2;
                                            return (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    onClick={() => toggleRelationFocus(item.value)}
                                                    disabled={disabled}
                                                    className={`rounded-full border px-4 py-2 text-sm transition-all ${
                                                        active
                                                            ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold'
                                                            : 'border-gray-700 bg-black/30 text-gray-300 hover:border-wuxia-gold/40'
                                                    } disabled:cursor-not-allowed disabled:opacity-40`}
                                                >
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2 text-[11px] text-gray-500">已选 {openingConfig.关系侧重.length}/2。{当前开局配置文案.relationHelper}</div>
                                </div>

                                <div className="mt-6 rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                    <div className="mb-3">
                                        <div className="text-sm text-gray-200">AI 生成角色性别</div>
                                        <div className="text-[11px] text-gray-500 mt-1">限制开局新生成的 NPC、组织成员、队友和路人性别；不改变玩家手动设置的主角性别。</div>
                                    </div>
                                    <GeneratedGenderSelector
                                        value={openingConfig.允许生成性别}
                                        locked={openingConfig.生成性别锁定 === true}
                                        onChange={(允许生成性别) => setOpeningConfig((prev) => ({ ...prev, 允许生成性别 }))}
                                    />
                                </div>

                                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                        <div>
                                            <div className="text-sm text-gray-200">{当前开局配置文案.organizationTitle}</div>
                                            <div className="text-[11px] text-gray-500 mt-1">{当前开局配置文案.organizationDescription}</div>
                                        </div>
                                        <开关按钮
                                            checked={openingConfig.开局生成门派 !== false}
                                            label={openingConfig.开局生成门派 !== false ? '生成' : '不生成'}
                                            onToggle={() => {
                                                setOpeningConfig((prev) => ({ ...prev, 开局生成门派: prev.开局生成门派 === false }));
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                        <div>
                                            <div className="text-sm text-gray-200">{当前开局配置文案.memberTitle}</div>
                                            <div className="text-[11px] text-gray-500 mt-1">{当前开局配置文案.memberDescription}</div>
                                        </div>
                                        <开关按钮
                                            checked={openingConfig.开局生成同门 !== false}
                                            label={openingConfig.开局生成同门 !== false ? '生成' : '不生成'}
                                            onToggle={() => {
                                                setOpeningConfig((prev) => ({ ...prev, 开局生成同门: prev.开局生成同门 === false }));
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                        <div>
                                            <div className="text-sm text-gray-200">叙事平静值系统</div>
                                            <div className="text-[11px] text-gray-500 mt-1">开启后系统会根据剧情节奏自动调整推动强度，长时间平淡剧情将自动推出新事件</div>
                                        </div>
                                        <开关按钮
                                            checked={openingConfig.modeRuntimeProfile?.叙事平静值配置?.启用 === true}
                                            label={openingConfig.modeRuntimeProfile?.叙事平静值配置?.启用 ? '启用' : '关闭'}
                                            onToggle={() => setOpeningConfig((prev) => {
                                                const profile = { ...prev.modeRuntimeProfile } as any;
                                                profile.叙事平静值配置 = { ...(profile.叙事平静值配置 || {}), 启用: !profile.叙事平静值配置?.启用 };
                                                return { ...prev, modeRuntimeProfile: profile };
                                            })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                        <div>
                                            <div className="text-sm text-gray-200">性别比例自动演变</div>
                                            <div className="text-[11px] text-gray-500 mt-1">开启后世界演变环节会根据剧情自动调整性别比例（世界级+地点级），并生成对应的个体性转命令；关闭后性别比例不受AI自动调整</div>
                                        </div>
                                        <开关按钮
                                            checked={openingConfig.modeRuntimeProfile?.性别比例演变预设 === true}
                                            label={openingConfig.modeRuntimeProfile?.性别比例演变预设 ? '启用' : '关闭'}
                                            onToggle={() => setOpeningConfig((prev) => ({
                                                ...prev,
                                                modeRuntimeProfile: { ...prev.modeRuntimeProfile!, 性别比例演变预设: !(prev.modeRuntimeProfile?.性别比例演变预设 ?? false) }
                                            }))}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                    <div>
                                        <div className="text-sm text-gray-200">女主剧情规划</div>
                                        <div className="text-[11px] text-gray-500 mt-1">控制是否主动生成女主 NPC 和推进情感线；创意工坊可预设此项</div>
                                    </div>
                                    <select
                                        value={openingConfig.启用女主剧情规划 === undefined ? '默认' : openingConfig.启用女主剧情规划 ? '启用' : '关闭'}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setOpeningConfig((prev) => ({
                                                ...prev,
                                                启用女主剧情规划: v === '默认' ? undefined : v === '启用'
                                            }));
                                        }}
                                        className="bg-black/40 border border-gray-700 text-xs text-gray-200 rounded-lg px-3 py-1.5 focus:border-wuxia-gold/50 focus:outline-none"
                                    >
                                        <option value="默认">默认</option>
                                        <option value="启用">启用</option>
                                        <option value="关闭">关闭</option>
                                    </select>
                                </div>
                            </OrnateBorder>


                                </>
                            ) : (
                                <OrnateBorder className="p-6 md:p-7">
                                    <div className="text-sm text-gray-300 leading-7">
                                        本次不额外指定关系侧重或开局切入。系统将仅依据世界观、角色档案和既有硬约束自然生成开场。
                                    </div>
                                </OrnateBorder>
                            )}
                        </div>
                    )}

                    {/* STEP 6: CONFIRMATION */}
                    {step === 5 && (
                        <div className="h-full flex flex-col items-center justify-center animate-fadeIn space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-serif font-black text-wuxia-gold mb-2" style={{ fontFamily: 'var(--ui-页面标题-font-family, inherit)', fontSize: 'var(--ui-页面标题-font-size, 32px)' }}>天道既定</h2>
                                <p className="text-gray-400 text-sm" style={{ fontFamily: 'var(--ui-辅助文本-font-family, inherit)', fontSize: 'var(--ui-辅助文本-font-size, 12px)' }}>一切准备就绪，即将推演这方世界。</p>
                            </div>

                            <OrnateBorder className="max-w-lg w-full p-6">
                                <div className="text-sm space-y-3 font-mono text-gray-300">
                                    <p>世界: <span className="text-white">{worldConfig.worldName}</span></p>
                                    <p>难度: <span className="text-white uppercase">{worldConfig.difficulty}</span></p>
                                    <p>世界观草稿/细化要求: <span className="text-white">{worldConfig.worldExtraRequirement.trim() || '无'}</span></p>
                                    <p>手动世界观提示词: <span className="text-white">{worldConfig.manualWorldPrompt.trim() ? '已提供' : '未提供'}</span></p>
                                    <p>手动境界提示词: <span className="text-white">{worldConfig.manualRealmPrompt.trim() ? '已提供' : '未提供'}</span></p>
                                    <p>主角: <span className="text-white">{charName.trim() || '未填写姓名'}</span> <span className='text-gray-500'>({charGender.trim() || '未填写性别'}, {charAge}岁)</span></p>
                                    <p>外貌: <span className="text-white">{charAppearance.trim() || '未填写'}</span></p>
                                    <p>性格: <span className="text-white">{charPersonality.trim() || '未填写'}</span></p>
                                    <p>身份: <span className="text-white">{selectedBackground.名称}</span></p>
                                    <p>天赋: <span className="text-white">{selectedTalents.map(t => t.名称).join(', ') || '无'}</span></p>
                                    <p>开局伙伴: <span className="text-white">{partnerEnabled ? `${获取当前伙伴列表快照().length} 名` : '关闭'}</span></p>
                                    {partnerEnabled && <p>伙伴名单: <span className="text-white">{获取当前伙伴列表快照().map((partner) => partner.姓名 || '未填写姓名').join('、')}</span></p>}
                                    <p>开局配置: <span className="text-white">{openingConfigEnabled ? '已启用' : '未启用'}</span></p>
                                    <p>题材模式: <span className="text-white">{当前题材显示摘要.label}</span></p>
                                    <p>关系侧重: <span className="text-white">{openingConfigEnabled ? (openingConfig.关系侧重.join('、') || '无') : '未设置'}</span></p>
                                    <p>开局切入: <span className="text-white">{openingConfigEnabled ? openingConfig.开局切入偏好 : '未设置'}</span></p>
                                    <p>开局时间: <span className="text-white">{openingConfigEnabled ? (openingConfig.自定义开局时间 || 默认开局时间) : '未设置'}</span></p>
                                    <p>生成性别: <span className="text-white">{openingConfigEnabled ? openingConfig.允许生成性别.join('、') : '未设置'}</span></p>
                                    <p>同人融合: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.enabled ? `${openingConfig.同人融合.作品名 || '未命名作品'} / ${openingConfig.同人融合.融合强度}` : '关闭') : '未设置'}</span></p>
                                    <p>角色替换: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.启用角色替换 ? (格式化角色替换规则摘要(当前角色替换规则列表) || '未填写规则') : '关闭') : '未设置'}</span></p>
                                    <p>附加小说: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.启用附加小说 ? (当前附加小说数据集?.作品名 || 当前附加小说数据集?.标题 || '未选择数据集') : '关闭') : '未设置'}</span></p>
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="w-full max-w-lg p-4">
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs text-gray-300 font-bold tracking-widest">开局额外要求（可选）</div>
                                            <div className="text-[11px] text-gray-500 mt-1">会随开局任务一起发送给模型，仅影响本次开局生成。</div>
                                        </div>
                                        <GameButton
                                            onClick={() => { void runAiFrameworkAssist(); }}
                                            variant="secondary"
                                            disabled={!aiFrameworkAvailable || aiFrameworkStatus.type === 'loading'}
                                            className="px-4 py-2 text-xs shrink-0"
                                        >
                                            {aiFrameworkStatus.type === 'loading' ? 'AI 补全中' : 'AI 补全框架'}
                                        </GameButton>
                                    </div>
                                    {aiFrameworkStatus.message && (
                                        <div className={`rounded-lg border px-3 py-2 text-[11px] leading-5 ${
                                            aiFrameworkStatus.type === 'error'
                                                ? 'border-red-500/35 bg-red-950/20 text-red-200'
                                                : aiFrameworkStatus.type === 'success'
                                                    ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
                                                    : 'border-wuxia-cyan/30 bg-wuxia-cyan/10 text-wuxia-cyan'
                                        }`}>
                                            {aiFrameworkStatus.message}
                                        </div>
                                    )}
                                    <textarea
                                        value={openingExtraRequirement}
                                        onChange={(e) => setOpeningExtraRequirement(e.target.value)}
                                        placeholder="例如：开局先走日常线，不要直接爆发战斗；先铺垫家族关系。"
                                        className="w-full h-24 bg-black/40 border border-gray-700 rounded-md p-3 text-xs text-gray-200 resize-none outline-none focus:border-wuxia-gold/50"
                                    />
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="w-full max-w-lg p-4">
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs text-gray-300 font-bold tracking-widest">保存为自定义开局方案</div>
                                            <div className="text-[11px] text-gray-500 mt-1">这里会保留当前侠客名录页已经调整过的姓名、性别、年龄、外貌、性格、背景、天赋和开局要求。</div>
                                        </div>
                                        <GameButton
                                            onClick={() => {
                                                if (showCustomPresetEditor) {
                                                    重置自定义开局预设编辑();
                                                    return;
                                                }
                                                setShowCustomPresetEditor(true);
                                            }}
                                            variant="secondary"
                                            className="px-4 py-2 text-xs shrink-0"
                                        >
                                            {showCustomPresetEditor ? '收起编辑器' : '保存当前方案'}
                                        </GameButton>
                                    </div>

                                    {showCustomPresetEditor && (
                                        <div className="rounded-2xl border border-wuxia-cyan/25 bg-black/30 p-4 space-y-3">
                                            <input
                                                type="text"
                                                placeholder="方案名称"
                                                value={customPresetMeta.名称}
                                                onChange={(e) => setCustomPresetMeta(prev => ({ ...prev, 名称: e.target.value }))}
                                                className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-white outline-none rounded-md transition-all"
                                            />
                                            <textarea
                                                placeholder="方案简介：说明这套开局适合什么节奏、主题或路线"
                                                value={customPresetMeta.简介}
                                                onChange={(e) => setCustomPresetMeta(prev => ({ ...prev, 简介: e.target.value }))}
                                                className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                            />
                                            <div className="flex gap-2">
                                                <GameButton onClick={() => { void 保存当前为自定义开局方案(); }} variant="secondary" className="flex-1 py-2 text-xs">
                                                    {正在编辑开局预设ID ? '保存方案修改' : '保存自定义方案'}
                                                </GameButton>
                                                <GameButton onClick={重置自定义开局预设编辑} variant="secondary" className="px-4 py-2 text-xs opacity-80">
                                                    取消
                                                </GameButton>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </OrnateBorder>

                            <div className="flex flex-col gap-4 w-full max-w-md">
                                <GameButton onClick={() => { void handleGenerate(); }} variant="primary" className="w-full py-4 text-lg">
                                    一键生成 (世界+剧情)
                                </GameButton>
                            </div>
                        </div>
                    )}

                </div>

                {/* Bottom Action Bar */}
                <div className="h-24 border-t border-gray-800/80 bg-black/60 backdrop-blur-md flex items-center justify-between px-10 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
                    <div>
                        <div className="text-[11px] text-gray-500 font-mono tracking-widest uppercase">Progress</div>
                        <div className="mt-1.5 flex items-center gap-2">
                            <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-wuxia-gold transition-all duration-500" style={{ width: `${stepProgress}%` }}></div>
                            </div>
                            <span className="text-xs text-wuxia-gold ml-2 font-mono">{step + 1} / {STEPS.length}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {step > 0 && (
                            <GameButton onClick={() => setStep(step - 1)} variant="secondary" className="px-8 py-3 text-sm tracking-wider opacity-80 hover:opacity-100 transition-opacity">
                                &larr; 上一步
                            </GameButton>
                        )}
                        {step < STEPS.length - 1 ? (
                            <GameButton onClick={handleNextStep} variant="primary" className="px-8 py-3 text-sm tracking-wider shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                                下一步 &rarr;
                            </GameButton>
                        ) : (
                            <GameButton onClick={() => { void handleGenerate(); }} variant="primary" className="px-10 py-3 text-base tracking-widest shadow-[0_0_20px_rgba(212,175,55,0.4)] bg-gradient-to-r from-wuxia-gold/90 to-wuxia-gold text-black font-bold">
                                开启世界推演
                            </GameButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewGameWizard;
