# MoRanJiangHu Agent Notes

## AGENTS Update Output Rule

- Whenever `AGENTS.md` is updated, also provide the user with a Chinese version or Chinese summary in the same reply.
- Do not only report that the file changed; show the Chinese-readable content as well.
- Keep `AGENTS.zh-CN.md` synchronized with `AGENTS.md`. Whenever either file is updated, update the other file in the same task so the Chinese version stays current.

## Customer Changelog Rule

- After each meaningful update, also provide a short customer-facing changelog in Chinese.
- Keep it suitable for direct forwarding to customers.
- Prefer plain-language benefit statements over internal implementation detail.
- After publishing a new version, customer-facing changelog text must include the primary website domain: `https://msjh.bacon159.pp.ua/`.

## Admin/Internal Changelog Rule

- Do not include admin-only, monitoring-only, internal operations, or management console changes in customer-facing release notes or public changelogs unless the user explicitly asks.
- Keep release notes focused on player-visible gameplay, app behavior, APK, sync, or customer support changes.
- Admin-related fixes may still be committed and deployed, but should be described privately in the final engineering summary rather than in public customer changelog text.

## Release Commit Backup Rule

- Whenever publishing a new version, update the release version number first, then sync the release metadata before any build, upload, deploy, or verification step.
- Whenever publishing a new version, sync the release version first, then create a git commit as a backup before ending the task.
- Whenever publishing or updating a release version, push the release backup commit to GitHub before ending the task.
- If the GitHub push fails, clearly report the blocker, the local commit hash, and the exact branch/remote that still needs to be pushed.
- The release backup commit should include meaningful source, config, release metadata, and customer-facing documentation changes for that version.
- Do not include local debug artifacts, temporary browser traces, generated screenshots, test result folders, logs, APK/AAB binaries, or other machine-local files unless the user explicitly asks to archive them.
- If a release cannot be committed, clearly explain the blocker and list the files that still need backup.

## Release Deployment Coverage Rule

- Whenever publishing a new version, verify every public release entrypoint before ending the task.
- Before the final public deploy/upload step for a release, refresh `releasePublishedAt` to the actual current local time, then run `npm run release:sync` again before building, uploading, deploying, or verifying. The displayed release time must represent the real final publish time, not the earlier version-bump or preparation time.
- External release commands such as R2 upload, Wrangler deploy, APK download verification, and HTTPS endpoint checks must always be run with explicit timeouts. If a wrapper command can hang after partial success, split it into smaller upload/deploy/verify steps and confirm each public artifact independently instead of waiting indefinitely.
- Cloudflare/Wrangler CLI commands on this machine should be tried with proxy environment variables cleared first, for example `env HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" npm run worker:deploy` on POSIX shells or the PowerShell equivalent that sets `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` to empty before running the command. This avoids Wrangler upload/deploy commands hanging behind the local proxy.
- Required checks include the website URL in `release.config.json`, the APK download URL, the update manifest URL, and any documented backup domains or guide URLs that are part of the release surface.
- Current domain memory: the primary website domain is `https://msjh.bacon159.pp.ua/`; the backup website domain is `https://msjh.bacon.de5.net/`.
- For the current project, always confirm whether both the primary domain `https://msjh.bacon159.pp.ua/` and the backup domain `https://msjh.bacon.de5.net/` have been deployed with the same release version as the APK/update manifest.
- **CRITICAL**: After deployment, always verify `https://msjh.bacon159.pp.ua/` and `https://msjh.bacon.de5.net/` both show:
  - Correct version number matching the release
  - Accurate release timestamp (`releasePublishedAt`)
  - If version or timestamp is incorrect, the deployment is incomplete
- If a release is uploaded to R2 but the website was not deployed, deploy the Cloudflare Worker/site as part of the same release flow or clearly report why it could not be deployed.
- After deployment, verify the live site and manifest over HTTPS instead of assuming local build output is live.
- After every deployment and release backup push, check GitHub Actions CI for `ypq123456789/MoRanJiangHu` explicitly, not the upstream repository. Confirm the latest `CI` run for the pushed commit succeeds; if it fails, fetch the logs, fix when possible, and report the blocker before ending.

## No Auto-Deploy Rule

- **NEVER deploy without explicit user instruction.**
- Only run `npm run worker:deploy` when the user explicitly says to deploy, publish, or release.
- When fixing bugs or making changes, only build locally (`npm run build`) and test, do not deploy.
- If the user says "修改" (modify/fix), "修复" (fix), or "改" (change), do NOT deploy.
- Only deploy when the user says "发布" (publish), "部署" (deploy), or "上线" (go live).

