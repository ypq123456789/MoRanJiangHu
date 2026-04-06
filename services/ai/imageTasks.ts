import { decompressSync, unzlibSync, unzipSync } from 'fflate';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import type { 香闺秘档部位类型 } from '../../models/imageGeneration';
import type { PNG解析参数结构, PNG画风预设来源类型, 角色锚点结构, 图片词组序列化策略类型 } from '../../models/system';
import { 角色图片分词COT伪装历史消息提示词 } from '../../prompts/runtime/imageTokenizerCharacterCot';
import { 场景图片分词COT伪装历史消息提示词 } from '../../prompts/runtime/imageTokenizerSceneCot';
import { 部位特写分词COT伪装历史消息提示词 } from '../../prompts/runtime/imageTokenizerSecretPartCot';
import { PNG解析COT伪装历史消息提示词 } from '../../prompts/runtime/pngParseCot';
import { 角色锚点提取COT伪装历史消息提示词 } from '../../prompts/runtime/imageAnchorExtractionCot';
import { 本地拆分画师标签 } from './artistTagExtractor';
import {
    从Markdown图片中提取DataUrl,
    提取OpenAI完整文本,
    type 通用消息,
    规范化文本补全消息链,
    读取失败详情文本,
    协议请求错误,
    请求模型文本,
    替换COT伪装身份占位
} from './chatCompletionClient';

import * as dbService from '../dbService';
import { parseJsonWithRepair } from '../../utils/jsonRepair';

export interface 图片生成结果 {
    图片URL?: string;
    本地路径?: string;
    原始响应?: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
}

export type 图片提示词装配结果 = {
    前置正向提示词: string;
    主体正向提示词: string;
    后置正向提示词: string;
    最终正向提示词: string;
    最终负向提示词: string;
    带内联负面提示词的正向提示词: string;
    尺寸: string;
    宽度: number;
    高度: number;
};

type 场景生成类型 = '场景快照' | '风景场景';
type NPC提示词选项 = {
    构图?: '头像' | '半身' | '立绘';
    画风?: 当前可用接口结构['画风'];
    额外要求?: string;
    后端类型?: 当前可用接口结构['图片后端类型'];
    启用画师串预设?: boolean;
    兼容模式?: boolean;
    风格提示词输入?: string;
    角色锚点?: {
        名称?: string;
        正面提示词: string;
        负面提示词?: string;
        结构化特征?: 角色锚点结构['结构化特征'];
    };
};
type NPC秘档部位提示词选项 = {
    部位: 香闺秘档部位类型;
    画风?: 当前可用接口结构['画风'];
    额外要求?: string;
    后端类型?: 当前可用接口结构['图片后端类型'];
    启用画师串预设?: boolean;
    兼容模式?: boolean;
    风格提示词输入?: string;
    角色锚点?: {
        名称?: string;
        正面提示词: string;
        负面提示词?: string;
        结构化特征?: 角色锚点结构['结构化特征'];
    };
};
type 分词器任务类型 = '角色' | '场景' | '部位特写';

const 自动去水印负面提示词 = 'text, watermark, signature, username, logo, artist name, web address, url, copyright, subtitle';
const 默认NovelAI负面提示词 = 'photorealistic, realistic, 3d, rendering, unreal engine, octane render, real life, photography, bokeh, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, border, out of frame';
const 默认分词器AI角色提示词 = [
    '你是分词器大师。',
    '你的职责是把输入资料整理成稳定、可执行、可直接投喂图像模型的高质量提示词。',
    '请严格遵循系统层给定的角色、规则、任务和输出约束，围绕任务目标组织结果。'
].join('\n');

const 合并负面提示词片段 = (...parts: Array<string | undefined>): string => {
    const seen = new Set<string>();
    const items: string[] = [];
    parts.forEach((part) => {
        (part || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => {
                const key = item.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                items.push(item);
            });
    });
    return items.join(', ');
};

const blob转DataUrl = async (blob: Blob): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('读取图片数据失败'));
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
    });
};

const 清理末尾斜杠 = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const 规范化NovelAI基础地址 = (baseUrlRaw: string): string => {
    const trimmed = 清理末尾斜杠(baseUrlRaw || '');
    if (!trimmed) return trimmed;
    return trimmed.replace(/^https:\/\/novelai\.net(?=\/|$)/i, 'https://image.novelai.net');
};

const 需要使用本地NovelAI代理 = (baseUrlRaw: string): boolean => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    const isLocalDev = host === 'localhost' || host === '127.0.0.1';
    return isLocalDev && /https:\/\/image\.novelai\.net/i.test(baseUrlRaw || '');
};

