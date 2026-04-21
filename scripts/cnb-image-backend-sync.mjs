import { spawn } from 'node:child_process';
import { startCnbWorkspace, waitForCnbWorkspace } from './lib/cnb-openapi.mjs';

const DEFAULT_PORT = Number(process.env.CNB_IMAGE_BACKEND_PORT || 8188);
const DEFAULT_HEALTH_PATHS = ['/system_stats', '/queue', '/'];
const DEFAULT_DISCOVERY_KEYS = [
  'CNB_IMAGE_BACKEND_URL',
  'CNB_VSCODE_PROXY_URI',
  'VSCODE_PROXY_URI',
  'PORT_FORWARDING_URI',
  'CODESPACE_VSCODE_PROXY_URI'
];

const parseArgs = (argv) => {
  const args = {
    start: '',
    port: DEFAULT_PORT,
    webhook: process.env.CNB_SYNC_WEBHOOK_URL || '',
    token: process.env.CNB_SYNC_WEBHOOK_TOKEN || '',
    customerId: process.env.CNB_SYNC_CUSTOMER_ID || '',
    backendType: process.env.CNB_SYNC_BACKEND_TYPE || 'comfyui',
    waitMs: Math.max(1000, Number(process.env.CNB_SYNC_WAIT_MS || 120000) || 120000),
    retryMs: Math.max(500, Number(process.env.CNB_SYNC_RETRY_MS || 3000) || 3000),
    dryRun: process.env.CNB_SYNC_DRY_RUN === 'true',
    cnbStartWorkspace: String(process.env.CNB_START_WORKSPACE || '').trim().toLowerCase() === 'true',
    cnbApiBase: process.env.CNB_OPENAPI_BASE || 'https://api.cnb.cool',
    cnbToken: process.env.CNB_TOKEN || process.env.CNB_ACCESS_TOKEN || process.env.CNB_OPENAPI_TOKEN || '',
    cnbRepo: process.env.CNB_REPO || process.env.CNB_REPO_SLUG || '',
    cnbBranch: process.env.CNB_BRANCH || '',
    cnbRef: process.env.CNB_REF || ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--start':
        args.start = argv[index + 1] || process.env.CNB_IMAGE_BACKEND_START_COMMAND || '';
        if (argv[index + 1]) index += 1;
        break;
      case '--port':
        args.port = Math.max(1, Number(argv[index + 1]) || DEFAULT_PORT);
        if (argv[index + 1]) index += 1;
        break;
      case '--webhook':
        args.webhook = argv[index + 1] || args.webhook;
        if (argv[index + 1]) index += 1;
        break;
      case '--token':
        args.token = argv[index + 1] || args.token;
        if (argv[index + 1]) index += 1;
        break;
      case '--customer':
        args.customerId = argv[index + 1] || args.customerId;
        if (argv[index + 1]) index += 1;
        break;
      case '--backend':
        args.backendType = argv[index + 1] || args.backendType;
        if (argv[index + 1]) index += 1;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--workspace':
      case '--cnb-start-workspace':
        args.cnbStartWorkspace = true;
        break;
      case '--api-base':
        args.cnbApiBase = argv[index + 1] || args.cnbApiBase;
        if (argv[index + 1]) index += 1;
        break;
      case '--cnb-token':
      case '--token':
        args.cnbToken = argv[index + 1] || args.cnbToken;
        if (argv[index + 1]) index += 1;
        break;
      case '--repo':
        args.cnbRepo = argv[index + 1] || args.cnbRepo;
        if (argv[index + 1]) index += 1;
        break;
      case '--branch':
        args.cnbBranch = argv[index + 1] || args.cnbBranch;
        if (argv[index + 1]) index += 1;
        break;
      case '--ref':
        args.cnbRef = argv[index + 1] || args.cnbRef;
        if (argv[index + 1]) index += 1;
        break;
      default:
        break;
    }
  }

  return args;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeUrl = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

const fillProxyTemplate = (template, port) => {
  const value = String(template || '').trim();
  if (!value) return '';
  const replaced = value
    .replace(/\{\{\s*port\s*\}\}/gi, String(port))
    .replace(/\$\{\s*port\s*\}/gi, String(port))
    .replace(/%PORT%/gi, String(port))
    .replace(/__PORT__/gi, String(port));
  return normalizeUrl(replaced);
};