## Deploy Report Rule

- After every successful deployment, immediately report:
  - Version bump: "将版本号从 X 升级到 Y"
  - Deploy time: "部署时间是当前时间 YYYY-MM-DD HH:MM"
- Every deployment MUST bump the version number and update `releasePublishedAt` to the actual deploy time before building.
- **No hotfix deploys allowed**: every deploy must increment the version number. Never deploy with the same version number as the previous deploy.
- If multiple hotfixes are deployed without a version bump, still report the deploy time and note that the version was not bumped.

## Documentation-Only Deployment Rule

- If the only meaningful change is documentation or static guide content, and the user explicitly asks to deploy without updating the version number, do not bump `versionName`, `versionCode`, or `releasePublishedAt`.
- This exception applies to documentation-only changes such as `public/cnb-comfyui-guide.html`, changelog wording, README/AGENTS updates, or other customer-facing guide text that does not change app behavior, APK contents, update manifest, or runtime code.
- For documentation-only deploys, still run a local build, deploy the website/Worker with proxy variables cleared, verify the updated public guide URL over HTTPS, and report that the version number was intentionally unchanged because it was a documentation-only deployment.
- For future documentation-only deploy requests, follow this rule by default once the user explicitly asks to deploy.

## Local File Reference Rules

- Do not use local-file Markdown or URL links.
- Only use pure references inside single backticks, for example `@components/layout/TopBar.tsx:195`.
- Use `/` in paths, including Windows paths.
- Write explanations in normal prose; keep file refs standalone.

## Shell Encoding Rule

- When reading or writing UTF-8 JSON/text on PowerShell, do not rely on the default console encoding.
- Prefer `node`, explicit UTF-8 file reads/writes, or commands that preserve Unicode text.
- If a shell workaround is needed, solve the underlying decoding issue once and record the fix, rather than repeatedly narrating the same encoding detour.

## Local UI Debug Path

When the target is UI verification, layout validation, mobile top-bar checks, or APK/web consistency checks, do not block on model or API configuration first. Prefer entering a real in-game view from an existing save.

## UI Loading Background Rule

- Loading, lazy-render, suspense, "卷轴展开中", skeleton, and side-panel placeholder states must not use black or near-black backgrounds.
- Use light paper/parchment surfaces, translucent warm overlays, or the current theme surface instead.
- This rule applies especially to right-side detail panels and any temporary frame shown before real data arrives.
- If a fallback needs contrast, improve borders, shadows, and text color; do not return to a black modal/card background.

### Preferred Path: Import Existing Save Through UI

1. Build web assets with `npm run build`.
2. Start a local preview with `python -m http.server 4173 -d dist`.
3. Open `http://127.0.0.1:4173`.
4. If the repo already contains a reusable save package, prefer `.tmp-release-assets/WuXia_Save_Data.zip`.
5. Enter the save/load flow and import the zip through the UI in `@components/features/SaveLoad/SaveLoadModal.tsx`.
6. Load a manual or auto save and confirm the app reaches `view === 'game'`.

Use this path first because it exercises the same import and load flow the user can actually trigger.

### If The Home Load Entry Is Disabled

The home page may disable the load entry until IndexedDB already has at least one save. In that case, use one of these workarounds:

1. Preferred workaround:
Import a save into IndexedDB first, then reload and use the normal load flow.

2. Temporary browser-only workaround:
In Playwright or browser devtools, temporarily remove the disabled state from the home-page load or resume button, open the save/load modal, then import the save package through the UI.

Do not commit code changes just to bypass this state unless the user explicitly asks for a product change.

### Fallback Path: Direct Save Injection Into IndexedDB

If UI import is blocked or too slow, directly write one save payload into IndexedDB.

Known local database details:

- Database name: `WuxiaGameDB`
- Save store: `saves`
- Settings store: `settings`
- Image store: `image_assets`
- Current IndexedDB version is defined in `@services/dbService.ts`

Recommended flow:

1. Extract one save json from `.tmp-release-assets/WuXia_Save_Data.zip`.
2. If browser automation cannot read local files directly, serve the extracted json on a temporary local port such as `4174`.
3. In page context, open IndexedDB `WuxiaGameDB` and `put(...)` the save object into the `saves` store.
4. Reload the page.
5. Open the load flow and read that save through the app UI.

This is only for local debugging and verification. Do not treat it as a product feature.

### Files Relevant To Save/Load Debugging

