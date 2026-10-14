import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const 读取请求体 = async (req: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const 执行NovelAI代理请求 = async (
  url: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> => {
  const upstreamHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (!value) return;
    if (/^(host|content-length|connection|accept-encoding)$/i.test(key)) return;
    upstreamHeaders.set(key, value);
  });

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers: upstreamHeaders,
    body: body.length ? body : undefined
  });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer())
  };
};

const handleNovelAiProxyRequest = async (
  req: any,
  res: any,
  next: () => void,
  logger: { error: (message: string) => void }
) => {
  if (!req.url) {
    next();
    return;
  }

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.end();
    return;
  }

  try {
    const body = await 读取请求体(req);
    const targetUrl = `https://image.novelai.net${req.url}`;
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    const result = await 执行NovelAI代理请求(targetUrl, req.method || 'POST', headers, body);
    res.statusCode = result.status;
    Object.entries(result.headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.end(result.body);
  } catch (error: any) {
    logger.error(`[novelai-dev-proxy] ${error?.message || error}`);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'NovelAI dev proxy failed',
      detail: error?.message || String(error)
    }));
  }
};

const handlePucodingImageProxyRequest = async (
  req: any,
  res: any,
  next: () => void,
  logger: { error: (message: string) => void }
) => {
  if (!req.url) {
    next();
    return;
  }

  try {
    if (!/^\/v1\/images\/(?:generations|edits)(?:[?#]|$)/i.test(req.url)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Unsupported pucoding image proxy path' }));
      return;
    }

    const body = await 读取请求体(req);
    const targetUrl = `https://pucoding.com${req.url}`;
    const headers: Record<string, string> = {};
    const authorization = req.headers.authorization;
    const contentType = req.headers['content-type'];
    const accept = req.headers.accept;
    if (typeof authorization === 'string' && authorization.trim()) headers.authorization = authorization;
    if (typeof contentType === 'string' && contentType.trim()) headers['content-type'] = contentType;
    if (typeof accept === 'string' && accept.trim()) headers.accept = accept;

    const result = await 执行NovelAI代理请求(targetUrl, req.method || 'POST', headers, body);
    res.statusCode = result.status;
    Object.entries(result.headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.end(result.body);
  } catch (error: any) {
    logger.error(`[pucoding-image-dev-proxy] ${error?.message || error}`);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'pucoding image dev proxy failed',
      detail: error?.message || String(error),
      cause: error?.cause?.message || error?.cause?.code || ''
    }));
  }
};

const isPrivateHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0') return true;
  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  if (/^\[?::1\]?$/.test(lower)) return true;
  return false;
};

