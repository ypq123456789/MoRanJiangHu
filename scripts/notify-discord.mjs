#!/usr/bin/env node
/**
 * 把当前版本的更新说明发到 Discord 频道。
 *
 * 为什么用 Webhook 而不是 MCP：MCP 只能在「有人开着会话」时手动触发，
 * 而发版是本机脚本流水线，需要无人值守地自动发。Discord Webhook 是最短路径：
 * 频道设置 → 整合 → Webhook → 复制 URL，把 URL 写进 `.dev.vars` 即可。
 *
 * 用法：
 *   node scripts/notify-discord.mjs --dry-run     # 只打印将发送的内容，不发网络请求
 *   node scripts/notify-discord.mjs               # 发到 DISCORD_WEBHOOK_URL
 *   node scripts/notify-discord.mjs --force       # 同一版本重复发（默认会跳过已发过的版本）
 *   node scripts/notify-discord.mjs --webhook https://discord.com/api/webhooks/... 
 *
 * 配置（.dev.vars 或环境变量，两者都支持）：
 *   DISCORD_WEBHOOK_URL   频道 Webhook 地址（推荐；需要在频道里有「管理 Webhook」权限）
 *   DISCORD_BOT_TOKEN     可选，机器人令牌（频道不是自己的、只拿到「邀请机器人」这条路时用）
 *   DISCORD_CHANNEL_ID    可选，目标频道 ID，多个用逗号分隔；与 BOT_TOKEN 配套
 *   DISCORD_MENTION       可选，正文里的提醒，例如 <@&1234567890>（@某身份组）
 *   DISCORD_PROXY         可选，HTTP 代理，例如 http://127.0.0.1:7890（仅直连失败时使用）
 *
 * 权限说明：Webhook 需要「管理 Webhook」；Bot 需要「查看频道 + 发送消息」。
 * 两者都必须由频道管理员/所有者授予——没有权限时任何方案都无法往别人的频道发消息。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 脚本目录 = path.dirname(fileURLToPath(import.meta.url));
const 项目根目录 = path.resolve(脚本目录, '..');
const 发布配置路径 = path.join(项目根目录, 'release.config.json');
const 状态文件路径 = path.join(项目根目录, '.discord-notify-state.json');

const 转义嵌入文本 = (文本) => String(文本 || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** 同步等待（限流重试用），不额外起子进程。 */
const 同步等待 = (毫秒) => {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 毫秒);
    } catch {
        // 极端环境不支持时直接跳过等待
    }
};

const 截断 = (文本, 上限) => {
    const 值 = String(文本 || '');
    if (值.length <= 上限) return 值;
    return `${值.slice(0, Math.max(0, 上限 - 1))}…`;
};

const 格式化时间 = (原始值) => {
    const 时间 = new Date(String(原始值 || ''));
    const 有效时间 = Number.isNaN(时间.getTime()) ? new Date() : 时间;
    const 补零 = (数字) => String(数字).padStart(2, '0');
    return `${有效时间.getFullYear()}/${补零(有效时间.getMonth() + 1)}/${补零(有效时间.getDate())} `
        + `${补零(有效时间.getHours())}:${补零(有效时间.getMinutes())}`;
};

const 格式化体积 = (字节数) => {
    const 数值 = Number(字节数);
    if (!Number.isFinite(数值) || 数值 <= 0) return '';
    return `${(数值 / 1024 / 1024).toFixed(1)} MB`;
};

