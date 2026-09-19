import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releaseInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8'));
const websiteBaseUrl = String(process.env.MORAN_RELEASE_BENCHMARK_BASE_URL || releaseInfo.websiteUrl || '').replace(/\/+$/, '');
const versionedFileName = `MoRanJiangHu-v${releaseInfo.versionName}.apk`;
const githubDirectUrl = `https://github.com/ypq123456789/MoRanJiangHu/releases/download/v${releaseInfo.versionName}/${versionedFileName}`;
const githubRawRepo = String(process.env.MORAN_GITHUB_RAW_REPO || 'ypq123456789/MoRanJiangHu').trim();
const githubRawBranch = String(process.env.MORAN_GITHUB_RAW_BRANCH || 'apk-dist').trim();
const githubRawUrl = `https://raw.githubusercontent.com/${githubRawRepo}/${githubRawBranch}/releases/${versionedFileName}`;
const vpsBaseUrl = String(process.env.MORAN_VPS_APK_BASE_URL || 'https://moranjianghu.bacon159.pp.ua').replace(/\/+$/, '');
const outputDir = path.join(rootDir, 'output');
fs.mkdirSync(outputDir, { recursive: true });

if (!websiteBaseUrl) {
  throw new Error('Missing website URL for APK provider benchmark.');
}

const providers = [
  // fullstack（全栈云盘）已于 2026-09-19 下线：该 WebDAV 挂载写入上限 < 3MB，
  // 5.88MB 的 APK 结构性传不上去，benchmark 它只会得到一个稳定的 410。
  {
    provider: 'vps',
    label: 'VPS 直连',
    url: `${vpsBaseUrl}/latest.apk`
  },
  {
    provider: 'quark-tv',
    label: '夸克 TV',
    url: `${websiteBaseUrl}/api/apk/latest.apk?provider=quark-tv`
  },
  {
    provider: 'github-proxy',
    label: 'GitHub (Worker 代理)',
    url: `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=github`
  },
  {
    provider: 'github-direct',
    label: 'GitHub (直连)',
    url: githubDirectUrl
  },
  {
    provider: 'github-raw',
    label: 'GitHub Raw',
    url: githubRawUrl
  },
  {
    provider: 'github-raw-cf',
    label: 'GitHub Raw (CF 加速)',
    url: `https://ghfast.top/${githubRawUrl}`
  },
  ...['https://gh.ddlc.top', 'https://gh-proxy.com', 'https://gh-proxy.ygxz.in', 'https://ghfast.top'].map((baseUrl) => ({
    provider: `github-accelerator-${new URL(baseUrl).hostname}`,
    label: `GitHub 加速 (${new URL(baseUrl).hostname})`,
    url: `${baseUrl}/${githubDirectUrl}`
  })),
  {
    provider: 'onedrive',
    label: 'OneDrive (OpenList 代理)',
    url: `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive`
  },
  {
    provider: 'onedrive-direct',
    label: 'OneDrive (OpenList 直连)',
    url: `${websiteBaseUrl}/api/apk/latest.apk?provider=onedrive-direct`
  }
];

const timeoutMs = Math.max(1000, Number(process.env.MORAN_APK_PROVIDER_BENCHMARK_TIMEOUT_MS || 120000));
const expectedSize = Number(process.env.MORAN_APK_PROVIDER_BENCHMARK_EXPECTED_SIZE || 0);
const expectedSha256 = String(process.env.MORAN_APK_PROVIDER_BENCHMARK_EXPECTED_SHA256 || '').trim().toLowerCase();

const download = async ({ provider, label, url }) => {
  const target = path.join(outputDir, `apk-provider-benchmark-${provider}.apk`);
  try {
    fs.rmSync(target, { force: true });
  } catch {}
  const started = performance.now();
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`${label} download failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const elapsedMs = performance.now() - started;
  const bytes = Buffer.from(arrayBuffer);
  fs.writeFileSync(target, bytes);
  if (expectedSize > 0 && bytes.byteLength !== expectedSize) {
    throw new Error(`${label} size mismatch: got ${bytes.byteLength}, expected ${expectedSize}`);
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 mismatch: got ${sha256}, expected ${expectedSha256}`);
  }
  return {
    provider,
    label,
    url,
    bytes: bytes.byteLength,
    elapsedMs: Math.round(elapsedMs),
    mbps: Number(((bytes.byteLength * 8) / 1024 / 1024 / (elapsedMs / 1000)).toFixed(2)),
    sha256,
    output: target
  };
};

const results = [];
for (const provider of providers) {
  try {
    results.push(await download(provider));
  } catch (error) {
    results.push({
      provider: provider.provider,
      label: provider.label,
      url: provider.url,
      error: error?.message || String(error)
    });
  }
}

const successful = results
  .filter((item) => !item.error)
  .sort((a, b) => b.mbps - a.mbps);
const preferredApkProvider = successful[0]?.provider || 'quark-tv';

// ── 格式化输出表格 ──
const labelWidth = Math.max(...providers.map(p => p.label.length), 10);
const sizeWidth = 12;
const timeWidth = 10;
const speedWidth = 12;

const formatRow = (label, size, time, speed) => {
  return `  ${label.padEnd(labelWidth)} | ${size.padStart(sizeWidth)} | ${time.padStart(timeWidth)} | ${speed.padStart(speedWidth)}`;
};

console.log('\n┌─ APK Download Speed Benchmark ──────────────────────────────────────┐');
console.log(formatRow('Provider', 'Size', 'Time', 'Speed'));
console.log('  ' + '─'.repeat(labelWidth) + '-+-' + '─'.repeat(sizeWidth) + '-+-' + '─'.repeat(timeWidth) + '-+-' + '─'.repeat(speedWidth));

for (const r of results) {
  if (r.error) {
    console.log(formatRow(r.label, '—', 'FAILED', '—'));
    console.log(`    Error: ${r.error}`);
  } else {
    const sizeStr = r.bytes >= 1024 * 1024 ? `${(r.bytes / 1024 / 1024).toFixed(1)} MB` : `${(r.bytes / 1024).toFixed(0)} KB`;
    const timeStr = `${r.elapsedMs} ms`;
    const speedStr = `${r.mbps} Mbps`;
    console.log(formatRow(r.label, sizeStr, timeStr, speedStr));
  }
}
console.log('└──────────────────────────────────────────────────────────────────────┘');

const report = {
  versionName: releaseInfo.versionName,
  versionCode: releaseInfo.versionCode,
  benchmarkedAt: new Date().toISOString(),
  preferredApkProvider,
  results
};

const reportPath = path.join(outputDir, `apk-provider-benchmark-v${releaseInfo.versionName}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nPreferred APK provider: ${preferredApkProvider}`);
console.log(`Report: ${reportPath}`);
