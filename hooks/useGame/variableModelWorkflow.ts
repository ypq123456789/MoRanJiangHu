import * as textAIService from '../../services/ai/text';
import type { GameResponse, OpeningConfig, TavernCommand, 世界书结构, 内置提示词条目结构, 提示词结构 } from '../../types';
import { 获取变量计算接口配置, 接口配置是否可用, 变量校准功能已启用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 构建运行时额外提示词 } from '../../prompts/runtime/nsfw';
import {
    构建变量相关规则提示词
} from '../../prompts/runtime/variableCalibrationReference';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';

type 变量模型基态 = Pick<
    响应命令处理状态,
    '角色' | '环境' | '社交' | '战斗' | '玩家门派' | '任务列表' | '约定列表'
>;

export type 变量模型校准参数 = {
    playerInput: string;
    parsedResponse: GameResponse;
    baseState: 变量模型基态;
    promptPool: 提示词结构[];
    worldEvolutionEnabled: boolean;
    worldEvolutionUpdated?: boolean;
    builtinPromptEntries?: 内置提示词条目结构[];
    worldbooks?: 世界书结构[];
    signal?: AbortSignal;
    extraPromptAppend?: string;
    recentRounds?: Array<{
        回合: number;
        玩家输入: string;
        正文: string;
        本回合命令: string[];
        校准说明: string[];
        校准命令: string[];
    }>;
    openingConfig?: OpeningConfig;
    isOpeningRound?: boolean;
    openingTaskContext?: {
        currentGameTime?: string;
        openingRoleSetupText?: string;
        openingConfigText?: string;
    };
    onStreamDelta?: (delta: string, accumulated: string) => void;
};

type 变量模型依赖 = {
    apiConfig: any;
    gameConfig: any;
};

export type 变量模型校准结果 = {
    commands: TavernCommand[];
    reports: string[];
    rawText: string;
    model: string;
};

const 允许根路径 = [
    'gameState.角色',
    'gameState.环境',
    'gameState.社交',
    'gameState.战斗',
    'gameState.玩家门派',
    'gameState.任务列表',
    'gameState.约定列表'
] as const;

const 大型数组限制映射: Record<string, number> = {
    社交: 60,
    活跃NPC列表: 40,
    进行中事件: 30,
    已结算事件: 20,
    江湖史册: 20,
    地图: 20,
    建筑: 30,
    任务列表: 30,
    约定列表: 30
};

const 忽略字段集合 = new Set([
    '头像图片URL',
    '图片URL',
    '本地路径',
    'dataUrl',
    'base64',
    'rawJson',
    '图片档案',
    '生图历史',
    '最近生图结果'
]);

