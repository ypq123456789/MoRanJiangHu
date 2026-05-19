# MoRanJiangHu 代理协作说明（中文版）

## AGENTS 更新输出规则

- 每次更新 `AGENTS.md` 时，都要在同一回复里给用户提供中文版本或中文摘要。
- 不能只说文件改了；必须展示中文可读内容。
- `AGENTS.zh-CN.md` 必须和 `AGENTS.md` 同步维护。以后更新其中任意一个文件，都要在同一次任务里同步更新另一个文件，保证中文版不过期。

## 客户更新日志规则

- 每次有实质性更新后，都要提供一段简短的中文客户更新说明。
- 内容应适合直接转发给客户。
- 优先说明客户能感知到的收益，少写内部实现细节。
- 每次发布新版本后，给客户的更新日志必须附带主域名：`https://msjh.bacon159.pp.ua/`。

## 管理端/内部更新日志规则

- 管理端、监控页、内部运维、后台管理控制台相关变更，默认不要写入面向客户的 release notes 或公开更新日志，除非用户明确要求。
- 公开更新日志应聚焦玩家可感知的玩法、应用行为、APK、同步或客户支持变化。
- 管理端相关修复可以随版本提交和部署，但只在最终工程总结里私下说明，不写进客户可转发更新说明。

## 发布提交备份规则

- 每次发布新版本时，必须先更新版本号，再同步 release 元数据，然后才能构建、上传、部署或验证。
- 每次发布新版本时，必须先同步 release 版本，再创建一个 git commit 作为发布备份。
- 每次发布或更新 release 版本时，结束任务前必须把发布备份 commit 推送到 GitHub。
- 如果 GitHub push 失败，必须明确说明阻塞原因、本地 commit hash，以及仍需推送的分支和 remote。
- 发布备份 commit 应包含本次版本相关的源码、配置、release 元数据和客户可见文档变更。
- 不要把本地调试产物、临时浏览器 trace、生成截图、测试结果目录、日志、APK/AAB 二进制等机器本地文件放进发布备份，除非用户明确要求归档。
- 如果无法提交 release，必须说明阻塞原因，并列出仍需备份的文件。

## 发布部署覆盖规则

- 每次发布新版本，结束任务前必须验证所有公开发布入口。
- 在最终公开部署或上传前，必须把 `releasePublishedAt` 刷新为当前真实本地时间，然后重新运行 `npm run release:sync`，再构建、上传、部署或验证。展示的发布时间必须代表真正最终发布时刻，不能使用前面版本准备时的时间。
- R2 上传、Wrangler 部署、APK 下载验证、HTTPS 端点检查等外部命令必须带明确超时。如果包装命令可能在部分成功后卡住，要拆成上传、部署、验证等更小步骤，并逐一确认公开产物。
- 本机执行 Cloudflare/Wrangler 命令时，优先清空代理环境变量后再试。例如 POSIX shell 使用 `env HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" npm run worker:deploy`，PowerShell 使用等价方式把 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 设为空后再执行。这样可以避免 Wrangler 上传或部署命令被本地代理卡住。
- 必须检查 `release.config.json` 中的网站 URL、APK 下载 URL、更新 manifest URL，以及所有文档中列出的备份域名或指南 URL。
- 当前域名记忆：主站是 `https://msjh.bacon159.pp.ua/`；备站是 `https://msjh.bacon.de5.net/`。
- 对当前项目，每次都要确认主站 `https://msjh.bacon159.pp.ua/` 和备站 `https://msjh.bacon.de5.net/` 是否部署了与 APK/update manifest 相同的版本。
- 关键要求：部署后必须验证主站和备站都显示：
  - 与 release 匹配的正确版本号。
  - 准确的发布时间 `releasePublishedAt`。
  - 如果版本号或时间戳不正确，说明部署未完成。
- 如果 release 已上传到 R2 但网站没有部署，必须在同一发布流程里部署 Cloudflare Worker/site，或清楚说明不能部署的原因。
- 部署后必须通过 HTTPS 验证线上站点和 manifest，不能只看本地构建输出。
- 每次部署并推送 release backup 后，都要显式检查 `ypq123456789/MoRanJiangHu` 的 GitHub Actions CI，而不是 upstream 仓库。确认最新推送 commit 的 `CI` run 成功；如果失败，要拉取日志，能修则修，不能修要在结束前报告阻塞。

## 禁止自动部署规则

- 没有用户明确指令时，绝不部署。
- 只有用户明确说“部署”“发布”“上线”等含义时，才可以运行 `npm run worker:deploy`。
- 修 bug 或改代码时，只做本地构建（`npm run build`）和测试，不部署。
- 如果用户只说“修改”“修复”“改”，不要部署。
- 只有用户说“发布”“部署”“上线”时才部署。

## 部署报告规则

- 每次成功部署后，必须立刻报告：
  - 版本升级：“将版本号从 X 升级到 Y”。
  - 部署时间：“部署时间是当前时间 YYYY-MM-DD HH:MM”。
