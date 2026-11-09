# Task: Simplify Anima Studio UI for non-technical users

Branch: `fix/last_UI` (base `dev` @ `adefdb7`). Work ONLY in this worktree.

## Why
The pipeline is already fully automatic: enter idea → click Create → poller generates 13 images → `runAutoPublish` (print export + mockup → Cloudflare R2 → Google Sheet). But the UI still exposes ~80 controls from the old manual flow (4-step Stepper "Tạo → Kiểm tra → Xuất file in → Mockup", "Đẩy R2 + xuất CSV" dialog, node mapping, CFG…), so non-tech users think they must click every step.

Goal: a normal user only sees **idea textarea + image style (medium) + image count + Create button**, then a **clear progress bar** until an **"Mở Google Sheet"** button appears. Everything else is hidden behind an **"Chế độ nâng cao"** (advanced mode) switch, default OFF. **No feature is deleted** — only render conditions change.

## Setup (do first)
1. Read `AGENTS.md`. This is Next.js 16.4.3 with breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before touching any route handler or page.
2. `npm install` (runs `prisma generate`).
3. Create `.env` from `.env.example` (keep `DATABASE_URL="file:../data/anima.sqlite"` — it resolves to this worktree's own `data/`, isolated from the main repo). Do NOT copy real R2/Google credentials; leave them empty.
4. `npm run db:migrate` then `npm run db:seed`.

## Changes

### 1. Advanced-mode flag (foundation)
- `prisma/schema.prisma` `AppSettings`: add `advancedMode Boolean @default(false)`.
- `GenerationBatch`: add `autoStage String?` (`"export" | "r2" | "sheet" | null`) so the progress bar knows the current step while `autoStatus === "processing"` (existing `mockupStatus`/`r2Status` keep values from previous runs, so they can't be used to infer this).
- One new migration: `npx prisma migrate dev --name simple_mode_and_auto_stage`.
- Plumb through: `lib/validations/settings.ts`, `app/api/settings/route.ts`, `SettingsDTO` and `GenerationBatchDTO` in `lib/types.ts`, and wherever history batches are mapped to DTOs.
- Add small hook `useAdvancedMode()` in `hooks/use-settings.ts` returning `useSettings().data?.advancedMode ?? false`.

### 2. Pipeline writes `autoStage`
`lib/pipeline/auto-publish.ts::runAutoPublish`: set `autoStage = "export"` before `upscaleBatch`, `"r2"` before `pushBatches`, `"sheet"` before `syncBatchToSheet`; set `autoStage: null` in the done / failed / skipped updates. No other logic changes. Update `tests/auto-publish.test.ts` (and `tests/auto-sync-publish.test.ts` if affected) for the new `update` calls.

### 3. Google Sheet link
`app/api/sheets/status/route.ts`: also return `sheetUrl = https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}` when configured (use `readSheetsConfig` from `lib/sheets/config.ts`), `null` otherwise. Expose it in `hooks/use-sheets.ts`. Never return the service-account path or contents.

### 4. Create page (`components/create/assistant-create-form.tsx`)
- Keep: idea textarea, medium tiles, image-count stepper (the owner explicitly wants to keep count).
- Count ≠ 13: make the existing warning prominent — "Chỉ bộ 13 ảnh mới được tự động xuất & ghi Google Sheet".
- Width/Height/Steps/CFG accordion: render only when `advancedMode`.
- Main button label → "Tạo bộ lịch" (large, full width). Keep the existing progress-steps card (~:351-364) with friendlier labels (e.g. "AI đang viết mô tả cho 13 ảnh…").
- "App chưa sẵn sàng" alert: when the workflow is missing, say "Liên hệ người cài đặt hoặc bật Chế độ nâng cao trong Cài đặt".

### 5. Results page — main focus
**`components/history/batch-card.tsx`** in normal mode:
- Header: idea title, date, thumbnails, ONE plain-language status badge (merge `renderAutoStatusBadge` and `summary` into one).
- **New component `components/history/pipeline-progress.tsx`**: overall % bar + 4 steps with icons:
  1. Tạo ảnh (x/13 from jobs; keep the "mỗi ảnh ~1 phút, bạn có thể làm việc khác" hint)
  2. Chuẩn bị file in & mockup (`autoStage === "export"`)
  3. Lưu lên kho dữ liệu (`"r2"`)
  4. Ghi Google Sheet (`"sheet"`) → Hoàn tất
  - `retrying` → step 1 shows "Đang tạo lại ảnh lỗi"; `failed` → current step red + friendly error text + "Thử lại" button (reuse existing `useAutoPublishBatch`); `skipped` → explain "Bộ không đủ 13 ảnh nên không tự xuất".
  - Overall %: image generation = 70%, each of the other 3 steps = 10%.
- When `done`: large **"Mở Google Sheet"** button (`sheetUrl`, `target="_blank" rel="noopener noreferrer"`) + `EtsyMetadataCard` (Copy buttons) + image grid (view only).
- If `autoError` is set while `done` (Sheet failed but R2 ok) → friendly amber notice.
- Hidden in normal mode, shown only when `advancedMode`: old `Stepper`, "Ảnh lâu chưa hiện? Kiểm tra lại", per-image "Sửa lại", the "Xuất file in" section + `FolderSummary`, `BatchMockupSection`, "Đã đẩy R2" badge and SKU text.

**`app/(studio)/history/page.tsx` + `components/history/history-grid.tsx`**: rewrite intro ("Bộ lịch tự chạy đến khi xong, bạn không cần bấm gì thêm"); add a "Mở Google Sheet" button at page top; hide the "Đẩy R2 + xuất CSV" dialog trigger and the search input in normal mode. `useHistoryList` already polls every 8s while processing — rely on that.

**`components/history/job-detail.tsx`**: normal mode shows only "Về bộ lịch", the large image and a "Tải ảnh" button. The 4-variant toggle, "Sửa lại" and the technical accordion → advanced only.

### 6. Settings page (`app/(studio)/settings/page.tsx`)
- Normal mode: `ConnectionCard` (Colab URL is needed every session) + a new compact "Trạng thái hệ thống" card (R2 / Google Sheet ✓/✗ — reuse the status part of `components/settings/auto-publish-card.tsx`) + the "Chế độ nâng cao" switch (saved via `useUpdateSettings`).
- Advanced mode: show all 7 existing cards as today.
- Sidebar keeps its 3 items; remove the dead `/prompts` entry in `TITLES` (`components/app-shell/studio-shell.tsx:10`).

## Constraints
- UI strings in Vietnamese; code and comments in English. Minimal comments.
- Do NOT delete existing components or API routes; only change what renders.
- Do NOT change auto-sync / retry logic, R2 or Sheets sync logic beyond §2 and §3.
- Do NOT touch: the file named `0.26.0` at repo root, `secrets/`, any root `*.csv`, `.env` contents beyond setup.
- Reuse existing patterns: base-ui `Accordion` (`components/ui/accordion.tsx`), shadcn `Switch`, `Badge`, `Card`, `sonner` toasts.
- Do NOT push, open a PR or merge. Commit on `fix/last_UI` only.

## Acceptance (all must pass before worker_done)
1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — all green.
2. `npm run dev`, advanced mode OFF: Create page shows only idea / medium / count / "Tạo bộ lịch"; Results page shows progress bar + friendly status, none of the hidden controls listed in §5; Settings shows only Connection + Trạng thái hệ thống + the switch.
3. Advanced mode ON: every old control (Sửa lại, Xuất file in, mockup, R2 dialog, node mapping, defaults, LLM, mediums…) reappears.
4. Commits on `fix/last_UI` with conventional messages (e.g. `feat(ui): ...`), matching repo style.
5. In the `worker_done` summary list: files changed, the migration name, test/tsc/lint/build results, and anything you could not verify (e.g. no live ComfyUI/Colab available).
