# COT 提示词修正方案

## 1. 目标

本方案只解决一类问题：

- 同一条链路里，多个提示词对同一个规则给出了不同要求
- 某些提示词文本已经定义了规则，但运行时根本没有按该规则注入
- 主剧情 COT、开局 COT、女主 COT、判定 COT、世界演变 COT、变量校准 COT 之间职责边界不清，导致重复维护或互相打架

修正目标不是“把提示词写得更长”，而是统一协议、减少歧义、让运行时真实生效。

---

## 2. 修正原则

### 2.1 单一真源

同一类规则只能有一个主定义：

- `Step` 编号规范，只能由对应 COT 本体定义
- 顶层标签规范，只能由 `format.ts` 定义
- 命令合法性，只能由 `rules.ts` 定义
- 判定行格式，只能由 `format.ts` 定义
- 女主规划结构，只能由 `heroinePlan.ts` 和 `heroinePlanCot.ts` 定义
- 独立规划补丁输出，只能由规划独立链路定义

其余提示词只能“引用”或“接入”，不能再发明第二套口径。

### 2.2 主链与子链分层

要把“主剧情生成”与“后台维护”分开：

- 主剧情 COT 负责正文回合的即时承接
- 判定/战斗 COT 负责 `<judge>` 内部思考
- 变量校准 COT 负责补漏、纠错、最小修正
- 世界演变 COT 负责后台世界层推进
- 规划分析 / 规划更新链路负责 `剧情.*`、`女主剧情规划.*` 的结构维护

这样可以避免同一回合里，主 COT 和后台链路都去重写同一个结构池。

### 2.3 文本规则必须和运行时接线一致

如果运行时永远只注入 `core_cot`，那就不能把“女主主 COT 变体”当成已生效规则。

因此每一条文档级规则都要区分：

- 文本已定义但未接线
- 文本已定义且已接线
- 文本已接线但会被运行时二次改写

---

## 3. 已确认问题与修正方案

## 3.1 Step 编号不一致

### 问题

- 主剧情 COT 使用 `Step0~Step14`
- `剧情推动协议` 仍写“沿用主 COT 的 `Step0~Step13`”
- 女主主 COT 使用 `Step0~Step14`
- 女主规划思考协议使用 `Step0~Step13`
- 开局 COT 使用 `Step0~Step5`
- 开局流程又会额外注入 `剧情推动协议`

### 为什么必须修

这是最高优先级问题之一。

因为模型在同一上下文里同时收到两个不同步数要求时，最容易出现：

- 漏 Step
- 合并 Step
- 乱序
- 主链按 15 步写，子协议按 14 步验

这会直接破坏思考协议的稳定性。

### 修法

统一采用以下策略：

- `cot.ts` 保持主剧情主链 `Step0~Step14`
- `cotHeroine.ts` 保持女主主链 `Step0~Step14`
- `cotOpening.ts` 保持开局链 `Step0~Step5`
- `story.ts` 不再写“沿用主 COT 的 Step0~Step13”，改为“本协议不定义新的 Step 编号，只作为主链对应步骤的补充检查项”
- `heroinePlanCot.ts` 不再与女主主 COT 抢主链编号，改写为“专项审计检查项”，或明确它仅用于独立链路时才使用 `Step0~Step13`

### 涉及文件

- `prompts/core/cot.ts`
- `prompts/core/cotHeroine.ts`
- `prompts/core/cotOpening.ts`
- `prompts/core/story.ts`
- `prompts/core/heroinePlanCot.ts`

---

## 3.2 顶层标签定义不统一

### 问题

- 主 COT 只强调先 `<thinking>` 再 `<正文>`
- `format.ts` 定义了完整顶层结构：`<thinking>`、`<正文>`、`<短期记忆>`、`<命令>`、`<disclaimer>`、`<行动选项>`、`<动态世界>`
- 独立链路又分别要求只输出 `<thinking> + <说明> + <命令>`

### 为什么必须修

