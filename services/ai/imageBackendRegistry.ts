import type { 发现图片后端记录结构 } from '../../models/system';
import { buildSyncApiUrl } from '../../utils/nativeRuntime';

type 后端注册表响应 = {
    ok?: boolean;
    items?: 发现图片后端记录结构[];
};

const normalizeUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const buildRegistryUrl = (customUrl?: string): string => {
    const normalized = normalizeUrl(customUrl || '');
    if (normalized) {
        return normalized.includes('/api/image-backend/cnb-sync')
            ? normalized
            : `${normalized}/api/image-backend/cnb-sync`;
    }
    return buildSyncApiUrl('/api/image-backend/cnb-sync');
};

export const fetchDiscoveredImageBackends = async (
    customUrl?: string,
    backendType = 'comfyui'
): Promise<发现图片后端记录结构[]> => {
    const url = new URL(buildRegistryUrl(customUrl), typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid');
    url.searchParams.set('backendType', backendType);

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`图片后端注册表请求失败: ${response.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
    }

    const payload = await response.json().catch(() => null) as 后端注册表响应 | null;
    const items = Array.isArray(payload?.items) ? payload!.items : [];
    return items
        .filter((item) => item && typeof item.url === 'string')
        .sort((a, b) => {
            const timeA = Date.parse(a.lastHeartbeatAt || a.detectedAt || '') || 0;
            const timeB = Date.parse(b.lastHeartbeatAt || b.detectedAt || '') || 0;
            return timeB - timeA;
        });
};

export const buildDiscoveredBackendLabel = (item: 发现图片后端记录结构): string => {
    const title = item.label?.trim() || item.customerId?.trim() || item.workspace?.trim() || item.url;
    const suffix = item.port ? `:${item.port}` : '';
    return `${title}${suffix}`;
};
