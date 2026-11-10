# Handoff: Chuyển backend sang RunPod Serverless

> **File này viết cho:** một phiên **Claude mới trong Orca CLI** (khởi động "lạnh", không có lịch sử chat trước). Nhiệm vụ của bạn (Claude đọc file này) là **điều phối + review**: giao phần viết code cho **Gemini Antigravity**, rồi review kết quả theo tiêu chí ở Mục 9; nếu chưa đạt thì viết task sửa cụ thể và giao lại. File này tự chứa đủ ngữ cảnh — không cần đọc lịch sử chat cũ.
>
> **Người dùng:** 1 cá nhân, giao tiếp **tiếng Việt** → hãy trả lời họ bằng tiếng Việt. Tool này sinh ảnh cho bộ lịch (có nội dung người lớn/NSFW); việc triển khai hạ tầng ở đây là **công việc kỹ thuật trung tính về nội dung** (app có dịch vụ che vùng nhạy cảm sẵn). Hỗ trợ kỹ thuật bình thường.

---

## 1. Tóm tắt 30 giây
App **Anima Studio** (Next.js 16 + Electron, 1 người dùng, UI tiếng Việt) sinh **13 ảnh/bộ lịch** bằng ComfyUI chạy trên **Google Colab** qua 1 tunnel URL. Giờ cần chuyển sang **GPU thuê lâu dài**. Đã quyết định: **RunPod Serverless** (tự bật khi có request, tự tắt khi rảnh, trả tiền theo giây). Việc này cần **(a)** đóng gói 1 **Docker image có handler** chạy ComfyUI bên trong worker, và **(b)** viết lại tầng gọi backend của app (vì serverless không expose ComfyUI API gốc + gateway như Colab).

**Branch làm việc:** `feature/deploy_gpu` (tách từ `dev`).

---

## 2. Vì sao chọn Serverless (câu chuyện quyết định — đừng bỏ qua)
1. Ban đầu dùng Colab chỉ để test. Cần hạ tầng GPU ổn định, lâu dài.
2. Từng deploy **RunPod Serverless** nhưng **kẹt cứng**: endpoint gắn **network volume 50GB ở datacenter EU-CZ-1**, mà **EU-CZ-1 hết sạch GPU** → worker "Throttled"/"No workers available", request nằm queue vô hạn. **Network volume khóa endpoint vào đúng 1 DC** → đó là gốc rễ.
3. Cân nhắc 2 hướng:
   - **Pod** (thuê GPU riêng): app **0 sửa code** (cho ComfyUI API y hệt Colab), nhưng **bật/tắt thủ công** — Pod **không tự bật** khi bấm generate, chỉ có hẹn giờ cứng `--stop-after`.
   - **Serverless**: **tự bật khi có request → chạy → rảnh thì tự scale về 0** (idle timeout), trả tiền theo giây, chọn nhiều GPU type để chống quá tải. Đổi lại: **phải viết lại backend** + cold-start mỗi lần đánh thức.
4. Người dùng muốn đúng cơ chế **"bấm là chạy, rảnh thì tự tắt"** → đó **chính là serverless** (Pod không làm được vế tự bật). Người dùng **chấp nhận sửa code**.
5. **Đã test tay (2026-11-09)** để khử nỗi lo khan GPU: trong Edit endpoint, **gỡ network volume** → ô Data centers mở khóa → chọn **tất cả 34 DC** + **nhiều GPU type** → gửi 1 request thử → serverless **vồ được GPU `PRO 6000 MIG 24GB` ở `US-NE-1`**, delay ~**1m33s** cold, **chờ queue miễn phí** ($0.00/s, chỉ tính tiền khi worker chạy). ⇒ Availability đủ dùng, đáng đầu tư rewrite.

**Kết luận:** Migrate backend sang RunPod Serverless, cấu hình **đa GPU type + all-DC + không network volume** (hoặc dùng Global Volume beta sau).

---

