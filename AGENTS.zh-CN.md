# MoRanJiangHu 代理协作说明（中文版）

## 沟通语言规则

- 始终使用中文（中文）与用户沟通。
- 所有解释、摘要、更新日志和状态报告必须用中文编写。
- 代码、文件路径、变量名和技术标识符保持英文不变。
- 除非用户明确要求使用其他语言，否则此规则适用于所有对话。

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

- 功能开发可以在隔离的 `codex/` 分支或 worktree 中实现和验证，但发布新版本时，必须在最终版本号升级、构建、上传、部署或发布验证之前，将本次计划发布的完整改动整合回 `main`。最终公开版本必须从 `main` 构建并发布，推送到 GitHub 的发布备份提交也必须存在于 `main`；不得直接从尚未合并的 worktree 分支发布。
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
- OneDrive APK 上传、APK 下载验证、HTTPS 端点检查等外部命令必须带明确超时。如果包装命令可能在部分成功后卡住，要拆成上传、部署、验证等更小步骤，并逐一确认公开产物。
- 必须检查 `release.config.json` 中的网站 URL、APK 下载 URL、更新 manifest URL，以及所有文档中列出的备份域名或指南 URL。
- 当前域名记忆：主站是 `https://msjh.bacon159.pp.ua/`；备站是 `https://msjh.bacon.de5.net/`。
- 对当前项目，每次都要确认主站 `https://msjh.bacon159.pp.ua/` 和备站 `https://msjh.bacon.de5.net/` 是否部署了与 APK/update manifest 相同的版本。
- 关键要求：部署后必须验证主站和备站都显示：
  - 与 release 匹配的正确版本号。
  - 准确的发布时间 `releasePublishedAt`。
  - 如果版本号或时间戳不正确，说明部署未完成。
- 如果 release 已上传到 OneDrive 但网站没有部署，必须在同一发布流程里部署网站，或清楚说明不能部署的原因。
- 部署后必须通过 HTTPS 验证线上站点和 manifest，不能只看本地构建输出。
- 每次部署并推送 release backup 后，都要显式检查 `ypq123456789/MoRanJiangHu` 的 GitHub Actions CI，而不是 upstream 仓库。确认最新推送 commit 的 `CI` run 成功；如果失败，要拉取日志，能修则修，不能修要在结束前报告阻塞。

## 静态资源部署验证规则（关键——源于一次误报"部署成功"的教训）

- **不要只凭 `/api/apk/latest.json` 就判定网站部署成功。** 这个 manifest 由 Cloudflare KV 提供，是由独立的 release-manifest 发布流程更新的，**不是** `wrangler deploy` 更新的。它可能已显示新版本，而网站前端仍停留在旧版本，从而得出"整站都更新了"的错误结论。
- 网站版本号是编译进前端 JS bundle 的，通过**静态资源**路径（`dist/`，含 `release-info.json` 和带 hash 的 `index-*.js`）提供。这与 KV manifest 是完全不同的通道。
- **过往事故的根因**：`wrangler deploy` 后只检查了 `/api/apk/latest.json`（KV，确实更新了）就当作完成，但静态资源（`dist/`）实际没有真正生效。站点仍在提供旧 bundle/版本，所以显示的版本号从未改变，尽管报告声称成功。
- **每次网站部署后必须做的静态资源验证**（全部走 HTTPS，主站 `https://msjh.bacon159.pp.ua/` 和备站 `https://msjh.bacon.de5.net/` 都要验证）：
  1. 请求 `/release-info.json`（静态资源，不是 `/api/apk/latest.json`），确认 `versionName`、`versionCode`、`releasePublishedAt` 与刚构建的 release 一致。
  2. 请求线上 `index.html`，确认其引用的带 hash 的 bundle 名（例如 `assets/index-XXXX.js`）与本地 `npm run build` 在 `dist/` 中产出的 hash 完全一致。hash 一致才是新静态资源真正上线的证据；hash 陈旧说明部署没生效，无论 `wrangler deploy` 日志说了什么。
  3. 确认 `wrangler deploy` 输出确实报告了上传资源文件（例如 `Uploaded N files`），没有静默跳过 assets 步骤。
- `/api/apk/latest.json` 显示新版本不足以作为网站部署成功的证据。它只对 APK/update-manifest 通道有效，且只在 release-manifest 发布步骤运行之后才有意义。
- 如果上述静态资源检查未通过，网站部署即为**未完成**——应重新执行 `npm run build` + `wrangler deploy`（清除代理变量）并重新验证，而不是报告成功。

## Worker Functions 重编译与部署后实测规则（关键——源于一次"部署了旧代码"事故）

- `wrangler deploy` 打印 `Success` / `Uploaded N files` 只代表"上传动作完成"，**不代表你的代码改动已经生效**。static assets 和 worker functions 都可能没真正上新。
- **Worker functions 重编译陷阱**：改了 `functions/` 下的代码后，`npm run worker:functions`（`wrangler pages functions build`）有时不会真正重新编译，`.tmp-worker-build/index.js` 仍是旧时间戳、旧内容。此时部署上去的是旧代码，线上行为不变。
  - 复现过的事故：修复 `functions/api/apk/latest.json.ts` 的 `apkUrls` 排序后，第一次部署线上顺序完全没变，排查发现 `.tmp-worker-build/index.js` 时间戳早于改动。
  - **强制做法**：编译前先 `rm -rf .tmp-worker-build` 清理旧产物再 `npm run worker:functions`；编译后确认 `.tmp-worker-build/index.js` 时间戳是刚生成的，并 `grep` 新逻辑的标识符（如新函数名/变量名）确认真的进了产物，然后才 `wrangler deploy`。
- **部署后必须从 HTTPS 实测线上真实行为**，而不是只看 deploy 日志：
  - 网站前端：核对线上 `index.html` 引用的 hashed bundle 名与本地 `dist/` 一致（见静态资源部署验证规则）。
  - Worker/functions：直接请求受影响的接口，核对返回内容/顺序/重定向落点符合预期（例如 `/api/apk/latest.json` 的 `apkUrls` 顺序、`/api/apk/latest.apk` 的 302 落点）。
- 若实测行为与预期不符，部署即为**未完成**——清理产物、重编译、确认标识进产物、重新部署、再实测，而不是报告成功。

## 旧版 APK 更新清单规则（已停用）

- 旧版 `download.bacon.de5.net` 更新清单路径托管在 Cloudflare R2 上，R2 已**完全停用**，不再用于任何用途。
- 读取 `https://download.bacon.de5.net/moranjianghu/latest.json` 的旧版已安装 APK 无法再收到更新。用户必须从主站手动下载最新 APK。
- APK 分发不再使用 B2。当前 APK 分发只使用 **OneDrive 经 OpenList 代理**，以及 **GitHub Release / GitHub 加速链接**。

## 禁止自动部署规则

- 没有用户明确指令时，绝不部署。
- 只有用户明确说”部署””发布””上线”等含义时，才可以执行部署。
- 修 bug 或改代码时，只做本地构建（`npm run build`）和测试，不部署。
- 如果用户只说”修改””修复””改”，不要部署。
- 只有用户说”发布””部署””上线”时才部署。

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
- 纯文档部署仍然要先本地构建，再清空代理变量部署网站，并通过 HTTPS 验证公开指南页已经更新；最终报告里要说明版本号因为纯文档部署而有意保持不变。
- 这个例外也适用于非游戏内容的支持入口/外链更新，例如首页或更新弹窗里的支持入口、邀请/返利链接、福利说明、赞助文案、外部帮助链接；当用户明确说明这不属于游戏内容，并要求部署但不升版本号或不写更新日志时，按本规则处理。
- 以后用户明确要求部署纯文档改动时，默认按这条规则执行。

## 本地文件引用规则

