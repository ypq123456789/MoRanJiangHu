import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePreferredApkProvider } from './apk-provider-selection.mjs';
import { uploadApkFileToOpenListWithCurl, verifyOpenListApkFiles } from './upload-apk-onedrive.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * 从项目根目录的 .dev.vars 载入凭据到 process.env（已存在的环境变量优先，不被覆盖）。
 *
 * 为什么需要：本脚本此前只从 process.env 读配置，却从未加载 .dev.vars，
 * 因此写 KV 时 wrangler 子进程拿不到 CLOUDFLARE_EMAIL/CLOUDFLARE_API_KEY，
 * 写入静默失败（2026-09-19 v1.0.669 发布时复现），而脚本仍以 exit 0 收尾，造成「假成功」。
 * 这里让脚本自足：即使操作者忘记用 run-with-cf-creds.mjs 包裹也能正常发布。
 *
 * .dev.vars 已被 .gitignore（`.dev.vars*`）忽略，凭据只留在本机，不会进仓库。
 * 注意：生产账号 B 用的是 Global API Key，必须同时提供 CLOUDFLARE_EMAIL；
 * 误用 CLOUDFLARE_API_TOKEN 会得到 `Invalid access token [code: 9109]`。
 */
const loadDevVars = () => {
  const devVarsPath = path.join(rootDir, '.dev.vars');
  let raw = '';
  try {
    raw = fs.readFileSync(devVarsPath, 'utf8');
  } catch {
    return { loaded: false, keys: [] };
  }
  const keys = [];
  raw.split(/\r?\n/).forEach((line) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const idx = text.indexOf('=');
    if (idx <= 0) return;
    const key = text.slice(0, idx).trim();
    const value = text.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || !value) return;
    if (process.env[key]) return; // 真实环境变量优先
    process.env[key] = value;
    keys.push(key);
  });
  return { loaded: true, keys };
};

const devVarsLoad = loadDevVars();

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const releaseInfo = readJson(path.join(rootDir, 'release.config.json'));
const apkPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
);

const readEnv = (name, fallback = '') => String(process.env[name] || fallback).trim();
const normalizeKey = (key) => key.replace(/^\/+/, '').replace(/\/+/g, '/');
const encodeKey = (key) => normalizeKey(key).split('/').map((part) => encodeURIComponent(part)).join('/');
const sha256Hex = (body) => crypto.createHash('sha256').update(body).digest('hex');
const sha1Hex = (body) => crypto.createHash('sha1').update(body).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const hmacHex = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');
const safeVersionName = (value) => String(value || '').trim().replace(/[^0-9A-Za-z._-]/g, '');

const baseUrl = readEnv('MORAN_B2_DISTRIBUTION_BASE_URL', 'https://obs1.bacon159.pp.ua').replace(/\/+$/, '');
const token = readEnv('MORAN_B2_DISTRIBUTION_TOKEN');
const prefix = readEnv('MORAN_B2_DISTRIBUTION_RELEASE_PREFIX', releaseInfo.r2Prefix || 'moranjianghu').replace(/^\/+|\/+$/g, '');
const keepVersionedApkCount = Math.max(1, Number(process.env.MORAN_B2_KEEP_VERSIONED_APKS || 5));
const timeoutMs = Math.max(1000, Number(process.env.MORAN_B2_DISTRIBUTION_TIMEOUT_MS || 10 * 60 * 1000));

const s3Endpoint = readEnv('MORAN_OSS_ENDPOINT', 'https://s3.hi168.com').replace(/\/+$/, '');
const s3Bucket = readEnv('MORAN_OSS_BUCKET');
const s3AccessKey = readEnv('MORAN_OSS_ACCESS_KEY');
const s3SecretKey = readEnv('MORAN_OSS_SECRET_KEY');
const s3Region = readEnv('MORAN_OSS_REGION', 'auto');
const s3Prefix = readEnv('MORAN_OSS_RELEASE_PREFIX', releaseInfo.r2Prefix || 'moranjianghu').replace(/^\/+|\/+$/g, '');
const b2ApplicationKeyId = readEnv('MORAN_B2_APPLICATION_KEY_ID');
const b2ApplicationKey = readEnv('MORAN_B2_APPLICATION_KEY');
const b2BucketId = readEnv('MORAN_B2_BUCKET_ID');

