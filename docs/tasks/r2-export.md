# Task: Đẩy Cloudflare R2 + xuất CSV Printify

> **Dành cho agent thực thi.** Làm đúng đặc tả này trong worktree hiện tại (branch `feature/cloudflare_r2_store`). Nếu đặc tả mâu thuẫn với code thực tế, chọn cách ít xâm lấn nhất và ghi lại lý do vào cuối file này, mục "Ghi chú của người thực thi". Không tự mở rộng scope.

## 0. Quy tắc bắt buộc
1. Đọc `AGENTS.md` trước. Next.js 16 có breaking change, nên phải đọc guide liên quan trong `node_modules/next/dist/docs/` trước khi viết route handler.
2. **Không sửa hành vi** của upscale / censor / back-cover / mockup / sync hiện có (`lib/generations/upscale-image.ts`, `lib/censor/*`, `lib/mockup/*`, `lib/comfyui/*`). Chỉ được import và tái sử dụng.
3. Không hardcode secret, không log secret, không commit `.env`. Secret không bao giờ được trả về browser.
4. Bỏ qua file `0.26.0` ở root: không sửa, không xoá, không commit.
5. Code dùng tiếng Anh; label UI và message lỗi trả cho người dùng dùng **tiếng Việt**, theo style hiện có.
6. Comment chỉ viết khi lý do không hiển nhiên, tối đa 1 dòng.
7. Commit nhỏ theo từng nhóm (env+deps → prisma → lib/r2 → API → UI → tests). Commit message tiếng Anh, ngắn gọn.
8. Trước khi báo xong phải pass hết: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 1. Mục tiêu
Pipeline gen ảnh → upscale → bìa sau → mockup đã chạy ổn. Cần thêm bước cuối: chọn nhiều bộ lịch, đẩy ảnh lên Cloudflare R2 (public CDN), rồi xuất **1 file CSV đúng template** `templates/printify_calendar_template.csv` để import hàng loạt lên Printify.

Quyết định đã chốt (không thay đổi):
- Secret R2 nằm trong `.env`, giống `COMFY_GATEWAY_TOKEN`.
- Mỗi bộ xuất **cả 2 khổ**: 11x8.5 và 14x11.5. App tự render khổ còn thiếu vào thư mục staging tạm.
- Đẩy **cả 2 bản**: đã che (CEN) và không che (ORG).
- Preview 1–5 = 5 ảnh mockup, Preview 6–8 để trống.

## 2. Luồng người dùng
1. Trang `/history` có nút **"Đẩy R2 + xuất CSV"** ở header danh sách.
2. Bấm nút thì mở popup gồm:
   - Badge trạng thái R2: "Đã cấu hình" / "Thiếu biến môi trường: …" / "Kết nối lỗi". Có nút "Kiểm tra kết nối".
   - Ô tìm kiếm (theo title / SKU) và nút "Chọn tất cả bộ hợp lệ".
   - Danh sách bộ lịch dạng checkbox: thumbnail bìa trước, Etsy title, ngày tạo, SKU gốc (nếu có), trạng thái R2 (Chưa đẩy / Đã đẩy lúc … / Lỗi: …).
   - Bộ chưa đủ điều kiện có checkbox disabled kèm lý do. Đủ điều kiện = đủ 13 ảnh hoàn thành (indexInBatch 0..12), `mockupStatus === "done"` và có `etsyTitle`.
3. Bấm **Xác nhận** thì hiện spinner "Đang đẩy … bộ (có thể mất vài phút)". Xong thì hiện toast + bảng kết quả (bộ thành công / bộ lỗi kèm lý do) + nút **Tải CSV** và **Mở thư mục**.
4. Bộ đã đẩy vẫn chọn lại được; khi đó app ghi đè đúng key cũ trên R2.

