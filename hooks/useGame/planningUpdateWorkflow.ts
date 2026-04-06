import type {
    GameResponse,
    OpeningConfig,
    TavernCommand,
    世界数据结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    环境信息结构
} from '../../types';
import * as textAIService from '../../services/ai/text';
import { 获取规划分析接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { applyStateCommand } from '../../utils/stateHelpers';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 提取响应规划文本 } from './thinkingContext';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import { 同步剧情小说分解时间校准 } from '../../services/novelDecompositionCalibration';

type 规划更新工作流依赖 = {
    apiConfig: any;
    gameConfig: any;
    角色: any;
    环境: any;
    世界: any;
    战斗: any;
    玩家门派: any;
    任务列表: any[];
    约定列表: any[];
    历史记录: any[];
    开局配置?: OpeningConfig;
    prompts?: { id?: string; 内容?: string }[];
    worldbooks?: any[];
    规范化环境信息: (envLike?: any) => 环境信息结构;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    规范化世界状态: (raw?: any) => 世界数据结构;
    规范化战斗状态: (raw?: any) => any;
    规范化门派状态: (raw?: any) => any;
    规范化剧情状态: (raw?: any, envLike?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构 | undefined;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    深拷贝: <T>(value: T) => T;
    收集最近完整正文回合: (params: {
        history: any[];
        currentPlayerInput: string;
        currentGameTime: string;
        currentResponse: GameResponse;
        maxTurns?: number;
    }) => any[];
    构建最近完整正文上下文: (rounds: any[]) => string;
    去重文本数组: (items: string[]) => string[];
    收集女主规划时间触发原因: (planLike?: 女主剧情规划结构, envLike?: 环境信息结构) => string[];
    收集女主正文命中原因: (planLike?: 女主剧情规划结构, latestBodyText?: string) => string[];
    收集剧情规划时间触发原因: (planLike?: 剧情规划结构 | 同人剧情规划结构, envLike?: 环境信息结构) => string[];
    收集剧情正文命中原因: (storyLike?: 剧情系统结构, planLike?: 剧情规划结构 | 同人剧情规划结构, latestBodyText?: string) => string[];
    提取响应完整正文文本: (response?: GameResponse) => string;
    设置剧情: (story: 剧情系统结构) => void;
    设置剧情规划: (plan: 剧情规划结构) => void;
    设置女主剧情规划: (plan?: 女主剧情规划结构) => void;
    设置同人剧情规划: (plan?: 同人剧情规划结构) => void;
    设置同人女主剧情规划: (plan?: 同人女主剧情规划结构) => void;
    performAutoSave: (snapshot?: any) => Promise<void>;
};

type 统一规划分析结果 = {
    updated: boolean;
    message: string;
    rawText?: string;
    commands: TavernCommand[];
    storyCommands: TavernCommand[];
    storyPlanCommands: TavernCommand[];
    heroinePlanCommands: TavernCommand[];
};

const 过滤规划补丁命令 = (commands: TavernCommand[] | undefined, targets: string[]): TavernCommand[] => (
    (Array.isArray(commands) ? commands : []).filter((cmd) => {
        const key = typeof cmd?.key === 'string' ? cmd.key.trim() : '';
        return targets.some((target) => key === target || key.startsWith(`${target}.`));
    })
);

export const 创建规划更新工作流 = (deps: 规划更新工作流依赖) => {
    const 应用规划补丁命令 = (params: {
        commands: TavernCommand[];
        env: 环境信息结构;
        social: any[];
        world?: 世界数据结构;
        story: 剧情系统结构;
        storyPlan: 剧情规划结构;
        heroinePlan?: 女主剧情规划结构;
        fandomStoryPlan?: 同人剧情规划结构;
        fandomHeroinePlan?: 同人女主剧情规划结构;
    }): {
        story: 剧情系统结构;
        storyPlan: 剧情规划结构;
        heroinePlan?: 女主剧情规划结构;
        fandomStoryPlan?: 同人剧情规划结构;
        fandomHeroinePlan?: 同人女主剧情规划结构;
    } => {
        let charBuffer = deps.深拷贝(deps.角色);
        let envBuffer = deps.规范化环境信息(params.env);
        let socialBuffer = deps.深拷贝(params.social);
        let worldBuffer = deps.规范化世界状态(params.world ?? deps.世界);
        let battleBuffer = deps.规范化战斗状态(deps.战斗);
        let sectBuffer = deps.规范化门派状态(deps.玩家门派);
        let tasksBuffer = deps.深拷贝(Array.isArray(deps.任务列表) ? deps.任务列表 : []);
        let agreementsBuffer = deps.深拷贝(Array.isArray(deps.约定列表) ? deps.约定列表 : []);
        let storyBuffer = deps.规范化剧情状态(params.story, envBuffer);
        let storyPlanBuffer = deps.规范化剧情规划状态(params.storyPlan);
        let heroinePlanBuffer = deps.规范化女主剧情规划状态(params.heroinePlan);
        let fandomStoryPlanBuffer = deps.规范化同人剧情规划状态(params.fandomStoryPlan);
        let fandomHeroinePlanBuffer = deps.规范化同人女主剧情规划状态(params.fandomHeroinePlan);

        (Array.isArray(params.commands) ? params.commands : []).forEach((cmd) => {
            const result = applyStateCommand(
                charBuffer,
                envBuffer,
                socialBuffer,
                worldBuffer,
                battleBuffer,
                storyBuffer,
                storyPlanBuffer,
                heroinePlanBuffer,
                fandomStoryPlanBuffer,
                fandomHeroinePlanBuffer,
                sectBuffer,
                tasksBuffer,
                agreementsBuffer,
                cmd.key,
                cmd.value,
                cmd.action
            );
            charBuffer = result.char;
            envBuffer = deps.规范化环境信息(result.env);
            socialBuffer = deps.规范化社交列表(result.social, { 合并同名: false });
            worldBuffer = deps.规范化世界状态(result.world);
            battleBuffer = deps.规范化战斗状态(result.battle);
            sectBuffer = deps.规范化门派状态(result.sect);
            tasksBuffer = Array.isArray(result.tasks) ? result.tasks : [];
            agreementsBuffer = Array.isArray(result.agreements) ? result.agreements : [];
            storyBuffer = deps.规范化剧情状态(result.story, envBuffer);
            storyPlanBuffer = deps.规范化剧情规划状态(result.storyPlan);
            heroinePlanBuffer = deps.规范化女主剧情规划状态(result.heroinePlan);
            fandomStoryPlanBuffer = deps.规范化同人剧情规划状态(result.fandomStoryPlan);
            fandomHeroinePlanBuffer = deps.规范化同人女主剧情规划状态(result.fandomHeroinePlan);
        });

        return {
            story: deps.规范化剧情状态(storyBuffer, envBuffer),
            storyPlan: deps.规范化剧情规划状态(storyPlanBuffer),
            heroinePlan: deps.规范化女主剧情规划状态(heroinePlanBuffer),
            fandomStoryPlan: deps.规范化同人剧情规划状态(fandomStoryPlanBuffer),
            fandomHeroinePlan: deps.规范化同人女主剧情规划状态(fandomHeroinePlanBuffer)
        };
    };

    const 后台执行统一规划分析 = async (params: {
        state: {
            环境: 环境信息结构;
            社交: any[];
            世界: 世界数据结构;
            剧情: 剧情系统结构;
            剧情规划: 剧情规划结构;
            女主剧情规划?: 女主剧情规划结构;
            同人剧情规划?: 同人剧情规划结构;
            同人女主剧情规划?: 同人女主剧情规划结构;
        };
        playerInput: string;
        gameTime: string;
        response: GameResponse;
    }): Promise<统一规划分析结果> => {
        const planningApi = 获取规划分析接口配置(deps.apiConfig);
        if (!接口配置是否可用(planningApi)) {
            return {
                updated: false,
                message: '规划分析独立模型未配置，已跳过。',
                commands: [],
                storyCommands: [],
                storyPlanCommands: [],
                heroinePlanCommands: []
            };
        }

        const latestBodyText = deps.提取响应完整正文文本(params.response);
        const currentPlanText = 提取响应规划文本(params.response);
        const recentBodyRounds = deps.收集最近完整正文回合({
            history: deps.历史记录,
            currentPlayerInput: params.playerInput,
            currentGameTime: params.gameTime,
            currentResponse: params.response,
            maxTurns: 3
        });
        const recentBodiesText = deps.构建最近完整正文上下文(recentBodyRounds);
        if (!recentBodiesText) {
            return {
                updated: false,
                message: '未收集到可用于规划分析的完整正文，已跳过。',
                commands: [],
                storyCommands: [],
                storyPlanCommands: [],
                heroinePlanCommands: []
            };
        }

        const heroineEnabled = 规范化游戏设置(deps.gameConfig).启用女主剧情规划 === true;
        const normalizedGameConfig = 规范化游戏设置(deps.gameConfig);
        const 启用修炼体系 = normalizedGameConfig.启用修炼体系 !== false;
        const 独立规划分析GPT模式 = normalizedGameConfig.独立APIGPT模式?.规划分析 === true;
        const worldPrompt = (() => {
            const hit = Array.isArray(deps.prompts)
                ? deps.prompts.find((item) => item?.id === 'core_world')
                : undefined;
            return 按功能开关过滤提示词内容(typeof hit?.内容 === 'string' ? hit.内容.trim() : '', normalizedGameConfig);
        })();
        const realmPrompt = (() => {
            if (!启用修炼体系) return '';
            const hit = Array.isArray(deps.prompts)
                ? deps.prompts.find((item) => item?.id === 'core_realm')
                : undefined;
            const raw = typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
            return raw.includes('开局后此处会被完整替换') ? '' : raw;
        })();
        const fandomPromptBundle = 构建同人运行时提示词包({
            openingConfig: deps.开局配置,
            worldPrompt,
            realmPrompt
        });
        const fandomEnabled = fandomPromptBundle.enabled;
        const activeStoryPlan = fandomEnabled
            ? deps.规范化同人剧情规划状态(params.state.同人剧情规划)
            : deps.规范化剧情规划状态(params.state.剧情规划);
        const activeHeroinePlan = heroineEnabled
            ? (
                fandomEnabled
                    ? deps.规范化同人女主剧情规划状态(params.state.同人女主剧情规划)
                    : deps.规范化女主剧情规划状态(params.state.女主剧情规划)
            )
            : undefined;
        const activeStoryPlanTargets = fandomEnabled
            ? ['同人剧情规划', 'gameState.同人剧情规划']
            : ['剧情规划', 'gameState.剧情规划'];
        const activeHeroinePlanTargets = fandomEnabled
            ? ['同人女主剧情规划', 'gameState.同人女主剧情规划']
            : ['女主剧情规划', 'gameState.女主剧情规划'];
        const alignedStoryForPlanning = deps.规范化剧情状态(params.state.剧情, params.state.环境);
        const auditFocus = deps.去重文本数组([
            ...deps.收集剧情规划时间触发原因(activeStoryPlan, params.state.环境),
            ...deps.收集剧情正文命中原因(alignedStoryForPlanning, activeStoryPlan, latestBodyText),
            ...(heroineEnabled
                ? [
                    ...deps.收集女主规划时间触发原因(activeHeroinePlan as 女主剧情规划结构 | undefined, params.state.环境),
                    ...deps.收集女主正文命中原因(activeHeroinePlan as 女主剧情规划结构 | undefined, latestBodyText)
                ]
                : [])
        ]);

        const worldbookExtra = 按功能开关过滤提示词内容(构建世界书注入文本({
            books: Array.isArray(deps.worldbooks) ? deps.worldbooks : [],
            scopes: heroineEnabled ? ['story_plan', 'heroine_plan'] : ['story_plan'],
            environment: params.state.环境,
            social: params.state.社交,
            world: params.state.世界,
            history: deps.历史记录,
            extraTexts: [params.playerInput, latestBodyText, currentPlanText, ...auditFocus]
        }).combinedText, normalizedGameConfig);
        const novelDecompositionPrompt = 按功能开关过滤提示词内容(await 获取激活小说拆分注入文本(
            deps.apiConfig,
            'planning',
            deps.开局配置,
            alignedStoryForPlanning,
            deps.角色?.姓名 || ''
        ), normalizedGameConfig);
        const planningExtraPrompt = [
            worldbookExtra,
            novelDecompositionPrompt,
            按功能开关过滤提示词内容(fandomPromptBundle.同人设定摘要, normalizedGameConfig),
            启用修炼体系 ? fandomPromptBundle.境界母板补丁 : ''
        ]
            .filter(Boolean)
            .join('\n\n');

        const planningStoryPayload = 裁剪修炼体系上下文数据({
            剧情: alignedStoryForPlanning,
            [fandomEnabled ? '同人剧情规划' : '剧情规划']: activeStoryPlan || {}
        }, normalizedGameConfig);
        const planningHeroinePayload = 裁剪修炼体系上下文数据(
            heroineEnabled
                ? { [fandomEnabled ? '同人女主剧情规划' : '女主剧情规划']: activeHeroinePlan || {} }
                : {},
            normalizedGameConfig
        );

        const result = await textAIService.generatePlanningAnalysis({
            playerName: (deps.角色?.姓名 || '').trim() || '未命名',
            currentStoryJson: JSON.stringify(planningStoryPayload, null, 2),
            currentHeroinePlanJson: JSON.stringify(planningHeroinePayload, null, 2),
            worldJson: JSON.stringify(
                裁剪修炼体系上下文数据(deps.规范化世界状态(params.state.世界), normalizedGameConfig),
                null,
                2
            ),
            socialJson: JSON.stringify(
                裁剪修炼体系上下文数据(deps.规范化社交列表(params.state.社交), normalizedGameConfig),
                null,
                2
            ),
            envJson: JSON.stringify(
                裁剪修炼体系上下文数据(deps.规范化环境信息(params.state.环境), normalizedGameConfig),
                null,
                2
            ),
            recentBodiesText,
            currentPlanText,
            auditFocusText: auditFocus.length > 0 ? auditFocus.join('\n') : '常规回合固定审计',
            heroineEnabled,
            ntlEnabled: normalizedGameConfig.剧情风格 === 'NTL后宫',
            fandomEnabled,
            extraPrompt: planningExtraPrompt,
            gptMode: 独立规划分析GPT模式
        }, planningApi);

        const storyCommands = 过滤规划补丁命令(result.commands, ['剧情', 'gameState.剧情']);
        const storyPlanCommands = 过滤规划补丁命令(result.commands, activeStoryPlanTargets);
        const heroinePlanCommands = heroineEnabled
            ? 过滤规划补丁命令(result.commands, activeHeroinePlanTargets)
            : [];
        const commands = [...storyCommands, ...storyPlanCommands, ...heroinePlanCommands];
        if (!result.shouldUpdate || commands.length === 0) {
            return {
                updated: false,
                message: result.reason || '规划分析未产生有效补丁，已跳过。',
                rawText: result.rawText,
                commands: [],
                storyCommands: [],
                storyPlanCommands: [],
                heroinePlanCommands: []
            };
        }

        const patched = 应用规划补丁命令({
            commands,
            env: params.state.环境,
            social: params.state.社交,
            world: params.state.世界,
            story: alignedStoryForPlanning,
            storyPlan: params.state.剧情规划,
            heroinePlan: params.state.女主剧情规划,
            fandomStoryPlan: params.state.同人剧情规划,
            fandomHeroinePlan: params.state.同人女主剧情规划
        });
        const syncedPatchedStory = await 同步剧情小说分解时间校准({
            previousStory: params.state.剧情,
            nextStory: patched.story,
            currentGameTime: params.gameTime,
            openingConfig: deps.开局配置
        });
        deps.设置剧情(syncedPatchedStory);
        if (fandomEnabled) {
            deps.设置同人剧情规划(patched.fandomStoryPlan);
        } else {
            deps.设置剧情规划(patched.storyPlan);
        }
        if (heroineEnabled && !fandomEnabled) {
            deps.设置女主剧情规划(patched.heroinePlan);
        }
        if (heroineEnabled && fandomEnabled) {
            deps.设置同人女主剧情规划(patched.fandomHeroinePlan);
        }
        void deps.performAutoSave({
            story: syncedPatchedStory,
            storyPlan: patched.storyPlan,
            heroinePlan: !fandomEnabled && heroineEnabled ? patched.heroinePlan : undefined,
            fandomStoryPlan: patched.fandomStoryPlan,
            fandomHeroinePlan: fandomEnabled && heroineEnabled ? patched.fandomHeroinePlan : undefined,
            history: deps.历史记录,
            force: true
        });

        return {
            updated: true,
            message: result.reason || `统一规划分析已应用 ${commands.length} 条补丁命令。`,
            rawText: result.rawText,
            commands,
            storyCommands,
            storyPlanCommands,
            heroinePlanCommands
        };
    };

    return {
        后台执行统一规划分析
    };
};
