# Task P2: App gọi RunPod Serverless (client + sinh ảnh + đồng bộ + settings RunPod)

> **Dành cho agent thực thi.** Làm đúng đặc tả này trên branch `feature/deploy_gpu` (worktree hiện tại). Ngữ cảnh: `docs/serverless-migration-handoff.md`, worker đã xong ở P1 (`deploy/runpod-serverless/`, xem hợp đồng output trong `deploy/runpod-serverless/README.md` §2). Mâu thuẫn → chọn phương án an toàn, ghi lý do vào "Ghi chú của người thực thi". Không mở rộng scope: **không** đụng LLM (`lib/llm/*`, `llm-card.tsx` — để P3), **không** xóa `ComfyClient`/`censorViaHttp` (để P4, chỉ ngừng dùng).

## 0. Quy tắc bắt buộc
1. Đọc `AGENTS.md` và guide liên quan trong `node_modules/next/dist/docs/` trước khi sửa API route (Next.js 16 có thay đổi). Nếu `next dev` sinh lại block trong `AGENTS.md`, commit kèm.
2. Loại `.next/`, `dist-electron/`, `resources/`, `node_modules/` khi search/sửa.
3. Không secret trong code/log; **không bao giờ trả `runpodApiKey` về browser**.
4. Code tiếng Anh; UI + thông báo lỗi tiếng Việt. Comment tối đa 1 dòng.
5. Commit nhỏ theo nhóm: (a) commit 2 file docs đang untracked `docs/serverless-migration-handoff.md`, `docs/tasks/deploy-gpu-p1-review-1.md` cùng spec này → (b) prisma → (c) runpod client + r2 helpers → (d) submit paths → (e) job-sync + auto-sync → (f) API routes + settings → (g) UI → (h) tests. Bỏ qua file `0.26.0`.
6. Phải pass: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. (`node_modules` đã cài. Nếu chưa có `.env`, copy `.env.example` → `.env` — gitignored — để Prisma có `DATABASE_URL`.)
7. Mọi hành vi RunPod API phải theo docs.runpod.io (ghi link trong comment đầu file client là đủ 1 dòng). Đã verify: `/run` → `{id, status}`; `/status/{id}` → `{id, status, output?, error?}`; status gồm `IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED, CANCELLED, TIMED_OUT`; kết quả `/run` giữ **30 phút** sau khi xong; `/health` trả `{jobs:{...}, workers:{...}}`.

## 1. Mục tiêu
Thay ComfyUI-qua-tunnel bằng RunPod Serverless cho toàn bộ luồng sinh ảnh. Giữ nguyên data model: 1 `GenerationJob` = 1 ảnh, cột `promptId` lưu **RunPod job id**. Pipeline `lib/pipeline/*`, R2 export, Sheets **không đổi**.

## 6. Thiết kế kỹ thuật

### 6.1 Prisma
`AppSettings` thêm:
```prisma
  runpodEndpointId  String?
  runpodApiKey      String?
```
`npx prisma migrate dev --name add_runpod_settings` rồi `npm run build:template-db`. Không xóa/đổi cột cũ (`comfyBaseUrl`, `hasGatewayToken` giữ nguyên).

