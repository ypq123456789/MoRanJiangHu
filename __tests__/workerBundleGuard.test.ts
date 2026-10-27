import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    检查Worker打包产物,
    解析Wrangler配置路径,
    读取Wrangler入口路径,
    读取最新修改时间
} from '../scripts/lib/workerBundleGuard.mjs';

const 创建临时工程 = (): string => {
    const 根目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'msjh-guard-'));
    fs.mkdirSync(path.join(根目录, 'functions', 'api', 'ai-relay'), { recursive: true });
    fs.mkdirSync(path.join(根目录, '.tmp-worker-build'), { recursive: true });
    fs.writeFileSync(path.join(根目录, 'functions', 'api', 'ai-relay', '[[path]].ts'), 'export {};\n');
    return 根目录;
};

describe('Worker 打包产物部署闸门', () => {
    let 根目录 = '';

    beforeEach(() => {
        根目录 = 创建临时工程();
    });

    afterEach(() => {
        // 临时目录保留在系统 temp 下，不做删除（本机删除路径会走回收站闸门）
    });

    it('wrangler 配置可解析出 main（含 JSONC 注释）', () => {
        const 配置路径 = path.join(根目录, 'wrangler.jsonc');
        fs.writeFileSync(配置路径, `{
  // 打包产物入口
  "name": "dummy",
  "main": ".tmp-worker-build/worker-entry.ts" /* 由 worker:functions 生成 */
}\n`);
        expect(读取Wrangler入口路径(配置路径)).toBe('.tmp-worker-build/worker-entry.ts');
        expect(读取Wrangler入口路径(path.join(根目录, 'missing.jsonc'))).toBe('');
    });

    it('--config 支持空格与等号两种写法', () => {
        expect(解析Wrangler配置路径(['deploy', '--config', 'wrangler.152.jsonc'])).toBe('wrangler.152.jsonc');
        expect(解析Wrangler配置路径(['deploy', '--config=wrangler.152.jsonc'])).toBe('wrangler.152.jsonc');
        expect(解析Wrangler配置路径(['deploy', '-c', 'w.jsonc'])).toBe('w.jsonc');
        expect(解析Wrangler配置路径(['deploy'])).toBe('');
    });

    it('产物缺失时阻止部署并提示重新打包', () => {
        const 结果 = 检查Worker打包产物({
            项目根目录: 根目录,
            打包入口路径: '.tmp-worker-build/worker-entry.ts'
        });
        expect(结果.需要检查).toBe(true);
        expect(结果.ok).toBe(false);
        expect(String(结果.原因)).toContain('worker:functions');
    });

    it('产物比源码旧时阻止部署（v1.0.696 旧 bundle 事故）', () => {
        const 入口 = path.join(根目录, '.tmp-worker-build', 'worker-entry.ts');
        fs.writeFileSync(入口, 'export {};\n');
        const 旧时间 = new Date(Date.now() - 60_000);
        fs.utimesSync(入口, 旧时间, 旧时间);
        fs.writeFileSync(path.join(根目录, 'functions', 'api', 'ai-relay', '[[path]].ts'), '// 新改动\n');

        const 结果 = 检查Worker打包产物({ 项目根目录: 根目录, 打包入口路径: '.tmp-worker-build/worker-entry.ts' });
        expect(结果.ok).toBe(false);
        expect(String(结果.原因)).toContain('worker:functions');
    });

    it('产物比源码新时放行', () => {
        fs.writeFileSync(path.join(根目录, '.tmp-worker-build', 'worker-entry.ts'), 'export {};\n');
        const 结果 = 检查Worker打包产物({ 项目根目录: 根目录, 打包入口路径: '.tmp-worker-build/worker-entry.ts' });
        expect(结果.需要检查).toBe(true);
        expect(结果.ok).toBe(true);
    });

    it('非打包产物入口（源码直接部署）不做新鲜度检查', () => {
        const 结果 = 检查Worker打包产物({ 项目根目录: 根目录, 打包入口路径: 'functions/_worker.ts' });
        expect(结果.需要检查).toBe(false);
        expect(结果.ok).toBe(true);
        expect(检查Worker打包产物({ 项目根目录: 根目录, 打包入口路径: '' }).需要检查).toBe(false);
    });

    it('读取最新修改时间忽略丢失目录', () => {
        expect(读取最新修改时间(path.join(根目录, 'not-exists'))).toBe(0);
        expect(读取最新修改时间(path.join(根目录, 'functions'))).toBeGreaterThan(0);
    });
});
