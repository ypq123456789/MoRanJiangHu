import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { uploadApkFileToOpenListWithCurl, verifyOpenListApkFiles } from './upload-apk-onedrive.mjs';
import { loadDevVars } from './load-dev-vars.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 自足加载 .dev.vars，否则本机直接 `npm run release:quark` 会因缺少
// MORAN_OPENLIST_AUTH_TOKEN 而失败（见 load-dev-vars.mjs）。
const devVarsLoad = loadDevVars();

// ⚠️ 上传目录与 Worker 读取目录必须是同一个。
// 2026-09-19 起 Worker 侧读的是 QUARK_APK_DIR = '/夸克/MoRanJiangHu/releases'
// （见 functions/api/apk/_shared.ts）。原先两边都用 '/夸克TV/...'，但那个挂载是
// QuarkTV driver：既要扫码换 refresh token，又是 NoUpload，APK 根本传不进去。
// 现改用 '/夸克'（Quark driver + 网页 cookie，支持上传），此常量必须与新路径一致。
const QUARK_APK_ROOT = '/夸克/MoRanJiangHu/releases';

const apkPath = path.resolve(
  process.argv[2]
  || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
);
const releaseInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8'));
const apkSize = fs.statSync(apkPath).size;
const baseUrl = String(process.env.MORAN_OPENLIST_BASE_URL || 'https://openlist.bacon.de5.net').replace(/\/+$/, '');
const authToken = String(process.env.MORAN_OPENLIST_AUTH_TOKEN || '').trim();
const timeoutMs = Math.max(1000, Number(process.env.MORAN_OPENLIST_UPLOAD_TIMEOUT_MS || 600000));

console.log(devVarsLoad.loaded
  ? `[env] .dev.vars loaded (${devVarsLoad.keys.length} keys applied)`
  : '[env] .dev.vars not found — 仅使用当前 shell 环境变量');
if (!authToken) throw new Error('缺少 MORAN_OPENLIST_AUTH_TOKEN：请写入 .dev.vars 或显式导出该环境变量。');
console.log(`[quark] 上传目标 ${QUARK_APK_ROOT}（v${releaseInfo.versionName}，${apkSize} 字节）`);

const uploaded = uploadApkFileToOpenListWithCurl({
  apkPath,
  versionName: releaseInfo.versionName,
  targetRoot: QUARK_APK_ROOT,
  baseUrl,
  authToken,
  timeoutMs
});
const verified = await verifyOpenListApkFiles({
  versionName: releaseInfo.versionName,
  expectedSize: apkSize,
  downloadRoot: QUARK_APK_ROOT,
  baseUrl,
  authToken
});

console.log(JSON.stringify({ uploaded, verified }, null, 2));