const skipB2ApkUpload = process.env.MORAN_B2_SKIP_APK_UPLOAD !== '0';

// 启动即打印凭据来源，便于在发布日志里一眼看出 KV 写入是否具备条件。
// 放在各前置校验之前，确保即使后续因参数问题提前退出，凭据状态也已可见。
console.log(
  devVarsLoad.loaded
    ? `[env] .dev.vars loaded (${devVarsLoad.keys.length} keys applied)`
    : '[env] .dev.vars not found — 仅使用当前 shell 环境变量'
);
console.log(
  '[env] cloudflare creds:',
  readEnv('CLOUDFLARE_EMAIL') && readEnv('CLOUDFLARE_API_KEY')
    ? `ok (email=${readEnv('CLOUDFLARE_EMAIL')}, account=${readEnv('CLOUDFLARE_ACCOUNT_ID') || '(未设置)'})`
    : 'MISSING — KV 清单写入将会失败'
);

if (!skipB2ApkUpload && !token) {
  throw new Error('Missing MORAN_B2_DISTRIBUTION_TOKEN.');
}
if (!fs.existsSync(apkPath)) {
  throw new Error(`APK not found: ${apkPath}`);
}

const b2ObjectUrl = (key) => `${baseUrl}/${encodeKey(key)}`;
const s3ObjectUrl = (key) => new URL(`${s3Endpoint}/${encodeURIComponent(s3Bucket)}/${encodeKey(key)}`);

const formatAmzDate = (date) => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

const signingKey = (dateStamp) => {
  const kDate = hmac(Buffer.from(`AWS4${s3SecretKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, s3Region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

const buildSignedS3Url = (key, method = 'GET', expiresSeconds = 1800) => {
  if (!s3Bucket || !s3AccessKey || !s3SecretKey) {
    throw new Error('Missing MORAN_OSS_BUCKET, MORAN_OSS_ACCESS_KEY, or MORAN_OSS_SECRET_KEY for history APK migration.');
  }
  const target = s3ObjectUrl(key);
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const credentialScope = `${dateStamp}/${s3Region}/s3/aws4_request`;
  target.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  target.searchParams.set('X-Amz-Credential', `${s3AccessKey}/${credentialScope}`);
  target.searchParams.set('X-Amz-Date', amzDate);
  target.searchParams.set('X-Amz-Expires', String(Math.max(60, Math.min(604800, expiresSeconds))));
  target.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalQuery = Array.from(target.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalRequest = [
    method,
    target.pathname,
    canonicalQuery,
    `host:${target.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = hmacHex(signingKey(dateStamp), stringToSign);
  target.searchParams.set('X-Amz-Signature', signature);
  return target.toString();
};

const request = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${init.method || 'GET'} ${url} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response;
};

let nativeB2UploadUrl = null;

const getNativeB2UploadUrl = async () => {
  if (nativeB2UploadUrl) return nativeB2UploadUrl;
  if (!b2ApplicationKeyId || !b2ApplicationKey || !b2BucketId) {
    throw new Error('Missing MORAN_B2_APPLICATION_KEY_ID, MORAN_B2_APPLICATION_KEY, or MORAN_B2_BUCKET_ID for native B2 upload fallback.');
  }
  const authResponse = await request('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${b2ApplicationKeyId}:${b2ApplicationKey}`).toString('base64')}`
    }
  });
  const auth = await authResponse.json();
  if (!auth?.apiUrl || !auth?.authorizationToken) {
    throw new Error('Backblaze B2 authorize response is missing apiUrl or authorizationToken.');
  }
  const uploadResponse = await request(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: b2BucketId })
  });
  const upload = await uploadResponse.json();
  if (!upload?.uploadUrl || !upload?.authorizationToken) {
    throw new Error('Backblaze B2 upload URL response is missing uploadUrl or authorizationToken.');
  }
  nativeB2UploadUrl = upload;
  return nativeB2UploadUrl;
};

