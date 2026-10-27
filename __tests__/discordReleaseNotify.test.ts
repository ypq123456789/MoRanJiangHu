import { describe, it, expect } from 'vitest';
import { 构建发布消息, 解析发送目标, 筛出待发送目标 } from '../scripts/notify-discord.mjs';

const 基础配置 = (patch = {}) => ({
    versionName: '1.0.698',
    versionCode: 698,
    apkSize: 5998060,
    // 故意不带时区偏移：按本地时间解析，断言才不受 CI（UTC）与本地（+08:00）时差影响。
    releasePublishedAt: '2026-10-27T18:23:01',
    websiteUrl: 'https://msjh.bacon159.pp.ua',
    backupWebsiteUrl: 'https://msjh.bacon.de5.net',
    releaseNotes: [
        '修复网页版使用 OpenCode 订阅时提示缺少会话参数的问题。',
        '接口设置新增「自定义请求头」。',
        '本次更新同时覆盖浏览器端与安卓安装包。',
        '官网：https://msjh.bacon159.pp.ua/',
        '备用站：https://msjh.bacon.de5.net/'
    ],
    ...patch
});

describe('Discord 发布消息构建', () => {
    it('标题带版本号，描述含发布时间与更新条目', () => {
        const 消息 = 构建发布消息(基础配置());
        const embed = 消息.embeds[0];
        expect(embed.title).toBe('LATEST v1.0.698');
        expect(embed.description).toContain('**发布时间**：2026/10/27 18:23');
        expect(embed.description).toContain('• 修复网页版使用 OpenCode 订阅时提示缺少会话参数的问题。');
        expect(embed.url).toBe('https://msjh.bacon159.pp.ua');
        expect(embed.timestamp).toBe(new Date('2026-10-27T18:23:01').toISOString());
    });

    it('官网/备用站链接行不重复进正文，改为独立字段', () => {
        const embed = 构建发布消息(基础配置()).embeds[0];
        expect(embed.description).not.toContain('官网：https://');
        expect(embed.description).not.toContain('备用站：https://');
        expect(embed.fields.map((项) => 项.name)).toEqual(['官网', '备用站', 'APK']);
        expect(embed.fields[2].value).toBe('v1.0.698 · 5.7 MB');
    });

    it('缺少官网时不留空字段，也不加 url', () => {
        const embed = 构建发布消息(基础配置({ websiteUrl: '', backupWebsiteUrl: '' })).embeds[0];
        expect(embed.url).toBeUndefined();
        expect(embed.fields.map((项) => 项.name)).toEqual(['APK']);
    });

    it('更新说明缺失时仍给出可读描述', () => {
        const embed = 构建发布消息(基础配置({ releaseNotes: [], changes: [] })).embeds[0];
        expect(embed.description).toContain('本次更新已完成。');
    });

    it('超长说明被截断，避免超过 Discord 嵌入长度上限', () => {
        const 长文 = '很长的更新说明'.repeat(800);
        const embed = 构建发布消息(基础配置({ releaseNotes: [长文] })).embeds[0];
        expect(embed.description.length).toBeLessThanOrEqual(3300);
        expect(embed.description.endsWith('…')).toBe(true);
    });

    it('配置了提醒身份组时作为 content 发送', () => {
        const 消息 = 构建发布消息(基础配置(), { mention: '<@&1234567890>' });
        expect(消息.content).toBe('<@&1234567890>');
        expect(构建发布消息(基础配置()).content).toBeUndefined();
    });

    it('版本号缺失时用兜底标题，不抛错', () => {
        const embed = 构建发布消息({}).embeds[0];
        expect(embed.title).toBe('LATEST v未知版本');
        expect(embed.footer.text).toContain('APK —');
    });
});

describe('Discord 发送目标解析', () => {
    it('配了 Webhook 时按 Webhook 发送，支持多个（逗号分隔）', () => {
        const 结果 = 解析发送目标({
            webhookUrl: 'https://discord.com/api/webhooks/1/a, https://discord.com/api/webhooks/2/b'
        });
        expect(结果.缺少配置).toBe(false);
        expect(结果.目标.map((项: any) => 项.key)).toEqual(['webhook#0', 'webhook#1']);
        expect(结果.目标[0].kind).toBe('webhook');
    });

    it('频道不是自己的：用机器人令牌 + 频道 ID 发送', () => {
        const 结果 = 解析发送目标({ botToken: 'bot-token', channelIds: '1507996890304872630, 1500000000000000000' });
        expect(结果.缺少配置).toBe(false);
        expect(结果.目标.map((项: any) => 项.key)).toEqual([
            'channel#1507996890304872630',
            'channel#1500000000000000000'
        ]);
        expect(结果.目标[0]).toMatchObject({ kind: 'channel', token: 'bot-token' });
    });

    it('命令行 --webhook 覆盖配置文件里的地址', () => {
        const 结果 = 解析发送目标({ webhookUrl: 'https://discord.com/api/webhooks/1/a', webhookOverride: 'https://discord.com/api/webhooks/9/z' });
        expect(结果.目标).toHaveLength(1);
        expect((结果.目标[0] as { url?: string }).url).toContain('/webhooks/9/z');
    });

    it('什么都没配时明确报告缺少配置', () => {
        const 结果 = 解析发送目标({});
        expect(结果.缺少配置).toBe(true);
        expect(结果.目标).toEqual([]);
        expect(结果.原因).toContain('DISCORD_WEBHOOK_URL');
    });

    it('只有令牌没有频道 ID 视为未配置', () => {
        expect(解析发送目标({ botToken: 'bot-token' }).缺少配置).toBe(true);
    });
});

describe('Discord 重复发送去重', () => {
    const 目标 = [
        { kind: 'webhook', key: 'webhook#0', url: 'https://discord.com/api/webhooks/1/a' },
        { kind: 'channel', key: 'channel#1507996890304872630', channelId: '1507996890304872630', token: 't' }
    ];

    it('同一版本已发过的目标跳过', () => {
        const 待发 = 筛出待发送目标(目标, { version: '1.0.698', sent: ['webhook#0'] }, '1.0.698');
        expect(待发.map((项: any) => 项.key)).toEqual(['channel#1507996890304872630']);
    });

    it('版本变化后全部重发', () => {
        const 待发 = 筛出待发送目标(目标, { version: '1.0.697', sent: ['webhook#0', 'channel#1507996890304872630'] }, '1.0.698');
        expect(待发).toHaveLength(2);
    });

    it('没有历史状态时全部发送', () => {
        expect(筛出待发送目标(目标, null, '1.0.698')).toHaveLength(2);
    });
});