const 构建图片端点 = (baseUrlRaw: string, customPathRaw?: string): string => {
    const normalizedBaseRaw = 规范化NovelAI基础地址(baseUrlRaw || '');
    const base = 清理末尾斜杠(normalizedBaseRaw || '');
    const customPath = (customPathRaw || '').trim();
    if (需要使用本地NovelAI代理(base)) {
        const targetPath = customPath
            ? (/^https?:\/\//i.test(customPath) ? new URL(customPath).pathname : (customPath.startsWith('/') ? customPath : `/${customPath}`))
            : '/ai/generate-image';
        return `/api/novelai${targetPath}`;
    }
    if (/^https?:\/\//i.test(customPath)) {
        return 清理末尾斜杠(customPath);
    }
    if (!base) return '';
    if (customPath) {
        const normalizedPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
        return `${base}${normalizedPath}`;
    }
    if (/\/images\/generations$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/images/generations`;
    return `${base}/v1/images/generations`;
};

const 推断图片Mime类型 = (fileName: string): string => {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/png';
};

const uint8数组转DataUrl = (bytes: Uint8Array, mimeType: string): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
};

const PNG签名 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const UTF8解码器 = new TextDecoder('utf-8');
const Latin1解码器 = new TextDecoder('iso-8859-1');

const 解码UTF8 = (bytes: Uint8Array): string => {
    try {
        return UTF8解码器.decode(bytes);
    } catch {
        return '';
    }
};

const 解码Latin1 = (bytes: Uint8Array): string => {
    try {
        return Latin1解码器.decode(bytes);
    } catch {
        return '';
    }
};

const 读取Null终止文本 = (bytes: Uint8Array, startIndex: number, decoder: (payload: Uint8Array) => string): { text: string; nextIndex: number } => {
    let endIndex = startIndex;
    while (endIndex < bytes.length && bytes[endIndex] !== 0) endIndex += 1;
    const text = decoder(bytes.subarray(startIndex, endIndex));
    return { text, nextIndex: Math.min(bytes.length, endIndex + 1) };
};

const 解压文本块 = (bytes: Uint8Array): Uint8Array => {
    if (!bytes.length) return bytes;
    try {
        return unzlibSync(bytes);
    } catch {
        return bytes;
    }
};

const 解析PNG文本块 = (type: string, data: Uint8Array): { key: string; value: string } | null => {
    if (!data.length) return null;
    if (type === 'tEXt') {
        const splitIndex = data.indexOf(0);
        if (splitIndex <= 0) return null;
        const key = 解码Latin1(data.subarray(0, splitIndex)).trim();
        const value = 解码Latin1(data.subarray(splitIndex + 1)).trim();
        if (!key) return null;
        return { key, value };
    }
    if (type === 'zTXt') {
        const splitIndex = data.indexOf(0);
        if (splitIndex <= 0 || splitIndex + 2 > data.length) return null;
        const key = 解码Latin1(data.subarray(0, splitIndex)).trim();
        const compressed = data.subarray(splitIndex + 2);
        const value = 解码Latin1(解压文本块(compressed)).trim();
        if (!key) return null;
        return { key, value };
    }
    if (type === 'iTXt') {
        const keywordPart = 读取Null终止文本(data, 0, 解码Latin1);
        if (!keywordPart.text) return null;
        const compressionFlag = data[keywordPart.nextIndex] || 0;
        const compressionMethod = data[keywordPart.nextIndex + 1] || 0;
        let cursor = keywordPart.nextIndex + 2;
        const languagePart = 读取Null终止文本(data, cursor, 解码Latin1);
        cursor = languagePart.nextIndex;
        const translatedPart = 读取Null终止文本(data, cursor, 解码UTF8);
        cursor = translatedPart.nextIndex;
        const rawText = data.subarray(cursor);
        const decodedText = compressionFlag === 1 && compressionMethod === 0
            ? 解码UTF8(解压文本块(rawText))
            : 解码UTF8(rawText);
        return { key: keywordPart.text.trim(), value: decodedText.trim() };
    }
    return null;
};

const 遍历PNG数据块 = (
    pngBytes: Uint8Array,
    visitor: (params: { type: string; data: Uint8Array; length: number; dataStart: number; dataEnd: number }) => boolean | void
): boolean => {
    if (pngBytes.length < PNG签名.length) return false;
    for (let i = 0; i < PNG签名.length; i += 1) {
        if (pngBytes[i] !== PNG签名[i]) return false;
    }
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
    let offset = PNG签名.length;
    while (offset + 8 <= pngBytes.length) {
        const length = view.getUint32(offset);
        const typeBytes = pngBytes.subarray(offset + 4, offset + 8);
        const type = String.fromCharCode(...Array.from(typeBytes));
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd > pngBytes.length) return false;
        const shouldStop = visitor({
            type,
            data: pngBytes.subarray(dataStart, dataEnd),
            length,
            dataStart,
            dataEnd
        });
        if (shouldStop === true) return true;
        offset = dataEnd + 4;
    }
    return true;
};

const 解析PNG文本元数据 = (pngBytes: Uint8Array): Record<string, string> => {
    const result: Record<string, string> = {};
    遍历PNG数据块(pngBytes, ({ type, data }) => {
        if (type !== 'tEXt' && type !== 'zTXt' && type !== 'iTXt') return;
        const parsed = 解析PNG文本块(type, data);
        if (!parsed?.key) return;
        const existing = result[parsed.key];
        result[parsed.key] = existing ? `${existing}\n${parsed.value}` : parsed.value;
    });
    return result;
};

const 提取PNG指定块列表 = (pngBytes: Uint8Array, targetType: string): Uint8Array[] => {
    const chunks: Uint8Array[] = [];
    遍历PNG数据块(pngBytes, ({ type, data }) => {
        if (type === targetType) {
            chunks.push(data.slice());
        }
    });
    return chunks;
};

const 读取元数据字段 = (map: Record<string, string>, keys: string[]): string => {
    for (const key of keys) {
        const direct = map[key];
        if (direct && direct.trim()) return direct.trim();
        const lower = Object.entries(map).find(([k]) => k.toLowerCase() === key.toLowerCase());
        if (lower?.[1]) return lower[1].trim();
    }
    return '';
};

const TIFF字段类型字节数: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    9: 4,
    10: 8
};

const 读取Exif字段原始字节 = (view: DataView, entryOffset: number, type: number, count: number, littleEndian: boolean): Uint8Array | null => {
    const unitSize = TIFF字段类型字节数[type];
    if (!unitSize || !Number.isFinite(count) || count <= 0) return null;
    const totalSize = unitSize * count;
    if (!Number.isFinite(totalSize) || totalSize <= 0) return null;
    if (totalSize <= 4) {
        return new Uint8Array(view.buffer.slice(
            view.byteOffset + entryOffset + 8,
            view.byteOffset + entryOffset + 8 + totalSize
        ));
    }
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
    if (valueOffset + totalSize > view.byteLength) return null;
    return new Uint8Array(view.buffer.slice(
        view.byteOffset + valueOffset,
        view.byteOffset + valueOffset + totalSize
    ));
};

const 解码ExifUserComment = (bytes: Uint8Array, littleEndian: boolean): string => {
    if (!bytes.length) return '';
    if (bytes.length >= 8) {
        const prefix = 解码Latin1(bytes.subarray(0, 8));
        const payload = bytes.subarray(8);
        if (prefix === 'ASCII\u0000\u0000\u0000') {
            return 解码Latin1(payload).replace(/\0+$/g, '').trim();
        }
        if (prefix === 'UNICODE\u0000') {
            try {
                const decoder = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be');
                return decoder.decode(payload).replace(/\0+$/g, '').trim();
            } catch {
                return 解码UTF8(payload).replace(/\0+$/g, '').trim();
            }
        }
        if (prefix === 'JIS\u0000\u0000\u0000\u0000\u0000') {
            return 解码Latin1(payload).replace(/\0+$/g, '').trim();
        }
    }
    return 解码UTF8(bytes).replace(/\0+$/g, '').trim() || 解码Latin1(bytes).replace(/\0+$/g, '').trim();
};

const 解析单个ExifIFD = (
    view: DataView,
    ifdOffset: number,
    littleEndian: boolean,
    sink: Record<string, string>,
    visited: Set<number>
): void => {
    if (!Number.isFinite(ifdOffset) || ifdOffset < 0 || ifdOffset + 2 > view.byteLength || visited.has(ifdOffset)) return;
    visited.add(ifdOffset);
    const entryCount = view.getUint16(ifdOffset, littleEndian);
    for (let i = 0; i < entryCount; i += 1) {
        const entryOffset = ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        const type = view.getUint16(entryOffset + 2, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        if (tag === 0x8769 || tag === 0x8825) {
            const childOffset = view.getUint32(entryOffset + 8, littleEndian);
            解析单个ExifIFD(view, childOffset, littleEndian, sink, visited);
            continue;
        }
        const rawBytes = 读取Exif字段原始字节(view, entryOffset, type, count, littleEndian);
        if (!rawBytes?.length) continue;
        if (tag === 0x010E && !sink.ImageDescription) {
            const value = (type === 2 ? 解码Latin1(rawBytes) : 解码UTF8(rawBytes)).replace(/\0+$/g, '').trim();
            if (value) sink.ImageDescription = value;
            continue;
        }
        if (tag === 0x9286 && !sink.UserComment) {
            const value = 解码ExifUserComment(rawBytes, littleEndian);
            if (value) sink.UserComment = value;
            continue;
        }
        if (tag === 0x9C9C && !sink.XPComment) {
            try {
                const value = new TextDecoder('utf-16le').decode(rawBytes).replace(/\0+$/g, '').trim();
                if (value) sink.XPComment = value;
            } catch {
                // ignore malformed XPComment
            }
        }
    }
    const nextIfdPointerOffset = ifdOffset + 2 + entryCount * 12;
    if (nextIfdPointerOffset + 4 <= view.byteLength) {
        const nextIfdOffset = view.getUint32(nextIfdPointerOffset, littleEndian);
        if (nextIfdOffset > 0) {
            解析单个ExifIFD(view, nextIfdOffset, littleEndian, sink, visited);
        }
    }
};

const 解析PNGExif元数据 = (pngBytes: Uint8Array): Record<string, string> => {
    const exifChunks = 提取PNG指定块列表(pngBytes, 'eXIf');
    if (!exifChunks.length) return {};
    const result: Record<string, string> = {};
    for (const chunk of exifChunks) {
        if (!chunk?.length || chunk.length < 8) continue;
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        const byteOrder = view.getUint16(0, false);
        const littleEndian = byteOrder === 0x4949;
        const bigEndian = byteOrder === 0x4d4d;
        if (!littleEndian && !bigEndian) continue;
        if (view.getUint16(2, littleEndian) !== 42) continue;
        const firstIfdOffset = view.getUint32(4, littleEndian);
        const sink: Record<string, string> = {};
        解析单个ExifIFD(view, firstIfdOffset, littleEndian, sink, new Set<number>());
        if (sink.ImageDescription && !result.Description) {
            result.Description = sink.ImageDescription;
        }
        if (sink.UserComment && !result.Comment) {
            result.Comment = sink.UserComment;
        } else if (sink.XPComment && !result.Comment) {
            result.Comment = sink.XPComment;
        }
        Object.entries(sink).forEach(([key, value]) => {
            if (!value) return;
            if (!result[key]) {
                result[key] = value;
            }
        });
    }
    return result;
};

const 提取平衡JSON对象 = (text: string, startIndex: number): string => {
    if (!text || startIndex < 0 || text[startIndex] !== '{') return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIndex; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') {
            depth += 1;
            continue;
        }
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return text.slice(startIndex, i + 1);
            }
        }
    }
    return '';
};

const NovelAI隐写PNG魔术字符串 = 'stealth_pngcomp';
const NovelAI隐写PNG最大像素数 = 4096 * 4096;

const 从PNG隐写Alpha提取NovelAI文本 = async (blob: Blob): Promise<string> => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return '';
    let objectUrl = '';
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('加载 PNG 图像失败'));
            objectUrl = URL.createObjectURL(blob);
            img.src = objectUrl;
        });

        if (!image.width || !image.height) return '';
        if (image.width * image.height > NovelAI隐写PNG最大像素数) return '';

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '';
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const alphaLsb = new Uint8Array(image.width * image.height);
        for (let pixelIndex = 0; pixelIndex < alphaLsb.length; pixelIndex += 1) {
            alphaLsb[pixelIndex] = imageData.data[pixelIndex * 4 + 3] & 1;
        }

        let bitOffset = 0;
        const nextByte = (): number | null => {
            if (bitOffset + 8 > alphaLsb.length) return null;
            let byte = 0;
            for (let i = 0; i < 8; i += 1) {
                const convertedOffset = (bitOffset % image.height) * image.width + Math.floor(bitOffset / image.height);
                if (convertedOffset >= alphaLsb.length) return null;
                byte |= alphaLsb[convertedOffset] << (7 - i);
                bitOffset += 1;
            }
            return byte;
        };

        const magicBytes = new Uint8Array(NovelAI隐写PNG魔术字符串.length);
        for (let i = 0; i < magicBytes.length; i += 1) {
            const value = nextByte();
            if (value === null) return '';
            magicBytes[i] = value;
        }
        if (解码Latin1(magicBytes) !== NovelAI隐写PNG魔术字符串) return '';

        const sizeBytes = new Uint8Array(4);
        for (let i = 0; i < 4; i += 1) {
            const value = nextByte();
            if (value === null) return '';
            sizeBytes[i] = value;
        }
        const compressedBitSize = new DataView(sizeBytes.buffer).getUint32(0, false);
        if (!Number.isFinite(compressedBitSize) || compressedBitSize <= 0 || compressedBitSize % 8 !== 0) return '';
        const compressedByteSize = compressedBitSize / 8;
        const compressedBytes = new Uint8Array(compressedByteSize);
        for (let i = 0; i < compressedByteSize; i += 1) {
            const value = nextByte();
            if (value === null) return '';
            compressedBytes[i] = value;
        }

        const decompressed = decompressSync(compressedBytes);
        return 解码UTF8(decompressed).trim();
    } catch {
        return '';
    } finally {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
};

const 从PNG原始字节搜索NovelAI元数据 = (pngBytes: Uint8Array): {
    正面提示词: string;
    负面提示词: string;
    参数?: PNG解析参数结构;
    原始元数据: string;
} | null => {
    const rawText = 解码Latin1(pngBytes);
    if (!rawText) return null;
    const markerCandidates = [
        '"request_type":"PromptGenerateRequest"',
        '"request_type": "PromptGenerateRequest"',
        '"signed_hash"',
        '"v4_negative_prompt"',
        '"extra_passthrough_testing"'
    ];
    for (const marker of markerCandidates) {
        const markerIndex = rawText.indexOf(marker);
        if (markerIndex < 0) continue;
        let braceIndex = rawText.lastIndexOf('{', markerIndex);
        let attempts = 0;
        while (braceIndex >= 0 && attempts < 12) {
            const candidate = 提取平衡JSON对象(rawText, braceIndex);
            if (candidate) {
                const parsed = 解析NovelAI注释JSON(candidate);
                if (parsed?.正面提示词) {
                    return {
                        正面提示词: parsed.正面提示词,
                        负面提示词: parsed.负面提示词,
                        参数: parsed.参数,
                        原始元数据: candidate
                    };
                }
            }
            braceIndex = rawText.lastIndexOf('{', braceIndex - 1);
            attempts += 1;
        }
    }
    return null;
};

const 尝试解析NovelAI注释文本 = (rawText: string): {
    正面提示词: string;
    负面提示词: string;
    参数?: PNG解析参数结构;
} | null => {
    const direct = 解析NovelAI注释JSON(rawText);
    if (direct) return direct;
    if (!rawText) return null;
    const firstBrace = rawText.indexOf('{');
    if (firstBrace < 0) return null;
    const candidate = 提取平衡JSON对象(rawText, firstBrace);
    return candidate ? 解析NovelAI注释JSON(candidate) : null;
};

const 提取LoRA列表 = (text: string): PNG解析参数结构['LoRA列表'] => {
    const matches = Array.from((text || '').matchAll(/<lora:([^:>]+)(?::([\d.]+))?>/gi));
    if (!matches.length) return undefined;
    const items: Array<{ 名称: string; 权重?: number }> = [];
    for (const match of matches) {
        const name = (match?.[1] || '').trim();
        if (!name) continue;
        const weightRaw = match?.[2];
        const weight = weightRaw ? Number(weightRaw) : undefined;
        items.push({
            名称: name,
            权重: Number.isFinite(weight) ? weight : undefined
        });
    }
    return items.length ? items : undefined;
};

const 读取有限数字 = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const 读取布尔值 = (value: unknown): boolean | undefined => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return undefined;
};

const 读取字符串值 = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const 读取V4提示结构 = (value: unknown): PNG解析参数结构['V4正向提示'] | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const caption = source.caption && typeof source.caption === 'object' ? source.caption as Record<string, unknown> : null;
    const characterCaptions = Array.isArray(caption?.char_captions)
        ? caption?.char_captions.filter((item): item is string | Record<string, unknown> => (
            (typeof item === 'string' && item.trim().length > 0)
            || Boolean(item) && typeof item === 'object'
        ))
        : [];
    const result = {
        useCoords: 读取布尔值(source.use_coords),
        useOrder: 读取布尔值(source.use_order),
        legacyUc: 读取布尔值(source.legacy_uc),
        characterCaptions: characterCaptions.length ? characterCaptions : undefined
    };
    return Object.values(result).some((item) => item !== undefined) ? result : undefined;
};

const 归一化NAI角色Caption首项 = (text: string): string => {
    const cleaned = 清理生图词组输出(text);
    if (!cleaned) return '';
    const tokens = 去重提示词片段(按逗号拆分提示词(cleaned));
    if (tokens.length <= 0) return '';
    const [first, ...rest] = tokens;
    const normalizedFirst = (() => {
        const source = (first || '').trim().toLowerCase();
        if (source === '1girl') return 'girl';
        if (source === '1boy') return 'boy';
        if (source === '1woman') return 'woman';
        if (source === '1man') return 'man';
        return first;
    })();
    return 去重提示词片段([normalizedFirst, ...rest]).join(', ');
};

const 是NAIV4角色起始Token = (token: string): boolean => {
    const normalized = (token || '').trim().toLowerCase();
    return /^(?:1girl|1boy|1woman|1man|girl|boy|woman|man)$/i.test(normalized);
};

const 看起来像NAIV4角色段 = (text: string): boolean => {
    const source = 清理生图词组输出(text).toLowerCase();
    if (!source) return false;
    return (
        /\b(?:1girl|1boy|1woman|1man|girl|boy|woman|man)\b/.test(source)
        && (
            /\(\s*placement\s*:/.test(source)
            || /\bsolo\b/.test(source)
            || /\b(?:sitting|standing|leaning|holding|looking|whispering|smirk|expression|posture)\b/.test(source)
        )
    );
};

const 拆分NAIV4基础与首角色 = (text: string): { baseCaption: string; firstCharacterCaption: string } => {
    const cleaned = 清理生图词组输出(text);
    if (!cleaned) {
        return {
            baseCaption: '',
            firstCharacterCaption: ''
        };
    }
    const tokens = 去重提示词片段(按逗号拆分提示词(cleaned));
    if (tokens.length <= 0) {
        return {
            baseCaption: '',
            firstCharacterCaption: ''
        };
    }
    const roleStartIndex = tokens.findIndex((token) => 是NAIV4角色起始Token(token));
    if (roleStartIndex <= 0) {
        return {
            baseCaption: cleaned,
            firstCharacterCaption: ''
        };
    }
    const baseCaption = tokens.slice(0, roleStartIndex).join(', ').trim();
    const firstCharacterCaption = tokens.slice(roleStartIndex).join(', ').trim();
    return {
        baseCaption,
        firstCharacterCaption
    };
};

const 拆分NAIV4提示结构 = (prompt: string): {
    inputPrompt: string;
    baseCaption: string;
    characterCaptions: string[];
} => {
    const source = (prompt || '').trim();
    if (!source || !/\|/.test(source)) {
        return {
            inputPrompt: source,
            baseCaption: source,
            characterCaptions: []
        };
    }
    const segments = source
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
    if (segments.length <= 1) {
        return {
            inputPrompt: source,
            baseCaption: source,
            characterCaptions: []
        };
    }
    const [baseCaptionRaw, ...characterSegmentRaws] = segments;
    const shouldPromoteFirstSegmentToCharacter = characterSegmentRaws.length > 0 && 看起来像NAIV4角色段(baseCaptionRaw);
    const splitFirstSegment = shouldPromoteFirstSegmentToCharacter ? 拆分NAIV4基础与首角色(baseCaptionRaw) : null;
    const normalizedBaseCaption = 清理生图词组输出(splitFirstSegment?.baseCaption || baseCaptionRaw);
    const rawCharacterCaptions = [
        splitFirstSegment?.firstCharacterCaption || '',
        ...characterSegmentRaws
    ].filter(Boolean);
    const characterCaptions = rawCharacterCaptions
        .map((item) => 归一化NAI角色Caption首项(item))
        .filter(Boolean);
    const baseCaption = normalizedBaseCaption || (
        shouldPromoteFirstSegmentToCharacter
            ? 构建NAI基础人数标签(characterCaptions).join(', ')
            : ''
    );
    return {
        inputPrompt: baseCaption || source,
        baseCaption: baseCaption || source,
        characterCaptions
    };
};

const 规范化NAIV4角色Caption对象列表 = (
    source: Array<string | Record<string, unknown>> | undefined
): Array<Record<string, unknown>> => {
    const result = Array.isArray(source)
        ? source
            .map((item) => {
                if (typeof item === 'string') {
                    const charCaption = item.trim();
                    return charCaption ? { char_caption: charCaption } : null;
                }
                if (!item || typeof item !== 'object') return null;
                const normalized = { ...(item as Record<string, unknown>) };
                const rawCaption = typeof normalized.char_caption === 'string'
                    ? normalized.char_caption
                    : (typeof normalized.caption === 'string' ? normalized.caption : '');
                if (rawCaption && typeof normalized.char_caption !== 'string') {
                    normalized.char_caption = rawCaption;
                }
                return normalized;
            })
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
    if (result.length > 0) return result;
    return [];
};

const 解析SD参数文本 = (rawText: string): {
    正面提示词: string;
    负面提示词: string;
    参数?: PNG解析参数结构;
} => {
    const lines = (rawText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const metaLineIndex = lines.findIndex((line) => /Steps\s*:\s*\d+/i.test(line) || /Sampler\s*:/i.test(line));
    const metaLine = metaLineIndex >= 0 ? lines[metaLineIndex] : '';
    const textLines = metaLineIndex >= 0 ? lines.slice(0, metaLineIndex) : lines;
    const negativeIndex = textLines.findIndex((line) => /^negative prompt\s*:/i.test(line));
    const 正面提示词 = negativeIndex >= 0
        ? textLines.slice(0, negativeIndex).join('\n').trim()
        : textLines.join('\n').trim();
    const 负面提示词 = negativeIndex >= 0
        ? textLines.slice(negativeIndex).join('\n').replace(/^negative prompt\s*:/i, '').trim()
        : '';

    const metaPairs: Record<string, string> = {};
    if (metaLine) {
        metaLine.replace(/([^:]+):\s*([^,]+)(?:,|$)/g, (_, key, value) => {
            const normalizedKey = String(key || '').trim();
            if (normalizedKey) {
                metaPairs[normalizedKey] = String(value || '').trim();
            }
            return '';
        });
    }

    const readMeta = (patterns: RegExp[]): string => {
        const entry = Object.entries(metaPairs).find(([key]) => patterns.some((pattern) => pattern.test(key)));
        return entry?.[1]?.trim() || '';
    };

    const 解析参数: PNG解析参数结构 = {
        采样器: readMeta([/^Sampler$/i, /^Sampler name$/i, /^Sampler_name$/i]) || undefined,
        步数: (() => {
            const steps = Number(readMeta([/^Steps$/i]));
            return Number.isFinite(steps) ? Math.floor(steps) : undefined;
        })(),
        CFG强度: (() => {
            const cfg = Number(readMeta([/^CFG scale$/i, /^CFG$/i]));
            return Number.isFinite(cfg) ? cfg : undefined;
        })(),
        ClipSkip: (() => {
            const clip = Number(readMeta([/^Clip skip$/i, /^ClipSkip$/i]));
            return Number.isFinite(clip) ? Math.floor(clip) : undefined;
        })(),
        模型: readMeta([/^Model$/i, /^Model name$/i]) || undefined,
        LoRA列表: 提取LoRA列表(正面提示词)
    };

    const hiresScale = Number(readMeta([/^Hires upscale$/i]));
    const hiresSteps = Number(readMeta([/^Hires steps$/i]));
    const hiresDenoise = Number(readMeta([/^Denoising strength$/i]));
    const hiresUpscaler = readMeta([/^Hires upscaler$/i]);
    if (Number.isFinite(hiresScale) || Number.isFinite(hiresSteps) || Number.isFinite(hiresDenoise) || hiresUpscaler) {
        解析参数.Hires修复 = {
            放大倍数: Number.isFinite(hiresScale) ? hiresScale : undefined,
            步数: Number.isFinite(hiresSteps) ? Math.floor(hiresSteps) : undefined,
            放大器: hiresUpscaler || undefined,
            去噪强度: Number.isFinite(hiresDenoise) ? hiresDenoise : undefined
        };
    }

    const adetailerModel = readMeta([/^ADetailer model/i, /^ADetailer\s*model/i]);
    const adetailerPrompt = readMeta([/^ADetailer prompt/i, /^ADetailer\s*prompt/i]);
    const adetailerNegPrompt = readMeta([/^ADetailer negative prompt/i, /^ADetailer\s*negative prompt/i]);
    if (adetailerModel || adetailerPrompt || adetailerNegPrompt) {
        解析参数.ADetailer = {
            模型: adetailerModel || undefined,
            正向提示词: adetailerPrompt || undefined,
            负向提示词: adetailerNegPrompt || undefined
        };
    }

    return {
        正面提示词,
        负面提示词,
        参数: 解析参数
    };
};

const 解析NovelAI注释JSON = (rawText: string): {
    正面提示词: string;
    负面提示词: string;
    参数?: PNG解析参数结构;
} | null => {
    if (!rawText) return null;
    let parsed: any = null;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const 正面提示词 = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
    const 负面提示词 = typeof parsed.uc === 'string' ? parsed.uc.trim() : (typeof parsed.negative_prompt === 'string' ? parsed.negative_prompt.trim() : '');
    if (!正面提示词 && !负面提示词) return null;
    const sampler = typeof parsed.sampler === 'string' ? parsed.sampler.trim() : '';
    const steps = Number(parsed.steps);
    const cfg = Number(parsed.scale ?? parsed.cfg_scale ?? parsed.cfg);
    const clip = Number(parsed.clip_skip ?? parsed.clipSkip);
    const model = typeof parsed.model === 'string' ? parsed.model.trim() : '';
    const params: PNG解析参数结构 = {
        采样器: sampler || undefined,
        噪声计划: 读取字符串值(parsed.noise_schedule) || undefined,
        步数: Number.isFinite(steps) ? Math.floor(steps) : undefined,
        CFG强度: Number.isFinite(cfg) ? cfg : undefined,
        CFG重缩放: 读取有限数字(parsed.cfg_rescale ?? parsed.prompt_guidance_rescale),
        反向提示引导强度: 读取有限数字(parsed.uncond_scale),
        ClipSkip: Number.isFinite(clip) ? Math.floor(clip) : undefined,
        宽度: (() => {
            const width = 读取有限数字(parsed.width);
            return typeof width === 'number' && Number.isFinite(width) ? Math.floor(width) : undefined;
        })(),
        高度: (() => {
            const height = 读取有限数字(parsed.height);
            return typeof height === 'number' && Number.isFinite(height) ? Math.floor(height) : undefined;
        })(),
        随机种子: (() => {
            const seed = 读取有限数字(parsed.seed);
            return typeof seed === 'number' && Number.isFinite(seed) ? Math.floor(seed) : undefined;
        })(),
        SMEA: 读取布尔值(parsed.sm),
        SMEA动态: 读取布尔值(parsed.sm_dyn),
        动态阈值: 读取布尔值(parsed.dynamic_thresholding),
        动态阈值百分位: 读取有限数字(parsed.dynamic_thresholding_percentile),
        动态阈值模拟CFG: 读取有限数字(parsed.dynamic_thresholding_mimic_scale),
        高Sigma跳过CFG: 读取有限数字(parsed.skip_cfg_above_sigma),
        低Sigma跳过CFG: 读取有限数字(parsed.skip_cfg_below_sigma),
        偏好布朗噪声: 读取布尔值(parsed.prefer_brownian),
        Euler祖先采样Bug兼容: 读取布尔值(parsed.deliberate_euler_ancestral_bug),
        精细细节增强: 读取布尔值(parsed.explike_fine_detail),
        最小化Sigma无穷: 读取布尔值(parsed.minimize_sigma_inf),
        模型: model || undefined,
        V4正向提示: 读取V4提示结构(parsed.v4_prompt),
        V4负向提示: 读取V4提示结构(parsed.v4_negative_prompt),
        原始参数: JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>,
        LoRA列表: 提取LoRA列表(正面提示词)
    };
    return {
        正面提示词,
        负面提示词,
        参数: params
    };
};

export type PNG元数据解析结果 = {
    来源: PNG画风预设来源类型;
    正面提示词: string;
    负面提示词: string;
    参数?: PNG解析参数结构;
    原始元数据: string;
    元数据标签?: Record<string, string>;
};

export const 解析PNG字节元数据 = (pngBytes: Uint8Array, 额外NovelAI注释文本 = ''): PNG元数据解析结果 => {
    const 标签映射 = {
        ...解析PNGExif元数据(pngBytes),
        ...解析PNG文本元数据(pngBytes)
    };
    const parametersText = 读取元数据字段(标签映射, ['parameters', 'Parameters']);
    const commentText = 读取元数据字段(标签映射, ['comment', 'Comment', 'UserComment', 'XPComment']);
    const descriptionText = 读取元数据字段(标签映射, ['description', 'Description', 'ImageDescription']);

    const novelAiCandidates = [commentText, 额外NovelAI注释文本].filter((item): item is string => Boolean(item && item.trim()));
    for (const candidate of novelAiCandidates) {
        const novelAiParsed = 尝试解析NovelAI注释文本(candidate);
        if (!novelAiParsed) continue;
        return {
            来源: 'novelai',
            正面提示词: novelAiParsed.正面提示词 || descriptionText || '',
            负面提示词: novelAiParsed.负面提示词 || '',
            参数: novelAiParsed.参数,
            原始元数据: candidate || descriptionText || JSON.stringify(标签映射, null, 2),
            元数据标签: Object.keys(标签映射).length > 0 ? 标签映射 : undefined
        };
    }

    const rawNovelAiParsed = 从PNG原始字节搜索NovelAI元数据(pngBytes);
    if (rawNovelAiParsed) {
        return {
            来源: 'novelai',
            正面提示词: rawNovelAiParsed.正面提示词 || descriptionText || '',
            负面提示词: rawNovelAiParsed.负面提示词 || '',
            参数: rawNovelAiParsed.参数,
            原始元数据: rawNovelAiParsed.原始元数据 || commentText || descriptionText || JSON.stringify(标签映射, null, 2),
            元数据标签: Object.keys(标签映射).length > 0 ? 标签映射 : undefined
        };
    }

    if (parametersText) {
        const parsed = 解析SD参数文本(parametersText);
        return {
            来源: 'sd_webui',
            正面提示词: parsed.正面提示词,
            负面提示词: parsed.负面提示词,
            参数: parsed.参数,
            原始元数据: parametersText,
            元数据标签: Object.keys(标签映射).length > 0 ? 标签映射 : undefined
        };
    }

    const fallbackPrompt = descriptionText || commentText || '';
    return {
        来源: 'unknown',
        正面提示词: fallbackPrompt,
        负面提示词: '',
        参数: fallbackPrompt ? { LoRA列表: 提取LoRA列表(fallbackPrompt) } : undefined,
        原始元数据: fallbackPrompt || JSON.stringify(标签映射, null, 2),
        元数据标签: Object.keys(标签映射).length > 0 ? 标签映射 : undefined
    };
};

export const 解析PNG文件元数据 = async (file: File): Promise<PNG元数据解析结果> => {
    const buffer = await file.arrayBuffer();
    const pngBytes = new Uint8Array(buffer);
    const stealthNovelAiText = await 从PNG隐写Alpha提取NovelAI文本(file);
    return 解析PNG字节元数据(pngBytes, stealthNovelAiText);
};

export type PNG画风提炼结果 = {
    画师串: string;
    原始正面提示词: string;
    剥离后正面提示词: string;
    AI提炼正面提示词: string;
    正面提示词: string;
    负面提示词: string;
    画师命中项: string[];
    说明?: string;
};

export type 角色锚点提取结果 = {
    名称: string;
    正面提示词: string;
    负面提示词: string;
    结构化特征?: 角色锚点结构['结构化特征'];
    说明?: string;
};

type 结构化角色词组片段 = {
    名称: string;
    内容: string;
};

type 结构化词组结果 = {
    基础: string;
    角色列表: 结构化角色词组片段[];
};

type 场景角色锚点输入 = {
    名称: string;
    正面提示词: string;
    负面提示词?: string;
    结构化特征?: 角色锚点结构['结构化特征'];
};

const 角色锚点提示词含有效片段 = (text: string): boolean => (
    (text || '')
        .split(',')
        .map((item) => item.trim())
        .some((item) => item.length > 0 && /[\p{L}\p{N}]/u.test(item))
);

const 角色锚点结构化特征含有效内容 = (features?: 角色锚点结构['结构化特征']): boolean => {
    if (!features || typeof features !== 'object') return false;
    return Object.values(features).some((value) => (
        Array.isArray(value)
        && value.some((item) => typeof item === 'string' && item.trim().length > 0)
    ));
};

const 角色锚点提取结果含有效内容 = (result?: 角色锚点提取结果 | null): boolean => (
    Boolean(result) && (
        角色锚点提示词含有效片段(result?.正面提示词 || '')
        || 角色锚点结构化特征含有效内容(result?.结构化特征)
    )
);

const 从提示词中移除角色名称片段 = (text: string, displayName?: string): string => {
    const source = (text || '').trim();
    const normalizedDisplayName = (displayName || '').trim();
    if (!source || !normalizedDisplayName) return source;
    const escaped = normalizedDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokens = 按逗号拆分提示词(source);
    if (tokens.length <= 0) return source;
    const filtered = tokens.filter((token) => {
        const trimmed = token.trim();
        if (!trimmed) return false;
        return !new RegExp(escaped, 'iu').test(trimmed);
    });
    return filtered.join(', ');
};

const 从结构化特征中移除角色名称片段 = (
    features: 角色锚点结构['结构化特征'] | undefined,
    displayName?: string
): 角色锚点结构['结构化特征'] | undefined => {
    if (!features || typeof features !== 'object') return undefined;
    const normalizedDisplayName = (displayName || '').trim();
    const entries = Object.entries(features).map(([key, value]) => {
        if (!Array.isArray(value)) return [key, value] as const;
        if (!normalizedDisplayName) return [key, value] as const;
        const next = value
            .map((item) => String(item || '').trim())
            .filter((item) => item && !new RegExp(normalizedDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu').test(item));
        return [key, next] as const;
    });
    const normalized = Object.fromEntries(entries) as 角色锚点结构['结构化特征'];
    return 角色锚点结构化特征含有效内容(normalized) ? normalized : undefined;
};

export const 净化PNG复刻参数 = (params?: PNG解析参数结构): PNG解析参数结构 | undefined => {
    if (!params) return undefined;
    const sanitized: PNG解析参数结构 = {
        ...params,
        宽度: undefined,
        高度: undefined,
        随机种子: undefined
    };
    return Object.values(sanitized).some((value) => value !== undefined) ? sanitized : undefined;
};

export const 提炼PNG画风标签 = async (
    payload: PNG元数据解析结果,
    apiConfig: 当前可用接口结构,
    options?: { signal?: AbortSignal; 额外要求?: string }
): Promise<PNG画风提炼结果> => {
    const artistSplit = 本地拆分画师标签(payload.正面提示词 || '');
    const 原始正面提示词 = (payload.正面提示词 || '').trim();
    const 剥离后正面提示词 = (artistSplit.剩余正面提示词 || '').trim();
    const 画师串 = (artistSplit.画师串 || '').trim();
    const 画师命中项 = artistSplit.画师命中项.slice();
    const systemPrompt = [
        '你是 PNG 风格正面提示词清洗器。',
        '你收到的输入已经去掉画师标签。你的任务是从剩余正面提示词中保守剔除主体污染，只保留可长期复用的风格信息。',
        '目标不是重写提示词，而是从现有提示词中筛出“跨角色、跨场景仍然成立”的风格层内容。',
        '你的工作本质上是保守删除，不是自由改写。默认保留；只有在明确属于主体、构图、场景、剧情或单次镜头内容时才允许删除。',
        '请保留这几类信息：质量串、画风介质、渲染流派、笔触或材质、色彩倾向、光照风格、年代感、审美标签、官方图/插画标签、摄影或镜头质感标签、整体氛围标签、风格 LoRA/embedding。',
        '请优先保留示例：masterpiece, best quality, official art, anime style, realistic skin texture, oil painting, watercolor, ink wash, cinematic lighting, photorealistic, volumetric lighting, film look, painterly, cel shading, analog film grain, <lora:...>。',
        '请删除这几类信息：固定 IP 名、角色名、人物身份与性别、人物数量、外貌、年龄、表情、视线、姿势、发型、发色、瞳色、服装主体、地点、建筑或道具主体、具体动作、剧情状态、镜头景别、构图描述、身体部位描写。',
        '请特别删除“只对当前主体成立”的信息，例如：1girl, solo, upper body, looking at viewer, sword in hand, red dress, temple courtyard, night rain, close-up, fighting stance。',
        '如果一个提示词同时包含风格与主体信息，除非主体信息占主导且无法拆分，否则优先保留整项，避免误删风格信息。',
        '例如：official art, cinematic lighting, watercolor texture, painterly shading, dramatic contrast, volumetric lighting 这类风格项应优先保留。',
        '例如：young woman, black hair, amber eyes, hanfu, in a bamboo forest, low angle, close-up, holding sword 这类主体或镜头项应删除。',
        'positivePrompt 必须直接由输入正面提示词删除若干项后得到，保持原始结构和原始表达，不要重写成另一套新提示词。',
        'positivePrompt 中的每一项都必须直接拷贝自输入正面提示词，按逗号分隔项完整保留。',
        '任何形如“1.2::token::”“0.8::tag::”“1.63::photo(medium)::”的强度提示词，都按完整单元原样保留。',
        '任何形如“(tag:1.3)”“((tag))”“[tag]”“{tag}”“{{tag}}”“<lora:name:0.6>”的语法结构，都必须把整项当作一个完整提示词处理；若保留就整项原样保留，若删除也必须整项删除。',
        '保持原始顺序。对部分模型与前置质量串来说，顺序本身有意义。',
        '保持转义字符与字面量写法，例如“\\,”、“\\(”、“\\[”、“\\\\”都按原样保留。',
        '每个逗号分隔项都视为一个完整提示词单元，按完整单元处理。',
        '对于重复但具有权重意义的质量串或风格串，按原样保留，不要擅自去重到改变风格重心。',
        '若无法确定一个词是否属于主体污染，默认保留，保证清洗过程克制、稳定、可追溯。',
        '必须输出 JSON，字段：positivePrompt, notes。',
        'positivePrompt：删减后的完整正面提示词；notes：简短说明删除了哪些主体污染类别。',
        '若输入正面提示词不足，保持字段为空字符串。'
    ].join('\n');

    const normalizedExtraRequirement = (options?.额外要求 || '').trim();
    const taskPayload = {
        正面提示词: 剥离后正面提示词,
        ...(normalizedExtraRequirement ? { 额外要求: normalizedExtraRequirement } : {})
    };

    const 规范化模糊匹配文本 = (text: string): string => (
        (text || '')
            .trim()
            .toLowerCase()
            .replace(/^\d+(?:\.\d+)?::/g, '')
            .replace(/::$/g, '')
            .replace(/^[:\s]+|[:\s]+$/g, '')
            .replace(/^[([{<]+|[)\]}>]+$/g, '')
            .replace(/[()[\]{}<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );

    const 用原始提示词模糊补全 = (candidatePrompt: string, sourcePrompt: string): string => {
        const candidateTokens = 本地拆分画师标签(candidatePrompt).剩余Tokens;
        const sourceTokens = 本地拆分画师标签(sourcePrompt).剩余Tokens;
        if (candidateTokens.length === 0 || sourceTokens.length === 0) {
            return (candidatePrompt || '').trim();
        }

        const sourceIndex = sourceTokens.map((token) => ({
            raw: token,
            normalized: 规范化模糊匹配文本(token)
        })).filter((item) => item.normalized);

        const mapped = candidateTokens.map((token) => {
            const normalized = 规范化模糊匹配文本(token);
            if (!normalized) return token.trim();

            const exact = sourceIndex.find((item) => item.normalized === normalized);
            if (exact) return exact.raw.trim();

            const fuzzy = sourceIndex.find((item) => (
                item.normalized.includes(normalized)
                || normalized.includes(item.normalized)
            ));
            if (fuzzy) return fuzzy.raw.trim();

            return token.trim();
        }).filter(Boolean);

        const deduped: string[] = [];
        mapped.forEach((item) => {
            if (!deduped.includes(item)) deduped.push(item);
        });
        return deduped.join(', ');
    };

    if (!剥离后正面提示词) {
        return {
            画师串,
            原始正面提示词,
            剥离后正面提示词: '',
            AI提炼正面提示词: '',
            正面提示词: '',
            负面提示词: payload.负面提示词 || '',
            画师命中项
        };
    }

    const cotPseudoPrompt = 替换COT伪装身份占位(
        PNG解析COT伪装历史消息提示词.trim(),
        systemPrompt
    ).trim();
    const messages = 规范化文本补全消息链([
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: `【本次任务】\n请只根据以下 PNG 非 artist 正面提示词清洗可复用风格词：\n\n${JSON.stringify(taskPayload, null, 2)}` },
        { role: 'user', content: '开始任务' },
        ...(cotPseudoPrompt ? [{ role: 'assistant' as const, content: cotPseudoPrompt }] : [])
    ], { 保留System: true, 合并同角色: false });

    const raw = await 请求模型文本(apiConfig, messages, {
        temperature: 0.5,
        signal: options?.signal
    });

    try {
        const resultPayload = 提取最后一个标签文本(raw, '结果') || raw;
        const repaired = parseJsonWithRepair<any>(resultPayload);
        const parsed = repaired.value;
        if (!parsed || typeof parsed !== 'object') {
            throw new Error(repaired.error || 'PNG 画风提炼结果不是有效 JSON 对象');
        }
        const AI原始正面提示词 = typeof parsed.positivePrompt === 'string' ? parsed.positivePrompt.trim() : '';
        const AI提炼正面提示词 = 用原始提示词模糊补全(AI原始正面提示词, 剥离后正面提示词);
        const 说明 = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
        const 正面提示词 = AI提炼正面提示词 || 剥离后正面提示词;
        return {
            画师串,
            原始正面提示词,
            剥离后正面提示词,
            AI提炼正面提示词,
            正面提示词,
            负面提示词: payload.负面提示词 || '',
            画师命中项,
            说明
        };
    } catch {
        return {
            画师串,
            原始正面提示词,
            剥离后正面提示词,
            AI提炼正面提示词: '',
            正面提示词: 剥离后正面提示词,
            负面提示词: payload.负面提示词 || '',
            画师命中项,
            说明: raw.slice(0, 400)
        };
    }
};

export const 提取角色锚点提示词 = async (
    npcData: unknown,
    apiConfig: 当前可用接口结构,
    options?: { signal?: AbortSignal; 名称?: string; 额外要求?: string }
): Promise<角色锚点提取结果> => {
    const 原始资料 = JSON.stringify(npcData ?? {}, null, 2);
    const 显示名称 = (options?.名称 || '').trim() || '角色锚点';
    const systemPrompt = [
        '你是角色视觉锚点提取器。',
        '你的任务是从角色资料中提取可长期复用的稳定外观锚点，用于后续保持角色一致性。',
        '提取重点放在外貌、脸型、五官、发型、发色、瞳色、肤色、身材、胸部/罩杯、年龄感、常驻服装基底和长期可见特征。',
        '当资料缺少关键稳定外观时，可以依据身份、时代、气质和已有外貌描述做保守补全，优先选择常见、低冲突、容易长期保持一致的视觉表达。',
        '正面提示词要尽量完整，适合直接作为稳定角色锚点追加到图像模型。',
        '正面提示词只保留长期可见、长期稳定的视觉信息，让每个词都服务于持续复用。',
        '如果角色具有门派、职业、种族、血统、异色瞳、伤痕、纹身、泪痣、兽耳、角等长期可见特征，请结构化保留。',
        '如果角色资料包含多套装束，请选择最常驻、最核心、最能长期识别角色的那一套服装基底。',
        '提示词使用英文 tag 风格，按逗号分隔。',
        '提示词中直接写可见外观和可见身份道具，不写人名、称呼、IP 名称或剧情标签。',
        '负面提示词在资料明确给出长期需要规避的视觉特征时填写，否则保持空字符串。',
        '输出必须是 JSON，字段：positivePrompt, negativePrompt, features, notes。',
        'notes 用简短文字说明哪些内容来自保守补全。',
        'features 内字段固定为：外貌标签, 身材标签, 胸部标签, 发型标签, 发色标签, 眼睛标签, 肤色标签, 年龄感标签, 服装基底标签, 特殊特征标签。',
        '每个 features 字段都必须是字符串数组或空数组。',
        'positivePrompt 直接输出可用于生图的英文提示词。'
    ].join('\n');

    const taskPrompt = [
        '请根据以下角色资料提取角色视觉锚点。',
        options?.额外要求 ? `额外要求：${options.额外要求}` : '',
        '',
        原始资料
    ].filter(Boolean).join('\n');
    const cotPseudoPrompt = 替换COT伪装身份占位(
        角色锚点提取COT伪装历史消息提示词.trim(),
        systemPrompt
    ).trim();
    const messages = 规范化文本补全消息链([
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: `【本次任务】\n${taskPrompt}` },
        { role: 'user', content: '开始任务' },
        ...(cotPseudoPrompt ? [{ role: 'assistant' as const, content: cotPseudoPrompt }] : [])
    ], { 保留System: true, 合并同角色: false });

    const raw = await 请求模型文本(apiConfig, messages, {
        temperature: 0.5,
        responseFormat: 'json_object',
        signal: options?.signal
    });

    try {
        const repaired = parseJsonWithRepair<any>(raw);
        const parsed = repaired.value;
        if (!parsed || typeof parsed !== 'object') {
            throw new Error(repaired.error || '角色锚点提取结果不是有效 JSON 对象');
        }
        const 结构化特征 = {
            外貌标签: Array.isArray(parsed?.features?.外貌标签) ? parsed.features.外貌标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            身材标签: Array.isArray(parsed?.features?.身材标签) ? parsed.features.身材标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            胸部标签: Array.isArray(parsed?.features?.胸部标签) ? parsed.features.胸部标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            发型标签: Array.isArray(parsed?.features?.发型标签) ? parsed.features.发型标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            发色标签: Array.isArray(parsed?.features?.发色标签) ? parsed.features.发色标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            眼睛标签: Array.isArray(parsed?.features?.眼睛标签) ? parsed.features.眼睛标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            肤色标签: Array.isArray(parsed?.features?.肤色标签) ? parsed.features.肤色标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            年龄感标签: Array.isArray(parsed?.features?.年龄感标签) ? parsed.features.年龄感标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            服装基底标签: Array.isArray(parsed?.features?.服装基底标签) ? parsed.features.服装基底标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined,
            特殊特征标签: Array.isArray(parsed?.features?.特殊特征标签) ? parsed.features.特殊特征标签.map((item: unknown) => String(item).trim()).filter(Boolean) : undefined
        };
        const hasFeatures = Object.values(结构化特征).some((item) => Array.isArray(item) && item.length > 0);
        const result: 角色锚点提取结果 = {
            名称: 显示名称,
            正面提示词: 从提示词中移除角色名称片段(typeof parsed?.positivePrompt === 'string' ? parsed.positivePrompt.trim() : '', 显示名称),
            负面提示词: 从提示词中移除角色名称片段(typeof parsed?.negativePrompt === 'string' ? parsed.negativePrompt.trim() : '', 显示名称),
            结构化特征: 从结构化特征中移除角色名称片段(hasFeatures ? 结构化特征 : undefined, 显示名称),
            说明: typeof parsed?.notes === 'string' ? parsed.notes.trim() : ''
        };
        if (!角色锚点提取结果含有效内容(result)) {
            throw new Error(result.说明 || '角色锚点提取结果为空，模型未返回可用的稳定外观内容。');
        }
        return result;
    } catch (error: any) {
        if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
            throw error;
        }
        const detail = raw.replace(/\s+/g, ' ').trim().slice(0, 240);
        throw new Error(detail ? `角色锚点提取失败：模型返回内容不可用。${detail}` : '角色锚点提取失败：模型未返回可用内容。');
    }
};

const 构建后置正向提示词 = (
    options?: { 构图?: '头像' | '半身' | '立绘' | '场景' | '部位特写'; 场景类型?: 场景生成类型; 尺寸?: string }
): string => {
    return '';
};

const 构图附加负面提示词映射: Partial<Record<'头像' | '半身' | '立绘' | '场景' | '部位特写', string>> = {
    部位特写: 'multiple views, split screen, panel layout, comic panel, comic page, collage, contact sheet, reference sheet, character sheet, turnaround, comparison sheet, montage, triptych, diptych, quadriptych, grid layout, tiled composition'
};

export const 构建最终图片提示词 = (
    prompt: string,
    apiConfig: 当前可用接口结构,
    options?: { 构图?: '头像' | '半身' | '立绘' | '场景' | '部位特写'; 场景类型?: 场景生成类型; 附加正向提示词?: string; 附加负面提示词?: string; 尺寸?: string; PNG参数?: PNG解析参数结构 }
): 图片提示词装配结果 => {
    const composition = options?.构图 || '头像';
    const requestedSize = (options?.尺寸 || '').trim();
    const pngWidth = Number(options?.PNG参数?.宽度);
    const pngHeight = Number(options?.PNG参数?.高度);
    const sizeMatch = requestedSize.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    let size = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : '';
    if (!size && Number.isFinite(pngWidth) && pngWidth > 0 && Number.isFinite(pngHeight) && pngHeight > 0) {
        size = `${Math.floor(pngWidth)}x${Math.floor(pngHeight)}`;
    }
    size = size || (
        composition === '场景'
            ? '1024x576'
            : composition === '半身'
                ? '768x1024'
                : composition === '立绘'
                    ? '832x1216'
                    : composition === '部位特写'
                        ? '1024x1024'
                        : '1024x1024'
    );
    let [parsedWidth, parsedHeight] = size.split('x').map((value) => Number(value));
    if (composition === '头像' && Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0 && parsedWidth !== parsedHeight) {
        size = '1024x1024';
        parsedWidth = 1024;
        parsedHeight = 1024;
    }
    const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1024;
    const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 1024;
    const 前置正向提示词 = (options?.附加正向提示词 || '').trim();
    const 主体正向提示词 = 清洗最终主体提示词(prompt || '', {
        isNovelAI: apiConfig.图片后端类型 === 'novelai' || apiConfig.词组转化输出策略 === 'nai_character_segments'
    });
    const 后置正向提示词 = 构建后置正向提示词({
        构图: options?.构图,
        场景类型: options?.场景类型,
        尺寸: size
    });
    const 使用NAI角色分段 = apiConfig.词组转化输出策略 === 'nai_character_segments' && /\|/.test(主体正向提示词);
    const 最终正向提示词 = 规范化Artist标签大小写(使用NAI角色分段
        ? (() => {
            const segments = 主体正向提示词
                .split('|')
                .map((item) => item.trim())
                .filter(Boolean);
            if (segments.length <= 0) {
                return [前置正向提示词, 主体正向提示词, 后置正向提示词].filter(Boolean).join(', ');
            }
            const [baseSegment, ...roleSegments] = segments;
            const mergedBase = 合并正向提示词片段(前置正向提示词, baseSegment, 后置正向提示词);
            return [mergedBase, ...roleSegments].filter(Boolean).join(' | ');
        })()
        : [前置正向提示词, 主体正向提示词, 后置正向提示词]
            .filter(Boolean)
            .join(', '));
    const 最终负向提示词 = 合并负面提示词片段(
        options?.附加负面提示词,
        构图附加负面提示词映射[composition],
        自动去水印负面提示词
    );
    const 带内联负面提示词的正向提示词 = 为不支持独立负面字段的模型附加负面提示词(最终正向提示词, 最终负向提示词);
    return {
        前置正向提示词,
        主体正向提示词,
        后置正向提示词,
        最终正向提示词,
        最终负向提示词,
        带内联负面提示词的正向提示词,
        尺寸: size,
        宽度: width,
        高度: height
    };
};

const 为不支持独立负面字段的模型附加负面提示词 = (prompt: string, negativePrompt?: string): string => {
    const basePrompt = (prompt || '').trim();
    const negative = 合并负面提示词片段(negativePrompt, 自动去水印负面提示词);
    if (!negative) return basePrompt;
    if (!basePrompt) return `Negative prompt: ${negative}`;
    if (/negative\s*prompt\s*:/i.test(basePrompt) || /--negative\b/i.test(basePrompt)) return basePrompt;
    return `${basePrompt}\nNegative prompt: ${negative}`;
};

const 构建生图请求头 = (apiConfig: 当前可用接口结构): Record<string, string> => {
    const backendType = apiConfig.图片后端类型 || 'openai';
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (backendType === 'novelai') {
        headers.Accept = 'application/zip';
    }
    if (apiConfig.apiKey && (backendType === 'openai' || backendType === 'novelai')) {
        headers.Authorization = `Bearer ${apiConfig.apiKey}`;
    }
    return headers;
};

const 获取ComfyUI基础地址 = (baseUrlRaw: string): string => {
    return 清理末尾斜杠(baseUrlRaw || '');
};

const 解析ComfyUI工作流 = (workflowText: string): Record<string, unknown> => {
    const trimmed = (workflowText || '').trim();
    if (!trimmed) {
        throw new Error('ComfyUI 缺少 workflow JSON，请先在文生图设置中填写');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error: any) {
        throw new Error(`ComfyUI workflow JSON 解析失败：${error?.message || '格式错误'}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ComfyUI workflow JSON 必须是对象');
    }
    return parsed as Record<string, unknown>;
};

const 注入ComfyUI工作流占位符 = (
    value: unknown,
    replacements: Record<string, string | number>
): unknown => {
    if (typeof value === 'string') {
        const exactToken = Object.entries(replacements).find(([token]) => value === token);
        if (exactToken) {
            return exactToken[1];
        }
        return Object.entries(replacements).reduce((text, [token, replacement]) => {
            return text.split(token).join(String(replacement));
        }, value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => 注入ComfyUI工作流占位符(item, replacements));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, 注入ComfyUI工作流占位符(child, replacements)])
        );
    }
    return value;
};

