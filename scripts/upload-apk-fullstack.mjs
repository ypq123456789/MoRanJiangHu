import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  uploadApkFileToOpenListWithCurl,
  verifyOpenListApkTargets
} from './upload-apk-onedrive.mjs';
import { loadDevVars } from './load-dev-vars.mjs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

// 自足加载 .dev.vars，否则本机直接 `npm run release:fullstack` 会因缺少
// MORAN_OPENLIST_AUTH_TOKEN 而失败（见 load-dev-vars.mjs）。
const devVarsLoad = loadDevVars();

export const buildFullstackUploadTargets = (versionName) => {
  const safeVersion = String(versionName || '').trim();
  if (!/^[0-9A-Za-z._-]+$/.test(safeVersion)) {
    throw new Error('Invalid release versionName.');
  }
  return [
    {
      filePath: '/全栈云盘/MoRanJiangHu/releases/latest.apk',
      cacheControl: 'public, max-age=3600, stale-while-revalidate=86400'
    },
    {
      filePath: `/全栈云盘/MoRanJiangHu/releases/MoRanJiangHu-v${safeVersion}.apk`,
      cacheControl: 'public, max-age=86400, stale-while-revalidate=604800'
    }
  ];
};

export const uploadApkToFullstack = async ({
  apkPath,
  versionName,
  baseUrl,
  authToken,
  timeoutMs = 10 * 60 * 1000
}) => {
  const targets = buildFullstackUploadTargets(versionName);
  const uploaded = uploadApkFileToOpenListWithCurl({
    apkPath,
    versionName,
    baseUrl,
    authToken,
    uploadTargets: targets,
    timeoutMs
  });
  const verified = await verifyOpenListApkTargets({
    targets,
    expectedSize: fs.statSync(apkPath).size,
    baseUrl,
    authToken
  });
  return { uploaded, verified };
};

if (isMain) {
  if (process.argv.includes('--help')) {
    console.log(`Usage: node scripts/upload-apk-fullstack.mjs [apkPath]\n\nRequired environment:\n  MORAN_OPENLIST_AUTH_TOKEN\n\nTargets:\n  /全栈云盘/MoRanJiangHu/releases/latest.apk\n  /全栈云盘/MoRanJiangHu/releases/MoRanJiangHu-v<version>.apk`);
    process.exit(0);
  }

  const releaseInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8'));
  const apkPath = path.resolve(
    process.argv[2]
    || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  );
  const baseUrl = String(process.env.MORAN_OPENLIST_BASE_URL || 'https://openlist.bacon.de5.net').replace(/\/+$/, '');
  const authToken = String(process.env.MORAN_OPENLIST_AUTH_TOKEN || '').trim();
  const timeoutMs = Math.max(1000, Number(process.env.MORAN_OPENLIST_UPLOAD_TIMEOUT_MS || 600000));

  if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
  console.log(devVarsLoad.loaded
    ? `[env] .dev.vars loaded (${devVarsLoad.keys.length} keys applied)`
    : '[env] .dev.vars not found — 仅使用当前 shell 环境变量');
  if (!authToken) throw new Error('缺少 MORAN_OPENLIST_AUTH_TOKEN：请写入 .dev.vars 或显式导出该环境变量。');
  const result = await uploadApkToFullstack({
    apkPath,
    versionName: releaseInfo.versionName,
    baseUrl,
    authToken,
    timeoutMs
  });
  console.log(JSON.stringify(result, null, 2));
}