- 不要使用本地文件 Markdown 链接或 URL 链接。
- 只使用反引号包裹的纯文本引用，例如 `@components/layout/TopBar.tsx:195`。
- 路径统一使用 `/`，包括 Windows 路径。
- 正常 prose 解释即可；文件引用单独写成 `@...` 形式。

## 本地与云端环境变量规则

- 本地/云端协同开发统一使用"本地 env 文件 + Cloudflare Secrets"。
- 真实密钥只能保存在本机 `.env.local`、`.env.production`、`.dev.vars`、用户环境变量或 Cloudflare Secrets 中。不要把 OAuth client secret、GitHub token、图床 token、对象存储凭据、AI/API key 提交进仓库。
- 只提交安全模板，例如 `.env.production.example` 和 `.dev.vars.example`。
- 前端构建期变量使用 `VITE_` 前缀，会被写入构建产物，所以这里只能放公开 client id 或公开 API base URL。
- Cloudflare 运行时密钥应通过 `npm run cf:secrets:bulk -- .env.production` 或单个 `wrangler secret put ...` 命令设置。
- **重要——Cloudflare 账号迁移**：项目已从旧账号 `648558021@qq.com`（账号 ID `af087b3ace8e434ac24273df5b8b9e51`）迁移到新账号 `1524640484@qq.com`（账号 ID `5d34b67de994f61284cd81176d6f1382`）。Worker、Pages 项目、KV 命名空间和 D1 数据库均已迁移到新账号。所有 wrangler 命令应使用 `wrangler.152.jsonc`（内含 `account_id: 5d34b67de994f61284cd81176d6f1382`）。不要使用 `wrangler.jsonc`（旧账号配置，无 `account_id`）进行生产操作。旧账号的 Pages/Worker 密钥已过期，不应再使用；始终通过迁移目标凭据（`CF_MIGRATE_TARGET_GLOBAL_API_EMAIL=1524640484@qq.com`、`CF_MIGRATE_TARGET_GLOBAL_API_KEY`、`CF_MIGRATE_TARGET_ACCOUNT_ID`）将密钥同步到新账号的 Worker。
- **Vite import.meta.env 静态替换规则**：Vite 只在构建期静态替换*直接*的 `import.meta.env.VITE_*` 属性访问（如 `import.meta.env.VITE_GITHUB_CLIENT_ID`）。当用 `(import.meta as any).env?.VITE_*` 加上 `as any` 类型转换和可选链时，Vite 无法在构建期匹配该模式，会在产物里坍缩成对一个空对象 `{}` 的运行时访问，导致环境变量值在生产包里变成 `undefined`。这是一个隐蔽 bug：开发服务器正常（回退到运行时 `import.meta.env`），但生产构建会彻底丢失该值。运行时代码中一定要用直接的 `import.meta.env.VITE_*` 访问方式，绝不要用 `(import.meta as any).env?.VITE_*`。
- 每次环境变量新增、删除或修改后，都要刷新本机 `.env.production`，重新加密，并把加密包同步到对象存储。
- `wrangler.jsonc` 只放绑定和非敏感变量，例如 KV 绑定、键名前缀、静态资源绑定、公开仓库默认值；不要把运行时密钥写进 `wrangler.jsonc`。
- 当前需要的 Cloudflare secrets 包括 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GITHUB_NATIVE_CLIENT_ID`、`GITHUB_NATIVE_CLIENT_SECRET`、`FANDOM_PRESET_GITHUB_TOKEN`、`IMAGE_HOST_TOKEN`、`MORAN_OPENLIST_AUTH_TOKEN`、`ONLINE_ADMIN_PASSWORD`、`MORAN_B2_APPLICATION_KEY_ID`、`MORAN_B2_APPLICATION_KEY` 和 `MORAN_B2_BUCKET_ID`。
- 当前公开前端构建变量包括 `VITE_GITHUB_CLIENT_ID`、`VITE_GITHUB_NATIVE_CLIENT_ID`、`VITE_SYNC_API_BASE_URL`。

## 根因级 Bug 修复规则

- 当用户要求修复问题时，必须先判断该现象是孤立问题，还是更大流程/数据一致性问题的一部分。如果属于后者，必须一并修复整条链路，而不是只修表面症状。
- 定位到缺陷后要继续追到根因，不能停在隐藏原始错误、改展示文案或遮蔽坏状态。如果某个修复只改善了展示层，也要继续判断坏状态或失败为什么产生，并在可行时修复上游原因。

## 本地 UI 调试路径

当目标是 UI 验证、布局校验、移动端顶栏检查、APK/Web 一致性检查时，不要先卡在模型或 API 配置上。优先从已有存档进入真实游戏界面。

## 截图预览规则

- 给用户截首页或 UI 预览图之前，必须先关闭或叉掉更新日志/Release Notes 弹窗。
- 如果设置 localStorage 或刷新后弹窗仍然出现，就主动点击关闭/确认按钮后再截图。
- 除非本次检查的对象就是更新日志弹窗本身，否则不要把被更新日志遮挡的布局截图发给用户。

## 首页布局防重叠规则

- 首页面板、侧栏、在线人数、发布信息、公益站、友情链接和页脚区域，不能覆盖原本居中的标题/菜单列。
- 首页布局变更在展示或部署前，必须用默认 `2560x1440` 视口确认底部信息栏没有压住 `设置` 按钮或任何主菜单按钮。
- 如果内容过高，应压缩面板密度、添加内部滚动或移动面板位置；绝不能让可见 UI 元素互相叠在一起。

## 前端白天模式可读性规则

- 每次前端/UI 改动完成前，必须优先检查白色/白天模式下是否看得清。
- 新增按钮、链接、面板、徽标、悬浮说明、图表标签和辅助文字时，必须同时保证 `day` 主题和深色主题都有足够对比度。
- 如果使用 Tailwind 的 indigo、violet、sky、amber 等语义色，或使用低透明度文字/背景，必要时必须添加明确的 `html[data-theme="day"]` 覆盖规则或稳定组件类名。
- 部署前端改动前，至少做一次本地浏览器/Playwright 白天模式检查，确认本次改动区域文字可读。

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

- **hi168 S3 已于 2026-06-28 停用**，返回 HTTP 403 AccessDenied。所有数据已迁移到 OneDrive。
- 用户现在使用 OneDrive（通过 OpenList/AList 代理访问，地址为 `https://openlist.bacon.de5.net`）进行存档同步和数据存储。
- OneDrive 数据布局位于 `/Onedrive/MoRanJiangHu/` 下：
  - `apk/` — APK 二进制（latest.apk，约 48.7MB）
  - `releases/` — 带版本号的 release APK（约 97MB）
  - `saves/` — 游戏存档包（约 9.5GB）
  - `preset-items/` — 预设物品图 + 缩略图（约 901MB，496 个物品）
  - `chunks/` — 存档同步分片
  - `codex-env/` — 加密环境变量备份
  - `manifest-backups/` — Release manifest 备份
  - `e2e/` — 端到端测试数据
- 对象存储凭据只能保存在本机用户环境变量中；不要把 Access Key 或 Secret Key 写入仓库文件、提交、日志、更新说明或聊天回复。
- 旧 hi168 环境变量名（仍存在但服务已停用）：
  - `MORAN_OSS_USERNAME`
  - `MORAN_OSS_ACCESS_KEY`
  - `MORAN_OSS_SECRET_KEY`
  - `MORAN_OSS_ENDPOINT`（原为 `https://s3.hi168.com`）
  - `MORAN_OSS_BUCKET`（原为 `hi168-19275-07130td3`）

## Shell 编码规则

- 在 PowerShell 里读取或写入 UTF-8 JSON/文本时，不要依赖默认控制台编码。
- 优先使用 `node`、显式 UTF-8 文件读写，或其它能保留 Unicode 文本的命令。
- 如果必须临时绕过 shell 编码问题，要一次性解决底层解码方式并把诀窍记录下来，不要反复描述同一个编码绕路。