## 3. App hiện tại hoạt động thế nào (ngữ cảnh code)
- **Stack:** Next.js 16.4.3 (App Router, Turbopack), React 19, TS; Prisma + SQLite (`data/anima.sqlite`); Cloudflare R2; Google Sheets; Electron. UI tiếng Việt. Repo: `genflow-studio`.
- **Luồng:** nhập ý tưởng → LLM sinh 13 prompt + metadata Etsy → tạo `GenerationBatch` gồm **13 `GenerationJob`** (index 0 = bìa, 1–12 = tháng) → mỗi job submit 1 workflow lên ComfyUI → poller nền (15s) tải ảnh về đĩa → censor → pipeline publish (upscale CPU → R2 → Sheet).
- **Mỗi `GenerationJob` = ĐÚNG 1 ẢNH.** Cột `GenerationJob.promptId` lưu id ComfyUI của job đó.
- App nói chuyện với **1 URL** (`AppSettings.comfyBaseUrl`) gồm:
  - ComfyUI gốc: `GET /system_stats`, `POST /prompt`, `GET /history/{id}`, `GET /view`, `GET /queue`.
  - Gateway thêm: `POST /censor` (NudeNet 640m), `POST /llm/chat/completions` (proxy tới LLM thật, tự chèn key).
- **File backend chủ chốt (blast radius khi rewrite):**
  | File | Vai trò hiện tại |
  |---|---|
  | `lib/comfyui/client.ts` | `ComfyClient`: submitPrompt / getHistory / getQueue / viewImage / getSystemStats |
  | `lib/comfyui/job-sync.ts` | `syncJob`/`syncBatch`: getHistory → viewImage (tải ảnh) → censor → ghi DB |
  | `lib/comfyui/auto-sync.ts` (≈dòng 179) | Poller 15s, khởi tạo `new ComfyClient(...)` |
  | `lib/generations/create-batch.ts` (159, 277) | Submit prompt cho batch |
  | `lib/generations/regenerate-fresh.ts` (175) | Submit lại 1 job |
  | `lib/censor/run-censor.ts` | `censorImages` qua `${baseUrl}/censor` (có fallback CPU subprocess) |
  | `lib/llm/resolve-config.ts` | Ghép `${comfyBaseUrl}/llm`; `lib/llm/client.ts` = `LlmClient` (đã hỗ trợ apiKey) |
  | `app/api/connection/{test,status}/route.ts` | Test kết nối bằng `getSystemStats` |
  | `app/api/generations/[batchId]/sync/route.ts` | Sync thủ công |
  | Settings: `prisma/schema.prisma` (`AppSettings.comfyBaseUrl`), `lib/validations/settings.ts`, `app/api/settings/route.ts`, `lib/settings.ts`, `lib/types.ts`, `components/settings/connection-card.tsx`, `components/app-shell/connect-onboarding.tsx` | |
- **Notebook tham chiếu:** `LUSTIFY_v10_Krea2_Turbo_INT8_Colab_Headless.ipynb` ở gốc repo — đây là **bản dựng ComfyUI + censor + gateway đã chạy được**, dùng làm nguồn sao chép chính xác cho Dockerfile/handler.

### Model cần nạp vào worker image (chính xác)
| Model | Nguồn | Đích trong ComfyUI | Ghi chú |
|---|---|---|---|
| **LUSTIFY v10 Krea2 Turbo INT8** (`lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors`) | CivitAI: `MODEL_VERSION_ID=3112728`, `fileId=2996235`. URL: `https://civitai.com/api/download/models/3112728?fileId=2996235&token=<CIVITAI_TOKEN>` (fallback host `civitai.red`) | `models/diffusion_models/` | **Cần CivitAI API token.** Size đúng **13,148,974,712 bytes**; SHA-256 `0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d` (verify!) |
| **qwen3vl_4b_fp8_scaled.safetensors** (text encoder) | `https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors` | `models/text_encoders/` | ~4.7GB, HF công khai |
| **wan_2.1_vae.safetensors** (VAE) | `https://huggingface.co/Comfy-Org/Wan-2.1/resolve/main/split_files/vae/wan_2.1_vae.safetensors` | `models/vae/` | ~220MB, HF công khai |
| **640m.onnx** (censor NudeNet) | `https://huggingface.co/ServiceStack/comfy-gateway/resolve/main/640m.onnx` (nhiều mirror) | `/models/640m.onnx` | ~104MB, verify 90–130MB |
- **ComfyUI:** clone `https://github.com/Comfy-Org/ComfyUI.git` (bản Comfy-Org, cần cho kiến trúc **Krea 2**), `pip install -r requirements.txt`.
- **Node bắt buộc:** UNETLoader, CLIPLoader (`type=krea2`), VAELoader, CLIPTextEncode, ConditioningZeroOut, EmptyLatentImage, KSampler, VAEDecode, SaveImage.
- **Sampling preset:** Euler, Beta scheduler, 8 steps, **CFG 1.0** (Turbo). Lưu ý: **CFG=1 + ConditioningZeroOut → negative prompt vô tác dụng** (LLM chỉ viết positive).
- **Censor "balanced":** chỉ che các class `*_EXPOSED` (FEMALE_BREAST/GENITALIA, MALE_GENITALIA, BUTTOCKS, ANUS); threshold 0.25, padding 0.35, blur 45, feather 8; trả header `X-Mask-Status: censored|clean`. Logic đầy đủ nằm ở Cell 7.5 của notebook.