## 3. Quy chuẩn SKU
```
CAL-{MED}-{YYMM}-{CODE}-{SIZE}-{VAR}
vd: CAL-ANI-2611-SF4U7-11-CEN
```
| Phần | Ý nghĩa | Nguồn |
|---|---|---|
| `CAL` | lịch treo tường | hằng số |
| `MED` | `ANI` anime, `REA` người thực, `GEN` không rõ | `batch.mediumId` → `MediumPreset.name`, map theo từ khoá không phân biệt hoa thường/dấu: chứa "anime" → ANI; chứa "thực"/"thuc"/"real" → REA; còn lại → GEN |
| `YYMM` | tháng tạo batch (giờ local) | `batch.createdAt` |
| `CODE` | 5 ký tự cuối `batch.id`, viết hoa | nếu trùng `r2SkuBase` của batch khác thì lấy 6, 7… ký tự cuối |
| `SIZE` | `11` hoặc `14` | khổ |
| `VAR` | `CEN` đã che, `ORG` không che | bản |

- **SKU gốc** = `CAL-{MED}-{YYMM}-{CODE}` (vd `CAL-ANI-2611-SF4U7`). Sinh ở lần đẩy đầu, lưu `GenerationBatch.r2SkuBase` (unique), sau đó **không bao giờ đổi**.

## 4. Cấu trúc key trên R2
```
{R2_KEY_PREFIX}/                          # mặc định: calendars/anima
  {YYYY}/
    {sku-gốc-lowercase}_{title-slug}/     # vd: cal-ani-2611-sf4u7_cozy-anime-girl-2027
      11x8.5/
        cen/  front_cover.png, m01_month.png … m12_month.png, back_cover.png
        org/  (14 file, tên giống cen/)
      14x11.5/
        cen/  …
        org/  …
      previews/
        01_mockup_covers.png  02_mockup_q1.png  03_mockup_q2.png  04_mockup_q3.png  05_mockup_q4.png
```
- `r2Folder` = phần `{YYYY}/{sku-lower}_{title-slug}`, tính ở lần đẩy đầu, lưu DB, các lần sau dùng lại.
- `title-slug` lấy từ `etsyTitle`: bỏ dấu (NFD + bỏ combining marks, `đ`→`d`), lowercase, chuỗi ký tự ngoài `[a-z0-9]` thay bằng một `-`, trim `-`, tối đa 50 ký tự (cắt rồi trim `-` lại). Rỗng thì chỉ dùng `{sku-lower}`.
- Mapping trang: `indexInBatch 0` → `front_cover.png`, `1..12` → `m01_month.png..m12_month.png`, bìa sau → `back_cover.png`.
- Mapping preview: 5 file PNG trong `{finalRoot}/{slug}/mockup/` sắp theo tên, đổi tên thành `0{i}_` + tên gốc bỏ tiền tố số. Ví dụ `00_mockup_covers.png` → `01_mockup_covers.png`, `01_mockup_q1.png` → `02_mockup_q1.png`.
- URL public = `${R2_PUBLIC_BASE_URL bỏ "/" cuối}/${key}`.
- Upload với `ContentType: "image/png"`, `CacheControl: "public, max-age=3600"`.
- Mỗi bộ có tổng cộng 2 khổ × 2 bản × 14 trang + 5 preview = **61 object**.

## 5. Mapping CSV
- `PRINTIFY_HEADER` = **nguyên văn** dòng 1 của `templates/printify_calendar_template.csv`, kể cả các tên lệch như `Page 6 m05_month` (không có số 0). Không tự "sửa" header.
- Mỗi bộ ra **4 dòng**, thứ tự `11-CEN`, `11-ORG`, `14-CEN`, `14-ORG`.
- Cột:
  - `SKU` = SKU đầy đủ.
  - `Page 01..Page 14` = URL 14 trang của đúng khổ và bản (front_cover, m01..m12, back_cover).
  - `Preview 1..5` = URL 5 preview; `Preview 6..8` = rỗng.
  - `Title` = `etsyTitle`.
  - `Description (HTML)` = `etsyDescription` chuyển sang HTML:
    - Escape `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `'`→`&#x27;`.
    - Tách khối theo dòng trống. Khối mà mọi dòng đều bắt đầu bằng `- `, `• ` hoặc `* ` → `<ul><li>…</li></ul>`. Khối khác → `<p>…</p>`, xuống dòng đơn trong khối đổi thành dấu cách.
    - Không có khoảng trắng hay newline giữa các thẻ (giống template).
  - `Tags` = các phần tử của `etsyTagsJson` nối bằng `", "`.
