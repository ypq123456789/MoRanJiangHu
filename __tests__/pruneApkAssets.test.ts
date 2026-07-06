import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 获取默认拍卖物品图片档案 } from '../data/defaultAuctionItemImages';

describe('APK asset pruning', () => {
    it('excludes hosted auction item images from APK assets', () => {
        const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'prune-apk-assets.mjs'), 'utf8');

        expect(script).toContain("'auction-items'");
    });

    it('uses hosted URLs for default auction item images', () => {
        const archive = 获取默认拍卖物品图片档案('火鸦羽');
        const imageUrl = archive?.最近生图结果?.图片URL || '';

        expect(imageUrl).toMatch(/^https:\/\/msjh\.bacon159\.pp\.ua\/api\/preset-image\//);
        expect(imageUrl).not.toContain('/assets/auction-items/');
    });
});
