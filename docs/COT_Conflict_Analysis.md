# COT 提示词冲突与优化分析清单

## 1. 核心冲突分析

### 1.1. 标签结构与输出顺序冲突
- **COT (cot.ts)**: 要求 `<thinking>` -> `<正文>` -> `<命令>`。
- **Format (format.ts)**: 推荐顺序 `<thinking>` -> `<正文>` -> `<短期记忆>` -> `<命令>` -> `<disclaimer>` -> `<行动选项>` -> `<动态世界>`。
- **VariableCot (variableCot.ts)**: 仅输出 `<thinking>` -> `<说明>` -> `<命令>` (这是专门用于变量校准的，与主COT不同，但需要明确区分场景)。
- **StoryPlanUpdate/HeroinePlanUpdate**: 仅输出 `<thinking>` -> `<说明>` -> `<命令>`。
- **冲突点**: 主COT未明确包含 `<短期记忆>`、`<行动选项>`、`<动态世界>` 的输出位置要求，但 `format.ts` 和 `rules.ts` 中又有相关要求。
- **优化建议**: 统一主COT的输出结构定义，明确包含所有可能输出的标签，并与 `format.ts` 保持一致。

### 1.2. 判定 (Judge) 处理冲突
- **COT (cot.ts)**: Step14 提到 `<judge>` 只能写在 `<正文>` 内对应位置。Step7/Step11/Step13 都有提及判定。
- **CotJudge (cotJudge.ts)**: 详细定义了 `<judge>` 的内部结构和 Step0-Step8。
- **Format (format.ts)**: 明确 `<judge>` 嵌入在 `<正文>` 内部，且正文判定行只保留结果。
- **Polish (cotPolish.ts)**: 要求润色时保留 `<judge>` 内容但不输出，或者说润色范围只在正文层。Step1 提到“判定保真”。
- **冲突点**: 主COT对 `<judge>` 的生成时机和内容的描述较为简略，而 `cotJudge.ts` 非常详细。主COT Step14 说“只输出本项目允许的标签”，容易让人误以为 `<judge>` 是顶层标签，但 `format.ts` 明确它是内嵌标签。
- **优化建议**: 主COT应明确引用 `cotJudge.ts` 的逻辑，并强调 `<judge>` 是内嵌于 `<正文>` 的，而非顶层标签。

### 1.3. 命令 (Command) 生成冲突
- **COT (cot.ts)**: Step10/Step11 负责变量修改决策和命令预演。Step14 要求最终落地。
- **Rules (rules.ts)**: 详细定义了数据同步协议，包括可写根路径、操作符等。
- **VariableCot (variableCot.ts)**: 变量校准环节有自己的一套命令生成逻辑（FIX/add/set/push/delete），且明确说“变量校准自身不主动新增规划池相关命令”。
- **StoryPlanUpdate/HeroinePlanUpdate**: 独立生成 `剧情.*` 和 `女主剧情规划.*` 的命令。
- **冲突点**: 主COT生成的命令可能与后续独立链路（规划更新、变量校准）生成的命令重叠或冲突。主COT Step11 试图覆盖所有变量修改，但实际上规划类变量现在有专门的链路处理。
- **优化建议**: 主COT应聚焦于“正文即时发生”的变量变化（状态、物品、好感等），而将复杂的规划类变量（剧情规划、女主规划）的详细维护留给专门的链路，或者在COT中明确界定哪些是主COT必须处理的（如触发了某个事件），哪些是后台链路处理的。

### 1.4. 女主规划 (Heroine Plan) 冲突
- **CotHeroine (cotHeroine.ts)**: 包含完整的女主规划思考流程。
- **HeroinePlanUpdate (heroinePlanUpdate.ts)**: 独立的补丁更新链路。
- **冲突点**: 主COT（如果是女主版）和独立更新链路都在处理女主规划。如果主COT已经处理了，独立链路是否还需要？或者两者职责如何划分？
- **优化建议**: 明确主COT负责“正文推进带来的即时变化”（如好感变化、阶段突破），而独立链路负责“结构维护、排期清理、未来规划”。

### 1.5. 世界演变 (World Evolution) 冲突
- **COT (cot.ts)**: Step9 提到“世界预检”，Step10/11 涉及世界变量修改。
- **WorldEvolutionCot (worldEvolutionCot.ts)**: 独立的后台世界演变思考。
- **冲突点**: 主COT Step10 包含 `世界` 变量修改，而 `worldEvolutionCot.ts` 是专门处理这个的。
- **优化建议**: 主COT应只处理与主角直接交互产生的世界变化（如杀人、破坏、获得物品），而将宏观世界演变留给后台链路。

