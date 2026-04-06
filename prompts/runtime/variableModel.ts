import type { GameResponse } from '../../types';
import { 构建开局变量生成承接提示 } from './openingVariableGenerationInit';
import { 按功能开关过滤提示词内容, 构建修炼体系附加块 } from '../../utils/promptFeatureToggles';

const 渲染变量模板 = (template: string, variables: Record<string, string>): string => (
    (template || '').replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key) => variables[key] ?? '')
);

const 格式化多段文本 = (text: string): string => (
    (text || '')
        .split('\n')
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

export const 构建变量模型身份提示词 = (): string => 格式化多段文本([
    '你是 WuXia 项目的“独立变量生成引擎”。',
    '你不写正文，不续写剧情，只负责把本回合已经成立的变量变化落成最终变量命令。'
].join('\n'));

export const 构建变量模型职责提示词 = (options?: { survivalNeedsEnabled?: boolean; cultivationSystemEnabled?: boolean }): string => {
    const survivalNeedsEnabled = options?.survivalNeedsEnabled !== false;
    const cultivationSystemEnabled = options?.cultivationSystemEnabled !== false;

    return 按功能开关过滤提示词内容(
        格式化多段文本([
            '【职责】',
            '1. 每回合都要完整审计“当前变量数据 + 本回合正文 + 本回合变量规划”，并生成本回合应落地的变量命令。',
            '2. 正文优先于 `<变量规划>`；`<变量规划>` 是主剧情给你的自然语言变量说明稿与落点提醒，不是命令区。',
            '3. 只承认本回合已经前台成立的变化；未来安排、后续承接、镜头余波、未发生结果都不提前写成变量。',
            '4. 命令必须最小、合法、可执行；能改字段就不重写整对象，能补最小结构就不扩写整棵子树。',
            '5. 你只生成本回合应新增落地的最终变量命令，不输出修补旧命令、替换旧命令或取消旧命令的额外语法。',
            '6. 若当前是开局回合，就把它视为首回合全域初始化审计：逐域复核正式变量树，并补齐第1回合最小完整可用状态。',
            ...(survivalNeedsEnabled
                ? [[
                    '7. 生理系统开启时，要把时间推进、休整、进食、饮水、赶路、熬战等事实对应到精力',
                    构建修炼体系附加块('、内力'),
                    '、饱腹、口渴等变量联动。'
                ].join('')]
                : [])
        ].join('\n')),
        { 启用修炼体系: cultivationSystemEnabled }
    );
};

export const 构建变量模型系统提示词 = (options?: {
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdated?: boolean;
    survivalNeedsEnabled?: boolean;
    cultivationSystemEnabled?: boolean;
}): string => 格式化多段文本([
    构建变量模型身份提示词(),
    '',
    构建变量模型职责提示词({
        survivalNeedsEnabled: options?.survivalNeedsEnabled !== false,
        cultivationSystemEnabled: options?.cultivationSystemEnabled !== false
    })
].join('\n'));

export const 构建变量模型输出格式提示词 = (): string => 格式化多段文本([
    '【输出格式】',
    '- 你必须且只允许输出 3 个顶层标签，顺序固定为：`<thinking>`、`<说明>`、`<命令>`。',
    '- `<thinking>` 内按当前变量生成 COT 完成思考，不要把命令写进 `<thinking>`。',
        '- `<说明>` 每行使用 `- ` 前缀，只写“本回合确认了哪些变化 / 为什么这样落命令 / 哪些变量域被更新”。',
        '- `<命令>` 中每行只允许 `add|set|push|delete 路径 = 值` 这一种体例。',
        '- `<命令>` 不写替换旧命令、取消旧命令、伪索引修补或其他补丁语法；只写本回合最终新增的变量命令。',
        '- 正常回合与开局回合都应尽量产生命令；只有正文确实没有形成任何已成立变量变化时，`<命令>` 才允许为空。',
        '- 标量优先 `set`；明确数值增减才使用 `add`；数组新增优先 `push`；整项移除才使用 `delete`。',
        '- `<命令>` 内部排序固定为“先 `set/add`，再 `push`，最后 `delete`”；若同一数组存在多个 `delete`，继续按索引从大到小逆序输出。'
    ].join('\n'));

export const 构建变量模型COT伪装提示词 = (): string => 格式化多段文本([
    '<think>',
    '思考已结束',
    '</think>',
    '好的，我会先在<thinking>中完成变量生成思考，再按协议输出<说明>与<命令>，只根据当前变量数据、本回合正文和本回合变量规划生成最终变量命令：'
].join('\n'));

export const 构建变量模型用户提示词模板 = (): string => [
    '当前任务：',
    '我大致描述内容：',
    '${taskDescription}',
    '',
    '以下是当前的变量数据信息：',
    '${stateJson}',
    '',
    '${responseLabel}',
    '${responseLogs}',
    '',
    '${variablePlanLabel}',
    '${variablePlanText}',
    '',
    '${openingRoundHint}',
    '${extraPromptBlock}'
].join('\n');

export const 构建开局变量模型任务提示词模板 = (): string => [
    '当前任务：',
    '我大致描述内容：',
    '${taskDescription}',
    '',
    '${responseLabel}',
    '${responseLogs}',
    '',
    '${variablePlanLabel}',
    '${variablePlanText}',
    '',
    '${openingRoundHint}',
    '${extraPromptBlock}'
].join('\n');

export const 构建变量模型任务提示词模板 = (options?: { openingTaskContext?: boolean }): string => (
    options?.openingTaskContext
        ? 构建开局变量模型任务提示词模板()
        : 构建变量模型用户提示词模板()
);

export const 构建变量模型用户附加规则提示词 = (): string => '';

const 格式化日志 = (response: GameResponse): string => {
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    if (logs.length === 0) return '未提供正文，请按空正文处理。';
    return logs
        .map((log) => {
            const sender = typeof log?.sender === 'string' && log.sender.trim() ? log.sender.trim() : '旁白';
            const text = typeof log?.text === 'string' ? log.text.trim() : '';
            return text ? `【${sender}】${text}` : '';
        })
        .filter(Boolean)
        .join('\n');
};

const 清理标签包裹文本 = (text: string, tagNames: string[]): string => {
    let result = (text || '').trim();
    tagNames.forEach((tag) => {
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result
            .replace(new RegExp(`<\\s*${escaped}\\s*>`, 'gi'), '')
            .replace(new RegExp(`<\\s*/\\s*${escaped}\\s*>`, 'gi'), '')
            .trim();
    });
    return result;
};

const 格式化变量规划文本 = (response: GameResponse): string => {
    const source = typeof response?.t_var_plan === 'string' ? response.t_var_plan : '';
    const cleaned = 清理标签包裹文本(source, ['变量规划', 'variableplan', 'variable_planning', 'varplan']);
    return cleaned || '未提供显式变量规划，需完全依据正文与当前变量数据补全本回合变量命令。';
};

type 变量任务提示词参数 = {
    stateJson: string;
    response: GameResponse;
    extraPrompt?: string;
    isOpeningRound?: boolean;
    openingTaskContext?: {
        currentGameTime?: string;
        openingRoleSetupText?: string;
        openingConfigText?: string;
    };
};

export const 构建变量模型任务提示词 = (params: 变量任务提示词参数): string => {
    const extraPrompt = (params.extraPrompt || '').trim();
    const useOpeningTaskContext = Boolean(params.openingTaskContext);
    const taskDescription = useOpeningTaskContext
        ? '你需要根据第0回合正文、开局变量规划和开局承接信息进行完整的开局变量命令生成。'
        : '你需要根据本回合正文和变量规划进行完整的变量命令生成。';
    const responseLabel = useOpeningTaskContext
        ? '以下是第0回合完整正文：'
        : '以下是本回合正文：';
    const variablePlanLabel = useOpeningTaskContext
        ? '以下是第0回合完整变量规划（自然语言初始化说明稿）：'
        : '以下是本回合变量规划（自然语言变量说明稿）：';
    const openingRoundHint = useOpeningTaskContext
        ? 构建开局变量生成承接提示(params.openingTaskContext)
        : (
            params.isOpeningRound === true
                ? '【开局承接提示】\n- 当前是第0回合后的首轮变量生成；要把第1回合会读取的前台变量树逐域初始化到最小完整可用状态，不把它当普通补丁。'
                : ''
        );
    const extraPromptBlock = extraPrompt ? `【补充任务提示】\n${extraPrompt}` : '';

    return 格式化多段文本(渲染变量模板(构建变量模型任务提示词模板({
        openingTaskContext: useOpeningTaskContext
    }), {
        taskDescription,
        stateJson: (params.stateJson || '').trim() || '{}',
        responseLabel,
        responseLogs: 格式化日志(params.response),
        variablePlanLabel,
        variablePlanText: 格式化变量规划文本(params.response),
        openingRoundHint,
        extraPromptBlock
    }));
};

export const 构建变量模型用户提示词 = (params: 变量任务提示词参数): string => (
    构建变量模型任务提示词(params)
);