const resolveUrlFromEnv = (port) => {
  for (const key of DEFAULT_DISCOVERY_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    const resolved = fillProxyTemplate(raw, port);
    if (resolved) {
      return {
        url: resolved,
        source: key
      };
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    const raw = String(value || '').trim();
    if (!raw) continue;

    if (/\{\{\s*port\s*\}\}/i.test(raw) || /\$\{\s*port\s*\}/i.test(raw) || /%PORT%/i.test(raw) || /__PORT__/i.test(raw)) {
      const resolved = fillProxyTemplate(raw, port);
      if (resolved && /cnb\.run/i.test(resolved)) {
        return { url: resolved, source: key };
      }
    }

    if (/^https?:\/\//i.test(raw) && raw.includes(String(port)) && /cnb\.run/i.test(raw)) {
      const resolved = normalizeUrl(raw);
      if (resolved) {
        return { url: resolved, source: key };
      }
    }
  }

  return {
    url: '',
    source: ''
  };
};

const waitForBackendReady = async (baseUrl, waitMs, retryMs) => {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < waitMs) {
    for (const path of DEFAULT_HEALTH_PATHS) {
      const target = `${baseUrl}${path === '/' ? '' : path}`;
      try {
        const response = await fetch(target, {
          method: 'GET'
        });
        if (response.ok || response.status < 500) {
          return {
            ready: true,
            healthUrl: target
          };
        }
        lastError = `HTTP ${response.status} @ ${target}`;
      } catch (error) {
        lastError = `${target}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    await sleep(retryMs);
  }

  return {
    ready: false,
    healthUrl: '',
    error: lastError || 'Backend readiness check timed out'
  };
};

const postSyncPayload = async ({ webhook, token, payload, waitMs, retryMs }) => {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < waitMs) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}`, 'X-CNB-Sync-Token': token } : {})
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${text.slice(0, 240)}`;
      } else {
        return {
          ok: true,
          status: response.status,
          body: text
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(retryMs);
  }

  return {
    ok: false,
    error: lastError || 'Webhook sync timed out'
  };
};

const launchBackend = (command) => {
  if (!command) return null;
  const child = spawn(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  return child;
};

const printJson = (payload) => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const maybeStartWorkspace = async (args) => {
  if (!args.cnbStartWorkspace) return null;

  const started = await startCnbWorkspace({
    apiBase: args.cnbApiBase,
    token: args.cnbToken,
    repo: args.cnbRepo,
    branch: args.cnbBranch,
    ref: args.cnbRef
  });

  if (!String(started?.sn || '').trim()) {
    return {
      started,
      detail: null
    };
  }

  const waited = await waitForCnbWorkspace({
    apiBase: args.cnbApiBase,
    token: args.cnbToken,
    repo: args.cnbRepo,
    sn: started.sn,
    waitMs: args.waitMs,
    retryMs: args.retryMs
  });

  if (!waited.ready) {
    throw new Error(`CNB workspace started but did not become ready: ${waited.error || 'unknown error'}`);
  }

  return {
    started,
    detail: waited.detail
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const workspace = await maybeStartWorkspace(args);
  const child = launchBackend(args.start);

  if (child) {
    console.log(`[cnb-sync] backend start command launched: ${args.start}`);
  }
  if (workspace?.started) {
    console.log(`[cnb-sync] workspace start ok: ${workspace.started.url || workspace.detail?.webide || 'workspace started'}`);
  }

  const discovery = resolveUrlFromEnv(args.port);
  if (!discovery.url) {
    throw new Error(`未能自动发现 CNB ${args.port} 端口公网地址，请检查 CNB_VSCODE_PROXY_URI 或直接设置 CNB_IMAGE_BACKEND_URL。`);
  }

  console.log(`[cnb-sync] detected ${args.backendType} url: ${discovery.url} (${discovery.source})`);

  const readiness = await waitForBackendReady(discovery.url, args.waitMs, args.retryMs);
  if (!readiness.ready) {
    throw new Error(`已发现地址但后端未就绪：${readiness.error || 'unknown error'}`);
  }

  const payload = {
    customerId: args.customerId || undefined,
    backendType: args.backendType,
    port: args.port,
    url: discovery.url,
    healthUrl: readiness.healthUrl,
    detectedFrom: discovery.source,
    detectedAt: new Date().toISOString(),
    workspace: process.env.CNB_WORKSPACE || args.cnbRepo || process.env.CNB_REPO_SLUG || process.env.GITHUB_REPOSITORY || undefined,
    workspaceStart: workspace?.started || undefined,
    workspaceDetail: workspace?.detail || undefined
  };

  if (args.dryRun || !args.webhook) {
    printJson({
      ok: true,
      mode: args.dryRun ? 'dry-run' : 'local-only',
      payload
    });
  } else {
    const result = await postSyncPayload({
      webhook: args.webhook,
      token: args.token,
      payload,
      waitMs: args.waitMs,
      retryMs: args.retryMs
    });
    if (!result.ok) {
      throw new Error(`同步到 worker 失败：${result.error}`);
    }
    printJson({
      ok: true,
      webhook: args.webhook,
      payload,
      responseStatus: result.status,
      responseBody: result.body
    });
  }

  if (!child) {
    return;
  }

  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`后端进程退出，状态码 ${code}`));
      } else {
        resolve();
      }
    });
  });
};

main().catch((error) => {
  console.error(`[cnb-sync] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