- 每次部署都必须升级版本号，并在构建前把 `releasePublishedAt` 更新为真实部署时间。
- 禁止无版本号升级的热修部署：每次部署都必须递增版本号，不能用同一个版本号反复部署。
- 如果已经发生多次未升级版本号的热修部署，也要报告部署时间，并说明版本号没有升级。

## 纯文档部署规则

- 如果本次唯一有意义的变更是文档或静态指南内容，并且用户明确要求“不更新版本号也部署”，不要提升 `versionName`、`versionCode` 或 `releasePublishedAt`。
- 这个例外只适用于纯文档变更，例如 `public/cnb-comfyui-guide.html`、更新日志文案、README/AGENTS 更新，或其它不改变应用行为、APK 内容、更新清单、运行时代码的客户指南文字。
- 纯文档部署仍然要先本地构建，再清空代理变量部署网站/Worker，并通过 HTTPS 验证公开指南页已经更新；最终报告里要说明版本号因为纯文档部署而有意保持不变。
- 以后用户明确要求部署纯文档改动时，默认按这条规则执行。

## 本地文件引用规则

- 不要使用本地文件 Markdown 链接或 URL 链接。
- 只使用反引号包裹的纯文本引用，例如 `@components/layout/TopBar.tsx:195`。
- 路径统一使用 `/`，包括 Windows 路径。
- 正常 prose 解释即可；文件引用单独写成 `@...` 形式。

## 本地 UI 调试路径

当目标是 UI 验证、布局校验、移动端顶栏检查、APK/Web 一致性检查时，不要先卡在模型或 API 配置上。优先从已有存档进入真实游戏界面。

## UI 加载背景规则

- Loading、lazy-render、suspense、“卷轴展开中”、骨架屏、侧边详情占位状态都不能使用黑色或近黑背景。
- 使用浅色纸张/羊皮纸质感、暖色半透明遮罩，或当前主题的 surface。
- 这条尤其适用于右侧详情面板，以及真实数据加载前的临时框架。
- 如果 fallback 需要对比度，优先改善边框、阴影和文字颜色；不要回到黑色弹窗或黑色卡片背景。

### 首选路径：通过 UI 导入现有存档

1. 使用 `npm run build` 构建 Web 资源。
2. 用 `python -m http.server 4173 -d dist` 启动本地预览。
3. 打开 `http://127.0.0.1:4173`。
4. 如果仓库里已有可复用存档包，优先使用 `.tmp-release-assets/WuXia_Save_Data.zip`。
5. 进入存读档流程，在 `@components/features/SaveLoad/SaveLoadModal.tsx` 中通过 UI 导入 zip。
6. 加载手动或自动存档，确认应用进入 `view === 'game'`。

优先使用这条路径，因为它覆盖用户真实会触发的导入和读档流程。

### 如果首页读档入口被禁用

首页可能在 IndexedDB 已有至少一个存档前禁用读档入口。此时使用以下 workaround：

1. 首选 workaround：先把存档导入 IndexedDB，然后刷新页面，用正常读档流程进入。
2. 临时浏览器 workaround：在 Playwright 或浏览器 devtools 中临时移除首页读档/继续按钮的 disabled 状态，打开存读档弹窗，再通过 UI 导入存档包。

不要为了绕过这个状态提交产品代码变更，除非用户明确要求改产品行为。

### 兜底路径：直接向 IndexedDB 注入存档

如果 UI 导入被阻塞或太慢，可以直接向 IndexedDB 写入一个存档 payload。

已知本地数据库信息：

- 数据库名：`WuxiaGameDB`
- 存档 store：`saves`
- 设置 store：`settings`
- 图片 store：`image_assets`
- 当前 IndexedDB version 定义在 `@services/dbService.ts`

推荐流程：

1. 从 `.tmp-release-assets/WuXia_Save_Data.zip` 解出一个 save json。
2. 如果浏览器自动化不能直接读本地文件，就用临时本地端口（如 `4174`）托管解出的 json。
3. 在 page context 中打开 IndexedDB `WuxiaGameDB`，把 save object `put(...)` 到 `saves` store。
4. 刷新页面。
5. 打开读档流程，通过应用 UI 读取该存档。

这只用于本地调试和验证，不要当作产品功能。

### 存读档调试相关文件

- 存读档弹窗 UI：`@components/features/SaveLoad/SaveLoadModal.tsx`
- 存读档流程：`@hooks/useGame/saveLoad/saveLoadWorkflow.ts`
- 存档协调器：`@hooks/useGame/saveCoordinator.ts`
- 基础 DB 逻辑：`@services/dbService.ts`
- ZIP 导入/导出逻辑：`@services/saveArchiveService.ts`
- 游戏视图切换状态：`@hooks/useGameState.ts`
- 主游戏接线：`@App.tsx`

## 移动端顶栏验证路径

验证移动端顶栏或 APK/Web 一致性时：