- CSV theo RFC 4180: chỉ quote field chứa `,`, `"`, `\r` hoặc `\n`; `"` nhân đôi. Dòng kết thúc bằng `\n`. Encoding UTF-8 không BOM.
- Tên file `calendars_YYYYMMDD_HHmmss_printify.csv` (giờ local), lưu vào `{finalRoot}/_r2_exports/`.
- Bộ lỗi **không có dòng** trong CSV và được liệt kê trong `results`. Nếu tất cả bộ đều lỗi thì không ghi file, `csvFileName = null`.

## 6. Thiết kế kỹ thuật

### 6.1 Env + dependency
Thêm vào `.env.example`, kèm 1 đoạn hướng dẫn ngắn trong `README.md`:
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
R2_KEY_PREFIX=calendars/anima
```
Cài `@aws-sdk/client-s3`. **Cẩn thận khi cài trên PowerShell:** không viết `pkg@>=x`, vì `>` sẽ thành redirect ra file. S3Client dùng `region: "auto"`, `endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.

### 6.2 Prisma
Thêm vào `model GenerationBatch` (kèm comment tiếng Việt 1 dòng theo style file):
```
r2SkuBase  String?  @unique
r2Folder   String?
r2Status   String?   // "done" | "failed" | null
r2PushedAt DateTime?
r2Error    String?
```
Tạo migration bằng `npx prisma migrate dev --name add_r2_export_fields`, rồi chạy script build template DB của Electron (`scripts/build-template-db.mjs`, xem `package.json` để biết lệnh npm tương ứng).

### 6.3 Module `lib/r2/`
| File | Nội dung |
|---|---|
| `config.ts` | `readR2Config()` validate env bằng zod, trả config hoặc throw lỗi tiếng Việt liệt kê biến thiếu. `getR2Status(): { configured: boolean; missing: string[] }`. |
| `client.ts` | `createR2Client(config)`, `putObject(client, bucket, key, body)`, `headBucket(client, bucket)`. |
| `sku.ts` | Hàm thuần `mediumCode(name)`, `buildSkuBase({id, createdAt}, mediumName, codeLength = 5)`, `fullSku(base, sizeCode, variant)`. Hàm có DB: `ensureSkuBase(batchId)` (đã có thì trả lại; chưa có thì sinh, tăng codeLength khi trùng, lưu). |
| `keys.ts` | `titleSlug(title)`, `buildR2Folder(skuBase, createdAt, title)`, `pageKey(prefix, folder, size, variant, filename)`, `previewKey(prefix, folder, filename)`, `publicUrl(baseUrl, key)`, `PAGE_FILENAMES` (14 tên theo thứ tự). |
| `formats.ts` | Map format → `{ size: "11x8.5" | "14x11.5", code: "11" | "14" }` từ format id (`premade_wall_11x8_5`, `premade_wall_14x11_5`). Format không nhận ra thì bỏ qua và log. |
| `render-pages.ts` | `renderBatchPages(batchId, format, stagingDir): Promise<{ cen: string[]; org: string[] }>` trả 14 đường dẫn file theo thứ tự `PAGE_FILENAMES`. Tái sử dụng `upscaleToSize` (`lib/images/upscale.ts`), `loadBackCoverGeometry` (`lib/calendar/back-cover-format.ts`), `composeBackCover` (`lib/images/back-cover.ts`), `resolveSafePath` (`lib/files/safe-output.ts`), `resolveOutputRoot`/`resolveCensoredRoot` (`lib/output-dir.ts`). Logic giống `upscaleOneImage` + `buildBackCover` trong `lib/generations/upscale-image.ts`, nhưng **chỉ ghi vào stagingDir, không update DB**. Ảnh không có `maskedRelativePath` thì bản CEN dùng ảnh gốc. Thiếu ảnh nào trong 13 slot thì throw. |
| `description-html.ts` | `plainToHtml(text)` theo mục 5. |
| `csv.ts` | `PRINTIFY_HEADER: string[]`, `escapeCsvField`, `buildCsv(rows: string[][]): string`, `buildRowsForBatch(...)`. |
| `push-batches.ts` | `pushBatches(batchIds): Promise<{ csvFileName: string \| null; results: Array<{ batchId; ok: boolean; skuBase?; error? }> }>`. Chạy **tuần tự** từng batch: kiểm tra điều kiện → `ensureSkuBase` → `r2Folder` → với mỗi khổ trong `listCalendarFormats()`: render vào `path.join(os.tmpdir(), "anima-r2", batchId, size)` rồi upload 28 file (song song tối đa 4) → upload 5 preview → update DB `r2Status:"done"`, `r2PushedAt`, `r2Error:null` → xoá staging trong `finally`. Lỗi một bộ thì set `r2Status:"failed"`, `r2Error` và chuyển sang bộ tiếp theo. Cuối cùng ghi CSV. |

