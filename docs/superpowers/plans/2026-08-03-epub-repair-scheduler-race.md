# EPUB Repair Scheduler Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an interrupted novel-decomposition executor from overwriting a repaired EPUB dataset after the UI reports success.

**Architecture:** Add an awaitable idle barrier to the existing scheduler and route EPUB repair through a small workflow function that stops, interrupts, drains, reloads, repairs, persists, and conditionally restarts in that order. Keep UI state in the settings component so parsing and repair phases are visible and duplicate clicks are disabled.

**Tech Stack:** TypeScript, React, Vitest, IndexedDB-backed novel decomposition store

---

### Task 1: Awaitable scheduler idle barrier

**Files:**
- Modify: `services/novelDecompositionScheduler.ts`
- Test: `__tests__/novelDecompositionSchedulerBackoff.test.ts`

- [ ] **Step 1: Write failing idle-barrier tests**

Add tests proving an already-idle scheduler resolves immediately, a busy scheduler does not resolve before its executor finishes, and a short timeout rejects with `等待小说拆分后台任务收尾超时`.

- [ ] **Step 2: Run the scheduler test and verify RED**

Run: `npx vitest run __tests__/novelDecompositionSchedulerBackoff.test.ts`

Expected: FAIL because `小说拆分后台调度服务.waitForIdle` does not exist.

- [ ] **Step 3: Implement the idle barrier**

Add `waitForIdle(options?: { timeoutMs?: number }): Promise<void>` to the scheduler. Resolve immediately when `state.busy` is false; otherwise subscribe until it becomes false. Clear the timeout and unsubscribe on every completion path. Reject on timeout with the exact error above and expose the method through `小说拆分后台调度服务`.

- [ ] **Step 4: Run the scheduler test and verify GREEN**

Run: `npx vitest run __tests__/novelDecompositionSchedulerBackoff.test.ts`

Expected: PASS.

### Task 2: Race-safe EPUB repair workflow

**Files:**
- Create: `services/novelDecompositionEpubRepairWorkflow.ts`
- Test: `__tests__/novelDecompositionEpubRepairWorkflow.test.ts`

- [ ] **Step 1: Write failing workflow sequencing tests**

Test a dependency-injected workflow with call recording. Assert this exact order: `stop`, `interrupt`, `waitForIdle`, `readDatasets`, `readTasks`, `repair`, `writeDataset`, `writeTasks`, `writeSnapshots`, `restart`. Also assert restart is omitted when persistence rejects, and that the reloaded dataset rather than the pre-confirmation dataset is passed to `repair`.

- [ ] **Step 2: Run the workflow test and verify RED**

Run: `npx vitest run __tests__/novelDecompositionEpubRepairWorkflow.test.ts`

Expected: FAIL because the workflow module does not exist.

- [ ] **Step 3: Implement the workflow**

Export `执行小说拆分EPUB修复工作流` with explicit dependencies for scheduler control, store reads/writes, repair calculation, and snapshot rebuilding. Stop and interrupt first, await idle with a 120-second default timeout, reload the target dataset/tasks, throw `目标小说分解数据集已不存在` when missing, persist all repaired artifacts, and restart only after successful persistence when background mode is enabled and `requeuedSegments > 0`.

- [ ] **Step 4: Run the workflow test and verify GREEN**

Run: `npx vitest run __tests__/novelDecompositionEpubRepairWorkflow.test.ts`

Expected: PASS.

### Task 3: Visible parsing and repair state

**Files:**
- Modify: `components/features/Settings/NovelDecompositionSettings.tsx`
- Test: `__tests__/novelDecompositionEpubRepairWorkflow.test.ts`

- [ ] **Step 1: Wire the confirmed repair action to the workflow**

Replace the direct stop/write/start sequence with `执行小说拆分EPUB修复工作流`. Pass the selected dataset ID, parsed chapters, current background-mode setting, store functions, snapshot rebuild function, interrupt function, and scheduler methods.

- [ ] **Step 2: Add busy-state transitions**

Add a repair phase state with `idle | parsing | waiting | saving`. Set `parsing` before EPUB extraction, return to `idle` while the statistics confirmation is open, then set `waiting` during interruption/drain and `saving` during persistence. Reset to `idle` in `finally`. Disable the repair button outside `idle` and show `正在解析 EPUB…`, `正在等待后台任务收尾…`, or `正在保存修复结果…` in place of its normal label.

- [ ] **Step 3: Verify focused tests and type/build output**

Run: `npx vitest run __tests__/novelDecompositionSchedulerBackoff.test.ts __tests__/novelDecompositionEpubRepairWorkflow.test.ts __tests__/novelDecompositionEpubRepair.test.ts __tests__/epubImport.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: successful production build; existing texture-path and circular-chunk warnings may remain.

### Task 4: Regression and handoff

**Files:**
- Verify only; do not modify release metadata.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`

Expected: PASS.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only intended source, test, and plan files changed.

- [ ] **Step 3: Commit the implementation**

Run: `git add services/novelDecompositionScheduler.ts services/novelDecompositionEpubRepairWorkflow.ts components/features/Settings/NovelDecompositionSettings.tsx __tests__/novelDecompositionSchedulerBackoff.test.ts __tests__/novelDecompositionEpubRepairWorkflow.test.ts docs/superpowers/plans/2026-08-03-epub-repair-scheduler-race.md && git commit -m "修复 EPUB 修复结果被后台任务覆盖"`.

