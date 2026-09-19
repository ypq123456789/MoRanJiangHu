import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

const readEnv = (name, fallback = '') => String(process.env[name] || fallback).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const buildOpenListApkTargets = (
  versionName,
  targetRoot = '/Onedrive/MoRanJiangHu/releases'
) => {
  const normalizedRoot = `/${String(targetRoot).replace(/^\/+|\/+$/g, '')}`;
  return [
  {
    filePath: `${normalizedRoot}/latest.apk`,
    cacheControl: 'public, max-age=3600, stale-while-revalidate=86400'
  },
  {
    filePath: `${normalizedRoot}/MoRanJiangHu-v${versionName}.apk`,
    cacheControl: 'public, max-age=86400, stale-while-revalidate=604800'
  }
  ];
};

const shouldRetryUploadError = (error) => {
  const message = String(error?.message || error || '');
  const code = String(error?.code || error?.cause?.code || '');
  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'EAI_AGAIN',
    'fetch failed',
    'timeout',
    '5'
  ].some((needle) => code.includes(needle) || message.includes(needle));
};

export const uploadApkToOpenList = async ({
  apkBytes,
  versionName,
  targetRoot = '/Onedrive/MoRanJiangHu/releases',
  baseUrl = 'https://openlist.bacon.de5.net',
  authToken,
  timeoutMs = 10 * 60 * 1000,
  maxAttempts = 4,
  fetchImpl = fetch,
  onRetry = () => {}
}) => {
  if (!authToken) throw new Error('Missing MORAN_OPENLIST_AUTH_TOKEN.');
  if (!versionName) throw new Error('release.config.json versionName is empty.');
  if (!apkBytes?.byteLength) throw new Error('APK bytes are empty.');

  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const targets = buildOpenListApkTargets(versionName, targetRoot);

  const putFile = async ({ filePath, cacheControl }) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(`${normalizedBaseUrl}/api/fs/put`, {
          method: 'PUT',
          headers: {
            Authorization: authToken,
            'File-Path': encodeURI(filePath),
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl
          },
          body: apkBytes,
          signal: AbortSignal.timeout(timeoutMs)
        });
        const text = await response.text().catch(() => '');
        let payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(`OpenList upload returned non-JSON for ${filePath}: HTTP ${response.status} ${text.slice(0, 160)}`);
        }
        if (!response.ok || payload?.code !== 200) {
          throw new Error(`OpenList upload failed for ${filePath}: HTTP ${response.status} ${text.slice(0, 300)}`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !shouldRetryUploadError(error)) break;
        onRetry({ filePath, attempt, maxAttempts, error });
        await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  };

  for (const target of targets) {
    await putFile(target);
  }

  return {
    ok: true,
    latestPath: targets[0].filePath,
    versionedPath: targets[1].filePath,
    bytes: apkBytes.byteLength,
    versionName
  };
};

