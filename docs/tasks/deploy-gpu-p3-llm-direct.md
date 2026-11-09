# Task P3: Tách LLM khỏi gateway — app gọi thẳng nhà cung cấp

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại). Ngữ cảnh: `docs/serverless-migration-handoff.md` Phần 4. P1/P2 đã xong (RunPod). Mâu thuẫn → chọn phương án an toàn, ghi vào "Ghi chú của người thực thi". Không mở rộng scope: **không** xóa `ComfyClient`/`censorViaHttp`/`comfyBaseUrl` (để P4).

## 0. Quy tắc bắt buộc
1. Đọc `AGENTS.md` + guide liên quan trong `node_modules/next/dist/docs/` trước khi sửa API route/page. Block `next dev` sinh trong `AGENTS.md` (nếu có) commit kèm.
2. Loại `.next/`, `dist-electron/`, `resources/`, `node_modules/` khi search/sửa.
3. **Không bao giờ trả `llmApiKey` về browser, không log key.**
4. Code tiếng Anh; UI + lỗi tiếng Việt. Comment tối đa 1 dòng.
5. Commit nhỏ: (a) spec này + `docs/tasks/deploy-gpu-p2-review-1.md` nếu chưa commit → (b) prisma → (c) resolve-config + callers → (d) settings API/DTO → (e) UI → (f) tests. Bỏ qua file `0.26.0`.
6. Phải pass: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 1. Mục tiêu
Trước đây LLM đi qua `${comfyBaseUrl}/llm` (gateway Colab tự chèn key). Serverless không có gateway → app gọi thẳng provider OpenAI-compatible (mặc định xAI `https://api.x.ai/v1`) bằng base URL + API key + model lưu trong `AppSettings` (SQLite local, gitignore — chấp nhận vì app 1 người dùng, không phát hành installer). `LlmClient` đã hỗ trợ `apiKey`, chỉ chưa ai truyền.

## 6. Thiết kế kỹ thuật

### 6.1 Prisma
`AppSettings` thêm `llmApiKey String?` (`llmBaseUrl`, `llmModel`, `llmSystemPrompt` **đã có**). `npx prisma migrate dev --name add_llm_api_key`, rồi `npm run build:template-db`.

### 6.2 `lib/llm/resolve-config.ts`
```ts
export const DEFAULT_LLM_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_LLM_MODEL = "grok-4-fast-non-reasoning"; // giữ
export interface ResolvedLlmConfig { baseUrl: string; apiKey: string; model: string; }
export function resolveLlmConfig(settings: { llmBaseUrl: string | null; llmApiKey: string | null; llmModel: string | null }): ResolvedLlmConfig | null
```
- `apiKey` trống → `null`. `baseUrl = settings.llmBaseUrl?.trim() || DEFAULT_LLM_BASE_URL`, bỏ `/` cuối. `model = settings.llmModel?.trim() || DEFAULT_LLM_MODEL`.
- Xóa hoàn toàn logic ghép `${comfyBaseUrl}/llm` và comment cũ về gateway trong file này.

### 6.3 Callers
- `app/api/generations/suggest/route.ts` (~L27–30, ~L65) và `lib/generations/regenerate-fresh.ts` (~L44–47, ~L70): truyền `apiKey: llmConfig.apiKey` vào `new LlmClient({...})`. Message khi `null`: `"Chưa cấu hình Trợ lý AI (API key) — vào Cài đặt"` (giữ code `no_config`). Sửa comment cũ nhắc ComfyUI/gateway ở 2 chỗ này (comment ≤ 1 dòng).
- `lib/llm/client.ts`: **không** đổi hành vi trong P3 (header `bypass-tunnel-reminder` để P4 dọn).

### 6.4 Settings
- `lib/validations/settings.ts` `settingsUpdateSchema` thêm:
  - `llmBaseUrl: z.string().trim().url("URL không hợp lệ").or(z.literal("")).optional().nullable()`
  - `llmApiKey: z.string().trim().optional().nullable()`