### 6.2 NEW `lib/comfyui/runpod-client.ts`
```ts
export class RunpodApiError extends Error {
  constructor(message: string, public readonly code: "no_config" | "timeout" | "network" | "unauthorized" | "http_error" | "invalid_json", public readonly details?: unknown)
}
export type RunpodJobStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "NOT_FOUND";
export interface RunpodOutputImage { index: number; filename: string; key: string; masked_key: string | null; mask_status: "censored" | "clean" | "failed"; width: number | null; height: number | null; }
export interface RunpodJobResult { status: RunpodJobStatus; images: RunpodOutputImage[]; error?: string; }
export interface RunpodHealth { workers: Record<string, number>; jobs: Record<string, number>; }
export class RunpodClient {
  constructor(options: { endpointId: string; apiKey: string; timeoutMs?: number }) // thiếu → RunpodApiError no_config
  submitJob(workflow: WorkflowApiJson): Promise<{ jobId: string }>   // POST /run body { input: { workflow } }
  getJobResult(jobId: string): Promise<RunpodJobResult>             // GET /status/{id}; HTTP 404 → { status: "NOT_FOUND", images: [] }
  health(): Promise<RunpodHealth>                                    // GET /health
}
export function getRunpodClient(settings: { runpodEndpointId: string | null; runpodApiKey: string | null }): RunpodClient
```
- Base `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`, header `Authorization: Bearer ${apiKey}`, timeout mặc định 15s, AbortController như `ComfyClient`.
- 401/403 → `unauthorized` ("RunPod API key không hợp lệ"); 5xx/khác → `http_error` (details `{status, body≤500}`); JSON hỏng → `invalid_json`.
- `getJobResult`: `output.error` hoặc `error` (string) → `error`. COMPLETED nhưng output có `error` → coi như FAILED. Validate `output.images` bằng zod (bỏ phần tử sai shape).
- `getRunpodClient` ném `GenerationSetupError("Chưa cấu hình RunPod (Endpoint ID + API key) — vào Cài đặt", "not_configured")` khi thiếu. Nếu import `GenerationSetupError` từ `create-batch.ts` gây vòng import, chuyển class này sang `lib/generations/errors.ts` và re-export từ chỗ cũ không cần — sửa import ở mọi nơi dùng.
- `lib/api/errors.ts`: map `RunpodApiError` → HTTP 502 `{code, message, details}` giống `ComfyApiError` (giữ cả hai).

### 6.3 `lib/r2/client.ts`
Thêm, dùng `createR2Client(readR2Config())` có sẵn và `@aws-sdk/client-s3`:
- `getObjectBuffer(client, bucket, key): Promise<Buffer | null>` — `NoSuchKey`/404 → `null`.
- `deleteObject(client, bucket, key): Promise<void>`.
Worker và app dùng **cùng** bucket `R2_BUCKET`; key worker ở prefix `runpod-out/` (hằng `RUNPOD_OUTPUT_PREFIX = process.env.RUNPOD_OUTPUT_PREFIX ?? "runpod-out"`).

### 6.4 Submit paths
`lib/generations/create-batch.ts` (`createAndSubmitBatch` ~L159/177, `regenerateJob` ~L277/293), `lib/generations/regenerate-fresh.ts` (~L110 check, ~L175/191):
- Check cấu hình bằng `getRunpodClient(settings)` thay cho check `comfyBaseUrl`.
- `client.submitPrompt(mapped, batch.id)` → `client.submitJob(mapped)`; ghi `{ promptId: jobId, status: "queued", submittedAt: new Date() }`.
- Lỗi submit: `errorCode = error instanceof RunpodApiError ? error.code : "submit_failed"` (giữ cách log và cách không rethrow).

