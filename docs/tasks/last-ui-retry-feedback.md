# Task: "Thử lại" gives immediate feedback instead of spinning for minutes

Branch: `fix/last_UI` (on top of `cc5774f`). Work ONLY in this worktree. Setup exists. Context: `docs/tasks/last-ui-simplify.md`, `docs/tasks/last-ui-regenerate.md`.

## Observed bug (real run)
Batch was `autoStatus = failed` (with `autoStage = null`). User clicked "Thử lại" in `components/history/pipeline-progress.tsx`. The pipeline actually ran fine (export -> render 2 sizes -> ~430 MB upload to R2 -> Sheet, ~4 minutes) and ended `done`, but during those 4 minutes:
1. The button spun the whole time, because `POST /api/generations/[batchId]/auto-publish` (`app/api/generations/[batchId]/auto-publish/route.ts`) AWAITS `runAutoPublishExclusive` before responding.
2. The card kept showing the OLD failed state + old error, because the history list (`hooks/use-history.ts` `useHistoryList`) only polls while cached data has unsettled jobs or `autoStatus` pending/processing/retrying, and the cached data still said `failed` (it is only invalidated in `onSuccess`, after the 4 minutes).
3. Step 1 "Tạo ảnh" showed red "Tạo ảnh thất bại" although all 13 images were completed: in `pipeline-progress.tsx`, `isFailed && autoStage === null` is always mapped to step 1 error.

## Changes

### 1. Route returns immediately
`app/api/generations/[batchId]/auto-publish/route.ts`:
- If batch `autoStatus` is already `pending` or `processing` -> respond 409 (`apiError("conflict", "Bộ lịch đang được xử lý, vui lòng đợi", 409)` or the existing equivalent).
- Otherwise set `autoStatus: "pending", autoStage: null, autoError: null` (as today), then start `runAutoPublishExclusive(batchId)` WITHOUT awaiting (catch + `console.error` so there is no unhandled rejection; `runAutoPublish` already writes failed state itself), and respond 202 `{ status: "pending" }`.
- Read `node_modules/next/dist/docs/` about route handlers and `after()` first (AGENTS.md). Use `after()` from `next/server` only if the docs say it is appropriate for long work in a Node runtime route; otherwise a detached promise is fine (the app runs as a long-lived Node server / Electron, and `lib/comfyui/auto-sync.ts` already uses the same detached pattern). Explain your choice in `worker_done`.

### 2. UI picks up progress right away
`hooks/use-history.ts` `useAutoPublishBatch`: update the type to `{ status: string }`. In `onMutate` (or right after success), optimistically set this batch's `autoStatus` to `"pending"`, `autoStage` to `null` and `autoError` to `null` in the cached `["history", ...]` infinite-query data (use `queryClient.setQueriesData`), and invalidate `["history"]` on settle. Then the existing `refetchInterval` keeps polling every 8 s, and the progress bar walks through export -> r2 -> sheet.
- `pipeline-progress.tsx` `handleRetry` toast: "Đã bắt đầu chạy lại, tiến trình sẽ tự cập nhật".
- `batch-card.tsx` `handleRetryAuto` (advanced mode): same toast text.
- The button no longer needs a long spinner. Keep `disabled` while the request is in flight (now ~instant).

### 3. Do not blame step 1 wrongly
In `pipeline-progress.tsx`, when `isFailed && autoStage === null`:
- If `problemCount > 0` (or `readyCount < total`) -> step 1 error (as today).
- Else (all images ready) -> step 1 `done`, steps 2-4 `waiting`; the red error box below still shows `batch.autoError` and the "Thử lại" button. The percentage for this case = 70.

## Tests
- Update the tests that cover the auto-publish route or hook, if any (`tests/auto-publish.test.ts`, `tests/auto-sync-publish.test.ts`, others).
- Add a route test: it returns 202 without waiting for `runAutoPublishExclusive` to resolve (mock it with a never-resolving promise), sets pending; it returns 409 when `autoStatus` is `processing` or `pending`, and does not start the run.
- If pipeline-progress has no tests, extract the step-state derivation into a pure function in the same file (exported) and unit-test the `failed + autoStage null + all images ready` case. Only do this if it stays small.

## Do not change
`runAutoPublish` logic, the poller, R2/Sheet code, the regenerate flow from the previous task.

## Constraints
Vietnamese UI text, English code, minimal comments. No push/PR/merge. Do not touch `0.26.0`, `secrets/`, root CSV files; do not commit `prisma/migrations/migration_lock.toml` line-ending changes. Quote version ranges in shell commands.

## Acceptance
1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
2. New commit(s) on `fix/last_UI` (conventional messages). In `worker_done`, list changes 1-3 with files and the after()/detached decision.
