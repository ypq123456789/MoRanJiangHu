# 背景自带天赋与隐藏天赋 Implementation Plan

> **For agentic workers:** 按任务顺序实现；每步可独立验证。勾选框用于进度跟踪。

**Goal:** 实现「天赋可隐藏不进选择池」+「背景通过引用自带天赋池条目」+「玩家自选天赋额外叠加」，并保证桌面/移动开局向导与成角落盘一致。

**Architecture:**  
在类型层扩展字段；在纯函数层实现「可见池过滤 / 引用解析 / 最终天赋合并 / 换背景差分」；向导只调用这些函数。成角写入 `角色.天赋列表` 时使用合并结果，使叙事约束与后续玩法自然生效。玩法层（悟道如何触发）不在本期实现。

**Tech Stack:** TypeScript、React、Vitest、现有 NewGame 向导与创意工坊数据流。

**Design:** `docs/superpowers/specs/2026-07-21-background-builtin-hidden-talents-design.md`

---

## 实现顺序总览

```text
1. 类型与标准化（无 UI）
2. 纯函数核心（可单测）
3. 单测 RED→GREEN
4. 开局向导接入（桌面）
5. 开局向导接入（移动，复用函数）
6. 快照/工坊透传
7. 内容样例可选（唯心剑修可不做或后置）
8. 回归测试 + 构建
```

原则：**先机制与测试，后 UI 与内容**；**桌面与移动共用合并函数**，避免分叉。

---

### Task 1: 类型扩展

**Files:**
- Modify: `types.ts`（`天赋结构`、`背景结构`）
- Modify: `models/system.ts`（`OpeningRuntimeSnapshot.modeBackgrounds` / `modeTalents` 若需带新字段）
- Modify: `utils/openingConfig.ts`（规范化透传 `隐藏`、`自带天赋`、`叙事约束`）

- [ ] **Step 1:** `天赋结构` 增加可选 `隐藏?: boolean`
- [ ] **Step 2:** `背景结构` 增加可选 `自带天赋?: string[]`（名称引用）
- [ ] **Step 3:** 所有「标准化/规范化」路径透传新字段，缺省行为与旧数据一致

**验证：** TypeScript 无新增结构性错误；旧对象仍可赋值。

---

### Task 2: 纯函数核心（新建工具模块）

**Files:**
- Create: `utils/backgroundTalentBinding.ts`（名称可微调，保持单一职责）
- Modify: `utils/customNewGamePresets.ts`（`合并去重天赋` / `合并去重背景` 保留新字段）
- Modify: `hooks/useGame/stateTransforms.ts`（`标准化天赋列表` / `标准化出身背景` 透传）

建议导出：

```ts
// 选择池
过滤可见天赋(talents: 天赋结构[]): 天赋结构[]

// 解析背景引用
解析背景自带天赋(background: 背景结构, catalog: 天赋结构[]): 天赋结构[]

// 成角/展示用最终列表
合并玩家与背景天赋(params: {
  玩家自选: 天赋结构[];
  背景: 背景结构;
  天赋目录: 天赋结构[];
}): 天赋结构[]

// 换背景
更换背景后的天赋列表(params: {
  旧背景: 背景结构;
  新背景: 背景结构;
  当前最终列表: 天赋结构[];  // 或 玩家自选 + 旧最终
  玩家自选名称集合: Set<string>;
  天赋目录: 天赋结构[];
}): { 玩家自选: 天赋结构[]; 最终列表: 天赋结构[] }
```

合并规则：
1. 自带 = `解析背景自带天赋`
2. 最终 = 去重(玩家自选 ∪ 自带)，名称键
3. 换背景：从当前列表去掉「属于旧自带且不在玩家自选集合」的名称，再并上新自带

**验证：** 函数无 UI 依赖，可被 Vitest 直接测。

---

### Task 3: 单元测试（先写失败用例）

**Files:**
- Create: `__tests__/backgroundTalentBinding.test.ts`

用例清单：
- [ ] 隐藏天赋不出现在 `过滤可见天赋` 结果
- [ ] 非隐藏保持可见
- [ ] 背景引用可 resolve 隐藏天赋
- [ ] 引用不存在时跳过且不抛错
- [ ] 玩家自选 + 自带叠加，同名去重
- [ ] 自带不占用「玩家最多 3 个」的计数（若向导有上限辅助函数一并测）
- [ ] 换背景：旧自带移除、新自带加入、玩家自选保留
- [ ] 旧背景无 `自带天赋` 字段时行为兼容