## PowerShell 管道输出规则

- `powershell.exe -Command "..." | tail -N` 可能在命令成功执行后仍返回空输出。根因：PowerShell 的 stderr/stdout 缓冲与 bash 管道缓冲存在时序竞争——Gradle 将进度信息写入 stderr（`> Task :app:...`），当 PowerShell 在 stderr 缓冲区完全刷新到管道之前退出时，`tail` 读取到空内容。
- **正确用法**：使用 `powershell.exe -Command "..." 2>&1` 而不加 `| tail` 来捕获完整输出。如果只需要最后几行，先让命令完成，输出自然可用。
- **错误用法**：`powershell.exe -Command "..." 2>&1 | tail -10` —— 会导致静默返回空输出，看起来像命令卡住或失败了，实际上命令已成功。
- 对于 Gradle 构建，构建可能已成功（APK 文件存在且时间戳正确），但管道返回空，导致误判为"超时"或"空输出"。

## PowerShell 7 文件编辑规则

- 在 Windows 上编辑文件，或执行会修改文件内容的 shell 命令时，优先使用 PowerShell 7（`pwsh`），不要默认使用旧版 Windows PowerShell（`powershell.exe`）。
- 这条规则尤其适用于 UTF-8 文本编辑、JSON/文本文件重写，以及任何需要稳定编码行为的命令序列。
- 只有在 PowerShell 7 不可用，或某个特定工具明确要求旧宿主时，才回退到 `powershell.exe`。

## 后台进程规则

- **有限命令**（构建、测试、编译、安装）：直接运行——它们会自行退出。
- **无限命令**（HTTP 服务器、文件监听、开发服务器、监听器）：必须后台运行——它们永远不会退出。
- 在 Windows 上，`command &` 在 Git Bash/MSYS2 中不能可靠地分离进程。Bash 工具会等待退出，所以会永远卡住。
- **无限进程的正确做法**：使用 `powershell.exe -Command "Start-Process -FilePath <cmd> -ArgumentList <args> -WindowStyle Hidden"` 启动后台进程，然后用 HTTP/请求检查验证。
- **错误做法**：`python -m http.server 4173 -d dist &` —— 会无限期阻塞 Bash 工具。
- **必须后台运行的命令示例**：`python -m http.server`、`npx vite preview`、`npm run dev`、`tail -f`、任何 `watch` 模式。
- **直接运行的有限命令示例**：`npm run build`、`gradlew assembleRelease`、`npm run test:run`、`git push`。

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

## 2026-05-18 GitHub Actions 已关闭

- GitHub Actions 的自动 CI 已经关闭。除非用户明确要求恢复自动 CI，否则 workflow 文件只保留 `workflow_dispatch` 手动触发。
- 后续正常发布新版本不要依赖 GitHub Actions，应从本机执行发布命令。
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

## 2026-05-24 端到端测试外部 AI 接口

- 后续需要真实 AI 返回的端到端测试，统一读取本机环境变量中的 OpenAI 兼容外部测试接口：
  - `MORAN_E2E_AI_BASE_URL`
  - `MORAN_E2E_AI_API_KEY`
  - `MORAN_E2E_AI_MODEL`
- 当前非密钥配置记录：
  - Base URL：`https://ai.bacon123.eu.org/v1`
  - 模型：`流式抗截断/gemini-3.1-pro-preview-search`
- API key 只能保存在本机用户环境变量 `MORAN_E2E_AI_API_KEY` 中。
- 不要把密钥写入仓库文件、提交、日志、截图、客户更新说明或聊天总结。
- 测试调用方式按 OpenAI 兼容 Chat Completions 处理，并从上述环境变量读取配置。

## 2026-06-01 111666 图床记录

- 备用图床 `https://i.111666.best` 上传方式：
  - `curl -F image=@localfile https://i.111666.best/image -H "Auth-Token: $MORAN_111666_AUTH_TOKEN"`
- 删除凭据只保存在本机用户环境变量 `MORAN_111666_AUTH_TOKEN`。
- 不要把这个 token 写入仓库文件、提交、日志、截图、客户更新说明或聊天总结。
- 删除方式：
  - `curl -XDELETE https://i.111666.best/image/IMAGE-PATH -H "Auth-Token: $MORAN_111666_AUTH_TOKEN"`
- 下载/嵌入地址：
  - `https://i.111666.best/image/IMAGE-PATH`
- 本机测试发现的重要行为：
  - 裸直链下载可能返回一张生成的 `403 Forbidden` 图片，提示禁止直接下载。
  - 带网站 `Referer` 的浏览器式图片嵌入请求可以加载原图。
  - 2.7 MB 测试图在带 `Referer: https://msjh.bacon159.pp.ua/` 的 12 并发 curl 请求下全部成功，本机测试平均约 0.6 秒/次。
- 如果后续把该图床用于公开预设图，必须在主域名 `https://msjh.bacon159.pp.ua/` 与备用域名 `https://msjh.bacon.de5.net/` 上用真实浏览器 `<img>` 加载验证，因为 CLI/Node 裸请求行为和浏览器嵌入行为不完全一致。

## 2026-06-01 GPT Image 2 预设图重生记录

- GPT image 2 预设图重生所需凭据只能保存在本机用户环境变量中。
- 主 OpenAI 兼容图片接口变量：
  - `MORAN_GPT_IMAGE2_BASE_URL`
  - `MORAN_GPT_IMAGE2_API_KEY`
- Hostcentral 备用接口变量：
  - `MORAN_GPT_IMAGE2_HOSTCENTRAL_BASE_URL`
  - `MORAN_GPT_IMAGE2_HOSTCENTRAL_API_KEY`
- Wanfeng 备用接口变量：
  - `MORAN_GPT_IMAGE2_WANFENG_BASE_URL`
  - `MORAN_GPT_IMAGE2_WANFENG_API_KEY`
- 当前非密钥端点记录：
  - 主端点 Base URL：`https://688.qzz.io`
  - Hostcentral Base URL：`https://api.hostcentral.cc/v1`
  - Wanfeng Base URL：`https://api.wanfeng.me`
- 不要把图片 API key 写入仓库文件、提交、日志、截图、客户更新说明或聊天总结。
- 辅助脚本 `scripts/regenerate-preset-images-gpt-image2.mjs` 可以用 GPT image 2 重生预设物品图，并上传到 nodeimage 或 111666：
  - Deepark 任务接口模式：`--provider=deepark`
  - OpenAI 兼容图片接口模式：`--provider=openai`
  - 111666 上传模式：`--host=111666`
  - 反向处理：`--reverse`
  - 独立报表：`--report=some-report.json`
- 截至 2026-06-01 本轮处理，`现代都市` 与 `末日丧尸` 的预设图已全部通过 GPT image 2 重生，并迁移到 111666 图床。
- 预设物品图必须是写实产品摄影风格：单个真实可触摸物体、完整可见、材质真实、 neutral 桌面/背景、无 UI 边框、无文字标签、无人像、不要插画图标风。
- 不要把本地 SVG/图标兜底图作为正式 `data/presetItemImages.ts` 注册表条目。若 GPT image 2 密钥、端点或余额不可用，必须明确报告阻塞；最多只能临时复用现有写实预设图占位，并在端点恢复后用 GPT image 2 重生覆盖。
- GPT image 2 新端点：`https://ai.songsongai.com/v1`，密钥存放在 `MORAN_GPT_IMAGE2_SONGSONGAI_API_KEY`（或复用主端点环境变量）。

## 预设物品图存储规则