- Save/load modal UI: `@components/features/SaveLoad/SaveLoadModal.tsx`
- Save-load workflow: `@hooks/useGame/saveLoad/saveLoadWorkflow.ts`
- Save coordinator: `@hooks/useGame/saveCoordinator.ts`
- Base DB logic: `@services/dbService.ts`
- ZIP import/export logic: `@services/saveArchiveService.ts`
- Game view switch state: `@hooks/useGameState.ts`
- Main game wiring: `@App.tsx`

## Mobile Top-Bar Verification Path

When verifying the mobile top bar or APK/web consistency:

1. Use a mobile viewport such as `390x844`.
2. Reach a real in-game save, not only the landing page or new-game wizard.
3. Verify all six top cards are visible at once:
   - weather
   - environment
   - time
   - location
   - festival
   - journey
4. Click each card and confirm its detail panel appears.
5. Capture a final screenshot for evidence.

For the current implementation, the main UI file is `@components/layout/TopBar.tsx`.

## APK Validation Notes

- Web changes do not enter the Android package until `npm run apk:sync` has been run.
- After sync, build the release package with `cd android; .\\gradlew.bat assembleRelease`.
- Final APK output path: `@android/app/build/outputs/apk/release/app-release.apk`
- Every APK release must be verified with Android SDK `apksigner verify --verbose --print-certs` before upload and again after downloading the public APK. Confirm the package verifies, record the active signature scheme, and compare the certificate SHA-256 fingerprint with the release keystore.
- For this project, the expected release certificate SHA-256 fingerprint is `0c638692591300750ccc17cb828b5223bb9a5ef333095714377a6cd5adcbe48c`.
- If `adb devices` is empty, be explicit that release build and local mobile-web validation passed, but real-device install was not executed on this machine.

## Decision Rule

If the task is "confirm this UI works" and the opening flow depends on external model configuration, do not stop at the config screen. Use the save-import or save-injection path above to reach the real in-game interface and validate there.


## Auction House Item Validation Rule

- Only real game items should enter the auction house.
- **Prefer AI-based item extraction over regex patterns**: The system now supports using AI to intelligently extract and validate auction items from game responses.
- AI extraction (`services/auctionItemExtractor.ts`) can:
  - Identify market semantics (拍卖行/牙行/黑市/寄售/流入市面 etc.)
  - Identify rare item semantics (传说/绝世/极品/稀世/孤本 etc.)
  - Extract real item names and reject descriptive phrases like "一股浓浓的药", "温热的触感", "迅速驱散"
  - Validate quality-type combinations (e.g., 杂物 cannot be 传说/绝世/极品)
  - Estimate reasonable prices based on quality
- The regex-based extraction remains as a fallback when AI extraction is not available or fails.
- To use AI extraction, pass `useAIExtraction: true` and `aiExtractionResult` to `从剧情响应构建拍卖行投放参数列表`.
- If a turn has no valid items to dispatch, do not force-generate auction entries.
- The `allowInitialPlotSeed` parameter can generate 2-3 initial items at game start, but should respect quality-type constraints.


## Map Layout Optimizer Integration

- The map layout optimizer (`utils/mapLayoutOptimizer.ts`) is now fully integrated into the map spatial system (`utils/mapSpatial.ts`).
- For settlement layers (城镇/村庄/etc.) with 4 or more buildings, the optimizer automatically generates:
  - Road grid layout (2-4 horizontal + 2-4 vertical roads based on building count)
  - Buildings distributed along roads in blocks
  - Buildings occupy 65-75% of block space with proper spacing
- Roads generated by the optimizer are added to the map road list with proper IDs and metadata.
- Non-settlement layers or layers with fewer than 4 buildings use the original layout logic.
- The integration maintains backward compatibility with existing saves.
- All unit tests pass (71 tests).


## Item Image Generation Queue Rule

- Item image generation should be limited to one concurrent task at a time to avoid overwhelming the backend.
- The system should check if there are already running item image generation tasks before starting a new one.
- This prevents the issue where all items without icons are submitted for generation simultaneously.


## Image Viewer Close Button Rule

- All image viewer/preview modals must have a prominent close button in the top-right corner of the image.
- Close button should be a red circular button (h-12 w-12) with white border and red shadow.
- Button should have hover effects (scale-110, brighter shadow).
- Image viewer should position images to the right (justify-end pr-8) with max-width of 85vw.
- This applies to: Social modal character images, Equipment modal character portraits, Image manager modal, and any other full-screen image viewers.

## Equipment Portrait Display Rule

- Character portraits in equipment modal must use `object-contain` instead of `object-cover` to ensure the full portrait is visible.
- Do not crop character portraits at the top or bottom.
- The portrait container should maintain aspect ratio and show the complete image.

## Discord MCP Usage Notes