const isAllowedOpenAiImageProxyTarget = (value: string): boolean => {
  try {
    const url = new URL(value);
    return /^https:$/i.test(url.protocol) && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
};

const handleOpenAiImageProxyRequest = async (
  req: any,
  res: any,
  next: () => void,
  logger: { error: (message: string) => void }
) => {
  if (!req.url) {
    next();
    return;
  }

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.end();
    return;
  }

  try {
    const requestUrl = new URL(req.url, 'http://local-openai-image-proxy');
    const targetBase = String(requestUrl.searchParams.get('url') || '').trim().replace(/\/+$/, '');
    if (!targetBase || !isAllowedOpenAiImageProxyTarget(targetBase)) {
      res.statusCode = 400;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'OpenAI image proxy target URL is invalid or not allowed.' }));
      return;
    }

    // ?url= 模式：目标地址已编码在 query 参数中，跳过 pathname 路径白名单校验
    const isUrlMode = !!targetBase;

    if (!isUrlMode) {
      // ?provider= 模式：路径在 pathname 里，需要白名单校验
      const proxyPrefix = '/api/image-backend/openai-image-proxy';
      const pathPart = requestUrl.pathname.startsWith(proxyPrefix)
        ? requestUrl.pathname.slice(proxyPrefix.length) || '/'
        : requestUrl.pathname || '/';
      if (!/^\/(?:v1\/)?(?:images\/(?:generations|edits)|tasks\/[^/?#]+)$/i.test(pathPart)) {
        res.statusCode = 404;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Unsupported OpenAI image proxy path' }));
        return;
      }
    }

    const target = new URL(targetBase);
    const basePath = target.pathname.replace(/\/+$/, '');
    // ?url= 模式：目标地址已包含完整路径，直接使用
    if (!isUrlMode) {
      const proxyPrefix = '/api/image-backend/openai-image-proxy';
      const pathPart = requestUrl.pathname.startsWith(proxyPrefix)
        ? requestUrl.pathname.slice(proxyPrefix.length) || '/'
        : requestUrl.pathname || '/';
      const normalizedPath = basePath.endsWith('/v1') && pathPart.startsWith('/v1/')
        ? pathPart.replace(/^\/v1/i, '')
        : (pathPart.startsWith('/v1/') ? pathPart : `${basePath.endsWith('/v1') ? '' : '/v1'}${pathPart}`);
      target.pathname = `${basePath}${normalizedPath}`;
    }
    target.search = '';
    requestUrl.searchParams.forEach((value, key) => {
      if (key !== 'url') target.searchParams.append(key, value);
    });

    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }
    const body = method === 'GET' ? Buffer.alloc(0) : await 读取请求体(req);
    const headers: Record<string, string> = {};
    const contentType = req.headers['content-type'];
    const authorization = req.headers.authorization;
    const accept = req.headers.accept;
    if (typeof authorization === 'string' && authorization.trim()) headers.authorization = authorization;
    if (typeof contentType === 'string' && contentType.trim()) headers['content-type'] = contentType;
    if (typeof accept === 'string' && accept.trim()) headers.accept = accept;

    const result = await 执行NovelAI代理请求(target.toString(), method, headers, body);
    res.statusCode = result.status;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    Object.entries(result.headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.end(result.body);
  } catch (error: any) {
    logger.error(`[openai-image-dev-proxy] ${error?.message || error}`);
    res.statusCode = 502;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'OpenAI image dev proxy failed',
      detail: error?.message || String(error)
    }));
  }
};

// 本地 dev / preview 下同域图片取回代理：对应生产 Worker 的 /api/image-backend/fetch-image
// 仅用于把"生图返回的远程图片 URL"取回为同源资源，避免浏览器跨域（CORS）失败。
const isAllowedFetchImageTarget = (value: string): boolean => {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
};

const handleFetchImageProxyRequest = async (
  req: any,
  res: any,
  next: () => void,
  logger: { error: (message: string) => void }
) => {
  if (!req.url) {
    next();
    return;
  }

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.end();
    return;
  }

  try {
    const requestUrl = new URL(req.url, 'http://local-fetch-image');
    const target = String(requestUrl.searchParams.get('url') || '').trim();
    if (!target || !isAllowedFetchImageTarget(target)) {
      res.statusCode = 400;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid fetch-image target URL' }));
      return;
    }

    const upstream = await fetch(target, { headers: { Accept: 'image/*,*/*;q=0.8' } });
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'fetch-image upstream failed', status: upstream.status }));
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(buf);
  } catch (error: any) {
    logger.error(`[fetch-image-dev-proxy] ${error?.message || error}`);
    res.statusCode = 502;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'fetch-image dev proxy failed', detail: error?.message || String(error) }));
  }
};

const isAllowedComfyProxyTarget = (value: string): boolean => {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol)
      && (
        /(^|\.)cnb\.run$/i.test(url.hostname)
        || /(^|\.)cnb\.space$/i.test(url.hostname)
        || process.env.CNB_SYNC_ALLOW_ANY_URL === 'true'
      );
  } catch {
    return false;
  }
};

