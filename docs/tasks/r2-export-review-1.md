# Review vòng 1 — feature/cloudflare_r2_store

**Kết luận:** Không có Blocker. Code bám sát spec. `npm test` (128/128), `tsc`, `lint`, `build` đều pass; pipeline cũ (`lib/generations`, `lib/censor`, `lib/mockup`, `lib/comfyui`) không bị sửa. Còn 3 mục **Nên sửa** và 1 mục **Gợi ý** bên dưới. Mỗi mục làm 1 commit nhỏ, chạy lại `npm test && npx tsc --noEmit && npm run lint` trước khi báo xong.

## Nên sửa

### 1. Bộ không đủ điều kiện ghi đè trạng thái R2 cũ
`lib/r2/push-batches.ts`, nhánh `if (!check.eligible)`: đang `update` `r2Status: "failed"`.
**Lỗi:** bộ đã đẩy thành công trước đó, sau khi "Sửa lại" 1 ảnh (mockup bị reset), nếu bị gửi lên lại sẽ mất badge "Đã đẩy R2" dù file trên R2 vẫn còn nguyên.
**Sửa:** với bộ không đủ điều kiện thì **không ghi DB**, chỉ `results.push({ batchId, ok: false, error })`. Cập nhật test trong `tests/r2-push.test.ts`: bộ không đủ điều kiện không gọi `prisma.generationBatch.update`.

### 2. `r2Folder` chưa được lưu cùng lúc với SKU
`r2SkuBase` được lưu ngay trong `ensureSkuBase`, nhưng `r2Folder` chỉ được lưu khi push **thành công**.
**Lỗi:** lần đầu upload được một phần rồi lỗi, sau đó user sửa Etsy title → lần sau tính ra folder mới → file cũ thành rác trên R2, và vi phạm quy tắc "folder tính 1 lần".
**Sửa:** ngay sau `ensureSkuBase`, nếu `!batch.r2Folder` thì `update { r2Folder }` trước khi render/upload. Thêm test: lần push lỗi vẫn lưu `r2Folder`.

### 3. Nút "Tải CSV" dùng `window.open(..., "_blank")`
`components/history/r2-export-dialog.tsx` → `handleDownloadCsv`.
**Lỗi:** trong bản Electron (`electron/main.js` không có `setWindowOpenHandler`), cách này mở thêm một cửa sổ trắng rồi mới tải.
**Sửa:** dùng thẻ `<a href={...} download={filename}>` style như button (`buttonVariants`), giống nút tải ảnh trong `components/history/batch-mockup-section.tsx`.

## Gợi ý (không bắt buộc)

### 4. Upload dở dang vẫn chạy sau khi bộ đã bị đánh lỗi
`runWithConcurrency` throw ngay ở lỗi đầu tiên, trong khi tối đa 3 upload khác vẫn đang chạy và `finally` đã xoá staging. Không gây crash (đã kiểm chứng: `Promise.race` gắn handler cho tất cả promise), chỉ sinh lỗi ngầm và log rối. Có thể đổi sang: chạy hết theo giới hạn 4, gom lỗi bằng `Promise.allSettled`, rồi throw lỗi đầu tiên.

## Việc của user (không giao cho agent)
Test thật với R2 theo plan mục 8: điền `.env` → kiểm tra kết nối → đẩy 1 bộ → mở vài URL trong CSV → đẩy lại cùng bộ để xác nhận SKU/folder không đổi → import thử CSV vào Printify.