- Discord MCP uses `SaseQ/discord-mcp`.
- The Discord bot token must stay in the local user environment variable `DISCORD_TOKEN`; never write the token into repository files, scripts, commits, logs, or chat responses.
- The default guild/server ID may be stored in `DISCORD_GUILD_ID`.
- Docker startup when Docker is available:
  `docker run -d -i --name discord-mcp --restart unless-stopped -p 8085:8085 -e SPRING_PROFILES_ACTIVE=http -e DISCORD_TOKEN -e DISCORD_GUILD_ID saseq/discord-mcp:latest`
- HTTP Codex MCP registration when Docker/HTTP mode is available:
  `codex mcp add discord-mcp --url http://localhost:8085/mcp`
- Current Windows fallback registration uses the release jar in `%USERPROFILE%/.codex/tools/discord-mcp/discord-mcp-1.0.0.jar` with stdio transport. The registered command reads `DISCORD_TOKEN` and `DISCORD_GUILD_ID` from user environment variables at runtime.
- On this machine, Discord Gateway access needs the local JVM proxy flags for `127.0.0.1:10809`, including `socksProxyHost`, otherwise token verification may pass but the websocket gateway can time out.
- Verify:
  `curl -fsS http://localhost:8085/actuator/health`
  `codex mcp list`
  `codex mcp get discord-mcp`

## Object Storage Sync Notes

- The user may use hi168 S3-compatible object storage for save sync.
- Keep object storage credentials only in local user environment variables; never write Access Key or Secret Key into repository files, commits, logs, release notes, or chat responses.
- Local environment variable names:
  - `MORAN_OSS_USERNAME`
  - `MORAN_OSS_ACCESS_KEY`
  - `MORAN_OSS_SECRET_KEY`
  - `MORAN_OSS_ENDPOINT`
  - `MORAN_OSS_BUCKET`
- Current non-secret defaults:
  - endpoint: `https://s3.hi168.com`
  - bucket: `hi168-19275-07130td3`
- hi168 uses an S3-compatible API and should be called with path-style URLs: `https://s3.hi168.com/<bucket>/<key>`.
- The app-side object storage sync should use the `/api/object-storage-proxy` runtime endpoint, AWS Signature V4 signing, region `auto`, service `s3`, and the same manifest/chunk/incremental-sync semantics as WebDAV.
- The storage prefix defaults to `MoRanJiangHu`; save packages live under `MoRanJiangHu/saves`, chunks under `MoRanJiangHu/chunks`, and the manifest is `MoRanJiangHu/manifest.json`.
- For local end-to-end testing, load the credentials from user env vars, PUT a small object under `MoRanJiangHu/e2e/`, GET it back, verify content, then DELETE the test object.

## 2026-05-17 Map Rewrite And Sync Memory

- Upstream project: `ypq123456789/MoRanJiangHu`.
- User fork/id: `LingYuYue1`.
- Before continuing local fixes, we synced the upstream repository. If the user asks to continue map work later, verify remotes first instead of assuming local code is current.
- A PR branch was pushed to the user fork: `codex/map-system-queue-fixes`.
- PR title used/recommended: `重构地图更新队列并修复地图 NPC 联动`.
- Local `main` was later fast-forwarded to upstream `origin/main` at `17ed36d`.

### Six-Layer Map Tree Direction

- The current map rewrite should use only the six-layer tree: `寰宇 -> 大地点 -> 中地点 -> 小地点 -> 区地点 -> 子地点`.
- Do not reintroduce old coordinate map fields: `世界.地图`, `世界.建筑`, `世界.地图建筑`, `世界.地图道路`, `世界.地图人物`.
- `具体地点` is an environment/location field, not a map layer. If AI returns `具体地点`, normalize it toward `区地点`; room/interior-like nodes should normalize toward `子地点`.
- Map nodes are maintained through `世界.地图层级` with `DT-xxx` ids.
- New map data should be name/layer/parent/description based. AI should not generate coordinates.

### Map Rendering And NPC Fixes

- Large-region/continent map path points were clamped so generated paths do not drift outside the map frame.
- NPC map linkage was repaired: town/city layer shows a pink marker on matching building blocks; building/room card layer shows the present NPC list.
- NPC location matching should prefer precise location paths when available.
- Relevant files from this work include `utils/mapSpatial.ts`, `utils/mapNpcLocation.ts`, `components/features/Map/RegionMap.tsx`, `components/features/Map/GridMapScene.tsx`, and `components/features/Map/LocationBrowser.tsx`.

### Map Update Workflow Separation

