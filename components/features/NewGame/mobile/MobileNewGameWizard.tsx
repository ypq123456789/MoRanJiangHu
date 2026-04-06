import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameButton from '../../../ui/GameButton';
import { OpeningConfig, WorldGenConfig, 小说拆分数据集结构, 角色数据结构, 天赋结构, 背景结构, 游戏难度 } from '../../../../types';
import { 预设天赋, 预设背景 } from '../../../../data/presets';
import { 开局预设方案结构 } from '../../../../data/newGamePresets';
import { OrnateBorder } from '../../../ui/decorations/OrnateBorder';
import InlineSelect from '../../../ui/InlineSelect';
import * as dbService from '../../../../services/dbService';
import { 读取小说拆分数据集列表 } from '../../../../services/novelDecompositionStore';
import { 合并去重开局预设方案, 标准化开局预设方案, 生成自定义开局预设ID, 自定义开局预设存储键 } from '../../../../utils/customNewGamePresets';
import {
    关系侧重选项,
    同人来源类型选项,
    同人融合强度选项,
    开局切入偏好选项,
    属性最大值,
    属性最小值,
    创建默认属性分配,
    新开局步骤列表,
    默认开局配置,
    获取难度总属性点,
    获取同人角色替换规则列表,
    格式化角色替换规则摘要,
    规范化开局配置,
    规范化可选开局配置
} from '../../../../utils/openingConfig';
import { 默认境界母板提示词 } from '../../../../prompts/runtime/fandom';
import { 设置键 } from '../../../../utils/settingsSchema';