- 预设物品图存储在 OneDrive 上，通过 OpenList 提供服务。
- **hi168 S3 已于 2026-06-28 停用**——旧的 S3 URL 已失效。
- 公开 URL 格式：`https://msjh.bacon159.pp.ua/api/preset-image/{URL编码后的名称}.png`（完整图）和 `thumbs/{名称}.webp`（缩略图）。
- OpenList 签名 URL 格式（内部）：`/p/Onedrive/MoRanJiangHu/preset-items/{名称}?sign={sign}`。
- 目录列表 sign 值缓存 1 小时；图片 CDN 缓存 1 年。
- 部署时需确保 `MORAN_OPENLIST_AUTH_TOKEN` Cloudflare Secret 为最新。
- OpenList 的 `/api/fs/get` 对中文文件名有 bug（object not found）；应使用 `/api/fs/list` 获取 sign 映射后构造 `/p/` URL。
- 预设图反馈页缩略图使用 `thumbs/<物品名>.webp`；卡片网格加载 `thumbSrc`，放大预览和正式注册表继续使用原始 PNG `src`。
- 新预设图上传到 OneDrive 路径：`/Onedrive/MoRanJiangHu/preset-items/<物品名>.png`。
- `scripts/regenerate-preset-images-gpt-image2.mjs` 脚本应支持 `--host=onedrive`，通过 OpenList API 上传到 OneDrive。

## OpenList / OneDrive API 调用指南（供 AI Agent 参考）

之前存放在 hi168 S3 上的所有文件已迁移到 **OneDrive**，通过 **OpenList (AList)** 代理服务器访问。以下是在代码中与该体系交互的实用指南。

### 架构概览

```
客户端请求
  → OpenList API (openlist.bacon.de5.net)
    → OneDrive（实际文件存储）
```

### 鉴权

- 所有 OpenList API 调用需要请求头：`Authorization: <token>`，令牌存放在 Cloudflare Secret `MORAN_OPENLIST_AUTH_TOKEN`。
- Base URL 默认为 `https://openlist.bacon.de5.net`（环境变量 `MORAN_OPENLIST_BASE_URL`）。
- 如果上传需要绕过 Cloudflare，可使用 AList/OpenList 源站直连地址 `http://159.138.7.126:5244` 作为 API base URL。公开下载和面向网站的 URL 仍应使用文档中的公开域名，除非任务明确要求测试源站直连。

### 主要 API 端点

**1. 列出目录内容 — `POST /api/fs/list`**

这是发现文件和获取签名下载令牌的主要方式。

```json
// 请求体：
{ "path": "/Onedrive/MoRanJiangHu/releases", "password": "", "page": 1, "per_page": 100, "refresh": false }

// 响应：
{ "code": 200, "data": { "content": [
  { "name": "latest.apk", "is_dir": false, "size": 48700000, "sign": "abc123..." },
  ...
]}}
```

每个文件项都有 `sign` 字段——这是代理下载所需的签名令牌。

**2. 代理下载 — `GET /p/{onedrive路径}?sign={sign}`**

通过 OpenList 代理下载文件。OneDrive 存储驱动**必须启用"网页代理"选项**，否则返回 403。

```
GET https://openlist.bacon.de5.net/p/Onedrive/MoRanJiangHu/releases/latest.apk?sign=abc123...
```

**3. 获取文件信息 — `POST /api/fs/get`**

返回文件元数据，包含 `raw_url`（OneDrive CDN 直链）。但此接口对**中文文件名有 bug**（返回"object not found"），建议改用 `/api/fs/list`。

```json
// 请求体：
{ "path": "/Onedrive/MoRanJiangHu/releases/latest.apk", "password": "" }
```

**4. 创建目录 — `POST /api/fs/mkdir`**

```json
{ "path": "/Onedrive/MoRanJiangHu/new-folder" }
```

**5. 删除文件 — `POST /api/fs/remove`**

删除到 OneDrive 回收站，支持批量删除。

```json
{ "dir": "/Onedrive/MoRanJiangHu", "names": ["file1.png", "file2.png"] }
```

**6. 移动文件 — `POST /api/fs/move`**

```json
{ "src_dir": "/Onedrive/MoRanJiangHu", "dst_dir": "/Onedrive/MoRanJiangHu/archive", "names": ["file1.png"] }
```

### 代码中的使用方式

- **预设图片**：调用 OpenList `/api/fs/list` 获取 preset-items 目录的 `{文件名 → sign}` 映射（缓存 1 小时），然后通过 `/p/` URL 代理下载图片。
- **APK 下载**：调用 `/api/fs/list` 获取 releases 目录下 `latest.apk` 的 sign 值，然后重定向到 `/p/` 代理 URL。通过 `?provider=onedrive` 查询参数触发。

### 重要注意事项

- **不要使用 `/api/fs/get`** 处理文件名包含中文的情况——应使用 `/api/fs/list` 并按名称匹配。
- **批量操作**（move/remove）每批应 ≤20 个文件，避免 `ECONNRESET` 超时。
- OpenList 鉴权令牌会过期；如果代理调用返回"token is invalidated"，需要从 OpenList 管理面板重新生成令牌。
- OneDrive 代理下载速度约 ~464 KB/s。目前是唯一的 APK 分发渠道。

### 上传规则（关键 — 来自 2026-06-28 事故教训）

**绝对不要使用 `/api/fs/form`（POST multipart）上传文件。** 该端点被 Cloudflare WAF/Rocket Loader 拦截——无论文件大小，它都返回 OpenList 前端 HTML 页面（HTTP 200）而非 JSON，响应中注入了 `cloudflare-static/rocket-loader` 脚本，不是有效的 API 响应。

**始终使用 `/api/fs/put`（PUT + 原始 body）上传文件：**

```bash
curl -X PUT "http://159.138.7.126:5244/api/fs/put" \
  -H "Authorization: $MORAN_OPENLIST_AUTH_TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "File-Path: /Onedrive/MoRanJiangHu/releases/latest.apk" \
  --data-binary @"app-release.apk"
```

上传必要参数：
1. **方法必须是 PUT**，不是 POST。
2. **文件路径放在 `File-Path` 请求头**（URL 编码格式，不是 base64）。
3. **Body 是原始二进制流**，不是 multipart form 数据。
4. **`/Onedrive/` 首字母必须大写 O**——小写 `/onedrive/` 会导致 `storage not found` 错误。
5. **`Content-Type` 应设为实际文件 MIME 类型**（如 APK 用 `application/vnd.android.package-archive`）。
6. **Cloudflare 干扰 OpenList 上传时，优先使用源站直连上传地址 `http://159.138.7.126:5244`**；不要把该地址作为面向客户的公开下载 URL。

上传大小实测（2026-06-28）：
- 5MB PUT：✅ 3.4秒（约 1.5 MB/s）
- 20MB PUT：✅ 17.8秒（约 1.1 MB/s）
- 50MB PUT：✅ 47.1秒（约 1.1 MB/s）
- 47.4MB APK PUT：✅ 37.7秒（约 1.3 MB/s）
- `/api/fs/form` 任意大小：❌ 被 Cloudflare 拦截，返回 HTML

## 物品图提示词过滤规则

- 物品图生成提示词只能描述物体的物理外观，不能包含游戏机制文字。
- `services/ai/itemImageGeneration.ts` `构建物品视觉描述`：
  - 当结构化物品有 `生图描述` 时，只使用 `生图描述` + `视觉标签`；不要混入 `描述`、`词条列表`、`来源描述`、`关联事件`。
  - 当没有结构化 `生图描述` 时，通过 `是否游戏机制文案` 过滤掉包含游戏机制关键词（兑换/强化/支线剧情/奖励点/属性/技能/等级/经验/伤害/冷却/暴击/命中等）的 `描述` 文本。
  - `构建物品视觉主体描述` 回退到 `item?.描述` 时也必须通过同样的过滤。
- 错误提示词示例："承载一段c级支线剧情用于兑换高级强化" → 对于卷轴物品应该是 "an ornate scroll with aged paper and wax seal"。
- `structuredItemLibrary.ts` 中的 `生图描述` 必须始终是纯英文物理描述，不能包含游戏机制文字。

