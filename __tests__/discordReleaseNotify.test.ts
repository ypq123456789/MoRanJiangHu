import { describe, it, expect } from 'vitest';
import { 构建发布消息 } from '../scripts/notify-discord.mjs';

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
