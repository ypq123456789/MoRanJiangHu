import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { cleanTmpAfterRelease } from './clean-tmp.mjs';

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
  throw new Error(`APK not found: ${apkPath}`);
}

const readEnv = (name, fallback = '') => String(process.env[name] || fallback).trim();
const endpoint = readEnv('MORAN_OSS_ENDPOINT', 'https://s3.hi168.com').replace(/\/+$/, '');
const bucket = readEnv('MORAN_OSS_BUCKET');
const accessKey = readEnv('MORAN_OSS_ACCESS_KEY');
const secretKey = readEnv('MORAN_OSS_SECRET_KEY');
const prefix = readEnv('MORAN_OSS_RELEASE_PREFIX', releaseInfo.r2Prefix || 'moranjianghu').replace(/^\/+|\/+$/g, '');
const region = readEnv('MORAN_OSS_REGION', 'auto');
const usePublicReadAcl = readEnv('MORAN_OSS_PUBLIC_READ_ACL', '0') === '1';
const service = 's3';
const requestTimeoutMs = Math.max(1000, Number(process.env.MORAN_OSS_TIMEOUT_MS || 10 * 60 * 1000));
const multipartThresholdBytes = Math.max(5 * 1024 * 1024, Number(process.env.MORAN_OSS_MULTIPART_THRESHOLD_BYTES || 512 * 1024 * 1024));
const multipartPartBytes = Math.max(5 * 1024 * 1024, Number(process.env.MORAN_OSS_MULTIPART_PART_BYTES || 8 * 1024 * 1024));
const uploadLatestApk = readEnv('MORAN_OSS_UPLOAD_LATEST_APK', '0') === '1';
const skipApkUpload = readEnv('MORAN_OSS_SKIP_APK_UPLOAD', '0') === '1';

if (!bucket || !accessKey || !secretKey) {
  throw new Error('Missing MORAN_OSS_BUCKET, MORAN_OSS_ACCESS_KEY, or MORAN_OSS_SECRET_KEY.');
}

const normalizeKey = (key) => key.replace(/^\/+/, '').replace(/\/+/g, '/');
const encodeKey = (key) => normalizeKey(key)
  .split('/')
  .map((part) => encodeURIComponent(part))
  .join('/');
const objectUrl = (key) => new URL(`${endpoint}/${encodeURIComponent(bucket)}/${encodeKey(key)}`);
const publicUrl = (key) => objectUrl(key).toString();

const latestKey = normalizeKey(`${prefix}/latest.apk`);
const versionedKey = normalizeKey(`${prefix}/MoRanJiangHu-v${releaseInfo.versionName}.apk`);
const versionedFileName = path.basename(versionedKey);
const manifestKey = normalizeKey(`${prefix}/latest.json`);
const websiteBaseUrl = String(releaseInfo.websiteUrl || '').replace(/\/+$/, '');
const r2PublicBaseUrl = readEnv('MORAN_R2_PUBLIC_BASE_URL', `https://download.bacon.de5.net/${releaseInfo.r2Prefix || 'moranjianghu'}`).replace(/\/+$/, '');
const b2PublicBaseUrl = readEnv('MORAN_B2_DISTRIBUTION_BASE_URL', 'https://obs1.bacon159.pp.ua').replace(/\/+$/, '');
const requestedPreferredApkProvider = readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'hi168');
const preferredApkProvider = requestedPreferredApkProvider === 'b2' ? 'b2' : 'hi168';
const providerApkUrls = {
  r2: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=r2` : `${r2PublicBaseUrl}/${encodeURIComponent(versionedFileName)}`,
  hi168: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=hi168` : publicUrl(versionedKey),
  b2: websiteBaseUrl ? `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=b2` : `${b2PublicBaseUrl}/${encodeKey(`${prefix}/${versionedFileName}`)}`
};
const enabledProviderUrls = { hi168: providerApkUrls.hi168, b2: providerApkUrls.b2 };
const orderedProviderUrls = preferredApkProvider === 'b2'
  ? [enabledProviderUrls.b2, enabledProviderUrls.hi168].filter(Boolean)
  : [enabledProviderUrls.hi168, enabledProviderUrls.b2].filter(Boolean);