## 题材模式预设图反馈规则

- 每次新增题材模式时，该模式的预设物品和预设图必须同步进入公开预设图反馈数据。
- 不能只更新 `utils/topicModeProfiles.ts`、`data/structuredItemLibrary.ts` 或 `data/presetItemImages.ts`；还必须运行 `npm.cmd run preset:feedback`。
- 必须确认 `public/assets/item-preset-feedback-data.json` 包含新题材模式分类，并且该模式的预设图能在 `/item-preset-feedback` 页面看到。
- `scripts/sync-item-preset-feedback-data.mjs` 应继续从 `题材模式顺序` 自动推导题材分类，不要退回手写旧模式列表，避免未来新增模式被静默漏掉。

## 小米 MiMo Agent 协同规则

- 小米 MiMo 可以作为执行型/代码修改型模型，用来承担实现量较大的代码编辑工作；Codex 仍负责定位 bug、制定修改方向、审查代码、运行验证，并在结果有问题时亲自修正。
- 这种方式可以减少 Codex 在大段代码编辑初稿上的 token 消耗，但不能让 Codex 完全不消耗 token，因为 Codex 仍需要阅读上下文、写清楚任务、审查 diff、运行验证，并在委派结果错误或不完整时兜底。
- 本机凭据只能保存在用户级或进程级环境变量中，禁止写入仓库文件、提交、日志、截图、客户更新说明或聊天总结。
- 当前本机小米环境变量名：
  - `XIAOMI_API_KEY`
  - `XIAOMI_OPENAI_BASE_URL`
  - `XIAOMI_ANTHROPIC_BASE_URL`
  - `XIAOMI_CODE_MODEL`
  - `XIAOMI_FAST_MODEL`
  - `XIAOMI_MODEL_LIST`
  - 供现有工具兼容使用的 OpenRouter 别名：`OPENROUTER_API_KEY`、`OPENROUTER_BASE_URL`、`OPENROUTER_MODEL`
- 当前非密钥端点/模型记忆：
  - OpenAI 兼容接口：`https://token-plan-cn.xiaomimimo.com/v1`
  - Anthropic 兼容接口：`https://token-plan-cn.xiaomimimo.com/anthropic`
  - 首选代码修改模型：`mimo-v2.5-pro`
  - 快速/简单任务模型：`mimo-v2.5`
  - 可用模型：`mimo-v2.5-pro`、`mimo-v2.5`、`mimo-v2.5-asr`、`mimo-v2.5-tts-voiceclone`、`mimo-v2.5-tts-voicedesign`、`mimo-v2.5-tts`、`mimo-v2-pro`、`mimo-v2-omni`、`mimo-v2-tts`
- 多 Agent 协同调用方法：
  - 先由 Codex 阅读相关代码、定位可能根因，并给 MiMo 写一份范围很窄的任务说明。
  - 只把完成当前任务所需的文件、约束、预期行为和验证命令交给 MiMo。
  - 优先把局部代码编辑、机械性重构、纯文档更新、简单版本/发布准备步骤、边界清晰的修复初稿交给 MiMo。
  - 不让 MiMo 独立决定发布范围、版本号策略、公开更新日志内容、密钥处理或部署时机。
  - MiMo 修改后，Codex 必须审查 diff，检查是否有无关改动或密钥泄露，运行必要测试/构建，并在汇报完成前直接修复残留问题。
  - 部署或发布工作只能在用户明确要求“部署/发布/上线”后委派；Codex 仍必须监督并执行本项目的发布、备份、验证和禁止自动部署规则。

## APK 分发架构总览（截至 2026-07-13，B2 已废弃）

### 概述

APK 分发系统采用 KV manifest + 非 B2 二进制托管：

1. **Cloudflare KV** — 存储 release manifest（`release-manifest/latest.json`），作为版本元数据（versionName、versionCode、releaseNotes 等）的唯一真实来源。
2. **GitHub Release + GitHub 加速链接** — 主要快速 APK 下载渠道。manifest 默认应优先 `github`。
3. **OneDrive 经 OpenList 代理** — APK 二进制托管和兜底渠道。下载通过 `openlist.bacon.de5.net/p/` 使用签名 URL 代理。APK 文件存储在 `/Onedrive/MoRanJiangHu/releases/latest.apk` 和 `/Onedrive/MoRanJiangHu/releases/MoRanJiangHu-v<version>.apk`。

**已停用渠道**：hi168 S3（2026-06-28）、Cloudflare R2（完全停用，包括旧版 manifest 路径）、Backblaze B2 APK 分发（2026-07-13）。不要再向 B2 上传 APK，不要把 B2 URL 写入 `apkUrls`，也不要把 B2 设为默认 provider。

### APK 下载流程

- `GET /api/apk/latest.json` — 从 KV 读取 manifest，并只用稳定 URL、GitHub 加速 URL、GitHub Release URL 和 OneDrive URL 动态构建 `apkUrls`。B2 不得出现。
- `GET /api/apk/latest.apk` — 默认下载使用 GitHub Release / GitHub 加速；只有请求 `?provider=onedrive` 或 `?provider=onedrive-direct` 时才走 OneDrive。
- `GET /api/apk/version/{file}` — 带版本号下载默认使用 GitHub Release / GitHub 加速；可通过 provider 参数请求 OneDrive。
- `?provider=b2` 已明确废弃，应返回 410，不再重定向。

### B2 状态（已废弃）

B2 APK 分发已于 2026-07-13 废弃。部分遗留辅助代码和环境变量名可能仍为兼容或未来清理而存在，但发布流程不得依赖 B2。manifest 发布应使用 `npm run release:manifest`，该步骤默认只写 KV manifest，并跳过 B2 上传。

### Cloudflare Secrets（当前）

- `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` — GitHub OAuth
- `GITHUB_NATIVE_CLIENT_ID`、`GITHUB_NATIVE_CLIENT_SECRET` — GitHub 原生 OAuth
- `FANDOM_PRESET_GITHUB_TOKEN` — 用于 fandom 预设仓库访问的 GitHub token
- `IMAGE_HOST_TOKEN` — 图床鉴权
- `MORAN_OPENLIST_AUTH_TOKEN` — OpenList/AList API token，用于 OneDrive 代理
- `ONLINE_ADMIN_PASSWORD` — 在线管理面板访问
- B2 secrets 可能仍保留在 Cloudflare 里用于遗留清理，但不再属于当前 APK 分发主链路。

### OneDrive 数据布局

```
/Onedrive/MoRanJiangHu/
├── apk/              — APK 二进制文件 (latest.apk, ~48.7MB)
├── releases/         — 带版本号的发布 APK (~97MB)
├── saves/            — 游戏存档包 (~9.5GB, 851 项)
├── preset-items/     — 预设物品图片 + 缩略图 (~901MB, 496 项)
│   └── thumbs/       — WebP 缩略图
├── chunks/           — 存档同步分片
├── codex-env/        — 加密的环境变量备份
├── manifest-backups/ — Release manifest 备份
└── e2e/              — 端到端测试数据
```

### 死代码与已移除引用

- `functions/api/preset-image/[[path]].ts` 中仍包含 `tryLegacyS3()`，尝试从 hi168 S3 获取 `s3_` 模式的文件。由于 hi168 返回 403，此调用始终失败并静默回退到 OneDrive 代理路径。可在未来清理中安全移除。
- 所有 `s3_` 前缀遗留图片文件已从 OneDrive 删除。预设图片注册表（`data/presetItemImages.ts`）仅使用新 URL 格式（`/api/preset-image/{name}.png`）。

### 向其他 AI 助手分享此架构

