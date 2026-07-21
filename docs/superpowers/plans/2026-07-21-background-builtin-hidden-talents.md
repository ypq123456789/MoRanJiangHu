# 背景自带天赋与隐藏天赋 — 修改计划（修订）

> **For agentic workers:** 按任务顺序实现；勾选跟踪进度。  
> **Design:** `docs/superpowers/specs/2026-07-21-background-builtin-hidden-talents-design.md`

**Goal:**  
在已有「隐藏不进池 + 背景引用自带 + 玩家自选叠加」机制上，收口为：

1. **玩家选角：对隐藏自带零告知**（无名称、无弱提示）  
2. **进游戏主角档案：完整可见**  
3. **创作者编辑：全开**  
4. **悬空引用：软失败 + 诊断日志**  
5. **隐藏项不可进入玩家自选层**

**Architecture:**  
数据与合并逻辑保持纯函数；**展示策略按受众分流**（玩家向导 / 创作者控件 / 模型与日志）。成角落盘始终写完整 `天赋列表`，保密只动 UI。

**Tech Stack:** TypeScript、React、Vitest、NewGame 双端向导、工坊 JSON 数据流。

---

## 现状（已完成，勿重复造）

- [x] `types` / snapshot / `openingConfig` / `stateTransforms` / `customNewGamePresets` 字段透传  
- [x] `utils/backgroundTalentBinding.ts` + `__tests__/backgroundTalentBinding.test.ts`  
- [x] 桌面/移动：可见池过滤、最终 merge 成角、预设直开 merge  
- [x] 创作者：自定义天赋「隐藏」勾选、自定义背景「自带天赋」输入  
- [x] 提交：`feat: 背景自带天赋与隐藏天赋机制`（机制主干）  
- [x] Phase A：玩家选角零告知（去自带展示/确认页仅自选）  
- [x] Phase B：隐藏不得进入玩家自选（toggle/恢复/自定义使用）  
- [x] Phase C：resolve `onMiss` + 成角 warn + 单测  
- [x] Phase D 轻量：DIY 提示含最终天赋列表  
- [ ] Phase E 可选：局内出身标签 / 唯心剑修样例 / 工坊表单  
- [x] Phase F：相关测试通过；提交见 git log

## 与旧计划的差异（本次修订）

| 旧计划/旧实现 | 新约定 |
|---------------|--------|
| 选角展示「背景自带天赋」「· 自带」chips | **删除玩家路径展示** |
| 确认页展示最终列表含自带 | 确认页 **只展示玩家自选** |
| 可弱提示「含隐藏机缘」 | **不要**；暗示只写背景文案 |
| 无 resolve 日志 | 增加 `onMiss` + warn |
| 自定义列表可对隐藏点「使用」 | **禁止**写入 `selectedTalents` |
| 设计写「已获得必须展示」 | 改为 **局内展示；选角保密** |

---

## 实现顺序总览

```text
Phase A  玩家选角保密 UI 收口（桌面 → 移动）     ← 优先，改体验
Phase B  状态护栏（隐藏不得进玩家自选）
Phase C  解析日志 + 单测
Phase D  工坊/DIY 一致性（轻量）
Phase E  可选：局内出身标签 / 内容样例 / 发布校验加强
Phase F  回归 + 提交
```

原则：

- **先关剧透，再补护栏与日志**（玩家可见问题优先）  
- 不改动合并公式，除非护栏需要  
- 桌面/移动同步改，禁止只改一端  

---

### Phase A — 玩家选角零告知

#### Task A1: 桌面向导去剧透

**Files:** `components/features/NewGame/NewGameWizard.tsx`

- [ ] 删除/不渲染已选身份区的「背景自带天赋：…」块  
- [ ] 删除天赋区「xxx · 自带」chips  
- [ ] 确认页「天赋」改为 **仅** `selectedTalents` 名称；去掉「含背景自带」后缀  
- [ ] 自选计数文案改为中性（如「已选 x/3」），**不要**写「背景自带不占名额」——避免暗示存在自带  
  - 若需保留名额说明：用「最多自选 3 个」即可，不提背景  