- [ ] **Step 1:** 写测试（实现前 RED 可接受）
- [ ] **Step 2:** 实现 Task 2 后 GREEN

Run: `npx vitest run __tests__/backgroundTalentBinding.test.ts`

---

### Task 4: 开局向导 — 桌面

**Files:**
- Modify: `components/features/NewGame/NewGameWizard.tsx`

- [ ] **Step 1:** `全部天赋选项` 仍可保留「全目录」；新增 `可见天赋选项 = 过滤可见天赋(全部天赋选项)`
- [ ] **Step 2:** 抽卡、列表选择、重 roll **仅使用可见池**
- [ ] **Step 3:** `setSelectedBackground` / 选背景时：用 `更换背景后的天赋列表` 更新玩家自选与展示用最终列表  
  - 状态建议：`selectedTalents` = **仅玩家自选**；展示「已获得」= `合并玩家与背景天赋`
- [ ] **Step 4:** 成角 `构建角色`：写入合并后的 `天赋列表` + 含 `自带天赋` 的 `出身背景`
- [ ] **Step 5:** UI  
  - 背景卡：展示「自带：xxx」  
  - 天赋已选区：背景附带项标注且不可取消  
  - 可选池不出现隐藏项
- [ ] **Step 6:** 自定义背景表单：可编辑 `自带天赋` 名称列表（逗号/多行即可，一期简单）  
  - 自定义天赋表单：增加「隐藏」开关

**注意：** 现有 `useEffect` 会用 `全部天赋选项` 过滤 `selectedTalents`——**不要把仅背景自带的隐藏天赋误过滤掉**；过滤只应作用于玩家自选，或过滤时用全目录而非可见池。

---

### Task 5: 开局向导 — 移动

**Files:**
- Modify: `components/features/NewGame/mobile/MobileNewGameWizard.tsx`

- [ ] 与 Task 4 相同语义，**只调用 Task 2 纯函数**，禁止复制一套 merge 逻辑。
- [ ] 抽卡/列表/成角/换背景与桌面一致。

---

### Task 6: 快照、预设恢复与工坊透传

**Files:**
- Modify: `utils/customNewGamePresets.ts`（提取模块背景/天赋时保留字段；构建额外规则文案可提一句自带）
- Modify: `utils/openingConfig.ts` / runtime snapshot 规范化
- Modify: 若有工坊 JSON 编辑默认 schema，允许新字段 round-trip

- [ ] 模式包 `payload.backgrounds[].自带天赋`、`payload.talents[].隐藏` 导入后进模式池
- [ ] 快速重开/自定义开局预设恢复后，背景自带仍生效
- [ ] 不要求本期做完整工坊可视化编辑器，但**不得在保存时丢字段**

---

### Task 7:（可选，独立提交）内容样例

**Files:**
- Optional: `data/presets.ts` 或工坊示例模块

仅在机制稳定后：
- 增加隐藏天赋「剑在心中」（含可选 `叙事约束`）
- 增加背景「唯心剑修…」且 `自带天赋: ['剑在心中']`

**可不与机制同 PR**，避免内容争议阻塞机制。

---

### Task 8: 回归与收尾

- [ ] `npx vitest run __tests__/backgroundTalentBinding.test.ts`
- [ ] 相关：`__tests__/openingCompanion.test.ts`、custom preset / workshop 相关若有断裂则修
- [ ] `npm run build`（或项目惯用构建）确认通过
- [ ] 中文说明：机制行为 + 非目标（玩法未做）

---

## 明确不做（本期）

- 悟道触发器、AI 打分、战斗力数值突破
- 背景自带与玩家天赋的互斥树
- 强制全服替换现有预设内容

## 依赖关系

```text
Task1 → Task2 → Task3
              ↘ Task4 → Task5
              ↘ Task6
Task3 通过后才建议合并 UI
Task7 可选，依赖 Task1–6
Task8 收尾
```

## 验收清单（人工）

1. 选无自带的普通背景：与现网一致。  
2. 选自带背景、不点任何天赋：成角仍有自带。  
3. 再选 1～3 个可见天赋：全部保留 + 自带。  
4. 隐藏天赋不在池中出现。  
5. 换到另一背景：旧自带消失（若未自选同名），新自带出现。  
6. 自带含 `叙事约束` 时，开局/主剧情 system 侧仍能注入（走现有管线）。
