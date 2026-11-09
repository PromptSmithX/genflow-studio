# Task P4: Dọn legacy Colab/gateway + tổng kết

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại). P1–P3 đã xong: app dùng RunPod Serverless (`lib/comfyui/runpod-client.ts`) và gọi LLM trực tiếp. P4 **chỉ xóa/sửa code chết và chữ cũ**, không đổi hành vi luồng sinh ảnh, censor fallback local, LLM, pipeline publish. Mâu thuẫn → chọn phương án an toàn, ghi vào "Ghi chú của người thực thi".

## 0. Quy tắc bắt buộc
1. Đọc `AGENTS.md` + guide liên quan trong `node_modules/next/dist/docs/` trước khi sửa route/layout. Block `next dev` sinh trong `AGENTS.md` (nếu có) commit kèm.
2. Loại `.next/`, `dist-electron/`, `resources/`, `node_modules/` khi search/sửa.
3. **Không** viết migration xóa cột DB (`comfyBaseUrl`, `hasGatewayToken` giữ trong `prisma/schema.prisma` để DB cũ của user không bị đụng). Chỉ ngừng dùng ở code.
4. Code tiếng Anh; UI + lỗi tiếng Việt. Comment tối đa 1 dòng.
5. Commit nhỏ: (a) spec này → (b) xóa ComfyClient + test → (c) censor HTTP → (d) gateway token + comfyBaseUrl khỏi API/DTO → (e) LLM header + comment cũ → (f) chữ UI/README/.env.example → (g) ghi chú. Bỏ qua file `0.26.0`.
6. Phải pass: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 6. Việc cần làm

### 6.1 Xóa `ComfyClient`
- Xóa `lib/comfyui/client.ts` và `tests/comfy-client.test.ts`.
- `lib/api/errors.ts`: bỏ import + nhánh `ComfyApiError` (giữ `RunpodApiError`), sửa comment nhắc `ComfyApiError`.
- Kiểm tra không còn import `@/lib/comfyui/client` ở đâu (kể cả `workflow-mapper.ts`, `workflow-store.ts`, routes `app/api/workflow/*` — **không** sửa logic import/mapping workflow, đó là tính năng giữ lại).

### 6.2 Censor — chỉ còn local fallback
`lib/censor/run-censor.ts`:
- Xóa `censorViaHttp`, `HTTP_TIMEOUT_MS`, `isCensorConfigured` (không ai gọi).
- `censorImages(items)` bỏ tham số `censorUrl`: có `CENSOR_PYTHON` → `censorViaSubprocess`, không → mọi item `skipped`. Giữ nguyên `censorViaSubprocess`, `readParams`, types.
- Sửa comment đầu file/hàm: censor chính chạy trong worker RunPod (P1); file này là fallback CPU local.
- Cập nhật caller duy nhất `lib/comfyui/job-sync.ts` (đang gọi `censorImages([...])` không URL — chỉ cần khớp chữ ký mới) và test liên quan.

### 6.3 Gateway token + `comfyBaseUrl` khỏi API/DTO
- `lib/settings.ts` `redactSettings`: bỏ `comfyBaseUrl`, `hasGatewayToken`.
- `lib/types.ts` `SettingsDTO`: bỏ `comfyBaseUrl`, `hasGatewayToken`.
- `lib/validations/settings.ts`: bỏ `comfyBaseUrl`, `gatewayToken` khỏi `settingsUpdateSchema`.
- `app/api/settings/route.ts`: bỏ nhánh parse/lưu `comfyBaseUrl` và khối cảnh báo `gatewayToken`; bỏ import `parseComfyBaseUrl`.
- `lib/validations/url.ts` + `tests/url-validator.test.ts`: nếu `parseComfyBaseUrl` không còn ai dùng → xóa cả hai.
- Grep toàn bộ `app/ lib/ components/ hooks/ tests/` cho `comfyBaseUrl`, `hasGatewayToken`, `gatewayToken`, `COMFY_GATEWAY_TOKEN` → chỉ được còn trong `prisma/schema.prisma` và `prisma/migrations/`. Sửa test fixtures (vd `tests/settings-redact.test.ts`) cho khớp.

### 6.4 LLM client
`lib/llm/client.ts`: bỏ header `"bypass-tunnel-reminder": "1"` và comment nhắc gateway Colab/ComfyClient (~L40, ~L72–75). Giữ `Authorization` + `Content-Type`. Cập nhật `tests/llm-client.test.ts` nếu nó kiểm header đó.