---

## 4. Kiến trúc đích (serverless)
```
CŨ (Colab/Pod):  App ── HTTP ──> 1 tunnel URL
                   /prompt, /history/{id}, /view   (ComfyUI gốc, async poll)
                   /censor                          (gateway -> NudeNet 8191)
                   /llm/chat/completions            (gateway -> LLM thật)

MỚI (Serverless):
  App ── POST https://api.runpod.ai/v2/{endpointId}/run
         header Authorization: Bearer <RUNPOD_API_KEY>
         body  { input: { workflow: <WorkflowApiJson>, censor: true } }
      └─> { id }
  App ── GET  https://api.runpod.ai/v2/{endpointId}/status/{id}
      └─> { status: IN_QUEUE|IN_PROGRESS|COMPLETED|FAILED,
            output: { images: [ { data|url, mask_status, masked_data|masked_url } ] } }
  Worker (handler.py): boot ComfyUI nội bộ (127.0.0.1:8188) 1 lần -> nhận input.workflow
       -> POST local /prompt -> poll local /history -> đọc ảnh qua local /view
       -> censor bằng 640m.onnx -> trả base64 (<=8MB) hoặc upload R2 trả url (>8MB)
  LLM: App gọi THẲNG nhà cung cấp (xAI/OpenAI...), key lưu trong AppSettings — KHÔNG qua GPU worker
```
**Giữ nguyên model dữ liệu:** 13 ảnh = 13 lần `/run`; cột `promptId` tái dùng để lưu **RunPod job id**. `workflow-mapper.ts` không đổi (vẫn sinh `WorkflowApiJson`, chỉ gửi vào `input` thay vì `/prompt`).

---

## 5. Kế hoạch triển khai (đầy đủ)

### Phần 1 — Worker image: `deploy/runpod-serverless/`
| File | Vai trò |
|---|---|
| `Dockerfile` | Base PyTorch 2.8/CUDA 12.8 → clone+cài ComfyUI Comfy-Org → **nướng 3 model** (model 1 qua **BuildKit secret** `civitai_token`, 2 model HF qua `wget`) + **640m.onnx** → cài `runpod` SDK + deps censor (`nudenet==3.4.2`, `onnxruntime`, `opencv-python-headless`, `Pillow`, `numpy`) → copy `handler.py`, `censor_lib.py` → entry = handler |
| `handler.py` | `runpod.serverless.start({"handler": ...})`; boot ComfyUI nền 1 lần; mỗi job: nhận `input.workflow` → local `/prompt` → poll local `/history` → đọc ảnh `/view` → censor → build output (base64 hoặc R2 url) |
| `censor_lib.py` | Rút `censor_image()` từ notebook Cell 7.5 (640m, cùng TARGET_CLASSES + tham số) |
- Tham khảo pattern cộng đồng **`runpod-worker-comfy`** (boot ComfyUI trong container, nhận workflow JSON, trả base64) — cùng ý tưởng.
- **KHÔNG** cần cloudflared/tunnel, **KHÔNG** cần network volume (model đã nằm trong image).

### Phần 2 — Client mới trong app
**NEW `lib/comfyui/serverless-client.ts`** (thay vai trò HTTP của `ComfyClient`):
- `submitJob(workflow): Promise<{ jobId: string }>` → `POST {RUNPOD_BASE}/run`, header `Authorization: Bearer {apiKey}`, body `{ input: { workflow, censor: true } }`.
- `getJobResult(jobId)` → `GET {RUNPOD_BASE}/status/{jobId}` → map `IN_QUEUE/IN_PROGRESS/COMPLETED/FAILED` → `{ status, images: [{ data?|url?, mask_status, masked_data?|masked_url? }] }`.
- `health()` → `GET {RUNPOD_BASE}/health` (cho connection test).
- `RUNPOD_BASE = https://api.runpod.ai/v2/{endpointId}`. Lấy `endpointId` + `apiKey` từ `AppSettings`.

