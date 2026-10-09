import type { 接口设置结构 } from '../types';
import * as db from './dbService';
import { 获取OpenAI兼容模型元数据 } from '../utils/openAIModelListFetcher';
import { VARIABLE_REVIEW_SETTINGS_KEY, normalizeVariableReviewSettings, resolveVariableReviewApi, normalizeVariableReviewModelOptions, type VariableReviewSettings, type VariableReviewConfiguration } from '../utils/variableReviewSettings';

export const createVariableReviewConfigurationActions = (getApi: () => 接口设置结构, storage = { read: db.读取设置, write: db.保存设置 }) => {
    let current: VariableReviewSettings | undefined;
    let loading: Promise<void> | undefined;
    let writes: Promise<unknown> = Promise.resolve();
    // 仅运行期缓存，按实际连接（含凭据）隔离；密钥不进入metadata或持久化索引。
    const modelLists = new Map<string, ReturnType<typeof normalizeVariableReviewModelOptions>>();
    const connectionKey = (connection: ReturnType<typeof resolveVariableReviewApi>) => JSON.stringify([connection.id, connection.供应商, connection.baseUrl, connection.apiKey]);
    const cachedModels = (settings: VariableReviewSettings) => {
        try { return modelLists.get(connectionKey(resolveVariableReviewApi(settings, getApi(), true))); }
        catch { return undefined; }
    };
    const load = async () => {
        if (!current) {
            loading ||= storage.read(VARIABLE_REVIEW_SETTINGS_KEY).then(raw => { current = normalizeVariableReviewSettings(raw, getApi()); }).catch(error => { loading = undefined; throw error; });
            await loading;
        }
    };
    return {
        peekSettings: (): VariableReviewSettings => {
            if (!current) throw new Error('变量审查设置尚未加载，请稍候。');
            return { ...current };
        },
        getVariableReviewModelMetadata: (settings: VariableReviewSettings) => {
            const model = cachedModels(settings)?.find(item => item.id === settings.model);
            return model ? { ...model } : undefined;
        },
        getVariableReviewConfiguration: async (): Promise<VariableReviewConfiguration> => {
            await load();
            return { settings: { ...current! }, library: (getApi().configs || []).map(c => ({ id: c.id, name: c.名称 || c.id, model: c.model || '', baseUrl: c.baseUrl, provider: c.供应商 })), modelMetadata: cachedModels(current!)?.map(model => ({ ...model })) };
        },
        saveVariableReviewSettings: (next: VariableReviewSettings): Promise<void> => {
            const normalized = normalizeVariableReviewSettings(next);
            const selected = getApi().configs?.find(c => c.id === normalized.mainConfigId);
            if (selected) normalized.mainConfigName = selected.名称 || selected.id;
            current = normalized;
            // 串行保存避免快速输入导致旧值覆盖新值；只存应用设置，不存备注/角色数据。
            const write = writes.catch(() => undefined).then(() => storage.write(VARIABLE_REVIEW_SETTINGS_KEY, normalized));
            writes = write;
            return write.then(() => undefined);
        },
        refreshVariableReviewModels: async (settings: VariableReviewSettings) => {
            const connection = resolveVariableReviewApi(settings, getApi(), true);
            const models = await 获取OpenAI兼容模型元数据(connection);
            const currentConnection = resolveVariableReviewApi(settings, getApi(), true);
            if (['baseUrl', 'apiKey', '供应商'].some(key => connection[key] !== currentConnection[key])) throw new Error('接口连接已变化，请重新刷新模型。');
            const normalized = normalizeVariableReviewModelOptions(models);
            modelLists.set(connectionKey(connection), normalized);
            return normalized.map(model => ({ ...model }));
        }
    };
};
