/**
 * Extremely basic ID3v2 parser to extract common tags and cover art
 */

export interface MusicMetadata {
    title?: string;
    artist?: string;
    coverUrl?: string;
    lyrics?: string;
}

export async function parseMusicMetadata(buffer: ArrayBuffer): Promise<MusicMetadata> {
    const view = new DataView(buffer);
    
    // Check for ID3v2 header
    if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
        return {};
    }

    const version = view.getUint8(3);
    if (version < 2 || version > 4) return {};

    // Size is synchsafe: 4 bytes, 7 bits each
    const size = ((view.getUint8(6) & 0x7F) << 21) |
                 ((view.getUint8(7) & 0x7F) << 14) |
                 ((view.getUint8(8) & 0x7F) << 7) |
                 (view.getUint8(9) & 0x7F);

    let offset = 10;
    const metadata: MusicMetadata = {};

    while (offset < size + 10) {
        let frameId = "";
        let frameSize = 0;

        if (version === 2) {
            frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2));
            frameSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5);
            offset += 6;
        } else {
            frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
            if (version === 3) {
                frameSize = view.getUint32(offset + 4);
            } else {
                // v4 has synchsafe size
                frameSize = ((view.getUint8(offset + 4) & 0x7F) << 21) |
                            ((view.getUint8(offset + 5) & 0x7F) << 14) |
                            ((view.getUint8(offset + 6) & 0x7F) << 7) |
                            (view.getUint8(offset + 7) & 0x7F);
            }
            offset += 10;
        }

        if (frameSize <= 0 || offset + frameSize > buffer.byteLength) break;

        const frameData = buffer.slice(offset, offset + frameSize);
        
        try {
            if (frameId === "TIT2" || frameId === "TT2") {
                metadata.title = decodeTextFrame(frameData);
            } else if (frameId === "TPE1" || frameId === "TP1") {
                metadata.artist = decodeTextFrame(frameData);
            } else if (frameId === "APIC" || frameId === "PIC") {
                metadata.coverUrl = decodeImageFrame(frameData, version);
            } else if (frameId === "USLT" || frameId === "ULT") {
                metadata.lyrics = decodeLyricsFrame(frameData, version);
            }
        } catch (e) {
            console.warn("Failed to parse frame", frameId, e);
        }

        offset += frameSize;
    }

    return metadata;
}

function decodeTextFrame(data: ArrayBuffer): string {
    const view = new DataView(data);
    const encoding = view.getUint8(0);
    const textData = data.slice(1);
    
    if (encoding === 0) { // ISO-8859-1
        return new TextDecoder("windows-1252").decode(textData).replace(/\0/g, "");
    } else if (encoding === 1) { // UTF-16 with BOM
        return new TextDecoder("utf-16").decode(textData).replace(/\0/g, "");
    } else if (encoding === 3) { // UTF-8
        return new TextDecoder("utf-8").decode(textData).replace(/\0/g, "");
    }
    return "";
}

function decodeImageFrame(data: ArrayBuffer, version: number): string | undefined {
    const view = new DataView(data);
    let offset = 1; // skip encoding
    
    let mimeType = "";
    if (version === 2) {
        const format = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2));
        mimeType = format === "JPG" ? "image/jpeg" : "image/png";
        offset += 3;
    } else {
        while (view.getUint8(offset) !== 0) {
            mimeType += String.fromCharCode(view.getUint8(offset));
            offset++;
        }
        offset++; // null terminator
    }
    
    const pictureType = view.getUint8(offset);
    offset++;
    
    // description (null terminated)
    const encoding = view.getUint8(0);
    if (encoding === 1) { // UTF-16
        while (view.getUint16(offset) !== 0) offset += 2;
        offset += 2;
    } else {
        while (view.getUint8(offset) !== 0) offset++;
        offset++;
    }
    
    const imageData = data.slice(offset);
    const blob = new Blob([imageData], { type: mimeType });
    return URL.createObjectURL(blob);
}

function decodeLyricsFrame(data: ArrayBuffer, version: number): string {
    const view = new DataView(data);
    let offset = 1; // skip encoding
    
    // language (3 bytes)
    offset += 3;
    
    // description (null terminated)
    const encoding = view.getUint8(0);
    if (encoding === 1) { // UTF-16
        while (view.getUint16(offset) !== 0) offset += 2;
        offset += 2;
    } else {
        while (view.getUint8(offset) !== 0) offset++;
        offset++;
    }
    
    const lyricsData = data.slice(offset);
    if (encoding === 0) {
        return new TextDecoder("windows-1252").decode(lyricsData).replace(/\0/g, "");
    } else if (encoding === 1) {
        return new TextDecoder("utf-16").decode(lyricsData).replace(/\0/g, "");
    } else if (encoding === 3) {
        return new TextDecoder("utf-8").decode(lyricsData).replace(/\0/g, "");
    }
    return "";
}