1. 使用移动端视口，例如 `390x844`。
2. 进入真实游戏存档，不要只停留在首页或新游戏向导。
3. 验证六个顶部卡片同时可见：
   - 天气
   - 环境
   - 时间
   - 位置
   - 节日
   - 历程
4. 点击每张卡片，确认详情面板会出现。
5. 最后截图留证。

当前实现的主 UI 文件是 `@components/layout/TopBar.tsx`。

## APK 验证说明

- Web 变更不会进入 Android 包，除非运行 `npm run apk:sync`。
- sync 后，使用 `cd android; .\gradlew.bat assembleRelease` 构建 release 包。
- 最终 APK 输出路径：`@android/app/build/outputs/apk/release/app-release.apk`
- 每次 APK 发布都必须先用 Android SDK `apksigner verify --verbose --print-certs` 验证本地 APK，上传后再下载公开 APK 并再次验签。需要确认包验证通过、记录启用的签名方案，并对比 release keystore 的证书 SHA-256 指纹。
- 本项目预期 release 证书 SHA-256 指纹：`0c638692591300750ccc17cb828b5223bb9a5ef333095714377a6cd5adcbe48c`。
- 如果 `adb devices` 为空，要明确说明 release 构建和本地移动 Web 验证已通过，但本机没有执行真机安装。

## 决策规则

如果任务是“确认这个 UI 可用”，且打开流程依赖外部模型配置，不要停在配置页。使用存档导入或存档注入路径进入真实游戏界面验证。

## 拍卖行物品验证规则

- 只有真实游戏物品可以进入拍卖行。
- 优先使用 AI 物品提取，不要优先写正则规则。系统现在支持用 AI 从游戏回复中智能提取并验证拍卖物品。
- AI 提取（`services/auctionItemExtractor.ts`）可以：
  - 识别市场语义，如拍卖行、牙行、黑市、寄售、流入市面等。
  - 识别稀有物品语义，如传说、绝世、极品、稀世、孤本等。
  - 提取真实物品名，并拒绝“一股浓浓的药”“温热的触感”“迅速驱散”等描述性短语。
  - 校验品质和类型组合，例如杂物不能是传说、绝世、极品。
  - 按品质估算合理价格。
- 当 AI 提取不可用或失败时，正则提取只作为 fallback。
- 使用 AI 提取时，向 `从剧情响应构建拍卖行投放参数列表` 传入 `useAIExtraction: true` 和 `aiExtractionResult`。
- 如果某回合没有有效可投放物品，不要强行生成拍卖条目。
- `allowInitialPlotSeed` 可以在游戏开局生成 2-3 个初始物品，但也要遵守品质/类型约束。

## 地图布局优化器集成

- 地图布局优化器 `utils/mapLayoutOptimizer.ts` 已完整集成到地图空间系统 `utils/mapSpatial.ts`。
- 对建筑数量大于等于 4 的 settlement 层（城镇、村庄等），优化器会自动生成：
  - 道路网布局：根据建筑数量生成 2-4 条横路和 2-4 条竖路。
  - 建筑沿道路分布在街区中。
  - 建筑占街区 65%-75% 空间，并保持合理间距。
- 优化器生成的道路会带正确 ID 和 metadata 加入地图道路列表。
- 非 settlement 层或建筑少于 4 的层继续使用原始布局逻辑。
- 该集成保持旧存档兼容。
- 所有单元测试通过（71 tests）。

## 物品生图队列规则

- 物品生图必须限制为一次只运行一个并发任务，避免压垮后端。
- 系统启动新物品生图前，应检查是否已有物品生图任务正在运行。
- 这样可以避免所有缺图物品同时提交生图的问题。

## 图片查看器关闭按钮规则

- 所有图片查看/预览弹窗都必须在图片右上角有醒目的关闭按钮。
- 关闭按钮应为红色圆形按钮（`h-12 w-12`），带白色边框和红色阴影。
- 按钮应有 hover 效果（`scale-110` 和更亮阴影）。
- 图片查看器应把图片放在右侧（`justify-end pr-8`），最大宽度 `85vw`。
- 适用于：社交弹窗角色图、装备弹窗角色立绘、图片管理弹窗，以及其他全屏图片查看器。

## 装备立绘显示规则

- 装备弹窗中的角色立绘必须使用 `object-contain`，确保完整立绘可见。
- 不要裁切角色立绘顶部或底部。
- 立绘容器应保持比例并显示完整图片。

## Discord MCP 使用说明

- Discord MCP 使用 `SaseQ/discord-mcp`。
- Discord bot token 必须保存在本地用户环境变量 `DISCORD_TOKEN` 中；绝不能写入仓库文件、脚本、commit、日志或聊天回复。
- 默认 guild/server ID 可以保存在 `DISCORD_GUILD_ID`。
- Docker 可用时的启动命令：
  `docker run -d -i --name discord-mcp --restart unless-stopped -p 8085:8085 -e SPRING_PROFILES_ACTIVE=http -e DISCORD_TOKEN -e DISCORD_GUILD_ID saseq/discord-mcp:latest`