export const verifyOpenListApkFiles = async ({
  versionName,
  expectedSize,
  downloadRoot = '/夸克/MoRanJiangHu/releases',
  baseUrl = 'https://openlist.bacon.de5.net',
  authToken,
  fetchImpl = fetch,
  verifyAttempts = 6,
  verifyRetryDelayMs = 3000
}) => {
  if (!authToken) throw new Error('Missing MORAN_OPENLIST_AUTH_TOKEN.');
  if (!versionName) throw new Error('release.config.json versionName is empty.');
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw new Error(`OpenList verification expected size is invalid: ${expectedSize}`);
  }

  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const normalizedRoot = `/${String(downloadRoot).replace(/^\/+|\/+$/g, '')}`;

  const listDirectory = async () => {
    const response = await fetchImpl(`${normalizedBaseUrl}/api/fs/list`, {
      method: 'POST',
      headers: { Authorization: authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: normalizedRoot, page: 1, per_page: 100, refresh: true }),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 200 || !Array.isArray(payload?.data?.content)) {
      throw new Error(`OpenList verification failed for ${normalizedRoot}`);
    }
    return payload.data.content;
  };

  // 目录列表有缓存（refresh:true 也可能返回旧索引），且夸克这类驱动是
  // 「PUT 返回 200 之后异步入库」的 —— 文件要过几秒才可见。列表缺失时先用
  // /api/fs/get 兜底，再整体重试若干轮，避免把「刚上传成功」误判成失败。
  const fetchFileInfo = async (name) => {
    const response = await fetchImpl(`${normalizedBaseUrl}/api/fs/get`, {
      method: 'POST',
      headers: { Authorization: authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${normalizedRoot}/${name}`, password: '' }),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.code === 200 && payload?.data && !payload.data.is_dir) {
      return { size: Number(payload.data.size), sign: payload.data.sign ? String(payload.data.sign) : '' };
    }
    return null;
  };

  const requiredNames = ['latest.apk', `MoRanJiangHu-v${versionName}.apk`];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveOnce = async () => {
    const content = await listDirectory();
    const missing = [];
    const files = [];
    for (const name of requiredNames) {
      let item = content.find((entry) => entry?.name === name && !entry?.is_dir);
      if (!item) item = await fetchFileInfo(name);
      if (!item) {
        // 尚未入库 → 可重试
        missing.push(name);
        continue;
      }
      // 已经出现，说明入库完成；此时尺寸/签名不符属于确定性失败，立即抛出。
      if (Number(item.size) !== expectedSize) {
        throw new Error(`OpenList verification size mismatch for ${name}: ${item.size}`);
      }
      if (!item.sign) throw new Error(`OpenList verification missing sign for ${name}`);
      files.push({ name, size: Number(item.size), sign: String(item.sign) });
    }
    return { missing, files };
  };

  const attempts = Number.isSafeInteger(verifyAttempts) && verifyAttempts > 0 ? verifyAttempts : 6;
  let missing = requiredNames;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await resolveOnce();
    if (result.missing.length === 0) {
      return { ok: true, root: normalizedRoot, files: result.files };
    }
    missing = result.missing;
    if (attempt < attempts) {
      console.log(`[OpenList] 校验第 ${attempt}/${attempts} 轮未见到 ${missing.join(', ')}，${Math.round(verifyRetryDelayMs / 1000)}s 后重试...`);
      await sleep(verifyRetryDelayMs);
    }
  }
  throw new Error(`OpenList verification missing ${missing.join(', ')} after ${attempts} attempts`);
};

export const uploadApkFileToOpenListWithCurl = ({
  apkPath,
  versionName,
  baseUrl,
  authToken,
  targetRoot = '/Onedrive/MoRanJiangHu/releases',
  uploadTargets,
  timeoutMs,
  spawnImpl = spawnSync
}) => {
  if (!authToken) throw new Error('Missing MORAN_OPENLIST_AUTH_TOKEN.');
  if (!versionName) throw new Error('release.config.json versionName is empty.');
  if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const targets = Array.isArray(uploadTargets) && uploadTargets.length > 0
    ? uploadTargets
    : buildOpenListApkTargets(versionName, targetRoot);
  const maxTimeSeconds = String(Math.ceil(timeoutMs / 1000));

  for (const target of targets) {
    console.log(`[OpenList] uploading ${target.filePath}...`);
    const result = spawnImpl(curl, [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--retry', '5',
      '--retry-delay', '3',
      '--retry-all-errors',
      '--max-time', maxTimeSeconds,
      '-X', 'PUT',
      '-H', `Authorization: ${authToken}`,
      '-H', `File-Path: ${encodeURI(target.filePath)}`,
      '-H', 'Content-Type: application/vnd.android.package-archive',
      '-H', `Cache-Control: ${target.cacheControl}`,
      '--data-binary', `@${apkPath}`,
      `${normalizedBaseUrl}/api/fs/put`
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: timeoutMs + 60 * 1000
    });

    if (result.status !== 0) {
      throw new Error(`OpenList curl upload failed for ${target.filePath}: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
    }

    const payload = JSON.parse(result.stdout || '{}');
    if (payload?.code !== 200) {
      throw new Error(`OpenList curl upload rejected for ${target.filePath}: ${(result.stdout || '').slice(0, 500)}`);
    }
  }

  const bytes = fs.statSync(apkPath).size;
  return {
    ok: true,
    latestPath: targets[0].filePath,
    versionedPath: targets[1].filePath,
    bytes,
    versionName
  };
};

export const verifyOpenListApkTargets = async ({
  targets,
  expectedSize,
  baseUrl = 'https://openlist.bacon.de5.net',
  authToken,
  fetchImpl = fetch
}) => {
  if (!authToken) throw new Error('Missing MORAN_OPENLIST_AUTH_TOKEN.');
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('OpenList verification targets are empty.');
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw new Error(`OpenList verification expected size is invalid: ${expectedSize}`);
  }

  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const files = [];
  for (const target of targets) {
    const response = await fetchImpl(`${normalizedBaseUrl}/api/fs/get`, {
      method: 'POST',
      headers: { Authorization: authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target.filePath, password: '' }),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = await response.json().catch(() => null);
    const item = payload?.data;
    if (!response.ok || payload?.code !== 200 || !item) {
      throw new Error(`OpenList verification failed for ${target.filePath}`);
    }
    if (Number(item.size) !== expectedSize) {
      throw new Error(`OpenList verification size mismatch for ${target.filePath}: ${item.size}`);
    }
    if (!item.sign) throw new Error(`OpenList verification missing sign for ${target.filePath}`);
    files.push({ filePath: target.filePath, size: Number(item.size), sign: String(item.sign) });
  }

  return { ok: true, files };
};

if (isMain) {
  const baseUrl = readEnv('MORAN_OPENLIST_BASE_URL', 'https://openlist.bacon.de5.net');
  const authToken = readEnv('MORAN_OPENLIST_AUTH_TOKEN');
  const apkPath = path.resolve(
    process.argv[2] || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  );
  const releaseInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8'));
  const versionName = String(releaseInfo.versionName || '').trim();
  const timeoutMs = Math.max(1000, Number(process.env.MORAN_OPENLIST_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000));

  if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
  const result = uploadApkFileToOpenListWithCurl({
    apkPath,
    versionName,
    baseUrl,
    authToken,
    timeoutMs
  });

  console.log(JSON.stringify(result, null, 2));
}
