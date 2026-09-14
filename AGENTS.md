# MoRanJiangHu Agent Notes

## Communication Language Rule

- Always communicate with the user in Chinese (中文).
- All explanations, summaries, changelogs, and status reports must be written in Chinese.
- Code, file paths, variable names, and technical identifiers remain in English.
- This rule applies to all conversations unless the user explicitly requests another language.

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

- Feature work may be implemented and verified on an isolated `codex/` branch or worktree, but whenever publishing a new version, integrate the complete intended release changes into `main` before the final version bump, build, upload, deploy, or release verification. The final public release must be built and published from `main`, and the release backup commit pushed to GitHub must exist on `main`; do not publish directly from an unmerged worktree branch.
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
- External release commands such as OneDrive APK upload, APK download verification, and HTTPS endpoint checks must always be run with explicit timeouts. If a wrapper command can hang after partial success, split it into smaller upload/deploy/verify steps and confirm each public artifact independently instead of waiting indefinitely.
- Required checks include the website URL in `release.config.json`, the APK download URL, the update manifest URL, and any documented backup domains or guide URLs that are part of the release surface.
- Current domain memory: the primary website domain is `https://msjh.bacon159.pp.ua/`; the backup website domain is `https://msjh.bacon.de5.net/`.
- For the current project, always confirm whether both the primary domain `https://msjh.bacon159.pp.ua/` and the backup domain `https://msjh.bacon.de5.net/` have been deployed with the same release version as the APK/update manifest.
- **CRITICAL**: After deployment, always verify `https://msjh.bacon159.pp.ua/` and `https://msjh.bacon.de5.net/` both show:
  - Correct version number matching the release
  - Accurate release timestamp (`releasePublishedAt`)
  - If version or timestamp is incorrect, the deployment is incomplete
- If a release is uploaded to OneDrive but the website was not deployed, deploy the website as part of the same release flow or clearly report why it could not be deployed.
- After deployment, verify the live site and manifest over HTTPS instead of assuming local build output is live.
- After every deployment and release backup push, check GitHub Actions CI for `ypq123456789/MoRanJiangHu` explicitly, not the upstream repository. Confirm the latest `CI` run for the pushed commit succeeds; if it fails, fetch the logs, fix when possible, and report the blocker before ending.

## Static Assets Deployment Verification Rule (CRITICAL — learned from a false "deploy success" report)

- **Do not report a website deploy as successful based only on `/api/apk/latest.json`.** That manifest is served from Cloudflare KV and is updated by the separate release-manifest publish flow, NOT by `wrangler deploy`. It can show the new version while the website front-end is still on the old version, producing a false "everything updated" conclusion.
- The website version number is compiled into the front-end JS bundle and served through the **static assets** path (`dist/`, including `release-info.json` and the hashed `index-*.js`). This is a completely different channel from the KV manifest.
- **Root cause of the past incident**: `wrangler deploy` was treated as done after checking only `/api/apk/latest.json` (KV, which did update), but the static assets (`dist/`) had not actually taken effect. The site kept serving the old bundle/version, so the displayed version never changed even though the report claimed success.
- **Mandatory static-assets verification after every website deploy** (all over HTTPS, on BOTH the primary domain `https://msjh.bacon159.pp.ua/` and the backup `https://msjh.bacon.de5.net/`):
  1. Fetch `/release-info.json` (the static asset, not `/api/apk/latest.json`) and confirm `versionName`, `versionCode`, and `releasePublishedAt` match the release just built.
  2. Fetch the deployed `index.html` and confirm the referenced hashed bundle name (e.g. `assets/index-XXXX.js`) exactly matches the hash produced by the local `npm run build` in `dist/`. A matching hash is the proof that the new static assets are actually live; a stale hash means the deploy did not take effect regardless of what the `wrangler deploy` log said.
  3. Confirm the `wrangler deploy` output actually reports uploading the asset files (e.g. `Uploaded N files`) and did not silently skip the assets step.
- `/api/apk/latest.json` showing the new version is NOT sufficient evidence of a website deploy. It is a valid check only for the APK/update-manifest channel, and only after the release-manifest publish step has run.
- If the static-assets checks above do not pass, the website deployment is INCOMPLETE — re-run `npm run build` + `wrangler deploy` (proxy vars cleared) and re-verify, instead of reporting success.

## Worker Functions Rebuild & Live-Behavior Verification Rule (CRITICAL — learned from a stale worker bundle deploy)

- `wrangler deploy`'s success log only means "the upload action finished"; it does NOT mean the part you changed actually became the live response. KV manifest, static-assets bundle, and worker-functions bundle are three independent artifacts, each with its own update path and its own "not rebuilt" trap.
- **Stale worker-functions bundle trap**: after editing anything under `functions/`, running `npm run worker:functions` / `worker:build` does not always rebuild the compiled output — `.tmp-worker-build/index.js` can keep an old timestamp (wrangler pages functions build sometimes skips a rebuild). The first `wrangler deploy` then ships the OLD code and the live behavior does not change, even though deploy "succeeded".
- **Mandatory before deploying a `functions/` change**:
  1. After `npm run worker:functions`, confirm `.tmp-worker-build/index.js` file timestamp is newer than your code edit.
  2. `grep` for a symbol/identifier you just added (e.g. a new variable or function name) inside `.tmp-worker-build/index.js` to prove it is actually in the compiled bundle.
  3. If the timestamp is stale or the identifier is missing, `rm -rf .tmp-worker-build` and rebuild, then deploy.
- **Mandatory after every deploy — test the LIVE behavior over HTTPS, not the deploy log**:
  - Website front-end change: verify per the Static Assets rule above (release-info.json + hashed bundle name match).
  - Worker/API logic change: directly hit the affected endpoint (with a cache-buster or after confirming `cache-control: no-store`) and confirm the returned data / ordering / redirect target matches the NEW logic.
  - Pass criterion: live measured behavior == expected new behavior. Any mismatch = deploy did not take effect; rebuild the artifact and redeploy. Never declare done from the deploy log alone.

## Legacy APK Update Manifest Rule (DECOMMISSIONED)

- The legacy `download.bacon.de5.net` update manifest path was hosted on Cloudflare R2, which has been **fully decommissioned**. R2 is no longer available for any purpose.
- Old installed APKs that read `https://download.bacon.de5.net/moranjianghu/latest.json` can no longer receive updates. Users must manually download the latest APK from the primary website.
- APK distribution no longer uses B2. Current APK distribution uses **OneDrive via OpenList** plus **GitHub Release / GitHub accelerator URLs** only.

## No Auto-Deploy Rule

- **NEVER deploy without explicit user instruction.**
- Only deploy when the user explicitly says to deploy, publish, or release.
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
- For documentation-only deploys, still run a local build, deploy the website with proxy variables cleared, verify the updated public guide URL over HTTPS, and report that the version number was intentionally unchanged because it was a documentation-only deployment.
- This exception also applies to non-game-content support/link updates, such as homepage or release-modal support entries, invitation/referral links, benefit descriptions, sponsorship wording, or external help links, when the user explicitly says they do not belong to game content and asks to deploy without a version bump or release notes.
- For future documentation-only deploy requests, follow this rule by default once the user explicitly asks to deploy.

## Local File Reference Rules

- Do not use local-file Markdown or URL links.
- Only use pure references inside single backticks, for example `@components/layout/TopBar.tsx:195`.
- Use `/` in paths, including Windows paths.
- Write explanations in normal prose; keep file refs standalone.

