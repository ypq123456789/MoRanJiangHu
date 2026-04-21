import { getCnbWorkspaceDetail, startCnbWorkspace, waitForCnbWorkspace } from './lib/cnb-openapi.mjs';

const parseArgs = (argv) => {
  const args = {
    apiBase: process.env.CNB_OPENAPI_BASE || 'https://api.cnb.cool',
    token: process.env.CNB_TOKEN || process.env.CNB_ACCESS_TOKEN || process.env.CNB_OPENAPI_TOKEN || '',
    repo: process.env.CNB_REPO || process.env.CNB_REPO_SLUG || '',
    branch: process.env.CNB_BRANCH || '',
    ref: process.env.CNB_REF || '',
    waitMs: Math.max(1000, Number(process.env.CNB_WORKSPACE_WAIT_MS || 300000) || 300000),
    retryMs: Math.max(500, Number(process.env.CNB_WORKSPACE_RETRY_MS || 5000) || 5000),
    noWait: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--api-base':
        args.apiBase = argv[index + 1] || args.apiBase;
        if (argv[index + 1]) index += 1;
        break;
      case '--token':
        args.token = argv[index + 1] || args.token;
        if (argv[index + 1]) index += 1;
        break;
      case '--repo':
        args.repo = argv[index + 1] || args.repo;
        if (argv[index + 1]) index += 1;
        break;
      case '--branch':
        args.branch = argv[index + 1] || args.branch;
        if (argv[index + 1]) index += 1;
        break;
      case '--ref':
        args.ref = argv[index + 1] || args.ref;
        if (argv[index + 1]) index += 1;
        break;
      case '--wait-ms':
        args.waitMs = Math.max(1000, Number(argv[index + 1]) || args.waitMs);
        if (argv[index + 1]) index += 1;
        break;
      case '--retry-ms':
        args.retryMs = Math.max(500, Number(argv[index + 1]) || args.retryMs);
        if (argv[index + 1]) index += 1;
        break;
      case '--no-wait':
        args.noWait = true;
        break;
      default:
        break;
    }
  }

  return args;
};

const printJson = (payload) => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const started = await startCnbWorkspace(args);

  if (args.noWait || !String(started?.sn || '').trim()) {
    printJson({
      ok: true,
      mode: args.noWait ? 'start-only' : 'start-no-sn',
      workspace: started
    });
    return;
  }

  const ready = await waitForCnbWorkspace({
    apiBase: args.apiBase,
    token: args.token,
    repo: args.repo,
    sn: started.sn,
    waitMs: args.waitMs,
    retryMs: args.retryMs
  });

  if (!ready.ready) {
    const latestDetail = ready.detail || await getCnbWorkspaceDetail({
      apiBase: args.apiBase,
      token: args.token,
      repo: args.repo,
      sn: started.sn
    }).catch(() => null);

    throw new Error(`CNB workspace is not ready: ${ready.error || 'unknown error'}\n${JSON.stringify({ started, latestDetail }, null, 2)}`);
  }

  printJson({
    ok: true,
    workspace: started,
    detail: ready.detail
  });
};

main().catch((error) => {
  console.error(`[cnb-workspace] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
