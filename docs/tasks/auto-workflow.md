# Task: Tự động hoá trọn gói prompt → ảnh → R2 → Google Sheets

> **Dành cho agent thực thi.** Làm đúng đặc tả này trong worktree hiện tại (branch `fix/auto_workflow`). Nếu đặc tả mâu thuẫn với code thực tế, chọn cách ít xâm lấn nhất và ghi lý do vào mục "Ghi chú của người thực thi" cuối file. Không tự mở rộng scope.

## 0. Quy tắc bắt buộc
1. Đọc `AGENTS.md` trước. Next.js 16 có breaking change: đọc guide liên quan trong `node_modules/next/dist/docs/` trước khi viết route handler.
2. Không hardcode, không log, không commit secret / `.env`. Secret không bao giờ trả về browser.
3. Bỏ qua file `0.26.0` ở root: không sửa, không xoá, không commit.
4. Code tiếng Anh; label UI và message lỗi cho người dùng bằng **tiếng Việt**, theo style hiện có.
5. Comment chỉ khi lý do không hiển nhiên, tối đa 1 dòng.
6. Commit nhỏ theo nhóm, message tiếng Anh ngắn gọn. **Không push, không merge vào `dev`.**
7. Commit chính file đặc tả này ở commit đầu tiên (`docs: add auto-workflow task spec`).
8. Trước khi báo xong phải pass: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
9. Trên PowerShell không viết `pkg@>=x` khi cài package (`>` là redirect).

## 1. Setup worktree (chưa có sẵn)
- `npm ci`.
- Tạo `.env` từ `.env.example` (chỉ cần `DATABASE_URL`; **không** copy `.env` thật từ repo chính). `.env` đã nằm trong `.gitignore`, kiểm tra lại.
- Sau bước merge (mục 3.1): `npx prisma migrate deploy` + `npx prisma generate`.

## 2. Mục tiêu
Người dùng chỉ nhập prompt ở trang Create và bấm tạo. Mọi bước sau tự chạy, không cần bấm thêm:

`gen 13 ảnh + censor (đã tự động)` → **upscale + bìa sau + xuất file in + mockup** → **đẩy R2** → **ghi Google Sheet**.

Kết quả cuối mà người dùng xem: Google Sheet online, cột y hệt `templates/printify_calendar_template.csv`, tự cập nhật mỗi lần gen.

Phần R2/CSV **đã làm xong** ở branch `feature/cloudflare_r2_store` (đọc `docs/tasks/r2-export.md` sau khi merge), nhưng hiện chỉ chạy thủ công qua dialog. Task này **tái sử dụng** phần đó, không viết lại.

Quyết định đã chốt (không thay đổi):
- Bảng online = Google Sheets, service account.
- 2 tab: `da-che` (các dòng SKU `-CEN`) và `khong-che` (các dòng `-ORG`). Mỗi batch 2 dòng/tab (khổ 11 và 14).
- Giữ nguyên quy chuẩn SKU, key R2, CSV của `lib/r2/*`.
- Ảnh lỗi tự gen lại tối đa **2 lần/job**, sau đó mới báo lỗi.
- Preview 6–8 để trống.

## 3. Thiết kế

### 3.1 Merge nền
`git merge feature/cloudflare_r2_store` (không squash, không rebase). Chạy `npm ci` lại nếu lockfile đổi, `npx prisma migrate deploy`, `npm test` để xác nhận nền xanh **trước khi** sửa gì.

### 3.2 Prisma (migration mới `add_auto_workflow_fields`)
```
model GenerationBatch {
  autoStatus     String?    // "pending" | "retrying" | "processing" | "done" | "failed" | "skipped" | "legacy" | null
  autoError      String?
  autoFinishedAt DateTime?
  sheetSyncedAt  DateTime?
}
model GenerationJob {
  autoRetryCount Int @default(0)
}
model AppSettings {
  autoPublish  Boolean @default(true)
  autoFormatId String  @default("premade_wall_11x8_5")
}
```
- Trong file `migration.sql`, thêm `UPDATE "GenerationBatch" SET "autoStatus" = 'legacy';` để batch cũ **không** tự chạy pipeline (chỉ batch tạo sau migrate có `autoStatus = null`).
- Comment tiếng Việt 1 dòng theo style file schema.
- Chạy lại script build template DB của Electron (`npm run build:template-db`, kiểm tra tên trong `package.json`).
- Cập nhật schema zod / route settings / `lib/types.ts` nếu cần để 2 field settings mới đọc-ghi được.