## Local And Cloud Environment Variable Rule

- Use local env files plus Cloudflare Secrets for collaborative local/cloud development.
- Keep real secrets only in local `.env.local`, `.env.production`, `.dev.vars`, user environment variables, or Cloudflare Secrets. Never commit OAuth client secrets, GitHub tokens, image-host tokens, object-storage credentials, or AI/API keys.
- Commit only safe templates such as `.env.production.example` and `.dev.vars.example`.
- Frontend build-time variables use the `VITE_` prefix and can be embedded into built assets, so only put public client IDs or public API base URLs there.
- Cloudflare runtime secrets should be set with `npm run cf:secrets:bulk -- .env.production` or individual `wrangler secret put ...` commands.
- **IMPORTANT — Cloudflare Account Migration**: The project has migrated from the old account `648558021@qq.com` (account ID `af087b3ace8e434ac24273df5b8b9e51`) to the new account `1524640484@qq.com` (account ID `5d34b67de994f61284cd81176d6f1382`). The Worker, Pages project, KV namespaces, and D1 databases have all been migrated to the new account. Use `wrangler.152.jsonc` (which has `account_id: 5d34b67de994f61284cd81176d6f1382`) for all wrangler commands targeting the new account. Do not use `wrangler.jsonc` (the old-account config without `account_id`) for production operations unless you know the old account is still needed. The old account's Pages secrets and Worker secrets are stale and should not be used; always sync secrets to the new account's Worker via the migrate-target credentials (`CF_MIGRATE_TARGET_GLOBAL_API_EMAIL=1524640484@qq.com`, `CF_MIGRATE_TARGET_GLOBAL_API_KEY`, `CF_MIGRATE_TARGET_ACCOUNT_ID`).
- **Vite import.meta.env Static Replacement Rule**: Vite only statically replaces *direct* `import.meta.env.VITE_*` property access (e.g., `import.meta.env.VITE_GITHUB_CLIENT_ID`). When you write `(import.meta as any).env?.VITE_*` with a cast and optional chaining, Vite cannot match the pattern at build time; it collapses to a runtime access on an empty object `{}`, so the env value becomes `undefined` in production bundles. This is a silent bug: the dev server works (it falls through to runtime `import.meta.env`), but production builds lose the value entirely. Always use direct `import.meta.env.VITE_*` access in runtime code. Never use `(import.meta as any).env?.VITE_*`.
- Whenever environment variables are added, removed, or changed, refresh the local `.env.production`, re-encrypt it, and resync the encrypted bundle to object storage.
- `wrangler.jsonc` should contain bindings and non-sensitive vars such as KV bindings, key prefixes, static asset bindings, and public repository defaults; do not put runtime secrets in `wrangler.jsonc`.
- Current required Cloudflare secrets include `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_NATIVE_CLIENT_ID`, `GITHUB_NATIVE_CLIENT_SECRET`, `FANDOM_PRESET_GITHUB_TOKEN`, `IMAGE_HOST_TOKEN`, `MORAN_OPENLIST_AUTH_TOKEN`, `ONLINE_ADMIN_PASSWORD`, `MORAN_B2_APPLICATION_KEY_ID`, `MORAN_B2_APPLICATION_KEY`, and `MORAN_B2_BUCKET_ID`.
- Current public frontend build variables include `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_NATIVE_CLIENT_ID`, and `VITE_SYNC_API_BASE_URL`.

## Shell Encoding Rule

- When reading or writing UTF-8 JSON/text on PowerShell, do not rely on the default console encoding.
- Prefer `node`, explicit UTF-8 file reads/writes, or commands that preserve Unicode text.
- If a shell workaround is needed, solve the underlying decoding issue once and record the fix, rather than repeatedly narrating the same encoding detour.

## PowerShell Pipe Output Rule

- `powershell.exe -Command "..." | tail -N` can return empty output even when the command succeeds. Root cause: PowerShell's stderr/stdout buffering has a race condition with bash pipe buffering — Gradle writes progress to stderr (`> Task :app:...`), and when PowerShell exits before stderr buffer fully flushes through the pipe, `tail` reads nothing.
- **Correct pattern**: Use `powershell.exe -Command "..." 2>&1` without `| tail` to capture full output. If you only need the last N lines, let the command complete first, then the output is available.
- **Incorrect pattern**: `powershell.exe -Command "..." 2>&1 | tail -10` — this causes silent empty output, making it appear the command hung or failed when it actually succeeded.
- For Gradle builds specifically, the build may succeed (APK file exists with correct timestamp) but the pipe returns nothing, leading to false "timeout" or "empty output" diagnoses.

## PowerShell 7 Editing Rule

- When editing files or running file-editing shell commands on Windows, prefer PowerShell 7 (`pwsh`) over legacy Windows PowerShell (`powershell.exe`).
- This rule applies especially to UTF-8 text edits, JSON/text file rewrites, and any command sequence that needs predictable encoding behavior.
- Only fall back to `powershell.exe` when PowerShell 7 is unavailable or a specific tool explicitly requires the legacy host.

## Background Process Rule

- **Finite commands** (build, test, compile, install): run directly — they will exit on their own.
- **Infinite commands** (HTTP servers, file watchers, dev servers, listeners): must run in background — they never exit.
- On Windows, `command &` does NOT reliably detach a process in Git Bash/MSYS2. The Bash tool waits for exit, so it hangs forever.
- **Correct pattern for infinite processes**: Use `powershell.exe -Command "Start-Process -FilePath <cmd> -ArgumentList <args> -WindowStyle Hidden"` to spawn a detached background process. Then verify with a quick HTTP/request check.
- **Incorrect pattern**: `python -m http.server 4173 -d dist &` — this blocks the Bash tool indefinitely.
- **Examples of infinite commands that MUST background**: `python -m http.server`, `npx vite preview`, `npm run dev`, `tail -f`, any `watch` mode.
- **Examples of finite commands that run directly**: `npm run build`, `gradlew assembleRelease`, `npm run test:run`, `git push`.

## Root-Cause Bugfix Rule

- When the user asks to fix a problem, first consider whether the symptom is isolated or part of a larger workflow/data-integrity issue. If it is part of a larger issue, fix the whole chain, not only the visible symptom.
- After locating a defect, keep tracing until the root cause is understood. Do not stop at hiding raw errors, changing display text, or masking bad state. If a fix only improves presentation, also determine why the bad state or failure happened and repair the upstream cause when feasible.

## Local UI Debug Path

When the target is UI verification, layout validation, mobile top-bar checks, or APK/web consistency checks, do not block on model or API configuration first. Prefer entering a real in-game view from an existing save.

## Screenshot Preview Rule

- Before capturing homepage or UI preview screenshots for the user, close or dismiss the release notes/update log modal first.
- If the modal still appears after localStorage setup or reload, actively click its close/dismiss control before taking the screenshot.
- Do not show the user a screenshot where the update log blocks the layout being reviewed unless the modal itself is the subject of the check.

## Homepage Layout Overlap Rule

- Homepage panels, sidebars, online stats, release info, support links, friend links, and footer blocks must not overlap the original centered title/menu column.
- Before showing or deploying homepage layout changes, verify at the default `2560x1440` viewport that the bottom info row does not cover the `设置` button or any other main menu button.
- If content is too tall, reduce panel density, add internal scrolling, or move the panel; never allow visible UI elements to stack on top of each other.

