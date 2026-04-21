const DEFAULT_CNB_API_BASE = process.env.CNB_OPENAPI_BASE || 'https://api.cnb.cool';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeBaseUrl = (value) => {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_CNB_API_BASE;

  try {
    const url = new URL(text);
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_CNB_API_BASE;
  }
};

const createHeaders = (token) => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json, application/vnd.cnb.api+json',
  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
});

const safeJson = async (response) => {
  const text = await response.text();
  try {
    return {
      text,
      data: text ? JSON.parse(text) : null
    };
  } catch {
    return {
      text,
      data: null
    };
  }
};

const buildWorkspaceStartPayload = ({ branch, ref }) => {
  const payload = {};
  if (String(branch || '').trim()) payload.branch = String(branch).trim();
  if (String(ref || '').trim()) payload.ref = String(ref).trim();
  return payload;
};

export const startCnbWorkspace = async ({
  apiBase = DEFAULT_CNB_API_BASE,
  token = '',
  repo,
  branch = '',
  ref = ''
}) => {
  const repoPath = String(repo || '').trim();
  if (!repoPath) {
    throw new Error('Missing CNB repo, expected owner/repo');
  }

  const baseUrl = normalizeBaseUrl(apiBase);
  const response = await fetch(`${baseUrl}/${repoPath}/-/workspace/start`, {
    method: 'POST',
    headers: createHeaders(token),
    body: JSON.stringify(buildWorkspaceStartPayload({ branch, ref }))
  });

  const { text, data } = await safeJson(response);
  if (!response.ok) {
    throw new Error(`CNB workspace/start failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  return data || {};
};

export const getCnbWorkspaceDetail = async ({
  apiBase = DEFAULT_CNB_API_BASE,
  token = '',
  repo,
  sn
}) => {
  const repoPath = String(repo || '').trim();
  const serial = String(sn || '').trim();
  if (!repoPath) {
    throw new Error('Missing CNB repo, expected owner/repo');
  }
  if (!serial) {
    throw new Error('Missing CNB workspace sn');
  }

  const baseUrl = normalizeBaseUrl(apiBase);
  const response = await fetch(`${baseUrl}/${repoPath}/-/workspace/detail/${encodeURIComponent(serial)}`, {
    method: 'GET',
    headers: createHeaders(token)
  });

  const { text, data } = await safeJson(response);
  if (!response.ok) {
    throw new Error(`CNB workspace/detail failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  return data || {};
};

const hasWorkspaceAccess = (detail) => {
  if (!detail || typeof detail !== 'object') return false;
  return [
    detail.webide,
    detail.jumpUrl,
    detail.vscode,
    detail['vscode-insiders'],
    detail.cursor,
    detail.remoteSsh,
    detail.ssh
  ].some((value) => String(value || '').trim());
};

export const waitForCnbWorkspace = async ({
  apiBase = DEFAULT_CNB_API_BASE,
  token = '',
  repo,
  sn,
  waitMs = 300000,
  retryMs = 5000
}) => {
  const startedAt = Date.now();
  let lastError = '';
  let lastDetail = null;

  while (Date.now() - startedAt < waitMs) {
    try {
      const detail = await getCnbWorkspaceDetail({ apiBase, token, repo, sn });
      lastDetail = detail;
      if (hasWorkspaceAccess(detail)) {
        return {
          ready: true,
          detail
        };
      }
      lastError = 'Workspace detail returned, but access endpoints are not ready yet';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(retryMs);
  }

  return {
    ready: false,
    detail: lastDetail,
    error: lastError || 'CNB workspace detail timed out'
  };
};
