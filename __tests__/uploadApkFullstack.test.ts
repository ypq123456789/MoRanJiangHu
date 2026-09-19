import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildFullstackUploadTargets } from '../scripts/upload-apk-fullstack.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('Fullstack cloud APK upload targets', () => {
    it('separates latest and versioned APK paths', () => {
        expect(buildFullstackUploadTargets('1.0.633')).toEqual([
            {
                filePath: '/全栈云盘/MoRanJiangHu/releases/latest.apk',
                cacheControl: 'public, max-age=3600, stale-while-revalidate=86400'
            },
            {
                filePath: '/全栈云盘/MoRanJiangHu/releases/MoRanJiangHu-v1.0.633.apk',
                cacheControl: 'public, max-age=86400, stale-while-revalidate=604800'
            }
        ]);
    });

    it('rejects unsafe version names', () => {
        expect(() => buildFullstackUploadTargets('../bad')).toThrow('Invalid release versionName');
    });

    it('keeps Fullstack tooling available but fully de-listed after the 413 limit', () => {
        const publishSource = fs.readFileSync(path.resolve(testDir, '../scripts/publish-release-b2.mjs'), 'utf8');
        const benchmarkSource = fs.readFileSync(path.resolve(testDir, '../scripts/benchmark-apk-providers.mjs'), 'utf8');
        const routerSource = fs.readFileSync(path.resolve(testDir, '../functions/api/apk/_providerRouter.ts'), 'utf8');
        const latestApkSource = fs.readFileSync(path.resolve(testDir, '../functions/api/apk/latest.apk.ts'), 'utf8');
        const packageJson = JSON.parse(fs.readFileSync(path.resolve(testDir, '../package.json'), 'utf8'));

        expect(publishSource).not.toContain("import { uploadApkToFullstack } from './upload-apk-fullstack.mjs'");
        expect(publishSource).toContain("fullstack: ''");
        expect(publishSource).not.toContain("preferredApkProvider = 'fullstack'");
        expect(publishSource).not.toContain('115open');
        // 2026-09-19 正式下线：不再进路由候选链，也不再进 benchmark
        expect(benchmarkSource).not.toContain("provider: 'fullstack'");
        expect(routerSource).not.toContain("'fullstack'");
        expect(routerSource).not.toContain('buildFullstackApkRedirect');
        // 显式请求必须拿到 410，而不是 503
        expect(latestApkSource).toContain("requestedProvider === 'fullstack'");
        expect(latestApkSource).toContain('decommissioned');
        expect(packageJson.scripts['release:fullstack']).toBe('node scripts/upload-apk-fullstack.mjs');
    });
});
