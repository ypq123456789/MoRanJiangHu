import type { GameResponse, 游戏设置结构 } from '../../types';
import { 对AI输出执行酒馆正则 } from '../../utils/tavernRegexEngine';
import { 提取酒馆选项 } from '../../utils/tavernOptionRenderer';
import { 获取预设已分类正则脚本 } from '../../utils/tavernPreset';
import { 从文本解析推理块 } from '../../utils/tavernTemplateEngine';

export const 应用酒馆显示规则 = async (response: GameResponse, runtimeGameConfig: 游戏设置结构): Promise<GameResponse> => {
    let finalDisplayResponse = response;
    // ─── 酒馆正则引擎：对 AI 输出执行安全清理 + 提取选项栏 + 标记 HTML 产出 ───
    const tavernPreset = runtimeGameConfig?.酒馆预设;
    const tavernPresetMode = runtimeGameConfig?.启用酒馆预设模式 === true && tavernPreset;
    if (tavernPresetMode && tavernPreset?.extensions) {
        // 对 AI 输出的 logs 文本执行正则替换（安全清理+HTML美化+JS交互都执行）
        const regexScripts = 获取预设已分类正则脚本(tavernPreset);
        if (regexScripts.length > 0) {
            // 动态导入沙箱桥接检测函数（避免非酒馆模式的整包开销）
            const { 需要iframe沙箱渲染, 需要HTML美化渲染, 包含HTML代码块, 提取HTML代码块内容, 清洗HTML美化产出 } = await import('../../utils/tavernSandboxBridge');

            const processedLogs = (Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [])
                .map((log: any) => {
                    if (!log || typeof log?.text !== 'string' || !log.text.trim()) return log;
                    const originalText = log.text;
                    const cleanedText = 对AI输出执行酒馆正则(
                        log.text,
                        tavernPreset.extensions as Record<string, unknown>,
                        { isMarkdown: true }
                    );
                    if (cleanedText === originalText) return log;

                    // 检测正则替换后的产出是否包含 HTML/JS 内容
                    // 1. 含 ````html` 代码块 → 提取 HTML 内容
                    if (包含HTML代码块(cleanedText)) {
                        const htmlBlocks = 提取HTML代码块内容(cleanedText);
                        if (htmlBlocks.length > 0) {
                            const combinedHtml = htmlBlocks.join('\n');
                            // 非文本部分（代码块外的纯文本）
                            const remainingText = cleanedText.replace(/```html\s*\n?[\s\S]*?```/gi, '').trim();
                            if (需要iframe沙箱渲染(combinedHtml)) {
                                return { ...log, text: remainingText || log.text, htmlContent: combinedHtml, htmlRenderMode: 'sandbox' as const };
                            }
                            // HTML 美化（含标签但无 <script>）
                            const purifiedHtml = 清洗HTML美化产出(combinedHtml);
                            return { ...log, text: remainingText || log.text, htmlContent: purifiedHtml, htmlRenderMode: 'purify' as const };
                        }
                    }

                    // 2. 不在代码块中但直接包含 HTML/JS
                    if (需要iframe沙箱渲染(cleanedText)) {
                        return { ...log, text: originalText, htmlContent: cleanedText, htmlRenderMode: 'sandbox' as const };
                    }
                    if (需要HTML美化渲染(cleanedText)) {
                        const purifiedHtml = 清洗HTML美化产出(cleanedText);
                        return { ...log, htmlContent: purifiedHtml, htmlRenderMode: 'purify' as const };
                    }

                    // 3. 纯文本替换（安全清理脚本）
                    return cleanedText !== originalText ? { ...log, text: cleanedText } : log;
                });
            finalDisplayResponse = { ...finalDisplayResponse, logs: processedLogs };

            // 从选项渲染脚本提取选项（如果当前 action_options 为空）
            if (!Array.isArray(finalDisplayResponse.action_options) || finalDisplayResponse.action_options.length === 0) {
                const allBodyText = processedLogs
                    .map((log: any) => log?.text || '')
                    .filter((t: string) => t.trim())
                    .join('\n');
                const extractedOptions = 提取酒馆选项(allBodyText, tavernPreset.extensions as Record<string, unknown>);
                if (extractedOptions.length > 0) {
                    finalDisplayResponse = {
                        ...finalDisplayResponse,
                        action_options: extractedOptions
                    };
                }
            }
        }

        // ─── Reasoning 模板：从 AI 输出中解析推理/思维块 ───
        const reasoningTemplate = tavernPreset.reasoning;
        if (reasoningTemplate?.prefix && reasoningTemplate.suffix) {
            const bodyLogs = Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [];
            if (bodyLogs.length > 0) {
                const parsedLogs = bodyLogs.map((log: any) => {
                    if (!log || typeof log?.text !== 'string' || !log.text.trim()) return log;
                    const parsed = 从文本解析推理块({
                        text: log.text,
                        template: reasoningTemplate,
                        strict: false,
                    });
                    if (!parsed || !parsed.reasoning.trim()) return log;
                    // 将推理内容移至 log.reasoning，正文保留 content
                    return {
                        ...log,
                        text: parsed.content,
                        reasoning: parsed.reasoning,
                    };
                });
                finalDisplayResponse = { ...finalDisplayResponse, logs: parsedLogs };
            }
        }
    }
    return finalDisplayResponse;
};
