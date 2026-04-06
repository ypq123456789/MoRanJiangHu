
import { 提示词结构 } from '../types';

// Core
import { 核心_输出格式 } from './core/format';
import { 核心_核心规则 } from './core/rules';
import { 核心_数据格式 } from './core/data';
import { 核心_记忆法则 } from './core/memory'; 
import { 核心_世界观 } from './core/world'; // New
import { 核心_境界体系 } from './core/realm';
import { 核心_思维链 } from './core/cot';   // New
import { 核心_战斗思维链 } from './core/cotCombat';
import { 核心_判定思维链 } from './core/cotJudge';
import { 核心_古代现实基本逻辑 } from './core/ancientRealism';
import { 核心_行动选项规范 } from './core/actionOptions';
import { 核心_时间推进法则 } from './core/timeProgress';

// Stats
import { 数值_角色属性 } from './stats/character';
import { 数值_物品属性 } from './stats/items';
import { 数值_功法体系 } from './stats/kungfu';
import { 数值_其他设定 } from './stats/others';
import { 数值_战斗口径 } from './stats/combat';
import { 数值_部位生命 } from './stats/body';
import { 数值_经验成长 } from './stats/experience';
import { 数值_修炼体系 } from './stats/cultivation';
import { 数值_NPC参考 } from './stats/npc';
import { 数值_掉落资源 } from './stats/drop';
import { 数值_恢复休整 } from './stats/recovery';
import { 数值_物品重量参考 } from './stats/itemWeight';

// Difficulty
import { 难度_游戏 } from './difficulty/game';
import { 难度_判定 } from './difficulty/check';
import { 难度_生理 } from './difficulty/physiology';

// Writing
import { 写作_人称_第一, 写作_人称_第二, 写作_人称_第三 } from './writing/perspective';
import { 写作_要求 } from './writing/requirements';
import { 写作_防止说话 } from './writing/noControl';
import { 写作_风格 } from './writing/style';
import { 写作_避免极端情绪 } from './writing/emotionGuard';

export const 默认提示词: 提示词结构[] = [
    // Core
    核心_世界观, // Added
    核心_境界体系,
    核心_古代现实基本逻辑,
    核心_输出格式,
    核心_核心规则,
    核心_时间推进法则,
    核心_行动选项规范,
    核心_数据格式,
    核心_记忆法则,
    核心_思维链, // Added
    核心_战斗思维链,
    核心_判定思维链,

    // Stats
    数值_角色属性,
    数值_物品属性,
    数值_功法体系,
    数值_其他设定,
    数值_战斗口径,
    数值_部位生命,
    数值_经验成长,
    数值_修炼体系,
    数值_NPC参考,
    数值_掉落资源,
    数值_恢复休整,
    数值_物品重量参考,

    // Difficulty (Arrays)
    ...难度_游戏,
    ...难度_判定,
    ...难度_生理,

    // Writing
    写作_人称_第一,
    写作_人称_第二,
    写作_人称_第三,
    写作_要求,
    写作_防止说话,
    写作_风格,
    写作_避免极端情绪
];
