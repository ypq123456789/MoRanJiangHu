# 墨色江湖：无尽武林

`墨色江湖：无尽武林` 是一个以武侠叙事、长上下文文本游戏和 AI 工作流编排为核心的前端项目。它把开局生成、主线推进、世界观构建、世界演变、变量校准、角色与 NPC 管理、小说分解、图像资产流程与本地存档整合在同一套界面中，适合做互动叙事原型、多模型提示词实验和本地优先的 RPG 工作台。

项目默认以浏览器本地运行为主，数据主要存储在 IndexedDB 中；如需跨设备同步，可选接入 GitHub OAuth 与 Release 附件分卷上传链路。

## 项目状态

- 当前为 `Alpha` 阶段，功能覆盖面较大，仍在持续重构与整理。
- 仓库主体为前端应用，同时包含 Cloudflare Pages Functions 形式的 GitHub 云同步接口。
- 大多数模型、接口地址、分流策略与提示词配置在应用内设置页管理，而不是硬编码在 `.env` 中。

## 核心能力

- 武侠主剧情生成与回合式交互
- 开局建档、世界观生成与世界初始化链路
- 世界演变、规划分析、变量生成与变量校准
- 酒馆预设、世界书、提示词池与运行时提示词拼装
- 角色、NPC、门派、队伍、社交、任务、战斗、背包等系统面板
- 记忆召回、正文润色、风格约束与多类运行时辅助工作流
- 小说分解工作台与章节联动相关能力
- 图像生成、图像锚点、图片管理与图片资源归档
- GitHub 私有仓库云同步，支持分卷上传、下载与恢复

## 技术栈

- `React 19`
- `TypeScript`
- `Vite 6`
- `Tailwind CSS`
- `IndexedDB` 本地持久化
- `fflate` 云同步压缩与解压
- Cloudflare Pages Functions 风格接口
- GitHub OAuth / Release 附件同步
- 开发期 `NovelAI` 代理脚本

## 快速开始

### 环境要求

- `Node.js 20+`
- `npm 10+`
- Windows 下如需使用开发期 `NovelAI` 代理，建议安装 `PowerShell 7`

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

默认地址：

```text
http://localhost:3000
```

### 构建生产版本

```bash
npm run build
```

### 预览构建结果

```bash
npm run preview
```

### 提示词压力测试

```bash
npm run stress:test
```

## 运行与配置

### 本地模式

直接执行 `npm run dev` 即可体验大部分前端能力。项目中的模型选择、接口 Base URL、最大输出、提示词开关、世界书、酒馆预设等配置，主要在应用内设置页完成。

### 可选 `.env.local`

仓库仍兼容部分旧链路环境变量，可在根目录放置 `.env.local`：

```env
GEMINI_API_KEY=your_key_here
VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id
VITE_SYNC_API_BASE_URL=https://your-pages-domain.example.com
```

说明：

- `GEMINI_API_KEY` 主要用于兼容旧链路映射。
- `VITE_GITHUB_CLIENT_ID` 用于前端发起 GitHub OAuth 登录。
- `VITE_SYNC_API_BASE_URL` 用于 APK / 原生壳把同步请求指向你部署好的 Cloudflare Pages 域名；纯网页部署可留空。

### GitHub OAuth 部署检查

如果你使用 `.github/workflows/deploy-pages.yml` 通过 GitHub Actions 构建再部署到 Cloudflare Pages，需要同时配置下面两类变量：

- GitHub Actions Secret：`VITE_GITHUB_CLIENT_ID`
- Cloudflare Pages 运行时变量：`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`

缺少 `VITE_GITHUB_CLIENT_ID` 时，网页端无法发起 GitHub OAuth 登录；工作流现在会直接失败，避免把一个“登录按钮存在但无法使用”的构建发布上线。

### GitHub 云同步说明

GitHub 云同步并不只是前端按钮，还依赖 `functions/api/` 下的接口：

- `functions/api/auth/github.ts`
- `functions/api/auth/github-device-start.ts`
- `functions/api/auth/github-device-poll.ts`
- `functions/api/github/release-upload.ts`
- `functions/api/github/release-download.ts`

启用该能力时，需要额外准备：