### Phần 3 — Sửa điểm gọi backend
| File | Sửa |
|---|---|
| `lib/generations/create-batch.ts` | `submitPrompt` → `serverlessClient.submitJob`; lưu `jobId` vào `promptId` |
| `lib/generations/regenerate-fresh.ts` | tương tự |
| `lib/comfyui/job-sync.ts` | **Viết lại `syncJob`**: thay `getHistory`→`viewImage`→`censorImages` bằng `getJobResult(promptId)`; COMPLETED → decode base64 **hoặc** tải R2 `url`, ghi ảnh gốc + ảnh che ra đĩa, set `maskStatus`/`maskedRelativePath`. Censor **do worker làm** → bỏ gọi `/censor`. Bỏ logic `getActivePromptIds`/grace-window kiểu ComfyUI, map theo status RunPod |
| `lib/comfyui/auto-sync.ts` | khởi tạo `serverlessClient` từ settings; giữ nhịp 15s |
| `app/api/connection/{test,status}/route.ts` | test = `health()` |
| `app/api/generations/[batchId]/sync/route.ts` | dùng serverlessClient |

### Phần 4 — Tách LLM khỏi gateway
- `lib/llm/resolve-config.ts`: đọc `llmBaseUrl` + `llmApiKey` + `llmModel` **từ AppSettings**, bỏ ghép `${comfyBaseUrl}/llm`.
- `LlmClient` đã nhận `apiKey` → app gọi thẳng provider.
- **Đánh đổi:** key LLM lưu SQLite cục bộ (gitignore) thay vì ẩn ở Colab — chấp nhận được vì tool **1 người chạy local**, không phát hành installer ra ngoài.

### Phần 5 — Censor
- Luồng cloud: **nằm trong worker** (trả `masked_data`/`masked_url`); bỏ `censorViaHttp` khỏi `job-sync.ts`.
- Giữ `censorViaSubprocess` (CPU local) làm fallback dev.

### Phần 6 — Settings schema + UI (Prisma migration)
- `prisma/schema.prisma` thêm vào `AppSettings`: `runpodEndpointId String?`, `runpodApiKey String?`, `llmBaseUrl String?`, `llmApiKey String?` (giữ `llmModel`, `comfyBaseUrl` cho local dev/legacy). Tạo **migration mới**.
- Cập nhật `lib/validations/settings.ts`, `app/api/settings/route.ts`, `lib/settings.ts` (`hasLlmKey = Boolean(llmApiKey)`), `lib/types.ts`, `components/settings/connection-card.tsx`, `components/app-shell/connect-onboarding.tsx` (ô nhập Endpoint ID, API Key, mục LLM). Nhãn **tiếng Việt**.

### Phần 7 — Giới hạn output 10MB (ĐÃ VERIFY)
- `/run` async cap **10MB**; vượt → RunPod trả 400, **bỏ kết quả**. (`/runsync` 20MB.)
- 1 ảnh gốc + 1 ảnh che base64 ở res lịch (vd 1024×1536 PNG) ~6–10MB → **sát trần**.
- **Hybrid trong handler:** payload ≤8MB → base64; >8MB → **upload R2** (app đã có R2; cấp creds qua env endpoint) trả `url`/`masked_url`. Client xử lý cả 2.

### Phần 8 — Build & Deploy (người dùng thao tác, Claude hướng dẫn)
1. `DOCKER_BUILDKIT=1 docker build --secret id=civitai_token,src=token.txt -t <user>/anima-serverless:latest deploy/runpod-serverless/` → `docker push`.
2. Tạo serverless endpoint: image trên; **chọn nhiều GPU type (24+48+32GB)**; **all data centers**; **No network volume**; min=0, max=1–3; idle timeout 60–300s; FlashBoot on.
3. Env endpoint: `R2_*` creds (cho fallback upload). CivitAI token đã bake lúc build, không để lộ trong env.
4. Lấy **Endpoint ID** + tạo **RunPod API Key** → dán vào Cài đặt app. Nhập **LLM base URL + key + model** vào mục LLM.

---