### 6.5 Chữ cũ
- `app/layout.tsx:18` metadata description → `"Tạo ảnh lịch anime bằng GPU RunPod Serverless"`.
- `lib/comfyui/auto-sync.ts:13` comment nhắc Colab → "RunPod" (1 dòng).
- Grep `-i "colab|tunnel|loca\.lt|trycloudflare|localtunnel"` trong `app/ lib/ components/ hooks/` → **0 kết quả**.
- `.env.example`: bỏ `COMFY_GATEWAY_TOKEN` (và comment liên quan); thêm comment 1–2 dòng: "RunPod Endpoint/API key và LLM API key nhập trong trang Cài đặt (lưu SQLite cục bộ)"; thêm `RUNPOD_OUTPUT_PREFIX=runpod-out` (tùy chọn, phải khớp env của worker). Giữ `CENSOR_*`, R2, Google.
- `README.md` gốc repo: sửa phần cài đặt/kết nối đang mô tả Colab/LocalTunnel → mô tả ngắn RunPod Serverless (trỏ tới `deploy/runpod-serverless/README.md` để build worker; trong app: Cài đặt → Kết nối GPU nhập Endpoint ID + API key; Cài đặt → Trợ lý AI nhập LLM key). Không viết lại phần khác của README.

### 6.6 Kiểm tra tiêu chí handoff
Grep phải sạch trong `app/ lib/ components/ hooks/`: `ComfyClient`, `` /censor` ``, `` }/llm ``, `getActivePromptIds`, `viewImage(`, `submitPrompt(`.

## 7. Test
- Xóa test của code đã xóa; cập nhật test bị ảnh hưởng (`llm-client`, `settings-redact`, `job-sync`...).
- Thêm 1 test cho `censorImages`: không có `CENSOR_PYTHON` → mọi item `skipped`.
- Ghi số test trước/sau vào Ghi chú (giảm do xóa test là bình thường — liệt kê file đã xóa).

## 8. Definition of Done
- [x] Mọi grep ở 6.3, 6.5, 6.6 sạch (dán kết quả grep vào Ghi chú).
- [x] Không migration mới; `prisma/schema.prisma` không đổi.
- [x] `lib/pipeline/*`, `lib/r2/*`, `lib/sheets/*`, `lib/comfyui/runpod-client.ts`, `lib/comfyui/workflow-*` không đổi hành vi.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` xanh.
- [x] Điền "Ghi chú của người thực thi" (tổng kết P4); `worker_done` liệt kê commit.

## Ghi chú của người thực thi

### 1. Kết quả Grep kiểm tra tiêu chí
- **Grep 6.3** (`git grep -n "comfyBaseUrl\|hasGatewayToken\|gatewayToken\|COMFY_GATEWAY_TOKEN" app/ lib/ components/ hooks/ tests/`):
  -> **0 kết quả** (chỉ còn trong `prisma/schema.prisma` và `prisma/migrations/`).
- **Grep 6.5** (`git grep -in "colab\|tunnel\|loca\.lt\|trycloudflare\|localtunnel" app/ lib/ components/ hooks/`):
  -> **0 kết quả**.
- **Grep 6.6** (`ComfyClient`, `` /censor` ``, `` }/llm ``, `getActivePromptIds`, `viewImage(`, `submitPrompt(` trong `app/ lib/ components/ hooks/`):
  -> **0 kết quả** cho tất cả pattern.

### 2. Thống kê Test
- **Trước**: 31 test files, 208 passed.
- **Sau**: 30 test files, 197 passed.
- **Files test đã xóa (-14 tests)**:
  - `tests/comfy-client.test.ts` (9 tests)
  - `tests/url-validator.test.ts` (5 tests)
- **Files test thêm mới / cập nhật (+3 tests)**:
  - `tests/run-censor.test.ts` (2 tests mới: xử lý rỗng và kiểm tra `CENSOR_PYTHON` không set -> mọi item `skipped`)
  - `tests/llm-client.test.ts` (+1 test: kiểm tra headers chuẩn, không có `bypass-tunnel-reminder`)
- **Tất cả test suite**: 30/30 files pass, 197/197 tests pass.

### 3. Verification & Typecheck & Build
- `npx tsc --noEmit`: Clean (0 errors).
- `npm run lint`: Clean (0 errors).
- `npm run build`: Compiled and built successfully (26 static/dynamic routes).

### 4. Danh sách commit trong P4
- (a) `4d4360b`: `docs: add task p4 cleanup spec`
- (b) `2a735e9`: `refactor(comfyui): remove ComfyClient and ComfyApiError`
- (c) `47443d9`: `refactor(censor): remove HTTP censor and keep local CPU fallback`
- (d) `906ac27`: `refactor(settings): remove comfyBaseUrl and gatewayToken from API and DTO`
- (e) `98b2ffd`: `refactor(llm): remove bypass-tunnel-reminder header and old comments`
- (f) `5d176c2`: `docs: update UI text, README, and env example for RunPod Serverless`
- (g) `ac03310`: `docs: update task p4 execution notes and definition of done`
