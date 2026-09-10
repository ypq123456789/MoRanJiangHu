/**
 * publish-apk-github-raw.mjs
 *
 * Publish the current APK to a dedicated Git branch used by raw.githubusercontent.com.
 * The branch is intentionally separate from main so large APK binaries do not pollute
 * the source branch history.
 *
 * Usage: node scripts/publish-apk-github-raw.mjs [apk-path]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const releaseInfo = readJson(path.join(rootDir, 'release.config.json'));
const apkPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
);

const owner = process.env.GITHUB_REPOSITORY_OWNER || 'ypq123456789';
const repo = process.env.GITHUB_REPOSITORY_NAME || 'MoRanJiangHu';
const remote = process.env.GITHUB_RAW_APK_REMOTE || 'origin';
const branch = process.env.GITHUB_RAW_APK_BRANCH || 'apk-dist';
const accelerator = String(process.env.GITHUB_RAW_ACCELERATOR || 'https://cloudflare-proxy-6rw.pages.dev').replace(/\/+$/, '');
const safeVersionName = (value) => String(value || '').trim().replace(/[^0-9A-Za-z._-]/g, '');
const versionName = safeVersionName(releaseInfo.versionName);
const versionedFileName = `MoRanJiangHu-v${versionName}.apk`;

if (!versionName) throw new Error('release.config.json versionName is empty.');
if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').slice(0, 800)}`);
  }
  return result.stdout.trim();
};

run('git', ['status', '--short'], { timeout: 30_000 });

const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'moran-apk-raw-'));
const worktree = path.join(tmpParent, 'worktree');

const resolveRemoteBranchSha = () => {
  const result = spawnSync('git', ['ls-remote', '--heads', remote, branch], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 60_000
  });
  const line = String(result.stdout || '').trim().split('\n').find(Boolean) || '';
  return line.split(/\s+/)[0] || '';
};

const remoteBranchSha = resolveRemoteBranchSha();
const branchExists = Boolean(remoteBranchSha);

try {
  if (branchExists) {
    // 显式抓取目标分支尖端再以 FETCH_HEAD 建 worktree，不依赖 origin/<branch> 远端跟踪引用。
    // 精简/部分克隆仓库中可能完全没有 refs/remotes/origin/*，此时 worktree add origin/<branch>
    // 会直接报 "fatal: invalid reference"，导致发布流程在第一步就失败。
    run('git', ['fetch', '--depth=1', remote, branch], { timeout: 300_000 });
    run('git', ['worktree', 'add', '--detach', worktree, 'FETCH_HEAD'], { timeout: 120_000 });
  } else {
    run('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { timeout: 120_000 });
    run('git', ['checkout', '--orphan', branch], { cwd: worktree, timeout: 60_000 });
    run('git', ['rm', '-rf', '.'], { cwd: worktree, timeout: 60_000 });
  }

  fs.mkdirSync(path.join(worktree, 'releases'), { recursive: true });
  const latestTarget = path.join(worktree, 'latest.apk');
  const versionedTarget = path.join(worktree, 'releases', versionedFileName);
  fs.copyFileSync(apkPath, latestTarget);
  fs.copyFileSync(apkPath, versionedTarget);

  const bytes = fs.readFileSync(apkPath);
  const apkSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const rawDirectUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/releases/${versionedFileName}`;
  const rawAcceleratedUrl = accelerator ? `${accelerator}/${rawDirectUrl}` : rawDirectUrl;
  fs.writeFileSync(path.join(worktree, 'manifest.json'), JSON.stringify({
    versionName: releaseInfo.versionName,
    versionCode: releaseInfo.versionCode,
    fileName: versionedFileName,
    apkSha256,
    apkSize: bytes.byteLength,
    rawDirectUrl,
    rawAcceleratedUrl,
    publishedAt: releaseInfo.releasePublishedAt || new Date().toISOString()
  }, null, 2), 'utf8');

  run('git', ['add', 'latest.apk', 'releases', 'manifest.json'], { cwd: worktree, timeout: 60_000 });
  const diffStatus = run('git', ['status', '--short'], { cwd: worktree, timeout: 30_000 });
  if (!diffStatus) {
    console.log(`[GitHub Raw] ${branch} already has ${versionedFileName}.`);
  } else {
    run('git', ['commit', '-m', `release apk ${releaseInfo.versionName}`], { cwd: worktree, timeout: 120_000 });
    run('git', ['push', remote, `HEAD:${branch}`], { cwd: worktree, timeout: 600_000 });
  }

  console.log(`
GitHub Raw APK publish complete:
- Branch: ${branch}
- APK asset: releases/${versionedFileName}
- Raw direct: ${rawDirectUrl}
- Raw accelerated: ${rawAcceleratedUrl}
- SHA-256: ${apkSha256}
`);
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worktree], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 120_000
  });
  fs.rmSync(tmpParent, { recursive: true, force: true });
}