Dùng chung hàm `isBatchEligible(batch)` (trả `{ eligible, reason }`) cho cả `candidates` và `push`.

### 6.4 API routes
Copy pattern từ `app/api/generations/[batchId]/mockup/route.ts`: `export const runtime = "nodejs"`, `params` là Promise, `apiError`/`handleApiError` từ `lib/api/errors`.
- `GET /api/r2/status` → `{ configured, missing }`. Với `?test=1` thì gọi thêm `headBucket` và trả `{ ..., connection: "ok" | "error", error? }`.
- `GET /api/r2/candidates` → mảng `{ id, etsyTitle, createdAt, coverImageId, eligible, reason, r2SkuBase, r2Status, r2PushedAt, r2Error }`, sắp mới nhất trước. `coverImageId` = id của GeneratedImage ở job `indexInBatch 0`; thumbnail dùng route `/api/images/[imageId]` có sẵn.
- `POST /api/r2/push` → body zod `{ batchIds: z.array(z.string().min(1)).min(1).max(50) }`. R2 chưa cấu hình thì trả 409. Kết quả trả về như `pushBatches`.
- `GET /api/r2/exports/[name]` → tên phải khớp `^calendars_\d{8}_\d{6}_printify\.csv$`, đọc qua `resolveSafePath(exportsDir, name)`, trả `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="…"`.
- `POST /api/r2/exports/reveal` → mở `{finalRoot}/_r2_exports` bằng `explorer.exe`, cách làm giống `app/api/generations/[batchId]/reveal-folder/route.ts`.

### 6.5 UI
- `hooks/use-r2.ts`: `useR2Status`, `useR2Test`, `useR2Candidates(enabled)`, `usePushR2` (khi xong thì invalidate query history và candidates). Dùng `apiGet`/`apiPost` trong `lib/client/api.ts` và đặt query key theo convention các hook khác.
- `components/history/r2-export-dialog.tsx`: dùng các component shadcn có sẵn trong `components/ui/` (Dialog, Button, Checkbox nếu có; chưa có thì thêm qua shadcn CLI hoặc dùng `<input type="checkbox">` style tailwind), icon Lucide (`CloudUpload`), toast `sonner`.
- Đặt nút mở dialog trong header của `components/history/history-grid.tsx`.
- `components/history/batch-card.tsx`: hiện SKU gốc (font mono, nhỏ) + badge "Đã đẩy R2" khi `r2Status === "done"`. Thêm field vào type trong `lib/types.ts` và response `/api/history` nếu cần.