## Frontend Day Mode Readability Rule

- For every frontend/UI change, check white/day mode readability before treating the task as done.
- New buttons, links, panels, badges, tooltips, chart labels, and helper text must have sufficient contrast in `day` theme as well as dark themes.
- If using Tailwind semantic colors such as indigo, violet, sky, amber, or low-opacity text/backgrounds, add explicit `html[data-theme="day"]` overrides or stable component classes when needed.
- Before deploying frontend changes, include at least one local browser/Playwright check in day mode for the changed surface and confirm text is readable.

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

- **hi168 S3 was decommissioned on 2026-06-28** and returns HTTP 403 AccessDenied. All data has been migrated to OneDrive.
- The user now uses OneDrive (accessed via OpenList/AList proxy at `https://openlist.bacon.de5.net`) for save sync and data storage.
- OneDrive data layout under `/Onedrive/MoRanJiangHu/`:
  - `apk/` — APK binary (latest.apk, ~48.7MB)
  - `releases/` — Versioned release APKs (~97MB)
  - `saves/` — Game save packages (~9.5GB)
  - `preset-items/` — Preset item images + thumbnails (~901MB, 496 items)
  - `chunks/` — Save sync chunks
  - `codex-env/` — Encrypted environment variable backups
  - `manifest-backups/` — Release manifest backups
  - `e2e/` — End-to-end test data
- Keep object storage credentials only in local user environment variables; never write Access Key or Secret Key into repository files, commits, logs, release notes, or chat responses.
- Legacy hi168 environment variable names (still present but service is dead):
  - `MORAN_OSS_USERNAME`
  - `MORAN_OSS_ACCESS_KEY`
  - `MORAN_OSS_SECRET_KEY`
  - `MORAN_OSS_ENDPOINT` (was `https://s3.hi168.com`)
  - `MORAN_OSS_BUCKET` (was `hi168-19275-07130td3`)

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

## 2026-05-18 GitHub Actions Disabled

- GitHub Actions automatic CI is disabled. The workflow files should keep only `workflow_dispatch` manual triggers unless the user explicitly asks to re-enable automatic CI.
- Do not rely on GitHub Actions for normal releases. Future release publishing should be performed from the local machine.
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

## 2026-05-24 E2E External AI Test Endpoint

- For future end-to-end tests that need a real AI response, use the OpenAI-compatible external test endpoint from local environment variables:
  - `MORAN_E2E_AI_BASE_URL`
  - `MORAN_E2E_AI_API_KEY`
  - `MORAN_E2E_AI_MODEL`
- Current non-secret endpoint/model memory:
  - Base URL: `https://ai.bacon123.eu.org/v1`
  - Model: `流式抗截断/gemini-3.1-pro-preview-search`
- The API key must stay only in the local user environment variable `MORAN_E2E_AI_API_KEY`.
- Never write the key into repository files, commits, logs, screenshots, customer changelogs, or chat summaries.
- Test calls should treat the endpoint as OpenAI-compatible Chat Completions and read configuration from the variables above.

## 2026-06-01 111666 Image Host Notes

- The fallback image host `https://i.111666.best` accepts uploads with:
  - `curl -F image=@localfile https://i.111666.best/image -H "Auth-Token: $MORAN_111666_AUTH_TOKEN"`
- Store the delete credential only in the local user environment variable `MORAN_111666_AUTH_TOKEN`.
- Do not write this token into repository files, commits, logs, screenshots, customer changelogs, or chat summaries.
- Delete syntax:
  - `curl -XDELETE https://i.111666.best/image/IMAGE-PATH -H "Auth-Token: $MORAN_111666_AUTH_TOKEN"`
- Download/embed syntax:
  - `https://i.111666.best/image/IMAGE-PATH`
- Important behavior from local testing:
  - Bare direct downloads can return a generated `403 Forbidden` image saying direct-link downloads are prohibited.
  - Browser-style embedded image requests with a site `Referer` can load the original image.
  - A 2.7 MB test image loaded successfully under 12 concurrent curl requests with `Referer: https://msjh.bacon159.pp.ua/`, averaging about 0.6 seconds per request in the local test.
- If this host is used for public preset images, verify real browser `<img>` loading on both the primary domain `https://msjh.bacon159.pp.ua/` and backup domain `https://msjh.bacon.de5.net/`, because CLI/Node direct fetch behavior does not match browser embedding behavior.

## 2026-06-01 GPT Image 2 Preset Regeneration Notes

- GPT image 2 preset regeneration credentials must stay in local user environment variables only.
- Primary OpenAI-compatible image endpoint variables:
  - `MORAN_GPT_IMAGE2_BASE_URL`
  - `MORAN_GPT_IMAGE2_API_KEY`
- Hostcentral fallback endpoint variables:
  - `MORAN_GPT_IMAGE2_HOSTCENTRAL_BASE_URL`
  - `MORAN_GPT_IMAGE2_HOSTCENTRAL_API_KEY`
- Wanfeng fallback endpoint variables:
  - `MORAN_GPT_IMAGE2_WANFENG_BASE_URL`
  - `MORAN_GPT_IMAGE2_WANFENG_API_KEY`
- Current non-secret endpoint memory:
  - Primary base URL: `https://688.qzz.io`
  - Hostcentral base URL: `https://api.hostcentral.cc/v1`
  - Wanfeng base URL: `https://api.wanfeng.me`
- Never write image API keys into repository files, commits, logs, screenshots, customer changelogs, or chat summaries.
- The helper script `scripts/regenerate-preset-images-gpt-image2.mjs` can regenerate preset item images with GPT image 2 and upload results to either nodeimage or 111666:
  - Deepark task API mode: `--provider=deepark`
  - OpenAI-compatible image API mode: `--provider=openai`
  - 111666 upload mode: `--host=111666`
  - Reverse processing: `--reverse`
  - Separate reports: `--report=some-report.json`
- As of the 2026-06-01 run, all `现代都市` and `末日丧尸` preset images were regenerated through GPT image 2 and moved to the 111666 image host.
- Preset item images must be realistic product-photography style: one tangible object, full object visible, realistic material texture, neutral tabletop/background, no UI frame, no text labels, no people, no illustrated icon style.
- Do not use local SVG/icon fallback images as final `data/presetItemImages.ts` registry entries. If GPT image 2 credentials, endpoint, or balance are unavailable, report the blocker or use an existing realistic preset image only as a clearly temporary placeholder, then regenerate with GPT image 2 when the endpoint is restored.
- New endpoint for GPT image 2: `https://ai.songsongai.com/v1` with key in `MORAN_GPT_IMAGE2_SONGSONGAI_API_KEY` (or reuse primary env var).

## Preset Item Image Storage Rule