### 3.3 Orchestrator `lib/pipeline/auto-publish.ts`
```ts
export async function runAutoPublish(batchId: string): Promise<AutoPublishResult>
export function runAutoPublishExclusive(batchId: string): Promise<AutoPublishResult>
```
- `runAutoPublishExclusive`: khoá in-flight theo batchId, giống `syncBatchExclusive` trong `lib/comfyui/job-sync.ts`.
- Các bước, tuần tự:
  1. Set `autoStatus: "processing"`, `autoError: null`.
  2. Batch không phải bộ lịch (`requestedCount !== 13` hoặc không có `etsyTitle`) → `autoStatus: "skipped"`, `autoError` = lý do, dừng (không ghi Sheet).
  3. `upscaleBatch(batchId, settings.autoFormatId)` (`lib/generations/upscale-image.ts`), đã gồm bìa sau + xuất thư mục + mockup. Nếu `finalExport !== "done"` hoặc `mockup !== "done"` → lỗi.
  4. `pushBatches([batchId])` (`lib/r2/push-batches.ts`). Kết quả `ok: false` → lỗi với message của nó.
  5. `syncBatchToSheet(...)` (mục 3.5). Lỗi Sheet **không** làm fail pipeline: log, giữ `autoStatus: "done"`, lưu message vào `autoError` dạng `"Đã đẩy R2 nhưng ghi Google Sheet lỗi: …"`.
  6. Set `autoStatus: "done"`, `autoFinishedAt`, `sheetSyncedAt` (khi Sheet thành công).
- Lỗi ở bước 3–4 → `autoStatus: "failed"`, `autoError` tiếng Việt, `autoFinishedAt`; vẫn gọi `syncBatchToSheet` ở chế độ báo lỗi nếu batch đã có `r2SkuBase`.
- Để Sheet có URL mà không tính lại: refactor nhỏ `lib/r2/push-batches.ts` để mỗi phần tử `results` có thêm `rows?: string[][]` (các dòng CSV đã build của batch đó). Không đổi hành vi khác, không phá test cũ (cập nhật test nếu cần thêm field).

### 3.4 Kích hoạt trong `lib/comfyui/auto-sync.ts`
Sau vòng sync trong `runSyncTick`, nếu `settings.autoPublish`:
- Tìm batch `autoStatus ∈ {null, "retrying"}`, `status ∈ {completed, partial, failed}`, `updatedAt` trong 24h (dùng lại `MAX_BATCH_AGE_MS`).
- `completed` → set `autoStatus: "pending"` rồi gọi `runAutoPublishExclusive` **không await** (không chặn tick). Mỗi tick khởi động tối đa 1 batch; cờ global (pattern `globalThis` có sẵn trong file) để không có 2 pipeline chạy song song.
- `partial` / `failed` → với mỗi job `status === "failed"` và `autoRetryCount < 2`: tăng `autoRetryCount`, gọi `regenerateJobFreshPrompt(job.id)` (`lib/generations/regenerate-fresh.ts`, hàm này gen lại **tại chỗ** trong cùng batch và tự đưa batch về `running`). **Không** dùng `regenerateJob` (nó tạo batch mới). Set `autoStatus: "retrying"`. Nếu không còn job nào được retry → `autoStatus: "failed"`, `autoError` liệt kê trang lỗi (dùng `slotLabel` trong `lib/calendar/slot-label.ts`), ghi Sheet chế độ báo lỗi nếu có SKU.
- Lỗi của `regenerateJobFreshPrompt` (vd LLM/Colab tắt) chỉ log, không làm hỏng tick.
- Khi người dùng bấm "Sửa lại" thủ công 1 ảnh của batch đã `done`/`failed`: sau khi ảnh xong batch phải tự publish lại để Sheet cập nhật. Cách làm: trong `regenerateJobFreshPrompt`, ở lệnh `update` batch có sẵn, thêm `autoStatus: null` **chỉ khi** `autoStatus` hiện tại khác `"legacy"`. Orchestrator retry sẽ ghi đè thành `"retrying"` ngay sau khi gọi.

### 3.5 Google Sheets `lib/sheets/`
| File | Nội dung |
|---|---|
| `config.ts` | Đọc env `GOOGLE_SERVICE_ACCOUNT_FILE` (đường dẫn file JSON key), `GOOGLE_SHEET_ID`. `getSheetsStatus(): { configured; missing: string[] }`. |
| `client.ts` | `google-auth-library` (`GoogleAuth` scope `https://www.googleapis.com/auth/spreadsheets`) lấy access token; gọi Sheets REST v4 bằng `fetch`. Không thêm `googleapis`. |
| `rows.ts` | Hàm thuần: tách rows từ `pushBatches` thành 2 tab theo hậu tố SKU `-CEN`/`-ORG`; thêm 3 cột phụ sau 26 cột template: `Status` (`"Đã đẩy"` / `"Lỗi: …"`), `Updated` (ISO giờ local), `Thumbnail` (`=IMAGE("<Page 01 url>")`, rỗng nếu không có URL). Dòng báo lỗi: chỉ có `SKU` đầy đủ (`fullSku(base, size, variant)`), `Title`, `Status`, `Updated`, cột khác rỗng. |
| `sync.ts` | `syncBatchToSheet({ batchId, rows?, error? })`: thiếu env → `console.warn` + return `"skipped"`. Tạo tab nếu chưa có (`batchUpdate addSheet`); header dòng 1 = `PRINTIFY_HEADER` (`lib/r2/csv.ts`) + 3 cột phụ, tự ghi nếu tab trống. Upsert theo SKU ở cột A: đọc `A:A`, có thì `values.update` đúng dòng, chưa có thì `values.append`. Dùng `valueInputOption=USER_ENTERED` (để `=IMAGE` chạy). |