- Map update must be separated from world evolution.
- World evolution should no longer be responsible for writing map updates.
- Automatic map update runs as a separate post-story queue stage after the main story response finishes.
- Queue order should be: `文章优化 -> 变量生成 -> 动态世界 -> 规划分析 -> 地图更新 -> 最终落盘`.
- Map update queue stage is last before final command application.
- If the user enables the independent map-update API switch, automatic map update uses that independent API/model.
- If independent map-update API is disabled, automatic map update follows the main story API/model.
- Manual `解析地图` remains distinct from automatic post-story map update.
- Manual map generation uses the map generation API configuration.
- Automatic map update uses the automatic map update API selection.
- Automatic mode should parse and apply only commands targeting `世界.地图层级`.

### Files Touched For Map Update Separation

- `hooks/useGame/mapUpdateWorkflow.ts`: shared workflow for manual map regeneration and automatic incremental map update.
- `utils/apiConfig.ts`: added/used automatic map-update API resolution.
- `models/system.ts`: added map automatic update independent model fields.
- `components/features/Settings/MapModelSettings.tsx`: added `正文后自动地图更新` settings.
- `hooks/useGame/sendWorkflow.ts`: added independent `地图更新` post-story queue stage after planning analysis and before final apply.
- `hooks/useGame.ts`: added map update progress typing/pass-through.
- `components/features/Chat/InputArea.tsx`: added queue UI stage `地图更新`, displayed last.

### Verification Notes From This Work

- `npm run build` may fail on Windows PowerShell due to disabled script execution for `npm.ps1`; use `npm.cmd run build`.
- `npm.cmd run build` passed after wiring the map update queue.
- Build may update release metadata (`data/releaseInfo.ts`, `public/release-info.json`) because the project runs `release:sync` before build. Do not include those generated changes in unrelated PRs unless release metadata is intentionally part of the task.
- A local Vite preview was tested on desktop and mobile LAN. For mobile access, run preview with `--host 0.0.0.0` and open the machine LAN IP from the phone.

## 2026-05-17 Online Presence Heartbeat Stutter Fix

- User reported periodic UI freezes/stutters on both PC and mobile while switching pages or idling.
- Main suspected cause found: `services/onlinePresence.ts` sent online heartbeat every 25-30 seconds, and each heartbeat called `读取本地图片资源统计`.
- `读取本地图片资源统计` scans IndexedDB saves, settings, and image assets, so large saves/image libraries can cause periodic main-thread jank.
- Fix applied in branch `codex/fix-presence-heartbeat-stutter`, commit `67273b8`:
  - removed full local image resource statistics from online heartbeat payload;
  - kept only lightweight image migration status via `获取本地图片图床迁移状态`;
  - made heartbeat payload synchronous/lightweight;
  - skipped fallback HTTP heartbeat while WebSocket heartbeat is already open.
- PR branch pushed to user fork: `LingYuYue1/MoRanJiangHu`, branch `codex/fix-presence-heartbeat-stutter`.
- PR creation link: `https://github.com/LingYuYue1/MoRanJiangHu/pull/new/codex/fix-presence-heartbeat-stutter`.
- Suggested PR title: `修复在线心跳导致的周期性卡顿`.
- Verification: `npm.cmd run build` passed.
- Build again touched release metadata via `release:sync`; generated `data/releaseInfo.ts` and `public/release-info.json` changes were restored and not included in the PR.
- If stutter persists after this PR, next likely areas to inspect are startup image cache prewarm, legacy image migration, image fallback prefetch, and save-list scans on view changes.

## 2026-05-17 Memory-Based Map Regeneration (旧存档地图适配)

- Feature branch: `codex/memory-map-regenerate`, commit `0775951`.
- PR pushed to user fork `LingYuYue1/MoRanJiangHu`. Target upstream: `ypq123456789/MoRanJiangHu`.
- `gh` CLI not available on this Windows machine; PR needs to be created manually via GitHub web UI or another tool.

### What It Does

- Adds a `memory_regenerate` mode to `hooks/useGame/mapUpdateWorkflow.ts`.
- Reads the save's memory system (回忆档案, 长期/中期/短期/即时记忆) and extracts location clues.
- Sends the clues to the map generation API, which returns a JSON location tree.
- Parses the response and replaces `世界.地图层级` with the new six-layer tree, clearing old coordinate fields.
- Auto-saves after successful rebuild.

### UI: Streaming Output Window

