import { CapacitorHttp } from '@capacitor/core';
import { 构建OpenAI兼容模型列表候选地址 } from './apiConfig';
import { 构建模型列表请求头 } from './customRequestHeaders';
import { 是否原生Capacitor环境 } from './nativeRuntime';
import { readReviewModelCapacity, type ReviewModelCapacity } from './variableReviewBudget';

export interface 模型列表获取配置 {
    baseUrl: string;
    apiKey: string;
    供应商?: string;
    /** 玩家自定义请求头（一行一个 Key: Value），与对话请求保持一致。 */
    自定义请求头?: string;
}

export interface 模型列表元数据 extends ReviewModelCapacity { id: string; label: string }

export const 获取OpenAI兼容模型元数据 = async (config: 模型列表获取配置): Promise<模型列表元数据[]> => {
    const baseUrl = (config.baseUrl || '').trim();
    const apiKey = (config.apiKey || '').trim();
    if (!baseUrl || !apiKey) {
        throw new Error('请先填写当前配置的 API Key 和 Base URL');
    }

    const candidateUrls = 构建OpenAI兼容模型列表候选地址(baseUrl);
    // 与对话请求共用同一套补头逻辑：否则会出现「模型列表能拉、一生成就 400」的怪现象
    // （OpenCode 等网关按请求头做校验，缺 x-opencode-session 直接拒绝）。
    const headers = 构建模型列表请求头({
        baseUrl,
        apiKey,
        供应商: config.供应商,
        自定义请求头: config.自定义请求头
    });

    let lastError: Error | null = null;
    for (const url of candidateUrls) {
        try {
            let data: any;
            if (是否原生Capacitor环境()) {
                const nativeRes = await CapacitorHttp.request({
                    url,
                    method: 'GET',
                    headers,
                    responseType: 'json'
                });
                if (nativeRes.status < 200 || nativeRes.status >= 300) continue;
                data = nativeRes.data;
            } else {
                const res = await fetch(url, { headers });
                if (!res.ok) continue;
                data = await res.json();
            }
            if (data && Array.isArray(data.data)) {
                const models: 模型列表元数据[] = data.data.flatMap((model: any) => {
                    if (typeof model?.id !== 'string' || !model.id.trim()) return [];
                    const id = model.id.trim();
                    const label = [model.label, model.display_name, model.name].find(value => typeof value === 'string' && value.trim());
                    return [{ id, label: label?.trim() || id, ...readReviewModelCapacity(model) }];
                });
                if (models.length > 0) return models;
            }
        } catch (e: any) {
            lastError = e;
        }
    }

    throw lastError || new Error('获取失败：返回格式错误。');
};

// 原调用方继续获得 string[]；请求、鉴权、原生传输和错误处理共用一个实现。
export const 获取OpenAI兼容模型列表 = async (config: 模型列表获取配置): Promise<string[]> =>
    (await 获取OpenAI兼容模型元数据(config)).map(model => model.id);
