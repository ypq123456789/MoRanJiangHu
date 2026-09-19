import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_VARS_PATH = path.join(projectRootDir, '.dev.vars');

/**
 * 从项目根目录的 .dev.vars 载入凭据到 process.env（已存在的环境变量优先，不被覆盖）。
 *
 * 为什么需要：多个发布/上传脚本只从 process.env 读配置，却从不加载 .dev.vars，
 * 结果在本机直接 `npm run <script>` 时拿不到 CLOUDFLARE_*、MORAN_OPENLIST_AUTH_TOKEN 等，
 * 轻则报「Missing xxx」，重则像 release:manifest 那样把 KV 写入静默吞掉、
 * 仍以 exit 0 收尾造成「假成功」（2026-09-19 v1.0.669 已复现并修）。
 * 统一走这里，让每个脚本都能自足运行，不必依赖操作者记得用 run-with-cf-creds.mjs 包裹。
 *
 * .dev.vars 已被 .gitignore（`.dev.vars*`）忽略，凭据只留在本机，不会进仓库。
 * 注意：生产账号 B 用的是 Global API Key，必须同时提供 CLOUDFLARE_EMAIL；
 * 误用 CLOUDFLARE_API_TOKEN 会得到 `Invalid access token [code: 9109]`。
 *
 * @param {{ filePath?: string }} [options]
 * @returns {{ loaded: boolean, keys: string[], path: string }}
 */
export const loadDevVars = ({ filePath = DEV_VARS_PATH } = {}) => {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { loaded: false, keys: [], path: filePath };
  }

  const keys = [];
  raw.split(/\r?\n/).forEach((line) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    const idx = text.indexOf('=');
    if (idx <= 0) return;
    const key = text.slice(0, idx).trim();
    const value = text.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || !value) return;
    if (process.env[key]) return; // 真实环境变量优先
    process.env[key] = value;
    keys.push(key);
  });

  return { loaded: true, keys, path: filePath };
};