- Original implementation used `pushNotification` (right-corner toast) for progress/result — user reported it blocks the view.
- Replaced with an inline streaming text window below the "使用回忆库解析地图" button in `MapModelSettings.tsx`.
- The callback signature changed from `() => Promise<boolean | void>` to `(onDelta: (delta: string) => void) => Promise<{ ok: boolean; message: string }>`.
- `App.tsx` `handleRegenerateMapFromMemory` now accepts an `onDelta` callback and returns `{ ok, message }` instead of calling `pushNotification`.
- The streaming window auto-scrolls, shows `[完成]` / `[失败]` / `[错误]` status at the end.
- Desktop and mobile settings modals both pass through the same prop; they share the same `MapModelSettings` component.

### Files Changed

- `hooks/useGame/mapUpdateWorkflow.ts` — new mode `memory_regenerate`, helper `构建回忆库地图线索`, `限长文本`.
- `App.tsx` — `handleRegenerateMapFromMemory` callback with streaming delta support.
- `components/features/Settings/MapModelSettings.tsx` — streaming text window UI, updated Props.
- `components/features/Settings/SettingsModal.tsx` — Props type update.
- `components/features/Settings/mobile/MobileSettingsModal.tsx` — Props type update.

### Verification

- `npm.cmd run build` passed with no TypeScript errors.
- User tested the feature end-to-end and confirmed it works correctly.
- Release metadata files (`data/releaseInfo.ts`, `public/release-info.json`) excluded from commit.

## 2026-05-17 Map Memory Parse Rename, Room Index, And NPC Location Updates

- Continued from the memory-based map regeneration work after user testing.
- User confirmed the memory map regeneration flow works correctly.
- The old manual map parsing feature was repurposed as memory parsing:
  - UI button label changed from `解析地图` / map parsing to `回忆解析`.
  - Both settings and map UI should trigger the same memory-based map regeneration workflow.
  - The map UI streaming output should stay aligned with the settings-side memory parsing stream.
  - The previous `manual_regenerate` map parsing mode was removed; current map workflow uses `memory_regenerate` and `auto_incremental`.

### Room Index Display Rule

- Rooms (`子地点`) should only appear under their parent building/location layer in the map scene.
- The right-side map index/location browser should not list room nodes directly.
- If the current selected node is a room (`子地点`), the default selected index node should be its parent building/location.
- Relevant fixes:
  - `components/features/Map/LocationBrowser.tsx`: filters `子地点` from the right-side 地点索引 and falls back to the parent node when current node is a room.
  - `components/features/Map/GridMapScene.tsx`: filters `子地点` from the right-side 地图层级 / 下一级 list.

### NPC Map Placement Fix

- User reported NPC markers/room lists were accurate after the fix, but NPC locations previously crowded into one room.
- Root causes found:
  - Room/building layer used current-location fallback too aggressively.
  - Single-room card fallback displayed all `npcAtLocation` entries.
  - `utils/mapSpatial.ts` previously fell back unmatched NPCs to the current layer.
  - `responseCommandProcessor.ts` previously treated any sentence mentioning an NPC name as enough to mark that NPC present.
- Fix direction:
  - Room layer must only show NPCs with precise room/building location evidence.
  - Broad ownership fields such as `归属.小地点 / 归属.中地点 / 归属.大地点` are not enough to place an NPC into a specific room.
  - NPCs without a matched location should not be forcibly placed into the current room/layer.
- Relevant files:
  - `utils/mapNpcLocation.ts`: added precise-location helpers using `位置路径 / 当前位置 / 当前地点 / 所在地点 / 所在位置 / 具体地点 / 地点 / 位置 / 归属.具体地点`.
  - `components/features/Map/RegionMap.tsx`: room-layer matching now uses precise helpers; removed the single-room “show all NPCs here” fallback.
  - `utils/mapSpatial.ts`: includes `位置路径` in social NPC path matching and removed `|| currentLayer` fallback for unmatched NPCs.
  - `hooks/useGame/responseCommandProcessor.ts`: present-state detection now requires dialogue, explicit presence, or explicit companion facts instead of name mention alone.

### NPC Location Update Fix

- User then reported that map display was fixed, but NPC locations did not update correctly during gameplay.
- Root cause:
  - Social NPC records did not have a strong persistent location contract.
  - Variable generation was mainly asked to update `是否在场`, but not forced to update `社交[i].当前位置 / 位置路径`.
  - Variable path registry could reject newly added `社交[i].当前位置 / 当前地点 / 位置路径` fields if they were not already present.
- Fix direction:
  - When a social NPC is confirmed present in the current scene, local command processing now fills/refreshes `当前位置`, `当前地点`, and `位置路径` from current `环境`.
  - Variable generation prompts now explicitly require updating NPC location fields when NPCs appear, speak, travel with the player, or move.
  - NPCs leaving the scene should update location only when the text gives a new destination; otherwise only `是否在场=false` should be set.
  - The variable registry allows social NPC location fields to be added when absent.
