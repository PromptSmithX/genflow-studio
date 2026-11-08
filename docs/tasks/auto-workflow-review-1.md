# Review vòng 1 — fix/auto_workflow

**Kết luận:** Bám spec tốt. `npm test` (148/148), `tsc`, `lint`, `build` đều pass, migration đánh dấu `legacy` đúng. Còn **3 mục Nên sửa** (lỗi logic thật, test hiện tại chưa bắt) và 1 Gợi ý. Mỗi mục 1 commit nhỏ, có test, chạy lại đủ 4 lệnh (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) trước khi báo xong. Ghi kết quả vào mục "Cập nhật sau Review vòng 1" cuối `docs/tasks/auto-workflow.md`. Không push.

## Nên sửa

### 1. Auto-retry chạy cả với batch không phải bộ lịch
`lib/comfyui/auto-sync.ts::processAutoWorkflow`, nhánh `partial/failed`: chưa kiểm tra batch có phải bộ lịch không.
**Lỗi:** batch tạo tay hoặc batch 1 ảnh từ `regenerateJob` (`requestedCount: 1`, không có `etsyTitle`/`mediumId`) bị lỗi sẽ bị gọi `regenerateJobFreshPrompt`. Hàm này **gọi LLM viết lại prompt** của người dùng, nên làm hỏng ảnh gen thủ công và tốn lượt LLM.
**Sửa:** tách hàm thuần dùng chung, ví dụ `getCalendarSkipReason(batch): string | null` (`requestedCount !== 13` / thiếu `etsyTitle`), dùng trong cả `runAutoPublish` và `processAutoWorkflow`. Trong `processAutoWorkflow`, batch không phải bộ lịch (mọi `status`) thì set `autoStatus: "skipped"` + `autoError` = lý do và không retry. Test: batch `partial` với `requestedCount: 1` không gọi `regenerateJobFreshPrompt` và chuyển sang `skipped`.

### 2. Batch kẹt ở `pending`/`processing` vĩnh viễn khi server tắt giữa chừng
Pipeline chạy vài phút trong bộ nhớ. Nếu tắt app/Electron hoặc server crash lúc đó, `autoStatus` vẫn là `pending`/`processing`. `processAutoWorkflow` chỉ xét `null`/`retrying`, còn nút "Chạy lại tự động" (`components/history/batch-card.tsx:100`) chỉ hiện khi `failed`/`legacy`.
**Lỗi:** batch không bao giờ tự chạy lại, người dùng cũng không có nút để bấm.
**Sửa:** trong `startAutoSyncPoller` (chỉ chạy 1 lần nhờ guard `started`), reset một lần mọi batch `autoStatus ∈ {pending, processing}` về `null` để tick sau tự nhặt lại. Không await chặn khởi động; lỗi chỉ log. Đồng thời cho nút "Chạy lại tự động" hiện cả khi `skipped`. Test: reset được gọi đúng 1 lần dù `startAutoSyncPoller` gọi nhiều lần.

### 3. Dòng báo lỗi ghi đè dòng Sheet đã đẩy thành công
`lib/sheets/sync.ts`: chế độ `error` dùng `buildErrorRowsForTabs`, tạo dòng với URL/Description/Tags rỗng rồi `updateRange` **cả dòng** nếu SKU đã có.
**Lỗi:** bộ đã `done` (Sheet đủ URL), người dùng "Sửa lại" 1 ảnh, ảnh đó lỗi 2 lần → tick ghi dòng lỗi → **xoá trắng toàn bộ URL** của bộ trên Sheet, dù file trên R2 vẫn còn nguyên. Lỗi này cùng loại với mục 1 của `docs/tasks/r2-export-review-1.md`.
**Sửa:** ở chế độ `error`, nếu SKU đã có dòng thì chỉ cập nhật 2 ô `Status` và `Updated` (cột AA:AB, index 26–27; tính chữ cột từ `FULL_SHEET_HEADER`, không hardcode), giữ nguyên các ô khác. SKU chưa có thì vẫn append dòng lỗi như hiện tại. Test: SKU đã có + error → chỉ 1 lần `updateRange` với range `AA{n}:AB{n}`, không ghi các cột khác.

## Gợi ý (không bắt buộc)

### 4. Retry bị đốt hết khi LLM/Colab đang tắt
`regenerateJobFreshPrompt` gọi LLM **trước** khi đổi gì trong DB. Nếu LLM lỗi thì job vẫn `failed`, batch vẫn `partial`, nhưng `autoRetryCount` đã tăng. 15 giây sau tick kế dùng nốt lượt thứ 2, rồi chuyển `failed` trong vòng ~30 giây mà chưa gen lại thật lần nào. Có thể: chỉ tăng `autoRetryCount` khi `regenerateJobFreshPrompt` không throw, và nếu tất cả lời gọi trong tick đều throw thì ghi `autoError` = message lỗi (giữ `autoStatus` để tick sau thử lại; vẫn bị chặn bởi cửa sổ 24h). Nếu làm, thêm test tương ứng.
