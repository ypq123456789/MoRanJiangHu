# Requirements Document

## Introduction

本功能对「墨色江湖」的世界生成、世界演化和拍卖行三大系统进行重构。核心目标：

1. **世界势力系统**：在开局生成地图时同步生成各势力（门派、家族、商会、镖局等），作为世界的基础结构，为后续世界演化和拍卖行提供因果来源。
2. **拍卖行物品来源重构**：物品不再从主角剧情正文中提取，而是从世界大事中势力之间的交易、攻杀、缴获、劫镖等事件中自然流出到拍卖行。
3. **预置物品图片库**：常见物品（武器、丹药、材料、功法等）提前生成图片放到 CDN 图床，客户端不需要每次自己等待生图。

## Glossary

- **World_Faction_System（世界势力系统）**: 在世界生成阶段创建的势力结构集合，包含门派、家族、商会、镖局等组织，每个势力拥有名称、类型、实力等级、地盘、库藏物品池等属性
- **Faction（势力）**: 世界中的一个组织实体，可以是门派、家族、商会、镖局、官府机构等
- **Faction_Interaction（势力互动）**: 世界演化过程中势力之间发生的事件，包括交易、攻杀、联盟、劫镖、缴获等
- **Auction_House（拍卖行）**: 游戏内的物品交易市场，玩家可以在此购买由世界事件流出的物品
- **World_Evolution（世界演化）**: 每隔若干回合由 AI 驱动的世界后台推进系统，负责推进势力行动、事件流转和世界镜头
- **Item_Image_Library（物品图片库）**: 预先生成并托管在 CDN 上的常见物品图片集合，按物品类别和品质分类
- **CDN_Image_Registry（CDN 图片注册表）**: 记录所有预置图片 URL 与物品名称/类型/品质映射关系的静态数据结构
- **Faction_Loot_Pool（势力库藏物品池）**: 每个势力拥有的可流通物品集合，当势力间发生攻杀、交易等事件时，物品从该池中流出
- **World_Setup_Prompt（世界生成提示词）**: 用于指导 AI 生成世界观母本的提示词模板，现需扩展以包含势力生成指令
- **Preset_Item_Template（预置物品模板）**: 预先定义的常见物品数据模板，包含名称、类型、品质、描述、CDN 图片 URL 等完整信息

## Requirements

### Requirement 1: 世界势力结构生成

**User Story:** As a 玩家, I want 开局生成地图时同步生成各势力门派家族等组织, so that 世界有真实的势力格局作为后续事件和物品流通的基础。

#### Acceptance Criteria

1. WHEN 世界生成流程执行时, THE World_Faction_System SHALL 为当前世界生成至少 5 个且不超过 15 个 Faction，每个 Faction 包含名称、类型（门派/家族/商会/镖局/官府机构）、实力等级、地盘归属、关系网和初始库藏物品池
2. WHEN 世界生成流程执行时, THE World_Faction_System SHALL 确保生成的 Faction 类型分布合理：至少包含 1 个门派、1 个家族、1 个商会或镖局
3. WHEN 世界生成流程执行时, THE World_Faction_System SHALL 将生成的势力数据持久化到 `世界数据结构` 中的新字段 `势力列表`
4. THE World_Faction_System SHALL 为每个 Faction 生成初始 Faction_Loot_Pool，物品数量为 3-8 件，物品品质与势力实力等级正相关
5. WHEN 世界生成配置中 `宗门密度` 为"稀疏"时, THE World_Faction_System SHALL 生成 5-8 个 Faction；WHEN `宗门密度` 为"密集"时, THE World_Faction_System SHALL 生成 10-15 个 Faction
6. THE World_Faction_System SHALL 为每对相邻势力生成初始关系标签（友好/中立/敌对/从属），关系标签影响后续世界演化中的互动类型

### Requirement 2: 世界演化中的势力互动

**User Story:** As a 玩家, I want 世界大事演化时势力之间会发生交易、攻杀、联盟等互动, so that 世界感觉是活的，物品流通有合理的因果来源。

#### Acceptance Criteria