| 位置 | 变量 | 用途 |
| --- | --- | --- |
| 前端公开环境变量 | `VITE_GITHUB_CLIENT_ID` | GitHub OAuth 登录 |
| 前端公开环境变量 | `VITE_SYNC_API_BASE_URL` | APK 访问远程同步 API |
| Cloudflare 运行环境 | `GITHUB_CLIENT_ID` | 服务端交换 access token |
| Cloudflare 运行环境 | `GITHUB_CLIENT_SECRET` | 服务端交换 access token |

注意事项：

- 单独执行 `npm run dev` 时，Vite 会启动前端与开发期 `NovelAI` 代理，但不会自动托管 Cloudflare Pages Functions。
- 如果你要完整测试 GitHub 云同步，需要将 `functions/api/` 部署到支持该目录约定的环境，或自行补齐等价的本地服务。
- APK 建议使用 `VITE_SYNC_API_BASE_URL` 指向线上站点，例如 `https://msjh.bacon.de5.net`；否则本地 `capacitor://localhost` 无法直接调用同源 `/api/*`。
- 首次云同步时，应用会要求用户输入一个私有仓库名，并自动在当前 GitHub 账号下创建私有仓库与 Release。
- 云同步会打包存档、常规设置和游戏内图片资源；提示词池、内置提示词以及 GitHub Token 不会被同步。

## 目录结构

```text
components/   UI、弹窗、功能面板与布局组件
data/         内置预设与静态数据
docs/         设计、重构与分析文档
functions/    Cloudflare Pages Functions 接口
hooks/        业务工作流与 React hooks
models/       领域模型与类型定义
plans/        功能规划与阶段性方案
prompts/      提示词系统
scripts/      开发辅助脚本
services/     AI、数据库、同步与任务服务
styles/       全局样式与主题
utils/        配置、状态与通用工具函数
```

其中 `prompts/` 主要分层为：

- `prompts/core/`：核心规则、格式、共享约束、COT 片段
- `prompts/runtime/`：开局、世界生成、变量生成、规划分析、世界演变等运行时链路
- `prompts/writing/`：写作风格、视角与正文约束
- `prompts/stats/`：经验、战斗、角色、掉落、世界等统计规则
- `prompts/difficulty/`：判定与难度相关规则
- `prompts/shared/`：跨链路共享默认值与辅助内容

## 开发提示

- 构建时可能出现 Vite 的大 chunk 警告，当前不会阻塞构建完成。
- 开发期 `NovelAI` 代理位于 `vite.config.ts` 与 `scripts/novelai-proxy.ps1`。
- 历史记录、设置、图片资源与部分缓存保存在浏览器本地数据库中，排查“旧数据残留”时要优先检查 IndexedDB。
- 仓库中同时存在中文与英文命名，新增代码请优先遵循所在模块的既有风格，不做无关重命名。
- 请统一使用 `UTF-8` 编码处理仓库内文件。

## 适用场景

- 武侠互动叙事与文字 RPG 原型
- 多提示词链路调度实验
- 长上下文剧情生成与世界状态驱动系统
- 本地优先的 AI 游戏工作台
- 需要图像资产与文本工作流协同的叙事应用

## 开源协作

如果你准备参与这个项目，建议先阅读以下文档：

- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全策略](./SECURITY.md)
- [许可证](./LICENSE)

## Android OAuth 回调补充

APK 现已切换到标准 OAuth authorization code flow，Android 侧不再依赖 device flow。

- 推荐回调地址：`https://msjh.bacon.de5.net/oauth/github/callback`
- 备用 deep link：`com.moranjianghu.game://oauth/github/callback`
- 如果需要覆盖默认 APK 回调地址，可新增环境变量：`VITE_GITHUB_OAUTH_REDIRECT_URI`
- 仓库已新增 `public/.well-known/assetlinks.json`
- 当前 release keystore SHA-256：`0C:63:86:92:59:13:00:75:0C:CC:17:CB:82:8B:52:23:BB:9A:5E:F3:33:09:57:14:37:7A:6C:D5:AD:CB:E4:8C`

注意：

- GitHub OAuth App 只能配置一个 Authorization callback URL，所以 App Link 和自定义 deep link 需要二选一。
- 默认建议优先使用 `https://msjh.bacon.de5.net/oauth/github/callback`，这样浏览器授权后可以直接通过 Android App Link 拉回 APK。