const 构建ComfyUI工作流 = (
    workflowText: string,
    prompt: string,
    negativePrompt: string,
    width: number,
    height: number,
    pngParams?: PNG解析参数结构
): Record<string, unknown> => {
    const hasNegativePlaceholder = /(__NEGATIVE_PROMPT__|\{\{negative_prompt\}\})/.test(workflowText || '');
    const promptValue = hasNegativePlaceholder
        ? prompt
        : 为不支持独立负面字段的模型附加负面提示词(prompt, negativePrompt);
    const replacements: Record<string, string | number> = {
        '__PROMPT__': promptValue,
        '{{prompt}}': promptValue,
        '__NEGATIVE_PROMPT__': negativePrompt,
        '{{negative_prompt}}': negativePrompt,
        '__WIDTH__': width,
        '{{width}}': width,
        '__HEIGHT__': height,
        '{{height}}': height,
        '__SIZE__': `${width}x${height}`,
        '{{size}}': `${width}x${height}`,
        '__STEPS__': Math.max(1, Math.floor(Number(pngParams?.步数) || 28)),
        '{{steps}}': Math.max(1, Math.floor(Number(pngParams?.步数) || 28)),
        '__CFG__': Number.isFinite(Number(pngParams?.CFG强度)) ? Number(pngParams?.CFG强度) : 7,
        '{{cfg}}': Number.isFinite(Number(pngParams?.CFG强度)) ? Number(pngParams?.CFG强度) : 7,
        '__CFG_RESCALE__': Number.isFinite(Number(pngParams?.CFG重缩放)) ? Number(pngParams?.CFG重缩放) : 0,
        '{{cfg_rescale}}': Number.isFinite(Number(pngParams?.CFG重缩放)) ? Number(pngParams?.CFG重缩放) : 0,
        '__SAMPLER__': (pngParams?.采样器 || '').trim() || 'euler',
        '{{sampler}}': (pngParams?.采样器 || '').trim() || 'euler',
        '__SCHEDULER__': (pngParams?.噪声计划 || '').trim() || 'normal',
        '{{scheduler}}': (pngParams?.噪声计划 || '').trim() || 'normal',
        '__SEED__': Number.isFinite(Number(pngParams?.随机种子)) ? Math.max(0, Math.floor(Number(pngParams?.随机种子))) : 0,
        '{{seed}}': Number.isFinite(Number(pngParams?.随机种子)) ? Math.max(0, Math.floor(Number(pngParams?.随机种子))) : 0,
        '__SMEA__': pngParams?.SMEA === true ? 'true' : 'false',
        '{{smea}}': pngParams?.SMEA === true ? 'true' : 'false',
        '__SMEA_DYN__': pngParams?.SMEA动态 === true ? 'true' : 'false',
        '{{smea_dyn}}': pngParams?.SMEA动态 === true ? 'true' : 'false'
    };
    const parsed = 解析ComfyUI工作流(workflowText);
    return 注入ComfyUI工作流占位符(parsed, replacements) as Record<string, unknown>;
};