interface Props {
    onComplete: (
        worldConfig: WorldGenConfig, 
        charData: 角色数据结构, 
        openingConfig: OpeningConfig | undefined,
        mode: 'all' | 'step',
        openingStreaming: boolean,
        openingExtraPrompt?: string
    ) => void;
    onCancel: () => void;
    loading: boolean;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

const STEPS = [...新开局步骤列表];
const 自定义天赋存储键 = 设置键.自定义天赋;
const 自定义背景存储键 = 设置键.自定义背景;
type 自定义开局预设元信息 = {
    名称: string;
    简介: string;
};
type 属性结构 = {
    力量: number;
    敏捷: number;
    体质: number;
    根骨: number;
    悟性: number;
    福源: number;
};
const 难度下拉选项: Array<{ value: 游戏难度; label: string }> = [
    { value: 'relaxed', label: '轻松 (剧情模式)' },
    { value: 'easy', label: '简单 (初入江湖)' },
    { value: 'normal', label: '正常 (标准体验)' },
    { value: 'hard', label: '困难 (刀光剑影)' },
    { value: 'extreme', label: '极限 (修罗炼狱)' }
];
const 世界版图下拉选项: Array<{ value: WorldGenConfig['worldSize']; label: string }> = [
    { value: '弹丸之地', label: '弹丸之地 (一岛或一城)' },
    { value: '九州宏大', label: '九州宏大 (万里河山)' },
    { value: '无尽位面', label: '无尽位面 (多重世界)' }
];
const 宗门密度下拉选项: Array<{ value: WorldGenConfig['sectDensity']; label: string }> = [
    { value: '稀少', label: '稀少 (隐世不出)' },
    { value: '适中', label: '适中 (数大宗门)' },
    { value: '林立', label: '林立 (百家争鸣)' }
];

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

const MobileNewGameWizard: React.FC<Props> = ({ onComplete, onCancel, loading, requestConfirm }) => {
    const [step, setStep] = useState(0);

    // --- State: World Config ---
    const [worldConfig, setWorldConfig] = useState<WorldGenConfig>({
        worldName: '太古界',
        worldSize: '九州宏大',
        dynastySetting: '群雄逐鹿，王朝末年',
        sectDensity: '林立',
        tianjiaoSetting: '大争之世，天骄并起',
        worldExtraRequirement: '',
        manualWorldPrompt: '',
        manualRealmPrompt: '',
        difficulty: 'normal' as 游戏难度 // Default difficulty
    });

    // --- State: Character Config ---
    const [charName, setCharName] = useState('');
    const [charGender, setCharGender] = useState('男');
    const [charAge, setCharAge] = useState(18);
    const [charAppearance, setCharAppearance] = useState('黑发黑眸，面容清秀，衣着朴素利落。');
    const [charPersonality, setCharPersonality] = useState('外冷内热，谨慎克制，遇事先观察再出手。');
    const [birthMonth, setBirthMonth] = useState(1);
    const [birthDay, setBirthDay] = useState(1);
    const [monthOpen, setMonthOpen] = useState(false);
    const [dayOpen, setDayOpen] = useState(false);
    const monthRef = useRef<HTMLDivElement>(null);
    const dayRef = useRef<HTMLDivElement>(null);
    const manualWorldPromptInputRef = useRef<HTMLInputElement>(null);
    const manualRealmPromptInputRef = useRef<HTMLInputElement>(null);
    
    const [stats, setStats] = useState<属性结构>(创建默认属性分配);
    const [openingConfig, setOpeningConfig] = useState<OpeningConfig>(默认开局配置);
    const [openingConfigEnabled, setOpeningConfigEnabled] = useState(false);

    // Talents & Background
    const [selectedBackground, setSelectedBackground] = useState<背景结构>(预设背景[0]);
    const [selectedTalents, setSelectedTalents] = useState<天赋结构[]>([]);
    const [自定义天赋列表, 设置自定义天赋列表] = useState<天赋结构[]>([]);
    const [自定义背景列表, 设置自定义背景列表] = useState<背景结构[]>([]);
    const [自定义开局预设列表, 设置自定义开局预设列表] = useState<开局预设方案结构[]>([]);
    const [小说拆分数据集列表, 设置小说拆分数据集列表] = useState<小说拆分数据集结构[]>([]);
    
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

    // --- Logic ---
    const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
    const 标准化天赋 = (raw: 天赋结构): 天赋结构 | null => {
        const 名称 = raw?.名称?.trim() || '';
        const 描述 = raw?.描述?.trim() || '';
        const 效果 = raw?.效果?.trim() || '';
        if (!名称 || !描述 || !效果) return null;
        return { 名称, 描述, 效果 };
    };
    const 标准化背景 = (raw: 背景结构): 背景结构 | null => {
        const 名称 = raw?.名称?.trim() || '';
        const 描述 = raw?.描述?.trim() || '';
        const 效果 = raw?.效果?.trim() || '';
        if (!名称 || !描述 || !效果) return null;
        return { 名称, 描述, 效果 };
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
    const 全部背景选项 = useMemo(
        () => [...预设背景, ...自定义背景列表.filter(item => !预设背景.some(p => p.名称 === item.名称))],
        [自定义背景列表]
    );
    const 全部天赋选项 = useMemo(
        () => [...预设天赋, ...自定义天赋列表.filter(item => !预设天赋.some(p => p.名称 === item.名称))],
        [自定义天赋列表]
    );
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
        const hit = [...预设背景, ...自定义背景列表].find(item => item.名称 === 名称);
        return hit || 预设背景[0];
    };
    const 根据名称查找天赋列表 = (名称列表: string[]): 天赋结构[] => (
        名称列表
            .map((名称) => [...预设天赋, ...自定义天赋列表].find(item => item.名称 === 名称))
            .filter((item): item is 天赋结构 => Boolean(item))
            .slice(0, 3)
    );
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

        return {
            出生日期: `${params?.出生月 ?? birthMonth}月${params?.出生日 ?? birthDay}日`,
            ...(最终属性 as any),
            姓名: (params?.角色名 ?? charName).trim(),
            性别: (params?.性别 ?? charGender).trim() || '未设定',
            年龄: 最终年龄,
            外貌: (params?.外貌 ?? charAppearance).trim() || '相貌平常，衣着朴素。',
            性格: (params?.性格 ?? charPersonality).trim() || '未设定',
            天赋列表: params?.天赋列表 ?? selectedTalents,
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
            当前经验: 0, 升级经验: 初始升级经验, 玩家BUFF: [], 突破条件: []
        };
    };
    const 应用预设到表单 = (preset: 开局预设方案结构) => {
        const nextWorldConfig: WorldGenConfig = { ...worldConfig, ...preset.worldConfig };
        const nextBackground = 根据名称查找背景(preset.character.背景名称);
        const nextTalents = 根据名称查找天赋列表(preset.character.天赋名称列表);
        setWorldConfig(nextWorldConfig);
        setCharName(preset.character.姓名);
        setCharGender(preset.character.性别);
        setCharAge(preset.character.年龄);
        setBirthMonth(preset.character.出生月);
        setBirthDay(preset.character.出生日);
        setCharAppearance(preset.character.外貌);
        setCharPersonality(preset.character.性格);
        setStats(preset.character.属性);
        setSelectedBackground(nextBackground);
        setSelectedTalents(nextTalents);
        const normalizedOpeningConfig = 规范化可选开局配置(preset.openingConfig);
        setOpeningConfigEnabled(Boolean(normalizedOpeningConfig));
        setOpeningConfig(normalizedOpeningConfig || 默认开局配置());
        setOpeningExtraRequirement(preset.openingExtraRequirement || '');
        setStep(1);
    };
    const 当前性别模式: '男' | '女' | '自定义' = charGender.trim() === '男' || charGender.trim() === '女'
        ? charGender.trim() as '男' | '女'
        : '自定义';
    const 选择性别 = (next: '男' | '女' | '自定义') => {
        if (next === '自定义') {
            setCharGender(prev => (prev.trim() === '男' || prev.trim() === '女') ? '' : prev);
            return;
        }
        setCharGender(next);
    };

    const totalStatBudget = useMemo(() => 获取难度总属性点(worldConfig.difficulty), [worldConfig.difficulty]);
    const usedPoints = Object.values(stats).reduce((a, b) => a + b, 0);
    const remainingPoints = totalStatBudget - usedPoints;
    const stepProgress = ((step + 1) / STEPS.length) * 100;
    const currentStepLabel = STEPS[step] || '创建';
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
                const [savedTalents, savedBackgrounds, savedStartPresets, savedNovelDatasets] = await Promise.all([
                    dbService.读取设置(自定义天赋存储键),
                    dbService.读取设置(自定义背景存储键),
                    dbService.读取设置(自定义开局预设存储键),
                    读取小说拆分数据集列表()
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
            setStep(1);
            return false;
        }
        return true;
    };

    const handleNextStep = () => {
        if (step === 1 && !校验属性点是否合法()) return;
        setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    };