在让另一个 AI 助手（Cursor、Claude 等）参与本项目的文件分发或发布流程时，分享本文件中的"APK 分发架构总览（截至 2026-07-13，B2 已废弃）"章节。它涵盖当前架构：KV manifest、GitHub/GitHub 加速下载、OneDrive 渠道、下载流程和 OneDrive 数据布局。

## Cloud Studio ComfyUI 后端迁移记忆

- CNB 现在只是 ComfyUI 生图后端的临时迁移来源，免费 GPU 到期后预计废弃。
- Cloud Studio 目标后端仓库是 GitHub 私有仓库 `ypq123456789/comfyui-cloudstudio-msjh`。
- 本地 Cloud Studio 后端工作区是 `F:/code/comfyui-cloudstudio-msjh`；旧 CNB 来源工作区是 `F:/code/comfyui-ql-cnb-fix`，后续 Cloud Studio 工作默认不要修改旧 CNB 仓库，除非用户明确要求。
- Cloud Studio 导入流程：
  1. 在 Cloud Studio 中从 GitHub 导入 `ypq123456789/comfyui-cloudstudio-msjh`。
  2. 打开工作空间终端。
  3. 运行 `bash cloudstudio_start.sh`。
  4. 在 Cloud Studio 中打开/预览 `8188` 端口。
  5. 如果脚本没有自动识别公网地址，设置 `CLOUDSTUDIO_IMAGE_BACKEND_URL` 为 8188 预览地址，然后运行 `bash cloudstudio_sync.sh`。
- Cloud Studio 环境变量名：
  - `CLOUDSTUDIO_TOKEN`：Cloud Studio 账号/API token。只能放在本机用户环境变量或 Cloud Studio Secret，禁止提交。
  - `CLOUDSTUDIO_IMAGE_BACKEND_URL`：自动识别失败时手动填写的 8188 ComfyUI 公网预览地址。
  - `CLOUDSTUDIO_IMAGE_BACKEND_CONNECT_TOKEN`：墨色江湖自动发现列表中用于筛选自己后端的连接口令。
  - `CLOUDSTUDIO_IMAGE_BACKEND_PORT`：ComfyUI 端口，默认 `8188`。
  - `MSJH_IMAGE_BACKEND_SYNC_URL`：后端注册表上报地址，默认使用公开网站的 `/api/image-backend/sync`。
  - `MSJH_IMAGE_BACKEND_SYNC_TOKEN`：后端注册表上报 token，必须作为 Secret 保存，禁止写入仓库。
- 墨色江湖前端应使用通用云端后端注册表路径 `/api/image-backend/sync`；`/api/image-backend/cnb-sync` 只保留向后兼容。
- 不要把真实 Cloud Studio token、同步 token、或包含秘密的预览 URL 写进 AGENTS 文件、提交、日志、截图或客户更新说明。

## 2026-08-16 创意工坊清空事故与 D1 双库分叉恢复

- 症状：两个公开域名的 `/api/workshop/modules` 返回 `{"ok":true,"entries":[]}`，玩家反馈社区模式包全部消失。
- 根因链：
  - 创意工坊数据存于 D1 表 `workshop_data`，键 `moranjianghu/workshop/modules/index/latest.json`。超过 700KB 的值会被拆成 1 行清单 + 若干 `::chunk-N` 分块行（见 `functions/api/_shared/dbStore.ts`）。
  - 2026-08-09 的账号迁移把域名 zone 移入新账号，流量切到新账号 Worker，其绑定的 D1 是 `moranjianghu-db-backup`（id `d72fe8c8-...`）。这个库是 2026-06-28/29 前后复制的**残缺快照**：索引清单行被复制了，但它的 2 个分块行（以及 2 条 TOPIC 投稿行）没有。`get()` 把"清单在、分块缺失"当作数据不存在，于是 zone 迁移当天创意工坊列表静默变空。
  - 旧账号 D1 `moranjianghu-db`（id `0a9c1910-...`）在 2026-08-09 前一直在接真实写入（投稿、联机账号注册），数据完整：2026-07-10 重建的 3.5MB、10 分块索引加后续增量行。
- 2026-08-16 执行的恢复（纯数据操作，未部署）：
  - 先备份新库（`.tmp-workshop-recovery/newdb_backup_20260816.sql`）和旧库 workshop 表（`.tmp-workshop-recovery/workshop_data_old.sql`）；两者均为本地文件，禁止提交。
  - 旧库 → 新库同步：`workshop_data`/`workshop_novel_data` 全量覆盖（52+27 行）；`cloud_play_data`/`diagnostic_reports`/`online_hourly_history`/`apk_download_daily` 按 `updated_at` 取新做并集合并。
  - 验证双域名均恢复 16 个模块（11 个模式包、2 个酒馆预设、3 个生图工作流），`action=download` 能正确重组分块数据。
- 根治代码修复（本地完成，尚未部署）：
  - `functions/api/_shared/dbStore.ts` 的 `put()` 原来先删旧分块再写新值；写入批次一旦失败（D1 503/瞬时错误）就会留下孤儿清单，整条数据静默丢失。现改为先原子写入新值、后清理多余分块，清理失败只告警不报错。
  - `get()` 在清单的分块缺失时通过 `console.error` 记录 `orphan chunk manifest`，损坏可在 Worker observability 日志中看到，不再静默。
  - 回归测试在 `__tests__/dbStoreAtomicWrite.test.ts`（8 个用例全部通过），包含"写入失败时旧分块值必须仍可读"。
- 记忆：旧账号 Worker 仍存在（workers.dev 已禁用、zone 已迁走、无流量），旧 D1 `moranjianghu-db` 现在是冻结备份，禁止写入。今后账号/域名迁移后若 D1 数据看起来为空，先对比两个账号的键集合与行数，再判断是否真的丢数据。

## 2026-08-16 加固跟进：双库校验、D1 备份、同域 AI 中转

- 数据完整性加固（代码完成，尚未部署）：
  - `functions/api/workshop/modules.ts` 的 `readIndex()` 不再静默吞错：存储不可用、主索引不可读、增量列表读取失败、增量行损坏均记录错误日志，GET 响应在数据可能不完整时携带 `warning` 字段；`CreativeWorkshopModal` 通过现有状态栏展示该提示。
  - `scripts/verify-d1-parity.mjs` 对比两个 D1 数据库业务表的行数、键集合、updated_at。"仅存在于旧库的键"就是"残缺快照"信号。今后任何账号/数据库迁移后必须运行。脚本带请求重试（曾因网络抖动产生一次假差异）。
  - `scripts/backup-d1-to-onedrive.mjs` 导出生产 D1（`moranjianghu-db-backup`）并上传到 OneDrive `/Onedrive/MoRanJiangHu/d1-backups/`，保留最近 8 份。2026-08-16 已完成首份真实备份（41MB，字节数校验通过）。建议定期运行，暂无定时器。
- 网页版跨域中转（代码完成，尚未部署）：
  - 新端点 `functions/api/ai-relay/[[path]].ts`：为被浏览器跨域拦截的第三方 AI 请求做同域中转（直连报 TypeError/Failed to fetch 时使用）。SSE 流式响应原样透传。防护：仅 http/https、仅 80/443 端口、禁止指向自家域名、禁止私有/回环 IP 字面量（SSRF）、上游路径白名单（`chat/completions`、`completions`、`messages`、`models`、`embeddings`、`responses`、`images/generations`、`images/edits`、`audio/speech`、`count_tokens`）、请求体上限 2MB、不跟随重定向。Authorization 仅透传，不落盘不记录。
  - 前端 `services/ai/corsRelay.ts`：仅网页环境（APK 原生不启用）；直连优先，网络层失败时自动经同域中转重试一次。`请求模型文本` 失败时附带跨域引导文案。模型列表拉取在 `构建OpenAI兼容模型列表候选地址` 中于直连候选之后追加中转候选（全部 10+ 个设置组件自动继承）。开关在接口设置中（`网页版跨域自动中转`，默认开启，存 localStorage `msjh_ai_cors_relay_mode`）。
  - 测试：`__tests__/aiRelayCors.test.ts`（12 用例：端点防护、转发、错误透传、corsRelay 逻辑）。`__tests__/apiModelSelection.test.ts` 断言已更新以包含追加的中转候选。