- Preset item images are stored on OneDrive and served through OpenList.
- **hi168 S3 was decommissioned on 2026-06-28** — old S3 URLs are dead.
- Public URL format: `https://msjh.bacon159.pp.ua/api/preset-image/{urlencoded-name}.png` (full images) and `thumbs/{name}.webp` (thumbnails).
- OpenList signed URL format (internal): `/p/Onedrive/MoRanJiangHu/preset-items/{name}?sign={sign}`.
- Directory listing sign values are cached 1 hour; image CDN cache is 1 year.
- When deploying, ensure `MORAN_OPENLIST_AUTH_TOKEN` Cloudflare Secret is up to date.
- OpenList's `/api/fs/get` has a bug with Chinese filenames (object not found); use `/api/fs/list` to get sign mappings and construct `/p/` URLs instead.
- Preset feedback thumbnails use `thumbs/<item-name>.webp`; card grids should load `thumbSrc`, while enlarged previews and registry entries should keep using the original PNG `src`.
- Upload new preset images to OneDrive path: `/Onedrive/MoRanJiangHu/preset-items/<item-name>.png`.
- The `scripts/regenerate-preset-images-gpt-image2.mjs` script should support `--host=onedrive` for OneDrive upload via OpenList API.

## OpenList / OneDrive API Integration Guide (for AI Agents)

All file storage that was previously on hi168 S3 has been migrated to **OneDrive**, accessed through an **OpenList (AList)** proxy server. Below is the practical guide for interacting with this system in code.

### Architecture Overview

```
Client Request
  → OpenList API (openlist.bacon.de5.net)
    → OneDrive (actual file storage)
```

### Authentication

- All OpenList API calls require the header: `Authorization: <token>` where token is stored in Cloudflare Secret `MORAN_OPENLIST_AUTH_TOKEN`.
- Base URL defaults to `https://openlist.bacon.de5.net` (env var `MORAN_OPENLIST_BASE_URL`).
- For uploads that need to bypass Cloudflare, use the direct AList/OpenList origin `http://159.138.7.126:5244` as the API base URL. Public downloads and website-facing URLs should still use the documented public domains unless the task explicitly requires direct-origin testing.

### Key API Endpoints

**1. List directory contents — `POST /api/fs/list`**

This is the primary way to discover files and get signed download tokens.

```json
// Request body:
{ "path": "/Onedrive/MoRanJiangHu/releases", "password": "", "page": 1, "per_page": 100, "refresh": false }

// Response:
{ "code": 200, "data": { "content": [
  { "name": "latest.apk", "is_dir": false, "size": 48700000, "sign": "abc123..." },
  ...
]}}
```

Each file item has a `sign` field — this is the signed token needed for proxy downloads.

**2. Proxy download — `GET /p/{onedrive-path}?sign={sign}`**

Download a file through OpenList's proxy. The OneDrive storage driver **must have "web proxy" (网页代理) enabled** or this returns 403.

```
GET https://openlist.bacon.de5.net/p/Onedrive/MoRanJiangHu/releases/latest.apk?sign=abc123...
```

**3. Get file info — `POST /api/fs/get`**

Returns file metadata including `raw_url` (direct OneDrive CDN link). However, this has a **bug with Chinese filenames** (returns "object not found"). Prefer `/api/fs/list` instead.

```json
// Request body:
{ "path": "/Onedrive/MoRanJiangHu/releases/latest.apk", "password": "" }
```

**4. Create directory — `POST /api/fs/mkdir`**

```json
{ "path": "/Onedrive/MoRanJiangHu/new-folder" }
```

**5. Delete files — `POST /api/fs/remove`**

Deletes to OneDrive's recycle bin. Supports batch deletion.

```json
{ "dir": "/Onedrive/MoRanJiangHu", "names": ["file1.png", "file2.png"] }
```

**6. Move files — `POST /api/fs/move`**

```json
{ "src_dir": "/Onedrive/MoRanJiangHu", "dst_dir": "/Onedrive/MoRanJiangHu/archive", "names": ["file1.png"] }
```

### How It's Used in Code

- **Preset images**: OpenList `/api/fs/list` is called on the preset-items directory to build a `{filename → sign}` map (cached 1h), then image downloads are proxied via `/p/` URLs.
- **APK downloads**: `/api/fs/list` is called on the releases directory to get the sign for `latest.apk`, then a redirect to the `/p/` proxy URL is returned. Triggered by `?provider=onedrive` query parameter.

### Important Caveats

- **Do NOT use `/api/fs/get`** for files with Chinese characters in their names — use `/api/fs/list` and match by name.
- **Batch operations** (move/remove) should use batches of ≤20 items to avoid `ECONNRESET` timeouts.
- The OpenList auth token can expire; if proxy calls return "token is invalidated", the token needs to be regenerated from the OpenList admin panel.
- OneDrive proxy download speed is ~464 KB/s. This is currently the sole APK distribution channel.

### Upload Rules (CRITICAL — learned from 2026-06-28 incident)

**Never use `/api/fs/form` (POST multipart) for uploading files.** This endpoint is blocked by Cloudflare WAF/Rocket Loader — it returns the OpenList frontend HTML page (HTTP 200) instead of JSON, regardless of file size. The response contains injected `cloudflare-static/rocket-loader` scripts and is not a valid API response.

**Always use `/api/fs/put` (PUT + raw body) for uploading files:**

```bash
curl -X PUT "http://159.138.7.126:5244/api/fs/put" \
  -H "Authorization: $MORAN_OPENLIST_AUTH_TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "File-Path: /Onedrive/MoRanJiangHu/releases/latest.apk" \
  --data-binary @"app-release.apk"
```

Required upload parameters:
1. **Method must be PUT**, not POST.
2. **File path goes in `File-Path` header** (URL-encoded format, not base64).
3. **Body is raw binary stream**, not multipart form data.
4. **`/Onedrive/` must use capital O** — lowercase `/onedrive/` causes `storage not found` error.
5. **`Content-Type` should be the actual file MIME type** (e.g., `application/vnd.android.package-archive` for APK).
6. **Prefer direct-origin upload base URL `http://159.138.7.126:5244`** when Cloudflare interferes with OpenList uploads; do not expose this as a public customer-facing download URL.

Upload size verification (2026-06-28):
- 5MB PUT: ✅ 3.4s (~1.5 MB/s)
- 20MB PUT: ✅ 17.8s (~1.1 MB/s)
- 50MB PUT: ✅ 47.1s (~1.1 MB/s)
- 47.4MB APK PUT: ✅ 37.7s (~1.3 MB/s)
- `/api/fs/form` any size: ❌ blocked by Cloudflare, returns HTML

## Item Image Prompt Filtering Rule

- Item image generation prompts must only describe the physical appearance of the object, never game mechanics.
- `services/ai/itemImageGeneration.ts` `构建物品视觉描述`:
  - When structured item has `生图描述`, use only `生图描述` + `视觉标签`; do NOT mix in `描述`, `词条列表`, `来源描述`, `关联事件`.
  - When no structured `生图描述` exists, filter out `描述` text containing game-mechanic keywords (兑换/强化/支线剧情/奖励点/属性/技能/等级/经验/伤害/冷却/暴击/命中 etc.) via `是否游戏机制文案`.
  - The `构建物品视觉主体描述` fallback to `item?.描述` must also pass through the same filter.
- Examples of bad prompts: "承载一段c级支线剧情用于兑换高级强化" → should be "an ornate scroll with aged paper and wax seal" for a scroll item.
- The `生图描述` in `structuredItemLibrary.ts` must always be a pure physical description in English, never containing game mechanic text.

## Topic Mode Preset Feedback Rule