const 解析键值文件 = (文件路径) => {
    const 结果 = {};
    let 原文 = '';
    try {
        原文 = fs.readFileSync(文件路径, 'utf8');
    } catch {
        return 结果;
    }
    原文.split(/\r?\n/).forEach((行) => {
        const 文本 = 行.trim();
        if (!文本 || 文本.startsWith('#')) return;
        const 分隔 = 文本.indexOf('=');
        if (分隔 <= 0) return;
        const 键 = 文本.slice(0, 分隔).trim();
        const 值 = 文本.slice(分隔 + 1).trim().replace(/^["']|["']$/g, '');
        if (键) 结果[键] = 值;
    });
    return 结果;
};

const 读取本地配置 = () => 解析键值文件(path.join(项目根目录, '.dev.vars'));

/** 读配置：环境变量优先，其次 .dev.vars。 */
const 读取配置项 = (键, 本地配置) => (process.env[键] || 本地配置[键] || '').trim();

/**
 * 生成 Discord 消息体。纯函数，方便单测与 --dry-run 预览。
 * 结构对齐现有频道里的发布贴：标题 LATEST + 版本、发布时间、更新条目、官网/备用站。
 */
export const 构建发布消息 = (releaseConfig, options = {}) => {
    const 版本号 = String(releaseConfig?.versionName || '').trim() || '未知版本';
    const 条目来源 = Array.isArray(releaseConfig?.releaseNotes) && releaseConfig.releaseNotes.length > 0
        ? releaseConfig.releaseNotes
        : (Array.isArray(releaseConfig?.changes) ? releaseConfig.changes : []);
    // 更新条目里常带「官网：https://…」这类链接行，下面已经有专门字段，正文里去掉避免重复。
    const 链接行规则 = /^(官网|备用站|下载|更新日志|更新说明|发布页)\s*[:：]\s*https?:\/\//;
    const 更新条目 = 条目来源
        .map((条目) => 转义嵌入文本(条目))
        .filter((条目) => Boolean(条目) && !链接行规则.test(条目))
        .map((条目) => `• ${截断(条目, 300)}`);

    const 更新段 = 更新条目.length > 0 ? 截断(更新条目.join('\n'), 3200) : '本次更新已完成。';
    const 正文 = [
        `**发布时间**：${格式化时间(releaseConfig?.releasePublishedAt)}`,
        更新段
    ].filter((行) => typeof 行 === 'string' && 行.trim().length > 0).join('\n\n').trim();

    const 官网 = String(releaseConfig?.websiteUrl || '').trim();
    const 备用站 = String(releaseConfig?.backupWebsiteUrl || '').trim();
    const 体积 = 格式化体积(releaseConfig?.apkSize);

    const 字段 = [];
    if (官网) 字段.push({ name: '官网', value: 官网, inline: true });
    if (备用站) 字段.push({ name: '备用站', value: 备用站, inline: true });
    if (体积) 字段.push({ name: 'APK', value: `v${版本号} · ${体积}`, inline: true });

    const embed = {
        title: 截断(`LATEST v${版本号}`, 250),
        color: 0xC9A227,
        description: 正文 || '本次更新已完成。',
        footer: { text: `MoRanJiangHu · 无尽武林 · APK ${releaseConfig?.versionCode ?? '—'}` }
    };
    if (官网) embed.url = 官网;
    if (字段.length > 0) embed.fields = 字段;
    const 发布时间 = new Date(String(releaseConfig?.releasePublishedAt || ''));
    if (!Number.isNaN(发布时间.getTime())) embed.timestamp = 发布时间.toISOString();

    const 消息 = { embeds: [embed] };
    const 提醒 = String(options.mention || '').trim();
    if (提醒) 消息.content = 截断(提醒, 100);
    return 消息;
};

/**
 * 解析发送目标。两种方式二选一：
 * - webhook：频道里建一个 Webhook（需要「管理 Webhook」权限），把网址填 DISCORD_WEBHOOK_URL；
 * - bot：机器人被邀请进频道（需要「发送消息」权限），填 DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID。
 * 频道不是自己建的、拿不到 Webhook 时，通常只能走 bot（要频道管理员邀请）。
 */
export const 解析发送目标 = ({ webhookUrl, botToken, channelIds, webhookOverride } = {}) => {
    const 网址 = String(webhookOverride || '').trim() || String(webhookUrl || '').trim();
    if (网址) {
        const 列表 = 网址.split(',').map((项) => 项.trim()).filter(Boolean);
        return {
            目标: 列表.map((url, 索引) => ({ kind: 'webhook', key: `webhook#${索引}`, url })),
            缺少配置: false,
            原因: ''
        };
    }
    const 令牌 = String(botToken || '').trim();
    const 频道 = String(channelIds || '')
        .split(',')
        .map((项) => 项.trim())
        .filter(Boolean);
    if (令牌 && 频道.length > 0) {
        return {
            目标: 频道.map((channelId) => ({ kind: 'channel', key: `channel#${channelId}`, channelId, token: 令牌 })),
            缺少配置: false,
            原因: ''
        };
    }
    return {
        目标: [],
        缺少配置: true,
        原因: '未配置 DISCORD_WEBHOOK_URL，也未配置 DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID'
    };
};

/** 已发过哪些目标（同一版本内），用于重复执行时跳过。 */
export const 筛出待发送目标 = (目标列表, 状态, 版本号) => {
    const 已完成 = 状态 && 状态.version === 版本号 && Array.isArray(状态.sent)
        ? new Set(状态.sent.map((项) => String(项)))
        : new Set();
    return (Array.isArray(目标列表) ? 目标列表 : []).filter((目标) => !已完成.has(目标.key));
};

const 读取状态 = () => {
    try {
        return JSON.parse(fs.readFileSync(状态文件路径, 'utf8'));
    } catch {
        return null;
    }
};

const 写入状态 = (状态) => {
    try {
        fs.writeFileSync(状态文件路径, `${JSON.stringify(状态, null, 2)}\n`, 'utf8');
    } catch {
        // 状态写不进去只会导致下次重复发，不影响本次通知
    }
};

const 发送 = ({ 地址, 消息文本, 代理, 额外头 = [] }) => {
    const 临时文件 = path.join(项目根目录, `.tmp-discord-payload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(临时文件, 消息文本, 'utf8');
    const 参数 = [
        '-sS', '-o', '-', '-w', '\n%{http_code}',
        '-X', 'POST', 地址,
        '-H', 'Content-Type: application/json; charset=utf-8',
        ...额外头.flatMap((头) => ['-H', 头]),
        '--data-binary', `@${临时文件}`
    ];
    if (代理) 参数.unshift('-x', 代理);
    const 结果 = spawnSync('curl', 参数, { encoding: 'utf8', timeout: 60_000 });
    try {
        fs.unlinkSync(临时文件);
    } catch {
        // 临时文件清理失败不影响结果
    }
    if (结果.error) throw new Error(`调用 curl 失败：${结果.error.message}`);
    const 输出 = String(结果.stdout || '');
    const 换行位置 = 输出.lastIndexOf('\n');
    const 状态码 = Number(输出.slice(换行位置 + 1).trim());
    const 响应体 = 输出.slice(0, 换行位置).trim();
    return { 状态码, 响应体, 退出码: 结果.status === null ? -1 : 结果.status };
};

/** 单个目标的发送（含直连→代理兜底、429 重试一次）。 */
const 发送到目标 = ({ 目标, 消息文本, 代理 }) => {
    const 请求 = (使用代理) => (目标.kind === 'channel'
        ? 发送({
            地址: `https://discord.com/api/v10/channels/${encodeURIComponent(目标.channelId)}/messages`,
            消息文本,
            代理: 使用代理,
            额外头: [`Authorization: Bot ${目标.token}`]
        })
        : 发送({ 地址: 目标.url, 消息文本, 代理: 使用代理 }));

    let 当前代理 = '';
    let 结果 = 请求(当前代理);
    if (结果.退出码 !== 0 && 代理) {
        console.log(`[discord] ${目标.key} 直连失败，改用 DISCORD_PROXY 重试一次`);
        当前代理 = 代理;
        结果 = 请求(当前代理);
    }
    if (结果.状态码 === 429) {
        // Discord 限流：按 retry_after 等一次再发（最多一次）
        let 等待秒 = 2;
        try {
            等待秒 = Math.min(10, Number(JSON.parse(结果.响应体).retry_after) || 2);
        } catch {
            // 响应不是 JSON 就按默认等待
        }
        console.log(`[discord] ${目标.key} 触发限流，${等待秒}s 后重试一次`);
        同步等待(Math.round(等待秒 * 1000));
        结果 = 请求(当前代理);
    }
    return 结果;
};