- Docker/HTTP 模式可用时的 Codex MCP 注册命令：
  `codex mcp add discord-mcp --url http://localhost:8085/mcp`
- 当前 Windows fallback 注册使用 `%USERPROFILE%/.codex/tools/discord-mcp/discord-mcp-1.0.0.jar` 中的 release jar，走 stdio transport。注册命令在运行时从用户环境变量读取 `DISCORD_TOKEN` 和 `DISCORD_GUILD_ID`。
- 在这台机器上，Discord Gateway 访问需要本地 JVM proxy flags 指向 `127.0.0.1:10809`，包括 `socksProxyHost`，否则 token 验证可能通过但 websocket gateway 超时。
- 验证命令：
  `curl -fsS http://localhost:8085/actuator/health`
  `codex mcp list`
  `codex mcp get discord-mcp`

## 对象存储同步说明

- 用户可能会使用 hi168 的 S3 兼容对象存储做存档同步。
- 对象存储凭据只能保存在本机用户环境变量中；不要把 Access Key 或 Secret Key 写入仓库文件、提交、日志、更新说明或聊天回复。
- 本机环境变量名称：
  - `MORAN_OSS_USERNAME`
  - `MORAN_OSS_ACCESS_KEY`
  - `MORAN_OSS_SECRET_KEY`
  - `MORAN_OSS_ENDPOINT`
  - `MORAN_OSS_BUCKET`
- 当前非敏感默认值：
  - 端点：`https://s3.hi168.com`
  - 存储桶：`hi168-19275-07130td3`
- hi168 使用 S3 兼容 API，调用时使用 path-style 地址：`https://s3.hi168.com/<bucket>/<key>`。
- 应用内对象存储同步应走 `/api/object-storage-proxy` 运行时端点，使用 AWS Signature V4 签名，region 使用 `auto`，service 使用 `s3`，并复用 WebDAV 的清单、分片和增量同步语义。
- 默认存储前缀为 `MoRanJiangHu`；存档包放在 `MoRanJiangHu/saves`，分片放在 `MoRanJiangHu/chunks`，清单文件是 `MoRanJiangHu/manifest.json`。
- 本地端到端测试时，从用户环境变量读取凭据，在 `MoRanJiangHu/e2e/` 下 PUT 一个小对象，GET 回来校验内容，然后 DELETE 该测试对象。

## Shell Encoding Rule

- 在 PowerShell 里读取或写入 UTF-8 JSON/文本时，不要依赖默认控制台编码。
- 优先使用 `node`、显式 UTF-8 文件读写，或其它能保留 Unicode 文本的命令。
- 如果必须临时绕过 shell 编码问题，要一次性解决底层解码方式并把诀窍记录下来，不要反复描述同一个编码绕路。

## 2026-05-17 地图重构与同步记忆

- 原作者项目：`ypq123456789/MoRanJiangHu`。
- 用户 fork / GitHub ID：`LingYuYue1`。
- 继续本地修复前，已经先同步过原作者仓库。以后继续地图工作时，不要默认本地就是最新，先检查远程。
- 已推送到用户 fork 的 PR 分支：`codex/map-system-queue-fixes`。
- PR 标题建议/使用：`重构地图更新队列并修复地图 NPC 联动`。
- 后续本地 `main` 已快进同步到原作者最新 `origin/main`，提交位置为 `17ed36d`。

### 六层地图树方向

- 当前地图重构只使用六层地点树：`寰宇 -> 大地点 -> 中地点 -> 小地点 -> 区地点 -> 子地点`。
- 不要重新引入旧坐标地图字段：`世界.地图`、`世界.建筑`、`世界.地图建筑`、`世界.地图道路`、`世界.地图人物`。
- `具体地点` 是环境/当前位置字段，不是地图层级。如果 AI 返回 `具体地点`，应归一到 `区地点`；房间/室内类节点应归一到 `子地点`。
- 地图节点通过 `世界.地图层级` 维护，使用 `DT-xxx` ID。
- 新地图数据应基于名称、层级、父级、描述，不让 AI 生成坐标。

### 地图渲染与 NPC 修复

- 已修复大地点/大洲地图路径点越界问题，路径点会被限制在地图框内。
- 已修复 NPC 与地图地点联动：城镇/建筑层显示粉色 NPC 标记；建筑/房间卡片显示在场 NPC 列表。
- NPC 地点匹配优先使用精确位置路径。
- 相关文件包括：`utils/mapSpatial.ts`、`utils/mapNpcLocation.ts`、`components/features/Map/RegionMap.tsx`、`components/features/Map/GridMapScene.tsx`、`components/features/Map/LocationBrowser.tsx`。

### 地图更新工作流拆分