这里不能靠“默认理解”。

如果主 COT 不承认 `format.ts` 是标签真源，模型会在正文链里误判：

- `<短期记忆>` 是否必填
- `<行动选项>` 是否必须输出
- `<动态世界>` 是否应作为顶层标签
- `<judge>` 是否是顶层标签

### 修法

- `format.ts` 作为主剧情输出标签唯一真源
- `cot.ts`、`cotHeroine.ts`、`cotOpening.ts` 的最终落地段只引用 `format.ts`，不再自行定义另一套顶层标签逻辑
- 独立链路继续保留各自的三段式输出，但明确标注“仅用于独立 API / 后台链路，不适用主剧情正文生成”

### 涉及文件

- `prompts/core/format.ts`
- `prompts/core/cot.ts`
- `prompts/core/cotHeroine.ts`
- `prompts/core/cotOpening.ts`
- `prompts/runtime/storyPlanUpdate.ts`
- `prompts/runtime/heroinePlanUpdate.ts`
- `prompts/runtime/planningAnalysis.ts`
- `prompts/runtime/variableCot.ts`
- `prompts/runtime/worldEvolutionCot.ts`

---

## 3.3 `<judge>` 定义混乱

### 问题

- `format.ts` 把 `<judge>` 放进可选标签列表
- 同一个文件又规定 `<judge>` 只能作为 `<正文>` 内的判定子结构
- 主 COT 只说“需要判定时在正文对应位置准备 `<judge>`”
- 判定 COT / 战斗 COT 才是 `<judge>` 的真正内部规则

### 为什么必须修

`<judge>` 一旦被模型误认为顶层标签，会直接造成输出结构错误。

这是典型的“同名标签、不同层级”的协议歧义。

### 修法

- `format.ts` 中把 `<judge>` 从“顶层可选标签”说明里剥离
- 明确写成：`<judge>` 不是顶层标签，只能作为 `<正文>` 内部子结构
- `cot.ts`、`cotHeroine.ts` 只负责何时调用 `<judge>`
- `cotJudge.ts`、`cotCombat.ts` 只负责 `<judge>` 内部思考格式

### 涉及文件

- `prompts/core/format.ts`
- `prompts/core/cot.ts`
- `prompts/core/cotHeroine.ts`
- `prompts/core/cotJudge.ts`
- `prompts/core/cotCombat.ts`

---

## 3.4 判定行格式不一致

### 问题

- `format.ts` 规定结果字段必须后置：`｜结果=...`
- `cotJudge.ts` 示例把 `结果` 放在前面
- `cotCombat.ts` 示例也把 `结果` 放在前面

### 为什么必须修

这是实际输出层面的硬格式冲突。

不统一的话，模型即使“理解了判定逻辑”，也会在渲染格式上不稳定。

### 修法

- 以 `format.ts` 为唯一判定行格式真源
- `cotJudge.ts` 和 `cotCombat.ts` 的所有示例改为完全跟随 `format.ts`
- 以后判定协议里只允许讲“计算过程”和“结果窗口”，不再重新定义正文判定行顺序

### 涉及文件

- `prompts/core/format.ts`
- `prompts/core/cotJudge.ts`
- `prompts/core/cotCombat.ts`

---

## 3.5 `行动选项` 与 `NoControl` 冲突

### 问题

- `actionOptions.ts` 规定：看到本提示词就必须输出 `<行动选项>`
- `noControl.ts` 又规定：不要输出额外玩家选择、选项菜单、分支指令

### 为什么必须修

这不是“风格偏好不同”，而是两条并列硬规则互斥。

如果不拆开口径，模型会在两种行为之间摇摆：

- 有时输出行动选项
- 有时因为 `NoControl` 压制而不输出

### 修法

建议把两者职责拆开：

- `NoControl` 禁止的是正文内部的代写式菜单、A/B/C、系统引导式选择
- `actionOptions.ts` 定义的是独立顶层标签 `<行动选项>`

