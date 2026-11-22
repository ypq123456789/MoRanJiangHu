import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'scripts', 'publish-release-b2.mjs');

describe('release publish manifest script', () => {
    it('verifies the preferred provider before publishing a github-first manifest (VPS 已失联，默认改 github)', () => {
        const source = readFileSync(scriptPath, 'utf8');

        expect(source).not.toContain("readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'hi168')");
        expect(source).not.toContain("readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'vps')");
        expect(source).toContain("readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'github')");
        expect(source).toContain("MORAN_VPS_APK_BASE_URL || 'https://moranjianghu.bacon159.pp.ua'");
        expect(source).toContain('vpsUrl: providerApkUrls.vps');
        expect(source).toContain('vpsApkUrl: providerApkUrls.vps');
        expect(source).toContain("targetRoot: '/Onedrive/MoRanJiangHu/releases'");
        expect(source).toContain("downloadRoot: '/Onedrive/MoRanJiangHu/releases'");
        expect(source).toContain('uploadApkFileToOpenListWithCurl({');
        expect(source).toContain('providerApkUrls.quarkTv');
        expect(source).toContain("import { resolvePreferredApkProvider } from './apk-provider-selection.mjs'");
        expect(source).toContain('await resolvePreferredApkProvider({');
        expect(source).toContain('githubRawUrl: githubRawAcceleratedApkUrl || providerApkUrls.githubRawDirect');
        expect(source).toContain("readEnv('MORAN_APK_PROVIDER_VERIFY_TIMEOUT_MS', '120000')");
        expect(source).toContain('githubRawAcceleratedApkUrl');
        expect(source).toContain('githubRawDirectApkUrl: providerApkUrls.githubRawDirect');
        expect(source).toContain('providerApkUrls.onedrive');
        expect(source).toContain('providerApkUrls.onedriveDirect');
        expect(source).not.toContain('providerApkUrls.b2');
        expect(source).toContain('githubDirectApkUrl: providerApkUrls.githubDirect');
        expect(source).toContain('oneDriveDirectApkUrl: providerApkUrls.onedriveDirect');
        expect(source).toContain('...githubAcceleratedApkUrls');
        expect(source).not.toContain('...orderedProviderUrls,\n      providerApkUrls.github');
        expect(source).toContain("readEnv('GITHUB_RELEASE_ACCELERATORS', 'https://ghproxy.net,https://gh.ddlc.top,https://ghfast.top')");
        expect(source).toContain('B2 release distribution is decommissioned');
        expect(source).toContain("process.env.MORAN_B2_SKIP_APK_UPLOAD !== '0'");
    });
});