### 6.5 `lib/comfyui/job-sync.ts` — viết lại `syncJob`
Chữ ký: `syncJob(jobId: string, client: RunpodClient, outputRoot: string)`; `syncBatch`/`syncBatchExclusive` đổi kiểu `client` tương ứng, **logic gộp status batch giữ nguyên**.
1. Bỏ qua như cũ nếu job không tồn tại / `completed` / `failed` / không có `promptId`.
2. `getJobResult(promptId)`; `RunpodApiError` → `{status:"unknown", errorCode, errorMessage}` (như cũ).
3. `IN_QUEUE` → không ghi gì (giữ `queued`). `IN_PROGRESS` → `running` + `startedAt ??= now`.
4. `FAILED` / `CANCELLED` / `TIMED_OUT` → `status:"failed"`, `errorCode` = `runpod_failed` / `runpod_cancelled` / `runpod_timed_out`, `errorMessage` = `result.error ?? "<thông báo tiếng Việt mặc định>"`, `finishedAt`. (Để auto-retry trong `auto-sync.ts` nhận — nó chỉ retry `failed`.)
5. `NOT_FOUND` (kết quả hết hạn 30 phút hoặc id lạ): thử phục hồi từ R2 bằng key quy ước `${prefix}/${promptId}/0.png` (+ `0.masked.png`). Có → xử lý như COMPLETED với 1 ảnh dựng từ key (`mask_status` = `censored` nếu có file masked, ngược lại `failed`). Không có → nếu `now - (submittedAt ?? createdAt) < 2 phút` thì bỏ qua (chờ tick sau), ngược lại `failed` `result_expired` "Không còn kết quả trên RunPod (quá 30 phút) — bấm Tạo lại".
6. `COMPLETED`, 0 ảnh → `failed` `no_output_images` (như cũ).
7. `COMPLETED`, mỗi ảnh: bỏ qua nếu `existingFilenames` có `image.filename` (idempotent). `getObjectBuffer(key)`; `null` → job `unknown` `download_failed`, return. Ghi đĩa y như code cũ (`buildBatchFolder`, `buildOutputFilename(job.id, image.filename)`, `resolveSafePath`, mkdir) và tạo `GeneratedImage {jobId, relativePath, filename: image.filename, mimeType: "image/png", width, height}`. Nếu `masked_key` có → tải, ghi vào `resolveSafePath(resolveCensoredRoot(outputRoot), relativePath)` (mkdir), cập nhật `maskStatus = mask_status`, `maskedRelativePath = relativePath`. Nếu `mask_status === "failed"` hoặc tải masked lỗi → fallback `censorImages([{input, output}])` **không truyền URL** (chạy subprocess nếu có `CENSOR_PYTHON`, không thì `skipped`), ghi kết quả như code cũ. Lỗi censor không chặn job.
8. Sau khi mọi ảnh của job đã ghi đĩa + DB: `deleteObject` các key (gốc + masked) — best effort, lỗi chỉ `console.warn`. Rồi job `completed` (như cũ).
9. Xóa hẳn đoạn `getActivePromptIds`/grace window ComfyUI và `client.getBaseUrl()/censor` khỏi file này.

### 6.6 `lib/comfyui/auto-sync.ts`
`runSyncTick` (~L171–184): điều kiện chạy sync = `settings.runpodEndpointId && settings.runpodApiKey`; client = `getRunpodClient(settings)`. Nhịp 15s, `processAutoWorkflow` giữ nguyên.

### 6.7 API routes
- `app/api/generations/[batchId]/sync/route.ts`: dùng `getRunpodClient`; thiếu cấu hình → 400 `not_configured` (như cũ).
- `app/api/connection/test/route.ts`: body tùy chọn `{ endpointId?, apiKey? }` (thiếu thì lấy từ settings; `apiKey` rỗng = dùng key đã lưu). Gọi `health()`. Thành công → `{ state: "connected", checkedAt, workers: {idle, running, ...}, jobs: {inQueue, inProgress, ...} }`. `RunpodApiError` → 502 `{ state: "disconnected", error: {code, message} }`.
- `app/api/connection/status/route.ts`: `{state:"not_configured"}` hoặc `{state:"configured_untested", runpodEndpointId}`.
- Cập nhật `ConnectionTestResponse`/`ConnectionStatusResponse` trong `lib/types.ts` (bỏ `version/gpu/vram*`, thêm `workers/jobs`). `lib/validations/settings.ts`: `connectionTestSchema` = `{ endpointId?: string, apiKey?: string }`.

### 6.8 Settings
- `lib/validations/settings.ts` `settingsUpdateSchema`: thêm `runpodEndpointId: z.string().trim().regex(/^[a-z0-9-]+$/i, "Endpoint ID không hợp lệ").optional().nullable()`, `runpodApiKey: z.string().trim().optional().nullable()`.
- `app/api/settings/route.ts` PUT: `runpodEndpointId` lưu `|| null`; `runpodApiKey`: `undefined` hoặc `""` → **giữ nguyên**, `null` → xóa, chuỗi khác → lưu.
- `lib/settings.ts` `redactSettings`: thêm `runpodEndpointId`, `hasRunpodKey: Boolean(settings.runpodApiKey)`. **Không** trả `runpodApiKey`. `SettingsDTO` trong `lib/types.ts` cập nhật tương ứng.
- `hooks/use-connection.ts`: `useConnectionTest` nhận `{endpointId?, apiKey?}`; `useHeaderConnectionState` vẫn test 30s/lần với cấu hình đã lưu (body rỗng).