因此应在 `noControl.ts` 明确排除：

- 若系统已显式注入 `<行动选项规范>`，允许在正文之外输出独立 `<行动选项>` 标签
- 但正文内部仍禁止生成选择菜单

### 涉及文件

- `prompts/writing/noControl.ts`
- `prompts/core/actionOptions.ts`
- `prompts/core/format.ts`

---

## 3.6 主剧情、规划维护、变量校准三者职责重叠

### 问题

- 主 COT 仍在直接推导大量 `剧情.*`
- 女主主 COT 仍在直接推导大量 `女主剧情规划.*`
- 独立规划分析 / 规划更新链路又在同回合后置修补同一批路径
- 变量校准 COT 也会审规划池断档

### 为什么必须修

这会导致：

- 主链和后台链路重复维护同一路径
- 同一回合里先写、后修、再纠错
- 结构池变成“谁都能改”

长期看会让提示词越来越长，但行为越来越不稳定。

### 修法

明确分层：

- 主剧情 COT
  - 只负责正文即时发生、必须当回合同步的结构承接
  - 对 `剧情.*` 只做最小即时承接，不做全量维护
  - 对 `女主剧情规划.*` 只在确有正文事实时落最小必要承接
- 统一规划分析 / 规划更新链路
  - 负责结构池清理、迁移、补位、失效修复
  - 负责保持三层规划、排期、镜头、变量组完整性
- 变量校准链路
  - 不主动重写规划池
  - 只在发现明显错写、越权、命令与正文冲突时修正

### 涉及文件

- `prompts/core/cot.ts`
- `prompts/core/cotHeroine.ts`
- `prompts/runtime/planUpdateReference.ts`
- `prompts/runtime/planningAnalysis.ts`
- `prompts/runtime/storyPlanUpdate.ts`
- `prompts/runtime/heroinePlanUpdate.ts`
- `prompts/runtime/variableCot.ts`

---

## 3.7 世界分流规则前后不一致

### 问题

- 主剧情共享守则要求遇到新地点时补 `push 世界.地图 / 世界.建筑`
- 变量校准也要求补这些锚点
- 但运行时在世界分流开启时，又强制主剧情 `<命令>` 不得写 `世界.*`

### 为什么必须修

这会让“地图坐标锚点”在文本上是必写，在运行时又变成禁写。

结果就是模型无法稳定判断：

- 该不该当回合写世界锚点
- 是写在 `<命令>` 还是只写 `<动态世界>`

### 修法

统一成两种模式：

- 非世界分流模式：
  - 主剧情允许写 `世界.地图 / 世界.建筑`
- 世界分流模式：
  - 主剧情不写 `世界.*`
  - 主剧情只输出 `<动态世界>` 线索
  - 世界演变链路负责把地点锚点真正落到 `世界.*`

然后把 `cotShared.ts`、`variableCot.ts` 的坐标锚点条款改成“按当前模式分流执行”。

### 涉及文件

- `prompts/core/cotShared.ts`
- `prompts/runtime/variableCot.ts`
- `hooks/useGame/promptRuntime.ts`
- `prompts/core/format.ts`
- `prompts/core/worldEvolutionStory.ts`
- `prompts/runtime/worldEvolution.ts`

---

## 3.8 `<动态世界>` 输出顺序不一致

### 问题

- `format.ts` 推荐把 `<动态世界>` 放到最后
- 运行时世界分流补丁要求放在 `<命令>` 后、`<disclaimer>` 前

### 为什么必须修

标签顺序如果不唯一，模型就会在启用世界分流后输出不稳定。

### 修法

只能保留一个顺序。

建议以运行时真实补丁规则为准：

- `<thinking>`
- `<正文>`
- `<短期记忆>`
- `<命令>`
- `<动态世界>`
- `<disclaimer>`
- `<行动选项>`

或者反过来统一改运行时补丁，但只能二选一。

由于运行时已经在强制补丁，优先建议把 `format.ts` 改成跟运行时一致。

