/**
 * publish-release-github.mjs
 *
 * 将 APK 上传到 GitHub Releases 作为第三个下载渠道。
 * 利用 gh CLI（已认证账号）创建 Release 并上传 APK asset。
 *
 * 用法：npm run release:github [apk-path]
 *
 * GitHub Releases 对公开仓库免费无限量存储，因此保留所有历史版本。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cleanTmpAfterRelease } from './clean-tmp.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const releaseInfo = readJson(path.join(rootDir, 'release.config.json'));
const apkPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
);

const safeVersionName = (value) => String(value || '').trim().replace(/[^0-9A-Za-z._-]/g, '');
const currentVersionName = safeVersionName(releaseInfo.versionName);
const currentVersionedFileName = `MoRanJiangHu-v${currentVersionName}.apk`;
const uploadApkPath = path.join(process.env.NODE_TMPDIR || process.env.TEMP || process.env.TMP || path.join(rootDir, 'output'), currentVersionedFileName);
const tag = `v${currentVersionName}`;

const owner = 'ypq123456789';
const repo = 'MoRanJiangHu';

if (!fs.existsSync(apkPath)) {
  throw new Error(`APK not found: ${apkPath}`);
}
fs.mkdirSync(path.dirname(uploadApkPath), { recursive: true });
fs.copyFileSync(apkPath, uploadApkPath);

// ── 检查 gh CLI 是否可用 ──
const ghCheck = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 10000 });
if (ghCheck.status !== 0) {
  throw new Error('gh CLI not authenticated. Run `gh auth login` first.');
}
console.log('[GitHub] gh CLI authenticated.');

// ── 构建 release notes ──
const releaseNotes = Array.isArray(releaseInfo.releaseNotes)
  ? releaseInfo.releaseNotes.join('\n')
  : String(releaseInfo.releaseNotes || releaseInfo.changes || '');

// ── 检查是否已有同名 release ──
const viewResult = spawnSync('gh', [
  'release', 'view', tag,
  '--repo', `${owner}/${repo}`,
  '--json', 'tagName,assets'
], { encoding: 'utf8', timeout: 15000 });

let releaseExists = false;
let existingAssetName = '';
if (viewResult.status === 0 && viewResult.stdout.trim()) {
  try {
    const existing = JSON.parse(viewResult.stdout.trim());
    if (existing?.tagName === tag) {
      releaseExists = true;
      const asset = (existing?.assets || []).find(a => a.name === currentVersionedFileName);
      existingAssetName = asset?.name || '';
      console.log(`[GitHub] Release ${tag} already exists.${existingAssetName ? ` Asset "${existingAssetName}" found.` : ''}`);
    }
  } catch {
    // parse failed, treat as not existing
  }
}

if (releaseExists) {
  // ── 更新已有 release：删除旧 asset，上传新的 ──
  if (existingAssetName) {
    console.log(`[GitHub] Deleting old asset "${existingAssetName}" from ${tag}...`);
    const deleteResult = spawnSync('gh', [
      'release', 'delete-asset', tag,
      existingAssetName,
      '--repo', `${owner}/${repo}`,
      '--yes'
    ], { encoding: 'utf8', timeout: 30000 });
    if (deleteResult.status !== 0) {
      console.warn(`[GitHub] Failed to delete old asset: ${(deleteResult.stderr || '').slice(0, 300)}`);
    } else {
      console.log(`[GitHub] Old asset deleted.`);
    }
  }

  console.log(`[GitHub] Uploading APK to existing release ${tag}...`);
  const uploadResult = spawnSync('gh', [
    'release', 'upload', tag,
    uploadApkPath,
    '--repo', `${owner}/${repo}`,
    '--clobber'
  ], { encoding: 'utf8', timeout: 600000 });
  if (uploadResult.status !== 0) {
    throw new Error(`GitHub release upload failed: ${(uploadResult.stderr || uploadResult.stdout || '').slice(0, 500)}`);
  }
  console.log(`[GitHub] APK uploaded to existing release ${tag}.`);
} else {
  // ── 创建新 release 并上传 APK ──
  const notesFile = path.join(
    process.env.NODE_TMPDIR || process.env.TEMP || process.env.TMP || path.join(rootDir, 'output'),
    `github-release-notes-${Date.now()}.txt`
  );
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, releaseNotes, 'utf8');

  console.log(`[GitHub] Creating release ${tag} with APK asset...`);
  const createResult = spawnSync('gh', [
    'release', 'create', tag,
    uploadApkPath,
    '--repo', `${owner}/${repo}`,
    '--title', `v${currentVersionName}`,
    '--notes-file', notesFile,
    '--latest'
  ], { encoding: 'utf8', timeout: 600000 });

  fs.rmSync(notesFile, { force: true });

  if (createResult.status !== 0) {
    throw new Error(`GitHub release create failed: ${(createResult.stderr || createResult.stdout || '').slice(0, 500)}`);
  }
  console.log(`[GitHub] Release ${tag} created with APK asset.`);
}

// ── 输出下载 URL ──
const githubDownloadUrl = `https://github.com/${owner}/${repo}/releases/download/${tag}/${currentVersionedFileName}`;
const githubApiAssetUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;

console.log(`
GitHub Release publish complete:
- Tag: ${tag}
- APK asset: ${currentVersionedFileName}
- Direct download: ${githubDownloadUrl}
- API tag URL: ${githubApiAssetUrl}
- All historical releases are preserved (GitHub free unlimited storage for public repos)
`);

// 收尾清理临时产物（保留最近 1 天，绝不抛错影响发布结果）
cleanTmpAfterRelease();