const uploadBytesToNativeB2 = async ({ key, bytes, contentType, cacheControl }) => {
  const upload = await getNativeB2UploadUrl();
  const response = await fetch(upload.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: upload.authorizationToken,
      'X-Bz-File-Name': encodeKey(key),
      'X-Bz-Content-Sha1': sha1Hex(bytes),
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': cacheControl
    },
    body: bytes,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Native B2 upload ${key} failed (${response.status}): ${text.slice(0, 500)}`);
  }
};

const currentVersionName = safeVersionName(releaseInfo.versionName);
const owner = 'ypq123456789';
const repo = 'MoRanJiangHu';
const currentVersionedFileName = `MoRanJiangHu-v${currentVersionName}.apk`;
const currentApkBuffer = fs.readFileSync(apkPath);
const apkSha256 = sha256Hex(currentApkBuffer);
const apkSize = currentApkBuffer.byteLength;
const openListBaseUrl = readEnv('MORAN_OPENLIST_BASE_URL', 'https://openlist.bacon.de5.net').replace(/\/+$/, '');
const openListAuthToken = readEnv('MORAN_OPENLIST_AUTH_TOKEN');
const openListUploadTimeoutMs = Math.max(1000, Number(readEnv('MORAN_OPENLIST_UPLOAD_TIMEOUT_MS', '600000')));
const skipOpenListApkUpload = process.env.MORAN_OPENLIST_SKIP_APK_UPLOAD === '1';

if (skipOpenListApkUpload) {
  console.warn('[OpenList] APK upload and provider URLs skipped by MORAN_OPENLIST_SKIP_APK_UPLOAD=1');
} else {
  uploadApkFileToOpenListWithCurl({
    apkPath,
    versionName: currentVersionName,
    targetRoot: '/Onedrive/MoRanJiangHu/releases',
    baseUrl: openListBaseUrl,
    authToken: openListAuthToken,
    timeoutMs: openListUploadTimeoutMs
  });
  await verifyOpenListApkFiles({
    versionName: currentVersionName,
    expectedSize: apkSize,
    downloadRoot: '/Onedrive/MoRanJiangHu/releases',
    baseUrl: openListBaseUrl,
    authToken: openListAuthToken
  });
}

const websiteBaseUrl = String(releaseInfo.websiteUrl || '').replace(/\/+$/, '');
const githubReleaseAccelerators = readEnv('GITHUB_RELEASE_ACCELERATORS', 'https://gh.ddlc.top,https://gh-proxy.com,https://gh-proxy.ygxz.in,https://ghfast.top')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter((item) => /^https:\/\/[^/]+$/i.test(item));
const githubRawAccelerator = readEnv('GITHUB_RAW_ACCELERATOR', 'https://cloudflare-proxy-6rw.pages.dev').replace(/\/+$/, '');
const githubRawBranch = readEnv('GITHUB_RAW_APK_BRANCH', 'apk-dist');
const providerVerifyTimeoutMs = Math.max(1000, Number(readEnv('MORAN_APK_PROVIDER_VERIFY_TIMEOUT_MS', '120000')));

const releaseRecords = [
  { versionName: currentVersionName, versionCode: releaseInfo.versionCode },
  ...(Array.isArray(releaseInfo.releaseHistory) ? releaseInfo.releaseHistory : [])
]
  .map((item) => ({
    versionName: safeVersionName(item?.versionName),
    versionCode: Number(item?.versionCode || 0)
  }))
  .filter((item) => item.versionName);

const seenVersions = new Set();
const versionsToPublish = releaseRecords
  .filter((item) => {
    if (seenVersions.has(item.versionName)) return false;
    seenVersions.add(item.versionName);
    return true;
  })
  .slice(0, keepVersionedApkCount);

const versionedFileName = (versionName) => `MoRanJiangHu-v${safeVersionName(versionName)}.apk`;
const b2VersionedKey = (versionName) => normalizeKey(`${prefix}/${versionedFileName(versionName)}`);
const b2LatestApkKey = normalizeKey(`${prefix}/latest.apk`);
const b2ManifestKey = normalizeKey(`${prefix}/latest.json`);
const hi168VersionedKey = (versionName) => normalizeKey(`${s3Prefix}/${versionedFileName(versionName)}`);

const providerApkUrls = {
  fullstack: '',
  vps: `${String(process.env.MORAN_VPS_APK_BASE_URL || 'https://moranjianghu.bacon159.pp.ua').replace(/\/+$/, '')}/latest.apk`,
  quarkTv: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.apk?provider=quark-tv` : '',
  onedrive: !skipOpenListApkUpload && websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive` : '',
  onedriveDirect: !skipOpenListApkUpload && websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive-direct` : '',
  github: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(currentVersionedFileName)}?provider=github` : '',
  githubDirect: `https://github.com/ypq123456789/MoRanJiangHu/releases/download/v${currentVersionName}/${currentVersionedFileName}`,
  githubRaw: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(currentVersionedFileName)}?provider=github-raw` : '',
  githubRawDirect: `https://raw.githubusercontent.com/${owner}/${repo}/${githubRawBranch}/releases/${currentVersionedFileName}`
};
const githubAcceleratedApkUrls = githubReleaseAccelerators.map((baseUrl) => `${baseUrl}/${providerApkUrls.githubDirect}`);
const githubRawAcceleratedApkUrl = githubRawAccelerator && /^https:\/\/[^/]+$/i.test(githubRawAccelerator)
  ? `${githubRawAccelerator}/${providerApkUrls.githubRawDirect}`
  : '';