const 主流程 = () => {
    const 参数 = process.argv.slice(2);
    const 预演 = 参数.includes('--dry-run');
    const 强制发送 = 参数.includes('--force');
    const 地址覆盖 = (() => {
        const 位置 = 参数.findIndex((项) => 项 === '--webhook');
        return 位置 >= 0 ? String(参数[位置 + 1] || '').trim() : '';
    })();

    const 发布配置 = JSON.parse(fs.readFileSync(发布配置路径, 'utf8'));
    const 本地配置 = 读取本地配置();
    const 版本号 = String(发布配置.versionName || '');

    const 消息 = 构建发布消息(发布配置, {
        mention: 读取配置项('DISCORD_MENTION', 本地配置)
    });
    const 消息文本 = JSON.stringify(消息, null, 2);

    if (预演) {
        console.log(`[discord] 预演：v${版本号} 的消息体如下（未发送）`);
        console.log(消息文本);
        const 预演目标 = 解析发送目标({
            webhookUrl: 读取配置项('DISCORD_WEBHOOK_URL', 本地配置),
            botToken: 读取配置项('DISCORD_BOT_TOKEN', 本地配置),
            channelIds: 读取配置项('DISCORD_CHANNEL_ID', 本地配置),
            webhookOverride: 地址覆盖
        });
        console.log(`[discord] 目标：${预演目标.目标.map((项) => 项.key).join(', ') || '（未配置，不会发送）'}`);
        return;
    }

    const { 目标, 缺少配置, 原因 } = 解析发送目标({
        webhookUrl: 读取配置项('DISCORD_WEBHOOK_URL', 本地配置),
        botToken: 读取配置项('DISCORD_BOT_TOKEN', 本地配置),
        channelIds: 读取配置项('DISCORD_CHANNEL_ID', 本地配置),
        webhookOverride: 地址覆盖
    });
    if (缺少配置) {
        console.error(`[discord] ${原因}。`);
        console.error('[discord] 方式一（推荐给频道管理员）：频道设置 → 整合 → Webhook → 新 Webhook → 复制网址 → DISCORD_WEBHOOK_URL');
        console.error('[discord] 方式二（频道不是自己的）：请管理员把你的机器人邀请进该频道并授予「发送消息」，然后填 DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID');
        process.exit(2);
    }

    const 已有状态 = 读取状态();
    const 待发送 = 强制发送 ? 目标 : 筛出待发送目标(目标, 已有状态, 版本号);
    if (待发送.length === 0) {
        console.log(`[discord] v${版本号} 已发送过，跳过（需要重发请加 --force）。`);
        return;
    }

    // 先直连；直连不通且配了 DISCORD_PROXY 才走代理。
    // （本机实测 discord.com 直连可达，而系统默认代理反而连不上，所以不能无脑套用环境代理。）
    const 代理 = 读取配置项('DISCORD_PROXY', 本地配置);

    const 已发送键 = new Set(
        已有状态 && 已有状态.version === 版本号 && Array.isArray(已有状态.sent) ? 已有状态.sent : []
    );
    const 失败 = [];
    for (const 目标项 of 待发送) {
        const 结果 = 发送到目标({ 目标: 目标项, 消息文本, 代理 });
        if (结果.状态码 >= 200 && 结果.状态码 < 300) {
            已发送键.add(目标项.key);
            console.log(`[discord] ${目标项.key} 发送成功`);
        } else {
            失败.push(`${目标项.key} -> ${结果.状态码} ${String(结果.响应体).slice(0, 200)}`);
            console.error(`[discord] ${目标项.key} 发送失败：${结果.状态码}`);
        }
    }

    写入状态({
        version: 版本号,
        sent: Array.from(已发送键),
        sentAt: new Date().toISOString()
    });

    if (失败.length > 0) {
        throw new Error(`部分目标发送失败：${失败.join('；')}`);
    }
    console.log(`[discord] v${版本号} 已发布到 Discord。`);
};

const 是被直接执行 = (() => {
    if (!process.argv[1]) return false;
    try {
        return 标准路径相等(import.meta.url, pathToFileURL(process.argv[1]).href);
    } catch {
        return false;
    }
})();

function 标准路径相等(甲, 乙) {
    const 归一 = (值) => decodeURIComponent(String(值)).replace(/\\/g, '/').toLowerCase();
    return 归一(甲) === 归一(乙);
}

if (是被直接执行) {
    try {
        主流程();
    } catch (错误) {
        console.error(`[discord] 发送失败：${错误?.message || 错误}`);
        process.exit(1);
    }
}
