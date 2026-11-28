import { describe, expect, it } from 'vitest';
import { 构建主剧情COT内容, 核心_思维链 } from '../prompts/core/cot';
import { 核心_输出格式 } from '../prompts/core/format';
import { 构建运行时额外提示词 } from '../prompts/runtime/nsfw';
import { parseStoryRawText } from '../services/ai/storyResponseParser';

const 读取端到端AI配置 = () => {
    const baseUrl = process.env.MORAN_E2E_AI_BASE_URL?.trim();
    const apiKey = process.env.MORAN_E2E_AI_API_KEY?.trim();
    const model = process.env.MORAN_E2E_AI_MODEL?.trim();
    return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
};

const 解析OpenAI聊天响应内容 = async (response: Response): Promise<string> => {
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    if (contentType.includes('text/event-stream') || rawText.trimStart().startsWith('data:')) {
        let accumulated = '';
        for (const line of rawText.split(/\r?\n/u)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const json = JSON.parse(payload);
                accumulated += String(json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '');
            } catch {
                // 忽略无法解析的中间行
            }
        }
        return accumulated;
    }
    const json = JSON.parse(rawText) as any;
    return String(json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content || '');
};

const 提取正文文本 = (raw: string): string => parseStoryRawText(raw).logs.map(log => log.text).join('\n');

describe('额外提示词禁词端到端', () => {
    it('用游戏实际展示的正文检查禁词，思考中的协议示例不进入正文', () => {
        const raw = '<thinking>在 `<正文>` 中禁用“极其”。</thinking><正文>【旁白】沈砚放下茶碗。</正文><短期记忆>饮茶。</短期记忆>';
        expect(提取正文文本(raw)).toBe('沈砚放下茶碗。');
    });
    it('核心提示词包含极其禁词硬约束与额外提示词锚点', () => {
        // format.ts 硬编码禁用"极其"
        expect(核心_输出格式.内容).toContain('极其');
        // Step0 锚点：清点并锁定玩家额外提示词硬约束
        expect(核心_思维链.内容).toContain('玩家额外提示词（最高优先级）');
        // Step13 回扣：禁用词与文风硬约束
        expect(核心_思维链.内容).toContain('回扣 Step0 锁定的禁用词');
        // 原创版与同人版共用同一函数，均包含极其禁令
        const 同人版 = 构建主剧情COT内容({ fandom: true });
        expect(同人版).toContain('极其');
    });

    it('接真实AI跑一回合，正文不出现极其且遵守自定义禁词', async () => {
        const 配置 = 读取端到端AI配置();
        if (!配置) {
            console.warn('[额外提示词禁词端到端] 未配置 MORAN_E2E_AI_* 环境变量，跳过真实AI回合验证。');
            return;
        }

        // 玩家在设置里填写的自定义禁词
        const customPrompt = [
            '文风要求：本存档为古风武侠，禁止使用以下词语：极其、莫名、仿佛、似乎。',
            '需要表达强度时改用具体动作、感官细节或环境压力。'
        ].join('\n');
        const 额外提示词 = 构建运行时额外提示词(customPrompt, { 启用NSFW模式: false });

        const systemPrompt = [
            核心_思维链.内容,
            核心_输出格式.内容,
            额外提示词
        ].join('\n\n');

        const userPrompt = [
            '当前场景：客栈大堂，主角"沈砚"独自饮茶。',
            '玩家输入：环顾四周，观察堂内客人的神态与气氛。',
            '请依次输出闭合的 <thinking>…</thinking>、<正文>…</正文>、<短期记忆>…</短期记忆> 三段。正文至少 300 字，重点写主角的观察与堂内气氛。'
        ].join('\n');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        let raw = '';
        try {
            const response = await fetch(`${配置.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${配置.apiKey}`
                },
                body: JSON.stringify({
                    model: 配置.model,
                    stream: false,
                    max_tokens: 8192,
                    temperature: 0.8,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                }),
                signal: controller.signal
            });
            expect(response.ok).toBe(true);
            raw = await 解析OpenAI聊天响应内容(response);
        } finally {
            clearTimeout(timer);
        }

        const 正文 = 提取正文文本(raw);
        console.log('[额外提示词禁词端到端] 正文长度=', 正文.length);
        console.log('[额外提示词禁词端到端] 正文预览=\n', 正文.slice(0, 600));

        expect(正文.length).toBeGreaterThan(80);
        // 核心禁词：极其
        expect(正文).not.toContain('极其');
        // 自定义禁词
        for (const 禁词 of ['莫名', '仿佛', '似乎']) {
            expect(正文, `正文命中自定义禁词：${禁词}`).not.toContain(禁词);
        }
    }, 130_000);
});