- 地图更新必须从世界演变中拆分出来。
- 世界演变不应继续负责写入地图更新。
- 自动地图更新作为正文结束后的独立后台队列阶段运行。
- 队列顺序应为：`文章优化 -> 变量生成 -> 动态世界 -> 规划分析 -> 地图更新 -> 最终落盘`。
- 地图更新阶段排在最终应用命令之前的最后一位。
- 用户开启地图自动更新独立 API 时，自动地图更新使用独立 API/模型。
- 未开启独立地图更新 API 时，自动地图更新跟随主剧情 API/模型。
- 手动 `解析地图` 和正文后的自动地图更新保持分离。
- 手动地图解析使用“地图生成”API 配置。
- 自动地图更新使用“地图自动更新”API 选择逻辑。
- 自动模式只解析并应用指向 `世界.地图层级` 的命令。

### 地图更新拆分涉及文件

- `hooks/useGame/mapUpdateWorkflow.ts`：手动地图重生成和自动增量地图更新共用工作流。
- `utils/apiConfig.ts`：新增/使用地图自动更新接口解析。
- `models/system.ts`：新增地图自动更新独立模型字段。
- `components/features/Settings/MapModelSettings.tsx`：新增 `正文后自动地图更新` 设置区。
- `hooks/useGame/sendWorkflow.ts`：在规划分析后、最终落盘前新增独立 `地图更新` 队列阶段。
- `hooks/useGame.ts`：补充地图更新进度类型和透传。
- `components/features/Chat/InputArea.tsx`：新增队列 UI 阶段 `地图更新`，并显示在最后。

### 本次验证记录

- Windows PowerShell 可能因为 `npm.ps1` 执行策略导致 `npm run build` 失败；使用 `npm.cmd run build`。
- 接入地图更新队列后，`npm.cmd run build` 已通过。
- 构建会因为项目执行 `release:sync` 修改 `data/releaseInfo.ts` 和 `public/release-info.json`，如果任务不是发布，不要把这些生成文件混进 PR。
- 已用本地 Vite preview 在桌面端和手机局域网访问测试。手机访问时 preview 需要使用 `--host 0.0.0.0`，然后手机打开电脑局域网 IP。

## 2026-05-17 在线心跳周期性卡顿修复

- 用户反馈 PC 和手机端都会周期性卡顿/冻结，包括切换页面和停留在任意页面时。
- 主要可疑原因定位在 `services/onlinePresence.ts`：在线心跳每 25-30 秒发送一次，并且每次都会调用 `读取本地图片资源统计`。
- `读取本地图片资源统计` 会扫描 IndexedDB 里的存档、设置和图片资源；当存档或图片较多时，会造成周期性主线程卡顿。
- 修复已在分支 `codex/fix-presence-heartbeat-stutter`、提交 `67273b8` 中完成：
  - 在线心跳不再携带完整本地图片资源统计；
  - 仅保留轻量的图片迁移状态 `获取本地图片图床迁移状态`；
  - 心跳 payload 改为同步轻量构建；
  - WebSocket 心跳已连接时跳过备用 HTTP 心跳，避免双路重复心跳。
- PR 分支已推送到用户 fork：`LingYuYue1/MoRanJiangHu`，分支 `codex/fix-presence-heartbeat-stutter`。
- PR 创建链接：`https://github.com/LingYuYue1/MoRanJiangHu/pull/new/codex/fix-presence-heartbeat-stutter`。
- PR 标题建议：`修复在线心跳导致的周期性卡顿`。
- 验证：`npm.cmd run build` 已通过。
- 构建再次触发 `release:sync` 修改 release 元数据；已恢复 `data/releaseInfo.ts` 和 `public/release-info.json`，未混入本次 PR。
- 如果合并后仍有卡顿，下一批优先排查：启动图片缓存预热、旧图迁移、图片兜底预取、页面切换时的存档列表扫描。

## 2026-05-17 旧存档地图适配（回忆库重建地图）

- 功能分支：`codex/memory-map-regenerate`，提交 `0775951`。
- PR 已推送到用户 fork `LingYuYue1/MoRanJiangHu`。目标上游：`ypq123456789/MoRanJiangHu`。
- 本机无 `gh` CLI，PR 需通过 GitHub 网页手动创建。

### 功能说明

- 在 `hooks/useGame/mapUpdateWorkflow.ts` 新增 `memory_regenerate` 模式。
- 读取存档记忆系统（回忆档案、长期/中期/短期/即时记忆），提取地点线索。
- 将线索发送给地图生成 API，AI 返回 JSON 地点树。
- 解析响应后替换 `世界.地图层级` 为新六层树，同时清空旧坐标字段。
- 成功重建后自动存档。

### UI：流式输出窗口

- 原实现使用 `pushNotification`（右下角弹窗）显示进度/结果——用户反馈遮挡视野。
- 改为在"使用回忆库解析地图"按钮下方内嵌流式文本窗口，实时显示 AI 解析输出。
- 回调签名从 `() => Promise<boolean | void>` 改为 `(onDelta: (delta: string) => void) => Promise<{ ok: boolean; message: string }>`。
- `App.tsx` 中 `handleRegenerateMapFromMemory` 接收 `onDelta` 回调，返回 `{ ok, message }` 而非调用 `pushNotification`。
- 流式窗口自动滚动，结束时显示 `[完成]` / `[失败]` / `[错误]` 状态。
- 桌面端和移动端设置弹窗共用同一个 `MapModelSettings` 组件，双端同步支持。