- Relevant files:
  - `hooks/useGame/responseCommandProcessor.ts`: added `同步在场NPC当前位置` and applies it after social list normalization in both command and no-command flows.
  - `models/social.ts`: added optional `当前位置`, `当前地点`, and `位置路径` to `NPC结构`.
  - `prompts/runtime/variableModel.ts`: strengthened per-turn NPC location update rule.
  - `prompts/stats/npc.ts`: added NPC location update discipline and command examples.
  - `utils/variableRegistry.ts`: added `当前位置`, `当前地点`, and `位置路径` to allowed new social NPC fields.

### Verification

- `npm.cmd run build` passed after room index/NPC placement changes.
- `npm.cmd run build` passed after NPC gameplay location update changes.
- Each build touched release metadata via `release:sync`; generated `data/releaseInfo.ts` and `public/release-info.json` were restored because this was not a release.
- User confirmed the map NPC placement display was correct after the placement fix.

## 2026-05-18 GitHub Actions Disabled And Direct Cloudflare Release Rule

- GitHub Actions automatic CI and automatic Cloudflare Worker deploy are disabled. The workflow files should keep only `workflow_dispatch` manual triggers unless the user explicitly asks to re-enable automatic CI/deploy.
- Do not rely on GitHub Actions for normal releases. Future release publishing should be performed from the local machine with direct Cloudflare commands.
- For Cloudflare deploys, clear proxy environment variables first and use explicit command timeouts, following the existing release deployment coverage rules.
- Pushing to `main` is now only a source backup step; it should not be treated as the deployment mechanism.

## 2026-05-18 Map Generation Toggle, Mobile Map Layout, And Memory Parse Rebuild

- Added a global `地图生成功能启用` setting for map generation.
- The setting lives in `components/features/Settings/MapModelSettings.tsx` and is shared by desktop and mobile settings because both use the same component.
- Default behavior remains enabled for existing saves.
- When enabled, the post-story queue works as before: after story output, map update enters the queue and can use either the main story API/model or the independent map-update configuration.
- When disabled, the story flow continues normally, but the map update queue stage reports that map generation is not enabled and skips the automatic map update.
- Relevant files:
  - `models/system.ts`: persisted setting field.
  - `utils/apiConfig.ts`: default normalization for the new map generation switch.
  - `components/features/Settings/MapModelSettings.tsx`: settings UI toggle and top tips.
  - `hooks/useGame/sendWorkflow.ts`: queue-stage skip behavior when map generation is disabled.

### Mobile Map Layout Notes

- Mobile map UI was adjusted for small screens.
- `components/features/Map/MobileMapModal.tsx` uses a mobile-safe height (`100dvh`), compact header spacing, and bottom safe-area padding.
- `components/features/Map/LocationBrowser.tsx` compact layout avoids whole-page overflow on mobile.
- `components/features/Map/RegionMap.tsx` room/building lists support internal scrolling so many rooms do not prevent reaching the bottom.

### Map Settings Tips And Memory Parse Behavior

- The map generation settings tip block should stay at the top of the settings page.
- The tips should explain:
  - Map generation is a lightweight task that updates the map by retrieving story text and is suitable for Flash/mini-level models.
  - After enabling map generation, users should configure an API/model below, otherwise the main story model/API is reused.
  - Memory parse rebuilds the map from the memory library and deletes the current map content first; it is mainly for old-save migration.
  - New saves usually do not need memory parse; users only need to decide whether to enable map generation and whether to use an independent model.
- Memory parse (`memory_regenerate`) is now a full rebuild path:
  - The prompt must not ask AI to preserve or merge old map layers.
  - Old map layers may be shown only as diagnostic old-save residue and must not be copied into the new tree.
  - `App.tsx` clears old coordinate map fields before writing the new `世界.地图层级`.
  - `hooks/useGame/mapUpdateWorkflow.ts` assigns fresh `DT-xxx` ids for rebuilt nodes instead of reusing old ids.

### Verification

- `npm.cmd run build` passed after the map generation toggle and queue skip work.
- `npm.cmd run build` passed after mobile map layout adjustments.
- `npm.cmd run build` passed after moving/rewording map tips and making memory parse a full clear-and-rebuild path.
- Each build touched release metadata via `release:sync`; generated `data/releaseInfo.ts` and `public/release-info.json` were restored because this was not a release.

## 2026-05-19 Traditional Chinese Mode, DeepSeek Compatibility, And AI Mode Tutorial