### 涉及文件

- `prompts/core/format.ts`
- `hooks/useGame/promptRuntime.ts`

---

## 3.9 女主 COT 变体已定义但未真实接线

### 问题

- 仓库中已存在：
  - `core_cot_heroine_variant`
  - `core_cot_heroine_ntl_variant`
- 内置世界书也有对应槽位
- 但 `promptRuntime.ts` 当前只固定选择 `core_cot`

### 为什么必须修

如果文本变体从未进入主流程，那么继续优化这些文本不会产生真实收益。

先接线，再优化，才有意义。

### 修法

修改 COT 选择逻辑：

- 默认：`core_cot`
- 启用女主规划：`core_cot_heroine_variant`
- 启用女主规划且风格为 NTL：`core_cot_heroine_ntl_variant`

同时保留开局流程对 `core_cot` 的开局覆盖逻辑。

### 涉及文件

- `hooks/useGame/promptRuntime.ts`
- `hooks/useGame/systemPromptBuilder.ts`
- `utils/worldbook.ts`

---

## 3.10 开局链路与主剧情补充协议混用过深

### 问题

- 开局 COT 有自己独立 6 步
- 开局流程又注入 `core_story`
- `core_story` 仍按主剧情回合口径写

### 为什么必须修

开局链路是第 0 回合初始化，不应被主剧情回合的结构维护协议直接污染。

### 修法

两种可选方案：

- 方案 A：保留 `core_story` 注入，但把它改为“开局可兼容引用条款”，不再引用主 COT 步数
- 方案 B：开局流程不直接注入 `core_story`，而是拆一份“开局专用剧情初始化协议”

建议优先做 A，改动小。

### 涉及文件

- `prompts/core/story.ts`
- `hooks/useGame/openingStoryWorkflow.ts`
- `prompts/runtime/opening.ts`

---

## 4. 推荐执行顺序

## Phase 1：先修协议真源

先统一最容易引发硬冲突的文件：

1. `prompts/core/format.ts`
2. `prompts/core/cot.ts`
3. `prompts/core/cotHeroine.ts`
4. `prompts/core/story.ts`
5. `prompts/core/cotJudge.ts`
6. `prompts/core/cotCombat.ts`
7. `prompts/writing/noControl.ts`

目标是先把：

- Step 编号
- 标签层级
- 判定格式
- 行动选项边界

全部统一。

## Phase 2：再修职责边界

然后再动：

1. `prompts/runtime/variableCot.ts`
2. `prompts/runtime/planUpdateReference.ts`
3. `prompts/runtime/planningAnalysis.ts`
4. `prompts/runtime/storyPlanUpdate.ts`
5. `prompts/runtime/heroinePlanUpdate.ts`
6. `prompts/core/cotShared.ts`

目标是统一：

- 主剧情即时承接
- 后台规划维护
- 世界分流
- 变量校准补漏

## Phase 3：最后修运行时接线

最后处理真实生效链路：

1. `hooks/useGame/promptRuntime.ts`
2. `hooks/useGame/systemPromptBuilder.ts`
3. `hooks/useGame/openingStoryWorkflow.ts`

目标是确保：

- 女主 COT 变体能真实进主流程
- 开局 COT 与开局补充协议不互相冲突
- 世界分流补丁与文本协议一致

---

## 5. 本方案产出要求

按本方案执行时，每改一类规则，都应同时完成以下检查：

- 文本定义是否只剩一套口径
- 运行时是否真的会注入该版本
- 是否与已有补丁逻辑冲突
- 是否会影响开局链、主剧情链、独立后台链

如果只改提示词文本、不改接线，那么该修改只能算“文档层修正”，不能算“行为层修正”。

---

## 6. 结论

本次修正不建议一次性“大重写全部 COT”。

更稳的做法是：

1. 先统一协议真源
2. 再切职责边界
3. 最后修运行时接线

这样可以避免提示词越改越多，但冲突只是从明面转移到隐性链路里。