### 涉及文件

- `hooks/useGame/mapUpdateWorkflow.ts` — 新模式 `memory_regenerate`，辅助函数 `构建回忆库地图线索`、`限长文本`。
- `App.tsx` — `handleRegenerateMapFromMemory` 回调，支持流式 delta 输出。
- `components/features/Settings/MapModelSettings.tsx` — 流式文本窗口 UI，更新 Props。
- `components/features/Settings/SettingsModal.tsx` — Props 类型更新。
- `components/features/Settings/mobile/MobileSettingsModal.tsx` — Props 类型更新。

### 验证

- `npm.cmd run build` 通过，无 TypeScript 错误。
- 用户端到端测试确认功能正常。
- Release 元数据文件（`data/releaseInfo.ts`、`public/release-info.json`）未纳入提交。

## 2026-05-17 地图回忆解析改名、房间索引与 NPC 位置更新

- 这是在旧存档地图适配（回忆库重建地图）之后继续完成的收尾记忆。
- 用户已经确认回忆库重建地图流程可正常使用。
- 原本的手动地图解析功能已改造成回忆解析：
  - UI 按钮名称从 `解析地图` / 地图解析改为 `回忆解析`。
  - 设置界面和地图界面都应触发同一套基于回忆库的地图重建流程。
  - 地图界面的流式输出应与设置里的回忆解析流式输出保持一致。
  - 旧的 `manual_regenerate` 地图解析模式已移除；当前地图工作流使用 `memory_regenerate` 与 `auto_incremental`。

### 房间索引显示规则

- 房间（`子地点`）只应显示在父级建筑/地点下的地图场景里。
- 右侧地图索引/地点浏览器不应直接列出房间节点。
- 如果当前选中的节点是房间（`子地点`），右侧索引默认选中节点应回退到父级建筑/地点。
- 相关修复：
  - `components/features/Map/LocationBrowser.tsx`：右侧地点索引过滤 `子地点`，当前节点为房间时默认回退到父节点。
  - `components/features/Map/GridMapScene.tsx`：右侧地图层级 / 下一级列表过滤 `子地点`。

### NPC 地图显示位置修复

- 用户反馈修复后 NPC 标记/房间列表显示已经正确；此前的问题是 NPC 经常集中显示在一个房间里。
- 定位到的原因：
  - 房间/建筑层对“当前地点”的兜底过于激进。
  - 单房间卡片兜底会把所有 `npcAtLocation` 都显示出来。
  - `utils/mapSpatial.ts` 曾经把无法匹配位置的 NPC 兜底放到当前层。
  - `responseCommandProcessor.ts` 曾经把正文里只要提到 NPC 名字就视为在场。
- 修复方向：
  - 房间层只显示有精确房间/建筑位置依据的 NPC。
  - `归属.小地点 / 归属.中地点 / 归属.大地点` 这类宽泛归属字段，不能把 NPC 放入具体房间。
  - 没有匹配到地点的 NPC 不再被强行放到当前房间/当前层。
- 相关文件：
  - `utils/mapNpcLocation.ts`：新增精确位置辅助函数，使用 `位置路径 / 当前位置 / 当前地点 / 所在地点 / 所在位置 / 具体地点 / 地点 / 位置 / 归属.具体地点`。
  - `components/features/Map/RegionMap.tsx`：房间层改用精确匹配；移除单房间“显示全部 NPC”的兜底。
  - `utils/mapSpatial.ts`：社交 NPC 路径匹配加入 `位置路径`，并移除无法匹配时的 `|| currentLayer` 兜底。
  - `hooks/useGame/responseCommandProcessor.ts`：在场判断改为需要对白、明确在场或明确同行事实，不再仅凭名字被提到就标记在场。

### NPC 游玩过程位置更新修复

- 随后用户反馈：地图显示层没问题了，但游玩过程中 NPC 的位置更新不正确。
- 根因：
  - 社交 NPC 档案缺少稳定的持久化地点字段约束。
  - 变量生成主要要求刷新 `是否在场`，没有强制同步刷新 `社交[i].当前位置 / 位置路径`。
  - 变量路径登记可能拦截新增的 `社交[i].当前位置 / 当前地点 / 位置路径` 字段。
- 修复方向：
  - 当社交 NPC 被确认在当前场景中，本地命令处理会用当前 `环境` 自动补齐/刷新 `当前位置`、`当前地点`、`位置路径`。
  - 变量生成提示词明确要求 NPC 登场、说话、同行或移动时同步写地点字段。
  - NPC 离开当前场景时，只有正文给出新去向才更新地点；否则只设置 `是否在场=false`，不凭空猜地点。
  - 变量路径登记允许新增社交 NPC 地点字段。