- Whenever a new topic mode is added, its preset items and preset images must also be included in the public preset feedback data.
- Do not stop after updating `utils/topicModeProfiles.ts`, `data/structuredItemLibrary.ts`, or `data/presetItemImages.ts`; also run `npm.cmd run preset:feedback`.
- Verify `public/assets/item-preset-feedback-data.json` contains the new topic mode category and that the mode's preset images appear on `/item-preset-feedback`.
- Keep `scripts/sync-item-preset-feedback-data.mjs` deriving topic mode categories from `题材模式顺序` instead of a hard-coded old mode list, so future modes are not silently omitted.

## Xiaomi MiMo Agent Collaboration Rule

- Xiaomi MiMo can be used as an execution/code-editing model for implementation-heavy work, while Codex keeps responsibility for bug localization, task direction, code review, verification, and any final corrections.
- This can reduce Codex token usage for bulk code-editing drafts, but it does not eliminate Codex token usage because Codex still needs to inspect context, write precise instructions, review diffs, run verification, and fix issues when the delegated result is wrong or incomplete.
- Local credentials must stay only in user/process environment variables, never in repository files, commits, logs, screenshots, customer changelogs, or chat summaries.
- Current local Xiaomi environment variable names:
  - `XIAOMI_API_KEY`
  - `XIAOMI_OPENAI_BASE_URL`
  - `XIAOMI_ANTHROPIC_BASE_URL`
  - `XIAOMI_CODE_MODEL`
  - `XIAOMI_FAST_MODEL`
  - `XIAOMI_MODEL_LIST`
  - OpenRouter-compatible aliases for existing tools: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`
- Current non-secret endpoint/model memory:
  - OpenAI-compatible base URL: `https://token-plan-cn.xiaomimimo.com/v1`
  - Anthropic-compatible base URL: `https://token-plan-cn.xiaomimimo.com/anthropic`
  - Preferred code-editing model: `mimo-v2.5-pro`
  - Fast/simple model: `mimo-v2.5`
  - Available models: `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2.5-asr`, `mimo-v2.5-tts-voiceclone`, `mimo-v2.5-tts-voicedesign`, `mimo-v2.5-tts`, `mimo-v2-pro`, `mimo-v2-omni`, `mimo-v2-tts`
- Multi-agent collaboration method:
  - Use Codex first to read the relevant code, identify the likely root cause, and write a narrow task brief for MiMo.
  - Give MiMo only the files, constraints, expected behavior, and verification commands needed for the specific task.
  - Prefer MiMo for localized code edits, mechanical refactors, documentation-only updates, simple version/deploy preparation steps, and first-pass implementation of well-scoped fixes.
  - Do not let MiMo independently decide release scope, version bump policy, public changelog contents, secret handling, or deployment timing.
  - After MiMo edits, Codex must inspect the diff, check for unrelated churn or secret leakage, run the required tests/builds, and directly repair any remaining problems before reporting completion.
  - Deployment or release work can be delegated only after the user explicitly asks to deploy/publish/go live, and Codex must still enforce the project's release, backup, verification, and no-auto-deploy rules.

## APK Distribution Architecture (as of 2026-07-13, B2 decommissioned)

### Overview

The APK distribution system uses a KV manifest plus non-B2 binary hosts:

1. **Cloudflare KV** — Stores the release manifest (`release-manifest/latest.json`) as the single source of truth for version metadata (versionName, versionCode, releaseNotes, etc.).
2. **GitHub Release + GitHub accelerator URLs** — Primary fast APK download channel. The manifest should prefer `github`.
3. **OneDrive via OpenList proxy** — APK binary host and fallback channel. Downloads are proxied through `openlist.bacon.de5.net/p/` with signed URLs. APK files are stored at `/Onedrive/MoRanJiangHu/releases/latest.apk` and `/Onedrive/MoRanJiangHu/releases/MoRanJiangHu-v<version>.apk`.

**Decommissioned channels**: hi168 S3 (2026-06-28), Cloudflare R2 (fully decommissioned, including legacy manifest path), and Backblaze B2 APK distribution (2026-07-13). Do not upload APKs to B2, do not add B2 URLs to `apkUrls`, and do not make B2 the default provider.

### APK Download Flow

- `GET /api/apk/latest.json` — Reads manifest from KV and dynamically constructs `apkUrls` using the stable URL, GitHub accelerator URLs, GitHub Release URL, and OneDrive URLs only. B2 must not appear.
- `GET /api/apk/latest.apk` — Default download uses GitHub Release/GitHub accelerator unless `?provider=onedrive` or `?provider=onedrive-direct` is requested.
- `GET /api/apk/version/{file}` — Versioned download uses GitHub Release/GitHub accelerator by default; OneDrive can be requested through provider query parameters.
- `?provider=b2` is intentionally decommissioned and should return 410 instead of redirecting.

### B2 Status (Decommissioned)

B2 APK distribution was decommissioned on 2026-07-13. Some legacy helper code and environment variable names may still exist for backward compatibility or future cleanup, but release code must not rely on B2. The manifest publish step should use `npm run release:manifest`, which writes the KV manifest while skipping B2 uploads by default.

### Cloudflare Secrets (Current)

- **Account**: `1524640484@qq.com` (account ID `5d34b67de994f61284cd81176d6f1382`). The old account `648558021@qq.com` is deprecated; its Pages/Worker secrets no longer serve production traffic.
- **Worker config**: `wrangler.152.jsonc` is the production config for the new account. `wrangler.jsonc` is the legacy config for the old account and should not be used for deploys.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth (primary, callback `https://msjh.bacon159.pp.ua/oauth/github/callback`)
- `GITHUB_BACKUP_CLIENT_ID`, `GITHUB_BACKUP_CLIENT_SECRET` — GitHub OAuth backup (callback `https://msjh.bacon.de5.net/oauth/github/callback`)
- `GITHUB_NATIVE_CLIENT_ID`, `GITHUB_NATIVE_CLIENT_SECRET` — GitHub native APK OAuth
- `FANDOM_PRESET_GITHUB_TOKEN` — GitHub token for fandom preset repo access
- `IMAGE_HOST_TOKEN` — Image host authentication
- `MORAN_OPENLIST_AUTH_TOKEN` — OpenList/AList API token for OneDrive proxy
- `ONLINE_ADMIN_PASSWORD` — Online admin panel access

### OneDrive Data Layout

```
/Onedrive/MoRanJiangHu/
├── apk/              — APK binary (latest.apk, ~48.7MB)
├── releases/         — Versioned release APKs (~97MB)
├── saves/            — Game save packages (~9.5GB, 851 items)
├── preset-items/     — Preset item images + thumbnails (~901MB, 496 items)
│   └── thumbs/       — WebP thumbnails
├── chunks/           — Save sync chunks
├── codex-env/        — Encrypted environment variable backups
├── manifest-backups/ — Release manifest backups
└── e2e/              — End-to-end test data
```

### Dead Code And Removed References

- `functions/api/preset-image/[[path]].ts` still contains `tryLegacyS3()` which attempts to fetch `s3_` pattern files from hi168 S3. Since hi168 returns 403, this always fails and silently falls through to the OneDrive proxy path. It can be safely removed in a future cleanup.
- All `s3_` prefix legacy image files have been deleted from OneDrive. The preset image registry (`data/presetItemImages.ts`) uses only the new URL format (`/api/preset-image/{name}.png`).

### Sharing This Architecture With Other AI Agents

When onboarding another AI assistant (Cursor, Claude, etc.) to work on this project's file distribution or release pipeline, share the "APK Distribution Architecture (as of 2026-07-13, B2 decommissioned)" section from this file. It covers the current architecture: KV manifest, GitHub/GitHub accelerator downloads, OneDrive channels, download flow, and OneDrive data layout.