## 2026-08-28 金钱别名写穿透修复与 v1.0.657 发布记忆

- 玩家反馈（darkvanmaster）：AI 下发 `set 角色.金钱.银子 = 6270` + `set 角色.金钱.baseAmount = 6270000`，但只有 `baseAmount` 生效；JSON 里保留陈旧的 `中层货币: 3500`，面板（经 `规范化角色金钱` 读三层字段）金额不动。与创意工坊预设无关，原版存档同样复现。
- 根因：金钱对象同时存在两套字段——三层货币（`上层货币/中层货币/底层货币`）与旧别名（`金元宝/银子/铜钱` + 题材别名）+ `baseAmount`。变量提示词让 AI 写旧别名；但 `读取货币数值` 优先取三层字段，每回合金钱归一化（`规范化角色物品容器映射` → `从物品列表汇总角色货币` → `规范化角色金钱`）会用陈旧三层字段把刚写入的别名值反向覆盖。`baseAmount` 读取是"有现成值就保留"，所以它"生效"。
- 修复（PR #76，随 v1.0.657 发布）：`hooks/useGame/stateTransforms.ts` 新增 `提取金钱命令字段` + `同步金钱命令写入`；`hooks/useGame/responseCommandProcessor.ts` 在 tavern_commands 应用完、金钱归一化前执行写穿透：以 AI 本回合写过的字段为权威——写别名/层级 → 同步三层并重算 `baseAmount`；只写 `baseAmount` → 分解为三层；已存在的题材别名字段（灵石/现金/存款/灵晶…）对齐到所属层级现值（只覆盖已存在键，绝不新增）。回归测试：`__tests__/moneyCommandWriteThrough.test.ts`（13 例）。
- CodeRabbit 评审（PR #76，CHILL 档）：1 条 Major——只写 baseAmount 时必须同步刷新题材货币别名字段；已在 commit 2d80723 修复并补测试。该计划评审额度为每小时 1 次，增量复审可能滞后。
- 发布面发现（2026-08-28）：
  - VPS 域名 `moranjianghu.bacon159.pp.ua` 已失联（DNS 可解析、TCP 443 不通）。APK provider 路由（`functions/api/apk/_providerRouter.ts`）请求时不校验存活，quark/fullstack 失败时会把默认 `/api/apk/latest.apk` 302 到该死链。`scripts/publish-release-b2.mjs` 的 `MORAN_RELEASE_PREFERRED_APK_PROVIDER` 默认值已由 `vps` 改为 `github`（环境变量覆盖仍可用）。
  - `apk-dist` 分支自 v1.0.646 起就未同步（github-raw 渠道对新版本 404）。已用 `node scripts/publish-apk-github-raw.mjs` 同步到 v1.0.657 并端到端验证（cloudflare-proxy pages → raw → SHA-256 一致）。
  - v1.0.657 三个 APK 渠道均以 SHA-256 `c9ab9fc4...` 验证通过：OneDrive、GitHub Release（gh-proxy 加速）、GitHub raw（apk-dist + pages 加速）。
- 关键 Cloudflare 部署认证发现：本地 wrangler 存储的登录是旧账户（`648558021@qq.com`），无法操作新账户（`1524640484@qq.com`）——`kv put`/`deploy` 报 `Authentication error [code: 10000]`；且清空代理变量后 wrangler 会静默失败（退出码 0、无任何输出）。生产 Cloudflare 操作必须从 Windows 用户级环境变量 `CF_MIGRATE_TARGET_GLOBAL_API_EMAIL` / `CF_MIGRATE_TARGET_GLOBAL_API_KEY` / `CF_MIGRATE_TARGET_ACCOUNT_ID` 读取（PowerShell `[Environment]::GetEnvironmentVariable(...,'User')`），注入为 `CLOUDFLARE_EMAIL` / `CLOUDFLARE_API_KEY` / `CLOUDFLARE_ACCOUNT_ID`，并保留代理保证网络可达。`release:manifest` 输出若出现 `[KV] manifest write failed (non-fatal)`，说明 KV 清单没有更新——脚本仍会"完成"，必须当成失败处理。

## 2026-08-29 自动入队收紧（v1.0.658）

- 玩家反馈（Xxx）：只要是主线人物，就会自动加入队伍。
- 根因（PR #77，两层）：本地 `同行强确认事实正则` 把纯叙事移动动词（跟随/跟着/带着/领着/护送/压阵/随身/并肩/并行）当入队证据；`prompts/stats/npc.ts` 第 48 条又要求 AI 对"随主角同行/护送主角/并肩作战"写 `是否队友=true`，与叙事语言大面积误命中。
- 修复：入队证据收窄为耐久同伴语义（同行/随行/随队/随我/随主角/同去/同往/同来/队友/同伴/结伴/追随主角/追随我）；提示词补充明确证据清单 + 反例清单 + "主要角色/主线人物绝不因戏份多自动入队"。真实入队仍由显式 `set 社交[i].是否队友` 命令承载。
- CodeRabbit Major 跟进：新增 `同行临时或否定事实正则`（短暂/暂时/临时/片刻/一程/一段路/婉拒/拒绝/谢绝/推辞/回绝/不曾/并未），在 `是否明确同行实名` 与 `应用同行事实到队伍` 两处生效——"短暂同行一段路""婉拒了结伴同行"不再入队。另一条 Minor（要求 NPC `位置路径` 改六层地图树格式）已说明原因跳过：`位置路径` 由环境字段（大/中/小地点+具体地点）拼接，与地图树是两条数据链。
- 测试：`__tests__/responseCommandProcessor.test.ts` 新增 4 例（叙事带路/护送/跟人群不入队；结伴/追随主角入队；短暂同行不入队；拒绝结伴不入队）。既有"带着…随队听令""明确跟随…同行"场景不受影响。

## 2026-08-29 K-Vault 云端存档 404 事故、上传通道修复与 v1.0.659 发版

