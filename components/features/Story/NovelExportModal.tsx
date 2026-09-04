import React from 'react';
import { generatePolishedBody } from '../../../services/ai/text';
import { 获取文章优化接口配置, 接口配置是否可用 } from '../../../utils/apiConfig';
import { 写入并分享设备文件 } from '../../../utils/deviceFileShare';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    history: any[];
    apiSettings: any;
    onOpenPolishSettings?: () => void;
}

type ExportMode = 'raw' | 'polish';
type PersonMode = 'third' | 'first' | 'second' | 'mixed';
type DirectExportMode = 'plain' | 'chaptered';

type StylePreset = {
    id: string;
    name: string;
    description: string;
    prompt: string;
};

type ExportSaveResult =
    | { method: 'file' | 'download'; message: string; fileName: string }
    | { method: 'clipboard'; message: string; fileName: string };

type StoryMaterial = {
    turn: number;
    userInput: string;
    assistantReply: string;
    gameTime?: string;
};

const STYLE_PRESETS: StylePreset[] = [
    {
        id: 'wuxia',
        name: '传统武侠',
        description: '偏江湖气与刀光剑影',
        prompt: '请将以下剧情整理成传统武侠小说文本，保留关键事件、人物关系、对白信息与场景推进，强化江湖氛围、动作节奏、环境描写与章节感。'
    },
    {
        id: 'xianxia',
        name: '仙侠奇谭',
        description: '更重意境与修行感',
        prompt: '请将以下剧情整理成偏仙侠风格的长篇小说正文，保留事件顺序与人物行为，强化意境、气机、心境、天地环境与章节转场。'
    },
    {
        id: 'romance',
        name: '情感戏剧',
        description: '更重人物情绪与关系',
        prompt: '请将以下剧情整理成更偏人物关系与情感张力的小说正文，保留事实与对白原意，强化心理描写、情绪变化、关系推进与细节氛围。'
    },
    {
        id: 'chronicle',
        name: '长卷纪事',
        description: '更像完整章节记录',
        prompt: '请将以下剧情整理成连贯长篇纪事小说，保留所有重要事件与信息点，不遗漏线索，并自动拆分为章节，确保节奏稳定、脉络清楚。'
    }
];

const PERSON_OPTIONS: Array<{ id: PersonMode; name: string; description: string }> = [
    { id: 'third', name: '第三人称', description: '更稳，更像常规长篇' },
    { id: 'first', name: '第一人称', description: '代入感更强' },
    { id: 'second', name: '第二人称', description: '更贴近互动叙事' },
    { id: 'mixed', name: '混合人称', description: '根据场景自然切换' }
];

const OUTPUT_CONTRACT = [
    '输出要求：',
    '1. 你必须输出<thinking>...</thinking>与<正文>...</正文>两个顶层标签，且顺序固定。',
    '2. 最终小说正文只能写在<正文>标签内。',
    '3. 不要输出额外说明、注释、总结或代码块。',
    '4. 请自动按剧情发展拆分章节，并为章节命名。',
    '5. 不要出现“第X回合”“玩家输入”“系统提示”等游戏化措辞。'
].join('\n');

const getLogsText = (structuredResponse: any): string => {
    const logs = Array.isArray(structuredResponse?.logs) ? structuredResponse.logs : [];
    return logs
        .map((log: any) => (typeof log?.text === 'string' ? log.text.trim() : ''))
        .filter(Boolean)
        .join('\n\n');
};

const extractStoryMaterials = (history: any[]): StoryMaterial[] => {
    const safeHistory = Array.isArray(history) ? history : [];
    const materials: StoryMaterial[] = [];
    let turn = 0;

    for (const record of safeHistory) {
        if (record?.role === 'user') {
            const content = typeof record?.content === 'string' ? record.content.trim() : '';
            if (!content) continue;
            turn += 1;
            materials.push({
                turn,
                userInput: content,
                assistantReply: '',
                gameTime: typeof record?.gameTime === 'string' ? record.gameTime.trim() : undefined
            });
            continue;
        }

        if (record?.role !== 'assistant') continue;

        const latest = materials[materials.length - 1];
        if (!latest) continue;

        const structuredText = getLogsText(record?.structuredResponse);
        const content = typeof record?.content === 'string' ? record.content.trim() : '';
        latest.assistantReply = structuredText || content;
    }

    return materials.filter((item) => item.userInput || item.assistantReply);
};