## 6. Ràng buộc đã kiểm chứng (nguồn chính thức)
- **Network volume khóa endpoint vào 1 DC** → giảm availability/failover. Dùng đa GPU + all-DC thay thế. (docs.runpod.io/storage/network-volumes)
- **Serverless chọn tối đa nhiều GPU type theo thứ tự ưu tiên**, hết loại này nhảy loại kế; cho phép tất cả DC để sẵn có tối đa. (docs.runpod.io/serverless/endpoints/endpoint-configurations)
- **`/run` output cap 10MB** (`/runsync` 20MB), vượt là mất kết quả → nên trả URL/cloud storage. (docs.runpod.io/serverless/workers/handler-functions)
- **Chờ queue serverless miễn phí**, chỉ tính tiền khi worker chạy; cold-start gồm nạp model vào VRAM (bị tính). (docs.runpod.io/serverless/endpoints/job-states)
> Người dùng **yêu cầu luôn verify bằng web search** các con số/hành vi của RunPod, sợ hallucination. Khi tư vấn RunPod, **search lại rồi mới khẳng định**, đừng nói theo trí nhớ.

---

## 7. Quy trình handoff với Gemini Antigravity (vai trò của BẠN)
Bạn (Claude ở Orca) **không tự viết toàn bộ code** — bạn **điều phối + review**:
1. **Chia việc** theo 4 phân kỳ (P1→P4), mỗi phân kỳ 1 nhóm task rõ ràng (file + hành vi mong đợi).
2. **Giao cho Antigravity** code từng phân kỳ trong worktree/branch `feature/deploy_gpu`.
3. **Review diff** Antigravity trả về theo **tiêu chí nghiệm thu (Mục 9)**.
4. Chưa đạt → viết **danh sách task sửa cụ thể** (không chung chung: nêu file, dòng, hành vi) rồi **giao lại** cho Antigravity.
5. Lặp cho tới khi đạt hết tiêu chí → đề xuất merge `feature/deploy_gpu` → `dev`.

Khuyến nghị thứ tự: **P1 (worker image chạy độc lập, test `/run` bằng curl) trước** — chưa đụng app; rồi P2 (sinh ảnh + censor), P3 (LLM + settings), P4 (dọn legacy + test).

---

## 8. Luật repo bắt buộc (đọc trước khi code)
- **`AGENTS.md` ở gốc repo:** đây **không phải Next.js thường** — **đọc `node_modules/next/dist/docs/`** (resolve từ thư mục chứa `AGENTS.md`) **trước khi viết code**, nhất là API routes. Block do `next dev` sinh trong `AGENTS.md` phải **commit kèm** work (đừng tách riêng).
- **Build artifacts** (`.next/`, `dist-electron/`, `resources/`) chứa bản copy lồng nhau — **exclude khi search/sửa**.
- **Credentials** nằm trên đĩa (`.env`, `secrets/*.json`) — đều gitignore, đừng commit.

---

## 9. Tiêu chí nghiệm thu (reviewer check)
1. `npm test` **xanh** (~148 test). Cập nhật `tests/comfy-client.test.ts`, `tests/regenerate-fresh.test.ts`; **thêm test** cho `serverless-client` (mock `/run`, `/status`).
2. `curl -H "Authorization: Bearer <key>" https://api.runpod.ai/v2/<id>/health` OK; `/run` 1 workflow → `/status` COMPLETED + ảnh hợp lệ.
3. App end-to-end: tạo batch 13 ảnh → auto-sync tải ảnh về đĩa → ảnh che đúng → Trợ lý AI soạn prompt OK → pipeline publish (R2/Sheet) chạy tiếp **không đổi**.
4. **Không còn** chỗ nào phụ thuộc `${comfyBaseUrl}/censor` hoặc `${comfyBaseUrl}/llm` trong luồng cloud.
5. `handler.py` xử lý được **cả** output base64 (≤8MB) **và** R2 url (>8MB).
6. **Không phá:** model dữ liệu (`GenerationJob` = 1 ảnh; `promptId` tái dùng); pipeline `lib/pipeline/*`, R2, Sheets; UI vẫn tiếng Việt.

---

## 10. Khởi động nhanh cho bạn (Claude Orca)
- `git fetch && git checkout dev && git pull` → tạo/đi vào `feature/deploy_gpu`.
- Đọc `AGENTS.md`, mở `lib/comfyui/client.ts`, `lib/comfyui/job-sync.ts`, `lib/censor/run-censor.ts`, `lib/llm/client.ts` để nắm interface hiện tại.
- Mở notebook `LUSTIFY_v10_Krea2_Turbo_INT8_Colab_Headless.ipynb` (Cell 2–8) để lấy chính xác lệnh dựng ComfyUI + censor cho `Dockerfile`/`handler.py`.
- Bắt đầu P1. Giao code cho Antigravity, review, lặp.
