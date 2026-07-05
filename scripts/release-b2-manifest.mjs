const normalizeKey = (key) => String(key || '').replace(/^\/+/, '').replace(/\/+/g, '/');
const encodeKey = (key) => normalizeKey(key).split('/').map((part) => encodeURIComponent(part)).join('/');
const safeVersionName = (value) => String(value || '').trim().replace(/[^0-9A-Za-z._-]/g, '');

export const buildVersionedApkFileName = (versionName) => `MoRanJiangHu-v${safeVersionName(versionName)}.apk`;

export const buildB2PublicReleaseTargets = ({ baseUrl, prefix, versionName }) => {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPrefix = String(prefix || 'moranjianghu').replace(/^\/+|\/+$/g, '') || 'moranjianghu';
  const publicApkRoot = normalizeKey(`public/${normalizedPrefix}/apk`);
  const versionedKey = normalizeKey(`${publicApkRoot}/${buildVersionedApkFileName(versionName)}`);
  const latestApkKey = normalizeKey(`${publicApkRoot}/latest.apk`);
  const manifestKey = normalizeKey(`${publicApkRoot}/latest.json`);

  return {
    publicApkRoot,
    versionedKey,
    latestApkKey,
    manifestKey,
    versionedUrl: `${normalizedBaseUrl}/${encodeKey(versionedKey)}`,
    latestApkUrl: `${normalizedBaseUrl}/${encodeKey(latestApkKey)}`,
    manifestUrl: `${normalizedBaseUrl}/${encodeKey(manifestKey)}`
  };
};
