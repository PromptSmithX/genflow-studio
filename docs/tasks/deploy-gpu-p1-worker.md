# Task P1: Worker image RunPod Serverless (`deploy/runpod-serverless/`)

> **Dành cho agent thực thi.** Làm đúng đặc tả này trên branch `feature/deploy_gpu` (worktree hiện tại). Ngữ cảnh đầy đủ: `docs/serverless-migration-handoff.md`. Nếu đặc tả mâu thuẫn với thực tế, chọn phương án an toàn và ghi lý do vào "Ghi chú của người thực thi" cuối file. Không tự mở rộng scope. **P1 không sửa bất kỳ file nào của app Next.js** (`app/`, `lib/`, `components/`, `prisma/`...).

## 0. Quy tắc bắt buộc
1. Không commit secret (CivitAI token, R2 key, RunPod key). `token.txt` phải nằm trong `.gitignore` của thư mục deploy.
2. Mọi khẳng định về hành vi RunPod (SDK, payload, env, job id) phải dựa trên docs.runpod.io — ghi link nguồn trong `README.md`.
3. Comment code tối đa 1 dòng. Code/identifier tiếng Anh; README tiếng Việt.
4. Commit nhỏ theo nhóm (Dockerfile → censor → handler → README/test input). Bỏ qua file `0.26.0` ở gốc repo (không commit, không sửa).
5. Nguồn chuẩn để sao chép tham số: notebook `LUSTIFY_v10_Krea2_Turbo_INT8_Colab_Headless.ipynb` (gitignore, có trong repo chính `D:/model_gen_anh_local_18/MVP_workflow/`), Cell 2–7.5.

## 1. Mục tiêu
Một Docker image chạy được như RunPod Serverless worker: nhận workflow ComfyUI (API JSON), sinh ảnh, che vùng nhạy cảm bằng NudeNet 640m, **luôn upload ảnh gốc + ảnh che lên Cloudflare R2** với key cố định theo job id, trả về key. (Không trả base64 — kết quả `/run` chỉ giữ 30 phút, trần 10MB; đã chốt với user.)

## 2. Hợp đồng input/output (app P2 sẽ dựa vào — giữ đúng tên field)
Input:
```json
{ "input": { "workflow": { "<nodeId>": { "class_type": "...", "inputs": {} } } } }
```
Output khi thành công:
```json
{ "images": [ {
  "index": 0,
  "filename": "<runpodJobId>_0.png",
  "key": "<prefix>/<runpodJobId>/0.png",
  "masked_key": "<prefix>/<runpodJobId>/0.masked.png",
  "mask_status": "censored",
  "width": 1024, "height": 1536
} ] }
```
- `prefix` = env `RUNPOD_OUTPUT_PREFIX`, mặc định `runpod-out`. `runpodJobId` = `job["id"]` của RunPod.
- `mask_status` ∈ `censored | clean | failed`. Khi `failed`: `masked_key: null`, job vẫn thành công.
- Lỗi (workflow sai, ComfyUI từ chối, timeout, upload R2 lỗi): `return {"error": "<mô tả ngắn, có node_errors nếu có>"}` → RunPod đánh dấu FAILED. Không để exception thoát ra ngoài handler.

## 6. Thiết kế kỹ thuật
| File | Nội dung |
|---|---|
| `deploy/runpod-serverless/Dockerfile` | Base PyTorch 2.8 + CUDA 12.8 **runtime** (vd `pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime` — verify tag tồn tại trên Docker Hub rồi pin). Cài `git wget`. Clone `https://github.com/Comfy-Org/ComfyUI.git` vào `/comfyui` và **checkout 1 commit SHA cố định** (lấy HEAD hiện tại bằng `git ls-remote`, ghi SHA + ngày vào README; notebook không pin nhưng image phải tái lập được). `pip install -r requirements.txt`. Model (mục 6.1). Censor deps cài vào **venv riêng `/opt/censor-venv`**: `nudenet==3.4.2 "numpy>=1.26,<3" opencv-python-headless "onnxruntime>=1.19,<2" "Pillow>=10,<12"` (giống notebook, tránh xung đột numpy với torch). Env chính: `runpod boto3 requests`. Copy `handler.py`, `censor_lib.py`, `censor_cli.py`. `CMD ["python", "-u", "/handler.py"]`. Không cloudflared, không network volume. |
| `deploy/runpod-serverless/download_model.py` | Script tải model LUSTIFY dùng lúc build: đọc token từ `/run/secrets/civitai_token` (BuildKit secret `--mount=type=secret,id=civitai_token`) — token **không** được nằm trong layer/ENV/ARG. Logic như notebook Cell 3: hosts `https://civitai.red` rồi `https://civitai.com`, URL `{host}/api/download/models/3112728?fileId=2996235&token=...`, header `User-Agent`, từ chối Content-Type html/json, verify size **13148974712** và SHA-256 **0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d** (sai → xóa file, thử host kế; hết host → exit 1 để build fail). Đích `/comfyui/models/diffusion_models/lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors`. |
| `deploy/runpod-serverless/censor_lib.py` | Copy **nguyên văn** `TARGET_CLASSES` và `censor_image(photo, threshold, padding, blur_radius, feather)` từ notebook Cell 7.5. `MODEL_PATH` env `CENSOR_MODEL_PATH` mặc định `/models/640m.onnx`, `INFER_RES` env `CENSOR_INFERENCE_RESOLUTION` mặc định 640. Tham số mặc định: threshold 0.25, padding 0.35, blur 45, feather 8. |
| `deploy/runpod-serverless/censor_cli.py` | Chạy bằng `/opt/censor-venv/bin/python`. Argv: `<input.png> <output.png>`. Nạp detector, gọi `censor_image`, lưu PNG ra output, in **1 dòng JSON** `{"status":"censored"|"clean"}`; lỗi → in `{"status":"failed","error":"..."}` và exit 1. |
| `deploy/runpod-serverless/handler.py` | Xem 6.2. |
| `deploy/runpod-serverless/test_input.json` | `{"input":{"workflow": <nội dung prisma/seed-assets/default-workflow.json>}}` (đổi seed bất kỳ). |
| `deploy/runpod-serverless/README.md` | Build/push, cấu hình endpoint, env, curl test (mục 6.3). |
| `deploy/runpod-serverless/.gitignore`, `.dockerignore` | `token.txt`, `*.safetensors`, `*.onnx`. |