// VPS 和 GitHub Raw 只有通过远端完整性校验后才允许成为首选。
// 如需强制其他通道，用环境变量 MORAN_RELEASE_PREFERRED_APK_PROVIDER 覆盖。
// 默认改为 github：VPS 域（moranjianghu.bacon159.pp.ua）2026-08-28 起失联，
// 且请求时路由不校验 VPS 存活、静默 302 到死链，github 通道最稳。
const requestedPreferredApkProvider = readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'github');
const fallbackPreferredApkProvider = await resolvePreferredApkProvider({
  requestedProvider: requestedPreferredApkProvider,
  vpsUrl: providerApkUrls.vps,
  githubRawUrl: githubRawAcceleratedApkUrl || providerApkUrls.githubRawDirect,
  apkSize,
  apkSha256,
  timeoutMs: providerVerifyTimeoutMs
});
const fallbackProviderUrls = fallbackPreferredApkProvider === 'vps'
  ? [providerApkUrls.vps, providerApkUrls.quarkTv, providerApkUrls.onedrive, providerApkUrls.onedriveDirect, ...githubAcceleratedApkUrls, providerApkUrls.github, githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, providerApkUrls.githubRawDirect, providerApkUrls.githubDirect].filter(Boolean)
  : fallbackPreferredApkProvider === 'github'
  ? [...githubAcceleratedApkUrls, providerApkUrls.github, githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, providerApkUrls.quarkTv, providerApkUrls.onedrive, providerApkUrls.onedriveDirect, providerApkUrls.githubDirect].filter(Boolean)
  : fallbackPreferredApkProvider === 'onedrive-direct'
    ? [providerApkUrls.onedriveDirect, providerApkUrls.onedrive, providerApkUrls.quarkTv, githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, ...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.githubDirect].filter(Boolean)
    : fallbackPreferredApkProvider === 'onedrive'
      ? [providerApkUrls.onedrive, providerApkUrls.onedriveDirect, providerApkUrls.quarkTv, githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, ...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.githubDirect].filter(Boolean)
      : fallbackPreferredApkProvider === 'quark-tv'
        ? [providerApkUrls.quarkTv, providerApkUrls.onedrive, providerApkUrls.onedriveDirect, ...githubAcceleratedApkUrls, providerApkUrls.github, githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, providerApkUrls.githubRawDirect, providerApkUrls.githubDirect].filter(Boolean)
        : [githubRawAcceleratedApkUrl, providerApkUrls.githubRaw, providerApkUrls.githubRawDirect, providerApkUrls.quarkTv, ...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.onedrive, providerApkUrls.onedriveDirect, providerApkUrls.githubDirect].filter(Boolean);
const preferredApkProvider = fallbackPreferredApkProvider;
const orderedProviderUrls = fallbackProviderUrls;