## Cloud Studio ComfyUI Backend Migration Notes

- CNB is now only a temporary migration source for the ComfyUI image backend and is expected to be abandoned after the free GPU period ends.
- The Cloud Studio target backend repository is the private GitHub repository `ypq123456789/comfyui-cloudstudio-msjh`.
- The local Cloud Studio backend workspace is `F:/code/comfyui-cloudstudio-msjh`; the old CNB source workspace is `F:/code/comfyui-ql-cnb-fix` and should not be modified for new Cloud Studio work unless explicitly requested.
- Cloud Studio import flow:
  1. Import `ypq123456789/comfyui-cloudstudio-msjh` into Cloud Studio from GitHub.
  2. Open the workspace terminal.
  3. Run `bash cloudstudio_start.sh`.
  4. Open/preview port `8188` in Cloud Studio.
  5. If automatic public URL detection fails, set `CLOUDSTUDIO_IMAGE_BACKEND_URL` to the 8188 preview URL and run `bash cloudstudio_sync.sh`.
- Cloud Studio environment variable names:
  - `CLOUDSTUDIO_TOKEN` — Cloud Studio account/API token. Keep it only in local user environment variables or Cloud Studio Secrets; never commit it.
  - `CLOUDSTUDIO_IMAGE_BACKEND_URL` — public 8188 ComfyUI preview URL when auto-detection fails.
  - `CLOUDSTUDIO_IMAGE_BACKEND_CONNECT_TOKEN` — user-facing auto-connect token for filtering the discovered backend in MoRanJiangHu.
  - `CLOUDSTUDIO_IMAGE_BACKEND_PORT` — ComfyUI port, default `8188`.
  - `MSJH_IMAGE_BACKEND_SYNC_URL` — registry endpoint, default `/api/image-backend/sync` on the public website.
  - `MSJH_IMAGE_BACKEND_SYNC_TOKEN` — backend registry sync token. Store as a secret, never in repo.
- MoRanJiangHu frontend should use the generic cloud backend registry path `/api/image-backend/sync`; keep `/api/image-backend/cnb-sync` only as backward compatibility.
- Do not record real Cloud Studio tokens, sync tokens, or preview URLs that contain secrets in AGENTS files, commits, logs, screenshots, or customer changelogs.

## 2026-08-16 Creative Workshop Empty-List Incident And D1 Split-Brain Recovery

- Symptom: `/api/workshop/modules` returned `{"ok":true,"entries":[]}` on both public domains; players reported all community mode packs gone.
- Root cause chain:
  - Workshop modules live in D1 table `workshop_data`, key `moranjianghu/workshop/modules/index/latest.json`. Values over 700KB are stored as one manifest row + `::chunk-N` rows (`functions/api/_shared/dbStore.ts`).
  - The 2026-08-09 account migration moved the domain zones to the new account, so traffic switched to the new-account Worker bound to D1 `moranjianghu-db-backup` (id `d72fe8c8-...`). That database was an **incomplete snapshot** copied around 2026-06-28/29: the index manifest row was copied but its 2 chunk rows (and 2 TOPIC entries) were not. `get()` treats "manifest present, chunk missing" as data-not-found, so the workshop list silently became empty on the day of the zone migration.
  - The old-account D1 `moranjianghu-db` (id `0a9c1910-...`) kept receiving real writes (submissions, cloud-play registrations) until 2026-08-09 and still held the complete data: a 3.5MB 10-chunk index rebuilt on 2026-07-10 plus delta rows.
- Recovery performed on 2026-08-16 (data-only, no deploy):
  - Backed up the new DB (`.tmp-workshop-recovery/newdb_backup_20260816.sql`) and the old workshop table (`.tmp-workshop-recovery/workshop_data_old.sql`); both are local-only, never commit them.
  - Synced old → new: `workshop_data`/`workshop_novel_data` full overwrite (52+27 rows), `cloud_play_data`/`diagnostic_reports`/`online_hourly_history`/`apk_download_daily` union-merge keeping the newer `updated_at` side.
  - Verified both domains returned 16 modules (11 topic packs, 2 tavern presets, 3 comfy workflows) and `action=download` reassembles chunked entries correctly.
- Root-cause code fix (local, not yet deployed):
  - `functions/api/_shared/dbStore.ts` `put()` used to delete old chunk rows BEFORE writing the new value; if the write batch failed (D1 503/transient), an orphan manifest remained and the whole value was lost silently. Now it writes the new value first (atomic batch) and only deletes stale chunks afterwards, with cleanup failures swallowed as warnings.
  - `get()` now logs `orphan chunk manifest` via `console.error` when a manifest's chunks are missing, so corruption is visible in Worker observability instead of failing silently.
  - Regression tests added in `__tests__/dbStoreAtomicWrite.test.ts` (8 cases, all passing), including "write failure must keep the old chunked value readable".
- Memory: the old-account Worker still exists (workers.dev disabled, zone moved, no traffic) and old D1 `moranjianghu-db` is now a frozen backup. Do not write to it. If D1 data ever looks empty after an account/domain migration, diff key sets and row counts between accounts before assuming data loss.

## 2026-08-16 Hardening Follow-up: Parity Check, D1 Backups, Same-Origin AI Relay

- Data-integrity hardening (code, not yet deployed):
  - `functions/api/workshop/modules.ts` `readIndex()` no longer swallows failures silently: bucket unavailable, unreadable legacy index, failed delta listing, and corrupt delta rows all log errors, and the GET response now carries a `warning` field when data may be incomplete; `CreativeWorkshopModal` surfaces it via the existing status line.
  - `scripts/verify-d1-parity.mjs` compares business tables across the two D1 databases (row counts, key sets, updated_at). Keys present only in the old DB are the "incomplete snapshot" signal. Run it after any future account/DB migration. It retries requests (a plain run once produced a false diff due to a network hiccup).
  - `scripts/backup-d1-to-onedrive.mjs` exports the production D1 (`moranjianghu-db-backup`) and uploads to OneDrive `/Onedrive/MoRanJiangHu/d1-backups/`, keeping the newest 8. First real backup (41 MB, size-verified) was taken 2026-08-16. Run it periodically; there is no scheduler yet.
- Web CORS relay (code, not yet deployed):
  - New endpoint `functions/api/ai-relay/[[path]].ts`: same-origin relay for browser-blocked third-party AI calls (direct fetch gets TypeError/Failed-to-fetch when the upstream has no CORS). Streams SSE responses through. Guards: http/https only, ports 80/443 only, own domains blocked, private/loopback IP literals blocked (SSRF), upstream path whitelist (`chat/completions`, `completions`, `messages`, `models`, `embeddings`, `responses`, `images/generations`, `images/edits`, `audio/speech`, `count_tokens`), 2 MB body cap, no redirect following. Authorization is forwarded only, never stored or logged.
  - Frontend `services/ai/corsRelay.ts`: web (non-APK) only; direct fetch first, and on network-layer failure it retries once via the relay. `请求模型文本` failures now include a CORS guidance message. Model-list fetching appends relay candidates after direct candidates in `构建OpenAI兼容模型列表候选地址` (all 10+ settings components inherit this). Toggle in ApiSettings (`网页版跨域自动中转`, default on, stored in localStorage `msjh_ai_cors_relay_mode`).
  - Tests: `__tests__/aiRelayCors.test.ts` (12 cases: endpoint guards, forwarding, error passthrough, corsRelay logic). `__tests__/apiModelSelection.test.ts` assertions updated for the appended relay candidates.