- Thêm vào `.env.example` + 1 đoạn hướng dẫn ngắn trong `README.md`: tạo service account, bật Sheets API, tải JSON key, share Sheet cho email service account (quyền Editor).

### 3.6 API + UI
- `POST /api/generations/[batchId]/auto-publish`: reset `autoStatus` về `"pending"` rồi gọi `runAutoPublishExclusive` (await, trả kết quả). Batch `legacy` vẫn chạy được qua route này (chạy tay). Copy pattern route từ `app/api/generations/[batchId]/mockup/route.ts` (`runtime = "nodejs"`, `params` là Promise, `apiError`/`handleApiError`).
- `GET /api/sheets/status` → `{ configured, missing }` (không trả giá trị env).
- `components/history/batch-card.tsx`: badge `autoStatus` (Đang chờ / Đang gen lại ảnh lỗi / Đang xử lý / Hoàn tất / Lỗi / Bỏ qua; `legacy` và `null` không hiện), tooltip/dòng nhỏ hiện `autoError`, nút "Chạy lại tự động" khi `failed` hoặc `legacy`. Đưa field vào `lib/types.ts` và response `/api/history`.
- `components/settings/`: thêm vào card phù hợp (hoặc card mới `auto-publish-card.tsx`): toggle `autoPublish`, select `autoFormatId` (từ `/api/calendar/formats`), trạng thái R2 (`/api/r2/status`) và Sheets (`/api/sheets/status`).
- Dialog R2 thủ công giữ nguyên.

## 4. Test (Vitest, `tests/`)
- `auto-publish.test.ts` (mock `upscaleBatch`, `pushBatches`, `syncBatchToSheet`, prisma): happy path set đúng các trạng thái; `skipped` khi `requestedCount !== 13` hoặc thiếu title; upscale/mockup lỗi → `failed`; push lỗi → `failed` + vẫn ghi Sheet báo lỗi khi có SKU; Sheet lỗi → vẫn `done` + `autoError`; khoá in-flight không chạy 2 lần.
- `auto-sync-publish.test.ts`: chọn đúng batch (bỏ `legacy`, quá 24h, `autoPublish=false`); `partial` → gọi `regenerateJobFreshPrompt` cho job lỗi có count < 2 và tăng count; hết lượt → `failed`; không khởi động 2 pipeline song song.
- `sheets-rows.test.ts`: tách CEN/ORG đúng tab; 29 cột/dòng; header = template + 3 cột phụ; dòng lỗi đúng format; `=IMAGE` đúng URL.
- `sheets-sync.test.ts` (mock `fetch` + auth): thiếu env → `skipped` không throw; tab trống → ghi header; SKU đã có → update đúng dòng; SKU mới → append.
- Test cũ của `lib/r2` vẫn pass.

## 5. Definition of Done
- [x] Mục 1, 3.1–3.6 và 4 xong.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` đều pass.
- [x] `git status` sạch (trừ `0.26.0`), mọi thứ đã commit trên `fix/auto_workflow`, **không push**.
- [x] Điền mục "Ghi chú của người thực thi": chỗ lệch spec + lý do, những gì chưa test thật được (R2/Sheets live, Colab).

## Ghi chú của người thực thi
1. **Các điểm điều chỉnh nhỏ so với spec ban đầu & lý do**:
   - `lib/comfyui/auto-sync.ts`: Prisma SQLite / TypeScript không hỗ trợ `autoStatus: { in: [null, "retrying"] }` vì toán tử `in` chỉ nhận mảng chuỗi (`string[]`). Đã chuyển sang cú pháp tương đương và an toàn kiểu: `OR: [{ autoStatus: null }, { autoStatus: "retrying" }]`.
   - `lib/comfyui/auto-sync.ts`: Bổ sung cờ `isPublishing` trên `autoSyncState` (`globalThis`) để đảm bảo không có 2 pipeline auto-publish chạy song song trên cùng một instance server, hỗ trợ cả HMR trong môi trường dev.
   - `components/history/batch-card.tsx`: Thẻ bao bọc card mở rộng được chuyển từ `<button>` sang `<div role="button">` có hỗ trợ bàn phím (Enter/Space) để đảm bảo HTML hợp lệ khi đặt nút "Chạy lại tự động" ở góc phải header.
   - Thư viện `google-auth-library` được cài đặt phục vụ xác thực Google Service Account và lấy access token; toàn bộ API Google Sheets REST v4 được gọi trực tiếp bằng `fetch` native theo đúng yêu cầu không cài `googleapis`.

2. **Những phần chưa test trực tiếp trên môi trường live**:
   - Chưa đẩy file thật lên bucket Cloudflare R2 live do môi trường local không có credentials R2 thật (đã test kỹ qua mock SDK S3 / vitest).
   - Chưa ghi trực tiếp vào Google Spreadsheet online live do không có file JSON service account thật và Google Sheet ID thật (đã test kỹ qua mock REST v4 / fetch & auth).
   - Chưa chạy ComfyUI / Colab GPU thật (đã test qua mock ComfyClient và regenerateJobFreshPrompt).
