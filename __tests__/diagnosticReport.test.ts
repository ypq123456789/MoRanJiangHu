import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/appUpdate', () => ({
    getCurrentAppRelease: vi.fn(async () => ({
        versionCode: 205,
        versionName: '1.0.204'
    }))
}));

vi.mock('../services/dbService', () => ({
    读取存档列表: vi.fn(async () => []),
    读取存档摘要列表: vi.fn(async () => []),
    读取存档: vi.fn(async () => null),
    计算存档摘要短哈希: vi.fn(() => 'hash-test')
}));

const createLocalStorageMock = () => {
    const store = new Map<string, string>();
    return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
            store.delete(key);
        }),
        clear: vi.fn(() => {
            store.clear();
        })
    };
};

describe('diagnosticReport', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('localStorage', createLocalStorageMock());
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile',
            language: 'zh-CN',
            platform: 'Android'
        });
        vi.stubGlobal('screen', {
            width: 390,
            height: 844
        });
        vi.stubGlobal('window', {
            location: {
                protocol: 'capacitor:',
                href: 'capacitor://localhost'
            },
            screen: {
                width: 390,
                height: 844
            },
            devicePixelRatio: 3,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('falls back to the backup diagnostic endpoint when the primary returns HTTP 200 with a non-report body', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('<!doctype html><title>SPA fallback</title>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                ok: true,
                id: 'diag_test',
                createdAt: '2026-05-17T09:00:00+08:00',
                expiresAt: '2026-06-17T09:00:00+08:00',
                remainingToday: 9
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        vi.stubGlobal('fetch', fetchMock);

        const { submitDiagnosticReport } = await import('../services/diagnosticReport');
        const result = await submitDiagnosticReport([{
            id: 'log_test',
            level: 'error',
            message: '图床上传失败：error code: 1102',
            detail: { status: 503 },
            createdAt: '2026-05-17T09:00:00+08:00'
        } as any]);

        expect(result).toMatchObject({
            id: 'diag_test',
            remainingToday: 9
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain('msjh.bacon159.pp.ua/api/diagnostics/report');
        expect(String(fetchMock.mock.calls[1][0])).toContain('msjh.bacon.de5.net/api/diagnostics/report');
    });

    it('uploads full debug context with parse failure raw text and sanitized save snapshot', async () => {
        const rawAiText = '<log>开场第一句</log>\n<行动选项>缺失结束标签';
        const secretValue = 'sk-test-should-not-leak';
        const imageDataUrl = `data:image/png;base64,${'a'.repeat(1600)}`;
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ok: true,
            id: 'diag_debug',
            createdAt: '2026-05-17T09:00:00+08:00',
            expiresAt: '2026-06-17T09:00:00+08:00',
            remainingToday: 9
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetchMock);

        const dbService = await import('../services/dbService');
        const debugSave = {
            id: 7,
            类型: 'auto',
            时间戳: Date.parse('2026-05-17T08:55:00+08:00'),
            元数据: {
                现实保存时间ISO: '2026-05-17T00:55:00.000Z'
            },
            角色数据: {
                姓名: '测试侠客',
                APIKey: secretValue,
                portraitDataUrl: imageDataUrl
            },
            环境信息: {
                时间: '元年:01:01:08:00',
                大地点: '中原',
                中地点: '洛阳',
                小地点: '客栈',
                具体地点: '二楼'
            },
            历史记录: [{
                role: 'assistant',
                content: '上一轮剧情',
                timestamp: Date.parse('2026-05-17T08:54:00+08:00'),
                rawJson: `${rawAiText}\n${'后续内容'.repeat(200)}`
            }],
            世界: {
                clientSecret: secretValue
            },
            游戏设置: {
                启用标签检测完整性: true
            }
        } as any;
        vi.mocked(dbService.读取存档列表).mockResolvedValue([debugSave]);
        vi.mocked(dbService.读取存档摘要列表).mockResolvedValue([debugSave]);
        vi.mocked(dbService.读取存档).mockResolvedValue(debugSave);

        const { recordAiParseFailureDiagnostic } = await import('../services/diagnosticContext');
        recordAiParseFailureDiagnostic({
            stage: 'opening_story',
            error: {
                message: '标签不完整',
                parseDetail: '缺少 </行动选项>',
                rawText: rawAiText
            },
            apiConfig: {
                model: 'test-model',
                供应商: 'test-provider',
                baseUrl: 'https://example.com/v1',
                apiKey: secretValue
            },
            rawText: rawAiText,
            streaming: true,
            validateTagCompleteness: true,
            enableTagRepair: true,
            requireActionOptionsTag: true,
            inputTokens: 123,
            outputTokens: 45,
            gameTime: '元年:01:01:08:00'
        });

        const { submitDiagnosticReport } = await import('../services/diagnosticReport');
        await submitDiagnosticReport([{
            id: 'log_info_only',
            level: 'info',
            message: '流式连接正常',
            createdAt: '2026-05-17T09:00:00+08:00'
        } as any]);

        const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}'));
        expect(requestBody.logs).toHaveLength(1);
        expect(requestBody.debugContext?.recentAiParseFailures?.[0]).toMatchObject({
            stage: 'opening_story',
            rawText: rawAiText,
            rawTextLength: rawAiText.length,
            model: 'test-model',
            supplier: 'test-provider',
            baseUrlHost: 'example.com',
            validateTagCompleteness: true,
            requireActionOptionsTag: true,
            gameTime: '元年:01:01:08:00'
        });
        expect(requestBody.debugContext?.saveSnapshot?.saves?.[0]?.summary).toMatchObject({
            id: 7,
            type: 'auto',
            characterName: '测试侠客',
            gameTime: '元年:01:01:08:00',
            location: '中原 / 洛阳 / 客栈 / 二楼',
            historyCount: 1
        });
        expect(requestBody.debugContext?.recentAiParseFailures?.[0]?.rawText).toBe(rawAiText);
        expect(requestBody.debugContext?.saveSnapshot?.saves?.[0]?.historyTail?.[0]?.rawJson).toContain(rawAiText);
        expect(JSON.stringify(requestBody)).not.toContain(secretValue);
        expect(JSON.stringify(requestBody)).not.toContain(imageDataUrl);
        expect(JSON.stringify(requestBody)).toContain('[已脱敏敏感字段]');
        expect(JSON.stringify(requestBody)).toContain('[已脱敏图片dataURL');
    });

    it('uses paged save summaries instead of the full save list for native diagnostic snapshots', async () => {
        const dbService = await import('../services/dbService');
        const latestAuto = {
            id: 13,
            类型: 'auto',
            时间戳: Date.parse('2026-06-18T10:50:00+08:00'),
            元数据: { 现实保存时间ISO: '2026-06-18T02:50:00.000Z' },
            角色数据: { 姓名: '移动端测试角色' },
            环境信息: { 时间: '元年:01:02:10:50', 大地点: '中原' }
        } as any;
        const latestManual = {
            id: 12,
            类型: 'manual',
            时间戳: Date.parse('2026-06-18T10:45:00+08:00'),
            元数据: { 现实保存时间ISO: '2026-06-18T02:45:00.000Z' },
            角色数据: { 姓名: '移动端测试角色' },
            环境信息: { 时间: '元年:01:02:10:45', 大地点: '中原' }
        } as any;
        vi.mocked(dbService.读取存档摘要列表).mockResolvedValue([latestAuto, latestManual]);
        vi.mocked(dbService.读取存档).mockImplementation(async (id: number) => (
            id === latestAuto.id ? latestAuto : latestManual
        ));
        vi.mocked(dbService.读取存档列表).mockResolvedValue(new Array(500).fill(null).map((_, index) => ({
            id: index + 1,
            类型: 'manual',
            时间戳: index + 1
        })) as any);

        const { buildDiagnosticSaveSnapshot } = await import('../services/diagnosticContext');
        const snapshot = await buildDiagnosticSaveSnapshot();

        expect(dbService.读取存档列表).not.toHaveBeenCalled();
        expect(dbService.读取存档摘要列表).toHaveBeenCalledWith({ limit: 24 });
        expect(dbService.读取存档).toHaveBeenCalledTimes(2);
        expect(snapshot.totalSaves).toBe(2);
        expect(snapshot.saves).toHaveLength(2);
        expect((snapshot.saves[0] as any).summary.id).toBe(latestAuto.id);
        expect(snapshot.notes.join('\n')).toContain('移动端');
    });

    it('轻量上报不会读取存档列表（避免多存档用户内存过载）', async () => {
        const dbService = await import('../services/dbService');
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ok: true,
            id: 'diag_light',
            createdAt: '2026-11-25T20:00:00+08:00',
            expiresAt: '2026-12-25T20:00:00+08:00',
            remainingToday: 10
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { recordDiagnosticLog } = await import('../services/diagnosticLog');
        const { submitLightweightDiagnosticReport } = await import('../services/diagnosticReport');
        recordDiagnosticLog('error', '[cloud-settings-sync] 测试错误', { detail: 'x' });
        const result = await submitLightweightDiagnosticReport('test');

        expect(result?.id).toBe('diag_light');
        expect(dbService.读取存档列表).not.toHaveBeenCalled();
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}'));
        expect(body.debugContext).toMatchObject({ lightweight: true });
        expect(body.logs.length).toBeLessThanOrEqual(30);
    });
});
