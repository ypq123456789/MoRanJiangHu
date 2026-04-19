import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PWSH_PATH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const PWSH_EXECUTABLE = fs.existsSync(PWSH_PATH) ? PWSH_PATH : 'pwsh';
const NOVELAI_PROXY_SCRIPT = path.resolve(__dirname, 'scripts/novelai-proxy.ps1');

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
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(PWSH_EXECUTABLE, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      NOVELAI_PROXY_SCRIPT
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NOVELAI_PROXY_URL: url,
        NOVELAI_PROXY_METHOD: method.toUpperCase(),
        NOVELAI_PROXY_HEADERS: JSON.stringify(headers),
        NOVELAI_PROXY_BODY: body.length ? body.toString('base64') : ''
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `NovelAI 代理进程退出异常: ${code}`));
        return;
      }
      const normalized = stdout.trim();
      if (!normalized) {
        reject(new Error(stderr.trim() || 'NovelAI 代理未返回任何内容'));
        return;
      }
      resolve(normalized);
    });
  });

  const parsed = JSON.parse(output) as { status: number; headers: Record<string, string>; bodyBase64: string };
  return {
    status: parsed.status,
    headers: parsed.headers || {},
    body: parsed.bodyBase64 ? Buffer.from(parsed.bodyBase64, 'base64') : Buffer.alloc(0)
  };
};

const novelAiDevProxyPlugin = (): Plugin => ({
  name: 'novelai-dev-proxy',
  configureServer(server) {
    server.middlewares.use('/api/novelai', async (req, res, next) => {
      if (!req.url) {
        next();
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
        server.config.logger.error(`[novelai-dev-proxy] ${error?.message || error}`);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: 'NovelAI dev proxy failed',
          detail: error?.message || String(error)
        }));
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const productionBase = env.VITE_BASE_PATH || '/MoRanJiangHu/';
  return {
    base: mode === 'production' ? productionBase : '/',
    server: {
      port: 3000,
      host: '0.0.0.0'
    },
    plugins: [react(), novelAiDevProxyPlugin()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');
 
            if (normalizedId.includes('/node_modules/')) {
              if (normalizedId.includes('/fflate/')) {
                return 'fflate-vendor';
              }
              if (normalizedId.includes('/@google/genai/')) {
                return 'ai-sdk-vendor';
              }
              return 'vendor';
            }
 
            if (normalizedId.includes('/prompts/core/')) {
              return 'prompts-core';
            }

            if (normalizedId.includes('/prompts/shared/')) {
              return 'prompts-shared';
            }

            if (normalizedId.endsWith('/utils/promptFeatureToggles.ts')) {
              return 'prompts-shared-utils';
            }
 
            if (normalizedId.includes('/prompts/runtime/')) {
              return 'prompts-runtime';
            }
 
            if (normalizedId.includes('/prompts/stats/')) {
              return 'prompts-stats';
            }
 
            if (normalizedId.includes('/prompts/')) {
              return 'prompts-misc';
            }
 
            if (normalizedId.includes('/components/features/Social/ImageManagerModal')) {
              return 'image-manager-desktop';
            }
 
            if (normalizedId.includes('/components/features/Social/mobile/MobileImageManagerModal')) {
              return 'image-manager-mobile';
            }
 
            if (normalizedId.includes('/components/features/Settings/mobile/MobileSettingsModal')) {
              return 'settings-mobile-entry';
            }
 
            if (normalizedId.includes('/components/features/Settings/SettingsModal')) {
              return 'settings-desktop-entry';
            }
 
            if (normalizedId.includes('/components/features/Settings/')) {
              return 'settings-panels';
            }
 
            if (
              normalizedId.includes('/services/ai/') ||
              normalizedId.includes('/hooks/useGame/') ||
              normalizedId.endsWith('/hooks/useGame.ts')
            ) {
              return 'game-runtime';
            }
          }
}
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