- 相关文件：
  - `hooks/useGame/responseCommandProcessor.ts`：新增 `同步在场NPC当前位置`，并在有命令/无命令两条流程里于社交列表规范化后应用。
  - `models/social.ts`：为 `NPC结构` 增加可选 `当前位置`、`当前地点`、`位置路径`。
  - `prompts/runtime/variableModel.ts`：加强每回合 NPC 地点更新规则。
  - `prompts/stats/npc.ts`：新增 NPC 地点更新纪律和命令示例。
  - `utils/variableRegistry.ts`：允许新增 `当前位置`、`当前地点`、`位置路径` 这三个社交 NPC 字段。

### 验证

- 房间索引/NPC 地图显示位置修复后，`npm.cmd run build` 已通过。
- NPC 游玩过程位置更新修复后，`npm.cmd run build` 已通过。
- 每次构建都会因 `release:sync` 修改 release 元数据；由于本次不是发布，已恢复 `data/releaseInfo.ts` 与 `public/release-info.json`。
- 用户已确认 NPC 在地图上的显示位置修复后是正确的。

## 2026-05-18 GitHub Actions 已关闭与本机直连 Cloudflare 发布规则

- GitHub Actions 的自动 CI 和自动 Cloudflare Worker 部署已经关闭。除非用户明确要求恢复自动 CI/自动部署，否则 workflow 文件只保留 `workflow_dispatch` 手动触发。
- 后续正常发布新版本不要依赖 GitHub Actions，应从本机执行直连 Cloudflare 的发布命令。
- 执行 Cloudflare 部署时，先清空代理环境变量，并使用明确的命令超时，继续遵守现有发布覆盖验证规则。
- 推送到 `main` 现在只作为源码备份步骤，不再视为部署机制。

## 2026-05-18 地图生成开关、手机地图布局与回忆解析重建

- 新增全局 `地图生成功能启用` 设置。
- 设置入口位于 `components/features/Settings/MapModelSettings.tsx`；桌面端和手机端设置页共用这个组件，所以双端同步生效。
- 默认行为保持开启，避免影响已有存档。
- 开启时，正文输出后仍按之前逻辑进入地图更新队列；地图更新可以复用主剧情 API/模型，也可以使用独立地图更新配置。
- 关闭时，正文流程继续正常运行，但地图更新队列阶段会提示地图生成功能未开启，并跳过自动地图更新。
- 相关文件：
  - `models/system.ts`：持久化新增设置字段。
  - `utils/apiConfig.ts`：新增地图生成开关的默认规范化。
  - `components/features/Settings/MapModelSettings.tsx`：新增设置开关和顶部提示。
  - `hooks/useGame/sendWorkflow.ts`：地图生成关闭时的队列跳过逻辑。

### 手机地图布局记录

- 手机地图 UI 已针对小屏幕调整。
- `components/features/Map/MobileMapModal.tsx` 使用移动端安全高度 `100dvh`，压缩顶部间距，并加入底部 safe-area 余量。
- `components/features/Map/LocationBrowser.tsx` 的紧凑布局避免手机端整页溢出。
- `components/features/Map/RegionMap.tsx` 的建筑/房间列表支持内部滚动，房间很多时不会导致页面无法滚到底。

### 地图设置提示与回忆解析行为

- 地图生成设置里的“提示”区应保持在页面顶部。
- 提示内容应说明：
  - 地图生成是通过检索正文来更新地图的轻量任务，适合 Flash 或 mini 级模型。
  - 开启地图生成功能后，需要在下方配置 API/模型；如果不配置，则复用主剧情模型/API。
  - 回忆解析会根据回忆库生成地图，并且会先删除目前的地图内容；主要用于老存档迁移。
  - 新开的存档通常不需要回忆解析，只需要选择是否开启地图生成、是否使用独立模型。
- 回忆解析（`memory_regenerate`）现在是全量重建路径：
  - 提示词不能再要求 AI 保留或合并旧地图层级。
  - 旧地图层级最多作为旧存档残留诊断参考，不能复制进新地图树。
  - `App.tsx` 会先清空旧坐标地图字段，再写入新的 `世界.地图层级`。
  - `hooks/useGame/mapUpdateWorkflow.ts` 会为重建节点重新分配新的 `DT-xxx` ID，不沿用旧 ID。

### 验证

- 地图生成开关与队列跳过逻辑完成后，`npm.cmd run build` 已通过。
- 手机地图布局调整后，`npm.cmd run build` 已通过。
- 地图设置提示移动/改文案、回忆解析改为清旧重建后，`npm.cmd run build` 已通过。
- 每次构建都会因 `release:sync` 修改 release 元数据；由于本次不是发布，已恢复 `data/releaseInfo.ts` 与 `public/release-info.json`。

## 2026-05-19 繁体模式、DeepSeek 兼容与 AI 模式教程

