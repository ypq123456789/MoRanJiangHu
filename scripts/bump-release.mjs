import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseConfigPath = path.join(rootDir, 'release.config.json');

const mode = process.argv[2] || 'patch';
const releaseConfig = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));

const parseVersion = (value) => {
  const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`不支持的版本号格式: ${value}`);
  }
  return match.slice(1).map(Number);
};

const [major, minor, patch] = parseVersion(releaseConfig.versionName);
let nextVersion;

switch (mode) {
  case 'major':
    nextVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    nextVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    nextVersion = `${major}.${minor}.${patch + 1}`;
    break;
  default:
    if (/^\d+\.\d+\.\d+$/.test(mode)) {
      nextVersion = mode;
      break;
    }
    throw new Error(`未知 bump 模式: ${mode}`);
}

releaseConfig.versionName = nextVersion;
releaseConfig.versionCode = Number(releaseConfig.versionCode || 0) + 1;
fs.writeFileSync(releaseConfigPath, `${JSON.stringify(releaseConfig, null, 2)}\n`, 'utf8');

const npxCommand = process.platform === 'win32' ? 'node' : 'node';
const syncResult = spawnSync(npxCommand, [path.join(rootDir, 'scripts', 'sync-release.mjs')], {
  cwd: rootDir,
  stdio: 'inherit'
});

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

console.log(`Release bumped to v${releaseConfig.versionName} (${releaseConfig.versionCode})`);
