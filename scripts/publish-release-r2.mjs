import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releaseInfo = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8')
);

const apkPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
);

if (!fs.existsSync(apkPath)) {
  throw new Error(`未找到 APK: ${apkPath}`);
}

const bucket = releaseInfo.r2Bucket;
const prefix = String(releaseInfo.r2Prefix || '').replace(/^\/+|\/+$/g, '');
const latestKey = `${bucket}/${prefix}/latest.apk`;
const versionedKey = `${bucket}/${prefix}/MoRanJiangHu-v${releaseInfo.versionName}.apk`;
const manifestKey = `${bucket}/${prefix}/latest.json`;

const manifest = {
  versionCode: releaseInfo.versionCode,
  versionName: releaseInfo.versionName,
  releaseChannel: releaseInfo.releaseChannel,
  websiteUrl: releaseInfo.websiteUrl,
  githubRepoUrl: releaseInfo.githubRepoUrl,
  releaseNotesUrl: releaseInfo.releaseNotesUrl,
  apkUrl: releaseInfo.apkDownloadUrl,
  manifestUrl: releaseInfo.updateManifestUrl,
  publishedAt: new Date().toISOString()
};

const manifestPath = path.join(os.tmpdir(), `moranjianghu-release-${Date.now()}.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const runWrangler = (args) => {
  const result = spawnSync(command, ['wrangler', ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler 命令执行失败: ${args.join(' ')}`);
  }
};

runWrangler(['r2', 'object', 'put', latestKey, '--file', apkPath, '--content-type', 'application/vnd.android.package-archive', '--remote']);
runWrangler(['r2', 'object', 'put', versionedKey, '--file', apkPath, '--content-type', 'application/vnd.android.package-archive', '--remote']);
runWrangler(['r2', 'object', 'put', manifestKey, '--file', manifestPath, '--content-type', 'application/json', '--remote']);

console.log(`R2 publish complete:
- ${releaseInfo.apkDownloadUrl}
- ${releaseInfo.updateManifestUrl}`);
