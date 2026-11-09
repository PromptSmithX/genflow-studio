# Task: Hide Etsy content + per-image "Tạo lại" that auto-syncs R2 & Google Sheet

Branch: `fix/last_UI` (on top of `f859b8c`). Work ONLY in this worktree. Setup (node_modules, .env, DB) already exists from the previous task. Read `docs/tasks/last-ui-simplify.md` for context on advanced mode.

## Why
The owner wants, in normal mode (advanced mode OFF):
1. Hide Etsy content (title/description/tags + Copy buttons) — it is already in the Google Sheet.
2. A per-image retry button on the image grid: user sees a bad/failed image → clicks → when the image is regenerated, the app automatically re-pushes to Cloudflare R2 overwriting the SAME keys and updates the SAME Google Sheet row (by SKU).

Most of the background flow already works: `lib/generations/regenerate-fresh.ts` sets batch `autoStatus = null` → the poller (`lib/comfyui/auto-sync.ts` `processAutoWorkflow`) re-runs `runAutoPublish` once the job completes; R2 keys are deterministic from `r2SkuBase`/`r2Folder` and `PutObject` overwrites (`lib/r2/push-batches.ts`, `lib/r2/keys.ts`); the Sheet upserts by SKU in column A (`lib/sheets/sync.ts`). Fix these gaps:

## Changes

### 1. Hide Etsy in normal mode
`components/history/batch-card.tsx`: remove `EtsyMetadataCard` from the `!advancedMode` branch. Keep it in the advanced branch. Do not delete the component.

### 2. Per-image "Tạo lại" in normal mode
- `ImageTile` in `batch-card.tsx`: render `RegenerateButton` in both modes when `!pending`. In normal mode, disable it when `batch.autoStatus` is `pending` or `processing`, with a tooltip/title "Đang cập nhật kho & Google Sheet, đợi xong rồi thử lại" (pass what ImageTile needs as props).
- `components/history/regenerate-button.tsx`: add prop `simple?: boolean`. When `simple`: label "Tạo lại", ALWAYS show the confirm dialog, with friendly text: "Ảnh {label} sẽ được tạo lại (khoảng 1 phút). Xong app tự cập nhật lên kho dữ liệu và Google Sheet, bạn không cần làm gì thêm." Advanced mode keeps today's behavior and text.
- Failed image tile in normal mode: add a short hint "Bấm Tạo lại để thử lại".
- Show API errors with the existing `toast.error` (so a 409 message from §3 reaches the user).

### 3. Prevent the race in lib/API
In `lib/generations/regenerate-fresh.ts`, right after loading job and batch and BEFORE calling the LLM:
- job status `queued`/`running` → throw `GenerationSetupError("Ảnh này đang được tạo, vui lòng đợi", <code>)`.
- batch `autoStatus` `pending`/`processing` → throw `GenerationSetupError("Bộ lịch đang cập nhật kho & Google Sheet, vui lòng đợi xong rồi thử lại", <code>)`.
- These must reach the client as HTTP 409. Check how `GenerationSetupError` codes are mapped to HTTP status (`lib/api/errors.ts` / the route `app/api/history/[jobId]/regenerate-fresh/route.ts`); add a `"conflict"` code → 409 if none exists.
- In the job update add `autoRetryCount: 0`. In the batch update add `autoStage: null` and `autoError: null`.
Why: today, retrying while the pipeline runs deletes images mid-run and the pipeline's final `done`/`failed` write overwrites `autoStatus = null`, so the new image is never re-pushed.

### 4. Cache-busting URLs
R2 objects keep the same key (overwrite in place) but URLs are cached (`Cache-Control: max-age=3600`), so the Sheet `=IMAGE()` and Printify would show the old image.
- Add helper `versionedUrl(url: string, version: number | string): string` in `lib/r2/keys.ts` (append `?v=` or `&v=` correctly).
- In `lib/r2/push-batches.ts`, compute ONE `version = Date.now()` per batch push and use `versionedUrl(publicUrl(...), version)` for every URL written to rows/CSV (pages org + cen, previews — around lines 183/191/217). Object keys MUST NOT change.
- Update affected tests (`tests/r2-*.test.ts`, `tests/sheets-*.test.ts`, others that assert URLs) — match by prefix/regex rather than hardcoding the timestamp, or mock `Date.now`.

## Do not change
Poller logic, max-2 auto-retry, Sheet upsert by SKU, timestamped CSV export, advanced-mode UI except where listed.

## Constraints
Same as `docs/tasks/last-ui-simplify.md`: Vietnamese UI text, English code, minimal comments; no push/PR/merge; do not touch `0.26.0`, `secrets/`, root CSV files; do not commit `prisma/migrations/migration_lock.toml` line-ending changes. Quote any version ranges in shell commands. Read `node_modules/next/dist/docs/` before editing route handlers (AGENTS.md).

## Acceptance
1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
2. New tests: regenerate-fresh rejects (409-mapped error) when batch `autoStatus` is `processing`/`pending` and when job is `queued`/`running`, without calling the LLM; it resets `autoRetryCount` to 0; pushed row URLs contain `?v=` and object keys are unchanged.
3. Normal mode: no Etsy card; every non-pending image tile has "Tạo lại" with the friendly confirm; button disabled while `pending`/`processing`.
4. New commit(s) on `fix/last_UI` (conventional messages). In `worker_done`, list each change 1-4 with files.