const manifest = {
  latest: {
    versionCode: releaseInfo.versionCode,
    versionName: releaseInfo.versionName,
    apkSha256,
    apkSize,
    releaseChannel: releaseInfo.releaseChannel,
    websiteUrl: releaseInfo.websiteUrl,
    githubRepoUrl: releaseInfo.githubRepoUrl,
    releaseNotesUrl: releaseInfo.releaseNotesUrl,
    apkUrl: `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(currentVersionedFileName)}`,
    latestApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    directApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    preferredApkProvider,
    r2ApkUrl: '',
    hi168ApkUrl: '',
     b2ApkUrl: '',
     fullstackApkUrl: providerApkUrls.fullstack,
     vpsApkUrl: providerApkUrls.vps,
     quarkTvApkUrl: providerApkUrls.quarkTv,
     oneDriveApkUrl: providerApkUrls.onedrive,
    oneDriveDirectApkUrl: providerApkUrls.onedriveDirect,
    githubApkUrl: providerApkUrls.github,
    githubDirectApkUrl: providerApkUrls.githubDirect,
    githubAcceleratedApkUrls,
    githubRawApkUrl: providerApkUrls.githubRaw,
    githubRawDirectApkUrl: providerApkUrls.githubRawDirect,
    githubRawAcceleratedApkUrl,
    r2DirectApkUrl: '',
    hi168DirectApkUrl: '',
    b2DirectApkUrl: '',
    apkUrls: [
      ...orderedProviderUrls,
      `${websiteBaseUrl}/api/apk/latest.apk`
    ].filter(Boolean),
    manifestUrl: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.json` : '',
    publishedAt: releaseInfo.releasePublishedAt || new Date().toISOString(),
    changes: Array.isArray(releaseInfo.releaseNotes) ? releaseInfo.releaseNotes : []
  },
  history: Array.isArray(releaseInfo.releaseHistory) ? releaseInfo.releaseHistory : []
};

const uploadBytes = async ({ key, bytes, contentType, cacheControl }) => {
  const target = path.join(os.tmpdir(), `moranjianghu-b2-upload-${Date.now()}-${path.basename(key)}`);
  fs.writeFileSync(target, bytes);
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const result = spawnSync(curl, [
    '--fail',
    '--silent',
    '--show-error',
    '--location',
    '--retry', '4',
    '--retry-delay', '2',
    '--max-time', String(Math.ceil(timeoutMs / 1000)),
    '-X', 'PUT',
    '-H', `Authorization: Bearer ${token}`,
    '-H', `Content-Type: ${contentType}`,
    '-H', `Cache-Control: ${cacheControl}`,
    '--data-binary', `@${target}`,
    b2ObjectUrl(key)
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: timeoutMs + 30 * 1000
  });
  fs.rmSync(target, { force: true });
  if (result.status !== 0) {
    const distributionError = (result.stderr || result.stdout || '').slice(0, 500);
    console.warn(`[B2] distribution upload failed for ${key}, trying native B2 API fallback: ${distributionError}`);
    await uploadBytesToNativeB2({ key, bytes, contentType, cacheControl });
  }
};

const downloadHistoryApk = async (versionName) => {
  const fileName = versionedFileName(versionName);

  // 1) Try B2 first (may already have this version)
  const b2Key = b2VersionedKey(versionName);
  const b2Url = b2ObjectUrl(b2Key);
  console.log(`[B2] checking existing B2 object for history ${versionName}: ${b2Key}`);
  const b2Check = await fetch(b2Url, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (b2Check?.ok) {
    console.log(`[B2] downloading history ${versionName} from B2...`);
    const target = path.join(os.tmpdir(), `moranjianghu-b2-migrate-${versionName}-${Date.now()}.apk`);
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const result = spawnSync(curl, [
      '--fail', '--silent', '--show-error', '--location',
      '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '--output', target,
      b2Url
    ], { cwd: rootDir, encoding: 'utf8', timeout: timeoutMs + 30 * 1000 });
    if (result.status === 0) {
      try {
        const bytes = fs.readFileSync(target);
        if (bytes.byteLength > 0) return bytes;
      } finally {
        fs.rmSync(target, { force: true });
      }
    }
    fs.rmSync(target, { force: true });
  }

  // 2) Try GitHub Release
  const ghUrl = `https://github.com/${owner}/${repo}/releases/download/v${versionName}/${fileName}`;
  console.log(`[B2] trying GitHub Release for history ${versionName}...`);
  const ghTarget = path.join(os.tmpdir(), `moranjianghu-gh-history-${versionName}-${Date.now()}.apk`);
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const ghResult = spawnSync(curl, [
    '--fail', '--silent', '--show-error', '--location',
    '--max-time', String(Math.ceil(timeoutMs / 1000)),
    '--output', ghTarget,
    ghUrl
  ], { cwd: rootDir, encoding: 'utf8', timeout: timeoutMs + 30 * 1000 });
  if (ghResult.status === 0) {
    try {
      const bytes = fs.readFileSync(ghTarget);
      if (bytes.byteLength > 0) return bytes;
    } finally {
      fs.rmSync(ghTarget, { force: true });
    }
  }
  fs.rmSync(ghTarget, { force: true });

  // 3) Try legacy hi168 S3 (may be decommissioned)
  if (s3Bucket && s3AccessKey && s3SecretKey) {
    console.log(`[B2] trying legacy hi168 S3 for history ${versionName}...`);
    const key = hi168VersionedKey(versionName);
    const signedUrl = buildSignedS3Url(key, 'GET', 1800);
    const s3Target = path.join(os.tmpdir(), `moranjianghu-b2-migrate-${versionName}-${Date.now()}.apk`);
    const s3Result = spawnSync(curl, [
      '--fail', '--silent', '--show-error', '--location',
      '--retry', '4', '--retry-delay', '2', '--continue-at', '-',
      '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '--output', s3Target,
      signedUrl
    ], { cwd: rootDir, encoding: 'utf8', timeout: timeoutMs + 30 * 1000 });
    if (s3Result.status === 0) {
      try {
        const bytes = fs.readFileSync(s3Target);
        if (bytes.byteLength > 0) return bytes;
      } finally {
        fs.rmSync(s3Target, { force: true });
      }
    }
    fs.rmSync(s3Target, { force: true });
  }

  throw new Error(`History APK ${versionName} not available from B2, GitHub, or hi168.`);
};

const listB2Files = async () => {
  const response = await request(`${baseUrl}/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const payload = await response.json();
  return Array.isArray(payload?.files) ? payload.files : [];
};

const deleteB2Object = async (key) => {
  await request(b2ObjectUrl(key), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

const uploadedVersions = [];
for (const item of versionsToPublish) {
  const key = b2VersionedKey(item.versionName);
if (skipB2ApkUpload) {
  console.log(`[B2] skipped APK upload for ${key} because B2 release distribution is decommissioned`);
  } else if (item.versionName === currentVersionName) {
    await uploadBytes({
      key,
      bytes: currentApkBuffer,
      contentType: 'application/vnd.android.package-archive',
      cacheControl: 'public,max-age=31536000,immutable'
    });
    uploadedVersions.push({ versionName: item.versionName, key, size: currentApkBuffer.byteLength });
    console.log(`[B2] uploaded ${key} (${currentApkBuffer.byteLength} bytes)`);
  } else {
    try {
      const bytes = await downloadHistoryApk(item.versionName);
      await uploadBytes({
        key,
        bytes,
        contentType: 'application/vnd.android.package-archive',
        cacheControl: 'public,max-age=31536000,immutable'
      });
      uploadedVersions.push({ versionName: item.versionName, key, size: bytes.byteLength });
      console.log(`[B2] uploaded ${key} (${bytes.byteLength} bytes)`);
    } catch (err) {
      console.warn(`[B2] ⚠ skipped history ${item.versionName}: ${err?.message || err}`);
    }
  }
}

if (skipB2ApkUpload) {
  console.log(`[B2] skipped latest APK upload for ${b2LatestApkKey} because B2 release distribution is decommissioned`);
} else {
  await uploadBytes({
    key: b2LatestApkKey,
    bytes: currentApkBuffer,
    contentType: 'application/vnd.android.package-archive',
    cacheControl: 'no-store,no-cache,max-age=0,must-revalidate'
  });
}
if (skipB2ApkUpload) {
  console.log(`[B2] skipped manifest upload for ${b2ManifestKey} because B2 release distribution is decommissioned`);
} else {
  await uploadBytes({
    key: b2ManifestKey,
    bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'no-store,no-cache,max-age=0,must-revalidate'
  });
}

// Sync manifest to Cloudflare KV (primary source for Worker reads).
const kvManifestPath = path.join(os.tmpdir(), `moranjianghu-kv-manifest-${Date.now()}.json`);
try {
  fs.writeFileSync(kvManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  // 直接用 node 运行仓库内 wrangler：本机上 `cmd.exe /c npx wrangler` 存在解析/ PATH 问题，
  // 曾导致 KV 清单静默写失败（2026-08-16 v1.0.650 发布时两次复现）。
  const wranglerEntry = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const wranglerArgs = [
    wranglerEntry,
    'kv', 'key', 'put',
    'release-manifest/latest.json',
    '--binding=RELEASE_MANIFEST',
    `--path=${kvManifestPath}`,
    '--remote',
    '--config', 'wrangler.152.jsonc'
  ];
  const kvResult = spawnSync(
    process.execPath,
    wranglerArgs,
    {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 120000,
      // 显式透传凭据：不继承依赖调用者的 shell 环境，避免静默失败（见 loadDevVars 注释）。
      env: {
        ...process.env,
        CLOUDFLARE_EMAIL: readEnv('CLOUDFLARE_EMAIL'),
        CLOUDFLARE_API_KEY: readEnv('CLOUDFLARE_API_KEY'),
        CLOUDFLARE_ACCOUNT_ID: readEnv('CLOUDFLARE_ACCOUNT_ID')
      }
    }
  );
  // 判定成功：退出码为 0，且输出里没有真正的失败标志。
  // 这里只匹配明确代表失败的字样，避免误伤 wrangler 的合法告警
  // （例如 durable_objects 无 migrations 的 [WARNING]、Processing configuration 等）。
  const kvOutput = `${kvResult.stderr || ''}\n${kvResult.stdout || ''}`;
  const kvFailureSignatures = [
    /Invalid access token/i,
    /\[code:\s*9109\]/i,
    /Authentication error/i,
    /You are not authenticated/i,
    /✘\s*\[ERROR\]/i,
    /\bERROR\b/,
    /Command failed/i,
    /ETIMEDOUT/
  ];
  const kvFailed = kvResult.status !== 0 || kvResult.error || kvFailureSignatures.some((re) => re.test(kvOutput));

  if (!kvFailed && /Writing the contents of/.test(kvOutput)) {
    console.log('[KV] manifest written to RELEASE_MANIFEST/release-manifest/latest.json');
  } else {
    // KV 是 Worker 读取清单的主源，写失败等于更新通道没生效，必须让发布失败而不是「假成功」。
    // 允许通过 MORAN_KV_WRITE_NON_FATAL=1 显式降级（仅用于确实不需要更新清单的场景）。
    const detail = (kvOutput.trim() || `status=${kvResult.status} error=${kvResult.error?.message || ''}`).slice(0, 800);
    if (process.env.MORAN_KV_WRITE_NON_FATAL === '1') {
      console.warn('[KV] manifest write failed (downgraded by MORAN_KV_WRITE_NON_FATAL=1):', detail);
    } else {
      throw new Error(`[KV] manifest write failed — 更新清单未生效，发布中止：\n${detail}`);
    }
  }
} finally {
  fs.rmSync(kvManifestPath, { force: true });
}

const keepKeys = new Set(uploadedVersions.map((item) => item.key));
const versionedKeyPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/MoRanJiangHu-v[^/]+\\.apk$`);
let deletedCount = 0;
if (skipB2ApkUpload) {
  console.log('[B2 cleanup] skipped because B2 release distribution is decommissioned');
} else if (process.env.MORAN_B2_SKIP_CLEANUP === '1') {
  console.log('[B2 cleanup] skipped because MORAN_B2_SKIP_CLEANUP=1');
} else {
  try {
    for (const file of await listB2Files()) {
      const key = typeof file?.key === 'string' ? file.key : '';
      if (!versionedKeyPattern.test(key) || keepKeys.has(key)) continue;
      await deleteB2Object(key);
      deletedCount += 1;
      console.log(`[B2 cleanup] deleted stale APK: ${key}`);
    }
  } catch (err) {
    console.warn(`[B2 cleanup] skipped because cleanup endpoint failed: ${err?.message || err}`);
  }
}

console.log(`Release manifest publish complete:
- latest APK URL: ${websiteBaseUrl}/api/apk/latest.apk
- latest manifest URL: ${websiteBaseUrl}/api/apk/latest.json
- preferredApkProvider=${preferredApkProvider}
- apkSha256=${apkSha256}
- apkSize=${apkSize}
- b2Distribution=decommissioned
- keptVersionedApks=${uploadedVersions.map((item) => item.versionName).join(', ')}
- staleVersionedApksDeleted=${deletedCount}`);
