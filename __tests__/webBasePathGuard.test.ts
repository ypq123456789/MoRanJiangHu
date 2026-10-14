/**
 * 白屏防线回归测试（v1.0.685 官网白屏事故）
 *
 * 事故：`npx vite build --base=/` 在 Git Bash 下被 MSYS 转成
 * `--base=/workbuddy/resources/vendor/PortableGit/`，产物 index.html 引用
 * `/workbuddy/.../assets/index-XXX.js`，线上 404 → 整页白屏。
 *
 * 这里锁死三道防线，任何一条被误删/改弱都会红：
 *   1. `断言Base路径合法` 能识别全部污染形态；
 *   2. vite.config.ts 里 base 校验被挂成**真正的 plugin**（不是写在 config 对象上的死代码，
 *      实测 vite 只对 plugins 数组里的插件触发 configResolved）；
 *   3. `scripts/verify-web-dist.mjs` 存在且能识别坏产物。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { 断言Base合法, 断言产物引用合法, 是否本机路径 } from '../vite.config';

const 根目录 = path.resolve(__dirname, '..');
const 读文件 = (相对: string) => fs.readFileSync(path.join(根目录, 相对), 'utf8');

describe('base 路径防线：断言Base合法（用于 base 本身）', () => {
  it('放行合法的 base', () => {
    for (const 合法 of ['/', '', './', '/app/', '/msjh/']) {
      expect(() => 断言Base合法(合法, 'test')).not.toThrow();
    }
  });

  it('拦截 v1.0.685 事故的真实污染值（MSYS 转换后的 base）', () => {
    // 这正是当时 CLI 传进去、被 MSYS 二次转换后 vite 实际拿到的值
    expect(() => 断言Base合法('/workbuddy/resources/vendor/PortableGit/', 'test')).toThrow(/非法 base/);
  });

  it('拦截 Windows 盘符 / 反斜杠 / 端口混合 / 多段路径', () => {
    const 非法样本 = [
      'C:////workbuddy////assets',
      'C:/workbuddy/assets',
      '/workbuddy\\resources',
      'C:1234',
      '/a/b/c',
      '//evil.example.com/x',
      '/msys64/home',
    ];
    for (const 样本 of 非法样本) {
      expect(() => 断言Base合法(样本, 'test'), 样本).toThrow(/非法 base/);
    }
  });

  it('错误信息里带修法提示（MSYS2_ARG_CONV_EXCL）', () => {
    let 报错信息 = '';
    try {
      断言Base合法('/workbuddy/resources/vendor/PortableGit/', 'test');
    } catch (e) {
      报错信息 = String((e as Error)?.message || e);
    }
    expect(报错信息).toContain('MSYS2_ARG_CONV_EXCL');
    expect(报错信息).toContain('白屏');
  });
});

describe('base 路径防线：断言产物引用合法（用于资源引用，勿与 base 规则混用）', () => {
  it('放行合法的资源引用（base=/ 与子路径部署都会被 generateBundle 扫到）', () => {
    // ⚠️ 回归用例：早期版本对「资源引用」套用了 base 的多段路径规则，
    // 结果合法的 /assets/index.js 与 /app/assets/index.js 被误判 → 正常构建被中断。
    const 合法引用 = [
      '/assets/index-BdsIN4n-.js',
      '/assets/react-vendor-BiU7YmE8.js',
      '/ui/wuxia-bg-texture.png',
      '/app/assets/index-abc.js',
      '/favicon.svg',
      'data:image/png;base64,AAAA',
      'https://cloud.umami.is/script.js',
    ];
    for (const 引用 of 合法引用) {
      expect(() => 断言产物引用合法(引用, 'test'), 引用).not.toThrow();
    }
  });

  it('拦截产物里的本机路径引用（v1.0.685 事故真实值）', () => {
    expect(() =>
      断言产物引用合法('/workbuddy/resources/vendor/PortableGit/assets/index-CZuEbPE0.js', 'index.html')
    ).toThrow(/资源引用被本机路径污染/);
    expect(() => 断言产物引用合法('C:////tmp////assets////index.js', 'index.html')).toThrow();
    expect(() => 断言产物引用合法('/Users/me/proj/assets/index.js', 'index.html')).toThrow();
  });

  it('是否本机路径：正常 URL 与本机路径可区分', () => {
    expect(是否本机路径('/assets/index.js')).toBe(false);
    expect(是否本机路径('/workbuddy/resources/vendor/PortableGit/assets/index.js')).toBe(true);
    expect(是否本机路径('')).toBe(false);
  });

  it('是否本机路径：对真实产物里出现过的引用一律不误报（防误伤构建）', () => {
    // 收紧/放宽本机路径正则时极易误伤正常引用从而中断构建，逐条锁死。
    const 正常引用 = [
      '/assets/index-BdsIN4n-.js',
      '/assets/react-vendor-BiU7YmE8.js',
      '/assets/images/ui/paper-texture.png',
      '/ui/wuxia-bg-texture.png',
      '/msjh/assets/index-abc.js',
      '/favicon.svg',
      '/api/image-backend/fetch-image',
      'https://cloud.umami.is/script.js',
      'data:image/png;base64,AAAA',
    ];
    for (const 引用 of 正常引用) {
      expect(是否本机路径(引用), 引用).toBe(false);
    }
  });

  it('是否本机路径：跨平台本机目录都能识别', () => {
    for (const 污染 of [
      '/workbuddy/resources/vendor/PortableGit/assets/index-x.js',
      'C:\\tmp\\assets\\index.js',
      '/Users/me/proj/assets/index.js',
      '/home/me/x.js',
      '/msys64/tmp/x.js',
    ]) {
      expect(是否本机路径(污染), 污染).toBe(true);
    }
  });
});

describe('base 路径防线：vite.config.ts 接线', () => {
  const cfgSource = 读文件('vite.config.ts');

  it('base 校验挂在 plugins 数组里（vite 只对 plugin 触发 configResolved）', () => {
    // config 对象上的 configResolved 是死代码，必须存在 plugin 形态的钩子
    expect(cfgSource).toMatch(/assertSafeAssetBasePlugin\s*=\s*\(\)\s*:\s*Plugin/);
    expect(cfgSource).toMatch(/name:\s*'assert-safe-asset-base'/);
    // 且确实注册进了 plugins
    const pluginsBlock = cfgSource.slice(cfgSource.lastIndexOf('plugins: ['));
    expect(pluginsBlock.slice(0, 400)).toContain('assertSafeAssetBasePlugin()');
  });

  it('plugin 同时含 configResolved（拦 CLI --base=）与 generateBundle（扫产物 HTML）', () => {
    const 起点 = cfgSource.indexOf('assertSafeAssetBasePlugin');
    const 片段 = cfgSource.slice(起点, cfgSource.indexOf('stripSameOriginAssetCrossoriginPlugin = '));
    expect(片段).toMatch(/configResolved\s*\(/);
    expect(片段).toMatch(/generateBundle\s*\(/);
    expect(片段).toMatch(/断言Base合法/);
    expect(片段).toMatch(/断言产物引用合法/);
  });

  it('env 层的旧断言仍在（APK 黑屏防线不可回退）', () => {
    expect(cfgSource).toMatch(/断言Base合法\(rawBase,\s*'VITE_BASE_PATH 环境变量'\)/);
  });
});

describe('base 路径防线：产物校验脚本', () => {
  it('scripts/verify-web-dist.mjs 存在且注册进 npm scripts', () => {
    expect(fs.existsSync(path.join(根目录, 'scripts/verify-web-dist.mjs'))).toBe(true);
    const pkg = JSON.parse(读文件('package.json'));
    expect(pkg.scripts['verify:web-dist']).toContain('verify-web-dist.mjs');
    expect(pkg.scripts['verify:web-render']).toContain('verify-render.mjs');
  });

  it('校验脚本能识别坏产物的两类特征（本机路径名 + 引用不存在）', () => {
    const 源码 = 读文件('scripts/verify-web-dist.mjs');
    expect(源码).toMatch(/PortableGit|msys|mingw/i);
    expect(源码).toMatch(/在产物中不存在/);
    expect(源码).toMatch(/没有引用任何本地 JS 入口/);
  });

  it('校验脚本对当前 dist 判定为 OK（真实产物不能被误判）', () => {
    const 脚本路径 = path.join(根目录, 'scripts/verify-web-dist.mjs');
    const distIndex = path.join(根目录, 'dist/index.html');
    if (!fs.existsSync(distIndex)) return; // dist 未构建时跳过，不算失败
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const 输出 = execFileSync(process.execPath, [脚本路径, 'dist'], {
      cwd: 根目录,
      encoding: 'utf8',
    });
    expect(输出).toContain('WEB_DIST_OK');
  });
});
