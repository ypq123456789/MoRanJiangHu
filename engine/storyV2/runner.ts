import {
    创建开场基础状态,
    创建空剧情规划,
    创建空记忆系统,
    规范化剧情状态
} from '../../hooks/useGame/storyState';
import { 环境时间转标准串 } from '../../hooks/useGame/timeUtils';
import { 将导演圣经投影为剧情规划视图 } from '../../models/directorBible';
import type { 角色数据结构 } from '../../types';
import { 执行导演后处理V2 } from './directorPostTurn';
import { 渲染开局回合V2, 渲染主剧情回合V2 } from './storyTurnRenderer';
import type {
    StoryV2Config,
    StoryV2EngineState,
    StoryV2TurnTelemetry,
    StoryV2WorldGenTelemetry
} from './types';
import { 从圣经初始化世界势力与社交, 生成世界与导演圣经V2 } from './worldBibleGenerator';

export const 初始化世界与圣经V2 = async (params: {
    charData: 角色数据结构;
    config: StoryV2Config;
}): Promise<{
    state: StoryV2EngineState;
    worldGenTelemetry: StoryV2WorldGenTelemetry;
}> => {
    const t0 = Date.now();
    const { charData, config } = params;
    const genRes = await 生成世界与导演圣经V2({
        worldConfig: config.worldConfig,
        charData,
        openingConfig: config.openingConfig,
        apiConfig: config.directorApiConfig || config.apiConfig
    });

    const baseState = 创建开场基础状态(charData, {
        worldName: config.worldConfig.worldName,
        worldSize: (config.worldConfig.worldSize as any) || '九州宏大',
        dynastySetting: config.worldConfig.dynastySetting || '群雄逐鹿',
        sectDensity: (config.worldConfig.sectDensity as any) || '林立',
        tianjiaoSetting: config.worldConfig.tianjiaoSetting || '大争之世',
        worldExtraRequirement: config.worldConfig.worldExtraRequirement || '',
        manualWorldPrompt: '',
        manualRealmPrompt: '',
        difficulty: (config.worldConfig.difficulty as any) || 'normal'
    }, config.openingConfig);

    const { factions, initialSocial } = 从圣经初始化世界势力与社交(
        genRes.directorBible,
        genRes.mapLayers,
        config.openingConfig,
        charData
    );

    const world = {
        ...baseState.世界,
        地图层级: genRes.mapLayers,
        势力列表: factions,
        拍卖行待投放物品: []
    };

    const initialTime = baseState.游戏初始时间 || 环境时间转标准串(baseState.环境) || '1:01:01:06:00';
    const projected = 将导演圣经投影为剧情规划视图(
        genRes.directorBible,
        规范化剧情状态(baseState.剧情),
        创建空剧情规划(),
        undefined,
        [],
        [],
        initialTime
    );

    const state: StoryV2EngineState = {
        turnIndex: 0,
        gameInitialTime: initialTime,
        worldPrompt: genRes.worldPrompt,
        directorBible: genRes.directorBible,
        角色: baseState.角色,
        环境: baseState.环境,
        社交: initialSocial.length > 0 ? initialSocial : baseState.社交,
        世界: world,
        剧情: projected.story,
        剧情规划: projected.storyPlan,
        女主剧情规划: projected.heroinePlan,
        记忆系统: 创建空记忆系统(),
        历史记录: [],
        任务列表: baseState.任务列表 || [],
        世界大事: []
    };

    const worldGenTelemetry: StoryV2WorldGenTelemetry = {
        elapsedMs: Date.now() - t0,
        worldPromptLength: genRes.worldPrompt.length,
        worldPrompt: genRes.worldPrompt,
        mapLayerCount: genRes.mapLayers.length,
        factionLedgerCount: genRes.directorBible.势力暗账.length,
        castCount: genRes.directorBible.核心卡司.length,
        castTiers: Array.from(new Set(genRes.directorBible.核心卡司.map((c) => c.所处层级))).sort(),
        incidentCount: genRes.directorBible.前史导火索.length,
        foreshadowCount: genRes.directorBible.伏笔台账.length,
        actCount: genRes.directorBible.宏观分幕大纲.length,
        directorBible: genRes.directorBible
    };

    return { state, worldGenTelemetry };
};