const composeStoryText = (materials: StoryMaterial[]): string => {
    return materials.flatMap((item) => {
        const sections: string[] = [];
        const timePrefix = item.gameTime ? `【${item.gameTime}】` : '';
        if (item.userInput) sections.push(`${timePrefix}${item.userInput}`);
        if (item.assistantReply) sections.push(item.assistantReply);
        return sections;
    }).join('\n\n').trim();
};

const CHAPTER_KEYWORDS = [
    { title: '风波初起', keywords: ['初入', '初到', '相逢', '遇见', '启程', '开局'] },
    { title: '暗潮生变', keywords: ['暗', '疑', '查', '线索', '踪迹', '秘密', '异样'] },
    { title: '刀光剑影', keywords: ['战', '杀', '剑', '刀', '拳', '敌', '伤', '血'] },
    { title: '人心难测', keywords: ['信任', '背叛', '试探', '承诺', '情', '心', '约定'] },
    { title: '江湖夜雨', keywords: ['夜', '雨', '客栈', '酒', '街', '城', '镇'] },
    { title: '旧事重提', keywords: ['旧', '往事', '记忆', '师门', '家', '故人'] },
    { title: '秘境余波', keywords: ['秘境', '遗迹', '洞府', '宝', '机关', '残卷'] },
    { title: '山河未定', keywords: ['官府', '宗门', '天下', '江湖', '局势', '风云'] },
];