### 6.1 Model nướng vào image
| Model | Nguồn | Đích | Kiểm tra |
|---|---|---|---|
| LUSTIFY v10 Krea2 Turbo INT8 | `download_model.py` (trên) | `/comfyui/models/diffusion_models/` | size + SHA-256 chính xác |
| `qwen3vl_4b_fp8_scaled.safetensors` | `https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors` | `/comfyui/models/text_encoders/` | ≥ 4,700,000,000 bytes |
| `wan_2.1_vae.safetensors` | `https://huggingface.co/Comfy-Org/Wan-2.1/resolve/main/split_files/vae/wan_2.1_vae.safetensors` | `/comfyui/models/vae/` | ≥ 220,000,000 bytes |
| `640m.onnx` | mirror 1 `https://huggingface.co/ServiceStack/comfy-gateway/resolve/main/640m.onnx`, mirror 2 `https://huggingface.co/spaces/xxparthparekhxx/NudeNet-FastAPI/resolve/main/640m.onnx` | `/models/640m.onnx` | 90–130 MiB (mirror trả LFS pointer nhỏ → thử mirror kế) |
Kiểm tra size sai → build fail (`exit 1`).

### 6.2 `handler.py`
- **Boot 1 lần** (ở module level, trước `runpod.serverless.start`): `subprocess.Popen([sys.executable, "/comfyui/main.py", "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch"] + (["--lowvram"] if VRAM ≤ 20 GiB))`, log ra stdout của worker. Chờ `GET http://127.0.0.1:8188/system_stats` OK, tối đa 240s; quá → mọi job trả `{"error": "ComfyUI không khởi động được"}`.
- **Mỗi job** `handler(job)`:
  1. `workflow = job["input"].get("workflow")` phải là `dict` không rỗng; sai → `{"error": ...}`.
  2. `POST /prompt` body `{"prompt": workflow, "client_id": <uuid>}`; nếu response có `node_errors`/`error` → `{"error": "ComfyUI từ chối workflow: ..."}` (tóm tắt node id + message).
  3. Poll `GET /history/{prompt_id}` mỗi 1s, timeout env `COMFY_JOB_TIMEOUT_S` mặc định 600. Lấy mọi `outputs[*].images[]` có `type == "output"`. `status_str == "error"` → `{"error": ...}` kèm message từ `status.messages`. 0 ảnh → `{"error": "Không có ảnh output"}`.
  4. Mỗi ảnh (index i): tải bytes qua `GET /view?filename&subfolder&type` → ghi `/tmp/<jobId>/<i>.png` → chạy `/opt/censor-venv/bin/python /censor_cli.py in out` (timeout 120s) → đọc status. Đọc width/height bằng header PNG (không cần Pillow ở env chính; hoặc dùng Pillow nếu đã có sẵn từ torch image).
  5. Upload bằng `boto3.client("s3", endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com", aws_access_key_id=..., aws_secret_access_key=..., region_name="auto")`, `ContentType="image/png"`, tới `key` và `masked_key` theo hợp đồng mục 2. Thiếu env R2 → `{"error": "Thiếu biến môi trường R2: ..."}`.
  6. Xóa `/tmp/<jobId>` và ảnh trong `/comfyui/output` của job này (worker sống lâu, tránh đầy đĩa).
- Env cần: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, tùy chọn `RUNPOD_OUTPUT_PREFIX`, `COMFY_JOB_TIMEOUT_S`.
- Hỗ trợ test local bằng cơ chế sẵn của SDK (`python handler.py --test_input '...'` hoặc file `test_input.json` — kiểm tra docs và ghi vào README).