## 2026-08-28 Money Alias Write-Through Fix And v1.0.657 Release Notes

- Player-reported bug (darkvanmaster): AI issued `set 角色.金钱.银子 = 6270` + `set 角色.金钱.baseAmount = 6270000`, but only `baseAmount` took effect; the JSON kept stale `中层货币: 3500` and the panel (which reads tier fields via `规范化角色金钱`) never moved. Not related to workshop presets; original saves reproduce it.
- Root cause: money keeps two coexisting field sets — tier fields (`上层货币/中层货币/底层货币`) and legacy aliases (`金元宝/银子/铜钱` + topic aliases) + `baseAmount`. The variable prompt tells AI to write legacy aliases; but `读取货币数值` prefers tier fields, and the per-turn money normalization (`规范化角色物品容器映射` → `从物品列表汇总角色货币` → `规范化角色金钱`) then overwrites the alias back from the stale tier field. `baseAmount` reads prefer existing values, which is why it "worked".
- Fix (PR #76, v1.0.657): in `hooks/useGame/stateTransforms.ts`, new `提取金钱命令字段` + `同步金钱命令写入`. `hooks/useGame/responseCommandProcessor.ts` runs the write-through right after tavern_commands application and BEFORE money normalization: AI-touched fields are authoritative — alias/tier writes sync the tier fields and recompute `baseAmount`; baseAmount-only writes decompose into tiers; already-present topic alias fields (灵石/现金/存款/灵晶…) are aligned to their tier value (existing keys only, never added). Regression tests: `__tests__/moneyCommandWriteThrough.test.ts` (13 cases).
- CodeRabbit review (PR #76, CHILL): 1 Major — baseAmount-only sync must also refresh topic currency alias fields; fixed in commit 2d80723 with tests. Review quota is 1/hour on this plan; incremental re-review may lag.
- Release surface findings (2026-08-28):
  - VPS domain `moranjianghu.bacon159.pp.ua` is UNREACHABLE (DNS resolves, TCP 443 dead). The APK provider router (`functions/api/apk/_providerRouter.ts`) does not validate liveness at request time and would 302 the default `/api/apk/latest.apk` to this dead host when quark/fullstack fail. `scripts/publish-release-b2.mjs` default `MORAN_RELEASE_PREFERRED_APK_PROVIDER` changed `vps` → `github` (env override still supported).
  - `apk-dist` branch had been stale since v1.0.646 (github-raw channel 404 for newer versions). `node scripts/publish-apk-github-raw.mjs` re-synced it to v1.0.657; verified end-to-end (cloudflare-proxy pages → raw → correct SHA-256).
  - All three APK channels verified for v1.0.657 with SHA-256 `c9ab9fc4...`: OneDrive, GitHub Release (gh-proxy), GitHub raw (apk-dist + pages accelerator).
- CRITICAL Cloudflare deploy auth discovery: local wrangler stored auth is the OLD account (`648558021@qq.com`), which CANNOT touch the new account (`1524640484@qq.com`) — `kv put`/`deploy` fail with `Authentication error [code: 10000]`, and with proxy vars cleared wrangler fails SILENTLY (exit 0, empty output). Production Cloudflare operations must inject `CLOUDFLARE_EMAIL` / `CLOUDFLARE_API_KEY` / `CLOUDFLARE_ACCOUNT_ID` from the Windows user-level env vars `CF_MIGRATE_TARGET_GLOBAL_API_EMAIL` / `CF_MIGRATE_TARGET_GLOBAL_API_KEY` / `CF_MIGRATE_TARGET_ACCOUNT_ID` (read via PowerShell `[Environment]::GetEnvironmentVariable(...,'User')`), and KEEP the proxy for network reachability. Watch for `[KV] manifest write failed (non-fatal)` in `release:manifest` output — it means the KV manifest did NOT update even though the script "completes".

## Notes

- AGENTS.md

## 2026-08-29 Party Join Tightening (v1.0.658)

- Player report (Xxx): "只要是主线人物，就会自动加入到队伍当中" — main-storyline characters auto-joined the party.
- Root cause (two layers, PR #77): local `同行强确认事实正则` treated pure narrative movement verbs (跟随/跟着/带着/领着/护送/压阵/随身/并肩/并行) as join evidence; `prompts/stats/npc.ts` rule 48 additionally instructed the AI to set `是否队友=true` for 随主角同行/护送主角/并肩作战, which mass-matches narration.
- Fix: join evidence narrowed to durable companionship semantics (同行/随行/随队/随我/随主角/同去/同往/同来/队友/同伴/结伴/追随主角/追随我); prompts now carry explicit evidence + counter-example lists and "主要角色/主线人物绝不因戏份多自动入队". Real joins still flow through explicit `set 社交[i].是否队友` commands.
- CodeRabbit Major follow-up: added `同行临时或否定事实正则` (短暂/暂时/临时/片刻/一程/一段路/婉拒/拒绝/谢绝/推辞/回绝/不曾/并未) — checked in BOTH `是否明确同行实名` and `应用同行事实到队伍`, so "短暂同行一段路" or "婉拒了结伴同行" never joins. A second CodeRabbit Minor (rewrite NPC `位置路径` format to the six-layer tree) was skipped with reason: `位置路径` is built from environment fields (构建环境位置路径: 大/中/小地点+具体地点), not the map tree.
- Tests: `__tests__/responseCommandProcessor.test.ts` +4 cases (narrative escort/lead/follow-crowd no-join; 结伴/追随主角 join; 短暂同行 no-join; 拒绝结伴 no-join). Existing scenes ("带着…随队听令", "明确跟随…同行") unaffected.

## 2026-08-29 K-Vault Cloud-Play 404 Incident, Upload Channel Repair, And v1.0.659 Release

- Player report: `读取云端存档失败：读取云端存档清单失败：HTTP 404` with 43 cached cloud saves. D1 `cloud_play_data` has 193 cloud-play accounts; 118 carry pre-migration `manifestUrl` and ALL of them 404ed. Sampled manifest URLs returned k-vault's `File not found` (404) while the file metadata rows still existed in `k-vault-metadata-fresh` D1.
- Root cause 1 (manifests/packages unreadable): k-vault signs telegram files as `tgs_<payload>.<HMAC>.<ext>` and verifies the HMAC against `[FILE_URL_SECRET, TG_FILE_URL_SECRET, TG_Bot_Token, 'k-vault-default-secret', 'tgbed-default-secret']`. The 2026-08-09 cross-account migration re-created the `k-vault` worker with a NEW `TG_Bot_Token`, but pre-migration links were HMAC'd with the OLD storage bot (the `@ziyongtuchuang_bot` token that is paired in the operator's notes with the storage channel `TG_Chat_ID`). Signature verification failed → fell through to literal-key lookup → 404. Verified offline: HMAC(old bot token) matches 3/3 stored signatures; the "旧bottoken/新bottoken" pair in the operator's notes does NOT match (they are different bots). Also, Telegram file_ids are bot-scoped: `getFile` with the new bot on old file_ids returns 400, so no signature-only fix could work — the old bot itself had to be restored.
- Fix 1: `wrangler secret put TG_Bot_Token --name k-vault` reverted to the old storage bot (still alive and still channel admin). Zero uploads existed between 2026-08-09 17:05 CST and the fix, so nothing depended on the interim token. Post-fix verified live: sampled manifest URLs 200 with full save lists (12/831/1601 saves), package download 206 with JSON body.
- Root cause 2 (uploads silently dead for 20 days): zero k-vault uploads after the zone switch. Two stacked causes: (a) every pre-migration account's upload flow aborts at step 1 (`读取云端存档清单` → 404); (b) the site worker's upstream POST to `image1.bacon159.pp.ua` returned **522** because `image1` is a **grey-cloud (DNS-only) CNAME → cdn.sanpin.ltd** — worker routes only apply to proxied hostnames, and CF-worker → sanpin-relay subrequests are blocked (players' browsers reach k-vault only because the external relay forwards into the CF edge). The zone uses intentional grey-cloud CDN relays for China reachability (`msjh` → 182682.xyz relay, `image1/cdn/jjs/tuchuang` → sanpin.ltd) — do NOT blindly orange-cloud these.
- Fix 2 (upload channel, no msjh code/deploy): enabled `workers_dev = true` on k-vault (CF-internal subrequests reach `https://k-vault.1524640484.workers.dev`), set site worker secret `IMAGE_HOST_BASE` to that URL, and rotated the site secret `IMAGE_HOST_TOKEN` together with a freshly minted k-vault API token (row `api_token:<id>` in `k-vault-metadata-fresh`.kv_store, envelope format `{__kvEnvelope:1,value:"<record JSON>",valueEncoding:"text"}`, record = `{id,name,scopes,tokenSalt,tokenHash:sha256hex(salt+':'+secret),tokenSuffix,...}`, token format `kvault_<id>_<secret>`). The old site token value was TOKEN_INVALID against k-vault's store.
- Fix 3 (download links must stay China-reachable): `/api/v1/upload` built `links.download` from the request origin, so uploads arriving via workers.dev generated workers.dev download links (often unreachable from mainland China). k-vault commit `d7042c0` (repo `ypq123456789/K-Vault`, branch `fix/r2-class-a-billing-d1`): `buildAbsoluteUrl(request, path, preferredBase)` now prefers `PUBLIC_BASE_URL`, and `/api/v1/upload` passes `env.PUBLIC_BASE_URL` (`https://image1.bacon159.pp.ua` var). Verified end-to-end: site-proxy upload → 200 telegram storage → download link on image1 → 200 with exact content. Test uploads deleted afterwards. NOTE: `paste.js` still builds links from request origin (left as-is, unused path).
- Red herring corrected: k-vault's `DEFAULT_STORAGE_TYPE=s3` binding does NOT affect the deployed worker at all — `functions/` never reads it (upload storageMode falls back to `"telegram"` in code); it only matters for the un-deployed Node `server/` mode. Site image uploads (`?kind=image`) go to PicUI/tuchuang-xqd, not k-vault. Set the var to `telegram` in `wrangler.152.toml` for hygiene only.
- CRITICAL k-vault deploy landmine: the live DB binding is `k-vault-metadata-fresh` (`1f747ac2-7845-41d7-9613-4d85708912ab`), but the local `wrangler.152.toml` previously pointed at `k-vault-metadata-backup` (`1455d6e0-...`, an incomplete 23k-row copy). Deploying from an uncorrected toml would silently regress the metadata store. The toml has been corrected; ALWAYS confirm the DB binding after any future k-vault deploy.
- Operator credential-note trap: the pasted note file lists `旧bottoken`/`新bottoken`/`TG_Bot_Token` entries for DIFFERENT bots. The k-vault storage bot is the one paired with the k-vault `TG_Chat_ID` and its name is 自用图床 (@ziyongtuchuang_bot). Verify by HMAC-ing a real stored `tgs_` payload before trusting a note. Never write bot tokens into repo files; extract from the note at runtime and pass via stdin.
- v1.0.659 release (same day): PR #78 (day-mode colored chip readability via two new tint rules in `styles/global.css`; `bg-gray-800`→`bg-black/50` tag in NovelDecompositionSettings; `InlineSelect` opt-in `wrapLabel`; workflow graph 渠道/模型 text + inline selects now wrap instead of ellipsis) — CodeRabbit CHILL review had NO actionable comments. Release flow: merge → bump 1.0.659 → backup commit `80a3724` → timestamp refresh `3b51035` → APK rebuilt from final main (sha256 `455e028f...`, apksigner v2, cert `0c638692...` matches release keystore) → OneDrive + KV manifest → GitHub Release v1.0.659 + apk-dist sync → both domains verified (release-info version/timestamp, bundle hash `index-B2R19kHK.js`, 3-channel APK sha256 identical). Remember: GitHub Release assets are NOT auto-created by `release:manifest` — run `npm run release:github` or the default APK redirect 404s at gh-proxy.

## 2026-09-14 Streaming Relay Fallback And Relay Auth Header Forwarding (v1.0.667)

- Player report: web players hit `无法连接到接口服务器（已自动尝试同域中转仍失败）` with the underlying `API Error: network error during stream request`, while the in-app "测试连接" button passed. The visible message was also untrue — the streaming path never attempted the relay at all.
- Root cause: the streaming path (`解析SSE文本XHR` in `services/ai/chatCompletionClient.ts`) did `xhr.open('POST', endpoint)` straight at the upstream URL and had **no** `/api/ai-relay` fallback, while the non-streaming path (`fetchWithCorsRelay`) already retried through the relay. `enableStream = !!streamOptions?.stream`, so "测试连接" (non-streaming) succeeded while the main story stream failed.
- Fix (PR #86, merged into `main` as `9b43c9b`):
  - The streaming XHR call is now wrapped and, when the direct attempt fails with a network-layer error **and no response bytes were received yet**, it retries once through `/api/ai-relay`. A request that already produced body content is never re-sent (avoids double generation/billing); `协议请求错误.已接收字节` tracks how much body arrived.
  - Connection-error copy is now truthful: "已自动尝试同域中转仍失败" is shown only when the relay was actually attempted; interrupted responses instead say the request was not re-sent to avoid double billing. Local/LAN targets get a targeted hint.
  - `functions/api/ai-relay/[[path]].ts` now forwards `Authorization`, `api-key`, `x-api-key` and `x-goog-api-key` (previously only `Authorization`), and `Access-Control-Allow-Headers` was widened to match. Without this, `api-key`-style providers (e.g. Xiaomi MiMo) always returned 401 through the relay.
- Relay limits still apply and cannot be worked around: `http` only on port 80, `https` only on port 443, private/loopback IPs and own domains rejected, 2 MB body cap. A default local Ollama (`127.0.0.1:11434`) can therefore **never** use the relay — those users need the APK (native streamer, not subject to CORS) or a public HTTPS endpoint on port 443.
- Tests: `__tests__/aiRelayStreamFallback.test.ts` (8 cases; proves the relay is actually called after a direct network failure and that a partial response is never re-sent) plus an `aiRelayCors.test.ts` case asserting the auth headers are forwarded.
- Verification lesson: because `wrangler deploy` bundles the prebuilt `.tmp-worker-build/index.js`, any `functions/` change requires `npm run worker:functions` first, plus a grep for a newly added symbol in that bundle. Do not deploy a `functions/` change on a stale bundle.