    const toggleTalent = (t: 天赋结构) => {
        if (selectedTalents.find(x => x.名称 === t.名称)) {
            setSelectedTalents(selectedTalents.filter(x => x.名称 !== t.名称));
        } else {
            if (selectedTalents.length >= 3) {
                alert("最多选择3个天赋");
                return;
            }
            setSelectedTalents([...selectedTalents, t]);
        }
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
        if (!已选同名 && selectedTalents.length >= 3) {
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

    const 构建当前表单开局预设 = (meta?: Partial<自定义开局预设元信息> & { id?: string }): 开局预设方案结构 => ({
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
        openingConfig: openingConfigEnabled ? 规范化开局配置(openingConfig) : undefined,
        openingStreaming: true,
        openingExtraRequirement: openingExtraRequirement.trim()
    });

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
        setStep(4);
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
        const effectiveWorldConfig = preset ? { ...worldConfig, ...preset.worldConfig } : worldConfig;
        const effectiveOpeningConfig = preset
            ? 规范化可选开局配置(preset.openingConfig)
            : (openingConfigEnabled ? 规范化开局配置(openingConfig) : undefined);
        const effectiveName = preset?.character.姓名 ?? charName;
        const effectiveGender = preset?.character.性别 ?? charGender;
        const effectiveRoleReplaceRules = 获取同人角色替换规则列表(effectiveOpeningConfig, effectiveName);
        if (!effectiveName.trim()) {
            alert("请先填写角色姓名");
            setStep(1);
            return;
        }
        if (!effectiveGender.trim()) {
            alert("请先填写角色性别");
            setStep(1);
            return;
        }
        if (!preset && !校验属性点是否合法()) return;
        if (effectiveOpeningConfig?.同人融合.enabled && !effectiveOpeningConfig.同人融合.作品名.trim()) {
            alert('已启用同人融合，请先填写作品名。');
            setStep(3);
            return;
        }
        if (
            effectiveOpeningConfig?.同人融合.enabled
            && effectiveOpeningConfig.同人融合.启用附加小说
            && !effectiveOpeningConfig.同人融合.附加小说数据集ID.trim()
        ) {
            alert('已启用附加小说，请先选择一个小说分解数据集。');
            setStep(3);
            return;
        }
        if (
            effectiveOpeningConfig?.同人融合.enabled
            && effectiveOpeningConfig.同人融合.启用角色替换
            && effectiveRoleReplaceRules.length <= 0
        ) {
            alert('已启用同人角色替换，请先填写至少一条有效替换规则。');
            setStep(3);
            return;
        }
        const charData = preset
            ? 构建角色数据({
                角色名: preset.character.姓名,
                性别: preset.character.性别,
                年龄: preset.character.年龄,
                外貌: preset.character.外貌,
                性格: preset.character.性格,
                出生月: preset.character.出生月,
                出生日: preset.character.出生日,
                属性: preset.character.属性,
                背景: 根据名称查找背景(preset.character.背景名称),
                天赋列表: 根据名称查找天赋列表(preset.character.天赋名称列表)
            })
            : 构建角色数据();
        const effectiveOpeningExtraRequirement = preset?.openingExtraRequirement ?? openingExtraRequirement;
        const ok = requestConfirm
            ? await requestConfirm({
                title: '确认创建',
                message: '开局将直接以流式方式生成并展示开场剧情。是否继续创建？',
                confirmText: '开始生成'
            })
            : true;
        if (!ok) return;
        onComplete(effectiveWorldConfig, charData, effectiveOpeningConfig, 'all', true, effectiveOpeningExtraRequirement.trim());
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
        <div className="h-full w-full flex flex-col items-center justify-center bg-black relative overflow-hidden z-50">
            {/* Background */}
            <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: 'url(/assets/images/world_map_bg.jpg)' }}></div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black/90 backdrop-blur-sm"></div>