- [ ] **保留**创作者控件：自定义隐藏勾选、自带天赋输入、自定义列表「隐藏」角标  

**验证：** 人工选带自带的背景，选角全过程 DOM/截图无自带天赋名。

#### Task A2: 移动向导去剧透

**Files:** `components/features/NewGame/mobile/MobileNewGameWizard.tsx`

- [ ] 与 A1 同语义  
- [ ] 确认页与 chips/身份摘要一致  

**验证：** 同 A1。

#### Task A3: 成角落盘不被 UI 改坏

- [ ] 确认 `构建角色数据` / 预设直开仍使用 `合并玩家与背景天赋`  
- [ ] 确认页可以「看起来没天赋」，存档 `天赋列表` 仍含自带  

**验证：** 断点或临时 log 成角 `charData.天赋列表`（测完删除）。

---

### Phase B — 状态护栏

#### Task B1: 隐藏不得进入玩家自选

**Files:**  
- `utils/backgroundTalentBinding.ts`（可选导出）  
- 双端 `toggleTalent` / `addCustomTalent` 后选中逻辑 / 恢复预设过滤  

- [ ] 新增或内联：`过滤玩家可自选天赋` = 非隐藏  
- [ ] `toggleTalent`：若 `t.隐藏 === true`，直接 return（可 dev warn）  
- [ ] 自定义列表「使用」：隐藏项禁用或点击提示「隐藏天赋仅能通过背景自带引用」  
- [ ] 从存储/预设恢复 `selectedTalents` 时剥离隐藏项并 warn  

**验证：** 单测 + 手动点自定义隐藏「使用」无效。

#### Task B2: 换背景语义保持

- [ ] `selectedTalents` 仍只含玩家自选；换背景不写入自带进 selected  
- [ ] 无玩家可见的自带 chips 后，无需「取消自带」逻辑，但 `取消选择天赋` 对「仅自带名」的防护可保留无害  

---

### Phase C — 日志与纯函数

#### Task C1: resolve miss 回调

**Files:** `utils/backgroundTalentBinding.ts`、`__tests__/backgroundTalentBinding.test.ts`

- [ ] `解析背景自带天赋` / `合并玩家与背景天赋` 支持可选 `onMiss`  
- [ ] 默认调用方可：

```ts
onMiss: ({ backgroundName, missing }) => {
  console.warn('[backgroundTalentBinding] 自带天赋未解析', { backgroundName, missing });
}
```

- [ ] 单测：miss 时调用 onMiss 且仍返回已解析项  

#### Task C2: 向导接入 onMiss

**Files:** 双端向导成角路径、必要的 `useMemo` 合并处（避免 render 刷屏：成角时 log 一次即可）

- [ ] 优先在 **成角/确认创建** 时打 miss 日志，不要在每次 render 的 useMemo 里 warn  

---

### Phase D — 工坊 / DIY 一致性（轻量）

#### Task D1: 字段不丢（回归确认）

**Files:** `utils/customNewGamePresets.ts`、`utils/openingConfig.ts`（已基本完成）

- [ ] 补测或手测：导入含 `隐藏`/`自带天赋` 的 mode payload 后，池内仍在  
- [ ] 模块额外规则文案可保留对模型的自带/隐藏说明（**非玩家 UI**）  

#### Task D2: DIY 生成角色提示

**Files:** `NewGameWizard.tsx`（及移动若有对等 DIY）

- [ ] 送给模型的「当前主角」JSON：  
  - 要么用 `最终主角天赋列表`，  
  - 要么自选 + 注明「背景自带由系统注入、勿要求玩家选择」  
- [ ] 避免模型以为角色只有 selectedTalents  

#### Task D3:（可选）工坊导入轻量校验函数

**Files:** 新建 `utils/workshopTalentBackgroundValidate.ts` 或挂在 creativeWorkshop 导入路径

- [ ] 输入 backgrounds + talents → 返回 `{ missingRefs: [...] }`  
- [ ] 导入/保存时 console.warn；**不阻断**导入（与软失败一致）  
- [ ] 可视化编辑器表单 **二期**，本期不强制  

