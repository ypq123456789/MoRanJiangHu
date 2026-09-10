#!/usr/bin/env node
/**
 * 从项目根目录的 .dev.vars 读取 Cloudflare 生产凭据并注入环境，然后执行传入的命令。
 *
 * 用法：
 *   node scripts/run-with-cf-creds.mjs npx wrangler deploy
 *   node scripts/run-with-cf-creds.mjs npm run release:manifest
 *   node scripts/run-with-cf-creds.mjs npx wrangler kv key get "release-manifest/latest.json" --namespace-id <id> --remote
 *
 * 说明：
 * - .dev.vars 已被 .gitignore（`.dev.vars*`）忽略，凭据只留在本机，不会进仓库。
 * - 生产账号 B 用的是 Global API Key，必须同时提供 CLOUDFLARE_EMAIL；
 *   误用 CLOUDFLARE_API_TOKEN 会得到 `Invalid access token [code: 9109]`。
 * - 本机走代理时先在 shell 里 export HTTPS_PROXY/HTTP_PROXY，本脚本不覆盖已有代理设置。
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 需要注入的键前缀 = ['CLOUDFLARE_', 'CF_MIGRATE_TARGET_'];
const 脚本目录 = path.dirname(fileURLToPath(import.meta.url));
const 项目根目录 = path.resolve(脚本目录, '..');
const 凭据文件 = path.join(项目根目录, '.dev.vars');

const 解析凭据 = () => {
    let 原始内容 = '';
    try {
        原始内容 = readFileSync(凭据文件, 'utf8');
    } catch {
        throw new Error(`未找到 ${凭据文件}，请先把 Cloudflare 凭据写入 .dev.vars。`);
    }

    const 结果 = {};
    原始内容.split(/\r?\n/).forEach((行) => {
        const 文本 = 行.trim();
        if (!文本 || 文本.startsWith('#')) return;
        const 分隔位置 = 文本.indexOf('=');
        if (分隔位置 <= 0) return;
        const 键 = 文本.slice(0, 分隔位置).trim();
        const 值 = 文本.slice(分隔位置 + 1).trim().replace(/^["']|["']$/g, '');
        if (!值) return;
        if (!需要注入的键前缀.some((前缀) => 键.startsWith(前缀))) return;
        结果[键] = 值;
    });

    if (!结果.CLOUDFLARE_API_KEY || !结果.CLOUDFLARE_EMAIL) {
        throw new Error('.dev.vars 缺少 CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL。');
    }
    return 结果;
};

const 参数列表 = process.argv.slice(2);
if (参数列表.length === 0) {
    console.error('用法：node scripts/run-with-cf-creds.mjs <命令> [参数...]');
    process.exit(2);
}

const 凭据 = 解析凭据();
Object.entries(凭据).forEach(([键, 值]) => {
    if (!process.env[键]) process.env[键] = 值;
});

console.log(`[cf-creds] account=${凭据.CLOUDFLARE_ACCOUNT_ID || '(未设置)'} email=${凭据.CLOUDFLARE_EMAIL}`);
console.log(`[cf-creds] proxy=${process.env.HTTPS_PROXY || process.env.https_proxy || '(直连)'}`);
console.log(`[cf-creds] exec: ${参数列表.join(' ')}`);

const 子进程 = spawn(参数列表[0], 参数列表.slice(1), {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
});

子进程.on('exit', (码, 信号) => {
    if (信号) {
        console.error(`[cf-creds] 子进程被信号终止：${信号}`);
        process.exit(1);
    }
    process.exit(码 ?? 1);
});
子进程.on('error', (错误) => {
    console.error(`[cf-creds] 启动子进程失败：${错误.message}`);
    process.exit(1);
});