            {/* Mobile Header Steps */}
            <div className="w-full relative z-10 border-b border-gray-800 bg-black/60 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 shadow-md">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] tracking-[0.3em] text-wuxia-gold/60 font-mono">WORLD GENESIS</span>
                        <h2 className="text-lg font-serif font-bold text-wuxia-gold tracking-widest mt-0.5">创世录</h2>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-wuxia-cyan tracking-widest">{currentStepLabel}</div>
                        <span className="text-[10px] text-gray-500 font-mono">{step + 1} / {STEPS.length}</span>
                    </div>
                </div>
                <div className="h-1 w-full bg-black/80 border border-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-wuxia-gold/80 to-wuxia-gold transition-all duration-300"
                        style={{ width: `${stepProgress}%` }}
                    ></div>
                </div>
            </div>

            {/* Content Area */}
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar p-4 pb-20 relative z-10">
                    
                    {/* STEP 1: WORLD SETTINGS */}
                    {step === 0 && (
                        <div className="animate-slide-in max-w-4xl mx-auto">
                            <OrnateBorder className="p-4 md:p-8">
                                <h3 className="text-xl font-serif font-bold text-wuxia-gold border-b border-wuxia-gold/30 pb-3 mb-6">世界法则设定</h3>
                                
                                <div className="space-y-6">
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
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">世界版图</label>
                                            <InlineSelect
                                                value={worldConfig.worldSize}
                                                options={世界版图下拉选项}
                                                onChange={(worldSize) => setWorldConfig({ ...worldConfig, worldSize })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-wuxia-cyan font-bold">宗门密度</label>
                                            <InlineSelect
                                                value={worldConfig.sectDensity}
                                                options={宗门密度下拉选项}
                                                onChange={(sectDensity) => setWorldConfig({ ...worldConfig, sectDensity })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">王朝局势 (自定义)</label>
                                        <input 
                                            value={worldConfig.dynastySetting}
                                            onChange={e => setWorldConfig({...worldConfig, dynastySetting: e.target.value})}
                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all font-serif tracking-wider"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">天骄/战力设定 (自定义)</label>
                                        <textarea 
                                            value={worldConfig.tianjiaoSetting}
                                            onChange={e => setWorldConfig({...worldConfig, tianjiaoSetting: e.target.value})}
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">世界观额外要求 (可选)</label>
                                        <textarea
                                            value={worldConfig.worldExtraRequirement}
                                            onChange={e => setWorldConfig({ ...worldConfig, worldExtraRequirement: e.target.value })}
                                            placeholder="例如：强调宗门政治与朝堂博弈，减少神话奇观；世界风格偏冷峻写实。"
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <div className="text-[11px] text-gray-500">仅作用于世界观提示词生成，不直接改写角色初始状态。</div>
                                    </div>

                                    <div className="space-y-4 rounded-2xl border border-wuxia-cyan/20 bg-black/25 p-4">
                                        <div>
                                            <div className="text-sm text-wuxia-cyan font-bold">手动提示词文件</div>
                                            <div className="text-[11px] text-gray-500 mt-1 leading-6">
                                                可导入现成的世界观提示词或境界体系提示词。填写后优先使用手动内容；如果两者都已给出，就会直接跳过前置生成进入开局剧情。
                                            </div>
                                        </div>

                                        <div className="space-y-4">
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
                                                            className="px-3 py-2 text-[11px]"
                                                        >
                                                            导入文件
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出手动世界观提示词}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-[11px]"
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
                                                    className="w-full h-36 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-xs text-white outline-none rounded-md transition-all resize-none"
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
                                                            className="px-3 py-2 text-[11px]"
                                                        >
                                                            导入文件
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出手动境界提示词}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-[11px]"
                                                            disabled={!worldConfig.manualRealmPrompt.trim()}
                                                        >
                                                            导出
                                                        </GameButton>
                                                        <GameButton
                                                            onClick={导出境界提示词模板}
                                                            variant="secondary"
                                                            className="px-3 py-2 text-[11px]"
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
                                                    className="w-full h-36 bg-black/50 border-2 border-transparent focus:border-wuxia-gold p-3 text-xs text-white outline-none rounded-md transition-all resize-none"
                                                />
                                                <div className="text-[11px] text-gray-500">这里会复用现有境界体系完整性校验；结构不全时会直接阻止开局。保存自定义开局方案时也会一并保存。</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-wuxia-gold/20 pt-6">
                                        <div>
                                            <div className="text-sm text-wuxia-cyan font-bold">开局预设方案</div>
                                            <div className="text-[11px] text-gray-500 mt-1">这里只保留你自己保存的方案；世界设定、手动提示词、角色、背景、天赋和开局要求都会一起保存。</div>
                                        </div>

                                        {自定义开局预设列表.length > 0 && (
                                            <div className="rounded-2xl border border-gray-800 bg-black/25 p-4 space-y-3">
                                                <div className="text-[10px] tracking-[0.25em] text-gray-500 font-mono">已保存自定义开局方案</div>
                                                <div className="space-y-3">
                                                    {自定义开局预设列表.map((preset) => (
                                                        <div key={preset.id} className="rounded-2xl border border-gray-700 bg-black/35 p-4 space-y-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="text-base font-serif text-wuxia-gold">{preset.名称}</div>
                                                                    <div className="text-[11px] text-gray-400 mt-2 leading-6">{preset.简介}</div>
                                                                </div>
                                                                <span className="text-[10px] text-wuxia-cyan">自定义</span>
                                                            </div>
                                                            <div className="text-[11px] text-gray-500 leading-6">
                                                                {preset.character.背景名称 || '未设背景'} / {preset.character.天赋名称列表.join('、') || '未设天赋'}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500 leading-6">
                                                                手动世界观：{preset.worldConfig.manualWorldPrompt ? '已保存' : '未保存'} / 手动境界：{preset.worldConfig.manualRealmPrompt ? '已保存' : '未保存'}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <GameButton onClick={() => 应用预设到表单(preset)} variant="secondary" className="py-2 text-xs">套用方案</GameButton>
                                                                <GameButton onClick={() => { void handleGenerate(preset); }} variant="primary" className="py-2 text-xs">快速生成</GameButton>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                                                                <button type="button" onClick={() => 编辑自定义开局方案信息(preset)} className="text-wuxia-cyan">编辑</button>
                                                                <button type="button" onClick={() => { void 用当前配置覆盖开局方案(preset); }} className="text-wuxia-gold">覆盖</button>
                                                                <button type="button" onClick={() => { void 删除自定义开局方案(preset.id); }} className="text-red-400">删除</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </OrnateBorder>
                        </div>
                    )}

                    {/* STEP 2: CHARACTER BASIC */}
                    {step === 1 && (
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
                                                <div className="grid grid-cols-3 gap-2">
                                                    <button onClick={() => 选择性别('男')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '男' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>男</button>
                                                    <button onClick={() => 选择性别('女')} className={`p-3 rounded text-center transition-all ${当前性别模式 === '女' ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold border' : 'bg-black/40 border border-transparent hover:border-gray-600'}`}>女</button>
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
                                </div>

                                {/* Right: Stats */}
                                <div className="md:col-span-3">
                                    <OrnateBorder className="h-full">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-wuxia-gold font-bold text-lg">天资根骨</span>
                                            <span className={`text-sm font-mono transition-colors ${remainingPoints < 0 ? 'text-red-400' : remainingPoints > 0 ? 'text-green-400' : 'text-gray-500'}`}>总点数: {usedPoints}/{totalStatBudget}</span>
                                        </div>
                                        <div className={`mb-3 text-xs font-mono ${remainingPoints < 0 ? 'text-red-400' : 'text-gray-500'}`}>剩余点数: {remainingPoints}</div>
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
                    {step === 2 && (
                        <div className="space-y-5 animate-slide-in max-w-5xl mx-auto">
                            <OrnateBorder className="p-4 bg-gradient-to-br from-black/70 via-black/55 to-wuxia-gold/5">
                                <div className="border-b border-wuxia-gold/30 pb-3 mb-4">
                                    <div className="text-[10px] uppercase tracking-[0.32em] text-wuxia-cyan/70 font-mono">Origin Archive</div>
                                    <h3 className="text-xl font-serif font-bold text-wuxia-gold mt-2">身份背景</h3>
                                    <p className="text-[11px] text-gray-400 mt-2 leading-6">{背景长期说明}</p>
                                </div>

                                <div className="rounded-2xl border border-wuxia-gold/20 bg-black/35 px-4 py-4 mb-4">
                                    <div className="text-[10px] tracking-[0.25em] text-wuxia-gold/70 font-mono">已选身份</div>
                                    <div className="mt-2 text-lg font-serif text-wuxia-gold">{selectedBackground.名称 || '未选择身份'}</div>
                                    <p className="mt-2 text-sm text-gray-300 leading-6">{selectedBackground.描述 || '该身份会持续影响主角的社会位置、资源路径与他人预期。'}</p>
                                    <div className="mt-3 rounded-xl border border-wuxia-cyan/20 bg-black/30 px-3 py-3 text-sm text-wuxia-cyan/90 leading-6">
                                        <span className="text-wuxia-gold/80 mr-2">长期作用：</span>
                                        {selectedBackground.效果 || '未填写'}
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        if (showCustomBackground) {
                                            重置自定义背景编辑();
                                            return;
                                        }
                                        setShowCustomBackground(true);
                                    }}
                                    className="mb-4 text-xs text-wuxia-cyan hover:text-wuxia-gold transition-colors"
                                >
                                    {showCustomBackground ? '收起自定义身份编辑器' : '+ 自定义身份'}
                                </button>

                                {showCustomBackground && (
                                    <div className="bg-black/40 border border-wuxia-cyan/30 p-4 mb-4 rounded-2xl space-y-3">
                                        <input
                                            placeholder="身份名称（例：江南王世子）"
                                            value={customBackground.名称}
                                            onChange={e => setCustomBackground({ ...customBackground, 名称: e.target.value })}
                                            className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all"
                                        />
                                        <textarea
                                            placeholder="身份描述：说明来历、定位、处境"
                                            value={customBackground.描述}
                                            onChange={e => setCustomBackground({ ...customBackground, 描述: e.target.value })}
                                            className="w-full h-20 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <textarea
                                            placeholder="长期作用：强调此身份会长期影响哪些资源、关系、风险与路线"
                                            value={customBackground.效果}
                                            onChange={e => setCustomBackground({ ...customBackground, 效果: e.target.value })}
                                            className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                        />
                                        <div className="text-[11px] text-gray-500">避免只写“开局送东西”，更推荐写身份带来的长期权限、人脉与压力。</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <GameButton onClick={addCustomBackground} variant="secondary" className="py-2 text-xs">{正在编辑背景名 ? '保存身份修改' : '保存并使用'}</GameButton>
                                            <GameButton onClick={重置自定义背景编辑} variant="secondary" className="py-2 text-xs opacity-80">取消</GameButton>
                                        </div>
                                    </div>
                                )}

                                {自定义背景列表.length > 0 && (
                                    <div className="mb-4 rounded-2xl border border-gray-800 bg-black/25 p-4">
                                        <div className="text-[10px] tracking-[0.25em] text-gray-500 font-mono">已保存自定义身份</div>
                                        <div className="mt-3 space-y-2">
                                            {自定义背景列表.map((bg) => (
                                                <div key={bg.名称} className="rounded-xl border border-gray-800 bg-black/30 px-3 py-3 space-y-2">
                                                    <div className="text-sm text-gray-200">{bg.名称}</div>
                                                    <div className="text-[11px] text-gray-500">{bg.效果}</div>
                                                    <div className="flex items-center gap-3 text-[11px]">
                                                        <button type="button" onClick={() => setSelectedBackground(bg)} className="text-wuxia-gold">使用</button>
                                                        <button type="button" onClick={() => 编辑自定义背景(bg)} className="text-wuxia-cyan">编辑</button>
                                                        <button type="button" onClick={() => { void 删除自定义背景(bg.名称); }} className="text-red-400">删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {全部背景选项.map((bg, idx) => {
                                        const isSelected = selectedBackground.名称 === bg.名称;
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedBackground(bg)}
                                                className={`rounded-2xl border cursor-pointer transition-all duration-300 overflow-hidden ${
                                                    isSelected
                                                        ? 'border-wuxia-gold bg-gradient-to-br from-wuxia-gold/15 via-black/70 to-black/70 shadow-[0_0_20px_rgba(212,175,55,0.14)]'
                                                        : 'border-gray-700 bg-black/25 hover:border-wuxia-gold/45'
                                                }`}
                                            >
                                                <div className="p-4">
                                                    <div className={`font-bold text-base font-serif ${isSelected ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                                        {bg.名称}
                                                        {!预设背景.some(p => p.名称 === bg.名称) ? ' · 自定义' : ''}
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-400 leading-6">{bg.描述}</div>
                                                    <div className="mt-3 rounded-xl border border-white/8 bg-black/30 px-3 py-3 text-sm text-wuxia-cyan/90 leading-6">
                                                        <span className="text-wuxia-gold/80 mr-2">长期效果</span>
                                                        {bg.效果}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="p-4 bg-gradient-to-br from-black/65 to-wuxia-red/5">
                                <div className="border-b border-wuxia-gold/30 pb-3 mb-4">
                                    <div className="text-[10px] uppercase tracking-[0.32em] text-wuxia-red/70 font-mono">Fate Traits</div>
                                    <h3 className="text-xl font-serif font-bold text-wuxia-gold mt-2">天赋卷宗</h3>
                                    <p className="text-[11px] text-gray-400 mt-2 leading-6">{天赋说明}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {selectedTalentNames.length > 0 ? selectedTalentNames.map(name => (
                                            <span key={name} className="rounded-full border border-wuxia-red/35 bg-wuxia-red/10 px-3 py-1 text-[11px] text-wuxia-red">{name}</span>
                                        )) : (
                                            <span className="text-[11px] text-gray-500">尚未选择天赋</span>
                                        )}
                                    </div>
                                    <div className="mt-3 text-[11px] text-gray-500">已选 {selectedTalents.length}/3 个。建议围绕长期路线，而不是只堆开局爆发。</div>
                                </div>

                                <button
                                    onClick={() => {
                                        if (showCustomTalent) {
                                            重置自定义天赋编辑();
                                            return;
                                        }
                                        setShowCustomTalent(true);
                                    }}
                                    className="mb-4 text-xs text-wuxia-cyan hover:text-wuxia-gold transition-colors"
                                >
                                    {showCustomTalent ? '收起自定义天赋编辑器' : '+ 自定义天赋'}
                                </button>

                                {showCustomTalent && (
                                    <div className="bg-black/40 border border-wuxia-cyan/30 p-4 mb-4 rounded-2xl space-y-3">
                                        <input placeholder="天赋名称" value={customTalent.名称} onChange={e => setCustomTalent({...customTalent, 名称: e.target.value})} className="w-full bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all" />
                                        <textarea placeholder="天赋描述：说明天赋偏向与风格" value={customTalent.描述} onChange={e => setCustomTalent({...customTalent, 描述: e.target.value})} className="w-full h-20 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none" />
                                        <textarea placeholder="长期效果：说明它会长期强化哪些成长、判定或路线" value={customTalent.效果} onChange={e => setCustomTalent({...customTalent, 效果: e.target.value})} className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <GameButton onClick={addCustomTalent} variant="secondary" className="py-2 text-xs">{正在编辑天赋名 ? '保存天赋修改' : '保存自定义天赋'}</GameButton>
                                            <GameButton onClick={重置自定义天赋编辑} variant="secondary" className="py-2 text-xs opacity-80">取消</GameButton>
                                        </div>
                                    </div>
                                )}

                                {自定义天赋列表.length > 0 && (
                                    <div className="mb-4 rounded-2xl border border-gray-800 bg-black/25 p-4">
                                        <div className="text-[10px] tracking-[0.25em] text-gray-500 font-mono">已保存自定义天赋</div>
                                        <div className="mt-3 space-y-2">
                                            {自定义天赋列表.map((talent) => (
                                                <div key={talent.名称} className="rounded-xl border border-gray-800 bg-black/30 px-3 py-3 space-y-2">
                                                    <div className="text-sm text-gray-200">{talent.名称}</div>
                                                    <div className="text-[11px] text-gray-500">{talent.效果}</div>
                                                    <div className="flex items-center gap-3 text-[11px]">
                                                        <button type="button" onClick={() => toggleTalent(talent)} className="text-wuxia-gold">{selectedTalents.some(item => item.名称 === talent.名称) ? '取消使用' : '使用'}</button>
                                                        <button type="button" onClick={() => 编辑自定义天赋(talent)} className="text-wuxia-cyan">编辑</button>
                                                        <button type="button" onClick={() => { void 删除自定义天赋(talent.名称); }} className="text-red-400">删除</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {全部天赋选项.map((t, idx) => {
                                        const isSelected = !!selectedTalents.find(x => x.名称 === t.名称);
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => toggleTalent(t)}
                                                className={`rounded-2xl border cursor-pointer transition-all duration-300 overflow-hidden ${
                                                    isSelected
                                                        ? 'border-wuxia-red bg-gradient-to-br from-wuxia-red/15 via-black/70 to-black/70 shadow-[0_0_20px_rgba(190,30,45,0.14)]'
                                                        : 'border-gray-700 bg-black/25 hover:border-wuxia-red/45'
                                                }`}
                                            >
                                                <div className="p-4">
                                                    <div className={`font-bold text-base font-serif ${isSelected ? 'text-wuxia-red' : 'text-gray-200'}`}>
                                                        {t.名称}
                                                        {!预设天赋.some(p => p.名称 === t.名称) ? ' · 自定义' : ''}
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-400 leading-6">{t.描述}</div>
                                                    <div className="mt-3 rounded-xl border border-white/8 bg-black/30 px-3 py-3 text-sm text-wuxia-cyan/90 leading-6">
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

                    {/* STEP 4: OPENING CONFIG */}
                    {step === 3 && (
                        <div className="space-y-5 animate-slide-in max-w-5xl mx-auto">
                            <OrnateBorder className="p-4">
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-black/25 px-4 py-4">
                                    <div>
                                        <div className="text-sm text-gray-200">启用开局配置</div>
                                        <div className="text-[11px] text-gray-500 mt-1">关闭时不额外注入关系侧重、切入偏好和同人融合，按世界观与角色档案自然开局。</div>
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
                            <OrnateBorder className="p-4">
                                <div className="border-b border-wuxia-gold/30 pb-3 mb-4">
                                    <div className="text-[10px] uppercase tracking-[0.32em] text-wuxia-cyan/70 font-mono">Opening Structure</div>
                                    <h3 className="text-xl font-serif font-bold text-wuxia-gold mt-2">开局配置</h3>
                                    <p className="text-[11px] text-gray-400 mt-2 leading-6">这里决定初始关系侧重、第一幕切入方式，以及是否让世界观带上同人融合倾向。</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-wuxia-cyan font-bold">开局切入偏好</label>
                                        <InlineSelect
                                            value={openingConfig.开局切入偏好}
                                            options={开局切入偏好选项.map((item) => ({ value: item.value, label: item.label }))}
                                            onChange={(开局切入偏好) => setOpeningConfig((prev) => ({ ...prev, 开局切入偏好 }))}
                                        />
                                        <div className="text-[11px] text-gray-500 leading-6">
                                            {开局切入偏好选项.find((item) => item.value === openingConfig.开局切入偏好)?.hint}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5">
                                    <label className="text-sm text-wuxia-cyan font-bold">关系侧重（最多 2 项）</label>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {关系侧重选项.map((item) => {
                                            const active = openingConfig.关系侧重.includes(item.value);
                                            const disabled = !active && openingConfig.关系侧重.length >= 2;
                                            return (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    onClick={() => toggleRelationFocus(item.value)}
                                                    disabled={disabled}
                                                    className={`rounded-full border px-3 py-2 text-xs transition-all ${
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
                                    <div className="mt-2 text-[11px] text-gray-500">已选 {openingConfig.关系侧重.length}/2。会优先影响初始社交网的情绪结构。</div>
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="p-4">
                                <div className="border-b border-wuxia-gold/30 pb-3 mb-4">
                                    <div className="text-[10px] uppercase tracking-[0.32em] text-wuxia-red/70 font-mono">Fandom Blend</div>
                                    <h3 className="text-xl font-serif font-bold text-wuxia-gold mt-2">同人融合</h3>
                                    <p className="text-[11px] text-gray-400 mt-2 leading-6">仅作用于世界观生成，不会单独进入开局初始化提示词。</p>
                                </div>

                                <div className="space-y-4">
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
                                                同人融合: { ...prev.同人融合, enabled: !prev.同人融合.enabled }
                                            }))}
                                        />
                                    </div>

                                    {openingConfig.同人融合.enabled && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
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
                                                    若启用附加小说，选择数据集时会自动同步作品名，避免同人融合设定与注入来源脱节。
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
                                            <div className="space-y-2">
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
                                            <div className="space-y-3 rounded-2xl border border-wuxia-gold/15 bg-black/25 p-4">
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
                                                                        <div key={`mobile-replace-rule-${index}`} className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
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
                                                                                className="w-full px-3 py-2 rounded-md border border-red-500/30 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                                                                            >
                                                                                删除这条
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
                                            <div className="space-y-3 rounded-2xl border border-wuxia-cyan/20 bg-black/25 p-4">
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
                                                    允许前端同时保存多部小说的分解数据，但本次存档只会注入这里选定的那一部；未启用时，仍回退到全局当前注入数据集。
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
                                </>
                            ) : (
                                <OrnateBorder className="p-4">
                                    <div className="text-sm text-gray-300 leading-7">
                                        本次不额外指定关系侧重、开局切入或同人融合。系统将仅依据世界观、角色档案和既有硬约束自然生成开场。
                                    </div>
                                </OrnateBorder>
                            )}
                        </div>
                    )}

                    {/* STEP 5: CONFIRMATION */}
                    {step === 4 && (
                        <div className="h-full flex flex-col items-center justify-center animate-fadeIn space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-serif font-black text-wuxia-gold mb-2">天道既定</h2>
                                <p className="text-gray-400 text-sm">一切准备就绪，即将推演这方世界。</p>
                            </div>

                            <OrnateBorder className="max-w-lg w-full p-6">
                                <div className="text-sm space-y-3 font-mono text-gray-300">
                                    <p>世界: <span className="text-white">{worldConfig.worldName}</span></p>
                                    <p>难度: <span className="text-white uppercase">{worldConfig.difficulty}</span></p>
                                    <p>世界观额外要求: <span className="text-white">{worldConfig.worldExtraRequirement.trim() || '无'}</span></p>
                                    <p>手动世界观提示词: <span className="text-white">{worldConfig.manualWorldPrompt.trim() ? '已提供' : '未提供'}</span></p>
                                    <p>手动境界提示词: <span className="text-white">{worldConfig.manualRealmPrompt.trim() ? '已提供' : '未提供'}</span></p>
                                    <p>主角: <span className="text-white">{charName.trim() || '未填写姓名'}</span> <span className='text-gray-500'>({charGender.trim() || '未填写性别'}, {charAge}岁)</span></p>
                                    <p>外貌: <span className="text-white">{charAppearance.trim() || '未填写'}</span></p>
                                    <p>性格: <span className="text-white">{charPersonality.trim() || '未填写'}</span></p>
                                    <p>身份: <span className="text-white">{selectedBackground.名称}</span></p>
                                    <p>天赋: <span className="text-white">{selectedTalents.map(t => t.名称).join(', ') || '无'}</span></p>
                                    <p>开局配置: <span className="text-white">{openingConfigEnabled ? '已启用' : '未启用'}</span></p>
                                    <p>关系侧重: <span className="text-white">{openingConfigEnabled ? (openingConfig.关系侧重.join('、') || '无') : '未设置'}</span></p>
                                    <p>开局切入: <span className="text-white">{openingConfigEnabled ? openingConfig.开局切入偏好 : '未设置'}</span></p>
                                    <p>同人融合: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.enabled ? `${openingConfig.同人融合.作品名 || '未命名作品'} / ${openingConfig.同人融合.融合强度}` : '关闭') : '未设置'}</span></p>
                                    <p>角色替换: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.启用角色替换 ? (格式化角色替换规则摘要(当前角色替换规则列表) || '未填写规则') : '关闭') : '未设置'}</span></p>
                                    <p>附加小说: <span className="text-white">{openingConfigEnabled ? (openingConfig.同人融合.启用附加小说 ? (当前附加小说数据集?.作品名 || 当前附加小说数据集?.标题 || '未选择数据集') : '关闭') : '未设置'}</span></p>
                                </div>
                            </OrnateBorder>

                            <OrnateBorder className="w-full max-w-lg p-4">
                                <div className="space-y-2">
                                    <div className="text-xs text-gray-300 font-bold tracking-widest">开局额外要求（可选）</div>
                                    <div className="text-[11px] text-gray-500">会随开局任务一起发送给模型，仅影响本次开局生成。</div>
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
                                            <div className="text-[11px] text-gray-500 mt-1">这里会保留当前侠客名录页已经调整过的角色内容，以及背景、天赋和开场要求。</div>
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
                                            className="px-3 py-2 text-[11px] shrink-0"
                                        >
                                            {showCustomPresetEditor ? '收起' : '保存方案'}
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
                                                placeholder="方案简介"
                                                value={customPresetMeta.简介}
                                                onChange={(e) => setCustomPresetMeta(prev => ({ ...prev, 简介: e.target.value }))}
                                                className="w-full h-24 bg-black/50 border-2 border-transparent focus:border-wuxia-cyan p-3 text-sm text-white outline-none rounded-md transition-all resize-none"
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <GameButton onClick={() => { void 保存当前为自定义开局方案(); }} variant="secondary" className="py-2 text-xs">
                                                    {正在编辑开局预设ID ? '保存修改' : '保存方案'}
                                                </GameButton>
                                                <GameButton onClick={重置自定义开局预设编辑} variant="secondary" className="py-2 text-xs opacity-80">
                                                    取消
                                                </GameButton>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </OrnateBorder>

                            <div className="text-center text-[11px] text-gray-500">
                                请在底部点击“一键生成”开始入世
                            </div>
                        </div>
                    )}

                </div>

            {/* Mobile Bottom Action Bar */}
            <div className="w-full relative z-20 border-t border-gray-800/80 bg-black/80 backdrop-blur-md px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3">
                    {step > 0 ? (
                        <GameButton onClick={() => setStep(step - 1)} variant="secondary" className="flex-1 py-3 text-sm opacity-90">
                            上一步
                        </GameButton>
                    ) : (
                        <GameButton onClick={onCancel} variant="secondary" className="flex-1 py-3 text-sm !border-red-500/30 !text-red-400 hover:!bg-red-500/10">
                            放弃创建
                        </GameButton>
                    )}
                    {step < STEPS.length - 1 ? (
                        <GameButton onClick={handleNextStep} variant="primary" className="flex-1 py-3 text-sm shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                            下一步
                        </GameButton>
                    ) : (
                        <GameButton onClick={() => { void handleGenerate(); }} variant="primary" className="flex-1 py-3 text-sm font-bold bg-gradient-to-r from-wuxia-gold/90 to-wuxia-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                            推演世界
                        </GameButton>
                    )}
                </div>
            </div>

        </div>
    );
};

export default MobileNewGameWizard;