## 7. Test (Vitest, `tests/`)
- `r2-sku.test.ts`: `mediumCode` (Anime, "Người thực", null), `buildSkuBase` đúng format, tăng `codeLength` khi trùng.
- `r2-keys.test.ts`: `titleSlug` (tiếng Việt có dấu, ký tự đặc biệt, rỗng, > 50 ký tự), `pageKey`/`previewKey`/`publicUrl` (base có và không có `/` cuối).
- `r2-csv.test.ts`: `PRINTIFY_HEADER.join(",")` === dòng 1 của template đọc từ file; quote đúng khi có dấu phẩy, ngoặc kép, xuống dòng; 4 dòng/bộ đúng thứ tự; Preview 6–8 rỗng; tổng 26 cột mỗi dòng.
- `r2-description-html.test.ts`: escape, đoạn, list, xuống dòng đơn.
- `r2-push.test.ts`: mock client R2 + `renderBatchPages` + prisma. Kiểm tra: một bộ lỗi không chặn bộ khác; bộ thành công có đúng 61 lần upload; staging bị xoá kể cả khi lỗi; DB update đúng; tất cả lỗi thì `csvFileName === null`.

## 8. Definition of Done
- [x] Tất cả mục 6.1–6.5 và mục 7 đã xong.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` đều pass.
- [x] Không thay đổi file nào trong `lib/generations/`, `lib/censor/`, `lib/mockup/`, `lib/comfyui/`.
- [x] `git status` sạch (trừ `0.26.0`), mọi thứ đã commit trên `feature/cloudflare_r2_store`, **không push**.
- [x] Điền mục "Ghi chú của người thực thi" bên dưới: những chỗ lệch spec + lý do, và những gì chưa test được (ví dụ upload thật lên R2).

## Ghi chú của người thực thi
1. **Các hạng mục đã hoàn thành:**
   - **6.1 Env + dependency:** Đã cài `@aws-sdk/client-s3`, cập nhật các biến môi trường R2 vào `.env.example`, bổ sung mục hướng dẫn cấu hình Cloudflare R2 trong `README.md`.
   - **6.2 Prisma:** Đã thêm 5 trường R2 (`r2SkuBase`, `r2Folder`, `r2Status`, `r2PushedAt`, `r2Error`) vào `model GenerationBatch` trong `prisma/schema.prisma`, tạo migration `20261106173000_add_r2_export_fields` và build lại template DB với `npm run build:template-db`.
   - **6.3 Module `lib/r2/`:** Triển khai đầy đủ 9 module: `config.ts`, `client.ts`, `sku.ts`, `keys.ts`, `formats.ts`, `render-pages.ts`, `description-html.ts`, `csv.ts`, `push-batches.ts`.
   - **6.4 API routes:** Triển khai 5 endpoints: `GET /api/r2/status`, `GET /api/r2/candidates`, `POST /api/r2/push`, `GET /api/r2/exports/[name]`, `POST /api/r2/exports/reveal`.
   - **6.5 UI:** Triển khai `hooks/use-r2.ts`, component `components/history/r2-export-dialog.tsx`, nút mở dialog ở header danh sách trong `components/history/history-grid.tsx`, hiển thị SKU gốc và badge "Đã đẩy R2" trên `components/history/batch-card.tsx`.
   - **7. Tests:** Triển khai đầy đủ 5 test files trong `tests/` (`r2-sku.test.ts`, `r2-keys.test.ts`, `r2-csv.test.ts`, `r2-description-html.test.ts`, `r2-push.test.ts`). Tất cả 19 test files (128 tests) đều pass.

2. **Những chỗ lệch spec + lý do:**
   - Không có sai lệch chức năng hay cấu trúc so với đặc tả.
   - Về component Checkbox: Project chưa có file `components/ui/checkbox.tsx`. Theo đúng hướng dẫn tại mục 6.5 ("hoặc dùng `<input type="checkbox">` style tailwind"), dialog sử dụng input checkbox được style bằng Tailwind CSS để tối ưu độ tương thích và không phát sinh thêm package ngoài.

3. **Những gì chưa test được trong môi trường này:**
   - Chưa test upload trực tiếp lên Cloudflare R2 bucket thật do môi trường local không có sẵn R2 credentials thật (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`).
   - Mọi tương tác S3Client R2 (gọi `headBucket`, `putObject` đúng 61 lần mỗi bộ lịch, xử lý retry, độc lập lỗi giữa các bộ lịch, dọn dẹp thư mục staging tạm và ghi file CSV RFC 4180) đã được kiểm thử toàn diện qua Vitest.