1. WHEN World_Evolution 执行时, THE World_Evolution SHALL 基于势力关系和当前世界状态生成 Faction_Interaction 事件，每次演化至少产生 1 个势力互动事件
2. WHEN 两个 Faction 关系为"敌对"时, THE World_Evolution SHALL 优先生成攻杀、劫掠、围剿类型的 Faction_Interaction
3. WHEN 两个 Faction 关系为"友好"时, THE World_Evolution SHALL 优先生成交易、联盟、互赠类型的 Faction_Interaction
4. WHEN Faction_Interaction 类型为攻杀或劫掠时, THE World_Evolution SHALL 从败方的 Faction_Loot_Pool 中随机抽取 1-3 件物品标记为"可流通"
5. WHEN Faction_Interaction 类型为交易时, THE World_Evolution SHALL 从双方的 Faction_Loot_Pool 中各抽取 1 件物品标记为"可流通"
6. THE World_Evolution SHALL 将 Faction_Interaction 事件记录到 `世界.进行中事件` 或 `世界.已结算事件` 中，并在事件的 `关联势力` 字段中标注参与势力
7. WHEN Faction_Interaction 导致势力实力变化时, THE World_Evolution SHALL 更新相关 Faction 的实力等级和关系标签

### Requirement 3: 拍卖行物品来源重构

**User Story:** As a 玩家, I want 拍卖行的物品来自世界大事中势力互动的自然流出, so that 拍卖行物品有合理的世界观来源而非凭空出现。

#### Acceptance Criteria

1. WHEN Faction_Interaction 产生"可流通"物品时, THE Auction_House SHALL 将该物品投放到拍卖行，投放时附带来源势力名称、事件名称和来源描述
2. THE Auction_House SHALL 停止从主角剧情正文中提取物品作为拍卖行货源（移除现有的 `从剧情响应构建拍卖行投放参数列表` 中基于正文提取的逻辑）
3. WHEN 拍卖行在售物品数量低于 5 件时, THE Auction_House SHALL 触发一次额外的势力互动事件以补充货源，补充物品数量为 3-6 件
4. THE Auction_House SHALL 保留现有的系统模板池（`模板池`）作为世界初始化阶段的兜底货源，仅在势力系统尚未产出足够物品时使用
5. WHEN 物品从 Faction_Loot_Pool 流出到拍卖行时, THE Auction_House SHALL 根据来源势力实力等级和物品品质计算合理的起拍价和一口价
6. THE Auction_House SHALL 在拍卖品记录的 `来源描述` 字段中包含具体的势力互动事件摘要，格式为"因「{事件名}」从{势力名}流出"

### Requirement 4: 预置物品图片库

**User Story:** As a 玩家, I want 常见物品已经有预先生成好的图片, so that 我不需要每次等待 AI 生图就能看到物品图标。

#### Acceptance Criteria

1. THE Item_Image_Library SHALL 包含至少 50 张预置物品图片，覆盖武器（剑、刀、枪、弓）、防具（甲、衣、护腕）、消耗品（丹药、散剂）、材料（矿石、药材）、秘籍（卷轴、残页）、饰品（玉佩、簪）六大类别
2. THE CDN_Image_Registry SHALL 为每张预置图片维护名称、类型、品质、CDN URL 的映射关系，存储在 `data/presetItemImages.ts` 中
3. WHEN 物品需要显示图标时, THE Item_Image_Library SHALL 优先从 CDN_Image_Registry 中按物品名称精确匹配查找预置图片
4. WHEN 精确匹配未命中时, THE Item_Image_Library SHALL 按物品类型和品质进行模糊匹配，返回同类型同品质的预置图片作为占位图标
5. WHEN CDN_Image_Registry 中存在匹配的预置图片时, THE Item_Image_Library SHALL 直接使用 CDN URL 而不触发 ComfyUI 实时生图流程
6. THE Item_Image_Library SHALL 将所有预置图片托管在 Cloudflare R2 CDN 上，图片格式为 PNG，分辨率为 512x512 或 1024x1024
7. IF CDN 图片加载失败, THEN THE Item_Image_Library SHALL 回退到现有的 ComfyUI 实时生图流程