const 规范化SD采样器与调度器 = (pngParams?: PNG解析参数结构): { samplerName: string; scheduler?: string } => {
    const rawSampler = (pngParams?.采样器 || '').trim();
    const rawScheduler = (pngParams?.噪声计划 || '').trim().toLowerCase();

    const samplerMap: Record<string, string> = {
        'k_euler': 'Euler',
        'k_euler_ancestral': 'Euler a',
        'k_dpmpp_2m': 'DPM++ 2M',
        'k_dpmpp_2s_ancestral': 'DPM++ 2S a',
        'k_dpmpp_sde': 'DPM++ SDE',
        'k_dpmpp_2m_sde': 'DPM++ 2M SDE'
    };
    const schedulerMap: Record<string, string> = {
        'karras': 'Karras',
        'exponential': 'Exponential',
        'polyexponential': 'Polyexponential',
        'sgm_uniform': 'SGM Uniform',
        'simple': 'Simple',
        'normal': 'Normal'
    };

    let samplerName = rawSampler;
    let scheduler = rawScheduler;

    const parenMatch = rawSampler.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
        samplerName = (parenMatch[1] || '').trim();
        scheduler = ((parenMatch[2] || '').trim() || scheduler).toLowerCase();
    }

    const lowerSampler = samplerName.toLowerCase();
    if (lowerSampler.endsWith(' karras')) {
        samplerName = samplerName.slice(0, -7).trim();
        scheduler = scheduler || 'karras';
    } else if (lowerSampler.endsWith(' exponential')) {
        samplerName = samplerName.slice(0, -12).trim();
        scheduler = scheduler || 'exponential';
    }

    samplerName = samplerMap[samplerName] || samplerName || 'DPM++ 2M';
    const normalizedScheduler = schedulerMap[scheduler] || '';

    return {
        samplerName,
        scheduler: normalizedScheduler || undefined
    };
};

const 等待 = async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (!signal) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return;
    }
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort);
    });
};

const 提取ComfyUI图片地址 = (
    historyPayload: any,
    baseUrlRaw: string
): string | null => {
    if (!historyPayload || typeof historyPayload !== 'object') return null;
    const root = Array.isArray(historyPayload)
        ? historyPayload[0]
        : Object.values(historyPayload as Record<string, unknown>)[0];
    const outputs = root && typeof root === 'object' ? (root as any).outputs : null;
    if (!outputs || typeof outputs !== 'object') return null;
    for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
        const images = Array.isArray((nodeOutput as any)?.images) ? (nodeOutput as any).images : [];
        const first = images[0];
        if (!first || typeof first !== 'object') continue;
        const filename = typeof first.filename === 'string' ? first.filename.trim() : '';
        if (!filename) continue;
        const subfolder = typeof first.subfolder === 'string' ? first.subfolder.trim() : '';
        const type = typeof first.type === 'string' ? first.type.trim() : 'output';
        const params = new URLSearchParams({ filename, subfolder, type });
        return `${获取ComfyUI基础地址(baseUrlRaw)}/view?${params.toString()}`;
    }
    return null;
};

const 执行ComfyUI生图 = async (
    prompt: string,
    apiConfig: 当前可用接口结构,
    responseFormat: 'url' | 'b64_json',
    size: string,
    negativePrompt: string,
    signal?: AbortSignal,
    pngParams?: PNG解析参数结构
): Promise<图片生成结果> => {
    const baseUrl = 获取ComfyUI基础地址(apiConfig.baseUrl);
    if (!baseUrl) throw new Error('ComfyUI 缺少 API 地址');
    const [width, height] = size.split('x').map((value) => Number(value));
    const workflow = 构建ComfyUI工作流(apiConfig.ComfyUI工作流JSON || '', prompt, negativePrompt, width, height, pngParams);
    const promptEndpoint = 构建图片端点(apiConfig.baseUrl, apiConfig.图片接口路径);
    const enqueueResponse = await fetch(promptEndpoint, {
        method: 'POST',
        headers: 构建生图请求头(apiConfig),
        body: JSON.stringify({
            prompt: workflow,
            client_id: 'wuxia-web'
        }),
        signal
    });
    if (!enqueueResponse.ok) {
        const detail = await 读取失败详情文本(enqueueResponse, Number.POSITIVE_INFINITY);
        throw new 协议请求错误(`ComfyUI 请求失败: ${enqueueResponse.status}${detail ? ` - ${detail}` : ''}`, enqueueResponse.status, detail);
    }
    const enqueuePayload = 解析可能是JSON字符串(await enqueueResponse.text());
    const promptId = typeof enqueuePayload?.prompt_id === 'string' ? enqueuePayload.prompt_id.trim() : '';
    if (!promptId) {
        throw new Error('ComfyUI 未返回 prompt_id，无法轮询结果');
    }

    const historyEndpoint = `${baseUrl}/history/${encodeURIComponent(promptId)}`;
    while (true) {
        const historyResponse = await fetch(historyEndpoint, {
            method: 'GET',
            headers: 构建生图请求头(apiConfig),
            signal
        });
        if (historyResponse.ok) {
            const historyText = await historyResponse.text();
            const historyPayload = 解析可能是JSON字符串(historyText);
            const imageUrl = 提取ComfyUI图片地址(historyPayload, baseUrl);
            if (imageUrl) {
                if (responseFormat === 'b64_json') {
                    const imageResponse = await fetch(imageUrl, { signal });
                    if (!imageResponse.ok) {
                        throw new Error(`ComfyUI 图片下载失败: ${imageResponse.status}`);
                    }
                    return {
                        图片URL: await blob转DataUrl(await imageResponse.blob()),
                        原始响应: historyText
                    };
                }
                return {
                    图片URL: imageUrl,
                    原始响应: historyText
                };
            }
        }
        await 等待(1000, signal);
    }
};

const 请求分词器文本 = async (
    params: {
        apiConfig: 当前可用接口结构;
        aiRolePrompt?: string;
        systemPrompts?: Array<string | undefined>;
        taskPrompt: string;
        signal?: AbortSignal;
        cotPseudoHistoryPrompt?: string;
        taskType?: 分词器任务类型;
    }
): Promise<string> => {
    const 规范化可选文本 = (value: unknown): string => (
        typeof value === 'string' ? value.trim() : ''
    );
    const 默认图片分词COT = params.taskType === '场景'
        ? 场景图片分词COT伪装历史消息提示词
        : params.taskType === '部位特写'
            ? 部位特写分词COT伪装历史消息提示词
            : 角色图片分词COT伪装历史消息提示词;
    const aiRoleSystemPrompt = [
        默认分词器AI角色提示词,
        规范化可选文本(params.aiRolePrompt)
    ].filter(Boolean).join('\n\n');
    const normalizedCotPrompt = 替换COT伪装身份占位(
        规范化可选文本(params.cotPseudoHistoryPrompt) || 默认图片分词COT.trim(),
        aiRoleSystemPrompt
    ).trim();
    const normalizedSystemPrompts = (params.systemPrompts || [])
        .map((content) => 规范化可选文本(content))
        .filter(Boolean);
    const taskPrompt = 规范化可选文本(params.taskPrompt);
    const messagesRaw: 通用消息[] = [
        { role: 'system', content: aiRoleSystemPrompt },
        ...normalizedSystemPrompts.map((content) => ({ role: 'system' as const, content })),
        { role: 'assistant', content: `【本次任务】\n${taskPrompt}` },
        { role: 'user', content: '开始任务' },
        ...(normalizedCotPrompt ? [{ role: 'assistant' as const, content: normalizedCotPrompt }] : [])
    ];
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });
    return 请求模型文本(params.apiConfig, messages, {
        temperature: 0.5,
        signal: params.signal
    });
};

const 构建NovelAI请求体 = (
    prompt: string,
    apiConfig: 当前可用接口结构,
    size: string,
    extraNegativePrompt?: string,
    options?: { 跳过基础负面提示词?: boolean; PNG参数?: PNG解析参数结构 }
): Record<string, unknown> => {
    const model = (apiConfig.model || '').trim();
    if (!model) {
        throw new Error('NovelAI 缺少模型名称，请先填写例如 nai-diffusion-4-5-full');
    }
    const [width, height] = size.split('x').map((value) => Number(value));
    const useCustomParams = apiConfig.NovelAI启用自定义参数 === true;
    const pngSampler = options?.PNG参数?.采样器;
    const pngSteps = options?.PNG参数?.步数;
    const pngScale = options?.PNG参数?.CFG强度;
    const pngNoiseSchedule = (options?.PNG参数?.噪声计划 || '').trim();
    const pngCfgRescale = options?.PNG参数?.CFG重缩放;
    const pngSeed = options?.PNG参数?.随机种子;
    const pngSmea = options?.PNG参数?.SMEA;
    const pngSmeaDyn = options?.PNG参数?.SMEA动态;
    const pngV4Prompt = options?.PNG参数?.V4正向提示;
    const pngV4NegativePrompt = options?.PNG参数?.V4负向提示;
    const pngDynamicThresholding = options?.PNG参数?.动态阈值;
    const pngDynamicThresholdingPercentile = options?.PNG参数?.动态阈值百分位;
    const pngDynamicThresholdingMimic = options?.PNG参数?.动态阈值模拟CFG;
    const pngSkipCfgAboveSigma = options?.PNG参数?.高Sigma跳过CFG;
    const pngSkipCfgBelowSigma = options?.PNG参数?.低Sigma跳过CFG;
    const pngPreferBrownian = options?.PNG参数?.偏好布朗噪声;
    const pngEulerBugCompat = options?.PNG参数?.Euler祖先采样Bug兼容;
    const pngExplikeFineDetail = options?.PNG参数?.精细细节增强;
    const pngMinimizeSigmaInf = options?.PNG参数?.最小化Sigma无穷;
    const sampler = pngSampler || (useCustomParams ? (apiConfig.NovelAI采样器 || 'k_euler_ancestral') : 'k_euler_ancestral');
    const noiseSchedule = pngNoiseSchedule || (useCustomParams ? (apiConfig.NovelAI噪点表 || 'karras') : 'karras');
    const steps = Number.isFinite(pngSteps)
        ? Math.max(1, Math.min(50, Number(pngSteps)))
        : (useCustomParams ? Math.max(1, Math.min(50, Number(apiConfig.NovelAI步数) || 28)) : 28);
    const baseNegativePrompt = useCustomParams
        ? ((apiConfig.NovelAI负面提示词 || '').trim() || 默认NovelAI负面提示词)
        : 默认NovelAI负面提示词;
    const negativePrompt = options?.跳过基础负面提示词 ? '' : baseNegativePrompt;
    const mergedNegativePrompt = 合并负面提示词片段(negativePrompt, extraNegativePrompt, 自动去水印负面提示词);
    const finalNegativePrompt = options?.跳过基础负面提示词
        ? (mergedNegativePrompt || '')
        : (mergedNegativePrompt || negativePrompt || baseNegativePrompt);
    const naiV4Prompt = 拆分NAIV4提示结构(prompt);
    const isNovelAIV4Model = /^nai-diffusion-4(?:-|$)/i.test(model);
    const parameters: Record<string, unknown> = {
        params_version: 3,
        width: Number.isFinite(width) ? width : 1024,
        height: Number.isFinite(height) ? height : 1024,
        scale: Number.isFinite(Number(pngScale)) ? Number(pngScale) : 5,
        sampler,
        steps,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        sm: pngSmea === true,
        sm_dyn: pngSmeaDyn === true,
        dynamic_thresholding: pngDynamicThresholding === true,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: false,
        legacy_v3_extend: false,
        prompt,
        noise_schedule: noiseSchedule
    };
    if (!isNovelAIV4Model && finalNegativePrompt) {
        parameters.negative_prompt = finalNegativePrompt;
    }
    if (Number.isFinite(Number(pngCfgRescale))) {
        parameters.cfg_rescale = Number(pngCfgRescale);
    }
    if (Number.isFinite(Number(pngSeed))) {
        parameters.seed = Math.max(0, Math.floor(Number(pngSeed)));
    }
    if (Number.isFinite(Number(pngDynamicThresholdingPercentile))) {
        parameters.dynamic_thresholding_percentile = Number(pngDynamicThresholdingPercentile);
    }
    if (Number.isFinite(Number(pngDynamicThresholdingMimic))) {
        parameters.dynamic_thresholding_mimic_scale = Number(pngDynamicThresholdingMimic);
    }
    if (Number.isFinite(Number(pngSkipCfgAboveSigma))) {
        parameters.skip_cfg_above_sigma = Number(pngSkipCfgAboveSigma);
    }
    if (Number.isFinite(Number(pngSkipCfgBelowSigma))) {
        parameters.skip_cfg_below_sigma = Number(pngSkipCfgBelowSigma);
    }
    if (pngPreferBrownian !== undefined) {
        parameters.prefer_brownian = pngPreferBrownian === true;
    }
    if (pngEulerBugCompat !== undefined) {
        parameters.deliberate_euler_ancestral_bug = pngEulerBugCompat === true;
    }
    if (pngExplikeFineDetail !== undefined) {
        parameters.explike_fine_detail = pngExplikeFineDetail === true;
    }
    if (pngMinimizeSigmaInf !== undefined) {
        parameters.minimize_sigma_inf = pngMinimizeSigmaInf === true;
    }

    if (isNovelAIV4Model) {
        parameters.v4_prompt = {
            use_coords: pngV4Prompt?.useCoords === true,
            use_order: pngV4Prompt?.useOrder === true,
            caption: {
                base_caption: prompt,
                char_captions: []
            },
            legacy_uc: pngV4Prompt?.legacyUc === true
        };
        parameters.v4_negative_prompt = {
            use_coords: pngV4NegativePrompt?.useCoords === true,
            use_order: pngV4NegativePrompt?.useOrder === true,
            caption: {
                base_caption: finalNegativePrompt,
                char_captions: []
            },
            legacy_uc: pngV4NegativePrompt?.legacyUc === true
        };
    }

    if (sampler === 'k_euler_ancestral' && pngEulerBugCompat === undefined && pngPreferBrownian === undefined) {
        parameters.deliberate_euler_ancestral_bug = false;
        parameters.prefer_brownian = true;
    }

    return {
        input: prompt,
        model,
        action: 'generate',
        parameters
    };
};

