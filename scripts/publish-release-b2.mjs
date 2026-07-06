import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildB2PublicReleaseTargets } from './release-b2-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
const b2CdnBaseUrl = readEnv('MORAN_B2_CDN_BASE_URL', releaseInfo.b2CdnBaseUrl || 'https://cdn.bacon159.pp.ua').replace(/\/+$/, '');
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

const skipB2ApkUpload = process.env.MORAN_B2_SKIP_APK_UPLOAD === '1';

if (!token && !skipB2ApkUpload) {
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
const websiteBaseUrl = String(releaseInfo.websiteUrl || '').replace(/\/+$/, '');
const githubReleaseAccelerators = readEnv('GITHUB_RELEASE_ACCELERATORS', 'https://gh.ddlc.top,https://gh.llkk.cc,https://gh-proxy.com,https://gh-proxy.ygxz.in,https://ghfast.top')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter((item) => /^https:\/\/[^/]+$/i.test(item));

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
const currentB2Targets = buildB2PublicReleaseTargets({
  baseUrl: b2CdnBaseUrl,
  prefix,
  versionName: currentVersionName
});
const b2PublicApkRoot = currentB2Targets.publicApkRoot;
const b2VersionedKey = (versionName) => buildB2PublicReleaseTargets({
  baseUrl: b2CdnBaseUrl,
  prefix,
  versionName
}).versionedKey;
const b2VersionedUrl = (versionName) => buildB2PublicReleaseTargets({
  baseUrl: b2CdnBaseUrl,
  prefix,
  versionName
}).versionedUrl;
const b2LatestApkKey = currentB2Targets.latestApkKey;
const b2ManifestKey = currentB2Targets.manifestKey;
const hi168VersionedKey = (versionName) => normalizeKey(`${s3Prefix}/${versionedFileName(versionName)}`);

const providerApkUrls = {
  b2: currentB2Targets.versionedUrl,
  onedrive: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive` : '',
  onedriveDirect: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive-direct` : '',
  github: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(currentVersionedFileName)}?provider=github` : '',
  githubDirect: `https://github.com/ypq123456789/MoRanJiangHu/releases/download/v${currentVersionName}/${currentVersionedFileName}`
};
const githubAcceleratedApkUrls = githubReleaseAccelerators.map((baseUrl) => `${baseUrl}/${providerApkUrls.githubDirect}`);
const requestedPreferredApkProvider = readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'github');
const preferredApkProvider = ['onedrive', 'onedrive-direct', 'github', 'b2'].includes(requestedPreferredApkProvider)
  ? requestedPreferredApkProvider
  : 'github';
const stableApkUrl = preferredApkProvider === 'onedrive'
  ? providerApkUrls.onedrive
  : preferredApkProvider === 'onedrive-direct'
    ? providerApkUrls.onedriveDirect
    : githubAcceleratedApkUrls[0] || providerApkUrls.github || providerApkUrls.githubDirect;
const orderedProviderUrls = preferredApkProvider === 'github'
  ? [...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.githubDirect, providerApkUrls.onedrive, providerApkUrls.onedriveDirect].filter(Boolean)
  : preferredApkProvider === 'onedrive-direct'
    ? [providerApkUrls.onedriveDirect, providerApkUrls.onedrive, ...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.githubDirect].filter(Boolean)
    : [providerApkUrls.onedrive, providerApkUrls.onedriveDirect, ...githubAcceleratedApkUrls, providerApkUrls.github, providerApkUrls.githubDirect].filter(Boolean);

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
    apkUrl: stableApkUrl,
    latestApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    directApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    preferredApkProvider,
    r2ApkUrl: '',
    hi168ApkUrl: '',
    b2ApkUrl: '',
    oneDriveApkUrl: providerApkUrls.onedrive,
    oneDriveDirectApkUrl: providerApkUrls.onedriveDirect,
    githubApkUrl: providerApkUrls.github,
    githubDirectApkUrl: providerApkUrls.githubDirect,
    githubAcceleratedApkUrls,
    r2DirectApkUrl: '',
    hi168DirectApkUrl: '',
    b2DirectApkUrl: '',
    apkUrls: [
      ...orderedProviderUrls
    ].filter(Boolean),
    manifestUrl: currentB2Targets.manifestUrl,
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
  const b2Url = b2VersionedUrl(versionName);
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
    console.log(`[B2] skipped APK upload for ${key} because MORAN_B2_SKIP_APK_UPLOAD=1`);
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
  console.log(`[B2] skipped latest APK upload for ${b2LatestApkKey} because MORAN_B2_SKIP_APK_UPLOAD=1`);
} else {
  await uploadBytes({
    key: b2LatestApkKey,
    bytes: currentApkBuffer,
    contentType: 'application/vnd.android.package-archive',
    cacheControl: 'no-store,no-cache,max-age=0,must-revalidate'
  });
}
if (skipB2ApkUpload) {
  console.log(`[B2] skipped manifest upload for ${b2ManifestKey} because MORAN_B2_SKIP_APK_UPLOAD=1`);
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
  const wranglerCommand = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const wranglerArgs = [
    'wrangler', 'kv', 'key', 'put',
    'release-manifest/latest.json',
    '--binding=RELEASE_MANIFEST',
    `--path=${kvManifestPath}`,
    '--remote'
  ];
  const kvResult = spawnSync(
    wranglerCommand,
    process.platform === 'win32' ? ['/c', 'npx', ...wranglerArgs] : wranglerArgs,
    { cwd: rootDir, encoding: 'utf8', timeout: 60000 }
  );
  if (kvResult.status === 0) {
    console.log('[KV] manifest written to RELEASE_MANIFEST/release-manifest/latest.json');
  } else {
    console.warn('[KV] manifest write failed (non-fatal):', (kvResult.stderr || kvResult.stdout || '').slice(0, 300));
  }
} finally {
  fs.rmSync(kvManifestPath, { force: true });
}

const keepKeys = new Set(uploadedVersions.map((item) => item.key));
const versionedKeyPattern = new RegExp(`^${b2PublicApkRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/MoRanJiangHu-v[^/]+\\.apk$`);
let deletedCount = 0;
if (skipB2ApkUpload) {
  console.log('[B2 cleanup] skipped because MORAN_B2_SKIP_APK_UPLOAD=1');
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

console.log(`B2 publish complete:
- latest APK URL: ${currentB2Targets.latestApkUrl}
- latest manifest URL: ${currentB2Targets.manifestUrl}
- preferredApkProvider=${preferredApkProvider}
- apkSha256=${apkSha256}
- apkSize=${apkSize}
- keptVersionedApks=${uploadedVersions.map((item) => item.versionName).join(', ')}
- staleVersionedApksDeleted=${deletedCount}`);
