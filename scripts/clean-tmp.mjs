#!/usr/bin/env node
/**
 * 清理项目根目录下由构建/发布流程产生的临时产物（`.tmp-*`）。
 *
 * 背景
 * ----
 * 沙箱限制「同一 outDir 二次 build 会 EPERM」，因此每次发布都要新建一个临时构建目录
 * （`.tmp-web-<标记>`），但整条链路从未有过清理环节。2026-09-19 盘点时积压到
 * **147 项 / 约 8.97 GB / 26,823 个文件**，占用最大的单项超过 1.2 GB。
 *
 * 设计原则
 * --------
 * 1. **默认安全**：只删除「项目根目录下、名字以 `.tmp-` 开头」的条目，绝不递归到别处。
 * 2. **保护例外**：个别 `.tmp-*` 文件可能已被 git 跟踪（历史误提交），
 *    删除它们会让仓库出现「已删除」变更。这些条目默认跳过，除非显式加 `--include-tracked`。
 * 3. **保护近期产物**：支持 `--keep-days=N` 保留最近 N 天内的条目，
 *    避免误删正在使用（例如正在排查问题）的产物。
 * 4. **先看后删**：默认只做 dry-run 列出将被删除的内容，必须显式 `--yes` 才真正删除。
 *
 * 用法
 * ----
 *   node scripts/clean-tmp.mjs                    # 预览将删除的内容（dry-run）
 *   node scripts/clean-tmp.mjs --yes              # 执行删除
 *   node scripts/clean-tmp.mjs --keep-days=2      # 保留最近 2 天内的产物
 *   node scripts/clean-tmp.mjs --older-than-days=3 --yes   # 只删超过 3 天的
 *   node scripts/clean-tmp.mjs --include-tracked --yes     # 连同被 git 跟踪的也删
 *
 * 也可通过 npm 脚本调用：`npm run clean:tmp` / `npm run clean:tmp -- --yes`
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TMP_PREFIX = '.tmp-';

/** 被 git 跟踪的 `.tmp-*` 条目：删除会产生仓库变更，默认保护。 */
const getTrackedTmpEntries = (targetRoot = rootDir) => {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: targetRoot,
    encoding: 'utf8',
    timeout: 60_000
  });
  if (result.status !== 0) return new Set();
  return new Set(
    String(result.stdout || '')
      .split('\0')
      .filter((p) => p && !p.includes('/') && p.startsWith(TMP_PREFIX))
  );
};

const dirSize = (p) => {
  let total = 0;
  let files = 0;
  const walk = (cur) => {
    let st;
    try {
      st = fs.statSync(cur);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let kids;
      try {
        kids = fs.readdirSync(cur);
      } catch {
        return;
      }
      for (const k of kids) walk(path.join(cur, k));
    } else {
      total += st.size;
      files += 1;
    }
  };
  walk(p);
  return { total, files };
};

const daysAgo = (date) => (Date.now() - new Date(date).getTime()) / 86_400_000;
const mb = (n) => (n / 1024 / 1024).toFixed(2);

/**
 * 执行一次临时产物清理。
 *
 * @param {object} [options]
 * @param {string} [options.root]         扫描根目录，默认仓库根
 * @param {boolean} [options.dryRun]      只预览不删除
 * @param {boolean} [options.includeTracked] 是否连同被 git 跟踪的条目一起删
 * @param {number|null} [options.keepDays]     保留最近 N 天内的条目
 * @param {number|null} [options.olderThanDays] 只删超过 N 天的条目
 * @param {boolean} [options.quiet]       静默模式（发布脚本收尾用，只输出一行摘要）
 * @returns {{deleted:number, failed:number, freedBytes:number, candidates:number, keptTracked:string[]}}
 */