- `app/api/settings/route.ts` PUT: `llmBaseUrl` lưu `|| null`; `llmApiKey` cùng quy ước với `runpodApiKey` (`undefined`/`""` → giữ nguyên, `null` → xóa, khác → lưu).
- `lib/settings.ts` `redactSettings`: trả `llmBaseUrl`; `hasLlmKey: Boolean(settings.llmApiKey)` (**thay** cho `Boolean(settings.comfyBaseUrl)`). Không trả `llmApiKey`.
- `lib/types.ts` `SettingsDTO`: thêm `llmBaseUrl: string | null`.

### 6.5 UI — `components/settings/llm-card.tsx` + `app/(studio)/settings/page.tsx`
- `LlmCard` **luôn hiển thị** (cả chế độ thường) vì thiếu key thì Trợ lý AI không chạy. Trong `page.tsx`, chuyển `LlmCard` ra khỏi nhánh `advancedMode`, đặt ngay sau `ConnectionCard`; truyền prop (vd `advanced: boolean`) để card tự ẩn/hiện phần nâng cao.
- Luôn hiện: ô "API key nhà cung cấp LLM" (`type="password"`, placeholder "Đã lưu — để trống nếu không đổi" khi `hasLlmKey`, ngược lại "xai-..."), ô "Base URL" (placeholder `https://api.x.ai/v1`, ghi chú nhỏ "Để trống = xAI mặc định. Dùng được mọi API tương thích OpenAI."), nút "Lưu cấu hình", nút "Xóa API key" (gửi `llmApiKey: null`, chỉ bật khi `hasLlmKey`).
- Chỉ chế độ nâng cao: "Model (tùy chọn)" (placeholder `grok-4-fast-non-reasoning`) và "System prompt tùy chỉnh (tùy chọn)" như hiện tại.
- Dòng trạng thái: "Sẵn sàng" khi `hasLlmKey`, ngược lại "Chưa có API key — Trợ lý AI chưa dùng được". Bỏ mọi chữ nhắc "URL ComfyUI"/"Colab"/"phía Colab".
- `components/create/assistant-create-form.tsx` (~L105–111): logic `llmReady = Boolean(settings?.hasLlmKey)` giữ; sửa comment cũ và câu hướng dẫn (nếu có) cho đúng: thiếu key → chỉ tới "Cài đặt → Trợ lý AI".

## 7. Test (Vitest)
- NEW `tests/resolve-llm-config.test.ts`: thiếu key → `null`; key có, base URL trống → `DEFAULT_LLM_BASE_URL`; base URL có `/` cuối bị bỏ; model trống → mặc định; không phụ thuộc `comfyBaseUrl`.
- Sửa `tests/regenerate-fresh.test.ts`: mock `resolveLlmConfig` trả thêm `apiKey`; kiểm `LlmClient` được khởi tạo với `apiKey`.
- Test settings (thêm vào file test phù hợp hoặc file mới `tests/settings-redact.test.ts`): `redactSettings` không có key `llmApiKey`/`runpodApiKey`; `hasLlmKey` theo `llmApiKey`.
- Validation: `llmBaseUrl` `""` hợp lệ, `"not a url"` không hợp lệ.

## 8. Definition of Done
- [ ] Grep `comfyBaseUrl` trong `lib/llm/`, `app/api/generations/suggest/`, `lib/settings.ts` (phần `hasLlmKey`) → không còn liên quan LLM.
- [ ] `GET /api/settings` không chứa `llmApiKey`/`runpodApiKey`.
- [ ] Migration mới + template DB build.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` xanh — ghi số test vào Ghi chú.
- [ ] `lib/pipeline/*`, `lib/r2/*`, `lib/sheets/*`, `lib/comfyui/*` không bị sửa.
- [ ] Điền "Ghi chú của người thực thi"; `worker_done` liệt kê commit + điều chưa test được (gọi provider thật).

## Ghi chú của người thực thi
(agent điền)