const handleComfyUiProxyRequest = async (
  req: any,
  res: any,
  next: () => void,
  logger: { error: (message: string) => void }
) => {
  if (!req.url) {
    next();
    return;
  }

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }

  try {
    const requestUrl = new URL(req.url, 'http://local-comfy-proxy');
    const targetBase = String(requestUrl.searchParams.get('url') || '').trim().replace(/\/+$/, '');
    if (!targetBase || !isAllowedComfyProxyTarget(targetBase)) {
      res.statusCode = 400;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'ComfyUI proxy target URL is invalid or not allowed.' }));
      return;
    }

    const proxyPrefix = '/api/image-backend/comfyui-proxy';
    const pathPart = requestUrl.pathname.startsWith(proxyPrefix)
      ? requestUrl.pathname.slice(proxyPrefix.length) || '/'
      : requestUrl.pathname || '/';
    const target = new URL(targetBase);
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/${pathPart.replace(/^\/+/, '')}`;
    target.search = '';
    requestUrl.searchParams.forEach((value, key) => {
      if (key !== 'url') target.searchParams.append(key, value);
    });

    const method = String(req.method || 'GET').toUpperCase();
    const body = method === 'GET' ? Buffer.alloc(0) : await 读取请求体(req);
    const headers: Record<string, string> = {};
    const contentType = req.headers['content-type'];
    const authorization = req.headers.authorization;
    const accept = req.headers.accept;
    if (typeof contentType === 'string' && contentType.trim()) headers['content-type'] = contentType;
    if (typeof authorization === 'string' && authorization.trim()) headers.authorization = authorization;
    if (typeof accept === 'string' && accept.trim()) headers.accept = accept;

    const result = await 执行NovelAI代理请求(target.toString(), method, headers, body);
    res.statusCode = result.status;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    Object.entries(result.headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.end(result.body);
  } catch (error: any) {
    logger.error(`[comfyui-dev-proxy] ${error?.message || error}`);
    res.statusCode = 502;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'ComfyUI dev proxy failed',
      detail: error?.message || String(error)
    }));
  }
};

const imageDevProxyPlugin = (): Plugin => ({
  name: 'image-dev-proxy',
  configurePreviewServer(server) {
    server.middlewares.use('/api/novelai', async (req, res, next) => {
      await handleNovelAiProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/pucoding-image', async (req, res, next) => {
      await handlePucodingImageProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/openai-image-proxy', async (req, res, next) => {
      await handleOpenAiImageProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/comfyui-proxy', async (req, res, next) => {
      await handleComfyUiProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/fetch-image', async (req, res, next) => {
      await handleFetchImageProxyRequest(req, res, next, server.config.logger);
    });
  },
  configureServer(server) {
    server.middlewares.use('/api/novelai', async (req, res, next) => {
      await handleNovelAiProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/pucoding-image', async (req, res, next) => {
      await handlePucodingImageProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/openai-image-proxy', async (req, res, next) => {
      await handleOpenAiImageProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/comfyui-proxy', async (req, res, next) => {
      await handleComfyUiProxyRequest(req, res, next, server.config.logger);
    });
    server.middlewares.use('/api/image-backend/fetch-image', async (req, res, next) => {
      await handleFetchImageProxyRequest(req, res, next, server.config.logger);
    });
  }
});

/** 本机路径/工具链目录特征：出现即说明路径被本机环境污染（base 与产物引用共用）。 */
const 本机路径特征正则 = [
  /^[A-Za-z]:[\\/]/,                        // C:\ 或 C:/
  /\\/,                                      // 反斜杠
  /:\d+/,                                   // 盘符/端口混合
  /PortableGit|msys|mingw|resources[\\/]vendor/i, // Git Bash 工具链目录（v1.0.685 事故特征）
  /^\/(?:Users|home|mnt|opt|var|tmp)\//,   // POSIX 用户/系统目录（本机路径泄漏）
];

/** 路径是否命中本机路径特征。 */
export const 是否本机路径 = (值: string): boolean =>
  !!值 && 本机路径特征正则.some((re) => re.test(值));

/**
 * base 合法性判定（用于 env 值与最终合并后的 base，勿删）
 *
 * base 只允许「以单个 / 开头的 URL 前缀」（如 `/`、`/app/`），或空串 / `'./'`。
 * 注意：这里**不能**用「斜杠段数 > 1」当非法条件 —— 合法的子路径部署 base（如 `/app/`）
 * 就是单段，但产物里的完整引用（`/app/assets/index.js`）是三段，两者是不同量纲，不能共用规则。
 */
export const 断言Base合法 = (值: string, 来源: string): void => {
  if (!值 || 值 === './') return;
  const 非法 = 是否本机路径(值) || 值.split('/').filter(Boolean).length > 1;
  if (非法) {
    throw new Error(
      `[vite] 检测到非法 base（来源：${来源}）：${JSON.stringify(值)}。\n` +
        '  这通常是 Git Bash 的 MSYS 路径转换把 `--base=/` 或绝对路径改写成了 Windows 路径，' +
        '会让产物 index.html 引用 `/workbuddy/resources/vendor/PortableGit/assets/...` 这类' +
        '线上不存在的路径 → 主 bundle 404 → 整页白屏。\n' +
        "  修法：构建命令前加 MSYS2_ARG_CONV_EXCL='*'（Git Bash 下），" +
        '或改用 `npm run build:apk`（走 node 脚本拼参数，不经过 shell 转换）。'
    );
  }
};

/**
 * 产物资源引用合法性判定（用于 generateBundle 扫出的 HTML 引用，勿删）
 *
 * 与 base 判定**刻意分开**：资源引用天然是多段路径（`/assets/index.js`），
 * 合法与否只看有没有本机路径特征。
 */
export const 断言产物引用合法 = (引用: string, 来源: string): void => {
  if (!引用) return;
  if (是否本机路径(引用)) {
    throw new Error(
      `[vite] 产物 ${来源} 的资源引用被本机路径污染：${JSON.stringify(引用)}。\n` +
        '  该引用指向构建机上的目录（如 `/workbuddy/resources/vendor/PortableGit/assets/...`），' +
        '线上/包内都不存在 → 主 bundle 404 → 整页白屏。\n' +
        "  根因通常是 Git Bash 的 MSYS 参数转换改写了 `--base=/`，" +
        "修法：构建命令前加 MSYS2_ARG_CONV_EXCL='*'。"
    );
  }
};

/**
 * 防 MSYS 污染 base 的第二、三道闸门（务必保留，勿删）
 *
 * 事故背景（v1.0.685 官网整页白屏）：发布时用
 * `npx vite build --base=/ --outDir .tmp-web-685` 构建 web 产物，Git Bash 的 MSYS 参数
 * 转换把 `--base=/` 改写成 `--base=/workbuddy/resources/vendor/PortableGit/`，产出
 * `index.html` 引用 `/workbuddy/.../assets/index-XXX.js`（线上 404）。
 * 这个坏包**自身完全自洽**：html 与 assets 在同一目录产出、APK 内又是另一份正常产物，
 * 所以「比对线上 hash == 本地 hash」全部通过 —— 两边同时是错的，只能靠真实渲染/路径校验抓。
 *
 * 为什么上一道闸门（config 函数体内只查 env.VITE_BASE_PATH）拦不住：
 * `vite build --base=/xxx` 这类 **CLI 参数**是在配置解析完成后才合并进最终 config 的。
 *
 * ⚠️ 三个易踩的坑（都已实测，勿改回）：
 *   1) vite 的 configResolved 钩子**只对 plugins 数组里的插件触发**，写在 config 对象上
 *      是死代码 —— 构建照跑、产物照坏、钩子一次都不会被调用。所以这里必须做成 plugin。
 *   2) 产物校验**必须用 writeBundle，不能用 generateBundle**：generateBundle 执行时
 *      vite 尚未生成 index.html，bundle 里没有任何 .html 条目 → 循环体一次都不执行，
 *      整段校验形同虚设（实测：探针打印 `NO HTML IN BUNDLE`）。writeBundle 时
 *      index.html 已落盘且在 bundle 中，才能真正读到最终引用。
 *   3) 校验「资源引用」时不能套用 base 的多段路径规则，否则合法的
 *      `/assets/index.js`、`/app/assets/index.js` 会被误判成非法而中断正常构建。
 */
const assertSafeAssetBasePlugin = (): Plugin => ({
  name: 'assert-safe-asset-base',
  apply: 'build',
  // post：确保排在 vite 内置 html 插件之后，拿到的是注入完资源引用的最终 HTML
  enforce: 'post',
  configResolved(resolved) {
    断言Base合法(resolved.base, 'configResolved 最终 base');
  },
  writeBundle(outputOptions, bundle) {
    const 产物目录 = outputOptions.dir || '';
    const HTML条目 = Object.keys(bundle).filter((名) => 名.endsWith('.html'));

    // 优先读 bundle 内的产物；bundle 里没有（如 index.html 被单独写出）则回落到磁盘。
    const 读HTML = (文件名: string): string | null => {
      const 产物 = bundle[文件名];
      if (产物 && 产物.type === 'asset') return String(产物.source || '');
      const 磁盘路径 = path.join(产物目录, 文件名);
      if (产物目录 && fs.existsSync(磁盘路径)) return fs.readFileSync(磁盘路径, 'utf8');
      return null;
    };

    const 待查文件 = new Set<string>(HTML条目);
    const 入口HTML = path.join(产物目录, 'index.html');
    if (产物目录 && fs.existsSync(入口HTML)) 待查文件.add('index.html');

    for (const 文件名 of 待查文件) {
      const html = 读HTML(文件名);
      if (!html) continue;
      const 引用正则 = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
      let 匹配: RegExpExecArray | null;
      while ((匹配 = 引用正则.exec(html))) {
        断言产物引用合法(匹配[1], 文件名);
      }
    }
  }
});

const stripSameOriginAssetCrossoriginPlugin = (): Plugin => ({
  name: 'strip-same-origin-asset-crossorigin',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      /(<(?:script|link)\b(?=[^>]*(?:src|href)="\/assets\/)[^>]*)\s+crossorigin(?=[\s>])/g,
      '$1'
    );
  }
});

/**
 * 构建产物守卫：每个 JS chunk 内只允许存在一份 React 运行时。
 *
 * 背景（v1.0.669 线上白屏事故）：react-vendor chunk 内被内联了两份 react.production.js，
 * 两份各自持有独立的 ReactSharedInternals（{H:null}）。App 组件从第一份拿 useRef，
 * 而 react-dom 渲染时激活的是第二份的 dispatcher，于是 R.H 恒为 null：
 *   TypeError: Cannot read properties of null (reading 'useRef')
 * 页面直接白屏。该构建是**非确定性**的（同源码重新构建即恢复正常），
 * 因此必须在构建期做硬性校验，而不是依赖人工核对哈希/体积。
 */
const assertSingleReactInstancePlugin = (): Plugin => ({
  name: 'assert-single-react-instance',
  apply: 'build',
  generateBundle(_options, bundle) {
    const problems: string[] = [];
    for (const [fileName, chunk] of Object.entries(bundle)) {
      if (chunk.type !== 'chunk' || !fileName.endsWith('.js')) continue;
      const code = chunk.code;
      // react.production.js / react.development.js 各出现一次 = 一份 React 运行时
      const prodCopies = (code.match(/react\.production\.js/g) || []).length;
      const devCopies = (code.match(/react\.development\.js/g) || []).length;
      const internalsCopies = (code.match(/\{H:null,A:null,T:null,S:null\}/g) || []).length;
      if (prodCopies > 1 || devCopies > 1 || internalsCopies > 1) {
        problems.push(
          `${fileName}: react.production.js×${prodCopies}, react.development.js×${devCopies}, ` +
          `ReactSharedInternals×${internalsCopies}`
        );
      }
    }
    if (problems.length) {
      this.error(
        '检测到打包产物内存在多份 React 运行时，会导致运行时 "Cannot read properties of null (reading \'useRef\')" 白屏。\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n请检查 vite.config.ts 的 manualChunks 与 react/react-dom 的解析结果是否被重复打包。'
      );
    }
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // --- 防 MSYS 路径转换污染 base（务必保留，勿删） ---
  // 事故背景：v1.0.674 / v1.0.675 的 APK 都是 100% 黑屏。构建走 Git Bash 时，
  // MSYS 会把形如 `/f/code/MoRanJiangHu` 的绝对路径展开成 Windows 路径再塞回进程
  // 环境；若这个值最终落到 VITE_BASE_PATH，vite 就会把它当作 base 写进 index.html，
  // 产出 `/workbuddy/resources/vendor/PortableGit/assets/...` 这类引用。APK 内不存在
  // 这些文件 → 主 bundle 全部 404 → 纯黑屏，而且 APK 自身 sha/size 完全自洽，
  // 通道级校验查不出来。
  // 这里在配置阶段就断言：base 只允许「以单个 / 开头的 URL 前缀」，一旦出现盘符、
  // 反斜杠、冒号或两段以上斜杠，直接抛错让构建失败，而不是产出一个坏包。
  const rawBase = env.VITE_BASE_PATH || '/';
  断言Base合法(rawBase, 'VITE_BASE_PATH 环境变量');
  const productionBase = rawBase;

  return {
    base: mode === 'production' ? productionBase : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['.cnb.run', '.cnb.space', '.cnb.cool']
    },
    plugins: [
      react(),
      imageDevProxyPlugin(),
      stripSameOriginAssetCrossoriginPlugin(),
      assertSafeAssetBasePlugin(),
      assertSingleReactInstancePlugin()
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');
 
            if (normalizedId.includes('/node_modules/')) {
              if (
                normalizedId.includes('/react/') ||
                normalizedId.includes('/react-dom/') ||
                normalizedId.includes('/scheduler/')
              ) {
                return 'react-vendor';
              }
              if (normalizedId.includes('/@capacitor/')) {
                return 'capacitor-vendor';
              }
              if (normalizedId.includes('/fflate/')) {
                return 'fflate-vendor';
              }
              if (normalizedId.includes('/@google/genai/')) {
                return 'ai-sdk-vendor';
              }
              return 'vendor';
            }
 
            if (
              normalizedId.endsWith('/data/structuredItemLibrary.ts') ||
              normalizedId.endsWith('/data/presetItemImages.ts')
            ) {
              return 'item-library';
            }

            // prompts/* 内部存在 core<->runtime 循环依赖（如 prompts/stats <-> prompts/runtime/fandom），
            // 拆成多个 chunk 会形成跨 chunk 循环并触发运行时 TDZ（Cannot access 'x' before initialization）。
            // 统一归入单个 prompts chunk，把循环限制在 chunk 内部，避免线上初始化崩溃。
            if (normalizedId.includes('/prompts/')) {
              return 'prompts';
            }

            if (
              normalizedId.endsWith('/utils/openingConfig.ts') ||
              normalizedId.endsWith('/utils/topicModeProfiles.ts') ||
              normalizedId.endsWith('/utils/modeRuntimeProfile.ts') ||
              normalizedId.endsWith('/utils/promptFeatureToggles.ts')
            ) {
              return 'prompts';
            }

            if (
              normalizedId.includes('/hooks/useGame/') ||
              normalizedId.endsWith('/hooks/useGame.ts') ||
              normalizedId.includes('/services/ai/')
            ) {
              return 'game-runtime';
            }
          }
}
      }
    },
    resolve: {
      // 强制 react/react-dom/scheduler 只解析到同一份实体，避免被打包成多份运行时。
      // 多份 React 会各自持有独立的 ReactSharedInternals（{H:null}），
      // 导致 hooks 报 "Cannot read properties of null (reading 'useRef')" 白屏（v1.0.669 事故）。
      dedupe: ['react', 'react-dom', 'scheduler'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      exclude: [
        'node_modules/**',
        'dist/**',
        '.worktrees/**',
        '.tmp*/**',
        'test-results/**',
        'tests/e2e-*.spec.mjs',
        'tests/bugfix-*.spec.mjs',
        'tests/battle-*.spec.mjs',
        'tests/dialogue-*.spec.mjs',
        'tests/save-*.spec.mjs'
      ]
    }
  };
});
