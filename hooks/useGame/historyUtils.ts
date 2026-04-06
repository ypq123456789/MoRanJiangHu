import { 聊天记录结构 } from '../../types';
import { 提取响应规划文本 } from './thinkingContext';

const 拼接原始正文行 = (sender: string, text: string): string => {
    const normalizedSender = typeof sender === 'string' ? sender.trim() : '';
    const normalizedText = typeof text === 'string' ? text : '';
    if (!normalizedSender) return normalizedText;
    if (/^【[^】]+】$/.test(normalizedSender)) {
        return `${normalizedSender}${normalizedText}`;
    }
    return `${normalizedSender}：${normalizedText}`;
};

export const formatHistoryToScript = (historyItems: 聊天记录结构[]): string => {
    const lastPlannableIndex = historyItems.reduce((lastIndex, item, index) => (
        item.role === 'assistant' && item.structuredResponse ? index : lastIndex
    ), -1);

    return historyItems.map((h, index) => {
        const timeStr = h.gameTime ? `【${h.gameTime}】\n` : '';
        if (h.role === 'user') {
            return `${timeStr}玩家：${h.content}`;
        }
        if (h.role === 'assistant' && h.structuredResponse) {
            const logs = Array.isArray(h.structuredResponse.body_original_logs) && h.structuredResponse.body_original_logs.length > 0
                ? h.structuredResponse.body_original_logs
                : (Array.isArray(h.structuredResponse.logs) ? h.structuredResponse.logs : []);
            const lines = logs
                .map((l) => 拼接原始正文行(l.sender, l.text))
                .filter((line) => line.trim().length > 0)
                .join('\n');
            const planText = index === lastPlannableIndex
                ? 提取响应规划文本(h.structuredResponse)
                : '';
            const sections = [
                lines.trim(),
                planText ? `【上回合AI剧情规划】\n<剧情规划>\n${planText}\n</剧情规划>` : ''
            ].filter((item) => item.trim().length > 0);
            if (sections.length <= 0) return '';
            return `${timeStr}${sections.join('\n')}`.trim();
        }
        return '';
    }).filter(item => item.trim().length > 0).join('\n\n');
};