- 在游戏设置中新增繁体模式开关。
- 开启后，游戏内 AI 生成内容需要通过各功能提示词注入“使用繁体中文”的要求，不能只依赖输出后的 UI 转换。
- 从参考 APK 迁移 DeepSeek 兼容能力，并在游戏设置中提供可选择的主剧情消息模式。
- 主剧情消息兼容模式应保持放在游戏设置最顶端，并使用玩家容易理解的标签：
  - `Gemini模式`：默认/原始行为，适合 Gemini 模型。
  - `GPT兼容`：对 GPT/OpenAI 兼容接口生效的真实兼容模式，不是只能看的占位项。
  - `DeepSeek标准续聊`：DeepSeek 类接口优先尝试的安全默认模式。
  - `DeepSeek锁格式`：更严格的 DeepSeek 模式，在接口支持时会尝试使用 Prefix/Prefill 锁住输出格式。
- DeepSeek 专用提示词逻辑保存在 `prompts/runtime/deepseekMode.ts`。
- DeepSeek 设置 UI 主要位于 `components/features/Settings/GameSettings.tsx`。
- DeepSeek 稳定救场模型/API 设置位于 `components/features/Settings/ApiSettings.tsx`。
- 主页教程中心（`public/tutorials.html`）新增 `AI模型模式` 标签页。
- AI 模式教程用面向玩家的中文详细解释：
  - Gemini/GPT/DeepSeek 标准续聊/DeepSeek 锁格式分别什么时候选择；
  - Prefix 能力探测，以及第三方 DeepSeek 兼容站可能不支持 Prefix/Prefill 的原因；
  - 输出健康度检测是检查回复能否被游戏稳定解析，不是评价文笔；
  - 锁格式阈值与救场阈值的含义和调节方式；
  - 开局策略、接管摘要、Thinking 选项、稳定救场模型的用途。
- 教程中心支持直接通过 `#aimode` hash 打开 AI 模型模式教程。
- 验证：AI 模式教程更新后，`npm.cmd run build` 已通过。
- 构建会因 `release:sync` 触碰 release 元数据；`data/releaseInfo.ts` 与 `public/release-info.json` 忽略行尾后无内容差异，除非正式发布，否则不应作为 release 变更提交。

## 2026-05-19 时间锚点与历程天数防回退修复

- 玩家反馈：游戏内起始时间本来是四月多，但游玩中突然变成"现实时间前一天"，连带 TopBar 显示的历程天数被重置。
- 根因分为三层：
  - 系统提示词每回合只塞 `环境.时间`（当前快照），从未注入 `游戏初始时间` 锚点，AI 看不到开局基准，无法保证跨回合的年/月/日稳定。
  - `prompts/core/timeProgress.ts` 仅要求时间向前推进，没有禁止年/月/日回退、清零，也没有禁止套用模型训练日期或当前现实日期。
  - `hooks/useGame/responseCommandProcessor.ts` 对 `set 环境.时间 = ...` 不做任何校验，也不拦截改写 `游戏初始时间` 的命令；一旦 AI 写入异常值，快照立刻被覆盖，`utils/gameTimeJourney.ts` 派生出的历程天数就会肉眼可见地跳变。
- 三层防御已经全部落地（defense in depth）：
  - 提示词层：`prompts/core/timeProgress.ts` 新增第 0.1 节"时间锚点完整性（硬约束）"——`环境.时间` 单向非减，禁止年/月/日倒退，禁止套用 AI 模型训练日期或现实日期，`游戏初始时间` 仅在开局第 0 回合写入一次永不可改写，拿不准时保留旧值或只推进若干分钟。
  - 上下文层：`hooks/useGame/systemPromptBuilder.ts` 用 `游戏初始时间` 与 `环境.时间` 派生 `开局时间` 与 `已游玩天数`，并把两者注入 `orderedEnv`，紧跟在 `时间` 之后。`游戏初始时间` 通过 `hooks/useGame.ts` → `hooks/useGame/sendWorkflow.ts` → `systemPromptBuilder` 透传到位。
  - 命令层：`hooks/useGame/responseCommandProcessor.ts` 新增 `是否游戏初始时间命令`、`是否环境时间命令`、`是否时间回退或异常重置` 三个守卫函数。`set 游戏初始时间 = ...` 命令一律丢弃；`set 环境.时间 = ...` 在新值早于旧快照、等于占位 `1:01:01:00:00`、或解析失败时整条丢弃。
- 涉及文件：
  - `prompts/core/timeProgress.ts`
  - `hooks/useGame/systemPromptBuilder.ts`
  - `hooks/useGame/sendWorkflow.ts`
  - `hooks/useGame.ts`
  - `hooks/useGame/responseCommandProcessor.ts`
- 验证：`npm.cmd run build` 已通过。构建再次因 `release:sync` 触碰 release 元数据；本次不是发布，已恢复 `data/releaseInfo.ts` 与 `public/release-info.json`。
- 本次修复未触发任何部署（遵守"禁止自动部署规则"）。下次发布时面向客户的更新日志建议措辞："修复 AI 在游玩中偶尔把游戏内日期/历程天数重置成现实时间前一天的问题——新增时间锚点硬约束、每回合向 AI 同步开局时间与已游玩天数，并在命令落地前拦截一切时间回退/重置写入。"