const 解析NovelAI图片响应 = async (response: Response): Promise<图片生成结果> => {
    const blob = await response.blob();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
        return {
            图片URL: await blob转DataUrl(blob)
        };
    }

    const buffer = new Uint8Array(await blob.arrayBuffer());
    try {
        const files = unzipSync(buffer);
        const imageEntry = Object.entries(files).find(([name]) => /\.(png|jpe?g|webp|gif)$/i.test(name));
        if (!imageEntry) {
            throw new Error('压缩包中未找到图片文件');
        }
        const [fileName, imageBytes] = imageEntry;
        return {
            图片URL: uint8数组转DataUrl(imageBytes, 推断图片Mime类型(fileName))
        };
    } catch {
        const detail = await blob.text().catch(() => '');
        throw new Error(`NovelAI 图片响应无法解析${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
};

const 读取NPC字段文本 = (data: any, key: string): string => {
    const value = data?.[key];
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
};

const 读取NPC对象片段 = (data: any, key: string): string => {
    const source = data?.[key];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
    return Object.entries(source as Record<string, unknown>)
        .map(([name, value]) => {
            if (typeof value === 'string' && value.trim()) return `${name}:${value.trim()}`;
            if (typeof value === 'number' && Number.isFinite(value)) return `${name}:${value}`;
            return '';
        })
        .filter(Boolean)
        .join('，');
};

const 读取NPC数组片段 = (data: any, key: string): string => {
    const source = data?.[key];
    if (!Array.isArray(source)) return '';
    return source
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object' && typeof (item as any)?.名称 === 'string') return (item as any).名称.trim();
            return '';
        })
        .filter(Boolean)
        .join('，');
};

const 生成NovelAI人物数量标签 = (source: Record<string, unknown>): string => {
    const gender = 读取NPC字段文本(source, '性别');
    if (gender === '女') return '1girl';
    if (gender === '男') return '1man';
    return 'solo';
};

const 香闺秘档部位描述字段映射: Record<香闺秘档部位类型, string> = {
    胸部: '胸部描述',
    小穴: '小穴描述',
    屁穴: '屁穴描述'
};

const 构建香闺秘档部位特写说明 = (部位: 香闺秘档部位类型): string => {
    if (部位 === '胸部') {
        return '胸部微距特写 (Breasts Macro Photography)。极近距离裁切，画面完全被胸部占据，聚焦于乳头纹理、乳晕色泽 (Pink nipples, Detailed areola) 以及皮肤的透光感 (Subsurface scattering)，背景需完全虚化或仅保留极小比例。';
    }
    if (部位 === '小穴') {
        return '阴部核心特写 (Crotch/Pussy Macro Focus)。超近距离紧裁切，聚焦于花径、湿润程度 (Wetness, Pussy juice) 以及皮肤纹理，强调真实的肉感与微距细节，严禁退回全身或半身视角。';
    }
    return '后庭局部特写 (Ass/Anus Extreme Close-up)。超近距离裁切，画面被臀部与后庭占据，聚焦于皮肤褶皱、肉感 (Skin texture, Fleshy) 以及后庭细节 (Detailed anus)，强调微距级别的细节呈现。';
};

const 强化香闺秘档特写词组 = (
    prompt: string,
    部位: 香闺秘档部位类型
): string => {
    const source = 清理生图词组输出(prompt);
    if (!source) return source;
    const deny = /^(?:portrait|headshot|upper body|half body|waist-?up|full body|cowboy shot|wide shot|mid shot|long shot|standing|sitting|kneeling|running|walking|looking at viewer|face focus|facial focus|scenery|environment|landscape|room|indoors|outdoors|background|establishing shot)$/i;
    return 去重提示词片段(按逗号拆分提示词(source))
        .filter((token) => !deny.test(token))
        .join(', ');
};

export const buildNpcDirectImagePrompt = (
    npcData: unknown,
    options?: NPC提示词选项
): { 原始描述: string; 生图词组: string } => {
    const source = (npcData && typeof npcData === 'object') ? npcData as Record<string, unknown> : {};
    const isNovelAI = options?.后端类型 === 'novelai';
    const fragments = [
        读取NPC字段文本(source, '性别'),
        读取NPC字段文本(source, '年龄') ? `${读取NPC字段文本(source, '年龄')}岁` : '',
        读取NPC字段文本(source, '身份'),
        读取NPC字段文本(source, '境界'),
        读取NPC字段文本(source, '简介'),
        读取NPC字段文本(source, '核心性格特征'),
        读取NPC字段文本(source, '性格'),
        读取NPC字段文本(source, '外貌'),
        读取NPC字段文本(source, '身材'),
        读取NPC字段文本(source, '衣着')
    ];

    const 装备短语 = 读取NPC对象片段(source, '当前装备');
    if (装备短语) fragments.push(`装备：${装备短语}`);
    const 背包短语 = 读取NPC数组片段(source, '背包');
    if (背包短语) fragments.push(`随身物品：${背包短语}`);
    const 补充视觉设定 = 读取NPC对象片段(source, '补充视觉设定');
    if (补充视觉设定) fragments.push(`补充设定：${补充视觉设定}`);

    if (isNovelAI) {
        const characterCountTag = 生成NovelAI人物数量标签(source);
        if (options?.构图 === '立绘') {
            fragments.push(characterCountTag, 'full body, standing, character focus');
        } else {
            fragments.push(characterCountTag, 'portrait, upper body, face focus');
        }
    } else {
        if (options?.构图 === '立绘') fragments.push('全身角色，站姿，角色主体');
    }
    if ((options?.额外要求 || '').trim()) fragments.push((options?.额外要求 || '').trim());

    const 原始词组 = fragments.filter(Boolean).join(isNovelAI ? ', ' : '，');
    const 生图词组 = isNovelAI ? 保守补全NAI权重语法(原始词组) : 原始词组;
    return {
        原始描述: JSON.stringify(source ?? {}, null, 2),
        生图词组
    };
};

const 清理生图词组输出 = (rawText: string): string => {
    return (rawText || '')
        .replace(/^```(?:text|markdown|json)?\s*/i, '')
        .replace(/```$/i, '')
        .replace(/^【?生图词组】?[:：]?/i, '')
        .trim();
};

const 按逗号拆分提示词 = (text: string): string[] => (
    (text || '')
        .replace(/\r?\n+/g, ', ')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
);

const 提取权重组内部提示词 = (token: string): string[] => {
    const source = (token || '').trim();
    if (!source.includes('::')) return [];
    const start = source.indexOf('::');
    const end = source.lastIndexOf('::');
    if (start < 0 || end <= start + 2) return [];
    return 按逗号拆分提示词(source.slice(start + 2, end));
};

const 规范化提示词键 = (token: string): string => (
    (token || '')
        .trim()
        .toLowerCase()
        .replace(/^\d+(?:\.\d+)?::/g, '')
        .replace(/::$/g, '')
        .replace(/^[([{<]+|[)\]}>]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
);

const 按提示词单元拆分 = (text: string): string[] => {
    const source = (text || '').replace(/\r?\n+/g, ', ').trim();
    if (!source) return [];
    const tokens: string[] = [];
    let current = '';
    let index = 0;
    let weightDepth = 0;
    while (index < source.length) {
        const ch = source[index];
        const nextTwo = source.slice(index, index + 2);
        if (nextTwo === '::') {
            weightDepth = weightDepth === 0 ? 1 : 0;
            current += nextTwo;
            index += 2;
            continue;
        }
        if (ch === ',' && weightDepth === 0) {
            const trimmed = current.trim();
            if (trimmed) tokens.push(trimmed);
            current = '';
            index += 1;
            continue;
        }
        current += ch;
        index += 1;
    }
    const tail = current.trim();
    if (tail) tokens.push(tail);
    return tokens;
};

const 去重提示词片段 = (tokens: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    tokens.forEach((token) => {
        const normalized = token.replace(/^[\-*•\s]+/, '').trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(normalized);
    });
    return result;
};

const 合并并去重提示词单元 = (...parts: Array<string | undefined>): string[] => {
    const result: string[] = [];
    const seenKeys = new Set<string>();
    const seenTokens = new Set<string>();
    parts.forEach((part) => {
        按提示词单元拆分((part || '').trim()).forEach((token) => {
            const normalizedToken = token.trim();
            if (!normalizedToken) return;
            const tokenKey = normalizedToken.toLowerCase();
            if (seenTokens.has(tokenKey)) return;

            const childTokens = 提取权重组内部提示词(normalizedToken);
            const keys = (childTokens.length > 0 ? childTokens : [normalizedToken])
                .map(规范化提示词键)
                .filter(Boolean);
            if (keys.length > 0 && keys.every((key) => seenKeys.has(key))) {
                return;
            }

            seenTokens.add(tokenKey);
            keys.forEach((key) => seenKeys.add(key));
            result.push(normalizedToken);
        });
    });
    return result;
};

export const 构建角色锚点注入提示词 = (
    anchor: Pick<角色锚点结构, '正面提示词' | '结构化特征'> | null | undefined,
    options: { 构图: '头像' | '半身' | '立绘' | '场景' | '部位特写'; 部位?: 香闺秘档部位类型 }
): string => {
    const positive = (anchor?.正面提示词 || '').trim();
    const features = anchor?.结构化特征;
    const composition = options.构图;

    const 去除镜头构图词 = (tokens: string[]): string[] => {
        const cameraWords = /(headshot|portrait|upper body|waist-?up|full body|cowboy shot|close-?up|extreme close-?up|wide shot|mid shot|low angle|high angle|standing|sitting|kneeling|running|framing|character sheet|composition|depth of field|rule of thirds|feet included|floor contact|avatar)/i;
        return tokens.filter((token) => !cameraWords.test(token));
    };

    const 从结构化特征挑选 = (
        keys: Array<keyof NonNullable<角色锚点结构['结构化特征']>>,
        limit = 24
    ): string[] => {
        if (!features) return [];
        const fragments = keys
            .flatMap((key) => (Array.isArray((features as any)?.[key]) ? (features as any)[key] : []))
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean);
        return 去除镜头构图词(去重提示词片段(fragments)).slice(0, Math.max(0, limit));
    };

    const 从原始提示词挑选 = (params: { allow: RegExp; deny: RegExp; limit?: number }): string[] => {
        if (!positive) return [];
        // 含权重分组时不做逗号拆分，以免破坏语法；此时宁可跳过注入。
        if (/::/.test(positive)) return [];
        const tokens = 去除镜头构图词(去重提示词片段(按逗号拆分提示词(positive)));
        const filtered = tokens.filter((token) => params.allow.test(token) && !params.deny.test(token));
        return filtered.slice(0, Math.max(0, params.limit ?? 24));
    };

    if (composition === '头像') {
        const tokensFromFeatures = 从结构化特征挑选([
            '外貌标签',
            '发型标签',
            '发色标签',
            '眼睛标签',
            '肤色标签',
            '年龄感标签',
            '特殊特征标签'
        ], 20);
        if (tokensFromFeatures.length > 0) return tokensFromFeatures.join(', ');

        const allow = /(1girl|1boy|girl|boy|woman|man|female|male|young|adult|teen|hair|eyes?|iris|pupil|eyebrow|eyelash|face|lips?|mouth|nose|skin|complexion|freckle|mole|beauty mark|scar|tattoo|makeup|ear|neck)/i;
        const deny = /(breast|bust|cleavage|waist|hip|thigh|leg|feet|nude|dress|robe|hanfu|armor|outfit|clothing|sleeve|glove|stocking|boots|pants|skirt|kimono|cape|cloak|weapon|sword|background|scenery|environment|landscape)/i;
        return 从原始提示词挑选({ allow, deny, limit: 16 }).join(', ');
    }

    if (composition === '部位特写') {
        const part = options.部位;
        if (part === '胸部') {
            const allow = /(breast|breasts|bust|cup|cleavage|nipple|nipples|areola|chest|skin|complexion|pale|fair|tan|young|adult|teen)/i;
            const deny = /(face|eyes?|hair|lips?|mouth|nose|dress|robe|hanfu|armor|outfit|clothing|upper body|waist|portrait|full body)/i;

            const tokens = 从结构化特征挑选(['胸部标签', '肤色标签', '年龄感标签'], 14)
                .filter((token) => allow.test(token) && !deny.test(token));
            if (tokens.length > 0) return tokens.join(', ');

            // 回退：结构化特征缺失时，从正面提示词中保守抽取胸部/肤色/年龄相关标签。
            return 从原始提示词挑选({ allow, deny, limit: 10 }).join(', ');
        }

        // 小穴/屁穴特写：角色锚点通常不应强塞全套外观；仅保留肤色/年龄感等“不会把画面拉回半身”的稳定信息。
        const allow = /(skin|complexion|pale|fair|tan|young|adult|teen)/i;
        const deny = /(face|eyes?|hair|dress|robe|hanfu|armor|outfit|clothing|upper body|waist|portrait|full body|standing|sitting|kneeling|feet)/i;

        const safe = 从结构化特征挑选(['肤色标签', '年龄感标签'], 8)
            .filter((token) => allow.test(token) && !deny.test(token));
        if (safe.length > 0) return safe.join(', ');

        return 从原始提示词挑选({ allow, deny, limit: 6 }).join(', ');
    }

    // 半身/立绘/场景：默认保持完整锚点，不做裁剪（避免损失稳定外观/常驻服装信息）。
    return positive;
};

const 合并正向提示词片段 = (...parts: Array<string | undefined>): string => {
    const tokens = 合并并去重提示词单元(...parts);
    return 规范化Artist标签大小写(tokens.join(', '));
};

const 提取最后一个标签完整块 = (rawText: string, tagName: string): string => {
    const source = (rawText || '').trim();
    if (!source) return '';
    const regex = new RegExp(`<\\s*${tagName}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tagName}\\s*>`, 'gi');
    const matches = source.match(regex);
    return Array.isArray(matches) && matches.length > 0 ? (matches[matches.length - 1] || '').trim() : '';
};

const 提取最后一个标签文本 = (rawText: string, tagName: string): string => {
    const block = 提取最后一个标签完整块(rawText, tagName);
    if (!block) return '';
    const source = block.trim();
    return source
        .replace(new RegExp(`^<\\s*${tagName}\\b[^>]*>`, 'i'), '')
        .replace(new RegExp(`<\\s*\\/\\s*${tagName}\\s*>$`, 'i'), '')
        .trim();
};

const 提取最后一个标签文本列表 = (rawText: string, tagNames: string[]): string => {
    for (const tagName of tagNames) {
        const text = 提取最后一个标签文本(rawText, tagName);
        if (text) return text;
    }
    return '';
};

const 规范化Artist标签大小写 = (rawText: string): string => (
    (rawText || '').replace(/\bArtist\s*:/g, 'artist:')
);

const 移除全部结构标签 = (rawText: string): string => (
    (rawText || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

const 移除序号角色名称前缀 = (rawText: string): string => (
    (rawText || '')
        .replace(/(^|\n)\s*\[\d+\]\s*[^|\n<>]{1,80}\|/g, '$1')
        .trim()
);

const 移除思考标签块 = (rawText: string): string => (
    (rawText || '')
        .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
        .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
        .trim()
);

const 转换NAI括号权重语法 = (rawText: string): string => {
    let output = rawText || '';
    for (let i = 0; i < 8; i += 1) {
        const next = output.replace(/\(([^()]+?)\s*:\s*(-?\d+(?:\.\d+)?)\)/g, (_match, content, weight) => {
            const cleanedContent = 清理生图词组输出(String(content || ''));
            const cleanedWeight = String(weight || '').trim();
            if (!cleanedContent || !cleanedWeight) return '';
            return `${cleanedWeight}::${cleanedContent}::`;
        });
        if (next === output) break;
        output = next;
    }
    for (let i = 0; i < 8; i += 1) {
        const next = output.replace(/\(\s*(-?\d+(?:\.\d+)?)::([\s\S]*?)::\s*\)/g, (_match, weight, content) => {
            const cleanedContent = 清理生图词组输出(String(content || ''));
            const cleanedWeight = String(weight || '').trim();
            if (!cleanedContent || !cleanedWeight) return '';
            return `${cleanedWeight}::${cleanedContent}::`;
        });
        if (next === output) break;
        output = next;
    }
    return 规范化Artist标签大小写(output);
};

const 清洗NAI脏权重语法 = (rawText: string): string => {
    let output = rawText || '';

    for (let i = 0; i < 8; i += 1) {
        const next = output.replace(
            /(-?\d+(?:\.\d+)?)::\s*([^:]+?)\s*,\s*::\s*(-?\d+(?:\.\d+)?)::\s*([^:]+?)::/g,
            (_match, leftWeight, leftContent, rightWeight, rightContent) => {
                const normalizedLeftWeight = String(leftWeight || '').trim();
                const normalizedRightWeight = String(rightWeight || '').trim();
                const normalizedLeftContent = 清理生图词组输出(String(leftContent || ''));
                const normalizedRightContent = 清理生图词组输出(String(rightContent || ''));
                const parts = [
                    normalizedLeftWeight && normalizedLeftContent ? `${normalizedLeftWeight}::${normalizedLeftContent}::` : '',
                    normalizedRightWeight && normalizedRightContent ? `${normalizedRightWeight}::${normalizedRightContent}::` : ''
                ].filter(Boolean);
                return parts.join(', ');
            }
        );
        if (next === output) break;
        output = next;
    }

    for (let i = 0; i < 8; i += 1) {
        const next = output.replace(
            /,\s*::\s*(-?\d+(?:\.\d+)?)::\s*([^:]+?)::/g,
            (_match, weight, content) => {
                const normalizedWeight = String(weight || '').trim();
                const normalizedContent = 清理生图词组输出(String(content || ''));
                if (!normalizedWeight || !normalizedContent) return '';
                return `, ${normalizedWeight}::${normalizedContent}::`;
            }
        );
        if (next === output) break;
        output = next;
    }

    for (let i = 0; i < 8; i += 1) {
        const next = output.replace(
            /(-?\d+(?:\.\d+)?)::\s*([^:]+?)\s*,\s*::/g,
            (_match, weight, content) => {
                const normalizedWeight = String(weight || '').trim();
                const normalizedContent = 清理生图词组输出(String(content || ''));
                if (!normalizedWeight || !normalizedContent) return '';
                return `${normalizedWeight}::${normalizedContent}::, `;
            }
        );
        if (next === output) break;
        output = next;
    }

    output = output
        .replace(/,\s*,+/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .trim();

    return output;
};

const 清洗最终主体提示词 = (rawText: string, options?: { isNovelAI?: boolean }): string => {
    const withoutThinking = 移除思考标签块(rawText);
    const 基础段内容 = 提取最后一个标签文本(withoutThinking, '基础');
    const 角色块内容 = 提取最后一个标签文本(withoutThinking, '角色');
    const 序号角色列表 = 解析序号角色列表(角色块内容 || withoutThinking);
    if (序号角色列表.length > 0) {
        const safeBase = 规范化Artist标签大小写(清理生图词组输出(基础段内容 || ''));
        const safeRoles = 序号角色列表
            .map((item) => 规范化Artist标签大小写(清理生图词组输出(item?.内容 || '')))
            .filter(Boolean);
        const mergedStructured = options?.isNovelAI
            ? [safeBase, ...safeRoles].filter(Boolean).join(' | ')
            : [safeBase, ...safeRoles].filter(Boolean).join('; ');
        if (mergedStructured.trim()) {
            return options?.isNovelAI ? 保守补全NAI权重语法(mergedStructured) : mergedStructured.trim();
        }
    }
    const extracted = 提取最后一个标签文本列表(withoutThinking, ['提示词', '词组', '生图词组'])
        || 提取最后一个标签文本(withoutThinking, '基础')
        || withoutThinking;
    const withoutResidualTags = 移除序号角色名称前缀(
        移除全部结构标签(
            (extracted || '')
                .replace(/<\s*\/?\s*提示词\s*>/gi, '')
                .replace(/<\s*\/?\s*词组\s*>/gi, '')
                .replace(/<\s*\/?\s*生图词组\s*>/gi, '')
                .trim()
        )
    );
    const cleaned = 规范化Artist标签大小写(清理生图词组输出(withoutResidualTags));
    if (!cleaned) return '';
    return options?.isNovelAI ? 保守补全NAI权重语法(cleaned) : cleaned;
};

const 解析标签属性 = (raw: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const regex = /([^\s=]+)\s*=\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(raw || ''))) {
        const key = (match[1] || '').trim();
        const value = (match[2] || '').trim();
        if (key && value) attrs[key] = value;
    }
    return attrs;
};

const 解析序号角色列表 = (rawText: string): 结构化角色词组片段[] => {
    const source = (rawText || '').replace(/\r\n/g, '\n').trim();
    if (!source) return [];
    const roles: 结构化角色词组片段[] = [];
    const regex = /(?:^|\n)\s*\[(\d+)\]\s*([\s\S]*?)(?=(?:\n\s*\[\d+\]\s*)|$)/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source))) {
        const index = Number(match[1] || String(roles.length + 1));
        const payload = 清理生图词组输出(match[2] || '');
        if (!payload) continue;
        const separatorIndex = payload.indexOf('|');
        const maybeName = separatorIndex >= 0 ? payload.slice(0, separatorIndex).trim() : '';
        const maybeContent = separatorIndex >= 0 ? payload.slice(separatorIndex + 1).trim() : payload;
        const safeName = maybeName && !/,/.test(maybeName) ? maybeName : `角色${index}`;
        const safeContent = 清理生图词组输出(maybeContent);
        if (!safeContent) continue;
        roles.push({
            名称: safeName,
            内容: safeContent
        });
    }
    return roles;
};

const 解析结构化词组结果 = (rawText: string): 结构化词组结果 | null => {
    const source = (提取最后一个标签完整块(rawText, '提示词结构') || rawText || '').trim();
    if (!source) return null;
    const 基础完整块 = 提取最后一个标签完整块(source, '基础');
    const 基础 = 基础完整块 ? 提取最后一个标签文本(基础完整块, '基础') : 提取最后一个标签文本(source, '基础');
    const 角色列表: 结构化角色词组片段[] = [];
    const roleRegex = /<\s*角色\b([^>]*)>([\s\S]*?)<\s*\/\s*角色\s*>/gi;
    let roleMatch: RegExpExecArray | null = null;
    let roleIndex = 0;
    while ((roleMatch = roleRegex.exec(source))) {
        const attrs = 解析标签属性(roleMatch[1] || '');
        const 原始内容 = roleMatch[2] || '';
        const 序号角色 = 解析序号角色列表(原始内容);
        if (
            序号角色.length > 0
            && !attrs.名称
            && !attrs.name
            && !attrs.role
            && !attrs.角色
        ) {
            序号角色.forEach((item) => {
                角色列表.push(item);
                roleIndex += 1;
            });
            continue;
        }
        const 名称 = (attrs.名称 || attrs.name || attrs.role || attrs.角色 || `角色${roleIndex + 1}`).trim();
        const 内容 = 清理生图词组输出(原始内容);
        if (名称 || 内容) {
            角色列表.push({ 名称, 内容 });
            roleIndex += 1;
        }
    }
    if (角色列表.length <= 0) {
        const 序号角色列表 = 解析序号角色列表(提取最后一个标签文本(source, '角色'));
        if (序号角色列表.length > 0) {
            角色列表.push(...序号角色列表);
        }
    }
    if (基础 || 角色列表.length > 0) {
        return {
            基础: 清理生图词组输出(基础),
            角色列表
        };
    }

    const bracketSource = source.replace(/\r\n/g, '\n');
    const blockRegex = /【\s*(基础|角色(?:\s*[:：]\s*([^\]】]+))?)\s*】([\s\S]*?)(?=【\s*(?:基础|角色)|$)/g;
    let blockMatch: RegExpExecArray | null = null;
    let bracketBase = '';
    const bracketRoles: 结构化角色词组片段[] = [];
    while ((blockMatch = blockRegex.exec(bracketSource))) {
        const section = (blockMatch[1] || '').trim();
        const roleName = (blockMatch[2] || '').trim();
        const content = 清理生图词组输出(blockMatch[3] || '');
        if (!content) continue;
        if (section.startsWith('基础')) {
            bracketBase = content;
            continue;
        }
        bracketRoles.push({
            名称: roleName || `角色${bracketRoles.length + 1}`,
            内容: content
        });
    }
    if (!bracketBase && bracketRoles.length <= 0) return null;
    return {
        基础: bracketBase,
        角色列表: bracketRoles
    };
};

const 构建角色锚点稳定外观提示词 = (
    anchor: Pick<角色锚点结构, '正面提示词' | '结构化特征'> | null | undefined
): string => {
    const positive = (anchor?.正面提示词 || '').trim();
    const features = anchor?.结构化特征;
    const 过滤镜头动作环境词 = (tokens: string[]): string[] => {
        const deny = /(portrait|close-?up|upper body|waist-?up|full body|cowboy shot|wide shot|mid shot|low angle|high angle|standing|sitting|kneeling|running|jumping|walking|looking at viewer|looking away|from side|from behind|facing viewer|dynamic pose|action pose|background|scenery|environment|landscape|indoors|outdoors|rim light|lighting|sunlight|moonlight|fog|mist|rain|snow|depth of field|composition|framing|rule of thirds|atmospheric haze)/i;
        return tokens.filter((token) => !deny.test(token));
    };
    const 从结构化特征抽取 = (
        keys: Array<keyof NonNullable<角色锚点结构['结构化特征']>>,
        limit = 28
    ): string[] => {
        if (!features) return [];
        const fragments = keys
            .flatMap((key) => (Array.isArray((features as any)?.[key]) ? (features as any)[key] : []))
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean);
        return 过滤镜头动作环境词(去重提示词片段(fragments)).slice(0, Math.max(0, limit));
    };
    const featureTokens = 从结构化特征抽取([
        '外貌标签',
        '身材标签',
        '胸部标签',
        '发型标签',
        '发色标签',
        '眼睛标签',
        '肤色标签',
        '年龄感标签',
        '服装基底标签',
        '特殊特征标签'
    ], 30);
    if (featureTokens.length > 0) return featureTokens.join(', ');
    if (!positive) return '';
    if (/::/.test(positive)) return positive;
    const allow = /(1girl|1boy|girl|boy|woman|man|female|male|young|adult|teen|hair|eyes?|iris|pupil|eyebrow|eyelash|face|lips?|mouth|nose|skin|complexion|freckle|mole|beauty mark|scar|tattoo|makeup|ear|neck|body|figure|bust|breast|chest|waist|hip|thigh|outfit|robe|hanfu|armor|dress|clothing|sleeve|glove|stocking|boots|pants|skirt|kimono|cape|cloak|belt|jewelry|earring|hairpin|ornament|jade|embroidery|weapon|sword|blade|saber|fan|staff)/i;
    const deny = /(portrait|close-?up|upper body|full body|waist-?up|cowboy shot|wide shot|mid shot|low angle|high angle|standing|sitting|kneeling|running|jumping|walking|looking at viewer|looking away|from side|from behind|background|scenery|environment|landscape|indoors|outdoors|rim light|lighting|sunlight|moonlight|fog|mist|rain|snow|depth of field|composition|framing|rule of thirds)/i;
    return 过滤镜头动作环境词(去重提示词片段(按逗号拆分提示词(positive)))
        .filter((token) => allow.test(token) && !deny.test(token))
        .slice(0, 28)
        .join(', ');
};

const 规范化角色名 = (name: string): string => (name || '').toLowerCase().replace(/\s+/g, '').trim();

const 清理NAI角色段占位词 = (text: string): string => {
    const source = 清理生图词组输出(text)
        .replace(/^\[\d+\]\s*/u, '')
        .replace(/^(?:主体|角色\s*\d+|character\s*\d+|role\s*\d+|subject)\s*[:：\-]?\s*/iu, '')
        .trim();
    if (!source) return '';
    return 去重提示词片段(按逗号拆分提示词(source))
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !/^(?:主体|角色\s*\d+|character\s*\d+|role\s*\d+|subject)\s*[:：\-]?$/iu.test(token))
        .join(', ');
};

const 推断NAI角色起始标签 = (text: string): string => {
    const source = (text || '').toLowerCase();
    if (!source) return '';
    if (/\b(1woman|woman|adult woman|adult female|female adult)\b/.test(source)) return '1woman';
    if (/\b(1man|man|adult man|adult male|male adult)\b/.test(source)) return '1man';
    if (/\b(1girl|girl|female)\b/.test(source)) return '1girl';
    if (/\b(1boy|boy|male)\b/.test(source)) return '1boy';
    return '';
};

const 是NAI角色起始标签 = (token: string): boolean => (
    /^(?:1girl|1boy|1woman|1man|girl|boy|woman|man)$/iu.test((token || '').trim())
);

const 确保NAI角色段起始标签 = (text: string): string => {
    const cleaned = 清理NAI角色段占位词(text);
    if (!cleaned) return '';
    const tokens = 去重提示词片段(按逗号拆分提示词(cleaned));
    if (tokens.length <= 0) return '';
    const inferredLead = 推断NAI角色起始标签(cleaned);
    const normalizedTokens = inferredLead
        ? 去重提示词片段([inferredLead, ...tokens.filter((token) => !是NAI角色起始标签(token))])
        : tokens;
    return normalizedTokens.join(', ');
};

const 构建NAI基础人数标签 = (segments: string[]): string[] => {
    const counts = { '1girl': 0, '1boy': 0, '1woman': 0, '1man': 0 } as Record<string, number>;
    segments.forEach((segment) => {
        const lead = 推断NAI角色起始标签(segment);
        if (lead && counts[lead] !== undefined) counts[lead] += 1;
    });
    const labels: string[] = [];
    if (counts['1girl'] > 0) labels.push(counts['1girl'] > 1 ? `${counts['1girl']}girls` : '1girl');
    if (counts['1boy'] > 0) labels.push(counts['1boy'] > 1 ? `${counts['1boy']}boys` : '1boy');
    if (counts['1woman'] > 0) labels.push(counts['1woman'] > 1 ? `${counts['1woman']}women` : '1woman');
    if (counts['1man'] > 0) labels.push(counts['1man'] > 1 ? `${counts['1man']}men` : '1man');
    return labels;
};

const 补全NAI基础人数标签 = (base: string, segments: string[]): string => {
    const cleanedBase = 清理生图词组输出(base);
    if (/\b\d+\s*(?:girls?|boys?|women|men)\b/i.test(cleanedBase)) return cleanedBase;
    const countLabels = 构建NAI基础人数标签(segments);
    if (countLabels.length <= 0) return cleanedBase;
    return 合并正向提示词片段(countLabels.join(', '), cleanedBase);
};

const 构建结构化角色段列表 = (
    roles: 结构化角色词组片段[],
    anchors: 场景角色锚点输入[]
): Array<结构化角色词组片段 & { 锚点?: 场景角色锚点输入 }> => {
    const safeRoles = Array.isArray(roles) ? roles : [];
    const safeAnchors = Array.isArray(anchors) ? anchors : [];
    const usedAnchorIndexes = new Set<number>();
    const resolved = safeRoles.map((role, roleIndex) => {
        const roleName = (role?.名称 || '').trim();
        const roleNameKey = 规范化角色名(roleName);
        let matchedAnchorIndex = safeAnchors.findIndex((anchor, index) => (
            !usedAnchorIndexes.has(index)
            && roleNameKey
            && (
                规范化角色名(anchor?.名称 || '') === roleNameKey
                || 规范化角色名(anchor?.名称 || '').includes(roleNameKey)
                || roleNameKey.includes(规范化角色名(anchor?.名称 || ''))
            )
        ));
        if (matchedAnchorIndex < 0 && safeAnchors.length === 1 && !usedAnchorIndexes.has(0)) {
            matchedAnchorIndex = 0;
        }
        if (matchedAnchorIndex < 0 && roleIndex < safeAnchors.length && !usedAnchorIndexes.has(roleIndex)) {
            matchedAnchorIndex = roleIndex;
        }
        if (matchedAnchorIndex >= 0) usedAnchorIndexes.add(matchedAnchorIndex);
        return {
            名称: roleName || safeAnchors[matchedAnchorIndex]?.名称 || `角色${roleIndex + 1}`,
            内容: (role?.内容 || '').trim(),
            锚点: matchedAnchorIndex >= 0 ? safeAnchors[matchedAnchorIndex] : undefined
        };
    });
    safeAnchors.forEach((anchor, index) => {
        if (usedAnchorIndexes.has(index)) return;
        resolved.push({
            名称: (anchor?.名称 || '').trim() || `角色${resolved.length + 1}`,
            内容: '',
            锚点: anchor
        });
    });
    return resolved.filter((item) => (item?.名称 || item?.内容 || item?.锚点?.正面提示词 || '').trim());
};

const 序列化结构化词组结果 = (
    structured: 结构化词组结果,
    strategy: 图片词组序列化策略类型,
    anchors: 场景角色锚点输入[]
): string => {
    const 基础 = (structured?.基础 || '').trim();
    const 角色段列表 = 构建结构化角色段列表(structured?.角色列表 || [], anchors);
    if (strategy === 'nai_character_segments') {
        const 序列化角色段 = 角色段列表
            .map((role) => 确保NAI角色段起始标签(合并正向提示词片段(构建角色锚点稳定外观提示词(role.锚点), role.内容)))
            .map((text) => (text ? 保守补全NAI权重语法(text) : ''))
            .filter(Boolean);
        if (序列化角色段.length <= 0) return 保守补全NAI权重语法(基础);
        const 基础段 = 保守补全NAI权重语法(补全NAI基础人数标签(基础, 序列化角色段));
        return [基础段, ...序列化角色段].filter(Boolean).join(' | ');
    }

    const 角色描述段 = 角色段列表
        .map((role, index) => {
            const text = 合并正向提示词片段(构建角色锚点稳定外观提示词(role.锚点), role.内容);
            if (!text) return '';
            const label = (role.名称 || '').trim() || `Character ${index + 1}`;
            return `${label}: ${text}`;
        })
        .filter(Boolean);

    if (strategy === 'gemini_structured' || strategy === 'grok_structured') {
        const baseLabel = strategy === 'grok_structured' ? 'Scene staging' : 'Base scene';
        return [
            基础 ? `${baseLabel}: ${基础}` : '',
            ...角色描述段
        ].filter(Boolean).join('; ');
    }

    return 合并正向提示词片段(
        基础,
        ...角色描述段
    );
};

const 序列化词组转化器输出 = (
    rawText: string,
    options?: {
        strategy?: 图片词组序列化策略类型;
        roleAnchors?: 场景角色锚点输入[];
    }
): string => {
    const strategy = options?.strategy || 'flat';
    const roleAnchors = Array.isArray(options?.roleAnchors) ? options?.roleAnchors : [];
    const sanitizedRawText = 移除思考标签块(rawText);
    const structured = 解析结构化词组结果(sanitizedRawText);
    if (structured) {
        return 序列化结构化词组结果(structured, strategy, roleAnchors);
    }
    const cleaned = 清洗最终主体提示词(sanitizedRawText, {
        isNovelAI: strategy === 'nai_character_segments'
    });
    if (!cleaned) return '';
    if (strategy === 'flat') return cleaned;
    return 序列化结构化词组结果({
        基础: cleaned,
        角色列表: []
    }, strategy, roleAnchors);
};

const 归一化单段词组转化器输出 = (
    rawText: string,
    options?: { isNovelAI?: boolean }
): string => {
    const sanitizedRawText = 移除思考标签块(rawText);
    const structured = 解析结构化词组结果(sanitizedRawText);
    const merged = structured
        ? 合并正向提示词片段(
            structured.基础,
            ...((structured.角色列表 || []).map((role) => 清理NAI角色段占位词(role?.内容 || '')))
        )
        : 清洗最终主体提示词(sanitizedRawText, { isNovelAI: options?.isNovelAI });
    return options?.isNovelAI
        ? 保守补全NAI权重语法(merged)
        : 清理生图词组输出(merged);
};

const 保守补全NAI权重语法 = (rawText: string): string => {
    const cleaned = 清理生图词组输出(
        清洗NAI脏权重语法(
            转换NAI括号权重语法(
                移除思考标签块(rawText)
            )
        )
    );
    if (!cleaned) return '';
    return cleaned;
};

const 截取最后场景判定之后 = (rawText: string): string => {
    const source = rawText || '';
    const regex = /<\s*场景判定\s*>/gi;
    let lastIndex = -1;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source))) {
        lastIndex = match.index;
    }
    return lastIndex >= 0 ? source.slice(lastIndex) : source;
};

const 提取判定说明后词组 = (rawText: string): string => {
    const source = rawText || '';
    const regex = /<\s*\/\s*判定说明\s*>/gi;
    let lastEndIndex = -1;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source))) {
        lastEndIndex = match.index + match[0].length;
    }
    if (lastEndIndex < 0) return '';
    const tail = source.slice(lastEndIndex).trim();
    if (!tail) return '';
    return tail
        .replace(/<\s*\/\s*词组\s*>/gi, '')
        .replace(/<\s*词组\s*>/gi, '')
        .replace(/<\s*\/\s*生图词组\s*>/gi, '')
        .replace(/<\s*生图词组\s*>/gi, '')
        .replace(/[<>/]/g, '')
        .trim();
};

const 解析场景词组响应 = (rawText: string): {
    场景类型: 场景生成类型;
    场景判定说明: string;
    生图词组: string;
} => {
    const mainPayload = 截取最后场景判定之后(rawText);
    const 判定文本 = 提取最后一个标签文本列表(mainPayload, ['场景判定', '判定']);
    const 场景类型文本 = 提取最后一个标签文本列表(mainPayload, ['场景类型', '输出类型', '模式']);
    const 判定说明 = 提取最后一个标签文本列表(mainPayload, ['判定说明', '说明', '理由'])
        .replace(/^[•\-]\s*/gm, '')
        .trim();
    const 结构化词组块 = 提取最后一个标签完整块(mainPayload, '提示词结构');
    const 词组标签内容 = 提取最后一个标签文本列表(mainPayload, ['词组', '生图词组']);
    const 生图词组 = 结构化词组块
        || 词组标签内容
        || 提取判定说明后词组(mainPayload)
        || 清理生图词组输出(mainPayload);
    const combined = `${判定文本}\n${场景类型文本}\n${判定说明}`;
    const 明确不适合快照 = /不适合场景快照|风景场景|风景|景观|山水|landscape/i.test(combined);
    const 明确适合快照 = /适合场景快照|场景快照/i.test(`${判定文本}\n${场景类型文本}`) && !/不适合/i.test(`${判定文本}\n${场景类型文本}`);
    const 场景类型: 场景生成类型 = 明确适合快照 && !明确不适合快照
        ? '场景快照'
        : '风景场景';
    return {
        场景类型,
        场景判定说明: 判定说明 || (场景类型 === '风景场景'
            ? '当前正文缺少足够稳定的单帧画面证据，已优先转为风景背景镜头。'
            : '当前正文具备明确地点、空间关系与可视化细节，可在背景优先前提下生成场景快照。'),
        生图词组
    };
};

const 解析可能是JSON字符串 = (text: string): any | null => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const 提取图片生成结果 = (payload: any): 图片生成结果 | null => {
    if (!payload || typeof payload !== 'object') return null;

    const 读取图片字段 = (value: any): 图片生成结果 | null => {
        if (!value) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
                return { 图片URL: trimmed };
            }
            if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 64) {
                return { 图片URL: `data:image/png;base64,${trimmed.replace(/\s+/g, '')}` };
            }
            return { 本地路径: trimmed };
        }
        if (typeof value === 'object') {
            const url = typeof value.url === 'string' ? value.url.trim() : '';
            const path = typeof value.path === 'string' ? value.path.trim() : (typeof value.local_path === 'string' ? value.local_path.trim() : '');
            const b64 = typeof value.b64_json === 'string'
                ? value.b64_json.trim()
                : (typeof value.base64 === 'string' ? value.base64.trim() : (typeof value.image_base64 === 'string' ? value.image_base64.trim() : (typeof value.image === 'string' ? value.image.trim() : '')));
            if (url) return { 图片URL: url };
            if (b64) return { 图片URL: `data:image/png;base64,${b64.replace(/\s+/g, '')}` };
            if (path) return { 本地路径: path };
        }
        return null;
    };

    const candidates = [
        payload?.data?.[0],
        payload?.images?.[0],
        payload?.output?.[0],
        payload?.result,
        payload?.image,
        payload?.url,
        payload?.path,
        payload
    ];

    for (const candidate of candidates) {
        const hit = 读取图片字段(candidate);
        if (hit) return hit;
    }

    return null;
};

export const buildNpcSecretPartDirectImagePrompt = (
    npcData: unknown,
    options: NPC秘档部位提示词选项
): { 原始描述: string; 生图词组: string } => {
    const source = (npcData && typeof npcData === 'object') ? npcData as Record<string, unknown> : {};
    const 部位 = options.部位;
    const 描述字段 = 香闺秘档部位描述字段映射[部位];
    const 描述文本 = 读取NPC字段文本(source, 描述字段);
    if (!描述文本) {
        throw new Error(`${部位}描述为空，无法生成${部位}特写。`);
    }

    const isNovelAI = options.后端类型 === 'novelai';
    const 额外要求 = (options?.额外要求 || '').trim();
    const 角色锚点注入词 = 构建角色锚点注入提示词(options?.角色锚点, { 构图: '部位特写', 部位 });
    const fragments = [
        isNovelAI ? 生成NovelAI人物数量标签(source) : 'single female subject',
        读取NPC字段文本(source, '性别') === '女' ? 'female' : '',
        角色锚点注入词,
        描述文本,
        额外要求
    ].map(item => item.trim()).filter(Boolean);

    return {
        原始描述: JSON.stringify({
            部位,
            描述字段,
            描述文本,
            角色锚点注入词,
            角色锚点: {
                名称: (options?.角色锚点?.名称 || '').trim(),
                正面提示词: (options?.角色锚点?.正面提示词 || '').trim(),
                负面提示词: (options?.角色锚点?.负面提示词 || '').trim(),
                结构化特征: options?.角色锚点?.结构化特征,
                姓名: 读取NPC字段文本(source, '姓名'),
                性别: 读取NPC字段文本(source, '性别'),
                年龄: 读取NPC字段文本(source, '年龄'),
                身份: 读取NPC字段文本(source, '身份'),
                外貌: 读取NPC字段文本(source, '外貌'),
                身材: 读取NPC字段文本(source, '身材'),
                衣着: 读取NPC字段文本(source, '衣着')
            }
        }, null, 2),
        生图词组: isNovelAI ? 保守补全NAI权重语法(合并正向提示词片段(...fragments)) : 合并正向提示词片段(...fragments)
    };
};

export const generateNpcSecretPartImagePrompt = async (
    npcData: unknown,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    options?: NPC秘档部位提示词选项
): Promise<{ 原始描述: string; 生图词组: string }> => {
    const source = (npcData && typeof npcData === 'object') ? npcData as Record<string, unknown> : {};
    const 部位 = options?.部位;
    if (!部位) {
        throw new Error('缺少目标部位，无法生成香闺秘档特写词组。');
    }
    const 描述字段 = 香闺秘档部位描述字段映射[部位];
    const 描述文本 = 读取NPC字段文本(source, 描述字段);
    if (!描述文本) {
        throw new Error(`${部位}描述为空，无法生成${部位}特写。`);
    }

    const 原始描述 = JSON.stringify({
        部位,
        描述字段,
        描述文本,
        角色资料: source
    }, null, 2);
    const 词组转化器AI角色提示词 = (apiConfig.词组转化器AI角色提示词 || '').trim();
    const 相关转换提示词 = (apiConfig.词组转化器提示词 || '').trim();
    const 额外要求 = (options?.额外要求 || '').trim();
    const isNovelAI = options?.后端类型 === 'novelai';
    const 启用画师串预设 = options?.启用画师串预设 === true;
    const 兼容模式 = options?.兼容模式 === true;
    const 风格提示词输入 = (options?.风格提示词输入 || '').trim();
    const 角色锚点 = options?.角色锚点;
    const 使用角色锚点 = Boolean((角色锚点?.正面提示词 || '').trim());
    const 角色锚点注入词 = 构建角色锚点注入提示词(角色锚点, { 构图: '部位特写', 部位 });
    const 特写说明 = 构建香闺秘档部位特写说明(部位);
    const 默认系统提示词 = (isNovelAI ? [
        '你是 NovelAI V4/V4.5 专用的武侠/仙侠私密部位特写提示词专家。',
        '任务：根据输入的角色资料、角色锚点和目标部位描述，生成稳定、可画的英文 tags。',
        '【输出策略】：可以使用 NovelAI 权重分组语法来组织构图、主体、局部细节和附加风格要求，但不要默认补充固定质量串或固定画风串。',
        '【构图规范】：极速聚焦（Macro Focus）。目标部位必须撑满画面，禁止任何退回半身、全身或普通人像的倾向。',
        '【视觉纹理】：重点描述 skins texture, subsurface scattering, glistening moisture, soft shadows, rim lighting。',
        '【解剖约束】：严格执行“单体准则”。禁止出现重复乳头、多重生殖器或镜像复制。若资料中包含多项描述，应提炼为单一、稳定的视觉焦点。',
        '【风格对齐】：跟随输入资料、额外要求和风格词，不要擅自附加档案页、参考页、拼贴页、多分镜或固定古风底座。',
        使用角色锚点 ? '【锚点对齐】：优先继承与目标部位稳定相关的身体特征，让局部细节与角色保持一致。' : '',
        '禁止生成：face, eyes, hair, arms, legs, background scenery, furniture, clothes (除非作为边缘遮挡)。',
        兼容模式 && 风格提示词输入 ? '请自然吸收并整合额外提供的风格词：' + 风格提示词输入 : '',
        `本次目标：${特写说明}`,
        '输出结构：请只输出 <提示词>...</提示词>。'
    ] : [
        '你是武侠/仙侠香闺秘档部位特写提示词转换器。',
        '任务：将角色资料、角色锚点与部位描述转化为稳定、可画的生图短语（英文 tags）。',
        '画面要求：纯粹的微距特写 (Macro shot)。目标部位占据 90% 以上画面，强调纹理、颜色、光泽与边缘细节。',
        '禁止退步：严禁生成包含头部、四肢或大幅场景的提示词。',
        '单体约束：画面中只能有一个目标器官，严禁任何形式的解剖重复或畸变镜像。',
        '质感表现：优先体现肤质（如玉、细腻）、湿润感、光影层次（侧逆光、柔光）以及布料的物理挤压关系。',
        '风格要求：跟随输入资料、额外要求和风格提示词；不要默认补充固定质量串、固定二次元风格串或固定写实风格串。',
        使用角色锚点 ? '锚点对齐：优先继承与目标部位稳定相关的身体特征，让局部细节与角色保持一致。' : '',
        '输出格式：使用英文逗号分隔的短语串。',
        兼容模式 && 风格提示词输入 ? '请吸收额外风格词并整合：' + 风格提示词输入 : '',
        `本次目标：${特写说明}`,
        '输出结构：请只输出 <提示词>...</提示词>。'
    ])
        .filter(Boolean)
        .join('\n');
    const taskPrompt = isNovelAI ? [
        '【角色与目标部位资料】',
        原始描述,
        使用角色锚点 ? `\n【角色稳定视觉锚点】\n${(角色锚点?.正面提示词 || '').trim()}` : '',
        角色锚点注入词 ? `\n【部位裁剪锚点】\n${角色锚点注入词}` : '',
        '',
        '【输出要求】',
        `目标部位：${部位}`,
        '输出语言：以英文 tags 为主，必要时可保留专有名词。',
        '格式：请只输出 <提示词>...</提示词>，其中内容使用英文逗号分隔。',
        '重点：只保留目标部位特写和最小必要周边，让局部细节完整、清晰、可画。',
        '镜头要求：必须是 extreme close-up / ultra tight crop，目标部位占据画面主体，不能退成普通近景。',
        '数量要求：只允许一个目标部位，不允许重复、镜像复制、并排复制。',
        '禁止内容：face, portrait, upper body, half body, full body, legs, hands, multiple people, room focus, scenery focus。',
        兼容模式 && 风格提示词输入 ? `额外风格正面提示词：${风格提示词输入}` : '',
        额外要求 ? `附加要求：${额外要求}` : '附加要求：无'
    ].join('\n') : [
        '【角色与目标部位资料】',
        原始描述,
        使用角色锚点 ? `\n【角色稳定视觉锚点】\n${(角色锚点?.正面提示词 || '').trim()}` : '',
        角色锚点注入词 ? `\n【部位裁剪锚点】\n${角色锚点注入词}` : '',
        '',
        '【额外生成要求】',
        '世界观：中国武侠/仙侠（古风）',
        `目标部位：${部位}`,
        '构图：部位特写 / 仅展示目标部位及其必要周边',
        '画面保持局部聚焦、单主体表达，禁止参考页、拼贴页、多分镜或宫格化排版。',
        '画面要求：描述必须具体、可见、可画，优先写形状、颜色、肌理、湿润感、边缘和布料裁切。',
        '镜头要求：必须是 extreme close-up / ultra tight crop，目标部位占据画面主体，不能退成普通近景。',
        '数量要求：只允许一个目标部位，不允许重复、镜像复制、并排复制。',
        '禁止内容：face, portrait, upper body, half body, full body, legs, hands, multiple people, room focus, scenery focus。',
        '格式：请只输出 <提示词>...</提示词>。',
        兼容模式 && 风格提示词输入 ? `额外风格正面提示词：${风格提示词输入}` : '',
        额外要求 ? `附加要求：${额外要求}` : '附加要求：无'
    ].join('\n');
    const raw = await 请求分词器文本({
        apiConfig,
        aiRolePrompt: 词组转化器AI角色提示词,
        systemPrompts: [相关转换提示词, 默认系统提示词, extraPrompt],
        taskPrompt,
        signal,
        cotPseudoHistoryPrompt,
        taskType: '部位特写'
    });
    const 生图词组 = 强化香闺秘档特写词组(
        合并正向提示词片段(
            角色锚点注入词,
            归一化单段词组转化器输出(raw, { isNovelAI })
        ),
        部位
    );
    if (!生图词组) {
        throw new Error('香闺秘档特写词组转化器未返回有效生图词组');
    }
    return { 原始描述, 生图词组 };
};

export const generateNpcImagePrompt = async (
    npcData: unknown,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    options?: NPC提示词选项
): Promise<{ 原始描述: string; 生图词组: string }> => {
    const 原始描述 = JSON.stringify(npcData ?? {}, null, 2);
    const 构图 = options?.构图 || '头像';
    const 画风要求 = options?.画风 || '通用';
    const 额外要求 = (options?.额外要求 || '').trim();
    const 词组转化器AI角色提示词 = (apiConfig.词组转化器AI角色提示词 || '').trim();
    const 相关转换提示词 = (apiConfig.词组转化器提示词 || '').trim();
    const isNovelAI = options?.后端类型 === 'novelai';
    const 输出策略 = isNovelAI
        ? (apiConfig.词组转化输出策略 === 'flat' ? 'nai_character_segments' : (apiConfig.词组转化输出策略 || 'nai_character_segments'))
        : (apiConfig.词组转化输出策略 || 'flat');
    const 启用画师串预设 = options?.启用画师串预设 === true;
    const 兼容模式 = options?.兼容模式 === true;
    const 风格提示词输入 = (options?.风格提示词输入 || '').trim();
    const 角色锚点 = options?.角色锚点;
    const 使用角色锚点 = Boolean((角色锚点?.正面提示词 || '').trim());
    const 构图说明 = 构图 === '立绘'
        ? '立绘/全身图，完整展示人物从头到脚的轮廓、站姿、服装层次与落地感。'
        : 构图 === '半身'
            ? '半身角色像，聚焦面部辨识、肩颈线条、上半身服饰层次与手部动作。'
            : '头像特写，聚焦头部与领口，保证五官辨识、目光与面部气质表达。';
    const 默认系统提示词 = (isNovelAI ? [
        `当前任务目标画风：${画风要求}。除非输入资料或附加要求明确指定，否则不要擅自锁定具体风格标签。`,
        '请把身份、境界、性格、外貌、身材和衣着转换成可见的角色信息，不要写成空泛气质词。',
        使用角色锚点
            ? '已提供稳定视觉锚点。请沿用锚点中的稳定主体，只补充当前镜头、姿态、表情、光影、环境和临时变化。'
            : '请先完成稳定身份辨识、外观、身材和常驻衣着，再补动作、镜头、光影和环境。',
        使用角色锚点 ? '' : '若原始资料较少，可以根据身份、境界、年龄、性别做低冲突保守补全，优先补出年龄感、脸部气质、体态、常驻衣着材质、身份道具和气场表现。',
        兼容模式 && 风格提示词输入 ? '请吸收额外提供的非主体风格正面提示词，并将其整理进最终词组。' : '',
        `当前构图要求：${构图说明}`,
        '请保持单一镜头距离、单一主姿态、单一主光源，不要混入相互冲突的多镜头、多动作或多光效。'
    ] : [
        `当前任务目标画风：${画风要求}。除非输入资料或附加要求明确指定，否则不要擅自锁定具体风格标签。`,
        '请把身份、境界、外貌、身材、衣着和性格转换成可见的画面信息，不要只输出抽象氛围。',
        使用角色锚点
            ? '已提供稳定视觉锚点。请沿用锚点中的稳定主体，只补充当前镜头、姿态、表情、光影、环境和临时变化。'
            : '请先完成稳定外观、常驻服饰和身份辨识，再补动作、镜头、光影和环境关系。',
        使用角色锚点 ? '' : '若原始资料较少，可以根据身份、境界、年龄、性别做低冲突保守补全，优先补出年龄感、脸部气质、体态、常驻衣着材质、身份道具和气场表现。',
        兼容模式 && 风格提示词输入 ? '请吸收额外提供的非主体风格正面提示词，并自然整理进最终输出。' : '',
        `当前构图要求：${构图说明}`,
        '请保持单一镜头距离、单一主姿态、单一主光源，避免互相冲突的镜头和动作。'
    ])
        .filter(Boolean)
        .join('\n');
    const taskPrompt = isNovelAI ? [
        '【NPC基础资料】',
        原始描述,
        使用角色锚点 ? `\n【角色稳定视觉锚点】\n${(角色锚点?.正面提示词 || '').trim()}` : '',
        '',
        '【输出要求】',
        `输出风格：${画风要求}。不要补充用户未要求的固定风格底座。`,
        '输出语言：英文 tags，使用英文逗号分隔。',
        `构图模式：${构图}`,
        '输出结构：请只输出 <提示词>...</提示词>。',
        '标签组织：优先整理成 4 到 6 个加权分组，再补少量自然标签。',
        使用角色锚点 ? '' : '请使用源数据里已有的稳定设定字段，尤其是身份、境界、外貌、身材、衣着和性格。',
        使用角色锚点 ? '' : '不要只返回姿态、镜头、光影或抽象气质词；<提示词> 内必须具备能长期复用的身份辨识、外观与服饰信息。',
        使用角色锚点 ? '' : '若资料字段不足，请根据身份、境界、年龄、性别自行补全最稳妥的可见设定，例如年龄感、脸型气质、体态、常驻服装层次、材质、配饰与身份道具。',
        兼容模式 && 风格提示词输入 ? `额外风格正面提示词：${风格提示词输入}` : '',
        构图 === '立绘'
            ? '构图重点：完整轮廓、站姿落地感、服装层次、鞋履与地面接触关系。'
            : 构图 === '半身'
                ? '构图重点：面部辨识、肩颈线条、上半身服饰层次与手部动作。'
                : '构图重点：头部与领口区域、五官辨识、目光、发丝与衣领细节。',
        '镜头约束：单一镜头距离、单一主姿态、单一主光源。',
        '色彩要求：从角色身份、衣着、环境和情绪线索中自然提炼，不要额外强塞固定配色模板。',
        使用角色锚点 ? '锚点模式下，请直接沿用锚点中的稳定外观，只在 <提示词> 内补镜头、动作、姿态、表情、构图、环境与临时变化。' : '',
        额外要求 ? `附加要求：${额外要求}` : '附加要求：无'
    ].join('\n') : [
        '【NPC基础资料】',
        原始描述,
        使用角色锚点 ? `\n【角色稳定视觉锚点】\n${(角色锚点?.正面提示词 || '').trim()}` : '',
        '',
        '【核心生图要求】',
        `风格：${画风要求}。不要默认补充二次元、写实或国风固定质量串。`,
        '世界观：中国武侠/仙侠（Ancient Chinese Fantasy）。',
        `构图：${构图}`,
        '输出结构：请只输出 <提示词>...</提示词>。',
        使用角色锚点 ? '' : '请显式使用输入资料中的身份、境界、外貌、身材、衣着和性格。',
        使用角色锚点 ? '' : '不要只输出镜头、姿态、光影或氛围；<提示词> 内必须先给出稳定外观、常驻服饰与身份辨识，再补动作和环境。',
        使用角色锚点 ? '' : '若资料字段不足，请根据身份、境界、年龄、性别自行补全最稳妥的可见设定，例如年龄感、脸型气质、体态、常驻服装层次、材质、配饰与身份道具。',
        兼容模式 && 风格提示词输入 ? `额外风格正面提示词：${风格提示词输入}` : '',
        构图 === '立绘'
            ? '构图重点：完整轮廓、站姿落地感、服装层次、鞋履与地面接触关系。'
            : 构图 === '半身'
                ? '构图重点：面部辨识、肩颈线条、上半身服饰层次与手部动作。'
                : '构图重点：头部与领口区域、五官辨识、目光、发丝与衣领细节。',
        '镜头约束：单一镜头距离、单一主姿态、单一主光源。',
        '色彩与光线：根据角色资料、服装、材质和场景自然生成，保持协调统一。',
        使用角色锚点 ? '锚点模式下，请直接沿用锚点中的基础外观，只在 <提示词> 内补镜头、动作、姿态、表情、构图和环境补充。' : '',
        额外要求 ? `附加要求：${额外要求}` : '附加要求：无'
    ].join('\n');
    const raw = await 请求分词器文本({
        apiConfig,
        aiRolePrompt: 词组转化器AI角色提示词,
        systemPrompts: [相关转换提示词, 默认系统提示词, extraPrompt],
        taskPrompt,
        signal,
        cotPseudoHistoryPrompt,
        taskType: '角色'
    });
    const 序列化结果 = 序列化词组转化器输出(raw, {
        strategy: 输出策略,
        roleAnchors: 角色锚点
            ? [{
                名称: '角色1',
                正面提示词: (角色锚点?.正面提示词 || '').trim(),
                负面提示词: (角色锚点?.负面提示词 || '').trim(),
                结构化特征: 角色锚点?.结构化特征
            }]
            : []
    });
    const 生图词组 = 输出策略 === 'flat' && isNovelAI
        ? 保守补全NAI权重语法(序列化结果)
        : 序列化结果;
    if (!生图词组) {
        throw new Error('词组转化器未返回有效生图词组');
    }
    return { 原始描述, 生图词组 };
};

export const generateSceneImagePrompt = async (
    bodyText: string,
    sceneContext: unknown,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    options?: {
        画风?: 当前可用接口结构['画风'];
        后端类型?: 当前可用接口结构['图片后端类型'];
        启用画师串预设?: boolean;
        兼容模式?: boolean;
        风格提示词输入?: string;
        额外要求?: string;
        构图要求?: '纯场景' | '故事快照';
        角色锚点列表?: 场景角色锚点输入[];
    }
): Promise<{ 原始描述: string; 生图词组: string; 场景类型: 场景生成类型; 场景判定说明: string }> => {
    const trimmedBody = (bodyText || '').trim();
    if (!trimmedBody) {
        throw new Error('缺少可用于场景生图的正文内容');
    }
    const 词组转化器AI角色提示词 = (apiConfig.词组转化器AI角色提示词 || '').trim();
    const 相关场景提示词 = (apiConfig.词组转化器提示词 || '').trim();
    const 相关场景判定提示词 = (apiConfig.场景判定提示词 || '').trim();
    const 启用画师串预设 = options?.启用画师串预设 === true;
    const 兼容模式 = options?.兼容模式 === true;
    const 风格提示词输入 = (options?.风格提示词输入 || '').trim();
    const isNovelAI = options?.后端类型 === 'novelai';
    const 输出策略 = isNovelAI
        ? 'nai_character_segments'
        : (apiConfig.词组转化输出策略 || 'flat');
    const 构图要求 = options?.构图要求;
    const 额外要求 = (options?.额外要求 || '').trim();
    const 原始角色锚点列表 = Array.isArray(options?.角色锚点列表) ? options?.角色锚点列表.filter((item) => (item?.正面提示词 || '').trim()) : [];
    const 纯场景模式 = 构图要求 === '纯场景';
    const 角色锚点列表 = 纯场景模式 ? [] : 原始角色锚点列表;
    const 使用角色锚点 = 角色锚点列表.length > 0;
    const 强制构图 = 构图要求 === '纯场景' || 构图要求 === '故事快照';
    const 场景风格要求 = 风格提示词输入 || '跟随正文、场景资料和附加要求决定';
    const 默认系统提示词 = 强制构图 ? [
        '你是武侠/仙侠场景提示词转换器。',
        '任务：把当前场景整理成可直接生图的高质量英文 tags。',
        `目标画风：${场景风格要求}。除非正文、附加要求或风格提示词明确指定，否则不要擅自锁定二次元、写实、国风等具体风格标签。`,
        纯场景模式
            ? '推荐结构：质量底座 -> 场景介质 -> 地点/时间天气 -> 空间层级与材质 -> 镜头与光影。'
            : '推荐结构：质量底座 -> 场景介质 -> 地点/时间天气 -> 空间层级与材质 -> 人物站位/互动 -> 镜头与光影。',
        纯场景模式
            ? '质量、画风和整体环境基调适合权重分组；空间层级、材质细节、天气和光影适合自然标签表达。'
            : '质量、画风和整体环境基调适合权重分组；人物站位、动作关系、材质细节和天气气氛适合自然标签表达。',
        '【空间构图逻辑 (Spatial Logic)】：请按以下结构描述画面：',
        '1) 背景 (Background)：天色、星辰、远山、建筑远影。',
        '2) 中景 (Midground)：地点主体、主要植被、地貌细节。',
        '3) 前景 (Foreground)：点景器物、近端花草、地面纹理。',
        纯场景模式
            ? '4) 视觉重心 (Placement)：明确核心景物或主景位于左(Left)、中(Center)或右(Right)。'
            : '4) 方位 (Placement)：明确人物或核心视觉锚点在左(Left)、中(Center)或右(Right)。',
        '【光影效果】：描述光线方向（Side lighting, Rim lighting）与氛围（God rays, Atmospheric haze）。',
        构图要求 === '故事快照'
            ? '故事快照时，让主互动人物成为清晰焦点，同时保留足够的地点、材质和空间信息。'
            : '纯场景时，让地点、季节、天气、材质、景深和主光源先成立。',
        '输出的场景保持单一可执行镜头，让时间、天气和视角自然统一。',
        使用角色锚点 ? '若已提供角色锚点，请直接沿用这些角色的稳定外观，把场景输出重点放在站位、动作、互动、表情、镜头与环境关系。' : '',
        构图要求 === '纯场景'
            ? '构图要求：纯场景，完整展开环境空间、材质、天气和光影。'
            : '构图要求：故事快照，优先抓取一个可执行的单帧互动，允许 tighter framing、portrait-friendly composition 或 vertical composition 语义。',
        纯场景模式
            ? '纯场景硬约束：最终只输出场景/风景/建筑/天气/材质/光影相关 tags，禁止输出任何角色、人物、性别、动作、表情、服饰、互动或站位 tags。'
            : '',
        兼容模式 && 风格提示词输入 ? '请吸收额外提供的非主体风格正面提示词，并将其提炼进最终场景词组中。' : '',
        '词组使用短语串，按逗号分隔。',
        '若目标后端是 NovelAI，优先使用带权重的标签分组，例如 1.22::anime background, scenic composition::, 1.1::misty courtyard, wet stone path::。',
        纯场景模式
            ? '输出格式固定为 <提示词结构><基础>...</基础></提示词结构>。'
            : '输出格式固定为 <提示词结构><基础>...</基础><角色>[1]角色名称|tags\n[2]角色名称|tags</角色></提示词结构>。',
        纯场景模式 ? '' : '若存在角色，必须把角色内容写进单个 <角色> 块，并用 [序号] 开头逐条输出。'
    ] : [
        '你是武侠/仙侠场景提示词判定与转换器。',
        '任务：判断当前正文更适合生成“风景场景”还是“故事快照”，并整理成可直接生图的场景词组。',
        `核心画风：${场景风格要求}。除非正文、附加要求或风格提示词明确指定，否则不要擅自锁定二次元、写实、国风等具体风格标签。`,
        '当正文能够稳定落成单一可见时刻时，选择故事快照；其余情况优先选择风景场景。',
        '故事快照优先信号：明确地点、可见环境细节、在场角色、稳定姿态、清晰动作、视线关系、道具交互、空间方向、单帧时刻感。',
        '空间构图始终遵循：Background -> Midground -> Foreground。',
        '方位说明：为核心视觉锚点标出 L/C/R 位置。',
        '视觉材质：主动写出 Weathered stone, Glistening water, Flowing clouds, Mossy roof tiles 这类可见材质。',
        '对话、心理、设定说明、回忆总结和抽象气氛更适合转成风景场景；清晰单帧事件更适合故事快照。',
        '故事快照中控制人物密度与动作复杂度，让画面保持清晰稳定。',
        '若最终判定为风景场景，必须只输出环境/风景/建筑/天气/材质/光影 tags，禁止输出任何角色标签或 <角色> 段。',
        兼容模式 && 风格提示词输入 ? '请吸收额外提供的非主体风格正面提示词，并在最终结果中提炼输出。' : '',
        使用角色锚点 ? '若已提供角色锚点，只有在判定为故事快照时才沿用这些角色的稳定外观，把输出重点放在构图、角色站位、动作关系、镜头和环境补充。' : '',
        '标签格式要求：',
        '1) <thinking>...</thinking>',
        '2) <场景判定>适合场景快照 或 不适合场景快照</场景判定>',
        '3) <判定说明>...</判定说明>',
        '4) <场景类型>场景快照 或 风景场景</场景类型>',
        '5) 若为风景场景，输出 <提示词结构><基础>...</基础></提示词结构>；若为场景快照，输出 <提示词结构><基础>...</基础><角色>[1]角色名称|tags\n[2]角色名称|tags</角色></提示词结构>'
    ].filter(Boolean).join('\n');
    const taskPrompt = [
        '【环境层级与具体坐标】',
        `大地点（远景）：${(sceneContext as any)?.大地点 || '未知'}`,
        `具体地点（近景/舞台）：${(sceneContext as any)?.具体地点 || '未知'}`,
        使用角色锚点
            ? `角色锚点：\n${角色锚点列表
                .map((item, index) => `[${index + 1}]${(item?.名称 || '').trim() || `角色${index + 1}`}|${(item?.正面提示词 || '').trim()}`)
                .join('\n')}`
            : '',
        兼容模式 && 风格提示词输入 ? `额外风格正面提示词：${风格提示词输入}` : '',
        '',
        '【当前上下文详情】',
        typeof sceneContext === 'string' ? sceneContext : JSON.stringify(sceneContext ?? {}, null, 2),
        '',
        '【最新正文】',
        trimmedBody,
        '',
        '【生图核心约束】',
        `风格：${场景风格要求}。不要默认补充固定二次元质量串。`,
        '位阶构图：利用 [大地点] 渲染宏大的视觉远景/地标，利用 [具体地点] 渲染细腻的活动区/前景。',
        '空间要求：Background (Far) -> Midground (Main) -> Foreground (Close) 逻辑层次。',
        纯场景模式
            ? '方位要求：必须明确主景或核心视觉重心位于画面 左(Left)、中(Center) 或 右(Right)。'
            : '方位要求：必须明确视觉锚点位于画面 左(Left)、中(Center) 或 右(Right)。',
        纯场景模式
            ? '结构化输出：只写 <基础>，内容只包含环境、建筑、地形、天气、材质、镜头、布局、光影与景深；不要输出 <角色>。'
            : '结构化输出：<基础> 写环境、镜头、天气、布局、多人关系框架；<角色> 内按 [序号]角色名称|tags 逐条写该角色的外观锚点补充、动作、姿态、视线与环境/他人的关系。',
        !纯场景模式 && isNovelAI ? 'NovelAI 最终会使用 | 连接基础段与角色段；每条 [序号] 角色内容开头优先写 1girl、1boy、1woman 或 1man。' : '',
        '武侠意境：自然融入气场 (Qi aura)、剑意残影 (Sword intent)、写意留白 (Xieyi ink-wash bits) 或粒子特效（如花瓣、流光）。',
        使用角色锚点 ? '锚点模式下，请直接沿用角色的稳定外观，让 [序号] 角色内容集中承载站位、动作、关系、镜头和环境。' : '',
        构图要求 === '纯场景'
            ? '构图要求：纯风景，默认宽景，完整展开环境层级。最终只允许输出场景/风景 tags，禁止输出人物相关 tags。'
            : 构图要求 === '故事快照'
                ? '构图要求：故事快照，优先抓取一个清晰互动瞬间；人物可以成为主焦点，但必须保留地点层级、地面关系与环境补充。'
                : '构图要求：未指定。若正文适合快照，则抓取单帧互动；否则回退为环境主导的风景场景。',
        纯场景模式
            ? '输出顺序：质量与介质 -> 地点与天气 -> 空间层级与材质 -> 镜头与光影。'
            : '输出顺序：质量与介质 -> 地点与天气 -> 空间层级与材质 -> 人物站位/互动 -> 镜头与光影。',
        额外要求 ? `额外要求：${额外要求}` : '额外要求：无',
        '要求：词组应以英文 tags 为主，包含具体的光影描述（如 God rays, Twilight glow）和材质细节（如 Weathered moss, Reflected water）。'
    ].filter(Boolean).join('\n');
    const 场景系统提示词列表: Array<string | undefined> = (强制构图
        ? [相关场景提示词, 默认系统提示词, extraPrompt]
        : [相关场景提示词, 相关场景判定提示词, 默认系统提示词, extraPrompt]
    ).map((item) => Array.isArray(item) ? item.join('\n') : item);
    const raw = await 请求分词器文本({
        apiConfig,
        aiRolePrompt: 词组转化器AI角色提示词,
        systemPrompts: 场景系统提示词列表,
        taskPrompt,
        signal,
        cotPseudoHistoryPrompt,
        taskType: '场景'
    });
    const parsed = 强制构图
        ? (() => {
            const 生图词组 = 提取最后一个标签完整块(raw, '提示词结构')
                || 提取最后一个标签文本列表(raw, ['词组', '生图词组'])
                || raw;
            const 场景类型: 场景生成类型 = 构图要求 === '故事快照' ? '场景快照' : '风景场景';
            return {
                场景类型,
                场景判定说明: 构图要求 === '故事快照' ? '已按手动要求生成故事快照。' : '已按手动要求生成纯场景。',
                生图词组
            };
        })()
        : 解析场景词组响应(raw);
    const 序列化角色锚点列表 = parsed.场景类型 === '风景场景' ? [] : 角色锚点列表;
    const 序列化结果 = 序列化词组转化器输出(parsed.生图词组, {
        strategy: 输出策略,
        roleAnchors: 序列化角色锚点列表
    });
    const 生图词组 = 输出策略 === 'flat' && isNovelAI
        ? 保守补全NAI权重语法(序列化结果)
        : 序列化结果;
    if (!生图词组) {
        throw new Error('场景词组转化器未返回有效生图词组');
    }
    const 原始描述 = JSON.stringify({
        最新正文: trimmedBody,
        场景上下文: sceneContext ?? {},
        场景判定: {
            场景类型: parsed.场景类型,
            判定说明: parsed.场景判定说明,
            是否适合场景快照: parsed.场景类型 === '场景快照'
        }
    }, null, 2);
    return {
        原始描述,
        生图词组,
        场景类型: parsed.场景类型,
        场景判定说明: parsed.场景判定说明
    };
};

export const generateImageByPrompt = async (
    prompt: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    options?: { 构图?: '头像' | '半身' | '立绘' | '场景' | '部位特写'; 场景类型?: 场景生成类型; 附加正向提示词?: string; 附加负面提示词?: string; 尺寸?: string; 跳过基础负面提示词?: boolean; PNG参数?: PNG解析参数结构 }
): Promise<图片生成结果> => {
    const endpoint = 构建图片端点(apiConfig.baseUrl, apiConfig.图片接口路径);
    if (!endpoint) throw new Error('Missing API Base URL');
    const promptBundle = 构建最终图片提示词(prompt, apiConfig, options);
    const normalizedPrompt = promptBundle.最终正向提示词;
    if (!normalizedPrompt) throw new Error('Missing image prompt');

    const responseFormat = apiConfig.图片响应格式 === 'b64_json' ? 'b64_json' : 'url';
    const backendType = apiConfig.图片后端类型 || 'openai';
    const shouldUseCustomOpenAIPayload = apiConfig.图片走OpenAI自定义格式 === true;
    const isChatCompletionsEndpoint = /\/chat\/completions$/i.test(endpoint);
    const negativePromptText = promptBundle.最终负向提示词;
    const promptWithInlineNegative = promptBundle.带内联负面提示词的正向提示词;
    const shouldSkipBaseNegative = options?.跳过基础负面提示词 === true;
    const size = promptBundle.尺寸;
    const width = promptBundle.宽度;
    const height = promptBundle.高度;
    if (backendType === 'novelai' && !(apiConfig.apiKey || '').trim()) {
        throw new Error('NovelAI 缺少 Persistent API Token，请先在文生图设置中填写');
    }

    if (backendType === 'comfyui') {
        const result = await 执行ComfyUI生图(
            normalizedPrompt,
            apiConfig,
            responseFormat,
            size,
            negativePromptText,
            signal,
            options?.PNG参数
        );
        return {
            ...result,
            最终正向提示词: normalizedPrompt,
            最终负向提示词: negativePromptText
        };
    }

    let requestBody: Record<string, unknown>;
    if (backendType === 'sd_webui') {
        const sdSampler = 规范化SD采样器与调度器(options?.PNG参数);
        requestBody = {
            prompt: normalizedPrompt,
            negative_prompt: negativePromptText || undefined,
            width,
            height,
            steps: Number.isFinite(Number(options?.PNG参数?.步数)) ? Math.max(1, Math.floor(Number(options?.PNG参数?.步数))) : 28,
            cfg_scale: Number.isFinite(Number(options?.PNG参数?.CFG强度)) ? Number(options?.PNG参数?.CFG强度) : 7,
            sampler_name: sdSampler.samplerName,
            scheduler: sdSampler.scheduler,
            batch_size: 1,
            n_iter: 1
        };
    } else if (backendType === 'novelai') {
        requestBody = 构建NovelAI请求体(normalizedPrompt, apiConfig, size, options?.附加负面提示词, {
            跳过基础负面提示词: shouldSkipBaseNegative,
            PNG参数: options?.PNG参数
        });
    } else {
        requestBody = isChatCompletionsEndpoint
            ? {
                model: apiConfig.model,
                stream: false,
                messages: [
                    {
                        role: 'user',
                        content: promptWithInlineNegative
                    }
                ]
            }
            : {
                model: apiConfig.model,
                prompt: promptWithInlineNegative,
                n: 1,
                size
            };
        if (shouldUseCustomOpenAIPayload || responseFormat === 'b64_json') {
            requestBody.response_format = responseFormat === 'b64_json'
                ? { type: 'b64_json' }
                : { type: 'url' };
        }
    }

    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: 构建生图请求头(apiConfig),
            body: JSON.stringify(requestBody),
            signal
        });
    } catch (error: any) {
        if (backendType === 'novelai') {
            throw new Error(`NovelAI 请求失败：${error?.message || '网络异常'}。如果你在本地开发环境，请确认仍在通过 Vite dev server 访问，并使用 https://image.novelai.net 作为基础地址。`);
        }
        throw error;
    }

    if (!response.ok) {
        const detail = await 读取失败详情文本(response, Number.POSITIVE_INFINITY);
        if (backendType === 'novelai' && response.status >= 500 && !detail) {
            throw new 协议请求错误('图片生成请求失败: 500 - NovelAI 代理握手失败，请重启 Vite 开发服务器后重试。', response.status, detail);
        }
        throw new 协议请求错误(`图片生成请求失败: ${response.status}${detail ? ` - ${detail}` : ''}`, response.status, detail);
    }

    if (backendType === 'novelai') {
        const result = await 解析NovelAI图片响应(response);
        return {
            ...result,
            最终正向提示词: normalizedPrompt,
            最终负向提示词: negativePromptText
        };
    }

    const rawText = await response.text();
    const parsed = 解析可能是JSON字符串(rawText);
    const result = 提取图片生成结果(parsed);
    if (!result) {
        const completionText = parsed ? 提取OpenAI完整文本(parsed) : '';
        const textToParse = completionText || rawText;

        // 新增：支持 grok-imagine 等模型返回 Markdown 图片链接的格式
        // 优先尝试解析 Markdown 格式: ![...](URL)，兼容 http/https 和 data:
        const markdownUrlRegex = /!\[.*?\]\(([^)]+)\)/;
        const markdownMatch = textToParse.match(markdownUrlRegex);
        if (markdownMatch && markdownMatch[1]) {
            return {
                图片URL: markdownMatch[1].trim(),
                原始响应: rawText,
                最终正向提示词: normalizedPrompt,
                最终负向提示词: negativePromptText
            };
        }
        throw new Error(`图片生成响应无法解析: ${rawText.slice(0, 500)}`);
    }

    return {
        ...result,
        原始响应: rawText,
        最终正向提示词: normalizedPrompt,
        最终负向提示词: negativePromptText
    };
};

export const persistImageAssetLocally = async (
    result: 图片生成结果
): Promise<图片生成结果> => {
    const local = (result?.本地路径 || '').trim();
    if (local) {
        return {
            ...result,
            图片URL: undefined,
            本地路径: local
        };
    }

    const imageUrl = (result?.图片URL || '').trim();
    if (!imageUrl) {
        throw new Error('没有可保存的图片地址');
    }
    if (/^data:image\//i.test(imageUrl)) {
        const assetRef = await dbService.保存图片资源(imageUrl);
        return {
            ...result,
            图片URL: undefined,
            本地路径: assetRef
        };
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
        return {
            ...result,
            图片URL: undefined,
            本地路径: imageUrl
        };
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`保存本地副本失败: ${response.status}${detail ? ` - ${detail.slice(0, 200)}` : ''}`);
    }
    const blob = await response.blob();
    const dataUrl = await blob转DataUrl(blob);
    if (!dataUrl) {
        throw new Error('保存本地副本失败：图片内容为空');
    }
    const assetRef = await dbService.保存图片资源(dataUrl);
    return {
        ...result,
        图片URL: undefined,
        本地路径: assetRef
    };
};