const 清理变量模型上下文 = (value: unknown, parentKey = ''): unknown => {
    if (Array.isArray(value)) {
        const limit = 大型数组限制映射[parentKey] || value.length;
        return value.slice(0, limit).map((item) => 清理变量模型上下文(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.entries(source).forEach(([key, child]) => {
        if (忽略字段集合.has(key)) return;
        result[key] = 清理变量模型上下文(child, key);
    });
    return result;
};

const 序列化变量模型状态 = (
    state: 变量模型基态,
    options?: { survivalNeedsEnabled?: boolean; cultivationSystemEnabled?: boolean }
): string => {
    const survivalNeedsEnabled = options?.survivalNeedsEnabled !== false;
    const cultivationSystemEnabled = options?.cultivationSystemEnabled !== false;
    const role = state.角色 && typeof state.角色 === 'object'
        ? {
            ...state.角色,
            ...(survivalNeedsEnabled
                ? {}
                : {
                    当前饱腹: undefined,
                    最大饱腹: undefined,
                    当前口渴: undefined,
                    最大口渴: undefined
                })
        }
        : state.角色;
    const payload = {
        角色: role,
        环境: state.环境,
        社交: state.社交,
        战斗: state.战斗,
        玩家门派: state.玩家门派,
        任务列表: state.任务列表,
        约定列表: state.约定列表
    };
    const trimmedPayload = cultivationSystemEnabled
        ? payload
        : 裁剪修炼体系上下文数据(payload, { 启用修炼体系: false });
    return JSON.stringify(清理变量模型上下文(trimmedPayload), null, 2);
};

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 文本疑似占位 = (value: unknown): boolean => {
    const text = 读取文本(value);
    if (!text) return true;
    const normalized = text.replace(/\s+/g, '');
    if (/未知|不详|待补充|待后续|待完善|未提供|未填写|暂无/.test(normalized)) return true;
    return /^(普通|正常|略)$/.test(normalized);
};

const 高颜值关键词 = [
    '漂亮', '美貌', '惊艳', '绝色', '清丽', '妩媚', '美艳', '艳丽',
    '秀美', '绝美', '倾城', '国色', '明艳', '俏丽', '动人', '美人', '佳人'
];

const 判断是否高颜值重要女性NPC = (npc: any): boolean => {
    if (读取文本(npc?.性别) !== '女' || npc?.是否主要角色 !== true) return false;
    const source = [
        npc?.简介,
        npc?.外貌描写,
        npc?.外貌,
        npc?.身份,
        npc?.称号,
        npc?.核心性格特征
    ]
        .map(读取文本)
        .filter(Boolean)
        .join('\n');
    return 高颜值关键词.some((keyword) => source.includes(keyword));
};

const 构建社交档案完整性审计提示 = (socialRaw: unknown): string => {
    if (!Array.isArray(socialRaw) || socialRaw.length <= 0) return '';

    const auditLines: string[] = [];
    socialRaw.forEach((npc: any, index: number) => {
        if (!npc || typeof npc !== 'object') return;
        const 名称 = 读取文本(npc?.姓名) || `社交[${index}]`;
        const 通用缺口: string[] = [];
        if (文本疑似占位(npc?.身份)) 通用缺口.push('身份');
        if (文本疑似占位(npc?.境界)) 通用缺口.push('境界');
        if (文本疑似占位(npc?.简介)) 通用缺口.push('简介');
        if (文本疑似占位(npc?.关系状态)) 通用缺口.push('关系状态');
        if (!Array.isArray(npc?.记忆) || npc.记忆.length <= 0) 通用缺口.push('记忆');

        const 重要女性缺口: string[] = [];
        if (判断是否高颜值重要女性NPC(npc)) {
            if (文本疑似占位(npc?.生日)) 重要女性缺口.push('生日');
            if (文本疑似占位(npc?.对主角称呼)) 重要女性缺口.push('对主角称呼');
            if (文本疑似占位(npc?.核心性格特征)) 重要女性缺口.push('核心性格特征');
            if (文本疑似占位(npc?.好感度突破条件)) 重要女性缺口.push('好感度突破条件');
            if (文本疑似占位(npc?.关系突破条件)) 重要女性缺口.push('关系突破条件');
            if (!Array.isArray(npc?.关系网变量) || npc.关系网变量.length < 2) 重要女性缺口.push('关系网变量(至少2条)');
            if (文本疑似占位(npc?.外貌描写)) 重要女性缺口.push('外貌描写');
            if (文本疑似占位(npc?.身材描写)) 重要女性缺口.push('身材描写');
            if (文本疑似占位(npc?.衣着风格)) 重要女性缺口.push('衣着风格');
            if (文本疑似占位(npc?.胸部描述)) 重要女性缺口.push('胸部描述');
            if (文本疑似占位(npc?.小穴描述)) 重要女性缺口.push('小穴描述');
            if (文本疑似占位(npc?.屁穴描述)) 重要女性缺口.push('屁穴描述');
            if (文本疑似占位(npc?.性癖)) 重要女性缺口.push('性癖');
            if (文本疑似占位(npc?.敏感点)) 重要女性缺口.push('敏感点');
            if (!npc?.子宫 || 文本疑似占位(npc?.子宫?.状态) || 文本疑似占位(npc?.子宫?.宫口状态)) {
                重要女性缺口.push('子宫档案');
            }
            if (typeof npc?.是否处女 !== 'boolean') 重要女性缺口.push('是否处女');
        }

        const allMissing = [...通用缺口, ...重要女性缺口];
        if (allMissing.length <= 0) return;
        if (判断是否高颜值重要女性NPC(npc)) {
            auditLines.push(`- 社交[${index}] ${名称}：命中“女性 + 主要角色 + 高颜值明确”，当前需补齐/修正：${allMissing.join('、')}。`);
            return;
        }
        auditLines.push(`- 社交[${index}] ${名称}：当前档案仍有结构缺口：${allMissing.join('、')}。`);
    });

    if (auditLines.length <= 0) return '';

    const visibleLines = auditLines.slice(0, 8);
    const remainingCount = auditLines.length - visibleLines.length;
    if (remainingCount > 0) {
        visibleLines.push(`- 其余还有 ${remainingCount} 个 NPC 档案存在待补齐项，本回合同样需要顺带复核。`);
    }

    return [
        '【当前社交档案完整性审计】',
        '- 每回合变量更新都要复核现有 `社交` 档案是否存在结构缺口、占位值或关键字段遗漏，不只看本回合新登场人物。',
        '- 若本回合正文、`<变量规划>`、当前状态与既有档案真值已经足以支撑缺项，就同步补齐；不要继续保留半残对象。',
        '',
        ...visibleLines
    ].join('\n');
};

const 序列化命令去重键 = (cmd: TavernCommand): string => {
    let valueText = 'null';
    try {
        valueText = JSON.stringify(cmd?.value ?? null);
    } catch {
        valueText = String(cmd?.value ?? null);
    }
    return [
        cmd?.action || 'set',
        normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : ''),
        valueText
    ].join('::');
};

const 包含非法伪索引 = (key: string): boolean => /(?:\[(?:-?\d+|last|tail|尾项|最后一项)\])/i.test((key || '').trim())
    && (
        /\[-\d+\]/.test((key || '').trim())
        || /\[(?:last|tail|尾项|最后一项)\]/i.test((key || '').trim())
    );

const 是否允许变量生成命令 = (cmd: TavernCommand): boolean => {
    if (typeof cmd?.key !== 'string' || 包含非法伪索引(cmd.key)) return false;
    const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
    if (!normalizedKey) return false;

    const allowed = 允许根路径.find((root) => normalizedKey === root || normalizedKey.startsWith(`${root}.`) || normalizedKey.startsWith(`${root}[`));
    if (!allowed) return false;
    return cmd.action === 'add' || cmd.action === 'set' || cmd.action === 'push' || cmd.action === 'delete';
};

export const 执行变量模型校准工作流 = async (
    params: 变量模型校准参数,
    deps: 变量模型依赖
): Promise<变量模型校准结果 | null> => {
    const runtimeGameConfig = 规范化游戏设置(deps.gameConfig);
    const 启用饱腹口渴系统 = runtimeGameConfig.启用饱腹口渴系统 !== false;
    const 启用修炼体系 = runtimeGameConfig.启用修炼体系 !== false;
    if (!变量校准功能已启用(deps.apiConfig)) return null;

    const variableApi = 获取变量计算接口配置(deps.apiConfig);
    if (!接口配置是否可用(variableApi)) return null;

    const runtimeExtraPrompt = 按功能开关过滤提示词内容(
        构建运行时额外提示词(runtimeGameConfig.额外提示词 || '', runtimeGameConfig),
        runtimeGameConfig
    );
    const worldPrompt = (() => {
        const hit = (Array.isArray(params.promptPool) ? params.promptPool : []).find((item) => item?.id === 'core_world');
        return typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
    })();
    const realmPrompt = (() => {
        if (!启用修炼体系) return '';
        const hit = (Array.isArray(params.promptPool) ? params.promptPool : []).find((item) => item?.id === 'core_realm');
        const raw = typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
        return raw.includes('开局后此处会被完整替换') ? '' : raw;
    })();
    const fandomPromptBundle = 构建同人运行时提示词包({
        openingConfig: params.openingConfig,
        worldPrompt,
        realmPrompt
    });
    const socialCompletenessAuditPrompt = 构建社交档案完整性审计提示(params.baseState.社交);
    const mergedExtraPrompt = [
        runtimeExtraPrompt,
        按功能开关过滤提示词内容(构建世界书注入文本({
            books: Array.isArray(params.worldbooks) ? params.worldbooks : [],
            scopes: ['variable_calibration'],
            environment: params.baseState.环境,
            social: params.baseState.社交,
            extraTexts: [params.playerInput]
        }).combinedText, runtimeGameConfig),
        按功能开关过滤提示词内容(fandomPromptBundle.同人设定摘要, runtimeGameConfig),
        socialCompletenessAuditPrompt,
        按功能开关过滤提示词内容((params.extraPromptAppend || '').trim(), runtimeGameConfig)
    ].filter(Boolean).join('\n\n');

    const calibrationRulesContext = 构建变量相关规则提示词({
        promptPool: Array.isArray(params.promptPool) ? params.promptPool : [],
        gameConfig: runtimeGameConfig
    });
    const calibrationRulesContextWithFandom = [
        calibrationRulesContext,
        按功能开关过滤提示词内容(fandomPromptBundle.变量校准补丁, runtimeGameConfig),
        启用修炼体系 ? fandomPromptBundle.境界母板补丁 : ''
    ]
        .filter(Boolean)
        .join('\n\n');

    const result = await textAIService.generateVariableCalibrationUpdate(
        {
            stateJson: 序列化变量模型状态(params.baseState, {
                survivalNeedsEnabled: 启用饱腹口渴系统,
                cultivationSystemEnabled: 启用修炼体系
            }),
            response: params.parsedResponse,
            calibrationRulesContext: calibrationRulesContextWithFandom,
            worldEvolutionEnabled: params.worldEvolutionEnabled,
            worldEvolutionUpdated: params.worldEvolutionUpdated === true,
            builtinPromptEntries: params.builtinPromptEntries,
            survivalNeedsEnabled: 启用饱腹口渴系统,
            cultivationSystemEnabled: 启用修炼体系,
            recentRounds: params.recentRounds,
            isOpeningRound: params.isOpeningRound === true,
            openingTaskContext: params.openingTaskContext
        },
        variableApi,
        params.signal,
        mergedExtraPrompt,
        params.onStreamDelta,
        runtimeGameConfig.独立APIGPT模式?.变量生成 === true
    );

    const baseCommands = Array.isArray(params.parsedResponse?.tavern_commands)
        ? params.parsedResponse.tavern_commands
        : [];
    const existingKeys = new Set(baseCommands.map(序列化命令去重键));

    const dedupedCommands = (Array.isArray(result.commands) ? result.commands : [])
        .filter((cmd) => 是否允许变量生成命令(cmd))
        .filter((cmd) => {
            const dedupeKey = 序列化命令去重键(cmd);
            if (existingKeys.has(dedupeKey)) return false;
            existingKeys.add(dedupeKey);
            return true;
        });

    const normalizedReports = (Array.isArray(result.reports) ? result.reports : [])
        .map((item) => (item || '').trim())
        .filter(Boolean);

    if (dedupedCommands.length === 0 && normalizedReports.length === 0) {
        return null;
    }

    return {
        commands: dedupedCommands,
        reports: normalizedReports,
        rawText: typeof result.rawText === 'string' ? result.rawText : '',
        model: variableApi.model
    };
};
