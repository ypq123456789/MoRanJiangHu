import type { DirectorWorldBible } from '../../models/directorBible';
import type {
    OpeningConfig,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    游戏设置结构,
    环境信息结构,
    聊天记录结构,
    角色数据结构,
    记忆系统结构,
    世界数据结构,
    世界书结构,
    提示词结构
} from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';

export interface StoryV2Config {
    gameConfig: 游戏设置结构;
    apiConfig: 当前可用接口结构;
    directorApiConfig?: 当前可用接口结构;
    openingConfig: OpeningConfig;
    worldConfig: {
        worldName: string;
        worldSize?: string;
        dynastySetting?: string;
        sectDensity?: string;
        tianjiaoSetting?: string;
        difficulty?: string;
        worldExtraRequirement?: string;
        openingExtraRequirement?: string;
    };
    promptPool?: 提示词结构[];
    worldbooks?: 世界书结构[];
}

export interface StoryV2EngineState {
    turnIndex: number;
    gameInitialTime: string;
    worldPrompt: string;
    directorBible: DirectorWorldBible;
    角色: 角色数据结构;
    环境: 环境信息结构;
    社交: any[];
    世界: 世界数据结构;
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    记忆系统: 记忆系统结构;
    历史记录: 聊天记录结构[];
    任务列表: any[];
    世界大事: string[];
}

export interface StoryV2TurnTelemetry {
    turn: number;
    kind: 'opening' | 'normal';
    playerInput: string;
    elapsedMs: number;
    renderMs: number;
    directorMs: number;
    gameTime: string;
    location: string;
    body: string;
    bodyLength: number;
    shortTerm: string;
    actionOptions: string[];
    directorBriefUsed: string;
    plantedForeshadows: string[];
    fermentedForeshadows: string[];
    paidOffForeshadows: string[];
    offscreenSpillovers: string[];
    replanned: boolean;
    replanReason?: string;
    nextBriefFocus: string;
    renderContextChars: number;
    directorContextChars: number;
    activeAct: number;
    activeActTitle: string;
}

export interface StoryV2WorldGenTelemetry {
    elapsedMs: number;
    worldPromptLength: number;
    worldPrompt: string;
    mapLayerCount: number;
    factionLedgerCount: number;
    castCount: number;
    castTiers: number[];
    incidentCount: number;
    foreshadowCount: number;
    actCount: number;
    directorBible: DirectorWorldBible;
}