### Requirement 5: 势力库藏物品池管理

**User Story:** As a 系统, I want 每个势力维护自己的物品库藏池, so that 物品流出有明确的来源且不会无限生成。

#### Acceptance Criteria

1. THE World_Faction_System SHALL 为每个 Faction 维护一个 Faction_Loot_Pool，池中物品数量上限为 20 件
2. WHEN Faction_Loot_Pool 中物品数量低于 3 件时, THE World_Evolution SHALL 在下次演化时为该势力补充 2-5 件新物品，物品品质与势力实力等级正相关
3. THE World_Faction_System SHALL 确保 Faction_Loot_Pool 中的物品品质分布合理：凡品/良品占 40-60%，上品/极品占 30-40%，绝世/传说占 0-10%
4. WHEN 物品从 Faction_Loot_Pool 流出时, THE World_Faction_System SHALL 从池中移除该物品，确保同一物品不会重复流出
5. THE World_Faction_System SHALL 优先使用 Preset_Item_Template 中的预置物品模板填充 Faction_Loot_Pool，确保池中物品有对应的预置图片

### Requirement 6: 世界生成提示词扩展

**User Story:** As a 开发者, I want 世界生成提示词包含势力生成指令, so that AI 在生成世界观时同步输出结构化的势力数据。

#### Acceptance Criteria

1. WHEN 世界生成任务执行时, THE World_Setup_Prompt SHALL 在现有世界观种子提示词中追加势力生成指令块，要求 AI 输出结构化的势力列表
2. THE World_Setup_Prompt SHALL 指定势力输出格式包含：名称、类型、实力等级（1-10）、地盘归属（关联地图层级）、与其他势力的初始关系、代表性物品风格描述
3. THE World_Setup_Prompt SHALL 约束势力生成与世界规模配置（`worldSize`）和宗门密度配置（`sectDensity`）保持一致
4. WHEN 世界生成配置中存在 `worldExtraRequirement` 时, THE World_Setup_Prompt SHALL 将额外要求传递给势力生成逻辑，允许用户自定义势力风格

### Requirement 7: 世界演化提示词扩展

**User Story:** As a 开发者, I want 世界演化提示词包含势力互动指令, so that AI 在推进世界事件时能生成势力间的交互事件并产出可流通物品。

#### Acceptance Criteria

1. WHEN World_Evolution 执行时, THE World_Evolution SHALL 在世界演化上下文中注入当前所有 Faction 的状态摘要（名称、实力、关系、库藏数量）
2. THE World_Evolution SHALL 在世界演化提示词中追加势力互动指令，要求 AI 输出结构化的 Faction_Interaction 事件和流出物品列表
3. THE World_Evolution SHALL 指定势力互动输出格式包含：互动类型、参与势力、事件摘要、流出物品（名称/类型/品质/来源势力）
4. WHEN 势力互动产出物品时, THE World_Evolution SHALL 通过现有的 `tavern_commands` 机制将物品投放到拍卖行，命令格式为 `push 世界.拍卖行待投放物品[]`

### Requirement 8: 数据结构扩展

**User Story:** As a 开发者, I want 世界数据结构支持势力和库藏字段, so that 势力信息能被持久化和跨回合追踪。

#### Acceptance Criteria

1. THE World_Faction_System SHALL 在 `世界数据结构`（`models/world.ts`）中新增 `势力列表: 势力结构[]` 字段
2. THE World_Faction_System SHALL 定义 `势力结构` 接口，包含：ID、名称、类型、实力等级、地盘归属、关系网（Record<势力ID, 关系标签>）、库藏物品池（Faction_Loot_Pool）、当前状态描述
3. THE World_Faction_System SHALL 在 `规范化世界状态` 函数中处理 `势力列表` 字段的规范化，确保旧存档兼容（缺失时默认为空数组）
4. THE World_Faction_System SHALL 在 `创建开场空白世界` 函数中将 `势力列表` 初始化为空数组