### 1.6. 写作要求冲突
- **Style (style.ts)**: 古龙风，短句，留白。
- **Polish (cotPolish.ts)**: 润色提示词，也有自己的风格要求（防Gemini八股文等）。
- **NoControl (noControl.ts)**: 严格限制不代写玩家。
- **Perspective (perspective.ts)**: 人称限制。
- **冲突点**: `cotPolish.ts` 的 Step7 语言打磨与 `style.ts` 的要求大部分一致，但侧重点不同。主COT Step13 “一致性总复核” 需要涵盖这些写作要求。
- **优化建议**: 在主COT中显式引用 `style.ts` 和 `noControl.ts` 的核心要求作为检查点。

## 2. 详细冲突清单与优化点

| 文件 | 冲突/问题描述 | 优化方案 |
| :--- | :--- | :--- |
| **prompts/core/cot.ts** | **Step14 最终落地**: 未明确包含 `<短期记忆>`、`<行动选项>`、`<动态世界>` 等标签，与 `format.ts` 不一致。 | 更新 Step14，列出所有可能的输出标签，并引用 `format.ts` 的顺序。 |
| **prompts/core/cot.ts** | **Step10/11 变量修改**: 试图处理所有变量，未区分主COT职责与后台链路（规划、世界演变）职责。 | 明确主COT聚焦于“即时、可见、主角相关”的变量变化。对于规划和世界后台演变，仅做触发或关键节点更新。 |
| **prompts/core/cot.ts** | **Step9 世界/剧情结构**: 与 `storyPlanUpdate.ts` 和 `worldEvolutionCot.ts` 功能重叠。 | 调整 Step9，侧重于“确认当前回合对结构的影响”，而非全量维护。 |
| **prompts/core/cot.ts** | **缺少 `<judge>` 内嵌说明**: 容易误导模型将 `<judge>` 输出为顶层标签。 | 在 Step14 或 Step7 中明确 `<judge>` 必须内嵌于 `<正文>`。 |
| **prompts/core/cotHeroine.ts** | **Step10/11 命令生成**: 与 `heroinePlanUpdate.ts` 职责重叠。 | 明确主COT处理即时互动带来的规划变更，后台链路处理结构性维护。 |
| **prompts/core/cotPolish.ts** | **Step1 事实保真**: 要求保留判定行，但 `format.ts` 要求正文判定行只保留结果。 | 确认 `cotPolish.ts` 的 Step1 与 `format.ts` 的要求是否一致（看起来是一致的，都是保留结果行，不保留思考块）。需要确保润色时不丢失判定行。 |
| **prompts/runtime/variableCot.ts** | **Step9 命令合法性**: 提到“不主动新增规划池相关命令”，这与主COT的 Step10/11 形成互补，需确保主COT确实生成了必要的规划命令。 | 确认主COT Step11 覆盖了必要的规划命令生成，否则变量校准会漏掉这些。 |
| **prompts/core/format.ts** | **标签顺序**: 定义了完整的标签顺序，但主COT未完全遵循。 | 将 `format.ts` 的标签顺序要求同步到主COT Step14。 |

## 3. 优化计划

1.  **更新 `prompts/core/cot.ts` (主COT)**:
    *   **Step9**: 明确与后台链路的边界。
    *   **Step10/11**: 聚焦即时变量，对规划/世界变量做“触发式”更新。
    *   **Step14**: 补全标签列表（`<短期记忆>`, `<行动选项>`, `<动态世界>`），明确 `<judge>` 内嵌位置，引用 `format.ts` 顺序。
    *   **Step7**: 强化 `<judge>` 调用说明。

2.  **更新 `prompts/core/cotHeroine.ts` (女主COT)**:
    *   同步主COT的结构调整（标签、命令边界）。
    *   明确与 `heroinePlanUpdate.ts` 的协作关系。

3.  **更新 `prompts/core/cotOpening.ts` (开局COT)**:
    *   检查标签输出是否完整（开局也需要 `<短期记忆>` 等）。
    *   确保初始化命令与 `rules.ts` 一致。

4.  **检查 `prompts/core/cotShared.ts`**:
    *   确保共享守则中关于“信息域”和“收口”的描述与各COT一致。

5.  **检查 `prompts/core/cotPolish.ts`**:
    *   确保润色过程不会误删 `<judge>` 思考块（如果输入包含）或判定行。

## 4. 执行步骤

1.  修改 `prompts/core/cot.ts`。
2.  修改 `prompts/core/cotHeroine.ts`。
3.  修改 `prompts/core/cotOpening.ts`。
4.  (可选) 微调 `prompts/core/cotShared.ts` 如果需要。

请确认是否同意此优化方案。
