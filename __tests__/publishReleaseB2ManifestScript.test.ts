import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildB2PublicReleaseTargets } from '../scripts/release-b2-manifest.mjs';

const scriptPath = path.join(process.cwd(), 'scripts', 'publish-release-b2.mjs');

describe('B2 release publish manifest script', () => {
    it('builds CDN-facing public targets under public/<prefix>/apk', () => {
        const targets = buildB2PublicReleaseTargets({
            baseUrl: 'https://cdn.bacon159.pp.ua',
            prefix: 'moranjianghu',
            versionName: '1.0.570'
        });

        expect(targets.publicApkRoot).toBe('public/moranjianghu/apk');
        expect(targets.versionedKey).toBe('public/moranjianghu/apk/MoRanJiangHu-v1.0.570.apk');
        expect(targets.latestApkKey).toBe('public/moranjianghu/apk/latest.apk');
        expect(targets.manifestKey).toBe('public/moranjianghu/apk/latest.json');
        expect(targets.versionedUrl).toBe('https://cdn.bacon159.pp.ua/public/moranjianghu/apk/MoRanJiangHu-v1.0.570.apk');
        expect(targets.latestApkUrl).toBe('https://cdn.bacon159.pp.ua/public/moranjianghu/apk/latest.apk');
        expect(targets.manifestUrl).toBe('https://cdn.bacon159.pp.ua/public/moranjianghu/apk/latest.json');
    });

    it('keeps the publish script wired to the public target helper and b2 default provider', () => {
        const source = readFileSync(scriptPath, 'utf8');

        expect(source).toContain("readEnv('MORAN_RELEASE_PREFERRED_APK_PROVIDER', 'b2')");
        expect(source).toContain("readEnv('MORAN_B2_CDN_BASE_URL', releaseInfo.b2CdnBaseUrl || 'https://cdn.bacon159.pp.ua')");
        expect(source).toContain("import { buildB2PublicReleaseTargets } from './release-b2-manifest.mjs';");
        expect(source).toContain('const currentB2Targets = buildB2PublicReleaseTargets({');
        expect(source).toContain('b2: currentB2Targets.versionedUrl');
        expect(source).toContain('trying native B2 API fallback');
        expect(source).toContain('b2_get_upload_url');
    });
});