- Added a Traditional Chinese mode switch in game settings.
- When enabled, generated in-game AI content should be instructed through task prompts to use Traditional Chinese, not only converted in the UI after output.
- DeepSeek compatibility was migrated from the reference APK with a selectable main-story message mode in game settings.
- Main-story message mode should remain at the top of game settings and use clear player-facing labels:
  - `Gemini模式`: default/original behavior for Gemini models.
  - `GPT兼容`: real compatibility behavior for GPT/OpenAI-compatible endpoints; it is not display-only.
  - `DeepSeek标准续聊`: safer default for DeepSeek-style endpoints.
  - `DeepSeek锁格式`: stricter DeepSeek mode that attempts Prefix/Prefill-based format anchoring when supported.
- DeepSeek-specific prompt logic is kept in `prompts/runtime/deepseekMode.ts`.
- DeepSeek settings UI lives mainly in `components/features/Settings/GameSettings.tsx`.
- DeepSeek stable rescue model/API settings live in `components/features/Settings/ApiSettings.tsx`.
- The homepage tutorial center (`public/tutorials.html`) now includes an `AI模型模式` tab.
- The AI mode tutorial explains, in player-facing Chinese:
  - when to choose Gemini/GPT/DeepSeek standard/DeepSeek locked-format modes;
  - Prefix capability detection and why third-party DeepSeek-compatible endpoints may not support Prefix/Prefill;
  - output health checks as format parseability checks rather than writing-quality checks;
  - locked-format threshold and rescue threshold tuning;
  - opening strategy, takeover summary, Thinking options, and stable rescue model usage.
- Direct `#aimode` hash navigation in the tutorial center is supported.
- Verification: `npm.cmd run build` passed after the AI mode tutorial update.
- The build touched release metadata via `release:sync`; `data/releaseInfo.ts` and `public/release-info.json` had no content diff ignoring EOL and should not be included as release changes unless publishing.

## 2026-05-19 Time Anchor And Journey-Day Rollback Defense

- Player report: in-game starting time was around April, but during play the date suddenly flipped to "one day before the current real-world date", which also reset the displayed journey day count.
- Root cause analysis covered three layers:
  - The system prompt only carried `环境.时间` (current snapshot) per turn; `游戏初始时间` was never injected, so the model had no anchor to keep year/month/day stable across turns.
  - `prompts/core/timeProgress.ts` only required forward motion but did not forbid year/month/day rollback, reset, or using the model's own training/real-world date as the in-game date.
  - `hooks/useGame/responseCommandProcessor.ts` accepted any `set 环境.时间 = ...` value with no validation, and never blocked attempts to overwrite `游戏初始时间`, so a single bad command could rewrite the snapshot and the journey-day derivation in `utils/gameTimeJourney.ts` would then visibly flip.
- Three-layer fix applied as defense in depth:
  - Prompt layer: `prompts/core/timeProgress.ts` adds section "0.1 时间锚点完整性（硬约束）" — `环境.时间` is monotonically non-decreasing; year/month/day must not roll back; do not use the model's training date or current real-world date; `游戏初始时间` is opening-only and never rewritten; when uncertain, keep the previous value or move forward only by minutes.
  - Context layer: `hooks/useGame/systemPromptBuilder.ts` now derives `开局时间` and `已游玩天数` from `游戏初始时间` and `环境.时间`, then injects both into `orderedEnv` right after `时间`. `游戏初始时间` flows through `hooks/useGame.ts` → `hooks/useGame/sendWorkflow.ts` → `systemPromptBuilder`.
  - Command layer: `hooks/useGame/responseCommandProcessor.ts` adds `是否游戏初始时间命令`, `是否环境时间命令`, and `是否时间回退或异常重置` guards. Any `set 游戏初始时间 = ...` command is dropped. `set 环境.时间 = ...` is dropped when the new value is earlier than the previous snapshot, equals the placeholder `1:01:01:00:00`, or fails to parse.
- Files touched:
  - `prompts/core/timeProgress.ts`
  - `hooks/useGame/systemPromptBuilder.ts`
  - `hooks/useGame/sendWorkflow.ts`
  - `hooks/useGame.ts`
  - `hooks/useGame/responseCommandProcessor.ts`
- Verification: `npm.cmd run build` passed. Build again touched release metadata via `release:sync`; `data/releaseInfo.ts` and `public/release-info.json` were restored because this was not a release task.
- No deploy was triggered for this fix (per the No Auto-Deploy Rule). Customer-facing changelog text proposed for the next release: "修复 AI 在游玩中偶尔把游戏内日期/历程天数重置成现实时间前一天的问题——新增时间锚点硬约束、每回合向 AI 同步开局时间与已游玩天数，并在命令落地前拦截一切时间回退/重置写入。"