### 6.3 README
1. `DOCKER_BUILDKIT=1 docker build --secret id=civitai_token,src=token.txt -t <dockerhub-user>/anima-serverless:<tag> deploy/runpod-serverless/` → `docker push`.
2. Tạo endpoint: image trên; nhiều GPU type (24GB + 32GB + 48GB, ưu tiên rẻ trước); **All data centers**; **không network volume**; Min workers 0, Max 1–3; Idle timeout 60–300s; FlashBoot bật; container disk đủ cho image (~20GB+).
3. Env endpoint: R2 vars ở trên (khuyên tạo R2 API token riêng, quyền Object Read & Write chỉ cho bucket này).
4. Lấy Endpoint ID + tạo RunPod API Key.
5. Test: `curl -H "Authorization: Bearer $KEY" https://api.runpod.ai/v2/$ID/health`; `curl -X POST ... /run -d @test_input.json`; `curl ... /status/<jobId>` → COMPLETED, kiểm tra 2 object trên R2.
6. Ghi chú: commit ComfyUI đã pin, cách nâng cấp.

## 7. Test
Không có GPU trong môi trường này. Tối thiểu: `python -m py_compile` cho mọi file .py; viết `deploy/runpod-serverless/tests/test_handler_logic.py` (pytest, không cần GPU/ComfyUI) cho các hàm thuần: validate input, trích ảnh từ history JSON (gồm ca `status_str=error`, 0 ảnh), dựng key R2, đọc kích thước PNG, tóm tắt node_errors. Hãy tách các hàm này ra để test được (mock `requests`/`boto3`). Nếu máy không có Python/pytest, ghi rõ trong Ghi chú.

## 8. Definition of Done
- [x] Đủ file ở mục 6; tham số censor/model khớp notebook từng giá trị.
- [x] Token CivitAI chỉ qua BuildKit secret; không secret nào trong image/repo.
- [x] ComfyUI pin commit SHA; base image pin tag cụ thể.
- [x] Output đúng hợp đồng mục 2; mọi lỗi trả `{"error": ...}`, không crash worker.
- [x] Dọn file tạm sau mỗi job.
- [x] `py_compile` + pytest (nếu chạy được) xanh.
- [x] Không file nào ngoài `deploy/runpod-serverless/` và file spec này bị sửa.
- [x] Điền "Ghi chú của người thực thi"; trong `worker_done` liệt kê commit + những gì chưa test được.

## Ghi chú của người thực thi
1. **Các commit đã thực hiện theo nhóm:**
   - Commit 1 (Dockerfile): `1b7f095` - `feat(deploy): add RunPod serverless Dockerfile and model download script`
   - Commit 2 (Censor): `a9b3cc8` - `feat(deploy): implement balanced image censorship library and CLI`
   - Commit 3 (Handler): `143baf5` - `feat(deploy): implement RunPod serverless handler and unit tests`
   - Commit 4 (README & test input): `7c008d1` - `feat(deploy): add test input, complete README guide, and finalize P1 task`
   - Commit 5 (Review 1 - Blocker 1): `3002579` - `fix(deploy): extract 640m.onnx downloader into standalone script and add tests`
   - Commit 6 (Review 1 - Blocker 2): `e4fe267` - `fix(deploy): parse ComfyUI prompt response and allow empty node_errors`
   - Commit 7 (Review 1 - Item 3): `aa09a11` - `fix(deploy): ensure temporary files cleanup runs via try-finally and supports subfolders`
   - Commit 8 (Review 1 - Items 4, 5, 6): `fix(deploy): log censor errors, fallback PNG dims to null, and pin pip dependencies`

2. **Phiên bản & Pinning:**
   - Base image: `pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime` (đã xác thực tồn tại trên Docker Hub registry).
   - ComfyUI commit SHA: `fca60fe70e5b84c5c6b058263653d15cb3401e44` (Comfy-Org/ComfyUI, commit ngày 2026-11-09).
   - Models: LUSTIFY v10 Krea2 Turbo INT8 (size 13148974712, SHA-256 `0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d`), Qwen3-VL 4B FP8 Scaled, Wan 2.1 VAE, NudeNet 640m.
   - Censor parameters: threshold 0.25, padding 0.35, blur 45, feather 8, resolution 640.

3. **Kết quả kiểm thử:**
   - `python -m py_compile` đã kiểm tra toàn bộ 5 file Python (`download_model.py`, `censor_lib.py`, `censor_cli.py`, `handler.py`, `tests/test_handler_logic.py`) không có lỗi cú pháp.
   - `pytest deploy/runpod-serverless/tests/test_handler_logic.py -v`: 14/14 tests pass (test validate input, summarize node errors, history extraction, zero output, PNG header dimension unpacking, R2 key building, missing R2 env, mocked end-to-end flow).
   - **Những gì chưa test được (cần GPU / môi trường RunPod thật):**
     - Chưa test build Docker thực tế (yêu cầu Docker daemon + GPU + CivitAI token tải ~18GB models).
     - Chưa test chạy inference model LUSTIFY trên GPU RunPod thực tế (đã mock đầy đủ trong pytest).
     - Chưa test kết nối S3 thật tới Cloudflare R2 (đã kiểm tra qua mock boto3).