- 玩家报告：`读取云端存档失败：读取云端存档清单失败：HTTP 404`，界面保留 43 个缓存的云端存档。D1 `cloud_play_data` 共 193 个云端游玩账号，其中 118 个携带迁移前的 `manifestUrl`，全部 404。抽样实测：清单 URL 返回 k-vault 的 `File not found`（404），但文件元数据行仍存在于 `k-vault-metadata-fresh` D1。
- 根因一（清单/存档包不可读）：k-vault 把 Telegram 文件签名为 `tgs_<载荷>.<HMAC>.<扩展名>`，验签密钥列表为 `[FILE_URL_SECRET, TG_FILE_URL_SECRET, TG_Bot_Token, 'k-vault-default-secret', 'tgbed-default-secret']`。2026-08-09 跨账号迁移重建 `k-vault` worker 时配了新的 `TG_Bot_Token`，而迁移前链接是用旧存储 bot（操作者笔记里与存储频道 `TG_Chat_ID` 成对出现的 @ziyongtuchuang_bot 的 token）签的名。验签失败 → 落到字面量键查找 → 404。离线验证：旧 bot token 的 HMAC 与 3/3 存量签名匹配；笔记里的"旧bottoken/新bottoken"两个 token 均不匹配（它们是另外的机器人）。另外 Telegram file_id 与 bot 绑定：新 bot 对旧 file_id 调 `getFile` 返回 400，所以只修签名不可行，必须恢复旧 bot 本体。
- 修复一：`wrangler secret put TG_Bot_Token --name k-vault` 换回旧存储 bot（仍然存活、仍是存储频道管理员）。从 2026-08-09 17:05（北京时间）到修复时零上传，不存在依赖中间 token 的文件。修复后实测：抽样清单 URL 返回 200 与完整存档列表（12/831/1601 个），存档包下载 206 且为 JSON 内容。
- 根因二（上传通道静默瘫痪 20 天）：zone 切换后 k-vault 零上传。两个原因叠加：(a) 每个迁移前账号的上传流程第一步（`读取云端存档清单`）就 404 中止；(b) 站点 worker 对 `image1.bacon159.pp.ua` 的上游 POST 返回 **522**——`image1` 是**灰云（DNS-only）CNAME → cdn.sanpin.ltd**，worker 路由只对橙云记录生效，且 CF worker → sanpin 中转的子请求被拒（玩家浏览器能到 k-vault 是因为外部中转转发进 CF 边缘）。本 zone 对国内可达性采用有意的灰云 CDN 中转设计（`msjh` → 182682.xyz 中转，`image1/cdn/jjs/tuchuang` → sanpin.ltd）——不要贸然把这些记录改橙云。
- 修复二（上传通道，不动 msjh 代码/不发版）：给 k-vault 开启 `workers_dev = true`（CF 内部子请求可达 `https://k-vault.1524640484.workers.dev`），把站点 worker 机密 `IMAGE_HOST_BASE` 指到该地址，并同步轮换站点机密 `IMAGE_HOST_TOKEN` 与新建的 k-vault API 令牌（在 `k-vault-metadata-fresh`.kv_store 写入 `api_token:<id>` 行，信封格式 `{__kvEnvelope:1,value:"<记录JSON>",valueEncoding:"text"}`，记录含 `{id,name,scopes,tokenSalt,tokenHash:sha256hex(salt+':'+secret),tokenSuffix,...}`，令牌格式 `kvault_<id>_<secret>`）。站点旧令牌值对 k-vault 是 TOKEN_INVALID。
- 修复三（下载链接必须保持国内可达）：`/api/v1/upload` 此前用请求 origin 拼 `links.download`，经 workers.dev 上传就会生成 workers.dev 下载链接（国内常不可达）。k-vault 提交 `d7042c0`（仓库 `ypq123456789/K-Vault`，分支 `fix/r2-class-a-billing-d1`）：`buildAbsoluteUrl(request, path, preferredBase)` 优先使用 `PUBLIC_BASE_URL`，`/api/v1/upload` 传入 `env.PUBLIC_BASE_URL`（变量值 `https://image1.bacon159.pp.ua`）。端到端验证：站点代理上传 → 200 telegram 存储 → 链接为 image1 域名 → 下载 200 内容一致。测试文件事后已删除。注意：`paste.js` 仍按请求 origin 拼链接（未改动，属未用路径）。
- 纠正一个误判：k-vault 的 `DEFAULT_STORAGE_TYPE=s3` 绑定对已部署 worker 完全无影响——`functions/` 从不读取它（上传 storageMode 缺省即 `"telegram"`）；它只影响未部署的 Node `server/` 模式。站点图片上传（`?kind=image`）走 PicUI/tuchuang-xqd，不经 k-vault。已在 `wrangler.152.toml` 把该值改为 `telegram`（仅为卫生，非行为修复）。
- k-vault 部署地雷（关键）：线上 DB 绑定是 `k-vault-metadata-fresh`（`1f747ac2-7845-41d7-9613-4d85708912ab`），而本地 `wrangler.152.toml` 之前指向 `k-vault-metadata-backup`（`1455d6e0-...`，只有 2.3 万行的不完整副本）。用未修正的 toml 部署会静默把元数据存储回退。toml 已修正；今后任何 k-vault 部署后必须核对 DB 绑定。
- 操作者凭据笔记的坑：粘贴的笔记里 `旧bottoken`/`新bottoken`/`TG_Bot_Token` 属于不同机器人。k-vault 存储 bot 是与 k-vault `TG_Chat_ID` 成对出现、名字为自用图床（@ziyongtuchuang_bot）的那一个。采信笔记前先用真实存量 `tgs_` 载荷做 HMAC 验证。严禁把 bot token 写入仓库文件；运行时从笔记提取、经 stdin 传入。
- 同日 v1.0.659 发版：PR #78（日间主题新增两组色系浅染规则修复彩色深底胶囊可读性；小说分解"注入关"标签 `bg-gray-800`→`bg-black/50`；`InlineSelect` 新增可选 `wrapLabel`；生成流程图渠道/模型文字与内联下拉改为自动换行不再省略号）——CodeRabbit CHILL 审查零意见。发版流程：合并 → 升版 1.0.659 → 备份提交 `80a3724` → 发布时间刷新 `3b51035` → 用最终 main 重打 APK（sha256 `455e028f...`，apksigner v2，证书 `0c638692...` 与发布密钥库一致）→ OneDrive + KV 清单 → GitHub Release v1.0.659 + apk-dist 同步 → 双域验证（release-info 版本/时间、bundle 哈希 `index-B2R19kHK.js`、三渠道 APK sha256 一致）。切记：`release:manifest` 不会自动创建 GitHub Release 资产——必须跑 `npm run release:github`，否则默认 APK 重定向在 gh-proxy 处 404。

## 2026-09-14 流式请求补同域中转兜底 与 中转鉴权头转发（v1.0.667）

- 玩家反馈：网页版玩家遇到 `无法连接到接口服务器（已自动尝试同域中转仍失败）`，底层错误是 `API Error: network error during stream request`；但应用内「测试连接」按钮却能通过。而且那句提示本身也不属实——流式路径根本没有尝试过中转。
- 根因：流式路径（`services/ai/chatCompletionClient.ts` 的 `解析SSE文本XHR`）用 `xhr.open('POST', endpoint)` 直连上游地址，**完全没有** `/api/ai-relay` 兜底；而非流式路径（`fetchWithCorsRelay`）早就有中转重试。由于 `enableStream = !!streamOptions?.stream`，「测试连接」走非流式所以成功，主剧情流式必然失败。
- 修复（PR #86，合并进 `main` 为 `9b43c9b`）：
  - 流式 XHR 调用被包装：直连失败且是网络层错误、**且尚未收到任何响应字节**时，才通过 `/api/ai-relay` 重试一次。已经产生正文的请求绝不重发（避免重复生成/重复计费）；`协议请求错误.已接收字节` 负责记录已收到的正文长度。
  - 连接失败文案改为真实：只有真的尝试过中转才显示「已自动尝试同域中转仍失败」；正文中断的情况改为说明"为避免重复计费未自动重发"。本地/局域网地址会额外给出针对性提示。
  - `functions/api/ai-relay/[[path]].ts` 现在转发 `Authorization`、`api-key`、`x-api-key`、`x-goog-api-key`（此前只转发 `Authorization`），`Access-Control-Allow-Headers` 也同步放开。没有这一步，用 `api-key` 鉴权的供应商（例如小米 MiMo）经中转调用恒返回 401。
- 中转限制依旧存在且绕不过：`http` 仅允许 80 端口、`https` 仅允许 443 端口，私有/回环 IP 与自家域名一律拒绝，请求体上限 2 MB。因此默认的本地 Ollama（`127.0.0.1:11434`）**永远无法**走中转——这类玩家需要用 APK（原生流式，不受 CORS 限制），或把服务放到公网 443 的 HTTPS 地址上。
- 测试：`__tests__/aiRelayStreamFallback.test.ts`（8 个用例；证明直连网络失败后中转确实被调用，且收到部分正文后绝不重发），另在 `aiRelayCors.test.ts` 增加一条断言鉴权头被转发的用例。
- 验证教训：`wrangler deploy` 打包的是预先构建好的 `.tmp-worker-build/index.js`，所以任何 `functions/` 改动都必须先跑 `npm run worker:functions`，并在该产物里 grep 一个新加入的符号。不要用陈旧的产物去部署 `functions/` 改动。