export const cleanTmpArtifacts = (options = {}) => {
  const targetRoot = options.root || rootDir;
  const dryRun = options.dryRun !== false; // 默认 dry-run，需显式 false 才删
  const includeTracked = Boolean(options.includeTracked);
  const keepDays = Number.isFinite(options.keepDays) ? options.keepDays : null;
  const olderThanDays = Number.isFinite(options.olderThanDays) ? options.olderThanDays : null;
  const quiet = Boolean(options.quiet);

  const log = (...a) => {
    if (!quiet) console.log(...a);
  };

  const tracked = getTrackedTmpEntries(targetRoot);

  const candidates = fs
    .readdirSync(targetRoot)
    .filter((n) => n.startsWith(TMP_PREFIX))
    .map((name) => {
      const full = path.join(targetRoot, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        return null;
      }
      const size = st.isDirectory() ? dirSize(full) : { total: st.size, files: 1 };
      return { name, full, size: size.total, files: size.files, mtime: st.mtime };
    })
    .filter(Boolean);

  const toDelete = [];
  const keptTracked = [];
  const keptRecent = [];

  for (const item of candidates) {
    const age = daysAgo(item.mtime);
    if (tracked.has(item.name) && !includeTracked) {
      keptTracked.push(item.name);
      continue;
    }
    if (keepDays !== null && age <= keepDays) {
      keptRecent.push(item);
      continue;
    }
    if (olderThanDays !== null && age < olderThanDays) {
      keptRecent.push(item);
      continue;
    }
    toDelete.push(item);
  }

  const totalBytes = toDelete.reduce((a, b) => a + b.size, 0);
  const totalFiles = toDelete.reduce((a, b) => a + b.files, 0);

  log(`[clean-tmp] 扫描目录: ${targetRoot}`);
  log(`[clean-tmp] 发现 ${TMP_PREFIX}* 条目: ${candidates.length} 项`);
  log(`[clean-tmp] 待删除: ${toDelete.length} 项 / ${mb(totalBytes)} MB / ${totalFiles} 个文件`);
  if (keptTracked.length) {
    log(`[clean-tmp] 保留(git 已跟踪，加 --include-tracked 可删): ${keptTracked.join(', ')}`);
  }
  if (keptRecent.length) {
    log(`[clean-tmp] 保留(时间策略): ${keptRecent.length} 项`);
  }

  if (!toDelete.length) {
    log('[clean-tmp] 没有需要清理的条目。');
    return { deleted: 0, failed: 0, freedBytes: 0, candidates: candidates.length, keptTracked };
  }

  if (dryRun) {
    log('\n[clean-tmp] 以下为预览（未删除）。确认后加 --yes 执行：');
    toDelete
      .sort((a, b) => b.size - a.size)
      .slice(0, 30)
      .forEach((i) => log(`    ${mb(i.size).padStart(9)} MB  ${i.name}`));
    if (toDelete.length > 30) log(`    ... 另有 ${toDelete.length - 30} 项`);
    log('\n[clean-tmp] dry-run 结束，未改动任何文件。');
    return { deleted: 0, failed: 0, freedBytes: 0, candidates: candidates.length, keptTracked };
  }

  let deleted = 0;
  let failed = 0;
  let freed = 0;
  for (const item of toDelete) {
    try {
      fs.rmSync(item.full, { recursive: true, force: true });
      deleted += 1;
      freed += item.size;
    } catch (err) {
      failed += 1;
      console.warn(`[clean-tmp] 删除失败: ${item.name} — ${err?.message || err}`);
    }
  }

  log(`\n[clean-tmp] 已删除 ${deleted} 项，回收 ${mb(freed)} MB`);
  if (failed) console.warn(`[clean-tmp] ${failed} 项删除失败`);
  return { deleted, failed, freedBytes: freed, candidates: candidates.length, keptTracked };
};

/**
 * 发布脚本收尾钩子：清理临时产物，但**永不抛出**。
 *
 * 发布已经成功的前提下，清理只是收尾动作；清理失败不应让整个发布报错。
 * 同时始终保留最近 1 天内的产物，避免误删同一次发布仍在使用的目录。
 */
export const cleanTmpAfterRelease = () => {
  try {
    const result = cleanTmpArtifacts({
      dryRun: false,
      keepDays: 1,
      includeTracked: false,
      quiet: true
    });
    if (result.deleted > 0) {
      console.log(
        `[clean-tmp] 收尾清理：删除 ${result.deleted} 项临时产物，回收 ${mb(result.freedBytes)} MB`
      );
    } else {
      console.log('[clean-tmp] 收尾清理：无需清理');
    }
    if (result.keptTracked.length) {
      console.log(`[clean-tmp] 收尾清理：保留 git 已跟踪条目 ${result.keptTracked.length} 个`);
    }
    return result;
  } catch (err) {
    console.warn(`[clean-tmp] 收尾清理跳过（不影响发布结果）: ${err?.message || err}`);
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* CLI 入口：仅当本文件被直接执行时运行                                  */
/* ------------------------------------------------------------------ */
const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const args = process.argv.slice(2);
  const hasFlag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const readNumFlag = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    if (!hit) return null;
    const n = Number(hit.slice(name.length + 3));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const result = cleanTmpArtifacts({
    dryRun: !(hasFlag('yes') || hasFlag('y')),
    includeTracked: hasFlag('include-tracked'),
    keepDays: readNumFlag('keep-days'),
    olderThanDays: readNumFlag('older-than-days')
  });

  process.exit(result.failed ? 1 : 0);
}
