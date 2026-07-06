import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releaseInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'release.config.json'), 'utf8'));
const websiteBaseUrl = String(process.env.MORAN_RELEASE_BENCHMARK_BASE_URL || releaseInfo.websiteUrl || '').replace(/\/+$/, '');
const versionedFileName = `MoRanJiangHu-v${releaseInfo.versionName}.apk`;
const githubDirectUrl = `https://github.com/ypq123456789/MoRanJiangHu/releases/download/v${releaseInfo.versionName}/${versionedFileName}`;
const outputDir = path.join(rootDir, 'output');
fs.mkdirSync(outputDir, { recursive: true });

if (process.argv.includes('--no-proxy')) {
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    delete process.env[name];
  }
  process.env.NO_PROXY = '*';
  process.env.no_proxy = '*';
}

if (!websiteBaseUrl) {
  throw new Error('Missing website URL for APK provider benchmark.');
}

const githubReleaseAccelerators = String(
  process.env.GITHUB_RELEASE_ACCELERATORS
  || 'https://gh.ddlc.top,https://gh.llkk.cc,https://gh-proxy.com,https://gh-proxy.ygxz.in,https://ghfast.top'
)
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter((item) => /^https:\/\/[^/]+$/i.test(item));

const providers = [
  {
    provider: 'github-proxy',
    label: 'GitHub (Worker 代理)',
    url: `${websiteBaseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=github`
  },
  ...githubReleaseAccelerators.map((baseUrl, index) => ({
    provider: `github-accelerator-${index + 1}`,
    label: `GitHub 加速 ${index + 1} (${new URL(baseUrl).hostname})`,
    url: `${baseUrl}/${githubDirectUrl}`
  })),
  {
    provider: 'github-direct',
    label: 'GitHub (直连)',
    url: githubDirectUrl
  },
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
  return {
    provider,
    label,
    url,
    bytes: bytes.byteLength,
    elapsedMs: Math.round(elapsedMs),
    mbps: Number(((bytes.byteLength * 8) / 1024 / 1024 / (elapsedMs / 1000)).toFixed(2)),
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
const preferredApkProvider = successful[0]?.provider || 'github';

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
  noProxy: process.argv.includes('--no-proxy'),
  preferredApkProvider,
  fastestFallbacks: successful.slice(0, 5),
  results
};

const reportPath = path.join(outputDir, `apk-provider-benchmark-v${releaseInfo.versionName}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nPreferred APK provider: ${preferredApkProvider}`);
console.log(`Report: ${reportPath}`);
