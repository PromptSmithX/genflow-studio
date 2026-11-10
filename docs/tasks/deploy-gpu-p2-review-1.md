# Review vòng 1 — P2 app RunPod (`feature/deploy_gpu`)

**Kết luận:** Không có Blocker. `npm test` 192/192, `tsc`, `lint` xanh (reviewer chạy lại). Submit paths, settings (không lộ key), routes, UI đúng spec. Còn 3 mục **Nên sửa** về độ đúng khi chạy thật. Mỗi mục 1 commit nhỏ, thêm/cập nhật test tương ứng, chạy lại `npm test && npx tsc --noEmit && npm run lint` trước khi báo xong. Không sửa ngoài các file nêu dưới (trừ test và ghi chú spec).

## Nên sửa

### 1. `lib/comfyui/job-sync.ts` `syncBatch` — job `unknown` làm batch "completed" sớm
**Lỗi:** Lỗi tạm thời (timeout 15s gọi `/status`, R2 tải lỗi) ghi job `unknown`. `syncBatch` chỉ coi `queued`/`running` là đang chạy, nên batch có 12 job `completed` + 1 job `unknown` thành `"completed"` → `auto-sync.ts` ngừng poll batch này (chỉ chọn `queued`/`running`) và `processAutoWorkflow` chạy auto-publish thiếu 1 ảnh, dù kết quả vẫn nằm trên R2/RunPod và lẽ ra lấy lại được ở tick sau.
**Sửa:**
- Trong `syncBatch`, khi tính status: job `unknown` **có `promptId`** được tính như đang chạy (batch → `"running"`).
- Chặn treo vô hạn: trong `syncJob`, ở mọi nhánh đang ghi `status: "unknown"` (lỗi `RunpodApiError`, `download_failed`), nếu `Date.now() - (job.submittedAt ?? job.createdAt) > 2 giờ` thì ghi `status: "failed"`, `errorCode: "sync_timeout"`, `errorMessage: "Không đồng bộ được kết quả sau 2 giờ — bấm Tạo lại"`, `finishedAt` (để auto-retry nhận). Hằng `UNKNOWN_GIVE_UP_MS = 2 * 60 * 60 * 1000`.
- Test (`tests/job-sync.test.ts`): batch 1 job `completed` + 1 job `unknown` có `promptId` → batch `running`; `RunpodApiError` khi job đã submit > 2 giờ → `failed` `sync_timeout`.

### 2. `lib/comfyui/runpod-client.ts:159` — status lạ/thiếu bị coi là FAILED
**Lỗi:** `let status = (data.status ?? "FAILED") as RunpodJobStatus;`. Chưa xác nhận được RunPod trả gì cho job đã hết hạn (404, hay 200 kèm `error` và không có `status`). Nếu là dạng sau, job bị đánh `runpod_failed` và **bỏ qua bước phục hồi từ R2** ở nhánh `NOT_FOUND` — mất ảnh đã sinh xong. Ngoài ra chuỗi status ngoài danh sách cũng bị ép kiểu mù.
**Sửa:** Validate `data.status` theo danh sách `IN_QUEUE|IN_PROGRESS|COMPLETED|FAILED|CANCELLED|TIMED_OUT`; thiếu hoặc không thuộc danh sách → trả `{ status: "NOT_FOUND", images: [], error: errorString }`. Test: 200 `{ "error": "job not found" }` không có `status` → `NOT_FOUND`; status lạ `"WEIRD"` → `NOT_FOUND`.

### 3. `lib/validations/settings.ts` — không xóa được Endpoint ID bằng ô trống
**Lỗi:** `runpodEndpointId: z.string().trim().regex(/^[a-z0-9-]+$/i, ...)`. Ở `connection-card.tsx` `handleSave`, người dùng xóa trắng ô Endpoint ID rồi bấm "Lưu" → gửi `""` → regex fail → 400 "Endpoint ID không hợp lệ".
**Sửa:** Chấp nhận chuỗi rỗng (`/^[a-z0-9-]*$/i` hoặc `.or(z.literal(""))`); route PUT đã chuyển `""` → `null`. Test validation: `""` hợp lệ, `"abc 123"` không hợp lệ.

## Việc của user (không giao cho agent)
- Khi có endpoint thật: xác nhận phản hồi `/status/<id>` của job đã quá 30 phút (404 hay 200) — reviewer sẽ điều chỉnh nếu khác giả định.