const apkBuffer = fs.readFileSync(apkPath);
const apkSha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');
const apkSize = apkBuffer.byteLength;

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
    apkUrl: `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}`,
    latestApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    directApkUrl: `${websiteBaseUrl}/api/apk/latest.apk`,
    preferredApkProvider,
    r2ApkUrl: '',
    hi168ApkUrl: providerApkUrls.hi168,
    b2ApkUrl: providerApkUrls.b2,
    r2DirectApkUrl: '',
    hi168DirectApkUrl: providerApkUrls.hi168,
    b2DirectApkUrl: `${b2PublicBaseUrl}/${encodeKey(`${prefix}/${versionedFileName}`)}`,
    apkUrls: [
      `${websiteBaseUrl}/api/apk/latest.apk`,
      `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}`,
      ...orderedProviderUrls
    ].filter(Boolean),
    manifestUrl: publicUrl(manifestKey),
    publishedAt: releaseInfo.releasePublishedAt || new Date().toISOString(),
    changes: Array.isArray(releaseInfo.releaseNotes) ? releaseInfo.releaseNotes : []
  },
  history: Array.isArray(releaseInfo.releaseHistory) ? releaseInfo.releaseHistory : []
};

const manifestPath = path.join(os.tmpdir(), `moranjianghu-release-s3-${Date.now()}.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const sha256Hex = (body) => crypto.createHash('sha256').update(body).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const hmacHex = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');
const formatAmzDate = (date) => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};
const signingKey = (dateStamp) => {
  const kDate = hmac(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const cacheControl = 'no-store,no-cache,max-age=0,must-revalidate';

const buildSignedHeaders = ({ method, url, body, contentType, includeAcl = usePublicReadAcl }) => {
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const bodyHash = sha256Hex(body);
  const query = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalHeaders = [
    `cache-control:${cacheControl}\n`,
    `content-type:${contentType}\n`,
    `host:${url.host}\n`,
    includeAcl ? 'x-amz-acl:public-read\n' : '',
    `x-amz-content-sha256:${bodyHash}\n`,
    `x-amz-date:${amzDate}\n`
  ].join('');
  const signedHeaders = includeAcl
    ? 'cache-control;content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date'
    : 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    url.pathname,
    query,
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = hmacHex(signingKey(dateStamp), stringToSign);

  return {
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    ...(includeAcl ? { 'x-amz-acl': 'public-read' } : {}),
    'X-Amz-Content-Sha256': bodyHash,
    'X-Amz-Date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
};

const requestWithBody = ({ method, url, headers, body }) => new Promise((resolve, reject) => {
  const transport = url.protocol === 'http:' ? http : https;
  const request = transport.request(url, {
    method,
    headers: {
      ...headers,
      'Content-Length': body.byteLength
    },
    timeout: requestTimeoutMs
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      resolve({
        status: response.statusCode || 0,
        ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
        headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8')
      });
    });
  });
  request.on('timeout', () => {
    request.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`));
  });
  request.on('error', reject);
  request.end(body);
});

const encodeXmlText = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const extractXmlTag = (xml, tag) => {
  const match = String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
};

const createMultipartUpload = async ({ key, contentType }) => {
  const url = objectUrl(key);
  url.searchParams.set('uploads', '');
  const body = Buffer.alloc(0);
  const response = await requestWithBody({
    method: 'POST',
    url,
    headers: buildSignedHeaders({ method: 'POST', url, body, contentType, includeAcl: usePublicReadAcl }),
    body
  });
  if (!response.ok) {
    throw new Error(`Create multipart upload ${key} failed (${response.status}): ${response.text.slice(0, 500)}`);
  }
  const uploadId = extractXmlTag(response.text, 'UploadId');
  if (!uploadId) {
    throw new Error(`Create multipart upload ${key} did not return UploadId: ${response.text.slice(0, 500)}`);
  }
  return uploadId;
};