---

### Phase E — 可选增强（可另提交）

| 项 | 说明 | 优先级 |
|----|------|--------|
| 局内「出身」标签 | 档案里自带项小标签，不显示「隐藏」 | P2 |
| 唯心剑修样例 | 隐藏「剑在心中」+ 背景引用；描述自行暗示 | P3 |
| 局中 hydrate 自带 | AI 冲掉天赋列表后按背景补回 | P3 |
| 工坊表单 UI | 可视化编辑隐藏/自带 | P3 |

---

### Phase F — 回归与提交

- [ ] `npx vitest run __tests__/backgroundTalentBinding.test.ts`  
- [ ] 相关 workshop / opening 测试  
- [ ] 人工清单（见下）  
- [ ] 提交建议信息：`fix: 隐藏自带天赋选角零告知与解析诊断`  
- [ ] 按需 `HTTPS_PROXY=... git push upload stream`  

---

## 人工验收清单

### 玩家路径

1. 普通背景、无自带：与现网一致。  
2. 背景带 **隐藏** 自带、不选手动天赋：  
   - 选角/确认 **看不到** 该天赋任何信息；  
   - 创建后主角档案 **看得到** 完整天赋。  
3. 再选 1～3 个可见天赋：档案 = 自选 + 自带；确认页只列自选。  
4. 抽卡/列表：**无**隐藏项。  
5. 换背景：旧自带从存档列表消失（未自选同名时），新自带在进游戏后出现；选角仍不剧透。  

### 创作者路径

6. 自定义可勾隐藏、可填自带引用；保存再读字段在。  
7. 对隐藏自定义点「使用」：不能进入玩家自选。  
8. 自带名写错：开局成功，控制台 warn 含背景名与缺失名。  

### 兼容

9. 无新字段的旧背景/旧存档行为不变。  
10. 叙事约束挂在隐藏自带上时，开局/主剧情仍能注入（现有管线）。  

---

## 明确不做（本期）

- 选角「含隐藏机缘」类系统提示  
- 局内永久不展示隐藏天赋  
- 悟道/口胡/战力评分  
- 自带与自选互斥树  
- 强制替换官方预设内容  

---

## 依赖关系

```text
A1 → A2 → A3
     ↘ B1 → B2
C1 → C2（可与 A 并行，合并前需有）
D1–D2 依赖 A/B 稳定后
E 可选
F 收尾
```

推荐工时切分：

1. **一天内可交付：** Phase A + B + C + F（体验闭环）  
2. **同日或次日：** Phase D  
3. **内容/美化：** Phase E  

---

## 代码触摸面速查

| 区域 | 路径 |
|------|------|
| 设计 | `docs/superpowers/specs/2026-07-21-background-builtin-hidden-talents-design.md` |
| 本计划 | `docs/superpowers/plans/2026-07-21-background-builtin-hidden-talents.md` |
| 纯函数 | `utils/backgroundTalentBinding.ts` |
| 单测 | `__tests__/backgroundTalentBinding.test.ts` |
| 桌面向导 | `components/features/NewGame/NewGameWizard.tsx` |
| 移动向导 | `components/features/NewGame/mobile/MobileNewGameWizard.tsx` |
| 预设/合并 | `utils/customNewGamePresets.ts` |
| 规范化 | `utils/openingConfig.ts`, `hooks/useGame/stateTransforms.ts` |
| 局内档案（只读确认） | `components/features/Character/CharacterProfileCard.tsx`, `MobileCharacter.tsx` |

---

## 给作者的内容约定（写进计划，不写死代码）

- 隐藏自带的「表达」**只**放在背景 `描述`/`效果`（及可选世界观文案）。  
- 系统 **不会** 在选角帮你剧透或帮你打「有隐藏」标签。  
- 进游戏后玩家能在主角天赋里看到真实条目——若剧透时机仍过早，再另做「未悟出」玩法，勿复用 `隐藏` 字段。  
