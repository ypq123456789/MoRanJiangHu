/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'artifacts');
const OUT_JSON = path.join(OUT_DIR, 'stress-test-report.json');
const OUT_MD = path.join(OUT_DIR, 'stress-test-report.md');

function readUtf8(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function checkFandomPromptAssembly() {
  const cases = [
    {
      name: 'world_generation',
      file: 'hooks/useGame/worldGenerationWorkflow.ts',
      needles: ['构建同人运行时提示词包', '世界观创建补丁', 'generateFandomRealmData', '核心_境界体系.id']
    },
    {
      name: 'opening_prompt_chain',
      file: 'hooks/useGame/openingStoryWorkflow.ts',
      needles: ['openingTaskPromptWithFandom', '开局COT补丁', '同人设定摘要', '境界体系提示词']
    },
    {
      name: 'main_prompt_chain',
      file: 'hooks/useGame/systemPromptBuilder.ts',
      needles: ['构建运行时提示词池', 'openingConfig', '构建女主剧情规划协议', '应用境界体系区块替换', 'core_realm']
    },
    {
      name: 'planning_prompt_chain',
      file: 'hooks/useGame/planningUpdateWorkflow.ts',
      needles: ['同人设定摘要', '境界母板补丁', 'fandomEnabled: fandomPromptBundle.enabled']
    },
    {
      name: 'world_evolution_prompt_chain',
      file: 'hooks/useGame/worldEvolutionWorkflow.ts',
      needles: ['构建世界演变COT提示词', '境界母板补丁', '构建同人运行时提示词包']
    },
    {
      name: 'save_prompt_snapshot_chain',
      file: 'hooks/useGame/saveCoordinator.ts',
      needles: ['核心提示词快照', 'core_world', 'core_realm', '设置提示词池']
    },
    {
      name: 'realm_generation_runtime',
      file: 'services/ai/storyTasks.ts',
      needles: ['generateFandomRealmData', '同人境界体系生成系统提示词', '校验境界体系提示词完整性']
    },
    {
      name: 'realm_core_slot',
      file: 'prompts/core/realm.ts',
      needles: ['core_realm', '固定头部 + 动态区块替换', '境界使用策略']
    }
  ];

  return cases.map((item) => {
    const source = readUtf8(item.file);
    const missing = item.needles.filter((needle) => !source.includes(needle));
    return {
      ...item,
      passed: missing.length === 0,
      missing
    };
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function effectiveAttr(v) {
  if (v <= 30) return v;
  if (v <= 60) return 30 + Math.floor((v - 30) * 0.55);
  return 46 + Math.floor((v - 60) * 0.35);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createRng(seed = 20260305) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rollInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function formatTime(env) {
  const p = (n) => String(Math.trunc(n)).padStart(2, '0');
  return `${env.年}:${p(env.月)}:${p(env.日)}:${p(env.时)}:${p(env.分)}`;
}

function calcUpgradeExp(level) {
  return Math.floor(95 + level * 18 + Math.pow(level, 1.42) * 6.5);
}

function calcMaxJing(体质, 根骨, level) {
  return Math.floor(35 + 体质 * 6 + 根骨 * 3 + level * 4.2 + Math.pow(level, 1.12) * 1.8);
}

function calcMaxNeili(根骨, 悟性, level) {
  return Math.floor(15 + 根骨 * 7 + 悟性 * 6 + level * 4.5 + Math.pow(level, 1.15) * 2.1);
}

function calcMaxSatiety(体质, 力量, level) {
  return Math.floor(70 + 体质 * 2 + 力量 * 1 + level * 2.4 + Math.pow(level, 1.08) * 0.9);
}

function calcMaxThirst(体质, 根骨, level) {
  return Math.floor(70 + 体质 * 2 + 根骨 * 1 + level * 2.4 + Math.pow(level, 1.08) * 0.9);
}

function calcMaxCarry(力量, 体质, level) {
  return Math.floor(80 + 力量 * 10 + 体质 * 2 + level * 1.8 + Math.pow(level, 1.05) * 0.8);
}

function calcTotalHp(体质, 根骨, 力量, level) {
  return Math.floor(80 + 体质 * 4.5 + 根骨 * 2.5 + 力量 * 1 + level * 2.6 + Math.pow(level, 1.1) * 1.2);
}

function nextRealmValue(level) {
  const jumps = {
    10: 11,
    13: 14,
    16: 17,
    19: 20,
    22: 24,
    24: 27,
    27: 33,
    33: 43
  };
  return jumps[level] || (level + 1);
}

function realmNameFromLevel(level) {
  if (level >= 1 && level <= 10) return `开脉境${level}重`;
  if (level === 11) return '聚息境前期';
  if (level === 12) return '聚息境中期';
  if (level === 13) return '聚息境后期';
  if (level === 14) return '归元境前期';
  if (level === 15) return '归元境中期';
  if (level === 16) return '归元境后期';
  if (level === 17) return '御劲境前期';
  if (level === 18) return '御劲境中期';
  if (level === 19) return '御劲境后期';
  if (level === 20) return '化罡境前期';
  if (level === 21) return '化罡境中期';
  if (level === 22) return '化罡境后期';
  if (level === 24) return '通玄境';
  if (level === 27) return '神照境';
  if (level === 33) return '返真境';
  if (level === 43) return '天人境';
  return `境界值${level}`;
}

function refreshDerivedCaps(role) {
  role.最大精力 = calcMaxJing(role.体质, role.根骨, role.境界层级);
  role.最大内力 = calcMaxNeili(role.根骨, role.悟性, role.境界层级);
  role.最大饱腹 = calcMaxSatiety(role.体质, role.力量, role.境界层级);
  role.最大口渴 = calcMaxThirst(role.体质, role.根骨, role.境界层级);
  role.最大负重 = calcMaxCarry(role.力量, role.体质, role.境界层级);
}

function advanceMinutes(env, minutes) {
  const out = deepClone(env);
  out.分 += minutes;
  while (out.分 >= 60) {
    out.分 -= 60;
    out.时 += 1;
  }
  while (out.时 >= 24) {
    out.时 -= 24;
    out.日 += 1;
  }
  while (out.日 > 30) {
    out.日 -= 30;
    out.月 += 1;
  }
  while (out.月 > 12) {
    out.月 -= 12;
    out.年 += 1;
  }
  return out;
}

function calcPartState(part) {
  const ratio = part.最大血量 > 0 ? part.当前血量 / part.最大血量 : 0;
  if (part.当前血量 <= 0) return '失能';
  if (ratio < 0.35) return '重伤';
  if (ratio < 0.6) return '中伤';
  if (ratio < 0.85) return '轻伤';
  return '正常';
}

function createInitialState() {
  const 境界层级 = 22;
  const 力量 = 22;
  const 敏捷 = 19;
  const 体质 = 21;
  const 根骨 = 24;
  const 悟性 = 20;
  const 福源 = 13;

  const 最大精力 = calcMaxJing(体质, 根骨, 境界层级);
  const 最大内力 = calcMaxNeili(根骨, 悟性, 境界层级);
  const 最大饱腹 = calcMaxSatiety(体质, 力量, 境界层级);
  const 最大口渴 = calcMaxThirst(体质, 根骨, 境界层级);
  const 最大负重 = calcMaxCarry(力量, 体质, 境界层级);

  const 总最大血量 = calcTotalHp(体质, 根骨, 力量, 境界层级);
  const 头最大 = Math.round(总最大血量 * 0.15);
  const 胸最大 = Math.round(总最大血量 * 0.22);
  const 腹最大 = Math.round(总最大血量 * 0.20);
  const 左手最大 = Math.round(总最大血量 * 0.11);
  const 右手最大 = Math.round(总最大血量 * 0.11);
  const 左腿最大 = Math.round(总最大血量 * 0.105);
  const 右腿最大 = Math.max(1, 总最大血量 - 头最大 - 胸最大 - 腹最大 - 左手最大 - 右手最大 - 左腿最大);

  return {
    环境: {
      年: 317,
      月: 3,
      日: 16,
      时: 9,
      分: 20,
      大地点: '江南道',
      中地点: '临安府',
      小地点: '南市',
      具体地点: '茶楼前街'
    },
    角色: {
      姓名: '沈孤城',
      境界: realmNameFromLevel(境界层级),
      境界层级,
      当前经验: 940,
      升级经验: calcUpgradeExp(境界层级),
      当前精力: Math.floor(最大精力 * 0.78),
      最大精力,
      当前内力: Math.floor(最大内力 * 0.72),
      最大内力,
      当前饱腹: Math.floor(最大饱腹 * 0.76),
      最大饱腹,
      当前口渴: Math.floor(最大口渴 * 0.78),
      最大口渴,
      当前负重: 42,
      最大负重,
      力量,
      敏捷,
      体质,
      根骨,
      悟性,
      福源,
      头: { 当前血量: 头最大, 最大血量: 头最大, 状态: '正常' },
      胸: { 当前血量: 胸最大, 最大血量: 胸最大, 状态: '正常' },
      腹: { 当前血量: 腹最大, 最大血量: 腹最大, 状态: '正常' },
      左手: { 当前血量: 左手最大, 最大血量: 左手最大, 状态: '正常' },
      右手: { 当前血量: 右手最大, 最大血量: 右手最大, 状态: '正常' },
      左腿: { 当前血量: 左腿最大, 最大血量: 左腿最大, 状态: '正常' },
      右腿: { 当前血量: 右腿最大, 最大血量: 右腿最大, 状态: '正常' }
    },
    战斗: {
      是否战斗中: false,
      敌方: []
    },
    审计: {
      已完成回合: 0
    }
  };
}

function buildThinking(scene, phase, stateBefore) {
  const t = [];
  t.push(`Step0: 边界校验｜当前场景=${scene}，仅改动角色/环境/战斗等合法路径。`);
  t.push(`Step1: 输入拆解｜本轮目标=${phase.goal}，停止条件=${phase.stop}.`);
  t.push(`Step2: 快照回忆｜时间=${formatTime(stateBefore.环境)}，境界层级=${stateBefore.角色.境界层级}.`);
  t.push('Step3: 关系与在场｜无越权NPC写入，若有互动仅记忆可追溯事实。');
  t.push('Step4: 世界与剧情钩子｜只维护与本轮动作相关的最小更新。');
  t.push('Step5: 候选分支｜准备保守/标准/激进三案，选标准案执行。');
  t.push('Step6: 结构调整｜先结算旧状态，再写本轮新增状态。');
  t.push('Step7: NPC塑造｜无关键新NPC建档需求。');
  t.push(`Step8: 判定规划｜${phase.judgePlan}`);
  t.push('Step9: 资源审计｜精力/内力/饱腹/口渴与部位血量均需边界裁切。');
  t.push('Step10: 命令预演｜验证命令顺序=创建->修改->清理，禁止单判定覆盖战斗。');
  t.push('Step11: 时间推进｜按行动耗时推进环境.时/分，跨日再进位。');
  t.push('Step12: 错误复核｜检查负值、越界、漏扣、漏回收。');
  t.push('Step13: 最终落地｜输出正文事实对应命令，并保留可审计依据。');
  return t;
}

function judgeValue(state, rng, mode) {
  const r = rollInt(rng, -18, 18);
  const levelBonus = Math.floor(state.角色.境界层级 * 0.9 + Math.pow(state.角色.境界层级, 1.08) * 0.65);
  const innerBonus =
    state.角色.最大内力 > 0
      ? Math.floor((state.角色.当前内力 / state.角色.最大内力) * 8) - 4
      : 0;
  const effStr = effectiveAttr(state.角色.力量);
  const effAgi = effectiveAttr(state.角色.敏捷);
  const effVit = effectiveAttr(state.角色.体质);
  const effBone = effectiveAttr(state.角色.根骨);
  const effWis = effectiveAttr(state.角色.悟性);
  const effLuck = effectiveAttr(state.角色.福源);
  let base;
  if (mode === 'combat_attack') {
    base = Math.floor(effStr * 1.45 + effAgi * 0.65);
  } else if (mode === 'combat_defense') {
    base = Math.floor(effAgi * 1.55 + effBone * 0.8);
  } else if (mode === 'cultivate') {
    base = Math.floor(effWis * 1.65 + effBone * 0.65);
  } else {
    base = Math.floor(effLuck * 1.25 + effWis * 0.95);
  }
  return { value: base + levelBonus + innerBonus + r, r, base, levelBonus, innerBonus };
}

function addCmd(commands, op, key, value) {
  if (op === 'delete') {
    commands.push(`delete ${key}`);
  } else {
    commands.push(`${op} ${key} = ${typeof value === 'string' ? `"${value}"` : value}`);
  }
}

function applyMetabolism(state, commands, rng, minutes, activity) {
  const ranges = {
    play: [2, 4],
    cultivate: [3, 6],
    combat: [6, 10],
    breakthrough: [4, 7],
    recover: [1, 2]
  };
  const [emin, emax] = ranges[activity] || [2, 4];
  const hours = minutes / 60;
  if (hours <= 0) return;

  const eCost = Math.max(1, Math.floor(rollInt(rng, emin, emax) * hours));
  const fCost = Math.max(1, Math.floor(rollInt(rng, 5, 6) * hours));
  const wCost = Math.max(1, Math.floor(rollInt(rng, 6, 8) * hours));

  state.角色.当前精力 = clamp(state.角色.当前精力 - eCost, 0, state.角色.最大精力);
  state.角色.当前饱腹 = clamp(state.角色.当前饱腹 - fCost, 0, state.角色.最大饱腹);
  state.角色.当前口渴 = clamp(state.角色.当前口渴 - wCost, 0, state.角色.最大口渴);

  addCmd(commands, 'add', '角色.当前精力', -eCost);
  addCmd(commands, 'add', '角色.当前饱腹', -fCost);
  addCmd(commands, 'add', '角色.当前口渴', -wCost);

  if (state.角色.当前饱腹 === 0 || state.角色.当前口渴 === 0) {
    const pct = rollInt(rng, 10, 12) / 100;
    const chestLoss = Math.max(1, Math.floor(state.角色.胸.最大血量 * pct * hours));
    const bellyLoss = Math.max(1, Math.floor(state.角色.腹.最大血量 * (pct * 0.8) * hours));
    state.角色.胸.当前血量 = clamp(state.角色.胸.当前血量 - chestLoss, 0, state.角色.胸.最大血量);
    state.角色.腹.当前血量 = clamp(state.角色.腹.当前血量 - bellyLoss, 0, state.角色.腹.最大血量);
    state.角色.胸.状态 = calcPartState(state.角色.胸);
    state.角色.腹.状态 = calcPartState(state.角色.腹);
    addCmd(commands, 'add', '角色.胸.当前血量', -chestLoss);
    addCmd(commands, 'add', '角色.腹.当前血量', -bellyLoss);
    addCmd(commands, 'set', '角色.胸.状态', state.角色.胸.状态);
    addCmd(commands, 'set', '角色.腹.状态', state.角色.腹.状态);
  }
}

function simulatePlay(state, rng) {
  const commands = [];
  const judgments = [];

  const j = judgeValue(state, rng, 'play');
  const dc = 35 + rollInt(rng, -2, 3);
  const diff = j.value - dc;
  const result = diff >= 0 ? (diff >= 28 ? '大成功' : '成功') : (diff <= -30 ? '大失败' : '失败');

  judgments.push({
    type: '非战斗判定',
    action: '市集情报搜集',
    value: j.value,
    dc,
    result,
    detail: `基础${j.base}+境界${j.levelBonus}+内力修正${j.innerBonus}+R(${j.r})`
  });

  if (result === '成功' || result === '大成功') {
    const exp = result === '大成功' ? 52 : 32;
    state.角色.当前经验 = clamp(state.角色.当前经验 + exp, 0, 999999);
    addCmd(commands, 'add', '角色.当前经验', exp);
  } else {
    const loss = result === '大失败' ? 10 : 5;
    state.角色.当前精力 = clamp(state.角色.当前精力 - loss, 0, state.角色.最大精力);
    addCmd(commands, 'add', '角色.当前精力', -loss);
  }

  if (state.角色.当前饱腹 <= 50) {
    const gain = rollInt(rng, 10, 20);
    state.角色.当前饱腹 = clamp(state.角色.当前饱腹 + gain, 0, state.角色.最大饱腹);
    addCmd(commands, 'add', '角色.当前饱腹', gain);
  }
  if (state.角色.当前口渴 <= 50) {
    const gain = rollInt(rng, 12, 24);
    state.角色.当前口渴 = clamp(state.角色.当前口渴 + gain, 0, state.角色.最大口渴);
    addCmd(commands, 'add', '角色.当前口渴', gain);
  }

  const minutes = rollInt(rng, 35, 70);
  applyMetabolism(state, commands, rng, minutes, 'play');
  state.环境 = advanceMinutes(state.环境, minutes);
  addCmd(commands, 'set', '环境.时', state.环境.时);
  addCmd(commands, 'set', '环境.分', state.环境.分);

  return {
    commands,
    judgments,
    goal: '游玩探索并校验非战斗判定',
    stop: '完成情报搜集、补给与时间推进',
    judgePlan: '执行通用判定COT，至少1条非战斗判定并落地代价/收益。'
  };
}

function checkCultivateGate(state) {
  const reasons = [];
  if (state.战斗.是否战斗中) reasons.push('战斗中无法修炼');
  if (state.角色.当前精力 < Math.max(15, Math.floor(state.角色.最大精力 * 0.15))) reasons.push('精力不足');
  if (state.角色.当前饱腹 < Math.max(20, Math.floor(state.角色.最大饱腹 * 0.2))) reasons.push('饱腹不足');
  if (state.角色.当前口渴 < Math.max(20, Math.floor(state.角色.最大口渴 * 0.2))) reasons.push('口渴不足');
  return reasons;
}

function simulateCultivate(state, rng) {
  const commands = [];
  const judgments = [];

  const gateReasons = checkCultivateGate(state);
  if (gateReasons.length > 0) {
    judgments.push({
      type: '修炼判定',
      action: '行功周天',
      value: 0,
      dc: 0,
      result: '失败',
      detail: `资源门槛未满足: ${gateReasons.join('；')}`
    });
    const innerAdjust = rollInt(rng, 2, 6);
    state.角色.当前内力 = clamp(state.角色.当前内力 + innerAdjust, 0, state.角色.最大内力);
    addCmd(commands, 'add', '角色.当前内力', innerAdjust);

    const minutes = rollInt(rng, 45, 70);
    applyMetabolism(state, commands, rng, minutes, 'recover');
    state.环境 = advanceMinutes(state.环境, minutes);
    addCmd(commands, 'set', '环境.时', state.环境.时);
    addCmd(commands, 'set', '环境.分', state.环境.分);

    return {
      commands,
      judgments,
      goal: '执行修炼并核验资源守恒',
      stop: '资源不足时被门槛拦截并落地代价',
      judgePlan: '执行通用判定COT，资源不足时结果上限为失败。'
    };
  }

  const j = judgeValue(state, rng, 'cultivate');
  const dc = Math.floor(18 + state.角色.境界层级 * 2.8 + Math.pow(state.角色.境界层级, 1.32) * 1.25);
  const diff = j.value - dc;
  const ok = diff >= 0;
  judgments.push({
    type: '修炼判定',
    action: '行功周天',
    value: j.value,
    dc,
    result: ok ? '成功' : '失败',
    detail: `基础${j.base}+境界${j.levelBonus}+内力修正${j.innerBonus}+R(${j.r})`
  });

  const p = Math.floor(
    (state.角色.根骨 * 1.0 +
      state.角色.悟性 * 1.25 +
      state.角色.体质 * 0.35 +
      state.角色.境界层级 * 0.42 +
      Math.pow(state.角色.境界层级, 1.18) * 0.9) * 0.92
  );
  const progress = ok ? clamp(p, 18, Math.floor(state.角色.升级经验 * 0.18)) : clamp(Math.floor(p * 0.35), 8, 42);
  const innerGain = ok
    ? clamp(
      Math.floor(
        (state.角色.根骨 * 1.05 +
          state.角色.悟性 * 1.1 +
          state.角色.境界层级 * 0.32 +
          Math.pow(state.角色.境界层级, 1.12) * 0.55) * 0.35
      ),
      8,
      24
    )
    : 0;
  const energyCost = ok ? rollInt(rng, 6, 10) : rollInt(rng, 4, 8);
  const innerCost = ok ? rollInt(rng, 14, 22) : rollInt(rng, 8, 14);

  state.角色.当前经验 = clamp(state.角色.当前经验 + progress, 0, 999999);
  state.角色.当前精力 = clamp(state.角色.当前精力 - energyCost, 0, state.角色.最大精力);
  state.角色.当前内力 = clamp(state.角色.当前内力 - innerCost + innerGain, 0, state.角色.最大内力);

  addCmd(commands, 'add', '角色.当前经验', progress);
  addCmd(commands, 'add', '角色.当前精力', -energyCost);
  addCmd(commands, 'add', '角色.当前内力', -innerCost + innerGain);

  const minutes = rollInt(rng, 80, 140);
  applyMetabolism(state, commands, rng, minutes, 'cultivate');
  state.环境 = advanceMinutes(state.环境, minutes);
  addCmd(commands, 'set', '环境.时', state.环境.时);
  addCmd(commands, 'set', '环境.分', state.环境.分);

  return {
    commands,
    judgments,
    goal: '执行修炼并核验资源守恒',
    stop: '经验增长+精力/内力/生理值正确扣增',
    judgePlan: '执行通用判定COT，生成修炼成败并映射资源代价。'
  };
}

function checkBreakthroughGate(state) {
  const reasons = [];
  if (state.战斗.是否战斗中) reasons.push('战斗中禁止突破');
  if (state.角色.当前经验 < state.角色.升级经验) reasons.push('经验未达升级门槛');
  if (state.角色.当前精力 < Math.max(25, Math.floor(state.角色.最大精力 * 0.25))) reasons.push('精力不足25%');
  if (state.角色.当前内力 < Math.max(35, Math.floor(state.角色.最大内力 * 0.35))) reasons.push('内力不足35%');
  const criticalInjury = ['头', '胸', '腹'].some((part) => {
    const obj = state.角色[part];
    return obj.当前血量 <= 0 || obj.状态 === '重伤' || obj.状态 === '失能';
  });
  if (criticalInjury) reasons.push('关键部位重伤');
  return reasons;
}

function simulateBreakthrough(state, rng) {
  const commands = [];
  const judgments = [];

  const gateReasons = checkBreakthroughGate(state);
  if (gateReasons.length > 0) {
    judgments.push({
      type: '突破判定',
      action: '冲关破境',
      value: 0,
      dc: 0,
      result: '失败',
      detail: `突破门槛未满足: ${gateReasons.join('；')}`
    });

    const energyCost = rollInt(rng, 10, 16);
    const innerCost = rollInt(rng, 14, 22);
    const backlash = rollInt(rng, 2, 6);

    state.角色.当前精力 = clamp(state.角色.当前精力 - energyCost, 0, state.角色.最大精力);
    state.角色.当前内力 = clamp(state.角色.当前内力 - innerCost, 0, state.角色.最大内力);
    state.角色.胸.当前血量 = clamp(state.角色.胸.当前血量 - backlash, 0, state.角色.胸.最大血量);
    state.角色.胸.状态 = calcPartState(state.角色.胸);

    addCmd(commands, 'add', '角色.当前精力', -energyCost);
    addCmd(commands, 'add', '角色.当前内力', -innerCost);
    addCmd(commands, 'add', '角色.胸.当前血量', -backlash);
    addCmd(commands, 'set', '角色.胸.状态', state.角色.胸.状态);

    const minutes = rollInt(rng, 70, 120);
    applyMetabolism(state, commands, rng, minutes, 'breakthrough');
    state.环境 = advanceMinutes(state.环境, minutes);
    addCmd(commands, 'set', '环境.时', state.环境.时);
    addCmd(commands, 'set', '环境.分', state.环境.分);

    return {
      commands,
      judgments,
      goal: '执行突破并检查成败分支',
      stop: '门槛不足时必须失败并兑现代价',
      judgePlan: '执行通用判定COT，先做突破前置门槛校验。'
    };
  }

  const targetLevel = nextRealmValue(state.角色.境界层级);
  const roll = rollInt(rng, -16, 16);
  const score = Math.floor(
    state.角色.根骨 * 1.0 +
      state.角色.悟性 * 1.2 +
      (state.角色.当前内力 / state.角色.最大内力) * 18 +
      (state.角色.当前精力 / state.角色.最大精力) * 10 +
      10 +
      6 +
      roll
  );
  const threshold = Math.floor(26 + targetLevel * 3.2 + Math.pow(targetLevel, 1.36) * 1.45 + 12 + 4);
  const success = score >= threshold;

  judgments.push({
    type: '突破判定',
    action: '冲关破境',
    value: score,
    dc: threshold,
    result: success ? '成功' : '失败',
    detail: `目标境界值${targetLevel}，随机修正R(${roll})`
  });

  const energyCost = rollInt(rng, 16, 24);
  const innerCost = rollInt(rng, 24, 36);
  state.角色.当前精力 = clamp(state.角色.当前精力 - energyCost, 0, state.角色.最大精力);
  state.角色.当前内力 = clamp(state.角色.当前内力 - innerCost, 0, state.角色.最大内力);
  addCmd(commands, 'add', '角色.当前精力', -energyCost);
  addCmd(commands, 'add', '角色.当前内力', -innerCost);

  if (success) {
    const oldUpgrade = state.角色.升级经验;
    const previousCaps = {
      最大精力: state.角色.最大精力,
      最大内力: state.角色.最大内力,
      最大饱腹: state.角色.最大饱腹,
      最大口渴: state.角色.最大口渴,
      最大负重: state.角色.最大负重
    };
    state.角色.当前经验 = Math.max(0, state.角色.当前经验 - oldUpgrade);
    state.角色.境界层级 = targetLevel;
    state.角色.境界 = realmNameFromLevel(targetLevel);
    state.角色.升级经验 = calcUpgradeExp(targetLevel);
    refreshDerivedCaps(state.角色);
    state.角色.当前内力 = clamp(state.角色.当前内力 + 22, 0, state.角色.最大内力);
    state.角色.当前精力 = clamp(state.角色.当前精力 + 10, 0, state.角色.最大精力);

    addCmd(commands, 'add', '角色.当前经验', -oldUpgrade);
    addCmd(commands, 'set', '角色.境界层级', targetLevel);
    addCmd(commands, 'set', '角色.境界', state.角色.境界);
    addCmd(commands, 'set', '角色.升级经验', state.角色.升级经验);
    if (state.角色.最大精力 !== previousCaps.最大精力) addCmd(commands, 'set', '角色.最大精力', state.角色.最大精力);
    if (state.角色.最大内力 !== previousCaps.最大内力) addCmd(commands, 'set', '角色.最大内力', state.角色.最大内力);
    if (state.角色.最大饱腹 !== previousCaps.最大饱腹) addCmd(commands, 'set', '角色.最大饱腹', state.角色.最大饱腹);
    if (state.角色.最大口渴 !== previousCaps.最大口渴) addCmd(commands, 'set', '角色.最大口渴', state.角色.最大口渴);
    if (state.角色.最大负重 !== previousCaps.最大负重) addCmd(commands, 'set', '角色.最大负重', state.角色.最大负重);
    addCmd(commands, 'add', '角色.当前精力', 10);
    addCmd(commands, 'add', '角色.当前内力', 22);
  } else {
    const backlash = rollInt(rng, 7, 13);
    state.角色.胸.当前血量 = clamp(state.角色.胸.当前血量 - backlash, 0, state.角色.胸.最大血量);
    state.角色.胸.状态 = calcPartState(state.角色.胸);
    addCmd(commands, 'add', '角色.胸.当前血量', -backlash);
    addCmd(commands, 'set', '角色.胸.状态', state.角色.胸.状态);
  }

  const minutes = rollInt(rng, 90, 180);
  applyMetabolism(state, commands, rng, minutes, 'breakthrough');
  state.环境 = advanceMinutes(state.环境, minutes);
  addCmd(commands, 'set', '环境.时', state.环境.时);
  addCmd(commands, 'set', '环境.分', state.环境.分);

  return {
    commands,
    judgments,
    goal: '执行突破并检查成败分支',
    stop: '成功升层或失败反噬均可追溯',
    judgePlan: '执行通用判定COT，突破前先校验经验/精力/内力门槛。'
  };
}

function spawnEnemy(name, level, hp, atk, def, neili = 80) {
  return {
    名字: name,
    境界: realmNameFromLevel(level),
    简介: '江湖敌手',
    技能: ['刀劈', '横扫'],
    战斗力: atk,
    防御力: def,
    当前血量: hp,
    最大血量: hp,
    当前精力: 85,
    最大精力: 85,
    当前内力: neili,
    最大内力: neili
  };
}

function ensureBattleFields(enemy) {
  if (typeof enemy.当前内力 !== 'number') enemy.当前内力 = 0;
  if (typeof enemy.最大内力 !== 'number') enemy.最大内力 = enemy.当前内力;
}

function simulateCombat(state, rng, multi = false, continuation = false) {
  const commands = [];
  const judgments = [];

  if (!state.战斗.是否战斗中 || !continuation || !Array.isArray(state.战斗.敌方) || state.战斗.敌方.length === 0) {
    state.战斗.是否战斗中 = true;
    state.战斗.敌方 = multi
      ? [spawnEnemy('赵黑狼', 18, 95, 48, 32, 70), spawnEnemy('何铁臂', 19, 88, 44, 30, 66)]
      : [spawnEnemy('丁残刀', 19, 108, 52, 35, 82)];
    addCmd(commands, 'set', '战斗.是否战斗中', true);
    addCmd(commands, 'set', '战斗.敌方', '[敌方数组已初始化]');
  }

  state.战斗.敌方.forEach(ensureBattleFields);
  const enemies = state.战斗.敌方;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.当前血量 <= 0) continue;

    const minJing = Math.max(6, Math.floor(state.角色.最大精力 * 0.08));
    if (state.角色.当前精力 < minJing) {
      judgments.push({
        type: '战斗-出手判定',
        action: `攻击${enemy.名字}`,
        value: state.角色.当前精力,
        dc: minJing,
        result: '失败',
        detail: '精力不足，出手被拦截'
      });
      continue;
    }

    const atkJudge = judgeValue(state, rng, 'combat_attack');
    const enemyBase = Math.floor(enemy.战斗力 * 0.52 + enemy.防御力 * 0.48);
    const enemyUplift = Math.floor(Math.max(0, enemyBase - 90) * 0.18);
    const atkDc = enemyBase + enemyUplift + 12;
    const atkDiff = atkJudge.value - atkDc;
    const hit = atkDiff >= -12;

    judgments.push({
      type: '战斗-出手判定',
      action: `攻击${enemy.名字}`,
      value: atkJudge.value,
      dc: atkDc,
      result: hit ? '成功' : '失败',
      detail: `R(${atkJudge.r})`
    });

    const missCost = rollInt(rng, 4, 7);
    if (!hit) {
      state.角色.当前精力 = clamp(state.角色.当前精力 - missCost, 0, state.角色.最大精力);
      addCmd(commands, 'add', '角色.当前精力', -missCost);
      continue;
    }

    const defJudge = rollInt(rng, 18, 72) + Math.floor(enemy.当前精力 * 0.2);
    const effAgi = effectiveAttr(state.角色.敏捷);
    const effBone = effectiveAttr(state.角色.根骨);
    const defDc = Math.floor(
      effAgi * 1.35 +
      effBone * 0.85 +
      state.角色.境界层级 * 0.86 +
      Math.pow(state.角色.境界层级, 1.1) * 0.4
    );
    const defSuccess = defJudge >= defDc;

    judgments.push({
      type: '战斗-防御判定',
      action: `${enemy.名字}防御`,
      value: defJudge,
      dc: defDc,
      result: defSuccess ? '成功' : '失败',
      detail: '闪避/格挡综合'
    });

    const useSkill = state.角色.当前内力 >= 12;
    const qiCost = useSkill ? rollInt(rng, 12, 20) : 0;
    const jingCost = rollInt(rng, 6, 10);

    if (!useSkill) {
      judgments.push({
        type: '战斗-资源判定',
        action: `${enemy.名字}内力门槛`,
        value: state.角色.当前内力,
        dc: 12,
        result: '失败',
        detail: '内力不足，按降效普攻结算'
      });
    }

    const effStr = effectiveAttr(state.角色.力量);
    const effAgi2 = effectiveAttr(state.角色.敏捷);
    const baseAtk = Math.floor(
      effStr * 0.82 +
      effAgi2 * 0.3 +
      state.角色.境界层级 * 0.58 +
      Math.pow(state.角色.境界层级, 1.08) * 0.34
    );
    const attackStrength = baseAtk + (useSkill ? 46 : 28);
    const reduction = clamp(enemy.防御力 / (enemy.防御力 + 240), 0.12, 0.7);
    const neiliCoeff = useSkill
      ? 0.88 + clamp(state.角色.当前内力 / Math.max(state.角色.最大内力, 1), 0, 1) * 0.24
      : 0.82;

    let dmg = Math.floor(Math.max(1, attackStrength * (1 - reduction) * (defSuccess ? 0.72 : 1) * neiliCoeff));
    dmg = Math.min(dmg, Math.floor(enemy.最大血量 * 0.42));

    enemy.当前血量 = clamp(enemy.当前血量 - dmg, 0, enemy.最大血量);
    addCmd(commands, 'add', `战斗.敌方[${i}].当前血量`, -dmg);

    state.角色.当前内力 = clamp(state.角色.当前内力 - qiCost, 0, state.角色.最大内力);
    state.角色.当前精力 = clamp(state.角色.当前精力 - jingCost, 0, state.角色.最大精力);
    if (qiCost > 0) addCmd(commands, 'add', '角色.当前内力', -qiCost);
    addCmd(commands, 'add', '角色.当前精力', -jingCost);

    const bleedChance = useSkill ? 28 : 12;
    const bleedProc = rollInt(rng, 1, 100) <= bleedChance;
    judgments.push({
      type: '战斗-效果判定',
      action: `${enemy.名字}裂创流血`,
      value: bleedProc ? 1 : 0,
      dc: 1,
      result: bleedProc ? '成功' : '失败',
      detail: `触发概率${bleedChance}%`
    });

    if (bleedProc && enemy.当前血量 > 0) {
      const dot = clamp(Math.floor(dmg * 0.22), 2, 16);
      enemy.当前血量 = clamp(enemy.当前血量 - dot, 0, enemy.最大血量);
      addCmd(commands, 'add', `战斗.敌方[${i}].当前血量`, -dot);
    }
  }

  const alive = enemies.filter((e) => e.当前血量 > 0).length;

  if (alive === 0) {
    state.战斗.是否战斗中 = false;
    state.战斗.敌方 = [];
    addCmd(commands, 'set', '战斗.是否战斗中', false);
    addCmd(commands, 'set', '战斗.敌方', '[]');
    const exp = multi ? 180 : 120;
    state.角色.当前经验 = clamp(state.角色.当前经验 + exp, 0, 999999);
    addCmd(commands, 'add', '角色.当前经验', exp);
  } else {
    const disengage = judgeValue(state, rng, 'combat_defense');
    const dc = 42 + alive * 6;
    const escaped = disengage.value >= dc;
    judgments.push({
      type: '战斗-脱战判定',
      action: '拉开身位',
      value: disengage.value,
      dc,
      result: escaped ? '成功' : '失败',
      detail: `R(${disengage.r})`
    });
    if (escaped) {
      state.战斗.是否战斗中 = false;
      state.战斗.敌方 = [];
      addCmd(commands, 'set', '战斗.是否战斗中', false);
      addCmd(commands, 'set', '战斗.敌方', '[]');
    }
  }

  const minutes = rollInt(rng, 12, 35);
  applyMetabolism(state, commands, rng, minutes, 'combat');
  state.环境 = advanceMinutes(state.环境, minutes);
  addCmd(commands, 'set', '环境.时', state.环境.时);
  addCmd(commands, 'set', '环境.分', state.环境.分);

  return {
    commands,
    judgments,
    goal: continuation ? '战斗锁触发续战测试' : multi ? '多目标战斗压力测试' : '单目标战斗压力测试',
    stop: '完成出手/防御/伤害/效果分段并校验战斗锁',
    judgePlan: '执行战斗COT，至少包含出手判定、防御判定、伤害与效果判定。'
  };
}

function checkBounds(state) {
  const issues = [];
  const c = state.角色;
  const checks = [
    ['当前精力', c.当前精力, c.最大精力],
    ['当前内力', c.当前内力, c.最大内力],
    ['当前饱腹', c.当前饱腹, c.最大饱腹],
    ['当前口渴', c.当前口渴, c.最大口渴]
  ];

  checks.forEach(([k, cur, max]) => {
    if (cur < 0 || cur > max) issues.push(`角色.${k}越界: ${cur}/${max}`);
  });

  ['头', '胸', '腹', '左手', '右手', '左腿', '右腿'].forEach((part) => {
    if (c[part].当前血量 < 0 || c[part].当前血量 > c[part].最大血量) {
      issues.push(`角色.${part}.当前血量越界: ${c[part].当前血量}/${c[part].最大血量}`);
    }
  });

  if (state.战斗.是否战斗中) {
    state.战斗.敌方.forEach((e, idx) => {
      if (e.当前血量 < 0 || e.当前血量 > e.最大血量) {
        issues.push(`战斗.敌方[${idx}].当前血量越界: ${e.当前血量}/${e.最大血量}`);
      }
      if (typeof e.当前内力 !== 'number' || typeof e.最大内力 !== 'number') {
        issues.push(`战斗.敌方[${idx}]缺少内力字段`);
      }
    });
  }

  return issues;
}

function sceneSpecificChecks(scene, result, before) {
  const issues = [];
  const isCombatScene = scene === '战斗' || scene === '战斗(多目标)' || scene === '战斗(续战)';

  if (before.战斗.是否战斗中 && !isCombatScene) {
    issues.push('战斗锁违规：战斗中进入了非战斗场景');
  }

  if (isCombatScene) {
    const hasAtk = result.judgments.some((j) => j.type === '战斗-出手判定');
    const hasAtkSuccess = result.judgments.some((j) => j.type === '战斗-出手判定' && j.result === '成功');
    const hasDef = result.judgments.some((j) => j.type === '战斗-防御判定');
    const hasDamageCmd = result.commands.some((c) => c.includes('战斗.敌方[') && c.includes('当前血量'));
    if (!hasAtk) issues.push('缺少出手判定');
    if (hasAtkSuccess && !hasDef) issues.push('缺少防御判定');
    if (hasAtkSuccess && !hasDamageCmd) issues.push('缺少敌方扣血命令');
  }

  if (scene === '境界突破') {
    const hasBreakJudge = result.judgments.some((j) => j.type === '突破判定');
    const success = result.judgments.some((j) => j.type === '突破判定' && j.result === '成功');
    if (!hasBreakJudge) issues.push('缺少突破判定');
    if (success && before.角色.当前经验 < before.角色.升级经验) {
      issues.push('突破成功但未满足经验门槛');
    }
    if (result.commands.some((c) => c.includes('set 角色.当前经验 = 0'))) {
      issues.push('突破结算违规：直接set当前经验为0');
    }
  }

  if (scene === '修炼') {
    const hasCultJudge = result.judgments.some((j) => j.type === '修炼判定');
    const hasInnerChange = result.commands.some((c) => c.includes('角色.当前内力'));
    if (!hasCultJudge) issues.push('缺少修炼判定');
    if (!hasInnerChange) issues.push('修炼未体现内力变化');
  }

  if (scene === '游玩') {
    const hasPlayJudge = result.judgments.some((j) => j.type === '非战斗判定');
    if (!hasPlayJudge) issues.push('游玩缺少通用判定');
  }

  const hasFoodCost = result.commands.some((c) => c.includes('角色.当前饱腹'));
  const hasWaterCost = result.commands.some((c) => c.includes('角色.当前口渴'));
  if (!hasFoodCost) issues.push('缺少饱腹变化命令');
  if (!hasWaterCost) issues.push('缺少口渴变化命令');

  if (result.thinking.length !== 14) issues.push(`思考步骤不完整: ${result.thinking.length}/14`);
  return issues;
}

function diffSummary(before, after) {
  const keys = ['当前经验', '境界层级', '当前精力', '当前内力', '当前饱腹', '当前口渴'];
  const lines = [];
  for (const k of keys) {
    const b = before.角色[k];
    const a = after.角色[k];
    if (b !== a) lines.push(`${k}: ${b} -> ${a} (${a - b >= 0 ? '+' : ''}${a - b})`);
  }

  const bFight = `${before.战斗.是否战斗中}/${before.战斗.敌方.length}`;
  const aFight = `${after.战斗.是否战斗中}/${after.战斗.敌方.length}`;
  if (bFight !== aFight) lines.push(`战斗状态: ${bFight} -> ${aFight}`);

  lines.push(`时间: ${formatTime(before.环境)} -> ${formatTime(after.环境)}`);
  return lines;
}

function run() {
  const rng = createRng(20260305);
  const scenes = ['游玩', '修炼', '战斗', '游玩', '修炼', '境界突破', '战斗(多目标)', '游玩', '修炼', '境界突破'];

  let state = createInitialState();
  const rounds = [];
  const globalIssues = [];

  for (let i = 0; i < 10; i++) {
    const round = i + 1;
    const plannedScene = scenes[i];
    const before = deepClone(state);

    let scene = plannedScene;
    if (state.战斗.是否战斗中 && !scene.startsWith('战斗')) {
      scene = '战斗(续战)';
    }

    let core;
    if (scene === '游玩') core = simulatePlay(state, rng);
    else if (scene === '修炼') core = simulateCultivate(state, rng);
    else if (scene === '境界突破') core = simulateBreakthrough(state, rng);
    else if (scene === '战斗(多目标)') core = simulateCombat(state, rng, true, false);
    else if (scene === '战斗(续战)') core = simulateCombat(state, rng, false, true);
    else core = simulateCombat(state, rng, false, false);

    const thinking = buildThinking(scene, core, before);
    const after = deepClone(state);

    const issues = [...checkBounds(state), ...sceneSpecificChecks(scene, { ...core, thinking }, before)];
    if (issues.length > 0) {
      globalIssues.push(`Round${round}: ${issues.join('；')}`);
    }

    rounds.push({
      round,
      plannedScene,
      scene,
      thinking,
      judgments: core.judgments,
      commands: core.commands,
      diff: diffSummary(before, after),
      issues
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    seed: 20260305,
    summary: {
      totalRounds: rounds.length,
      passedRounds: rounds.filter((r) => r.issues.length === 0).length,
      failedRounds: rounds.filter((r) => r.issues.length > 0).length,
      globalIssues
    },
    rounds,
    fandomPromptChecks: checkFandomPromptAssembly()
  };

  const failedFandomChecks = report.fandomPromptChecks.filter((item) => !item.passed);
  if (failedFandomChecks.length > 0) {
    failedFandomChecks.forEach((item) => {
      report.summary.globalIssues.push(`FandomPromptCheck:${item.name}:${item.missing.join(',')}`);
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# 10轮压力测试报告');
  md.push('');
  md.push(`- 生成时间: ${report.generatedAt}`);
  md.push(`- 随机种子: ${report.seed}`);
  md.push(`- 通过回合: ${report.summary.passedRounds}/${report.summary.totalRounds}`);
  md.push(`- 失败回合: ${report.summary.failedRounds}`);
  md.push('');

  if (report.summary.globalIssues.length) {
    md.push('## 全局问题');
    report.summary.globalIssues.forEach((x) => md.push(`- ${x}`));
    md.push('');
  }

  md.push('## 同人提示词链路校验');
  report.fandomPromptChecks.forEach((item) => {
    md.push(`- ${item.name}｜${item.passed ? 'PASS' : 'FAIL'}｜${item.file}`);
    if (!item.passed) {
      md.push(`  缺失：${item.missing.join('、')}`);
    }
  });
  md.push('');

  for (const r of rounds) {
    md.push(`## Round ${r.round}｜执行场景=${r.scene}｜计划场景=${r.plannedScene}`);
    md.push('');
    md.push('### 思考（Step0~Step13）');
    r.thinking.forEach((s) => md.push(`- ${s}`));
    md.push('');
    md.push('### 判定');
    r.judgments.forEach((j) => {
      md.push(`- ${j.type}｜${j.action}｜${j.result}｜判定值${j.value}/难度${j.dc}｜${j.detail}`);
    });
    md.push('');
    md.push('### 命令');
    r.commands.forEach((c) => md.push(`- \`${c}\``));
    md.push('');
    md.push('### 数值变化');
    r.diff.forEach((d) => md.push(`- ${d}`));
    md.push('');
    md.push('### 校验结果');
    if (r.issues.length === 0) md.push('- 通过');
    else r.issues.forEach((e) => md.push(`- 问题: ${e}`));
    md.push('');
  }

  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');

  console.log('[stress-test] done');
  console.log(`[stress-test] json: ${OUT_JSON}`);
  console.log(`[stress-test] md  : ${OUT_MD}`);
  console.log(`[stress-test] passed: ${report.summary.passedRounds}/${report.summary.totalRounds}`);
  if (report.summary.globalIssues.length) {
    console.log('[stress-test] issues:');
    report.summary.globalIssues.forEach((x) => console.log(`  - ${x}`));
  }
}

run();
