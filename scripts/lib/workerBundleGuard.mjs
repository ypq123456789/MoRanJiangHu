// 部署前闸门：Worker 打包产物必须比 functions/ 源码新。
//
// 背景（v1.0.696 事故）：wrangler.152.jsonc 的 main 指向 `.tmp-worker-build/worker-entry.ts`，
// 这是 `npm run worker:functions` 生成的产物，不是 wrangler 现场编译的。
// 只跑 `wrangler deploy` 会把上一次的旧 bundle 原样发上去——站点静态资源是新的，
// 但 `/api/*` 仍是旧代码，表现为「前端修好了、服务端行为没变」，极难排查。
// 这里在部署前把这种情况直接挡下来。
import fs from 'node:fs';
import path from 'node:path';

const 跳过目录 = new Set(['node_modules', '.git', '.wrangler', 'dist']);

/** 递归取目录下最新一次修改时间（毫秒）。目录不存在返回 0。 */
export const 读取最新修改时间 = (目录) => {
    let 最新 = 0;
    const 遍历 = (当前) => {
        let 条目列表;
        try {
            条目列表 = fs.readdirSync(当前, { withFileTypes: true });
        } catch {
            return;
        }
        条目列表.forEach((条目) => {
            if (跳过目录.has(条目.name)) return;
            const 完整路径 = path.join(当前, 条目.name);
            if (条目.isDirectory()) {
                遍历(完整路径);
                return;
            }
            try {
                const { mtimeMs } = fs.statSync(完整路径);
                if (mtimeMs > 最新) 最新 = mtimeMs;
            } catch {
                // 单个文件读取失败不影响整体判断
            }
        });
    };
    遍历(目录);
    return 最新;
};

/**
 * @param {{ 项目根目录: string, 打包入口路径: string }} 参数
 * @returns {{ 需要检查: boolean, ok: boolean, 原因?: string }}
 */
export const 检查Worker打包产物 = ({ 项目根目录, 打包入口路径 }) => {
    const 入口 = String(打包入口路径 || '').trim();
    if (!入口) return { 需要检查: false, ok: true };

    const 绝对入口 = path.resolve(项目根目录, 入口);
    // 只有 src 产物（非 node_modules 内的真实源码入口）才需要做新鲜度检查。
    if (!绝对入口.includes(`${path.sep}.tmp-worker-build${path.sep}`)) {
        return { 需要检查: false, ok: true };
    }
    if (!fs.existsSync(绝对入口)) {
        return {
            需要检查: true,
            ok: false,
            原因: `Worker 打包产物不存在：${入口}\n请先运行：npm run worker:functions`
        };
    }

    const 产物时间 = fs.statSync(绝对入口).mtimeMs;
    const 源码时间 = 读取最新修改时间(path.join(项目根目录, 'functions'));
    if (源码时间 > 产物时间) {
        const 差距秒 = Math.round((源码时间 - 产物时间) / 1000);
        return {
            需要检查: true,
            ok: false,
            原因: `Worker 打包产物比 functions/ 源码旧 ${差距秒} 秒，直接部署会发上旧代码。\n请先运行：npm run worker:functions`
        };
    }
    return { 需要检查: true, ok: true };
};

/** 从命令行参数里找出 wrangler 的 --config 目标。 */
export const 解析Wrangler配置路径 = (参数列表) => {
    const 列表 = Array.isArray(参数列表) ? 参数列表 : [];
    for (let 索引 = 0; 索引 < 列表.length; 索引 += 1) {
        const 当前 = String(列表[索引]);
        if (当前 === '--config' || 当前 === '-c') return 列表[索引 + 1] || '';
        const 前缀 = 当前.match(/^--config=(.+)$/);
        if (前缀) return 前缀[1];
    }
    return '';
};

/** 读取 wrangler 配置里的 main（容错 JSONC 注释）。 */
export const 读取Wrangler入口路径 = (配置文件路径) => {
    try {
        const 原文 = fs.readFileSync(配置文件路径, 'utf8');
        const 无注释 = 原文
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        const 配置 = JSON.parse(无注释);
        return typeof 配置?.main === 'string' ? 配置.main : '';
    } catch {
        return '';
    }
};