const stripGameLabels = (text: string): string => (
    text
        .replace(/^#+\s*/gm, '')
        .replace(/^\s*(玩家输入|用户|助手|AI|系统)\s*[:：]/gm, '')
        .trim()
);

const scoreTitle = (text: string, keywords: string[]) => keywords.reduce((sum, keyword) => (
    sum + (text.includes(keyword) ? 1 : 0)
), 0);

const buildChapterTitle = (chapterMaterials: StoryMaterial[], chapterIndex: number): string => {
    const text = chapterMaterials.map((item) => `${item.userInput}\n${item.assistantReply}`).join('\n');
    const matched = CHAPTER_KEYWORDS
        .map((item) => ({ title: item.title, score: scoreTitle(text, item.keywords) }))
        .sort((a, b) => b.score - a.score)[0];
    const title = matched && matched.score > 0 ? matched.title : `江湖纪事${chapterIndex}`;
    return `第${chapterIndex}章 ${title}`;
};

const composeChapteredStoryText = (materials: StoryMaterial[], turnsPerChapter = 6): string => {
    const chunks: string[] = [];
    const safeTurnsPerChapter = Math.max(3, Math.floor(turnsPerChapter));
    for (let index = 0; index < materials.length; index += safeTurnsPerChapter) {
        const chapterMaterials = materials.slice(index, index + safeTurnsPerChapter);
        const title = buildChapterTitle(chapterMaterials, chunks.length + 1);
        const body = stripGameLabels(composeStoryText(chapterMaterials));
        if (!body) continue;
        chunks.push(`${title}\n\n${body}`);
    }
    return chunks.join('\n\n').trim();
};

const buildFormalNovelDocument = (
    body: string,
    options: { title: string; volume: string; protagonist: string; note: string; turnCount: number; characterCount: number; includeTitlePage: boolean; includeExportInfo: boolean; }
): string => {
    const parts: string[] = [];
    if (options.includeTitlePage) {
        parts.push([
            options.title || '墨色江湖长卷',
            '',
            options.volume || '无名卷',
            options.protagonist ? `主角：${options.protagonist}` : '',
            options.note ? `导出说明：${options.note}` : '',
        ].filter(Boolean).join('\n'));
    }
    if (options.includeExportInfo) {
        parts.push([
            `导出时间：${new Date().toLocaleString('zh-CN')}`,
            `导出范围：${options.turnCount} 回合`,
            `正文估算：${options.characterCount.toLocaleString('zh-CN')} 中文字符`,
        ].join(' | '));
    }
    parts.push(body);
    return parts.filter((part) => part.trim()).join('\n\n');
};

const extractChapterTitles = (body: string): string[] => (
    (body || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^第[0-9零一二三四五六七八九十百千万两〇○]+章/.test(line))
);

const buildOfficialExportPackageText = (
    body: string,
    options: {
        title: string;
        volume: string;
        protagonist: string;
        note: string;
        turnCount: number;
        characterCount: number;
        includeTitlePage: boolean;
        includeExportInfo: boolean;
        includeCatalog: boolean;
        includeTurnStats: boolean;
        includeVersionInfo: boolean;
        format: 'txt' | 'md';
    }
): string => {
    const chapters = extractChapterTitles(body);
    const isMarkdown = options.format === 'md';
    const heading = (level: number, text: string) => `${isMarkdown ? `${'#'.repeat(level)} ` : ''}${text}`;
    const divider = isMarkdown ? '\n---\n' : '\n------------------------------\n';
    const parts: string[] = [];

    if (options.includeTitlePage) {
        parts.push([
            heading(1, options.title || '墨色江湖长卷'),
            options.volume ? heading(2, options.volume) : '',
            options.protagonist ? `主角：${options.protagonist}` : '',
            options.note ? `导出说明：${options.note}` : ''
        ].filter(Boolean).join('\n\n'));
    }

    if (options.includeCatalog && chapters.length > 0) {
        parts.push([
            heading(2, '目录'),
            chapters.map((title, index) => `${isMarkdown ? `${index + 1}. ` : `${index + 1}. `}${title}`).join('\n')
        ].join('\n\n'));
    }

    if (options.includeTurnStats) {
        const stats = [
            ['回合数量', `${options.turnCount}`],
            ['章节数量', `${Math.max(1, chapters.length)}`],
            ['正文估算', `${options.characterCount.toLocaleString('zh-CN')} 中文字符`],
            ['导出格式', isMarkdown ? 'Markdown' : 'TXT']
        ];
        parts.push([
            heading(2, '回合范围统计'),
            isMarkdown
                ? ['| 项目 | 数值 |', '| --- | --- |', ...stats.map(([key, value]) => `| ${key} | ${value} |`)].join('\n')
                : stats.map(([key, value]) => `${key}：${value}`).join('\n')
        ].join('\n\n'));
    }

    if (options.includeExportInfo || options.includeVersionInfo) {
        const info = [
            options.includeExportInfo ? `导出时间：${new Date().toLocaleString('zh-CN')}` : '',
            options.includeVersionInfo ? '导出工具：墨色江湖 小说正式出稿包 v1' : '',
            options.includeVersionInfo ? '生成方式：本地直接整理，未调用 AI 润色模型' : ''
        ].filter(Boolean).join('\n');
        if (info) parts.push([heading(2, '导出信息'), info].join('\n\n'));
    }

    parts.push([heading(2, '正文'), body].join('\n\n'));
    return parts.filter((part) => part.trim()).join(divider);
};

const countChineseCharacters = (text: string): number => {
    return (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
};

const buildPrompt = (stylePrompt: string, personMode: PersonMode, customPrompt: string): string => {
    const basePrompt = customPrompt.trim() || stylePrompt;
    const personPrompt = (() => {
        switch (personMode) {
            case 'first':
                return '叙事人称要求：全文以第一人称为主，必要时保持自然过渡。';
            case 'second':
                return '叙事人称要求：全文以第二人称为主，但要保证小说可读性，不要生硬。';
            case 'mixed':
                return '叙事人称要求：根据剧情需要自然混合第一、第二、第三人称，但整体阅读体验必须统一流畅。';
            case 'third':
            default:
                return '叙事人称要求：全文以第三人称为主，保持稳定、清晰、适合长篇阅读。';
        }
    })();

    return [basePrompt, personPrompt, OUTPUT_CONTRACT].join('\n\n');
};

const buildFileName = (prefix: string): string => {
    const now = new Date();
    const date = now.toLocaleDateString('zh-CN').replace(/\//g, '-');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    return `${prefix}_${date}_${time}`;
};

const encodeBase64 = (content: string): string => {
    return btoa(unescape(encodeURIComponent(content)));
};

const saveTextFile = async (content: string, prefix: string, extension: 'txt' | 'md' = 'txt'): Promise<ExportSaveResult> => {
    const fileName = `${buildFileName(prefix)}.${extension}`;
    const runtime = typeof window !== 'undefined' ? (window as any) : undefined;
    const filesystem = runtime?.Capacitor?.Plugins?.Filesystem;

    if (filesystem?.writeFile) {
        try {
            // [修复] 原生 APP：先落盘私有文档目录，再唤起系统分享面板
            // 让玩家选择保存位置——Android 11+ 私有 Documents 在文件管理器不可见。
            const shareResult = await 写入并分享设备文件(fileName, encodeBase64(content), '保存导出文件');
            if (shareResult.method !== 'none') {
                return {
                    method: shareResult.method === 'shared' ? 'file' : 'download',
                    message: shareResult.message,
                    fileName
                };
            }
            await filesystem.writeFile({
                path: fileName,
                data: encodeBase64(content),
                directory: 'DOCUMENTS',
                recursive: false
            });
            return {
                method: 'file',
                message: `已保存到设备文档目录：${fileName}`,
                fileName
            };
        } catch (error) {
            console.error('Filesystem.writeFile failed', error);
        }
    }

    if (typeof document !== 'undefined') {
        const blob = new Blob([content], { type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return {
            method: 'download',
            message: `已开始下载：${fileName}`,
            fileName
        };
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        return {
            method: 'clipboard',
            message: '当前环境不支持直接下载，内容已复制到剪贴板。',
            fileName
        };
    }

    throw new Error('当前环境无法导出文件。');
};

const copyText = async (content: string) => {
    if (!navigator.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板。');
    }
    await navigator.clipboard.writeText(content);
};

const NovelExportModal: React.FC<Props> = ({
    isOpen,
    onClose,
    history,
    apiSettings,
    onOpenPolishSettings
}) => {
    const [mode, setMode] = React.useState<ExportMode>('raw');
    const [directExportMode, setDirectExportMode] = React.useState<DirectExportMode>('chaptered');
    const [bookTitle, setBookTitle] = React.useState('墨色江湖长卷');
    const [volumeTitle, setVolumeTitle] = React.useState('江湖行卷');
    const [protagonistName, setProtagonistName] = React.useState('');
    const [exportNote, setExportNote] = React.useState('由墨色江湖自动整理导出');
    const [includeTitlePage, setIncludeTitlePage] = React.useState(true);
    const [includeExportInfo, setIncludeExportInfo] = React.useState(true);
    const [includeCatalog, setIncludeCatalog] = React.useState(true);
    const [includeTurnStats, setIncludeTurnStats] = React.useState(true);
    const [includeVersionInfo, setIncludeVersionInfo] = React.useState(true);
    const [selectedStyleId, setSelectedStyleId] = React.useState<string>(STYLE_PRESETS[0].id);
    const [personMode, setPersonMode] = React.useState<PersonMode>('third');
    const [customPrompt, setCustomPrompt] = React.useState('');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
    const [previewText, setPreviewText] = React.useState('');
    const abortRef = React.useRef<AbortController | null>(null);

    const materials = React.useMemo(() => extractStoryMaterials(history), [history]);
    const rawStoryText = React.useMemo(() => composeStoryText(materials), [materials]);
    const chapteredStoryText = React.useMemo(() => composeChapteredStoryText(materials), [materials]);
    const validTurns = materials.length;
    const totalCharacters = React.useMemo(() => countChineseCharacters(rawStoryText), [rawStoryText]);
    const directBodyText = React.useMemo(
        () => directExportMode === 'chaptered' ? (chapteredStoryText || rawStoryText) : rawStoryText,
        [chapteredStoryText, directExportMode, rawStoryText]
    );
    const formalDirectText = React.useMemo(() => buildOfficialExportPackageText(
        directBodyText,
        {
            title: bookTitle,
            volume: volumeTitle,
            protagonist: protagonistName,
            note: exportNote,
            turnCount: validTurns,
            characterCount: totalCharacters,
            includeTitlePage,
            includeExportInfo,
            includeCatalog,
            includeTurnStats,
            includeVersionInfo,
            format: 'txt',
        }
    ), [bookTitle, directBodyText, exportNote, includeCatalog, includeExportInfo, includeTitlePage, includeTurnStats, includeVersionInfo, protagonistName, totalCharacters, validTurns, volumeTitle]);
    const markdownDirectText = React.useMemo(() => buildOfficialExportPackageText(
        directBodyText,
        {
            title: bookTitle,
            volume: volumeTitle,
            protagonist: protagonistName,
            note: exportNote,
            turnCount: validTurns,
            characterCount: totalCharacters,
            includeTitlePage,
            includeExportInfo,
            includeCatalog,
            includeTurnStats,
            includeVersionInfo,
            format: 'md',
        }
    ), [bookTitle, directBodyText, exportNote, includeCatalog, includeExportInfo, includeTitlePage, includeTurnStats, includeVersionInfo, protagonistName, totalCharacters, validTurns, volumeTitle]);
    const estimatedSegments = React.useMemo(() => Math.max(1, Math.ceil(rawStoryText.length / 3000)), [rawStoryText]);
    const selectedStyle = React.useMemo(
        () => STYLE_PRESETS.find((item) => item.id === selectedStyleId) || STYLE_PRESETS[0],
        [selectedStyleId]
    );

    React.useEffect(() => {
        if (!isOpen && abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, [isOpen]);

    const handleClose = React.useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        onClose();
    }, [onClose]);

    const handleExportRaw = React.useCallback(async () => {
        if (!rawStoryText.trim()) {
            setError('当前没有可导出的剧情内容。');
            return;
        }
        try {
            setError(null);
            setSuccessMessage(null);
            const result = await saveTextFile(formalDirectText, directExportMode === 'chaptered' ? '墨染江湖_章节正文' : '墨染江湖_原始小说');
            setSuccessMessage(result.message);
        } catch (exportError) {
            setError(`导出失败：${exportError instanceof Error ? exportError.message : '未知错误'}`);
        }
    }, [directExportMode, formalDirectText, rawStoryText]);

    const handleExportMarkdown = React.useCallback(async () => {
        if (!rawStoryText.trim()) {
            setError('当前没有可导出的剧情内容。');
            return;
        }
        try {
            setError(null);
            setSuccessMessage(null);
            const result = await saveTextFile(markdownDirectText, directExportMode === 'chaptered' ? '墨染江湖_章节正文' : '墨染江湖_原始小说', 'md');
            setSuccessMessage(result.message);
        } catch (exportError) {
            setError(`导出失败：${exportError instanceof Error ? exportError.message : '未知错误'}`);
        }
    }, [directExportMode, markdownDirectText, rawStoryText]);

    const handlePolishExport = React.useCallback(async () => {
        if (!rawStoryText.trim()) {
            setError('当前没有可导出的剧情内容。');
            return;
        }

        const polishApi = 获取文章优化接口配置(apiSettings);
        if (!接口配置是否可用(polishApi)) {
            setError('文章优化模型尚未配置可用接口，请先前往设置补齐文章优化配置。');
            return;
        }

        const prompt = buildPrompt(selectedStyle.prompt, personMode, customPrompt);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            setIsProcessing(true);
            setError(null);
            setSuccessMessage(null);
            const result = await generatePolishedBody(
                rawStoryText,
                prompt,
                polishApi,
                controller.signal
            );
            const polishedText = (result.bodyText || '').trim();
            if (!polishedText) {
                throw new Error('模型返回为空，未生成可导出的小说正文。');
            }
            setPreviewText(polishedText);
            const saveResult = await saveTextFile(polishedText, `墨染江湖_${selectedStyle.name}`);
            setSuccessMessage(saveResult.message);
        } catch (polishError) {
            if ((polishError as Error)?.name === 'AbortError') {
                setError('已取消导出。');
            } else {
                setError(`润色失败：${polishError instanceof Error ? polishError.message : '未知错误'}`);
            }
        } finally {
            setIsProcessing(false);
            abortRef.current = null;
        }
    }, [apiSettings, customPrompt, personMode, rawStoryText, selectedStyle]);

    const handleDownloadPreview = React.useCallback(async () => {
        if (!previewText.trim()) return;
        try {
            setError(null);
            setSuccessMessage(null);
            const result = await saveTextFile(previewText, `墨染江湖_${selectedStyle.name}_重下`);
            setSuccessMessage(result.message);
        } catch (downloadError) {
            setError(`重新导出失败：${downloadError instanceof Error ? downloadError.message : '未知错误'}`);
        }
    }, [previewText, selectedStyle.name]);

    const handleCopyPreview = React.useCallback(async () => {
        if (!previewText.trim()) return;
        try {
            setError(null);
            await copyText(previewText);
            setSuccessMessage('润色结果已复制到剪贴板。');
        } catch (copyError) {
            setError(`复制失败：${copyError instanceof Error ? copyError.message : '未知错误'}`);
        }
    }, [previewText]);

    const handleCancel = React.useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const openPolishSettings = React.useCallback(() => {
        handleClose();
        onOpenPolishSettings?.();
    }, [handleClose, onOpenPolishSettings]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
            <div className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-wuxia-gold/20 bg-[#090909] shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:h-[90vh] md:max-h-[860px] md:w-[min(960px,92vw)] md:rounded-[28px]">
                <div className="shrink-0 border-b border-wuxia-gold/15 bg-gradient-to-b from-black to-black/70 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] md:px-6 md:pt-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-[12px] tracking-[0.34em] text-wuxia-gold/70">长卷导出</div>
                            <h2 className="mt-2 text-xl font-bold tracking-[0.18em] text-wuxia-gold md:text-2xl">导出小说</h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                                把当前历史记录整理成可下载小说，支持直接导出原始剧情，也支持调用文章优化模型改写成章节正文。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition-colors hover:border-red-400 hover:text-red-300"
                            aria-label="关闭导出小说"
                        >
                            ×
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-400 md:max-w-xl">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
                            <div className="tracking-[0.2em] text-gray-500">有效回合</div>
                            <div className="mt-1 text-lg font-semibold text-gray-100">{validTurns}</div>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
                            <div className="tracking-[0.2em] text-gray-500">中文字符</div>
                            <div className="mt-1 text-lg font-semibold text-gray-100">{totalCharacters.toLocaleString()}</div>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
                            <div className="tracking-[0.2em] text-gray-500">估算分段</div>
                            <div className="mt-1 text-lg font-semibold text-gray-100">{estimatedSegments}</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
                    <div className="space-y-5">
                        <section className="rounded-3xl border border-white/5 bg-white/[0.03] p-4">
                            <div className="text-[11px] tracking-[0.3em] text-gray-500">导出模式</div>
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('raw')}
                                    className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                                        mode === 'raw'
                                            ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold'
                                            : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'
                                    }`}
                                >
                                    <div className="text-sm font-semibold">直接导出</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-500">保留当前剧情原貌，适合先把内容完整拿出来。</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('polish')}
                                    className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                                        mode === 'polish'
                                            ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold'
                                            : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'
                                    }`}
                                >
                                    <div className="text-sm font-semibold">AI 润色导出</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-500">调用文章优化模型，把互动记录改写成章节化小说。</div>
                                </button>
                            </div>
                        </section>

                        {mode === 'polish' && (
                            <section className="rounded-3xl border border-white/5 bg-white/[0.03] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[11px] tracking-[0.3em] text-gray-500">润色参数</div>
                                    <button
                                        type="button"
                                        onClick={openPolishSettings}
                                        className="text-xs text-wuxia-cyan transition-colors hover:text-wuxia-gold"
                                    >
                                        打开文章优化设置
                                    </button>
                                </div>

                                <div className="mt-4">
                                    <div className="mb-2 text-xs text-gray-400">风格预设</div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                        {STYLE_PRESETS.map((preset) => (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                disabled={isProcessing}
                                                onClick={() => setSelectedStyleId(preset.id)}
                                                className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                                                    selectedStyleId === preset.id
                                                        ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold'
                                                        : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'
                                                } disabled:opacity-60`}
                                            >
                                                <div className="text-sm font-semibold">{preset.name}</div>
                                                <div className="mt-1 text-[11px] leading-5 text-gray-500">{preset.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <div className="mb-2 text-xs text-gray-400">叙事人称</div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                        {PERSON_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                disabled={isProcessing}
                                                onClick={() => setPersonMode(option.id)}
                                                className={`rounded-2xl border px-3 py-2 text-left transition-all ${
                                                    personMode === option.id
                                                        ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold'
                                                        : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'
                                                } disabled:opacity-60`}
                                            >
                                                <div className="text-sm font-semibold">{option.name}</div>
                                                <div className="mt-1 text-[11px] leading-5 text-gray-500">{option.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <label className="mb-2 block text-xs text-gray-400">自定义补充要求</label>
                                    <textarea
                                        value={customPrompt}
                                        onChange={(event) => setCustomPrompt(event.target.value)}
                                        disabled={isProcessing}
                                        rows={5}
                                        className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm leading-6 text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-wuxia-gold/35"
                                        placeholder="可以补充你想要的文风、节奏、章节密度、情绪描写重点。留空则使用上面的风格预设。"
                                    />
                                </div>
                            </section>
                        )}

                        {mode === 'raw' && (
                            <section className="rounded-3xl border border-white/5 bg-white/[0.03] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] tracking-[0.3em] text-gray-500">正式文档</div>
                                        <div className="mt-1 text-xs leading-5 text-gray-500">直接导出也会整理成可读长卷，可选择章节化或保留原始顺序。</div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => setDirectExportMode('chaptered')}
                                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${directExportMode === 'chaptered' ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'}`}
                                    >
                                        <div className="text-sm font-semibold">章节化正文</div>
                                        <div className="mt-1 text-xs leading-5 text-gray-500">自动按回合拆章，并根据关键词生成章节标题。</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDirectExportMode('plain')}
                                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${directExportMode === 'plain' ? 'border-wuxia-gold/60 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 bg-black/20 text-gray-300 hover:border-gray-600'}`}
                                    >
                                        <div className="text-sm font-semibold">原始长卷</div>
                                        <div className="mt-1 text-xs leading-5 text-gray-500">保留当前剧情顺序，只加标题页和导出信息。</div>
                                    </button>
                                </div>
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} className="rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-gray-200 outline-none focus:border-wuxia-gold/35" placeholder="书名" />
                                    <input value={volumeTitle} onChange={(event) => setVolumeTitle(event.target.value)} className="rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-gray-200 outline-none focus:border-wuxia-gold/35" placeholder="卷名" />
                                    <input value={protagonistName} onChange={(event) => setProtagonistName(event.target.value)} className="rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-gray-200 outline-none focus:border-wuxia-gold/35" placeholder="主角名（可选）" />
                                    <input value={exportNote} onChange={(event) => setExportNote(event.target.value)} className="rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-gray-200 outline-none focus:border-wuxia-gold/35" placeholder="导出说明" />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
                                    <label className="flex items-center gap-2 rounded-full border border-gray-800 bg-black/25 px-3 py-2">
                                        <input type="checkbox" checked={includeTitlePage} onChange={(event) => setIncludeTitlePage(event.target.checked)} />
                                        包含标题页
                                    </label>
                                    <label className="flex items-center gap-2 rounded-full border border-gray-800 bg-black/25 px-3 py-2">
                                        <input type="checkbox" checked={includeExportInfo} onChange={(event) => setIncludeExportInfo(event.target.checked)} />
                                        包含导出信息
                                    </label>
                                    <label className="flex items-center gap-2 rounded-full border border-gray-800 bg-black/25 px-3 py-2">
                                        <input type="checkbox" checked={includeCatalog} onChange={(event) => setIncludeCatalog(event.target.checked)} />
                                        包含章节目录
                                    </label>
                                    <label className="flex items-center gap-2 rounded-full border border-gray-800 bg-black/25 px-3 py-2">
                                        <input type="checkbox" checked={includeTurnStats} onChange={(event) => setIncludeTurnStats(event.target.checked)} />
                                        包含回合统计
                                    </label>
                                    <label className="flex items-center gap-2 rounded-full border border-gray-800 bg-black/25 px-3 py-2">
                                        <input type="checkbox" checked={includeVersionInfo} onChange={(event) => setIncludeVersionInfo(event.target.checked)} />
                                        包含版本信息
                                    </label>
                                </div>
                                <div className="mt-4 rounded-2xl border border-gray-800 bg-black/30 p-4">
                                    <div className="mb-2 text-[11px] tracking-[0.3em] text-gray-500">导出预览</div>
                                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-gray-300 no-scrollbar">
                                        {formalDirectText.slice(0, 2200)}
                                        {formalDirectText.length > 2200 ? '\n\n……预览已截断，完整内容请导出查看。' : ''}
                                    </pre>
                                </div>
                            </section>
                        )}

                        {isProcessing && (
                            <section className="rounded-3xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-200/40 border-t-amber-200 animate-spin" />
                                        <span>正在整理并润色小说正文，这一步可能需要一点时间。</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="rounded-full border border-amber-400/40 px-3 py-1 text-xs transition-colors hover:border-amber-300 hover:text-white"
                                    >
                                        取消
                                    </button>
                                </div>
                            </section>
                        )}

                        {previewText && (
                            <section className="rounded-3xl border border-white/5 bg-white/[0.03] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] tracking-[0.3em] text-gray-500">润色结果预览</div>
                                        <div className="mt-1 text-xs text-gray-400">仅截取前 2400 字，完整内容已经可以重新下载或复制。</div>
                                    </div>
                                    <div className="text-xs text-gray-500">{countChineseCharacters(previewText).toLocaleString()} 字</div>
                                </div>
                                <div className="mt-3 rounded-2xl border border-gray-800 bg-black/30 p-4">
                                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-gray-300 no-scrollbar">
                                        {previewText.slice(0, 2400)}
                                        {previewText.length > 2400 ? '\n\n……预览已截断，完整内容可重新下载。' : ''}
                                    </pre>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleDownloadPreview()}
                                        className="rounded-full border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 py-2 text-sm text-wuxia-gold transition-colors hover:bg-wuxia-gold/20"
                                    >
                                        重新下载
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyPreview()}
                                        className="rounded-full border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                                    >
                                        复制全文
                                    </button>
                                </div>
                            </section>
                        )}

                        {successMessage && (
                            <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                                {successMessage}
                            </section>
                        )}

                        {error && (
                            <section className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
                                {error}
                            </section>
                        )}

                        {!rawStoryText.trim() && (
                            <section className="rounded-3xl border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-500">
                                当前没有可导出的剧情内容，请先开始一段对局。
                            </section>
                        )}
                    </div>
                </div>

                {rawStoryText.trim() && (
                    <div className="shrink-0 border-t border-white/5 bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-4 md:px-6 md:pb-5">
                        {mode === 'raw' ? (
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => void handleExportRaw()}
                                    className="w-full rounded-2xl border border-wuxia-gold/40 bg-wuxia-gold/15 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-wuxia-gold transition-colors hover:bg-wuxia-gold/22"
                                >
                                    导出正式 TXT
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleExportMarkdown()}
                                    className="w-full rounded-2xl border border-sky-400/35 bg-sky-500/10 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-sky-100 transition-colors hover:bg-sky-500/20"
                                >
                                    导出 Markdown
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void handlePolishExport()}
                                className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold tracking-[0.18em] transition-colors ${
                                    isProcessing
                                        ? 'cursor-not-allowed border border-gray-800 bg-gray-900 text-gray-500'
                                        : 'border border-wuxia-gold/40 bg-wuxia-gold/15 text-wuxia-gold hover:bg-wuxia-gold/22'
                                }`}
                            >
                                {isProcessing ? '润色中...' : 'AI 润色并导出'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NovelExportModal;