export const 执行开局回合V2 = async (
    state: StoryV2EngineState,
    config: StoryV2Config
): Promise<{
    nextState: StoryV2EngineState;
    telemetry: StoryV2TurnTelemetry;
}> => {
    const startMs = Date.now();
    const renderRes = await 渲染开局回合V2(state, config);
    const postRes = await 执行导演后处理V2({
        state,
        apiConfig: config.directorApiConfig || config.apiConfig,
        storyResponse: renderRes.response,
        playerInput: '(开局初始化)'
    });

    const body = (renderRes.response.logs || [])
        .map((l) => `${l.sender || '旁白'}：${l.text || ''}`)
        .join('\n');
    const activeAct = postRes.nextState.directorBible.宏观分幕大纲.find(
        (a) => a.幕次 === postRes.nextState.directorBible.当前幕次
    );

    const telemetry: StoryV2TurnTelemetry = {
        turn: 0,
        kind: 'opening',
        playerInput: '(开局初始化)',
        elapsedMs: Date.now() - startMs,
        renderMs: renderRes.elapsedMs,
        directorMs: postRes.directorMs,
        gameTime: 环境时间转标准串(postRes.nextState.环境) || state.gameInitialTime,
        location: `${postRes.nextState.环境?.大地点 || ''}/${postRes.nextState.环境?.中地点 || ''}/${postRes.nextState.环境?.小地点 || ''}/${postRes.nextState.环境?.具体地点 || ''}`,
        body,
        bodyLength: body.length,
        shortTerm: renderRes.response.shortTerm || '',
        actionOptions: renderRes.response.action_options || [],
        directorBriefUsed: renderRes.briefOutput.directorBriefText,
        plantedForeshadows: postRes.plantedForeshadows,
        fermentedForeshadows: postRes.fermentedForeshadows,
        paidOffForeshadows: postRes.paidOffForeshadows,
        offscreenSpillovers: postRes.offscreenSpillovers,
        replanned: postRes.replanned,
        replanReason: postRes.replanReason,
        nextBriefFocus: postRes.nextState.directorBible.下回合导演简报?.本回合舞台焦点 || '',
        renderContextChars: renderRes.contextChars,
        directorContextChars: postRes.contextChars,
        activeAct: postRes.nextState.directorBible.当前幕次,
        activeActTitle: activeAct?.标题 || ''
    };

    return { nextState: postRes.nextState, telemetry };
};

export const 执行剧情回合V2 = async (
    state: StoryV2EngineState,
    config: StoryV2Config,
    playerInput: string
): Promise<{
    nextState: StoryV2EngineState;
    telemetry: StoryV2TurnTelemetry;
}> => {
    const startMs = Date.now();
    const renderRes = await 渲染主剧情回合V2(state, config, playerInput);
    const postRes = await 执行导演后处理V2({
        state,
        apiConfig: config.directorApiConfig || config.apiConfig,
        storyResponse: renderRes.response,
        playerInput
    });

    const body = (renderRes.response.logs || [])
        .map((l) => `${l.sender || '旁白'}：${l.text || ''}`)
        .join('\n');
    const activeAct = postRes.nextState.directorBible.宏观分幕大纲.find(
        (a) => a.幕次 === postRes.nextState.directorBible.当前幕次
    );

    const telemetry: StoryV2TurnTelemetry = {
        turn: state.turnIndex,
        kind: 'normal',
        playerInput,
        elapsedMs: Date.now() - startMs,
        renderMs: renderRes.elapsedMs,
        directorMs: postRes.directorMs,
        gameTime: 环境时间转标准串(postRes.nextState.环境) || state.gameInitialTime,
        location: `${postRes.nextState.环境?.大地点 || ''}/${postRes.nextState.环境?.中地点 || ''}/${postRes.nextState.环境?.小地点 || ''}/${postRes.nextState.环境?.具体地点 || ''}`,
        body,
        bodyLength: body.length,
        shortTerm: renderRes.response.shortTerm || '',
        actionOptions: renderRes.response.action_options || [],
        directorBriefUsed: renderRes.briefOutput.directorBriefText,
        plantedForeshadows: postRes.plantedForeshadows,
        fermentedForeshadows: postRes.fermentedForeshadows,
        paidOffForeshadows: postRes.paidOffForeshadows,
        offscreenSpillovers: postRes.offscreenSpillovers,
        replanned: postRes.replanned,
        replanReason: postRes.replanReason,
        nextBriefFocus: postRes.nextState.directorBible.下回合导演简报?.本回合舞台焦点 || '',
        renderContextChars: renderRes.contextChars,
        directorContextChars: postRes.contextChars,
        activeAct: postRes.nextState.directorBible.当前幕次,
        activeActTitle: activeAct?.标题 || ''
    };

    return { nextState: postRes.nextState, telemetry };
};