const uploadMultipartPart = async ({ key, uploadId, partNumber, body }) => {
  const url = objectUrl(key);
  url.searchParams.set('partNumber', String(partNumber));
  url.searchParams.set('uploadId', uploadId);
  const response = await requestWithBody({
    method: 'PUT',
    url,
    headers: buildSignedHeaders({ method: 'PUT', url, body, contentType: 'application/octet-stream', includeAcl: false }),
    body
  });
  if (!response.ok) {
    throw new Error(`Upload multipart part ${key} #${partNumber} failed (${response.status}): ${response.text.slice(0, 500)}`);
  }
  const etag = String(response.headers?.etag || response.headers?.ETag || '').trim();
  if (!etag) {
    throw new Error(`Upload multipart part ${key} #${partNumber} did not return ETag.`);
  }
  return { PartNumber: partNumber, ETag: etag };
};

const completeMultipartUpload = async ({ key, uploadId, parts }) => {
  const url = objectUrl(key);
  url.searchParams.set('uploadId', uploadId);
  const body = Buffer.from([
    '<CompleteMultipartUpload>',
    ...parts
      .sort((a, b) => a.PartNumber - b.PartNumber)
      .map((part) => `<Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${encodeXmlText(part.ETag)}</ETag></Part>`),
    '</CompleteMultipartUpload>'
  ].join(''), 'utf8');
  const response = await requestWithBody({
    method: 'POST',
    url,
    headers: buildSignedHeaders({ method: 'POST', url, body, contentType: 'application/xml', includeAcl: false }),
    body
  });
  if (!response.ok) {
    throw new Error(`Complete multipart upload ${key} failed (${response.status}): ${response.text.slice(0, 500)}`);
  }
};

const abortMultipartUpload = async ({ key, uploadId }) => {
  const url = objectUrl(key);
  url.searchParams.set('uploadId', uploadId);
  const body = Buffer.alloc(0);
  await requestWithBody({
    method: 'DELETE',
    url,
    headers: buildSignedHeaders({ method: 'DELETE', url, body, contentType: 'application/octet-stream', includeAcl: false }),
    body
  }).catch(() => null);
};

const putObjectMultipart = async ({ key, bytes, contentType }) => {
  const uploadId = await createMultipartUpload({ key, contentType });
  const parts = [];
  try {
    for (let offset = 0, partNumber = 1; offset < bytes.byteLength; offset += multipartPartBytes, partNumber += 1) {
      const end = Math.min(bytes.byteLength, offset + multipartPartBytes);
      const partBody = bytes.subarray(offset, end);
      parts.push(await uploadMultipartPart({ key, uploadId, partNumber, body: partBody }));
      console.log(`[S3 multipart] ${key} part ${partNumber} uploaded (${end}/${bytes.byteLength})`);
    }
    await completeMultipartUpload({ key, uploadId, parts });
  } catch (error) {
    await abortMultipartUpload({ key, uploadId });
    throw error;
  }
};

const putObject = async ({ key, filePath, body, contentType }) => {
  const bytes = body || fs.readFileSync(filePath);
  if (bytes.byteLength >= multipartThresholdBytes) {
    await putObjectMultipart({ key, bytes, contentType });
    return;
  }
  const url = objectUrl(key);
  const response = await requestWithBody({
    method: 'PUT',
    url,
    headers: buildSignedHeaders({ method: 'PUT', url, body: bytes, contentType, includeAcl: usePublicReadAcl }),
    body: bytes
  });
  if (!response.ok) {
    throw new Error(`PUT ${key} failed (${response.status}): ${response.text.slice(0, 500)}`);
  }
};

if (skipApkUpload) {
  console.log(`[S3] APK upload skipped by MORAN_OSS_SKIP_APK_UPLOAD=1: ${versionedKey}`);
} else {
  await putObject({
    key: versionedKey,
    filePath: apkPath,
    contentType: 'application/vnd.android.package-archive'
  });
  if (uploadLatestApk) {
    await putObject({
      key: latestKey,
      filePath: apkPath,
      contentType: 'application/vnd.android.package-archive'
    });
  }
}
await putObject({
  key: manifestKey,
  filePath: manifestPath,
  contentType: 'application/json'
});

console.log(`S3 publish complete:
- ${publicUrl(manifestKey)}
- ${publicUrl(versionedKey)}
- latest.apk object upload=${uploadLatestApk ? 'enabled' : 'skipped; website latest endpoint redirects to the versioned APK'}
- apkSha256=${apkSha256}
- apkSize=${apkSize}`);

// 收尾清理临时产物（保留最近 1 天，绝不抛错影响发布结果）
cleanTmpAfterRelease();