### 6.9 UI (tiếng Việt)
- `components/settings/connection-card.tsx`: tiêu đề "Kết nối GPU (RunPod Serverless)"; mô tả "GPU tự bật khi có yêu cầu và tự tắt khi rảnh. Lần đầu có thể mất 1–2 phút để khởi động."; ô "Endpoint ID"; ô "RunPod API Key" `type="password"`, placeholder "Đã lưu — để trống nếu không đổi" khi `hasRunpodKey`; nút "Kiểm tra kết nối", "Lưu", "Xóa cấu hình". Kết quả: "Đã kết nối — worker: X rảnh, Y đang chạy; job chờ: Z" / "Không kết nối được: <message>". Bỏ cảnh báo tunnel/Colab.
- `components/app-shell/connect-onboarding.tsx`: banner "Nhập RunPod Endpoint ID + API Key để bắt đầu"; 2 ô; "Kiểm tra kết nối" → nếu connected thì lưu cả hai; toast "Đã kết nối! Bạn có thể bắt đầu tạo ảnh."
- Không để lại chữ "Colab", "tunnel", "loca.lt", "trycloudflare" trong 2 file này.

## 7. Test (Vitest, `tests/`)
- NEW `tests/runpod-client.test.ts` (stub `fetch` như `tests/comfy-client.test.ts`): `submitJob` gửi đúng URL/header/body và trả `jobId`; `getJobResult` cho từng status; COMPLETED parse images; COMPLETED kèm `output.error` → FAILED; 404 → NOT_FOUND; 401 → `unauthorized`; timeout; `health()`; constructor thiếu cấu hình → `no_config`.
- NEW `tests/job-sync.test.ts` (mock `@/lib/db`, `@/lib/r2/client`, `@/lib/censor/run-censor`, `node:fs/promises`): COMPLETED ghi ảnh gốc + masked, tạo `GeneratedImage`, xóa object R2, job `completed`; chạy lại không tạo trùng; `mask_status: failed` → gọi fallback `censorImages` không URL; FAILED/CANCELLED/TIMED_OUT → `failed` đúng `errorCode`; NOT_FOUND phục hồi từ R2; NOT_FOUND không có object và quá 2 phút → `result_expired`; trong 2 phút → không ghi; IN_PROGRESS → `running`; lỗi `RunpodApiError` → `unknown`.
- Sửa `tests/regenerate-fresh.test.ts` (mock `runpod-client`, `submitJob` → `{jobId:"rp-123"}`, kiểm `promptId: "rp-123"`; settings mock có `runpodEndpointId/runpodApiKey`), `tests/auto-sync-publish.test.ts` (settings không có RunPod → bỏ qua sync loop).
- `tests/comfy-client.test.ts` giữ nguyên (P4 mới xóa).

## 8. Definition of Done
- [ ] Không còn chỗ nào trong luồng sinh ảnh/đồng bộ/test kết nối khởi tạo `ComfyClient` (grep `new ComfyClient` trong `app/ lib/` → 0).
- [ ] `job-sync.ts` không còn `/censor`, `getActivePromptIds`, `getBaseUrl`.
- [ ] API key RunPod không xuất hiện trong response nào (`GET /api/settings`, connection routes) và không bị log.
- [ ] Migration mới + template DB đã build.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` xanh — ghi số test vào Ghi chú.
- [ ] `lib/pipeline/*`, `lib/r2/push-batches.ts`, `lib/sheets/*` không bị sửa.
- [ ] Điền "Ghi chú của người thực thi"; `worker_done` liệt kê commit + điều chưa test được (RunPod thật).

## Ghi chú của người thực thi
(agent điền)
