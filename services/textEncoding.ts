/**
 * 文本文件编码探测与解码。
 *
 * 背景：小说 TXT 在国内流传极广，绝大多数是 GBK/GB18030 编码，而浏览器默认按 UTF-8 解码，
 * 结果整篇变成乱码（`第一��` 这种），导致章节标题正则一条都匹配不上，
 * 最终表现为「章节只识别出 1 章」「未识别章节格式」。
 *
 * 策略：优先按 UTF-8 严格解码（fatal:true 会直接抛错），失败后按候选编码依次尝试，
 * 取第一个能解出「合理文本」的结果。全部失败才退回 UTF-8 宽松解码，保证不丢内容。
 */

/** 乱码替换字符。UTF-8 误解码字节序列时会出现这个码位。 */
const 替换字符 = '\uFFFD';

/** 常见中文 TXT 编码，按优先级排列。gb18030 是 gbk 的超集，放在后面兜底。 */
const 候选编码 = ['gb18030', 'gbk', 'big5'] as const;

/** 判定「解码结果是否像正常中文文本」。 */
const 是否像正常文本 = (text: string): boolean => {
    if (!text) return true;
    // 替换字符占比过高 = 误解码
    let bad = 0;
    for (let i = 0; i < text.length; i += 1) {
        if (text.charCodeAt(i) === 0xFFFD) bad += 1;
        // U+0000 附近的控制字符（除换行/制表）也说明解码错位
        else if (text.charCodeAt(i) < 0x09) bad += 1;
    }
    return bad / text.length <= 0.005;
};

/** 去掉 UTF-8 BOM。 */
const 去除BOM = (text: string): string => (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);

/** 统计可打印中文/常用标点的比例，用于在多个候选编码间择优。 */
const 计算可读分 = (text: string): number => {
    if (!text) return -1;
    let readable = 0;
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code === 0xFFFD || (code < 0x09)) continue;
        if (code >= 0x20) readable += 1;
    }
    return readable / text.length;
};

/**
 * 中文正文里高频出现、且「误解码后会变成另一批合法汉字」的繁体字。
 *
 * 用途：区分 GB 与 Big5。Big5 字节被按 gb18030 解码时**不会产生 U+FFFD**
 * （所有字节组合都映射到某个汉字），所以「替换字符占比」这个信号对 Big5 完全失效。
 * 只有靠这些「解码正确才可能出现」的繁体字才能把真 Big5 文本认出来。
 */
const 繁体特征字 = /[龍鳳臺灣裏萬學術劍俠雲隱聖靈傳奇滄歸道]/g;

/** 章回小说常见的简体特征字，用于反向排除「把 Big5 误判成 GB」的情况。 */
const 简体特征字 = /[龙凤台湾里万学剑侠云隐圣灵传奇沧归道]/g;

/**
 * 编码特征分：解码结果越像「真正的中文小说文本」分越高。
 *
 * - 章节标题命中：只有解码正确，`第X章/回` 才会是合法的中文行首。
 * - 繁体字命中：Big5 文件正确解码时必然出现；误解码成 GB 时几乎不会。
 */
const 计算编码特征分 = (text: string): number => {
    if (!text) return 0;
    const 标题命中 = (text.match(/第[一二三四五六七八九十百千万兩两0-9]+\s*[章回節节]/g) || []).length;
    const 繁体命中 = (text.match(繁体特征字) || []).length;
    const 简体命中 = (text.match(简体特征字) || []).length;
    // 繁体特征是 Big5 的强信号，权重给足；简体特征用来识别真正的 GB 文本。
    return 标题命中 * 3 + 繁体命中 * 2 - 简体命中 * 0.5;
};

/**
 * 综合择优分。可读分只能排除"明显不是文本"的解码结果，
 * 但 GB 与 Big5 解出来的字符都是合法汉字、可读分必然打平，
 * 因此必须叠加编码特征分才能分出胜负。
 */
const 计算综合分 = (text: string): number => 计算可读分(text) * 10 + 计算编码特征分(text);

/**
 * 按字节探测并解码文本文件。
 *
 * @param bytes 文件原始字节。传 null/空数组时返回空串。
 * @returns 解码后的文本（已去BOM）。任何编码都失败时返回 UTF-8 宽松解码结果。
 */
export const 解码文本文件字节 = (bytes: ArrayBuffer | Uint8Array | null | undefined): string => {
    if (!bytes) return '';
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (buffer.byteLength === 0) return '';

    // 1) UTF-8 严格解码。fatal=true 遇到非法字节序列直接抛错，是最可靠的"就是 UTF-8"信号。
    try {
        const strict = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        if (strict) return 去除BOM(strict);
    } catch {
        // 不是合法 UTF-8，继续尝试其他编码
    }

    // 2) 依次尝试中文编码，取结果最"像文本"的一个。
    let best = '';
    let bestScore = -1;
    for (const 编码 of 候选编码) {
        let decoded = '';
        try {
            decoded = new TextDecoder(编码, { fatal: false }).decode(buffer);
        } catch {
            // 浏览器/WebView 不支持该编码标签
            continue;
        }
        if (!是否像正常文本(decoded)) continue;
        const score = 计算综合分(decoded);
        if (score > bestScore) {
            bestScore = score;
            best = decoded;
        }
    }
    if (best) return 去除BOM(best);

    // 3) 兜底：UTF-8 宽松解码，宁可带乱码也不丢内容。
    return 去除BOM(new TextDecoder('utf-8', { fatal: false }).decode(buffer));
};

/**
 * 读取文本文件并自动处理编码（GBK/GB18030/Big5/UTF-8）。
 *
 * ⚠️ 不要用 `file.text()` 或 `readAsText(file, 'utf-8')`：那会强制 UTF-8 解码，
 *    GBK 小说的章节标题会全部变乱码，表现为"识别不出章节"。
 */
export const 读取文本文件自动编码 = (file: Blob): Promise<string> => (
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                resolve(解码文本文件字节(reader.result as ArrayBuffer | null));
            } catch (error) {
                reject(error instanceof Error ? error : new Error('读取文件失败'));
            }
        };
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
        reader.readAsArrayBuffer(file);
    })
);